// 対話プレイの打ち手を強くする出力の検査（指示書 2026-11-12 対話プレイ強化 4、decisions.md 3-6）。
// 得点の見込み（projectedScores）・手の下見（move --dry-run）・落とし穴の注意（pitfalls）・狙いの知らせ（plan）を確かめる。
// いずれもルールと数値を変えない表示と運用の扱いであり、合法手は getOptions、進行は applyMove、得点は finalScores に頼る。

import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GAME_DATA } from '../src/data/index.ts';
import {
  applyMove,
  decider,
  finalScores,
  getOptions,
  hiddenFuture,
  isGameOver,
  pitfallLines,
  pitfalls,
  projectedScores,
  queries,
  replay,
  type GameState,
  type Pitfall,
} from '../src/game/index.ts';
import { moveOutput, resumeOutput } from '../tools/play/compact.ts';
import { compareOutput, previewOutput, previewSequence, projectionDelta, resourceDelta } from '../tools/play/preview.ts';
import { clearPlan, orderLine, parseTargets, planList, planNotice, planPath, readPlan, setPlan, targetStatus, writePlan, type PlanFile } from '../tools/play/plan.ts';
import { applyMovesFrom, logSteps, newRecord, readRecord, stateOf, type PlayRecord, type Step } from '../tools/play/record.ts';
import { renderScore } from '../tools/play/render.ts';
import { playout, yieldToRunner } from './helpers/playout.ts';

/** 乱択プレイアウトの途中（全体の frac の位置）の局面。 */
const midGame = (players: number, seed: number, frac: number): GameState => {
  const { moves } = playout(players, seed, 5000);
  return replay({ playerCount: players }, seed, moves.slice(0, Math.floor(moves.length * frac)));
};

/** 視点以外のプレイヤーだけが持つ手札（視点の手札・プレイ済み・捨て札にない）。 */
const hiddenCards = (state: GameState, viewer: number): string[] => {
  const visible = new Set([...(state.players[viewer]?.hand ?? []), ...state.players.flatMap((p) => p.played), ...state.civDiscard]);
  return state.players.filter((p) => p.index !== viewer).flatMap((p) => p.hand.filter((c) => !visible.has(c)));
};

const nameOf = (id: string): string => GAME_DATA.civilizationCards.find((c) => c.id === id)?.name ?? id;

/** 他の席の手札の名前と、山札の先頭3枚の並びが出ていないことを確かめる。 */
const expectNoLeak = (text: string, state: GameState, viewer: number): void => {
  for (const id of hiddenCards(state, viewer)) expect(text).not.toContain(`「${nameOf(id)}」`);
  const top = state.civDeck.slice(0, 3).map(nameOf);
  if (top.length === 3) expect(top.every((n) => text.includes(`「${n}」`))).toBe(false);
};

/** 乱択プレイアウトを記録の手順で進め、各手の前後の局面と Step を返す。 */
const walk = (players: number, seed: number, max: number) => {
  const { moves } = playout(players, seed, max);
  let record: PlayRecord = newRecord({ playerCount: players }, seed);
  let state = stateOf(record);
  const out: { before: GameState; after: GameState; step: Step; record: PlayRecord }[] = [];
  for (const move of moves) {
    const result = applyMovesFrom(state, record, [move]);
    const step = result.steps[0];
    if (step === undefined) throw new Error('手がない');
    out.push({ before: state, after: result.state, step, record });
    record = result.record;
    state = result.state;
  }
  return { record, state, walked: out };
};

const freeze = (s: GameState): string => JSON.stringify(s);

describe('得点の見込み（指示書 2026-11-12 2-1）', () => {
  it('終局した局面では finalScores と一致する', async () => {
    // rules.md v0.8 17-0-1、17-7
    for (const seed of [51, 52]) {
      await yieldToRunner();
      const { state } = playout(3, seed, 5000);
      expect(isGameOver(state)).toBe(true);
      const p = projectedScores(state);
      expect(p.over).toBe(true);
      expect(p.omitted).toEqual([]);
      expect(p.scores).toEqual(finalScores(state));
    }
  });

  it('途中の局面で呼んでも元の局面（乱数の状態を含む）は変わらない', () => {
    // rules.md v0.8 17-0-1（終了の手順は写しに掛ける）
    const state = midGame(3, 53, 0.5);
    const before = freeze(state);
    projectedScores(state);
    expect(freeze(state)).toBe(before);
  });

  it('途中の局面の見込みは、終了の手順を最後まで進めた局面の finalScores と一致する（終了時の能力を含む）', async () => {
    // rules.md v0.8 17-0-1 手順4、19-5-5
    await yieldToRunner();
    const state = midGame(3, 54, 0.6);
    expect(isGameOver(state)).toBe(false);
    const p = projectedScores(state);
    expect(isGameOver(p.ended)).toBe(true);
    expect(p.scores).toEqual(finalScores(p.ended));
  });

  it('終了時の能力を持つ特別な市民カード（05・12・06）と資本家の分だけ、従来の値（終了時の能力を除く）より大きい', () => {
    // rules.md v0.8 17-0-1 手順4（特別市民05・06・12、資本家の能力）
    const state = midGame(3, 55, 0.7);
    expect(isGameOver(state)).toBe(false);
    const s = structuredClone(state);
    const p0 = s.players[0];
    const p1 = s.players[1];
    if (p0 === undefined || p1 === undefined) throw new Error('プレイヤーがない');
    p0.specialCitizens = [...p0.specialCitizens.filter((c) => !['05', '06', '12'].includes(c)), '05', '06', '12'];
    p1.characterId = 'capitalist';
    const old = finalScores(s);
    const p = projectedScores(s);
    const fresh = p.ended.events.slice(s.events.length);
    const fromSource = (player: number, source: string): number =>
      fresh.reduce((sum, e) => sum + (e.type === 'score' && e.player === player && e.source === source ? e.points : 0), 0);
    const abilityPoints = ['05', '06', '12'].reduce((sum, c) => sum + fromSource(0, `sc:${c}`), 0);
    // 12 は住宅1軒につき1点。
    expect(fromSource(0, 'sc:12')).toBe(queries.buildingCount(p0, 'house'));
    expect(abilityPoints).toBeGreaterThan(0);
    expect((p.scores[0]?.total ?? 0) - (old[0]?.total ?? 0)).toBe(abilityPoints);
    // 資本家：建物1軒につき資材の生産力+1（経済・産業の換算に入る）。
    expect(p.ended.players[1]?.materialProduction).toBe(p1.materialProduction + queries.buildingCount(p1));
    expect(queries.buildingCount(p1)).toBeGreaterThan(0);
    const raised = structuredClone(s);
    const r1 = raised.players[1];
    if (r1 === undefined) throw new Error('プレイヤーがない');
    r1.materialProduction += queries.buildingCount(p1);
    expect(p.scores[1]?.axes.economy).toBe(finalScores(raised)[1]?.axes.economy);
  });

  it('いまのデータに、終了の手順の途中で選択が要る効果はない（見込みに含めなかった効果は空）', async () => {
    // rules.md v0.8 17-0-1 手順4
    await yieldToRunner();
    const { walked } = walk(3, 56, 5000);
    for (const { after } of walked.filter((_, i) => i % 25 === 0)) expect(projectedScores(after).omitted).toEqual([]);
  });

  it('score の見出しは「終了時の能力を含む」で、従来の「含まない」の文を出さない', () => {
    const { state } = playout(3, 57, 300);
    const text = renderScore(state);
    expect(text).toContain('いま終わったときの見込み（終了時の能力を含む');
    expect(text).not.toContain('含まない');
  });
});

describe('手の下見（指示書 2026-11-12 2-2）', () => {
  it('下見は記録と局面を変えず、増減は同じ選択肢を実際に適用した前後の差と一致する', async () => {
    // rules.md v0.8 19-6-1（下見は写しに適用する）
    await yieldToRunner();
    const { walked } = walk(3, 61, 5000);
    let checked = 0;
    for (const { before, after, step, record } of walked) {
      if (hiddenFuture(before, after) !== null || decider(before) !== step.player) continue;
      const frozen = freeze(before);
      const moves = [...record.moves];
      const p = previewSequence(before, [step.id], step.player, record.moves.length);
      expect(freeze(before)).toBe(frozen);
      expect(record.moves).toEqual(moves);
      expect(p.steps).toHaveLength(1);
      expect(freeze(p.end)).toBe(freeze(after));
      expect(resourceDelta(p.start, p.end, step.player)).toBe(resourceDelta(before, after, step.player));
      expect(projectionDelta(p.start, p.end, step.player)).toBe(projectionDelta(before, after, step.player));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  }, 120_000);

  it('乱数を消費する・非公開情報が公開される選択の手前で止め、引いたカードの内容を出さない', async () => {
    // rules.md v0.8 19-6-1、19-6-3
    await yieldToRunner();
    const { walked } = walk(3, 62, 5000);
    const hidden = walked.filter(({ before, after }) => hiddenFuture(before, after) !== null);
    expect(hidden.length).toBeGreaterThan(0);
    let drew = 0;
    for (const { before, after, step, record } of hidden) {
      const seat = decider(before);
      if (seat === null) continue;
      const p = previewSequence(before, [step.id], seat, record.moves.length);
      expect(p.steps).toHaveLength(0);
      expect(p.stopped).toMatch(/下見できない/);
      const text = previewOutput(before, [step.id], seat, record.moves.length);
      expect(text).toMatch(/ここから先は下見できない/);
      for (const id of step.reveal.hands[seat] ?? []) {
        drew += 1;
        if (!(before.players[seat]?.hand ?? []).includes(id)) expect(text).not.toContain(`「${nameOf(id)}」`);
      }
      void after;
    }
    expect(drew).toBeGreaterThan(0);
  }, 120_000);

  it('選択待ちが他の席に移った後は適用しない', async () => {
    await yieldToRunner();
    const { walked } = walk(3, 63, 5000);
    let checked = 0;
    for (let i = 0; i + 1 < walked.length; i += 1) {
      const a = walked[i];
      const b = walked[i + 1];
      if (a === undefined || b === undefined) continue;
      if (hiddenFuture(a.before, a.after) !== null || decider(a.after) === a.step.player || decider(a.after) === null) continue;
      const p = previewSequence(a.before, [a.step.id, b.step.id], a.step.player, a.record.moves.length);
      expect(p.steps).toHaveLength(1);
      expect(p.stopped).toMatch(/選択待ちが P\d に移った/);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10);
  }, 120_000);

  it('--or の各手順は独立している（1つが選べなくても他の手順は出る）', () => {
    const state = stateOf(newRecord({ playerCount: 3 }, 64));
    const seat = decider(state) ?? 0;
    const [first] = getOptions(state);
    if (first === undefined) throw new Error('選択肢がない');
    const text = compareOutput(state, [[first.id], ['nosuch'], ['1']], seat, 0);
    expect(text).toContain('案1');
    expect(text).toMatch(/案2 nosuch: 1個目（nosuch）は選べない/);
    expect(text).toContain('案3');
    expect(() => compareOutput(state, [[first.id], [first.id], [first.id], [first.id], [first.id]], seat, 0)).toThrow(/4 通りまで/);
  });
});

describe('落とし穴の注意（指示書 2026-11-12 2-3）', () => {
  /** 局面ごとの注意を集める（3人・4人の乱択プレイアウト）。 */
  const collect = (): { state: GameState; items: Pitfall[] }[] => {
    const out: { state: GameState; items: Pitfall[] }[] = [];
    for (const [players, seed] of [
      [3, 31],
      [3, 32],
      [4, 33],
    ] as const) {
      const { walked } = walk(players, seed, 5000);
      for (const { before } of walked) out.push({ state: before, items: pitfalls(before) });
    }
    return out;
  };
  let cached: { state: GameState; items: Pitfall[] }[] | null = null;
  const all = (): { state: GameState; items: Pitfall[] }[] => (cached ??= collect());

  it('乱択プレイアウトの全選択待ちで例外を出さず、注意の行は5行以内である。5つの型がすべて現れる', async () => {
    await yieldToRunner();
    const kinds = new Set<string>();
    for (const { items } of all()) {
      expect(pitfallLines(items).length).toBeLessThanOrEqual(5);
      for (const p of items) kinds.add(p.kind);
    }
    expect([...kinds].sort()).toEqual(['forcedBuild', 'natureBreak', 'officeConvert', 'passLeftover', 'raidRepel']);
  }, 300_000);

  it('先を見せない規則に当たる選択肢について注意を出さない', () => {
    for (const { state, items } of all()) {
      for (const p of items) for (const id of p.options) expect(hiddenFuture(state, applyMove(state, id))).toBeNull();
    }
  });

  it('自然公園を崩す：書いた点数は、適用した前後の natureParkPoints と一致する。自然公園が0点なら出ない', () => {
    // rules.md v0.8 14-3-4（建物のある土地タイルは自然公園に数えない）
    let seen = 0;
    for (const { state, items } of all()) {
      const seat = decider(state) ?? 0;
      const player = state.players[seat];
      if (player === undefined) continue;
      const settle = (s: GameState): GameState => {
        const top = s.stack[s.stack.length - 1];
        return top?.t === 'build' && top.picks.length > 0 && getOptions(s).some((o) => o.id === 'done') ? applyMove(s, 'done') : s;
      };
      for (const p of items.filter((x) => x.kind === 'natureBreak')) {
        seen += 1;
        const m = /自然公園 (\d+)→(\d+)点/.exec(p.text);
        if (m === null) throw new Error(p.text);
        expect(queries.natureParkPoints(settle(state).players[seat] ?? player)).toBe(Number(m[1]));
        for (const id of p.options) expect(queries.natureParkPoints(settle(applyMove(state, id)).players[seat] ?? player)).toBe(Number(m[2]));
      }
      if (queries.natureParkPoints(player) === 0) expect(items.some((x) => x.kind === 'natureBreak')).toBe(false);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('撃退できるのに選ばない：撃退の選択肢があるときだけ出し、トークンの数は raidNeed と一致する', () => {
    // rules.md v0.8 7-4、19-3-2
    let seen = 0;
    for (const { state, items } of all()) {
      const has = getOptions(state).some((o) => o.id === 'raid:repel');
      const p = items.find((x) => x.kind === 'raidRepel');
      expect(p !== undefined).toBe(has);
      if (p === undefined) continue;
      seen += 1;
      const player = state.players[decider(state) ?? 0];
      if (player === undefined) continue;
      expect(p.text).toContain(`撃退を選べる（軍事力トークン${queries.raidNeed(state, player).repel}個`);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('役所の変換が出なくなる：対象の人数は、使える臨時ワーカーをすべて使う人数であり、役所がなければ出ない', () => {
    // rules.md v0.8 5-5-4-2、3-4-4-2
    let seen = 0;
    for (const { state, items } of all()) {
      const player = state.players[decider(state) ?? 0];
      if (player === undefined) continue;
      const p = items.find((x) => x.kind === 'officeConvert');
      if (queries.buildingCount(player, 'office') === 0) expect(p).toBeUndefined();
      if (p === undefined) continue;
      seen += 1;
      for (const id of p.options) expect(Number(id.slice('temp:'.length))).toBe(queries.workerSummary(player).tempUsable);
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('残したままのパス：書いた人数は workerSummary と一致し、パスを選べないときは出ない', () => {
    // rules.md v0.8 11-1（パス）、17-2（残った金・資材は得点にしない、ユーザー決定 2026-11-06）
    let seen = 0;
    for (const { state, items } of all()) {
      const canPass = getOptions(state).some((o) => o.id === 'pass');
      const ps = items.filter((x) => x.kind === 'passLeftover');
      if (!canPass) expect(ps).toEqual([]);
      const player = state.players[decider(state) ?? 0];
      if (player === undefined) continue;
      for (const p of ps) {
        seen += 1;
        const m = /通常ワーカー(\d+)人・臨時ワーカー(\d+)人/.exec(p.text);
        if (m === null) {
          expect(p.text).toContain(`最終ラウンド：金${player.gold}・資材${player.materials}`);
          continue;
        }
        const w = queries.workerSummary(player);
        expect([Number(m[1]), Number(m[2])]).toEqual([w.regularUsable, w.tempUsable]);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('強制の建設：対象の選択肢を適用すると、効果で積まれた建設（1軒は建てる）が増える', () => {
    // rules.md v0.8 8-3（到達報酬）、16-2-2
    const forced = (s: GameState, seat: number): number =>
      s.stack.filter((t) => t.t === 'build' && t.player === seat && t.spec.tier === null && t.spec.min >= 1).length;
    let seen = 0;
    for (const { state, items } of all()) {
      const seat = decider(state) ?? 0;
      for (const p of items.filter((x) => x.kind === 'forcedBuild')) {
        seen += 1;
        for (const id of p.options) expect(forced(applyMove(state, id), seat)).toBeGreaterThan(forced(state, seat));
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('注意の行が5行を越える分は「ほか N 件」にまとめる', () => {
    const items: Pitfall[] = Array.from({ length: 7 }, (_, i) => ({ kind: 'passLeftover', options: [], text: `t${i}` }));
    expect(pitfallLines(items)).toEqual(['注意：t0', '注意：t1', '注意：t2', '注意：t3', '注意：ほか 3 件']);
  });
});

describe('狙いの登録と知らせ（指示書 2026-11-12 2-4）', () => {
  const EMPTY: PlanFile = { targets: [], last: {}, round: 0, orderShown: 0 };

  it('書き方を確かめる（知らない書き方は書ける形を添えて失敗、9個以上は失敗）', () => {
    expect(parseTargets('act:build:top, sc:05,bonus:06,plan:PC01')).toEqual(['act:build:top', 'sc:05', 'bonus:6', 'plan:PC01']);
    expect(() => parseTargets('act:nosuch:top')).toThrow(/書ける形/);
    expect(() => parseTargets('sc:99')).toThrow(/書ける形/);
    expect(() => parseTargets(Array.from({ length: 9 }, () => 'sc:05').join(','))).toThrow(/8 個まで/);
  });

  it('他の席が占有・獲得・取得・達成した後の最初の出力に知らせが出て、次の出力には出ない。ラウンドが替わるとスペースの狙いは戻る', async () => {
    // rules.md v0.8 6-2（占有）、9-3、11-2、13-3-4
    await yieldToRunner();
    const seat = 0;
    const counts: Record<string, number> = { act: 0, sc: 0, bonus: 0, plan: 0, round: 0 };
    let walked: ReturnType<typeof walk>['walked'] = [];
    for (const seedNo of [71, 72, 73, 74]) {
      walked = walk(3, seedNo, 5000).walked;
      let plan: PlanFile | null = null;
      for (const { before, after } of walked) {
        // 第1ラウンドの開始時に、すべての占有型スペース・公開中の特別な市民カード・場のボーナスタイル・公開中の計画都市を狙う（8個まで）。
        if (plan === null) {
          if (after.round < 1 || after.phase !== 'play') continue;
          const targets = [
            'act:pioneer:upper',
            'act:migration:upper',
            ...after.scRevealed.map((c) => `sc:${c}`),
            ...after.bonusTilesOnBoard.filter((b) => queries.bonusTileHolder(after, b) === 'board').map((b) => `bonus:${b}`),
          ].slice(0, 8);
          plan = setPlan(after, EMPTY, targets, seat);
          continue;
        }
        const first = planNotice(after, plan, seat);
        const second = planNotice(after, first.plan, seat);
        expect(second.lines).toEqual([]);
        expect(first.lines.length).toBeLessThanOrEqual(3);
        for (const l of first.lines) {
          expect(l).toMatch(/^狙い：/);
          expect(l).not.toContain('：自分');
          expectNoLeak(l, after, seat);
          if (/占有型/.test(l)) counts.act = (counts.act ?? 0) + 1;
          if (/特別な市民カード.*P\d が獲得した/.test(l)) counts.sc = (counts.sc ?? 0) + 1;
          if (/ボーナスタイル.*P\d が持っている/.test(l)) counts.bonus = (counts.bonus ?? 0) + 1;
          if (/位で達成/.test(l)) counts.plan = (counts.plan ?? 0) + 1;
        }
        if (after.round !== before.round && after.round > 1 && after.phase !== 'over') {
          counts.round = (counts.round ?? 0) + 1;
          for (const t of first.plan.targets.filter((x) => x.startsWith('act:'))) expect(targetStatus(after, t, seat)).toBe('空いている');
          expect(first.lines.some((l) => /空いている/.test(l))).toBe(false);
        }
        plan = first.plan;
      }
    }
    expect(counts.act).toBeGreaterThan(0);
    expect(counts.sc).toBeGreaterThan(0);
    expect(counts.bonus).toBeGreaterThan(0);
    expect(counts.round).toBeGreaterThan(0);
    // 計画都市は乱択では達成されにくいため、他の席の達成を書き込んだ写しで、知らせの形を確かめる。
    const last = walked[Math.floor(walked.length / 2)]?.after;
    if (last === undefined) throw new Error('局面がない');
    const id = last.plannedCityRevealed[0];
    if (id === undefined) throw new Error('計画都市がない');
    const planned = setPlan(last, EMPTY, [`plan:${id}`], seat);
    expect(planNotice(last, planned, seat).lines).toEqual([]);
    const claimed = structuredClone(last);
    claimed.plannedCityClaims[id] = [1];
    const notice = planNotice(claimed, planned, seat);
    const rest = queries.plannedCityRemaining(claimed, id);
    expect(notice.lines).toEqual([`狙い：${GAME_DATA.plannedCityCards.find((c) => c.id === id)?.name}（${id}）：P1 が1位で達成（残り ${rest.map((r) => `${r.rank}位${r.points}点`).join('・')}）`]);
    expect(planNotice(claimed, notice.plan, seat).lines).toEqual([]);
    for (const l of planList(last, planned, seat)) expectNoLeak(l, last, seat);
  }, 120_000);

  it('登録・一覧・消去：置き場は記録と同じディレクトリの plan-P<席>.json で、記録には入れない', () => {
    const dir = mkdtempSync(join(tmpdir(), 'plan-'));
    const path = planPath(join(dir, 'game.json'), 1);
    expect(path).toBe(join(dir, 'plan-P1.json'));
    const state = stateOf(newRecord({ playerCount: 3 }, 73));
    expect(readPlan(path).targets).toEqual([]);
    const set = setPlan(state, readPlan(path), parseTargets('act:research:upper,bonus:1'), 1);
    writePlan(path, set);
    expect(readPlan(path).targets).toEqual(['act:research:upper', 'bonus:1']);
    const list = planList(state, readPlan(path), 1);
    expect(list[0]).toBe('P1 の狙い（2個）');
    expect(list[1]).toContain('act:research:upper 研究・上位：空いている');
    writePlan(path, clearPlan(readPlan(path)));
    expect(readPlan(path).targets).toEqual([]);
    expect(planList(state, readPlan(path), 1)[0]).toContain('なし');
  });

  it('手番順の行は、このラウンドの手番順と自分より先に打つ席を出す', () => {
    const { state } = playout(3, 72, 200);
    const line = orderLine(state, 2);
    expect(line).toContain(`第${state.round}ラウンドの手番順 ${state.turnOrder.map((p) => `P${p}`).join('→')}`);
    const before = state.turnOrder.slice(0, state.turnOrder.indexOf(2)).map((p) => `P${p}`).join('・') || 'なし';
    expect(line).toContain(`自分より先：${before}`);
  });
});

describe('出力の行数と非公開情報（指示書 2026-11-12 4）', () => {
  it('既定の move の出力は、注意と知らせを含めて選択肢を除き15行以内である', async () => {
    // rules.md v0.8 19-6-1
    await yieldToRunner();
    const { walked } = walk(3, 31, 5000);
    let maxLines = 0;
    for (const { after, step } of walked) {
      const notices = ['狙い：a', '狙い：b', '狙い：ほか 3 件（plan --seat 0 で一覧）'];
      const text = moveOutput(after, [step], step.player, {}, undefined, notices);
      const lines = text.split('\n');
      const at = lines.findIndex((l) => l.startsWith('== 選択肢'));
      maxLines = Math.max(maxLines, at < 0 ? lines.length : at);
      // 注意の行（選択肢の欄の後）も、視点以外の手札と山札の並びを出さない。
      expectNoLeak(text, after, step.player);
    }
    expect(maxLines).toBeLessThanOrEqual(15);
  }, 300_000);

  it('下見・見込み・resume に、視点以外の手札の内容と山札の順序が現れない', async () => {
    // rules.md v0.8 19-6-1
    await yieldToRunner();
    const { walked } = walk(3, 81, 5000);
    for (const { before, step, record } of walked.filter((_, i) => i % 7 === 0)) {
      const seat = decider(before);
      if (seat === null) continue;
      const text = previewOutput(before, [step.id], seat, record.moves.length);
      expectNoLeak(text, before, seat);
      const cmp = compareOutput(before, [[step.id], ['1']], seat, record.moves.length);
      expectNoLeak(cmp, before, seat);
    }
    const { record, state } = walk(3, 82, 400);
    for (const seat of [0, 1, 2]) expectNoLeak(resumeOutput(state, logSteps(record), seat), state, seat);
  }, 300_000);
});

describe('既存の記録（指示書 2026-11-12 4）', () => {
  it('2026-11-11 のゲーム8の記録は終局まで再生でき、最終得点が README の値と一致する（2026-11-10 の7局は play-cli.test.ts）', () => {
    const readme = readFileSync('docs/playtest/2026-11-11/README.md', 'utf8');
    const row = readme.split('\n').find((l) => l.startsWith('| 平均 |'));
    expect(row).toBeDefined();
    const expected = new Map<number, number>();
    for (const line of readme.split('\n')) {
      const m = /^\| P(\d) \| \S+ \| \S+ \*{0,2}(\d+)/.exec(line);
      if (m !== null) expected.set(Number(m[1]), Number(m[2]));
    }
    expect(expected.size).toBe(3);
    const state = stateOf(readRecord('docs/playtest/2026-11-11/replays/game8.json'));
    expect(isGameOver(state)).toBe(true);
    for (const s of finalScores(state)) expect(s.total).toBe(expected.get(s.player));
    expect(projectedScores(state).scores).toEqual(finalScores(state));
  });
});

describe('運用文書の上限（指示書 2026-11-12 3）', () => {
  const bytes = (path: string): number => readFileSync(path).length;
  it('openings は10人分と draft.md があり、それぞれ1KB 以内。player-brief.md・knowledge-play.md は3KB 以内', () => {
    for (const c of GAME_DATA.characters) expect(bytes(`docs/playtest/openings/${c.id}.md`)).toBeLessThanOrEqual(1024);
    expect(GAME_DATA.characters).toHaveLength(10);
    expect(bytes('docs/playtest/openings/draft.md')).toBeLessThanOrEqual(1024);
    expect(bytes('docs/playtest/player-brief.md')).toBeLessThanOrEqual(3072);
    expect(bytes('docs/playtest/knowledge-play.md')).toBeLessThanOrEqual(3072);
  });
});
