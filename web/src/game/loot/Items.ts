import { t } from '@game/i18n';
import { Rng } from '@engine/core/Rng';
import balance from '@data/balance.json';
import affixPool from '@data/affixes/pool.json';
import bases from '@data/items/bases.json';
import type { AffixDef, CondId } from './AffixRules';
import { specialsForSlot } from './Specials';

export type Slot = 'weapon' | 'helmet' | 'chest' | 'boots' | 'ring' | 'amulet';
export type Rarity = 'common' | 'fine' | 'rare' | 'epic' | 'legendary';

export const SLOTS: readonly Slot[] = ['weapon', 'helmet', 'chest', 'boots', 'ring', 'amulet'];
export const RARITIES: readonly Rarity[] = ['common', 'fine', 'rare', 'epic', 'legendary'];

export interface AffixRoll {
  id: string;
  name: string;
  stat: string;
  value: number;
  suffix: string;
  /** 负面面(tradeoff 词条):与加成**同时**生效,见 loot/AffixRules.ts */
  neg?: { stat: string; name: string; suffix: string; value: number };
  /** 条件(conditional 词条):不满足时加成面失效,负面面照旧 */
  cond?: CondId;
}

export interface Item {
  uid: number;
  slot: Slot;
  name: string;
  glyph: string;
  rarity: Rarity;
  baseStat: string;
  baseStatName: string;
  baseValue: number;
  affixes: AffixRoll[];
  /** 橙装专属特效 id(emberstride/soulfeast/tempest) */
  special?: string;
  specialDesc?: string;
}

const L = balance.loot;

/**
 * 装备生成器:稀有度权重 + 词条随机滚动 + 200 次无橙保底(docs/03-NUMBERS.md §5-6)。
 * 可播种,同 seed 掉落序列一致。
 */
export class ItemFactory {
  private nextUid = 1;
  /** 距上次橙装的装备掉落数(保底计数,后续接入存档) */
  pityCount = 0;

  constructor(private readonly rng: Rng) {}

  /** luck: 每点幸运紫橙权重 ×(1+0.8%),上限 +50% */
  roll(luck = 0): Item {
    const rarity = this.rollRarity(luck);
    const slot = this.rng.pick(SLOTS);
    return this.make(slot, rarity);
  }

  make(slot: Slot, rarity: Rarity): Item {
    if (rarity === 'legendary') this.pityCount = 0;
    else this.pityCount++;

    const tier = RARITIES.indexOf(rarity);
    const base = bases.bases[slot];
    const [lo, hi] = (L.baseValues as Record<Slot, number[][]>)[slot][tier];
    const baseValue = this.rng.int(lo, hi);

    const affixes = this.rollAffixes(slot, rarity);
    let name = `${t((bases.rarityPrefix as Record<Rarity, string>)[rarity])}${t('item.sep')}${t(base.name)}`;
    let special: string | undefined;
    let specialDesc: string | undefined;

    if (rarity === 'legendary') {
      // 9 个橙装特效按部位分池(轮 19:3 → 9,每部位 ≥1);随机取一个
      const pool = specialsForSlot(slot);
      if (pool.length > 0) {
        const sp = this.rng.pick(pool);
        special = sp.id;
        specialDesc = t(sp.desc);
        name = t(sp.itemName);
      }
    }

    return {
      uid: this.nextUid++,
      slot,
      name,
      glyph: base.glyph,
      rarity,
      baseStat: base.baseStat,
      baseStatName: t(base.statName),
      baseValue,
      affixes,
      special,
      specialDesc,
    };
  }

  private rollRarity(luck: number): Rarity {
    // 保底
    if (this.pityCount >= L.pity) return 'legendary';

    const luckMult = 1 + Math.min(luck * 0.008, 0.5);
    const w = L.rarityWeights;
    const weights: Array<[Rarity, number]> = [
      ['common', w.common],
      ['fine', w.fine],
      ['rare', w.rare],
      ['epic', w.epic * luckMult],
      ['legendary', w.legendary * luckMult],
    ];
    const total = weights.reduce((s, [, v]) => s + v, 0);
    let r = this.rng.next() * total;
    for (const [rarity, v] of weights) {
      r -= v;
      if (r <= 0) return rarity;
    }
    return 'common';
  }

  private rollAffixes(slot: Slot, rarity: Rarity): AffixRoll[] {
    const count = (L.affixCount as Record<Rarity, number>)[rarity];
    if (count === 0) return [];
    const highTier = rarity === 'epic' || rarity === 'legendary';
    const pool = (affixPool.affixes as AffixDef[]).filter((a) => a.slots.includes(slot));   // 定义见 data/affixes/pool.json
    const picked: AffixRoll[] = [];
    const used = new Set<string>();
    let guard = 0;
    while (picked.length < count && guard++ < 50 && used.size < pool.length) {
      const def = this.rng.pick(pool);
      if (used.has(def.id)) continue;
      used.add(def.id);
      const [lo, hi] = highTier ? def.hi : def.lo;
      const roll: AffixRoll = {
        id: def.id,
        name: t(def.name),
        stat: def.stat,
        value: this.rng.int(lo, hi),
        suffix: def.suffix,
      };
      // tradeoff 的负面面与加成一起掷(只掷加成 = 纯加强,取舍设计就失效了)
      if (def.neg) {
        const [nlo, nhi] = highTier ? def.neg.hi : def.neg.lo;
        roll.neg = { stat: def.neg.stat, name: t(def.neg.name), suffix: def.neg.suffix, value: this.rng.int(nlo, nhi) };
      }
      if (def.cond) roll.cond = def.cond;
      picked.push(roll);
    }
    return picked;
  }
}
