import { describe, expect, it } from 'vitest';
import { DATA_VERSION } from '../src/data/index.ts';
import { decider, getOptions, isGameOver } from '../src/game/engine.ts';
import { assertDataVersion, createRoom, joinRoom, loadRoom, moveInRoom, parseVariants, RoomError, summaryOf, undoInRoom, viewFor, type Room } from '../src/online/rooms.ts';

const now = new Date('2026-11-03T00:00:00Z');

const fullRoom = (players = 3): Room => {
  const room = createRoom('ABC123', players, 'あ', 'k0', now);
  for (let i = 1; i < players; i += 1) joinRoom(room, `p${i}`, `k${i}`, 42);
  return room;
};

/** 選択待ちの席の先頭の選択肢を選ぶ。 */
const step = (room: Room): void => {
  const state = room.state;
  if (state === null) throw new Error('始まっていない');
  const seat = decider(state);
  const option = getOptions(state)[0];
  if (seat === null || option === undefined) throw new Error('選択待ちがない');
  moveInRoom(room, seat, option.id, state.log.length);
};

describe('部屋（オンライン版）', () => {
  it('全席が埋まったら対局を始め、席の名前を使う', () => {
    // rules.md v0.8 1-0-4（3〜4人）
    const room = createRoom('ABC123', 3, 'あ', 'k0', now);
    expect(summaryOf(room).started).toBe(false);
    expect(joinRoom(room, 'い', 'k1', 42)).toBe(1);
    expect(room.state).toBeNull();
    expect(joinRoom(room, 'う', 'k2', 42)).toBe(2);
    expect(room.state?.players.map((p) => p.name)).toEqual(['あ', 'い', 'う']);
    expect(() => joinRoom(room, 'え', 'k3', 42)).toThrow(RoomError);
  });

  it('部屋のヴァリアントは記録に残り、対局の開始と記録の再生の両方で使う', () => {
    // rules.md v0.8 2-6-7 のヴァリアント（ユーザー決定 2026-11-06）
    const room = createRoom('SNAKE1', 3, 'あ', 'k0', now, undefined, parseVariants({ snakeDraft: true, unknown: 1 }));
    expect(room.record.variants).toEqual({ snakeDraft: true });
    joinRoom(room, 'い', 'k1', 42);
    joinRoom(room, 'う', 'k2', 42);
    expect(room.state?.config.variants).toEqual({ snakeDraft: true });
    for (let i = 0; i < 5; i += 1) step(room);
    const replayed = loadRoom(JSON.parse(JSON.stringify(room.record)));
    expect(replayed.state).toEqual(room.state);
    expect(summaryOf(room).variants).toEqual({ snakeDraft: true });
    // 指定がない・知らない項目だけのときは記録に残さない（古い記録と同じ形）
    expect(parseVariants({ snakeDraft: 'yes' })).toBeUndefined();
    expect(createRoom('PLAIN1', 3, 'あ', 'k0', now).record.variants).toBeUndefined();
  });

  it('部屋の要約はデータの版を持つ（画面は自分の版と違えば読み込み直しを求める）', () => {
    // ユーザー決定 2026-11-04（データの更新は進行中の対局に反映しない）、2026-11-06（画面と部屋の版の食い違いを画面で知らせる）
    const room = createRoom('VER001', 3, 'あ', 'k0', now);
    expect(summaryOf(room).dataVersion).toBe(DATA_VERSION);
  });

  it('対応していない人数・空の名前は拒む', () => {
    // rules.md v0.8 1-0-4
    expect(() => createRoom('X', 2, 'あ', 'k', now)).toThrow('プレイ人数');
    expect(() => createRoom('X', 3, '  ', 'k', now)).toThrow('名前');
  });

  it('選択待ちの持ち主でない席、選べない選択、古い局面からの送信を拒む', () => {
    // rules.md v0.8 12-0-6（手番のプレイヤーだけが選ぶ）
    const room = fullRoom();
    const state = room.state;
    if (state === null) throw new Error('始まっていない');
    const seat = decider(state) ?? 0;
    const other = (seat + 1) % 3;
    const move = getOptions(state)[0]?.id ?? '';
    expect(() => moveInRoom(room, other, move, state.log.length)).toThrow('持ち主ではない');
    expect(() => moveInRoom(room, seat, 'pass', state.log.length)).toThrow('選べない');
    expect(() => moveInRoom(room, seat, move, state.log.length - 1)).toThrow('局面が更新されている');
    moveInRoom(room, seat, move, state.log.length);
    expect(room.record.moves).toEqual([{ seat, move }]);
  });

  it('記録の再生で同じ局面に戻る（サーバーの再起動後も続きから遊べる）', () => {
    // 段階5（再接続、ユーザー決定 2026-11-03）
    const room = fullRoom(4);
    for (let i = 0; i < 40; i += 1) step(room);
    const reloaded = loadRoom(JSON.parse(JSON.stringify(room.record)));
    expect(reloaded.state).toEqual(room.state);
  });

  it('データの版が変わった部屋は続けない（記録の再生もしない）', () => {
    // 段階5（ユーザー決定 2026-11-04：データの更新は進行中の対局に反映しない）
    const room = fullRoom();
    expect(room.record.dataVersion).toMatch(/^[0-9a-f]{8}$/);
    expect(() => assertDataVersion(room.record)).not.toThrow();
    expect(() => loadRoom(JSON.parse(JSON.stringify(room.record)), undefined, 'ffffffff')).toThrow('データが更新された');
    // 版を記録していない古い部屋は、そのまま続ける。
    const { dataVersion: _omit, ...legacy } = room.record;
    expect(() => assertDataVersion(legacy)).not.toThrow();
  });

  it('取り消しは直前の選択をした席だけができ、チェックポイントの後はできない', () => {
    // rules.md v0.8 15-1-1、15-1-2、19-6-3
    const room = fullRoom();
    // ドラフトの選択はチェックポイントである。
    step(room);
    const drafter = room.record.moves[0]?.seat ?? 0;
    expect(() => undoInRoom(room, drafter)).toThrow('戻れない');
    expect(() => undoInRoom(room, (drafter + 1) % 3)).toThrow('席ではない');
  });

  it('手番の最初まで戻すのは、戻す選択をすべてした席だけができる', () => {
    // rules.md v0.8 15-1-1（手番の最初まで戻す：ユーザー決定 2026-11-08）
    const room = fullRoom();
    for (let i = 0; i < 200 && room.state !== null && !(room.state.phase === 'play' && room.state.stack.at(-1)?.t === 'turn'); i += 1) step(room);
    const state = room.state;
    if (state === null) throw new Error('始まっていない');
    const seat = decider(state) ?? 0;
    const length = state.log.length;
    const recorded = room.record.moves.length;
    moveInRoom(room, seat, 'free:materials_to_gold', length);
    moveInRoom(room, seat, 'free:materials_to_gold', length + 1);
    expect(() => undoInRoom(room, (seat + 1) % 3, undefined, true)).toThrow('席ではない');
    undoInRoom(room, seat, undefined, true);
    expect(room.state?.log.length).toBe(length);
    expect(room.record.moves).toHaveLength(recorded);
  });

  it('対局を最後まで進められる', () => {
    // rules.md v0.8 1-0-6
    const room = fullRoom();
    for (let i = 0; i < 6000 && room.state !== null && !isGameOver(room.state); i += 1) {
      const state = room.state;
      const seat = decider(state);
      const options = getOptions(state);
      const option = options.find((o) => o.id === 'pass') ?? options[0];
      if (seat === null || option === undefined) break;
      moveInRoom(room, seat, option.id, state.log.length);
    }
    expect(room.state !== null && isGameOver(room.state)).toBe(true);
  });
});

describe('伏せた写し（rules.md v0.8 19-6-1）', () => {
  it('他の席の手札の内容、山札の順序、未公開の襲撃カード、乱数とシードを伏せ、枚数は残す', () => {
    // rules.md v0.8 19-6-1（非公開は手札の内容と山札の順序のみ）、7-3-3（襲撃カードはラウンド開始時に公開）
    const room = fullRoom();
    for (let i = 0; i < 12; i += 1) step(room);
    const state = room.state;
    if (state === null) throw new Error('始まっていない');
    const view = viewFor(state, 1);
    expect(view.players[1]?.hand).toEqual(state.players[1]?.hand);
    for (const p of [0, 2]) {
      expect(view.players[p]?.hand).toHaveLength(state.players[p]?.hand.length ?? -1);
      expect(view.players[p]?.hand.every((c) => c === '?')).toBe(true);
    }
    expect(view.civDeck).toHaveLength(state.civDeck.length);
    expect(view.civDeck.every((c) => c === '?')).toBe(true);
    expect(view.rng).toEqual({ seed: 0, state: 0 });
    expect(view.seed).toBe(0);
    expect(view.raidOrder.slice(view.round)).toEqual(view.raidOrder.slice(view.round).map(() => 0));
    expect(view.raidOrder.slice(0, view.round)).toEqual(state.raidOrder.slice(0, state.round));
    // 伏せた写しの文字列に、他の席の手札の識別子が現れない。
    const text = JSON.stringify(view);
    const others = [...(state.players[0]?.hand ?? []), ...(state.players[2]?.hand ?? [])].filter(
      (c) => !(state.players[1]?.hand ?? []).includes(c),
    );
    for (const card of others) {
      // プレイ済みや捨て札など、公開された場所にある同じカードは除く。
      const publicCard = state.players.some((p) => p.played.includes(card)) || state.civDiscard.includes(card);
      if (!publicCard) expect(text.includes(`"${card}"`), card).toBe(false);
    }
  });

  it('伏せた写しでも、その席の選択肢は元の局面と同じになる', () => {
    // 段階5（画面は伏せた写しから選択肢を組み立てる）
    const room = fullRoom();
    for (let i = 0; i < 30; i += 1) {
      const state = room.state;
      if (state === null) break;
      const seat = decider(state);
      if (seat === null) break;
      expect(getOptions(viewFor(state, seat))).toEqual(getOptions(state));
      step(room);
    }
  });
});
