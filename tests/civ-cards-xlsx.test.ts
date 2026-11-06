// 文明カード一覧（120枚）.xlsx から加えた文明カード（043 以降）の単体テスト。
// 命令セットの拡張（トラック上昇の「〜につき」、種類の数の指標、アクションの種類での絞り込み、
// 「〜枚までプレイする」）を確かめる。

import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/index.ts';
import { CELL_IDS, type CellId } from '../src/game/board.ts';
import { terrainOf } from '../src/game/core.ts';
import { applyMove } from '../src/game/engine.ts';
import { describeScript, iconSequence } from '../src/game/icons.ts';
import type { GameState, PlayerState } from '../src/game/types.ts';
import { edit, firstTurn, ids, me, play, withoutCharacters } from './helpers/game.ts';

const d = GAME_DATA;

const idOf = (name: string): string => {
  const card = d.civilizationCards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} がない`);
  return card.id;
};

const costOf = (id: string): number => d.civilizationCards.find((c) => c.id === id)?.cost.gold ?? 0;

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

/** 土地タイルのある空きマスを返す。 */
const terrainOfCell = (p: PlayerState, cell: CellId): string => terrainOf(d, p, cell);

const landCells = (p: PlayerState): CellId[] => CELL_IDS.filter((c) => p.land[c] !== undefined && p.buildings[c] === undefined);

describe('xlsx から加えた文明カードのデータ', () => {
  const added = d.civilizationCards.slice(42);

  it('043 以降は連番で、名前は重ならず、仮置きの印と効果スクリプトを持つ', () => {
    // 指示書 1（仮置きの印）、docs/civ-cards-xlsx.md
    expect(added.map((c) => c.id)).toEqual(added.map((_, i) => String(43 + i).padStart(3, '0')));
    const names = d.civilizationCards.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const card of added) {
      expect(card.provisional).toBe(true);
      expect(card.provisionalFields).toEqual(['playCondition', 'effectCondition', 'points']);
      expect(card.script.length).toBeGreaterThan(0);
      expect(card.text.startsWith('プレイ時：')).toBe(false);
    }
  });

  it('すべての効果スクリプトからアイコンの並びと補足の文章を組み立てられる', () => {
    // ui_design.md 0-1
    for (const card of added) {
      expect(iconSequence(card.script).length).toBeGreaterThan(0);
      expect(describeScript(card.script).length).toBeGreaterThan(0);
    }
  });
});

describe('命令の拡張', () => {
  it('衛生学：建設済みの大学1軒につきインフラレベルを1上げる（raise の「〜につき」）', () => {
    // rules.md v0.8 9-2-4、8-1-1
    const card = idOf('衛生学');
    const s = playCard(base(), card, (p) => {
      const [a, b] = landCells(p);
      if (a === undefined || b === undefined) throw new Error('空きマスが足りない');
      p.buildings[a] = 'university';
      p.buildings[b] = 'university';
      p.infraLevel = 0;
    });
    const p = s.players.find((q) => q.played.includes(card));
    expect(p?.infraLevel).toBe(2);
  });

  it('民兵：通常ワーカー3人につき軍事レベルを1上げる', () => {
    // rules.md v0.8 9-2-4、7-1-2
    const card = idOf('民兵');
    const s = playCard(base(), card, (p) => {
      p.militaryLevel = 0;
      p.regularWorkers = 7;
    });
    const p = s.players.find((q) => q.played.includes(card));
    expect(p?.militaryLevel).toBe(2);
  });

  it('土地転がし：建物のない土地タイルの地形の種類1つにつき6金', () => {
    // rules.md v0.8 9-2-4
    const card = idOf('土地転がし');
    let expected = 0;
    const s = playCard(base(), card, (p) => {
      expected = new Set(landCells(p).map((c) => p.land[c])).size;
    });
    expect(expected).toBeGreaterThan(0);
    expect(me(s).gold).toBe(100 - costOf(card) + 6 * expected);
  });

  it('テナント料：建設済みの建物の種類1つにつき4金（同じ種類は1回だけ数える）', () => {
    // rules.md v0.8 9-2-4
    const card = idOf('テナント料');
    const s = playCard(base(), card, (p) => {
      for (const c of CELL_IDS) delete p.buildings[c];
      const kinds = ['house', 'house', 'shop'] as const;
      CELL_IDS.slice(0, kinds.length).forEach((c, i) => {
        p.land[c] = 'plains';
        p.buildings[c] = kinds[i];
      });
    });
    expect(me(s).gold).toBe(100 - costOf(card) + 4 * 2);
  });

  it('引継ぎ：1枚引いた後のプレイは「プレイを終える」で見送れる', () => {
    // rules.md v0.8 9-2-4（「プレイできる」は任意）
    const card = idOf('引継ぎ');
    let s = edit(base(), (state, p) => {
      state.civDeck = ['004', ...state.civDeck.filter((c) => c !== '004')];
    });
    s = playCard(s, card);
    expect(me(s).hand).toEqual(['004']);
    expect(ids(s)).toContain('card:004');
    expect(ids(s)).toContain('done');
    s = applyMove(s, 'done');
    expect(s.players.find((q) => q.played.includes(card))?.hand).toEqual(['004']);
  });

  it('開発サイクル：研究アクションの後に文明カードのプレイを選べ、他のアクションでは選べない', () => {
    // rules.md v0.8 16-1-4（常時効果）
    const card = idOf('開発サイクル');
    const setup = (state: GameState, p: PlayerState): void => {
      p.played = [card];
      p.hand = ['004', '005'];
      p.gold = 100;
    };
    const research = applyMove(edit(base(), setup), 'act:research:normal');
    expect(research.stack.some((t) => t.t === 'playCard')).toBe(true);
    const imported = applyMove(edit(base(), setup), 'act:import:normal');
    expect(imported.stack.some((t) => t.t === 'playCard')).toBe(false);
  });
});

describe('所持しているタグ（ユーザー決定 2026-11-06）', () => {
  it('学資：プレイ済みの学術タグ1つにつき2金。プレイ中の自身を数える', () => {
    // ユーザー決定 2026-11-06（プレイ済みの文明カードのタグ、自身を含む）、rules.md v0.8 9-2-4
    const card = idOf('学資');
    const s = playCard(base(), card, (p) => {
      // 001（学術）と 004（経済）。学術は 001 と学資自身の2枚。
      p.played = ['001', '004'];
    });
    expect(me(s).gold).toBe(100 - costOf(card) + 2 * 2);
  });

  it('環境保全金：環境タグが1つ以上で10金、3つ以上で更に10金', () => {
    // ユーザー決定 2026-11-06、rules.md v0.8 9-2-7（各条件は個別に判定する）
    const card = idOf('環境保全金');
    const gold = (played: string[]): number => me(playCard(base(), card, (p) => (p.played = played))).gold;
    expect(gold([])).toBe(100 - costOf(card));
    expect(gold(['002'])).toBe(100 - costOf(card) + 10);
    expect(gold(['002', '006', '007'])).toBe(100 - costOf(card) + 20);
  });
});

describe('カードの効果が rules.md に優先する5枚（ユーザー決定 2026-11-06）', () => {
  /** 手番のプレイヤーにプレイ済みのカードを持たせる。 */
  const holding = (card: string, setup: (p: PlayerState) => void = () => undefined): GameState =>
    edit(base(), (_, p) => {
      p.played = [card];
      p.gold = 100;
      setup(p);
    });

  it('大規模開拓：地形と同じ種類だけを、種類ごとに1枚まで置き、途中で終えられる', () => {
    // ユーザー決定 2026-11-06（4種を1枚ずつ、地形と異なる種類は置けない、順番は選べる）、rules.md v0.8 4-2-2
    const card = idOf('大規模開拓');
    let s = playCard(base(), card);
    const p0 = me(s);
    const tiles = ids(s).filter((id) => id.startsWith('tile:'));
    expect(tiles.length).toBeGreaterThan(0);
    // 地形と異なる種類の選択肢はない。
    for (const id of tiles) {
      const [, cell, tile] = id.split(':');
      expect(tile).toBe(terrainOfCell(p0, cell as CellId));
    }
    expect(ids(s)).toContain('done');
    const first = tiles[0] ?? '';
    const used = first.split(':')[2];
    s = applyMove(s, first);
    // 置いた種類はもう置けない。
    expect(ids(s).filter((id) => id.startsWith('tile:')).every((id) => id.split(':')[2] !== used)).toBe(true);
    s = applyMove(s, 'done');
    expect(s.stack.some((t) => t.t === 'placeTiles')).toBe(false);
  });

  it('強行軍：遠征報酬の土地タイルは地形と異なる種類も置ける', () => {
    // ユーザー決定 2026-11-06（4-2-2 に優先する）、rules.md v0.8 6-3-6-2
    const reward = d.params.actions.expedition.rewards.findIndex((r) => r.grants.some((g) => g.kind === 'landTiles'));
    const level = d.params.actions.expedition.rewards[reward]?.level ?? 0;
    const tileOptions = (card: string | null): string[] => {
      let s = edit(base(), (_, p) => {
        p.played = card === null ? [] : [card];
        p.militaryLevel = level;
      });
      s = play(s, 'act:expedition:normal', `reward:${reward}`);
      if (ids(s).includes('done')) s = applyMove(s, 'done');
      return ids(s).filter((id) => id.startsWith('tile:'));
    };
    const without = tileOptions(null);
    const withCard = tileOptions(idOf('強行軍'));
    expect(new Set(without.map((id) => id.split(':')[2])).size).toBeLessThanOrEqual(new Set(without.map((id) => id.split(':')[1])).size);
    expect(withCard.length).toBe(new Set(withCard.map((id) => id.split(':')[1])).size * 4);
    expect(withCard.length).toBeGreaterThan(without.length);
  });

  it('傭兵団：トークンが足りない分は2金で払い、使ったトークンも支払いの直後に金に替えられる', () => {
    // ユーザー決定 2026-11-06（軍事力トークンを使うすべての場面、替える数は選べる）、rules.md v0.8 6-3-6-4
    const card = idOf('傭兵団');
    const top = d.params.actions.expedition.rewards.reduce((a, r) => Math.max(a, r.level), 0);
    const reward = d.params.actions.expedition.rewards.findIndex((r) => r.level === top);
    let s = holding(card, (p) => {
      p.militaryLevel = 0;
      p.militaryTokens = 1;
    });
    // トークン1つでも、金で補えば最高レベルの報酬を選べる。
    s = applyMove(s, 'act:expedition:normal');
    expect(ids(s)).toContain(`reward:${reward}`);
    const gold = me(s).gold;
    s = applyMove(s, `reward:${reward}`);
    if (ids(s).includes('done')) s = applyMove(s, 'done');
    // トークン1つを使い、残り top−1 個を金で払った。使った1つを金に替えるかを尋ねる。
    expect(s.stack.at(-1)?.t).toBe('tokenSwap');
    const owner = s.players.find((q) => q.played.includes(card));
    expect(owner?.militaryTokens).toBe(0);
    expect(owner?.gold).toBe(gold - (top - 1) * 2);
    expect(ids(s)).toEqual(['count:0', 'count:1']);
    s = applyMove(s, 'count:1');
    const after = s.players.find((q) => q.played.includes(card));
    expect(after?.militaryTokens).toBe(1);
    expect(after?.gold).toBe(gold - top * 2);
  });

  it('雲隠れ：襲撃の処理をすべて行わないことを選べる', () => {
    // ユーザー決定 2026-11-06（宣言・判定・得点・カードの効果をすべて行わない）、rules.md v0.8 7-3
    const card = idOf('雲隠れ');
    let s = edit(base(), (state) => {
      for (const p of state.players) p.played = [card];
    });
    while (s.stack.at(-1)?.t !== 'raidDeclare') s = applyMove(s, s.stack.at(-1)?.t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
    expect(ids(s)).toContain('raid:skip');
    const player = me(s);
    const score = player.score;
    const events = s.events.length;
    s = applyMove(s, 'raid:skip');
    expect(s.players[player.index]?.score).toBe(score);
    expect(s.events.slice(events).some((e) => e.type === 'raid' && e.player === player.index)).toBe(false);
  });

  it('特別任務：通常の遠征で同じ報酬を2回選べる', () => {
    // ユーザー決定 2026-11-06（書いてあるとおり）、rules.md v0.8 6-3-6-6
    const free = d.params.actions.expedition.rewards.findIndex((r) => r.level === 0);
    const picks = (card: string | null): string[] => {
      let s = edit(base(), (_, p) => {
        p.played = card === null ? [] : [card];
        p.militaryLevel = 0;
      });
      s = play(s, 'act:expedition:normal', `reward:${free}`);
      return ids(s);
    };
    expect(picks(null)).not.toContain(`reward:${free}`);
    expect(picks(idOf('特別任務'))).toContain(`reward:${free}`);
  });
});

describe('推しの解釈で加えた16枚（ユーザー決定 2026-11-06）', () => {
  const score = (s: GameState, index: number): number => s.players[index]?.score ?? 0;
  const ownerOf = (s: GameState, card: string): PlayerState => {
    const p = s.players.find((q) => q.played.includes(card));
    if (p === undefined) throw new Error(`${card} の持ち主がいない`);
    return p;
  };
  /** 選択肢のうち、指定の前置きで始まる最初のもの。 */
  const first = (s: GameState, prefix: string): string => {
    const id = ids(s).find((x) => x.startsWith(prefix));
    if (id === undefined) throw new Error(`${prefix} の選択肢がない：${ids(s).join(',')}`);
    return id;
  };

  it('発明王：普及アクションの処理をすべて終えた後に1枚引く', () => {
    // ユーザー決定 2026-11-06（「実行後」）、rules.md v0.8 6-3-10
    const card = idOf('発明王');
    let s = edit(base(), (_, p) => {
      p.played = [card];
      p.hand = ['004', '005'];
      p.gold = 100;
    });
    s = applyMove(s, 'act:spread:normal');
    // 普及の途中では引かない。
    expect(me(s).hand).toEqual(['004', '005']);
    s = applyMove(s, 'card:004');
    const p = ownerOf(s, card);
    expect(p.hand).toHaveLength(2);
    expect(p.hand).toContain('005');
  });

  it('温故知新・学術評価：プレイ済みの文明カードにプレイ中の自身を数える', () => {
    // ユーザー決定 2026-11-06
    const card = idOf('温故知新');
    const s = playCard(base(), card, (p) => (p.played = ['001', '002']));
    expect(me(s).gold).toBe(100 - costOf(card) + 2 * 3);
  });

  it('名誉ある犠牲：防衛失敗で点数を失わない', () => {
    // ユーザー決定 2026-11-06、rules.md v0.8 7-5-1
    const card = idOf('名誉ある犠牲');
    const afterRaid = (played: string[]): { before: number; after: number; result: string } => {
      let s = edit(base(), (state) => {
        for (const p of state.players) {
          p.played = played;
          p.militaryLevel = 0;
          p.militaryTokens = 0;
        }
      });
      while (s.stack.at(-1)?.t !== 'raidDeclare') s = applyMove(s, s.stack.at(-1)?.t === 'turn' ? 'pass' : (ids(s)[0] ?? ''));
      const index = me(s).index;
      const before = score(s, index);
      const events = s.events.length;
      s = applyMove(s, 'raid:none');
      const raid = s.events.slice(events).find((e) => e.type === 'raid' && e.player === index);
      return { before, after: score(s, index), result: raid?.type === 'raid' ? raid.result : '' };
    };
    const without = afterRaid([]);
    expect(without.result).toBe('defenseFailed');
    expect(without.after).toBeLessThan(without.before);
    const withCard = afterRaid([card]);
    expect(withCard.after).toBe(withCard.before);
  });

  it('兵法：手札を0〜2枚捨て、捨てた枚数だけ軍事レベルを上げる', () => {
    // ユーザー決定 2026-11-06、rules.md v0.8 7-1-2
    const card = idOf('兵法');
    let s = edit(base(), (_, p) => {
      p.hand = [card, '001', '002'];
      p.gold = 100;
      p.militaryLevel = 0;
    });
    s = play(s, 'act:spread:normal', `card:${card}`);
    expect(ids(s)).toEqual(expect.arrayContaining(['card:001', 'card:002', 'done']));
    s = play(s, 'card:001', 'done');
    const p = ownerOf(s, card);
    expect(p.hand).toEqual(['002']);
    expect(p.militaryLevel).toBe(1);
  });

  it('関税：他のプレイヤーの輸入アクションでも2金を得る', () => {
    // ユーザー決定 2026-11-06（「いずれかのプレイヤーが」）、rules.md v0.8 16-1-4
    const card = idOf('関税');
    let other = -1;
    let s = edit(base(), (state, p) => {
      p.gold = 100;
      const q = state.players.find((x) => x.index !== p.index);
      if (q === undefined) throw new Error('他のプレイヤーがいない');
      q.played = [card];
      other = q.index;
    });
    const gold = s.players[other]?.gold ?? 0;
    s = applyMove(s, 'act:import:normal');
    expect(s.players[other]?.gold).toBe(gold + 2);
  });

  it('建設業：住宅以外の建物を建てる度に2金、住宅では得ない', () => {
    // ユーザー決定 2026-11-06、rules.md v0.8 16-1-4
    const card = idOf('建設業');
    const gold = (building: string): number => {
      let s = playCard(base(), '001', (p) => (p.played = [card]));
      const before = me(s).gold;
      s = applyMove(s, first(s, `build:${building}:`));
      return ownerOf(s, card).gold - before;
    };
    expect(gold('shop')).toBe(2);
    expect(gold('house')).toBe(0);
  });

  it('注文住宅：1回のアクションで住宅を2軒以上建てたら、アクションを終えた時に臨時ワーカー1人', () => {
    // ユーザー決定 2026-11-06、rules.md v0.8 3-4
    const card = idOf('注文住宅');
    const housing = idOf('公団住宅');
    const temp = (houses: number): number => {
      let s = playCard(base(), housing, (p) => {
        p.played = [card];
        // 住宅を建てられる土地を用意する。
        for (const c of CELL_IDS.slice(0, 8)) if (p.land[c] === undefined) p.land[c] = 'plains';
      });
      for (let i = 0; i < houses; i += 1) s = applyMove(s, first(s, 'build:house:'));
      if (ids(s).includes('done')) s = applyMove(s, 'done');
      return ownerOf(s, card).tempWorkers;
    };
    expect(temp(1)).toBe(0);
    expect(temp(2)).toBe(1);
    expect(temp(3)).toBe(1);
  });

  it('開拓小屋：建築アクションで住宅1軒だけを建てたら、土地タイルを1枚置く', () => {
    // ユーザー決定 2026-11-06（「建設アクション」は建築アクション）、rules.md v0.8 6-3-2
    const card = idOf('開拓小屋');
    const after = (building: string): GameState => {
      let s = edit(base(), (_, p) => {
        p.played = [card];
        p.gold = 100;
        p.materials = 20;
      });
      s = applyMove(s, 'act:build:normal');
      s = applyMove(s, first(s, `build:${building}:`));
      if (ids(s).includes('done')) s = applyMove(s, 'done');
      return s;
    };
    expect(after('house').stack.at(-1)?.t).toBe('placeTiles');
    expect(after('shop').stack.at(-1)?.t).not.toBe('placeTiles');
  });

  it('公務：インフラレベルが1上がる度に1資材', () => {
    // ユーザー決定 2026-11-06、rules.md v0.8 8-1-1
    const card = idOf('公務');
    const materials = (played: string[]): number =>
      me(
        playCard(base(), '011', (p) => {
          p.played = played;
          p.infraLevel = 0;
          p.materials = 0;
        }),
      ).materials;
    expect(materials([card]) - materials([])).toBe(1);
  });

  it('山小屋・森の小屋・平屋・水車小屋：その地形のマスにだけ、同じ種類の土地タイルを置く', () => {
    // ユーザー決定 2026-11-06、rules.md v0.8 4-2-2
    const huts: [string, string][] = [
      ['山小屋', 'mountain'],
      ['森の小屋', 'forest'],
      ['平屋', 'plains'],
      ['水車小屋', 'water'],
    ];
    let seen = 0;
    for (const [name, terrain] of huts) {
      let s = playCard(base(), idOf(name));
      if (s.stack.at(-1)?.t === 'chooseOrder') s = applyMove(s, first(s, 'order:'));
      const p = me(s);
      const tiles = ids(s).filter((id) => id.startsWith('tile:'));
      seen += tiles.length;
      for (const id of tiles) {
        const [, cell, tile] = id.split(':');
        expect(tile).toBe(terrain);
        expect(terrainOfCell(p, cell as CellId)).toBe(terrain);
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('繁栄：先に住宅を建て、その住宅を含めて1軒につき1点', () => {
    // ユーザー決定 2026-11-06（書いてある順に処理する）
    const card = idOf('繁栄');
    let s = playCard(base(), card, (p) => {
      for (const c of CELL_IDS) delete p.buildings[c];
    });
    const index = me(s).index;
    const before = score(s, index);
    s = applyMove(s, first(s, 'build:house:'));
    expect(score(s, index)).toBe(before + 1);
  });

  it('移動住宅：カードの上の住宅は住宅の数と「建設した時」に数え、盤面には置かない', () => {
    // ユーザー決定 2026-11-06
    const card = idOf('移動住宅');
    const street = idOf('住宅街');
    let cells = 0;
    let before = 0;
    const s = playCard(base(), card, (p) => {
      p.played = [street];
      cells = CELL_IDS.filter((c) => p.buildings[c] !== undefined).length;
      before = p.score;
    });
    const p = ownerOf(s, card);
    expect(p.cardHouses).toBe(2);
    expect(CELL_IDS.filter((c) => p.buildings[c] !== undefined)).toHaveLength(cells);
    // 住宅街：住宅を建設する度に1点。
    expect(p.score).toBe(before + 2);
  });
});
