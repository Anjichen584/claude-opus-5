import type { World, Entity } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { runMods } from '@game/dungeon/RunMods';
import { Equipment, Health, Inventory, Player, Stats } from '@game/components';
import { meta } from '@game/meta/Save';
import { clock } from '@game/dungeon/Clock';
import { effectiveFaces, type AffixContext } from './AffixRules';
import { specialDef, statMods, type SpecialDef } from './Specials';
import type { Item } from './Items';

/**
 * 穿戴/卸下 + 属性重算。
 * 重算规则(docs/03-NUMBERS.md §5):基础值 + 装备基础属性(加法) → 百分比词条(乘法)。
 */

export function recompute(world: World, pe: Entity, ctx?: Partial<AffixContext>): void {
  const B = balance.player;
  const stats = world.mustGet(pe, Stats);
  const hp = world.mustGet(pe, Health);
  const p = world.mustGet(pe, Player);
  const eq = world.mustGet(pe, Equipment);

  // 祭坛永久成长(局外,+3%/级)× 职业乘区 × 局内事件加成
  // 周常铁律「封坛」:本局祭坛成长失效(把局外强度清零,老玩家新玩家同一口径)
  const altar = runMods.altarOff ? { hp: 0, atk: 0, luck: 0 } : meta.data.altar;
  const pl = world.mustGet(pe, Player);
  const kls = balance.classes[pl.klass];
  let atkFlat = B.atk * (1 + altar.atk * balance.altar.atkPerLvl) * kls.atkMult * (1 + pl.runBuffAtk) * runMods.eff.playerAtk;
  let hpFlat = B.hp * (1 + altar.hp * balance.altar.hpPerLvl) * kls.hpMult * pl.runHpMult * runMods.eff.playerHp;
  let critFlat = B.critRate;
  let moveBasePct = 0;
  let atkPct = 0;
  let hpPct = 0;
  let critDmgPct = 0;
  let cdrPct = 0;
  let movePct = 0;
  let elemPct = 0;
  let pickupPct = 0;
  // 轮 18 新增的词条面:固定攻击/固定生命/受伤减免/回血速率/幸运/怒气获取
  let atkFlatAdd = 0;
  let hpFlatAdd = 0;
  let dmgReducePct = 0;
  let regenPct = 0;
  let luckFlat = 0;
  let ragePct = 0;
  const specials: string[] = [];
  const specialDefs: SpecialDef[] = [];

  // 条件词条要的局面(调用方可覆盖;默认从世界/时钟读,保证菜单与实战一致)
  const affixCtx: AffixContext = {
    hpRatio: hp.max > 0 ? hp.hp / hp.max : 1,
    isNight: clock.isNight(),
    bossNearby: false,
    moving: p.moving,
    ...ctx,
  };

  for (const item of Object.values(eq.slots)) {
    if (!item) continue;
    // 基础属性
    switch (item.baseStat) {
      case 'atk': atkFlat += item.baseValue; break;
      case 'hp': hpFlat += item.baseValue; break;
      case 'movePct': moveBasePct += item.baseValue; break;
      case 'critRate': critFlat += item.baseValue / 100; break;
      default: break;
    }
    // 词条:**当前生效**的那些面(条件不满足的加成面会被过滤掉,但代价面照旧)
    for (const f of effectiveFaces(item.affixes, affixCtx)) {
      const sign = f.side === 'plus' ? 1 : -1;
      const v = f.value * sign;
      switch (f.stat) {
        case 'atkPct': atkPct += v; break;
        case 'hpPct': hpPct += v; break;
        case 'atkFlat': atkFlatAdd += v; break;
        case 'hpFlat': hpFlatAdd += v; break;
        case 'critRate': critFlat += v / 100; break;
        case 'critDmg': critDmgPct += v; break;
        case 'cdr': cdrPct += v; break;
        case 'movePct': movePct += v; break;
        case 'elemDmg': elemPct += v; break;
        case 'pickupPct': pickupPct += v; break;
        case 'dmgReduce': dmgReducePct += v; break;
        case 'regenPct': regenPct += v; break;
        case 'luck': luckFlat += v; break;
        case 'ragePct': ragePct += v; break;
        default: break;
      }
    }
    if (item.special) {
      specials.push(item.special);
      const d = specialDef(item.special);
      if (d) specialDefs.push(d);
    }
  }

  // 橙装特效的持续型属性修正(猎风兜帽:移动时 +攻;星陨兜帽:受击窗口内 +攻)
  const spec = statMods(specials, { moving: affixCtx.moving, sinceHurtS: p.sinceHurtS ?? Infinity });
  atkPct += spec.atkPct;

  stats.atk = Math.round((atkFlat + atkFlatAdd) * (1 + atkPct / 100));
  stats.critRate = Math.min(critFlat, 1);
  stats.critDmg = B.critDmg + critDmgPct / 100;
  stats.moveSpeed = B.moveSpeed * kls.speedMult * (1 + pl.runBuffSpeed) * (1 + (moveBasePct + movePct) / 100);

  const newMax = Math.round((hpFlat + hpFlatAdd) * (1 + hpPct / 100));
  const ratio = hp.max > 0 ? hp.hp / hp.max : 1;
  hp.max = newMax;
  hp.hp = Math.min(newMax, Math.max(1, Math.round(newMax * ratio)));

  // 上限 40%(docs/03 §1);带「迅影」类挑战词条时放宽,否则词条会被上限吃掉
  p.cdr = Math.min(cdrPct / 100 + runMods.eff.cdr, runMods.cdrCap);
  p.elemDmg = elemPct / 100;
  p.pickupRadiusM = balance.loot.pickupBaseM * (1 + pickupPct / 100);
  p.specials = specials;
  // 轮 18/19 新增的派生字段(受伤减免走 applyHurt;回血速率走脱战回血;怒气走命中攒怒)
  p.dmgReduce = Math.max(0, Math.min(0.75, dmgReducePct / 100));   // 上限 75%:再高就等于无敌
  p.regenMult = 1 + Math.max(0, regenPct) / 100;
  p.luck = luckFlat;
  p.rageMult = 1 + Math.max(0, ragePct) / 100;
  p.specialDefs = specialDefs;
}

/** 穿上背包第 idx 件;原装备回背包。 */
export function equipFromInventory(world: World, pe: Entity, idx: number): void {
  const inv = world.mustGet(pe, Inventory);
  const eq = world.mustGet(pe, Equipment);
  const item = inv.items[idx];
  if (!item) return;
  inv.items.splice(idx, 1);
  const old = eq.slots[item.slot];
  eq.slots[item.slot] = item;
  if (old) inv.items.push(old);
  recompute(world, pe);
}

/** 卸下某部位到背包(背包满则不动) */
export function unequipSlot(world: World, pe: Entity, slot: Item['slot']): void {
  const inv = world.mustGet(pe, Inventory);
  const eq = world.mustGet(pe, Equipment);
  const item = eq.slots[slot];
  if (!item || inv.items.length >= balance.loot.invSize) return;
  delete eq.slots[slot];
  inv.items.push(item);
  recompute(world, pe);
}

/** 分解成星尘 */
export function salvage(item: Item): number {
  return (balance.loot.salvage as Record<string, number>)[item.rarity] ?? 5;
}
