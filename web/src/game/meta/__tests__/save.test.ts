import { describe, expect, it } from 'vitest';
import { CURRENT_SAVE_VERSION, DEFAULT_BINDS, migrateSave } from '@game/meta/Save';
import balance from '@data/balance.json';

/**
 * 存档迁移守卫(docs/02-ARCHITECTURE.md §9):
 * roguelite 的局外进度是玩家最舍不得的东西 —— 升级版本时宁可取默认值,也不能整档清空。
 */
const v1 = {
  v: 1,
  stardust: 1234,
  altar: { hp: 3, atk: 2, luck: 1 },
  pity: 42,
  blueprintShards: 7,
  craftQueued: true,
  settings: { musicVol: 0.5, sfxVol: 0.2, uiScale: 1.25, binds: { attack: 'KeyK' } },
  stats: { runs: 9, clears: 4, totalKills: 3210, bestTimeS: 812 },
};

describe('存档迁移', () => {
  /**
   * 蓝图是轮 20 新加的字段:老档一个都没有,新档是只增不减的集合。
   * 这里锁三件事:老档补空、脏数据(非字符串/重复/超长)洗掉、铸台预约能回读。
   */
  it('蓝图字段:老档(没有 blueprints)补空数组,不崩', () => {
    expect(migrateSave(v1).data.blueprints).toEqual([]);
    expect(migrateSave(v1).data.craftQueuedId).toBeNull();
  });

  it('蓝图字段:非字符串/重复项被洗掉,合法 id 原样保留', () => {
    const dirty = { ...v1, v: 2, blueprints: ['bp_a', 'bp_a', 7, null, '', 'bp_b'], craftQueuedId: 42 };
    const d = migrateSave(dirty).data;
    expect(d.blueprints).toEqual(['bp_a', 'bp_b']);
    expect(d.craftQueuedId).toBeNull();
    const good = migrateSave({ ...v1, v: 2, blueprints: ['bp_tempest_blade'], craftQueuedId: 'bp_tempest_blade' }).data;
    expect(good.craftQueuedId).toBe('bp_tempest_blade');
  });

  it('默认档就是当前版本', () => {
    expect(migrateSave(null).data.v).toBe(CURRENT_SAVE_VERSION);
  });

  it('触屏自动攻击开关:老档没这一项 → 取 balance 默认;有 → 听存档的', () => {
    // 老档(v1/v2 都可能缺):补默认而不是当 false
    expect(migrateSave(v1).data.settings.autoAttack).toBe(balance.touch.autoAttack);
    // 玩家真的关过 → 尊重存档(不能被"默认值"覆盖回去)
    const off = migrateSave({
      ...v1, v: CURRENT_SAVE_VERSION,
      settings: { ...v1.settings, autoAttack: false },
    });
    expect(off.data.settings.autoAttack).toBe(false);
    // 脏数据(字符串/数字)一律回默认,别把 undefined 传给渲染层
    const dirty = migrateSave({
      ...v1, v: CURRENT_SAVE_VERSION,
      settings: { ...v1.settings, autoAttack: 'yes' as unknown as boolean },
    });
    expect(dirty.data.settings.autoAttack).toBe(balance.touch.autoAttack);
  });

  it('v1 老档:数值全保留,新字段取默认,标记为已升级', () => {
    const r = migrateSave(v1);
    expect(r.migrated).toBe(true);
    expect(r.reason).toBe('upgraded');
    expect(r.data.v).toBe(CURRENT_SAVE_VERSION);
    // 老字段原样保留
    expect(r.data.stardust).toBe(1234);
    expect(r.data.altar).toEqual({ hp: 3, atk: 2, luck: 1 });
    expect(r.data.pity).toBe(42);
    expect(r.data.blueprintShards).toBe(7);
    expect(r.data.craftQueued).toBe(true);
    expect(r.data.stats.bestTimeS).toBe(812);
    expect(r.data.settings.binds.attack).toBe('KeyK'); // 改过的键位不能被覆盖
    // v2 新字段:屏震/顿帧取默认(1 = 原手感)
    expect(r.data.settings.screenShake).toBe(1);
    expect(r.data.settings.hitstop).toBe(1);
    // 缺失的键位动作补齐默认
    expect(r.data.settings.binds.bag).toBe(DEFAULT_BINDS.bag);
  });

  it('当前版本档:原样通过,不重复迁移', () => {
    const r = migrateSave({ ...v1, v: CURRENT_SAVE_VERSION, settings: { ...v1.settings, screenShake: 0, hitstop: 0.5 } });
    expect(r.migrated).toBe(false);
    expect(r.reason).toBe('ok');
    expect(r.data.settings.screenShake).toBe(0);
    expect(r.data.settings.hitstop).toBe(0.5);
  });

  it('未来版本档:不解读、不污染,交给上层备份', () => {
    const r = migrateSave({ ...v1, v: CURRENT_SAVE_VERSION + 1 });
    expect(r.reason).toBe('future');
    expect(r.data.stardust).toBe(0); // 内存里先给干净档
  });

  it('脏数据:越界/NaN/负数/断键位都被夹回合法值', () => {
    const r = migrateSave({
      v: 2,
      stardust: -50,
      pity: Number.NaN,
      altar: { hp: -3, atk: 'x', luck: 1e9 },
      stats: { runs: -1, clears: 2.6, totalKills: 10, bestTimeS: Number.POSITIVE_INFINITY },
      settings: { musicVol: 5, sfxVol: -1, uiScale: 0.1, screenShake: 9, hitstop: -3, binds: { q: 42 } },
    });
    expect(r.data.stardust).toBe(0);
    expect(r.data.pity).toBe(0);
    expect(r.data.altar.atk).toBe(0);
    expect(r.data.altar.luck).toBe(1e9); // 天文数字不夹上限(玩家真可能刷到)
    expect(r.data.altar.hp).toBe(0);
    expect(r.data.stats.runs).toBe(0);
    expect(r.data.stats.clears).toBe(2);
    expect(r.data.stats.bestTimeS).toBe(0);
    expect(r.data.settings.musicVol).toBe(1);
    expect(r.data.settings.sfxVol).toBe(0);
    expect(r.data.settings.uiScale).toBe(0.5);
    expect(r.data.settings.screenShake).toBe(1);
    expect(r.data.settings.hitstop).toBe(0);
    expect(r.data.settings.binds.q).toBe(DEFAULT_BINDS.q); // 断掉的绑定恢复默认
  });

  it('非对象输入(字符串/数组/数字)一律回默认档', () => {
    for (const bad of ['hello', 42, null, undefined]) {
      const r = migrateSave(bad);
      expect(r.data.stardust).toBe(0);
      expect(r.reason).toBe('empty');
    }
  });
});
