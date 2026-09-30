import type { System, World, Entity } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { elementColor } from '@game/combat/Elements';
import {
  BlizzardHawk, Body, Buffs, FrostMage, FrostMoth, IceGlider, IceSpike, IceTurtle, Player,
  Projectile, SfxEvent, SnowPuff, Stats, TelegraphStrike, Transform, Velocity, Zone,
} from '@game/components';
import { PlayerSystem } from './PlayerSystem';

const PUFF = balance.enemies.snowpuff;
const SPIKE = balance.enemies.icespike;
const GLIDER = balance.enemies.iceglider;
const MOTH = balance.enemies.frostmoth;
const TURTLE = balance.enemies.iceturtle;
const HAWK = balance.enemies.blizzardhawk;
const MAGE = balance.enemies.frostmage;

/**
 * 第二章「霜语冰原」杂兵 AI 四件套:
 * 雪绒球(滚撞)/ 冰壳龟(正面减伤+旋壳)/ 风雪隼(俯冲)/ 霜语法师(风筝冰弹)。
 */
export class TundraSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pBody = world.get(pe, Body);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;
    const pr = (pBody?.radius ?? 0.3) * M;

    this.puffs(world, dt, pe, ptr, pr, pAlive);
    this.turtles(world, dt, pe, ptr, pr, pAlive);
    this.hawks(world, dt, pe, ptr, pr, pAlive);
    this.mages(world, dt, ptr, pAlive);
    this.spikes(world, dt, ptr, pAlive);
    this.gliders(world, dt, pe, ptr, pr, pAlive);
    this.moths(world, dt, ptr, pAlive);
  }

  // ---- 霜尘蛾(图鉴 30):不追人,绕玩家附近漫游,身下周期洒冻雾 ----
  private moths(world: World, dt: number, ptr: Transform, pAlive: boolean): void {
    for (const e of world.query(FrostMoth, Transform, Velocity, Stats)) {
      const mo = world.mustGet(e, FrostMoth);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const buffs = world.get(e, Buffs);
      mo.animT += dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      // 巡飞:周期性重选方向;离玩家太远就往回偏(保持在战场里捣乱)
      mo.turnT -= dt;
      if (mo.turnT <= 0) {
        mo.turnT = MOTH.wander.turnS;
        const dx = ptr.x - tr.x;
        const dy = ptr.y - tr.y;
        const far = Math.hypot(dx, dy) > MOTH.wander.nearM * M;
        const toward = Math.atan2(dy, dx);
        mo.heading = far ? toward + (Math.random() - 0.5) * 1.2 : Math.random() * Math.PI * 2;
      }
      tr.face = mo.heading;
      vel.vx = Math.cos(mo.heading) * stats.moveSpeed * M * slow;
      vel.vy = Math.sin(mo.heading) * stats.moveSpeed * M * slow;

      // 身下洒冻雾:它自己毫无攻击性,雷区才是它的武器
      mo.mistT -= dt;
      if (mo.mistT <= 0) {
        mo.mistT = MOTH.mist.intervalS;
        const z = world.create();
        world.add(z, new Transform(tr.x, tr.y + 6));
        world.add(z, new Zone(
          MOTH.mist.radiusM * M, MOTH.mist.lifeS, MOTH.mist.tickS,
          stats.atk, MOTH.mist.mult, 'ice', 'enemy', elementColor('ice'),
        ));
      }
    }
  }

  // ---- 冰锥笋(轮 11):炮台 —— 玩家进圈就在其脚下点冰锥,血薄,走过去拍碎它 ----
  private spikes(world: World, dt: number, ptr: Transform, pAlive: boolean): void {
    for (const e of world.query(IceSpike, Transform, Stats)) {
      const s = world.mustGet(e, IceSpike);
      const tr = world.mustGet(e, Transform);
      const stats = world.mustGet(e, Stats);
      const buffs = world.get(e, Buffs);
      s.animT += dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) continue;
      const dist = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
      s.cd -= dt;
      if (s.cd <= 0 && dist < SPIKE.spike.rangeM * M) {
        const ts = world.create();
        world.add(ts, new Transform(ptr.x, ptr.y));
        world.add(ts, new TelegraphStrike(
          SPIKE.spike.telegraphS, SPIKE.spike.radiusM * M, stats.atk, SPIKE.spike.mult,
          'enemy', elementColor('ice'),
        ));
        s.cd = SPIKE.spike.cdS;
        world.emit(new SfxEvent('shot'));
      }
    }
  }

  // ---- 霜刃滑手(轮 11):漂移体 —— 速度恒定,朝向只能慢慢掰;急转就是解法 ----
  private gliders(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(IceGlider, Transform, Velocity, Stats, Body)) {
      const g = world.mustGet(e, IceGlider);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      g.animT += dt;
      g.contactCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      // 朝向以固定角速度掰向玩家(不能瞬转 —— 这是它的全部弱点)
      const want = Math.atan2(ptr.y - tr.y, ptr.x - tr.x);
      let diff = want - g.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxTurn = GLIDER.glide.turnRadPerS * dt;
      g.heading += Math.max(-maxTurn, Math.min(maxTurn, diff));
      tr.face = g.heading;
      vel.vx = Math.cos(g.heading) * stats.moveSpeed * M * slow;
      vel.vy = Math.sin(g.heading) * stats.moveSpeed * M * slow;

      const dist = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
      if (dist < body.radius * M + pr + 4 && g.contactCd <= 0) {
        g.contactCd = GLIDER.glide.contactCd;
        PlayerSystem.applyHurt(world, pe, stats.atk);
      }
    }
  }

  // ---- 雪绒球:间歇滚动冲撞 ----
  private puffs(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(SnowPuff, Transform, Velocity, Stats, Body)) {
      const s = world.mustGet(e, SnowPuff);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      s.animT += dt;
      s.contactCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      tr.face = Math.atan2(dy, dx);

      if (s.rollT > 0) {
        s.rollT -= dt; // 滚动中保持冲量
      } else {
        // 缓慢逼近 + 蓄力滚撞
        vel.vx = (dx / dist) * stats.moveSpeed * 0.45 * M * slow;
        vel.vy = (dy / dist) * stats.moveSpeed * 0.45 * M * slow;
        s.cdT -= dt;
        if (s.cdT <= 0 && dist < 5 * M) {
          s.rollT = PUFF.roll.dur;
          s.cdT = PUFF.roll.cd + PUFF.roll.dur;
          vel.vx = (dx / dist) * PUFF.roll.speedM * M * slow;
          vel.vy = (dy / dist) * PUFF.roll.speedM * M * slow;
        }
      }

      if (dist < body.radius * M + pr + 4 && s.contactCd <= 0) {
        s.contactCd = PUFF.contactCd;
        PlayerSystem.applyHurt(world, pe, stats.atk);
      }
    }
  }

  // ---- 冰壳龟:龟速爬行 → 抖壳预警 → 旋壳冲撞 ----
  private turtles(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(IceTurtle, Transform, Velocity, Stats, Body)) {
      const t = world.mustGet(e, IceTurtle);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      t.animT += dt;
      t.contactCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;

      switch (t.state) {
        case 'crawl': {
          tr.face = Math.atan2(dy, dx);
          vel.vx = (dx / dist) * stats.moveSpeed * M * slow;
          vel.vy = (dy / dist) * stats.moveSpeed * M * slow;
          t.cd -= dt;
          if (t.cd <= 0 && dist < 4.5 * M) {
            t.state = 'telegraph';
            t.t = TURTLE.spin.telegraphS;
            t.spinX = dx / dist;
            t.spinY = dy / dist;
          }
          break;
        }
        case 'telegraph': {
          vel.vx = 0;
          vel.vy = 0;
          t.t -= dt;
          if (t.t <= 0) {
            t.state = 'spin';
            t.t = TURTLE.spin.dur;
            world.emit(new SfxEvent('dash'));
          }
          break;
        }
        case 'spin': {
          vel.vx = t.spinX * TURTLE.spin.speedM * M;
          vel.vy = t.spinY * TURTLE.spin.speedM * M;
          t.t -= dt;
          if (dist < body.radius * M + pr + 4 && t.contactCd <= 0) {
            t.contactCd = TURTLE.contactCd;
            PlayerSystem.applyHurt(world, pe, stats.atk * 1.2);
          }
          if (t.t <= 0) {
            t.state = 'crawl';
            t.cd = TURTLE.spin.cd;
          }
          break;
        }
      }
    }
  }

  // ---- 风雪隼:环绕盘旋 → 定住 → 俯冲 ----
  private hawks(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(BlizzardHawk, Transform, Velocity, Stats, Body)) {
      const h = world.mustGet(e, BlizzardHawk);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      h.animT += dt;
      h.contactCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      switch (h.state) {
        case 'hover': {
          // 绕玩家 3m 环绕
          const tangX = -ny * h.circleDir;
          const tangY = nx * h.circleDir;
          const radial = dist > 3.4 * M ? 1 : dist < 2.6 * M ? -1 : 0;
          vel.vx = (tangX + nx * radial * 0.8) * stats.moveSpeed * M * slow;
          vel.vy = (tangY + ny * radial * 0.8) * stats.moveSpeed * M * slow;
          tr.face = Math.atan2(vel.vy, vel.vx);
          h.cd -= dt;
          if (h.cd <= 0) {
            h.state = 'telegraph';
            h.t = HAWK.dive.telegraphS;
            h.diveX = nx;
            h.diveY = ny;
          }
          break;
        }
        case 'telegraph': {
          vel.vx = 0;
          vel.vy = 0;
          tr.face = Math.atan2(h.diveY, h.diveX);
          h.t -= dt;
          if (h.t <= 0) {
            h.state = 'dive';
            h.t = HAWK.dive.dur;
            world.emit(new SfxEvent('dash'));
          }
          break;
        }
        case 'dive': {
          vel.vx = h.diveX * HAWK.dive.speedM * M;
          vel.vy = h.diveY * HAWK.dive.speedM * M;
          h.t -= dt;
          if (dist < body.radius * M + pr + 4 && h.contactCd <= 0) {
            h.contactCd = HAWK.contactCd;
            PlayerSystem.applyHurt(world, pe, stats.atk);
          }
          if (h.t <= 0) {
            h.state = 'hover';
            h.cd = HAWK.dive.cd;
            h.circleDir *= -1;
          }
          break;
        }
      }
    }
  }

  // ---- 霜语法师:风筝 + 吟唱冰弹 ----
  private mages(world: World, dt: number, ptr: Transform, pAlive: boolean): void {
    for (const e of world.query(FrostMage, Transform, Velocity, Stats)) {
      const mg = world.mustGet(e, FrostMage);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const buffs = world.get(e, Buffs);
      mg.animT += dt;
      vel.vx = 0;
      vel.vy = 0;
      if ((buffs && buffs.stunT > 0) || !pAlive) continue;
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      tr.face = Math.atan2(dy, dx);

      switch (mg.state) {
        case 'drift': {
          let mx = 0;
          let my = 0;
          if (dist < MAGE.keepMinM * M) { mx = -nx; my = -ny; }
          else if (dist > MAGE.keepMaxM * M) { mx = nx; my = ny; }
          else { mx = -ny * mg.strafeDir; my = nx * mg.strafeDir; }
          vel.vx = mx * stats.moveSpeed * M * slow;
          vel.vy = my * stats.moveSpeed * M * slow;
          mg.cd -= dt;
          if (mg.cd <= 0 && dist < (MAGE.keepMaxM + 1.5) * M) {
            mg.state = 'aim';
            mg.t = MAGE.bolt.aimS;
          }
          break;
        }
        case 'aim': {
          mg.t -= dt;
          if (mg.t <= 0) {
            const p = world.create();
            world.add(p, new Transform(tr.x, tr.y - 16));
            const v = new Velocity();
            v.vx = nx * MAGE.bolt.speedM * M;
            v.vy = ny * MAGE.bolt.speedM * M;
            world.add(p, v);
            world.add(p, new Projectile('enemy', stats.atk, MAGE.bolt.mult, 'ice',
              MAGE.bolt.radiusM * M, MAGE.bolt.lifeS, elementColor('ice')));
            world.emit(new SfxEvent('skill'));
            mg.state = 'recover';
            mg.t = 0.4;
          }
          break;
        }
        case 'recover': {
          mg.t -= dt;
          if (mg.t <= 0) {
            mg.state = 'drift';
            mg.cd = MAGE.bolt.cd;
            if (Math.random() < 0.3) mg.strafeDir *= -1;
          }
          break;
        }
      }
    }
  }
}
