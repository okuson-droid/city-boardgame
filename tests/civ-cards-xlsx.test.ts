// 文明カード一覧（120枚）.xlsx から加えた文明カード（043 以降）の単体テスト。
// 命令セットの拡張（トラック上昇の「〜につき」、種類の数の指標、アクションの種類での絞り込み、
// 「〜枚までプレイする」）を確かめる。

import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/index.ts';
import { CELL_IDS, type CellId } from '../src/game/board.ts';
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
