import { describe, expect, it } from 'vitest';
import {
  CELLS,
  CELL_IDS,
  ROW_LABELS,
  ROW_LENGTHS,
  areAdjacent,
  cellAtAxial,
  getCell,
  hexDistance,
  isCellId,
  isConnectedAxial,
  neighborsOf,
  rotateAxial,
  type CellId,
} from '../src/game/board.ts';

const sorted = (ids: readonly CellId[]): CellId[] => [...ids].sort();

describe('個人ボードのマス', () => {
  it('6行45マスで、各行のマス数は 8・7・8・7・8・7 である', () => {
    // rules.md v0.8 2-1-2
    expect(CELLS).toHaveLength(45);
    expect(ROW_LABELS.map((row) => CELLS.filter((c) => c.row === row).length)).toEqual([8, 7, 8, 7, 8, 7]);
    expect(ROW_LENGTHS).toEqual({ A: 8, B: 7, C: 8, D: 7, E: 8, F: 7 });
  });

  it('座標は上から A〜F、各行の左から1始まりで表す', () => {
    // rules.md v0.8 2-1-3
    expect(CELL_IDS.slice(0, 9)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'B1']);
    expect(CELL_IDS.at(-1)).toBe('F7');
    expect(isCellId('A8')).toBe(true);
    expect(isCellId('B8')).toBe(false);
    expect(isCellId('G1')).toBe(false);
    expect(isCellId('A0')).toBe(false);
  });

  it('7マスの行は8マスの行に対して左右両端とも半マス内側に並ぶ', () => {
    // rules.md v0.8 2-1-3-2（decisions.md 2-1：8マスの行の i 列目は x＝i−1、7マスの行の j 列目は x＝j−0.5）
    expect(getCell('A1').x).toBe(0);
    expect(getCell('A8').x).toBe(7);
    expect(getCell('B1').x).toBe(0.5);
    expect(getCell('B7').x).toBe(6.5);
    expect(getCell('F7').x).toBe(6.5);
  });
});

describe('マスの隣接', () => {
  it('隣接は対称である', () => {
    // rules.md v0.8 2-1-3-3
    for (const id of CELL_IDS) {
      for (const neighbor of neighborsOf(id)) {
        expect(neighborsOf(neighbor)).toContain(id);
      }
    }
  });

  it('自分自身とは隣接せず、隣接するマスは6つ以下である', () => {
    // rules.md v0.8 2-1-3-3
    for (const id of CELL_IDS) {
      expect(neighborsOf(id)).not.toContain(id);
      expect(neighborsOf(id).length).toBeLessThanOrEqual(6);
      expect(new Set(neighborsOf(id)).size).toBe(neighborsOf(id).length);
    }
  });

  it('E1 は D1・E2・F1 に隣接する', () => {
    // rules.md v0.8 2-1-3-3（decisions.md 2-1 の例）
    expect(sorted(neighborsOf('E1'))).toEqual(['D1', 'E2', 'F1']);
  });

  it('同じ行では列番号が1違うマス同士が隣接する', () => {
    // rules.md v0.8 2-1-3-3
    expect(areAdjacent('C3', 'C4')).toBe(true);
    expect(areAdjacent('C3', 'C5')).toBe(false);
    expect(areAdjacent('A8', 'B1')).toBe(false);
  });

  it('7マスの行の j 列目は、上下の8マスの行の j 列目と j＋1 列目に隣接する', () => {
    // rules.md v0.8 2-1-3-3
    for (const cell of CELLS.filter((c) => ROW_LENGTHS[c.row] === 7)) {
      const rowIndex = ROW_LABELS.indexOf(cell.row);
      const expected: CellId[] = [];
      for (const adjacentRow of [ROW_LABELS[rowIndex - 1], ROW_LABELS[rowIndex + 1]]) {
        if (adjacentRow !== undefined) {
          expected.push(`${adjacentRow}${cell.col}`, `${adjacentRow}${cell.col + 1}`);
        }
      }
      const sameRow = [cell.col - 1, cell.col + 1]
        .filter((col) => col >= 1 && col <= 7)
        .map((col): CellId => `${cell.row}${col}`);
      expect(sorted(neighborsOf(cell.id))).toEqual(sorted([...expected, ...sameRow]));
    }
  });

  it('8マスの行の i 列目は、上下の7マスの行の i−1 列目と i 列目に隣接する', () => {
    // rules.md v0.8 2-1-3-3（decisions.md 2-1）
    expect(sorted(neighborsOf('C1'))).toEqual(['B1', 'C2', 'D1']);
    expect(sorted(neighborsOf('C8'))).toEqual(['B7', 'C7', 'D7']);
    expect(sorted(neighborsOf('C4'))).toEqual(['B3', 'B4', 'C3', 'C5', 'D3', 'D4']);
    expect(sorted(neighborsOf('A1'))).toEqual(['A2', 'B1']);
  });

  it('隣接はヘクス距離1と一致する', () => {
    // rules.md v0.8 2-1-3-3
    for (const a of CELLS) {
      for (const b of CELLS) {
        expect(areAdjacent(a.id, b.id)).toBe(hexDistance(a.axial, b.axial) === 1);
      }
    }
  });
});

describe('形状の判定に用いる座標の操作', () => {
  it('アキシャル座標からマスを引ける', () => {
    // rules.md v0.8 2-1-3-2（座標系の実装）
    for (const cell of CELLS) {
      expect(cellAtAxial(cell.axial)?.id).toBe(cell.id);
    }
    expect(cellAtAxial({ q: -1, r: 0 })).toBeUndefined();
  });

  it('60度回転を6回行うと元に戻り、回転で距離は変わらない', () => {
    // rules.md v0.8 19-1-5、19-1-6（回転を認める）
    const p = { q: 2, r: -1 };
    expect(rotateAxial(p, 6)).toEqual(p);
    expect(rotateAxial(p, 0)).toEqual(p);
    expect(rotateAxial(rotateAxial(p, 2), 4)).toEqual(p);
    for (let s = 0; s < 6; s += 1) {
      expect(hexDistance(rotateAxial(p, s), { q: 0, r: 0 })).toBe(hexDistance(p, { q: 0, r: 0 }));
    }
    expect(rotateAxial({ q: 1, r: 0 }, 3)).toEqual({ q: -1, r: 0 });
  });

  it('つながりの判定', () => {
    // rules.md v0.8 14-3-2（辺を共有して隣接）
    expect(isConnectedAxial([{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: 1 }])).toBe(true);
    expect(isConnectedAxial([{ q: 0, r: 0 }, { q: 2, r: 0 }])).toBe(false);
    expect(isConnectedAxial([{ q: 0, r: 0 }, { q: 0, r: 0 }])).toBe(false);
    expect(isConnectedAxial([])).toBe(false);
  });
});
