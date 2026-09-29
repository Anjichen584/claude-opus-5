using System;
using System.Collections.Generic;
using StarfallKnights.Core;
using StarfallKnights.Data;
using StarfallKnights.Skills;

namespace StarfallKnights.Meta
{
    /// <summary>
    /// 图鉴(收录)—— 与 web/src/game/meta/Codex.ts 同构:只记"见过没有 + 次数",
    /// 展示数值一律现读 <see cref="Bestiary"/> / <see cref="RunePool"/>,不落第二份数据。
    /// Unity 侧持久化交给宿主(PlayerPrefs 存 JSON),本类只管数据与规则。
    /// </summary>
    [Serializable]
    public sealed class Codex
    {
        /// <summary>敌人种类 → 击杀数(&gt;0 即已收录)。</summary>
        public readonly Dictionary<EnemyKind, int> Enemies = new();
        /// <summary>符文 id → 获得次数。</summary>
        public readonly Dictionary<string, int> Runes = new();

        /// <summary>图鉴条目总数(怪物 21 = 18 杂兵 + 3 Boss;符文 36)。</summary>
        public static int EnemyTotal => Bestiary.Stats.Count;
        public static int RuneTotal => RunePool.All().Count;

        // ---------------- 写入 ----------------

        /// <summary>击杀记录 +1;返回 true = 首次收录(宿主可弹"新条目")。</summary>
        public bool MarkKill(EnemyKind kind)
        {
            if (!Bestiary.Stats.ContainsKey(kind)) return false;
            bool first = !Enemies.TryGetValue(kind, out int n) || n <= 0;
            Enemies[kind] = (first ? 0 : n) + 1;
            return first;
        }

        /// <summary>获得符文 +1;返回 true = 首次收录。未知 id 忽略。</summary>
        public bool MarkRune(string runeId)
        {
            if (string.IsNullOrEmpty(runeId) || !IsKnownRune(runeId)) return false;
            bool first = !Runes.TryGetValue(runeId, out int n) || n <= 0;
            Runes[runeId] = (first ? 0 : n) + 1;
            return first;
        }

        private static readonly HashSet<string> KnownRunes = BuildKnownRunes();

        private static HashSet<string> BuildKnownRunes()
        {
            var set = new HashSet<string>();
            foreach (var r in RunePool.All()) set.Add(r.Id);
            return set;
        }

        public static bool IsKnownRune(string id) => KnownRunes.Contains(id);

        // ---------------- 统计 ----------------

        public int EnemyFound
        {
            get
            {
                int c = 0;
                foreach (var kv in Enemies) if (kv.Value > 0 && Bestiary.Stats.ContainsKey(kv.Key)) c++;
                return c;
            }
        }

        public int RuneFound
        {
            get
            {
                int c = 0;
                foreach (var kv in Runes) if (kv.Value > 0 && KnownRunes.Contains(kv.Key)) c++;
                return c;
            }
        }

        /// <summary>收录率 0~1(怪物与符文等权)。</summary>
        public float Pct
        {
            get
            {
                int total = EnemyTotal + RuneTotal;
                return total == 0 ? 0f : (EnemyFound + RuneFound) / (float)total;
            }
        }

        public bool Complete => EnemyFound >= EnemyTotal && RuneFound >= RuneTotal;

        public int KillsOf(EnemyKind kind) => Enemies.TryGetValue(kind, out int n) ? n : 0;
        public int RunesOf(string id) => Runes.TryGetValue(id, out int n) ? n : 0;

        // ---------------- 存档清洗(与 web 同规则:只留已知 key + 非负计数) ----------------

        /// <summary>
        /// 从"可能是任何脏数据"的字典重建图鉴:
        /// 未知敌人(含 'monster' 兜底键)/未知符文 id / 负数 / 非数字一律丢弃。
        /// 宿主读档时先 Load → Sanitize:
        ///   var codex = Codex.Sanitize(rawEnemies, rawRunes);
        /// </summary>
        public static Codex Sanitize(
            IReadOnlyDictionary<string, object> rawEnemies,
            IReadOnlyDictionary<string, object> rawRunes)
        {
            var codex = new Codex();
            if (rawEnemies != null)
            {
                foreach (var kv in rawEnemies)
                {
                    if (!Enum.TryParse<EnemyKind>(kv.Key, out var kind)) continue; // 含 'monster' 等兜底键
                    int n = ToCount(kv.Value);
                    if (n > 0) codex.Enemies[kind] = n;
                }
            }
            if (rawRunes != null)
            {
                foreach (var kv in rawRunes)
                {
                    if (!KnownRunes.Contains(kv.Key)) continue;
                    int n = ToCount(kv.Value);
                    if (n > 0) codex.Runes[kv.Key] = n;
                }
            }
            return codex;
        }

        private static int ToCount(object v) => v switch
        {
            int i => i,
            long l => (int)Math.Min(int.MaxValue, Math.Max(0, l)),
            float f => float.IsFinite(f) ? (int)f : 0,
            double d => double.IsFinite(d) ? (int)d : 0,
            _ => 0,
        };

        /// <summary>击杀榜(宿主做图鉴首页"战绩"),按次数降序。</summary>
        public List<(EnemyKind kind, int kills)> TopKills(int n = 3)
        {
            var list = new List<(EnemyKind, int)>();
            foreach (var kv in Enemies)
            {
                if (kv.Value > 0 && Bestiary.Stats.ContainsKey(kv.Key)) list.Add((kv.Key, kv.Value));
            }
            list.Sort((a, b) => b.Item2.CompareTo(a.Item2));
            if (list.Count > n) list.RemoveRange(n, list.Count - n);
            return list.ConvertAll(x => (x.Item1, x.Item2));
        }
    }
}
