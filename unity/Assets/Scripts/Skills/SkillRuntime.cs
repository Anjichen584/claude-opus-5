using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Combat;
using StarfallKnights.Core;
using StarfallKnights.Data;

namespace StarfallKnights.Skills
{
    /// <summary>
    /// 技能执行器共用骨架:冷却(含 CDR)/怒气、延迟段调度队列、符文元素与地带的通用落地。
    /// 四个职业各自派生并实现 CastQ/CastE/CastR —— 行为与 web/src/game/skills/SkillSystem.ts 对齐,
    /// 数值与 web/src/data/skills/*.json 对齐(由 unity/Tests 的 ParityTests 守卫)。
    /// </summary>
    public abstract class SkillRuntime
    {
        public float CdQ, CdE, CdR;
        /// <summary>怒气 0~100(宿主命中时加)。</summary>
        public float Rage;
        /// <summary>冷却缩减(0~CdrCap);镜像 web:只作用于 Q/E,R 不吃 CDR。</summary>
        public float Cdr;

        /// <summary>三技能位的已镶符文(null=无)。</summary>
        public RuneDef RuneQ, RuneE, RuneR;

        /// <summary>怒气门槛(四职业 R 一致,镜像 balance)。</summary>
        public const int MinRage = 40;

        /// <summary>冷却系数(1-CDR,夹在 CdrCap 内)。</summary>
        protected float CdScale => Math.Clamp(1f - Cdr, 1f - Balance.CdrCap, 1f);

        protected readonly List<(float t, Action run)> Queue = new();
        protected readonly Random Rng = new();

        public void Tick(float dt)
        {
            if (CdQ > 0) CdQ -= dt;
            if (CdE > 0) CdE -= dt;
            if (CdR > 0) CdR -= dt;
            for (int i = Queue.Count - 1; i >= 0; i--)
            {
                var (t, run) = Queue[i];
                t -= dt;
                if (t <= 0)
                {
                    Queue.RemoveAt(i);
                    run();
                }
                else
                {
                    Queue[i] = (t, run);
                }
            }
        }

        /// <summary>按 Q/E/R 快捷键名取剩余冷却(镜像 web SkillSystem.cooldownOf/HUD)。</summary>
        public float CooldownOf(string slot) => slot switch
        {
            "Q" => CdQ,
            "E" => CdE,
            _ => CdR,
        };

        /// <summary>怒气比例 0~1(决定 R 段数与秘术师 R 持续时长)。</summary>
        protected float RageRatio
        {
            get
            {
                float ratio = (Rage - MinRage) / (100f - MinRage);
                return ratio < 0f ? 0f : ratio > 1f ? 1f : ratio;
            }
        }

        // ---- 共用工具 ----

        protected void Delay(float t, Action run) => Queue.Add((t, run));

        /// <summary>怒气换算技能段数(web:count = round(min + ratio*(max-min)))。</summary>
        protected int RageCount(int minCount, int maxCount)
            => (int)Math.Round(minCount + RageRatio * (maxCount - minCount));

        /// <summary>扇形展开偏移(web:off = (i-(count-1)/2)*spread,中间那发朝正向)。</summary>
        protected static float FanOffset(int i, int count, float spreadRad)
            => (i - (count - 1) / 2f) * spreadRad;

        protected static void HitOne(CombatUnit source, Actor target, float mult, Element? element)
        {
            DamagePipeline.Deal(new DealOpts
            {
                Source = source, Target = target.Unit, Mult = mult, Element = element, CanCrit = true,
            });
        }

        /// <summary>范围命中;给 withinFrom/withinR 时额外要求目标离该点 ≤ withinR(剑士 R 的 seekM)。</summary>
        protected static void HitAround(LogicWorld w, Vector2 at, float radiusM, float mult, Element? element,
            Vector2? withinFrom = null, float withinR = 0f)
        {
            foreach (var e in new List<Actor>(w.EnemiesWithin(at, radiusM)))
            {
                if (withinFrom.HasValue && Vector2.Distance(e.Pos, withinFrom.Value) > withinR) continue;
                HitOne(w.Player.Unit, e, mult, element);
            }
        }

        protected static void HitCone(LogicWorld w, Vector2 origin, float faceRad, float rangeM, float arcDeg, float mult, Element? element)
        {
            foreach (var e in new List<Actor>(w.EnemiesInCone(origin, faceRad, rangeM, arcDeg * MathF.PI / 180f)))
                HitOne(w.Player.Unit, e, mult, element);
        }

        /// <summary>按符文参数在指定位置落地元素地带(GroundZone = [radiusM, lifeS, tickS, mult])。</summary>
        protected static void SpawnRuneZone(LogicWorld w, RuneDef rune, Vector2 at, Element? element,
            float lifeScale = 1f)
        {
            if (rune?.GroundZone == null) return;
            var gz = rune.GroundZone;
            w.Zones.Add(new Zone
            {
                Pos = at, RadiusM = gz[0], LifeS = gz[1] * lifeScale, TickS = gz[2],
                Atk = w.Player.Unit.Atk, Mult = gz[3], Element = element, PlayerTeam = true,
            });
        }

        /// <summary>发射一发玩家弹幕(游侠/秘术师共用)。</summary>
        protected static Projectile Shoot(LogicWorld w, Vector2 from, Vector2 dir, float speedM, float lifeS,
            float radiusM, float mult, Element? element)
        {
            var p = new Projectile
            {
                Pos = from,
                Vel = Vector2.Normalize(dir) * speedM,
                RadiusM = radiusM,
                LifeS = lifeS,
                Mult = mult,
                Element = element,
                Owner = w.Player.Unit,
                PlayerTeam = true,
            };
            w.Projectiles.Add(p);
            return p;
        }

        /// <summary>朝向单位向量。</summary>
        protected static Vector2 FaceVec(Actor a) => new(MathF.Cos(a.Face), MathF.Sin(a.Face));
    }
}
