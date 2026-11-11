// 対話プレイ用のコマンドのオンライン版（ユーザー決定 2026-11-10）の検査。
// 窓口は handleAction とメモリの保存先で模擬する（Edge Function と同じ中身）。

import { describe, expect, it } from 'vitest';
import { decider, getOptions, isGameOver } from '../src/game/engine.ts';
import { handleAction, memoryStore, type Credentials, type ServiceDeps } from '../src/online/service.ts';
import { eventsSince, joinOnline, moveOnline, myTurn, viewRoom, type Call, type OnlineCredentials } from '../tools/play/online.ts';
import { PlayError } from '../tools/play/record.ts';

const URL_ = 'https://example.supabase.co';

const fakeService = (): { call: Call; deps: ServiceDeps } => {
  const deps: ServiceDeps = { store: memoryStore(), notify: async () => {}, now: () => new Date('2026-11-10T00:00:00Z') };
  const call: Call = async (url, body) => {
    expect(url).toBe(URL_);
    try {
      return await handleAction(body, deps);
    } catch (e) {
      throw new PlayError(e instanceof Error ? e.message : String(e));
    }
  };
  return { call, deps };
};

describe('オンライン版の部屋で打つ', () => {
  it('人の部屋に打ち手が席として入り、自分の番にだけ選択を送れる。他の席の手札は見えない', async () => {
    // rules.md v0.8 19-6-1（非公開情報）
    const { call, deps } = fakeService();
    const human = (await handleAction({ action: 'create', playerCount: 3, name: 'マスター' }, deps)) as Credentials;
    const a = await joinOnline(URL_, human.code.toLowerCase(), 'AI-1', call);
    const b = await joinOnline(URL_, human.code, 'AI-2', call);
    expect([a.seat, b.seat]).toEqual([1, 2]);
    const bots: Record<number, OnlineCredentials> = { 1: a, 2: b };

    let view = await viewRoom(a, call);
    if (view.state === null) throw new Error('対局が始まっていない');
    // 打ち手の写しでは、他の席の手札・山札・シードが伏せてある。
    expect(view.state.players[0]?.hand.every((c) => c === '?')).toBe(true);
    expect(view.state.players[1]?.hand.some((c) => c !== '?')).toBe(true);
    expect(view.state.civDeck.every((c) => c === '?')).toBe(true);
    expect(view.state.seed).toBe(0);

    // 60手ほど進める。人の席は窓口へ直接、打ち手の席は moveOnline で送る（番号でも ID でも送れる）。
    let steps = 0;
    while (steps < 60) {
      view = await viewRoom(a, call);
      const state = view.state;
      if (state === null || isGameOver(state)) break;
      const seat = decider(state);
      if (seat === null) throw new Error('選択待ちがない');
      const bot = bots[seat];
      if (bot === undefined) {
        const own = await handleAction({ action: 'view', code: human.code, key: human.key }, deps);
        const s = (own as { state: NonNullable<typeof state> }).state;
        const option = getOptions(s).find((o) => !o.id.startsWith('free:')) ?? getOptions(s)[0];
        await handleAction({ action: 'move', code: human.code, key: human.key, move: option?.id, logLength: s.log.length }, deps);
      } else {
        const other = bots[seat === 1 ? 2 : 1];
        if (other === undefined) throw new Error('席がない');
        // 他の席の番には送れない。
        await expect(moveOnline(other, ['1'], call)).rejects.toThrow(/番であり/);
        const own = await viewRoom(bot, call);
        expect(myTurn(own.state, bot.seat)).toBe(true);
        const all = getOptions(own.state ?? state);
        const pick = Math.max(0, all.findIndex((o) => !o.id.startsWith('free:')));
        const spec = steps % 2 === 0 ? String(pick + 1) : (all[pick]?.id ?? '1');
        const result = await moveOnline(bot, [spec], call);
        expect(result.sent).toHaveLength(1);
      }
      steps += 1;
    }
    expect(steps).toBe(60);
    const final = await viewRoom(b, call);
    expect(final.state?.log.length).toBe(60);
    const text = eventsSince(final.state!, 0);
    expect(text).toContain('AI-1');
    expect(text).not.toMatch(/\b(char|civ|sc):/);
  });

  it('選択肢にない指定は送らず、送った手の数を理由に添える', async () => {
    // rules.md v0.8 16-2（選択肢にない選択は適用しない）
    const { call, deps } = fakeService();
    const human = (await handleAction({ action: 'create', playerCount: 3, name: 'マスター' }, deps)) as Credentials;
    const a = await joinOnline(URL_, human.code, 'AI-1', call);
    const b = await joinOnline(URL_, human.code, 'AI-2', call);
    const view = await viewRoom(a, call);
    const seat = view.state === null ? null : decider(view.state);
    const bot = [a, b].find((c) => c.seat === seat);
    if (bot === undefined) return; // 最初の選択待ちが人の席なら、この検査は他のケースで足りる。
    const before = view.state?.log.length;
    await expect(moveOnline(bot, ['no:such:move'], call)).rejects.toThrow(/選択肢にない/);
    expect((await viewRoom(a, call)).state?.log.length).toBe(before);
  });

  it('部屋のデータの版が手元と違えば止める', async () => {
    // データの更新は進行中の対局に反映しない（ユーザー決定 2026-11-04）
    const { call, deps } = fakeService();
    const human = (await handleAction({ action: 'create', playerCount: 3, name: 'マスター' }, deps)) as Credentials;
    const a = await joinOnline(URL_, human.code, 'AI-1', call);
    const changed: Call = async (url, body) => {
      const value = (await call(url, body)) as { summary: Record<string, unknown> };
      return { ...value, summary: { ...value.summary, dataVersion: 'other' } };
    };
    await expect(viewRoom(a, changed)).rejects.toThrow(/データの版/);
  });
});
