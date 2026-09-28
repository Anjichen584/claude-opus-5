import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';

/** 数据完整性:防止新增怪/物件时漏字段(出怪工厂依赖这些字段) */
describe('balance.json 完整性', () => {
  it('所有敌人具备出怪工厂必需字段', () => {
    for (const [key, cfg] of Object.entries(balance.enemies)) {
      const c = cfg as Record<string, unknown>;
      expect(c['hp'], `${key}.hp`).toBeTypeOf('number');
      expect(c['hp'] as number, `${key}.hp>0`).toBeGreaterThan(0);
      expect(c['atk'], `${key}.atk`).toBeTypeOf('number');
      expect(c['def'], `${key}.def`).toBeTypeOf('number');
      expect(c['bodyRadius'] as number, `${key}.bodyRadius>0`).toBeGreaterThan(0);
    }
  });

  it('元素杂兵四件套齐全(四系印记全覆盖)', () => {
    expect(balance.enemies.emberimp.fireball.speedM).toBeGreaterThan(0);
    expect(balance.enemies.frostslime.split.count).toBe(2);
    expect(balance.enemies.sparklizard.dash.speedM).toBeGreaterThan(balance.enemies.sparklizard.speed);
    expect(balance.enemies.toxintoad.lob.zoneRadiusM).toBeGreaterThan(0);
  });

  it('星尘精灵奖励区间合法', () => {
    const s = balance.enemies.stardustsprite;
    expect(s.bonusMax).toBeGreaterThanOrEqual(s.bonusMin);
    expect(s.lifeS).toBeGreaterThan(3);
  });

  it('场景物件配置齐全', () => {
    for (const k of ['tree', 'rock', 'bush'] as const) {
      expect(balance.props[k].perRoomMax).toBeGreaterThanOrEqual(balance.props[k].perRoomMin);
    }
    expect(balance.props.tree.bodyRadius).toBeGreaterThan(0);
    expect(balance.props.bush.bodyRadius).toBe(0);
  });

  it('四职业配置齐全且乘区合理', () => {
    const ks = Object.keys(balance.classes);
    expect(ks.sort()).toEqual(['arcanist', 'blade', 'ranger', 'warden']);
    for (const k of ks) {
      const c = (balance.classes as Record<string, { hpMult: number; atkMult: number; speedMult: number }>)[k];
      expect(c.hpMult).toBeGreaterThan(0.5);
      expect(c.hpMult).toBeLessThan(1.6);
      expect(c.atkMult).toBeGreaterThan(0.7);
      expect(c.speedMult).toBeGreaterThan(0.7);
    }
    // 远程职业有连射配置,守卫有连击配置
    expect(balance.classes.ranger.bow.rateS).toBeGreaterThan(0);
    expect(balance.classes.arcanist.bow.rateS).toBeGreaterThan(0);
    expect(balance.classes.warden.combo.mults.length).toBe(3);
  });

  it('秘境事件参数合法', () => {
    expect(balance.events.bloodHpMult).toBeGreaterThan(0.5);
    expect(balance.events.bloodHpMult).toBeLessThan(1);
    expect(balance.events.fountainMax).toBeGreaterThan(balance.events.fountainMin);
  });

  it('波次预算与彩蛋概率在合理范围', () => {
    expect(balance.rooms.spriteChance).toBeGreaterThan(0);
    expect(balance.rooms.spriteChance).toBeLessThanOrEqual(0.5);
    expect(balance.rooms.waveBudgetBase).toBeGreaterThanOrEqual(4);
  });
});
