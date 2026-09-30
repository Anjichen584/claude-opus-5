using System;
using System.Collections.Generic;

namespace StarfallKnights.Meta
{
    /// <summary>
    /// 成就镜像(web: game/meta/Achievements.ts;权威表: web/src/data/achievements.json)。
    ///
    /// 口径与 web 逐条一致,由 ParityTests.CheckAchievements 逐 id 比对
    /// (cat/icon/metric/goal/timeS 任一漂移即红):
    /// - 判定 = 纯函数:宿主把统计值填进 <see cref="AchvState"/>,这里只算 cur/goal;
    /// - 进度夹到 [0, goal](UI 直接画进度条,不担心越界值);
    /// - 解锁幂等只增不减:<see cref="Unlock"/> 不覆盖已有时间戳;
    /// - 未知 id 一律丢弃(脏档无害,与 web sanitizeAchievements 同规格)。
    /// </summary>
    public static class Achievements
    {
        public enum Cat { Progress, Combat, Speed, Codex, Meta }

        /// <summary>统计口径(metric):每个值在两端各自实现,名字与 JSON 一字不差。</summary>
        public enum Metric
        {
            Runs, Clears, TotalKills, NoHitClears, DailyClears, WeeklyClears,
            Crafts, Stardust, CodexEnemies, CodexRunes, BossFound, MidbossFound,
            BestClassRunes, BoardsFilled, AltarBest, AltarLevels, TotemKinds, TotemTotal,
            /// <summary>最快通关 ≤ TimeS 秒 → 1/1(speed5/6/8 三条共用)</summary>
            BestTimeUnder,
        }

        public readonly struct Def
        {
            public readonly string Id;
            public readonly Cat Category;
            public readonly string Icon;
            public readonly Metric Kind;
            public readonly int Goal;
            /// <summary>仅 BestTimeUnder 用:秒阈值;其余为 0。</summary>
            public readonly float TimeS;

            public Def(string id, Cat cat, string icon, Metric kind, int goal, float timeS = 0f)
            {
                Id = id; Category = cat; Icon = icon; Kind = kind; Goal = goal; TimeS = timeS;
            }
        }

        /// <summary>32 条,顺序与 achievements.json 一致(parity 连顺序一起比)。</summary>
        public static readonly Def[] All =
        {
            new Def("first_run",       Cat.Progress, "🚪", Metric.Runs, 1),
            new Def("first_clear",     Cat.Progress, "🏅", Metric.Clears, 1),
            new Def("clear5",          Cat.Progress, "⚔",  Metric.Clears, 5),
            new Def("clear15",         Cat.Progress, "🌟", Metric.Clears, 15),
            new Def("kills100",        Cat.Combat,   "💥", Metric.TotalKills, 100),
            new Def("kills500",        Cat.Combat,   "🔥", Metric.TotalKills, 500),
            new Def("kills2000",       Cat.Combat,   "☠",  Metric.TotalKills, 2000),
            new Def("nohit",           Cat.Combat,   "🛡",  Metric.NoHitClears, 1),
            new Def("speed8",          Cat.Speed,    "💨", Metric.BestTimeUnder, 1, 480f),
            new Def("speed6",          Cat.Speed,    "⚡", Metric.BestTimeUnder, 1, 360f),
            new Def("codex10",         Cat.Codex,    "📖", Metric.CodexEnemies, 10),
            new Def("codex_boss",      Cat.Codex,    "👑", Metric.BossFound, 3),
            new Def("codex_all_enemy", Cat.Codex,    "🦴", Metric.CodexEnemies, 30),
            new Def("rune18",          Cat.Codex,    "◈",  Metric.CodexRunes, 18),
            new Def("rune_all",        Cat.Codex,    "🔮", Metric.CodexRunes, 48),
            new Def("daily_clear",     Cat.Meta,     "🗓", Metric.DailyClears, 1),
            new Def("weekly_clear",    Cat.Meta,     "🏅", Metric.WeeklyClears, 1),
            new Def("boards_filled",   Cat.Meta,     "🥇", Metric.BoardsFilled, 4),
            new Def("altar5",          Cat.Meta,     "⭐", Metric.AltarBest, 5),
            new Def("altar15",         Cat.Meta,     "✨", Metric.AltarLevels, 15),
            new Def("craft1",          Cat.Meta,     "📜", Metric.Crafts, 1),
            new Def("rich",            Cat.Meta,     "💰", Metric.Stardust, 1000),
            new Def("clear30",         Cat.Progress, "🎖", Metric.Clears, 30),
            new Def("kills5000",       Cat.Combat,   "🌋", Metric.TotalKills, 5000),
            new Def("speed5",          Cat.Speed,    "⏱",  Metric.BestTimeUnder, 1, 300f),
            new Def("codex_mid",       Cat.Codex,    "🗡",  Metric.MidbossFound, 3),
            new Def("codex25",         Cat.Codex,    "🔍", Metric.CodexEnemies, 25),
            new Def("rune_one_class",  Cat.Codex,    "🈴", Metric.BestClassRunes, 12),
            new Def("totem_all",       Cat.Meta,     "🗿", Metric.TotemKinds, 8),
            new Def("totem20",         Cat.Meta,     "⚖",  Metric.TotemTotal, 20),
            new Def("craft5",          Cat.Meta,     "🛠",  Metric.Crafts, 5),
            new Def("rich5k",          Cat.Meta,     "💎", Metric.Stardust, 5000),
        };

        public static int Total => All.Length;

        /// <summary>
        /// 判定输入:宿主(GameBootstrap / 面板)从 MetaSave、Codex、Leaderboard、Challenges
        /// 各处聚合出来的一份快照。这样判定不用绑死存档形状,测试直接手填。
        /// </summary>
        public struct AchvState
        {
            public int Runs, Clears, TotalKills, NoHitClears, DailyClears, WeeklyClears;
            public int Crafts, Stardust;
            public float BestTimeS;
            public int CodexEnemies, CodexRunes, BossFound, MidbossFound, BestClassRunes;
            public int BoardsFilled, AltarBest, AltarLevels, TotemKinds, TotemTotal;

            /// <summary>从 MetaSave 起底(图鉴/榜/秘境字段由宿主再补)。</summary>
            public static AchvState From(MetaSave m) => new AchvState
            {
                Runs = m.runs, Clears = m.clears, TotalKills = m.totalKills, BestTimeS = m.bestTimeS,
                NoHitClears = m.noHitClears, DailyClears = m.dailyClears, WeeklyClears = m.weeklyClears,
                Crafts = m.crafts, Stardust = m.stardust,
                AltarBest = Math.Max(m.altarHp, Math.Max(m.altarAtk, m.altarLuck)),
                AltarLevels = m.altarHp + m.altarAtk + m.altarLuck,
            };
        }

        /// <summary>metric 读值(镜像 web 的 METRIC 表;进度夹取在 Progress 里做)。</summary>
        public static int MetricValue(in Def a, in AchvState s)
        {
            switch (a.Kind)
            {
                case Metric.Runs: return s.Runs;
                case Metric.Clears: return s.Clears;
                case Metric.TotalKills: return s.TotalKills;
                case Metric.NoHitClears: return s.NoHitClears;
                case Metric.DailyClears: return s.DailyClears;
                case Metric.WeeklyClears: return s.WeeklyClears;
                case Metric.Crafts: return s.Crafts;
                case Metric.Stardust: return s.Stardust;
                case Metric.CodexEnemies: return s.CodexEnemies;
                case Metric.CodexRunes: return s.CodexRunes;
                case Metric.BossFound: return s.BossFound;
                case Metric.MidbossFound: return s.MidbossFound;
                case Metric.BestClassRunes: return s.BestClassRunes;
                case Metric.BoardsFilled: return s.BoardsFilled;
                case Metric.AltarBest: return s.AltarBest;
                case Metric.AltarLevels: return s.AltarLevels;
                case Metric.TotemKinds: return s.TotemKinds;
                case Metric.TotemTotal: return s.TotemTotal;
                default: // BestTimeUnder
                    return s.BestTimeS > 0f && s.BestTimeS <= a.TimeS ? 1 : 0;
            }
        }

        /// <summary>当前进度(夹到 [0, goal];web 的 prog() 同款)。</summary>
        public static (int cur, int goal) Progress(in Def a, in AchvState s)
        {
            int cur = MetricValue(a, s);
            if (cur < 0) cur = 0;
            if (cur > a.Goal) cur = a.Goal;
            return (cur, a.Goal);
        }

        public static bool Achieved(in Def a, in AchvState s) => Progress(a, s).cur >= a.Goal;

        // ---------------- 解锁记录(幂等只增不减) ----------------

        /// <summary>
        /// 把新达成的成就写进 unlocked(id → 时间戳)。已有记录**不覆盖**;
        /// 返回本次新解锁的 id 列表(宿主拿去弹 Toast)。
        /// </summary>
        public static List<string> Unlock(Dictionary<string, long> unlocked, in AchvState s, long nowMs)
        {
            var fresh = new List<string>();
            foreach (var a in All)
            {
                if (unlocked.TryGetValue(a.Id, out long ts) && ts > 0) continue;
                if (!Achieved(a, s)) continue;
                unlocked[a.Id] = nowMs;
                fresh.Add(a.Id);
            }
            return fresh;
        }

        /// <summary>清洗脏档:未知 id / 非正时间戳丢弃(web sanitizeAchievements 同规格)。</summary>
        public static Dictionary<string, long> Sanitize(Dictionary<string, long> raw)
        {
            var clean = new Dictionary<string, long>();
            if (raw == null) return clean;
            foreach (var a in All)
            {
                if (raw.TryGetValue(a.Id, out long ts) && ts > 0) clean[a.Id] = ts;
            }
            return clean;
        }

        public static int UnlockedCount(Dictionary<string, long> unlocked)
        {
            int n = 0;
            foreach (var a in All)
                if (unlocked != null && unlocked.TryGetValue(a.Id, out long ts) && ts > 0) n++;
            return n;
        }
    }
}
