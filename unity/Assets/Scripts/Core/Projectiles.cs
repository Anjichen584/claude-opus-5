using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;

namespace StarfallKnights.Core
{
    /// <summary>
    /// 弹幕(镜像 web ProjectileSystem 的最小逻辑子集)。
    /// 只负责"飞→命中→结算",拖尾/光效由宿主渲染层做。
    /// 追踪(Homing)用于秘术师 Q;落地范围(AoeOnHit)用于游侠 R 箭雨。
    /// </summary>
    public sealed class Projectile
    {
        public Vector2 Pos;
        public Vector2 Vel;
        public float RadiusM = 0.14f;
        public float LifeS = 1f;
        public float Mult = 1f;
        public Element? Element;
        /// <summary>出手者(伤害来源:攻击力/暴击走它);可为 null。</summary>
        public CombatUnit Owner;
        public bool PlayerTeam = true;

        /// <summary>&gt;0 时每帧朝该半径内最近敌人转向(弧度/秒的等效转向由速度决定)。</summary>
        public float HomingRadM;
        /// <summary>true 时命中结算范围伤害(AoeM 为半径),否则单体。</summary>
        public bool AoeOnHit;
        public float AoeM;

        public bool Dead;
        /// <summary>命中过的目标(防止同一发反复打同一只)。</summary>
        public readonly HashSet<CombatUnit> Hit = new();
    }

    public static class ProjectileSystem
    {
        /// <summary>推进所有弹幕:追踪转向 → 位移 → 命中判定 → 生命周期。</summary>
        public static void Tick(LogicWorld w, float dt)
        {
            for (int i = w.Projectiles.Count - 1; i >= 0; i--)
            {
                var p = w.Projectiles[i];
                p.LifeS -= dt;
                if (p.LifeS <= 0) { w.Projectiles.RemoveAt(i); continue; }

                if (p.HomingRadM > 0f)
                {
                    var target = NearestHostile(w, p);
                    if (target != null)
                    {
                        var want = target.Pos - p.Pos;
                        if (want.LengthSquared() > 0.0001f)
                        {
                            want = Vector2.Normalize(want);
                            var cur = p.Vel.LengthSquared() > 0.0001f ? Vector2.Normalize(p.Vel) : want;
                            float speed = p.Vel.Length();
                            // 每帧向目标方向插值(约 6 rad/s 的转向速率上限,避免直角甩尾)
                            float maxTurn = 6f * dt;
                            float dot = Math.Clamp(Vector2.Dot(cur, want), -1f, 1f);
                            float ang = MathF.Acos(dot);
                            Vector2 dir = ang <= maxTurn ? want : Vector2.Normalize(Vector2.Lerp(cur, want, maxTurn / ang));
                            p.Vel = dir * speed;
                        }
                    }
                }

                p.Pos += p.Vel * dt;

                // 命中判定:打对立方(玩家弹打敌人;敌弹打玩家)
                if (p.PlayerTeam)
                {
                    foreach (var e in w.Enemies)
                    {
                        if (p.Hit.Contains(e.Unit)) continue;
                        if (Vector2.Distance(e.Pos, p.Pos) > p.RadiusM + 0.35f) continue;
                        Hit(w, p, e);
                        break;
                    }
                }
                else if (w.Player != null &&
                         Vector2.Distance(w.Player.Pos, p.Pos) <= p.RadiusM + 0.35f &&
                         !p.Hit.Contains(w.Player.Unit))
                {
                    Hit(w, p, w.Player);
                }

                if (p.Dead) w.Projectiles.RemoveAt(i);
            }
        }

        private static Actor NearestHostile(LogicWorld w, Projectile p)
        {
            Actor best = null;
            float bestD = p.HomingRadM;
            if (p.PlayerTeam)
            {
                foreach (var e in w.Enemies)
                {
                    float d = Vector2.Distance(e.Pos, p.Pos);
                    if (d <= bestD) { bestD = d; best = e; }
                }
            }
            else if (w.Player != null)
            {
                float d = Vector2.Distance(w.Player.Pos, p.Pos);
                if (d <= bestD) best = w.Player;
            }
            return best;
        }

        private static void Hit(LogicWorld w, Projectile p, Actor target)
        {
            p.Hit.Add(target.Unit);
            if (p.AoeOnHit)
            {
                foreach (var e in new List<Actor>(w.EnemiesWithin(p.Pos, p.AoeM)))
                {
                    if (!p.PlayerTeam && e.IsPlayer) continue;
                    DamagePipeline.Deal(new DealOpts
                    {
                        Source = p.Owner, Target = e.Unit, Mult = p.Mult, Element = p.Element, CanCrit = true,
                    });
                }
            }
            else
            {
                DamagePipeline.Deal(new DealOpts
                {
                    Source = p.Owner, Target = target.Unit, Mult = p.Mult, Element = p.Element, CanCrit = true,
                });
            }
            p.Dead = true;
        }
    }
}
