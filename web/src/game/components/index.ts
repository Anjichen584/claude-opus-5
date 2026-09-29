/** 组件 = 纯数据。所有逻辑在 systems/ 中。 */

/** 四系元素(docs/01-GDD.md §6) */
export type Element = 'fire' | 'ice' | 'bolt' | 'toxin';

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
    public def = 0,
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
  dashSpeedPx = 0; // 本次位移速度(翻滚/技能突进各不同)
  ghostAccum = 0;
  // 无敌帧
  iframes = 0;
  // 瞄准(世界坐标方向)
  aimX = 1;
  aimY = 0;
  // 技能冷却与怒气(Phase 2)
  cdQ = 0;
  cdE = 0;
  cdR = 0;
  rage = 0; // 0..100,命中积攒
  // 装备派生属性(Phase 3,由 loot/Equip.ts recompute 写入)
  cdr = 0; // 冷却缩减 0..0.4
  elemDmg = 0; // 元素伤害加成(小数)
  pickupRadiusM = 0.8;
  specials: string[] = []; // 橙装特效 id 列表
  fireTrailAccum = 0;
  // 资源(Phase 3)
  stardust = 0;
  potionCharges = 1;
  /** 职业(影响普攻形态/技能表/基础属性乘区) */
  klass: 'blade' | 'ranger' | 'arcanist' | 'warden' = 'blade';
  /** 局内事件加成(秘境房):recompute 时应用 */
  runBuffAtk = 0;
  runBuffSpeed = 0;
  runHpMult = 1;
  /** 符文背包(符文 id 列表)与镶嵌表(技能id → 符文id) */
  runeBag: string[] = [];
  equippedRunes: Record<string, string> = {};
  // 恢复与死亡
  regenDelay = 0;
  deaths = 0;
  respawnT = 0;
  // 动画钟
  animT = 0;
  moving = false;
}

/** 元素印记(挂在可受击目标上,4s 过期;不同元素二次命中触发连锁) */
export class ElementMarks {
  marks: Partial<Record<Element, number>> = {};
}

/** 简易 Buff/Debuff 计时器(Phase 2 精简版,Phase 3 泛化为词条化 Buff 表) */
export class Buffs {
  stunT = 0;
  slowT = 0;
  slowPct = 0;
  /** 脆蚀:受到伤害 +25% */
  vulnT = 0;
}

/** 地面区域(火焰地带/毒云/孢子雾…):按间隔对敌对阵营跳伤害 */
export class Zone {
  tickT = 0;
  constructor(
    public radiusPx: number,
    public life: number,
    public interval: number,
    public atk: number,
    public mult: number,
    public element: Element | null,
    public team: Team,
    public color: string,
  ) {}
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

/** 地上掉落物 */
export class Pickup {
  vx = 0;
  vy = 0;
  restT = 0.35; // 弹出落地时间,期间不可拾取
  bobPhase = Math.random() * Math.PI * 2;
  magnet = false;

  constructor(
    public kind: 'item' | 'stardust' | 'potion' | 'rune',
    public item: import('@game/loot/Items').Item | null = null,
    public value = 0,
    public runeId: string | null = null,
  ) {}
}

/** 背包(玩家) */
export class Inventory {
  items: Array<import('@game/loot/Items').Item> = [];
}

/** 已穿戴装备(玩家) */
export class Equipment {
  slots: Partial<Record<import('@game/loot/Items').Slot, import('@game/loot/Items').Item>> = {};
}

/** 风蜂:环绕 → 预警 → 俯冲 */
export class WindBee {
  state: 'orbit' | 'telegraph' | 'dive' = 'orbit';
  t = 0;
  angle = Math.random() * Math.PI * 2;
  orbitDir = Math.random() < 0.5 ? 1 : -1;
  nextDiveT = 2 + Math.random() * 1.5;
  diveVx = 0;
  diveVy = 0;
  touchCd = 0;
  animT = Math.random() * 10;
  kx = 0;
  ky = 0;
}

/** 蚀化狼:游走绕圈 → 低吼预警 → 扑击 → 硬直 */
export class BlightWolf {
  state: 'circle' | 'growl' | 'pounce' | 'recover' = 'circle';
  t = 0;
  circleT = 2 + Math.random() * 2;
  dir = Math.random() < 0.5 ? 1 : -1;
  pounceVx = 0;
  pounceVy = 0;
  touchCd = 0;
  animT = Math.random() * 10;
  kx = 0;
  ky = 0;
}

/** 荆棘藤妖:固定炮台,在玩家脚下召唤预警地刺 */
export class ThornVine {
  state: 'idle' | 'telegraph' = 'idle';
  t = 1 + Math.random();
  animT = Math.random() * 10;
}

/** 橡木傀儡:缓慢逼近 + 拍地 AOE,背部弱点 ×2 */
export class OakGolem {
  state: 'chase' | 'windup' | 'recover' = 'chase';
  t = 0;
  slamCd = 1.5;
  animT = Math.random() * 10;
  kx = 0;
  ky = 0;
}

/** Boss 腐木巨像·南弥尔:三阶段状态机(BossSystem 驱动) */
export class BossNanmir {
  phase: 1 | 2 | 3 = 1;
  state: 'idle' | 'cast' | 'stagger' = 'idle';
  t = 1.0;
  attackIdx = 0;
  animT = 0;
}

/** 房间出口传送门 */
export class Portal {
  animT = Math.random() * 10;
  constructor(public kind: 'battle' | 'treasure' | 'elite' | 'boss' | 'shop' | 'event') {}
}

/** 预警打击:地面警示圈倒计时 → 一次性爆发伤害(Boss/藤妖/傀儡通用) */
export class TelegraphStrike {
  t: number;
  constructor(
    public total: number,
    public radiusPx: number,
    public atk: number,
    public mult: number,
    public team: Team,
    public color: string,
  ) {
    this.t = total;
  }
}

// ---------- 帧内事件 ----------

/** 通用提示飘字(拾取/治疗/保底等) */
/** 烬火小鬼:漂浮拉开距离,吐火球(火印记远程) */
export class EmberImp {
  state: 'drift' | 'aim' | 'recover' = 'drift';
  t = 0;
  cd = 1.2;
  animT = Math.random() * 10;
  strafeDir = Math.random() < 0.5 ? 1 : -1;
}

/** 霜核史莱姆:跳跃逼近,接触冰印记;死亡分裂成2只小史莱姆 */
export class FrostSlime {
  hopT = 0;
  cdT = Math.random() * 0.8;
  contactCd = 0;
  animT = Math.random() * 10;

  constructor(
    /** 2=大只(死亡分裂), 1=分裂出的小只 */
    public size: 1 | 2 = 2,
  ) {}
}

/** 雷纹蜥:游走→抖动预警→高速冲撞(雷印记) */
export class SparkLizard {
  state: 'skitter' | 'telegraph' | 'dash' = 'skitter';
  t = 0;
  cd = 1.5;
  contactCd = 0;
  dashX = 0;
  dashY = 0;
  animT = Math.random() * 10;
  zigDir = Math.random() < 0.5 ? 1 : -1;
}

/** 毒沼蟾:蛙跳逼近,朝玩家吐毒沼(毒区域) */
export class ToxinToad {
  state: 'idle' | 'hop' | 'aim' = 'idle';
  t = 0;
  lobCd = 1.5;
  hopCd = 0.6;
  contactCd = 0;
  animT = Math.random() * 10;
}

/** 星尘精灵:稀有逃跑怪,击杀掉大量星尘,超时消失 */
export class StardustSprite {
  lifeT: number;
  animT = Math.random() * 10;

  constructor(lifeS: number) {
    this.lifeT = lifeS;
  }
}

/** 弹幕(敌我通用):直线飞行,命中对立阵营结算 */
export class Projectile {
  constructor(
    public team: Team,
    public atk: number,
    public mult: number,
    public element: Element | null,
    public radiusPx: number,
    public lifeS: number,
    public color: string,
    /** 渲染形态:光球 / 箭矢(沿速度方向) */
    public shape: 'orb' | 'arrow' = 'orb',
  ) {}

  /** >0 时追踪最近敌人(弧度/秒转向速率) */
  homing = 0;
}

/** 场景物件:树/岩石可碰撞且**可被打穿**(有耐久),灌木纯装饰 */
export class PropObstacle {
  /** 剩余耐久(<=0 且 broken 才作数;灌木恒 0) */
  hp = 0;
  /** 已碎裂:不再阻挡,只剩碎屑贴图 */
  broken = false;
  /** 被击中时的抖动计时(渲染用) */
  shakeT = 0;

  constructor(public kind: 'tree' | 'rock' | 'bush') {}
}

/** 商店摊位(商店房):走近按 F 购买 */
export class ShopStand {
  sold = false;
  animT = Math.random() * 10;

  constructor(
    public wares: 'item' | 'potion' | 'rune',
    public price: number,
    public item: import('@game/loot/Items').Item | null = null,
    public runeId: string | null = null,
  ) {}
}

/** 秘境房图腾:三选一事件(选中一个后全部失效) */
export class EventTotem {
  used = false;
  animT = Math.random() * 10;

  constructor(public kind: 'blood' | 'blessing' | 'fountain') {}
}

/** ===== 第二章「霜语冰原」怪物 ===== */

/** 雪绒球:滚动冲撞的蓬松雪球(冰接触) */
export class SnowPuff {
  rollT = 0;
  cdT = Math.random() * 1.2;
  contactCd = 0;
  animT = Math.random() * 10;
}

/** 冰壳龟:正面减伤,周期性旋壳冲撞 */
export class IceTurtle {
  state: 'crawl' | 'telegraph' | 'spin' = 'crawl';
  t = 0;
  cd = 2.0;
  contactCd = 0;
  spinX = 0;
  spinY = 0;
  animT = Math.random() * 10;
}

/** 风雪隼:悬空盘旋 → 俯冲直线突袭 */
export class BlizzardHawk {
  state: 'hover' | 'telegraph' | 'dive' = 'hover';
  t = 0;
  cd = 1.4;
  contactCd = 0;
  diveX = 0;
  diveY = 0;
  animT = Math.random() * 10;
  circleDir = Math.random() < 0.5 ? 1 : -1;
}

/** 霜语法师:风筝远程,吟唱冰弹 */
export class FrostMage {
  state: 'drift' | 'aim' | 'recover' = 'drift';
  t = 0;
  cd = 1.5;
  animT = Math.random() * 10;
  strafeDir = Math.random() < 0.5 ? 1 : -1;
}

/** 第二章 Boss:霜语女妖·薇尔莎(三阶段:冰弹环/暴风雪+召唤/冲锋强化) */
export class BossVelsha {
  phase: 1 | 2 | 3 = 1;
  state: 'float' | 'chargeTele' | 'charge' = 'float';
  t = 0;
  volleyCd = 2.0;
  blizzardCd = 5.0;
  summonCd = 6.0;
  chargeCd = 7.0;
  dashX = 0;
  dashY = 0;
  animT = 0;
}

/** ===== 第三章「烬语荒漠」怪物 ===== */

/** 烬鼠:高速 Z 字贴脸群怪 */
export class CinderRat {
  contactCd = 0;
  animT = Math.random() * 10;
  zigDir = Math.random() < 0.5 ? 1 : -1;
}

/** 沙暴甲虫:钻地移动 → 脚下预警钻出 AOE → 地面追击 */
export class DuneBeetle {
  state: 'burrow' | 'telegraph' | 'surface' = 'burrow';
  t = 0;
  contactCd = 0;
  animT = Math.random() * 10;
}

/** 火舞妖:短距瞬跳走位 + 双火球 */
export class FlameDancer {
  state: 'drift' | 'aim' | 'recover' = 'drift';
  t = 0;
  cd = 1.4;
  hopCd = 1.8;
  animT = Math.random() * 10;
  strafeDir = Math.random() < 0.5 ? 1 : -1;
}

/** 岩尾蝎:蝎尾抛毒沼 + 蟹步逼近 */
export class DustStinger {
  state: 'idle' | 'hop' | 'aim' = 'idle';
  t = 0;
  lobCd = 1.6;
  hopCd = 0.5;
  contactCd = 0;
  animT = Math.random() * 10;
}

/** 第三章 Boss:熔核蝎皇·卡兹拉(火弹散射/钻地突袭/熔痕/召唤烬鼠) */
export class BossKazra {
  phase: 1 | 2 | 3 = 1;
  state: 'walk' | 'burrowing' | 'emergeTele' = 'walk';
  t = 0;
  volleyCd = 2.0;
  burrowCd = 5.0;
  summonCd = 7.0;
  trailT = 0;
  divesLeft = 0;
  animT = 0;
}

/** 星陨营地功能建筑(F 交互) */
export class CampStation {
  animT = Math.random() * 10;

  constructor(
    public kind: 'expedition' | 'altar' | 'forge' | 'classpick' | 'daily' | 'codex' | 'achv',
    public label: string,
    public icon: string,
  ) {}
}

export class ToastEvent {
  constructor(public text: string, public color: string) {}
}

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
    public element: Element | null = null,
    public knockbackM = 0,
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
    public element: Element | null = null,
  ) {}
}

export class KillEvent {
  constructor(public x: number, public y: number, public kind = '') {}
}

/** 元素连锁反应触发(反馈:大字/爆光/音效) */
export class ReactionEvent {
  constructor(
    public x: number,
    public y: number,
    public name: string,
    public color: string,
    /** 触发本次连锁的两种元素(用于两枚元素图标交汇演出) */
    public elA: string | null = null,
    public elB: string | null = null,
  ) {}
}

/** 天降剑/落雷类柱状特效 */
export class BeamFxEvent {
  constructor(public x: number, public y: number, public color: string) {}
}

/** 扩散环特效(爆炸/残影引爆) */
export class RingFxEvent {
  constructor(public x: number, public y: number, public radiusPx: number, public color: string) {}
}

/** 程序化音效请求 */
export class SfxEvent {
  constructor(public kind: string) {}
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
