import type { System, World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import {
  Body, Faction, Health, Player, Projectile, PropObstacle, RingFxEvent, SfxEvent, Transform, Velocity,
} from '@game/components';
import { damageProp, propHp, terrain } from '@game/dungeon/Terrain';
import { dealDamage } from '@game/combat/DamagePipeline';
import { PlayerSystem } from './PlayerSystem';

/**
 * 通用弹幕:自积分直线飞行(不进物理分离,穿越同伴),
 * 命中对立阵营圆形体结算;超时/出界自毁。
 */
export class ProjectileSystem implements System {
  update(world: World, dt: number): void {
    const maxX = balance.arena.widthM * M;
    const maxY = balance.arena.heightM * M;

    for (const e of world.query(Projectile, Transform, Velocity)) {
      const pr = world.mustGet(e, Projectile);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);

      tr.prevX = tr.x;
      tr.prevY = tr.y;

      // 追踪转向(秘术师追星术等)
      if (pr.homing > 0) {
        let nearest: { x: number; y: number } | null = null;
        let nd = 6 * M;
        for (const t of world.query(Faction, Transform, Health)) {
          if (world.mustGet(t, Faction).team === pr.team) continue;
          const ttr = world.mustGet(t, Transform);
          const d = Math.hypot(ttr.x - tr.x, ttr.y - tr.y);
          if (d < nd) { nd = d; nearest = ttr; }
        }
        if (nearest) {
          const cur = Math.atan2(vel.vy, vel.vx);
          const want = Math.atan2(nearest.y - tr.y, nearest.x - tr.x);
          let diff = want - cur;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = Math.max(-pr.homing * dt, Math.min(pr.homing * dt, diff));
          const speed = Math.hypot(vel.vx, vel.vy);
          vel.vx = Math.cos(cur + turn) * speed;
          vel.vy = Math.sin(cur + turn) * speed;
        }
      }

      tr.x += vel.vx * dt;
      tr.y += vel.vy * dt;
      pr.lifeS -= dt * terrain.projAgeMul; // 沙暴(轮 15):飞行物射程缩短,双方公平

      if (pr.lifeS <= 0 || tr.x < 0 || tr.y < 0 || tr.x > maxX || tr.y > maxY) {
        world.destroy(e);
        continue;
      }

      // 撞上实心障碍:砸一发耐久,弹幕消失(远程也能拆墙,但要花弹药/时间)
      let hitProp = false;
      for (const pe of world.query(PropObstacle, Transform, Body)) {
        const prop = world.mustGet(pe, PropObstacle);
        if (prop.broken || propHp(prop.kind) <= 0) continue;
        const ptr = world.mustGet(pe, Transform);
        const pbody = world.mustGet(pe, Body);
        if (Math.hypot(ptr.x - tr.x, ptr.y - tr.y) > pbody.radius * M + 6) continue;
        const dmg = pr.atk * pr.mult; // 与打怪同一套数值口径
        prop.shakeT = 0.18;
        if (damageProp(prop, prop.kind, dmg)) {
          world.remove(pe, Body);
          world.emit(new SfxEvent('hit'));
        }
        hitProp = true;
        break;
      }
      if (hitProp) {
        world.destroy(e);
        continue;
      }

      // 命中检测(对立阵营)
      for (const t of world.query(Faction, Transform, Body, Health)) {
        const fac = world.mustGet(t, Faction);
        if (fac.team === pr.team || fac.team === 'neutral') continue;
        if (pr.hitSet.has(t)) continue; // 穿透弹不在同一目标身上重复结算
        const ttr = world.mustGet(t, Transform);
        const body = world.mustGet(t, Body);
        const dx = ttr.x - tr.x;
        const dy = ttr.y - tr.y;
        if (Math.hypot(dx, dy) > pr.radiusPx + body.radius * M) continue;

        pr.hitSet.add(t);
        const applyHit = (target: number, mult: number, kx: number, ky: number): void => {
          const tp = world.get(target, Player);
          if (tp) {
            PlayerSystem.applyHurt(world, target, pr.atk * mult);
          } else {
            dealDamage(world, {
              source: null, target, mult: pr.element ? mult : mult, element: pr.element,
              hitAngle: Math.atan2(ky, kx), atkOverride: pr.atk, canCrit: false, knockbackM: 0.6,
            });
          }
        };
        applyHit(t, pr.mult, dy, dx);

        // 溅射(秘术师法球):命中点半径内的其他敌对单位吃一份减伤版
        if (pr.splashM > 0 && pr.team === 'player') {
          const splashR = pr.splashM * M;
          for (const s2 of world.query(Faction, Transform, Body, Health)) {
            if (s2 === t || pr.hitSet.has(s2)) continue;
            const f2 = world.mustGet(s2, Faction);
            if (f2.team === pr.team || f2.team === 'neutral') continue;
            const st2 = world.mustGet(s2, Transform);
            const sb2 = world.mustGet(s2, Body);
            if (Math.hypot(st2.x - tr.x, st2.y - tr.y) > splashR + sb2.radius * M) continue;
            pr.hitSet.add(s2);
            applyHit(s2, pr.mult * pr.splashMult, st2.y - tr.y, st2.x - tr.x);
          }
          world.emit(new RingFxEvent(tr.x, tr.y, splashR, '#c8a8ff'));
        }

        world.emit(new RingFxEvent(tr.x, tr.y, pr.radiusPx * 2.2, pr.color));
        world.emit(new SfxEvent('hit1'));
        if (pr.pierce > 0) {
          pr.pierce -= 1; // 穿透:继续飞,下一帧还能打下一个目标
          continue;
        }
        world.destroy(e);
        break;
      }
    }
  }
}
