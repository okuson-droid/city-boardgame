// 単体テストが読むデータ（tests/fixtures/data/）を、いまの src/data/ の写しで置き換える（ユーザー決定 2026-11-11、再発防止の A）。
// 単体テストは固定したこの写しで行い、チューナーで src/data/ を調整してもテストの結果が変わらないようにする。
// ゲームの仕組みとデータの形を同時に変えたとき（項目を足した・名前を変えたなど）に実行し、テストを直してから commit する。
// icon_keys.json は調整の対象でないため写さない（テストも src/data/ のものを読む）。

import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = 'src/data';
const TARGET = 'tests/fixtures/data';
const SKIP = new Set(['icon_keys.json']);

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });
const names = readdirSync(SOURCE).filter((name) => name.endsWith('.json') && !SKIP.has(name));
for (const name of names) copyFileSync(join(SOURCE, name), join(TARGET, name));
console.log(`${TARGET} に ${names.length} 個のファイルを写した：${names.join('、')}`);
