/**
 * 本地排行榜(docs/01-GDD.md §11 · 「游戏层缺」清单的最后一项)。
 *
 * 为什么是**本地**榜:云端榜要后端(账号/防作弊/托管),对一个单机 roguelite 是过度工程。
 * 本地榜解决的是玩家真正在意的那件事 —— **“我这局打得怎么样”**:刷新自己记录时给一次明确反馈,
 * 以及让“上一把的最好成绩”随时可查、可对比。
 *
 * 四条榜(每条独立):
 *   speed  最快通关(秒,**越小越好**)    ← 需要真通关
 *   kills  单局击杀(越大越好)
 *   hit    单次最高伤害(越大越好)      ← 记录暴击/连锁的爽点
 *   nohit  最快无伤通关(秒,越小越好)   ← 只有整局零受伤的那次才算
 *
 * 设计口径:
 *   · 上榜不需要通关(kills/hit 只要够门槛就记)—— 否则“没打通”的玩家永远看不到自己变强;
 *   · 每条榜只留前 N 条(默认 5),同一次出征只提交一次(回放/重试不会刷榜);
 *   · 榜单是**存档的一部分**,sanitize 与其它字段同规格:未知职业/章节/负数/NaN 一律丢掉重排;
 *   · 展示格式集中在 «formatScore»/«BOARD_LABEL»,UI 不许自己拼字符串(否则两处口径会飘)。
 */

import balance from '@data/balance.json';
import type { SaveData } from './migrations';

export type BoardId = 'speed' | 'kills' | 'hit' | 'nohit';
export const BOARD_IDS: readonly BoardId[] = ['speed', 'kills', 'hit', 'nohit'];

/** 越小越好(时间类)→ 升序;越大越好(分数类)→ 降序 */
export const BOARD_ASC: Readonly<Record<BoardId, boolean>> = {
  speed: true, kills: false, hit: false, nohit: true,
};

export const BOARD_LABEL: Readonly<Record<BoardId, string>> = {
  speed: 'board.speed.label',
  kills: 'board.kills.label',
  hit: 'board.hit.label',
  nohit: 'board.nohit.label',
};

export const BOARD_HINT: Readonly<Record<BoardId, string>> = {
  speed: 'board.speed.hint',
  kills: 'board.kills.hint',
  hit: 'board.hit.hint',
  nohit: 'board.nohit.hint',
};

export type Klass = 'blade' | 'ranger' | 'arcanist' | 'warden';
const KLASSES: readonly Klass[] = ['blade', 'ranger', 'arcanist', 'warden'];

export interface LbEntry {
  /** 排序键:时间类 = 秒,分数类 = 数值 */
  score: number;
  klass: Klass;
  chapter: 1 | 2 | 3;
  /** 记录时刻(毫秒时间戳;展示相对时间用,0 = 未知) */
  at: number;
  /** 挑战标记:‘’ = 普通远征;‘daily:YYYY-MM-DD’ / ‘weekly:YYYY-Www’ */
  tag: string;
}

export interface Leaderboards {
  speed: LbEntry[];
  kills: LbEntry[];
  hit: LbEntry[];
  nohit: LbEntry[];
}

/** 本次出征的成绩(结算时提交) */
export interface RunScore {
  /** 是否通关(只有通关才进 speed,无伤才进 nohit) */
  cleared: boolean;
  /** 本局是否无伤 */
  noHit: boolean;
  /** 通关用时(秒;未通关给 0) */
  timeS: number;
  kills: number;
  maxHit: number;
  klass: Klass;
  chapter: 1 | 2 | 3;
  /** 挑战标记(普通局传 ‘’) */
  tag: string;
  /** 时间戳 */
  at: number;
}

export const TOP_N = balance.leaderboard.topN;
export const MIN_KILLS = balance.leaderboard.minKills;
export const MIN_HIT = balance.leaderboard.minHit;

export function emptyBoards(): Leaderboards {
  return { speed: [], kills: [], hit: [], nohit: [] };
}

/** 排序:时间类升序、分数类降序;同分按时间戳新的在前(最近一次成绩优先) */
export function sortBoard(board: BoardId, entries: readonly LbEntry[]): LbEntry[] {
  const asc = BOARD_ASC[board];
  return [...entries].sort((a, b) => {
    if (a.score !== b.score) return asc ? a.score - b.score : b.score - a.score;
    return b.at - a.at;
  });
}

/**
 * 一次出征 → 该进哪些榜的条目。
 * 门槛:击杀 ≥ minKills、单次伤害 ≥ minHit、通关才进速度榜、无伤通关才进无伤榜。
 */
export function runScores(run: RunScore): Partial<Record<BoardId, LbEntry>> {
  const base = { klass: run.klass, chapter: run.chapter, at: run.at, tag: run.tag };
  const out: Partial<Record<BoardId, LbEntry>> = {};
  if (run.cleared && run.timeS > 0) out.speed = { ...base, score: run.timeS };
  if (run.cleared && run.noHit && run.timeS > 0) out.nohit = { ...base, score: run.timeS };
  if (run.kills >= MIN_KILLS) out.kills = { ...base, score: run.kills };
  if (run.maxHit >= MIN_HIT) out.hit = { ...base, score: run.maxHit };
  return out;
}

/** 提交一次出征:改的是即将落盘的存档对象(与 Achievements.checkUnlocks 同一写法) */
export function submitRun(data: SaveData, run: RunScore): Partial<Record<BoardId, LbEntry>> {
  const scores = runScores(run);
  for (const id of BOARD_IDS) {
    const entry = scores[id];
    if (!entry) continue;
    const merged = sortBoard(id, [...data.leaderboard[id], entry]).slice(0, TOP_N);
    data.leaderboard[id] = merged;
  }
  return scores;
}

/** 该条在榜上排第几(1 起);不在榜上返回 0 */
export function rankOf(board: BoardId, entries: readonly LbEntry[], entry: LbEntry): number {
  const idx = sortBoard(board, entries).findIndex((e) =>
    e.score === entry.score && e.klass === entry.klass && e.at === entry.at && e.tag === entry.tag);
  return idx < 0 ? 0 : idx + 1;
}

/** 榜单是否已满(4 条榜都有记录 → 成就「榜上有名」) */
export function boardsFilled(data: SaveData): number {
  return BOARD_IDS.filter((id) => data.leaderboard[id].length > 0).length;
}

/** 展示:时间类 mm:ss(不足 1 分钟也给 mm:ss),分数类千分位整数 */
export function formatScore(board: BoardId, score: number): string {
  if (BOARD_ASC[board]) {
    const s = Math.max(0, Math.round(score));
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }
  return Math.round(score).toLocaleString('en-US');
}

/** 挑战标记的展示形式(‘’ → 空,其它 → 徽标文字) */
export function tagLabel(tag: string): string {
  if (tag.startsWith('daily:')) return `🗓 ${tag.slice(6)}`;
  if (tag.startsWith('weekly:')) return `🏅 ${tag.slice(7)}`;
  return '';
}

/** 存档清洗:丢掉脏条目,重排、截断到 TOP_N(与 sanitizeAchievements 同规格) */
export function sanitizeLeaderboards(raw: unknown): Leaderboards {
  const out = emptyBoards();
  if (!raw || typeof raw !== 'object') return out;
  const src = raw as Partial<Record<BoardId, unknown>>;
  for (const id of BOARD_IDS) {
    const list = src[id];
    if (!Array.isArray(list)) continue;
    const clean: LbEntry[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const e = item as Partial<LbEntry>;
      const score = typeof e.score === 'number' && Number.isFinite(e.score) ? e.score : NaN;
      if (!Number.isFinite(score) || score <= 0) continue;
      if (!KLASSES.includes(e.klass as Klass)) continue;
      const chapter = e.chapter;
      if (chapter !== 1 && chapter !== 2 && chapter !== 3) continue;
      const at = typeof e.at === 'number' && Number.isFinite(e.at) ? Math.max(0, Math.floor(e.at)) : 0;
      const tag = typeof e.tag === 'string' ? e.tag : '';
      clean.push({ score, klass: e.klass as Klass, chapter, at, tag });
    }
    out[id] = sortBoard(id, clean).slice(0, TOP_N);
  }
  return out;
}

/** 空档(新玩家/旧档):四条榜都空 */
export const EMPTY_BOARDS: Leaderboards = emptyBoards();
