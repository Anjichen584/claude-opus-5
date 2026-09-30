using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;
using StarfallKnights.Data;

namespace StarfallKnights.Dungeon
{
    /// <summary>怪物行为状态(各怪共用的状态机标签,按种类只用到子集)。</summary>
    public enum MobPhase { Chase, Wander, Telegraph, Dash, Aim, Recover, Orbit, Growl, Pounce, Windup, Idle, Hop, Burrow, Surface, Spin, Hover, Dive, Drop, Crawl, Flee, Channel }

    /// <summary>每只怪一份的可变状态。</summary>
    public sealed class MobState
    {
        public MobPhase Phase = MobPhase.Chase;
        public float T, Cd, ContactCd, AnimT, HopCd, LobCd, TrailT, WanderT;
        public float DirX, DirY;       // 冲锋/俯冲/扑击方向
        public float ZigDir = 1f, CircleDir = 1f;
        public Vector2 Mark;           // 预警/抛掷落点
        public bool Split;             // 霜核史莱姆已分裂
        // 中 Boss(苔冠巨鹿):招式冷却与"这次硬直是撞墙还是撞人"
        public float ChargeCd, VolleyCd;
        public bool WallStun;
        /// <summary>上一招(true=冲撞,false=弹幕):两招各有独立冷却,只重置用掉的那个 → 自然轮换</summary>
        public bool LastWasCharge = true;
        // 中 Boss 二号(霜噬女猎):三招独立冷却 / 连射计数 / 蓄力打断
        public float BlinkCd = 2.2f, TrapCd = 4f, MarkCd = 8f;
        /// <summary>上一招:0=瞬影冰矢 1=冰牙陷阵 2=猎杀凝视(只重置用掉的那招)</summary>
        public int HuntressMove;
        public int ShotsLeft;
        public float ShotT;
        public float HpAtChannel;
        /// <summary>猎杀凝视的待结算冰枪(打断时连预警一起撤,不能只停动作)</summary>
        public readonly List<Telegraph> Lanes = new();
        // 中 Boss 三号(沙暴刽子):三招独立冷却 / 钩的飞行 / 处刑斩落点
        public float HookCd = 2.6f, CleaveCd = 4.2f, StormCd = 6.5f;
        /// <summary>上一招:0=镰钩 1=处刑斩 2=沙暴漩涡</summary>
        public int ReaperMove;
        public Vector2 HookPos, HookDir, CleaveTarget;
        public float HookDist;
        public bool HookFlying;
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
                        ChargeCd = 2.4f,   // 镜像 web:首次冲撞给玩家喘息
                        VolleyCd = 3.2f,
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
                    case EnemyKind.IceSpike: IceSpike(w, e, st, dt); break;
                    case EnemyKind.IceGlider: IceGlider(w, e, st, dt, slow); break;
                    case EnemyKind.FrostMage: Kiter(w, e, st, dt, slow,
                        Bestiary.FrostMageKeepMinM, Bestiary.FrostMageKeepMaxM,
                        Bestiary.FrostMageBoltCd, Bestiary.FrostMageBoltAimS,
                        Bestiary.FrostMageBoltSpeedM, Bestiary.FrostMageBoltRadiusM,
                        Bestiary.FrostMageBoltMult, Bestiary.FrostMageBoltLifeS,
                        Element.Ice, 1); break;
                    case EnemyKind.MidBossMossstag: MossStag(w, e, st, dt, slow); break;
                    case EnemyKind.MidBossFrosthuntress: FrostHuntress(w, e, st, dt, slow); break;
                    case EnemyKind.MidBossSandreaper: SandReaper(w, e, st, dt, slow); break;
                    case EnemyKind.MirageBlossom: MirageBlossom(w, e, st, dt); break;
                    case EnemyKind.EmberWhirl: EmberWhirl(w, e, st, dt, slow); break;
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

        // ---------- 第一章中 Boss:苔冠巨鹿(镜像 web MidBossSystem.ts) ----------
        //
        // 三招一博弈:冲撞(撞墙自晕 wallStunS = 玩家的输出窗口 / 撞人只晕一半)、
        // 扇形孢子弹幕、玩家脚下孢子云(空间封锁)。半血狂怒:冲速 ×enrageSpeedMul、弹幕 +enrageVolleyAdd。
        // 数值全部走 Bestiary(parity 逐键比对),这里只有状态机。
        private static void MossStag(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            float keepMin = Bestiary.MidBossMossstagStalkM * 0.7f;
            float keepMax = Bestiary.MidBossMossstagStalkM * 1.4f;
            bool enraged = e.Unit.Hp <= e.Unit.HpMax * Bestiary.MidBossMossstagPhase2At;
            float cdMul = enraged ? 0.8f : 1f;
            // 两招各有独立冷却:只重置用掉的那一招(镜像 web;踩过"弹幕被冲撞饿死")
            st.ChargeCd -= dt;
            st.VolleyCd -= dt;
            float contact = (Bestiary.MidBossMossstagBodyRadius + PlayerRadiusM) + ContactPad;

            switch (st.Phase)
            {
                case MobPhase.Telegraph:   // 冲撞预警:朝向已锁定,原地压低
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(st.DirY, st.DirX);
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Dash; st.T = Bestiary.MidBossMossstagChargeDurS; }
                    break;
                }
                case MobPhase.Dash:        // 冲撞:撞玩家(半晕)或撞墙(满晕)
                {
                    float speed = Bestiary.MidBossMossstagChargeSpeedM
                        * (enraged ? Bestiary.MidBossMossstagEnrageSpeedMul : 1f);
                    e.Vel = new Vector2(st.DirX, st.DirY) * speed;
                    st.T -= dt;
                    if (dist < contact)
                    {
                        Touch(w, e, st, dist, Bestiary.MidBossMossstagChargeMult);
                        e.Vel = Vector2.Zero;
                        st.WallStun = false;
                        st.Phase = MobPhase.Recover;
                        st.T = Bestiary.MidBossMossstagChargeWallStunS * 0.5f;
                        break;
                    }
                    if (HitsArenaWall(e.Pos))
                    {
                        e.Vel = Vector2.Zero;
                        st.WallStun = true;   // 满硬直 = 奖励窗口
                        st.Phase = MobPhase.Recover;
                        st.T = Bestiary.MidBossMossstagChargeWallStunS;
                    }
                    else if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Recover;
                        st.T = Bestiary.MidBossMossstagChargeRecoverS;
                    }
                    break;
                }
                case MobPhase.Aim:         // 弹幕蓄力:扇形孢子弹 + 玩家脚下孢子云
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(dy, dx);
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        int count = (int)Bestiary.MidBossMossstagVolleyCount
                            + (enraged ? (int)Bestiary.MidBossMossstagEnrageVolleyAdd : 0);
                        float spread = Bestiary.MidBossMossstagVolleySpreadDeg * MathF.PI / 180f;
                        float baseAngle = MathF.Atan2(dy, dx);
                        for (int i = 0; i < count; i++)
                        {
                            float a = baseAngle + (count == 1 ? 0f : (i / (float)(count - 1) - 0.5f) * spread);
                            ShootAtPlayer(w, e, new Vector2(MathF.Cos(a), MathF.Sin(a)),
                                Bestiary.MidBossMossstagVolleySpeedM, Bestiary.MidBossMossstagVolleyRadiusM,
                                Bestiary.MidBossMossstagVolleyMult, Bestiary.MidBossMossstagVolleyLifeS,
                                Element.Toxin);
                        }
                        w.Zones.Add(new Zone
                        {
                            Pos = w.Player.Pos, RadiusM = Bestiary.MidBossMossstagSporeRadiusM,
                            LifeS = Bestiary.MidBossMossstagSporeLifeS, TickS = Bestiary.MidBossMossstagSporeIntervalS,
                            Atk = e.Unit.Atk, Mult = Bestiary.MidBossMossstagSporeMult,
                            Element = Element.Toxin, PlayerTeam = false,
                        });
                        st.Phase = MobPhase.Recover;
                        st.T = 0.45f;
                    }
                    break;
                }
                case MobPhase.Recover:     // 招式后摇 / 硬直(撞墙时更长)
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Chase;
                        // 硬直结束后更快接招(惩罚没抓住窗口的玩家),镜像 web 的 ×0.7
                        ResetUsedMove(st, cdMul * (st.WallStun ? 0.7f : 1f));
                    }
                    break;
                }
                default:                   // Chase = "stalk":保持 4~6m 为冲撞留助跑
                {
                    e.Face = MathF.Atan2(dy, dx);
                    float side = MathF.Cos(st.AnimT * 0.8f) >= 0f ? 1f : -1f;
                    Vector2 mv;
                    if (dist < keepMin) mv = new Vector2(-nx, -ny);
                    else if (dist > keepMax) mv = new Vector2(nx, ny);
                    else mv = new Vector2(-ny * side, nx * side);
                    mv += SteerToArena(e.Pos);
                    if (mv.Length() > 0.0001f) mv = Vector2.Normalize(mv);
                    e.Vel = mv * Bestiary.Of(e.Kind).Speed * slow;

                    bool chargeReady = st.ChargeCd <= 0f;
                    bool volleyReady = st.VolleyCd <= 0f;
                    bool takeCharge = chargeReady && volleyReady
                        ? st.ChargeCd <= st.VolleyCd        // 都就绪 → 谁过期更久谁先出
                        : chargeReady;
                    if (takeCharge)
                    {
                        st.LastWasCharge = true;
                        st.Phase = MobPhase.Telegraph;
                        st.T = Bestiary.MidBossMossstagChargeTelegraphS;
                        st.DirX = nx;
                        st.DirY = ny;
                        e.Vel = Vector2.Zero;
                        // 路径预警:沿锁定朝向亮 3 个圈(与 web 一致)
                        for (int i = 0; i < 3; i++)
                        {
                            float d = Bestiary.MidBossMossstagChargeLaneM * (i + 1) / 3f;
                            TelegraphSystem.Add(w, e.Pos + new Vector2(nx, ny) * d, 0.9f,
                                Bestiary.MidBossMossstagChargeTelegraphS + i * 0.06f,
                                e.Unit.Atk, Bestiary.MidBossMossstagChargeMult, null, true);
                        }
                    }
                    else if (volleyReady)
                    {
                        st.LastWasCharge = false;
                        st.Phase = MobPhase.Aim;
                        st.T = Bestiary.MidBossMossstagVolleyTelegraphS;
                        e.Vel = Vector2.Zero;
                    }
                    break;
                }
            }
        }

        /// <summary>收招:只把刚用掉的那一招放回冷却(另一招继续走,于是两招自然轮换)。</summary>
        private static void ResetUsedMove(MobState st, float mul)
        {
            if (st.LastWasCharge) st.ChargeCd = Bestiary.MidBossMossstagChargeCdS * mul;
            else st.VolleyCd = Bestiary.MidBossMossstagVolleyCdS * mul;
        }

        // ---------- 第二章中 Boss:霜噬女猎(镜像 web MidBossHuntressSystem.ts) ----------
        //
        // 与巨鹿完全反向的风筝型猎手。三招 = 瞬影冰矢(瞬步拉开 → 连射,每发独立瞄准)、
        // 冰牙陷阵(玩家脚下 + 环绕延时冰爆,错拍结算)、猎杀凝视(蓄力直线 6 段冰枪 ——
        // 蓄力期间受伤加深(VulnT)且**掉血即打断** → interruptStunS 硬直 = 奖励窗口)。
        // 三招独立冷却只重置用掉的那招;半血狂怒:冰矢+1/陷阱+1/移速×/冷却×。数值全走 Bestiary。
        private static void FrostHuntress(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            bool enraged = e.Unit.Hp <= e.Unit.HpMax * Bestiary.MidBossFrosthuntressPhase2At;
            float cdMul = enraged ? Bestiary.MidBossFrosthuntressEnrageCdMul : 1f;
            st.BlinkCd -= dt;
            st.TrapCd -= dt;
            st.MarkCd -= dt;
            float keepMin = Bestiary.MidBossFrosthuntressKiteM * 0.75f;
            float keepMax = Bestiary.MidBossFrosthuntressKiteM * 1.55f;

            switch (st.Phase)
            {
                case MobPhase.Chase:   // kite:距离管理 + 侧移
                {
                    Vector2 mv;
                    if (dist < keepMin) mv = new Vector2(-nx, -ny);
                    else if (dist > keepMax) mv = new Vector2(nx, ny);
                    else mv = new Vector2(-ny, nx) * st.CircleDir;
                    mv += SteerToArena(e.Pos);
                    if (mv.LengthSquared() > 0.0001f) mv = Vector2.Normalize(mv);
                    float spd = Bestiary.MidBossFrosthuntressSpeed
                        * (enraged ? Bestiary.MidBossFrosthuntressEnrageSpeedMul : 1f) * slow;
                    e.Vel = mv * spd;
                    e.Face = MathF.Atan2(dy, dx);

                    // 三招轮换:就绪里挑"过期最久"的(与巨鹿同规则,推广到三招)
                    int move = -1;
                    float most = float.MaxValue;
                    if (st.BlinkCd <= 0f && st.BlinkCd < most) { move = 0; most = st.BlinkCd; }
                    if (st.TrapCd <= 0f && st.TrapCd < most) { move = 1; most = st.TrapCd; }
                    if (st.MarkCd <= 0f && st.MarkCd < most) { move = 2; most = st.MarkCd; }
                    if (move >= 0)
                    {
                        st.HuntressMove = move;
                        e.Vel = Vector2.Zero;
                        if (move == 0)
                        {
                            st.Phase = MobPhase.Telegraph;   // blinkWind:蹲身预警
                            st.T = Bestiary.MidBossFrosthuntressBlinkTelegraphS;
                            st.DirX = nx; st.DirY = ny;
                        }
                        else if (move == 1)
                        {
                            st.Phase = MobPhase.Windup;      // trapAim:抬手指地
                            st.T = Bestiary.MidBossFrosthuntressTrapsTelegraphS * 0.5f;
                        }
                        else
                        {
                            // markChannel:锁向 + 铺直线冰枪 + 亮要害(VulnT)
                            st.Phase = MobPhase.Channel;
                            st.T = Bestiary.MidBossFrosthuntressMarkChannelS;
                            st.DirX = nx; st.DirY = ny;
                            st.HpAtChannel = e.Unit.Hp;
                            st.Lanes.Clear();
                            for (int i = 0; i < (int)Bestiary.MidBossFrosthuntressMarkSegments; i++)
                            {
                                float d = 1.6f + i * Bestiary.MidBossFrosthuntressMarkStepM; // 1.6 = web laneStartM
                                var tg = TelegraphSystem.Add(w,
                                    e.Pos + new Vector2(nx, ny) * d,
                                    Bestiary.MidBossFrosthuntressMarkRadiusM,
                                    Bestiary.MidBossFrosthuntressMarkChannelS + i * Bestiary.MidBossFrosthuntressMarkRippleS,
                                    e.Unit.Atk, Bestiary.MidBossFrosthuntressMarkMult, Element.Ice, true);
                                st.Lanes.Add(tg);
                            }
                            e.Unit.VulnT = MathF.Max(e.Unit.VulnT, Bestiary.MidBossFrosthuntressMarkChannelS);
                            if (e.Unit.VulnPct <= 0f) e.Unit.VulnPct = BestiaryReactions.ReactionsBrittlePct;
                        }
                    }
                    break;
                }
                case MobPhase.Telegraph:   // blinkWind → 瞬步 + 进入连射
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        var to = e.Pos - new Vector2(st.DirX, st.DirY) * Bestiary.MidBossFrosthuntressBlinkRangeM;
                        const float pad = 1.2f;
                        to.X = Math.Clamp(to.X, pad, Bestiary.ArenaWidthM - pad);
                        to.Y = Math.Clamp(to.Y, pad, Bestiary.ArenaHeightM - pad);
                        e.Pos = to;
                        st.Phase = MobPhase.Aim;   // shoot
                        st.ShotsLeft = (int)Bestiary.MidBossFrosthuntressArrowsCount
                            + (enraged ? (int)Bestiary.MidBossFrosthuntressEnrageArrowAdd : 0);
                        st.ShotT = 0f;
                    }
                    break;
                }
                case MobPhase.Aim:   // shoot:每发都重新瞄准(追身)
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(dy, dx);
                    st.ShotT -= dt;
                    if (st.ShotT <= 0f && st.ShotsLeft > 0)
                    {
                        var (_, _, _, anx, any) = ToPlayer(w, e);
                        ShootAtPlayer(w, e, new Vector2(anx, any),
                            Bestiary.MidBossFrosthuntressArrowsSpeedM,
                            Bestiary.MidBossFrosthuntressArrowsRadiusM,
                            Bestiary.MidBossFrosthuntressArrowsMult,
                            Bestiary.MidBossFrosthuntressArrowsLifeS, Element.Ice);
                        st.ShotsLeft--;
                        st.ShotT = Bestiary.MidBossFrosthuntressArrowsIntervalS;
                    }
                    if (st.ShotsLeft <= 0) { st.Phase = MobPhase.Recover; st.T = 0.4f; }
                    break;
                }
                case MobPhase.Windup:   // trapAim → 放陷阱
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(dy, dx);
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        int count = (int)Bestiary.MidBossFrosthuntressTrapsCount
                            + (enraged ? (int)Bestiary.MidBossFrosthuntressEnrageTrapAdd : 0);
                        for (int i = 0; i < count; i++)
                        {
                            float ang = (i / (float)count) * MathF.PI * 2f;
                            var off = i == 0 ? Vector2.Zero
                                : new Vector2(MathF.Cos(ang), MathF.Sin(ang)) * Bestiary.MidBossFrosthuntressTrapsRingM;
                            TelegraphSystem.Add(w, w.Player.Pos + off,
                                Bestiary.MidBossFrosthuntressTrapsRadiusM,
                                Bestiary.MidBossFrosthuntressTrapsTelegraphS + i * Bestiary.MidBossFrosthuntressTrapsStepS,
                                e.Unit.Atk, Bestiary.MidBossFrosthuntressTrapsMult, Element.Ice, true);
                        }
                        st.Phase = MobPhase.Recover;
                        st.T = 0.5f;
                    }
                    break;
                }
                case MobPhase.Channel:   // markChannel:站桩;掉血即打断(核心博弈)
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(st.DirY, st.DirX);
                    if (e.Unit.Hp < st.HpAtChannel - 0.5f)
                    {
                        foreach (var tg in st.Lanes) w.Telegraphs.Remove(tg); // 幽灵冰枪必须撤干净
                        st.Lanes.Clear();
                        st.Phase = MobPhase.Recover;
                        st.T = Bestiary.MidBossFrosthuntressMarkInterruptStunS;
                        break;
                    }
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Lanes.Clear();   // 蓄满:冰枪按各自倒计时结算
                        st.Phase = MobPhase.Recover;
                        st.T = 0.6f;
                    }
                    break;
                }
                case MobPhase.Recover:   // 后摇/硬直共用(与巨鹿同口径)
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Chase;
                        // 只重置用掉的那一招
                        if (st.HuntressMove == 0) st.BlinkCd = Bestiary.MidBossFrosthuntressBlinkCdS * cdMul;
                        else if (st.HuntressMove == 1) st.TrapCd = Bestiary.MidBossFrosthuntressTrapsCdS * cdMul;
                        else st.MarkCd = Bestiary.MidBossFrosthuntressMarkCdS * cdMul;
                    }
                    break;
                }
                default:
                    st.Phase = MobPhase.Chase;
                    break;
            }
        }

        // ---------- 第三章中 Boss:沙暴刽子(镜像 web MidBossReaperSystem.ts) ----------
        //
        // 中 Boss 三性格收官:巨鹿=莽(骗撞墙)、女猎=溜(赌打断)、刽子=钓(骗劈空)。
        // 三招 = 沙缚镰钩(直线掷钩,命中把玩家拉到脸前)、处刑斩(锁落点跳劈:
        // 劈空 missStunS 满硬直 = 奖励窗口 / 命中只 hitStunS)、沙暴漩涡(以自己为中心铺沙暴区)。
        // 拉人镜像说明:web 是 420px/s 的速度冲量(带阻尼),逻辑层无玩家物理 → 等效位移一步到位
        // (pullV / PxPerM × 0.15s ≈ 1.3m,与 web 实测净位移同量级)。数值全走 Bestiary。
        private static void SandReaper(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            bool enraged = e.Unit.Hp <= e.Unit.HpMax * Bestiary.MidBossSandreaperPhase2At;
            float cdMul = enraged ? Bestiary.MidBossSandreaperEnrageCdMul : 1f;
            st.HookCd -= dt;
            st.CleaveCd -= dt;
            st.StormCd -= dt;
            float keepMin = Bestiary.MidBossSandreaperStalkM * 0.8f;
            float keepMax = Bestiary.MidBossSandreaperStalkM * 1.6f;

            switch (st.Phase)
            {
                case MobPhase.Chase:   // stalk:中距离压迫
                {
                    Vector2 mv;
                    if (dist < keepMin) mv = new Vector2(-nx, -ny);
                    else if (dist > keepMax) mv = new Vector2(nx, ny);
                    else mv = new Vector2(-ny, nx) * st.CircleDir;
                    mv += SteerToArena(e.Pos);
                    if (mv.LengthSquared() > 0.0001f) mv = Vector2.Normalize(mv);
                    e.Vel = mv * Bestiary.MidBossSandreaperSpeed
                        * (enraged ? Bestiary.MidBossSandreaperEnrageSpeedMul : 1f) * slow;
                    e.Face = MathF.Atan2(dy, dx);

                    int move = -1;
                    float most = float.MaxValue;
                    if (st.HookCd <= 0f && st.HookCd < most) { move = 0; most = st.HookCd; }
                    if (st.CleaveCd <= 0f && st.CleaveCd < most) { move = 1; most = st.CleaveCd; }
                    if (st.StormCd <= 0f && st.StormCd < most) { move = 2; most = st.StormCd; }
                    if (move >= 0)
                    {
                        st.ReaperMove = move;
                        e.Vel = Vector2.Zero;
                        if (move == 0)
                        {
                            st.Phase = MobPhase.Telegraph;   // hookWind
                            st.T = Bestiary.MidBossSandreaperHookTelegraphS;
                            st.HookDir = new Vector2(nx, ny);
                            for (int i = 0; i < 4; i++)      // 直线细预警 4 点(镜像 web hookDots)
                            {
                                float d = Bestiary.MidBossSandreaperHookRangeM * (i + 1) / 4f;
                                TelegraphSystem.Add(w, e.Pos + st.HookDir * d, 0.35f,
                                    Bestiary.MidBossSandreaperHookTelegraphS + i * 0.04f,
                                    e.Unit.Atk, 0.05f, null, true);
                            }
                        }
                        else if (move == 1)
                        {
                            st.Phase = MobPhase.Windup;      // cleaveWind:锁玩家落点
                            st.T = Bestiary.MidBossSandreaperCleaveTelegraphS;
                            st.CleaveTarget = w.Player.Pos;
                            TelegraphSystem.Add(w, st.CleaveTarget,
                                Bestiary.MidBossSandreaperCleaveRadiusM,
                                Bestiary.MidBossSandreaperCleaveTelegraphS + Bestiary.MidBossSandreaperCleaveLeapS,
                                e.Unit.Atk, Bestiary.MidBossSandreaperCleaveMult, null, true);
                        }
                        else
                        {
                            st.Phase = MobPhase.Aim;         // stormCast
                            st.T = 0.5f;
                        }
                    }
                    break;
                }
                case MobPhase.Telegraph:   // hookWind → 掷钩
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.HookFlying = true;
                        st.HookPos = e.Pos;
                        st.HookDist = 0f;
                        st.Phase = MobPhase.Dash;   // hookOut
                    }
                    break;
                }
                case MobPhase.Dash:   // hookOut:钩在飞(命中拉人)
                {
                    e.Vel = Vector2.Zero;
                    float hookSpd = Bestiary.MidBossSandreaperHookSpeedM
                        * (enraged ? Bestiary.MidBossSandreaperEnrageHookSpeedMul : 1f);
                    float step = hookSpd * dt;
                    st.HookPos += st.HookDir * step;
                    st.HookDist += step;
                    float hd = Vector2.Distance(w.Player.Pos, st.HookPos);
                    if (hd < Bestiary.MidBossSandreaperHookRadiusM + PlayerRadiusM)
                    {
                        HurtPlayer(w, e.Unit.Atk * Bestiary.MidBossSandreaperHookMult);
                        var pull = e.Pos - w.Player.Pos;
                        if (pull.LengthSquared() > 0.0001f)
                            w.Player.Pos += Vector2.Normalize(pull)
                                * (Bestiary.MidBossSandreaperHookPullV / Balance.PxPerM * 0.15f);
                        st.HookFlying = false;
                        st.Phase = MobPhase.Recover;
                        st.T = 0.45f;
                    }
                    else if (st.HookDist >= Bestiary.MidBossSandreaperHookRangeM)
                    {
                        st.HookFlying = false;
                        st.Phase = MobPhase.Recover;
                        st.T = 0.4f;
                    }
                    break;
                }
                case MobPhase.Windup:   // cleaveWind → 腾空
                {
                    e.Vel = Vector2.Zero;
                    e.Face = MathF.Atan2(st.CleaveTarget.Y - e.Pos.Y, st.CleaveTarget.X - e.Pos.X);
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Pounce;   // cleaveLeap
                        st.T = Bestiary.MidBossSandreaperCleaveLeapS;
                    }
                    break;
                }
                case MobPhase.Pounce:   // cleaveLeap:扑向锁定落点
                {
                    float remain = MathF.Max(st.T, 1f / 60f);
                    e.Vel = (st.CleaveTarget - e.Pos) / remain;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        e.Vel = Vector2.Zero;
                        e.Pos = st.CleaveTarget;
                        float pd = Vector2.Distance(w.Player.Pos, e.Pos);
                        float hitR = Bestiary.MidBossSandreaperCleaveRadiusM * 1.1f
                            + Bestiary.MidBossSandreaperBodyRadius * 0.3f;   // 镜像 web hitPad
                        st.Phase = MobPhase.Recover;
                        st.T = pd <= hitR
                            ? Bestiary.MidBossSandreaperCleaveHitStunS
                            : Bestiary.MidBossSandreaperCleaveMissStunS;   // 劈空 = 刀卡沙满硬直
                    }
                    break;
                }
                case MobPhase.Aim:   // stormCast:以自己为中心铺沙暴区
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        int count = (int)Bestiary.MidBossSandreaperStormCount
                            + (enraged ? (int)Bestiary.MidBossSandreaperEnrageStormAdd : 0);
                        for (int i = 0; i < count; i++)
                        {
                            float ang = (i / (float)count) * MathF.PI * 2f + st.AnimT;
                            var off = i == 0 ? Vector2.Zero
                                : new Vector2(MathF.Cos(ang), MathF.Sin(ang)) * Bestiary.MidBossSandreaperStormRingM;
                            w.Zones.Add(new Zone
                            {
                                Pos = e.Pos + off, RadiusM = Bestiary.MidBossSandreaperStormRadiusM,
                                LifeS = Bestiary.MidBossSandreaperStormLifeS, TickS = Bestiary.MidBossSandreaperStormIntervalS,
                                Atk = e.Unit.Atk, Mult = Bestiary.MidBossSandreaperStormMult,
                                Element = null, PlayerTeam = false,
                            });
                        }
                        st.Phase = MobPhase.Recover;
                        st.T = 0.5f;
                    }
                    break;
                }
                case MobPhase.Recover:
                {
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f)
                    {
                        st.Phase = MobPhase.Chase;
                        if (st.ReaperMove == 0) st.HookCd = Bestiary.MidBossSandreaperHookCdS * cdMul;
                        else if (st.ReaperMove == 1) st.CleaveCd = Bestiary.MidBossSandreaperCleaveCdS * cdMul;
                        else st.StormCd = Bestiary.MidBossSandreaperStormCdS * cdMul;
                    }
                    break;
                }
                default:
                    st.Phase = MobPhase.Chase;
                    break;
            }
            st.AnimT += dt;
        }

        // ---------- 轮 11 补怪四件套(镜像 web TundraSystem/DesertSystem) ----------

        /// <summary>冰锥笋:炮台 —— 玩家进 rangeM 就在其脚下点冰锥,本体不动。</summary>
        private static void IceSpike(LogicWorld w, Actor e, MobState st, float dt)
        {
            e.Vel = Vector2.Zero;
            var (_, _, dist, _, _) = ToPlayer(w, e);
            st.Cd -= dt;
            if (st.Cd <= 0f && dist < Bestiary.IceSpikeSpikeRangeM)
            {
                TelegraphSystem.Add(w, w.Player.Pos, Bestiary.IceSpikeSpikeRadiusM,
                    Bestiary.IceSpikeSpikeTelegraphS, e.Unit.Atk, Bestiary.IceSpikeSpikeMult,
                    Element.Ice, true);
                st.Cd = Bestiary.IceSpikeSpikeCdS;
            }
        }

        /// <summary>霜刃滑手:漂移体 —— 速度恒定,朝向按 turnRadPerS 缓慢掰向玩家。</summary>
        private static void IceGlider(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var (dx, dy, dist, _, _) = ToPlayer(w, e);
            float want = MathF.Atan2(dy, dx);
            float diff = want - st.DirX;   // DirX 借存 heading(弧度)
            while (diff > MathF.PI) diff -= MathF.PI * 2f;
            while (diff < -MathF.PI) diff += MathF.PI * 2f;
            float maxTurn = Bestiary.IceGliderGlideTurnRadPerS * dt;
            st.DirX += Math.Clamp(diff, -maxTurn, maxTurn);
            e.Face = st.DirX;
            e.Vel = new Vector2(MathF.Cos(st.DirX), MathF.Sin(st.DirX)) * Bestiary.IceGliderSpeed * slow;
            Touch(w, e, st, dist);
        }

        /// <summary>沙蜃花:伏击 —— 圈外装死;踏进圈苏醒,firstDelayS 后环形毒针,在圈内每 cdS 一轮。</summary>
        private static void MirageBlossom(LogicWorld w, Actor e, MobState st, float dt)
        {
            e.Vel = Vector2.Zero;
            var (_, _, dist, _, _) = ToPlayer(w, e);
            bool inRange = dist < Bestiary.MirageBlossomBurstTriggerM;
            switch (st.Phase)
            {
                case MobPhase.Chase:     // MobState 默认相位 → 先归位休眠(伏击怪出生必须装死)
                    st.Phase = MobPhase.Idle;
                    break;
                case MobPhase.Idle:      // dormant
                    if (inRange) { st.Phase = MobPhase.Telegraph; st.T = Bestiary.MirageBlossomBurstFirstDelayS; }
                    break;
                case MobPhase.Telegraph: // wake
                    st.T -= dt;
                    if (st.T <= 0f) { NeedleRing(w, e); st.Phase = MobPhase.Aim; st.Cd = Bestiary.MirageBlossomBurstCdS; }
                    break;
                default:                 // active
                    st.Cd -= dt;
                    if (!inRange && st.Cd <= 0f) st.Phase = MobPhase.Idle;
                    else if (inRange && st.Cd <= 0f) { NeedleRing(w, e); st.Cd = Bestiary.MirageBlossomBurstCdS; }
                    break;
            }
        }

        private static void NeedleRing(LogicWorld w, Actor e)
        {
            int count = (int)Bestiary.MirageBlossomBurstCount;
            for (int i = 0; i < count; i++)
            {
                float a = (i / (float)count) * MathF.PI * 2f;
                ShootAtPlayer(w, e, new Vector2(MathF.Cos(a), MathF.Sin(a)),
                    Bestiary.MirageBlossomBurstSpeedM, Bestiary.MirageBlossomBurstRadiusM,
                    Bestiary.MirageBlossomBurstMult, Bestiary.MirageBlossomBurstLifeS, Element.Toxin);
            }
        }

        /// <summary>烬旋灵:画线 —— 游走 → 自旋蓄力 → 锁向突进留火痕 → 眩晕。</summary>
        private static void EmberWhirl(LogicWorld w, Actor e, MobState st, float dt, float slow)
        {
            var (dx, dy, dist, nx, ny) = ToPlayer(w, e);
            switch (st.Phase)
            {
                case MobPhase.Chase:
                    e.Face = MathF.Atan2(dy, dx);
                    e.Vel = new Vector2(nx, ny) * Bestiary.EmberWhirlSpeed * slow;
                    Touch(w, e, st, dist);
                    st.Cd -= dt;
                    if (st.Cd <= 0f && dist < 7f)
                    {
                        st.Phase = MobPhase.Telegraph;
                        st.T = Bestiary.EmberWhirlRushTelegraphS;
                        st.DirX = nx; st.DirY = ny;
                        e.Vel = Vector2.Zero;
                    }
                    break;
                case MobPhase.Telegraph:
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Dash; st.T = Bestiary.EmberWhirlRushDurS; st.TrailT = 0f; }
                    break;
                case MobPhase.Dash:
                    e.Vel = new Vector2(st.DirX, st.DirY) * Bestiary.EmberWhirlRushSpeedM * slow;
                    st.T -= dt;
                    st.TrailT -= dt;
                    if (st.TrailT <= 0f)
                    {
                        w.Zones.Add(new Zone
                        {
                            Pos = e.Pos, RadiusM = Bestiary.EmberWhirlRushTrailRadiusM,
                            LifeS = Bestiary.EmberWhirlRushTrailLifeS, TickS = 0.4f,
                            Atk = e.Unit.Atk, Mult = Bestiary.EmberWhirlRushTrailMult,
                            Element = Element.Fire, PlayerTeam = false,
                        });
                        st.TrailT = Bestiary.EmberWhirlRushTrailIntervalS;
                    }
                    Touch(w, e, st, dist);
                    if (st.T <= 0f) { st.Phase = MobPhase.Recover; st.T = Bestiary.EmberWhirlRushRecoverS; }
                    break;
                case MobPhase.Recover:
                    e.Vel = Vector2.Zero;
                    st.T -= dt;
                    if (st.T <= 0f) { st.Phase = MobPhase.Chase; st.Cd = Bestiary.EmberWhirlRushCdS; }
                    break;
                default:
                    st.Phase = MobPhase.Chase;
                    break;
            }
        }

        /// <summary>冲出竞技场边界 = 撞墙(中 Boss 拿硬边界当地形用)。</summary>
        private static bool HitsArenaWall(Vector2 pos)
        {
            const float pad = 0.6f; // 镜像 web MIDBOSS_TUNING.wallPadM
            return pos.X < pad || pos.Y < pad
                || pos.X > Bestiary.ArenaWidthM - pad || pos.Y > Bestiary.ArenaHeightM - pad;
        }

        /// <summary>越靠边越朝场内回中(别被风筝到墙角打不着)。</summary>
        private static Vector2 SteerToArena(Vector2 pos)
        {
            const float near = 2.5f;
            var v = Vector2.Zero;
            if (pos.X < near) v.X += (near - pos.X) / near;
            if (pos.Y < near) v.Y += (near - pos.Y) / near;
            if (pos.X > Bestiary.ArenaWidthM - near) v.X -= (pos.X - (Bestiary.ArenaWidthM - near)) / near;
            if (pos.Y > Bestiary.ArenaHeightM - near) v.Y -= (pos.Y - (Bestiary.ArenaHeightM - near)) / near;
            return v;
        }

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
