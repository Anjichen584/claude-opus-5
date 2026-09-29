/**
 * 伤害飘字的绘制(gfx 层,便于单测)。
 *
 * 从 FeedbackSystem 里抽出来:那里连着音效/存档等依赖,测试不该为了验"几个方块"把它们全拉进来。
 * 规则:飘字整串都是数字/符号 → 像素字体 + 1 像素描边;含中文 → 整串回退平台字体。
 */
import { drawPixelText, lineHeight } from './pixelFont';

export interface FloaterLike {
  text: string;
  x: number;
  y: number;
  color: string;
  /** 飘字自身的缩放系数(由伤害大小/暴击决定) */
  scale: number;
  /** 当前不透明度(1 → 0) */
  alpha: number;
}

/** 字级分档:普通 1 倍、强化 2 倍、暴击 3 倍(整数倍才能保持像素锐利) */
export function floatScaleOf(scale: number): number {
  if (scale >= 1.6) return 3;
  if (scale >= 1.15) return 2;
  return 1;
}

/** 画一条飘字,返回占用宽度。y 传入的是"锚点",字块画在锚点上方(和旧的 canvas 基线观感一致) */
export function drawFloatText(ctx: CanvasRenderingContext2D, f: FloaterLike): number {
  const scale = floatScaleOf(f.scale);
  ctx.save();
  ctx.globalAlpha = f.alpha;
  const w = drawPixelText(ctx, f.text, f.x, f.y - lineHeight(scale), {
    scale,
    color: f.color,
    align: 'center',
    outline: '#0d0f1a',
  });
  ctx.restore();
  return w;
}
