import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { World } from '@engine/ecs/World';
import { Health, Inventory, Player, Portal, Stats, Transform, Velocity, Body, Faction } from '@game/components';
import { ItemFactory } from '@game/loot/Items';
import { Rng } from '@engine/core/Rng';
import { RunManager } from '@game/dungeon/RunManager';
import { runMods } from '@game/dungeon/RunMods';
import {
  CHAPTER_CYCLE, chapterOfLoop, endlessLockReason, endlessUnlocked, floorLabel, isNewRecord,
  loopLabel, loopMults, recordRun, safeAtk, safeHp, safeMult, type EndlessProgress,
} from '@game/dungeon/Endless';

const E = balance.endless;

/**
 * 轮 24 验收:**无尽模式 20 层后仍不崩**(数值溢出测试)。
 * 三组考点:
 * 1. 规则:章节循环 / 乘区几何增长但**永远有限**;
 * 2. 闸门:`safeHp/safeAtk/safeMult` 在极端输入(Infinity / NaN / 1e300)下都给出有限正整数 ——
 *    这是"20 层不崩"的根本保障,因为出怪/掉落的每一条路都走这三个函数;
 * 3. 接线:真实 RunManager 连跑 20+ 层,房间序列不断、章节循环、乘区递增,且血量始终有限。
 */

function makeWorld(): { w: World; pe: number } {
  const w = new World();
  const pe = w.create();
  w.add(pe, new Transform(0, 0));
  w.add(pe, new Velocity());
  w.add(pe, new Body(0.3));
  w.add(pe, new Health(200));
  w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
  w.add(pe, new Faction('player'));
  w.add(pe, new Player());
  w.add(pe, new Inventory());
  return { w, pe };
}

const runOf = (seed = 7): { run: RunManager; w: World; pe: number } => {
  const { w, pe } = makeWorld();
  const run = new RunManager(new ItemFactory(new Rng(seed)));
  run.chapter = 1;
  run.startRoom(w, 'battle', pe);
  return { run, w, pe };
};

/** 手动推进一间房(等价于踩传送门);推到 Boss 房之后按无尽规则接下一循环 */
function stepRoom(run: RunManager, w: World, pe: number): void {
  for (const e of w.query(Portal)) w.destroy(e);
  const kinds = (run as unknown as { nextKinds(): string[] }).nextKinds();
  const kind = kinds[0] as Parameters<RunManager['startRoom']>[1];
  if (kind === 'boss') {
    // 无尽模式里 Boss 房清空 = 进入下一循环(真实路径是 update() 返回 'loop' → GameScene 调 nextLoop)
    run.nextLoop(w, pe);
    return;
  }
  run.depth++;
  run.startRoom(w, kind, pe);
}

describe('规则:章节循环 + 乘区几何增长', () => {
  it('章节按 1→2→3→1 循环(无尽复用三章内容)', () => {
    expect(chapterOfLoop(0)).toBe(1);
    expect(chapterOfLoop(1)).toBe(2);
    expect(chapterOfLoop(2)).toBe(3);
    expect(chapterOfLoop(3), '循环 3 回到第一章').toBe(1);
    expect(CHAPTER_CYCLE).toEqual([1, 2, 3]);
    // 负数/NaN 也给出合法章节(坏输入不该让内容表取到 undefined)
    expect(chapterOfLoop(-1)).toBe(3);
    expect(chapterOfLoop(Number.NaN)).toBe(1);
  });

  it('乘区随循环递增,0 循环全中性', () => {
    expect(loopMults(0)).toEqual({ hp: 1, atk: 1, loot: 1, dust: 1 });
    for (let l = 1; l <= 10; l++) {
      const a = loopMults(l - 1);
      const b = loopMults(l);
      expect(b.hp).toBeGreaterThan(a.hp);
      expect(b.atk).toBeGreaterThan(a.atk);
      expect(b.loot).toBeGreaterThanOrEqual(a.loot);
      expect(b.dust).toBeGreaterThanOrEqual(a.dust);
    }
    expect(loopMults(1).hp).toBeCloseTo(E.loopHp, 6);
    expect(loopMults(2).hp).toBeCloseTo(E.loopHp * E.loopHp, 6);
  });

  it('乘区**永远有限**:1000 循环也不出 Infinity(幂运算会溢出)', () => {
    for (const l of [20, 100, 500, 1000, 1e6]) {
      const m = loopMults(l);
      for (const v of [m.hp, m.atk, m.loot, m.dust]) {
        expect(Number.isFinite(v), `循环 ${l} 的乘区不是有限数`).toBe(true);
        expect(v).toBeLessThanOrEqual(E.maxMult);
        expect(v).toBeGreaterThan(0);
      }
    }
    // 坏输入:NaN / Infinity / 负数
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const m = loopMults(bad);
      expect(Number.isFinite(m.hp)).toBe(true);
      expect(Number.isFinite(m.loot)).toBe(true);
    }
  });

  it('闸门:极端输入都给出有限正整数', () => {
    for (const bad of [Number.POSITIVE_INFINITY, Number.NaN, 1e300, -1e300, -5, 0]) {
      const hp = safeHp(bad);
      const atk = safeAtk(bad);
      expect(Number.isFinite(hp), `safeHp(${bad})`).toBe(true);
      expect(Number.isInteger(hp)).toBe(true);
      expect(hp).toBeGreaterThanOrEqual(1);
      expect(hp).toBeLessThanOrEqual(E.maxHp);
      expect(Number.isFinite(atk)).toBe(true);
      expect(atk).toBeGreaterThanOrEqual(1);
      expect(atk).toBeLessThanOrEqual(E.maxAtk);
    }
    expect(safeHp(1e12)).toBe(E.maxHp);          // 超上限 → 顶到上限(而不是 Infinity)
    expect(safeHp(123.6)).toBe(124);             // 正常值 → 四舍五入
    expect(safeMult(Number.POSITIVE_INFINITY)).toBe(E.maxMult);
    expect(safeMult(-3)).toBe(0);
    expect(safeMult(2.5)).toBe(2.5);              // 倍率不取整(掉落/星尘是小数乘区)
  });

  it('展示文案:层与循环都说得清', () => {
    expect(floorLabel(1)).toBe('第 1 层');
    expect(floorLabel(0), '层数下限 1').toBe('第 1 层');
    expect(loopLabel(0)).toContain('循环 1');
    expect(loopLabel(1)).toContain('第2章');
  });
});

describe('解锁与纪录', () => {
  it('解锁门槛来自数据表', () => {
    expect(endlessUnlocked(E.unlockClears - 1)).toBe(false);
    expect(endlessUnlocked(E.unlockClears)).toBe(true);
    expect(endlessLockReason(0)).toContain('通关');
  });

  it('recordRun 只增不减、不改入参、坏输入不污染纪录', () => {
    const before: EndlessProgress = { clears: 3, bestFloor: 12, bestLoop: 1 };
    const after = recordRun(20, 3, before);
    expect(after).toEqual({ clears: 3, bestFloor: 20, bestLoop: 3 });
    expect(before.bestFloor, '入参被改了').toBe(12);
    const worse = recordRun(5, 0, before);
    expect(worse.bestFloor, '打得更差不该把纪录打下去').toBe(12);
    const bad = recordRun(Number.NaN, Number.POSITIVE_INFINITY, before);
    expect(bad.bestFloor).toBe(12);
    expect(Number.isFinite(bad.bestLoop)).toBe(true);
  });

  it('isNewRecord 只在真的刷新时报', () => {
    expect(isNewRecord(13, { clears: 0, bestFloor: 12, bestLoop: 1 })).toBe(true);
    expect(isNewRecord(12, { clears: 0, bestFloor: 12, bestLoop: 1 })).toBe(false);
    expect(isNewRecord(3, { clears: 0, bestFloor: 12, bestLoop: 1 })).toBe(false);
  });
});

describe('接线:真实 RunManager 连跑 20+ 层不崩', () => {
  it('房间序列跨循环连续、章节循环、层数递增', () => {
    runMods.clear();
    const { run, w, pe } = runOf();
    run.endless = true;
    const seenChapters = new Set<number>();

    // 一层 = 一间房;跑 3 个完整循环(每循环 9 间:8 房 + Boss)
    for (let i = 0; i < 27; i++) {
      seenChapters.add(run.chapter);
      stepRoom(run, w, pe);
    }
    expect(run.roomsEntered).toBeGreaterThanOrEqual(27);
    expect(run.floor).toBe(run.roomsEntered + 1);
    expect([...seenChapters].sort(), '三个循环应该把三章都跑过').toEqual([1, 2, 3]);
    expect(run.loop, '跑了三个循环').toBeGreaterThanOrEqual(2);
    expect(run.depth, '循环内房间序号不会无限增长').toBeLessThan(balance.rooms.count + 1);
    // 每循环的第一间房一定是战斗房(序列从头开始)
    expect(run.roomKind).toBe('battle');
  });

  it('nextLoop:循环 +1、章节循环、乘区递增、层数继续累加(不重置进度)', () => {
    runMods.clear();
    const { run, w, pe } = runOf();
    run.endless = true;
    const roomsBefore = run.roomsEntered;

    run.nextLoop(w, pe);
    expect(run.loop).toBe(1);
    expect(run.chapter).toBe(2);
    expect(run.depth, '新循环从第一间房开始').toBe(0);
    expect(run.roomsEntered, '房间总数跨循环继续累加').toBe(roomsBefore + 1);
    expect(runMods.endlessLoop).toBe(1);
    const m1 = run.loopMults;
    expect(m1.hp).toBeCloseTo(E.loopHp, 6);

    run.nextLoop(w, pe);
    run.nextLoop(w, pe);
    expect(run.chapter, '第三个循环回到第一章').toBe(1);
    expect(run.loopMults.hp).toBeGreaterThan(m1.hp);
    runMods.clear();
  });

  it('出怪血量在 20 循环后仍是**有限正整数**,且顶到上限而不是溢出', () => {
    runMods.clear();
    const { run, w, pe } = runOf();
    run.endless = true;
    runMods.setEndlessLoop(20);

    const [hp20, atk20] = runMods.enemy(100, 20);
    expect(Number.isFinite(hp20) && Number.isInteger(hp20)).toBe(true);
    expect(hp20).toBeGreaterThan(100);
    expect(hp20).toBeLessThanOrEqual(E.maxHp);
    expect(Number.isFinite(atk20)).toBe(true);

    runMods.setEndlessLoop(5000);              // 远超溢出的循环数
    const [hpBig, atkBig] = runMods.enemy(100, 20);
    // 两道闸一起看:乘区上限 maxMult 先封住倍率,数值闸门再封住结果 —— 谁先到顶就按谁
    expect(hpBig, '溢出时必须顶到两道闸里更紧的那道').toBe(Math.min(E.maxHp, Math.round(100 * E.maxMult)));
    expect(atkBig).toBe(Math.min(E.maxAtk, Math.round(20 * E.maxMult)));
    expect(Number.isFinite(hpBig) && Number.isFinite(atkBig)).toBe(true);
    expect(Number.isFinite(runMods.dropMult)).toBe(true);
    expect(runMods.dropMult).toBeLessThanOrEqual(E.maxMult);
    expect(Number.isFinite(runMods.dustMult)).toBe(true);

    // 真的刷出怪:血量有限、正数
    run.startRoom(w, 'battle', pe);
    const hpValues: number[] = [];
    for (const e of w.query(Health)) hpValues.push(w.mustGet(e, Health).hp);
    expect(hpValues.length).toBeGreaterThan(0);
    for (const hp of hpValues) {
      expect(Number.isFinite(hp), '刷出了非有限血量').toBe(true);
      expect(hp).toBeGreaterThan(0);
    }
    runMods.clear();
  });

  it('深渊 × 无尽可以叠(两档乘区相乘,仍走同一道闸门)', () => {
    runMods.clear();
    runMods.setAbyss(3);
    runMods.setEndlessLoop(10);
    const [hp, atk] = runMods.enemy(100, 20);
    const expectHp = Math.min(E.maxHp, Math.round(100 * balance.abyss.levels[2].hpMult * loopMults(10).hp));
    expect(hp).toBe(expectHp);
    expect(atk).toBeGreaterThan(20);
    runMods.clear();
    expect(runMods.enemy(100, 20)).toEqual([100, 20]);
  });

  it('普通局(没开无尽)的乘区不受影响:loop 0 全中性', () => {
    runMods.clear();
    expect(runMods.endlessLoop).toBe(0);
    expect(runMods.enemy(137, 31)).toEqual([137, 31]);
    expect(runMods.dropMult).toBe(1);
    expect(runMods.dustMult).toBe(1);
  });

  it('源码守卫:挑战局固定关无尽、营地开关读解锁、无尽成绩胜负都记', () => {
    const scene = readFileSync(resolve(process.cwd(), 'src/game/GameScene.ts'), 'utf8');
    // 挑战要全服同条件 —— 每日/周常不能因为"谁开了无尽"而不同(与深渊固定普通档同一套口径)
    expect(scene, '挑战局没关掉无尽').toMatch(/this\.run\.endless\s*=\s*mode === 'off'\s*&&\s*this\.campUI\.endless/);
    // Boss 房清空:无尽返回 'loop'(接下一循环),普通局才是 'victory'
    const run = readFileSync(resolve(process.cwd(), 'src/game/dungeon/RunManager.ts'), 'utf8');
    expect(run, '无尽里 Boss 房清空仍然走通关').toMatch(/this\.endless \? 'loop' : 'victory'/);
    expect(run, 'RunManager 没在开局把循环数灌进 runMods').toMatch(/runMods\.setEndlessLoop\(this\.loop\)/);
    // 结算:无尽成绩要在**胜/负两条路**都记(死在第 37 层本身就是那一局的成绩)
    const endRun = scene.slice(scene.indexOf('private endRun('));
    expect(endRun, '结算没记无尽最高层').toMatch(/meta\.data\.endlessBest\s*=/);
    expect(endRun.slice(0, endRun.indexOf('\n  }')), '无尽成绩写在通关分支里了(死亡就丢纪录)')
      .toMatch(/endlessBest/);
    const camp = readFileSync(resolve(process.cwd(), 'src/game/ui/CampUI.ts'), 'utf8');
    expect(camp, '营地面板没做无尽解锁判定(锁着也能开)').toMatch(/endlessUnlocked\(/);
  });
});
