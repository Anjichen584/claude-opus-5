import type { System, World } from '@engine/ecs/World';
import type { GameLoop } from '@engine/core/GameLoop';
import type { Camera } from '@engine/render/Camera';
import balance from '@data/balance.json';
import { UI } from '@game/constants';
import {
  DashGhostEvent, HitEvent, KillEvent, PlayerHurtEvent, SlashFxEvent,
} from '@game/components';
import { drawSlashArc } from '@game/gfx/draw';

interface Floater { x: number; y: number; vy: number; t: number; life: number; text: string; color: string; scale: number }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; size: number }
interface Slash { x: number; y: number; angle: number; stage: number; t: number; dur: number; rangePx: number; arcRad: number }
interface Ghost { x: number; y: number; face: number; t: number; life: number }

/**
 * 打击感中枢:消费战斗事件,负责 顿帧/屏震/飘字/粒子/挥砍弧光/翻滚残影/受伤红晕。
 * 参数对齐 docs/01-GDD.md §3.1 与 balance.json feel 段。
 */
export class FeedbackSystem implements System {
  private floaters: Floater[] = [];
  private particles: Particle[] = [];
  private slashes: Slash[] = [];
  private ghosts: Ghost[] = [];
  hurtVignette = 0;
  kills = 0;

  constructor(
    private readonly loop: GameLoop,
    private readonly camera: Camera,
  ) {}

  update(world: World, dt: number): void {
    const feel = balance.feel;

    for (const hit of world.read(HitEvent)) {
      // 顿帧分级
      const ms = hit.kill ? feel.hitstopMs.kill : hit.crit ? feel.hitstopMs.crit : feel.hitstopMs.normal;
      this.loop.hitstop(ms);
      // 屏震(暴击/击杀)
      if (hit.kill) this.camera.shake(feel.shake.kill.amp, feel.shake.kill.dur);
      else if (hit.crit) this.camera.shake(feel.shake.crit.amp, feel.shake.crit.dur);
      // 飘字
      this.floaters.push({
        x: hit.x + (Math.random() - 0.5) * 14,
        y: hit.y,
        vy: -60,
        t: 0,
        life: 0.7,
        text: String(hit.amount),
        color: hit.crit ? UI.crit : UI.dmg,
        scale: hit.crit ? 1.5 : 1,
      });
      // 命中火花(沿命中方向喷溅)
      const n = hit.crit ? 10 : 6;
      for (let i = 0; i < n; i++) {
        const a = hit.angle + (Math.random() - 0.5) * 1.6;
        const sp = 90 + Math.random() * 160;
        this.particles.push({
          x: hit.x, y: hit.y + 10,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
          t: 0, life: 0.25 + Math.random() * 0.2,
          color: hit.crit ? '#ffd94f' : '#ffffff',
          size: 2 + Math.random() * 2,
        });
      }
    }

    for (const kill of world.read(KillEvent)) {
      this.kills += 1;
      // 溶解爆珠(菇灵色系)
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 140;
        this.particles.push({
          x: kill.x, y: kill.y - 10,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          t: 0, life: 0.35 + Math.random() * 0.3,
          color: Math.random() < 0.5 ? '#5fd068' : '#e8dcc0',
          size: 2 + Math.random() * 3,
        });
      }
    }

    for (const hurt of world.read(PlayerHurtEvent)) {
      this.hurtVignette = feel.hurtVignetteSec;
      this.camera.shake(feel.shake.hurt.amp, feel.shake.hurt.dur);
      this.floaters.push({
        x: this.camera.x, y: this.camera.y - 40, vy: -40, t: 0, life: 0.8,
        text: `-${hurt.amount}`, color: UI.hpLow, scale: 1.2,
      });
    }

    for (const fx of world.read(SlashFxEvent)) {
      this.slashes.push({
        x: fx.x, y: fx.y, angle: fx.angle, stage: fx.stage,
        t: 0, dur: 0.22, rangePx: fx.rangePx, arcRad: fx.arcRad,
      });
    }

    for (const g of world.read(DashGhostEvent)) {
      this.ghosts.push({ x: g.x, y: g.y, face: g.face, t: 0, life: 0.25 });
    }

    // 推进与清理
    if (this.hurtVignette > 0) this.hurtVignette -= dt;
    const step = (arr: Array<{ t: number; life?: number }>): void => {
      for (const it of arr) it.t += dt;
    };
    step(this.floaters); step(this.particles); step(this.ghosts);
    for (const s of this.slashes) s.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    this.particles = this.particles.filter((p) => p.t < p.life);
    this.slashes = this.slashes.filter((s) => s.t < s.dur);
    this.ghosts = this.ghosts.filter((g) => g.t < g.life);

    // 粒子物理
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt; // 重力
      p.vx *= 1 - 3 * dt;
    }
    for (const f of this.floaters) f.y += f.vy * dt;
  }

  /** 世界空间特效层(实体之上) */
  renderWorld(ctx: CanvasRenderingContext2D): void {
    // 残影(蓝白剪影)
    for (const g of this.ghosts) {
      const a = (1 - g.t / g.life) * 0.35;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = '#8fb7ff';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y - 18, 12, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 挥砍弧光
    for (const s of this.slashes) {
      drawSlashArc(ctx, s.x, s.y, s.angle, s.stage, s.t / s.dur, s.rangePx, s.arcRad);
    }
    // 粒子
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    // 伤害飘字
    for (const f of this.floaters) {
      const a = 1 - (f.t / f.life) ** 2;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `bold ${Math.round(13 * f.scale)}px monospace`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#0d0f1a';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    }
  }

  /** 屏幕空间(受伤红晕) */
  renderScreen(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (this.hurtVignette > 0) {
      const a = (this.hurtVignette / balance.feel.hurtVignetteSec) * 0.35;
      const grad = ctx.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, h * 0.75);
      grad.addColorStop(0, 'rgba(224,95,95,0)');
      grad.addColorStop(1, `rgba(224,95,95,${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  }
}
