import { mapClient, viewW } from '@engine/core/Viewport';

/** 键鼠+手柄输入状态机。语义动作(移动/攻击/翻滚)在 game 层映射,这里只管原始状态。 */
/** 摇杆落点区:左半屏 60%(右 40% 留给按钮簇,TouchControls.layoutOf 保证按钮都在右半屏) */
const JOY_SCREEN_FRAC = 0.6;

export class Input {
  /**
   * 触屏摇杆的位移半径 / 死区(引擎默认值;game 层按 balance.touch 覆盖,
   * 见 TouchControls.applyTouchTuning —— 引擎不认识游戏数据,依赖只能单向)。
   */
  joyRadiusPx = 56;
  joyDeadPx = 8;

  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mousePressed = false;
  /** 右键按住 / 本帧按下(背包里重铸装备;见 ui/InventoryUI.ts) */
  mouseRight = false;
  mouseRightPressed = false;

  // ---- 手柄(标准映射)----
  /** 左摇杆(移动) */
  padLX = 0;
  padLY = 0;
  /** 右摇杆(瞄准) */
  padRX = 0;
  padRY = 0;
  /** 最近 2s 内手柄有输入(瞄准优先级判断) */
  padActive = false;
  private padActiveT = 0;
  private padPrev = new Set<string>();

  private static readonly PAD_BTN: Record<number, string> = {
    0: 'PadA', 1: 'PadB', 2: 'PadX', 3: 'PadY',
    4: 'PadLB', 5: 'PadRB', 6: 'PadLT', 7: 'PadRT',
    8: 'PadBack', 9: 'PadStart',
    12: 'PadUp', 13: 'PadDown', 14: 'PadLeft', 15: 'PadRight',
  };

  /**
   * 每帧开头轮询手柄,把按键映射成合成键码(PadA/PadX/...)进 down/pressed 集合。
   * 死区 0.22;任何输入刷新 padActive。
   */
  pollGamepad(dt: number): void {
    this.padActiveT -= dt;
    this.padActive = this.padActiveT > 0;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads.length > 0 ? pads[0] : null;
    // 清掉上一帧的手柄合成键
    for (const code of this.padPrev) this.down.delete(code);
    const cur = new Set<string>();
    this.padLX = 0; this.padLY = 0; this.padRX = 0; this.padRY = 0;
    if (gp) {
      const dz = (v: number): number => (Math.abs(v) < 0.22 ? 0 : v);
      this.padLX = dz(gp.axes[0] ?? 0);
      this.padLY = dz(gp.axes[1] ?? 0);
      this.padRX = dz(gp.axes[2] ?? 0);
      this.padRY = dz(gp.axes[3] ?? 0);
      gp.buttons.forEach((b, i) => {
        const code = Input.PAD_BTN[i];
        if (!code || !b.pressed) return;
        cur.add(code);
        this.down.add(code);
        if (!this.padPrev.has(code)) this.pressed.add(code);
      });
      if (cur.size > 0 || this.padLX !== 0 || this.padLY !== 0 || this.padRX !== 0 || this.padRY !== 0) {
        this.padActiveT = 2;
        this.padActive = true;
      }
    }
    this.padPrev = cur;
  }

  // ---- 手柄虚拟光标(轮 38):菜单/面板期开启;摇杆移光标,A = 点击 ----
  /** 宿主每帧设置:当前是否处于“该用光标”的 UI 态 */
  padCursorOn = false;
  padCX = 320;
  padCY = 180;
  /** 本帧是否由手柄光标合成了点击(渲染层画按下反馈用) */
  padClicked = false;

  /**
   * 推进手柄光标:摇杆(左右皆可)移动,PadA 合成点击(写进 mouseX/Y + mousePressed)。
   * 悬停也走 mouseX/Y —— 所有鼠标驱动的面板零改造获得手柄导航。
   */
  updatePadCursor(dt: number, viewW: number, viewH: number): void {
    this.padClicked = false;
    if (!this.padCursorOn || !this.padActive) return;
    const sx = this.padLX + this.padRX;
    const sy = this.padLY + this.padRY;
    const speed = 560; // px/s(逻辑分辨率)
    this.padCX = Math.min(viewW - 2, Math.max(2, this.padCX + sx * speed * dt));
    this.padCY = Math.min(viewH - 2, Math.max(2, this.padCY + sy * speed * dt));
    if (sx !== 0 || sy !== 0) {
      this.mouseX = this.padCX;
      this.mouseY = this.padCY;
    }
    if (this.pressed.has('PadA')) {
      this.mouseX = this.padCX;
      this.mouseY = this.padCY;
      this.mousePressed = true;
      this.padClicked = true;
    }
  }

  // ---- 触屏 ----
  /** 最近 3s 内有触摸(切换触屏 UI/自动瞄准) */
  touchActive = false;
  private touchActiveT = 0;
  /** 活跃触点:id → 当前/起始位置 */
  private touchPts = new Map<number, { x: number; y: number; sx: number; sy: number; claimed: string | null }>();
  /** 本帧新落下的触点 id */
  private touchStarted: number[] = [];
  /** 虚拟按住键(触屏按钮注入,每帧由 TouchControls 重设) */
  private virtualDown = new Set<string>();
  /** 本帧最后按下的物理键码(改绑捕获用,endFrame 清空) */
  lastKey: string | null = null;
  /** 指针坐标换算系数 = 1/uiScale(界面缩放时客户端坐标→逻辑坐标) */
  pointerScale = 1;

  /** 触点快照(TouchControls 读取) */
  touches(): Array<{ id: number; x: number; y: number; sx: number; sy: number; claimed: string | null; started: boolean }> {
    const out: Array<{ id: number; x: number; y: number; sx: number; sy: number; claimed: string | null; started: boolean }> = [];
    for (const [id, t] of this.touchPts) {
      out.push({ id, x: t.x, y: t.y, sx: t.sx, sy: t.sy, claimed: t.claimed, started: this.touchStarted.includes(id) });
    }
    return out;
  }

  /** 触屏按钮认领触点(该触点不再当摇杆) */
  claimTouch(id: number, owner: string): void {
    const t = this.touchPts.get(id);
    if (t) t.claimed = owner;
  }

  /** 注入一次“按下”(触屏按钮 → 复用键盘语义) */
  injectPress(code: string): void {
    this.pressed.add(code);
  }

  /** 设置虚拟按住状态(如触屏普攻钮按住 → KeyJ) */
  setVirtualDown(code: string, held: boolean): void {
    if (held) this.virtualDown.add(code);
    else this.virtualDown.delete(code);
  }

  /** 触屏时钟推进(GameScene 每帧调用) */
  tickTouch(dt: number): void {
    this.touchActiveT -= dt;
    this.touchActive = this.touchActiveT > 0;
  }

  attach(target: HTMLElement): void {
    // ---- 触屏事件 ----
    // mapClient:竖屏旋转模式下把窗口坐标转回横屏坐标(见 Viewport.ts)
    const touchPos = (t: Touch): { x: number; y: number } => {
      const p = mapClient(t.clientX, t.clientY);
      return { x: p.x * this.pointerScale, y: p.y * this.pointerScale };
    };
    target.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touchActiveT = 3;
      this.touchActive = true;
      for (const t of Array.from(e.changedTouches)) {
        const p = touchPos(t);
        this.touchPts.set(t.identifier, { x: p.x, y: p.y, sx: p.x, sy: p.y, claimed: null });
        this.touchStarted.push(t.identifier);
        // 触点也作为 UI 点击(菜单/背包)
        this.mouseX = p.x;
        this.mouseY = p.y;
        this.mousePressed = true;
      }
    }, { passive: false });
    target.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this.touchActiveT = 3;
      for (const t of Array.from(e.changedTouches)) {
        const pt = this.touchPts.get(t.identifier);
        if (pt) {
          const p = touchPos(t);
          pt.x = p.x;
          pt.y = p.y;
        }
      }
    }, { passive: false });
    const endTouch = (e: TouchEvent): void => {
      e.preventDefault();
      for (const t of Array.from(e.changedTouches)) this.touchPts.delete(t.identifier);
    };
    target.addEventListener('touchend', endTouch, { passive: false });
    target.addEventListener('touchcancel', endTouch, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      this.lastKey = e.code; // 设置面板改绑捕获用
      // 防止空格滚动页面 / Tab 切走焦点
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown = false;
    });
    target.addEventListener('mousemove', (e) => {
      const p = mapClient(e.clientX, e.clientY);
      this.mouseX = p.x * this.pointerScale;
      this.mouseY = p.y * this.pointerScale;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('mousedown', (e) => {
      if (e.button === 2) {
        this.mouseRight = true;
        this.mouseRightPressed = true;
        return;
      }
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2) this.mouseRight = false;
      if (e.button === 0) this.mouseDown = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code: string): boolean {
    return this.down.has(code) || this.virtualDown.has(code);
  }

  /** 触屏浮动摇杆向量(未认领的、落点在左侧 60% 屏幕的触点) */
  private touchJoy(): { x: number; y: number } | null {
    for (const t of this.touchPts.values()) {
      if (t.claimed !== null) continue;
      if (t.sx > viewW() * this.pointerScale * JOY_SCREEN_FRAC) continue;
      const dx = t.x - t.sx;
      const dy = t.y - t.sy;
      const d = Math.hypot(dx, dy);
      if (d < this.joyDeadPx) return { x: 0, y: 0 }; // 死区:按住不动=站定
      const cl = Math.min(d, this.joyRadiusPx) / this.joyRadiusPx;
      return { x: (dx / d) * cl, y: (dy / d) * cl };
    }
    return null;
  }

  /** 摇杆渲染数据(TouchControls 用) */
  joyVisual(): { ax: number; ay: number; x: number; y: number } | null {
    for (const t of this.touchPts.values()) {
      if (t.claimed !== null) continue;
      if (t.sx > viewW() * this.pointerScale * JOY_SCREEN_FRAC) continue;
      return { ax: t.sx, ay: t.sy, x: t.x, y: t.y };
    }
    return null;
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** WASD / 方向键 / 手柄左摇杆 归一化移动轴 */
  axis(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y -= 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y += 1;
    if (x === 0 && y === 0) {
      const joy = this.touchJoy();
      if (joy && (joy.x !== 0 || joy.y !== 0)) return joy;
    }
    if (x === 0 && y === 0 && (this.padLX !== 0 || this.padLY !== 0)) {
      // 摇杆:模拟量直通(带死区),支持缓走
      const mag = Math.min(1, Math.hypot(this.padLX, this.padLY));
      const a = Math.atan2(this.padLY, this.padLX);
      return { x: Math.cos(a) * mag, y: Math.sin(a) * mag };
    }
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.sqrt(2);
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  /** 每帧末调用,清除“本帧按下”状态 */
  endFrame(): void {
    this.pressed.clear();
    this.mousePressed = false;
    this.mouseRightPressed = false;
    this.touchStarted.length = 0;
    this.lastKey = null;
  }
}
