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
            /// <summary>南弥尔:招式轮换下标(镜像 web BossNanmir.attackIdx)</summary>
            public int AttackIdx;
            /// <summary>南弥尔:浮游/施法状态</summary>
            public MobPhase NanmirPhase = MobPhase.Idle;
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
                if (e.Kind != EnemyKind.BossVelsha && e.Kind != EnemyKind.BossKazra
                    && e.Kind != EnemyKind.BossNanmir) continue;
                if (!_states.TryGetValue(e, out var s)) { s = new BossState(); _states[e] = s; }
                e.Unit.FaceRad = e.Face;
                if (e.Unit.StunT > 0 || !alive)
                {
                    e.Vel = Vector2.Zero;
                    continue;
                }
                if (e.Kind == EnemyKind.BossVelsha) Velsha(w, e, s, dt);
                else if (e.Kind == EnemyKind.BossKazra) Kazra(w, e, s, dt);
                else Nanmir(w, e, s, dt);
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
            string msg = e.Kind switch
            {
                EnemyKind.BossVelsha => phase == 2 ? "❄ 薇尔莎:「让暴风雪…吞没你」" : "❄❄ 薇尔莎狂怒:寒风呼啸!",
                EnemyKind.BossKazra => phase == 2 ? "🔥 卡兹拉钻入流沙……小心脚下!" : "🔥🔥 卡兹拉熔核暴走:大地在燃烧!",
                _ => phase == 2 ? "南弥尔踉跄了!全力输出!" : "南弥尔狂暴了!",
            };
            OnPhaseChanged?.Invoke(e, phase, msg);
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


        // ================== 一章 Boss:腐木巨像·南弥尔 ==================

        /// <summary>
        /// P1 藤鞭横扫 + 根须直线 → P2(65%)召唤菇灵 + 地刺矩阵 → P3(30%)根须风暴。
        /// 阶段转换给 2s 硬直(staggerS)当输出窗口;招式按 attackIdx 轮换(镜像 web BossSystem)。
        /// </summary>
        private void Nanmir(LogicWorld w, Actor e, BossState s, float dt)
        {
            s.AnimT += dt;
            float ratio = e.Unit.HpMax > 0f ? e.Unit.Hp / e.Unit.HpMax : 1f;

            // 阶段转换 = 硬直(输出窗口),同时打断当前招式
            if (s.Phase == 1 && ratio <= Bestiary.BossNanmirPhase2At) { SetPhase(e, s, 2); Stagger(s); }
            else if (s.Phase == 2 && ratio <= Bestiary.BossNanmirPhase3At) { SetPhase(e, s, 3); Stagger(s); }

            var to = w.Player.Pos - e.Pos;
            float dist = to.Length();
            if (dist < 0.0001f) dist = 0.0001f;
            var n = to / dist;
            e.Face = MathF.Atan2(to.Y, to.X);

            switch (s.NanmirPhase)
            {
                case MobPhase.Telegraph: // 硬直(踉跄)
                {
                    e.Vel = Vector2.Zero;
                    s.T -= dt;
                    if (s.T <= 0f) { s.NanmirPhase = MobPhase.Idle; s.T = Bestiary.BossNanmirIdleS; }
                    break;
                }
                case MobPhase.Aim: // 施法后摇
                {
                    e.Vel = Vector2.Zero;
                    s.T -= dt;
                    if (s.T <= 0f)
                    {
                        s.NanmirPhase = MobPhase.Idle;
                        s.T = Bestiary.BossNanmirIdleS * (s.Phase == 3 ? 0.7f : 1f);
                    }
                    break;
                }
                default:
                {
                    // 缓慢逼近(超过 3m 才走)
                    float speed = Bestiary.Of(EnemyKind.BossNanmir).Speed;
                    e.Vel = dist > 3f ? n * speed : Vector2.Zero;
                    s.T -= dt;
                    if (s.T <= 0f)
                    {
                        s.T = CastNanmir(w, e, s);
                        s.NanmirPhase = MobPhase.Aim;
                    }
                    break;
                }
            }
        }

        private void Stagger(BossState s)
        {
            s.NanmirPhase = MobPhase.Telegraph;
            s.T = Bestiary.BossNanmirStaggerS;
        }

        /// <summary>按阶段轮换招式;返回施法后摇秒数(镜像 web cast 的 patterns 列表)。</summary>
        private float CastNanmir(LogicWorld w, Actor e, BossState s)
        {
            var patterns = new List<Func<float>> { () => VineSweep(w, e), () => RootLine(w, e) };
            if (s.Phase >= 2)
            {
                patterns.Add(() => SpikeGrid(w, e));
                patterns.Add(() => SummonShroomlings(w, e));
            }
            if (s.Phase >= 3) patterns.Add(() => Storm(w, e));

            var pick = patterns[s.AttackIdx % patterns.Count];
            s.AttackIdx++;
            return pick();
        }

        /// <summary>P1 藤鞭横扫:面前 5 段弧形预警带(±2 × 36°)。</summary>
        private float VineSweep(LogicWorld w, Actor e)
        {
            for (int i = -2; i <= 2; i++)
            {
                float a = e.Face + i * MathF.PI / 5f;
                var at = e.Pos + new Vector2(MathF.Cos(a), MathF.Sin(a)) * Bestiary.BossNanmirSweepRangeM;
                TelegraphSystem.Add(w, at, Bestiary.BossNanmirSweepRadiusM, Bestiary.BossNanmirSweepTelegraphS,
                    e.Unit.Atk, Bestiary.BossNanmirSweepMult, null, true);
            }
            return Bestiary.BossNanmirSweepTelegraphS + 0.4f;
        }

        /// <summary>P1 根须直线:朝玩家方向 6 段依次升起(每段晚 stepS 起爆)。</summary>
        private float RootLine(LogicWorld w, Actor e)
        {
            var to = w.Player.Pos - e.Pos;
            float a = MathF.Atan2(to.Y, to.X);
            var dir = new Vector2(MathF.Cos(a), MathF.Sin(a));
            int count = (int)Bestiary.BossNanmirRootlineCount;
            for (int i = 1; i <= count; i++)
            {
                var at = e.Pos + dir * (Bestiary.BossNanmirRootlineSpacingM * i);
                TelegraphSystem.Add(w, at, Bestiary.BossNanmirRootlineRadiusM,
                    Bestiary.BossNanmirRootlineTelegraphS + Bestiary.BossNanmirRootlineStepS * i,
                    e.Unit.Atk, Bestiary.BossNanmirRootlineMult, null, true);
            }
            return Bestiary.BossNanmirRootlineTelegraphS + Bestiary.BossNanmirRootlineStepS * count + 0.3f;
        }

        /// <summary>P2 地刺矩阵:玩家周围一圈随机落点(每处起爆时间带点抖动)。</summary>
        private float SpikeGrid(LogicWorld w, Actor e)
        {
            int count = (int)Bestiary.BossNanmirSpikegridCount;
            for (int i = 0; i < count; i++)
            {
                float a = (float)_rng.NextDouble() * MathF.PI * 2f;
                float r = (float)_rng.NextDouble() * Bestiary.BossNanmirSpikegridSpreadM;
                var at = w.Player.Pos + new Vector2(MathF.Cos(a), MathF.Sin(a)) * r;
                TelegraphSystem.Add(w, at, Bestiary.BossNanmirSpikegridRadiusM,
                    Bestiary.BossNanmirSpikegridTelegraphS + (float)_rng.NextDouble() * 0.4f,
                    e.Unit.Atk, Bestiary.BossNanmirSpikegridMult, null, true);
            }
            return Bestiary.BossNanmirSpikegridTelegraphS + 0.6f;
        }

        /// <summary>P2 召唤菇灵 ×4(镜像 web:按 depth 8 缩放)。</summary>
        private float SummonShroomlings(LogicWorld w, Actor e)
        {
            int count = (int)Bestiary.BossNanmirSummonCount;
            for (int i = 0; i < count; i++)
            {
                float a = i / (float)count * MathF.PI * 2f;
                SpawnMinion?.Invoke(EnemyKind.Shroomling,
                    e.Pos + new Vector2(MathF.Cos(a), MathF.Sin(a)) * 2f);
            }
            return 1.0f;
        }

        /// <summary>P3 根须风暴:三环波次,每环留 2 个错位缺口(镜像 web storm)。</summary>
        private float Storm(LogicWorld w, Actor e)
        {
            int perRing = (int)Bestiary.BossNanmirStormPerRing;
            int gapLanes = (int)Bestiary.BossNanmirStormGapLanes;
            int gapStart = _rng.Next(perRing);
            float[] rings = { Bestiary.BossNanmirStormRings0, Bestiary.BossNanmirStormRings1, Bestiary.BossNanmirStormRings2 };
            for (int ringIdx = 0; ringIdx < rings.Length; ringIdx++)
            {
                for (int i = 0; i < perRing; i++)
                {
                    int gi = (i - gapStart - ringIdx) % perRing;
                    if (gi >= 0 && gi < gapLanes) continue; // 留安全缺口(每环错位)
                    float a = i / (float)perRing * MathF.PI * 2f;
                    var at = e.Pos + new Vector2(MathF.Cos(a), MathF.Sin(a)) * rings[ringIdx];
                    TelegraphSystem.Add(w, at, Bestiary.BossNanmirStormRadiusM,
                        Bestiary.BossNanmirStormTelegraphS + ringIdx * 0.25f,
                        e.Unit.Atk, Bestiary.BossNanmirStormMult, null, true);
                }
            }
            return Bestiary.BossNanmirStormTelegraphS + rings.Length * 0.25f + 0.4f;
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
