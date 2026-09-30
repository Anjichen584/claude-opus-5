import { describe, expect, it } from 'vitest';
import pool from '@data/runes/pool.json';
import balance from '@data/balance.json';

const BLADE_SKILLS = ['blade_q_cleave', 'blade_e_tidestep', 'blade_r_starfall'];
const OTHER_SKILLS = [
  'ranger_q_fan', 'ranger_e_nova', 'ranger_r_storm',
  'arcanist_q_seeker', 'arcanist_e_blink', 'arcanist_r_tempest',
  'warden_q_quake', 'warden_e_charge', 'warden_r_roar',
];
const VALID_SKILLS = [...BLADE_SKILLS, ...OTHER_SKILLS];
const VALID_ELEMENTS = ['fire', 'ice', 'bolt', 'toxin'];

describe('符文池', () => {
  it('共 48 枚,id 唯一', () => {
    expect(pool.runes.length).toBe(48);
    const ids = new Set(pool.runes.map((r) => r.id));
    expect(ids.size).toBe(48);
  });

  it('全 12 技能每技能 4 枚(四职业满配)', () => {
    for (const skill of VALID_SKILLS) {
      expect(pool.runes.filter((r) => r.skill === skill).length, skill).toBe(4);
    }
  });

  it('每技能四元素全覆盖(火/冰/雷/毒各一,流派差异)', () => {
    for (const skill of VALID_SKILLS) {
      const els = pool.runes.filter((r) => r.skill === skill).map((r) => r.element);
      expect([...new Set(els)].sort(), skill).toEqual([...VALID_ELEMENTS].sort());
    }
  });

  it('字段合法:目标技能/元素/地带参数', () => {
    for (const r of pool.runes) {
      expect(VALID_SKILLS, `${r.id}.skill`).toContain(r.skill);
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.desc.length).toBeGreaterThan(0);
      if (r.element) expect(VALID_ELEMENTS, `${r.id}.element`).toContain(r.element);
      const gz = (r as { groundZone?: { radiusM: number; lifeS: number; intervalS: number; mult: number } }).groundZone;
      if (gz) {
        expect(gz.radiusM).toBeGreaterThan(0);
        expect(gz.lifeS).toBeGreaterThan(0);
        expect(gz.intervalS).toBeGreaterThan(0);
        expect(gz.mult).toBeGreaterThan(0);
        expect(gz.mult).toBeLessThanOrEqual(1); // 地带是补充伤害,不应超过技能本体
      }
    }
  });
});

describe('商店与星灯定价', () => {
  it('稀有度价格递增', () => {
    const p = balance.shop.prices;
    expect(p.epic).toBeGreaterThan(p.rare);
    expect(p.legendary).toBeGreaterThan(p.epic);
  });

  it('第三摊权重和为 1', () => {
    const w = balance.shop.thirdStandWeights;
    expect(w.rare + w.epic + w.legendary).toBeCloseTo(1);
  });

  it('星灯价格为正且低于满地图夜晚收益预期', () => {
    expect(balance.night.lanternCost).toBeGreaterThan(0);
    expect(balance.night.lanternCost).toBeLessThan(500);
  });
});
