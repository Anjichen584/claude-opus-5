/**
 * 像素位图字体(第四批美术:数字字体)。
 *
 * 为什么要有它:之前 HUD/伤害飘字全用 canvas 的 monospace 字体 —— 缩放会发虚、和像素精灵风格
 * 对不上(像素画里没有抗锯齿)。这里用 5×7 位图字模,整数倍放大、整数坐标落点,
 * 每个像素就是一个 fillRect,天然没有模糊边缘。
 *
 * 只覆盖 **数字 + 常用符号**(0-9 . : / - + x , % 空格,共 19 个):中文标签仍走平台字体,
 * 硬塞进 5×7 只会变成马赛克。调用方用 `supports()` 判断,`drawPixelText` 遇到没收录的字符
 * 会退回到 canvas 文字(视觉降级,不留空洞),这样 HUD 里 "12/34" 是像素字、"生命" 还是字体。
 *
 * 字模权威在 `src/data/font.json`,Unity 侧 `Core/PixelFont.cs` 由同一份数据镜像(ParityTests 逐行比对)。
 */

import font from '@data/font.json';

export const GLYPH_W = font.glyphW;
export const GLYPH_H = font.glyphH;
export const SPACING = font.spacing;

/** 字模表:字符 → 7 行 × 5 列('#' 实 / '.' 空) */
export const GLYPHS: Readonly<Record<string, readonly string[]>> = font.glyphs;
/** 收录顺序(与 font.json 键序一致;C# 镜像按同一顺序比对) */
export const GLYPH_ORDER: readonly string[] = Object.keys(font.glyphs);

export function hasGlyph(ch: string): boolean {
  return Object.prototype.hasOwnProperty.call(GLYPHS, ch);
}

/** 整串是否都能用位图字模绘制(含空格) */
export function supports(text: string): boolean {
  for (const ch of text) if (!hasGlyph(ch)) return false;
  return true;
}

/** 该字符点亮了几个像素(测试与尺寸估算用) */
export function litPixels(text: string): number {
  let n = 0;
  for (const ch of text) {
    const rows = GLYPHS[ch];
    if (!rows) continue;
    for (const row of rows) for (const c of row) if (c === '#') n++;
  }
  return n;
}

/** 像素宽度(scale 为整数倍;字符之间空 spacing×scale) */
export function measure(text: string, scale = 1): number {
  if (text.length === 0) return 0;
  return text.length * GLYPH_W * scale + (text.length - 1) * SPACING * scale;
}

/** 高度(单行) */
export function lineHeight(scale = 1): number {
  return GLYPH_H * scale;
}

export interface PixelTextOpts {
  /** 整数倍缩放(1 = 5×7,2 = 10×14;小数会被取整,保证清晰) */
  scale?: number;
  color: string;
  /** 基线对齐:'left' 把 x 当作左边界,'center'/'right' 按整串宽度对齐(与 HUD 的 ctx.textAlign 一致) */
  align?: 'left' | 'center' | 'right';
  /** 描边色:给每个像素四周补一圈(压在杂乱背景上也读得清),代价是像素数 ×5 */
  outline?: string | null;
}

/**
 * 画一串像素文字。返回整串宽度(px),方便调用方排版。
 * 坐标与尺寸全部取整:同一串字在任何位置、任何缩放下都长一样,不会出现"半个像素"的毛边。
 */
export function drawPixelText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  opts: PixelTextOpts,
): number {
  const scale = Math.max(1, Math.round(opts.scale ?? 1));
  const w = measure(text, scale);
  const align = opts.align ?? 'left';
  let px = Math.round(x);
  if (align === 'center') px = Math.round(x) - Math.floor(w / 2);
  else if (align === 'right') px = Math.round(x) - w;
  const py = Math.round(y);

  // 不支持的字符:整串退回平台字体(混排反而更难看,且中文一定有平台字体)
  const foreign = [...text].filter((ch) => !hasGlyph(ch));
  if (foreign.length > 0) {
    ctx.fillStyle = opts.color;
    ctx.font = `bold ${GLYPH_H * scale}px monospace`;
    ctx.textAlign = align;
    ctx.fillText(text, Math.round(x), py + GLYPH_H * scale);
    return w;
  }

  // 描边分两趟画:先给每个点亮像素摊一块 (3×3−2×2) 的边框,再统一落本体。
  // 两趟是必须的 —— 单趟时后一个像素的描边会盖掉前一个像素的本体。
  // 代价是 2N 个 fillRect(N = 点亮像素数),比"8 邻域各画一遍"的 9N 省一个量级,
  // 视觉上仍是标准的"1 个字体像素粗"的像素描边。
  if (opts.outline) {
    ctx.fillStyle = opts.outline;
    eachPixel(text, (px0, py0) => {
      ctx.fillRect(px0 - scale, py0 - scale, scale * 3, scale * 3);
    }, px, py, scale);
  }
  ctx.fillStyle = opts.color;
  eachPixel(text, (px0, py0) => {
    ctx.fillRect(px0, py0, scale, scale);
  }, px, py, scale);
  return w;
}

/** 遍历整串文字点亮的像素,回调其左上角坐标(绘制与统计共用一套遍历) */
export function eachPixel(
  text: string,
  cb: (x: number, y: number) => void,
  x: number,
  y: number,
  scale = 1,
): void {
  let cx = x;
  for (const ch of text) {
    const rows = GLYPHS[ch];
    if (rows) {
      for (let r = 0; r < GLYPH_H; r++) {
        const row = rows[r];
        for (let c = 0; c < GLYPH_W; c++) {
          if (row.charCodeAt(c) !== 35) continue; // '#'
          cb(cx + c * scale, y + r * scale);
        }
      }
    }
    cx += (GLYPH_W + SPACING) * scale;
  }
}

/**
 * HUD 便捷入口:能用位图字体就用,不能就退回平台字体(居中/右对齐口径保持一致)。
 * 注意 y 是**顶部**,不是 canvas 的基线 —— HUD 里按"行高"排版更省事。
 */
export function drawHudNumber(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  yTop: number,
  opts: PixelTextOpts,
): number {
  return drawPixelText(ctx, text, x, yTop, opts);
}
