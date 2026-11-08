import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/index.ts';
import { placeableCells, playerOf, terrainOf } from '../src/game/core.ts';
import { applyMove, isGameOver } from '../src/game/engine.ts';
import type { GameState } from '../src/game/types.ts';
import { edit, firstTurn, withAllRaidEffects, withoutCharacters, ids, me, play, top } from './helpers/game.ts';

const d = GAME_DATA;

const base = (): GameState =>
  edit(withoutCharacters(firstTurn()), (state) => {
    for (const p of state.players) p.tempWorkers = 0;
  });

const toRaid = (state: GameState): GameState => {
  let s = state;
  while (top(s).t !== 'raidDeclare') {
    s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
  }
  return s;
};

describe('到達報酬と同時発生効果', () => {
  it('複数のレベルを一度に上げると、通過したレベルの報酬をすべて得る', () => {
    // rules.md v0.8 7-1-2、7-1-4
    let s = edit(base(), (_, p) => {
      p.gold = 9;
      p.militaryLevel = 2;
      p.militaryTokens = 4;
      p.unlockedTop = ['drill'];
      p.buildings.E1 = 'fort';
      p.buildings.F1 = 'fort';
    });
    // 最上位の教練：9金の組でトークン8個を得て、砦2軒なら1回2個で3回上昇する。
    s = play(s, 'act:drill:top', 'count:2', 'count:3');
    expect(me(s).militaryLevel).toBe(5);
    expect(me(s).militaryRewardsClaimed).toEqual([3]);
    // 4個＋8個−上昇3回分6個＋レベル3の報酬2個。
    expect(me(s).militaryTokens).toBe(4 + 8 - 6 + 2);
  });

  it('軍事レベル12の報酬は、建物のない山岳の土地がなければ失われる', () => {
    // rules.md v0.8 7-1-2、16-2-6
    let s = edit(base(), (_, p) => {
      p.gold = 3;
      p.militaryLevel = 11;
      p.militaryRewardsClaimed = [3, 6, 9];
      p.militaryTokens = 4;
    });
    s = play(s, 'act:drill:normal', 'count:1');
    expect(me(s).militaryRewardsClaimed).toContain(12);
    expect(top(s).t).toBe('turn');
    expect(s.events.some((e) => e.type === 'fizzle' && e.what === 'build')).toBe(true);
  });

  it('軍事レベル12の報酬は、開拓済みの山岳の土地に建物1軒を無料で建てる', () => {
    // rules.md v0.8 7-1-2、5-6-7、4-1-3-2
    let s = edit(base(), (_, p) => {
      p.gold = 3;
      p.materials = 0;
      p.militaryLevel = 11;
      p.militaryRewardsClaimed = [3, 6, 9];
      p.militaryTokens = 4;
      p.land.E1 = 'mountain';
    });
    s = play(s, 'act:drill:normal', 'count:1');
    expect(top(s).t).toBe('build');
    expect(ids(s).every((id) => id.endsWith(':E1'))).toBe(true);
    s = applyMove(s, 'build:workshop:E1');
    expect(me(s).buildings.E1).toBe('workshop');
    // 地形ボーナス（山岳の工房は資材1個）を通常どおり得る。
    expect(me(s).materials).toBe(1);
  });

  it('選択を伴う効果が同時に2つ以上起きたら、処理順を尋ねる', () => {
    // rules.md v0.8 16-1-1、5-6-3、decisions.md 3-4
    let s = edit(base(), (_, p) => {
      p.gold = 100;
      p.materials = 100;
      p.infraLevel = 3;
      p.infraRewardsClaimed = [2];
    });
    // 飯場（土地タイル）と役所（インフラ4：特別な市民カード）を同時に建てる。
    s = play(s, 'act:build:normal', 'build:camp:E1', 'build:office:F1');
    expect(top(s).t).toBe('chooseOrder');
    expect(ids(s)).toEqual(['order:0', 'order:1']);
    s = applyMove(s, 'order:1');
    expect(top(s).t).toBe('chooseSpecialCitizen');
    s = applyMove(s, ids(s)[0] ?? '');
    expect(top(s).t).toBe('placeTiles');
  });

  it('資源を得るだけの効果は尋ねずに処理する', () => {
    // decisions.md 3-4
    let s = edit(base(), (_, p) => {
      p.gold = 100;
      p.materials = 100;
      p.land.E1 = 'water';
      p.land.F1 = 'mountain';
    });
    s = play(s, 'act:build:normal', 'build:shop:E1', 'build:workshop:F1');
    expect(top(s).t).toBe('turn');
  });

  it('公開されている特別な市民カードがなければ、獲得は不発になる', () => {
    // rules.md v0.8 19-4-3、16-2-5
    let s = edit(base(), (state, p) => {
      state.scRevealed = [];
      state.scDeck = [];
      p.materials = 5;
      p.infraLevel = 2;
      p.infraRewardsClaimed = [2];
    });
    s = applyMove(s, 'act:welfare:upper');
    expect(top(s).t).toBe('turn');
    expect(s.events.some((e) => e.type === 'fizzle' && e.what === 'chooseSpecialCitizen')).toBe(true);
  });

  it('通常ワーカーの獲得は1人ごとの出来事になり、上限を超えて破棄した分は数えない', () => {
    // rules.md v0.8 16-1-4、16-1-5、3-3-4
    let s = edit(base(), (_, p) => {
      p.regularWorkers = 5;
      p.unlockedTop = ['migration'];
      for (const cell of ['E1', 'F1'] as const) p.buildings[cell] = 'house';
    });
    const before = s.events.length;
    s = play(s, 'act:migration:top', 'count:1');
    const gained = s.events.slice(before).filter((e) => e.type === 'workerGained' && e.kind === 'regular');
    expect(gained).toHaveLength(1);
    expect(ids(s)).toContain('end');
  });
});

describe('建設の権利（6-3-6-7、19-1-3）', () => {
  it('建設の権利は通常の建設コストを払い、建築アクションの割引は乗らず、飯場の軽減は乗る', () => {
    // rules.md v0.8 6-3-6-7、6-3-6-8、19-1-3
    let s = edit(base(), (_, p) => {
      p.militaryLevel = 7;
      p.militaryRewardsClaimed = [3, 6];
      p.militaryTokens = 0;
      p.gold = 5;
      p.materials = 3;
      p.buildings.E1 = 'camp';
    });
    s = play(s, 'act:expedition:normal', 'reward:3', 'done');
    expect(top(s).t).toBe('build');
    s = applyMove(s, 'build:fort:F1');
    expect(me(s).gold).toBe(0);
    expect(me(s).materials).toBe(1);
  });
});

describe('襲撃カードの固有効果（7-6、19-3）', () => {
  it('カード3の防衛失敗で金の生産力を失い、0未満にならない', () => {
    // rules.md v0.8 7-6-1、19-3-4
    let s = toRaid(base());
    s = edit(s, (state, p) => {
      state.raidOrder = [3, 1, 2, 4, 5];
      p.goldProduction = 0;
      p.militaryLevel = 0;
      p.militaryTokens = 0;
    });
    const index = me(s).index;
    s = applyMove(s, 'raid:none');
    expect(playerOf(s, index).goldProduction).toBe(0);
  });

  it('カード4の撃退成功は、ラウンド数×3金だけを得る（基本得点とカードの点はない）', () => {
    // rules.md v0.8 7-6-1、19-3-3 からの変更（ユーザー決定 2026-11-07：撃退成功は資源の効果だけ。カード4の金は 2026-11-08 の調整案で3）
    let s = toRaid(base());
    s = edit(s, (state, p) => {
      state.raidOrder = [4, 1, 2, 3, 5];
      p.militaryLevel = 12;
    });
    const index = me(s).index;
    const { score, gold } = me(s);
    s = applyMove(s, 'raid:none');
    expect(playerOf(s, index).score).toBe(score);
    expect(playerOf(s, index).gold).toBe(gold + 3);
  });

  it('最終ラウンドの防衛失敗による損失は、最終収入の後に適用する', () => {
    // rules.md v0.8 7-6-3、17-0-1（防衛失敗の効果を適用するデータで検査する）
    let s = toRaid(base());
    s = edit(s, (state) => {
      state.round = 5;
      state.raidOrder = [2, 3, 4, 5, 2];
      for (const p of state.players) {
        p.militaryLevel = 0;
        p.militaryTokens = 0;
        p.materials = 0;
        p.materialProduction = 7;
      }
    });
    const legacy = withAllRaidEffects();
    while (!isGameOver(s)) s = applyMove(s, ids(s)[0] ?? '', legacy);
    // 最終収入で資材7個を得た後、カード2の防衛失敗で 5×1＝5資材を失う。
    for (const p of s.players) expect(p.materials).toBe(2);
  });
});

describe('効果による土地タイルの配置', () => {
  it('効果による配置は地形と同じ種類に限り、配置先がなければ破棄する', () => {
    // rules.md v0.8 4-2-2、4-4-5、19-1-1
    let s = toRaid(base());
    s = edit(s, (state, p) => {
      p.militaryLevel = 3;
      // E1・F1 以外をすべて開拓済みにして、配置先をなくす。
      for (const cell of Object.keys(d.boards[0]?.squares ?? {})) {
        p.land[cell as 'A1'] = terrainOf(d, p, cell as 'A1');
      }
    });
    expect(placeableCells(me(s))).toEqual([]);
    const index = me(s).index;
    s = applyMove(s, 'raid:none');
    expect(s.events.some((e) => e.type === 'fizzle' && e.player === index)).toBe(true);
  });
});
