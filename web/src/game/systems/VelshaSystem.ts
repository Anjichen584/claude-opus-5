import type { System, World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { elementColor } from '@game/combat/Elements';
import {
  BossPhaseEvent,
  Body, BossVelsha, Buffs, ElementMarks, Faction, Health, Player, Projectile, SfxEvent,
  SnowPuff, Stats, TelegraphStrike, ToastEvent, Transform, Velocity, Zone,
} from '@game/components';
import { PlayerSystem } from './PlayerSystem';

const B = balance.enemies.boss_velsha;

/**
 * 第二章 Boss 霜语女妖·薇尔莎:
 * P1 八向冰弹环 + 漂浮追踪;
 * P2(<65%)+ 暴风雪预警区 + 召唤雪绒球;
 * P3(<30%)冲锋强化,全技能加速。
 */
export class VelshaSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;

    for (const e of world.query(BossVelsha, Transform, Velocity, Stats, Health, Body)) {
      const boss = world.mustGet(e, BossVelsha);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const hp = world.mustGet(e, Health);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      boss.animT += dt;
      if (!pAlive) { vel.vx = 0; vel.vy = 0; continue; }

      // ---- 阶段切换 ----
      const ratio = hp.hp / hp.max;
      if (boss.phase === 1 && ratio <= B.phase2At) {
        boss.phase = 2;
        world.emit(new ToastEvent('❄ 薇尔莎:「让暴风雪…吞没你」', '#8fdcff'));
        world.emit(new BossPhaseEvent('冰语女王 · 薇尔莎', 2, '「暴风雪」', '#8fdcff', tr.x, tr.y));
        world.emit(new SfxEvent('ult'));
      } else if (boss.phase === 2 && ratio <= B.phase3At) {
        boss.phase = 3;
        world.emit(new ToastEvent('❄❄ 薇尔莎狂怒:寒风呼啸!', '#8fdcff'));
        world.emit(new BossPhaseEvent('冰语女王 · 薇尔莎', 3, '「寒风冲锋」', '#bfe8ff', tr.x, tr.y));
        world.emit(new SfxEvent('ult'));
      }
      const haste = boss.phase === 3 ? 0.65 : 1; // P3 全冷却×0.65

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      tr.face = Math.atan2(dy, dx);
      const stunned = buffs !== undefined && buffs.stunT > 0;

      switch (boss.state) {
        case 'float': {
          // 漂浮保持 3~5m
          let mx = 0;
          let my = 0;
          if (dist > 5 * M) { mx = dx / dist; my = dy / dist; }
          else if (dist < 3 * M) { mx = -dx / dist; my = -dy / dist; }
          vel.vx = mx * stats.moveSpeed * M * (stunned ? 0 : 1);
          vel.vy = my * stats.moveSpeed * M * (stunned ? 0 : 1);
          if (stunned) break;

          // 冰弹环
          boss.volleyCd -= dt;
          if (boss.volleyCd <= 0) {
            boss.volleyCd = B.volley.cd * haste;
            const n = B.volley.count + (boss.phase === 3 ? 4 : 0);
            const offset = Math.random() * Math.PI * 2;
            for (let i = 0; i < n; i++) {
              const a = offset + (i / n) * Math.PI * 2;
              const pj = world.create();
              world.add(pj, new Transform(tr.x, tr.y - 30));
              const v = new Velocity();
              v.vx = Math.cos(a) * B.volley.speedM * M;
              v.vy = Math.sin(a) * B.volley.speedM * M;
              world.add(pj, v);
              world.add(pj, new Projectile('enemy', stats.atk, B.volley.mult, 'ice',
                B.volley.radiusM * M, B.volley.lifeS, elementColor('ice')));
            }
            world.emit(new SfxEvent('skill'));
          }

          // P2+:暴风雪预警区(落点=玩家周围)
          if (boss.phase >= 2) {
            boss.blizzardCd -= dt;
            if (boss.blizzardCd <= 0) {
              boss.blizzardCd = B.blizzard.cd * haste;
              for (let i = 0; i < B.blizzard.count; i++) {
                const a = Math.random() * Math.PI * 2;
                const r = Math.random() * 1.8 * M;
                const zx = ptr.x + Math.cos(a) * r;
                const zy = ptr.y + Math.sin(a) * r;
                const tg = world.create();
                world.add(tg, new Transform(zx, zy));
                world.add(tg, new TelegraphStrike(B.blizzard.telegraphS, B.blizzard.radiusM * M,
                  stats.atk, B.blizzard.mult, 'enemy', elementColor('ice')));
                // 爆发后残留冰雾
                this.delayZone(world, B.blizzard.telegraphS, zx, zy, stats.atk);
              }
            }

            // 召唤雪绒球
            boss.summonCd -= dt;
            if (boss.summonCd <= 0 && world.count(SnowPuff) < 4) {
              boss.summonCd = B.summon.cd * haste;
              const cfg = balance.enemies.snowpuff;
              for (let i = 0; i < B.summon.count; i++) {
                const a = Math.random() * Math.PI * 2;
                const s = world.create();
                world.add(s, new Transform(tr.x + Math.cos(a) * 60, tr.y + Math.sin(a) * 60));
                world.add(s, new Velocity());
                world.add(s, new Body(cfg.bodyRadius));
                world.add(s, new Health(cfg.hp));
                world.add(s, new Stats(cfg.atk, cfg.speed, 0, 1, cfg.def));
                world.add(s, new Faction('enemy'));
                world.add(s, new ElementMarks());
                world.add(s, new Buffs());
                world.add(s, new SnowPuff());
              }
              world.emit(new ToastEvent('薇尔莎召唤了雪绒球!', '#8fdcff'));
            }
          }

          // P3:寒风冲锋
          if (boss.phase >= 3) {
            boss.chargeCd -= dt;
            if (boss.chargeCd <= 0 && dist > 2 * M) {
              boss.chargeCd = B.charge.cd * haste;
              boss.state = 'chargeTele';
              boss.t = B.charge.telegraphS;
              boss.dashX = dx / dist;
              boss.dashY = dy / dist;
            }
          }
          break;
        }
        case 'chargeTele': {
          vel.vx = 0;
          vel.vy = 0;
          boss.t -= dt;
          if (boss.t <= 0) {
            boss.state = 'charge';
            boss.t = B.charge.dur;
            world.emit(new SfxEvent('dash'));
          }
          break;
        }
        case 'charge': {
          vel.vx = boss.dashX * B.charge.speedM * M;
          vel.vy = boss.dashY * B.charge.speedM * M;
          boss.t -= dt;
          if (dist < body.radius * M + 0.3 * M + 6) {
            PlayerSystem.applyHurt(world, pe, stats.atk * 1.4);
          }
          if (boss.t <= 0) boss.state = 'float';
          break;
        }
      }
    }
  }

  /** 暴风雪爆点残留冰雾(与 Telegraph 命中解耦,固定延迟生成) */
  private delayZone(world: World, delayS: number, x: number, y: number, atk: number): void {
    const timer = world.create();
    world.add(timer, new Transform(x, y));
    world.add(timer, new BlizzardTimer(delayS, atk));
  }
}

/** 内部计时器组件:到点生成冰雾 Zone */
export class BlizzardTimer {
  constructor(public t: number, public atk: number) {}
}

/** 推进 BlizzardTimer(挂在 VelshaSystem 后) */
export class BlizzardTimerSystem implements System {
  update(world: World, dt: number): void {
    for (const e of world.query(BlizzardTimer, Transform)) {
      const bt = world.mustGet(e, BlizzardTimer);
      bt.t -= dt;
      if (bt.t <= 0) {
        const tr = world.mustGet(e, Transform);
        const z = world.create();
        world.add(z, new Transform(tr.x, tr.y));
        world.add(z, new Zone(B.blizzard.radiusM * M, B.blizzard.zoneLifeS, B.blizzard.tickS,
          bt.atk, B.blizzard.zoneMult, 'ice', 'enemy', elementColor('ice')));
        world.destroy(e);
      }
    }
  }
}
