using System;
using System.Collections.Generic;
using StarfallKnights.Data;

namespace StarfallKnights.Loot
{
    /// <summary>
    /// 商店与秘境规则镜像(2026-09-29,10-FULL-PLAN 轮 22)。
    ///
    /// 与 web 的对应关系(规则改动必须两边同改,否则 ParityTests 立刻红):
    /// - web/src/game/loot/ShopStock.ts   ↔ 本文件 Shop 区(定价 / 特惠 / 议价 / 符文货架)
    /// - web/src/game/loot/EventRules.ts  ↔ 本文件 Totems 区(碑池 / 能不能选 / 结算)
    ///
    /// 数值不在本文件手抄:全部来自 Data/Bestiary.cs 的生成常量(ShopXxx / EventXxx)。
    /// 这里存在的意义是**边界**:议价的三档切分、失败永远存在、便宜货涨价也不能"看起来没反应"、
    /// 残血不许献祭 —— 这类口径在移植时最容易被抹平成"按一下就完事"。
    /// </summary>
    public static class ShopRules
    {
        public const float Tol = 1e-4f;

        // ---------------- 定价与特惠 ----------------

        /// <summary>
        /// 议价结果。big = 大成功,success = 小成功,fail = 涨价。
        /// </summary>
        public enum Haggle { Big, Success, Fail }

        /// <summary>幸运加成:每点 luckPerPoint,上限 luckMax;NaN/负值当 0(否则概率会变 NaN,连失败档都消失)</summary>
        public static float LuckBonus(float luck)
        {
            float v = float.IsNaN(luck) || float.IsInfinity(luck) ? 0f : Math.Max(0f, luck);
            return Math.Min(Bestiary.ShopHaggleLuckMax, v * Bestiary.ShopHaggleLuckPerPoint);
        }

        /// <summary>三档切分:big 固定**不**吃幸运(否则幸运够了 = 议价必大成功)</summary>
        public static Haggle HaggleOutcome(float roll, float luck)
        {
            float big = Bestiary.ShopHaggleBigChance;
            float success = Bestiary.ShopHaggleSuccessChance + LuckBonus(luck);
            if (roll < big) return Haggle.Big;
            if (roll < big + success) return Haggle.Success;
            return Haggle.Fail;
        }

        /// <summary>议价后的新价:降价下限 1;涨价至少 +1(便宜货按比例涨会四舍五入回原价 → 看起来像没反应)</summary>
        public static int HagglePrice(int price, Haggle outcome)
        {
            if (outcome == Haggle.Fail)
                return Math.Max(price + 1, (int)Math.Round(price * (1f + Bestiary.ShopHaggleMarkup), MidpointRounding.AwayFromZero));
            float off = outcome == Haggle.Big ? Bestiary.ShopHaggleBigOff : Bestiary.ShopHaggleOff;
            return Math.Max(1, (int)Math.Round(price * (1f - off), MidpointRounding.AwayFromZero));
        }

        /// <summary>定价:基准 × (1 ± jitter),至少 1 星尘</summary>
        public static int PriceOf(int basePrice, float roll)
        {
            float j = Bestiary.ShopPriceJitter;
            float mult = 1f + (roll * 2f - 1f) * j;   // roll ∈ [0,1)
            return Math.Max(1, (int)Math.Round(basePrice * mult, MidpointRounding.AwayFromZero));
        }

        /// <summary>特惠折扣后的价(至少 1)</summary>
        public static int DealPrice(int listPrice) =>
            Math.Max(1, (int)Math.Round(listPrice * (1f - Bestiary.ShopDealOff), MidpointRounding.AwayFromZero));

        /// <summary>一次摆几个货位:装备 3 + 符文货架 shelfRunes + 药剂 1 + 消耗品 consStands</summary>
        public static int StockSlots(int shelfRunes) =>
            3 + shelfRunes + 1 + (int)Bestiary.ShopConsStands;

        // ---------------- 秘境碑池 ----------------

        /// <summary>数据表 events.totems 的**字符串清单**镜像(生成器跳过字符串 → CheckShop 逐 id 比)</summary>
        public static readonly string[] Totems =
        {
            "blood", "blessing", "fountain", "gamble", "sacrifice", "relic",
        };

        /// <summary>代码实现里认得的碑 id(与 Totems 对不上 = 数据加碑忘了写处理)</summary>
        public static readonly string[] ImplementedTotems =
        {
            "blood", "blessing", "fountain", "gamble", "sacrifice", "relic",
        };

        /// <summary>数据表里有、但实现里没有的碑</summary>
        public static List<string> MissingTotems()
        {
            var done = new HashSet<string>(ImplementedTotems);
            var missing = new List<string>();
            foreach (var id in Totems) if (!done.Contains(id)) missing.Add(id);
            return missing;
        }

        /// <summary>抽 N 座不重复的碑(用调用方给的随机序列,便于两端用同一种子对照行为)</summary>
        public static List<string> PickTotems(IReadOnlyList<float> rolls)
        {
            var bag = new List<string>(Totems);
            var outp = new List<string>();
            int n = Math.Min((int)Bestiary.EventTotemPick, bag.Count);
            int ri = 0;
            while (outp.Count < n && bag.Count > 0)
            {
                float r = rolls[ri % rolls.Count]; ri++;
                // 只取小数部分当 [0,1) —— 调用方给什么数都能用(负数/整数都不会越界)
                float frac = r - (float)Math.Floor(r);
                int idx = Math.Min(bag.Count - 1, (int)(frac * bag.Count));
                outp.Add(bag[idx]);
                bag.RemoveAt(idx);
            }
            return outp;
        }

        /// <summary>为什么这座碑不能选:null = 能选</summary>
        public static string TotemBlocker(string kind, float hp, int stardust)
        {
            if (kind == "gamble" && stardust < (int)Bestiary.EventGambleCost) return "noStardust";
            if (kind == "sacrifice" && hp <= Math.Max(1f, (float)Math.Ceiling(hp * Bestiary.EventSacrificeHpFrac)))
                return "hpTooLow";
            return null;
        }

        /// <summary>献祭代价:按**当前**生命算,且至少扣 1</summary>
        public static int SacrificeHpCost(float hp) =>
            Math.Max(1, (int)Math.Ceiling(hp * Bestiary.EventSacrificeHpFrac));

        /// <summary>赌局:赢了返投入 × 倍数,输了 0</summary>
        public static int GamblePayout(bool won) =>
            won ? (int)Math.Round(Bestiary.EventGambleCost * Bestiary.EventGambleMult, MidpointRounding.AwayFromZero) : 0;
    }
}
