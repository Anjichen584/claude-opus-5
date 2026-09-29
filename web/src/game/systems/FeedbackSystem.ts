import type { System, World } from '@engine/ecs/World';
import type { GameLoop } from '@engine/core/GameLoop';
import type { Camera } from '@engine/render/Camera';
import { sfx } from '@engine/audio/Sfx';
import balance from '@data/balance.json';
import { drawFloatText } from '@game/gfx/floatText';
import { UI } from '@game/constants';
import { meta } from '@game/meta/Save';
import {
  BeamFxEvent, DashGhostEvent, HitEvent, KillEvent, PlayerHurtEvent, ReactionEvent,
  RingFxEvent, SfxEvent, SlashFxEvent, ToastEvent,
} from '@game/components';
import { drawElementIcon, drawSlashArc } from '@game/gfx/draw';
import { sprites } from '@engine/render/Sprites';

interface Floater { x: number; y: number; vy: number; t: number; life: number; text: string; color: string; scale: number }
interface Particle { x: number; y: number; vx: number; vy: number; t: number; life: number; color: string; size: number }
interface Slash { x: number; y: number; angle: number; stage: number; t: number; dur: number; rangePx: number; arcRad: number }
interface Ghost { x: number; y: number; face: number; t: number; life: number }
interface Beam { x: number; y: number; color: string; t: number; life: number; sprite: string | null }
interface Ring { x: number; y: number; radius: number; color: string; t: number; life: number; sprite: string | null }

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
  private bursts: Array<{ x: number; y: number; t: number; life: number; scale: number; rot: number }> = [];
  /** 连锁反应演出:两枚触发元素图标相向交汇 */
  private reactions: Array<{ x: number; y: number; elA: string; elB: string; color: string; t: number; life: number }> = [];
  hurtVignette = 0;
  kills = 0;
  /** 本局玩家受伤次数(无伤通关成就判定;enterCamp/startRun 时清零) */
  hitsTaken = 0;
  /** 本局单次最高伤害(排行榜用;只记玩家打出的伤害) */
  maxHit = 0;

  constructor(
    private readonly loop: GameLoop,
    private readonly camera: Camera,
  ) {}

  /** 屏震(受设置强度缩放;0 = 关闭,晕动症/低端机友好) */
  private shake(amp: number, dur: number): void {
    const k = meta.data.settings.screenShake;
    if (k > 0) this.camera.shake(amp * k, dur);
  }

  /** 顿帧(同上;0 = 关闭) */
  private stop(ms: number): void {
    const k = meta.data.settings.hitstop;
    if (k > 0) this.loop.hitstop(ms * k);
  }

  update(world: World, dt: number): void {
    const feel = balance.feel;

    for (const hit of world.read(HitEvent)) {
      // 单次最高伤害:玩家侧的 HitEvent 才计入(受击飘字走 PlayerHurtEvent,不会污染)
      if (hit.amount > this.maxHit) this.maxHit = hit.amount;
      const ms = hit.kill ? feel.hitstopMs.kill : hit.crit ? feel.hitstopMs.crit : feel.hitstopMs.normal;
      this.stop(ms);
      if (hit.kill) this.shake(feel.shake.kill.amp, feel.shake.kill.dur);
      else if (hit.crit) this.shake(feel.shake.crit.amp, feel.shake.crit.dur);
      sfx.play(hit.kill ? 'kill' : hit.crit ? 'crit' : 'hit');
      if (hit.crit || hit.kill) {
        this.bursts.push({
          x: hit.x, y: hit.y, t: 0, life: 0.22,
          scale: hit.kill ? 1.25 : 0.9, rot: Math.random() * Math.PI * 2,
        });
      }

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

    // 元素连锁反应:大字 + 爆光 + 屏震 + 音效 + 元素图标交汇
    for (const rx of world.read(ReactionEvent)) {
      this.shake(3, 0.12);
      this.stop(60);
      sfx.play('reaction');
      if (rx.elA && rx.elB) {
        this.reactions.push({
          x: rx.x, y: rx.y + 30, elA: rx.elA, elB: rx.elB, color: rx.color,
          t: 0, life: 0.55,
        });
      }
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
      this.beams.push({ x: b.x, y: b.y, color: b.color, t: 0, life: 0.28, sprite: b.sprite });
      sfx.play('beam');
      this.shake(1.5, 0.05);
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
      this.rings.push({ x: r.x, y: r.y, radius: r.radiusPx, color: r.color, t: 0, life: 0.35, sprite: r.sprite });
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
      this.hitsTaken += 1;
      this.hurtVignette = feel.hurtVignetteSec;
      this.shake(feel.shake.hurt.amp, feel.shake.hurt.dur);
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
    for (const bu of this.bursts) bu.t += dt;
    for (const r of this.reactions) r.t += dt;
    this.floaters = this.floaters.filter((f) => f.t < f.life);
    this.particles = this.particles.filter((p) => p.t < p.life);
    this.slashes = this.slashes.filter((s) => s.t < s.dur);
    this.ghosts = this.ghosts.filter((g) => g.t < g.life);
    this.beams = this.beams.filter((b) => b.t < b.life);
    this.rings = this.rings.filter((r) => r.t < r.life);
    this.bursts = this.bursts.filter((b) => b.t < b.life);
    this.reactions = this.reactions.filter((r) => r.t < r.life);
  }

  /** 元素图标未加载时的色块回退 */
  private elementDot(ctx: CanvasRenderingContext2D, el: string, x: number, y: number, alpha: number): void {
    const col = ({ fire: '#ff9a6b', ice: '#8fdcff', bolt: '#ffe57a', toxin: '#b8e878' } as Record<string, string>)[el] ?? '#ffffff';
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x - 4), Math.round(y - 4), 8, 8);
    ctx.strokeStyle = '#0d0f1a';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x - 4), Math.round(y - 4), 8, 8);
    ctx.restore();
  }

  /** 加法混合画特效贴图(黑底=透明发光)。返回 false 表示贴图未加载。 */
  private static fx(
    ctx: CanvasRenderingContext2D, name: string, x: number, y: number,
    opts: { rot?: number; scaleW?: number; scaleH?: number; alpha?: number; flipY?: boolean },
  ): boolean {
    const img = sprites.get(name);
    if (!img) return false;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = opts.alpha ?? 1;
    ctx.translate(x, y);
    if (opts.rot) ctx.rotate(opts.rot);
    ctx.scale(opts.scaleW ?? 1, (opts.scaleH ?? opts.scaleW ?? 1) * (opts.flipY ? -1 : 1));
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
    return true;
  }

  /** 世界空间特效层(实体之上) */
  renderWorld(ctx: CanvasRenderingContext2D): void {
    // 连锁反应演出:两枚元素图标相向撞击 + 反应色闪光(最上层,先画以保证不被特效盖住)
    for (const r of this.reactions) {
      const p = Math.min(1, r.t / r.life);
      const approach = Math.min(1, p / 0.55);
      const gap = 30 * (1 - approach);
      const alpha = p < 0.72 ? 1 : Math.max(0, 1 - (p - 0.72) / 0.28);
      const y = r.y - 18 - 7 * approach;
      const size = 18 + 5 * approach;
      if (!drawElementIcon(ctx, r.elA, r.x - gap, y, size, alpha)) {
        this.elementDot(ctx, r.elA, r.x - gap, y, alpha);
      }
      if (!drawElementIcon(ctx, r.elB, r.x + gap, y, size, alpha)) {
        this.elementDot(ctx, r.elB, r.x + gap, y, alpha);
      }
      if (p > 0.45) {
        const fp = (p - 0.45) / 0.55;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (1 - fp) * 0.75;
        ctx.fillStyle = r.color;
        ctx.beginPath();
        ctx.arc(r.x, y, 7 + 18 * fp, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    for (const g of this.ghosts) {
      const a = 1 - g.t / g.life;
      // 正式拖尾贴图优先(沿冲刺方向旋转);未加载回退程序化椭圆残影
      if (FeedbackSystem.fx(ctx, 'fx_dash_trail', g.x, g.y - 16, {
        alpha: a * 0.8, rot: g.face, scaleW: 0.85, scaleH: 0.85,
      })) {
        continue;
      }
      ctx.save();
      ctx.globalAlpha = a * 0.35;
      ctx.fillStyle = '#8fb7ff';
      ctx.beginPath();
      ctx.ellipse(g.x, g.y - 18, 12, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // 光剑/落雷柱(贴图优先:加法混合星剑光柱 + 程序化基座色环保留元素色)
    for (const b of this.beams) {
      const p = b.t / b.life;
      const a = 1 - p;
      // 专属贴图(星陨的星剑):直接按高度铺,顶部再随进度抬起一点
      if (b.sprite && FeedbackSystem.fx(ctx, b.sprite, b.x, b.y - 40 * (1 - p * 0.35), {
        alpha: a, scaleW: 0.85 + p * 0.15, scaleH: 0.8 + p * 0.2,
      })) {
        ctx.save();
        ctx.globalAlpha = a * 0.45;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, 18 * (1 - p * 0.3), 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      if (FeedbackSystem.fx(ctx, 'fx_beam', b.x, b.y - 62 * (1 - p * 0.3), {
        alpha: a, scaleW: 0.9 - p * 0.3, scaleH: 1 - p * 0.35,
      })) {
        ctx.save();
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, 16 * (1 - p * 0.3), 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
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
    // 扩散环(贴图优先)
    for (const r of this.rings) {
      const p = r.t / r.life;
      const grow = r.radius * (0.3 + 0.7 * p) * 2;
      // 专属贴图(冲击环/漩涡/裂纹/箭雨落点):按"目标直径 / 贴图宽"等比缩放到实际半径
      if (r.sprite) {
        const img = sprites.get(r.sprite);
        if (img && FeedbackSystem.fx(ctx, r.sprite, r.x, r.y - 6, {
          alpha: (1 - p) * 0.95,
          scaleW: grow / img.width,
          scaleH: grow / Math.max(img.width, 1),
          rot: r.sprite === 'fx_vortex' ? p * 1.2 : 0,
        })) {
          continue;
        }
      }
      if (FeedbackSystem.fx(ctx, 'fx_ring', r.x, r.y - 8, {
        alpha: (1 - p) * 0.9, scaleW: grow / 93, scaleH: (grow / 93) * 0.55, rot: p * 0.6,
      })) {
        ctx.save();
        ctx.globalAlpha = (1 - p) * 0.5;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(r.x, r.y - 8, r.radius * (0.3 + 0.7 * p), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        continue;
      }
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
      const p = s.t / s.dur;
      const big = s.stage >= 3;
      if (!FeedbackSystem.fx(ctx, 'fx_slash', s.x + Math.cos(s.angle) * s.rangePx * 0.55,
        s.y - 14 + Math.sin(s.angle) * s.rangePx * 0.55, {
          rot: s.angle, alpha: (1 - p) * 0.95,
          scaleW: (s.rangePx / 109) * (big ? 2.2 : 1.7) * (0.8 + p * 0.4),
          scaleH: (s.rangePx / 109) * (big ? 2.0 : 1.5),
          flipY: s.stage % 2 === 0,
        })) {
        drawSlashArc(ctx, s.x, s.y, s.angle, s.stage, p, s.rangePx, s.arcRad);
      }
    }
    // 暴击/击杀冲击爆闪
    for (const bu of this.bursts) {
      const p = bu.t / bu.life;
      FeedbackSystem.fx(ctx, 'fx_burst', bu.x, bu.y - 12, {
        rot: bu.rot, alpha: 1 - p, scaleW: bu.scale * (0.5 + p * 0.9),
      });
    }
    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const f of this.floaters) {
      // 伤害数字走像素字体:整数倍缩放 + 1px 描边,压在火焰/毒雾上也读得清
      drawFloatText(ctx, {
        text: f.text, x: f.x, y: f.y, color: f.color, scale: f.scale,
        alpha: 1 - (f.t / f.life) ** 2,
      });
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
