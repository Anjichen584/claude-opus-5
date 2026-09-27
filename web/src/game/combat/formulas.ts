/**
 * 战斗公式唯一出处(docs/03-NUMBERS.md §3)。
 * 有单测锁行为(__tests__/formulas.test.ts),改公式必须同步文档与测试。
 */

/** 防御减免系数:1 - def / (def + 60 + 8 × attackerLevel) */
export function defenseReduction(def: number, attackerLevel: number): number {
  return 1 - def / (def + 60 + 8 * attackerLevel);
}

/** 最终伤害(取整,最小 1) */
export function finalDamage(
  base: number,
  mult: number,
  crit: boolean,
  critDmg: number,
  defRed: number,
  vulnMult: number,
): number {
  const raw = base * mult * (crit ? critDmg : 1) * defRed * vulnMult;
  return Math.max(1, Math.round(raw));
}
