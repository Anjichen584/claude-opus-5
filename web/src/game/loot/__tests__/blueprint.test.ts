import { describe, expect, it } from 'vitest';
import { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import {
  BLUEPRINTS, blockerText, blueprintOf, blueprintProblems, canCraft, canReforge, craft,
  craftBlocker, reforge, reforgeBlocker, type CraftCtx,
} from '@game/loot/Blueprint';
import { ItemFactory, SLOTS, type Item } from '@game/loot/Items';

const BP = balance.blueprint;
const f = () => new ItemFactory(new Rng(7));
const ctx = (o: Partial<CraftCtx> = {}): CraftCtx => ({
  shards: 99, owned: BLUEPRINTS.map((b) => b.id), inventorySize: 0, inventoryMax: balance.loot.invSize, ...o,
});

/**
 * 轮 20 验收:**图纸掉落 → 铸造 → 重铸**闭环 + 存档字段。
 * 重点在边界:碎片不够 / 没图纸 / 背包满 —— 这三条是菜单里最容易被点出来的 bug。
 */
describe('蓝图清单(6 张,数据自洽)', () => {
  it('6 张,id 唯一,且自检零问题(特效部位/词条适用性都对得上)', () => {
    expect(BLUEPRINTS).toHaveLength(6);
    expect(new Set(BLUEPRINTS.map((b) => b.id)).size).toBe(6);
    expect(blueprintProblems()).toEqual([]);
  });

  it('每张蓝图的部位都是合法部位,且覆盖到多个部位(不是 6 张全武器)', () => {
    for (const b of BLUEPRINTS) expect(SLOTS).toContain(b.slot);
    expect(new Set(BLUEPRINTS.map((b) => b.slot)).size).toBeGreaterThanOrEqual(5);
  });

  it('找不到的蓝图 id 会明确报"找不到",不是静默失败', () => {
    expect(blueprintOf('bp_不存在')).toBeUndefined();
    expect(craftBlocker('bp_不存在', ctx())).toBe('unknown');
    expect(blockerText('unknown', 'bp_不存在')).toContain('找不到');
  });
});

describe('铸造:扣碎片 → 出指定特效 + 固定词条', () => {
  it('铸造成功后碎片减少、装备带蓝图指定的特效与词条', () => {
    const bp = BLUEPRINTS[0];
    const c = ctx({ shards: bp.costShards + 3, inventorySize: 0 });
    const item = craft(bp.id, c, new Rng(3), (slot, rarity) => f().make(slot, rarity));
    expect(item, '碎片够 + 有图纸 → 该造出来').toBeTruthy();
    expect(c.shards).toBe(3);                       // 只扣这张图纸的价
    expect(item!.slot).toBe(bp.slot);
    expect(item!.special).toBe(bp.special);         // 必定带指定特效(不是随机)
    expect(item!.rarity).toBe(bp.rarity);
    expect(item!.affixes.map((a) => a.id).sort()).toEqual([...bp.affixes].sort());
  });

  it('碎片不够 / 背包满 / 没图纸:三条边界各自挡住,且不扣钱', () => {
    const bp = BLUEPRINTS[1];
    const poor = ctx({ shards: bp.costShards - 1 });
    expect(craftBlocker(bp.id, poor)).toBe('shards');
    expect(craft(bp.id, poor, new Rng(1), (s, r) => f().make(s, r))).toBeNull();
    expect(poor.shards).toBe(bp.costShards - 1);

    const full = ctx({ inventorySize: balance.loot.invSize });
    expect(craftBlocker(bp.id, full)).toBe('bagFull');

    const missing = ctx({ owned: [] });
    expect(canCraft(bp.id, missing)).toBe(false);
  });

  it('图纸**不消耗**:同一张蓝图可以重复铸造(存档里 owned 只增不减)', () => {
    const bp = BLUEPRINTS[2];
    const c = ctx({ shards: bp.costShards * 2 });
    const rng = new Rng(11);
    expect(craft(bp.id, c, rng, (s, r) => f().make(s, r))).toBeTruthy();
    expect(c.owned).toContain(bp.id);
    expect(craft(bp.id, c, rng, (s, r) => f().make(s, r))).toBeTruthy();
    expect(c.shards).toBe(0);
  });
});

describe('重铸:只洗词条,基底/稀有度/特效不动', () => {
  const item = (): Item => f().make('weapon', 'epic');

  it('买不到/没词条就洗不了(边界)', () => {
    expect(reforgeBlocker(null, { stardust: 999 })).toBe('noItem');
    const bare: Item = { ...item(), affixes: [] };
    expect(reforgeBlocker(bare, { stardust: 999 })).toBe('noAffix');
    expect(reforgeBlocker(item(), { stardust: BP.reforgeCost - 1 })).toBe('stardust');
    expect(canReforge(item(), { stardust: BP.reforgeCost })).toBe(true);
  });

  it('重铸扣星尘,基底/稀有度/特效/词条**条数**都不变,且至少留一条原样', () => {
    const it0 = item();
    const c = { stardust: BP.reforgeCost + 5 };
    const out = reforge(it0, c, new Rng(5));
    expect(out).toBeTruthy();
    expect(c.stardust).toBe(5);
    expect(out!.slot).toBe(it0.slot);
    expect(out!.rarity).toBe(it0.rarity);
    expect(out!.special).toBe(it0.special);
    expect(out!.affixes).toHaveLength(it0.affixes.length);

    // 至少留一条:最多重掷 reforgeRerollMax 条,而条数 ≥2 时总有没被抽中的
    const changed = out!.affixes.filter((a, i) => a.value !== it0.affixes[i].value).length;
    expect(changed, '重掷条数不该超过上限').toBeLessThanOrEqual(BP.reforgeRerollMax);
    if (it0.affixes.length > 1) {
      const same = out!.affixes.filter((a, i) => a.value === it0.affixes[i].value && a.id === it0.affixes[i].id).length;
      expect(same, '总要留至少一条不动的锚').toBeGreaterThanOrEqual(1);
    }
  });

  it('原对象不被改(菜单里要能"确定/取消"对比)', () => {
    const it0 = item();
    const snapshot = JSON.stringify(it0);
    reforge(it0, { stardust: 999 }, new Rng(13));
    expect(JSON.stringify(it0)).toBe(snapshot);
  });

  it('同种子重铸结果可复现(存档重放/回滚能对得上)', () => {
    const a = reforge(item(), { stardust: 999 }, new Rng(77));
    const b = reforge(item(), { stardust: 999 }, new Rng(77));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
