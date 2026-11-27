// 特別な市民カード35「一番槍 カブト」：カードの上に砦を建てる（ユーザー決定 2026-11-27）。
// カードの上の砦も、建設時効果（何軒目かで変わる軍事レベルの上昇）を起こし、砦の軒数と上限に数える。上限なら建てずに終わる。
import { describe, expect, it } from 'vitest';
import { GAME_DATA, type GameData } from '../src/data/index.ts';
import { buildingCount, buildOnCard, fortMilitaryOnBuild } from '../src/game/core.ts';
import { buildingBreakdown, buildingsOnCard } from '../src/game/queries.ts';
import type { GameState } from '../src/game/types.ts';
import { edit, firstTurn, me, withoutCharacters } from './helpers/game.ts';

const d: GameData = GAME_DATA;
const forts = (s: GameState, cells: readonly string[]) =>
  edit(s, (_, p) => {
    for (const c of cells) {
      p.land[c as keyof typeof p.land] = 'plains';
      p.buildings[c as keyof typeof p.buildings] = 'fort';
    }
  });

describe('カードの上の砦（ユーザー決定 2026-11-27）', () => {
  it('建設時効果を何軒目かで起こし、砦の軒数に数える', () => {
    // rules.md v0.8 5-5-3-1、5-3（建物の上限）への追加
    const s0 = forts(withoutCharacters(firstTurn()), ['E1']);
    const level = me(s0).militaryLevel;
    const s = edit(s0, (state, p) => buildOnCard(state, d, p, 'fort', 1, 'sc:35'));
    expect(buildingCount(me(s), 'fort')).toBe(2);
    expect(buildingBreakdown(me(s), 'fort')).toEqual({ board: 1, onCards: 1 });
    expect(buildingsOnCard(me(s), 'sc:35')).toEqual([{ building: 'fort', count: 1 }]);
    expect(me(s).militaryLevel).toBe(level + fortMilitaryOnBuild(d, 2));
    expect(s.events.some((e) => e.type === 'built' && e.cell === null && e.building === 'fort')).toBe(true);
  });

  it('砦が上限なら建てずに終わる', () => {
    // rules.md v0.8 5-3（建物の上限）
    const limit = d.params.buildings.limits.fort;
    const cells = ['E1', 'E3', 'E5', 'E7', 'C1', 'C3'].slice(0, limit);
    const s0 = forts(withoutCharacters(firstTurn()), cells);
    const level = me(s0).militaryLevel;
    const s = edit(s0, (state, p) => buildOnCard(state, d, p, 'fort', 1, 'sc:35'));
    expect(buildingCount(me(s), 'fort')).toBe(limit);
    expect(me(s).militaryLevel).toBe(level);
    expect(s.events.some((e) => e.type === 'fizzle')).toBe(true);
  });
});
