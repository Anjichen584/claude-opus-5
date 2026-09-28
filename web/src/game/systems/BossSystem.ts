import type { System, World, Entity } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import {
  Body, BossNanmir, Buffs, ElementMarks, Faction, Health, Player, SfxEvent, Shroomling,
  Stats, TelegraphStrike, ToastEvent, Transform, Velocity,
} from '@game/components';
import { scaleAtk, scaleHp } from '@game/dungeon/Scaling';
import { clock } from '@game/dungeon/Clock';

const B = balance.boss.nanmir;

/**
 * Boss 三阶段状态机(docs/01-GDD.md §8 / docs/03 §7):
 * P1 藤鞭横扫+根须直线 → P2(65%) 召唤菇灵+地刺矩阵 → P3(30%) 根须风暴。
 * 阶段转换硬直 2s(输出窗口)。所有攻击走 TelegraphStrike 预警。
 */
export class BossSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform);
    if (players.length === 0) return;
    const ptr = world.mustGet(players[0], Transform);
    const pAlive = world.mustGet(players[0], Player).respawnT <= 0;

    for (const e of world.query(BossNanmir, Transform, Velocity, Health, Stats)) {
      const boss = world.mustGet(e, BossNanmir);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const hp = world.mustGet(e, Health);
      const stats = world.mustGet(e, Stats);
      boss.animT += dt;
      vel.vx = 0;
      vel.vy = 0;

      // ---- 阶段转换(硬直 = 输出窗口) ----
      const ratio = hp.hp / hp.max;
      if (boss.phase === 1 && ratio <= B.phase2At) {
        boss.phase = 2;
        boss.state = 'stagger';
        boss.t = B.staggerS;
        world.emit(new ToastEvent('南弥尔踉跄了!全力输出!', '#ffd94f'));
        world.emit(new SfxEvent('ult'));
      } else if (boss.phase === 2 && ratio <= B.phase3At) {
        boss.phase = 3;
        boss.state = 'stagger';
        boss.t = B.staggerS;
        world.emit(new ToastEvent('南弥尔狂暴了!', '#e05f5f'));
        world.emit(new SfxEvent('ult'));
      }

      if (!pAlive) continue;

      switch (boss.state) {
        case 'stagger': {
          boss.t -= dt;
          if (boss.t <= 0) {
            boss.state = 'idle';
            boss.t = B.idleS;
          }
          break;
        }
        case 'idle': {
          // 缓慢逼近
          const dx = ptr.x - tr.x;
          const dy = ptr.y - tr.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist > 3 * M) {
            vel.vx = (dx / dist) * B.speed * M;
            vel.vy = (dy / dist) * B.speed * M;
          }
          tr.face = Math.atan2(dy, dx);
          boss.t -= dt;
          if (boss.t <= 0) {
            this.cast(world, e, boss, tr, stats, ptr);
            boss.state = 'cast';
          }
          break;
        }
        case 'cast': {
          boss.t -= dt; // 施法后摇
          if (boss.t <= 0) {
            boss.state = 'idle';
            boss.t = B.idleS * (boss.phase === 3 ? 0.7 : 1);
          }
          break;
        }
      }
    }
  }

  /** 按阶段轮换攻击模式 */
  private cast(world: World, e: Entity, boss: BossNanmir, tr: Transform, stats: Stats, ptr: Transform): void {
    const patterns: Array<() => number> = [];
    patterns.push(() => this.vineSweep(world, tr, stats));
    patterns.push(() => this.rootLine(world, tr, stats, ptr));
    if (boss.phase >= 2) {
      patterns.push(() => this.spikeGrid(world, stats, ptr));
      patterns.push(() => this.summon(world, tr));
    }
    if (boss.phase >= 3) {
      patterns.push(() => this.storm(world, tr, stats));
    }
    const pick = patterns[boss.attackIdx % patterns.length];
    boss.attackIdx++;
    boss.t = pick(); // 返回后摇时长
    void e;
  }

  /** P1 藤鞭横扫:面前 180° 弧形预警带 */
  private vineSweep(world: World, tr: Transform, stats: Stats): number {
    const cfg = B.sweep;
    for (let i = -2; i <= 2; i++) {
      const a = tr.face + (i * Math.PI) / 5;
      const ts = world.create();
      world.add(ts, new Transform(tr.x + Math.cos(a) * cfg.rangeM * M, tr.y + Math.sin(a) * cfg.rangeM * M));
      world.add(ts, new TelegraphStrike(cfg.telegraphS, cfg.radiusM * M, stats.atk, cfg.mult, 'enemy', '#8fd45f'));
    }
    return cfg.telegraphS + 0.4;
  }

  /** P1 根须直线:朝玩家方向连续地刺 */
  private rootLine(world: World, tr: Transform, stats: Stats, ptr: Transform): number {
    const cfg = B.rootline;
    const a = Math.atan2(ptr.y - tr.y, ptr.x - tr.x);
    for (let i = 1; i <= cfg.count; i++) {
      const ts = world.create();
      world.add(ts, new Transform(tr.x + Math.cos(a) * cfg.spacingM * i * M, tr.y + Math.sin(a) * cfg.spacingM * i * M));
      world.add(ts, new TelegraphStrike(cfg.telegraphS + cfg.stepS * i, cfg.radiusM * M, stats.atk, cfg.mult, 'enemy', '#8fd45f'));
    }
    return cfg.telegraphS + cfg.stepS * cfg.count + 0.3;
  }

  /** P2 地刺矩阵:玩家周围随机落点 */
  private spikeGrid(world: World, stats: Stats, ptr: Transform): number {
    const cfg = B.spikegrid;
    for (let i = 0; i < cfg.count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * cfg.spreadM * M;
      const ts = world.create();
      world.add(ts, new Transform(ptr.x + Math.cos(a) * r, ptr.y + Math.sin(a) * r));
      world.add(ts, new TelegraphStrike(cfg.telegraphS + Math.random() * 0.4, cfg.radiusM * M, stats.atk, cfg.mult, 'enemy', '#b880e8'));
    }
    return cfg.telegraphS + 0.6;
  }

  /** P2 召唤菇灵 */
  private summon(world: World, tr: Transform): number {
    const cfg = balance.enemies.shroomling;
    const night = clock.isNight();
    for (let i = 0; i < B.summonCount; i++) {
      const a = (i / B.summonCount) * Math.PI * 2;
      const e = world.create();
      world.add(e, new Transform(tr.x + Math.cos(a) * 2 * M, tr.y + Math.sin(a) * 2 * M));
      world.add(e, new Velocity());
      world.add(e, new Body(cfg.bodyRadius));
      world.add(e, new Health(scaleHp(cfg.hp, 8, night)));
      world.add(e, new Stats(scaleAtk(cfg.atk, 8, night), cfg.speed, 0, 1, cfg.def));
      world.add(e, new Faction('enemy'));
      world.add(e, new Shroomling());
      world.add(e, new ElementMarks());
      world.add(e, new Buffs());
    }
    world.emit(new SfxEvent('skill'));
    return 1.0;
  }

  /** P3 根须风暴:环形波次,留安全缺口 */
  private storm(world: World, tr: Transform, stats: Stats): number {
    const cfg = B.storm;
    const gapStart = Math.floor(Math.random() * cfg.perRing);
    cfg.rings.forEach((ringM, ringIdx) => {
      for (let i = 0; i < cfg.perRing; i++) {
        // 每环留 gapLanes 个缺口(错位旋转)
        const gi = (i - gapStart - ringIdx) % cfg.perRing;
        if (gi >= 0 && gi < cfg.gapLanes) continue;
        const a = (i / cfg.perRing) * Math.PI * 2;
        const ts = world.create();
        world.add(ts, new Transform(tr.x + Math.cos(a) * ringM * M, tr.y + Math.sin(a) * ringM * M));
        world.add(ts, new TelegraphStrike(cfg.telegraphS + ringIdx * 0.25, cfg.radiusM * M, stats.atk, cfg.mult, 'enemy', '#e05f5f'));
      }
    });
    return cfg.telegraphS + cfg.rings.length * 0.25 + 0.4;
  }
}
