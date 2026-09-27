import type { System, World } from '@engine/ecs/World';
import { SpatialHash } from '@engine/physics/SpatialHash';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { Body, Transform, Velocity } from '@game/components';

/**
 * 物理:速度积分(记录 prev 供插值)→ 空间哈希 → 圆形体分离 → 场地边界钳制。
 */
export class PhysicsSystem implements System {
  private hash = new SpatialHash<number>(1.5 * M);
  private nearby: number[] = [];

  update(world: World, dt: number): void {
    const movers = world.query(Transform, Velocity, Body);

    // 积分
    for (const e of movers) {
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      tr.prevX = tr.x;
      tr.prevY = tr.y;
      tr.x += vel.vx * dt;
      tr.y += vel.vy * dt;
    }

    // 重建哈希
    this.hash.clear();
    for (const e of movers) {
      const tr = world.mustGet(e, Transform);
      this.hash.insert(tr.x, tr.y, e);
    }

    // 成对分离(轻推,割草场景不需要刚体解算)
    for (const e of movers) {
      const trA = world.mustGet(e, Transform);
      const bodyA = world.mustGet(e, Body);
      if (bodyA.immovable) continue;
      this.hash.queryCircle(trA.x, trA.y, bodyA.radius * M * 2.5, this.nearby);
      for (const o of this.nearby) {
        if (o === e) continue;
        const trB = world.mustGet(o, Transform);
        const bodyB = world.mustGet(o, Body);
        const dx = trA.x - trB.x;
        const dy = trA.y - trB.y;
        const minDist = (bodyA.radius + bodyB.radius) * M;
        const dist = Math.hypot(dx, dy);
        if (dist > 0 && dist < minDist) {
          const push = (minDist - dist) * (bodyB.immovable ? 1 : 0.5);
          trA.x += (dx / dist) * push;
          trA.y += (dy / dist) * push;
        }
      }
    }

    // 场地边界
    const maxX = balance.arena.widthM * M;
    const maxY = balance.arena.heightM * M;
    for (const e of movers) {
      const tr = world.mustGet(e, Transform);
      const body = world.mustGet(e, Body);
      const r = body.radius * M;
      if (tr.x < r) tr.x = r;
      if (tr.x > maxX - r) tr.x = maxX - r;
      if (tr.y < r) tr.y = r;
      if (tr.y > maxY - r) tr.y = maxY - r;
    }
  }
}
