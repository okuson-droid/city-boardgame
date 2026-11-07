import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/index.ts';
import { BUILDINGS } from '../src/data/types.ts';
import { buildingInfo, describeBuilding, describeExpeditionRewards, expeditionRows, grantText, unlockText } from '../src/game/queries.ts';
import { edit, firstTurn, me, withoutCharacters } from './helpers/game.ts';

const d = GAME_DATA;

describe('早見表と吹き出しの説明（ユーザー決定 2026-11-07）', () => {
  it('建物の説明は params.json の値から組み立てる', () => {
    // rules.md v0.8 5-3、5-4、5-5（数値は 2026-11-07 の調整を含む params.json の値）
    for (const b of BUILDINGS) {
      const text = describeBuilding(b);
      expect(text).toContain(`金${d.params.buildings.cost[b].gold}・資材${d.params.buildings.cost[b].materials}`);
      expect(text).toContain(`上限${d.params.buildings.limits[b]}軒`);
    }
    const shop = buildingInfo('shop');
    expect(shop.onBuild).toEqual([`金の生産力＋${d.params.buildings.effects.shop.goldProductionOnBuild}`]);
    expect(shop.endScore).toContain('5・4・3');
    expect(shop.unlocks).toEqual(['2軒で輸入の最上位を解放']);
    expect(buildingInfo('office').endScore).toContain('0.5・1・2');
    expect(buildingInfo('fort').always[0]).toContain('3・2・1');
    expect(buildingInfo('university').terrainBonus).toEqual(['平原：3点を得る']);
    expect(buildingInfo('house').unlocks).toEqual(['5軒で移住の最上位を解放']);
  });

  it('遠征の報酬表は軍事レベルで届く報酬を示し、指揮官の追加報酬を含める', () => {
    // rules.md v0.8 6-3-6、19-2-6
    const plain = edit(withoutCharacters(firstTurn()), (_, p) => {
      p.militaryLevel = 4;
    });
    const rows = expeditionRows(me(plain));
    expect(rows.map((r) => r.level)).toEqual([0, 1, 4, 7, 10]);
    expect(rows.filter((r) => r.reachable).map((r) => r.level)).toEqual([0, 1, 4]);
    expect(rows[0]?.text).toBe('金2を得る');
    const commander = edit(plain, (_, p) => {
      p.characterId = 'commander';
    });
    const withExtra = expeditionRows(me(commander));
    expect(withExtra.filter((r) => r.extra).map((r) => r.level)).toEqual([6, 9]);
    expect(describeExpeditionRewards(me(commander))).toContain('Lv6 文明カードを1枚引く（追加）');
  });

  it('到達報酬と解放条件の文', () => {
    // rules.md v0.8 8-1-2（2026-11-07 の調整）、6-3
    expect(grantText({ kind: 'goldProduction', amount: 2 })).toBe('金の生産力を2上げる');
    expect(grantText({ kind: 'specialCitizen', amount: 1 })).toBe('特別な市民カード1枚を獲得する');
    expect(unlockText(d.params.actions.unlockTop.expedition)).toBe('軍事レベル5');
    expect(unlockText(d.params.actions.unlockTop.pioneer)).toBe('建物4軒');
  });
});
