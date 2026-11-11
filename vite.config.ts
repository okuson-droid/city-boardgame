import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

const root = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(root, 'src/data');
const PINNED_DIR = resolve(root, 'tests/fixtures/data');

/**
 * 単体テストのデータを固定する（ユーザー決定 2026-11-11、再発防止の A）。src/data/ のゲームデータの JSON を読む代わりに、
 * tests/fixtures/data/ の同じ名前の写しを返す。チューナーで src/data/ を調整しても単体テストの結果が変わらないようにするためである。
 * 写しのないファイル（icon_keys.json など）は src/data/ のものを読む。TEST_DATA=live のときは使わない（npm run test:live）。
 * 写しは npm run test:pin で取り直す。
 */
const pinnedTestData = (): Plugin => ({
  name: 'pinned-test-data',
  enforce: 'pre',
  load(id) {
    const path = id.split('?')[0] ?? id;
    if (dirname(path) !== DATA_DIR || !path.endsWith('.json')) return null;
    const pinned = resolve(PINNED_DIR, basename(path));
    return existsSync(pinned) ? readFileSync(pinned, 'utf8') : null;
  },
});

const useLiveData = process.env['TEST_DATA'] === 'live';

// 配布物は1枚の HTML とする（指示書 0-2）。
// JSX は esbuild の automatic ランタイムで変換し、@vitejs/plugin-react は導入しない。
export default defineConfig({
  plugins: [viteSingleFile(), ...(process.env['VITEST'] !== undefined && !useLiveData ? [pinnedTestData()] : [])],
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
