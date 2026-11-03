// Supabase の Edge Function（supabase/functions/rooms）の中身。ゲームのエンジンとデータを含めて
// supabase/functions/rooms/bundle.js にまとめる（npm run supabase:build）。
// - 保存先は Postgres の rooms テーブル（PostgREST 経由、service role の鍵で読み書きする。画面からは読めない）。
// - 更新の知らせは Realtime の Broadcast（チャンネル room:<コード>）に版の番号だけを流す。
// - ライブラリを使わず、fetch と Web Crypto だけで書く。

import { RoomError } from './rooms.ts';
import { handleAction, type Notify, type RoomStore, type ServiceDeps, type StoredRoom } from './service.ts';

export type SupabaseConfig = { readonly url: string; readonly serviceKey: string };

/** 画面（GitHub Pages など別のオリジン）から呼ぶため、CORS を許す。 */
export const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BODY = 64 * 1024;

/** Realtime のチャンネル名（Broadcast の topic）。 */
export const roomTopic = (code: string): string => `room:${code}`;

const headersFor = (config: SupabaseConfig): Record<string, string> => ({
  apikey: config.serviceKey,
  Authorization: `Bearer ${config.serviceKey}`,
  'Content-Type': 'application/json',
});

type Row = { record: StoredRoom['record']; state: StoredRoom['state']; version: number };

const failed = async (res: Response, what: string): Promise<never> => {
  throw new Error(`${what}に失敗した（${res.status}）：${await res.text()}`);
};

/** rooms テーブルを読み書きする保存先（docs/online-supabase.md の SQL で作る）。 */
export const postgrestStore = (config: SupabaseConfig, fetcher: typeof fetch = fetch): RoomStore => {
  const base = `${config.url}/rest/v1/rooms`;
  return {
    get: async (code) => {
      const res = await fetcher(`${base}?code=eq.${encodeURIComponent(code)}&select=record,state,version`, { headers: headersFor(config) });
      if (!res.ok) return failed(res, '部屋の読み込み');
      const rows = (await res.json()) as Row[];
      const row = rows[0];
      return row === undefined ? null : { record: row.record, state: row.state, version: row.version };
    },
    insert: async (room) => {
      const res = await fetcher(base, {
        method: 'POST',
        headers: { ...headersFor(config), Prefer: 'return=minimal' },
        body: JSON.stringify({ code: room.record.code, record: room.record, state: room.state, version: room.version }),
      });
      if (res.status === 409) return false;
      if (!res.ok) return failed(res, '部屋の作成');
      return true;
    },
    update: async (room, expected) => {
      const res = await fetcher(`${base}?code=eq.${encodeURIComponent(room.record.code)}&version=eq.${expected}`, {
        method: 'PATCH',
        headers: { ...headersFor(config), Prefer: 'return=representation' },
        body: JSON.stringify({ record: room.record, state: room.state, version: room.version, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) return failed(res, '部屋の保存');
      return ((await res.json()) as unknown[]).length === 1;
    },
  };
};

/** Realtime の Broadcast に版の番号だけを流す。知らせが届かなくても画面は定期的に取りに来るため、失敗は記録するだけにする。 */
export const broadcastNotify = (config: SupabaseConfig, fetcher: typeof fetch = fetch): Notify => async (code, version) => {
  try {
    const res = await fetcher(`${config.url}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: headersFor(config),
      body: JSON.stringify({ messages: [{ topic: roomTopic(code), event: 'update', payload: { version } }] }),
    });
    if (!res.ok) console.error(`Broadcast に失敗した（${res.status}）：${await res.text()}`);
  } catch (error) {
    console.error('Broadcast に失敗した', error);
  }
};

const json = (status: number, value: unknown): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** HTTP の要求を1つ処理する。本文は {action, ...}（service.ts の handleAction）。 */
export const createRequestHandler =
  (deps: ServiceDeps) =>
  async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
    if (req.method !== 'POST') return json(405, { error: 'POST だけを受け付ける' });
    try {
      const raw = await req.text();
      if (raw.length > MAX_BODY) throw new RoomError(413, '送信が大きすぎる');
      let body: unknown;
      try {
        body = JSON.parse(raw || '{}');
      } catch {
        throw new RoomError(400, 'JSON として読めない');
      }
      if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new RoomError(400, 'JSON の形が違う');
      return json(200, await handleAction(body as Record<string, unknown>, deps));
    } catch (error) {
      if (error instanceof RoomError) return json(error.status, { error: error.message });
      console.error(error);
      return json(500, { error: 'サーバーの内部で問題が起きた' });
    }
  };

/** Edge Function の入口から呼ぶ。設定は Supabase が関数に与える環境変数（SUPABASE_URL・SUPABASE_SERVICE_ROLE_KEY）。 */
export const createHandler = (config: SupabaseConfig): ((req: Request) => Promise<Response>) => {
  if (config.url === '' || config.serviceKey === '') throw new Error('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要である');
  return createRequestHandler({ store: postgrestStore(config), notify: broadcastNotify(config) });
};
