/* eslint-env node */

import fs from 'fs';
import react from '@vitejs/plugin-react';
import { renderer } from 'unplugin-auto-expose';
import { join } from 'node:path';
import { injectAppVersion } from '../../version/inject-app-version-plugin.mjs';
import WindiCSS from 'vite-plugin-windicss';

// 🆕 使用 fs 读取 JSON 文件，兼容 Node.js v24+
const chrome = JSON.parse(
  fs.readFileSync(new URL('../../.electron-vendors.cache.json', import.meta.url), 'utf-8')
).chrome;

const PACKAGE_ROOT = __dirname;
const PROJECT_ROOT = join(PACKAGE_ROOT, '../..');

/**
 * @type {import('vite').UserConfig}
 * @see https://vitejs.dev/config/
 */
const config = {
  mode: process.env.MODE,
  root: PACKAGE_ROOT,
  envDir: PROJECT_ROOT,
  resolve: {
    alias: {
      '/@/': join(PACKAGE_ROOT, 'src') + '/',
    },
  },
  base: '',
  server: {
    fs: {
      strict: true,
    },
  },
  build: {
    sourcemap: true,
    target: `chrome${chrome}`,
    outDir: 'dist',
    assetsDir: '.',
    rollupOptions: {
      input: join(PACKAGE_ROOT, 'index.html'),
      // external 配置，排除 Node.js 模块
      external: [
        'node:crypto',
        'crypto',
        'fs',
        'path',
        'os',
        'child_process',
        'electron',
        'net',
        'tls',
        'url',
        'http',
        'https',
        'stream',
        'util',
        'events',
        'buffer',
        'process',
      ],
    },
    emptyOutDir: true,
    reportCompressedSize: false,
    commonjsOptions: {
      include: [/node_modules/],
      extensions: ['.js', '.cjs', '.mjs'],
    },
  },
  test: {
    environment: 'happy-dom',
  },
  optimizeDeps: {
    exclude: [
      'node:crypto',
      'crypto',
      'fs',
      'path',
      'electron',
      'child_process',
      'os',
    ],
  },
  plugins: [
    react(),
    renderer.vite({
      preloadEntry: join(PACKAGE_ROOT, '../preload/src/index.ts'),
    }),
    injectAppVersion(),
    WindiCSS(),
  ],
};

export default config;
