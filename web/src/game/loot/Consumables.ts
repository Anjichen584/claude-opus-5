/**
 * 消耗品(2026-09-29,10-FULL-PLAN 轮 21)。
 *
 * 四种:星壳药剂(护盾)/ 净澈露(净化)/ 滞时砂(时缓)/ 元素瓶(附魔)。
 * 每种的**边界与反制**都写在下面,并且都有对应单测 —— 这是轮 21 的验收点:
 *
 * | 消耗品 | 边界 | 反制 |
 * |---|---|---|
 * | 护盾 | 吸收量上限 = 生命上限 × capPct;**不叠加**,再喝只刷新到上限 | 到期消失;真伤(元素反应)不吃护盾 |
 * | 净化 | 一次最多清 debuffMax 个异常;清完给 iframesS 无敌 | 无敌很短;不清理元素印记 |
 * | 时缓 | 只对**普通敌人**全效,精英/Boss 打折(bossFactor) | 时长上限;不能重叠刷新成无限 |
 * | 元素瓶 | 只附一种元素,持续 elementS;有**充能上限** | 覆盖已有附魔;不改变普攻形态 |
 *
 * 数值全部读 `balance.consumables`(项目硬规则)。
 */
import balance from '@data/balance.json';
import type { Element } from '@game/components';

export type ConsumableId = 'shield' | 'cleanse' | 'timeslow' | 'flask';

export interface ConsumableDef {
  id: ConsumableId;
  name: string;
  price: number;
}

export const CONSUMABLE_IDS: readonly ConsumableId[] = ['shield', 'cleanse', 'timeslow', 'flask'];
const C = balance.consumables;

export const consumableDefs = (): ConsumableDef[] => CONSUMABLE_IDS.map((id) => ({
  id,
  name: (C[id] as { name: string }).name,
  price: (C[id] as { price: number }).price,
}));

/** 商店可用的消耗品(按价格排序,便宜的在前 —— 商店列表顺序稳定,不靠 Map 顺序) */
export const shopConsumables = (): ConsumableDef[] => consumableDefs().sort((a, b) => a.price - b.price);
export const consumableDef = (id: ConsumableId): ConsumableDef | undefined =>
  consumableDefs().find((d) => d.id === id);

/**
 * 展示用图标/颜色。数值(价格、时长、比例)一律在 balance.json,这里只放"长什么样"——
 * 和 Item.glyph 同一口径:美术表现不进数值表。
 */
export const CONS_VISUAL: Record<ConsumableId, { glyph: string; color: string }> = {
  shield: { glyph: '🛡', color: '#9ad8ff' },
  cleanse: { glyph: '✿', color: '#c9f27e' },
  timeslow: { glyph: '⏳', color: '#b8c8ff' },
  flask: { glyph: '🧪', color: '#ffb04d' },
};

// ---------------- 护盾 ----------------

export interface ShieldState {
  /** 剩余吸收量 */
  amount: number;
  /** 剩余秒数 */
  t: number;
}

export const shieldCap = (hpMax: number): number => Math.max(1, Math.round(hpMax * (C.shield as { capPct: number }).capPct));

/**
 * 喝护盾药:吸收量 = 上限（**不叠加**,只刷新);返回新状态,不改入参。
 * "不叠加"是刻意的:叠加会让玩家屯 3 瓶药硬吃 Boss 大招,把走位这一层玩没了。
 */
export function applyShield(_cur: ShieldState | null, hpMax: number): ShieldState {
  return { amount: shieldCap(hpMax), t: (C.shield as { durS: number }).durS };
}

/** 伤害先吃护盾,返回 [剩余伤害, 新护盾状态(可能为 null = 破了)] */
export function absorbDamage(shield: ShieldState | null, damage: number): [number, ShieldState | null] {
  if (!shield || shield.t <= 0 || shield.amount <= 0) return [damage, null];
  const eaten = Math.min(shield.amount, damage);
  const left = shield.amount - eaten;
  return [damage - eaten, left > 0 ? { ...shield, amount: left } : null];
}

/** 护盾计时(到期即消失,不做"慢慢衰减") */
export function tickShield(shield: ShieldState | null, dt: number): ShieldState | null {
  if (!shield) return null;
  const t = shield.t - dt;
  return t > 0 ? { ...shield, t } : null;
}

// ---------------- 净化 ----------------

export interface DebuffSummary {
  /** 异常数量(麻痹/减速/易伤都算) */
  count: number;
}

export interface CleanseResult {
  /** 实际清掉的异常个数(≤ debuffMax) */
  removed: number;
  /** 给玩家的无敌帧 */
  iframes: number;
}

/**
 * 净化:**只清异常,不清元素印记**(印记是玩家自己的构筑资源,清掉等于帮倒忙)。
 */
export function cleanse(_debuffs: DebuffSummary): CleanseResult {
  const max = (C.cleanse as { debuffMax: number }).debuffMax;
  return { removed: Math.min(_debuffs.count, max), iframes: (C.cleanse as { iframesS: number }).iframesS };
}

// ---------------- 时缓 ----------------

export interface SlowTarget {
  /** 'normal' 普通敌人 / 'elite' 精英 / 'boss' Boss */
  tier: 'normal' | 'elite' | 'boss';
}

/**
 * 时缓的减速强度:普通敌人全效,精英/Boss 按 bossFactor 打折。
 * 反制很直白 —— **Boss 不能被冻住**,否则整场战斗的解谜消失。
 */
export function slowFactor(t: SlowTarget): number {
  const cfg = C.timeslow as { slowPct: number; bossFactor: number };
  return t.tier === 'normal' ? cfg.slowPct : cfg.slowPct * cfg.bossFactor;
}

export const TIMESLOW_RADIUS_M = (C.timeslow as { radiusM: number }).radiusM;
export const TIMESLOW_DUR_S = (C.timeslow as { durS: number }).durS;

// ---------------- 元素瓶 ----------------

export interface FlaskState {
  element: Element;
  t: number;
}

export const FLASK_CHARGE_MAX = (C.flask as { chargeMax: number }).chargeMax;
export const FLASK_ELEMENT = (C.flask as { element: string }).element as Element;

/** 喝元素瓶:覆盖已有附魔(不叠加时长,避免无限续杯) */
export const applyFlask = (_cur: FlaskState | null): FlaskState => ({
  element: FLASK_ELEMENT,
  t: (C.flask as { elementS: number }).elementS,
});

export function tickFlask(f: FlaskState | null, dt: number): FlaskState | null {
  if (!f) return null;
  const t = f.t - dt;
  return t > 0 ? { ...f, t } : null;
}
