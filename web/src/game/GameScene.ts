import { World } from '@engine/ecs/World';
import type { System } from '@engine/ecs/World';
import { GameLoop } from '@engine/core/GameLoop';
import { sfx } from '@engine/audio/Sfx';
import { music } from '@engine/audio/Music';
import { Rng } from '@engine/core/Rng';
import { Input } from '@engine/input/Input';
import { Renderer } from '@engine/render/Renderer';
import balance from '@data/balance.json';
import { FOREST, M, RARITY_COLORS, UI } from '@game/constants';
import {
  BlightWolf, Body, BossNanmir, Buffs, Element, ElementMarks, EmberImp, Equipment, Faction,
  BlizzardHawk, BossKazra, BossVelsha, CampStation, CinderRat, Dummy, DuneBeetle, DustStinger,
  MidBossStag,
  FlameDancer, FrostMage, IceTurtle, SnowPuff,
  EventTotem, FrostSlime, Health, Inventory, OakGolem, Pickup, Player, Portal, Projectile, PropObstacle,
  Merchant, SfxEvent, ShopStand, Shroomling, SparkLizard, StardustSprite, Stats, TelegraphStrike, ThornVine,
  ToastEvent, ToxinToad, Transform, Velocity, WindBee, Zone,
} from '@game/components';
import { elementColor } from '@game/combat/Elements';
import {
  drawBlightWolf, drawBossNanmir, drawDummy, drawElementIcon, drawKnight, drawOakGolem, drawPickup,
  drawPortal, drawShadow, drawShroomling, drawThornVine, drawWindBee,
} from '@game/gfx/draw';
import { PlayerSystem } from '@game/systems/PlayerSystem';
import { SkillSystem, RUNE_POOL } from '@game/skills/SkillSystem';
import { ShopSystem } from '@game/systems/ShopSystem';
import { EventSystem } from '@game/systems/EventSystem';
import { EnemySystem } from '@game/systems/EnemySystem';
import { EliteSystem } from '@game/systems/EliteSystem';
import { MidBossSystem } from '@game/systems/MidBossSystem';
import { CritterSystem } from '@game/systems/CritterSystem';
import { TundraSystem } from '@game/systems/TundraSystem';
import { DesertSystem } from '@game/systems/DesertSystem';
import { BlizzardTimerSystem, VelshaSystem } from '@game/systems/VelshaSystem';
import { KazraSystem } from '@game/systems/KazraSystem';
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
import { TouchControls } from '@game/ui/TouchControls';
import { CampUI } from '@game/ui/CampUI';
import { SettingsUI } from '@game/ui/SettingsUI';
import { bindOf, keyLabel } from '@game/meta/Bindings';
import { basicRangePx, basicSpec } from '@game/combat/BasicAttack';
import { inAutoAttackRange } from '@game/input/AimAssist';
import { recompute } from '@game/loot/Equip';
import { RunManager } from '@game/dungeon/RunManager';
import { LAYOUT_LABELS } from '@game/dungeon/RoomLayouts';
import { terrain } from '@game/dungeon/Terrain';
import { drawPixelText, lineHeight, measure } from '@game/gfx/pixelFont';
import { BOARD_LABEL, submitRun, type BoardId } from '@game/meta/Leaderboard';
import { paintFloorFeature } from '@game/gfx/floor';
import { clock } from '@game/dungeon/Clock';
import { meta } from '@game/meta/Save';
import { buildFromBlueprint, blueprintOf } from '@game/loot/Blueprint';
import { NORMAL as ABYSS_NORMAL, newlyUnlocked, recordClear, levelName } from '@game/dungeon/Abyss';
import { floorLabel, isNewRecord, loopLabel, recordRun } from '@game/dungeon/Endless';
import { CONS_VISUAL, consumableDef, type ConsumableId } from '@game/loot/Consumables';
import { tutorial, formatHint } from '@game/meta/Tutorial';
import { markRuneOwned } from '@game/meta/Codex';
import { checkUnlocks } from '@game/meta/Achievements';
import { sprites } from '@engine/render/Sprites';
import { drawSprite, SPRITE_NAMES } from '@game/gfx/spriteDraw';
import { actionOf, attackAction, bobPx, clockFor, clocksOf, spriteFor, twoFrame } from '@game/gfx/anim';
import { drawPanel9 } from '@game/gfx/nineSlice';
import { runMods } from '@game/dungeon/RunMods';

/** R 技能所需怒气(与 SkillSystem 的 minRage 默认值一致) */
const RAGE_FOR_R = 40;

/** 引导总步数(展示用;步骤表在 balance.tutorial.steps) */
const TUTORIAL_TOTAL = balance.tutorial.steps.length;

const PORTAL_STYLE: Record<string, { color: string; label: string }> = {
  battle: { color: '#dfe8f2', label: '战斗' },
  treasure: { color: '#F2A33C', label: '宝藏' },
  elite: { color: '#B067E8', label: '精英' },
  midboss: { color: '#8fd45f', label: '中首领' },
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

type GameState = 'menu' | 'camp' | 'run' | 'results';

/**
 * 主场景状态机:menu → run(8房+Boss)→ results → menu。
 * 系统更新顺序即契约(docs/02-ARCHITECTURE.md §4)。
 */
export class GameScene {
  /** 本局挑战模式(结算时写记录;'off' = 普通远征) */
  private runMode: 'off' | 'daily' | 'weekly' = 'off';
  private state: GameState = 'menu';
  private paused = false;
  private muted = false;
  private world = new World();
  private systems: System[] = [];
  private feedback!: FeedbackSystem;
  private skills!: SkillSystem;
  private loot!: LootSystem;
  /** 玩家系统:持有触屏瞄准助手(HUD 与自动攻击都读同一个目标) */
  private playerSystem!: PlayerSystem;
  private shop!: ShopSystem;
  private events!: EventSystem;
  private run!: RunManager;
  private inventoryUI: InventoryUI;
  private menuUI: MenuUI;
  private touch: TouchControls;
  private campUI: CampUI;
  private settingsUI: SettingsUI;
  private settingsRect = { x: 0, y: 0, w: 0, h: 0 };
  private gearRect = { x: 0, y: 0, w: 0, h: 0 };

  /** 本帧是否点击在矩形内 */
  private clickIn(r: { x: number; y: number; w: number; h: number }): boolean {
    return this.input.mousePressed &&
      this.input.mouseX >= r.x && this.input.mouseX <= r.x + r.w &&
      this.input.mouseY >= r.y && this.input.mouseY <= r.y + r.h;
  }
  private campNearE: number | null = null;
  private quitRect = { x: 0, y: 0, w: 0, h: 0 };
  private playerE = 0;
  private bg: HTMLCanvasElement;
  private fps = 60;
  private menuT = 0;
  private wasNight = false;
  private lastStats: RunStats = {
    victory: false, rooms: 0, kills: 0, timeS: 0, stardustGained: 0, hitsTaken: 0, maxHit: 0,
    endlessFloor: 0, endlessLoop: 0, endlessRecord: false,
  };
  private bgHasTile = false;
  /** 已烘焙进背景的布局指纹(换模板/换房 → 重烘焙地面) */
  private bgLayoutKey = '';
  /** 上帧玩家是否站在浅滩里(只提示一次,不刷屏) */
  private wasInWater = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly input: Input,
    private readonly loop: GameLoop,
  ) {
    for (const n of SPRITE_NAMES) sprites.load(n, `${import.meta.env.BASE_URL}sprites/${n}.png`);
    this.inventoryUI = new InventoryUI(input);
    this.menuUI = new MenuUI(input);
    this.touch = new TouchControls(input);
    // 触屏自动攻击开关:存档里是权威(设置面板里也能关);在触屏面板上一键切换后立刻落盘
    this.touch.autoAttack = meta.data.settings.autoAttack;
    this.touch.onAutoAttackToggle = (on) => {
      meta.data.settings.autoAttack = on;
      meta.save();
    };
    this.campUI = new CampUI(input);
    this.settingsUI = new SettingsUI(input);
    // 应用已存音量(unlock 前设置也会在 unlock 时生效)
    sfx.setVolume(meta.data.settings.sfxVol);
    music.setVolume(meta.data.settings.musicVol);
    // 营地渲染依赖 run.chapter/loot 存在,先建默认实例(startRun 会重建)
    this.loot = new LootSystem();
    this.run = new RunManager(this.loot.factory);
    this.bg = this.bakeBackground();
    this.renderer.camera.snap((balance.arena.widthM / 2) * M, (balance.arena.heightM / 2) * M);
  }

  // ---------- run 生命周期 ----------

  private startRun(mode: 'off' | 'daily' | 'weekly' = 'off'): void {
    this.paused = false;
    this.runMode = mode;
    const klass = this.campUI.selectedClass;
    // 挑战局章节固定第一章(全服同种子可比,周常也一样)
    const chapter: 1 | 2 | 3 = mode === 'off' ? this.campUI.selectedChapter : 1;
    this.world = new World();
    this.feedback = new FeedbackSystem(this.loop, this.renderer.camera);
    this.skills = new SkillSystem(this.input, klass, this.renderer);
    this.loot = new LootSystem();
    this.loot.luck = meta.data.altar.luck * balance.altar.luckPerLvl;
    this.loot.factory.pityCount = meta.data.pity;
    this.shop = new ShopSystem(this.input);
    // 议价随机源每局重播种:固定种子会让"每局第一家店的议价结果永远一样"
    this.shop.reseed((meta.data.stats.runs + 1) * 2654435761);
    this.events = new EventSystem(this.input, this.loot.factory);
    this.run = new RunManager(this.loot.factory);
    this.run.chapter = chapter;
    // 深渊难度档(轮 23):挑战局(每日/周常)固定普通档 —— 挑战要全服同条件,不是"谁层数高谁分高"
    runMods.setAbyss(mode === 'off' ? this.campUI.selectedAbyss : ABYSS_NORMAL);
    // 无尽模式(轮 24):只有普通远征能开(挑战局要全服同条件);无尽开局从循环 0 起算
    this.run.endless = mode === 'off' && this.campUI.endless;
    runMods.setEndlessLoop(0);
    this.bgHasTile = false;
    this.playerSystem = new PlayerSystem(this.input, this.renderer);
    this.playerSystem.aimAssist.reset(); // 新一局:清掉上一局的锁定目标(实体 id 会复用)
    this.systems = [
      this.playerSystem,
      this.skills,
      new EnemySystem(),
      new EliteSystem(),
      new MidBossSystem(),
      new CritterSystem(),
      new TundraSystem(),
      new DesertSystem(),
      new BossSystem(),
      new VelshaSystem(),
      new KazraSystem(),
      new BlizzardTimerSystem(),
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
    // 星辉铸台:预订的开局装备。蓝图件按"图纸给定"的部位/特效/词条出炉(钱在铸台就付过了)
    if (meta.data.craftQueuedId) {
      const bpId = meta.data.craftQueuedId;
      meta.data.craftQueuedId = null;
      meta.save();
      const gift = buildFromBlueprint(bpId, new Rng(0x5EED + meta.data.stats.runs),
        (slot, rarity) => this.loot.factory.make(slot, rarity));
      if (gift) {
        equip.slots[gift.slot] = gift;
        w.emit(new ToastEvent(`📜 铸台出品「${blueprintOf(bpId)?.name ?? ''}」:${gift.name}!`, RARITY_COLORS.legendary));
      } else {
        w.emit(new ToastEvent('📜 铸台:图纸记录已失效(数据更新过),碎片已退', UI.gold));
        meta.data.blueprintShards += balance.blueprint.craftCost;
        meta.save();
      }
    } else if (meta.data.craftQueued) {
      // 旧档兜底:布尔口径(随机橙装)
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
    markRuneOwned(meta.data.codex, gift.id);

    // 挑战词条:初始药剂增减
    playerComp.potionCharges = Math.max(0, playerComp.potionCharges + runMods.eff.potion);

    clock.reset();
    this.wasNight = false;
    meta.data.stats.runs++;
    meta.save();
    if (runMods.active) {
      const tag = runMods.mode === 'weekly' ? '🏅 周常挑战' : '🗓 每日挑战';
      this.world.emit(new ToastEvent(
        `${tag} ${runMods.label}:${runMods.mods.map((m) => m.name).join(' · ')}`,
        runMods.mode === 'weekly' ? '#8fd4c8' : '#e8c07a',
      ));
    }
    this.run.startRoom(w, 'battle', this.playerE);
    const ptr = w.mustGet(this.playerE, Transform);
    this.renderer.camera.snap(ptr.x, ptr.y);
    this.state = 'run';
  }

  // ---------- 星陨营地(主城) ----------

  /** 进入营地:可行走大厅 + 木桩试招 + 四功能建筑 */
  private enterCamp(): void {
    this.paused = false;
    this.state = 'camp';
    this.bgHasTile = false;
    this.wasInWater = false;
    terrain.clear(); // 营地没有房间地形
    this.run.layout = null;
    const klass = this.campUI.selectedClass;
    this.world = new World();
    this.feedback = new FeedbackSystem(this.loop, this.renderer.camera);
    this.skills = new SkillSystem(this.input, klass, this.renderer);
    this.playerSystem = new PlayerSystem(this.input, this.renderer);
    this.playerSystem.aimAssist.reset(); // 新一局:清掉上一局的锁定目标(实体 id 会复用)
    this.systems = [
      this.playerSystem,
      this.skills,
      new PhysicsSystem(),
      new ProjectileSystem(),
      new CombatSystem(),
      new ZoneSystem(),
      this.feedback,
    ];

    const w = this.world;
    const B = balance.player;
    const W = balance.arena.widthM;
    const H = balance.arena.heightM;

    // 主角
    this.playerE = w.create();
    w.add(this.playerE, new Transform((W / 2 - 4) * M, (H / 2) * M));
    w.add(this.playerE, new Velocity());
    w.add(this.playerE, new Body(B.bodyRadius));
    w.add(this.playerE, new Health(B.hp));
    w.add(this.playerE, new Stats(B.atk, B.moveSpeed, B.critRate, B.critDmg));
    w.add(this.playerE, new Faction('player'));
    const pc = new Player();
    pc.klass = klass;
    w.add(this.playerE, pc);
    w.add(this.playerE, new Inventory());
    w.add(this.playerE, new Equipment());
    recompute(w, this.playerE);
    // 营地里怒气拉满,随便放大招试手感
    pc.rage = 100;

    // 功能建筑
    const station = (kind: 'expedition' | 'altar' | 'forge' | 'classpick' | 'daily' | 'codex' | 'achv', label: string, icon: string, x: number, y: number): void => {
      const e = w.create();
      w.add(e, new Transform(x * M, y * M));
      w.add(e, new CampStation(kind, label, icon));
    };
    station('expedition', '远征传送门', '🌀', W - 3.2, H / 2);
    station('altar', '星陨祭坛', '⭐', 4.6, 3.0);
    station('forge', '星辉铸台', '📜', 4.6, H - 3.0);
    station('classpick', '职业试炼场', '🏵', W / 2, 2.2);
    station('daily', '混沌祭坛', '🗓', W / 2, H - 2.4);
    station('codex', '星陨图鉴', '📖', W - 4.6, H - 3.0);
    station('achv', '星陨殿堂', '🏆', W - 4.6, 3.0);

    this.feedback.hitsTaken = 0;
    // 进营地顺手补判一次(老档/上局遗留的成就一次性追上)
    this.awardAchievements();

    // 训练木桩 ×2(不死,DPS 计)
    for (const dy of [-2.2, 2.2]) {
      const e = w.create();
      w.add(e, new Transform((W / 2 + 3.5) * M, (H / 2 + dy) * M));
      w.add(e, new Velocity());
      w.add(e, new Body(0.35, true));
      w.add(e, new Health(99999));
      w.add(e, new Stats(0, 0, 0, 1, 0));
      w.add(e, new Faction('enemy'));
      w.add(e, new Dummy());
      w.add(e, new ElementMarks());
      w.add(e, new Buffs());
    }

    // 营地装饰
    const deco = (kind: 'tree' | 'rock' | 'bush', x: number, y: number): void => {
      const e = w.create();
      w.add(e, new Transform(x * M, y * M));
      w.add(e, new PropObstacle(kind));
      if (kind !== 'bush') {
        w.add(e, new Velocity());
        w.add(e, new Body(kind === 'tree' ? 0.45 : 0.4, true));
      }
    };
    deco('tree', 2.0, 1.6);
    deco('tree', W - 2.0, 1.8);
    deco('tree', 2.2, H - 1.6);
    deco('tree', W - 5.5, H - 1.8);
    deco('bush', 8, 2.0);
    deco('bush', W - 8, H - 2.0);
    deco('bush', 9, H - 2.4);
    deco('rock', W / 2 - 5, H - 2.6);

    this.renderer.camera.snap((W / 2) * M, (H / 2) * M);
    this.world.emit(new ToastEvent('🏕 星陨营地:打木桩试招,走近建筑按 F', UI.gold));
  }

  // ---- 新手引导(meta/Tutorial.ts)的轮询状态 ----
  /** 本步骤内累计移动距离(px),用于"走两步"判定 */
  private tutMoveAcc = 0;
  private tutPrevX = 0;
  private tutPrevY = 0;
  /** 上一帧的 cdQ,用于检测"真的放出了一个技能" */
  private tutPrevCdQ = 0;

  /**
   * 引导推进:每帧调用(营地与局内都算)。
   * 用**轮询**而不是往每个动作里插通知:翻滚/技能/背包的起手点分散在 4 个模块,
   * 插通知要改 4 处且容易漏;轮询只读已存在的状态,漏不掉。
   */
  private tickTutorial(): void {
    if (tutorial.done) return;
    const tr = this.world.get(this.playerE, Transform);
    const p = this.world.get(this.playerE, Player);
    if (!tr || !p) return;

    const step = tutorial.current;
    if (!step) return;

    // 走动:累计位移(不要求方向,站着不动不算)
    if (step.id === 'move') {
      const d = Math.hypot(tr.x - this.tutPrevX, tr.y - this.tutPrevY);
      if (d > 0.5 && d < 30) this.tutMoveAcc += d; // 过滤瞬移/传送门
      if (this.tutMoveAcc >= balance.tutorial.moveM * M) this.completeTutorial('move');
    }
    this.tutPrevX = tr.x;
    this.tutPrevY = tr.y;

    // 翻滚:翻滚中(有无敌帧)
    if (step.id === 'dash' && p.dashT > 0) this.completeTutorial('dash');

    // 技能:cdQ 由 0 变为正 = 真的放出了一个技能(营地木桩上也能放)
    if (step.id === 'skill' && this.tutPrevCdQ <= 0 && p.cdQ > 0) this.completeTutorial('skill');
    this.tutPrevCdQ = p.cdQ;

    // 背包:面板打开过
    if (step.id === 'bag' && this.inventoryUI.open) this.completeTutorial('bag');

    // 祭坛:在营地里对祭坛做了强化(由 CampUI 的 altar 面板消费按键触发,见 updateCamp)
  }

  /** 完成一步:落盘 + 即时反馈 */
  private completeTutorial(id: 'move' | 'dash' | 'skill' | 'bag' | 'altar'): void {
    if (!tutorial.notify(id)) return;
    meta.data.tutorial = tutorial.snapshot();
    meta.save();
    const next = tutorial.current;
    this.world.emit(new ToastEvent(
      next ? `✅ 引导 ${tutorial.displayIndex - 1}/5 完成 → 下一步:${next.title}` : '🎉 引导完成!去「远征」开一局吧',
      '#5FD068',
    ));
    if (!next) this.world.emit(new SfxEvent('ult'));
  }

  /** 最近的可交互建筑(<1.3m) */
  private campNear(): number | null {
    const ptr = this.world.get(this.playerE, Transform);
    if (!ptr) return null;
    let best: number | null = null;
    let bd = 1.3 * M;
    for (const e of this.world.query(CampStation, Transform)) {
      const tr = this.world.mustGet(e, Transform);
      const d = Math.hypot(ptr.x - tr.x, ptr.y - tr.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /** 把玩家当前状态喂给触屏按钮(冷却/药剂/怒气) */
  private syncTouchHud(): void {
    const p = this.world.get(this.playerE, Player);
    if (!p) return;
    // 冷却上限从技能表读(与 HUD 的技能条同一来源,不写第二份)
    // 原地改:这个函数每帧跑,不能顺手 new 一堆小对象(移动端 GC 抖动就是这么来的)
    const sk = this.touch.hud.skills;
    sk.q.cd = Math.max(0, p.cdQ);
    sk.q.max = this.skills.cooldownOf('Q');
    sk.e.cd = Math.max(0, p.cdE);
    sk.e.max = this.skills.cooldownOf('E');
    sk.rr.cd = Math.max(0, p.cdR);
    sk.rr.max = this.skills.cooldownOf('R');
    this.touch.hud.potion = p.potionCharges;
    this.touch.hud.cons = {
      shield: p.consumables.filter((x) => x === 'shield').length,
      cleanse: p.consumables.filter((x) => x === 'cleanse').length,
      timeslow: p.consumables.filter((x) => x === 'timeslow').length,
    };
    this.touch.hud.rReady = p.rage >= RAGE_FOR_R && p.cdR <= 0;
  }

  /** 自动攻击用:锁定的敌人在普攻射程内吗(射程来自 basicSpec,不写死) */
  private aimTargetInRange(): boolean {
    const target = this.playerSystem.aimAssist.target;
    if (!target) return false;
    const p = this.world.get(this.playerE, Player);
    if (!p) return false;
    const spec = basicSpec(p.klass, balance);
    return inAutoAttackRange(target.d, basicRangePx(spec, M), balance.touch.autoAttackPadM * M);
  }

  private updateCamp(dt: number): void {
    this.campNearE = this.campNear();
    this.touch.update(this.renderer.width, this.renderer.height, {
      interact: this.campNearE !== null, night: false,
    });

    // 引导跳过键:H(固定键,不可改绑)
    if (!tutorial.done && this.input.wasPressed(balance.tutorial.skipKey)) {
      tutorial.skip();
      meta.data.tutorial = tutorial.snapshot();
      meta.save();
      this.world.emit(new ToastEvent('已跳过新手引导(设置里可重看)', '#8f98b2'));
    }

    // 设置面板(营地 Esc 直接打开;含"返回标题"按钮)
    if (this.settingsUI.open) {
      if (this.settingsUI.update() === 'title') this.state = 'menu';
      this.input.endFrame();
      return;
    }

    // 面板层优先消费输入(本帧开着就整帧消费,防 Esc/F 穿透)
    const panelWasOpen = this.campUI.panel !== 'none';
    const act = this.campUI.update();
    if (act === 'start') {
      runMods.clear();
      this.startRun();
      this.input.endFrame();
      return;
    }
    if (act === 'startDaily') {
      // 当日词条只在本局生效;章节固定第一章(全服同种子可比)
      this.campUI.selectedChapter = 1;
      runMods.set(this.campUI.daily.key, this.campUI.daily.mods);
      this.startRun('daily');
      this.input.endFrame();
      return;
    }
    if (act === 'startWeekly') {
      // 周常:每日词条之上再叠本周铁律(结构性:多一波怪/商店关门/祭坛失效…)
      this.campUI.selectedChapter = 1;
      runMods.setWeekly(this.campUI.weekly.key, this.campUI.weekly);
      this.startRun('weekly');
      this.input.endFrame();
      return;
    }
    if (act === 'classChanged') {
      this.enterCamp();
      this.input.endFrame();
      return;
    }
    if (act === 'crafted') {
      // 学会/铸造都算铸台动作:成就看的是 crafts 计数(见 meta/Achievements.ts)
      this.awardAchievements();
      this.input.endFrame();
      return;
    }
    if (panelWasOpen) {
      this.input.endFrame();
      return;
    }

    // Esc/O/⚙ → 设置(回标题的入口在设置面板里)
    if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyO') || this.clickIn(this.gearRect)) {
      this.settingsUI.showQuitToTitle = true;
      this.settingsUI.open = true;
      this.input.endFrame();
      return;
    }

    // F 交互
    if (this.campNearE !== null && (this.input.wasPressed(bindOf('interact')) || this.input.wasPressed('PadB'))) {
      const st = this.world.mustGet(this.campNearE, CampStation);
      // 引导第 5 步:走到祭坛前交互就算学会(强化本身还要花钱,不强制消费)
      if (st.kind === 'altar') this.completeTutorial('altar');
      this.campUI.open(st.kind);
    }

    for (const s of this.systems) s.update(this.world, dt);
    this.tickTutorial();

    // 计时器衰减(受击闪白/印记/木桩晃动)
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
    for (const e of this.world.query(Dummy)) {
      const d = this.world.mustGet(e, Dummy);
      d.wobble = Math.max(0, d.wobble - dt * 2.2);
      d.wobblePhase += dt * (2 + d.wobble * 14);
      const hp = this.world.mustGet(e, Health);
      hp.hp = hp.max; // 木桩不死
    }

    const ptr = this.world.mustGet(this.playerE, Transform);
    this.renderer.camera.follow(ptr.x, ptr.y, dt);
    this.renderer.camera.update(dt);
    this.world.clearEvents();
    this.world.flushDestroyed();
    this.input.endFrame();
  }

  /** 右上角⚙齿轮按钮(标题/营地通用入口) */
  private drawGear(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
    this.gearRect = { x: width - 54, y: 14, w: 40, h: 40 };
    ctx.save();
    ctx.fillStyle = 'rgba(26,31,48,0.85)';
    ctx.fillRect(this.gearRect.x, this.gearRect.y, 40, 40);
    ctx.strokeStyle = '#3a4154';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.gearRect.x, this.gearRect.y, 40, 40);
    ctx.fillStyle = UI.text;
    ctx.font = '20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚙', this.gearRect.x + 20, this.gearRect.y + 27);
    ctx.restore();
  }


  /** 双帧动画:第二帧存在则 8fps 交替(needMove=仅移动中切帧) */
  /**
   * 杂兵两帧走路的帧名(`{base}` / `{base}_f2`)。
   * 交替节奏在 `anim.ts twoFrame` 里(推导自 `balance.anim.walk`)——
   * **这里不再自己写 `floor(t*8)%2`**:两份实现会漂成两种心跳(杂兵 vs 玩家)。
   * 速度阈值判定留在场景层:纯函数不该知道世界查询。
   */
  private frame2(base: string, e: number, needMove: boolean): string {
    let moving = true;
    if (needMove) {
      const v = this.world.get(e, Velocity);
      moving = !!v && Math.hypot(v.vx, v.vy) >= 30;
    }
    return twoFrame(base, clock.runTime, (n) => sprites.get(n) !== null, moving);
  }

  /**
   * 引导提示条(屏幕下方居中):步骤序号 + 当前文案 + 跳过键。
   * 文案里的按键在 `meta/Tutorial.formatHint` 里替换成**当前绑定** —— 改过键也不会指错。
   */
  private renderTutorialHint(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const step = tutorial.current;
    if (!step) return;
    const text = formatHint(step.hint);
    const y = height * balance.tutorial.hintY;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '12px monospace';
    const w = Math.max(ctx.measureText(text).width, 260) + 40;
    ctx.globalAlpha = 0.92;
    if (!drawPanel9(ctx, width / 2 - w / 2, y - 18, w, 30)) {
      ctx.fillStyle = UI.panel;
      ctx.fillRect(width / 2 - w / 2, y - 18, w, 30);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 12px monospace';
    ctx.fillText(`新手引导 ${tutorial.displayIndex}/${TUTORIAL_TOTAL} · ${step.title}`, width / 2, y + 1);
    ctx.fillStyle = UI.text;
    ctx.font = '12px monospace';
    ctx.fillText(text, width / 2, y + 16);
    ctx.fillStyle = UI.dim;
    ctx.font = '10px monospace';
    ctx.fillText(`[${keyLabel(balance.tutorial.skipKey)}] 跳过引导`, width / 2, y + 30);
    ctx.restore();
  }

  private renderCampHud(): void {
    const ctx = this.renderer.ctx;
    const width = this.renderer.width;
    const height = this.renderer.height;
    ctx.save();
    ctx.fillStyle = UI.panel;
    ctx.fillRect(14, 14, 330, 30);
    ctx.fillStyle = UI.gold;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    const kls = balance.classes[this.campUI.selectedClass];
    ctx.fillText(`🏕 星陨营地 · ${kls.hero}·${kls.name}`, 24, 34);
    this.renderTutorialHint(ctx, width, height);
    ctx.textAlign = 'right';
    ctx.fillText(`✦ ${meta.data.stardust} · 📜 ${meta.data.blueprintShards}/${balance.blueprint.craftCost}${meta.data.craftQueued ? '(已预订)' : ''}`, width - 20, 34);
    ctx.textAlign = 'center';
    ctx.fillStyle = UI.dim;
    ctx.font = '11px monospace';
    ctx.fillText(
      this.input.touchActive
        ? '木桩试招 · 走近建筑点 F 钮 · 🌀出征 · 🗓每日/🏅周常挑战'
        : '木桩试招(怒气满可放R) · 走近建筑按 [F] · 🌀出征 · 🗓每日/🏅周常挑战 · [Esc]设置',
      width / 2, height - 12,
    );
    ctx.restore();
  }

  /** 结算/交互后统一判定成就:返回本次新解锁的成就并弹提示 */
  private awardAchievements(): void {
    const fresh = checkUnlocks(meta.data, Date.now());
    for (const a of fresh) {
      this.world.emit(new ToastEvent(`🏆 成就解锁「${a.icon} ${a.name}」`, '#ffd94f'));
    }
    if (fresh.length > 0) meta.save();
  }

  private endRun(victory: boolean): void {
    const p = this.world.mustGet(this.playerE, Player);
    const isEndless = this.run.endless;
    // 无尽:层数跨循环连续(用进入过的房间数,不是 chapter 内的 depth)
    const endlessFloor = isEndless ? this.run.floor : 0;
    const endlessRecord = isEndless && isNewRecord(endlessFloor, {
      clears: meta.data.stats.clears, bestFloor: meta.data.endlessBest, bestLoop: meta.data.endlessBestLoop,
    });
    this.lastStats = {
      victory,
      rooms: isEndless ? this.run.roomsEntered : this.run.depth + 1,
      kills: this.feedback.kills,
      timeS: clock.runTime,
      stardustGained: p.stardust,
      hitsTaken: this.feedback.hitsTaken,
      maxHit: this.feedback.maxHit,
      endlessFloor,
      endlessLoop: isEndless ? this.run.loop : 0,
      endlessRecord,
    };
    if (isEndless) {
      // 无尽成绩**无论胜败都记**(这个模式没有"胜利",只有撑到第几层)
      const prog = { clears: meta.data.stats.clears, bestFloor: meta.data.endlessBest, bestLoop: meta.data.endlessBestLoop };
      const next = recordRun(endlessFloor, this.run.loop, prog);
      meta.data.endlessBest = next.bestFloor;
      meta.data.endlessBestLoop = next.bestLoop;
      if (endlessRecord) {
        this.world.emit(new ToastEvent(`♾ 新纪录:${floorLabel(endlessFloor)}(循环 ${this.run.loop + 1})`, RARITY_COLORS.legendary));
      }
    }
    meta.data.stardust += p.stardust;
    meta.data.pity = this.loot.factory.pityCount;
    meta.data.stats.totalKills += this.feedback.kills;
    if (victory) {
      meta.data.stats.clears++;
      if (this.feedback.hitsTaken === 0) meta.data.stats.noHitClears++; // 无伤通关
      // 深渊层通关(轮 23):逐层计数 —— 深渊 II 的解锁看的是深渊 I 的通关数,不能只存总数
      const before = { clears: meta.data.stats.clears - 1, abyssClears: meta.data.abyssClears };
      if (runMods.abyss > ABYSS_NORMAL) {
        meta.data.abyssClears = [...recordClear(runMods.abyss, before).abyssClears];
      }
      const unlocked = newlyUnlocked(before, { clears: meta.data.stats.clears, abyssClears: meta.data.abyssClears });
      if (unlocked !== null) {
        this.world.emit(new ToastEvent(`🔓 解锁「${levelName(unlocked)}」—— 营地里可选`, RARITY_COLORS.legendary));
      }
      if (meta.data.stats.bestTimeS === 0 || clock.runTime < meta.data.stats.bestTimeS) {
        meta.data.stats.bestTimeS = clock.runTime;
      }
    }
    // 挑战记录:每日按当天键、周常按当周键(过期自动作废,只保留当期最佳)
    if (this.runMode !== 'off' && runMods.active) {
      const rec = this.runMode === 'weekly' ? meta.data.weekly : meta.data.daily;
      const sameKey = rec.key === runMods.key;
      const fresh = { key: runMods.key, cleared: victory, bestTimeS: victory ? clock.runTime : 0, bestKills: this.feedback.kills };
      if (!sameKey) {
        if (this.runMode === 'weekly') meta.data.weekly = fresh;
        else meta.data.daily = fresh;
      } else {
        if (victory) rec.cleared = true;
        if (victory && (rec.bestTimeS === 0 || clock.runTime < rec.bestTimeS)) rec.bestTimeS = clock.runTime;
        rec.bestKills = Math.max(rec.bestKills, this.feedback.kills);
      }
      if (victory) {
        if (this.runMode === 'weekly') meta.data.stats.weeklyClears++;
        else meta.data.stats.dailyClears++;
      }
      meta.save();
    }
    // 本地排行榜:每次出征提交一次(未通关也能进击杀/单次伤害榜;回放不会重复刷)
    const submitted = submitRun(meta.data, {
      cleared: victory,
      noHit: this.feedback.hitsTaken === 0,
      timeS: victory ? clock.runTime : 0,
      kills: this.feedback.kills,
      maxHit: Math.round(this.feedback.maxHit),
      klass: p.klass,
      chapter: this.run.chapter,
      tag: this.runMode === 'off' ? '' : `${this.runMode}:${runMods.key}`,
      at: Date.now(),
    });
    // 榜上有名:四条榜都能看到新记录才值得弹提示
    const boards = Object.keys(submitted) as BoardId[];
    if (boards.length > 0) {
      const names = boards.map((b) => BOARD_LABEL[b]).join(' · ');
      this.world.emit(new ToastEvent(`🥇 已记入排行榜:${names}`, '#e8c07a'));
    }
    this.runMode = 'off';
    // 结算时统一判定成就(首次通关/极速/无伤/击杀里程碑/每日挑战等)
    this.awardAchievements();
    meta.save();
    this.state = 'results';
    runMods.clear(); // 词条随本局结束失效(下一局由进入路径重新 set)
  }

  // ---------- 更新 ----------

  update(dt: number): void {
    this.menuT += dt;

    this.input.pollGamepad(dt);
    this.input.tickTouch(dt);

    // ---- 界面缩放同步(设置里改动即时生效) ----
    const uiScale = meta.data.settings.uiScale;
    if (this.renderer.uiScale !== uiScale) {
      this.renderer.setUiScale(uiScale);
      this.input.pointerScale = 1 / this.renderer.uiScale;
      this.bg = this.bakeBackground(); // 逻辑分辨率变了,重烘焙背景无损
    }

    // ---- BGM:按场景选曲(同曲无操作,引擎内前瞻调度) ----
    music.play(
      this.state === 'run'
        ? (this.run.roomKind === 'boss' ? 'boss' : (`ch${this.run.chapter}` as 'ch1' | 'ch2' | 'ch3'))
        : 'camp',
    );
    music.tick();
    if (this.state === 'menu') {
      // 标题页也能开设置(Esc/O/右下⚙)
      if (this.settingsUI.open) {
        this.settingsUI.update();
        this.input.endFrame();
        return;
      }
      if (this.input.wasPressed('Escape') || this.input.wasPressed('KeyO') || this.clickIn(this.gearRect)) {
        this.settingsUI.showQuitToTitle = false;
        this.settingsUI.open = true;
        this.input.endFrame();
        return;
      }
      const menuAct = this.menuUI.updateMenu();
      if (menuAct === 'slotChanged') {
        // 换存档槽:引导进度与其他局外状态都得跟着换(否则会把 A 档的引导带进 B 档)
        tutorial.restore(meta.data.tutorial);
        this.tutMoveAcc = 0;
        this.world.emit(new ToastEvent(`已切到存档 ${meta.slotIndex + 1}`, '#8f98b2'));
      } else if (menuAct === 'start') this.enterCamp();
      this.input.endFrame();
      return;
    }
    if (this.state === 'results') {
      if (this.menuUI.updateResults() === 'menu') this.enterCamp();
      this.input.endFrame();
      return;
    }
    if (this.state === 'camp') {
      this.updateCamp(dt);
      return;
    }

    // ---- run ----
    // 触屏按钮先注入(复用键盘语义,后续逻辑零改动)。
    // 按钮上的冷却/药剂数量、以及"锁定目标是否在普攻射程内"(自动攻击用)都在这里喂进去 ——
    // 瞄准助手是玩家系统的**唯一真相**:HUD 显示的目标就是真正打的目标。
    this.syncTouchHud();
    this.touch.update(this.renderer.width, this.renderer.height, {
      interact: this.shop.nearbyStand !== null || this.shop.nearbyMerchant !== null
        || this.events.nearbyTotem !== null,
      night: clock.isNight(),
      targetInRange: this.aimTargetInRange(),
    });
    const uiConsumed = this.inventoryUI.handleInput(this.world, this.playerE);
    if (uiConsumed) {
      this.input.endFrame();
      return;
    }

    // ---- 暂停菜单(Esc/手柄Start;背包打开时 Esc 优先关背包;设置面板打开时 Esc 归它) ----
    if (!this.settingsUI.open && (this.input.wasPressed('Escape') || this.input.wasPressed('PadStart'))) {
      this.paused = !this.paused;
    }
    if (this.paused) {
      // 设置面板独占输入
      if (this.settingsUI.open) {
        this.settingsUI.update();
        this.input.endFrame();
        return;
      }
      if (this.input.wasPressed('KeyM')) {
        this.muted = !this.muted;
        sfx.setVolume(this.muted ? 0 : meta.data.settings.sfxVol);
        music.setVolume(this.muted ? 0 : meta.data.settings.musicVol);
      }
      if (this.input.wasPressed('KeyO')) {
        this.settingsUI.showQuitToTitle = false;
        this.settingsUI.open = true;
      }
      if (this.input.wasPressed('Backspace')) {
        this.paused = false;
        this.endRun(false);
        this.input.endFrame();
        return;
      }
      // 点击:设置按钮 / 放弃按钮 / 其他任意处继续
      if (this.input.mousePressed) {
        const mx = this.input.mouseX;
        const my = this.input.mouseY;
        const sR = this.settingsRect;
        const q = this.quitRect;
        if (mx >= sR.x && mx <= sR.x + sR.w && my >= sR.y && my <= sR.y + sR.h) {
          this.settingsUI.showQuitToTitle = false;
          this.settingsUI.open = true;
        } else if (mx >= q.x && mx <= q.x + q.w && my >= q.y && my <= q.y + q.h) {
          this.paused = false;
          this.endRun(false);
        } else {
          this.paused = false;
        }
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
    if (night && (this.input.wasPressed(bindOf('lantern')) || this.input.wasPressed('PadDown'))) {
      const p0 = this.world.mustGet(this.playerE, Player);
      const cost = this.run.chapterCfg.lanternCost;
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

    // 浅滩提示:第一次趟水时提示一次(机制要有教学,否则玩家只当是贴图)
    if (terrain.hasWater) {
      const ptr = this.world.mustGet(this.playerE, Transform);
      const inWater = terrain.isWater(ptr.x, ptr.y);
      if (inWater && !this.wasInWater) {
        this.world.emit(new ToastEvent(`💧 浅滩:移动 ×${balance.layouts.terrain.waterMoveMult} · 雷击 ×${balance.layouts.terrain.waterBoltAmp} 并麻痹`, '#7fd6d6'));
      }
      this.wasInWater = inWater;
    } else {
      this.wasInWater = false;
    }

    const outcome = this.run.update(this.world, dt, this.playerE);
    if (outcome === 'victory') {
      this.endRun(true);
      return;
    }
    if (outcome === 'loop') {
      // 无尽:章节循环 + 乘区递增,不清结算(玩家会一路打到自己死)
      this.run.nextLoop(this.world, this.playerE);
      this.bgHasTile = false;
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
    if (!this.bgHasTile && sprites.get(this.run !== undefined && this.run.chapter === 3 ? 'sand_tile' : this.run !== undefined && this.run.chapter === 2 ? 'snow_tile' : 'grass_tile')) {
      this.bgHasTile = true;
      this.bg = this.bakeBackground();
    }
    // 换房 = 换布局:地面装饰(浅滩/苔痕/土路/砂地)跟着换
    const layoutKey = this.state === 'run' ? this.run.layoutKey : 'camp';
    if (layoutKey !== this.bgLayoutKey) {
      this.bgLayoutKey = layoutKey;
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
      drawSprite(r.ctx, KLASS_SPRITE[this.campUI.selectedClass], r.width / 2 - 240, r.height * 0.30, {
        scale: 3.2, rot: Math.sin(this.menuT * 1.6) * 0.03, sy: 1 + Math.sin(this.menuT * 3.2) * 0.015,
      });
      drawSprite(r.ctx, 'boss_nanmir', r.width / 2 + 265, r.height * 0.33, {
        scale: 1.35, faceLeft: true, alpha: 0.85, sy: 1 + Math.sin(this.menuT * 2.2) * 0.02,
      });
      this.menuUI.renderMenu(r.ctx, r.width, r.height, this.menuT);
      this.drawGear(r.ctx, r.width, r.height);
      if (this.settingsUI.open) this.settingsUI.render(r.ctx, r.width, r.height);
      return;
    }

    this.renderWorld(alpha);

    if (this.state === 'camp') {
      this.renderCampHud();
      this.drawGear(r.ctx, r.width, r.height);
      this.touch.render(r.ctx, r.width, r.height);
      this.campUI.render(r.ctx, r.width, r.height);
      if (this.settingsUI.open) this.settingsUI.render(r.ctx, r.width, r.height);
      return;
    }

    if (this.state === 'results') {
      this.menuUI.renderResults(r.ctx, r.width, r.height, this.lastStats);
      return;
    }

    this.renderHud();
    this.touch.render(r.ctx, r.width, r.height);
    this.feedback.renderScreen(r.ctx, r.width, r.height);
    this.inventoryUI.render(r.ctx, this.world, this.playerE, r.width, r.height);

    // ---- 暂停遮罩 / 设置面板 ----
    if (this.paused) {
      if (this.settingsUI.open) {
        this.settingsUI.render(r.ctx, r.width, r.height);
        return;
      }
      const ctx = r.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(13,15,26,0.78)';
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = UI.gold;
      ctx.font = 'bold 30px monospace';
      ctx.fillText('⏸ 暂停', r.width / 2, r.height * 0.34);
      ctx.fillStyle = UI.text;
      ctx.font = '14px monospace';
      const kl = (a: string): string => keyLabel(bindOf(a));
      const lines = this.input.touchActive
        ? ['点击屏幕任意处继续', '', '左半屏拖动=移动(自动瞄准)', '右下按钮=普攻/翻滚/技能']
        : [
            '[Esc] 继续战斗',
            `[M] 静音开关:${this.muted ? '已静音 🔇' : '开启 🔊'}`,
            '[Backspace] 放弃本局(结算)',
            '',
            `WASD移动 · 左键普攻 · ${kl('dash')}翻滚 · ${kl('q')}/${kl('e')}/${kl('r')}技能`,
            `${kl('bag')}背包/符文 · ${kl('potion')}药剂 · ${kl('interact')}交互 · ${kl('lantern')}星灯(夜)`,
          ];
      lines.forEach((l, i) => ctx.fillText(l, r.width / 2, r.height * 0.43 + i * 26));

      // 设置按钮
      const by = r.height * 0.43 + lines.length * 26 + 14;
      this.settingsRect = { x: r.width / 2 - 90, y: by, w: 180, h: 38 };
      ctx.fillStyle = '#1f2537';
      ctx.fillRect(this.settingsRect.x, this.settingsRect.y, 180, 38);
      ctx.strokeStyle = UI.gold;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.settingsRect.x, this.settingsRect.y, 180, 38);
      ctx.fillStyle = UI.gold;
      ctx.font = 'bold 14px monospace';
      ctx.fillText('⚙ 设置 [O]', r.width / 2, by + 25);

      // 放弃按钮(触屏/鼠标可点)
      this.quitRect = { x: r.width / 2 - 90, y: by + 50, w: 180, h: 38 };
      ctx.fillStyle = '#2a1a1f';
      ctx.fillRect(this.quitRect.x, this.quitRect.y, this.quitRect.w, this.quitRect.h);
      ctx.strokeStyle = UI.hpLow;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.quitRect.x, this.quitRect.y, this.quitRect.w, this.quitRect.h);
      ctx.fillStyle = UI.hpLow;
      ctx.font = 'bold 14px monospace';
      ctx.fillText('🏳 放弃本局', r.width / 2, this.quitRect.y + 25);
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
          if (!drawSprite(ctx, this.frame2('shroomling', e, false), ix, iy, {
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
          if (!drawSprite(ctx, this.frame2('windbee', e, false), ix, iy - 10 + Math.sin(b.animT * 9) * 3, {
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
          if (!drawSprite(ctx, this.frame2('blightwolf', e, true), ix, iy, {
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

      // ---- 第二章:冰原怪 ----
      for (const e of w.query(SnowPuff, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const s = w.mustGet(e, SnowPuff);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 9);
          const rolling = s.rollT > 0;
          if (!drawSprite(ctx, 'snowpuff', ix, iy, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: rolling ? s.animT * 9 : Math.sin(s.animT * 4) * 0.08,
            sy: rolling ? 1 : 1 + Math.sin(s.animT * 5) * 0.06,
          })) blob(ix, iy, 11, '#eef6fa');
        } });
      }
      for (const e of w.query(IceTurtle, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const t = w.mustGet(e, IceTurtle);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 15);
          const jit = t.state === 'telegraph' ? (Math.random() - 0.5) * 0.2 : 0;
          if (!drawSprite(ctx, 'iceturtle', ix, iy, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: t.state === 'spin' ? t.animT * 11 : jit,
            sy: 1 + Math.sin(t.animT * 2.5) * 0.03,
          })) blob(ix, iy, 15, '#8fdcff');
        } });
      }
      for (const e of w.query(BlizzardHawk, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const hk = w.mustGet(e, BlizzardHawk);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 7);
          const hover = Math.sin(hk.animT * 7) * 3 - 12;
          const jit = hk.state === 'telegraph' ? (Math.random() - 0.5) * 0.24 : 0;
          const lean = hk.state === 'dive' ? (Math.cos(tr.face) < 0 ? 0.3 : -0.3) : 0;
          if (!drawSprite(ctx, 'blizzardhawk', ix, iy + hover, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0, rot: jit + lean,
            sx: hk.state === 'dive' ? 1.15 : 1,
          })) blob(ix, iy + hover, 10, '#dfe8f2');
        } });
      }
      for (const e of w.query(FrostMage, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const mg = w.mustGet(e, FrostMage);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 9);
          const jit = mg.state === 'aim' ? (Math.random() - 0.5) * 0.16 : 0;
          if (!drawSprite(ctx, 'frostmage', ix, iy, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: jit + Math.sin(mg.animT * 3) * 0.05,
            sx: mg.state === 'aim' ? 1.1 : 1,
          })) blob(ix, iy, 11, '#8fdcff');
        } });
      }
      for (const e of w.query(BossVelsha, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const boss = w.mustGet(e, BossVelsha);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 26);
          const hover = Math.sin(boss.animT * 2.2) * 5 - 8;
          const jit = boss.state === 'chargeTele' ? (Math.random() - 0.5) * 0.14 : 0;
          const lean = boss.state === 'charge' ? (Math.cos(tr.face) < 0 ? 0.16 : -0.16) : 0;
          if (!drawSprite(ctx, 'boss_velsha', ix, iy + hover, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: jit + lean + Math.sin(boss.animT * 1.4) * 0.03,
            sy: 1 + Math.sin(boss.animT * 2.8) * 0.02 + (boss.phase === 3 ? 0.03 : 0),
          })) blob(ix, iy + hover, 30, '#8fdcff');
        } });
      }

      // ---- 第一章中 Boss:苔冠巨鹿(站立/冲锋双帧) ----
      for (const e of w.query(MidBossStag, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const st = w.mustGet(e, MidBossStag);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 26);
          // 冲锋/预警时用第二帧(低头顶角),其余时候站立帧;慢走也换帧做"蹄步"节奏
          const moving = st.state === 'stalk';
          const frame = st.state === 'charge' || st.state === 'chargeWind'
            ? 'midboss_mossstag_f2' : this.frame2('midboss_mossstag', e, moving);
          const jit = st.state === 'chargeWind' ? (Math.random() - 0.5) * 0.12 : 0;
          const lean = st.state === 'charge' ? (Math.cos(tr.face) < 0 ? 0.14 : -0.14) : 0;
          const proud = st.phase === 2 ? 0.06 : 0;   // 狂怒:苔冠压低、身体前倾
          if (!drawSprite(ctx, frame, ix, iy, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: jit + lean + proud + (st.state === 'stagger' ? 0.22 : 0),
          })) blob(ix, iy, 24, '#8fd45f');
          // 狂怒苔雾:一层脉动的绿光,提示"它变强了"
          if (st.phase === 2) {
            ctx.save();
            ctx.globalAlpha = 0.16 + Math.sin(st.animT * 5) * 0.06;
            ctx.fillStyle = '#8fd45f';
            ctx.beginPath();
            ctx.ellipse(ix, iy - 26, 40, 26, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }
        } });
      }

      // ---- 第三章:荒漠怪 ----
      for (const e of w.query(CinderRat, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const r0 = w.mustGet(e, CinderRat);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 8);
          if (!drawSprite(ctx, this.frame2('cinderrat', e, true), ix, iy, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: Math.sin(r0.animT * 14) * 0.1,
          })) blob(ix, iy, 9, '#ff9a6b');
        } });
      }
      for (const e of w.query(DuneBeetle, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const b = w.mustGet(e, DuneBeetle);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          if (b.state === 'burrow') {
            // 地下:移动沙丘
            ctx.fillStyle = 'rgba(90,70,40,0.45)';
            ctx.beginPath();
            ctx.ellipse(ix, iy, 16, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(140,110,60,0.5)';
            ctx.beginPath();
            ctx.ellipse(ix, iy - 3, 10, 5, 0, 0, Math.PI * 2);
            ctx.fill();
            return;
          }
          drawShadow(ctx, ix, iy, 14);
          const jit = b.state === 'telegraph' ? (Math.random() - 0.5) * 0.24 : 0;
          if (!drawSprite(ctx, 'dunebeetle', ix, iy, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0, rot: jit,
            sy: 1 + Math.sin(b.animT * 3) * 0.04,
          })) blob(ix, iy, 14, '#c9a063');
        } });
      }
      for (const e of w.query(FlameDancer, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const d = w.mustGet(e, FlameDancer);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 8);
          const hover = Math.sin(d.animT * 5) * 3 - 8;
          const jit = d.state === 'aim' ? (Math.random() - 0.5) * 0.18 : 0;
          if (!drawSprite(ctx, 'flamedancer', ix, iy + hover, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: jit + Math.sin(d.animT * 4) * 0.1,
            sx: d.state === 'aim' ? 1.12 : 1,
          })) blob(ix, iy + hover, 10, '#ff9a6b');
        } });
      }
      for (const e of w.query(DustStinger, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const s = w.mustGet(e, DustStinger);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          drawShadow(ctx, ix, iy, 12);
          if (!drawSprite(ctx, 'duststinger', ix, iy, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            sx: s.state === 'aim' ? 1.15 : 1,
            sy: s.state === 'hop' ? 1.1 : 1 + Math.sin(s.animT * 3) * 0.04,
          })) blob(ix, iy, 12, '#e8c07a');
        } });
      }
      for (const e of w.query(BossKazra, Transform, Health)) {
        const tr = w.mustGet(e, Transform);
        const boss = w.mustGet(e, BossKazra);
        const h = w.mustGet(e, Health);
        const [ix, iy] = lerp(tr);
        list.push({ y: iy, draw: () => {
          if (boss.state !== 'walk') {
            // 地下:巨大流沙涡
            ctx.fillStyle = 'rgba(90,60,30,0.5)';
            ctx.beginPath();
            ctx.ellipse(ix, iy, 34, 16, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,154,107,0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.ellipse(ix, iy, 22 + Math.sin(boss.animT * 8) * 4, 10, 0, 0, Math.PI * 2);
            ctx.stroke();
            return;
          }
          drawShadow(ctx, ix, iy, 30);
          if (!drawSprite(ctx, 'boss_kazra', ix, iy, {
            flash: h.flash, faceLeft: Math.cos(tr.face) < 0,
            rot: Math.sin(boss.animT * 1.6) * 0.03,
            sy: 1 + Math.sin(boss.animT * 2.6) * 0.025 + (boss.phase === 3 ? 0.03 : 0),
          })) blob(ix, iy, 32, '#ff9a6b');
        } });
      }

      // ---- 场景物件 ----
      for (const e of w.query(PropObstacle, Transform)) {
        const tr = w.mustGet(e, Transform);
        const prop = w.mustGet(e, PropObstacle);
        const pk = prop.kind;
        // 碎掉的障碍:只剩一地残渣(不挡路,但看一眼就知道这儿被拆过)
        if (prop.broken) {
          list.push({ y: tr.y, draw: () => {
            ctx.fillStyle = this.run.chapter === 3 ? '#b9a273' : this.run.chapter === 2 ? '#c8d6de' : '#8a7d5f';
            for (let i = 0; i < 5; i++) {
              const a = (i / 5) * Math.PI * 2 + tr.x * 0.01;
              ctx.fillRect(tr.x + Math.cos(a) * 9 - 4, tr.y + Math.sin(a) * 5 - 3, 8, 5);
            }
          } });
          continue;
        }
        list.push({ y: tr.y, draw: () => {
          if (pk === 'tree') drawShadow(ctx, tr.x, tr.y, 20);
          ctx.save();
          if (prop.shakeT > 0) {
            ctx.translate(Math.sin(prop.shakeT * 90) * 3, 0); // 挨打时抖一下
            prop.shakeT -= 1 / 60;
          }
          const propSprite = this.run.chapter === 3
            ? ({ tree: 'prop_cactus', rock: 'prop_sandrock', bush: 'prop_tumble' } as const)[pk]
            : this.run.chapter === 2
            ? ({ tree: 'prop_pine', rock: 'prop_icerock', bush: 'prop_crystal' } as const)[pk]
            : `prop_${pk}`;
          if (!drawSprite(ctx, propSprite, tr.x, tr.y + (pk === 'tree' ? 6 : 2))) {
            blob(tr.x, tr.y, pk === 'tree' ? 22 : pk === 'rock' ? 14 : 10,
              pk === 'rock' ? '#9aa3ad' : '#4f8a44');
          }
          ctx.restore();
        } });
      }

      // ---- 营地:功能建筑 + 训练木桩 ----
      for (const e of w.query(CampStation, Transform)) {
        const st = w.mustGet(e, CampStation);
        const tr = w.mustGet(e, Transform);
        const near = this.campNearE === e;
        list.push({ y: tr.y, draw: () => {
          drawShadow(ctx, tr.x, tr.y, 18);
          // 石台
          ctx.fillStyle = '#5d6673';
          ctx.fillRect(tr.x - 24, tr.y - 14, 48, 14);
          ctx.fillStyle = '#7a8494';
          ctx.fillRect(tr.x - 20, tr.y - 40, 40, 28);
          ctx.strokeStyle = '#2a3040';
          ctx.lineWidth = 2;
          ctx.strokeRect(tr.x - 20, tr.y - 40, 40, 28);
          // 图标(悬浮脉动)
          const bob = Math.sin(st.animT * 2.5) * 3;
          ctx.font = 'bold 24px monospace';
          ctx.textAlign = 'center';
          ctx.globalAlpha = 0.85 + 0.15 * Math.sin(st.animT * 3);
          ctx.fillText(st.icon, tr.x, tr.y - 52 + bob);
          ctx.globalAlpha = 1;
          ctx.font = 'bold 11px monospace';
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#0d0f1a';
          ctx.strokeText(st.label, tr.x, tr.y + 14);
          ctx.fillStyle = near ? UI.gold : UI.text;
          ctx.fillText(st.label, tr.x, tr.y + 14);
          if (near) {
            ctx.fillStyle = '#8fd4c8';
            ctx.strokeText('[F] 交互', tr.x, tr.y + 28);
            ctx.fillText('[F] 交互', tr.x, tr.y + 28);
          }
          st.animT += 0.016;
        } });
      }
      for (const e of w.query(Dummy, Transform, Health)) {
        const d = w.mustGet(e, Dummy);
        const tr = w.mustGet(e, Transform);
        list.push({ y: tr.y, draw: () => {
          drawShadow(ctx, tr.x, tr.y, 12);
          drawDummy(ctx, tr.x, tr.y, d.wobble, d.wobblePhase);
          // DPS 计(近 3 秒)
          const now = performance.now();
          d.hits = d.hits.filter(([t]) => now - t < 3000);
          const sum = d.hits.reduce((s, [, v]) => s + v, 0);
          if (sum > 0) {
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#0d0f1a';
            ctx.strokeText(`DPS ${(sum / 3).toFixed(0)}`, tr.x, tr.y - 58);
            ctx.fillStyle = UI.gold;
            ctx.fillText(`DPS ${(sum / 3).toFixed(0)}`, tr.x, tr.y - 58);
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
          } else if (stand.wares === 'cons' && stand.consId) {
            const vis = CONS_VISUAL[stand.consId];
            ctx.fillStyle = vis.color;
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(vis.glyph, tr.x, tr.y - 30 + bob);
          } else {
            ctx.fillStyle = '#B067E8';
            ctx.font = 'bold 20px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('◈', tr.x, tr.y - 30 + bob);
          }
          // 价签(轮 22):被特惠或议价动过价 → 画划线原价,一眼看出"现在便宜多少"
          ctx.font = 'bold 12px monospace';
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#0d0f1a';
          const tag = stand.sold ? '已售' : `✦${stand.price}`;
          const wasChanged = !stand.sold && stand.price !== stand.listPrice;
          ctx.strokeText(tag, tr.x + (wasChanged ? 8 : 0), tr.y + 14);
          ctx.fillStyle = stand.sold ? UI.dim : stand.deal || (wasChanged && stand.price < stand.listPrice) ? UI.hp : UI.gold;
          ctx.fillText(tag, tr.x + (wasChanged ? 8 : 0), tr.y + 14);
          if (wasChanged) {
            ctx.strokeStyle = '#0d0f1a';
            ctx.font = '11px monospace';
            ctx.strokeText(`✦${stand.listPrice}`, tr.x - 20, tr.y + 14);
            ctx.fillStyle = UI.dim;
            ctx.fillText(`✦${stand.listPrice}`, tr.x - 20, tr.y + 14);
            ctx.strokeStyle = UI.dim;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(tr.x - 20 - 11, tr.y + 10);
            ctx.lineTo(tr.x - 20 + 11, tr.y + 10);
            ctx.stroke();
          }
          // 特惠徽标
          if (stand.deal && !stand.sold) {
            ctx.fillStyle = UI.hpLow;
            ctx.font = 'bold 11px monospace';
            ctx.strokeStyle = '#0d0f1a';
            ctx.lineWidth = 3;
            ctx.strokeText(`特惠 -${Math.round(balance.shop.dealOff * 100)}%`, tr.x, tr.y - 44);
            ctx.fillText(`特惠 -${Math.round(balance.shop.dealOff * 100)}%`, tr.x, tr.y - 44);
          }
          ctx.globalAlpha = 1;
          if (near && !stand.sold) {
            const name = stand.wares === 'item' ? stand.item!.name
              : stand.wares === 'potion' ? '治疗药剂'
              : stand.wares === 'cons' && stand.consId ? consumableDef(stand.consId)?.name ?? '消耗品'
              : `符文「${RUNE_POOL.get(stand.runeId!)?.name ?? '?'}」`;
            ctx.fillStyle = '#8fd4c8';
            ctx.font = 'bold 12px monospace';
            ctx.strokeText(`[F] 购买 ${name}`, tr.x, tr.y - 52);
            ctx.fillText(`[F] 购买 ${name}`, tr.x, tr.y - 52);
          }
        } });
      }

      // ---- 流浪商人(轮 22):兜帽人形 + 头顶议价提示 ----
      for (const e of w.query(Merchant, Transform)) {
        const mc = w.mustGet(e, Merchant);
        const tr = w.mustGet(e, Transform);
        const nearM = this.shop.nearbyMerchant === e;
        list.push({ y: tr.y, draw: () => {
          const bob = Math.sin(mc.animT * 2.4) * 2;
          if (drawSprite(ctx, 'npc_merchant', tr.x, tr.y + bob, { scale: 1 })) { /* 已出图则走贴图 */ } else {
            // 程序化回退:斗篷 + 兜帽 + 一点货担
            ctx.fillStyle = '#3b2f4a';
            ctx.fillRect(tr.x - 9, tr.y - 26 + bob, 18, 24);
            ctx.fillStyle = '#54406b';
            ctx.beginPath();
            ctx.arc(tr.x, tr.y - 28 + bob, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#1a1424';
            ctx.fillRect(tr.x - 6, tr.y - 30 + bob, 12, 6);
            ctx.fillStyle = '#8fd4c8';
            ctx.fillRect(tr.x + 12, tr.y - 14 + bob, 6, 10);
          }
          ctx.textAlign = 'center';
          ctx.font = 'bold 11px monospace';
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#0d0f1a';
          const label = mc.haggled ? '商人(议过价了)' : '[F] 议价';
          ctx.strokeText(label, tr.x, tr.y - 44);
          ctx.fillStyle = mc.haggled ? UI.dim : nearM ? UI.gold : '#8fd4c8';
          ctx.fillText(label, tr.x, tr.y - 44);
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
        const glyph = pk.kind === 'cons' && pk.consId ? CONS_VISUAL[pk.consId].glyph
          : pk.kind === 'cons' ? undefined : pk.item?.glyph;
        const consColor = pk.kind === 'cons' && pk.consId ? CONS_VISUAL[pk.consId].color : color;
        list.push({ y: tr.y - 1, draw: () => drawPickup(ctx, tr.x, tr.y, pk.kind, consColor, pk.bobPhase, glyph) });
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
              // 动作序列(anim.ts):动作判定 + 帧选择 + 缺序列自动降级,帧数/帧率走 balance.anim。
              // 远程职业的普攻走"施法"动作:近战挥砍与拉弓/吟唱本来就是两套姿态
              // (序列没到位时自动降到待机,所以现在接线不会画出错东西)。
              const base = KLASS_SPRITE[p.klass];
              // 远程职业的普攻走 `cast` 动作(挥剑与拉弓是两套姿态)—— 规则在 anim.ts attackAction
              const isShot = basicSpec(p.klass, balance).kind === 'shot';
              const action = actionOf({
                // 死亡:倒地那 1.5s(respawn.delay)播死亡序列,复活后自然回待机
                dead: p.respawnT > 0,
                dashing: p.dashT > 0,
                attacking,
                hurt: h.flash > 0,
                moving: p.moving,
              }, attackAction(isShot));
              // 计时器给的是"剩余",动作时钟要的是"已进行"(见 anim.ts clockFor)
              const animClock = clockFor(action, clock.runTime, clocksOf({
                dashT: p.dashT, dashDur: p.dashDur,
                attackT: p.attackT, attackDur: p.attackDur,
                hurtT: h.flash, hurtDur: balance.feel.flashSec,
                respawnT: p.respawnT, respawnDur: balance.player.respawn.delay,
              }));
              const spriteName = spriteFor(base, action, animClock, (n) => sprites.get(n) !== null);
              const bob = bobPx(clock.runTime, action === 'walk');
              const ok = drawSprite(ctx, spriteName, ix, iy + bob, {
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

      // 触屏锁定圈:玩家必须能一眼看出"自动瞄准锁的是谁"(瞄错人比不瞄更气人)。
      // 画的正是 PlayerSystem.aimAssist 的本帧目标 —— 显示与实际是同一个来源。
      if (this.input.touchActive && this.state === 'run') {
        const pick = this.playerSystem.aimAssist.target;
        if (pick) {
          const t = performance.now() / 1000;
          const pulse = 1 + Math.sin(t * 6) * 0.06;
          ctx.save();
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = '#5FD068';
          ctx.lineWidth = 2;
          const rad = 16 * pulse;
          // 四个角括号(比整圈更不挡怪)
          for (let q = 0; q < 4; q++) {
            const a0 = q * (Math.PI / 2) + Math.PI / 4;
            ctx.beginPath();
            ctx.arc(pick.x, pick.y - 6, rad, a0 - 0.34, a0 + 0.34);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // 元素印记标示
      for (const e of w.query(ElementMarks, Transform)) {
        const m = w.mustGet(e, ElementMarks);
        const els = Object.keys(m.marks) as Element[];
        if (els.length === 0) continue;
        const tr = w.mustGet(e, Transform);
        const baseY = tr.y - (w.has(e, BossNanmir) ? 110 : 32);
        els.forEach((el, i) => {
          const x = tr.x + (i - (els.length - 1) / 2) * 12;
          // 元素图标贴图优先,未就绪回退色块
          if (drawElementIcon(ctx, el, x, baseY, 15)) return;
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
    if (!drawPanel9(ctx, 14, 14, 250, 58)) {
      ctx.fillStyle = UI.panel;
      ctx.fillRect(14, 14, 250, 58);
    }
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
    // 血量数字走像素字体(整串都是数字/斜杠/空格 → 可位图化)
    drawPixelText(ctx, `${Math.ceil(hp.hp)}/${hp.max}`, 28, 50, {
      scale: 1, color: ratio > 0.3 ? UI.text : UI.hpLow, align: 'left', outline: '#0d0f1a',
    });

    // 顶部中央:房间进度 + 昼夜
    const layoutTag = this.run.layout !== null && this.run.roomKind !== 'boss'
      ? ` · ${LAYOUT_LABELS[this.run.layout.id]}`
      : '';
    const roomLabel = this.run.roomKind === 'boss'
      ? balance.boss.nanmir.name
      : `房间 ${this.run.depth + 1}/${balance.rooms.count + 1} · ${PORTAL_STYLE[this.run.roomKind].label}${layoutTag}`;
    ctx.textAlign = 'center';
    if (!drawPanel9(ctx, width / 2 - 150, 14, 300, 26)) {
      ctx.fillStyle = UI.panel;
      ctx.fillRect(width / 2 - 150, 14, 300, 26);
    }
    ctx.fillStyle = UI.text;
    ctx.font = 'bold 12px monospace';
    const night = clock.isNight();
    ctx.fillText(`${night ? '🌙' : '☀'} ${roomLabel} · ${Math.ceil(clock.untilSwitch())}s`, width / 2, 31);

    // 挑战角标:日期/周数 + 三条规则名(玩家随时能确认本局规则)
    if (runMods.active) {
      const icon = runMods.mode === 'weekly' ? '🏅' : '🗓';
      const label = `${icon} ${runMods.label} · ${runMods.mods.map((m) => m.name).join(' / ')}`;
      ctx.font = 'bold 11px monospace';
      const tw = ctx.measureText(label).width + 20;
      if (!drawPanel9(ctx, width / 2 - tw / 2, 44, tw, 22)) {
        ctx.fillStyle = 'rgba(19,23,38,0.9)';
        ctx.fillRect(width / 2 - tw / 2, 44, tw, 22);
      }
      ctx.fillStyle = UI.gold;
      ctx.fillText(label, width / 2, 59);
    }

    // Boss 血条(两章 Boss 通用)
    const drawBossBar = (bh: Health, name: string, phase: number, gold: boolean, color: string): void => {
      const bw = Math.min(560, width - 120);
      const bx = width / 2 - bw / 2;
      if (!drawPanel9(ctx, bx - 6, 48, bw + 12, 30)) {
        ctx.fillStyle = UI.panel;
        ctx.fillRect(bx - 6, 48, bw + 12, 30);
      }
      ctx.fillStyle = '#232838';
      ctx.fillRect(bx, 60, bw, 12);
      ctx.fillStyle = gold ? UI.gold : color;
      ctx.fillRect(bx, 60, bw * Math.max(bh.hp / bh.max, 0), 12);
      ctx.fillStyle = UI.text;
      ctx.font = 'bold 11px monospace';
      ctx.fillText(`${name} · P${phase}`, width / 2, 57);
    };
    for (const e of this.world.query(MidBossStag, Health)) {
      const st = this.world.mustGet(e, MidBossStag);
      drawBossBar(this.world.mustGet(e, Health), balance.enemies.midboss_mossstag.name, st.phase, false, '#8fd45f');
    }
    for (const e of this.world.query(BossNanmir, Health)) {
      const boss = this.world.mustGet(e, BossNanmir);
      drawBossBar(this.world.mustGet(e, Health), balance.boss.nanmir.name, boss.phase, boss.state === 'stagger', '#b34747');
    }
    for (const e of this.world.query(BossVelsha, Health)) {
      const boss = this.world.mustGet(e, BossVelsha);
      drawBossBar(this.world.mustGet(e, Health), balance.enemies.boss_velsha.name, boss.phase, false, '#5fa8d9');
    }
    for (const e of this.world.query(BossKazra, Health)) {
      const boss = this.world.mustGet(e, BossKazra);
      drawBossBar(this.world.mustGet(e, Health), balance.enemies.boss_kazra.name, boss.phase, false, '#d97a3c');
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
      const ready = s.cd <= 0 && !s.locked;
      if (!drawPanel9(ctx, x, baseY, slotW, slotH)) {
        ctx.fillStyle = UI.panel;
        ctx.fillRect(x, baseY, slotW, slotH);
      }
      // 就绪态在面板贴图上再描一圈金边(贴图本身是中性色,状态靠这个表达)
      ctx.strokeStyle = ready ? UI.gold : '#3a4154';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, baseY + 1, slotW - 2, slotH - 2);
      // 技能原型图标(斩击/投射/突进/大招);未加载回退大号键位字
      const iconDrawn = drawSprite(ctx, this.skills.iconOf(s.key), x + slotW / 2, baseY + 36, {
        scale: 1, alpha: ready ? 1 : 0.45,
      });
      if (iconDrawn) {
        ctx.fillStyle = ready ? UI.gold : UI.dim;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(s.key, x + 5, baseY + 14);
        ctx.textAlign = 'center';
      } else {
        ctx.fillStyle = ready ? UI.gold : UI.dim;
        ctx.font = 'bold 16px monospace';
        ctx.fillText(s.key, x + slotW / 2, baseY + 22);
      }
      ctx.font = '10px monospace';
      ctx.fillStyle = UI.dim;
      ctx.fillText(this.skills.skillName(s.key), x + slotW / 2, baseY + 50);
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
        // 冷却剩余秒数:纯数字(带小数点)→ 像素字体,整数倍放大,读得清也看得快
        const cdText = s.cd.toFixed(1);
        drawPixelText(ctx, cdText, x + slotW / 2, baseY + slotH / 2 - lineHeight(2) / 2, {
          scale: 2, color: UI.text, align: 'center', outline: '#0d0f1a',
        });
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
    if (!drawPanel9(ctx, width - 210, 14, 196, 48)) {
      ctx.fillStyle = UI.panel;
      ctx.fillRect(width - 210, 14, 196, 48);
    }
    ctx.fillStyle = UI.text;
    ctx.font = '12px monospace';
    // 击杀数 / FPS:标签走平台字体(中文),数字走像素字体 —— 混排时各画各的反而更整齐
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'right';
    const fpsText = String(Math.round(this.fps));
    const killText = String(this.feedback.kills);
    const fpsW = measure(fpsText, 2);
    const killW = measure(killText, 2);
    drawPixelText(ctx, fpsText, width - 24, 22, { scale: 2, color: UI.text, align: 'right', outline: '#0d0f1a' });
    ctx.fillStyle = UI.text;
    ctx.fillText('FPS', width - 24 - fpsW - 6, 32);
    drawPixelText(ctx, killText, width - 24 - fpsW - 6 - 26, 22, { scale: 2, color: UI.gold, align: 'right', outline: '#0d0f1a' });
    ctx.fillStyle = UI.text;
    ctx.fillText('击杀', width - 24 - fpsW - 6 - 26 - killW - 6, 32);
    ctx.fillStyle = UI.gold;
    ctx.fillText(`✦ ${p.stardust}`, width - 110, 52);
    ctx.fillStyle = p.potionCharges > 0 ? UI.hpLow : UI.dim;
    ctx.fillText(`药剂[1] ×${p.potionCharges}`, width - 24, 52);
    // 消耗品栏(轮 21):按 2/3/4 使用。只显示**身上有**的那些,免得 HUD 常年挂三条 0
    let cxx = width - 24;
    for (const id of ['shield', 'cleanse', 'timeslow'] as ConsumableId[]) {
      const n = p.consumables.filter((x) => x === id).length;
      if (n <= 0) continue;
      const vis = CONS_VISUAL[id];
      ctx.fillStyle = vis.color;
      const label = `${vis.glyph}${n}`;
      ctx.fillText(label, cxx, 68);
      cxx -= 40;
    }
    if (p.shield) {
      ctx.fillStyle = CONS_VISUAL.shield.color;
      ctx.fillText(`🛡${Math.round(p.shield.amount)}(${p.shield.t.toFixed(0)}s)`, cxx, 68);
    }

    // 底部提示
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(232,232,232,0.5)';
    ctx.font = '12px monospace';
    const hint = this.input.touchActive
      ? (clock.isNight() ? `🌙 掉落×2 · 🏮钮花✦${this.run.chapterCfg.lanternCost}买天亮 · 🎒镶符文` : '清房踩传送门 · 异元素连击触发连锁 · 靠近摊位按 F 钮')
      : clock.isNight()
      ? `🌙 夜间掉落×2 · [L] 星灯 ✦${this.run.chapterCfg.lanternCost} 立即天亮 · [Tab]背包镶符文`
      : '踩传送门前进 · 异元素连击触发连锁 · 傀儡绕背×2 · [Tab]背包(右键重铸) · 2/3/4 消耗品 · 商店按[F]买';
    ctx.fillText(hint, width / 2, height - 12);
    // 无尽模式(轮 24):显示"第几层 / 循环几 / 当前乘区" —— 这个模式的唯一进度感就靠这行
    if (this.run.endless) {
      const m = this.run.loopMults;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff9a6b';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(
        `♾ ${floorLabel(this.run.floor)} · ${loopLabel(this.run.loop)} · 怪血 ×${m.hp.toFixed(1)} 掉落 ×${m.loot.toFixed(2)}`,
        width / 2, height - 46);
    }
    // 深渊档位提示(轮 23):玩家必须随时知道自己在哪一档 —— 打不动时第一反应是查装备,不是查难度
    if (runMods.abyss > 0) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff9a6b';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`🔥 ${levelName(runMods.abyss)}(怪血 ×${runMods.abyssHpMult} 攻击 ×${runMods.abyssAtkMult})`,
        width / 2, this.run.endless ? height - 64 : height - 30);
    }
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

    const ch = this.run !== undefined ? this.run.chapter : 1;
    const ch2 = ch === 2;
    const tile = sprites.get(ch === 3 ? 'sand_tile' : ch === 2 ? 'snow_tile' : 'grass_tile');
    if (tile) {
      // 正式地面贴图(无缝平铺,按章节切换)
      ctx.imageSmoothingEnabled = false;
      const pat = ctx.createPattern(tile, 'repeat');
      if (pat) {
        ctx.fillStyle = pat;
        ctx.fillRect(0, 0, wPx, hPx);
      }
    } else {
      const colA = ch === 3 ? '#e8d9a8' : ch2 ? '#d7e6ee' : FOREST.grassA;
      const colB = ch === 3 ? '#dfcd96' : ch2 ? '#c9dce8' : FOREST.grassB;
      const colC = ch === 3 ? '#f2e8c0' : ch2 ? '#eef6fa' : FOREST.grassC;
      for (let ty = 0; ty < balance.arena.heightM; ty++) {
        for (let tx = 0; tx < balance.arena.widthM; tx++) {
          ctx.fillStyle = (tx + ty) % 2 === 0 ? colA : colB;
          ctx.fillRect(tx * M, ty * M, M, M);
          if (rng.chance(0.18)) {
            ctx.fillStyle = colC;
            ctx.fillRect(tx * M + rng.int(4, 30), ty * M + rng.int(4, 30), 8, 5);
          }
        }
      }
    }
    // 房间地面装饰(浅滩/苔痕/砂地/土路):只影响观感,不参与碰撞
    const feat = this.state === 'run' ? this.run.layout?.floor : undefined;
    if (feat !== undefined && feat.kind !== 'none') {
      paintFloorFeature(ctx, feat, ch, rng);
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
