/**
 * 深渊难度层(2026-09-29,10-FULL-PLAN 轮 23)。
 *
 * 设计意图:**难度只改乘区,不改内容**。三章的敌人 / 房间 / 事件表一律不动 ——
 * 深渊层把同一套内容重排成“怪更硬、掉得更多、精英更多”。这样做的两个好处:
 * 1. 内容量不用翻三倍就能撑出三档体验(R1 风险里的“内容不够”直接缓解);
 * 2. 三档之间可以**逐列对照**(血量/攻击/掉落/星尘/精英数),平衡改动一眼看出方向。
 *
 * 解锁是**逐层**的,不是“通关 10 次全开”:
 * - 深渊 I:普通局通关 «unlockClears» 次(默认 3)—— 新手先熟悉基础循环;
 * - 深渊 II / III:需要**上一层深渊**通关 «unlockAbyss» 次 —— 不能跳级,
 *   否则玩家会直接进 III,被 3.0× 血量的怪打自闭(这是难度系统最常见的劝退点)。
 *
 * 纯函数,零副作用:解锁与乘区都可单测,Unity 侧 «Dungeon/AbyssRules.cs» 是同一套规则。
 */
import { t } from '@game/i18n';
import balance from '@data/balance.json';

const AB = balance.abyss;

export interface AbyssLevel {
  id: number;
  name: string;
  hpMult: number;
  atkMult: number;
  lootMult: number;
  dustMult: number;
  /**
   * 每层**精英房额外波次**(0 = 与基础一致)。
   * 为什么不是“额外精英房”:房间序列是固定的 8 间 + Boss,插一间会顶掉商店/秘境的选路点。
   * 多一波怪既能拉长精英房,也不动房间结构 —— 难度系统的改动面越小越好。
   */
  eliteWaves: number;
  unlockClears: number;
  unlockAbyss: number;
}

export const ABYSS_LEVELS = AB.levels as AbyssLevel[];

/** 0 = 普通远征(不是“第 0 层深渊”) */
export const NORMAL = 0;

export interface AbyssProgress {
  /** 普通局通关次数(存档 stats.clears) */
  clears: number;
  /** 各深渊层通关次数(下标 0 → 深渊 I;存档 abyssClears) */
  abyssClears: readonly number[];
}

/** 第 idx 层的定义(0 返回 null:普通局没有“层定义”) */
export const levelOf = (idx: number): AbyssLevel | null =>
  idx >= 1 && idx <= ABYSS_LEVELS.length ? ABYSS_LEVELS[idx - 1] : null;

export const levelName = (idx: number): string => levelOf(idx)?.name ?? t('camp.exp.normal');

/** 乘区:普通局全 1(系统侧不需要 if (abyss > 0)) */
export function multsOf(idx: number): { hp: number; atk: number; loot: number; dust: number; eliteWaves: number } {
  const l = levelOf(idx);
  if (!l) return { hp: 1, atk: 1, loot: 1, dust: 1, eliteWaves: 0 };
  return { hp: l.hpMult, atk: l.atkMult, loot: l.lootMult, dust: l.dustMult, eliteWaves: l.eliteWaves };
}

/**
 * 解锁吗?两个条件都要满足(普通局门槛 + 上一层通关),而且是**逐层**判定:
 * 深渊 III 只看深渊 II 的通关数,不看深渊 I —— 因为 II 的解锁已经隐含了 I。
 */
export function abyssUnlocked(idx: number, prog: AbyssProgress): boolean {
  const l = levelOf(idx);
  if (!l) return idx === NORMAL;          // 0 永远可用;越界一律不可用
  if (prog.clears < l.unlockClears) return false;
  if (l.unlockAbyss > 0) {
    const prev = prog.abyssClears[idx - 2] ?? 0;   // 上一层(下标 = idx-2)
    if (prev < l.unlockAbyss) return false;
  }
  return true;
}

/** 某个层为什么锁着(UI 直接用这句话;null = 已解锁) */
export function lockReason(idx: number, prog: AbyssProgress): string | null {
  const l = levelOf(idx);
  if (!l) return idx === NORMAL ? null : t('abyss.noSuchLevel');
  if (prog.clears < l.unlockClears) {
    return t('abyss.lock.clears', { n: prog.clears, need: l.unlockClears });
  }
  if (l.unlockAbyss > 0) {
    const prev = prog.abyssClears[idx - 2] ?? 0;
    if (prev < l.unlockAbyss) {
      return t('abyss.lock.abyss', { name: levelName(idx - 1), n: prev, need: l.unlockAbyss });
    }
  }
  return null;
}

/** 当前最高可玩层(从高往低找第一个解锁的) */
export function maxPlayable(prog: AbyssProgress): number {
  let best = NORMAL;
  for (let i = 1; i <= ABYSS_LEVELS.length; i++) if (abyssUnlocked(i, prog)) best = i;
  return best;
}

/**
 * 通关一次后的进度(纯函数:返回新的 abyssClears,不改入参)。
 * 普通局通关只加 clears;深渊层通关加对应层 —— **两层都加**,因为深渊 III 的解锁看的是 II 的通关数。
 */
export function recordClear(idx: number, prog: AbyssProgress): AbyssProgress {
  const clears = prog.clears + 1;
  // 长度**总是**层数:普通局通关也要返回规整的数组 —— 否则存档形状会随“哪一档通关”而变,
  // 存档迁移与 UI 都得再补一次兜底(这种“大多数时候对”的形状最容易被漏掉)。
  const abyssClears = ABYSS_LEVELS.map((_, i) => prog.abyssClears[i] ?? 0);
  if (idx >= 1 && idx <= ABYSS_LEVELS.length) abyssClears[idx - 1]++;
  return { clears, abyssClears };
}

/** 本次通关是否解锁了新的一层(结算页提示用;解锁同一层不会重复提示) */
export function newlyUnlocked(before: AbyssProgress, after: AbyssProgress): number | null {
  for (let i = 1; i <= ABYSS_LEVELS.length; i++) {
    if (!abyssUnlocked(i, before) && abyssUnlocked(i, after)) return i;
  }
  return null;
}

/** 给 UI 的一行摘要:难度名 + 四条乘区 */
export function summaryOf(idx: number): string {
  const m = multsOf(idx);
  if (idx === NORMAL) return t('abyss.summary.normal');
  return t('abyss.summary', { name: levelName(idx), hp: m.hp, atk: m.atk, loot: m.loot, dust: m.dust })
    + `${m.eliteWaves > 0 ? t('abyss.summary.elite', { n: m.eliteWaves }) : ''}`;
}

/** 夜战在深渊里额外加成(深渊 + 夜晚 = 最难组合;数值表给,不写死) */
export const NIGHT_BONUS_MULT = AB.nightBonusMult as number;
