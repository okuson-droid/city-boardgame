// 仮置きの個人ボード（board_1.json〜board_5.json）を、シード付きの乱数で生成する（指示書 2-2）。
// 実行：npm run gen:data
//
// - 枚数は5枚（4人プレイのドラフトで「プレイ人数より多い」を満たす数、rules.md 2-6-2）。
// - 地形の内訳は rules.md 2-1-5（水場7・山岳7・平原16・森林15）、E1・F1 は森林（2-1-7）。
// - マスボーナスは各ボード6マスに、資材1・金2・文明カード1枚・軍事力トークン1のいずれかを置く。
//   E1・F1 には置かない（rules.md 4-4-4-2）。
// 同じシードからは同じボードができる。

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CELL_IDS, type CellId } from '../src/game/board.ts';
import { createRng, nextInt, shuffle, type RngState } from '../src/game/rng.ts';

const BOARD_COUNT = 5;
const BASE_SEED = 20261103;
const BONUS_SQUARES_PER_BOARD = 6;
const BONUS_CHOICES = [
  { kind: 'materials', amount: 1 },
  { kind: 'gold', amount: 2 },
  { kind: 'drawCivCards', amount: 1 },
  { kind: 'militaryTokens', amount: 1 },
] as const;

type Square = { terrain: string; bonus: (typeof BONUS_CHOICES)[number] | null };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// 地形の内訳と初期マスは params.json から読む（数値をコードに二重に持たない）。
type BoardParams = {
  board: { terrainCounts: Record<string, number>; initialCells: CellId[]; initialTerrain: string };
};
const params = JSON.parse(readFileSync(join(root, 'src', 'data', 'params.json'), 'utf8')) as BoardParams;
const TERRAIN_COUNTS = params.board.terrainCounts;
const INITIAL_CELLS: readonly CellId[] = params.board.initialCells;
const INITIAL_TERRAIN = params.board.initialTerrain;

const generateBoard = (index: number): Record<string, unknown> => {
  const seed = BASE_SEED + index;
  let rng: RngState = createRng(seed);

  // 初期マスの森林を除いた残りの地形を並べ替えて、初期マス以外に割り当てる。
  const pool: string[] = [];
  for (const [terrain, count] of Object.entries(TERRAIN_COUNTS)) {
    const remaining = terrain === INITIAL_TERRAIN ? count - INITIAL_CELLS.length : count;
    for (let i = 0; i < remaining; i += 1) {
      pool.push(terrain);
    }
  }
  const otherCells = CELL_IDS.filter((id) => !INITIAL_CELLS.includes(id));
  if (pool.length !== otherCells.length) {
    throw new Error('地形の内訳とマス数が合わない');
  }
  const [terrains, afterTerrain] = shuffle(pool, rng);
  rng = afterTerrain;

  const squares: Record<string, Square> = {};
  for (const id of CELL_IDS) {
    squares[id] = { terrain: INITIAL_TERRAIN, bonus: null };
  }
  otherCells.forEach((id, i) => {
    squares[id] = { terrain: terrains[i] ?? INITIAL_TERRAIN, bonus: null };
  });

  const [bonusCells, afterCells] = shuffle(otherCells, rng);
  rng = afterCells;
  for (const id of bonusCells.slice(0, BONUS_SQUARES_PER_BOARD)) {
    const [choice, next] = nextInt(rng, BONUS_CHOICES.length);
    rng = next;
    const square = squares[id];
    if (square !== undefined) {
      square.bonus = BONUS_CHOICES[choice] ?? null;
    }
  }

  return {
    id: `board_${index + 1}`,
    name: `個人ボード${index + 1}`,
    provisional: true,
    generatedWithSeed: seed,
    notes: ['地形配置とマスボーナスは仮置きである（指示書 2-2）。scripts/generate-boards.ts で生成した。'],
    squares,
  };
};

for (let i = 0; i < BOARD_COUNT; i += 1) {
  const board = generateBoard(i);
  const path = join(root, 'src', 'data', `board_${i + 1}.json`);
  writeFileSync(path, `${JSON.stringify(board, null, 2)}\n`, 'utf8');
  console.log(`書き出した：src/data/board_${i + 1}.json`);
}
