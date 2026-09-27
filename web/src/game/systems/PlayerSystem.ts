import type { System, World } from '@engine/ecs/World';
import type { Input } from '@engine/input/Input';
import type { Renderer } from '@engine/render/Renderer';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import {
  DashGhostEvent, Health, MeleeSweep, Player, PlayerHurtEvent, SlashFxEvent, Stats, Transform, Velocity,
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

      // ---- 瞄准(鼠标世界坐标) ----
      const mw = this.renderer.mouseWorld(this.input.mouseX, this.input.mouseY);
      const dx = mw.x - tr.x;
      const dy = mw.y - tr.y;
      const len = Math.hypot(dx, dy) || 1;
      p.aimX = dx / len;
      p.aimY = dy / len;
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
        const speed = (B.dash.distance / B.dash.duration) * M;
        vel.vx = p.dashDirX * speed;
        vel.vy = p.dashDirY * speed;
        // 残影
        p.ghostAccum += dt;
        if (p.ghostAccum >= 0.03) {
          p.ghostAccum = 0;
          world.emit(new DashGhostEvent(tr.x, tr.y, tr.face));
        }
      } else {
        if (this.input.wasPressed('Space') && p.dashCd <= 0) {
          // 翻滚方向:优先移动输入,否则朝向
          const hasMove = axis.x !== 0 || axis.y !== 0;
          p.dashDirX = hasMove ? axis.x : p.aimX;
          p.dashDirY = hasMove ? axis.y : p.aimY;
          p.dashT = B.dash.duration;
          p.dashDur = B.dash.duration;
          p.dashCd = B.dash.cooldown;
          p.iframes = Math.max(p.iframes, B.dash.iframes);
          p.attackT = 0; // 翻滚取消攻击后摇
          p.comboStage = 0;
          p.comboTimer = 0;
        }

        // ---- 普通移动(指数趋近实现加减速) ----
        const slow = p.attackT > 0 ? B.combo.moveSlow : 1;
        const targetVx = axis.x * stats.moveSpeed * M * slow;
        const targetVy = axis.y * stats.moveSpeed * M * slow;
        const tau = (axis.x !== 0 || axis.y !== 0) ? B.accelTime : B.decelTime;
        const k = 1 - Math.exp(-dt / tau);
        vel.vx += (targetVx - vel.vx) * k;
        vel.vy += (targetVy - vel.vy) * k;

        // ---- 三段连击 ----
        if ((this.input.mouseDown || this.input.isDown('KeyJ')) && p.attackT <= 0) {
          p.comboStage = p.comboTimer > 0 ? (p.comboStage % 3) + 1 : 1;
          const idx = p.comboStage - 1;
          p.attackDur = B.combo.attackTime[idx];
          p.attackT = p.attackDur;
          p.comboTimer = B.combo.window + p.attackDur;

          const arcRad = (B.combo.arcDeg * Math.PI) / 180;
          const rangePx = B.combo.range * M;
          world.emit(new MeleeSweep(
            e, tr.x, tr.y, tr.face, rangePx, arcRad, B.combo.mults[idx], p.comboStage,
          ));
          world.emit(new SlashFxEvent(tr.x, tr.y, tr.face, p.comboStage, rangePx, arcRad));
        }
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
