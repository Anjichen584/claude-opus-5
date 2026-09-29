/**
 * 周常挑战(docs/01-GDD.md §9.3):在每日词条之上再叠一层"本周规则"。
 *
 * 与每日挑战的差别:
 *   · 键 = ISO 周(2026-W40),跨周才换;一周之内随便挑时间打,成绩可比;
 *   · 规则 = 2 条每日池词条(周 seed 抽) + 1 条**周常铁律**(周 seed 抽);
 *   · 铁律是"结构性"的:多一波怪 / 商店关门 / 祭坛失效 / 精英提前 / 地形定死 / 换血量口径……
 *     它们改的是**本局怎么打**,不是再乘个数 —— 光叠乘区玩家看数字就麻了。
 *
 * 铁律的取舍同样由单测守卫:每条都必须既有"玩家难受的"也有"玩家划算的"。
 * 数据在 src/data/challenges.json 的 weekly 段(双端 parity 比对 C# 镜像)。
 */

import { Rng } from '@engine/core/Rng';
import challenges from '@data/challenges.json';
import { keySeed, MOD_POOL, mergeMods, type MergedMods, type RunMod } from './Daily';
import { LAYOUT_IDS, type LayoutId } from '@game/dungeon/RoomLayouts';

/** 周常铁律:在词条数值之外,还能改本局的结构 */
export interface WeeklyRule extends RunMod {
  /** 每房额外波数(1 = 多打一波) */
  extraWaves?: number;
  /** 商店房不再出现(选路只剩战斗/宝藏) */
  shopClosed?: boolean;
  /** 祭坛永久成长本局失效(对新玩家反而公平) */
  altarOff?: boolean;
  /** 精英房位置偏移(负数 = 提前) */
  eliteShift?: number;
  /** 战斗房强制使用这几种地形之一(按周 seed 抽定) */
  forcedLayouts?: string[];
}

export const WEEKLY_RULES: readonly WeeklyRule[] = challenges.weekly.rules as readonly WeeklyRule[];
/** 每周从每日池里再抽几条(与铁律合计 3 条,和每日挑战同量级) */
export const WEEKLY_DAILY_PICKS = challenges.weekly.dailyMods;

/** 本局的结构性改动(普通局/每日局全中性) */
export interface StructureMods {
  /** 每房额外波数 */
  extraWaves: number;
  /** 商店房是否关门 */
  shopClosed: boolean;
  /** 祭坛成长是否失效 */
  altarOff: boolean;
  /** 精英房位置偏移 */
  eliteShift: number;
  /** 强制地形(战斗房),null = 随机 */
  forcedLayout: LayoutId | null;
}

export const NEUTRAL_STRUCTURE: StructureMods = {
  extraWaves: 0, shopClosed: false, altarOff: false, eliteShift: 0, forcedLayout: null,
};

/**
 * ISO-8601 周键 `YYYY-Www`。
 * 规则:周一为一周之始,**归属看周四**——所以 1 月 1 日可能属于上一年的最后一周,
 * 12 月 31 日也可能属于下一年的第 1 周(2026-01-01 是周四 → 2026-W01)。
 */
export function weeklyKey(d: Date): string {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // 移到本周四(周一 + 3 天):ISO 周的年份由周四所在年决定
  day.setDate(day.getDate() + (3 - ((day.getDay() + 6) % 7)));
  const year = day.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4Monday = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7));
  const week = Math.round((day.getTime() - jan4Monday.getTime()) / (7 * 86400000)) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** 周键 → seed(与每日共用 FNV-1a + 雪崩) */
export function weeklySeed(key: string): number {
  return keySeed(key);
}

export interface WeeklyChallenge {
  key: string;
  seed: number;
  /** 本周铁律 */
  rule: WeeklyRule;
  /** 参与乘区合并的全部词条:铁律 + 抽到的每日词条 */
  mods: RunMod[];
  /** 合并后的乘区(展示/测试用;运行期走 RunMods 单例) */
  eff: MergedMods;
  /** 结构性改动 */
  structure: StructureMods;
}

/** 铁律的结构部分(与数值部分分开,便于单测与运行时读取) */
export function structureOf(rule: WeeklyRule, forcedLayout: LayoutId | null): StructureMods {
  return {
    extraWaves: Math.max(0, Math.round(rule.extraWaves ?? 0)),
    shopClosed: rule.shopClosed === true,
    altarOff: rule.altarOff === true,
    eliteShift: Math.round(rule.eliteShift ?? 0),
    forcedLayout,
  };
}

/**
 * 本周挑战:周 seed → 抽 1 条铁律 + N 条每日词条(不重复,且与铁律 id 不同)。
 * 顺序确定(先铁律,后每日词条按抽中顺序),同周同结果。
 */
export function weeklyChallenge(key: string): WeeklyChallenge {
  const seed = weeklySeed(key);
  const rng = new Rng(seed);
  const rule = WEEKLY_RULES[rng.int(0, WEEKLY_RULES.length - 1)];
  const pool = MOD_POOL.filter((m) => m.id !== rule.id);
  const mods: RunMod[] = [rule];
  for (let i = 0; i < WEEKLY_DAILY_PICKS && pool.length > 0; i++) {
    mods.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  }
  const forcedLayout = pickForcedLayout(rule, rng);
  return {
    key,
    seed,
    rule,
    mods,
    eff: mergeMods(mods),
    structure: structureOf(rule, forcedLayout),
  };
}

/** 铁律若限定地形,则从它的清单里按周 seed 抽定一种(否则随机地形) */
export function pickForcedLayout(rule: WeeklyRule, rng: Rng): LayoutId | null {
  const list = (rule.forcedLayouts ?? []).filter((id): id is LayoutId =>
    (LAYOUT_IDS as readonly string[]).includes(id));
  if (list.length === 0) return null;
  return rng.pick(list);
}

/** 周键的展示形式(第 N 周) */
export function weeklyLabel(key: string): string {
  const m = /-W(\d{2})$/.exec(key);
  return m ? `第 ${Number(m[1])} 周` : key;
}
