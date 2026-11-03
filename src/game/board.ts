// 個人ボードの座標と隣接（rules.md v0.8 2-1-2、2-1-3、2-1-3-2、2-1-3-3）。
//
// 座標の表し方は3通りある。
// - マス ID：行の文字と列番号（"A1"〜"F7"）。rules.md 2-1-3 の表記そのものである。
// - 横位置 x：8マスの行の i 列目は x＝i−1、7マスの行の j 列目は x＝j−0.5（decisions.md 2-1）。
// - アキシャル座標 (q, r)：r は行番号（A＝0〜F＝5）、q＝x − r/2。
//   六角形の形状（計画都市・自然公園）の平行移動・回転はこの座標で行う。
//
// 頂点が上を向く六角形を行ごとに半マスずらして並べるため、上下の行で隣接するのは
// 横位置が 0.5 違うマス同士である。アキシャル座標ではこれが標準の6方向の隣接と一致する。

export const ROW_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type RowLabel = (typeof ROW_LABELS)[number];

/** 各行のマス数（rules.md 2-1-2）。 */
export const ROW_LENGTHS: Readonly<Record<RowLabel, number>> = {
  A: 8,
  B: 7,
  C: 8,
  D: 7,
  E: 8,
  F: 7,
};

/** マス ID（"A1" など）。 */
export type CellId = `${RowLabel}${number}`;

export type Axial = { readonly q: number; readonly r: number };

export type Cell = {
  readonly id: CellId;
  readonly row: RowLabel;
  /** 行番号（A＝0〜F＝5）。 */
  readonly rowIndex: number;
  /** 列番号（1始まり、rules.md 2-1-3）。 */
  readonly col: number;
  /** 横位置（decisions.md 2-1）。描画では x に六角形の幅を掛ける。 */
  readonly x: number;
  readonly axial: Axial;
};

const isLongRow = (rowIndex: number): boolean => rowIndex % 2 === 0;

const xOf = (rowIndex: number, col: number): number => (isLongRow(rowIndex) ? col - 1 : col - 0.5);

const buildCells = (): readonly Cell[] => {
  const cells: Cell[] = [];
  ROW_LABELS.forEach((row, rowIndex) => {
    for (let col = 1; col <= ROW_LENGTHS[row]; col += 1) {
      const x = xOf(rowIndex, col);
      cells.push({
        id: `${row}${col}`,
        row,
        rowIndex,
        col,
        x,
        axial: { q: x - rowIndex / 2, r: rowIndex },
      });
    }
  });
  return cells;
};

/** 全45マス。A1, A2, …, F7 の順。 */
export const CELLS: readonly Cell[] = buildCells();

export const CELL_IDS: readonly CellId[] = CELLS.map((cell) => cell.id);

const cellById = new Map<string, Cell>(CELLS.map((cell) => [cell.id, cell]));

const axialKey = (axial: Axial): string => `${axial.q},${axial.r}`;
const cellByAxial = new Map<string, Cell>(CELLS.map((cell) => [axialKey(cell.axial), cell]));

export const isCellId = (value: string): value is CellId => cellById.has(value);

export const getCell = (id: CellId): Cell => {
  const cell = cellById.get(id);
  if (cell === undefined) {
    throw new Error(`存在しないマス ID である：${id}`);
  }
  return cell;
};

/** アキシャル座標にあるマスを返す。盤外なら undefined。 */
export const cellAtAxial = (axial: Axial): Cell | undefined => cellByAxial.get(axialKey(axial));

/** アキシャル座標の6方向。 */
export const AXIAL_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: -1, r: 0 },
  { q: 0, r: 1 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: -1, r: 1 },
];

const buildNeighbors = (): ReadonlyMap<CellId, readonly CellId[]> => {
  const map = new Map<CellId, readonly CellId[]>();
  for (const cell of CELLS) {
    const neighbors = AXIAL_DIRECTIONS.map((d) =>
      cellAtAxial({ q: cell.axial.q + d.q, r: cell.axial.r + d.r }),
    )
      .filter((n): n is Cell => n !== undefined)
      .map((n) => n.id);
    map.set(cell.id, neighbors);
  }
  return map;
};

const NEIGHBORS = buildNeighbors();

/** 辺を共有するマスの一覧（rules.md 2-1-3-3）。 */
export const neighborsOf = (id: CellId): readonly CellId[] => {
  const neighbors = NEIGHBORS.get(id);
  if (neighbors === undefined) {
    throw new Error(`存在しないマス ID である：${id}`);
  }
  return neighbors;
};

export const areAdjacent = (a: CellId, b: CellId): boolean => neighborsOf(a).includes(b);

/** ヘクス距離。隣接なら1。 */
export const hexDistance = (a: Axial, b: Axial): number => {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

/** アキシャル座標を原点まわりに60度×steps 回転する（steps は 0〜5）。鏡像は作らない。 */
export const rotateAxial = (axial: Axial, steps: number): Axial => {
  // キューブ座標 (x, y, z) = (q, -q-r, r) で (x, y, z) → (-z, -x, -y) が60度回転である。
  let x = axial.q;
  let z = axial.r;
  let y = -x - z;
  const n = ((steps % 6) + 6) % 6;
  for (let i = 0; i < n; i += 1) {
    [x, y, z] = [-z, -x, -y];
  }
  // -0 を 0 に揃える。
  return { q: x + 0, r: z + 0 };
};

/** アキシャル座標の集合が辺でつながっているか。空集合は false。 */
export const isConnectedAxial = (cells: readonly Axial[]): boolean => {
  if (cells.length === 0) {
    return false;
  }
  const keys = new Set(cells.map(axialKey));
  if (keys.size !== cells.length) {
    return false;
  }
  const first = cells[0];
  if (first === undefined) {
    return false;
  }
  const visited = new Set<string>([axialKey(first)]);
  const stack: Axial[] = [first];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) {
      break;
    }
    for (const d of AXIAL_DIRECTIONS) {
      const next = { q: current.q + d.q, r: current.r + d.r };
      const key = axialKey(next);
      if (keys.has(key) && !visited.has(key)) {
        visited.add(key);
        stack.push(next);
      }
    }
  }
  return visited.size === keys.size;
};
