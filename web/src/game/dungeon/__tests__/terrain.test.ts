import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { Rng } from '@engine/core/Rng';
import { M } from '@game/constants';
import { World } from '@engine/ecs/World';
import {
  Body, Faction, Health, MeleeSweep, PropObstacle, Stats, Transform, Velocity,
} from '@game/components';
import { CombatSystem } from '@game/systems/CombatSystem';
import { PhysicsSystem } from '@game/systems/PhysicsSystem';
import { buildLayout, propRadius, type LayoutCtx } from '../RoomLayouts';
import { damageProp, hitsToBreak, propHp, terrain } from '../Terrain';

const W = balance.arena.widthM;
const H = balance.arena.heightM;
const T = balance.layouts.terrain;

const ctxOf = (seed: number): LayoutCtx => ({ rng: new Rng(seed), widthM: W, heightM: H });

/** 造一个带地形的世界;返回世界 + 用到的 layout */
function worldWithLayout(id: Parameters<typeof buildLayout>[0], seed = 5) {
  const layout = buildLayout(id, ctxOf(seed));
  terrain.setFromLayout(layout);
  return { w: new World(), layout };
}

function putProp(w: World, kind: 'tree' | 'rock' | 'bush', xM: number, yM: number): number {
  const e = w.create();
  w.add(e, new Transform(xM * M, yM * M));
  const p = new PropObstacle(kind);
  p.hp = propHp(kind);
  w.add(e, p);
  if (propRadius(kind) > 0) {
    w.add(e, new Velocity());
    w.add(e, new Body(propRadius(kind), true));
  }
  return e;
}

function putAttacker(w: World, xM: number, yM: number, atk = balance.player.atk): number {
  const e = w.create();
  w.add(e, new Transform(xM * M, yM * M));
  w.add(e, new Velocity());
  w.add(e, new Body(balance.player.bodyRadius));
  w.add(e, new Stats(atk, balance.player.moveSpeed, 0, 1)); // 暴击率 0 → 可复现
  w.add(e, new Faction('player'));
  w.add(e, new Health(100));
  return e;
}

/** 朝 +x 方向挥一刀(source, x, y, angle, rangePx, arcRad, mult, stage, element, knockbackM) */
function swing(w: World, source: number, rangeM: number, mult = 1): void {
  const tr = w.mustGet(source, Transform);
  w.emit(new MeleeSweep(source, tr.x, tr.y, 0, rangeM * M, Math.PI * 1.2, mult, 1, null, 0));
}

describe('浅滩(水)机制', () => {
  it('只有浅滩房有水;其它房间 moveMult 恒为 1', () => {
    terrain.clear();
    expect(terrain.hasWater).toBe(false);
    expect(terrain.moveMult(W / 2, H / 2)).toBe(1);

    const { layout } = worldWithLayout('shore', 9);
    expect(layout.floor.kind).toBe('water');
    expect(terrain.hasWater).toBe(true);
    // 水带中心在水里,房间入口不在
    expect(terrain.isWater((W / 2) * M, layout.floor.yM * M)).toBe(true);
    expect(terrain.isWater(2.5 * M, (H / 2) * M)).toBe(false);

    worldWithLayout('pillars', 3);
    expect(terrain.hasWater).toBe(false);
  });

  it('水里移动变慢、陆上不变(全局单点乘区)', () => {
    const { layout } = worldWithLayout('shore', 11);
    const wy = layout.floor.yM * M;
    expect(terrain.moveMult(W / 2 * M, wy)).toBe(T.waterMoveMult);
    expect(terrain.moveMult(W / 2 * M, 1.2 * M)).toBe(1);
    // 平衡性:减速要有感但不能"走不动"
    expect(T.waterMoveMult).toBeGreaterThan(0.5);
    expect(T.waterMoveMult).toBeLessThan(1);
  });

  it('PhysicsSystem 真的把水里的位移砍了(不是只有乘区函数好看)', () => {
    const { layout } = worldWithLayout('shore', 13);
    const w = new World();
    const phys = new PhysicsSystem();
    const waterY = layout.floor.yM;
    const dryY = 1.2;

    const mk = (yM: number): number => {
      const e = w.create();
      w.add(e, new Transform(14 * M, yM * M));
      w.add(e, new Velocity(240, 0)); // 5 m/s 的横向速度,不进物理分离
      w.add(e, new Body(0.2));
      return e;
    };
    const inWater = mk(waterY);
    const onLand = mk(dryY);
    phys.update(w, 0.1);

    const dxWater = w.mustGet(inWater, Transform).x - 14 * M;
    const dxLand = w.mustGet(onLand, Transform).x - 14 * M;
    expect(dxLand).toBeCloseTo(24, 5);            // 240 × 0.1
    expect(dxWater).toBeCloseTo(24 * T.waterMoveMult, 4);
    expect(dxWater).toBeLessThan(dxLand);
  });

  it('导电:雷伤在水里 ×1.25,并给非玩家目标附加短时麻痹', () => {
    const { layout } = worldWithLayout('shore', 17);
    const wy = layout.floor.yM * M;
    expect(terrain.elemAmp('bolt', W / 2 * M, wy)).toBe(T.waterBoltAmp);
    expect(terrain.elemAmp('bolt', W / 2 * M, 1.2 * M)).toBe(1);
    // 其它元素与水无关
    for (const el of ['fire', 'ice', 'toxin', null] as const) {
      expect(terrain.elemAmp(el, W / 2 * M, wy)).toBe(1);
    }
    expect(terrain.stunOnBolt('bolt', W / 2 * M, wy)).toBe(T.waterStunS);
    expect(terrain.stunOnBolt('fire', W / 2 * M, wy)).toBe(0);
    expect(terrain.stunOnBolt('bolt', W / 2 * M, 1.2 * M)).toBe(0);
    // 平衡性:加成不该大到"必须在浅滩房开局",麻痹不该比反应链的眩晕还长
    expect(T.waterBoltAmp).toBeGreaterThan(1);
    expect(T.waterBoltAmp).toBeLessThanOrEqual(1.5);
    expect(T.waterStunS).toBeLessThan(balance.reactions.numb.stunS);
  });
});

describe('可打穿的障碍', () => {
  it('耐久来自 balance.props.*.hp;灌木打不烂', () => {
    expect(propHp('tree')).toBe(balance.props.tree.hp);
    expect(propHp('rock')).toBe(balance.props.rock.hp);
    expect(propHp('bush')).toBe(0);
    expect(propHp('nope')).toBe(0);
    // 岩比树结实(石柱阵/窄道墙更贵,散布里的小树更好清)
    expect(balance.props.rock.hp).toBeGreaterThan(balance.props.tree.hp);
  });

  it('damageProp 是纯函数:扣血 → 归零才碎;碎了再打无效', () => {
    const p = { hp: propHp('rock'), broken: false };
    expect(damageProp(p, 'rock', 50)).toBe(false);
    expect(p.hp).toBe(70);
    expect(damageProp(p, 'rock', 70)).toBe(true); // 刚好打进 0 → 碎
    expect(p.broken).toBe(true);
    expect(p.hp).toBe(0);
    expect(damageProp(p, 'rock', 999)).toBe(false); // 已经碎了

    const bush = { hp: 0, broken: false };
    expect(damageProp(bush, 'bush', 999)).toBe(false);
    expect(bush.broken).toBe(false);
  });

  it('砍树要 7 刀、拆岩要 10 刀(玩家基准攻击),技能一两发就够', () => {
    const atk = balance.player.atk;
    expect(hitsToBreak('tree', atk)).toBe(Math.ceil(balance.props.tree.hp / atk));
    expect(hitsToBreak('rock', atk)).toBe(Math.ceil(balance.props.rock.hp / atk));
    expect(hitsToBreak('rock', 60)).toBe(2); // 大招级别的伤害两下开洞
    expect(hitsToBreak('bush', atk)).toBe(0);
    expect(hitsToBreak('tree', 0)).toBe(0);
  });

  it('近战扇形能拆墙:打到碎 → Body 被摘掉 → 不再阻挡', () => {
    const { w } = worldWithLayout('pillars', 7);
    terrain.clear(); // 只测障碍,不受地形影响
    const attacker = putAttacker(w, 10, 8);
    const rock = putProp(w, 'rock', 12, 8);
    const combat = new CombatSystem();
    const prop = w.mustGet(rock, PropObstacle);
    const before = prop.hp;

    w.clearEvents();
    swing(w, attacker, 3);
    combat.update(w, 1 / 60);
    expect(prop.hp).toBeLessThan(before);
    expect(prop.broken).toBe(false);
    expect(w.has(rock, Body)).toBe(true);

    // 一直砍到碎
    for (let i = 0; i < 20 && !prop.broken; i++) {
      w.clearEvents();
      swing(w, attacker, 3);
      combat.update(w, 1 / 60);
    }
    expect(prop.broken).toBe(true);
    expect(w.has(rock, Body)).toBe(false); // 通道打开
    expect(prop.shakeT).toBeGreaterThan(0); // 挨打有反馈
  });

  it('打不到的障碍不动:超出范围 / 扇形之外都砍不到', () => {
    const { w } = worldWithLayout('pillars', 7);
    terrain.clear();
    const attacker = putAttacker(w, 10, 8);
    const far = putProp(w, 'rock', 20, 8);
    const behind = putProp(w, 'tree', 9, 8); // 攻击方向是 +x,树在身后
    const combat = new CombatSystem();
    w.clearEvents();
    swing(w, attacker, 3);
    combat.update(w, 1 / 60);
    expect(w.mustGet(far, PropObstacle).hp).toBe(propHp('rock'));
    expect(w.mustGet(behind, PropObstacle).hp).toBe(propHp('tree'));
  });

  it('灌木不吃伤害(它本来就不挡路)', () => {
    const { w } = worldWithLayout('calm', 4);
    terrain.clear();
    const attacker = putAttacker(w, 10, 8);
    const bush = putProp(w, 'bush', 10.8, 8);
    const combat = new CombatSystem();
    for (let i = 0; i < 5; i++) {
      w.clearEvents();
      swing(w, attacker, 2);
      combat.update(w, 1 / 60);
    }
    expect(w.mustGet(bush, PropObstacle).broken).toBe(false);
  });

  it('碎掉的障碍物理上不再推开别人(否则会出现"隐形墙")', () => {
    const phys = new PhysicsSystem();
    const spawn = (broken: boolean): { x: number } => {
      const w = new World();
      terrain.clear();
      const rock = putProp(w, 'rock', 10, 8);
      w.mustGet(rock, PropObstacle).broken = broken;
      const e = w.create();
      w.add(e, new Transform(10 * M + 6, 8 * M)); // 贴着岩石(岩半径 0.4m=19px)
      w.add(e, new Velocity());
      w.add(e, new Body(0.3));
      phys.update(w, 1 / 60);
      return { x: w.mustGet(e, Transform).x - (10 * M + 6) };
    };
    expect(spawn(false).x).toBeGreaterThan(0); // 整块岩石把人推开
    expect(spawn(true).x).toBe(0);             // 碎了就是个贴图,不挡路
  });
});
