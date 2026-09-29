/**
 * 程序化像素绘制(Phase 1 过渡方案,Phase 2 换 spritesheet)。
 * 所有造型均为本项目原创设计:骑士「澜」、菇灵、训练木桩。
 * 约定:锚点在脚底中心;p = 一个逻辑像素的世界像素数(3 → 48px/16格)。
 */

import { sprites } from '@engine/render/Sprites';
import { drawSprite } from './spriteDraw';

const P = 3;

/** 四系元素图标贴图(第三批美术);未加载时调用方回退程序化色块。 */
export const ELEMENT_SPRITE = {
  fire: 'elem_fire',
  ice: 'elem_ice',
  bolt: 'elem_lightning',
  toxin: 'elem_poison',
} as const;

export type ElementKey = keyof typeof ELEMENT_SPRITE;

/**
 * 居中绘制元素图标(size = 目标高 px)。
 * 返回 false = 贴图未就绪,调用方走色块回退。
 */
export function drawElementIcon(
  ctx: CanvasRenderingContext2D,
  el: string,
  x: number,
  y: number,
  size = 16,
  alpha = 1,
): boolean {
  const name = ELEMENT_SPRITE[el as ElementKey];
  if (!name) return false;
  const img = sprites.get(name);
  if (!img) return false;
  const s = size / img.height;
  const w = img.width * s;
  const h = img.height * s;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
  ctx.restore();
  return true;
}

function px(ctx: CanvasRenderingContext2D, c: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function drawShadow(ctx: CanvasRenderingContext2D, x: number, y: number, rw: number): void {
  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#0a0d14';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, rw, rw * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export interface KnightPose {
  t: number; // 动画钟
  moving: boolean;
  faceLeft: boolean;
  attackStage: number; // 0=无
  attackProg: number; // 0..1
  dashing: boolean;
  flash: number; // >0 受击闪白
  invuln: boolean;
}

/** 原创主角「澜」:靛蓝披风 + 钢甲 + 橙羽盔 */
export function drawKnight(ctx: CanvasRenderingContext2D, x: number, y: number, pose: KnightPose): void {
  const f = pose.flash > 0;
  const c = (n: string): string => (f ? '#ffffff' : n);
  const bob = pose.moving ? Math.sin(pose.t * 14) * 1.5 : Math.sin(pose.t * 3) * 0.8;
  const legSwing = pose.moving ? Math.sin(pose.t * 14) * 2.5 : 0;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (pose.faceLeft) ctx.scale(-1, 1);
  if (pose.invuln) ctx.globalAlpha = 0.55 + 0.35 * Math.sin(pose.t * 30);
  if (pose.dashing) ctx.rotate(0.18);

  const top = -13 * P + bob; // 头顶基准

  // 披风(靛蓝,随移动飘)
  const capeW = pose.moving ? 5 : 4;
  px(ctx, c('#2c3a75'), -4 * P - legSwing * 0.6, top + 4 * P, capeW * P, 7 * P);
  px(ctx, c('#3b4a8f'), -3.4 * P - legSwing * 0.6, top + 4 * P, capeW * P * 0.6, 6 * P);

  // 腿(交替摆动)
  px(ctx, c('#4a5568'), -2 * P + legSwing, -3 * P, 1.8 * P, 3 * P);
  px(ctx, c('#4a5568'), 0.5 * P - legSwing, -3 * P, 1.8 * P, 3 * P);
  px(ctx, c('#2f3745'), -2 * P + legSwing, -1 * P, 1.8 * P, 1 * P); // 靴
  px(ctx, c('#2f3745'), 0.5 * P - legSwing, -1 * P, 1.8 * P, 1 * P);

  // 躯干钢甲
  px(ctx, c('#8fa2ba'), -2.6 * P, top + 5 * P, 5.4 * P, 5 * P);
  px(ctx, c('#aab7c9'), -2.6 * P, top + 5 * P, 5.4 * P, 2 * P); // 胸口高光
  px(ctx, c('#5f6f85'), -2.6 * P, top + 9 * P, 5.4 * P, 1 * P); // 甲缘阴影
  px(ctx, c('#7a4a21'), -2.6 * P, top + 8 * P, 5.4 * P, 1 * P); // 腰带
  px(ctx, c('#f2a33c'), 0.2 * P, top + 8 * P, 1 * P, 1 * P); // 带扣

  // 头盔
  px(ctx, c('#c6d2e0'), -2.2 * P, top, 4.6 * P, 5 * P);
  px(ctx, c('#9db2c7'), -2.2 * P, top + 3.6 * P, 4.6 * P, 1.4 * P);
  px(ctx, c('#1d2430'), -0.4 * P, top + 2 * P, 2.6 * P, 1.2 * P); // 面甲缝
  px(ctx, c('#f2a33c'), -1.2 * P, top - 1.2 * P, 3 * P, 1.2 * P); // 橙羽
  px(ctx, c('#d98a2b'), 1 * P, top - 0.6 * P, 1.4 * P, 0.8 * P);

  // 剑(攻击时挥动,平时背持)
  ctx.save();
  const swing = swingAngle(pose.attackStage, pose.attackProg);
  ctx.translate(2 * P, top + 6 * P);
  ctx.rotate(swing);
  px(ctx, c('#7a4a21'), 0, -0.7 * P, 2 * P, 1.4 * P); // 柄
  px(ctx, c('#f2a33c'), 2 * P, -1.2 * P, 1 * P, 2.4 * P); // 护手
  px(ctx, c('#dfe8f2'), 3 * P, -0.8 * P, 7 * P, 1.6 * P); // 刃
  px(ctx, c('#ffffff'), 3 * P, -0.8 * P, 7 * P, 0.6 * P); // 刃口高光
  ctx.restore();

  ctx.restore();
}

/** 攻击各段的剑姿:一段横斩 → 二段回斩 → 三段突刺 */
function swingAngle(stage: number, prog: number): number {
  if (stage === 1) return lerp(-1.6, 0.9, ease(prog));
  if (stage === 2) return lerp(1.2, -1.4, ease(prog));
  if (stage === 3) return lerp(-0.2, 0.05, ease(prog)); // 突刺基本持平
  return -0.9; // 待机持剑
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 原创杂兵「菇灵」:苔绿菌盖 + 奶油菌柄 + 豆豆眼 */
export function drawShroomling(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  flash: number,
  chasing: boolean,
): void {
  const f = flash > 0;
  const c = (n: string): string => (f ? '#ffffff' : n);
  const squash = 1 + Math.sin(t * (chasing ? 16 : 8)) * 0.08;
  const hop = Math.abs(Math.sin(t * (chasing ? 16 : 8))) * 3;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - hop));
  ctx.scale(1 / squash, squash);

  // 菌柄
  px(ctx, c('#e8dcc0'), -2 * P, -4 * P, 4 * P, 4 * P);
  px(ctx, c('#cbbfa3'), -2 * P, -1.4 * P, 4 * P, 1.4 * P);
  // 眼睛(追击时眯起)
  if (chasing) {
    px(ctx, c('#1d2430'), -1.4 * P, -3.4 * P, 1.2 * P, 0.5 * P);
    px(ctx, c('#1d2430'), 0.4 * P, -3.4 * P, 1.2 * P, 0.5 * P);
  } else {
    px(ctx, c('#1d2430'), -1.2 * P, -3.4 * P, 0.8 * P, 1 * P);
    px(ctx, c('#1d2430'), 0.6 * P, -3.4 * P, 0.8 * P, 1 * P);
  }
  // 菌盖(苔绿 + 深斑)
  px(ctx, c('#4faf5c'), -3.2 * P, -7 * P, 6.4 * P, 3.2 * P);
  px(ctx, c('#5fd068'), -3.2 * P, -7 * P, 6.4 * P, 1.2 * P);
  px(ctx, c('#2e7d4f'), -2.2 * P, -6 * P, 1.2 * P, 1 * P);
  px(ctx, c('#2e7d4f'), 1 * P, -6.6 * P, 1 * P, 0.8 * P);
  px(ctx, c('#2e7d4f'), -0.4 * P, -5.2 * P, 0.9 * P, 0.7 * P);

  ctx.restore();
}

/** 训练木桩:木桩 + 横杆 + 草垛头 + 靶环 */
export function drawDummy(ctx: CanvasRenderingContext2D, x: number, y: number, wobble: number, phase: number): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (wobble > 0.01) ctx.rotate(Math.sin(phase) * wobble * 0.12);

  px(ctx, '#6b4a2a', -1.2 * P, -9 * P, 2.4 * P, 9 * P); // 主桩
  px(ctx, '#54371e', -1.2 * P, -9 * P, 0.8 * P, 9 * P); // 阴影侧
  px(ctx, '#6b4a2a', -4.5 * P, -7.4 * P, 9 * P, 1.6 * P); // 横杆
  px(ctx, '#54371e', -4.5 * P, -6.6 * P, 9 * P, 0.8 * P);
  // 草垛头
  px(ctx, '#d9b45b', -2.2 * P, -12.6 * P, 4.4 * P, 3.6 * P);
  px(ctx, '#b8933e', -2.2 * P, -10.2 * P, 4.4 * P, 1.2 * P);
  // 靶环
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = P * 0.7;
  ctx.beginPath();
  ctx.arc(0, -4.5 * P, 1.6 * P, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(0, -4.5 * P, 0.6 * P, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** 原创飞行杂兵「风蜂」:青绿绒球身 + 双翼快闪 + 蓄力时发红 */
export function drawWindBee(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  flash: number,
  telegraphing: boolean,
): void {
  const f = flash > 0;
  const c = (n: string): string => (f ? '#ffffff' : n);
  const hover = Math.sin(t * 6) * 3;
  const wingFlap = Math.sin(t * 40) > 0;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - 22 + hover));
  if (telegraphing) ctx.translate((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3);

  // 双翼(快闪)
  ctx.globalAlpha = 0.7;
  px(ctx, c('#cfe8ef'), -3.4 * P, wingFlap ? -2.4 * P : -1.8 * P, 2 * P, 1.2 * P);
  px(ctx, c('#cfe8ef'), 1.4 * P, wingFlap ? -2.4 * P : -1.8 * P, 2 * P, 1.2 * P);
  ctx.globalAlpha = 1;
  // 身体(青绿绒球 + 深条纹)
  px(ctx, c(telegraphing ? '#d97b5f' : '#68c2a8'), -1.8 * P, -1.6 * P, 3.6 * P, 3 * P);
  px(ctx, c('#3f8a74'), -1.8 * P, -0.4 * P, 3.6 * P, 0.7 * P);
  // 眼
  px(ctx, c('#1d2430'), -1 * P, -1 * P, 0.7 * P, 0.7 * P);
  px(ctx, c('#1d2430'), 0.4 * P, -1 * P, 0.7 * P, 0.7 * P);
  // 尾刺
  px(ctx, c('#e8dcc0'), -0.4 * P, 1.4 * P, 0.8 * P, 1 * P);
  ctx.restore();
}

/** 原创精英「蚀化狼」:紫灰长躯 + 蚀纹 + 低吼时橙眼 */
export function drawBlightWolf(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  flash: number,
  faceLeft: boolean,
  growling: boolean,
  pouncing: boolean,
): void {
  const f = flash > 0;
  const c = (n: string): string => (f ? '#ffffff' : n);
  const run = Math.sin(t * 16) * 2;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (faceLeft) ctx.scale(-1, 1);
  if (pouncing) ctx.rotate(-0.12);

  // 腿(奔跑摆动)
  px(ctx, c('#4a4060'), -4 * P + run, -2.5 * P, 1.2 * P, 2.5 * P);
  px(ctx, c('#4a4060'), -1.5 * P - run, -2.5 * P, 1.2 * P, 2.5 * P);
  px(ctx, c('#4a4060'), 1 * P + run, -2.5 * P, 1.2 * P, 2.5 * P);
  px(ctx, c('#4a4060'), 3 * P - run, -2.5 * P, 1.2 * P, 2.5 * P);
  // 躯干(紫灰 + 背脊蚀纹)
  px(ctx, c('#6b5b8f'), -5 * P, -6 * P, 9.6 * P, 3.6 * P);
  px(ctx, c('#584a78'), -5 * P, -3.4 * P, 9.6 * P, 1 * P);
  px(ctx, c('#8f7bb8'), -3.5 * P, -6.6 * P, 1.4 * P, 0.8 * P);
  px(ctx, c('#8f7bb8'), -1 * P, -6.8 * P, 1.4 * P, 1 * P);
  px(ctx, c('#8f7bb8'), 1.5 * P, -6.6 * P, 1.4 * P, 0.8 * P);
  // 尾
  px(ctx, c('#584a78'), -6.6 * P, -5.8 * P, 1.8 * P, 1.2 * P);
  // 头
  px(ctx, c('#6b5b8f'), 3.6 * P, -7.2 * P, 3.4 * P, 3 * P);
  px(ctx, c('#584a78'), 6 * P, -6 * P, 1.6 * P, 1.4 * P); // 吻部
  px(ctx, c('#4a4060'), 3.8 * P, -8 * P, 1 * P, 1 * P); // 耳
  px(ctx, c('#4a4060'), 5.2 * P, -8 * P, 1 * P, 1 * P);
  // 眼(低吼时橙色发亮)
  px(ctx, c(growling ? '#f2a33c' : '#7fd8e8'), 4.6 * P, -6.6 * P, 1 * P, 0.7 * P);

  ctx.restore();
}

/** 原创炮台怪「荆棘藤妖」:多刺藤球 + 摆动触须 + 施法时张开 */
export function drawThornVine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  flash: number,
  casting: boolean,
): void {
  const f = flash > 0;
  const c = (n: string): string => (f ? '#ffffff' : n);
  const sway = Math.sin(t * 3) * 2;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));

  // 触须(左右摆动,施法时立起)
  const lift = casting ? -3 : 0;
  px(ctx, c('#3f7a3a'), -4 * P + sway, -8 * P + lift, 1.2 * P, 4 * P);
  px(ctx, c('#3f7a3a'), 3 * P - sway, -8.6 * P + lift, 1.2 * P, 4.6 * P);
  px(ctx, c('#3f7a3a'), -0.5 * P + sway * 0.5, -9.4 * P + lift, 1.2 * P, 3 * P);
  // 藤球本体
  px(ctx, c('#4f8a44'), -3.4 * P, -5.4 * P, 6.8 * P, 5 * P);
  px(ctx, c('#63a854'), -3.4 * P, -5.4 * P, 6.8 * P, 1.6 * P);
  // 尖刺
  px(ctx, c('#2e5c2a'), -3.9 * P, -4 * P, 1 * P, 1 * P);
  px(ctx, c('#2e5c2a'), 3 * P, -4.4 * P, 1 * P, 1 * P);
  px(ctx, c('#2e5c2a'), -1 * P, -6 * P, 1 * P, 1 * P);
  // 核心眼(施法时发亮)
  px(ctx, c(casting ? '#f2e05f' : '#1d2430'), -0.8 * P, -3.8 * P, 1.6 * P, 1.2 * P);
  // 根须底座
  px(ctx, c('#54371e'), -2.6 * P, -0.8 * P, 5.2 * P, 0.8 * P);

  ctx.restore();
}

/** 原创精英「橡木傀儡」:粗壮木躯 + 苔藓肩甲 + 蓄力时高举双臂;背部有裂纹弱点 */
export function drawOakGolem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  flash: number,
  faceLeft: boolean,
  windup: boolean,
): void {
  const f = flash > 0;
  const c = (n: string): string => (f ? '#ffffff' : n);
  const stomp = Math.sin(t * 5) * 1.5;

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  if (faceLeft) ctx.scale(-1, 1);

  // 腿
  px(ctx, c('#5c4326'), -3.4 * P, -3.5 * P, 2.4 * P, 3.5 * P);
  px(ctx, c('#5c4326'), 1 * P, -3.5 * P, 2.4 * P, 3.5 * P);
  // 躯干(粗木 + 年轮)
  px(ctx, c('#7a5a33'), -4.4 * P, -11 * P + stomp * 0.4, 8.8 * P, 8 * P);
  px(ctx, c('#8f6c40'), -4.4 * P, -11 * P + stomp * 0.4, 8.8 * P, 2.4 * P);
  px(ctx, c('#5c4326'), -1.4 * P, -8 * P, 2.8 * P, 2.2 * P); // 年轮芯
  px(ctx, c('#4a3620'), -0.7 * P, -7.4 * P, 1.4 * P, 1 * P);
  // 背部裂纹弱点(朝后,提示绕背 ×2)
  px(ctx, c('#f2a33c'), -4.4 * P, -9 * P, 0.8 * P, 3 * P);
  // 苔藓肩
  px(ctx, c('#4f8a44'), -5.2 * P, -12 * P + stomp * 0.4, 3 * P, 2 * P);
  px(ctx, c('#4f8a44'), 2.2 * P, -12 * P + stomp * 0.4, 3 * P, 2 * P);
  // 手臂(蓄力时高举)
  const armY = windup ? -14 * P : -9.5 * P;
  px(ctx, c('#6b4e2c'), -6.4 * P, armY, 2 * P, windup ? 5 * P : 5.5 * P);
  px(ctx, c('#6b4e2c'), 4.4 * P, armY, 2 * P, windup ? 5 * P : 5.5 * P);
  // 头(小,嵌在躯干顶)
  px(ctx, c('#8f6c40'), -1.8 * P, -13.4 * P + stomp * 0.4, 3.6 * P, 2.6 * P);
  px(ctx, c(windup ? '#e05f5f' : '#7fd8e8'), -1 * P, -12.6 * P + stomp * 0.4, 0.8 * P, 0.7 * P);
  px(ctx, c(windup ? '#e05f5f' : '#7fd8e8'), 0.4 * P, -12.6 * P + stomp * 0.4, 0.8 * P, 0.7 * P);

  ctx.restore();
}

/** 原创 Boss「腐木巨像·南弥尔」:巨型朽木巨像 + 蚀化核心 + 苔冠 */
export function drawBossNanmir(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  flash: number,
  faceLeft: boolean,
  phase: number,
  staggered: boolean,
): void {
  const f = flash > 0;
  const c = (n: string): string => (f ? '#ffffff' : n);
  const breathe = Math.sin(t * 2.2) * 2;
  const S = 1.9; // 体型放大

  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(faceLeft ? -S : S, S);
  if (staggered) ctx.rotate(0.1);

  // 腿
  px(ctx, c('#4a3620'), -4 * P, -4 * P, 3 * P, 4 * P);
  px(ctx, c('#4a3620'), 1.4 * P, -4 * P, 3 * P, 4 * P);
  // 躯干(朽木 + 裂纹)
  px(ctx, c('#5c4326'), -5.6 * P, -13 * P + breathe * 0.3, 11.2 * P, 9.4 * P);
  px(ctx, c('#6f5230'), -5.6 * P, -13 * P + breathe * 0.3, 11.2 * P, 2.6 * P);
  px(ctx, c('#3a2a18'), -3 * P, -10 * P, 1 * P, 4 * P);
  px(ctx, c('#3a2a18'), 2.2 * P, -11 * P, 1 * P, 3 * P);
  // 蚀化核心(阶段越高越亮/变色)
  const coreColor = staggered ? '#ffd94f' : phase === 3 ? '#e05f5f' : phase === 2 ? '#b880e8' : '#7fd8e8';
  const pulse = 0.75 + 0.25 * Math.sin(t * (2 + phase));
  ctx.globalAlpha = pulse;
  px(ctx, c(coreColor), -1.4 * P, -9.4 * P, 2.8 * P, 2.8 * P);
  ctx.globalAlpha = 1;
  // 巨臂
  px(ctx, c('#4a3620'), -8.4 * P, -12 * P + breathe * 0.5, 2.8 * P, 8 * P);
  px(ctx, c('#4a3620'), 5.6 * P, -12 * P + breathe * 0.5, 2.8 * P, 8 * P);
  px(ctx, c('#5c4326'), -8.8 * P, -5 * P, 3.6 * P, 2.4 * P); // 拳
  px(ctx, c('#5c4326'), 5.2 * P, -5 * P, 3.6 * P, 2.4 * P);
  // 头 + 苔冠
  px(ctx, c('#6f5230'), -2.6 * P, -16 * P + breathe * 0.3, 5.2 * P, 3.4 * P);
  px(ctx, c('#4f8a44'), -3.4 * P, -17.4 * P + breathe * 0.3, 6.8 * P, 1.8 * P);
  px(ctx, c('#63a854'), -2 * P, -18.4 * P + breathe * 0.3, 1.4 * P, 1.2 * P);
  px(ctx, c('#63a854'), 1 * P, -18.2 * P + breathe * 0.3, 1.2 * P, 1 * P);
  // 眼
  px(ctx, c(coreColor), -1.6 * P, -15 * P, 1.2 * P, 0.9 * P);
  px(ctx, c(coreColor), 0.6 * P, -15 * P, 1.2 * P, 0.9 * P);

  ctx.restore();
}

/** 房间出口传送门:石拱门贴图 + 类型色门内辉光(贴图未就绪走程序化旋涡光环) */
export function drawPortal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  color: string,
  label: string,
): void {
  ctx.save();
  if (drawSprite(ctx, 'portal_gate', x, y, { scale: 1 })) {
    // 门内旋涡按类型色发光(叠加,保留「这是什么门」的可读性)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.34 + 0.14 * Math.sin(t * 3.4);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y - 38, 20, 27, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 地面光晕
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t * 2.2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y, 34, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.translate(Math.round(x), Math.round(y));
    for (let i = 0; i < 3; i++) {
      const a = t * (1.5 + i * 0.5) + (i * Math.PI * 2) / 3;
      const r = 16 - i * 3;
      ctx.globalAlpha = 0.5 - i * 0.1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3 - i * 0.6;
      ctx.beginPath();
      ctx.ellipse(0, -14, r, r * 1.4, a * 0.2, a, a + Math.PI * 1.4);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 4);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -14, 11, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#0d0f1a';
  ctx.strokeText(label, x, y - 96);
  ctx.fillStyle = color;
  ctx.fillText(label, x, y - 96);
  ctx.restore();
}

/** 掉落物:装备箱(稀有度光柱)/ 星尘 / 药剂 */
export function drawPickup(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: 'item' | 'stardust' | 'potion' | 'rune',
  color: string,
  bobPhase: number,
  glyph?: string,
): void {
  const bob = Math.sin(bobPhase) * 3;

  // 装备拾取:稀有度光柱(贴图/程序化箱体共用)
  if (kind === 'item') {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y - 8 + bob));
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(bobPhase * 1.5);
    const grad = ctx.createLinearGradient(0, -34, 0, 0);
    grad.addColorStop(0, color + '00');
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillRect(-5, -34, 10, 34);
    ctx.restore();
    if (drawSprite(ctx, 'pickup_chest', x, y + bob - 2, { scale: 1 })) return;
  }

  // 符文石:元素辉光 + 贴图
  if (kind === 'rune') {
    ctx.save();
    ctx.globalAlpha = (0.7 + 0.3 * Math.sin(bobPhase * 2)) * 0.32;
    ctx.fillStyle = '#B067E8';
    ctx.beginPath();
    ctx.arc(x, y - 12 + bob, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (drawSprite(ctx, 'pickup_rune', x, y + bob, { scale: 1 })) return;
  }

  if (kind === 'stardust' && drawSprite(ctx, 'pickup_stardust', x, y + bob, { scale: 1 })) return;
  if (kind === 'potion' && drawSprite(ctx, 'pickup_potion', x, y + bob, { scale: 1 })) return;

  // ------- 程序化回退(贴图未加载) -------
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - 8 + bob));

  if (kind === 'rune') {
    // 符文石:菱形 + 元素辉光
    const tw = 0.7 + 0.3 * Math.sin(bobPhase * 2);
    ctx.globalAlpha = 0.35 * tw;
    ctx.fillStyle = '#B067E8';
    ctx.beginPath();
    ctx.arc(0, -4, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#B067E8';
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-5, -9, 10, 10);
    ctx.restore();
    ctx.fillStyle = '#e8d5f7';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('◈', 0, -1);
    ctx.restore();
    return;
  }

  if (kind === 'stardust') {
    const tw = 0.6 + 0.4 * Math.sin(bobPhase * 2);
    ctx.globalAlpha = tw;
    px(ctx, '#f2d98c', -2, -2, 4, 4);
    px(ctx, '#ffffff', -1, -1, 2, 2);
    ctx.restore();
    return;
  }

  if (kind === 'potion') {
    px(ctx, '#c94f4f', -3, -7, 6, 7);
    px(ctx, '#e07a7a', -3, -7, 2, 5);
    px(ctx, '#8a6b1f', -1.5, -10, 3, 3);
    ctx.restore();
    return;
  }

  // 装备(回退):色块箱 + 稀有度描边
  px(ctx, '#1a1f30', -7, -8, 14, 12);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(-7, -8, 14, 12);
  if (glyph) {
    ctx.fillStyle = color;
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(glyph, 0, 1);
  }
  ctx.restore();
}

/** 挥砍弧光(扇形楔 + 锐利前缘) */
export function drawSlashArc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  stage: number,
  prog: number,
  rangePx: number,
  arcRad: number,
): void {
  const alpha = (1 - prog) * 0.55;
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y - 14); // 略抬到腰部高度
  ctx.rotate(angle);
  const grow = 0.55 + 0.45 * Math.min(prog * 3, 1);
  const r = rangePx * grow;
  const half = arcRad / 2;
  const color = stage === 3 ? '#ffd94f' : '#dfe8f2';

  ctx.globalAlpha = alpha;
  const grad = ctx.createRadialGradient(0, 0, r * 0.25, 0, 0, r);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.7, color + 'aa');
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, -half, half);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = alpha * 1.6;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, r, -half, half);
  ctx.stroke();
  ctx.restore();
}
