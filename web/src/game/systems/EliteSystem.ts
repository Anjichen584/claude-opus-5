import type { System, World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import {
  Body, Buffs, Health, OakGolem, Player, Stats, TelegraphStrike, ThornVine, Transform, Velocity,
} from '@game/components';

const VINE = balance.enemies.thornvine;
const GOLEM = balance.enemies.oakgolem;

/** 荆棘藤妖(固定炮台地刺)与橡木傀儡(拍地 AOE + 背部弱点)。 */
export class EliteSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform, Health);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;

    // ---- 荆棘藤妖 ----
    for (const e of world.query(ThornVine, Transform, Stats)) {
      const v = world.mustGet(e, ThornVine);
      const tr = world.mustGet(e, Transform);
      const stats = world.mustGet(e, Stats);
      const buffs = world.get(e, Buffs);
      v.animT += dt;
      if (buffs && buffs.stunT > 0) continue;
      if (!pAlive) continue;

      v.t -= dt;
      if (v.t <= 0) {
        const dist = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
        if (v.state === 'idle') {
          if (dist <= VINE.rangeM * M) {
            // 在玩家当前位置放预警地刺(逼走位,GDD §8)
            const ts = world.create();
            world.add(ts, new Transform(ptr.x, ptr.y));
            world.add(ts, new TelegraphStrike(VINE.telegraphS, VINE.spikeRadiusM * M, stats.atk, 1.0, 'enemy', '#8fd45f'));
            v.state = 'telegraph';
            v.t = VINE.telegraphS + 0.2;
          } else {
            v.t = 0.5;
          }
        } else {
          v.state = 'idle';
          v.t = VINE.idleS;
        }
      }
    }

    // ---- 橡木傀儡 ----
    for (const e of world.query(OakGolem, Transform, Velocity, Body, Stats)) {
      const g = world.mustGet(e, OakGolem);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const buffs = world.get(e, Buffs);
      g.animT += dt;

      const decay = Math.exp(-6 * dt);
      g.kx *= decay;
      g.ky *= decay;

      const stunned = buffs !== undefined && buffs.stunT > 0;
      if (stunned || !pAlive) {
        vel.vx = g.kx;
        vel.vy = g.ky;
        continue;
      }
      const slowMult = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      let aiVx = 0;
      let aiVy = 0;

      switch (g.state) {
        case 'chase': {
          aiVx = (dx / dist) * GOLEM.speed * M;
          aiVy = (dy / dist) * GOLEM.speed * M;
          tr.face = Math.atan2(dy, dx);
          g.slamCd -= dt;
          if (dist <= GOLEM.slamRangeM * M && g.slamCd <= 0) {
            g.state = 'windup';
            g.t = GOLEM.slamTelegraphS;
            // 拍地预警圈(以自身前方为中心)
            const cx = tr.x + Math.cos(tr.face) * 1.0 * M;
            const cy = tr.y + Math.sin(tr.face) * 1.0 * M;
            const ts = world.create();
            world.add(ts, new Transform(cx, cy));
            world.add(ts, new TelegraphStrike(GOLEM.slamTelegraphS, GOLEM.slamRadiusM * M, stats.atk, 1.0, 'enemy', '#d9a05f'));
          }
          break;
        }
        case 'windup': {
          g.t -= dt; // 站定蓄力(玩家该绕后了)
          if (g.t <= 0) {
            g.state = 'recover';
            g.t = 0.8;
            g.slamCd = GOLEM.slamCdS;
          }
          break;
        }
        case 'recover': {
          g.t -= dt;
          if (g.t <= 0) g.state = 'chase';
          break;
        }
      }
      vel.vx = aiVx * slowMult + g.kx;
      vel.vy = aiVy * slowMult + g.ky;
    }
  }
}
