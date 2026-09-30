using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using StarfallKnights.Core;

namespace StarfallKnights.Meta
{
    /// <summary>
    /// 存档落盘(轮 43,U3):MetaSave + Codex + Boards4 + 成就解锁 ↔ 一个 JSON 字符串。
    ///
    /// 设计口径:
    /// - 宿主只管"字符串放哪"(PlayerPrefs / 文件),编解码全在这里 —— 纯 C# 可测;
    /// - **读档三重清洗**:Codex.Sanitize / Leaderboard.Sanitize / Achievements.Sanitize
    ///   全部过一遍(与 web migrateSave 同哲学:脏档进来,干净状态出去,无后门);
    /// - 任何解析失败(截断/类型错/非 JSON)返回**全新默认状态**,绝不半初始化;
    /// - 版本字段 v:向后兼容由"未知键忽略 + 缺键默认"承担,结构大改时再升 v。
    /// 与 web 存档**不互通**(两端各自落盘;字段名对齐只为读代码时好对照)。
    /// </summary>
    public static class SaveCodec
    {
        public const int Version = 1;

        /// <summary>一份完整局外状态(宿主持有的四大块)。</summary>
        public sealed class State
        {
            public MetaSave Meta = new();
            public Codex Codex = new();
            public Leaderboard.Boards4 Boards = new();
            public Dictionary<string, long> AchvUnlocked = new();
        }

        // ================= 编码 =================

        public static string Encode(State st)
        {
            var sb = new StringBuilder(1024);
            sb.Append('{');
            sb.Append("\"v\":").Append(Version).Append(',');

            var m = st.Meta;
            sb.Append("\"meta\":{");
            Num(sb, "stardust", m.stardust).Append(',');
            Num(sb, "altarHp", m.altarHp).Append(',');
            Num(sb, "altarAtk", m.altarAtk).Append(',');
            Num(sb, "altarLuck", m.altarLuck).Append(',');
            Num(sb, "pity", m.pity).Append(',');
            Num(sb, "blueprintShards", m.blueprintShards).Append(',');
            sb.Append("\"craftQueued\":").Append(m.craftQueued ? "true" : "false").Append(',');
            Num(sb, "tutorialStep", m.tutorialStep).Append(',');
            sb.Append("\"tutorialDone\":").Append(m.tutorialDone ? "true" : "false").Append(',');
            Num(sb, "updatedAt", m.updatedAt).Append(',');
            Num(sb, "runs", m.runs).Append(',');
            Num(sb, "clears", m.clears).Append(',');
            Num(sb, "totalKills", m.totalKills).Append(',');
            NumF(sb, "bestTimeS", m.bestTimeS).Append(',');
            Num(sb, "noHitClears", m.noHitClears).Append(',');
            Num(sb, "dailyClears", m.dailyClears).Append(',');
            Num(sb, "weeklyClears", m.weeklyClears).Append(',');
            Num(sb, "crafts", m.crafts);
            sb.Append("},");

            sb.Append("\"codex\":{\"enemies\":{");
            bool first = true;
            foreach (var kv in st.Codex.Enemies)
            {
                if (kv.Value <= 0) continue;
                if (!first) sb.Append(',');
                first = false;
                Str(sb, kv.Key.ToString()).Append(':').Append(kv.Value);
            }
            sb.Append("},\"runes\":{");
            first = true;
            foreach (var kv in st.Codex.Runes)
            {
                if (kv.Value <= 0) continue;
                if (!first) sb.Append(',');
                first = false;
                Str(sb, kv.Key).Append(':').Append(kv.Value);
            }
            sb.Append("}},");

            sb.Append("\"boards\":{");
            for (int i = 0; i < Leaderboard.Boards.Length; i++)
            {
                var b = Leaderboard.Boards[i];
                if (i > 0) sb.Append(',');
                Str(sb, b.ToString().ToLowerInvariant()).Append(":[");
                var list = st.Boards.Of(b);
                for (int j = 0; j < list.Count; j++)
                {
                    var e = list[j];
                    if (j > 0) sb.Append(',');
                    sb.Append("{\"score\":").Append(e.Score.ToString("R", CultureInfo.InvariantCulture));
                    sb.Append(",\"klass\":"); Quote(sb, e.Klass);
                    sb.Append(",\"chapter\":").Append(e.Chapter);
                    sb.Append(",\"at\":").Append(e.At.ToString("R", CultureInfo.InvariantCulture));
                    sb.Append(",\"tag\":"); Quote(sb, e.Tag ?? "");
                    sb.Append('}');
                }
                sb.Append(']');
            }
            sb.Append("},");

            sb.Append("\"achv\":{");
            first = true;
            foreach (var kv in st.AchvUnlocked)
            {
                if (kv.Value <= 0) continue;
                if (!first) sb.Append(',');
                first = false;
                Str(sb, kv.Key).Append(':').Append(kv.Value);
            }
            sb.Append("}}");
            return sb.ToString();
        }

        private static StringBuilder Num(StringBuilder sb, string key, long v)
        { Str(sb, key).Append(':').Append(v); return sb; }

        private static StringBuilder NumF(StringBuilder sb, string key, float v)
        {
            Str(sb, key).Append(':')
                .Append((float.IsFinite(v) ? v : 0f).ToString("R", CultureInfo.InvariantCulture));
            return sb;
        }

        private static StringBuilder Str(StringBuilder sb, string s) { Quote(sb, s); return sb; }

        private static void Quote(StringBuilder sb, string s)
        {
            sb.Append('"');
            foreach (char c in s)
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c == '\n') sb.Append("\\n");
                else if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4"));
                else sb.Append(c);
            }
            sb.Append('"');
        }

        // ================= 解码(带三重清洗) =================

        public static State Decode(string json)
        {
            var st = new State();
            if (string.IsNullOrEmpty(json)) return st;
            Dictionary<string, object> doc;
            try { doc = MiniJson.Obj(MiniJson.Parse(json)); }
            catch { return st; }   // 坏档 = 全新开始,绝不半初始化
            if (doc == null) return st;

            var meta = MiniJson.Opt(doc, "meta");
            if (meta != null)
            {
                var m = st.Meta;
                m.stardust = I(meta, "stardust"); m.altarHp = I(meta, "altarHp");
                m.altarAtk = I(meta, "altarAtk"); m.altarLuck = I(meta, "altarLuck");
                m.pity = I(meta, "pity"); m.blueprintShards = I(meta, "blueprintShards");
                m.craftQueued = B(meta, "craftQueued");
                m.tutorialStep = I(meta, "tutorialStep"); m.tutorialDone = B(meta, "tutorialDone");
                m.updatedAt = L(meta, "updatedAt");
                m.runs = I(meta, "runs"); m.clears = I(meta, "clears");
                m.totalKills = I(meta, "totalKills");
                float bt = (float)MiniJson.Num(meta, "bestTimeS", 0);
                m.bestTimeS = float.IsFinite(bt) && bt > 0 ? bt : 0f;
                m.noHitClears = I(meta, "noHitClears"); m.dailyClears = I(meta, "dailyClears");
                m.weeklyClears = I(meta, "weeklyClears"); m.crafts = I(meta, "crafts");
            }

            var codex = MiniJson.Opt(doc, "codex");
            if (codex != null)
            {
                st.Codex = Codex.Sanitize(
                    AsRaw(MiniJson.Opt(codex, "enemies")),
                    AsRaw(MiniJson.Opt(codex, "runes")));
            }

            var boards = MiniJson.Opt(doc, "boards");
            if (boards != null)
            {
                foreach (var b in Leaderboard.Boards)
                {
                    var arr = MiniJson.OptArr(boards, b.ToString().ToLowerInvariant());
                    if (arr == null) continue;
                    var list = st.Boards.Of(b);
                    foreach (var eo in arr)
                    {
                        if (eo is not Dictionary<string, object> e) continue;
                        list.Add(new Leaderboard.Entry(
                            MiniJson.Num(e, "score", 0),
                            e.TryGetValue("klass", out var k) ? k as string ?? "" : "",
                            I(e, "chapter"),
                            MiniJson.Num(e, "at", 0),
                            e.TryGetValue("tag", out var tg) ? tg as string ?? "" : ""));
                    }
                }
                Leaderboard.Sanitize(st.Boards);   // 脏条目/超长/乱序在这里一次收拾
            }

            var achv = MiniJson.Opt(doc, "achv");
            if (achv != null)
            {
                var raw = new Dictionary<string, long>();
                foreach (var kv in achv)
                    if (kv.Value is double d && d > 0 && double.IsFinite(d)) raw[kv.Key] = (long)d;
                st.AchvUnlocked = Achievements.Sanitize(raw);
            }
            return st;
        }

        private static int I(Dictionary<string, object> d, string key)
        {
            double v = MiniJson.Num(d, key, 0);
            return double.IsFinite(v) && v > 0 ? (int)v : 0;
        }

        private static long L(Dictionary<string, object> d, string key)
        {
            double v = MiniJson.Num(d, key, 0);
            return double.IsFinite(v) && v > 0 ? (long)v : 0;
        }

        private static bool B(Dictionary<string, object> d, string key)
            => d.TryGetValue(key, out var v) && v is bool b && b;

        private static IReadOnlyDictionary<string, object> AsRaw(Dictionary<string, object> d)
            => d ?? new Dictionary<string, object>();
    }
}
