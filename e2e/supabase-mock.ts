// Supabase の模擬（オンライン版の受け入れ検査用）。node: の標準モジュールだけで書く。
// - GET /：VITE_SUPABASE_URL をこの模擬に向けてビルドした画面（dist-supabase/index.html）を配る。
// - POST /functions/v1/rooms：本番と同じ Edge Function の中身（supabase/functions/rooms/bundle.js）で処理する。
//   保存先は rooms テーブルの代わりに ROOMS_DIR のファイル（再起動に耐える）。版による排他も本番と同じ形で行う。
// - /realtime/v1/websocket：Phoenix の約束（phx_join・heartbeat・broadcast）の必要な部分だけを話す WebSocket。
//   Broadcast の REST（/realtime/v1/api/broadcast）の代わりに、関数の notify から直接流す。
// 実行：e2e/online.ts が ONLINE_BACKEND=supabase-mock のときに起動する（npm run accept:supabase）。

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type StoredRoom = { record: { code: string }; state: unknown; version: number };
type Store = {
  get: (code: string) => Promise<StoredRoom | null>;
  insert: (room: StoredRoom) => Promise<boolean>;
  update: (room: StoredRoom, expected: number) => Promise<boolean>;
};
type Handler = (req: Request) => Promise<Response>;
type Bundle = {
  createRequestHandler: (deps: { store: Store; notify: (code: string, version: number) => Promise<void> }) => Handler;
  roomTopic: (code: string) => string;
};

const PORT = Number(process.env['PORT'] ?? 8799);
const ROOMS_DIR = resolve(process.env['ROOMS_DIR'] ?? 'server/rooms-mock');
const CLIENT_HTML = resolve('dist-supabase/index.html');
const bundle = (await import(pathToFileURL(resolve('supabase/functions/rooms/bundle.js')).href)) as Bundle;

mkdirSync(ROOMS_DIR, { recursive: true });
const pathOf = (code: string): string => join(ROOMS_DIR, `${code}.json`);
const read = (code: string): StoredRoom | null =>
  existsSync(pathOf(code)) ? (JSON.parse(readFileSync(pathOf(code), 'utf8')) as StoredRoom) : null;
const write = (room: StoredRoom): void => {
  const path = pathOf(room.record.code);
  writeFileSync(`${path}.tmp`, JSON.stringify(room), 'utf8');
  renameSync(`${path}.tmp`, path);
};

const store: Store = {
  get: async (code) => read(code),
  insert: async (room) => {
    if (read(room.record.code) !== null) return false;
    write(room);
    return true;
  },
  update: async (room, expected) => {
    if (read(room.record.code)?.version !== expected) return false;
    write(room);
    return true;
  },
};

// ---------------------------------------------------------------------------
// WebSocket（テキストの短いフレームだけを扱う最小の実装）
// ---------------------------------------------------------------------------

type Client = { socket: Duplex; topics: Set<string> };
const clients = new Set<Client>();

const frame = (text: string): Buffer => {
  const payload = Buffer.from(text, 'utf8');
  const head =
    payload.length < 126
      ? Buffer.from([0x81, payload.length])
      : Buffer.from([0x81, 126, (payload.length >> 8) & 0xff, payload.length & 0xff]);
  return Buffer.concat([head, payload]);
};

const sendTo = (client: Client, message: unknown): void => {
  if (!client.socket.destroyed) client.socket.write(frame(JSON.stringify(message)));
};

/** 受け取ったバイト列から、完結したフレームを取り出す。残りは次に回す。 */
const parseFrames = (buffer: Buffer): { messages: { opcode: number; text: string }[]; rest: Buffer } => {
  const messages: { opcode: number; text: string }[] = [];
  let offset = 0;
  for (;;) {
    if (buffer.length - offset < 2) break;
    const opcode = (buffer[offset] ?? 0) & 0x0f;
    const second = buffer[offset + 1] ?? 0;
    let length = second & 0x7f;
    let head = 2;
    if (length === 126) {
      if (buffer.length - offset < 4) break;
      length = buffer.readUInt16BE(offset + 2);
      head = 4;
    } else if (length === 127) {
      if (buffer.length - offset < 10) break;
      length = Number(buffer.readBigUInt64BE(offset + 2));
      head = 10;
    }
    const masked = (second & 0x80) !== 0;
    const total = head + (masked ? 4 : 0) + length;
    if (buffer.length - offset < total) break;
    const mask = masked ? buffer.subarray(offset + head, offset + head + 4) : null;
    const data = Buffer.from(buffer.subarray(offset + head + (masked ? 4 : 0), offset + total));
    if (mask !== null) for (let i = 0; i < data.length; i += 1) data[i] = (data[i] ?? 0) ^ (mask[i % 4] ?? 0);
    messages.push({ opcode, text: data.toString('utf8') });
    offset += total;
  }
  return { messages, rest: buffer.subarray(offset) };
};

const upgrade = (req: IncomingMessage, socket: Duplex): void => {
  const key = req.headers['sec-websocket-key'];
  if (typeof key !== 'string' || !(req.url ?? '').startsWith('/realtime/v1/websocket')) {
    socket.destroy();
    return;
  }
  const accept = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const client: Client = { socket, topics: new Set() };
  clients.add(client);
  let pending: Buffer = Buffer.alloc(0);
  socket.on('data', (chunk: Buffer) => {
    const { messages, rest } = parseFrames(Buffer.concat([pending, chunk]));
    pending = rest;
    for (const { opcode, text } of messages) {
      if (opcode === 0x8) {
        socket.end();
        return;
      }
      if (opcode !== 0x1) continue;
      const message = JSON.parse(text) as { topic: string; event: string; ref: string | null };
      if (message.event === 'phx_join') client.topics.add(message.topic);
      if (message.event === 'phx_join' || message.event === 'heartbeat') {
        sendTo(client, { topic: message.topic, event: 'phx_reply', payload: { status: 'ok', response: {} }, ref: message.ref });
      }
    }
  });
  const drop = (): void => {
    clients.delete(client);
  };
  socket.on('close', drop);
  socket.on('error', drop);
};

const notify = async (code: string, version: number): Promise<void> => {
  const topic = `realtime:${bundle.roomTopic(code)}`;
  for (const client of clients) {
    if (client.topics.has(topic)) {
      sendTo(client, { topic, event: 'broadcast', payload: { type: 'broadcast', event: 'update', payload: { version } }, ref: null });
    }
  }
};

const handler = bundle.createRequestHandler({ store, notify });

const server = createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(CLIENT_HTML));
      return;
    }
    if (url.pathname !== '/functions/v1/rooms') {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const init: RequestInit = { method: req.method ?? 'GET', headers: { 'Content-Type': 'application/json' } };
    if (req.method === 'POST') init.body = Buffer.concat(chunks).toString('utf8');
    const response = await handler(new Request(url, init));
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    res.end(await response.text());
  })().catch((error: unknown) => {
    console.error(error);
    res.writeHead(500).end();
  });
});
server.on('upgrade', (req, socket) => upgrade(req, socket));
server.listen(PORT, () => console.log(`Supabase の模擬を起動した：http://localhost:${PORT}/`));
