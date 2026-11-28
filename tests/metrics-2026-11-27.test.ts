// 指標「持っている特別な市民カードの数」「達成した計画都市の数」と、反応の「1ラウンドに1回」（ユーザー決定 2026-11-27）。
import { describe, expect, it } from 'vitest';
import { metricValue } from '../src/game/effects.ts';
import { emit } from '../src/game/core.ts';
import { GAME_DATA } from '../src/data/index.ts';
import { describeScript } from '../src/game/icons.ts';
import type { Script } from '../src/data/script.ts';
import { edit, firstTurn, me, withScripts, withoutCharacters } from './helpers/game.ts';

describe('指標の追加（ユーザー決定 2026-11-27）', () => {
  it('specialCitizens は持っている特別な市民カードの枚数を数える', () => {
    // rules.md v0.8 12-1（特別な市民カード）
    const s = edit(withoutCharacters(firstTurn()), (_, p) => {
      p.specialCitizens = ['01', '02', '03'];
    });
    expect(metricValue(s, GAME_DATA, me(s), 'specialCitizens')).toBe(3);
  });

  it('plannedCitiesAchieved は自分が達成を宣言した計画都市の数を数え、他の人の宣言は数えない', () => {
    // rules.md v0.8 13-3-4（達成の宣言）
    const s = edit(withoutCharacters(firstTurn()), (state, p) => {
      state.plannedCityClaims = { PC1: [p.index], PC2: [(p.index + 1) % 3, p.index], PC3: [(p.index + 1) % 3] };
    });
    expect(metricValue(s, GAME_DATA, me(s), 'plannedCitiesAchieved')).toBe(2);
  });
});

describe('反応の1ラウンドに1回（ユーザー決定 2026-11-27）', () => {
  it('同じラウンドの2回目の出来事では発動せず、説明に「1ラウンドに1回」を出す', () => {
    // rules.md v0.8 3-1（ラウンド）、docs/effect-commands.md の on
    const script: Script = [
      { ability: 'on', event: 'actionExecuted', filter: { action: 'research' }, oncePerRound: true, do: [{ op: 'gain', res: 'gold', amount: 5 }] },
    ];
    const id = GAME_DATA.specialCitizens[0]!.id;
    const d = withScripts({ sc: { [id]: script } });
    let s = edit(withoutCharacters(firstTurn()), (_, p) => {
      p.specialCitizens = [id];
    });
    const gold = me(s).gold;
    s = edit(s, (state, p) => emit(state, d, { type: 'action', player: p.index, action: 'research', tier: 'normal', copied: false }));
    s = edit(s, (state, p) => emit(state, d, { type: 'action', player: p.index, action: 'research', tier: 'normal', copied: false }));
    expect(me(s).gold).toBe(gold + 5);
    // 次のラウンドに入ると usedThisRound が空になり、再び発動する。
    s = edit(s, (state, p) => {
      p.usedThisRound = [];
      emit(state, d, { type: 'action', player: p.index, action: 'research', tier: 'normal', copied: false });
    });
    expect(me(s).gold).toBe(gold + 10);
    expect(describeScript(script).join('')).toContain('1ラウンドに1回');
  });
});
