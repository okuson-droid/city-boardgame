// オンライン版の画面側の通信（段階5）。通信先は2通りあり、Transport で同じ形にそろえる。
// - Supabase（ユーザー決定 2026-11-03）：ビルド時の VITE_SUPABASE_URL・VITE_SUPABASE_ANON_KEY があれば使う。
//   操作は Edge Function（rooms）への POST、更新の知らせは Realtime の Broadcast（supabase-realtime.ts）。
// - 自前のサーバー（server/main.ts）：同じオリジンの /api が応答すれば使う。選択は POST、局面は SSE で受け取る。
// 席の鍵はブラウザに保存し、同じ席に戻れるようにする（再接続、ユーザー決定 2026-11-03）。

import type { GameState } from '../game/types.ts';
import type { RoomSummary } from './rooms.ts';
import { openBroadcast } from './supabase-realtime.ts';

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
const serverAvailable = async (): Promise<boolean> => {
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

type Credentials = { code: string; seat: number; key: string };

/** 通信先の違いを隠す窓口。subscribe の返り値は購読をやめる関数。 */
export type Transport = {
  readonly kind: 'server' | 'supabase';
  readonly create: (playerCount: number, name: string) => Promise<Credentials>;
  readonly join: (code: string, name: string) => Promise<Credentials>;
  readonly move: (session: Session, move: string, logLength: number) => Promise<unknown>;
  readonly undo: (session: Session) => Promise<unknown>;
  readonly subscribe: (session: Session, onMessage: (message: RoomMessage) => void, onStatus: (connected: boolean) => void) => () => void;
};

const normalizeCode = (code: string): string => code.trim().toUpperCase();

/** 自前のサーバー（server/main.ts）。 */
export const serverTransport: Transport = {
  kind: 'server',
  create: (playerCount, name) => post('/api/rooms', { playerCount, name }),
  join: (code, name) => post(`/api/rooms/${encodeURIComponent(normalizeCode(code))}/join`, { name }),
  move: (session, move, logLength) => post(`/api/rooms/${session.code}/move`, { key: session.key, move, logLength }),
  undo: (session) => post(`/api/rooms/${session.code}/undo`, { key: session.key }),
  // EventSource は切れても自動で繋ぎ直す。
  subscribe: (session, onMessage, onStatus) => {
    const source = new EventSource(`/api/rooms/${session.code}/stream?key=${encodeURIComponent(session.key)}`);
    source.onopen = () => onStatus(true);
    source.onerror = () => onStatus(false);
    source.onmessage = (event: MessageEvent<string>) => onMessage(JSON.parse(event.data) as RoomMessage);
    return () => source.close();
  },
};

export type SupabaseClientConfig = { readonly url: string; readonly anonKey: string };

/** 知らせが届いている間も、取りこぼしに備えて取りに行く間隔。 */
const SLOW_POLL_MS = 15_000;
/** 知らせが届かない（Realtime に繋がらない）間に取りに行く間隔。 */
const FAST_POLL_MS = 2_000;

/** Supabase（Edge Function ＋ Realtime）。 */
export const supabaseTransport = (config: SupabaseClientConfig): Transport => {
  const call = async <T>(body: Record<string, unknown>): Promise<T> => {
    const res = await fetch(`${config.url}/functions/v1/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
      body: JSON.stringify(body),
    });
    const value = (await res.json().catch(() => ({ error: res.statusText }))) as T & { error?: string };
    if (!res.ok) throw new Error(value.error ?? res.statusText);
    return value;
  };
  // 自分の選択が通ったら、知らせを待たずに局面を取りに行く。
  const refreshers = new Set<() => Promise<void>>();
  const andRefresh = async (body: Record<string, unknown>): Promise<unknown> => {
    const result = await call(body);
    for (const refresh of refreshers) void refresh();
    return result;
  };
  return {
    kind: 'supabase',
    create: (playerCount, name) => call({ action: 'create', playerCount, name }),
    join: (code, name) => call({ action: 'join', code: normalizeCode(code), name }),
    move: (session, move, logLength) => andRefresh({ action: 'move', code: session.code, key: session.key, move, logLength }),
    undo: (session) => andRefresh({ action: 'undo', code: session.code, key: session.key }),
    subscribe: (session, onMessage, onStatus) => {
      let stopped = false;
      let version = -1;
      let live = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let inflight = false;
      let again = false;
      const refresh = async (): Promise<void> => {
        if (inflight) {
          again = true;
          return;
        }
        inflight = true;
        try {
          const view = await call<RoomMessage & { version: number }>({ action: 'view', code: session.code, key: session.key });
          if (!stopped) {
            onStatus(true);
            if (view.version !== version) {
              version = view.version;
              onMessage({ summary: view.summary, seat: view.seat, state: view.state });
            }
          }
        } catch {
          if (!stopped) onStatus(false);
        } finally {
          inflight = false;
        }
        if (again && !stopped) {
          again = false;
          await refresh();
        }
      };
      const schedule = (): void => {
        if (stopped) return;
        timer = setTimeout(() => {
          void refresh().then(schedule);
        }, live ? SLOW_POLL_MS : FAST_POLL_MS);
      };
      const channel = openBroadcast(config, `room:${session.code}`, {
        onMessage: (payload) => {
          const next = typeof payload === 'object' && payload !== null ? (payload as { version?: unknown }).version : undefined;
          if (typeof next !== 'number' || next !== version) void refresh();
        },
        onStatus: (joined) => {
          live = joined;
          // 繋がった直後は、繋がる前の更新を取りこぼしていないか確かめる。
          if (joined) void refresh();
        },
      });
      refreshers.add(refresh);
      void refresh().then(schedule);
      return () => {
        refreshers.delete(refresh);
        stopped = true;
        if (timer !== undefined) clearTimeout(timer);
        channel.close();
      };
    },
  };
};

/** ビルド時に与えた Supabase の設定。無ければ null。anon（publishable）の鍵は公開してよい鍵である。 */
export const supabaseConfig = (): SupabaseClientConfig | null => {
  const url = import.meta.env['VITE_SUPABASE_URL'];
  const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];
  if (typeof url !== 'string' || url === '' || typeof anonKey !== 'string' || anonKey === '') return null;
  return { url: url.replace(/\/+$/, ''), anonKey };
};

/** 使える通信先。Supabase の設定があればそれを、無ければ同じオリジンの自前のサーバーを探す。どちらも無ければ null。 */
export const detectTransport = async (): Promise<Transport | null> => {
  const config = supabaseConfig();
  if (config !== null) return supabaseTransport(config);
  return (await serverAvailable()) ? serverTransport : null;
};
