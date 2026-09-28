import { sprites } from '@engine/render/Sprites';

export interface SpriteOpts {
  faceLeft?: boolean;
  /** 绕底部锚点旋转(弧度)——摇摆/前倾动画 */
  rot?: number;
  /** 水平/垂直挤压(呼吸/落地/蓄力) */
  sx?: number;
  sy?: number;
  /** >0 受击闪白 */
  flash?: number;
  alpha?: number;
  scale?: number;
}

const tintCache = new Map<HTMLImageElement, HTMLCanvasElement>();

/** 白色剪影(受击闪白),按原图缓存 */
function whiteOf(img: HTMLImageElement): HTMLCanvasElement {
  let cv = tintCache.get(img);
  if (!cv) {
    cv = document.createElement('canvas');
    cv.width = img.naturalWidth;
    cv.height = img.naturalHeight;
    const c = cv.getContext('2d')!;
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, cv.width, cv.height);
    tintCache.set(img, cv);
  }
  return cv;
}

/**
 * 以"底部中心"为锚点绘制精灵(俯视角脚底贴地)。
 * 返回 false = 图未加载,调用方应走程序化回退绘制。
 */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  o: SpriteOpts = {},
): boolean {
  const img = sprites.get(name);
  if (!img) return false;
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(Math.round(x), Math.round(y));
  if (o.rot) ctx.rotate(o.rot);
  const s = o.scale ?? 1;
  ctx.scale((o.faceLeft ? -1 : 1) * (o.sx ?? 1) * s, (o.sy ?? 1) * s);
  if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
  const src = (o.flash ?? 0) > 0 ? whiteOf(img) : img;
  ctx.drawImage(src, -w / 2, -h, w, h);
  ctx.restore();
  return true;
}

export const SPRITE_NAMES = [
  'knight', 'ranger', 'arcanist', 'warden',
  'shroomling', 'windbee', 'blightwolf', 'thornvine', 'oakgolem', 'boss_nanmir', 'grass_tile',
  'emberimp', 'frostslime', 'sparklizard', 'toxintoad', 'stardustsprite',
  'prop_tree', 'prop_rock', 'prop_bush',
  'snowpuff', 'iceturtle', 'blizzardhawk', 'frostmage', 'boss_velsha', 'snow_tile',
  'prop_pine', 'prop_icerock', 'prop_crystal',
  'knight_walk', 'ranger_walk', 'arcanist_walk', 'warden_walk',
] as const;
