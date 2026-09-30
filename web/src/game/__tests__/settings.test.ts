import { describe, expect, it } from 'vitest';
import { DEFAULT_BINDS, meta } from '@game/meta/Save';
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

  it('默认设置:音量/缩放在合法区间', () => {
    const s = meta.data.settings;
    expect(s.musicVol).toBeGreaterThanOrEqual(0);
    expect(s.musicVol).toBeLessThanOrEqual(1);
    expect(s.sfxVol).toBeGreaterThanOrEqual(0);
    expect(s.sfxVol).toBeLessThanOrEqual(1);
    expect(s.uiScale).toBeGreaterThanOrEqual(0.5);
    expect(s.uiScale).toBeLessThanOrEqual(2.0);
  });

  it('键名美化覆盖常用键', () => {
    expect(keyLabel('KeyJ')).toBe('J');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('Space')).toBe('空格');
    expect(keyLabel('F13')).toBe('F13'); // 未知键原样显示
  });
});

/* ================= 可访问性(轮 37):色盲调色板 ================= */

import { COLORBLIND_NAMES, COLORBLIND_PALETTES, ELEMENT_COLORS, applyColorblind } from '@game/constants';
import { elementColor } from '@game/combat/Elements';
import { defaultSave as dflt37, migrateSave as mig37 } from '@game/meta/migrations';

describe('色盲三模式(轮 37)', () => {
  it('四套调色板齐全,名字对齐;每套内部四色两两不同', () => {
    expect(COLORBLIND_PALETTES).toHaveLength(4);
    expect(COLORBLIND_NAMES).toHaveLength(4);
    for (const p of COLORBLIND_PALETTES) {
      const set = new Set([p.fire, p.ice, p.bolt, p.toxin]);
      expect(set.size, JSON.stringify(p)).toBe(4);
    }
  });

  it('红/绿弱模式下毒不再是绿色系(和火/预警红能分开)', () => {
    for (const mode of [1, 2]) {
      const tox = COLORBLIND_PALETTES[mode].toxin.toLowerCase();
      // 绿通道不再主导(粗判:g 不同时大于 r 与 b)
      const g = parseInt(tox.slice(3, 5), 16);
      const r = parseInt(tox.slice(1, 3), 16);
      const b = parseInt(tox.slice(5, 7), 16);
      expect(g > r && g > b, `模式 ${mode} 毒色仍是绿主导:${tox}`).toBe(false);
    }
  });

  it('applyColorblind 整表替换,elementColor() 即时反映;越界回默认;能切回', () => {
    applyColorblind(2);
    expect(elementColor('toxin')).toBe(COLORBLIND_PALETTES[2].toxin);
    expect(ELEMENT_COLORS.ice).toBe(COLORBLIND_PALETTES[2].ice);
    applyColorblind(99);
    expect(elementColor('fire')).toBe(COLORBLIND_PALETTES[0].fire);
    applyColorblind(0);
    expect(elementColor('toxin')).toBe(COLORBLIND_PALETTES[0].toxin);
  });

  it('存档:默认 0;迁移清洗夹回 [0,3] 且取整', () => {
    expect(dflt37().settings.colorblind).toBe(0);
    const d = dflt37();
    const raw = JSON.parse(JSON.stringify(d));
    raw.settings.colorblind = 7.9;
    expect(mig37(raw).data.settings.colorblind).toBe(3);
    raw.settings.colorblind = -2;
    expect(mig37(raw).data.settings.colorblind).toBe(0);
    raw.settings.colorblind = 'x';
    expect(mig37(raw).data.settings.colorblind).toBe(0);
  });
});
