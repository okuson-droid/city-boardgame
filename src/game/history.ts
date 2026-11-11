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

/**
 * 選択の結果が、まだ公開されていない先の情報を含むか（指示書 2026-11-12 対話プレイ強化 2-2 の「先を見せない規則」）。
 * 乱数を消費した（山札を切り直した・順番を決めた）なら random、非公開情報を公開した（山札から引いた・特別な市民カードの補充や
 * 襲撃カード・計画都市がめくられた）なら reveal、どちらでもなければ null を返す。isCheckpoint の最初の2つの条件と同じ判定である。
 * isCheckpoint の残りの条件（選択権の移動・フェイズの変化・手番の終了など）は先の情報を含まないため、ここでは見ない。
 */
export const hiddenFuture = (prev: GameState, next: GameState): 'random' | 'reveal' | null =>
  next.rng.state !== prev.rng.state ? 'random' : next.revealCount !== prev.revealCount ? 'reveal' : null;

/** 選択の列を初期状態から再生する。 */
export const replay = (config: GameConfig, seed: number, moves: readonly string[], d: GameData = GAME_DATA): GameState =>
  moves.reduce((state, move) => applyMove(state, move, d), createGame(config, seed, d));

/**
 * 手番の最初（直前のチェックポイントの直後）まで戻した状態を返す（ユーザー決定 2026-11-08）。
 * カードを引いた・特別な市民カードを獲得した選択はチェックポイントのため、その直後までしか戻らない。
 * 戻せる選択がなければ null を返す。
 */
export const undoToTurnStart = (state: GameState, d: GameData = GAME_DATA): GameState | null => {
  const keep = turnStartLength(state);
  if (keep === state.log.length) return null;
  return replay(
    state.config,
    state.seed,
    state.log.slice(0, keep).map((entry) => entry.move),
    d,
  );
};

/** 手番の最初まで戻したときに残る選択の数（直前のチェックポイントまで）。 */
export const turnStartLength = (state: GameState): number => {
  for (let i = state.log.length - 1; i >= 0; i -= 1) {
    if (state.log[i]?.checkpoint) return i + 1;
  }
  return 0;
};

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
