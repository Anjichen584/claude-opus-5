using StarfallKnights.Data;

namespace StarfallKnights.Combat
{
    /// <summary>伤害公式——与 web/src/game/combat/formulas.ts 同构。</summary>
    public static class Formulas
    {
        /// <summary>防御减伤比:def/(def+K),K=50。</summary>
        public static float DefenseReduction(float def) => def <= 0 ? 0f : def / (def + Balance.DefK);

        /// <summary>
        /// 最终伤害 = atk × mult × (暴击? critDmg : 1) × (1-减伤) × (1+易伤)。
        /// 最低保底 1 点。
        /// </summary>
        public static int FinalDamage(float atk, float mult, bool crit, float critDmg, float defRed, float vulnPct)
        {
            float dmg = atk * mult * (crit ? critDmg : 1f) * (1f - defRed) * (1f + vulnPct);
            int v = (int)System.Math.Round(dmg);
            return v < 1 ? 1 : v;
        }
    }
}
