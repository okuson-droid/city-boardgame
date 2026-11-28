// 砦と教練の調整（ユーザー決定 2026-11-26）。
// 教練の上昇1回の軍事力トークンを砦の数によらず一律にし、砦の建設時の軍事レベルの上昇を何軒目かで変える。
// 固定したテストのデータは旧い形のため、いまの src/data/params.json の砦の項目を差し替えたデータで検査する。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAME_DATA, type GameData } from '../src/data/index.ts';
import { checkGameData } from '../src/data/check.ts';
import { parseParams } from '../src/data/validate.ts';
import type { CellId } from '../src/game/board.ts';
import { buildEffects, fortMilitaryOnBuild } from '../src/game/core.ts';
import { applyMove, getOptions } from '../src/game/engine.ts';
import { buildingInfo } from '../src/game/reference.ts';
import type { GameState } from '../src/game/types.ts';
import { edit, firstTurn, me, withoutCharacters } from './helpers/game.ts';

const live = parseParams(JSON.parse(readFileSync('src/data/params.json', 'utf8')) as unknown);
const d: GameData = {
  ...GAME_DATA,
  params: {
    ...GAME_DATA.params,
    buildings: {
      ...GAME_DATA.params.buildings,
      limits: { ...GAME_DATA.params.buildings.limits, fort: live.buildings.limits.fort },
      effects: { ...GAME_DATA.params.buildings.effects, fort: live.buildings.effects.fort },
    },
  },
};
const fort = d.params.buildings.effects.fort;

const ids = (s: GameState): string[] => getOptions(s, d).map((o) => o.id);
const base = (setup: (p: GameState['players'][number]) => void): GameState =>
  edit(withoutCharacters(firstTurn()), (state, p) => {
    for (const q of state.players) q.tempWorkers = 0;
    setup(p);
  });

describe('砦と教練（ユーザー決定 2026-11-26）', () => {
  it('いまのデータは、教練のトークンが一律3、砦の建設時の上昇が1/2/3/4である', () => {
    // rules.md v0.8 5-5-3-2、6-3-5 への変更
    expect(fort.drillTokenCost).toBe(3);
    expect(fort.militaryOnBuildByNth).toEqual([1, 2, 3, 4]);
    expect(checkGameData(d)).toEqual([]);
  });

  it('教練の上昇1回に払うトークンは、砦の数によらず一律である', () => {
    // rules.md v0.8 6-3-5-4、5-5-3-2 への変更
    for (const forts of [0, 3]) {
      let s = base((p) => {
        p.gold = 6;
        p.militaryTokens = 4;
        p.militaryLevel = 0;
        const cells: CellId[] = ['E1', 'E3', 'E5', 'E7'];
        for (const c of cells.slice(0, forts)) {
          p.land[c] = 'plains';
          p.buildings[c] = 'fort';
        }
      });
      const levelBefore = me(s).militaryLevel;
      s = applyMove(s, 'act:drill:upper', d);
      // 教練（上位）で得たトークンを足して、1回3個で払える回数まで選べる。
      const tokens = me(s).militaryTokens;
      const counts = ids(s).filter((id) => id.startsWith('count:'));
      expect(counts.at(-1)).toBe(`count:${Math.min(Math.floor(tokens / fort.drillTokenCost!), counts.length - 1)}`);
      s = applyMove(s, 'count:1', d);
      expect(me(s).militaryTokens).toBe(tokens - 3);
      expect(me(s).militaryLevel).toBeGreaterThanOrEqual(levelBefore + 1);
    }
  });

  it('1/2/3/4軒目の砦は軍事レベルを1/2/3/4上げ、同時に2軒建てれば軒目ごとに数える', () => {
    // rules.md v0.8 5-5-3-1 への変更
    expect([1, 2, 3, 4, 5].map((n) => fortMilitaryOnBuild(d, n))).toEqual([1, 2, 3, 4, 4]);
    const p = me(
      base((q) => {
        q.land = { E1: 'plains', E3: 'plains', E5: 'plains' };
        q.buildings = { E1: 'fort' };
      }),
    );
    const effects = buildEffects(d, p, [
      { building: 'fort', cell: 'E3' as CellId },
      { building: 'fort', cell: 'E5' as CellId },
    ]);
    expect(effects.filter((e) => e.k === 'military').map((e) => (e.k === 'military' ? e.n : 0))).toEqual([2, 3]);
    expect(buildingInfo('fort', d).onBuild.join('')).toContain('1/2/3/4');
  });

  it('旧い形のデータ（一律の上昇・砦の数ごとのトークン）も読める', () => {
    // 固定したテストのデータとの互換
    const old = GAME_DATA.params.buildings.effects.fort;
    expect(old.drillTokenCost).toBeNull();
    expect(old.militaryOnBuildByNth.length).toBe(1);
  });
});
