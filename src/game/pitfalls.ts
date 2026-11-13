// 落とし穴の注意（指示書 2026-11-12 対話プレイ強化 2-3、decisions.md 3-6）。
// 過去の対局で実際に失点になった型を1か所にまとめる。型ごとに「どの選択待ちで、どの値を比べるか」を持ち、
// 局面の写しに選択肢を適用した結果を queries の値で前後に比べて求める。ルールは計算しない。
// 先を見せない規則（乱数の消費・非公開情報の公開、history.ts の hiddenFuture）に当たる選択肢は適用せず、注意を出さない。
// 注意は事実（数値とその変化）だけを書き、どの手が良いかの助言を書かない。カードやキャラクターごとの分岐を書かない。

import { GAME_DATA } from '../data/index.ts';
import type { GameData } from '../data/types.ts';
import { buildingCount, usableRegular, usableTemp } from './core.ts';
import { applyMove, getOptions } from './engine.ts';
import { hiddenFuture } from './history.ts';
import { conversionLabel, terrainLabel } from './labels.ts';
import { currentRaidCard, describeRaidOutcomes, natureParkPoints, raidNeed } from './queries.ts';
import { targetOf } from './targets.ts';
import type { GameState, Option, PlayerState, Task } from './types.ts';

export const PITFALL_KINDS = ['natureBreak', 'raidRepel', 'officeConvert', 'passLeftover', 'forcedBuild'] as const;
export type PitfallKind = (typeof PITFALL_KINDS)[number];

export type Pitfall = {
  readonly kind: PitfallKind;
  /**
   * 注意の対象の選択肢 ID（getOptions の順）。いずれも適用して比べた選択肢である。
   * 適用せずに出した注意（最後の襲撃の宣言で、公開中の襲撃カードの文を示すもの）は空にする。
   */
  readonly options: readonly string[];
  readonly text: string;
};

/** 選択肢を1つ（必要なら続けて数個）適用した写し。先を見せない規則に当たれば null。 */
type Apply = (ids: readonly string[], from?: GameState) => GameState | null;

type Context = {
  readonly state: GameState;
  readonly task: Task;
  readonly player: PlayerState;
  readonly options: readonly Option[];
  readonly apply: Apply;
  readonly d: GameData;
};

type Rule = {
  readonly kind: PitfallKind;
  /** 対象の選択待ちの種類。null はすべての選択待ち。 */
  readonly tasks: readonly Task['t'][] | null;
  readonly check: (ctx: Context) => Pitfall[];
};

const playerIn = (state: GameState, index: number): PlayerState | undefined => state.players[index];

const topOf = (state: GameState): Task | undefined => state.stack[state.stack.length - 1];

/** 番号つきの選択肢の一覧（「12・13番」）。 */
const numbers = (ctx: Context, ids: readonly string[]): string =>
  ids.map((id) => ctx.options.findIndex((o) => o.id === id) + 1).filter((n) => n > 0).join('・');

// ---------------------------------------------------------------------------
// 1. 自然公園を崩す：建設・土地タイルの配置で、自然公園の見込み（natureParkPoints）が下がる選択肢
// ---------------------------------------------------------------------------

/** 建設は選んだ建物を確定（done）したときに建つため、確定できるなら確定まで進めた写しで比べる。 */
const settled = (ctx: Context, s: GameState | null): GameState | null => {
  if (s === null) return null;
  const top = topOf(s);
  if (top?.t === 'build' && top.player === ctx.player.index && top.picks.length > 0 && getOptions(s, ctx.d).some((o) => o.id === 'done')) {
    return ctx.apply(['done'], s);
  }
  return s;
};

const natureBreak: Rule = {
  kind: 'natureBreak',
  tasks: ['build', 'placeTiles'],
  check: (ctx) => {
    const base = settled(ctx, ctx.state);
    const before = natureParkPoints(playerIn(base ?? ctx.state, ctx.player.index) ?? ctx.player, ctx.d);
    if (before === 0) return [];
    const drops = new Map<number, { cells: string[]; ids: string[] }>();
    for (const o of ctx.options) {
      const target = targetOf(o);
      if (target?.kind !== 'cell') continue;
      const after = settled(ctx, ctx.apply([o.id]));
      const p = after === null ? undefined : playerIn(after, ctx.player.index);
      if (p === undefined) continue;
      const now = natureParkPoints(p, ctx.d);
      if (now >= before) continue;
      const entry = drops.get(now) ?? { cells: [], ids: [] };
      if (!entry.cells.includes(target.cell)) entry.cells.push(target.cell);
      entry.ids.push(o.id);
      drops.set(now, entry);
    }
    const verb = ctx.task.t === 'build' ? '建てる' : '置く';
    return [...drops].sort(([a], [b]) => a - b).map(([now, e]) => ({
      kind: 'natureBreak',
      options: e.ids,
      text: `${e.cells.join('・')} に${verb}と自然公園 ${before}→${now}点（${numbers(ctx, e.ids)}番）`,
    }));
  },
};

// ---------------------------------------------------------------------------
// 2. 撃退できるのに選ばない：襲撃の宣言で、撃退の選択肢があるとき
// ---------------------------------------------------------------------------

const SNAP_KEYS = [
  ['score', '得点'],
  ['gold', '金'],
  ['materials', '資材'],
  ['goldProduction', '金の生産力'],
  ['materialProduction', '資材の生産力'],
  ['militaryTokens', 'トークン'],
] as const;

const diffText = (before: PlayerState, after: PlayerState): string => {
  const parts = SNAP_KEYS.flatMap(([key, label]) => {
    const n = after[key] - before[key];
    return n === 0 ? [] : [`${label}${n > 0 ? '+' : ''}${n}`];
  });
  const pending = after.pendingLosses.length - before.pendingLosses.length;
  if (pending > 0) parts.push(`次の収入の後に損失${pending}件`);
  return parts.join(' ') || '増減なし';
};

const RAID_NAMES: Readonly<Record<string, string>> = { 'raid:repel': '撃退', 'raid:defense': '防衛', 'raid:none': '宣言なし' };

const raidRepel: Rule = {
  kind: 'raidRepel',
  tasks: ['raidDeclare'],
  check: (ctx) => {
    if (!ctx.options.some((o) => o.id === 'raid:repel')) return [];
    const need = raidNeed(ctx.state, ctx.player);
    const head = `撃退を選べる（軍事力トークン${need.repel}個${ctx.options.some((o) => o.id === 'raid:defense') ? `・防衛は${need.defense}個` : ''}）`;
    const ids = ['raid:repel', 'raid:defense', 'raid:none'].filter((id) => ctx.options.some((o) => o.id === id));
    const results = ids.map((id) => {
      const after = ctx.apply([id]);
      const p = after === null ? undefined : playerIn(after, ctx.player.index);
      return p === undefined ? null : `${RAID_NAMES[id]} ${diffText(ctx.player, p)}`;
    });
    if (results.every((r): r is string => r !== null)) {
      return [{ kind: 'raidRepel', options: ids, text: `${head}。宣言の直後の差：${results.join('／')}` }];
    }
    // 最後の宣言はラウンドの終わり（次の襲撃カードの公開）まで進むため適用しない。公開中の襲撃カードの文で示す。
    const card = currentRaidCard(ctx.state, ctx.d);
    const o = card === null ? null : describeRaidOutcomes(card, ctx.d);
    return [{ kind: 'raidRepel', options: [], text: o === null ? head : `${head}。撃退成功 ${o.repelled}／防衛成功 ${o.defended}／防衛失敗 ${o.defenseFailed}` }];
  },
};

// ---------------------------------------------------------------------------
// 3. 役所の変換が出なくなる：福祉で臨時ワーカーの人数を選ぶ場面
// ---------------------------------------------------------------------------

/** 福祉の処理を、組の選択（actionChoice）を1つ選んだところまで進め、役所の変換（welfareConvert）が積まれたか。 */
const convertOffered = (ctx: Context, s: GameState | null): boolean | null => {
  if (s === null) return null;
  const has = (x: GameState): boolean => x.stack.some((t) => t.t === 'welfareConvert' && t.player === ctx.player.index);
  if (has(s)) return true;
  const top = topOf(s);
  if (top?.t === 'actionChoice' && top.action === 'welfare' && top.player === ctx.player.index) {
    const first = getOptions(s, ctx.d)[0];
    const next = first === undefined ? null : ctx.apply([first.id], s);
    return next === null ? null : has(next);
  }
  return false;
};

const officeConvert: Rule = {
  kind: 'officeConvert',
  tasks: ['payWorkers'],
  check: (ctx) => {
    const task = ctx.task;
    if (task.t !== 'payWorkers' || !task.target.startsWith('act:welfare')) return [];
    if (buildingCount(ctx.player, 'office') === 0 || usableTemp(ctx.player) === 0) return [];
    const lost = ctx.options.filter((o) => convertOffered(ctx, ctx.apply([o.id])) === false);
    if (lost.length === 0 || lost.length === ctx.options.length) return [];
    const temps = lost.map((o) => Number(o.id.slice('temp:'.length)));
    const rate = ctx.d.params.buildings.effects.office.welfareConvertMaterialsByCount[buildingCount(ctx.player, 'office')] ?? 0;
    return [{
      kind: 'officeConvert',
      options: lost.map((o) => o.id),
      text: `臨時ワーカーを${temps.join('・')}人使うと、変換に使える臨時ワーカーが残らず役所の変換（臨時ワーカー1→資材${rate}）が出ない（${numbers(ctx, lost.map((o) => o.id))}番）`,
    }];
  },
};

// ---------------------------------------------------------------------------
// 4. 残したままのパス：使えるワーカーが残っているときのパス
// ---------------------------------------------------------------------------

const passLeftover: Rule = {
  kind: 'passLeftover',
  tasks: ['turn'],
  check: (ctx) => {
    if (!ctx.options.some((o) => o.id === 'pass')) return [];
    const regular = usableRegular(ctx.player);
    const temp = usableTemp(ctx.player);
    const lastRound = ctx.state.round >= ctx.d.params.rounds;
    const out: Pitfall[] = [];
    if (regular + temp > 0) {
      out.push({ kind: 'passLeftover', options: ['pass'], text: `パスすると通常ワーカー${regular}人・臨時ワーカー${temp}人が使われずに残る` });
    }
    if (lastRound) {
      const convs = ctx.d.params.freeActions.conversions.filter((c) => ctx.options.some((o) => o.id === `free:${c.id}` || o.id.startsWith(`free:${c.id}:`)));
      const parts = [
        `最終ラウンド：金${ctx.player.gold}・資材${ctx.player.materials}は終了時に得点にならない`,
        convs.length > 0 ? `まだ使える変換 ${convs.map((c) => conversionLabel(c).replace(/^フリーアクション：/, '')).join('、')}` : '',
      ].filter((x) => x !== '');
      if (ctx.player.gold + ctx.player.materials > 0 || convs.length > 0) out.push({ kind: 'passLeftover', options: ['pass'], text: parts.join('。') });
    }
    return out;
  },
};

// ---------------------------------------------------------------------------
// 5. 強制の建設：到達報酬などで、選ばずに済ませられない建設が次に入る選択肢
// ---------------------------------------------------------------------------

/** 効果で積まれた建設（アクションの建設ではなく、1軒は建てる）の数。 */
const forcedBuilds = (s: GameState, player: number): Task[] =>
  s.stack.filter((t) => t.t === 'build' && t.player === player && t.spec.tier === null && t.spec.min >= 1);

const forcedBuild: Rule = {
  kind: 'forcedBuild',
  tasks: null,
  check: (ctx) => {
    if (ctx.task.t === 'draftPick') return [];
    const before = forcedBuilds(ctx.state, ctx.player.index).length;
    const byText = new Map<string, string[]>();
    for (const o of ctx.options) {
      const after = ctx.apply([o.id]);
      if (after === null) continue;
      const added = forcedBuilds(after, ctx.player.index).slice(before);
      for (const t of added) {
        if (t.t !== 'build') continue;
        const where = t.spec.terrain === null ? '' : `${terrainLabel(t.spec.terrain)}へ`;
        const what = !t.spec.payGold && !t.spec.payMaterials ? '無料建設' : '建設（コストを払う）';
        const text = `次に${where}${what}が入る（選ばずに済ませられない）`;
        byText.set(text, [...(byText.get(text) ?? []), o.id]);
      }
    }
    return [...byText].map(([text, ids]) => ({ kind: 'forcedBuild', options: ids, text: `${numbers(ctx, ids)}番：${text}` }));
  },
};

/** 型の一覧。表示はこの順に並べる。 */
export const PITFALL_RULES: readonly Rule[] = [natureBreak, raidRepel, officeConvert, passLeftover, forcedBuild];

/**
 * いまの選択待ちに対する注意。選択待ちがない・終局した局面では空。
 * 選択肢を適用した写しのうち、乱数を消費した・非公開情報を公開したもの（hiddenFuture）は比べない。
 */
export const pitfalls = (state: GameState, d: GameData = GAME_DATA): Pitfall[] => {
  const task = topOf(state);
  if (task === undefined || state.phase === 'over' || !('player' in task)) return [];
  const player = playerIn(state, task.player);
  if (player === undefined) return [];
  const options = getOptions(state, d);
  if (options.length === 0) return [];
  const cache = new Map<string, GameState | null>();
  const apply: Apply = (ids, from = state) => {
    let s: GameState | null = from;
    for (const id of ids) {
      if (s === null) return null;
      const prev: GameState = s;
      const key = from === state && ids.length === 1 ? id : null;
      if (key !== null && cache.has(key)) return cache.get(key) ?? null;
      let next: GameState | null;
      try {
        next = getOptions(prev, d).some((o) => o.id === id) ? applyMove(prev, id, d) : null;
      } catch {
        next = null;
      }
      if (next !== null && hiddenFuture(prev, next) !== null) next = null;
      if (key !== null) cache.set(key, next);
      s = next;
    }
    return s;
  };
  const ctx: Context = { state, task, player, options, apply, d };
  return PITFALL_RULES.filter((r) => r.tasks === null || r.tasks.includes(task.t)).flatMap((r) => r.check(ctx));
};

/** 注意の行（1回の出力で max 行まで、越える分は「ほか N 件」）。 */
export const pitfallLines = (items: readonly Pitfall[], max = 5): string[] => {
  if (items.length <= max) return items.map((p) => `注意：${p.text}`);
  return [...items.slice(0, max - 1).map((p) => `注意：${p.text}`), `注意：ほか ${items.length - (max - 1)} 件`];
};
