import type { System, World, Entity } from '@engine/ecs/World';
import type { Input } from '@engine/input/Input';
import balance from '@data/balance.json';
import { M, RARITY_COLORS, UI } from '@game/constants';
import {
  Inventory, Merchant, Player, SfxEvent, ShopStand, ToastEvent, Transform,
} from '@game/components';
import { Rng } from '@engine/core/Rng';
import { HAGGLE_TEXT, haggleOutcome, hagglePrice } from '@game/loot/ShopStock';
import { meta } from '@game/meta/Save';
import { markRuneOwned } from '@game/meta/Codex';
import { RUNE_POOL } from '@game/skills/SkillSystem';
import { bindOf } from '@game/meta/Bindings';
import { CONS_VISUAL, consumableDef } from '@game/loot/Consumables';

/**
 * 商店交互:走近摊位(<1m)按 F 购买;走近**商人**(<3m)按 F 议价(轮 22)。
 * GameScene 通过 nearbyStand / nearbyMerchant 渲染价格提示与议价提示。
 *
 * 议价的两条纪律(都是为了让"按一下"变成"想一下"):
 * - **一家店只能议一次**:不然玩家会站在原地连点直到大成功,博弈消失;
 * - 目标是**当前最贵的未售出商品**:商人替玩家做了"你最想买哪个"的判断,
 *   否则随机挑一件便宜的降 15%,玩家只会觉得这个按钮没用。
 */
export class ShopSystem implements System {
  /** 本帧玩家附近的摊位(渲染提示用) */
  nearbyStand: Entity | null = null;
  /** 本帧玩家附近的商人(渲染议价提示用) */
  nearbyMerchant: Entity | null = null;
  /**
   * 议价用的随机源。**每局开始时由 GameScene 重播种**(reseed)—— 固定种子会让
   * "每局第一家店的议价结果永远一样"(实测跑 40 次同结果),而议价恰恰是最需要意外感的机制。
   * 仍然用可播种 Rng 而不是 Math.random:同一次进店的重放结果一致,便于复现玩家反馈。
   */
  private haggleRng = new Rng(0x5A66);

  /** 每局开局调用:把本局的种子混进来(同一局内多次进店也各不相同) */
  reseed(seed: number): void {
    this.haggleRng = new Rng((seed >>> 0) || 1);
  }

  /**
   * 议价:挑最贵的未售出商品,按幸运掷结果(规则在 loot/ShopStock.ts,Unity 侧同款)。
   * 只改这一件的价签 —— 商店其余货位不受影响,玩家仍可照原价买别的。
   */
  private tryHaggle(world: World, merchantE: Entity, luck: number): void {
    const merchant = world.mustGet(merchantE, Merchant);
    if (merchant.haggled) {
      world.emit(new ToastEvent('商人摆摆手:「价说过了,一次。」', UI.dim));
      return;
    }
    let target: Entity | null = null;
    let bestPrice = -1;
    for (const e of world.query(ShopStand)) {
      const st = world.mustGet(e, ShopStand);
      if (st.sold || st.haggled > 0) continue;
      if (st.price > bestPrice) { bestPrice = st.price; target = e; }
    }
    if (target === null) {
      world.emit(new ToastEvent('没什么可议的了(货架都空了)', UI.dim));
      return;
    }
    merchant.haggled = true;
    const st = world.mustGet(target, ShopStand);
    const outcome = haggleOutcome(this.haggleRng.next(), luck);
    st.price = hagglePrice(st.price, outcome);
    st.haggled = 1;
    const label = st.wares === 'item' && st.item ? st.item.name
      : st.wares === 'rune' ? '符文' : st.wares === 'cons' ? '消耗品' : '药剂';
    world.emit(new ToastEvent(
      `${HAGGLE_TEXT[outcome]}:${label} → ✦${st.price}`, outcome === 'fail' ? UI.hpLow : UI.gold));
    world.emit(new SfxEvent(outcome === 'fail' ? 'hurt' : 'skill'));
  }

  constructor(private readonly input: Input) {}

  update(world: World, _dt: number): void {
    this.nearbyStand = null;
    this.nearbyMerchant = null;
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

    // 商人(议价):交互距离更宽(3m),但**不与摊位抢手** —— 站在商人跟前就是想议价
    let merc: Entity | null = null;
    let mercD = 3.0 * M;
    for (const e of world.query(Merchant, Transform)) {
      const m = world.mustGet(e, Merchant);
      m.animT += _dt;
      const tr = world.mustGet(e, Transform);
      const d = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
      if (d < mercD) { mercD = d; merc = e; }
    }
    this.nearbyMerchant = merc;

    const pressed = this.input.wasPressed(bindOf('interact')) || this.input.wasPressed('PadB');
    if (merc !== null) {
      if (pressed) this.tryHaggle(world, merc, p.luck);
      return;
    }
    if (best === null || !pressed) return;

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
      case 'cons': {
        const id = stand.consId;
        if (!id) return;
        const def = consumableDef(id);
        const held = p.consumables.filter((x) => x === id).length;
        if (held >= balance.loot.consMax) {
          world.emit(new ToastEvent(`${def?.name ?? id} 已带满(${held}/${balance.loot.consMax})`, UI.dim));
          return;
        }
        p.consumables.push(id);
        world.emit(new ToastEvent(`购入 ${def?.name ?? id}(2/3/4 使用)`, CONS_VISUAL[id].color));
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
