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

        /// <summary>状态 → 动作(纯函数;与 web actionOf 同一套优先级)</summary>
        public static AnimAction ActionOf(bool dead, bool dashing, bool attacking, bool casting, bool hurt, bool moving)
        {
            if (dead) return AnimAction.Die;
            if (dashing) return AnimAction.Dash;
            if (attacking) return AnimAction.Atk;
            if (casting) return AnimAction.Cast;
            if (hurt) return AnimAction.Hurt;
            if (moving) return AnimAction.Walk;
            return AnimAction.Idle;
        }
    }
}
