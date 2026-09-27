import type { Element } from '@game/components';
import { ELEMENT_COLORS } from '@game/constants';

/** 六种元素连锁反应定义(docs/01-GDD.md §6)。 */
export interface ReactionDef {
  id: 'steam' | 'overload' | 'miasma' | 'chain' | 'brittle' | 'numb';
  name: string;
  color: string;
}

const R = (id: ReactionDef['id'], name: string, color: string): ReactionDef => ({ id, name, color });

/** key: 两元素按字典序排列后 join('+') */
const TABLE = new Map<string, ReactionDef>([
  ['fire+ice', R('steam', '蒸爆', '#cfe8ff')],
  ['bolt+fire', R('overload', '超载', '#ffd94f')],
  ['fire+toxin', R('miasma', '燃瘴', '#b8e04f')],
  ['bolt+ice', R('chain', '冻链', '#9fdcff')],
  ['ice+toxin', R('brittle', '脆蚀', '#c9f27e')],
  ['bolt+toxin', R('numb', '麻痹', '#e8f24f')],
]);

export function reactionOf(a: Element, b: Element): ReactionDef | null {
  if (a === b) return null;
  const key = [a, b].sort().join('+');
  return TABLE.get(key) ?? null;
}

export function elementColor(el: Element): string {
  return ELEMENT_COLORS[el];
}

export const ALL_ELEMENTS: readonly Element[] = ['fire', 'ice', 'bolt', 'toxin'];
export const REACTION_COUNT = TABLE.size;
