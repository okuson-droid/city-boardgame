// 記録（リプレイ）のファイルの保存と読み込み（ユーザー決定 2026-11-10）。形は src/game/replay.ts の ReplayRecord で、
// 対話プレイ用のコマンド（tools/play/）の記録ファイルと同じである。

import { parseReplay, type ReplayRecord } from '../game/replay.ts';

const stamp = (): string => {
  const d = new Date();
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}`;
};

/** 記録を JSON ファイルとしてダウンロードさせる。 */
export const downloadReplay = (record: ReplayRecord): void => {
  const blob = new Blob([`${JSON.stringify(record, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `city-boardgame-${stamp()}-seed${record.seed}-${record.moves.length}moves.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** 選んだファイルを記録として読む。形が違えば ReplayError（JSON でなければ Error）を投げる。 */
export const readReplayFile = async (file: File): Promise<ReplayRecord> => {
  let value: unknown;
  try {
    value = JSON.parse(await file.text());
  } catch {
    throw new Error('記録のファイルを読めない（JSON ではない）');
  }
  return parseReplay(value);
};
