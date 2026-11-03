// 単体テスト用の補助。ゲームを作り、ドラフトとラウンド開始時の選択を済ませた状態を作る。

import { applyMove, createGame, decider, getOptions } from '../../src/game/engine.ts';
import { playerOf } from '../../src/game/core.ts';
import type { GameState, Option, PlayerState, Task } from '../../src/game/types.ts';

export const top = (state: GameState): Task => {
  const task = state.stack[state.stack.length - 1];
  if (task === undefined) throw new Error('選択待ちがない');
  return task;
};

export const ids = (state: GameState): string[] => getOptions(state).map((o) => o.id);

/** 選択を順に適用する。 */
export const play = (state: GameState, ...moves: string[]): GameState =>
  moves.reduce((s, move) => applyMove(s, move), state);

/** 現在の選択待ちのプレイヤー。 */
export const me = (state: GameState): PlayerState => {
  const p = decider(state);
  if (p === null) throw new Error('選択待ちのプレイヤーがいない');
  return playerOf(state, p);
};

const AVOID = new Set(['draft:bonus:1', 'draft:bonus:4']);

const preferred = (options: readonly Option[]): Option => {
  const option = options.find((o) => !AVOID.has(o.id)) ?? options[0];
  if (option === undefined) throw new Error('選択肢がない');
  return option;
};

/** 先頭の選択肢を選び続け、最初の手番の選択待ちまで進める。 */
export const untilTurn = (state: GameState): GameState => {
  let s = state;
  while (top(s).t !== 'turn') {
    s = applyMove(s, preferred(getOptions(s)).id);
  }
  return s;
};

export const firstTurn = (playerCount = 3, seed = 1): GameState => untilTurn(createGame({ playerCount }, seed));

/** 状態の写しを作り、変更を加える（テストの局面づくり用）。 */
export const edit = (state: GameState, mutate: (s: GameState, p: PlayerState) => void): GameState => {
  const copy = structuredClone(state);
  mutate(copy, me(copy));
  return copy;
};
