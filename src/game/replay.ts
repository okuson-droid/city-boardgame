// 対局の記録（リプレイ）の形と、記録からの局面の再生（ユーザー決定 2026-11-10）。
// 対話プレイ用のコマンド（tools/play/）、ローカル版・オンライン版の「記録を保存」、画面の「記録を再生」がすべてこの形を使う。
// 記録は { format, config, seed, moves, dataVersion } で、局面は常に createGame と applyMove の再生で作る。
// 記録はシードを含むため、山札の順序と全員の手札を再現できる。オンライン版では終局後にだけ渡す（19-6-1）。

import { DATA_VERSION, GAME_DATA, type GameData } from '../data/index.ts';
import { applyMove, createGame, getOptions } from './engine.ts';
import type { GameConfig, GameEvent, GameState } from './types.ts';

export const REPLAY_FORMAT = 'city-boardgame-play/1';

export type ReplayRecord = {
  readonly format: typeof REPLAY_FORMAT;
  readonly config: GameConfig;
  readonly seed: number;
  /** 選択肢の識別子の列（初期状態から順に適用する）。 */
  readonly moves: readonly string[];
  /** 記録を作ったときのゲームデータの版（DATA_VERSION）。 */
  readonly dataVersion: string;
};

/** 記録を読めない理由。画面とコマンドはこの文をそのまま出す。 */
export class ReplayError extends Error {}

/** いまの局面から記録を作る（ローカル版・オンライン版のサーバー側で使う）。 */
export const replayRecordOf = (state: GameState, dataVersion: string = DATA_VERSION): ReplayRecord => ({
  format: REPLAY_FORMAT,
  config: state.config,
  seed: state.seed,
  moves: state.log.map((entry) => entry.move),
  dataVersion,
});

const isConfig = (value: unknown): value is GameConfig => {
  if (typeof value !== 'object' || value === null) return false;
  const c = value as Record<string, unknown>;
  if (typeof c['playerCount'] !== 'number') return false;
  if (c['playerNames'] !== undefined && !(Array.isArray(c['playerNames']) && c['playerNames'].every((n) => typeof n === 'string'))) return false;
  return c['variants'] === undefined || (typeof c['variants'] === 'object' && c['variants'] !== null);
};

/** 読み込んだ JSON を記録として検査する。形が違えば ReplayError を投げる。 */
export const parseReplay = (value: unknown): ReplayRecord => {
  if (typeof value !== 'object' || value === null) throw new ReplayError('記録の形式が正しくない（JSON のオブジェクトではない）');
  const v = value as Record<string, unknown>;
  if (v['format'] !== undefined && v['format'] !== REPLAY_FORMAT) throw new ReplayError(`知らない記録の形式である：${String(v['format'])}`);
  if (!isConfig(v['config'])) throw new ReplayError('記録の形式が正しくない（config がない）');
  if (typeof v['seed'] !== 'number' || !Number.isFinite(v['seed'])) throw new ReplayError('記録の形式が正しくない（seed がない）');
  const moves = v['moves'];
  if (!Array.isArray(moves) || !moves.every((m) => typeof m === 'string')) throw new ReplayError('記録の形式が正しくない（moves がない）');
  if (typeof v['dataVersion'] !== 'string') throw new ReplayError('記録の形式が正しくない（dataVersion がない）');
  return { format: REPLAY_FORMAT, config: v['config'], seed: v['seed'], moves, dataVersion: v['dataVersion'] };
};

/** 記録のデータの版が、いまのデータと食い違うか。 */
export const replayDataChanged = (record: ReplayRecord, dataVersion: string = DATA_VERSION): boolean => record.dataVersion !== dataVersion;

/** 記録の1手分：選んだプレイヤー、その時点の選択肢のラベル、その選択で起きた出来事（自動で進んだ処理を含む）、選んだときのラウンド。 */
export type ReplayStep = {
  readonly index: number;
  readonly player: number;
  readonly move: string;
  readonly label: string;
  readonly round: number;
  readonly events: readonly GameEvent[];
};

/** 手番のまとまり：同じプレイヤーが続けて選んだ手（from〜to、1始まりの手数）。 */
export type ReplayTurn = { readonly player: number; readonly round: number; readonly from: number; readonly to: number };

/** 続けて同じプレイヤーが選んだ手を1つの手番にまとめる（ドラフトの1枚・襲撃の宣言も1つの手番になる）。 */
export const replayTurns = (steps: readonly { readonly index: number; readonly player: number; readonly round: number }[]): ReplayTurn[] => {
  const turns: ReplayTurn[] = [];
  for (const step of steps) {
    const last = turns[turns.length - 1];
    if (last !== undefined && last.player === step.player && last.to === step.index - 1) {
      turns[turns.length - 1] = { ...last, to: step.index };
    } else {
      turns.push({ player: step.player, round: step.round, from: step.index, to: step.index });
    }
  }
  return turns;
};

/**
 * 記録の頭から再生できるところまで再生する。データが変わって途中の選択肢が選べなくなっていたら、そこで止めて理由を返す。
 * states は 0 手目（初期状態）から playable 手目までの局面を返さない（重いため）。局面は replayTo で作る。
 */
export const replayPrefix = (
  record: ReplayRecord,
  d: GameData = GAME_DATA,
): { readonly steps: readonly ReplayStep[]; readonly playable: number; readonly error: string | null } => {
  let state = createGame(record.config, record.seed, d);
  const steps: ReplayStep[] = [];
  for (const [i, move] of record.moves.entries()) {
    const option = getOptions(state, d).find((o) => o.id === move);
    if (option === undefined) {
      return { steps, playable: i, error: `${i + 1}手目（${move}）は選べない。データが変わったため、ここから先は再生できない` };
    }
    let next: GameState;
    try {
      next = applyMove(state, move, d);
    } catch (e) {
      return { steps, playable: i, error: `${i + 1}手目（${move}）を適用できない：${e instanceof Error ? e.message : String(e)}` };
    }
    steps.push({ index: i + 1, player: option.player, move, label: option.label, round: state.round, events: next.events.slice(state.events.length) });
    state = next;
  }
  return { steps, playable: record.moves.length, error: null };
};

/** 記録の n 手目までを再生した局面。from を渡すと、その局面（m 手目まで再生済み、m ≤ n）から続けて再生する。 */
export const replayTo = (record: ReplayRecord, n: number, d: GameData = GAME_DATA, from?: GameState): GameState => {
  let state = from !== undefined && from.log.length <= n ? from : createGame(record.config, record.seed, d);
  for (let i = state.log.length; i < n; i += 1) {
    const move = record.moves[i];
    if (move === undefined) break;
    state = applyMove(state, move, d);
  }
  return state;
};
