import { t } from '@game/i18n';
import type { System, World } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import {
  BossPhaseEvent,
  Body, Buffs, Health, MidBossReaper, Player, SfxEvent, Stats,
  TelegraphStrike, ToastEvent, Transform, Velocity, Zone,
} from '@game/components';
import { PlayerSystem } from './PlayerSystem';

const S = balance.enemies.midboss_sandreaper;
const ARENA = balance.arena;

/** 中 Boss 三号的手感旋钮 */
export const REAPER_TUNING = {
  /** 压迫距离:比女猎近(她要射击位)、比巨鹿远(它要助跑) */
  keepMinM: S.stalkM * 0.8,
  keepMaxM: S.stalkM * 1.6,
  /** 钩的直线预警点数(细线,和冲撞的粗圈区分) */
  hookDots: 4,
  /** 跳劈命中判定的宽容半径(略大于圈,贴边不算白给) */
  hitPad: 1.1,
  /** 沙暴区的颜色(荒漠的土金色,与毒绿/冰蓝区分) */
  sandColor: '#d4a45f',
} as const;

/**
 * 第三章中 Boss 沙暴刽子(双线镜像:Unity «Dungeon/CreatureAI.cs» 的 SandReaper 段)。
 *
 * 中 Boss 三性格的收官:巨鹿=莽(骗它撞墙)、女猎=溜(赌打断)、**刽子=钓(骗它劈空)**。
 * 三个招式 = 三种“读法”:
 * 1. **沙缚镰钩**:直线细预警 → 掷钩,命中把玩家**拉到脸前**+小伤 —— 教玩家“细线也要躲,
 *    被钩到就要吃接下来的斩”;
 * 2. **处刑斩**(核心博弈):锁定玩家当前位置亮大圆 → 跳劈过去。**劈空 = 刀卡进沙里
 *    missStunS 满硬直**(奖励窗口);劈中只有 hitStunS 半硬直。与巨鹿撞墙同构,
 *    但躲的是“一个点”而不是“一条线”,且常和镰钩连成组合技(被拉到脸前 → 立刻要躲圈);
 * 3. **沙暴漩涡**:以**自己**为中心环形铺沙暴区 —— 领域封锁,逼玩家不许白嫖贴脸。
 *
 * P2(<50%)狂怒:钩速 ×1.25、漩涡 +1、移速 ×1.15、冷却 ×0.85 —— 数值全走 balance。
 * 三招独立冷却只重置用掉的那招(前两位中 Boss 的同款轮换,有回归测试)。
 */
export class MidBossReaperSystem implements System {
  update(world: World, dt: number): void {
    const players = world.query(Player, Transform);
    if (players.length === 0) return;
    const pe = players[0];
    const ptr = world.mustGet(pe, Transform);
    const pAlive = world.mustGet(pe, Player).respawnT <= 0;

    for (const e of world.query(MidBossReaper, Transform, Velocity, Stats, Health, Body)) {
      const rp = world.mustGet(e, MidBossReaper);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const hp = world.mustGet(e, Health);
      const body = world.mustGet(e, Body);
      const buffs = world.get(e, Buffs);
      rp.animT += dt;
      if (!pAlive) {
        vel.vx = 0;
        vel.vy = 0;
        continue;
      }

      // ---- 半血狂怒 ----
      const ratio = hp.hp / hp.max;
      if (rp.phase === 1 && ratio <= S.phase2At) {
        rp.phase = 2;
        rp.hookCd = Math.min(rp.hookCd, 0.5);
        rp.cleaveCd = Math.min(rp.cleaveCd, 1.0);
        world.emit(new ToastEvent(t('mb.reaper.rage'), REAPER_TUNING.sandColor));
        world.emit(new BossPhaseEvent(t('mb.reaper.name'), 2, t('mb.phase.rage'), REAPER_TUNING.sandColor, tr.x, tr.y));
        world.emit(new SfxEvent('ult'));
      }
      const enraged = rp.phase === 2;
      const cdMul = enraged ? S.enrageCdMul : 1;
      rp.hookCd -= dt;
      rp.cleaveCd -= dt;
      rp.stormCd -= dt;

      // 外来硬直:钩在飞也要收回(不能留一只“幽灵钩”继续拉人)
      const stun = buffs !== undefined && buffs.stunT > 0;
      if (stun && rp.state !== 'stagger') {
        vel.vx = 0;
        vel.vy = 0;
        rp.state = 'stagger';
        rp.t = Math.max(rp.t, buffs!.stunT);
      }

      const dx = ptr.x - tr.x;
      const dy = ptr.y - tr.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      switch (rp.state) {
        case 'stalk': {
          tr.face = Math.atan2(dy, dx);
          const side = Math.cos(rp.animT * 0.9) >= 0 ? 1 : -1;
          let mx: number;
          let my: number;
          if (dist < REAPER_TUNING.keepMinM * M) {
            mx = -nx; my = -ny;
          } else if (dist > REAPER_TUNING.keepMaxM * M) {
            mx = nx; my = ny;
          } else {
            mx = -ny * side; my = nx * side;
          }
          const back = this.steerToArena(tr);
          mx += back.x;
          my += back.y;
          const m = Math.hypot(mx, my) || 1;
          const spd = stats.moveSpeed * (enraged ? S.enrageSpeedMul : 1) * M;
          vel.vx = (mx / m) * spd;
          vel.vy = (my / m) * spd;

          // 三招轮换(与女猎同规则:就绪里挑过期最久的)
          const ready: Array<['hook' | 'cleave' | 'storm', number]> = [];
          if (rp.hookCd <= 0) ready.push(['hook', rp.hookCd]);
          if (rp.cleaveCd <= 0) ready.push(['cleave', rp.cleaveCd]);
          if (rp.stormCd <= 0) ready.push(['storm', rp.stormCd]);
          if (ready.length > 0) {
            ready.sort((a, b) => a[1] - b[1]);
            rp.lastMove = ready[0][0];
            vel.vx = 0;
            vel.vy = 0;
            if (rp.lastMove === 'hook') {
              rp.state = 'hookWind';
              rp.t = S.hook.telegraphS;
              rp.hookDirX = nx;
              rp.hookDirY = ny;
              // 直线细预警:4 个小点(和冲撞的 3 个粗圈区分开;钩本体的伤害在钩上,点不结算伤害级别)
              for (let i = 0; i < REAPER_TUNING.hookDots; i++) {
                const d = (S.hook.rangeM * (i + 1)) / REAPER_TUNING.hookDots;
                const ts = world.create();
                world.add(ts, new Transform(tr.x + nx * d * M, tr.y + ny * d * M));
                world.add(ts, new TelegraphStrike(
                  S.hook.telegraphS + i * 0.04, 0.35 * M, stats.atk, 0.05, 'enemy', REAPER_TUNING.sandColor,
                ));
              }
              world.emit(new SfxEvent('growl'));
            } else if (rp.lastMove === 'cleave') {
              rp.state = 'cleaveWind';
              rp.t = S.cleave.telegraphS;
              rp.targetX = ptr.x;
              rp.targetY = ptr.y;
              // 处刑圈:预警时长 = 抬刀 + 腾空,落点结算真实伤害
              const ts = world.create();
              world.add(ts, new Transform(ptr.x, ptr.y));
              world.add(ts, new TelegraphStrike(
                S.cleave.telegraphS + S.cleave.leapS, S.cleave.radiusM * M,
                stats.atk, S.cleave.mult, 'enemy', REAPER_TUNING.sandColor,
              ));
              world.emit(new SfxEvent('growl'));
            } else {
              rp.state = 'stormCast';
              rp.t = 0.5;
            }
          }
          break;
        }

        case 'hookWind': {
          vel.vx = 0;
          vel.vy = 0;
          tr.face = Math.atan2(rp.hookDirY, rp.hookDirX);
          rp.t -= dt;
          if (rp.t <= 0) {
            rp.state = 'hookOut';
            rp.hookX = tr.x;
            rp.hookY = tr.y - 14;
            rp.hookDist = 0;
            world.emit(new SfxEvent('shot'));
          }
          break;
        }

        case 'hookOut': {
          // 钩在飞:系统自推(命中拉人,不走投射物管线 —— 拉力是这招的全部意义)
          vel.vx = 0;
          vel.vy = 0;
          const hookSpd = S.hook.speedM * (enraged ? S.enrageHookSpeedMul : 1) * M;
          const step = hookSpd * dt;
          rp.hookX += rp.hookDirX * step;
          rp.hookY += rp.hookDirY * step;
          rp.hookDist += step;
          const hd = Math.hypot(ptr.x - rp.hookX, ptr.y - rp.hookY);
          if (hd < S.hook.radiusM * M + 0.3 * M) {
            // 命中:小伤 + 把玩家拉到脸前(拉力朝他,和翻滚同套速度物理)
            PlayerSystem.applyHurt(world, pe, stats.atk * S.hook.mult);
            const pv = world.get(pe, Velocity);
            if (pv) {
              const pbx = tr.x - ptr.x;
              const pby = tr.y - ptr.y;
              const pm = Math.hypot(pbx, pby) || 1;
              pv.vx += (pbx / pm) * S.hook.pullV;
              pv.vy += (pby / pm) * S.hook.pullV;
            }
            world.emit(new ToastEvent(t('mb.reaper.hook'), REAPER_TUNING.sandColor));
            world.emit(new SfxEvent('reaction'));
            rp.state = 'recover';
            rp.t = 0.45;
          } else if (rp.hookDist >= S.hook.rangeM * M) {
            rp.state = 'recover';
            rp.t = 0.4;
          }
          break;
        }

        case 'cleaveWind': {
          // 抬刀:落点已锁死(圈不追人 —— 躲圈是玩家的活)
          vel.vx = 0;
          vel.vy = 0;
          tr.face = Math.atan2(rp.targetY - tr.y, rp.targetX - tr.x);
          rp.t -= dt;
          if (rp.t <= 0) {
            rp.state = 'cleaveLeap';
            rp.t = S.cleave.leapS;
            world.emit(new SfxEvent('dash'));
          }
          break;
        }

        case 'cleaveLeap': {
          // 腾空扑向落点:按剩余时间匀速(落点固定,时间到必到)
          const remain = Math.max(rp.t, 1 / 60);
          vel.vx = (rp.targetX - tr.x) / remain;
          vel.vy = (rp.targetY - tr.y) / remain;
          rp.t -= dt;
          if (rp.t <= 0) {
            vel.vx = 0;
            vel.vy = 0;
            tr.x = rp.targetX;
            tr.y = rp.targetY;
            // 落地:命中与否决定硬直长短(伤害由预警圈结算,这里只管博弈)
            const pd = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
            const hitR = S.cleave.radiusM * REAPER_TUNING.hitPad * M + body.radius * M * 0.3;
            if (pd <= hitR) {
              rp.state = 'stagger';
              rp.t = S.cleave.hitStunS;
            } else {
              rp.state = 'stagger';
              rp.t = S.cleave.missStunS;
              world.emit(new ToastEvent(t('mb.reaper.stuck'), '#e8c07a'));
              world.emit(new SfxEvent('reaction'));
            }
          }
          break;
        }

        case 'stormCast': {
          vel.vx = 0;
          vel.vy = 0;
          rp.t -= dt;
          if (rp.t <= 0) {
            // 以自己为中心铺沙暴区(领域:这一片不许站)
            const count = S.storm.count + (enraged ? S.enrageStormAdd : 0);
            for (let i = 0; i < count; i++) {
              const ang = (i / count) * Math.PI * 2 + rp.animT; // 随时间转相位,两轮不重叠
              const ox = i === 0 ? 0 : Math.cos(ang) * S.storm.ringM * M;
              const oy = i === 0 ? 0 : Math.sin(ang) * S.storm.ringM * M;
              const z = world.create();
              world.add(z, new Transform(tr.x + ox, tr.y + oy));
              world.add(z, new Zone(
                S.storm.radiusM * M, S.storm.lifeS, S.storm.intervalS,
                stats.atk, S.storm.mult, null, 'enemy', REAPER_TUNING.sandColor,
              ));
            }
            world.emit(new SfxEvent('skill'));
            rp.state = 'recover';
            rp.t = 0.5;
          }
          break;
        }

        case 'recover': {
          vel.vx = 0;
          vel.vy = 0;
          rp.t -= dt;
          if (rp.t <= 0) {
            rp.state = 'stalk';
            this.resetUsedMove(rp, cdMul);
          }
          break;
        }

        case 'stagger': {
          vel.vx = 0;
          vel.vy = 0;
          rp.t -= dt;
          if (rp.t <= 0) {
            rp.state = 'stalk';
            this.resetUsedMove(rp, cdMul);
          }
          break;
        }
      }

      // 朝向:掷钩/跳劈用锁定方向,其余面向玩家
      if (rp.state !== 'hookWind' && rp.state !== 'hookOut' && rp.state !== 'cleaveWind' && rp.state !== 'cleaveLeap') {
        tr.face = Math.atan2(dy, dx);
      }
    }
  }

  /** 收招:只把刚用掉的那一招放回冷却 */
  private resetUsedMove(rp: MidBossReaper, cdMul: number): void {
    if (rp.lastMove === 'hook') rp.hookCd = S.hook.cdS * cdMul;
    else if (rp.lastMove === 'cleave') rp.cleaveCd = S.cleave.cdS * cdMul;
    else rp.stormCd = S.storm.cdS * cdMul;
  }

  /** 越靠近边界,越朝场内回中(三位中 Boss 同款) */
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
