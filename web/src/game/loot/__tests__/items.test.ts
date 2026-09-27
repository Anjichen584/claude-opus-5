import { describe, expect, it } from 'vitest';
import { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import affixPool from '@data/affixes/pool.json';
import { ItemFactory, RARITIES, SLOTS } from '../Items';
import type { Rarity, Slot } from '../Items';

describe('装备生成器 (docs/03-NUMBERS.md §5-6)', () => {
  it('词条数量符合稀有度规则: 白0/绿1/蓝2/紫3/橙3(+特效)', () => {
    const f = new ItemFactory(new Rng(42));
    const expected: Record<Rarity, number> = { common: 0, fine: 1, rare: 2, epic: 3, legendary: 3 };
    for (const rarity of RARITIES) {
      for (const slot of SLOTS) {
        const item = f.make(slot, rarity);
        expect(item.affixes.length, `${rarity} ${slot}`).toBeLessThanOrEqual(expected[rarity]);
        if (rarity !== 'common') expect(item.affixes.length).toBeGreaterThan(0);
        // 同一件装备词条不重复
        const ids = item.affixes.map((a) => a.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it('词条数值在对应档位范围内(绿蓝用 lo,紫橙用 hi)', () => {
    const f = new ItemFactory(new Rng(7));
    for (let i = 0; i < 200; i++) {
      const item = f.roll();
      const high = item.rarity === 'epic' || item.rarity === 'legendary';
      for (const a of item.affixes) {
        const def = affixPool.affixes.find((d) => d.id === a.id)!;
        const [lo, hi] = high ? def.hi : def.lo;
        expect(a.value).toBeGreaterThanOrEqual(lo);
        expect(a.value).toBeLessThanOrEqual(hi);
        expect(def.slots).toContain(item.slot);
      }
    }
  });

  it('基础属性数值在部位×稀有度对应区间内', () => {
    const f = new ItemFactory(new Rng(99));
    for (const slot of SLOTS) {
      RARITIES.forEach((rarity, tier) => {
        const item = f.make(slot, rarity);
        const [lo, hi] = (balance.loot.baseValues as Record<Slot, number[][]>)[slot][tier];
        expect(item.baseValue).toBeGreaterThanOrEqual(lo);
        expect(item.baseValue).toBeLessThanOrEqual(hi);
      });
    }
  });

  it('保底:连续 200 次无橙后必出橙', () => {
    const f = new ItemFactory(new Rng(1));
    f.pityCount = balance.loot.pity; // 模拟已攒满
    const item = f.roll();
    expect(item.rarity).toBe('legendary');
    expect(f.pityCount).toBe(0); // 出橙后重置
  });

  it('橙装带专属特效(有定义的部位)', () => {
    const f = new ItemFactory(new Rng(5));
    const boots = f.make('boots', 'legendary');
    expect(boots.special).toBe('emberstride');
    expect(boots.name).toBe('焰行者之靴');
    const chest = f.make('chest', 'legendary');
    expect(chest.special).toBeUndefined(); // 胸甲无特效定义,正常命名
  });

  it('同 seed 掉落序列完全一致(可复现)', () => {
    const a = new ItemFactory(new Rng(123));
    const b = new ItemFactory(new Rng(123));
    for (let i = 0; i < 50; i++) {
      const ia = a.roll();
      const ib = b.roll();
      expect(ia.name).toBe(ib.name);
      expect(ia.baseValue).toBe(ib.baseValue);
      expect(ia.affixes).toEqual(ib.affixes);
    }
  });
});
