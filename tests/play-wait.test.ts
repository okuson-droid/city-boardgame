// wait・resume の既定の出力の縮小と move --then-wait の検査（指示書案 2026-11-13 待ちと引き継ぎの縮小 3）。
// ルールと数値は変えない。表示の形と、非公開情報（rules.md v0.8 19-6-1）を守っていることを確かめる。

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GAME_DATA } from '../src/data/index.ts';
import { decider, getOptions, isGameOver, type GameState } from '../src/game/index.ts';
import { compactShow, effectiveRound, resumeBrief, resumeOutput, unavailableFolded, unavailableLines, waitOutput } from '../tools/play/compact.ts';
import { applyMovesFrom, logSteps, newRecord, stateOf, type PlayRecord } from '../tools/play/record.ts';
import { playout, yieldToRunner } from './helpers/playout.ts';

const hiddenCards = (state: GameState, viewer: number): string[] => {
  const visible = new Set([...(state.players[viewer]?.hand ?? []), ...state.players.flatMap((p) => p.played), ...state.civDiscard]);
  return state.players.filter((p) => p.index !== viewer).flatMap((p) => p.hand.filter((c) => !visible.has(c)));
};
const nameOf = (id: string): string => GAME_DATA.civilizationCards.find((c) => c.id === id)?.name ?? id;
const expectNoLeak = (text: string, state: GameState, viewer: number): void => {
  for (const id of hiddenCards(state, viewer)) expect(text).not.toContain(`「${nameOf(id)}」`);
  const top = state.civDeck.slice(0, 3).map(nameOf);
  if (top.length === 3) expect(top.every((n) => text.includes(`「${n}」`))).toBe(false);
};

/** 乱択プレイアウトの各手の後の局面と記録。 */
const walk = (players: number, seed: number) => {
  const { moves } = playout(players, seed, 5000);
  let record: PlayRecord = newRecord({ playerCount: players }, seed);
  let state = stateOf(record);
  const out: { state: GameState; record: PlayRecord }[] = [];
  for (const move of moves) {
    const r = applyMovesFrom(state, record, [move]);
    record = r.record;
    state = r.state;
    out.push({ state, record });
  }
  return out;
};

describe('wait の既定の出力（指示書案 2026-11-13 2-1）', () => {
  it('選択肢・注意・選べない理由を除いて、出来事の行数＋6行以内であり、局面の残りの欄を出さない', async () => {
    // rules.md v0.8 19-6-1（選択肢は選択待ちの視点でだけ出す）
    await yieldToRunner();
    let checked = 0;
    for (const { state } of walk(3, 91)) {
      const seat = decider(state);
      if (seat === null || isGameOver(state)) continue;
      const events = ['R1 P1 開拓・通常：資材-2', '狙い：開拓・上位：P1 が置いた（占有型でこのラウンドは使えない）'];
      const lines = waitOutput(state, seat, events, { raid: true, unavailable: unavailableLines(state) });
      const at = lines.findIndex((l) => l.startsWith('== 選択肢'));
      const head = at < 0 ? lines.length : at;
      expect(head).toBeLessThanOrEqual(1 + events.length + 6);
      expect(lines.some((l) => l.startsWith('== 他のプレイヤー') || l.startsWith('== 局面'))).toBe(false);
      expect(lines.some((l) => l.startsWith('== 選択肢'))).toBe(getOptions(state).length > 0);
      expectNoLeak(lines.join('\n'), state, seat);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  }, 120_000);

  it('選べない理由は、前回と同じなら1行にまとめ、変わったら全部を出す', () => {
    const states = walk(3, 92).map((x) => x.state).filter((s) => unavailableLines(s).length > 0);
    const s = states[0];
    if (s === undefined) throw new Error('選べないものがある局面がない');
    const first = unavailableFolded(s, undefined);
    expect(first.lines).toEqual(unavailableLines(s));
    const second = unavailableFolded(s, first.signature);
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0]).toMatch(/^選べない \d+ 件（前回の wait と同じ/);
    const changed = unavailableFolded(s, `${first.signature}x`);
    expect(changed.lines).toEqual(unavailableLines(s));
  });

  it('--state 相当（従来の既定の形）は compactShow と同じである', () => {
    const { state } = walk(3, 93)[120] ?? { state: stateOf(newRecord({ playerCount: 3 }, 93)) };
    const seat = decider(state) ?? 0;
    // --state は showState（compactShow）をそのまま使う。既定の短い形には局面の欄が無い。
    expect(compactShow(state, { as: seat }).some((l) => l.startsWith('== 他のプレイヤー'))).toBe(true);
  });
});

describe('resume の短い形（指示書案 2026-11-13 2-2）', () => {
  it('第2ラウンド以降の既定に、アクションボードの効果文・他のキャラクター・建物表が現れず、--ref（従来）には現れる', async () => {
    await yieldToRunner();
    const walked = walk(3, 94);
    const mid = walked.find((x) => effectiveRound(x.state) === 3 && x.state.phase === 'play');
    if (mid === undefined) throw new Error('第3ラウンドの局面がない');
    const steps = logSteps(mid.record);
    for (const seat of [0, 1, 2]) {
      const brief = resumeBrief(mid.state, seat, []);
      const full = resumeOutput(mid.state, steps, seat);
      for (const head of ['== アクションボード', '== キャラクター', '== 建物', '== 襲撃カード', '== 遠征の報酬表', `== P${seat} のこれまでの手番`]) {
        expect(brief).not.toContain(head);
        expect(full).toContain(head);
      }
      expect(brief).toContain('== 手札');
      expect(brief).toContain('== 自分のキャラクター');
      expect(brief).toContain('いま終わったときの見込み');
      expect(brief.length).toBeLessThan(full.length / 2);
      // 他の席の専用の計画都市・特別な市民カードは出さない（自分と場の分だけ）。
      for (const p of mid.state.players.filter((x) => x.index !== seat)) {
        for (const id of p.specialCitizens) expect(brief).not.toContain(`特別な市民カード${id}（P${p.index}）`);
      }
      expectNoLeak(brief, mid.state, seat);
    }
  }, 120_000);
});

describe('move --then-wait（指示書案 2026-11-13 2-3）', () => {
  // CLI の入出力を通して確かめる。dist-play/cli.js（npm run play:build）が無ければ飛ばす。
  const cli = join(process.cwd(), 'dist-play/cli.js');
  it.skipIf(!existsSync(cli))('選択待ちが同じ席なら従来の move の出力、他の席に移って時間切れなら待ちの文を出し、記録は move と同じに変わる', () => {
    const dir = mkdtempSync(join(tmpdir(), 'then-wait-'));
    const file = join(dir, 'game.json');
    const run = (args: string[]): string => execFileSync('node', [cli, ...args, '--file', file], { encoding: 'utf8' });
    run(['new', '--players', '3', '--seed', '95']);
    // ドラフトを進めて、最初の手番の行動を選ぶ場面まで（選択待ちの席が選ぶ）。
    for (let i = 0; i < 40; i += 1) {
      const rec = JSON.parse(readFileSync(file, 'utf8')) as PlayRecord;
      const state = stateOf(rec);
      if (state.phase === 'play' && state.stack[state.stack.length - 1]?.t === 'turn') break;
      run(['move', '1']);
    }
    const state = stateOf(JSON.parse(readFileSync(file, 'utf8')) as PlayRecord);
    const seat = decider(state) ?? 0;
    // 行動の途中（選択待ちが同じ席）：従来の move の出力（選択肢を含む）。
    const same = run(['move', 'act:migration:normal', '--seat', String(seat), '--then-wait', '--timeout', '1']);
    expect(same).toContain('== 選択肢');
    expect(same).not.toContain('== 適用した選択');
    // 手番を終えて他の席に移る：適用した選択を出し、時間切れの文で終える。
    const rest = getOptions(stateOf(JSON.parse(readFileSync(file, 'utf8')) as PlayRecord)).map((o) => o.id);
    const specs = rest.includes('temp:0') ? ['temp:0', 'end'] : ['end'];
    const moved = run(['move', ...specs, '--seat', String(seat), '--then-wait', '--timeout', '1']);
    expect(moved).toContain('== 適用した選択');
    expect(moved).toMatch(/まだ P\d の番ではない/);
    const after = JSON.parse(readFileSync(file, 'utf8')) as PlayRecord;
    expect(after.moves.slice(-specs.length)).toEqual(specs);
    expect(decider(stateOf(after))).not.toBe(seat);
  }, 60_000);
});
