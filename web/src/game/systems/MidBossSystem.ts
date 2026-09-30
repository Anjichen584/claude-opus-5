import { t } from '@game/i18n';
import type { System, World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { elementColor } from '@game/combat/Elements';
import {
  BossPhaseEvent,
  Body, Buffs, ElementMarks, Faction, Health, MidBossStag, Player, Projectile,
  SfxEvent, Stats, TelegraphStrike, ToastEvent, Transform, Velocity, Zone,
} from '@game/components';
import { PlayerSystem } from './PlayerSystem';

const S = balance.enemies.midboss_mossstag;
const ARENA = balance.arena;

/** 中 Boss 的战斗手感旋钮(集中放这里,便于对着录像调) */
export const MIDBOSS_TUNING = {
  /** 保持距离的容差:离玩家近于 minM 就后撤,远于 maxM 就贴近 */
  keepMinM: S.stalkM * 0.7,
  keepMaxM: S.stalkM * 1.4,
  /** 撞墙判定余量:冲出竞技场边界这么多米就算撞墙 */
  wallPadM: 0.6,
  /** 冲撞预警在路径上亮几个圈(玩家要能看清“这条线别站”) */
  laneDots: 3,
  /** 冲撞命中的击退(给玩家的位移冲量,px/s) */
  hitShoveV: 150,
} as const;

/**
 * 第一章中 Boss 苔冠巨鹿(双线镜像:Unity «Dungeon/CreatureAI.cs» 的 MossStag 段)。
 *
 * 三个招式 = 三种“读法”:
 * 1. **冲撞**:3 个预警圈连成一条线,锁朝向 → 冲 → **撞墙自晕 2.2s**(核心奖励窗口:
 *    会走位的玩家能把它的冲锋骗到墙上,不会走位就被追着撞);
 * 2. **孢子弹幕**:扇形 5(狂怒 7)发毒弹,逼玩家横向移动;
 * 3. **孢子云**:在玩家脚下种一团持续伤害区,做空间封锁(与菇灵孢子同款结算)。
 *
 * P2(<50%)狂怒:冲速 ×1.25、弹幕 +2 发、冷却 ×0.8 —— 数值全部来自 balance.midboss。
 * 掉落:击杀保底 «runeDrop» 枚符文(直接掉 Pickup,不用等 LootSystem 的随机判定)。
 */
export class MidBossSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;

    for (const e of world.query(MidBossStag, Transform, Velocity, Stats, Health, Body)) {
      const stag = world.mustGet(e, MidBossStag);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const hp = world.mustGet(e, Health);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      stag.animT += dt;
      if (!pAlive) {
        vel.vx = 0;
        vel.vy = 0;
        continue;
      }

      // ---- 阶段切换:半血狂怒 ----
      const ratio = hp.hp / hp.max;
      if (stag.phase === 1 && ratio <= S.phase2At) {
        stag.phase = 2;
        // 狂怒瞬间不立刻出招,给玩家一个读条(两招都压到 0.4s 内,由轮换逻辑决定先出哪招)
        stag.chargeCd = Math.min(stag.chargeCd, 0.4);
        stag.volleyCd = Math.min(stag.volleyCd, 0.7);
        world.emit(new ToastEvent(t('mb.stag.rage'), '#8fd45f'));
        world.emit(new BossPhaseEvent(t('mb.stag.name'), 2, t('mb.phase.rage'), '#8fd45f', tr.x, tr.y));
        world.emit(new SfxEvent('ult'));
      }
      const enraged = stag.phase === 2;
      const cdMul = enraged ? 0.8 : 1;
      const stun = buffs !== undefined && buffs.stunT > 0;
      // 两个招式各有独立冷却:**只重置用掉的那一招**,另一招继续走表
      // (一版是“两招一起重置”,结果冷却短的总先就绪 → 孢子弹幕永远轮不到,实战里看不见)
      stag.chargeCd -= dt;
      stag.volleyCd -= dt;

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      const contact = (body.radius + 0.3) * M + 6;

      // 硬直期间只递减计时(玩家输出窗口)
      if (stun && stag.state !== 'stagger') {
        vel.vx = 0;
        vel.vy = 0;
        stag.state = 'stagger';
        stag.t = Math.max(stag.t, buffs!.stunT);
      }

      switch (stag.state) {
        case 'stalk': {
          // 面向玩家,但只做“侧向绕圈 + 拉距离”:冲撞要助跑距离,所以它不贴脸
          tr.face = Math.atan2(dy, dx);
          const side = Math.cos(stag.animT * 0.8) >= 0 ? 1 : -1;
          const nx = dx / dist;
          const ny = dy / dist;
          let mx: number;
          let my: number;
          if (dist < MIDBOSS_TUNING.keepMinM * M) {
            mx = -nx; my = -ny;             // 太近 → 后撤
          } else if (dist > MIDBOSS_TUNING.keepMaxM * M) {
            mx = nx; my = ny;               // 太远 → 贴近
          } else {
            mx = -ny * side; my = nx * side; // 距离合适 → 横向绕圈
          }
          // 别被拉出竞技场:靠近边界时朝出生点回中
          const backToMid = this.steerToArena(tr);
          mx += backToMid.x;
          my += backToMid.y;
          const m = Math.hypot(mx, my) || 1;
          vel.vx = (mx / m) * stats.moveSpeed * M;
          vel.vy = (my / m) * stats.moveSpeed * M;

          const chargeReady = stag.chargeCd <= 0;
          const volleyReady = stag.volleyCd <= 0;
          // 都就绪 → 谁过期更久谁先出(两招轮换);否则谁就绪谁出
          const takeCharge = chargeReady && volleyReady
            ? stag.chargeCd <= stag.volleyCd
            : chargeReady;
          if (takeCharge) {
            stag.lastMove = 'charge';
            stag.state = 'chargeWind';
            stag.t = S.charge.telegraphS;
            stag.dirX = nx;
            stag.dirY = ny;
            vel.vx = 0;
            vel.vy = 0;
            // 路径预警:沿锁定的朝向亮 3 个圈,圈距 = 冲锋距离 / 3
            for (let i = 0; i < MIDBOSS_TUNING.laneDots; i++) {
              const d = (S.charge.laneM * (i + 1)) / MIDBOSS_TUNING.laneDots;
              const ts = world.create();
              world.add(ts, new Transform(tr.x + nx * d * M, tr.y + ny * d * M));
              world.add(ts, new TelegraphStrike(
                S.charge.telegraphS + i * 0.06, 0.9 * M, stats.atk, S.charge.mult, 'enemy', '#8fd45f',
              ));
            }
            world.emit(new SfxEvent('growl'));
          } else if (volleyReady) {
            stag.lastMove = 'volley';
            stag.state = 'volleyAim';
            stag.t = S.volley.telegraphS;
            vel.vx = 0;
            vel.vy = 0;
          }
          break;
        }

        case 'chargeWind': {
          // 预警期:原地压低身体(渲染用 animT 压低),朝向已锁定不再跟随
          vel.vx = 0;
          vel.vy = 0;
          stag.t -= dt;
          if (stag.t <= 0) {
            stag.state = 'charge';
            stag.t = S.charge.durS;
            world.emit(new SfxEvent('dash'));
          }
          break;
        }

        case 'charge': {
          const speed = S.charge.speedM * M * (enraged ? S.enrageSpeedMul : 1);
          vel.vx = stag.dirX * speed;
          vel.vy = stag.dirY * speed;
          stag.t -= dt;
          // 撞到玩家:伤害 + 把玩家推开(位移冲量由 Velocity 施加,和翻滚同套物理)
          if (dist < contact) {
            PlayerSystem.applyHurt(world, pe, stats.atk * S.charge.mult);
            const pv = world.get(pe, Velocity);
            if (pv) {
              pv.vx += stag.dirX * MIDBOSS_TUNING.hitShoveV;
              pv.vy += stag.dirY * MIDBOSS_TUNING.hitShoveV;
            }
            vel.vx = 0;
            vel.vy = 0;
            stag.state = 'stagger';
            stag.t = S.charge.wallStunS * 0.5; // 撞人只晕一半(撞墙才是大奖励)
            break;
          }
          // 撞墙:自己晕 (S.charge.wallStunS) —— 这是这场战斗的核心博弈
          if (this.hitsWall(tr.x, tr.y)) {
            vel.vx = 0;
            vel.vy = 0;
            stag.state = 'stagger';
            stag.t = S.charge.wallStunS;
            world.emit(new SfxEvent('reaction'));
            world.emit(new ToastEvent(t('mb.stag.stuck'), '#e8c07a'));
          } else if (stag.t <= 0) {
            stag.state = 'recover';
            stag.t = S.charge.recoverS;
          }
          break;
        }

        case 'volleyAim': {
          vel.vx = 0;
          vel.vy = 0;
          tr.face = Math.atan2(dy, dx);
          stag.t -= dt;
          if (stag.t <= 0) {
            this.fireVolley(world, e, tr, stats, ptr.x, ptr.y, enraged);
            stag.state = 'recover';
            stag.t = 0.45;
          }
          break;
        }

        case 'recover': {
          vel.vx = 0;
          vel.vy = 0;
          stag.t -= dt;
          if (stag.t <= 0) {
            stag.state = 'stalk';
            this.resetUsedMove(stag, cdMul);
          }
          break;
        }

        case 'stagger': {
          vel.vx = 0;
          vel.vy = 0;
          stag.t -= dt;
          if (stag.t <= 0) {
            stag.state = 'stalk';
            // 硬直结束后比平时更快接下一招(惩罚没抓住窗口的玩家)
            this.resetUsedMove(stag, cdMul * 0.7);
          }
          break;
        }
      }

      // 朝向:非冲锋状态始终面对玩家(冲锋用锁定朝向)
      if (stag.state !== 'charge' && stag.state !== 'chargeWind') {
        tr.face = Math.atan2(dy, dx);
      } else {
        tr.face = Math.atan2(stag.dirY, stag.dirX);
      }
    }
  }

  /** 收招:只把刚用掉的那一招放回冷却(另一招继续走,于是两招自然轮换) */
  private resetUsedMove(stag: MidBossStag, cdMul: number): void {
    if (stag.lastMove === 'charge') stag.chargeCd = S.charge.cdS * cdMul;
    else stag.volleyCd = S.volley.cdS * cdMul;
  }

  /** 扇形孢子弹幕 + 落点孢子云(空间封锁) */
  private fireVolley(
    world: World, self: number, tr: Transform, stats: Stats, tx: number, ty: number, enraged: boolean,
  ): void {
    const v = S.volley;
    const count = v.count + (enraged ? S.enrageVolleyAdd : 0);
    const base = Math.atan2(ty - tr.y, tx - tr.x);
    const spread = (v.spreadDeg * Math.PI) / 180;
    const color = elementColor('toxin');
    for (let i = 0; i < count; i++) {
      const a = base + (count === 1 ? 0 : (i / (count - 1) - 0.5) * spread);
      const p = world.create();
      world.add(p, new Transform(tr.x + Math.cos(a) * 14, tr.y - 18 + Math.sin(a) * 14));
      const pv = new Velocity();
      pv.vx = Math.cos(a) * v.speedM * M;
      pv.vy = Math.sin(a) * v.speedM * M;
      world.add(p, pv);
      world.add(p, new Faction('enemy'));
      world.add(p, new Projectile('enemy', stats.atk, v.mult, 'toxin', v.radiusM * M, v.lifeS, color));
    }
    // 玩家脚下种孢子云(不是必中的伤害,而是“这块地不能站”)
    const sp = S.spore;
    const z = world.create();
    world.add(z, new Transform(tx, ty));
    world.add(z, new Zone(sp.radiusM * M, sp.lifeS, sp.intervalS, stats.atk, sp.mult, 'toxin', 'enemy', color));
    world.emit(new SfxEvent('skill'));
    // 自身元素印记:让玩家的反应连招也能用上(毒 + 火 = 爆燃)
    const marks = world.get(self, ElementMarks);
    if (marks) marks.marks.toxin = 3.0;
    world.emit(new SfxEvent('growl'));
  }

  /** 冲出竞技场边界 = 撞墙(mid-boss 用硬边界做“可用地形”) */
  private hitsWall(x: number, y: number): boolean {
    const pad = MIDBOSS_TUNING.wallPadM * M;
    return x < pad || y < pad || x > ARENA.widthM * M - pad || y > ARENA.heightM * M - pad;
  }

  /** 越靠近边界,越朝场内回中(防止被风筝到墙角打不着) */
  private steerToArena(tr: Transform): { x: number; y: number } {
    const near = 2.5 * M;
    let x = 0;
    let y = 0;
    if (tr.x < near) x += (near - tr.x) / near;
    if (tr.y < near) y += (near - tr.y) / near;
    if (tr.x > ARENA.widthM * M - near) x -= (tr.x - (ARENA.widthM * M - near)) / near;
    if (tr.y > ARENA.heightM * M - near) y -= (tr.y - (ARENA.heightM * M - near)) / near;
    return { x, y };
  }
}
