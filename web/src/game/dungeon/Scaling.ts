import balance from '@data/balance.json';

/**
 * 怪物成长缩放(docs/03-NUMBERS.md §7):
 * 房间深度每 +1:HP ×1.06、ATK ×1.04;夜晚再 ×1.25 / ×1.15。
 */
export function scaleHp(base: number, depth: number, night: boolean): number {
  const v = base * Math.pow(balance.scalingPerDepth.hp, depth) * (night ? balance.night.hpMult : 1);
  return Math.round(v);
}

export function scaleAtk(base: number, depth: number, night: boolean): number {
  const v = base * Math.pow(balance.scalingPerDepth.atk, depth) * (night ? balance.night.atkMult : 1);
  return Math.round(v);
}

/** 祭坛升级花费:50 × 1.6^当前级(docs/03 §8) */
export function altarCost(currentLevel: number): number {
  return Math.round(balance.altar.baseCost * Math.pow(balance.altar.costGrowth, currentLevel));
}
