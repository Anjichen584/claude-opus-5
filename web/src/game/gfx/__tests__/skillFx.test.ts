import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SPRITE_NAMES } from '@game/gfx/spriteDraw';
import { SKILL_FX, FX_FALLBACK } from '@game/gfx/skillFx';

const DIR = resolve(process.cwd(), 'public/sprites');
const have = (n: string): boolean => existsSync(resolve(DIR, `${n}.png`));
const pngSize = (n: string): { w: number; h: number } => {
  const buf = readFileSync(resolve(DIR, `${n}.png`));
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
};

/**
 * 技能特效贴图契约(第五批之三)。
 * 特效的失败模式是**静默降级**:贴图没加载就退回程序化画法,线上看着"只是朴素一点",
 * 极难发现。所以这里把"登记表 → 文件 → 尺寸"三层都钉住。
 */
describe('技能专属特效贴图', () => {
  it('每个技能都有特效档案(写清用哪张贴图,或明确 null = 程序化)', () => {
    for (const [skillId, fx] of Object.entries(SKILL_FX)) {
      expect(skillId, '技能 id 形如 职业_键_名').toMatch(/^(blade|ranger|arcanist|warden)_[qer]_/);
      if (fx.sprite === null) continue;
      expect(SPRITE_NAMES, `${skillId} 用的 ${fx.sprite} 未登记`).toContain(fx.sprite);
      expect(have(fx.sprite), `${skillId} 的贴图 ${fx.sprite}.png 不存在`).toBe(true);
    }
  });

  it('专属特效尺寸走真实数值(冲击环要宽扁平、剑体要竖长)', () => {
    const flat = ['fx_shockwave', 'fx_crack', 'fx_arrowrain']; // 扁平贴花:宽 > 高
    for (const n of flat) {
      const { w, h } = pngSize(n);
      expect(w / h, `${n} 应当是扁平的(${w}x${h})`).toBeGreaterThan(1.4);
    }
    const tall = pngSize('fx_swordfall');
    expect(tall.h / tall.w, '星剑应当是竖长的').toBeGreaterThan(1.3);
    const trail = pngSize('fx_dash_trail');
    expect(trail.w / trail.h, '冲刺拖尾应当是横向的').toBeGreaterThan(1.3);
  });

  it('回退链完整:专属贴图 → 通用贴图 → 程序化(缺一环就会画不出来)', () => {
    for (const [skill, chain] of Object.entries(FX_FALLBACK)) {
      expect(chain.length, `${skill} 的回退链至少两级`).toBeGreaterThanOrEqual(2);
      const last = chain[chain.length - 1];
      expect(last === null || typeof last === 'string').toBe(true);
      if (typeof last === 'string') expect(SPRITE_NAMES).toContain(last);
    }
    // 通用贴图本身必须存在(它们是最后一道贴图防线)
    for (const n of ['fx_slash', 'fx_burst', 'fx_ring', 'fx_beam']) {
      expect(have(n), `通用特效 ${n}.png 丢了`).toBe(true);
    }
  });

  it('四个职业的 R 都有专属特效(Q 允许复用通用弧光)', () => {
    for (const klass of ['blade', 'ranger', 'arcanist', 'warden']) {
      const ult = Object.entries(SKILL_FX).find(([id]) => id === `${klass}_r_` || id.startsWith(`${klass}_r_`));
      expect(ult, `${klass} 缺 R 技能特效档案`).toBeTruthy();
      expect(ult![1].sprite, `${klass} 的大招应当有专属贴图`).not.toBeNull();
    }
  });
});
