import { Camera } from './Camera';

/** 画布管理:尺寸自适应、像素风采样设置、界面缩放、相机持有。分层顺序由场景控制。 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  width = 0;
  height = 0;
  /** 界面缩放 0.5~2.0:逻辑分辨率 = 物理 / uiScale(越大画面越大) */
  uiScale = 1;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setUiScale(s: number): void {
    this.uiScale = Math.min(2, Math.max(0.5, s));
    this.resize();
  }

  resize(): void {
    this.width = Math.round(window.innerWidth / this.uiScale);
    this.height = Math.round(window.innerHeight / this.uiScale);
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx.imageSmoothingEnabled = false; // 像素风铁律
  }

  clear(color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** 在相机空间内执行绘制回调 */
  inWorld(draw: (ctx: CanvasRenderingContext2D) => void): void {
    const { ctx } = this;
    ctx.save();
    this.camera.apply(ctx, this.width, this.height);
    draw(ctx);
    ctx.restore();
  }

  mouseWorld(mx: number, my: number): { x: number; y: number } {
    return this.camera.screenToWorld(mx, my, this.width, this.height);
  }
}
