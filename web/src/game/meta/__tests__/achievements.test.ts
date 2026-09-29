import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS, ACHV_CATS, ACHV_TOTAL, achvById, achvInCat, achvProgress, checkUnlocks,
  isComplete, isUnlocked, sanitizeAchievements, summaryLine,
} from '../Achievements';
import { ENEMY_KEYS, RUNE_KEYS, markEnemyKill, markRuneOwned } from '../Codex';
import { defaultSave, migrateSave, type SaveData } from '../migrations';
import { submitRun } from '../Leaderboard';

/** 造一个"满贯档":所有成就的判定条件都满足 */
function perfectSave(): SaveData {
  const d = defaultSave();
  d.stats.runs = 99;
  d.stats.clears = 99;
  d.stats.totalKills = 9999;
  d.stats.bestTimeS = 120;
  d.stats.noHitClears = 3;
  d.stats.dailyClears = 4;
  d.stats.weeklyClears = 2;
  d.stats.crafts = 2;
  d.stardust = 5000;
  d.altar = { hp: 6, atk: 6, luck: 6 };
  // 四条榜各留一条记录(成就「榜上有名」的解锁条件)
  submitRun(d, {
    cleared: true, noHit: true, timeS: 300, kills: 120, maxHit: 240,
    klass: 'blade', chapter: 1, tag: '', at: 1000,
  });
  for (const k of ENEMY_KEYS) markEnemyKill(d.codex, k);
  for (const id of RUNE_KEYS) markRuneOwned(d.codex, id);
  return d;
}

describe('成就定义', () => {
  it('id 唯一、都有名字/描述/图标,总量 ≥ 18', () => {
    const ids = new Set<string>();
    for (const a of ACHIEVEMENTS) {
      expect(ids.has(a.id), a.id).toBe(false);
      ids.add(a.id);
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.desc.length).toBeGreaterThan(0);
      expect(a.icon.length).toBeGreaterThan(0);
      expect(ACHV_CATS).toContain(a.cat);
    }
    expect(ACHV_TOTAL).toBe(ACHIEVEMENTS.length);
    expect(ACHV_TOTAL).toBeGreaterThanOrEqual(18);
  });

  it('每条成就的 goal 都 > 0,且 progress 返回夹在 [0, goal] 内的当前值', () => {
    const d = perfectSave();
    for (const a of ACHIEVEMENTS) {
      const { cur, goal } = a.progress(d);
      expect(goal, a.id).toBeGreaterThan(0);
      expect(cur, a.id).toBeGreaterThanOrEqual(0);
      expect(cur, a.id).toBeLessThanOrEqual(goal);
    }
  });

  it('没有"永远解不开"的成就:满贯档能全解锁', () => {
    const d = perfectSave();
    const fresh = checkUnlocks(d, 1000);
    expect(fresh).toHaveLength(ACHV_TOTAL);
    expect(achvProgress(d).unlocked).toBe(ACHV_TOTAL);
  });

  it('空档一条都解不开(新手不会白拿成就)', () => {
    const d = defaultSave();
    expect(checkUnlocks(d, 1000)).toHaveLength(0);
    expect(achvProgress(d).unlocked).toBe(0);
    expect(achvProgress(d).pct).toBe(0);
  });

  it('分类里的成就加起来等于总数', () => {
    const sum = ACHV_CATS.reduce((s, c) => s + achvInCat(c).length, 0);
    expect(sum).toBe(ACHV_TOTAL);
    expect(achvById('first_clear')?.name).toBe('序章通关');
    expect(achvById('nope')).toBeUndefined();
  });
});

describe('解锁判定(幂等 + 只增不减)', () => {
  it('checkUnlocks 幂等:第二次返回空,解锁时间戳保持首次', () => {
    const d = defaultSave();
    d.stats.clears = 1;
    const first = checkUnlocks(d, 111);
    expect(first.map((a) => a.id)).toContain('first_clear');
    const stamp = d.achievements.unlocked.first_clear;
    const second = checkUnlocks(d, 999);
    expect(second).toHaveLength(0);
    expect(d.achievements.unlocked.first_clear).toBe(stamp); // 不被覆盖
    expect(stamp).toBe(111);
  });

  it('通关 5 次同时解锁 first_clear 与 clear5(里程碑一次补齐)', () => {
    const d = defaultSave();
    d.stats.clears = 5;
    const ids = checkUnlocks(d, 1).map((a) => a.id);
    expect(ids).toContain('first_clear');
    expect(ids).toContain('clear5');
    expect(ids).not.toContain('clear15');
  });

  it('重伤过就不算无伤通关:noHitClears 只有真的无伤才涨', () => {
    const d = defaultSave();
    d.stats.clears = 1;
    expect(isUnlocked(d, 'nohit')).toBe(false);
    d.stats.noHitClears = 1;
    checkUnlocks(d, 1);
    expect(isUnlocked(d, 'nohit')).toBe(true);
  });

  it('极速成就看最快记录:9 分钟只解速度线以上的,6 分钟内两条一起给', () => {
    const slow = defaultSave();
    slow.stats.clears = 1;
    slow.stats.bestTimeS = 540; // 9 分钟
    checkUnlocks(slow, 1);
    expect(isUnlocked(slow, 'speed8')).toBe(false);

    const fast = defaultSave();
    fast.stats.clears = 1;
    fast.stats.bestTimeS = 350; // 5:50
    checkUnlocks(fast, 1);
    expect(isUnlocked(fast, 'speed8')).toBe(true);
    expect(isUnlocked(fast, 'speed6')).toBe(true);
  });

  it('图鉴类成就跟随收录数:收录 3 只 Boss 解锁猎王', () => {
    const d = defaultSave();
    expect(isUnlocked(d, 'codex_boss')).toBe(false);
    for (const k of ['boss_nanmir', 'boss_velsha', 'boss_kazra']) markEnemyKill(d.codex, k);
    checkUnlocks(d, 1);
    expect(isUnlocked(d, 'codex_boss')).toBe(true);
    expect(isUnlocked(d, 'codex10')).toBe(false); // 才 3 条,还没到 10
  });

  it('isComplete 与解锁状态一致(单条判定不依赖 unlock 记录)', () => {
    const d = defaultSave();
    const def = achvById('first_run')!;
    expect(isComplete(d, def)).toBe(false);
    d.stats.runs = 1;
    expect(isComplete(d, def)).toBe(true);
    expect(isUnlocked(d, 'first_run')).toBe(false); // 还没 checkUnlocks
  });
});

describe('存档兼容', () => {
  it('新档带空成就表', () => {
    expect(defaultSave().achievements).toEqual({ unlocked: {} });
    expect(defaultSave().stats.noHitClears).toBe(0);
    expect(defaultSave().stats.dailyClears).toBe(0);
    expect(defaultSave().stats.crafts).toBe(0);
  });

  it('老档(无 achievements/新 stats 字段)迁移后补默认值', () => {
    const r = migrateSave({ v: 2, stardust: 7, stats: { runs: 3, clears: 1, totalKills: 40, bestTimeS: 500 } });
    expect(r.data.achievements).toEqual({ unlocked: {} });
    expect(r.data.stats.runs).toBe(3);
    expect(r.data.stats.noHitClears).toBe(0);
    expect(r.data.stats.crafts).toBe(0);
  });

  it('脏成就表被清洗:未知 id 丢弃、负数/NaN 归零、小数取整', () => {
    const clean = sanitizeAchievements({
      unlocked: { first_clear: 1700000000000, hack_all: 1, first_run: -5, kills100: Number.NaN, clear5: 12.9 },
    });
    expect(clean.unlocked).toEqual({ first_clear: 1700000000000, clear5: 12 });
  });

  it('sanitizeAchievements 对 null / 字符串 / 缺字段都返回空表', () => {
    expect(sanitizeAchievements(null)).toEqual({ unlocked: {} });
    expect(sanitizeAchievements('x')).toEqual({ unlocked: {} });
    expect(sanitizeAchievements({})).toEqual({ unlocked: {} });
    expect(sanitizeAchievements({ unlocked: 5 })).toEqual({ unlocked: {} });
  });

  it('解锁记录跨局保留(存档往返不丢)', () => {
    const d = perfectSave();
    checkUnlocks(d, 42);
    const round = migrateSave(JSON.parse(JSON.stringify(d))).data;
    expect(achvProgress(round).unlocked).toBe(ACHV_TOTAL);
  });

  it('summaryLine 在没有记录时用破折号,不显示 0:00', () => {
    const line = summaryLine(defaultSave());
    expect(line).toContain('出征 0');
    expect(line).toContain('最快 —');
  });
});
