import { describe, expect, it } from 'vitest';
import challenges from '@data/challenges.json';
import { Rng } from '@engine/core/Rng';
import { LAYOUT_IDS } from '@game/dungeon/RoomLayouts';
import { MOD_POOL, mergeMods, NEUTRAL_MODS, keySeed } from '../Daily';
import {
  NEUTRAL_STRUCTURE, WEEKLY_DAILY_PICKS, WEEKLY_RULES, pickForcedLayout, structureOf,
  weeklyChallenge, weeklyKey, weeklyLabel, weeklySeed, type WeeklyRule,
} from '../Weekly';

/** 把规则拆成"玩家难受的"与"玩家划算的"两栏,用于守恒断言 */
function tradeOff(rule: WeeklyRule): { bad: string[]; good: string[] } {
  const bad: string[] = [];
  const good: string[] = [];
  const push = (name: string, v: number | undefined, betterWhenUp: boolean): void => {
    if (v === undefined || v === 1) return;
    const isUp = v > 1;
    ((isUp === betterWhenUp) ? good : bad).push(`${name}=${v}`);
  };
  push('敌人生命', rule.hp, false);
  push('敌人攻击', rule.atk, false);
  push('掉落', rule.drop, true);
  push('玩家攻击', rule.playerAtk, true);
  push('玩家生命', rule.playerHp, true);
  push('周期', rule.cycle, true);
  if (rule.cdr) good.push(`冷却-${rule.cdr}`);
  if (rule.potion) (rule.potion > 0 ? good : bad).push(`药剂${rule.potion > 0 ? '+' : ''}${rule.potion}`);
  if (rule.extraWaves) bad.push(`每房+${rule.extraWaves} 波`);
  if (rule.shopClosed) bad.push('商店关门');
  if (rule.altarOff) bad.push('祭坛失效');
  if (rule.eliteShift) (rule.eliteShift < 0 ? bad : good).push('精英房位置');
  if ((rule.forcedLayouts ?? []).length > 0) bad.push('地形定死(失去多样性,可能连出窄道)');
  return { bad, good };
}

describe('周键(ISO 8601)', () => {
  it('周一为一周之始,归属看周四', () => {
    // 2026-01-01 是周四 → 属于 2026-W01
    expect(weeklyKey(new Date(2026, 0, 1))).toBe('2026-W01');
    expect(weeklyKey(new Date(2026, 0, 4))).toBe('2026-W01');
    expect(weeklyKey(new Date(2026, 0, 5))).toBe('2026-W02'); // 周一
  });

  it('跨年边界:1 月 1 日可能属于去年的最后一周', () => {
    // 2025-12-29(周一)~2026-01-04(周日)是同一 ISO 周 = 2026-W01
    expect(weeklyKey(new Date(2025, 11, 29))).toBe('2026-W01');
    expect(weeklyKey(new Date(2026, 0, 4))).toBe('2026-W01');
    // 2027-01-01 是周五 → 属于 2026-W53
    expect(weeklyKey(new Date(2027, 0, 1))).toBe('2026-W53');
    // 2026-12-31 是周四 → 2026-W53
    expect(weeklyKey(new Date(2026, 11, 31))).toBe('2026-W53');
  });

  it('同一周内每天都得到同一个键;跨周必换', () => {
    const mon = new Date(2026, 8, 28); // 周一
    for (let i = 0; i < 7; i++) {
      const d = new Date(2026, 8, 28 + i);
      expect(weeklyKey(d), `${d.toDateString()}`).toBe(weeklyKey(mon));
    }
    expect(weeklyKey(new Date(2026, 8, 28 + 7))).not.toBe(weeklyKey(mon));
  });

  it('周数永远是两位、年份四位(显示不会跳格)', () => {
    for (let i = 0; i < 400; i++) {
      const k = weeklyKey(new Date(2024, 0, 1 + i));
      expect(k).toMatch(/^\d{4}-W\d{2}$/);
      expect(weeklyLabel(k)).toMatch(/^第 \d+ 周$/);
    }
  });
});

describe('周常规则池', () => {
  it('8 条铁律,id 唯一、都有名字/描述,且与每日池 id 不撞车', () => {
    expect(WEEKLY_RULES).toHaveLength(8);
    const ids = new Set<string>();
    for (const r of WEEKLY_RULES) {
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.desc.length).toBeGreaterThan(0);
    }
    for (const m of MOD_POOL) expect(ids.has(`daily:${m.id}`), m.id).toBe(false);
    const dailyIds = new Set(MOD_POOL.map((m) => m.id));
    expect(WEEKLY_RULES.some((r) => dailyIds.has(r.id))).toBe(false);
  });

  it('铁律守恒:每条都既有代价也有好处(不许白给也不许纯恶心)', () => {
    for (const r of WEEKLY_RULES) {
      const { bad, good } = tradeOff(r);
      expect(bad.length, `${r.name} 没有代价`).toBeGreaterThan(0);
      expect(good.length, `${r.name} 没有好处`).toBeGreaterThan(0);
    }
  });

  it('结构性字段都在合法范围(运行时不留负数/垃圾地形名)', () => {
    for (const r of WEEKLY_RULES) {
      expect(Math.round(r.extraWaves ?? 0)).toBeGreaterThanOrEqual(0);
      expect(Math.round(r.extraWaves ?? 0)).toBeLessThanOrEqual(2);
      expect(Math.abs(Math.round(r.eliteShift ?? 0))).toBeLessThanOrEqual(3);
      for (const id of r.forcedLayouts ?? []) expect(LAYOUT_IDS).toContain(id);
    }
    const structural = WEEKLY_RULES.filter((r) =>
      (r.extraWaves ?? 0) > 0 || r.shopClosed === true || r.altarOff === true ||
      (r.eliteShift ?? 0) !== 0 || (r.forcedLayouts ?? []).length > 0);
    expect(structural.length, '至少一半铁律要真的改结构').toBeGreaterThanOrEqual(4);
  });

  it('数据与 challenges.json 一致(JSON 是权威)', () => {
    expect(challenges.weekly.dailyMods).toBe(WEEKLY_DAILY_PICKS);
    expect(challenges.weekly.rules.map((r) => r.id)).toEqual(WEEKLY_RULES.map((r) => r.id));
    expect(challenges.daily.mods.map((m) => m.id)).toEqual(MOD_POOL.map((m) => m.id));
  });
});

describe('每周挑战(seed → 铁律 + 词条)', () => {
  it('同周同结果,跨周换规则', () => {
    expect(weeklyChallenge('2026-W40')).toEqual(weeklyChallenge('2026-W40'));
    const a = weeklyChallenge('2026-W39');
    const b = weeklyChallenge('2026-W40');
    expect(`${a.rule.id}/${a.mods.map((m) => m.id).join(',')}`)
      .not.toBe(`${b.rule.id}/${b.mods.map((m) => m.id).join(',')}`);
  });

  it('一周 = 1 条铁律 + 2 条每日词条,共 3 条且不重复', () => {
    for (let w = 1; w <= 53; w++) {
      const key = `2026-W${String(w).padStart(2, '0')}`;
      const ch = weeklyChallenge(key);
      expect(ch.mods).toHaveLength(1 + WEEKLY_DAILY_PICKS);
      expect(ch.mods[0]).toBe(ch.rule);
      expect(new Set(ch.mods.map((m) => m.id)).size).toBe(ch.mods.length);
      // 铁律必须来自周常池,其余来自每日池
      expect(WEEKLY_RULES.map((r) => r.id)).toContain(ch.mods[0].id);
      for (const m of ch.mods.slice(1)) expect(MOD_POOL.map((d) => d.id)).toContain(m.id);
    }
  });

  it('52 周里每条铁律都会轮到,且没有某条霸屏', () => {
    const seen = new Map<string, number>();
    for (let w = 1; w <= 52; w++) {
      const id = weeklyChallenge(`2026-W${String(w).padStart(2, '0')}`).rule.id;
      seen.set(id, (seen.get(id) ?? 0) + 1);
    }
    for (const r of WEEKLY_RULES) expect(seen.get(r.id) ?? 0, `${r.name} 一年都没抽到`).toBeGreaterThan(0);
    // 8 条均抽,一年 52 次,单条超过 20 次就说明分布坏了
    for (const [id, n] of seen) expect(n, id).toBeLessThan(20);
  });

  it('乘区 = 铁律 × 2 条词条(合并规则与每日一致)', () => {
    const ch = weeklyChallenge('2026-W40');
    expect(ch.eff).toEqual(mergeMods(ch.mods));
    expect(ch.eff).not.toEqual(NEUTRAL_MODS);
  });

  it('structure 只翻译铁律的结构字段,并抽定地形', () => {
    for (let w = 1; w <= 26; w++) {
      const ch = weeklyChallenge(`2026-W${String(w).padStart(2, '0')}`);
      expect(ch.structure.extraWaves).toBe(Math.max(0, Math.round(ch.rule.extraWaves ?? 0)));
      expect(ch.structure.shopClosed).toBe(ch.rule.shopClosed === true);
      expect(ch.structure.altarOff).toBe(ch.rule.altarOff === true);
      expect(ch.structure.eliteShift).toBe(ch.rule.eliteShift ?? 0);
      const layouts = ch.rule.forcedLayouts ?? [];
      if (layouts.length === 0) expect(ch.structure.forcedLayout).toBeNull();
      else expect(layouts).toContain(ch.structure.forcedLayout!);
    }
  });

  it('地形抽签:限定清单里的每种都会被抽到,且不是永远第一个', () => {
    const rule = WEEKLY_RULES.find((r) => (r.forcedLayouts ?? []).length > 0)!;
    const rng = new Rng(7);
    const picks = new Set<string>();
    for (let i = 0; i < 200; i++) picks.add(pickForcedLayout(rule, rng)!);
    expect(picks.size).toBe(rule.forcedLayouts!.length);
    expect(pickForcedLayout({ id: 'x', name: 'x', desc: 'x' }, new Rng(1))).toBeNull();
  });

  it('非铁律规则 → 全中性结构(每日局与普通局共用同一条代码路径)', () => {
    const st = structureOf({ id: 'plain', name: '素', desc: '无' }, null);
    expect(st).toEqual(NEUTRAL_STRUCTURE);
  });

  it('seed 与每日共用散列(同一字符串 → 同一 seed)', () => {
    expect(weeklySeed('2026-W40')).toBe(keySeed('2026-W40'));
    expect(weeklySeed('2026-W40')).not.toBe(weeklySeed('2026-W41'));
  });
});
