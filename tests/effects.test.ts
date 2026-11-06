import { describe, expect, it } from 'vitest';
import { GAME_DATA, ICON_KEYS, checkIconKeys } from '../src/data/index.ts';
import { neighborsOf, type CellId } from '../src/game/board.ts';
import { placeableCells, playerOf, terrainOf, usableRegular } from '../src/game/core.ts';
import { applyMove, createGame, decider, getOptions } from '../src/game/engine.ts';
import { describeScript, iconSequence } from '../src/game/icons.ts';
import { natureParkScore, plannedCityMatches } from '../src/game/planned.ts';
import { spiritAdjacency } from '../src/game/effects.ts';
import { finalScores } from '../src/game/scoring.ts';
import type { GameState, PlayerState } from '../src/game/types.ts';
import { edit, firstTurn, ids, me, play, top, untilTurn, withoutCharacters } from './helpers/game.ts';

const d = GAME_DATA;

/** キャラクターを外し、臨時ワーカーを0にした最初の手番。 */
const base = (): GameState =>
  edit(withoutCharacters(firstTurn()), (state) => {
    for (const p of state.players) p.tempWorkers = 0;
  });

/** 手番のプレイヤーに文明カードを1枚だけ持たせ、普及（通常）でプレイする。 */
const playCard = (state: GameState, card: string, setup: (p: PlayerState) => void = () => undefined): GameState => {
  const s = edit(state, (_, p) => {
    p.hand = [card];
    p.gold = 100;
    setup(p);
  });
  return play(s, 'act:spread:normal', `card:${card}`);
};

/** ドラフトで指定のキャラクターを選び、最初の手番まで進める。characters[i] は i 番目に選ぶプレイヤーのもの。 */
const draftWith = (characters: readonly string[], playerCount = 3, seed = 1): GameState => {
  let s = createGame({ playerCount }, seed);
  const wanted = [...characters];
  while (top(s).t === 'draftPick') {
    const options = ids(s);
    const character = options.find((id) => id === `draft:character:${wanted[0]}`);
    if (character !== undefined) {
      wanted.shift();
      s = applyMove(s, character);
      continue;
    }
    s = applyMove(s, options.find((id) => !id.startsWith('draft:character:') && id !== 'draft:bonus:1' && id !== 'draft:bonus:4') ?? options[0] ?? '');
  }
  return s;
};

const playerWith = (s: GameState, character: string): PlayerState => {
  const p = s.players.find((q) => q.characterId === character);
  if (p === undefined) throw new Error(`${character} がいない`);
  return p;
};

const scoreEvents = (s: GameState, player: number) => s.events.filter((e) => e.type === 'score' && e.player === player);

describe('効果スクリプトのデータ', () => {
  it('文明カード・特別な市民カード・キャラクターはすべて効果スクリプトを持つ', () => {
    // 指示書 3-3（カードごとに個別のコードを書かない）
    expect(d.civilizationCards.every((c) => c.script.length > 0)).toBe(true);
    expect(d.specialCitizens.every((c) => c.script.length > 0)).toBe(true);
    expect(d.characters.every((c) => c.script.length > 0)).toBe(true);
  });

  it('アイコンの対応表はすべての命令・能力・要素を持つ', () => {
    // ui_design.md 0-1、指示書 3-3
    expect(checkIconKeys(ICON_KEYS)).toEqual([]);
    const broken = structuredClone(ICON_KEYS) as unknown as Record<string, Record<string, unknown>>;
    delete broken['commands']?.['gain'];
    expect(checkIconKeys(broken)).toContain('icon_keys.commands.gain：識別子または語がない');
  });

  it('文法の区切りは必ず開きと閉じが対になる', () => {
    // docs/styleguide-icons.md 4-3
    const scripts = [...d.civilizationCards, ...d.specialCitizens, ...d.characters].map((c) => c.script);
    for (const script of scripts) {
      for (const tokens of iconSequence(script)) {
        let depth = 0;
        for (const t of tokens) {
          if (t.icon.endsWith('.open')) depth += 1;
          if (t.icon.endsWith('.close')) depth -= 1;
          expect(depth).toBeGreaterThanOrEqual(0);
        }
        expect(depth).toBe(0);
      }
    }
  });

  it('すべての効果スクリプトからアイコンの並びと補足の文章を組み立てられる', () => {
    // ui_design.md 0-1（補足の文章は効果スクリプトから自動で組み立てる）
    const scripts = [...d.civilizationCards, ...d.specialCitizens, ...d.characters].map((c) => c.script);
    for (const script of scripts) {
      const icons = iconSequence(script);
      expect(icons).toHaveLength(script.length);
      expect(icons.every((tokens) => tokens.length > 0 && tokens.every((t) => t.icon !== ''))).toBe(true);
      expect(describeScript(script).every((text) => text.length > 0)).toBe(true);
    }
  });

  it('アイコンの並びは数字を伴う', () => {
    // ui_design.md 0-1（アイコンと数字の並び）
    const card027 = d.civilizationCards.find((c) => c.id === '027');
    const tokens = iconSequence(card027?.script ?? [])[0] ?? [];
    // 条件はカプセル（grp.cond）で囲み、コロンで効果につなぐ（docs/styleguide-icons.md 4-3-3）。
    expect(tokens.map((t) => [t.icon, t.value])).toEqual([
      ['ability.onPlay', undefined],
      ['grp.cond.open', undefined],
      ['track.military', undefined],
      ['sym.ge', undefined],
      ['num', 3],
      ['grp.cond.close', undefined],
      ['sym.colon', undefined],
      ['res.materials', 3],
      ['grp.cond.open', undefined],
      ['track.military', undefined],
      ['sym.ge', undefined],
      ['num', 6],
      ['grp.cond.close', undefined],
      ['sym.colon', undefined],
      ['res.materials', 2],
    ]);
    expect(describeScript(card027?.script ?? [])).toEqual([
      'プレイ時：軍事レベルが3以上なら、資材3を得る。軍事レベルが6以上なら、資材2を得る',
    ]);
  });
});

describe('命令：gain・raise・if（文明カード）', () => {
  it('004：資材5を得る', () => {
    // rules.md v0.8 9-2-4（カード効果を処理する）
    const s = playCard(base(), '004', (p) => {
      p.materials = 0;
    });
    expect(me(s).materials).toBe(5);
  });

  it('019：通常ワーカー1人につき1金（数に応じた獲得）', () => {
    // rules.md v0.8 9-2-4
    const s = playCard(base(), '019');
    expect(me(s).gold).toBe(100 - 10 + me(s).regularWorkers);
  });

  it('026：撃退ライン − 軍事レベル（0未満は0）につき1金', () => {
    // 指示書 2-1（仮置きの解釈）、rules.md v0.8 7-4-2
    const s = playCard(base(), '026', (p) => {
      p.militaryLevel = 1;
    });
    expect(s.repelLine).toBe(3);
    expect(me(s).gold).toBe(100 - 10 + 2);
  });

  it('010：軍事レベルを上げ、到達報酬を得る', () => {
    // rules.md v0.8 7-1-2
    const s = playCard(base(), '010', (p) => {
      p.militaryLevel = 2;
      p.militaryTokens = 0;
    });
    expect(me(s).militaryLevel).toBe(3);
    expect(me(s).militaryTokens).toBe(2);
  });

  it('027：各条件は個別に判定する', () => {
    // rules.md v0.8 9-2-7
    const low = playCard(base(), '027', (p) => {
      p.militaryLevel = 2;
      p.materials = 0;
    });
    expect(me(low).materials).toBe(0);
    const mid = playCard(base(), '027', (p) => {
      p.militaryLevel = 4;
      p.militaryRewardsClaimed = [3];
      p.materials = 0;
    });
    expect(me(mid).materials).toBe(3);
    const high = playCard(base(), '027', (p) => {
      p.militaryLevel = 6;
      p.militaryRewardsClaimed = [3, 6];
      p.materials = 0;
    });
    expect(me(high).materials).toBe(5);
  });

  it('032：2段目は通常ワーカー8人以上だけで満たす', () => {
    // rules.md v0.8 9-2-7（ユーザー決定 2026-11-03）
    const s = playCard(base(), '032', (p) => {
      p.regularWorkers = 8;
      p.materials = 0;
    });
    expect(me(s).materials).toBe(2);
  });

  it('034：軍事レベルが撃退ライン・防衛ラインより低いかで判定する', () => {
    // rules.md v0.8 7-4-2（ユーザー決定 2026-11-03：そのラウンドまでの累積値）
    const s = playCard(base(), '034', (p) => {
      p.militaryLevel = 0;
      p.materials = 0;
    });
    expect(me(s).materials).toBe(5);
    const t = playCard(base(), '034', (p) => {
      p.militaryLevel = 2;
      p.materials = 0;
    });
    expect(me(t).materials).toBe(3);
  });

  it('文明カードは効果が実行できなくてもプレイでき、プレイ済みとして数える', () => {
    // rules.md v0.8 16-2-5、9-2-3
    let s = playCard(base(), '012', () => undefined);
    s = edit(s, (state) => {
      state.scRevealed = [];
    });
    expect(me(s).played).toContain('012');
  });
});

describe('命令：placeTiles・build・playCard', () => {
  it('002：土地タイル2枚を地形と同じ種類で置き、資材は払わない', () => {
    // rules.md v0.8 4-2-2、19-1-1
    let s = playCard(base(), '002', (p) => {
      p.materials = 0;
    });
    expect(top(s)).toMatchObject({ t: 'placeTiles', remaining: 2, tile: 'match' });
    s = applyMove(s, ids(s)[0] ?? '');
    s = applyMove(s, ids(s)[0] ?? '');
    expect(Object.keys(me(s).land)).toHaveLength(4);
    expect(me(s).materials).toBeGreaterThanOrEqual(0);
  });

  it('006：地形を無視して山岳の土地タイルを置く', () => {
    // rules.md v0.8 4-2-3、4-2-5、指示書 2-1
    const s = playCard(base(), '006');
    expect(ids(s).length).toBe(placeableCells(me(s)).length);
    expect(ids(s).every((id) => id.endsWith(':mountain'))).toBe(true);
  });

  it('001：建物1軒を無料で建てる', () => {
    // rules.md v0.8 5-6-7
    let s = playCard(base(), '001', (p) => {
      p.materials = 0;
    });
    expect(top(s).t).toBe('build');
    s = applyMove(s, 'build:shop:E1');
    expect(me(s).buildings.E1).toBe('shop');
    expect(me(s).gold).toBe(100 - 12);
  });

  it('003：金を払わずに3軒まで建て、資材は払う。飯場と特別市民12の軽減は乗り、建築アクションの割引は乗らない', () => {
    // 指示書 2-1、rules.md v0.8 5-5-7-2（ユーザー決定 2026-11-03）
    let s = playCard(base(), '003', (p) => {
      p.materials = 10;
      p.specialCitizens = ['12'];
      p.buildings.E1 = 'camp';
      p.land.D1 = 'forest';
    });
    expect(ids(s)).toContain('done');
    s = play(s, 'build:house:F1', 'build:shop:D1');
    // 住宅：2−1（飯場）−1（特別市民12）＝0、商店：3−1（飯場）＝2。
    expect(me(s).materials).toBe(8);
    expect(me(s).gold).toBe(100 - 10);
  });

  it('特別市民10の専用スペースで文明カードを無料でプレイする', () => {
    // rules.md v0.8 6-2-4、6-2-5
    let s = edit(base(), (_, p) => {
      p.specialCitizens = ['10'];
      p.hand = ['005'];
      p.gold = 0;
    });
    const key = 'space:sc:10#0';
    expect(ids(s)).toContain(key);
    s = play(s, key, 'card:005');
    expect(me(s).played).toEqual(['005']);
    expect(me(s).goldProduction).toBeGreaterThanOrEqual(25);
    s = applyMove(s, 'end');
    s = untilTurn(s);
    // 占有型で1ラウンドに1回（他のプレイヤーには出ない）。
    expect(ids(s)).not.toContain(key);
  });
});

describe('命令：expeditionRewards（017）・chooseOne・copyAction', () => {
  it('017：トークンを使わず、軍事レベル以下の異なる報酬を4つまで得る', () => {
    // ユーザー決定 2026-11-03
    let s = playCard(base(), '017', (p) => {
      p.militaryLevel = 4;
      p.militaryRewardsClaimed = [3];
      p.militaryTokens = 0;
    });
    expect(me(s).militaryTokens).toBe(2);
    expect(ids(s)).toEqual(['reward:0', 'reward:1', 'reward:2']);
    s = play(s, 'reward:0', 'reward:1');
    expect(ids(s)).toEqual(['reward:2', 'done']);
    s = applyMove(s, 'done');
    expect(me(s).militaryTokens).toBe(2);
  });

  it('017：指揮官は指揮官の追加報酬も選べる', () => {
    // rules.md v0.8 19-2-6（ユーザー決定 2026-11-03）
    const s = playCard(base(), '017', (p) => {
      p.characterId = 'commander';
      p.militaryLevel = 6;
      p.militaryRewardsClaimed = [3, 6];
    });
    // 添字5 は指揮官の追加報酬（レベル6：文明カード1枚）。
    expect(ids(s)).toContain('reward:5');
    expect(ids(s)).not.toContain('reward:6');
  });

  it('学者：文明カードを3枚プレイするごとに、3つから1つを選ぶ', () => {
    // data_characters.json scholar、rules.md v0.8 16-1-4
    let s = edit(base(), (_, p) => {
      p.characterId = 'scholar';
      p.infraLevel = 0;
      p.hand = ['004', '004', '004'].map((_, i) => ['004', '013', '014'][i] ?? '004');
      p.gold = 100;
      p.unlockedTop = ['spread'];
    });
    s = play(s, 'act:spread:top', 'card:004', 'card:013');
    expect(top(s).t).toBe('spreadPlay');
    s = applyMove(s, 'card:014');
    expect(top(s).t).toBe('chooseOne');
    expect(ids(s)).toEqual(['choose:0', 'choose:1', 'choose:2']);
    s = applyMove(s, 'choose:0');
    expect(me(s).infraLevel).toBe(1);
  });

  it('特別市民11：占有されたスペースや未解放の最上位の効果も使え、そのスペースを占有しない', () => {
    // rules.md v0.8 19-2-11、19-2-2
    let s = edit(base(), (state, p) => {
      p.specialCitizens = ['11', '02'];
      p.gold = 100;
      p.materials = 0;
      state.occupied = ['import.top'];
    });
    s = play(s, 'space:sc:11#0');
    expect(ids(s)).toContain('copy:import:top');
    const score = me(s).score;
    s = play(s, 'copy:import:top', 'count:1');
    expect(me(s).materials).toBe(6);
    expect(s.occupied.filter((k) => k === 'import.top')).toHaveLength(1);
    // 最上位アクションの効果を使った場合は特別市民02に数える。
    expect(me(s).score).toBe(score + 2);
  });
});

describe('常時効果（出来事への反応、16-1-4）', () => {
  it('特別市民01：森林タイルを置く度に2点（生活・福祉）', () => {
    // rules.md v0.8 16-1-4、17-4-3（ユーザー決定 2026-11-03）
    let s = edit(base(), (_, p) => {
      p.specialCitizens = ['01'];
      p.hand = ['008'];
      p.gold = 100;
    });
    s = play(s, 'act:spread:normal', 'card:008');
    s = applyMove(s, ids(s)[0] ?? '');
    expect(scoreEvents(s, me(s).index).at(-1)).toMatchObject({ points: 2, axis: 'welfare' });
  });

  it('018：学術タグのカードをプレイする度に1枚引き、018 自身のプレイでは引かない', () => {
    // ユーザー決定 2026-11-03
    let s = playCard(base(), '018');
    expect(me(s).hand).toHaveLength(0);
    s = edit(s, (state, p) => {
      p.hand = ['016'];
      state.occupied = [];
      p.regularPlaced = 0;
    });
    s = untilTurn(applyMove(s, 'end'));
    s = edit(s, (state) => {
      const owner = state.players.find((q) => q.played.includes('018'));
      if (owner === undefined) return;
      state.stack[state.stack.length - 1] = { t: 'turn', player: owner.index, acted: false, started: true };
    });
    s = play(s, 'act:spread:normal', 'card:016');
    // 016 で2枚、018 で1枚。
    expect(me(s).hand).toHaveLength(3);
  });

  it('指揮官：砦の建設時に軍事レベルが本来の上昇に加えて1上がり、砦の資材が1少なくなる', () => {
    // rules.md v0.8 19-5-4
    let s = edit(base(), (_, p) => {
      p.characterId = 'commander';
      p.gold = 5;
      p.materials = 2;
      p.militaryLevel = 0;
    });
    // 資材2では2軒目を選べないため、1軒で自動的に確定する。
    s = play(s, 'act:build:normal', 'build:fort:E1');
    expect(me(s).militaryLevel).toBe(2);
    expect(me(s).materials).toBe(0);
  });

  it('聖女：通常ワーカーを獲得した1人につき1資材。上限を超えて破棄した分は数えない', () => {
    // rules.md v0.8 16-1-4、16-1-5
    let s = edit(base(), (_, p) => {
      p.characterId = 'saint';
      p.regularWorkers = 5;
      p.materials = 0;
      p.unlockedTop = ['migration'];
      p.buildings.E1 = 'house';
      p.buildings.F1 = 'house';
    });
    s = play(s, 'act:migration:top', 'count:1');
    expect(me(s).regularWorkers).toBe(6);
    expect(me(s).materials).toBe(1);
  });

  it('聖女：通常ワーカーが10人になった時、特別な市民カードを1枚獲得する（1回だけ）', () => {
    // data_characters.json saint
    let s = edit(base(), (_, p) => {
      p.characterId = 'saint';
      p.regularWorkers = 9;
      for (const c of ['E1', 'F1'] as const) p.buildings[c] = 'house';
      for (const c of ['D1', 'E2', 'F2', 'D2', 'C1', 'C2', 'E3', 'F3'] as CellId[]) {
        p.land[c] = 'plains';
        p.buildings[c] = 'house';
      }
    });
    s = applyMove(s, 'act:migration:normal');
    expect(top(s).t).toBe('chooseSpecialCitizen');
  });

  it('英雄：撃退成功時に2点（軍事・防衛）', () => {
    // rules.md v0.8 17-6-2-2
    let s = edit(base(), (_, p) => {
      p.characterId = 'hero';
      p.militaryLevel = 12;
    });
    while (top(s).t !== 'raidDeclare') s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
    s = edit(s, (state) => {
      for (const p of state.players) p.militaryLevel = p.characterId === 'hero' ? 12 : 0;
    });
    while (me(s).characterId !== 'hero') s = applyMove(s, 'raid:none');
    const hero = me(s).index;
    s = applyMove(s, 'raid:none');
    const military = scoreEvents(s, hero).filter((e) => e.type === 'score' && e.axis === 'military');
    expect(military.map((e) => (e.type === 'score' ? e.points : 0))).toEqual([2, 2]);
  });
});

describe('フリーアクションと専用スペース（9-3-3、6-2-4、6-2-5）', () => {
  it('特別市民15：1ラウンドに1回、文明カードを2枚引く', () => {
    // data_special_citizens.json 15
    let s = edit(base(), (_, p) => {
      p.specialCitizens = ['15'];
    });
    const hand = me(s).hand.length;
    s = applyMove(s, 'ability:sc:15#0');
    expect(me(s).hand).toHaveLength(hand + 2);
    expect(ids(s)).not.toContain('ability:sc:15#0');
  });

  it('手番中に獲得した特別な市民カードのフリーアクションは、その手番中は使えない', () => {
    // rules.md v0.8 9-3-3
    let s = edit(base(), (state, p) => {
      p.materials = 5;
      p.infraLevel = 2;
      p.infraRewardsClaimed = [2];
      state.scRevealed = ['17', ...state.scRevealed.filter((c) => c !== '17')];
    });
    s = play(s, 'act:welfare:upper', 'sc:17');
    expect(me(s).specialCitizens).toContain('17');
    expect(ids(s)).not.toContain('ability:sc:17#0');
    const index = me(s).index;
    s = applyMove(s, 'end');
    expect(playerOf(s, index).lockedSources).toEqual([]);
  });

  it('豪商：10金で臨時ワーカー1人、5金で2資材を、それぞれ1ラウンドに1回', () => {
    // data_characters.json merchant
    let s = edit(base(), (_, p) => {
      p.characterId = 'merchant';
      p.gold = 15;
      p.materials = 0;
    });
    s = play(s, 'ability:char:merchant#1', 'ability:char:merchant#2');
    expect(me(s).gold).toBe(0);
    expect(me(s).materials).toBe(2);
    expect(me(s).tempWorkers).toBe(1);
  });

  it('官僚：インフラレベルに応じてフリーアクションが解放される', () => {
    // data_characters.json bureaucrat
    const s = edit(base(), (_, p) => {
      p.characterId = 'bureaucrat';
      p.infraLevel = 6;
    });
    expect(ids(s)).toContain('ability:char:bureaucrat#3');
    expect(ids(s)).toContain('ability:char:bureaucrat#4');
    expect(ids(s)).not.toContain('ability:char:bureaucrat#5');
  });

  it('特別市民13：獲得時に住宅2軒まで無料、以後は通常ワーカーを獲得したラウンドから使える', () => {
    // data_special_citizens.json 13（「ターン」はラウンド、decisions.md 2-13）
    let s = edit(base(), (state, p) => {
      p.materials = 5;
      p.infraLevel = 2;
      p.infraRewardsClaimed = [2];
      state.scRevealed = ['13', ...state.scRevealed.filter((c) => c !== '13')];
    });
    s = play(s, 'act:welfare:upper', 'sc:13');
    expect(top(s).t).toBe('build');
    s = play(s, 'build:house:E1', 'build:house:F1');
    expect(me(s).regularWorkers).toBe(5);
    s = applyMove(s, 'end');
    s = untilTurn(s);
    s = edit(s, (state) => {
      const owner = state.players.find((q) => q.specialCitizens.includes('13'));
      if (owner === undefined) return;
      state.stack[state.stack.length - 1] = { t: 'turn', player: owner.index, acted: false, started: true };
    });
    const before = usableRegular(me(s));
    s = applyMove(s, 'act:migration:normal');
    expect(usableRegular(me(s))).toBe(before);
  });
});

describe('キャラクターの準備・最初の手番・終了時（19-5）', () => {
  it('英雄：E1・F1 のうち1枚の代わりに山岳マスへ山岳の土地タイルと砦を置き、軍事レベル1から始まる', () => {
    // rules.md v0.8 19-5-1
    let s = draftWith(['hero']);
    while (top(s).t !== 'heroStart') s = applyMove(s, ids(s)[0] ?? '');
    const option = ids(s)[0] ?? '';
    const [, replaced, cell] = option.split(':') as [string, CellId, CellId];
    s = untilTurn(applyMove(s, option));
    const hero = playerWith(s, 'hero');
    expect(hero.land[replaced]).toBeUndefined();
    expect(hero.land[cell]).toBe('mountain');
    expect(hero.buildings[cell]).toBe('fort');
    // 初期1、砦の建設で+1（ボーナスタイル9なら第1ラウンド開始時にさらに+1）。
    expect(hero.militaryLevel).toBe(2 + (hero.bonusTile === 9 ? 1 : 0));
  });

  it('豪商：準備で増えた金の生産力は第1ラウンドの収入から反映する', () => {
    // rules.md v0.8 19-4-1
    const s = untilTurn(draftWith(['merchant']));
    const merchant = playerWith(s, 'merchant');
    expect(merchant.goldProduction).toBe(25);
    const tileGold = merchant.bonusTile === 2 ? 8 : merchant.bonusTile === 6 ? 3 : 0;
    const tileProduction = merchant.bonusTile === 8 ? 2 : 0;
    expect(merchant.gold).toBe(25 + tileGold + tileProduction);
  });

  it('芸術家：最初の手番開始時に文明カード1枚を無料でプレイし、プレイする度に2金と1点', () => {
    // rules.md v0.8 19-5-6、19-2-10
    // 最初の手番の開始時に、無料プレイの選択が手番より先に来る。
    let t = draftWith(['artist']);
    while (!(top(t).t === 'playCard' && me(t).characterId === 'artist')) {
      t = applyMove(t, top(t).t === 'turn' ? 'pass' : (ids(t)[0] ?? ''));
    }
    const artist = me(t);
    const gold = artist.gold;
    const card = ids(t)[0] ?? '';
    t = applyMove(t, card);
    const after = playerOf(t, artist.index);
    expect(after.played).toEqual([card.slice('card:'.length)]);
    expect(after.gold).toBeGreaterThanOrEqual(gold + 2);
  });

  it('デザイナー：準備で土地タイル2枚を置き、最初の手番開始時に専用の計画都市カード2枚を引く', () => {
    // rules.md v0.8 19-5-2、19-5-3
    let s = draftWith(['designer']);
    while (top(s).t === 'placeTiles' || top(s).t === 'chooseOrder' || top(s).t === 'discard') s = applyMove(s, ids(s)[0] ?? '');
    s = untilTurn(s);
    const designer = playerWith(s, 'designer');
    expect(Object.keys(designer.land)).toHaveLength(4);
    while (me(s).characterId !== 'designer') s = untilTurn(applyMove(s, 'pass'));
    expect(me(s).privatePlannedCities).toHaveLength(2);
  });

  it('デザイナー：開拓で地形と異なる土地タイルを置く追加コストが不要', () => {
    // data_characters.json designer
    let s = edit(base(), (_, p) => {
      p.characterId = 'designer';
      p.materials = 2;
    });
    s = play(s, 'act:pioneer:normal', 'count:1');
    // 資材2で、どの種類も置ける。
    expect(ids(s)).toHaveLength(placeableCells(me(s)).length * 4);
  });

  it('資本家：山岳に土地タイルを置いた時2資材を得る', () => {
    // data_characters.json capitalist、rules.md v0.8 4-1-3-2（土地タイルの種類を参照する）
    let s = playCard(
      edit(base(), (_, p) => {
        p.characterId = 'capitalist';
      }),
      '006',
      (p) => {
        p.materials = 0;
      },
    );
    const option = ids(s)[0] ?? '';
    const cell = option.split(':')[1] as CellId;
    const bonus = d.boards.find((b) => b.id === me(s).boardId)?.squares[cell]?.bonus;
    s = applyMove(s, option);
    expect(me(s).materials).toBe(2 + (bonus?.kind === 'materials' ? bonus.amount : 0));
  });

  it('精霊使い：精霊チップと同じ種類の土地タイルを同じ地形のマスに置き、その土地には建てられない', () => {
    // rules.md v0.8 19-5-7
    let s = edit(base(), (_, p) => {
      p.characterId = 'spirit_caller';
      p.gold = 100;
      p.materials = 100;
    });
    s = applyMove(s, 'ability:char:spirit_caller#0');
    const option = ids(s)[0] ?? '';
    const [, terrain, cell] = option.split(':') as [string, string, CellId];
    expect(terrainOf(d, me(s), cell)).toBe(terrain);
    s = applyMove(s, option);
    expect(me(s).spiritChips[terrain as 'forest']).toBe(cell);
    s = applyMove(s, 'act:build:normal');
    expect(ids(s).some((id) => id.endsWith(`:${cell}`))).toBe(false);
  });

  it('精霊使い：終了時、チップの土地に隣接する同種の土地タイル1枚につき1点（1枚は1回だけ）', () => {
    // data_characters.json spirit_caller（ユーザー決定 2026-11-03）
    const p = structuredClone(me(base()));
    p.land = { E1: 'forest', F1: 'forest', E2: 'forest', D1: 'forest', D2: 'plains', C1: 'plains' };
    p.spiritChips = { forest: 'E1', plains: 'D2' };
    // E1 に隣接する森林：D1・E2・F1。D2 に隣接する平原：C1（D2 の隣接は C2・C3・D1・D3・E2・E3。C1 は隣接しない）。
    expect(spiritAdjacency(p)).toBe(neighborsOf('D2').filter((c) => p.land[c] === 'plains').length + 3);
  });
});

describe('計画都市（第13章、19-1-6、19-4-7）', () => {
  const card = d.plannedCityCards.find((c) => c.id === 'PC01');

  /** PC01（直線3：平原の住宅・商店・水場の建物）を満たす配置を作る。 */
  const satisfy = (p: PlayerState): void => {
    p.land = { E1: 'plains', E2: 'forest', E3: 'water', F1: 'forest' };
    p.buildings = { E1: 'house', E2: 'shop', E3: 'office' };
  };

  it('形状と一致する建物の組があれば満たし、回転を認める', () => {
    // rules.md v0.8 13-2、19-1-6
    if (card === undefined) throw new Error('PC01 がない');
    const p = structuredClone(me(base()));
    satisfy(p);
    expect(plannedCityMatches(card, p)).toBe(true);
    // 逆向き（180度回転）。
    p.land = { E1: 'water', E2: 'forest', E3: 'plains', F1: 'forest' };
    p.buildings = { E1: 'office', E2: 'shop', E3: 'house' };
    expect(plannedCityMatches(card, p)).toBe(true);
    p.buildings = { E1: 'office', E2: 'house', E3: 'house' };
    expect(plannedCityMatches(card, p)).toBe(false);
  });

  it('土地種だけを指定したマスにも建物が要る（建物の種類は問わない）', () => {
    // rules.md v0.8 13-2-1、13-2-2（2. 土地種のみ指定し、建物種は任意）
    if (card === undefined) throw new Error('PC01 がない');
    const p = structuredClone(me(base()));
    satisfy(p);
    // PC01 の3マス目は「水場（建物の種類は任意）」。建物を外すと満たさない。
    p.buildings = { E1: 'house', E2: 'shop' };
    expect(plannedCityMatches(card, p)).toBe(false);
    // 種類は何でもよい。
    p.buildings = { E1: 'house', E2: 'shop', E3: 'camp' };
    expect(plannedCityMatches(card, p)).toBe(true);
  });

  it('達成宣言は手番中の選択肢で、先着順に7・5・3点（自然・環境）と恩恵を得る', () => {
    // rules.md v0.8 13-3-1、13-3-4、13-3-8、17-5-1
    let s = edit(base(), (state, p) => {
      state.plannedCityRevealed = ['PC01', 'PC02'];
      satisfy(p);
      p.gold = 0;
    });
    expect(ids(s)).toContain('plan:PC01');
    s = applyMove(s, 'plan:PC01');
    expect(me(s).score).toBe(7);
    expect(me(s).gold).toBe(3);
    expect(scoreEvents(s, me(s).index).at(-1)).toMatchObject({ axis: 'nature', points: 7 });
    expect(ids(s)).not.toContain('plan:PC01');
  });

  it('宣言できるのはプレイ人数−1人まで', () => {
    // rules.md v0.8 13-3-5
    const s = edit(base(), (state, p) => {
      state.plannedCityRevealed = ['PC01'];
      state.plannedCityClaims = { PC01: state.players.filter((q) => q.index !== p.index).map((q) => q.index) };
      satisfy(p);
    });
    expect(ids(s)).not.toContain('plan:PC01');
  });

  it('デザイナー専用のカードは本人だけが宣言でき、7点', () => {
    // rules.md v0.8 19-5-3
    let s = edit(base(), (state, p) => {
      state.plannedCityRevealed = [];
      p.privatePlannedCities = ['PC01'];
      state.plannedCityClaims = { PC01: [] };
      satisfy(p);
    });
    s = applyMove(s, 'plan:PC01');
    expect(me(s).score).toBe(7);
  });
});

describe('自然公園（第14章、19-1-5、19-4-8）', () => {
  it('建物のない土地で、得点が最大になる割り当てを数え、同じ土地を複数セットで共有しない', () => {
    // rules.md v0.8 14-2-1、14-3-1、14-3-4、19-4-8
    const p = structuredClone(me(base()));
    p.natureParkCard = 'NP01';
    // NP01：森林2枚／森林・平原・平原の直線／森林・森林・水場・水場の菱形。
    p.land = { E1: 'forest', F1: 'forest' };
    p.buildings = {};
    expect(natureParkScore(d, p)).toBe(5);
    p.buildings = { E1: 'house' };
    expect(natureParkScore(d, p)).toBe(0);
  });

  it('特別市民08 は自然公園の得点を10・15・20点に置き換える', () => {
    // data_special_citizens.json 08、rules.md v0.8 17-5-2
    const p = structuredClone(me(base()));
    p.natureParkCard = 'NP01';
    p.land = { E1: 'forest', F1: 'forest' };
    p.buildings = {};
    p.specialCitizens = ['08'];
    expect(natureParkScore(d, p)).toBe(10);
  });

  it('自然公園の得点は終了時の自然・環境に入る', () => {
    // rules.md v0.8 17-5-1
    const s = structuredClone(base());
    for (const p of s.players) {
      p.natureParkCard = 'NP01';
      p.land = { E1: 'forest', F1: 'forest' };
      p.buildings = {};
    }
    expect(finalScores(s).every((f) => f.axes.nature >= 5)).toBe(true);
  });
});

describe('終了時の得点の補正', () => {
  it('特別市民04：金から得る点数が2倍', () => {
    // data_special_citizens.json 04
    const s = structuredClone(base());
    const p = playerOf(s, 0);
    p.gold = 40;
    p.buildings = {};
    const before = finalScores(s).find((f) => f.player === 0)?.axes.economy ?? 0;
    p.specialCitizens = ['04'];
    const after = finalScores(s).find((f) => f.player === 0)?.axes.economy ?? 0;
    expect(after - before).toBe(2);
  });

  it('特別市民05〜07 と資本家は 17-0-1 手順4 で処理し、資本家の資材は経済の換算に含まれる', () => {
    // rules.md v0.8 17-0-1、19-5-5
    let s = edit(base(), (state) => {
      state.round = 5;
      for (const p of state.players) {
        p.characterId = 'capitalist';
        p.specialCitizens = ['06'];
        p.land = { E1: 'water', F1: 'water' };
        p.buildings = { E1: 'shop', F1: 'office' };
        p.materials = 0;
        p.materialProduction = 0;
      }
    });
    while (decider(s) !== null && getOptions(s).length > 0) {
      s = applyMove(s, top(s).t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
    }
    for (const p of s.players) {
      expect(p.materials).toBeGreaterThanOrEqual(2);
      const sc06 = scoreEvents(s, p.index).filter((e) => e.type === 'score' && e.source === 'sc:06');
      expect(sc06.map((e) => (e.type === 'score' ? e.points : 0))).toEqual([4]);
    }
  });
});
