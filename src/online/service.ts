// オンライン版の部屋の窓口（Supabase 版、ユーザー決定 2026-11-03）。通信の形にも保存先にも依存しない。
// - 1つの入口 handleAction が、操作（create・join・view・move・undo）を受けて結果を返す。
// - 保存先は RoomStore（Supabase では Postgres のテーブル、検査ではメモリ）。版（version）による楽観的な排他で書き換える。
// - 書き換えたら notify で「部屋が更新された」ことだけを知らせる。局面そのものは各席が view で取りに来る（伏せた写し、19-6-1）。
// - 乱数とハッシュは Web Crypto だけを使う（Deno の Edge Function・Node・ブラウザのいずれでも動く）。

import type { GameState } from '../game/types.ts';
import {
  assertDataVersion,
  createRoom,
  joinRoom,
  loadRoom,
  moveInRoom,
  RoomError,
  summaryOf,
  undoInRoom,
  viewFor,
  type Room,
  type RoomRecord,
  type RoomSummary,
} from './rooms.ts';

/** 保存する部屋。state は記録の再生結果の写しで、無ければ記録から作り直す。 */
export type StoredRoom = { readonly record: RoomRecord; readonly state: GameState | null; readonly version: number };

export type RoomStore = {
  readonly get: (code: string) => Promise<StoredRoom | null>;
  /** 新しい部屋を保存する。同じコードの部屋が既にあれば false。 */
  readonly insert: (room: StoredRoom) => Promise<boolean>;
  /** 版が expected のままなら置き換えて true、他の書き換えが先に入っていれば false。 */
  readonly update: (room: StoredRoom, expected: number) => Promise<boolean>;
};

export type Notify = (code: string, version: number) => Promise<void>;

export type Credentials = { readonly code: string; readonly seat: number; readonly key: string };

export type RoomView = {
  readonly summary: RoomSummary;
  readonly seat: number;
  readonly version: number;
  readonly state: GameState | null;
};

/** 紛らわしい文字（0・O・1・I など）を除いた、ルームコードの文字。 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

const randomInts = (count: number): Uint32Array => crypto.getRandomValues(new Uint32Array(count));

export const newCode = (): string =>
  Array.from(randomInts(CODE_LENGTH), (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

export const hashKey = async (key: string): Promise<string> =>
  hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))));

const newKey = async (): Promise<{ key: string; keyHash: string }> => {
  const key = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { key, keyHash: await hashKey(key) };
};

/** 長さの等しい16進文字列を、一致の位置に依らない時間で比べる。 */
const sameHash = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const seatOf = async (room: Room, key: unknown): Promise<number> => {
  if (typeof key !== 'string' || key === '') throw new RoomError(401, '席の鍵がない');
  const given = await hashKey(key);
  let seat = -1;
  room.record.seats.forEach((s, i) => {
    if (sameHash(s.keyHash, given)) seat = i;
  });
  if (seat < 0) throw new RoomError(403, '席の鍵が合わない');
  return seat;
};

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

const normalizeCode = (v: unknown): string => text(v).trim().toUpperCase();

const load = async (store: RoomStore, code: string): Promise<{ room: Room; version: number }> => {
  const stored = await store.get(code);
  if (stored === null) throw new RoomError(404, '部屋が見つからない');
  assertDataVersion(stored.record);
  // 記録だけが正である。写しが無いか記録と食い違う場合は再生で作り直す。
  const consistent = stored.record.seed === null || (stored.state !== null && stored.state.log.length === stored.record.moves.length);
  const room = consistent ? { record: stored.record, state: stored.state } : loadRoom(stored.record);
  return { room, version: stored.version };
};

const save = async (store: RoomStore, notify: Notify, room: Room, version: number): Promise<void> => {
  const next = version + 1;
  if (!(await store.update({ record: room.record, state: room.state, version: next }, version))) {
    throw new RoomError(409, '局面が更新されている。最新の局面から選び直すこと');
  }
  await notify(room.record.code, next);
};

const viewOf = (room: Room, seat: number, version: number): RoomView => ({
  summary: summaryOf(room),
  seat,
  version,
  state: room.state === null ? null : viewFor(room.state, seat),
});

export type ServiceDeps = { readonly store: RoomStore; readonly notify: Notify; readonly now?: () => Date };

/**
 * 操作を1つ処理する。誤りは RoomError（status 付き）で投げる。
 * - create {playerCount, name} → Credentials
 * - join {code, name} → Credentials
 * - view {code, key} → RoomView
 * - move {code, key, move, logLength} → {ok}
 * - undo {code, key} → {ok}
 */
export const handleAction = async (body: Readonly<Record<string, unknown>>, deps: ServiceDeps): Promise<unknown> => {
  const { store, notify } = deps;
  const action = text(body['action']);
  if (action === 'create') {
    const { key, keyHash } = await newKey();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const room = createRoom(newCode(), Number(body['playerCount']), text(body['name']), keyHash, (deps.now ?? (() => new Date()))());
      if (await store.insert({ record: room.record, state: null, version: 0 })) return { code: room.record.code, seat: 0, key } satisfies Credentials;
    }
    throw new RoomError(503, 'ルームコードを割り当てられなかった');
  }

  const code = normalizeCode(body['code']);
  if (code === '') throw new RoomError(400, 'ルームコードがない');
  const { room, version } = await load(store, code);
  switch (action) {
    case 'join': {
      const { key, keyHash } = await newKey();
      const seat = joinRoom(room, text(body['name']), keyHash, (randomInts(1)[0] ?? 0) % 2 ** 31);
      await save(store, notify, room, version);
      return { code, seat, key } satisfies Credentials;
    }
    case 'view':
      return viewOf(room, await seatOf(room, body['key']), version);
    case 'move':
      moveInRoom(room, await seatOf(room, body['key']), text(body['move']), Number(body['logLength']));
      await save(store, notify, room, version);
      return { ok: true };
    case 'undo':
      undoInRoom(room, await seatOf(room, body['key']));
      await save(store, notify, room, version);
      return { ok: true };
    default:
      throw new RoomError(400, `知らない操作である：${action}`);
  }
};

/** メモリに置く保存先（検査と、受け入れ検査の模擬サーバーで使う）。 */
export const memoryStore = (initial: Iterable<StoredRoom> = []): RoomStore & { readonly rooms: Map<string, StoredRoom> } => {
  const rooms = new Map<string, StoredRoom>();
  for (const room of initial) rooms.set(room.record.code, room);
  const copy = (room: StoredRoom): StoredRoom => structuredClone(room);
  return {
    rooms,
    get: async (code) => {
      const room = rooms.get(code);
      return room === undefined ? null : copy(room);
    },
    insert: async (room) => {
      if (rooms.has(room.record.code)) return false;
      rooms.set(room.record.code, copy(room));
      return true;
    },
    update: async (room, expected) => {
      if (rooms.get(room.record.code)?.version !== expected) return false;
      rooms.set(room.record.code, copy(room));
      return true;
    },
  };
};
