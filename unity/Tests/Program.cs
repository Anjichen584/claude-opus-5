using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;
using StarfallKnights.Data;
using StarfallKnights.Dungeon;
using StarfallKnights.Loot;
using StarfallKnights.Meta;
using StarfallKnights.Skills;

namespace StarfallKnights.Tests
{
    /// <summary>
    /// C# 逻辑层自带断言跑批(零依赖,dotnet run 即用)。
    /// 目的:镜像层不能"看着像对"——每次改动都要能被验证,并与 web 端数据比对(见 ParityTests)。
    /// </summary>
    public static class Program
    {
        private static int _pass;
        private static readonly List<string> Failures = new();
        private static string _suite = "";

        private static void Suite(string name)
        {
            _suite = name;
            Console.WriteLine($"\n── {name} ──");
        }

        private static void Check(bool cond, string what)
        {
            if (cond)
            {
                _pass++;
                Console.WriteLine($"  ✓ {what}");
            }
            else
            {
                Failures.Add($"[{_suite}] {what}");
                Console.WriteLine($"  ✗ {what}");
            }
        }

        private static void Near(float a, float b, float eps, string what) =>
            Check(MathF.Abs(a - b) <= eps, $"{what}(实际 {a:0.###} vs 期望 {b:0.###})");

        private static Actor MakeEnemy(LogicWorld w, Vector2 pos = default, float hp = 500f, float atk = 8f, float def = 0f)
        {
            var e = new Actor { Pos = pos, Kind = EnemyKind.Shroomling };
            e.Unit.HpMax = hp;
            e.Unit.Hp = hp;
            e.Unit.Atk = atk;
            e.Unit.Def = def;
            w.Enemies.Add(e);
            return e;
        }

        private static Actor MakePlayer(LogicWorld w, Vector2 pos = default, float atk = 50f)
        {
            var p = new Actor { Pos = pos, IsPlayer = true, Face = 0f };
            p.Unit.HpMax = 100f;
            p.Unit.Hp = 100f;
            p.Unit.Atk = atk;
            p.Unit.CritRate = 0f; // 测试可复现:不暴击
            p.Unit.CritDmg = 1.5f;
            p.Unit.IsPlayerTeam = true;
            w.Player = p;
            return p;
        }

        private static void Advance(LogicWorld w, float seconds, params SkillRuntime[] runtimes)
            => Advance(w, seconds, 1f / 60f, runtimes);

        /// <summary>推进世界(可选同时推进技能执行器的延迟段/冷却)。</summary>
        private static void Advance(LogicWorld w, float seconds, float step, params SkillRuntime[] runtimes)
        {
            for (float t = 0; t < seconds; t += step)
            {
                foreach (var rt in runtimes) rt.Tick(step);
                w.Tick(step);
            }
        }

        // ---------------- 房间布局模板(web 生成规则 → C# 镜像) ----------------
        private static void TestRoomLayouts()
        {
            Suite("房间布局模板(抽模板规则 / 摆放常量 / parity)");

            var all = new List<string>();
            all.AddRange(RoomLayouts.Combat);
            all.AddRange(RoomLayouts.BossRoom);
            all.AddRange(RoomLayouts.Calm);
            Check(all.Count == 15, $"15 个模板(战斗 13 + Boss + 静谧,实际 {all.Count})");
            Check(new HashSet<string>(all).Count == all.Count, "模板名无重复");
            Check(RoomLayouts.IsKnown("narrow") && RoomLayouts.IsKnown("boss") && RoomLayouts.IsKnown("calm"), "IsKnown 认得出已知模板");
            Check(!RoomLayouts.IsKnown("volcano") && !RoomLayouts.IsKnown(""), "IsKnown 拒绝未知模板(运行时不留 undefined)");

            // 按章抽:每章 2000 次,该章有权重的模板都露面,没权重的绝不出
            var rng = new Random(2026);
            bool onlyCombat = true;
            var missReport = new List<string>();
            foreach (int chapter in new[] { 1, 2, 3 })
            {
                var seen = new Dictionary<string, int>();
                for (int i = 0; i < 2000; i++)
                {
                    var id = RoomLayouts.Pick(rng, "battle", chapter);
                    seen[id] = seen.TryGetValue(id, out var n) ? n + 1 : 1;
                    if (Array.IndexOf(RoomLayouts.Combat, id) < 0) onlyCombat = false;
                }
                foreach (var id in RoomLayouts.Combat)
                {
                    if (RoomLayouts.WeightOf(id, chapter) > 0 && !seen.ContainsKey(id)) missReport.Add($"ch{chapter}:{id}");
                    if (RoomLayouts.WeightOf(id, chapter) == 0 && seen.ContainsKey(id)) missReport.Add($"ch{chapter}不该出{id}");
                }
            }
            Check(onlyCombat, "战斗房只会抽到战斗模板");
            Check(missReport.Count == 0, $"章节权重抽样正确(问题 {missReport.Count} 处{(missReport.Count > 0 ? ": " + string.Join(",", missReport) : "")})");
            // 地貌分章:一章无冰原/荒漠,二章无荒漠,三章无冰原
            bool ch1Clean = true, ch2Clean = true, ch3Clean = true;
            foreach (var id in new[] { "icefield", "drift", "crystal", "dunes", "ruins" })
                if (RoomLayouts.WeightOf(id, 1) > 0) ch1Clean = false;
            foreach (var id in new[] { "dunes", "ruins" })
                if (RoomLayouts.WeightOf(id, 2) > 0) ch2Clean = false;
            foreach (var id in new[] { "icefield", "drift", "crystal" })
                if (RoomLayouts.WeightOf(id, 3) > 0) ch3Clean = false;
            Check(ch1Clean && ch2Clean && ch3Clean, "地貌分章:一章纯林地、二章无荒漠、三章无冰原");
            Check(RoomLayouts.WeightOf("icefield", 2) >= RoomLayouts.WeightOf("scatter", 2), "第二章冰原词权重不低于通用词");
            Check(RoomLayouts.WeightOf("ruins", 3) >= RoomLayouts.WeightOf("scatter", 3), "第三章荒漠词权重不低于通用词");

            var rng2 = new Random(88);
            bool eliteOk = true, bossOk = true, calmOk = true;
            for (int i = 0; i < 200; i++)
            {
                var e = RoomLayouts.Pick(rng2, "elite");
                if (e == "scatter" || Array.IndexOf(RoomLayouts.Elite, e) < 0) eliteOk = false;
                if (RoomLayouts.Pick(rng2, "boss") != "boss") bossOk = false;
                if (RoomLayouts.Pick(rng2, "calm") != "calm") calmOk = false;
            }
            Check(eliteOk, "精英房只抽有地形的模板(不出散布)");
            Check(bossOk, "Boss 房固定 Boss 场");
            Check(calmOk, "商店/宝藏/秘境固定静谧房间");

            // 同种子可复现(回放/测试的前提)
            var a = new Random(1234);
            var b = new Random(1234);
            var seqA = new List<string>();
            var seqB = new List<string>();
            for (int i = 0; i < 50; i++)
            {
                seqA.Add(RoomLayouts.Pick(a, "battle"));
                seqB.Add(RoomLayouts.Pick(b, "battle"));
            }
            Check(string.Join(",", seqA) == string.Join(",", seqB), "同种子抽样序列完全一致");

            // 摆放规则之间的数值关系(不是拍脑袋写的,是被这条断言锁住的)
            float playerDia = 2f * (Balance.RockBodyRadius + BestiaryPlayer.PlayerBodyRadius);
            Check(RoomLayouts.MinGapM > playerDia, $"散件间距 {RoomLayouts.MinGapM}m 容得下玩家穿过(需 >{playerDia:0.##}m)");
            Check(RoomLayouts.WallSpacingM < playerDia, $"墙砖间距 {RoomLayouts.WallSpacingM}m 小于玩家直径 → 墙是砌死的");
            Check(RoomLayouts.MinCorridorM > 2f * BestiaryPlayer.PlayerBodyRadius, "窄道通道净宽容得下玩家");
            Check(RoomLayouts.EntryClearXM > 2.5f && RoomLayouts.ExitClearXM > 2.5f, "出入口净空盖住玩家落点/传送门");
            Check(RoomLayouts.MaxLooseSolids < RoomLayouts.MaxProps && RoomLayouts.MaxProps >= RoomLayouts.MaxWallProps,
                "物件上限自洽(散件 < 总数,Boss 场留白不超上限)");
            Check(RoomLayouts.Parity.Count == 42, $"layouts 段镜像 42 个数值键(实际 {RoomLayouts.Parity.Count})");
            Check(RoomLayouts.DoorM > 2f * (Balance.RockBodyRadius + BestiaryPlayer.PlayerBodyRadius)
                  || RoomLayouts.DoorM > 1.44f, "门洞净宽能过玩家");
            Check(RoomLayouts.CenterFreeM > BestiaryPlayer.PlayerBodyRadius * 2f, "中央净空容得下走位");
            Check(RoomLayouts.RuinsWallSpacingM > RoomLayouts.DoorM, "废墟柱距 > 门洞(不然后墙无缺口)");
        }

        // ---------------- 挑战(每日词条池 + 周常铁律) ----------------
        private static void TestChallenges()
        {
            Suite("挑战系统(每日词条池 / 周常铁律 / 与 web 同抽签)");

            Check(Challenges.DailyPool.Length == 10, $"每日词条池 10 条(实际 {Challenges.DailyPool.Length})");
            Check(Challenges.WeeklyRules.Length == 8, $"周常铁律 8 条(实际 {Challenges.WeeklyRules.Length})");
            Check(Challenges.DailyCount == 3 && Challenges.WeeklyDailyPicks == 2, "每日抽 3 条 / 周常抽 2 条词条");

            // id 唯一 + 池间不撞车
            var ids = new HashSet<string>();
            bool dup = false, crossover = false;
            foreach (var m in Challenges.DailyPool) if (!ids.Add(m.Id)) dup = true;
            foreach (var r in Challenges.WeeklyRules) { if (!ids.Add(r.Id)) crossover = true; }
            Check(!dup, "每日词条 id 唯一");
            Check(!crossover, "铁律 id 与每日池不撞车(否则抽签剔除规则会失效)");

            // 铁律守恒:每条都既有代价也有好处(与 web 单测同一套判定)
            int noCost = 0, noBenefit = 0, inert = 0;
            foreach (var r in Challenges.WeeklyRules)
            {
                if (!Challenges.HasCost(r)) noCost++;
                if (!Challenges.HasBenefit(r)) noBenefit++;
                if (!Challenges.Touches(r)) inert++;
            }
            Check(noCost == 0, $"每条铁律都有代价(没有代价的:{noCost} 条)");
            Check(noBenefit == 0, $"每条铁律都有好处(没有好处的:{noBenefit} 条)");
            Check(inert == 0, $"没有空转铁律(既不改结构也不改数值:{inert} 条)");

            int structural = 0;
            foreach (var r in Challenges.WeeklyRules)
                if (r.ExtraWaves > 0 || r.ShopClosed || r.AltarOff || r.EliteShift != 0 || r.ForcedLayouts.Length > 0) structural++;
            Check(structural >= 4, $"至少一半铁律改的是结构(实际 {structural} 条)");

            // 结构字段的合法范围(运行时不留负数/垃圾地形名)
            int rangeBad = 0;
            foreach (var r in Challenges.WeeklyRules)
            {
                if (r.ExtraWaves < 0 || r.ExtraWaves > 2) rangeBad++;
                if (Math.Abs(r.EliteShift) > 3) rangeBad++;
                foreach (var id in r.ForcedLayouts) if (!RoomLayouts.IsKnown(id)) rangeBad++;
            }
            Check(rangeBad == 0, "结构字段全在合法范围(波数/偏移/地形白名单)");
            Check(Challenges.KnownLayouts(new[] { "narrow", "volcano", "ring" }).Count == 2, "未知地形名会被过滤掉");

            // ---- 抽签链路:golden 向量(由 web 端 weeklyChallenge 跑出,两端必须一致)----
            var golden = new (string Key, uint Seed, string Rule, string Mods, string Layout)[]
            {
                ("2026-W01", 308697997u, "glasscannon", "glasscannon,horde,frenzy", null),
                ("2026-W03", 1066323077u, "leyline", "leyline,juggernaut,frenzy", "ring"),
                ("2026-W15", 879564148u, "leyline", "leyline,greed,juggernaut", "shore"),
                ("2026-W20", 3006287507u, "earlyelite", "earlyelite,fieldmedic,frenzy", null),
                ("2026-W40", 3692430313u, "closedmarket", "closedmarket,frail,swift", null),
                ("2026-W53", 1902221119u, "bulwark", "bulwark,juggernaut,frenzy", null),
                ("2027-W05", 1694985633u, "earlyelite", "earlyelite,horde,longnight", null),
            };
            int goldenBad = 0;
            foreach (var g in golden)
            {
                var pick = Challenges.WeeklyPick(g.Key);
                var mods = string.Join(",", Array.ConvertAll(pick.Mods, m => m.Id));
                bool ok = pick.Seed == g.Seed && pick.Rule.Id == g.Rule && mods == g.Mods
                          && (pick.Structure.ForcedLayout ?? null) == g.Layout;
                if (!ok)
                {
                    goldenBad++;
                    Check(false, $"{g.Key} 抽签与 web 不一致(seed={pick.Seed} 铁律={pick.Rule.Id} 词条={mods} 地形={pick.Structure.ForcedLayout ?? "-"})");
                }
            }
            Check(goldenBad == 0, $"7 个周键的抽签与 web 逐项一致(同 seed → 同规则)");

            // 同周可复现 / 结构翻译正确
            var a1 = Challenges.WeeklyPick("2026-W40");
            var a2 = Challenges.WeeklyPick("2026-W40");
            Check(a1.Rule.Id == a2.Rule.Id && a1.Seed == a2.Seed, "同周抽签可复现");
            Check(a1.Mods.Length == 1 + Challenges.WeeklyDailyPicks, $"周常共 {1 + Challenges.WeeklyDailyPicks} 条规则(铁律 + 词条)");
            Check(a1.Mods[0].Id == a1.Rule.Id, "第一条永远是铁律");
            var modIds = new HashSet<string>();
            bool modDup = false;
            foreach (var m in a1.Mods) if (!modIds.Add(m.Id)) modDup = true;
            Check(!modDup, "铁律与词条不重复");

            var st = a1.Structure;
            Check(st.ExtraWaves == Math.Max(0, a1.Rule.ExtraWaves) && st.ShopClosed == a1.Rule.ShopClosed
                  && st.AltarOff == a1.Rule.AltarOff && st.EliteShift == a1.Rule.EliteShift,
                "结构字段由铁律翻译而来");
            var leyline = a1.Rule.Id == "leyline" ? a1.Rule : Array.Find(Challenges.WeeklyRules, r => r.Id == "leyline");
            Check(leyline.ForcedLayouts.Length > 0 && Array.IndexOf(leyline.ForcedLayouts, "narrow") >= 0 && Array.IndexOf(leyline.ForcedLayouts, "shore") >= 0,
                "地脉铁律自带地形候选(窄道/环形/浅滩)");

            // 一周之内每天都算同一周;跨周必换键
            var mon = new DateTime(2026, 9, 28);
            bool sameWeek = true, nextWeekDiff = true;
            for (int i = 0; i < 7; i++) if (Challenges.WeekKey(mon.AddDays(i)) != Challenges.WeekKey(mon)) sameWeek = false;
            if (Challenges.WeekKey(mon.AddDays(7)) == Challenges.WeekKey(mon)) nextWeekDiff = false;
            Check(sameWeek, "同一周七天共用一个周键");
            Check(nextWeekDiff, "跨周换键");
            Check(Challenges.WeekKey(new DateTime(2025, 12, 29)) == "2026-W01", $"跨年周归属(2025-12-29 → {Challenges.WeekKey(new DateTime(2025, 12, 29))})");
            Check(Challenges.WeekKey(new DateTime(2026, 1, 1)) == "2026-W01", "2026-01-01(周四)属于 2026-W01");

            // 52 周里每条铁律都要露面(分布不能坏)
            var seen = new Dictionary<string, int>();
            for (int w = 1; w <= 52; w++)
            {
                var id = Challenges.WeeklyPick($"2026-W{w:D2}").Rule.Id;
                seen[id] = seen.TryGetValue(id, out var n) ? n + 1 : 1;
            }
            int never = 0, lopsided = 0;
            foreach (var r in Challenges.WeeklyRules)
            {
                if (!seen.ContainsKey(r.Id)) never++;
                else if (seen[r.Id] > 20) lopsided++;
            }
            Check(never == 0, $"一年 52 周里每条铁律都抽到过(一次没抽到的:{never} 条)");
            Check(lopsided == 0, $"没有某条铁律霸屏(>20 次的:{lopsided} 条)");

            // 乘区合并:乘区相乘、加区相加,空集 = 中性
            var neutral = Challenges.Merge(new Challenges.DailyMod[0]);
            Check(Math.Abs(neutral.Hp - 1f) < 1e-6f && Math.Abs(neutral.Cdr) < 1e-6f && Math.Abs(neutral.Potion) < 1e-6f,
                "空词条 = 中性(普通局与挑战局共用一条代码路径)");
            var horde = Array.Find(Challenges.DailyPool, m => m.Id == "horde");
            var fieldmedic = Array.Find(Challenges.DailyPool, m => m.Id == "fieldmedic");
            var merged = Challenges.Merge(new[] { horde, fieldmedic });
            Near(merged.Hp, 0.75f * 1.2f, 1e-4f, "生命乘区相乘(兽潮 × 战地医师)");
            Near(merged.Atk, 1.3f, 1e-4f, "攻击乘区只受兽潮影响");
            Near(merged.Potion, 2f, 1e-4f, "药剂增减走加法");
            Check(Math.Abs(merged.Drop - 1f) < 1e-4f, "没人动掉落就是中性");

            // 每日键:0 补位
            Check(Challenges.DailyKey(new DateTime(2026, 9, 5)) == "2026-09-05", "每日键补零到两位数");
            Check(Challenges.KeySeed("2026-W40") != Challenges.KeySeed("2026-W41"), "相邻周 seed 不相关(雪崩没省)");
        }

        // ---------------- 地形机制(浅滩 + 可打穿的障碍) ----------------
        private static void TestTerrainRules()
        {
            Suite("地形机制(浅滩减速导电 / 障碍可打穿)");

            const float W = 28f, H = 16f;

            // 只有浅滩房有水;水带横穿房间中下段(与 web floorOf('shore') 一致)
            var shore = TerrainRules.TerrainState.ForLayout("shore", H);
            Check(shore.HasWater, "浅滩房有水");
            Check(!TerrainRules.TerrainState.ForLayout("pillars", H).HasWater
                  && !TerrainRules.TerrainState.ForLayout("narrow", H).HasWater, "其它房间没有水");
            Check(shore.IsWater(W / 2f, H * 0.62f), "水带中心在水里");
            Check(!shore.IsWater(2.5f, H / 2f), "入口落点(2.5m)不在水里");
            Check(!shore.IsWater(W / 2f, 1.2f), "贴近上边界是旱地");

            // 移动乘区:水里变慢、旱地不变;平衡区间(有感觉但走得动)
            Near(shore.MoveMult(W / 2f, H * 0.62f), TerrainRules.WaterMoveMult, 1e-4f, "水里移动乘区");
            Near(shore.MoveMult(W / 2f, 1.2f), 1f, 1e-4f, "旱地移动乘区不变");
            Check(TerrainRules.WaterMoveMult > 0.5f && TerrainRules.WaterMoveMult < 1f, "减速幅度在有感但走得动的区间");

            // 导电:只有雷吃加成;麻痹只在水里
            Near(shore.ElemAmp(true, W / 2f, H * 0.62f), TerrainRules.WaterBoltAmp, 1e-4f, "水中雷伤乘区");
            Near(shore.ElemAmp(true, W / 2f, 1.2f), 1f, 1e-4f, "旱地雷伤不加成");
            Near(shore.ElemAmp(false, W / 2f, H * 0.62f), 1f, 1e-4f, "火/冰/毒与水无关");
            Near(shore.StunOnBolt(true, W / 2f, H * 0.62f), TerrainRules.WaterStunS, 1e-4f, "水中雷击附带麻痹");
            Near(shore.StunOnBolt(true, W / 2f, 1.2f), 0f, 1e-4f, "旱地雷击不麻痹");
            Check(TerrainRules.WaterBoltAmp > 1f && TerrainRules.WaterBoltAmp <= 1.5f, "雷伤加成在合理区间(不至于变成必须浅滩开局)");
            Check(TerrainRules.WaterStunS > 0f && TerrainRules.WaterStunS < BestiaryReactions.ReactionsNumbStunS, "浅滩麻痹短于反应链麻痹");

            // 减速对位移的实际影响(与 web PhysicsSystem 同一口径:d = v × mult × dt)
            float v = 240f, dt = 0.1f;
            float onLand = v * dt;
            float inWater = v * shore.MoveMult(W / 2f, H * 0.62f) * dt;
            Check(inWater < onLand && inWater > onLand * 0.5f, $"水里位移被砍但不至于走不动({inWater:0.#} vs {onLand:0.#} 像素)");

            // 障碍耐久:树 80 / 岩 120;灌木打不烂
            Near(TerrainRules.PropHp("tree"), 80f, 1e-4f, "树耐久 80");
            Near(TerrainRules.PropHp("rock"), 120f, 1e-4f, "岩耐久 120");
            Check(TerrainRules.PropHp("rock") > TerrainRules.PropHp("tree"), "岩比树结实(窄道墙更贵)");
            Check(TerrainRules.PropHp("bush") == 0f && TerrainRules.PropHp("nope") == 0f, "灌木/未知种类没有耐久");

            // 破坏流程:扣血 → 归零才碎;碎了再打无效
            var rock = TerrainRules.Breakable.Make("rock");
            Check(TerrainRules.Blocks(rock), "整块岩石挡路");
            Check(!TerrainRules.DamageProp(ref rock, 50f), "50 点没打破");
            Near(rock.Hp, 70f, 1e-4f, "剩余耐久 70");
            Check(TerrainRules.DamageProp(ref rock, 70f), "补给 70 → 刚好碎裂");
            Check(rock.Broken && !TerrainRules.Blocks(rock), "碎裂后不再挡路");
            Check(!TerrainRules.DamageProp(ref rock, 999f), "碎了之后再打无效");

            var bush = TerrainRules.Breakable.Make("bush");
            Check(!TerrainRules.DamageProp(ref bush, 999f) && !bush.Broken, "灌木打不烂");

            // 手感数字:基准攻击 12 → 砍树 7 刀、拆岩 10 刀;大招级 60 → 2 刀开洞
            // 期望刀数 = **金标**:玩家攻击力/障碍耐久一变就要显式来改这里(那是数据决策,不该悄悄漂)
            // 注:atk 从手抄的 12 修正为 balance 的 14 之后,树 7→6 刀、岩 10→9 刀
            Check(TerrainRules.HitsToBreak("tree", BestiaryPlayer.PlayerAtk) == 6, $"砍树 6 刀(实际 {TerrainRules.HitsToBreak("tree", BestiaryPlayer.PlayerAtk)})");
            Check(TerrainRules.HitsToBreak("rock", BestiaryPlayer.PlayerAtk) == 9, $"拆岩 9 刀(实际 {TerrainRules.HitsToBreak("rock", BestiaryPlayer.PlayerAtk)})");
            Check(TerrainRules.HitsToBreak("rock", 60f) == 2, "技能级伤害两下开洞(拆墙是可选项而不是苦工)");
            Check(TerrainRules.HitsToBreak("bush", BestiaryPlayer.PlayerAtk) == 0 && TerrainRules.HitsToBreak("tree", 0f) == 0, "打不烂 / 0 伤害 → 0 刀");
            Check(TerrainRules.WallOpenSwings(BestiaryPlayer.PlayerAtk) == 9, "窄道墙上开个口子 = 9 刀");
        }

        // ---------------- 像素数字字体 ----------------
        private static void TestPixelFont()
        {
            Suite("像素数字字体(5×7 字模 / 度量 / 对齐)");

            Check(PixelFont.GlyphW == 5 && PixelFont.GlyphH == 7 && PixelFont.Spacing == 1, "字模规格 5×7,字距 1");
            Check(PixelFont.Glyphs.Count == 24, $"收录 24 个字符(实际 {PixelFont.Glyphs.Count})");
            Check(PixelFont.Order.Length == PixelFont.Glyphs.Count, "顺序表长度与字模表一致");

            int missing = 0;
            foreach (var c in "0123456789") if (!PixelFont.Has(c)) missing++;
            foreach (var c in ".:/-+x,% PFSKH") if (!PixelFont.Has(c)) missing++;
            Check(missing == 0, $"数字与常用符号全部收录(缺 {missing} 个)");
            Check(!PixelFont.Has('生') && !PixelFont.Has('$') && !PixelFont.Has('p'), "中文/未收录字符/小写不冒充字模");

            // 字模尺寸与字符集:每行必须正好 5 列,只含 '#' 与 '.'
            int shapeBad = 0;
            foreach (var kv in PixelFont.Glyphs)
            {
                if (kv.Value.Length != PixelFont.GlyphH) shapeBad++;
                foreach (var row in kv.Value)
                {
                    if (row.Length != PixelFont.GlyphW) shapeBad++;
                    foreach (var c in row) if (c != '#' && c != '.') shapeBad++;
                }
            }
            Check(shapeBad == 0, "每个字模都是 7 行 × 5 列且只有 '#' / '.'");

            // 笔画量:既不是空字也不是全实心;空格确实是空的
            int degenerate = 0;
            foreach (var kv in PixelFont.Glyphs)
            {
                int lit = PixelFont.LitPixels(kv.Key);
                if (kv.Key == " ") { if (lit != 0) degenerate++; continue; }
                if (lit < 4 || lit > PixelFont.GlyphW * PixelFont.GlyphH * 0.8) degenerate++;
            }
            Check(degenerate == 0, $"没有空字/糊字({degenerate} 个异常)");

            // 十个数字彼此可区分(不然 '1' 和 '7' 在飘字里会看错)
            var seen = new HashSet<string>();
            bool dup = false;
            foreach (var d in "0123456789")
            {
                if (!seen.Add(string.Join("|", PixelFont.Glyphs[d.ToString()]))) dup = true;
            }
            Check(!dup, "十个数字字模互不相同");

            // 度量:宽度 = n×5×scale + (n-1)×1×scale
            Check(PixelFont.Width("") == 0, "空串宽 0");
            Check(PixelFont.Width("1") == 5, "单字宽 5");
            Check(PixelFont.Width("12") == 11, $"两字宽 11(实际 {PixelFont.Width("12")})");
            Check(PixelFont.Width("123", 2) == 34, "3 字 ×2 倍 = 34");
            Check(PixelFont.Width("12:34") == 5 * 5 + 4, "含符号整串宽度按字距累加");

            // 对齐:左 = 原样,中 = 减半宽,右 = 减全宽
            Check(PixelFont.AlignX(100, "1234", 1, "left") == 100, "左对齐 = 原点");
            Check(PixelFont.AlignX(100, "1234", 1, "center") == 100 - PixelFont.Width("1234") / 2, "居中 = 原点 − 半宽");
            Check(PixelFont.AlignX(100, "1234", 1, "right") == 100 - PixelFont.Width("1234"), "右对齐 = 原点 − 全宽");

            // 点亮像素查询:'0' 的中列在上下两端是空的(中间是斜杠),这能抓住"抄错一行"
            Check(PixelFont.Pixel('0', 0, 0) == false && PixelFont.Pixel('0', 0, 1) == true, "'0' 第一行是 .###.");
            Check(PixelFont.Pixel('0', 3, 2) == true, "'0' 的斜杠经过中心");
            Check(PixelFont.Pixel('0', 99, 99) == false && PixelFont.Pixel('生', 0, 0) == false, "越界/未收录返回 false");
            Check(PixelFont.LitPixels("0123456789") > 100, "十个数字合计点亮像素 > 100(字模不是空壳)");

            // HUD 实际会画的东西:P 阶段名 / 血量 / 计时 / 掉落倍率都必须整串可位图化
            foreach (var s in new[] { "P1", "P3", "FPS 60", "HP 128/200", "12:34", "999", "+1.25x", "x2", "45%" })
            {
                if (!PixelFont.Supports(s)) Check(false, $"HUD 字符串无法位图化:{s}");
            }
            Check(PixelFont.Supports("P1") && PixelFont.Supports("128/200") && PixelFont.Supports("12:34")
                  && PixelFont.Supports("FPS 60"), "HUD 字符串(阶段/血量/计时/FPS)整串可位图化");
            Check(!PixelFont.Supports("生命 12"), "含中文的整串会回退平台字体(不混排)");
            Check(PixelFont.Supports("") , "空串视为可位图化");
        }

        // ---------------- 本地排行榜 ----------------
        private static void TestLeaderboard()
        {
            Suite("本地排行榜(四条榜 / 门槛 / 截断 / 清洗)");

            var LB = typeof(Leaderboard);
            var Board = typeof(Leaderboard.Board);
            object B(string name) => Enum.Parse(Board, name);

            Check(Leaderboard.Boards.Length == 4, $"四条榜(实际 {Leaderboard.Boards.Length})");
            Check(Leaderboard.TopN >= 3 && Leaderboard.MinKills > 0, "容量与门槛来自配置(非 0 非负)");

            var mk = (double score, double at) => new Leaderboard.Entry(score, "blade", 1, at, "");

            // 排序方向
            var kills = Leaderboard.Sort(Leaderboard.Board.Kills, new[] { mk(10, 1), mk(99, 2), mk(50, 3) });
            Check(kills[0].Score == 99 && kills[2].Score == 10, "击杀榜降序(越大越前)");
            var speed = Leaderboard.Sort(Leaderboard.Board.Speed, new[] { mk(300, 1), mk(120, 2), mk(200, 3) });
            Check(speed[0].Score == 120 && speed[2].Score == 300, "速度榜升序(越小越前)");
            var tie = Leaderboard.Sort(Leaderboard.Board.Speed, new[] { mk(120, 1), mk(120, 9) });
            Check(tie[0].At == 9 && tie[1].At == 1, "同分时最近一次在前");

            // 进榜门槛
            var run = new Leaderboard.RunScore
            {
                Cleared = true, NoHit = false, TimeS = 300, Kills = 40, MaxHit = 55,
                Klass = "blade", Chapter = 1, At = 1000,
            };
            var got = Leaderboard.RunScores(run);
            Check(got.Count == 3 && !got.ContainsKey(Leaderboard.Board.NoHit), "通关但非无伤:速度/击杀/伤害三条,不进无伤榜");
            var hitless = run; hitless.NoHit = true;
            Check(Leaderboard.RunScores(hitless).Count == 4, "无伤通关:四条榜全进");

            var lost = run; lost.Cleared = false; lost.TimeS = 0; lost.Kills = Leaderboard.MinKills - 1; lost.MaxHit = 0;
            Check(Leaderboard.RunScores(lost).Count == 0, "没通关且成绩低于门槛:一条都不进");

            var lowKill = run; lowKill.Kills = Leaderboard.MinKills - 1;
            Check(!Leaderboard.RunScores(lowKill).ContainsKey(Leaderboard.Board.Kills), "击杀低于门槛不进榜");

            // 提交与截断:插 9 条后仍是最强 5 条
            var lb = new Leaderboard.Boards4();
            for (int i = 1; i <= 9; i++)
            {
                var r = run; r.Kills = i * 10; r.At = i;
                Leaderboard.Submit(lb, r);
            }
            Check(lb.Kills.Count == Leaderboard.TopN, $"榜长截断到前 {Leaderboard.TopN}(实际 {lb.Kills.Count})");
            Check(string.Join(",", lb.Kills.ConvertAll(e => e.Score.ToString())) == "90,80,70,60,50", "留下的是最强 5 条");
            var worse = run; worse.Kills = 5; worse.At = 99;
            Leaderboard.Submit(lb, worse);
            Check(lb.Kills[0].Score == 90 && lb.Kills.Count == Leaderboard.TopN, "更差的成绩进不来(榜不变)");
            var better = run; better.Kills = 100; better.At = 100;
            Leaderboard.Submit(lb, better);
            Check(lb.Kills[0].Score == 100 && lb.Kills[lb.Kills.Count - 1].Score == 60, "破纪录会挤掉最后一名");

            // 开榜进度
            var fresh = new Leaderboard.Boards4();
            Check(fresh.Filled() == 0, "新档:0 条榜有记录");
            Leaderboard.Submit(fresh, hitless);
            Check(fresh.Filled() == 4, "四条榜都能被同一次出征点亮");

            // 名次
            Check(Leaderboard.RankOf(Leaderboard.Board.Kills, fresh.Kills, fresh.Kills[0]) == 1, "榜首 rankOf = 1");
            Check(Leaderboard.RankOf(Leaderboard.Board.Kills, fresh.Kills, mk(1, 0)) == 0, "不在榜上 rankOf = 0");

            // 清洗:脏数据丢掉、重排、截断
            var dirty = new Leaderboard.Boards4();
            dirty.Kills.Add(new Leaderboard.Entry(10, "druid", 1, 1, ""));      // 未知职业
            dirty.Kills.Add(new Leaderboard.Entry(10, "blade", 9, 2, ""));      // 未知章节
            dirty.Kills.Add(new Leaderboard.Entry(-3, "blade", 1, 3, ""));      // 负数
            dirty.Kills.Add(new Leaderboard.Entry(double.NaN, "blade", 1, 4, "")); // NaN
            dirty.Kills.Add(new Leaderboard.Entry(42, "blade", 2, 5, "daily:2026-09-29"));
            for (int i = 0; i < 20; i++) dirty.Speed.Add(mk(600 + i, i));
            Leaderboard.Sanitize(dirty);
            Check(dirty.Kills.Count == 1 && dirty.Kills[0].Score == 42, $"脏条目全部清掉,只留合法记录(实际 {dirty.Kills.Count} 条)");
            Check(dirty.Speed.Count == Leaderboard.TopN && dirty.Speed[0].Score == 600, "超长榜截断且顺序正确");
            Check(dirty.Hit.Count == 0 && dirty.NoHit.Count == 0, "空榜保持空");

            // 展示格式
            Check(Leaderboard.FormatScore(Leaderboard.Board.Speed, 200) == "3:20", $"时间格式 mm:ss(实际 {Leaderboard.FormatScore(Leaderboard.Board.Speed, 200)})");
            Check(Leaderboard.FormatScore(Leaderboard.Board.Speed, 59) == "0:59", "不足一分钟也补零");
            Check(Leaderboard.FormatScore(Leaderboard.Board.Kills, 1234) == "1,234", $"分数千分位(实际 {Leaderboard.FormatScore(Leaderboard.Board.Kills, 1234)})");
            Check(Leaderboard.TagLabel("") == "" && Leaderboard.TagLabel("garbage") == "", "普通局/脏标记不显示徽标");
            Check(Leaderboard.TagLabel("daily:2026-09-29").Contains("2026-09-29") && Leaderboard.TagLabel("weekly:2026-W40").Contains("2026-W40"),
                "每日/周常徽标能认出键");
        }

        // ---------------- 四职业普攻档案(镜像 web combat/BasicAttack.ts)----------------
        private static void TestBasicAttack()
        {
            Suite("四职业普攻(形态 / 终结段 / 穿透 / 溅射 / 破甲 / 减速)");

            // 形态
            Check(BasicAttack.KindOf(HeroClass.Blade) == BasicAttack.Kind.Combo, "剑士走组合技");
            Check(BasicAttack.KindOf(HeroClass.Ranger) == BasicAttack.Kind.Shot, "猎手走射击");

            // 剑士:三段循环 + 只有终结段带击退/前冲,不破甲
            var blade = BasicAttack.ComboOf(HeroClass.Blade);
            Check(blade.Mults.Length == 3, $"剑士 3 段(实际 {blade.Mults.Length})");
            Check(BasicAttack.ComboStage(0, 0f, 3) == 1 && BasicAttack.ComboStage(1, 0.5f, 3) == 2
                  && BasicAttack.ComboStage(3, 0.5f, 3) == 1 && BasicAttack.ComboStage(2, 0f, 3) == 1,
                "连招推进:窗口内递增、超时回 1、到顶循环");
            var s1 = BasicAttack.ResolveCombo(blade, 0, 0f);
            var s3 = BasicAttack.ResolveCombo(blade, 2, 0.5f);
            Check(s1.KnockbackM == 0f && s1.LungeM == 0f, "常规段不带击退与前冲");
            Check(s3.KnockbackM > 0f && s3.LungeM > 0f && s3.VulnS == 0f, "终结段:击退 + 前冲,但不破甲");
            float imp = BasicAttack.LungeImpulse(s3);
            Near(imp * 0.12f, s3.LungeM * BasicAttack.PxPerM, 0.5f, "前冲是可量化的速度脉冲(距离 = v·t)");

            // 守卫:更重、会破甲、位移更小、出招更黏
            var warden = BasicAttack.ComboOf(HeroClass.Warden);
            var w3 = BasicAttack.ResolveCombo(warden, 2, 0.5f);
            Check(w3.VulnS > 0f, $"守卫终结段破甲(实际 {w3.VulnS}s)");
            Check(w3.Mult > s3.Mult, "守卫终结段倍率高于剑士");
            Check(w3.LungeM < s3.LungeM, "守卫位移小于剑士(重甲)");
            Check(BasicAttack.MoveSlowOf(HeroClass.Warden) < BasicAttack.MoveSlowOf(HeroClass.Blade), "守卫出招更黏");

            // 猎手:走射 + 每第 4 发强化并穿透;溅射为 0
            var ranger = BasicAttack.ShotOf(HeroClass.Ranger);
            var shots = new List<BasicAttack.ShotStep>();
            for (int i = 0; i < 4; i++) shots.Add(BasicAttack.ResolveShot(ranger, i));
            Check(shots[3].Heavy && !shots[0].Heavy && !shots[1].Heavy && !shots[2].Heavy, "每第 4 发强化");
            Check(shots[0].Pierce == 0 && shots[3].Pierce > 0, "只有强化发穿透");
            Check(shots[3].Mult > shots[0].Mult, "强化发伤害更高");
            Check(BasicAttack.MoveSlowOf(HeroClass.Ranger) >= 1f, "猎手可走射");
            Check(ranger.SplashM == 0f, "猎手不溅射(溅射是秘术师的特权)");

            // 秘术师:每一发都溅射 + 施法减速 + 弹速慢于猎手
            var arcanist = BasicAttack.ShotOf(HeroClass.Arcanist);
            Check(arcanist.SplashM > 0f, $"秘术师溅射(实际 {arcanist.SplashM}m)");
            Check(BasicAttack.ResolveShot(arcanist, 0).SplashM == arcanist.SplashM, "普通发也溅射");
            Check(BasicAttack.MoveSlowOf(HeroClass.Arcanist) < 1f, "秘术师施法减速");
            Check(arcanist.SpeedM < ranger.SpeedM, "法球慢于箭矢");

            // 展示文案:四句互不相同,且提到各自特征
            var d0 = BasicAttack.Describe(HeroClass.Blade);
            var d1 = BasicAttack.Describe(HeroClass.Warden);
            var d2 = BasicAttack.Describe(HeroClass.Ranger);
            var d3 = BasicAttack.Describe(HeroClass.Arcanist);
            Check(d0.Contains("3 段") && d1.Contains("破甲") && d2.Contains("穿透") && d3.Contains("溅射"),
                $"四职业描述各含特征(剑士[{d0}] 守卫[{d1}] 猎手[{d2}] 秘术师[{d3}])");
            Check(new HashSet<string> { d0, d1, d2, d3 }.Count == 4, "四句描述互不相同");
        }

        public static int Main()
        {
            Console.WriteLine("星陨骑士 · C# 逻辑层测试");

            TestRng();
            TestElements();
            TestFormulas();
            TestDamagePipeline();
            TestZones();
            TestProjectiles();
            TestSkills();
            TestRunePool();
            TestLoot();
            TestClock();
            TestMetaSave();
            TestRunSequence();
            TestCodex();
            TestChapters();
            TestAbyss();
            TestEndless();
            TestTelegraphs();
            TestWeakspots();
            TestCreatureAI();
            TestMidBoss();
            TestTutorialAndSlots();
            TestAimAssist();
            TestAnim();
            TestBossAI();
            TestClassSkillSet();
            TestRoomLayouts();
            TestChallenges();
            TestTerrainRules();
            TestPixelFont();
            TestLeaderboard();
            TestBasicAttack();
            TestShotAttack();
            TestPlayerAnim();
            ParityTests.Run(Check, Near, Suite);

            Console.WriteLine("\n" + new string('-', 44));
            if (Failures.Count == 0)
            {
                Console.WriteLine($"✅ 全部通过:{_pass} 项断言");
                return 0;
            }
            Console.WriteLine($"❌ {Failures.Count} 项失败 / 共 {_pass + Failures.Count} 项断言");
            foreach (var f in Failures) Console.WriteLine("   - " + f);
            return 1;
        }

        // ---------------- 随机数 ----------------

        private static void TestRng()
        {
            Suite("Rng(mulberry32 确定性)");
            var a = new Rng(12345);
            var b = new Rng(12345);
            var c = new Rng(999);
            var seqA = new List<double>();
            var seqB = new List<double>();
            for (int i = 0; i < 8; i++) { seqA.Add(a.Next()); seqB.Add(b.Next()); }
            bool same = seqA.Count == seqB.Count;
            for (int i = 0; i < seqA.Count && same; i++) if (Math.Abs(seqA[i] - seqB[i]) > 1e-12) same = false;
            Check(same, "同种子 → 完全相同的序列(双端可复现掉落)");
            Check(Math.Abs(seqA[0] - c.Next()) > 1e-12, "不同种子 → 不同序列");

            var r = new Rng(7);
            bool inRange = true;
            for (int i = 0; i < 2000; i++) { double v = r.Next(); if (v < 0.0 || v >= 1.0) inRange = false; }
            Check(inRange, "Next() ∈ [0,1)");

            var ri = new Rng(3);
            bool rangeOk = true;
            for (int i = 0; i < 2000; i++) { int v = ri.Int(2, 5); if (v < 2 || v > 5) rangeOk = false; }
            Check(rangeOk, "Int(min,max) 闭区间内");

            var rf = new Rng(11);
            bool floatOk = true;
            for (int i = 0; i < 2000; i++) { double v = rf.Range(-1.5, 2.5); if (v < -1.5 || v >= 2.5) floatOk = false; }
            Check(floatOk, "Range(min,max) 半开区间内");
        }

        // ---------------- 元素与反应 ----------------

        private static void TestElements()
        {
            Suite("元素连锁表");
            Check(Elements.ReactionOf(Element.Fire, Element.Ice) == Reaction.Steam, "火+冰 → 蒸爆");
            Check(Elements.ReactionOf(Element.Fire, Element.Bolt) == Reaction.Overload, "火+雷 → 超载");
            Check(Elements.ReactionOf(Element.Fire, Element.Toxin) == Reaction.Miasma, "火+毒 → 燃瘴");
            Check(Elements.ReactionOf(Element.Bolt, Element.Ice) == Reaction.Chain, "雷+冰 → 冻链");
            Check(Elements.ReactionOf(Element.Ice, Element.Toxin) == Reaction.Brittle, "冰+毒 → 脆蚀");
            Check(Elements.ReactionOf(Element.Bolt, Element.Toxin) == Reaction.Numb, "雷+毒 → 麻痹");
            Check(Elements.ReactionOf(Element.Fire, Element.Fire) == Reaction.None, "同元素不反应");

            // 顺序无关(6 组 × 2 方向)
            var pairs = new (Element a, Element b, Reaction r)[]
            {
                (Element.Fire, Element.Ice, Reaction.Steam),
                (Element.Fire, Element.Bolt, Reaction.Overload),
                (Element.Fire, Element.Toxin, Reaction.Miasma),
                (Element.Bolt, Element.Ice, Reaction.Chain),
                (Element.Ice, Element.Toxin, Reaction.Brittle),
                (Element.Bolt, Element.Toxin, Reaction.Numb),
            };
            bool sym = true;
            foreach (var p in pairs)
                if (Elements.ReactionOf(p.b, p.a) != p.r) sym = false;
            Check(sym, "反应表对称(6 组双向一致)");
        }

        // ---------------- 公式 ----------------

        private static void TestFormulas()
        {
            Suite("伤害公式");
            Near(Formulas.DefenseReduction(0f), 0f, 1e-4f, "def=0 无减伤");
            Near(Formulas.DefenseReduction(50f), 0.5f, 1e-3f, "def=50 → 减伤 50%");
            Check(Formulas.DefenseReduction(100f) < 0.8f && Formulas.DefenseReduction(100f) > 0.6f,
                "减伤曲线不溢出(def/(def+50))");

            int baseHit = Formulas.FinalDamage(20f, 1f, false, 1.5f, 0f, 0f);
            Check(baseHit == 20, "无暴击无减伤 = 攻击×倍率");
            int critHit = Formulas.FinalDamage(20f, 1f, true, 1.5f, 0f, 0f);
            Check(critHit == 30, "暴击 ×1.5");
            int reduced = Formulas.FinalDamage(20f, 1f, false, 1.5f, 0.5f, 0f);
            Check(reduced == 10, "50% 减伤后减半");
            int vuln = Formulas.FinalDamage(20f, 1f, false, 1.5f, 0f, 0.2f);
            Check(vuln == 24, "脆蚀易伤 +20%");
        }

        // ---------------- 伤害管线 ----------------

        private static void TestDamagePipeline()
        {
            Suite("伤害管线(印记 → 反应 → 结算)");
            var w = new LogicWorld();
            var p = MakePlayer(w);
            var e = MakeEnemy(w);

            DamagePipeline.Deal(new DealOpts { Source = p.Unit, Target = e.Unit, Mult = 1f, Element = Element.Fire, CanCrit = false });
            Check(e.Unit.Marks.ContainsKey(Element.Fire), "命中后挂上火印记");
            Near(e.Unit.Marks[Element.Fire], BestiaryReactions.ReactionsMarkDurS, 1e-3f, "印记持续 4s");

            ReactionResult? got = null;
            DamagePipeline.OnReaction = r => got = r;
            DamagePipeline.Deal(new DealOpts { Source = p.Unit, Target = e.Unit, Mult = 1f, Element = Element.Ice, CanCrit = false });
            Check(got.HasValue && got.Value.Kind == Reaction.Steam, "火→冰 触发蒸爆并回调(交给宿主做范围扩散)");
            Check(!e.Unit.Marks.ContainsKey(Element.Fire) && e.Unit.Marks.ContainsKey(Element.Ice), "反应消耗旧印记、只留新印记");
            DamagePipeline.OnReaction = null;

            // 连锁衰减:同一发伤害随链深递减
            var w2 = new LogicWorld();
            var p2 = MakePlayer(w2, new Vector2(0, 0), 40f);
            var d0 = MakeEnemy(w2, new Vector2(1, 0));
            var d2 = MakeEnemy(w2, new Vector2(1, 0));
            int hit0 = DamagePipeline.Deal(new DealOpts { Source = p2.Unit, Target = d0.Unit, Mult = 1f, CanCrit = false });
            int hit2 = DamagePipeline.Deal(new DealOpts { Source = p2.Unit, Target = d2.Unit, Mult = 1f, CanCrit = false, ChainDepth = 2 });
            Check(hit2 < hit0, $"连锁衰减生效(depth0={hit0} > depth2={hit2})");
            Near(hit2 / (float)hit0, BestiaryReactions.ReactionsChainDecay * BestiaryReactions.ReactionsChainDecay, 0.02f, "衰减 = 0.8^depth");

            // 反应附加效果
            var w3 = new LogicWorld();
            var p3 = MakePlayer(w3);
            var st = MakeEnemy(w3, Vector2.Zero);
            DamagePipeline.Deal(new DealOpts { Source = p3.Unit, Target = st.Unit, Mult = 1f, Element = Element.Bolt, CanCrit = false });
            DamagePipeline.Deal(new DealOpts { Source = p3.Unit, Target = st.Unit, Mult = 1f, Element = Element.Toxin, CanCrit = false });
            Check(st.Unit.StunT > 0f, "雷+毒 麻痹 → 眩晕计时器被点亮");
            var vt = MakeEnemy(w3, new Vector2(3, 0));
            DamagePipeline.Deal(new DealOpts { Source = p3.Unit, Target = vt.Unit, Mult = 1f, Element = Element.Ice, CanCrit = false });
            DamagePipeline.Deal(new DealOpts { Source = p3.Unit, Target = vt.Unit, Mult = 1f, Element = Element.Toxin, CanCrit = false });
            Check(vt.Unit.VulnT > 0f && vt.Unit.VulnPct > 0f, "冰+毒 脆蚀 → 易伤生效");
        }

        // ---------------- 区域 ----------------

        private static void TestZones()
        {
            Suite("元素地带(Zone 持续结算)");
            var w = new LogicWorld();
            var p = MakePlayer(w);
            var e = MakeEnemy(w, new Vector2(1f, 0f), 1000f);
            w.Zones.Add(new Zone
            {
                Pos = Vector2.Zero, RadiusM = 2f, LifeS = 1.0f, TickS = 0.25f,
                Atk = 20f, Mult = 0.5f, Element = Element.Fire, PlayerTeam = true,
            });
            Advance(w, 0.9f);
            Check(e.Unit.Hp < 1000f, "站在地带里持续掉血");
            Check(e.Unit.Marks.ContainsKey(Element.Fire), "地带 tick 也挂元素印记");
            var before = e.Unit.Hp;
            Advance(w, 1.0f);
            Near(e.Unit.Hp, before, 0.001f, "地带寿命结束后停止结算");

            var w2 = new LogicWorld();
            MakePlayer(w2, Vector2.Zero);
            var far = MakeEnemy(w2, new Vector2(9f, 0f), 1000f);
            w2.Zones.Add(new Zone { Pos = Vector2.Zero, RadiusM = 2f, LifeS = 5f, TickS = 0.2f, Atk = 20f, Mult = 1f, PlayerTeam = true });
            Advance(w2, 1f);
            Near(far.Unit.Hp, 1000f, 0.001f, "范围外的敌人不受影响");
        }

        // ---------------- 弹幕 ----------------

        private static void TestProjectiles()
        {
            Suite("弹幕(直线 / 追踪 / 落地范围)");
            var w = new LogicWorld();
            var p = MakePlayer(w);
            var e = MakeEnemy(w, new Vector2(4f, 0f), 500f);
            w.Projectiles.Add(new Projectile
            {
                Pos = p.Pos, Vel = new Vector2(10f, 0f), RadiusM = 0.2f, LifeS = 1f,
                Mult = 1f, Owner = p.Unit, PlayerTeam = true,
            });
            Advance(w, 0.6f);
            Check(e.Unit.Hp < 500f, "直线弹飞行后命中敌人");
            Check(w.Projectiles.Count == 0, "命中后弹幕销毁");

            var w2 = new LogicWorld();
            MakePlayer(w2);
            var off = MakeEnemy(w2, new Vector2(3f, 1.2f), 500f); // 偏离直线,需要追踪
            w2.Projectiles.Add(new Projectile
            {
                Pos = new Vector2(0f, 0f), Vel = new Vector2(7f, 0f), RadiusM = 0.2f, LifeS = 2f,
                Mult = 1f, Owner = w2.Player.Unit, PlayerTeam = true, HomingRadM = 3.5f,
            });
            Advance(w2, 1.2f);
            Check(off.Unit.Hp < 500f, "追踪弹自动转向命中偏离目标");

            var w3 = new LogicWorld();
            var p3 = MakePlayer(w3);
            var a = MakeEnemy(w3, new Vector2(3f, 0f), 500f);
            var b = MakeEnemy(w3, new Vector2(3.4f, 0.2f), 500f);
            w3.Projectiles.Add(new Projectile
            {
                Pos = Vector2.Zero, Vel = new Vector2(12f, 0f), RadiusM = 0.2f, LifeS = 1f,
                Mult = 1f, Owner = p3.Unit, PlayerTeam = true, AoeOnHit = true, AoeM = 1.0f,
            });
            Advance(w3, 0.4f);
            Check(a.Unit.Hp < 500f && b.Unit.Hp < 500f, "落地范围弹同时命中邻近两只");

            var w4 = new LogicWorld();
            MakePlayer(w4);
            w4.Projectiles.Add(new Projectile
            {
                Pos = Vector2.Zero, Vel = new Vector2(10f, 0f), LifeS = 0.05f, Owner = null, PlayerTeam = true,
            });
            Advance(w4, 0.2f);
            Check(w4.Projectiles.Count == 0, "寿命到期自动回收(不会无限累积)");
        }

        // ---------------- 四职业技能 ----------------

        private static void TestSkills()
        {
            Suite("四职业技能(冷却/怒气/命中/控制)");

            // 剑士 Q:三连扇形
            {
                var w = new LogicWorld();
                var p = MakePlayer(w);
                var e = MakeEnemy(w, new Vector2(1.5f, 0f));
                var s = new BladeSkills();
                Check(s.CastQ(w), "剑士 Q 可施放");
                Check(!s.CastQ(w), "剑士 Q 冷却中拒绝再次施放");
                Advance(w, 0.5f, s);
                Check(e.Unit.Hp < 500f, "裂空斩命中正前方敌人");
                Near(s.CdQ, 4.0f - 0.5f, 0.05f, "冷却按 4s 递减");
                var behind = MakeEnemy(w, new Vector2(-1.5f, 0f));
                s.CdQ = 0;
                s.CastQ(w);
                Advance(w, 0.5f, s);
                Near(behind.Unit.Hp, 500f, 0.001f, "扇形判定不误伤背后");

                var sR = new BladeSkills { Rage = 39f };
                Check(!sR.CastR(w), "怒气不足(39<40)时大招被拒");
                sR.Rage = 100f;
                Check(sR.CastR(w), "怒气满可放 R");
                Near(sR.Rage, 0f, 1e-3f, "放完清空怒气");

                var sCdr = new BladeSkills { Cdr = 0.4f };
                sCdr.CastQ(w);
                Near(sCdr.CdQ, 4.0f * 0.6f, 1e-3f, "Q 冷却吃 CDR(4s → 2.4s @ 40%)");
                sCdr.Rage = 100f;
                sCdr.CastR(w);
                Near(sCdr.CdR, 1.5f, 1e-3f, "R 冷却不吃 CDR(镜像 web)");
            }

            // 剑士 E:突进参数 + 延迟爆炸
            {
                var w = new LogicWorld();
                var p = MakePlayer(w);
                var e = MakeEnemy(w, new Vector2(0.5f, 0f));
                var s = new BladeSkills();
                var dash = s.CastE(w);
                Check(dash.HasValue && MathF.Abs(dash.Value.distM - 3.5f) < 1e-3f, "潮涌步返回突进距离 3.5m");
                Near(e.Unit.Hp, 500f, 0.001f, "残影爆炸是延迟段(立刻无伤害)");
                Advance(w, 1.2f, s);
                Check(e.Unit.Hp < 500f, "1s 后残影爆炸结算");
            }

            // 游侠 Q/E/R
            {
                var w = new LogicWorld();
                var p = MakePlayer(w, Vector2.Zero, 40f);
                var s = new RangerSkills();
                Check(s.CastQ(w), "游侠 Q 可施放");
                Check(w.Projectiles.Count == 3, "瞬影三连放出 3 支箭");
                var e = MakeEnemy(w, new Vector2(3f, 0f));
                Advance(w, 0.5f, s);
                Check(e.Unit.Hp < 500f, "箭矢命中敌人");
                var dash = s.CastE(w);
                Check(dash.HasValue && dash.Value.iframesS > 0f, "疾风回旋返回无敌帧参数");
                Near(w.Zones.Count, 0f, 0.001f, "无符文时不留下地带");
                Advance(w, 0.3f, s);
                Check(w.Projectiles.Count >= 8, "落点放出 8 向环箭");
                var cluster = new List<Actor>();
                for (int i = 0; i < 8; i++)
                    cluster.Add(MakeEnemy(w, new Vector2(4f + (i % 4) * 0.5f - 0.75f, (i / 4) * 0.6f - 0.3f)));
                s.Rage = 100f;
                // 瞄向簇中心(不瞄时落点按朝向前方散开,断言会依赖随机散点)
                Check(s.CastR(w, null, new Vector2(4f, 0f)), "星陨箭雨可施放");
                Near(s.Rage, 0f, 1e-3f, "放完清空怒气");
                Advance(w, 2.5f, s);
                int rained = 0;
                foreach (var a in cluster) if (a.Unit.Hp < 500f) rained++;
                Check(rained >= 2, $"箭雨命中前方落点区域的敌人簇(实际命中 {rained}/8)");

                // 散点必须可复现:复刻**完整调用序列**(含前面几次施法与推进,RNG 消耗历史要一致),
                // 两遍的敌人掉血应逐项相同。若把 SkillRuntime.Rng 改回 `new Random()`(未播种),这条立刻变红。
                var w2 = new LogicWorld();
                var p2 = MakePlayer(w2, Vector2.Zero, 40f);
                var s2 = new RangerSkills();
                s2.CastQ(w2);
                var e2 = MakeEnemy(w2, new Vector2(3f, 0f));
                Advance(w2, 0.5f, s2);
                s2.CastE(w2);
                Advance(w2, 0.3f, s2);
                var cluster2 = new List<Actor>();
                for (int i = 0; i < 8; i++)
                    cluster2.Add(MakeEnemy(w2, new Vector2(4f + (i % 4) * 0.5f - 0.75f, (i / 4) * 0.6f - 0.3f)));
                s2.Rage = 100f;
                s2.CastR(w2, null, new Vector2(4f, 0f));
                Advance(w2, 2.5f, s2);
                bool same = true;
                for (int i = 0; i < cluster.Count; i++)
                    if (Math.Abs(cluster[i].Unit.Hp - cluster2[i].Unit.Hp) > 1e-4f) same = false;
                Check(same, "技能散点可复现(同序列两遍 → 逐项一致)");
            }

            // 秘术师 Q/E/R
            {
                var w = new LogicWorld();
                var p = MakePlayer(w);
                var s = new ArcanistSkills();
                s.CastQ(w);
                Check(w.Projectiles.Count == 3, "追星术放出 3 发法球");
                bool homing = w.Projectiles.TrueForAll(x => x.HomingRadM > 0f);
                Check(homing, "法球带追踪半径(会转向)");
                var from = p.Pos;
                var blink = s.CastE(w);
                Check(blink.HasValue, "星幕闪现返回起点/落点");
                Near(Vector2.Distance(from, p.Pos), 3.5f, 0.01f, "瞬移距离 3.5m");
                Near(Vector2.Distance(from, blink.Value.from), 0f, 0.01f, "返回的起点 = 施放前位置");
                Near(Vector2.Distance(p.Pos, blink.Value.to), 0f, 0.01f, "返回的落点 = 瞬移后位置");

                // 准星比射程近 → 瞬移距离被夹到准星处(镜像 web)
                var ww = new LogicWorld();
                var pp = MakePlayer(ww);
                var s2 = new ArcanistSkills();
                s2.CastE(ww, pp.Pos + new Vector2(2.0f, 0f)); // 准星只有 2m 远
                Near(Vector2.Distance(pp.Pos, new Vector2(2.0f, 0f)), 0f, 0.01f, "准星近时瞬移到准星处(2m<3.5m)");

                s.Rage = 40f;
                Check(s.CastR(w), "元素风暴可施放(怒气 40 门槛)");
                Check(w.Zones.Count == 1, "留下一个持续领域");
                var z = w.Zones[0];
                Near(z.RadiusM, 3.0f, 0.01f, "领域半径 3m");
                Near(z.LifeS, 3.0f, 0.01f, "怒气刚够门槛时持续 3s");
                Near(z.TickS, 0.4f, 0.01f, "领域每 0.4s 结算一次");

                var w3 = new LogicWorld();
                MakePlayer(w3);
                var s3 = new ArcanistSkills { Rage = 100f };
                s3.CastR(w3);
                Near(w3.Zones[0].LifeS, 4.5f, 0.01f, "怒气满时领域 +50% 时长(4.5s)");
            }

            // 守卫 Q/E/R:控制效果
            {
                var w = new LogicWorld();
                var p = MakePlayer(w);
                var e = MakeEnemy(w, new Vector2(1.6f, 0f));
                var s = new WardenSkills();
                Check(s.CastQ(w), "岩震击可施放");
                Advance(w, 0.1f, s);
                Check(e.Unit.Hp < 500f && e.Unit.StunT > 0f, "岩震击造成伤害并眩晕");

                var e2 = MakeEnemy(w, new Vector2(1.0f, 0.2f));
                s.CdE = 0;
                var dash = s.CastE(w);
                Check(dash.HasValue, "壁垒冲锋返回突进参数");
                Advance(w, 0.3f, s);
                Check(e2.Unit.Hp < 500f, "冲锋撞击造成伤害");
                Check(e2.Vel.Length() > 0.1f, "撞击带击退(写入速度)");

                s.Rage = 100f;
                Check(s.CastR(w), "大地怒吼可施放");
                Check(e2.Unit.SlowT > 0f, "怒吼附加减速");
                Check(e2.Vel.Length() > 0.1f, "怒吼击退");
            }

            // 符文元素注入(四职业共用路径)
            {
                var w = new LogicWorld();
                var p = MakePlayer(w);
                var e = MakeEnemy(w, new Vector2(1.5f, 0f));
                var s = new BladeSkills { RuneQ = RunePool.Blade[0] }; // 焚风之种 = 火 + 火焰地带
                s.CastQ(w);
                Advance(w, 0.6f, s);
                Check(e.Unit.Marks.ContainsKey(Element.Fire), "镶火符文后技能挂火印记");
                Check(w.Zones.Count > 0, "带地带的符文在末段留下火焰地带");

                var w2 = new LogicWorld();
                MakePlayer(w2);
                var s2 = new RangerSkills { RuneE = RunePool.Ranger[1] }; // rune_frostring「霜环」= 起点地带
                s2.CastE(w2);
                Check(w2.Zones.Count == 1, "游侠 E 的符文地带落在起点(镜像 web)");
            }
        }

        // ---------------- 符文池 ----------------

        private static void TestRunePool()
        {
            Suite("符文池(48 枚 / 每技能四元素全配)");
            var all = RunePool.All();
            Check(all.Count == 48, $"共 48 枚(实际 {all.Count})");
            var ids = new HashSet<string>();
            bool dup = false;
            foreach (var r in all) if (!ids.Add(r.Id)) dup = true;
            Check(!dup, "id 全局唯一");

            var bySkill = new Dictionary<string, List<RuneDef>>();
            foreach (var r in all)
            {
                if (!bySkill.ContainsKey(r.Skill)) bySkill[r.Skill] = new List<RuneDef>();
                bySkill[r.Skill].Add(r);
            }
            Check(bySkill.Count == 12, $"覆盖 12 个技能位(实际 {bySkill.Count})");
            bool threeEach = true, exclusive = true, hasElement = true;
            foreach (var kv in bySkill)
            {
                if (kv.Value.Count != 4) threeEach = false;
                var els = new HashSet<Element>();
                foreach (var r in kv.Value)
                {
                    if (!r.Element.HasValue) { hasElement = false; continue; }
                    if (!els.Add(r.Element.Value)) exclusive = false;
                }
            }
            Check(threeEach, "每个技能位恰好 4 枚");
            Check(hasElement, "每枚符文都有元素");
            Check(exclusive, "同技能位的 4 枚元素互斥(即四元素全覆盖)");
            Check(RunePool.ForClass("ranger").Count == 12 && RunePool.ForClass("warden").Count == 12,
                "按职业取用各 12 枚");
        }

        // ---------------- 掉落 ----------------

        private static void TestLoot()
        {
            Suite("掉落(权重 / 幸运 / 保底)");
            var f = new ItemFactory(20260929);
            var counts = new Dictionary<Rarity, int>();
            for (int i = 0; i < 4000; i++)
            {
                var it = f.Roll(0f);
                counts.TryGetValue(it.Rarity, out int c);
                counts[it.Rarity] = c + 1;
            }
            Check(counts.TryGetValue(Rarity.Common, out int common) && common > 0, "普通品质会出现");
            Check(counts.TryGetValue(Rarity.Legendary, out int leg), "橙装会出现(长尾)");
            Check(common > (counts.TryGetValue(Rarity.Rare, out int rare) ? rare : 0),
                "普通比稀有更常见(权重方向正确)");
            Check(leg >= 0, "橙装数量非负");

            // 保底:200 次未出橙 → 强制橙
            var f2 = new ItemFactory(1) { PityCount = Balance.PityLegendary - 1 };
            var forced = f2.Roll(0f);
            Check(forced.Rarity == Rarity.Legendary, "保底计数到顶必出橙");
            Check(f2.PityCount == 0, "保底触发后计数清零");

            // 幸运提高品质期望
            float AvgTier(ItemFactory fac, float luck)
            {
                int sum = 0;
                for (int i = 0; i < 1500; i++) sum += (int)fac.Roll(luck).Rarity;
                return sum / 1500f;
            }
            var low = new ItemFactory(777);
            var high = new ItemFactory(777);
            float a = AvgTier(low, 0f), b = AvgTier(high, 5f);
            Check(b >= a, $"幸运提升平均品质({a:0.00} → {b:0.00})");

            var made = f.Make(Slot.Weapon, Rarity.Legendary);
            Check(made.Slot == Slot.Weapon && made.Rarity == Rarity.Legendary, "指定部位/品质铸造可用(图纸系统)");
        }

        // ---------------- 时钟 ----------------

        private static void TestClock()
        {
            Suite("昼夜时钟");
            var c = new GameClock();
            Check(!c.IsNight, "开局是白天");
            c.Tick(Balance.DayS + 1f);
            Check(c.IsNight, "过了昼长进入夜晚");
            c.Tick(Balance.CycleS - Balance.DayS);
            Check(!c.IsNight, "一个周期后回到白天");
            c.Tick(Balance.DayS + 5f);
            Check(c.IsNight, "再次入夜");
            c.SkipNight();
            Check(!c.IsNight, "星灯买断立即天亮");
        }

        // ---------------- 局外存档 ----------------

        private static void TestMetaSave()
        {
            Suite("局外存档 / 祭坛");
            Check(MetaSave.AltarCost(0) == 50, "祭坛首级 50 星尘");
            Check(MetaSave.AltarCost(1) > MetaSave.AltarCost(0), "升级费用递增");
            Check(MetaSave.AltarCost(5) > MetaSave.AltarCost(4), "曲线持续递增(1.6^lvl)");

            var save = new MetaSave { stardust = 1000 };
            int lvl = save.altarHp;
            bool ok = save.TryUpgrade(ref lvl, 10);
            Check(ok && lvl == 1, "星尘足够时升级成功");
            Check(save.stardust == 1000 - MetaSave.AltarCost(0), "扣除对应星尘");
            save.stardust = 0;
            int lvl2 = save.altarAtk;
            Check(!save.TryUpgrade(ref lvl2, 10), "星尘不足时拒绝升级");
        }

        // ---------------- 职业技能集合(宿主适配层) ----------------

        private static void TestClassSkillSet()
        {
            Suite("ClassSkillSet(四职业分派)");
            foreach (var hero in new[] { HeroClass.Blade, HeroClass.Ranger, HeroClass.Arcanist, HeroClass.Warden })
            {
                var w = new LogicWorld();
                var p = MakePlayer(w, Vector2.Zero, 40f);
                MakeEnemy(w, new Vector2(2f, 0f));
                var set = new ClassSkillSet { Class = hero };
                Check(set.CastQ(w), $"{hero} Q 可施放");
                Check(set.Cooldown("Q") > 0f, $"{hero} Q 之后进入冷却");
                set.Cooldown("E");
                set.Rage = 100f;
                Check(set.Rage == 100f, $"{hero} 怒气读写代理到当前职业");
                Check(set.CastR(w), $"{hero} R 可施放");
                Near(set.Rage, 0f, 1e-3f, $"{hero} 放完 R 怒气清零");
            }

            // E 的两种形态:突进 vs 瞬移
            var wA = new LogicWorld();
            MakePlayer(wA);
            var arcSet = new ClassSkillSet { Class = HeroClass.Arcanist };
            var before = wA.Player.Pos;
            var blink = arcSet.CastE(wA);
            Check(blink.HasValue && blink.Value.Teleported, "秘术师 E 标记为瞬移(宿主不播放突进)");
            Near(Vector2.Distance(before, wA.Player.Pos), 3.5f, 0.01f, "瞬移距离生效");

            var wB = new LogicWorld();
            MakePlayer(wB);
            var bladeSet = new ClassSkillSet { Class = HeroClass.Blade };
            var dash = bladeSet.CastE(wB);
            Check(dash.HasValue && !dash.Value.Teleported && dash.Value.DistM > 0f, "剑士 E 返回突进参数(宿主播放位移)");

            // 符文按技能 id 匹配:给错职业的符文应被忽略
            var wC = new LogicWorld();
            MakePlayer(wC);
            var set2 = new ClassSkillSet { Class = HeroClass.Ranger };
            set2.Equip(RunePool.Blade[0], null, null);
            Check(set2.Ranger.RuneQ == null, "剑士符文镶不进猎手技能位(按目标技能 id 拒绝)");
            set2.Equip(null, RunePool.ForClass("ranger").Find(r => r.Skill == "ranger_e_nova"), null);
            Check(set2.Ranger.RuneE != null, "猎手符文可正常镶嵌");

            // 开局赠符 = 自己职业 Q 位的符文
            var set3 = new ClassSkillSet { Class = HeroClass.Warden };
            var granted = set3.GrantRandomQRune(new Rng(5));
            Check(granted != null && granted.Skill == "warden_q_quake", "开局赠符来自本职业 Q 技能位");
            Check(set3.SkillId("Q") == "warden_q_quake" && set3.SkillId("R") == "warden_r_roar", "技能 id 映射与 JSON 一致");
        }


        // ---------------- 中 Boss:苔冠巨鹿(镜像 web systems/MidBossSystem.ts) ----------------

        private static void TestMidBoss()
        {
            Suite("中 Boss 苔冠巨鹿(距离管理 / 冲撞预警 / 撞墙自晕 / 孢子弹幕 / 狂怒)");

            // 只刷一只,且在正确的房号
            {
                var w = new LogicWorld();
                MakePlayer(w);
                var run = new RunManagerLite();
                int midSpawns = 0;
                run.OnSpawn = (k, hp, atk, spd) => { if (k == EnemyKind.MidBossMossstag) midSpawns++; };
                for (int d = 0; d < 8; d++)
                {
                    run.NextRoom(w);
                    if (run.Room == RoomKind.MidBoss)
                    {
                        Check(run.Depth == 6, $"中 Boss 在第 6 房(实际第 {run.Depth + 1} 房)");
                        Check(midSpawns == 1, $"中 Boss 房只刷一只(实际 {midSpawns})");
                    }
                }
                // 章节决定中 Boss:二章刷女猎不刷巨鹿(轮 13);三章仍门控
                var run2 = new RunManagerLite();
                run2.SetChapter(2);
                int ch2Stag = 0, ch2Hnt = 0;
                run2.OnSpawn = (k, hp, atk, spd) =>
                {
                    if (k == EnemyKind.MidBossMossstag) ch2Stag++;
                    if (k == EnemyKind.MidBossFrosthuntress) ch2Hnt++;
                };
                for (int d = 0; d < 8; d++) run2.NextRoom(w);
                Check(ch2Hnt == 1, $"第二章中 Boss = 霜噬女猎 ×1(实际 {ch2Hnt})");
                Check(ch2Stag == 0, "第二章不能再把巨鹿抬出来");
                var run3 = new RunManagerLite();
                run3.SetChapter(3);
                int ch3Rpr = 0, ch3Other = 0;
                run3.OnSpawn = (k, hp, atk, spd) =>
                {
                    if (k == EnemyKind.MidBossSandreaper) ch3Rpr++;
                    else if (EnemyKinds.IsMidBoss(k)) ch3Other++;
                };
                for (int d = 0; d < 8; d++) run3.NextRoom(w);
                Check(ch3Rpr == 1, $"第三章中 Boss = 沙暴刽子 ×1(实际 {ch3Rpr})");
                Check(ch3Other == 0, "第三章不带前两位中 Boss");
            }

            // 注意:测试里的站位要离墙远一点(撞墙判定读的是 0.6m 边界余量,
            // 站在 y=0 会被判成"贴着墙",一冲就自晕 —— 我第一版就踩了这个)
            var mid = new Vector2(Bestiary.ArenaWidthM / 2f, Bestiary.ArenaHeightM / 2f);

            // stalk:保持助跑距离,不贴脸
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var stag = MakeEnemy(w, mid + new Vector2(6f, 0f), Bestiary.MidBossMossstagHp);
                stag.Kind = EnemyKind.MidBossMossstag;
                var ai = new CreatureAI();
                for (int i = 0; i < 90; i++) ai.Update(w, 1f / 60f);
                float d = Vector2.Distance(stag.Pos, w.Player.Pos);
                Check(d > 1.2f && d < 9f, $"中 Boss 保持距离({d:0.0}m)");
            }

            // 冲撞:亮出路径预警圈 → 冲刺(速度到得了表里的值)
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var stag = MakeEnemy(w, mid + new Vector2(4f, 0f), Bestiary.MidBossMossstagHp);
                stag.Kind = EnemyKind.MidBossMossstag;
                var ai = new CreatureAI();
                bool sawTelegraph = false;
                float maxSpeed = 0f;
                for (int i = 0; i < 60 * 8; i++)
                {
                    ai.Update(w, 1f / 60f);
                    if (w.Telegraphs.Count > 0) sawTelegraph = true;
                    maxSpeed = MathF.Max(maxSpeed, stag.Vel.Length());
                    w.Telegraphs.Clear(); // 只关心"有没有亮过",不然会一直堆积
                }
                Check(sawTelegraph, "冲撞前在路径上亮预警圈");
                Check(maxSpeed >= Bestiary.MidBossMossstagChargeSpeedM - 0.01f,
                    $"冲撞速度到得了表里的值(峰值 {maxSpeed:0.0} m/s)");
            }

            // 孢子弹幕:多发毒弹 + 玩家脚下孢子云
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var stag = MakeEnemy(w, mid + new Vector2(3f, 0f), Bestiary.MidBossMossstagHp);
                stag.Kind = EnemyKind.MidBossMossstag;
                var ai = new CreatureAI();
                int maxShots = 0, maxZones = 0;
                // **不强制冷却**:让 AI 按真实节奏自己决定何时放(踩过"冲撞把弹幕饿死"的坑)
                for (int i = 0; i < 60 * 12; i++)
                {
                    ai.Update(w, 1f / 60f);
                    maxShots = Math.Max(maxShots, w.Projectiles.Count);
                    maxZones = Math.Max(maxZones, w.Zones.Count);
                    w.Projectiles.Clear(); // 只数"一次打了几发"
                }
                Check(maxShots >= (int)Bestiary.MidBossMossstagVolleyCount,
                    $"孢子弹幕一次打出 ≥{Bestiary.MidBossMossstagVolleyCount:0} 发(实测最多 {maxShots} 发)");
                Check(maxZones >= 1, "弹幕落点种下孢子云(空间封锁)");
            }

            // 撞墙自晕:贴墙站位 → 冲锋撞墙 → 长硬直(可观测:连续静止帧够多)
            {
                var w = new LogicWorld();
                MakePlayer(w, new Vector2(1.0f, 8f));
                var stag = MakeEnemy(w, new Vector2(2.2f, 8f), Bestiary.MidBossMossstagHp);
                stag.Kind = EnemyKind.MidBossMossstag;
                var ai = new CreatureAI();
                int still = 0, bestStill = 0;
                for (int i = 0; i < 60 * 12; i++)
                {
                    ai.Update(w, 1f / 60f);
                    if (stag.Vel.Length() < 0.01f) { still++; bestStill = Math.Max(bestStill, still); }
                    else still = 0;
                }
                float longest = bestStill / 60f;
                Check(longest >= Bestiary.MidBossMossstagChargeWallStunS * 0.5f,
                    $"撞墙硬直够长(最长静止 {longest:0.0}s,表里 wallStunS={Bestiary.MidBossMossstagChargeWallStunS:0.0}s)");
            }

            // 狂怒:半血后弹幕变多(基础 +enrageVolleyAdd)
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var stag = MakeEnemy(w, mid + new Vector2(4f, 0f), Bestiary.MidBossMossstagHp);
                stag.Kind = EnemyKind.MidBossMossstag;
                stag.Unit.Hp = stag.Unit.HpMax * (Bestiary.MidBossMossstagPhase2At - 0.05f);
                var ai = new CreatureAI();
                int maxShots = 0;
                for (int i = 0; i < 60 * 16; i++)
                {
                    ai.Update(w, 1f / 60f);
                    maxShots = Math.Max(maxShots, w.Projectiles.Count);
                    w.Projectiles.Clear();
                }
                int expect = (int)(Bestiary.MidBossMossstagVolleyCount + Bestiary.MidBossMossstagEnrageVolleyAdd);
                Check(maxShots >= expect, $"狂怒弹幕更多(实测最多 {maxShots} 发 ≥ {expect})");
            }

            // 两招轮换:30 秒内冲撞与弹幕都要出现(不许互相饿死)
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var stag = MakeEnemy(w, mid + new Vector2(6f, 0f), Bestiary.MidBossMossstagHp);
                stag.Kind = EnemyKind.MidBossMossstag;
                var ai = new CreatureAI();
                int charges = 0, volleys = 0;
                // 用"速度突变 + 弹幕出现"来数(状态机内部状态不便从测试读):
                bool sawCharge = false;
                for (int i = 0; i < 60 * 30; i++)
                {
                    ai.Update(w, 1f / 60f);
                    if (stag.Vel.Length() >= Bestiary.MidBossMossstagChargeSpeedM - 0.01f && !sawCharge)
                    {
                        sawCharge = true; charges++;
                    }
                    else if (stag.Vel.Length() < 0.01f) sawCharge = false;   // 冲完停下 → 可以数下一次
                    if (w.Projectiles.Count > 0) { volleys++; w.Projectiles.Clear(); }
                }
                Check(charges >= 3, $"30 秒至少冲 3 次(实际 {charges})");
                Check(volleys >= 3, $"30 秒至少放 3 次弹幕(实际 {volleys})");
            }

            // 分类助手:中 Boss 是 Boss 级,但不是章 Boss
            Check(EnemyKinds.IsMidBoss(EnemyKind.MidBossMossstag), "IsMidBoss 认得苔冠巨鹿");
            Check(EnemyKinds.IsBossTier(EnemyKind.MidBossMossstag) && !EnemyKinds.IsBoss(EnemyKind.MidBossMossstag),
                "中 Boss 属 Boss 级但不是章 Boss");
            Check(EnemyKinds.ChapterOf(EnemyKind.MidBossMossstag) == 1, "苔冠巨鹿归第一章");

            Suite("中 Boss 霜噬女猎(风筝 / 瞬步连射 / 冰牙陷阵 / 猎杀凝视可打断)");

            // kite:弓手要距离(巨鹿的反面:开局贴脸也要拉开)
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var hnt = MakeEnemy(w, mid + new Vector2(1.5f, 0f), Bestiary.MidBossFrosthuntressHp);
                hnt.Kind = EnemyKind.MidBossFrosthuntress;
                var ai = new CreatureAI();
                for (int i = 0; i < 120; i++) ai.Update(w, 1f / 60f);
                float d = Vector2.Distance(hnt.Pos, w.Player.Pos);
                Check(d > 2f, $"女猎拉开距离({d:0.0}m > 2m)");
            }

            // 瞬影冰矢:瞬步真的位移 + 连射发数够表
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var hnt = MakeEnemy(w, mid + new Vector2(5f, 0f), Bestiary.MidBossFrosthuntressHp);
                hnt.Kind = EnemyKind.MidBossFrosthuntress;
                var ai = new CreatureAI();
                var p0 = hnt.Pos;
                float maxJump = 0f;
                int maxShots = 0;
                var prev = hnt.Pos;
                for (int i = 0; i < 60 * 8; i++)
                {
                    ai.Update(w, 1f / 60f);
                    maxJump = MathF.Max(maxJump, Vector2.Distance(prev, hnt.Pos)); // 单帧大位移 = 瞬步
                    prev = hnt.Pos;
                    maxShots += w.Projectiles.Count;   // 连射是 0.16s 一发,要**累计**数(齐射才看单帧峰值)
                    w.Projectiles.Clear();
                }
                Check(maxJump > 1.5f, $"瞬步是瞬移不是走路(单帧位移峰值 {maxJump:0.0}m)");
                Check(maxShots >= (int)Bestiary.MidBossFrosthuntressArrowsCount,
                    $"8 秒内累计连射 ≥{Bestiary.MidBossFrosthuntressArrowsCount:0} 发(实测 {maxShots})");
            }

            // 冰牙陷阵:一次铺 ≥count 处冰爆预警
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var hnt = MakeEnemy(w, mid + new Vector2(5f, 0f), Bestiary.MidBossFrosthuntressHp);
                hnt.Kind = EnemyKind.MidBossFrosthuntress;
                var ai = new CreatureAI();
                int maxTg = 0;
                for (int i = 0; i < 60 * 14; i++)
                {
                    ai.Update(w, 1f / 60f);
                    maxTg = Math.Max(maxTg, w.Telegraphs.Count);
                    TelegraphSystem.Tick(w, 1f / 60f);
                }
                Check(maxTg >= (int)Bestiary.MidBossFrosthuntressTrapsCount,
                    $"陷阱/冰枪预警一次 ≥{Bestiary.MidBossFrosthuntressTrapsCount:0} 处(实测 {maxTg})");
            }

            // 猎杀凝视:蓄力亮要害(VulnT>0)+ 打断撤干净冰枪 + 满硬直(核心博弈)
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var hnt = MakeEnemy(w, mid + new Vector2(5f, 0f), Bestiary.MidBossFrosthuntressHp);
                hnt.Kind = EnemyKind.MidBossFrosthuntress;
                var ai = new CreatureAI();
                // 等它进入蓄力(观测:VulnT 被点亮 + 场上有一排冰枪)
                bool sawChannel = false;
                int lanesBefore = 0, lanesAfter = -1;
                int stillAfterHit = 0, bestStill = 0;
                bool hit = false;
                int framesAfterHit = 0;
                for (int i = 0; i < 60 * 40 && framesAfterHit < (int)(Bestiary.MidBossFrosthuntressMarkInterruptStunS * 60) - 6; i++)
                {
                    ai.Update(w, 1f / 60f);
                    if (!sawChannel && hnt.Unit.VulnT > 0f && w.Telegraphs.Count >= (int)Bestiary.MidBossFrosthuntressMarkSegments)
                    {
                        sawChannel = true;
                        lanesBefore = w.Telegraphs.Count;
                        hnt.Unit.Hp -= 15f;   // 玩家打了她一下 → 下一帧必须打断
                        hit = true;
                        continue;             // 打断在下一次 Update 里发生
                    }
                    if (hit)
                    {
                        framesAfterHit++;
                        if (lanesAfter < 0) lanesAfter = w.Telegraphs.Count;   // 打断后的第一帧采样
                        if (hnt.Vel.Length() < 0.01f) { stillAfterHit++; bestStill = Math.Max(bestStill, stillAfterHit); }
                        else stillAfterHit = 0;
                    }
                    TelegraphSystem.Tick(w, 1f / 60f);
                }
                Check(sawChannel, $"猎杀凝视蓄力真的会来(冰枪 {lanesBefore} 段 + VulnT 点亮)");
                Check(lanesAfter >= 0 && lanesAfter <= lanesBefore - (int)Bestiary.MidBossFrosthuntressMarkSegments,
                    $"打断把整排冰枪撤干净(蓄力时 {lanesBefore} → 打断后 {lanesAfter})");
                Check(bestStill / 60f >= Bestiary.MidBossFrosthuntressMarkInterruptStunS * 0.6f,
                    $"打断给足硬直(硬直期静止 {bestStill / 60f:0.0}s / 表 {Bestiary.MidBossFrosthuntressMarkInterruptStunS:0.0}s)");
            }

            // 分类助手
            Check(EnemyKinds.IsMidBoss(EnemyKind.MidBossFrosthuntress), "IsMidBoss 认得霜噬女猎");
            Check(EnemyKinds.IsBossTier(EnemyKind.MidBossFrosthuntress) && !EnemyKinds.IsBoss(EnemyKind.MidBossFrosthuntress),
                "女猎属 Boss 级但不是章 Boss");
            Check(EnemyKinds.ChapterOf(EnemyKind.MidBossFrosthuntress) == 2, "霜噬女猎归第二章");

            Suite("中 Boss 沙暴刽子(镰钩拉人 / 处刑斩劈空卡沙 / 沙暴漩涡)");

            // 镰钩:钩中把玩家拉近 + 掉血
            {
                var w = new LogicWorld();
                MakePlayer(w, mid + new Vector2(5f, 0f));
                var rpr = MakeEnemy(w, mid, Bestiary.MidBossSandreaperHp);
                rpr.Kind = EnemyKind.MidBossSandreaper;
                var ai = new CreatureAI();
                float d0 = Vector2.Distance(w.Player.Pos, rpr.Pos);
                float hp0 = w.Player.Unit.Hp;
                for (int i = 0; i < 60 * 6; i++) { ai.Update(w, 1f / 60f); TelegraphSystem.Tick(w, 1f / 60f); }
                float d1 = Vector2.Distance(w.Player.Pos, rpr.Pos);
                Check(w.Player.Unit.Hp < hp0, "被钩中掉血");
                Check(d1 < d0, $"钩中被拉近({d0:0.0}m → {d1:0.0}m)");
            }

            // 处刑斩:锁落点亮大圆;玩家滚开 → 劈空满硬直(核心博弈)
            {
                var w = new LogicWorld();
                MakePlayer(w, mid + new Vector2(4f, 0f));
                var rpr = MakeEnemy(w, mid, Bestiary.MidBossSandreaperHp);
                rpr.Kind = EnemyKind.MidBossSandreaper;
                var ai = new CreatureAI();
                // 把钩和漩涡的冷却看作不干扰:直接跑,遇到大圆预警就横移(圆半径 1.5m,移 3.5m 必出圈)
                bool sawBigRing = false;
                int still = 0, bestStill = 0;
                for (int i = 0; i < 60 * 20; i++)
                {
                    ai.Update(w, 1f / 60f);
                    foreach (var tg in w.Telegraphs)
                        if (tg.RadiusM >= Bestiary.MidBossSandreaperCleaveRadiusM - 0.01f && !sawBigRing)
                        {
                            sawBigRing = true;
                            w.Player.Pos += new Vector2(0f, 3.5f);   // 滚出处刑圈
                        }
                    TelegraphSystem.Tick(w, 1f / 60f);
                    if (sawBigRing)
                    {
                        if (rpr.Vel.Length() < 0.01f) { still++; bestStill = Math.Max(bestStill, still); }
                        else still = 0;
                    }
                }
                Check(sawBigRing, "处刑斩真的锁落点亮了大圆");
                Check(bestStill / 60f >= Bestiary.MidBossSandreaperCleaveMissStunS * 0.8f,
                    $"劈空 = 刀卡沙满硬直(静止 {bestStill / 60f:0.0}s / 表 {Bestiary.MidBossSandreaperCleaveMissStunS:0.0}s)");
            }

            // 沙暴漩涡:以自己为中心铺 ≥count 片沙暴区
            {
                var w = new LogicWorld();
                MakePlayer(w, mid + new Vector2(7f, 0f));
                var rpr = MakeEnemy(w, mid, Bestiary.MidBossSandreaperHp);
                rpr.Kind = EnemyKind.MidBossSandreaper;
                var ai = new CreatureAI();
                int maxZones = 0;
                for (int i = 0; i < 60 * 16; i++)
                {
                    ai.Update(w, 1f / 60f);
                    TelegraphSystem.Tick(w, 1f / 60f);
                    maxZones = Math.Max(maxZones, w.Zones.Count);
                    if (w.Zones.Count > 0) w.Zones.Clear();   // 只数一轮铺了几片
                }
                Check(maxZones >= (int)Bestiary.MidBossSandreaperStormCount,
                    $"沙暴一轮 ≥{Bestiary.MidBossSandreaperStormCount:0} 片(实测 {maxZones})");
            }

            // 分类助手 + 三性格数值对比
            Check(EnemyKinds.IsMidBoss(EnemyKind.MidBossSandreaper), "IsMidBoss 认得沙暴刽子");
            Check(EnemyKinds.ChapterOf(EnemyKind.MidBossSandreaper) == 3, "沙暴刽子归第三章");
            Check(Bestiary.MidBossSandreaperCleaveMissStunS > Bestiary.MidBossSandreaperCleaveHitStunS * 2f,
                "劈空硬直显著长于命中(博弈才成立)");

            Suite("冰面滑行(轮 12:惯性可测 / 翻滚反制 / 只考验玩家)");
            {
                var ice = TerrainRules.TerrainState.ForLayout("icefield", 16f, 26f);
                Check(ice.HasIce && ice.IsIce(26f * 0.52f, 8f), "冰湖房中心是冰");
                Check(!ice.IsIce(1f, 1f), "房角不是冰");
                Check(!TerrainRules.TerrainState.ForLayout("shore", 16f).IsIce(13f, 9.9f), "浅滩房没有冰");

                // 惯性:意图速度归零后,实际速度衰减但不清零(松手继续滑)
                float sx = 4f, sy = 0f;
                for (int i = 0; i < 12; i++)
                    (sx, sy) = TerrainRules.SlideStep(sx, sy, 0f, 0f, true, false, 1f / 60f);
                Check(sx > 1.5f, $"松手 0.2s 后仍在滑(残速 {sx:0.0} m/s)");

                // 急转会漂:180° 反打后短时间内实际速度仍是原方向
                float rx = 4f;
                (rx, _) = TerrainRules.SlideStep(rx, 0f, -4f, 0f, true, false, 1f / 60f);
                Check(rx > 0f, $"反打第一帧仍向原方向漂({rx:0.0} m/s)");

                // 反制:翻滚不打滑 / 平地不打滑
                Check(TerrainRules.SlideStep(4f, 0f, -8f, 0f, true, true, 1f / 60f).vx == -8f, "翻滚期间位移立刻听翻滚的");
                Check(TerrainRules.SlideStep(4f, 0f, -4f, 0f, false, false, 1f / 60f).vx == -4f, "平地没有惯性");
            }

            Suite("轮 11 补怪四件套(炮台 / 漂移 / 伏击 / 画线)");

            // 冰锥笋:进圈点脚下,本体不动;圈外装死
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var spike = MakeEnemy(w, mid + new Vector2(4f, 0f), Bestiary.IceSpikeHp);
                spike.Kind = EnemyKind.IceSpike;
                var ai = new CreatureAI();
                var p0 = spike.Pos;
                int maxTg = 0;
                for (int i = 0; i < 60 * 4; i++)
                {
                    ai.Update(w, 1f / 60f);
                    maxTg = Math.Max(maxTg, w.Telegraphs.Count);
                    w.Telegraphs.Clear();
                }
                Check(maxTg >= 1, "冰锥笋在玩家脚下点冰锥");
                Check(Vector2.Distance(spike.Pos, p0) < 0.01f, "炮台一步不挪");
            }

            // 霜刃滑手:转向限速(0.3s 掰不过 180°)
            {
                var w = new LogicWorld();
                MakePlayer(w, mid);
                var g = MakeEnemy(w, mid + new Vector2(3f, 0f), Bestiary.IceGliderHp);
                g.Kind = EnemyKind.IceGlider;
                var ai = new CreatureAI();
                for (int i = 0; i < 18; i++) ai.Update(w, 1f / 60f);   // heading 从 0 开始,玩家在左
                Check(MathF.Cos(g.Face) > 0f, "0.3s 内掰不过头(转向限速)");
                for (int i = 0; i < 150; i++) ai.Update(w, 1f / 60f);
                Check(MathF.Cos(g.Face) < 0f, "足够时间后终于朝向玩家");
            }

            // 沙蜃花:圈外装死;进圈 firstDelayS 后一圈毒针
            {
                var w = new LogicWorld();
                MakePlayer(w, mid + new Vector2(Bestiary.MirageBlossomBurstTriggerM + 2f, 0f));
                var b = MakeEnemy(w, mid, Bestiary.MirageBlossomHp);
                b.Kind = EnemyKind.MirageBlossom;
                var ai = new CreatureAI();
                for (int i = 0; i < 60; i++) ai.Update(w, 1f / 60f);
                Check(w.Projectiles.Count == 0, "圈外装死不放针");
                w.Player.Pos = mid + new Vector2(2f, 0f);
                for (int i = 0; i < (int)((Bestiary.MirageBlossomBurstFirstDelayS + 0.3f) * 60); i++) ai.Update(w, 1f / 60f);
                Check(w.Projectiles.Count >= (int)Bestiary.MirageBlossomBurstCount,
                    $"苏醒后环形毒针 ≥{Bestiary.MirageBlossomBurstCount:0} 根(实际 {w.Projectiles.Count})");
            }

            // 烬旋灵:突进画火痕(≥3 片)
            {
                var w = new LogicWorld();
                MakePlayer(w, mid + new Vector2(5f, 0f));
                var wl = MakeEnemy(w, mid, Bestiary.EmberWhirlHp);
                wl.Kind = EnemyKind.EmberWhirl;
                var ai = new CreatureAI();
                int maxZones = 0;
                for (int i = 0; i < 60 * 8; i++)
                {
                    ai.Update(w, 1f / 60f);
                    maxZones = Math.Max(maxZones, w.Zones.Count);
                }
                Check(maxZones >= 3, $"突进沿途留火痕 ≥3 片(实际 {maxZones})");
            }

            // 章归属
            Check(EnemyKinds.ChapterOf(EnemyKind.IceGlider) == 2 && EnemyKinds.ChapterOf(EnemyKind.EmberWhirl) == 3,
                "新怪各归各章");

            Suite("沙暴视野(轮 15:循环节拍 / 射程缩短)");
            {
                Check(!TerrainRules.StormActive(0f), "开局是晴");
                Check(!TerrainRules.StormActive(TerrainRules.StormClearS - 0.1f), "晴段末尾还是晴");
                Check(TerrainRules.StormActive(TerrainRules.StormClearS + 0.1f), "晴够了起暴");
                Check(!TerrainRules.StormActive(TerrainRules.StormClearS + TerrainRules.StormActiveS + 0.1f), "暴完回晴(循环)");
                Check(TerrainRules.StormActive(TerrainRules.StormClearS * 2 + TerrainRules.StormActiveS + 1.1f) ==
                      TerrainRules.StormActive(TerrainRules.StormClearS + 1.1f), "循环周期一致");
                Check(TerrainRules.ProjAgeMul(TerrainRules.StormClearS + 1f) == TerrainRules.StormProjAgeMul, "暴中投射物加速衰老");
                Check(TerrainRules.ProjAgeMul(1f) == 1f, "晴天无惩罚");
            }
        }


        // ---------------- 新手引导 + 3 存档槽(镜像 web meta/Tutorial.ts / Save.ts) ----------------

        private static void TestTutorialAndSlots()
        {
            Suite("新手引导 + 3 存档槽");

            Check(Tutorial.StepCount == 5, $"引导 5 步(实际 {Tutorial.StepCount})");
            Check(Tutorial.StepIds[0] == "move" && Tutorial.StepIds[4] == "altar",
                "首步走动、末步祭坛");
            Check(Tutorial.IsValidStep("dash") && !Tutorial.IsValidStep("dance"), "步骤 id 校验");
            Check(Tutorial.MoveM > 1f, $"走动判定距离有值({Tutorial.MoveM} m)");
            Check(Tutorial.ClampStep(-5) == 0 && Tutorial.ClampStep(99) == Tutorial.StepCount, "step 越界夹回");

            // 推进:顺序可预测(先翻滚不算),重复上报不多推
            int step = 0; bool done = false;
            Check(!Tutorial.Notify(ref step, ref done, "skill"), "跳步不作数");
            Check(Tutorial.Notify(ref step, ref done, "move"), "第 1 步通过");
            Check(!Tutorial.Notify(ref step, ref done, "move"), "同一步重复上报不多推");
            Check(step == 1, $"推进后停在第 2 步(实际 {step + 1})");

            // 存档槽:3 槽、键命名、槽 0 兼容历史单档
            Check(SaveSlots.Count == 3, $"3 个存档槽(实际 {SaveSlots.Count})");
            Check(SaveSlots.KeyOf(0) == "sk_save", "0 号槽沿用历史键(老玩家零迁移)");
            Check(SaveSlots.KeyOf(2) == "sk_save_slot2", "2 号槽带后缀");
            var keys = new List<string>(SaveSlots.AllKeys());
            Check(keys.Count == 3 && keys[0] != keys[1] && keys[1] != keys[2], "三个槽的键互不相同");
            Check(SaveSlots.IsValid(0) && SaveSlots.IsValid(2) && !SaveSlots.IsValid(3), "槽下标范围");

            // 存档 POCO 带引导进度与写入时间(Web 侧同款字段)
            var save = new MetaSave { tutorialStep = 3, tutorialDone = false, updatedAt = 1700000000L, stardust = 42 };
            Check(save.tutorialStep == 3 && !save.tutorialDone, "存档能带引导进度");
            Check(save.updatedAt > 0, "存档记最后写入时间");
            Check(save.stardust == 42, "星尘字段共存(引导不影响钱包)");

            // 两个槽的档是互相独立的对象(换档不串数据)
            var slotA = new MetaSave { stardust = 111, tutorialStep = 2 };
            var slotB = new MetaSave { stardust = 222 };
            slotA.stardust += 1;
            Check(slotB.stardust == 222 && slotA.stardust == 112, "两槽数据互不影响");
            Check(slotB.tutorialStep == 0, "空槽的引导从头开始");
        }

        // ---------------- 图鉴(收录) ----------------

        private static void TestCodex()
        {
            Suite("图鉴(收录 / 进度 / 存档清洗)");
            var codex = new Codex();
            Check(Codex.EnemyTotal == 30 && Codex.RuneTotal == 48,
                $"条目总数 30 怪 + 48 符文(实际 {Codex.EnemyTotal} + {Codex.RuneTotal})");
            Check(codex.EnemyFound == 0 && codex.RuneFound == 0 && !codex.Complete, "空图鉴:一条都没收录");
            Near(codex.Pct, 0f, 1e-6f, "收录率 0");

            Check(codex.MarkKill(EnemyKind.Shroomling), "首次击杀返回 true(宿主弹新条目)");
            Check(!codex.MarkKill(EnemyKind.Shroomling), "重复击杀返回 false");
            Check(codex.KillsOf(EnemyKind.Shroomling) == 2, "击杀数累加");
            Check(codex.EnemyFound == 1, "已收录 1 条");

            Check(codex.MarkRune("rune_emberseed"), "首次获得符文返回 true");
            Check(!codex.MarkRune("rune_emberseed"), "重复获得返回 false");
            Check(!codex.MarkRune("rune_nope") && !codex.MarkRune(""),
                "未知/空符文 id 被拒(不会画出幽灵条目)");
            Check(codex.RunesOf("rune_emberseed") == 2, "符文获得次数累加");

            // 全收录 = 100%
            var full = new Codex();
            foreach (var kv in Bestiary.Stats) full.MarkKill(kv.Key);
            foreach (var r in RunePool.All()) full.MarkRune(r.Id);
            Check(full.Complete, "全收录后 Complete = true");
            Near(full.Pct, 1f, 1e-6f, "全收录 = 100%");

            // 存档清洗:未知键 / 兜底 'monster' / 负数 / 非数字
            var rawE = new Dictionary<string, object>
            {
                { "Shroomling", 3 },
                { "monster", 99 },      // web 的兜底种类串,Unity 侧不是合法枚举 → 丢弃
                { "WindBee", -2 },
                { "OakGolem", 4.7f },
                { "Dragon", 5 },
            };
            var rawR = new Dictionary<string, object>
            {
                { "rune_emberseed", 1 },
                { "rune_fake", 5 },
            };
            var loaded = Codex.Sanitize(rawE, rawR);
            Check(loaded.KillsOf(EnemyKind.Shroomling) == 3, "清洗保留合法计数");
            Check(loaded.KillsOf(EnemyKind.WindBee) == 0 && loaded.KillsOf(EnemyKind.OakGolem) == 4,
                "负数丢弃、小数取整");
            Check(loaded.EnemyFound == 2 && loaded.RuneFound == 1, "未知键不进图鉴(进度不被本地化/脏数据撑爆)");
            Check(Codex.Sanitize(null, null).EnemyFound == 0, "null 输入返回空图鉴(不抛异常)");

            // 击杀榜
            var top = new Codex();
            top.MarkKill(EnemyKind.OakGolem);
            for (int i = 0; i < 5; i++) top.MarkKill(EnemyKind.BossKazra);
            top.MarkKill(EnemyKind.BossKazra);
            var board = top.TopKills(2);
            Check(board.Count == 2 && board[0].kind == EnemyKind.BossKazra && board[0].kills == 6,
                "击杀榜按次数降序");
        }

        // ---------------- 章节与出怪池 ----------------

        private static void TestChapters()
        {
            Suite("三章出怪 / 精英编成 / 章节 Boss");
            Check(Bestiary.ChapterOf(1).Name == "翠语林地" && Bestiary.ChapterOf(2).Name == "霜语冰原"
                  && Bestiary.ChapterOf(3).Name == "烬语荒漠", "三章名称与 balance 一致");
            Near(Bestiary.ChapterOf(2).StatMult, 1.35f, 1e-3f, "章 2 杂兵乘区 1.35");
            Near(Bestiary.ChapterOf(3).StatMult, 1.70f, 1e-3f, "章 3 杂兵乘区 1.7");
            Check(EnemyKinds.BossOf(1) == EnemyKind.BossNanmir && EnemyKinds.BossOf(2) == EnemyKind.BossVelsha
                  && EnemyKinds.BossOf(3) == EnemyKind.BossKazra, "章节 Boss 对应正确");
            Check(Bestiary.Stats.Count == 30, $"图鉴覆盖 30 种敌人(实际 {Bestiary.Stats.Count})");

            for (int chapter = 1; chapter <= 3; chapter++)
            {
                var w = new LogicWorld();
                MakePlayer(w);
                var run = new RunManagerLite();
                var kinds = new List<EnemyKind>();
                run.OnSpawn = (k, hp, atk, spd) => kinds.Add(k);
                run.SetChapter(chapter);
                for (int d = 0; d < 8; d++) run.NextRoom(w);

                bool poolOk = true;
                foreach (var k in kinds)
                {
                    if (EnemyKinds.IsBoss(k)) continue;
                    int kc = EnemyKinds.ChapterOf(k);
                    // 元素杂兵(1 章归属)三章通用,其余必须属于本章
                    if (kc != chapter && kc != 1) poolOk = false;
                }
                Check(poolOk, $"章 {chapter}:杂兵全部来自本章出怪池");
                Check(kinds.Contains(EnemyKinds.BossOf(chapter)), $"章 {chapter}:Boss = {EnemyKinds.BossOf(chapter)}");

                var comp = RunManagerLite.EliteComp[chapter];
                int hits = 0;
                foreach (var k in comp) if (kinds.Contains(k)) hits++;
                Check(hits >= comp.Length - 1, $"章 {chapter}:精英编成命中 {hits}/{comp.Length} 种");
            }

            var wB = new LogicWorld();
            MakePlayer(wB);
            var runB = new RunManagerLite();
            runB.SetChapter(3);
            float bossHp = -1f;
            runB.OnSpawn = (k, hp, atk, spd) => { if (EnemyKinds.IsBoss(k)) bossHp = hp; };
            for (int d = 0; d < 8; d++) runB.NextRoom(wB);
            Near(bossHp, Bestiary.Of(EnemyKind.BossKazra).Hp, 0.01f, "章 3 Boss 血量不被章节乘区二次放大");
        }

        /// <summary>
        /// 深渊难度层(轮 23):层表乘区 + 逐层解锁 + **真的作用到出怪**。
        /// 前面三项在 ParityTests.CheckAbyss 里是纯规则断言;这里跑**真实的 RunManagerLite**,
        /// 因为"规则写对了但 Scale 没乘上"是这一轮最容易犯的错(web 侧同款接线守卫)。
        /// </summary>
        private static void TestAbyss()
        {
            Suite("深渊难度层(乘区 / 解锁 / 接线)");
            Check(AbyssRules.LevelCount == 3, "三层难度");
            Check(AbyssRules.HpMult(1) < AbyssRules.HpMult(2) && AbyssRules.HpMult(2) < AbyssRules.HpMult(3),
                "怪血乘区逐层递增");
            Check(AbyssRules.LootMult(1) > 1f && AbyssRules.LootMult(3) > AbyssRules.LootMult(2),
                "掉落乘区逐层递增且都 > 1(难度要值得打)");

            // 解锁:逐层(不能跳级)
            var none = new int[3];
            var firstOnly = new int[] { 1, 0, 0 };
            var all = new int[] { 9, 9, 9 };
            Check(!AbyssRules.Unlocked(2, 9999, none) && AbyssRules.Unlocked(2, 9999, firstOnly),
                "深渊 II 必须先通关深渊 I");
            Check(!AbyssRules.Unlocked(3, 9999, firstOnly)
                  && AbyssRules.Unlocked(3, 9999, all), "深渊 III 只看深渊 II(不能跳级)");

            // 接线:真实 RunManagerLite 的出怪血量按档位放大
            var w0 = new LogicWorld();
            MakePlayer(w0);
            var run0 = new RunManagerLite();
            int spawned0 = 0;
            run0.OnSpawn = (k, hp, atk, spd) => { if (!EnemyKinds.IsBoss(k)) spawned0++; };
            run0.SetChapter(1);
            run0.NextRoom(w0);

            var w3 = new LogicWorld();
            MakePlayer(w3);
            var run3 = new RunManagerLite();
            int spawned3 = 0;
            run3.OnSpawn = (k, hp, atk, spd) => { if (!EnemyKinds.IsBoss(k)) spawned3++; };
            run3.SetChapter(1);
            run3.SetAbyss(3);
            run3.NextRoom(w3);
            Check(spawned0 > 0 && spawned3 > 0, "两种档位都刷出了杂兵");

            // 比"同一只怪"的缩放比值:两次出怪的**种类随机**,直接比两只不同怪的血量会得到 1.2 这种假比值
            var probe = Bestiary.Of(EnemyKind.Shroomling);
            var (hpA, atkA) = run0.Scale(probe, false, false);
            var (hpB, atkB) = run3.Scale(probe, false, false);
            Near(hpB / hpA, AbyssRules.HpMult(3), 1e-3f,
                $"深渊 III 下同一只菇灵血量是普通档的 {AbyssRules.HpMult(3)} 倍(实测 {hpB / hpA:0.###})");
            // 攻击数值过闸门时会取整(轮 24 的 SafeAtk):小怪 atk 基数小,1 点取整就能放大成 5% 误差,
            // 所以这里按"绝对值 ±1 点"比,而不是比乘区 —— 比乘区会变成假红。
            Near(atkB / atkA, AbyssRules.AtkMult(3), 1f / atkA + 1e-3f, $"攻击同理 ×{AbyssRules.AtkMult(3)}(取整误差 ±1 点)");
            Check(run0.LootMult == 1f && run3.LootMult > 1f, "掉落乘区随档位走(普通档中性)");
            Check(run0.DustMult == 1f && run3.DustMult > 1f, "星尘乘区随档位走");
            Check(run0.EliteExtraWaves == 0 && run3.EliteExtraWaves > 0, "精英房波次随档位走");

            // 精英房真的多刷了怪(不是只暴露了一个 getter)
            int CountElite(int abyss)
            {
                var w = new LogicWorld();
                MakePlayer(w);
                var run = new RunManagerLite();
                int n = 0;
                run.OnRoomStart = (kind, depth) => { if (kind == RoomKind.Elite) n = 0; };
                run.OnSpawn = (k, hp, atk, spd) => { if (run.Room == RoomKind.Elite) n++; };
                run.SetChapter(1);
                run.SetAbyss(abyss);
                for (int d = 0; d < 5; d++) run.NextRoom(w);
                return n;
            }
            int elite0 = CountElite(0);
            int elite3 = CountElite(3);
            Check(elite0 > 0 && elite3 > elite0, $"深渊档的精英房怪更多(普通 {elite0} → 深渊 III {elite3})");

            // 挑战局口径:普通档不叠任何乘区
            Check(AbyssRules.HpMult(AbyssRules.Normal) == 1f && AbyssRules.AtkMult(AbyssRules.Normal) == 1f,
                "普通档全中性(挑战局固定用它)");
        }

        private static void TestEndless()
        {
            Suite("无尽模式(循环 / 乘区 / 两道闸门 / 接线)");
            Check(EndlessRules.ChapterOfLoop(0) == 1 && EndlessRules.ChapterOfLoop(3) == 1
                  && EndlessRules.ChapterOfLoop(4) == 2,
                "章节按 1→2→3→1 循环(无尽复用三章内容,不做第四章)");
            Check(EndlessRules.ChapterOfLoop(-1) == 3, "负数循环也给合法章节(坏档不该进不去游戏)");

            var m0 = EndlessRules.LoopMultsOf(0);
            var m1 = EndlessRules.LoopMultsOf(1);
            var m2 = EndlessRules.LoopMultsOf(2);
            Check(m0.Hp == 1f && m0.Loot == 1f, "循环 0 全中性(第一遍三章 = 普通远征)");
            Check(m1.Hp > 1f && m2.Hp > m1.Hp, "怪血乘区随循环递增");
            Check(m1.Loot > 1f && m1.Loot < m1.Hp, "掉落也涨,但涨得比血量慢");

            // 两道闸门:极端循环数下仍是**有限值**,并且顶到上限(本轮验收门:20 层后仍不崩)
            var mBig = EndlessRules.LoopMultsOf(200000);
            Check(!float.IsNaN(mBig.Hp) && !float.IsInfinity(mBig.Hp) && mBig.Hp <= Bestiary.EndlessMaxMult,
                "极端循环数下乘区封顶而不是溢出成 Infinity");
            var (hpBig, atkBig) = EndlessRules.Apply(200000, 100f, 20f);
            Check(hpBig >= 1f && hpBig <= Bestiary.EndlessMaxHp && !float.IsInfinity(hpBig),
                $"血量顶到上限而不是溢出(实测 {hpBig:0})");
            Check(atkBig == Bestiary.EndlessMaxAtk, $"攻击顶到上限 {Bestiary.EndlessMaxAtk:0}");
            Check(EndlessRules.SafeHp(float.NaN) >= 1f && EndlessRules.SafeAtk(float.PositiveInfinity) >= 1f,
                "NaN/Infinity 进闸门也出得来有限值(不会污染伤害公式)");

            // 纪录:只增不减、负数不污染
            var rec = EndlessRules.RecordRun(23, 2, 10, 1);
            Check(rec.bestFloor == 23 && rec.bestLoop == 2, "刷新纪录取更大的值");
            Check(EndlessRules.RecordRun(5, 0, 23, 2).bestFloor == 23, "打得更差不会把纪录改小");
            Check(!EndlessRules.IsNewRecord(23, 23) && EndlessRules.IsNewRecord(24, 23), "平纪录不算刷新");

            // 接线一:真实 RunManagerLite 里 Boss 房清空 = 进下一循环(不是通关)
            var w = new LogicWorld();
            MakePlayer(w);
            var run = new RunManagerLite();
            int loops = 0;
            run.OnLoop = () => { loops++; run.NextLoop(w); };
            run.SetChapter(1);
            run.SetEndless(true);
            Check(run.Floor == 1, "开局是第 1 层");
            for (int i = 0; i < 8; i++) run.NextRoom(w);
            Check(run.Room == RoomKind.Boss, "第 8 间是 Boss 房");
            Check(run.Floor == 9, $"第 8 间打完在第 9 层(实测 {run.Floor})");
            run.Tick(w);
            Check(loops == 1 && run.Loop == 1, "Boss 房清空进入下一循环(无尽没有通关)");
            Check(run.CurrentChapter == 2, "循环 1 接第 2 章(内容循环,复用三章)");
            Check(run.Room == RoomKind.Battle && run.Cleared == false, "新循环从第一间战斗房开始");
            Check(run.Floor > 9, "层数跨循环继续累加(不重置玩家的进度感受)");

            // 挑战局口径:不开无尽时 Boss 清空走 OnVictory(老行为不变)
            var w2 = new LogicWorld();
            MakePlayer(w2);
            var runV = new RunManagerLite();
            int victories = 0;
            runV.OnVictory = () => victories++;
            runV.SetChapter(1);
            for (int i = 0; i < 8; i++) runV.NextRoom(w2);
            runV.Tick(w2);
            Check(victories == 1 && runV.Loop == 0, "普通局 Boss 清空仍是通关(挑战/普通不受无尽影响)");

            // 接线二:同一只怪的血量随循环放大(出怪种类随机,必须比同一只)
            var probe = Bestiary.Of(EnemyKind.Shroomling);
            var plain = new RunManagerLite();
            plain.SetChapter(1);
            var endless3 = new RunManagerLite();
            endless3.SetChapter(1);
            endless3.SetEndless(true);
            for (int i = 0; i < 3; i++) endless3.NextLoop(w2);
            Check(endless3.CurrentChapter == 1, "循环 3 回到第 1 章(章节循环闭合)");
            var (hpA, _) = plain.Scale(probe, false, false);
            var (hpB, _) = endless3.Scale(probe, false, false);
            Near(hpB / hpA, (float)Math.Pow(Bestiary.EndlessLoopHp, 3), 1f / hpA + 1e-3f,
                $"循环 3 下同一只怪血量是普通远征的 {Bestiary.EndlessLoopHp:0.##}^3 倍,±1 点取整(实测 {hpB / hpA:0.###})");
            Check(plain.LootMult == 1f && endless3.LootMult > 1f, "掉落乘区随循环走(普通局中性)");

            // 接线三:无尽 × 深渊可以叠(两道乘区相乘,仍走同一处闸门)
            var deep = new RunManagerLite();
            deep.SetChapter(1);
            deep.SetEndless(true);
            deep.SetAbyss(3);
            for (int i = 0; i < 3; i++) deep.NextLoop(w2);
            var (hpC, _) = deep.Scale(probe, false, false);
            Near(hpC / hpA, (float)Math.Pow(Bestiary.EndlessLoopHp, 3) * Bestiary.AbyssLevels2HpMult, 1f / hpA + 1e-3f,
                "深渊 × 无尽的乘区相乘(叠加后仍有限、仍过闸门;±1 点取整)");
            Check(hpC <= Bestiary.EndlessMaxHp, "叠了两档乘区也不会越过闸门");
        }

        // ---------------- 预警区域 ----------------

        private static void TestTelegraphs()
        {
            Suite("预警区域(敌方/玩家侧)");
            var w = new LogicWorld();
            var p = MakePlayer(w, Vector2.Zero);
            float hp0 = p.Unit.Hp;
            TelegraphSystem.Add(w, Vector2.Zero, 1.5f, 0.5f, 20f, 1f, Element.Ice, true);
            Advance(w, 0.4f);
            Near(p.Unit.Hp, hp0, 0.001f, "预警期内不结算(留反应窗口)");
            Advance(w, 0.2f);
            Check(p.Unit.Hp < hp0, "到点结算伤害");

            var w2 = new LogicWorld();
            var p2 = MakePlayer(w2, Vector2.Zero);
            TelegraphSystem.Add(w2, new Vector2(5f, 0f), 1.0f, 0.2f, 20f, 1f, null, true);
            Advance(w2, 0.4f);
            Near(p2.Unit.Hp, 100f, 0.001f, "站在圈外不受伤");

            var w3 = new LogicWorld();
            var p3 = MakePlayer(w3, Vector2.Zero);
            w3.PlayerInvulnerable = true;
            TelegraphSystem.Add(w3, Vector2.Zero, 1.5f, 0.1f, 20f, 1f, null, true);
            Advance(w3, 0.3f);
            Near(p3.Unit.Hp, 100f, 0.001f, "无敌帧内预警伤害被吃掉");

            var w4 = new LogicWorld();
            MakePlayer(w4, Vector2.Zero);
            var e4 = MakeEnemy(w4, new Vector2(0.5f, 0f), 400f);
            TelegraphSystem.Add(w4, Vector2.Zero, 1.5f, 0.1f, 20f, 1.0f, Element.Ice, false, 1.0f, 0.25f, 0.4f);
            Advance(w4, 0.5f);
            Check(e4.Unit.Hp < 400f, "玩家侧预警命中敌人");
            Check(w4.Zones.Count == 1 && w4.Zones[0].Element == Element.Ice, "预警结算后留下冰雾地带");
        }

        // ---------------- 方向性弱点 ----------------

        private static void TestWeakspots()
        {
            Suite("方向性弱点(傀儡绕背 / 冰龟正面)");
            var w = new LogicWorld();
            var p = MakePlayer(w, new Vector2(0f, 0f), 100f);

            var golem = MakeEnemy(w, new Vector2(1.5f, 0f), 5000f);
            golem.Unit.BackstabMult = Bestiary.OakGolemBackstabMult;
            golem.Unit.FaceRad = 0f; // 面朝 +X
            int front = DamagePipeline.Deal(new DealOpts
            {
                Source = p.Unit, Target = golem.Unit, Mult = 1f, CanCrit = false,
                HasHitAngle = true, HitAngleRad = MathF.PI,
            });
            int back = DamagePipeline.Deal(new DealOpts
            {
                Source = p.Unit, Target = golem.Unit, Mult = 1f, CanCrit = false,
                HasHitAngle = true, HitAngleRad = 0f,
            });
            Check(back > front, $"傀儡绕背伤害更高(正面 {front} < 背面 {back})");
            Near(back / (float)front, Bestiary.OakGolemBackstabMult, 0.05f, "绕背倍率 = 2.0");

            var turtle = MakeEnemy(w, new Vector2(1.5f, 0f), 5000f);
            turtle.Unit.FrontDR = Bestiary.IceTurtleFrontDR;
            turtle.Unit.FaceRad = 0f;
            int tFront = DamagePipeline.Deal(new DealOpts
            {
                Source = p.Unit, Target = turtle.Unit, Mult = 1f, CanCrit = false,
                HasHitAngle = true, HitAngleRad = MathF.PI,
            });
            int tBack = DamagePipeline.Deal(new DealOpts
            {
                Source = p.Unit, Target = turtle.Unit, Mult = 1f, CanCrit = false,
                HasHitAngle = true, HitAngleRad = 0f,
            });
            Check(tFront < tBack, $"冰壳龟正面减伤生效(正面 {tFront} < 背面 {tBack})");
            Near(tFront / (float)tBack, 1f - Bestiary.IceTurtleFrontDR, 0.06f, "正面伤害 ×0.5");
        }

        // ---------------- 杂兵 AI ----------------

        private static void TestCreatureAI()
        {
            Suite("杂兵 AI(炮台/风筝/滚撞/钻地/精灵)");
            var ai = new CreatureAI();

            {
                var w = new LogicWorld();
                MakePlayer(w, Vector2.Zero);
                var vine = MakeEnemy(w, new Vector2(4f, 0f), 500f);
                vine.Kind = EnemyKind.ThornVine;
                for (int i = 0; i < 180; i++) ai.Update(w, 1f / 60f);
                Check(w.Telegraphs.Count > 0, "荆棘藤妖在玩家脚下放地刺预警");
                Near(vine.Pos.X, 4f, 0.01f, "藤妖不移动(固定炮台)");
            }

            {
                var w = new LogicWorld();
                MakePlayer(w, Vector2.Zero);
                var mage = MakeEnemy(w, new Vector2(1.0f, 0f), 500f);
                mage.Kind = EnemyKind.FrostMage;
                float d0 = Vector2.Distance(mage.Pos, w.Player.Pos);
                for (int i = 0; i < 300; i++) ai.Update(w, 1f / 60f);
                float d1 = Vector2.Distance(mage.Pos, w.Player.Pos);
                Check(d1 >= d0, $"法师与玩家保持距离({d0:0.00}m → {d1:0.00}m)");
            }

            {
                var w = new LogicWorld();
                MakePlayer(w, new Vector2(0f, 3f));
                var puff = MakeEnemy(w, Vector2.Zero, 500f);
                puff.Kind = EnemyKind.SnowPuff;
                float maxSpeed = 0f;
                for (int i = 0; i < 400; i++)
                {
                    ai.Update(w, 1f / 60f);
                    maxSpeed = MathF.Max(maxSpeed, puff.Vel.Length());
                }
                Check(maxSpeed >= Bestiary.SnowPuffRollSpeedM - 0.01f, $"雪绒球会滚撞(峰值 {maxSpeed:0.0} m/s)");
            }

            {
                var w = new LogicWorld();
                MakePlayer(w, new Vector2(0f, 4f));
                var beetle = MakeEnemy(w, Vector2.Zero, 500f);
                beetle.Kind = EnemyKind.DuneBeetle;
                bool sawTelegraph = false;
                float startDist = Vector2.Distance(beetle.Pos, w.Player.Pos);
                for (int i = 0; i < 900; i++)
                {
                    ai.Update(w, 1f / 60f);
                    if (w.Telegraphs.Count > 0) sawTelegraph = true;
                }
                Check(sawTelegraph, "沙暴甲虫钻出前会预警");
                Check(Vector2.Distance(beetle.Pos, w.Player.Pos) < startDist, "甲虫地下阶段会接近玩家");
            }

            {
                var w = new LogicWorld();
                MakePlayer(w, Vector2.Zero);
                var sprite = MakeEnemy(w, new Vector2(2f, 0f), 20f);
                sprite.Kind = EnemyKind.StardustSprite;
                float d0 = Vector2.Distance(sprite.Pos, w.Player.Pos);
                for (int i = 0; i < 120; i++) ai.Update(w, 1f / 60f);
                Check(Vector2.Distance(sprite.Pos, w.Player.Pos) > d0, "星尘精灵会逃离玩家");
                for (int i = 0; i < 700; i++) ai.Update(w, 1f / 60f);
                Check(sprite.Unit.Dead, "精灵存活到期后自行消失");
            }

            {
                // 回归:三个 Boss 必须由 BossAI 独占驱动,CreatureAI 不能碰
                var w = new LogicWorld();
                MakePlayer(w, new Vector2(0f, 6f));
                var velsha = MakeEnemy(w, new Vector2(4f, 0f), 5000f);
                velsha.Kind = EnemyKind.BossVelsha;
                var kazra = MakeEnemy(w, new Vector2(2f, 0f), 5000f);
                kazra.Kind = EnemyKind.BossKazra;
                var nanmir = MakeEnemy(w, new Vector2(3f, 0f), 5000f);
                nanmir.Kind = EnemyKind.BossNanmir;
                for (int i = 0; i < 60; i++) ai.Update(w, 1f / 60f);
                Near(velsha.Vel.Length(), 0f, 1e-4f, "薇尔莎不受杂兵 AI 驱动(速度由 BossAI 决定)");
                Near(kazra.Vel.Length(), 0f, 1e-4f, "卡兹拉不受杂兵 AI 驱动");
                Near(nanmir.Vel.Length(), 0f, 1e-4f, "南弥尔不受杂兵 AI 驱动(改用四套招式)");
            }

            {
                var w = new LogicWorld();
                MakePlayer(w, new Vector2(0f, 5f));
                var rat = MakeEnemy(w, Vector2.Zero, 100f);
                rat.Kind = EnemyKind.CinderRat;
                rat.Unit.StunT = 1.0f;
                ai.Update(w, 1f / 60f);
                Near(rat.Vel.Length(), 0f, 0.001f, "眩晕时怪物不移动");
                rat.Unit.StunT = 0f;
                ai.Update(w, 1f / 60f);
                float normal = rat.Vel.Length();
                rat.Unit.SlowT = 2f;
                rat.Unit.SlowPct = 0.5f;
                ai.Update(w, 1f / 60f);
                Check(rat.Vel.Length() < normal + 0.001f, "减速状态下速度不超过常态");
            }
        }

        // ---------------- Boss AI ----------------

        /// <summary>
        /// 触屏辅助瞄准(10-FULL-PLAN 轮 7 的 Unity 镜像)。
        /// 用**真实 Actor** 跑规则,不是只对纯函数做数学验证 —— 手感规则必须在逻辑世界成立。
        /// </summary>
        private static void TestAimAssist()
        {
            Suite("触屏辅助瞄准(范围 / 粘性 / 续瞄)");

            var w = new LogicWorld();
            MakePlayer(w, new Vector2(0f, 0f));
            var near = MakeEnemy(w, new Vector2(3f, 0f));
            var mid = MakeEnemy(w, new Vector2(6f, 0f));
            var far = MakeEnemy(w, new Vector2(30f, 0f)); // 远超锁定范围

            // 1) 范围内选最近的;范围外(30m)不参与
            Check(ReferenceEquals(AimRules.Pick(w.Enemies, Vector2.Zero, null), near), "范围内选最近的敌人");
            Check(!ReferenceEquals(AimRules.Pick(w.Enemies, Vector2.Zero, null), far), "范围外的敌人不抢准星");

            // 2) 粘性:已锁 6m 的 mid,最近的是 3m 的 near —— 差距 3m ≤ sticky 3m → 继续锁 mid
            Check(ReferenceEquals(AimRules.Pick(w.Enemies, Vector2.Zero, mid), mid), "粘性:差距在余量内不换目标");
            // 把 near 挪近到 1m(差距 5m > 3m)→ 该换目标了
            near.Pos = new Vector2(1f, 0f);
            Check(ReferenceEquals(AimRules.Pick(w.Enemies, Vector2.Zero, mid), near), "粘性有上限:差距过大照样换");
            Check(ReferenceEquals(AimRules.Pick(w.Enemies, Vector2.Zero, far), near), "已锁目标出范围 → 不返回它");

            // 3) 方向 + 单位长度(零距离不产生 NaN)
            var dir = AimRules.Dir(Vector2.Zero, new Vector2(0f, 5f));
            Check(MathF.Abs(dir.X) < 1e-5f && MathF.Abs(dir.Y - 1f) < 1e-5f, "方向朝目标(0,1)");
            var zero = AimRules.Dir(Vector2.Zero, Vector2.Zero);
            Check(!float.IsNaN(zero.X) && !float.IsNaN(zero.Y), "零距离不产生 NaN");

            // 4) 续瞄:目标全清后先续 aimLatchS 秒,再用完交还(朝移动方向的兜底由调用方做)
            var aim = new AimAssist();
            var first = aim.Update(w, Vector2.Zero, 1f / 60f);
            Check(first.HasValue && ReferenceEquals(aim.Locked, near), "锁定 1m 的敌人");
            Check(MathF.Abs(first.Value.X - 1f) < 1e-5f, "瞄准方向指向目标");
            w.Enemies.Clear();
            var latched = aim.Update(w, Vector2.Zero, 0.2f);
            Check(latched.HasValue && MathF.Abs(latched.Value.X - 1f) < 1e-5f, "目标消失后仍续瞄原方向");
            Check(aim.Locked == null, "续瞄期间没有锁定对象(HUD 不画锁定圈)");
            aim.Update(w, Vector2.Zero, 0.2f);
            Check(!aim.Update(w, Vector2.Zero, 0.2f).HasValue, "续瞄用尽 → 交还兜底");
            Check(!aim.Aiming, "交还后不再是瞄准状态");

            // 5) reset 必须清干净(换房/复活会复用 Actor 引用,不清就会锁上一局)
            MakeEnemy(w, new Vector2(2f, 0f));
            aim.Update(w, Vector2.Zero, 1f / 60f);
            Check(aim.Locked != null, "重新拿到目标");
            aim.Reset();
            Check(aim.Locked == null && aim.LatchT == 0f && !aim.Aiming, "Reset 清干净(锁定 + 续瞄计时)");

            // 6) 有效射程:近战 = 攻距;远程 = 飞行距离 × shotReachFrac
            Near(AimRules.AutoAttackRangeM(HeroClass.Blade), BasicAttack.ComboOf(HeroClass.Blade).RangeM, 1e-4f,
                "剑士自动攻击射程 = 普攻攻距");
            var shot = BasicAttack.ShotOf(HeroClass.Ranger);
            Near(AimRules.AutoAttackRangeM(HeroClass.Ranger),
                shot.SpeedM * shot.LifeS * Bestiary.TouchShotReachFrac, 1e-4f, "猎手 = 飞行距离 × 比例");
            Check(AimRules.AutoAttackRangeM(HeroClass.Ranger) < shot.SpeedM * shot.LifeS, "远程射程短于满飞行距离(不空挥)");
            Check(AimRules.AutoAttackRangeM(HeroClass.Blade) < AimRules.DefaultRangeM
                && AimRules.AutoAttackRangeM(HeroClass.Ranger) < AimRules.DefaultRangeM,
                $"锁定范围({AimRules.DefaultRangeM} m)盖得住四职业普攻");
            Check(AimRules.InAutoRange(3f, 3f) && !AimRules.InAutoRange(3.5f, 3f), "判死线:射程 + 余量内才开火");
        }

        /// <summary>角色动作序列(10-FULL-PLAN 轮 27 动画批次 1 的 Unity 镜像)。</summary>
        private static void TestAnim()
        {
            Suite("角色动作序列(帧号 / 优先级 / 循环口径 / 起伏)");

            // 动作清单与优先级:7 个动作全覆盖、无重复、死亡最高
            Check(AnimRules.Priority.Length == 7, $"优先级覆盖 7 个动作(实际 {AnimRules.Priority.Length})");
            Check(new HashSet<AnimAction>(AnimRules.Priority).Count == 7, "优先级无重复");
            Check(AnimRules.Priority[0] == AnimAction.Die, "死亡优先级最高");

            // 状态 → 动作
            Check(AnimRules.ActionOf(false, false, false, false, false, false) == AnimAction.Idle, "什么都不做 = 待机");
            Check(AnimRules.ActionOf(false, false, false, false, false, true) == AnimAction.Walk, "移动 = 走路");
            Check(AnimRules.ActionOf(false, false, false, false, true, true) == AnimAction.Hurt, "受击压过移动");
            Check(AnimRules.ActionOf(false, false, true, false, false, true) == AnimAction.Atk, "攻击压过移动");
            Check(AnimRules.ActionOf(false, true, true, false, false, false) == AnimAction.Dash, "翻滚压过攻击");
            Check(AnimRules.ActionOf(true, true, true, false, false, true) == AnimAction.Die, "死亡压过一切");

            // 普攻形态:远程职业的普攻就是 Cast(与 web attackAction 同名同义)
            Check(AnimRules.AttackAction(false) == AnimAction.Atk, "近战普攻走 atk");
            Check(AnimRules.AttackAction(true) == AnimAction.Cast, "远程普攻走 cast(拉弓序列就是猎手的普攻序列)");
            Check(AnimRules.ActionOf(false, false, true, false, false, false, AnimRules.AttackAction(true)) == AnimAction.Cast,
                "形态参数一路传到 ActionOf:远程普攻不会被判成 atk");
            Check(AnimRules.ActionOf(false, false, true, false, false, true, AnimRules.AttackAction(true)) == AnimAction.Cast,
                "边走边射也播拉弓");
            Check(AnimRules.ActionOf(false, false, true, false, true, false) == AnimAction.Atk,
                "普攻压过受击(优先级表 die > dash > atk > cast > hurt,别凭直觉写)");

            // 帧号:循环取模、一次性停末帧、坏数据不产生 NaN
            Check(AnimRules.FrameIndex(0f, 8f, 4, true) == 0, "循环:第 0 帧");
            Check(AnimRules.FrameIndex(0.13f, 8f, 4, true) == 1, "循环:第 1 帧(1/8 秒之后)");
            Check(AnimRules.FrameIndex(0.5f, 8f, 4, true) == 0, "循环:一圈回到第 0 帧");
            Check(AnimRules.FrameIndex(99f, 15f, 3, false) == 2, "一次性:停在最后一帧(不循环)");
            Check(AnimRules.FrameIndex(-0.3f, 8f, 4, true) >= 0, "负时间安全");
            Check(AnimRules.FrameIndex(0.5f, 8f, 1, true) == 0, "单帧序列恒为 0");
            Check(AnimRules.FrameIndex(0.5f, 8f, 0, true) == 0, "帧数写错成 0 也返回合法下标");

            // 循环口径:只有待机/走路
            Check(AnimRules.Loop(AnimAction.Idle) && AnimRules.Loop(AnimAction.Walk), "待机与走路循环");
            Check(!AnimRules.Loop(AnimAction.Atk) && !AnimRules.Loop(AnimAction.Dash) && !AnimRules.Loop(AnimAction.Die),
                "攻击/翻滚/死亡不循环");

            // 帧名与 web 美术管线一致(1 起、小写动作段)
            Check(AnimRules.FrameName("knight", AnimAction.Walk, 1) == "knight_walk_1", "帧名 = {base}_{action}_{i}(1 起)");
            Check(AnimRules.FrameName("ranger", AnimAction.Atk, 3) == "ranger_atk_3", "帧名动作段小写");

            // 走路起伏:站着为 0、走路在 ±幅度内、每步一次
            Check(AnimRules.BobPx(0.2f, false) == 0f, "站着不起伏");
            Check(MathF.Abs(AnimRules.BobPx(0.2f, true)) <= Bestiary.AnimBobAmplitudePx + 1e-4f, "走路起伏不超幅度");
            float stepsPerS = Bestiary.AnimWalkFps / Bestiary.AnimWalkFrames;
            Near(AnimRules.BobPx(0f, true), AnimRules.BobPx(1f / stepsPerS, true), 1e-4f, "起伏周期 = 一步");

            // ---- 动作时钟(剩余 → 已进行;web 侧 clocksOf / clockFor 的镜像)----
            // 这条映射是 web 侧真踩过的坑:漏一个字段 = 那个动作永远停在第 1 帧(拉弓僵住,像美术坏了)
            Near(AnimRules.Elapsed(0.1f, 0.3f) ?? -1f, 0.2f, 1e-5f, "剩余 0.1 / 总 0.3 → 已进行 0.2");
            Check(AnimRules.Elapsed(0f, 0.3f) == null, "剩余 ≤ 0 = 动作没在进行 → null");
            Check(AnimRules.Elapsed(-0.5f, 0.3f) == null, "负剩余也 → null");
            Check(AnimRules.Elapsed(null, 0.3f) == null && AnimRules.Elapsed(0.1f, null) == null, "缺字段 → null");

            var clk = AnimRules.ClocksOf(0.05f, 0.22f, 0.1f, 0.2f, 0.02f, 0.1f, 0.3f, 1.5f);
            Near(clk.DashT ?? -1f, 0.17f, 1e-5f, "翻滚时钟");
            Near(clk.AttackT ?? -1f, 0.1f, 1e-5f, "普攻时钟");
            Near(clk.CastT ?? -1f, clk.AttackT ?? -2f, 1e-5f, "远程普攻就是 cast —— 与普攻共用计时器");
            Near(clk.HurtT ?? -1f, 0.08f, 1e-5f, "受击时钟");
            Near(clk.DieT ?? -1f, 1.2f, 1e-5f, "死亡时钟(走复活倒计时)");

            var idleClk = AnimRules.ClocksOf(0f, 0.22f, 0f, 0.2f, null, null, null, null);
            Check(idleClk.DashT == null && idleClk.AttackT == null, "全为 0 → 全 null(不产生 NaN)");
            Check(AnimRules.ClockFor(AnimAction.Dash, 12f, idleClk) == 0f, "动作没在进行 → 时钟归 0 = 第 1 帧");

            // clockFor:循环动作吃全局时间;一次性动作吃自己的时钟并夹在 [0, 总时长]
            Check(AnimRules.ClockFor(AnimAction.Walk, 12.34f, clk) == 12.34f, "循环动作吃全局时间");
            Near(AnimRules.ClockFor(AnimAction.Dash, 99f, clk), 0.17f, 1e-5f, "一次性动作不吃全局时间");
            Near(AnimRules.ClockFor(AnimAction.Atk, 0f, new AnimRules.AnimClocks { AttackT = 99f }),
                AnimRules.CycleSec(AnimAction.Atk), 1e-4f, "超出总时长夹住");
            Check(AnimRules.ClockFor(AnimAction.Atk, 0f, new AnimRules.AnimClocks { AttackT = -3f }) == 0f,
                "负时钟夹到 0");
            Check(AnimRules.ClockFor(AnimAction.Cast, 7f, default(AnimRules.AnimClocks)) == 0f,
                "缺计时器按 0 处理(不产生 NaN)");

            // 两帧资产(杂兵走路):节奏推导自走路规格,不是手写常数
            Near(AnimRules.CycleSec(AnimAction.Walk), Bestiary.AnimWalkFrames / Bestiary.AnimWalkFps, 1e-5f,
                "走路一圈 = 帧数 / 帧率");
            float flipGap = AnimRules.CycleSec(AnimAction.Walk) / 2f;
            Near(flipGap, 2f / Bestiary.AnimWalkFps, 1e-5f, "两帧步长 = 每两个走路帧翻一次");
            Check(!AnimRules.TwoFrameFlip(0f), "第 0 帧是站立帧");
            Check(AnimRules.TwoFrameFlip(flipGap + 0.01f), "过了半圈翻到 f2 帧");
            Check(!AnimRules.TwoFrameFlip(2f * flipGap + 0.01f), "再过半圈翻回来(循环)");
            Check(!AnimRules.TwoFrameFlip(flipGap + 0.01f, false), "站着不动不翻帧(原地抖腿像卡了)");
            Check(AnimRules.TwoFrameName("windbee", 0f, false) == "windbee", "没有 f2 资产 → 退回站立单帧");
            Check(AnimRules.TwoFrameName("windbee", flipGap + 0.01f, true) == "windbee_f2", "有 f2 资产按节奏翻帧");
        }

        /// <summary>
        /// 远程普攻运行时(ShotRuntime)—— 普攻档案以前只镜了"数值",没镜"打出去"。
        /// 这一套测的是**行为**:射速节流、每第 4 发强化、穿透能连打两个、溅射按减伤倍率对待第二个目标。
        /// </summary>
        private static void TestShotAttack()
        {
            Suite("远程普攻运行时(射击节流 / 强化发 / 穿透 / 溅射)");

            // 猎手:第一发打出、冷却内打不出、冷却走完又能打
            var w = new LogicWorld();
            var p = MakePlayer(w, new Vector2(0f, 0f), atk: 100f);
            var spec = BasicAttack.ShotOf(HeroClass.Ranger);
            var shot = new ShotRuntime();
            Check(shot.TryFire(w, p.Pos, new Vector2(1f, 0f), spec), "冷却好了就能打");
            Check(w.Projectiles.Count == 1, "打出一发生成一颗弹丸");
            Check(!shot.TryFire(w, p.Pos, new Vector2(1f, 0f), spec), "冷却没过打不出第二发(节流)");
            shot.Tick(spec.RateS + 0.001f);
            Check(shot.TryFire(w, p.Pos, new Vector2(1f, 0f), spec), "冷却走完能接着打");

            // 弹丸参数:速度/半径/寿命来自档案,枪口有偏移(不在自己身体里出生)
            var pr = w.Projectiles[0];
            Near(pr.Vel.Length(), spec.SpeedM, 1e-3f, "弹速 = 档案 speedM");
            Check(pr.Pos.X > p.Pos.X, "枪口沿瞄准方向偏移(贴脸时不会打在自己身上)");

            // 每第 4 发强化:倍率 ×heavyMult、半径 ×1.6、带穿透
            var w2 = new LogicWorld();
            var p2 = MakePlayer(w2, new Vector2(0f, 0f), atk: 100f);
            var s2 = new ShotRuntime();
            for (int i = 0; i < 4; i++)
            {
                Check(s2.TryFire(w2, p2.Pos, new Vector2(1f, 0f), spec), $"第 {i + 1} 发打出");
                s2.Tick(spec.RateS + 0.001f);
            }
            // 注意 LastStep 是**最近一发**(第 4 发 = 强化),所以"前 3 发普通"要看弹丸自己的倍率
            Near(w2.Projectiles[0].Mult, spec.Mult, 1e-3f, "第 1 发是普通倍率");
            Near(w2.Projectiles[2].Mult, spec.Mult, 1e-3f, "第 3 发仍是普通倍率");
            Check(s2.LastStep.Heavy, "第 4 发是强化发");
            var heavy = w2.Projectiles[3];
            Near(heavy.Mult, spec.Mult * spec.HeavyMult, 1e-3f, "第 4 发倍率 = mult × heavyMult");
            Near(heavy.RadiusM, spec.RadiusM * 1.6f, 1e-3f, "强化发半径 ×1.6");
            Check(heavy.Pierce > 0, "强化发带穿透");
            Check(w2.Projectiles[0].Pierce == 0, "普通发不穿透");

            // 穿透:一发强化箭连打两个目标后还在飞(扣 1 次穿透)
            var w3 = new LogicWorld();
            var p3 = MakePlayer(w3, new Vector2(0f, 0f), atk: 100f);
            var near = MakeEnemy(w3, new Vector2(0.5f, 0f), hp: 1000f);
            var far = MakeEnemy(w3, new Vector2(1.2f, 0f), hp: 1000f);
            var s3 = new ShotRuntime();
            for (int i = 0; i < 4; i++) { s3.TryFire(w3, p3.Pos, new Vector2(1f, 0f), spec); s3.Tick(spec.RateS + 0.001f); }
            var arrow = w3.Projectiles[3];
            float halfHp = near.Unit.Hp;
            ProjectileSystem.Tick(w3, 0.02f);
            Check(near.Unit.Hp < 1000f, "第一只被打中");
            Check(!arrow.Dead && w3.Projectiles.Contains(arrow), "穿透箭命中后继续飞(没被销毁)");
            Check(arrow.Pierce == spec.Pierce - 1, "穿透次数扣 1");
            ProjectileSystem.Tick(w3, 0.02f);
            Check(far.Unit.Hp < 1000f, "继续飞还能打中第二只");

            // 溅射:秘术师法球对第二个目标的伤害 = 直击 × splashMult(减伤版)
            var w4 = new LogicWorld();
            var p4 = MakePlayer(w4, new Vector2(0f, 0f), atk: 100f);
            var target = MakeEnemy(w4, new Vector2(1.0f, 0f), hp: 1000f);
            var bystander = MakeEnemy(w4, new Vector2(1.0f, 0.5f), hp: 1000f);
            var arc = BasicAttack.ShotOf(HeroClass.Arcanist);
            var s4 = new ShotRuntime();
            Check(s4.TryFire(w4, p4.Pos, new Vector2(1f, 0f), arc), "秘术师打出法球");
            var orb = w4.Projectiles[0];
            for (int i = 0; i < 60 && !orb.Dead && w4.Projectiles.Count > 0; i++) ProjectileSystem.Tick(w4, 1f / 60f);
            float direct = 1000f - target.Unit.Hp;
            float splash = 1000f - bystander.Unit.Hp;
            Check(direct > 0f, $"直击有伤害({direct:0})");
            Check(splash > 0f, $"旁边那只也被溅射到({splash:0})");
            Near(splash / direct, arc.SplashMult, 0.02f, $"溅射 = 直击 × {arc.SplashMult}(减伤版)");

            // 出招减速:猎手可走射、秘术师慢
            Check(ShotRuntime.MoveSlowOf(spec) >= 1f, "猎手走射不减速");
            Check(ShotRuntime.MoveSlowOf(arc) < 1f, "秘术师施法减速");
        }

        /// <summary>
        /// 玩家动画接线(Core/PlayerAnim)—— 这段逻辑放 Core 就是为了能被这里驱动:
        /// Unity 的 MonoBehaviour 层不在测试工程里编译,规则写在里面等于没有测试(web 漏 `castT` 的坑)。
        /// </summary>
        private static void TestPlayerAnim()
        {
            Suite("玩家动画接线(动作判定 / 帧名 / 远程普攻走 cast)");

            // 形态:远程职业判定的唯一入口
            Check(PlayerAnim.IsShotClass(HeroClass.Ranger) && PlayerAnim.IsShotClass(HeroClass.Arcanist), "远程职业 = 猎手/秘术师");
            Check(!PlayerAnim.IsShotClass(HeroClass.Blade) && !PlayerAnim.IsShotClass(HeroClass.Warden), "近战职业 = 剑士/守卫");

            // 猎手射箭:动作是 Cast,帧名落在 ranger_cast_* 上(普攻走 cast 的代码口径)
            string fire = PlayerAnim.Frame(
                "ranger", isShot: true, globalT: 12.3f,
                dashT: 0f, dashDur: 0.22f, attackT: 0.5f, attackDur: 0.5f, hurt: false, moving: false);
            Check(fire.StartsWith("ranger_cast_"), $"远程普攻播拉弓序列(实际 {fire})");
            string fireMid = PlayerAnim.Frame(
                "ranger", isShot: true, globalT: 12.3f,
                dashT: 0f, dashDur: 0.22f, attackT: 0.35f, attackDur: 0.5f, hurt: false, moving: false);
            Check(fireMid != fire, $"拉弓会真的换帧(第 1 帧 {fire} vs 中段 {fireMid})");

            // 近战普攻:走 atk 序列
            string slash = PlayerAnim.Frame(
                "knight", isShot: false, globalT: 3f,
                dashT: 0f, dashDur: 0.22f, attackT: 0.2f, attackDur: 0.2f, hurt: false, moving: false);
            Check(slash.StartsWith("knight_atk_"), $"近战普攻播挥砍序列(实际 {slash})");

            // 优先级:翻滚压过普攻、死亡压过一切
            string dash = PlayerAnim.Frame(
                "ranger", isShot: true, globalT: 1f,
                dashT: 0.2f, dashDur: 0.22f, attackT: 0.3f, attackDur: 0.5f, hurt: false, moving: true);
            Check(dash.StartsWith("ranger_dash_"), $"翻滚压过普攻(实际 {dash})");
            Check(PlayerAnim.Action(true, 0.2f, 0.3f, false, true, dead: true) == AnimAction.Die, "死亡压过一切");

            // 走路:循环动作吃全局时间(换房/暂停后时间轴不会错位)
            string w1 = PlayerAnim.Frame("ranger", true, 0f, 0f, 0.22f, 0f, 0.5f, false, true);
            string w2 = PlayerAnim.Frame("ranger", true, 0.13f, 0f, 0.22f, 0f, 0.5f, false, true);
            Check(w1.StartsWith("ranger_walk_") && w1 != w2, $"走路按全局时间换帧({w1} → {w2})");

            // 计时器归零(动作结束)→ 回到第 1 帧,而不是卡在最后一帧
            string ended = PlayerAnim.Frame(
                "knight", isShot: false, globalT: 9f,
                dashT: 0f, dashDur: 0.22f, attackT: 0f, attackDur: 0.2f, hurt: false, moving: false);
            Check(ended == "knight_idle_1", $"动作结束回待机第 1 帧(实际 {ended})");
        }

        private static void TestBossAI()
        {
            Suite("Boss AI(薇尔莎 / 卡兹拉)");
            var ai = new BossAI();
            var spawned = new List<EnemyKind>();

            {
                var w = new LogicWorld();
                var pTank = MakePlayer(w, new Vector2(0f, 0f));
                pTank.Unit.HpMax = 100000f;
                pTank.Unit.Hp = 100000f;   // 靶子:本测试只看 Boss 行为,不让玩家被打死
                var boss = MakeEnemy(w, new Vector2(4f, 0f), Bestiary.Of(EnemyKind.BossVelsha).Hp);
                boss.Kind = EnemyKind.BossVelsha;
                boss.Unit.Atk = Bestiary.Of(EnemyKind.BossVelsha).Atk;
                ai.SpawnMinion = (k, pos) => spawned.Add(k);
                var phases = new List<int>();
                ai.OnPhaseChanged = (a, ph, msg) => phases.Add(ph);

                for (int i = 0; i < 600; i++) { ai.Update(w, 1f / 60f); w.Tick(1f / 60f); }
                Check(w.Projectiles.Count > 0 || w.Telegraphs.Count > 0, "薇尔莎会丢冰弹环/暴风雪");
                Check(ai.PhaseOf(boss) == 1, "满血时是 P1");

                boss.Unit.Hp = boss.Unit.HpMax * 0.6f;
                ai.Update(w, 1f / 60f);
                Check(ai.PhaseOf(boss) == 2 && phases.Contains(2), "掉到 65% 血进 P2");

                boss.Unit.Hp = boss.Unit.HpMax * 0.25f;
                for (int i = 0; i < 20; i++) ai.Update(w, 1f / 60f);
                Check(ai.PhaseOf(boss) == 3 && phases.Contains(3), "掉到 30% 血进 P3(狂怒)");

                bool icezone = false;
                for (int i = 0; i < 1200; i++)
                {
                    ai.Update(w, 1f / 60f);
                    w.Tick(1f / 60f);
                    foreach (var z in w.Zones) if (z.Element == Element.Ice) icezone = true;
                }
                Check(spawned.Contains(EnemyKind.SnowPuff), "P2 起召唤雪绒球");
                Check(icezone, "暴风雪爆点留下冰雾地带");
            }

            {
                spawned.Clear();
                var ai2 = new BossAI();
                var w2 = new LogicWorld();
                var pTank2 = MakePlayer(w2, new Vector2(0f, 0f));
                pTank2.Unit.HpMax = 100000f;
                pTank2.Unit.Hp = 100000f;
                var boss2 = MakeEnemy(w2, new Vector2(3f, 0f), Bestiary.Of(EnemyKind.BossKazra).Hp);
                boss2.Kind = EnemyKind.BossKazra;
                boss2.Unit.Atk = Bestiary.Of(EnemyKind.BossKazra).Atk;
                ai2.SpawnMinion = (k, pos) => spawned.Add(k);
                boss2.Unit.Hp = boss2.Unit.HpMax * 0.5f;
                ai2.Update(w2, 1f / 60f);
                Check(ai2.PhaseOf(boss2) == 2, "50% 血时处于 P2");

                bool sawTelegraph = false;
                for (int i = 0; i < 1500; i++)
                {
                    ai2.Update(w2, 1f / 60f);
                    w2.Tick(1f / 60f);
                    if (w2.Telegraphs.Count > 0) sawTelegraph = true;
                }
                Check(sawTelegraph, "钻地突袭会留下预警(小心脚下)");
                Check(spawned.Contains(EnemyKind.CinderRat), "会召唤烬鼠群");

                boss2.Unit.Hp = boss2.Unit.HpMax * 0.2f;
                boss2.Pos = new Vector2(2f, 0f);
                // P3 熔痕只在"真的在追人"时出现(web: walk 状态 + 速度 > 20px/s),
                // 所以这里模拟玩家风筝:每帧把玩家拉到 5m 外,让 Boss 一直处于追击移动中
                bool fireTrail = false;
                for (int i = 0; i < 400; i++)
                {
                    pTank2.Pos = boss2.Pos + new Vector2(5f, 0f);
                    ai2.Update(w2, 1f / 60f);
                    w2.Tick(1f / 60f);
                    foreach (var z in w2.Zones) if (z.Element == Element.Fire) fireTrail = true;
                }
                Check(fireTrail, "P3 追击移动时淌下熔痕地带");
            }

            {
                // ---- 腐木巨像·南弥尔:四套招式 + 阶段硬直 ----
                spawned.Clear();
                var ai3 = new BossAI();
                var w3 = new LogicWorld();
                var pTank3 = MakePlayer(w3, new Vector2(0f, 0f));
                pTank3.Unit.HpMax = 100000f;
                pTank3.Unit.Hp = 100000f;
                var nanmir = MakeEnemy(w3, new Vector2(2.5f, 0f), Bestiary.Of(EnemyKind.BossNanmir).Hp);
                nanmir.Kind = EnemyKind.BossNanmir;
                nanmir.Unit.Atk = Bestiary.Of(EnemyKind.BossNanmir).Atk;
                ai3.SpawnMinion = (k, pos) => spawned.Add(k);
                var phases3 = new List<int>();
                ai3.OnPhaseChanged = (a, ph, msg) => phases3.Add(ph);

                // P1:P1 招式轮换(横扫/根须线都会留预警)
                int maxTele = 0;
                for (int i = 0; i < 900; i++)
                {
                    ai3.Update(w3, 1f / 60f);
                    w3.Tick(1f / 60f);
                    maxTele = Math.Max(maxTele, w3.Telegraphs.Count);
                }
                Check(maxTele > 0, "P1 会放藤鞭横扫/根须线(留下预警)");
                Check(ai3.PhaseOf(nanmir) == 1, "满血时是 P1");
                Check(!spawned.Contains(EnemyKind.Shroomling), "P1 不召唤菇灵(P2 才有)");

                // 阶段转换 → 硬直:速度归零(输出窗口)
                nanmir.Unit.Hp = nanmir.Unit.HpMax * 0.6f;
                ai3.Update(w3, 1f / 60f);
                Check(ai3.PhaseOf(nanmir) == 2 && phases3.Contains(2), "掉到 65% 血进 P2");
                Near(nanmir.Vel.Length(), 0f, 1e-4f, "进 P2 瞬间进入硬直(速度归零 = 输出窗口)");

                // P2:召唤菇灵 + 地刺矩阵
                int burst = 0;
                for (int i = 0; i < 2400; i++)
                {
                    ai3.Update(w3, 1f / 60f);
                    w3.Tick(1f / 60f);
                    burst = Math.Max(burst, w3.Telegraphs.Count);
                }
                Check(spawned.Contains(EnemyKind.Shroomling), "P2 会召唤菇灵");
                Check(burst >= (int)Bestiary.BossNanmirSpikegridCount, $"地刺矩阵一次放 {burst} 处预警(≥{Bestiary.BossNanmirSpikegridCount})");

                // P3:根须风暴(三环 + 缺口 → 预警数少于"每环 10 × 3 环")
                nanmir.Unit.Hp = nanmir.Unit.HpMax * 0.2f;
                int stormBurst = 0;
                int full = (int)Bestiary.BossNanmirStormPerRing * 3;
                for (int i = 0; i < 3000; i++)
                {
                    ai3.Update(w3, 1f / 60f);
                    w3.Tick(1f / 60f);
                    stormBurst = Math.Max(stormBurst, w3.Telegraphs.Count);
                }
                Check(ai3.PhaseOf(nanmir) == 3 && phases3.Contains(3), "掉到 30% 血进 P3(狂暴)");
                Check(stormBurst > 0 && stormBurst < full,
                    $"根须风暴留了安全缺口(峰值 {stormBurst} 处 < 满编 {full} 处)");
            }

        }

        // ---------------- 房间序列 ----------------

        private static void TestRunSequence()
        {
            Suite("房间序列(8 房:战/战/宝藏/战/精英/战/战/Boss)");
            var w = new LogicWorld();
            MakePlayer(w);
            var run = new RunManagerLite();
            var spawned = new List<EnemyKind>();
            var rooms = new List<RoomKind>();
            run.OnSpawn = (k, hp, atk, spd) => spawned.Add(k);
            run.OnRoomCleared = r => rooms.Add(r);
            run.OnVictory = () => { };

            bool treasure0 = false, elite0 = false, boss0 = false, mid0 = false;
            for (int d = 0; d < 8; d++)
            {
                Check(run.NextRoom(w), $"第 {d + 1} 房间可进入");
                if (run.Room == RoomKind.Treasure) treasure0 = true;
                if (run.Room == RoomKind.Elite) elite0 = true;
                if (run.Room == RoomKind.MidBoss) mid0 = true;
                if (run.Room == RoomKind.Boss) boss0 = true;
            }
            Check(!run.NextRoom(w), "第 9 次请求返回 false(序列结束)");
            Check(treasure0 && elite0 && boss0, "序列包含 宝藏/精英/Boss 房");
            Check(mid0, "一章序列包含中 Boss 房(第 6 房)");
            Check(spawned.Contains(EnemyKind.MidBossMossstag), "中 Boss 房生成苔冠巨鹿");
            Check(spawned.Contains(EnemyKind.BossNanmir), "一章 Boss 房生成腐木巨像·南弥尔");
            Check(spawned.Count > 20, $"战斗房按预算出怪(本次共 {spawned.Count} 只)");

            // 清房逻辑:敌人清空 → Cleared, Boss 房触发 OnVictory
            var w2 = new LogicWorld();
            MakePlayer(w2);
            var run2 = new RunManagerLite();
            bool won2 = false;
            run2.OnVictory = () => won2 = true;
            var kinds2 = new List<EnemyKind>();
            run2.OnSpawn = (k, hp, atk, spd) => kinds2.Add(k);
            for (int d = 0; d < 8; d++) run2.NextRoom(w2);
            Check(kinds2.Count > 0, "清房链路上确实生成过敌人");
            w2.Enemies.Clear();
            run2.Tick(w2);
            Check(won2, "Boss 房清空 → OnVictory");
        }
    }
}
