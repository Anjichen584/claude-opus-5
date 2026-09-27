/**
 * 星陨骑士 · 序章 — 入口
 *
 * ⚠ Phase 0 占位实现:仅验证工程可跑(画布自适应 + 占位文字)。
 * Phase 1 将替换为:Engine 装配 → SceneStack.push(BootScene) → 主循环启动。
 * 架构约定见 docs/02-ARCHITECTURE.md,进度见 docs/06-STATUS.md。
 */
const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  ctx.imageSmoothingEnabled = false; // 像素风:禁用平滑采样
}
window.addEventListener('resize', resize);
resize();

function drawPlaceholder(t: number): void {
  ctx.fillStyle = '#0d0f1a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const pulse = 0.6 + 0.4 * Math.sin(t / 500);
  ctx.fillStyle = `rgba(242, 163, 60, ${pulse})`;
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('星陨骑士 · 序章', canvas.width / 2, canvas.height / 2 - 20);
  ctx.fillStyle = '#5FD068';
  ctx.font = '14px monospace';
  ctx.fillText('Phase 0 骨架已就绪 — 引擎开发从 Phase 1 开始 (见 docs/06-STATUS.md)', canvas.width / 2, canvas.height / 2 + 20);
  requestAnimationFrame(drawPlaceholder);
}
requestAnimationFrame(drawPlaceholder);
