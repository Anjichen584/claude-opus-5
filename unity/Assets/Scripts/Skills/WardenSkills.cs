using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;

namespace StarfallKnights.Skills
{
    /// <summary>
    /// 岩铠守卫「磐」技能执行器(镜像 web data/skills/warden.json)。
    /// 特色是控制:Q 眩晕 / E 冲锋击退 / R 大范围击退+减速。
    /// </summary>
    public sealed class WardenSkills : SkillRuntime
    {
        // ---- warden_q_quake 岩震击 ----
        public const float QCdShared = 5.0f;
        public const float QArcDeg = 100f, QRangeM = 2.4f, QMult = 1.8f, QStunS = 0.8f;

        // ---- warden_e_charge 壁垒冲锋 ----
        public const float ECdShared = 8.0f;
        public const float EDistM = 3.0f, EDurS = 0.22f, EIframesS = 0.25f,
            EArcDeg = 90f, ERangeM = 1.8f, EMult = 1.5f, EKnockbackM = 2.0f;

        // ---- warden_r_roar 大地怒吼 ----
        public const float RCdShared = 1.5f;
        public const float RRadiusM = 3.6f, RMult = 1.2f, RKnockbackM = 2.5f, RSlowS = 2.0f, RSlowPct = 0.4f;

        /// <summary>与 warden.json 逐键对照表(键 = 技能id:阶段类型.字段)。</summary>
        public static readonly Dictionary<string, float> Parity = new()
        {
            { "warden_q_quake:cooldown", QCdShared },
            { "warden_q_quake:quakeSmash.arcDeg", QArcDeg },
            { "warden_q_quake:quakeSmash.rangeM", QRangeM },
            { "warden_q_quake:quakeSmash.mult", QMult },
            { "warden_q_quake:quakeSmash.stunS", QStunS },
            { "warden_e_charge:cooldown", ECdShared },
            { "warden_e_charge:shieldCharge.distM", EDistM },
            { "warden_e_charge:shieldCharge.durS", EDurS },
            { "warden_e_charge:shieldCharge.iframesS", EIframesS },
            { "warden_e_charge:shieldCharge.arcDeg", EArcDeg },
            { "warden_e_charge:shieldCharge.rangeM", ERangeM },
            { "warden_e_charge:shieldCharge.mult", EMult },
            { "warden_e_charge:shieldCharge.knockbackM", EKnockbackM },
            { "warden_r_roar:cooldown", RCdShared },
            { "warden_r_roar:minRage", MinRage },
            { "warden_r_roar:earthRoar.radiusM", RRadiusM },
            { "warden_r_roar:earthRoar.mult", RMult },
            { "warden_r_roar:earthRoar.knockbackM", RKnockbackM },
            { "warden_r_roar:earthRoar.slowS", RSlowS },
            { "warden_r_roar:earthRoar.slowPct", RSlowPct },
        };

        /// <summary>Q 岩震击:面向锥形重击并眩晕。</summary>
        public bool CastQ(LogicWorld w)
        {
            if (CdQ > 0 || w.Player == null) return false;
            CdQ = QCdShared * CdScale;
            var element = RuneQ?.Element;
            var p = w.Player;
            foreach (var e in new List<Actor>(w.EnemiesInCone(p.Pos, p.Face, QRangeM, QArcDeg * MathF.PI / 180f)))
            {
                HitOne(p.Unit, e, QMult, element);
                e.Unit.StunT = MathF.Max(e.Unit.StunT, QStunS);
            }
            if (RuneQ?.GroundZone != null)
            {
                var dir = new Vector2(MathF.Cos(p.Face), MathF.Sin(p.Face));
                SpawnRuneZone(w, RuneQ, p.Pos + dir * 1.2f, element);
            }
            return true;
        }

        /// <summary>E 壁垒冲锋:突进(宿主位移)+ 冲锋瞬间的锥形撞击与击退。</summary>
        public (float distM, float durS, float iframesS)? CastE(LogicWorld w)
        {
            if (CdE > 0 || w.Player == null) return null;
            CdE = ECdShared * CdScale;
            var element = RuneE?.Element;
            // 镜像 web:撞击在突进结束后 0.02s 结算
            Delay(EDurS + 0.02f, () =>
            {
                var p = w.Player;
                if (p == null) return;
                var dir = new Vector2(MathF.Cos(p.Face), MathF.Sin(p.Face));
                foreach (var e in new List<Actor>(w.EnemiesInCone(p.Pos, p.Face, ERangeM, EArcDeg * MathF.PI / 180f)))
                {
                    HitOne(p.Unit, e, EMult, element);
                    e.Vel += dir * EKnockbackM;
                }
                // 镜像 web:符文地带落在落点前方 0.8m
                SpawnRuneZone(w, RuneE, p.Pos + dir * 0.8f, element);
            });
            return (EDistM, EDurS, EIframesS);
        }

        /// <summary>R 大地怒吼:环状伤害 + 向外击退 + 减速。</summary>
        public bool CastR(LogicWorld w)
        {
            if (CdR > 0 || Rage < MinRage || w.Player == null) return false;
            var element = RuneR?.Element;
            Rage = 0;
            CdR = RCdShared;
            var p = w.Player;
            foreach (var e in new List<Actor>(w.EnemiesWithin(p.Pos, RRadiusM)))
            {
                HitOne(p.Unit, e, RMult, element);
                var away = e.Pos - p.Pos;
                if (away.LengthSquared() > 0.0001f) e.Vel += Vector2.Normalize(away) * RKnockbackM;
                e.Unit.SlowT = MathF.Max(e.Unit.SlowT, RSlowS);
                e.Unit.SlowPct = MathF.Max(e.Unit.SlowPct, RSlowPct);
            }
            if (RuneR?.GroundZone != null) SpawnRuneZone(w, RuneR, p.Pos, element);
            return true;
        }
    }
}
