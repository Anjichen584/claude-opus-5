import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import pool from '@data/runes/pool.json';
import { World } from '@engine/ecs/World';
import {
  Body, Buffs, ElementMarks, Faction, Health, MidBossStag, Player, Projectile, Stats,
  TelegraphStrike, Transform, Velocity, Zone,
} from '@game/components';
import { MIDBOSS_TUNING, MidBossSystem } from '@game/systems/MidBossSystem';
import { PhysicsSystem } from '@game/systems/PhysicsSystem';
import { ENEMY_KEYS, ENEMY_HINT, enemyEntry, isBossKey, isMidBossKey } from '@game/meta/Codex';
import { SPRITE_NAMES } from '@game/gfx/spriteDraw';
import { RunManager } from '@game/dungeon/RunManager';
import { ItemFactory } from '@game/loot/Items';
import { Rng } from '@engine/core/Rng';
import { Portal, Inventory, KillEvent, Pickup } from '@game/components';
import { LootSystem } from '@game/loot/LootSystem';
import { RUNE_POOL } from '@game/skills/SkillSystem';

const S = balance.enemies.midboss_mossstag;
const M = 48;

function makeWorld(stagX: number, stagY: number, playerX: number, playerY: number) {
  const w = new World();
  const pe = w.create();
  w.add(pe, new Transform(playerX, playerY));
  w.add(pe, new Velocity());
  w.add(pe, new Body(0.3));
  w.add(pe, new Health(200));
  w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
  w.add(pe, new Faction('player'));
  w.add(pe, new Player());

  const se = w.create();
  w.add(se, new Transform(stagX, stagY));
  w.add(se, new Velocity());
  w.add(se, new Body(S.bodyRadius));
  w.add(se, new Health(Math.round(S.hp)));
  w.add(se, new Stats(S.atk, S.speed, 0, 1, S.def));
  w.add(se, new Faction('enemy'));
  w.add(se, new ElementMarks());
  w.add(se, new Buffs());
  const stag = new MidBossStag();
  stag.spawnX = stagX;
  stag.spawnY = stagY;
  w.add(se, stag);
  return { w, pe, se, stag };
  // (pe/se 是实体 id,测试里一律用它们定位,别写死 0/1)
}

/**
 * 跑 n 秒(60fps)。
 * **必须带 PhysicsSystem**:AI 只写 Velocity,位移是物理帧积分的
 * (早先漏了这层,结果"冲撞永远在原地" —— 这类测试最容易骗自己)。
 * 顺序与 GameScene 注册顺序一致:AI → Physics。
 */
function run(sys: MidBossSystem, w: World, seconds: number): void {
  const dt = 1 / 60;
  const phys = new PhysicsSystem();
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sys.update(w, dt);
    phys.update(w, dt);
  }
}

/** 单帧推进(AI → 物理),返回本帧状态 */
function step(sys: MidBossSystem, w: World, phys: PhysicsSystem, dt = 1 / 60): void {
  sys.update(w, dt);
  phys.update(w, dt);
}

describe('中 Boss 苔冠巨鹿 · 数据契约', () => {
  it('balance 条目齐全(数值块不能少,少一块 AI 会读 undefined)', () => {
    for (const k of ['name', 'hp', 'atk', 'def', 'speed', 'bodyRadius', 'stalkM', 'phase2At', 'enrageSpeedMul', 'enrageVolleyAdd', 'runeDrop']) {
      expect(S, k).toHaveProperty(k);
    }
    for (const k of ['telegraphS', 'speedM', 'durS', 'recoverS', 'mult', 'cdS', 'wallStunS']) {
      expect(S.charge, `charge.${k}`).toHaveProperty(k);
    }
    for (const k of ['telegraphS', 'count', 'spreadDeg', 'speedM', 'lifeS', 'radiusM', 'mult', 'cdS']) {
      expect(S.volley, `volley.${k}`).toHaveProperty(k);
    }
    for (const k of ['radiusM', 'lifeS', 'intervalS', 'mult']) {
      expect(S.spore, `spore.${k}`).toHaveProperty(k);
    }
  });

  it('定位正确:比精英肉得多、比章 Boss 轻得多(它是"半个 Boss")', () => {
    const nanmir = balance.boss.nanmir;
    expect(S.hp).toBeGreaterThan(balance.enemies.oakgolem.hp * 2);
    expect(S.hp).toBeLessThan(nanmir.hp / 2);
    expect(S.atk).toBeLessThan(nanmarAtk(nanmir));
    expect(S.bodyRadius).toBeGreaterThan(0.4);
    expect(S.bodyRadius).toBeLessThan(nanmir.bodyRadius);
  });

  it('可读性硬约束:预警必须久于"反应不过来"的阈值,硬直必须够长', () => {
    // 0.5s 是文档里的人类反应下限(01-GDD §3.1 的顿帧/预警约定);低于它等于没预警
    expect(S.charge.telegraphS).toBeGreaterThanOrEqual(0.5);
    expect(S.volley.telegraphS).toBeGreaterThanOrEqual(0.5);
    // 撞墙硬直 2.2s:够打完一套三段连击(剑士 3 段 ≈1.1s)
    expect(S.charge.wallStunS).toBeGreaterThanOrEqual(2.0);
    // 冲锋距离要能横穿战场的一半以上,才值得"把鹿骗上墙"
    expect(S.charge.speedM * S.charge.durS).toBeGreaterThan(balance.arena.widthM * 0.15);
  });

  it('狂怒数值是"更凶"而不是"更弱":加速、加弹、减冷却', () => {
    expect(S.enrageSpeedMul).toBeGreaterThan(1);
    expect(S.enrageVolleyAdd).toBeGreaterThanOrEqual(2);
    expect(S.phase2At).toBeGreaterThan(0.2);
    expect(S.phase2At).toBeLessThan(0.7);
  });
});

describe('中 Boss 苔冠巨鹿 · 房间与图鉴接线', () => {
  it('rooms.midbossIndex 夹在精英房与章 Boss 之间(推图节奏:4 精英 → 6 中 Boss → 8 首领)', () => {
    const R = balance.rooms;
    expect(R.midbossIndex).toBeGreaterThan(R.eliteIndex);
    expect(R.midbossIndex).toBeLessThan(R.count);
  });

  it('图鉴:中 Boss 是独立条目,带 ★ 但不算章 Boss', () => {
    const key = 'midboss_mossstag';
    expect(ENEMY_KEYS).toContain(key);
    expect(ENEMY_HINT[key], '图鉴提示文案不能空').toBeTruthy();
    expect(isBossKey(key), '要跟 Boss 排在一起(带 ★)').toBe(true);
    expect(isMidBossKey(key)).toBe(true);
    expect(isMidBossKey('boss_nanmir'), '章 Boss 不是中 Boss').toBe(false);
    const e = enemyEntry(key)!;
    expect(e.name).toBe('苔冠巨鹿');
    expect(e.chapter).toBe(1);
    expect(e.hp).toBe(S.hp);
  });

  it('精灵双帧齐全(站立/冲锋),否则渲染会静默退回色块', () => {
    for (const n of ['midboss_mossstag', 'midboss_mossstag_f2']) {
      expect(SPRITE_NAMES, `${n} 未登记进 SPRITE_NAMES`).toContain(n);
    }
  });

  it('掉落写着保底(符文数 ≥1),别让"打了没奖励"', () => {
    expect(S.runeDrop).toBeGreaterThanOrEqual(1);
    const skills = new Set(pool.runes.map((r) => r.skill));
    expect(skills.size, '符文池要够它掉').toBeGreaterThan(0);
  });
});

describe('中 Boss 苔冠巨鹿 · 掉落(打了必须有奖励)', () => {
  it('击杀必掉紫装 + 保底符文,且符文只掉本职业', () => {
    const w = new World();
    const pe = w.create();
    w.add(pe, new Transform(200, 200));
    w.add(pe, new Velocity());
    w.add(pe, new Inventory());
    w.add(pe, new Player());
    w.emit(new KillEvent(200, 200, 'midboss_mossstag'));
    new LootSystem().update(w, 1 / 60);
    const picks = w.query(Pickup).map((e) => w.mustGet(e, Pickup));
    const items = picks.filter((p) => p.kind === 'item');
    const runes = picks.filter((p) => p.kind === 'rune');
    expect(items.some((p) => p.item?.rarity === 'epic'), '保底紫装').toBe(true);
    expect(runes.length, `保底符文 ×${S.runeDrop}`).toBeGreaterThanOrEqual(S.runeDrop);
    // 只掉本职业的符文(第一章默认剑士)
    for (const r of runes) {
      const def = [...RUNE_POOL.values()].find((x) => x.id === r.runeId);
      expect(def, `符文 ${r.runeId} 不在池里`).toBeTruthy();
      expect(def!.skill.startsWith('blade_')).toBe(true);
    }
    // 两枚符文的 id 不重复
    const ids = runes.map((r) => r.runeId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('中 Boss 苔冠巨鹿 · 房间接线(起房 → 打掉 → 清房)', () => {
  const mkRun = () => {
    const run = new RunManager(new ItemFactory(new Rng(7)));
    run.chapter = 1;
    return run;
  };
  const mkWorldWithPlayer = () => {
    const w = new World();
    const pe = w.create();
    w.add(pe, new Transform(200, 200));
    w.add(pe, new Velocity());
    w.add(pe, new Body(0.3));
    w.add(pe, new Health(200));
    w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
    w.add(pe, new Faction('player'));
    w.add(pe, new Player());
    return { w, pe };
  };

  it('midboss 房只刷一只苔冠巨鹿(它自己就是这场战斗的压力)', () => {
    const run = mkRun();
    const { w, pe } = mkWorldWithPlayer();
    run.startRoom(w, 'midboss', pe);
    expect(w.count(MidBossStag)).toBe(1);
    expect(run.roomKind).toBe('midboss');
  });

  it('打掉它才算清房(清房判定漏登记 = 房间永不清,门永远不开)', () => {
    const run = mkRun();
    const { w, pe } = mkWorldWithPlayer();
    run.startRoom(w, 'midboss', pe);
    run.update(w, 1 / 60, pe);
    expect(run.cleared, '它活着时不能算清').toBe(false);
    for (const e of w.query(MidBossStag)) w.destroy(e);
    w.flushDestroyed(); // World 是延迟销毁:不 flush 的话"尸体"还在,清房判定当然过不了
    run.update(w, 1 / 60, pe);
    expect(run.cleared, '打掉它 → 清房').toBe(true);
  });

  it('中 Boss 房 → 打完给出口传送门(midboss 也是合法传送门类型)', () => {
    const run = mkRun();
    const { w, pe } = mkWorldWithPlayer();
    run.startRoom(w, 'midboss', pe);
    for (const e of w.query(MidBossStag)) w.destroy(e);
    w.flushDestroyed();
    run.update(w, 1 / 60, pe);
    const portals = w.query(Portal);
    expect(portals.length).toBeGreaterThanOrEqual(1);
    for (const e of portals) {
      expect(['battle', 'treasure', 'elite', 'midboss', 'boss', 'shop', 'event'])
        .toContain(w.mustGet(e, Portal).kind);
    }
  });
});

describe('中 Boss 苔冠巨鹿 · 行为(真跑 AI)', () => {
  it('stalk 阶段保持距离:既不贴脸也不掉线', () => {
    const { w, pe, se, stag } = makeWorld(200, 200, 600, 200);
    const sys = new MidBossSystem();
    stag.chargeCd = 99;
    stag.volleyCd = 99;
    run(sys, w, 1.5);
    const sx = w.mustGet(se, Transform);
    const px = w.mustGet(pe, Transform);
    const d = Math.hypot(sx.x - px.x, sx.y - px.y);
    expect(stag.state).toBe('stalk');
    expect(d, '既不贴脸(>1.2m)也不掉线(<9m)').toBeGreaterThan(1.2 * M);
    expect(d).toBeLessThan(9 * M);
  });

  it('冲撞:预警 → 起步 → 命中玩家扣血', () => {
    // 玩家在冲锋距离内(6.4m/s × 0.85s ≈ 5.4m),放 3.5m 处必被撞到
    const { w, pe, stag } = makeWorld(120, 200, 288, 200);
    const sys = new MidBossSystem();
    stag.chargeCd = 0.05;
    stag.volleyCd = 99;
    const hp0 = w.mustGet(pe, Health).hp;
    const phys = new PhysicsSystem();
    const seen = new Set<string>();
    for (let i = 0; i < 60 * 4; i++) {
      step(sys, w, phys);
      seen.add(stag.state);
    }
    expect([...seen], '冲撞必须走完 预警→冲 两个阶段').toContain('chargeWind');
    expect([...seen]).toContain('charge');
    expect(w.mustGet(pe, Health).hp, '正面接冲锋必须掉血').toBeLessThan(hp0);
  });

  it('预警期锁定朝向 + 亮出路径预警圈(玩家看得见才躲得开)', () => {
    const { w, se, stag } = makeWorld(120, 200, 500, 200);
    const sys = new MidBossSystem();
    const phys = new PhysicsSystem();
    stag.chargeCd = 0.01;
    stag.volleyCd = 99;
    step(sys, w, phys);
    expect(stag.state).toBe('chargeWind');
    expect(w.count(TelegraphStrike)).toBeGreaterThanOrEqual(MIDBOSS_TUNING.laneDots);
    // 预警期原地不动
    const before = w.mustGet(se, Transform).x;
    run(sys, w, 0.4);
    expect(w.mustGet(se, Transform).x).toBeCloseTo(before, 5);
  });

  it('撞墙自晕:把冲锋骗到墙上 → 满硬直(核心博弈:会躲就赚)', () => {
    // 玩家站在鹿的左边,等它进入预警(朝向锁定朝左),然后"滚开"——
    // 鹿继续冲,前面只剩左墙。这正是实战里要教玩家做的事。
    const { w, pe, se, stag } = makeWorld(200, 400, 60, 400);
    const sys = new MidBossSystem();
    const phys = new PhysicsSystem();
    stag.chargeCd = 0.05;
    stag.volleyCd = 99;
    let staggeredAt = -1;
    const pTr = w.mustGet(pe, Transform);
    for (let i = 0; i < 60 * 3; i++) {
      if (stag.state === 'chargeWind' && pTr.y === 400) {
        pTr.y = 80; // 横向滚开(离开冲锋线)
      }
      step(sys, w, phys);
      if (stag.state === 'stagger' && staggeredAt < 0) staggeredAt = stag.t;
    }
    expect(staggeredAt, '撞墙后必须进硬直').toBeGreaterThan(0);
    expect(staggeredAt, '撞墙 = 满硬直(不是撞人那种半晕)').toBeGreaterThan(S.charge.wallStunS - 0.2);
    expect(w.mustGet(se, Transform).x, '确实是撞在墙上(贴左墙)').toBeLessThan(1.0 * M);
  });

  it('撞到玩家只晕一半(把玩家推开的代价,不是白给)', () => {
    const { w, pe, stag } = makeWorld(120, 200, 288, 200);
    const sys = new MidBossSystem();
    const phys = new PhysicsSystem();
    stag.chargeCd = 0.05;
    stag.volleyCd = 99;
    let staggeredAt = -1;
    for (let i = 0; i < 60 * 3; i++) {
      step(sys, w, phys);
      if (stag.state === 'stagger' && staggeredAt < 0) staggeredAt = stag.t;
    }
    const pv = w.mustGet(pe, Velocity);
    expect(w.mustGet(pe, Health).hp, '被撞到要掉血').toBeLessThan(200);
    expect(Math.hypot(pv.vx, pv.vy), '被撞到要被推开').toBeGreaterThan(0);
    expect(staggeredAt, '撞人 = 半晕').toBeLessThan(S.charge.wallStunS * 0.75);
  });

  it('孢子弹幕:扇形多发 + 玩家脚下留孢子云', () => {
    const { w } = makeWorld(120, 400, 420, 400);
    const sys = new MidBossSystem();
    // **不强制冷却**:让 AI 按真实节奏自己决定何时放(踩过"冲撞把弹幕饿死"的坑)
    run(sys, w, 12);
    const shots = w.query(Projectile).length;
    // 设计下限写死字面量:用 S.volley.count 断言 S.volley.count 等于没测(踩过)
    expect(S.volley.count, '弹幕设计下限 = 5 发').toBeGreaterThanOrEqual(5);
    expect(shots, '弹幕至少 5 发').toBeGreaterThanOrEqual(5);
    expect(w.count(Zone), '脚下要种孢子云(空间封锁)').toBeGreaterThanOrEqual(1);
    for (const e of w.query(Projectile)) {
      const p = w.mustGet(e, Projectile);
      expect(p.team).toBe('enemy');
      expect(p.element).toBe('toxin');
    }
  });

  it('两招轮换:30 秒内冲撞与弹幕都要出现(不许互相饿死)', () => {
    const { w, stag } = makeWorld(200, 400, 700, 400);
    const sys = new MidBossSystem();
    const phys = new PhysicsSystem();
    let charges = 0;
    let volleys = 0;
    let prev = stag.state;
    for (let i = 0; i < 60 * 30; i++) {
      step(sys, w, phys);
      if (prev !== 'chargeWind' && stag.state === 'chargeWind') charges++;
      if (prev !== 'volleyAim' && stag.state === 'volleyAim') volleys++;
      prev = stag.state;
    }
    // 一版是"两招一起重置冷却",冷却短的总先就绪 → 弹幕永远轮不到(这条测试就是为它写的)
    expect(charges, '30 秒至少冲 3 次').toBeGreaterThanOrEqual(3);
    expect(volleys, '30 秒至少放 3 次弹幕').toBeGreaterThanOrEqual(3);
  });

  it('半血狂怒:阶段切到 2,弹幕变多,冲速变快', () => {
    const { w, se, stag } = makeWorld(120, 200, 420, 200);
    const sys = new MidBossSystem();
    const hp = w.mustGet(se, Health);
    hp.hp = hp.max * (S.phase2At - 0.1);
    run(sys, w, 0.2);
    expect(stag.phase).toBe(2);

    // 直接比"一招打了多少发":狂怒应该多 enrageVolleyAdd 发
    const before = w.query(Projectile).length;
    stag.chargeCd = 99;
    stag.volleyCd = 0.01;
    run(sys, w, 1.2);
    const enragedShots = w.query(Projectile).length - before;
    expect(enragedShots, '狂怒 = 5 + 2 = 7 发').toBe(S.volley.count + S.enrageVolleyAdd);
    expect(enragedShots).toBeGreaterThanOrEqual(7);
  });

  it('被打晕(stun)时立刻进硬直,且不再推进(docs:控制 = 输出窗口)', () => {
    const { w, se, stag } = makeWorld(200, 200, 600, 200);
    const sys = new MidBossSystem();
    stag.chargeCd = 99;
    stag.volleyCd = 99;
    const buffs = w.mustGet(se, Buffs);
    buffs.stunT = 1.5;
    run(sys, w, 0.1);
    expect(stag.state).toBe('stagger');
    const x0 = w.mustGet(se, Transform).x;
    run(sys, w, 0.2);
    expect(w.mustGet(se, Transform).x, '硬直期间不该位移').toBeCloseTo(x0, 5);
  });
});

/** nanmir 的攻击力(一章 Boss 挂在 balance.boss 下) */
function nanmarAtk(n: { atk: number }): number {
  return n.atk;
}

/* ================= 二章中 Boss 霜噬女猎(轮 13) ================= */

import { MidBossHuntress } from '@game/components';
import { MidBossHuntressSystem } from '@game/systems/MidBossHuntressSystem';

const H = balance.enemies.midboss_frosthuntress;

function makeHuntressWorld(hx: number, hy: number, px: number, py: number) {
  const w = new World();
  const pe = w.create();
  w.add(pe, new Transform(px, py));
  w.add(pe, new Velocity());
  w.add(pe, new Body(0.3));
  w.add(pe, new Health(200));
  w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
  w.add(pe, new Faction('player'));
  w.add(pe, new Player());

  const he = w.create();
  w.add(he, new Transform(hx, hy));
  w.add(he, new Velocity());
  w.add(he, new Body(H.bodyRadius));
  w.add(he, new Health(Math.round(H.hp)));
  w.add(he, new Stats(H.atk, H.speed, 0, 1, H.def));
  w.add(he, new Faction('enemy'));
  w.add(he, new Buffs());
  const hnt = new MidBossHuntress();
  hnt.spawnX = hx;
  hnt.spawnY = hy;
  w.add(he, hnt);
  return { w, pe, he, hnt };
}

function runH(sys: MidBossHuntressSystem, w: World, seconds: number): void {
  const dt = 1 / 60;
  const phys = new PhysicsSystem();
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sys.update(w, dt);
    phys.update(w, dt);
  }
}

describe('中 Boss 霜噬女猎 · 数据契约', () => {
  it('balance 条目齐全(数值块不能少,少一块 AI 会读 undefined)', () => {
    for (const key of ['hp', 'atk', 'def', 'speed', 'bodyRadius', 'kiteM', 'phase2At', 'runeDrop'] as const) {
      expect(H[key], `缺 ${key}`).toBeTypeOf('number');
    }
    expect(H.blink.rangeM).toBeGreaterThan(0);
    expect(H.arrows.count).toBeGreaterThanOrEqual(2);
    expect(H.traps.count).toBeGreaterThanOrEqual(2);
    expect(H.mark.segments).toBeGreaterThanOrEqual(4);
  });

  it('定位正确:比精英肉、比章 Boss 轻(她是二章的"半个 Boss")', () => {
    expect(H.hp).toBeGreaterThan(balance.enemies.oakgolem.hp * 1.5);
    expect(H.hp).toBeLessThan(balance.enemies.boss_velsha.hp * 0.6);
  });

  it('可读性硬约束:陷阱预警/蓄力时长/打断硬直都要给够反应时间', () => {
    expect(H.traps.telegraphS).toBeGreaterThanOrEqual(0.5);
    expect(H.mark.channelS, '蓄力短于 1.2s 玩家根本来不及做打断决策').toBeGreaterThanOrEqual(1.2);
    expect(H.mark.interruptStunS, '打断奖励窗口不能小于 1.2s,否则博弈不值').toBeGreaterThanOrEqual(1.2);
  });

  it('狂怒是"更凶"而不是"更弱"', () => {
    expect(H.enrageArrowAdd).toBeGreaterThanOrEqual(1);
    expect(H.enrageTrapAdd).toBeGreaterThanOrEqual(1);
    expect(H.enrageSpeedMul).toBeGreaterThan(1);
    expect(H.enrageCdMul).toBeLessThan(1);
  });

  it('图鉴:独立条目带 ★,有行为提示;与巨鹿风格互斥(近身 vs 风筝)', () => {
    expect(ENEMY_KEYS).toContain('midboss_frosthuntress');
    expect(isMidBossKey('midboss_frosthuntress')).toBe(true);
    expect(isBossKey('midboss_frosthuntress')).toBe(true);
    expect(ENEMY_HINT.midboss_frosthuntress).toBeTruthy();
    expect(enemyEntry('midboss_frosthuntress')?.name).toBe('霜噬女猎');
  });
});

describe('中 Boss 霜噬女猎 · 房间接线(二章门控)', () => {
  const mkWorldWithPlayer = () => {
    const w = new World();
    const pe = w.create();
    w.add(pe, new Transform(200, 200));
    w.add(pe, new Velocity());
    w.add(pe, new Body(0.3));
    w.add(pe, new Health(200));
    w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
    w.add(pe, new Faction('player'));
    w.add(pe, new Player());
    return { w, pe };
  };

  it('二章 midboss 房刷的是女猎不是巨鹿(章节决定中 Boss)', () => {
    const run = new RunManager(new ItemFactory(new Rng(7)));
    run.chapter = 2;
    const { w, pe } = mkWorldWithPlayer();
    run.startRoom(w, 'midboss', pe);
    expect(w.count(MidBossHuntress)).toBe(1);
    expect(w.count(MidBossStag), '二章不能再把巨鹿抬出来').toBe(0);
  });

  it('一章 midboss 房仍然是巨鹿(改二章不能把一章改坏)', () => {
    const run = new RunManager(new ItemFactory(new Rng(7)));
    run.chapter = 1;
    const { w, pe } = mkWorldWithPlayer();
    run.startRoom(w, 'midboss', pe);
    expect(w.count(MidBossStag)).toBe(1);
    expect(w.count(MidBossHuntress)).toBe(0);
  });

  it('打掉她才算清房(清房判定漏登记 = 门永不开)', () => {
    const run = new RunManager(new ItemFactory(new Rng(7)));
    run.chapter = 2;
    const { w, pe } = mkWorldWithPlayer();
    run.startRoom(w, 'midboss', pe);
    run.update(w, 1 / 60, pe);
    expect(run.cleared).toBe(false);
    for (const e of w.query(MidBossHuntress)) w.destroy(e);
    w.flushDestroyed();
    run.update(w, 1 / 60, pe);
    expect(run.cleared).toBe(true);
  });

  it('击杀掉落:必掉紫装 + 保底符文按她自己的表读(不是巨鹿的)', () => {
    const w = new World();
    const pe = w.create();
    w.add(pe, new Transform(200, 200));
    w.add(pe, new Velocity());
    w.add(pe, new Inventory());
    w.add(pe, new Player());
    w.emit(new KillEvent(200, 200, 'midboss_frosthuntress'));
    new LootSystem().update(w, 1 / 60);
    const picks = w.query(Pickup).map((e) => w.mustGet(e, Pickup));
    const items = picks.filter((p) => p.kind === 'item');
    const runes = picks.filter((p) => p.kind === 'rune');
    expect(items.some((p) => p.item?.rarity === 'epic'), '保底紫装').toBe(true);
    expect(runes.length, `保底符文 ×${H.runeDrop}`).toBeGreaterThanOrEqual(H.runeDrop);
  });
});

describe('中 Boss 霜噬女猎 · 行为(真跑 AI)', () => {
  it('kite:保持距离不贴脸(她是弓手,巨鹿的反面)', () => {
    const { w, pe, he, hnt } = makeHuntressWorld(300, 300, 380, 300);
    const sys = new MidBossHuntressSystem();
    hnt.blinkCd = 99; hnt.trapCd = 99; hnt.markCd = 99;
    runH(sys, w, 2.0);
    const d = Math.hypot(
      w.mustGet(he, Transform).x - w.mustGet(pe, Transform).x,
      w.mustGet(he, Transform).y - w.mustGet(pe, Transform).y,
    );
    expect(hnt.state).toBe('kite');
    expect(d, '开局贴脸也要拉开到 >2m').toBeGreaterThan(2 * M);
  });

  it('瞬影冰矢:蹲身预警 → 瞬步拉开 → 三连冰矢(每发都是投影物)', () => {
    const { w, he, hnt } = makeHuntressWorld(300, 300, 420, 300);
    const sys = new MidBossHuntressSystem();
    hnt.blinkCd = 0.02; hnt.trapCd = 99; hnt.markCd = 99;
    const x0 = w.mustGet(he, Transform).x;
    const seen = new Set<string>();
    const phys = new PhysicsSystem();
    let arrows = 0;
    for (let i = 0; i < 60 * 3; i++) {
      sys.update(w, 1 / 60);
      phys.update(w, 1 / 60);
      seen.add(hnt.state);
      arrows = Math.max(arrows, w.query(Projectile).length);
    }
    expect([...seen]).toContain('blinkWind');
    expect([...seen]).toContain('shoot');
    expect(arrows, '三连冰矢都要真的射出来').toBeGreaterThanOrEqual(H.arrows.count);
    expect(Math.abs(w.mustGet(he, Transform).x - x0), '瞬步必须真的位移了').toBeGreaterThan(1.5 * M);
  });

  it('冰牙陷阵:玩家脚下 + 环绕,共 count 处冰爆预警', () => {
    const { w, hnt } = makeHuntressWorld(200, 200, 500, 200);
    const sys = new MidBossHuntressSystem();
    hnt.blinkCd = 99; hnt.trapCd = 0.02; hnt.markCd = 99;
    runH(sys, w, 1.0);
    expect(w.count(TelegraphStrike)).toBeGreaterThanOrEqual(H.traps.count);
  });

  it('猎杀凝视:蓄力铺直线冰枪 + 受伤加深;蓄满后冰枪留场结算', () => {
    const { w, he, hnt } = makeHuntressWorld(200, 200, 500, 200);
    const sys = new MidBossHuntressSystem();
    hnt.blinkCd = 99; hnt.trapCd = 99; hnt.markCd = 0.02;
    runH(sys, w, 0.3);
    expect(hnt.state).toBe('markChannel');
    expect(w.count(TelegraphStrike), '直线段数').toBeGreaterThanOrEqual(H.mark.segments);
    expect(w.mustGet(he, Buffs).vulnT, '蓄力 = 受伤加深(要害亮出来)').toBeGreaterThan(0);
    runH(sys, w, H.mark.channelS + 0.2);
    expect(hnt.state === 'recover' || hnt.state === 'kite', '蓄满收招').toBe(true);
  });

  it('核心博弈:蓄力期间打她 → 打断 + 硬直 + 冰枪连预警一起撤掉', () => {
    const { w, he, hnt } = makeHuntressWorld(200, 200, 500, 200);
    const sys = new MidBossHuntressSystem();
    hnt.blinkCd = 99; hnt.trapCd = 99; hnt.markCd = 0.02;
    runH(sys, w, 0.3);
    expect(hnt.state).toBe('markChannel');
    // 玩家打了她一下(任何真实伤害都触发打断)
    w.mustGet(he, Health).hp -= 15;
    runH(sys, w, 0.1);
    expect(hnt.state, '被命中必须打断').toBe('stagger');
    expect(hnt.t, '打断给满硬直(这是玩家冲脸的报酬)').toBeGreaterThan(H.mark.interruptStunS - 0.2);
    expect(w.count(TelegraphStrike), '幽灵冰枪必须撤干净(只停动作会平白炸玩家一排)').toBe(0);
  });

  it('轮换回归:30 秒内三招各出现 ≥2 次(独立冷却只重置用掉的那招)', () => {
    const { w, hnt } = makeHuntressWorld(300, 300, 600, 320);
    const sys = new MidBossHuntressSystem();
    const used = { blink: 0, traps: 0, mark: 0 };
    let prev = hnt.state;
    const phys = new PhysicsSystem();
    for (let i = 0; i < 60 * 30; i++) {
      sys.update(w, 1 / 60);
      phys.update(w, 1 / 60);
      if (prev === 'kite' && hnt.state !== 'kite' && hnt.state !== 'stagger') {
        used[hnt.lastMove] += 1;
      }
      prev = hnt.state;
    }
    expect(used.blink, `瞬影冰矢:${JSON.stringify(used)}`).toBeGreaterThanOrEqual(2);
    expect(used.traps, `冰牙陷阵:${JSON.stringify(used)}`).toBeGreaterThanOrEqual(2);
    expect(used.mark, `猎杀凝视:${JSON.stringify(used)}`).toBeGreaterThanOrEqual(2);
  });

  it('被打晕(stun)时:蓄力中被控也要连预警一起撤(不能留幽灵冰枪)', () => {
    const { w, he, hnt } = makeHuntressWorld(200, 200, 500, 200);
    const sys = new MidBossHuntressSystem();
    hnt.blinkCd = 99; hnt.trapCd = 99; hnt.markCd = 0.02;
    runH(sys, w, 0.3);
    expect(hnt.state).toBe('markChannel');
    w.mustGet(he, Buffs).stunT = 1.0;
    runH(sys, w, 0.1);
    expect(hnt.state).toBe('stagger');
    expect(w.count(TelegraphStrike)).toBe(0);
  });
});

/* ================= 三章中 Boss 沙暴刽子(轮 16) ================= */

import { MidBossReaper } from '@game/components';
import { MidBossReaperSystem } from '@game/systems/MidBossReaperSystem';

const R3 = balance.enemies.midboss_sandreaper;

function makeReaperWorld(rx: number, ry: number, px: number, py: number) {
  const w = new World();
  const pe = w.create();
  w.add(pe, new Transform(px, py));
  w.add(pe, new Velocity());
  w.add(pe, new Body(0.3));
  w.add(pe, new Health(300));
  w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
  w.add(pe, new Faction('player'));
  w.add(pe, new Player());

  const re = w.create();
  w.add(re, new Transform(rx, ry));
  w.add(re, new Velocity());
  w.add(re, new Body(R3.bodyRadius));
  w.add(re, new Health(Math.round(R3.hp)));
  w.add(re, new Stats(R3.atk, R3.speed, 0, 1, R3.def));
  w.add(re, new Faction('enemy'));
  w.add(re, new Buffs());
  const rp = new MidBossReaper();
  rp.spawnX = rx;
  rp.spawnY = ry;
  w.add(re, rp);
  return { w, pe, re, rp };
}

function runR(sys: MidBossReaperSystem, w: World, seconds: number): void {
  const dt = 1 / 60;
  const phys = new PhysicsSystem();
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    sys.update(w, dt);
    phys.update(w, dt);
  }
}

describe('中 Boss 沙暴刽子 · 数据契约', () => {
  it('balance 条目齐全', () => {
    for (const key of ['hp', 'atk', 'def', 'speed', 'bodyRadius', 'stalkM', 'phase2At', 'runeDrop'] as const) {
      expect(R3[key], `缺 ${key}`).toBeTypeOf('number');
    }
    expect(R3.hook.pullV).toBeGreaterThan(0);
    expect(R3.cleave.missStunS, '劈空硬直必须显著长于命中(否则博弈不成立)').toBeGreaterThan(R3.cleave.hitStunS * 2);
    expect(R3.storm.count).toBeGreaterThanOrEqual(2);
  });

  it('定位:比精英肉、比章 Boss 轻;三位中 Boss 血量随章递增', () => {
    expect(R3.hp).toBeGreaterThan(balance.enemies.oakgolem.hp * 1.5);
    expect(R3.hp).toBeLessThan(balance.enemies.boss_kazra.hp * 0.6);
    expect(R3.hp).toBeGreaterThanOrEqual(balance.enemies.midboss_frosthuntress.hp);
    expect(balance.enemies.midboss_frosthuntress.hp).toBeGreaterThanOrEqual(balance.enemies.midboss_mossstag.hp);
  });

  it('可读性:钩/斩预警给够反应时间;狂怒是更凶', () => {
    expect(R3.hook.telegraphS).toBeGreaterThanOrEqual(0.4);
    expect(R3.cleave.telegraphS).toBeGreaterThanOrEqual(0.6);
    expect(R3.enrageHookSpeedMul).toBeGreaterThan(1);
    expect(R3.enrageStormAdd).toBeGreaterThanOrEqual(1);
    expect(R3.enrageCdMul).toBeLessThan(1);
  });

  it('图鉴:独立条目带 ★;三位中 Boss 各归各章', () => {
    expect(ENEMY_KEYS).toContain('midboss_sandreaper');
    expect(isMidBossKey('midboss_sandreaper')).toBe(true);
    expect(ENEMY_HINT.midboss_sandreaper).toBeTruthy();
    expect(enemyEntry('midboss_sandreaper')?.name).toBe('沙暴刽子');
  });
});

describe('中 Boss 沙暴刽子 · 房间接线(三章门控全开)', () => {
  const mkWorldWithPlayer = () => {
    const w = new World();
    const pe = w.create();
    w.add(pe, new Transform(200, 200));
    w.add(pe, new Velocity());
    w.add(pe, new Body(0.3));
    w.add(pe, new Health(200));
    w.add(pe, new Stats(10, 4.2, 0.05, 1.8, 0));
    w.add(pe, new Faction('player'));
    w.add(pe, new Player());
    return { w, pe };
  };

  it('三章 midboss 房刷的是刽子(且不带前两位)', () => {
    const run = new RunManager(new ItemFactory(new Rng(7)));
    run.chapter = 3;
    const { w, pe } = mkWorldWithPlayer();
    run.startRoom(w, 'midboss', pe);
    expect(w.count(MidBossReaper)).toBe(1);
    expect(w.count(MidBossStag) + w.count(MidBossHuntress)).toBe(0);
  });

  it('打掉他才算清房', () => {
    const run = new RunManager(new ItemFactory(new Rng(7)));
    run.chapter = 3;
    const { w, pe } = mkWorldWithPlayer();
    run.startRoom(w, 'midboss', pe);
    run.update(w, 1 / 60, pe);
    expect(run.cleared).toBe(false);
    for (const e of w.query(MidBossReaper)) w.destroy(e);
    w.flushDestroyed();
    run.update(w, 1 / 60, pe);
    expect(run.cleared).toBe(true);
  });

  it('击杀掉落:必掉紫装 + 保底符文(按 kind 读表)', () => {
    const w = new World();
    const pe = w.create();
    w.add(pe, new Transform(200, 200));
    w.add(pe, new Velocity());
    w.add(pe, new Inventory());
    w.add(pe, new Player());
    w.emit(new KillEvent(200, 200, 'midboss_sandreaper'));
    new LootSystem().update(w, 1 / 60);
    const picks = w.query(Pickup).map((e) => w.mustGet(e, Pickup));
    expect(picks.filter((p) => p.kind === 'item').some((p) => p.item?.rarity === 'epic')).toBe(true);
    expect(picks.filter((p) => p.kind === 'rune').length).toBeGreaterThanOrEqual(R3.runeDrop);
  });
});

describe('中 Boss 沙暴刽子 · 行为(真跑 AI)', () => {
  it('沙缚镰钩:直线预警 → 钩命中把玩家拉近(位移是这招的全部意义)', () => {
    const { w, pe, re, rp } = makeReaperWorld(200, 400, 480, 400);
    const sys = new MidBossReaperSystem();
    rp.hookCd = 0.02; rp.cleaveCd = 99; rp.stormCd = 99;
    const d0 = Math.hypot(
      w.mustGet(pe, Transform).x - w.mustGet(re, Transform).x,
      w.mustGet(pe, Transform).y - w.mustGet(re, Transform).y,
    );
    const hp0 = w.mustGet(pe, Health).hp;
    runR(sys, w, 2.5);
    const d1 = Math.hypot(
      w.mustGet(pe, Transform).x - w.mustGet(re, Transform).x,
      w.mustGet(pe, Transform).y - w.mustGet(re, Transform).y,
    );
    expect(w.mustGet(pe, Health).hp, '被钩中要掉血').toBeLessThan(hp0);
    expect(d1, `钩中后距离要显著变近(${(d0 / M).toFixed(1)}m → ${(d1 / M).toFixed(1)}m)`).toBeLessThan(d0 * 0.7);
  });

  it('处刑斩:锁落点亮大圆 → 跳劈过去;玩家躲开 = 刀卡沙满硬直(核心博弈)', () => {
    const { w, pe, rp } = makeReaperWorld(300, 400, 500, 400);
    const sys = new MidBossReaperSystem();
    rp.hookCd = 99; rp.cleaveCd = 0.02; rp.stormCd = 99;
    const phys = new PhysicsSystem();
    const pTr = w.mustGet(pe, Transform);
    let staggeredAt = -1;
    let dodged = false;
    for (let i = 0; i < 60 * 4; i++) {
      // 预警一亮就横向滚开(离开处刑圈)
      if (rp.state === 'cleaveWind' && !dodged) {
        pTr.y = 400 + 3.5 * M;
        dodged = true;
      }
      sys.update(w, 1 / 60);
      phys.update(w, 1 / 60);
      if (rp.state === 'stagger' && staggeredAt < 0) staggeredAt = rp.t;
    }
    expect(dodged, '处刑斩必须真的来过').toBe(true);
    expect(staggeredAt, '劈空 = 满硬直(missStunS)').toBeGreaterThan(R3.cleave.missStunS - 0.2);
  });

  it('处刑斩命中只给半硬直(躲不掉就没奖励窗)', () => {
    const { w, rp } = makeReaperWorld(300, 400, 460, 400);
    const sys = new MidBossReaperSystem();
    rp.hookCd = 99; rp.cleaveCd = 0.02; rp.stormCd = 99;
    let staggeredAt = -1;
    const phys = new PhysicsSystem();
    for (let i = 0; i < 60 * 4; i++) {
      sys.update(w, 1 / 60);   // 玩家站桩挨劈
      phys.update(w, 1 / 60);
      if (rp.state === 'stagger' && staggeredAt < 0) staggeredAt = rp.t;
    }
    expect(staggeredAt).toBeGreaterThan(0);
    expect(staggeredAt, '命中 = 半硬直,不能白给满窗').toBeLessThan(R3.cleave.missStunS - 0.5);
  });

  it('沙暴漩涡:以自己为中心铺 ≥count 片沙暴区(领域封锁)', () => {
    const { w, rp } = makeReaperWorld(300, 400, 700, 400);
    const sys = new MidBossReaperSystem();
    rp.hookCd = 99; rp.cleaveCd = 99; rp.stormCd = 0.02;
    runR(sys, w, 1.2);
    expect(w.count(Zone)).toBeGreaterThanOrEqual(R3.storm.count);
  });

  it('轮换回归:35 秒内三招各 ≥2 次', () => {
    const { w, rp } = makeReaperWorld(300, 300, 620, 330);
    const sys = new MidBossReaperSystem();
    const used = { hook: 0, cleave: 0, storm: 0 };
    let prev = rp.state;
    const phys = new PhysicsSystem();
    for (let i = 0; i < 60 * 35; i++) {
      sys.update(w, 1 / 60);
      phys.update(w, 1 / 60);
      if (prev === 'stalk' && rp.state !== 'stalk' && rp.state !== 'stagger') used[rp.lastMove] += 1;
      prev = rp.state;
    }
    expect(used.hook, JSON.stringify(used)).toBeGreaterThanOrEqual(2);
    expect(used.cleave, JSON.stringify(used)).toBeGreaterThanOrEqual(2);
    expect(used.storm, JSON.stringify(used)).toBeGreaterThanOrEqual(2);
  });

  it('被打晕立刻硬直,钩不再推进(控制 = 输出窗口)', () => {
    const { w, re, rp } = makeReaperWorld(200, 200, 600, 200);
    const sys = new MidBossReaperSystem();
    rp.hookCd = 99; rp.cleaveCd = 99; rp.stormCd = 99;
    w.mustGet(re, Buffs).stunT = 1.2;
    runR(sys, w, 0.1);
    expect(rp.state).toBe('stagger');
  });
});
