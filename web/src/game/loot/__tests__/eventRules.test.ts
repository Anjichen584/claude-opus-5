import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { Rng } from '@engine/core/Rng';
import {
  IMPLEMENTED_TOTEMS, TOTEM_GLYPH, TOTEM_IDS, missingTotems, pickTotems, resolveTotem,
  totemBlocker, totemBlockerText, totemName, type TotemKind,
} from '@game/loot/EventRules';
import { CONSUMABLE_IDS } from '@game/loot/Consumables';

const EV = balance.events;

/**
 * 轮 22 验收:**秘境碑池 6 座、每次抽 3 座**,且新碑的代价 / 边界都说得清。
 * 这里刻意把"不能选"的两种情况当成主要考点 —— 玩家按下没反应是最烦的一种失灵。
 */
describe('碑池:数据表与实现的对应关系', () => {
  it('数据表里的碑都有实现(加碑忘写处理会立刻红)', () => {
    expect(missingTotems()).toEqual([]);
    expect([...TOTEM_IDS].sort()).toEqual([...IMPLEMENTED_TOTEMS].sort());
  });

  it('每座碑都有名字与记号', () => {
    for (const id of TOTEM_IDS) {
      expect(totemName(id), `${id} 没有名字`).not.toBe(id);
      expect(TOTEM_GLYPH[id as TotemKind], `${id} 没有记号`).toBeTruthy();
    }
  });

  it('抽 3 座不重复;池子大小与 totemPick 自洽', () => {
    expect(EV.totemPick).toBeLessThanOrEqual(TOTEM_IDS.length);
    for (let seed = 1; seed <= 40; seed++) {
      const picked = pickTotems(new Rng(seed));
      expect(picked).toHaveLength(EV.totemPick);
      expect(new Set(picked).size).toBe(picked.length);
      for (const k of picked) expect(IMPLEMENTED_TOTEMS).toContain(k);
    }
  });

  it('多次进入秘境不会总是同样三座(池子真的在轮转)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) seen.add(pickTotems(new Rng(seed)).join(','));
    expect(seen.size).toBeGreaterThan(5);
  });
});

describe('不能选的碑:说得出原因,且不封印别的碑', () => {
  it('星尘不够 → 赌局点不动', () => {
    const poor = { hp: 100, stardust: EV.gambleCost - 1, runesLeft: 3 };
    expect(totemBlocker('gamble', poor)).toBe('noStardust');
    expect(totemBlockerText('noStardust')).toContain('星尘');
    expect(totemBlocker('gamble', { ...poor, stardust: EV.gambleCost })).toBeNull();
  });

  it('残血献祭会被拦下(允许的话就是"手滑把自己祭死")', () => {
    // hp=1 → 代价 1,献祭完就没命了 → 拦下;hp=2 → 代价 1,还能留 1 点 → 放行
    expect(totemBlocker('sacrifice', { hp: 1, stardust: 0, runesLeft: 0 })).toBe('hpTooLow');
    expect(totemBlocker('sacrifice', { hp: 2, stardust: 0, runesLeft: 0 })).toBeNull();
    expect(totemBlocker('sacrifice', { hp: 1000, stardust: 0, runesLeft: 0 })).toBeNull();
    expect(totemBlockerText('hpTooLow')).toContain('生命不足');
  });

  it('不消耗资源的碑永远能选', () => {
    for (const k of ['blood', 'blessing', 'fountain', 'relic'] as TotemKind[]) {
      expect(totemBlocker(k, { hp: 1, stardust: 0, runesLeft: 0 })).toBeNull();
    }
  });
});

describe('六座碑的结算', () => {
  const st = { hp: 200, stardust: 500, runesLeft: 3 };
  const rng = () => new Rng(42);
  const consPool = CONSUMABLE_IDS;

  it('血之契约:上限乘区(数据表值),不是"扣当前血"', () => {
    const r = resolveTotem('blood', rng(), st, { runeId: null, consPool });
    expect(r).toEqual({ kind: 'blood', hpMult: EV.bloodHpMult });
  });

  it('星辰祝福:攻/移都是本局乘区', () => {
    expect(resolveTotem('blessing', rng(), st, { runeId: null, consPool }))
      .toEqual({ kind: 'blessing', atk: EV.blessingAtk, speed: EV.blessingSpeed });
  });

  it('星尘涌泉:落在区间内', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = resolveTotem('fountain', new Rng(seed), st, { runeId: null, consPool });
      if (r.kind !== 'fountain') throw new Error('kind 错');
      expect(r.dust).toBeGreaterThanOrEqual(EV.fountainMin);
      expect(r.dust).toBeLessThanOrEqual(EV.fountainMax);
    }
  });

  it('赌徒之骰:赢 = 投入 × 倍数,输 = 0;两种结果都真的会出现', () => {
    let wins = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = resolveTotem('gamble', new Rng(seed), st, { runeId: null, consPool });
      if (r.kind !== 'gamble') throw new Error('kind 错');
      expect(r.spent).toBe(EV.gambleCost);
      if (r.won) { wins++; expect(r.dust).toBe(Math.round(EV.gambleCost * EV.gambleMult)); }
      else expect(r.dust).toBe(0);
    }
    expect(wins).toBeGreaterThan(30);   // 大约 40%
    expect(wins).toBeLessThan(170);
  });

  it('献祭之坛:代价按**当前**生命算,且第 1 点也保命(不低于 1)', () => {
    const r = resolveTotem('sacrifice', rng(), st, { runeId: null, consPool });
    if (r.kind !== 'sacrifice') throw new Error('kind 错');
    expect(r.hpCost).toBe(Math.ceil(st.hp * EV.sacrificeHpFrac));
    expect(r.cons).toHaveLength(Math.min(EV.sacrificeCons, consPool.length));
    expect(new Set(r.cons).size, '不该给两瓶一样的').toBe(r.cons.length);
    const tiny = resolveTotem('sacrifice', rng(), { ...st, hp: 1 }, { runeId: null, consPool });
    if (tiny.kind !== 'sacrifice') throw new Error('kind 错');
    expect(tiny.hpCost).toBe(1);
  });

  it('陨星残骸:有符文给符文(不折星尘),集齐才折', () => {
    const has = resolveTotem('relic', rng(), st, { runeId: 'blade_q_x', consPool });
    expect(has).toEqual({ kind: 'relic', runeId: 'blade_q_x', dust: 0 });
    const none = resolveTotem('relic', rng(), { ...st, runesLeft: 0 }, { runeId: null, consPool });
    expect(none).toEqual({ kind: 'relic', runeId: null, dust: EV.relicDustFallback });
  });

  it('同种子同结果(秘境可复现)', () => {
    for (const k of IMPLEMENTED_TOTEMS) {
      const a = resolveTotem(k, new Rng(7), st, { runeId: 'r1', consPool });
      const b = resolveTotem(k, new Rng(7), st, { runeId: 'r1', consPool });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});
