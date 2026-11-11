// 対話プレイ用のコマンドのオンライン版（ユーザー決定 2026-11-10）。人がブラウザのオンライン版で遊ぶ部屋に、
// 打ち手（AI）が席として入り、部屋の窓口を通して打つ。
// - 窓口は Supabase の Edge Function だけを対象にする（自前のサーバーは局面を SSE でだけ配り、view の道筋を持たないため）。
// - 局面は窓口の view が返す伏せた写し（viewFor、19-6-1）だけを使う。他の席の手札・山札・シードは打ち手にも見えない。
// - 選択肢は伏せた写しに対して getOptions で組み立てる（画面のオンライン版と同じ。自分の席の手番では手札が見えている）。
// - 席の鍵は資格情報ファイル（既定 .play/online/<コード>-<席>.json）にだけ置く。前回どこまで出来事を見たかも同じファイルに持つ。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DATA_VERSION, GAME_DATA, type GameData } from '../../src/data/index.ts';
import { decider, eventText, getOptions, isGameOver, type GameState } from '../../src/game/index.ts';
import type { RoomSummary } from '../../src/online/rooms.ts';
import { added, PlayError, resolveSpec, type Reveal } from './record.ts';

/** 窓口の既定（公開ページのオンライン版が使う Supabase のプロジェクト）。--url か PLAY_ONLINE_URL で替える。 */
export const DEFAULT_ONLINE_URL = 'https://tybkebtddcgcewizwpua.supabase.co';

export type OnlineCredentials = {
  readonly url: string;
  readonly code: string;
  readonly seat: number;
  readonly key: string;
  /** 前回の出力までに見た出来事の数（state.events の長さ）。 */
  readonly seenEvents: number;
  /** 前回の出力の時点で公開・獲得されていたもの（新しく公開されたものの内容を1回だけ出すため、指示書 2026-11-11 2-2）。 */
  readonly seen?: Seen;
};

/** 前回の出力の時点の公開物と自分の手札。 */
export type Seen = {
  readonly specialCitizens: readonly string[];
  readonly plannedCities: readonly string[];
  readonly bonusTiles: readonly number[];
  readonly hand: readonly string[];
  readonly privatePlanned: readonly (readonly string[])[];
  readonly acquired: readonly (readonly string[])[];
};

export const seenOf = (state: GameState, seat: number): Seen => ({
  specialCitizens: [...state.scRevealed],
  plannedCities: [...state.plannedCityRevealed],
  bonusTiles: [...state.bonusTilesOnBoard],
  hand: [...(state.players[seat]?.hand ?? [])],
  privatePlanned: state.players.map((p) => [...p.privatePlannedCities]),
  acquired: state.players.map((p) => [...p.specialCitizens]),
});

/** 前回の出力から新しく公開・獲得されたもの。前回の記録がなければ何も出さない（最初の出力は局面に全部出るため）。 */
export const revealSince = (seen: Seen | undefined, state: GameState, seat: number): Reveal => {
  const empty: Reveal = { specialCitizens: [], plannedCities: [], bonusTiles: [], hands: {}, privatePlanned: {}, acquired: {} };
  if (seen === undefined) return empty;
  const perPlayer = (before: readonly (readonly string[])[], pick: (i: number) => readonly string[]): Record<number, string[]> => {
    const out: Record<number, string[]> = {};
    state.players.forEach((_, i) => {
      const diff = added(before[i] ?? [], pick(i));
      if (diff.length > 0) out[i] = diff;
    });
    return out;
  };
  const hand = added(seen.hand, state.players[seat]?.hand ?? []);
  return {
    specialCitizens: added(seen.specialCitizens, state.scRevealed),
    plannedCities: added(seen.plannedCities, state.plannedCityRevealed),
    bonusTiles: added(seen.bonusTiles, state.bonusTilesOnBoard),
    hands: hand.length > 0 ? { [seat]: hand } : {},
    privatePlanned: perPlayer(seen.privatePlanned, (i) => state.players[i]?.privatePlannedCities ?? []),
    acquired: perPlayer(seen.acquired, (i) => state.players[i]?.specialCitizens ?? []),
  };
};

export type OnlineView = { readonly summary: RoomSummary; readonly seat: number; readonly version: number; readonly state: GameState | null };

/** 窓口を呼ぶ（検査では差し替える）。 */
export type Call = (url: string, body: Readonly<Record<string, unknown>>) => Promise<unknown>;

export const httpCall: Call = async (url, body) => {
  const target = `${url.replace(/\/+$/, '')}/functions/v1/rooms`;
  const anonKey = process.env['PLAY_ONLINE_ANON_KEY'];
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (anonKey !== undefined && anonKey !== '') {
    headers['apikey'] = anonKey;
    headers['Authorization'] = `Bearer ${anonKey}`;
  }
  let res: Response;
  try {
    res = await fetch(target, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    throw new PlayError(`窓口に繋がらない：${target}（${e instanceof Error ? e.message : String(e)}）`);
  }
  const value = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
  if (!res.ok) throw new PlayError(`窓口が断った（${res.status}）：${value.error ?? res.statusText}`);
  return value;
};

// ---------------------------------------------------------------------------
// 資格情報ファイル
// ---------------------------------------------------------------------------

export const credentialsPath = (code: string, seat: number): string => `.play/online/${code}-${seat}.json`;

export const readCredentials = (path: string): OnlineCredentials => {
  if (!existsSync(path)) throw new PlayError(`資格情報がない：${path}（online join で作ること）`);
  const v = JSON.parse(readFileSync(path, 'utf8')) as Partial<OnlineCredentials>;
  if (typeof v.url !== 'string' || typeof v.code !== 'string' || typeof v.seat !== 'number' || typeof v.key !== 'string') {
    throw new PlayError(`資格情報の形が正しくない：${path}`);
  }
  return {
    url: v.url,
    code: v.code,
    seat: v.seat,
    key: v.key,
    seenEvents: typeof v.seenEvents === 'number' ? v.seenEvents : 0,
    ...(v.seen === undefined ? {} : { seen: v.seen }),
  };
};

export const writeCredentials = (path: string, creds: OnlineCredentials): void => {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(creds, null, 2)}\n`, { mode: 0o600 });
  renameSync(temp, path);
};

// ---------------------------------------------------------------------------
// 窓口の操作
// ---------------------------------------------------------------------------

export const viewRoom = async (creds: OnlineCredentials, call: Call = httpCall): Promise<OnlineView> => {
  const view = (await call(creds.url, { action: 'view', code: creds.code, key: creds.key })) as OnlineView;
  const version = view.summary.dataVersion;
  if (version !== undefined && version !== DATA_VERSION) {
    throw new PlayError(`部屋のデータの版（${version}）と手元のデータの版（${DATA_VERSION}）が違う。手元を main に合わせてビルドし直すこと`);
  }
  return view;
};

export const joinOnline = async (
  url: string,
  code: string,
  name: string,
  call: Call = httpCall,
): Promise<OnlineCredentials> => {
  const result = (await call(url, { action: 'join', code: code.trim().toUpperCase(), name })) as { code: string; seat: number; key: string };
  return { url, code: result.code, seat: result.seat, key: result.key, seenEvents: 0 };
};

export const createOnline = async (
  url: string,
  playerCount: number,
  name: string,
  snake: boolean,
  call: Call = httpCall,
): Promise<OnlineCredentials> => {
  const result = (await call(url, { action: 'create', playerCount, name, ...(snake ? { variants: { snakeDraft: true } } : {}) })) as {
    code: string;
    seat: number;
    key: string;
  };
  return { url, code: result.code, seat: result.seat, key: result.key, seenEvents: 0 };
};

/** 出来事 from 以降を文にする。席 seat 自身の出来事も名前を付ける（誰の出来事かを取り違えないため）。 */
export const eventsSince = (state: GameState, from: number, d: GameData = GAME_DATA, limit = 80): string => {
  const name = (p: number): string => state.players[p]?.name ?? `P${p}`;
  const texts = state.events
    .slice(from)
    .map((e) => eventText(state, e, d, name))
    .filter((t): t is string => t !== null);
  if (texts.length === 0) return '';
  const shown = texts.slice(-limit);
  return `${texts.length > shown.length ? `（${texts.length}件のうち最後の${shown.length}件）\n` : ''}${shown.join('\n')}`;
};

/**
 * 選択肢を順に送る。各手の前に局面を取り直し、選択待ちが自分の席であること・選択肢にあることを確かめてから送る。
 * 窓口は1手ずつ受けるため、途中で失敗するとそれより前の手は送られたままになる（送った数を理由に添える）。
 */
export const moveOnline = async (
  creds: OnlineCredentials,
  specs: readonly string[],
  call: Call = httpCall,
  d: GameData = GAME_DATA,
): Promise<{ readonly sent: readonly string[]; readonly view: OnlineView }> => {
  if (specs.length === 0) throw new PlayError('送る選択肢を指定すること');
  const sent: string[] = [];
  let view = await viewRoom(creds, call);
  for (const spec of specs) {
    const done = sent.length === 0 ? '' : `（${specs.length}個中${sent.length}個は送った：${sent.join(' ')}）`;
    const state = view.state;
    if (state === null) throw new PlayError(`対局がまだ始まっていない（全員の入室を待つ）${done}`);
    if (isGameOver(state)) throw new PlayError(`ゲームは終了している${done}`);
    if (decider(state) !== creds.seat) throw new PlayError(`いまは P${decider(state) ?? '-'} の番であり、P${creds.seat} は選べない：${spec}${done}`);
    let id: string;
    try {
      id = resolveSpec(state, spec, d);
    } catch (e) {
      throw new PlayError(`${e instanceof Error ? e.message : String(e)}${done}`);
    }
    try {
      await call(creds.url, { action: 'move', code: creds.code, key: creds.key, move: id, logLength: state.log.length });
    } catch (e) {
      throw new PlayError(`${e instanceof Error ? e.message : String(e)}${done}`);
    }
    sent.push(id);
    view = await viewRoom(creds, call);
  }
  return { sent, view };
};

/** 選択肢が自分の席のものだけか（getOptions は選択待ちの持ち主の選択肢を返す）。 */
export const myTurn = (state: GameState | null, seat: number): boolean =>
  state !== null && !isGameOver(state) && decider(state) === seat && getOptions(state).length > 0;
