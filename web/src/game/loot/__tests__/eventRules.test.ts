import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { Rng } from '@engine/core/Rng';
import {
  IMPLEMENTED_TOTEMS, TOTEM_COLOR, TOTEM_DESC, TOTEM_GLYPH, TOTEM_IDS, missingTotems, pickTotems,
  pushChoice, repayValue, resolveTotem, summariseChoices, totemBlocker, totemBlockerText, totemName,
  totemVisual, type TotemKind,
} from '@game/loot/EventRules';
import { CONSUMABLE_IDS } from '@game/loot/Consumables';

const EV = balance.events;

/**
 * 轮 22 验收:**秘境碑池 6 座、每次抽 3 座**,且新碑的代价 / 边界都说得清。
 * 轮 25 扩到 **8 座**(回响 / 疗愈)+ 抉择记录(汇总面板与回响之碑的输入)。
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

describe('八座碑的结算', () => {
  const st = { hp: 200, stardust: 500, runesLeft: 3 };
  const rng = () => new Rng(42);
  const consPool = CONSUMABLE_IDS;

  it('血之契约:上限乘区(数据表值),不是"扣当前血"', () => {
    const r = resolveTotem('blood', rng(), st, { runeId: null, consPool, lastValue: 0 });
    expect(r).toEqual({ kind: 'blood', hpMult: EV.bloodHpMult });
  });

  it('星辰祝福:攻/移都是本局乘区', () => {
    expect(resolveTotem('blessing', rng(), st, { runeId: null, consPool, lastValue: 0 }))
      .toEqual({ kind: 'blessing', atk: EV.blessingAtk, speed: EV.blessingSpeed });
  });

  it('星尘涌泉:落在区间内', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = resolveTotem('fountain', new Rng(seed), st, { runeId: null, consPool, lastValue: 0 });
      if (r.kind !== 'fountain') throw new Error('kind 错');
      expect(r.dust).toBeGreaterThanOrEqual(EV.fountainMin);
      expect(r.dust).toBeLessThanOrEqual(EV.fountainMax);
    }
  });

  it('赌徒之骰:赢 = 投入 × 倍数,输 = 0;两种结果都真的会出现', () => {
    let wins = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const r = resolveTotem('gamble', new Rng(seed), st, { runeId: null, consPool, lastValue: 0 });
      if (r.kind !== 'gamble') throw new Error('kind 错');
      expect(r.spent).toBe(EV.gambleCost);
      if (r.won) { wins++; expect(r.dust).toBe(Math.round(EV.gambleCost * EV.gambleMult)); }
      else expect(r.dust).toBe(0);
    }
    expect(wins).toBeGreaterThan(30);   // 大约 40%
    expect(wins).toBeLessThan(170);
  });

  it('献祭之坛:代价按**当前**生命算,且第 1 点也保命(不低于 1)', () => {
    const r = resolveTotem('sacrifice', rng(), st, { runeId: null, consPool, lastValue: 0 });
    if (r.kind !== 'sacrifice') throw new Error('kind 错');
    expect(r.hpCost).toBe(Math.ceil(st.hp * EV.sacrificeHpFrac));
    expect(r.cons).toHaveLength(Math.min(EV.sacrificeCons, consPool.length));
    expect(new Set(r.cons).size, '不该给两瓶一样的').toBe(r.cons.length);
    const tiny = resolveTotem('sacrifice', rng(), { ...st, hp: 1 }, { runeId: null, consPool, lastValue: 0 });
    if (tiny.kind !== 'sacrifice') throw new Error('kind 错');
    expect(tiny.hpCost).toBe(1);
  });

  it('陨星残骸:有符文给符文(不折星尘),集齐才折', () => {
    const has = resolveTotem('relic', rng(), st, { runeId: 'blade_q_x', consPool, lastValue: 0 });
    expect(has).toEqual({ kind: 'relic', runeId: 'blade_q_x', dust: 0 });
    const none = resolveTotem('relic', rng(), { ...st, runesLeft: 0 }, { runeId: null, consPool, lastValue: 0 });
    expect(none).toEqual({ kind: 'relic', runeId: null, dust: EV.relicDustFallback });
  });

  it('同种子同结果(秘境可复现)', () => {
    for (const k of IMPLEMENTED_TOTEMS) {
      const a = resolveTotem(k, new Rng(7), st, { runeId: 'r1', consPool, lastValue: 0 });
      const b = resolveTotem(k, new Rng(7), st, { runeId: 'r1', consPool, lastValue: 0 });
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});

describe('轮 25:8 座碑的展示元数据(轮 22 的渲染崩溃就是这个漏洞)', () => {
  it('**每座碑**都有图标/名称/描述/颜色 —— 渲染只读这一份表', () => {
    for (const id of TOTEM_IDS) {
      const v = totemVisual(id);
      expect(v.icon, `${id} 缺图标`).toBeTruthy();
      expect(v.name, `${id} 缺名字(兜底才回落到 id)`).not.toBe(id);
      expect(v.desc.length, `${id} 的描述太短`).toBeGreaterThan(4);
      expect(v.color, `${id} 缺颜色`).toMatch(/^#[0-9a-f]{6}$/i);
      // 三张表都得覆盖(漏一张 = 某处显示 undefined)
      expect(TOTEM_GLYPH[id as TotemKind]).toBeTruthy();
      expect(TOTEM_DESC[id as TotemKind]).toBeTruthy();
      expect(TOTEM_COLOR[id as TotemKind]).toBeTruthy();
    }
  });

  it('不认识的 id 也给一块完整的碑(渲染循环里绝不抛错)', () => {
    const v = totemVisual('no_such_totem');
    expect(v.name).toBe('no_such_totem');
    expect(v.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(v.icon).toBeTruthy();
  });

  it('源码守卫:GameScene 不再自带一份碑名小表(两处定义必然漂)', () => {
    const scene = readFileSync(resolve(process.cwd(), 'src/game/GameScene.ts'), 'utf8');
    expect(scene, 'GameScene 又出现了本地 TOTEM_INFO 表').not.toMatch(/const TOTEM_INFO/);
    expect(scene, '秘境渲染没走 EventRules 的唯一入口').toMatch(/totemVisual\(totem\.kind\)/);
    // 记录要真的落到存档(否则汇总面板永远是空的 —— 验收门:8 个抉择都有记录可回看)
    expect(scene, '抉择没落档').toMatch(/pushChoice\(meta\.data\.eventLog/);
    expect(scene, '抉择计数没更新').toMatch(/meta\.data\.totemCounts\[c\.totem\]/);
    const camp = readFileSync(resolve(process.cwd(), 'src/game/ui/CampUI.ts'), 'utf8');
    expect(camp, '营地没有秘境记录面板').toMatch(/codex_totem/);
    expect(camp, '秘境面板没读汇总').toMatch(/summariseChoices\(meta\.data\.eventLog\)/);
  });
});

describe('轮 25:回响之碑(重放上次抉择的一半)与疗愈之碑', () => {
  const st = { hp: 60, stardust: 50, runesLeft: 0 };

  it('回响:有记录时给上次价值的 echoFrac,取整', () => {
    const r = resolveTotem('echo', new Rng(1), st, { runeId: null, consPool: CONSUMABLE_IDS, lastValue: 120 });
    expect(r).toEqual({ kind: 'echo', dust: Math.round(120 * EV.echoFrac), frac: EV.echoFrac, fromValue: 120 });
  });

  it('回响:没有记录(或负值)走兜底星尘,不会给出负数', () => {
    const none = resolveTotem('echo', new Rng(1), st, { runeId: null, consPool: CONSUMABLE_IDS, lastValue: 0 });
    expect(none).toMatchObject({ kind: 'echo', dust: EV.echoFallbackDust });
    const neg = resolveTotem('echo', new Rng(1), st, { runeId: null, consPool: CONSUMABLE_IDS, lastValue: -80 });
    expect(neg).toMatchObject({ kind: 'echo', dust: EV.echoFallbackDust });
  });

  it('回响是"折成星尘",不复制上次的物品(否则就是刷装备漏洞)', () => {
    const r = resolveTotem('echo', new Rng(2), st, { runeId: 'any_rune', consPool: CONSUMABLE_IDS, lastValue: 90 });
    expect(r.kind).toBe('echo');
    expect(Object.keys(r)).toEqual(['kind', 'dust', 'frac', 'fromValue']);
  });

  it('疗愈:回满血是**世界侧**的事,规则只给出上限乘区(与血之契约同字段语义)', () => {
    const r = resolveTotem('mend', new Rng(3), st, { runeId: null, consPool: CONSUMABLE_IDS, lastValue: 0 });
    expect(r).toEqual({ kind: 'mend', hpMult: EV.mendHpMult });
    expect(EV.mendHpMult).toBeLessThan(1);
  });

  it('两座新碑都没有硬门槛(回响能给兜底、满血选疗愈是玩家的判断)', () => {
    for (const k of ['echo', 'mend'] as const) {
      expect(totemBlocker(k, st), `${k} 不该被拦`).toBeNull();
      expect(totemBlocker(k, { hp: 1, stardust: 0, runesLeft: 0 })).toBeNull();
    }
  });
});

describe('轮 25:抉择收益数值化 + 记录(汇总面板与回响的输入)', () => {
  it('repayValue:八种结果都有当量,赌博输了记负值', () => {
    const st: { hp: number; stardust: number; runesLeft: number } = { hp: 100, stardust: 0, runesLeft: 0 };
    const pick = { runeId: null, consPool: CONSUMABLE_IDS, lastValue: 0 };
    expect(repayValue(resolveTotem('blood', new Rng(1), st, pick))).toBe(EV.repay.blood);
    expect(repayValue(resolveTotem('mend', new Rng(1), st, pick))).toBe(EV.repay.mend);
    expect(repayValue(resolveTotem('blessing', new Rng(1), st, pick))).toBe(EV.repay.blessing);
    const won = { kind: 'gamble' as const, spent: 60, won: true, dust: 180, mult: 3 };
    const lost = { kind: 'gamble' as const, spent: 60, won: false, dust: 0, mult: 3 };
    expect(repayValue(won)).toBe(120);
    expect(repayValue(lost)).toBe(-60);
    expect(repayValue({ kind: 'relic', runeId: null, dust: 60 })).toBe(60);
    expect(repayValue({ kind: 'relic', runeId: 'x', dust: 0 })).toBe(EV.repay.rune);
  });

  it('pushChoice:新的在前、裁到上限、坏输入洗成 0,且不改入参', () => {
    const log = [
      { floor: 3, totem: 'blood' as const, value: 90 },
      { floor: 2, totem: 'fountain' as const, value: 100 },
    ];
    const capped = pushChoice(log, { floor: 5, totem: 'echo', value: 45 }, 2);
    expect(capped.map((c) => c.totem)).toEqual(['echo', 'blood']);
    expect(log).toHaveLength(2);
    const bad = pushChoice([], { floor: Number.NaN, totem: 'mend', value: Number.NaN }, 2);
    expect(bad[0]).toEqual({ floor: 0, totem: 'mend', value: 0 });
    expect(pushChoice([], { floor: 2.7, totem: 'mend', value: 12.4 }, 0)[0]).toMatchObject({ floor: 2, value: 12 });
  });

  it('summariseChoices:次数与累计对得上(汇总面板两栏都读它)', () => {
    const log = [
      { floor: 1, totem: 'blood', value: 90 },
      { floor: 9, totem: 'blood', value: 90 },
      { floor: 12, totem: 'gamble', value: -60 },
    ];
    const r = summariseChoices(log);
    expect(r.counts.blood).toBe(2);
    expect(r.byId.gamble).toBe(-60);
    expect(r.total).toBe(120);
    expect(summariseChoices([]).total).toBe(0);
  });

  it('回响接在真实记录上:选过血之契约(90)之后,回响给 45', () => {
    const log: { floor: number; totem: TotemKind; value: number }[] = [];
    const after = pushChoice(log, { floor: 2, totem: 'blood', value: EV.repay.blood });
    const r = resolveTotem('echo', new Rng(7), { hp: 80, stardust: 0, runesLeft: 0 }, {
      runeId: null, consPool: CONSUMABLE_IDS, lastValue: after[0].value,
    });
    expect(r).toMatchObject({ kind: 'echo', dust: Math.round(EV.repay.blood * EV.echoFrac) });
  });
});
