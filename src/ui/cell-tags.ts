// 個人ボードのマスのタグ（ユーザー決定 2026-11-15）。
// 予定を書き込むための自分用の印であり、ゲームの状態には入れない（他のプレイヤー・窓口・記録に送らない）。
// ブラウザ（localStorage の `cellTags:<対局の鍵>`）に、盤面の持ち主の席ごとに保存する。保存できない環境ではその画面の間だけ持つ。

import { useCallback, useEffect, useState } from 'react';
import { BUILDINGS, type Building } from '../data/types.ts';
import type { CellId } from '../game/board.ts';
import { buildingLabel } from '../game/queries.ts';
import { ICON_ART } from './icon-art.ts';

export type CellTag = 'park' | 'planned' | Building;

export const CELL_TAGS: readonly CellTag[] = ['park', 'planned', ...BUILDINGS];

export const cellTagLabel = (tag: CellTag): string =>
  tag === 'park' ? '自然公園' : tag === 'planned' ? '計画都市' : buildingLabel(tag);

/** タグの図案（icon-art.ts の SVG の中身、24×24）。 */
export const cellTagArt = (tag: CellTag): string =>
  tag === 'park' ? (ICON_ART['mod.natureParkPoints'] ?? '') : tag === 'planned' ? (ICON_ART['cmd.drawPlannedCity'] ?? '') : (ICON_ART[`bld.${tag}`] ?? '');

/** タグの色（マスの内側の縁と札の色）。 */
export const cellTagColor = (tag: CellTag): string => (tag === 'park' ? '#2e8b4e' : tag === 'planned' ? '#d4a017' : '#6b4f9a');

/** 席ごとの、マスごとのタグ。 */
export type CellTags = Readonly<Record<number, Readonly<Partial<Record<CellId, readonly CellTag[]>>>>>;

const isTag = (v: unknown): v is CellTag => typeof v === 'string' && (CELL_TAGS as readonly string[]).includes(v);

const load = (key: string | undefined): CellTags => {
  if (key === undefined) return {};
  try {
    const raw = window.localStorage.getItem(`cellTags:${key}`);
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    const result: Record<number, Partial<Record<CellId, CellTag[]>>> = {};
    for (const [seat, cells] of Object.entries(parsed)) {
      const tags: Partial<Record<CellId, CellTag[]>> = {};
      for (const [cell, list] of Object.entries(cells ?? {})) {
        if (Array.isArray(list)) tags[cell as CellId] = list.filter(isTag);
      }
      result[Number(seat)] = tags;
    }
    return result;
  } catch {
    return {};
  }
};

const save = (key: string | undefined, tags: CellTags): void => {
  if (key === undefined) return;
  try {
    window.localStorage.setItem(`cellTags:${key}`, JSON.stringify(tags));
  } catch {
    // 保存できない環境（プライベートブラウズなど）では、その画面の間だけ持つ。
  }
};

/** 対局の鍵ごとのタグ。toggle はマスにタグを付け外しし、clear は1マス（cell 指定）か盤面全体を消す。 */
export const useCellTags = (key: string | undefined) => {
  const [tags, setTags] = useState<CellTags>(() => load(key));
  useEffect(() => setTags(load(key)), [key]);
  const update = useCallback(
    (f: (t: CellTags) => CellTags) =>
      setTags((t) => {
        const next = f(t);
        save(key, next);
        return next;
      }),
    [key],
  );
  const toggle = useCallback(
    (seat: number, cell: CellId, tag: CellTag) =>
      update((t) => {
        const board = { ...(t[seat] ?? {}) };
        const list = board[cell] ?? [];
        const next = list.includes(tag) ? list.filter((x) => x !== tag) : [...list, tag];
        if (next.length === 0) delete board[cell];
        else board[cell] = next;
        return { ...t, [seat]: board };
      }),
    [update],
  );
  /** 複数のマスに同じタグを付ける（見込みの配置をタグに写す）。既に付いていれば何もしない。 */
  const addMany = useCallback(
    (seat: number, cells: readonly CellId[], tag: CellTag) =>
      update((t) => {
        const board = { ...(t[seat] ?? {}) };
        for (const cell of cells) {
          const list = board[cell] ?? [];
          if (!list.includes(tag)) board[cell] = [...list, tag];
        }
        return { ...t, [seat]: board };
      }),
    [update],
  );
  const clear = useCallback(
    (seat: number, cell?: CellId) =>
      update((t) => {
        if (cell === undefined) return { ...t, [seat]: {} };
        const board = { ...(t[seat] ?? {}) };
        delete board[cell];
        return { ...t, [seat]: board };
      }),
    [update],
  );
  return { tags, toggle, addMany, clear };
};
