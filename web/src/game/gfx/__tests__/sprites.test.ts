import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPRITE_NAMES } from '@game/gfx/spriteDraw';
import { ELEMENT_SPRITE } from '@game/gfx/draw';
import { ALL_ELEMENTS } from '@game/combat/Elements';

const DIR = resolve(process.cwd(), 'public/sprites');
const have = (n: string): boolean => existsSync(resolve(DIR, `${n}.png`));

/**
 * 美术管线 ↔ 代码契约守卫:
 * SPRITE_NAMES 里登记的名字必须在 public/sprites 下有成品文件,
 * 否则线上会静默回退到程序化绘制(视觉降级但不报错,极难发现)。
 */
describe('精灵资源与代码登记表', () => {
  it('SPRITE_NAMES 每一项都有对应成品文件', () => {
    const missing = SPRITE_NAMES.filter((n) => !have(n));
    expect(missing, `缺少成品图:${missing.join(', ')}(先跑 tools/process_art.py)`).toEqual([]);
  });

  it('所有名字唯一(防止登记表复制粘贴重复)', () => {
    expect(new Set(SPRITE_NAMES).size).toBe(SPRITE_NAMES.length);
  });

  it('四系元素都有图标贴图可挂', () => {
    for (const el of ALL_ELEMENTS) {
      const name = ELEMENT_SPRITE[el];
      expect(name, `元素 ${el} 缺少图标映射`).toBeTruthy();
      expect(SPRITE_NAMES).toContain(name);
      expect(have(name), `元素 ${el} 的贴图 ${name}.png 不存在`).toBe(true);
    }
  });

  it('拾取物与传送门贴图齐备', () => {
    for (const n of ['pickup_chest', 'pickup_stardust', 'pickup_potion', 'pickup_rune', 'portal_gate']) {
      expect(SPRITE_NAMES).toContain(n);
      expect(have(n), `缺少 ${n}.png`).toBe(true);
    }
  });
});
