using System.Collections.Generic;

namespace StarfallKnights.Combat
{
    /// <summary>
    /// 战斗单元(组件聚合)——Unity 侧以 MonoBehaviour 持有一个 CombatUnit,
    /// 纯 C# 可单测。对应 web 端 Health/Stats/ElementMarks/Buffs 组件组合。
    /// </summary>
    public sealed class CombatUnit
    {
        public float HpMax;
        public float Hp;
        public float Atk;
        public float Def;
        public float CritRate;
        public float CritDmg = 1.5f;
        public bool IsPlayerTeam;
        /// <summary>朝向(弧度,镜像 web Transform.face;傀儡绕背/冰龟正面减伤要读它)。</summary>
        public float FaceRad;
        /// <summary>背部弱点倍率(&gt;1 生效,橡木傀儡 = 2.0)。</summary>
        public float BackstabMult;
        /// <summary>正面减伤(0~1,冰壳龟 = 0.5:从正面打只吃一半)。</summary>
        public float FrontDR;

        /// <summary>元素印记 → 剩余秒数。</summary>
        public readonly Dictionary<Element, float> Marks = new();

        // Buff/Debuff
        public float StunT;
        public float SlowT;
        public float SlowPct;
        public float VulnT;     // 脆蚀易伤剩余
        public float VulnPct;

        public bool Dead => Hp <= 0;

        public void TickTimers(float dt)
        {
            if (StunT > 0) StunT -= dt;
            if (SlowT > 0) SlowT -= dt;
            if (VulnT > 0) VulnT -= dt;
            var keys = new List<Element>(Marks.Keys);
            foreach (var k in keys)
            {
                float left = Marks[k] - dt;
                if (left <= 0) Marks.Remove(k);
                else Marks[k] = left;
            }
        }
    }
}
