import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import {
  ANIM, ACTION_PRIORITY, actionOf, bobPx, clockFor, frameIndex, frameList, frameName, spriteFor,
  type AnimAction,
} from '@game/gfx/anim';
import { SPRITE_NAMES } from '@game/gfx/spriteDraw';

const A = balance.anim;
const DIR = resolve(process.cwd(), 'public/sprites');

/** 假装只有这些精灵已加载 */
const loaded = (names: string[]) => (n: string) => names.includes(n);

describe('动作表(balance.anim)', () => {
  it('每个动作都有帧数/帧率,且数值合理(帧率写 0 等于静止,帧数 0 等于没图)', () => {
    for (const [name, spec] of Object.entries(ANIM)) {
      expect(spec.frames, `${name}.frames`).toBeGreaterThanOrEqual(1);
      expect(spec.fps, `${name}.fps`).toBeGreaterThan(0);
      expect(typeof spec.loop).toBe('boolean');
    }
  });

  it('循环/一次性的划分是刻意的:只有待机与走路循环', () => {
    expect(ANIM.idle.loop).toBe(true);
    expect(ANIM.walk.loop).toBe(true);
    for (const a of ['atk', 'dash', 'cast', 'hurt', 'die'] as AnimAction[]) {
      expect(ANIM[a].loop, `${a} 不该循环(攻击动作自己转圈最难看)`).toBe(false);
    }
  });

  it('优先级覆盖全部动作且无重复(改优先级时不会漏掉某个动作)', () => {
    expect(new Set(ACTION_PRIORITY).size).toBe(ACTION_PRIORITY.length);
    expect([...ACTION_PRIORITY].sort()).toEqual(Object.keys(ANIM).sort());
    expect(ACTION_PRIORITY[0]).toBe('die'); // 死亡最高:别的动作都不该盖住它
  });
});

describe('动作判定(状态 → 动作)', () => {
  it('按优先级取:翻滚压过攻击,受击压过移动,死亡压过一切', () => {
    expect(actionOf({})).toBe('idle');
    expect(actionOf({ moving: true })).toBe('walk');
    expect(actionOf({ moving: true, hurt: true })).toBe('hurt');
    expect(actionOf({ attacking: true, moving: true })).toBe('atk');
    expect(actionOf({ attacking: true, dashing: true })).toBe('dash');
    expect(actionOf({ dead: true, dashing: true, attacking: true })).toBe('die');
  });
});

describe('帧号(frameIndex)', () => {
  it('循环动作按帧率走,走完回第 1 帧', () => {
    expect(frameIndex(0, 8, 4, true)).toBe(0);
    expect(frameIndex(0.124, 8, 4, true)).toBe(0); // 第 0 帧持续 1/8 秒
    expect(frameIndex(0.125, 8, 4, true)).toBe(1);
    expect(frameIndex(0.5, 8, 4, true)).toBe(0);   // 0.5s = 整整一圈
  });

  it('负时间也安全(换房后计时器回 0、或传了时钟偏移)', () => {
    expect(frameIndex(-0.3, 8, 4, true)).toBeGreaterThanOrEqual(0);
    expect(frameIndex(-0.3, 8, 4, true)).toBeLessThan(4);
  });

  it('一次性动作停在最后一帧,不循环', () => {
    expect(frameIndex(0, 15, 3, false)).toBe(0);
    expect(frameIndex(0.07, 15, 3, false)).toBe(1); // 1/15 ≈ 0.0667s 之后进第 2 帧
    expect(frameIndex(0.2, 15, 3, false)).toBe(2);   // 0.2s > 2/15,已经到最后一帧
    expect(frameIndex(99, 15, 3, false)).toBe(2); // 停在最后一帧
  });

  it('单帧序列恒为 0(不会算出 1 去取不存在的图)', () => {
    expect(frameIndex(0, 4, 1, true)).toBe(0);
    expect(frameIndex(12.7, 4, 1, true)).toBe(0);
  });

  it('帧数为 0/负(数据写错)也返回合法下标,不产生 NaN 或负数', () => {
    // 取模运算遇到 0 会得到 NaN,NaN 拿去索引数组 = undefined = 绘制层拿到不存在的精灵名
    expect(frameIndex(0.5, 8, 0, true)).toBe(0);
    expect(frameIndex(0.5, 8, 0, false)).toBe(0);
    expect(frameIndex(0.5, 8, -2, true)).toBe(0);
    expect(Number.isNaN(frameIndex(0.5, 8, 0, true))).toBe(false);
  });
});

describe('精灵选择(spriteFor · 回退链)', () => {
  const seq = ['knight_walk_1', 'knight_walk_2', 'knight_walk_3', 'knight_walk_4'];

  it('序列齐全时逐帧播放', () => {
    const has = loaded(seq);
    expect(spriteFor('knight', 'walk', 0, has)).toBe('knight_walk_1');
    expect(spriteFor('knight', 'walk', 0.13, has)).toBe('knight_walk_2');
    expect(spriteFor('knight', 'walk', 0.5, has)).toBe('knight_walk_1');
  });

  it('缺整套序列 → 降级到历史两帧资产,**且真的在两帧之间切**(降级不是死代码)', () => {
    const two = loaded(['knight_walk']);
    const names = new Set<string>();
    for (let t = 0; t < 0.6; t += 0.05) names.add(spriteFor('knight', 'walk', t, two));
    expect([...names].sort()).toEqual(['knight', 'knight_walk']);
    // 且绝不返回不存在的序列帧名
    for (const n of names) expect(['knight', 'knight_walk']).toContain(n);
  });

  it('什么都没有 → 站立单帧(永远不会返回不存在的名字)', () => {
    const none = loaded([]);
    expect(spriteFor('knight', 'walk', 0.2, none)).toBe('knight');
    expect(spriteFor('knight', 'idle', 0.2, none)).toBe('knight');
    expect(spriteFor('knight', 'atk', 0.2, none)).toBe('knight');
    expect(spriteFor('knight', 'die', 0.2, none)).toBe('knight');
  });

  it('序列断号(只有前 2 帧)按现有帧数循环,不会去取第 3 帧', () => {
    const has = loaded(['knight_walk_1', 'knight_walk_2']);
    const names = new Set<string>();
    for (let t = 0; t < 1; t += 0.02) names.add(spriteFor('knight', 'walk', t, has));
    expect([...names].sort()).toEqual(['knight_walk_1', 'knight_walk_2']);
  });

  it('frameList 遇到断号立刻停(半成品序列不该被当成完整序列)', () => {
    expect(frameList('knight', 'walk', loaded(['knight_walk_1']))).toEqual(['knight_walk_1']);
    expect(frameList('knight', 'walk', loaded(['knight_walk_2']))).toEqual([]);
    expect(frameList('knight', 'walk', loaded(seq))).toHaveLength(4);
  });

  it('帧名约定与美术管线一致(1 起,下划线分隔)', () => {
    expect(frameName('knight', 'walk', 1)).toBe('knight_walk_1');
    expect(frameName('ranger', 'atk', 3)).toBe('ranger_atk_3');
  });
});

describe('动作时钟(clockFor)', () => {
  const span = (a: AnimAction): number => ANIM[a].frames / ANIM[a].fps;

  it('循环动作用全局时间(切帧时机与动作起点无关)', () => {
    expect(clockFor('walk', 12.34, {})).toBe(12.34);
    expect(clockFor('idle', 5, {})).toBe(5);
  });

  it('一次性动作吃"自己开始了多久",不吃全局时间', () => {
    const c = { dashT: 0.1, attackT: 0.05, hurtT: 0.02, dieT: 0.3 };
    expect(clockFor('dash', 99, c)).toBe(0.1);
    expect(clockFor('atk', 99, c)).toBe(0.05);
    expect(clockFor('hurt', 99, c)).toBe(0.02);
    expect(clockFor('die', 99, c)).toBe(0.3);
  });

  it('缺计时器(动作刚结束/字段没传)按 0 处理,不产生 NaN', () => {
    for (const a of ['dash', 'atk', 'cast', 'hurt', 'die'] as AnimAction[]) {
      const t = clockFor(a, 7, {});
      expect(Number.isNaN(t)).toBe(false);
      expect(t).toBe(0);
    }
  });

  it('计时器超出动作总时长时夹住(动作结束后计时器可能为负或被清零)', () => {
    expect(clockFor('atk', 0, { attackT: 99 })).toBeCloseTo(span('atk'), 6);
    expect(clockFor('atk', 0, { attackT: -3 })).toBe(0);
  });

  it('第二次攻击从第 1 帧开始(而不是接着上次播到一半)', () => {
    const has = loaded(['knight_atk_1', 'knight_atk_2', 'knight_atk_3']);
    const first = spriteFor('knight', 'atk', clockFor('atk', 30, { attackT: 0 }), has);
    const second = spriteFor('knight', 'atk', clockFor('atk', 31.7, { attackT: 0 }), has);
    expect(first).toBe('knight_atk_1');
    expect(second, '用全局时间会从中间某帧起播 —— 这就是 clockFor 存在的理由').toBe('knight_atk_1');
  });
});

describe('走路起伏(bobPx)', () => {
  it('站着不起伏;走路时在 ±幅度内来回,频率=每步一次', () => {
    expect(bobPx(0.1, false)).toBe(0);
    let max = 0;
    for (let t = 0; t < 1; t += 0.005) max = Math.max(max, Math.abs(bobPx(t, true)));
    expect(max).toBeCloseTo(A.bobAmplitudePx, 3);
    // 每步一次起伏:走路一圈 = frames/fps 秒,里面有 frames/2 步(每步两帧)
    const stepsPerS = A.walk.fps / A.walk.frames;
    expect(bobPx(0, true)).toBeCloseTo(bobPx(1 / stepsPerS, true), 6);
  });

  it('幅度要小(大于 2px 的起伏会让像素画看起来在飘)', () => {
    expect(A.bobAmplitudePx).toBeGreaterThan(0);
    expect(A.bobAmplitudePx).toBeLessThan(2);
  });
});

/**
 * 美术资产守卫:**数据驱动**,照着 `balance.anim` 的帧数逐个查 ——
 * 新做一套序列(或把帧数从 3 改成 4)会自动进检查,不会因为"忘了加测试"而漏掉。
 *
 * 两条不变量都来自 `tools/process_frames.py` 的硬口径,破了肉眼要盯着看才发现:
 * - **各帧画布一致**:不一致 = 播放时身体忽大忽小(双帧时代踩过);
 * - **帧被登记进 `SPRITE_NAMES`**:漏登记 → 运行时 `sprites.get()` 拿不到 → 静默回退待机,
 *   表现是"这套动画根本没上",但控制台一声不响。
 */
describe('动作序列资产(数据驱动)', () => {
  const PNG_SIZE = (f: string): string => {
    // PNG 头:宽高在 IHDR 里(第 16..24 字节)。不引 PNG 解码库,直接读头 —— 只在测试里读,够用。
    const buf = readFileSync(f);
    return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
  };

  it('已入库的序列:帧数齐全、画布一致、登记表里有名字', () => {
    // 已出图的序列(其余动作等美术批次,balance.anim 的帧数是"目标帧数")
    const shipped: Array<[string, AnimAction, number]> = [
      ['knight', 'walk', 4],
      ['knight', 'atk', 3],
      ['knight', 'dash', 3],
      ['knight', 'hurt', 2],
    ];
    for (const [base, action, frames] of shipped) {
      const sizes = new Set<string>();
      for (let i = 1; i <= frames; i++) {
        const name = frameName(base, action, i);
        const f = resolve(DIR, `${name}.png`);
        expect(existsSync(f), `缺少 ${name}.png(跑 tools/process_frames.py ${base}_${action})`).toBe(true);
        sizes.add(PNG_SIZE(f));
        expect(SPRITE_NAMES, `${name} 没登记进 SPRITE_NAMES(运行时会静默回退待机)`).toContain(name);
      }
      expect(sizes.size, `${base}_${action} 各帧画布不一致:${[...sizes].join(', ')}`).toBe(1);
    }
  });

  it('balance.anim 里已出图的动作,帧数与文件数一致(改了数据没补图会红)', () => {
    for (const [base, action, frames] of [['knight', 'walk', ANIM.walk.frames], ['knight', 'atk', ANIM.atk.frames]] as Array<[string, AnimAction, number]>) {
      expect(frames, `${base}_${action}: balance.anim 说 ${frames} 帧`).toBe(Number(ANIM[action].frames));
    }
    expect(ANIM.walk.frames).toBe(4);
    expect(ANIM.atk.frames).toBe(3);
    expect(ANIM.dash.frames).toBe(3);
    expect(ANIM.hurt.frames).toBe(2);
  });

  it('序列帧的尺寸与单帧精灵同量级(差太多说明缩放锚点选错了)', () => {
    const idle = PNG_SIZE(resolve(DIR, 'knight.png')).split('x').map(Number)[1];
    for (const name of ['knight_walk_1', 'knight_atk_1', 'knight_dash_1', 'knight_hurt_1']) {
      const h = PNG_SIZE(resolve(DIR, `${name}.png`)).split('x').map(Number)[1];
      expect(h - idle, `${name} 与 knight 高度相差 ${h - idle}px,缩放锚点大概是选错了`).toBeLessThanOrEqual(12);
    }
  });
});
