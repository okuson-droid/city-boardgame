// 乱択の自動対戦による動作の確かめ（ユーザー決定 2026-11-11：チューナーから保存したデータで公開が止まらないようにする再発防止の C）。
// 選択肢から擬似乱数で1つを選び続け、合法手が尽きないか・規定手数内に終局するか・不変条件を保つか・例外が出ないかを見る。
// 単体テスト（tests/property.test.ts）とチューナーの保存前の検査が同じ処理を使う。乱数は rng.ts を使う。

import type { GameData } from '../data/types.ts';
import { BUILDINGS } from '../data/types.ts';
import { buildingCount, landCount, regularWorkerCap } from './core.ts';
import { applyMove, createGame, getOptions, isGameOver } from './engine.ts';
import { createRng, nextFloat, type RngState } from './rng.ts';
import { finalScores } from './scoring.ts';
import type { GameState, Option } from './types.ts';

const weightOf = (option: Option): number => {
  // フリーアクションは選ばれにくくし、手番が無限に伸びないようにする。
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

/** 1局を乱択で進める。maxMoves 手で打ち切る。 */
export const playout = (playerCount: number, seed: number, maxMoves: number, d: GameData): PlayoutResult => {
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

/** 終局の状態の不変条件（資源が負でない、上限を超えない、土地のないマスに建物がない）。破れた条件の文を返す。 */
export const checkInvariants = (state: GameState, d: GameData): string[] => {
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
    if (landCount(p) < 2) errors.push(`${name} 土地タイルが2枚より少ない`);
  }
  return errors;
};

export type SelfPlayProblem = { readonly playerCount: number; readonly seed: number; readonly message: string };

/**
 * 1局を進めて問題を返す（なければ空）。例外も問題として返す（データの値で処理が止まる場合を見つけるため）。
 * rules.md v0.8 12-1-1（パスは常に合法）、1-0-6（定められたラウンド数で終わる）。
 */
export const selfPlayGame = (playerCount: number, seed: number, d: GameData, maxMoves = 5000): SelfPlayProblem[] => {
  const problem = (message: string): SelfPlayProblem => ({ playerCount, seed, message });
  try {
    const result = playout(playerCount, seed, maxMoves, d);
    if (result.stuck) return [problem('合法手がない状態に陥った')];
    if (result.state.phase !== 'over') return [problem(`${maxMoves}手以内に終局しなかった`)];
    const rounds = result.state.events.filter((e) => e.type === 'round').length;
    const out = checkInvariants(result.state, d).map(problem);
    if (rounds !== d.params.rounds) out.push(problem(`ラウンドの数が ${d.params.rounds} でない（${rounds}）`));
    const scores = finalScores(result.state, d);
    if (scores.length !== playerCount || !scores.some((s) => s.rank === 1)) out.push(problem('終了時の得点を出せない'));
    return out;
  } catch (error) {
    return [problem(`処理が止まった：${error instanceof Error ? error.message : String(error)}`)];
  }
};

/** 処理を一度だけ譲る（画面やテストの作業者が固まらないようにする）。 */
export const yieldOnce = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * 3人・4人を交互に games 局進め、問題をまとめて返す。1局ごとに処理を譲り、進み具合を onProgress に渡す。
 * シードは固定（同じデータなら同じ結果になる）。
 */
export const selfPlayCheck = async (
  d: GameData,
  games: number,
  onProgress: (done: number, total: number) => void = () => {},
): Promise<SelfPlayProblem[]> => {
  const problems: SelfPlayProblem[] = [];
  for (let i = 0; i < games; i += 1) {
    await yieldOnce();
    const playerCount = i % 2 === 0 ? 3 : 4;
    problems.push(...selfPlayGame(playerCount, 7000 + i, d));
    onProgress(i + 1, games);
  }
  return problems;
};
