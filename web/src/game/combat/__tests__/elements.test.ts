import { describe, expect, it } from 'vitest';
import { ALL_ELEMENTS, REACTION_COUNT, reactionOf } from '../Elements';
import type { Element } from '@game/components';

describe('元素连锁反应表 (docs/01-GDD.md §6)', () => {
  it('4 系元素两两组合恰好 6 种反应,全部有定义', () => {
    const seen = new Set<string>();
    for (let i = 0; i < ALL_ELEMENTS.length; i++) {
      for (let j = i + 1; j < ALL_ELEMENTS.length; j++) {
        const r = reactionOf(ALL_ELEMENTS[i], ALL_ELEMENTS[j]);
        expect(r, `${ALL_ELEMENTS[i]}+${ALL_ELEMENTS[j]} 缺定义`).not.toBeNull();
        seen.add(r!.id);
      }
    }
    expect(seen.size).toBe(6);
    expect(REACTION_COUNT).toBe(6);
  });

  it('反应对称:A+B 与 B+A 相同', () => {
    for (const a of ALL_ELEMENTS) {
      for (const b of ALL_ELEMENTS) {
        if (a === b) continue;
        expect(reactionOf(a, b)?.id).toBe(reactionOf(b, a)?.id);
      }
    }
  });

  it('同元素不触发反应', () => {
    for (const el of ALL_ELEMENTS) {
      expect(reactionOf(el, el as Element)).toBeNull();
    }
  });

  it('指定组合表:火冰=蒸爆 / 火雷=超载 / 火毒=燃瘴 / 冰雷=冻链 / 冰毒=脆蚀 / 雷毒=麻痹', () => {
    expect(reactionOf('fire', 'ice')?.id).toBe('steam');
    expect(reactionOf('fire', 'bolt')?.id).toBe('overload');
    expect(reactionOf('fire', 'toxin')?.id).toBe('miasma');
    expect(reactionOf('ice', 'bolt')?.id).toBe('chain');
    expect(reactionOf('ice', 'toxin')?.id).toBe('brittle');
    expect(reactionOf('bolt', 'toxin')?.id).toBe('numb');
  });
});
