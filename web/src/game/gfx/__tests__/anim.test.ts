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
 * 美术资产守卫:**数据驱动**,照着管线自己报的度量清单(`_anim_metrics.json`,由
 * `tools/process_frames.py` 每次处理/`--reindex` 时写出)逐套查。
 *
 * 为什么要清单而不是自己量:想断言的不变量是"**锚点帧的身体高度 = 目标高度**"——
 * 身体是连通域(要把剑/披风剔出去),在测试里干这事得解码 PNG 数像素,杀鸡用牛刀;
 * 而且这条口径是**管线自己定的**,由管线报数最不容易漂。
 *
 * 三条不变量都对应真实踩过的坑:
 * - **锚点帧身体高度**:选错锚点 → 整套动作都偏大偏小(单帧看着都正常,切动作就"变一个人");
 * - **各帧画布一致**:不一致 → 播放时身体忽大忽小(双帧时代的老坑);
 * - **登记进 `SPRITE_NAMES`**:漏登记 → 运行时拿不到图 → 静默回退待机(表现是"这套动画没上")。
 * 另外还要对得上 `balance.anim` 的帧数:数据说 4 帧、只有 3 张图必须红。
 */
describe('动作序列资产(度量清单驱动)', () => {
  const MANIFEST = resolve(DIR, '_anim_metrics.json');
  const readManifest = (): Record<string, {
    frames: number; targetH: number; anchor: number;
    canvas: [number, number]; anchorBody: [number, number]; bodies: Array<[number, number]>;
  }> => JSON.parse(readFileSync(MANIFEST, 'utf8'));

  const ACTION_OF_SUFFIX: Record<string, AnimAction> = {
    walk: 'walk', atk: 'atk', dash: 'dash', hurt: 'hurt', die: 'die', cast: 'cast', idle: 'idle',
  };

  /** PNG 头里的宽高(不引解码库:只在测试里读头,够用) */
  const pngSize = (f: string): [number, number] => {
    const buf = readFileSync(f);
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  };

  it('度量清单存在且覆盖剑士的全部 6 套动作', () => {
    expect(existsSync(MANIFEST), '缺少 _anim_metrics.json(跑 tools/process_frames.py --reindex)').toBe(true);
    const m = readManifest();
    for (const action of ['walk', 'atk', 'dash', 'hurt', 'die', 'cast']) {
      expect(m[`knight_${action}`], `清单缺 knight_${action}`).toBeTruthy();
    }
  });

  it('每套:帧数与 balance.anim 一致、锚点帧身体高度 = 目标高度、各帧画布一致', () => {
    const m = readManifest();
    const idleH = pngSize(resolve(DIR, 'knight.png'))[1];
    for (const [seq, info] of Object.entries(m)) {
      const suffix = seq.slice(seq.lastIndexOf('_') + 1);
      const action = ACTION_OF_SUFFIX[suffix];
      expect(action, `清单里的 ${seq} 认不出动作后缀`).toBeTruthy();
      expect(info.frames, `${seq} 帧数与 balance.anim.${suffix}.frames 不一致`).toBe(ANIM[action].frames);
      // 锚点帧身体高度 = 目标高度(±1px 是最近邻缩放的取整误差)
      expect(Math.abs(info.anchorBody[1] - info.targetH), `${seq} 锚点帧身体 ${info.anchorBody[1]}px ≠ 目标 ${info.targetH}px`).toBeLessThanOrEqual(1);
      // 目标高度还要与既有单帧精灵同高,否则切动作时"人变大变小"
      expect(Math.abs(info.targetH - idleH), `${seq} 目标高 ${info.targetH} 与 knight.png ${idleH} 差太多`).toBeLessThanOrEqual(2);
      // 清单说画布一致 → 实际文件也要一致(清单是管线的自述,得跟产物对得上)
      for (let i = 1; i <= info.frames; i++) {
        const f = resolve(DIR, `${seq}_${i}.png`);
        expect(existsSync(f), `缺少 ${seq}_${i}.png`).toBe(true);
        expect(pngSize(f), `${seq}_${i} 画布与清单不符`).toEqual(info.canvas);
        expect(SPRITE_NAMES, `${seq}_${i} 没登记进 SPRITE_NAMES(运行时会静默回退待机)`).toContain(`${seq}_${i}`);
      }
    }
  });

  it('已入库序列的帧名能被 spriteFor 取到(登记 + 数据 + 文件三方对齐)', () => {
    const m = readManifest();
    for (const seq of Object.keys(m)) {
      const base = seq.slice(0, seq.lastIndexOf('_'));
      const suffix = seq.slice(seq.lastIndexOf('_') + 1);
      const action = ACTION_OF_SUFFIX[suffix];
      const names = frameList(base, action, (n) => existsSync(resolve(DIR, `${n}.png`)));
      expect(names.length, `${seq} 的 frameList 只取到 ${names.length} 帧`).toBe(ANIM[action].frames);
    }
  });
});
