import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { altarCost, scaleAtk, scaleHp } from '../Scaling';

describe('深度缩放', () => {
  it('深度 0 白天 = 原值', () => {
    expect(scaleHp(100, 0, false)).toBe(100);
    expect(scaleAtk(10, 0, false)).toBe(10);
  });

  it('深度越深血攻越高(1.06^d / 1.04^d)', () => {
    expect(scaleHp(100, 4, false)).toBe(Math.round(100 * Math.pow(balance.scalingPerDepth.hp, 4)));
    expect(scaleAtk(10, 4, false)).toBe(Math.round(10 * Math.pow(balance.scalingPerDepth.atk, 4)));
    expect(scaleHp(100, 8, false)).toBeGreaterThan(scaleHp(100, 4, false));
  });

  it('夜晚额外乘 1.25 血 / 1.15 攻', () => {
    expect(scaleHp(100, 0, true)).toBe(Math.round(100 * balance.night.hpMult));
    expect(scaleAtk(100, 0, true)).toBe(Math.round(100 * balance.night.atkMult));
  });
});

describe('祭坛升级费用', () => {
  it('50 × 1.6^lvl 递增', () => {
    expect(altarCost(0)).toBe(50);
    expect(altarCost(1)).toBe(80);
    expect(altarCost(2)).toBe(128);
  });

  it('单调递增', () => {
    for (let i = 0; i < 9; i++) expect(altarCost(i + 1)).toBeGreaterThan(altarCost(i));
  });
});
