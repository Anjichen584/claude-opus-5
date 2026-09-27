import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@game': path.resolve(__dirname, 'src/game'),
      '@data': path.resolve(__dirname, 'src/data'),
    },
  },
  server: {
    // 允许沙箱预览域名访问(*.e2b.app),本地开发不受影响
    allowedHosts: true,
  },
  build: { target: 'es2022' },
});
