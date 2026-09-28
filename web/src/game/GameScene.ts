import { World } from '@engine/ecs/World';
import type { System } from '@engine/ecs/World';
import { GameLoop } from '@engine/core/GameLoop';
import { sfx } from '@engine/audio/Sfx';
import { Rng } from '@engine/core/Rng';
import { Input } from '@engine/input/Input';
import { Renderer } from '@engine/render/Renderer';
import balance from '@data/balance.json';
import { FOREST, M, RARITY_COLORS, UI } from '@game/constants';
import {
  BlightWolf, Body, BossNanmir, Buffs, Element, ElementMarks, EmberImp, Equipment, Faction,
  EventTotem, FrostSlime, Health, Inventory, OakGolem, Pickup, Player, Portal, Projectile, PropObstacle,
  ShopStand, Shroomling, SparkLizard, StardustSprite, Stats, TelegraphStrike, ThornVine,
  ToastEvent, ToxinToad, Transform, Velocity, WindBee, Zone,
} from '@game/components';
import { elementColor } from '@game/combat/Elements';
import {
  drawBlightWolf, drawBossNanmir, drawKnight, drawOakGolem, drawPickup, drawPortal,
  drawShadow, drawShroomling, drawThornVine, drawWindBee,
} from '@game/gfx/draw';
import { PlayerSystem } from '@game/systems/PlayerSystem';
import { SkillSystem, RUNE_POOL } from '@game/skills/SkillSystem';
import { ShopSystem } from '@game/systems/ShopSystem';
import { EventSystem } from '@game/systems/EventSystem';
import { EnemySystem } from '@game/systems/EnemySystem';
import { EliteSystem } from '@game/systems/EliteSystem';
import { CritterSystem } from '@game/systems/CritterSystem';
import { ProjectileSystem } from '@game/systems/ProjectileSystem';
import { BossSystem } from '@game/systems/BossSystem';
import { PhysicsSystem } from '@game/systems/PhysicsSystem';
import { CombatSystem } from '@game/systems/CombatSystem';
import { ZoneSystem } from '@game/systems/ZoneSystem';
import { TelegraphSystem } from '@game/systems/TelegraphSystem';
import { LootSystem } from '@game/loot/LootSystem';
import { FeedbackSystem } from '@game/systems/FeedbackSystem';
import { InventoryUI } from '@game/ui/InventoryUI';
import { MenuUI, RunStats } from '@game/ui/MenuUI';
import { recompute } from '@game/loot/Equip';
import { RunManager } from '@game/dungeon/RunManager';
import { clock } from '@game/dungeon/Clock';
import { meta } from '@game/meta/Save';
import { sprites } from '@engine/render/Sprites';
import { drawSprite, SPRITE_NAMES } from '@game/gfx/spriteDraw';

const PORTAL_STYLE: Record<string, { color: string; label: string }> = {
  battle: { color: '#dfe8f2', label: '战斗' },
  treasure: { color: '#F2A33C', label: '宝藏' },
  elite: { color: '#B067E8', label: '精英' },
  boss: { color: '#e05f5f', label: '首领' },
  shop: { color: '#8fd4c8', label: '商店' },
  event: { color: '#e8c07a', label: '秘境' },
};

/** 职业 → 精灵图名 */
const KLASS_SPRITE: Record<string, string> = {
  blade: 'knight', ranger: 'ranger', arcanist: 'arcanist', warden: 'warden',
};

const TOTEM_INFO: Record<string, { icon: string; name: string; desc: string; color: string }> = {
  blood: { icon: '🩸', name: '血之契约', desc: '生命上限-25% → 紫装', color: '#e05f5f' },
  blessing: { icon: '✨', name: '星辰祝福', desc: '攻击+10% 移速+10%', color: '#ffd94f' },
  fountain: { icon: '⛲', name: '星尘涌泉', desc: '+80~150 星尘', color: '#8fd4c8' },
};

type GameState = 'menu' | 'run' | 'results';

/**
 * 主场景状态机:menu → run(8房+Boss)→ results → menu。
 * 系统更新顺序即契约(docs/02-ARCHITECTURE.md §4)。
 */
export class GameScene {
  private state: GameState = 'menu';
  private paused = false;
  private muted = false;
  private world = new World();
  private systems: System[] = [];
  private feedback!: FeedbackSystem;
  private skills!: SkillSystem;
  private loot!: LootSystem;
  private shop!: ShopSystem;
  private events!: EventSystem;
  private run!: RunManager;
  private inventoryUI: InventoryUI;
  private menuUI: MenuUI;
  private playerE = 0;
  private bg: HTMLCanvasElement;
  private fps = 60;
  private menuT = 0;
  private wasNight = false;
  private lastStats: RunStats = { victory: false, rooms: 0, kills: 0, timeS: 0, stardustGained: 0 };
  private bgHasTile = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly loop: GameLoop,
  ) {
    for (const n of SPRITE_NAMES) sprites.load(n, `${import.meta.env.BASE_URL}sprites/${n}.png`);
    this.inventoryUI = new InventoryUI(input);
    this.menuUI = new MenuUI(input);
    this.bg = this.bakeBackground();
    this.renderer.camera.snap((balance.arena.widthM / 2) * M, (balance.arena.heightM / 2) * M);
  }

  // ---------- run 生命周期 ----------

  private startRun(): void {
    this.paused = false;
    const klass = this.menuUI.selectedClass;
    this.world = new World();
    this.feedback = new FeedbackSystem(this.loop, this.renderer.camera);
    this.skills = new SkillSystem(this.input, klass, this.renderer);
    this.loot = new LootSystem();
    this.loot.luck = meta.data.altar.luck * balance.altar.luckPerLvl;
    this.loot.factory.pityCount = meta.data.pity;
    this.shop = new ShopSystem(this.input);
    this.events = new EventSystem(this.input, this.loot.factory);
    this.run = new RunManager(this.loot.factory);
    this.systems = [
      new PlayerSystem(this.input, this.renderer),
      this.skills,
      new EnemySystem(),
      new EliteSystem(),
      new CritterSystem(),
      new BossSystem(),
      new PhysicsSystem(),
      new ProjectileSystem(),
      new CombatSystem(),
      new ZoneSystem(),
      new TelegraphSystem(),
      this.shop,
      this.events,
      this.loot,
      this.feedback,
    ];

    const w = this.world;
    const B = balance.player;
    this.playerE = w.create();
    w.add(this.playerE, new Transform(2.5 * M, (balance.arena.heightM / 2) * M));
    w.add(this.playerE, new Velocity());
    w.add(this.playerE, new Body(B.bodyRadius));
    w.add(this.playerE, new Health(B.hp));
    w.add(this.playerE, new Stats(B.atk, B.moveSpeed, B.critRate, B.critDmg, B.def));
    w.add(this.playerE, new Faction('player'));
    const playerComp = new Player();
    playerComp.klass = klass;
    w.add(this.playerE, playerComp);
    w.add(this.playerE, new Inventory());
    const equip = new Equipment();
    // 星辉铸台:预订的开局橙装
    if (meta.data.craftQueued) {
      meta.data.craftQueued = false;
      meta.save();
      const slots = ['weapon', 'helmet', 'chest', 'boots', 'ring', 'amulet'] as const;
      const gift = this.loot.factory.make(slots[Math.floor(Math.random() * slots.length)], 'legendary');
      equip.slots[gift.slot] = gift;
      w.emit(new ToastEvent(`📜 铸台出品:${gift.name}!`, RARITY_COLORS.legendary));
    }
    w.add(this.playerE, equip);
    recompute(w, this.playerE);

    // 开局赠 1 枚本职业随机符文(已镶嵌)——每局元素流派不同
    const prefix = klass === 'ranger' ? 'ranger_' : 'blade_';
    const runeIds = [...RUNE_POOL.values()].filter((r) => r.skill.startsWith(prefix)).map((r) => r.id);
    const gift = RUNE_POOL.get(runeIds[Math.floor(Math.random() * runeIds.length)])!;
    playerComp.runeBag.push(gift.id);
    playerComp.equippedRunes[gift.skill] = gift.id;

    clock.reset();
    this.wasNight = false;
    meta.data.stats.runs++;
    meta.save();
    this.run.startRoom(w, 'battle', this.playerE);
    const ptr = w.mustGet(this.playerE, Transform);
    this.renderer.camera.snap(ptr.x, ptr.y);
    this.state = 'run';
  }

  private endRun(victory: boolean): void {
    const p = this.world.mustGet(this.playerE, Player);
    this.lastStats = {
      victory,
      rooms: this.run.depth + 1,
      kills: this.feedback.kills,
      timeS: clock.runTime,
      stardustGained: p.stardust,
    };
    meta.data.stardust += p.stardust;
    meta.data.pity = this.loot.factory.pityCount;
    meta.data.stats.totalKills += this.feedback.kills;
    if (victory) {
      meta.data.stats.clears++;
      if (meta.data.stats.bestTimeS === 0 || clock.runTime < meta.data.stats.bestTimeS) {
        meta.data.stats.bestTimeS = clock.runTime;
      }
    }
    meta.save();
    this.state = 'results';
  }

  // ---------- 更新 ----------

  update(dt: number): void {
    this.menuT += dt;

    if (this.state === 'menu') {
      if (this.menuUI.updateMenu() === 'start') this.startRun();
      this.input.endFrame();
      return;
    }
    if (this.state === 'results') {
      if (this.menuUI.updateResults() === 'menu') this.state = 'menu';
      this.input.endFrame();
      return;
    }

    // ---- run ----
    const uiConsumed = this.inventoryUI.handleInput(this.world, this.playerE);
    if (uiConsumed) {
      this.input.endFrame();
      return;
    }

    // ---- 暂停菜单(Esc;背包打开时 Esc 优先关背包) ----
    if (this.input.wasPressed('Escape')) this.paused = !this.paused;
    if (this.paused) {
      if (this.input.wasPressed('KeyM')) {
        this.muted = !this.muted;
        sfx.volume = this.muted ? 0 : 0.35;
      }
      if (this.input.wasPressed('Backspace')) {
        this.paused = false;
        this.endRun(false);
      }
      this.input.endFrame();
      return;
    }

    clock.tick(dt);
    const night = clock.isNight();
    if (night !== this.wasNight) {
      this.wasNight = night;
      this.world.emit(new ToastEvent(night ? '🌙 夜幕降临…怪物变强,掉落翻倍!([L] 星灯买断)' : '☀ 天亮了', night ? '#8fb7ff' : '#f2d98c'));
    }
    // 星灯:花星尘立即天亮(vs 冒险赚双倍掉落——风险决策)
    if (night && this.input.wasPressed('KeyL')) {
      const p0 = this.world.mustGet(this.playerE, Player);
      const cost = balance.night.lanternCost;
      if (p0.stardust >= cost) {
        p0.stardust -= cost;
        clock.skipNight();
        this.wasNight = false;
        this.world.emit(new ToastEvent(`🏮 星灯点亮,黎明降临(✦-${cost})`, '#f2d98c'));
      } else {
        this.world.emit(new ToastEvent(`星尘不足,星灯需 ✦${cost}`, UI.hpLow));
      }
    }

    for (const s of this.systems) s.update(this.world, dt);

    const outcome = this.run.update(this.world, dt, this.playerE);
    if (outcome === 'victory') {
      this.endRun(true);
      return;
    }
    const p = this.world.mustGet(this.playerE, Player);
    if (p.respawnT > 0) {
      this.endRun(false);
      return;
    }

    // 受击闪白 / 印记过期 / Buff 衰减
    for (const e of this.world.query(Health)) {
      const h = this.world.mustGet(e, Health);
      if (h.flash > 0) h.flash -= dt;
    }
    for (const e of this.world.query(ElementMarks)) {
      const m = this.world.mustGet(e, ElementMarks);
      for (const el of Object.keys(m.marks) as Element[]) {
        const left = (m.marks[el] ?? 0) - dt;
        if (left <= 0) delete m.marks[el];
        else m.marks[el] = left;
      }
    }
    for (const e of this.world.query(Buffs)) {
      const b = this.world.mustGet(e, Buffs);
      if (b.stunT > 0) b.stunT -= dt;
      if (b.slowT > 0) b.slowT -= dt;
      if (b.vulnT > 0) b.vulnT -= dt;
    }

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
    // 草地贴图解码完成后重烘焙地面
    if (!this.bgHasTile && sprites.get('grass_tile')) {
      this.bgHasTile = true;
      this.bg = this.bakeBackground();
    }
    const r = this.renderer;
    r.clear('#131a12');

    if (this.state === 'menu') {
      // 菜单背景:地图淡出
      r.inWorld((ctx) => {
        ctx.globalAlpha = 0.35;
        ctx.drawImage(this.bg, 0, 0);
        ctx.globalAlpha = 1;
      });
      // 主角立绘(呼吸摇摆,跟随所选职业)
      drawSprite(r.ctx, KLASS_SPRITE[this.menuUI.selectedClass], r.width / 2 - 240, r.height * 0.30, {
        scale: 3.2, rot: Math.sin(this.menuT * 1.6) * 0.03, sy: 1 + Math.sin(this.menuT * 3.2) * 0.015,
      });
      drawSprite(r.ctx, 'boss_nanmir', r.width / 2 + 265, r.height * 0.33, {
        scale: 1.35, faceLeft: true, alpha: 0.85, sy: 1 + Math.sin(this.menuT * 2.2) * 0.02,
      });
      this.menuUI.renderMenu(r.ctx, r.width, r.height, this.menuT);
      return;
    }

    this.renderWorld(alpha);

    if (this.state === 'results') {
      this.menuUI.renderResults(r.ctx, r.width, r.height, this.lastStats);
      return;
    }

    this.renderHud();
    this.feedback.renderScreen(r.ctx, r.width, r.height);
    this.inventoryUI.render(r.ctx, this.world, this.playerE, r.width, r.height);

    // ---- 暂停遮罩 ----
    if (this.paused) {
      const ctx = r.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(13,15,26,0.78)';
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = UI.gold;
      ctx.font = 'bold 30px monospace';
      ctx.fillText('⏸ 暂停', r.width / 2, r.height * 0.36);
      ctx.fillStyle = UI.text;
      ctx.font = '14px monospace';
      const lines = [
        '[Esc] 继续战斗',
        `[M] 音效:${this.muted ? '已静音 🔇' : '开启 🔊'}`,
        '[Backspace] 放弃本局(结算)',
        '',
        'WASD移动 · 左键普攻 · 空格翻滚 · Q/E/R技能',
        'Tab背包/符文 · 1药剂 · F交互 · L星灯(夜)',
      ];
      lines.forEach((l, i) => ctx.fillText(l, r.width / 2, r.height * 0.46 + i * 26));
      ctx.restore();
    }
  }

  private renderWorld(alpha: number): void {
    const r = this.renderer;
    r.inWorld((ctx) => {
      ctx.drawImage(this.bg, 0, 0);
      const w = this.world;

      // 地面区域
      for (const e of w.query(Zone, Transform)) {
        const z = w.mustGet(e, Zone);
        const tr = w.mustGet(e, Transform);
        const pulse = 0.75 + 0.25 * Math.sin(performance.now() / 120);
        ctx.save();
        ctx.globalAlpha = 0.16 * pulse * Math.min(z.life * 2, 1);
        ctx.fillStyle = z.color;
        ctx.beginPath();
        ctx.ellipse(tr.x, tr.y, z.radiusPx, z.radiusPx * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.45 * pulse;
        ctx.strokeStyle = z.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // 预警圈(倒计时填充)
      for (const e of w.query(TelegraphStrike, Transform)) {
        const ts = w.mustGet(e, TelegraphStrike);
        const tr = w.mustGet(e, Transform);
        const prog = 1 - ts.t / ts.total;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.strokeStyle = ts.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(tr.x, tr.y, ts.radiusPx, ts.radiusPx * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.22 + prog * 0.2;
        ctx.fillStyle = ts.color;
        ctx.beginPath();
        ctx.ellipse(tr.x, tr.y, ts.radiusPx * prog, ts.radiusPx * 0.62 * prog, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 实体 Y 排序
      interface D { y: number; draw: () => void }
      const list: D[] = [];
      const lerp = (tr: Transform): [number, number] => [
        tr.prevX + (tr.x - tr.prevX) * alpha,
        tr.prevY + (tr.y - tr.prevY) * alpha,
      ];

      for (const e of w.query(Shroomling, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const s = w.mustGet(e, Shroomling);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 11);
          const walk = s.state === 'chase' ? 10 : 5;
          if (!drawSprite(ctx, 'shroomling', ix, iy, {
            flash: h.flash, rot: Math.sin(s.animT * walk) * 0.07,
            sy: 1 + Math.sin(s.animT * walk * 2) * 0.05,
          })) drawShroomling(ctx, ix, iy, s.animT, h.flash, s.state === 'chase');
        } });
      }
      for (const e of w.query(WindBee, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const b = w.mustGet(e, WindBee);
        const h = w.mustGet(e, Health);
        const vel = w.get(e, Velocity);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 7);
          const jitter = b.state === 'telegraph' ? (Math.random() - 0.5) * 0.3 : 0;
          if (!drawSprite(ctx, 'windbee', ix, iy - 10 + Math.sin(b.animT * 9) * 3, {
            flash: h.flash, faceLeft: (vel?.vx ?? 0) < 0, rot: jitter + Math.sin(b.animT * 5) * 0.08,
          })) drawWindBee(ctx, ix, iy, b.animT, h.flash, b.state === 'telegraph');
        } });
      }
      for (const e of w.query(BlightWolf, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const wf = w.mustGet(e, BlightWolf);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 16);
          const faceLeft = Math.cos(tr.face) < 0;
          const lean = wf.state === 'pounce' ? (faceLeft ? 0.16 : -0.16) : 0;
          const growl = wf.state === 'growl' ? (Math.random() - 0.5) * 0.12 : 0;
          if (!drawSprite(ctx, 'blightwolf', ix, iy, {
            flash: h.flash, faceLeft, rot: lean + growl,
            sy: 1 + Math.sin(wf.animT * 12) * 0.03,
          })) drawBlightWolf(ctx, ix, iy, wf.animT, h.flash, faceLeft, wf.state === 'growl', wf.state === 'pounce');
        } });
      }
      for (const e of w.query(ThornVine, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const v = w.mustGet(e, ThornVine);
        const h = w.mustGet(e, Health);
        list.push({ y: tr.y, draw: () => {
          drawShadow(ctx, tr.x, tr.y, 12);
          const cast = v.state === 'telegraph';
          if (!drawSprite(ctx, 'thornvine', tr.x, tr.y, {
            flash: h.flash, rot: Math.sin(v.animT * 2) * 0.05,
            sy: cast ? 1.08 + Math.sin(v.animT * 18) * 0.03 : 1,
          })) drawThornVine(ctx, tr.x, tr.y, v.animT, h.flash, cast);
        } });
      }
      for (const e of w.query(OakGolem, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const g = w.mustGet(e, OakGolem);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 18);
          const faceLeft = Math.cos(tr.face) < 0;
          const windup = g.state === 'windup';
          if (!drawSprite(ctx, 'oakgolem', ix, iy, {
            flash: h.flash, faceLeft,
            rot: windup ? (faceLeft ? 0.12 : -0.12) : Math.sin(g.animT * 4) * 0.03,
            sy: windup ? 1.06 : 1 + Math.sin(g.animT * 8) * 0.02,
          })) drawOakGolem(ctx, ix, iy, g.animT, h.flash, faceLeft, windup);
        } });
      }
      for (const e of w.query(BossNanmir, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const boss = w.mustGet(e, BossNanmir);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 34);
          const faceLeft = Math.cos(tr.face) < 0;
          const stag = boss.state === 'stagger';
          if (!drawSprite(ctx, 'boss_nanmir', ix, iy, {
            flash: h.flash, faceLeft,
            rot: stag ? 0.12 : Math.sin(boss.animT * 1.8) * 0.02,
            sy: 1 + Math.sin(boss.animT * 2.2) * 0.02 + (boss.phase === 3 ? 0.03 : 0),
          })) drawBossNanmir(ctx, ix, iy, boss.animT, h.flash, faceLeft, boss.phase, stag);
        } });
      }
      // ---- 元素杂兵四件套 + 星尘精灵 ----
      const blob = (x: number, y: number, r: number, color: string): void => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y - r, r, 0, Math.PI * 2);
        ctx.fill();
      };
      for (const e of w.query(EmberImp, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const imp = w.mustGet(e, EmberImp);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 8);
          const hover = Math.sin(imp.animT * 6) * 3 - 6;
          const jit = imp.state === 'aim' ? (Math.random() - 0.5) * 0.2 : 0;
          if (!drawSprite(ctx, 'emberimp', ix, iy + hover, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: jit + Math.sin(imp.animT * 3) * 0.06,
            sx: imp.state === 'aim' ? 1.12 : 1,
          })) blob(ix, iy + hover, 12, '#ff9a6b');
        } });
      }
      for (const e of w.query(FrostSlime, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const s = w.mustGet(e, FrostSlime);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          const small = s.size === 1;
          drawShadow(ctx, ix, iy, small ? 7 : 11);
          const jump = s.hopT > 0;
          if (!drawSprite(ctx, 'frostslime', ix, iy, {
            flash: h.flash, scale: small ? 0.62 : 1,
            sy: jump ? 1.18 : 1 + Math.sin(s.animT * 5) * 0.08,
            sx: jump ? 0.88 : 1 - Math.sin(s.animT * 5) * 0.06,
          })) blob(ix, iy, small ? 8 : 13, '#8fdcff');
        } });
      }
      for (const e of w.query(SparkLizard, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const lz = w.mustGet(e, SparkLizard);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 12);
          const faceLeft = Math.cos(tr.face) < 0;
          const jit = lz.state === 'telegraph' ? (Math.random() - 0.5) * 0.24 : 0;
          const lean = lz.state === 'dash' ? (faceLeft ? 0.18 : -0.18) : 0;
          if (!drawSprite(ctx, 'sparklizard', ix, iy, {
            flash: h.flash, faceLeft, rot: jit + lean,
            sx: lz.state === 'dash' ? 1.15 : 1,
          })) blob(ix, iy, 10, '#ffe57a');
        } });
      }
      for (const e of w.query(ToxinToad, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const td = w.mustGet(e, ToxinToad);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 12);
          if (!drawSprite(ctx, 'toxintoad', ix, iy, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            sx: td.state === 'aim' ? 1.18 : 1,
            sy: td.state === 'hop' ? 1.12 : 1 + Math.sin(td.animT * 3) * 0.04,
          })) blob(ix, iy, 12, '#b8e878');
        } });
      }
      for (const e of w.query(StardustSprite, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const sp = w.mustGet(e, StardustSprite);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 6);
          const hover = Math.sin(sp.animT * 8) * 4 - 8;
          const blink = sp.lifeT < 3 ? 0.4 + 0.5 * Math.abs(Math.sin(sp.animT * 10)) : 1;
          if (!drawSprite(ctx, 'stardustsprite', ix, iy + hover, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: Math.sin(sp.animT * 4) * 0.1, alpha: blink,
          })) blob(ix, iy + hover, 9, '#ffd94f');
          // 星尘轨迹
          ctx.globalAlpha = 0.5 * blink;
          ctx.fillStyle = '#ffd94f';
          for (let i = 1; i <= 3; i++) {
            const t = sp.animT * 8 - i * 0.9;
            ctx.fillRect(ix - Math.cos(tr.face) * i * 9 - 2, iy + Math.sin(t) * 4 - 22, 3, 3);
          }
          ctx.globalAlpha = 1;
        } });
      }

      // ---- 场景物件 ----
      for (const e of w.query(PropObstacle, Transform)) {
        const tr = w.mustGet(e, Transform);
        const pk = w.mustGet(e, PropObstacle).kind;
        list.push({ y: tr.y, draw: () => {
          if (pk === 'tree') drawShadow(ctx, tr.x, tr.y, 20);
          if (!drawSprite(ctx, `prop_${pk}`, tr.x, tr.y + (pk === 'tree' ? 6 : 2))) {
            blob(tr.x, tr.y, pk === 'tree' ? 22 : pk === 'rock' ? 14 : 10,
              pk === 'rock' ? '#9aa3ad' : '#4f8a44');
          }
        } });
      }

      // ---- 秘境图腾 ----
      for (const e of w.query(EventTotem, Transform)) {
        const totem = w.mustGet(e, EventTotem);
        const tr = w.mustGet(e, Transform);
        const near = this.events.nearbyTotem === e;
        const info = TOTEM_INFO[totem.kind];
        list.push({ y: tr.y, draw: () => {
          const alpha = totem.used ? 0.35 : 1;
          ctx.globalAlpha = alpha;
          // 石碑
          drawShadow(ctx, tr.x, tr.y, 14);
          ctx.fillStyle = '#7a8494';
          ctx.fillRect(tr.x - 14, tr.y - 46, 28, 46);
          ctx.fillStyle = '#9aa3ad';
          ctx.fillRect(tr.x - 14, tr.y - 46, 28, 8);
          ctx.fillStyle = '#5d6673';
          ctx.fillRect(tr.x - 18, tr.y - 6, 36, 6);
          // 符号(未用时脉动发光)
          const pulse = totem.used ? 0.6 : 0.7 + 0.3 * Math.sin(totem.animT * 3);
          ctx.globalAlpha = alpha * pulse;
          ctx.fillStyle = info.color;
          ctx.font = 'bold 18px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(info.icon, tr.x, tr.y - 20);
          ctx.globalAlpha = alpha;
          ctx.font = 'bold 11px monospace';
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#0d0f1a';
          ctx.strokeText(info.name, tr.x, tr.y - 54);
          ctx.fillStyle = info.color;
          ctx.fillText(info.name, tr.x, tr.y - 54);
          ctx.globalAlpha = 1;
          if (near && !totem.used) {
            ctx.fillStyle = UI.text;
            ctx.font = '11px monospace';
            ctx.strokeText(`${info.desc} · [F] 选择`, tr.x, tr.y + 22);
            ctx.fillText(`${info.desc} · [F] 选择`, tr.x, tr.y + 22);
          }
        } });
      }

      // ---- 商店摊位 ----
      for (const e of w.query(ShopStand, Transform)) {
        const stand = w.mustGet(e, ShopStand);
        const tr = w.mustGet(e, Transform);
        const near = this.shop.nearbyStand === e;
        list.push({ y: tr.y, draw: () => {
          // 木摊
          ctx.fillStyle = '#6b4e2c';
          ctx.fillRect(tr.x - 22, tr.y - 16, 44, 16);
          ctx.fillStyle = '#8f6c40';
          ctx.fillRect(tr.x - 26, tr.y - 22, 52, 8);
          const alpha = stand.sold ? 0.35 : 1;
          ctx.globalAlpha = alpha;
          // 货物
          const bob = Math.sin(stand.animT * 3) * 2;
          if (stand.wares === 'item' && stand.item) {
            ctx.fillStyle = RARITY_COLORS[stand.item.rarity];
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(stand.item.glyph, tr.x, tr.y - 30 + bob);
          } else if (stand.wares === 'potion') {
            ctx.fillStyle = UI.hpLow;
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('❤', tr.x, tr.y - 30 + bob);
          } else {
            ctx.fillStyle = '#B067E8';
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('◈', tr.x, tr.y - 30 + bob);
          }
          // 价签
          ctx.font = 'bold 12px monospace';
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#0d0f1a';
          const tag = stand.sold ? '已售' : `✦${stand.price}`;
          ctx.strokeText(tag, tr.x, tr.y + 14);
          ctx.fillStyle = stand.sold ? UI.dim : UI.gold;
          ctx.fillText(tag, tr.x, tr.y + 14);
          ctx.globalAlpha = 1;
          if (near && !stand.sold) {
            const name = stand.wares === 'item' ? stand.item!.name
              : stand.wares === 'potion' ? '治疗药剂'
              : `符文「${RUNE_POOL.get(stand.runeId!)?.name ?? '?'}」`;
            ctx.fillStyle = '#8fd4c8';
            ctx.font = 'bold 12px monospace';
            ctx.strokeText(`[F] 购买 ${name}`, tr.x, tr.y - 52);
            ctx.fillText(`[F] 购买 ${name}`, tr.x, tr.y - 52);
          }
        } });
      }

      // ---- 弹幕(光球 / 箭矢) ----
      for (const e of w.query(Projectile, Transform, Velocity)) {
        const pj = w.mustGet(e, Projectile);
        const tr = w.mustGet(e, Transform);
        const vel = w.mustGet(e, Velocity);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy + 6, draw: () => {
          ctx.save();
          if (pj.shape === 'arrow') {
            // 箭矢:沿速度方向的杆+镞+尾羽
            const a = Math.atan2(vel.vy, vel.vx);
            ctx.translate(ix, iy);
            ctx.rotate(a);
            ctx.strokeStyle = '#c9a063';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(-9, 0);
            ctx.lineTo(7, 0);
            ctx.stroke();
            ctx.fillStyle = pj.color;
            ctx.beginPath();
            ctx.moveTo(11, 0);
            ctx.lineTo(5, -3.5);
            ctx.lineTo(5, 3.5);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#dfe8f2';
            ctx.fillRect(-11, -2.5, 4, 5);
          } else {
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = pj.color;
            ctx.beginPath();
            ctx.arc(ix, iy, pj.radiusPx * 1.9, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(ix, iy, pj.radiusPx, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(ix, iy, pj.radiusPx * 0.45, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        } });
      }

      for (const e of w.query(Portal, Transform)) {
        const tr = w.mustGet(e, Transform);
        const po = w.mustGet(e, Portal);
        po.animT += 0.016;
        const st = PORTAL_STYLE[po.kind];
        list.push({ y: tr.y, draw: () => drawPortal(ctx, tr.x, tr.y, po.animT, st.color, st.label) });
      }
      for (const e of w.query(Pickup, Transform)) {
        const tr = w.mustGet(e, Transform);
        const pk = w.mustGet(e, Pickup);
        const color = pk.kind === 'item' && pk.item ? RARITY_COLORS[pk.item.rarity] : '#f2d98c';
        list.push({ y: tr.y - 1, draw: () => drawPickup(ctx, tr.x, tr.y, pk.kind, color, pk.bobPhase, pk.item?.glyph) });
      }
      {
        const e = this.playerE;
        const tr = w.get(e, Transform);
        const p = w.get(e, Player);
        const h = w.get(e, Health);
        if (tr && p && h && p.respawnT <= 0) {
          const [ix, iy] = lerp(tr);
          list.push({
            y: iy,
            draw: () => {
              drawShadow(ctx, ix, iy, 13);
              const faceLeft = p.aimX < 0;
              const attacking = p.attackT > 0;
              const prog = p.attackDur > 0 ? 1 - p.attackT / p.attackDur : 0;
              // 程序动画:跑步摇摆 / 攻击前倾脉冲 / 翻滚残影感
              let rot = 0;
              let sy = 1;
              let sx = 1;
              if (p.moving) {
                rot = Math.sin(p.animT * 13) * 0.06;
                sy = 1 + Math.sin(p.animT * 26) * 0.03;
              }
              if (attacking) {
                const punch = Math.sin(prog * Math.PI);
                rot = (faceLeft ? 0.1 : -0.1) * punch * (1 + p.comboStage * 0.25);
                sx = 1 + punch * 0.08;
              }
              const ok = drawSprite(ctx, KLASS_SPRITE[p.klass], ix, iy, {
                flash: h.flash, faceLeft, rot, sx, sy,
                alpha: p.dashT > 0 ? 0.7 : p.iframes > 0 ? 0.85 : 1,
              });
              if (!ok) drawKnight(ctx, ix, iy, {
                t: p.animT, moving: p.moving, faceLeft,
                attackStage: attacking ? p.comboStage : 0,
                attackProg: prog,
                dashing: p.dashT > 0, flash: h.flash,
                invuln: p.iframes > 0 && p.dashT <= 0,
              });
            },
          });
        }
      }

      list.sort((a, b) => a.y - b.y);
      for (const d of list) d.draw();

      // 元素印记标示
      for (const e of w.query(ElementMarks, Transform)) {
        const m = w.mustGet(e, ElementMarks);
        const els = Object.keys(m.marks) as Element[];
        if (els.length === 0) continue;
        const tr = w.mustGet(e, Transform);
        const baseY = tr.y - (w.has(e, BossNanmir) ? 110 : 32);
        els.forEach((el, i) => {
          const x = tr.x + (i - (els.length - 1) / 2) * 10;
          ctx.fillStyle = elementColor(el);
          ctx.fillRect(x - 3, baseY - 3, 6, 6);
          ctx.strokeStyle = '#0d0f1a';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 3, baseY - 3, 6, 6);
        });
      }

      this.feedback.renderWorld(ctx);
    });

    // 夜幕滤镜(屏幕空间)
    if (clock.isNight() && this.state === 'run') {
      const { ctx, width, height } = r;
      ctx.fillStyle = 'rgba(20, 28, 62, 0.34)';
      ctx.fillRect(0, 0, width, height);
    }
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
    const klassCfg = balance.classes[p.klass];
    ctx.fillText(`${klassCfg.hero} · ${klassCfg.name}`, 24, 34);
    const ratio = Math.max(hp.hp / hp.max, 0);
    ctx.fillStyle = '#232838';
    ctx.fillRect(24, 44, 220, 14);
    ctx.fillStyle = ratio > 0.3 ? UI.hp : UI.hpLow;
    ctx.fillRect(24, 44, 220 * ratio, 14);
    ctx.fillStyle = UI.text;
    ctx.font = '11px monospace';
    ctx.fillText(`${Math.ceil(hp.hp)} / ${hp.max}`, 28, 55);

    // 顶部中央:房间进度 + 昼夜
    const roomLabel = this.run.roomKind === 'boss'
      ? balance.boss.nanmir.name
      : `房间 ${this.run.depth + 1}/${balance.rooms.count + 1} · ${PORTAL_STYLE[this.run.roomKind].label}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = UI.panel;
    ctx.fillRect(width / 2 - 150, 14, 300, 26);
    ctx.fillStyle = UI.text;
    ctx.font = 'bold 12px monospace';
    const night = clock.isNight();
    ctx.fillText(`${night ? '🌙' : '☀'} ${roomLabel} · ${Math.ceil(clock.untilSwitch())}s`, width / 2, 31);

    // Boss 血条
    for (const e of this.world.query(BossNanmir, Health)) {
      const bh = this.world.mustGet(e, Health);
      const boss = this.world.mustGet(e, BossNanmir);
      const bw = Math.min(560, width - 120);
      const bx = width / 2 - bw / 2;
      ctx.fillStyle = UI.panel;
      ctx.fillRect(bx - 6, 48, bw + 12, 30);
      ctx.fillStyle = '#232838';
      ctx.fillRect(bx, 60, bw, 12);
      ctx.fillStyle = boss.state === 'stagger' ? UI.gold : '#b34747';
      ctx.fillRect(bx, 60, bw * Math.max(bh.hp / bh.max, 0), 12);
      ctx.fillStyle = UI.text;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${balance.boss.nanmir.name} · P${boss.phase}`, width / 2, 57);
    }

    // 左下:翻滚冷却
    const cdRatio = p.dashCd > 0 ? 1 - p.dashCd / balance.player.dash.cooldown : 1;
    ctx.textAlign = 'left';
    ctx.fillStyle = UI.panel;
    ctx.fillRect(14, height - 64, 130, 50);
    ctx.fillStyle = cdRatio >= 1 ? UI.gold : UI.dim;
    ctx.font = 'bold 12px monospace';
    ctx.fillText('翻滚 [空格]', 24, height - 44);
    ctx.fillStyle = '#232838';
    ctx.fillRect(24, height - 34, 110, 8);
    ctx.fillStyle = cdRatio >= 1 ? UI.gold : UI.dim;
    ctx.fillRect(24, height - 34, 110 * cdRatio, 8);

    if (p.comboStage > 0 && p.comboTimer > 0) {
      ctx.fillStyle = p.comboStage === 3 ? UI.crit : UI.text;
      ctx.font = `bold ${14 + p.comboStage * 2}px monospace`;
      ctx.fillText(`${p.comboStage} 段`, 160, height - 36);
    }

    // 技能栏
    const slotW = 64;
    const slotH = 56;
    const gap = 10;
    const baseX = width / 2 - (slotW * 3 + gap * 2) / 2;
    const baseY = height - slotH - 34;
    const slots: Array<{ key: string; cd: number; cdMax: number; locked: boolean }> = [
      { key: 'Q', cd: p.cdQ, cdMax: this.skills.cooldownOf('Q'), locked: false },
      { key: 'E', cd: p.cdE, cdMax: this.skills.cooldownOf('E'), locked: false },
      { key: 'R', cd: p.cdR, cdMax: this.skills.cooldownOf('R'), locked: p.rage < 40 },
    ];
    ctx.textAlign = 'center';
    slots.forEach((s, i) => {
      const x = baseX + i * (slotW + gap);
      ctx.fillStyle = UI.panel;
      ctx.fillRect(x, baseY, slotW, slotH);
      const ready = s.cd <= 0 && !s.locked;
      ctx.strokeStyle = ready ? UI.gold : '#3a4154';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, baseY + 1, slotW - 2, slotH - 2);
      ctx.fillStyle = ready ? UI.gold : UI.dim;
      ctx.font = 'bold 16px monospace';
      ctx.fillText(s.key, x + slotW / 2, baseY + 22);
      ctx.font = '10px monospace';
      ctx.fillStyle = UI.dim;
      ctx.fillText(this.skills.skillName(s.key), x + slotW / 2, baseY + 38);
      const rune = this.skills.runeFor(this.world, this.playerE, s.key);
      if (rune) {
        ctx.fillStyle = rune.element ? elementColor(rune.element as Element) : UI.dim;
        ctx.font = '9px monospace';
        ctx.fillText(`◈${rune.name}`, x + slotW / 2, baseY + 50);
      }
      if (s.cd > 0) {
        const cr = s.cd / s.cdMax;
        ctx.fillStyle = 'rgba(13,15,26,0.65)';
        ctx.fillRect(x, baseY, slotW, slotH * Math.min(cr, 1));
        ctx.fillStyle = UI.text;
        ctx.font = 'bold 13px monospace';
        ctx.fillText(s.cd.toFixed(1), x + slotW / 2, baseY + slotH / 2 + 4);
      } else if (s.locked) {
        ctx.fillStyle = 'rgba(13,15,26,0.5)';
        ctx.fillRect(x, baseY, slotW, slotH);
      }
    });
    const rageX = baseX + 2 * (slotW + gap);
    ctx.fillStyle = '#232838';
    ctx.fillRect(rageX, baseY - 12, slotW, 7);
    ctx.fillStyle = p.rage >= 40 ? UI.gold : '#8a6b1f';
    ctx.fillRect(rageX, baseY - 12, slotW * (p.rage / 100), 7);

    // 右上:统计与资源
    ctx.textAlign = 'right';
    ctx.fillStyle = UI.panel;
    ctx.fillRect(width - 210, 14, 196, 48);
    ctx.fillStyle = UI.text;
    ctx.font = '12px monospace';
    ctx.fillText(`击杀 ${this.feedback.kills}  FPS ${Math.round(this.fps)}`, width - 24, 32);
    ctx.fillStyle = UI.gold;
    ctx.fillText(`✦ ${p.stardust}`, width - 110, 52);
    ctx.fillStyle = p.potionCharges > 0 ? UI.hpLow : UI.dim;
    ctx.fillText(`药剂[1] ×${p.potionCharges}`, width - 24, 52);

    // 底部提示
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,232,232,0.5)';
    ctx.font = '12px monospace';
    const hint = clock.isNight()
      ? `🌙 夜间掉落×2 · [L] 星灯 ✦${balance.night.lanternCost} 立即天亮 · [Tab]背包镶符文`
      : '清空房间踩传送门前进 · 异元素连击触发连锁 · 傀儡绕背×2 · [Tab]背包/符文 · 商店按[F]买';
    ctx.fillText(hint, width / 2, height - 12);
  }

  /** 烘焙静态地面 */
  private bakeBackground(): HTMLCanvasElement {
    const wPx = balance.arena.widthM * M;
    const hPx = balance.arena.heightM * M;
    const cv = document.createElement('canvas');
    cv.width = wPx;
    cv.height = hPx;
    const ctx = cv.getContext('2d')!;
    const rng = new Rng(20231124);

    const tile = sprites.get('grass_tile');
    if (tile) {
      // 正式草地贴图(无缝平铺)
      ctx.imageSmoothingEnabled = false;
      const pat = ctx.createPattern(tile, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, wPx, hPx);
      }
    } else {
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
    }
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
