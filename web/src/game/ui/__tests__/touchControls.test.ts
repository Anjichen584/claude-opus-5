import { describe, expect, it } from 'vitest';
import balance from '@data/balance.json';
import { TOUCH } from '@game/input/AimAssist';
import { BTN_ACTION, BTN_SKILL, TouchControls, applyTouchTuning, layoutOf } from '@game/ui/TouchControls';
import { ACTIONS, bindOf, resetBinds } from '@game/meta/Bindings';
import { meta } from '@game/meta/Save';
import type { Input } from '@engine/input/Input';

const T = balance.touch;

describe('摇杆 · 绘制与判定同源', () => {
  it('applyTouchTuning 把 balance.touch 灌进引擎输入层(画多大圈 = 夹多大位移)', () => {
    const fake = { joyRadiusPx: 0, joyDeadPx: 0 };
    applyTouchTuning(fake);
    expect(fake.joyRadiusPx).toBe(TOUCH.joyRadiusPx);
    expect(fake.joyDeadPx).toBe(TOUCH.joyDeadPx);
  });

  it('摇杆死区小于半径(否则推满之前都不动,手感发死)', () => {
    expect(TOUCH.joyDeadPx).toBeLessThan(TOUCH.joyRadiusPx * 0.35);
  });
});
describe('触屏按钮契约', () => {
  it('每个可注入键的按钮都指向一个可改绑动作(改键后触屏跟着变)', () => {
    const ids = Object.keys(BTN_ACTION);
    const actions = new Set(ACTIONS.map((a) => a.id));
    for (const id of ids) {
      expect(actions, `${id} → ${BTN_ACTION[id]} 不是可改绑动作`).toContain(BTN_ACTION[id]);
    }
    expect(ids).toContain('atk');
    expect(ids).toContain('interact');
  });

  it('技能按钮 id 与冷却槽一一对应(Q/E/R 三键)', () => {
    expect(Object.keys(BTN_SKILL).sort()).toEqual(['e', 'q', 'rr']);
    expect(new Set(Object.values(BTN_SKILL)).size).toBe(3);
  });

  it('按钮的命中区(半径 + 触摸余量 + 安全边距)必须整体在屏内', () => {
    const need = TOUCH.btnTouchPadPx + TOUCH.safeMarginPx;
    for (const [w, h] of [[1350, 620], [844, 390], [1920, 1080], [640, 360]] as Array<[number, number]>) {
      for (const b of layoutOf(w, h)) {
        expect(b.x - b.r - need, `${w}x${h} ${b.id} 左边越界`).toBeGreaterThanOrEqual(-0.01);
        expect(b.x + b.r + need, `${w}x${h} ${b.id} 右边越界`).toBeLessThanOrEqual(w + 0.01);
        expect(b.y - b.r - need, `${w}x${h} ${b.id} 上边越界`).toBeGreaterThanOrEqual(-0.01);
        expect(b.y + b.r + need, `${w}x${h} ${b.id} 下边越界`).toBeLessThanOrEqual(h + 0.01);
      }
    }
  });

  /**
   * 不压 HUD。
   * 这一条是**真的踩到过**:布局只按"离右下角多远"算位置时,1350×620 上背包键
   * 的圆心跑到 y=0.58h 反而**往中间顶**,正好压在底部技能条上沿。
   * HUD 四块(见 GameScene.renderHud):左上名牌血条 / 顶部房间进度 / 左下翻滚 / 底部中间 QER 技能条。
   */
  it('按钮不许盖住 HUD 四块(血条、房间进度、翻滚、QER 技能条)', () => {
    const slotW = 64;
    const gap = 10;
    const barW = slotW * 3 + gap * 2; // 180
    for (const [w, h] of [[1350, 620], [844, 390], [640, 360], [1920, 1080]] as Array<[number, number]>) {
      const hud = [
        { name: '左上名牌血条', x: 14, y: 14, w: 250, h: 58 },
        { name: '顶部房间进度', x: w / 2 - 150, y: 14, w: 300, h: 26 },
        { name: '左下翻滚', x: 14, y: h - 64, w: 130, h: 50 },
        { name: '底部 QER 技能条', x: w / 2 - barW / 2, y: h - 56 - 34, w: barW, h: 56 },
      ];
      for (const b of layoutOf(w, h)) {
        for (const zone of hud) {
          const overlap = b.x + b.r > zone.x && b.x - b.r < zone.x + zone.w
            && b.y + b.r > zone.y && b.y - b.r < zone.y + zone.h;
          expect(overlap, `${w}x${h}: ${b.id} 压住了「${zone.name}」`).toBe(false);
        }
      }
    }
  });

  it('按钮不互相压住(压住 = 点不到,尤其普攻与翻滚)', () => {
    for (const [w, h] of [[1350, 620], [844, 390], [1920, 1080]] as Array<[number, number]>) {
      const laid = layoutOf(w, h);
      for (let i = 0; i < laid.length; i++) {
        for (let j = i + 1; j < laid.length; j++) {
          const a = laid[i];
          const c = laid[j];
          const d = Math.hypot(a.x - c.x, a.y - c.y);
          // 允许圆心距小于半径和(视觉上可以挨着),但手指命中区(半径 + 一点余量)不能完全重叠
          expect(d, `${w}x${h}:${a.id} 与 ${c.id} 叠在一起`).toBeGreaterThan(Math.min(a.r, c.r) * 0.9);
        }
      }
    }
  });

  it('小屏按钮不能缩到点不中(夹在 0.72 倍以上)', () => {
    const small = layoutOf(640, 360);
    const big = layoutOf(1920, 1080);
    const atkSmall = small.find((b) => b.id === 'atk')!;
    const atkBig = big.find((b) => b.id === 'atk')!;
    expect(atkSmall.r).toBeGreaterThanOrEqual(44 * 0.72 * T.btnScale - 0.01);
    expect(atkBig.r).toBeLessThanOrEqual(44 * 1.15 * T.btnScale + 0.01);
  });

  it('摇杆在左半屏、按钮簇在右半屏(两只手不打架)', () => {
    const laid = layoutOf(1350, 620);
    for (const b of laid) {
      expect(b.x, `${b.id} 跑到左半屏了`).toBeGreaterThan(1350 * 0.5);
    }
  });
});
describe('触屏按钮接线(注入的键 / 自动攻击 / 命中区)', () => {
  /** 最小假 Input:只实现 TouchControls 用到的那几个方法(引擎层不被测试依赖拖进来) */
  class FakeInput {
    touchActive = true;
    pressed: string[] = [];
    virtual = new Map<string, boolean>();
    claimed = new Map<number, string>();
    pts: Array<{ id: number; x: number; y: number; sx: number; sy: number; started: boolean; claimed: string | null }> = [];
    joy: { ax: number; ay: number; x: number; y: number } | null = null;

    touches() { return this.pts; }
    claimTouch(id: number, owner: string) {
      this.claimed.set(id, owner);
      const p = this.pts.find((q) => q.id === id);
      if (p) p.claimed = owner;
    }
    injectPress(code: string) { this.pressed.push(code); }
    setVirtualDown(code: string, down: boolean) {
      if (down) this.virtual.set(code, true);
      else this.virtual.delete(code);
    }
    joyVisual() { return this.joy; }
  }

  const mk = (): { touch: TouchControls; input: FakeInput } => {
    const input = new FakeInput();
    const touch = new TouchControls(input as unknown as Input);
    return { touch, input };
  };

  /** 在按钮上按下(坐标取布局后的真实圆心) */
  const press = (input: FakeInput, id: string, w = 1350, h = 620): void => {
    const b = layoutOf(w, h).find((x) => x.id === id)!;
    input.pts.push({ id: 1, x: b.x, y: b.y, sx: b.x, sy: b.y, started: true, claimed: null });
  };

  it('tap 类按钮:按下即注入该动作的**当前绑定键**(改键后触屏跟着变)', () => {
    const { touch, input } = mk();
    press(input, 'q');
    touch.update(1350, 620, { interact: false, night: false });
    expect(input.pressed).toHaveLength(1);
    expect(input.pressed[0]).toBe(bindOf('q'));
    // 冷却环/药剂数字不该影响注入
    expect(input.claimed.get(1)).toBe('q');

    // 玩家把 Q 改绑到别的键 → 触屏按钮必须跟着走(写死键码 = 改键在手机上失效)
    meta.data.settings.binds.q = 'KeyY';
    input.pressed = [];
    input.pts = [];
    press(input, 'q');
    touch.update(1350, 620, { interact: false, night: false });
    expect(input.pressed).toEqual(['KeyY']);
    resetBinds(); // 别把改键漏给别的测试
  });

  it('auto 开关:点一下切换并通知外部落盘(下次进游戏还是这个状态)', () => {
    const { touch, input } = mk();
    const before = touch.autoAttack;
    let told: boolean | null = null;
    touch.onAutoAttackToggle = (on) => { told = on; };
    press(input, 'auto');
    touch.update(1350, 620, { interact: false, night: false });
    expect(touch.autoAttack).toBe(!before);
    expect(told).toBe(!before);
  });

  it('自动攻击:开着 + 目标在射程内 → 等价按住普攻;目标出射程/关掉开关 → 松开', () => {
    const { touch, input } = mk();
    touch.autoAttack = true;
    touch.update(1350, 620, { interact: false, night: false, targetInRange: true });
    expect(input.virtual.get(bindOf('attack')), '射程内应自动开火').toBe(true);

    touch.update(1350, 620, { interact: false, night: false, targetInRange: false });
    expect(input.virtual.get(bindOf('attack')), '目标离开射程应停火').toBeUndefined();

    touch.autoAttack = false;
    touch.update(1350, 620, { interact: false, night: false, targetInRange: true });
    expect(input.virtual.get(bindOf('attack')), '关掉开关就不该自动开火').toBeUndefined();
  });

  it('普攻是唯一的 hold 钮:按住不放持续开火,抬手松开', () => {
    const { touch, input } = mk();
    touch.autoAttack = false;
    press(input, 'atk');
    touch.update(1350, 620, { interact: false, night: false });
    expect(input.virtual.get(bindOf('attack'))).toBe(true);
    input.pts = []; // 抬手
    touch.update(1350, 620, { interact: false, night: false });
    expect(input.virtual.get(bindOf('attack'))).toBeUndefined();
  });

  it('按钮外的落指不是按钮(留给摇杆):不注入、不认领', () => {
    const { touch, input } = mk();
    input.pts.push({ id: 2, x: 200, y: 300, sx: 200, sy: 300, started: true, claimed: null });
    touch.update(1350, 620, { interact: false, night: false });
    expect(input.pressed).toEqual([]);
    expect(input.claimed.size).toBe(0);
  });

  it('隐藏的按钮点不到(交互/提灯不在场时不该吃掉手指)', () => {
    const { touch, input } = mk();
    press(input, 'interact');
    touch.update(1350, 620, { interact: false, night: false });
    expect(input.pressed).toEqual([]);
    expect(input.claimed.size).toBe(0);
  });

  it('非触屏设备:不注入任何东西,并把虚拟键松开(防止上一局按住的状态残留)', () => {
    const { touch, input } = mk();
    input.setVirtualDown(bindOf('attack'), true);
    input.touchActive = false;
    touch.update(1350, 620, { interact: false, night: false, targetInRange: true });
    expect(input.virtual.get(bindOf('attack'))).toBeUndefined();
    expect(input.pressed).toEqual([]);
  });
});
