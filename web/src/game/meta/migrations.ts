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
import { sanitizeAchievements } from './Achievements';
import { sanitizeLeaderboards, type Leaderboards } from './Leaderboard';
import balance from '@data/balance.json';

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
  /**
   * 触屏:自动攻击(锁定目标进射程就自动开火)。默认取 balance.touch.autoAttack。
   * 加字段不升存档版本:老档缺这一项由逐层兜底补默认(见下方 normalizeSettings)。
   */
  autoAttack: boolean;
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
  /** 旧口径:已预订铸造(下局开局自带**随机**橙装)。新档走 craftQueuedId,这里只作老档兜底 */
  craftQueued: boolean;
  /** 已学蓝图 id(铸台:学会才铸造得出指定橙装;只增不减) */
  blueprints: string[];
  /** 铸台预约的蓝图 id:下局开局直接拿到这张图纸的产品(null = 没预约) */
  craftQueuedId: string | null;
  /**
   * 各深渊层通关次数(下标 0 → 深渊 I)。深渊解锁是**逐层**的:
   * II 要求 I 通关 unlockAbyss 次,III 要求 II —— 所以这必须是每层独立的计数,不能只存一个总数。
   */
  abyssClears: number[];
  /** 每日挑战记录(局外持久;key = 当天日期,跨天自动视作未通关) */
  daily: { key: string; cleared: boolean; bestTimeS: number; bestKills: number };
  /** 周常挑战最佳(键 = ISO 周,如 2026-W40;跨周自动作废) */
  weekly: { key: string; cleared: boolean; bestTimeS: number; bestKills: number };
  /** 本地排行榜(四条榜各留前 N 条;见 meta/Leaderboard.ts) */
  leaderboard: Leaderboards;
  /** 图鉴(收录):已击杀的怪 / 见过的符文;展示数值现读 balance,只存"见过没有+次数" */
  codex: CodexData;
  settings: Settings;
  /** 累计统计。加字段(noHitClears/dailyClears/.../weeklyClears)走逐层兜底,不升存档版本 */
  stats: {
    runs: number; clears: number; totalKills: number; bestTimeS: number;
    /** 无伤通关次数 */
    noHitClears: number;
    /** 通关每日挑战次数(跨天不清零) */
    dailyClears: number;
    weeklyClears: number;
    /** 星辉铸台铸造次数 */
    crafts: number;
  };
  /** 成就:已解锁 id → 首次解锁时间戳(只增不减) */
  achievements: { unlocked: Record<string, number> };
  /**
   * 新手引导进度:step = 下一个待完成的步骤下标(5 步全完成 → done=true)。
   * 存进度而不是只存 done,是为了"中途关掉游戏还能接着引导"。
   */
  tutorial: { step: number; done: boolean };
  /** 最后写入时间(存档槽界面显示"上次游玩";0 = 未知) */
  updatedAt: number;
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
    blueprints: [],
    craftQueuedId: null,
    abyssClears: [],
    daily: { key: '', cleared: false, bestTimeS: 0, bestKills: 0 },
    weekly: { key: '', cleared: false, bestTimeS: 0, bestKills: 0 },
  leaderboard: { speed: [], kills: [], hit: [], nohit: [] },
    codex: emptyCodex(),
    settings: {
      musicVol: 0.8, sfxVol: 0.35, uiScale: 1,
      screenShake: 1, hitstop: 1,
      // 触屏自动攻击默认值写在 balance.touch(手感数值集中在一处)
      autoAttack: balance.touch.autoAttack,
      binds: { ...DEFAULT_BINDS },
    },
    stats: { runs: 0, clears: 0, totalKills: 0, bestTimeS: 0, noHitClears: 0, dailyClears: 0, weeklyClears: 0, crafts: 0 },
    achievements: { unlocked: {} },
    tutorial: { step: 0, done: false },
    updatedAt: 0,
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
    weekly: { ...d.weekly, ...(parsed.weekly ?? {}) },
    // 榜单是数组,不能走 spread 合并:整段交给 sanitize 重排/截断
    leaderboard: parsed.leaderboard ?? d.leaderboard,
    codex: sanitizeCodex((parsed as Partial<SaveData>).codex),
    tutorial: {
      // 老档没有 tutorial 字段 → 视为"从没引导过";越界 step 夹回合法区间
      step: Math.max(0, Math.floor(num((parsed as Partial<SaveData>).tutorial?.step))),
      done: (parsed as Partial<SaveData>).tutorial?.done === true,
    },
    updatedAt: Math.max(0, num(parsed.updatedAt)),
    achievements: sanitizeAchievements((parsed as Partial<SaveData>).achievements),
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
  // 已学蓝图:只留字符串、去重、限量(写坏的档不至于让铸台列出 1 万个空行)
  data.blueprints = Array.isArray(data.blueprints)
    ? [...new Set(data.blueprints.filter((x): x is string => typeof x === 'string' && x.length > 0))].slice(0, 64)
    : [];
  data.craftQueuedId = typeof data.craftQueuedId === 'string' && data.craftQueuedId.length > 0
    ? data.craftQueuedId : null;
  // 深渊各层通关数:补齐到层数长度、越界/非数字一律夹回(层表变长时老档自动补 0)
  const levelCount = (balance.abyss.levels as unknown[]).length;
  data.abyssClears = Array.from({ length: levelCount }, (_, i) => {
    const raw = Array.isArray(data.abyssClears) ? (data.abyssClears as unknown[])[i] : 0;
    return Math.max(0, Math.floor(num(raw)));
  });
  const cleanRecord = (r: { key: unknown; cleared: unknown; bestTimeS: unknown; bestKills: unknown }):
    { key: string; cleared: boolean; bestTimeS: number; bestKills: number } => ({
    key: typeof r.key === 'string' ? r.key : '',
    cleared: r.cleared === true,
    bestTimeS: Math.max(0, num(r.bestTimeS)),
    bestKills: Math.max(0, Math.floor(num(r.bestKills))),
  });
  data.daily = cleanRecord(data.daily);
  data.weekly = cleanRecord(data.weekly);
  data.leaderboard = sanitizeLeaderboards(data.leaderboard);
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
    noHitClears: Math.max(0, Math.floor(num(data.stats.noHitClears))),
    dailyClears: Math.max(0, Math.floor(num(data.stats.dailyClears))),
    weeklyClears: Math.max(0, Math.floor(num(data.stats.weeklyClears))),
    crafts: Math.max(0, Math.floor(num(data.stats.crafts))),
  };
  const s = data.settings;
  s.musicVol = clamp(s.musicVol, 0, 1, d.settings.musicVol);
  s.sfxVol = clamp(s.sfxVol, 0, 1, d.settings.sfxVol);
  s.uiScale = clamp(s.uiScale, 0.5, 2, d.settings.uiScale);
  // v1 档没有这两个字段 → 取默认(1 = 原手感);同时兼容旧版存成 0/1 布尔
  s.screenShake = clamp(s.screenShake, 0, 1, d.settings.screenShake);
  s.hitstop = clamp(s.hitstop, 0, 1, d.settings.hitstop);
  // 老档没有 autoAttack(布尔)→ 取 balance 默认;只有真的 boolean 才认
  s.autoAttack = typeof s.autoAttack === 'boolean' ? s.autoAttack : d.settings.autoAttack;
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

