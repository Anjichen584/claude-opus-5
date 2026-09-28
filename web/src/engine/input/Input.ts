/** 键鼠+手柄输入状态机。语义动作(移动/攻击/翻滚)在 game 层映射,这里只管原始状态。 */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mousePressed = false;

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

  attach(target: HTMLElement): void {
    window.addEventListener('keydown', (e) => {
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      // 防止空格滚动页面 / Tab 切走焦点
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown = false;
    });
    target.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    target.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mousePressed = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code: string): boolean {
    return this.down.has(code);
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

  /** 每帧末调用,清除"本帧按下"状态 */
  endFrame(): void {
    this.pressed.clear();
    this.mousePressed = false;
  }
}
