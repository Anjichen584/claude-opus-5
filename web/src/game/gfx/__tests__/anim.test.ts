import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import {
  ANIM, ACTION_PRIORITY, actionOf, bobPx, frameIndex, frameList, frameName, spriteFor,
  type AnimAction,
} from '@game/gfx/anim';

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
 * 美术资产守卫:帧序列的"同画布 + 脚底贴底"是 `tools/process_frames.py` 的硬口径,
 * 破了会出现"播放时身体忽大忽小 / 整个人上下跳"——这种 bug 测试不测就没人测(肉眼要盯着看才看得出)。
 */
describe('走路序列资产(剑士)', () => {
  it('4 帧都在,且每帧画布完全一致', async () => {
    const { readFileSync } = await import('node:fs');
    const sizes = new Set<string>();
    for (let i = 1; i <= 4; i++) {
      const f = resolve(DIR, `knight_walk_${i}.png`);
      expect(existsSync(f), `缺少 knight_walk_${i}.png(跑 tools/process_frames.py)`).toBe(true);
      // PNG 头:宽高在 IHDR 里(第 16..24 字节)。不引 PNG 解码库,直接读头 —— 只在测试里读,够用。
      const buf = readFileSync(f);
      sizes.add(`${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`);
    }
    expect(sizes.size, `各帧画布不一致:${[...sizes].join(', ')}`).toBe(1);
  });
});
