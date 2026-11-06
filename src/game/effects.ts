// 効果スクリプトの実行（docs/effect-commands.md）。
// 命令のうち資源・トラックを変えるだけのものは即時に処理し、選択を伴うものはタスクにする。
// 常時効果は出来事への反応として、registerReactor で登録した関数が1単位ごとに処理する（16-1-4）。

import { CELL_IDS, neighborsOf } from './board.ts';
import { abilitiesOf, type OwnedAbility } from './abilities.ts';
import {
  addScore,
  buildOnCard,
  buildingCount,
  currentTurnPlayer,
  drawCivCards,
  emit,
  freeLandCells,
  gainRegularWorkers,
  landCount,
  playerOf,
  processEffects,
  registerReactor,
  scheduleChoices,
  type Effect,
} from './core.ts';
import { BUILDINGS, TERRAINS, type GameData, type ScoreAxis } from '../data/types.ts';
import type { Amount, Command, Condition, EventFilter, Metric } from '../data/script.ts';
import type { ChoiceEffect, GameEvent, GameState, PlayerState } from './types.ts';

// ---------------------------------------------------------------------------
// 指標
// ---------------------------------------------------------------------------

/** 精霊チップのある土地に隣接する同種の土地タイルの数。1枚は1回だけ数える（ユーザー決定 2026-11-03）。 */
export const spiritAdjacency = (player: PlayerState): number => {
  const counted = new Set<string>();
  for (const cell of Object.values(player.spiritChips)) {
    if (cell === undefined) continue;
    const tile = player.land[cell];
    for (const n of neighborsOf(cell)) {
      if (tile !== undefined && player.land[n] === tile) counted.add(n);
    }
  }
  return counted.size;
};

export const metricValue = (state: GameState, d: GameData, player: PlayerState, metric: Metric): number => {
  const [name, arg] = metric.split(':');
  switch (name) {
    case 'regularWorkers':
      return player.regularWorkers;
    case 'tempWorkers':
      return player.tempWorkers;
    case 'landTiles':
      return landCount(player);
    case 'freeLandTiles':
      return freeLandCells(player).length;
    case 'buildings':
      return buildingCount(player);
    case 'houses':
      return buildingCount(player, 'house');
    case 'maxedBuildingTypes':
      return BUILDINGS.filter((b) => buildingCount(player, b) >= d.params.buildings.limits[b]).length;
    case 'militaryLevel':
      return player.militaryLevel;
    case 'infraLevel':
      return player.infraLevel;
    case 'militaryTokens':
      return player.militaryTokens;
    case 'goldProduction':
      return player.goldProduction;
    case 'materialProduction':
      return player.materialProduction;
    case 'repelLine':
      return state.repelLine;
    case 'defenseLine':
      return state.defenseLine;
    case 'repelShortfall':
      // 026：そのラウンドの撃退ライン − 軍事レベル、0未満は0（指示書 2-1 の仮置き）。
      return Math.max(0, state.repelLine - player.militaryLevel);
    case 'playedCivCards':
      return player.played.length;
    case 'spiritAdjacency':
      return spiritAdjacency(player);
    case 'buildingTypes':
      // 建設済みの建物の種類の数（文明カード「建設済みの建物1種類につき」）。
      return BUILDINGS.filter((b) => buildingCount(player, b) > 0).length;
    case 'freeLandTerrains':
      // 建物のない土地タイルの種類の数（文明カード「建物がない土地タイル1種類につき」）。
      return new Set(freeLandCells(player).map((c) => player.land[c])).size;
    case 'buildingsOfType':
      return buildingCount(player, BUILDINGS.find((b) => b === arg));
    case 'tagsOf':
      // プレイ済みの文明カードのうち、その分類のタグを持つ枚数。プレイ中の自身を含む（ユーザー決定 2026-11-06）。
      return player.played.filter((id) => d.civilizationCards.find((c) => c.id === id)?.tags.some((t) => t === arg) ?? false).length;
    case 'buildingsOnTerrain':
      return CELL_IDS.filter((c) => player.buildings[c] !== undefined && player.land[c] === TERRAINS.find((t) => t === arg)).length;
    default:
      throw new Error(`未知の指標である：${metric}`);
  }
};

export const amountValue = (state: GameState, d: GameData, player: PlayerState, amount: Amount): number =>
  typeof amount === 'number'
    ? amount
    : Math.floor(metricValue(state, d, player, amount.count) / amount.per) * amount.times;

export const conditionHolds = (state: GameState, d: GameData, player: PlayerState, cond: Condition): boolean => {
  const left = metricValue(state, d, player, cond.left);
  const right = typeof cond.right === 'number' ? cond.right : metricValue(state, d, player, cond.right);
  return cond.op === '>=' ? left >= right : left < right;
};

// ---------------------------------------------------------------------------
// 命令の実行
// ---------------------------------------------------------------------------

/** 選択を伴う命令か。 */
export const isChoiceCommand = (command: Command): boolean =>
  ['placeTiles', 'build', 'playCard', 'expeditionRewards', 'chooseOne', 'copyAction', 'spiritPlace', 'heroStart', 'discardRaise'].includes(
    command.op,
  ) ||
  (command.op === 'gain' && command.res === 'specialCitizen');

const runCommand = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  command: Command,
  source: string,
  axis: ScoreAxis,
  choices: ChoiceEffect[],
): void => {
  switch (command.op) {
    case 'gain': {
      const amount = amountValue(state, d, player, command.amount);
      if (amount <= 0) {
        return;
      }
      switch (command.res) {
        case 'specialCitizen':
          for (let i = 0; i < amount; i += 1) choices.push({ k: 'command', command, source });
          return;
        case 'regularWorkers':
          gainRegularWorkers(state, d, player, amount);
          return;
        case 'goldProduction':
        case 'materialProduction':
          processEffects(state, d, player, [{ k: command.res, n: amount }], choices);
          return;
        case 'drawCivCards':
          drawCivCards(state, d, player, amount);
          return;
        case 'points':
          addScore(state, d, player, amount, command.axis ?? axis, source);
          return;
        default:
          processEffects(state, d, player, [{ k: 'grant', grant: { kind: command.res, amount }, source }], choices);
          return;
      }
    }
    case 'raise': {
      const n = amountValue(state, d, player, command.amount);
      if (n <= 0) {
        return;
      }
      const effect: Effect =
        command.track === 'military' ? { k: 'military', n, overflowPoints: false, source } : { k: 'infra', n };
      processEffects(state, d, player, [effect], choices);
      return;
    }
    case 'if':
      // 各効果の適用条件は個別に判定する（9-2-7）。
      if (conditionHolds(state, d, player, command.cond)) {
        for (const inner of command.then) runCommand(state, d, player, inner, source, axis, choices);
      }
      return;
    case 'later':
      // 選択を伴う命令（この後に積む）より下に置き、それらをすべて処理した後に処理する（繁栄）。
      state.stack.push({ t: 'later', player: player.index, commands: command.do, source, axis });
      return;
    case 'buildOnCard':
      buildOnCard(state, d, player, command.building, command.count);
      return;
    case 'drawPlannedCity': {
      // デザイナー専用の計画都市カードを共通の山札から引き、公開する（19-5-3）。
      const drawn = state.plannedCityDeck.splice(0, command.count);
      player.privatePlannedCities.push(...drawn);
      if (drawn.length > 0) state.revealCount += 1;
      return;
    }
    default:
      choices.push({ k: 'command', command, source });
  }
};

/**
 * 命令の列を処理する。即時の命令は順に処理し、選択を伴う命令はまとめて積む。
 * 2つ以上あれば処理順を尋ねる（16-1-1、decisions.md 3-4）。
 */
export const runCommands = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  commands: readonly Command[],
  source: string,
  axis: ScoreAxis = 'other',
  /** 指定すると、選択を伴う命令を積まずにここへ集める。 */
  collect?: ChoiceEffect[],
): void => {
  const choices: ChoiceEffect[] = collect ?? [];
  for (const command of commands) runCommand(state, d, player, command, source, axis, choices);
  if (collect === undefined) {
    scheduleChoices(state, player.index, choices);
  }
};

/** 能力の種類で絞って、出どころごとに命令を実行する。 */
export const runAbilities = (
  state: GameState,
  d: GameData,
  player: PlayerState,
  kind: 'setup' | 'firstTurnStart' | 'gameEnd',
): void => {
  for (const owned of abilitiesOf(d, player)) {
    if (owned.ability.ability === kind) {
      runCommands(state, d, player, owned.ability.do, owned.source);
    }
  }
};

/** 特別な市民カードを獲得したときの処理（9-3-3）。手番中の獲得は、その手番中はフリーアクションと専用スペースを使えない。 */
export const onSpecialCitizenAcquired = (state: GameState, d: GameData, player: PlayerState, card: string): void => {
  if (currentTurnPlayer(state) === player.index) {
    player.lockedSources.push(`sc:${card}`);
  }
  const script = d.specialCitizens.find((c) => c.id === card)?.script ?? [];
  for (const ability of script) {
    if (ability.ability === 'onAcquire') runCommands(state, d, player, ability.do, `sc:${card}`);
  }
};

// ---------------------------------------------------------------------------
// 常時効果（出来事への反応）
// ---------------------------------------------------------------------------

const eventMatches = (d: GameData, owned: OwnedAbility, filter: EventFilter, event: GameEvent): boolean => {
  switch (event.type) {
    case 'tilePlaced':
      return filter.terrain === undefined || filter.terrain === event.terrain;
    case 'cardPlayed': {
      if (filter.excludeSelf === true && owned.source === `civ:${event.card}`) return false;
      if (filter.tag === undefined && filter.tags === undefined) return true;
      const card = d.civilizationCards.find((c) => c.id === event.card);
      const wanted = [...(filter.tag !== undefined ? [filter.tag] : []), ...(filter.tags ?? [])];
      return card?.tags.some((t) => wanted.includes(t)) ?? false;
    }
    case 'action':
      return (filter.tier === undefined || filter.tier === event.tier) && (filter.action === undefined || filter.action === event.action);
    case 'built':
      return (
        (filter.building === undefined || filter.building === event.building) &&
        (filter.exceptBuilding === undefined || filter.exceptBuilding !== event.building)
      );
    case 'actionFinished': {
      if (filter.action !== undefined && filter.action !== event.action) return false;
      if (filter.tier !== undefined && filter.tier !== event.tier) return false;
      const want = filter.builtDuring;
      if (want === undefined) return true;
      const n = event.built.filter((b) => b === want.building).length;
      if (want.only === true && n !== event.built.length) return false;
      return n >= want.min && (want.max === undefined || n <= want.max);
    }
    case 'trackRaised':
      return filter.track === undefined || filter.track === event.track;
    case 'workerGained':
      return filter.kind === undefined || filter.kind === event.kind;
    case 'raid':
      return filter.result === undefined || filter.result === event.result;
    default:
      return false;
  }
};

const EVENT_TYPES: Record<string, GameEvent['type']> = {
  tilePlaced: 'tilePlaced',
  cardPlayed: 'cardPlayed',
  actionExecuted: 'action',
  built: 'built',
  workerGained: 'workerGained',
  raid: 'raid',
  actionFinished: 'actionFinished',
  trackRaised: 'trackRaised',
};

const react = (state: GameState, d: GameData, event: GameEvent): void => {
  if (!('player' in event) || state.phase === 'draft') {
    return;
  }
  // 出来事の持ち主の能力に加え、「いずれかのプレイヤーが」（anyPlayer）の能力は他のプレイヤーのものも反応する。手番順に処理する。
  reactFor(state, d, event, playerOf(state, event.player), false);
  for (const index of state.turnOrder) {
    if (index !== event.player) reactFor(state, d, event, playerOf(state, index), true);
  }
};

const reactFor = (state: GameState, d: GameData, event: GameEvent, player: PlayerState, othersOnly: boolean): void => {
  for (const owned of abilitiesOf(d, player)) {
    const ability = owned.ability;
    if (ability.ability !== 'on' || EVENT_TYPES[ability.event] !== event.type) continue;
    if (othersOnly && ability.filter.anyPlayer !== true) continue;
    if (!eventMatches(d, owned, ability.filter, event)) continue;
    if (ability.filter.cond !== undefined && !conditionHolds(state, d, player, ability.filter.cond)) continue;
    if (ability.once === true) {
      if (player.onceFired.includes(owned.key)) continue;
      player.onceFired.push(owned.key);
    }
    if (ability.every !== undefined) {
      const count = (player.abilityCounters[owned.key] ?? 0) + 1;
      player.abilityCounters[owned.key] = count;
      if (count % ability.every !== 0) continue;
    }
    emit(state, d, { type: 'ability', player: player.index, key: owned.key });
    runCommands(state, d, player, ability.do, owned.source);
  }
};

registerReactor(react);
