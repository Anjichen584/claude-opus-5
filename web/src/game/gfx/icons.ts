import type { Slot } from '@game/loot/Items';
import { sprites } from '@engine/render/Sprites';

/**
 * 图标登记表(第五批美术:物品 / 状态)。
 *
 * 规则和精灵一样:**代码只认登记表里的名字**,名字必须在 `SPRITE_NAMES` 里、
 * 且 `public/sprites/<name>.png` 存在(`gfx/__tests__/icons.test.ts` 守卫)。
 * 未加载时 `drawIcon` 返回 false,调用方走程序化回退(字形/色块),
 * 所以缺图不会崩溃、只会视觉降级 —— 这正是要有守卫测试的原因。
 */
export const ITEM_ICON: Record<Slot, string> = {
  weapon: 'icon_item_weapon',
  helmet: 'icon_item_helmet',
  chest: 'icon_item_chest',
  boots: 'icon_item_boots',
  ring: 'icon_item_ring',
  amulet: 'icon_item_amulet',
};

/** 状态/统计图标(结算页与 HUD 用)。键是"这行字在说什么",不是图形本身。 */
export const STAT_ICON = {
  kill: 'icon_st_kill',
  dps: 'icon_st_dps',
  taken: 'icon_st_taken',
  chest: 'icon_st_chest',
} as const;

export type StatIconKey = keyof typeof STAT_ICON;

/**
 * 以 (x, y) 为**左上角**画一个图标,缩放到 `size` 高。返回 false = 图未就绪(调用方回退)。
 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  alpha = 1,
): boolean {
  const img = sprites.get(name);
  if (!img) return false;
  const s = size / img.naturalHeight;
  const w = Math.max(1, Math.round(img.naturalWidth * s));
  const h = Math.max(1, Math.round(size));
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, Math.round(x), Math.round(y), w, h);
  ctx.restore();
  return true;
}

/** 图标 + 文字一行(左对齐),返回文字起点 x —— 让多行统计左边缘对齐。 */
export function drawIconRow(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  size: number,
  text: string,
  color: string,
  font: string,
): void {
  ctx.textAlign = 'left';
  ctx.font = font;
  ctx.fillStyle = color;
  const ok = drawIcon(ctx, name, x, y - size + 2, size);
  const textX = x + (ok ? size + 8 : 0);
  ctx.fillText(text, textX, y);
}
