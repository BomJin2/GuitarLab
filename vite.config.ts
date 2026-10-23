import { alphaTab } from '@coderline/alphatab/vite';
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { publicAssetsPlugin } from './scripts/publicAssets.mjs';

export default defineConfig({
  plugins: [react(), tailwindcss(), alphaTab(), publicAssetsPlugin()],
  build: { copyPublicDir: false },
  clearScreen: false,
  server: {
    host: '127.0.0.1',
    port: 1420,
    strictPort: true,
    watch: {
      // 문서·네이티브 후보·생성 폰트 검사가 실제 연습 화면을 새로고침하지 않도록 합니다.
      ignored: [
        '**/docs/**',
        '**/src-tauri/**',
        '**/ai/**',
        '**/fixtures/**',
        '**/README.md',
        '**/AGENTS.md',
        '**/public/font/**',
      ],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'src-tauri/target/**', 'ai/.venv*/**'],
  },
});
