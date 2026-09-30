import type { System, World } from '@engine/ecs/World';
import { SpatialHash } from '@engine/physics/SpatialHash';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { Body, Player, PropObstacle, Transform, Velocity } from '@game/components';
import { terrain } from '@game/dungeon/Terrain';

const T = balance.layouts.terrain;

/**
 * 物理:速度积分(记录 prev 供插值)→ 空间哈希 → 圆形体分离 → 场地边界钳制。
 *
 * **冰面滑行(轮 12)**:玩家在冰上时,实际速度不再直接等于意图速度(输入),而是以
 * `iceGripPerS` 的速率向意图速度收敛 —— 起步慢半拍、松手继续滑、急转弯会漂。
 * 两条边界口径(有单测钉住):
 *   · 只作用于**玩家**:怪的 AI 全按"意图即位移"推演,冰上打滑会让所有追击/风筝数学失真,
 *     还会牵连飞行怪(雪鸮鹰不该滑);冰房的压力来自玩家自己的操作,不来自怪变笨。
 *   · **翻滚不打滑**:dashT > 0 时位移权威来自翻滚 —— 这是冰面的反制(滑不动?滚)。
 */
export class PhysicsSystem implements System {
  private hash = new SpatialHash<number>(1.5 * M);
  private nearby: number[] = [];
  /** 冰面滑行的"实际速度"状态(仅玩家会有条目;下冰即清) */
  private slide = new Map<number, { vx: number; vy: number }>();

  update(world: World, dt: number): void {
    const movers = world.query(Transform, Velocity, Body);

    // 积分(浅滩减速在这一层统一施加:玩家/怪/Boss/冲刺/技能位移都吃到,不用各处改)
    for (const e of movers) {
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const t = terrain.moveMult(tr.x, tr.y);
      tr.prevX = tr.x;
      tr.prevY = tr.y;
      // 冰面滑行:玩家的实际速度向意图速度缓慢收敛(翻滚期间位移权威归翻滚)
      const player = terrain.hasIce ? world.get(e, Player) : undefined;
      if (player !== undefined && player.dashT <= 0 && terrain.isIce(tr.x, tr.y)) {
        let s = this.slide.get(e);
        if (s === undefined) {
          s = { vx: vel.vx, vy: vel.vy };
          this.slide.set(e, s);
        }
        const k = Math.min(1, T.iceGripPerS * dt);
        s.vx += (vel.vx - s.vx) * k;
        s.vy += (vel.vy - s.vy) * k;
        tr.x += s.vx * t * dt;
        tr.y += s.vy * t * dt;
      } else {
        if (this.slide.size > 0) this.slide.delete(e);
        tr.x += vel.vx * t * dt;
        tr.y += vel.vy * t * dt;
      }
      // 风带推力(轮 17):带内所有实体一起被吹(+x;顺风快逆风慢是涌现,不另写规则)
      tr.x += terrain.windPush(tr.x, tr.y) * M * dt;
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
        const propB = world.get(o, PropObstacle);
        if (propB?.broken) continue; // 碎了的障碍不再阻挡
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
