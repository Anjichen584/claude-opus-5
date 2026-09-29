/**
 * 角色动作序列(docs/04-ART-PIPELINE.md §3、10-FULL-PLAN M3 动画批次)。
 *
 * 这一层的全部职责:**给定"角色在干嘛"和"过了多久",说是哪张图**。
 * 之所以抽成纯函数,是因为这里出错的后果都很隐蔽 ——
 * 帧号越界(黑块/白块)、一次性动作循环播放(攻击动作自己转圈)、
 * 缺一整套序列时静默变样(和双帧那次"一大一小"一样,只有玩家看得出来)。
 *
 * 回退链(**永远是"降级"而不是"消失"**):
 *   `{base}_{action}_{i}`  ← 完整序列(≥1 帧,数据驱动帧数)
 *   `{base}_walk`          ← 历史两帧资产(只做走路)
 *   `{base}`               ← 站立单帧(一定有)
 * 判定"有没有"由调用方传 `has(name)`,所以这个模块不碰资源加载,可纯函数单测。
 */
import balance from '@data/balance.json';

const A = balance.anim;

export type AnimAction = 'idle' | 'walk' | 'atk' | 'dash' | 'cast' | 'hurt' | 'die';

/** 动作表(帧数 / 帧率 / 是否循环) */
export interface AnimSpec {
  frames: number;
  fps: number;
  loop: boolean;
}

export const ANIM: Record<AnimAction, AnimSpec> = {
  idle: A.idle, walk: A.walk, atk: A.atk, dash: A.dash,
  cast: A.cast, hurt: A.hurt, die: A.die,
};

/** 动作优先级:同时满足多个条件时,取靠前的(翻滚 > 攻击 > 受击 > 移动 > 待机) */
export const ACTION_PRIORITY: AnimAction[] = ['die', 'dash', 'atk', 'cast', 'hurt', 'walk', 'idle'];

/**
 * 动作时钟所需的计时器(玩家/敌人都能用 —— 字段名保持中性)。
 * 每个"一次性动作"都吃**自己开始了多久**:用全局时间会让第 2 次攻击从第 3 帧开始播。
 */
export interface AnimClocks {
  /** 翻滚已进行(秒) */
  dashT?: number;
  /** 本次攻击段已进行(秒) */
  attackT?: number;
  /** 施法已进行(秒) */
  castT?: number;
  /** 受击已进行(秒) */
  hurtT?: number;
  /** 死亡已进行(秒) */
  dieT?: number;
}

/**
 * 本帧该用哪个时钟喂 `spriteFor`。
 * - 循环动作(待机/走路)用全局时间:切换时机与动作起点无关,取模后自然不会漂;
 * - 一次性动作用各自的已进行时间,并**夹在 [0, 总时长]** 内(动作结束后计时器可能被清零或为负)。
 */
export function clockFor(action: AnimAction, globalT: number, c: AnimClocks): number {
  const span = ANIM[action].frames / ANIM[action].fps;
  const clamp = (t: number | undefined): number => Math.max(0, Math.min(span, t ?? 0));
  switch (action) {
    case 'dash': return clamp(c.dashT);
    case 'atk': return clamp(c.attackT);
    case 'cast': return clamp(c.castT);
    case 'hurt': return clamp(c.hurtT);
    case 'die': return clamp(c.dieT);
    default: return globalT;
  }
}

export interface ActorState {
  /** 已死亡(播放死亡序列,不循环) */
  dead?: boolean;
  dashing?: boolean;
  attacking?: boolean;
  casting?: boolean;
  hurt?: boolean;
  moving?: boolean;
}

/** 由状态推动作(纯函数) */
export function actionOf(s: ActorState): AnimAction {
  if (s.dead) return 'die';
  if (s.dashing) return 'dash';
  if (s.attacking) return 'atk';
  if (s.casting) return 'cast';
  if (s.hurt) return 'hurt';
  if (s.moving) return 'walk';
  return 'idle';
}

/** 序列帧名:`knight_walk_1`(1 起,和美术管线一致) */
export function frameName(base: string, action: AnimAction, i: number): string {
  return `${base}_${action}_${i}`;
}

/**
 * 本帧该画的精灵名。
 *
 * @param t  动作开始以来的秒数(循环动作可直接传全局时间,结果只依赖取模)
 * @param has 资源存在判定(通常是 `sprites.get(name) !== null`)
 */
export function spriteFor(
  base: string,
  action: AnimAction,
  t: number,
  has: (name: string) => boolean,
): string {
  const spec = ANIM[action];
  const seq = frameList(base, action, has);
  if (seq.length > 0) {
    const idx = frameIndex(t, spec.fps, seq.length, spec.loop);
    return seq[idx];
  }
  // 没有这套序列 → 降级:走路退两帧资产(若有),其余退站立单帧
  if ((action === 'walk' || action === 'idle') && has(`${base}_walk`)) {
    const idx = frameIndex(t, spec.fps, 2, true);
    return idx === 1 ? `${base}_walk` : base;
  }
  return base;
}

/** 该动作已存在的帧名清单(按序号升序;序号必须从 1 连续,断号即截断 —— 断号说明管线出了半成品) */
export function frameList(
  base: string,
  action: AnimAction,
  has: (name: string) => boolean,
): string[] {
  const spec = ANIM[action];
  const out: string[] = [];
  for (let i = 1; i <= spec.frames; i++) {
    const n = frameName(base, action, i);
    if (!has(n)) break;
    out.push(n);
  }
  return out;
}

/**
 * 帧号(纯函数)。
 * - 循环:按总时长取模,所以传全局时间也不会漂(帧率与时间基准不同步时尤其重要);
 * - 一次性:过了就停在最后一帧(不会循环回第 1 帧 —— 攻击动作自己转圈最难看)。
 */
export function frameIndex(t: number, fps: number, frames: number, loop: boolean): number {
  if (frames <= 1) return 0;
  const step = Math.max(0, Math.floor(t * fps));
  if (loop) return ((step % frames) + frames) % frames; // 负时间也安全
  return Math.min(frames - 1, step);
}

/**
 * 走路时的上下起伏(px):帧数不够时靠程序补间撑观感。
 * 频率**推导**自走路序列(每步一次起伏),不另设旋钮 —— 两个旋钮迟早会互相打架。
 */
export function bobPx(t: number, moving: boolean): number {
  if (!moving || ANIM.walk.frames <= 0) return 0;
  const stepsPerS = ANIM.walk.fps / ANIM.walk.frames;
  return Math.sin(t * Math.PI * 2 * stepsPerS) * A.bobAmplitudePx;
}
