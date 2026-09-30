/**
 * 蓝图与铸台(2026-09-29,10-FULL-PLAN 轮 20)。
 *
 * 闭环:**Boss 掉图纸碎片(已有)→ 铸台按蓝图铸造 → 不满意就重铸词条**。
 * 三段都做成纯函数(craft/reforge 显式传入 rng 与存档),原因有两个:
 * 1. 铸台会在菜单里被反复点,规则必须可测(尤其“碎片不够 / 已有同款 / 背包满”这些**边界**);
 * 2. 重铸涉及随机,要能用固定种子复现。
 *
 * 重铸的设计取舍(写在前面,免得后来人当 bug 改):
 * - 重铸**保留基底与稀有度与特效**,只重掷词条 —— 玩家要的是“洗词条”,不是重新投胎;
 * - 每次最多重掷 «reforgeRerollMax» 条词条,**总是留至少一条不动**:全洗会让“这次明显不如上次”变得常见,
 *   留一条锚点等于给玩家一个保底(而且它让重铸结果可比较)。
 * - 代价是星尘(«reforgeCost»),失败不返还 —— 但**不会把词条洗没**(条数不变)。
 */
import { t } from '@game/i18n';
import type { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import blueprintsData from '@data/blueprints.json';
import { affixDef, affixKindOf } from './AffixRules';
import { specialDef } from './Specials';
import type { AffixRoll, Item, Rarity, Slot } from './Items';

const BP = balance.blueprint;

export interface BlueprintDef {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  special: string;
  affixes: string[];
  costShards: number;
  lore: string;
}

export const BLUEPRINTS = blueprintsData.list as BlueprintDef[];
export const blueprintOf = (id: string): BlueprintDef | undefined => BLUEPRINTS.find((b) => b.id === id);

/** 铸台能造什么:为什么造不了(给 UI 直接显示的一句话) */
export type CraftBlocker = 'unknown' | 'owned' | 'shards' | 'bagFull' | null;

export interface CraftCtx {
  shards: number;
  /** 已拥有蓝图 id(存档字段;蓝图**不会消耗**,可以重复铸造) */
  owned: string[];
  inventorySize: number;
  inventoryMax: number;
}

export function craftBlocker(id: string, ctx: CraftCtx): CraftBlocker {
  const bp = blueprintOf(id);
  if (!bp) return 'unknown';
  // 没图纸不让造(图纸本身由 Boss 掉落/铸台学会)
  if (!ctx.owned.includes(id)) return 'owned';
  if (ctx.inventorySize >= ctx.inventoryMax) return 'bagFull';
  if (ctx.shards < bp.costShards) return 'shards';
  return null;
}

export const canCraft = (id: string, ctx: CraftCtx): boolean => craftBlocker(id, ctx) === null;

/** 阻挡原因 → 用户可读文案(UI 不再自己拼字符串) */
export function blockerText(b: CraftBlocker, id: string): string {
  const bp = blueprintOf(id);
  switch (b) {
    case 'owned': return t('bp.blocker.owned');
    case 'shards': return t('bp.blocker.shards', { n: bp?.costShards ?? '?' });
    case 'bagFull': return t('bp.blocker.bagFull');
    case 'unknown': return t('bp.blocker.unknown');
    default: return '';
  }
}

/**
 * 铸造:扣碎片 → 产出一件**必定带指定特效**的装备。
 * 词条按蓝图固定;每条词条按紫橙档(hi)滚动 —— 蓝图买到的是“顶配词条”,不是垃圾。
 */
export function craft(id: string, ctx: CraftCtx, rng: Rng, make: (slot: Slot, rarity: Rarity) => Item): Item | null {
  if (!canCraft(id, ctx)) return null;
  const item = buildFromBlueprint(id, rng, make);
  if (!item) return null;
  ctx.shards -= blueprintOf(id)!.costShards;
  return item;
}

/**
 * 按蓝图造一件,**不扣任何资源**(资源在铸造那一刻已经扣过)。
 * 用在哪:开局把“铸台预约”的成品交到玩家手上 —— 这一步不能二次收费,也不能因为
 * 局内背包满/碎片数变化而失败(那时玩家已经付过账了)。
 */
export function buildFromBlueprint(id: string, rng: Rng, make: (slot: Slot, rarity: Rarity) => Item): Item | null {
  const bp = blueprintOf(id);
  if (!bp) return null;
  const item = make(bp.slot, bp.rarity);
  const sp = specialDef(bp.special);
  item.affixes = bp.affixes.map((aid) => rollAffix(aid, rng, true)).filter((a): a is AffixRoll => a !== null);
  if (sp) {
    item.special = sp.id;
    item.specialDesc = t(sp.desc);
    item.name = t(sp.itemName);
  }
  return item;
}

/** 按词条 id 掷一条(hi 档);找不到定义返回 null(数据写错时不静默造出空词条) */
function rollAffix(affixId: string, rng: Rng, high: boolean): AffixRoll | null {
  const def = affixDef(affixId);
  if (!def) return null;
  const [lo, hi] = high ? def.hi : def.lo;
  const roll: AffixRoll = {
    id: def.id,
    name: t(def.name),
    stat: def.stat,
    value: rng.int(lo, hi),
    suffix: def.suffix,
  };
  if (def.neg) {
    const [nlo, nhi] = high ? def.neg.hi : def.neg.lo;
    roll.neg = { stat: def.neg.stat, name: t(def.neg.name), suffix: def.neg.suffix, value: rng.int(nlo, nhi) };
  }
  if (def.cond) roll.cond = def.cond;
  return roll;
}

// ---------------- 重铸 ----------------

export type ReforgeBlocker = 'noItem' | 'noAffix' | 'stardust' | null;

export interface ReforgeCtx {
  stardust: number;
}

export function reforgeBlocker(item: Item | null, ctx: ReforgeCtx): ReforgeBlocker {
  if (!item) return 'noItem';
  // 没词条可洗
  if (item.affixes.length === 0) return 'noAffix';
  if (ctx.stardust < BP.reforgeCost) return 'stardust';
  return null;
}

export const canReforge = (item: Item | null, ctx: ReforgeCtx): boolean => reforgeBlocker(item, ctx) === null;

/**
 * 重铸:重掷最多 «reforgeRerollMax» 条词条,**至少留一条原样**(见文件头注释)。
 * 返回新的 item(不改原对象:菜单里“确定/取消”要能对比)。
 */
export function reforge(item: Item, ctx: ReforgeCtx, rng: Rng): Item | null {
  if (!canReforge(item, ctx)) return null;
  ctx.stardust -= BP.reforgeCost;

  const count = item.affixes.length;
  const rerollN = Math.min(BP.reforgeRerollMax, Math.max(0, count - 1));   // 至少留一条
  const idx = shuffle([...Array(count).keys()], rng).slice(0, rerollN);
  const next: Item = { ...item, affixes: item.affixes.map((a) => ({ ...a })) };
  for (const i of idx) {
    const fresh = rollAffix(next.affixes[i].id, rng, item.rarity === 'epic' || item.rarity === 'legendary');
    if (fresh) next.affixes[i] = fresh;
  }
  return next;
}

/** Fisher–Yates(用项目自己的 Rng,保证同种子可复现) */
function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** 蓝图数据自检:特效存在、词条存在、部位与特效部位一致 —— 由测试调用 */
export function blueprintProblems(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const bp of BLUEPRINTS) {
    if (seen.has(bp.id)) out.push(`duplicate blueprint id: ${bp.id}`);
    seen.add(bp.id);
    const sp = specialDef(bp.special);
    if (!sp) out.push(`${bp.id}: special ${bp.special} does not exist`);
    else if (sp.slot !== bp.slot) out.push(`${bp.id}: special belongs to ${sp.slot}, blueprint says ${bp.slot}`);
    for (const a of bp.affixes) {
      const def = affixDef(a);
      if (!def) { out.push(`${bp.id}: affix ${a} does not exist`); continue; }
      if (!def.slots.includes(bp.slot)) out.push(`${bp.id}: affix ${a} not usable on ${bp.slot}`);
      if (affixKindOf(def) === 'conditional') out.push(`${bp.id}: affix ${a} is conditional and must not appear in blueprints`);
    }
  }
  return out;
}
