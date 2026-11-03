// ゲーム終了時の得点計算（第17章）と同点判定（17-7-2）。
// ゲーム中の得点は1本の得点トラック（player.score）に記録し、評価軸の区分は出来事から集計する（17-0-3）。
// 自然公園・計画都市・特別な市民カード・キャラクターの終了時得点は段階3で加える。

import { GAME_DATA } from '../data/index.ts';
import { SCORE_AXES, type GameData, type ScoreAxis } from '../data/types.ts';
import { buildingCount, landCount } from './core.ts';
import type { GameState, PlayerState } from './types.ts';

export type FinalScore = {
  readonly player: number;
  readonly total: number;
  /** 基礎得点（17-1）。 */
  readonly base: number;
  /** 評価軸ごとの得点。ゲーム中の得点を含む。「その他」は 17-0-2。 */
  readonly axes: Readonly<Record<ScoreAxis, number>>;
  /** 経済・産業の金換算後、得点に換算されずに残った金（17-7-2 の1段目）。 */
  readonly leftoverGold: number;
  /** 順位（1始まり）。17-7-2 の比較でも並ぶ場合は同じ順位とする。 */
  readonly rank: number;
};

const tableAt = <T>(table: readonly T[], index: number): T => {
  const value = table[Math.min(index, table.length - 1)];
  if (value === undefined) {
    throw new Error('換算表が空である');
  }
  return value;
};

const scorePlayer = (state: GameState, d: GameData, player: PlayerState): Omit<FinalScore, 'rank'> => {
  const s = d.params.scoring;
  const axes: Record<ScoreAxis, number> = { economy: 0, culture: 0, welfare: 0, nature: 0, military: 0, other: 0 };

  // ゲーム中に得た得点（17-0-2、17-0-3）。
  for (const event of state.events) {
    if (event.type === 'score' && event.player === player.index) {
      axes[event.axis] += event.points;
    }
  }

  // 基礎得点（17-1-3、17-1-4）。
  const base =
    Math.floor(landCount(player) / s.base.landTilesPerPoint) +
    Math.floor(buildingCount(player) / s.base.buildingsPerPoint) +
    Math.floor(player.regularWorkers / s.base.regularWorkersPerPoint);

  // 経済・産業（17-2）。
  const goldRate = tableAt(s.goldPerPointByShops, buildingCount(player, 'shop'));
  const materialRate = tableAt(s.materialsPerPointByWorkshops, buildingCount(player, 'workshop'));
  axes.economy += Math.floor(player.gold / goldRate) + Math.floor(player.materials / materialRate);
  const leftoverGold = player.gold % goldRate;

  // 文化・学術（17-3）。
  const cardPoints = player.played.reduce(
    (sum, id) => sum + (d.civilizationCards.find((c) => c.id === id)?.points ?? 0),
    0,
  );
  const cardRate = tableAt(s.civCardsPerPointByUniversities, buildingCount(player, 'university'));
  axes.culture += cardPoints + Math.floor(player.played.length / cardRate);

  // 生活・福祉（17-4）。
  const divisor = tableAt(s.regularWorkersDivisorByOffices, buildingCount(player, 'office'));
  if (divisor !== null) {
    axes.welfare += Math.floor(player.regularWorkers / divisor);
  }

  const total = base + SCORE_AXES.reduce((sum, axis) => sum + axes[axis], 0);
  return { player: player.index, total, base, axes, leftoverGold };
};

/** 最終得点と順位（17-7）。同点は残った金、基礎得点の順に比べ、それでも同じなら同順位とする。 */
export const finalScores = (state: GameState, d: GameData = GAME_DATA): FinalScore[] => {
  const scores = state.players.map((p) => scorePlayer(state, d, p));
  const compare = (a: Omit<FinalScore, 'rank'>, b: Omit<FinalScore, 'rank'>): number =>
    b.total - a.total || b.leftoverGold - a.leftoverGold || b.base - a.base;
  return scores.map((score) => ({
    ...score,
    rank: 1 + scores.filter((other) => compare(other, score) < 0).length,
  }));
};
