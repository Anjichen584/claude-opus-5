using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Core;

namespace StarfallKnights.Combat
{
    /// <summary>持续区域(火海/毒沼/冰圈等)——对应 web Zone 组件。</summary>
    public sealed class Zone
    {
        public Vector2 Pos;
        public float RadiusM;
        public float LifeS;
        public float TickS;
        public float Atk;
        public float Mult;
        public Element? Element;
        public bool PlayerTeam;
        internal float NextTick;
    }

    /// <summary>Zone 推进:按间隔对区域内对立单位结算(走统一伤害管线,可触发反应)。</summary>
    public static class ZoneSystem
    {
        public static void Tick(LogicWorld w, float dt)
        {
            for (int i = w.Zones.Count - 1; i >= 0; i--)
            {
                var z = w.Zones[i];
                z.LifeS -= dt;
                z.NextTick -= dt;
                if (z.NextTick <= 0)
                {
                    z.NextTick = z.TickS;
                    if (z.PlayerTeam)
                    {
                        var hits = new List<Actor>(w.EnemiesWithin(z.Pos, z.RadiusM));
                        foreach (var e in hits)
                        {
                            DamagePipeline.Deal(new DealOpts
                            {
                                Source = null, Target = e.Unit, Mult = z.Mult,
                                Element = z.Element, AtkOverride = z.Atk, CanCrit = false,
                            });
                        }
                    }
                    else if (w.Player != null && Vector2.Distance(w.Player.Pos, z.Pos) <= z.RadiusM
                             && !w.PlayerInvulnerable)
                    {
                        // 镜像 web:走受伤入口,尊重翻滚/闪现的无敌帧
                        w.Player.Unit.Hp -= z.Atk * z.Mult;
                    }
                }
                if (z.LifeS <= 0) w.Zones.RemoveAt(i);
            }
        }
    }
}
