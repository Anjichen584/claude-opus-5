import { Camera } from './Camera';

/** 画布管理:尺寸自适应、像素风采样设置、相机持有。分层顺序由场景控制。 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera = new Camera();
  width = 0;
  height = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
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
