import { describe, expect, it } from 'vitest';
import { decider, getOptions } from '../src/game/engine.ts';
import { projectOrigin } from '../src/online/client.ts';
import { createRequestHandler, postgrestStore } from '../src/online/edge.ts';
import { handleAction, memoryStore, type Credentials, type RoomView, type ServiceDeps, type StoredRoom } from '../src/online/service.ts';

const setup = () => {
  const store = memoryStore();
  const notices: { code: string; version: number }[] = [];
  const deps: ServiceDeps = {
    store,
    notify: async (code, version) => {
      notices.push({ code, version });
    },
    now: () => new Date('2026-11-03T00:00:00Z'),
  };
  const act = (body: Record<string, unknown>) => handleAction(body, deps);
  return { store, notices, deps, act };
};

const fullRoom = async (players = 3) => {
  const env = setup();
  const host = (await env.act({ action: 'create', playerCount: players, name: 'あ' })) as Credentials;
  const seats: Credentials[] = [host];
  for (let i = 1; i < players; i += 1) seats.push((await env.act({ action: 'join', code: host.code.toLowerCase(), name: `p${i}` })) as Credentials);
  return { ...env, code: host.code, seats };
};

const viewOf = async (env: Awaited<ReturnType<typeof fullRoom>>, seat: number) =>
  (await env.act({ action: 'view', code: env.code, key: env.seats[seat]?.key })) as RoomView;

describe('部屋の窓口（Supabase 版、ユーザー決定 2026-11-03）', () => {
  it('作成・入室で席の鍵を渡し、保存するのは鍵のハッシュだけである', async () => {
    // 段階5（席ごとに秘密の鍵を渡し、サーバーはハッシュだけを保存する）
    const env = await fullRoom();
    expect(env.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(env.seats.map((s) => s.seat)).toEqual([0, 1, 2]);
    const saved = JSON.stringify(env.store.rooms.get(env.code));
    for (const seat of env.seats) expect(saved.includes(seat.key)).toBe(false);
  });

  it('各席には伏せた写しだけを返し、鍵が合わない席には返さない', async () => {
    // rules.md v0.8 19-6-1
    const env = await fullRoom();
    const view = await viewOf(env, 1);
    expect(view.seat).toBe(1);
    expect(view.state?.rng).toEqual({ seed: 0, state: 0 });
    expect(view.state?.players[0]?.hand.every((c) => c === '?')).toBe(true);
    await expect(env.act({ action: 'view', code: env.code, key: 'wrong' })).rejects.toThrow('鍵が合わない');
    await expect(env.act({ action: 'view', code: 'ZZZZZZ', key: env.seats[0]?.key })).rejects.toThrow('見つからない');
  });

  it('選択を適用して版を進め、更新を知らせる。古い局面からの送信は拒む', async () => {
    // rules.md v0.8 12-0-6（手番のプレイヤーだけが選ぶ）
    const env = await fullRoom();
    const before = env.notices.length;
    const state = env.store.rooms.get(env.code)?.state;
    if (state === null || state === undefined) throw new Error('始まっていない');
    const seat = decider(state) ?? 0;
    const move = getOptions(state)[0]?.id ?? '';
    await env.act({ action: 'move', code: env.code, key: env.seats[seat]?.key, move, logLength: state.log.length });
    expect(env.notices.length).toBe(before + 1);
    expect(env.store.rooms.get(env.code)?.record.moves).toEqual([{ seat, move }]);
    await expect(env.act({ action: 'move', code: env.code, key: env.seats[seat]?.key, move, logLength: state.log.length })).rejects.toThrow(
      '局面が更新されている',
    );
  });

  it('同時の書き換えは版で排他し、後の方を拒む', async () => {
    // 段階5（古い局面からの送信を拒む）
    const env = await fullRoom();
    const stored = env.store.rooms.get(env.code);
    if (stored === undefined) throw new Error('部屋がない');
    expect(await env.store.update({ ...stored, version: stored.version + 1 }, stored.version)).toBe(true);
    expect(await env.store.update({ ...stored, version: stored.version + 1 }, stored.version)).toBe(false);
  });

  it('保存した局面の写しが無くても、記録の再生で作り直す', async () => {
    // 段階5（部屋は「設定・シード・選択の列」として保存し、再生で作り直す）
    const env = await fullRoom();
    const stored = env.store.rooms.get(env.code);
    if (stored === undefined) throw new Error('部屋がない');
    const expected = await viewOf(env, 0);
    env.store.rooms.set(env.code, { ...stored, state: null });
    expect(await viewOf(env, 0)).toEqual(expected);
  });

  it('取り消しは直前の選択をした席だけができ、チェックポイントの後はできない', async () => {
    // rules.md v0.8 15-1-1、15-1-2、19-6-3
    const env = await fullRoom();
    const state = env.store.rooms.get(env.code)?.state;
    if (state === null || state === undefined) throw new Error('始まっていない');
    const seat = decider(state) ?? 0;
    await env.act({ action: 'move', code: env.code, key: env.seats[seat]?.key, move: getOptions(state)[0]?.id, logLength: state.log.length });
    await expect(env.act({ action: 'undo', code: env.code, key: env.seats[(seat + 1) % 3]?.key })).rejects.toThrow('席ではない');
    await expect(env.act({ action: 'undo', code: env.code, key: env.seats[seat]?.key })).rejects.toThrow('戻れない');
  });
});

describe('Edge Function の HTTP の窓口', () => {
  it('CORS の事前確認に応じ、誤りは状態コードと文言で返す', async () => {
    // 段階5（GitHub Pages など別のオリジンの画面から呼ぶ）
    const handler = createRequestHandler(setup().deps);
    const preflight = await handler(new Request('http://x/functions/v1/rooms', { method: 'OPTIONS' }));
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*');
    const bad = await handler(new Request('http://x/functions/v1/rooms', { method: 'POST', body: '{"action":"join","code":"NONE00","name":"a"}' }));
    expect(bad.status).toBe(404);
    expect(((await bad.json()) as { error: string }).error).toContain('見つからない');
    const created = await handler(new Request('http://x', { method: 'POST', body: JSON.stringify({ action: 'create', playerCount: 3, name: 'a' }) }));
    expect(created.status).toBe(200);
  });
});

describe('PostgREST の保存先', () => {
  it('版を条件にした書き換えを送り、0件なら排他に負けたと判断する', async () => {
    // 段階5（古い局面からの送信を拒む）
    const calls: { url: string; method: string; prefer: string | null }[] = [];
    const fake = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), method: init?.method ?? 'GET', prefer: headers.get('Prefer') });
      if (init?.method === 'PATCH') return new Response(String(input).includes('version=eq.3') ? '[{}]' : '[]', { status: 200 });
      if (init?.method === 'POST') return new Response('', { status: 409 });
      return new Response('[]', { status: 200 });
    }) as typeof fetch;
    const store = postgrestStore({ url: 'https://p.supabase.co', serviceKey: 'service' }, fake);
    const room: StoredRoom = {
      record: { code: 'ABC234', playerCount: 3, createdAt: '', seats: [], seed: null, moves: [] },
      state: null,
      version: 4,
    };
    expect(await store.update(room, 3)).toBe(true);
    expect(await store.update(room, 2)).toBe(false);
    expect(await store.insert(room)).toBe(false);
    expect(await store.get('ABC234')).toBeNull();
    expect(calls[0]).toMatchObject({ method: 'PATCH', prefer: 'return=representation' });
    expect(calls[0]?.url).toBe('https://p.supabase.co/rest/v1/rooms?code=eq.ABC234&version=eq.3&select=version');
  });
});

describe('画面の Supabase の設定', () => {
  it('Project URL に REST の入口や末尾の斜線が付いていても、プロジェクトの起点にそろえる', () => {
    // 段階5（Supabase 版、ユーザー決定 2026-11-03）
    expect(projectOrigin('https://abc.supabase.co/rest/v1/')).toBe('https://abc.supabase.co');
    expect(projectOrigin(' https://abc.supabase.co/ ')).toBe('https://abc.supabase.co');
    expect(projectOrigin('https://abc.supabase.co')).toBe('https://abc.supabase.co');
  });
});

describe('観戦（ユーザー決定 2026-11-13）', () => {
  it('鍵なしで部屋を見られ、全員の手札・山札・乱数を伏せた写しを返す。操作はできない', async () => {
    // rules.md v0.8 19-6-1（観戦者にも公開情報だけを見せる）
    const env = await fullRoom();
    const view = (await env.act({ action: 'spectate', code: env.code.toLowerCase() })) as RoomView;
    expect(view.seat).toBe(-1);
    expect(view.state?.rng).toEqual({ seed: 0, state: 0 });
    expect(view.state?.civDeck.every((c) => c === '?')).toBe(true);
    for (const p of view.state?.players ?? []) expect(p.hand.every((c) => c === '?')).toBe(true);
    // 公開の情報（局面の進み）は席の写しと同じである。
    const seat = await viewOf(env, 0);
    expect(view.state?.log.length).toBe(seat.state?.log.length);
    expect(view.version).toBe(seat.version);
    // 観戦の操作で選択や取り消しはできない（鍵が要る）。
    const option = seat.state === null ? undefined : getOptions(seat.state)[0];
    await expect(env.act({ action: 'move', code: env.code, key: '', move: option?.id ?? '', logLength: 0 })).rejects.toThrow();
    await expect(env.act({ action: 'spectate', code: 'ZZZZZZ' })).rejects.toThrow('見つからない');
  });
});

describe('局面の差分の取得（ユーザー決定 2026-11-21：終盤の通信を軽くする）', () => {
  it('版が同じなら局面を送らず、違えば続きだけを送り、手元の写しとつなぐと全体と一致する', async () => {
    // 段階5（各席には伏せた写しだけを返す）、rules.md v0.8 19-6-1
    const { mergeView, sinceOf } = await import('../src/online/rooms.ts');
    const env = await fullRoom();
    const key = (seat: number) => env.seats[seat]?.key;
    let held = await viewOf(env, 1);
    let deltas = 0;
    let undone = false;
    for (let i = 0; i < 60; i += 1) {
      const state = env.store.rooms.get(env.code)?.state;
      if (state === null || state === undefined) throw new Error('始まっていない');
      const seat = decider(state);
      if (seat === null) break;
      // 取り消しの後に別の選択をして、長さが同じでも中身の違う log を作る。
      if (i >= 30 && !undone) {
        const first = getOptions(state)[0]?.id ?? '';
        await env.act({ action: 'move', code: env.code, key: key(seat), move: first, logLength: state.log.length });
        undone = await env.act({ action: 'undo', code: env.code, key: key(seat) }).then(
          () => true,
          () => false,
        );
      }
      const now = env.store.rooms.get(env.code)?.state;
      if (now === null || now === undefined) throw new Error('始まっていない');
      const options = getOptions(now);
      const move = options[i % options.length]?.id ?? '';
      await env.act({ action: 'move', code: env.code, key: key(decider(now) ?? 0), move, logLength: now.log.length });
      if (held.state === null) throw new Error('写しがない');
      const since = sinceOf(held.state, held.version);
      const got = (await env.act({ action: 'view', code: env.code, key: key(1), since })) as RoomView & { unchanged?: true };
      const full = await viewOf(env, 1);
      expect(got.unchanged).toBeUndefined();
      const merged = got.delta !== undefined && got.state !== null ? mergeView(held.state, got.state, got.delta) : got.state;
      if (got.delta !== undefined) deltas += 1;
      expect(merged).toEqual(full.state);
      held = { ...full, state: merged };
      const same = (await env.act({ action: 'view', code: env.code, key: key(1), since: sinceOf(held.state ?? full.state!, full.version) })) as { unchanged?: true; state?: unknown };
      expect(same.unchanged).toBe(true);
      expect(same.state).toBeUndefined();
    }
    expect(undone).toBe(true);
    expect(deltas).toBeGreaterThan(30);
    // 鍵が合わなければ、版が同じでも返さない。観戦も差分で取れる。
    if (held.state === null) throw new Error('写しがない');
    await expect(env.act({ action: 'view', code: env.code, key: 'wrong', since: sinceOf(held.state, held.version) })).rejects.toThrow('鍵が合わない');
    const spect = (await env.act({ action: 'spectate', code: env.code, since: sinceOf(held.state, held.version) })) as { unchanged?: true };
    expect(spect.unchanged).toBe(true);
  });
});

describe('差分の先頭の確かめ（2026-11-21）', () => {
  it('手元の log の中身が部屋と違えば（取り消しの後に別の選択をした）、長さが合っていても全体を送る', async () => {
    // 段階5（取り消しは直前の選択をした席だけができる）
    const { sinceOf, trimView } = await import('../src/online/rooms.ts');
    const env = await fullRoom();
    for (let i = 0; i < 5; i += 1) {
      const now = env.store.rooms.get(env.code)?.state;
      if (now === null || now === undefined) throw new Error('始まっていない');
      const seat = decider(now) ?? 0;
      await env.act({ action: 'move', code: env.code, key: env.seats[seat]?.key, move: getOptions(now)[0]?.id ?? '', logLength: now.log.length });
    }
    const state = env.store.rooms.get(env.code)?.state;
    if (state === null || state === undefined) throw new Error('始まっていない');
    expect(state.log.length).toBe(5);
    const held = { ...state, log: state.log.map((e, i) => (i === state.log.length - 1 ? { ...e, move: `${e.move}x` } : e)) };
    expect(trimView(state, sinceOf(held, 1)).delta).toBeUndefined();
    expect(trimView(state, sinceOf(state, 1)).delta).toEqual({ log: state.log.length, events: state.events.length });
    expect(trimView(state, { ...sinceOf(state, 1), log: state.log.length + 1 }).delta).toBeUndefined();
  });
});
