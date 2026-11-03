// 計画都市カード（第13章、19-1-6、19-4-7、19-5-3）と自然公園カード（第14章、19-1-5、19-4-8）の判定。
// 形状はアキシャル座標の相対位置で持ち、回転（60度ずつ6通り）を認め、鏡像は認めない。

import { cellAtAxial, getCell, rotateAxial, type CellId } from './board.ts';
import { modifiersOf } from './abilities.ts';
import type { GameData, NatureParkSet, PlannedCityCard } from '../data/types.ts';
import type { GameState, PlayerState } from './types.ts';

const ROTATIONS = [0, 1, 2, 3, 4, 5];

/** 形状の各マスを、回転と平行移動で盤面のマスに写す。盤外に出る配置は undefined。 */
const placeShape = <T extends { q: number; r: number }>(
  shape: readonly T[],
  rotation: number,
  anchor: { q: number; r: number },
): { cell: CellId; slot: T }[] | undefined => {
  const first = shape[0];
  if (first === undefined) return undefined;
  const origin = rotateAxial(first, rotation);
  const result: { cell: CellId; slot: T }[] = [];
  for (const slot of shape) {
    const rotated = rotateAxial(slot, rotation);
    const cell = cellAtAxial({ q: rotated.q - origin.q + anchor.q, r: rotated.r - origin.r + anchor.r });
    if (cell === undefined) return undefined;
    result.push({ cell: cell.id, slot });
  }
  return result;
};

/** 計画都市カードの条件を満たす建物の組が盤面にあるか（13-2、19-1-6）。 */
export const plannedCityMatches = (card: PlannedCityCard, player: PlayerState): boolean => {
  const buildingCells = (Object.keys(player.buildings) as CellId[]).filter((c) => player.buildings[c] !== undefined);
  for (const rotation of ROTATIONS) {
    for (const anchorCell of buildingCells) {
      const placed = placeShape(card.slots, rotation, getCell(anchorCell).axial);
      if (
        placed?.every(({ cell, slot }) => {
          const building = player.buildings[cell];
          if (building === undefined) return false;
          if (slot.building !== null && slot.building !== building) return false;
          if (slot.terrain !== null && player.land[cell] !== slot.terrain) return false;
          return true;
        })
      ) {
        return true;
      }
    }
  }
  return false;
};

/** 宣言できる計画都市カード。共有カードは先着の人数まで、専用カードは持ち主だけ（13-3-5、19-5-3）。 */
export const declarablePlannedCities = (state: GameState, d: GameData, player: PlayerState): string[] => {
  const setup = d.params.setupByPlayerCount[String(state.players.length)];
  const maxDeclarers = setup?.plannedCityMaxDeclarers ?? 0;
  const result: string[] = [];
  const candidates = [
    ...state.plannedCityRevealed.map((id) => ({ id, shared: true })),
    ...player.privatePlannedCities.map((id) => ({ id, shared: false })),
  ];
  for (const { id, shared } of candidates) {
    const claims = state.plannedCityClaims[id] ?? [];
    if (claims.includes(player.index)) continue;
    if (shared && claims.length >= maxDeclarers) continue;
    const card = d.plannedCityCards.find((c) => c.id === id);
    if (card !== undefined && plannedCityMatches(card, player)) result.push(id);
  }
  return result;
};

// ---------------------------------------------------------------------------
// 自然公園
// ---------------------------------------------------------------------------

/** セットを置ける配置（建物のない土地で、土地の種類が一致する、14-3-1〜14-3-3）。 */
const setPlacements = (set: NatureParkSet, player: PlayerState): CellId[][] => {
  const free = (Object.keys(player.land) as CellId[]).filter((c) => player.land[c] !== undefined && player.buildings[c] === undefined);
  const seen = new Set<string>();
  const result: CellId[][] = [];
  for (const rotation of ROTATIONS) {
    for (const anchorCell of free) {
      const placed = placeShape(set.cells, rotation, getCell(anchorCell).axial);
      if (!placed?.every(({ cell, slot }) => player.buildings[cell] === undefined && player.land[cell] === slot.terrain)) continue;
      const cells = placed.map((p) => p.cell);
      const key = [...cells].sort().join(',');
      if (!seen.has(key)) {
        seen.add(key);
        result.push(cells);
      }
    }
  }
  return result;
};

/** セットの枚数ごとの得点。特別市民08 は表を置き換える。 */
const natureParkTable = (d: GameData, player: PlayerState): Readonly<Record<string, number>> => {
  const override = modifiersOf(d, player).find((m) => m.kind === 'natureParkPoints');
  return override?.kind === 'natureParkPoints' ? override.table : d.params.scoring.natureParkPointsBySetSize;
};

/** 自然公園の得点。同じ土地タイルを複数セットで共有せず、得点が最大になる割り当てで計算する（14-3-4、19-4-8）。 */
export const natureParkScore = (d: GameData, player: PlayerState): number => {
  const card = d.natureParkCards.find((c) => c.id === player.natureParkCard);
  if (card === undefined) return 0;
  const table = natureParkTable(d, player);
  const sets = card.sets.map((set) => ({ points: table[String(set.cells.length)] ?? 0, placements: setPlacements(set, player) }));
  let best = 0;
  const search = (index: number, used: Set<CellId>, total: number): void => {
    if (total > best) best = total;
    if (index >= sets.length) return;
    const set = sets[index];
    if (set === undefined) return;
    search(index + 1, used, total);
    for (const placement of set.placements) {
      if (placement.some((c) => used.has(c))) continue;
      const next = new Set(used);
      for (const c of placement) next.add(c);
      search(index + 1, next, total + set.points);
    }
  };
  search(0, new Set(), 0);
  return best;
};
