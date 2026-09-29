import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPRITE_NAMES } from '@game/gfx/spriteDraw';
import { ITEM_ICON, STAT_ICON, drawIcon, drawIconRow } from '@game/gfx/icons';
import { SLOTS } from '@game/loot/Items';

const DIR = resolve(process.cwd(), 'public/sprites');
const pathOf = (n: string): string => resolve(DIR, `${n}.png`);
const have = (n: string): boolean => existsSync(pathOf(n));

/** 极简 PNG 头解析:拿宽高,不需要解码整图 */
function pngSize(file: string): { w: number; h: number } {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString('ascii'), `${file} 不是 PNG`).toBe('PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * 图标契约(第五批美术):
 * 1. 每个装备部位必须有图标,且登记进 SPRITE_NAMES + 文件在位;
 * 2. 图标尺寸符合 UI 规格(物品/状态 ≤ 24px 高,超出会撑破格子);
 * 3. drawIcon 在未加载时返回 false(调用方要靠它回退,不能抛异常)。
 */
describe('物品图标', () => {
  it('六个装备部位全覆盖,且都在 SPRITE_NAMES 里', () => {
    expect(Object.keys(ITEM_ICON).sort()).toEqual([...SLOTS].sort());
    for (const slot of SLOTS) {
      const name = ITEM_ICON[slot];
      expect(SPRITE_NAMES).toContain(name);
      expect(have(name), `缺少 ${name}.png(跑 tools/iconize.py)`).toBe(true);
    }
  });

  it('图标尺寸在 UI 规格内(高度 24,宽度不超 32)', () => {
    for (const name of Object.values(ITEM_ICON)) {
      const { w, h } = pngSize(pathOf(name));
      expect(h, `${name} 高度应为 24`).toBe(24);
      expect(w, `${name} 过宽(${w}px)会撑破背包格`).toBeLessThanOrEqual(32);
    }
  });
});

describe('状态图标', () => {
  it('键名稳定(结算页/HUD 依赖这些键)', () => {
    expect(Object.keys(STAT_ICON).sort()).toEqual(['chest', 'dps', 'kill', 'taken']);
  });

  it('每个状态图标都登记且有文件,高度 ≤ 24', () => {
    for (const [key, name] of Object.entries(STAT_ICON)) {
      expect(SPRITE_NAMES).toContain(name);
      expect(have(name), `状态 ${key} 缺少 ${name}.png`).toBe(true);
      expect(pngSize(pathOf(name)).h).toBeLessThanOrEqual(24);
    }
  });
});

describe('drawIcon 的回退契约', () => {
  const fakeCtx = (): CanvasRenderingContext2D => {
    const calls: string[] = [];
    const ctx = {
      calls,
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      drawImage: () => calls.push('drawImage'),
      fillText: () => calls.push('fillText'),
      imageSmoothingEnabled: true,
      globalAlpha: 1,
      textAlign: 'left',
      font: '',
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
    return ctx;
  };

  it('图未加载时返回 false 且不抛异常(调用方据此回退字形)', () => {
    const ctx = fakeCtx();
    expect(drawIcon(ctx, 'icon_item_weapon_不存在', 0, 0, 24)).toBe(false);
  });

  it('drawIconRow 在图标缺失时仍画出文字(布局不塌)', () => {
    const ctx = fakeCtx();
    drawIconRow(ctx, 'icon_不存在', 10, 40, 22, '击杀  3', '#fff', '15px monospace');
    expect((ctx as unknown as { calls: string[] }).calls).toContain('fillText');
  });
});
