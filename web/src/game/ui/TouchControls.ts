import type { Input } from '@engine/input/Input';
import { UI } from '@game/constants';

interface TouchBtn {
  id: string;
  /** 注入的键码 */
  code: string;
  label: string;
  sub?: string;
  r: number;
  /** 位置(相对右下角,每帧按屏幕尺寸计算) */
  x: number;
  y: number;
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
    { id: 'bag', code: 'Tab', label: '🎒', r: 20, x: 0, y: 0, mode: 'tap', visible: true, held: false },
    { id: 'pause', code: 'Escape', label: 'Ⅱ', r: 20, x: 0, y: 0, mode: 'tap', visible: true, held: false },
  ];

  constructor(private readonly input: Input) {}

  /** 每帧(run 状态)调用:布局 → 命中 → 注入 */
  update(w: number, h: number, opts: { interact: boolean; night: boolean }): void {
    if (!this.input.touchActive) {
      this.input.setVirtualDown('KeyJ', false);
      return;
    }
    this.layout(w, h);
    this.byId('interact').visible = opts.interact;
    this.byId('lantern').visible = opts.night;

    // 命中检测:touchstart 落点在按钮内 → 认领;hold 钮跟踪按住状态
    const touches = this.input.touches();
    for (const b of this.btns) b.held = false;
    for (const t of touches) {
      for (const b of this.btns) {
        if (!b.visible) continue;
        const overNow = Math.hypot(t.x - b.x, t.y - b.y) <= b.r + 12;
        const overStart = Math.hypot(t.sx - b.x, t.sy - b.y) <= b.r + 12;
        if (t.started && overStart) {
          this.input.claimTouch(t.id, b.id);
          if (b.mode === 'tap') this.input.injectPress(b.code);
        }
        if (t.claimed === b.id && overNow && b.mode === 'hold') b.held = true;
        if (t.claimed === b.id && b.mode === 'hold' && overNow) b.held = true;
      }
    }
    this.input.setVirtualDown('KeyJ', this.byId('atk').held);
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.input.touchActive) return;
    this.layout(w, h);
    ctx.save();

    // 浮动摇杆
    const joy = this.input.joyVisual();
    if (joy) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#dfe8f2';
      ctx.beginPath();
      ctx.arc(joy.ax, joy.ay, 52, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      const dx = joy.x - joy.ax;
      const dy = joy.y - joy.ay;
      const d = Math.hypot(dx, dy) || 1;
      const cl = Math.min(d, 52);
      ctx.beginPath();
      ctx.arc(joy.ax + (dx / d) * cl, joy.ay + (dy / d) * cl, 24, 0, Math.PI * 2);
      ctx.fill();
    }

    // 按钮
    for (const b of this.btns) {
      if (!b.visible) continue;
      ctx.globalAlpha = b.held ? 0.85 : 0.4;
      ctx.fillStyle = '#1a1f30';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = b.held ? 1 : 0.75;
      ctx.strokeStyle = b.id === 'interact' ? '#8fd4c8' : b.id === 'rr' ? UI.gold : '#5d6673';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = UI.text;
      ctx.font = `bold ${Math.round(b.r * 0.7)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.label, b.x, b.y - (b.sub ? 4 : 0));
      if (b.sub) {
        ctx.font = '9px monospace';
        ctx.fillStyle = UI.dim;
        ctx.fillText(b.sub, b.x, b.y + b.r * 0.45);
      }
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }

  private layout(w: number, h: number): void {
    const set = (id: string, x: number, y: number): void => {
      const b = this.byId(id);
      b.x = x;
      b.y = y;
    };
    set('atk', w - 84, h - 96);
    set('dash', w - 186, h - 66);
    set('q', w - 196, h - 148);
    set('e', w - 140, h - 196);
    set('rr', w - 70, h - 208);
    set('potion', w - 258, h - 108);
    set('interact', w - 130, h - 280);
    set('lantern', w - 262, h - 172);
    set('bag', w - 34, h * 0.42);
    set('pause', w - 34, h * 0.30);
  }

  private byId(id: string): TouchBtn {
    return this.btns.find((b) => b.id === id)!;
  }
}
