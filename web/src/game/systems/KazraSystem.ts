import type { System, World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { elementColor } from '@game/combat/Elements';
import {
  BossPhaseEvent,
  Body, BossKazra, Buffs, CinderRat, ElementMarks, Faction, Health, Player, Projectile,
  SfxEvent, Stats, TelegraphStrike, ToastEvent, Transform, Velocity, Zone,
} from '@game/components';
import { PlayerSystem } from './PlayerSystem';

const B = balance.enemies.boss_kazra;

/**
 * 第三章 Boss 熔核蝎皇·卡兹拉:
 * P1 三向火弹散射 + 地面追击;
 * P2(<65%)+ 钻地突袭(玩家脚下连环预警→换位钻出)+ 召唤烬鼠;
 * P3(<30%)移动淌熔痕 + 五向散射 + 全冷却×0.7。
 */
export class KazraSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;
    const pBody = world.get(pe, Body);
    const pr = (pBody?.radius ?? 0.3) * M;

    for (const e of world.query(BossKazra, Transform, Velocity, Stats, Health, Body)) {
      const boss = world.mustGet(e, BossKazra);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const hp = world.mustGet(e, Health);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      boss.animT += dt;
      if (!pAlive) { vel.vx = 0; vel.vy = 0; continue; }

      const ratio = hp.hp / hp.max;
      if (boss.phase === 1 && ratio <= B.phase2At) {
        boss.phase = 2;
        world.emit(new ToastEvent('🔥 卡兹拉钻入流沙……小心脚下!', '#ff9a6b'));
        world.emit(new BossPhaseEvent('烬语暴君 · 卡兹拉', 2, '「流沙突袭」', '#ff9a6b', tr.x, tr.y));
        world.emit(new SfxEvent('ult'));
      } else if (boss.phase === 2 && ratio <= B.phase3At) {
        boss.phase = 3;
        world.emit(new ToastEvent('🔥🔥 卡兹拉熔核暴走:大地在燃烧!', '#ff9a6b'));
        world.emit(new BossPhaseEvent('烬语暴君 · 卡兹拉', 3, '「熔核暴走」', '#ff5f3f', tr.x, tr.y));
        world.emit(new SfxEvent('ult'));
      }
      const haste = boss.phase === 3 ? 0.7 : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      tr.face = Math.atan2(dy, dx);
      const stunned = buffs !== undefined && buffs.stunT > 0;

      // P3:移动淌熔痕
      if (boss.phase >= 3 && boss.state === 'walk') {
        boss.trailT -= dt;
        if (boss.trailT <= 0 && Math.hypot(vel.vx, vel.vy) > 20) {
          boss.trailT = B.trail.intervalS;
          const z = world.create();
          world.add(z, new Transform(tr.x, tr.y));
          world.add(z, new Zone(B.trail.radiusM * M, B.trail.lifeS, B.trail.tickS,
            stats.atk, B.trail.mult, 'fire', 'enemy', elementColor('fire')));
        }
      }

      switch (boss.state) {
        case 'walk': {
          if (stunned) { vel.vx = 0; vel.vy = 0; break; }
          // 追击(保持 2.5m 内贴身钳击)
          const keep = dist > 2.5 * M;
          vel.vx = keep ? (dx / dist) * stats.moveSpeed * M : 0;
          vel.vy = keep ? (dy / dist) * stats.moveSpeed * M : 0;

          // 钳击接触
          if (dist < body.radius * M + pr + 6) {
            PlayerSystem.applyHurt(world, pe, stats.atk * 0.9);
          }

          // 三/五向火弹散射
          boss.volleyCd -= dt;
          if (boss.volleyCd <= 0) {
            boss.volleyCd = B.volley.cd * haste;
            const n = B.volley.count + (boss.phase === 3 ? 2 : 0);
            const spread = (B.volley.spreadDeg * Math.PI) / 180;
            const base = Math.atan2(dy, dx);
            for (let i = 0; i < n; i++) {
              const a = base + (i - (n - 1) / 2) * spread;
              const pj = world.create();
              world.add(pj, new Transform(tr.x + Math.cos(a) * 30, tr.y + Math.sin(a) * 30 - 16));
              const v = new Velocity();
              v.vx = Math.cos(a) * B.volley.speedM * M;
              v.vy = Math.sin(a) * B.volley.speedM * M;
              world.add(pj, v);
              world.add(pj, new Projectile('enemy', stats.atk, B.volley.mult, 'fire',
                B.volley.radiusM * M, B.volley.lifeS, elementColor('fire')));
            }
            world.emit(new SfxEvent('skill'));
          }

          // P2+:钻地突袭
          if (boss.phase >= 2) {
            boss.burrowCd -= dt;
            if (boss.burrowCd <= 0) {
              boss.burrowCd = B.burrow.cd * haste;
              boss.state = 'burrowing';
              boss.divesLeft = B.burrow.dives;
              boss.t = 0.4;
              world.emit(new SfxEvent('dash'));
            }
            // 召唤烬鼠
            boss.summonCd -= dt;
            if (boss.summonCd <= 0 && world.count(CinderRat) < 5) {
              boss.summonCd = B.summon.cd * haste;
              const cfg = balance.enemies.cinderrat;
              for (let i = 0; i < B.summon.count; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = world.create();
                world.add(s, new Transform(tr.x + Math.cos(a) * 70, tr.y + Math.sin(a) * 70));
                world.add(s, new Velocity());
                world.add(s, new Body(cfg.bodyRadius));
                world.add(s, new Health(cfg.hp));
                world.add(s, new Stats(cfg.atk, cfg.speed, 0, 1, cfg.def));
                world.add(s, new Faction('enemy'));
                world.add(s, new ElementMarks());
                world.add(s, new Buffs());
                world.add(s, new CinderRat());
              }
              world.emit(new ToastEvent('卡兹拉唤出了烬鼠群!', '#ff9a6b'));
            }
          }
          break;
        }
        case 'burrowing': { // 地下潜行:0.4s 后在玩家脚下放预警
          vel.vx = 0;
          vel.vy = 0;
          boss.t -= dt;
          if (boss.t <= 0) {
            const tg = world.create();
            world.add(tg, new Transform(ptr.x, ptr.y));
            world.add(tg, new TelegraphStrike(B.burrow.telegraphS, B.burrow.radiusM * M,
              stats.atk, B.burrow.mult, 'enemy', elementColor('fire')));
            boss.divesLeft--;
            boss.state = 'emergeTele';
            boss.t = B.burrow.telegraphS + 0.1;
            // 记录钻出点 = 本次预警中心
            boss.trailT = 0;
            tr.x = ptr.x; // 直接位移到目标(地下无碰撞)
            tr.y = ptr.y;
            tr.prevX = tr.x;
            tr.prevY = tr.y;
          }
          break;
        }
        case 'emergeTele': {
          vel.vx = 0;
          vel.vy = 0;
          boss.t -= dt;
          if (boss.t <= 0) {
            if (boss.divesLeft > 0) {
              boss.state = 'burrowing';
              boss.t = 0.35;
            } else {
              boss.state = 'walk';
              world.emit(new SfxEvent('reaction'));
            }
          }
          break;
        }
      }
    }
  }
}
