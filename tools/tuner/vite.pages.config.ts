// 公開ページ（GitHub Pages）に置くチューナーのビルド（案A、ユーザー決定 2026-11-04）。
// チューナー（index.html）と試遊（play.html）を、それぞれ1枚の HTML として dist/tuner/ に出す。
// vite-plugin-singlefile は入口が1つのときだけ使えるため、--mode index と --mode play の2回に分けてビルドする（npm run build:tuner）。
// 開発サーバーへの書き出し（vite.config.ts の /__tuner/export）は含まず、保存は GitHub の API（github.ts）で行う。

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const entry = mode === 'play' ? 'play.html' : 'index.html';
  return {
    root: here,
    base: './',
    plugins: [viteSingleFile()],
    // 試遊ページだけが調整案のデータを読む（src/data/index.ts の TUNER_PLAYTEST）。
    define: { 'import.meta.env.VITE_TUNER': JSON.stringify('1') },
    esbuild: { jsx: 'automatic' },
    build: {
      outDir: fileURLToPath(new URL('../../dist/tuner', import.meta.url)),
      emptyOutDir: false,
      rollupOptions: { input: `${here}${entry}` },
    },
  };
});
