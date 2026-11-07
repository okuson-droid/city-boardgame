// ゲームロジックの共通部品。状態の読み取り（数え上げ）と、資源・トラック・カードの変化を扱う。
// 状態を変更する関数は、applyMove が作った写しに対してだけ呼ぶ。

import { CELL_IDS, neighborsOf, type CellId } from './board.ts';
import { shuffle } from './rng.ts';
import type { Building, GameData, Grant, ScoreAxis, Terrain } from '../data/types.ts';
import type { BuildSpec, ChoiceEffect, GameEvent, GameState, PlayerState, Task } from './types.ts';
import type { Command } from '../data/script.ts';
import { buildCostMaterialsModifier, hasModifier, modifiersOf } from './abilities.ts';

// ---------------------------------------------------------------------------
// 読み取り
// ---------------------------------------------------------------------------

export const playerOf = (state: GameState, index: number): PlayerState => {
  const player = state.players[index];
  if (player === undefined) {
    throw new Error(`存在しないプレイヤーである：${index}`);
  }
  return player;
};

export const boardOf = (d: GameData, player: PlayerState) => {
  const board = d.boards.find((b) => b.id === player.boardId);
  if (board === undefined) {
    throw new Error(`個人ボードが決まっていない：プレイヤー${player.index}`);
  }
  return board;
};

export const terrainOf = (d: GameData, player: PlayerState, cell: CellId): Terrain => {
  const square = boardOf(d, player).squares[cell];
  if (square === undefined) {
    throw new Error(`存在しないマスである：${cell}`);
  }
  return square.terrain;
};

export const landCells = (player: PlayerState): CellId[] => CELL_IDS.filter((id) => player.land[id] !== undefined);

export const landCount = (player: PlayerState): number => landCells(player).length;

export const buildingCells = (player: PlayerState): CellId[] =>
  CELL_IDS.filter((id) => player.buildings[id] !== undefined);

/** 建物の数。文明カードの上の住宅（移動住宅）も数える（ユーザー決定 2026-11-06）。盤面の建物だけは buildingCells で数える。 */
export const buildingCount = (player: PlayerState, building?: Building): number =>
  buildingCells(player).filter((id) => building === undefined || player.buildings[id] === building).length +
  (building === undefined || building === 'house' ? cardHouseCount(player) : 0);

/** 文明カードの上の住宅の数（移動住宅）。出どころを指定すればそのカードの上だけを数える。 */
export const cardHouseCount = (player: PlayerState, source?: string): number =>
  Object.entries(player.cardHouses ?? {}).reduce((sum, [key, n]) => (source === undefined || key === source ? sum + n : sum), 0);

/** 建物の建っていない開拓済みの土地（5-1-1）。 */
export const freeLandCells = (player: PlayerState): CellId[] =>
  landCells(player).filter((id) => player.buildings[id] === undefined);

/** 土地タイルを置けるマス：未開拓で、開拓済みの土地と辺を共有する（4-2-1）。 */
export const placeableCells = (player: PlayerState): CellId[] =>
  CELL_IDS.filter(
    (id) => player.land[id] === undefined && neighborsOf(id).some((n) => player.land[n] !== undefined),
  );

export const emptyCellCount = (player: PlayerState): number => CELL_IDS.length - landCount(player);

/** 通常ワーカーの上限（3-3-1-2）。 */
export const regularWorkerCap = (d: GameData, player: PlayerState): number => {
  const w = d.params.workers;
  return Math.min(w.regularMax, w.regularBase + Math.floor(buildingCount(player, 'house') / w.housesPerExtraRegular));
};

export const usableRegular = (player: PlayerState): number =>
  Math.max(0, player.regularWorkers - player.regularNewThisRound - player.regularPlaced);

export const usableTemp = (player: PlayerState): number => Math.max(0, player.tempWorkers - player.tempLocked);

/** 飯場による資材の軽減（5-5-7-2、5-5-7-3）。既に建っている飯場だけを数える（5-6-4）。 */
export const campDiscountAt = (d: GameData, player: PlayerState, cell: CellId): number => {
  const camp = d.params.buildings.effects.camp;
  const adjacent = neighborsOf(cell).some((n) => player.buildings[n] === 'camp');
  return adjacent ? Math.min(camp.adjacentMaterialDiscount, camp.maxTotalDiscount) : 0;
};

/** 1軒分の建設コスト（建築アクションの割引を含まない）。 */
export const baseBuildCost = (
  d: GameData,
  player: PlayerState,
  building: Building,
  cell: CellId,
): { gold: number; materials: number } => {
  const cost = d.params.buildings.cost[building];
  // 飯場の軽減と、キャラクター・特別な市民カードの資材の補正（19-1-3）。
  const materials = cost.materials - campDiscountAt(d, player, cell) + buildCostMaterialsModifier(d, player, building);
  return { gold: cost.gold, materials: Math.max(d.params.buildings.minCost, materials) };
};

export const remainingBuildingStock = (d: GameData, player: PlayerState, building: Building): number =>
  d.params.buildings.limits[building] - buildingCount(player, building);

/** タスクをスタックから取り除く。処理中に反応（常時効果）が上に積んだタスクを誤って取り除かないため、参照で探す。 */
export const removeTask = (state: GameState, task: Task): void => {
  const index = state.stack.lastIndexOf(task);
  if (index < 0) {
    throw new Error(`スタックにないタスクである：${task.t}`);
  }
  state.stack.splice(index, 1);
};

export const currentTurnPlayer = (state: GameState): number | null => {
  for (let i = state.stack.length - 1; i >= 0; i -= 1) {
    const task = state.stack[i];
    // 手番開始時の効果（芸術家・聖女・デザイナー）を処理している間は、まだ手番中としない。
    if (task?.t === 'turn' && task.started) {
      return task.player;
    }
  }
  return null;
};

// ---------------------------------------------------------------------------
// 出来事と得点
// ---------------------------------------------------------------------------

/**
 * 出来事を記録する。「〜した時」の効果（16-1-4）は、ここで1単位ごとの出来事に反応する。
 * 反応の登録は段階3（feat/effects）で行う。段階2では反応は空である。
 */
export type Reactor = (state: GameState, d: GameData, event: GameEvent) => void;
const reactors: Reactor[] = [];

export const registerReactor = (reactor: Reactor): void => {
  reactors.push(reactor);
};

export const emit = (state: GameState, d: GameData, event: GameEvent): void => {
  state.events.push(event);
  for (const reactor of reactors) {
    reactor(state, d, event);
  }
};

export const addScore = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  points: number,
  axis: ScoreAxis,
  source: string,
): void => {
  if (points === 0) {
    return;
  }
  player.score += points;
  emit(state, d, { type: 'score', player: player.index, points, axis, source });
};

// ---------------------------------------------------------------------------
// カード
// ---------------------------------------------------------------------------

/** 文明カードを1枚ずつ引く。山札と捨て札が尽きたら資材で代える（9-1-4〜9-1-6）。 */
export const drawCivCards = (state: GameState, d: GameData, player: PlayerState, count: number): void => {
  let drawn = 0;
  for (let i = 0; i < count; i += 1) {
    if (state.civDeck.length === 0 && state.civDiscard.length > 0) {
      const [deck, rng] = shuffle(state.civDiscard, state.rng);
      state.civDeck = deck;
      state.civDiscard = [];
      state.rng = rng;
    }
    const card = state.civDeck.shift();
    if (card === undefined) {
      player.materials += d.params.civCards.emptyDeckFallbackMaterials;
      continue;
    }
    player.hand.push(card);
    drawn += 1;
  }
  if (drawn > 0) {
    state.revealCount += 1;
    emit(state, d, { type: 'cardsDrawn', player: player.index, count: drawn });
  }
};

// ---------------------------------------------------------------------------
// ワーカー
// ---------------------------------------------------------------------------

/** 通常ワーカーを獲得する。上限を超えた分は破棄し、獲得に数えない（3-3-4、16-1-5）。 */
export const gainRegularWorkers = (state: GameState, d: GameData, player: PlayerState, count: number): void => {
  const room = Math.max(0, regularWorkerCap(d, player) - player.regularWorkers);
  const gained = Math.min(room, count);
  // 特別市民13：獲得したラウンドから使える。
  const immediate = hasModifier(d, player, 'regularWorkersImmediate');
  for (let i = 0; i < gained; i += 1) {
    player.regularWorkers += 1;
    if (!immediate) {
      player.regularNewThisRound += 1;
    }
    emit(state, d, { type: 'workerGained', player: player.index, kind: 'regular' });
  }
};

/** 臨時ワーカーを獲得する。上限を超えた分は破棄する（3-4-5）。自分の手番中の獲得は手番中は使えない（3-4-4-2）。 */
export const gainTempWorkers = (state: GameState, d: GameData, player: PlayerState, count: number): void => {
  const room = Math.max(0, d.params.workers.tempMax - player.tempWorkers);
  const gained = Math.min(room, count);
  const lock = currentTurnPlayer(state) === player.index;
  for (let i = 0; i < gained; i += 1) {
    player.tempWorkers += 1;
    if (lock) {
      player.tempLocked += 1;
    }
    emit(state, d, { type: 'workerGained', player: player.index, kind: 'temp' });
  }
};

// ---------------------------------------------------------------------------
// 効果の処理
// ---------------------------------------------------------------------------

/** 効果の単位。資源・トラックの変化は即時に処理し、選択を伴うものはタスクにする。 */
export type Effect =
  | { readonly k: 'grant'; readonly grant: Grant; readonly axis?: ScoreAxis; readonly source: string }
  | { readonly k: 'military'; readonly n: number; readonly overflowPoints: boolean; readonly source: string }
  | { readonly k: 'infra'; readonly n: number }
  | { readonly k: 'goldProduction'; readonly n: number }
  | { readonly k: 'materialProduction'; readonly n: number };

const buildTask = (player: number, spec: BuildSpec): Task => ({ t: 'build', player, spec, picks: [] });

const commandTask = (player: number, command: Command, source: string): Task => {
  switch (command.op) {
    case 'placeTiles':
      return {
        t: 'placeTiles',
        player,
        remaining: command.count,
        placed: [],
        mode: 'effect',
        tier: null,
        mismatches: 0,
        tile: command.tile,
        ...(command.distinct === true ? { distinct: true } : {}),
        ...(command.upTo === true ? { upTo: true } : {}),
        ...(command.onTerrain !== undefined ? { onTerrain: command.onTerrain } : {}),
      };
    case 'discardRaise':
      return { t: 'discard', player, remaining: command.max, raise: command.track, discarded: 0 };
    case 'build':
      return buildTask(player, {
        min: command.upTo ? 0 : command.max,
        max: command.max,
        tier: null,
        buildings: command.buildings,
        terrain: command.terrain,
        payGold: command.payGold,
        payMaterials: command.payMaterials,
      });
    case 'playCard':
      return { t: 'playCard', player, remaining: command.count, free: command.free, upTo: command.upTo === true };
    case 'expeditionRewards':
      return { t: 'expeditionPick', player, tier: 'normal', picks: [], mode: 'card', count: command.count };
    case 'chooseOne':
      return { t: 'chooseOne', player, options: command.options, source };
    case 'copyAction':
      return { t: 'copyAction', player };
    case 'spiritPlace':
      return { t: 'spiritPlace', player };
    case 'heroStart':
      return { t: 'heroStart', player };
    case 'gain':
      if (command.res === 'specialCitizen') {
        return { t: 'chooseSpecialCitizen', player };
      }
      break;
    default:
      break;
  }
  throw new Error(`選択を伴わない命令である：${command.op}`);
};

const choiceTask = (player: number, effect: ChoiceEffect): Task => {
  switch (effect.k) {
    case 'command':
      return commandTask(player, effect.command, effect.source);
    case 'landTiles':
      return { t: 'placeTiles', player, remaining: effect.n, placed: [], mode: 'effect', tier: null, mismatches: 0, tile: effect.any === true ? 'any' : 'match' };
    case 'buildRight':
      return buildTask(player, { min: 1, max: 1, tier: null, buildings: null, terrain: null, payGold: true, payMaterials: true });
    case 'freeBuild':
      return buildTask(player, { min: 1, max: 1, tier: null, buildings: null, terrain: effect.terrain, payGold: false, payMaterials: false });
    case 'specialCitizen':
      return { t: 'chooseSpecialCitizen', player };
    case 'discard':
      return { t: 'discard', player, remaining: effect.n };
  }
};

/** 選択を伴う効果をタスクとして積む。2つ以上あれば処理順を尋ねる（16-1-1、decisions.md 3-4）。 */
export const scheduleChoices = (state: GameState, player: number, choices: readonly ChoiceEffect[]): void => {
  if (choices.length === 0) {
    return;
  }
  const [only] = choices;
  if (choices.length === 1 && only !== undefined) {
    state.stack.push(choiceTask(player, only));
    return;
  }
  state.stack.push({ t: 'chooseOrder', player, items: [...choices] });
};

/** chooseOrder で選んだ効果を処理する。残りは再び順番を尋ねる。 */
export const takeChoice = (state: GameState, player: number, items: ChoiceEffect[], index: number): void => {
  const chosen = items[index];
  if (chosen === undefined) {
    throw new Error(`存在しない効果である：${index}`);
  }
  const rest = items.filter((_, i) => i !== index);
  // 残りを先に積み、選んだ効果を上に積む（先に処理される）。
  scheduleChoices(state, player, rest);
  state.stack.push(choiceTask(player, chosen));
};

const trackRewards = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  track: 'military' | 'infra',
  from: number,
  to: number,
  queue: Effect[],
): void => {
  const table = track === 'military' ? d.params.military.rewards : d.params.infra.rewards;
  const claimed = track === 'military' ? player.militaryRewardsClaimed : player.infraRewardsClaimed;
  for (const reward of table) {
    // 通過したレベルの報酬もすべて得る。各報酬はゲーム中1回限り（7-1-3、7-1-4、8-1-3、8-1-4）。
    if (reward.level > from && reward.level <= to && !claimed.includes(reward.level)) {
      claimed.push(reward.level);
      emit(state, d, { type: 'levelReward', player: player.index, track, level: reward.level });
      for (const grant of reward.grants) {
        queue.push({ k: 'grant', grant, axis: track === 'military' ? 'military' : 'other', source: `${track}:${reward.level}` });
      }
    }
  }
};

/**
 * 効果の列を処理する。資源を得るだけの効果は尋ねずに処理し、選択を伴う効果だけを
 * タスクとして積む（decisions.md 3-4）。到達報酬は 16-2-6 により、実行できなければ失われる。
 */
export const processEffects = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  effects: readonly Effect[],
  /** 指定すると、選択を伴う効果を積まずにここへ集める（呼び出し側がまとめて順番を尋ねる）。 */
  collect?: ChoiceEffect[],
): void => {
  const queue: Effect[] = [...effects];
  const choices: ChoiceEffect[] = collect ?? [];
  while (queue.length > 0) {
    const effect = queue.shift();
    if (effect === undefined) {
      break;
    }
    switch (effect.k) {
      case 'military': {
        const max = d.params.military.max;
        const before = player.militaryLevel;
        const after = Math.min(max, before + effect.n);
        const overflow = before + effect.n - after;
        player.militaryLevel = after;
        if (effect.overflowPoints && overflow > 0) {
          // 教練の超過上昇処理（6-3-5-6、17-6-2-2）。
          addScore(state, d, player, overflow * d.params.military.overflowPointsPerRaise, 'military', effect.source);
        }
        trackRewards(state, d, player, 'military', before, after, queue);
        emitTrackRaised(state, d, player, 'military', before, after);
        break;
      }
      case 'infra': {
        const before = player.infraLevel;
        // 上限を超える上昇は破棄し（19-2-9）、超えた上昇1回ごとに得点を得る。出どころを問わない（ユーザー決定 2026-11-07）。
        const after = Math.min(d.params.infra.max, before + effect.n);
        const overflow = before + effect.n - after;
        player.infraLevel = after;
        if (overflow > 0 && d.params.infra.overflowPointsPerRaise > 0) {
          addScore(state, d, player, overflow * d.params.infra.overflowPointsPerRaise, 'welfare', 'infraOverflow');
        }
        trackRewards(state, d, player, 'infra', before, after, queue);
        emitTrackRaised(state, d, player, 'infra', before, after);
        break;
      }
      case 'goldProduction':
        player.goldProduction += effect.n;
        break;
      case 'materialProduction':
        player.materialProduction += effect.n;
        break;
      case 'grant':
        applyGrant(state, d, player, effect.grant, effect.axis ?? 'other', effect.source, choices);
        break;
    }
  }
  if (collect === undefined) {
    scheduleChoices(state, player.index, choices);
  }
};

const applyGrant = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  grant: Grant,
  axis: ScoreAxis,
  source: string,
  choices: ChoiceEffect[],
): void => {
  switch (grant.kind) {
    case 'gold':
      player.gold += grant.amount;
      return;
    case 'materials':
      player.materials += grant.amount;
      return;
    case 'militaryTokens':
      player.militaryTokens += grant.amount;
      return;
    case 'drawCivCards':
      drawCivCards(state, d, player, grant.amount);
      return;
    case 'tempWorkers':
      gainTempWorkers(state, d, player, grant.amount);
      return;
    case 'points':
      addScore(state, d, player, grant.amount, axis, source);
      return;
    case 'landTiles':
      // 強行軍：遠征報酬（017 の遠征報酬を含む）の土地タイルは地形と異なる種類でも置ける（カードの効果が 4-2-2 に優先する）。
      choices.push({
        k: 'landTiles',
        n: grant.amount,
        ...(source === 'expedition' && hasModifier(d, player, 'expeditionTilesAnyTerrain') ? { any: true } : {}),
      });
      return;
    case 'buildRight':
      for (let i = 0; i < grant.amount; i += 1) {
        choices.push({ k: 'buildRight' });
      }
      return;
    case 'freeBuildOnTerrain':
      for (let i = 0; i < grant.amount; i += 1) {
        choices.push({ k: 'freeBuild', terrain: grant.terrain });
      }
      return;
    case 'specialCitizen':
      for (let i = 0; i < grant.amount; i += 1) {
        choices.push({ k: 'specialCitizen' });
      }
      return;
    case 'goldProduction':
      player.goldProduction += grant.amount;
      return;
    case 'materialProduction':
      player.materialProduction += grant.amount;
      return;
  }
};

// ---------------------------------------------------------------------------
// 土地と建物
// ---------------------------------------------------------------------------

/** 土地タイルを置く。マスボーナスは呼び出し側がまとめて処理する（4-4-4）。 */
export const putLandTile = (state: GameState, d: GameData, player: PlayerState, cell: CellId, terrain: Terrain): void => {
  player.land[cell] = terrain;
  emit(state, d, { type: 'tilePlaced', player: player.index, cell, terrain });
};

/** 置いた土地タイルのマスボーナスを効果の列にする（4-4-4-2）。 */
export const squareBonusEffects = (d: GameData, player: PlayerState, cells: readonly CellId[]): Effect[] => {
  const board = boardOf(d, player);
  const effects: Effect[] = [];
  for (const cell of cells) {
    const bonus = board.squares[cell]?.bonus;
    if (bonus !== null && bonus !== undefined) {
      effects.push({ k: 'grant', grant: bonus, source: `square:${cell}` });
    }
  }
  return effects;
};

/** 建物を置く。建設時効果と地形ボーナスは buildEffects で得る（5-6-3）。 */
export const putBuilding = (state: GameState, d: GameData, player: PlayerState, cell: CellId, building: Building): void => {
  player.buildings[cell] = building;
  noteBuiltDuringAction(state, player, building);
  emit(state, d, { type: 'built', player: player.index, cell, building });
};

/** 処理中のアクション（最も上のアクションの終わりの印）に、建てた建物を記録する（注文住宅・開拓小屋）。 */
const noteBuiltDuringAction = (state: GameState, player: PlayerState, building: Building): void => {
  for (let i = state.stack.length - 1; i >= 0; i -= 1) {
    const task = state.stack[i];
    if (task?.t === 'actionEnd' && task.player === player.index) {
      task.built.push(building);
      return;
    }
  }
};

/**
 * 文明カードの上に建物を建てる（移動住宅、ユーザー決定 2026-11-06）。建物の上限までに限る。
 * 盤面のマスを使わないため、地形ボーナスと飯場の軽減はない。建設時効果と「建設した時」の効果は通常どおり起きる。
 */
export const buildOnCard = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  building: Building,
  count: number,
  source: string,
): void => {
  const room = Math.max(0, d.params.buildings.limits[building] - buildingCount(player, building));
  const n = Math.min(count, room);
  if (n < count) {
    emit(state, d, { type: 'fizzle', player: player.index, what: `buildOnCard:${count - n}` });
  }
  if (building !== 'house') {
    throw new Error(`カードの上に建てられるのは住宅だけである：${building}`);
  }
  for (let i = 0; i < n; i += 1) {
    player.cardHouses = { ...player.cardHouses, [source]: cardHouseCount(player, source) + 1 };
    noteBuiltDuringAction(state, player, building);
    emit(state, d, { type: 'built', player: player.index, cell: null, building });
  }
};

/** トラックが1上がるごとの出来事（公務）。上限で上がらなかった分は起きない。 */
const emitTrackRaised = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  track: 'military' | 'infra',
  before: number,
  after: number,
): void => {
  for (let level = before + 1; level <= after; level += 1) {
    emit(state, d, { type: 'trackRaised', player: player.index, track, level });
  }
};

/** 建設時効果と地形ボーナス（5-4、5-5）。地形は土地タイルの種類を参照する（4-1-3-2）。 */
export const buildEffects = (d: GameData, player: PlayerState, picks: readonly { building: Building; cell: CellId }[]): Effect[] => {
  const e = d.params.buildings.effects;
  const effects: Effect[] = [];
  for (const { building, cell } of picks) {
    switch (building) {
      case 'shop':
        effects.push({ k: 'goldProduction', n: e.shop.goldProductionOnBuild });
        break;
      case 'workshop':
        effects.push({ k: 'materialProduction', n: e.workshop.materialProductionOnBuild });
        break;
      case 'fort':
        effects.push({ k: 'military', n: e.fort.militaryOnBuild, overflowPoints: false, source: 'build:fort' });
        break;
      case 'office':
        effects.push({ k: 'infra', n: e.office.infraOnBuild });
        break;
      case 'university':
        effects.push({ k: 'grant', grant: { kind: 'drawCivCards', amount: e.university.drawOnBuild }, source: 'build:university' });
        break;
      case 'camp':
        effects.push({ k: 'grant', grant: { kind: 'landTiles', amount: e.camp.landTilesOnBuild }, source: 'build:camp' });
        break;
      case 'house':
        break;
    }
    const tile = player.land[cell];
    for (const bonus of d.params.buildings.terrainBonus) {
      if (bonus.terrain === tile && bonus.buildings.includes(building)) {
        effects.push({ k: 'grant', grant: bonus.grant, source: `terrainBonus:${building}` });
      }
    }
  }
  return effects;
};

// ---------------------------------------------------------------------------
// 軍事力トークンの支払い（傭兵団、ユーザー決定 2026-11-06）
// ---------------------------------------------------------------------------

/** 傭兵団の補正による、トークン1つの代わりの金。複数あれば安いほう。補正がなければ null。 */
export const goldPerToken = (d: GameData, player: PlayerState): number | null =>
  modifiersOf(d, player).reduce<number | null>((rate, m) => (m.kind === 'tokensByGold' ? Math.min(rate ?? m.gold, m.gold) : rate), null);

/** 払える軍事力トークンの数。傭兵団があれば、金で替えられる分を加える。 */
export const tokenBudget = (d: GameData, player: PlayerState): number => {
  const rate = goldPerToken(d, player);
  return player.militaryTokens + (rate === null ? 0 : Math.floor(player.gold / rate));
};

/**
 * 軍事力トークンを n 個払う。トークンを先に使い、足りない分は傭兵団の率で金を払う。
 * 傭兵団があり、使ったトークンをさらに金に替えられるときは、替える数を尋ねるタスク（tokenSwap）を積む。
 * tokenSwap は applyMove の終わりに最上段へ移し、支払いの直後に尋ねる（engine.ts）。
 */
export const payMilitaryTokens = (state: GameState, d: GameData, player: PlayerState, n: number): void => {
  if (n <= 0) {
    return;
  }
  const rate = goldPerToken(d, player);
  const used = Math.min(player.militaryTokens, n);
  player.militaryTokens -= used;
  if (n > used) {
    if (rate === null) {
      throw new Error(`軍事力トークンが足りない：${n} 個に対して ${used} 個`);
    }
    player.gold -= (n - used) * rate;
  }
  if (rate !== null && used > 0 && player.gold >= rate) {
    state.stack.push({ t: 'tokenSwap', player: player.index, max: used, rate });
  }
};
