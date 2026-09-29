/**
 * 局外存档读写(localStorage)。格式与迁移规则见 meta/migrations.ts。
 * 存:星尘钱包、祭坛等级、保底计数、统计、设置。局内进度不存(roguelite)。
 */
import { CURRENT_SAVE_VERSION, defaultSave, migrateSave, type SaveData } from './migrations';

export { CURRENT_SAVE_VERSION, DEFAULT_BINDS, migrateSave } from './migrations';
export type { MigrateResult, SaveData, Settings } from './migrations';

const KEY = `sk_save_v${CURRENT_SAVE_VERSION}`;
/** 旧版本存储键:读取时兜底,成功迁移后清理 */
const LEGACY_KEYS = ['sk_save_v1'];
const BACKUP_KEY = 'sk_save_backup';

class MetaStore {
  data: SaveData = defaultSave();

  load(): void {
    try {
      let raw = localStorage.getItem(KEY);
      let fromLegacy = false;
      if (!raw) {
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
      const res = migrateSave(JSON.parse(raw));
      this.data = res.data;
      if (res.reason === 'future') {
        // 未来档先备份再另起,万一玩家降级回来还能救
        localStorage.setItem(BACKUP_KEY, raw);
        this.save();
        return;
      }
      if (res.migrated || fromLegacy) {
        this.save(); // 迁移结果立刻落盘,避免每次启动重复迁移
        if (fromLegacy) {
          for (const lk of LEGACY_KEYS) localStorage.removeItem(lk);
        }
      }
    } catch {
      this.data = defaultSave();
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
