// 2026-11-16 の調整（ユーザー決定。チューナーでは変えられない仕組みを含むため、コードとデータで行った）。
// 固定したテストのデータ（tests/fixtures/data/）には設定がないため、設定を足したデータで検査する。
import { describe, expect, it } from 'vitest';
import { GAME_DATA, type GameData } from '../src/data/index.ts';
import { usableTemp } from '../src/game/core.ts';
import { applyMove, getOptions, isGameOver } from '../src/game/engine.ts';
import type { GameState } from '../src/game/types.ts';
import { edit, firstTurn, me, top, withoutCharacters } from './helpers/game.ts';

const base = GAME_DATA;
const p = base.params;
const d: GameData = {
  ...base,
  params: {
    ...p,
    workers: { ...p.workers, tempUsableOnGain: true },
    specialCitizens: { roundEndRotate: 2 },
    actions: {
      ...p.actions,
      research: { ...p.actions.research, normal: { ...p.actions.research.normal, draw: 2, discard: 1 } },
      expedition: {
        ...p.actions.expedition,
        rewards: [
          { level: 0, grants: [{ kind: 'gold', amount: 3 }] },
          { level: 0, grants: [{ kind: 'goldProduction', amount: 2 }] },
          { level: 0, grants: [{ kind: 'militaryTokens', amount: 2 }] },
          { level: 0, grants: [{ kind: 'points', amount: 1 }] },
          ...p.actions.expedition.rewards.filter((r) => r.level > 0),
        ],
      },
    },
  },
};

const ids = (s: GameState): string[] => getOptions(s, d).map((o) => o.id);
const play = (s: GameState, ...moves: string[]): GameState => moves.reduce((x, m) => applyMove(x, m, d), s);
const start = (): GameState =>
  edit(withoutCharacters(firstTurn()), (state) => {
    for (const q of state.players) q.tempWorkers = 0;
  });

describe('臨時ワーカーは得た瞬間から使える', () => {
  it('手番中に得た臨時ワーカーをその手番中に使える', () => {
    // rules.md v0.8 3-4-4-2 からの変更（ユーザー決定 2026-11-16）
    let s = edit(start(), (_, q) => {
      q.materials = 10;
    });
    s = play(s, 'act:welfare:upper');
    // 福祉の1人と、インフラの到達報酬の1人。
    expect(me(s).tempWorkers).toBe(2);
    expect(usableTemp(me(s))).toBe(2);
    expect(me(s).tempLocked).toBe(0);
  });

  it('同じ福祉で得た臨時ワーカーは、役所の変換には使えないまま', () => {
    // rules.md v0.8 5-5-4-2、19-2-7（ユーザー決定 2026-11-03）
    const setup = (temp: number) =>
      edit(start(), (_, q) => {
        q.materials = 5;
        q.tempWorkers = temp;
        q.infraRewardsClaimed = [1, 2, 3];
        q.buildings.E1 = 'office';
      });
    const none = play(setup(0), 'act:welfare:upper');
    expect(top(none).t).not.toBe('welfareConvert');
    let one = play(setup(1), 'act:welfare:upper');
    if (top(one).t === 'payWorkers') one = play(one, 'temp:0');
    expect(ids(one)).toEqual(['convert:0', 'convert:1']);
  });
});

describe('特別な市民カードの場の入れ替え', () => {
  /** そのラウンドを終えるまで進める。 */
  const finishRound = (s0: GameState): GameState => {
    let s = s0;
    const round = s.round;
    while (s.round === round && !isGameOver(s)) s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''), d);
    return s;
  };

  it('ラウンドの終わりに、公開の古い2枚を山札の下に入れ、山札の上から2枚を公開する', () => {
    // ユーザー決定 2026-11-16（rules.md v0.8 9-3 への追加）
    const s0 = start();
    const revealed = [...s0.scRevealed];
    const deck = [...s0.scDeck];
    const s = finishRound(s0);
    expect(s.round).toBe(2);
    expect(s.scRevealed).toEqual([...revealed.slice(2), ...deck.slice(0, 2)]);
    expect(s.scDeck).toEqual([...deck.slice(2), ...revealed.slice(0, 2)]);
  });

  it('最終ラウンドの終わりには入れ替えない', () => {
    // ユーザー決定 2026-11-16
    const s0 = edit(start(), (state) => {
      state.round = d.params.rounds;
    });
    const revealed = [...s0.scRevealed];
    const s = finishRound(s0);
    expect(isGameOver(s)).toBe(true);
    expect(s.scRevealed).toEqual(revealed);
  });
});

describe('研究の通常は2枚引いた後に1枚捨てる', () => {
  it('引いた後に手札から1枚を選んで捨てる', () => {
    // rules.md v0.8 6-3-9-2 からの変更（ユーザー決定 2026-11-16）
    let s = edit(start(), (state, q) => {
      q.hand = ['016'];
      state.civDeck = ['001', '002', ...state.civDeck.filter((c) => !['001', '002'].includes(c))];
    });
    s = play(s, 'act:research:normal');
    expect(me(s).hand).toEqual(['016', '001', '002']);
    expect(top(s).t).toBe('discard');
    expect(ids(s)).toEqual(['card:016', 'card:001', 'card:002']);
    s = play(s, 'card:016');
    expect(me(s).hand).toEqual(['001', '002']);
    expect(s.civDiscard).toContain('016');
    expect(top(s).t).toBe('turn');
  });
});

describe('遠征の軍事レベル0の報酬', () => {
  it('金の生産力2・軍事力トークン2・1点を、それぞれ独立した報酬として選べる', () => {
    // rules.md v0.8 6-3-6 からの変更（ユーザー決定 2026-11-16）
    let s = edit(start(), (_, q) => {
      q.militaryLevel = 0;
      q.militaryTokens = 0;
    });
    const before = structuredClone(me(s));
    s = play(s, 'act:expedition:normal');
    expect(ids(s)).toEqual(expect.arrayContaining(['reward:0', 'reward:1', 'reward:2', 'reward:3']));
    s = play(s, 'reward:1', 'reward:3');
    if (ids(s).includes('done')) s = play(s, 'done');
    expect(me(s).goldProduction - before.goldProduction).toBe(2);
    expect(me(s).score - before.score).toBe(1);
    expect(s.events.filter((e) => e.type === 'score').at(-1)).toMatchObject({ axis: 'military', points: 1 });
  });
});
