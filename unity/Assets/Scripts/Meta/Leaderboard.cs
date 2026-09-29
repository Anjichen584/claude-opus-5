using System;
using System.Collections.Generic;
using StarfallKnights.Data;

namespace StarfallKnights.Meta
{
    /// <summary>
    /// 本地排行榜镜像(web: game/meta/Leaderboard.ts;数值: balance.json 的 leaderboard 段)。
    ///
    /// 四条榜:最快通关 / 单局击杀 / 单次最高伤害 / 最快无伤通关。
    /// 规则与 web 逐条一致(排序方向、门槛、前 N 截断、清洗口径),便于 Unity 端做同样的面板。
    /// 「本地」是设计选择:云端榜要后端(账号/防作弊/托管),对单机 roguelite 是过度工程;
    /// 玩家真正需要的是"我上一把打得怎么样"。
    /// </summary>
    public static class Leaderboard
    {
        public enum Board { Speed = 0, Kills = 1, Hit = 2, NoHit = 3 }

        public static readonly Board[] Boards = { Board.Speed, Board.Kills, Board.Hit, Board.NoHit };

        /// <summary>越小越好(时间类)→ 升序;否则降序</summary>
        public static bool Ascending(Board b) => b == Board.Speed || b == Board.NoHit;

        public static string Label(Board b)
        {
            switch (b)
            {
                case Board.Speed: return "⚡ 最快通关";
                case Board.Kills: return "💀 单局击杀";
                case Board.Hit: return "💥 单次最高伤害";
                default: return "🛡 最快无伤通关";
            }
        }

        public static string Hint(Board b)
        {
            switch (b)
            {
                case Board.Speed: return "通关用时越短越前";
                case Board.Kills: return "一局里砍倒的敌人总数";
                case Board.Hit: return "单次伤害峰值(暴击/连锁能上大数字)";
                default: return "整局零受伤的通关用时";
            }
        }

        // ---- 配置(镜像 balance.json,由 ParityTests 逐键比对)----
        public const int TopN = 5;
        public const int MinKills = 5;
        public const int MinHit = 1;

        public static readonly Dictionary<string, float> Parity = new Dictionary<string, float>
        {
            { "leaderboard.topN", TopN },
            { "leaderboard.minKills", MinKills },
            { "leaderboard.minHit", MinHit },
        };

        /// <summary>榜单条目(web LbEntry)</summary>
        public struct Entry
        {
            public double Score;
            public string Klass;
            public int Chapter;   // 1..3
            public double At;     // 毫秒时间戳(仅展示用)
            public string Tag;    // '' / 'daily:...' / 'weekly:...'

            public Entry(double score, string klass, int chapter, double at = 0, string tag = "")
            {
                Score = score; Klass = klass; Chapter = chapter; At = at; Tag = tag ?? "";
            }
        }

        /// <summary>一次出征的成绩(web RunScore)</summary>
        public struct RunScore
        {
            public bool Cleared;
            public bool NoHit;
            public double TimeS;
            public int Kills;
            public double MaxHit;
            public string Klass;
            public int Chapter;
            public string Tag;
            public double At;
        }

        /// <summary>四条榜(web Leaderboards)</summary>
        public sealed class Boards4
        {
            public readonly List<Entry> Speed = new List<Entry>();
            public readonly List<Entry> Kills = new List<Entry>();
            public readonly List<Entry> Hit = new List<Entry>();
            public readonly List<Entry> NoHit = new List<Entry>();

            public List<Entry> Of(Board b)
            {
                switch (b)
                {
                    case Board.Speed: return Speed;
                    case Board.Kills: return Kills;
                    case Board.Hit: return Hit;
                    default: return NoHit;
                }
            }

            /// <summary>有几条榜已有记录(成就「榜上有名」用)</summary>
            public int Filled()
            {
                int n = 0;
                foreach (var b in Boards) if (Of(b).Count > 0) n++;
                return n;
            }
        }

        private static bool KnownKlass(string k) => k == "blade" || k == "ranger" || k == "arcanist" || k == "warden";

        /// <summary>按榜单方向排序;同分时"最近一次"在前(与 web 一致)</summary>
        public static List<Entry> Sort(Board b, IEnumerable<Entry> entries)
        {
            var list = new List<Entry>(entries);
            bool asc = Ascending(b);
            list.Sort((a, c) =>
            {
                if (Math.Abs(a.Score - c.Score) > 1e-9) return asc ? a.Score.CompareTo(c.Score) : c.Score.CompareTo(a.Score);
                return c.At.CompareTo(a.At);
            });
            return list;
        }

        /// <summary>这次出征进哪些榜(未通关也能进击杀/单次伤害榜)</summary>
        public static Dictionary<Board, Entry> RunScores(RunScore run)
        {
            var outMap = new Dictionary<Board, Entry>();
            Entry Make(double score) => new Entry(score, run.Klass, run.Chapter, run.At, run.Tag);
            if (run.Cleared && run.TimeS > 0)
            {
                outMap[Board.Speed] = Make(run.TimeS);
                if (run.NoHit) outMap[Board.NoHit] = Make(run.TimeS);
            }
            if (run.Kills >= MinKills) outMap[Board.Kills] = Make(run.Kills);
            if (run.MaxHit >= MinHit) outMap[Board.Hit] = Make(run.MaxHit);
            return outMap;
        }

        /// <summary>提交一次出征:并入、排序、截断到前 N;返回本次进入的榜</summary>
        public static Dictionary<Board, Entry> Submit(Boards4 lb, RunScore run)
        {
            var scores = RunScores(run);
            foreach (var b in Boards)
            {
                if (!scores.TryGetValue(b, out var entry)) continue;
                var list = lb.Of(b);
                list.Add(entry);
                var sorted = Sort(b, list);
                sorted.RemoveRange(Math.Min(TopN, sorted.Count), Math.Max(0, sorted.Count - TopN));
                list.Clear();
                list.AddRange(sorted);
            }
            return scores;
        }

        /// <summary>清洗:丢掉脏条目(未知职业/章节、非正数、非有限数),重排并截断</summary>
        public static void Sanitize(Boards4 lb)
        {
            foreach (var b in Boards)
            {
                var list = lb.Of(b);
                var clean = new List<Entry>();
                foreach (var e in list)
                {
                    if (double.IsNaN(e.Score) || double.IsInfinity(e.Score) || e.Score <= 0) continue;
                    if (!KnownKlass(e.Klass)) continue;
                    if (e.Chapter < 1 || e.Chapter > 3) continue;
                    clean.Add(new Entry(e.Score, e.Klass, e.Chapter, double.IsNaN(e.At) ? 0 : Math.Max(0, e.At), e.Tag ?? ""));
                }
                var sorted = Sort(b, clean);
                sorted.RemoveRange(Math.Min(TopN, sorted.Count), Math.Max(0, sorted.Count - TopN));
                list.Clear();
                list.AddRange(sorted);
            }
        }

        /// <summary>展示:时间类 mm:ss,分数类千分位整数</summary>
        public static string FormatScore(Board b, double score)
        {
            if (Ascending(b))
            {
                int s = (int)Math.Max(0, Math.Round(score));
                return $"{s / 60}:{s % 60:D2}";
            }
            return ((long)Math.Round(score)).ToString("N0", System.Globalization.CultureInfo.InvariantCulture);
        }

        /// <summary>挑战徽标('' = 普通远征)</summary>
        public static string TagLabel(string tag)
        {
            if (string.IsNullOrEmpty(tag)) return "";
            if (tag.StartsWith("daily:")) return "🗓 " + tag.Substring(6);
            if (tag.StartsWith("weekly:")) return "🏅 " + tag.Substring(7);
            return "";
        }

        /// <summary>该条在榜上第几名(1 起;不在榜返回 0)</summary>
        public static int RankOf(Board b, IEnumerable<Entry> entries, Entry entry)
        {
            var sorted = Sort(b, entries);
            for (int i = 0; i < sorted.Count; i++)
            {
                var e = sorted[i];
                if (Math.Abs(e.Score - entry.Score) < 1e-9 && e.Klass == entry.Klass
                    && Math.Abs(e.At - entry.At) < 0.5 && e.Tag == entry.Tag) return i + 1;
            }
            return 0;
        }

        /// <summary>职业中文名(与 balance.classes 一致;测试会核对四个职业都在)</summary>
        public static string KlassName(string klass, BalanceKlassNames names)
        {
            switch (klass)
            {
                case "blade": return names.Blade;
                case "ranger": return names.Ranger;
                case "arcanist": return names.Arcanist;
                case "warden": return names.Warden;
                default: return klass;
            }
        }

        /// <summary>职业名容器(Unity 侧 UI 需要;数值来自 balance.json,不在逻辑层写死)</summary>
        public struct BalanceKlassNames
        {
            public string Blade, Ranger, Arcanist, Warden;
        }
    }
}
