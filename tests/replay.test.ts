// 対局の記録（リプレイ）の保存・読み込み・再生の検査（ユーザー決定 2026-11-10）。
// 記録の形は対話プレイ用のコマンドの記録と同じで、局面は記録の再生だけで作る（rules.md v0.8 第15章の巻き戻しと同じ考え方）。

import { describe, expect, it } from 'vitest';
import { DATA_VERSION } from '../src/data/index.ts';
import { decider, getOptions, isGameOver } from '../src/game/engine.ts';
import { parseReplay, REPLAY_FORMAT, replayDataChanged, ReplayError, replayPrefix, replayRecordOf, replayTo, replayTurns } from '../src/game/replay.ts';
import { eventText } from '../src/game/narrate.ts';
import type { GameState } from '../src/game/types.ts';
import { createRoom, joinRoom, moveInRoom, RoomError, replayOfRoom, type Room } from '../src/online/rooms.ts';
import { handleAction, memoryStore, type Credentials, type ServiceDeps } from '../src/online/service.ts';
import { playout } from './helpers/playout.ts';

const strip = (s: GameState): unknown => ({ ...s, events: s.events.length });

describe('記録の形と再生', () => {
  // rules.md v0.8 15-1（局面は選択の記録から作り直す）
  it('いまの局面から作った記録を JSON にして読み直すと、同じ局面に再生できる', () => {
    const { state, moves } = playout(3, 501, 120);
    const record = replayRecordOf(state);
    expect(record).toMatchObject({ format: REPLAY_FORMAT, seed: 501, dataVersion: DATA_VERSION });
    expect(record.moves).toEqual(moves);
    const loaded = parseReplay(JSON.parse(JSON.stringify(record)));
    expect(strip(replayTo(loaded, loaded.moves.length))).toEqual(strip(state));
    expect(replayDataChanged(loaded)).toBe(false);
  });

  it('途中の局面から続けて再生しても、頭から再生した局面と一致する', () => {
    // rules.md v0.8 15-1
    const { state } = playout(4, 502, 200);
    const record = replayRecordOf(state);
    const mid = replayTo(record, 80);
    expect(strip(replayTo(record, 150, undefined, mid))).toEqual(strip(replayTo(record, 150)));
    // 先の局面を渡したときは頭から再生し直す。
    expect(strip(replayTo(record, 50, undefined, mid))).toEqual(strip(replayTo(record, 50)));
  });

  it('各手の選んだプレイヤーとラベルを返し、選べない手で止めて理由を返す', () => {
    // rules.md v0.8 16-2（選択肢にない選択は適用しない）
    const { state } = playout(3, 503, 60);
    const record = replayRecordOf(state);
    const ok = replayPrefix(record);
    expect(ok.error).toBeNull();
    expect(ok.playable).toBe(60);
    expect(ok.steps[0]?.label).not.toBe('');
    const broken = { ...record, moves: [...record.moves.slice(0, 10), 'no:such:move', ...record.moves.slice(11)] };
    const cut = replayPrefix(broken);
    expect(cut.playable).toBe(10);
    expect(cut.steps).toHaveLength(10);
    expect(cut.error).toMatch(/11手目/);
  });

  it('各手にその選択で起きた出来事とラウンドを持たせ、同じプレイヤーが続けて選んだ手を1つの手番にまとめる', () => {
    // rules.md v0.8 12-0（手番）。手番のまとまりは記録の再生画面の表示のためのもので、ルールの手番とは一致しないことがある。
    const { state } = playout(3, 504, 150);
    const { steps } = replayPrefix(replayRecordOf(state));
    // 出来事は再生で増えた分と一致する（各手の出来事を並べると、最後の局面の出来事の後半になる）。
    const all = steps.flatMap((s) => s.events);
    expect(all).toEqual(state.events.slice(state.events.length - all.length));
    expect(steps.some((s) => s.events.some((e) => e.type === 'tilePlaced'))).toBe(true);
    expect(steps.every((s) => s.round >= 0 && s.round <= 5)).toBe(true);
    const turns = replayTurns(steps);
    // 手番は隙間なく並び、同じ手番の中の手はすべて同じプレイヤーが選んでいる。隣り合う手番は別のプレイヤーである。
    expect(turns[0]?.from).toBe(1);
    expect(turns[turns.length - 1]?.to).toBe(steps.length);
    turns.forEach((t, i) => {
      expect(steps.slice(t.from - 1, t.to).every((s) => s.player === t.player)).toBe(true);
      const next = turns[i + 1];
      if (next !== undefined) {
        expect(next.from).toBe(t.to + 1);
        expect(next.player).not.toBe(t.player);
      }
    });
  });

  it('出来事の文はプレイヤーの呼び方を差し替えられ、内部の識別子を出さない', () => {
    // 19-6-1（他の席が引いたカードの内容は出来事に含まれない）
    const { state } = playout(3, 505, 200);
    const name = (p: number): string => state.players[p]?.name ?? '';
    const texts = state.events.map((e) => eventText(state, e, undefined, name)).filter((t): t is string => t !== null);
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.some((t) => t.startsWith(name(0)))).toBe(true);
    expect(texts.filter((t) => /[a-z]+_[a-z]+|\b(char|civ|sc):/.test(t))).toEqual([]);
  });

  it('形の違う記録は読み込まない', () => {
    // 記録の形（ユーザー決定 2026-11-10）
    expect(() => parseReplay(null)).toThrow(ReplayError);
    expect(() => parseReplay({ config: { playerCount: 3 }, seed: 1, moves: [], dataVersion: 'x', format: 'other/1' })).toThrow(ReplayError);
    expect(() => parseReplay({ config: { playerCount: 3 }, seed: 1, moves: [1], dataVersion: 'x' })).toThrow(ReplayError);
    expect(() => parseReplay({ seed: 1, moves: [], dataVersion: 'x' })).toThrow(ReplayError);
    // format を持たない記録は受け入れ、いまの形にそろえる。
    expect(parseReplay({ config: { playerCount: 3 }, seed: 1, moves: [], dataVersion: 'x' }).format).toBe(REPLAY_FORMAT);
  });
});

const now = new Date('2026-11-10T00:00:00Z');

const playToEnd = (room: Room): void => {
  for (;;) {
    const state = room.state;
    if (state === null || isGameOver(state)) return;
    const seat = decider(state);
    const option = getOptions(state).find((o) => !o.id.startsWith('free:')) ?? getOptions(state)[0];
    if (seat === null || option === undefined) throw new Error('選択待ちがない');
    moveInRoom(room, seat, option.id, state.log.length);
  }
};

describe('オンライン版の記録の保存（19-6-1）', () => {
  it('終局前は記録を渡さず、終局後は記録の再生で最終局面に戻る', () => {
    // rules.md v0.8 19-6-1（非公開情報）。記録はシードを含むため終局後だけ渡す。
    const room = createRoom('REPLAY', 3, 'あ', 'k0', now);
    joinRoom(room, 'い', 'k1', 7);
    joinRoom(room, 'う', 'k2', 7);
    expect(() => replayOfRoom(room)).toThrow(RoomError);
    playToEnd(room);
    const record = replayOfRoom(room);
    expect(record.config.playerNames).toEqual(['あ', 'い', 'う']);
    expect(record.moves).toHaveLength(room.record.moves.length);
    const final = replayTo(record, record.moves.length);
    expect(isGameOver(final)).toBe(true);
    expect(final.players.map((p) => p.score)).toEqual(room.state?.players.map((p) => p.score));
  });

  it('窓口の replay は鍵の合う席にだけ、終局後にだけ記録を返す', async () => {
    // rules.md v0.8 19-6-1
    const store = memoryStore();
    const deps: ServiceDeps = { store, notify: async () => {}, now: () => now };
    const act = (body: Record<string, unknown>) => handleAction(body, deps);
    const host = (await act({ action: 'create', playerCount: 3, name: 'あ' })) as Credentials;
    const guest = (await act({ action: 'join', code: host.code, name: 'い' })) as Credentials;
    await act({ action: 'join', code: host.code, name: 'う' });
    await expect(act({ action: 'replay', code: host.code, key: guest.key })).rejects.toThrow(/終局/);
    await expect(act({ action: 'replay', code: host.code, key: 'wrong' })).rejects.toThrow(RoomError);
    const stored = store.rooms.get(host.code);
    if (stored?.state === null || stored === undefined) throw new Error('部屋がない');
    stored.state.phase = 'over';
    const record = parseReplay(await act({ action: 'replay', code: host.code, key: guest.key }));
    expect(record.seed).toBe(stored.record.seed);
    expect(record.moves).toEqual(stored.record.moves.map((m) => m.move));
  });
});
