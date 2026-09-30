import type { System, World, Entity } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { terrain } from '@game/dungeon/Terrain';
import { M } from '@game/constants';
import { elementColor } from '@game/combat/Elements';
import {
  Body, Buffs, EmberImp, Faction, FrostSlime, LeafWisp, Player, Projectile, SfxEvent, SparkLizard,
  StardustSprite, Stats, ToxinToad, Transform, Velocity, Zone,
} from '@game/components';
import { PlayerSystem } from './PlayerSystem';

const IMP = balance.enemies.emberimp;
const WISP = balance.enemies.leafwisp;
const SLIME = balance.enemies.frostslime;
const LIZ = balance.enemies.sparklizard;
const TOAD = balance.enemies.toxintoad;

/**
 * 元素杂兵 AI 四件套 + 星尘精灵:
 * 烬火小鬼(火·风筝远程)/ 霜核史莱姆(冰·跳跃贴脸)/
 * 雷纹蜥(雷·冲撞)/ 毒沼蟾(毒·吐毒沼)——四系印记全部由怪主动上,
 * 玩家技能元素与之碰撞即触发连锁反应(教学:反应是双向的)。
 */
export class CritterSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pBody = world.get(pe, Body);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;
    const pr = (pBody?.radius ?? 0.3) * M;

    this.imps(world, dt, ptr, pAlive);
    this.wisps(world, dt, ptr, pAlive);
    this.slimes(world, dt, pe, ptr, pr, pAlive);
    this.lizards(world, dt, pe, ptr, pr, pAlive);
    this.toads(world, dt, pe, ptr, pr, pAlive);
    this.sprites(world, dt, ptr);
  }

  // ---- 烬火小鬼:保持射程带,漂移扫射 ----
  // ---- 风叶精(轮 17):风筝射手;站在风带里移速 ×windBoostMul(教玩家读风带) ----
  private wisps(world: World, dt: number, ptr: Transform, pAlive: boolean): void {
    for (const e of world.query(LeafWisp, Transform, Velocity, Stats)) {
      const wsp = world.mustGet(e, LeafWisp);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const buffs = world.get(e, Buffs);
      wsp.animT += dt;
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
      const boost = terrain.isWind(tr.x, tr.y) ? WISP.windBoostMul : 1;

      if (wsp.state === 'aim') {
        wsp.t -= dt;
        if (wsp.t <= 0) {
          const p = world.create();
          world.add(p, new Transform(tr.x + nx * 10, tr.y - 10 + ny * 10));
          const pv = new Velocity();
          pv.vx = nx * WISP.bolt.speedM * M;
          pv.vy = ny * WISP.bolt.speedM * M;
          world.add(p, pv);
          world.add(p, new Faction('enemy'));
          world.add(p, new Projectile('enemy', stats.atk, WISP.bolt.mult, null, WISP.bolt.radiusM * M, WISP.bolt.lifeS, '#a4cf7d'));
          world.emit(new SfxEvent('shot'));
          wsp.state = 'drift';
          wsp.cd = WISP.bolt.cd;
        }
        continue;
      }
      let mx = 0;
      let my = 0;
      if (dist < WISP.keepMinM * M) { mx = -nx; my = -ny; }
      else if (dist > WISP.keepMaxM * M) { mx = nx; my = ny; }
      else { mx = -ny * wsp.strafeDir; my = nx * wsp.strafeDir; }
      vel.vx = mx * stats.moveSpeed * boost * M * slow;
      vel.vy = my * stats.moveSpeed * boost * M * slow;
      wsp.cd -= dt;
      if (wsp.cd <= 0 && dist < (WISP.keepMaxM + 1.5) * M) {
        wsp.state = 'aim';
        wsp.t = WISP.bolt.aimS;
      }
    }
  }

  private imps(world: World, dt: number, ptr: Transform, pAlive: boolean): void {
    for (const e of world.query(EmberImp, Transform, Velocity, Stats)) {
      const imp = world.mustGet(e, EmberImp);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const buffs = world.get(e, Buffs);
      imp.animT += dt;
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

      switch (imp.state) {
        case 'drift': {
          // 风筝:太近后退,太远逼近,射程带内横向扫射
          let mx = 0;
          let my = 0;
          if (dist < IMP.keepMinM * M) { mx = -nx; my = -ny; }
          else if (dist > IMP.keepMaxM * M) { mx = nx; my = ny; }
          else { mx = -ny * imp.strafeDir; my = nx * imp.strafeDir; }
          vel.vx = mx * stats.moveSpeed * M * slow;
          vel.vy = my * stats.moveSpeed * M * slow;
          imp.cd -= dt;
          if (imp.cd <= 0 && dist < (IMP.keepMaxM + 1.5) * M) {
            imp.state = 'aim';
            imp.t = IMP.fireball.aimS;
          }
          break;
        }
        case 'aim': {
          imp.t -= dt; // 定身瞄准(可打断窗口)
          if (imp.t <= 0) {
            const p = world.create();
            world.add(p, new Transform(tr.x, tr.y - 14));
            const v = new Velocity();
            v.vx = nx * IMP.fireball.speedM * M;
            v.vy = ny * IMP.fireball.speedM * M;
            world.add(p, v);
            world.add(p, new Projectile('enemy', stats.atk, IMP.fireball.mult, 'fire',
              IMP.fireball.radiusM * M, IMP.fireball.lifeS, elementColor('fire')));
            world.emit(new SfxEvent('skill'));
            imp.state = 'recover';
            imp.t = 0.4;
          }
          break;
        }
        case 'recover': {
          imp.t -= dt;
          if (imp.t <= 0) {
            imp.state = 'drift';
            imp.cd = IMP.fireball.cd;
            if (Math.random() < 0.3) imp.strafeDir *= -1;
          }
          break;
        }
      }
    }
  }

  // ---- 霜核史莱姆:蓄力跳跃,接触冻人 ----
  private slimes(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(FrostSlime, Transform, Velocity, Stats, Body)) {
      const s = world.mustGet(e, FrostSlime);
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

      if (s.hopT > 0) {
        s.hopT -= dt; // 跳跃中保持冲量
      } else {
        vel.vx = 0;
        vel.vy = 0;
        s.cdT -= dt;
        if (s.cdT <= 0) {
          s.hopT = SLIME.hop.dur;
          s.cdT = SLIME.hop.cd + SLIME.hop.dur;
          vel.vx = (dx / dist) * SLIME.hop.speedM * M * slow;
          vel.vy = (dy / dist) * SLIME.hop.speedM * M * slow;
        }
      }

      // 接触:上冰印记(与玩家火/雷技能形成双向反应)
      if (dist < body.radius * M + pr + 4 && s.contactCd <= 0) {
        s.contactCd = SLIME.contactCd;
        PlayerSystem.applyHurt(world, pe, stats.atk);
      }
    }
  }

  // ---- 雷纹蜥:Z字游走→抖动→闪电冲撞 ----
  private lizards(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(SparkLizard, Transform, Velocity, Stats, Body)) {
      const lz = world.mustGet(e, SparkLizard);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      lz.animT += dt;
      lz.contactCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      switch (lz.state) {
        case 'skitter': {
          // Z 字接近(难瞄准)
          const zig = Math.sin(lz.animT * 6) * lz.zigDir;
          vel.vx = (nx + -ny * zig * 0.8) * stats.moveSpeed * M * slow;
          vel.vy = (ny + nx * zig * 0.8) * stats.moveSpeed * M * slow;
          tr.face = Math.atan2(vel.vy, vel.vx);
          lz.cd -= dt;
          if (lz.cd <= 0 && dist < 5 * M) {
            lz.state = 'telegraph';
            lz.t = LIZ.dash.telegraphS;
            lz.dashX = nx;
            lz.dashY = ny;
          }
          break;
        }
        case 'telegraph': {
          vel.vx = 0;
          vel.vy = 0;
          lz.t -= dt;
          if (lz.t <= 0) {
            lz.state = 'dash';
            lz.t = LIZ.dash.dur;
            world.emit(new SfxEvent('dash'));
          }
          break;
        }
        case 'dash': {
          vel.vx = lz.dashX * LIZ.dash.speedM * M;
          vel.vy = lz.dashY * LIZ.dash.speedM * M;
          tr.face = Math.atan2(vel.vy, vel.vx);
          lz.t -= dt;
          // 冲撞判定
          if (dist < body.radius * M + pr + 4 && lz.contactCd <= 0) {
            lz.contactCd = LIZ.contactCd;
            PlayerSystem.applyHurt(world, pe, stats.atk);
          }
          if (lz.t <= 0) {
            lz.state = 'skitter';
            lz.cd = LIZ.dash.cd;
            lz.zigDir *= -1;
          }
          break;
        }
      }
    }
  }

  // ---- 毒沼蟾:蛙跳 + 吐毒沼 ----
  private toads(world: World, dt: number, pe: Entity, ptr: Transform, pr: number, pAlive: boolean): void {
    for (const e of world.query(ToxinToad, Transform, Velocity, Stats, Body)) {
      const td = world.mustGet(e, ToxinToad);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      td.animT += dt;
      td.contactCd -= dt;
      td.lobCd -= dt;
      if ((buffs && buffs.stunT > 0) || !pAlive) { vel.vx = 0; vel.vy = 0; continue; }
      const slow = buffs && buffs.slowT > 0 ? 1 - buffs.slowPct : 1;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      tr.face = Math.atan2(dy, dx);

      switch (td.state) {
        case 'idle': {
          vel.vx = 0;
          vel.vy = 0;
          if (td.lobCd <= 0 && dist < TOAD.lob.rangeM * M) {
            td.state = 'aim';
            td.t = TOAD.lob.aimS;
          } else {
            td.hopCd -= dt;
            if (td.hopCd <= 0 && dist > 2.2 * M) {
              td.state = 'hop';
              td.t = TOAD.hop.dur;
              vel.vx = (dx / dist) * TOAD.hop.speedM * M * slow;
              vel.vy = (dy / dist) * TOAD.hop.speedM * M * slow;
            }
          }
          break;
        }
        case 'hop': {
          td.t -= dt;
          if (td.t <= 0) {
            td.state = 'idle';
            td.hopCd = TOAD.hop.cd;
          }
          break;
        }
        case 'aim': {
          vel.vx = 0;
          vel.vy = 0;
          td.t -= dt; // 鼓腮预警
          if (td.t <= 0) {
            // 毒沼直接落在玩家脚下(有 aim 时间可走位)
            const z = world.create();
            world.add(z, new Transform(ptr.x, ptr.y));
            world.add(z, new Zone(TOAD.lob.zoneRadiusM * M, TOAD.lob.zoneLifeS, TOAD.lob.tickS,
              stats.atk, TOAD.lob.mult, 'toxin', 'enemy', elementColor('toxin')));
            world.emit(new SfxEvent('reaction'));
            td.state = 'idle';
            td.lobCd = TOAD.lob.cd;
          }
          break;
        }
      }

      if (dist < body.radius * M + pr + 4 && td.contactCd <= 0) {
        td.contactCd = TOAD.contactCd;
        PlayerSystem.applyHurt(world, pe, stats.atk * 0.6);
      }
    }
  }

  // ---- 星尘精灵:逃跑 + 超时溜走 ----
  private sprites(world: World, dt: number, ptr: Transform): void {
    for (const e of world.query(StardustSprite, Transform, Velocity, Stats)) {
      const sp = world.mustGet(e, StardustSprite);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      sp.animT += dt;
      sp.lifeT -= dt;
      if (sp.lifeT <= 0) {
        world.destroy(e); // 溜走,不给奖励
        continue;
      }
      const dx = tr.x - ptr.x;
      const dy = tr.y - ptr.y;
      const dist = Math.hypot(dx, dy) || 1;
      // 逃离玩家 + 蛇形抖动;贴墙时沿切线滑
      const wob = Math.sin(sp.animT * 7) * 0.6;
      vel.vx = (dx / dist - (dy / dist) * wob) * stats.moveSpeed * M;
      vel.vy = (dy / dist + (dx / dist) * wob) * stats.moveSpeed * M;
      tr.face = Math.atan2(-dy, -dx);
    }
  }
}
