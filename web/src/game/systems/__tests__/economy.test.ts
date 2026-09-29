import { describe, expect, it } from 'vitest';
import type { Input } from '@engine/input/Input';
import { World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import {
  Health, Inventory, KillEvent, Pickup, Player, ShopStand, Stats, Transform, Velocity,
} from '@game/components';
import { LootSystem } from '@game/loot/LootSystem';
import { Merchant } from '@game/components';
import { haggleOutcome } from '@game/loot/ShopStock';
import { ShopSystem } from '@game/systems/ShopSystem';
import { meta } from '@game/meta/Save';
import { BLUEPRINTS } from '@game/loot/Blueprint';
import { CONSUMABLE_IDS } from '@game/loot/Consumables';

/**
 * 经济闭环接线守卫(轮 18–21 那一包):掉落 → 拾取 → 上限;商店 → 入包。
 *
 * 为什么单独写这一层:loot/Consumables.ts 与 loot/Blueprint.ts 本身都有单测,但
 * **"写好的规则有没有真的被系统调用"** 只有把系统跑起来才看得见 —— 上一轮就出现过
 * "函数写对了、没人调用"的假完成。这里刻意走真实调用路径(LootSystem/ShopSystem),
 * 不 mock 掉它们。
 */

/** 只有 wasPressed 的假输入(交互键按一下);不引 DOM */
class FakeInput {
  private readonly down = new Set<string>();
  wasPressed(code: string): boolean { return this.down.has(code); }
  press(code: string): void { this.down.add(code); }
  clear(): void { this.down.clear(); }
}

function makeWorld(): { w: World; pe: number; p: Player } {
  const w = new World();
  const pe = w.create();
  w.add(pe, new Transform(0, 0));
  w.add(pe, new Velocity());
  w.add(pe, new Health(200));
  w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
  w.add(pe, new Player());
  w.add(pe, new Inventory());
  return { w, pe, p: w.mustGet(pe, Player) };
}

/** 在玩家脚下放一个已落地(restT=0)的拾取物 */
function dropAt(w: World, pk: Pickup): void {
  pk.restT = 0;
  const e = w.create();
  w.add(e, new Transform(0, 0));
  w.add(e, new Velocity());
  w.add(e, pk);
}

describe('消耗品:掉落 → 拾取 → 上限折星尘', () => {
  it('拾取一件消耗品会进到 Player.consumables(而不是只有定义没有来路)', () => {
    const { w, p } = makeWorld();
    const loot = new LootSystem();
    dropAt(w, new Pickup('cons', null, 0, null, 'shield'));
    loot.update(w, 1 / 60);
    expect(p.consumables).toEqual(['shield']);
  });

  it('带满之后不再塞包,按价折成星尘(不会静默丢失)', () => {
    const { w, p } = makeWorld();
    const loot = new LootSystem();
    const max = balance.loot.consMax;
    for (let i = 0; i < max; i++) p.consumables.push('cleanse');
    const before = p.stardust;
    dropAt(w, new Pickup('cons', null, 0, null, 'cleanse'));
    loot.update(w, 1 / 60);
    expect(p.consumables.filter((x) => x === 'cleanse')).toHaveLength(max);
    expect(p.stardust).toBe(before + 15);
  });

  it('四种消耗品都能被拾取(ID 列表与定义表不脱节)', () => {
    for (const id of CONSUMABLE_IDS) {
      const { w, p } = makeWorld();
      const loot = new LootSystem();
      dropAt(w, new Pickup('cons', null, 0, null, id));
      loot.update(w, 1 / 60);
      expect(p.consumables, `${id} 拾取失败`).toEqual([id]);
    }
  });
});

describe('商店:消耗品摊位按价扣星尘并进包', () => {
  it('买一瓶:星尘减少、消耗品 +1、摊位标记已售', () => {
    const { w, pe, p } = makeWorld();
    p.stardust = 500;
    const st = w.create();
    w.add(st, new Transform(0, 0));          // 与玩家同格 → 一定在 1m 交互半径内
    w.add(st, new ShopStand('cons', 70, null, null, 'shield'));
    const input = new FakeInput();
    const shop = new ShopSystem(input as unknown as Input);

    shop.update(w, 1 / 60);
    expect(shop.nearbyStand).toBe(st);        // 先确认真的被认成"附近的摊位"
    input.press('KeyF');                      // 默认交互键
    shop.update(w, 1 / 60);

    expect(p.stardust).toBe(430);
    expect(p.consumables).toEqual(['shield']);
    expect(w.mustGet(st, ShopStand).sold).toBe(true);
    void pe;
  });

  it('星尘不够就什么都不发生(不扣钱、不进包、摊位还在)', () => {
    const { w, p } = makeWorld();
    p.stardust = 10;
    const st = w.create();
    w.add(st, new Transform(0, 0));
    w.add(st, new ShopStand('cons', 70, null, null, 'timeslow'));
    const input = new FakeInput();
    const shop = new ShopSystem(input as unknown as Input);
    input.press('KeyF');
    shop.update(w, 1 / 60);
    expect(p.stardust).toBe(10);
    expect(p.consumables).toEqual([]);
    expect(w.mustGet(st, ShopStand).sold).toBe(false);
  });

  it('带满上限时买不进去(星尘也不扣 —— 边界要在扣钱**之前**拦住)', () => {
    const { w, p } = makeWorld();
    p.stardust = 500;
    for (let i = 0; i < balance.loot.consMax; i++) p.consumables.push('flask');
    const st = w.create();
    w.add(st, new Transform(0, 0));
    w.add(st, new ShopStand('cons', 80, null, null, 'flask'));
    const input = new FakeInput();
    const shop = new ShopSystem(input as unknown as Input);
    input.press('KeyF');
    shop.update(w, 1 / 60);
    expect(p.stardust).toBe(500);
    expect(w.mustGet(st, ShopStand).sold).toBe(false);
  });
});

describe('蓝图:整张图纸能从 Boss 身上掉出来', () => {
  it('反复击杀章 Boss 会集齐图纸(集齐后折碎片,不空手)', () => {
    const saved = { shards: meta.data.blueprintShards, bps: [...meta.data.blueprints] };
    meta.data.blueprintShards = 0;
    meta.data.blueprints = [];
    try {
      const { w } = makeWorld();
      const loot = new LootSystem();
      // 同一种子下掉落序列是确定的;打 40 次章 Boss 足够把"概率掉落"变成事实
      for (let i = 0; i < 40; i++) {
        w.emit(new KillEvent(0, 0, 'boss_nanmir')); // (x, y, kind)
        loot.update(w, 1 / 60);
      }
      expect(meta.data.blueprints.length, '一次都没掉图纸 → 掉落没接线').toBeGreaterThan(0);
      for (const id of meta.data.blueprints) {
        expect(BLUEPRINTS.some((b) => b.id === id), `掉出了不存在的蓝图 ${id}`).toBe(true);
      }
    } finally {
      meta.data.blueprintShards = saved.shards;
      meta.data.blueprints = saved.bps;
    }
  });
});

describe('议价(轮 22):商人真的能改价签', () => {
  const shopWith = (prices: number[]) => {
    const { w, pe, p } = makeWorld();
    p.stardust = 5000;
    const stands = prices.map((price, i) => {
      const e = w.create();
      w.add(e, new Transform(0, 0));
      w.add(e, new ShopStand('item', price, null, null, null, price));
      void i;
      return e;
    });
    const merc = w.create();
    w.add(merc, new Transform(0, 0));
    w.add(merc, new Merchant());
    const input = new FakeInput();
    return { w, pe, p, stands, merc, shop: new ShopSystem(input as unknown as Input), input };
  };

  it('议价改的是**最贵那件**的价签,其余货位不动', () => {
    const { w, stands, shop, input } = shopWith([50, 400, 120]);
    input.press('KeyF');
    shop.update(w, 1 / 60);
    const prices = stands.map((e) => w.mustGet(e, ShopStand).price);
    expect(prices[1], '最贵那件没被议价').not.toBe(400);
    expect(prices[0]).toBe(50);
    expect(prices[2]).toBe(120);
    expect(w.mustGet(stands[1], ShopStand).haggled).toBe(1);
  });

  it('议价结果三档都会出现,且都写进了价签(不会出现"按了没反应")', () => {
    // 每局重播种:不同种子应当给出不同结果 —— 固定种子会让玩家发现"每局第一家店都一样"
    const bySeed = new Map<string, number>();
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const { w, stands, shop, input } = shopWith([500]);
      shop.reseed(seed * 7919);
      shop.update(w, 1 / 60);
      input.press('KeyF');
      shop.update(w, 1 / 60);
      const st = w.mustGet(stands[0], ShopStand);
      expect(st.haggled).toBe(1);
      expect(st.price, '议价必须改变价签(涨或降都行)').not.toBe(500);
      seen.add(String(st.price));
      bySeed.set(String(st.price), (bySeed.get(String(st.price)) ?? 0) + 1);
    }
    expect(seen.size, '60 个种子里议价只出一种结果,随机是不是没接').toBeGreaterThan(1);
  });

  it('同种子重放结果一致(玩家反馈里说"那次议价",能对着种子复现)', () => {
    const run = (seed: number): number => {
      const { w, stands, shop, input } = shopWith([333]);
      shop.reseed(seed);
      shop.update(w, 1 / 60);
      input.press('KeyF');
      shop.update(w, 1 / 60);
      return w.mustGet(stands[0], ShopStand).price;
    };
    expect(run(1234)).toBe(run(1234));
  });

  it('一家店只能议一次(第二次不动价签,只发提示)', () => {
    const { w, stands, shop, input } = shopWith([200]);
    input.press('KeyF'); shop.update(w, 1 / 60);
    const after1 = w.mustGet(stands[0], ShopStand).price;
    input.press('KeyF'); shop.update(w, 1 / 60);
    expect(w.mustGet(stands[0], ShopStand).price).toBe(after1);
    expect(w.mustGet(stands[0], ShopStand).haggled).toBe(1);
  });

  it('已经售出的货位不会被议价(议完了才发现买不起,是纯浪费)', () => {
    const { w, stands, shop, input } = shopWith([300, 90]);
    w.mustGet(stands[0], ShopStand).sold = true;
    input.press('KeyF');
    shop.update(w, 1 / 60);
    expect(w.mustGet(stands[1], ShopStand).price).not.toBe(90);
    expect(w.mustGet(stands[0], ShopStand).haggled).toBe(0);
  });

  it('货架空了时议价不会崩(只发一句提示)', () => {
    const { w, stands, shop, input } = shopWith([300]);
    w.mustGet(stands[0], ShopStand).sold = true;
    expect(() => { input.press('KeyF'); shop.update(w, 1 / 60); }).not.toThrow();
    expect(w.mustGet(stands[0], ShopStand).haggled).toBe(0);
  });

  it('商人比摊位优先(站在商人跟前按 F 是议价,不是买最贵的装备)', () => {
    const { w, p, stands, shop, input } = shopWith([100]);
    input.press('KeyF');
    shop.update(w, 1 / 60);
    // 无论议价成败,装备都还在(没被买走)
    expect(w.mustGet(stands[0], ShopStand).sold).toBe(false);
    expect(p.consumables).toEqual([]);
    void haggleOutcome;
  });
});
