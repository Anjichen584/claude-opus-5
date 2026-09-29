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
const ICONS = ['slash', 'shot', 'dash', 'ult'] as const;
const CLASSES: Array<[string, { skills: Array<{ slot: string; name: string; icon?: string }> }]> = [
  ['狂澜剑士', blade],
  ['星弓猎手', ranger],
  ['秘术师', arcanist],
  ['守卫', warden],
];

describe('职业技能图标', () => {
  it('四职业的 Q/E/R 都声明了合法图标', () => {
    for (const [name, data] of CLASSES) {
      expect(data.skills).toHaveLength(3);
      for (const s of data.skills) {
        expect(s.icon, `${name} ${s.slot} ${s.name} 缺 icon`).toBeTruthy();
        expect(ICONS, `${name} ${s.slot} 的 icon=${s.icon} 不在原型表内`).toContain(s.icon);
      }
    }
  });

  it('每个用到的图标都有成品精灵图', () => {
    for (const [, data] of CLASSES) {
      for (const s of data.skills) {
        expect(SPRITE_NAMES, `icon_${s.icon} 未登记进 SPRITE_NAMES`).toContain(`icon_${s.icon}`);
      }
    }
  });

  it('图标语义抽查:大招位的技能都用大招图标', () => {
    for (const [name, data] of CLASSES) {
      const ult = data.skills.find((s) => s.slot === 'R');
      expect(ult?.icon, `${name} 的 R 应为大招图标`).toBe('ult');
    }
  });
});
