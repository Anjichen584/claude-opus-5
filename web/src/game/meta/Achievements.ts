import balance from '@data/balance.json';
import { t } from '@game/i18n';
import { ENEMY_KEYS, codexProgress, isMidBossKey, type CodexData } from './Codex';
import type { SaveData } from './migrations';
import { BOARD_IDS, boardsFilled } from './Leaderboard';

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

export const ACHIEVEMENTS: AchvDef[] = [
  // ---- 进度 ----
  { id: 'first_run', name: 'achv.first_run.name', desc: 'achv.first_run.desc', icon: '🚪', cat: 'progress', progress: (d) => prog(d.stats.runs, 1) },
  { id: 'first_clear', name: 'achv.first_clear.name', desc: 'achv.first_clear.desc', icon: '🏅', cat: 'progress', progress: (d) => prog(d.stats.clears, 1) },
  { id: 'clear5', name: 'achv.clear5.name', desc: 'achv.clear5.desc', icon: '⚔', cat: 'progress', progress: (d) => prog(d.stats.clears, 5) },
  { id: 'clear15', name: 'achv.clear15.name', desc: 'achv.clear15.desc', icon: '🌟', cat: 'progress', progress: (d) => prog(d.stats.clears, 15) },

  // ---- 战斗 ----
  { id: 'kills100', name: 'achv.kills100.name', desc: 'achv.kills100.desc', icon: '💥', cat: 'combat', progress: (d) => prog(d.stats.totalKills, 100) },
  { id: 'kills500', name: 'achv.kills500.name', desc: 'achv.kills500.desc', icon: '🔥', cat: 'combat', progress: (d) => prog(d.stats.totalKills, 500) },
  { id: 'kills2000', name: 'achv.kills2000.name', desc: 'achv.kills2000.desc', icon: '☠', cat: 'combat', progress: (d) => prog(d.stats.totalKills, 2000) },
  { id: 'nohit', name: 'achv.nohit.name', desc: 'achv.nohit.desc', icon: '🛡', cat: 'combat', progress: (d) => prog(d.stats.noHitClears, 1) },

  // ---- 极速 ----
  { id: 'speed8', name: 'achv.speed8.name', desc: 'achv.speed8.desc', icon: '💨', cat: 'speed', progress: (d) => prog(d.stats.bestTimeS > 0 && d.stats.bestTimeS <= 480 ? 1 : 0, 1) },
  { id: 'speed6', name: 'achv.speed6.name', desc: 'achv.speed6.desc', icon: '⚡', cat: 'speed', progress: (d) => prog(d.stats.bestTimeS > 0 && d.stats.bestTimeS <= 360 ? 1 : 0, 1) },

  // ---- 图鉴 ----
  { id: 'codex10', name: 'achv.codex10.name', desc: 'achv.codex10.desc', icon: '📖', cat: 'codex', progress: (d) => prog(codexEnemies(d), 10) },
  { id: 'codex_boss', name: 'achv.codex_boss.name', desc: 'achv.codex_boss.desc', icon: '👑', cat: 'codex', progress: (d) => prog(bossFound(d.codex), 3) },
  { id: 'codex_all_enemy', name: 'achv.codex_all_enemy.name', desc: 'achv.codex_all_enemy.desc', icon: '🦴', cat: 'codex', params: { n: ENEMY_KEYS.length }, progress: (d) => prog(codexEnemies(d), ENEMY_KEYS.length) },
  { id: 'rune18', name: 'achv.rune18.name', desc: 'achv.rune18.desc', icon: '◈', cat: 'codex', progress: (d) => prog(codexRunes(d), 18) },
  { id: 'rune_all', name: 'achv.rune_all.name', desc: 'achv.rune_all.desc', icon: '🔮', cat: 'codex', progress: (d) => prog(codexRunes(d), 48) },

  // ---- 局外 ----
  { id: 'daily_clear', name: 'achv.daily_clear.name', desc: 'achv.daily_clear.desc', icon: '🗓', cat: 'meta', progress: (d) => prog(d.stats.dailyClears, 1) },
  { id: 'weekly_clear', name: 'achv.weekly_clear.name', desc: 'achv.weekly_clear.desc', icon: '🏅', cat: 'meta', progress: (d) => prog(d.stats.weeklyClears, 1) },
  { id: 'boards_filled', name: 'achv.boards_filled.name', desc: 'achv.boards_filled.desc', icon: '🥇', cat: 'meta', progress: (d) => prog(boardsFilled(d), BOARD_IDS.length) },
  { id: 'altar5', name: 'achv.altar5.name', desc: 'achv.altar5.desc', icon: '⭐', cat: 'meta', progress: (d) => prog(altarBest(d), 5) },
  { id: 'altar15', name: 'achv.altar15.name', desc: 'achv.altar15.desc', icon: '✨', cat: 'meta', progress: (d) => prog(altarLevels(d), 15) },
  { id: 'craft1', name: 'achv.craft1.name', desc: 'achv.craft1.desc', icon: '📜', cat: 'meta', progress: (d) => prog(d.stats.crafts, 1) },
  { id: 'rich', name: 'achv.rich.name', desc: 'achv.rich.desc', icon: '💰', cat: 'meta', progress: (d) => prog(d.stardust, 1000) },
  // ---- 扩建批(轮 36:22 → 32)----
  { id: 'clear30', name: 'achv.clear30.name', desc: 'achv.clear30.desc', icon: '🎖', cat: 'progress', progress: (d) => prog(d.stats.clears, 30) },
  { id: 'kills5000', name: 'achv.kills5000.name', desc: 'achv.kills5000.desc', icon: '🌋', cat: 'combat', progress: (d) => prog(d.stats.totalKills, 5000) },
  { id: 'speed5', name: 'achv.speed5.name', desc: 'achv.speed5.desc', icon: '⏱', cat: 'speed', progress: (d) => prog(d.stats.bestTimeS > 0 && d.stats.bestTimeS <= 300 ? 1 : 0, 1) },
  { id: 'codex_mid', name: 'achv.codex_mid.name', desc: 'achv.codex_mid.desc', icon: '🗡', cat: 'codex', progress: (d) => prog(midbossFound(d.codex), 3) },
  { id: 'codex25', name: 'achv.codex25.name', desc: 'achv.codex25.desc', icon: '🔍', cat: 'codex', progress: (d) => prog(codexEnemies(d), 25) },
  { id: 'rune_one_class', name: 'achv.rune_one_class.name', desc: 'achv.rune_one_class.desc', icon: '🈴', cat: 'codex', progress: (d) => prog(bestClassRunes(d.codex), 12) },
  { id: 'totem_all', name: 'achv.totem_all.name', desc: 'achv.totem_all.desc', icon: '🗿', cat: 'meta', progress: (d) => prog(totemKinds(d), TOTEM_IDS.length) },
  { id: 'totem20', name: 'achv.totem20.name', desc: 'achv.totem20.desc', icon: '⚖', cat: 'meta', progress: (d) => prog(totemTotal(d), 20) },
  { id: 'craft5', name: 'achv.craft5.name', desc: 'achv.craft5.desc', icon: '🛠', cat: 'meta', progress: (d) => prog(d.stats.crafts, 5) },
  { id: 'rich5k', name: 'achv.rich5k.name', desc: 'achv.rich5k.desc', icon: '💎', cat: 'meta', progress: (d) => prog(d.stardust, 5000) },
];

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
