using System;
using System.Collections.Generic;
using StarfallKnights.Data;

namespace StarfallKnights.Combat
{
    /// <summary>一次伤害请求(对应 web DealOpts)。</summary>
    public struct DealOpts
    {
        public CombatUnit Source;   // 可空(区域伤害)
        public CombatUnit Target;
        public float Mult;
        public Element? Element;
        public float AtkOverride;   // <=0 表示用 Source.Atk
        public bool CanCrit;
        public int ChainDepth;
        /// <summary>命中方向(弧度):配合目标的 BackstabMult/FrontDR 做方向性弱点判定。</summary>
        public bool HasHitAngle;
        public float HitAngleRad;
    }

    /// <summary>反应回调载荷(渲染/连锁传播由宿主接收处理)。</summary>
    public struct ReactionResult
    {
        public Reaction Kind;
        public CombatUnit Target;
        public int ChainDepth;
    }

    /// <summary>
    /// 统一伤害入口——与 web/src/game/combat/DamagePipeline.ts 同构:
    /// 印记检查 → 反应触发 → 暴击/防御/易伤结算 → 上新印记。
    /// 连锁传播(冻链弹射选目标)依赖空间查询,由宿主通过 OnReaction 回调完成,
    /// 保持本类纯逻辑可单测。
    /// </summary>
    public static class DamagePipeline
    {
        /// <summary>反应发生时回调(宿主处理范围伤害/弹射/特效)。</summary>
        public static Action<ReactionResult> OnReaction;

        private static readonly Random CritRng = new Random(4202611);

        public static int Deal(DealOpts o)
        {
            if (o.Target == null || o.Target.Dead) return 0;

            float atk = o.AtkOverride > 0 ? o.AtkOverride : (o.Source?.Atk ?? 0f);
            float elemBonus = 1f;

            // ---- 元素反应:目标带异种印记 → 触发(先找后删,避免枚举期修改) ----
            if (o.Element.HasValue && o.ChainDepth <= Balance.MaxChainDepth)
            {
                Element? consumed = null;
                Reaction reaction = Reaction.None;
                foreach (var kv in o.Target.Marks)
                {
                    var r = Elements.ReactionOf(kv.Key, o.Element.Value);
                    if (r == Reaction.None) continue;
                    consumed = kv.Key;
                    reaction = r;
                    break;
                }
                if (consumed.HasValue)
                {
                    o.Target.Marks.Remove(consumed.Value); // 消耗印记
                    ApplyReaction(reaction, o.Target);
                    OnReaction?.Invoke(new ReactionResult { Kind = reaction, Target = o.Target, ChainDepth = o.ChainDepth });
                    if (reaction == Reaction.Overload) elemBonus = Balance.OverloadMult;
                    if (reaction == Reaction.Steam) elemBonus = Balance.SteamMult + 1f; // 蒸汽:本次+范围由宿主扩散
                }
            }

            // ---- 结算 ----
            bool crit = o.CanCrit && o.Source != null && CritRng.NextDouble() < o.Source.CritRate;
            float defRed = Formulas.DefenseReduction(o.Target.Def);
            float vuln = o.Target.VulnT > 0 ? o.Target.VulnPct : 0f;
            float chainMul = (float)Math.Pow(Balance.ChainDecay, o.ChainDepth);

            // 方向性弱点(镜像 web DamagePipeline):
            // · 橡木傀儡:从背后命中 cos(hitAngle-face) > 0.35 → ×2(教学绕后)
            // · 冰壳龟:从正面命中 cos(hitAngle-face) < -0.35 → ×(1-frontDR)
            float dirMul = 1f;
            if (o.HasHitAngle && (o.Target.BackstabMult > 1f || o.Target.FrontDR > 0f))
            {
                float align = MathF.Cos(o.HitAngleRad - o.Target.FaceRad);
                if (o.Target.BackstabMult > 1f && align > 0.35f) dirMul *= o.Target.BackstabMult;
                if (o.Target.FrontDR > 0f && align < -0.35f) dirMul *= 1f - o.Target.FrontDR;
            }

            int amount = Formulas.FinalDamage(atk, o.Mult * elemBonus * chainMul * dirMul, crit,
                o.Source?.CritDmg ?? 1f, defRed, vuln);

            o.Target.Hp -= amount;
            if (o.Target.Hp < 0) o.Target.Hp = 0;

            // ---- 上新印记 ----
            if (o.Element.HasValue && !o.Target.Dead)
                o.Target.Marks[o.Element.Value] = Balance.MarkDurationS;

            return amount;
        }

        private static void ApplyReaction(Reaction r, CombatUnit target)
        {
            switch (r)
            {
                case Reaction.Brittle: // 脆蚀:易伤
                    target.VulnT = 3f;
                    target.VulnPct = Balance.BrittleVulnPct;
                    break;
                case Reaction.Numb: // 麻痹:眩晕
                    target.StunT = Math.Max(target.StunT, Balance.NumbStunS);
                    break;
                case Reaction.Chain: // 冻链:减速(弹射由宿主 OnReaction 处理)
                    target.SlowT = 2f;
                    target.SlowPct = 0.4f;
                    break;
                default:
                    break; // Steam/Overload/Miasma 的范围效果由宿主处理
            }
        }
    }
}
