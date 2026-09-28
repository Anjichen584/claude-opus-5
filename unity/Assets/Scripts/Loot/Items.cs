using System.Collections.Generic;
using StarfallKnights.Core;
using StarfallKnights.Data;

namespace StarfallKnights.Loot
{
    public enum Rarity { Common, Fine, Rare, Epic, Legendary }
    public enum Slot { Weapon, Helmet, Chest, Boots, Ring, Amulet }

    /// <summary>词条(对应 web Affix)。</summary>
    public struct Affix
    {
        public string Key;   // atkPct / hpFlat / critRate / ...
        public float Value;
        public override string ToString() => $"{Key}+{Value}";
    }

    public sealed class Item
    {
        public Slot Slot;
        public Rarity Rarity;
        public string Name;
        public readonly List<Affix> Affixes = new();
    }

    /// <summary>
    /// 装备工厂——与 web/src/game/loot/Items.ts 同构:
    /// 稀有度权重 + 幸运加成 + 保底计数(PityLegendary 次未出橙必出)。
    /// </summary>
    public sealed class ItemFactory
    {
        private readonly Rng _rng;
        public int PityCount;

        // 稀有度基础权重(白/绿/蓝/紫/橙)
        private static readonly float[] Weights = { 0.42f, 0.30f, 0.18f, 0.08f, 0.02f };
        private static readonly string[] AffixPool =
            { "atkPct", "hpFlat", "critRate", "critDmg", "moveSpd", "cdr", "elemDmg", "defFlat" };
        private static readonly int[] AffixCount = { 1, 2, 3, 4, 5 }; // 按稀有度

        public ItemFactory(uint seed) => _rng = new Rng(seed);

        /// <summary>按稀有度权重掷一件(luck 提升高稀有度权重;保底触发必橙)。</summary>
        public Item Roll(float luck)
        {
            PityCount++;
            Rarity rarity;
            if (PityCount >= Balance.PityLegendary)
            {
                rarity = Rarity.Legendary;
                PityCount = 0;
            }
            else
            {
                float[] w = (float[])Weights.Clone();
                w[3] *= 1f + luck;
                w[4] *= 1f + luck;
                float total = 0f;
                foreach (var x in w) total += x;
                double roll = _rng.Next() * total;
                int idx = 0;
                for (; idx < w.Length - 1; idx++)
                {
                    roll -= w[idx];
                    if (roll <= 0) break;
                }
                rarity = (Rarity)idx;
                if (rarity == Rarity.Legendary) PityCount = 0;
            }
            var slots = (Slot[])System.Enum.GetValues(typeof(Slot));
            return Make(_rng.Pick(slots), rarity);
        }

        /// <summary>指定部位+稀有度生成(词条数=稀有度档位)。</summary>
        public Item Make(Slot slot, Rarity rarity)
        {
            var item = new Item { Slot = slot, Rarity = rarity, Name = $"{rarity} {slot}" };
            int n = AffixCount[(int)rarity];
            var pool = new List<string>(AffixPool);
            for (int i = 0; i < n && pool.Count > 0; i++)
            {
                int pi = _rng.Int(0, pool.Count - 1);
                string key = pool[pi];
                pool.RemoveAt(pi);
                item.Affixes.Add(new Affix { Key = key, Value = (float)_rng.Range(1, 10) * ((int)rarity + 1) });
            }
            return item;
        }
    }
}
