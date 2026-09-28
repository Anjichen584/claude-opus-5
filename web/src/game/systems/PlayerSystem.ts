import type { System, World } from '@engine/ecs/World';
import type { Input } from '@engine/input/Input';
import type { Renderer } from '@engine/render/Renderer';
import balance from '@data/balance.json';
import { M, UI } from '@game/constants';
import {
  DashGhostEvent, Health, MeleeSweep, Player, PlayerHurtEvent, Projectile, SfxEvent,
  SlashFxEvent, Stats, ToastEvent, Transform, Velocity, Zone,
} from '@game/components';

const B = balance.player;

/**
 * 玩家控制:移动加减速 / 翻滚(无敌帧+残影) / 三段连击 / 脱战回血 / 死亡重生。
 * 手感参数全部来自 balance.json,对齐 docs/01-GDD.md §3。
 */
export class PlayerSystem implements System {
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
      } else if (!this.input.padActive) {
        const mw = this.renderer.mouseWorld(this.input.mouseX, this.input.mouseY);
        const dx = mw.x - tr.x;
        const dy = mw.y - tr.y;
        const len = Math.hypot(dx, dy) || 1;
        p.aimX = dx / len;
        p.aimY = dy / len;
      }
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
        if ((this.input.wasPressed('Space') || this.input.wasPressed('PadA')) && p.dashCd <= 0) {
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
        const slow = p.attackT > 0
          ? (p.klass === 'warden' ? balance.classes.warden.combo.moveSlow
            : p.klass === 'blade' ? B.combo.moveSlow
            : 0.85) // 远程职业射击仅轻微减速(移动射击手感)
          : 1;
        const targetVx = axis.x * stats.moveSpeed * M * slow;
        const targetVy = axis.y * stats.moveSpeed * M * slow;
        const tau = (axis.x !== 0 || axis.y !== 0) ? B.accelTime : B.decelTime;
        const k = 1 - Math.exp(-dt / tau);
        vel.vx += (targetVx - vel.vx) * k;
        vel.vy += (targetVy - vel.vy) * k;

        // ---- 普攻:近战连击(剑士/守卫) / 连射(猎手箭·秘术师法球) ----
        if ((this.input.mouseDown || this.input.isDown('KeyJ') || this.input.isDown('PadX') || this.input.isDown('PadRT')) && p.attackT <= 0) {
          if (p.klass === 'ranger' || p.klass === 'arcanist') {
            const bow = p.klass === 'ranger' ? balance.classes.ranger.bow : balance.classes.arcanist.bow;
            p.comboStage = (p.comboStage % bow.heavyEvery) + 1;
            const heavy = p.comboStage === bow.heavyEvery; // 每 N 发一发强化
            p.attackDur = bow.rateS;
            p.attackT = bow.rateS;
            p.comboTimer = 1.0;
            const len = Math.hypot(p.aimX, p.aimY) || 1;
            const nx = p.aimX / len;
            const ny = p.aimY / len;
            const shot = world.create();
            world.add(shot, new Transform(tr.x + nx * 14, tr.y + ny * 14 - 12));
            const av = new Velocity();
            av.vx = nx * bow.speedM * M;
            av.vy = ny * bow.speedM * M;
            world.add(shot, av);
            const arrow = p.klass === 'ranger';
            world.add(shot, new Projectile(
              'player', stats.atk, heavy ? bow.mult * bow.heavyMult : bow.mult, null,
              bow.radiusM * M * (heavy ? 1.6 : 1), bow.lifeS,
              arrow ? (heavy ? '#ffd94f' : '#dfe8f2') : (heavy ? '#e8c0ff' : '#b880e8'),
              arrow ? 'arrow' : 'orb',
            ));
          } else {
            const combo = p.klass === 'warden' ? balance.classes.warden.combo : B.combo;
            p.comboStage = p.comboTimer > 0 ? (p.comboStage % 3) + 1 : 1;
            const idx = p.comboStage - 1;
            p.attackDur = combo.attackTime[idx];
            p.attackT = p.attackDur;
            p.comboTimer = combo.window + p.attackDur;

            const arcRad = (combo.arcDeg * Math.PI) / 180;
            // 橙装「怒涛之刃」:第三段范围 +40%
            const tempest = p.comboStage === 3 && p.specials.includes('tempest') ? 1.4 : 1;
            const rangePx = combo.range * M * tempest;
            world.emit(new MeleeSweep(
              e, tr.x, tr.y, tr.face, rangePx, arcRad, combo.mults[idx], p.comboStage,
              null, p.comboStage === 3 ? combo.knockback3 : 0,
            ));
            world.emit(new SlashFxEvent(tr.x, tr.y, tr.face, p.comboStage, rangePx, arcRad));
          }
        }
      }

      // ---- 药剂([1] 键,恢复 40% 最大生命) ----
      if ((this.input.wasPressed('Digit1') || this.input.wasPressed('PadUp')) && p.potionCharges > 0 && hp.hp < hp.max && hp.hp > 0) {
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
