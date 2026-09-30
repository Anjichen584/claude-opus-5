import type { System, World, Entity } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { elementColor } from '@game/combat/Elements';
import {
  Body, Buffs, CinderRat, DuneBeetle, DustStinger, EmberWhirl, Faction, FlameDancer,
  MirageBlossom, Player, Projectile, RingFxEvent, SfxEvent, Stats, Transform, Velocity, Zone,
} from '@game/components';
import { PlayerSystem } from './PlayerSystem';

const RAT = balance.enemies.cinderrat;
const BEETLE = balance.enemies.dunebeetle;
const DANCER = balance.enemies.flamedancer;
const STINGER = balance.enemies.duststinger;
const BLOSSOM = balance.enemies.mirageblossom;
const WHIRL = balance.enemies.emberwhirl;

/**
 * 第三章「烬语荒漠」杂兵 AI 四件套:
 * 烬鼠(Z字群冲)/ 沙暴甲虫(钻地伏击)/ 火舞妖(瞬跳双火球)/ 岩尾蝎(蝎尾毒沼)。
 */
export class DesertSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pBody = world.get(pe, Body);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;
    const pr = (pBody?.radius ?? 0.3) * M;

    this.rats(world, dt, pe, ptr, pr, pAlive);
    this.beetles(world, dt, pe, ptr, pr, pAlive);
    this.dancers(world, dt, ptr, pAlive);
    this.stingers(world, dt, pe, ptr, pr, pAlive);
    this.blossoms(world, dt, ptr, pAlive);
    this.whirls(world, dt, pe, ptr, pr, pAlive);
  }

  // ---- 沙蜃花(轮 11):伏击 —— 伪装静默,踏进圈才苏醒,环形毒针 ----
  private blossoms(world: World, dt: number, ptr: Transform, pAlive: boolean): void {
    for (const e of world.query(MirageBlossom, Transform, Stats)) {
      const b = world.mustGet(e, MirageBlossom);
      const tr = world.mustGet(e, Transform);
      const stats = world.mustGet(e, Stats);
      const buffs = world.get(e, Buffs);
      b.animT += dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) continue;
      const dist = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
      const inRange = dist < BLOSSOM.burst.triggerM * M;

      if (b.state === 'dormant') {
        if (inRange) {
          b.state = 'wake';
          b.t = BLOSSOM.burst.firstDelayS;   // 苏醒抖动 = 预警(渲染读 state)
          world.emit(new SfxEvent('growl'));
        }
      } else if (b.state === 'wake') {
        b.t -= dt;
        if (b.t <= 0) {
          this.needleRing(world, tr, stats);
          b.state = 'active';
          b.cd = BLOSSOM.burst.cdS;
        }
      } else {
        // active:玩家在圈内每 cdS 再来一轮;离开圈就重新休眠(伏击怪不追人)
        b.cd -= dt;
        if (!inRange && b.cd <= 0) {
          b.state = 'dormant';
        } else if (inRange && b.cd <= 0) {
          this.needleRing(world, tr, stats);
          b.cd = BLOSSOM.burst.cdS;
        }
      }
    }
  }

  private needleRing(world: World, tr: Transform, stats: Stats): void {
    const bu = BLOSSOM.burst;
    const color = elementColor('toxin');
    for (let i = 0; i < bu.count; i++) {
      const a = (i / bu.count) * Math.PI * 2;
      const p = world.create();
      world.add(p, new Transform(tr.x + Math.cos(a) * 10, tr.y - 8 + Math.sin(a) * 10));
      const pv = new Velocity();
      pv.vx = Math.cos(a) * bu.speedM * M;
      pv.vy = Math.sin(a) * bu.speedM * M;
      world.add(p, pv);
      world.add(p, new Faction('enemy'));
      world.add(p, new Projectile('enemy', stats.atk, bu.mult, 'toxin', bu.radiusM * M, bu.lifeS, color));
    }
    world.emit(new SfxEvent('shot'));
  }

  // ---- 烬旋灵(轮 11):画线怪 —— 自旋蓄力 → 锁向突进,沿途留火痕 ----
  private whirls(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(EmberWhirl, Transform, Velocity, Stats, Body)) {
      const wl = world.mustGet(e, EmberWhirl);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      wl.animT += dt;
      wl.contactCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;
      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;

      switch (wl.state) {
        case 'drift': {
          tr.face = Math.atan2(dy, dx);
          vel.vx = (dx / dist) * stats.moveSpeed * M * slow;
          vel.vy = (dy / dist) * stats.moveSpeed * M * slow;
          wl.cd -= dt;
          if (wl.cd <= 0 && dist < 7 * M) {
            wl.state = 'spinup';
            wl.t = WHIRL.rush.telegraphS;
            wl.dirX = dx / dist;
            wl.dirY = dy / dist;
            vel.vx = 0;
            vel.vy = 0;
            world.emit(new SfxEvent('growl'));
          }
          break;
        }
        case 'spinup': {
          vel.vx = 0;
          vel.vy = 0;
          wl.t -= dt;
          if (wl.t <= 0) {
            wl.state = 'rush';
            wl.t = WHIRL.rush.durS;
            wl.trailT = 0;
            world.emit(new SfxEvent('dash'));
          }
          break;
        }
        case 'rush': {
          vel.vx = wl.dirX * WHIRL.rush.speedM * M * slow;
          vel.vy = wl.dirY * WHIRL.rush.speedM * M * slow;
          wl.t -= dt;
          wl.trailT -= dt;
          if (wl.trailT <= 0) {
            // 火痕:一小片持续伤害区(它画出来的线)
            const z = world.create();
            world.add(z, new Transform(tr.x, tr.y));
            world.add(z, new Zone(
              WHIRL.rush.trailRadiusM * M, WHIRL.rush.trailLifeS, 0.4,
              stats.atk, WHIRL.rush.trailMult, 'fire', 'enemy', elementColor('fire'),
            ));
            wl.trailT = WHIRL.rush.trailIntervalS;
          }
          if (dist < body.radius * M + pr + 4 && wl.contactCd <= 0) {
            wl.contactCd = 0.8;
            PlayerSystem.applyHurt(world, pe, stats.atk);
          }
          if (wl.t <= 0) {
            wl.state = 'dizzy';
            wl.t = WHIRL.rush.recoverS;
          }
          break;
        }
        case 'dizzy': {
          vel.vx = 0;
          vel.vy = 0;
          wl.t -= dt;
          if (wl.t <= 0) {
            wl.state = 'drift';
            wl.cd = WHIRL.rush.cdS;
          }
          break;
        }
      }
    }
  }

  // ---- 烬鼠:Z 字高速贴脸 ----
  private rats(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(CinderRat, Transform, Velocity, Stats, Body)) {
      const r = world.mustGet(e, CinderRat);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      r.animT += dt;
      r.contactCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      const zig = Math.sin(r.animT * 7) * r.zigDir * 0.7;
      vel.vx = (nx + -ny * zig) * stats.moveSpeed * M * slow;
      vel.vy = (ny + nx * zig) * stats.moveSpeed * M * slow;
      tr.face = Math.atan2(vel.vy, vel.vx);

      if (dist < body.radius * M + pr + 4 && r.contactCd <= 0) {
        r.contactCd = RAT.contactCd;
        PlayerSystem.applyHurt(world, pe, stats.atk);
      }
    }
  }

  // ---- 沙暴甲虫:钻地接近 → 预警 → 钻出 AOE → 地面缠斗 ----
  private beetles(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(DuneBeetle, Transform, Velocity, Stats, Body)) {
      const b = world.mustGet(e, DuneBeetle);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      b.animT += dt;
      b.contactCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      tr.face = Math.atan2(dy, dx);

      switch (b.state) {
        // 地下移动(不可被普通近战命中——体现在渲染半透明沙丘;判定照常,简化)
        case 'burrow': {
          vel.vx = (dx / dist) * BEETLE.burrow.underSpeedM * M * slow;
          vel.vy = (dy / dist) * BEETLE.burrow.underSpeedM * M * slow;
          if (dist < 1.6 * M) {
            b.state = 'telegraph';
            b.t = BEETLE.burrow.telegraphS;
          }
          break;
        }
        case 'telegraph': {
          vel.vx = 0;
          vel.vy = 0;
          b.t -= dt;
          if (b.t <= 0) {
            b.state = 'surface';
            b.t = BEETLE.burrow.surfaceS;
            world.emit(new SfxEvent('reaction'));
            world.emit(new RingFxEvent(tr.x, tr.y, BEETLE.burrow.emergeRadiusM * M, '#d9a05f'));
            // 钻出爆发
            if (Math.hypot(ptr.x - tr.x, ptr.y - tr.y) < BEETLE.burrow.emergeRadiusM * M + pr) {
              PlayerSystem.applyHurt(world, pe, stats.atk * BEETLE.burrow.emergeMult);
            }
          }
          break;
        }
        case 'surface': {
          vel.vx = (dx / dist) * stats.moveSpeed * M * slow;
          vel.vy = (dy / dist) * stats.moveSpeed * M * slow;
          b.t -= dt;
          if (dist < body.radius * M + pr + 4 && b.contactCd <= 0) {
            b.contactCd = BEETLE.contactCd;
            PlayerSystem.applyHurt(world, pe, stats.atk);
          }
          if (b.t <= 0) b.state = 'burrow';
          break;
        }
      }
    }
  }

  // ---- 火舞妖:瞬跳走位 + 双火球 ----
  private dancers(world: World, dt: number, ptr: Transform, pAlive: boolean): void {
    for (const e of world.query(FlameDancer, Transform, Velocity, Stats)) {
      const d = world.mustGet(e, FlameDancer);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const buffs = world.get(e, Buffs);
      d.animT += dt;
      d.hopCd -= dt;
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

      switch (d.state) {
        case 'drift': {
          let mx = 0;
          let my = 0;
          if (dist < DANCER.keepMinM * M) { mx = -nx; my = -ny; }
          else if (dist > DANCER.keepMaxM * M) { mx = nx; my = ny; }
          else { mx = -ny * d.strafeDir; my = nx * d.strafeDir; }
          vel.vx = mx * stats.moveSpeed * M * slow;
          vel.vy = my * stats.moveSpeed * M * slow;
          // 火舞瞬跳:横向闪身(残影感)
          if (d.hopCd <= 0) {
            d.hopCd = 1.8 + Math.random();
            const side = Math.random() < 0.5 ? 1 : -1;
            tr.x += -ny * side * DANCER.hopM * M * 0.5;
            tr.y += nx * side * DANCER.hopM * M * 0.5;
            tr.prevX = tr.x;
            tr.prevY = tr.y;
            world.emit(new RingFxEvent(tr.x, tr.y, 20, elementColor('fire')));
          }
          d.cd -= dt;
          if (d.cd <= 0 && dist < (DANCER.keepMaxM + 1.5) * M) {
            d.state = 'aim';
            d.t = DANCER.twinshot.aimS;
          }
          break;
        }
        case 'aim': {
          d.t -= dt;
          if (d.t <= 0) {
            const spread = (DANCER.twinshot.spreadDeg * Math.PI) / 180;
            for (const off of [-spread / 2, spread / 2]) {
              const a = Math.atan2(ny, nx) + off;
              const p = world.create();
              world.add(p, new Transform(tr.x, tr.y - 14));
              const v = new Velocity();
              v.vx = Math.cos(a) * DANCER.twinshot.speedM * M;
              v.vy = Math.sin(a) * DANCER.twinshot.speedM * M;
              world.add(p, v);
              world.add(p, new Projectile('enemy', stats.atk, DANCER.twinshot.mult, 'fire',
                DANCER.twinshot.radiusM * M, DANCER.twinshot.lifeS, elementColor('fire')));
            }
            world.emit(new SfxEvent('skill'));
            d.state = 'recover';
            d.t = 0.35;
          }
          break;
        }
        case 'recover': {
          d.t -= dt;
          if (d.t <= 0) {
            d.state = 'drift';
            d.cd = DANCER.twinshot.cd;
            if (Math.random() < 0.35) d.strafeDir *= -1;
          }
          break;
        }
      }
    }
  }

  // ---- 岩尾蝎:蝎尾抛毒沼(复用蟾蜍节奏,更短冷却更小沼) ----
  private stingers(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(DustStinger, Transform, Velocity, Stats, Body)) {
      const s = world.mustGet(e, DustStinger);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      s.animT += dt;
      s.contactCd -= dt;
      s.lobCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      tr.face = Math.atan2(dy, dx);

      switch (s.state) {
        case 'idle': {
          vel.vx = 0;
          vel.vy = 0;
          if (s.lobCd <= 0 && dist < STINGER.lob.rangeM * M) {
            s.state = 'aim';
            s.t = STINGER.lob.aimS;
          } else {
            s.hopCd -= dt;
            if (s.hopCd <= 0 && dist > 2.0 * M) {
              s.state = 'hop';
              s.t = STINGER.hop.dur;
              vel.vx = (dx / dist) * STINGER.hop.speedM * M * slow;
              vel.vy = (dy / dist) * STINGER.hop.speedM * M * slow;
            }
          }
          break;
        }
        case 'hop': {
          s.t -= dt;
          if (s.t <= 0) {
            s.state = 'idle';
            s.hopCd = STINGER.hop.cd;
          }
          break;
        }
        case 'aim': {
          vel.vx = 0;
          vel.vy = 0;
          s.t -= dt; // 尾针高举预警
          if (s.t <= 0) {
            const z = world.create();
            world.add(z, new Transform(ptr.x, ptr.y));
            world.add(z, new Zone(STINGER.lob.zoneRadiusM * M, STINGER.lob.zoneLifeS, STINGER.lob.tickS,
              stats.atk, STINGER.lob.mult, 'toxin', 'enemy', elementColor('toxin')));
            world.emit(new SfxEvent('reaction'));
            s.state = 'idle';
            s.lobCd = STINGER.lob.cd;
          }
          break;
        }
      }

      if (dist < body.radius * M + pr + 4 && s.contactCd <= 0) {
        s.contactCd = STINGER.contactCd;
        PlayerSystem.applyHurt(world, pe, stats.atk * 0.7);
      }
    }
  }
}
