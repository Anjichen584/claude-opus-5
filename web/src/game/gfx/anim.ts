/**
 * 角色动作序列(docs/04-ART-PIPELINE.md §3、10-FULL-PLAN M3 动画批次)。
 *
 * 这一层的全部职责:**给定“角色在干嘛”和“过了多久”,说是哪张图**。
 * 之所以抽成纯函数,是因为这里出错的后果都很隐蔽 ——
 * 帧号越界(黑块/白块)、一次性动作循环播放(攻击动作自己转圈)、
 * 缺一整套序列时静默变样(和双帧那次“一大一小”一样,只有玩家看得出来)。
 *
 * 回退链(**永远是“降级”而不是“消失”**):
 *   «{base}_{action}_{i}»  ← 完整序列(≥1 帧,数据驱动帧数)
 *   «{base}_walk»          ← 历史两帧资产(只做走路)
 *   «{base}»               ← 站立单帧(一定有)
 * 判定“有没有”由调用方传 «has(name)»,所以这个模块不碰资源加载,可纯函数单测。
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
 * 每个“一次性动作”都吃**自己开始了多久**:用全局时间会让第 2 次攻击从第 3 帧开始播。
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
 * “剩余时间 → 已进行时间”(动作时钟的唯一换算口径)。
 * 计时器给的是**剩余**(«dashT/attackT/...» 都是倒数),动画要的是**已进行**;
 * 剩余 ≤ 0 表示“这个动作没在进行” → 返回 undefined,由 clockFor 归 0。
 */
export function elapsed(remaining: number | undefined, total: number | undefined): number | undefined {
  if (remaining === undefined || total === undefined) return undefined;
  if (remaining <= 0) return undefined;
  return total - remaining;
}

/** 各动作的计时器输入(字段名与组件一致,便于调用点一眼对上) */
export interface ClockInputs {
  dashT?: number; dashDur?: number;
  attackT?: number; attackDur?: number;
  hurtT?: number; hurtDur?: number;
  respawnT?: number; respawnDur?: number;
}

/**
 * 组件字段 → 动作时钟。
 * 抽成纯函数的原因:**漏传一个字段的后果是“某个动作永远停在第一帧”** ——
 * 这类 bug 在画面上看就是“拉弓僵住”,很容易被当成美术问题去查(本轮真踩了:漏传 cast)。
 * 现在漏字段会被单测抓住。
 *
 * 注:远程职业的普攻就是 «cast»(见 GameScene 的动作判定),所以 cast 用**普攻的计时器**。
 */
export function clocksOf(c: ClockInputs): AnimClocks {
  return {
    dashT: elapsed(c.dashT, c.dashDur),
    attackT: elapsed(c.attackT, c.attackDur),
    castT: elapsed(c.attackT, c.attackDur),
    hurtT: elapsed(c.hurtT, c.hurtDur),
    dieT: elapsed(c.respawnT, c.respawnDur),
  };
}

/**
 * 本帧该用哪个时钟喂 «spriteFor»。
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
  /** 正在普攻(具体播哪个动作由 «attackAction()» 决定) */
  attacking?: boolean;
  /** 正在吟唱(敌人读条等) */
  casting?: boolean;
  hurt?: boolean;
  moving?: boolean;
}

/**
 * 普攻该播哪个动作:**远程职业走 «cast»**。
 *
 * 这是**代码口径**不是美术口径 —— 挥剑与拉弓本来就是两套姿态,所以猎手/秘术师的
 * «cast» 序列就是它们的普攻序列(美术管线那边也是按这个排的批)。
 * 抽成函数是因为这条规则以前散在调用点里写成 «attacking && !shotKlass» / «casting && shotKlass»
 * 一对双重否定,谁改谁错,而且漏一处就会「打起来了还在跑」。
 */
export function attackAction(isShot: boolean): AnimAction {
  return isShot ? 'cast' : 'atk';
}

/**
 * 由状态推动作(纯函数)。
 * @param attack 普攻形态(见 «attackAction()»);默认近战 «atk»。敌人吟唱走 «casting» 这条路。
 */
export function actionOf(s: ActorState, attack: AnimAction = 'atk'): AnimAction {
  if (s.dead) return 'die';
  if (s.dashing) return 'dash';
  if (s.attacking) return attack;
  if (s.casting) return 'cast';
  if (s.hurt) return 'hurt';
  if (s.moving) return 'walk';
  return 'idle';
}

/** 序列帧名:«knight_walk_1»(1 起,和美术管线一致) */
export function frameName(base: string, action: AnimAction, i: number): string {
  return `${base}_${action}_${i}`;
}

/**
 * 本帧该画的精灵名。
 *
 * @param t  动作开始以来的秒数(循环动作可直接传全局时间,结果只依赖取模)
 * @param has 资源存在判定(通常是 «sprites.get(name) !== null»)
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

/** 走路一圈的时长(秒)= 帧数 / 帧率。**唯一的走路节奏来源** —— 别在别处再写一个常数。 */
export function cycleSec(action: AnimAction = 'walk'): number {
  const s = ANIM[action];
  return s.fps > 0 ? s.frames / s.fps : 0;
}

/**
 * 两帧资产的命名后缀。杂兵/中Boss 早期只有两张图(«{base}» + «{base}_f2»),
 * 和玩家/精英的 «{base}_{action}_{i}» 序列**并存**:序列齐全时走序列,
 * 只有两帧的走这条。两套命名不是历史遗留不清理 —— 图鉴里 22 只怪都是 «_f2»,重命名收益为零、风险不小。
 */
export const TWO_FRAME_SUFFIX = '_f2';

/**
 * 两帧资产这一帧要不要翻到 «_f2»(纯函数)。
 *
 * 交替速度**推导**自走路规格:走路一圈 = 4 帧 = 两个步幅,所以两帧资产正好**每半圈翻一次**。
 * 之前这里在 «GameScene.frame2» 里手写着 «floor(t * 8) % 2»,和 «balance.anim.walk» 是两个独立的数 ——
 * 改帧率时玩家的走路会变、杂兵不会(而且当时快了一倍:8 次/秒 vs 2 圈/秒)。现在只有一个来源。
 */
export function twoFrameFlip(t: number, moving = true): boolean {
  if (!moving) return false;
  const cycle = cycleSec('walk');
  if (cycle <= 0) return false;
  return frameIndex(t, 2 / cycle, 2, true) === 1;
}

/**
 * 杂兵两帧走路这帧该画哪个名字:**没有 «_f2» 资产就退回站立单帧**(降级而非消失)。
 * «moving=false»(站着不动/被定身)时也退回单帧:原地抖腿看着像卡了。
 */
export function twoFrame(
  base: string,
  t: number,
  has: (name: string) => boolean,
  moving = true,
): string {
  const flip = `${base}${TWO_FRAME_SUFFIX}`;
  if (!has(flip)) return base;
  return twoFrameFlip(t, moving) ? flip : base;
}
