// 選択肢を画面要素ごとに振り分ける（ui_design.md 0-2）。判定は targetOf だけに頼る。

import type { CellId } from '../game/board.ts';
import { decider, getOptions } from '../game/engine.ts';
import { targetOf, type PanelKind, type Target } from '../game/targets.ts';
import type { GameState, Option } from '../game/types.ts';

export type Choice = { readonly option: Option; readonly target: Target };

export type UiModel = {
  readonly owner: number | null;
  /**
   * 他の席の選択待ちを待っているか（オンライン版）。このときは選択肢も選べない理由も計算しない
   * （他の席の手札は伏せてあり、その席の選択肢は組み立てられないため）。
   */
  readonly waiting: boolean;
  readonly choices: readonly Choice[];
  /** targetOf が画面要素を返さない選択肢（安全網、ui_design.md 3-1）。 */
  readonly fallback: readonly Option[];
  readonly find: (pred: (t: Target) => boolean) => Option | undefined;
  readonly cellChoices: (cell: CellId) => Choice[];
  readonly panel: (kind: PanelKind) => Choice[];
  readonly conversions: readonly Choice[];
  readonly button: (name: 'pass' | 'end' | 'done') => Option | undefined;
};

/** 選択肢のない画面（オンライン版で他の席の手番を待つとき）。 */
export const waitingModel = (state: GameState): UiModel => ({
  owner: decider(state),
  waiting: true,
  choices: [],
  fallback: [],
  find: () => undefined,
  cellChoices: () => [],
  panel: () => [],
  conversions: [],
  button: () => undefined,
});

/** 他の席の手番を待つ間に、選べない要素の補足に出す文章。 */
export const WAITING_REASON = '他のプレイヤーの手番である';

export const buildModel = (state: GameState): UiModel => {
  const options = getOptions(state);
  const choices: Choice[] = [];
  const fallback: Option[] = [];
  for (const option of options) {
    const target = targetOf(option);
    if (target === null) fallback.push(option);
    else choices.push({ option, target });
  }
  const find = (pred: (t: Target) => boolean): Option | undefined => choices.find((c) => pred(c.target))?.option;
  return {
    owner: decider(state),
    waiting: false,
    choices,
    fallback,
    find,
    cellChoices: (cell) => choices.filter((c) => c.target.kind === 'cell' && c.target.cell === cell),
    panel: (kind) => choices.filter((c) => c.target.kind === 'panel' && c.target.panel === kind),
    conversions: choices.filter((c) => c.target.kind === 'conversion'),
    button: (name) => find((t) => t.kind === 'button' && t.button === name),
  };
};

export const PLAYER_COLORS = ['#d9534f', '#2e7bd6', '#3aa655', '#c78a12'];

export const colorOf = (player: number): string => PLAYER_COLORS[player % PLAYER_COLORS.length] ?? '#888';
