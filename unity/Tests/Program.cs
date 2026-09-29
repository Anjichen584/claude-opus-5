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
            Check(all.Count == 9, $"九个模板(战斗 7 + Boss + 静谧,实际 {all.Count})");
            Check(new HashSet<string>(all).Count == all.Count, "模板名无重复");
            Check(RoomLayouts.IsKnown("narrow") && RoomLayouts.IsKnown("boss") && RoomLayouts.IsKnown("calm"), "IsKnown 认得出已知模板");
            Check(!RoomLayouts.IsKnown("volcano") && !RoomLayouts.IsKnown(""), "IsKnown 拒绝未知模板(运行时不留 undefined)");

            int cover = 0;
            foreach (var id in RoomLayouts.Combat) if (RoomLayouts.Weight(id) > 0) cover++;
            Check(cover == RoomLayouts.Combat.Length, "每个战斗模板都有正权重");

            // 战斗房按权重抽:2000 次里每个模板都该露面
            var rng = new Random(2026);
            var seen = new Dictionary<string, int>();
            bool onlyCombat = true;
            for (int i = 0; i < 2000; i++)
            {
                var id = RoomLayouts.Pick(rng, "battle");
                seen[id] = seen.TryGetValue(id, out var n) ? n + 1 : 1;
                if (Array.IndexOf(RoomLayouts.Combat, id) < 0) onlyCombat = false;
            }
            Check(onlyCombat, "战斗房只会抽到战斗模板");
            int missing = 0;
            foreach (var id in RoomLayouts.Combat) if (!seen.ContainsKey(id)) missing++;
            Check(missing == 0, $"七个战斗模板抽样都会出现(缺少 {missing} 个)");

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
            float playerDia = 2f * (Balance.RockBodyRadius + Balance.PlayerBodyRadius);
            Check(RoomLayouts.MinGapM > playerDia, $"散件间距 {RoomLayouts.MinGapM}m 容得下玩家穿过(需 >{playerDia:0.##}m)");
            Check(RoomLayouts.WallSpacingM < playerDia, $"墙砖间距 {RoomLayouts.WallSpacingM}m 小于玩家直径 → 墙是砌死的");
            Check(RoomLayouts.MinCorridorM > 2f * Balance.PlayerBodyRadius, "窄道通道净宽容得下玩家");
            Check(RoomLayouts.EntryClearXM > 2.5f && RoomLayouts.ExitClearXM > 2.5f, "出入口净空盖住玩家落点/传送门");
            Check(RoomLayouts.MaxLooseSolids < RoomLayouts.MaxProps && RoomLayouts.MaxProps >= RoomLayouts.MaxWallProps,
                "物件上限自洽(散件 < 总数,Boss 场留白不超上限)");
            Check(RoomLayouts.Parity.Count == 16, $"layouts 段镜像 16 个数值键(实际 {RoomLayouts.Parity.Count})");
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
            TestTelegraphs();
            TestWeakspots();
            TestCreatureAI();
            TestBossAI();
            TestClassSkillSet();
            TestRoomLayouts();
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
            Near(e.Unit.Marks[Element.Fire], Balance.MarkDurationS, 1e-3f, "印记持续 4s");

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
            Near(hit2 / (float)hit0, Balance.ChainDecay * Balance.ChainDecay, 0.02f, "衰减 = 0.8^depth");

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
                Check(s.CastR(w), "星陨箭雨可施放");
                Near(s.Rage, 0f, 1e-3f, "放完清空怒气");
                Advance(w, 1.5f, s);
                bool rained = false;
                foreach (var a in cluster) if (a.Unit.Hp < 500f) rained = true;
                Check(rained, "箭雨命中前方落点区域的敌人簇");
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
            Suite("符文池(36 枚 / 每技能 3 枚互斥)");
            var all = RunePool.All();
            Check(all.Count == 36, $"共 36 枚(实际 {all.Count})");
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
                if (kv.Value.Count != 3) threeEach = false;
                var els = new HashSet<Element>();
                foreach (var r in kv.Value)
                {
                    if (!r.Element.HasValue) { hasElement = false; continue; }
                    if (!els.Add(r.Element.Value)) exclusive = false;
                }
            }
            Check(threeEach, "每个技能位恰好 3 枚");
            Check(hasElement, "每枚符文都有元素");
            Check(exclusive, "同技能位的 3 枚元素互斥");
            Check(RunePool.ForClass("ranger").Count == 9 && RunePool.ForClass("warden").Count == 9,
                "按职业取用各 9 枚");
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

        // ---------------- 图鉴(收录) ----------------

        private static void TestCodex()
        {
            Suite("图鉴(收录 / 进度 / 存档清洗)");
            var codex = new Codex();
            Check(Codex.EnemyTotal == 21 && Codex.RuneTotal == 36,
                $"条目总数 21 怪 + 36 符文(实际 {Codex.EnemyTotal} + {Codex.RuneTotal})");
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
            Check(Bestiary.Stats.Count == 21, $"图鉴覆盖 21 种敌人(实际 {Bestiary.Stats.Count})");

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

            bool treasure0 = false, elite0 = false, boss0 = false;
            for (int d = 0; d < 8; d++)
            {
                Check(run.NextRoom(w), $"第 {d + 1} 房间可进入");
                if (run.Room == RoomKind.Treasure) treasure0 = true;
                if (run.Room == RoomKind.Elite) elite0 = true;
                if (run.Room == RoomKind.Boss) boss0 = true;
            }
            Check(!run.NextRoom(w), "第 9 次请求返回 false(序列结束)");
            Check(treasure0 && elite0 && boss0, "序列包含 宝藏/精英/Boss 房");
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
