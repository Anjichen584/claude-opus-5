using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;
using StarfallKnights.Data;

namespace StarfallKnights.Dungeon
{
    /// <summary>
    /// 双 Boss AI(镜像 web VelshaSystem / KazraSystem + VelshaSystem 的 BlizzardTimer)。
    /// 三阶段血量线(phase2At/phase3At)、P3 全局提速、召唤小怪走 SpawnMinion 回调交宿主。
    /// </summary>
    public sealed class BossAI
    {
        private sealed class BossState
        {
            public int Phase = 1;
            public MobPhase PhaseKind = MobPhase.Hover; // Hover=浮游/走位, Telegraph/Dash=冲锋, Burrow/Surface=钻地
            public float T, VolleyCd, BlizzardCd, SummonCd, ChargeCd, BurrowCd, TrailT, AnimT;
            public float DirX, DirY;
            public int DivesLeft;
            /// <summary>阶段切换通知(宿主做播报/演出)。</summary>
            public int AnnouncedPhase = 1;
        }

        private readonly Dictionary<Actor, BossState> _states = new();

        /// <summary>宿主实现:生成小怪(种类 + 位置),视图与缩放由宿主负责。</summary>
        public Action<EnemyKind, Vector2> SpawnMinion;
        /// <summary>阶段切换回调(Actor, 新阶段, 播报文案)。</summary>
        public Action<Actor, int, string> OnPhaseChanged;

        public void Clear() => _states.Clear();
        public void Forget(Actor a) => _states.Remove(a);
        public int PhaseOf(Actor a) => _states.TryGetValue(a, out var s) ? s.Phase : 1;

        public void Update(LogicWorld w, float dt)
        {
            var p = w.Player;
            if (p == null) return;
            bool alive = p.Unit.Hp > 0;

            foreach (var e in w.Enemies)
            {
                if (e.Kind != EnemyKind.BossVelsha && e.Kind != EnemyKind.BossKazra) continue;
                if (!_states.TryGetValue(e, out var s)) { s = new BossState(); _states[e] = s; }
                e.Unit.FaceRad = e.Face;
                if (e.Unit.StunT > 0 || !alive)
                {
                    e.Vel = Vector2.Zero;
                    continue;
                }
                if (e.Kind == EnemyKind.BossVelsha) Velsha(w, e, s, dt);
                else Kazra(w, e, s, dt);
            }
        }

        private void CheckPhase(Actor e, BossState s, float p2At, float p3At, float hp, float hpMax)
        {
            float ratio = hpMax > 0f ? hp / hpMax : 1f;
            if (s.Phase == 1 && ratio <= p2At) SetPhase(e, s, 2);
            else if (s.Phase == 2 && ratio <= p3At) SetPhase(e, s, 3);
        }

        private void SetPhase(Actor e, BossState s, int phase)
        {
            s.Phase = phase;
            if (s.AnnouncedPhase == phase) return;
            s.AnnouncedPhase = phase;
            OnPhaseChanged?.Invoke(e, phase, e.Kind == EnemyKind.BossVelsha
                ? (phase == 2 ? "❄ 薇尔莎:「让暴风雪…吞没你」" : "❄❄ 薇尔莎狂怒:寒风呼啸!")
                : (phase == 2 ? "🔥 卡兹拉钻入流沙……小心脚下!" : "🔥🔥 卡兹拉熔核暴走:大地在燃烧!"));
        }

        // ================== 二章 Boss:霜语女妖·薇尔莎 ==================

        private void Velsha(LogicWorld w, Actor e, BossState s, float dt)
        {
            s.AnimT += dt;
            CheckPhase(e, s, Bestiary.BossVelshaPhase2At, Bestiary.BossVelshaPhase3At, e.Unit.Hp, e.Unit.HpMax);
            float haste = s.Phase == 3 ? 0.65f : 1f;

            var to = w.Player.Pos - e.Pos;
            float dist = to.Length();
            if (dist < 0.0001f) dist = 0.0001f;
            var n = to / dist;
            e.Face = MathF.Atan2(to.Y, to.X);

            switch (s.PhaseKind)
            {
                case MobPhase.Hover:
                {
                    // 漂浮保持 3~5m
                    var v = Vector2.Zero;
                    if (dist > 5f) v = n;
                    else if (dist < 3f) v = -n;
                    e.Vel = v * Bestiary.Of(EnemyKind.BossVelsha).Speed; // speed=2.0 来自 balance

                    // 冰弹环
                    s.VolleyCd -= dt;
                    if (s.VolleyCd <= 0f)
                    {
                        s.VolleyCd = Bestiary.BossVelshaVolleyCd * haste;
                        int count = (int)Bestiary.BossVelshaVolleyCount + (s.Phase == 3 ? 4 : 0);
                        float offset = (float)(_rng.NextDouble()) * MathF.PI * 2f;
                        for (int i = 0; i < count; i++)
                        {
                            float a = offset + i / (float)count * MathF.PI * 2f;
                            SpawnEnemyShot(w, e, a, Bestiary.BossVelshaVolleySpeedM, Bestiary.BossVelshaVolleyRadiusM,
                                Bestiary.BossVelshaVolleyMult, Bestiary.BossVelshaVolleyLifeS, Element.Ice, 0.6f);
                        }
                    }

                    if (s.Phase >= 2)
                    {
                        // 暴风雪预警(落点在玩家周围,爆完残留冰雾)
                        s.BlizzardCd -= dt;
                        if (s.BlizzardCd <= 0f)
                        {
                            s.BlizzardCd = Bestiary.BossVelshaBlizzardCd * haste;
                            for (int i = 0; i < (int)Bestiary.BossVelshaBlizzardCount; i++)
                            {
                                float a = (float)(_rng.NextDouble()) * MathF.PI * 2f;
                                float r = (float)_rng.NextDouble() * 1.8f;
                                var at = w.Player.Pos + new Vector2(MathF.Cos(a), MathF.Sin(a)) * r;
                                TelegraphSystem.Add(w, at, Bestiary.BossVelshaBlizzardRadiusM,
                                    Bestiary.BossVelshaBlizzardTelegraphS, e.Unit.Atk,
                                    Bestiary.BossVelshaBlizzardMult, Element.Ice, true,
                                    Bestiary.BossVelshaBlizzardZoneLifeS, Bestiary.BossVelshaBlizzardTickS,
                                    Bestiary.BossVelshaBlizzardZoneMult);
                            }
                        }

                        // 召唤雪绒球(场上上限 4)
                        s.SummonCd -= dt;
                        if (s.SummonCd <= 0f && CountKind(w, EnemyKind.SnowPuff) < 4)
                        {
                            s.SummonCd = Bestiary.BossVelshaSummonCd * haste;
                            for (int i = 0; i < (int)Bestiary.BossVelshaSummonCount; i++)
                            {
                                float a = (float)(_rng.NextDouble()) * MathF.PI * 2f;
                                SpawnMinion?.Invoke(EnemyKind.SnowPuff,
                                    e.Pos + new Vector2(MathF.Cos(a), MathF.Sin(a)) * 1.25f);
                            }
                        }
                    }

                    if (s.Phase >= 3)
                    {
                        s.ChargeCd -= dt;
                        if (s.ChargeCd <= 0f && dist > 2f)
                        {
                            s.ChargeCd = Bestiary.BossVelshaChargeCd * haste;
                            s.PhaseKind = MobPhase.Telegraph;
                            s.T = Bestiary.BossVelshaChargeTelegraphS;
                            s.DirX = n.X;
                            s.DirY = n.Y;
                        }
                    }
                    break;
                }
                case MobPhase.Telegraph:
                {
                    e.Vel = Vector2.Zero;
                    s.T -= dt;
                    if (s.T <= 0f) { s.PhaseKind = MobPhase.Dash; s.T = Bestiary.BossVelshaChargeDur; }
                    break;
                }
                default:
                {
                    e.Vel = new Vector2(s.DirX, s.DirY) * Bestiary.BossVelshaChargeSpeedM;
                    if (dist < Bestiary.BossVelshaBodyRadius + 0.3f + 0.125f) HurtPlayer(w, e.Unit.Atk * 1.4f);
                    s.T -= dt;
                    if (s.T <= 0f) s.PhaseKind = MobPhase.Hover;
                    break;
                }
            }
        }

        // ================== 三章 Boss:熔核蝎皇·卡兹拉 ==================

        private void Kazra(LogicWorld w, Actor e, BossState s, float dt)
        {
            s.AnimT += dt;
            CheckPhase(e, s, Bestiary.BossKazraPhase2At, Bestiary.BossKazraPhase3At, e.Unit.Hp, e.Unit.HpMax);
            float haste = s.Phase == 3 ? 0.7f : 1f;

            var to = w.Player.Pos - e.Pos;
            float dist = to.Length();
            if (dist < 0.0001f) dist = 0.0001f;
            var n = to / dist;
            e.Face = MathF.Atan2(to.Y, to.X);

            // P3:移动淌熔痕
            if (s.Phase >= 3 && s.PhaseKind == MobPhase.Chase && e.Vel.Length() > 0.4f)
            {
                s.TrailT -= dt;
                if (s.TrailT <= 0f)
                {
                    s.TrailT = Bestiary.BossKazraTrailIntervalS;
                    w.Zones.Add(new Zone
                    {
                        Pos = e.Pos, RadiusM = Bestiary.BossKazraTrailRadiusM,
                        LifeS = Bestiary.BossKazraTrailLifeS, TickS = Bestiary.BossKazraTrailTickS,
                        Atk = e.Unit.Atk, Mult = Bestiary.BossKazraTrailMult,
                        Element = Element.Fire, PlayerTeam = false,
                    });
                }
            }

            switch (s.PhaseKind)
            {
                case MobPhase.Chase:
                {
                    bool keep = dist > 2.5f;
                    e.Vel = keep ? n * Bestiary.Of(EnemyKind.BossKazra).Speed : Vector2.Zero; // speed=2.2

                    if (dist < Bestiary.BossKazraBodyRadius + 0.3f + 0.125f)
                        HurtPlayer(w, e.Unit.Atk * 0.9f);

                    s.VolleyCd -= dt;
                    if (s.VolleyCd <= 0f)
                    {
                        s.VolleyCd = Bestiary.BossKazraVolleyCd * haste;
                        int count = (int)Bestiary.BossKazraVolleyCount + (s.Phase == 3 ? 2 : 0);
                        float spread = Bestiary.BossKazraVolleySpreadDeg * MathF.PI / 180f;
                        float baseAng = MathF.Atan2(to.Y, to.X);
                        for (int i = 0; i < count; i++)
                        {
                            float a = baseAng + (i - (count - 1) / 2f) * spread;
                            SpawnEnemyShot(w, e, a, Bestiary.BossKazraVolleySpeedM, Bestiary.BossKazraVolleyRadiusM,
                                Bestiary.BossKazraVolleyMult, Bestiary.BossKazraVolleyLifeS, Element.Fire, 0.62f);
                        }
                    }

                    if (s.Phase >= 2)
                    {
                        s.BurrowCd -= dt;
                        if (s.BurrowCd <= 0f)
                        {
                            s.BurrowCd = Bestiary.BossKazraBurrowCd * haste;
                            s.PhaseKind = MobPhase.Burrow;
                            s.DivesLeft = (int)Bestiary.BossKazraBurrowDives;
                            s.T = 0.4f;
                        }

                        s.SummonCd -= dt;
                        if (s.SummonCd <= 0f && CountKind(w, EnemyKind.CinderRat) < 5)
                        {
                            s.SummonCd = Bestiary.BossKazraSummonCd * haste;
                            for (int i = 0; i < (int)Bestiary.BossKazraSummonCount; i++)
                            {
                                float a = (float)(_rng.NextDouble()) * MathF.PI * 2f;
                                SpawnMinion?.Invoke(EnemyKind.CinderRat,
                                    e.Pos + new Vector2(MathF.Cos(a), MathF.Sin(a)) * 1.45f);
                            }
                        }
                    }
                    break;
                }
                case MobPhase.Burrow:
                {
                    // 地下潜行:0.4s 后在玩家脚下放预警并瞬移过去
                    e.Vel = Vector2.Zero;
                    s.T -= dt;
                    if (s.T > 0f) break;
                    TelegraphSystem.Add(w, w.Player.Pos, Bestiary.BossKazraBurrowRadiusM,
                        Bestiary.BossKazraBurrowTelegraphS, e.Unit.Atk, Bestiary.BossKazraBurrowMult,
                        Element.Fire, true);
                    e.Pos = w.Player.Pos; // 钻出点 = 本次预警中心
                    s.DivesLeft--;
                    s.PhaseKind = MobPhase.Surface;
                    s.T = Bestiary.BossKazraBurrowTelegraphS + 0.1f;
                    break;
                }
                default: // Surface(钻出硬直窗口)
                {
                    e.Vel = Vector2.Zero;
                    s.T -= dt;
                    if (s.T > 0f) break;
                    if (s.DivesLeft > 0)
                    {
                        s.PhaseKind = MobPhase.Burrow;
                        s.T = 0.35f;
                    }
                    else
                    {
                        s.PhaseKind = MobPhase.Chase;
                    }
                    break;
                }
            }
        }

        // ---------- 工具 ----------

        private readonly Random _rng = new(0x5EED1);

        private static int CountKind(LogicWorld w, EnemyKind k)
        {
            int c = 0;
            foreach (var e in w.Enemies) if (e.Kind == k) c++;
            return c;
        }

        private static void SpawnEnemyShot(LogicWorld w, Actor e, float angleRad, float speedM, float radiusM,
            float mult, float lifeS, Element element, float muzzleM)
        {
            var dir = new Vector2(MathF.Cos(angleRad), MathF.Sin(angleRad));
            w.Projectiles.Add(new Projectile
            {
                Pos = e.Pos + dir * muzzleM,
                Vel = dir * speedM,
                RadiusM = radiusM,
                LifeS = lifeS,
                Mult = mult,
                Element = element,
                Owner = e.Unit,
                PlayerTeam = false,
            });
        }

        private static void HurtPlayer(LogicWorld w, float amount)
        {
            if (w.PlayerInvulnerable || w.Player == null) return;
            w.Player.Unit.Hp -= amount;
        }
    }
}
