using System;
using StarfallKnights.Core;
using System.Collections.Generic;
using System.IO;
using StarfallKnights.Combat;
using StarfallKnights.Data;
using StarfallKnights.Dungeon;
using StarfallKnights.Meta;
using StarfallKnights.Skills;

namespace StarfallKnights.Tests
{
    /// <summary>
    /// 双端数值 parity:直接读 web/src/data 下的 JSON,与 C# 镜像逐键比对。
    /// 这是"镜像层"能否被信任的唯一判据——任何一边改了数值而另一边没改,这里立刻红。
    /// 双向校验:C# 多出的键同样报错(JSON 删了字段却忘了删镜像)。
    /// </summary>
    public static class ParityTests
    {
        private const float Tol = 1e-3f;

        public static void Run(Action<bool, string> check, Action<float, float, float, string> near, Action<string> suite)
        {
            suite("双端 parity(web JSON ↔ C# 镜像)");
            string root = FindRepoRoot();
            if (root == null)
            {
                check(false, "找到仓库根目录(含 web/src/data)——parity 测试必须在仓库内运行");
                return;
            }
            CheckSkills(check, near, root);
            CheckRunes(check, near, root);
            CheckBestiary(check, near, root);
            CheckLayouts(check, near, root);
            CheckChallenges(check, near, root);
            CheckPixelFont(check, near, root);
            CheckLeaderboard(check, near, root);
            CheckClassBasics(check, near, root);
            CheckTutorial(check, near, root);
            CheckTouch(check, root);
        }

        /// <summary>
        /// 触屏段(10-FULL-PLAN 轮 7)。
        /// 数值叶子已由 CheckBestiary 逐键比对,这里管两件数值比对覆盖不到的事:
        /// 1. **布尔叶子** `autoAttack` —— 生成器按规则跳过布尔(同教程的步骤 id/文案),必须单独比对;
        /// 2. 确认 C# 侧真的是**读常量**而不是把数值抄进了代码(常量搬了、代码写死 = parity 假绿)。
        /// </summary>
        private static void CheckTouch(Action<bool, string> check, string root)
        {
            check(!string.IsNullOrEmpty(root), "触屏 parity 需要仓库根(含 web/src/data)");
            if (root == null) return;
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var t = MiniJson.Opt(doc, "touch");
            if (t == null) { check(false, "balance.touch 存在"); return; }

            bool auto = t.TryGetValue("autoAttack", out var raw) && raw is bool b && b;
            check(raw is bool, "touch.autoAttack 是布尔(不是字符串/数字)");
            check(auto == AimRules.AutoAttackDefault,
                $"自动攻击默认开关一致(JSON={auto} vs C#={AimRules.AutoAttackDefault})");

            check(Math.Abs(AimRules.DefaultRangeM - MiniJson.Num(t, "aimRangeM")) < 1e-4f,
                "AimRules 锁定范围读的是 balance.touch.aimRangeM(不是写死的数)");
            check(Math.Abs(AimRules.DefaultStickyM - MiniJson.Num(t, "aimStickyM")) < 1e-4f,
                "AimRules 粘性读的是 balance.touch.aimStickyM");
            check(Math.Abs(AimRules.DefaultLatchS - MiniJson.Num(t, "aimLatchS")) < 1e-4f,
                "AimRules 续瞄读的是 balance.touch.aimLatchS");
            // 手感区间守卫:锁定范围必须盖得住近战/远程普攻,否则自动攻击永远不开火(web 侧同款断言)
            float bladeReach = AimRules.AutoAttackRangeM(HeroClass.Blade);
            float shotReach = AimRules.AutoAttackRangeM(HeroClass.Ranger);
            check(AimRules.DefaultRangeM > bladeReach && AimRules.DefaultRangeM > shotReach,
                $"锁定范围({AimRules.DefaultRangeM} m)盖得住近战 {bladeReach:0.##} m 与远程 {shotReach:0.##} m");
            check(AimRules.DefaultStickyM > 0f && AimRules.DefaultLatchS > 0f, "粘性与续瞄都是正数");
            // 粘性要"够粘但不至于锁死":大到锁定范围一半,玩家会发现准星挂着不动的旧目标
            check(AimRules.DefaultStickyM < AimRules.DefaultRangeM * 0.5f,
                $"粘性({AimRules.DefaultStickyM} m)小于锁定范围的一半");
        }

        /// <summary>图鉴 parity:balance.json 的敌人/章节数值 vs Data/Bestiary.cs 的常量。</summary>
        private static void CheckBestiary(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));

            // 与 tools/gen_bestiary.py 同一套路径规则:enemies.* + chapters.* + boss.nanmir(键前缀 boss_nanmir)
            var leaves = new Dictionary<string, double>();
            void Walk(object o, string prefix)
            {
                if (o is Dictionary<string, object> d)
                {
                    foreach (var kv in d)
                    {
                        if (kv.Key.StartsWith("$")) continue;
                        Walk(kv.Value, prefix.Length == 0 ? kv.Key : $"{prefix}.{kv.Key}");
                    }
                }
                else if (o is List<object> arr)
                {
                    for (int i = 0; i < arr.Count; i++) Walk(arr[i], $"{prefix}.{i}");
                }
                else if (o is double num)
                {
                    leaves[prefix] = num;
                }
            }
            var enemies = MiniJson.Opt(doc, "enemies");
            foreach (var kv in enemies) Walk(kv.Value, kv.Key);
            var chapters = MiniJson.Opt(doc, "chapters");
            foreach (var kv in chapters) Walk(kv.Value, $"chapters.{kv.Key}");
            var boss = MiniJson.Opt(doc, "boss");
            if (boss != null && boss.ContainsKey("nanmir")) Walk(boss["nanmir"], "boss_nanmir");
            // 竞技场尺寸(中 Boss 的撞墙判定要读;此前是 parity 盲区)
            var arena = MiniJson.Opt(doc, "arena");
            if (arena != null) Walk(arena, "arena");
            // 新手引导的数值叶子(moveM/hintY/saveSlots)
            var tutorial = MiniJson.Opt(doc, "tutorial");
            if (tutorial != null) Walk(tutorial, "tutorial");
            // 触屏手感数值(自动瞄准范围/粘性/续瞄、摇杆半径、按钮安全边距)
            var touch = MiniJson.Opt(doc, "touch");
            if (touch != null) Walk(touch, "touch");

            int mismatches = 0, matched = 0;
            foreach (var kv in leaves)
            {
                if (!Bestiary.Parity.TryGetValue(kv.Key, out float csVal))
                {
                    mismatches++;
                    check(false, $"图鉴常量缺失:{kv.Key}(JSON={kv.Value})");
                    continue;
                }
                matched++;
                if (Math.Abs(csVal - kv.Value) > Tol)
                {
                    mismatches++;
                    check(false, $"图鉴数值不一致:{kv.Key}(JSON={kv.Value} vs C#={csVal})");
                }
            }
            var extra = new List<string>();
            foreach (var k in Bestiary.Parity.Keys) if (!leaves.ContainsKey(k)) extra.Add(k);
            check(extra.Count == 0, $"图鉴无多余键(多出 {extra.Count} 个{(extra.Count > 0 ? ": " + string.Join(", ", extra) : "")})");
            check(mismatches == 0, $"balance.json → Bestiary.cs 逐键一致({matched} 个数值键)");

            // 图鉴行本身:每种敌人的 血/攻/防/速/体型 都对得上
            int rowBad = 0;
            foreach (var kv in enemies)
            {
                var e = MiniJson.Obj(kv.Value);
                var kind = KindOf(kv.Key);
                if (kind == null) { rowBad++; check(false, $"未知敌人键 {kv.Key}"); continue; }
                var stat = Bestiary.Of(kind.Value);
                if (Math.Abs(stat.Hp - MiniJson.Num(e, "hp")) > Tol) { rowBad++; check(false, $"{kv.Key} 血量不符"); }
                if (Math.Abs(stat.Atk - MiniJson.Num(e, "atk")) > Tol) { rowBad++; check(false, $"{kv.Key} 攻击不符"); }
                if (Math.Abs(stat.Def - MiniJson.Num(e, "def", 0)) > Tol) { rowBad++; check(false, $"{kv.Key} 防御不符"); }
                if (Math.Abs(stat.BodyRadius - MiniJson.Num(e, "bodyRadius")) > Tol) { rowBad++; check(false, $"{kv.Key} 体型不符"); }
                double sp = MiniJson.Num(e, "speed", 0);
                if (Math.Abs(stat.Speed - sp) > Tol) { rowBad++; check(false, $"{kv.Key} 速度不符"); }
            }
            check(rowBad == 0, $"{enemies.Count} 行图鉴(血/攻/防/速/体型)与 JSON 一致");
        }

        /// <summary>房间布局 parity:balance.json 的 layouts 段(含 combatWeights)vs Dungeon/RoomLayouts.cs。</summary>
        private static void CheckLayouts(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var layouts = MiniJson.Opt(doc, "layouts");
            if (layouts == null) { check(false, "balance.json 有 layouts 段"); return; }

            var leaves = new Dictionary<string, double>();
            void Walk(object o, string prefix)
            {
                if (o is Dictionary<string, object> d)
                {
                    foreach (var kv in d) Walk(kv.Value, prefix.Length == 0 ? kv.Key : $"{prefix}.{kv.Key}");
                }
                else if (o is List<object> arr)
                {
                    for (int i = 0; i < arr.Count; i++) Walk(arr[i], $"{prefix}.{i}");
                }
                else if (o is double num)
                {
                    leaves[prefix] = num;
                }
            }
            Walk(layouts, "layouts");
            // layouts.terrain.* 归 TerrainRules(见下面的"地形机制"段),这里只比摆放规则常量
            foreach (var k in new List<string>(leaves.Keys)) if (k.StartsWith("layouts.terrain.")) leaves.Remove(k);

            int mismatches = 0, matched = 0;
            foreach (var kv in leaves)
            {
                if (!RoomLayouts.Parity.TryGetValue(kv.Key, out float csVal))
                {
                    mismatches++;
                    check(false, $"布局规则常量缺失:{kv.Key}(JSON={kv.Value})");
                    continue;
                }
                matched++;
                if (Math.Abs(csVal - kv.Value) > Tol)
                {
                    mismatches++;
                    check(false, $"布局规则不一致:{kv.Key}(JSON={kv.Value} vs C#={csVal})");
                }
            }
            var extra = new List<string>();
            foreach (var k in RoomLayouts.Parity.Keys) if (!leaves.ContainsKey(k)) extra.Add(k);
            check(extra.Count == 0, $"布局规则无多余键(多出 {extra.Count} 个{(extra.Count > 0 ? ": " + string.Join(", ", extra) : "")})");
            check(mismatches == 0, $"balance.json → RoomLayouts.cs 逐键一致({matched} 个数值键)");

            // 名单(字符串数组)单独比:JSON 的 byKind vs C# 的模板清单
            int listBad = 0;
            var byKind = MiniJson.Opt(layouts, "byKind");
            if (byKind == null) { check(false, "layouts.byKind 存在"); return; }
            foreach (var kv in byKind)
            {
                var jsonList = MiniJson.Arr(kv.Value);
                var csList = RoomLayouts.Kind(kv.Key);
                if (jsonList.Count != csList.Length)
                {
                    listBad++;
                    check(false, $"{kv.Key} 模板数不符(JSON={jsonList.Count} vs C#={csList.Length})");
                    continue;
                }
                for (int i = 0; i < csList.Length; i++)
                {
                    if (!Equals(jsonList[i], csList[i]))
                    {
                        listBad++;
                        check(false, $"{kv.Key}[{i}] 不符(JSON={jsonList[i]} vs C#={csList[i]})");
                    }
                }
            }
            check(listBad == 0, "布局模板名单逐项一致(战斗/精英/Boss/静谧)");

            // 地形机制(浅滩减速/导电)与障碍耐久:键在 layouts.terrain.* 与 props.*.hp
            int mechBad = 0;
            var layoutTerrain = MiniJson.Opt(layouts, "terrain");
            if (layoutTerrain == null) check(false, "layouts.terrain 段存在");
            else
            {
                foreach (var kv in TerrainRules.Parity)
                {
                    if (!kv.Key.StartsWith("layouts.terrain.")) continue;
                    string leaf = kv.Key.Substring("layouts.terrain.".Length);
                    double json = MiniJson.Num(layoutTerrain, leaf);
                    if (double.IsNaN(json)) { mechBad++; check(false, $"layouts.terrain 缺键 {leaf}"); continue; }
                    if (Math.Abs((double)kv.Value - json) > Tol) { mechBad++; check(false, $"地形机制不一致:{leaf}(JSON={json} vs C#={kv.Value})"); }
                }
            }
            var propsDoc = MiniJson.Opt(doc, "props");
            if (propsDoc == null) check(false, "balance.json 有 props 段");
            else
            {
                foreach (var kind in new[] { "tree", "rock" })
                {
                    double json = MiniJson.Num(MiniJson.Opt(propsDoc, kind), "hp");
                    if (double.IsNaN(json)) { mechBad++; check(false, $"props.{kind}.hp 缺失"); continue; }
                    if (Math.Abs(TerrainRules.PropHp(kind) - json) > Tol) { mechBad++; check(false, $"障碍耐久不一致:{kind}(JSON={json} vs C#={TerrainRules.PropHp(kind)})"); }
                }
            }
            check(mechBad == 0, "地形机制 + 障碍耐久与 JSON 一致(6 个键)");

            // 摆放规则要用到体型(间距是否容得下玩家),这两个也得对得上
            near(Balance.PlayerBodyRadius, (float)MiniJson.Num(MiniJson.Obj(MiniJson.Opt(doc, "player")), "bodyRadius"), Tol, "玩家体型");
            near(Balance.RockBodyRadius, (float)MiniJson.Num(MiniJson.Obj(MiniJson.Opt(MiniJson.Opt(doc, "props"), "rock")), "bodyRadius", 0), Tol, "岩石体型");
        }

        /// <summary>挑战 parity:challenges.json(daily.mods / weekly.rules)vs Meta/Challenges.cs。</summary>
        private static void CheckChallenges(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            string path = Path.Combine(root, "web/src/data/challenges.json");
            if (!File.Exists(path)) { check(false, "存在 challenges.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var daily = MiniJson.Opt(doc, "daily");
            var weekly = MiniJson.Opt(doc, "weekly");
            if (daily == null || weekly == null) { check(false, "challenges.json 有 daily / weekly 段"); return; }

            // 数值键:缺省在两边都代表中性(1 / 0),所以逐键比对前先补中性
            var expected = new Dictionary<string, double>();
            void Neutral(string p)
            {
                expected[p + "hp"] = 1; expected[p + "atk"] = 1; expected[p + "drop"] = 1; expected[p + "cdr"] = 0;
                expected[p + "playerAtk"] = 1; expected[p + "playerHp"] = 1; expected[p + "potion"] = 0;
                expected[p + "cycle"] = 1;
            }
            var dailyMods = MiniJson.OptArr(daily, "mods");
            for (int i = 0; i < dailyMods.Count; i++) Neutral($"daily.mods.{i}.");
            var weeklyRules = MiniJson.OptArr(weekly, "rules");
            for (int i = 0; i < weeklyRules.Count; i++)
            {
                Neutral($"weekly.rules.{i}.");
                // 结构字段在 JSON 里可省略(C# 侧有默认值),缺省 = 0/false:
                // 两端都按"缺省即中性"读,所以这里也铺上默认值再被显式键覆盖
                expected[$"weekly.rules.{i}.extraWaves"] = 0;
                expected[$"weekly.rules.{i}.shopClosed"] = 0;
                expected[$"weekly.rules.{i}.altarOff"] = 0;
                expected[$"weekly.rules.{i}.eliteShift"] = 0;
            }
            // 中性值先铺满,再用 JSON 里的显式键覆盖
            expected["daily.count"] = MiniJson.Num(daily, "count");
            expected["weekly.dailyMods"] = MiniJson.Num(weekly, "dailyMods");
            for (int i = 0; i < dailyMods.Count; i++)
            {
                var m = MiniJson.Obj(dailyMods[i]);
                foreach (var kv in m) if (kv.Key != "id" && kv.Key != "name" && kv.Key != "desc") expected[$"daily.mods.{i}.{kv.Key}"] = MiniJson.Num(m, kv.Key);
            }
            for (int i = 0; i < weeklyRules.Count; i++)
            {
                var r = MiniJson.Obj(weeklyRules[i]);
                foreach (var kv in r)
                {
                    if (kv.Key == "id" || kv.Key == "name" || kv.Key == "desc" || kv.Key == "forcedLayouts") continue;
                    expected[$"weekly.rules.{i}.{kv.Key}"] = kv.Value is bool b2 ? (b2 ? 1 : 0) : MiniJson.Num(r, kv.Key);
                }
            }

            int mismatches = 0, matched = 0;
            foreach (var kv in expected)
            {
                if (!Challenges.Parity.TryGetValue(kv.Key, out float csVal))
                {
                    mismatches++;
                    check(false, $"挑战数值缺失:{kv.Key}(JSON={kv.Value})");
                    continue;
                }
                matched++;
                if (Math.Abs(csVal - kv.Value) > Tol)
                {
                    mismatches++;
                    check(false, $"挑战数值不一致:{kv.Key}(JSON={kv.Value} vs C#={csVal})");
                }
            }
            var extra = new List<string>();
            foreach (var k in Challenges.Parity.Keys) if (!expected.ContainsKey(k)) extra.Add(k);
            check(extra.Count == 0, $"挑战数值无多余键(多出 {extra.Count} 个{(extra.Count > 0 ? ": " + string.Join(", ", extra) : "")})");
            check(mismatches == 0, $"challenges.json → Challenges.cs 逐键一致({matched} 个数值键)");

            // 名单与顺序:id 数组必须逐项一致(C# 的 Parity 按索引对键,顺序错了也会被抓到)
            int idBad = 0;
            if (dailyMods.Count != Challenges.DailyPool.Length) { idBad++; check(false, $"每日词条数不符(JSON={dailyMods.Count} vs C#={Challenges.DailyPool.Length})"); }
            else
            {
                for (int i = 0; i < dailyMods.Count; i++)
                {
                    string jsonId = MiniJson.Str(MiniJson.Obj(dailyMods[i]), "id");
                    if (jsonId != Challenges.DailyPool[i].Id) { idBad++; check(false, $"每日词条 [{i}] 顺序不符(JSON={jsonId} vs C#={Challenges.DailyPool[i].Id})"); }
                }
            }
            if (weeklyRules.Count != Challenges.WeeklyRules.Length) { idBad++; check(false, $"周常铁律数不符(JSON={weeklyRules.Count} vs C#={Challenges.WeeklyRules.Length})"); }
            else
            {
                for (int i = 0; i < weeklyRules.Count; i++)
                {
                    string jsonId = MiniJson.Str(MiniJson.Obj(weeklyRules[i]), "id");
                    if (jsonId != Challenges.WeeklyRules[i].Id) { idBad++; check(false, $"周常铁律 [{i}] 顺序不符(JSON={jsonId} vs C#={Challenges.WeeklyRules[i].Id})"); }
                }
            }
            check(idBad == 0, "词条/铁律名单顺序两端一致");

            // 地形候选:JSON 的 forcedLayouts 与 C# 的清单逐项一致
            int layoutBad = 0;
            for (int i = 0; i < weeklyRules.Count && i < Challenges.WeeklyRules.Length; i++)
            {
                var r = MiniJson.Obj(weeklyRules[i]);
                var jsonLayouts = MiniJson.OptArr(r, "forcedLayouts");
                var csLayouts = Challenges.WeeklyRules[i].ForcedLayouts;
                int jsonCount = jsonLayouts?.Count ?? 0;
                if (jsonCount != csLayouts.Length) { layoutBad++; check(false, $"{Challenges.WeeklyRules[i].Id} 地形候选数不符(JSON={jsonCount} vs C#={csLayouts.Length})"); continue; }
                for (int j = 0; j < jsonCount; j++)
                {
                    if (!Equals(jsonLayouts[j], csLayouts[j])) { layoutBad++; check(false, $"{Challenges.WeeklyRules[i].Id} 地形候选 [{j}] 不符(JSON={jsonLayouts[j]} vs C#={csLayouts[j]})"); }
                }
            }
            check(layoutBad == 0, "周常地形候选清单一致");
        }

        /// <summary>像素数字字体 parity:web/src/data/font.json ↔ Core/PixelFont.cs(逐字符逐行比对字模)。</summary>
        private static void CheckPixelFont(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            string path = Path.Combine(root, "web/src/data/font.json");
            if (!File.Exists(path)) { check(false, "存在 font.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));

            near(PixelFont.GlyphW, (float)MiniJson.Num(doc, "glyphW"), Tol, "字宽");
            near(PixelFont.GlyphH, (float)MiniJson.Num(doc, "glyphH"), Tol, "字高");
            near(PixelFont.Spacing, (float)MiniJson.Num(doc, "spacing"), Tol, "字距");

            var glyphs = MiniJson.Opt(doc, "glyphs");
            if (glyphs == null) { check(false, "font.json 有 glyphs 段"); return; }

            check(glyphs.Count == PixelFont.Glyphs.Count,
                $"字模数量一致(JSON={glyphs.Count} vs C#={PixelFont.Glyphs.Count})");
            check(PixelFont.Order.Length == glyphs.Count, "C# 字模顺序表与字模表同长");

            int bad = 0;
            foreach (var kv in glyphs)
            {
                string ch = kv.Key;
                if (!PixelFont.Glyphs.TryGetValue(ch, out var csRows))
                {
                    bad++;
                    check(false, $"C# 缺字模:'{ch}'");
                    continue;
                }
                var jsonRows = MiniJson.Arr(kv.Value);
                if (jsonRows.Count != csRows.Length) { bad++; check(false, $"'{ch}' 行数不符(JSON={jsonRows.Count} vs C#={csRows.Length})"); continue; }
                for (int r = 0; r < jsonRows.Count; r++)
                {
                    if (!Equals(jsonRows[r], csRows[r]))
                    {
                        bad++;
                        check(false, $"'{ch}' 第 {r} 行不符(JSON={jsonRows[r]} vs C#={csRows[r]})");
                    }
                }
            }
            var extra = new List<string>();
            foreach (var ch in PixelFont.Glyphs.Keys) if (!glyphs.ContainsKey(ch)) extra.Add(ch);
            check(extra.Count == 0, $"C# 没有多余字模(多出 {extra.Count} 个{(extra.Count > 0 ? ": " + string.Join(",", extra) : "")})");
            check(bad == 0, $"font.json → PixelFont.cs 逐字符逐行一致({glyphs.Count} 个字模)");
        }

        /// <summary>四职业普攻档案 parity:balance.classes.* 的 combo/bow 段 vs BestiaryKlass(生成)。</summary>
        private static void CheckClassBasics(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var classes = MiniJson.Opt(doc, "classes");
            if (classes == null) { check(false, "balance.json 有 classes 段"); return; }

            // 收集 classes.<k>.combo|bow 下的全部数值叶子(与 gen_bestiary.py 同一套路径规则)
            var leaves = new Dictionary<string, double>();
            void Walk(object o, string prefix)
            {
                if (o is Dictionary<string, object> d)
                {
                    foreach (var kv in d)
                    {
                        if (kv.Key.StartsWith("$")) continue;
                        Walk(kv.Value, $"{prefix}.{kv.Key}");
                    }
                }
                else if (o is List<object> arr)
                {
                    for (int i = 0; i < arr.Count; i++) Walk(arr[i], $"{prefix}.{i}");
                }
                else if (o is double num)
                {
                    leaves[prefix] = num;
                }
            }
            foreach (var kv in classes)
            {
                var row = MiniJson.Obj(kv.Value);
                foreach (var sect in new[] { "combo", "bow" })
                {
                    if (row.ContainsKey(sect)) Walk(row[sect], $"classes.{kv.Key}.{sect}");
                }
            }

            int mismatches = 0, matched = 0;
            foreach (var kv in leaves)
            {
                if (!BestiaryKlass.Parity.TryGetValue(kv.Key, out float csVal))
                {
                    mismatches++;
                    check(false, $"职业档案常量缺失:{kv.Key}(JSON={kv.Value})");
                    continue;
                }
                matched++;
                if (Math.Abs(csVal - kv.Value) > Tol)
                {
                    mismatches++;
                    check(false, $"职业档案数值不一致:{kv.Key}(JSON={kv.Value} vs C#={csVal})");
                }
            }
            var extra = new List<string>();
            foreach (var k in BestiaryKlass.Parity.Keys) if (!leaves.ContainsKey(k)) extra.Add(k);
            check(extra.Count == 0, $"职业档案无多余键(多出 {extra.Count} 个)");
            check(mismatches == 0, $"balance.json → BestiaryKlass 逐键一致({matched} 个数值键)");

            // 形态与顺序:近战两职业 combo、远程两职业 bow(顺序错了玩法就变了)
            check(BasicAttack.KindOf(HeroClass.Blade) == BasicAttack.Kind.Combo, "剑士 = 近战组合技");
            check(BasicAttack.KindOf(HeroClass.Warden) == BasicAttack.Kind.Combo, "守卫 = 近战组合技");
            check(BasicAttack.KindOf(HeroClass.Ranger) == BasicAttack.Kind.Shot, "猎手 = 远程射击");
            check(BasicAttack.KindOf(HeroClass.Arcanist) == BasicAttack.Kind.Shot, "秘术师 = 远程射击");
            check(Meta.Leaderboard.Boards.Length == 4, "四条榜仍在(回归保护)");
        }

        /// <summary>排行榜配置 parity:balance.json 的 leaderboard 段 vs Meta/Leaderboard.cs。</summary>
        private static void CheckLeaderboard(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var cfg = Meta.Leaderboard.Parity;
            var lb = MiniJson.Opt(doc, "leaderboard");
            if (lb == null) { check(false, "balance.json 有 leaderboard 段"); return; }

            int bad = 0, matched = 0;
            foreach (var kv in cfg)
            {
                string leaf = kv.Key.Substring("leaderboard.".Length);
                double json = MiniJson.Num(lb, leaf);
                if (double.IsNaN(json)) { bad++; check(false, $"leaderboard 缺键 {leaf}"); continue; }
                matched++;
                if (Math.Abs((double)kv.Value - json) > Tol) { bad++; check(false, $"排行榜配置不一致:{leaf}(JSON={json} vs C#={kv.Value})"); }
            }
            check(bad == 0, $"balance.json → Leaderboard.cs 逐键一致({matched} 个数值键)");

            // 四条榜的名字/顺序/方向也应当两边一致(名字是逻辑,不是纯展示)
            check(Meta.Leaderboard.Boards.Length == 4, "四条榜(Speed/Kills/Hit/NoHit)");
            check(Meta.Leaderboard.Ascending(Meta.Leaderboard.Board.Speed)
                  && Meta.Leaderboard.Ascending(Meta.Leaderboard.Board.NoHit)
                  && !Meta.Leaderboard.Ascending(Meta.Leaderboard.Board.Kills)
                  && !Meta.Leaderboard.Ascending(Meta.Leaderboard.Board.Hit),
                "时间榜升序、分数榜降序");
        }

        /// <summary>
        /// JSON 敌键 → C# 枚举名。**权威表是 tools/gen_bestiary.py 的 KIND**;
        /// 这里手写一份只是因为 ParityTests 是测试程序集(不便共享生成器的 Python 表)。
        /// 新增怪时两处都要加(踩过一次:漏加 → "未知敌人键")。
        /// </summary>
        private static Core.EnemyKind? KindOf(string jsonKey)
        {
            switch (jsonKey)
            {
                case "shroomling": return Core.EnemyKind.Shroomling;
                case "windbee": return Core.EnemyKind.WindBee;
                case "blightwolf": return Core.EnemyKind.BlightWolf;
                case "thornvine": return Core.EnemyKind.ThornVine;
                case "oakgolem": return Core.EnemyKind.OakGolem;
                case "emberimp": return Core.EnemyKind.EmberImp;
                case "frostslime": return Core.EnemyKind.FrostSlime;
                case "sparklizard": return Core.EnemyKind.SparkLizard;
                case "toxintoad": return Core.EnemyKind.ToxinToad;
                case "stardustsprite": return Core.EnemyKind.StardustSprite;
                case "snowpuff": return Core.EnemyKind.SnowPuff;
                case "iceturtle": return Core.EnemyKind.IceTurtle;
                case "blizzardhawk": return Core.EnemyKind.BlizzardHawk;
                case "frostmage": return Core.EnemyKind.FrostMage;
                case "cinderrat": return Core.EnemyKind.CinderRat;
                case "dunebeetle": return Core.EnemyKind.DuneBeetle;
                case "flamedancer": return Core.EnemyKind.FlameDancer;
                case "duststinger": return Core.EnemyKind.DustStinger;
                case "midboss_mossstag": return Core.EnemyKind.MidBossMossstag;
                case "boss_velsha": return Core.EnemyKind.BossVelsha;
                case "boss_kazra": return Core.EnemyKind.BossKazra;
                default: return null;
            }
        }

        /// <summary>
        /// 引导与存档槽 parity:步骤 id 顺序、步数、跳过键、槽数,以及"只有当前步骤的动作才作数"的推进规则。
        /// 步骤表是字符串数组(生成器跳过字符串),所以这里单独比对 —— 否则"web 教 5 步、Unity 教 4 步"没人会发现。
        /// </summary>
        private static void CheckTutorial(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            check(!string.IsNullOrEmpty(root), "引导 parity 需要仓库根(含 web/src/data)");
            if (root == null) return;
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var t = MiniJson.Opt(doc, "tutorial");
            if (t == null) { check(false, "balance.tutorial 存在"); return; }

            // steps 是**数组** → 用 OptArr(MiniJson.Opt 只认对象,拿数组会返回 null → 空引用)
            var steps = MiniJson.OptArr(t, "steps");
            if (steps == null) { check(false, "balance.tutorial.steps 是数组"); return; }
            var ids = new List<string>();
            foreach (var item in steps)
            {
                var row = MiniJson.Obj(item);
                ids.Add(MiniJson.Str(row, "id"));
                // 文案里允许写死的只有移动键(WASD/方向键):其余按键必须走 {action} 占位符,
                // 否则玩家改过键,引导就在骗人(web 侧同款规则见 meta/__tests__/tutorial.test.ts)
                string hint = MiniJson.Str(row, "hint");
                foreach (var literalKey in new[] { "Tab", "空格" })
                {
                    if (hint.Contains(literalKey) && !hint.Contains("{" + literalKey + "}"))
                        check(false, $"引导文案 {ids[ids.Count - 1]} 里出现了写死的按键 {literalKey}");
                }
                check(MiniJson.Str(row, "title").Length > 0, $"引导步骤 {ids[ids.Count - 1]} 有标题");
            }
            check(ids.Count == Tutorial.StepIds.Length,
                $"引导步数一致(JSON {ids.Count} vs C# {Tutorial.StepIds.Length})");
            bool orderOk = ids.Count == Tutorial.StepIds.Length;
            for (int i = 0; i < ids.Count && orderOk; i++) orderOk = ids[i] == Tutorial.StepIds[i];
            check(orderOk, "引导步骤顺序与 C# 镜像一致(" + string.Join("/", ids) + ")");
            check(ids.Count == 5, $"引导恰好 5 步(实际 {ids.Count})");

            string skip = MiniJson.Str(t, "skipKey");
            check(skip == Tutorial.SkipKey, $"跳过键一致({skip} vs {Tutorial.SkipKey})");

            int slots = (int)MiniJson.Num(t, "saveSlots", 0);
            check(slots == SaveSlots.Count, $"存档槽数量一致(JSON {slots} vs C# {SaveSlots.Count})");
            check(SaveSlots.KeyOf(0) == "sk_save" && SaveSlots.KeyOf(1) == "sk_save_slot1",
                "槽 0 用历史键、槽 1/2 加后缀(老玩家零迁移)");
            check(!SaveSlots.IsValid(-1) && !SaveSlots.IsValid(SaveSlots.Count), "槽下标越界判定");

            // 推进规则:C# 侧与 web 同款(顺序可预测 + 夹回越界 + 完成后不再变)
            int step = 0; bool done = false;
            check(!Tutorial.Notify(ref step, ref done, "dash"), "顺序不对的动作不作数(先翻滚不算)");
            check(Tutorial.Notify(ref step, ref done, "move") && step == 1, "第 1 步走动通过");
            for (int i = 1; i < Tutorial.StepCount; i++) Tutorial.Notify(ref step, ref done, Tutorial.StepIds[i]);
            check(done && step == Tutorial.StepCount, "5 步走完 → done");
            check(!Tutorial.Notify(ref step, ref done, "move"), "完成后任何动作都不再推进");
            int bad = 999; bool badDone = false;
            Tutorial.Notify(ref bad, ref badDone, "move");
            check(bad == Tutorial.StepCount && badDone, "越界 step 夹回并视为已完成");
            int s2 = 3; bool d2 = false;
            Tutorial.Skip(ref s2, ref d2);
            check(s2 == Tutorial.StepCount && d2, "跳过 = 立刻结束");
            Tutorial.Restart(ref s2, ref d2);
            check(s2 == 0 && !d2, "重看引导回到第 1 步");
        }

        /// <summary>从当前程序集位置向上找含 web/src/data 的目录。</summary>
        private static string FindRepoRoot()
        {
            string env = Environment.GetEnvironmentVariable("SKREPO");
            if (!string.IsNullOrEmpty(env) && Directory.Exists(Path.Combine(env, "web/src/data"))) return env;
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            for (int i = 0; i < 12 && dir != null; i++)
            {
                if (Directory.Exists(Path.Combine(dir.FullName, "web/src/data"))) return dir.FullName;
                dir = dir.Parent;
            }
            return null;
        }

        private static void CheckSkills(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            var mirror = new Dictionary<string, float>();
            void Merge(Dictionary<string, float> d)
            {
                foreach (var kv in d) mirror[kv.Key] = kv.Value;
            }
            Merge(BladeSkills.Parity);
            Merge(RangerSkills.Parity);
            Merge(ArcanistSkills.Parity);
            Merge(WardenSkills.Parity);

            var seen = new HashSet<string>();
            int skillsSeen = 0, keysSeen = 0, mismatches = 0;

            foreach (var klass in new[] { "blade", "ranger", "arcanist", "warden" })
            {
                string path = Path.Combine(root, $"web/src/data/skills/{klass}.json");
                if (!File.Exists(path)) { check(false, $"存在 {klass}.json"); continue; }
                var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
                foreach (var so in MiniJson.Arr(doc["skills"]))
                {
                    var s = MiniJson.Obj(so);
                    string id = MiniJson.Str(s, "id");
                    skillsSeen++;

                    void Cmp(string key, double jsonVal)
                    {
                        keysSeen++;
                        seen.Add(key);
                        if (!mirror.TryGetValue(key, out float csVal))
                        {
                            mismatches++;
                            check(false, $"{key} 在 C# 镜像里缺失(JSON={jsonVal})");
                            return;
                        }
                        if (Math.Abs(csVal - jsonVal) > Tol)
                        {
                            mismatches++;
                            check(false, $"{key} 数值不一致(JSON={jsonVal} vs C#={csVal})");
                        }
                    }

                    Cmp($"{id}:cooldown", MiniJson.Num(s, "cooldown"));
                    double minRage = MiniJson.Num(s, "minRage");
                    if (!double.IsNaN(minRage)) Cmp($"{id}:minRage", minRage);

                    foreach (var po in MiniJson.Arr(s["phases"]))
                    {
                        var ph = MiniJson.Obj(po);
                        string type = MiniJson.Str(ph, "type");
                        foreach (var kv in ph)
                        {
                            if (kv.Key == "type" || !(kv.Value is double num)) continue;
                            Cmp($"{id}:{type}.{kv.Key}", num);
                        }
                    }
                }
            }

            check(skillsSeen == 12, $"web 侧 12 个技能全部读到(实际 {skillsSeen})");
            check(keysSeen > 80, $"比对了 {keysSeen} 个数值键");
            check(mismatches == 0, "所有技能数值与 JSON 一致");

            var extra = new List<string>();
            foreach (var k in mirror.Keys) if (!seen.Contains(k)) extra.Add(k);
            check(extra.Count == 0, $"C# 镜像无多余键(多出 {extra.Count} 个{(extra.Count > 0 ? ": " + string.Join(", ", extra) : "")})");
        }

        private static void CheckRunes(Action<bool, string> check, Action<float, float, float, string> near, string root)
        {
            string path = Path.Combine(root, "web/src/data/runes/pool.json");
            if (!File.Exists(path)) { check(false, "存在 runes/pool.json"); return; }

            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var json = new Dictionary<string, Dictionary<string, object>>();
            foreach (var ro in MiniJson.Arr(doc["runes"]))
            {
                var r = MiniJson.Obj(ro);
                json[MiniJson.Str(r, "id")] = r;
            }

            var cs = new Dictionary<string, RuneDef>();
            foreach (var r in RunePool.All()) cs[r.Id] = r;

            check(json.Count == 36, $"web 侧 36 枚符文(实际 {json.Count})");
            check(cs.Count == 36, $"C# 侧 36 枚符文(实际 {cs.Count})");

            int bad = 0;
            var elemOf = new Dictionary<string, Element>
            {
                { "fire", Element.Fire }, { "ice", Element.Ice },
                { "bolt", Element.Bolt }, { "toxin", Element.Toxin },
            };

            foreach (var kv in json)
            {
                if (!cs.TryGetValue(kv.Key, out var r))
                {
                    bad++;
                    check(false, $"符文 {kv.Key} 在 C# 池中缺失");
                    continue;
                }
                var j = kv.Value;
                if (MiniJson.Str(j, "skill") != r.Skill) { bad++; check(false, $"符文 {kv.Key} 目标技能不一致"); }
                if (MiniJson.Str(j, "name") != r.Name) { bad++; check(false, $"符文 {kv.Key} 名称不一致({MiniJson.Str(j, "name")} vs {r.Name})"); }

                string je = MiniJson.Str(j, "element");
                if (je != null && elemOf.TryGetValue(je, out var el))
                {
                    if (!r.Element.HasValue || r.Element.Value != el)
                    {
                        bad++;
                        check(false, $"符文 {kv.Key} 元素不一致({je} vs {r.Element})");
                    }
                }

                var gz = MiniJson.Opt(j, "groundZone");
                if (gz == null)
                {
                    if (r.GroundZone != null) { bad++; check(false, $"符文 {kv.Key} C# 多了地带数据"); }
                }
                else if (r.GroundZone == null)
                {
                    bad++;
                    check(false, $"符文 {kv.Key} C# 缺少地带数据");
                }
                else
                {
                    // JSON: radiusM/lifeS/intervalS/mult  ↔  C#: [r, life, tick, mult]
                    double[] want = { MiniJson.Num(gz, "radiusM"), MiniJson.Num(gz, "lifeS"), MiniJson.Num(gz, "intervalS"), MiniJson.Num(gz, "mult") };
                    for (int i = 0; i < 4; i++)
                    {
                        if (Math.Abs(r.GroundZone[i] - want[i]) > Tol)
                        {
                            bad++;
                            check(false, $"符文 {kv.Key} 地带第 {i + 1} 个数不一致({want[i]} vs {r.GroundZone[i]})");
                        }
                    }
                }
            }
            check(bad == 0, "36 枚符文的 id/技能/名称/元素/地带与 JSON 完全一致");

            // 每技能位 3 枚 & 元素互斥(与 web 同规则,防止漏改一侧)
            var bySkill = new Dictionary<string, HashSet<Element>>();
            foreach (var r in cs.Values)
            {
                if (!bySkill.ContainsKey(r.Skill)) bySkill[r.Skill] = new HashSet<Element>();
                bySkill[r.Skill].Add(r.Element.Value);
            }
            bool ok = bySkill.Count == 12;
            foreach (var kv in bySkill) if (kv.Value.Count != 3) ok = false;
            check(ok, "12 技能位 × 3 元素互斥");
        }
    }
}
