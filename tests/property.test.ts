import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/index.ts';
import { buildingCount, landCount, regularWorkerCap } from '../src/game/core.ts';
import { finalScores } from '../src/game/scoring.ts';
import { BUILDINGS } from '../src/data/types.ts';
import type { GameState } from '../src/game/types.ts';
import { playout } from './helpers/playout.ts';

const GAMES = 100;
const MAX_MOVES = 5000;
const d = GAME_DATA;

const checkInvariants = (state: GameState): string[] => {
  const errors: string[] = [];
  for (const p of state.players) {
    const name = `P${p.index}`;
    for (const [key, value] of Object.entries({
      gold: p.gold,
      materials: p.materials,
      tokens: p.militaryTokens,
      goldProduction: p.goldProduction,
      tempWorkers: p.tempWorkers,
      regularPlaced: p.regularPlaced,
    })) {
      if (value < 0) errors.push(`${name} ${key} が負である（${value}）`);
    }
    if (p.tempWorkers > d.params.workers.tempMax) errors.push(`${name} 臨時ワーカーが上限を超えた`);
    if (p.regularWorkers > regularWorkerCap(d, p) && p.regularWorkers > d.params.initial.regularWorkers) {
      errors.push(`${name} 通常ワーカーが上限を超えた`);
    }
    if (p.militaryLevel > d.params.military.max || p.infraLevel > d.params.infra.max) {
      errors.push(`${name} トラックが上限を超えた`);
    }
    for (const b of BUILDINGS) {
      if (buildingCount(p, b) > d.params.buildings.limits[b]) errors.push(`${name} ${b} が上限を超えた`);
    }
    for (const cell of Object.keys(p.buildings)) {
      if (p.land[cell as keyof typeof p.land] === undefined) errors.push(`${name} 土地のない ${cell} に建物がある`);
    }
  }
  return errors;
};

describe('乱択プレイアウトの性質', () => {
  for (const playerCount of [3, 4]) {
    it(`${playerCount}人プレイ ${GAMES}局：合法手が尽きず、規定手数内に終局し、不変条件を保つ`, () => {
      // rules.md v0.8 12-1-1（パスは常に合法）、1-0-6（5ラウンドで終わる）、16-2-3、3-1-3、3-3-1-2、5-2-1、6-3-5-5、8-1-1
      for (let i = 0; i < GAMES; i += 1) {
        const seed = playerCount * 1000 + i;
        const result = playout(playerCount, seed, MAX_MOVES);
        expect(result.stuck, `seed ${seed}：合法手がない状態に陥った`).toBe(false);
        expect(result.state.phase, `seed ${seed}：${MAX_MOVES}手以内に終局しなかった`).toBe('over');
        expect(checkInvariants(result.state), `seed ${seed}`).toEqual([]);
        expect(result.state.events.filter((e) => e.type === 'round')).toHaveLength(d.params.rounds);
        const scores = finalScores(result.state);
        expect(scores).toHaveLength(playerCount);
        expect(scores.some((s) => s.rank === 1)).toBe(true);
        for (const p of result.state.players) {
          expect(landCount(p)).toBeGreaterThanOrEqual(2);
        }
      }
    }, 300_000);
  }
});
