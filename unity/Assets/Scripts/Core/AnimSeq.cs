using System;
using StarfallKnights.Data;

namespace StarfallKnights.Core
{
    /// <summary>角色动作(web 侧 web/src/game/gfx/anim.ts 的镜像)。</summary>
    public enum AnimAction { Idle, Walk, Atk, Dash, Cast, Hurt, Die }

    /// <summary>
    /// 动作序列的**规则**(帧号怎么走、动作怎么抢、缺序列怎么降级)——
    /// 与 web 端同源,数值读 <see cref="Bestiary"/> 里 balance.json 的 anim 段(生成器搬运 + parity 比对)。
    ///
    /// 为什么要镜像:动画节奏漂了两端就是两个手感 —— 浏览器里 8fps 的走路、Unity 里 12fps,
    /// 玩家第一眼就能看出来。帧数/帧率/循环与否都在数据里,代码只负责算帧号。
    /// </summary>
    public static class AnimRules
    {
        /// <summary>动作优先级(靠前者胜):死亡 > 翻滚 > 攻击 > 施法 > 受击 > 移动 > 待机。</summary>
        public static readonly AnimAction[] Priority =
        {
            AnimAction.Die, AnimAction.Dash, AnimAction.Atk, AnimAction.Cast,
            AnimAction.Hurt, AnimAction.Walk, AnimAction.Idle,
        };

        /// <summary>动作 → 帧数</summary>
        public static int Frames(AnimAction a) => a switch
        {
            AnimAction.Idle => (int)Bestiary.AnimIdleFrames,
            AnimAction.Walk => (int)Bestiary.AnimWalkFrames,
            AnimAction.Atk => (int)Bestiary.AnimAtkFrames,
            AnimAction.Dash => (int)Bestiary.AnimDashFrames,
            AnimAction.Cast => (int)Bestiary.AnimCastFrames,
            AnimAction.Hurt => (int)Bestiary.AnimHurtFrames,
            AnimAction.Die => (int)Bestiary.AnimDieFrames,
            _ => 1,
        };

        /// <summary>动作 → 帧率(fps)</summary>
        public static float Fps(AnimAction a) => a switch
        {
            AnimAction.Idle => Bestiary.AnimIdleFps,
            AnimAction.Walk => Bestiary.AnimWalkFps,
            AnimAction.Atk => Bestiary.AnimAtkFps,
            AnimAction.Dash => Bestiary.AnimDashFps,
            AnimAction.Cast => Bestiary.AnimCastFps,
            AnimAction.Hurt => Bestiary.AnimHurtFps,
            AnimAction.Die => Bestiary.AnimDieFps,
            _ => 8f,
        };

        /// <summary>只有待机与走路循环(攻击动作自己转圈最难看)。</summary>
        public static bool Loop(AnimAction a) => a == AnimAction.Idle || a == AnimAction.Walk;

        /// <summary>动作 → 帧名(`knight_walk_1`,1 起,与美术管线一致)</summary>
        public static string FrameName(string baseName, AnimAction a, int i)
            => $"{baseName}_{ActionKey(a)}_{i}";

        /// <summary>动作 → 文件名里的动作段(小写,与 web/tools/process_frames.py 一致)</summary>
        public static string ActionKey(AnimAction a) => a switch
        {
            AnimAction.Idle => "idle",
            AnimAction.Walk => "walk",
            AnimAction.Atk => "atk",
            AnimAction.Dash => "dash",
            AnimAction.Cast => "cast",
            AnimAction.Hurt => "hurt",
            AnimAction.Die => "die",
            _ => "idle",
        };

        /// <summary>
        /// 帧号。
        /// - 循环:按总时长取模(传全局时间也不会漂,负时间安全);
        /// - 一次性:过了停在最后一帧;
        /// - 帧数 ≤1(含数据写错成 0):恒返回 0,绝不产生 NaN / 负数下标。
        /// </summary>
        public static int FrameIndex(float t, float fps, int frames, bool loop)
        {
            if (frames <= 1) return 0;
            int step = (int)MathF.Floor(MathF.Max(0f, t) * fps);
            if (loop) return step % frames;
            return Math.Min(frames - 1, step);
        }

        /// <summary>走路起伏(px):频率推导自走路序列(每步一次),不另设旋钮。</summary>
        public static float BobPx(float t, bool moving)
        {
            int frames = (int)Bestiary.AnimWalkFrames;
            if (!moving || frames <= 0) return 0f;
            float stepsPerS = Bestiary.AnimWalkFps / frames;
            return MathF.Sin(t * MathF.PI * 2f * stepsPerS) * Bestiary.AnimBobAmplitudePx;
        }

        /// <summary>
        /// 普攻该播哪个动作:**远程职业走 Cast**(web 侧 <c>attackAction()</c> 的镜像)。
        /// 这是**代码口径**不是美术口径 —— 挥剑与拉弓是两套姿态,所以猎手/秘术师的 cast 序列就是他们的普攻序列。
        /// 抽成规则是因为这条以前散在调用点里写成一对双重否定(`attacking && !shot` / `casting && shot`),
        /// 谁改谁错,而且漏一处就会「打起来了还在跑」。
        /// </summary>
        public static AnimAction AttackAction(bool isShot) => isShot ? AnimAction.Cast : AnimAction.Atk;

        /// <summary>状态 → 动作(纯函数;与 web actionOf 同一套优先级)。</summary>
        /// <param name="attack">普攻形态(见 <see cref="AttackAction"/>);默认近战 Atk。敌人吟唱走 <paramref name="casting"/>。</param>
        public static AnimAction ActionOf(bool dead, bool dashing, bool attacking, bool casting, bool hurt, bool moving,
            AnimAction attack = AnimAction.Atk)
        {
            if (dead) return AnimAction.Die;
            if (dashing) return AnimAction.Dash;
            if (attacking) return attack;
            if (casting) return AnimAction.Cast;
            if (hurt) return AnimAction.Hurt;
            if (moving) return AnimAction.Walk;
            return AnimAction.Idle;
        }

        /// <summary>走路一圈的时长(秒)= 帧数 / 帧率。**唯一的走路节奏来源**,别在别处再写一个常数。</summary>
        public static float CycleSec(AnimAction a = AnimAction.Walk)
        {
            float fps = Fps(a);
            return fps > 0f ? Frames(a) / fps : 0f;
        }

        /// <summary>
        /// "剩余时间 → 已进行时间"(动作时钟的唯一换算口径;web 侧 <c>elapsed()</c> 的镜像)。
        /// 计时器给的是**剩余**(dash/attack/... 都是倒数),动画要的是**已进行**;
        /// 剩余 ≤ 0 表示"这个动作没在进行" → 返回 null,由 <see cref="ClockFor"/> 归 0。
        /// </summary>
        public static float? Elapsed(float? remaining, float? total)
        {
            if (remaining == null || total == null) return null;
            if (remaining.Value <= 0f) return null;
            return total.Value - remaining.Value;
        }

        /// <summary>各动作的动作时钟(字段为"已进行"秒数;null = 这个动作没在进行)。</summary>
        public struct AnimClocks
        {
            public float? DashT, AttackT, CastT, HurtT, DieT;
        }

        /// <summary>
        /// 组件计时器 → 动作时钟(web 侧 <c>clocksOf()</c> 的镜像)。
        ///
        /// 为什么这条比看起来重要:**漏映射一个字段的后果是"那个动作永远停在第一帧"** ——
        /// web 侧真踩过(漏传 castT → 拉弓僵住,肉眼看着像美术坏了)。
        /// 注:远程职业的普攻就是 Cast(近战挥砍与拉弓是两套姿态),所以 Cast 共用**普攻**的计时器。
        /// </summary>
        public static AnimClocks ClocksOf(
            float? dashT, float? dashDur,
            float? attackT, float? attackDur,
            float? hurtT, float? hurtDur,
            float? respawnT, float? respawnDur)
        {
            return new AnimClocks
            {
                DashT = Elapsed(dashT, dashDur),
                AttackT = Elapsed(attackT, attackDur),
                CastT = Elapsed(attackT, attackDur),
                HurtT = Elapsed(hurtT, hurtDur),
                DieT = Elapsed(respawnT, respawnDur),
            };
        }

        /// <summary>
        /// 本帧该用哪个时钟喂 <see cref="FrameIndex"/>。
        /// - 循环动作(待机/走路)用全局时间:切帧时机与动作起点无关,取模后自然不会漂;
        /// - 一次性动作吃各自的"已进行"时间,并**夹在 [0, 总时长]** 内(动作结束后计时器可能被清零或为负)。
        /// </summary>
        public static float ClockFor(AnimAction a, float globalT, AnimClocks c)
        {
            float span = CycleSec(a);
            float Clamp(float? t)
            {
                float v = t ?? 0f;
                return MathF.Max(0f, MathF.Min(span, v));
            }
            return a switch
            {
                AnimAction.Dash => Clamp(c.DashT),
                AnimAction.Atk => Clamp(c.AttackT),
                AnimAction.Cast => Clamp(c.CastT),
                AnimAction.Hurt => Clamp(c.HurtT),
                AnimAction.Die => Clamp(c.DieT),
                _ => globalT,
            };
        }

        /// <summary>
        /// 两帧资产的命名后缀(杂兵/中Boss 早期只有 `base` + `base_f2` 两张图;
        /// 与玩家/精英的 `{base}_{action}_{i}` 序列**并存**,序列齐全时走序列)。
        /// </summary>
        public const string TwoFrameSuffix = "_f2";

        /// <summary>
        /// 两帧资产这一帧要不要翻到 `_f2`(web 侧 <c>twoFrameFlip()</c> 的镜像)。
        /// 交替速度**推导**自走路规格:走路一圈 = 两个步幅,所以两帧资产正好每半圈翻一次。
        /// 曾经这里在渲染层手写着 `floor(t*8)%2`,和 `balance.anim.walk` 是两个独立的数 ——
        /// 改帧率时玩家会变、杂兵不会(而且当时快了一倍)。现在两端都只有一个来源。
        /// </summary>
        public static bool TwoFrameFlip(float t, bool moving = true)
        {
            if (!moving) return false;
            float cycle = CycleSec(AnimAction.Walk);
            if (cycle <= 0f) return false;
            return FrameIndex(t, 2f / cycle, 2, true) == 1;
        }

        /// <summary>两帧资产这帧的名字(**没有 `_f2` 就退回站立单帧**:降级而非消失)。</summary>
        public static string TwoFrameName(string baseName, float t, bool hasF2, bool moving = true)
        {
            string flip = baseName + TwoFrameSuffix;
            if (!hasF2) return baseName;
            return TwoFrameFlip(t, moving) ? flip : baseName;
        }
    }
}
