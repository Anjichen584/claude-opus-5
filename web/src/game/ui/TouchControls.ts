import type { Input } from '@engine/input/Input';
import { UI } from '@game/constants';
import { bindOf } from '@game/meta/Bindings';
import { TOUCH } from '@game/input/AimAssist';

/** 触屏按钮 id → 绑定动作(pause 例外,固定 Escape) */
export const BTN_ACTION: Record<string, string> = {
  atk: 'attack', dash: 'dash', q: 'q', e: 'e', rr: 'r',
  potion: 'potion', interact: 'interact', lantern: 'lantern', bag: 'bag',
};

/** 按钮 id → 它对应的技能冷却(用于按钮上画冷却环);非技能按钮没有 */
export const BTN_SKILL: Record<string, 'cdQ' | 'cdE' | 'cdR'> = {
  q: 'cdQ', e: 'cdE', rr: 'cdR',
};

/** 布局基准(px):1350×620 参考屏上手工调好的相对位置,再按屏宽缩放 */
const BASE_W = 1350;
const BASE_H = 620;

/**
 * 把 `balance.touch` 的摇杆参数灌进引擎输入层。
 *
 * 为什么要显式做这一步:`TouchControls` 画摇杆圈用的是 TOUCH.joyRadiusPx,
 * 而真正夹住摇杆位移的是 Input —— 两处数值一旦漂移,摇杆"手上推到头了但角色还在走"
 * (或者反过来),这种 bug 眼睛很难发现。这里把"绘制方"和"判定方"绑成同一份数据。
 */
export function applyTouchTuning(input: Pick<Input, 'joyRadiusPx' | 'joyDeadPx'>): void {
  input.joyRadiusPx = TOUCH.joyRadiusPx;
  input.joyDeadPx = TOUCH.joyDeadPx;
}

export interface TouchBtnLayout {
  id: string;
  x: number;
  y: number;
  r: number;
}

/** 基准半径(px):布局的"大小"部分,位置部分见 layoutOf */
const BASE_R: Record<string, number> = {
  atk: 44, dash: 30, q: 27, e: 27, rr: 27, potion: 22,
  interact: 30, lantern: 22, auto: 22, bag: 20, pause: 20,
};

/** 基准相对位置(dx, dy 都相对右下角;dy 用像素或屏高比例) */
const BASE_POS: Array<{ id: string; dx: number; dy: number; dyIsRatio?: boolean }> = [
  { id: 'atk', dx: -84, dy: -96 },
  { id: 'dash', dx: -186, dy: -66 },
  { id: 'q', dx: -196, dy: -148 },
  { id: 'e', dx: -140, dy: -196 },
  { id: 'rr', dx: -70, dy: -208 },
  { id: 'potion', dx: -258, dy: -108 },
  { id: 'interact', dx: -130, dy: -280 },
  { id: 'lantern', dx: -262, dy: -172 },
  { id: 'auto', dx: -322, dy: -214 },
  { id: 'bag', dx: -34, dy: -0.58, dyIsRatio: true },
  { id: 'pause', dx: -34, dy: -0.70, dyIsRatio: true },
];

/**
 * 按屏幕尺寸算按钮布局(纯函数,可单测)。
 *
 * 规则:
 * - 以 1350×620 为基准比例缩放,并用 `btnScale` 做整体手感缩放;
 * - 缩放夹在 [0.72, 1.15]:太小的屏按钮不能缩到点不中,太大的屏也不能糊满屏幕;
 * - **按钮的"命中区"(半径 + 触摸余量)整体推进到屏内**:全面屏的圆角与手势条会吃掉贴边的触摸,
 *   所以夹的是 `r + pad + safeMarginPx`,不是"圆心离边要有多少" —— 一版只夹圆心,
 *   结果 640×360 上背包键的命中区还是探出了屏幕外几像素(测试量出来的)。
 */
export function layoutOf(w: number, h: number): TouchBtnLayout[] {
  const raw = Math.min(w / BASE_W, h / BASE_H);
  const k = Math.min(1.15, Math.max(0.72, raw)) * TOUCH.btnScale;
  const m = TOUCH.safeMarginPx + TOUCH.btnTouchPadPx;
  return BASE_POS.map((p) => {
    const r = (BASE_R[p.id] ?? 24) * k;
    const idealX = w + p.dx * k;
    const idealY = h + (p.dyIsRatio ? p.dy * h : p.dy * k);
    const lo = m + r;
    const x = Math.min(w - lo, Math.max(lo, idealX));
    const y = Math.min(h - lo, Math.max(lo, idealY));
    return { id: p.id, x, y, r };
  });
}

interface TouchBtn extends TouchBtnLayout {
  /** 注入的键码(每帧由绑定表解析) */
  code: string;
  label: string;
  sub?: string;
  /** hold=按住持续(普攻);tap=按下一次 */
  mode: 'hold' | 'tap';
  /** 是否显示(每帧外部可改) */
  visible: boolean;
  held: boolean;
}

/**
 * 触屏操作层:浮动摇杆(左半屏任意落指)+ 右下按钮簇。
 * 按钮通过 Input.injectPress / setVirtualDown 复用键盘语义,零侵入游戏逻辑。
 * 仅在 input.touchActive 时更新与渲染。
 *
 * 本轮的补全(10-FULL-PLAN 轮 7):
 * - **自动攻击**:开着时,锁定的敌人在普攻射程内就自动按住普攻(单手也能推图);按钮可关;
 * - **按钮状态**:Q/E/R 上有冷却环(冷暖一眼看出)、药剂显示剩余瓶数、技能未解锁时变暗;
 * - 摇杆半径/死区/命中余量/安全边距全部走 `balance.touch`(不再是散落的魔数),布局是纯函数可单测。
 */
export class TouchControls {
  private btns: TouchBtn[] = [
    { id: 'atk', code: 'KeyJ', label: '⚔', sub: '普攻', r: 44, x: 0, y: 0, mode: 'hold', visible: true, held: false },
    { id: 'dash', code: 'Space', label: '💨', sub: '翻滚', r: 30, x: 0, y: 0, mode: 'tap', visible: true, held: false },
    { id: 'q', code: 'KeyQ', label: 'Q', r: 27, x: 0, y: 0, mode: 'tap', visible: true, held: false },
    { id: 'e', code: 'KeyE', label: 'E', r: 27, x: 0, y: 0, mode: 'tap', visible: true, held: false },
    { id: 'rr', code: 'KeyR', label: 'R', r: 27, x: 0, y: 0, mode: 'tap', visible: true, held: false },
    { id: 'potion', code: 'Digit1', label: '❤', sub: '药', r: 22, x: 0, y: 0, mode: 'tap', visible: true, held: false },
    { id: 'interact', code: 'KeyF', label: 'F', sub: '交互', r: 30, x: 0, y: 0, mode: 'tap', visible: false, held: false },
    { id: 'lantern', code: 'KeyL', label: '🏮', r: 22, x: 0, y: 0, mode: 'tap', visible: false, held: false },
    { id: 'auto', code: '', label: '🔁', sub: '自动', r: 22, x: 0, y: 0, mode: 'tap', visible: true, held: false },
    { id: 'bag', code: 'Tab', label: '🎒', r: 20, x: 0, y: 0, mode: 'tap', visible: true, held: false },
    { id: 'pause', code: 'Escape', label: 'Ⅱ', r: 20, x: 0, y: 0, mode: 'tap', visible: true, held: false },
  ];

  /** 自动攻击开关(触屏):初值由 GameScene 从存档读入(老档兜底见 meta/migrations.ts) */
  autoAttack = TOUCH.autoAttack;
  /** 玩家在触屏 HUD 上切了开关 → 通知外部落盘(UI 不直接碰存档) */
  onAutoAttackToggle: ((on: boolean) => void) | null = null;
  /** 按钮状态(由 GameScene 每帧写入,用于按钮上的冷却/数量显示) */
  hud: {
    /** 技能按钮 id → 冷却进度(0 = 就绪) */
    skills: Record<string, { cd: number; max: number }>;
    potion: number;
    /** R 是否可用(怒气够 + 已解锁) */
    rReady: boolean;
  } = { skills: { q: { cd: 0, max: 1 }, e: { cd: 0, max: 1 }, rr: { cd: 0, max: 1 } }, potion: 0, rReady: false };

  constructor(private readonly input: Input) {
    applyTouchTuning(input);
  }

  /** 每帧(run 状态)调用:布局 → 命中 → 注入 */
  update(
    w: number,
    h: number,
    opts: { interact: boolean; night: boolean; targetInRange?: boolean },
  ): void {
    if (!this.input.touchActive) {
      this.input.setVirtualDown(this.byId('atk').code, false);
      return;
    }
    // 按钮键码跟随当前绑定(设置里改键后触屏同步)
    for (const b of this.btns) {
      const act = BTN_ACTION[b.id];
      if (act) b.code = bindOf(act);
    }
    this.layout(w, h);
    this.byId('interact').visible = opts.interact;
    this.byId('lantern').visible = opts.night;
    this.byId('auto').sub = this.autoAttack ? '自动开' : '自动关';

    // 命中检测:touchstart 落点在按钮内 → 认领;hold 钮跟踪按住状态
    const pad = TOUCH.btnTouchPadPx;
    const touches = this.input.touches();
    for (const b of this.btns) b.held = false;
    for (const t of touches) {
      for (const b of this.btns) {
        if (!b.visible) continue;
        const overNow = Math.hypot(t.x - b.x, t.y - b.y) <= b.r + pad;
        const overStart = Math.hypot(t.sx - b.x, t.sy - b.y) <= b.r + pad;
        if (t.started && overStart) {
          this.input.claimTouch(t.id, b.id);
          if (b.id === 'auto') {
            // 开关:点一下切换,并通知外部落盘(下次进游戏还是这个状态)
            this.autoAttack = !this.autoAttack;
            this.onAutoAttackToggle?.(this.autoAttack);
          }
          else if (b.mode === 'tap') this.input.injectPress(b.code);
        }
        if (t.claimed === b.id && overNow && b.mode === 'hold') b.held = true;
      }
    }
    // 自动攻击:开着 + 锁定目标在普攻射程内 → 等价于"按住普攻"
    const atk = this.byId('atk');
    const autoFire = this.autoAttack && this.autoAttackAllowed() && opts.targetInRange === true;
    this.input.setVirtualDown(atk.code, atk.held || autoFire);
    atk.sub = autoFire ? '自动' : this.autoAttack ? '普攻·自动' : '普攻';
  }

  /** 自动攻击是否被允许(调试/观战外的常规状态下都允许;留成钩子便于以后加"只在未受伤时自动") */
  private autoAttackAllowed(): boolean {
    return true;
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.input.touchActive) return;
    this.layout(w, h);
    ctx.save();

    // 浮动摇杆
    const joy = this.input.joyVisual();
    if (joy) {
      const R = TOUCH.joyRadiusPx;
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#dfe8f2';
      ctx.beginPath();
      ctx.arc(joy.ax, joy.ay, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      const dx = joy.x - joy.ax;
      const dy = joy.y - joy.ay;
      const d = Math.hypot(dx, dy) || 1;
      const cl = Math.min(d, R);
      ctx.beginPath();
      ctx.arc(joy.ax + (dx / d) * cl, joy.ay + (dy / d) * cl, R * 0.43, 0, Math.PI * 2);
      ctx.fill();
    }

    // 按钮
    for (const b of this.btns) {
      if (!b.visible) continue;
      const cd = this.cdOf(b.id);
      const ready = cd <= 0;
      ctx.globalAlpha = b.held ? 0.85 : 0.42;
      ctx.fillStyle = '#1a1f30';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      // 冷却环:按剩余比例画弧(暖色 = 快好了);红怒不足时 R 也走这条
      if (cd > 0) {
        const st = this.hud.skills[b.id];
        const frac = Math.max(0, Math.min(1, cd / Math.max(0.001, st?.max ?? 1)));
        ctx.globalAlpha = 0.8;
        ctx.strokeStyle = '#6a7390';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r - 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - frac));
        ctx.stroke();
      }
      ctx.globalAlpha = b.held ? 1 : 0.75;
      ctx.strokeStyle = b.id === 'interact' ? '#8fd4c8'
        : b.id === 'rr' ? (this.hud.rReady ? UI.gold : '#7a6a3a')
          : b.id === 'auto' && this.autoAttack ? '#5FD068'
            : ready ? '#5d6673' : '#434a5c';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = ready ? 1 : 0.45;
      ctx.fillStyle = UI.text;
      ctx.font = `bold ${Math.round(b.r * 0.7)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x, b.y - (b.sub ? 4 : 0));
      if (b.sub) {
        ctx.globalAlpha = 0.9;
        ctx.font = '9px monospace';
        ctx.fillStyle = UI.dim;
        ctx.fillText(b.sub, b.x, b.y + b.r * 0.45);
      }
      // 药剂:右上角显示剩余瓶数(没药变暗)
      if (b.id === 'potion') {
        ctx.globalAlpha = this.hud.potion > 0 ? 1 : 0.5;
        ctx.font = 'bold 11px monospace';
        ctx.fillStyle = this.hud.potion > 0 ? UI.text : UI.dim;
        ctx.fillText(String(this.hud.potion), b.x + b.r * 0.72, b.y - b.r * 0.72);
      }
      // Q/E/R 冷却秒数(数字比弧线好读)
      if (cd > 0 && (b.id === 'q' || b.id === 'e' || b.id === 'rr')) {
        ctx.globalAlpha = 1;
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#cfd6e6';
        ctx.fillText(cd.toFixed(1), b.x, b.y);
      }
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  /** 按钮 id → 剩余冷却秒 */
  private cdOf(id: string): number {
    return this.hud.skills[id]?.cd ?? 0;
  }

  /**
   * 应用布局。屏幕尺寸不变就不重算 —— `layoutOf` 会新建数组与对象,
   * 每帧重算在手机上就是白送的 GC 抖动(掉帧多半不是画得多,是分配得多)。
   */
  private layout(w: number, h: number): void {
    if (w === this.lastW && h === this.lastH) return;
    this.lastW = w;
    this.lastH = h;
    const laid = layoutOf(w, h);
    for (const l of laid) {
      const b = this.byId(l.id);
      b.x = l.x;
      b.y = l.y;
      b.r = l.r;
    }
  }

  private lastW = -1;
  private lastH = -1;

  private byId(id: string): TouchBtn {
    return this.btns.find((b) => b.id === id)!;
  }
}
