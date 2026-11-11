// 手の下見（move --dry-run、指示書 2026-11-12 対話プレイ強化 2-2）。
// 指定した選択肢を局面の写しに順に適用し、記録を変えずに、起きた出来事・自分の増減・得点の見込みの増減・残る選択待ちを出す。
// 先を見せない規則：乱数を消費する・非公開情報が公開される選択（hiddenFuture）の手前で止め、選択待ちが他の席に移った後は適用しない。
// ルールは計算しない。進行は applyMove、見込みは projectedScores、増減は deltas.ts の snapshot の差だけから得る。

import { GAME_DATA, SCORE_AXES, type GameData } from '../../src/data/index.ts';
import { DELTA_KEYS, snapshot } from '../../src/game/deltas.ts';
import { applyMove, decider, deltaText, hiddenFuture, projectedScores, queries, type GameState } from '../../src/game/index.ts';
import { stepLines } from './compact.ts';
import { PlayError, resolveSpec, stepFrom, type Step } from './record.ts';

/** 1つの手順の下見の結果。 */
export type Preview = {
  readonly specs: readonly string[];
  readonly steps: readonly Step[];
  readonly start: GameState;
  readonly end: GameState;
  /** 途中で止めた理由（何個目の手前か）。最後まで適用できたら null。 */
  readonly stopped: string | null;
  /** 途中で選べない選択肢があった（その旨と何個目か）。あれば下見は無効。 */
  readonly failed: string | null;
};

const HIDDEN_REASON: Readonly<Record<'random' | 'reveal', string>> = {
  random: '乱数を消費する',
  reveal: '非公開の情報が公開される',
};

/** 1つの手順を写しに適用する。seat は下見する席（選択待ちがその席でなければ適用しない）。 */
export const previewSequence = (state: GameState, specs: readonly string[], seat: number, startIndex: number, d: GameData = GAME_DATA): Preview => {
  let current = state;
  const steps: Step[] = [];
  for (const [i, spec] of specs.entries()) {
    const nth = `${i + 1}個目`;
    const deciding = decider(current);
    if (deciding !== seat) {
      return { specs, steps, start: state, end: current, stopped: `${nth}（${spec}）の手前で止めた：選択待ちが P${deciding ?? '-'} に移った（他の席の手は下見しない）`, failed: null };
    }
    let id: string;
    try {
      id = resolveSpec(current, spec, d);
    } catch (e) {
      return { specs, steps, start: state, end: current, stopped: null, failed: `${nth}（${spec}）は選べない：${e instanceof Error ? e.message : String(e)}` };
    }
    const next = applyMove(current, id, d);
    const hidden = hiddenFuture(current, next);
    if (hidden !== null) {
      return { specs, steps, start: state, end: current, stopped: `${nth}（${spec}）からは下見できない（${HIDDEN_REASON[hidden]}）`, failed: null };
    }
    steps.push(stepFrom(current, next, startIndex + steps.length + 1, id, d));
    current = next;
  }
  return { specs, steps, start: state, end: current, stopped: null, failed: null };
};

/** 自分の資源・ワーカー・トラック・得点トラック・手札の枚数の増減の合計。 */
export const resourceDelta = (start: GameState, end: GameState, seat: number): string => {
  const before = snapshot(start)[seat];
  const after = snapshot(end)[seat];
  if (before === undefined || after === undefined) return '';
  const changes: Record<string, number> = {};
  for (const key of DELTA_KEYS) {
    const n = after[key] - before[key];
    if (n !== 0) changes[key] = n;
  }
  return deltaText(changes) || '増減なし';
};

/** 得点の見込み（終了時の能力を含む）の増減と、評価軸ごとの内訳。 */
export const projectionDelta = (start: GameState, end: GameState, seat: number, d: GameData = GAME_DATA): string => {
  const before = projectedScores(start, d).scores.find((s) => s.player === seat);
  const after = projectedScores(end, d).scores.find((s) => s.player === seat);
  if (before === undefined || after === undefined) return '';
  const diff = after.total - before.total;
  const parts = [
    ...(after.base !== before.base ? [`基礎${signed(after.base - before.base)}`] : []),
    ...SCORE_AXES.flatMap((axis) => {
      const n = after.axes[axis] - before.axes[axis];
      return n === 0 ? [] : [`${queries.axisLabel(axis)}${signed(n)}`];
    }),
  ];
  return `${before.total}→${after.total}（${signed(diff)}${parts.length > 0 ? `：${parts.join(' ')}` : ''}）`;
};

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

/** 適用後に残る選択待ちの見出し（選択肢の一覧は出さない）。 */
const pendingLine = (end: GameState, seat: number): string => {
  const deciding = decider(end);
  if (end.phase === 'over') return '適用後：ゲーム終了';
  if (deciding === null) return '適用後：選択待ちなし';
  return deciding === seat ? `適用後に残る選択待ち：${queries.sceneOf(end).heading}` : `適用後：選択待ちは P${deciding}`;
};

/** --dry-run の出力（1通り）。 */
export const previewOutput = (state: GameState, specs: readonly string[], seat: number, startIndex: number, d: GameData = GAME_DATA): string => {
  const p = previewSequence(state, specs, seat, startIndex, d);
  if (p.failed !== null && p.steps.length === 0) throw new PlayError(p.failed);
  return [
    `== 下見（記録は変えていない。${p.steps.length}/${specs.length}個を適用）`,
    ...stepLines(p.end, p.steps, seat, d),
    ...(p.failed === null ? [] : [`下見を止めた：${p.failed}`]),
    ...(p.stopped === null ? [] : [`ここから先は下見できない：${p.stopped}`]),
    `増減: ${resourceDelta(p.start, p.end, seat)}`,
    `見込み: ${projectionDelta(p.start, p.end, seat, d)}`,
    pendingLine(p.end, seat),
  ].join('\n');
};

/** --or で並べた手順の比べ（最大4通り）。出来事は省き、手順ごとに増減と見込みを1行ずつ出す。 */
export const MAX_ALTERNATIVES = 4;

export const compareOutput = (state: GameState, sequences: readonly (readonly string[])[], seat: number, startIndex: number, d: GameData = GAME_DATA): string => {
  if (sequences.length > MAX_ALTERNATIVES) throw new PlayError(`--or で比べられるのは ${MAX_ALTERNATIVES} 通りまでである：${sequences.length}`);
  const lines = [`== 下見の比べ（記録は変えていない。${sequences.length}通り）`];
  sequences.forEach((specs, i) => {
    const head = `案${i + 1} ${specs.join(' ')}`;
    if (specs.length === 0) {
      lines.push(`${head}: 手順が空である`);
      return;
    }
    const p = previewSequence(state, specs, seat, startIndex, d);
    if (p.failed !== null) {
      lines.push(`${head}: ${p.failed}`);
      return;
    }
    lines.push(`${head}${p.stopped === null ? '' : `（${p.steps.length}個まで。${p.stopped}）`}`);
    lines.push(`  増減: ${resourceDelta(p.start, p.end, seat)}`);
    lines.push(`  見込み: ${projectionDelta(p.start, p.end, seat, d)}｜${pendingLine(p.end, seat)}`);
  });
  return lines.join('\n');
};
