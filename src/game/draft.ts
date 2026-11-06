// 準備のドラフトの順番（rules.md 2-6-7）と、そのヴァリアント（スネークドラフト）。画面とエンジンの両方から使う。

import type { GameVariants } from './types.ts';

/**
 * ドラフトで選ぶ人の列（3巡分）。
 * - 標準（rules.md 2-6-7）：手番順の最後から逆順に選び、一巡したら再び最後から同じ順番で選ぶ（N…1、N…1、N…1）。
 * - スネークドラフト（ヴァリアント、ユーザー決定 2026-11-06。スイーツランドの準備のドラフトに倣う）：
 *   2巡目だけ向きを反転する（N…1、1…N、N…1）。
 */
export const draftPickOrder = (turnOrder: readonly number[], variants: GameVariants | undefined): number[] => {
  const backward = [...turnOrder].reverse();
  const second = variants?.snakeDraft === true ? [...turnOrder] : backward;
  return [...backward, ...second, ...backward];
};
