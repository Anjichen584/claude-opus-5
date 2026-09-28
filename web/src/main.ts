/**
 * 星陨骑士 · 序章 — 入口(Phase 1:训练场)
 * 装配:Renderer + Input + GameLoop + GameScene。
 * 架构契约见 docs/02-ARCHITECTURE.md,进度见 docs/06-STATUS.md。
 */
import { GameLoop } from '@engine/core/GameLoop';
import { Input } from '@engine/input/Input';
import { Renderer } from '@engine/render/Renderer';
import { sfx } from '@engine/audio/Sfx';
import { music } from '@engine/audio/Music';
import { GameScene } from '@game/GameScene';
import { meta } from '@game/meta/Save';

meta.load(); // 局外存档(祭坛/星尘/统计)

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
