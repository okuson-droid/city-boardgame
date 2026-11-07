// 選べない理由の説明（ui_design.md 0-1、3-2、指示書 3-4）。
// 画面は選べない要素に触れたとき、ここで組み立てた文章だけを出す。選べる要素には null を返す。

import { GAME_DATA } from '../data/index.ts';
import { ICON_KEYS } from '../data/icon-keys.ts';
import type { Action, GameData, Tier, UnlockCondition } from '../data/types.ts';
import { neighborsOf, type CellId } from './board.ts';
import { canExecute, civCardCost } from './actions.ts';
import { playerOf, usableRegular, usableTemp } from './core.ts';
import { decider, getOptions, isTopUnlocked } from './engine.ts';
import { targetOf, type Target } from './targets.ts';
import type { GameState } from './types.ts';

const label = (section: 'buildings' | 'tiers' | 'metrics' | 'tracks', key: string): string =>
  (ICON_KEYS[section] as Readonly<Record<string, { label: string }>>)[key]?.label ?? key;

const unlockText = (c: UnlockCondition): string => {
  switch (c.metric) {
    case 'buildingsOfType':
      return `${label('buildings', c.building)}${c.atLeast}軒`;
    case 'totalBuildings':
      return `建物${c.atLeast}軒`;
    case 'landTiles':
      return `土地タイル${c.atLeast}枚`;
    case 'militaryLevel':
      return `軍事レベル${c.atLeast}`;
    case 'civCardsPlayed':
      return `文明カード${c.atLeast}枚プレイ`;
  }
};

const sameTarget = (a: Target, b: Target): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 選択肢の中に、この画面要素に当たるものがあるか。 */
const isSelectable = (state: GameState, target: Target, d: GameData): boolean =>
  getOptions(state, d).some((o) => {
    const t = targetOf(o);
    if (t === null) return false;
    if (target.kind === 'cell' && t.kind === 'cell') return t.cell === target.cell;
    return sameTarget(t, target);
  });

const explainSpace = (state: GameState, d: GameData, action: Action, tier: Tier): string => {
  const p = decider(state);
  const task = state.stack[state.stack.length - 1];
  if (p === null || task?.t !== 'turn') return '今はアクションを選ぶ場面ではない';
  if (task.acted) return 'この手番ではすでにアクションを実行した（12-0-6）';
  const player = playerOf(state, p);
  const shared = d.params.actions.shared.some((s) => s.action === action && s.tier === tier);
  if (!shared && state.occupied.includes(`${action}.${tier}`)) return 'このラウンドは使用済みのスペースである（6-2-1）';
  if (tier === 'top' && !isTopUnlocked(d, player, action)) {
    return `最上位は未解放である。解放条件：${unlockText(d.params.actions.unlockTop[action])}`;
  }
  const need = d.params.actions.workerCost[tier];
  const have = usableRegular(player) + usableTemp(player);
  if (have < need) return `ワーカーが足りない（必要${need}人、使える${have}人）`;
  if (!canExecute(d, player, action, tier)) return 'コストを払えない、または実行できる内容がない（6-1-6、6-1-7）';
  return '選べない';
};

const explainCell = (state: GameState, d: GameData, cell: CellId, owner: number): string => {
  const player = playerOf(state, owner);
  const task = state.stack[state.stack.length - 1];
  if (decider(state) !== owner) return '他のプレイヤーの個人ボードである';
  if (task?.t === 'placeTiles' || task?.t === 'spiritPlace' || task?.t === 'heroStart') {
    if (player.land[cell] !== undefined) return 'すでに開拓済みのマスである';
    if (task.t !== 'heroStart' && !neighborsOf(cell).some((n) => player.land[n] !== undefined)) {
      return '開拓済みの土地と辺を共有していない（4-2-1）';
    }
    return 'このマスには置けない（地形・コストの条件を満たさない）';
  }
  if (task?.t === 'build') {
    if (player.land[cell] === undefined) return '開拓されていないマスである（5-1-1）';
    if (player.buildings[cell] !== undefined) return 'すでに建物がある（5-1-1）';
    if (Object.values(player.spiritChips).includes(cell)) return '精霊チップのある土地には建設できない';
    return 'この建物は建てられない（上限・コスト・条件を満たさない）';
  }
  return '今はマスを選ぶ場面ではない';
};

const explainHandCard = (state: GameState, d: GameData, card: string): string => {
  const p = decider(state);
  if (p === null) return '今はカードを選ぶ場面ではない';
  const player = playerOf(state, p);
  const task = state.stack[state.stack.length - 1];
  if (task?.t === 'spreadPlay' || (task?.t === 'playCard' && !task.free)) {
    const cost = civCardCost(d, player, card, task.t === 'spreadPlay' ? d.params.actions.spread[task.tier].goldDiscount : 0);
    if (cost > player.gold) return `金が足りない（必要${cost}金、所持${player.gold}金）`;
  }
  return '今はこのカードを選ぶ場面ではない';
};

/**
 * 画面要素を選べない理由。選べるなら null。
 * owner は個人ボードのマスを表示しているプレイヤー（マスの説明に使う）。
 */
export const explain = (state: GameState, target: Target, owner: number | null = null, d: GameData = GAME_DATA): string | null => {
  if (state.phase === 'over') return 'ゲームは終了している';
  if (isSelectable(state, target, d)) return null;
  switch (target.kind) {
    case 'actionSpace':
      return explainSpace(state, d, target.action, target.tier);
    case 'cell':
      return explainCell(state, d, target.cell, owner ?? decider(state) ?? 0);
    case 'handCard':
      return explainHandCard(state, d, target.card);
    case 'specialSpace':
      return 'このラウンドは使用済み、獲得した手番中、またはワーカー・実行内容が足りない（6-2-5、9-3-3）';
    case 'ability':
      return '使用済み、獲得した手番中、または条件・支払いを満たさない（9-3-3）';
    case 'plannedCity':
      return '達成条件を満たしていない、宣言済み、または宣言できる人数に達した（13-3）';
    case 'bonusTile':
      return '返却したタイルか、他のプレイヤーが占有しているタイルである（11-3-2）';
    case 'specialCitizen':
      return '今は特別な市民カードを獲得する場面ではない';
    case 'draft':
      return 'この種類の要素はすでに獲得した（2-6-4-2）';
    default:
      return '今は選べない';
  }
};

/** 取り消しができない理由。取り消せるなら null（15-1-2、19-6-3）。 */
export const explainUndo = (state: GameState): string | null => {
  const last = state.log[state.log.length - 1];
  if (last === undefined) return '取り消す選択がない';
  if (last.checkpoint) {
    return '直前の処理より前には戻れない（カードの公開・手番の交代・ラウンドの進行・ドラフト・ボーナスタイル・襲撃、15-1-2、19-6-3）';
  }
  return null;
};
