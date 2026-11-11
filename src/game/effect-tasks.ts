// 効果スクリプトに由来する選択タスクと、手番中に使う能力（フリーアクション・専用スペース・計画都市の宣言）。

import { CELL_IDS, type CellId } from './board.ts';
import { abilitiesOf, type OwnedAbility } from './abilities.ts';
import { canBuild, canExecute, civCardCost, freeBuildAt, playCivCard, startAction } from './actions.ts';
import {
  addScore,
  boardOf,
  emit,
  placeableCells,
  playerOf,
  processEffects,
  putLandTile,
  removeTask,
  squareBonusEffects,
  terrainOf,
} from './core.ts';
import { conditionHolds, runCommands } from './effects.ts';
import { declarablePlannedCities } from './planned.ts';
import { ACTIONS, TERRAINS, TIERS, type Action, type GameData, type Terrain, type Tier } from '../data/types.ts';
import type { Command } from '../data/script.ts';
import type { GameState, Option, PlayerState, Task } from './types.ts';

type TaskOf<T extends Task['t']> = Extract<Task, { t: T }>;

const opt = (player: number, id: string, label: string): Option => ({ id, player, label });

// ---------------------------------------------------------------------------
// 命令の実行可能性（専用スペースは何も実行しない選び方ができない、6-1-6）
// ---------------------------------------------------------------------------

const spiritOptions = (d: GameData, player: PlayerState): { terrain: Terrain; cell: CellId }[] => {
  const result: { terrain: Terrain; cell: CellId }[] = [];
  for (const terrain of TERRAINS) {
    if (player.spiritChips[terrain] !== undefined) continue;
    for (const cell of placeableCells(player)) {
      // 精霊チップと同じ種類の土地タイルを、同じ地形のマスに置く（19-5-7）。
      if (terrainOf(d, player, cell) === terrain) result.push({ terrain, cell });
    }
  }
  return result;
};

const commandFeasible = (state: GameState, d: GameData, player: PlayerState, command: Command): boolean => {
  switch (command.op) {
    case 'build':
      return canBuild(d, player, {
        min: command.upTo ? 0 : command.max,
        max: command.max,
        tier: null,
        buildings: command.buildings,
        terrain: command.terrain,
        payGold: command.payGold,
        payMaterials: command.payMaterials,
      });
    case 'playCard':
      return player.hand.length > 0;
    case 'placeTiles':
      return placeableCells(player).length > 0;
    case 'copyAction':
      return copyCandidates(d, player).length > 0;
    case 'spiritPlace':
      return spiritOptions(d, player).length > 0;
    default:
      return true;
  }
};

const commandsFeasible = (state: GameState, d: GameData, player: PlayerState, commands: readonly Command[]): boolean =>
  commands.some((c) => commandFeasible(state, d, player, c));

// ---------------------------------------------------------------------------
// 手番中の能力
// ---------------------------------------------------------------------------

const ownedByKey = (d: GameData, player: PlayerState, key: string): OwnedAbility => {
  const owned = abilitiesOf(d, player).find((a) => a.key === key);
  if (owned === undefined) throw new Error(`持っていない能力である：${key}`);
  return owned;
};

const freeAbilityUsable = (state: GameState, d: GameData, player: PlayerState, owned: OwnedAbility): boolean => {
  const a = owned.ability;
  if (a.ability !== 'freeAction' || player.lockedSources.includes(owned.source)) return false;
  if (a.oncePerRound && player.usedThisRound.includes(owned.key)) return false;
  if (a.pay !== null && player[a.pay.res] < a.pay.amount) return false;
  if (a.require !== null && !conditionHolds(state, d, player, a.require)) return false;
  return commandsFeasible(state, d, player, a.do);
};

/** 能力によるフリーアクション（特別市民15〜18、豪商、官僚、精霊使い）。 */
export const abilityFreeOptions = (state: GameState, d: GameData, player: PlayerState): Option[] =>
  abilitiesOf(d, player)
    .filter((owned) => freeAbilityUsable(state, d, player, owned))
    .map((owned) => opt(player.index, `ability:${owned.key}`, `フリーアクション ${owned.key}`));

export const applyAbilityFree = (state: GameState, d: GameData, player: PlayerState, key: string): void => {
  const owned = ownedByKey(d, player, key);
  const a = owned.ability;
  if (a.ability !== 'freeAction') throw new Error(`フリーアクションではない：${key}`);
  if (a.pay !== null) player[a.pay.res] -= a.pay.amount;
  if (a.oncePerRound) player.usedThisRound.push(key);
  emit(state, d, { type: 'ability', player: player.index, key });
  runCommands(state, d, player, a.do, owned.source);
};

/** 特別な市民カードの専用スペース（6-2-4、6-2-5）。持ち主専用の占有型で、1ラウンドに1回。 */
export const spaceOptions = (state: GameState, d: GameData, player: PlayerState, usableWorkers: number): Option[] =>
  abilitiesOf(d, player)
    .filter((owned) => {
      const a = owned.ability;
      return (
        a.ability === 'actionSpace' &&
        !player.lockedSources.includes(owned.source) &&
        !state.occupied.includes(owned.key) &&
        usableWorkers >= a.workers &&
        commandsFeasible(state, d, player, a.do)
      );
    })
    .map((owned) => opt(player.index, `space:${owned.key}`, `専用スペース ${owned.source}`));

export const spaceWorkerCost = (d: GameData, player: PlayerState, key: string): number => {
  const a = ownedByKey(d, player, key).ability;
  return a.ability === 'actionSpace' ? a.workers : 0;
};

export const startSpace = (state: GameState, d: GameData, player: PlayerState, key: string): void => {
  const owned = ownedByKey(d, player, key);
  const a = owned.ability;
  if (a.ability !== 'actionSpace') throw new Error(`専用スペースではない：${key}`);
  state.occupied.push(key);
  emit(state, d, { type: 'ability', player: player.index, key });
  runCommands(state, d, player, a.do, owned.source);
};

// ---------------------------------------------------------------------------
// 計画都市の達成宣言（第13章、19-4-7、19-5-3）
// ---------------------------------------------------------------------------

export const planOptions = (state: GameState, d: GameData, player: PlayerState): Option[] =>
  declarablePlannedCities(state, d, player).map((id) => opt(player.index, `plan:${id}`, `計画都市 ${id} の達成を宣言する`));

export const applyPlan = (state: GameState, d: GameData, player: PlayerState, id: string): void => {
  const card = d.plannedCityCards.find((c) => c.id === id);
  if (card === undefined) throw new Error(`存在しない計画都市カードである：${id}`);
  const claims = state.plannedCityClaims[id] ?? [];
  const rank = claims.length;
  claims.push(player.index);
  state.plannedCityClaims[id] = claims;
  const table = d.params.scoring.plannedCityPointsByRank;
  // 専用カードは7点（19-5-3）。共有カードは先着順（13-3-4）。
  const points = player.privatePlannedCities.includes(id) ? (table[0] ?? 0) : (table[rank] ?? 0);
  emit(state, d, { type: 'plannedCity', player: player.index, card: id, rank: rank + 1, points });
  // 計画都市の得点は自然・環境に含める（17-5-1）。
  addScore(state, d, player, points, 'nature', `plannedCity:${id}`);
  // 達成宣言時に恩恵を得る（13-3-8）。複数あれば、選択を伴うものが2つ以上のとき処理の順番を尋ねる（decisions.md 3-4）。
  processEffects(
    state,
    d,
    player,
    card.benefits.map((grant) => ({ k: 'grant' as const, grant, source: `plannedCity:${id}` })),
  );
};

// ---------------------------------------------------------------------------
// 効果の選択タスク
// ---------------------------------------------------------------------------

export const playCardOptions = (d: GameData, state: GameState, task: TaskOf<'playCard'>): Option[] => {
  const player = playerOf(state, task.player);
  const options = [...new Set(player.hand)]
    .filter((card) => task.free || civCardCost(d, player, card) <= player.gold)
    .map((card) => opt(task.player, `card:${card}`, `${card} をプレイする`));
  // 「〜枚まで」「プレイしてもよい」は、プレイできるカードがあっても終えられる。
  if (task.upTo === true && options.length > 0) {
    options.push(opt(task.player, 'done', 'プレイを終える'));
  }
  return options;
};

export const applyPlayCard = (state: GameState, d: GameData, task: TaskOf<'playCard'>, id: string): void => {
  const player = playerOf(state, task.player);
  if (id === 'done') {
    removeTask(state, task);
    return;
  }
  task.remaining -= 1;
  if (task.remaining <= 0 || player.hand.length <= 1) removeTask(state, task);
  playCivCard(state, d, player, id.slice('card:'.length), task.free);
};

export const chooseOneOptions = (task: TaskOf<'chooseOne'>): Option[] =>
  task.options.map((commands, i) => opt(task.player, `choose:${i}`, commands.map((c) => c.op).join('・')));

export const applyChooseOne = (state: GameState, d: GameData, task: TaskOf<'chooseOne'>, id: string): void => {
  removeTask(state, task);
  const commands = task.options[Number(id.slice('choose:'.length))] ?? [];
  runCommands(state, d, playerOf(state, task.player), commands, task.source);
};

/** 特別市民11 が写せるのは10アクション×3段階の効果に限る（ユーザー決定 2026-11-03）。占有・解放・ワーカー数は問わない（19-2-11）。 */
const copyCandidates = (d: GameData, player: PlayerState): { action: Action; tier: Tier }[] =>
  ACTIONS.flatMap((action) => TIERS.map((tier) => ({ action, tier }))).filter(({ action, tier }) =>
    canExecute(d, player, action, tier),
  );

export const copyActionOptions = (d: GameData, state: GameState, task: TaskOf<'copyAction'>): Option[] =>
  copyCandidates(d, playerOf(state, task.player)).map(({ action, tier }) =>
    opt(task.player, `copy:${action}:${tier}`, `${action}（${tier}）の効果を使う`),
  );

export const applyCopyAction = (state: GameState, d: GameData, task: TaskOf<'copyAction'>, id: string): void => {
  removeTask(state, task);
  const [, action, tier] = id.split(':');
  startAction(state, d, playerOf(state, task.player), action as Action, tier as Tier, true);
};

export const spiritPlaceOptions = (d: GameData, state: GameState, task: TaskOf<'spiritPlace'>): Option[] =>
  spiritOptions(d, playerOf(state, task.player)).map(({ terrain, cell }) =>
    opt(task.player, `spirit:${terrain}:${cell}`, `${cell} に精霊チップ（${terrain}）`),
  );

export const applySpiritPlace = (state: GameState, d: GameData, task: TaskOf<'spiritPlace'>, id: string): void => {
  removeTask(state, task);
  const [, terrain, cell] = id.split(':') as [string, Terrain, CellId];
  const player = playerOf(state, task.player);
  player.spiritChips[terrain] = cell;
  // 土地タイルは無料で、地形と同じ種類を置く（19-5-7）。マスボーナスは通常どおり得る（4-4-4-2）。
  putLandTile(state, d, player, cell, terrain);
  processEffects(state, d, player, squareBonusEffects(d, player, [cell]));
};

/**
 * 英雄の初期配置：初期配置のタイル（E1・F1）を置かず、代わりに任意の山岳マスへ山岳の土地タイルを置き、砦を無料で建てる。
 * 隣接は要らない（ユーザー決定 2026-11-06。rules.md v0.8 19-5-1 の「E1・F1 のうち1枚の代わり」からの変更）。
 */
export const heroStartOptions = (d: GameData, state: GameState, task: TaskOf<'heroStart'>): Option[] => {
  const player = playerOf(state, task.player);
  const board = boardOf(d, player);
  return CELL_IDS.filter((c) => board.squares[c]?.terrain === 'mountain' && player.land[c] === undefined).map((cell) =>
    opt(task.player, `hero:${cell}`, `${cell} に山岳タイルと砦を置く`),
  );
};

export const applyHeroStart = (state: GameState, d: GameData, task: TaskOf<'heroStart'>, id: string): void => {
  removeTask(state, task);
  const cell = id.slice('hero:'.length) as CellId;
  const player = playerOf(state, task.player);
  putLandTile(state, d, player, cell, 'mountain');
  processEffects(state, d, player, squareBonusEffects(d, player, [cell]));
  // 砦の建設時効果と地形ボーナスは 5-6-7 に従って適用する。
  freeBuildAt(state, d, player, { building: 'fort', cell });
};
