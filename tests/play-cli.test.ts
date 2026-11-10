// 対話プレイ用のコマンド（tools/play/）の純粋関数の検査（指示書 2026-11-10 対話プレイ 3）。
// ルールは変えない。合法手は getOptions、進行は applyMove、得点は finalScores に頼っていることを確かめる。

import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/index.ts';
import { finalScores, getOptions, isGameOver, replay, type GameState } from '../src/game/index.ts';
import {
  applyMoves,
  applyMovesFrom,
  logSteps,
  newRecord,
  PlayError,
  stateOf,
  undoMoves,
  type PlayRecord,
} from '../tools/play/record.ts';
import { renderLog, renderShow, renderSteps, scoreModel, showModel } from '../tools/play/render.ts';
import { playout, yieldToRunner } from './helpers/playout.ts';

const strip = (s: GameState): unknown => ({ ...s, events: s.events.length, log: s.log });

/** 視点以外のプレイヤーだけが持つ手札（視点の手札・プレイ済み・捨て札にない）。 */
const hiddenCards = (state: GameState, viewer: number): string[] => {
  const visible = new Set([
    ...(state.players[viewer]?.hand ?? []),
    ...state.players.flatMap((p) => p.played),
    ...state.civDiscard,
  ]);
  return state.players.filter((p) => p.index !== viewer).flatMap((p) => p.hand.filter((c) => !visible.has(c)));
};

const nameOf = (id: string): string => GAME_DATA.civilizationCards.find((c) => c.id === id)?.name ?? id;

/** 山札の並びが出ていないか：山札の先頭から3枚の番号が続けて現れない（山札の中身は手札にもないため名前で見る）。 */
const leaksDeckOrder = (text: string, state: GameState): boolean => {
  const top = state.civDeck.slice(0, 3).map(nameOf);
  return top.length === 3 && top.every((n) => text.includes(`「${n}」`));
};

describe('記録の再生（指示書 3）', () => {
  // rules.md v0.8 2-6（準備）・第15章：局面は選択の記録から再生して作る。
  it('new 相当の記録に選択を足していった局面が、replay の局面と一致する', () => {
    const { moves } = playout(3, 11, 60);
    let record = newRecord({ playerCount: 3 }, 11);
    for (const move of moves.slice(0, 40)) record = applyMoves(record, [move]).record;
    expect(record.moves).toEqual(moves.slice(0, 40));
    expect(strip(stateOf(record))).toEqual(strip(replay({ playerCount: 3 }, 11, moves.slice(0, 40))));
  });

  // rules.md v0.8 16-2：選択肢にない選択は適用しない。
  it('存在しない選択肢 ID・範囲外の番号は、記録を変えずに失敗する', () => {
    const record = newRecord({ playerCount: 3 }, 2);
    const n = getOptions(stateOf(record)).length;
    expect(() => applyMoves(record, ['act:pioneer:normal'])).toThrow(PlayError);
    expect(() => applyMoves(record, [String(n + 1)])).toThrow(PlayError);
    expect(() => applyMoves(record, ['0'])).toThrow(PlayError);
    expect(record.moves).toEqual([]);
  });

  it('複数指定の途中で失敗した場合も、記録は変わらない', () => {
    const { moves } = playout(3, 3, 10);
    const record = applyMoves(newRecord({ playerCount: 3 }, 3), moves.slice(0, 2)).record;
    const before = JSON.stringify(record);
    expect(() => applyMoves(record, [...moves.slice(2, 5), 'no:such:option', moves[5] ?? ''])).toThrow(PlayError);
    expect(JSON.stringify(record)).toBe(before);
  });

  it('番号での指定は、同じ位置の選択肢 ID での指定と同じ局面になる', () => {
    let byNumber = newRecord({ playerCount: 4 }, 5);
    let byId = newRecord({ playerCount: 4 }, 5);
    for (const n of [3, 1, 7, 2, 1, 4, 1, 1, 2, 5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]) {
      const options = getOptions(stateOf(byId));
      const k = Math.min(n, options.length);
      byNumber = applyMoves(byNumber, [String(k)]).record;
      byId = applyMoves(byId, [options[k - 1]?.id ?? '']).record;
    }
    expect(byNumber.moves).toEqual(byId.moves);
    expect(strip(stateOf(byNumber))).toEqual(strip(stateOf(byId)));
  });

  // 取り消しは分析用で、ルール上の巻き戻し（rules.md v0.8 第15章）のチェックポイントを越えて戻せる。
  it('undo n の後の局面が、末尾 n 手を除いた記録の再生と一致する', () => {
    const { moves } = playout(3, 7, 80);
    const record = applyMoves(newRecord({ playerCount: 3 }, 7), moves).record;
    for (const n of [1, 5, 30]) {
      const undone = undoMoves(record, n);
      expect(undone.removed).toEqual(moves.slice(-n));
      expect(strip(stateOf(undone.record))).toEqual(strip(replay({ playerCount: 3 }, 7, moves.slice(0, -n))));
    }
    expect(() => undoMoves(record, moves.length + 1)).toThrow(PlayError);
    expect(() => undoMoves(record, 0)).toThrow(PlayError);
  });

  it('データが変わって再生できない記録は、その旨の PlayError になる', () => {
    const record: PlayRecord = { ...newRecord({ playerCount: 3 }, 1), moves: ['draft:board:no_such_board'] };
    expect(() => stateOf(record)).toThrow(/データが変わったため再生できない/);
  });
});

describe('非公開情報（rules.md v0.8 19-6-1）', () => {
  it('視点を指定した show（文字と JSON）に、他人の手札と山札の順序が現れない', () => {
    const { moves } = playout(4, 21, 120);
    const record = applyMoves(newRecord({ playerCount: 4 }, 21), moves).record;
    const state = stateOf(record);
    for (let viewer = 0; viewer < 4; viewer += 1) {
      const hidden = hiddenCards(state, viewer);
      expect(hidden.length).toBeGreaterThan(0);
      for (const text of [renderShow(state, { as: viewer, board: true }), JSON.stringify(showModel(state, { as: viewer, player: (viewer + 1) % 4 }))]) {
        for (const id of hidden) {
          expect(text).not.toContain(`${id}「`);
          expect(text).not.toContain(`"id":"${id}"`);
          expect(text).not.toContain(`「${nameOf(id)}」`);
        }
        expect(leaksDeckOrder(text, state)).toBe(false);
      }
    }
  });

  it('--as all はすべての手札を出すが、山札の順序は出さない', () => {
    const { moves } = playout(3, 22, 100);
    const state = replay({ playerCount: 3 }, 22, moves);
    const text = renderShow(state, { as: 'all' });
    const json = JSON.stringify(showModel(state, { as: 'all' }));
    for (const p of state.players) for (const id of p.hand) expect(text).toContain(`${id}「`);
    expect(leaksDeckOrder(text, state)).toBe(false);
    expect(leaksDeckOrder(json, state)).toBe(false);
    expect(json).not.toContain('civDeck":[');
  });

  it('選択待ちでない視点には、選択待ちのプレイヤーの選択肢を出さない', () => {
    const { moves } = playout(3, 23, 60);
    const state = replay({ playerCount: 3 }, 23, moves);
    const deciding = getOptions(state)[0]?.player ?? 0;
    expect(showModel(state, { as: (deciding + 1) % 3 }).prompt.options).toBeNull();
    expect(showModel(state, { as: deciding }).prompt.options).not.toBeNull();
  });
});

// 内部の識別子（英字のスネークケースや能力・カードの出どころの接頭辞、英字の単語）が残っていないか。
const INTERNAL = /[a-z]+_[a-z]+|\b(char|civ|sc|act|free|ability|space|plan|draft|card|tile|build|square|military|infra):|[a-z]{3,}/;

describe('1局の通し（3人・4人、指示書 3）', () => {
  for (const [players, seeds] of [
    [3, [31, 32]],
    [4, [41, 42]],
  ] as const) {
    for (const seed of seeds) {
      it(`${players}人 シード${seed}：move 相当で終局まで進み、show・score が通る`, async () => {
        await yieldToRunner();
        const { moves, stuck } = playout(players, seed, 3000);
        expect(stuck).toBe(false);
        let record = newRecord({ playerCount: players }, seed);
        let state = stateOf(record);
        let maxLines = 0;
        const badLabels = new Set<string>();
        for (const move of moves) {
          for (const o of getOptions(state)) if (INTERNAL.test(o.label)) badLabels.add(`${o.id} → ${o.label}`);
          const text = renderShow(state);
          const lines = text.split('\n');
          const boardAt = lines.indexOf('== 個人ボード');
          const optionsAt = lines.findIndex((l) => l.startsWith('== 選択肢'));
          // 個人ボードの行は数えない。
          const counted = boardAt < 0 ? lines.length : lines.length - (optionsAt - boardAt);
          maxLines = Math.max(maxLines, counted);
          const result = applyMovesFrom(state, record, [move]);
          expect(renderSteps(result.state, result.steps)).not.toBe('');
          record = result.record;
          state = result.state;
        }
        expect(isGameOver(state)).toBe(true);
        expect(renderShow(state)).toContain('ゲーム終了');
        const score = scoreModel(state);
        expect(score.over).toBe(true);
        if (score.over) {
          expect(score.players.map((p) => p.total)).toEqual(finalScores(state).map((s) => s.total));
        }
        expect([...badLabels]).toEqual([]);
        expect(maxLines).toBeLessThanOrEqual(150);
        const steps = logSteps(record);
        expect(steps).toHaveLength(moves.length);
        expect(renderLog(state, steps, moves.length).split('\n')).toHaveLength(1);
      }, 120_000);
    }
  }
});
