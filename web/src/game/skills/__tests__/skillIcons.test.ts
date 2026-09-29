import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import blade from '@data/skills/blade.json';
import ranger from '@data/skills/ranger.json';
import arcanist from '@data/skills/arcanist.json';
import warden from '@data/skills/warden.json';
import { SPRITE_NAMES } from '@game/gfx/spriteDraw';

/**
 * 技能数据 ↔ 美术契约:
 * 每个技能都要声明一个原型图标(斩击/投射/突进/大招),且对应精灵必须已登记。
 * 漏了就只在 HUD 上"少个图标",不会报错 —— 用测试兜住这类静默降级。
 */
// 4 个原型图标(兜底/通用);Q/R 现已升级为每技能专属图标
const ARCHETYPES = ['slash', 'shot', 'dash', 'ult'] as const;
const DIR = resolve(process.cwd(), 'public/sprites');
const have = (n: string): boolean => existsSync(resolve(DIR, `${n}.png`));
const CLASSES: Array<[string, { skills: Array<{ slot: string; name: string; icon?: string }> }]> = [
  ['狂澜剑士', blade],
  ['星弓猎手', ranger],
  ['秘术师', arcanist],
  ['守卫', warden],
];

describe('职业技能图标', () => {
  it('四职业的 Q/E/R 都声明了 icon 字段', () => {
    for (const [name, data] of CLASSES) {
      expect(data.skills).toHaveLength(3);
      for (const s of data.skills) {
        expect(s.icon, `${name} ${s.slot} ${s.name} 缺 icon`).toBeTruthy();
      }
    }
  });

  it('每个用到的图标都登记且有成品文件(缺图会静默降级,必须测试兜住)', () => {
    for (const [name, data] of CLASSES) {
      for (const s of data.skills) {
        const sprite = `icon_${s.icon}`;
        expect(SPRITE_NAMES, `icon_${s.icon} 未登记进 SPRITE_NAMES(${name} ${s.slot})`).toContain(sprite);
        expect(have(sprite), `${name} ${s.slot} ${s.name} 的贴图 ${sprite}.png 不存在`).toBe(true);
      }
    }
  });

  it('Q 与 R 是**每技能专属**图标(8 个互不相同),不是四个原型复用', () => {
    const qr: string[] = [];
    for (const [, data] of CLASSES) {
      for (const s of data.skills) {
        if (s.slot === 'Q' || s.slot === 'R') qr.push(s.icon!);
      }
    }
    expect(qr).toHaveLength(8);
    expect(new Set(qr).size, `Q/R 图标重复:${qr.join(', ')}`).toBe(8);
    for (const ic of qr) {
      expect(ARCHETYPES as readonly string[], `${ic} 仍是原型图标,应当有专属绘制`).not.toContain(ic);
    }
  });

  it('四个原型图标仍在(未覆盖到的技能位与旧档要靠它们兜底)', () => {
    for (const a of ARCHETYPES) {
      expect(SPRITE_NAMES).toContain(`icon_${a}`);
      expect(have(`icon_${a}`), `原型图标 icon_${a}.png 丢了`).toBe(true);
    }
  });

  it('专属图标数量只增不减(当前 8;新增技能时同步补图标)', () => {
    let dedicated = 0;
    for (const [, data] of CLASSES) {
      for (const s of data.skills) {
        if (!(ARCHETYPES as readonly string[]).includes(s.icon!)) dedicated++;
      }
    }
    expect(dedicated, '专属图标减少了?要么是配置回退,要么是新增技能没补图标').toBeGreaterThanOrEqual(8);
  });
});
