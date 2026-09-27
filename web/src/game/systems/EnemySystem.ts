import type { System, World } from '@engine/ecs/World';
import { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { BlightWolf, Body, Buffs, Health, Player, Shroomling, Transform, Velocity, WindBee } from '@game/components';
import { PlayerSystem } from './PlayerSystem';

const E = balance.enemies.shroomling;
const BEE = balance.enemies.windbee;
const WOLF = balance.enemies.blightwolf;

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
      const buffs = world.get(e, Buffs);

      s.animT += dt;
      if (s.touchCd > 0) s.touchCd -= dt;

      // 麻痹眩晕:只保留击退惯性,跳过 AI
      if (buffs && buffs.stunT > 0) {
        const dk = Math.exp(-8 * dt);
        s.kx *= dk;
        s.ky *= dk;
        vel.vx = s.kx;
        vel.vy = s.ky;
        continue;
      }
      // 冻链减速
      const slowMult = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

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
        aiVx = dx * inv * E.speed * M * slowMult;
        aiVy = dy * inv * E.speed * M * slowMult;
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
        aiVx = Math.cos(s.wanderAngle) * E.wanderSpeed * M * slowMult;
        aiVy = Math.sin(s.wanderAngle) * E.wanderSpeed * M * slowMult;
      }

      // 击退冲量衰减叠加
      const decay = Math.exp(-8 * dt);
      s.kx *= decay;
      s.ky *= decay;
      vel.vx = aiVx + s.kx;
      vel.vy = aiVy + s.ky;
    }

    this.updateBees(world, dt, pe, ptr, pAlive);
    this.updateWolves(world, dt, pe, ptr, pAlive);
  }

  /** 风蜂:环绕玩家 → 抖动预警 → 直线俯冲(割草爽感供给者,GDD §8) */
  private updateBees(world: World, dt: number, pe: number, ptr: Transform, pAlive: boolean): void {
    for (const e of world.query(WindBee, Transform, Velocity, Body)) {
      const b = world.mustGet(e, WindBee);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const buffs = world.get(e, Buffs);
      b.animT += dt;
      if (b.touchCd > 0) b.touchCd -= dt;

      const stunned = buffs !== undefined && buffs.stunT > 0;
      const slowMult = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;
      const decay = Math.exp(-8 * dt);
      b.kx *= decay;
      b.ky *= decay;

      if (stunned || !pAlive) {
        vel.vx = b.kx;
        vel.vy = b.ky;
        continue;
      }

      let aiVx = 0;
      let aiVy = 0;
      switch (b.state) {
        case 'orbit': {
          b.angle += b.orbitDir * 1.6 * dt;
          const gx = ptr.x + Math.cos(b.angle) * BEE.orbitRadiusM * M;
          const gy = ptr.y + Math.sin(b.angle) * BEE.orbitRadiusM * M;
          aiVx = (gx - tr.x) * 3.2;
          aiVy = (gy - tr.y) * 3.2;
          const cap = BEE.speed * M;
          const sp = Math.hypot(aiVx, aiVy);
          if (sp > cap) { aiVx = (aiVx / sp) * cap; aiVy = (aiVy / sp) * cap; }
          b.nextDiveT -= dt;
          if (b.nextDiveT <= 0) { b.state = 'telegraph'; b.t = BEE.telegraphS; }
          break;
        }
        case 'telegraph': { // 原地抖动蓄力
          b.t -= dt;
          aiVx = (Math.random() - 0.5) * 60;
          aiVy = (Math.random() - 0.5) * 60;
          if (b.t <= 0) {
            const dx = ptr.x - tr.x;
            const dy = ptr.y - tr.y;
            const d = Math.hypot(dx, dy) || 1;
            b.diveVx = (dx / d) * BEE.diveSpeed * M;
            b.diveVy = (dy / d) * BEE.diveSpeed * M;
            b.state = 'dive';
            b.t = BEE.diveDur;
          }
          break;
        }
        case 'dive': {
          b.t -= dt;
          aiVx = b.diveVx;
          aiVy = b.diveVy;
          const pBody = world.mustGet(pe, Body);
          const dist = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
          if (dist < (0.18 + pBody.radius) * M + 4 && b.touchCd <= 0) {
            b.touchCd = BEE.touchCooldown;
            PlayerSystem.applyHurt(world, pe, BEE.atk);
          }
          if (b.t <= 0) {
            b.state = 'orbit';
            b.nextDiveT = BEE.diveIntervalMin + Math.random() * (BEE.diveIntervalMax - BEE.diveIntervalMin);
          }
          break;
        }
      }
      tr.face = Math.atan2(ptr.y - tr.y, ptr.x - tr.x);
      vel.vx = aiVx * slowMult + b.kx;
      vel.vy = aiVy * slowMult + b.ky;
    }
  }

  /** 蚀化狼:切向绕圈 → 低吼预警 → 扑击 → 硬直(GDD §8) */
  private updateWolves(world: World, dt: number, pe: number, ptr: Transform, pAlive: boolean): void {
    for (const e of world.query(BlightWolf, Transform, Velocity, Body)) {
      const wf = world.mustGet(e, BlightWolf);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const buffs = world.get(e, Buffs);
      wf.animT += dt;
      if (wf.touchCd > 0) wf.touchCd -= dt;

      const stunned = buffs !== undefined && buffs.stunT > 0;
      const slowMult = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;
      const decay = Math.exp(-8 * dt);
      wf.kx *= decay;
      wf.ky *= decay;

      if (stunned || !pAlive) {
        vel.vx = wf.kx;
        vel.vy = wf.ky;
        continue;
      }

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      let aiVx = 0;
      let aiVy = 0;

      switch (wf.state) {
        case 'circle': {
          // 维持绕圈半径 + 切向移动
          const radial = (dist - WOLF.circleRadiusM * M) * 1.5;
          const tang = WOLF.speed * M * 0.85;
          aiVx = (dx / dist) * radial + (-dy / dist) * tang * wf.dir;
          aiVy = (dy / dist) * radial + (dx / dist) * tang * wf.dir;
          wf.circleT -= dt;
          if (wf.circleT <= 0) { wf.state = 'growl'; wf.t = WOLF.growlS; }
          break;
        }
        case 'growl': { // 站定低吼(预警窗口,玩家该翻滚了)
          wf.t -= dt;
          if (wf.t <= 0) {
            wf.pounceVx = (dx / dist) * WOLF.pounceSpeed * M;
            wf.pounceVy = (dy / dist) * WOLF.pounceSpeed * M;
            wf.state = 'pounce';
            wf.t = WOLF.pounceDur;
          }
          break;
        }
        case 'pounce': {
          wf.t -= dt;
          aiVx = wf.pounceVx;
          aiVy = wf.pounceVy;
          const pBody = world.mustGet(pe, Body);
          if (dist < (WOLF.bodyRadius + pBody.radius) * M + 6 && wf.touchCd <= 0) {
            wf.touchCd = WOLF.touchCooldown;
            PlayerSystem.applyHurt(world, pe, WOLF.atk);
          }
          if (wf.t <= 0) { wf.state = 'recover'; wf.t = WOLF.recoverS; }
          break;
        }
        case 'recover': { // 硬直(输出窗口)
          wf.t -= dt;
          if (wf.t <= 0) {
            wf.state = 'circle';
            wf.circleT = WOLF.circleTimeMin + Math.random() * (WOLF.circleTimeMax - WOLF.circleTimeMin);
            wf.dir = Math.random() < 0.5 ? 1 : -1;
          }
          break;
        }
      }
      tr.face = Math.atan2(dy, dx);
      vel.vx = aiVx * slowMult + wf.kx;
      vel.vy = aiVy * slowMult + wf.ky;
    }
  }
}
