// ゲームの進行（選択待ちモデル）。公開する関数は createGame・getOptions・applyMove・isGameOver である。
// 準備とドラフト（第2章）、ラウンドの進行（第12章）、手番・パス・ボーナスタイル（第11章）、
// ワーカーの配置と占有（6-1、6-2）、フリーアクション（第10章）、襲撃（7-3〜7-6、19-3）を扱う。

import { draftPickOrder } from './draft.ts';
import { GAME_DATA } from '../data/index.ts';
import { ACTIONS, BUILDINGS, TIERS, type Action, type GameData, type Tier } from '../data/types.ts';
import {
  applyBuild,
  applyDiscard,
  applyDrillRaise,
  applyExpedition,
  applyExportCount,
  applyImportCount,
  applyMigrationCount,
  applyPioneerCount,
  applyPlaceTile,
  applySpread,
  applyWelfareConvert,
  buildOptions,
  canExecute,
  discardOptions,
  drillRaiseOptions,
  actionChoiceOptions,
  applyActionChoice,
  expeditionOptions,
  exportCountOptions,
  finishPlaceTiles,
  importCountOptions,
  migrationCountOptions,
  pioneerCountOptions,
  placeTilesOptions,
  spreadOptions,
  startAction,
  welfareConvertOptions,
} from './actions.ts';
import {
  addScore,
  boardOf,
  buildingCount,
  drawCivCards,
  emit,
  landCount,
  playerOf,
  processEffects,
  putLandTile,
  scheduleChoices,
  takeChoice,
  usableRegular,
  usableTemp,
  type Effect,
  payMilitaryTokens,
  removeTask,
  tokenBudget,
} from './core.ts';
import { abilitiesOf, hasModifier } from './abilities.ts';
import { isCheckpoint } from './history.ts';
import { recordDeltas, snapshot } from './deltas.ts';
import { onSpecialCitizenAcquired, runAbilities, runCommands } from './effects.ts';
import {
  abilityFreeOptions,
  applyAbilityFree,
  applyChooseOne,
  applyCopyAction,
  applyHeroStart,
  applyPlan,
  applyPlayCard,
  applySpiritPlace,
  chooseOneOptions,
  copyActionOptions,
  heroStartOptions,
  planOptions,
  playCardOptions,
  spaceOptions,
  spaceWorkerCost,
  spiritPlaceOptions,
  startSpace,
} from './effect-tasks.ts';
import { createRng, shuffle } from './rng.ts';
import type { ChoiceEffect, GameConfig, GameState, Option, PlayerState, RaidDeclaration, RaidResult, Task } from './types.ts';

type TaskOf<T extends Task['t']> = Extract<Task, { t: T }>;

const opt = (player: number, id: string, label: string): Option => ({ id, player, label });

// ---------------------------------------------------------------------------
// 準備（第2章）
// ---------------------------------------------------------------------------

const newPlayer = (d: GameData, index: number, name: string): PlayerState => {
  const init = d.params.initial;
  return {
    index,
    name,
    boardId: null,
    characterId: null,
    bonusTile: null,
    land: {},
    buildings: {},
    cardHouses: {},
    gold: init.gold,
    materials: init.materials,
    goldProduction: init.goldProduction,
    materialProduction: init.materialProduction,
    militaryTokens: 0,
    regularWorkers: init.regularWorkers,
    regularNewThisRound: 0,
    regularPlaced: 0,
    tempWorkers: init.tempWorkers,
    tempLocked: 0,
    militaryLevel: init.militaryLevel,
    infraLevel: init.infraLevel,
    militaryRewardsClaimed: [],
    infraRewardsClaimed: [],
    hand: [],
    played: [],
    specialCitizens: [],
    natureParkCard: null,
    unlockedTop: [],
    passed: false,
    score: 0,
    pendingLosses: [],
    firstTurnDone: false,
    usedThisRound: [],
    abilityCounters: {},
    onceFired: [],
    lockedSources: [],
    spiritChips: {},
    privatePlannedCities: [],
  };
};

/** ゲームを作る。ドラフトの最初の選択待ちで止まった状態を返す。 */
export const createGame = (config: GameConfig, seed: number, d: GameData = GAME_DATA): GameState => {
  const n = config.playerCount;
  const setup = d.params.setupByPlayerCount[String(n)];
  if (setup === undefined || n < d.params.playerCount.min || n > d.params.playerCount.max) {
    throw new Error(`対応していないプレイ人数である：${n}`);
  }
  let rng = createRng(seed);
  const take = <T>(items: readonly T[]): T[] => {
    const [result, next] = shuffle(items, rng);
    rng = next;
    return result;
  };

  // 第1ラウンドの手番順はランダムに決める（2-6-3、12-0-3）。
  const turnOrder = take(Array.from({ length: n }, (_, i) => i));
  const civDeck = take(d.civilizationCards.map((c) => c.id));
  // 特別な市民カードはプレイ人数＋1枚を公開し、残りをシャッフルして山札にする（2-3-1、19-4-4）。
  const sc = take(d.specialCitizens.map((c) => c.id));
  const planned = take(d.plannedCityCards.map((c) => c.id));
  const parks = take(d.natureParkCards.map((c) => c.id));
  // 第1ラウンドはカード1を固定とし、残りをシャッフルする（7-3-1、7-3-2）。
  const first = d.params.raid.firstRoundCard;
  const raidOrder = [first, ...take(d.raidCards.map((c) => c.id).filter((id) => id !== first))];
  // 場のボーナスタイルは10種からランダムに選ぶ（2-4-2、19-4-5）。
  const bonusTilesOnBoard = take(d.bonusTiles.map((t) => t.id)).slice(0, setup.bonusTilesOnBoard);
  const boards = take(d.boards.map((b) => b.id)).slice(0, setup.draftBoardCandidates);
  const characters = take(d.characters.map((c) => c.id)).slice(0, setup.draftCharacterCandidates);

  const names = config.playerNames ?? [];
  const state: GameState = {
    config,
    seed,
    rng,
    phase: 'draft',
    round: 0,
    turnOrder,
    passOrder: [],
    players: Array.from({ length: n }, (_, i) => newPlayer(d, i, names[i] ?? `プレイヤー${i + 1}`)),
    civDeck,
    civDiscard: [],
    scDeck: sc.slice(setup.specialCitizensRevealed),
    scRevealed: sc.slice(0, setup.specialCitizensRevealed),
    plannedCityRevealed: planned.slice(0, setup.plannedCityRevealed),
    plannedCityDeck: planned.slice(setup.plannedCityRevealed),
    plannedCityClaims: {},
    raidOrder,
    defenseLine: 0,
    repelLine: 0,
    bonusTilesOnBoard,
    draftPool: { boards, characters, bonusTiles: [...bonusTilesOnBoard] },
    occupied: [],
    stack: [],
    events: [],
    revealCount: 0,
    log: [],
  };

  // 自然公園カードを1枚ずつ配り（2-3-2）、文明カードを配る（2-2-1）。
  turnOrder.forEach((p, i) => {
    const player = playerOf(state, p);
    player.natureParkCard = parks[i] ?? null;
    drawCivCards(state, d, player, d.params.initial.civCards);
  });

  // ドラフトは手番順の最後のプレイヤーから逆順に選び、一巡したら再び最後から選ぶ（2-6-7）。
  // ヴァリアントのスネークドラフトでは2巡目だけ向きを反転する（draft.ts）。
  const picks = draftPickOrder(turnOrder, config.variants);
  state.stack.push({ t: 'setupFinish' });
  for (const p of [...picks].reverse()) {
    state.stack.push({ t: 'draftPick', player: p });
  }
  advance(state, d);
  return state;
};

const draftOptions = (state: GameState, task: TaskOf<'draftPick'>): Option[] => {
  const player = playerOf(state, task.player);
  const options: Option[] = [];
  // まだ獲得していない種類の要素からのみ選べる（2-6-4-2）。
  if (player.boardId === null) {
    options.push(...state.draftPool.boards.map((id) => opt(task.player, `draft:board:${id}`, `個人ボード ${id}`)));
  }
  if (player.bonusTile === null) {
    options.push(...state.draftPool.bonusTiles.map((id) => opt(task.player, `draft:bonus:${id}`, `ボーナスタイル ${id}`)));
  }
  if (player.characterId === null) {
    options.push(...state.draftPool.characters.map((id) => opt(task.player, `draft:character:${id}`, `キャラクター ${id}`)));
  }
  return options;
};

const applyDraft = (state: GameState, d: GameData, task: TaskOf<'draftPick'>, id: string): void => {
  state.stack.pop();
  const [, kind = '', value = ''] = id.split(':');
  const player = playerOf(state, task.player);
  if (kind === 'board') {
    player.boardId = value;
    state.draftPool.boards = state.draftPool.boards.filter((b) => b !== value);
  } else if (kind === 'bonus') {
    player.bonusTile = Number(value);
    state.draftPool.bonusTiles = state.draftPool.bonusTiles.filter((b) => b !== Number(value));
  } else {
    player.characterId = value;
    state.draftPool.characters = state.draftPool.characters.filter((c) => c !== value);
  }
  emit(state, d, { type: 'draft', player: task.player, kind, id: value });
};

/** 準備の効果で初期配置のタイルを置き換えるか（英雄の heroStart）。 */
const replacesInitialTiles = (d: GameData, player: PlayerState): boolean =>
  abilitiesOf(d, player).some((owned) => owned.ability.ability === 'setup' && owned.ability.do.some((c) => c.op === 'heroStart'));

const setupFinish = (state: GameState, d: GameData): void => {
  // 初期開拓済みマスに土地タイルを置く（2-1-4、2-7-1）。
  // 英雄（準備で heroStart を持つキャラクター）は初期配置のタイルを置かず、代わりに山岳タイルを置く（ユーザー決定 2026-11-06、19-5-1 からの変更）。
  for (const player of state.players) {
    if (replacesInitialTiles(d, player)) continue;
    const board = boardOf(d, player);
    for (const cell of d.params.board.initialCells) {
      putLandTile(state, d, player, cell, board.squares[cell]?.terrain ?? d.params.board.initialTerrain);
    }
  }
  state.round = 1;
  state.stack.push({ t: 'roundStart' });
  // キャラクターの追加初期資源（2-5-3、2-7-2）。手番順の最初のプレイヤーの選択が先に来るよう逆順に処理する。
  for (const p of [...state.turnOrder].reverse()) {
    runAbilities(state, d, playerOf(state, p), 'setup');
  }
};

// ---------------------------------------------------------------------------
// ラウンドの進行（第12章）
// ---------------------------------------------------------------------------

const roundStart = (state: GameState, d: GameData): void => {
  state.phase = 'play';
  // 襲撃カードを公開し、防衛ライン・撃退ラインに増加値を累積する（7-3-3、7-4-2）。
  const cardId = state.raidOrder[state.round - 1];
  const card = d.raidCards.find((c) => c.id === cardId);
  if (card === undefined) {
    throw new Error(`第${state.round}ラウンドの襲撃カードがない`);
  }
  state.defenseLine += card.defense_increase;
  state.repelLine += card.repel_increase;
  state.revealCount += 1;
  emit(state, d, { type: 'round', round: state.round, raidCard: card.id });

  const last = state.turnOrder[state.turnOrder.length - 1];
  if (last === undefined) {
    throw new Error('手番順が空である');
  }
  // 1. ボーナスタイル、2. その他のラウンド開始時効果、3. 収入、4. 手番（12-0-1）。
  // ボーナスタイルの効果は手番順に処理する（12-0-2、12-0-2-2）。
  // 手番は収入の後に作る。ラウンド開始時に得た臨時ワーカーを「手番中の獲得」と扱わないためである（3-4-4-2）。
  state.stack.push({ t: 'nextTurn', from: last });
  state.stack.push({ t: 'income' });
  for (const p of [...state.turnOrder].reverse()) {
    state.stack.push({ t: 'bonusTileStart', player: p });
  }
};

const bonusTileStart = (state: GameState, d: GameData, task: TaskOf<'bonusTileStart'>): void => {
  const player = playerOf(state, task.player);
  const tile = d.bonusTiles.find((t) => t.id === player.bonusTile);
  if (tile === undefined) {
    return;
  }
  const effects: Effect[] = [];
  const choices: ChoiceEffect[] = [];
  const source = `bonusTile:${tile.id}`;
  for (const e of tile.roundStart) {
    switch (e.kind) {
      case 'goldProduction':
      case 'materialProduction':
        // ボーナスタイルによる生産力の増加は、そのラウンドの収入から反映する（3-2-4）。
        effects.push({ k: e.kind, n: e.amount });
        break;
      case 'militaryLevel':
        effects.push({ k: 'military', n: e.amount, overflowPoints: false, source });
        break;
      case 'infraLevel':
        effects.push({ k: 'infra', n: e.amount });
        break;
      case 'discardCivCards':
        choices.push({ k: 'discard', n: e.amount });
        break;
      default:
        effects.push({ k: 'grant', grant: { kind: e.kind, amount: e.amount }, source });
    }
  }
  // 捨て札は引いた後に行う（11-2-1 No.4）。先に積んで、他の選択の後に処理する。
  scheduleChoices(state, task.player, choices);
  processEffects(state, d, player, effects);
};

const applyPendingLosses = (state: GameState): void => {
  for (const player of state.players) {
    for (const loss of player.pendingLosses) {
      // 保有量が足りなければ0にして終える（19-3-4）。
      if (loss.kind === 'gold') {
        player.gold = Math.max(0, player.gold - loss.amount);
      } else {
        player.materials = Math.max(0, player.materials - loss.amount);
      }
    }
    player.pendingLosses = [];
  }
};

const income = (state: GameState): void => {
  for (const player of state.players) {
    player.gold += player.goldProduction;
    player.materials += player.materialProduction;
  }
  // 襲撃の防衛失敗による「次の収入後」の損失（7-6-1）。
  applyPendingLosses(state);
};

const nextTurn = (state: GameState, task: TaskOf<'nextTurn'>): void => {
  const order = state.turnOrder;
  const from = order.indexOf(task.from);
  for (let i = 1; i <= order.length; i += 1) {
    const candidate = order[(from + i) % order.length];
    if (candidate !== undefined && !playerOf(state, candidate).passed) {
      state.stack.push({ t: 'turn', player: candidate, acted: false, started: false });
      state.stack.push({ t: 'turnStart', player: candidate });
      return;
    }
  }
  // 全員がパスしたら襲撃を処理する（12-0-1 手順5）。手番順に宣言する。
  state.phase = 'raid';
  state.stack.push({ t: 'roundEnd' });
  for (const p of [...order].reverse()) {
    state.stack.push({ t: 'raidDeclare', player: p });
  }
};

/** 手番の開始。最初の手番なら手番開始時の効果を処理する（芸術家・聖女・デザイナー）。 */
const turnStart = (state: GameState, d: GameData, task: TaskOf<'turnStart'>): void => {
  const player = playerOf(state, task.player);
  if (!player.firstTurnDone) {
    player.firstTurnDone = true;
    runAbilities(state, d, player, 'firstTurnStart');
  }
};

const roundEnd = (state: GameState, d: GameData): void => {
  // ワーカーの回収と占有の解除（3-3-2、6-2-3）。次のラウンドの手番順はパスした順（12-0-5）。
  for (const player of state.players) {
    player.regularPlaced = 0;
    player.regularNewThisRound = 0;
    player.passed = false;
    player.usedThisRound = [];
    // 精霊チップは3ラウンド目の襲撃の後に回収し、再び使えるようにする（19-5-7）。
    if (state.round === d.params.characters.spiritChipReturnRound) {
      player.spiritChips = {};
    }
  }
  state.occupied = [];
  state.turnOrder = [...state.passOrder];
  state.passOrder = [];
  state.round += 1;
  state.stack.push(state.round > d.params.rounds ? { t: 'gameEnd' } : { t: 'roundStart' });
};

const gameEnd = (state: GameState, d: GameData): void => {
  // 最終収入と、最終ラウンドの襲撃による損失（3-2-5、7-6-3、12-2-1、17-0-1）。
  income(state);
  // ゲーム終了時判定のカード・目標の処理（17-0-1 手順4、19-5-5）。
  for (const p of state.turnOrder) {
    runAbilities(state, d, playerOf(state, p), 'gameEnd');
  }
  state.round = d.params.rounds;
  state.phase = 'over';
  emit(state, d, { type: 'gameOver' });
};

// ---------------------------------------------------------------------------
// 手番（12-0-6、12-0-7、第6章、第10章）
// ---------------------------------------------------------------------------

const spaceKey = (action: Action, tier: Tier): string => `${action}.${tier}`;

const isShared = (d: GameData, action: Action, tier: Tier): boolean =>
  d.params.actions.shared.some((s) => s.action === action && s.tier === tier);

/** 最上位アクションの解放（6-1-4、6-1-5、19-2-10）。一度満たしたら記録して維持する。 */
export const isTopUnlocked = (d: GameData, player: PlayerState, action: Action): boolean => {
  if (player.unlockedTop.includes(action)) {
    return true;
  }
  const unlock = d.params.actions.unlockTop[action];
  let value: number;
  switch (unlock.metric) {
    case 'buildingsOfType':
      value = buildingCount(player, unlock.building);
      break;
    case 'totalBuildings':
      value = buildingCount(player);
      break;
    case 'landTiles':
      value = landCount(player);
      break;
    case 'militaryLevel':
      value = player.militaryLevel;
      break;
    case 'civCardsPlayed':
      value = player.played.length;
      break;
  }
  return value >= unlock.atLeast;
};

const recordUnlocks = (d: GameData, state: GameState): void => {
  for (const player of state.players) {
    for (const action of ACTIONS) {
      if (!player.unlockedTop.includes(action) && isTopUnlocked(d, player, action)) {
        player.unlockedTop.push(action);
      }
    }
  }
};

/** アクションスペースを選べるか。選べない理由の説明（explain）は段階4で作る。 */
export const canChooseSpace = (state: GameState, d: GameData, player: PlayerState, action: Action, tier: Tier): boolean => {
  if (!isShared(d, action, tier) && state.occupied.includes(spaceKey(action, tier))) {
    return false;
  }
  if (tier === 'top' && !isTopUnlocked(d, player, action)) {
    return false;
  }
  if (usableRegular(player) + usableTemp(player) < d.params.actions.workerCost[tier]) {
    return false;
  }
  return canExecute(d, player, action, tier);
};

const freeActionOptions = (state: GameState, d: GameData, player: PlayerState): Option[] => {
  const options: Option[] = [];
  for (const conv of d.params.freeActions.conversions) {
    const label = `フリーアクション ${conv.id}`;
    switch (conv.pay.kind) {
      case 'gold':
        if (player.gold >= conv.pay.amount) options.push(opt(player.index, `free:${conv.id}`, label));
        break;
      case 'materials':
        if (player.materials >= conv.pay.amount) options.push(opt(player.index, `free:${conv.id}`, label));
        break;
      case 'militaryTokens':
        if (tokenBudget(d, player) >= conv.pay.amount) options.push(opt(player.index, `free:${conv.id}`, label));
        break;
      case 'tempWorkers':
        if (usableTemp(player) >= conv.pay.amount) options.push(opt(player.index, `free:${conv.id}`, label));
        break;
      case 'civCards':
        // 捨てるカードを選ぶ。1枚ずつの変換として扱う。
        if (conv.pay.amount === 1) {
          for (const card of new Set(player.hand)) {
            options.push(opt(player.index, `free:${conv.id}:${card}`, `${label}（${card}）`));
          }
        }
        break;
    }
  }
  return options;
};

const turnOptions = (state: GameState, d: GameData, task: TaskOf<'turn'>): Option[] => {
  const player = playerOf(state, task.player);
  const options: Option[] = [];
  if (!task.acted) {
    for (const action of ACTIONS) {
      for (const tier of TIERS) {
        if (canChooseSpace(state, d, player, action, tier)) {
          options.push(opt(task.player, `act:${action}:${tier}`, `${action}（${tier}）`));
        }
      }
    }
    options.push(...spaceOptions(state, d, player, usableRegular(player) + usableTemp(player)));
    // パスは常に選べる（12-1-1）。自動では行わない（12-0-7）。
    options.push(opt(task.player, 'pass', 'パスする'));
  } else {
    options.push(opt(task.player, 'end', '手番を終える'));
  }
  // フリーアクションと計画都市の達成宣言は、アクションの前後に行える（12-0-6、13-3-2）。
  options.push(...freeActionOptions(state, d, player));
  options.push(...abilityFreeOptions(state, d, player));
  options.push(...planOptions(state, d, player));
  return options;
};

const payWorkersRange = (player: PlayerState, cost: number): number[] => {
  const min = Math.max(0, cost - usableRegular(player));
  const max = Math.min(cost, usableTemp(player));
  const result: number[] = [];
  for (let k = min; k <= max; k += 1) {
    result.push(k);
  }
  return result;
};

/** ワーカーを置き、対象（"act:<action>:<tier>" または "space:<能力>"）を始める。 */
const placeWorkers = (state: GameState, d: GameData, player: PlayerState, target: string, cost: number, temps: number): void => {
  player.regularPlaced += cost - temps;
  // 臨時ワーカーは使用すると失われる（3-4-2）。
  player.tempWorkers -= temps;
  if (target.startsWith('space:')) {
    startSpace(state, d, player, target.slice('space:'.length));
    return;
  }
  const [, a = '', b = ''] = target.split(':');
  const action = a as Action;
  const tier = b as Tier;
  if (!isShared(d, action, tier)) {
    state.occupied.push(spaceKey(action, tier));
  }
  startAction(state, d, player, action, tier);
};

const applyTurn = (state: GameState, d: GameData, task: TaskOf<'turn'>, id: string): void => {
  const player = playerOf(state, task.player);
  if (id === 'end') {
    endTurn(state, player);
    return;
  }
  if (id === 'pass') {
    pass(state, d, player);
    return;
  }
  const [kind, a = '', b = ''] = id.split(':');
  if (kind === 'free') {
    applyFreeAction(state, d, player, a, b);
    return;
  }
  if (kind === 'ability') {
    applyAbilityFree(state, d, player, id.slice('ability:'.length));
    return;
  }
  if (kind === 'plan') {
    applyPlan(state, d, player, a);
    return;
  }
  const cost = kind === 'space' ? spaceWorkerCost(d, player, id.slice('space:'.length)) : d.params.actions.workerCost[b as Tier];
  task.acted = true;
  const temps = payWorkersRange(player, cost);
  const [only] = temps;
  if (temps.length === 1 && only !== undefined) {
    placeWorkers(state, d, player, id, cost, only);
  } else {
    // 通常ワーカーと臨時ワーカーの組み合わせを尋ねる（3-4-6）。
    state.stack.push({ t: 'payWorkers', player: task.player, cost, target: id });
  }
};

const applyFreeAction = (state: GameState, d: GameData, player: PlayerState, id: string, card: string): void => {
  const conv = d.params.freeActions.conversions.find((c) => c.id === id);
  if (conv === undefined) {
    throw new Error(`存在しないフリーアクションである：${id}`);
  }
  switch (conv.pay.kind) {
    case 'gold':
      player.gold -= conv.pay.amount;
      break;
    case 'materials':
      player.materials -= conv.pay.amount;
      break;
    case 'militaryTokens':
      payMilitaryTokens(state, d, player, conv.pay.amount);
      break;
    case 'tempWorkers':
      player.tempWorkers -= conv.pay.amount;
      break;
    case 'civCards':
      player.hand.splice(player.hand.indexOf(card), 1);
      state.civDiscard.push(card);
      break;
  }
  emit(state, d, { type: 'free', player: player.index, id });
  processEffects(state, d, player, [{ k: 'grant', grant: conv.gain, source: `free:${id}` }]);
};

const endTurn = (state: GameState, player: PlayerState): void => {
  state.stack.pop();
  player.tempLocked = 0;
  player.lockedSources = [];
  state.stack.push({ t: 'nextTurn', from: player.index });
};

const passCount = (d: GameData, player: PlayerState, count: 'houses' | 'buildingTypes' | 'playedCivCards'): number => {
  switch (count) {
    case 'houses':
      return buildingCount(player, 'house');
    case 'buildingTypes':
      return BUILDINGS.filter((b) => buildingCount(player, b) > 0).length;
    case 'playedCivCards':
      return player.played.length;
  }
};

const pass = (state: GameState, d: GameData, player: PlayerState): void => {
  state.stack.pop();
  player.tempLocked = 0;
  player.lockedSources = [];
  // パス時効果を先に処理し、パス宣言時点の状態を参照する（11-2-5、12-1-2）。
  const tile = d.bonusTiles.find((t) => t.id === player.bonusTile);
  if (tile?.passScore) {
    const score = tile.passScore;
    const points = Math.floor(passCount(d, player, score.count) / score.per) * score.points;
    addScore(state, d, player, points, 'other', `pass:bonusTile:${tile.id}`);
  }
  player.passed = true;
  state.passOrder.push(player.index);
  emit(state, d, { type: 'pass', player: player.index });
  state.stack.push({ t: 'nextTurn', from: player.index });
  // 第5ラウンドではタイルの返却と選択を行わない（19-4-2）。
  if (state.round < d.params.rounds) {
    const returned = player.bonusTile;
    player.bonusTile = null;
    state.stack.push({ t: 'passTile', player: player.index, returned });
  }
};

const passTileOptions = (state: GameState, task: TaskOf<'passTile'>): Option[] => {
  const held = new Set(state.players.map((p) => p.bonusTile));
  // 返却したタイルと、他プレイヤーが占有しているタイルは選べない（11-3-2）。
  return state.bonusTilesOnBoard
    .filter((id) => id !== task.returned && !held.has(id))
    .map((id) => opt(task.player, `bonus:${id}`, `ボーナスタイル ${id}`));
};

// ---------------------------------------------------------------------------
// 襲撃（7-3〜7-6、19-3）
// ---------------------------------------------------------------------------

const raidNeed = (player: PlayerState, line: number): number => Math.max(0, line - player.militaryLevel);

const raidOptions = (state: GameState, d: GameData, task: TaskOf<'raidDeclare'>): Option[] => {
  const player = playerOf(state, task.player);
  // 宣言できるのは不足分のトークンを払える目標に限る。宣言しないことも選べる（19-3-2）。
  const options = [opt(task.player, 'raid:none', '宣言しない')];
  if (raidNeed(player, state.defenseLine) <= tokenBudget(d, player)) {
    options.push(opt(task.player, 'raid:defense', `防衛ライン ${state.defenseLine} を宣言する`));
  }
  if (raidNeed(player, state.repelLine) <= tokenBudget(d, player)) {
    options.push(opt(task.player, 'raid:repel', `撃退ライン ${state.repelLine} を宣言する`));
  }
  // 雲隠れ：自分の襲撃の処理（宣言・判定・得点・カードの効果・判定結果への反応）をすべて行わない（ユーザー決定 2026-11-06）。
  if (hasModifier(d, player, 'skipRaid')) {
    options.push(opt(task.player, 'raid:skip', '襲撃の処理を行わない'));
  }
  return options;
};

const tokenSwapOptions = (state: GameState, task: TaskOf<'tokenSwap'>): Option[] => {
  const player = playerOf(state, task.player);
  const max = Math.min(task.max, Math.floor(player.gold / task.rate));
  return Array.from({ length: max + 1 }, (_, k) => k).map((k) => opt(task.player, `count:${k}`, k === 0 ? '金に替えない' : `トークン${k}個を${k * task.rate}金に替える`));
};

const applyTokenSwap = (state: GameState, task: TaskOf<'tokenSwap'>, id: string): void => {
  removeTask(state, task);
  const player = playerOf(state, task.player);
  const k = Number(id.slice('count:'.length));
  player.militaryTokens += k;
  player.gold -= k * task.rate;
};

const applyRaid = (state: GameState, d: GameData, task: TaskOf<'raidDeclare'>, id: string): void => {
  state.stack.pop();
  const player = playerOf(state, task.player);
  if (id === 'raid:skip') {
    emit(state, d, { type: 'fizzle', player: task.player, what: 'raid' });
    return;
  }
  const declared = id.split(':')[1] as RaidDeclaration;
  let strength = player.militaryLevel;
  if (declared !== 'none') {
    const line = declared === 'defense' ? state.defenseLine : state.repelLine;
    payMilitaryTokens(state, d, player, raidNeed(player, line));
    strength = Math.max(strength, line);
  }
  const result: RaidResult =
    strength >= state.repelLine ? 'repelled' : strength >= state.defenseLine ? 'defended' : 'defenseFailed';
  const round = state.round;
  emit(state, d, { type: 'raid', player: task.player, round, result, declared });

  const card = d.raidCards.find((c) => c.id === state.raidOrder[round - 1]);
  if (card === undefined) {
    throw new Error(`第${round}ラウンドの襲撃カードがない`);
  }
  const source = `raid:${card.id}`;
  // 基本得点（7-5-1）。カード5は合算後の数値のため加えない（19-3-3）。
  // 名誉ある犠牲：防衛失敗で点数を失わない。基本得点と襲撃カードの「点」の減点をなくし、金・資材などの損失は受ける（ユーザー決定 2026-11-06）。
  const keepPoints = result === 'defenseFailed' && hasModifier(d, player, 'noRaidPointLoss');
  const raidScore = (points: number): void => {
    if (keepPoints && points < 0) return;
    addScore(state, d, player, points, 'military', source);
  };
  // 襲撃カードの効果は、結果ごとに定めた種類だけを適用する（ユーザー決定 2026-11-07：防衛失敗はカードの効果を無視し、
  // 撃退成功は資源の効果だけを得る）。カードの「点」を適用しない結果では、カード5も基本得点で数える。
  const allowed = d.params.raid.cardEffectKinds[result];
  if (!card.replacesBasePoints || !allowed.includes('points')) {
    raidScore(d.params.raid.basePointsPerRound[result] * round);
  }
  const cardEffects = (result === 'defenseFailed' ? card.defenseFailEffects : result === 'repelled' ? card.repelEffects : []).filter((e) =>
    allowed.includes(e.kind),
  );
  const effects: Effect[] = [];
  for (const e of cardEffects) {
    const amount = e.perRound ? e.amount * round : e.amount;
    switch (e.kind) {
      case 'loseGold':
      case 'loseMaterials':
        if (e.afterNextIncome) {
          player.pendingLosses.push({ kind: e.kind === 'loseGold' ? 'gold' : 'materials', amount });
        } else if (e.kind === 'loseGold') {
          player.gold = Math.max(0, player.gold - amount);
        } else {
          player.materials = Math.max(0, player.materials - amount);
        }
        break;
      case 'loseGoldProduction':
        // 金の生産力は0未満にならない（19-3-4）。
        player.goldProduction = Math.max(0, player.goldProduction - amount);
        break;
      case 'points':
        raidScore(amount);
        break;
      case 'landTiles':
      case 'materials':
      case 'gold':
        effects.push({ k: 'grant', grant: { kind: e.kind, amount }, axis: 'military', source });
        break;
    }
  }
  processEffects(state, d, player, effects);
};

// ---------------------------------------------------------------------------
// 特別な市民カードと処理順
// ---------------------------------------------------------------------------

const specialCitizenOptions = (state: GameState, task: TaskOf<'chooseSpecialCitizen'>): Option[] =>
  state.scRevealed.map((id) => opt(task.player, `sc:${id}`, `特別な市民カード ${id}`));

const applySpecialCitizen = (state: GameState, d: GameData, task: TaskOf<'chooseSpecialCitizen'>, id: string): void => {
  state.stack.pop();
  const card = id.slice('sc:'.length);
  const player = playerOf(state, task.player);
  // 公開カードから1枚を選び、山札から1枚補充する（9-3-2、9-3-2-2）。山札が空なら補充しない（19-4-3）。
  state.scRevealed = state.scRevealed.filter((c) => c !== card);
  player.specialCitizens.push(card);
  const refill = state.scDeck.shift();
  if (refill !== undefined) {
    state.scRevealed.push(refill);
    state.revealCount += 1;
  }
  emit(state, d, { type: 'specialCitizen', player: task.player, card });
  onSpecialCitizenAcquired(state, d, player, card);
};

const choiceLabel = (effect: ChoiceEffect): string => {
  switch (effect.k) {
    case 'command':
      return `${effect.source} の ${effect.command.op}`;
    case 'landTiles':
      return `土地タイル${effect.n}枚を置く`;
    case 'buildRight':
      return '建設の権利を使う';
    case 'freeBuild':
      return '無料で建設する';
    case 'specialCitizen':
      return '特別な市民カードを獲得する';
    case 'discard':
      return `文明カードを${effect.n}枚捨てる`;
  }
};

// ---------------------------------------------------------------------------
// 選択待ちの振り分け
// ---------------------------------------------------------------------------

const AUTO_TASKS = new Set<Task['t']>([
  'setupFinish',
  'roundStart',
  'bonusTileStart',
  'income',
  'nextTurn',
  'turnStart',
  'roundEnd',
  'gameEnd',
  'actionEnd',
  'later',
]);

const topOf = (state: GameState): Task | undefined => state.stack[state.stack.length - 1];

const optionsFor = (state: GameState, d: GameData, task: Task): Option[] => {
  switch (task.t) {
    case 'draftPick':
      return draftOptions(state, task);
    case 'turn':
      return turnOptions(state, d, task);
    case 'payWorkers':
      return payWorkersRange(playerOf(state, task.player), task.cost).map((k) =>
        opt(task.player, `temp:${k}`, `臨時ワーカーを${k}人使う`),
      );
    case 'pioneerCount':
      return pioneerCountOptions(d, state, task);
    case 'placeTiles':
      return placeTilesOptions(d, state, task);
    case 'build':
      return buildOptions(d, state, task);
    case 'playCard':
      return playCardOptions(d, state, task);
    case 'chooseOne':
      return chooseOneOptions(task);
    case 'copyAction':
      return copyActionOptions(d, state, task);
    case 'spiritPlace':
      return spiritPlaceOptions(d, state, task);
    case 'heroStart':
      return heroStartOptions(d, state, task);
    case 'importCount':
      return importCountOptions(d, state, task);
    case 'exportCount':
      return exportCountOptions(d, state, task);
    case 'drillRaise':
      return drillRaiseOptions(d, state, task);
    case 'actionChoice':
      return actionChoiceOptions(d, state, task);
    case 'expeditionPick':
      return expeditionOptions(d, state, task);
    case 'welfareConvert':
      return welfareConvertOptions(d, state, task);
    case 'migrationCount':
      return migrationCountOptions(d, state, task);
    case 'discard':
      return discardOptions(state, task);
    case 'spreadPlay':
      return spreadOptions(d, state, task);
    case 'chooseSpecialCitizen':
      return specialCitizenOptions(state, task);
    case 'chooseOrder':
      return task.items.map((item, i) => opt(task.player, `order:${i}`, choiceLabel(item)));
    case 'passTile':
      return passTileOptions(state, task);
    case 'raidDeclare':
      return raidOptions(state, d, task);
    case 'tokenSwap':
      return tokenSwapOptions(state, task);
    default:
      return [];
  }
};

const applyTask = (state: GameState, d: GameData, task: Task, id: string): void => {
  switch (task.t) {
    case 'draftPick':
      return applyDraft(state, d, task, id);
    case 'turn':
      return applyTurn(state, d, task, id);
    case 'payWorkers':
      state.stack.pop();
      return placeWorkers(state, d, playerOf(state, task.player), task.target, task.cost, Number(id.slice('temp:'.length)));
    case 'pioneerCount':
      return applyPioneerCount(state, task, id);
    case 'placeTiles':
      return applyPlaceTile(state, d, task, id);
    case 'build':
      return applyBuild(state, d, task, id);
    case 'playCard':
      return applyPlayCard(state, d, task, id);
    case 'chooseOne':
      return applyChooseOne(state, d, task, id);
    case 'copyAction':
      return applyCopyAction(state, d, task, id);
    case 'spiritPlace':
      return applySpiritPlace(state, d, task, id);
    case 'heroStart':
      return applyHeroStart(state, d, task, id);
    case 'importCount':
      return applyImportCount(state, d, task, id);
    case 'exportCount':
      return applyExportCount(state, d, task, id);
    case 'drillRaise':
      return applyDrillRaise(state, d, task, id);
    case 'actionChoice':
      return applyActionChoice(state, d, task, id);
    case 'expeditionPick':
      return applyExpedition(state, d, task, id);
    case 'welfareConvert':
      return applyWelfareConvert(state, d, task, id);
    case 'migrationCount':
      return applyMigrationCount(state, d, task, id);
    case 'discard':
      return applyDiscard(state, d, task, id);
    case 'spreadPlay':
      return applySpread(state, d, task, id);
    case 'chooseSpecialCitizen':
      return applySpecialCitizen(state, d, task, id);
    case 'chooseOrder':
      state.stack.pop();
      return takeChoice(state, task.player, task.items, Number(id.slice('order:'.length)));
    case 'passTile':
      state.stack.pop();
      playerOf(state, task.player).bonusTile = Number(id.slice('bonus:'.length));
      return;
    case 'raidDeclare':
      return applyRaid(state, d, task, id);
    case 'tokenSwap':
      return applyTokenSwap(state, task, id);
    default:
      throw new Error(`選択を受け付けないタスクである：${task.t}`);
  }
};

const runAuto = (state: GameState, d: GameData, task: Task): void => {
  // 自動の処理ごとに増減を記録する（ui_design.md 4-3 のラウンド開始の画面などに使う）。
  const before = snapshot(state);
  runAutoTask(state, d, task);
  recordDeltas(state, before, task.t);
};

const runAutoTask = (state: GameState, d: GameData, task: Task): void => {
  state.stack.pop();
  switch (task.t) {
    case 'setupFinish':
      return setupFinish(state, d);
    case 'roundStart':
      return roundStart(state, d);
    case 'bonusTileStart':
      return bonusTileStart(state, d, task);
    case 'income':
      return income(state);
    case 'nextTurn':
      return nextTurn(state, task);
    case 'turnStart':
      return turnStart(state, d, task);
    case 'roundEnd':
      return roundEnd(state, d);
    case 'gameEnd':
      return gameEnd(state, d);
    case 'actionEnd':
      // アクションの処理をすべて終えた（発明王・注文住宅・開拓小屋）。
      emit(state, d, { type: 'actionFinished', player: task.player, action: task.action, tier: task.tier, built: [...task.built] });
      return;
    case 'later':
      runCommands(state, d, playerOf(state, task.player), task.commands, task.source, task.axis);
      return;
    default:
      throw new Error(`自動タスクではない：${task.t}`);
  }
};

/** 実行できなくなった選択タスクの不発（16-2-2、16-2-5、16-2-6、4-4-5、19-4-3）。 */
const fizzle = (state: GameState, d: GameData, task: Task): void => {
  if (task.t === 'placeTiles') {
    finishPlaceTiles(state, d, task);
    return;
  }
  state.stack.pop();
  if ('player' in task) {
    emit(state, d, { type: 'fizzle', player: task.player, what: task.t });
  }
};

/** 自動タスクを処理し、次の選択待ちまで進める。 */
const advance = (state: GameState, d: GameData): void => {
  for (let guard = 0; guard < 100000; guard += 1) {
    const task = topOf(state);
    if (task === undefined) {
      return;
    }
    if (AUTO_TASKS.has(task.t)) {
      runAuto(state, d, task);
      continue;
    }
    if (task.t === 'turn') {
      task.started = true;
      recordUnlocks(d, state);
    }
    if (optionsFor(state, d, task).length === 0) {
      fizzle(state, d, task);
      continue;
    }
    return;
  }
  throw new Error('進行が止まらない');
};

// ---------------------------------------------------------------------------
// 公開する関数
// ---------------------------------------------------------------------------

/** 現在の選択待ちの持ち主。選択待ちがなければ null。 */
export const decider = (state: GameState): number | null => {
  const task = topOf(state);
  return task !== undefined && 'player' in task ? task.player : null;
};

export const getOptions = (state: GameState, d: GameData = GAME_DATA): Option[] => {
  const task = topOf(state);
  if (task === undefined || state.phase === 'over') {
    return [];
  }
  return optionsFor(state, d, task);
};

/** 傭兵団の「金に替える数」は支払いの直後に尋ねる。支払いの後に積まれたタスクより先に置く（core.ts の payMilitaryTokens）。 */
const hoistTokenSwaps = (state: GameState): void => {
  const swaps = state.stack.filter((t) => t.t === 'tokenSwap');
  if (swaps.length === 0) return;
  state.stack = [...state.stack.filter((t) => t.t !== 'tokenSwap'), ...swaps];
};

/** 選択を適用した新しい状態を返す。元の状態は変更しない。 */
export const applyMove = (state: GameState, optionId: string, d: GameData = GAME_DATA): GameState => {
  const options = getOptions(state, d);
  if (!options.some((o) => o.id === optionId)) {
    throw new Error(`選べない選択肢である：${optionId}`);
  }
  const next = structuredClone(state);
  const task = topOf(next);
  if (task === undefined) {
    throw new Error('選択待ちがない');
  }
  const before = snapshot(next);
  applyTask(next, d, task, optionId);
  hoistTokenSwaps(next);
  // 選択1つの処理の増減（ui_design.md 4-1 の「−5 金 ＋2 資材」）。自動の処理は runAuto が別に記録する。
  recordDeltas(next, before, 'move');
  advance(next, d);
  next.log.push({ move: optionId, checkpoint: isCheckpoint(state, optionId, next) });
  return next;
};

export const isGameOver = (state: GameState): boolean => state.phase === 'over';
