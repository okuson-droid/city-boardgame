// 文明カード 105（発明王）の専用スペースの順番（ユーザー決定 2026-11-23）。
// 文言どおり「文明カードを1枚プレイする。文明カードを1枚引く。」の順に処理し、引いたカードはその場でプレイできない。
// 固定したテストのデータは古いスクリプトのため、いまの src/data/cards_civilization.json の 105 を足したデータで検査する。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_DATA, type GameData } from '../src/data/index.ts';
import { parseCivilizationCards } from '../src/data/validate.ts';
import { applyMove, getOptions } from '../src/game/engine.ts';
import type { GameState } from '../src/game/types.ts';
import { edit, firstTurn, me, withoutCharacters } from './helpers/game.ts';

const live = parseCivilizationCards(JSON.parse(readFileSync('src/data/cards_civilization.json', 'utf8')) as unknown);
const card105 = live.find((c) => c.id === '105');
if (card105 === undefined) throw new Error('文明カード 105 がない');
const d: GameData = { ...GAME_DATA, civilizationCards: GAME_DATA.civilizationCards.map((c) => (c.id === '105' ? card105 : c)) };

const ids = (s: GameState): string[] => getOptions(s, d).map((o) => o.id);

describe('105 発明王の専用スペース（ユーザー決定 2026-11-23）', () => {
  it('先に手札から1枚プレイし、その後で1枚引く（引いたカードはプレイの候補に入らない）', () => {
    // rules.md v0.8 9-2-4（文明カードのプレイ）、105 の文言と clarifications
    const deckTop = '002';
    let s = edit(withoutCharacters(firstTurn()), (state, p) => {
      for (const q of state.players) q.tempWorkers = 0;
      p.played = ['105'];
      p.hand = ['001'];
      p.gold = 50;
      state.civDeck = [deckTop, ...state.civDeck.filter((c) => c !== deckTop && c !== '001')];
    });
    const space = ids(s).find((id) => id.startsWith('space:civ:105'));
    expect(space).toBeDefined();
    s = applyMove(s, space!, d);
    // プレイの選択の時点では、まだ引いていない。
    expect(me(s).hand).toEqual(['001']);
    expect(ids(s)).toContain('card:001');
    expect(ids(s)).not.toContain(`card:${deckTop}`);
    s = applyMove(s, 'card:001', d);
    expect(me(s).played).toContain('001');
    // プレイしたカードの効果（001 は建設の選択）を処理し終えるまでは引かない。
    expect(me(s).hand).toEqual([]);
    const build = ids(s).find((id) => id.startsWith('build:'));
    expect(build).toBeDefined();
    s = applyMove(s, build!, d);
    // プレイの処理をすべて終えた後に1枚引く。
    expect(me(s).hand).toEqual([deckTop]);
  });
});
