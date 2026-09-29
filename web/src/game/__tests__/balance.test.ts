import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { SLOT_COUNT } from '@game/meta/Save';

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

  it('三章配置:难度/收益/解锁条件严格递进', () => {
    const cs = [balance.chapters['1'], balance.chapters['2'], balance.chapters['3']];
    for (let i = 1; i < cs.length; i++) {
      expect(cs[i].statMult).toBeGreaterThan(cs[i - 1].statMult);
      expect(cs[i].lootMult).toBeGreaterThan(cs[i - 1].lootMult);
      expect(cs[i].lanternCost).toBeGreaterThan(cs[i - 1].lanternCost);
      expect(cs[i].unlockClears).toBeGreaterThan(cs[i - 1].unlockClears);
    }
  });

  it('三 Boss 血量递进,均有三阶段', () => {
    const bosses = [balance.boss.nanmir.hp, balance.enemies.boss_velsha.hp, balance.enemies.boss_kazra.hp];
    expect(bosses[1]).toBeGreaterThan(bosses[0]);
    expect(bosses[2]).toBeGreaterThan(bosses[1]);
    expect(balance.enemies.boss_kazra.phase2At).toBeGreaterThan(balance.enemies.boss_kazra.phase3At);
    expect(balance.enemies.boss_kazra.burrow.dives).toBeGreaterThan(0);
  });

  it('第二章 Boss 薇尔莎三阶段配置', () => {
    const b = balance.enemies.boss_velsha;
    expect(b.phase2At).toBeGreaterThan(b.phase3At);
    expect(b.volley.count).toBeGreaterThanOrEqual(6);
    expect(b.summon.count).toBeGreaterThan(0);
  });

  it('图纸系统参数合法', () => {
    expect(balance.blueprint.craftCost).toBeGreaterThan(0);
    expect(balance.blueprint.shardsPerBoss).toBeGreaterThan(0);
    expect(balance.blueprint.nightBonus).toBeGreaterThanOrEqual(0);
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

describe('新手引导数据(balance.tutorial)', () => {
  const T = balance.tutorial;
  it('步骤 id 唯一且齐全(顺序即引导顺序)', () => {
    const ids = T.steps.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['move', 'dash', 'skill', 'bag', 'altar']);
  });
  it('展示参数在合理区间(hintY 要在屏幕内,否则提示条画到屏幕外)', () => {
    expect(T.hintY).toBeGreaterThan(0.5);
    expect(T.hintY).toBeLessThan(1);
    expect(T.moveM).toBeGreaterThan(0);
    expect(T.saveSlots).toBe(3);
    expect(T.skipKey).toMatch(/^Key[A-Z]$/);
  });
  it('槽数与 SLOT_COUNT 一致(两处不一致会写出第三个槽或者丢档)', () => {
    expect(T.saveSlots).toBe(SLOT_COUNT);
  });
});
