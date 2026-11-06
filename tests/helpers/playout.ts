// 乱択プレイアウト。選択肢から擬似乱数で1つを選び続ける。
// フリーアクションは選ばれにくくし、手番が無限に伸びないようにする。

import { createRng, nextFloat, type RngState } from '../../src/game/rng.ts';
import { applyMove, createGame, getOptions, isGameOver } from '../../src/game/engine.ts';
import type { GameState, Option } from '../../src/game/types.ts';
import type { GameData } from '../../src/data/types.ts';
import { GAME_DATA } from '../../src/data/index.ts';

const weightOf = (option: Option): number => {
  if (option.id.startsWith('free:')) return 0.05;
  if (option.id === 'pass') return 0.3;
  return 1;
};

const pick = (options: readonly Option[], rng: RngState): [Option, RngState] => {
  const total = options.reduce((sum, o) => sum + weightOf(o), 0);
  const [r, next] = nextFloat(rng);
  let acc = r * total;
  for (const option of options) {
    acc -= weightOf(option);
    if (acc <= 0) return [option, next];
  }
  const last = options[options.length - 1];
  if (last === undefined) throw new Error('選択肢がない');
  return [last, next];
};

export type PlayoutResult = { readonly state: GameState; readonly moves: string[]; readonly stuck: boolean };

export const playout = (playerCount: number, seed: number, maxMoves: number, d: GameData = GAME_DATA): PlayoutResult => {
  let state = createGame({ playerCount }, seed, d);
  let rng = createRng(seed ^ 0x9e3779b9);
  const moves: string[] = [];
  while (!isGameOver(state) && moves.length < maxMoves) {
    const options = getOptions(state, d);
    if (options.length === 0) return { state, moves, stuck: true };
    const [option, next] = pick(options, rng);
    rng = next;
    moves.push(option.id);
    state = applyMove(state, option.id, d);
  }
  return { state, moves, stuck: false };
};

/**
 * 処理を一度だけ Vitest の作業者に譲る。乱択プレイアウトを何十局も同期で続けると、作業者が親との通信に
 * 答えられず「Timeout calling onTaskUpdate」で全体が失敗するため、1局ごとに呼ぶ。
 */
export const yieldToRunner = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
