using System;
using System.Collections.Generic;
using System.Numerics;
using StarfallKnights.Data;
using StarfallKnights.Skills;

namespace StarfallKnights.Core
{
    /// <summary>
    /// 触屏辅助瞄准规则(web 侧 web/src/game/input/AimAssist.ts 的镜像)。
    ///
    /// 为什么 Unity 也要有一份:手感是**发行规格**的一部分 —— 两个平台"最近敌人"的选法一旦漂移,
    /// 玩家在浏览器和手机上就是两款游戏。规则只有三条,数值全部读 <see cref="Bestiary"/> 里
    /// balance.json 的 touch 段(生成器搬运,ParityTests 逐键比对):
    /// 1. 范围:超出 aimRangeM 的敌人不参与锁定(屏幕外的怪不该抢准星);
    /// 2. 粘性:已锁目标比更近的候选只远 aimStickyM 以内 → 继续锁它(防等距抖动);
    /// 3. 续瞄:目标丢失后朝最后方向继续瞄 aimLatchS 秒(打死一个不甩枪)。
    /// </summary>
    public static class AimRules
    {
        /// <summary>触屏自动攻击的默认开关(JSON 里的布尔叶子,生成器跳过 → 这里单独比对,见 ParityTests.CheckTouch)。</summary>
        public const bool AutoAttackDefault = true;

        /// <summary>锁定范围(米)</summary>
        public const float DefaultRangeM = Bestiary.TouchAimRangeM;
        /// <summary>粘性余量(米)</summary>
        public const float DefaultStickyM = Bestiary.TouchAimStickyM;
        /// <summary>续瞄时长(秒)</summary>
        public const float DefaultLatchS = Bestiary.TouchAimLatchS;

        /// <summary>
        /// 选目标(纯函数,可直接单测)。
        /// </summary>
        /// <param name="locked">当前锁定目标(可为 null)</param>
        public static Actor Pick(IReadOnlyList<Actor> enemies, Vector2 from, Actor locked,
            float rangeM = DefaultRangeM, float stickyM = DefaultStickyM)
        {
            Actor best = null;
            float bestD = float.MaxValue;
            float lockedD = float.MaxValue;
            for (int i = 0; i < enemies.Count; i++)
            {
                var e = enemies[i];
                if (e == null) continue;
                float d = Vector2.Distance(e.Pos, from);
                if (d > rangeM) continue; // 范围外:不参与
                if (d < bestD) { bestD = d; best = e; }
                if (ReferenceEquals(e, locked)) lockedD = d;
            }
            if (best == null) return null;
            // 粘性:已锁目标不比最近的远出 stickyM → 继续锁它
            if (locked != null && lockedD <= bestD + stickyM) return locked;
            return best;
        }

        /// <summary>单位方向(零距离返回 (1,0),不产生 NaN)</summary>
        public static Vector2 Dir(Vector2 from, Vector2 to)
        {
            var d = to - from;
            float len = d.Length();
            if (len < 1e-6f) return new Vector2(1f, 0f);
            return d / len;
        }

        /// <summary>自动攻击判定:目标在"攻击距离 + 余量"内就该开火</summary>
        public static bool InAutoRange(float distM, float attackRangeM, float padM = Bestiary.TouchAutoAttackPadM)
            => distM <= attackRangeM + padM;

        /// <summary>
        /// 某职业普攻的有效射程(米)—— web 侧 `basicRangePx` 的同公式:
        /// 近战 = rangeM;远程 = 飞行距离 speedM × lifeS × shotReachFrac(弹丸最后那截已经飞过头)。
        /// </summary>
        public static float AutoAttackRangeM(HeroClass c)
        {
            if (StarfallKnights.Combat.BasicAttack.KindOf(c) == StarfallKnights.Combat.BasicAttack.Kind.Combo)
                return StarfallKnights.Combat.BasicAttack.ComboOf(c).RangeM;
            var shot = StarfallKnights.Combat.BasicAttack.ShotOf(c);
            return shot.SpeedM * shot.LifeS * Bestiary.TouchShotReachFrac;
        }
    }

    /// <summary>有记忆的瞄准助手:持有锁定目标与续瞄计时(web AimAssist 类的镜像)。</summary>
    public sealed class AimAssist
    {
        /// <summary>本帧锁定的目标(供 HUD 锁定圈 / 自动攻击读 —— 显示与实际必须同源)</summary>
        public Actor Locked { get; private set; }
        /// <summary>续瞄剩余时间</summary>
        public float LatchT { get; private set; }
        /// <summary>最后瞄准方向(无目标时的兜底)</summary>
        public Vector2 LastDir { get; private set; } = new Vector2(1f, 0f);

        public bool Aiming => Locked != null || LatchT > 0f;

        /// <summary>每帧调用;返回本帧瞄准方向(null = 交给调用方兜底,如"朝移动方向")。</summary>
        public Vector2? Update(LogicWorld w, Vector2 from, float dt,
            float rangeM = AimRules.DefaultRangeM,
            float stickyM = AimRules.DefaultStickyM,
            float latchS = AimRules.DefaultLatchS)
        {
            var pick = AimRules.Pick(w.Enemies, from, Locked, rangeM, stickyM);
            Locked = pick;
            if (pick != null)
            {
                LatchT = latchS;
                LastDir = AimRules.Dir(from, pick.Pos);
                return LastDir;
            }
            // 目标丢失:先续瞄一会儿(先扣再判,和 web 一致),用完交还给调用方
            LatchT -= dt;
            if (LatchT > 0f) return LastDir;
            LatchT = 0f;
            return null;
        }

        /// <summary>清空记忆(换房/复活/换槽必须清:否则会锁上一局的 Actor 引用)</summary>
        public void Reset()
        {
            Locked = null;
            LatchT = 0f;
        }
    }
}
