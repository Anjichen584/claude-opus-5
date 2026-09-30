import balance from '@data/balance.json';
import { t } from '@game/i18n';
import { ENEMY_KEYS, codexProgress, isMidBossKey, type CodexData } from './Codex';
import type { SaveData } from './migrations';
import { boardsFilled } from './Leaderboard';

/**
 * 成就(星陨殿堂):**纯函数判定 + 幂等解锁**。
 *
 * 设计原则:
 * - 判定只看存档里已有的事实(不新增埋点,除非确实缺数据:本轮补了 dailyClears / noHitClears / crafts);
 * - 每条成就给出 «progress»(当前值/目标值),UI 直接画进度条,不用为显示再写一套逻辑;
 * - 解锁写进 «achievements.unlocked»(id → 时间戳),**只增不减**,旧的解锁记录永远不会被重算掉;
 * - 未知 id 一律丢弃(脏档/老档无害)。
 */

export type AchvCat = 'progress' | 'combat' | 'speed' | 'codex' | 'meta';

/** 进度值一律夹到 [0, goal]:UI 直接拿来画进度条,不用担心 9999/100 这种越界值 */
const prog = (cur: number, goal: number): { cur: number; goal: number } =>
  ({ cur: Math.max(0, Math.min(Number.isFinite(cur) ? cur : 0, goal)), goal });

export interface AchvDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  cat: AchvCat;
  /** desc 文案的 {x} 占位参数(如 codex_all_enemy 的怪物总数) */
  params?: Record<string, string | number>;
  /** 当前进度 / 目标值(目标 > 0;当前会夹到 [0, goal]) */
  progress: (d: SaveData) => { cur: number; goal: number };
}

/** 三 Boss 是否全部收录(图鉴提供的数据) */
const bossFound = (codex: CodexData): number => {
  const p = codexProgress(codex);
  void p;
  return ENEMY_KEYS.filter((k) => k.startsWith('boss_') && (codex.enemies[k] ?? 0) > 0).length;
};

const altarLevels = (d: SaveData): number => d.altar.hp + d.altar.atk + d.altar.luck;
const altarBest = (d: SaveData): number => Math.max(d.altar.hp, d.altar.atk, d.altar.luck);
import runePool from '@data/runes/pool.json';
import { TOTEM_IDS } from '@game/loot/EventRules';

/** 中 Boss 收录数(midboss_* 前缀;三位 = 莽/溜/钓三性格) */
const midbossFound = (codex: CodexData): number => {
  let n = 0;
  for (const k of ENEMY_KEYS) if (isMidBossKey(k) && codex.enemies[k]) n++;
  return n;
};

/** 任一职业的符文是否已“一门全收”(返回最高的单职业收集数;每职业 9 枚) */
const bestClassRunes = (codex: CodexData): number => {
  const byClass: Record<string, number> = {};
  for (const r of runePool.runes) {
    const cls = r.skill.split('_')[0];
    if (codex.runes[r.id]) byClass[cls] = (byClass[cls] ?? 0) + 1;
  }
  return Math.max(0, ...Object.values(byClass));
};

/** 秘境:选过的碑种数 / 抉择总次数 */
const totemKinds = (d: SaveData): number => TOTEM_IDS.filter((id) => (d.totemCounts[id] ?? 0) > 0).length;
const totemTotal = (d: SaveData): number => Object.values(d.totemCounts).reduce((s, n) => s + n, 0);

const codexEnemies = (d: SaveData): number => codexProgress(d.codex).enemyFound;
const codexRunes = (d: SaveData): number => codexProgress(d.codex).runeFound;

import achvData from '@data/achievements.json';

/**
 * metric → 读值函数(轮 41:定义表抽到 data/achievements.json 与 Unity 共用,
 * 这里只留「语义实现」;两端 metric 名单由 ParityTests.CheckAchievements 逐条钉住)。
 * 新增 metric 忘了登记 → 模块加载即抛错(比静默 0 进度好查得多)。
 */
const METRIC: Record<string, (d: SaveData) => number> = {
  runs: (d) => d.stats.runs,
  clears: (d) => d.stats.clears,
  totalKills: (d) => d.stats.totalKills,
  noHitClears: (d) => d.stats.noHitClears,
  dailyClears: (d) => d.stats.dailyClears,
  weeklyClears: (d) => d.stats.weeklyClears,
  crafts: (d) => d.stats.crafts,
  stardust: (d) => d.stardust,
  codexEnemies,
  codexRunes,
  bossFound: (d) => bossFound(d.codex),
  midbossFound: (d) => midbossFound(d.codex),
  bestClassRunes: (d) => bestClassRunes(d.codex),
  boardsFilled: (d) => boardsFilled(d),
  altarBest,
  altarLevels,
  totemKinds,
  totemTotal,
};

interface AchvRow { id: string; cat: string; icon: string; metric: string; goal: number; timeS?: number }

const rowProgress = (row: AchvRow): ((d: SaveData) => { cur: number; goal: number }) => {
  if (row.metric === 'bestTimeUnder') {
    const cap = row.timeS ?? 0;
    return (d) => prog(d.stats.bestTimeS > 0 && d.stats.bestTimeS <= cap ? 1 : 0, row.goal);
  }
  const read = METRIC[row.metric];
  if (!read) throw new Error(`achievements.json: unknown metric "${row.metric}" (id=${row.id})`);
  return (d) => prog(read(d), row.goal);
};

export const ACHIEVEMENTS: AchvDef[] = (achvData.achievements as AchvRow[]).map((row) => ({
  id: row.id,
  name: `achv.${row.id}.name`,
  desc: `achv.${row.id}.desc`,
  icon: row.icon,
  cat: row.cat as AchvCat,
  ...(row.id === 'codex_all_enemy' ? { params: { n: ENEMY_KEYS.length } } : {}),
  progress: rowProgress(row),
}));

export const ACHV_TOTAL = ACHIEVEMENTS.length;

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
export const achvById = (id: string): AchvDef | undefined => BY_ID.get(id);

/** 单条是否已解锁 */
export const isUnlocked = (d: SaveData, id: string): boolean => (d.achievements.unlocked[id] ?? 0) > 0;

/** 已解锁数量 + 收录率 */
export function achvProgress(d: SaveData): { unlocked: number; total: number; pct: number } {
  let unlocked = 0;
  for (const a of ACHIEVEMENTS) if (isUnlocked(d, a.id)) unlocked++;
  return { unlocked, total: ACHV_TOTAL, pct: ACHV_TOTAL === 0 ? 1 : unlocked / ACHV_TOTAL };
}

/** 进度是否达标 */
export const isComplete = (d: SaveData, a: AchvDef): boolean => {
  const { cur, goal } = a.progress(d);
  return goal > 0 && cur >= goal;
};

/**
 * 判定并解锁(幂等:已解锁的不会被覆盖,时间戳保留首次)。
 * 返回**本次新解锁**的成就定义,宿主用它弹提示。
 */
export function checkUnlocks(d: SaveData, now: number): AchvDef[] {
  const fresh: AchvDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (isUnlocked(d, a.id)) continue;
    if (!isComplete(d, a)) continue;
    d.achievements.unlocked[a.id] = now > 0 ? now : 1;
    fresh.push(a);
  }
  return fresh;
}

/** 面板排序:按类别再按“接近完成” */
export const ACHV_CATS: AchvCat[] = ['progress', 'combat', 'speed', 'codex', 'meta'];

export function achvInCat(cat: AchvCat): AchvDef[] {
  return ACHIEVEMENTS.filter((a) => a.cat === cat);
}

/** 存档清洗:只留已知 id,值取正数(时间戳) */
export function sanitizeAchievements(raw: unknown): { unlocked: Record<string, number> } {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return { unlocked: out };
  const src = (raw as { unlocked?: unknown }).unlocked;
  if (!src || typeof src !== 'object') return { unlocked: out };
  for (const [id, v] of Object.entries(src as Record<string, unknown>)) {
    if (!BY_ID.has(id)) continue;
    const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : 0;
    if (n > 0) out[id] = n;
  }
  return { unlocked: out };
}

/** 供 UI 用的一行战绩摘要 */
export function summaryLine(d: SaveData): string {
  const p = codexProgress(d.codex);
  const bt = d.stats.bestTimeS;
  const time = bt > 0 ? `${Math.floor(bt / 60)}:${Math.floor(bt % 60).toString().padStart(2, '0')}` : '—';
  const a = balance.altar;
  void a;
  return t('achv.summary', {
    runs: d.stats.runs, clears: d.stats.clears, kills: d.stats.totalKills, time,
    found: p.enemyFound + p.runeFound, total: p.enemyTotal + p.runeTotal,
  });
}
