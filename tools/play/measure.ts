// 対話プレイの出力量の計測（指示書 2026-11-11 2-7）。記録を先頭から再生し、各席が「自分の選択のたびに move を1回、
// 番が回ってくるたびに wait を1回」呼んだと仮定したときの、席ごとの出力の合計文字数と行数を、従来の形（--full）と
// 新しい既定の形の両方で数える。2026-11-10 の打ち手の多くが使った --brief の形も参考に数える。実際の打ち手の呼び出し方とは一致しない近似である。

import { GAME_DATA, type GameData } from '../../src/data/index.ts';
import { applyMove, createGame, type GameState } from '../../src/game/index.ts';
import { compactShow, moveOutput, turnLines } from './compact.ts';
import { stepFrom, type PlayRecord, type Step } from './record.ts';
import { renderShow, renderSteps } from './render.ts';

type Tally = { calls: number; fullChars: number; fullLines: number; briefChars: number; newChars: number; newLines: number };

const count = (t: Tally, full: string, brief: string, compact: string): void => {
  t.calls += 1;
  t.fullChars += full.length;
  t.briefChars += brief.length;
  t.fullLines += full.split('\n').length;
  t.newChars += compact.length;
  t.newLines += compact.split('\n').length;
};

export type MeasureResult = { readonly seats: readonly (Tally & { readonly seat: number; readonly moves: number; readonly waits: number })[] };

export const measureRecord = (record: PlayRecord, d: GameData = GAME_DATA): MeasureResult => {
  const n = record.config.playerCount;
  const tallies: Tally[] = Array.from({ length: n }, () => ({ calls: 0, fullChars: 0, fullLines: 0, briefChars: 0, newChars: 0, newLines: 0 }));
  const moves = Array.from({ length: n }, () => 0);
  const waits = Array.from({ length: n }, () => 0);
  const lastOwn = Array.from({ length: n }, () => -1);
  const steps: Step[] = [];
  let state: GameState = createGame(record.config, record.seed, d);
  record.moves.forEach((move, i) => {
    const before = state;
    const next = applyMove(before, move, d);
    const step = stepFrom(before, next, i + 1, move, d);
    const seat = step.player;
    const t = tallies[seat];
    if (t === undefined) throw new Error(`席がない：${seat}`);
    // 番が回ってきた（直前の手が他の席）なら wait を1回。
    const previous = steps[steps.length - 1];
    if (previous === undefined || previous.player !== seat) {
      const since = steps.slice((lastOwn[seat] ?? -1) + 1);
      const shown = since.slice(-40);
      const head = since.length === 0 ? '' : `== 前回の選択の後に起きたこと\n${renderSteps(before, shown, d)}\n\n`;
      const full = `${head}${renderShow(before, { as: seat }, d)}`;
      const brief = `${head}${renderShow(before, { as: seat, brief: true }, d)}`;
      const compact = compactShow(before, { as: seat }, d, turnLines(before, since, seat, d)).join('\n');
      count(t, full, brief, compact);
      waits[seat] = (waits[seat] ?? 0) + 1;
    }
    const full = `${renderSteps(next, [step], d)}\n\n${renderShow(next, { as: seat }, d)}`;
    const brief = `${renderSteps(next, [step], d)}\n\n${renderShow(next, { as: seat, brief: true }, d)}`;
    count(t, full, brief, moveOutput(next, [step], seat, {}, d));
    moves[seat] = (moves[seat] ?? 0) + 1;
    steps.push(step);
    lastOwn[seat] = steps.length - 1;
    state = next;
  });
  return { seats: tallies.map((t, seat) => ({ ...t, seat, moves: moves[seat] ?? 0, waits: waits[seat] ?? 0 })) };
};

const ratio = (a: number, b: number): string => (b === 0 ? '-' : (a / b).toFixed(2));

export const measure = (record: PlayRecord, d: GameData = GAME_DATA): string => {
  const { seats } = measureRecord(record, d);
  const total = seats.reduce(
    (acc, s) => ({
      fullChars: acc.fullChars + s.fullChars,
      fullLines: acc.fullLines + s.fullLines,
      briefChars: acc.briefChars + s.briefChars,
      newChars: acc.newChars + s.newChars,
      newLines: acc.newLines + s.newLines,
    }),
    { fullChars: 0, fullLines: 0, briefChars: 0, newChars: 0, newLines: 0 },
  );
  return [
    `記録：${record.moves.length}手、${record.config.playerCount}人`,
    '席 | move回数 | wait回数 | 従来の文字数 | 従来の行数 | 従来（--brief）の文字数 | 新しい文字数 | 新しい行数 | 文字数の比 | 行数の比 | --brief との文字数の比',
    ...seats.map(
      (s) =>
        `P${s.seat} | ${s.moves} | ${s.waits} | ${s.fullChars} | ${s.fullLines} | ${s.briefChars} | ${s.newChars} | ${s.newLines} | ${ratio(s.newChars, s.fullChars)} | ${ratio(s.newLines, s.fullLines)} | ${ratio(s.newChars, s.briefChars)}`,
    ),
    `計 | | | ${total.fullChars} | ${total.fullLines} | ${total.briefChars} | ${total.newChars} | ${total.newLines} | ${ratio(total.newChars, total.fullChars)} | ${ratio(total.newLines, total.fullLines)} | ${ratio(total.newChars, total.briefChars)}`,
    '注：各席が自分の選択のたびに move を1回、番が回ってくるたびに wait を1回呼んだと仮定した近似であり、実際の打ち手の呼び出し方とは一致しない。',
  ].join('\n');
};
