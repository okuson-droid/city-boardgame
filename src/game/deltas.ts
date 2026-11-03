// 資源・生産力・ワーカー・トラック・得点・手札の増減を、出来事（delta）として記録する（ui_design.md 0-2、4-1）。
// 画面は演出をこの出来事だけで組み立て、状態の差分から推測しない。
// 増減は、選択1つの処理（cause＝move）と、自動の処理（ラウンド開始・収入など、cause＝タスクの種類）ごとにまとめる。

import type { GameState } from './types.ts';

export const DELTA_KEYS = [
  'gold',
  'materials',
  'militaryTokens',
  'goldProduction',
  'materialProduction',
  'regularWorkers',
  'tempWorkers',
  'militaryLevel',
  'infraLevel',
  'score',
  'hand',
] as const;
export type DeltaKey = (typeof DELTA_KEYS)[number];

export type Snapshot = readonly Record<DeltaKey, number>[];

export const snapshot = (state: GameState): Snapshot =>
  state.players.map((p) => ({
    gold: p.gold,
    materials: p.materials,
    militaryTokens: p.militaryTokens,
    goldProduction: p.goldProduction,
    materialProduction: p.materialProduction,
    regularWorkers: p.regularWorkers,
    tempWorkers: p.tempWorkers,
    militaryLevel: p.militaryLevel,
    infraLevel: p.infraLevel,
    score: p.score,
    hand: p.hand.length,
  }));

/** before からの増減を、プレイヤーごとに1つの出来事として記録する。増減がなければ記録しない。 */
export const recordDeltas = (state: GameState, before: Snapshot, cause: string): void => {
  const after = snapshot(state);
  after.forEach((now, player) => {
    const was = before[player];
    if (was === undefined) return;
    const changes: Partial<Record<DeltaKey, number>> = {};
    for (const key of DELTA_KEYS) {
      const diff = now[key] - was[key];
      if (diff !== 0) changes[key] = diff;
    }
    if (Object.keys(changes).length > 0) {
      state.events.push({ type: 'delta', player, cause, changes });
    }
  });
};
