/**
 * 无尽模式(2026-09-29,10-FULL-PLAN 轮 24)。
 *
 * 三章跑完之后不再"通关",而是接**无限循环章**:每循环把三章各跑一遍(章决定内容:怪表/地貌/Boss),
 * 循环数决定乘区。设计上最重要的两条:
 *
 * 1. **没有通关,只有"撑到第几层"** —— 所以结算页记的是层数与循环数,不是"胜利”。这既给了长线目标
 *    (高手有的打),也避开了"出第四章内容"的高成本(10-FULL-PLAN §11 已把正式第四章划掉)。
 * 2. **数值必须永远有限** —— 这一轮的验收门就是"20 层后仍不崩"。几何增长在 1700 循环左右会
 *    溢出成 `Infinity`,所以这里有**两道闸**:先把乘区 clamp 到 `maxMult`,再把最终数值 clamp 到
 *    `maxHp`/`maxAtk` 并保证是**有限整数**。闸门写在这里而不是散在出怪代码里 ——
 *    "只在一个地方夹"是唯一能守住的做法(否则总有一条出怪路径绕过去)。
 *
 * 纯函数,零副作用:能单测(含极端循环数的溢出测试),Unity 侧 `Dungeon/EndlessRules.cs` 同一套规则。
 */
import balance from '@data/balance.json';

const E = balance.endless;

/** 章节循环:1 → 2 → 3 → 1 …(循环 0 是第一章,循环 3 又回到第一章) */
export const CHAPTER_CYCLE = [1, 2, 3] as const;

export const chapterOfLoop = (loop: number): 1 | 2 | 3 => {
  // NaN 要单独挡:NaN % 3 === NaN,直接索引会取到 undefined,章节配置就会炸在别处(远离现场)
  const n = Number.isFinite(loop) ? Math.floor(loop) : 0;
  const len = CHAPTER_CYCLE.length;
  return CHAPTER_CYCLE[((n % len) + len) % len];
};

export interface LoopMults {
  hp: number;
  atk: number;
  loot: number;
  dust: number;
}

/**
 * 第 loop 循环的乘区(loop 0 = 第一遍,全 1)。
 * 几何增长 + 上限:`Math.pow` 在极端输入下会给出 `Infinity`,所以**先算再夹**,
 * 并且把非有限值直接按上限处理(宁可难到极致,也不能让 NaN 顺着乘法传进血量)。
 */
export function loopMults(loop: number): LoopMults {
  const n = Math.max(0, Math.floor(Number.isFinite(loop) ? loop : 0));
  const cap = E.maxMult;
  const grow = (base: number): number => {
    const v = Math.pow(base, n);
    if (!Number.isFinite(v)) return cap;
    return Math.min(cap, v);
  };
  return { hp: grow(E.loopHp), atk: grow(E.loopAtk), loot: grow(E.loopLoot), dust: grow(E.loopDust) };
}

/**
 * 最终数值闸门:夹到上限并保证是**有限正整数**。
 * 出怪血量/攻击、星尘结算都走这里 —— 溢出时宁可"顶到上限"也不能出现 Infinity(那会让 UI 显示成 ∞、
 * 让伤害公式算出 NaN,进而整局数据被污染)。
 */
export function safeStat(value: number, max: number): number {
  if (!Number.isFinite(value)) return Math.max(1, Math.round(max));
  return Math.max(1, Math.min(Math.round(max), Math.round(value)));
}

/** 血量闸门(用数据表上限) */
export const safeHp = (v: number): number => safeStat(v, E.maxHp);
/** 攻击闸门(用数据表上限) */
export const safeAtk = (v: number): number => safeStat(v, E.maxAtk);
/** 通用乘区闸门(掉落/星尘这类"倍率"不该被夹成整数,单独一条) */
export function safeMult(v: number): number {
  if (!Number.isFinite(v)) return E.maxMult;
  return Math.min(E.maxMult, Math.max(0, v));
}

/** 第 loop 循环的展示名(UI/结算用) */
export function loopLabel(loop: number): string {
  const ch = chapterOfLoop(loop);
  return `循环 ${loop + 1} · 第${ch}章`;
}

export interface EndlessProgress {
  /** 普通/深渊通关总数(解锁判定用) */
  clears: number;
  /** 历史最高层(存档 endlessBest;0 = 没玩过) */
  bestFloor: number;
  /** 历史最高循环数(存档 endlessBestLoop;0 = 没玩过) */
  bestLoop: number;
}

/** 解锁吗(通关数门槛;数据表给) */
export const endlessUnlocked = (clears: number): boolean =>
  Math.max(0, Math.floor(clears)) >= E.unlockClears;

export const endlessLockReason = (clears: number): string =>
  `任意难度通关 ${Math.max(0, Math.floor(clears))}/${E.unlockClears} 次`;

/** 结算:这一局的层数/循环数是否刷新纪录(返回新的最好成绩,不改入参) */
export function recordRun(floor: number, loop: number, prog: EndlessProgress): EndlessProgress {
  const f = Math.max(0, Math.floor(Number.isFinite(floor) ? floor : 0));
  const l = Math.max(0, Math.floor(Number.isFinite(loop) ? loop : 0));
  return {
    clears: prog.clears,
    bestFloor: Math.max(prog.bestFloor, f),
    bestLoop: Math.max(prog.bestLoop, l),
  };
}

/** 这次是不是刷新了纪录(结算页提示用) */
export const isNewRecord = (floor: number, prog: EndlessProgress): boolean => floor > prog.bestFloor;

/** 一局无尽里"层"的显示(HUD/结算):第 N 层 */
export const floorLabel = (floor: number): string => `第 ${Math.max(1, Math.floor(floor))} 层`;
