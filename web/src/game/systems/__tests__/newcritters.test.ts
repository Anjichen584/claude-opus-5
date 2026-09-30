import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { World } from '@engine/ecs/World';
import { M } from '@game/constants';
import {
  Body, Buffs, EmberWhirl, Faction, Health, IceGlider, IceSpike, MirageBlossom,
  Player, Projectile, Stats, TelegraphStrike, Transform, Velocity, Zone,
} from '@game/components';
import { TundraSystem } from '@game/systems/TundraSystem';
import { DesertSystem } from '@game/systems/DesertSystem';
import { PhysicsSystem } from '@game/systems/PhysicsSystem';
import { ENEMY_KEYS, ENEMY_HINT } from '@game/meta/Codex';

const SPIKE = balance.enemies.icespike;
const GLIDER = balance.enemies.iceglider;
const BLOSSOM = balance.enemies.mirageblossom;
const WHIRL = balance.enemies.emberwhirl;

/**
 * 轮 11(补怪双拼):二三章 +4 杂兵,四种**新原型**——
 * 炮台(冰锥笋)/ 漂移体(霜刃滑手)/ 伏击(沙蜃花)/ 画线(烬旋灵)。
 * 每个原型考一条"它区别于旧怪的那句话"。
 */

function mkWorld(px: number, py: number) {
  const w = new World();
  const pe = w.create();
  w.add(pe, new Transform(px, py));
  w.add(pe, new Velocity());
  w.add(pe, new Body(0.3));
  w.add(pe, new Health(200));
  w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
  w.add(pe, new Faction('player'));
  w.add(pe, new Player());
  return { w, pe };
}

function addMob<T>(w: World, comp: T, cfg: { bodyRadius: number; hp: number; atk: number; speed: number; def: number }, x: number, y: number) {
  const e = w.create();
  w.add(e, new Transform(x, y));
  w.add(e, new Velocity());
  w.add(e, new Body(cfg.bodyRadius));
  w.add(e, new Health(cfg.hp));
  w.add(e, new Stats(cfg.atk, cfg.speed, 0, 1, cfg.def));
  w.add(e, new Faction('enemy'));
  w.add(e, new Buffs());
  w.add(e, comp as object);
  return e;
}

const run = (sys: TundraSystem | DesertSystem, w: World, seconds: number) => {
  const phys = new PhysicsSystem();
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sys.update(w, 1 / 60);
    phys.update(w, 1 / 60);
  }
};

describe('轮 11 · 数据与图鉴接线', () => {
  it('四条 balance 齐全,数值块可读', () => {
    expect(SPIKE.spike.rangeM).toBeGreaterThan(0);
    expect(GLIDER.glide.turnRadPerS).toBeGreaterThan(0);
    expect(BLOSSOM.burst.count).toBeGreaterThanOrEqual(6);
    expect(WHIRL.rush.trailIntervalS).toBeGreaterThan(0);
  });
  it('图鉴各有条目与行为提示', () => {
    for (const k of ['icespike', 'iceglider', 'mirageblossom', 'emberwhirl'] as const) {
      expect(ENEMY_KEYS, `缺 ${k}`).toContain(k);
      expect(ENEMY_HINT[k], `缺 ${k} 的提示`).toBeTruthy();
    }
  });
  it('可读性:炮台冰锥/伏击首轮都给足预警', () => {
    expect(SPIKE.spike.telegraphS).toBeGreaterThanOrEqual(0.6);
    expect(BLOSSOM.burst.firstDelayS).toBeGreaterThanOrEqual(0.25);
    expect(WHIRL.rush.telegraphS).toBeGreaterThanOrEqual(0.4);
  });
});

describe('冰锥笋(炮台原型)', () => {
  it('玩家进圈 → 在玩家脚下点冰锥;本体一步不挪', () => {
    const { w } = mkWorld(300, 300);
    const e = addMob(w, new IceSpike(), SPIKE, 300 + 4 * M, 300);
    const sys = new TundraSystem();
    const x0 = w.mustGet(e, Transform).x;
    run(sys, w, 2.5);
    expect(w.count(TelegraphStrike), '冰锥预警必须出现').toBeGreaterThanOrEqual(1);
    const ts = w.query(TelegraphStrike)[0];
    expect(w.mustGet(ts, Transform).x, '冰锥点在玩家脚下,不是自己脚下').toBeCloseTo(300, 0);
    expect(w.mustGet(e, Transform).x, '炮台不动').toBeCloseTo(x0, 5);
  });
  it('玩家在射程外 → 装死(不浪费预警)', () => {
    const { w } = mkWorld(300, 300);
    addMob(w, new IceSpike(), SPIKE, 300 + (SPIKE.spike.rangeM + 3) * M, 300);
    run(new TundraSystem(), w, 2.5);
    expect(w.count(TelegraphStrike)).toBe(0);
  });
});

describe('霜刃滑手(漂移原型)', () => {
  it('速度恒定 + 转向受限:玩家在正后方时,一小段时间内掰不过来', () => {
    const { w } = mkWorld(300, 300);
    const e = addMob(w, new IceGlider(), GLIDER, 300 + 3 * M, 300);
    const g = w.mustGet(e, IceGlider);
    g.heading = 0; // 朝右滑,玩家在左 —— 需要 π/turnRadPerS ≈ 2s 才能完全掉头
    const sys = new TundraSystem();
    run(sys, w, 0.3);
    expect(Math.cos(g.heading), '0.3s 内还没掉过头(转向被限速)').toBeGreaterThan(0);
    run(sys, w, 2.5);
    expect(Math.cos(g.heading), '足够时间后终于朝向玩家').toBeLessThan(0);
  });
  it('贴脸有接触伤害(带冷却)', () => {
    const { w, pe } = mkWorld(300, 300);
    const e = addMob(w, new IceGlider(), GLIDER, 300 + 0.5 * M, 300);
    w.mustGet(e, IceGlider).heading = Math.PI; // 正对玩家
    const hp0 = w.mustGet(pe, Health).hp;
    run(new TundraSystem(), w, 0.5);
    expect(w.mustGet(pe, Health).hp).toBeLessThan(hp0);
  });
});

describe('沙蜃花(伏击原型)', () => {
  it('圈外装死;踏进圈 → 苏醒抖动 → 环形毒针一圈(count 根)', () => {
    const { w } = mkWorld(300, 300);
    const e = addMob(w, new MirageBlossom(), BLOSSOM, 300 + (BLOSSOM.burst.triggerM + 2) * M, 300);
    const b = w.mustGet(e, MirageBlossom);
    const sys = new DesertSystem();
    run(sys, w, 1.0);
    expect(b.state, '圈外保持休眠').toBe('dormant');
    expect(w.count(Projectile)).toBe(0);
    // 玩家走进圈
    w.mustGet(w.query(Player)[0], Transform).x = w.mustGet(e, Transform).x - 2 * M;
    run(sys, w, BLOSSOM.burst.firstDelayS + 0.2);
    expect(w.count(Projectile), `环形毒针 ${BLOSSOM.burst.count} 根`).toBeGreaterThanOrEqual(BLOSSOM.burst.count);
  });
});

describe('烬旋灵(画线原型)', () => {
  it('自旋蓄力 → 锁向突进 → 沿途留下火痕(≥3 片)→ 眩晕', () => {
    const { w } = mkWorld(560, 300);
    const e = addMob(w, new EmberWhirl(), WHIRL, 300, 300);
    const wl = w.mustGet(e, EmberWhirl);
    wl.cd = 0.02;
    const sys = new DesertSystem();
    const seen = new Set<string>();
    const phys = new PhysicsSystem();
    for (let i = 0; i < 60 * 4; i++) {
      sys.update(w, 1 / 60);
      phys.update(w, 1 / 60);
      seen.add(wl.state);
    }
    expect([...seen]).toContain('spinup');
    expect([...seen]).toContain('rush');
    expect([...seen]).toContain('dizzy');
    expect(w.count(Zone), '突进画出的火痕').toBeGreaterThanOrEqual(3);
  });
  it('突进方向在蓄力时锁死(不追身,躲开线就安全)', () => {
    const { w, pe } = mkWorld(560, 300);
    const e = addMob(w, new EmberWhirl(), WHIRL, 300, 300);
    const wl = w.mustGet(e, EmberWhirl);
    wl.cd = 0.02;
    const sys = new DesertSystem();
    const phys = new PhysicsSystem();
    let dodged = false;
    let yAtDizzy = -1;   // 突进刚结束那一刻采样(之后的游走会重新追人,不算突进的账)
    for (let i = 0; i < 60 * 3; i++) {
      if (wl.state === 'spinup' && !dodged) {
        w.mustGet(pe, Transform).y = 300 + 4 * M; // 蓄力时垂直移开
        dodged = true;
      }
      sys.update(w, 1 / 60);
      phys.update(w, 1 / 60);
      if (wl.state === 'dizzy' && yAtDizzy < 0) yAtDizzy = w.mustGet(e, Transform).y;
    }
    expect(dodged).toBe(true);
    // 突进走的是锁定方向(沿 x 轴),没有拐向玩家的新位置
    expect(yAtDizzy).toBeGreaterThanOrEqual(0);
    expect(Math.abs(yAtDizzy - 300), '突进不追身').toBeLessThan(1.2 * M);
    const hp = w.mustGet(pe, Health).hp;
    expect(hp, '躲开线的玩家不掉血').toBe(200);
  });
});

describe('轮 11 · 清房登记(漏了门永不开)', () => {
  it('四个新怪都在清房判定里:活着不清,死了清', async () => {
    const { RunManager } = await import('@game/dungeon/RunManager');
    const { ItemFactory } = await import('@game/loot/Items');
    const { Rng } = await import('@engine/core/Rng');
    for (const [comp, cfg] of [
      [IceSpike, SPIKE], [IceGlider, GLIDER], [MirageBlossom, BLOSSOM], [EmberWhirl, WHIRL],
    ] as const) {
      const { w, pe } = mkWorld(200, 200);
      const run = new RunManager(new ItemFactory(new Rng(7)));
      run.startRoom(w, 'battle', pe);
      // 清掉本波随机怪,只留我们手放的新怪 —— 清房判定必须认得它
      for (const e of w.query(Faction)) {
        if (w.mustGet(e, Faction).team === 'enemy') w.destroy(e);
      }
      w.flushDestroyed();
      const mob = addMob(w, new (comp as new () => object)(), cfg, 500, 300);
      // 战斗房有后续波次;这里只考"清房判定认不认得新怪",波次清零
      (run as unknown as { pendingWaves: number }).pendingWaves = 0;
      run.update(w, 1 / 60, pe);
      expect(run.cleared, `${comp.name} 活着时不能算清房`).toBe(false);
      w.destroy(mob);
      w.flushDestroyed();
      run.update(w, 1 / 60, pe);
      expect(run.cleared, `${comp.name} 死了要能开门`).toBe(true);
    }
  });
});
