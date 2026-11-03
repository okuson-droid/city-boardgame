// オンライン版の画面側の通信（段階5）。選択は HTTP の POST で送り、局面は SSE（EventSource）で受け取る。
// 席の鍵はブラウザに保存し、同じ席に戻れるようにする（再接続、ユーザー決定 2026-11-03）。

import type { GameState } from '../game/types.ts';
import type { RoomSummary } from './rooms.ts';

export type Session = { readonly code: string; readonly seat: number; readonly key: string; readonly name: string };

export type RoomMessage = { readonly summary: RoomSummary; readonly seat: number; readonly state: GameState | null };

const SESSIONS_KEY = 'online:sessions';

export const loadSessions = (): Session[] => {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? '[]');
    return Array.isArray(value) ? (value as Session[]) : [];
  } catch {
    return [];
  }
};

export const saveSession = (session: Session): void => {
  try {
    const others = loadSessions().filter((s) => s.code !== session.code);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify([session, ...others].slice(0, 10)));
  } catch {
    // 保存できなくても、その場では遊べる。
  }
};

export const forgetSession = (code: string): void => {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(loadSessions().filter((s) => s.code !== code)));
  } catch {
    // 無視する。
  }
};

/** オンライン版のサーバーから配られた画面か（file:// で開いた場合はローカル版だけ）。 */
export const serverAvailable = async (): Promise<boolean> => {
  if (!location.protocol.startsWith('http')) return false;
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
};

const post = async <T>(path: string, body: unknown): Promise<T> => {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(value.error ?? res.statusText);
  return value;
};

export const createRoomOnServer = (playerCount: number, name: string): Promise<{ code: string; seat: number; key: string }> =>
  post('/api/rooms', { playerCount, name });

export const joinRoomOnServer = (code: string, name: string): Promise<{ code: string; seat: number; key: string }> =>
  post(`/api/rooms/${encodeURIComponent(code.trim().toUpperCase())}/join`, { name });

export const sendMove = (session: Session, move: string, logLength: number): Promise<{ ok: true }> =>
  post(`/api/rooms/${session.code}/move`, { key: session.key, move, logLength });

export const sendUndo = (session: Session): Promise<{ ok: true }> => post(`/api/rooms/${session.code}/undo`, { key: session.key });

/** 局面の知らせを受け取る。返り値は購読をやめる関数。EventSource は切れても自動で繋ぎ直す。 */
export const subscribe = (
  session: Session,
  onMessage: (message: RoomMessage) => void,
  onStatus: (connected: boolean) => void,
): (() => void) => {
  const source = new EventSource(`/api/rooms/${session.code}/stream?key=${encodeURIComponent(session.key)}`);
  source.onopen = () => onStatus(true);
  source.onerror = () => onStatus(false);
  source.onmessage = (event: MessageEvent<string>) => onMessage(JSON.parse(event.data) as RoomMessage);
  return () => source.close();
};
