// 対話プレイ用のコマンド（tools/play/）の純粋関数の検査（指示書 2026-11-10 対話プレイ 3）。
// ルールは変えない。合法手は getOptions、進行は applyMove、得点は finalScores に頼っていることを確かめる。

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ACTIONS, GAME_DATA, TIERS } from '../src/data/index.ts';
import { finalScores, getOptions, isGameOver, queries, replay, replayTurns, turnDelta, turnSummary, type GameState } from '../src/game/index.ts';
import {
  compactJson,
  compactShow,
  effectiveRound,
  eventTurnLines,
  foldedLines,
  foldOptions,
  moveOutput,
  parseSections,
  readFolded,
  refLines,
  resumeOutput,
  SECTIONS,
  stepLines,
  turnLines,
} from '../tools/play/compact.ts';
import {
  applyMoves,
  applyMovesFrom,
  logSteps,
  newRecord,
  PlayError,
  readRecord,
  stateOf,
  undoMoves,
  type PlayRecord,
  type Step,
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

  it('席を指定した move は、選択待ちがその席でなければ記録を変えずに失敗する', () => {
    // rules.md v0.8 2-6-7（ドラフトの順番）。席ごとに別の打ち手が同じ記録を打つための確かめ。
    const record = newRecord({ playerCount: 3 }, 4);
    const first = getOptions(stateOf(record))[0];
    if (first === undefined) throw new Error('選択肢がない');
    const other = (first.player + 1) % 3;
    expect(() => applyMoves(record, ['1'], undefined, other)).toThrow(PlayError);
    const ok = applyMoves(record, ['1'], undefined, first.player);
    expect(ok.record.moves).toEqual([first.id]);
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

// ---------------------------------------------------------------------------
// 出力の軽量化（指示書 2026-11-11 対話プレイ軽量化 4）。表示だけを変え、ルール・選択肢・記録は変えない。
// ---------------------------------------------------------------------------

describe('出力の軽量化（指示書 2026-11-11）', () => {
  /** 乱択プレイアウトを記録の手順で進め、各手の前後の局面と Step を返す。 */
  const walk = (players: number, seed: number, max: number) => {
    const { moves } = playout(players, seed, max);
    let record = newRecord({ playerCount: players }, seed);
    let state = stateOf(record);
    const out: { before: GameState; after: GameState; step: Step }[] = [];
    for (const move of moves) {
      const result = applyMovesFrom(state, record, [move]);
      const step = result.steps[0];
      if (step === undefined) throw new Error('手がない');
      out.push({ before: state, after: result.state, step });
      record = result.record;
      state = result.state;
    }
    return { record, state, walked: out };
  };

  it('既定の move の出力は選択肢を除いて15行以内で、次の選択待ちが他の席ならその席の選択肢を含まない', async () => {
    // rules.md v0.8 19-6-1（他の席の選択肢は手札の内容を含みうる）
    await yieldToRunner();
    const { walked } = walk(3, 31, 3000);
    let maxLines = 0;
    for (const { after, step } of walked) {
      const text = moveOutput(after, [step], step.player);
      const lines = text.split('\n');
      const at = lines.findIndex((l) => l.startsWith('== 選択肢'));
      maxLines = Math.max(maxLines, at < 0 ? lines.length : at);
      const deciding = getOptions(after)[0]?.player;
      if (deciding === step.player) {
        expect(text).toContain('== 選択肢');
      } else if (deciding !== undefined) {
        expect(text).toContain(`選択待ち：P${deciding}`);
        for (const id of hiddenCards(after, step.player)) expect(text).not.toContain(`「${nameOf(id)}」`);
      }
    }
    expect(maxLines).toBeLessThanOrEqual(15);
  }, 120_000);

  it('畳んだ選択肢から読み取れる番号と ID の組は、getOptions の順の番号と ID の組に一致する', async () => {
    // rules.md v0.8 16-2（選択肢）。番号は getOptions の順（1始まり）。
    await yieldToRunner();
    const { walked } = walk(4, 41, 3000);
    const kinds = new Set<string>();
    for (const { before } of walked) {
      const options = getOptions(before).map((o, i) => ({ n: i + 1, id: o.id, label: o.label }));
      const rows = foldOptions(options);
      for (const r of rows) if (r.prefix !== null) kinds.add(r.prefix.split(':').slice(0, 2).join(':'));
      const read = readFolded(rows).sort((a, b) => a.n - b.n);
      expect(read).toEqual(options.map((o) => ({ n: o.n, id: o.id })));
      // 文字の表示にも、すべての番号が現れる。
      const text = foldedLines(rows).join('\n');
      for (const o of options) expect(text).toMatch(new RegExp(`(^|\\s)${o.n}\\.`));
    }
    // 畳む種類：手札を資材に替える・カードを選ぶ・建設・ドラフト。
    expect([...kinds].some((k) => k.startsWith('free:'))).toBe(true);
    expect([...kinds].some((k) => k.startsWith('build:'))).toBe(true);
    expect([...kinds].some((k) => k.startsWith('draft:'))).toBe(true);
  }, 120_000);

  it('--only の各欄は、--full の出力の該当する欄と同じ行を持つ。知らない欄は失敗する', () => {
    const { state } = walk(3, 32, 150);
    for (const viewer of [0, 1, 2]) {
      const full = new Set(renderShow(state, { as: viewer }).split('\n'));
      for (const s of ['progress', 'raid', 'actions', 'shared', 'self', 'others', 'options'] as const) {
        const lines = compactShow(state, { as: viewer, only: [s] });
        expect(lines.length).toBeGreaterThan(0);
        for (const l of lines) expect(full.has(l)).toBe(true);
      }
      // 手札は、--full の「自分」の欄の手札の行と同じ（効果文つき）。
      const hand = compactShow(state, { as: viewer, only: ['hand'] }).filter((l) => !l.startsWith('== 手札'));
      expect(hand.length).toBe(state.players[viewer]?.hand.length);
      for (const l of hand) expect(full.has(l)).toBe(true);
    }
    expect(() => parseSections('self,nosuch')).toThrow(/使える名前/);
    expect(parseSections('options,self')).toEqual(['self', 'options']);
  });

  it('ref はアクションボードの全スペースの効果文を含み、--card はカードの内容を出す', () => {
    const { state } = walk(3, 33, 120);
    const text = refLines(state, 0).join('\n');
    for (const a of ACTIONS) for (const t of TIERS) expect(text).toContain(queries.describeActionSpace(a, t));
    expect(refLines(state, 0, undefined, ['001']).join('\n')).toContain(`「${nameOf('001')}」`);
    expect(() => refLines(state, 0, undefined, ['999'])).toThrow(PlayError);
  });

  it('非公開情報：既定・--only・ref・resume・手番ごとのまとめに、視点以外の手札の内容と山札の順序が現れない', async () => {
    // rules.md v0.8 19-6-1
    await yieldToRunner();
    const { record, state, walked } = walk(4, 21, 200);
    const steps = walked.map((w) => w.step);
    for (let viewer = 0; viewer < 4; viewer += 1) {
      const hidden = hiddenCards(state, viewer);
      expect(hidden.length).toBeGreaterThan(0);
      const texts = [
        compactShow(state, { as: viewer, board: true }).join('\n'),
        JSON.stringify(compactJson(state, { as: viewer })),
        ...SECTIONS.map((s) => compactShow(state, { as: viewer, only: [s] }).join('\n')),
        JSON.stringify(compactJson(state, { as: viewer, only: [...SECTIONS] })),
        refLines(state, viewer).join('\n'),
        resumeOutput(state, steps, viewer),
        turnLines(state, steps, viewer).join('\n'),
        eventTurnLines(state, state.events, viewer).join('\n'),
        stepLines(state, steps, viewer).join('\n'),
      ];
      for (const text of texts) {
        for (const id of hidden) {
          expect(text).not.toContain(`${id}「`);
          expect(text).not.toContain(`「${nameOf(id)}」`);
        }
        expect(leaksDeckOrder(text, state)).toBe(false);
      }
    }
    expect(record.moves.length).toBe(200);
  }, 120_000);

  it('手番ごとのまとめ：他の席の1手番の増減の合計は、その手番の前後の局面の差と一致する', () => {
    // rules.md v0.8 12-0（手番）。自動の処理の増減（収入など）を含まない手番で比べる。
    const { walked } = walk(3, 34, 3000);
    const steps = walked.map((w) => w.step);
    let checked = 0;
    for (const turn of replayTurns(steps)) {
      const span = walked.filter((w) => w.step.index >= turn.from && w.step.index <= turn.to);
      const first = span[0];
      const last = span[span.length - 1];
      if (first === undefined || last === undefined) continue;
      const events = span.flatMap((w) => w.step.events);
      const own = events.filter((e) => e.type === 'delta' && e.player === turn.player);
      if (own.some((e) => e.type === 'delta' && e.cause !== 'move')) continue;
      const before = first.before.players[turn.player];
      const after = last.after.players[turn.player];
      if (before === undefined || after === undefined) continue;
      const diff: Record<string, number> = {};
      for (const k of ['gold', 'materials', 'militaryTokens', 'goldProduction', 'materialProduction', 'regularWorkers', 'tempWorkers', 'militaryLevel', 'infraLevel', 'score'] as const) {
        if (after[k] !== before[k]) diff[k] = after[k] - before[k];
      }
      if (after.hand.length !== before.hand.length) diff['hand'] = after.hand.length - before.hand.length;
      expect(turnDelta(events, turn.player)).toEqual(diff);
      expect(turnSummary(first.before, turn.player, events)).toMatch(/^P\d /);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
  }, 120_000);

  it('wait --round：局面のラウンドが指定より先なら終える（ドラフトと準備は第1ラウンドに含める）', () => {
    // 打ち手の作り直し（指示書 2026-11-11 2-6）
    const start = stateOf(newRecord({ playerCount: 3 }, 35));
    expect(effectiveRound(start)).toBe(1);
    const { state } = walk(3, 35, 400);
    expect(state.round).toBeGreaterThan(1);
    expect(effectiveRound(state) > state.round - 1).toBe(true);
    expect(effectiveRound(state) > state.round).toBe(false);
  });

  it('2026-11-10 の7局の記録は終局まで再生でき、最終得点が README の値と一致する', async () => {
    // 記録の形（ReplayRecord）は変えない（指示書 2026-11-11 1）。
    const readme = readFileSync('docs/playtest/2026-11-10/README.md', 'utf8');
    for (let game = 1; game <= 7; game += 1) {
      await yieldToRunner();
      const row = readme.split('\n').find((l) => l.startsWith(`| ${game} |`));
      if (row === undefined) throw new Error(`README にゲーム${game}の行がない`);
      const expected = new Map<number, number>();
      for (const m of row.matchAll(/P(\d) \S+ \S+ (\d+)/g)) expected.set(Number(m[1]), Number(m[2]));
      const record = readRecord(`docs/playtest/2026-11-10/replays/game${game}.json`);
      const state = stateOf(record);
      expect(isGameOver(state)).toBe(true);
      for (const s of finalScores(state)) expect(s.total).toBe(expected.get(s.player));
    }
  }, 120_000);
});
