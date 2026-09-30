/**
 * 星陨骑士 · 序章 — 入口(Phase 1:训练场)
 * 装配:Renderer + Input + GameLoop + GameScene。
 * 架构契约见 docs/02-ARCHITECTURE.md,进度见 docs/06-STATUS.md。
 */
import { GameLoop } from '@engine/core/GameLoop';
import { tryLockLandscape } from '@engine/core/Viewport';
import { Input } from '@engine/input/Input';
import { Renderer } from '@engine/render/Renderer';
import { sfx } from '@engine/audio/Sfx';
import { music } from '@engine/audio/Music';
import { GameScene } from '@game/GameScene';
import { meta } from '@game/meta/Save';
import { tutorial } from '@game/meta/Tutorial';

meta.load();               // 局外存档(祭坛/星尘/统计/引导进度)
tutorial.restore(meta.data.tutorial); // 引导进度续上(中途关掉也能接着走)

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const input = new Input();
input.attach(canvas);

// 浏览器自动播放策略:首次手势解锁音频(含触屏)
const unlockAudio = (): void => {
  sfx.unlock();
  music.unlock();
};
window.addEventListener('mousedown', unlockAudio);
window.addEventListener('keydown', unlockAudio);
window.addEventListener('touchstart', unlockAudio);
// 强制横屏:触摸手势里尽力真·锁横屏(Android 全屏+lock;iOS 静默失败,由画布 90° 旋转兜底)
window.addEventListener('touchstart', () => tryLockLandscape());

let scene: GameScene;
let lastRender = performance.now();

const loop = new GameLoop(
  (dt) => scene.update(dt),
  (alpha) => {
    const now = performance.now();
    const rawDt = (now - lastRender) / 1000;
    lastRender = now;
    scene.render(alpha, rawDt);
  },
);

scene = new GameScene(renderer, input, loop);
loop.start();

// ---- 离线化(轮 45 门面批):注册 Service Worker ----
// BASE_URL 本地 dev 为根路径,Pages 构建为仓库子路径 —— scope 自动跟对。
// dev 服务器不注册(vite dev 不产 sw 环境,且热更与 SW 缓存互相捣乱)。
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 注册失败不影响游戏(老浏览器/隐私模式),静默 */
    });
  });
}
