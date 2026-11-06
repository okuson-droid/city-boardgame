// 画面のための派生値（指示書 3-4、ui_design.md 0-2）。画面はルールを計算せず、ここから値を得る。

import { GAME_DATA } from '../data/index.ts';
import { ICON_KEYS } from '../data/icon-keys.ts';
import type { Action, GameData, Tier, UnlockCondition } from '../data/types.ts';
import { buildTotalCost, civCardCost, expeditionTable } from './actions.ts';
import { buildingCount, landCount, playerOf, regularWorkerCap, usableRegular, usableTemp } from './core.ts';
import { decider, isTopUnlocked } from './engine.ts';
import type { IconToken } from './icons.ts';
import type { GameState, PlayerState, Task } from './types.ts';

export { civCardCost, expeditionTable, isTopUnlocked };

const tok = (section: keyof typeof ICON_KEYS, key: string, value?: number | string): IconToken => {
  const table = ICON_KEYS[section] as Readonly<Record<string, { icon: string; label: string }>>;
  const entry = table[key] ?? { icon: `${section}.${key}`, label: key };
  return value === undefined ? { icon: entry.icon, label: entry.label } : { icon: entry.icon, value, label: entry.label };
};

const THEN: IconToken = { icon: 'sym.then', label: '→' };

const topTask = (state: GameState): Task | undefined => state.stack[state.stack.length - 1];

// ---------------------------------------------------------------------------
// 場面の見出し（ui_design.md 3-1、7-2 U1）
// ---------------------------------------------------------------------------

const SCENES: Partial<Record<Task['t'], { icon: string; heading: string }>> = {
  draftPick: { icon: 'scene.draft', heading: 'ドラフトで選ぶ' },
  turn: { icon: 'scene.turn', heading: '行動を選ぶ' },
  payWorkers: { icon: 'scene.workers', heading: 'ワーカーの内訳' },
  pioneerCount: { icon: 'scene.count', heading: '置く枚数を選ぶ' },
  placeTiles: { icon: 'scene.tile', heading: '置くマスを選ぶ' },
  build: { icon: 'scene.build', heading: '建てるマスを選ぶ' },
  importCount: { icon: 'scene.count', heading: '交換回数を選ぶ' },
  exportCount: { icon: 'scene.count', heading: '交換回数を選ぶ' },
  drillRaise: { icon: 'scene.count', heading: '上昇回数を選ぶ' },
  expeditionPick: { icon: 'scene.reward', heading: '報酬を選ぶ' },
  welfareConvert: { icon: 'scene.convert', heading: '変換を選ぶ' },
  migrationCount: { icon: 'scene.count', heading: '獲得人数を選ぶ' },
  discard: { icon: 'scene.discard', heading: '捨てるカードを選ぶ' },
  spreadPlay: { icon: 'scene.play', heading: 'プレイするカード' },
  playCard: { icon: 'scene.play', heading: 'プレイするカード' },
  chooseSpecialCitizen: { icon: 'scene.citizen', heading: '市民カードを選ぶ' },
  chooseOrder: { icon: 'scene.order', heading: '処理順を選ぶ' },
  chooseOne: { icon: 'scene.choose', heading: '効果を1つ選ぶ' },
  copyAction: { icon: 'scene.copy', heading: '写す効果を選ぶ' },
  spiritPlace: { icon: 'scene.tile', heading: '精霊チップを置く' },
  heroStart: { icon: 'scene.tile', heading: '初期の山岳を選ぶ' },
  passTile: { icon: 'scene.bonus', heading: '次のタイルを選ぶ' },
  raidDeclare: { icon: 'scene.raid', heading: '襲撃の目標を宣言' },
  tokenSwap: { icon: 'scene.count', heading: '金に替えるトークンの数を選ぶ' },
};

/** いま何を選ぶ場面か。見出しは選択肢の種類（タスク）から組み立てる。 */
export const sceneOf = (state: GameState): { icon: string; heading: string; player: number | null } => {
  const task = topTask(state);
  const scene = (task && SCENES[task.t]) ?? { icon: 'scene.wait', heading: state.phase === 'over' ? 'ゲーム終了' : '処理中' };
  return { ...scene, player: decider(state) };
};

// ---------------------------------------------------------------------------
// アクションボード
// ---------------------------------------------------------------------------

/** アクションスペースの効果のアイコン列（params.json から組み立てる）。 */
export const actionSpaceIcons = (action: Action, tier: Tier, d: GameData = GAME_DATA): IconToken[] => {
  const a = d.params.actions;
  switch (action) {
    case 'pioneer':
      return [tok('commands', 'placeTiles', a.pioneer[tier].maxTiles), ...(a.pioneer[tier].materialDiscount > 0 ? [tok('resources', 'materials', -a.pioneer[tier].materialDiscount)] : [])];
    case 'build':
      return [
        tok('commands', 'build', a.build[tier].maxBuildings),
        ...(a.build[tier].goldDiscount > 0 ? [tok('resources', 'gold', -a.build[tier].goldDiscount)] : []),
        ...(a.build[tier].materialDiscount > 0 ? [tok('resources', 'materials', -a.build[tier].materialDiscount)] : []),
      ];
    // 支払いは矢の左、獲得は右（docs/styleguide-icons.md 4-3-1）。回数の上限は ≤。
    case 'import':
      return [tok('resources', 'gold', a.import[tier].payGold), THEN, tok('resources', 'materials', a.import[tier].gainMaterials), tok('symbols', 'upTo', `×${a.import[tier].maxTimes}`)];
    case 'export':
      return [tok('resources', 'materials', a.export[tier].payMaterials), THEN, tok('resources', 'gold', a.export[tier].gainGold), tok('symbols', 'upTo', `×${a.export[tier].maxTimes}`)];
    case 'drill':
      return [tok('resources', 'gold', a.drill[tier].payGold), THEN, tok('resources', 'militaryTokens', a.drill[tier].gainTokens), tok('tracks', 'military', `≤${a.drill[tier].maxRaises}`)];
    case 'expedition': {
      const selection = a.expedition.selection[tier];
      return [tok('commands', 'expeditionRewards', selection.mode === 'distinct' ? selection.max : selection.total)];
    }
    case 'welfare':
      return [tok('resources', 'materials', a.welfare[tier].payMaterials), THEN, tok('tracks', 'infra', `+${a.welfare[tier].infra}`), ...(a.welfare[tier].tempWorkers > 0 ? [tok('resources', 'tempWorkers', a.welfare[tier].tempWorkers)] : [])];
    case 'migration':
      return [...(a.migration[tier].tempWorkers > 0 ? [tok('resources', 'tempWorkers', a.migration[tier].tempWorkers)] : []), tok('resources', 'regularWorkers', a.migration[tier].regularWorkers)];
    case 'research':
      return [tok('resources', 'drawCivCards', a.research[tier].draw), tok('symbols', 'discard', a.research[tier].discard)];
    case 'spread':
      return [tok('commands', 'playCard', a.spread[tier].maxCards), ...(a.spread[tier].goldPerCard > 0 ? [tok('resources', 'gold', a.spread[tier].goldPerCard)] : [])];
  }
};

/** アクションスペースの効果文（補足表示用、params.json から組み立てる）。 */
export const describeActionSpace = (action: Action, tier: Tier, d: GameData = GAME_DATA): string => {
  const a = d.params.actions;
  const upTo = (isMax: boolean): string => (isMax ? '最大' : '');
  switch (action) {
    case 'pioneer': {
      const s = a.pioneer[tier];
      return `土地タイルを最大${s.maxTiles}枚置く。${s.materialDiscount > 0 ? `資材のコストを${s.materialDiscount}軽減する。` : ''}`;
    }
    case 'build': {
      const s = a.build[tier];
      const discounts = [s.goldDiscount > 0 ? `金${s.goldDiscount}` : '', s.materialDiscount > 0 ? `資材${s.materialDiscount}` : ''].filter((t) => t !== '');
      return `建物を最大${s.maxBuildings}軒建てる。${discounts.length > 0 ? `コストを${discounts.join('・')}軽減する。` : ''}`;
    }
    case 'import': {
      const s = a.import[tier];
      return `金${s.payGold}を払って資材${s.gainMaterials}を得る交換を、最大${s.maxTimes}回行う。${s.bonusMaterials > 0 ? `交換すると資材${s.bonusMaterials}を追加で得る。` : ''}`;
    }
    case 'export': {
      const s = a.export[tier];
      return `資材${s.payMaterials}を払って金${s.gainGold}を得る交換を、最大${s.maxTimes}回行う。${s.bonusGold > 0 ? `交換すると金${s.bonusGold}を追加で得る。` : ''}`;
    }
    case 'drill': {
      const s = a.drill[tier];
      return `金${s.payGold}を払って軍事力トークン${s.gainTokens}を得る。続けて軍事力トークンを払い、軍事レベルを最大${s.maxRaises}上げる。`;
    }
    case 'expedition': {
      const s = a.expedition.selection[tier];
      return s.mode === 'distinct'
        ? `軍事力トークンを払い、軍事レベル以下の遠征の報酬から、異なるものを最大${s.max}つ得る。`
        : `軍事力トークンを払い、軍事レベル以下の遠征の報酬を合計${s.total}個まで得る（同じ報酬は${s.maxSame}個まで）。`;
    }
    case 'welfare': {
      const s = a.welfare[tier];
      return `資材${s.payMaterials}を払ってインフラレベルを${s.infra}上げる。${s.tempWorkers > 0 ? `臨時ワーカー${s.tempWorkers}人を得る。` : ''}`;
    }
    case 'migration': {
      const s = a.migration[tier];
      return `${s.tempWorkers > 0 ? `臨時ワーカー${s.tempWorkers}人と、` : ''}通常ワーカーを${upTo(s.regularWorkersIsMax)}${s.regularWorkers}人得る。`;
    }
    case 'research': {
      const s = a.research[tier];
      return `文明カードを${s.draw}枚引き、手札から${s.discard}枚捨てる。`;
    }
    case 'spread': {
      const s = a.spread[tier];
      return `文明カードを${upTo(s.cardsIsMax)}${s.maxCards}枚プレイする。${s.goldPerCard > 0 ? `1枚プレイするごとに金${s.goldPerCard}を得る。` : ''}`;
    }
  }
};

/** 最上位アクションの解放条件のアイコン（6-3 の各最上位解放条件）。 */
export const unlockIcons = (condition: UnlockCondition): IconToken[] => {
  switch (condition.metric) {
    case 'buildingsOfType':
      return [tok('buildings', condition.building, condition.atLeast)];
    case 'totalBuildings':
      return [tok('metrics', 'buildings', condition.atLeast)];
    case 'landTiles':
      return [tok('metrics', 'landTiles', condition.atLeast)];
    case 'militaryLevel':
      return [tok('tracks', 'military', condition.atLeast)];
    case 'civCardsPlayed':
      return [tok('metrics', 'playedCivCards', condition.atLeast)];
  }
};

export const isSharedSpace = (action: Action, tier: Tier, d: GameData = GAME_DATA): boolean =>
  d.params.actions.shared.some((s) => s.action === action && s.tier === tier);

/** スペースを使ったプレイヤー（ワーカー駒の表示用）。占有型は1人、共有スペースは使った人全員。 */
export const spaceUsers = (state: GameState, action: Action, tier: Tier): number[] => {
  let roundStart = 0;
  state.events.forEach((e, i) => {
    if (e.type === 'round') roundStart = i;
  });
  // 特別市民11 で写した効果はスペースを使わない（19-2-11）。
  return state.events
    .slice(roundStart)
    .flatMap((e) => (e.type === 'action' && !e.copied && e.action === action && e.tier === tier ? [e.player] : []));
};

// ---------------------------------------------------------------------------
// プレイヤーの状態
// ---------------------------------------------------------------------------

export type WorkerSummary = {
  readonly regularUsable: number;
  readonly regularPlaced: number;
  readonly regularNextRound: number;
  readonly regularCap: number;
  readonly tempUsable: number;
  readonly tempLocked: number;
  readonly tempMax: number;
};

export const workerSummary = (player: PlayerState, d: GameData = GAME_DATA): WorkerSummary => ({
  regularUsable: usableRegular(player),
  regularPlaced: player.regularPlaced,
  regularNextRound: player.regularNewThisRound,
  regularCap: regularWorkerCap(d, player),
  tempUsable: usableTemp(player),
  tempLocked: player.tempLocked,
  tempMax: d.params.workers.tempMax,
});

export { buildingCount, landCount, playerOf };

/** 選択中の建設のコスト見込み（割引・軽減を含む、ui_design.md 2-3-1）。建設の選択中でなければ null。 */
export const pendingBuildCost = (state: GameState, d: GameData = GAME_DATA): { gold: number; materials: number } | null => {
  const task = topTask(state);
  if (task?.t !== 'build') return null;
  return buildTotalCost(d, playerOf(state, task.player), task.picks, task.spec);
};

/** 選択中の値（複数選ぶ場面の選んだ順）。 */
export const pendingPicks = (state: GameState): string[] => {
  const task = topTask(state);
  switch (task?.t) {
    case 'build':
      return task.picks.map((p) => p.cell);
    case 'placeTiles':
      return task.placed;
    case 'expeditionPick':
      return task.picks.map(String);
    default:
      return [];
  }
};

export const remainingInTask = (state: GameState): number | null => {
  const task = topTask(state);
  if (task?.t === 'placeTiles') return task.remaining;
  if (task?.t === 'discard') return task.remaining;
  if (task?.t === 'playCard') return task.remaining;
  if (task?.t === 'build') return task.spec.max - task.picks.length;
  return null;
};

/** 襲撃の宣言に必要な軍事力トークン（7-4-4）。 */
export const raidNeed = (state: GameState, player: PlayerState): { defense: number; repel: number } => ({
  defense: Math.max(0, state.defenseLine - player.militaryLevel),
  repel: Math.max(0, state.repelLine - player.militaryLevel),
});
