import type { System, World } from '@engine/ecs/World';
import { M } from '@game/constants';
import { Body, Faction, Health, MeleeSweep, Transform } from '@game/components';
import { dealDamage } from '@game/combat/DamagePipeline';

/**
 * 近战判定:消费 MeleeSweep(普攻与技能共用),扇形命中后交给统一伤害管线。
 * 伤害计算/印记/反应/死亡全部在 DamagePipeline(docs/02-ARCHITECTURE.md §5)。
 */
export class CombatSystem implements System {
  update(world: World, _dt: number): void {
    for (const sweep of world.read(MeleeSweep)) {
      for (const target of world.query(Health, Transform, Body, Faction)) {
        if (target === sweep.source) continue;
        const fac = world.mustGet(target, Faction);
        if (fac.team === 'player') continue;

        const ttr = world.mustGet(target, Transform);
        const tbody = world.mustGet(target, Body);
        const dx = ttr.x - sweep.x;
        const dy = ttr.y - sweep.y;
        const dist = Math.hypot(dx, dy);
        if (dist - tbody.radius * M > sweep.rangePx) continue;

        let dAng = Math.atan2(dy, dx) - sweep.angle;
        while (dAng > Math.PI) dAng -= Math.PI * 2;
        while (dAng < -Math.PI) dAng += Math.PI * 2;
        if (Math.abs(dAng) > sweep.arcRad / 2 + Math.atan2(tbody.radius * M, Math.max(dist, 1))) continue;

        dealDamage(world, {
          source: sweep.source,
          target,
          mult: sweep.mult,
          element: sweep.element,
          hitAngle: Math.atan2(dy, dx),
          knockbackM: sweep.knockbackM,
        });
      }
    }
  }
}
