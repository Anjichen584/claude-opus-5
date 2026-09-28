import type { System, World, Entity } from '@engine/ecs/World';
import type { Input } from '@engine/input/Input';
import { M } from '@game/constants';
import skillsData from '@data/skills/blade.json';
import rangerData from '@data/skills/ranger.json';
import runePool from '@data/runes/pool.json';
import type { Renderer } from '@engine/render/Renderer';
import {
  BeamFxEvent, Element, Faction, Health, MeleeSweep, Player, Projectile, RingFxEvent,
  SfxEvent, SlashFxEvent, Stats, Transform, Velocity, Zone,
} from '@game/components';
import { elementColor } from '@game/combat/Elements';
import { dealDamage } from '@game/combat/DamagePipeline';

export interface RuneDef {
  id: string;
  /** 目标技能 id(仅能镶到该技能) */
  skill: string;
  name: string;
  desc: string;
  element?: string;
  groundZone?: { radiusM: number; lifeS: number; intervalS: number; mult: number };
}

/** 全符文池(id → 定义),UI 与掉落共用 */
export const RUNE_POOL = new Map<string, RuneDef>(
  (runePool.runes as RuneDef[]).map((r) => [r.id, r]),
);

interface Scheduled { t: number; run: (world: World) => void }

/** 通用技能定义(blade.json / ranger.json 共用形状) */
interface SkillDef {
  id: string;
  slot: string;
  name: string;
  cooldown: number;
  minRage?: number;
  phases: Array<Record<string, unknown>>;
}

/**
 * 技能系统:数据驱动(data/skills)+ 符文修饰(data/runes)。
 * phase 类型:multiSweep / dash / echoBlast / swordRain(新增类型在此登记并写执行器)。
 */
export class SkillSystem implements System {
  private queue: Scheduled[] = [];
  private defs = new Map<string, SkillDef>();

  constructor(
    private readonly input: Input,
    private readonly klass: 'blade' | 'ranger' = 'blade',
    private readonly renderer: Renderer | null = null,
  ) {
    const src = klass === 'ranger' ? rangerData.skills : skillsData.skills;
    for (const s of src) this.defs.set(s.slot, s as SkillDef);
  }

  /** 玩家当前镶嵌在某技能位(Q/E/R)上的符文 */
  runeFor(world: World, pe: Entity, slot: string): RuneDef | undefined {
    const def = this.defs.get(slot);
    if (!def) return undefined;
    return this.runeOf(world, pe, def.id);
  }

  private runeOf(world: World, pe: Entity, skillId: string): RuneDef | undefined {
    const p = world.get(pe, Player);
    const runeId = p?.equippedRunes[skillId];
    return runeId ? RUNE_POOL.get(runeId) : undefined;
  }

  skillName(slot: string): string {
    return this.defs.get(slot)?.name ?? '';
  }

  update(world: World, dt: number): void {
    // 调度队列推进
    for (const q of this.queue) q.t -= dt;
    const due = this.queue.filter((q) => q.t <= 0);
    this.queue = this.queue.filter((q) => q.t > 0);
    for (const q of due) q.run(world);

    const players = world.query(Player, Transform, Stats);
    if (players.length === 0) return;
    const pe = players[0];
    const p = world.mustGet(pe, Player);
    const tr = world.mustGet(pe, Transform);

    if (p.cdQ > 0) p.cdQ -= dt;
    if (p.cdE > 0) p.cdE -= dt;
    if (p.cdR > 0) p.cdR -= dt;
    if (p.respawnT > 0 || p.dashT > 0) return;

    if (this.input.wasPressed('KeyQ') && p.cdQ <= 0) this.castQ(world, pe, p, tr);
    if (this.input.wasPressed('KeyE') && p.cdE <= 0) this.castE(world, pe, p, tr);
    if (this.input.wasPressed('KeyR') && p.cdR <= 0) this.castR(world, pe, p, tr);
  }

  // ---- Q:剑士裂空斩 / 猎手瞬影三连 ----
  private castQ(world: World, pe: Entity, p: Player, tr: Transform): void {
    const def = this.defs.get('Q')!;
    if (this.klass === 'ranger') {
      this.castFanArrows(world, pe, p, tr, def);
      return;
    }
    const ph = def.phases[0] as { count: number; intervalS: number; arcDeg: number; rangeM: number; mult: number };
    const rune = this.runeOf(world, pe, def.id);
    const element = (rune?.element ?? null) as Element | null;
    p.cdQ = def.cooldown * (1 - p.cdr);
    world.emit(new SfxEvent('skill'));

    for (let i = 0; i < ph.count; i++) {
      this.queue.push({
        t: i * ph.intervalS,
        run: (w) => {
          const ptr = w.get(pe, Transform);
          const pp = w.get(pe, Player);
          if (!ptr || !pp || pp.respawnT > 0) return;
          const arcRad = (ph.arcDeg * Math.PI) / 180;
          w.emit(new MeleeSweep(pe, ptr.x, ptr.y, ptr.face, ph.rangeM * M, arcRad, ph.mult, i + 1, element, i === ph.count - 1 ? 1 : 0));
          w.emit(new SlashFxEvent(ptr.x, ptr.y, ptr.face, i + 1, ph.rangeM * M, arcRad));
        },
      });
    }
    // 符文:火焰地带(末段后在身前生成)
    if (rune?.groundZone) {
      const gz = rune.groundZone;
      this.queue.push({
        t: ph.count * ph.intervalS,
        run: (w) => {
          const ptr = w.get(pe, Transform);
          const stats = w.get(pe, Stats);
          if (!ptr || !stats) return;
          const zx = ptr.x + Math.cos(ptr.face) * 1.2 * M;
          const zy = ptr.y + Math.sin(ptr.face) * 1.2 * M;
          const z = w.create();
          w.add(z, new Transform(zx, zy));
          w.add(z, new Zone(gz.radiusM * M, gz.lifeS, gz.intervalS, stats.atk, gz.mult, element, 'player', element ? elementColor(element) : '#ffffff'));
        },
      });
    }
  }

  // ---- E:剑士潮涌步 / 猎手疾风回旋 ----
  private castE(world: World, pe: Entity, p: Player, tr: Transform): void {
    const def = this.defs.get('E')!;
    if (this.klass === 'ranger') {
      this.castNovaRoll(world, pe, p, tr, def);
      return;
    }
    const dashPh = def.phases[0] as { distM: number; durS: number; iframesS: number };
    const blastPh = def.phases[1] as { delayS: number; radiusM: number; mult: number };
    const rune = this.runeOf(world, pe, def.id);
    const element = (rune?.element ?? null) as Element | null;
    p.cdE = def.cooldown * (1 - p.cdr);
    world.emit(new SfxEvent('dash'));

    // 突进(复用翻滚位移机制,方向=瞄准)
    p.dashDirX = p.aimX;
    p.dashDirY = p.aimY;
    p.dashT = dashPh.durS;
    p.dashDur = dashPh.durS;
    p.dashSpeedPx = (dashPh.distM / dashPh.durS) * M;
    p.iframes = Math.max(p.iframes, dashPh.iframesS);
    p.attackT = 0;

    // 残影(在起点,延迟引爆)
    const ex = tr.x;
    const ey = tr.y;
    this.queue.push({
      t: blastPh.delayS,
      run: (w) => {
        const stats = w.get(pe, Stats);
        if (!stats) return;
        const color = element ? elementColor(element) : '#dfe8f2';
        w.emit(new RingFxEvent(ex, ey, blastPh.radiusM * M, color));
        w.emit(new SfxEvent('reaction'));
        for (const e of w.query(Health, Transform, Faction)) {
          const f = w.mustGet(e, Faction);
          if (f.team === 'player') continue;
          const ttr = w.mustGet(e, Transform);
          const d = Math.hypot(ttr.x - ex, ttr.y - ey);
          if (d <= blastPh.radiusM * M) {
            dealDamage(w, {
              source: pe, target: e, mult: blastPh.mult, element,
              hitAngle: Math.atan2(ttr.y - ey, ttr.x - ex),
            });
          }
        }
        // 符文(燃焰余迹):爆点留下元素地带
        if (rune?.groundZone) {
          const gz = rune.groundZone;
          const z = w.create();
          w.add(z, new Transform(ex, ey));
          w.add(z, new Zone(gz.radiusM * M, gz.lifeS, gz.intervalS, stats.atk, gz.mult, element, 'player', color));
        }
      },
    });
  }

  // ---- R:剑士万剑归宗 / 猎手星陨箭雨 ----
  private castR(world: World, pe: Entity, p: Player, tr: Transform): void {
    const def = this.defs.get('R')!;
    if (this.klass === 'ranger') {
      this.castArrowStorm(world, pe, p, tr, def);
      return;
    }
    const ph = def.phases[0] as { minCount: number; maxCount: number; mult: number; ringM: number; durS: number; aoeM: number; seekM: number };
    const minRage = def.minRage ?? 40;
    if (p.rage < minRage) return;
    const rune = this.runeOf(world, pe, def.id);
    const element = (rune?.element ?? null) as Element | null;

    const ratio = (p.rage - minRage) / (100 - minRage);
    const count = Math.round(ph.minCount + ratio * (ph.maxCount - ph.minCount));
    p.rage = 0;
    p.cdR = def.cooldown;
    world.emit(new SfxEvent('ult'));

    for (let i = 0; i < count; i++) {
      this.queue.push({
        t: (i / count) * ph.durS,
        run: (w) => {
          const ptr = w.get(pe, Transform);
          if (!ptr) return;
          // 优先砸向附近敌人,否则环形随机落点
          let x: number;
          let y: number;
          const foes = w.query(Health, Transform, Faction).filter((e) => {
            const f = w.mustGet(e, Faction);
            if (f.team === 'player') return false;
            const ttr = w.mustGet(e, Transform);
            return Math.hypot(ttr.x - ptr.x, ttr.y - ptr.y) <= ph.seekM * M;
          });
          if (foes.length > 0 && Math.random() < 0.75) {
            const pick = w.mustGet(foes[Math.floor(Math.random() * foes.length)], Transform);
            x = pick.x + (Math.random() - 0.5) * 30;
            y = pick.y + (Math.random() - 0.5) * 30;
          } else {
            const a = Math.random() * Math.PI * 2;
            const r = (0.5 + Math.random() * (ph.ringM - 0.5)) * M;
            x = ptr.x + Math.cos(a) * r;
            y = ptr.y + Math.sin(a) * r;
          }
          const color = element ? elementColor(element) : '#ffd94f';
          w.emit(new BeamFxEvent(x, y, color));
          for (const e of foes) {
            const ttr = w.mustGet(e, Transform);
            if (Math.hypot(ttr.x - x, ttr.y - y) <= ph.aoeM * M) {
              dealDamage(w, {
                source: pe, target: e, mult: ph.mult, element,
                hitAngle: Math.atan2(ttr.y - y, ttr.x - x),
              });
            }
          }
          // 符文(霜陨/烬雨):每 4 剑一个元素地带
          if (rune?.groundZone && i % 4 === 0) {
            const gz = rune.groundZone;
            const stats = w.get(pe, Stats);
            if (stats) {
              const z = w.create();
              w.add(z, new Transform(x, y));
              w.add(z, new Zone(gz.radiusM * M, gz.lifeS, gz.intervalS, stats.atk, gz.mult, element, 'player', color));
            }
          }
        },
      });
    }
  }

  // ================== 星弓猎手 ==================

  /** 玩家箭矢工厂(元素来自符文) */
  private fireArrow(
    world: World, pe: Entity, angle: number,
    speedM: number, mult: number, radiusM: number, lifeS: number, element: Element | null,
  ): void {
    const tr = world.get(pe, Transform);
    const stats = world.get(pe, Stats);
    if (!tr || !stats) return;
    const e = world.create();
    world.add(e, new Transform(tr.x + Math.cos(angle) * 14, tr.y + Math.sin(angle) * 14 - 12));
    const v = new Velocity();
    v.vx = Math.cos(angle) * speedM * M;
    v.vy = Math.sin(angle) * speedM * M;
    world.add(e, v);
    const color = element ? elementColor(element) : '#dfe8f2';
    world.add(e, new Projectile('player', stats.atk, mult, element, radiusM * M, lifeS, color, 'arrow'));
  }

  /** Q 瞬影三连:朝准星扇形三箭 */
  private castFanArrows(world: World, pe: Entity, p: Player, tr: Transform, def: SkillDef): void {
    const ph = def.phases[0] as unknown as { count: number; spreadDeg: number; mult: number; speedM: number; lifeS: number; radiusM: number };
    const rune = this.runeOf(world, pe, def.id);
    const element = (rune?.element ?? null) as Element | null;
    p.cdQ = def.cooldown * (1 - p.cdr);
    world.emit(new SfxEvent('skill'));
    const base = tr.face;
    const spread = (ph.spreadDeg * Math.PI) / 180;
    for (let i = 0; i < ph.count; i++) {
      const off = (i - (ph.count - 1) / 2) * spread;
      this.fireArrow(world, pe, base + off, ph.speedM, ph.mult, ph.radiusM, ph.lifeS, element);
    }
  }

  /** E 疾风回旋:突进翻滚,落点放射一圈环箭(符文:霜环 → 起点冰圈) */
  private castNovaRoll(world: World, pe: Entity, p: Player, tr: Transform, def: SkillDef): void {
    const ph = def.phases[0] as unknown as { distM: number; durS: number; iframesS: number; arrows: number; mult: number; speedM: number; lifeS: number; radiusM: number };
    const rune = this.runeOf(world, pe, def.id);
    const element = (rune?.element ?? null) as Element | null;
    p.cdE = def.cooldown * (1 - p.cdr);
    world.emit(new SfxEvent('dash'));

    p.dashDirX = p.aimX;
    p.dashDirY = p.aimY;
    p.dashT = ph.durS;
    p.dashDur = ph.durS;
    p.dashSpeedPx = (ph.distM / ph.durS) * M;
    p.iframes = Math.max(p.iframes, ph.iframesS);
    p.attackT = 0;

    // 符文(霜环):起点留冰圈
    if (rune?.groundZone) {
      const gz = rune.groundZone;
      const stats = world.get(pe, Stats);
      if (stats) {
        const z = world.create();
        world.add(z, new Transform(tr.x, tr.y));
        world.add(z, new Zone(gz.radiusM * M, gz.lifeS, gz.intervalS, stats.atk, gz.mult, element, 'player', element ? elementColor(element) : '#ffffff'));
      }
    }

    // 落点环箭
    this.queue.push({
      t: ph.durS + 0.02,
      run: (w) => {
        const ptr = w.get(pe, Transform);
        if (!ptr) return;
        w.emit(new RingFxEvent(ptr.x, ptr.y, 40, element ? elementColor(element) : '#dfe8f2'));
        w.emit(new SfxEvent('reaction'));
        for (let i = 0; i < ph.arrows; i++) {
          const a = (i / ph.arrows) * Math.PI * 2;
          this.fireArrow(w, pe, a, ph.speedM, ph.mult, ph.radiusM, ph.lifeS, element);
        }
      },
    });
  }

  /** R 星陨箭雨:朝准星区域倾泻箭雨(怒气越满箭越多) */
  private castArrowStorm(world: World, pe: Entity, p: Player, tr: Transform, def: SkillDef): void {
    const ph = def.phases[0] as unknown as { minCount: number; maxCount: number; mult: number; radiusM: number; durS: number; rangeM: number; aoeM: number };
    const minRage = def.minRage ?? 40;
    if (p.rage < minRage) return;
    const rune = this.runeOf(world, pe, def.id);
    const element = (rune?.element ?? null) as Element | null;

    // 目标点 = 准星(限制射程)
    let tx = tr.x + p.aimX * ph.rangeM * M;
    let ty = tr.y + p.aimY * ph.rangeM * M;
    if (this.renderer) {
      const mw = this.renderer.mouseWorld(this.input.mouseX, this.input.mouseY);
      const dx = mw.x - tr.x;
      const dy = mw.y - tr.y;
      const d = Math.hypot(dx, dy);
      const cl = Math.min(d, ph.rangeM * M) / (d || 1);
      tx = tr.x + dx * cl;
      ty = tr.y + dy * cl;
    }

    const ratio = (p.rage - minRage) / (100 - minRage);
    const count = Math.round(ph.minCount + ratio * (ph.maxCount - ph.minCount));
    p.rage = 0;
    p.cdR = def.cooldown;
    world.emit(new SfxEvent('ult'));

    for (let i = 0; i < count; i++) {
      this.queue.push({
        t: (i / count) * ph.durS,
        run: (w) => {
          const stats = w.get(pe, Stats);
          if (!stats) return;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * ph.radiusM * M;
          const x = tx + Math.cos(a) * r;
          const y = ty + Math.sin(a) * r;
          const color = element ? elementColor(element) : '#ffd94f';
          w.emit(new BeamFxEvent(x, y, color));
          for (const e of w.query(Health, Transform, Faction)) {
            const f = w.mustGet(e, Faction);
            if (f.team === 'player') continue;
            const ttr = w.mustGet(e, Transform);
            if (Math.hypot(ttr.x - x, ttr.y - y) <= ph.aoeM * M) {
              dealDamage(w, {
                source: pe, target: e, mult: ph.mult, element,
                hitAngle: Math.atan2(ttr.y - y, ttr.x - x),
              });
            }
          }
        },
      });
    }
  }
}
