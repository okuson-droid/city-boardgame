// Supabase の Edge Function（rooms）の中身のビルド。ゲームのエンジンとデータ（JSON・import.meta.glob）を含めて
// supabase/functions/rooms/bundle.js の1ファイルにまとめる。入口の index.ts（Deno）がこれを読み込む。
// 実行：npm run supabase:build

import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: { entry: 'src/online/edge.ts', formats: ['es'], fileName: () => 'bundle.js' },
    outDir: 'supabase/functions/rooms',
    emptyOutDir: false,
    target: 'es2022',
    minify: false,
  },
});
