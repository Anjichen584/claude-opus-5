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
