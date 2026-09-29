import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import {
  ANIM, ACTION_PRIORITY, actionOf, bobPx, clockFor, clocksOf, cycleSec, elapsed, frameIndex,
  frameList, frameName, spriteFor, twoFrame, twoFrameFlip, type AnimAction,
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

describe('动作时钟换算(elapsed / clocksOf)', () => {
  it('剩余 → 已进行:动作没在进行(≤0 或缺字段)一律 undefined', () => {
    expect(elapsed(0.1, 0.3)).toBeCloseTo(0.2, 6);
    expect(elapsed(0, 0.3)).toBeUndefined();
    expect(elapsed(-0.5, 0.3)).toBeUndefined();
    expect(elapsed(undefined, 0.3)).toBeUndefined();
    expect(elapsed(0.1, undefined)).toBeUndefined();
  });

  it('五个动作的计时器都从组件字段映射出来(**漏一个 = 那个动作永远停在第一帧**)', () => {
    const c = clocksOf({
      dashT: 0.05, dashDur: 0.22,
      attackT: 0.1, attackDur: 0.2,
      hurtT: 0.02, hurtDur: 0.1,
      respawnT: 0.3, respawnDur: 1.5,
    });
    expect(c.dashT).toBeCloseTo(0.17, 6);
    expect(c.attackT).toBeCloseTo(0.1, 6);
    expect(c.castT, '远程普攻就是 cast —— 必须和普攻共用计时器').toBeCloseTo(0.1, 6);
    expect(c.hurtT).toBeCloseTo(0.08, 6);
    expect(c.dieT).toBeCloseTo(1.2, 6);
  });

  it('不动(全为 0)时所有时钟都是 undefined,clockFor 归 0 = 第一帧', () => {
    const c = clocksOf({ dashT: 0, dashDur: 0.22, attackT: 0, attackDur: 0.2 });
    expect(c.dashT).toBeUndefined();
    expect(clockFor('dash', 12, c)).toBe(0);
    expect(clockFor('cast', 12, c)).toBe(0);
  });

  it('拉弓的时间轴:起手 → 放箭 → 保持收招(而不是永远第 1 帧 —— 本轮真踩过)', () => {
    const has = loaded(['ranger_cast_1', 'ranger_cast_2', 'ranger_cast_3']);
    // cast 序列 3 帧 @12fps = 0.25s,而普攻总时长 0.5s:后半段**保持最后一帧**(一次性动作不循环)
    const castOf = (elapsedS: number): string => {
      const dur = 0.5;
      const c = clocksOf({ attackT: dur - elapsedS, attackDur: dur });
      return spriteFor('ranger', 'cast', clockFor('cast', 99, c), has);
    };
    expect(castOf(0), '起手').toBe('ranger_cast_1');
    // 0.09s 明确落在第 2 帧内(1/12 = 0.0833…,卡在边界上浮点会 floor 到第 1 帧)
    expect(castOf(0.09), '第 2 帧:放箭').toBe('ranger_cast_2');
    expect(castOf(0.2), '序列放完 → 保持收招').toBe('ranger_cast_3');
    expect(castOf(0.49), '动作还没结束 → 仍停在收招').toBe('ranger_cast_3');
    // 计时器归 0 = **这个动作结束了**(判定层会把状态切回待机/走路),所以帧回到第 1 帧是对的
    expect(castOf(0.5), '动作结束(计时器归 0)→ 时钟归 0').toBe('ranger_cast_1');
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

describe('杂兵两帧资产(twoFrame)—— 走路节奏只有一个来源', () => {
  const hasF2 = loaded(['windbee', 'windbee_f2']);

  it('缺 `_f2` → 退回站立单帧(降级而非消失)', () => {
    expect(twoFrame('windbee', 0.3, loaded(['windbee']))).toBe('windbee');
    expect(twoFrame('shroomling', 0.3, loaded([]))).toBe('shroomling');
  });

  it('不动/被定身时不翻帧(原地抖腿看着像卡了)', () => {
    for (let t = 0; t < 1; t += 0.05) {
      expect(twoFrame('windbee', t, hasF2, false)).toBe('windbee');
      expect(twoFrameFlip(t, false)).toBe(false);
    }
  });

  it('**交替节奏推导自 balance.anim.walk**(不是手写的 8 次/秒)', () => {
    // 改帧率时玩家与杂兵必须一起变:两帧资产每**半圈**翻一次,等于"每两个走路帧翻一次"
    const expectGap = cycleSec('walk') / 2;
    expect(expectGap, '两帧步长 = 走路一圈的一半').toBeCloseTo(2 / ANIM.walk.fps, 6);
    const flips: number[] = [];
    let prev = twoFrameFlip(0);
    for (let t = 0.001; t < 1; t += 0.001) {
      const now = twoFrameFlip(t);
      if (now !== prev) flips.push(t);
      prev = now;
    }
    // 1 秒内翻 1/步长 次(首帧不计,所以是 次数-1 个间隔)
    expect(flips.length, '1 秒内的翻转次数与步长对得上').toBe(Math.round(1 / expectGap) - 1);
    for (let i = 1; i < flips.length; i++) {
      expect(flips[i] - flips[i - 1], '翻转间隔恒定 = 半圈').toBeCloseTo(expectGap, 2);
    }
    // 硬编码 8 次/秒会得到 0.125s 的间隔 —— 比正确值快一倍,这条会红
    expect(flips[0]).toBeCloseTo(expectGap, 2);
  });

  it('两帧走路真的在两帧之间切(降级路径不是死代码)', () => {
    const names = new Set<string>();
    for (let t = 0; t < 0.6; t += 0.01) names.add(twoFrame('windbee', t, hasF2));
    expect([...names].sort()).toEqual(['windbee', 'windbee_f2']);
  });

  it('场景层不再有第二套走路节奏(硬编码 `floor(t*8)%2` 会与玩家漂开)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/game/GameScene.ts'), 'utf8');
    expect(/floor\(\s*clock\.runTime\s*\*\s*8\s*\)/.test(src), 'GameScene 里还有硬编码的 8fps 翻帧')
      .toBe(false);
    expect(src, 'frame2 应该委托给 anim.ts 的 twoFrame').toMatch(/twoFrame\(/);
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
    // 目标高度按**自己那个职业的站立单帧**判:切动作时是同一个人,不该变大变小
    const idleHOf = (seq: string): number => {
      const base = seq.slice(0, seq.lastIndexOf('_'));
      return pngSize(resolve(DIR, `${base}.png`))[1];
    };
    for (const [seq, info] of Object.entries(m)) {
      const suffix = seq.slice(seq.lastIndexOf('_') + 1);
      const action = ACTION_OF_SUFFIX[suffix];
      expect(action, `清单里的 ${seq} 认不出动作后缀`).toBeTruthy();
      expect(info.frames, `${seq} 帧数与 balance.anim.${suffix}.frames 不一致`).toBe(ANIM[action].frames);
      // 锚点帧身体高度 = 目标高度(±1px 是最近邻缩放的取整误差)
      expect(Math.abs(info.anchorBody[1] - info.targetH), `${seq} 锚点帧身体 ${info.anchorBody[1]}px ≠ 目标 ${info.targetH}px`).toBeLessThanOrEqual(1);
      // 目标高度还要与**该职业**的站立单帧同高,否则切动作时"人变大变小"
      const idleH = idleHOf(seq);
      expect(Math.abs(info.targetH - idleH), `${seq} 目标高 ${info.targetH} 与 ${seq.slice(0, seq.lastIndexOf('_'))}.png ${idleH} 差太多`).toBeLessThanOrEqual(2);
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
