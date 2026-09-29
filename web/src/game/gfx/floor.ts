/**
 * 房间地面装饰烘焙(gfx 层,纯观感、不参与碰撞)。
 *
 * 布局模板(RoomLayouts.floorOf)给出"这块地长什么样",这里只负责画:
 *   water 溪畔浅滩 = 沙岸 + 水带 + 波纹;path 土路/林荫路 = 踩出来的土色带;
 *   moss 苔痕 / sand 砂地 = 软边椭圆。配色按章节换材质(林地/雪原/荒漠)。
 * 所有随机细节都来自传入的 Rng,保证同一房间烘焙结果稳定(不会逐帧抖)。
 */

import { Rng } from '@engine/core/Rng';
import { M } from '@game/constants';
import { floorPalette, type FloorFeature } from '@game/dungeon/RoomLayouts';

export function paintFloorFeature(
  ctx: CanvasRenderingContext2D,
  feat: FloorFeature,
  chapter: 1 | 2 | 3,
  rng: Rng,
): void {
  const pal = floorPalette(feat.kind, chapter);
  if (pal === null || feat.wM <= 0 || feat.hM <= 0) return;
  const cx = feat.xM * M;
  const cy = feat.yM * M;
  const hw = (feat.wM / 2) * M;
  const hh = (feat.hM / 2) * M;

  ctx.save();
  if (feat.shape === 'band') {
    if (feat.kind === 'water') paintWater(ctx, cx, cy, hw, hh, pal, rng);
    else paintPath(ctx, cx, cy, hw, hh, pal, rng);
  } else {
    paintBlob(ctx, cx, cy, hw, hh, pal, rng);
  }
  ctx.restore();
}

type Palette = { base: string; edge: string; spark: string };

/** 浅滩:上下各一条沙岸,中间水带 + 波纹 + 反光 */
function paintWater(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number,
  pal: Palette, rng: Rng,
): void {
  const dry = 7;
  ctx.fillStyle = pal.edge;
  ctx.fillRect(cx - hw - dry, cy - hh - dry, hw * 2 + dry * 2, dry);
  ctx.fillRect(cx - hw - dry, cy + hh, hw * 2 + dry * 2, dry);
  ctx.fillStyle = pal.base;
  ctx.fillRect(cx - hw, cy - hh, hw * 2, hh * 2);

  // 波纹:横向短线,越靠上越亮(近岸浅水)
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = pal.spark;
  for (let x = -hw; x < hw; x += 12) {
    const y = rng.range(-hh + 4, hh - 6);
    ctx.fillRect(cx + x + rng.int(0, 5), cy + y, rng.int(6, 14), 2);
  }
  // 反光点
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 26; i++) {
    ctx.fillRect(cx + rng.range(-hw, hw - 6), cy + rng.range(-hh + 3, hh - 4), 5, 2);
  }
  ctx.globalAlpha = 1;
}

/** 土路/林荫路:边缘毛糙的色带 + 碎石 */
function paintPath(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number,
  pal: Palette, rng: Rng,
): void {
  ctx.fillStyle = pal.base;
  for (let x = -hw; x < hw; x += 24) {
    const w = Math.min(24, hw - x);
    const top = cy - hh + rng.range(-3, 3);
    const bot = cy + hh + rng.range(-3, 3);
    ctx.fillRect(cx + x, top, w + 1, bot - top);
  }
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = pal.edge;
  for (let x = -hw; x < hw; x += 96) {
    ctx.fillRect(cx + x, cy - hh + 2, rng.int(30, 60), hh * 2 - 4);
  }
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = pal.spark;
  for (let i = 0; i < 40; i++) {
    ctx.fillRect(cx + rng.range(-hw, hw - 3), cy + rng.range(-hh + 2, hh - 2), rng.int(2, 5), 2);
  }
  ctx.globalAlpha = 1;
}

/** 苔痕/砂地:三层软边椭圆,越往里越亮 */
function paintBlob(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, hw: number, hh: number,
  pal: Palette, rng: Rng,
): void {
  const layers: Array<[string, number, number]> = [
    [pal.edge, 1.0, 0.55],
    [pal.base, 0.86, 0.8],
    [pal.spark, 0.6, 0.55],
  ];
  for (const [color, scale, alpha] of layers) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy, hw * scale, hh * scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 34; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.92);
    ctx.fillRect(cx + Math.cos(a) * hw * r, cy + Math.sin(a) * hh * r, rng.int(2, 4), 2);
  }
  ctx.globalAlpha = 1;
}
