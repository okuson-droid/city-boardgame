// 計画都市カードの達成の見込み（ユーザー決定 2026-11-15）。
// カードの形を盤面の全マス×6回転に写し、各配置について「済み・土地が要る・建物が要る・置けない」を数える。
// 判定の規則は planned.ts の plannedCityMatches と同じ（回転は可、鏡像は不可、19-1-6）。
// 足りないものの数は目安であり、資源が足りるか・他のプレイヤーの先着・残りのラウンド数は数えない。

import { CELL_IDS, cellAtAxial, getCell, neighborsOf, rotateAxial, type CellId } from './board.ts';
import { hasModifier, mismatchExtraMaterials } from './abilities.ts';
import { boardOf, remainingBuildingStock } from './core.ts';
import { plannedCityMatches } from './planned.ts';
import type { Building, GameData, PlannedCityCard, PlannedCitySlot, Terrain } from '../data/types.ts';
import type { PlayerState } from './types.ts';

const ROTATIONS = [0, 1, 2, 3, 4, 5];

/** 配置の1マスの状態。 */
export type ProspectSlotStatus =
  /** 条件どおりの土地と建物がある。 */
  | 'done'
  /** 土地はあり（種類も合う）、建物が要る。 */
  | 'needBuilding'
  /** 土地タイルも建物も要る。 */
  | 'needLand';

export type ProspectSlot = {
  readonly cell: CellId;
  readonly status: ProspectSlotStatus;
  /** 要る土地の種類（カードが指定しないマスは null）。 */
  readonly terrain: Terrain | null;
  /** 要る建物の種類（カードが指定しないマスは null＝どの建物でもよい）。 */
  readonly building: Building | null;
  /** 土地タイルを置くマスで、印刷された地形と違う種類が要る（開拓で追加の資材がかかる、効果の「地形と同じ種類」では置けない）。 */
  readonly mismatch: boolean;
};

export type ProspectPlacement = {
  readonly slots: readonly ProspectSlot[];
  /** 置く土地タイルの数（形の中）。 */
  readonly tiles: number;
  /** 建てる建物の数。 */
  readonly buildings: number;
  /** 地形と違う種類の土地タイルの数。 */
  readonly mismatches: number;
  /** 形が開拓済みの土地から離れているとき、つなぐために形の外に置く土地タイルの最少の数。 */
  readonly bridge: number;
  /** 足りないものの合計（tiles＋buildings＋bridge）。 */
  readonly steps: number;
};

export type PlannedCityProspect = {
  readonly card: string;
  /** いまの盤面で条件を満たしている。 */
  readonly achieved: boolean;
  /** 置ける配置の数（同じマスと条件の組は1つに数える）。 */
  readonly placementCount: number;
  /** 置ける配置を、足りないものが少ない順に並べたもの（最大 limit 件）。 */
  readonly placements: readonly ProspectPlacement[];
  /** 地形と違う種類の土地タイルに1枚あたりかかる追加の資材（デザイナーなら0）。 */
  readonly mismatchExtraMaterials: number;
};

/** 開拓済みの土地から各マスへ、空きマスを通って届くのに要る土地タイルの数（土地のあるマスは0、隣は1）。 */
const landDistances = (player: PlayerState): Map<CellId, number> => {
  const dist = new Map<CellId, number>();
  const queue: CellId[] = [];
  for (const id of CELL_IDS) {
    if (player.land[id] !== undefined) {
      dist.set(id, 0);
      queue.push(id);
    }
  }
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i] as CellId;
    const next = (dist.get(id) ?? 0) + 1;
    for (const n of neighborsOf(id)) {
      if (dist.has(n) || player.land[n] !== undefined) continue;
      dist.set(n, next);
      queue.push(n);
    }
  }
  return dist;
};

/** 形を回転・平行移動して盤面に写す。盤外に出れば undefined。 */
const placeSlots = (slots: readonly PlannedCitySlot[], rotation: number, anchor: CellId): { cell: CellId; slot: PlannedCitySlot }[] | undefined => {
  const first = slots[0];
  if (first === undefined) return undefined;
  const origin = rotateAxial(first, rotation);
  const at = getCell(anchor).axial;
  const result: { cell: CellId; slot: PlannedCitySlot }[] = [];
  for (const slot of slots) {
    const r = rotateAxial(slot, rotation);
    const cell = cellAtAxial({ q: r.q - origin.q + at.q, r: r.r - origin.r + at.r });
    if (cell === undefined) return undefined;
    result.push({ cell: cell.id, slot });
  }
  return result;
};

/** 1つの配置を評価する。置けない（別の建物・違う種類の土地・精霊チップ・建物の上限）なら undefined。 */
const evaluate = (
  d: GameData,
  player: PlayerState,
  placed: readonly { cell: CellId; slot: PlannedCitySlot }[],
  distances: ReadonlyMap<CellId, number>,
  chips: ReadonlySet<CellId>,
): ProspectPlacement | undefined => {
  const board = boardOf(d, player);
  const slots: ProspectSlot[] = [];
  const needByType = new Map<Building, number>();
  for (const { cell, slot } of placed) {
    const building = player.buildings[cell];
    const land = player.land[cell];
    if (building !== undefined) {
      if (slot.building !== null && slot.building !== building) return undefined;
      if (slot.terrain !== null && land !== slot.terrain) return undefined;
      slots.push({ cell, status: 'done', terrain: slot.terrain, building: slot.building, mismatch: false });
      continue;
    }
    if (chips.has(cell)) return undefined;
    if (slot.building !== null) needByType.set(slot.building, (needByType.get(slot.building) ?? 0) + 1);
    if (land !== undefined) {
      if (slot.terrain !== null && land !== slot.terrain) return undefined;
      slots.push({ cell, status: 'needBuilding', terrain: slot.terrain, building: slot.building, mismatch: false });
      continue;
    }
    const printed = board.squares[cell]?.terrain;
    slots.push({ cell, status: 'needLand', terrain: slot.terrain, building: slot.building, mismatch: slot.terrain !== null && printed !== slot.terrain });
  }
  for (const [building, n] of needByType) {
    if (remainingBuildingStock(d, player, building) < n) return undefined;
  }
  const needLand = slots.filter((s) => s.status === 'needLand');
  // 形の中に土地があれば、形のマスを順に隣へ広げて置ける。なければ最も近いマスまでつなぐ。
  // 開拓済みの土地がまだない盤面（ドラフトの前など）では、つなぐ数を数えない。
  const bridge =
    needLand.length === slots.length && distances.size > 0
      ? Math.max(0, Math.min(...needLand.map((s) => distances.get(s.cell) ?? Infinity)) - 1)
      : 0;
  if (!Number.isFinite(bridge)) return undefined;
  const tiles = needLand.length;
  const buildings = slots.filter((s) => s.status !== 'done').length;
  return { slots, tiles, buildings, mismatches: needLand.filter((s) => s.mismatch).length, bridge, steps: tiles + buildings + bridge };
};

/**
 * 計画都市カードの達成の見込み（ユーザー決定 2026-11-15）。盤面の全マスを起点に6回転を試し、置ける配置を足りないものが少ない順に返す。
 * 何も置いていない盤面でも使える（その盤での達成のしやすさの目安になる）。
 */
export const plannedCityProspect = (d: GameData, player: PlayerState, card: PlannedCityCard, limit = 5): PlannedCityProspect => {
  const distances = landDistances(player);
  const chips = hasModifier(d, player, 'noBuildOnSpiritLand') ? new Set(Object.values(player.spiritChips)) : new Set<CellId>();
  const seen = new Set<string>();
  const found: ProspectPlacement[] = [];
  for (const rotation of ROTATIONS) {
    for (const anchor of CELL_IDS) {
      const placed = placeSlots(card.slots, rotation, anchor);
      if (placed === undefined) continue;
      const key = placed
        .map(({ cell, slot }) => `${cell}:${slot.terrain ?? '*'}:${slot.building ?? '*'}`)
        .sort()
        .join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      const placement = evaluate(d, player, placed, distances, chips);
      if (placement !== undefined) found.push(placement);
    }
  }
  found.sort((a, b) => a.steps - b.steps || a.mismatches - b.mismatches || a.tiles - b.tiles);
  return {
    card: card.id,
    achieved: plannedCityMatches(card, player),
    placementCount: found.length,
    placements: found.slice(0, limit),
    mismatchExtraMaterials: mismatchExtraMaterials(d, player),
  };
};

/** 見込みの短い文（例：「あと3（土地1・建物2）」）。 */
export const prospectSummary = (p: PlannedCityProspect): string => {
  if (p.achieved) return '達成している';
  const best = p.placements[0];
  if (best === undefined) return 'この盤面では達成できない';
  const parts = [
    ...(best.tiles + best.bridge > 0 ? [`土地${best.tiles + best.bridge}`] : []),
    ...(best.buildings > 0 ? [`建物${best.buildings}`] : []),
  ];
  return `あと${best.steps}（${parts.join('・')}）`;
};
