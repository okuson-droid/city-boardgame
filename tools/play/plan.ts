// 狙いの登録と、先を越されたときの知らせ（plan、指示書 2026-11-12 対話プレイ強化 2-4、decisions.md 3-6）。
// 打ち手が狙い（アクションスペース・公開中の特別な市民カード・ボーナスタイル・計画都市）を登録し、
// wait・move・resume の出力で、前回の出力から状態が変わった狙いだけを知らせる。
// 置き場は記録と同じディレクトリの plan-P<席>.json で、記録（ReplayRecord）には入れない。
// 状態は公開情報だけから求める（queries.spaceUsers・specialCitizenHolder・bonusTileHolder・plannedCityClaimers）。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ACTIONS, GAME_DATA, TIERS, type Action, type GameData, type Tier } from '../../src/data/index.ts';
import { queries, type GameState } from '../../src/game/index.ts';
import { effectiveRound } from './compact.ts';
import { PlayError } from './record.ts';

export const MAX_TARGETS = 8;
export const MAX_NOTICE_LINES = 3;

export type PlanFile = {
  readonly targets: readonly string[];
  /** 狙いごとの、前回知らせた（または登録した）ときの状態の文。 */
  readonly last: Readonly<Record<string, string>>;
  /** 前回の出力のラウンド（ラウンドが替わったら、アクションスペースの狙いを知らせずに戻す）。 */
  readonly round: number;
  /** 手番順を出したラウンド（ラウンドの最初の wait に1回だけ出す）。 */
  readonly orderShown: number;
};

const EMPTY: PlanFile = { targets: [], last: {}, round: 0, orderShown: 0 };

export const planPath = (recordPath: string, seat: number): string => join(dirname(recordPath), `plan-P${seat}.json`);

export const readPlan = (path: string): PlanFile => {
  if (!existsSync(path)) return EMPTY;
  try {
    const v = JSON.parse(readFileSync(path, 'utf8')) as Partial<PlanFile>;
    return {
      targets: Array.isArray(v.targets) ? v.targets.filter((t): t is string => typeof t === 'string') : [],
      last: typeof v.last === 'object' && v.last !== null ? v.last : {},
      round: typeof v.round === 'number' ? v.round : 0,
      orderShown: typeof v.orderShown === 'number' ? v.orderShown : 0,
    };
  } catch {
    return EMPTY;
  }
};

export const writePlan = (path: string, plan: PlanFile): void => {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(plan, null, 2)}\n`);
  renameSync(temp, path);
};

const FORMS = 'act:<アクション>:<段階>（アクション：' + ACTIONS.join('・') + '、段階：' + TIERS.join('・') + '）・sc:<特別な市民カードの番号>・bonus:<ボーナスタイルの番号>・plan:<計画都市の番号>';

/** 狙いの書き方を確かめて正規化する。知らない書き方は、書ける形を添えて失敗する。 */
export const parseTargets = (spec: string, d: GameData = GAME_DATA): string[] => {
  const items = spec.split(',').map((s) => s.trim()).filter((s) => s !== '');
  if (items.length === 0) throw new PlayError(`狙いが空である（書ける形：${FORMS}）`);
  if (items.length > MAX_TARGETS) throw new PlayError(`狙いは ${MAX_TARGETS} 個までである：${items.length}個`);
  return items.map((item) => {
    const [kind, a, b, ...rest] = item.split(':');
    const bad = (): PlayError => new PlayError(`知らない狙いの書き方である：${item}（書ける形：${FORMS}）`);
    if (rest.length > 0) throw bad();
    switch (kind) {
      case 'act':
        if (!(ACTIONS as readonly string[]).includes(a ?? '') || !(TIERS as readonly string[]).includes(b ?? '')) throw bad();
        return item;
      case 'sc':
        if (b !== undefined || !d.specialCitizens.some((c) => c.id === a)) throw bad();
        return item;
      case 'bonus':
        if (b !== undefined || !/^\d+$/.test(a ?? '') || !d.bonusTiles.some((t) => t.id === Number(a))) throw bad();
        return `bonus:${Number(a)}`;
      case 'plan':
        if (b !== undefined || !d.plannedCityCards.some((c) => c.id === a)) throw bad();
        return item;
      default:
        throw bad();
    }
  });
};

/** 狙いの名前（表示用）。 */
export const targetName = (target: string, d: GameData = GAME_DATA): string => {
  const [kind, a, b] = target.split(':');
  switch (kind) {
    case 'act':
      return `${queries.actionLabel(a as Action)}・${queries.tierLabel(b as Tier)}`;
    case 'sc':
      return `特別な市民カード${a}`;
    case 'bonus':
      return `ボーナスタイル${a}`;
    case 'plan':
      return `${d.plannedCityCards.find((c) => c.id === a)?.name ?? a}（${a}）`;
    default:
      return target;
  }
};

/** 狙いのいまの状態を1つだけ示す文。 */
export const targetStatus = (state: GameState, target: string, seat: number, d: GameData = GAME_DATA): string => {
  const [kind, a, b] = target.split(':');
  switch (kind) {
    case 'act': {
      const action = a as Action;
      const tier = b as Tier;
      const users = queries.spaceUsers(state, action, tier);
      if (users.includes(seat)) return '自分が使った';
      if (queries.isSharedSpace(action, tier, d)) return '共有で使える';
      const other = users[0];
      return other === undefined ? '空いている' : `P${other} が置いた（占有型でこのラウンドは使えない）`;
    }
    case 'sc': {
      const holder = queries.specialCitizenHolder(state, a ?? '');
      if (holder === 'revealed') return '公開中';
      if (holder === null) return '公開されていない';
      return holder === seat ? '自分が獲得した' : `P${holder} が獲得した`;
    }
    case 'bonus': {
      const holder = queries.bonusTileHolder(state, Number(a));
      if (holder === 'board') return '場にある';
      if (holder === null) return '場にない';
      return holder === seat ? '自分が持っている' : `P${holder} が持っている`;
    }
    case 'plan': {
      const id = a ?? '';
      const claimers = queries.plannedCityClaimers(state, id);
      if (claimers.includes(seat)) return '自分が達成';
      if (claimers.length === 0) {
        const open = state.plannedCityRevealed.includes(id) || (state.players[seat]?.privatePlannedCities.includes(id) ?? false);
        return open ? '未達成' : '公開されていない';
      }
      const rest = queries.plannedCityRemaining(state, id, d);
      const ranks = claimers.map((p, i) => `P${p} が${i + 1}位`).join('・');
      return `${ranks}で達成（残り ${rest.map((r) => `${r.rank}位${r.points}点`).join('・') || 'なし'}）`;
    }
    default:
      return '';
  }
};

const isAction = (target: string): boolean => target.startsWith('act:');

export type Notice = { readonly lines: string[]; readonly plan: PlanFile };

/**
 * 前回の出力から状態が変わった狙いの行（3行まで、越える分は「ほか N 件」）と、更新した記録。
 * ラウンドが替わったら、アクションスペースの狙いは知らせずにいまの状態（空いている）に戻す。
 */
export const planNotice = (state: GameState, plan: PlanFile, seat: number, d: GameData = GAME_DATA): Notice => {
  const round = effectiveRound(state);
  const newRound = round !== plan.round;
  const last: Record<string, string> = { ...plan.last };
  const changed: string[] = [];
  for (const target of plan.targets) {
    const now = targetStatus(state, target, seat, d);
    const was = last[target];
    last[target] = now;
    if (was === now) continue;
    if (newRound && isAction(target) && now === '空いている') continue;
    // 自分の手で変わった状態（自分が使った・獲得した）は知らせない（記録だけ更新する）。
    if (now.startsWith('自分')) continue;
    changed.push(`${targetName(target, d)}：${now}`);
  }
  const lines =
    changed.length <= MAX_NOTICE_LINES
      ? changed.map((c) => `狙い：${c}`)
      : [...changed.slice(0, MAX_NOTICE_LINES - 1).map((c) => `狙い：${c}`), `狙い：ほか ${changed.length - (MAX_NOTICE_LINES - 1)} 件（plan --seat ${seat} で一覧）`];
  return { lines, plan: { ...plan, last, round } };
};

/** 一覧（plan --seat N）。 */
export const planList = (state: GameState, plan: PlanFile, seat: number, d: GameData = GAME_DATA): string[] =>
  plan.targets.length === 0
    ? [`P${seat} の狙い：なし（plan --seat ${seat} --set <狙い,...> で登録する）`]
    : [`P${seat} の狙い（${plan.targets.length}個）`, ...plan.targets.map((t) => `  ${t} ${targetName(t, d)}：${targetStatus(state, t, seat, d)}`)];

/** 登録（上書き）。いまの状態を「知らせ済み」として持つ。 */
export const setPlan = (state: GameState, plan: PlanFile, targets: readonly string[], seat: number, d: GameData = GAME_DATA): PlanFile => ({
  ...plan,
  targets,
  last: Object.fromEntries(targets.map((t) => [t, targetStatus(state, t, seat, d)])),
  round: effectiveRound(state),
});

export const clearPlan = (plan: PlanFile): PlanFile => ({ ...plan, targets: [], last: {} });

/** このラウンドの手番順と、自分より先に打つ席（resume と、ラウンドの最初の wait）。 */
export const orderLine = (state: GameState, seat: number): string | null => {
  if (state.round < 1 || state.phase === 'over') return null;
  const order = state.turnOrder;
  const before = order.slice(0, Math.max(0, order.indexOf(seat)));
  return `第${state.round}ラウンドの手番順 ${order.map((p) => `P${p}`).join('→')}（自分より先：${before.map((p) => `P${p}`).join('・') || 'なし'}）`;
};
