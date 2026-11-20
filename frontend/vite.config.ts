import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { interfaceSizeCss } from './config/interfaceSizeCss';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 日常开发默认：5173 + 代理 localhost:3000（行为不变）。
// 隔离测试通过 VITE_PORT / VITE_PROXY_TARGET 显式指定独立端口与本轮后端，未设置时保持原样。
const portArgument =
  process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1] ||
  process.argv[process.argv.indexOf('--port') + 1];
const vitePort = Number(
  process.env.VITE_PORT ||
    (process.argv.includes('--port') || process.argv.some((arg) => arg.startsWith('--port='))
      ? portArgument
      : undefined) ||
    5173
);
const viteProxyTarget = process.env.VITE_PROXY_TARGET || 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [interfaceSizeCss()] } },
  // Concurrent acceptance Vite instances must not overwrite the live server's React chunks.
  cacheDir:
    process.env.VITE_CACHE_DIR ||
    path.resolve(__dirname, 'node_modules/.vite', `server-${vitePort}`),
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: vitePort,
    strictPort: Boolean(process.env.VITE_PORT), // 隔离测试要求端口固定，失败要显式暴露
    host: '0.0.0.0', // 监听所有网络接口
    proxy: {
      '/api': {
        target: viteProxyTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
    },
  },
  // 构建产物联调（vite preview）：独立端口与代理目标同样可经环境变量指定
  preview: {
    port: Number(process.env.VITE_PREVIEW_PORT || 4173),
    strictPort: Boolean(process.env.VITE_PREVIEW_PORT),
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: viteProxyTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
    },
  },
});
