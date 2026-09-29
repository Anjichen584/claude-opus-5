using System;
using System.Numerics;
using StarfallKnights.Core;
using StarfallKnights.Data;
using StarfallKnights.Skills;

namespace StarfallKnights.Combat
{
    /// <summary>
    /// 远程普攻的运行时(镜像 web `systems/PlayerSystem.ts` 里 `basic.kind === 'shot'` 那一段)。
    ///
    /// 为什么单独一个类:Unity 这边原来**只有近战连击能打**(`PlayerController` 里写死 `ComboTimes`),
    /// 猎手/秘术师选了根本射不出东西 —— 普攻档案(`BasicAttack.ShotOf`)早就镜像好了,缺的是"把它打出去"这层。
    /// 抽成**不依赖 UnityEngine** 的类,是为了让射速/强化发/穿透/溅射这些规则能被逻辑层测试直接驱动,
    /// 而不是只能靠人进 Unity 按鼠标看。
    ///
    /// 数值全部来自 codegen 常量(`BestiaryKlass.*`),这里只写规则:
    /// - 每 `heavyEvery` 发强化:倍率 ×`heavyMult`、半径 ×1.6、带穿透(与 web `ResolveShot` 同一条公式);
    /// - 命中后**穿透**继续飞、**溅射**按 `splashMult` 打一份减伤版(见 `ProjectileSystem.Hit`);
    /// - 出招期间移动倍率 = 职业自己的 `moveSlowPct`(猎手可走射 = 1,秘术师 0.55),不再写死 0.35。
    /// </summary>
    public sealed class ShotRuntime
    {
        /// <summary>已打出的发数(0 起;`ResolveShot` 按它决定下一发是不是强化发)。</summary>
        public int ShotsFired { get; private set; }

        /// <summary>剩余冷却(秒);>0 时打不出下一发。</summary>
        public float Cooldown { get; private set; }

        /// <summary>最近一发的解析结果(调试/测试用)。</summary>
        public BasicAttack.ShotStep LastStep { get; private set; }

        /// <summary>最近一发的实际飞行参数(调试/测试用;没打过就是默认值)。</summary>
        public float LastMult { get; private set; }
        public int LastPierce { get; private set; }
        public bool LastWasHeavy { get; private set; }

        /// <summary>推进冷却(每帧调一次,和玩家/敌人共用主循环)。</summary>
        public void Tick(float dt)
        {
            if (Cooldown > 0f) Cooldown = MathF.Max(0f, Cooldown - dt);
        }

        /// <summary>立刻可用(打一巴掌重置:翻滚/技能后想接着射不用等冷却)。</summary>
        public void Reset() => Cooldown = 0f;

        /// <summary>出招期间的移动倍率(1 = 不减速)。走射职业恒为 1。</summary>
        public static float MoveSlowOf(BasicAttack.ShotBasic spec) => spec.MoveSlowPct <= 0f ? 1f : spec.MoveSlowPct;

        /// <summary>
        /// 试着打一发。<paramref name="aim"/> 不必归一化(内部会处理);<paramref name="origin"/> 是**角色位置**(枪口偏移在内部加)。
        /// 返回 false = 冷却没到,这一帧不打。
        /// </summary>
        public bool TryFire(LogicWorld w, Vector2 origin, Vector2 aim, BasicAttack.ShotBasic spec)
        {
            if (Cooldown > 0f) return false;
            if (w?.Player == null) return false;

            Vector2 dir = aim.LengthSquared() > 1e-6f ? Vector2.Normalize(aim) : new Vector2(1f, 0f);
            var step = BasicAttack.ResolveShot(spec, ShotsFired);

            // 枪口偏移:14px(与 web 一致)—— 否则贴脸时弹丸会在自己身体里出生
            var muzzle = origin + dir * (14f / BasicAttack.PxPerM);

            var p = new Projectile
            {
                Pos = muzzle,
                Vel = dir * spec.SpeedM,
                RadiusM = step.RadiusPx / BasicAttack.PxPerM,
                LifeS = spec.LifeS,
                Mult = step.Mult,
                Element = null,
                Owner = w.Player.Unit,
                PlayerTeam = true,
                Pierce = step.Pierce,
                SplashM = step.SplashM,
                SplashMult = spec.SplashMult,
            };
            w.Projectiles.Add(p);

            ShotsFired++;
            Cooldown = step.TimeS;
            LastStep = step;
            LastMult = step.Mult;
            LastPierce = step.Pierce;
            LastWasHeavy = step.Heavy;
            return true;
        }
    }
}
