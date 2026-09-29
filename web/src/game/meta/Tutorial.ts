/**
 * 新手引导(5 步):纯状态机,不碰 DOM/画布。
 *
 * 为什么单独一个模块:
 * - 文案里的按键必须取**当前绑定**(玩家改过键还照着老文案按 = 引导在骗人);
 * - 完成条件要能被单测直接驱动(`notify('dash')`),不用起一个真 Canvas;
 * - 进度要能续(中途关掉游戏,回来接着下一步)。
 *
 * 事件源(GameScene 里轮询/接线,见 `GameScene.tickTutorial`):
 * move = 玩家在营地里累计移动 moveM 米;dash = 翻滚起手;skill = 真实放出一个技能;
 * bag = 打开过背包含;altar = 在祭坛上做了任何一次强化(或交互)。
 */
import balance from '@data/balance.json';
import { bindOf, keyLabel } from './Bindings';

const T = balance.tutorial;

export type TutorialStepId = 'move' | 'dash' | 'skill' | 'bag' | 'altar';

export interface TutorialStep {
  id: TutorialStepId;
  title: string;
  /** 原始文案,`{action}` 占位符会被替换成当前绑定键 */
  hint: string;
}

export const STEPS: TutorialStep[] = T.steps as TutorialStep[];

/** 把 `{dash}` 之类占位符换成当前按键名 */
export function formatHint(hint: string): string {
  return hint.replace(/\{(\w+)\}/g, (_, action: string) => keyLabel(bindOf(action)) || action);
}

/** 引导状态下标(越界一律夹回,老/坏档不会让它崩) */
export const clampStep = (n: unknown): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : 0;
  return Math.min(STEPS.length, Math.max(0, v));
};

export class Tutorial {
  /** 下一个待完成的步骤下标;=== STEPS.length 表示全部完成 */
  step = 0;
  done = false;
  /** 本次会话内已完成步数(用于"刚刚学会"的即时反馈,不落盘) */
  justCompleted: string | null = null;

  /** 从存档恢复 */
  restore(state: { step: number; done: boolean } | undefined): void {
    this.step = clampStep(state?.step);
    this.done = state?.done === true || this.step >= STEPS.length;
  }

  /** 落盘用的快照 */
  snapshot(): { step: number; done: boolean } {
    return { step: this.step, done: this.done };
  }

  /** 当前步骤(null = 已结束/已跳过) */
  get current(): TutorialStep | null {
    if (this.done) return null;
    return STEPS[this.step] ?? null;
  }

  /** 当前应显示的文案(带真实按键;已完成/跳过后为 null) */
  get hint(): string | null {
    const s = this.current;
    return s ? formatHint(s.hint) : null;
  }

  /** 第几步(展示用,1 起);已结束返回 STEPS.length */
  get displayIndex(): number {
    return Math.min(this.step + 1, STEPS.length);
  }

  /**
   * 上报一个动作。只有**当前步骤对应的动作**才推进 ——
   * 这样"先翻滚再走动"不会把引导跳乱,也让顺序可预测。
   * 返回 true 表示这一步刚被完成(调用方可放反馈音/飘字)。
   */
  notify(kind: TutorialStepId): boolean {
    const s = this.current;
    if (!s || s.id !== kind) return false;
    this.justCompleted = s.id;
    this.step += 1;
    if (this.step >= STEPS.length) this.done = true;
    return true;
  }

  /** 跳过整段引导(玩家明确不要,就永远别再来烦他) */
  skip(): void {
    this.step = STEPS.length;
    this.done = true;
    this.justCompleted = null;
  }

  /** 重开引导(设置面板里的"重看新手引导"用) */
  restart(): void {
    this.step = 0;
    this.done = false;
    this.justCompleted = null;
  }
}

/** 全局单例(GameScene 持有;状态由 meta.data.tutorial 落盘) */
export const tutorial = new Tutorial();
