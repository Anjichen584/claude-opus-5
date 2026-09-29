using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;
using StarfallKnights.Data;

namespace StarfallKnights.Skills
{
    /// <summary>
    /// 狂澜剑士「澜」技能执行器(镜像 web data/skills/blade.json)。
    /// 所有数值以 public const 暴露,并由 Parity 字典对照 JSON 逐键守卫(见 unity/Tests)。
    /// </summary>
    public sealed class BladeSkills : SkillRuntime
    {
        // ---- blade_q_cleave 裂空斩 ----
        public const float QCdShared = 4.0f;
        public const int QCount = 3;
        public const float QIntervalS = 0.1f, QArcDeg = 110f, QRangeM = 2.2f, QMult = 1.4f;
        /// <summary>blade.json 有 pullM 字段,但 web SkillSystem 目前未消费(仅数据镜像,行为同样不拉拽)。</summary>
        public const float QPullM = 1.5f;

        // ---- blade_e_tidestep 潮涌步 ----
        public const float ECdShared = 6.0f;
        public const float EDistM = 3.5f, EDurS = 0.18f, EIframesS = 0.15f, EDashMult = 0.8f;
        public const float EBlastDelayS = 1.0f, EBlastRadiusM = 1.8f, EBlastMult = 2.2f;

        // ---- blade_r_starfall 星陨·万剑归宗 ----
        public const float RCdShared = 1.5f;
        public const int RMin = 8, RMax = 24;
        public const float RMult = 0.9f, RRingM = 3.2f, RDurS = 1.6f, RAoeM = 1.0f, RSeekM = 6.5f;

        /// <summary>与 blade.json 逐键对照表(键 = 技能id:阶段类型.字段)。ParityTests 会双向校验。</summary>
        public static readonly Dictionary<string, float> Parity = new()
        {
            { "blade_q_cleave:cooldown", QCdShared },
            { "blade_q_cleave:multiSweep.count", QCount },
            { "blade_q_cleave:multiSweep.intervalS", QIntervalS },
            { "blade_q_cleave:multiSweep.arcDeg", QArcDeg },
            { "blade_q_cleave:multiSweep.rangeM", QRangeM },
            { "blade_q_cleave:multiSweep.mult", QMult },
            { "blade_q_cleave:multiSweep.pullM", QPullM },
            { "blade_e_tidestep:cooldown", ECdShared },
            { "blade_e_tidestep:dash.distM", EDistM },
            { "blade_e_tidestep:dash.durS", EDurS },
            { "blade_e_tidestep:dash.iframesS", EIframesS },
            { "blade_e_tidestep:dash.mult", EDashMult },
            { "blade_e_tidestep:echoBlast.delayS", EBlastDelayS },
            { "blade_e_tidestep:echoBlast.radiusM", EBlastRadiusM },
            { "blade_e_tidestep:echoBlast.mult", EBlastMult },
            { "blade_r_starfall:cooldown", RCdShared },
            { "blade_r_starfall:minRage", MinRage },
            { "blade_r_starfall:swordRain.minCount", RMin },
            { "blade_r_starfall:swordRain.maxCount", RMax },
            { "blade_r_starfall:swordRain.mult", RMult },
            { "blade_r_starfall:swordRain.ringM", RRingM },
            { "blade_r_starfall:swordRain.durS", RDurS },
            { "blade_r_starfall:swordRain.aoeM", RAoeM },
            { "blade_r_starfall:swordRain.seekM", RSeekM },
        };

        /// <summary>Q 裂空斩:三连扇形斩,每段把命中敌人拉向自己 pullM。</summary>
        public bool CastQ(LogicWorld w)
        {
            if (CdQ > 0 || w.Player == null) return false;
            CdQ = QCdShared * CdScale;
            var element = RuneQ?.Element;
            for (int i = 0; i < QCount; i++)
            {
                Delay(i * QIntervalS, () =>
                {
                    var p = w.Player;
                    if (p == null) return;
                    HitCone(w, p.Pos, p.Face, QRangeM, QArcDeg, QMult, element);
                });
            }
            if (RuneQ?.GroundZone != null)
            {
                Delay(QCount * QIntervalS, () =>
                {
                    var p = w.Player;
                    if (p == null) return;
                    var dir = new Vector2(MathF.Cos(p.Face), MathF.Sin(p.Face));
                    SpawnRuneZone(w, RuneQ, p.Pos + dir * 1.2f, element);
                });
            }
            return true;
        }

        /// <summary>E 潮涌步:突进(宿主位移,沿路伤害用 dashMult)+ 残影延迟爆炸。</summary>
        public (float distM, float durS, float iframesS, float dashMult)? CastE(LogicWorld w)
        {
            if (CdE > 0 || w.Player == null) return null;
            CdE = ECdShared * CdScale;
            var element = RuneE?.Element;
            var origin = w.Player.Pos;
            Delay(EBlastDelayS, () =>
            {
                HitAround(w, origin, EBlastRadiusM, EBlastMult, element);
                SpawnRuneZone(w, RuneE, origin, element);
            });
            return (EDistM, EDurS, EIframesS, EDashMult);
        }

        /// <summary>R 星陨·万剑归宗:怒气驱动坠剑;每 4 剑一个符文地带。落点回调交宿主做特效。</summary>
        public bool CastR(LogicWorld w, Action<Vector2> onImpactFx = null)
        {
            if (CdR > 0 || Rage < MinRage || w.Player == null) return false;
            var element = RuneR?.Element;
            int count = RageCount(RMin, RMax);
            Rage = 0;
            CdR = RCdShared;
            for (int i = 0; i < count; i++)
            {
                int idx = i;
                Delay(i / (float)count * RDurS, () =>
                {
                    var p = w.Player;
                    if (p == null) return;
                    Vector2 at;
                    var seek = new List<Actor>(w.EnemiesWithin(p.Pos, RSeekM));
                    if (seek.Count > 0 && Rng.NextDouble() < 0.75)
                    {
                        var pick = seek[Rng.Next(seek.Count)];
                        float jitter = 30f / Balance.PxPerM; // web: (rand-0.5)*30px
                        at = pick.Pos + new Vector2((float)(Rng.NextDouble() - 0.5) * jitter, (float)(Rng.NextDouble() - 0.5) * jitter);
                    }
                    else
                    {
                        double a = Rng.NextDouble() * Math.PI * 2;
                        float r = 0.5f + (float)Rng.NextDouble() * (RRingM - 0.5f);
                        at = p.Pos + new Vector2(MathF.Cos((float)a), MathF.Sin((float)a)) * r;
                    }
                    onImpactFx?.Invoke(at);
                    // 镜像 web:只结算"施放时距玩家 ≤seekM 的敌人"里落在 aoeM 内的那些
                    HitAround(w, at, RAoeM, RMult, element, p.Pos, RSeekM);
                    if (idx % 4 == 0) SpawnRuneZone(w, RuneR, at, element);
                });
            }
            return true;
        }

    }
}
