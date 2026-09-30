using System;
using System.Collections.Generic;
using StarfallKnights.Core;
using StarfallKnights.Data;
using StarfallKnights.Loot;

namespace StarfallKnights.Meta
{
    /// <summary>
    /// U2 面板 ViewModel(轮 42):图鉴 / 成就 / 排行榜三块面板的**行格式化纯函数**。
    ///
    /// 分层约定(与 web 同构):
    /// - 这里 = 可测逻辑:分组、排序、进度、行文案 —— Tests/Program.cs 的 TestPanelModels 全覆盖;
    /// - Unity/MetaPanelsGUI.cs = 最薄 OnGUI 壳:只画字符串、收点击,一行判断都不许有;
    /// - 文案口径对齐 web CampUI 的 zh 模板(camp.achv.* / camp.codex.* / camp.board.*);
    ///   Unity 端 v1 只出中文 —— 文案**权威在 web i18n 表**,这里是镜像抄写,改文案先改 web。
    /// </summary>
    public static class PanelModels
    {
        // ================= 成就面板 =================

        /// <summary>成就名称/描述(zh;权威 = web i18n 表 achv.*,32 条与 achievements.json 同序同 id)。</summary>
        public static readonly Dictionary<string, (string name, string desc)> AchvText = new()
        {
            { "first_run",       ("初次出征", "第一次进入地下城") },
            { "first_clear",     ("序章通关", "第一次击败章节 Boss") },
            { "clear5",          ("老练骑士", "通关 5 次") },
            { "clear15",         ("星陨传人", "通关 15 次") },
            { "kills100",        ("百人斩", "累计击杀 100") },
            { "kills500",        ("破军", "累计击杀 500") },
            { "kills2000",       ("收割者", "累计击杀 2000") },
            { "nohit",           ("无瑕之躯", "无伤通关一局") },
            { "speed8",          ("疾风骑士", "8 分钟内通关") },
            { "speed6",          ("速通传说", "6 分钟内通关") },
            { "codex10",         ("初识魔物", "图鉴收录 10 种怪物") },
            { "codex_boss",      ("猎王者", "收录全部三章 Boss") },
            { "codex_all_enemy", ("星陨百科", "收录全部 30 种怪物") },
            { "rune18",          ("符文收藏家", "图鉴收录 18 枚符文") },
            { "rune_all",        ("符文宗师", "收录全部 48 枚符文") },
            { "daily_clear",     ("混沌征服者", "通关一次每日挑战") },
            { "weekly_clear",    ("破律者", "通关一次周常挑战") },
            { "boards_filled",   ("榜上有名", "四条排行榜全部留下记录") },
            { "altar5",          ("祭坛信徒", "任一祭坛分支升到 5 级") },
            { "altar15",         ("祭坛大师", "祭坛合计升 15 级") },
            { "craft1",          ("铸星者", "星辉铸台铸造一件开局传奇") },
            { "craft5",          ("铸造宗师", "星辉铸台累计铸造 5 次") },
            { "rich",            ("星尘富翁", "持有 1000 星尘") },
            { "rich5k",          ("星尘之海", "持有 5000 星尘") },
            { "clear30",         ("传奇挽歌", "通关 30 次") },
            { "kills5000",       ("星陨大屠杀", "累计击杀 5000") },
            { "speed5",          ("时之刃", "5 分钟内通关") },
            { "codex_mid",       ("三猎手", "收录全部三位中 Boss(莽/溜/钓)") },
            { "codex25",         ("博物志", "图鉴收录 25 种怪物") },
            { "rune_one_class",  ("一门精通", "任一职业 12 枚符文全收录") },
            { "totem_all",       ("秘境行者", "8 座石碑每座都抉择过") },
            { "totem20",         ("老练抉择者", "秘境累计抉择 20 次") },
        };

        /// <summary>成就分类标签(web achv.cat.* 同款)。</summary>
        public static string CatLabel(Achievements.Cat c)
        {
            switch (c)
            {
                case Achievements.Cat.Progress: return "进度";
                case Achievements.Cat.Combat: return "战斗";
                case Achievements.Cat.Speed: return "极速";
                case Achievements.Cat.Codex: return "图鉴";
                default: return "局外";
            }
        }

        public struct AchvRow
        {
            public string Id;
            public string Icon;
            public string Name;
            public string Desc;
            public int Cur, Goal;
            public bool Done;
            /// <summary>进度行:"已达成" 或 "cur/goal"(web camp.achv.done 同款)。</summary>
            public string ProgressText;
        }

        /// <summary>某分类下的成就行(保持 achievements.json 顺序;文案缺条目时回落 id,不抛)。</summary>
        public static List<AchvRow> AchvRows(Achievements.Cat cat, in Achievements.AchvState s,
            Dictionary<string, long> unlocked)
        {
            var rows = new List<AchvRow>();
            foreach (var a in Achievements.All)
            {
                if (a.Category != cat) continue;
                var (cur, goal) = Achievements.Progress(a, s);
                bool done = (unlocked != null && unlocked.TryGetValue(a.Id, out long ts) && ts > 0) || cur >= goal;
                var text = AchvText.TryGetValue(a.Id, out var tx) ? tx : (a.Id, a.Id);
                rows.Add(new AchvRow
                {
                    Id = a.Id, Icon = a.Icon, Name = text.Item1, Desc = text.Item2,
                    Cur = cur, Goal = goal, Done = done,
                    ProgressText = done ? "已达成" : $"{Math.Min(cur, goal)}/{goal}",
                });
            }
            return rows;
        }

        /// <summary>标题下的总进度行(web camp.achv.all / camp.achv.progress 同款)。</summary>
        public static string AchvHeader(int unlocked, int total)
        {
            if (total > 0 && unlocked >= total) return $"★ 全成就达成 {unlocked}/{total}";
            int pct = total == 0 ? 0 : (int)Math.Round(unlocked * 100.0 / total);
            return $"成就 {unlocked}/{total} · {pct}%";
        }

        // ================= 图鉴面板 =================

        /// <summary>标题下的收录进度(web camp.codex.progress + complete 同款)。</summary>
        public static string CodexHeader(Codex codex)
        {
            string line = $"怪物 {codex.EnemyFound}/{Codex.EnemyTotal} · 符文 {codex.RuneFound}/{Codex.RuneTotal}";
            return codex.Complete ? line + " · ★ 全收录!" : line;
        }

        public struct EnemyCell
        {
            public EnemyKind Kind;
            public bool Found;
            public bool Boss;
            public int Kills;
            /// <summary>格子文字:未收录 "?",收录 = 名字(Boss 前缀 ★,web 同款)。</summary>
            public string Label;
        }

        /// <summary>怪物格子(按 EnemyKind 枚举序;boss_ 前缀判 Boss,与 web bossFound 同口径)。</summary>
        public static List<EnemyCell> EnemyCells(Codex codex)
        {
            var cells = new List<EnemyCell>();
            foreach (var kv in Bestiary.Stats)
            {
                bool boss = kv.Key.ToString().StartsWith("Boss", StringComparison.Ordinal);
                int kills = codex.KillsOf(kv.Key);
                bool found = kills > 0;
                cells.Add(new EnemyCell
                {
                    Kind = kv.Key, Found = found, Boss = boss, Kills = kills,
                    Label = found ? (boss ? "★ " : "") + kv.Value.Name : "?",
                });
            }
            return cells;
        }

        /// <summary>怪物详情行(web camp.codex.hpatk / defspd 同款;未收录返回空列表 = 壳画"?")。</summary>
        public static List<string> EnemyDetail(Codex codex, EnemyKind kind)
        {
            var lines = new List<string>();
            if (!Bestiary.Stats.TryGetValue(kind, out var st) || codex.KillsOf(kind) <= 0) return lines;
            lines.Add($"击杀:{codex.KillsOf(kind)}");
            lines.Add($"血量 {st.Hp:0.#}   攻击 {st.Atk:0.#}");
            lines.Add($"防御 {st.Def:0.#}   速度 {st.Speed:0.#} m/s");
            lines.Add($"体型 {st.BodyRadius:0.##} m");
            return lines;
        }

        /// <summary>符文行:"◈ 名字 ×次数" / 未收录 "?"(顺序 = RunePool.All)。</summary>
        public static List<string> RuneRows(Codex codex)
        {
            var rows = new List<string>();
            foreach (var r in Skills.RunePool.All())
            {
                int n = codex.RunesOf(r.Id);
                rows.Add(n > 0 ? $"◈ {r.Name} ×{n}" : "?");
            }
            return rows;
        }

        // ================= 装备面板 =================

        /// <summary>六槽部位名(zh;权威 = web i18n 表 slot.*)。</summary>
        public static string SlotLabel(Slot s)
        {
            switch (s)
            {
                case Slot.Weapon: return "武器";
                case Slot.Helmet: return "头盔";
                case Slot.Chest: return "胸甲";
                case Slot.Boots: return "靴子";
                case Slot.Ring: return "戒指";
                default: return "项链";
            }
        }

        /// <summary>装备六槽行:"武器:Epic Weapon(atkPct+30)" / 空槽 "武器:—"。</summary>
        public static List<string> EquipRows(Equip.Equipment eq)
        {
            var rows = new List<string>();
            foreach (Slot s in Enum.GetValues(typeof(Slot)))
            {
                var it = eq.Of(s);
                rows.Add(it == null
                    ? $"{SlotLabel(s)}:—"
                    : $"{SlotLabel(s)}:{it.Name}({string.Join(" · ", it.Affixes)})");
            }
            return rows;
        }

        /// <summary>面板属性行(镜像 web camp/inventory 的五行式)。</summary>
        public static List<string> StatRows(in Equip.StatSheet sheet, float hp)
        {
            return new List<string>
            {
                $"生命  {(int)MathF.Ceiling(hp)}/{(int)sheet.HpMax}",
                $"攻击  {(int)sheet.Atk}   防御  {(int)sheet.Def}",
                $"暴击  {sheet.CritRate * 100:0}% / {sheet.CritDmg * 100:0}%",
                $"移速  {sheet.MoveSpeed:0.0}m/s",
                $"冷却  -{sheet.Cdr * 100:0}%  元素 +{sheet.ElemDmg * 100:0}%",
            };
        }

        // ================= 排行榜面板 =================

        /// <summary>副标题(web camp.board.subtitle 同款)。</summary>
        public static string BoardSubtitle(Leaderboard.Boards4 lb) =>
            $"本地榜(不上云)· 已开榜 {lb.Filled()}/{Leaderboard.Boards.Length} · 每榜保留前 {Leaderboard.TopN}";

        public const string BoardEmpty = "—— 还没有记录,出征一次就上榜 ——";

        /// <summary>
        /// 一条榜的展示行:"1. 4:32  狂澜剑士 · 第1章  🗓 2026-w40" 结构
        /// (名次. 成绩  职业 · 章节  [挑战徽标];成绩格式走 FormatScore,与 web formatScore 口径一致)。
        /// </summary>
        public static List<string> BoardLines(Leaderboard.Boards4 lb, Leaderboard.Board b,
            Leaderboard.BalanceKlassNames names)
        {
            var lines = new List<string>();
            var list = Leaderboard.Sort(b, lb.Of(b));
            for (int i = 0; i < list.Count; i++)
            {
                var e = list[i];
                string tag = Leaderboard.TagLabel(e.Tag);
                string row = $"{i + 1}. {Leaderboard.FormatScore(b, e.Score)}  "
                    + $"{Leaderboard.KlassName(e.Klass, names)} · 第{e.Chapter}章";
                lines.Add(string.IsNullOrEmpty(tag) ? row : row + "  " + tag);
            }
            return lines;
        }
    }
}
