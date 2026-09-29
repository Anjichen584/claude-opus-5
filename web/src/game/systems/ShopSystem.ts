import type { System, World, Entity } from '@engine/ecs/World';
import type { Input } from '@engine/input/Input';
import balance from '@data/balance.json';
import { M, RARITY_COLORS, UI } from '@game/constants';
import {
  Inventory, Player, SfxEvent, ShopStand, ToastEvent, Transform,
} from '@game/components';
import { meta } from '@game/meta/Save';
import { markRuneOwned } from '@game/meta/Codex';
import { RUNE_POOL } from '@game/skills/SkillSystem';
import { bindOf } from '@game/meta/Bindings';

/**
 * 商店交互:走近摊位(<1m)按 F 购买。
 * GameScene 通过 nearbyStand 渲染价格提示。
 */
export class ShopSystem implements System {
  /** 本帧玩家附近的摊位(渲染提示用) */
  nearbyStand: Entity | null = null;

  constructor(private readonly input: Input) {}

  update(world: World, _dt: number): void {
    this.nearbyStand = null;
    const players = world.query(Player, Transform, Inventory);
    if (players.length === 0) return;
    const pe = players[0];
    const p = world.mustGet(pe, Player);
    const ptr = world.mustGet(pe, Transform);
    const inv = world.mustGet(pe, Inventory);

    let best: Entity | null = null;
    let bestD = 1.0 * M;
    for (const e of world.query(ShopStand, Transform)) {
      const stand = world.mustGet(e, ShopStand);
      stand.animT += _dt;
      if (stand.sold) continue;
      const tr = world.mustGet(e, Transform);
      const d = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    this.nearbyStand = best;
    if (best === null || !(this.input.wasPressed(bindOf('interact')) || this.input.wasPressed('PadB'))) return;

    const stand = world.mustGet(best, ShopStand);
    if (p.stardust < stand.price) {
      world.emit(new ToastEvent(`星尘不足(需 ✦${stand.price})`, UI.hpLow));
      return;
    }

    switch (stand.wares) {
      case 'item': {
        if (inv.items.length >= balance.loot.invSize) {
          world.emit(new ToastEvent('背包已满,先清背包', UI.hpLow));
          return;
        }
        inv.items.push(stand.item!);
        world.emit(new ToastEvent(`购入 ${stand.item!.name}`, RARITY_COLORS[stand.item!.rarity]));
        break;
      }
      case 'potion': {
        if (p.potionCharges >= balance.loot.potionMax) {
          world.emit(new ToastEvent('药剂已满', UI.dim));
          return;
        }
        p.potionCharges++;
        world.emit(new ToastEvent('药剂 +1', UI.hpLow));
        break;
      }
      case 'rune': {
        const rune = stand.runeId ? RUNE_POOL.get(stand.runeId) : undefined;
        if (!rune) return;
        if (p.runeBag.includes(rune.id)) {
          world.emit(new ToastEvent('已拥有该符文', UI.dim));
          return;
        }
        p.runeBag.push(rune.id);
        if (markRuneOwned(meta.data.codex, rune.id)) meta.save();
        world.emit(new ToastEvent(`◈ 购入符文「${rune.name}」`, '#B067E8'));
        break;
      }
    }
    p.stardust -= stand.price;
    stand.sold = true;
    world.emit(new SfxEvent('ult'));
  }
}
