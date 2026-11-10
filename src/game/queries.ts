// 画面のための派生値（指示書 3-4、ui_design.md 0-2）。画面はルールを計算せず、ここから値を得る。

import { GAME_DATA } from '../data/index.ts';
import { ICON_KEYS } from '../data/icon-keys.ts';
import type { Action, Building, GameData, RaidCard, RaidEffect, Terrain, Tier, UnlockCondition } from '../data/types.ts';
import { grantText as grantTextOf } from './labels.ts';
import { buildTotalCost, civCardCost, expeditionTable } from './actions.ts';
import { buildingCount, cardHouseCount, landCount, playerOf, regularWorkerCap, usableRegular, usableTemp } from './core.ts';
import { decider, isTopUnlocked } from './engine.ts';
import type { IconToken } from './icons.ts';
import type { GameState, PlayerState, Task } from './types.ts';

export { civCardCost, expeditionTable, isTopUnlocked };

const RAID_EFFECT_TEXT: Record<RaidEffect['kind'], (n: string) => string> = {
  loseGold: (n) => `金${n}を失う`,
  loseMaterials: (n) => `資材${n}を失う`,
  loseGoldProduction: (n) => `金の生産力を${n}失う`,
  landTiles: (n) => `土地タイル${n}枚を置く`,
  materials: (n) => `資材${n}を得る`,
  gold: (n) => `金${n}を得る`,
  points: (n) => `${n}点を得る`,
};

/**
 * 襲撃の結果ごとに実際に起きること（params.raid から組み立てる）。2026-11-07 のユーザー決定により、
 * 襲撃カードの効果は結果ごとに定めた種類だけを適用するため、原本の文言ではなくこちらを画面に出す。
 */
export const describeRaidOutcomes = (card: RaidCard, d: GameData = GAME_DATA): { defenseFailed: string; defended: string; repelled: string } => {
  const raid = d.params.raid;
  const line = (result: 'defenseFailed' | 'defended' | 'repelled', effects: readonly RaidEffect[]): string => {
    const allowed = raid.cardEffectKinds[result];
    const usesCardPoints = card.replacesBasePoints && allowed.includes('points');
    const per = raid.basePointsPerRound[result];
    const base = usesCardPoints || per === 0 ? [] : [per < 0 ? `ラウンド数×${-per}点を失う` : `ラウンド数×${per}点を得る`];
    const fromCard = effects
      .filter((e) => allowed.includes(e.kind))
      .map((e) => {
        const text = RAID_EFFECT_TEXT[e.kind](e.perRound ? `${e.amount}×ラウンド数` : String(e.amount));
        return e.afterNextIncome ? `次の収入の後に${text}` : text;
      });
    const all = [...base, ...fromCard];
    return all.length === 0 ? 'なし' : all.join('・');
  };
  return { defenseFailed: line('defenseFailed', card.defenseFailEffects), defended: line('defended', []), repelled: line('repelled', card.repelEffects) };
};

/** いまの選択で文明カードにかかる追加の割引（普及の最上位の1枚ごとの割引、ユーザー決定 2026-11-07）。 */
export const playDiscount = (state: GameState, player: number, d: GameData = GAME_DATA): number => {
  const task = state.stack[state.stack.length - 1];
  return task?.t === 'spreadPlay' && task.player === player ? d.params.actions.spread[task.tier].goldDiscount : 0;
};

const tok = (section: keyof typeof ICON_KEYS, key: string, value?: number | string): IconToken => {
  const table = ICON_KEYS[section] as Readonly<Record<string, { icon: string; label: string }>>;
  const entry = table[key] ?? { icon: `${section}.${key}`, label: key };
  return value === undefined ? { icon: entry.icon, label: entry.label } : { icon: entry.icon, value, label: entry.label };
};

const THEN: IconToken = { icon: 'sym.then', label: '→' };

/**
 * 払う量と得る量の組（教練・福祉、ユーザー決定 2026-11-07）。組が2つ以上なら、アクションボードの枠に収まるよう
 * 値を「/」でつないだ1つの並び（例：金3/6/9 → トークン3/5/8）にする。どれか1組を選ぶことは効果文で補う。
 */
const choiceTokens = (alternatives: readonly (readonly IconToken[])[]): IconToken[] => {
  const [first] = alternatives;
  if (first === undefined) return [];
  if (alternatives.length === 1) return [...first];
  return first.map((t, i) =>
    t.value === undefined ? t : { ...t, value: alternatives.map((alt) => alt[i]?.value ?? '').join('/') },
  );
};

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
  actionChoice: { icon: 'scene.choose', heading: '払う量を選ぶ' },
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
      return [
        ...choiceTokens(a.drill[tier].choices.map((c) => [tok('resources', 'gold', c.payGold), THEN, tok('resources', 'militaryTokens', c.gainTokens)])),
        tok('tracks', 'military', `≤${a.drill[tier].maxRaises}`),
      ];
    case 'expedition': {
      const selection = a.expedition.selection[tier];
      return [tok('commands', 'expeditionRewards', selection.mode === 'distinct' ? selection.max : selection.total)];
    }
    case 'welfare':
      return [
        ...choiceTokens(a.welfare[tier].choices.map((c) => [tok('resources', 'materials', c.payMaterials), THEN, tok('tracks', 'infra', `+${c.infra}`)])),
        ...(a.welfare[tier].tempWorkers > 0 ? [tok('resources', 'tempWorkers', a.welfare[tier].tempWorkers)] : []),
      ];
    case 'migration':
      return [
        ...(a.migration[tier].tempWorkers > 0 ? [tok('resources', 'tempWorkers', a.migration[tier].tempWorkers)] : []),
        tok('resources', 'regularWorkers', a.migration[tier].regularWorkers),
        ...(a.migration[tier].materials > 0 ? [tok('resources', 'materials', a.migration[tier].materials)] : []),
      ];
    case 'research':
      return [tok('resources', 'drawCivCards', a.research[tier].draw), ...(a.research[tier].playCards > 0 ? [tok('commands', 'playCard', a.research[tier].playCards)] : [])];
    case 'spread':
      return [tok('commands', 'playCard', a.spread[tier].maxCards), ...(a.spread[tier].goldDiscount > 0 ? [tok('resources', 'gold', -a.spread[tier].goldDiscount)] : [])];
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
      const pay = s.choices.map((c) => `金${c.payGold}を払って軍事力トークン${c.gainTokens}を得る`);
      return `${pay.length > 1 ? `次のいずれか1つを行う：${pay.join('／')}。` : `${pay[0] ?? ''}。`}続けて軍事力トークンを払い、軍事レベルを最大${s.maxRaises}上げる。`;
    }
    case 'expedition': {
      const s = a.expedition.selection[tier];
      return s.mode === 'distinct'
        ? `軍事力トークンを払い、軍事レベル以下の遠征の報酬から、異なるものを最大${s.max}つ得る。`
        : `軍事力トークンを払い、軍事レベル以下の遠征の報酬を合計${s.total}個まで得る（同じ報酬は${s.maxSame}個まで）。`;
    }
    case 'welfare': {
      const s = a.welfare[tier];
      const pay = s.choices.map((c) => `資材${c.payMaterials}を払ってインフラレベルを${c.infra}上げる`);
      return `${pay.length > 1 ? `次のいずれか1つを行う：${pay.join('／')}。` : `${pay[0] ?? ''}。`}${s.tempWorkers > 0 ? `臨時ワーカー${s.tempWorkers}人を得る。` : ''}`;
    }
    case 'migration': {
      const s = a.migration[tier];
      return `${s.tempWorkers > 0 ? `臨時ワーカー${s.tempWorkers}人と、` : ''}通常ワーカーを${upTo(s.regularWorkersIsMax)}${s.regularWorkers}人得る。${s.materials > 0 ? `資材${s.materials}を得る。` : ''}`;
    }
    case 'research': {
      const s = a.research[tier];
      return `文明カードを${s.draw}枚引く。${s.playCards > 0 ? `その後、文明カードを${s.playCards}枚まで通常のコストでプレイしてよい。` : ''}`;
    }
    case 'spread': {
      const s = a.spread[tier];
      return `文明カードを${upTo(s.cardsIsMax)}${s.maxCards}枚プレイする。${s.goldDiscount > 0 ? `1枚ごとにコストを金${s.goldDiscount}軽減する（0未満にはならない）。` : ''}`;
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

/** プレイ済みの文明カードの上に建てた住宅の数（移動住宅、ユーザー決定 2026-11-06）。 */
export const housesOnCard = (player: PlayerState, card: string): number => cardHouseCount(player, `civ:${card}`);

/** 建物の数の内訳：盤面に建てた数と、文明カードの上に建てた数（住宅だけ）。合計は buildingCount と同じ。 */
export const buildingBreakdown = (player: PlayerState, building: Building): { board: number; onCards: number } => {
  const onCards = building === 'house' ? cardHouseCount(player) : 0;
  return { board: buildingCount(player, building) - onCards, onCards };
};

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

// 早見表と吹き出しの説明（reference.ts）。画面は queries.ts だけから派生値を得るため、ここから再輸出する。
export {
  ALL_BUILDINGS,
  actionLabel,
  buildingInfo,
  buildingLabel,
  describeBuilding,
  describeExpeditionRewards,
  expeditionRows,
  grantText,
  ownedCount,
  unlockText,
  type BuildingInfo,
  type ExpeditionRow,
} from './reference.ts';

// ---------------------------------------------------------------------------
// 文字表示（tools/play、指示書 2026-11-10 対話プレイ 2-4）のための派生値
// ---------------------------------------------------------------------------

export {
  abilityLabel,
  axisLabel,
  actionSpaceLabel,
  bonusTileText,
  boardName,
  characterName,
  civCardEffect,
  civCardName,
  plannedCityName,
  sourceName,
  specialCitizenText,
  terrainLabel,
  tierLabel,
} from './labels.ts';

/** いまのラウンドの襲撃カード。ドラフト中（ラウンド0）は未公開のため null。 */
export const currentRaidCard = (state: GameState, d: GameData = GAME_DATA): RaidCard | null => {
  if (state.round < 1) return null;
  const id = state.raidOrder[state.round - 1];
  return d.raidCards.find((c) => c.id === id) ?? null;
};

/** トラックの次の到達報酬（未獲得で、いまのレベルより上の最小のもの）。なければ null。 */
export const nextTrackReward = (
  player: PlayerState,
  track: 'military' | 'infra',
  d: GameData = GAME_DATA,
): { level: number; text: string } | null => {
  const level = track === 'military' ? player.militaryLevel : player.infraLevel;
  const reward = d.params[track].rewards.filter((r) => r.level > level).sort((a, b) => a.level - b.level)[0];
  return reward === undefined ? null : { level: reward.level, text: reward.grants.map(grantTextOf).join('・') };
};

/** 置いた土地タイルの種類ごとの枚数。 */
export const landByType = (player: PlayerState): Record<Terrain, number> => {
  const counts: Record<Terrain, number> = { water: 0, mountain: 0, plains: 0, forest: 0 };
  for (const t of Object.values(player.land)) if (t !== undefined) counts[t] += 1;
  return counts;
};

/** 計画都市カードの達成者（先着順）。 */
export const plannedCityClaimers = (state: GameState, id: string): number[] => state.plannedCityClaims[id] ?? [];

/** 文明カードの山札と捨て札の枚数（中身と順序は出さない、19-6-1）。 */
export const civPileCounts = (state: GameState): { deck: number; discard: number } => ({
  deck: state.civDeck.length,
  discard: state.civDiscard.length,
});
