import { t } from '@game/i18n';
import { DEFAULT_BINDS, meta } from './Save';

/** 可改绑动作清单(顺序即设置面板显示顺序) */
export const ACTIONS: Array<{ id: string; label: string }> = [
  { id: 'attack', label: 'bind.attack' },
  { id: 'dash', label: 'bind.dash' },
  { id: 'q', label: 'bind.q' },
  { id: 'e', label: 'bind.e' },
  { id: 'r', label: 'bind.r' },
  { id: 'potion', label: 'bind.potion' },
  { id: 'interact', label: 'bind.interact' },
  { id: 'lantern', label: 'bind.lantern' },
  { id: 'bag', label: 'bind.bag' },
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
    Space: 'key.space', Tab: 'Tab', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift',
    ControlLeft: 'L-Ctrl', AltLeft: 'L-Alt', Enter: 'key.enter',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  };
  return t(map[code] ?? code);
}

export function resetBinds(): void {
  meta.data.settings.binds = { ...DEFAULT_BINDS };
  meta.save();
}
