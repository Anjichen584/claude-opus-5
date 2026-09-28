import { DEFAULT_BINDS, meta } from './Save';

/** 可改绑动作清单(顺序即设置面板显示顺序) */
export const ACTIONS: Array<{ id: string; label: string }> = [
  { id: 'attack', label: '普攻(备用键)' },
  { id: 'dash', label: '翻滚' },
  { id: 'q', label: '技能 Q' },
  { id: 'e', label: '技能 E' },
  { id: 'r', label: '技能 R' },
  { id: 'potion', label: '药剂' },
  { id: 'interact', label: '交互' },
  { id: 'lantern', label: '星灯' },
  { id: 'bag', label: '背包' },
];

/** 动作 → 当前绑定键码 */
export function bindOf(action: string): string {
  return meta.data.settings.binds[action] ?? DEFAULT_BINDS[action] ?? '';
}

/** 键码 → 展示名(常见键美化) */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: '空格', Tab: 'Tab', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl', AltLeft: 'L-Alt', Enter: '回车',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return map[code] ?? code;
}

export function resetBinds(): void {
  meta.data.settings.binds = { ...DEFAULT_BINDS };
  meta.save();
}
