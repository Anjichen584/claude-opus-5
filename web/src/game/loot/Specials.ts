/**
 * 橙装特效(2026-09-29,10-FULL-PLAN 轮 19:3 → 9 个,每部位至少 1 个)。
 *
 * 设计原则:**每个特效都要有一条"可测的行为"**,不做纯文案特效。
 * 数值全部读 `balance.specials`(项目硬规则:伤害/治疗数字不进代码),
 * 这里只写"什么时候、对谁、怎么算"。
 *
 * 特效按触发时机分四类,每类一个纯函数 —— 这样它们能被单测直接驱动,
 * 而不是只能在游戏里"感觉一下":
 *
 * | 时机 | 函数 | 例子 |
 * |---|---|---|
 * | 命中时 | `hitDamageMult` / `strikeElement` | 回响之戒(每第 5 击 ×2)、霜咬(附冰印记) |
 * | 击杀时 | `killHeal` | 噬魂坠 |
 * | 受伤时 | `damageTakenMult` / `reflectOnHurt` | 磐石胸甲、棘刺胸甲 |
 * | 持续/移动 | `statMods` | 猎风兜帽(移动 +攻)、星陨兜帽(受击后 +攻) |
 */
import balance from '@data/balance.json';
import specialsData from '@data/items/specials.json';
import type { Element } from '@game/components';
import type { Slot } from './Items';

const S = balance.specials;

export interface SpecialDef {
  id: string;
  slot: Slot;
  itemName: string;
  desc: string;
}

export const SPECIAL_DEFS = specialsData.list as SpecialDef[];
export const specialDef = (id: string): SpecialDef | undefined => SPECIAL_DEFS.find((s) => s.id === id);
/** 某部位的全部橙装特效(橙装掉落时随机取一个) */
export const specialsForSlot = (slot: Slot): SpecialDef[] => SPECIAL_DEFS.filter((s) => s.slot === slot);

export const hasSpecial = (specials: readonly string[], id: string): boolean => specials.includes(id);

/**
 * 命中伤害乘区。
 * @param hitCount 本局命中计数(**1 起**;调用方每命中一次 +1)
 */
export function hitDamageMult(specials: readonly string[], hitCount: number): number {
  if (!hasSpecial(specials, 'echo_ring')) return 1;
  if (hitCount <= 0) return 1;
  return hitCount % S.echoEvery === 0 ? S.echoMult : 1;
}

/**
 * 命中附带的元素(霜咬:没有元素就补冰;已有元素不覆盖 —— 覆盖会打乱玩家的元素连锁构筑)。
 * @param marks 本次命中要附加的印记数(0 = 不附加)
 */
export function strikeElement(
  specials: readonly string[],
  element: Element | null,
): { element: Element | null; marks: number } {
  if (!hasSpecial(specials, 'frostfang')) return { element, marks: 0 };
  if (element) return { element, marks: 0 };   // 已经有元素:不抢
  return { element: S.frostfangElement as Element, marks: S.frostfangMarks };
}

/** 击杀回复(噬魂坠) */
export function killHeal(specials: readonly string[]): number {
  return hasSpecial(specials, 'soulfeast') ? S.soulfeastHeal : 0;
}

/** 第三段连击的范围乘区(怒涛之刃) */
export function comboRangeMult(specials: readonly string[], isFinalStage: boolean): number {
  if (!isFinalStage) return 1;
  return hasSpecial(specials, 'tempest') ? S.tempestRangeMult : 1;
}

/**
 * 受伤乘区(磐石胸甲:低血时减伤)。
 * **注意它是乘区不是免疫**:低血时该打死的仍然会打死,只是多给一次操作机会。
 */
export function damageTakenMult(specials: readonly string[], hpRatio: number): number {
  if (!hasSpecial(specials, 'stoneheart')) return 1;
  return hpRatio <= S.stoneheartThreshold ? 1 - S.stoneheartReduce : 1;
}

/**
 * 反伤(棘刺胸甲):按受到的伤害比例反弹,并有**上限** ——
 * 没有上限的话,一次高伤会直接把周围小怪清空(数值崩坏的经典形态)。
 */
export function reflectOnHurt(specials: readonly string[], amount: number): number {
  if (!hasSpecial(specials, 'thornmail') || amount <= 0) return 0;
  return Math.min(S.thornCap, Math.round(amount * S.thornFrac));
}

export const THORN_RADIUS_M = S.thornRadiusM;

/** 持续/移动类特效的**属性修正**(面板加成,重算属性时应用) */
export interface SpecialCtx {
  moving: boolean;
  /** 距上次受击的秒数(Infinity = 本局没挨过打) */
  sinceHurtS: number;
}

export interface SpecialStatMods {
  atkPct: number;
}

export function statMods(specials: readonly string[], ctx: SpecialCtx): SpecialStatMods {
  let atkPct = 0;
  if (hasSpecial(specials, 'windhood') && ctx.moving) atkPct += S.windhoodAtkPct;
  if (hasSpecial(specials, 'starhelm') && ctx.sinceHurtS <= S.starhelmWindowS) atkPct += S.starhelmAtkPct;
  return { atkPct };
}

/** 翻滚留火焰轨迹(焰行者之靴)—— 表现层问这一句,规则本身只有"有没有" */
export const dashLeavesFire = (specials: readonly string[]): boolean => hasSpecial(specials, 'emberstride');
export const EMBER_TRAIL_BURN_S = S.emberstrideBurnS;

/**
 * 结构自检:每部位至少 1 个特效(轮 19 的验收点之一)。
 * 由测试调用 —— 但把它写在这里,是为了新增部位时**编译期就能看见**这条要求。
 */
export function slotsWithoutSpecial(): Slot[] {
  const all: Slot[] = ['weapon', 'helmet', 'chest', 'boots', 'ring', 'amulet'];
  return all.filter((s) => specialsForSlot(s).length === 0);
}
