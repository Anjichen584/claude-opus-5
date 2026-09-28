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
  it('共 18 枚,id 唯一', () => {
    expect(pool.runes.length).toBe(18);
    const ids = new Set(pool.runes.map((r) => r.id));
    expect(ids.size).toBe(18);
  });

  it('剑士每技能 3 枚;其余职业每技能 1 枚(首发)', () => {
    for (const skill of BLADE_SKILLS) {
      expect(pool.runes.filter((r) => r.skill === skill).length).toBe(3);
    }
    for (const skill of OTHER_SKILLS) {
      expect(pool.runes.filter((r) => r.skill === skill).length).toBe(1);
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
