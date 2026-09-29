import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import {
  CONSUMABLE_IDS, FLASK_CHARGE_MAX, absorbDamage, applyFlask, applyShield, cleanse,
  consumableDefs, shopConsumables, shieldCap, slowFactor, tickFlask, tickShield,
} from '@game/loot/Consumables';

const C = balance.consumables;

/**
 * 轮 21 验收:**四种消耗品各有边界与反制**。
 * 这一套的重点不是"效果生效"(那太容易),而是**边界**:
 * 护盾不叠加、净化清不完、时缓对 Boss 打折、元素瓶不能无限续杯。
 */
describe('消耗品清单(4 种,商店可列)', () => {
  it('四种都在,价格为正,商店顺序按价格稳定排序', () => {
    expect(CONSUMABLE_IDS).toHaveLength(4);
    const defs = consumableDefs();
    for (const d of defs) {
      expect(d.price, `${d.id} 价格应 > 0`).toBeGreaterThan(0);
      expect(d.name.length).toBeGreaterThan(0);
    }
    const shop = shopConsumables();
    for (let i = 1; i < shop.length; i++) expect(shop[i].price).toBeGreaterThanOrEqual(shop[i - 1].price);
  });
});

describe('护盾(星壳药剂):不叠加,只刷新到上限', () => {
  it('吸收量 = 生命上限 × capPct,且有下限 1(残血时不至于给出 0 盾)', () => {
    expect(shieldCap(1000)).toBe(Math.round(1000 * C.shield.capPct));
    expect(shieldCap(1)).toBe(1);
  });

  it('**连喝两瓶不会叠厚**(反制:不能屯药硬吃大招)', () => {
    const first = applyShield(null, 1000);
    const second = applyShield(first, 1000);
    expect(second.amount).toBe(first.amount);
  });

  it('先吃盾再掉血;盾刚好破时**多出的伤害照常进血**', () => {
    const s = applyShield(null, 1000);
    const [left1, s1] = absorbDamage(s, 10);
    expect(left1).toBe(0);
    expect(s1!.amount).toBe(s.amount - 10);
    const [left2, s2] = absorbDamage(s1, s.amount);   // 这一下会把盾打穿
    expect(left2).toBe(10);
    expect(s2).toBeNull();
  });

  it('盾到期就消失(计时归零即 null),不会留一个 0 盾的僵尸状态', () => {
    let s = applyShield(null, 1000);
    s = tickShield(s, C.shield.durS - 0.1)!;
    expect(s).toBeTruthy();
    expect(tickShield(s, 0.2)).toBeNull();
    expect(tickShield(null, 1)).toBeNull();
  });
});

describe('净化(净澈露):一次清不完,但给一小段无敌', () => {
  it('异常少于上限时全清;多于上限时**只清上限个**', () => {
    expect(cleanse({ count: 1 }).removed).toBe(1);
    expect(cleanse({ count: C.cleanse.debuffMax }).removed).toBe(C.cleanse.debuffMax);
    expect(cleanse({ count: 99 }).removed).toBe(C.cleanse.debuffMax);
    expect(cleanse({ count: 0 }).removed).toBe(0);
  });

  it('无敌帧是"很短"的:不该超过一次翻滚的无敌时间', () => {
    const res = cleanse({ count: 2 });
    expect(res.iframes).toBeGreaterThan(0);
    // 口径:无敌应与"一次翻滚"同量级 —— 明显更长就等于免费豁免大招,明显更短则这个道具救不了命
    expect(res.iframes, '净化给的无敌不该显著长于翻滚').toBeLessThan(2 * balance.player.dash.duration);
    expect(res.iframes, '太短就救不了命').toBeGreaterThanOrEqual(0.5 * balance.player.dash.duration);
  });

  it('身上没异常也能喝(不报错,只是白喝)', () => {
    expect(() => cleanse({ count: 0 })).not.toThrow();
  });
});

describe('时缓(滞时砂):普通敌人全效,Boss 打折(反制:冻不住 Boss)', () => {
  it('三档目标中,普通全效、Boss 明显更弱', () => {
    const normal = slowFactor({ tier: 'normal' });
    const elite = slowFactor({ tier: 'elite' });
    const boss = slowFactor({ tier: 'boss' });
    expect(normal).toBe(C.timeslow.slowPct);
    expect(boss).toBeCloseTo(C.timeslow.slowPct * C.timeslow.bossFactor, 6);
    expect(boss, 'Boss 必须被冻得比小怪轻').toBeLessThan(normal);
    expect(boss, '但也不能完全免疫(否则这个道具对 Boss 战毫无意义)').toBeGreaterThan(0);
    expect(elite).toBeGreaterThanOrEqual(boss);
    expect(normal, '减速不该超过 100%').toBeLessThanOrEqual(1);
  });
});

describe('元素瓶:覆盖不叠加,且有时限', () => {
  it('喝第二次只是刷新时间,不会变成两层', () => {
    const a = applyFlask(null);
    const b = applyFlask(a);
    expect(b.element).toBe(a.element);
    expect(b.t).toBe(a.t);
    expect(FLASK_CHARGE_MAX).toBeGreaterThanOrEqual(1);
  });

  it('到期即失效(不会永久附魔)', () => {
    let f = applyFlask(null);
    f = tickFlask(f, C.flask.elementS - 0.1)!;
    expect(f).toBeTruthy();
    expect(tickFlask(f, 0.2)).toBeNull();
  });

  it('附魔的元素是数据里那个(不是写死在代码里的)', () => {
    expect(applyFlask(null).element).toBe(C.flask.element);
  });
});
