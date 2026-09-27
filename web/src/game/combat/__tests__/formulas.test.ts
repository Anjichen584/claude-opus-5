import { describe, expect, it } from 'vitest';
import { defenseReduction, finalDamage } from '../formulas';

describe('防御减免公式 (docs/03-NUMBERS.md §3)', () => {
  it('0 防御 = 无减免', () => {
    expect(defenseReduction(0, 1)).toBe(1);
  });

  it('def=60, lvl=1 → 1 - 60/128', () => {
    expect(defenseReduction(60, 1)).toBeCloseTo(1 - 60 / 128, 10);
  });

  it('攻击者等级越高,同防御减免越少', () => {
    expect(defenseReduction(60, 10)).toBeGreaterThan(defenseReduction(60, 1));
  });

  it('减免永远在 (0,1] 区间', () => {
    for (const def of [0, 10, 100, 10000]) {
      const r = defenseReduction(def, 1);
      expect(r).toBeGreaterThan(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});

describe('最终伤害公式', () => {
  it('基础:base × mult,取整', () => {
    expect(finalDamage(14, 1.4, false, 1.5, 1, 1)).toBe(Math.round(14 * 1.4));
  });

  it('暴击乘 critDmg', () => {
    expect(finalDamage(100, 1, true, 1.5, 1, 1)).toBe(150);
  });

  it('易伤(脆蚀 +25%)正确参与', () => {
    expect(finalDamage(100, 1, false, 1.5, 1, 1.25)).toBe(125);
  });

  it('最小伤害为 1', () => {
    expect(finalDamage(1, 0.01, false, 1.5, 0.1, 1)).toBe(1);
  });
});
