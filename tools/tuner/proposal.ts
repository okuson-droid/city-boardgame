// 調整案（指示書 3-5）。元データ（src/data/）の写しを編集し、元の値と新しい値の組を変更点として持つ。
// 画面に依存しない関数だけを置き、単体テストで確かめる。

import { checkGameData, DataValidationError, parseGameData, rawFromFiles, type DataFiles, type DataIssue } from '../../src/data/index.ts';

export type Path = readonly (string | number)[];

/** 変更点。before・after は JSON の値である。 */
export type Change = { readonly file: string; readonly path: Path; readonly before: unknown; readonly after: unknown };

export type Proposal = {
  readonly format: 'city-boardgame-proposal';
  readonly version: 1;
  readonly name: string;
  /** 作成日（YYYY-MM-DD）。 */
  readonly createdAt: string;
  readonly changes: readonly Change[];
};

export class ProposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProposalError';
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const deepEqual = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const clone = <T>(v: T): T => (v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T));

export const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

export const createProposal = (name: string, now: Date = new Date()): Proposal => ({
  format: 'city-boardgame-proposal',
  version: 1,
  name,
  createdAt: formatDate(now),
  changes: [],
});

// ---------------------------------------------------------------------------
// 値の読み書き
// ---------------------------------------------------------------------------

export const getAt = (value: unknown, path: Path): unknown => {
  let current = value;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === 'number') current = current[key];
    else if (isObject(current) && typeof key === 'string') current = current[key];
    else return undefined;
  }
  return current;
};

/** path の値を置き換えた写しを返す。元の値は変更しない。 */
export const setAt = (value: unknown, path: Path, next: unknown): unknown => {
  const [head, ...rest] = path;
  if (head === undefined) return clone(next);
  if (Array.isArray(value) && typeof head === 'number') {
    const copy = [...value];
    copy[head] = setAt(value[head], rest, next);
    return copy;
  }
  if (isObject(value) && typeof head === 'string') {
    return { ...value, [head]: setAt(value[head], rest, next) };
  }
  throw new ProposalError(`値を置けない位置である：${path.join('.')}`);
};

export const setInFiles = (files: DataFiles, file: string, path: Path, next: unknown): DataFiles => ({
  ...files,
  [file]: setAt(files[file], path, next),
});

// ---------------------------------------------------------------------------
// 差分と適用
// ---------------------------------------------------------------------------

/**
 * 値の差分を末端の単位で求める。配列の長さやオブジェクトの項目が変わった場合は、その配列・オブジェクト全体を1つの変更とする。
 */
const diffValue = (file: string, path: Path, before: unknown, after: unknown, out: Change[]): void => {
  if (deepEqual(before, after)) return;
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length) {
    before.forEach((b, i) => diffValue(file, [...path, i], b, after[i], out));
    return;
  }
  if (isObject(before) && isObject(after)) {
    const keysB = Object.keys(before).sort();
    const keysA = Object.keys(after).sort();
    if (deepEqual(keysB, keysA)) {
      for (const key of keysB) diffValue(file, [...path, key], before[key], after[key], out);
      return;
    }
  }
  out.push({ file, path, before: clone(before) ?? null, after: clone(after) ?? null });
};

export const diffFiles = (base: DataFiles, work: DataFiles): Change[] => {
  const out: Change[] = [];
  const names = [...new Set([...Object.keys(base), ...Object.keys(work)])].sort();
  for (const name of names) {
    if (!(name in work)) throw new ProposalError(`調整案にファイルがない：${name}`);
    if (!(name in base)) throw new ProposalError(`元データにないファイルである：${name}`);
    diffValue(name, [], base[name], work[name], out);
  }
  return out;
};

/** 作業中の写しから、変更点を持つ調整案を作る。 */
export const proposalFromWork = (meta: Pick<Proposal, 'name' | 'createdAt'>, base: DataFiles, work: DataFiles): Proposal => ({
  format: 'city-boardgame-proposal',
  version: 1,
  name: meta.name,
  createdAt: meta.createdAt,
  changes: diffFiles(base, work),
});

/**
 * 変更点を元データに適用する。元の値（before）が元データと食い違う変更点は適用せず、conflicts に返す
 * （調整案を作った後に元データが変わった場合）。
 */
export const applyChanges = (base: DataFiles, changes: readonly Change[]): { files: DataFiles; conflicts: Change[] } => {
  let files = base;
  const conflicts: Change[] = [];
  for (const change of changes) {
    if (!(change.file in base)) {
      conflicts.push(change);
      continue;
    }
    const current = getAt(base[change.file], change.path);
    if (!deepEqual(current ?? null, change.before)) {
      conflicts.push(change);
      continue;
    }
    files = setInFiles(files, change.file, change.path, change.after);
  }
  return { files, conflicts };
};

/**
 * ブラウザに保つ作業中の写し（2026-11-09 から）。データ一式ではなく、作ったときの元データの版と変更点の列で持つ。
 * データ一式で持つと、写しを保存した後に元データが更新されたとき、更新前の値が「変更点」に見えて
 * 元データの更新を打ち消してしまう（最上位のワーカー数が 2 から 3 に戻った、2026-11-09）。
 */
export type StoredWork = {
  readonly format: 'tuner-work';
  readonly version: 2;
  /** 写しを作ったときの元データの版（DATA_VERSION）。 */
  readonly baseVersion: string;
  readonly changes: readonly Change[];
};

export const storeWork = (base: DataFiles, work: DataFiles, baseVersion: string): StoredWork => ({
  format: 'tuner-work',
  version: 2,
  baseVersion,
  changes: diffFiles(base, work),
});

const isStoredWork = (value: unknown): value is StoredWork =>
  typeof value === 'object' && value !== null && (value as { format?: unknown }).format === 'tuner-work' && Array.isArray((value as { changes?: unknown }).changes);

/**
 * 保った写しを、いまの元データに当て直す。
 * - 変更点の列で持つ写し：変更点を当て直す。元データが更新され元の値が食い違う変更点は当てずに conflicts に返す。
 * - 以前のデータ一式の写し（legacy）：どの値が利用者の変更か分からないため当てず、元データから始める。
 */
export const restoreWork = (
  base: DataFiles,
  baseVersion: string,
  stored: unknown,
): { files: DataFiles; conflicts: Change[]; rebased: boolean; legacy: DataFiles | null } => {
  if (stored === null || stored === undefined) return { files: base, conflicts: [], rebased: false, legacy: null };
  if (isStoredWork(stored)) {
    const { files, conflicts } = applyChanges(base, stored.changes);
    return { files, conflicts, rebased: stored.baseVersion !== baseVersion, legacy: null };
  }
  return { files: base, conflicts: [], rebased: false, legacy: typeof stored === 'object' ? (stored as DataFiles) : null };
};

/** 変更点を1つ取り消す（元の値に戻す）。 */
export const revertChange = (work: DataFiles, change: Change): DataFiles => setInFiles(work, change.file, change.path, change.before);

// ---------------------------------------------------------------------------
// 保存と読み込み
// ---------------------------------------------------------------------------

export const serializeProposal = (proposal: Proposal): string => `${JSON.stringify(proposal, null, 2)}\n`;

export const parseProposal = (text: string): Proposal => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ProposalError('JSON として読めない');
  }
  if (!isObject(value) || value['format'] !== 'city-boardgame-proposal') throw new ProposalError('調整案のファイルではない');
  if (value['version'] !== 1) throw new ProposalError(`対応していない版である：${String(value['version'])}`);
  const name = value['name'];
  const createdAt = value['createdAt'];
  const changes = value['changes'];
  if (typeof name !== 'string' || typeof createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(createdAt)) {
    throw new ProposalError('名前または作成日がない');
  }
  if (!Array.isArray(changes)) throw new ProposalError('変更点の一覧がない');
  const parsed: Change[] = changes.map((c: unknown, i) => {
    if (!isObject(c) || typeof c['file'] !== 'string' || !Array.isArray(c['path'])) {
      throw new ProposalError(`変更点 ${i} の形が違う`);
    }
    const path = c['path'] as unknown[];
    if (!path.every((k) => typeof k === 'string' || typeof k === 'number')) throw new ProposalError(`変更点 ${i} の位置が違う`);
    if (!('before' in c) || !('after' in c)) throw new ProposalError(`変更点 ${i} に元の値か新しい値がない`);
    return { file: c['file'], path: path as Path, before: c['before'], after: c['after'] };
  });
  return { format: 'city-boardgame-proposal', version: 1, name, createdAt, changes: parsed };
};

// ---------------------------------------------------------------------------
// 検査（保存前、指示書 3-5）
// ---------------------------------------------------------------------------

/** 型検査と整合検査（存在しない ID、範囲外の値、地形の内訳など）。問題の一覧を返す。 */
export const validateFiles = (files: DataFiles): DataIssue[] => {
  try {
    return checkGameData(parseGameData(rawFromFiles(files)));
  } catch (error) {
    if (error instanceof DataValidationError) return [{ path: error.path, message: error.message.slice(error.path.length + 1) }];
    if (error instanceof Error) return [{ path: '（全体）', message: error.message }];
    throw error;
  }
};

// ---------------------------------------------------------------------------
// 書き出し
// ---------------------------------------------------------------------------

/** 変更のあったファイルだけを返す（開発サーバーへの書き戻し用）。 */
export const changedFiles = (proposal: Proposal, work: DataFiles): DataFiles => {
  const names = [...new Set(proposal.changes.map((c) => c.file))];
  return Object.fromEntries(names.map((name) => [name, work[name]]));
};

/** 変更点の位置を読みやすくする。配列の要素は id があれば id で示す。label で項目名を言い換えられる（画面では日本語にする）。 */
export const formatPath = (base: DataFiles, change: Change, label: (key: string) => string = (key) => key): string => {
  const parts: string[] = [];
  let current: unknown = base[change.file];
  for (const key of change.path) {
    if (typeof key === 'number') {
      const item = Array.isArray(current) ? current[key] : undefined;
      const id = isObject(item) && (typeof item['id'] === 'string' || typeof item['id'] === 'number') ? item['id'] : null;
      parts.push(id !== null ? `[${String(id)}]` : `[${key}]`);
    } else {
      parts.push(parts.length === 0 ? label(key) : `.${label(key)}`);
    }
    current = getAt(current, [key]);
  }
  return parts.join('') || '（ファイル全体）';
};

/** 変更点の一覧を Markdown にする（ユーザーが claude/tuning_log.md に転記する）。 */
export const toMarkdown = (proposal: Proposal, base: DataFiles): string => {
  const lines = [
    `## ${proposal.name}`,
    '',
    `- 作成日：${proposal.createdAt}`,
    `- 変更点：${proposal.changes.length}件`,
    '',
    '| ファイル | 項目 | 元の値 | 新しい値 |',
    '|---|---|---|---|',
    ...proposal.changes.map((c) => {
      const sum = summarizeChange(c, 400);
      const after = sum.note === null ? sum.after : `${sum.after}（${sum.note}）`;
      return `| ${c.file} | ${formatPath(base, c)} | \`${sum.before.replace(/\|/g, '\\|')}\` | \`${after.replace(/\|/g, '\\|')}\` |`;
    }),
    '',
  ];
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// 新しいカード（ユーザー決定 2026-11-04：既存のカードの編集に加えて、新しく作れるようにする）
// ---------------------------------------------------------------------------

/** 一覧の次の識別子。数なら最大＋1、「接頭辞＋数字」なら同じ桁数で最大＋1、それ以外は custom_<n> とする。 */
export const nextId = (ids: readonly unknown[]): string | number => {
  if (ids.length > 0 && ids.every((id) => typeof id === 'number')) return Math.max(...(ids as number[])) + 1;
  const parsed = ids.map((id) => /^(\D*)(\d+)$/.exec(String(id)));
  const first = parsed[0];
  if (first && first[1] !== undefined && first[2] !== undefined && parsed.every((m) => m !== null && m[1] === first[1])) {
    const prefix = first[1];
    const width = first[2].length;
    const max = Math.max(...parsed.map((m) => Number(m?.[2] ?? 0)));
    return `${prefix}${String(max + 1).padStart(width, '0')}`;
  }
  for (let n = 1; ; n += 1) {
    const id = `custom_${n}`;
    if (!ids.includes(id)) return id;
  }
};

/**
 * 一覧の index 番目を写して、新しいカードを作る。識別子は nextId、名前は「（写し）」を付け、仮置きの印を付ける。
 * 原本の文言の解釈・未決の事項は写さない（新しいカードには当てはまらないため）。
 */
export const newItemFrom = (list: readonly unknown[], index: number): unknown => {
  const source = list[index];
  if (!isObject(source)) throw new ProposalError('写すカードがない');
  const copy = clone(source) as Record<string, unknown>;
  copy['id'] = nextId(list.map((item) => (isObject(item) ? item['id'] : undefined)));
  if (typeof copy['name'] === 'string') copy['name'] = `${copy['name']}（写し）`;
  if ('provisional' in copy) copy['provisional'] = true;
  if (Array.isArray(copy['clarifications'])) copy['clarifications'] = [];
  if (Array.isArray(copy['open_issues'])) copy['open_issues'] = [];
  return copy;
};

/** 元データにない（チューナーで作った）カードか。 */
export const isNewItem = (baseList: readonly unknown[], item: unknown): boolean =>
  isObject(item) && !baseList.some((b) => isObject(b) && b['id'] === item['id']);

const idsOf = (list: readonly unknown[]): string[] => list.map((item) => (isObject(item) ? String(item['id'] ?? '') : ''));

/**
 * 変更点の元の値と新しい値を短く表す。カードの一覧（id を持つ要素の配列）は件数と追加・削除・変更した id で表し、
 * それ以外の値は JSON を長さ max までに切る（画面の変更点の一覧と Markdown に使う）。
 */
export const summarizeChange = (change: Change, max = 120): { before: string; after: string; note: string | null } => {
  const { before, after } = change;
  const short = (v: unknown): string => {
    const text = JSON.stringify(v) ?? 'null';
    return text.length > max ? `${text.slice(0, max)}…` : text;
  };
  const isCardList = (v: unknown): v is unknown[] => Array.isArray(v) && v.length > 0 && v.every((x) => isObject(x) && 'id' in x);
  if (isCardList(before) && isCardList(after)) {
    const b = idsOf(before);
    const a = idsOf(after);
    const added = a.filter((id) => !b.includes(id));
    const removed = b.filter((id) => !a.includes(id));
    const changed = a.filter((id) => b.includes(id) && !deepEqual(before[b.indexOf(id)], after[a.indexOf(id)]));
    const parts = [
      added.length > 0 ? `追加：${added.join('・')}` : '',
      removed.length > 0 ? `削除：${removed.join('・')}` : '',
      changed.length > 0 ? `変更：${changed.join('・')}` : '',
    ].filter((t) => t !== '');
    return { before: `${before.length}件`, after: `${after.length}件`, note: parts.length > 0 ? parts.join('／') : null };
  }
  return { before: short(before), after: short(after), note: null };
};
