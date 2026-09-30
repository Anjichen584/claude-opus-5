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
import { insideIce, insideWater, insideWind, type FloorFeature, type LayoutResult } from '@game/dungeon/RoomLayouts';

const T = balance.layouts.terrain;

class TerrainState {
  private floor: FloorFeature | null = null;
  /** 本房是否有机制地形(渲染/提示用) */
  hasWater = false;
  /** 本房是否有冰面(轮 12「冰面滑行」:冰湖裂面的 blob 冰是机制地形,不再只是贴图) */
  hasIce = false;
  /** 当前地板种类(null = 没有地形,如营地)。环境声(轮 26)与 UI 都读它 —— 不再把 floor 本身暴露出去 */
  get floorKind(): string | null {
    return this.floor === null ? null : this.floor.kind;
  }

  /** 本房是否有沙暴循环(轮 15:三章沙地房独有;由 RunManager 按章开闸) */
  hasStorm = false;
  /** 沙暴循环计时(从晴开始;tick() 推进) */
  private stormT = 0;

  setFromLayout(layout: LayoutResult | null): void {
    const f = layout?.floor ?? null;
    // 机制地形认水/冰/沙;其余(苔/土路)仍是纯观感,不进状态
    this.floor = f !== null && (f.kind === 'water' || f.kind === 'ice' || f.kind === 'sand' || f.kind === 'wind') ? f : null;
    this.hasWater = this.floor !== null && this.floor.kind === 'water';
    this.hasIce = this.floor !== null && this.floor.kind === 'ice';
    // 沙暴默认关:沙地板一二章也有(石柱阵/环形),只有三章由 RunManager 开
    this.hasStorm = false;
    this.stormT = 0;
  }

  /** 三章沙地房开沙暴(章节归属只有 RunManager 知道,Terrain 不猜) */
  enableStorm(): void {
    this.hasStorm = this.floor !== null && this.floor.kind === 'sand';
    this.stormT = 0;
  }

  /** 推进沙暴循环(GameScene 每帧调;无沙暴时零开销) */
  tick(dt: number): void {
    if (this.hasStorm) this.stormT = (this.stormT + dt) % (T.stormClearS + T.stormActiveS);
  }

  /** 当前是否在沙暴中(循环 = 先晴 stormClearS 秒,后暴 stormActiveS 秒) */
  get stormActive(): boolean {
    return this.hasStorm && this.stormT >= T.stormClearS;
  }

  /** 沙暴强度 0~1(渲染渐入渐出用;边缘 0.6s 缓坡) */
  get stormIntensity(): number {
    if (!this.stormActive) return 0;
    const into = this.stormT - T.stormClearS;
    const left = T.stormClearS + T.stormActiveS - this.stormT;
    return Math.min(1, into / 0.6, left / 0.6);
  }

  /** 投射物衰老乘区:沙暴里飞行物射程缩短(双方公平 —— 反制就是近身打) */
  get projAgeMul(): number {
    return this.stormActive ? T.stormProjAgeMul : 1;
  }

  clear(): void {
    this.floor = null;
    this.hasWater = false;
    this.hasIce = false;
    this.hasStorm = false;
    this.stormT = 0;
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

  /** 像素坐标是否在冰面上(轮 12:冰面只改"手感",不改速度上限与元素) */
  /** 像素坐标是否在风带里(轮 17:带内所有实体吃 +x 方向推力) */
  isWind(xPx: number, yPx: number): boolean {
    if (this.floor === null) return false;
    return insideWind(this.floor, xPx / M, yPx / M);
  }

  /** 风带推力(米/秒,方向 +x;不在风带 = 0) */
  windPush(xPx: number, yPx: number): number {
    return this.isWind(xPx, yPx) ? T.windPushM : 0;
  }

  isIce(xPx: number, yPx: number): boolean {
    if (this.floor === null) return false;
    return insideIce(this.floor, xPx / M, yPx / M);
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
