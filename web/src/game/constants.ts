/** 全项目常量唯一出处(docs/07-CONTRIBUTING.md §3)。 */

/** 1 米 = 48 世界像素(所有速度/距离以米为设计单位,乘 M 转像素) */
export const M = 48;

/** 稀有度色(docs/04-ART-PIPELINE.md §5,全项目唯一定义) */
export const RARITY_COLORS = {
  common: '#E8E8E8',
  fine: '#5FD068',
  rare: '#4FA3E3',
  epic: '#B067E8',
  legendary: '#F2A33C',
} as const;

/** 第一章「翠语林地」环境副板 */
export const FOREST = {
  bg: '#2c4633',
  grassA: '#31503a',
  grassB: '#2e4a36',
  grassC: '#365741',
  hedge: '#22371f',
  hedgeLight: '#2f4a2a',
  flower1: '#e8c95f',
  flower2: '#d8e6ef',
  pebble: '#6f7d72',
} as const;

/** 元素色 */
/** 元素色(默认调色板;色盲模式会整表替换 —— 引用处一律走 elementColor()/本表,不许写死) */
export const ELEMENT_COLORS = {
  fire: '#ff7a45',
  ice: '#6fd3ff',
  bolt: '#ffd94f',
  toxin: '#9de04f',
};

/**
 * 色盲调色板(轮 37):0=关 1=红弱(protan) 2=绿弱(deutan) 3=蓝黄弱(tritan)。
 * 设计准则:同一模式下四色在对应色觉下仍两两可分(亮度差 + 色相错开);
 * 不做全屏滤镜(伤画面且费),只换“语义色” —— 元素/预警/地带全走这张表。
 */
export const COLORBLIND_PALETTES: ReadonlyArray<{ fire: string; ice: string; bolt: string; toxin: string }> = [
  // 关(默认)
  { fire: '#ff7a45', ice: '#6fd3ff', bolt: '#ffd94f', toxin: '#9de04f' },
  // 红弱:毒改紫,火提亮橙
  { fire: '#ff9a2f', ice: '#4fc3ff', bolt: '#fff066', toxin: '#b07fff' },
  // 绿弱:毒改亮紫,冰加深
  { fire: '#ff8a3d', ice: '#3fb8ff', bolt: '#ffe066', toxin: '#c46fff' },
  // 蓝黄弱:雷改亮白,冰改青
  { fire: '#ff5f6f', ice: '#4fe0c8', bolt: '#f2f2f2', toxin: '#9de04f' },
];
export const COLORBLIND_NAMES = ['cb.off', 'cb.protan', 'cb.deutan', 'cb.tritan'] as const;

/** 应用色盲模式(整表替换;越界回默认) */
export function applyColorblind(mode: number): void {
  const p = COLORBLIND_PALETTES[mode] ?? COLORBLIND_PALETTES[0];
  ELEMENT_COLORS.fire = p.fire;
  ELEMENT_COLORS.ice = p.ice;
  ELEMENT_COLORS.bolt = p.bolt;
  ELEMENT_COLORS.toxin = p.toxin;
}

/** UI 色 */
export const UI = {
  hp: '#5FD068',
  hpLow: '#e05f5f',
  panel: 'rgba(13, 15, 26, 0.72)',
  text: '#e8e8e8',
  dim: '#8d95a8',
  gold: '#F2A33C',
  crit: '#ffd94f',
  dmg: '#ffffff',
} as const;
