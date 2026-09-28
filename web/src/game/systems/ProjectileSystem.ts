import type { System, World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import {
  Body, Faction, Health, Player, Projectile, RingFxEvent, SfxEvent, Transform, Velocity,
} from '@game/components';
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
      tr.x += vel.vx * dt;
      tr.y += vel.vy * dt;
      pr.lifeS -= dt;

      if (pr.lifeS <= 0 || tr.x < 0 || tr.y < 0 || tr.x > maxX || tr.y > maxY) {
        world.destroy(e);
        continue;
      }

      // 命中检测(对立阵营)
      for (const t of world.query(Faction, Transform, Body, Health)) {
        const fac = world.mustGet(t, Faction);
        if (fac.team === pr.team || fac.team === 'neutral') continue;
        const ttr = world.mustGet(t, Transform);
        const body = world.mustGet(t, Body);
        const dx = ttr.x - tr.x;
        const dy = ttr.y - tr.y;
        if (Math.hypot(dx, dy) > pr.radiusPx + body.radius * M) continue;

        const targetPlayer = world.get(t, Player);
        if (targetPlayer) {
          PlayerSystem.applyHurt(world, t, pr.atk * pr.mult);
        } else {
          dealDamage(world, {
            source: null, target: t, mult: pr.mult, element: pr.element,
            hitAngle: Math.atan2(dy, dx), atkOverride: pr.atk, canCrit: false, knockbackM: 0.6,
          });
        }
        world.emit(new RingFxEvent(tr.x, tr.y, pr.radiusPx * 2.2, pr.color));
        world.emit(new SfxEvent('hit1'));
        world.destroy(e);
        break;
      }
    }
  }
}
