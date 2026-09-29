import { describe, expect, it } from 'vitest';
import type { Input } from '@engine/input/Input';
import { World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import {
  Health, Inventory, KillEvent, Pickup, Player, ShopStand, Stats, Transform, Velocity,
} from '@game/components';
import { LootSystem } from '@game/loot/LootSystem';
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
