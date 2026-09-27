/**
 * 程序化像素绘制(Phase 1 过渡方案,Phase 2 换 spritesheet)。
 * 所有造型均为本项目原创设计:骑士「澜」、菇灵、训练木桩。
 * 约定:锚点在脚底中心;p = 一个逻辑像素的世界像素数(3 → 48px/16格)。
 */

const P = 3;

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
