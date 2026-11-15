// 計画都市の達成の見込み（ユーザー決定 2026-11-15、src/game/prospect.ts）。
import { describe, expect, it } from 'vitest';
import { GAME_DATA } from '../src/data/index.ts';
import { natureParkProspect, parkSetSummary, plannedCityProspect, prospectSummary } from '../src/game/prospect.ts';
import { workerSummary } from '../src/game/queries.ts';
import type { GameData, NatureParkCard, PlannedCityCard } from '../src/data/index.ts';
import type { CellId } from '../src/game/board.ts';
import type { PlayerState } from '../src/game/types.ts';
import { firstTurn, me, withoutCharacters } from './helpers/game.ts';

const d = GAME_DATA;

/** 直線3軒：平原の住宅・商店（土地は任意）・水場（建物は任意）。tests/effects.test.ts の TEST_PLANNED と同じ。 */
const card: PlannedCityCard = {
  id: 'PCT',
  name: 'テスト用の計画都市',
  shape: '直線3軒',
  slots: [
    { q: 0, r: 0, terrain: 'plains', building: 'house' },
    { q: 1, r: 0, terrain: null, building: 'shop' },
    { q: 2, r: 0, terrain: 'water', building: null },
  ],
  benefits: [{ kind: 'gold', amount: 3 }],
  provisional: true,
};

const player = (setup: (p: PlayerState) => void): PlayerState => {
  const p = structuredClone(me(withoutCharacters(firstTurn())));
  p.land = {};
  p.buildings = {};
  p.spiritChips = {};
  setup(p);
  return p;
};

describe('計画都市の達成の見込み', () => {
  it('条件を満たしていれば達成とし、足りないもの0の配置を先頭に出す', () => {
    // rules.md v0.8 13-2、19-1-6
    const p = player((q) => {
      q.land = { E1: 'plains', E2: 'forest', E3: 'water' };
      q.buildings = { E1: 'house', E2: 'shop', E3: 'office' };
    });
    const r = plannedCityProspect(d, p, card);
    expect(r.achieved).toBe(true);
    expect(r.placements[0]?.steps).toBe(0);
    expect(prospectSummary(r)).toBe('達成している');
  });

  it('建物が1軒足りないだけなら「あと1（建物1）」とし、そのマスを示す', () => {
    // rules.md v0.8 13-2-2（土地種のみ指定したマスにも建物が要る）
    const p = player((q) => {
      q.land = { E1: 'plains', E2: 'forest', E3: 'water' };
      q.buildings = { E1: 'house', E2: 'shop' };
    });
    const r = plannedCityProspect(d, p, card);
    expect(r.achieved).toBe(false);
    const best = r.placements[0];
    expect(best?.steps).toBe(1);
    expect(best?.slots.filter((s) => s.status !== 'done').map((s) => s.cell)).toEqual(['E3']);
    expect(prospectSummary(r)).toBe('あと1（建物1）');
  });

  it('別の建物が建ったマスや、違う種類の土地タイルを置いたマスを使う配置は数えない', () => {
    // rules.md v0.8 13-2、5-1-1（建物は建て替えない）
    const p = player((q) => {
      q.land = { E1: 'plains', E2: 'forest', E3: 'mountain' };
      q.buildings = { E2: 'fort' };
    });
    const r = plannedCityProspect(d, p, card, 1000);
    for (const placement of r.placements) {
      for (const slot of placement.slots) {
        const building = p.buildings[slot.cell];
        if (building !== undefined) expect(slot.building === null || slot.building === building).toBe(true);
        const land = p.land[slot.cell];
        if (land !== undefined && slot.terrain !== null) expect(land).toBe(slot.terrain);
      }
    }
    expect(r.placements.some((pl) => pl.slots.some((s) => s.cell === 'E2' && s.building === 'shop'))).toBe(false);
  });

  it('形が開拓済みの土地から離れていれば、つなぐ土地タイルの数を足す', () => {
    // rules.md v0.8 4-2-1（土地タイルは開拓済みの土地に隣接して置く）
    const p = player((q) => {
      q.land = { A1: 'plains' };
    });
    const r = plannedCityProspect(d, p, card, 1000);
    // A1 を平原の住宅のマスに使えば、土地2枚・建物3軒でつなぐタイルは要らない。
    expect(r.placements[0]).toMatchObject({ tiles: 2, buildings: 3, bridge: 0, steps: 5 });
    expect(r.placements.some((pl) => pl.bridge > 0 && pl.steps === pl.tiles + pl.buildings + pl.bridge)).toBe(true);
  });

  it('建物を上限まで建てた種類が新たに要る配置は数えない', () => {
    // rules.md v0.8 5-3（建物の上限）
    const limit = d.params.buildings.limits.shop;
    const shops = ['C2', 'C4', 'C6', 'E2', 'E4', 'E6'].slice(0, limit) as CellId[];
    const p = player((q) => {
      for (const c of shops) {
        q.land[c] = 'mountain';
        q.buildings[c] = 'shop';
      }
    });
    const r = plannedCityProspect(d, p, card, 1000);
    expect(r.placementCount).toBeGreaterThan(0);
    for (const placement of r.placements) {
      const shopSlot = placement.slots.find((s) => s.building === 'shop');
      expect(shopSlot?.status).toBe('done');
    }
  });

  it('地形と違う種類が要るマスに印を付け、何も置いていない盤面でも配置を数える', () => {
    // rules.md v0.8 4-2-2（地形と違う種類は追加の資材）
    const p = player(() => undefined);
    const r = plannedCityProspect(d, p, card, 1000);
    expect(r.placementCount).toBeGreaterThan(0);
    for (const placement of r.placements) {
      expect(placement.tiles).toBe(3);
      expect(placement.mismatches).toBe(placement.slots.filter((s) => s.mismatch).length);
    }
    expect(r.placements[0]?.mismatches).toBe(0);
  });
});

describe('通常ワーカーをいま何人増やせるか（ユーザー決定 2026-11-15）', () => {
  it('上限から持っている数を引き、上限を1人増やすのに要る住宅の数を出す', () => {
    // rules.md v0.8 3-3-1-2（通常ワーカーの上限は5＋住宅÷2、最大10）
    const w = d.params.workers;
    const p = player((q) => {
      q.regularWorkers = w.regularBase - 1;
      q.land = { E1: 'plains' };
      q.buildings = { E1: 'house' };
    });
    const s = workerSummary(p, d);
    expect(s.regularCap).toBe(w.regularBase);
    expect(s.regularOwned).toBe(w.regularBase - 1);
    expect(s.regularRoom).toBe(1);
    expect(s.housesToNextCap).toBe(w.housesPerExtraRegular - 1);
    p.regularWorkers = w.regularBase + 3;
    expect(workerSummary(p, d).regularRoom).toBe(0);
  });
});

/** 2枚（森林・水場）と3枚（森林・山岳・森林の直線）のセットを持つテスト用の自然公園。 */
const park: NatureParkCard = {
  id: 'NPT',
  name: 'テスト用の自然公園',
  sets: [
    { cells: [{ q: 0, r: 0, terrain: 'forest' }, { q: 1, r: 0, terrain: 'water' }] },
    { cells: [{ q: 0, r: 0, terrain: 'forest' }, { q: 1, r: 0, terrain: 'mountain' }, { q: 2, r: 0, terrain: 'forest' }] },
  ],
  provisional: true,
};
const parkData: GameData = { ...d, natureParkCards: [...d.natureParkCards, park] };

describe('自然公園の達成の見込み（ユーザー決定 2026-11-15）', () => {
  it('建物のない土地に形があればそのセットは形があるとし、いまの得点を出す', () => {
    // rules.md v0.8 14-2、14-3-1、14-3-4
    const p = player((q) => {
      q.natureParkCard = 'NPT';
      q.land = { E1: 'forest', E2: 'water' };
    });
    const r = natureParkProspect(parkData, p, park);
    expect(r.sets[0]?.achieved).toBe(true);
    expect(parkSetSummary(r.sets[0]!)).toBe('形がある');
    expect(r.score).toBe(d.params.scoring.natureParkPointsBySetSize['2']);
    expect(r.maxScore).toBe((d.params.scoring.natureParkPointsBySetSize['2'] ?? 0) + (d.params.scoring.natureParkPointsBySetSize['3'] ?? 0));
  });

  it('建物の建ったマスは使えず、足りない土地の数を「あと」で出す', () => {
    // rules.md v0.8 14-3-1（建物の建っていない土地だけが対象）
    const p = player((q) => {
      q.natureParkCard = 'NPT';
      q.land = { E1: 'forest', E2: 'water' };
      q.buildings = { E2: 'house' };
    });
    const r = natureParkProspect(parkData, p, park, 1000);
    expect(r.sets[0]?.achieved).toBe(false);
    for (const placement of r.sets[0]?.placements ?? []) {
      expect(placement.slots.some((s) => s.cell === 'E2')).toBe(false);
      expect(placement.kind).toBe('park');
      expect(placement.buildings).toBe(0);
    }
    expect(r.sets[0]?.placements[0]?.steps).toBe(1);
    expect(parkSetSummary(r.sets[0]!)).toBe('あと1（土地1）');
    expect(r.score).toBe(0);
  });
});
