import { beforeEach, describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { AimAssist, dirTo, inAutoAttackRange, pickAim } from '@game/input/AimAssist';
import { basicRangePx, basicSpec } from '@game/combat/BasicAttack';

const M = 48;
const T = balance.touch;

describe('触屏参数(balance.touch)', () => {
  it('数值齐全且在合理区间(手感就是数值,别散在代码里)', () => {
    expect(T.aimRangeM).toBeGreaterThan(4);
    expect(T.aimRangeM).toBeLessThan(20);
    expect(T.aimStickyM).toBeGreaterThan(0);
    expect(T.aimStickyM, "粘性大到锁定范围一半就该重新想想(会一直锁着旧目标)").toBeLessThan(T.aimRangeM * 0.5);
    expect(T.aimLatchS).toBeGreaterThan(0);
    expect(T.joyRadiusPx).toBeGreaterThan(20);
    expect(T.joyDeadPx).toBeGreaterThan(0);
    expect(T.joyDeadPx).toBeLessThan(T.joyRadiusPx);
    expect(T.btnTouchPadPx).toBeGreaterThanOrEqual(0);
    expect(T.safeMarginPx).toBeGreaterThanOrEqual(8);
    expect(T.btnScale).toBeGreaterThan(0.5);
    expect(T.autoAttackPadM).toBeGreaterThan(0);
    expect(typeof T.autoAttack).toBe('boolean');
  });
});
describe('自动瞄准 · 选目标规则', () => {
  const px = 0;
  const py = 0;
  const far = { id: 1, x: 200, y: 0 };
  const near = { id: 2, x: 100, y: 0 };

  it('范围内选最近的;范围外一律不锁(屏幕外的敌人不该抢准星)', () => {
    expect(pickAim(px, py, [far, near], null, 150, 0)?.id).toBe(2);
    expect(pickAim(px, py, [far, near], null, 80, 0)).toBeNull();
    expect(pickAim(px, py, [], null, 500, 0)).toBeNull();
  });

  it('粘性:已锁目标不比最近候选远出 sticky 就继续锁(防等距敌人之间横跳)', () => {
    // 已锁 1 号(200px),2 号更近(100px)—— 差距 100 > sticky 50 → 换目标
    expect(pickAim(px, py, [far, near], 1, 500, 50)?.id).toBe(2);
    // sticky 提到 120:差距 100 < 120 → 继续锁 1 号(不横跳)
    expect(pickAim(px, py, [far, near], 1, 500, 120)?.id).toBe(1);
  });

  it('已锁目标跑出范围 → 不锁它,改锁范围内最近的', () => {
    const away = { id: 1, x: 900, y: 0 };
    expect(pickAim(px, py, [away, near], 1, 500, 200)?.id).toBe(2);
  });

  it('锁定的目标死了(不在列表里)→ 正常换目标,不返回幽灵', () => {
    expect(pickAim(px, py, [near], 99, 500, 200)?.id).toBe(2);
  });

  it('方向向量:零距离不产生 NaN', () => {
    const d = dirTo(10, 10, 10, 10);
    expect(Number.isFinite(d.x) && Number.isFinite(d.y)).toBe(true);
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
  });
});
describe('自动瞄准 · 记忆(续瞄)', () => {
  let aim: AimAssist;
  beforeEach(() => {
    aim = new AimAssist();
  });

  it('锁定后每帧给方向,并记录目标', () => {
    const d = aim.update(0, 0, [{ id: 7, x: 100, y: 0 }], 1 / 60, 11, 3, 0.5, M);
    expect(d?.x).toBeCloseTo(1, 6);
    expect(aim.target?.id).toBe(7);
    expect(aim.lockId).toBe(7);
  });

  it('目标消失 → 续瞄 latchS 秒(不甩枪),之后交还兜底', () => {
    aim.update(0, 0, [{ id: 7, x: 100, y: 0 }], 1 / 60, 11, 3, 0.5, M);
    // 目标没了:前 0.5 秒仍然朝原方向
    let d = aim.update(0, 0, [], 0.2, 11, 3, 0.5, M);
    expect(d, '续瞄期内应还给方向').not.toBeNull();
    expect(d!.x).toBeCloseTo(1, 6);
    d = aim.update(0, 0, [], 0.2, 11, 3, 0.5, M);
    expect(d, '续瞄还没用完').not.toBeNull();
    // 用完 → null(交还给"朝移动方向"的兜底)
    expect(aim.update(0, 0, [], 0.2, 11, 3, 0.5, M)).toBeNull();
    expect(aim.target).toBeNull();
  });

  it('目标一直在 → 记忆不会过期', () => {
    for (let i = 0; i < 120; i++) {
      const d = aim.update(0, 0, [{ id: 7, x: 100, y: 0 }], 1 / 60, 11, 3, 0.5, M);
      expect(d).not.toBeNull();
    }
    expect(aim.aiming).toBe(true);
  });

  it('reset 清干净(换房/复活/换槽必须清,否则会锁上一局的实体 id)', () => {
    aim.update(0, 0, [{ id: 7, x: 100, y: 0 }], 1 / 60, 11, 3, 0.5, M);
    aim.reset();
    expect(aim.lockId).toBeNull();
    expect(aim.target).toBeNull();
    expect(aim.latchT).toBe(0);
    expect(aim.aiming).toBe(false);
  });
});
describe('自动攻击判定', () => {
  it('射程内(含余量)开火,射程外不开', () => {
    expect(inAutoAttackRange(100, 120, 10)).toBe(true);
    expect(inAutoAttackRange(129, 120, 10)).toBe(true);
    expect(inAutoAttackRange(131, 120, 10)).toBe(false);
  });

  it('近战射程 = rangeM;远程 = 飞行距离 × shotReachFrac(最后那截空挥不算)', () => {
    const blade = basicSpec('blade', balance);
    expect(blade.kind).toBe('combo');
    if (blade.kind === 'combo') expect(basicRangePx(blade, M)).toBeCloseTo(blade.rangeM * M, 6);
    for (const klass of ['ranger', 'arcanist'] as const) {
      const shot = basicSpec(klass, balance);
      expect(shot.kind).toBe('shot');
      if (shot.kind === 'shot') {
        expect(basicRangePx(shot, M)).toBeCloseTo(shot.speedM * shot.lifeS * M * T.shotReachFrac, 6);
      }
    }
    // 比例本身要在合理区间:太小 = 打不到的也开火;接近 1 = 空挥
    expect(T.shotReachFrac).toBeGreaterThan(0.4);
    expect(T.shotReachFrac).toBeLessThan(0.9);
  });

  it('每个职业:普攻射程 + 余量都要落在锁定范围内(否则锁不到 → 自动攻击永远不开火)', () => {
    for (const klass of ['blade', 'ranger', 'arcanist', 'warden'] as const) {
      const reach = basicRangePx(basicSpec(klass, balance), M) + T.autoAttackPadM * M;
      expect(reach, `${klass}: 射程 ${reach.toFixed(0)}px 超出锁定范围 ${(T.aimRangeM * M).toFixed(0)}px`)
        .toBeLessThanOrEqual(T.aimRangeM * M);
    }
  });

  it('锁定范围还要大于"射程",但别大到把屏幕外的敌人都锁进来(手感区间)', () => {
    for (const klass of ['blade', 'ranger', 'arcanist', 'warden'] as const) {
      const reach = basicRangePx(basicSpec(klass, balance), M);
      expect(T.aimRangeM * M, klass).toBeGreaterThan(reach);
    }
    expect(T.aimRangeM).toBeLessThan(14);
  });
});
