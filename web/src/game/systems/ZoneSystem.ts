import type { System, World } from '@engine/ecs/World';
import { Faction, Health, Transform, Zone } from '@game/components';
import { dealDamage } from '@game/combat/DamagePipeline';

/** 地面区域结算:火焰地带/毒火云/孢子雾…按间隔对敌对阵营跳伤害。 */
export class ZoneSystem implements System {
  update(world: World, dt: number): void {
    for (const e of world.query(Zone, Transform)) {
      const z = world.mustGet(e, Zone);
      const tr = world.mustGet(e, Transform);
      z.life -= dt;
      z.tickT -= dt;

      if (z.tickT <= 0) {
        z.tickT = z.interval;
        for (const t of world.query(Health, Transform, Faction)) {
          const fac = world.mustGet(t, Faction);
          // player 阵营的区域伤 enemy/neutral;enemy 阵营的区域只伤 player
          if (z.team === 'player' && fac.team === 'player') continue;
          if (z.team === 'enemy' && fac.team !== 'player') continue;
          const ttr = world.mustGet(t, Transform);
          if (Math.hypot(ttr.x - tr.x, ttr.y - tr.y) <= z.radiusPx) {
            dealDamage(world, {
              source: null, target: t, mult: z.mult, element: z.element,
              hitAngle: Math.atan2(ttr.y - tr.y, ttr.x - tr.x),
              atkOverride: z.atk, canCrit: false,
            });
          }
        }
      }
      if (z.life <= 0) world.destroy(e);
    }
  }
}
