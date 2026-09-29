/**
 * 触屏瞄准辅助(纯函数 + 一个有记忆的包装类)。
 *
 * 为什么单独抽出来:自动瞄准的手感全在"锁定与换目标的规则"里 ——
 * 一版是"永远选最近的敌人",实战里两个敌人在近似等距时准星会**每帧横跳**,
 * 打起来像在抖枪。抽成纯函数之后,规则能用单测钉住(而且 Unity 侧可以照抄同一套规则)。
 *
 * 三条规则:
 * 1. **范围**:`aimRangeM` 之外不锁(屏幕外的敌人不该抢你的准星);
 * 2. **粘性**:已锁目标比别人近的距离只差 `aimStickyM` 以内 → **继续锁它**(不横跳);
 * 3. **续瞄**:目标死了/出范围后,朝最后的方向继续瞄 `aimLatchS` 秒(不甩枪回移动方向)。
 */
import balance from '@data/balance.json';

const T = balance.touch;

export interface AimTarget {
  id: number;
  x: number;
  y: number;
}

export interface AimPick {
  id: number;
  x: number;
  y: number;
  /** 与玩家的距离(px) */
  d: number;
}

/**
 * 选目标(纯函数)。
 * @param rangePx  锁定范围(px)
 * @param stickyPx 粘性余量(px):已锁目标比更近的候选只远这么多以内 → 继续锁
 * @param lockId   当前锁定的实体 id(null = 没锁)
 */
export function pickAim(
  px: number, py: number,
  targets: Iterable<AimTarget>,
  lockId: number | null,
  rangePx: number,
  stickyPx: number,
): AimPick | null {
  let best: AimPick | null = null;
  let locked: AimPick | null = null;
  for (const t of targets) {
    const d = Math.hypot(t.x - px, t.y - py);
    if (d > rangePx) continue;
    if (!best || d < best.d) best = { id: t.id, x: t.x, y: t.y, d };
    if (lockId !== null && t.id === lockId) locked = { id: t.id, x: t.x, y: t.y, d };
  }
  if (!best) return null;
  // 粘性:只要已锁目标不比最近的远出 stickyPx,就继续锁它(避免等距敌人之间横跳)
  if (locked && locked.d <= best.d + stickyPx) return locked;
  return best;
}

/** 方向向量(单位向量);零距离返回 (1,0),避免 NaN */
export function dirTo(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** 自动攻击判定(纯函数):目标在"攻击距离 + 余量"内就该开火 */
export function inAutoAttackRange(distPx: number, attackRangePx: number, padPx: number): boolean {
  return distPx <= attackRangePx + padPx;
}

/**
 * 有记忆的瞄准助手:持有锁定目标与"续瞄"计时。
 * GameScene 每帧调 `update()`,返回本帧应当瞄准的方向(px 单位向量),null = 交给调用方兜底。
 */
export class AimAssist {
  /** 当前锁定的实体 id */
  lockId: number | null = null;
  /** 续瞄剩余时间(目标丢失后继续朝原方向瞄) */
  latchT = 0;
  private lastX = 1;
  private lastY = 0;

  /** 供 HUD/自动攻击读:本帧锁定的目标(含距离) */
  target: AimPick | null = null;

  get aiming(): boolean {
    return this.target !== null || this.latchT > 0;
  }

  /**
   * @param dt 帧时长(用于续瞄计时)
   * @param rangeM 覆盖 balance 的锁定范围(测试用)
   */
  update(
    px: number, py: number,
    targets: Iterable<AimTarget>,
    dt: number,
    rangeM: number = T.aimRangeM,
    stickyM: number = T.aimStickyM,
    latchS: number = T.aimLatchS,
    pxPerM = 48,
  ): { x: number; y: number } | null {
    const pick = pickAim(px, py, targets, this.lockId, rangeM * pxPerM, stickyM * pxPerM);
    this.target = pick;
    if (pick) {
      this.lockId = pick.id;
      this.latchT = latchS;
      const dir = dirTo(px, py, pick.x, pick.y);
      this.lastX = dir.x;
      this.lastY = dir.y;
      return dir;
    }
    // 目标丢失:先续瞄一会儿,再交还给调用方(避免准星瞬间甩走)
    this.lockId = null;
    // 先扣再判:latchS 秒到了就交还,不会因为帧长多续一帧
    this.latchT -= dt;
    if (this.latchT > 0) return { x: this.lastX, y: this.lastY };
    this.latchT = 0;
    return null;
  }

  /** 清空记忆(换房/复活/换槽都要清:否则会锁上一局的实体 id) */
  reset(): void {
    this.lockId = null;
    this.latchT = 0;
    this.target = null;
  }
}

/** 触屏参数只读出口(测试与 UI 共用;改数值去 balance.json) */
export const TOUCH = T;
