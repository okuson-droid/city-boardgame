// 対話プレイ用のコマンドのビルド（指示書 2026-11-10 対話プレイ 2-1）。src/data/ は JSON の import と
// import.meta.glob を使うため Node で直接は動かせない。server/ と同じく Vite で dist-play/cli.js にまとめる。
// node: の標準モジュールは外部のまま残す。配布用ビルド（npm run build）には含めない。

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'tools/play/cli.ts',
    outDir: 'dist-play',
    target: 'node22',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'cli.js' } },
  },
  ssr: { noExternal: true },
});
