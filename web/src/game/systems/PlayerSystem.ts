import type { System, World } from '@engine/ecs/World';
import { AimAssist } from '@game/input/AimAssist';
import type { Input } from '@engine/input/Input';
import type { Renderer } from '@engine/render/Renderer';
import balance from '@data/balance.json';
import { M, UI } from '@game/constants';
import {
  DashGhostEvent, Faction, Health, MeleeSweep, Player, PlayerHurtEvent, Projectile,
  SfxEvent, SlashFxEvent, Stats, ToastEvent, Transform, Velocity, Zone,
} from '@game/components';

import { basicSpec, comboStep, lungeImpulse, moveSlowOf, shotStep } from '@game/combat/BasicAttack';
import { bindOf } from '@game/meta/Bindings';

const B = balance.player;

/**
 * 玩家控制:移动加减速 / 翻滚(无敌帧+残影) / 三段连击 / 脱战回血 / 死亡重生。
 * 手感参数全部来自 balance.json,对齐 docs/01-GDD.md §3。
 */
export class PlayerSystem implements System {
  /**
   * 触屏瞄准助手(粘性锁定 + 续瞄)。
   * HUD/自动攻击也读它(`aimAssist.target`)—— 玩家看到的锁定圈与真正打的目标必须是同一个。
   */
  readonly aimAssist = new AimAssist();
  /** 瞄准候选的复用数组(触屏自动瞄准每帧填一次) */
  private readonly aimScratch: Array<{ id: number; x: number; y: number }> = [];

  constructor(
    private readonly input: Input,
    private readonly renderer: Renderer,
  ) {}

  update(world: World, dt: number): void {
    for (const e of world.query(Player, Transform, Velocity, Stats, Health)) {
      const p = world.mustGet(e, Player);
      const tr = world.mustGet(e, Transform);
      const vel = world.mustGet(e, Velocity);
      const stats = world.mustGet(e, Stats);
      const hp = world.mustGet(e, Health);

      p.animT += dt;

      // ---- 死亡与重生 ----
      if (p.respawnT > 0) {
        p.respawnT -= dt;
        vel.vx = 0;
        vel.vy = 0;
        if (p.respawnT <= 0) {
          hp.hp = hp.max;
          tr.x = (balance.arena.widthM / 2) * M;
          tr.y = (balance.arena.heightM / 2) * M;
          p.iframes = B.respawn.invuln;
        }
        continue;
      }

      // ---- 瞄准(手柄右摇杆优先,否则鼠标世界坐标) ----
      if (Math.hypot(this.input.padRX, this.input.padRY) > 0.3) {
        const rlen = Math.hypot(this.input.padRX, this.input.padRY);
        p.aimX = this.input.padRX / rlen;
        p.aimY = this.input.padRY / rlen;
      } else if (this.input.padActive && (this.input.padLX !== 0 || this.input.padLY !== 0)) {
        // 手柄模式无右摇杆输入:朝移动方向
        const mlen = Math.hypot(this.input.padLX, this.input.padLY);
        p.aimX = this.input.padLX / mlen;
        p.aimY = this.input.padLY / mlen;
      } else if (this.input.touchActive) {
        // 触屏:自动瞄准(范围 + 粘性 + 续瞄,规则见 game/input/AimAssist.ts),否则朝移动方向
        // 复用数组 + 复用条目(每帧都跑,别给手机送 GC 抖动):只在敌人数变多时才真的分配
        const targets = this.aimScratch;
        let n = 0;
        for (const t of world.query(Faction, Transform, Health)) {
          if (world.mustGet(t, Faction).team !== 'enemy') continue;
          const ttr = world.mustGet(t, Transform);
          const slot = targets[n] ?? (targets[n] = { id: 0, x: 0, y: 0 });
          slot.id = t;
          slot.x = ttr.x;
          slot.y = ttr.y;
          n++;
        }
        targets.length = n;
        const aim = this.aimAssist.update(tr.x, tr.y, targets, dt, undefined, undefined, undefined, M);
        if (aim) {
          p.aimX = aim.x;
          p.aimY = aim.y;
        } else {
          const ax2 = this.input.axis();
          if (ax2.x !== 0 || ax2.y !== 0) {
            const m2 = Math.hypot(ax2.x, ax2.y);
            p.aimX = ax2.x / m2;
            p.aimY = ax2.y / m2;
          }
        }
      } else if (!this.input.padActive) {
        const mw = this.renderer.mouseWorld(this.input.mouseX, this.input.mouseY);
        const dx = mw.x - tr.x;
        const dy = mw.y - tr.y;
        const len = Math.hypot(dx, dy) || 1;
        p.aimX = dx / len;
        p.aimY = dy / len;
      }
      // 非触屏不用辅助瞄准:清掉记忆(否则下次触屏会锁上一个很旧的实体 id)
      if (!this.input.touchActive) this.aimAssist.reset();
      tr.face = Math.atan2(p.aimY, p.aimX);

      // ---- 计时器 ----
      if (p.iframes > 0) p.iframes -= dt;
      if (p.dashCd > 0) p.dashCd -= dt;
      if (p.comboTimer > 0) {
        p.comboTimer -= dt;
        if (p.comboTimer <= 0) p.comboStage = 0;
      }
      if (p.attackT > 0) p.attackT -= dt;

      // ---- 翻滚 ----
      const axis = this.input.axis();
      if (p.dashT > 0) {
        p.dashT -= dt;
        vel.vx = p.dashDirX * p.dashSpeedPx;
        vel.vy = p.dashDirY * p.dashSpeedPx;
        // 残影
        p.ghostAccum += dt;
        if (p.ghostAccum >= 0.03) {
          p.ghostAccum = 0;
          world.emit(new DashGhostEvent(tr.x, tr.y, tr.face));
        }
        // 橙装「焰行者之靴」:翻滚沿途留火焰轨迹
        if (p.specials.includes('emberstride')) {
          p.fireTrailAccum += dt;
          if (p.fireTrailAccum >= 0.06) {
            p.fireTrailAccum = 0;
            const stats2 = world.mustGet(e, Stats);
            const z = world.create();
            world.add(z, new Transform(tr.x, tr.y));
            world.add(z, new Zone(0.6 * M, 1.5, 0.5, stats2.atk, 0.6, 'fire', 'player', '#ff7a45'));
          }
        }
      } else {
        if ((this.input.wasPressed(bindOf('dash')) || this.input.wasPressed('PadA')) && p.dashCd <= 0) {
          // 翻滚方向:优先移动输入,否则朝向
          const hasMove = axis.x !== 0 || axis.y !== 0;
          p.dashDirX = hasMove ? axis.x : p.aimX;
          p.dashDirY = hasMove ? axis.y : p.aimY;
          p.dashT = B.dash.duration;
          p.dashDur = B.dash.duration;
          p.dashSpeedPx = (B.dash.distance / B.dash.duration) * M;
          p.dashCd = B.dash.cooldown;
          p.iframes = Math.max(p.iframes, B.dash.iframes);
          p.attackT = 0; // 翻滚取消攻击后摇
          p.comboStage = 0;
          p.comboTimer = 0;
        }

        // ---- 普通移动(指数趋近实现加减速) ----
        // 出招期间的移动倍率:近战职业有明显减速,远程由各职业的 moveSlowPct 决定
        // (猎手可走射 = 1,秘术师施法减速到 55%)—— 全部来自 balance,不在这里写职业分支
        const basic = basicSpec(p.klass, balance);
        const slow = p.attackT > 0 ? moveSlowOf(basic) : 1;
        const targetVx = axis.x * stats.moveSpeed * M * slow;
        const targetVy = axis.y * stats.moveSpeed * M * slow;
        const tau = (axis.x !== 0 || axis.y !== 0) ? B.accelTime : B.decelTime;
        const k = 1 - Math.exp(-dt / tau);
        vel.vx += (targetVx - vel.vx) * k;
        vel.vy += (targetVy - vel.vy) * k;

        // ---- 普攻:形态由职业档案决定(近战组合技 / 远程射击,见 combat/BasicAttack.ts) ----
        if ((this.input.mouseDown || this.input.isDown(bindOf('attack')) || this.input.isDown('PadX') || this.input.isDown('PadRT')) && p.attackT <= 0) {
          if (basic.kind === 'shot') {
            const step = shotStep(basic, p.comboStage);
            p.comboStage = step.stage;
            p.attackDur = step.timeS;
            p.attackT = step.timeS;
            p.comboTimer = 1.0;
            const len = Math.hypot(p.aimX, p.aimY) || 1;
            const nx = p.aimX / len;
            const ny = p.aimY / len;
            const shot = world.create();
            world.add(shot, new Transform(tr.x + nx * 14, tr.y + ny * 14 - 12));
            const av = new Velocity();
            av.vx = nx * basic.speedM * M;
            av.vy = ny * basic.speedM * M;
            world.add(shot, av);
            const arrow = basic.shape === 'arrow';
            const proj = new Projectile(
              'player', stats.atk, step.mult, null, step.radiusPx, basic.lifeS,
              arrow ? (step.heavy ? '#ffd94f' : '#dfe8f2') : (step.heavy ? '#e8c0ff' : '#b880e8'),
              basic.shape,
            );
            proj.pierce = step.pierce;   // 猎手强化箭穿透
            proj.splashM = step.splashM; // 秘术师法球溅射
            world.add(shot, proj);
          } else {
            const step = comboStep(basic, p.comboStage, p.comboTimer);
            p.comboStage = step.stage;
            p.attackDur = step.timeS;
            p.attackT = step.timeS;
            p.comboTimer = basic.windowS + step.timeS;

            // 橙装「怒涛之刃」:第三段范围 +40%
            const tempest = step.stage === basic.mults.length && p.specials.includes('tempest') ? 1.4 : 1;
            const rangePx = step.rangePx * tempest;
            world.emit(new MeleeSweep(
              e, tr.x, tr.y, tr.face, rangePx, step.arcRad, step.mult, step.stage,
              null, step.knockbackM, step.vulnS,
            ));
            // 终结段前冲:位移是生存手段,不是特效
            const imp = lungeImpulse(step);
            if (imp > 0) {
              vel.vx += tr.face * imp;
              world.emit(new DashGhostEvent(tr.x, tr.y, tr.face));
            }
            world.emit(new SlashFxEvent(tr.x, tr.y, tr.face, step.stage, rangePx, step.arcRad));
          }
        }
      }

      // ---- 药剂([1] 键,恢复 40% 最大生命) ----
      if ((this.input.wasPressed(bindOf('potion')) || this.input.wasPressed('PadUp')) && p.potionCharges > 0 && hp.hp < hp.max && hp.hp > 0) {
        p.potionCharges--;
        const heal = Math.round(hp.max * balance.loot.potionHealPct);
        hp.hp = Math.min(hp.max, hp.hp + heal);
        world.emit(new ToastEvent(`+${heal}`, UI.hp));
        world.emit(new SfxEvent('skill'));
      }

      p.moving = Math.hypot(vel.vx, vel.vy) > 20;

      // ---- 脱战回血 ----
      if (p.regenDelay > 0) {
        p.regenDelay -= dt;
      } else if (hp.hp < hp.max && hp.hp > 0) {
        hp.hp = Math.min(hp.max, hp.hp + hp.max * B.regen.ratePct * dt);
      }
    }
  }

  /** 供 EnemySystem 调用后的伤害入口(简化版,Phase 2 并入统一伤害管线) */
  static applyHurt(world: World, playerE: number, amount: number): void {
    const p = world.mustGet(playerE, Player);
    const hp = world.mustGet(playerE, Health);
    if (p.iframes > 0 || p.respawnT > 0 || p.dashT > 0) return;
    hp.hp -= amount;
    hp.flash = balance.feel.flashSec;
    p.regenDelay = B.regen.delay;
    const died = hp.hp <= 0;
    if (died) {
      hp.hp = 0;
      p.deaths += 1;
      p.respawnT = B.respawn.delay;
    }
    world.emit(new PlayerHurtEvent(amount, died));
  }
}
