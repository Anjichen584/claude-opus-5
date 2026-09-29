using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;

namespace StarfallKnights.Skills
{
    /// <summary>
    /// 星弓猎手「絮」技能执行器(镜像 web data/skills/ranger.json)。
    /// 普攻(连射弓)参数在 balance.json classes.ranger.bow,属宿主/渲染层。
    /// </summary>
    public sealed class RangerSkills : SkillRuntime
    {
        // ---- ranger_q_fan 瞬影三连 ----
        public const float QCdShared = 4.0f;
        public const int QCount = 3;
        public const float QSpreadDeg = 16f, QMult = 0.9f, QSpeedM = 12f, QLifeS = 0.9f, QRadiusM = 0.14f;

        // ---- ranger_e_nova 疾风回旋 ----
        public const float ECdShared = 6.0f;
        public const float EDistM = 2.6f, EDurS = 0.2f, EIframesS = 0.3f;
        public const int EArrows = 8;
        public const float EMult = 0.7f, ESpeedM = 10f, ELifeS = 0.8f, ERadiusM = 0.14f;

        // ---- ranger_r_storm 星陨箭雨 ----
        public const float RCdShared = 1.5f;
        public const int RMin = 10, RMax = 26;
        public const float RMult = 0.55f, RRadiusM = 2.4f, RDurS = 1.2f, RRangeM = 7.0f, RAoeM = 0.9f;

        /// <summary>与 ranger.json 逐键对照表(键 = 技能id:阶段类型.字段)。</summary>
        public static readonly Dictionary<string, float> Parity = new()
        {
            { "ranger_q_fan:cooldown", QCdShared },
            { "ranger_q_fan:fanArrows.count", QCount },
            { "ranger_q_fan:fanArrows.spreadDeg", QSpreadDeg },
            { "ranger_q_fan:fanArrows.mult", QMult },
            { "ranger_q_fan:fanArrows.speedM", QSpeedM },
            { "ranger_q_fan:fanArrows.lifeS", QLifeS },
            { "ranger_q_fan:fanArrows.radiusM", QRadiusM },
            { "ranger_e_nova:cooldown", ECdShared },
            { "ranger_e_nova:novaRoll.distM", EDistM },
            { "ranger_e_nova:novaRoll.durS", EDurS },
            { "ranger_e_nova:novaRoll.iframesS", EIframesS },
            { "ranger_e_nova:novaRoll.arrows", EArrows },
            { "ranger_e_nova:novaRoll.mult", EMult },
            { "ranger_e_nova:novaRoll.speedM", ESpeedM },
            { "ranger_e_nova:novaRoll.lifeS", ELifeS },
            { "ranger_e_nova:novaRoll.radiusM", ERadiusM },
            { "ranger_r_storm:cooldown", RCdShared },
            { "ranger_r_storm:minRage", MinRage },
            { "ranger_r_storm:arrowStorm.minCount", RMin },
            { "ranger_r_storm:arrowStorm.maxCount", RMax },
            { "ranger_r_storm:arrowStorm.mult", RMult },
            { "ranger_r_storm:arrowStorm.radiusM", RRadiusM },
            { "ranger_r_storm:arrowStorm.durS", RDurS },
            { "ranger_r_storm:arrowStorm.rangeM", RRangeM },
            { "ranger_r_storm:arrowStorm.aoeM", RAoeM },
        };

        /// <summary>Q 瞬影三连:朝面向扇形射 3 箭。</summary>
        public bool CastQ(LogicWorld w)
        {
            if (CdQ > 0 || w.Player == null) return false;
            CdQ = QCdShared * CdScale;
            var element = RuneQ?.Element;
            var p = w.Player;
            float spread = QSpreadDeg * MathF.PI / 180f;
            for (int i = 0; i < QCount; i++)
            {
                float ang = p.Face + FanOffset(i, QCount, spread);
                Shoot(w, p.Pos, new Vector2(MathF.Cos(ang), MathF.Sin(ang)),
                    QSpeedM, QLifeS, QRadiusM, QMult, element);
            }
            if (RuneQ?.GroundZone != null)
            {
                var dir = new Vector2(MathF.Cos(p.Face), MathF.Sin(p.Face));
                SpawnRuneZone(w, RuneQ, p.Pos + dir * 1.2f, element);
            }
            return true;
        }

        /// <summary>E 疾风回旋:突进(宿主位移)+ 落点 8 向环箭。返回突进与无敌帧。</summary>
        public (float distM, float durS, float iframesS)? CastE(LogicWorld w)
        {
            if (CdE > 0 || w.Player == null) return null;
            CdE = ECdShared * CdScale;
            var element = RuneE?.Element;
            // 镜像 web:符文地带落在"起点"(施放瞬间),不是落点
            SpawnRuneZone(w, RuneE, w.Player.Pos, element);
            // 镜像 web:环箭在突进结束后 0.02s 从落点放出
            Delay(EDurS + 0.02f, () =>
            {
                var p = w.Player;
                if (p == null) return;
                for (int i = 0; i < EArrows; i++)
                {
                    float ang = i / (float)EArrows * MathF.PI * 2f;
                    Shoot(w, p.Pos, new Vector2(MathF.Cos(ang), MathF.Sin(ang)),
                        ESpeedM, ELifeS, ERadiusM, EMult, element);
                }
            });
            return (EDistM, EDurS, EIframesS);
        }

        /// <summary>
        /// R 星陨箭雨:怒气驱动。镜像 web —— 目标点 = 准星方向 × rangeM(宿主可传 aimPoint 做鼠标限程),
        /// 落点在目标点周围 radiusM 内按 sqrt 均匀分布(不是线性),范围内所有敌人结算。
        /// </summary>
        public bool CastR(LogicWorld w, Action<Vector2> onImpactFx = null, Vector2? aimPoint = null)
        {
            if (CdR > 0 || Rage < MinRage || w.Player == null) return false;
            var element = RuneR?.Element;
            int count = RageCount(RMin, RMax);
            Rage = 0;
            CdR = RCdShared;
            var p0 = w.Player;
            // 目标点 = 准星(宿主给定)或朝向前方 rangeM 处
            Vector2 focus;
            var dir0 = FaceVec(p0);
            if (aimPoint.HasValue)
            {
                var to = aimPoint.Value - p0.Pos;
                float d = to.Length();
                focus = d < 0.0001f ? p0.Pos + dir0 * RRangeM
                    : p0.Pos + Vector2.Normalize(to) * MathF.Min(d, RRangeM);
            }
            else
            {
                focus = p0.Pos + dir0 * RRangeM;
            }

            for (int i = 0; i < count; i++)
            {
                Delay(i / (float)count * RDurS, () =>
                {
                    double a = Rng.NextDouble() * Math.PI * 2;
                    float r = MathF.Sqrt((float)Rng.NextDouble()) * RRadiusM; // 均匀圆盘
                    var at = focus + new Vector2(MathF.Cos((float)a), MathF.Sin((float)a)) * r;
                    onImpactFx?.Invoke(at);
                    HitAround(w, at, RAoeM, RMult, element);
                    if (RuneR?.GroundZone != null && i % 5 == 0) SpawnRuneZone(w, RuneR, at, element);
                });
            }
            return true;
        }
    }
}
