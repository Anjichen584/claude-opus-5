import type { System, World } from '@engine/ecs/World';
import type { GameLoop } from '@engine/core/GameLoop';
import type { Camera } from '@engine/render/Camera';
import { sfx } from '@engine/audio/Sfx';
import balance from '@data/balance.json';
import { UI } from '@game/constants';
import {
  BeamFxEvent, DashGhostEvent, HitEvent, KillEvent, PlayerHurtEvent, ReactionEvent,
  RingFxEvent, SfxEvent, SlashFxEvent, ToastEvent,
} from '@game/components';
import { drawSlashArc } from '@game/gfx/draw';

interface Floater { x: number; y: number; vy: number; t: number; life: number; text: string; color: string; scale: number }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; size: number }
interface Slash { x: number; y: number; angle: number; stage: number; t: number; dur: number; rangePx: number; arcRad: number }
interface Ghost { x: number; y: number; face: number; t: number; life: number }
interface Beam { x: number; y: number; color: string; t: number; life: number }
interface Ring { x: number; y: number; radius: number; color: string; t: number; life: number }

/**
 * 打击感中枢:消费战斗事件 → 顿帧/屏震/飘字/粒子/弧光/残影/红晕/音效。
 * 参数对齐 docs/01-GDD.md §3.1 与 balance.json feel 段。
 */
export class FeedbackSystem implements System {
  private floaters: Floater[] = [];
  private particles: Particle[] = [];
  private slashes: Slash[] = [];
  private ghosts: Ghost[] = [];
  private beams: Beam[] = [];
  private rings: Ring[] = [];
  hurtVignette = 0;
  kills = 0;

  constructor(
    private readonly loop: GameLoop,
    private readonly camera: Camera,
  ) {}

  update(world: World, dt: number): void {
    const feel = balance.feel;

    for (const hit of world.read(HitEvent)) {
      const ms = hit.kill ? feel.hitstopMs.kill : hit.crit ? feel.hitstopMs.crit : feel.hitstopMs.normal;
      this.loop.hitstop(ms);
      if (hit.kill) this.camera.shake(feel.shake.kill.amp, feel.shake.kill.dur);
      else if (hit.crit) this.camera.shake(feel.shake.crit.amp, feel.shake.crit.dur);
      sfx.play(hit.kill ? 'kill' : hit.crit ? 'crit' : 'hit');

      // 飘字:普通白 / 暴击金 / 元素附色(GDD §3.1)
      const elColor = hit.element ? ({ fire: '#ff9a6b', ice: '#8fdcff', bolt: '#ffe57a', toxin: '#b8e878' } as Record<string, string>)[hit.element] : null;
      this.floaters.push({
        x: hit.x + (Math.random() - 0.5) * 14,
        y: hit.y,
        vy: -60,
        t: 0,
        life: 0.7,
        text: String(hit.amount),
        color: hit.crit ? UI.crit : elColor ?? UI.dmg,
        scale: hit.crit ? 1.5 : 1,
      });
      const n = hit.crit ? 10 : 6;
      for (let i = 0; i < n; i++) {
        const a = hit.angle + (Math.random() - 0.5) * 1.6;
        const sp = 90 + Math.random() * 160;
        this.particles.push({
          x: hit.x, y: hit.y + 10,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
          t: 0, life: 0.25 + Math.random() * 0.2,
          color: elColor ?? (hit.crit ? '#ffd94f' : '#ffffff'),
          size: 2 + Math.random() * 2,
        });
      }
    }

    for (const kill of world.read(KillEvent)) {
      this.kills += 1;
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

    // 元素连锁反应:大字 + 爆光 + 屏震 + 音效
    for (const rx of world.read(ReactionEvent)) {
      this.camera.shake(3, 0.12);
      this.loop.hitstop(60);
      sfx.play('reaction');
      this.floaters.push({
        x: rx.x, y: rx.y, vy: -34, t: 0, life: 0.9,
        text: `${rx.name}!`, color: rx.color, scale: 1.7,
      });
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 200;
        this.particles.push({
          x: rx.x, y: rx.y + 16,
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          t: 0, life: 0.3 + Math.random() * 0.25,
          color: rx.color, size: 2 + Math.random() * 3,
        });
      }
    }

    for (const b of world.read(BeamFxEvent)) {
      this.beams.push({ x: b.x, y: b.y, color: b.color, t: 0, life: 0.28 });
      sfx.play('beam');
      this.camera.shake(1.5, 0.05);
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 50 + Math.random() * 120;
        this.particles.push({
          x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
          t: 0, life: 0.25 + Math.random() * 0.2, color: b.color, size: 2 + Math.random() * 2,
        });
      }
    }

    for (const r of world.read(RingFxEvent)) {
      this.rings.push({ x: r.x, y: r.y, radius: r.radiusPx, color: r.color, t: 0, life: 0.35 });
    }

    for (const s of world.read(SfxEvent)) sfx.play(s.kind);

    // 通用提示(拾取/治疗/保底):飘在玩家头顶上方
    for (const t of world.read(ToastEvent)) {
      this.floaters.push({
        x: this.camera.x, y: this.camera.y - 60, vy: -30, t: 0, life: 1.1,
        text: t.text, color: t.color, scale: 1.1,
      });
    }

    for (const hurt of world.read(PlayerHurtEvent)) {
      this.hurtVignette = feel.hurtVignetteSec;
      this.camera.shake(feel.shake.hurt.amp, feel.shake.hurt.dur);
      sfx.play('hurt');
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

    // ---- 推进与清理 ----
    if (this.hurtVignette > 0) this.hurtVignette -= dt;
    for (const f of this.floaters) { f.t += dt; f.y += f.vy * dt; }
    for (const p of this.particles) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
      p.vx *= 1 - 3 * dt;
    }
    for (const s of this.slashes) s.t += dt;
    for (const g of this.ghosts) g.t += dt;
    for (const b of this.beams) b.t += dt;
    for (const r of this.rings) r.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    this.particles = this.particles.filter((p) => p.t < p.life);
    this.slashes = this.slashes.filter((s) => s.t < s.dur);
    this.ghosts = this.ghosts.filter((g) => g.t < g.life);
    this.beams = this.beams.filter((b) => b.t < b.life);
    this.rings = this.rings.filter((r) => r.t < r.life);
  }

  /** 世界空间特效层(实体之上) */
  renderWorld(ctx: CanvasRenderingContext2D): void {
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
    // 光剑/落雷柱
    for (const b of this.beams) {
      const p = b.t / b.life;
      const a = 1 - p;
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      const h = 180 * (1 - p * 0.4);
      const w = 8 * (1 - p * 0.5);
      const grad = ctx.createLinearGradient(0, b.y - h, 0, b.y);
      grad.addColorStop(0, b.color + '00');
      grad.addColorStop(0.7, b.color);
      grad.addColorStop(1, '#ffffff');
      ctx.fillStyle = grad;
      ctx.fillRect(b.x - w / 2, b.y - h, w, h);
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, 16 * (1 - p * 0.3), 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 扩散环
    for (const r of this.rings) {
      const p = r.t / r.life;
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 4 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(r.x, r.y - 8, r.radius * (0.3 + 0.7 * p), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    for (const s of this.slashes) {
      drawSlashArc(ctx, s.x, s.y, s.angle, s.stage, s.t / s.dur, s.rangePx, s.arcRad);
    }
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
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
