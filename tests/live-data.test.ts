// いまの src/data/ のデータの検査（ユーザー決定 2026-11-11、再発防止の A・B）。
// ほかの単体テストは固定したデータ（tests/fixtures/data/、vite.config.ts）で行うため、チューナーで調整したいまのデータは
// ここで確かめる。確かめるのは、どの値でも成り立つべきこと（型と整合、自動対戦で処理が止まらないこと）だけにする。
// 特定のカードの効果を決め打ちした確かめは、npm run test:live（いまのデータで全テスト）で行い、公開は止めない。

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkGameData, parseGameData, rawFromFiles, type DataFiles } from '../src/data/index.ts';
import { selfPlayGame } from '../src/game/selfplay.ts';
import { yieldToRunner } from './helpers/playout.ts';

const DIR = 'src/data';
const liveFiles: DataFiles = Object.fromEntries(
  readdirSync(DIR)
    .filter((name) => name.endsWith('.json') && name !== 'icon_keys.json')
    .map((name) => [name, JSON.parse(readFileSync(join(DIR, name), 'utf8')) as unknown]),
);

const GAMES = 30;

describe('いまの src/data/ のデータ', () => {
  it('型検査と整合検査を通る', () => {
    // 指示書 3-1、3-5（保存前の検査と同じ）
    expect(checkGameData(parseGameData(rawFromFiles(liveFiles)))).toEqual([]);
  });

  for (const playerCount of [3, 4]) {
    it(`${playerCount}人の自動対戦 ${GAMES}局で、処理が止まらず終局し、不変条件を保つ`, async () => {
      // rules.md v0.8 12-1-1、1-0-6
      const d = parseGameData(rawFromFiles(liveFiles));
      for (let i = 0; i < GAMES; i += 1) {
        await yieldToRunner();
        expect(selfPlayGame(playerCount, 9000 + playerCount * 100 + i, d)).toEqual([]);
      }
    }, 300_000);
  }
});
