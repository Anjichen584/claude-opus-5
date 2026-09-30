/* eslint-disable no-restricted-globals */
/**
 * 星陨骑士 · 序章 —— 离线 Service Worker(轮 45 门面批)。
 *
 * 策略(为"带 hash 的 Vite 产物 + 218 张精灵"量身):
 * - 导航请求(index.html):**network-first** —— 有网永远拿最新构建(里面引用新 hash 的 js),
 *   断网回落缓存 → 离线也能开游戏;
 * - 同源静态资产(js/png/json/webmanifest/音频):**cache-first + 后台补缓存** ——
 *   Vite 产物文件名带内容 hash,缓存永不脏;精灵图用到哪张缓存哪张(不 precache 全量,首装快);
 * - 版本换代:CACHE 名一换,activate 清光旧缓存(不留僵尸)。
 *
 * 注意:本文件必须待在站点根(public/),scope 覆盖整个 base path;
 * 注册代码在 web/src/main.ts(读 import.meta.env.BASE_URL,本地 dev 与 Pages 子路径都对)。
 */
const CACHE = 'sk-v1';

self.addEventListener('install', (e) => {
  // 预缓存壳:当前目录的 index(./ 在 Pages 上即 /claude-opus-5/)
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 跨域(没有)不掺和

  // 导航:network-first,断网回落缓存壳
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./', copy));
          return res;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  // 静态资产:cache-first,miss 则取网并写缓存
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
