/** 精灵仓库:异步加载,未就绪时调用方走程序化回退绘制。 */
export class SpriteStore {
  private imgs = new Map<string, HTMLImageElement>();

  load(name: string, url: string): void {
    const img = new Image();
    img.src = url;
    this.imgs.set(name, img);
  }

  /** 仅在解码完成后返回,否则 null(触发回退) */
  get(name: string): HTMLImageElement | null {
    const img = this.imgs.get(name);
    return img && img.complete && img.naturalWidth > 0 ? img : null;
  }
}

export const sprites = new SpriteStore();
