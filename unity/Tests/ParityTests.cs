using System;
using StarfallKnights.Core;
using System.Collections.Generic;
using System.IO;
using StarfallKnights.Combat;
using StarfallKnights.Data;
using StarfallKnights.Dungeon;
using StarfallKnights.Meta;
using StarfallKnights.Skills;
using StarfallKnights.Loot;

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
            CheckAnim(check, root);
            CheckReactions(check, root);
            CheckLoot(check, root);
            CheckShop(check, root);
            CheckAbyss(check, root);
            CheckEndless(check, root);
            CheckAnimFrames(check, root);
            CheckAchievements(check, root);
            CheckEquip(check, root);
        }

        /// <summary>
        /// 动作表 parity(10-FULL-PLAN 轮 27 动画批次 1)。
        /// 数值叶子已由 CheckBestiary 逐键比对;这里管三件数值比对覆盖不到的事:
        /// 1. **布尔叶子 `loop`** 生成器跳过 → 必须单独比对(同教程步骤表、触屏开关的先例);
        /// 2. 动作清单两端一致(少一个动作 = 某个状态在 Unity 里永远播待机);
        /// 3. 只有待机/走路循环 —— 这条是**设计口径**,不是数值,所以得单独钉住。
        /// </summary>
        private static void CheckAnim(Action<bool, string> check, string root)
        {
            check(!string.IsNullOrEmpty(root), "动作表 parity 需要仓库根(含 web/src/data)");
            if (root == null) return;
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var a = MiniJson.Opt(doc, "anim");
            if (a == null) { check(false, "balance.anim 存在"); return; }

            var actions = new List<string>();
            int loopBad = 0, framesBad = 0;
            foreach (var kv in a)
            {
                if (kv.Key.StartsWith("$") || kv.Key == "bobAmplitudePx") continue;
                if (kv.Value is not Dictionary<string, object> row) { check(false, $"anim.{kv.Key} 是对象"); continue; }
                actions.Add(kv.Key);
                bool loop = row.TryGetValue("loop", out var raw) && raw is bool b && b;
                bool shouldLoop = kv.Key == "idle" || kv.Key == "walk";
                if (loop != shouldLoop) loopBad++;
                double frames = MiniJson.Num(row, "frames", 0);
                if (frames < 1 || frames > 12) framesBad++;
            }
            check(loopBad == 0, $"只有待机/走路是循环动作(违规 {loopBad} 个)");
            check(framesBad == 0, $"每个动作帧数在 1..12(违规 {framesBad} 个)");
            check(actions.Count == 7, $"动作清单 7 个(实际 {actions.Count}:{string.Join("/", actions)})");

            // 两端帧数/帧率对得上(生成常量 → 读回 C# 侧)
            foreach (var (key, act) in new[]
            {
                ("idle", AnimAction.Idle), ("walk", AnimAction.Walk), ("atk", AnimAction.Atk),
                ("dash", AnimAction.Dash), ("cast", AnimAction.Cast), ("hurt", AnimAction.Hurt), ("die", AnimAction.Die),
            })
            {
                var row = MiniJson.Opt(a, key);
                if (row == null) { check(false, $"anim.{key} 存在"); continue; }
                check((int)MiniJson.Num(row, "frames", 0) == AnimRules.Frames(act),
                    $"anim.{key}.frames 与 C# 一致({MiniJson.Num(row, "frames", 0)} vs {AnimRules.Frames(act)})");
                check(Math.Abs(MiniJson.Num(row, "fps", 0) - AnimRules.Fps(act)) < 1e-4f,
                    $"anim.{key}.fps 与 C# 一致");
            }
            check(Math.Abs(MiniJson.Num(a, "bobAmplitudePx", 0) - Bestiary.AnimBobAmplitudePx) < 1e-4f,
                "anim.bobAmplitudePx 与 C# 一致");

            // 推导量 parity(数值叶子比对覆盖不到的部分):走路一圈 = 帧数/帧率,
            // 两帧资产的翻帧步长 = 半圈 —— 这两条把"渲染层手写 8 次/秒"那类漂移钉死在数据上。
            double walkFrames = MiniJson.Num(MiniJson.Opt(a, "walk"), "frames", 0);
            double walkFps = MiniJson.Num(MiniJson.Opt(a, "walk"), "fps", 0);
            double cycle = walkFps > 0 ? walkFrames / walkFps : 0;
            check(Math.Abs(AnimRules.CycleSec(AnimAction.Walk) - cycle) < 1e-4f,
                $"走路一圈 = frames/fps({cycle:0.####}s vs C# {AnimRules.CycleSec(AnimAction.Walk):0.####}s)");
            check(Math.Abs(AnimRules.CycleSec(AnimAction.Walk) / 2.0 - cycle / 2.0) < 1e-4f,
                "两帧资产翻帧步长 = 走路半圈(与 json 推导值一致)");

            // 普攻形态 parity:json 里"这把武器是不是弓箭" ↔ C# 的 Shot/Combo ↔ 动画走 cast 还是 atk,三方对齐。
            // 这条链以前全在各调用点现算(而且 Unity 侧**根本没接**),漂了没人知道。
            var classes = MiniJson.Opt(doc, "classes");
            foreach (var (klass, hero, isShot) in new[]
            {
                ("blade", HeroClass.Blade, false), ("warden", HeroClass.Warden, false),
                ("ranger", HeroClass.Ranger, true), ("arcanist", HeroClass.Arcanist, true),
            })
            {
                var row = MiniJson.Opt(classes, klass);
                if (row == null) { check(false, $"classes.{klass} 存在"); continue; }
                bool jsonShot = MiniJson.Opt(row, "bow") != null;   // 数据里远程带 bow 段、近战带 combo 段
                check(jsonShot == isShot, $"classes.{klass}:json 是{(isShot ? "弓箭" : "近战")}流派(带 {(isShot ? "bow" : "combo")} 段)");
                check(BasicAttack.KindOf(hero) == (isShot ? BasicAttack.Kind.Shot : BasicAttack.Kind.Combo),
                    $"classes.{klass}:codegen 的 KindOf 与 json 一致");
                var want = isShot ? AnimAction.Cast : AnimAction.Atk;
                check(AnimRules.AttackAction(isShot) == want, $"classes.{klass}:普攻动作 = {want}(远程走 cast)");
            }
            // 动作时钟:一次性动作的动作总时长必须 = frames/fps,否则"序列放完就停住"的时机两端不同
            foreach (var (key, act) in new[]
            {
                ("atk", AnimAction.Atk), ("dash", AnimAction.Dash), ("cast", AnimAction.Cast),
                ("hurt", AnimAction.Hurt), ("die", AnimAction.Die),
            })
            {
                var row = MiniJson.Opt(a, key);
                double want = MiniJson.Num(row, "frames", 0) / Math.Max(1e-9, MiniJson.Num(row, "fps", 0));
                check(Math.Abs(AnimRules.CycleSec(act) - want) < 1e-4f,
                    $"anim.{key} 动作总时长 = frames/fps({want:0.####}s)");
            }
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
            // 角色动作表(帧数/帧率/起伏幅度)
            var anim = MiniJson.Opt(doc, "anim");
            if (anim != null) Walk(anim, "anim");
            // 玩家基准(player 段)—— 此前是手抄常量且已漂,现在进 parity
            var player = MiniJson.Opt(doc, "player");
            if (player != null) Walk(player, "player");
            // 元素反应(reactions 段)—— 同样:手抄常量漂了一整批才被发现,现在进 parity
            var reactions = MiniJson.Opt(doc, "reactions");
            if (reactions != null) Walk(reactions, "reactions");
            // 橙装特效 / 消耗品 / 蓝图(轮 19–21):三段数值键同样进通用循环
            foreach (var sect in new[] { "specials", "consumables", "blueprint", "shop", "events", "abyss", "endless" })
            {
                var seg = MiniJson.Opt(doc, sect);
                if (seg != null) Walk(seg, sect);
            }

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
            // 三段各自逐键对一遍(通用循环只覆盖 Bestiary;player/reactions 是独立类,这里显式带上)
            foreach (var (label, table) in new (string, Dictionary<string, float>)[]
            {
                ("玩家基准", BestiaryPlayer.Parity), ("元素反应", BestiaryReactions.Parity),
            })
            {
                int bad = 0;
                foreach (var kv in table)
                {
                    if (!leaves.TryGetValue(kv.Key, out double jsonVal)) continue;
                    if (Math.Abs(kv.Value - jsonVal) > Tol) bad++;
                }
                check(bad == 0, $"{label}逐键与 JSON 一致({table.Count} 键,不一致 {bad})");
            }

            var extra = new List<string>();
            foreach (var k in Bestiary.Parity.Keys) if (!leaves.ContainsKey(k)) extra.Add(k);
            check(extra.Count == 0, $"图鉴无多余键(多出 {extra.Count} 个{(extra.Count > 0 ? ": " + string.Join(", ", extra) : "")})");
            // 玩家基准同理:JSON 里删了字段而 C# 常量还在,就是僵尸常量(没人会发现它已经不该存在)
            var extraPlayer = new List<string>();
            foreach (var k in BestiaryPlayer.Parity.Keys) if (!leaves.ContainsKey(k)) extraPlayer.Add(k);
            check(extraPlayer.Count == 0,
                $"玩家基准无多余键(多出 {extraPlayer.Count} 个{(extraPlayer.Count > 0 ? ": " + string.Join(", ", extraPlayer) : "")})");
            // 元素反应同理:它是**新接进 parity 的段**(此前完全没覆盖,所以手抄常量漂了没人知道)
            var extraRx = new List<string>();
            foreach (var k in BestiaryReactions.Parity.Keys) if (!leaves.ContainsKey(k)) extraRx.Add(k);
            check(extraRx.Count == 0,
                $"元素反应无多余键(多出 {extraRx.Count} 个{(extraRx.Count > 0 ? ": " + string.Join(", ", extraRx) : "")})");
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

        /// <summary>
        /// 深渊难度层 parity(2026-09-29,轮 23)。
        ///
        /// 数值叶子走生成常量(已由通用循环逐键比对),这里钉**规则与口径**:
        /// 逐列单调、普通档全中性、逐层解锁(不能跳级)、越界安全、形状稳定。
        /// 这类"结构性质"一旦在移植时被抹平(比如把逐层解锁做成"通关 10 次全开"),
        /// 数值 parity 依然全绿,但玩法已经变了。
        /// </summary>
        private static void CheckAbyss(Action<bool, string> check, string root)
        {
            if (root == null) return;
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var abyss = MiniJson.Opt(doc, "abyss");
            if (abyss == null) { check(false, "balance.abyss 存在"); return; }
            var lv = MiniJson.OptArr(abyss, "levels") ?? new List<object>();
            check(lv.Count == AbyssRules.LevelCount, $"层数一致(JSON {lv.Count} vs C# {AbyssRules.LevelCount})");

            // 逐列单调:越高层怪越硬、掉得越多(不能出现"III 的掉落比 II 低")
            string[] cols = { "hpMult", "atkMult", "lootMult", "dustMult" };
            int bad = 0;
            for (int i = 0; i < lv.Count; i++)
            {
                var row = MiniJson.Obj(lv[i]);
                for (int j = 0; j < cols.Length; j++)
                {
                    float json = (float)MiniJson.Num(row, cols[j]);
                    float cs = cols[j] switch { "hpMult" => AbyssRules.HpMult(i + 1), "atkMult" => AbyssRules.AtkMult(i + 1), "lootMult" => AbyssRules.LootMult(i + 1), _ => AbyssRules.DustMult(i + 1) };
                    if (Math.Abs(json - cs) > Tol) bad++;
                    if (i > 0 && json <= (float)MiniJson.Num(MiniJson.Obj(lv[i - 1]), cols[j])) bad++;
                }
            }
            check(bad == 0, $"三层四条乘区逐列递增且与 C# 一致(异常 {bad} 处)");
            check(AbyssRules.Levels[0].Loot > 1f && AbyssRules.Levels[2].Dust > AbyssRules.Levels[0].Dust,
                "难度要值得打:掉落乘区 > 1 且越高层星尘越多");
            check(AbyssRules.Normal == 0 && AbyssRules.HpMult(AbyssRules.Normal) == 1f
                  && AbyssRules.AtkMult(AbyssRules.Normal) == 1f && AbyssRules.LootMult(AbyssRules.Normal) == 1f
                  && AbyssRules.EliteWaves(AbyssRules.Normal) == 0,
                "普通档全中性(系统侧不需要 if (abyss > 0))");
            check(AbyssRules.HpMult(99) == 1f && AbyssRules.LootMult(-3) == 1f,
                "越界难度档回中性(坏存档不该让玩家进不去游戏)");

            // 逐层解锁:不能跳级
            var none = new int[3];
            var first = new int[] { 1, 0, 0 };
            var enough = new int[] { 9, 9, 9 };
            int needI = (int)Bestiary.AbyssLevels0UnlockClears;
            check(needI > 0 && !AbyssRules.Unlocked(1, needI - 1, none) && AbyssRules.Unlocked(1, needI, none),
                "深渊 I 看普通局通关数");
            check(!AbyssRules.Unlocked(2, 9999, none) && AbyssRules.Unlocked(2, 9999, first),
                "深渊 II 必须深渊 I 先通关(跳级 = 直接撞高倍血量的墙)");
            check(!AbyssRules.Unlocked(3, 9999, first) && AbyssRules.Unlocked(3, 9999, enough),
                "深渊 III 只认深渊 II 的通关数");
            check(AbyssRules.Unlocked(AbyssRules.Normal, 0, none) && !AbyssRules.Unlocked(4, 9999, enough),
                "普通远征永远可选;越界层永远不可选");
            check(AbyssRules.MaxPlayable(0, none) == AbyssRules.Normal
                  && AbyssRules.MaxPlayable(needI, none) == 1
                  && AbyssRules.MaxPlayable(needI, enough) == 3,
                "MaxPlayable 给出当前能打的最高层");
            check(AbyssRules.LockReason(1, 0, none) != null && AbyssRules.LockReason(AbyssRules.Normal, 0, none) == null,
                "锁着的原因说得清;普通档没有原因");

            // 形状稳定 + 不改入参
            var before = new int[] { 2, 0, 0 };
            var after = AbyssRules.RecordClear(1, before);
            check(after.Length == AbyssRules.LevelCount && after[0] == 3 && before[0] == 2,
                "通关计数形状恒为层数,且不改入参");
            var normalClear = AbyssRules.RecordClear(AbyssRules.Normal, before);
            check(normalClear.Length == AbyssRules.LevelCount && normalClear[0] == 2,
                "普通局通关也返回规整数组(否则存档形状会随档位变)");
            check(AbyssRules.RecordClear(99, before).Length == AbyssRules.LevelCount, "越界档位不写出超长数组");

            // 解锁提示只在跨过去那一次
            check(AbyssRules.NewlyUnlocked(needI - 1, none, needI, none) == 1
                  && AbyssRules.NewlyUnlocked(needI, none, needI + 1, none) == -1,
                "解锁提示只报一次(已解锁的不反复提示)");

            // 乘区应用顺序:章节 → 深渊(web RunMods.enemy 同序,乘积可交换所以只比结果)
            var (hp, atk) = AbyssRules.Apply(3, 100f, 20f);
            check(Math.Abs(hp - 100f * Bestiary.AbyssLevels2HpMult) < Tol
                  && Math.Abs(atk - 20f * Bestiary.AbyssLevels2AtkMult) < Tol,
                "Apply 把三层乘区作用到血/攻上");
            check(Math.Abs(AbyssRules.NightBonusMult - Bestiary.AbyssNightBonusMult) < Tol,
                "夜战加成读数据表(不写死)");
        }



        /// <summary>
        /// 动作帧名的**跨端命名契约**(2026-09-30,轮 28 下半场补)。
        ///
        /// 先说清这条为什么必须存在:web 侧帧名是**登记制**(`SPRITE_NAMES` + 管线报的
        /// `_anim_metrics.json`),而 C# 侧是**推导制**(`AnimRules.FrameName` 按 `base_action_i` 拼)。
        /// 推导制不需要"登记",代价是**它永远拼得出一个名字,却没人保证那个文件真的存在** ——
        /// 于是两端一旦在动作段拼写或编号起点上漂了(比如 web 改用 `attack` 而 C# 还是 `atk`),
        /// Unity 侧会**静默指向不存在的帧**、回退到待机,而且所有测试照样全绿。
        ///
        /// 所以这里拿**管线自己报的清单**当权威,逐帧比 C# 拼出来的名字:两边对不上就红。
        /// 清单里出现 C# 认不出的动作段也要红(数据加了新动作而规则没跟上)。
        /// </summary>
        private static void CheckAnimFrames(Action<bool, string> check, string root)
        {
            if (root == null) return;
            string path = Path.Combine(root, "web/public/sprites/_anim_metrics.json");
            if (!File.Exists(path)) { check(false, "存在 _anim_metrics.json(跑 tools/process_frames.py)"); return; }
            var m = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            int seqCount = 0, frameCount = 0, badName = 0, badFrames = 0, badLoop = 0, badAction = 0;
            string firstBad = "";
            foreach (var kv in m)
            {
                string seq = kv.Key;
                var info = MiniJson.Obj(kv.Value);
                int frames = (int)MiniJson.Num(info, "frames");
                int underscore = seq.LastIndexOf('_');
                if (underscore <= 0) { badAction++; continue; }
                string baseName = seq.Substring(0, underscore);
                string actionKey = seq.Substring(underscore + 1);

                // 动作段 → AnimAction(两端用同一套拼写:walk/atk/dash/cast/hurt/die/idle)
                AnimAction action;
                switch (actionKey)
                {
                    case "idle": action = AnimAction.Idle; break;
                    case "walk": action = AnimAction.Walk; break;
                    case "atk": action = AnimAction.Atk; break;
                    case "dash": action = AnimAction.Dash; break;
                    case "cast": action = AnimAction.Cast; break;
                    case "hurt": action = AnimAction.Hurt; break;
                    case "die": action = AnimAction.Die; break;
                    default: badAction++; if (firstBad == "") firstBad = seq; continue;
                }

                seqCount++;
                // 逐帧比名字:web 的 `{seq}_{i}` 必须等于 C# 拼的 `{base}_{actionKey}_{i}`
                for (int i = 1; i <= frames; i++)
                {
                    frameCount++;
                    string want = seq + "_" + i;
                    string got = AnimRules.FrameName(baseName, action, i);
                    if (want != got) { badName++; if (firstBad == "") firstBad = want + " vs " + got; }
                }
                // 帧数/循环口径必须与同一份清单一致(帧数漂了 = 播到不存在的帧)
                if (AnimRules.Frames(action) != frames) { badFrames++; if (firstBad == "") firstBad = seq; }
                bool shouldLoop = actionKey == "idle" || actionKey == "walk";
                if (AnimRules.Loop(action) != shouldLoop) { badLoop++; if (firstBad == "") firstBad = seq; }
            }
            check(seqCount >= 12, $"清单里的序列都认得动作段({seqCount} 套)");
            check(badAction == 0, $"没有 C# 认不出的动作段{(badAction > 0 ? ",首个:" + firstBad : "")}");
            check(badName == 0, $"逐帧命名一致({frameCount} 帧){(badName > 0 ? ",首个不符:" + firstBad : "")}");
            check(badFrames == 0, "帧数与 C# 规则一致(漂了就会播到不存在的帧)");
            check(badLoop == 0, "只有待机/走路循环,其余是一次性动作");

            // 反向:已入库序列的**职业**端 —— 四职业的 base 名必须和 web 的 SPRITE_NAMES 对得上
            string scene = File.ReadAllText(Path.Combine(root, "web/src/game/gfx/spriteDraw.ts"));
            foreach (var cls in new[] { "knight", "ranger", "arcanist", "warden" })
                check(scene.Contains("'" + cls + "'"), "web 精灵登记含职业 base:" + cls);
            // 秘术师(轮 28 下半场 + 收尾)六套齐编 —— 少一套 Unity 侧会静默回退待机
            foreach (var seq in new[] { "arcanist_walk", "arcanist_cast", "arcanist_dash", "arcanist_hurt", "arcanist_die" })
                check(m.ContainsKey(seq), "清单含 " + seq);
            // 守卫(轮 29)六套齐编 —— 四职业动画全齐,批次 27–29 收官
            foreach (var seq in new[] { "warden_walk", "warden_atk", "warden_dash", "warden_hurt", "warden_die", "warden_cast" })
                check(m.ContainsKey(seq), "清单含 " + seq);
        }

        /// <summary>
        /// 无尽模式 parity(2026-09-29,轮 24)。数值叶子已由生成器逐键比对(含两道闸门的**上限值**),
        /// 这里补三类生成器看不到的东西:
        /// 1. **章节循环规则**(1→2→3→1)与负数/极端输入的安全 —— 移植时若写成"循环越大章越靠后",
        ///    数值 parity 依然全绿,但第 100 循环会指向不存在的章节;
        /// 2. **两道闸门真的夹住**:乘区上限 + 数值上限,极端循环数下必须仍是有限值(本轮验收门);
        /// 3. **挑战局口径**:无尽是玩家自选开关,挑战局固定关 —— 与深渊"挑战固定普通档"同一条纪律。
        /// </summary>
        private static void CheckEndless(Action<bool, string> check, string root)
        {
            if (root == null) return;
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var e = MiniJson.Opt(doc, "endless");
            if (e == null) { check(false, "balance.endless 存在"); return; }

            // 数值逐键(生成器已比,这里比的是"规则读的值"与 JSON 同源)
            string[] keys = { "loopHp", "loopAtk", "loopLoot", "loopDust", "maxMult", "maxHp", "maxAtk", "unlockClears" };
            float[] cs = { Bestiary.EndlessLoopHp, Bestiary.EndlessLoopAtk, Bestiary.EndlessLoopLoot, Bestiary.EndlessLoopDust,
                           Bestiary.EndlessMaxMult, Bestiary.EndlessMaxHp, Bestiary.EndlessMaxAtk, Bestiary.EndlessUnlockClears };
            int bad = 0;
            for (int i = 0; i < keys.Length; i++)
                if (Math.Abs((float)MiniJson.Num(e, keys[i]) - cs[i]) > Tol) bad++;
            check(bad == 0, $"八条无尽数值与 C# 常量一致(异常 {bad} 处)");

            // 章节循环
            check(EndlessRules.ChapterOfLoop(0) == 1 && EndlessRules.ChapterOfLoop(1) == 2
                  && EndlessRules.ChapterOfLoop(2) == 3 && EndlessRules.ChapterOfLoop(3) == 1
                  && EndlessRules.ChapterOfLoop(7) == 2,
                "章节按 1→2→3→1 循环(无尽复用三章内容,不出第四章)");
            check(EndlessRules.ChapterOfLoop(-1) == 3 && EndlessRules.ChapterOfLoop(-4) == 3,
                "负数循环给合法章节(坏档不该让游戏进不去)");

            // 乘区:循环 0 中性、几何增长、封顶
            var m0 = EndlessRules.LoopMultsOf(0);
            check(m0.Hp == 1f && m0.Atk == 1f && m0.Loot == 1f && m0.Dust == 1f,
                "循环 0 全中性(第一遍三章就是普通远征)");
            var m1 = EndlessRules.LoopMultsOf(1);
            var m2 = EndlessRules.LoopMultsOf(2);
            check(m1.Hp > 1f && m2.Hp > m1.Hp && m2.Loot > m1.Loot, "乘区随循环递增");
            check(m1.Loot < m1.Hp, "掉落涨得比血量慢(否则越打越轻松)");
            check(Math.Abs(m1.Loot - Bestiary.EndlessLoopLoot) < Tol, "第 1 循环的掉落乘区就是数据表的值");

            // 两道闸门:极端循环数下仍有限、且顶到上限
            var mBig = EndlessRules.LoopMultsOf(200000);
            check(!float.IsNaN(mBig.Hp) && !float.IsInfinity(mBig.Hp) && mBig.Hp <= Bestiary.EndlessMaxMult,
                "极端循环数下乘区封顶而不是溢出成 Infinity");
            var (hpBig, atkBig) = EndlessRules.Apply(200000, 100f, 20f);
            check(hpBig <= Bestiary.EndlessMaxHp && !float.IsInfinity(hpBig) && hpBig >= 1f,
                $"溢出时血量顶到上限(实测 {hpBig:0})");
            check(atkBig == Bestiary.EndlessMaxAtk, $"攻击顶到上限 {Bestiary.EndlessMaxAtk:0}");
            check(EndlessRules.SafeHp(float.NaN) >= 1f && EndlessRules.SafeHp(float.PositiveInfinity) <= Bestiary.EndlessMaxHp,
                "NaN/Infinity 进闸门也出得来有限值(伤害公式不会被污染)");
            check(EndlessRules.SafeMult(1e9f) == Bestiary.EndlessMaxMult && EndlessRules.SafeMult(float.NaN) == Bestiary.EndlessMaxMult
                  && EndlessRules.SafeMult(1.5f) == 1.5f,
                "乘区闸门:不取整、NaN 走上限、正常值原样过");

            // 解锁与纪录
            int need = (int)Bestiary.EndlessUnlockClears;
            check(need > 0 && !EndlessRules.Unlocked(need - 1) && EndlessRules.Unlocked(need),
                "无尽看任意难度通关数(门槛读数据表)");
            check(!EndlessRules.Unlocked(-5), "负通关数不误判成解锁");
            var rec = EndlessRules.RecordRun(23, 2, 10, 1);
            check(rec.bestFloor == 23 && rec.bestLoop == 2, "刷新纪录时取更大的值");
            var rec2 = EndlessRules.RecordRun(5, 0, 23, 2);
            check(rec2.bestFloor == 23 && rec2.bestLoop == 2, "打得更差不会把纪录改小");
            check(EndlessRules.RecordRun(-3, -1, 0, 0).bestFloor == 0, "负数层数不污染纪录");
            check(EndlessRules.IsNewRecord(24, 23) && !EndlessRules.IsNewRecord(23, 23),
                "只有严格超过才算刷新(平纪录不弹两次提示)");

            // 展示文案(两端一致,免得结算页一个说"层"一个说"关")
            check(EndlessRules.LoopLabel(0).Contains("循环 1") && EndlessRules.LoopLabel(0).Contains("第1章"),
                "循环标签含循环数与章节");
            check(EndlessRules.FloorLabel(0) == "第 1 层" && EndlessRules.FloorLabel(12) == "第 12 层",
                "层标签下限 1(还没进房间时不显示第 0 层)");
            check(EndlessRules.LockReason(1).Contains("/"), "锁着的原因说得清");

            // 挑战局口径:无尽是自选开关,宿主默认关(与深渊"挑战固定普通档"同纪律)
            check(!new RunManagerLite().Endless, "RunManagerLite 默认不开无尽(挑战局固定关)");
        }

        /// <summary>
        /// 商店与秘境 parity(2026-09-29,轮 22)。
        ///
        /// 数值叶子由生成器进 parity,这里补两件生成器**做不到**的事:
        /// 1. `events.totems` 是**字符串数组** → 被生成器跳过,必须逐 id 与 C# 清单比对
        ///    (漏实现一座碑 = 玩家抽到一块按不动的石头,而数值 parity 全绿);
        /// 2. 议价/献祭/特惠的**边界口径** —— 三档切分、幸运不吃大成功、失败永远存在、
        ///    便宜货涨价不能"看起来没反应"、残血不许献祭。
        /// </summary>
        private static void CheckShop(Action<bool, string> check, string root)
        {
            if (root == null) return;
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var events = MiniJson.Opt(doc, "events");
            var shop = MiniJson.Opt(doc, "shop");
            if (events == null || shop == null) { check(false, "balance.shop / balance.events 存在"); return; }

            // ---- 碑池:字符串清单逐 id 比(生成器跳过字符串) ----
            var jsonTotems = MiniJson.OptArr(events, "totems") ?? new List<object>();
            check(jsonTotems.Count == ShopRules.Totems.Length,
                $"碑池条数一致(JSON {jsonTotems.Count} vs C# {ShopRules.Totems.Length})");
            int bad = 0; string firstBad = "";
            for (int i = 0; i < Math.Min(jsonTotems.Count, ShopRules.Totems.Length); i++)
            {
                if (jsonTotems[i] as string != ShopRules.Totems[i]) { bad++; if (firstBad == "") firstBad = jsonTotems[i] as string; }
            }
            check(bad == 0, $"碑 id 逐项一致{(bad > 0 ? "，首个不一致:" + firstBad : "")}");
            check(ShopRules.MissingTotems().Count == 0,
                "每座碑都有实现(数据加了碑而没写处理 = 玩家抽到一块按不动的石头)");
            check(jsonTotems.Count >= (int)Bestiary.EventTotemPick, "碑池不小于每次抽取数");

            // ---- 碑的展示元数据(轮 25):两端各一份表,逐 id 比 —— 数据加了碑而元数据没跟上,
            // 渲染就会在抽到它的时候炸(轮 22 的 web 就是这么崩的)
            int metaBad = 0; string metaFirst = "";
            foreach (var t in jsonTotems)
            {
                var id = t as string;
                if (id == null) continue;
                var v = ShopRules.TotemVisual(id);
                bool ok = !string.IsNullOrEmpty(v.icon) && !string.IsNullOrEmpty(v.name) && v.name != id
                          && !string.IsNullOrEmpty(v.desc) && v.color != null && v.color.Length == 7 && v.color[0] == '#';
                if (!ok) { metaBad++; if (metaFirst == "") metaFirst = id; }
            }
            check(metaBad == 0, "每座碑都有完整展示元数据(首个不一致: " + metaFirst + ")");
            var unknown = ShopRules.TotemVisual("no_such_totem");
            check(unknown.name == "no_such_totem" && unknown.color.Length == 7,
                "不认识的碑 id 也给出完整元数据(渲染循环绝不抛错)");

            // ---- 轮 25 规则:回响 / 疗愈 / 收益当量 / 抉择记录 ----
            check(ShopRules.EchoDust(120f) == Math.Round(120f * Bestiary.EventEchoFrac, MidpointRounding.AwayFromZero),
                "回响:有记录时给上次价值的 echoFrac");
            check(ShopRules.EchoDust(0f) == (int)Bestiary.EventEchoFallbackDust
                  && ShopRules.EchoDust(-80f) == (int)Bestiary.EventEchoFallbackDust
                  && ShopRules.EchoDust(float.NaN) == (int)Bestiary.EventEchoFallbackDust,
                "回响:没有记录(或负值/NaN)走兜底星尘,不会给出负数");
            check(Bestiary.EventMendHpMult < 1f && Bestiary.EventMendHpMult > 0f, "疗愈之碑的代价是上限(<1)");
            check(ShopRules.TotemBlocker("echo", 1f, 0) == null && ShopRules.TotemBlocker("mend", 1f, 0) == null,
                "两座新碑都没有硬门槛(兜底/玩家判断)");

            check(ShopRules.RepayValue("blood") == (int)Bestiary.EventRepayBlood
                  && ShopRules.RepayValue("mend") == (int)Bestiary.EventRepayMend
                  && ShopRules.RepayValue("blessing") == (int)Bestiary.EventRepayBlessing,
                "收益当量:血/祝福/疗愈读数据表");
            check(ShopRules.RepayValue("gamble", won: true, gambleSpent: 60, gambleDust: 180) == 120
                  && ShopRules.RepayValue("gamble", won: false, gambleSpent: 60) == -60,
                "收益当量:赌赢记净赚、赌输记负值(面板要能显示「这局亏了」)");
            check(ShopRules.RepayValue("relic", hasRune: true) == (int)Bestiary.EventRepayRune
                  && ShopRules.RepayValue("relic", relicDust: 60) == 60,
                "收益当量:有符文献机会价值,集齐才折星尘");

            var log = ShopRules.PushChoice(new List<ShopRules.TotemChoice>(),
                new ShopRules.TotemChoice(2, "blood", (int)Bestiary.EventRepayBlood));
            var log2 = ShopRules.PushChoice(log, new ShopRules.TotemChoice(9, "echo", ShopRules.EchoDust(log[0].Value)));
            check(log2.Count == 2 && log2[0].Totem == "echo" && log.Count == 1,
                "记录:新的在前,且不改入参(web pushChoice 同口径)");
            var capped = new List<ShopRules.TotemChoice>();
            for (int i = 0; i < 40; i++)
                capped = ShopRules.PushChoice(capped, new ShopRules.TotemChoice(i, "fountain", 10));
            check(capped.Count == (int)Bestiary.EventEventLogMax,
                "记录裁到 eventLogMax(" + (int)Bestiary.EventEventLogMax + " 条),存档不随时间膨胀");
            var sum = ShopRules.SummariseChoices(log2);
            check(sum.counts["blood"] == 1 && sum.total == (int)Bestiary.EventRepayBlood + ShopRules.EchoDust((int)Bestiary.EventRepayBlood),
                "汇总:次数与累计星尘当量对得上(总览两栏都读它)");

            // ---- 抽取:数量对、不重复、四座以上池子时不会永远同一组 ----
            var rolls = new List<float> { 0.11f, 0.42f, 0.73f, 0.95f, 0.28f, 0.61f };
            var picked = ShopRules.PickTotems(rolls);
            check(picked.Count == (int)Bestiary.EventTotemPick, $"抽 {Bestiary.EventTotemPick} 座碑");
            var uniq = new HashSet<string>(picked);
            check(uniq.Count == picked.Count, "抽出的碑不重复");
            var picked2 = ShopRules.PickTotems(new List<float> { 0.9f, 0.1f, 0.5f, 0.3f, 0.7f, 0.2f });
            check(string.Join(",", picked2) != string.Join(",", picked), "不同随机序列给出不同组合(池子真的在转)");

            // ---- 议价:三档 + 幸运的范围 + 失败永远存在 ----
            float bigC = Bestiary.ShopHaggleBigChance;
            float sucC = Bestiary.ShopHaggleSuccessChance;
            float luckMax = Bestiary.ShopHaggleLuckMax;
            check(bigC + sucC + luckMax <= 0.9f + 1e-4f, $"大成功+小成功+幸运上限 ≤ 0.9(失败永远存在):{bigC + sucC + luckMax}");
            check(ShopRules.HaggleOutcome(0f, 0f) == ShopRules.Haggle.Big, "roll=0 → 大成功");
            check(ShopRules.HaggleOutcome(bigC + 0.001f, 0f) == ShopRules.Haggle.Success, "过了大成功线 → 小成功");
            check(ShopRules.HaggleOutcome(0.999f, 0f) == ShopRules.Haggle.Fail, "高位 → 失败");
            check(ShopRules.HaggleOutcome(bigC + 0.001f, 9999f) == ShopRules.Haggle.Success,
                "幸运加满也不把「大成功线」往前推(否则幸运够了 = 议价必大成功)");
            check(ShopRules.HaggleOutcome(bigC + sucC + luckMax - 0.001f, 0f) == ShopRules.Haggle.Fail
                  && ShopRules.HaggleOutcome(bigC + sucC + luckMax - 0.001f, 100f) == ShopRules.Haggle.Success,
                "幸运只提高「至少小成功」的概率(边界上刚好能翻过来)");
            check(Math.Abs(ShopRules.LuckBonus(9999f) - luckMax) < Tol && ShopRules.LuckBonus(float.NaN) == 0f
                  && ShopRules.LuckBonus(-5f) == 0f, "幸运加成有上限;NaN/负值当 0(否则概率会变 NaN)");
            check(ShopRules.HaggleOutcome(0.999f, 9999f) == ShopRules.Haggle.Fail, "加满幸运仍可能失败");

            // ---- 价格变更:方向对、下限 1、便宜货涨价也看得出 ----
            check(ShopRules.HagglePrice(100, ShopRules.Haggle.Big) < 100
                  && ShopRules.HagglePrice(100, ShopRules.Haggle.Success) < 100
                  && ShopRules.HagglePrice(100, ShopRules.Haggle.Success) > ShopRules.HagglePrice(100, ShopRules.Haggle.Big),
                "大成功比小成功更便宜,两者都比原价低");
            check(ShopRules.HagglePrice(100, ShopRules.Haggle.Fail) > 100, "议价失败 = 涨价(有代价才有博弈)");
            check(ShopRules.HagglePrice(1, ShopRules.Haggle.Fail) > 1,
                "底价商品涨价也至少 +1(否则价签没动,看起来像按钮失灵)");
            check(ShopRules.HagglePrice(1, ShopRules.Haggle.Big) >= 1, "降价下限 1");
            check(ShopRules.PriceOf(100, 0.5f) == 100, "jitter 中点 = 基准价");
            check(ShopRules.PriceOf(100, 0f) < 100 && ShopRules.PriceOf(100, 0.999f) > 100, "jitter 两端真的浮动");
            check(ShopRules.PriceOf(1, 0f) >= 1, "定价下限 1");
            int deal = ShopRules.DealPrice(200);
            check(deal < 200 && deal >= (int)Math.Round(200 * (1f - Bestiary.ShopDealOff)) - 1, "特惠是打折且有下界");

            // ---- 秘境:不能选的原因 + 献祭代价 ----
            check(ShopRules.TotemBlocker("gamble", 100f, (int)Bestiary.EventGambleCost - 1) == "noStardust",
                "星尘不够 → 赌局点不动(说得出原因)");
            check(ShopRules.TotemBlocker("gamble", 100f, (int)Bestiary.EventGambleCost) == null, "星尘够了就能赌");
            check(ShopRules.TotemBlocker("sacrifice", 1f, 0) == "hpTooLow", "1 点血不许献祭(那是自杀按钮)");
            check(ShopRules.TotemBlocker("sacrifice", 2f, 0) == null, "2 点血可以献祭(代价 1,还剩 1)");
            check(ShopRules.TotemBlocker("blood", 1f, 0) == null && ShopRules.TotemBlocker("fountain", 1f, 0) == null,
                "不消耗资源的碑永远能选");
            check(ShopRules.SacrificeHpCost(200f) == (int)Math.Ceiling(200f * Bestiary.EventSacrificeHpFrac),
                "献祭代价按**当前**生命算");
            check(ShopRules.GamblePayout(true) == (int)Math.Round(Bestiary.EventGambleCost * Bestiary.EventGambleMult)
                  && ShopRules.GamblePayout(false) == 0, "赌局:赢 = 投入 × 倍数,输 = 0");
            check(ShopRules.StockSlots(2) == 3 + 2 + 1 + (int)Bestiary.ShopConsStands, "货位数 = 装备 3 + 骨架 + 药 + 消耗品");
        }

        /// <summary>
        /// 装备规则 parity(2026-09-29,M2 内容包 轮 19–21):橙装特效 9 / 消耗品 4 / 蓝图 6。
        ///
        /// 为什么单独一层:这三段的**字符串叶子**(specials.frostfangElement、consumables.flask.element)
        /// 与 **web/src/data/blueprints.json 的字符串字段**(slot/rarity/special/affixes)**会被
        /// gen_bestiary.py 的规则跳过** —— 数值 parity 全绿也可能"元素名改了/特效换了/词条表改了"而无人发现。
        /// 这里补上字符串比对,再钉住几条最容易在移植时被抹平的边界口径。
        /// </summary>
        private static void CheckLoot(Action<bool, string> check, string root)
        {
            if (root == null) return;
            string balPath = Path.Combine(root, "web/src/data/balance.json");
            string bpPath = Path.Combine(root, "web/src/data/blueprints.json");
            string spPath = Path.Combine(root, "web/src/data/items/specials.json");
            if (!File.Exists(balPath) || !File.Exists(bpPath) || !File.Exists(spPath))
            {
                check(false, "存在 balance.json / blueprints.json / items/specials.json");
                return;
            }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(balPath)));

            // ---- 字符串叶子:生成器比对不到的那两个 ----
            var specials = MiniJson.Opt(doc, "specials");
            var consumables = MiniJson.Opt(doc, "consumables");
            string frost = MiniJson.Str(specials, "frostfangElement");
            check(frost == LootRules.FrostfangElement,
                $"霜咬补的元素一致(JSON={frost} vs C#={LootRules.FrostfangElement})");
            string flaskEl = MiniJson.Str(MiniJson.Opt(consumables, "flask"), "element");
            check(flaskEl == LootRules.FlaskElement,
                $"元素瓶附魔一致(JSON={flaskEl} vs C#={LootRules.FlaskElement})");

            // ---- 特效表:9 个 / id 唯一 / 部位全覆盖 ----
            var spDoc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(spPath)));
            var spList = MiniJson.OptArr(spDoc, "list") ?? new List<object>();
            check(spList.Count == LootRules.Specials.Length,
                $"特效条数一致(JSON {spList.Count} vs C# {LootRules.Specials.Length})");
            int spBad = 0;
            for (int i = 0; i < Math.Min(spList.Count, LootRules.Specials.Length); i++)
            {
                var row = MiniJson.Obj(spList[i]);
                var cs = LootRules.Specials[i];
                if (MiniJson.Str(row, "id") != cs.Id || MiniJson.Str(row, "slot") != cs.Slot
                    || MiniJson.Str(row, "itemName") != cs.ItemName) spBad++;
            }
            check(spBad == 0, $"9 个特效逐条(id/部位/物品名)与 specials.json 一致");
            check(LootRules.SlotsWithoutSpecial().Count == 0,
                "六个部位都有特效(空部位 = 那个部位永远不出橙装特效)");

            // ---- 规则:每个特效至少一条行为断言(边界优先) ----
            check(Math.Abs(LootRules.HitDamageMult(new[] { "echo_ring" }, 5) - Bestiary.SpecialEchoMult) < Tol
                  && Math.Abs(LootRules.HitDamageMult(new[] { "echo_ring" }, 4) - 1f) < Tol,
                "回响之戒:第 5 击 ×2,第 4 击不变");
            check(Math.Abs(LootRules.HitDamageMult(new string[0], 5) - 1f) < Tol, "没这件装备 = 中性(不是恰好也 ×2)");
            var st = LootRules.StrikeElement(new[] { "frostfang" }, null);
            check(st.Element == LootRules.FrostfangElement, "霜咬:空元素命中补冰");
            check(LootRules.StrikeElement(new[] { "frostfang" }, "fire").Element == "fire", "霜咬不抢已有元素(火不被冰覆盖)");
            check(Math.Abs(LootRules.KillHeal(new[] { "soulfeast" }) - Bestiary.SpecialSoulfeastHeal) < Tol
                  && LootRules.KillHeal(new string[0]) == 0f, "噬魂坠击杀回复;没装备回 0");
            check(Math.Abs(LootRules.ComboRangeMult(new[] { "tempest" }, true) - Bestiary.SpecialTempestRangeMult) < Tol
                  && Math.Abs(LootRules.ComboRangeMult(new[] { "tempest" }, false) - 1f) < Tol,
                "怒涛之刃:只有终结段放大范围");
            check(Math.Abs(LootRules.DamageTakenMult(new[] { "stoneheart" }, 0.1f)
                           - (1f - Bestiary.SpecialStoneheartReduce)) < Tol
                  && Math.Abs(LootRules.DamageTakenMult(new[] { "stoneheart" }, 0.9f) - 1f) < Tol,
                "磐石胸甲:低血减伤,满血不减");
            check(LootRules.ReflectOnHurt(new[] { "thornmail" }, 1e9f) == (int)Bestiary.SpecialThornCap,
                "棘刺反伤有封顶(没上限会一次清场)");
            check(LootRules.ReflectOnHurt(new[] { "thornmail" }, -5f) == 0
                  && LootRules.ReflectOnHurt(new string[0], 100f) == 0, "反伤不吃负伤害,没装备不回伤");
            check(Math.Abs(LootRules.WindhoodAtkPct(new[] { "windhood" }, true) - Bestiary.SpecialWindhoodAtkPct) < Tol
                  && LootRules.WindhoodAtkPct(new[] { "windhood" }, false) == 0f,
                "猎风兜帽:移动才有加成");
            check(Math.Abs(LootRules.StarhelmAtkPct(new[] { "starhelm" }, 0.5f) - Bestiary.SpecialStarhelmAtkPct) < Tol
                  && LootRules.StarhelmAtkPct(new[] { "starhelm" }, Bestiary.SpecialStarhelmWindowS + 0.1f) == 0f,
                "星陨兜帽:窗口内才有加成");
            check(LootRules.DashLeavesFire(new[] { "emberstride" }) && !LootRules.DashLeavesFire(new string[0]),
                "焰行者之靴:翻滚留火(有/没有两态)");

            // ---- 消耗品:四条边界 ----
            check(LootRules.ShieldCap(1000f) == (int)Math.Round(1000f * Bestiary.ConsumableShieldCapPct)
                  && LootRules.ShieldCap(1f) == 1, "护盾上限 = 生命 × capPct,下限 1");
            var s1 = LootRules.ApplyShield(1000f);
            var s2 = LootRules.ApplyShield(1000f);
            check(Math.Abs(s1.Amount - s2.Amount) < Tol, "连喝两瓶不叠厚(只刷新)");
            var ab = LootRules.AbsorbDamage(s1.Amount, s1.T, 10f);
            check(Math.Abs(ab.Left) < Tol && ab.HasShield, "先吃盾再进血");
            var ab2 = LootRules.AbsorbDamage(s1.Amount, s1.T, s1.Amount);
            check(Math.Abs(ab2.Left) < Tol && !ab2.HasShield, "盾刚好破:这一次不掉血,盾消失");
            var ab3 = LootRules.AbsorbDamage(s1.Amount, s1.T, s1.Amount + 10f);
            check(Math.Abs(ab3.Left - 10f) < Tol, "打穿盾之后多出来的伤害照常进血");
            check(!LootRules.TickShield(0.05f, 0.2f).Alive, "盾到期即消失(不留 0 盾僵尸状态)");
            var cl = LootRules.Cleanse(99);
            check(cl.Removed == (int)Bestiary.ConsumableCleanseDebuffMax, "净化一次清不完(有上限)");
            check(cl.Iframes > 0f && cl.Iframes < 2f * BestiaryPlayer.PlayerDashDuration,
                $"净化无敌({cl.Iframes}s)与翻滚同量级,不取代翻滚");
            check(Math.Abs(LootRules.SlowFactor("normal") - Bestiary.ConsumableTimeslowSlowPct) < Tol
                  && LootRules.SlowFactor("boss") > 0f
                  && LootRules.SlowFactor("boss") < LootRules.SlowFactor("normal"),
                "时缓:普通全效、Boss 打折但**不是免疫**");
            var fl = LootRules.ApplyFlask();
            check(fl.Element == LootRules.FlaskElement && !LootRules.TickFlask(0.05f, 0.2f).Alive,
                "元素瓶覆盖式刷新且有时限");

            // ---- 蓝图:6 张,字符串字段逐项比(生成器覆盖不到的那一段) ----
            var bpDoc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(bpPath)));
            var bpList = MiniJson.OptArr(bpDoc, "list") ?? new List<object>();
            check(bpList.Count == LootRules.Blueprints.Length,
                $"蓝图条数一致(JSON {bpList.Count} vs C# {LootRules.Blueprints.Length})");
            int bpBad = 0;
            string firstBad = "";
            for (int i = 0; i < Math.Min(bpList.Count, LootRules.Blueprints.Length); i++)
            {
                var row = MiniJson.Obj(bpList[i]);
                var cs = LootRules.Blueprints[i];
                var affixes = MiniJson.OptArr(row, "affixes") ?? new List<object>();
                bool ok = MiniJson.Str(row, "id") == cs.Id && MiniJson.Str(row, "slot") == cs.Slot
                          && MiniJson.Str(row, "rarity") == cs.Rarity && MiniJson.Str(row, "special") == cs.Special
                          && Math.Abs(MiniJson.Num(row, "costShards", 0) - cs.CostShards) < Tol
                          && affixes.Count == cs.Affixes.Length;
                if (ok)
                {
                    for (int j = 0; j < affixes.Count; j++)
                        if (affixes[j] as string != cs.Affixes[j]) ok = false;
                }
                if (!ok) { bpBad++; if (firstBad == "") firstBad = MiniJson.Str(row, "id"); }
            }
            check(bpBad == 0, $"6 张蓝图逐项(部位/稀有度/特效/词条/价)与 blueprints.json 一致{(bpBad > 0 ? "，首个不一致:" + firstBad : "")}");

            // 蓝图的特效必须属于它的部位,否则铸出来的是"错部位的橙装"
            int slotBad = 0;
            foreach (var bp in LootRules.Blueprints)
            {
                int idx = -1;
                for (int i = 0; i < LootRules.Specials.Length; i++) if (LootRules.Specials[i].Id == bp.Special) idx = i;
                if (idx < 0 || LootRules.Specials[idx].Slot != bp.Slot) slotBad++;
            }
            check(slotBad == 0, "每张蓝图的特效部位与蓝图部位一致");

            // ---- 铸造 / 重铸的边界(菜单里最容易被点出来的三条) ----
            var owned = new List<string>();
            foreach (var bp in LootRules.Blueprints) owned.Add(bp.Id);
            check(LootRules.CraftBlocker("bp_不存在", 999, owned) == "unknown", "找不到的蓝图报 unknown(不是静默失败)");
            check(LootRules.CraftBlocker(LootRules.Blueprints[0].Id, 999, new List<string>()) == "owned",
                "没学会不让造(报 owned,与 unknown 分开)");
            check(LootRules.CraftBlocker(LootRules.Blueprints[0].Id, 0, owned) == "shards", "碎片不够报 shards");
            var made = LootRules.Craft(LootRules.Blueprints[0].Id, 99, owned);
            check(made.Special == LootRules.Blueprints[0].Special
                  && made.ShardsLeft == 99 - LootRules.Blueprints[0].CostShards
                  && made.Slot == LootRules.Blueprints[0].Slot, "铸造:扣碎片 + 出指定特效 + 指定部位");
            check(LootRules.Blueprints[0].CostShards <= (int)Bestiary.BlueprintCraftCost * 3,
                "蓝图价与铸台基准价同量级(防手滑写出天价图纸)");
            check(LootRules.ReforgeRerollCount(3) == Math.Min((int)Bestiary.BlueprintReforgeRerollMax, 2),
                "重铸最多重掷 reforgeRerollMax 条");
            check(LootRules.ReforgeRerollCount(1) == 0, "只有一条词条时不重掷(至少留一条锚点)");
            check(LootRules.CanReforge(2, (int)Bestiary.BlueprintReforgeCost)
                  && !LootRules.CanReforge(2, (int)Bestiary.BlueprintReforgeCost - 1)
                  && !LootRules.CanReforge(0, 9999), "重铸:星尘不够 / 没词条都洗不了");
        }

        /// <summary>
        /// 元素反应 parity(2026-09-29 新段)。
        /// 这段以前**完全不在 parity 里**,于是 `Data/Balance.cs` 的手抄常量静静漂了一整批:
        /// 蒸汽 0.9 vs 1.8、超载 1.6 vs 2.2、脆蚀 +20% vs +25%、麻痹 0.8s vs 1.2s。
        /// 这里除了逐键(上面的通用循环已覆盖),再钉两条**行为口径**:超载要带击退值、脆蚀要带易伤百分比。
        /// </summary>
        private static void CheckReactions(Action<bool, string> check, string root)
        {
            if (root == null) return;
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var rx = MiniJson.Opt(doc, "reactions");
            if (rx == null) { check(false, "balance.reactions 存在"); return; }

            var overload = MiniJson.Opt(rx, "overload");
            var brittle = MiniJson.Opt(rx, "brittle");
            var numb = MiniJson.Opt(rx, "numb");
            check(Math.Abs(MiniJson.Num(overload, "mult", 0) - BestiaryReactions.ReactionsOverloadMult) < 1e-4f,
                $"超载倍率与 C# 一致({MiniJson.Num(overload, "mult", 0)} vs {BestiaryReactions.ReactionsOverloadMult})");
            check(Math.Abs(MiniJson.Num(brittle, "pct", 0) - BestiaryReactions.ReactionsBrittlePct) < 1e-4f,
                $"脆蚀易伤 pct 与 C# 一致({MiniJson.Num(brittle, "pct", 0)} vs {BestiaryReactions.ReactionsBrittlePct})");
            check(Math.Abs(MiniJson.Num(numb, "stunS", 0) - BestiaryReactions.ReactionsNumbStunS) < 1e-4f,
                $"麻痹时长与 C# 一致({MiniJson.Num(numb, "stunS", 0)} vs {BestiaryReactions.ReactionsNumbStunS})");

            // 行为口径:脆蚀易伤 **必须真的进伤害公式**(否则 pct 改了也不生效)
            var w = new LogicWorld();
            var attacker = new Actor { Pos = new System.Numerics.Vector2(0f, 0f) };
            attacker.Unit.Atk = 100f;
            attacker.Unit.IsPlayerTeam = true;
            var victim = new Actor { Pos = new System.Numerics.Vector2(1f, 0f) };
            victim.Unit.Hp = victim.Unit.HpMax = 1000f;
            victim.Unit.Def = 0f;
            victim.Unit.VulnT = 10f;
            victim.Unit.VulnPct = BestiaryReactions.ReactionsBrittlePct;
            int dmg = DamagePipeline.Deal(new DealOpts
            {
                Source = attacker.Unit, Target = victim.Unit, Mult = 1f, CanCrit = false,
            });
            int want = (int)Math.Round(100f * (1f + BestiaryReactions.ReactionsBrittlePct), MidpointRounding.AwayFromZero);
            check(Math.Abs(dmg - want) <= 1, $"脆蚀易伤进伤害公式({dmg} ≈ {want})");
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
            check(mechBad == 0, "地形机制 + 障碍耐久与 JSON 一致(13 个键)");

            // 摆放规则要用到体型(间距是否容得下玩家),这两个也得对得上
            near(BestiaryPlayer.PlayerBodyRadius, (float)MiniJson.Num(MiniJson.Obj(MiniJson.Opt(doc, "player")), "bodyRadius"), Tol, "玩家体型");
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
                case "midboss_frosthuntress": return Core.EnemyKind.MidBossFrosthuntress;
                case "midboss_sandreaper": return Core.EnemyKind.MidBossSandreaper;
                case "icespike": return Core.EnemyKind.IceSpike;
                case "iceglider": return Core.EnemyKind.IceGlider;
                case "mirageblossom": return Core.EnemyKind.MirageBlossom;
                case "emberwhirl": return Core.EnemyKind.EmberWhirl;
                case "leafwisp": return Core.EnemyKind.LeafWisp;
                case "frostmoth": return Core.EnemyKind.FrostMoth;
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

            check(json.Count == 48, $"web 侧 48 枚符文(实际 {json.Count})");
            check(cs.Count == 48, $"C# 侧 48 枚符文(实际 {cs.Count})");

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
            check(bad == 0, "48 枚符文的 id/技能/名称/元素/地带与 JSON 完全一致");

            // 每技能位 4 枚 & 四元素全覆盖(与 web 同规则,防止漏改一侧)
            var bySkill = new Dictionary<string, HashSet<Element>>();
            foreach (var r in cs.Values)
            {
                if (!bySkill.ContainsKey(r.Skill)) bySkill[r.Skill] = new HashSet<Element>();
                bySkill[r.Skill].Add(r.Element.Value);
            }
            bool ok = bySkill.Count == 12;
            foreach (var kv in bySkill) if (kv.Value.Count != 4) ok = false;
            check(ok, "12 技能位 × 四元素全覆盖");
        }

        /// <summary>
        /// 成就 parity(轮 41):权威表 = web/src/data/achievements.json,32 条逐 id 比对
        /// cat/icon/metric/goal/timeS + 顺序 + 双向数量。web 侧守卫钉派生 goal
        /// (怪物总数/碑种数/榜数/符文口径),所以这里只要和 JSON 咬合,三方就闭环。
        /// </summary>
        private static void CheckAchievements(Action<bool, string> check, string root)
        {
            string path = Path.Combine(root, "web/src/data/achievements.json");
            if (!File.Exists(path)) { check(false, "存在 achievements.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            var rows = MiniJson.Arr(doc["achievements"]);

            var cs = Meta.Achievements.All;
            check(rows.Count == 32, $"web 侧 32 条成就(实际 {rows.Count})");
            check(cs.Length == rows.Count, $"C# 侧条数一致(JSON={rows.Count} vs C#={cs.Length})");

            var catOf = new Dictionary<string, Meta.Achievements.Cat>
            {
                { "progress", Meta.Achievements.Cat.Progress }, { "combat", Meta.Achievements.Cat.Combat },
                { "speed", Meta.Achievements.Cat.Speed }, { "codex", Meta.Achievements.Cat.Codex },
                { "meta", Meta.Achievements.Cat.Meta },
            };
            var metricOf = new Dictionary<string, Meta.Achievements.Metric>
            {
                { "runs", Meta.Achievements.Metric.Runs }, { "clears", Meta.Achievements.Metric.Clears },
                { "totalKills", Meta.Achievements.Metric.TotalKills }, { "noHitClears", Meta.Achievements.Metric.NoHitClears },
                { "dailyClears", Meta.Achievements.Metric.DailyClears }, { "weeklyClears", Meta.Achievements.Metric.WeeklyClears },
                { "crafts", Meta.Achievements.Metric.Crafts }, { "stardust", Meta.Achievements.Metric.Stardust },
                { "codexEnemies", Meta.Achievements.Metric.CodexEnemies }, { "codexRunes", Meta.Achievements.Metric.CodexRunes },
                { "bossFound", Meta.Achievements.Metric.BossFound }, { "midbossFound", Meta.Achievements.Metric.MidbossFound },
                { "bestClassRunes", Meta.Achievements.Metric.BestClassRunes }, { "boardsFilled", Meta.Achievements.Metric.BoardsFilled },
                { "altarBest", Meta.Achievements.Metric.AltarBest }, { "altarLevels", Meta.Achievements.Metric.AltarLevels },
                { "totemKinds", Meta.Achievements.Metric.TotemKinds }, { "totemTotal", Meta.Achievements.Metric.TotemTotal },
                { "bestTimeUnder", Meta.Achievements.Metric.BestTimeUnder },
            };

            int bad = 0;
            int n = Math.Min(rows.Count, cs.Length);
            for (int i = 0; i < n; i++)
            {
                var r = MiniJson.Obj(rows[i]);
                var a = cs[i];
                string id = MiniJson.Str(r, "id");
                if (id != a.Id) { bad++; check(false, $"第 {i} 条 id 顺序一致(JSON={id} vs C#={a.Id})"); continue; }
                string cat = MiniJson.Str(r, "cat");
                if (!catOf.TryGetValue(cat, out var wantCat)) { bad++; check(false, $"{id}: 已知分类 {cat}"); }
                else if (wantCat != a.Category) { bad++; check(false, $"{id}: 分类一致(JSON={cat} vs C#={a.Category})"); }
                string icon = MiniJson.Str(r, "icon");
                if (icon != a.Icon) { bad++; check(false, $"{id}: 图标一致(JSON={icon} vs C#={a.Icon})"); }
                string metric = MiniJson.Str(r, "metric");
                if (!metricOf.TryGetValue(metric, out var wantMetric)) { bad++; check(false, $"{id}: 已知 metric {metric}"); }
                else if (wantMetric != a.Kind) { bad++; check(false, $"{id}: metric 一致(JSON={metric} vs C#={a.Kind})"); }
                double goal = MiniJson.Num(r, "goal");
                if (Math.Abs(goal - a.Goal) > Tol) { bad++; check(false, $"{id}: goal 一致(JSON={goal} vs C#={a.Goal})"); }
                double timeS = MiniJson.Num(r, "timeS", 0);
                if (Math.Abs(timeS - a.TimeS) > Tol) { bad++; check(false, $"{id}: timeS 一致(JSON={timeS} vs C#={a.TimeS})"); }
            }
            check(bad == 0, $"achievements.json ↔ Achievements.cs 逐条一致({n} 条 × 6 字段)");
        }

        /// <summary>装备/祭坛的镜像常量(轮 44):invSize + 祭坛每级加成,逐键对 balance.json。</summary>
        private static void CheckEquip(Action<bool, string> check, string root)
        {
            string path = Path.Combine(root, "web/src/data/balance.json");
            if (!File.Exists(path)) { check(false, "存在 balance.json"); return; }
            var doc = MiniJson.Obj(MiniJson.Parse(File.ReadAllText(path)));
            int bad = 0;
            foreach (var kv in Loot.Equip.Parity)
            {
                int dot = kv.Key.IndexOf('.');
                var seg = MiniJson.Opt(doc, kv.Key.Substring(0, dot));
                double json = seg == null ? double.NaN : MiniJson.Num(seg, kv.Key.Substring(dot + 1));
                if (double.IsNaN(json)) { bad++; check(false, $"balance.json 缺键 {kv.Key}"); continue; }
                if (Math.Abs(json - kv.Value) > Tol) { bad++; check(false, $"{kv.Key} 不一致(JSON={json} vs C#={kv.Value})"); }
            }
            check(bad == 0, $"Equip 镜像常量 ↔ balance.json 逐键一致({Loot.Equip.Parity.Count} 键)");
        }
    }
}
