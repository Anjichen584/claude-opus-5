import type { World, Entity } from '@engine/ecs/World';
import balance from '@data/balance.json';
import { runMods } from '@game/dungeon/RunMods';
import { Equipment, Health, Inventory, Player, Stats } from '@game/components';
import { meta } from '@game/meta/Save';
import type { Item } from './Items';

/**
 * 穿戴/卸下 + 属性重算。
 * 重算规则(docs/03-NUMBERS.md §5):基础值 + 装备基础属性(加法) → 百分比词条(乘法)。
 */

export function recompute(world: World, pe: Entity): void {
  const B = balance.player;
  const stats = world.mustGet(pe, Stats);
  const hp = world.mustGet(pe, Health);
  const p = world.mustGet(pe, Player);
  const eq = world.mustGet(pe, Equipment);

  // 祭坛永久成长(局外,+3%/级)× 职业乘区 × 局内事件加成
  const altar = meta.data.altar;
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
  const specials: string[] = [];

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
    // 词条
    for (const a of item.affixes) {
      switch (a.stat) {
        case 'atkPct': atkPct += a.value; break;
        case 'hpPct': hpPct += a.value; break;
        case 'critRate': critFlat += a.value / 100; break;
        case 'critDmg': critDmgPct += a.value; break;
        case 'cdr': cdrPct += a.value; break;
        case 'movePct': movePct += a.value; break;
        case 'elemDmg': elemPct += a.value; break;
        case 'pickupPct': pickupPct += a.value; break;
        default: break;
      }
    }
    if (item.special) specials.push(item.special);
  }

  stats.atk = Math.round(atkFlat * (1 + atkPct / 100));
  stats.critRate = Math.min(critFlat, 1);
  stats.critDmg = B.critDmg + critDmgPct / 100;
  stats.moveSpeed = B.moveSpeed * kls.speedMult * (1 + pl.runBuffSpeed) * (1 + (moveBasePct + movePct) / 100);

  const newMax = Math.round(hpFlat * (1 + hpPct / 100));
  const ratio = hp.max > 0 ? hp.hp / hp.max : 1;
  hp.max = newMax;
  hp.hp = Math.min(newMax, Math.max(1, Math.round(newMax * ratio)));

  // 上限 40%(docs/03 §1);带「迅影」类挑战词条时放宽,否则词条会被上限吃掉
  p.cdr = Math.min(cdrPct / 100 + runMods.eff.cdr, runMods.cdrCap);
  p.elemDmg = elemPct / 100;
  p.pickupRadiusM = balance.loot.pickupBaseM * (1 + pickupPct / 100);
  p.specials = specials;
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
