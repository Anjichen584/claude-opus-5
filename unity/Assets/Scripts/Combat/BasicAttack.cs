using System;
using System.Collections.Generic;
using StarfallKnights.Data;
using StarfallKnights.Skills;

namespace StarfallKnights.Combat
{
    /// <summary>
    /// 四职业普攻档案(Unity 镜像;web: web/src/game/combat/BasicAttack.ts;数值: balance.json)。
    ///
    /// 职业差异落在**行为**上而不是只改倍率:
    ///   剑士 blade  : 三段连斩,终结段击退 6m + 前冲 0.6m
    ///   守卫 warden : 三段重击,终结段 ×2.0 + 破甲 2s,前冲仅 0.25m
    ///   猎手 ranger : 连射,走射不减速,每第 4 发强化并穿透 1 个额外目标
    ///   秘术师 arcanist: 慢速法球,命中溅射 0.9m,施法减速到 55%
    ///
    /// 与 web 的 parity 由 ParityTests 直读 JSON 比对(classes.* 段),本文件不写死数值之外的规则。
    /// </summary>
    public static class BasicAttack
    {
        public enum Kind { Combo, Shot }

        public sealed class ComboBasic
        {
            public float[] AttackTimeS = Array.Empty<float>();
            public float[] Mults = Array.Empty<float>();
            public float RangeM;
            public float ArcDeg;
            public float WindowS;
            public float Knockback3M;
            public float MoveSlow;
            public float Lunge3M;
            public float Vuln3S;
        }

        public sealed class ShotBasic
        {
            public float RateS;
            public float Mult;
            public float SpeedM;
            public float RadiusM;
            public float LifeS;
            public int HeavyEvery;
            public float HeavyMult;
            public int Pierce;
            public float SplashM;
            public float SplashMult = 0.6f;
            public float MoveSlowPct = 1f;
            public bool Arrow;
        }

        /// <summary>职业 → 形态(近战两职业走组合技,远程两职业走射击)</summary>
        public static Kind KindOf(HeroClass c) => c == HeroClass.Ranger || c == HeroClass.Arcanist ? Kind.Shot : Kind.Combo;

        /// <summary>Meters→px 换算(与 web 一致:48px = 1m)</summary>
        public const float PxPerM = Balance.PxPerM;

        // ---- 近战:从 balance 派生(常量由 tools/gen_bestiary.py 生成,别手抄)----
        public static ComboBasic ComboOf(HeroClass c)
        {
            bool w = c == HeroClass.Warden;
            return new ComboBasic
            {
                AttackTimeS = w ? BestiaryKlass.KlassWardenComboAttackTimeS : BestiaryKlass.KlassBladeComboAttackTimeS,
                Mults = w ? BestiaryKlass.KlassWardenComboMultsS : BestiaryKlass.KlassBladeComboMultsS,
                RangeM = w ? BestiaryKlass.KlassWardenComboRange : BestiaryKlass.KlassBladeComboRange,
                ArcDeg = w ? BestiaryKlass.KlassWardenComboArcDeg : BestiaryKlass.KlassBladeComboArcDeg,
                WindowS = w ? BestiaryKlass.KlassWardenComboWindow : BestiaryKlass.KlassBladeComboWindow,
                Knockback3M = w ? BestiaryKlass.KlassWardenComboKnockback3 : BestiaryKlass.KlassBladeComboKnockback3,
                MoveSlow = w ? BestiaryKlass.KlassWardenComboMoveSlow : BestiaryKlass.KlassBladeComboMoveSlow,
                Lunge3M = w ? BestiaryKlass.KlassWardenComboLungeM : BestiaryKlass.KlassBladeComboLungeM,
                Vuln3S = w ? BestiaryKlass.KlassWardenComboVulnOnHitS : BestiaryKlass.KlassBladeComboVulnOnHitS,
            };
        }

        // ---- 远程:直接读 balance 段的派生常量 ----
        public static ShotBasic ShotOf(HeroClass c)
        {
            if (c == HeroClass.Ranger)
            {
                return new ShotBasic
                {
                    RateS = BestiaryKlass.KlassRangerBowRateS,
                    Mult = BestiaryKlass.KlassRangerBowMult,
                    SpeedM = BestiaryKlass.KlassRangerBowSpeedM,
                    RadiusM = BestiaryKlass.KlassRangerBowRadiusM,
                    LifeS = BestiaryKlass.KlassRangerBowLifeS,
                    HeavyEvery = (int)BestiaryKlass.KlassRangerBowHeavyEvery,
                    HeavyMult = BestiaryKlass.KlassRangerBowHeavyMult,
                    Pierce = (int)BestiaryKlass.KlassRangerBowPierce,
                    SplashM = BestiaryKlass.KlassRangerBowSplashM,
                    SplashMult = BestiaryKlass.KlassRangerBowSplashMult,
                    MoveSlowPct = BestiaryKlass.KlassRangerBowMoveSlowPct,
                    Arrow = true,
                };
            }
            if (c == HeroClass.Arcanist)
            {
                return new ShotBasic
                {
                    RateS = BestiaryKlass.KlassArcanistBowRateS,
                    Mult = BestiaryKlass.KlassArcanistBowMult,
                    SpeedM = BestiaryKlass.KlassArcanistBowSpeedM,
                    RadiusM = BestiaryKlass.KlassArcanistBowRadiusM,
                    LifeS = BestiaryKlass.KlassArcanistBowLifeS,
                    HeavyEvery = (int)BestiaryKlass.KlassArcanistBowHeavyEvery,
                    HeavyMult = BestiaryKlass.KlassArcanistBowHeavyMult,
                    Pierce = (int)BestiaryKlass.KlassArcanistBowPierce,
                    SplashM = BestiaryKlass.KlassArcanistBowSplashM,
                    SplashMult = BestiaryKlass.KlassArcanistBowSplashMult,
                    MoveSlowPct = BestiaryKlass.KlassArcanistBowMoveSlowPct,
                    Arrow = false,
                };
            }
            throw new ArgumentException($"{c} 不是远程职业");
        }

        /// <summary>连招推进:窗口内 +1,超时(或首击)回到 1,到顶循环回 1</summary>
        public static int ComboStage(int prevStage, float windowLeftS, int stages)
        {
            if (windowLeftS <= 0f || prevStage <= 0) return 1;
            return (prevStage % stages) + 1;
        }

        public struct ComboStep
        {
            public int Stage;
            public float TimeS;
            public float Mult;
            public float RangePx;
            public float ArcRad;
            public float KnockbackM;
            public float LungeM;
            public float VulnS;
            public float MoveSlow;
        }

        /// <summary>解析一次近战普攻(最后一段才吃击退/前冲/破甲)</summary>
        public static ComboStep ResolveCombo(ComboBasic spec, int prevStage, float windowLeftS)
        {
            int stages = spec.Mults.Length;
            int stage = ComboStage(prevStage, windowLeftS, stages);
            int idx = stage - 1;
            bool last = stage == stages;
            return new ComboStep
            {
                Stage = stage,
                TimeS = spec.AttackTimeS[idx],
                Mult = spec.Mults[idx],
                RangePx = spec.RangeM * PxPerM,
                ArcRad = spec.ArcDeg * MathF.PI / 180f,
                KnockbackM = last ? spec.Knockback3M : 0f,
                LungeM = last ? spec.Lunge3M : 0f,
                VulnS = last ? spec.Vuln3S : 0f,
                MoveSlow = spec.MoveSlow,
            };
        }

        public struct ShotStep
        {
            public int Stage;
            public bool Heavy;
            public float Mult;
            public float RadiusPx;
            public int Pierce;
            public float SplashM;
            public float TimeS;
        }

        /// <summary>解析一次射击(每 heavyEvery 发强化)</summary>
        public static ShotStep ResolveShot(ShotBasic spec, int prevStage)
        {
            int stage = (prevStage % spec.HeavyEvery) + 1;
            bool heavy = stage == spec.HeavyEvery;
            return new ShotStep
            {
                Stage = stage,
                Heavy = heavy,
                Mult = heavy ? spec.Mult * spec.HeavyMult : spec.Mult,
                RadiusPx = spec.RadiusM * PxPerM * (heavy ? 1.6f : 1f),
                Pierce = heavy ? spec.Pierce : 0,
                SplashM = spec.SplashM,
                TimeS = spec.RateS,
            };
        }

        /// <summary>前冲冲量(m/s):距离在 burstS 内走完;0 = 这一步不前冲</summary>
        public static float LungeImpulse(ComboStep step, float burstS = 0.12f)
        {
            if (step.LungeM <= 0f) return 0f;
            return step.LungeM * PxPerM / MathF.Max(0.02f, burstS);
        }

        /// <summary>出招期间的移动倍率(近战/远程统一口径)</summary>
        public static float MoveSlowOf(HeroClass c)
            => KindOf(c) == Kind.Combo ? ComboOf(c).MoveSlow : ShotOf(c).MoveSlowPct;

        /// <summary>展示用一句话(营地面板/技能说明),与 web describeBasic 同构</summary>
        public static string Describe(HeroClass c)
        {
            if (KindOf(c) == Kind.Combo)
            {
                var s = ComboOf(c);
                var bits = new List<string> { $"{s.Mults.Length} 段连击", $"终结段 ×{s.Mults[s.Mults.Length - 1]:0.#}" };
                if (s.Knockback3M > 0f) bits.Add($"击退 {s.Knockback3M:0.#}m");
                if (s.Vuln3S > 0f) bits.Add($"破甲 {s.Vuln3S:0.#}s");
                if (s.Lunge3M > 0f) bits.Add($"前冲 {s.Lunge3M:0.#}m");
                return string.Join(" · ", bits);
            }
            var t = ShotOf(c);
            var list = new List<string>
            {
                $"{t.RateS:0.##}s 间隔",
                $"每 {t.HeavyEvery} 发强化 ×{t.HeavyMult:0.##}",
            };
            if (t.Pierce > 0) list.Add($"强化发穿透 {t.Pierce}");
            if (t.SplashM > 0f) list.Add($"溅射 {t.SplashM:0.#}m");
            list.Add(t.MoveSlowPct >= 1f ? "可走射" : $"施法减速至 {t.MoveSlowPct * 100f:0}%");
            return string.Join(" · ", list);
        }
    }
}
