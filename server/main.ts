// オンライン版のサーバー（段階5、ユーザー決定 2026-11-03）。標準の node:http だけで書き、ライブラリを使わない。
// - 画面（dist/index.html）を配り、/api で部屋の作成・入室・選択・取り消しを受ける。
// - サーバーからの知らせは Server-Sent Events（SSE）で送る。各席には伏せた写し（viewFor）だけを送る。
// - 部屋は ROOMS_DIR に「設定・シード・選択の列」として保存し、起動時に読み込む（再接続・再起動に耐える）。
// 実行：npm run server（クライアントとサーバーをビルドして起動する）

import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, resolve } from 'node:path';
import { createRoom, joinRoom, parseVariants, loadRoom, moveInRoom, RoomError, summaryOf, undoInRoom, viewFor, type Room, type RoomRecord } from '../src/online/rooms.ts';

const PORT = Number(process.env['PORT'] ?? 8787);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const ROOMS_DIR = resolve(process.env['ROOMS_DIR'] ?? 'server/rooms');
const CLIENT_HTML = resolve(process.env['CLIENT_HTML'] ?? 'dist/index.html');
const MAX_BODY = 64 * 1024;
const HEARTBEAT_MS = 25_000;
/** 紛らわしい文字（0・O・1・I など）を除いた、ルームコードの文字。 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// ---------------------------------------------------------------------------
// 部屋の保存と読み込み
// ---------------------------------------------------------------------------

const rooms = new Map<string, Room>();

const roomPath = (code: string): string => join(ROOMS_DIR, `${code}.json`);

const saveRoom = (room: Room): void => {
  // 書きかけのファイルを残さないよう、一時ファイルに書いてから置き換える。
  const path = roomPath(room.record.code);
  writeFileSync(`${path}.tmp`, JSON.stringify(room.record), 'utf8');
  renameSync(`${path}.tmp`, path);
};

const loadRooms = (): void => {
  mkdirSync(ROOMS_DIR, { recursive: true });
  for (const name of readdirSync(ROOMS_DIR).filter((n) => n.endsWith('.json'))) {
    try {
      const record = JSON.parse(readFileSync(join(ROOMS_DIR, name), 'utf8')) as RoomRecord;
      rooms.set(record.code, loadRoom(record));
    } catch (error) {
      console.error(`部屋を読み込めなかった：${name}`, error);
    }
  }
  console.log(`部屋を ${rooms.size} 件読み込んだ（${ROOMS_DIR}）`);
};

const newCode = (): string => {
  for (;;) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    if (!rooms.has(code)) return code;
  }
};

// ---------------------------------------------------------------------------
// 鍵（席ごとの秘密）。保存するのはハッシュだけである。
// ---------------------------------------------------------------------------

const hashKey = (key: string): string => createHash('sha256').update(key).digest('hex');

const newKey = (): { key: string; keyHash: string } => {
  const key = randomBytes(16).toString('hex');
  return { key, keyHash: hashKey(key) };
};

/** 鍵に対応する席の番号。合わなければ例外。 */
const seatOf = (room: Room, key: unknown): number => {
  if (typeof key !== 'string' || key === '') throw new RoomError(401, '席の鍵がない');
  const given = Buffer.from(hashKey(key), 'hex');
  const seat = room.record.seats.findIndex((s) => {
    const stored = Buffer.from(s.keyHash, 'hex');
    return stored.length === given.length && timingSafeEqual(stored, given);
  });
  if (seat < 0) throw new RoomError(403, '席の鍵が合わない');
  return seat;
};

const roomOf = (code: string): Room => {
  const room = rooms.get(code.toUpperCase());
  if (room === undefined) throw new RoomError(404, '部屋が見つからない');
  return room;
};

// ---------------------------------------------------------------------------
// SSE（サーバーからの知らせ）
// ---------------------------------------------------------------------------

type Client = { seat: number; res: ServerResponse };
const clients = new Map<string, Set<Client>>();

const messageFor = (room: Room, seat: number): string =>
  `data: ${JSON.stringify({ summary: summaryOf(room), seat, state: room.state === null ? null : viewFor(room.state, seat) })}\n\n`;

const broadcast = (room: Room): void => {
  for (const client of clients.get(room.record.code) ?? []) client.res.write(messageFor(room, client.seat));
};

const openStream = (req: IncomingMessage, res: ServerResponse, room: Room, seat: number): void => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const client: Client = { seat, res };
  const set = clients.get(room.record.code) ?? new Set<Client>();
  set.add(client);
  clients.set(room.record.code, set);
  res.write(messageFor(room, seat));
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), HEARTBEAT_MS);
  req.on('close', () => {
    clearInterval(heartbeat);
    set.delete(client);
  });
};

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const readJson = (req: IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new RoomError(413, '送信が大きすぎる'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('形が違う');
        resolveBody(value as Record<string, unknown>);
      } catch {
        reject(new RoomError(400, 'JSON として読めない'));
      }
    });
    req.on('error', reject);
  });

const sendJson = (res: ServerResponse, status: number, value: unknown): void => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
};

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter((p) => p !== '');

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
    if (!existsSync(CLIENT_HTML)) {
      sendJson(res, 500, { error: `画面のファイルがない：${CLIENT_HTML}。先に npm run build を実行すること` });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(readFileSync(CLIENT_HTML));
    return;
  }
  if (parts[0] !== 'api') {
    sendJson(res, 404, { error: '見つからない' });
    return;
  }
  if (req.method === 'GET' && parts[1] === 'health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  // POST /api/rooms：部屋を作る
  if (req.method === 'POST' && parts.length === 2 && parts[1] === 'rooms') {
    const body = await readJson(req);
    const { key, keyHash } = newKey();
    const room = createRoom(newCode(), Number(body['playerCount']), text(body['name']), keyHash, new Date(), undefined, parseVariants(body['variants']));
    rooms.set(room.record.code, room);
    saveRoom(room);
    sendJson(res, 200, { code: room.record.code, seat: 0, key });
    return;
  }

  if (parts[1] !== 'rooms' || parts[2] === undefined) {
    sendJson(res, 404, { error: '見つからない' });
    return;
  }
  const room = roomOf(parts[2]);
  const action = parts[3];

  // GET /api/rooms/:code/stream?key=...：知らせを受け取る
  if (req.method === 'GET' && action === 'stream') {
    openStream(req, res, room, seatOf(room, url.searchParams.get('key')));
    return;
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'POST だけを受け付ける' });
    return;
  }
  const body = await readJson(req);
  switch (action) {
    case 'join': {
      const { key, keyHash } = newKey();
      const seat = joinRoom(room, text(body['name']), keyHash, randomInt(2 ** 31));
      saveRoom(room);
      broadcast(room);
      sendJson(res, 200, { code: room.record.code, seat, key });
      return;
    }
    case 'move': {
      moveInRoom(room, seatOf(room, body['key']), text(body['move']), Number(body['logLength']));
      saveRoom(room);
      broadcast(room);
      sendJson(res, 200, { ok: true });
      return;
    }
    case 'undo': {
      undoInRoom(room, seatOf(room, body['key']), undefined, body['toTurnStart'] === true);
      saveRoom(room);
      broadcast(room);
      sendJson(res, 200, { ok: true });
      return;
    }
    default:
      sendJson(res, 404, { error: '見つからない' });
  }
};

loadRooms();

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    if (error instanceof RoomError) {
      sendJson(res, error.status, { error: error.message });
      return;
    }
    console.error(error);
    sendJson(res, 500, { error: 'サーバーの内部で問題が起きた' });
  });
}).listen(PORT, HOST, () => {
  console.log(`オンライン版のサーバーを起動した：http://localhost:${PORT}/`);
});
