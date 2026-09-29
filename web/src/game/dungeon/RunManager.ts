import type { World } from '@engine/ecs/World';
import { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import { M, RARITY_COLORS } from '@game/constants';
import {
  BlightWolf, BlizzardHawk, Body, BossKazra, BossNanmir, BossVelsha, Buffs, CinderRat,
  DuneBeetle, DustStinger, ElementMarks, EmberImp, EventTotem, Faction, FlameDancer,
  FrostMage, FrostSlime, Health, IceTurtle, MidBossStag, SnowPuff,
  OakGolem, Merchant, Pickup, Player, Portal, Projectile, PropObstacle, SfxEvent, ShopStand, Shroomling,
  SparkLizard, StardustSprite, Stats, TelegraphStrike, ThornVine, ToastEvent, ToxinToad,
  Transform, Velocity, WindBee, Zone,
} from '@game/components';
import { RUNE_POOL } from '@game/skills/SkillSystem';
import { scaleAtk, scaleHp } from './Scaling';
import { runMods } from './RunMods';
import { rollStock } from '@game/loot/ShopStock';
import { pickTotems, totemName, type TotemKind } from '@game/loot/EventRules';
import { clock } from './Clock';
import type { ItemFactory } from '@game/loot/Items';
import {
  buildLayout, isBlockedAt, isSolid as isSolidProp, pickLayout, propRadius,
  type LayoutCtxKind, type LayoutResult, type Reserved,
} from './RoomLayouts';
import { propHp, terrain } from './Terrain';

export type RoomKind = 'battle' | 'treasure' | 'elite' | 'midboss' | 'boss' | 'shop' | 'event';

type SpawnKind =
  | 'shroomling' | 'windbee' | 'blightwolf' | 'thornvine' | 'oakgolem' | 'midboss_mossstag'
  | 'emberimp' | 'frostslime' | 'sparklizard' | 'toxintoad' | 'stardustsprite'
  | 'snowpuff' | 'iceturtle' | 'blizzardhawk' | 'frostmage'
  | 'cinderrat' | 'dunebeetle' | 'flamedancer' | 'duststinger';

const R = balance.rooms;

/**
 * 章节推图(GDD §9 精简版):8 房间 + Boss 房。
 * 序列: 战→战→[选路]→战→精英→[选路]→战→Boss。
 * 房间清空 → 生成出口传送门(选路点给两个);踩传送门进下一房。
 */
export class RunManager {
  depth = 0; // 当前房间序号(0 起)
  roomKind: RoomKind = 'battle';
  cleared = false;
  bossSpawned = false;
  private pendingWaves = 0;
  private waveTimer = 0;
  private portalsSpawned = false;
  private spriteSpawned = false;
  /** 当前章节(GameScene.startRun 设置) */
  chapter: 1 | 2 | 3 = 1;
  /** 本房布局模板结果(RoomLayouts);营地/未开局为 null */
  layout: LayoutResult | null = null;
  /** 布局指纹:id + 房间序号,GameScene 据此判断要不要重烘焙地面 */
  layoutKey = 'camp';
  private layoutSeq = 0;
  private rng = new Rng(Date.now() >>> 0);

  /** 章节配置 */
  get chapterCfg(): (typeof balance.chapters)['1'] {
    return this.chapter === 3 ? balance.chapters['3'] : this.chapter === 2 ? balance.chapters['2'] : balance.chapters['1'];
  }

  constructor(private readonly factory: ItemFactory) {}

  startRoom(world: World, kind: RoomKind, playerE: number): void {
    this.roomKind = kind;
    this.cleared = false;
    this.portalsSpawned = false;
    this.bossSpawned = false;

    // 清场(传送门/预警/区域/弹幕/物件残留)
    for (const e of world.query(Portal)) world.destroy(e);
    for (const e of world.query(TelegraphStrike)) world.destroy(e);
    for (const e of world.query(Zone)) world.destroy(e);
    for (const e of world.query(Pickup)) world.destroy(e);
    for (const e of world.query(Projectile)) world.destroy(e);
    for (const e of world.query(PropObstacle)) world.destroy(e);
    for (const e of world.query(ShopStand)) world.destroy(e);
    for (const e of world.query(EventTotem)) world.destroy(e);
    world.flushDestroyed();
    this.spriteSpawned = false;

    // 玩家回到房间左侧入口
    const ptr = world.mustGet(playerE, Transform);
    ptr.x = 2.5 * M;
    ptr.y = (balance.arena.heightM / 2) * M;
    ptr.prevX = ptr.x;
    ptr.prevY = ptr.y;

    // 内容先落地:摊位/石碑/宝箱把位置登记成"净空区",摆件时自动绕开
    const reserved: Reserved[] = [];
    const hold = (xM: number, yM: number, rM: number): void => { reserved.push({ xM, yM, rM }); };

    switch (kind) {
      case 'battle':
        // 周常铁律「铁闸」:每房多一波
        this.pendingWaves = R.wavesPerRoom + runMods.extraWaves;
        this.waveTimer = 0.8;
        break;
      case 'elite':
        this.pendingWaves = 1 + runMods.extraWaves;
        this.waveTimer = 0.8;
        break;
      case 'treasure': {
        this.pendingWaves = 0;
        // 三个保底蓝+宝箱掉落
        for (let i = 0; i < R.treasureItems; i++) {
          let item = this.factory.roll(0);
          if (item.rarity === 'common' || item.rarity === 'fine') {
            item = this.factory.make(item.slot, 'rare');
          }
          hold(10 + i * 4, balance.arena.heightM / 2, 1.1);
          const e = world.create();
          world.add(e, new Transform((10 + i * 4) * M, (balance.arena.heightM / 2) * M));
          world.add(e, new Velocity());
          world.add(e, new Pickup('item', item));
        }
        world.emit(new ToastEvent('宝藏室!', RARITY_COLORS.epic));
        break;
      }
      case 'shop': {
        this.pendingWaves = 0;
        const cy = balance.arena.heightM / 2;
        const pl = world.mustGet(playerE, Player);
        // 整间店的货单交给 rollStock(轮 22):定价 jitter / 特惠 / 符文货架 / 消耗品随机两摊
        const stock = rollStock(this.rng, {
          klass: pl.klass,
          ownedRunes: pl.runeBag,
          make: (slot, rarity) => this.factory.make(slot, rarity),
          runes: [...RUNE_POOL.values()].filter((r) => r.skill.startsWith(`${pl.klass}_`)),
          centerY: cy,
        });
        for (const g of stock) {
          hold(g.x, g.y, 1.4);
          const e = world.create();
          world.add(e, new Transform(g.x * M, g.y * M));
          const stand = new ShopStand(g.wares, g.price, g.item, g.runeId, g.consId, g.listPrice);
          stand.deal = g.deal;
          world.add(e, stand);
        }
        // 商人:站在店门口左侧,议价用(交互距离 3m,与摊位不抢手)
        const merc = world.create();
        world.add(merc, new Transform(7 * M, cy * M));
        world.add(merc, new Merchant());
        const deals = stock.filter((g) => g.deal).length;
        const shelf = stock.filter((g) => g.wares === 'rune').length;
        world.emit(new ToastEvent(
          `🛒 流浪商人:${stock.length} 个货位${deals > 0 ? ' · 有特惠' : ''}`
          + `${shelf > 0 ? ` · 符文货架 ×${shelf}` : ''} · 找商人可议价`,
          '#8fd4c8'));
        break;
      }
      case 'event': {
        this.pendingWaves = 0;
        const cy = (balance.arena.heightM / 2) * M;
        // 轮 22:秘境不再永远是同样三块碑 —— 从 balance.events.totems 池子里抽 3 座(**不重复**)
        const kinds: TotemKind[] = pickTotems(this.rng);
        kinds.forEach((k, i) => {
          hold(9.5 + i * 4, balance.arena.heightM / 2, 1.4);
          const e = world.create();
          world.add(e, new Transform((9.5 + i * 4) * M, cy));
          world.add(e, new EventTotem(k));
        });
        world.emit(new ToastEvent(`❓ 秘境:「${kinds.map(totemName).join(' / ')}」—— 只能选一(按 F)`, '#e8c07a'));
        break;
      }
      case 'midboss': {
        // 中 Boss 房:只刷一只(它本身就是这场战斗的全部压力)
        this.pendingWaves = 0;
        const night = clock.isNight();
        const cfg = balance.enemies.midboss_mossstag;
        hold(balance.arena.widthM - 6, balance.arena.heightM / 2, 2.0);
        const e = world.create();
        world.add(e, new Transform((balance.arena.widthM - 6) * M, (balance.arena.heightM / 2) * M));
        world.add(e, new Velocity());
        world.add(e, new Body(cfg.bodyRadius, false));
        const [mhp, matk] = runMods.enemy(
          scaleHp(cfg.hp, 0, night) * this.chapterCfg.statMult,
          scaleAtk(cfg.atk, 0, night) * this.chapterCfg.statMult,
        );
        world.add(e, new Health(Math.round(mhp)));
        world.add(e, new Stats(Math.round(matk), cfg.speed, 0, 1, cfg.def));
        world.add(e, new Faction('enemy'));
        const stag = new MidBossStag();
        stag.spawnX = (balance.arena.widthM - 6) * M;
        stag.spawnY = (balance.arena.heightM / 2) * M;
        world.add(e, stag);
        world.add(e, new ElementMarks());
        world.add(e, new Buffs());
        world.emit(new ToastEvent('🦌 苔冠巨鹿——鹿角压低,苔雾漫起', '#8fd45f'));
        world.emit(new SfxEvent('ult'));
        break;
      }
      case 'boss': {
        this.pendingWaves = 0;
        const mul = this.chapterCfg.statMult;
        const cfg = this.chapter === 3
          ? balance.enemies.boss_kazra
          : this.chapter === 2
          ? balance.enemies.boss_velsha
          : balance.boss.nanmir;
        const night = clock.isNight();
        hold(balance.arena.widthM - 6, balance.arena.heightM / 2, 2.4); // Boss 落点留白
        const e = world.create();
        world.add(e, new Transform((balance.arena.widthM - 6) * M, (balance.arena.heightM / 2) * M));
        world.add(e, new Velocity());
        world.add(e, new Body(cfg.bodyRadius, false));
        const bossOwnTuned = this.chapter >= 2; // 二三章 Boss 血攻已按章调好,不再乘章节系数
        const [mhp, matk] = runMods.enemy(
          scaleHp(cfg.hp, 0, night) * (bossOwnTuned ? 1 : mul),
          scaleAtk(cfg.atk, 0, night) * (bossOwnTuned ? 1 : mul),
        );
        world.add(e, new Health(Math.round(mhp)));
        world.add(e, new Stats(Math.round(matk), cfg.speed, 0, 1, cfg.def));
        world.add(e, new Faction('enemy'));
        if (this.chapter === 3) world.add(e, new BossKazra());
        else if (this.chapter === 2) world.add(e, new BossVelsha());
        else world.add(e, new BossNanmir());
        world.add(e, new ElementMarks());
        world.add(e, new Buffs());
        this.bossSpawned = true;
        world.emit(new ToastEvent(cfg.name, this.chapter === 3 ? '#ff9a6b' : this.chapter === 2 ? '#8fdcff' : '#e05f5f'));
        world.emit(new SfxEvent('ult'));
        break;
      }
    }

    // 布局:按房间类型抽模板 → 模板摆位 → 过一遍摆放规则(出入口/交互净空/可穿行)
    const ctxKind: LayoutCtxKind =
      kind === 'boss' ? 'boss'
        : kind === 'elite' || kind === 'midboss' ? 'elite'
        : kind === 'battle' ? 'battle' : 'calm';
    // 周常铁律「地脉」:战斗房地形被定死(精英房也让一步,免得两种规则打架)
    const forced = runMods.forcedLayout !== null && (kind === 'battle' || kind === 'elite')
      ? runMods.forcedLayout
      : pickLayout(ctxKind, this.rng, this.chapter); // 章节决定地貌词(二章冰原/三章荒漠)
    this.layout = buildLayout(forced, {
      rng: this.rng,
      widthM: balance.arena.widthM,
      heightM: balance.arena.heightM,
      reserved,
    });
    this.layoutKey = `${this.layout.id}#${this.layoutSeq++}`;
    terrain.setFromLayout(this.layout); // 地形效果(浅滩减速/导电)随房生效
    this.spawnProps(world);
  }

  update(world: World, dt: number, playerE: number): 'playing' | 'victory' {
    // ---- 波次出怪 ----
    if (this.pendingWaves > 0) {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.spawnWave(world);
        this.pendingWaves--;
        this.waveTimer = 4.5;
      }
    }

    // ---- 清房判定(星尘精灵是彩蛋怪,不挡门) ----
    if (!this.cleared) {
      const enemiesLeft =
        world.count(Shroomling) + world.count(WindBee) + world.count(BlightWolf) +
        world.count(ThornVine) + world.count(OakGolem) + world.count(BossNanmir) +
        world.count(EmberImp) + world.count(FrostSlime) + world.count(SparkLizard) +
        world.count(ToxinToad) + world.count(SnowPuff) + world.count(IceTurtle) +
        world.count(BlizzardHawk) + world.count(FrostMage) + world.count(BossVelsha) +
        world.count(CinderRat) + world.count(DuneBeetle) + world.count(FlameDancer) +
        world.count(DustStinger) + world.count(BossKazra) +
        world.count(MidBossStag);
      if (this.roomKind === 'boss') {
        if (this.bossSpawned && world.count(BossNanmir) + world.count(BossVelsha) + world.count(BossKazra) === 0) return 'victory';
      } else if (enemiesLeft === 0 && this.pendingWaves === 0) {
        this.cleared = true;
        world.emit(new ToastEvent('房间清空!前往出口 →', '#5FD068'));
        world.emit(new SfxEvent('skill'));
      }
    }

    // ---- 出口传送门 ----
    if (this.cleared && !this.portalsSpawned) {
      this.portalsSpawned = true;
      this.spawnPortals(world);
    }

    // ---- 踩门换房 ----
    if (this.portalsSpawned) {
      const ptr = world.mustGet(playerE, Transform);
      for (const e of world.query(Portal, Transform)) {
        const tr = world.mustGet(e, Transform);
        if (Math.hypot(ptr.x - tr.x, ptr.y - tr.y) < 0.9 * M) {
          const kind = world.mustGet(e, Portal).kind;
          this.depth++;
          this.startRoom(world, kind, playerE);
          break;
        }
      }
    }
    return 'playing';
  }

  /** 精英房位置(周常铁律「先手」会把它提前) */
  get eliteIndex(): number {
    return Math.min(R.count - 1, Math.max(1, R.eliteIndex + runMods.eliteShift));
  }

  /** 下一站类型:固定序列 + 选路点(第一个选路点给宝藏,第二个给商店) */
  private nextKinds(): RoomKind[] {
    const next = this.depth + 1;
    if (next >= R.count) return ['boss'];
    // 章节门控:二三章的中 Boss 还没做(10-FULL-PLAN 轮 13/21),到那里再开
    if (next === R.midbossIndex && this.chapter === 1) return ['midboss'];
    if (next === this.eliteIndex) return ['elite'];
    const choiceIdx = (R.choiceAt as number[]).indexOf(next);
    if (choiceIdx === 0) return ['treasure', 'event']; // 稳定收益 vs 三选一赌局
    // 周常铁律「闭市」:商店关门,选路只剩硬打
    if (choiceIdx >= 1) return runMods.shopClosed ? ['battle', 'battle'] : ['battle', 'shop'];
    return ['battle'];
  }

  private spawnPortals(world: World): void {
    const kinds = this.nextKinds();
    const cy = (balance.arena.heightM / 2) * M;
    kinds.forEach((kind, i) => {
      const e = world.create();
      const off = kinds.length === 1 ? 0 : (i === 0 ? -2.5 : 2.5) * M;
      world.add(e, new Transform((balance.arena.widthM - 2) * M, cy + off));
      world.add(e, new Portal(kind));
    });
  }

  /** 一波怪:按深度预算,从解锁池加权抽取(深度越深元素怪越多) */
  private spawnWave(world: World): void {
    const night = clock.isNight();
    const budget = R.waveBudgetBase + this.depth * R.waveBudgetPerDepth;
    if (this.roomKind === 'elite') {
      if (this.chapter === 3) {
        this.spawn(world, 'dunebeetle', night);
        this.spawn(world, 'dunebeetle', night);
        this.spawn(world, 'flamedancer', night);
        this.spawn(world, 'duststinger', night);
        for (let i = 0; i < 4; i++) this.spawn(world, 'cinderrat', night);
      } else if (this.chapter === 2) {
        this.spawn(world, 'iceturtle', night);
        this.spawn(world, 'iceturtle', night);
        this.spawn(world, 'frostmage', night);
        this.spawn(world, 'frostmage', night);
        for (let i = 0; i < 3; i++) this.spawn(world, 'blizzardhawk', night);
      } else {
        this.spawn(world, 'oakgolem', night);
        this.spawn(world, 'thornvine', night);
        this.spawn(world, 'blightwolf', night);
        this.spawn(world, 'emberimp', night);
        this.spawn(world, 'emberimp', night);
        for (let i = 0; i < 3; i++) this.spawn(world, 'windbee', night);
      }
      return;
    }

    // 出怪池: [kind, 权重, 预算消耗, 解锁深度](按章节切换)
    const pool: Array<[SpawnKind, number, number, number]> = this.chapter === 3
      ? [
          ['cinderrat', 30, 1, 0],
          ['duststinger', 18, 2, 0],
          ['flamedancer', 16, 2, 1],
          ['sparklizard', 12, 1, 1], // 荒漠雷蜥(雷,与火组成超载连锁)
          ['dunebeetle', 16, 2, 2],
          ['frostslime', 10, 2, 3], // 绿洲史莱姆(冰,反差连锁)
        ]
      : this.chapter === 2
      ? [
          ['snowpuff', 30, 1, 0],
          ['blizzardhawk', 20, 1, 0],
          ['frostmage', 16, 2, 1],
          ['sparklizard', 12, 1, 1], // 冰原也有蜥蜴(雷,与冰组成脆冰连锁)
          ['iceturtle', 14, 2, 2],
          ['emberimp', 10, 2, 3], // 深处的余烬小鬼(火,融雪反差)
        ]
      : [
          ['shroomling', 30, 1, 0],
          ['windbee', 22, 1, 0],
          ['frostslime', 16, 2, 1],
          ['sparklizard', 14, 1, 1],
          ['emberimp', 14, 2, 2],
          ['toxintoad', 12, 2, 2],
          ['thornvine', 10, 2, 2],
          ['blightwolf', 12, 2, 3],
        ];
    const avail = pool.filter(([, , , minD]) => this.depth >= minD);
    const totalW = avail.reduce((s, p) => s + p[1], 0);
    let left = budget;
    let guard = 60;
    while (left > 0 && guard-- > 0) {
      let roll = this.rng.next() * totalW;
      for (const [kind, wgt, cost] of avail) {
        roll -= wgt;
        if (roll <= 0) {
          this.spawn(world, kind, night);
          left -= cost;
          break;
        }
      }
    }

    // 彩蛋:星尘精灵(每房最多1只,25%)
    if (!this.spriteSpawned && this.rng.chance(R.spriteChance)) {
      this.spriteSpawned = true;
      this.spawn(world, 'stardustsprite', night);
      world.emit(new ToastEvent('✨ 星尘精灵出现了!抓住它!', '#ffd94f'));
    }
  }

  /** 场景物件:按地形模板布置(战斗房 4 模板随机,走位差异化) */
  /** 把本房布局的物件落成实体(实心件带 Body 与耐久,bush 只是装饰) */
  private spawnProps(world: World): void {
    const props = this.layout?.props ?? [];
    for (const p of props) {
      const e = world.create();
      world.add(e, new Transform(p.xM * M, p.yM * M));
      const comp = new PropObstacle(p.pk);
      comp.hp = propHp(p.pk); // 树 80 / 岩 120(balance.json props.*.hp)
      world.add(e, comp);
      if (isSolidProp(p.pk)) {
        world.add(e, new Velocity()); // Body 需参与物理查询(速度恒 0)
        world.add(e, new Body(propRadius(p.pk), true));
      }
    }
  }

  /** 找一个不卡在石头里的出怪点(窄道/环形里尤其重要) */
  private freeSpot(): { x: number; y: number } {
    const W = balance.arena.widthM;
    const H = balance.arena.heightM;
    let x = this.rng.range(8, W - 2);
    let y = this.rng.range(1.5, H - 1.5);
    for (let i = 0; i < 8 && isBlockedAt(this.layout, x, y); i++) {
      x = this.rng.range(8, W - 2);
      y = this.rng.range(1.5, H - 1.5);
    }
    return { x, y };
  }

  private spawn(world: World, kind: SpawnKind, night: boolean): void {
    const cfg = balance.enemies[kind];
    const { x: xM, y: yM } = this.freeSpot();
    const x = xM * M;
    const y = yM * M;
    const e = world.create();
    world.add(e, new Transform(x, y));
    world.add(e, new Velocity());
    world.add(e, new Body(cfg.bodyRadius, kind === 'thornvine'));
    const mul = this.chapterCfg.statMult;
    const [mhp, matk] = runMods.enemy(
      scaleHp(cfg.hp, this.depth, night) * mul,
      scaleAtk(cfg.atk, this.depth, night) * mul,
    );
    world.add(e, new Health(Math.round(mhp)));
    const speed = 'speed' in cfg ? (cfg as { speed: number }).speed : 0;
    world.add(e, new Stats(Math.round(matk), speed, 0, 1, cfg.def));
    world.add(e, new Faction('enemy'));
    world.add(e, new ElementMarks());
    world.add(e, new Buffs());
    switch (kind) {
      case 'shroomling': world.add(e, new Shroomling()); break;
      case 'windbee': world.add(e, new WindBee()); break;
      case 'blightwolf': world.add(e, new BlightWolf()); break;
      case 'thornvine': world.add(e, new ThornVine()); break;
      case 'oakgolem': world.add(e, new OakGolem()); break;
      case 'emberimp': world.add(e, new EmberImp()); break;
      case 'frostslime': world.add(e, new FrostSlime()); break;
      case 'sparklizard': world.add(e, new SparkLizard()); break;
      case 'toxintoad': world.add(e, new ToxinToad()); break;
      case 'stardustsprite': world.add(e, new StardustSprite(balance.enemies.stardustsprite.lifeS)); break;
      case 'snowpuff': world.add(e, new SnowPuff()); break;
      case 'iceturtle': world.add(e, new IceTurtle()); break;
      case 'blizzardhawk': world.add(e, new BlizzardHawk()); break;
      case 'frostmage': world.add(e, new FrostMage()); break;
      case 'cinderrat': world.add(e, new CinderRat()); break;
      case 'dunebeetle': world.add(e, new DuneBeetle()); break;
      case 'flamedancer': world.add(e, new FlameDancer()); break;
      case 'duststinger': world.add(e, new DustStinger()); break;
      case 'midboss_mossstag': {
        const stag = new MidBossStag();
        stag.spawnX = x;
        stag.spawnY = y;
        world.add(e, stag);
        break;
      }
    }
  }
}
