import { World } from '@engine/ecs/World';
import type { System } from '@engine/ecs/World';
import { GameLoop } from '@engine/core/GameLoop';
import { Rng } from '@engine/core/Rng';
import { Input } from '@engine/input/Input';
import { Renderer } from '@engine/render/Renderer';
import balance from '@data/balance.json';
import { FOREST, M, UI } from '@game/constants';
import {
  Body, Dummy, Faction, Health, Player, Shroomling, Stats, Transform, Velocity,
} from '@game/components';
import { drawDummy, drawKnight, drawShadow, drawShroomling } from '@game/gfx/draw';
import { PlayerSystem } from '@game/systems/PlayerSystem';
import { EnemySystem } from '@game/systems/EnemySystem';
import { PhysicsSystem } from '@game/systems/PhysicsSystem';
import { CombatSystem } from '@game/systems/CombatSystem';
import { FeedbackSystem } from '@game/systems/FeedbackSystem';

/**
 * 训练场场景(Phase 1 里程碑):翠语林地风格竞技场 + 木桩 + 菇灵怪群。
 * 系统更新顺序即契约(docs/02-ARCHITECTURE.md §4)。
 */
export class GameScene {
  private world = new World();
  private systems: System[] = [];
  private feedback: FeedbackSystem;
  private playerE = 0;
  private spawnT = 0;
  private bg: HTMLCanvasElement;
  private fps = 60;

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    loop: GameLoop,
  ) {
    this.feedback = new FeedbackSystem(loop, renderer.camera);
    this.systems = [
      new PlayerSystem(input, renderer),
      new EnemySystem(),
      new PhysicsSystem(),
      new CombatSystem(),
      this.feedback,
    ];
    this.bg = this.bakeBackground();
    this.setup();
  }

  // ---------- 装配 ----------

  private setup(): void {
    const w = this.world;
    const B = balance.player;
    const cx = (balance.arena.widthM / 2) * M;
    const cy = (balance.arena.heightM / 2) * M;

    // 玩家「澜」
    this.playerE = w.create();
    w.add(this.playerE, new Transform(cx, cy));
    w.add(this.playerE, new Velocity());
    w.add(this.playerE, new Body(B.bodyRadius));
    w.add(this.playerE, new Health(B.hp));
    w.add(this.playerE, new Stats(B.atk, B.moveSpeed, B.critRate, B.critDmg));
    w.add(this.playerE, new Faction('player'));
    w.add(this.playerE, new Player());
    this.renderer.camera.snap(cx, cy);

    // 训练木桩(左侧训练角)
    for (let i = 0; i < balance.arena.dummyCount; i++) {
      const e = w.create();
      w.add(e, new Transform(5 * M, (4 + i * 4) * M));
      w.add(e, new Velocity());
      w.add(e, new Body(0.35, true));
      w.add(e, new Health(99999));
      w.add(e, new Faction('neutral'));
      w.add(e, new Dummy());
    }
  }

  private spawnShroom(rng: Rng): void {
    const w = this.world;
    const E = balance.enemies.shroomling;
    const ptr = w.mustGet(this.playerE, Transform);
    // 从场地边缘随机点出生,且离玩家 ≥ 7m
    let x = 0; let y = 0;
    for (let tries = 0; tries < 20; tries++) {
      x = rng.range(1.5, balance.arena.widthM - 1.5) * M;
      y = rng.range(1.5, balance.arena.heightM - 1.5) * M;
      if (Math.hypot(x - ptr.x, y - ptr.y) > 7 * M) break;
    }
    const e = w.create();
    w.add(e, new Transform(x, y));
    w.add(e, new Velocity());
    w.add(e, new Body(E.bodyRadius));
    w.add(e, new Health(E.hp));
    w.add(e, new Faction('enemy'));
    w.add(e, new Shroomling());
  }

  private spawnRng = new Rng(777);

  // ---------- 更新 ----------

  update(dt: number): void {
    for (const s of this.systems) s.update(this.world, dt);

    // 补怪
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.world.count(Shroomling) < balance.arena.shroomTarget) {
      this.spawnT = balance.arena.spawnInterval;
      this.spawnShroom(this.spawnRng);
    }

    // 木桩状态推进
    const now = performance.now();
    for (const e of this.world.query(Dummy)) {
      const d = this.world.mustGet(e, Dummy);
      d.wobble *= Math.exp(-4 * dt);
      d.wobblePhase += dt * 22;
      while (d.hits.length > 0 && now - d.hits[0][0] > 3000) d.hits.shift();
    }

    // 受击闪白衰减
    for (const e of this.world.query(Health)) {
      const h = this.world.mustGet(e, Health);
      if (h.flash > 0) h.flash -= dt;
    }

    // 相机跟随
    const ptr = this.world.mustGet(this.playerE, Transform);
    this.renderer.camera.follow(ptr.x, ptr.y, dt);
    this.renderer.camera.update(dt);

    this.world.clearEvents();
    this.world.flushDestroyed();
    this.input.endFrame();
  }

  // ---------- 渲染 ----------

  render(alpha: number, rawDt: number): void {
    if (rawDt > 0) this.fps = this.fps * 0.95 + (1 / rawDt) * 0.05;
    const r = this.renderer;
    r.clear('#131a12');

    r.inWorld((ctx) => {
      ctx.drawImage(this.bg, 0, 0);

      // 收集可绘制体并按 Y 排序(伪 3D 遮挡)
      interface D { y: number; draw: () => void }
      const list: D[] = [];
      const w = this.world;

      for (const e of w.query(Dummy, Transform)) {
        const tr = w.mustGet(e, Transform);
        const d = w.mustGet(e, Dummy);
        list.push({ y: tr.y, draw: () => { drawShadow(ctx, tr.x, tr.y, 16); drawDummy(ctx, tr.x, tr.y, d.wobble, d.wobblePhase); } });
      }
      for (const e of w.query(Shroomling, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const s = w.mustGet(e, Shroomling);
        const h = w.mustGet(e, Health);
        const ix = tr.prevX + (tr.x - tr.prevX) * alpha;
        const iy = tr.prevY + (tr.y - tr.prevY) * alpha;
        list.push({ y: iy, draw: () => { drawShadow(ctx, ix, iy, 11); drawShroomling(ctx, ix, iy, s.animT, h.flash, s.state === 'chase'); } });
      }
      {
        const e = this.playerE;
        const tr = w.mustGet(e, Transform);
        const p = w.mustGet(e, Player);
        const h = w.mustGet(e, Health);
        const ix = tr.prevX + (tr.x - tr.prevX) * alpha;
        const iy = tr.prevY + (tr.y - tr.prevY) * alpha;
        if (p.respawnT <= 0) {
          list.push({
            y: iy,
            draw: () => {
              drawShadow(ctx, ix, iy, 13);
              drawKnight(ctx, ix, iy, {
                t: p.animT,
                moving: p.moving,
                faceLeft: p.aimX < 0,
                attackStage: p.attackT > 0 ? p.comboStage : 0,
                attackProg: p.attackDur > 0 ? 1 - p.attackT / p.attackDur : 0,
                dashing: p.dashT > 0,
                flash: h.flash,
                invuln: p.iframes > 0 && p.dashT <= 0,
              });
            },
          });
        }
      }

      list.sort((a, b) => a.y - b.y);
      for (const d of list) d.draw();

      // 木桩 DPS 牌
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      for (const e of w.query(Dummy, Transform)) {
        const tr = w.mustGet(e, Transform);
        const d = w.mustGet(e, Dummy);
        const dps = Math.round(d.hits.reduce((s, hi) => s + hi[1], 0) / 3);
        if (dps > 0) {
          ctx.fillStyle = UI.gold;
          ctx.fillText(`DPS ${dps}`, tr.x, tr.y - 14 * 3 - 8);
        }
      }

      this.feedback.renderWorld(ctx);
    });

    this.renderHud();
    this.feedback.renderScreen(r.ctx, r.width, r.height);
  }

  private renderHud(): void {
    const { ctx, width, height } = this.renderer;
    const p = this.world.mustGet(this.playerE, Player);
    const hp = this.world.mustGet(this.playerE, Health);

    // 左上:名牌+血条
    ctx.fillStyle = UI.panel;
    ctx.fillRect(14, 14, 250, 58);
    ctx.fillStyle = UI.text;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('澜 · 狂澜剑士', 24, 34);
    const ratio = Math.max(hp.hp / hp.max, 0);
    ctx.fillStyle = '#232838';
    ctx.fillRect(24, 44, 220, 14);
    ctx.fillStyle = ratio > 0.3 ? UI.hp : UI.hpLow;
    ctx.fillRect(24, 44, 220 * ratio, 14);
    ctx.fillStyle = UI.text;
    ctx.font = '11px monospace';
    ctx.fillText(`${Math.ceil(hp.hp)} / ${hp.max}`, 28, 55);

    // 左下:翻滚冷却
    const cdRatio = p.dashCd > 0 ? 1 - p.dashCd / balance.player.dash.cooldown : 1;
    ctx.fillStyle = UI.panel;
    ctx.fillRect(14, height - 64, 130, 50);
    ctx.fillStyle = cdRatio >= 1 ? UI.gold : UI.dim;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('翻滚 [空格]', 24, height - 44);
    ctx.fillStyle = '#232838';
    ctx.fillRect(24, height - 34, 110, 8);
    ctx.fillStyle = cdRatio >= 1 ? UI.gold : UI.dim;
    ctx.fillRect(24, height - 34, 110 * cdRatio, 8);

    // 连击提示
    if (p.comboStage > 0 && p.comboTimer > 0) {
      ctx.fillStyle = p.comboStage === 3 ? UI.crit : UI.text;
      ctx.font = `bold ${14 + p.comboStage * 2}px monospace`;
      ctx.fillText(`${p.comboStage} 段`, 160, height - 36);
    }

    // 右上:击杀/死亡/FPS
    ctx.textAlign = 'right';
    ctx.fillStyle = UI.panel;
    ctx.fillRect(width - 190, 14, 176, 30);
    ctx.fillStyle = UI.text;
    ctx.font = '12px monospace';
    ctx.fillText(`击杀 ${this.feedback.kills}  阵亡 ${p.deaths}  FPS ${Math.round(this.fps)}`, width - 24, 34);

    // 底部操作提示
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,232,232,0.55)';
    ctx.font = '12px monospace';
    ctx.fillText('WASD 移动 · 鼠标左键 三段连斩 · 空格 翻滚(无敌帧) · 木桩可测 DPS', width / 2, height - 12);

    // 阵亡遮罩
    if (p.respawnT > 0) {
      ctx.fillStyle = 'rgba(13,15,26,0.55)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = UI.hpLow;
      ctx.font = 'bold 26px monospace';
      ctx.fillText('已阵亡 — 重整旗鼓…', width / 2, height / 2);
    }
  }

  /** 烘焙静态地面到离屏画布(每帧只 drawImage 一次) */
  private bakeBackground(): HTMLCanvasElement {
    const wPx = balance.arena.widthM * M;
    const hPx = balance.arena.heightM * M;
    const cv = document.createElement('canvas');
    cv.width = wPx;
    cv.height = hPx;
    const ctx = cv.getContext('2d')!;
    const rng = new Rng(20231124);

    // 草地棋盘
    for (let ty = 0; ty < balance.arena.heightM; ty++) {
      for (let tx = 0; tx < balance.arena.widthM; tx++) {
        ctx.fillStyle = (tx + ty) % 2 === 0 ? FOREST.grassA : FOREST.grassB;
        ctx.fillRect(tx * M, ty * M, M, M);
        if (rng.chance(0.18)) {
          ctx.fillStyle = FOREST.grassC;
          ctx.fillRect(tx * M + rng.int(4, 30), ty * M + rng.int(4, 30), 8, 5);
        }
      }
    }
    // 点缀:花与石
    for (let i = 0; i < 70; i++) {
      const x = rng.range(M, wPx - M);
      const y = rng.range(M, hPx - M);
      const kind = rng.next();
      if (kind < 0.4) {
        ctx.fillStyle = FOREST.flower1;
        ctx.fillRect(x, y, 5, 5);
        ctx.fillStyle = '#8a6b1f';
        ctx.fillRect(x + 1, y + 5, 2, 4);
      } else if (kind < 0.7) {
        ctx.fillStyle = FOREST.flower2;
        ctx.fillRect(x, y, 4, 4);
      } else {
        ctx.fillStyle = FOREST.pebble;
        ctx.fillRect(x, y, 7, 5);
      }
    }
    // 树篱边界
    ctx.fillStyle = FOREST.hedge;
    ctx.fillRect(0, 0, wPx, M * 0.6);
    ctx.fillRect(0, hPx - M * 0.6, wPx, M * 0.6);
    ctx.fillRect(0, 0, M * 0.6, hPx);
    ctx.fillRect(wPx - M * 0.6, 0, M * 0.6, hPx);
    ctx.fillStyle = FOREST.hedgeLight;
    for (let i = 0; i < wPx; i += 18) {
      ctx.fillRect(i, 4, 8, 8);
      ctx.fillRect(i + 5, hPx - M * 0.6 + 6, 8, 8);
    }
    for (let i = 0; i < hPx; i += 18) {
      ctx.fillRect(4, i, 8, 8);
      ctx.fillRect(wPx - M * 0.6 + 6, i, 8, 8);
    }
    return cv;
  }
}
