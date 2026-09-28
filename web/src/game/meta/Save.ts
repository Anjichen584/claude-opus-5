/**
 * 局外存档(docs/02-ARCHITECTURE.md §9):localStorage + 版本号。
 * 存:星尘钱包、祭坛等级、保底计数、统计。局内进度不存(roguelite)。
 */
export interface SaveData {
  v: 1;
  stardust: number;
  altar: { hp: number; atk: number; luck: number };
  pity: number;
  /** 图纸碎片(Boss 掉落,集齐后铸造开局橙装) */
  blueprintShards: number;
  /** 已预订铸造:下局开局自带随机橙装 */
  craftQueued: boolean;
  stats: { runs: number; clears: number; totalKills: number; bestTimeS: number };
}

const KEY = 'sk_save_v1';

function defaults(): SaveData {
  return {
    v: 1,
    stardust: 0,
    altar: { hp: 0, atk: 0, luck: 0 },
    pity: 0,
    blueprintShards: 0,
    craftQueued: false,
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
      if (parsed.v === 1) this.data = { ...defaults(), ...parsed, altar: { ...defaults().altar, ...parsed.altar } };
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
