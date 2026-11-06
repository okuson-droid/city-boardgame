// アクション（rules.md 6-3）と、土地・建物の配置（第4章・第5章）の選択タスク。
// 各アクションは「実行できるか」（6-1-6：何も実行しない選び方はできない）と、
// 実行内容の選択・コストの確定（6-1-7）・効果の処理からなる。

import type { CellId } from './board.ts';
import {
  baseBuildCost,
  buildEffects,
  buildingCount,
  drawCivCards,
  emit,
  emptyCellCount,
  freeLandCells,
  gainRegularWorkers,
  gainTempWorkers,
  placeableCells,
  playerOf,
  processEffects,
  putBuilding,
  putLandTile,
  regularWorkerCap,
  remainingBuildingStock,
  squareBonusEffects,
  removeTask,
  scheduleChoices,
  terrainOf,
  usableTemp,
  type Effect,
  payMilitaryTokens,
  tokenBudget,
} from './core.ts';
import { hasModifier, mismatchExtraMaterials, modifiersOf } from './abilities.ts';
import { runCommands } from './effects.ts';
import type { Command } from '../data/script.ts';
import { BUILDINGS, TERRAINS, type Action, type Building, type GameData, type Grant, type Terrain, type Tier } from '../data/types.ts';
import type { BuildPick, BuildSpec, ChoiceEffect, GameState, Option, PlayerState, Task } from './types.ts';

type TaskOf<T extends Task['t']> = Extract<Task, { t: T }>;

const opt = (player: number, id: string, label: string): Option => ({ id, player, label });

const range = (from: number, to: number): number[] => {
  const result: number[] = [];
  for (let i = from; i <= to; i += 1) {
    result.push(i);
  }
  return result;
};

const parseParts = (id: string, prefix: string): string[] => {
  if (!id.startsWith(`${prefix}:`)) {
    throw new Error(`選択肢の形式が違う：${id}`);
  }
  return id.slice(prefix.length + 1).split(':');
};

const parseCount = (id: string): number => Number(parseParts(id, 'count')[0]);

// ---------------------------------------------------------------------------
// 開拓（6-3-1、第4章、19-1-1、19-1-2）
// ---------------------------------------------------------------------------

const pioneerMinCost = (d: GameData, player: PlayerState, tier: Tier, tiles: number, mismatches: number): number => {
  const land = d.params.land;
  // デザイナーは地形と異なる土地タイルの追加コストが不要になる。
  const raw = tiles * land.materialsPerTile + mismatches * mismatchExtraMaterials(d, player);
  return Math.max(land.minTotalMaterials, raw - d.params.actions.pioneer[tier].materialDiscount);
};

const pioneerMaxTiles = (d: GameData, player: PlayerState, tier: Tier): number =>
  Math.min(d.params.actions.pioneer[tier].maxTiles, emptyCellCount(player));

const canPioneer = (d: GameData, player: PlayerState, tier: Tier): boolean =>
  pioneerMaxTiles(d, player, tier) >= 1 && pioneerMinCost(d, player, tier, 1, 0) <= player.materials;

export const pioneerCountOptions = (d: GameData, state: GameState, task: TaskOf<'pioneerCount'>): Option[] => {
  const player = playerOf(state, task.player);
  // 枚数は空きマスの数まで（ユーザー決定 2026-11-03、19-1-4 に揃える）。
  return range(1, pioneerMaxTiles(d, player, task.tier))
    .filter((k) => pioneerMinCost(d, player, task.tier, k, 0) <= player.materials)
    .map((k) => opt(task.player, `count:${k}`, `${k}枚配置する`));
};

export const applyPioneerCount = (state: GameState, task: TaskOf<'pioneerCount'>, id: string): void => {
  removeTask(state, task);
  state.stack.push({
    t: 'placeTiles',
    player: task.player,
    remaining: parseCount(id),
    placed: [],
    mode: 'pioneer',
    tier: task.tier,
    mismatches: 0,
    tile: 'any',
  });
};

export const placeTilesOptions = (d: GameData, state: GameState, task: TaskOf<'placeTiles'>): Option[] => {
  const player = playerOf(state, task.player);
  const options: Option[] = [];
  for (const cell of placeableCells(player)) {
    const terrain = terrainOf(d, player, cell);
    if (task.mode === 'effect') {
      // 効果による配置は資材を払わない（19-1-1）。種類は地形と同じ（4-2-2）か、効果の特記に従う（4-2-3、4-2-5）。
      const tiles = task.tile === 'match' ? [terrain] : task.tile === 'any' ? [...TERRAINS] : [task.tile];
      // 大規模開拓：この配置で置いた種類は置けない。置く順番は選べる（ユーザー決定 2026-11-06）。
      const used = task.distinct === true ? new Set(task.placed.map((c) => player.land[c])) : new Set<Terrain | undefined>();
      for (const tile of tiles.filter((t) => !used.has(t))) {
        options.push(opt(task.player, `tile:${cell}:${tile}`, `${cell} に ${tile}`));
      }
      continue;
    }
    const tier = task.tier ?? 'normal';
    const tilesTotal = task.placed.length + task.remaining;
    for (const tile of TERRAINS) {
      const mismatches = task.mismatches + (tile === terrain ? 0 : 1);
      // コストは配置をすべて選んだ時点で確定する。残りを地形一致で置いても払えない選び方は選べない（6-1-7）。
      if (pioneerMinCost(d, player, tier, tilesTotal, mismatches) <= player.materials) {
        options.push(opt(task.player, `tile:${cell}:${tile}`, `${cell} に ${tile}`));
      }
    }
  }
  // 「〜枚まで」は途中で（0枚でも）配置を終えられる。
  if (task.upTo === true && options.length > 0) {
    options.push(opt(task.player, 'done', '配置を終える'));
  }
  return options;
};

export const applyPlaceTile = (state: GameState, d: GameData, task: TaskOf<'placeTiles'>, id: string): void => {
  if (id === 'done') {
    // 自分で終えた残りは不発ではない。
    task.remaining = 0;
    finishPlaceTiles(state, d, task);
    return;
  }
  const [cellText, tileText] = parseParts(id, 'tile');
  const player = playerOf(state, task.player);
  const cell = cellText as CellId;
  const tile = tileText as Terrain;
  if (tile !== terrainOf(d, player, cell)) {
    task.mismatches += 1;
  }
  putLandTile(state, d, player, cell, tile);
  task.placed.push(cell);
  task.remaining -= 1;
  if (task.remaining === 0) {
    finishPlaceTiles(state, d, task);
  }
};

/** 配置の終わり。開拓なら資材を払い、マスボーナスをまとめて処理する（4-4-4）。配置先がない分は破棄する（4-4-5）。 */
export const finishPlaceTiles = (state: GameState, d: GameData, task: TaskOf<'placeTiles'>): void => {
  removeTask(state, task);
  const player = playerOf(state, task.player);
  if (task.remaining > 0) {
    emit(state, d, { type: 'fizzle', player: task.player, what: `landTiles:${task.remaining}` });
  }
  if (task.mode === 'pioneer') {
    player.materials -= pioneerMinCost(d, player, task.tier ?? 'normal', task.placed.length, task.mismatches);
  }
  processEffects(state, d, player, squareBonusEffects(d, player, task.placed));
};

// ---------------------------------------------------------------------------
// 建設（第5章、6-3-2、6-3-6-7、5-6-7、19-1-3、19-1-4）
// ---------------------------------------------------------------------------

/** 建築アクションの建設の指定（6-3-2-1）。 */
export const actionBuildSpec = (d: GameData, tier: Tier): BuildSpec => ({
  min: 1,
  max: d.params.actions.build[tier].maxBuildings,
  tier,
  buildings: null,
  terrain: null,
  payGold: true,
  payMaterials: true,
});

/** 建設の権利（6-3-6-7）。建築アクションの割引は適用しない（19-1-3）。 */
const BUILD_RIGHT_SPEC: BuildSpec = { min: 1, max: 1, tier: null, buildings: null, terrain: null, payGold: true, payMaterials: true };

/** 複数建設の合計コスト。建築アクションの割引を適用し、0未満にしない（5-6-6）。無料の部分は払わない（5-6-7）。 */
export const buildTotalCost = (
  d: GameData,
  player: PlayerState,
  picks: readonly BuildPick[],
  spec: Pick<BuildSpec, 'tier' | 'payGold' | 'payMaterials'>,
): { gold: number; materials: number } => {
  let gold = 0;
  let materials = 0;
  for (const pick of picks) {
    const cost = baseBuildCost(d, player, pick.building, pick.cell);
    gold += cost.gold;
    materials += cost.materials;
  }
  const discount = spec.tier === null ? { goldDiscount: 0, materialDiscount: 0 } : d.params.actions.build[spec.tier];
  const min = d.params.buildings.minCost;
  return {
    gold: spec.payGold ? Math.max(min, gold - discount.goldDiscount) : 0,
    materials: spec.payMaterials ? Math.max(min, materials - discount.materialDiscount) : 0,
  };
};

const affordable = (player: PlayerState, cost: { gold: number; materials: number }): boolean =>
  cost.gold <= player.gold && cost.materials <= player.materials;

/** 建物を建てられる土地。精霊チップのある土地には建てられない（精霊使い）。 */
const buildableCells = (d: GameData, player: PlayerState): CellId[] => {
  const blocked = hasModifier(d, player, 'noBuildOnSpiritLand') ? new Set(Object.values(player.spiritChips)) : new Set();
  return freeLandCells(player).filter((cell) => !blocked.has(cell));
};

/** 追加で選べる建設（種類と場所）。上限・空き地・コストを満たすものだけ（6-3-2-2、19-1-4、6-1-7）。 */
const buildCandidates = (d: GameData, player: PlayerState, spec: BuildSpec, picks: readonly BuildPick[]): BuildPick[] => {
  const pickedCells = new Set(picks.map((p) => p.cell));
  const cells = buildableCells(d, player).filter(
    (cell) => !pickedCells.has(cell) && (spec.terrain === null || player.land[cell] === spec.terrain),
  );
  const result: BuildPick[] = [];
  for (const building of spec.buildings ?? BUILDINGS) {
    const picked = picks.filter((p) => p.building === building).length;
    if (remainingBuildingStock(d, player, building) - picked <= 0) {
      continue;
    }
    for (const cell of cells) {
      const candidate = { building, cell };
      if (affordable(player, buildTotalCost(d, player, [...picks, candidate], spec))) {
        result.push(candidate);
      }
    }
  }
  return result;
};

const parseBuild = (id: string): BuildPick => {
  const [building, cell] = parseParts(id, 'build');
  return { building: building as Building, cell: cell as CellId };
};

export const canBuild = (d: GameData, player: PlayerState, spec: BuildSpec): boolean =>
  buildCandidates(d, player, spec, []).length > 0;

export const canBuildRight = (d: GameData, player: PlayerState): boolean => canBuild(d, player, BUILD_RIGHT_SPEC);

export const buildOptions = (d: GameData, state: GameState, task: TaskOf<'build'>): Option[] => {
  const player = playerOf(state, task.player);
  const options = buildCandidates(d, player, task.spec, task.picks).map((p) =>
    opt(task.player, `build:${p.building}:${p.cell}`, `${p.cell} に ${p.building}`),
  );
  if (task.picks.length >= task.spec.min && (task.picks.length > 0 || task.spec.min === 0)) {
    options.push(opt(task.player, 'done', '建設する建物を確定する'));
  }
  return options;
};

/** 建物をまとめて建て、建設時効果と地形ボーナスを処理する（5-6-2〜5-6-5）。 */
const completeBuilds = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  picks: readonly BuildPick[],
  cost: { gold: number; materials: number },
): void => {
  player.gold -= cost.gold;
  player.materials -= cost.materials;
  const effects = buildEffects(d, player, picks);
  for (const pick of picks) {
    putBuilding(state, d, player, pick.cell, pick.building);
  }
  processEffects(state, d, player, effects);
};

export const applyBuild = (state: GameState, d: GameData, task: TaskOf<'build'>, id: string): void => {
  const player = playerOf(state, task.player);
  if (id !== 'done') {
    task.picks.push(parseBuild(id));
  }
  const finished =
    id === 'done' || task.picks.length >= task.spec.max || buildCandidates(d, player, task.spec, task.picks).length === 0;
  if (!finished) {
    return;
  }
  removeTask(state, task);
  if (task.picks.length > 0) {
    // 種類と場所をすべて選んだ時点でコストを確定して払う（5-6-1、ユーザー決定 2026-11-03）。
    completeBuilds(state, d, player, task.picks, buildTotalCost(d, player, task.picks, task.spec));
  }
};

/** 英雄の初期配置（19-5-1）で使う無料の砦。 */
export const freeBuildAt = (state: GameState, d: GameData, player: PlayerState, pick: BuildPick): void => {
  completeBuilds(state, d, player, [pick], { gold: 0, materials: 0 });
};

// ---------------------------------------------------------------------------
// 輸入・輸出（6-3-3、6-3-4、5-5-1-2、5-5-2-2、19-2-1、19-2-2）
// ---------------------------------------------------------------------------

export const importCountOptions = (d: GameData, state: GameState, task: TaskOf<'importCount'>): Option[] => {
  const player = playerOf(state, task.player);
  const spec = d.params.actions.import[task.tier];
  // 交換0回は選べない（6-1-6-2）。
  return range(1, spec.maxTimes)
    .filter((k) => k * spec.payGold <= player.gold)
    .map((k) => opt(task.player, `count:${k}`, `${k}回交換する`));
};

export const applyImportCount = (state: GameState, d: GameData, task: TaskOf<'importCount'>, id: string): void => {
  removeTask(state, task);
  const player = playerOf(state, task.player);
  const spec = d.params.actions.import[task.tier];
  const times = parseCount(id);
  player.gold -= times * spec.payGold;
  player.materials += times * spec.gainMaterials + spec.bonusMaterials;
  const shops = buildingCount(player, 'shop');
  processEffects(state, d, player, [
    { k: 'goldProduction', n: d.params.buildings.effects.shop.goldProductionAfterImportByCount[shops] ?? 0 },
  ]);
};

export const exportCountOptions = (d: GameData, state: GameState, task: TaskOf<'exportCount'>): Option[] => {
  const player = playerOf(state, task.player);
  const spec = d.params.actions.export[task.tier];
  return range(1, spec.maxTimes)
    .filter((k) => k * spec.payMaterials <= player.materials)
    .map((k) => opt(task.player, `count:${k}`, `${k}回交換する`));
};

export const applyExportCount = (state: GameState, d: GameData, task: TaskOf<'exportCount'>, id: string): void => {
  removeTask(state, task);
  const player = playerOf(state, task.player);
  const spec = d.params.actions.export[task.tier];
  const times = parseCount(id);
  player.materials -= times * spec.payMaterials;
  player.gold += times * spec.gainGold + spec.bonusGold;
  const workshops = buildingCount(player, 'workshop');
  player.gold += d.params.buildings.effects.workshop.goldAfterExportByCount[workshops] ?? 0;
};

// ---------------------------------------------------------------------------
// 教練（6-3-5、5-5-3-2、19-2-3）
// ---------------------------------------------------------------------------

const drillTokenCost = (d: GameData, player: PlayerState): number => {
  const table = d.params.buildings.effects.fort.drillTokenCostByCount;
  return table[buildingCount(player, 'fort')] ?? table[table.length - 1] ?? 1;
};

export const drillRaiseOptions = (d: GameData, state: GameState, task: TaskOf<'drillRaise'>): Option[] => {
  const player = playerOf(state, task.player);
  const cost = drillTokenCost(d, player);
  const max = Math.min(d.params.actions.drill[task.tier].maxRaises, Math.floor(tokenBudget(d, player) / cost));
  return range(0, max).map((k) => opt(task.player, `count:${k}`, `上昇処理を${k}回行う`));
};

export const applyDrillRaise = (state: GameState, d: GameData, task: TaskOf<'drillRaise'>, id: string): void => {
  removeTask(state, task);
  const player = playerOf(state, task.player);
  const raises = parseCount(id);
  payMilitaryTokens(state, d, player, raises * drillTokenCost(d, player));
  if (raises > 0) {
    processEffects(state, d, player, [{ k: 'military', n: raises, overflowPoints: true, source: 'drill' }]);
  }
};

// ---------------------------------------------------------------------------
// 遠征（6-3-6、19-2-4〜19-2-6）と文明カード017
// ---------------------------------------------------------------------------

export type ExpeditionEntry = { readonly level: number; readonly grants: readonly Grant[]; readonly command: Command | null };

/** 遠征の報酬表。指揮官の追加報酬は新しい報酬として加わる（19-2-6）。添字は選択肢の識別子に使う。 */
export const expeditionTable = (d: GameData, player: PlayerState): ExpeditionEntry[] => [
  ...d.params.actions.expedition.rewards.map((r) => ({ level: r.level, grants: r.grants, command: null })),
  ...modifiersOf(d, player).flatMap((m) =>
    m.kind === 'expeditionRewards' ? m.add.map((a) => ({ level: a.level, grants: [], command: a.command })) : [],
  ),
];

const rewardExecutable = (d: GameData, player: PlayerState, entry: ExpeditionEntry): boolean => {
  // 実行できない報酬は選べない。判定は選択時点の状態で行う（6-3-6-9、19-2-5）。
  const grantsOk = entry.grants.every((grant) => {
    switch (grant.kind) {
      case 'landTiles':
        return placeableCells(player).length > 0;
      case 'buildRight':
        return canBuildRight(d, player);
      case 'freeBuildOnTerrain':
        return freeLandCells(player).some((cell) => player.land[cell] === grant.terrain);
      default:
        return true;
    }
  });
  const commandOk = entry.command?.op !== 'placeTiles' || placeableCells(player).length > 0;
  return grantsOk && commandOk;
};

/** 目標値（選んだ報酬の最も高いレベル）との差分の軍事力トークン（6-3-6-3、6-3-6-4）。 */
const expeditionTokenCost = (table: readonly ExpeditionEntry[], player: PlayerState, picks: readonly number[]): number => {
  const levels = picks.map((i) => table[i]?.level ?? 0);
  return Math.max(0, Math.max(0, ...levels) - player.militaryLevel);
};

const expeditionCanAdd = (
  d: GameData,
  player: PlayerState,
  task: TaskOf<'expeditionPick'>,
  picks: readonly number[],
  index: number,
): boolean => {
  const table = expeditionTable(d, player);
  const entry = table[index];
  if (entry === undefined || !rewardExecutable(d, player, entry)) {
    return false;
  }
  const same = picks.filter((i) => i === index).length;
  if (task.mode === 'card') {
    // 017：目標値とトークンなし、現在の軍事レベル以下、異なる報酬を4つまで（ユーザー決定 2026-11-03）。
    return entry.level <= player.militaryLevel && same === 0 && picks.length < task.count;
  }
  const selection = d.params.actions.expedition.selection[task.tier];
  const total = selection.mode === 'distinct' ? selection.max : selection.total;
  // 特別任務：同じ報酬を選べる回数の上限を補正で置き換える（カードの効果が 6-3-6-6 に優先する、ユーザー決定 2026-11-06）。
  const maxSame = sameRewardLimit(d, player, task.tier) ?? (selection.mode === 'distinct' ? 1 : selection.maxSame);
  if (picks.length >= total || same >= maxSame) {
    return false;
  }
  return expeditionTokenCost(table, player, [...picks, index]) <= tokenBudget(d, player);
};

/** 特別任務の補正による、同じ報酬を選べる回数の上限。複数あれば大きいほう。補正がなければ null。 */
const sameRewardLimit = (d: GameData, player: PlayerState, tier: Tier): number | null =>
  modifiersOf(d, player).reduce<number | null>(
    (limit, m) => (m.kind === 'expeditionSameReward' ? Math.max(limit ?? 0, m.maxSame[tier]) : limit),
    null,
  );

const expeditionCandidates = (d: GameData, player: PlayerState, task: TaskOf<'expeditionPick'>): number[] =>
  expeditionTable(d, player)
    .map((_, i) => i)
    .filter((i) => expeditionCanAdd(d, player, task, task.picks, i));

const expeditionProbe = (tier: Tier): TaskOf<'expeditionPick'> => ({
  t: 'expeditionPick',
  player: -1,
  tier,
  picks: [],
  mode: 'action',
  count: 0,
});

export const expeditionOptions = (d: GameData, state: GameState, task: TaskOf<'expeditionPick'>): Option[] => {
  const player = playerOf(state, task.player);
  const table = expeditionTable(d, player);
  const options = expeditionCandidates(d, player, task).map((i) =>
    opt(task.player, `reward:${i}`, `レベル${table[i]?.level ?? '?'}の報酬`),
  );
  if (task.picks.length > 0) {
    options.push(opt(task.player, 'done', '報酬を確定する'));
  }
  return options;
};

export const applyExpedition = (state: GameState, d: GameData, task: TaskOf<'expeditionPick'>, id: string): void => {
  const player = playerOf(state, task.player);
  if (id !== 'done') {
    task.picks.push(Number(parseParts(id, 'reward')[0]));
  }
  if (id !== 'done' && expeditionCandidates(d, player, task).length > 0) {
    return;
  }
  removeTask(state, task);
  const table = expeditionTable(d, player);
  if (task.mode === 'action') {
    payMilitaryTokens(state, d, player, expeditionTokenCost(table, player, task.picks));
  }
  const effects: Effect[] = [];
  const commands: Command[] = [];
  for (const index of task.picks) {
    const entry = table[index];
    // 遠征の得点は軍事・防衛に含める（17-6-2）。
    for (const grant of entry?.grants ?? []) effects.push({ k: 'grant', grant, axis: 'military', source: 'expedition' });
    if (entry?.command) commands.push(entry.command);
  }
  const choices: ChoiceEffect[] = [];
  processEffects(state, d, player, effects, choices);
  runCommands(state, d, player, commands, 'expedition', 'military', choices);
  scheduleChoices(state, player.index, choices);
};

// ---------------------------------------------------------------------------
// 福祉（6-3-7、5-5-4-2、19-2-7、19-2-9）
// ---------------------------------------------------------------------------

const welfareConvertible = (d: GameData, player: PlayerState): boolean =>
  buildingCount(player, 'office') > 0 && usableTemp(player) > 0;

const welfareDoesSomething = (d: GameData, player: PlayerState, tier: Tier): boolean => {
  const spec = d.params.actions.welfare[tier];
  return (
    (spec.infra > 0 && player.infraLevel < d.params.infra.max) ||
    (spec.tempWorkers > 0 && player.tempWorkers < d.params.workers.tempMax) ||
    welfareConvertible(d, player)
  );
};

export const welfareConvertOptions = (d: GameData, state: GameState, task: TaskOf<'welfareConvert'>): Option[] => {
  const player = playerOf(state, task.player);
  const options = [opt(task.player, 'convert:0', '変換しない')];
  // 同じ福祉で得た臨時ワーカーは変換に使えない（ユーザー決定 2026-11-03、3-4-4-2）。
  if (welfareConvertible(d, player)) {
    options.push(opt(task.player, 'convert:1', '臨時ワーカー1人を資材に変換する'));
  }
  return options;
};

export const applyWelfareConvert = (state: GameState, d: GameData, task: TaskOf<'welfareConvert'>, id: string): void => {
  removeTask(state, task);
  if (id === 'convert:1') {
    const player = playerOf(state, task.player);
    const table = d.params.buildings.effects.office.welfareConvertMaterialsByCount;
    player.tempWorkers -= 1;
    player.materials += table[buildingCount(player, 'office')] ?? 0;
  }
};

// ---------------------------------------------------------------------------
// 移住（6-3-8）
// ---------------------------------------------------------------------------

const regularRoom = (d: GameData, player: PlayerState): number =>
  Math.max(0, regularWorkerCap(d, player) - player.regularWorkers);

const tempRoom = (d: GameData, player: PlayerState): number => Math.max(0, d.params.workers.tempMax - player.tempWorkers);

const migrationDoesSomething = (d: GameData, player: PlayerState, tier: Tier): boolean => {
  const spec = d.params.actions.migration[tier];
  // 通常ワーカーが上限のときの通常の移住は、ワーカーを置くだけになるため選べない（ユーザー決定 2026-11-03、6-1-6）。
  return (spec.regularWorkers > 0 && regularRoom(d, player) > 0) || (spec.tempWorkers > 0 && tempRoom(d, player) > 0);
};

export const migrationCountOptions = (d: GameData, state: GameState, task: TaskOf<'migrationCount'>): Option[] => {
  const player = playerOf(state, task.player);
  const spec = d.params.actions.migration[task.tier];
  const tempEffective = spec.tempWorkers > 0 && tempRoom(d, player) > 0;
  const max = Math.min(spec.regularWorkers, regularRoom(d, player));
  return range(tempEffective ? 0 : 1, max).map((k) => opt(task.player, `count:${k}`, `通常ワーカーを${k}人獲得する`));
};

export const applyMigrationCount = (state: GameState, d: GameData, task: TaskOf<'migrationCount'>, id: string): void => {
  removeTask(state, task);
  const player = playerOf(state, task.player);
  gainTempWorkers(state, d, player, d.params.actions.migration[task.tier].tempWorkers);
  gainRegularWorkers(state, d, player, parseCount(id));
};

// ---------------------------------------------------------------------------
// 研究（6-3-9、19-2-8）と捨て札
// ---------------------------------------------------------------------------

export const discardOptions = (state: GameState, task: TaskOf<'discard'>): Option[] => {
  const player = playerOf(state, task.player);
  return [...new Set(player.hand)].map((card) => opt(task.player, `card:${card}`, `${card} を捨てる`));
};

export const applyDiscard = (state: GameState, task: TaskOf<'discard'>, id: string): void => {
  const player = playerOf(state, task.player);
  const card = parseParts(id, 'card')[0] ?? '';
  player.hand.splice(player.hand.indexOf(card), 1);
  state.civDiscard.push(card);
  task.remaining -= 1;
  // 手札が尽きたら、あるだけ捨てて終える（ユーザー決定 2026-11-03）。
  if (task.remaining === 0 || player.hand.length === 0) {
    removeTask(state, task);
  }
};

// ---------------------------------------------------------------------------
// 普及（6-3-10、9-2）
// ---------------------------------------------------------------------------

export const civCardCost = (d: GameData, player: PlayerState, cardId: string): number => {
  const card = d.civilizationCards.find((c) => c.id === cardId);
  if (card === undefined) {
    throw new Error(`存在しない文明カードである：${cardId}`);
  }
  const discount = buildingCount(player, 'university') * d.params.buildings.effects.university.civCardGoldDiscountPerUniversity;
  return Math.max(0, card.cost.gold - discount);
};

const playableCards = (d: GameData, player: PlayerState): string[] =>
  [...new Set(player.hand)].filter((card) => civCardCost(d, player, card) <= player.gold);

export const spreadOptions = (d: GameData, state: GameState, task: TaskOf<'spreadPlay'>): Option[] => {
  const player = playerOf(state, task.player);
  const spec = d.params.actions.spread[task.tier];
  const options = playableCards(d, player).map((card) =>
    opt(task.player, `card:${card}`, `${card} をプレイする（${civCardCost(d, player, card)}金）`),
  );
  if (task.played > 0 && spec.cardsIsMax) {
    options.push(opt(task.player, 'done', 'プレイを終える'));
  }
  return options;
};

/** 文明カードを1枚プレイする（9-2-4）。 */
export const playCivCard = (state: GameState, d: GameData, player: PlayerState, cardId: string, free: boolean): void => {
  if (!free) {
    player.gold -= civCardCost(d, player, cardId);
  }
  player.hand.splice(player.hand.indexOf(cardId), 1);
  player.played.push(cardId);
  emit(state, d, { type: 'cardPlayed', player: player.index, card: cardId });
  // カード効果を処理する（9-2-4 手順5）。実行できない効果は不発とし、カードはプレイ済みとして残る（16-2-5）。
  const card = d.civilizationCards.find((c) => c.id === cardId);
  for (const ability of card?.script ?? []) {
    if (ability.ability === 'onPlay') runCommands(state, d, player, ability.do, `civ:${cardId}`);
  }
};

export const applySpread = (state: GameState, d: GameData, task: TaskOf<'spreadPlay'>, id: string): void => {
  const player = playerOf(state, task.player);
  const spec = d.params.actions.spread[task.tier];
  if (id === 'done') {
    removeTask(state, task);
    return;
  }
  task.played += 1;
  if (task.played >= spec.maxCards) {
    removeTask(state, task);
  }
  playCivCard(state, d, player, parseParts(id, 'card')[0] ?? '', false);
  // 1枚ごとに即時に得る（ユーザー決定 2026-11-03）。
  player.gold += spec.goldPerCard;
};

// ---------------------------------------------------------------------------
// アクションの開始
// ---------------------------------------------------------------------------

/** アクションの中身として何かを実行できるか（6-1-6、6-1-7、16-2-1）。ワーカーと占有は含めない。 */
export const canExecute = (d: GameData, player: PlayerState, action: Action, tier: Tier): boolean => {
  const a = d.params.actions;
  switch (action) {
    case 'pioneer':
      return canPioneer(d, player, tier);
    case 'build':
      return canBuild(d, player, actionBuildSpec(d, tier));
    case 'import':
      return player.gold >= a.import[tier].payGold;
    case 'export':
      return player.materials >= a.export[tier].payMaterials;
    case 'drill':
      return player.gold >= a.drill[tier].payGold;
    case 'expedition':
      return expeditionCandidates(d, player, { ...expeditionProbe(tier), player: player.index }).length > 0;
    case 'welfare':
      return player.materials >= a.welfare[tier].payMaterials && welfareDoesSomething(d, player, tier);
    case 'migration':
      return migrationDoesSomething(d, player, tier);
    case 'research':
      return true;
    case 'spread':
      return playableCards(d, player).length > 0;
  }
};

/** ワーカーを置いた後、アクションの中身の選択を始める。 */
export const startAction = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  action: Action,
  tier: Tier,
  copied = false,
): void => {
  const a = d.params.actions;
  const p = player.index;
  emit(state, d, { type: 'action', player: p, action, tier, copied });
  switch (action) {
    case 'pioneer':
      state.stack.push({ t: 'pioneerCount', player: p, tier });
      return;
    case 'build':
      state.stack.push({ t: 'build', player: p, spec: actionBuildSpec(d, tier), picks: [] });
      return;
    case 'import':
      state.stack.push({ t: 'importCount', player: p, tier });
      return;
    case 'export':
      state.stack.push({ t: 'exportCount', player: p, tier });
      return;
    case 'drill':
      player.gold -= a.drill[tier].payGold;
      player.militaryTokens += a.drill[tier].gainTokens;
      state.stack.push({ t: 'drillRaise', player: p, tier });
      return;
    case 'expedition':
      state.stack.push({ t: 'expeditionPick', player: p, tier, picks: [], mode: 'action', count: 0 });
      return;
    case 'welfare': {
      const spec = a.welfare[tier];
      player.materials -= spec.payMaterials;
      // 変換は福祉アクションの後に行う（5-5-4-2）。変換の可否はこの時点の臨時ワーカーで決まる。
      if (welfareConvertible(d, player)) {
        state.stack.push({ t: 'welfareConvert', player: p });
      }
      const effects: Effect[] = [{ k: 'infra', n: spec.infra }];
      if (spec.tempWorkers > 0) {
        effects.push({ k: 'grant', grant: { kind: 'tempWorkers', amount: spec.tempWorkers }, source: 'welfare' });
      }
      processEffects(state, d, player, effects);
      return;
    }
    case 'migration': {
      const spec = a.migration[tier];
      if (spec.regularWorkersIsMax && regularRoom(d, player) > 0) {
        state.stack.push({ t: 'migrationCount', player: p, tier });
        return;
      }
      gainTempWorkers(state, d, player, spec.tempWorkers);
      gainRegularWorkers(state, d, player, spec.regularWorkers);
      return;
    }
    case 'research': {
      const spec = a.research[tier];
      drawCivCards(state, d, player, spec.draw);
      if (spec.discard > 0 && player.hand.length > 0) {
        state.stack.push({ t: 'discard', player: p, remaining: spec.discard });
      }
      return;
    }
    case 'spread':
      state.stack.push({ t: 'spreadPlay', player: p, tier, played: 0 });
      return;
  }
};
