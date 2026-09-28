import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDS } from '@game/meta/Save';
import { ACTIONS, keyLabel } from '@game/meta/Bindings';

describe('设置与键位绑定', () => {
  it('动作清单与默认键位一一对应', () => {
    expect(ACTIONS.length).toBe(Object.keys(DEFAULT_BINDS).length);
    for (const a of ACTIONS) {
      expect(DEFAULT_BINDS[a.id], `缺默认键:${a.id}`).toBeTruthy();
      expect(a.label.length).toBeGreaterThan(0);
    }
  });

  it('默认键位互不冲突', () => {
    const codes = Object.values(DEFAULT_BINDS);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('键名美化覆盖常用键', () => {
    expect(keyLabel('KeyJ')).toBe('J');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('Space')).toBe('空格');
    expect(keyLabel('F13')).toBe('F13'); // 未知键原样显示
  });
});
