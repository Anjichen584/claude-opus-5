import { describe, expect, it } from 'vitest';
import { Rng } from '@engine/core/Rng';
import {
  AFFIX_DEFS, FULL_HP_RATIO, LOW_HP_RATIO, affixKindOf, condKeyOf, condMet, effectiveFaces,
  faceScore, type AffixContext,
} from '@game/loot/AffixRules';
import { ItemFactory, SLOTS } from '@game/loot/Items';

const ctx = (o: Partial<AffixContext> = {}): AffixContext => ({
  hpRatio: 1, isNight: false, bossNearby: false, moving: false, ...o,
});

/**
 * 轮 18 验收:词条池 8 → 24(含负面词条与条件词条)。
 * 三条主线:**池子结构自检**、**生成器真的产出负面/条件面**、**条件与负面在属性里算对**。
 */
describe('词条池结构(24 条 / 三类)', () => {
  it('总数 24,三类都有且数量对得上', () => {
    expect(AFFIX_DEFS).toHaveLength(24);
    const by = { normal: 0, tradeoff: 0, conditional: 0 } as Record<string, number>;
    for (const d of AFFIX_DEFS) by[affixKindOf(d)]++;
    expect(by).toEqual({ normal: 14, tradeoff: 5, conditional: 5 });
  });

  it('每条都长在正确的形状上(区间合法 / 部位非空 / id 唯一)', () => {
    const ids = new Set<string>();
    for (const d of AFFIX_DEFS) {
      expect(ids.has(d.id), `${d.id} 重复`).toBe(false);
      ids.add(d.id);
      expect(d.slots.length, `${d.id} 没有适用部位`).toBeGreaterThan(0);
      expect(d.lo[0], `${d.id} lo 下界应 ≤ 上界`).toBeLessThanOrEqual(d.lo[1]);
      expect(d.hi[0], `${d.id} hi 下界应 ≤ 上界`).toBeLessThanOrEqual(d.hi[1]);
      expect(d.hi[0], `${d.id} 高档区间应不低于低档`).toBeGreaterThanOrEqual(d.lo[0]);
      // 负数值不能在"加成区间"里混着写(那会让生成器掷出负数)
      expect(d.lo[0], `${d.id} 加成区间必须是正的`).toBeGreaterThan(0);
    }
  });

  it('tradeoff 必须带负面面,且负面也是正数区间(符号由代码决定,不靠数据写负号)', () => {
    const trades = AFFIX_DEFS.filter((d) => affixKindOf(d) === 'tradeoff');
    expect(trades).toHaveLength(5);
    for (const d of trades) {
      expect(d.neg, `${d.id} 是 tradeoff 却没有 neg`).toBeTruthy();
      expect(d.neg!.lo[0]).toBeGreaterThan(0);
      expect(d.neg!.lo[0]).toBeLessThanOrEqual(d.neg!.lo[1]);
      // 取舍要成立:正面与负面不能是同一个 stat(否则等于自己减自己)
      expect(d.neg!.stat, `${d.id} 的代价与加成同属一个属性`).not.toBe(d.stat);
      expect(d.neg!.stat, `${d.id} 的代价属性与自身定义重复`).not.toBe(d.id);
    }
  });

  it('conditional 必须带已知的条件 id', () => {
    const conds = AFFIX_DEFS.filter((d) => affixKindOf(d) === 'conditional').map((d) => d.cond);
    expect(new Set(conds)).toEqual(new Set(['lowHp', 'night', 'boss', 'fullHp', 'poised']));
    for (const d of AFFIX_DEFS.filter((x) => affixKindOf(x) === 'conditional')) {
      expect(d.cond, `${d.id} 缺 cond`).toBeTruthy();
      expect(d.neg, `${d.id} 是条件词条,不该同时带负面`).toBeFalsy();
    }
  });

  it('每个部位都有足够多的词条可选(不会出现"这个部位永远只有一条")', () => {
    for (const slot of SLOTS) {
      const pool = AFFIX_DEFS.filter((d) => d.slots.includes(slot));
      expect(pool.length, `${slot} 词条池太小`).toBeGreaterThanOrEqual(6);
    }
  });
});

describe('条件判定与局面指纹', () => {
  it('五个条件各自成立/不成立', () => {
    expect(condMet('lowHp', ctx({ hpRatio: LOW_HP_RATIO }))).toBe(true);
    expect(condMet('lowHp', ctx({ hpRatio: LOW_HP_RATIO + 0.01 }))).toBe(false);
    expect(condMet('night', ctx({ isNight: true }))).toBe(true);
    expect(condMet('boss', ctx({ bossNearby: true }))).toBe(true);
    expect(condMet('fullHp', ctx({ hpRatio: FULL_HP_RATIO }))).toBe(true);
    expect(condMet('fullHp', ctx({ hpRatio: 0.9 }))).toBe(false);
    expect(condMet('poised', ctx({ moving: false }))).toBe(true);
    expect(condMet('poised', ctx({ moving: true }))).toBe(false);
  });

  it('指纹只在局面翻转时变化(否则每帧都在重算属性)', () => {
    // 基线取"半血 + 白天 + 无 Boss + 移动中"——**不能取满血**,满血本身就是一个条件位(无瑕)
    const base = ctx({ hpRatio: 0.6, moving: true });
    const a = condKeyOf(base);
    expect(condKeyOf(ctx({ hpRatio: 0.6, moving: true }))).toBe(a);   // 同一局面 → 同一指纹
    expect(condKeyOf(ctx({ hpRatio: 0.9, moving: true }))).toBe(a);   // 血量变了但没跨阈值 → 不变
    expect(condKeyOf(ctx({ hpRatio: 1, moving: true }))).not.toBe(a); // 回到满血 → 无瑕生效
    expect(condKeyOf(ctx({ hpRatio: 0.1, moving: true }))).not.toBe(a); // 跨过低血阈值 → 背水生效
    expect(condKeyOf(ctx({ isNight: true }))).not.toBe(a);
    expect(condKeyOf(ctx({ moving: true }))).not.toBe(a);
  });
});

describe('生效面(加成 / 代价 / 条件)', () => {
  it('tradeoff:不满足条件时也**代价照算**,加成照给', () => {
    const faces = effectiveFaces(
      [{ stat: 'atkPct', name: '狂血', value: 18, suffix: '%', neg: { stat: 'hpPct', name: '生命', value: 8, suffix: '%' } }],
      ctx(),
    );
    expect(faces.map((f) => [f.stat, f.side, f.value])).toEqual([['atkPct', 'plus', 18], ['hpPct', 'minus', 8]]);
    expect(faceScore(faces)).toBe(10);
  });

  it('conditional:条件不满足 → 加成面消失,**代价(null)不算**', () => {
    const roll = { stat: 'atkPct', name: '背水', value: 25, suffix: '%', cond: 'lowHp' as const };
    expect(effectiveFaces([roll], ctx({ hpRatio: 0.9 }))).toEqual([]);
    expect(effectiveFaces([roll], ctx({ hpRatio: 0.2 }))).toHaveLength(1);
    expect(faceScore(effectiveFaces([roll], ctx({ hpRatio: 0.2 })))).toBe(25);
  });

  it('夜间词条跟着昼夜走(同一个物品在不同局面给不同属性)', () => {
    const roll = { stat: 'atkPct', name: '夜行', value: 14, suffix: '%', cond: 'night' as const };
    expect(effectiveFaces([roll], ctx({ isNight: false }))).toHaveLength(0);
    expect(effectiveFaces([roll], ctx({ isNight: true }))).toHaveLength(1);
  });
});

describe('生成器:24 条池子里真的掷得出负面与条件词条', () => {
  it('高稀有度装备上能同时看到加成与代价(不是只掷加成面)', () => {
    const f = new ItemFactory(new Rng(9));
    let sawTradeoff = false;
    let sawConditional = false;
    for (let i = 0; i < 400 && !(sawTradeoff && sawConditional); i++) {
      const item = f.make('weapon', 'legendary');
      for (const a of item.affixes) {
        if (a.neg) { sawTradeoff = true; expect(a.neg.value).toBeGreaterThan(0); }
        if (a.cond) sawConditional = true;
      }
    }
    expect(sawTradeoff, '掷不出 tradeoff = 池子里那 5 条是死的').toBe(true);
    expect(sawConditional, '掷不出 conditional = 池子里那 5 条是死的').toBe(true);
  });

  it('同一件装备不会重复同一条词条', () => {
    const f = new ItemFactory(new Rng(31));
    for (let i = 0; i < 200; i++) {
      const item = f.make(SLOTS[i % SLOTS.length], 'legendary');
      const ids = item.affixes.map((a) => a.id);
      expect(new Set(ids).size, `${ids.join(',')} 有重复`).toBe(ids.length);
    }
  });
});
