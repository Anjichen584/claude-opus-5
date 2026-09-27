/**
 * 固定步长主循环(60Hz 模拟 + 插值渲染)。
 * 内置顿帧(hitstop):冻结模拟但继续渲染,是打击感的核心机关之一。
 * 契约见 docs/02-ARCHITECTURE.md §4。
 */
export class GameLoop {
  readonly step = 1 / 60;
  timeScale = 1;
  /** 剩余顿帧时长(现实秒) */
  private freezeT = 0;
  private acc = 0;
  private last = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
  }

  /** 触发顿帧(毫秒)。取 max 而非叠加,避免连杀时永久冻结。 */
  hitstop(ms: number): void {
    this.freezeT = Math.max(this.freezeT, ms / 1000);
  }

  private tick = (now: number): void => {
    if (!this.running) return;
    const rawDt = Math.min((now - this.last) / 1000, 0.1); // 切后台保护
    this.last = now;

    if (this.freezeT > 0) {
      this.freezeT -= rawDt;
    } else {
      this.acc += rawDt * this.timeScale;
      let guard = 0;
      while (this.acc >= this.step && guard++ < 5) {
        this.update(this.step);
        this.acc -= this.step;
      }
    }
    this.render(this.acc / this.step);
    requestAnimationFrame(this.tick);
  };
}
