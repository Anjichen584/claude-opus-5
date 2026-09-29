/**
 * 存档格式与版本迁移(docs/02-ARCHITECTURE.md §9)。
 * 纯函数、零副作用:存储读写见 meta/Save.ts,这里只管"把任意老档洗成当前版本"。
 *
 * 迁移规则(接手必读):
 * - 加字段 → 只改 defaults() 与 SaveData,老档缺的字段靠逐层兜底合并补默认,不必升版本;
 * - 改语义/改结构/改存储键 → 升 CURRENT_SAVE_VERSION,并在 migrateSave 里写显式转换;
 * - 永远不因为"读到不认识的档"而清空玩家数据(未来版本档一律备份后另起,见 Save.ts)。
 */
export const CURRENT_SAVE_VERSION = 2;

import { emptyCodex, sanitizeCodex, type CodexData } from './Codex';

export interface Settings {
  /** 音乐音量 0~1 */
  musicVol: number;
  /** 音效音量 0~1 */
  sfxVol: number;
  /** 界面缩放 0.5~2.0 */
  uiScale: number;
  /** 屏震强度 0~1(0 = 关闭,晕动症/低端机友好) */
  screenShake: number;
  /** 顿帧强度 0~1(0 = 关闭) */
  hitstop: number;
  /** 动作 → 键码(KeyboardEvent.code) */
  binds: Record<string, string>;
}

export interface SaveData {
  v: typeof CURRENT_SAVE_VERSION;
  stardust: number;
  altar: { hp: number; atk: number; luck: number };
  pity: number;
  /** 图纸碎片(Boss 掉落,集齐后铸造开局橙装) */
  blueprintShards: number;
  /** 已预订铸造:下局开局自带随机橙装 */
  craftQueued: boolean;
  /** 每日挑战记录(局外持久;key = 当天日期,跨天自动视作未通关) */
  daily: { key: string; cleared: boolean; bestTimeS: number; bestKills: number };
  /** 图鉴(收录):已击杀的怪 / 见过的符文;展示数值现读 balance,只存"见过没有+次数" */
  codex: CodexData;
  settings: Settings;
  stats: { runs: number; clears: number; totalKills: number; bestTimeS: number };
}

/** 默认键位(动作定义见 meta/Bindings.ts) */
export const DEFAULT_BINDS: Record<string, string> = {
  attack: 'KeyJ',
  dash: 'Space',
  q: 'KeyQ',
  e: 'KeyE',
  r: 'KeyR',
  potion: 'Digit1',
  interact: 'KeyF',
  lantern: 'KeyL',
  bag: 'Tab',
};

export function defaultSave(): SaveData {
  return {
    v: CURRENT_SAVE_VERSION,
    stardust: 0,
    altar: { hp: 0, atk: 0, luck: 0 },
    pity: 0,
    blueprintShards: 0,
    craftQueued: false,
    daily: { key: '', cleared: false, bestTimeS: 0, bestKills: 0 },
    codex: emptyCodex(),
    settings: {
      musicVol: 0.8, sfxVol: 0.35, uiScale: 1,
      screenShake: 1, hitstop: 1,
      binds: { ...DEFAULT_BINDS },
    },
    stats: { runs: 0, clears: 0, totalKills: 0, bestTimeS: 0 },
  };
}

const clamp = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(hi, Math.max(lo, v));
};

const num = (n: unknown, fallback = 0): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback;

export interface MigrateResult {
  data: SaveData;
  /** true = 参数里的档不是当前版本(升级过或另起),调用方应立刻回写 */
  migrated: boolean;
  reason: 'empty' | 'future' | 'upgraded' | 'ok' | 'fresh';
}

/**
 * 把任意来源的存档对象洗成当前版本(纯函数,便于单测)。
 * 兜底策略:能救的字段全救,救不回来的取默认,绝不整体丢弃。
 */
export function migrateSave(raw: unknown): MigrateResult {
  const d = defaultSave();
  if (raw === null || raw === undefined || typeof raw !== 'object') {
    return { data: d, migrated: false, reason: 'empty' };
  }
  const parsed = raw as Partial<SaveData> & { v?: number };
  const v = typeof parsed.v === 'number' && Number.isFinite(parsed.v) ? parsed.v : 0;

  // 未来版本的档:可能是玩家用过更新的版本,绝不当成脏数据覆盖
  if (v > CURRENT_SAVE_VERSION) {
    return { data: d, migrated: true, reason: 'future' };
  }

  const data: SaveData = {
    ...d,
    ...parsed,
    v: CURRENT_SAVE_VERSION,
    altar: { ...d.altar, ...(parsed.altar ?? {}) },
    stats: { ...d.stats, ...(parsed.stats ?? {}) },
    daily: { ...d.daily, ...(parsed.daily ?? {}) },
    codex: sanitizeCodex((parsed as Partial<SaveData>).codex),
    settings: {
      ...d.settings,
      ...(parsed.settings ?? {}),
      binds: { ...d.settings.binds, ...(parsed.settings?.binds ?? {}) },
    },
  };

  // 数值卫生:越界/NaN/负值一律夹回合法区间
  data.stardust = Math.max(0, Math.floor(num(data.stardust)));
  data.pity = Math.max(0, Math.floor(num(data.pity)));
  data.blueprintShards = Math.max(0, Math.floor(num(data.blueprintShards)));
  data.craftQueued = data.craftQueued === true;
  data.daily = {
    key: typeof data.daily.key === 'string' ? data.daily.key : '',
    cleared: data.daily.cleared === true,
    bestTimeS: Math.max(0, num(data.daily.bestTimeS)),
    bestKills: Math.max(0, Math.floor(num(data.daily.bestKills))),
  };
  data.altar = {
    hp: Math.max(0, Math.floor(num(data.altar.hp))),
    atk: Math.max(0, Math.floor(num(data.altar.atk))),
    luck: Math.max(0, Math.floor(num(data.altar.luck))),
  };
  data.stats = {
    runs: Math.max(0, Math.floor(num(data.stats.runs))),
    clears: Math.max(0, Math.floor(num(data.stats.clears))),
    totalKills: Math.max(0, Math.floor(num(data.stats.totalKills))),
    bestTimeS: Math.max(0, num(data.stats.bestTimeS)),
  };
  const s = data.settings;
  s.musicVol = clamp(s.musicVol, 0, 1, d.settings.musicVol);
  s.sfxVol = clamp(s.sfxVol, 0, 1, d.settings.sfxVol);
  s.uiScale = clamp(s.uiScale, 0.5, 2, d.settings.uiScale);
  // v1 档没有这两个字段 → 取默认(1 = 原手感);同时兼容旧版存成 0/1 布尔
  s.screenShake = clamp(s.screenShake, 0, 1, d.settings.screenShake);
  s.hitstop = clamp(s.hitstop, 0, 1, d.settings.hitstop);
  for (const k of Object.keys(s.binds)) {
    if (typeof s.binds[k] !== 'string' || s.binds[k] === '') {
      // 断掉的绑定:能恢复默认就恢复,未知动作(旧版残留)直接丢弃
      const def = d.settings.binds[k];
      if (def) s.binds[k] = def;
      else delete s.binds[k];
    }
  }

  return {
    data,
    migrated: v !== CURRENT_SAVE_VERSION,
    reason: v === CURRENT_SAVE_VERSION ? 'ok' : v === 0 ? 'fresh' : 'upgraded',
  };
}

