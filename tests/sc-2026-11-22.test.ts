// 特別な市民カード 29〜33 の追加と 15（司書）の修正（ユーザー決定 2026-11-22）。
// 固定したテストのデータにはないため、いまの src/data/special_citizens.json から読んだカードを足したデータで検査する。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_DATA, type GameData } from '../src/data/index.ts';
import { parseSpecialCitizens } from '../src/data/validate.ts';
import type { CellId } from '../src/game/board.ts';
import { buildEffects } from '../src/game/core.ts';
import { metricValue, onSpecialCitizenAcquired } from '../src/game/effects.ts';
import { applyMove, getOptions } from '../src/game/engine.ts';
import { describeScript } from '../src/game/icons.ts';
import type { GameState } from '../src/game/types.ts';
import { edit, firstTurn, me, top, withoutCharacters } from './helpers/game.ts';

const live = parseSpecialCitizens(JSON.parse(readFileSync('src/data/special_citizens.json', 'utf8')) as unknown);
const pick = (id: string) => {
  const c = live.find((x) => x.id === id);
  if (c === undefined) throw new Error(`特別な市民カード ${id} がない`);
  return c;
};
const added = ['15', '29', '30', '31', '32', '33'].map(pick);
const d: GameData = {
  ...GAME_DATA,
  specialCitizens: [...GAME_DATA.specialCitizens.filter((c) => !added.some((a) => a.id === c.id)), ...added],
};

const ids = (s: GameState): string[] => getOptions(s, d).map((o) => o.id);
const play = (s: GameState, ...moves: string[]): GameState => moves.reduce((x, m) => applyMove(x, m, d), s);
const start = (setup: (s: GameState, p: GameState['players'][number]) => void): GameState =>
  edit(withoutCharacters(firstTurn()), (state, p) => {
    for (const q of state.players) q.tempWorkers = 0;
    setup(state, p);
  });

describe('特別な市民カードの追加（ユーザー決定 2026-11-22）', () => {
  it('29 地質学者：住宅以外の建物の地形ボーナスを2倍にする', () => {
    // rules.md v0.8 5-6-7（地形ボーナス）への追加
    const s = start((_, p) => {
      p.specialCitizens = ['29'];
      p.land = { E1: 'plains', E2: 'plains' };
    });
    const effects = buildEffects(d, me(s), [{ building: 'university', cell: 'E1' as CellId }]);
    const bonus = effects.find((e) => e.k === 'grant' && e.source === 'terrainBonus:university');
    expect(bonus).toMatchObject({ grant: { kind: 'points', amount: 6 } });
    expect(describeScript(pick('29').script).join('')).toContain('住宅以外');
  });

  it('30 手品師：獲得時に3枚引き、フリーアクションで手札1枚を5金か2資材にする', () => {
    let s = start((state, p) => {
      p.hand = ['001'];
      state.civDeck = ['002', '003', '004', ...state.civDeck.filter((c) => !['001', '002', '003', '004'].includes(c))];
    });
    s = edit(s, (state, p) => onSpecialCitizenAcquired(state, d, p, '30'));
    expect(me(s).hand).toEqual(['001', '002', '003', '004']);
    // 獲得した手番中はフリーアクションを使えないため、持ち物に足した局面で確かめる。
    let t = start((_, p) => {
      p.hand = ['001'];
      p.specialCitizens = ['30'];
      p.gold = 0;
    });
    t = play(t, 'ability:sc:30#1');
    expect(top(t).t).toBe('discard');
    t = play(t, 'card:001');
    expect(top(t).t).toBe('chooseOne');
    t = play(t, 'choose:0');
    expect(me(t).hand).toEqual([]);
    expect(me(t).gold).toBe(5);
    // 手札がなければ使えない。
    expect(ids(t)).not.toContain('ability:sc:30#1');
  });

  it('31 現場監督：飯場を建てると土地タイル2枚、終了時に建物5軒以上が隣接する飯場1軒につき3点', () => {
    const s = start((_, p) => {
      p.specialCitizens = ['31'];
      // D3 の隣接6マス：C3・C4・D2・D4・E3・E4
      p.land = { D3: 'plains', C3: 'plains', C4: 'plains', D2: 'plains', D4: 'plains', E3: 'plains', E4: 'plains' };
      p.buildings = { D3: 'camp', C3: 'house', C4: 'house', D2: 'house', D4: 'house' };
    });
    expect(metricValue(s, d, me(s), 'campsWithAdjacentBuildings:5')).toBe(0);
    const t = edit(s, (_, p) => {
      p.buildings.E3 = 'shop';
    });
    expect(metricValue(t, d, me(t), 'campsWithAdjacentBuildings:5')).toBe(1);
    expect(describeScript(pick('31').script).join('')).toContain('飯場');
  });

  it('32 水先案内人：獲得時に水場の土地タイルを6枚まで、地形を問わず置ける', () => {
    let s = start(() => undefined);
    s = edit(s, (state, p) => onSpecialCitizenAcquired(state, d, p, '32'));
    expect(top(s)).toMatchObject({ t: 'placeTiles', tile: 'water', remaining: 6, upTo: true });
    expect(ids(s)).toContain('done');
  });

  it('33 宝石商：獲得時に資材を好きなだけ7金に換え、輸出の後に臨時ワーカー1人を得る', () => {
    let s = start((_, p) => {
      p.materials = 3;
      p.gold = 0;
    });
    s = edit(s, (state, p) => onSpecialCitizenAcquired(state, d, p, '33'));
    expect(top(s).t).toBe('exchange');
    expect(ids(s)).toEqual(['count:0', 'count:1', 'count:2', 'count:3']);
    s = play(s, 'count:2');
    expect([me(s).materials, me(s).gold]).toEqual([1, 14]);
    let t = start((_, p) => {
      p.specialCitizens = ['33'];
      p.materials = 5;
    });
    const temps = me(t).tempWorkers;
    t = play(t, 'act:export:normal');
    while (top(t).t !== 'turn') t = play(t, ids(t).filter((x) => x !== 'count:0')[0] ?? ids(t)[0] ?? '');
    expect(me(t).tempWorkers).toBe(temps + 1);
  });

  it('15 司書：1ラウンド1回のフリーアクションで4枚引き、手札から2枚捨てる', () => {
    let s = start((_, p) => {
      p.specialCitizens = ['15'];
      p.hand = [];
    });
    s = play(s, 'ability:sc:15#0');
    expect(me(s).hand).toHaveLength(4);
    expect(top(s)).toMatchObject({ t: 'discard', remaining: 2 });
    s = play(s, ids(s)[0] ?? '');
    s = play(s, ids(s)[0] ?? '');
    expect(me(s).hand).toHaveLength(2);
    expect(top(s).t).toBe('turn');
  });
});
