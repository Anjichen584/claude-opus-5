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

/* ================= 冰面滑行(轮 12) ================= */

import { Player } from '@game/components';
import { insideIce } from '@game/dungeon/RoomLayouts';

const ICE_FLOOR = { kind: 'ice', shape: 'blob', xM: 13, yM: 8, wM: 16, hM: 10 } as const;
const iceLayout = { id: 'icefield', label: '冰湖裂面', props: [], floor: ICE_FLOOR } as never;

function mkSkater(x: number, y: number, withPlayer = true) {
  const w = new World();
  const e = w.create();
  w.add(e, new Transform(x, y));
  w.add(e, new Velocity());
  w.add(e, new Body(0.3));
  if (withPlayer) w.add(e, new Player());
  return { w, e };
}

describe('冰面滑行 · 数据与几何', () => {
  it('balance 有滑行参数(iceGripPerS/iceNoticeS)', () => {
    expect(balance.layouts.terrain.iceGripPerS).toBeGreaterThan(0);
    expect(balance.layouts.terrain.iceNoticeS).toBeGreaterThan(0);
  });

  it('insideIce 是椭圆判定:圆心真,长轴端点内,包围盒角落假', () => {
    expect(insideIce(ICE_FLOOR, 13, 8)).toBe(true);
    expect(insideIce(ICE_FLOOR, 13 + 7.9, 8)).toBe(true);
    expect(insideIce(ICE_FLOOR, 13 + 8, 8 + 5), '椭圆的包围盒角落不算冰').toBe(false);
    expect(insideIce({ ...ICE_FLOOR, kind: 'water' } as never, 13, 8), '不是冰的地板不算').toBe(false);
  });

  it('terrain 状态:冰湖布局 → hasIce/floorKind=ice(环境声接口早已备好);水房不受影响', () => {
    terrain.setFromLayout(iceLayout);
    expect(terrain.hasIce).toBe(true);
    expect(terrain.hasWater).toBe(false);
    expect(terrain.floorKind).toBe('ice');
    expect(terrain.isIce(13 * M, 8 * M)).toBe(true);
    expect(terrain.moveMult(13 * M, 8 * M), '冰面不减速(它改手感不改上限)').toBe(1);
    terrain.clear();
  });
});

describe('冰面滑行 · 惯性(单测钉住手感边界)', () => {
  it('松手继续滑:冰上速度归零后仍向前漂,平地立刻停', () => {
    terrain.setFromLayout(iceLayout);
    const { w, e } = mkSkater(13 * M, 8 * M);
    const phys = new PhysicsSystem();
    const vel = w.mustGet(e, Velocity);
    vel.vx = 4 * M;   // 向右滑 0.6s(冰很大,不会滑出去)
    for (let i = 0; i < 36; i++) phys.update(w, 1 / 60);
    vel.vx = 0;       // 松手
    const x0 = w.mustGet(e, Transform).x;
    for (let i = 0; i < 12; i++) phys.update(w, 1 / 60);
    const glide = w.mustGet(e, Transform).x - x0;
    expect(glide, '松手后 0.2s 还在往前漂').toBeGreaterThan(0.25 * M);

    terrain.clear();  // 平地对照
    const { w: w2, e: e2 } = mkSkater(13 * M, 8 * M);
    const phys2 = new PhysicsSystem();
    const vel2 = w2.mustGet(e2, Velocity);
    vel2.vx = 4 * M;
    for (let i = 0; i < 36; i++) phys2.update(w2, 1 / 60);
    vel2.vx = 0;
    const x1 = w2.mustGet(e2, Transform).x;
    phys2.update(w2, 1 / 60);
    expect(w2.mustGet(e2, Transform).x, '平地松手立刻停').toBeCloseTo(x1, 5);
  });

  it('急转会漂:180° 反打后短时间内仍在原方向前进', () => {
    terrain.setFromLayout(iceLayout);
    const { w, e } = mkSkater(13 * M, 8 * M);
    const phys = new PhysicsSystem();
    const vel = w.mustGet(e, Velocity);
    vel.vx = 4 * M;
    for (let i = 0; i < 36; i++) phys.update(w, 1 / 60);
    vel.vx = -4 * M;   // 反打
    const x0 = w.mustGet(e, Transform).x;
    for (let i = 0; i < 6; i++) phys.update(w, 1 / 60);   // 0.1s
    expect(w.mustGet(e, Transform).x, '反打后 0.1s 还在向右漂(惯性)').toBeGreaterThan(x0);
    for (let i = 0; i < 60; i++) phys.update(w, 1 / 60);  // 1s 后才真的回头
    expect(w.mustGet(e, Transform).x).toBeLessThan(x0);
    terrain.clear();
  });

  it('翻滚不打滑(反制):dashT>0 时位移立刻听翻滚的', () => {
    terrain.setFromLayout(iceLayout);
    const { w, e } = mkSkater(13 * M, 8 * M);
    const phys = new PhysicsSystem();
    const vel = w.mustGet(e, Velocity);
    vel.vx = 4 * M;
    for (let i = 0; i < 36; i++) phys.update(w, 1 / 60);   // 先滑出惯性
    const p = w.mustGet(e, Player);
    p.dashT = 0.3;                                          // 翻滚:向左
    vel.vx = -8 * M;
    const x0 = w.mustGet(e, Transform).x;
    phys.update(w, 1 / 60);
    expect(w.mustGet(e, Transform).x, '翻滚第一帧就向左(不吃惯性)').toBeLessThan(x0);
    terrain.clear();
  });

  it('怪不打滑:冰只考验玩家的手,不让怪变笨', () => {
    terrain.setFromLayout(iceLayout);
    const { w, e } = mkSkater(13 * M, 8 * M, false);   // 无 Player 组件 = 怪
    const phys = new PhysicsSystem();
    const vel = w.mustGet(e, Velocity);
    vel.vx = 4 * M;
    for (let i = 0; i < 36; i++) phys.update(w, 1 / 60);
    vel.vx = -4 * M;
    const x0 = w.mustGet(e, Transform).x;
    phys.update(w, 1 / 60);
    expect(w.mustGet(e, Transform).x, '怪反打第一帧就回头').toBeLessThan(x0);
    terrain.clear();
  });
});

/* ================= 沙暴视野(轮 15) ================= */

import { Projectile } from '@game/components';
import { ProjectileSystem } from '@game/systems/ProjectileSystem';

const SAND_FLOOR = { kind: 'sand', shape: 'blob', xM: 13, yM: 8, wM: 12, hM: 8.5 } as const;
const sandLayout = { id: 'dunes', label: '沙丘起伏', props: [], floor: SAND_FLOOR } as never;

describe('沙暴视野 · 循环与开闸', () => {
  it('balance 有沙暴参数(先晴后暴,乘区>1)', () => {
    expect(T.stormClearS).toBeGreaterThan(0);
    expect(T.stormActiveS).toBeGreaterThan(0);
    expect(T.stormProjAgeMul).toBeGreaterThan(1);
  });

  it('沙地房默认不开沙暴(一二章的沙地是观感);enableStorm 后才有循环', () => {
    terrain.setFromLayout(sandLayout);
    expect(terrain.hasStorm, '默认关(章节归属只有 RunManager 知道)').toBe(false);
    terrain.enableStorm();
    expect(terrain.hasStorm).toBe(true);
    terrain.clear();
  });

  it('循环节拍:先晴 stormClearS 秒 → 暴 stormActiveS 秒 → 回晴;强度有缓坡', () => {
    terrain.setFromLayout(sandLayout);
    terrain.enableStorm();
    expect(terrain.stormActive, '开局是晴').toBe(false);
    terrain.tick(T.stormClearS + 0.1);
    expect(terrain.stormActive, '晴够了起暴').toBe(true);
    expect(terrain.stormIntensity, '刚起暴强度在缓坡上').toBeLessThan(1);
    terrain.tick(T.stormActiveS / 2);
    expect(terrain.stormIntensity, '暴中强度拉满').toBe(1);
    terrain.tick(T.stormActiveS / 2);
    expect(terrain.stormActive, '暴完回晴(循环)').toBe(false);
    terrain.clear();
  });

  it('水房/冰房没有沙暴(enableStorm 只认沙地板)', () => {
    terrain.setFromLayout(iceLayout);
    terrain.enableStorm();
    expect(terrain.hasStorm).toBe(false);
    terrain.clear();
  });
});

describe('沙暴视野 · 飞行物射程缩短(双方公平)', () => {
  const mkProj = (w: World) => {
    const e = w.create();
    w.add(e, new Transform(300, 300));
    const v = new Velocity();
    v.vx = 4 * M;
    w.add(e, v);
    w.add(e, new Faction('enemy'));
    w.add(e, new Projectile('enemy', 10, 1, null, 10, 1.0, '#fff'));
    return e;
  };

  it('沙暴中投射物按 stormProjAgeMul 加速衰老 → 同一发弹活得更短', () => {
    terrain.setFromLayout(sandLayout);
    terrain.enableStorm();
    terrain.tick(T.stormClearS + T.stormActiveS / 2);   // 推进到暴中
    expect(terrain.projAgeMul).toBe(T.stormProjAgeMul);

    const w1 = new World();
    mkProj(w1);
    const sys = new ProjectileSystem();
    for (let i = 0; i < Math.ceil(60 / T.stormProjAgeMul) + 2; i++) sys.update(w1, 1 / 60);
    w1.flushDestroyed();   // World 是延迟销毁
    expect(w1.count(Projectile), '暴中 1s 寿命的弹提前没了').toBe(0);

    terrain.clear();                                     // 晴天对照
    const w2 = new World();
    mkProj(w2);
    for (let i = 0; i < Math.ceil(60 / T.stormProjAgeMul) + 2; i++) sys.update(w2, 1 / 60);
    w2.flushDestroyed();
    expect(w2.count(Projectile), '晴天同帧数它还活着').toBe(1);
  });
});

/* ================= 风带推力(轮 17) ================= */

import { LeafWisp } from '@game/components';
import { CritterSystem } from '@game/systems/CritterSystem';
import { insideWind } from '@game/dungeon/RoomLayouts';

const WIND_FLOOR = { kind: 'wind', shape: 'band', xM: 13, yM: 8, wM: 22, hM: 4.5 } as const;
const windLayout = { id: 'windrun', label: '风走廊', props: [], floor: WIND_FLOOR } as never;
const WISP = balance.enemies.leafwisp;

describe('风带推力 · 数据与几何', () => {
  it('balance 有 windPushM;风走廊入模板池(一章战斗房可抽)', () => {
    expect(T.windPushM).toBeGreaterThan(0);
    expect(balance.layouts.byKind.battle).toContain('windrun');
    expect((balance.layouts.chapterWeights as Record<string, Record<string, number>>)['1'].windrun).toBeGreaterThan(0);
  });
  it('insideWind 带状判定;buildLayout(windrun) 不再回退 scatter', () => {
    expect(insideWind(WIND_FLOOR, 13, 8)).toBe(true);
    expect(insideWind(WIND_FLOOR, 13, 8 + 3)).toBe(false);
    const built = buildLayout('windrun', ctxOf(3));
    expect(built.id).toBe('windrun');
    expect(built.floor.kind).toBe('wind');
  });
});

describe('风带推力 · 物理(所有实体一起被吹)', () => {
  it('带内实体被 +x 匀速推;带外不吹;速度归零也会漂', () => {
    terrain.setFromLayout(windLayout);
    const w = new World();
    const e = w.create();
    w.add(e, new Transform(13 * M, 8 * M));
    w.add(e, new Velocity());
    w.add(e, new Body(0.3));
    const phys = new PhysicsSystem();
    for (let i = 0; i < 60; i++) phys.update(w, 1 / 60);
    const drift = w.mustGet(e, Transform).x - 13 * M;
    expect(drift, '1s 被吹 ≈ windPushM 米').toBeGreaterThan(T.windPushM * M * 0.9);

    const e2 = w.create();
    w.add(e2, new Transform(13 * M, 14 * M)); // 带外
    w.add(e2, new Velocity());
    w.add(e2, new Body(0.3));
    for (let i = 0; i < 60; i++) phys.update(w, 1 / 60);
    expect(w.mustGet(e2, Transform).x, '带外纹丝不动').toBeCloseTo(13 * M, 3);
    terrain.clear();
  });
});

describe('风叶精(一章第 9 怪)', () => {
  it('风带里移速 ×windBoostMul(它教玩家读风带)', () => {
    expect(WISP.windBoostMul).toBeGreaterThan(1);
    terrain.setFromLayout(windLayout);
    const mk = (y: number) => {
      const w = new World();
      const pe = w.create();
      w.add(pe, new Transform(20 * M, y));
      w.add(pe, new Velocity());
      w.add(pe, new Body(0.3));
      w.add(pe, new Health(200));
      w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
      w.add(pe, new Faction('player'));
      w.add(pe, new Player());
      const e = w.create();
      w.add(e, new Transform(2 * M, y));
      w.add(e, new Velocity());
      w.add(e, new Body(WISP.bodyRadius));
      w.add(e, new Health(WISP.hp));
      w.add(e, new Stats(WISP.atk, WISP.speed, 0, 1, 0));
      w.add(e, new Faction('enemy'));
      const c = new LeafWisp();
      c.cd = 99;
      w.add(e, c);
      return { w, e };
    };
    const sys = new CritterSystem();
    const inWind = mk(8 * M);   // 带内(远离玩家 → 直线逼近)
    const outWind = mk(14 * M); // 带外
    for (let i = 0; i < 60; i++) {
      sys.update(inWind.w, 1 / 60);
      sys.update(outWind.w, 1 / 60);
    }
    const vIn = Math.hypot(inWind.w.mustGet(inWind.e, Velocity).vx, inWind.w.mustGet(inWind.e, Velocity).vy);
    const vOut = Math.hypot(outWind.w.mustGet(outWind.e, Velocity).vx, outWind.w.mustGet(outWind.e, Velocity).vy);
    expect(vIn / vOut, '带内速度 ≈ ×boost').toBeCloseTo(WISP.windBoostMul, 1);
    terrain.clear();
  });

  it('风筝射手:冷却到了会瞄准并射一发叶刃', () => {
    const w = new World();
    const pe = w.create();
    w.add(pe, new Transform(300 + 4 * M, 300));
    w.add(pe, new Velocity());
    w.add(pe, new Body(0.3));
    w.add(pe, new Health(200));
    w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
    w.add(pe, new Faction('player'));
    w.add(pe, new Player());
    const e = w.create();
    w.add(e, new Transform(300, 300));
    w.add(e, new Velocity());
    w.add(e, new Body(WISP.bodyRadius));
    w.add(e, new Health(WISP.hp));
    w.add(e, new Stats(WISP.atk, WISP.speed, 0, 1, 0));
    w.add(e, new Faction('enemy'));
    const c = new LeafWisp();
    c.cd = 0.05;
    w.add(e, c);
    const sys = new CritterSystem();
    for (let i = 0; i < 60; i++) sys.update(w, 1 / 60);
    expect(w.count(Projectile), '叶刃射出来了').toBeGreaterThanOrEqual(1);
  });
});
