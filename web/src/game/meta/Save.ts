/**
 * 局外存档读写(localStorage)。格式与迁移规则见 meta/migrations.ts。
 * 存:星尘钱包、祭坛等级、保底计数、统计、设置、引导进度。局内进度不存(roguelite)。
 *
 * **3 个存档槽**(2026-09-29):
 * - 0 号槽沿用历史键 «sk_save_v2» —— 老玩家的档自动落在 0 号槽,**零迁移成本**;
 * - 1/2 号槽是 «sk_save_v2_slot1» / «…slot2»;
 * - 槽元信息(是否存在/上次游玩)读槽键本身,不做单独的索引文件(少一处会不同步的状态)。
 */
import { CURRENT_SAVE_VERSION, defaultSave, migrateSave, type SaveData } from './migrations';

export { CURRENT_SAVE_VERSION, DEFAULT_BINDS, migrateSave } from './migrations';
export type { MigrateResult, SaveData, Settings } from './migrations';

const KEY = `sk_save_v${CURRENT_SAVE_VERSION}`;
/** 旧版本存储键:读取时兜底,成功迁移后清理 */
const LEGACY_KEYS = ['sk_save_v1'];
const BACKUP_KEY = 'sk_save_backup';

/** 存档槽数量(与 balance.tutorial.saveSlots 一致,由 balance 测试钉住) */
export const SLOT_COUNT = 3;

/** 槽 i 的 localStorage 键(0 号槽 = 历史单档键,兼容老玩家) */
export const slotKey = (i: number): string => (i === 0 ? KEY : `${KEY}_slot${i}`);

export interface SlotInfo {
  index: number;
  /** 该槽是否已有存档 */
  exists: boolean;
  /** 当前正在使用的槽 */
  active: boolean;
  /** 展示用摘要(空槽为 null) */
  summary: { stardust: number; altarLv: number; clears: number; runs: number; updatedAt: number } | null;
}

const emptySlotSummary = (): SlotInfo['summary'] => null;

class MetaStore {
  data: SaveData = defaultSave();
  /** 当前槽下标(0 起) */
  slotIndex = 0;

  /** 读槽 i 的原始字符串(不存在返回 null) */
  private rawOf(i: number): string | null {
    try {
      return localStorage.getItem(slotKey(i));
    } catch {
      return null; // 隐私模式
    }
  }

  /** 把槽 i 的原始档洗成 SaveData;失败/空返回 null(坏档不该让整局进不去) */
  preview(i: number): SlotInfo {
    const raw = this.rawOf(i);
    if (!raw) {
      return { index: i, exists: false, active: i === this.slotIndex, summary: emptySlotSummary() };
    }
    try {
      const res = migrateSave(JSON.parse(raw));
      if (res.reason === 'future') {
        // 未来档不能当成自己的数据展示,但槽仍然是“有档”(提示玩家换新版打开)
        return { index: i, exists: true, active: i === this.slotIndex, summary: emptySlotSummary() };
      }
      const d = res.data;
      return {
        index: i,
        exists: true,
        active: i === this.slotIndex,
        summary: {
          stardust: d.stardust,
          altarLv: d.altar.hp + d.altar.atk + d.altar.luck,
          clears: d.stats.clears,
          runs: d.stats.runs,
          updatedAt: d.updatedAt,
        },
      };
    } catch {
      return { index: i, exists: true, active: i === this.slotIndex, summary: emptySlotSummary() };
    }
  }

  /** 全部槽的概览(标题页用) */
  slots(): SlotInfo[] {
    return Array.from({ length: SLOT_COUNT }, (_, i) => this.preview(i));
  }

  /** 切到槽 i:**先把当前进度写回原槽**,再读新槽(切换不丢数据) */
  switchTo(i: number): void {
    if (i === this.slotIndex || i < 0 || i >= SLOT_COUNT) return;
    this.save();
    const raw = this.rawOf(i);
    this.slotIndex = i;
    if (raw) this.adopt(raw);
    else this.data = defaultSave();
  }

  /** 把当前槽清空并重置内存数据(槽里其他槽不受影响) */
  resetSlot(i: number): void {
    try {
      localStorage.removeItem(slotKey(i));
      localStorage.removeItem(BACKUP_KEY);
    } catch {
      /* 隐私模式 */
    }
    if (i === this.slotIndex) this.data = defaultSave();
  }

  load(slot = this.slotIndex): void {
    this.slotIndex = slot;
    try {
      let raw = this.rawOf(slot);
      let fromLegacy = false;
      // 旧版单档键只在 0 号槽兜底(它就是历史路径)
      if (!raw && slot === 0) {
        for (const lk of LEGACY_KEYS) {
          const legacy = localStorage.getItem(lk);
          if (legacy) {
            raw = legacy;
            fromLegacy = true;
            break;
          }
        }
      }
      if (!raw) return;
      this.adopt(raw);
      if (fromLegacy) {
        for (const lk of LEGACY_KEYS) localStorage.removeItem(lk);
      }
    } catch {
      this.data = defaultSave();
    }
  }

  /** 洗牌 + 按需回写(load 与 switchTo 共用) */
  private adopt(raw: string): void {
    const res = migrateSave(JSON.parse(raw));
    this.data = res.data;
    if (res.reason === 'future') {
      // 未来档先备份再另起,万一玩家降级回来还能救
      try {
        localStorage.setItem(BACKUP_KEY, raw);
      } catch {
        /* 隐私模式 */
      }
      this.save();
      return;
    }
    if (res.migrated) this.save(); // 迁移结果立刻落盘,避免每次启动重复迁移
  }

  save(): void {
    this.data.updatedAt = Date.now();
    try {
      localStorage.setItem(slotKey(this.slotIndex), JSON.stringify(this.data));
    } catch {
      /* 隐私模式等场景静默失败 */
    }
  }
}

/** 全局元进度单例(main.ts 启动时 load) */
export const meta = new MetaStore();
