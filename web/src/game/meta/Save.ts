/**
 * 局外存档(docs/02-ARCHITECTURE.md §9):localStorage + 版本号。
 * 存:星尘钱包、祭坛等级、保底计数、统计。局内进度不存(roguelite)。
 */
export interface Settings {
  /** 音乐音量 0~1 */
  musicVol: number;
  /** 音效音量 0~1 */
  sfxVol: number;
  /** 界面缩放 0.5~2.0 */
  uiScale: number;
  /** 动作 → 键码(KeyboardEvent.code) */
  binds: Record<string, string>;
}

export interface SaveData {
  v: 1;
  stardust: number;
  altar: { hp: number; atk: number; luck: number };
  pity: number;
  /** 图纸碎片(Boss 掉落,集齐后铸造开局橙装) */
  blueprintShards: number;
  /** 已预订铸造:下局开局自带随机橙装 */
  craftQueued: boolean;
  settings: Settings;
  stats: { runs: number; clears: number; totalKills: number; bestTimeS: number };
}

const KEY = 'sk_save_v1';

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

function defaults(): SaveData {
  return {
    v: 1,
    stardust: 0,
    altar: { hp: 0, atk: 0, luck: 0 },
    pity: 0,
    blueprintShards: 0,
    craftQueued: false,
    settings: { musicVol: 0.8, sfxVol: 0.35, uiScale: 1, binds: { ...DEFAULT_BINDS } },
    stats: { runs: 0, clears: 0, totalKills: 0, bestTimeS: 0 },
  };
}

class MetaStore {
  data: SaveData = defaults();

  load(): void {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SaveData;
      if (parsed.v === 1) {
        const d = defaults();
        this.data = {
          ...d,
          ...parsed,
          altar: { ...d.altar, ...parsed.altar },
          // 旧档无 settings / 新增动作缺绑定 → 逐层兜底合并
          settings: {
            ...d.settings,
            ...(parsed.settings ?? {}),
            binds: { ...d.settings.binds, ...(parsed.settings?.binds ?? {}) },
          },
        };
      }
    } catch {
      this.data = defaults();
    }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* 隐私模式等场景静默失败 */
    }
  }
}

/** 全局元进度单例(main.ts 启动时 load) */
export const meta = new MetaStore();
