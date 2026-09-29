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
