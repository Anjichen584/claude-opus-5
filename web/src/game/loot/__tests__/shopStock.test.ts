import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { Rng } from '@engine/core/Rng';
import { SLOTS, type Item, type Rarity, type Slot } from '@game/loot/Items';
import {
  haggleOutcome, hagglePrice, luckBonus, priceOf, rollRuneShelf, rollStock, type StockCtx,
} from '@game/loot/ShopStock';
import { CONSUMABLE_IDS, shopConsumables } from '@game/loot/Consumables';
import { RUNE_POOL } from '@game/skills/SkillSystem';

const S = balance.shop;
const H = S.haggle;

/**
 * 轮 22 验收:**商店不再重复单调** + 议价是可测的博弈。
 * 关注的不是"摆了几个摊"(那太脆),而是三条口径:
 * 定价真的会浮动 / 特惠真的落在一件装备上 / 议价的三档边界与幸运的作用范围。
 */

const ctxOf = (owned: string[] = []): StockCtx => ({
  klass: 'blade',
  ownedRunes: owned,
  make: (slot: Slot, rarity: Rarity) => ({ slot, rarity, name: 'x', affixes: [] } as unknown as Item),
  runes: [...RUNE_POOL.values()].filter((r) => r.skill.startsWith('blade_')),
  centerY: 9,
});

describe('定价:同一件商品不会永远是同一个价', () => {
  it('jitter 在 ±priceJitter 内,且永远 ≥1', () => {
    const rng = new Rng(1);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 400; i++) {
      const p = priceOf(100, rng);
      min = Math.min(min, p); max = Math.max(max, p);
    }
    expect(min).toBeGreaterThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(Math.round(100 * (1 - S.priceJitter)) - 1);
    expect(max).toBeLessThanOrEqual(Math.round(100 * (1 + S.priceJitter)) + 1);
    expect(max, '价格必须真的浮动(不然 jitter 是死代码)').toBeGreaterThan(min);
    expect(priceOf(1, new Rng(9))).toBeGreaterThanOrEqual(1);
  });
});

describe('货单:装备 3 摊 + 药剂 + 消耗品 + 符文货架', () => {
  const stock = (seed: number, owned: string[] = []) => rollStock(new Rng(seed), ctxOf(owned));

  it('装备固定 3 摊,稀有度是 蓝/紫/加权第三摊', () => {
    const gear = stock(7).filter((g) => g.wares === 'item');
    expect(gear).toHaveLength(3);
    expect(gear[0].item!.rarity).toBe('rare');
    expect(gear[1].item!.rarity).toBe('epic');
    expect(['rare', 'epic', 'legendary']).toContain(gear[2].item!.rarity);
    for (const g of gear) expect(SLOTS).toContain(g.item!.slot);
  });

  it('符文货架只摆**本职业未拥有**的符文,且不重复', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const shelf = stock(seed).filter((g) => g.wares === 'rune');
      expect(shelf.length).toBeLessThanOrEqual(S.shelfRunes);
      const ids = shelf.map((g) => g.runeId!);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) {
        const rune = RUNE_POOL.get(id)!;
        expect(rune.skill.startsWith('blade_'), `${id} 不是本职业符文`).toBe(true);
      }
    }
  });

  it('已拥有符文不再上架(囤满后货架空着,而不是卖重复的)', () => {
    const mine = [...RUNE_POOL.values()].filter((r) => r.skill.startsWith('blade_')).map((r) => r.id);
    const shelf = rollStock(new Rng(3), ctxOf(mine)).filter((g) => g.wares === 'rune');
    expect(shelf).toHaveLength(0);
  });

  it('消耗品摊不重复且都在 4 种之内;药剂恰 1 摊', () => {
    const st = stock(11);
    const cons = st.filter((g) => g.wares === 'cons');
    expect(cons.length).toBe(Math.min(S.consStands, CONSUMABLE_IDS.length));
    expect(new Set(cons.map((c) => c.consId)).size).toBe(cons.length);
    for (const c of cons) expect(CONSUMABLE_IDS).toContain(c.consId);
    expect(st.filter((g) => g.wares === 'potion')).toHaveLength(1);
  });

  it('特惠是**打折**且落在装备上(打折落在一瓶药上,玩家没有感知)', () => {
    let sawDeal = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const st = stock(seed);
      const deals = st.filter((g) => g.deal);
      expect(deals.length, '最多一个特惠').toBeLessThanOrEqual(1);
      for (const d of deals) {
        sawDeal++;
        expect(d.wares).toBe('item');
        expect(d.price).toBeLessThan(d.listPrice);                                  // 确实比本摊常规价便宜
        expect(d.price).toBeGreaterThanOrEqual(Math.round(d.listPrice * (1 - S.dealOff)) - 1);
      }
    }
    expect(sawDeal, `${S.dealChance} 的概率在 60 次里一次都没出,概率表可能没接上`).toBeGreaterThan(5);
  });

  it('特惠挑的是**最贵的装备**(不是随机一件)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const st = stock(seed);
      const d = st.find((g) => g.deal);
      if (!d) continue;
      const gear = st.filter((g) => g.wares === 'item');
      // 试算:如果打折落在别的货位上,那个货位的常规价必须不比这件高(即挑的就是最贵那件)
      const others = gear.filter((g) => g !== d).map((g) => g.listPrice);
      expect(d.listPrice, '特惠没落在最贵的装备上').toBeGreaterThanOrEqual(Math.max(...others));
    }
  });

  it('同一颗种子货单一致(存档重放/回滚能对上)', () => {
    expect(JSON.stringify(stock(5))).toBe(JSON.stringify(stock(5)));
  });

  it('符文栈抽样:够就给满,不够就给完(不留空洞)', () => {
    const pool = [...RUNE_POOL.values()].filter((r) => r.skill.startsWith('blade_'));
    expect(rollRuneShelf(new Rng(1), pool, [], 2)).toHaveLength(2);
    expect(rollRuneShelf(new Rng(1), pool.slice(0, 1), [], 2)).toHaveLength(1);
    expect(rollRuneShelf(new Rng(1), [], [], 2)).toHaveLength(0);
    expect(rollRuneShelf(new Rng(1), pool, pool.map((r) => r.id), 2)).toHaveLength(0);
  });

  it('摆的消耗品价格与数据表同源(不是写死的 70/60/90/80)', () => {
    const menu = shopConsumables();
    const priceOfId = new Map(menu.map((m) => [m.id, m.price]));
    for (let seed = 1; seed <= 20; seed++) {
      for (const g of stock(seed).filter((x) => x.wares === 'cons')) {
        expect(g.basePrice).toBe(priceOfId.get(g.consId!));
      }
    }
  });
});

describe('议价:三档边界 + 幸运只提高"至少小成功"', () => {
  it('三档按 bigChance / successChance 切分', () => {
    expect(H.bigChance + H.successChance + H.luckMax).toBeLessThanOrEqual(0.9 + 1e-9);
    expect(haggleOutcome(0, 0)).toBe('big');
    expect(haggleOutcome(H.bigChance - 0.001, 0)).toBe('big');
    expect(haggleOutcome(H.bigChance + 0.001, 0)).toBe('success');
    expect(haggleOutcome(H.bigChance + H.successChance - 0.001, 0)).toBe('success');
    expect(haggleOutcome(0.999, 0)).toBe('fail');
  });

  it('幸运**不**让大成功变容易(否则"幸运够了 = 议价必大成功")', () => {
    const roll = H.bigChance + 0.01;           // 无幸运时是小成功
    expect(haggleOutcome(roll, 0)).toBe('success');
    expect(haggleOutcome(roll, 999), '加满幸运也只升到小成功档').toBe('success');
  });

  it('幸运提高"至少小成功"的概率,但有上限;负幸运/NaN 当 0 处理', () => {
    expect(luckBonus(0)).toBe(0);
    expect(luckBonus(999)).toBeCloseTo(H.luckMax, 9);
    expect(luckBonus(-5)).toBe(0);
    expect(luckBonus(Number.NaN)).toBe(0);
    const edge = H.bigChance + H.successChance + H.luckMax - 0.001;  // 满幸运时才刚好够
    expect(haggleOutcome(edge, 0)).toBe('fail');
    expect(haggleOutcome(edge, 100)).toBe('success');
  });

  it('失败永远存在(不然议价就成了无脑按钮)', () => {
    for (let i = 0; i < 20; i++) {
      expect(haggleOutcome(0.999, i * 20)).toBe('fail');
    }
  });

  it('价格变更方向正确且下限 1', () => {
    expect(hagglePrice(100, 'big')).toBe(Math.round(100 * (1 - H.bigOff)));
    expect(hagglePrice(100, 'success')).toBe(Math.round(100 * (1 - H.off)));
    expect(hagglePrice(100, 'fail')).toBe(Math.round(100 * (1 + H.markup)));
    expect(hagglePrice(1, 'big')).toBeGreaterThanOrEqual(1);
    // 底价商品涨价也不能"看起来没反应"
    expect(hagglePrice(1, 'fail')).toBeGreaterThan(1);
    expect(hagglePrice(100, 'fail')).toBeGreaterThan(100);
  });
});
