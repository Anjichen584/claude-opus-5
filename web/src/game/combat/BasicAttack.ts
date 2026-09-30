import { t } from '@game/i18n';
import { M } from '@game/constants';
import type { Klass } from '@game/meta/Leaderboard';
import { TOUCH } from '@game/input/AimAssist';

/**
 * 四职业**普攻档案**(docs/03-NUMBERS.md §12)。
 *
 * 设计原则:职业差异必须落在**可测的行为**上,而不是只改数值 ——
 *   剑士 = 三段连斩(快、第三段击退 + 前冲 0.6m)
 *   猎手 = 连射(走射不减速、每第 4 发强化并**穿透 1 个目标**)
 *   秘术师 = 法球(弹速慢、**命中溅射 0.9m**、施法期间减速 55%)
 *   守卫 = 重击(攻速慢、第三段 ×2.0 并**破甲 2s**、前冲只有 0.25m —— 重甲位移小是设计)
 *
 * 本模块是**纯函数 + 纯数据**:不碰 World、不碰事件,所以能手测、能 parity、
 * 能被 PlayerSystem 与 Unity 镜像同时消费。
 */

export interface ComboBasic {
  kind: 'combo';
  /** 每段时长(s),长度 = 段数 */
  attackTimeS: number[];
  /** 每段伤害倍率 */
  mults: number[];
  rangeM: number;
  arcDeg: number;
  /** 连招窗口(s):超时回到第一段 */
  windowS: number;
  /** 第 3 段击退(m) */
  knockback3M: number;
  /** 出招期间移动倍率 */
  moveSlow: number;
  /** 第 3 段前冲距离(m) */
  lunge3M: number;
  /** 第 3 段命中施加“破甲”(s),0 = 不施加 */
  vuln3S: number;
}

export interface ShotBasic {
  kind: 'shot';
  rateS: number;
  mult: number;
  speedM: number;
  radiusM: number;
  lifeS: number;
  /** 每 N 发强化一次 */
  heavyEvery: number;
  heavyMult: number;
  /** 强化发穿透的额外目标数 */
  pierce: number;
  /** 命中溅射半径(m),0 = 单体 */
  splashM: number;
  /** 出招期间移动倍率(走射 = 1,施法 = 0.55) */
  moveSlowPct: number;
  shape: 'orb' | 'arrow';
}

export type BasicSpec = ComboBasic | ShotBasic;

/** balance.json 里读普攻档案的最小结构(避免把整个 balance 的类型拖进来) */
interface ClassTable {
  classes: Record<string, { combo?: RawCombo; bow?: RawBow }>;
  player: { combo: RawCombo };
}

interface RawCombo {
  attackTime: number[];
  mults: number[];
  range: number;
  arcDeg: number;
  window: number;
  knockback3: number;
  moveSlow: number;
  lungeM?: number;
  vulnOnHitS?: number;
}

interface RawBow {
  rateS: number;
  mult: number;
  speedM: number;
  radiusM: number;
  lifeS: number;
  heavyEvery: number;
  heavyMult: number;
  pierce?: number;
  splashM?: number;
  moveSlowPct?: number;
}

/** 职业 → 普攻形态:近战两职业走组合技,远程两职业走射击 */
export const KLASS_KIND: Record<Klass, 'combo' | 'shot'> = {
  blade: 'combo',
  warden: 'combo',
  ranger: 'shot',
  arcanist: 'shot',
};

export const KLASS_SKIN: Record<Klass, 'arrow' | 'orb'> = {
  blade: 'orb',
  warden: 'orb',
  ranger: 'arrow',
  arcanist: 'orb',
};

/**
 * 从 balance 派生某职业的普攻档案。
 * 近战职业缺 «classes.<k>.combo» 时回退 «player.combo»(守卫线/旧档都不会炸);
 * 远程职业缺 «bow» 直接报错 —— 那是配置事故,静默回退会让职业变成近战。
 */
export function basicSpec(klass: Klass, b: ClassTable): BasicSpec {
  const kind = KLASS_KIND[klass];
  if (kind === 'combo') {
    const raw = b.classes[klass]?.combo ?? b.player.combo;
    return {
      kind: 'combo',
      attackTimeS: [...raw.attackTime],
      mults: [...raw.mults],
      rangeM: raw.range,
      arcDeg: raw.arcDeg,
      windowS: raw.window,
      knockback3M: raw.knockback3,
      moveSlow: raw.moveSlow,
      lunge3M: raw.lungeM ?? 0,
      vuln3S: raw.vulnOnHitS ?? 0,
    };
  }
  const raw = b.classes[klass]?.bow;
  if (!raw) throw new Error(`${klass} is missing classes.${klass}.bow config`);
  return {
    kind: 'shot',
    rateS: raw.rateS,
    mult: raw.mult,
    speedM: raw.speedM,
    radiusM: raw.radiusM,
    lifeS: raw.lifeS,
    heavyEvery: raw.heavyEvery,
    heavyMult: raw.heavyMult,
    pierce: raw.pierce ?? 0,
    splashM: raw.splashM ?? 0,
    moveSlowPct: raw.moveSlowPct ?? 1,
    shape: KLASS_SKIN[klass],
  };
}

/** 连招推进:窗口内 +1,超时(或首击)回到 1,到顶后循环回 1 */
export function comboStage(prevStage: number, windowLeftS: number, stages: number): number {
  if (windowLeftS <= 0 || prevStage <= 0) return 1;
  return (prevStage % stages) + 1;
}

export interface ComboStep {
  stage: number;
  timeS: number;
  mult: number;
  rangePx: number;
  arcRad: number;
  knockbackM: number;
  lunge3M: number;
  vulnS: number;
  /** 出招期间的移动倍率(交给移动积分用) */
  moveSlow: number;
}

/** 解析一次近战普攻的出手参数(第 3 段才吃击退/前冲/破甲) */
export function comboStep(spec: ComboBasic, prevStage: number, windowLeftS: number): ComboStep {
  const stages = spec.mults.length;
  const stage = comboStage(prevStage, windowLeftS, stages);
  const idx = stage - 1;
  const third = stage === stages;
  return {
    stage,
    timeS: spec.attackTimeS[idx],
    mult: spec.mults[idx],
    rangePx: spec.rangeM * M,
    arcRad: (spec.arcDeg * Math.PI) / 180,
    knockbackM: third ? spec.knockback3M : 0,
    lunge3M: third ? spec.lunge3M : 0,
    vulnS: third ? spec.vuln3S : 0,
    moveSlow: spec.moveSlow,
  };
}

export interface ShotStep {
  stage: number;
  heavy: boolean;
  mult: number;
  radiusPx: number;
  pierce: number;
  splashM: number;
  timeS: number;
}

/** 解析一次射击的出手参数(第 heavyEvery 发强化) */
export function shotStep(spec: ShotBasic, prevStage: number): ShotStep {
  const stage = (prevStage % spec.heavyEvery) + 1;
  const heavy = stage === spec.heavyEvery;
  return {
    stage,
    heavy,
    mult: heavy ? spec.mult * spec.heavyMult : spec.mult,
    radiusPx: spec.radiusM * M * (heavy ? 1.6 : 1),
    pierce: heavy ? spec.pierce : 0,
    splashM: heavy ? spec.splashM : spec.splashM, // 溅射不区分强化(秘术师每一发都溅)
    timeS: spec.rateS,
  };
}

/**
 * 前冲冲量(m/s):距离在 «burstS» 内走完,之后由物理阻尼吃掉。
 * 返回 0 表示这一步不前冲(第 1/2 段)。
 */
export function lungeImpulse(step: ComboStep, burstS = 0.12): number {
  if (step.lunge3M <= 0) return 0;
  return (step.lunge3M * M) / Math.max(0.02, burstS);
}

/** 出招期间的移动倍率(近战与远程口径统一,供移动积分调用) */
/**
 * 普攻的有效射程(px)。
 * - 近战组合技:直接用 «rangeM»;
 * - 远程射击:用 «speedM × lifeS» 的 **70%** —— 弹丸最后那段已经飞过目标,
 *   拿满距离当“该开火的距离”会让自动攻击在够不着的时候空挥。
 */
export function basicRangePx(spec: BasicSpec, pxPerM: number): number {
  if (spec.kind === 'combo') return spec.rangeM * pxPerM;
  return spec.speedM * spec.lifeS * pxPerM * TOUCH.shotReachFrac;
}

export function moveSlowOf(spec: BasicSpec): number {
  return spec.kind === 'combo' ? spec.moveSlow : spec.moveSlowPct;
}

/** 展示用:一句话描述该职业普攻(营地面板/图鉴用,避免 UI 里再写一份文案) */
export function describeBasic(spec: BasicSpec): string {
  if (spec.kind === 'combo') {
    const fin = spec.mults[spec.mults.length - 1];
    const bits = [t('basic.combo', { n: spec.attackTimeS.length }), t('basic.finisher', { mult: fin })];
    if (spec.knockback3M > 0) bits.push(t('basic.knockback', { m: spec.knockback3M }));
    if (spec.vuln3S > 0) bits.push(t('basic.vuln', { s: spec.vuln3S }));
    if (spec.lunge3M > 0) bits.push(t('basic.lunge', { m: spec.lunge3M }));
    return bits.join(' · ');
  }
  return [
    t('basic.rate', { s: spec.rateS }),
    t('basic.heavy', { every: spec.heavyEvery, mult: spec.heavyMult }),
    spec.pierce > 0 ? t('basic.pierce', { n: spec.pierce }) : '',
    spec.splashM > 0 ? t('basic.splash', { m: spec.splashM }) : '',
    spec.moveSlowPct >= 1 ? t('basic.moveShoot') : t('basic.castSlow', { pct: Math.round(spec.moveSlowPct * 100) }),
  ]
    .filter(Boolean)
    .join(' · ');
}
