using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;

namespace StarfallKnights.Skills
{
    /// <summary>
    /// 元素秘术师「珀」技能执行器(镜像 web data/skills/arcanist.json)。
    /// Q 追踪弹 / E 瞬移+起点爆裂 / R 脚下持续元素领域。
    /// </summary>
    public sealed class ArcanistSkills : SkillRuntime
    {
        // ---- arcanist_q_seeker 追星术 ----
        public const float QCdShared = 5.0f;
        public const int QCount = 3;
        public const float QSpreadDeg = 25f, QMult = 1.2f, QSpeedM = 7f, QLifeS = 2.0f,
            QRadiusM = 0.2f, QHomingRadM = 3.5f;

        // ---- arcanist_e_blink 星幕闪现 ----
        public const float ECdShared = 6.0f;
        public const float ERangeM = 3.5f, EIframesS = 0.25f, EBlastRadiusM = 1.6f, EMult = 1.6f;

        // ---- arcanist_r_tempest 元素风暴 ----
        public const float RCdShared = 1.5f;
        public const float RRadiusM = 3.0f, RLifeS = 3.0f, RTickS = 0.4f, RMult = 0.5f;

        /// <summary>与 arcanist.json 逐键对照表(键 = 技能id:阶段类型.字段)。</summary>
        public static readonly Dictionary<string, float> Parity = new()
        {
            { "arcanist_q_seeker:cooldown", QCdShared },
            { "arcanist_q_seeker:homingOrbs.count", QCount },
            { "arcanist_q_seeker:homingOrbs.spreadDeg", QSpreadDeg },
            { "arcanist_q_seeker:homingOrbs.mult", QMult },
            { "arcanist_q_seeker:homingOrbs.speedM", QSpeedM },
            { "arcanist_q_seeker:homingOrbs.lifeS", QLifeS },
            { "arcanist_q_seeker:homingOrbs.radiusM", QRadiusM },
            { "arcanist_q_seeker:homingOrbs.homingRad", QHomingRadM },
            { "arcanist_e_blink:cooldown", ECdShared },
            { "arcanist_e_blink:blink.rangeM", ERangeM },
            { "arcanist_e_blink:blink.iframesS", EIframesS },
            { "arcanist_e_blink:blink.blastRadiusM", EBlastRadiusM },
            { "arcanist_e_blink:blink.mult", EMult },
            { "arcanist_r_tempest:cooldown", RCdShared },
            { "arcanist_r_tempest:minRage", MinRage },
            { "arcanist_r_tempest:elementStorm.radiusM", RRadiusM },
            { "arcanist_r_tempest:elementStorm.lifeS", RLifeS },
            { "arcanist_r_tempest:elementStorm.tickS", RTickS },
            { "arcanist_r_tempest:elementStorm.mult", RMult },
        };

        /// <summary>Q 追星术:扇形放出 3 发追踪法球(转向半径 homingRad 内的最近敌人)。</summary>
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
                var orb = Shoot(w, p.Pos, new Vector2(MathF.Cos(ang), MathF.Sin(ang)),
                    QSpeedM, QLifeS, QRadiusM, QMult, element);
                orb.HomingRadM = QHomingRadM;
            }
            if (RuneQ?.GroundZone != null)
            {
                var dir = new Vector2(MathF.Cos(p.Face), MathF.Sin(p.Face));
                SpawnRuneZone(w, RuneQ, p.Pos + dir * 1.2f, element);
            }
            return true;
        }

        /// <summary>
        /// E 星幕闪现:向准星方向瞬移 min(到准星距离, rangeM)(逻辑层直接改 Player.Pos,宿主同步视图),
        /// 起点留下爆裂与符文地带。返回 起点/落点/无敌帧 交宿主做残影与无敌。
        /// </summary>
        public (Vector2 from, Vector2 to, float iframesS)? CastE(LogicWorld w, Vector2? aimPoint = null)
        {
            if (CdE > 0 || w.Player == null) return null;
            CdE = ECdShared * CdScale;
            var element = RuneE?.Element;
            var p = w.Player;
            var from = p.Pos;
            var dir = FaceVec(p);
            float dist = ERangeM;
            if (aimPoint.HasValue)
            {
                var to0 = aimPoint.Value - from;
                float d = to0.Length();
                if (d > 0.0001f)
                {
                    dir = Vector2.Normalize(to0);
                    dist = MathF.Min(d, ERangeM);
                }
            }
            var to = from + dir * dist;
            p.Pos = to;
            HitAround(w, from, EBlastRadiusM, EMult, element);
            SpawnRuneZone(w, RuneE, from, element);
            return (from, to, EIframesS);
        }

        /// <summary>R 元素风暴:脚下生成持续领域(元素由符文决定,无符文为纯净星辉)。</summary>
        public bool CastR(LogicWorld w)
        {
            if (CdR > 0 || Rage < MinRage || w.Player == null) return false;
            var element = RuneR?.Element;
            float lifeScale = 1f + RageRatio * 0.5f; // 先算比例再清零怒气
            Rage = 0;
            CdR = RCdShared;
            var p = w.Player;
            // 镜像 web:lifeS × (1 + ratio*0.5)
            w.Zones.Add(new Zone
            {
                Pos = p.Pos, RadiusM = RRadiusM, LifeS = RLifeS * lifeScale, TickS = RTickS,
                Atk = p.Unit.Atk, Mult = RMult, Element = element, PlayerTeam = true,
            });
            return true;
        }
    }
}
