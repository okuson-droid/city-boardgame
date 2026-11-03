// 巻き戻し（第15章、19-6-3）。状態は選択の記録から再生して作り直す。
// チェックポイント（巻き戻せない選択）は、乱数の消費・非公開情報の公開・選択権の移動・
// フェイズやラウンドの変化・手番の終了とパス、および 19-6-3 の襲撃の判定・ドラフトの選択・
// ボーナスタイルの選択である。チェックポイントより前には戻れない。

import { GAME_DATA } from '../data/index.ts';
import type { GameData } from '../data/types.ts';
import { applyMove, createGame, decider } from './engine.ts';
import type { GameConfig, GameState } from './types.ts';

const CHECKPOINT_PREFIXES = ['draft:', 'raid:', 'bonus:'];
const CHECKPOINT_MOVES = new Set(['end', 'pass']);

export const isCheckpoint = (prev: GameState, move: string, next: GameState): boolean =>
  next.rng.state !== prev.rng.state ||
  next.revealCount !== prev.revealCount ||
  decider(next) !== decider(prev) ||
  next.phase !== prev.phase ||
  next.round !== prev.round ||
  CHECKPOINT_MOVES.has(move) ||
  CHECKPOINT_PREFIXES.some((prefix) => move.startsWith(prefix));

/** 選択の列を初期状態から再生する。 */
export const replay = (config: GameConfig, seed: number, moves: readonly string[], d: GameData = GAME_DATA): GameState =>
  moves.reduce((state, move) => applyMove(state, move, d), createGame(config, seed, d));

/** 直前の選択を取り消した状態を返す。直前の選択がチェックポイントなら取り消せず null を返す。 */
export const undoLast = (state: GameState, d: GameData = GAME_DATA): GameState | null => {
  const last = state.log[state.log.length - 1];
  if (last === undefined || last.checkpoint) {
    return null;
  }
  return replay(
    state.config,
    state.seed,
    state.log.slice(0, -1).map((entry) => entry.move),
    d,
  );
};
