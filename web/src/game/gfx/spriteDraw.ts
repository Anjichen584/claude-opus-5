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
 * 以“底部中心”为锚点绘制精灵(俯视角脚底贴地)。
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
  'shroomling', 'windbee', 'blightwolf', 'thornvine', 'oakgolem', 'boss_nanmir', 'midboss_mossstag', 'grass_tile',
  'emberimp', 'frostslime', 'sparklizard', 'toxintoad', 'stardustsprite',
  'prop_tree', 'prop_rock', 'prop_bush',
  'snowpuff', 'iceturtle', 'blizzardhawk', 'frostmage', 'boss_velsha', 'snow_tile',
  'prop_pine', 'prop_icerock', 'prop_crystal',
  'knight_walk', 'ranger_walk', 'arcanist_walk', 'warden_walk',
  // 剑士动作序列(10-FULL-PLAN 轮 27 动画批次 1;其余职业/动作按批上,缺序列时 anim.ts 自动降级)
  'knight_walk_1', 'knight_walk_2', 'knight_walk_3', 'knight_walk_4',
  'knight_atk_1', 'knight_atk_2', 'knight_atk_3',
  'knight_dash_1', 'knight_dash_2', 'knight_dash_3',
  'knight_hurt_1', 'knight_hurt_2',
  'knight_die_1', 'knight_die_2', 'knight_die_3', 'knight_die_4',
  'knight_cast_1', 'knight_cast_2', 'knight_cast_3',
  // 猎手(轮 28):走路 4 + 拉弓(cast)3 + 翻滚 3 + 受击 2 + 死亡 4 = 6/6 动作 16 帧
  'ranger_walk_1', 'ranger_walk_2', 'ranger_walk_3', 'ranger_walk_4',
  'ranger_cast_1', 'ranger_cast_2', 'ranger_cast_3',
  'ranger_dash_1', 'ranger_dash_2', 'ranger_dash_3',
  'ranger_hurt_1', 'ranger_hurt_2',
  'ranger_die_1', 'ranger_die_2', 'ranger_die_3', 'ranger_die_4',
  // 秘术师(轮 28 下半场 + 收尾):走路 4 + 施法 3 + 翻滚 3 + 受击 2 + 死亡 4 = 6/6 动作 16 帧(风格 = 法术吟唱:聚元素 → 出手 → 收招)
  'arcanist_walk_1', 'arcanist_walk_2', 'arcanist_walk_3', 'arcanist_walk_4',
  'arcanist_cast_1', 'arcanist_cast_2', 'arcanist_cast_3',
  'arcanist_dash_1', 'arcanist_dash_2', 'arcanist_dash_3',
  'arcanist_hurt_1', 'arcanist_hurt_2',
  'arcanist_die_1', 'arcanist_die_2', 'arcanist_die_3', 'arcanist_die_4',
  // 守卫(轮 29):走路 4 + 重锤攻击 3(蓄力→砸地命中→收锤)+ 翻滚 3 + 受击 2 + 死亡 4 + 施法 3(岩震击杵锤) = 6/6 动作 19 帧
  'warden_walk_1', 'warden_walk_2', 'warden_walk_3', 'warden_walk_4',
  'warden_atk_1', 'warden_atk_2', 'warden_atk_3',
  'warden_dash_1', 'warden_dash_2', 'warden_dash_3',
  'warden_hurt_1', 'warden_hurt_2',
  'warden_die_1', 'warden_die_2', 'warden_die_3', 'warden_die_4',
  'warden_cast_1', 'warden_cast_2', 'warden_cast_3',
  // 营地 NPC(轮 29 收官):流浪商人贴图(GameScene 兜帽人形回退保留)
  'npc_merchant',
  'cinderrat', 'dunebeetle', 'flamedancer', 'duststinger', 'boss_kazra', 'sand_tile',
  'prop_cactus', 'prop_sandrock', 'prop_tumble',
  'fx_slash', 'fx_burst', 'fx_ring', 'fx_beam',
  'shroomling_f2', 'windbee_f2', 'blightwolf_f2', 'cinderrat_f2', 'midboss_mossstag_f2',
  'midboss_frosthuntress', 'midboss_frosthuntress_f2',
  'midboss_sandreaper', 'midboss_sandreaper_f2',
  // 轮 11 补怪四件套(炮台/漂移/伏击/画线)
  'icespike', 'iceglider', 'mirageblossom', 'emberwhirl',
  // 轮 31:双帧补齐(10 怪 ×_f2,全怪双帧齐编)
  'leafwisp_f2', 'thornvine_f2', 'emberimp_f2', 'frostslime_f2', 'sparklizard_f2',
  'toxintoad_f2', 'icespike_f2', 'iceglider_f2', 'mirageblossom_f2', 'emberwhirl_f2',
  // 轮 31 下半场:章 Boss 双帧 + 攻击帧组第一批
  'boss_velsha_f2', 'boss_kazra_f2',
  'windbee_atk', 'blightwolf_atk', 'oakgolem_atk', 'frostmage_atk',
  'dunebeetle_atk', 'flamedancer_atk', 'duststinger_atk', 'snowpuff_atk',
  'iceturtle_atk', 'blizzardhawk_atk',
  'shroomling_atk', 'cinderrat_atk', 'leafwisp_atk',
  'frostmoth', 'frostmoth_f2',
  // 轮 35:六元素反应爆点特效
  'fx_rx_steam', 'fx_rx_overload', 'fx_rx_miasma', 'fx_rx_chain', 'fx_rx_brittle', 'fx_rx_numb',
  'fx_nova', 'fx_blink',
  'leafwisp',
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
