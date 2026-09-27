/** 组件 = 纯数据。所有逻辑在 systems/ 中。 */

export class Transform {
  prevX: number;
  prevY: number;
  /** 朝向角(弧度,渲染与攻击扇形使用) */
  face = 0;

  constructor(public x: number, public y: number) {
    this.prevX = x;
    this.prevY = y;
  }
}

export class Velocity {
  constructor(public vx = 0, public vy = 0) {}
}

export class Body {
  constructor(
    public radius: number,
    /** 不可推动(木桩/墙) */
    public immovable = false,
  ) {}
}

export class Health {
  hp: number;
  /** 受击闪白剩余秒 */
  flash = 0;

  constructor(public max: number) {
    this.hp = max;
  }
}

export class Stats {
  constructor(
    public atk: number,
    public moveSpeed: number,
    public critRate: number,
    public critDmg: number,
  ) {}
}

export type Team = 'player' | 'enemy' | 'neutral';

export class Faction {
  constructor(public team: Team) {}
}

/** 玩家状态机(狂澜剑士「澜」) */
export class Player {
  // 连击
  comboStage = 0; // 0=未连击, 1..3
  comboTimer = 0;
  attackT = 0; // 当前攻击段剩余时间
  attackDur = 0;
  // 翻滚
  dashT = 0;
  dashDur = 0;
  dashCd = 0;
  dashDirX = 1;
  dashDirY = 0;
  ghostAccum = 0;
  // 无敌帧
  iframes = 0;
  // 瞄准(世界坐标方向)
  aimX = 1;
  aimY = 0;
  // 恢复与死亡
  regenDelay = 0;
  deaths = 0;
  respawnT = 0;
  // 动画钟
  animT = 0;
  moving = false;
}

/** 训练木桩:不死,统计 DPS */
export class Dummy {
  wobble = 0; // 受击晃动强度
  wobblePhase = 0;
  /** 近 3 秒受击记录 [时间戳, 伤害] */
  hits: Array<[number, number]> = [];
}

/** 菇灵(第一章杂兵,Phase 1 先行版:无死爆,Phase 2 补毒印记) */
export class Shroomling {
  state: 'wander' | 'chase' = 'wander';
  wanderT = 0;
  wanderAngle = 0;
  touchCd = 0;
  animT = 0;
  /** 击退冲量(与 AI 速度叠加,物理帧衰减) */
  kx = 0;
  ky = 0;
}

// ---------- 帧内事件 ----------

/** 玩家挥砍判定请求(由 CombatSystem 消费) */
export class MeleeSweep {
  constructor(
    public source: number,
    public x: number,
    public y: number,
    public angle: number,
    public rangePx: number,
    public arcRad: number,
    public mult: number,
    public stage: number,
  ) {}
}

/** 命中结果(反馈系统消费:顿帧/屏震/飘字/粒子) */
export class HitEvent {
  constructor(
    public x: number,
    public y: number,
    public amount: number,
    public crit: boolean,
    public kill: boolean,
    public angle: number,
  ) {}
}

export class KillEvent {
  constructor(public x: number, public y: number) {}
}

export class PlayerHurtEvent {
  constructor(public amount: number, public died: boolean) {}
}

/** 翻滚残影 */
export class DashGhostEvent {
  constructor(public x: number, public y: number, public face: number) {}
}

/** 挥砍视觉特效 */
export class SlashFxEvent {
  constructor(
    public x: number,
    public y: number,
    public angle: number,
    public stage: number,
    public rangePx: number,
    public arcRad: number,
  ) {}
}
