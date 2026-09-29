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
  'cinderrat', 'dunebeetle', 'flamedancer', 'duststinger', 'boss_kazra', 'sand_tile',
  'prop_cactus', 'prop_sandrock', 'prop_tumble',
  'fx_slash', 'fx_burst', 'fx_ring', 'fx_beam',
  'shroomling_f2', 'windbee_f2', 'blightwolf_f2', 'cinderrat_f2',
  // 第三批:拾取物 / 传送门 / 元素图标
  'pickup_chest', 'pickup_stardust', 'pickup_potion', 'pickup_rune', 'portal_gate',
  'elem_fire', 'elem_ice', 'elem_lightning', 'elem_poison',
  'ui_panel', 'icon_slash', 'icon_shot', 'icon_dash', 'icon_ult',
  // 第三批之三:怪物第二帧(补齐一只登记一只,未登记的在 frame2 里自动回落第一帧)
  'oakgolem_f2', 'snowpuff_f2',
  'iceturtle_f2', 'blizzardhawk_f2', 'frostmage_f2',
  'dunebeetle_f2', 'flamedancer_f2', 'duststinger_f2',
  // 第五批:物品图标(6 部位,背包/装备位)+ 状态图标(结算页与 HUD)
  'icon_item_weapon', 'icon_item_helmet', 'icon_item_chest',
  'icon_item_boots', 'icon_item_ring', 'icon_item_amulet',
  'icon_st_kill', 'icon_st_dps', 'icon_st_taken', 'icon_st_chest',
  // 第五批之二:统计图标补全 + 每技能专属技能图标
  'icon_st_stardust', 'icon_st_time',
  'icon_cleave', 'icon_starfall', 'icon_fan', 'icon_arrowstorm',
  'icon_seeker', 'icon_tempest', 'icon_quake', 'icon_roar',
  // 第五批之三:E 位专属图标 + 技能专属特效贴图
  'icon_tidestep', 'icon_gale', 'icon_blink', 'icon_bulwark',
  'fx_swordfall', 'fx_vortex', 'fx_shockwave', 'fx_crack', 'fx_arrowrain', 'fx_dash_trail',
] as const;
