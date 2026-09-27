/** 相机:平滑跟随 + 屏震(打击感组件之一)。坐标为世界像素,锚点为屏幕中心。 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private shakeAmp = 0;
  private shakeT = 0;
  private shakeDur = 0;
  private offX = 0;
  private offY = 0;

  /** amp: 像素振幅, durSec: 持续秒 */
  shake(amp: number, durSec: number): void {
    // 大震覆盖小震,同强度则续时
    if (amp >= this.shakeAmp || this.shakeT <= 0) {
      this.shakeAmp = amp;
      this.shakeDur = durSec;
      this.shakeT = durSec;
    }
  }

  follow(tx: number, ty: number, dt: number, speed = 8): void {
    const k = 1 - Math.exp(-speed * dt);
    this.x += (tx - this.x) * k;
    this.y += (ty - this.y) * k;
  }

  snap(tx: number, ty: number): void {
    this.x = tx;
    this.y = ty;
  }

  update(dt: number): void {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const falloff = Math.max(this.shakeT / this.shakeDur, 0);
      const a = this.shakeAmp * falloff;
      this.offX = (Math.random() * 2 - 1) * a;
      this.offY = (Math.random() * 2 - 1) * a;
    } else {
      this.offX = 0;
      this.offY = 0;
    }
  }

  /** 应用相机变换(渲染世界层前调用,配合 ctx.save/restore) */
  apply(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
    ctx.translate(
      Math.round(viewW / 2 - this.x * this.zoom + this.offX),
      Math.round(viewH / 2 - this.y * this.zoom + this.offY),
    );
    ctx.scale(this.zoom, this.zoom);
  }

  screenToWorld(sx: number, sy: number, viewW: number, viewH: number): { x: number; y: number } {
    return {
      x: (sx - viewW / 2) / this.zoom + this.x,
      y: (sy - viewH / 2) / this.zoom + this.y,
    };
  }
}
