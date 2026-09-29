import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import {
  SPECIAL_DEFS, comboRangeMult, damageTakenMult, dashLeavesFire, hitDamageMult, killHeal,
  reflectOnHurt, slotsWithoutSpecial, specialDef, specialsForSlot, statMods, strikeElement,
} from '@game/loot/Specials';
import { SLOTS } from '@game/loot/Items';

/**
 * 轮 19 验收:**9 个特效各有可测行为**。
 * 这里刻意不测"文案好不好看",只测规则 —— 每个特效至少一条断言,
 * 而且都从**空特效**那一侧对照(没有这个特效时结果必须回到中性)。
 */
describe('特效清单(9 个,每部位 ≥1)', () => {
  it('总数 9 且覆盖全部 6 个部位,没有空部位', () => {
    expect(SPECIAL_DEFS).toHaveLength(9);
    expect(slotsWithoutSpecial()).toEqual([]);
    for (const s of SLOTS) expect(specialsForSlot(s).length, `${s} 没有特效`).toBeGreaterThanOrEqual(1);
  });

  it('id / 名称 / 部位都不重复且**与部位自洽**', () => {
    const ids = new Set(SPECIAL_DEFS.map((s) => s.id));
    expect(ids.size).toBe(SPECIAL_DEFS.length);
    for (const s of SPECIAL_DEFS) {
      expect(slotsForCheck(s.id), `${s.id} 的部位与 SLOTS 不符`).toContain(s.slot);
      expect(s.itemName.length).toBeGreaterThan(0);
      expect(s.desc.length, `${s.id} 没有描述`).toBeGreaterThan(0);
    }
  });
});

const slotsForCheck = (id: string) => SLOTS.filter((s) => specialsForSlot(s).some((x) => x.id === id));

describe('九个特效的规则(每个都有可测行为)', () => {
  it('回响之戒:每第 N 次命中 ×echoMult,其余次数不变(计数从 1 起)', () => {
    const S = ['echo_ring'];
    const every = balance.specials.echoEvery;
    expect(hitDamageMult(S, 1)).toBe(1);
    for (let i = 1; i < every; i++) expect(hitDamageMult(S, i), `第 ${i} 击不该翻倍`).toBe(1);
    expect(hitDamageMult(S, every)).toBe(balance.specials.echoMult);
    expect(hitDamageMult(S, every * 2)).toBe(balance.specials.echoMult);   // 第 10 击也翻倍
    expect(hitDamageMult(S, 0), '没有计数信息时按不触发处理').toBe(1);
    expect(hitDamageMult([], every), '没这件装备就是中性').toBe(1);
  });

  it('霜咬:无元素命中补冰;**已有元素不抢**(不打断玩家的元素连锁)', () => {
    const S = ['frostfang'];
    expect(strikeElement(S, null)).toEqual({ element: balance.specials.frostfangElement, marks: balance.specials.frostfangMarks });
    expect(strikeElement(S, 'fire'), '已经在铺火就不能被冰抢走').toEqual({ element: 'fire', marks: 0 });
    expect(strikeElement([], null)).toEqual({ element: null, marks: 0 });
  });

  it('噬魂坠:击杀回复,没这件装备回 0(而不是 undefined/NaN)', () => {
    expect(killHeal(['soulfeast'])).toBe(balance.specials.soulfeastHeal);
    expect(killHeal([])).toBe(0);
    expect(Number.isFinite(killHeal([]))).toBe(true);
  });

  it('怒涛之刃:**只有终结段**放大范围,前两段不变', () => {
    const S = ['tempest'];
    expect(comboRangeMult(S, false)).toBe(1);
    expect(comboRangeMult(S, true)).toBe(balance.specials.tempestRangeMult);
    expect(comboRangeMult([], true), '没这件装备就是中性').toBe(1);
  });

  it('磐石胸甲:低血减伤,满血不减;是乘区不是免疫(仍会掉血)', () => {
    const S = ['stoneheart'];
    const low = balance.specials.stoneheartThreshold - 0.01;
    expect(damageTakenMult(S, low)).toBeCloseTo(1 - balance.specials.stoneheartReduce, 6);
    expect(damageTakenMult(S, balance.specials.stoneheartThreshold + 0.01)).toBe(1);
    expect(damageTakenMult(S, low) * 100, '减伤后仍要掉血').toBeGreaterThan(0);
    expect(damageTakenMult([], low)).toBe(1);
  });

  it('棘刺胸甲:反伤按比例且有上限(没有上限会一次清场)', () => {
    const S = ['thornmail'];
    const frac = balance.specials.thornFrac;
    expect(reflectOnHurt(S, 40), '未触顶时按比例').toBe(Math.round(40 * frac));
    expect(reflectOnHurt(S, 100), '触顶时截断(100×0.25=25 > 上限 20)').toBe(balance.specials.thornCap);
    expect(reflectOnHurt(S, 1e9), '超出上限就截断').toBe(balance.specials.thornCap);
    expect(reflectOnHurt(S, 0)).toBe(0);
    expect(reflectOnHurt(S, -5), '负伤害不该变成治疗').toBe(0);
    expect(reflectOnHurt([], 100)).toBe(0);
  });

  it('猎风兜帽:移动中 +攻;星陨兜帽:受击窗口内 +攻,窗口过了就没了', () => {
    const wh = ['windhood'];
    expect(statMods(wh, { moving: true, sinceHurtS: Infinity }).atkPct).toBe(balance.specials.windhoodAtkPct);
    expect(statMods(wh, { moving: false, sinceHurtS: Infinity }).atkPct).toBe(0);

    const sh = ['starhelm'];
    expect(statMods(sh, { moving: false, sinceHurtS: 0.5 }).atkPct).toBe(balance.specials.starhelmAtkPct);
    expect(statMods(sh, { moving: false, sinceHurtS: balance.specials.starhelmWindowS + 0.1 }).atkPct).toBe(0);
    expect(statMods([], { moving: true, sinceHurtS: 0 }).atkPct).toBe(0);
  });

  it('焰行者之靴:翻滚留火(布尔口径,规则本身只有"有没有")', () => {
    expect(dashLeavesFire(['emberstride'])).toBe(true);
    expect(dashLeavesFire([])).toBe(false);
    expect(balance.specials.emberstrideBurnS).toBeGreaterThan(0);
  });

  it('九个特效**逐个**从"装备上"能查到定义(避免有 id 却没定义)', () => {
    for (const s of SPECIAL_DEFS) {
      const def = specialDef(s.id);
      expect(def, `${s.id} 查不到`).toBeTruthy();
      expect(def!.itemName).toBe(s.itemName);
    }
    expect(specialDef('不存在的东西')).toBeUndefined();
  });
});
