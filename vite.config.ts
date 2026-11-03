import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 配布物は1枚の HTML とする（指示書 0-2）。
// JSX は esbuild の automatic ランタイムで変換し、@vitejs/plugin-react は導入しない。
export default defineConfig({
  plugins: [viteSingleFile()],
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
