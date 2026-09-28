import type { System, World } from '@engine/ecs/World';
import { Faction, Health, RingFxEvent, SfxEvent, TelegraphStrike, Transform } from '@game/components';
import { dealDamage } from '@game/combat/DamagePipeline';

/**
 * 预警打击结算:倒计时归零 → 对圈内敌对阵营一次性爆发 → 自毁。
 * 警示圈的绘制在 GameScene(红圈 + 进度填充)。
 */
export class TelegraphSystem implements System {
  update(world: World, dt: number): void {
    for (const e of world.query(TelegraphStrike, Transform)) {
      const ts = world.mustGet(e, TelegraphStrike);
      const tr = world.mustGet(e, Transform);
      ts.t -= dt;
      if (ts.t > 0) continue;

      world.emit(new RingFxEvent(tr.x, tr.y, ts.radiusPx, ts.color));
      world.emit(new SfxEvent('reaction'));
      for (const t of world.query(Health, Transform, Faction)) {
        const fac = world.mustGet(t, Faction);
        if (ts.team === 'enemy' && fac.team !== 'player') continue;
        if (ts.team === 'player' && fac.team === 'player') continue;
        const ttr = world.mustGet(t, Transform);
        if (Math.hypot(ttr.x - tr.x, ttr.y - tr.y) <= ts.radiusPx) {
          dealDamage(world, {
            source: null, target: t, mult: ts.mult, element: null,
            hitAngle: Math.atan2(ttr.y - tr.y, ttr.x - tr.x),
            atkOverride: ts.atk, canCrit: false,
          });
        }
      }
      world.destroy(e);
    }
  }
}
