// 取り消せない選択の前の確かめ（ユーザー決定 2026-11-12）。画面の Game.tsx の choose が使う。

import { applyMove, getOptions } from '../game/engine.ts';
import { hiddenFuture } from '../game/history.ts';
import type { GameState } from '../game/types.ts';

/**
 * 取り消せない選択の確かめの文（ユーザー決定 2026-11-12）。確かめが要らなければ null。
 * 対象は、ドラフトの選択・パス・乱数を消費するか非公開の情報が公開される選択（カードを引く・特別な市民カードの補充がめくられる など、
 * history.ts の hiddenFuture）である。手番の終了（end）は、取り消せないが毎手番のため確かめない。判定は写しに applyMove を掛けて行い、ルールは計算しない。
 */
export const irreversibleNotice = (state: GameState, optionId: string): string | null => {
  const option = getOptions(state).find((o) => o.id === optionId);
  if (option === undefined) return null;
  const top = state.stack[state.stack.length - 1];
  if (top?.t === 'draftPick') return `ドラフトで「${option.label}」を選びます。選ぶと取り消せません。よろしいですか？`;
  if (optionId === 'pass') return 'パスします。このラウンドはもう手番が来ず、取り消せません。よろしいですか？';
  let next: GameState;
  try {
    next = applyMove(state, optionId);
  } catch {
    return null;
  }
  const hidden = hiddenFuture(state, next);
  if (hidden === null) return null;
  const why = hidden === 'reveal' ? 'カードを引く・めくるなど、隠れていた情報が公開される' : '山札を切るなど、偶然で決まる';
  return `「${option.label}」を選ぶと、${why}ため取り消せません。よろしいですか？`;
};

