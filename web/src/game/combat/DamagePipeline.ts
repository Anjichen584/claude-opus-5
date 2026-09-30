import type { World, Entity } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { M } from '@game/constants';
import {
  BeamFxEvent, BlightWolf, BlizzardHawk, Body, BossKazra, BossNanmir, BossVelsha, Buffs,
  CinderRat, Dummy, DuneBeetle, DustStinger, Element, ElementMarks, EmberImp, Faction,
  FlameDancer, FrostMage, FrostSlime, Health, HitEvent, IceTurtle, KillEvent, MidBossStag, OakGolem,
  Player, ReactionEvent, RingFxEvent, Shroomling, SnowPuff, SparkLizard, StardustSprite,
  Stats, ThornVine, ToxinToad, Transform, Velocity, WindBee, Zone,
} from '@game/components';
import { elementColor, reactionOf } from './Elements';
import { defenseReduction, finalDamage } from './formulas';
import { PlayerSystem } from '@game/systems/PlayerSystem';
import { terrain } from '@game/dungeon/Terrain';
import { hitDamageMult, killHeal, strikeElement, THORN_RADIUS_M, reflectOnHurt } from '@game/loot/Specials';

const RX = balance.reactions;

export interface DealOpts {
  /** 伤害来源实体(区域伤害等无实体来源时给 null 并提供 atkOverride) */
  source: Entity | null;
  target: Entity;
  mult: number;
  element: Element | null;
  hitAngle: number;
  atkOverride?: number;
  canCrit?: boolean;
  knockbackM?: number;
  chainDepth?: number;
}

/**
 * 全游戏唯一伤害入口(docs/02-ARCHITECTURE.md §5)。
 * 攻方加成 → 暴击 → 守方减免/易伤 → 印记挂载/连锁反应(链深≤maxDepth) → 上血 → 反馈事件 → 死亡处理。
 */
export function dealDamage(world: World, o: DealOpts): void {
  const depth = o.chainDepth ?? 0;
  if (depth > RX.maxDepth) return;

  const tHp = world.get(o.target, Health);
  const tTr = world.get(o.target, Transform);
  if (!tHp || !tTr || tHp.hp <= 0) return;

  // ---- 攻方数值 ----
  const srcStats = o.source !== null ? world.get(o.source, Stats) : undefined;
  const atk = o.atkOverride ?? srcStats?.atk ?? 0;
  if (atk <= 0) return;
  const canCrit = o.canCrit !== false && !!srcStats;
  const crit = canCrit && Math.random() < (srcStats?.critRate ?? 0);

  // ---- 守方减免与易伤 ----
  const tStats = world.get(o.target, Stats);
  const defRed = defenseReduction(tStats?.def ?? 0, 1);
  const tBuffs = world.get(o.target, Buffs);
  const vuln = tBuffs && tBuffs.vulnT > 0 ? 1 + RX.brittle.pct : 1;

  // 元素伤害词条加成(仅元素攻击享受)
  const srcPlayer = o.source !== null ? world.get(o.source, Player) : undefined;
  const elemBonus = o.element && srcPlayer ? 1 + srcPlayer.elemDmg : 1;

  // 橡木傀儡背部弱点:从背后命中 ×2(GDD §8 教学走位)
  let backstab = 1;
  const golem = world.get(o.target, OakGolem);
  if (golem && Math.cos(o.hitAngle - tTr.face) > 0.35) {
    backstab = balance.enemies.oakgolem.backstabMult;
  }
  // 冰壳龟正面减伤:从正面命中 ×(1-frontDR)(绕后打屁股)
  if (world.has(o.target, IceTurtle) && Math.cos(o.hitAngle - tTr.face) < -0.35) {
    backstab *= 1 - balance.enemies.iceturtle.frontDR;
  }

  // 地形:浅滩导电 —— 雷元素打水里的目标更疼,并附带短时麻痹(docs/01-GDD.md §9.2)
  const terrainAmp = terrain.elemAmp(o.element, tTr.x, tTr.y);

  let amount = finalDamage(atk, o.mult * elemBonus * backstab * terrainAmp * Math.pow(RX.chainDecay, depth), crit, srcStats?.critDmg ?? 1, defRed, vuln);

  // 橙装「回响之戒」:每第 N 次命中 ×echoMult(计数从 1 起,只数玩家的命中)
  if (srcPlayer && o.source !== null) {
    srcPlayer.hitCount += 1;
    const echo = hitDamageMult(srcPlayer.specials, srcPlayer.hitCount);
    if (echo !== 1) amount = Math.round(amount * echo);
  }

  // 橙装「霜咬」:无元素命中时补一层冰印记(不覆盖玩家已有的元素铺场)
  const strike = srcPlayer ? strikeElement(srcPlayer.specials, o.element ?? null) : { element: o.element ?? null, marks: 0 };
  const hitElement: Element | null = strike.element;

  // ---- 玩家目标走受伤入口(尊重无敌帧/翻滚) ----
  if (world.has(o.target, Player)) {
    // 橙装「棘刺胸甲」:受伤时对身边敌人反弹(有上限,见 Specials.reflectOnHurt)
    const pl = world.get(o.target, Player);
    const plTr = world.get(o.target, Transform);
    if (pl && plTr && pl.iframes <= 0 && pl.dashT <= 0) {
      const back = reflectOnHurt(pl.specials, amount);
      if (back > 0) {
        for (const e of world.query(Transform, Health, Faction)) {
          if (world.has(e, Player)) continue;
          const f = world.mustGet(e, Faction);
          if (f.team === 'player') continue;
          const etr = world.mustGet(e, Transform);
          if (Math.hypot(etr.x - plTr.x, etr.y - plTr.y) > THORN_RADIUS_M * M) continue;
          dealDamage(world, { source: o.target, target: e, mult: 1, element: null, hitAngle: 0, atkOverride: back, canCrit: false });
        }
      }
    }
    PlayerSystem.applyHurt(world, o.target, amount);
    return;
  }

  // 水里的雷击:短时麻痹(不占印记槽,免得盖掉玩家自己的元素铺场)
  const stunS = terrain.stunOnBolt(o.element, tTr.x, tTr.y);
  if (stunS > 0) {
    const tBuffs2 = world.get(o.target, Buffs);
    if (tBuffs2) tBuffs2.stunT = Math.max(tBuffs2.stunT, stunS);
  }

  // ---- 元素印记与连锁 ----
  const marks = world.get(o.target, ElementMarks);
  if (hitElement && marks) {
    const existing = (Object.keys(marks.marks) as Element[]).find(
      (el) => (marks.marks[el] ?? 0) > 0 && el !== hitElement,
    );
    const reaction = existing ? reactionOf(existing, hitElement) : null;
    if (reaction && existing) {
      marks.marks = {}; // 反应消耗全部印记
      triggerReaction(world, reaction.id, reaction.name, reaction.color, o, amount, tTr, depth, existing, hitElement);
    } else {
      marks.marks[hitElement] = RX.markDurS;
    }
  }

  // ---- 上血与反馈 ----
  tHp.flash = balance.feel.flashSec;
  const dummy = world.get(o.target, Dummy);
  if (dummy) {
    dummy.hits.push([performance.now(), amount]);
    dummy.wobble = Math.min(dummy.wobble + 0.5, 1);
    gainRage(world, o.source, crit);
    world.emit(new HitEvent(tTr.x, tTr.y - 20, amount, crit, false, o.hitAngle, o.element));
    return;
  }

  tHp.hp -= amount;
  const kill = tHp.hp <= 0;
  gainRage(world, o.source, crit);

  // 击退(所有可击退怪种通用)
  const shroom = world.get(o.target, Shroomling);
  const kb = (o.knockbackM ?? 0) + (kill ? 2 : 0);
  if (kb > 0) {
    const kx = Math.cos(o.hitAngle) * kb * M;
    const ky = Math.sin(o.hitAngle) * kb * M;
    const knockable = shroom ?? world.get(o.target, WindBee) ?? world.get(o.target, BlightWolf) ?? golem;
    if (knockable) {
      knockable.kx += kx;
      knockable.ky += ky;
    }
  }

  world.emit(new HitEvent(tTr.x, tTr.y - 14, amount, crit, kill, o.hitAngle, o.element));

  if (kill) {
    // 橙装「噬魂坠」:击杀回复 3 点生命
    // 橙装「噬魂坠」:击杀回复(数值读 balance.specials)
    if (srcPlayer && o.source !== null) {
      const heal = killHeal(srcPlayer.specials);
      if (heal > 0) {
        const srcHp = world.get(o.source, Health);
        if (srcHp && srcHp.hp > 0) srcHp.hp = Math.min(srcHp.max, srcHp.hp + heal);
      }
    }
    const slime = world.get(o.target, FrostSlime);
    const kind = shroom ? 'shroomling'
      : world.has(o.target, WindBee) ? 'windbee'
      : world.has(o.target, BlightWolf) ? 'blightwolf'
      : world.has(o.target, ThornVine) ? 'thornvine'
      : golem ? 'oakgolem'
      : world.has(o.target, MidBossStag) ? 'midboss_mossstag'
      : world.has(o.target, BossNanmir) ? 'boss_nanmir'
      : world.has(o.target, BossVelsha) ? 'boss_velsha'
      : world.has(o.target, BossKazra) ? 'boss_kazra'
      : world.has(o.target, CinderRat) ? 'cinderrat'
      : world.has(o.target, DuneBeetle) ? 'dunebeetle'
      : world.has(o.target, FlameDancer) ? 'flamedancer'
      : world.has(o.target, DustStinger) ? 'duststinger'
      : world.has(o.target, SnowPuff) ? 'snowpuff'
      : world.has(o.target, IceTurtle) ? 'iceturtle'
      : world.has(o.target, BlizzardHawk) ? 'blizzardhawk'
      : world.has(o.target, FrostMage) ? 'frostmage'
      : world.has(o.target, EmberImp) ? 'emberimp'
      : slime ? 'frostslime'
      : world.has(o.target, SparkLizard) ? 'sparklizard'
      : world.has(o.target, ToxinToad) ? 'toxintoad'
      : world.has(o.target, StardustSprite) ? 'stardustsprite'
      : 'monster';
    world.emit(new KillEvent(tTr.x, tTr.y, kind));
    // 菇灵死亡孢子雾(毒,伤玩家)——教学元素机制(docs/01 §8)
    if (shroom) {
      const sp = balance.enemies.shroomling.spore;
      const z = world.create();
      world.add(z, new Transform(tTr.x, tTr.y));
      world.add(z, new Zone(sp.radiusM * M, sp.lifeS, sp.intervalS, balance.enemies.shroomling.atk, sp.mult, 'toxin', 'enemy', elementColor('toxin')));
    }
    // 霜核史莱姆:大只死亡分裂成两只小只(继承缩放血量)
    if (slime && slime.size === 2) {
      const cfg = balance.enemies.frostslime;
      const tHp = world.get(o.target, Health);
      const tStats = world.get(o.target, Stats);
      const tBody = world.get(o.target, Body);
      for (let i = 0; i < cfg.split.count; i++) {
        const a = Math.random() * Math.PI * 2;
        const mini = world.create();
        world.add(mini, new Transform(tTr.x + Math.cos(a) * 18, tTr.y + Math.sin(a) * 18));
        world.add(mini, new Velocity());
        world.add(mini, new Body((tBody?.radius ?? cfg.bodyRadius) * cfg.split.radiusMult));
        world.add(mini, new Health(Math.max(1, Math.round((tHp?.max ?? cfg.hp) * cfg.split.hpMult))));
        world.add(mini, new Stats(Math.round((tStats?.atk ?? cfg.atk) * 0.7), cfg.speed * 1.25, 0, 1, 0));
        world.add(mini, new Faction('enemy'));
        world.add(mini, new FrostSlime(1));
        world.add(mini, new ElementMarks());
        world.add(mini, new Buffs());
      }
    }
    world.destroy(o.target);
  }
}

function gainRage(world: World, source: Entity | null, crit: boolean): void {
  if (source === null) return;
  const p = world.get(source, Player);
  if (p) p.rage = Math.min(100, p.rage + (crit ? 8 : 4));
}

/** 六种连锁反应效果(docs/01-GDD.md §6) */
function triggerReaction(
  world: World,
  id: string,
  name: string,
  color: string,
  o: DealOpts,
  triggerAmount: number,
  tTr: Transform,
  depth: number,
  elA: string | null = null,
  elB: string | null = null,
): void {
  world.emit(new ReactionEvent(tTr.x, tTr.y - 30, name, color, elA, elB));

  const enemiesAround = (rangeM: number): Entity[] =>
    world.query(Health, Transform, Faction).filter((e) => {
      if (e === o.target) return false;
      const f = world.mustGet(e, Faction);
      if (f.team === 'player') return false;
      const tr = world.mustGet(e, Transform);
      return Math.hypot(tr.x - tTr.x, tr.y - tTr.y) <= rangeM * M;
    });

  switch (id) {
    // 蒸爆:范围 AOE,可继续引爆邻怪印记(多米诺)
    case 'steam': {
      world.emit(new RingFxEvent(tTr.x, tTr.y, RX.steam.radiusM * M, color));
      for (const e of enemiesAround(RX.steam.radiusM)) {
        const tr = world.mustGet(e, Transform);
        dealDamage(world, {
          source: o.source, target: e, mult: RX.steam.mult, element: o.element,
          hitAngle: Math.atan2(tr.y - tTr.y, tr.x - tTr.x),
          atkOverride: triggerAmount, canCrit: false, chainDepth: depth + 1,
        });
      }
      break;
    }
    // 超载:单体大额 + 强击退
    case 'overload': {
      dealDamage(world, {
        source: o.source, target: o.target, mult: RX.overload.mult, element: null,
        hitAngle: o.hitAngle, atkOverride: triggerAmount, canCrit: false,
        knockbackM: RX.overload.knockM, chainDepth: depth + 1,
      });
      break;
    }
    // 燃瘴:毒火云
    case 'miasma': {
      const z = world.create();
      world.add(z, new Transform(tTr.x, tTr.y));
      const srcAtk = (o.source !== null ? world.get(o.source, Stats)?.atk : undefined) ?? triggerAmount;
      world.add(z, new Zone(RX.miasma.radiusM * M, RX.miasma.lifeS, RX.miasma.intervalS, srcAtk, RX.miasma.mult, 'fire', 'player', color));
      break;
    }
    // 冻链:电弧弹射 + 减速
    case 'chain': {
      let n = 0;
      for (const e of enemiesAround(RX.chain.rangeM)) {
        if (n >= RX.chain.targets) break;
        n++;
        const tr = world.mustGet(e, Transform);
        world.emit(new BeamFxEvent(tr.x, tr.y, color));
        const b = world.get(e, Buffs);
        if (b) { b.slowT = RX.chain.slowS; b.slowPct = RX.chain.slowPct; }
        dealDamage(world, {
          source: o.source, target: e, mult: RX.chain.mult, element: null,
          hitAngle: Math.atan2(tr.y - tTr.y, tr.x - tTr.x),
          atkOverride: triggerAmount, canCrit: false, chainDepth: depth + 1,
        });
      }
      break;
    }
    // 脆蚀:易伤 debuff
    case 'brittle': {
      const b = world.get(o.target, Buffs);
      if (b) b.vulnT = RX.brittle.vulnS;
      break;
    }
    // 麻痹:眩晕
    case 'numb': {
      const b = world.get(o.target, Buffs);
      if (b) b.stunT = RX.numb.stunS;
      break;
    }
    default:
      break;
  }
}
