import { build } from 'vite';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('../', import.meta.url));
await build({
  root: frontend,
  configFile: false,
  publicDir: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  esbuild: { jsx: 'automatic' },
  build: {
    target: 'es2020',
    outDir: 'public/design-preview/motion',
    emptyOutDir: false,
    lib: { entry: 'design/login-background/preview.tsx', formats: ['es'], fileName: () => 'login-background.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
    minify: 'esbuild',
    reportCompressedSize: true,
  },
});
