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
  terrainOf,
  usableTemp,
  type Effect,
} from './core.ts';
import { BUILDINGS, TERRAINS, type Action, type Building, type GameData, type Terrain, type Tier } from '../data/types.ts';
import type { BuildPick, GameState, Option, PlayerState, Task } from './types.ts';

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

const pioneerMinCost = (d: GameData, tier: Tier, tiles: number, mismatches: number): number => {
  const land = d.params.land;
  const raw = tiles * land.materialsPerTile + mismatches * land.mismatchExtraMaterials;
  return Math.max(land.minTotalMaterials, raw - d.params.actions.pioneer[tier].materialDiscount);
};

const pioneerMaxTiles = (d: GameData, player: PlayerState, tier: Tier): number =>
  Math.min(d.params.actions.pioneer[tier].maxTiles, emptyCellCount(player));

const canPioneer = (d: GameData, player: PlayerState, tier: Tier): boolean =>
  pioneerMaxTiles(d, player, tier) >= 1 && pioneerMinCost(d, tier, 1, 0) <= player.materials;

export const pioneerCountOptions = (d: GameData, state: GameState, task: TaskOf<'pioneerCount'>): Option[] => {
  const player = playerOf(state, task.player);
  // 枚数は空きマスの数まで（ユーザー決定 2026-11-03、19-1-4 に揃える）。
  return range(1, pioneerMaxTiles(d, player, task.tier))
    .filter((k) => pioneerMinCost(d, task.tier, k, 0) <= player.materials)
    .map((k) => opt(task.player, `count:${k}`, `${k}枚配置する`));
};

export const applyPioneerCount = (state: GameState, task: TaskOf<'pioneerCount'>, id: string): void => {
  state.stack.pop();
  state.stack.push({
    t: 'placeTiles',
    player: task.player,
    remaining: parseCount(id),
    placed: [],
    mode: 'pioneer',
    tier: task.tier,
    mismatches: 0,
  });
};

export const placeTilesOptions = (d: GameData, state: GameState, task: TaskOf<'placeTiles'>): Option[] => {
  const player = playerOf(state, task.player);
  const options: Option[] = [];
  for (const cell of placeableCells(player)) {
    const terrain = terrainOf(d, player, cell);
    if (task.mode === 'effect') {
      // 効果による配置は地形と同じ種類で、資材は払わない（4-2-2、19-1-1）。
      options.push(opt(task.player, `tile:${cell}:${terrain}`, `${cell} に ${terrain}`));
      continue;
    }
    const tier = task.tier ?? 'normal';
    const tilesTotal = task.placed.length + task.remaining;
    for (const tile of TERRAINS) {
      const mismatches = task.mismatches + (tile === terrain ? 0 : 1);
      // コストは配置をすべて選んだ時点で確定する。残りを地形一致で置いても払えない選び方は選べない（6-1-7）。
      if (pioneerMinCost(d, tier, tilesTotal, mismatches) <= player.materials) {
        options.push(opt(task.player, `tile:${cell}:${tile}`, `${cell} に ${tile}`));
      }
    }
  }
  return options;
};

export const applyPlaceTile = (state: GameState, d: GameData, task: TaskOf<'placeTiles'>, id: string): void => {
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
  state.stack.pop();
  const player = playerOf(state, task.player);
  if (task.remaining > 0) {
    emit(state, d, { type: 'fizzle', player: task.player, what: `landTiles:${task.remaining}` });
  }
  if (task.mode === 'pioneer') {
    player.materials -= pioneerMinCost(d, task.tier ?? 'normal', task.placed.length, task.mismatches);
  }
  processEffects(state, d, player, squareBonusEffects(d, player, task.placed));
};

// ---------------------------------------------------------------------------
// 建設（第5章、6-3-2、6-3-6-7、19-1-3、19-1-4）
// ---------------------------------------------------------------------------

/** 複数建設の合計コスト。建築アクションの割引を適用し、0未満にしない（5-6-6）。 */
export const buildTotalCost = (
  d: GameData,
  player: PlayerState,
  picks: readonly BuildPick[],
  tier: Tier | null,
): { gold: number; materials: number } => {
  let gold = 0;
  let materials = 0;
  for (const pick of picks) {
    const cost = baseBuildCost(d, player, pick.building, pick.cell);
    gold += cost.gold;
    materials += cost.materials;
  }
  const discount = tier === null ? { goldDiscount: 0, materialDiscount: 0 } : d.params.actions.build[tier];
  const min = d.params.buildings.minCost;
  return { gold: Math.max(min, gold - discount.goldDiscount), materials: Math.max(min, materials - discount.materialDiscount) };
};

const affordable = (player: PlayerState, cost: { gold: number; materials: number }): boolean =>
  cost.gold <= player.gold && cost.materials <= player.materials;

/** 追加で選べる建設（種類と場所）。上限・空き地・コストを満たすものだけ（6-3-2-2、19-1-4、6-1-7）。 */
const buildCandidates = (
  d: GameData,
  player: PlayerState,
  picks: readonly BuildPick[],
  tier: Tier | null,
  costMode: 'paid' | 'free',
  terrain: Terrain | null,
): BuildPick[] => {
  const pickedCells = new Set(picks.map((p) => p.cell));
  const cells = freeLandCells(player).filter(
    (cell) => !pickedCells.has(cell) && (terrain === null || player.land[cell] === terrain),
  );
  const result: BuildPick[] = [];
  for (const building of BUILDINGS) {
    const picked = picks.filter((p) => p.building === building).length;
    if (remainingBuildingStock(d, player, building) - picked <= 0) {
      continue;
    }
    for (const cell of cells) {
      const candidate = { building, cell };
      if (costMode === 'free' || affordable(player, buildTotalCost(d, player, [...picks, candidate], tier))) {
        result.push(candidate);
      }
    }
  }
  return result;
};

const buildOption = (player: number, pick: BuildPick): Option =>
  opt(player, `build:${pick.building}:${pick.cell}`, `${pick.cell} に ${pick.building}`);

const parseBuild = (id: string): BuildPick => {
  const [building, cell] = parseParts(id, 'build');
  return { building: building as Building, cell: cell as CellId };
};

export const canBuildRight = (d: GameData, player: PlayerState): boolean =>
  buildCandidates(d, player, [], null, 'paid', null).length > 0;

export const buildSelectOptions = (d: GameData, state: GameState, task: TaskOf<'buildSelect'>): Option[] => {
  const player = playerOf(state, task.player);
  const options = buildCandidates(d, player, task.picks, task.tier, 'paid', null).map((p) => buildOption(task.player, p));
  if (task.picks.length > 0) {
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
  for (const pick of picks) {
    putBuilding(state, d, player, pick.cell, pick.building);
  }
  processEffects(state, d, player, buildEffects(d, player, picks));
};

export const applyBuildSelect = (state: GameState, d: GameData, task: TaskOf<'buildSelect'>, id: string): void => {
  if (id !== 'done') {
    task.picks.push(parseBuild(id));
  }
  if (id === 'done' || task.picks.length >= d.params.actions.build[task.tier].maxBuildings) {
    state.stack.pop();
    const player = playerOf(state, task.player);
    completeBuilds(state, d, player, task.picks, buildTotalCost(d, player, task.picks, task.tier));
  }
};

export const buildRightOptions = (d: GameData, state: GameState, task: TaskOf<'buildRight'>): Option[] =>
  buildCandidates(d, playerOf(state, task.player), [], null, 'paid', null).map((p) => buildOption(task.player, p));

export const applyBuildRight = (state: GameState, d: GameData, task: TaskOf<'buildRight'>, id: string): void => {
  state.stack.pop();
  const player = playerOf(state, task.player);
  const pick = parseBuild(id);
  // 建築アクションの割引は適用せず、飯場の軽減は適用する（19-1-3）。
  completeBuilds(state, d, player, [pick], buildTotalCost(d, player, [pick], null));
};

export const freeBuildOptions = (d: GameData, state: GameState, task: TaskOf<'freeBuild'>): Option[] =>
  buildCandidates(d, playerOf(state, task.player), [], null, 'free', task.terrain).map((p) => buildOption(task.player, p));

export const applyFreeBuild = (state: GameState, d: GameData, task: TaskOf<'freeBuild'>, id: string): void => {
  state.stack.pop();
  // 無料建設はコストだけを免除する（5-6-7）。
  completeBuilds(state, d, playerOf(state, task.player), [parseBuild(id)], { gold: 0, materials: 0 });
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
  state.stack.pop();
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
  state.stack.pop();
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
  const max = Math.min(d.params.actions.drill[task.tier].maxRaises, Math.floor(player.militaryTokens / cost));
  return range(0, max).map((k) => opt(task.player, `count:${k}`, `上昇処理を${k}回行う`));
};

export const applyDrillRaise = (state: GameState, d: GameData, task: TaskOf<'drillRaise'>, id: string): void => {
  state.stack.pop();
  const player = playerOf(state, task.player);
  const raises = parseCount(id);
  player.militaryTokens -= raises * drillTokenCost(d, player);
  if (raises > 0) {
    processEffects(state, d, player, [{ k: 'military', n: raises, overflowPoints: true, source: 'drill' }]);
  }
};

// ---------------------------------------------------------------------------
// 遠征（6-3-6、19-2-4、19-2-5）
// ---------------------------------------------------------------------------

const rewardExecutable = (d: GameData, player: PlayerState, index: number): boolean => {
  const reward = d.params.actions.expedition.rewards[index];
  if (reward === undefined) {
    return false;
  }
  // 実行できない報酬は選べない。判定は選択時点の状態で行う（6-3-6-9、19-2-5）。
  return reward.grants.every((grant) => {
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
};

/** 目標値（選んだ報酬の最も高いレベル）との差分の軍事力トークン（6-3-6-3、6-3-6-4）。 */
const expeditionTokenCost = (d: GameData, player: PlayerState, picks: readonly number[]): number => {
  const levels = picks.map((i) => d.params.actions.expedition.rewards[i]?.level ?? 0);
  const target = Math.max(0, ...levels);
  return Math.max(0, target - player.militaryLevel);
};

const expeditionCanAdd = (d: GameData, player: PlayerState, tier: Tier, picks: readonly number[], index: number): boolean => {
  const selection = d.params.actions.expedition.selection[tier];
  const same = picks.filter((i) => i === index).length;
  if (selection.mode === 'distinct') {
    if (same > 0 || picks.length >= selection.max) {
      return false;
    }
  } else if (picks.length >= selection.total || same >= selection.maxSame) {
    return false;
  }
  return expeditionTokenCost(d, player, [...picks, index]) <= player.militaryTokens && rewardExecutable(d, player, index);
};

const expeditionCandidates = (d: GameData, player: PlayerState, tier: Tier, picks: readonly number[]): number[] =>
  d.params.actions.expedition.rewards.map((_, i) => i).filter((i) => expeditionCanAdd(d, player, tier, picks, i));

export const expeditionOptions = (d: GameData, state: GameState, task: TaskOf<'expeditionPick'>): Option[] => {
  const player = playerOf(state, task.player);
  const options = expeditionCandidates(d, player, task.tier, task.picks).map((i) =>
    opt(task.player, `reward:${i}`, `レベル${d.params.actions.expedition.rewards[i]?.level ?? '?'}の報酬`),
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
  if (id === 'done' || expeditionCandidates(d, player, task.tier, task.picks).length === 0) {
    state.stack.pop();
    player.militaryTokens -= expeditionTokenCost(d, player, task.picks);
    const effects: Effect[] = [];
    for (const index of task.picks) {
      for (const grant of d.params.actions.expedition.rewards[index]?.grants ?? []) {
        // 遠征の得点は軍事・防衛に含める（17-6-2）。
        effects.push({ k: 'grant', grant, axis: 'military', source: 'expedition' });
      }
    }
    processEffects(state, d, player, effects);
  }
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
  state.stack.pop();
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
  state.stack.pop();
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
    state.stack.pop();
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

/** 文明カードを1枚プレイする（9-2-4）。カード効果は段階3で実装する。 */
export const playCivCard = (state: GameState, d: GameData, player: PlayerState, cardId: string, free: boolean): void => {
  if (!free) {
    player.gold -= civCardCost(d, player, cardId);
  }
  player.hand.splice(player.hand.indexOf(cardId), 1);
  player.played.push(cardId);
  emit(state, d, { type: 'cardPlayed', player: player.index, card: cardId });
};

export const applySpread = (state: GameState, d: GameData, task: TaskOf<'spreadPlay'>, id: string): void => {
  const player = playerOf(state, task.player);
  const spec = d.params.actions.spread[task.tier];
  if (id === 'done') {
    state.stack.pop();
    return;
  }
  task.played += 1;
  if (task.played >= spec.maxCards) {
    state.stack.pop();
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
      return buildCandidates(d, player, [], tier, 'paid', null).length > 0;
    case 'import':
      return player.gold >= a.import[tier].payGold;
    case 'export':
      return player.materials >= a.export[tier].payMaterials;
    case 'drill':
      return player.gold >= a.drill[tier].payGold;
    case 'expedition':
      return expeditionCandidates(d, player, tier, []).length > 0;
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
export const startAction = (state: GameState, d: GameData, player: PlayerState, action: Action, tier: Tier): void => {
  const a = d.params.actions;
  const p = player.index;
  emit(state, d, { type: 'action', player: p, action, tier });
  switch (action) {
    case 'pioneer':
      state.stack.push({ t: 'pioneerCount', player: p, tier });
      return;
    case 'build':
      state.stack.push({ t: 'buildSelect', player: p, tier, picks: [] });
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
      state.stack.push({ t: 'expeditionPick', player: p, tier, picks: [] });
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
