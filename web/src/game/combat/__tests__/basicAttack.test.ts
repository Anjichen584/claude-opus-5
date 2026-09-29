import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { Entity, World } from '@engine/ecs/World';
import {
  Body, Buffs, Faction, Health, MeleeSweep, Player, Projectile, Stats, Transform, Velocity,
} from '@game/components';
import { CombatSystem } from '@game/systems/CombatSystem';
import { ProjectileSystem } from '@game/systems/ProjectileSystem';
import { M } from '@game/constants';
import {
  KLASS_KIND, basicSpec, comboStage, comboStep, describeBasic, lungeImpulse, moveSlowOf, shotStep,
} from '../BasicAttack';
import type { Klass } from '@game/meta/Leaderboard';

const B = balance as unknown as Parameters<typeof basicSpec>[1];

/**
 * 四职业普攻(10-FULL-PLAN 轮 2)。
 * 断言的是**行为差异**,不是数值好看:形态(近战/射击)、段数、穿透、溅射、破甲、减速。
 */
describe('职业档案(数据来自 balance,不硬编码)', () => {
  it('四个职业都有档案,近战走 combo、远程走 shot', () => {
    expect(Object.keys(KLASS_KIND).sort()).toEqual(['arcanist', 'blade', 'ranger', 'warden']);
    expect(basicSpec('blade', B).kind).toBe('combo');
    expect(basicSpec('warden', B).kind).toBe('combo');
    expect(basicSpec('ranger', B).kind).toBe('shot');
    expect(basicSpec('arcanist', B).kind).toBe('shot');
  });

  it('远程职业缺 bow 配置要直接报错(静默回退会把远程变成近战)', () => {
    const broken = { classes: { ranger: {} }, player: { combo: balance.player.combo } } as unknown as typeof B;
    expect(() => basicSpec('ranger', broken)).toThrow(/bow/);
  });

  it('近战职业缺专属 combo 时回退 player.combo(旧档/新职业都不会炸)', () => {
    const bare = { classes: { blade: {} }, player: { combo: balance.player.combo } } as unknown as typeof B;
    const spec = basicSpec('blade', bare);
    expect(spec.kind).toBe('combo');
    if (spec.kind === 'combo') expect(spec.mults).toEqual(balance.player.combo.mults);
  });
});

describe('剑士:三段连斩 + 终结段位移', () => {
  const spec = basicSpec('blade', B);
  it('三段循环:窗口内 1→2→3→1,超时回 1', () => {
    if (spec.kind !== 'combo') throw new Error('unreachable');
    expect(comboStage(0, 0, 3)).toBe(1);
    expect(comboStage(1, 0.5, 3)).toBe(2);
    expect(comboStage(2, 0.5, 3)).toBe(3);
    expect(comboStage(3, 0.5, 3)).toBe(1);
    expect(comboStage(2, 0, 3)).toBe(1); // 窗口过期 → 重新起手
  });

  it('只有终结段带击退与前冲,常规段不带', () => {
    if (spec.kind !== 'combo') throw new Error('unreachable');
    const s1 = comboStep(spec, 0, 0);
    const s3 = comboStep(spec, 2, 0.5);
    expect(s1.knockbackM).toBe(0);
    expect(s1.lunge3M).toBe(0);
    expect(lungeImpulse(s1)).toBe(0);
    expect(s3.knockbackM).toBeGreaterThan(0);
    expect(s3.lunge3M).toBeGreaterThan(0);
    expect(lungeImpulse(s3)).toBeGreaterThan(0);
  });

  it('前冲是可量化的速度脉冲(距离在 0.12s 内走完)', () => {
    if (spec.kind !== 'combo') throw new Error('unreachable');
    const s3 = comboStep(spec, 2, 0.5);
    const imp = lungeImpulse(s3);
    expect(imp * 0.12).toBeCloseTo(s3.lunge3M * M, 0); // v·t = 距离
  });

  it('剑士不破甲(那是守卫的活)', () => {
    if (spec.kind !== 'combo') throw new Error('unreachable');
    expect(comboStep(spec, 2, 0.5).vulnS).toBe(0);
  });
});

describe('守卫:慢速重击 + 破甲', () => {
  const spec = basicSpec('warden', B);
  it('终结段破甲,且前冲明显小于剑士(重甲位移小是设计)', () => {
    if (spec.kind !== 'combo') throw new Error('unreachable');
    const w3 = comboStep(spec, 2, 0.5);
    expect(w3.vulnS).toBeGreaterThan(0);
    const b3 = comboStep(basicSpec('blade', B) as never, 2, 0.5);
    expect(w3.lunge3M).toBeLessThan(b3.lunge3M);
    expect(w3.mult).toBeGreaterThan(b3.mult); // 单段更重
  });

  it('出招期间减速比剑士更狠(重锤抡起来收不住)', () => {
    expect(moveSlowOf(spec)).toBeLessThan(moveSlowOf(basicSpec('blade', B)));
  });
});

describe('猎手:走射 + 强化发穿透', () => {
  const spec = basicSpec('ranger', B);
  it('每第 N 发强化,其余普通', () => {
    if (spec.kind !== 'shot') throw new Error('unreachable');
    const stages = [1, 2, 3, 4].map((p) => shotStep(spec, p - 1));
    expect(stages.map((s) => s.stage)).toEqual([1, 2, 3, 4]);
    expect(stages.filter((s) => s.heavy)).toHaveLength(1);
    expect(stages[spec.heavyEvery - 1].heavy).toBe(true);
  });

  it('只有强化发穿透,普通发不穿透', () => {
    if (spec.kind !== 'shot') throw new Error('unreachable');
    const normal = shotStep(spec, 0);
    const heavy = shotStep(spec, spec.heavyEvery - 1);
    expect(normal.pierce).toBe(0);
    expect(heavy.pierce).toBeGreaterThan(0);
    expect(heavy.mult).toBeGreaterThan(normal.mult);
  });

  it('可走射(moveSlowPct = 1),且弹速明显快于秘术师法球', () => {
    if (spec.kind !== 'shot') throw new Error('unreachable');
    expect(spec.moveSlowPct).toBe(1);
    const arc = basicSpec('arcanist', B);
    if (arc.kind !== 'shot') throw new Error('unreachable');
    expect(spec.speedM).toBeGreaterThan(arc.speedM);
    expect(spec.splashM).toBe(0); // 猎手是单体,溅射是秘术师的特权
  });
});

describe('秘术师:慢法球 + 溅射 + 施法减速', () => {
  const spec = basicSpec('arcanist', B);
  it('每一发都带溅射(不区分强化),溅射半径来自 balance', () => {
    if (spec.kind !== 'shot') throw new Error('unreachable');
    expect(spec.splashM).toBeGreaterThan(0);
    expect(shotStep(spec, 0).splashM).toBe(spec.splashM);
    expect(shotStep(spec, spec.heavyEvery - 1).splashM).toBe(spec.splashM);
  });

  it('施法期间减速(定身感),不是走射', () => {
    if (spec.kind !== 'shot') throw new Error('unreachable');
    expect(spec.moveSlowPct).toBeLessThan(1);
    expect(moveSlowOf(spec)).toBeLessThan(1);
  });
});

describe('展示文案(UI 不再自己写一份)', () => {
  it('每个职业都能生成一句话描述,且提到自己的特征', () => {
    const texts: Record<Klass, string> = {
      blade: describeBasic(basicSpec('blade', B)),
      warden: describeBasic(basicSpec('warden', B)),
      ranger: describeBasic(basicSpec('ranger', B)),
      arcanist: describeBasic(basicSpec('arcanist', B)),
    };
    expect(texts.blade).toContain('3 段');
    expect(texts.warden).toContain('破甲');
    expect(texts.ranger).toContain('穿透');
    expect(texts.arcanist).toContain('溅射');
    expect(new Set(Object.values(texts)).size).toBe(4); // 四句话必须互不相同
  });
});

// ---------------- 端到端:穿透 / 溅射 / 破甲 真的在 World 里生效 ----------------

function makeEnemy(w: World, x: number, y: number, hp = 500): Entity {
  const e = w.create();
  w.add(e, new Transform(x, y));
  w.add(e, new Body(0.3));
  w.add(e, new Faction('enemy'));
  w.add(e, new Health(hp));
  w.add(e, new Stats(10, 0, 0, 1));
  w.add(e, new Buffs());
  return e;
}

function makeShot(w: World, x: number, y: number, vx: number, opts: { pierce?: number; splashM?: number; mult?: number } = {}): Entity {
  const e = w.create();
  w.add(e, new Transform(x, y));
  const v = new Velocity();
  v.vx = vx;
  v.vy = 0;
  w.add(e, v);
  const pr = new Projectile('player', 20, opts.mult ?? 1, null, 6, 2, '#fff', 'orb');
  pr.pierce = opts.pierce ?? 0;
  pr.splashM = opts.splashM ?? 0;
  w.add(e, pr);
  return e;
}

const step = (w: World, dt = 1 / 60): void => {
  w.clearEvents();
  new ProjectileSystem().update(w, dt);
  w.flushDestroyed(); // 真实主循环每 tick 调一次;不调的话"已销毁"的弹还会继续飞
};

describe('穿透与溅射(World 端到端)', () => {
  it('普通弹命中第一个目标即消失', () => {
    const w = new World();
    const a = makeEnemy(w, 30, 0);
    const b = makeEnemy(w, 90, 0);
    makeShot(w, 0, 0, 10 * M);
    for (let i = 0; i < 40; i++) step(w);
    expect(w.mustGet(a, Health).hp).toBeLessThan(500);
    expect(w.mustGet(b, Health).hp).toBe(500); // 没打到第二个
  });

  it('穿透弹连打两个目标,且不在同一目标身上重复结算', () => {
    const w = new World();
    const a = makeEnemy(w, 30, 0);
    const b = makeEnemy(w, 90, 0);
    makeShot(w, 0, 0, 10 * M, { pierce: 1 });
    let hitsA = 0;
    for (let i = 0; i < 40; i++) step(w);
    const hpA1 = w.mustGet(a, Health).hp;
    expect(hpA1).toBeLessThan(500);
    expect(w.mustGet(b, Health).hp).toBeLessThan(500); // 穿透到了第二个
    // 再跑一段(同一个弹已经销毁),A 不应继续掉血
    for (let i = 0; i < 20; i++) step(w);
    hitsA = hpA1 - w.mustGet(a, Health).hp;
    expect(hitsA).toBe(0);
  });

  it('溅射弹在命中点把旁边的敌人一起打到,但伤害低于本体', () => {
    const w = new World();
    const main = makeEnemy(w, 30, 0, 500);
    const near = makeEnemy(w, 30, 20, 500);   // 溅射半径内(0.9m ≈ 43px)
    const far = makeEnemy(w, 30, 120, 500);   // 半径外
    makeShot(w, 0, 0, 10 * M, { splashM: 0.9 });
    for (let i = 0; i < 20; i++) step(w);
    const dm = 500 - w.mustGet(main, Health).hp;
    const dn = 500 - w.mustGet(near, Health).hp;
    expect(dm).toBeGreaterThan(0);
    expect(dn).toBeGreaterThan(0);
    expect(dn).toBeLessThan(dm); // 溅射吃减伤倍率
    expect(w.mustGet(far, Health).hp).toBe(500);
  });
});

describe('破甲(守卫终结段)', () => {
  it('常规段不破甲;终结段命中后目标挂上 vulnT(与元素脆蚀共用同一条通道)', () => {
    const w = new World();
    const target = makeEnemy(w, 40, 0, 5000);
    const player = w.create();
    w.add(player, new Transform(0, 0));
    w.add(player, new Player());
    w.add(player, new Stats(20, 5, 1.5, 1));
    w.add(player, new Faction('player'));
    w.add(player, new Health(100));

    const spec = basicSpec('warden', B);
    if (spec.kind !== 'combo') throw new Error('unreachable');
    const combat = new CombatSystem();
    const swing = (st: ReturnType<typeof comboStep>): void => {
      w.clearEvents();
      w.emit(new MeleeSweep(
        player, 0, 0, 0, st.rangePx, st.arcRad, st.mult, st.stage, null, st.knockbackM, st.vulnS,
      ));
      combat.update(w, 1 / 60);
    };

    swing(comboStep(spec, 0, 0)); // 第 1 段
    expect(w.mustGet(target, Buffs).vulnT).toBe(0);

    swing(comboStep(spec, 2, 0.5)); // 第 3 段(重击)
    expect(w.mustGet(target, Buffs).vulnT).toBeCloseTo(spec.vuln3S, 3);
  });
});
