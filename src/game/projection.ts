// いま終局したと仮定したときの最終得点の見込み（指示書 2026-11-12 対話プレイ強化 2-1）。
// 終了の手順（17-0-1：最終の収入・ゲーム終了時の能力・自然公園の最大の割り当て・評価軸ごとの換算）を別に書き直さず、
// 局面の写しにエンジンの終了の処理（endedCopy）を掛け、finalScores で数える。元の局面（乱数の状態を含む）は変えない。

import { GAME_DATA } from '../data/index.ts';
import type { GameData } from '../data/types.ts';
import { endedCopy } from './engine.ts';
import { sourceName } from './labels.ts';
import { finalScores, type FinalScore } from './scoring.ts';
import type { GameState } from './types.ts';

export type Projection = {
  /** 終局した局面では finalScores と同じ。 */
  readonly scores: readonly FinalScore[];
  /** 終了の手順の途中にプレイヤーの選択が要るため、見込みに含めなかった効果（出どころの名前）。 */
  readonly omitted: readonly string[];
  /** 終局しているか（していれば見込みではなく最終得点）。 */
  readonly over: boolean;
  /** 終了の手順を掛けた写し（得点の出どころ・自然公園の内訳を出すため）。終局していれば元の局面。 */
  readonly ended: GameState;
};

export const projectedScores = (state: GameState, d: GameData = GAME_DATA): Projection => {
  const ended = endedCopy(state, d);
  return {
    scores: finalScores(ended.state, d),
    omitted: ended.pending.map((p) => {
      const [kind, ...source] = p.split(':');
      return source.length > 0 ? sourceName(d, source.join(':')) : (kind ?? p);
    }),
    over: state.phase === 'over',
    ended: ended.state,
  };
};
