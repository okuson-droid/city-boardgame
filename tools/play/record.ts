// 対局の記録（指示書 2026-11-10 対話プレイ 2-2）。記録は { config, seed, moves } と、データの版（dataVersion）を持つ。
// 局面は常に replay(config, seed, moves) で作り直し、GameState そのものは保存しない。
// 純粋関数（記録の作成・選択の適用・取り消し・記録の一覧）と、ファイルの読み書きを分けて置く。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DATA_VERSION, GAME_DATA, type GameData } from '../../src/data/index.ts';
import {
  applyMove,
  createGame,
  decider,
  getOptions,
  parseReplay,
  REPLAY_FORMAT,
  ReplayError,
  type GameConfig,
  type GameEvent,
  type GameState,
  type ReplayRecord,
} from '../../src/game/index.ts';

export const RECORD_FORMAT = REPLAY_FORMAT;

/** 記録の形は、画面の「記録を保存」「記録を再生」と同じ（src/game/replay.ts の ReplayRecord）。 */
export type PlayRecord = ReplayRecord;

/** 失敗の理由。CLI はこの文を標準エラーに1行で出す。 */
export class PlayError extends Error {}

export const newRecord = (config: GameConfig, seed: number, dataVersion: string = DATA_VERSION): PlayRecord => ({
  format: RECORD_FORMAT,
  config,
  seed,
  moves: [],
  dataVersion,
});

/** 記録のデータの版が、いまのデータと食い違うか。 */
export const dataChanged = (record: PlayRecord, dataVersion: string = DATA_VERSION): boolean => record.dataVersion !== dataVersion;

/** 1手分の結果：選択した人・選択肢・ラベルと、その選択で起きた出来事（自動で進んだ処理を含む）。 */
export type Step = {
  /** 記録の中の手数（1始まり）。 */
  readonly index: number;
  readonly player: number;
  readonly id: string;
  readonly label: string;
  /** 選択した時点の選択待ちのタスクの種類。 */
  readonly task: string;
  /** 選択した時点のラウンド（ドラフト中は 0）。 */
  readonly round: number;
  readonly events: readonly GameEvent[];
  /** その選択の処理で新しく公開・獲得されたもの（表示の側が視点で絞る。手札は持ち主の視点でだけ出す）。 */
  readonly reveal: Reveal;
};

/** 1手で新しく公開・獲得されたもの（指示書 2026-11-11 2-2）。 */
export type Reveal = {
  readonly specialCitizens: readonly string[];
  readonly plannedCities: readonly string[];
  readonly bonusTiles: readonly number[];
  /** プレイヤーごとの、新しく手札に入った文明カード（非公開。持ち主の視点でだけ出す）。 */
  readonly hands: Readonly<Record<number, readonly string[]>>;
  /** プレイヤーごとの、新しく得た専用の計画都市カード（デザイナー）。 */
  readonly privatePlanned: Readonly<Record<number, readonly string[]>>;
  /** プレイヤーごとの、新しく獲得した特別な市民カード。 */
  readonly acquired: Readonly<Record<number, readonly string[]>>;
};

/** before に無く after にある要素（同じ番号のカードが複数あれば数で比べる）。 */
export const added = <T>(before: readonly T[], after: readonly T[]): T[] => {
  const left = [...before];
  const out: T[] = [];
  for (const x of after) {
    const i = left.indexOf(x);
    if (i >= 0) left.splice(i, 1);
    else out.push(x);
  }
  return out;
};

export const revealOf = (state: GameState, next: GameState): Reveal => {
  const perPlayer = <T>(pick: (p: GameState['players'][number]) => readonly T[]): Record<number, T[]> => {
    const out: Record<number, T[]> = {};
    next.players.forEach((p, i) => {
      const was = state.players[i];
      const diff = added(was === undefined ? [] : pick(was), pick(p));
      if (diff.length > 0) out[i] = diff;
    });
    return out;
  };
  return {
    specialCitizens: added(state.scRevealed, next.scRevealed),
    plannedCities: added(state.plannedCityRevealed, next.plannedCityRevealed),
    bonusTiles: added(state.bonusTilesOnBoard, next.bonusTilesOnBoard),
    hands: perPlayer((p) => p.hand),
    privatePlanned: perPlayer((p) => p.privatePlannedCities),
    acquired: perPlayer((p) => p.specialCitizens),
  };
};

export const stepFrom = (state: GameState, next: GameState, index: number, id: string, d: GameData): Step => {
  const option = getOptions(state, d).find((o) => o.id === id);
  return {
    index,
    player: option?.player ?? decider(state) ?? -1,
    id,
    label: option?.label ?? id,
    task: state.stack[state.stack.length - 1]?.t ?? '',
    round: state.round,
    events: next.events.slice(state.events.length),
    reveal: revealOf(state, next),
  };
};

/**
 * 記録を再生して局面を作る。途中で失敗したら、データが変わったため再生できない旨の PlayError を投げる。
 * onStep を渡すと、1手ごとの結果を受け取れる（log に使う）。
 */
export const stateOf = (record: PlayRecord, d: GameData = GAME_DATA, onStep?: (step: Step) => void): GameState => {
  let state = createGame(record.config, record.seed, d);
  record.moves.forEach((move, i) => {
    let next: GameState;
    try {
      if (!getOptions(state, d).some((o) => o.id === move)) throw new Error(`選択肢にない：${move}`);
      next = applyMove(state, move, d);
    } catch (e) {
      throw new PlayError(`データが変わったため再生できない（${i + 1}手目 ${move}：${e instanceof Error ? e.message : String(e)}）`);
    }
    onStep?.(stepFrom(state, next, i + 1, move, d));
    state = next;
  });
  return state;
};

/**
 * 選択肢の指定を ID に直す。指定は選択肢 ID か、いまの選択肢の番号（1始まり、getOptions の順）である。
 * 選択肢にない指定なら PlayError を投げる。
 */
export const resolveSpec = (state: GameState, spec: string, d: GameData = GAME_DATA): string => {
  const options = getOptions(state, d);
  if (options.length === 0) throw new PlayError(`選べる選択肢がない（${state.phase === 'over' ? 'ゲームは終了している' : '選択待ちがない'}）：${spec}`);
  if (/^\d+$/.test(spec)) {
    const option = options[Number(spec) - 1];
    if (option === undefined) throw new PlayError(`番号 ${spec} は範囲外である（1〜${options.length}）`);
    return option.id;
  }
  if (!options.some((o) => o.id === spec)) throw new PlayError(`選択肢にない指定である：${spec}`);
  return spec;
};

export type MoveResult = { readonly record: PlayRecord; readonly state: GameState; readonly steps: readonly Step[] };

/**
 * 選択肢を順に適用する。途中で選択肢にない指定が来たら PlayError を投げ、記録は変えない（全部通るか、何も変えないか）。
 * 選択待ちのプレイヤーが途中で替わっても続けて適用する。seat を渡すと、選択待ちがその席でない指定が来た時点で失敗する
 * （席ごとに別の打ち手が同じ記録を打つとき、他の席の手を指さないようにする）。
 */
export const applyMoves = (record: PlayRecord, specs: readonly string[], d: GameData = GAME_DATA, seat?: number): MoveResult =>
  applyMovesFrom(stateOf(record, d), record, specs, d, seat);

/** applyMoves の本体。state は record を再生した局面であること（呼び出し側が持っている局面を使い回すため）。 */
export const applyMovesFrom = (
  start: GameState,
  record: PlayRecord,
  specs: readonly string[],
  d: GameData = GAME_DATA,
  seat?: number,
): MoveResult => {
  if (specs.length === 0) throw new PlayError('適用する選択肢を指定すること');
  let state = start;
  const moves = [...record.moves];
  const steps: Step[] = [];
  for (const [i, spec] of specs.entries()) {
    // 複数を並べた途中で止まったときは、何個目で止まったかと、記録を変えていないことを添える。
    const where = specs.length > 1 ? `（${specs.length}個中${i + 1}個目で止まった。記録は変えていない）` : '';
    const deciding = decider(state);
    if (seat !== undefined && deciding !== seat) {
      throw new PlayError(`いまの選択待ちは P${deciding ?? '-'} であり、P${seat} は選べない：${spec}${where}`);
    }
    let id: string;
    try {
      id = resolveSpec(state, spec, d);
    } catch (e) {
      const acted = state.stack[state.stack.length - 1];
      const hint = acted?.t === 'turn' && acted.acted && spec.startsWith('act:') ? '（この手番のアクションは済んでいる。end で手番を終える）' : '';
      throw new PlayError(`${e instanceof Error ? e.message : String(e)}${hint}${where}`);
    }
    const next = applyMove(state, id, d);
    moves.push(id);
    steps.push(stepFrom(state, next, moves.length, id, d));
    state = next;
  }
  return { record: { ...record, moves }, state, steps };
};

/** 記録の末尾から n 手を取り除く。チェックポイントによる制限は掛けない（ルール上の巻き戻し、第15章とは異なる）。 */
export const undoMoves = (record: PlayRecord, n: number): { record: PlayRecord; removed: string[] } => {
  if (!Number.isInteger(n) || n < 1) throw new PlayError(`取り消す手数は1以上の整数で指定すること：${n}`);
  if (n > record.moves.length) throw new PlayError(`取り消せるのは ${record.moves.length} 手までである`);
  return { record: { ...record, moves: record.moves.slice(0, -n) }, removed: record.moves.slice(-n) };
};

/** 記録の各手（手数・選択した人・ラベル）。 */
export const logSteps = (record: PlayRecord, d: GameData = GAME_DATA): Step[] => {
  const steps: Step[] = [];
  stateOf(record, d, (step) => steps.push(step));
  return steps;
};

// ---------------------------------------------------------------------------
// ファイルの読み書き
// ---------------------------------------------------------------------------

export const DEFAULT_RECORD_PATH = '.play/game.json';

export const readRecord = (path: string): PlayRecord => {
  if (!existsSync(path)) throw new PlayError(`記録がない：${path}（new で作ること）`);
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new PlayError(`記録を読めない：${path}（${e instanceof Error ? e.message : String(e)}）`);
  }
  try {
    return parseReplay(value);
  } catch (e) {
    throw new PlayError(`${e instanceof ReplayError ? e.message : String(e)}：${path}`);
  }
};

export const writeRecord = (path: string, record: PlayRecord): void => {
  mkdirSync(dirname(path), { recursive: true });
  // 別の打ち手が同時に読んでも書きかけを読まないよう、写しに書いてから置き換える。
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`);
  renameSync(temp, path);
};

export const recordExists = (path: string): boolean => existsSync(path);
