import { sprites } from '@engine/render/Sprites';

/**
 * 9-slice 面板:用一张正方形 UI 面板贴图拉伸任意尺寸的窗口。
 * 约定:贴图 32×32,四角各 8px 不拉伸、中段平铺/拉伸,保证边框粗细恒定。
 * 贴图未加载时返回 false,调用方走原来的程序化面板(视觉降级,不留空洞)。
 */
const PANEL_SPRITE = 'ui_panel';
/** 源图边长与切片边距(像素) */
const SRC_SIZE = 32;
const CORNER = 8;

export function drawPanel9(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  /** 内部填充色;传 null 表示保留贴图中心(几乎不用:拉伸后会有噪点) */
  fill: string | null = 'rgba(19,23,38,0.96)',
): boolean {
  const img = sprites.get(PANEL_SPRITE);
  if (!img) return false;
  // 源图按 32×32 生成;万一以后换更大尺寸的图,按边长同比换算切片
  const sx = img.naturalWidth / SRC_SIZE;
  const c = CORNER * sx;
  const xs = Math.round(x);
  const ys = Math.round(y);
  const ws = Math.round(w);
  const hs = Math.round(h);
  const midW = Math.max(0, ws - CORNER * 2);
  const midH = Math.max(0, hs - CORNER * 2);

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // 四角
  const corner = (dx: number, dy: number, sxs: number, sys: number): void => {
    ctx.drawImage(
      img,
      sxs === 1 ? img.naturalWidth - c : 0, sys === 1 ? img.naturalHeight - c : 0, c, c,
      dx, dy, CORNER, CORNER,
    );
  };
  // 边与中心:按目标尺寸平铺拉伸(1px 边框放大到 1px,用 drawImage 分段)
  const edge = (dx: number, dy: number, dw: number, dh: number, sx0: number, sy0: number, sw: number, sh: number): void => {
    if (dw <= 0 || dh <= 0) return;
    ctx.drawImage(img, sx0, sy0, sw, sh, dx, dy, dw, dh);
  };

  // 上下边(横向拉伸中段)
  edge(xs + CORNER, ys, midW, CORNER, c, 0, img.naturalWidth - c * 2, c);
  edge(xs + CORNER, ys + CORNER + midH, midW, CORNER, c, img.naturalHeight - c, img.naturalWidth - c * 2, c);
  // 左右边(纵向拉伸中段)
  edge(xs, ys + CORNER, CORNER, midH, 0, c, c, img.naturalHeight - c * 2);
  edge(xs + CORNER + midW, ys + CORNER, CORNER, midH, img.naturalWidth - c, c, c, img.naturalHeight - c * 2);
  // 中心
  edge(xs + CORNER, ys + CORNER, midW, midH, c, c, img.naturalWidth - c * 2, img.naturalHeight - c * 2);

  corner(xs, ys, 0, 0);
  corner(xs + ws - CORNER, ys, 1, 0);
  corner(xs, ys + hs - CORNER, 0, 1);
  corner(xs + ws - CORNER, ys + hs - CORNER, 1, 1);

  // 内部铺平:贴图中心被拉伸后会有明显噪点,且文字压在噪点上难认。
  // 内缩 5px 保住描边与四角铆钉(源图边框约 4px)。
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(xs + 5, ys + 5, Math.max(0, ws - 10), Math.max(0, hs - 10));
  }

  ctx.restore();
  return true;
}
