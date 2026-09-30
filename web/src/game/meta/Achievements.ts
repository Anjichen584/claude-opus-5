import balance from '@data/balance.json';
import { ENEMY_KEYS, codexProgress, isMidBossKey, type CodexData } from './Codex';
import type { SaveData } from './migrations';
import { BOARD_IDS, boardsFilled } from './Leaderboard';

/**
 * 成就(星陨殿堂):**纯函数判定 + 幂等解锁**。
 *
 * 设计原则:
 * - 判定只看存档里已有的事实(不新增埋点,除非确实缺数据:本轮补了 dailyClears / noHitClears / crafts);
 * - 每条成就给出 `progress`(当前值/目标值),UI 直接画进度条,不用为显示再写一套逻辑;
 * - 解锁写进 `achievements.unlocked`(id → 时间戳),**只增不减**,旧的解锁记录永远不会被重算掉;
 * - 未知 id 一律丢弃(脏档/老档无害)。
 */

export type AchvCat = '进度' | '战斗' | '极速' | '图鉴' | '局外';

/** 进度值一律夹到 [0, goal]:UI 直接拿来画进度条,不用担心 9999/100 这种越界值 */
const prog = (cur: number, goal: number): { cur: number; goal: number } =>
  ({ cur: Math.max(0, Math.min(Number.isFinite(cur) ? cur : 0, goal)), goal });

export interface AchvDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  cat: AchvCat;
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

/** 任一职业的符文是否已"一门全收"(返回最高的单职业收集数;每职业 9 枚) */
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
  { id: 'first_run', name: '初次启程', desc: '第一次踏入地下城', icon: '🚪', cat: '进度', progress: (d) => prog(d.stats.runs, 1) },
  { id: 'first_clear', name: '序章通关', desc: '首次击败章节 Boss', icon: '🏅', cat: '进度', progress: (d) => prog(d.stats.clears, 1) },
  { id: 'clear5', name: '老练骑士', desc: '通关 5 次', icon: '⚔', cat: '进度', progress: (d) => prog(d.stats.clears, 5) },
  { id: 'clear15', name: '星陨传人', desc: '通关 15 次', icon: '🌟', cat: '进度', progress: (d) => prog(d.stats.clears, 15) },

  // ---- 战斗 ----
  { id: 'kills100', name: '百人斩', desc: '累计击杀 100', icon: '💥', cat: '战斗', progress: (d) => prog(d.stats.totalKills, 100) },
  { id: 'kills500', name: '千军辟易', desc: '累计击杀 500', icon: '🔥', cat: '战斗', progress: (d) => prog(d.stats.totalKills, 500) },
  { id: 'kills2000', name: '收割者', desc: '累计击杀 2000', icon: '☠', cat: '战斗', progress: (d) => prog(d.stats.totalKills, 2000) },
  { id: 'nohit', name: '毫发无伤', desc: '一次未受伤地通关', icon: '🛡', cat: '战斗', progress: (d) => prog(d.stats.noHitClears, 1) },

  // ---- 极速 ----
  { id: 'speed8', name: '疾风骑士', desc: '8 分钟内通关', icon: '💨', cat: '极速', progress: (d) => prog(d.stats.bestTimeS > 0 && d.stats.bestTimeS <= 480 ? 1 : 0, 1) },
  { id: 'speed6', name: '极速传说', desc: '6 分钟内通关', icon: '⚡', cat: '极速', progress: (d) => prog(d.stats.bestTimeS > 0 && d.stats.bestTimeS <= 360 ? 1 : 0, 1) },

  // ---- 图鉴 ----
  { id: 'codex10', name: '初见集录', desc: '图鉴收录 10 种怪物', icon: '📖', cat: '图鉴', progress: (d) => prog(codexEnemies(d), 10) },
  { id: 'codex_boss', name: '猎王', desc: '三章 Boss 全部收录', icon: '👑', cat: '图鉴', progress: (d) => prog(bossFound(d.codex), 3) },
  { id: 'codex_all_enemy', name: '星陨博物志', desc: `收录全部 ${ENEMY_KEYS.length} 种怪物`, icon: '🦴', cat: '图鉴', progress: (d) => prog(codexEnemies(d), ENEMY_KEYS.length) },
  { id: 'rune18', name: '符文收藏家', desc: '收录 18 枚符文', icon: '◈', cat: '图鉴', progress: (d) => prog(codexRunes(d), 18) },
  { id: 'rune_all', name: '符文大师', desc: '收录全部 36 枚符文', icon: '🔮', cat: '图鉴', progress: (d) => prog(codexRunes(d), 36) },

  // ---- 局外 ----
  { id: 'daily_clear', name: '混沌征服者', desc: '通关一次每日挑战', icon: '🗓', cat: '局外', progress: (d) => prog(d.stats.dailyClears, 1) },
  { id: 'weekly_clear', name: '铁律破译者', desc: '通关一次周常挑战', icon: '🏅', cat: '局外', progress: (d) => prog(d.stats.weeklyClears, 1) },
  { id: 'boards_filled', name: '榜上有名', desc: '四条排行榜都有记录', icon: '🥇', cat: '局外', progress: (d) => prog(boardsFilled(d), BOARD_IDS.length) },
  { id: 'altar5', name: '星陨祭坛·小成', desc: '任一祭坛分支升到 5 级', icon: '⭐', cat: '局外', progress: (d) => prog(altarBest(d), 5) },
  { id: 'altar15', name: '星陨祭坛·大成', desc: '三系祭坛合计 15 级', icon: '✨', cat: '局外', progress: (d) => prog(altarLevels(d), 15) },
  { id: 'craft1', name: '铸星者', desc: '在星辉铸台铸造 1 次开局橙装', icon: '📜', cat: '局外', progress: (d) => prog(d.stats.crafts, 1) },
  { id: 'rich', name: '星尘富翁', desc: '持有 1000 星尘', icon: '💰', cat: '局外', progress: (d) => prog(d.stardust, 1000) },
  // ---- 扩建批(轮 36:22 → 32)----
  { id: 'clear30', name: '传奇挽歌', desc: '通关 30 次', icon: '🎖', cat: '进度', progress: (d) => prog(d.stats.clears, 30) },
  { id: 'kills5000', name: '星陨屠戮', desc: '累计击杀 5000', icon: '🌋', cat: '战斗', progress: (d) => prog(d.stats.totalKills, 5000) },
  { id: 'speed5', name: '时之刃', desc: '5 分钟内通关', icon: '⏱', cat: '极速', progress: (d) => prog(d.stats.bestTimeS > 0 && d.stats.bestTimeS <= 300 ? 1 : 0, 1) },
  { id: 'codex_mid', name: '三猎全谱', desc: '三位中 Boss 全部收录(莽/溜/钓)', icon: '🗡', cat: '图鉴', progress: (d) => prog(midbossFound(d.codex), 3) },
  { id: 'codex25', name: '广袤见闻', desc: '图鉴收录 25 种怪物', icon: '🔍', cat: '图鉴', progress: (d) => prog(codexEnemies(d), 25) },
  { id: 'rune_one_class', name: '一门精通', desc: '任一职业 9 枚符文全部收录', icon: '🈴', cat: '图鉴', progress: (d) => prog(bestClassRunes(d.codex), 9) },
  { id: 'totem_all', name: '遍历秘境', desc: '8 座石碑各抉择过至少一次', icon: '🗿', cat: '局外', progress: (d) => prog(totemKinds(d), TOTEM_IDS.length) },
  { id: 'totem20', name: '抉择老手', desc: '秘境抉择累计 20 次', icon: '⚖', cat: '局外', progress: (d) => prog(totemTotal(d), 20) },
  { id: 'craft5', name: '铸星宗师', desc: '在星辉铸台铸造 5 次', icon: '🛠', cat: '局外', progress: (d) => prog(d.stats.crafts, 5) },
  { id: 'rich5k', name: '星尘之海', desc: '持有 5000 星尘', icon: '💎', cat: '局外', progress: (d) => prog(d.stardust, 5000) },
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

/** 面板排序:按类别再按"接近完成" */
export const ACHV_CATS: AchvCat[] = ['进度', '战斗', '极速', '图鉴', '局外'];

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
  const t = d.stats.bestTimeS;
  const time = t > 0 ? `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}` : '—';
  const a = balance.altar;
  void a;
  return `出征 ${d.stats.runs} · 通关 ${d.stats.clears} · 击杀 ${d.stats.totalKills} · 最快 ${time}`
    + ` · 图鉴 ${p.enemyFound + p.runeFound}/${p.enemyTotal + p.runeTotal}`;
}
