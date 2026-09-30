import type { System, World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import { elementColor } from '@game/combat/Elements';
import {
  BossPhaseEvent,
  Body, Buffs, Faction, Health, MidBossHuntress, Player, Projectile,
  SfxEvent, Stats, TelegraphStrike, ToastEvent, Transform, Velocity,
} from '@game/components';

const S = balance.enemies.midboss_frosthuntress;
const ARENA = balance.arena;

/** 中 Boss 二号的手感旋钮(集中放这里,便于对着录像调) */
export const HUNTRESS_TUNING = {
  /** 风筝距离容差:近于 minM 想跑,远于 maxM 想贴 */
  keepMinM: S.kiteM * 0.75,
  keepMaxM: S.kiteM * 1.55,
  /** 蓄力被打断的判定阈值:蓄力期掉血超过这个数就算被命中(0.5 = 任何真实伤害) */
  interruptDmg: 0.5,
  /** 直线冰枪的起始距离(太近会打在自己脚下) */
  laneStartM: 1.6,
} as const;

/**
 * 第二章中 Boss 霜噬女猎(双线镜像:Unity `Dungeon/CreatureAI.cs` 的 FrostHuntress 段)。
 *
 * 与巨鹿完全反向的设计:巨鹿要贴脸(冲撞),她要距离(弓)。三个招式 = 三种"读法":
 * 1. **瞬影冰矢**:蹲身 0.35s → 瞬步拉开 → 三连追踪冰矢(每发独立瞄准) —— 教玩家"她会跑,追要预判";
 * 2. **冰牙陷阵**:玩家脚下 + 环绕两处延时冰爆(错拍结算) —— 教玩家"站着不动就挨炸";
 * 3. **猎杀凝视**(核心博弈):1.5s 蓄力,直线 6 段冰枪预警;蓄力期间她**受伤加深**
 *    (Buffs.vulnT,与脆蚀共用通道)且**任何命中都会打断** → 打断 = interruptStunS 硬直
 *    (奖励窗口)。玩家的选择:冲进直线赌打断(高风险高收益),还是横向拉开躲枪(稳)。
 *    —— 巨鹿的博弈是"骗它撞墙",她的博弈是"敢不敢打断"。
 *
 * P2(<50%)狂怒:冰矢 +1、陷阱 +1、移速 ×1.15、冷却 ×0.85 —— 数值全走 balance。
 * 三招独立冷却只重置用掉的那招(与巨鹿同一课,有轮换回归测试)。
 */
export class MidBossHuntressSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;

    for (const e of world.query(MidBossHuntress, Transform, Velocity, Stats, Health, Body)) {
      const hs = world.mustGet(e, MidBossHuntress);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const hp = world.mustGet(e, Health);
      const buffs = world.get(e, Buffs);
      hs.animT += dt;
      if (!pAlive) {
        vel.vx = 0;
        vel.vy = 0;
        continue;
      }

      // ---- 阶段切换:半血狂怒 ----
      const ratio = hp.hp / hp.max;
      if (hs.phase === 1 && ratio <= S.phase2At) {
        hs.phase = 2;
        hs.blinkCd = Math.min(hs.blinkCd, 0.5);
        hs.trapCd = Math.min(hs.trapCd, 1.0);
        world.emit(new ToastEvent('❄ 霜噬女猎狂怒:霜雾凝弓,箭上生牙!', '#8fd4ff'));
        world.emit(new BossPhaseEvent('霜噬女猎', 2, '「狂怒」', '#8fd4ff', tr.x, tr.y));
        world.emit(new SfxEvent('ult'));
      }
      const enraged = hs.phase === 2;
      const cdMul = enraged ? S.enrageCdMul : 1;
      hs.blinkCd -= dt;
      hs.trapCd -= dt;
      hs.markCd -= dt;

      // 外来硬直(眩晕):蓄力中被控也要连预警一起撤(只停动作会留下一排"幽灵冰枪")
      const stun = buffs !== undefined && buffs.stunT > 0;
      if (stun && hs.state !== 'stagger') {
        if (hs.state === 'markChannel') this.cancelMark(world, hs);
        vel.vx = 0;
        vel.vy = 0;
        hs.state = 'stagger';
        hs.t = Math.max(hs.t, buffs!.stunT);
      }

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      switch (hs.state) {
        case 'kite': {
          tr.face = Math.atan2(dy, dx);
          // 距离管理 + 侧移(她是弓手:要射击空间,不要贴脸)
          const side = Math.cos(hs.animT * 1.1) >= 0 ? 1 : -1;
          let mx: number;
          let my: number;
          if (dist < HUNTRESS_TUNING.keepMinM * M) {
            mx = -nx; my = -ny;
          } else if (dist > HUNTRESS_TUNING.keepMaxM * M) {
            mx = nx; my = ny;
          } else {
            mx = -ny * side; my = nx * side;
          }
          const backToMid = this.steerToArena(tr);
          mx += backToMid.x;
          my += backToMid.y;
          const m = Math.hypot(mx, my) || 1;
          const spd = stats.moveSpeed * (enraged ? S.enrageSpeedMul : 1) * M;
          vel.vx = (mx / m) * spd;
          vel.vy = (my / m) * spd;

          // 三招轮换:就绪里挑"过期最久"的(与巨鹿同规则,推广到三招)
          const ready: Array<['blink' | 'traps' | 'mark', number]> = [];
          if (hs.blinkCd <= 0) ready.push(['blink', hs.blinkCd]);
          if (hs.trapCd <= 0) ready.push(['traps', hs.trapCd]);
          if (hs.markCd <= 0) ready.push(['mark', hs.markCd]);
          if (ready.length > 0) {
            ready.sort((a, b) => a[1] - b[1]);
            const move = ready[0][0];
            hs.lastMove = move;
            vel.vx = 0;
            vel.vy = 0;
            if (move === 'blink') {
              hs.state = 'blinkWind';
              hs.t = S.blink.telegraphS;
            } else if (move === 'traps') {
              hs.state = 'trapAim';
              hs.t = S.traps.telegraphS * 0.5; // 起手是抬手,真正的倒计时在冰爆圈上
            } else {
              this.startMark(world, e, hs, tr, stats, nx, ny);
            }
          }
          break;
        }

        case 'blinkWind': {
          // 蹲身预警:告诉玩家"她要跑了"
          vel.vx = 0;
          vel.vy = 0;
          hs.t -= dt;
          if (hs.t <= 0) {
            // 瞬步:沿"玩家 → 她"的方向再拉开 rangeM(夹回场内)
            const bx = tr.x - nx * S.blink.rangeM * M;
            const by = tr.y - ny * S.blink.rangeM * M;
            const pad = 1.2 * M;
            tr.x = Math.min(Math.max(bx, pad), ARENA.widthM * M - pad);
            tr.y = Math.min(Math.max(by, pad), ARENA.heightM * M - pad);
            hs.state = 'shoot';
            hs.shotsLeft = S.arrows.count + (enraged ? S.enrageArrowAdd : 0);
            hs.shotT = 0;
            world.emit(new SfxEvent('dash'));
          }
          break;
        }

        case 'shoot': {
          // 落地连射:每发都重新瞄准(追身,逼玩家持续移动而不是躲一次就完)
          vel.vx = 0;
          vel.vy = 0;
          tr.face = Math.atan2(dy, dx);
          hs.shotT -= dt;
          if (hs.shotT <= 0 && hs.shotsLeft > 0) {
            this.fireArrow(world, tr, stats, nx, ny);
            hs.shotsLeft -= 1;
            hs.shotT = S.arrows.intervalS;
          }
          if (hs.shotsLeft <= 0) {
            hs.state = 'recover';
            hs.t = 0.4;
          }
          break;
        }

        case 'trapAim': {
          vel.vx = 0;
          vel.vy = 0;
          tr.face = Math.atan2(dy, dx);
          hs.t -= dt;
          if (hs.t <= 0) {
            this.placeTraps(world, stats, ptr, enraged);
            hs.state = 'recover';
            hs.t = 0.5;
            world.emit(new SfxEvent('skill'));
          }
          break;
        }

        case 'markChannel': {
          // 蓄力:站桩 + 受伤加深 + 掉血即打断(核心博弈)
          vel.vx = 0;
          vel.vy = 0;
          tr.face = Math.atan2(hs.dirY, hs.dirX);
          if (hp.hp < hs.hpAtChannel - HUNTRESS_TUNING.interruptDmg) {
            this.cancelMark(world, hs);
            hs.state = 'stagger';
            hs.t = S.mark.interruptStunS;
            world.emit(new ToastEvent('🏹 猎杀凝视被打断 — 输出窗口!', '#e8c07a'));
            world.emit(new SfxEvent('reaction'));
            break;
          }
          hs.t -= dt;
          if (hs.t <= 0) {
            // 蓄满:冰枪由 TelegraphSystem 按各自倒计时结算,这里只收招
            hs.laneIds = [];
            hs.state = 'recover';
            hs.t = 0.6;
            world.emit(new SfxEvent('skill'));
          }
          break;
        }

        case 'recover': {
          vel.vx = 0;
          vel.vy = 0;
          hs.t -= dt;
          if (hs.t <= 0) {
            hs.state = 'kite';
            this.resetUsedMove(hs, cdMul);
          }
          break;
        }

        case 'stagger': {
          vel.vx = 0;
          vel.vy = 0;
          hs.t -= dt;
          if (hs.t <= 0) {
            hs.state = 'kite';
            this.resetUsedMove(hs, cdMul);
          }
          break;
        }
      }

      // 朝向:蓄力用锁定方向,其余面向玩家
      if (hs.state !== 'markChannel') tr.face = Math.atan2(dy, dx);
    }
  }

  /** 收招:只把刚用掉的那一招放回冷却(三招自然轮换,谁都不会被饿死) */
  private resetUsedMove(hs: MidBossHuntress, cdMul: number): void {
    if (hs.lastMove === 'blink') hs.blinkCd = S.blink.cdS * cdMul;
    else if (hs.lastMove === 'traps') hs.trapCd = S.traps.cdS * cdMul;
    else hs.markCd = S.mark.cdS * cdMul;
  }

  /** 追踪冰矢一发(发射时瞄准,飞行中不转向) */
  private fireArrow(world: World, tr: Transform, stats: Stats, nx: number, ny: number): void {
    const a = S.arrows;
    const color = elementColor('ice');
    const p = world.create();
    world.add(p, new Transform(tr.x + nx * 12, tr.y - 16 + ny * 12));
    const pv = new Velocity();
    pv.vx = nx * a.speedM * M;
    pv.vy = ny * a.speedM * M;
    world.add(p, pv);
    world.add(p, new Faction('enemy'));
    world.add(p, new Projectile('enemy', stats.atk, a.mult, 'ice', a.radiusM * M, a.lifeS, color));
    world.emit(new SfxEvent('shot'));
  }

  /** 冰牙陷阵:玩家脚下 + 环绕若干处延时冰爆(错拍结算 —— 一起炸就只需要躲一次) */
  private placeTraps(world: World, stats: Stats, ptr: Transform, enraged: boolean): void {
    const t = S.traps;
    const count = t.count + (enraged ? S.enrageTrapAdd : 0);
    const color = elementColor('ice');
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2;
      const ox = i === 0 ? 0 : Math.cos(ang) * t.ringM * M;
      const oy = i === 0 ? 0 : Math.sin(ang) * t.ringM * M;
      const ts = world.create();
      world.add(ts, new Transform(ptr.x + ox, ptr.y + oy));
      world.add(ts, new TelegraphStrike(
        t.telegraphS + i * t.stepS, t.radiusM * M, stats.atk, t.mult, 'enemy', color,
      ));
    }
  }

  /** 猎杀凝视起手:锁定朝向,铺出直线 6 段冰枪预警(倒计时 = 蓄力时长 + 涟漪) */
  private startMark(
    world: World, self: number, hs: MidBossHuntress, tr: Transform, stats: Stats, nx: number, ny: number,
  ): void {
    const mk = S.mark;
    hs.state = 'markChannel';
    hs.t = mk.channelS;
    hs.dirX = nx;
    hs.dirY = ny;
    hs.hpAtChannel = world.mustGet(self, Health).hp;
    hs.laneIds = [];
    const color = elementColor('ice');
    for (let i = 0; i < mk.segments; i++) {
      const d = (HUNTRESS_TUNING.laneStartM + i * mk.stepM) * M;
      const ts = world.create();
      world.add(ts, new Transform(tr.x + nx * d, tr.y + ny * d));
      world.add(ts, new TelegraphStrike(
        mk.channelS + i * mk.rippleS, mk.radiusM * M, stats.atk, mk.mult, 'enemy', color,
      ));
      hs.laneIds.push(ts);
    }
    // 受伤加深:与脆蚀共用 Buffs.vulnT 通道(蓄力就是她把要害亮出来的时刻)
    const buffs = world.get(self, Buffs);
    if (buffs) buffs.vulnT = Math.max(buffs.vulnT, mk.channelS);
    world.emit(new SfxEvent('growl'));
    world.emit(new ToastEvent('❄ 猎杀凝视 — 打断她,或离开直线!', '#8fd4ff'));
  }

  /** 打断/被控:撤掉还没结算的冰枪预警(不能只停动作留下"幽灵冰枪") */
  private cancelMark(world: World, hs: MidBossHuntress): void {
    for (const id of hs.laneIds) world.destroy(id);
    world.flushDestroyed();
    hs.laneIds = [];
  }

  /** 越靠近边界,越朝场内回中(与巨鹿同款,防止被风筝进墙角) */
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
