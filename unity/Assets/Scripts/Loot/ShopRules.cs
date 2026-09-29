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
            "blood", "blessing", "fountain", "gamble", "sacrifice", "relic", "echo", "mend",
        };

        /// <summary>代码实现里认得的碑 id(与 Totems 对不上 = 数据加碑忘了写处理)</summary>
        public static readonly string[] ImplementedTotems =
        {
            "blood", "blessing", "fountain", "gamble", "sacrifice", "relic", "echo", "mend",
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

        /// <summary>
        /// 展示元数据(图标/名称/描述/颜色),web 侧 `EventRules.totemVisual` 的镜像。
        /// **为什么元数据也要 parity**:轮 22 的 web 渲染自带一张 3 座碑的小表,而池子有 6 座,
        /// 抽中新碑就是渲染时抛错。轮 25 起两端都只有一份表,`ParityTests.CheckShop` 逐 id 比对 ——
        /// 数据表加碑而这里没跟上,会在测试里立刻现形,而不是等玩家抽到。
        /// </summary>
        public static (string icon, string name, string desc, string color) TotemVisual(string id) => id switch
        {
            "blood" => ("🩸", "血之契约", "生命上限-25% → 一件紫装", "#e05f5f"),
            "blessing" => ("✨", "星辰祝福", "攻击+10% 移速+10%(本局)", "#ffd94f"),
            "fountain" => ("⛲", "星尘涌泉", "+80~150 星尘", "#8fd4c8"),
            "gamble" => ("🎲", "赌徒之骰", "押 ✦60 → 赢则 ×3(40% 概率)", "#c9a0ff"),
            "sacrifice" => ("🕯", "献祭之坛", "-30% 当前生命 → 3 瓶消耗品", "#ffb066"),
            "relic" => ("☄", "陨星残骸", "本职业一枚未拥有符文(集齐折星尘)", "#B067E8"),
            "echo" => ("🔁", "回响之碑", "上一次抉择收益的 50%(折星尘;首次为 ✦40)", "#7fd6d6"),
            "mend" => ("💚", "疗愈之碑", $"回满生命,本局生命上限 ×{Bestiary.EventMendHpMult:0.##}", "#8ee08e"),
            // 不认识的 id 也给一块完整的碑:渲染循环里宁可显示"未知碑",也不能抛错
            _ => ("🗿", id, "未知的碑", "#9aa3ad"),
        };

        /// <summary>回响之碑的结算:重放上一次抉择价值的 echoFrac;没有记录(或负值)走兜底星尘</summary>
        public static int EchoDust(float lastValue)
        {
            float from = float.IsNaN(lastValue) || float.IsInfinity(lastValue) ? 0f : Math.Max(0f, lastValue);
            return from > 0f
                ? (int)Math.Round(from * Bestiary.EventEchoFrac, MidpointRounding.AwayFromZero)
                : (int)Bestiary.EventEchoFallbackDust;
        }

        /// <summary>
        /// 抉择收益的星尘当量(web `repayValue` 的镜像)。数值化收益有三个用途:
        /// ① 回响之碑按半量重放;② 总览显示"这一局秘境赚了多少";③ 平衡改动能横向比较各座碑。
        /// </summary>
        public static int RepayValue(string kind, bool won = false, int gambleSpent = 0, int gambleDust = 0,
                                     int consCount = 0, bool hasRune = false, int relicDust = 0, int dust = 0) => kind switch
        {
            "blood" => (int)Bestiary.EventRepayBlood,
            "blessing" => (int)Bestiary.EventRepayBlessing,
            "fountain" => dust,
            "gamble" => won ? gambleDust - gambleSpent : -gambleSpent,
            "sacrifice" => consCount * (int)Bestiary.EventRepayCons,
            "relic" => hasRune ? (int)Bestiary.EventRepayRune : relicDust,
            "echo" => dust,
            "mend" => (int)Bestiary.EventRepayMend,
            _ => 0,
        };

        /// <summary>一条秘境抉择记录(镜像 web `TotemChoice`;totem 用字符串以便容忍坏档)</summary>
        public readonly struct TotemChoice
        {
            public readonly int Floor;
            public readonly string Totem;
            public readonly int Value;
            public TotemChoice(int floor, string totem, int value)
            {
                Floor = floor < 0 ? 0 : floor;
                Totem = totem;
                Value = value;
            }
        }

        /// <summary>记录押进列表头部并裁到上限(镜像 web `pushChoice`;不改入参列表)</summary>
        public static List<TotemChoice> PushChoice(IReadOnlyList<TotemChoice> log, TotemChoice c)
        {
            int cap = Math.Max(1, (int)Bestiary.EventEventLogMax);
            var outp = new List<TotemChoice> { c };
            for (int i = 0; i < log.Count && outp.Count < cap; i++) outp.Add(log[i]);
            return outp;
        }

        /// <summary>汇总:每座碑被选几次、累计多少星尘当量(镜像 web `summariseChoices`)</summary>
        public static (Dictionary<string, int> counts, Dictionary<string, int> byId, int total) SummariseChoices(
            IReadOnlyList<TotemChoice> log)
        {
            var counts = new Dictionary<string, int>();
            var byId = new Dictionary<string, int>();
            int total = 0;
            foreach (var c in log)
            {
                counts[c.Totem] = counts.TryGetValue(c.Totem, out var n) ? n + 1 : 1;
                byId[c.Totem] = (byId.TryGetValue(c.Totem, out var v) ? v : 0) + c.Value;
                total += c.Value;
            }
            return (counts, byId, total);
        }
    }
}
