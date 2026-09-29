/**
 * 商店货单与议价(2026-09-29,10-FULL-PLAN 轮 22 深化)。
 *
 * 这一轮解决的是**重复单调**:以前每次进商店都是"蓝/紫/加权第三摊 + 一瓶药 + 一个符文",
 * 价格也永远一样 —— 玩家第二次进店就不再看了。三件事:
 * 1. **每件商品独立定价**(±`priceJitter`):同一件紫装这次 128 下次 152,买不买变成决策;
 * 2. **特惠摊位**(`dealChance` 概率出 1 个,打 `dealOff` 折):给"这趟值得买点什么"一个理由,
 *    优先落在**装备**上(最贵的那类,折扣才有感知);
 * 3. **符文货架**:一次摆 `shelfRunes` 个**本职业未拥有**的符文,不再"每次只有一个、还可能是已拥有的";
 * 4. **议价**:见 `haggleOutcome` —— 每店一次,幸运只提高"至少小成功"的概率。
 *
 * 全是纯函数(显式传 rng / ctx),所以能单测、能两端镜像:Unity 侧 `Meta/ShopRules.cs` 是同一套规则。
 */
import type { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import { SLOTS, type Item, type Rarity, type Slot } from './Items';
import type { ConsumableId } from './Consumables';
import { shopConsumables } from './Consumables';
import type { RuneDef } from '@game/skills/SkillSystem';

const S = balance.shop;
const H = S.haggle;

/** 一件上架商品(位置、卖什么、最终价、是否特惠) */
export interface StockGoods {
  /** 房间内位置(米;RunManager 乘 M 转像素) */
  x: number;
  y: number;
  wares: 'item' | 'potion' | 'cons' | 'rune';
  /** 当前价(已含 jitter、特惠、议价) */
  price: number;
  /** 划线价 = 本摊的常规价(jitter 后、特惠/议价前):UI 画"原价被划掉"用 */
  listPrice: number;
  /** 数据表基准价(jitter 前):货单结构守卫与两端 parity 用,不参与展示 */
  basePrice: number;
  /** 特惠标记(UI 上"特惠 -30%") */
  deal: boolean;
  item: Item | null;
  runeId: string | null;
  consId: ConsumableId | null;
}

export interface StockCtx {
  /** 本职业前缀(符文按键 = `{klass}_` 前缀过滤) */
  klass: string;
  /** 已拥有符文 id(货架只摆没有的) */
  ownedRunes: readonly string[];
  /** 出价函数:装备走 ItemFactory.make(部位, 稀有度) */
  make: (slot: Slot, rarity: Rarity) => Item;
  /** 符文池(按职业过滤;默认空 = 这家店不摆符文) */
  runes?: readonly RuneDef[];
  /** 房间中心(Y,米) */
  centerY: number;
}

/** 定价:基准价 × (1 ± jitter),至少 1 星尘 */
export function priceOf(base: number, rng: Rng): number {
  const j = S.priceJitter;
  const mult = 1 + rng.range(-j, j);
  return Math.max(1, Math.round(base * mult));
}

/**
 * 议价结果。
 * - `big`:大成功,降 `bigOff`(幸运**不影响**它 —— 否则幸运够了就变成"议价必大成功");
 * - `success`:成功,降 `off`(幸运按 `luckPerPoint` 提高这一档的概率,上限 `luckMax`);
 * - `fail`:失败,涨价 `markup`(但这单还能买,只是更贵)。
 *
 * 边界:`bigChance + successChance + luckMax` 恰好 ≤ 0.9 —— **失败永远不会消失**,
 * 所以议价始终是一次带风险的赌博,不是"多点几下必然便宜"。
 */
export type HaggleOutcome = 'big' | 'success' | 'fail';

export function luckBonus(luck: number): number {
  // NaN 要当 0 处理:读到一个坏值就让议价概率变成 NaN,连"失败"这一档都会消失
  const v = Number.isFinite(luck) ? Math.max(0, luck) : 0;
  return Math.min(H.luckMax, v * H.luckPerPoint);
}

export function haggleOutcome(roll: number, luck: number): HaggleOutcome {
  const big = H.bigChance;
  const success = H.successChance + luckBonus(luck);
  if (roll < big) return 'big';
  if (roll < big + success) return 'success';
  return 'fail';
}

/**
 * 议价后的新价。
 * 降价下限 1;**涨价至少 +1** —— 便宜的货位(✦1)按比例涨四舍五入会等于原价,
 * 那样"议价失败"看起来就像按钮没反应,是最糟的一种反馈(有测试钉住)。
 */
export function hagglePrice(price: number, outcome: HaggleOutcome): number {
  if (outcome === 'fail') return Math.max(price + 1, Math.round(price * (1 + H.markup)));
  const off = outcome === 'big' ? H.bigOff : H.off;
  return Math.max(1, Math.round(price * (1 - off)));
}

export const HAGGLE_TEXT: Record<HaggleOutcome, string> = {
  big: '🤝 商人被说动了,直接抹掉一大截',
  success: '🤝 讨价成功,价签往下挪了一格',
  fail: '💢 商人把价签往上推了推:「爱买不买」',
};

/** 货架:从池子里抽 n 个**不重复且未拥有**的符文(不够就有几个摆几个) */
export function rollRuneShelf(rng: Rng, pool: readonly RuneDef[], owned: readonly string[], n: number): RuneDef[] {
  const have = new Set(owned);
  const avail = pool.filter((r) => !have.has(r.id));
  const out: RuneDef[] = [];
  const bag = [...avail];
  while (out.length < n && bag.length > 0) {
    const i = rng.int(0, bag.length - 1);
    out.push(bag[i]);
    bag.splice(i, 1);
  }
  return out;
}

/**
 * 摆一整间店的货。布局有意分两排:
 * 上排 = 装备(3 摊)+ 符文货架(最多 2 摊),下排 = 药剂 + 消耗品。
 * 位置写在这里而不是 RunManager 里 —— 位置本身也是"货单"的一部分,挪摊不该动房间逻辑。
 */
export function rollStock(rng: Rng, ctx: StockCtx): StockGoods[] {
  const cy = ctx.centerY;
  const out: StockGoods[] = [];
  /** 上架一件:listPrice = jitter 后的常规价(初始价就是它),price 后续会被特惠/议价改写 */
  const push = (x: number, y: number, g: Omit<StockGoods, 'x' | 'y' | 'listPrice'>): void => {
    out.push({ x, y, listPrice: g.price, ...g });
  };

  // ---- 上排:装备 3 摊(蓝 / 紫 / 加权第三摊) ----
  const rarities: Rarity[] = ['rare', 'epic'];
  const w = rng.next();
  const third = S.thirdStandWeights;
  rarities.push(w < third.legendary ? 'legendary' : w < third.legendary + third.epic ? 'epic' : 'rare');
  rarities.forEach((rar, i) => {
    const base = S.prices[rar as 'rare' | 'epic' | 'legendary'];
    const item = ctx.make(rng.pick(SLOTS), rar);
    push(9 + i * 4, cy - 2, {
      wares: 'item', price: priceOf(base, rng), basePrice: base, deal: false, item, runeId: null, consId: null,
    });
  });

  // ---- 上排:符文货架(本职业未拥有;不够就少摆) ----
  const shelf = rollRuneShelf(rng, ctx.runes ?? [], ctx.ownedRunes, S.shelfRunes);
  shelf.forEach((rune, i) => {
    push(10 + i * 3.4, cy + 2, {
      wares: 'rune', price: priceOf(S.runePrice, rng), basePrice: S.runePrice, deal: false,
      item: null, runeId: rune.id, consId: null,
    });
  });

  // ---- 下排:药剂 + 消耗品(随机不重复) ----
  push(14.6, cy + 2, {
    wares: 'potion', price: priceOf(S.potionPrice, rng), basePrice: S.potionPrice, deal: false,
    item: null, runeId: null, consId: null,
  });
  const menu = shopConsumables();
  const picked: typeof menu = [];
  for (let i = 0; i < S.consStands && picked.length < menu.length; i++) {
    const cand = menu.filter((d) => !picked.includes(d));
    picked.push(rng.pick(cand));
  }
  picked.forEach((def, i) => {
    push(16.4 + i * 1.8, cy + 2, {
      wares: 'cons', price: priceOf(def.price, rng), basePrice: def.price, deal: false,
      item: null, runeId: null, consId: def.id,
    });
  });

  // ---- 特惠:挑一件**最贵的未特惠装备**(折扣要落在贵的东西上才有感知) ----
  if (rng.chance(S.dealChance)) {
    const gear = out.filter((g) => g.wares === 'item');
    if (gear.length > 0) {
      const top = gear.reduce((a, b) => (b.listPrice > a.listPrice ? b : a));
      top.deal = true;
      top.price = Math.max(1, Math.round(top.listPrice * (1 - S.dealOff)));
    }
  }
  return out;
}
