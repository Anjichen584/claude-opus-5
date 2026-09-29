using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;
using StarfallKnights.Data;

namespace StarfallKnights.Dungeon
{
    /// <summary>怪物行为状态(各怪共用的状态机标签,按种类只用到子集)。</summary>
    public enum MobPhase { Chase, Wander, Telegraph, Dash, Aim, Recover, Orbit, Growl, Pounce, Windup, Idle, Hop, Burrow, Surface, Spin, Hover, Dive, Drop, Crawl, Flee }

    /// <summary>每只怪一份的可变状态。</summary>
    public sealed class MobState
    {
        public MobPhase Phase = MobPhase.Chase;
        public float T, Cd, ContactCd, AnimT, HopCd, LobCd, TrailT, WanderT;
        public float DirX, DirY;       // 冲锋/俯冲/扑击方向
        public float ZigDir = 1f, CircleDir = 1f;
        public Vector2 Mark;           // 预警/抛掷落点
        public bool Split;             // 霜核史莱姆已分裂
    }

    /// <summary>
    /// 杂兵 AI(镜像 web EnemySystem/CritterSystem/EliteSystem/TundraSystem/DesertSystem)。
    /// 纯逻辑:自己推位置、自己结算接触伤害与投射物,宿主只负责表现。
    /// 三种"数据里有但 web 未实现"的字段保持不消费:菇灵 spore、史莱姆 split、剑士 pullM。
    /// </summary>
    public sealed class CreatureAI
    {
        private readonly Dictionary<Actor, MobState> _states = new();
        /// <summary>异常(死亡/换房)时清理。</summary>
        public void Clear() => _states.Clear();
        public void Forget(Actor a) => _states.Remove(a);

        /// <summary>确定性随机(行为里的轻微抖动用;固定种子便于复现问题)。</summary>
        private static readonly Rng RngSrc = new(0xBEEF01);

        private static float Rnd() => (float)RngSrc.Next();

        private const float PlayerRadiusM = 0.3f;
        private const float ContactPad = 4f / Balance.PxPerM; // web 里的 +4px

        public void Update(LogicWorld w, float dt)
        {
            var p = w.Player;
            if (p == null) return;
            bool playerAlive = p.Unit.Hp > 0;

            for (int i = w.Enemies.Count - 1; i >= 0; i--)
            {
                var e = w.Enemies[i];
                if (!_states.TryGetValue(e, out var st))
                {
                    st = new MobState
                    {
                        Cd = 0f,
                        CircleDir = (u(e) % 2 == 0) ? 1f : -1f,
                        ZigDir = (u(e) % 2 == 0) ? 1f : -1f,
                    };
                    _states[e] = st;
                }

                e.Unit.FaceRad = e.Face;
                if (e.Unit.StunT > 0 || !playerAlive)
                {
                    e.Vel = Vector2.Zero;
                    continue;
                }

                float slow = e.Unit.SlowT > 0 ? 1f - e.Unit.SlowPct : 1f;
                switch (e.Kind)
                {
                    case EnemyKind.Shroomling: Shroomling(w, e, st, dt, slow); break;
                    case EnemyKind.WindBee: WindBee(w, e, st, dt, slow); break;
                    case EnemyKind.BlightWolf: BlightWolf(w, e, st, dt, slow); break;
                    case EnemyKind.ThornVine: ThornVine(w, e, st, dt); break;
                    case EnemyKind.OakGolem: OakGolem(w, e, st, dt, slow); break;
                    case EnemyKind.EmberImp: Kiter(w, e, st, dt, slow,
                        Bestiary.EmberImpKeepMinM, Bestiary.EmberImpKeepMaxM,
                        Bestiary.EmberImpFireballCd, Bestiary.EmberImpFireballAimS,
                        Bestiary.EmberImpFireballSpeedM, Bestiary.EmberImpFireballRadiusM,
                        Bestiary.EmberImpFireballMult, Bestiary.EmberImpFireballLifeS,
                        Element.Fire, 1); break;
                    case EnemyKind.FrostSlime: FrostSlime(w, e, st, dt, slow); break;
                    case EnemyKind.SparkLizard: SparkLizard(w, e, st, dt, slow); break;
                    case EnemyKind.ToxinToad: Lober(w, e, st, dt, slow,
                        Bestiary.ToxinToadLobCd, Bestiary.ToxinToadLobAimS, Bestiary.ToxinToadLobRangeM,
                        Bestiary.ToxinToadLobZoneRadiusM, Bestiary.ToxinToadLobZoneLifeS,
                        Bestiary.ToxinToadLobTickS, Bestiary.ToxinToadLobMult,
                        Bestiary.ToxinToadHopCd, Bestiary.ToxinToadHopDur, Bestiary.ToxinToadHopSpeedM,
                        Element.Toxin); break;
                    case EnemyKind.StardustSprite: StardustSprite(w, e, st, dt, slow); break;
                    case EnemyKind.SnowPuff: SnowPuff(w, e, st, dt, slow); break;
                    case EnemyKind.IceTurtle: IceTurtle(w, e, st, dt, slow); break;
                    case EnemyKind.BlizzardHawk: BlizzardHawk(w, e, st, dt, slow); break;
                    case EnemyKind.FrostMage: Kiter(w, e, st, dt, slow,
                        Bestiary.FrostMageKeepMinM, Bestiary.FrostMageKeepMaxM,
                        Bestiary.FrostMageBoltCd, Bestiary.FrostMageBoltAimS,
                        Bestiary.FrostMageBoltSpeedM, Bestiary.FrostMageBoltRadiusM,
                        Bestiary.FrostMageBoltMult, Bestiary.FrostMageBoltLifeS,
                        Element.Ice, 1); break;
                    case EnemyKind.CinderRat: CinderRat(w, e, st, dt, slow); break;
                    case EnemyKind.DuneBeetle: DuneBeetle(w, e, st, dt, slow); break;
                    case EnemyKind.FlameDancer: FlameDancer(w, e, st, dt, slow); break;
                    case EnemyKind.DustStinger: Lober(w, e, st, dt, slow,
                        Bestiary.DustStingerLobCd, Bestiary.DustStingerLobAimS, Bestiary.DustStingerLobRangeM,
                        Bestiary.DustStingerLobZoneRadiusM, Bestiary.DustStingerLobZoneLifeS,
                        Bestiary.DustStingerLobTickS, Bestiary.DustStingerLobMult,
                        Bestiary.DustStingerHopCd, Bestiary.DustStingerHopDur, Bestiary.DustStingerHopSpeedM,
                        Element.Toxin); break;
                    // 三个 Boss 全部由 BossAI 接管(这里必须显式跳过,否则两套 AI 抢速度)
                    case EnemyKind.BossNanmir:
                    case EnemyKind.BossVelsha:
                    case EnemyKind.BossKazra:
                        break;
                    default: BasicChase(w, e, st, dt, slow); break;
                }

                // 位移(逻辑层自己推,宿主只同步视图;与 web 的 Velocity→PhysicsSystem 等价)
                e.Pos += e.Vel * dt;
            }
        }

        private static uint u(Actor a) => (uint)(a.Pos.X * 1000f + a.Pos.Y * 7f);

        // ---------- 通用工具 ----------

        private static (float dx, float dy, float dist, float nx, float ny) ToPlayer(LogicWorld w, Actor e)
        {
            var to = w.Player.Pos - e.Pos;
            float d = to.Length();
            if (d < 0.0001f) return (0f, 0f, 0.0001f, 1f, 0f);
            return (to.X, to.Y, d, to.X / d, to.Y / d);
        }

        private static void Touch(LogicWorld w, Actor e, MobState st, float dist, float mult = 1f)
        {
            if (st.ContactCd > 0f) return;
            var stat = Bestiary.Of(e.Kind);
            if (dist > stat.BodyRadius + PlayerRadiusM + ContactPad) return;
            st.ContactCd = stat.ContactCd;
            HurtPlayer(w, e.Unit.Atk * mult);
        }

        /// <summary>玩家受伤:尊重无敌帧(宿主每帧写 w.PlayerInvulnerable)。</summary>
        private static void HurtPlayer(LogicWorld w, float amount)
        {
            if (w.PlayerInvulnerable || w.Player == null) return;
            w.Player.Unit.Hp -= amount;
        }

        private static void ShootAtPlayer(LogicWorld w, Actor e, Vector2 dir, float speedM, float radiusM,
            float mult, float lifeS, Element? element, float muzzleM = 0.33f)
        {
            var p = w.Player;
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

        private static void ClampArc(LogicWorld w, Actor e, ref Vector2 vel)
        {
            // 简易回避:避免长时间贴脸重叠(web 由 Body 碰撞解决,这里给一点分离力)
            var p = w.Player;
            float d = Vector2.Distance(e.Pos, p.Pos);
            if (d < 0.6f)
            {
                var away = (e.Pos - p.Pos);
                if (away.LengthSquared() > 0.0001f) vel += Vector2.Normalize(away) * 1.2f;
            }
        }

        // ---------- 一章 基础四件套 ----------

        private static void BasicChase(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            e.Face = MathF.Atan2(dy, dx);
            e.Vel = new Vector2(nx, ny) * s.Speed * slow;
            Touch(w, e, st, dist, 1f);
        }

        /// <summary>菇灵:警戒距离内追击,超出则游荡(web:追到就撞,无技能)。</summary>
        private static void Shroomling(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            e.Face = MathF.Atan2(dy, dx);
            if (dist < Bestiary.ShroomlingAggroRange)
            {
                e.Vel = new Vector2(nx, ny) * s.Speed * slow;
            }
            else
            {
                st.WanderT -= dt;
                if (st.WanderT <= 0f)
                {
                    st.WanderT = 1.5f + (float)Rnd() * 1.5f;
                    st.DirX = (float)(Rnd() * 2.0 - 1.0);
                    st.DirY = (float)(Rnd() * 2.0 - 1.0);
                }
                e.Vel = new Vector2(st.DirX, st.DirY) * Bestiary.ShroomlingWanderSpeed * slow;
            }
            Touch(w, e, st, dist, 1f);
        }

        /// <summary>风蜂:环绕 → 抖动预警 → 直线俯冲。</summary>
        private static void WindBee(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            switch (st.Phase)
            {
                case MobPhase.Orbit:
                {
                    var tang = new Vector2(-ny * st.CircleDir, nx * st.CircleDir);
                    float radial = dist > Bestiary.WindBeeOrbitRadiusM + 0.4f ? 1f
                        : dist < Bestiary.WindBeeOrbitRadiusM - 0.4f ? -1f : 0f;
                    var v = (tang + new Vector2(nx, ny) * radial) * s.Speed * slow;
                    float cap = s.Speed; // 环绕速度上限(web 同样是 moveSpeed)
                    if (v.Length() > cap && v.Length() > 0.0001f) v = Vector2.Normalize(v) * cap;
                    e.Vel = v;
                    e.Face = MathF.Atan2(e.Vel.Y, e.Vel.X);
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Telegraph; st.T = Bestiary.WindBeeTelegraphS; }
                    break;
                }
                case MobPhase.Telegraph:
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(dy, dx);
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.DirX = nx;
                        st.DirY = ny;
                        st.Phase = MobPhase.Dive;
                        st.T = Bestiary.WindBeeDiveDur;
                    }
                    break;
                }
                default:
                {
                    e.Vel = new Vector2(st.DirX, st.DirY) * Bestiary.WindBeeDiveSpeed;
                    e.Face = MathF.Atan2(st.DirY, st.DirX);
                    Touch(w, e, st, dist, 1f);
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Orbit;
                        st.T = Bestiary.WindBeeDiveIntervalMin
                            + (float)Rnd() * (Bestiary.WindBeeDiveIntervalMax - Bestiary.WindBeeDiveIntervalMin);
                        st.CircleDir = -st.CircleDir;
                    }
                    break;
                }
            }
            st.AnimT += dt;
        }

        /// <summary>蚀化狼:绕圈 → 低吼预警 → 扑击 → 硬直(输出窗口)。</summary>
        private static void BlightWolf(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            switch (st.Phase)
            {
                case MobPhase.Chase:
                {
                    // 绕圈接近
                    var tang = new Vector2(-ny * st.CircleDir, nx * st.CircleDir);
                    float radial = dist > Bestiary.BlightWolfCircleRadiusM ? 1f : -0.6f;
                    e.Vel = (tang * 0.7f + new Vector2(nx, ny) * radial) * s.Speed * slow;
                    e.Face = MathF.Atan2(dy, dx);
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Growl; st.T = Bestiary.BlightWolfGrowlS; }
                    break;
                }
                case MobPhase.Growl:
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(dy, dx);
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.DirX = nx; st.DirY = ny;
                        st.Phase = MobPhase.Pounce;
                        st.T = Bestiary.BlightWolfPounceDur;
                    }
                    break;
                }
                case MobPhase.Pounce:
                {
                    e.Vel = new Vector2(st.DirX, st.DirY) * Bestiary.BlightWolfPounceSpeed;
                    Touch(w, e, st, dist, 1f);
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Recover; st.T = Bestiary.BlightWolfRecoverS; }
                    break;
                }
                default: // Recover:硬直
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Chase;
                        st.T = Bestiary.BlightWolfCircleTimeMin
                            + (float)Rnd() * (Bestiary.BlightWolfCircleTimeMax - Bestiary.BlightWolfCircleTimeMin);
                        st.CircleDir = -st.CircleDir;
                    }
                    break;
                }
            }
            st.AnimT += dt;
        }

        /// <summary>荆棘藤妖:固定炮台,节拍在玩家脚下放地刺预警。</summary>
        private static void ThornVine(LogicWorld w, Actor e, MobState st, float dt)
        {
            var s = Bestiary.Of(e.Kind);
            e.Vel = Vector2.Zero;
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            e.Face = MathF.Atan2(dy, dx);
            st.T -= dt;
            if (st.T > 0f || dist > Bestiary.ThornVineRangeM) return;
            st.T = Bestiary.ThornVineIdleS + Bestiary.ThornVineTelegraphS;
            TelegraphSystem.Add(w, w.Player.Pos, Bestiary.ThornVineSpikeRadiusM, Bestiary.ThornVineTelegraphS,
                e.Unit.Atk, 1f, null, true);
        }

        /// <summary>橡木傀儡(精英):追击 → 拍地预警 → 硬直;背部弱点 ×2 走伤害管线。</summary>
        private static void OakGolem(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            e.Face = MathF.Atan2(dy, dx);
            switch (st.Phase)
            {
                case MobPhase.Telegraph:
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Recover; st.T = 0.7f; }
                    break;
                }
                case MobPhase.Recover:
                {
                    e.Vel = Vector2.Zero;
                    Touch(w, e, st, dist, 1f);
                    st.T -= dt;
                    if (st.T <= 0f) st.Phase = MobPhase.Chase;
                    break;
                }
                default:
                {
                    e.Vel = new Vector2(nx, ny) * s.Speed * slow;
                    st.T -= dt;
                    if (dist <= Bestiary.OakGolemSlamRangeM && st.T <= 0f)
                    {
                        st.Phase = MobPhase.Telegraph;
                        st.T = Bestiary.OakGolemSlamTelegraphS;
                        TelegraphSystem.Add(w, w.Player.Pos, Bestiary.OakGolemSlamRadiusM,
                            Bestiary.OakGolemSlamTelegraphS, e.Unit.Atk, 1f, null, true);
                        st.Cd = Bestiary.OakGolemSlamCdS;
                    }
                    else if (st.T <= 0f)
                    {
                        st.T = MathF.Max(0.1f, st.Cd);
                    }
                    break;
                }
            }
        }

        // ---------- 元素杂兵 ----------

        /// <summary>风筝型(烬火小鬼/霜语法师):保持距离 + 蓄力弹。</summary>
        private static void Kiter(LogicWorld w, Actor e, MobState st, float dt, float slow,
            float keepMin, float keepMax, float cd, float aimS, float speedM, float radiusM,
            float mult, float lifeS, Element element, int shots)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            e.Face = MathF.Atan2(dy, dx);
            switch (st.Phase)
            {
                case MobPhase.Aim:
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        float spread = shots > 1 ? Bestiary.FlameDancerTwinshotSpreadDeg * MathF.PI / 180f : 0f;
                        for (int i = 0; i < shots; i++)
                        {
                            float off = shots > 1 ? (i - (shots - 1) / 2f) * spread : 0f;
                            float a = MathF.Atan2(dy, dx) + off;
                            ShootAtPlayer(w, e, new Vector2(MathF.Cos(a), MathF.Sin(a)),
                                speedM, radiusM, mult, lifeS, element);
                        }
                        st.Phase = MobPhase.Recover;
                        st.T = 0.35f;
                    }
                    break;
                }
                case MobPhase.Recover:
                {
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Chase;
                        st.Cd = cd;
                    }
                    break;
                }
                default:
                {
                    Vector2 dir;
                    if (dist < keepMin) dir = new Vector2(-nx, -ny);
                    else if (dist > keepMax) dir = new Vector2(nx, ny);
                    else dir = new Vector2(-ny * st.CircleDir, nx * st.CircleDir);
                    e.Vel = dir * s.Speed * slow;
                    st.Cd -= dt;
                    if (st.Cd <= 0f && dist < keepMax + 1.5f)
                    {
                        st.Phase = MobPhase.Aim;
                        st.T = aimS;
                    }
                    break;
                }
            }
        }

        /// <summary>霜核史莱姆:蓄力跳跃接近(数据里的 split 字段 web 未消费)。</summary>
        private static void FrostSlime(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            e.Face = MathF.Atan2(dy, dx);
            if (st.T > 0f) { st.T -= dt; }
            else
            {
                e.Vel = Vector2.Zero;
                st.Cd -= dt;
                if (st.Cd <= 0f)
                {
                    st.T = Bestiary.FrostSlimeHopDur;
                    st.Cd = Bestiary.FrostSlimeHopCd + Bestiary.FrostSlimeHopDur;
                    e.Vel = new Vector2(nx, ny) * Bestiary.FrostSlimeHopSpeedM * slow;
                }
            }
            Touch(w, e, st, dist, 1f);
        }

        /// <summary>雷纹蜥:抖动预警 → 闪电冲撞。</summary>
        private static void SparkLizard(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            switch (st.Phase)
            {
                case MobPhase.Telegraph:
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(dy, dx);
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.DirX = nx; st.DirY = ny;
                        st.Phase = MobPhase.Dash;
                        st.T = Bestiary.SparkLizardDashDur;
                    }
                    break;
                }
                case MobPhase.Dash:
                {
                    e.Vel = new Vector2(st.DirX, st.DirY) * Bestiary.SparkLizardDashSpeedM;
                    Touch(w, e, st, dist, 1f);
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Chase; st.Cd = Bestiary.SparkLizardDashCd; }
                    break;
                }
                default:
                {
                    e.Vel = new Vector2(nx, ny) * s.Speed * slow;
                    e.Face = MathF.Atan2(dy, dx);
                    st.Cd -= dt;
                    if (st.Cd <= 0f)
                    {
                        st.Phase = MobPhase.Telegraph;
                        st.T = Bestiary.SparkLizardDashTelegraphS;
                    }
                    break;
                }
            }
        }

        /// <summary>抛掷型(毒沼蟾/岩尾蝎):吊射在玩家脚下生成毒沼地带。</summary>
        private static void Lober(LogicWorld w, Actor e, MobState st, float dt, float slow,
            float lobCd, float aimS, float rangeM, float zoneR, float zoneLife, float tickS, float mult,
            float hopCd, float hopDur, float hopSpeedM, Element element)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            e.Face = MathF.Atan2(dy, dx);
            switch (st.Phase)
            {
                case MobPhase.Aim:
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        w.Zones.Add(new Zone
                        {
                            Pos = w.Player.Pos, RadiusM = zoneR, LifeS = zoneLife, TickS = tickS,
                            Atk = e.Unit.Atk, Mult = mult, Element = element, PlayerTeam = false,
                        });
                        st.Phase = MobPhase.Idle;
                        st.LobCd = lobCd;
                    }
                    break;
                }
                case MobPhase.Hop:
                {
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Idle; st.HopCd = hopCd; }
                    break;
                }
                default:
                {
                    e.Vel = Vector2.Zero;
                    st.LobCd -= dt;
                    if (st.LobCd <= 0f && dist < rangeM)
                    {
                        st.Phase = MobPhase.Aim;
                        st.T = aimS;
                    }
                    else
                    {
                        st.HopCd -= dt;
                        if (st.HopCd <= 0f && dist > 2f)
                        {
                            st.Phase = MobPhase.Hop;
                            st.T = hopDur;
                            e.Vel = new Vector2(nx, ny) * hopSpeedM * slow;
                        }
                    }
                    break;
                }
            }
            Touch(w, e, st, dist, e.Kind == EnemyKind.DustStinger ? 0.7f : 1f);
        }

        /// <summary>星尘精灵:逃跑,存活 lifeS 秒后自己消失(掉落由宿主接)。</summary>
        private static void StardustSprite(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            st.AnimT += dt;
            e.Vel = new Vector2(-nx, -ny) * s.Speed * slow;
            e.Face = MathF.Atan2(-dy, -dx);
            if (st.AnimT >= Bestiary.StardustSpriteLifeS) e.Unit.Hp = 0f; // 到期逃走(宿主按 Kind 决定不给掉落)
        }

        // ---------- 二章 霜语冰原 ----------

        /// <summary>雪绒球:缓慢逼近 → 蓄力滚撞。</summary>
        private static void SnowPuff(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            e.Face = MathF.Atan2(dy, dx);
            if (st.T > 0f)
            {
                st.T -= dt; // 滚动中保持冲量
            }
            else
            {
                e.Vel = new Vector2(nx, ny) * s.Speed * 0.45f * slow;
                st.Cd -= dt;
                if (st.Cd <= 0f && dist < 5f)
                {
                    st.T = Bestiary.SnowPuffRollDur;
                    st.Cd = Bestiary.SnowPuffRollCd + Bestiary.SnowPuffRollDur;
                    e.Vel = new Vector2(nx, ny) * Bestiary.SnowPuffRollSpeedM * slow;
                }
            }
            Touch(w, e, st, dist, 1f);
        }

        /// <summary>冰壳龟:龟速爬行 → 抖壳预警 → 旋壳冲撞(接触 1.2 倍)。</summary>
        private static void IceTurtle(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            switch (st.Phase)
            {
                case MobPhase.Crawl:
                {
                    e.Face = MathF.Atan2(dy, dx);
                    e.Vel = new Vector2(nx, ny) * s.Speed * slow;
                    st.Cd -= dt;
                    if (st.Cd <= 0f && dist < 4.5f)
                    {
                        st.Phase = MobPhase.Telegraph;
                        st.T = Bestiary.IceTurtleSpinTelegraphS;
                        st.DirX = nx; st.DirY = ny;
                    }
                    break;
                }
                case MobPhase.Telegraph:
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Spin; st.T = Bestiary.IceTurtleSpinDur; }
                    break;
                }
                default:
                {
                    e.Vel = new Vector2(st.DirX, st.DirY) * Bestiary.IceTurtleSpinSpeedM;
                    Touch(w, e, st, dist, 1.2f);
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Crawl; st.Cd = Bestiary.IceTurtleSpinCd; }
                    break;
                }
            }
        }

        /// <summary>风雪隼:绕玩家环绕 → 定住 → 俯冲。</summary>
        private static void BlizzardHawk(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            switch (st.Phase)
            {
                case MobPhase.Hover:
                {
                    var tang = new Vector2(-ny * st.CircleDir, nx * st.CircleDir);
                    float radial = dist > 3.4f ? 1f : dist < 2.6f ? -1f : 0f;
                    e.Vel = (tang + new Vector2(nx, ny) * radial * 0.8f) * s.Speed * slow;
                    e.Face = MathF.Atan2(e.Vel.Y, e.Vel.X);
                    st.Cd -= dt;
                    if (st.Cd <= 0f)
                    {
                        st.Phase = MobPhase.Telegraph;
                        st.T = Bestiary.BlizzardHawkDiveTelegraphS;
                        st.DirX = nx; st.DirY = ny;
                    }
                    break;
                }
                case MobPhase.Telegraph:
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(st.DirY, st.DirX);
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Dive; st.T = Bestiary.BlizzardHawkDiveDur; }
                    break;
                }
                default:
                {
                    e.Vel = new Vector2(st.DirX, st.DirY) * Bestiary.BlizzardHawkDiveSpeedM;
                    Touch(w, e, st, dist, 1f);
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Hover;
                        st.Cd = Bestiary.BlizzardHawkDiveCd;
                        st.CircleDir = -st.CircleDir;
                    }
                    break;
                }
            }
        }

        // ---------- 三章 烬语荒漠 ----------

        /// <summary>烬鼠:Z 字高速贴脸。</summary>
        private static void CinderRat(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            st.AnimT += dt;
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            float zig = MathF.Sin(st.AnimT * 7f) * st.ZigDir * 0.7f;
            e.Vel = new Vector2(nx - ny * zig, ny + nx * zig) * s.Speed * slow;
            e.Face = MathF.Atan2(e.Vel.Y, e.Vel.X);
            Touch(w, e, st, dist, 1f);
        }

        /// <summary>沙暴甲虫:钻地接近 → 预警 → 钻出爆发 → 地表缠斗。</summary>
        private static void DuneBeetle(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var s = Bestiary.Of(e.Kind);
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            e.Face = MathF.Atan2(dy, dx);
            switch (st.Phase)
            {
                case MobPhase.Burrow:
                {
                    e.Vel = new Vector2(nx, ny) * Bestiary.DuneBeetleBurrowUnderSpeedM * slow;
                    if (dist < 1.6f)
                    {
                        st.Phase = MobPhase.Telegraph;
                        st.T = Bestiary.DuneBeetleBurrowTelegraphS;
                    }
                    break;
                }
                case MobPhase.Telegraph:
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Surface;
                        st.T = Bestiary.DuneBeetleBurrowSurfaceS;
                        // 钻出爆发:落点 = 自己位置
                        TelegraphSystem.Add(w, e.Pos, Bestiary.DuneBeetleBurrowEmergeRadiusM, 0.05f,
                            e.Unit.Atk, Bestiary.DuneBeetleBurrowEmergeMult, null, true);
                    }
                    break;
                }
                default:
                {
                    e.Vel = new Vector2(nx, ny) * s.Speed * slow;
                    Touch(w, e, st, dist, 1f);
                    st.T -= dt;
                    if (st.T <= 0f) st.Phase = MobPhase.Burrow;
                    break;
                }
            }
        }

        /// <summary>火舞妖:风筝 + 横向瞬跳 + 双火球。</summary>
        private static void FlameDancer(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            Kiter(w, e, st, dt, slow,
                Bestiary.FlameDancerKeepMinM, Bestiary.FlameDancerKeepMaxM,
                Bestiary.FlameDancerTwinshotCd, Bestiary.FlameDancerTwinshotAimS,
                Bestiary.FlameDancerTwinshotSpeedM, Bestiary.FlameDancerTwinshotRadiusM,
                Bestiary.FlameDancerTwinshotMult, Bestiary.FlameDancerTwinshotLifeS,
                Element.Fire, 2);

            // 瞬跳:横向闪身(只在自己还活着时做)
            st.HopCd -= dt;
            if (st.HopCd > 0f) return;
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            st.HopCd = 1.8f;
            float side = (Rnd() < 0.5) ? 1f : -1f;
            e.Pos += new Vector2(-ny * side, nx * side) * Bestiary.FlameDancerHopM * 0.5f;
            st.AnimT += dt;
        }
    }
}
