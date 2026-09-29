/**
 * 地形效果(docs/01-GDD.md §9.2「布局机制化」)。
 *
 * 布局模板给房间铺了浅滩/窄道/土路,但第一版只是观感 —— 趟水不减速、墙打不穿。
 * 本文件把地形接进战斗:**浅滩**(水)与 **可打穿的障碍**。
 *
 * 设计取舍(为什么是这两条):
 *   · 浅滩减速 + 雷伤加成 → 让"水岸"成为一个真正的战术位:近战在水里追人更吃力,
 *     但把雷系怪/雷符文留到水边开,能吃到 ×1.25 与短时麻痹。风险收益一眼看得懂。
 *   · 墙可打穿 → 窄道的第一层设计(通道被压窄)有了第二层解法:花几刀在墙上开个口子,
 *     远程位就活了。耐久按 树 80 / 岩 120 给:普攻 12 点要 7~10 刀,技能一两发;
 *     既不是"随手拆"也不是"拆不动",这是"值不值得"的取舍。
 *
 * 运行期是模块级单例(和 clock / runMods 一样):RunManager 换房时 setFromLayout(),
 * 系统侧只读,不需要到处传 layout。数值全走 balance.json(layouts.terrain / props.*.hp)。
 */

import balance from '@data/balance.json';
import { M } from '@game/constants';
import { insideWater, type FloorFeature, type LayoutResult } from '@game/dungeon/RoomLayouts';

const T = balance.layouts.terrain;

class TerrainState {
  private floor: FloorFeature | null = null;
  /** 本房是否有机制地形(渲染/提示用) */
  hasWater = false;

  setFromLayout(layout: LayoutResult | null): void {
    this.floor = layout?.floor ?? null;
    this.floor = this.floor !== null && this.floor.kind === 'water' ? this.floor : null;
    this.hasWater = this.floor !== null;
  }

  clear(): void {
    this.floor = null;
    this.hasWater = false;
  }

  /** 像素坐标是否在水里(浅滩是可趟过的:这里只影响手感与元素,不影响通行) */
  isWater(xPx: number, yPx: number): boolean {
    if (this.floor === null) return false;
    return insideWater(this.floor, xPx / M, yPx / M);
  }

  /** 移动速度乘区:水里趟着走(所有实体通用,含冲刺 —— 水里冲不远) */
  moveMult(xPx: number, yPx: number): number {
    return this.isWater(xPx, yPx) ? T.waterMoveMult : 1;
  }

  /** 元素伤害乘区:水导电,雷伤在水里更疼 */
  elemAmp(element: string | null | undefined, xPx: number, yPx: number): number {
    if (element !== 'bolt') return 1;
    return this.isWater(xPx, yPx) ? T.waterBoltAmp : 1;
  }

  /** 水里的雷击附带短时麻痹(秒);不在水里 = 0 */
  stunOnBolt(element: string | null | undefined, xPx: number, yPx: number): number {
    if (element !== 'bolt') return 0;
    return this.isWater(xPx, yPx) ? T.waterStunS : 0;
  }
}

export const terrain = new TerrainState();

// ---------------------------------------------------------------------------
// 可打穿的障碍
// ---------------------------------------------------------------------------

/** 实心障碍的耐久(0 = 打不烂,如灌木) */
export function propHp(kind: string): number {
  if (kind === 'tree') return balance.props.tree.hp;
  if (kind === 'rock') return balance.props.rock.hp;
  return 0;
}

/**
 * 给障碍记一笔伤害。返回是否刚好被打破(用来放音效/提示)。
 * 只有实心障碍有耐久;灌木返回 false。
 */
export interface Breakable {
  hp: number;
  broken: boolean;
}

export function damageProp(prop: Breakable, kind: string, amount: number): boolean {
  const max = propHp(kind);
  if (max <= 0 || prop.broken) return false;
  if (prop.hp <= 0) prop.hp = max;
  prop.hp -= Math.max(0, amount);
  if (prop.hp > 0) return false;
  prop.hp = 0;
  prop.broken = true;
  return true;
}

/** 打破需要几刀(给 UI/文档一个能对外的说法,也用于测试断言) */
export function hitsToBreak(kind: string, dps: number): number {
  const max = propHp(kind);
  if (max <= 0 || dps <= 0) return 0;
  return Math.ceil(max / dps);
}
