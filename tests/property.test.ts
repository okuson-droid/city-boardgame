import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/index.ts';
import { selfPlayGame } from '../src/game/selfplay.ts';
import { yieldToRunner } from './helpers/playout.ts';

const GAMES = 100;
const MAX_MOVES = 5000;

describe('乱択プレイアウトの性質', () => {
  for (const playerCount of [3, 4]) {
    it(`${playerCount}人プレイ ${GAMES}局：合法手が尽きず、規定手数内に終局し、不変条件を保つ`, async () => {
      // rules.md v0.8 12-1-1（パスは常に合法）、1-0-6（5ラウンドで終わる）、16-2-3、3-1-3、3-3-1-2、5-2-1、6-3-5-5、8-1-1
      // 判定は src/game/selfplay.ts（チューナーの保存前の検査と同じ処理、2026-11-11）。
      for (let i = 0; i < GAMES; i += 1) {
        const seed = playerCount * 1000 + i;
        // 1局ごとに処理を譲る。長く同期で走り続けると、Vitest の作業者が親との通信に答えられず「Timeout calling onTaskUpdate」で落ちるため。
        await yieldToRunner();
        expect(selfPlayGame(playerCount, seed, GAME_DATA, MAX_MOVES)).toEqual([]);
      }
    }, 300_000);
  }
});
