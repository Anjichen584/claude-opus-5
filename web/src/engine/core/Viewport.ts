/**
 * 强制横屏视口。
 *
 * 手机竖屏打开时按钮布局会乱套(按钮簇/摇杆都按横屏设计),所以强制横屏:
 * - Android:首次触摸手势里尽力 fullscreen + screen.orientation.lock('landscape')(真·锁定);
 * - iOS Safari 等不支持 lock 的平台:把画布 CSS 旋转 90° 伪装横屏(所有平台的兜底)。
 *
 * 旋转模式下窗口仍是竖的,但游戏逻辑一律通过 vw()/vh() 拿"横屏视口",
 * 指针坐标经 mapClient() 从窗口坐标系转回横屏坐标系 —— 引擎其余部分无感。
 *
 * 只对触屏设备生效:桌面浏览器把窗口拉窄不应该被转 90°。
 */

/** 当前是否处于"竖屏旋转"模式(画布被 CSS 转了 90°) */
let rotated = false;

const hasWindow = (): boolean => typeof window !== 'undefined';

/** 触屏设备判定(桌面窄窗口不旋转) */
const isTouchDevice = (): boolean =>
  hasWindow() && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);

/** 重新判定旋转状态(Renderer.resize 每次调用) */
export function updateViewport(): void {
  rotated = hasWindow() && isTouchDevice() && window.innerHeight > window.innerWidth;
}

/** 是否处于旋转模式(调试/UI 提示可用) */
export function viewportRotated(): boolean {
  return rotated;
}

/** 逻辑视口宽(旋转时 = 窗口高) */
export function viewW(): number {
  if (!hasWindow()) return 0;
  return rotated ? window.innerHeight : window.innerWidth;
}

/** 逻辑视口高(旋转时 = 窗口宽) */
export function viewH(): number {
  if (!hasWindow()) return 0;
  return rotated ? window.innerWidth : window.innerHeight;
}

/**
 * 窗口客户端坐标 → 横屏逻辑坐标(client px,未除 uiScale)。
 * 旋转推导:画布经 `rotate(90deg) translateY(-100%)` 后,
 * 画布点 (x,y) 落在屏幕 (innerWidth - y, x),反解得 x = cy, y = innerWidth - cx。
 */
export function mapClient(cx: number, cy: number): { x: number; y: number } {
  if (!rotated) return { x: cx, y: cy };
  return { x: cy, y: window.innerWidth - cx };
}

/** 把旋转状态落到画布 CSS(Renderer.resize 调用;非旋转时还原全屏样式) */
export function applyViewportTo(canvas: HTMLCanvasElement): void {
  const s = canvas.style;
  if (rotated) {
    s.width = `${window.innerHeight}px`;
    s.height = `${window.innerWidth}px`;
    s.transformOrigin = '0 0';
    s.transform = 'rotate(90deg) translateY(-100%)';
  } else {
    s.width = '100vw';
    s.height = '100vh';
    s.transform = '';
  }
}

/**
 * 尽力真·锁横屏(必须在用户手势回调里调用)。
 * Android Chrome:先进全屏再 lock('landscape'),成功后系统会自己转屏;
 * iOS / 桌面:API 缺失或抛错,静默放弃,由 CSS 旋转兜底。
 */
export function tryLockLandscape(): void {
  if (!hasWindow()) return;
  void (async (): Promise<void> => {
    try {
      // lock 不在部分 TS DOM lib / 浏览器实现里,动态探测
      const so = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      if (!so || typeof so.lock !== 'function') return;
      if (so.type && so.type.startsWith('landscape') && !rotated) return;
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      await so.lock('landscape');
    } catch {
      /* 平台不支持(iOS Safari 等):CSS 旋转已兜底,无需处理 */
    }
  })();
}
