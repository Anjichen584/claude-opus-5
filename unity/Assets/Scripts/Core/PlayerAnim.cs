using StarfallKnights.Combat;
using StarfallKnights.Data;
using StarfallKnights.Skills;

namespace StarfallKnights.Core
{
    /// <summary>
    /// 玩家动画状态 → 帧名(镜像 web `GameScene` 里 `actionOf` + `attackAction` + `clocksOf` 那条接线)。
    ///
    /// **为什么放 Core 而不是 PlayerController**:`Unity/` 那一层不参逻辑测试工程的编译
    /// (只编 Core/Combat/Skills/Dungeon/Meta/Loot/Data),所以写在 MonoBehaviour 里的规则**测试看不见** ——
    /// web 侧漏传 `castT` 导致「拉弓永远停在第 1 帧」就是这个形状的坑,Unity 侧不能再踩一遍。
    /// 放到 Core 之后,射速/翻滚/受击这些状态该出哪一帧是**可断言**的。
    ///
    /// 注意 `shotKlass` 那条:**远程职业的普攻走 Cast**(`AnimRules.AttackAction`),
    /// 所以猎手射箭时返回的是 `{base}_cast_{i}` 而不是 `{base}_atk_{i}`。
    /// </summary>
    public static class PlayerAnim
    {
        /// <summary>当前该播的动作(死亡由上层处理:玩家倒地期间直接播 Die)。</summary>
        public static AnimAction Action(bool isShot, float dashT, float attackT, bool hurt, bool moving, bool dead = false)
            => AnimRules.ActionOf(dead, dashT > 0f, attackT > 0f, false, hurt, moving, AnimRules.AttackAction(isShot));

        /// <summary>
        /// 本帧该画的精灵名(1 起编号,与美术管线一致)。
        /// - 循环动作(待机/走路)吃全局时间;一次性动作吃**各自的计时器**(所以第二次攻击会从第 1 帧开始);
        /// - 计时器 ≤0 / 缺失 → 时钟归 0 → 第 1 帧,绝不产生非法下标(帧数写错成 0 时恒第 1 帧)。
        /// </summary>
        public static string Frame(
            string baseName, bool isShot, float globalT,
            float dashT, float dashDur, float attackT, float attackDur,
            bool hurt, bool moving, bool dead = false)
        {
            var a = Action(isShot, dashT, attackT, hurt, moving, dead);
            var clocks = AnimRules.ClocksOf(dashT, dashDur, attackT, attackDur, null, null, null, null);
            float t = AnimRules.ClockFor(a, globalT, clocks);
            int idx = AnimRules.FrameIndex(t, AnimRules.Fps(a), AnimRules.Frames(a), AnimRules.Loop(a));
            return AnimRules.FrameName(baseName, a, idx + 1);
        }

        /// <summary>远程职业判定(远程普攻走 Cast 的那条口径的唯一入口)。</summary>
        public static bool IsShotClass(HeroClass c) => BasicAttack.KindOf(c) == BasicAttack.Kind.Shot;
    }
}
