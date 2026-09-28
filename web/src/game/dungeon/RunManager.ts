import type { World } from '@engine/ecs/World';
import { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import { M, RARITY_COLORS } from '@game/constants';
import {
  BlightWolf, Body, BossNanmir, Buffs, ElementMarks, EmberImp, Faction, FrostSlime, Health,
  OakGolem, Pickup, Portal, Projectile, PropObstacle, SfxEvent, Shroomling, SparkLizard,
  StardustSprite, Stats, TelegraphStrike, ThornVine, ToastEvent, ToxinToad, Transform,
  Velocity, WindBee, Zone,
} from '@game/components';
import { scaleAtk, scaleHp } from './Scaling';
import { clock } from './Clock';
import type { ItemFactory } from '@game/loot/Items';

export type RoomKind = 'battle' | 'treasure' | 'elite' | 'boss';

type SpawnKind =
  | 'shroomling' | 'windbee' | 'blightwolf' | 'thornvine' | 'oakgolem'
  | 'emberimp' | 'frostslime' | 'sparklizard' | 'toxintoad' | 'stardustsprite';

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
  private rng = new Rng(Date.now() >>> 0);

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
    world.flushDestroyed();
    this.scatterProps(world, kind);
    this.spriteSpawned = false;

    // 玩家回到房间左侧入口
    const ptr = world.mustGet(playerE, Transform);
    ptr.x = 2.5 * M;
    ptr.y = (balance.arena.heightM / 2) * M;
    ptr.prevX = ptr.x;
    ptr.prevY = ptr.y;

    switch (kind) {
      case 'battle':
        this.pendingWaves = R.wavesPerRoom;
        this.waveTimer = 0.8;
        break;
      case 'elite':
        this.pendingWaves = 1;
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
          const e = world.create();
          world.add(e, new Transform((10 + i * 4) * M, (balance.arena.heightM / 2) * M));
          world.add(e, new Velocity());
          world.add(e, new Pickup('item', item));
        }
        world.emit(new ToastEvent('宝藏室!', RARITY_COLORS.epic));
        break;
      }
      case 'boss': {
        this.pendingWaves = 0;
        const cfg = balance.boss.nanmir;
        const night = clock.isNight();
        const e = world.create();
        world.add(e, new Transform((balance.arena.widthM - 6) * M, (balance.arena.heightM / 2) * M));
        world.add(e, new Velocity());
        world.add(e, new Body(cfg.bodyRadius, false));
        world.add(e, new Health(scaleHp(cfg.hp, 0, night)));
        world.add(e, new Stats(scaleAtk(cfg.atk, 0, night), cfg.speed, 0, 1, cfg.def));
        world.add(e, new Faction('enemy'));
        world.add(e, new BossNanmir());
        world.add(e, new ElementMarks());
        world.add(e, new Buffs());
        this.bossSpawned = true;
        world.emit(new ToastEvent(cfg.name, '#e05f5f'));
        world.emit(new SfxEvent('ult'));
        break;
      }
    }
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
        world.count(ToxinToad);
      if (this.roomKind === 'boss') {
        if (this.bossSpawned && world.count(BossNanmir) === 0) return 'victory';
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

  /** 下一站类型:固定序列 + 选路点 */
  private nextKinds(): RoomKind[] {
    const next = this.depth + 1;
    if (next >= R.count) return ['boss'];
    if (next === R.eliteIndex) return ['elite'];
    if ((R.choiceAt as number[]).includes(next)) return ['battle', 'treasure'];
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
      this.spawn(world, 'oakgolem', night);
      this.spawn(world, 'thornvine', night);
      this.spawn(world, 'blightwolf', night);
      this.spawn(world, 'emberimp', night);
      this.spawn(world, 'emberimp', night);
      for (let i = 0; i < 3; i++) this.spawn(world, 'windbee', night);
      return;
    }

    // 出怪池: [kind, 权重, 预算消耗, 解锁深度]
    const pool: Array<[SpawnKind, number, number, number]> = [
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

  /** 场景物件:树/岩石(碰撞)+ 灌木(装饰),避开入口与出口带 */
  private scatterProps(world: World, kind: RoomKind): void {
    const P = balance.props;
    const counts: Array<['tree' | 'rock' | 'bush', number]> =
      kind === 'boss' ? [['tree', 2], ['rock', 1]]
      : kind === 'treasure' ? [['bush', 5], ['tree', 2]]
      : [
          ['tree', this.rng.int(P.tree.perRoomMin, P.tree.perRoomMax)],
          ['rock', this.rng.int(P.rock.perRoomMin, P.rock.perRoomMax)],
          ['bush', this.rng.int(P.bush.perRoomMin, P.bush.perRoomMax)],
        ];
    for (const [pk, n] of counts) {
      for (let i = 0; i < n; i++) {
        const x = this.rng.range(5, balance.arena.widthM - 4.5) * M;
        const y = this.rng.range(1.6, balance.arena.heightM - 1.4) * M;
        const e = world.create();
        world.add(e, new Transform(x, y));
        world.add(e, new PropObstacle(pk));
        const radius = pk === 'tree' ? P.tree.bodyRadius : pk === 'rock' ? P.rock.bodyRadius : 0;
        if (radius > 0) {
          world.add(e, new Velocity()); // Body 需参与物理查询(速度恒 0)
          world.add(e, new Body(radius, true));
        }
      }
    }
  }

  private spawn(world: World, kind: SpawnKind, night: boolean): void {
    const cfg = balance.enemies[kind];
    const x = this.rng.range(8, balance.arena.widthM - 2) * M;
    const y = this.rng.range(1.5, balance.arena.heightM - 1.5) * M;
    const e = world.create();
    world.add(e, new Transform(x, y));
    world.add(e, new Velocity());
    world.add(e, new Body(cfg.bodyRadius, kind === 'thornvine'));
    world.add(e, new Health(scaleHp(cfg.hp, this.depth, night)));
    const speed = 'speed' in cfg ? (cfg as { speed: number }).speed : 0;
    world.add(e, new Stats(scaleAtk(cfg.atk, this.depth, night), speed, 0, 1, cfg.def));
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
    }
  }
}
