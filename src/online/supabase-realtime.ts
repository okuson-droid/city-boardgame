// Supabase Realtime の Broadcast を受け取るだけの最小の接続（ライブラリを使わない）。
// Realtime は Phoenix のチャンネルの約束（WebSocket 上の JSON、vsn 1.0.0）で話す。
// - 接続：wss://<project>.supabase.co/realtime/v1/websocket?apikey=<anon>&vsn=1.0.0
// - 参加：topic「realtime:<チャンネル名>」に phx_join を送り、phx_reply の status が ok なら参加できている。
// - 受信：event が broadcast のメッセージの payload.payload が、送り手（Edge Function）の載せた中身である。
// - 25秒ごとに heartbeat を送る。切れたら間隔を延ばしながら繋ぎ直す。
// 知らせは「更新があった」合図にだけ使い、局面は別に取りに行くため、取りこぼしても遊びは止まらない。

import type { SupabaseClientConfig } from './client.ts';

export type BroadcastHandlers = {
  readonly onMessage: (payload: unknown) => void;
  /** 参加できたら true、切れたら false。 */
  readonly onStatus: (joined: boolean) => void;
};

const HEARTBEAT_MS = 25_000;
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

type PhoenixMessage = { topic?: string; event?: string; payload?: unknown; ref?: string | null };

export const realtimeUrl = (config: SupabaseClientConfig): string =>
  `${config.url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(config.anonKey)}&vsn=1.0.0`;

export const openBroadcast = (config: SupabaseClientConfig, channel: string, handlers: BroadcastHandlers): { close: () => void } => {
  const topic = `realtime:${channel}`;
  let socket: WebSocket | null = null;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  let closed = false;
  let ref = 0;
  let joinRef = '';

  const send = (message: PhoenixMessage & { join_ref?: string }): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const connect = (): void => {
    if (closed || typeof WebSocket === 'undefined') return;
    try {
      socket = new WebSocket(realtimeUrl(config));
    } catch {
      scheduleRetry();
      return;
    }
    socket.onopen = () => {
      ref += 1;
      joinRef = String(ref);
      send({
        topic,
        event: 'phx_join',
        payload: { config: { broadcast: { ack: false, self: false }, presence: { key: '' }, private: false } },
        ref: joinRef,
        join_ref: joinRef,
      });
      heartbeat = setInterval(() => {
        ref += 1;
        send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref) });
      }, HEARTBEAT_MS);
    };
    socket.onmessage = (event: MessageEvent) => {
      let message: PhoenixMessage;
      try {
        message = JSON.parse(String(event.data)) as PhoenixMessage;
      } catch {
        return;
      }
      if (message.topic !== topic) return;
      const payload = message.payload as { status?: string; payload?: unknown } | undefined;
      if (message.event === 'phx_reply' && message.ref === joinRef) {
        const ok = payload?.status === 'ok';
        if (ok) attempts = 0;
        handlers.onStatus(ok);
      } else if (message.event === 'broadcast') {
        handlers.onMessage(payload?.payload);
      } else if (message.event === 'phx_error' || message.event === 'phx_close') {
        handlers.onStatus(false);
        socket?.close();
      }
    };
    socket.onclose = () => {
      if (heartbeat !== undefined) clearInterval(heartbeat);
      heartbeat = undefined;
      socket = null;
      handlers.onStatus(false);
      scheduleRetry();
    };
    socket.onerror = () => {
      // onclose が続いて呼ばれるため、ここでは何もしない。
    };
  };

  const scheduleRetry = (): void => {
    if (closed) return;
    const delay = RETRY_MS[Math.min(attempts, RETRY_MS.length - 1)] ?? 30_000;
    attempts += 1;
    retry = setTimeout(connect, delay);
  };

  connect();
  return {
    close: () => {
      closed = true;
      if (retry !== undefined) clearTimeout(retry);
      if (heartbeat !== undefined) clearInterval(heartbeat);
      socket?.close();
    },
  };
};
