// 選択肢を画面要素ごとに振り分ける（ui_design.md 0-2）。判定は targetOf だけに頼る。

import type { CellId } from '../game/board.ts';
import { decider, getOptions } from '../game/engine.ts';
import { targetOf, type PanelKind, type Target } from '../game/targets.ts';
import type { GameState, Option } from '../game/types.ts';

export type Choice = { readonly option: Option; readonly target: Target };

export type UiModel = {
  readonly owner: number | null;
  readonly choices: readonly Choice[];
  /** targetOf が画面要素を返さない選択肢（安全網、ui_design.md 3-1）。 */
  readonly fallback: readonly Option[];
  readonly find: (pred: (t: Target) => boolean) => Option | undefined;
  readonly cellChoices: (cell: CellId) => Choice[];
  readonly panel: (kind: PanelKind) => Choice[];
  readonly conversions: readonly Choice[];
  readonly button: (name: 'pass' | 'end' | 'done') => Option | undefined;
};

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
