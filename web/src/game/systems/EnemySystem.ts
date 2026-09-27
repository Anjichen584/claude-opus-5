import type { System, World } from '@engine/ecs/World';
import { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { Body, Health, Player, Shroomling, Transform, Velocity } from '@game/components';
import { PlayerSystem } from './PlayerSystem';

const E = balance.enemies.shroomling;

/** 菇灵 AI:游荡 → 索敌半径内追击 → 接触伤害(带内置冷却)。 */
export class EnemySystem implements System {
  private rng = new Rng(20260928);

  update(world: World, dt: number): void {
    const players = world.query(Player, Transform, Health);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;

    for (const e of world.query(Shroomling, Transform, Velocity, Body)) {
      const s = world.mustGet(e, Shroomling);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const body = world.mustGet(e, Body);

      s.animT += dt;
      if (s.touchCd > 0) s.touchCd -= dt;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy);

      // 状态切换
      if (pAlive && dist < E.aggroRange * M) s.state = 'chase';
      else if (dist > E.aggroRange * M * 1.4) s.state = 'wander';

      let aiVx = 0;
      let aiVy = 0;
      if (s.state === 'chase' && pAlive) {
        const inv = 1 / (dist || 1);
        aiVx = dx * inv * E.speed * M;
        aiVy = dy * inv * E.speed * M;
        tr.face = Math.atan2(dy, dx);

        // 接触伤害
        const pBody = world.mustGet(pe, Body);
        if (dist < body.radius * M + pBody.radius * M + 4 && s.touchCd <= 0) {
          s.touchCd = E.touchCooldown;
          PlayerSystem.applyHurt(world, pe, E.atk);
        }
      } else {
        // 游荡:定时换向
        s.wanderT -= dt;
        if (s.wanderT <= 0) {
          s.wanderT = this.rng.range(1.2, 2.8);
          s.wanderAngle = this.rng.range(0, Math.PI * 2);
        }
        aiVx = Math.cos(s.wanderAngle) * E.wanderSpeed * M;
        aiVy = Math.sin(s.wanderAngle) * E.wanderSpeed * M;
      }

      // 击退冲量衰减叠加
      const decay = Math.exp(-8 * dt);
      s.kx *= decay;
      s.ky *= decay;
      vel.vx = aiVx + s.kx;
      vel.vy = aiVy + s.ky;
    }
  }
}
