using System;
using System.Collections.Generic;
using StarfallKnights.Core;
using StarfallKnights.Dungeon;

namespace StarfallKnights.Meta
{
    /// <summary>
    /// 挑战系统镜像(web: meta/Daily.ts + meta/Weekly.ts;数据: web/src/data/challenges.json)。
    ///
    /// 每日挑战 = 日期键 → 3 条词条(纯数值乘区);
    /// 周常挑战 = ISO 周键 → 1 条**铁律**(结构性:多一波怪/商店关门/祭坛失效/精英提前/地形定死)
    ///            + 2 条每日池词条。
    ///
    /// 抽签链路与 web 逐行同构(FNV-1a + 雪崩 → mulberry32 → 依次:抽铁律 → 抽词条 → 抽地形),
    /// 所以同一个周键在两端抽到的是同一套规则 —— 由 Tests 里的 golden 向量锁死。
    /// 数值一律走 <see cref="Parity"/> + ParityTests 与 JSON 逐键比对。
    /// </summary>
    public static class Challenges
    {
        /// <summary>每日词条(纯乘区;1 = 中性)</summary>
        public struct DailyMod
        {
            public string Id;
            public float Hp, Atk, Drop, Cdr, PlayerAtk, PlayerHp, Potion, Cycle;

            public DailyMod(string id, float hp = 1f, float atk = 1f, float drop = 1f, float cdr = 0f,
                float playerAtk = 1f, float playerHp = 1f, float potion = 0f, float cycle = 1f)
            {
                Id = id; Hp = hp; Atk = atk; Drop = drop; Cdr = cdr;
                PlayerAtk = playerAtk; PlayerHp = playerHp; Potion = potion; Cycle = cycle;
            }
        }

        /// <summary>周常铁律:数值之外还能改本局结构</summary>
        public struct WeeklyRule
        {
            public string Id;
            public int ExtraWaves;      // 每房额外波数
            public bool ShopClosed;     // 商店房不再出现
            public bool AltarOff;       // 祭坛成长失效
            public int EliteShift;      // 精英房位置偏移(负数 = 提前)
            public string[] ForcedLayouts; // 强制地形候选(空 = 随机)
            public float Hp, Atk, Drop, Cdr, PlayerAtk, PlayerHp, Potion, Cycle;

            public WeeklyRule(string id, int extraWaves = 0, bool shopClosed = false, bool altarOff = false,
                int eliteShift = 0, string[] forcedLayouts = null, float hp = 1f, float atk = 1f, float drop = 1f,
                float cdr = 0f, float playerAtk = 1f, float playerHp = 1f, float potion = 0f, float cycle = 1f)
            {
                Id = id; ExtraWaves = extraWaves; ShopClosed = shopClosed; AltarOff = altarOff;
                EliteShift = eliteShift; ForcedLayouts = forcedLayouts ?? Array.Empty<string>();
                Hp = hp; Atk = atk; Drop = drop; Cdr = cdr;
                PlayerAtk = playerAtk; PlayerHp = playerHp; Potion = potion; Cycle = cycle;
            }
        }

        /// <summary>本局的结构性改动(普通局/每日局全中性)</summary>
        public struct Structure
        {
            public int ExtraWaves;
            public bool ShopClosed;
            public bool AltarOff;
            public int EliteShift;
            public string ForcedLayout; // null = 随机

            public static Structure Neutral => new Structure { ForcedLayout = null };
        }

        /// <summary>合并后的局内乘区(web MergedMods)</summary>
        public struct Mods
        {
            public float Hp, Atk, Drop, Cdr, PlayerAtk, PlayerHp, Potion, Cycle;

            public static Mods Neutral => new Mods
            {
                Hp = 1f, Atk = 1f, Drop = 1f, Cdr = 0f,
                PlayerAtk = 1f, PlayerHp = 1f, Potion = 0f, Cycle = 1f
            };
        }

        public struct Pick
        {
            public string WeekKey;
            public uint Seed;
            public WeeklyRule Rule;
            public DailyMod[] Mods;   // [0] = 铁律,其后为每日词条
            public Structure Structure;
            public Mods Eff;
        }

        // ---- 数据(与 challenges.json 同序;Parity 按索引比对,顺序错了立刻红)----

        public const int DailyCount = 3;

        public static readonly DailyMod[] DailyPool =
        {
            new DailyMod("horde", hp: 0.75f, atk: 1.3f),
            new DailyMod("juggernaut", hp: 1.45f, drop: 1.3f),
            new DailyMod("frenzy", atk: 1.3f, cdr: 0.15f),
            new DailyMod("greed", drop: 1.6f, atk: 1.15f),
            new DailyMod("swift", cdr: 0.25f, hp: 1.15f),
            new DailyMod("frail", playerHp: 0.75f, drop: 1.35f),
            new DailyMod("mighty", playerAtk: 1.3f, hp: 1.25f),
            new DailyMod("longnight", cycle: 0.6f, atk: 1.15f, drop: 1.25f),
            new DailyMod("thrifty", potion: -1f, playerAtk: 1.25f),
            new DailyMod("fieldmedic", potion: 2f, hp: 1.2f),
        };

        public const int WeeklyDailyPicks = 2;

        public static readonly WeeklyRule[] WeeklyRules =
        {
            new WeeklyRule("bulwark", extraWaves: 1, drop: 1.3f),
            new WeeklyRule("closedmarket", shopClosed: true, drop: 1.45f),
            new WeeklyRule("sealedaltar", altarOff: true, hp: 0.8f),
            new WeeklyRule("earlyelite", eliteShift: -2, drop: 1.25f),
            new WeeklyRule("leyline", forcedLayouts: new[] { "narrow", "ring", "shore" }, hp: 0.85f),
            new WeeklyRule("glasscannon", playerHp: 0.6f, playerAtk: 1.4f),
            new WeeklyRule("dusk", cycle: 0.5f, drop: 1.4f),
            new WeeklyRule("laststand", playerHp: 0.7f, drop: 1.5f, cdr: 0.2f),
        };

        /// <summary>layouts 段与 challenges 段的逐键镜像(键名 = JSON 路径)</summary>
        public static readonly Dictionary<string, float> Parity = BuildParity();

        private static Dictionary<string, float> BuildParity()
        {
            var d = new Dictionary<string, float> { { "daily.count", DailyCount }, { "weekly.dailyMods", WeeklyDailyPicks } };
            for (int i = 0; i < DailyPool.Length; i++)
            {
                var m = DailyPool[i];
                string p = $"daily.mods.{i}.";
                d[p + "hp"] = m.Hp; d[p + "atk"] = m.Atk; d[p + "drop"] = m.Drop; d[p + "cdr"] = m.Cdr;
                d[p + "playerAtk"] = m.PlayerAtk; d[p + "playerHp"] = m.PlayerHp;
                d[p + "potion"] = m.Potion; d[p + "cycle"] = m.Cycle;
            }
            for (int i = 0; i < WeeklyRules.Length; i++)
            {
                var r = WeeklyRules[i];
                string p = $"weekly.rules.{i}.";
                d[p + "extraWaves"] = r.ExtraWaves;
                d[p + "shopClosed"] = r.ShopClosed ? 1f : 0f;
                d[p + "altarOff"] = r.AltarOff ? 1f : 0f;
                d[p + "eliteShift"] = r.EliteShift;
                d[p + "hp"] = r.Hp; d[p + "atk"] = r.Atk; d[p + "drop"] = r.Drop; d[p + "cdr"] = r.Cdr;
                d[p + "playerAtk"] = r.PlayerAtk; d[p + "playerHp"] = r.PlayerHp;
                d[p + "potion"] = r.Potion; d[p + "cycle"] = r.Cycle;
            }
            return d;
        }

        // ---- 键与散列 ----

        /// <summary>ISO-8601 周键 `YYYY-Www`(周一为一周之始,归属看周四)。</summary>
        public static string WeekKey(DateTime date)
        {
            var day = date.Date.AddDays(3 - ((int)date.DayOfWeek + 6) % 7);
            int year = day.Year;
            var jan4 = new DateTime(year, 1, 4);
            var jan4Monday = jan4.AddDays(-(((int)jan4.DayOfWeek + 6) % 7));
            int week = (int)Math.Round((day - jan4Monday).TotalDays / 7.0) + 1;
            return $"{year}-W{week:D2}";
        }

        /// <summary>本地日期键 YYYY-MM-DD(与 web dailyKey 一致)。</summary>
        public static string DailyKey(DateTime date) => $"{date.Year:D4}-{date.Month:D2}-{date.Day:D2}";

        /// <summary>键 → seed:FNV-1a + MurmurHash3 fmix32 雪崩(与 web keySeed 同构)。</summary>
        public static uint KeySeed(string key)
        {
            uint h = 0x811c9dc5;
            foreach (char c in key)
            {
                h ^= c;
                h = unchecked(h * 0x01000193);
            }
            h ^= h >> 16;
            h = unchecked(h * 0x7feb352d);
            h ^= h >> 15;
            h = unchecked(h * 0x846ca68b);
            h ^= h >> 16;
            return h == 0 ? 1u : h;
        }

        // ---- 抽签(与 web weeklyChallenge 同一条 RNG 序列)----

        /// <summary>周常抽签:抽铁律 → 从每日池抽 N 条(剔除同 id)→ 抽强制地形。</summary>
        public static Pick WeeklyPick(string weekKey)
        {
            uint seed = KeySeed(weekKey);
            var rng = new Rng(seed);
            var rule = WeeklyRules[rng.Int(0, WeeklyRules.Length - 1)];
            var pool = new List<DailyMod>();
            foreach (var m in DailyPool) if (m.Id != rule.Id) pool.Add(m);

            var mods = new List<DailyMod> { ToMod(rule) };
            for (int i = 0; i < WeeklyDailyPicks && pool.Count > 0; i++)
            {
                int idx = rng.Int(0, pool.Count - 1);
                mods.Add(pool[idx]);
                pool.RemoveAt(idx);
            }
            string layout = ForcedLayout(rule, rng);
            return new Pick
            {
                WeekKey = weekKey,
                Seed = seed,
                Rule = rule,
                Mods = mods.ToArray(),
                Structure = StructureOf(rule, layout),
                Eff = Merge(mods.ToArray()),
            };
        }

        /// <summary>铁律的结构部分(web structureOf)。</summary>
        public static Structure StructureOf(WeeklyRule rule, string forcedLayout)
        {
            return new Structure
            {
                ExtraWaves = Math.Max(0, rule.ExtraWaves),
                ShopClosed = rule.ShopClosed,
                AltarOff = rule.AltarOff,
                EliteShift = rule.EliteShift,
                ForcedLayout = forcedLayout,
            };
        }

        /// <summary>从铁律的地形清单里抽一种(按周 seed);清单为空 → null。</summary>
        public static string ForcedLayout(WeeklyRule rule, Rng rng)
        {
            var list = KnownLayouts(rule.ForcedLayouts);
            if (list.Count == 0) return null;
            return list[rng.Int(0, list.Count - 1)];
        }

        /// <summary>过滤掉不认识的地形名(镜像 web 的 LAYOUT_IDS 白名单)。</summary>
        public static List<string> KnownLayouts(string[] ids)
        {
            var outList = new List<string>();
            if (ids == null) return outList;
            foreach (var id in ids) if (RoomLayouts.IsKnown(id)) outList.Add(id);
            return outList;
        }

        /// <summary>乘区合并(web mergeMods):乘区相乘、加区相加。</summary>
        public static Mods Merge(DailyMod[] mods)
        {
            var m = Mods.Neutral;
            foreach (var mod in mods)
            {
                m.Hp *= mod.Hp; m.Atk *= mod.Atk; m.Drop *= mod.Drop;
                m.PlayerAtk *= mod.PlayerAtk; m.PlayerHp *= mod.PlayerHp;
                m.Cycle *= mod.Cycle;
                m.Cdr += mod.Cdr; m.Potion += mod.Potion;
            }
            return m;
        }

        private static DailyMod ToMod(WeeklyRule r)
            => new DailyMod(r.Id, r.Hp, r.Atk, r.Drop, r.Cdr, r.PlayerAtk, r.PlayerHp, r.Potion, r.Cycle);

        /// <summary>铁律只该改"结构"或"数值",不至于两者都没有(数据卫生)。</summary>
        public static bool Touches(WeeklyRule r)
            => Math.Abs(r.Hp - 1f) > 1e-4f || Math.Abs(r.Atk - 1f) > 1e-4f || Math.Abs(r.Drop - 1f) > 1e-4f
               || Math.Abs(r.PlayerAtk - 1f) > 1e-4f || Math.Abs(r.PlayerHp - 1f) > 1e-4f
               || Math.Abs(r.Cycle - 1f) > 1e-4f || Math.Abs(r.Cdr) > 1e-4f || Math.Abs(r.Potion) > 1e-4f
               || r.ExtraWaves != 0 || r.ShopClosed || r.AltarOff || r.EliteShift != 0
               || (r.ForcedLayouts != null && r.ForcedLayouts.Length > 0);

        /// <summary>铁律的"代价"面(与 web 单测同一套判定)。</summary>
        public static bool HasCost(WeeklyRule r)
            => r.Hp > 1.01f || r.Atk > 1.01f || r.Drop < 0.99f || r.PlayerAtk < 0.99f || r.PlayerHp < 0.99f
               || r.Cycle < 0.99f || r.Potion < 0 || r.ExtraWaves > 0 || r.ShopClosed || r.AltarOff
               || r.EliteShift != 0
               || (r.ForcedLayouts != null && r.ForcedLayouts.Length > 0);

        /// <summary>铁律的"好处"面。</summary>
        public static bool HasBenefit(WeeklyRule r)
            => r.Hp < 0.99f || r.Atk < 0.99f || r.Drop > 1.01f || r.PlayerAtk > 1.01f || r.PlayerHp > 1.01f
               || r.Cycle > 1.01f || r.Cdr > 1e-4f || r.Potion > 0;
    }
}
