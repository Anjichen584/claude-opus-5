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
export const ELEMENT_COLORS = {
  fire: '#ff7a45',
  ice: '#6fd3ff',
  bolt: '#ffd94f',
  toxin: '#9de04f',
} as const;

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
