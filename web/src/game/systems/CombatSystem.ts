import type { System, World } from '@engine/ecs/World';
import { M } from '@game/constants';
import { Body, Faction, Health, MeleeSweep, PropObstacle, SfxEvent, Stats, Transform } from '@game/components';
import { damageProp, propHp } from '@game/dungeon/Terrain';
import { dealDamage } from '@game/combat/DamagePipeline';

/**
 * 近战判定:消费 MeleeSweep(普攻与技能共用),扇形命中后交给统一伤害管线。
 * 伤害计算/印记/反应/死亡全部在 DamagePipeline(docs/02-ARCHITECTURE.md §5)。
 */
export class CombatSystem implements System {
  update(world: World, _dt: number): void {
    for (const sweep of world.read(MeleeSweep)) {
      // 障碍(树/岩)也在扇形里:挥空也砍得到墙,窄道就有"自己开个口子"的解法
      const srcStats = sweep.source !== null ? world.get(sweep.source, Stats) : undefined;
      const propDmg = (srcStats?.atk ?? 0) * sweep.mult;
      if (propDmg > 0) {
        for (const pe of world.query(PropObstacle, Transform, Body)) {
          const prop = world.mustGet(pe, PropObstacle);
          if (prop.broken || propHp(prop.kind) <= 0) continue;
          const ptr = world.mustGet(pe, Transform);
          const pbody = world.mustGet(pe, Body);
          const pdx = ptr.x - sweep.x;
          const pdy = ptr.y - sweep.y;
          const pdist = Math.hypot(pdx, pdy);
          if (pdist - pbody.radius * M > sweep.rangePx) continue;
          let pAng = Math.atan2(pdy, pdx) - sweep.angle;
          while (pAng > Math.PI) pAng -= Math.PI * 2;
          while (pAng < -Math.PI) pAng += Math.PI * 2;
          if (Math.abs(pAng) > sweep.arcRad / 2 + Math.atan2(pbody.radius * M, Math.max(pdist, 1))) continue;
          prop.shakeT = 0.18;
          if (damageProp(prop, prop.kind, propDmg)) {
            world.remove(pe, Body); // 碎了就不再阻挡(贴图留作残骸)
            world.emit(new SfxEvent('hit'));
          }
        }
      }

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
