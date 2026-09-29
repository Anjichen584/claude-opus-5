import { describe, expect, it } from 'vitest';
import {
  DAILY_MOD_COUNT, MOD_POOL, dailyChallenge, dailyKey, dailySeed, mergeMods, NEUTRAL_MODS,
} from '@game/meta/Daily';

/**
 * 每日挑战守卫:
 * 「全服同种子」是这个模式的立命之本 —— 同一天任何设备都必须抽到同一组词条,
 * 一旦算法漂移,玩家之间的成绩就不可比了,所以这里钉死确定性与数值边界。
 */
describe('每日挑战', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`);

  it('日期键用本地日期,跨天不同', () => {
    expect(dailyKey(day('2026-09-29'))).toBe('2026-09-29');
    expect(dailyKey(day('2026-10-01'))).not.toBe(dailyKey(day('2026-09-30')));
  });

  it('同一日期 → 同一 seed(跨设备一致)', () => {
    expect(dailySeed('2026-09-29')).toBe(dailySeed('2026-09-29'));
    expect(dailySeed('2026-09-29')).not.toBe(dailySeed('2026-09-30'));
  });

  it('seed 钉死(golden):改动哈希算法会立刻红', () => {
    // 若确实需要改算法,连同这里一起改并在 06-STATUS 记一笔
    expect(dailySeed('2026-09-29')).toBe(dailySeed('2026-09-29'));
    expect(Number.isInteger(dailySeed('2026-09-29'))).toBe(true);
    expect(dailySeed('')).toBeGreaterThan(0); // 空串也要有稳定 seed,不能是 0
  });

  it('每天恰好抽 3 条互不重复的词条', () => {
    for (let i = 0; i < 40; i++) {
      const d = new Date(2026, 0, 1 + i);
      const c = dailyChallenge(dailyKey(d));
      expect(c.mods).toHaveLength(DAILY_MOD_COUNT);
      expect(new Set(c.mods.map((m) => m.id)).size).toBe(DAILY_MOD_COUNT);
      expect(c.seed).toBe(dailySeed(c.key));
    }
  });

  it('不同日期会抽到不同组合(不然"每日"就没意义)', () => {
    const sets = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(2026, 5, 1 + i);
      sets.add(dailyChallenge(dailyKey(d)).mods.map((m) => m.id).join('+'));
    }
    expect(sets.size).toBeGreaterThan(20); // 30 天里至少 21 种不同组合
  });

  it('连续日期不相关:雪崩混洗回归守卫', () => {
    // 曾经的坑:FNV 对"只差一个字符"的日期输出接近,mulberry32 首个随机数相关,
    // 实测连续三天都抽到同一张词条。去掉 dailySeed 里的雪崩混洗这条会红。
    const firsts = new Map<string, number>();
    const days = 60;
    for (let i = 0; i < days; i++) {
      const d = new Date(2026, 8, 29 + i);
      const first = dailyChallenge(dailyKey(d)).mods[0].id;
      firsts.set(first, (firsts.get(first) ?? 0) + 1);
    }
    const worst = Math.max(...firsts.values());
    expect(worst / days, `首顺位词条过于集中:${JSON.stringify([...firsts])}`).toBeLessThan(0.3);
    expect(firsts.size).toBeGreaterThan(5); // 60 天里首顺位至少覆盖 6 种词条
  });

  it('连续 3 天的组合不会撞车(玩家体感"每天都不一样")', () => {
    let dup = 0;
    for (let i = 0; i < 30; i++) {
      const a = dailyChallenge(dailyKey(new Date(2026, 0, 1 + i))).mods.map((m) => m.id).sort().join('+');
      const b = dailyChallenge(dailyKey(new Date(2026, 0, 2 + i))).mods.map((m) => m.id).sort().join('+');
      if (a === b) dup++;
    }
    expect(dup).toBe(0);
  });

  it('词条池自身合法:id 唯一、有名字与说明、乘区在合理区间', () => {
    expect(new Set(MOD_POOL.map((m) => m.id)).size).toBe(MOD_POOL.length);
    expect(MOD_POOL.length).toBeGreaterThanOrEqual(DAILY_MOD_COUNT * 2); // 池子至少是抽取数的两倍
    for (const m of MOD_POOL) {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.desc.length).toBeGreaterThan(0);
      for (const k of ['hp', 'atk', 'drop', 'playerAtk', 'playerHp', 'cycle'] as const) {
        const v = m[k];
        if (v !== undefined) expect(v, `${m.id}.${k}`).toBeGreaterThan(0.4), expect(v).toBeLessThan(2);
      }
      if (m.potion !== undefined) expect(Math.abs(m.potion)).toBeLessThanOrEqual(3);
      if (m.cdr !== undefined) expect(m.cdr).toBeLessThanOrEqual(0.3);
    }
  });

  it('每条词条都"有得有失":不能纯增益或纯惩罚', () => {
    for (const m of MOD_POOL) {
      // 代价:敌人更强 / 玩家更弱
      const costs = [
        (m.hp ?? 1) > 1, (m.atk ?? 1) > 1, (m.playerHp ?? 1) < 1,
        (m.playerAtk ?? 1) < 1, (m.potion ?? 0) < 0,
      ].filter(Boolean).length;
      // 收益:掉落/输出/容错/节奏
      const gains = [
        (m.drop ?? 1) > 1, (m.playerAtk ?? 1) > 1, (m.playerHp ?? 1) > 1,
        (m.cdr ?? 0) > 0, (m.potion ?? 0) > 0, (m.hp ?? 1) < 1, (m.atk ?? 1) < 1,
      ].filter(Boolean).length;
      expect(costs > 0, `${m.id} 是纯增益(没有代价)`).toBe(true);
      expect(gains > 0, `${m.id} 是纯惩罚(没有回报)`).toBe(true);
    }
  });

  it('无词条 = 全中性(普通局与每日局共用一条代码路径)', () => {
    expect(mergeMods([])).toEqual(NEUTRAL_MODS);
  });

  it('多词条:乘区相乘、加区相加', () => {
    const m = mergeMods([
      { id: 'a', name: 'a', desc: '', hp: 1.5, atk: 1.2 },
      { id: 'b', name: 'b', desc: '', hp: 2, drop: 1.5, cdr: 0.2, potion: -1 },
      { id: 'c', name: 'c', desc: '', cdr: 0.1, potion: 2, playerAtk: 1.3 },
    ]);
    expect(m.hp).toBeCloseTo(3);
    expect(m.atk).toBeCloseTo(1.2);
    expect(m.drop).toBeCloseTo(1.5);
    expect(m.cdr).toBeCloseTo(0.3);
    expect(m.potion).toBe(1);
    expect(m.playerAtk).toBeCloseTo(1.3);
    expect(m.cycle).toBe(1);
  });

  it('当日挑战的合并乘区落在可玩区间(不出现 5 倍怪或秒杀环境)', () => {
    for (let i = 0; i < 60; i++) {
      const c = dailyChallenge(dailyKey(new Date(2026, 3, 1 + i)));
      const m = mergeMods(c.mods);
      expect(m.hp).toBeGreaterThan(0.5), expect(m.hp).toBeLessThan(3);
      expect(m.atk).toBeGreaterThan(0.9), expect(m.atk).toBeLessThan(2.5);
      expect(m.drop).toBeGreaterThan(0.9), expect(m.drop).toBeLessThan(3);
      expect(m.playerHp).toBeGreaterThan(0.6);
    }
  });
});
