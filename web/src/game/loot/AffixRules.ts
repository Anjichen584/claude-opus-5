/**
 * 词条规则(2026-09-29,10-FULL-PLAN 轮 18:词条池 8 → 24)。
 *
 * 这一层只做一件事:**给定一件装备的词条 + 当前局面,算出它到底给多少属性**。
 * 之所以抽成纯函数:三类词条里有两类是“会变的”——
 * - **tradeoff(负面词条)**:加成与代价同时生效(狂血:+18% 攻击 / −8% 生命),
 *   两边必须**一起**进面板,只算加成就是纯加强,词条的取舍设计直接失效;
 * - **conditional(条件词条)**:只在特定局面生效(背水:生命 ≤35%;夜行:夜晚;
 *   弑君:Boss 在场;无瑕:满血;蓄势:站定不动)。条件翻转时要重算,否则面板与实战对不上。
 *
 * 条件翻转的判定收在 «condKeyOf»(一串位串):调用方比较字符串,变了才重算 ——
 * 每帧重算属性是能跑但没必要的开销,而“忘了重算”的表现是“背水永远不触发”。
 */
import affixPool from '@data/affixes/pool.json';

export type AffixKind = 'normal' | 'tradeoff' | 'conditional';
/** 条件 id(与 pool.json 的 “cond” 字段一一对应) */
export type CondId = 'lowHp' | 'night' | 'boss' | 'fullHp' | 'poised';

export interface AffixFace {
  stat: string;
  name: string;
  suffix: string;
  lo: [number, number];
  hi: [number, number];
}

export interface AffixDef extends AffixFace {
  id: string;
  slots: string[];
  kind?: AffixKind;
  cond?: CondId;
  /** 负面那一面(tradeoff 专用) */
  neg?: AffixFace;
}

export const AFFIX_DEFS = affixPool.affixes as AffixDef[];
export const affixDef = (id: string): AffixDef | undefined => AFFIX_DEFS.find((a) => a.id === id);

/** 词条 id → 定义(含负面/条件信息);Items.ts 生成词条时用它补全 */
export const affixKindOf = (def: AffixDef): AffixKind => def.kind ?? 'normal';

/** 条件词条判定所依赖的局面 —— 全部由调用方从世界读出(纯函数不碰 ECS) */
export interface AffixContext {
  /** 生命比例 0..1 */
  hpRatio: number;
  isNight: boolean;
  /** 场上是否有 Boss(章 Boss / 中 Boss) */
  bossNearby: boolean;
  /** 玩家是否在移动 */
  moving: boolean;
}

export const NEUTRAL_CTX: AffixContext = { hpRatio: 1, isNight: false, bossNearby: false, moving: true };

/** 背水阈值(与 pool.json 的语义一起写死在代码里:它是**判定**,不是可调数值) */
export const LOW_HP_RATIO = 0.35;
/** 无瑕的满血容差(战斗里血量是浮点,严格等于 max 会时有时无) */
export const FULL_HP_RATIO = 0.999;

/** 条件是否满足 */
export function condMet(cond: CondId, ctx: AffixContext): boolean {
  switch (cond) {
    case 'lowHp': return ctx.hpRatio <= LOW_HP_RATIO;
    case 'night': return ctx.isNight;
    case 'boss': return ctx.bossNearby;
    case 'fullHp': return ctx.hpRatio >= FULL_HP_RATIO;
    case 'poised': return !ctx.moving;
    default: return false;
  }
}

/** 局面指纹:只有它变了才需要重算属性(见文件头注释) */
export function condKeyOf(ctx: AffixContext): string {
  return [
    ctx.hpRatio <= LOW_HP_RATIO ? 'L' : '-',
    ctx.hpRatio >= FULL_HP_RATIO ? 'F' : '-',
    ctx.isNight ? 'N' : '-',
    ctx.bossNearby ? 'B' : '-',
    ctx.moving ? 'M' : '-',
  ].join('');
}

/** 一条词条在**当前局面**下生效的那一面(tradeoff 的负面永远生效;conditional 看条件) */
export interface EffectiveFace {
  stat: string;
  name: string;
  suffix: string;
  value: number;
  /** ‘plus’ = 加成面,‘minus’ = 代价面(tradeoff 的负面) */
  side: 'plus' | 'minus';
}

/**
 * 一件装备上所有**当前生效**的词条面(含负面)。
 * 条件不满足 → 加成面不出现(代价面照旧,这是 tradeoff 的设计:代价是常驻的)。
 */
export function effectiveFaces(
  rolls: Array<{ stat: string; name: string; value: number; suffix: string; neg?: { stat: string; name: string; value: number; suffix: string }; cond?: CondId }>,
  ctx: AffixContext,
): EffectiveFace[] {
  const out: EffectiveFace[] = [];
  for (const r of rolls) {
    if (r.cond && !condMet(r.cond, ctx)) {
      // 条件不满足:加成面失效,但代价面(tradeoff)照样算
      if (r.neg) out.push({ ...r.neg, side: 'minus' });
      continue;
    }
    out.push({ stat: r.stat, name: r.name, value: r.value, suffix: r.suffix, side: 'plus' });
    if (r.neg) out.push({ ...r.neg, side: 'minus' });
  }
  return out;
}

/**
 * 词条面的净收益(把同一条词条的加成与代价合起来;面板显示用)。
 * 「狂血」这种词条在面板上应当显示成两个数字,而不是一个净额 —— 但排序/估值时用净额。
 */
export function faceScore(faces: EffectiveFace[]): number {
  // 只做**同类相消**的粗估值(不同类型的词条不能直接相加:1% 暴击 ≠ 1% 生命)
  const byStat = new Map<string, number>();
  for (const f of faces) {
    const s = byStat.get(f.stat) ?? 0;
    byStat.set(f.stat, s + (f.side === 'plus' ? f.value : -f.value));
  }
  return [...byStat.values()].reduce((a, b) => a + b, 0);
}
