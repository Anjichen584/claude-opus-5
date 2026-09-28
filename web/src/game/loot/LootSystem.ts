import type { System, World } from '@engine/ecs/World';
import { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import { M, RARITY_COLORS, UI } from '@game/constants';
import {
  Inventory, KillEvent, Pickup, Player, SfxEvent, ToastEvent, Transform, Velocity,
} from '@game/components';
import { ItemFactory } from './Items';
import { salvage } from './Equip';
import { clock } from '@game/dungeon/Clock';
import { meta } from '@game/meta/Save';
import { RUNE_POOL } from '@game/skills/SkillSystem';

const L = balance.loot;

/**
 * 掉落与拾取:击杀 → 掉落判定(装备/药剂/星尘) → 弹出物理 → 磁吸 → 入包。
 * 背包满时自动分解为星尘。保底:200 次装备掉落无橙必橙(docs/03 §6)。
 */
export class LootSystem implements System {
  private rng = new Rng(4202611);
  readonly factory = new ItemFactory(this.rng);
  /** 幸运值(祭坛提供,run 开始时注入) */
  luck = 0;

  update(world: World, dt: number): void {
    // ---- 击杀掉落 ----
    const lootMult = clock.isNight() ? balance.night.lootMult : 1; // 夜晚掉落翻倍(GDD §9)
    for (const kill of world.read(KillEvent)) {
      if (kill.kind === '') continue; // 非怪物死亡(保险)
      // 星尘精灵:一大袋星尘弹出,不走普通掉落
      if (kill.kind === 'stardustsprite') {
        const cfg = balance.enemies.stardustsprite;
        const total = this.rng.int(cfg.bonusMin, cfg.bonusMax) * lootMult;
        const motes = 6;
        for (let i = 0; i < motes; i++) {
          this.spawnPickup(world, kill.x, kill.y, new Pickup('stardust', null, Math.ceil(total / motes)));
        }
        world.emit(new ToastEvent(`✨ 星尘精灵!+${total} 星尘`, RARITY_COLORS.legendary));
        continue;
      }
      // 星尘(必掉,拆成 2~4 颗弹出)
      const dust = this.rng.int(L.stardustMin, L.stardustMax) * lootMult;
      const motes = this.rng.int(2, 4);
      for (let i = 0; i < motes; i++) {
        this.spawnPickup(world, kill.x, kill.y, new Pickup('stardust', null, Math.ceil(dust / motes)));
      }
      // 装备:精英必掉蓝起步,Boss 必掉紫+30%橙(docs/03 §6)
      const isElite = kill.kind === 'oakgolem';
      const isBoss = kill.kind === 'boss';
      // 图纸碎片:Boss 必掉(夜战 +1),局外货币立即入账
      if (isBoss) {
        const bp = balance.blueprint;
        const gain = bp.shardsPerBoss + (clock.isNight() ? bp.nightBonus : 0);
        meta.data.blueprintShards += gain;
        meta.save();
        world.emit(new ToastEvent(`📜 图纸碎片 +${gain}(共 ${meta.data.blueprintShards})`, '#e8c07a'));
      }
      const rolls = isBoss ? 2 : 1;
      for (let r = 0; r < rolls * lootMult; r++) {
        if (isBoss && r === 0) {
          const rarity = this.rng.chance(0.3) ? 'legendary' as const : 'epic' as const;
          const item = this.factory.make(this.rng.pick(['weapon', 'helmet', 'chest', 'boots', 'ring', 'amulet'] as const), rarity);
          this.spawnPickup(world, kill.x, kill.y, new Pickup('item', item));
          continue;
        }
        if (isElite || isBoss || this.rng.chance(L.dropEquip)) {
          const wasPity = this.factory.pityCount >= L.pity;
          let item = this.factory.roll(this.luck);
          if (isElite && (item.rarity === 'common' || item.rarity === 'fine')) {
            item = this.factory.make(item.slot, 'rare'); // 精英保底蓝
          }
          if (wasPity) world.emit(new ToastEvent('保底触发!陨核装备!', RARITY_COLORS.legendary));
          this.spawnPickup(world, kill.x, kill.y, new Pickup('item', item));
        }
      }
      // 药剂
      if (this.rng.chance(L.dropPotion * lootMult)) {
        this.spawnPickup(world, kill.x, kill.y, new Pickup('potion'));
      }
      // 符文:精英 35% / Boss 必掉(只掉本职业未拥有的,集齐后掉星尘)
      if (isBoss || (isElite && this.rng.chance(L.runeDropElite))) {
        const info = this.playerRuneInfo(world);
        const owned = new Set(info.bag);
        const prefix = `${info.klass}_`;
        const candidates = [...RUNE_POOL.values()]
          .filter((r) => r.skill.startsWith(prefix) && !owned.has(r.id))
          .map((r) => r.id);
        if (candidates.length > 0) {
          this.spawnPickup(world, kill.x, kill.y, new Pickup('rune', null, 0, this.rng.pick(candidates)));
        } else {
          this.spawnPickup(world, kill.x, kill.y, new Pickup('stardust', null, 30));
        }
      }
    }

    // ---- 拾取物理与磁吸 ----
    const players = world.query(Player, Transform, Inventory);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const p = world.mustGet(pe, Player);
    const inv = world.mustGet(pe, Inventory);

    for (const e of world.query(Pickup, Transform)) {
      const pk = world.mustGet(e, Pickup);
      const tr = world.mustGet(e, Transform);
      pk.bobPhase += dt * 4;

      if (pk.restT > 0) {
        // 弹出阶段
        pk.restT -= dt;
        tr.x += pk.vx * dt;
        tr.y += pk.vy * dt;
        pk.vx *= 1 - 4 * dt;
        pk.vy *= 1 - 4 * dt;
        continue;
      }

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy);
      // 星尘磁吸半径更大;装备用拾取半径
      const magnetR = (pk.kind === 'stardust' ? p.pickupRadiusM * 2.5 : p.pickupRadiusM) * M;

      if (pk.magnet || dist < magnetR) {
        pk.magnet = true;
        const sp = 9 * M;
        tr.x += (dx / (dist || 1)) * sp * dt;
        tr.y += (dy / (dist || 1)) * sp * dt;
      }

      if (dist < 0.4 * M) {
        this.collect(world, pe, pk, inv, p);
        world.destroy(e);
      }
    }
  }

  private collect(world: World, _pe: number, pk: Pickup, inv: Inventory, p: Player): void {
    switch (pk.kind) {
      case 'stardust':
        p.stardust += pk.value;
        break;
      case 'potion':
        if (p.potionCharges < L.potionMax) {
          p.potionCharges++;
          world.emit(new ToastEvent('药剂 +1', UI.hpLow));
        } else {
          p.stardust += 10;
          world.emit(new ToastEvent('药剂已满 → 星尘 +10', UI.dim));
        }
        world.emit(new SfxEvent('skill'));
        break;
      case 'item': {
        const item = pk.item!;
        if (inv.items.length >= L.invSize) {
          const dust = salvage(item);
          p.stardust += dust;
          world.emit(new ToastEvent(`背包已满 → 分解 ${item.name} (+${dust}✦)`, UI.dim));
        } else {
          inv.items.push(item);
          world.emit(new ToastEvent(`获得 ${item.name}`, RARITY_COLORS[item.rarity]));
          world.emit(new SfxEvent(item.rarity === 'legendary' || item.rarity === 'epic' ? 'ult' : 'skill'));
        }
        break;
      }
      case 'rune': {
        const rune = pk.runeId ? RUNE_POOL.get(pk.runeId) : undefined;
        if (!rune) break;
        if (p.runeBag.includes(rune.id)) {
          p.stardust += 40;
          world.emit(new ToastEvent(`重复符文 ${rune.name} → 星尘 +40`, UI.dim));
        } else {
          p.runeBag.push(rune.id);
          world.emit(new ToastEvent(`◈ 获得符文「${rune.name}」!Tab 镶嵌`, '#B067E8'));
          world.emit(new SfxEvent('ult'));
        }
        break;
      }
      default:
        break;
    }
  }

  /** 玩家符文持有与职业(去重+职业过滤掉落用) */
  private playerRuneInfo(world: World): { bag: string[]; klass: string } {
    for (const e of world.query(Player)) {
      const p = world.mustGet(e, Player);
      return { bag: p.runeBag, klass: p.klass };
    }
    return { bag: [], klass: 'blade' };
  }

  private spawnPickup(world: World, x: number, y: number, pk: Pickup): void {
    const e = world.create();
    const a = this.rng.range(0, Math.PI * 2);
    const sp = this.rng.range(1.5, 3.5) * M;
    pk.vx = Math.cos(a) * sp;
    pk.vy = Math.sin(a) * sp;
    world.add(e, new Transform(x, y));
    world.add(e, new Velocity());
    world.add(e, pk);
  }
}
