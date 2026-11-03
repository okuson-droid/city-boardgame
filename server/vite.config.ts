// オンライン版のサーバーのビルド（段階5）。ゲームのエンジンとデータ（JSON・import.meta.glob）を含めて
// dist-server/main.js にまとめ、node で直接動かせるようにする。node: の標準モジュールは外部のまま残す。

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'server/main.ts',
    outDir: 'dist-server',
    target: 'node22',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'main.js' } },
  },
  ssr: { noExternal: true },
});
