import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CELL_IDS } from '../src/game/board.ts';
import {
  DataValidationError,
  GAME_DATA,
  RAW_GAME_DATA,
  TERRAINS,
  checkGameData,
  parseGameData,
  type GameData,
  type RawGameData,
} from '../src/data/index.ts';

const designPath = (name: string): string => join(__dirname, '..', 'design', name);
const readDesignJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(designPath(name), 'utf8')) as Record<string, unknown>;

/** 生データの深い写しに変更を加える。 */
const mutateRaw = (mutate: (raw: Record<string, unknown>) => void): RawGameData => {
  const copy = structuredClone(RAW_GAME_DATA) as unknown as Record<string, unknown>;
  mutate(copy);
  return copy as unknown as RawGameData;
};

const at = (value: unknown, ...keys: (string | number)[]): Record<string, unknown> => {
  let current: unknown = value;
  for (const key of keys) {
    current = (current as Record<string | number, unknown>)[key];
  }
  return current as Record<string, unknown>;
};

const issuesOf = (data: GameData): string[] => checkGameData(data).map((i) => `${i.path}：${i.message}`);

describe('データの型検査', () => {
  it('同梱のデータはすべて型検査と整合検査を通る', () => {
    // 指示書 3-1（データの型検査・参照の整合）
    expect(() => parseGameData(RAW_GAME_DATA)).not.toThrow();
    expect(issuesOf(GAME_DATA)).toEqual([]);
  });

  it('数値の位置に文字列があれば位置を示して拒否する', () => {
    // rules.md v0.8 2-2-1（初期資源は数値である）
    const raw = mutateRaw((r) => {
      at(r, 'params', 'initial')['materials'] = '5';
    });
    expect(() => parseGameData(raw)).toThrow(DataValidationError);
    expect(() => parseGameData(raw)).toThrow('params.initial.materials');
  });

  it('存在しない地形・建物の識別子を拒否する', () => {
    // rules.md v0.8 2-1-5（地形は4種）、5-2-1（建物は7種）
    const badTerrain = mutateRaw((r) => {
      at(r, 'boards', 0, 'squares', 'A1')['terrain'] = 'desert';
    });
    expect(() => parseGameData(badTerrain)).toThrow('boards[0].squares.A1.terrain');
    const badBuilding = mutateRaw((r) => {
      at(r, 'params', 'buildings', 'limits')['castle'] = 1;
    });
    expect(() => parseGameData(badBuilding)).toThrow('params.buildings.limits.castle');
  });

  it('項目の欠落と負の値を拒否する', () => {
    // rules.md v0.8 5-3-1（建設コスト）、2-1-2（45マス）
    const missing = mutateRaw((r) => {
      delete at(r, 'params', 'buildings', 'cost')['house'];
    });
    expect(() => parseGameData(missing)).toThrow('params.buildings.cost.house');
    const negative = mutateRaw((r) => {
      at(r, 'params', 'buildings', 'cost', 'house')['gold'] = -1;
    });
    expect(() => parseGameData(negative)).toThrow('params.buildings.cost.house.gold');
    const missingCell = mutateRaw((r) => {
      delete at(r, 'boards', 1, 'squares')['F7'];
    });
    expect(() => parseGameData(missingCell)).toThrow('boards[1].squares.F7');
  });

  it('存在しないマス ID を拒否する', () => {
    // rules.md v0.8 2-1-3
    const raw = mutateRaw((r) => {
      at(r, 'params', 'board')['initialCells'] = ['E1', 'G1'];
    });
    expect(() => parseGameData(raw)).toThrow('params.board.initialCells[1]');
  });
});

describe('参照と内訳の整合検査', () => {
  it('存在しない襲撃カードの参照を検出する', () => {
    // rules.md v0.8 7-3-1（第1ラウンドはカード1）
    const raw = mutateRaw((r) => {
      at(r, 'params', 'raid')['firstRoundCard'] = 9;
    });
    expect(issuesOf(parseGameData(raw)).join('\n')).toContain('params.raid.firstRoundCard');
  });

  it('ID の重複を検出する', () => {
    // 指示書 3-1（参照の整合）
    const raw = mutateRaw((r) => {
      at(r, 'civilizationCards', 'cards', 1)['id'] = '001';
    });
    expect(issuesOf(parseGameData(raw)).join('\n')).toContain('civilizationCards[1].id');
  });

  it('個人ボードの地形の内訳の不一致を検出する', () => {
    // rules.md v0.8 2-1-5
    const raw = mutateRaw((r) => {
      const squares = at(r, 'boards', 2, 'squares');
      const id = CELL_IDS.find((c) => at(squares, c)['terrain'] === 'plains') ?? 'A1';
      at(squares, id)['terrain'] = 'water';
    });
    const issues = issuesOf(parseGameData(raw)).join('\n');
    expect(issues).toContain('boards[2].squares：water が 8 マスある');
    expect(issues).toContain('boards[2].squares：plains が 15 マスある');
  });

  it('初期マスの地形とマスボーナスの誤りを検出する', () => {
    // rules.md v0.8 2-1-7、指示書 2-2（E1・F1 にマスボーナスを置かない）
    const raw = mutateRaw((r) => {
      at(r, 'boards', 0, 'squares', 'E1')['bonus'] = { kind: 'gold', amount: 2 };
    });
    expect(issuesOf(parseGameData(raw)).join('\n')).toContain('boards[0].squares.E1.bonus');
  });

  it('建物数を添字とする表の長さの不一致を検出する', () => {
    // rules.md v0.8 17-2-2（商店0〜3軒の換算率）
    const raw = mutateRaw((r) => {
      at(r, 'params', 'scoring')['goldPerPointByShops'] = [20, 10, 5];
    });
    expect(issuesOf(parseGameData(raw)).join('\n')).toContain('params.scoring.goldPerPointByShops');
  });

  it('つながっていない計画都市・森林を含まない自然公園を検出する', () => {
    // rules.md v0.8 13-2-1、14-1-4、14-3-2
    const raw = mutateRaw((r) => {
      at(r, 'plannedCityCards', 'cards', 0, 'slots', 2)['q'] = 5;
      const cells = at(r, 'natureParkCards', 'cards', 0, 'sets', 0)['cells'] as Record<string, unknown>[];
      for (const cell of cells) {
        cell['terrain'] = 'plains';
      }
    });
    const issues = issuesOf(parseGameData(raw)).join('\n');
    expect(issues).toContain('plannedCityCards[0].slots：形状がつながっていない');
    expect(issues).toContain('natureParkCards[0].sets[0].cells：森林を含まない');
  });
});

describe('個人ボード', () => {
  it('5枚あり、仮置きの印を持つ', () => {
    // 指示書 2-2、rules.md v0.8 2-6-2（プレイ人数より多い候補）
    expect(GAME_DATA.boards).toHaveLength(5);
    expect(GAME_DATA.boards.length).toBeGreaterThan(GAME_DATA.params.playerCount.max);
    for (const board of GAME_DATA.boards) {
      expect(board.provisional).toBe(true);
      expect(board.generatedWithSeed).not.toBeNull();
    }
  });

  it('各ボードの地形の内訳は水場7・山岳7・平原16・森林15である', () => {
    // rules.md v0.8 2-1-5
    for (const board of GAME_DATA.boards) {
      const counts = Object.fromEntries(
        TERRAINS.map((t) => [t, CELL_IDS.filter((id) => board.squares[id]?.terrain === t).length]),
      );
      expect(counts).toEqual({ water: 7, mountain: 7, plains: 16, forest: 15 });
    }
  });

  it('E1・F1 は森林である', () => {
    // rules.md v0.8 2-1-4、2-1-7
    for (const board of GAME_DATA.boards) {
      expect(board.squares.E1?.terrain).toBe('forest');
      expect(board.squares.F1?.terrain).toBe('forest');
    }
  });

  it('マスボーナスは各ボード9マスにあり、E1・F1 にはない', () => {
    // rules.md v0.8 4-4-4-2、指示書 2-2（マスの数と中身は 2026-11-08 作成の調整案）
    const allowed = ['materials:1', 'materials:2', 'gold:3', 'gold:6', 'drawCivCards:1', 'drawCivCards:2', 'militaryTokens:2', 'specialCitizen:1', 'tempWorkers:1', 'points:4'];
    for (const board of GAME_DATA.boards) {
      const bonusCells = CELL_IDS.filter((id) => board.squares[id]?.bonus !== null);
      expect(bonusCells).toHaveLength(9);
      expect(bonusCells).not.toContain('E1');
      expect(bonusCells).not.toContain('F1');
      for (const id of bonusCells) {
        const bonus = board.squares[id]?.bonus;
        expect(allowed).toContain(`${bonus?.kind}:${bonus?.amount}`);
      }
    }
  });
});

describe('文明カード', () => {
  it('001〜042 の42枚を収録し、名称は一覧のとおりで、条件と固有得点は仮置きである', () => {
    // 指示書 2-1、decisions.md 1-1（タグは配列）、ユーザー決定 2026-11-06（xlsx に合わせる）
    // 043 以降は 文明カード一覧（120枚）.xlsx から加えたカードである（docs/civ-cards-xlsx.md）。
    const cards = GAME_DATA.civilizationCards.slice(0, 42);
    expect(cards.map((c) => c.id)).toEqual(Array.from({ length: 42 }, (_, i) => String(i + 1).padStart(3, '0')));
    for (const card of cards) {
      expect(card.points).toBe(1);
      expect(card.name).not.toBe(`文明カード${card.id}`);
      expect(card.playCondition).toBeNull();
      expect(card.effectCondition).toBeNull();
      expect(card.provisional).toBe(true);
      expect(card.provisionalFields).toEqual(['playCondition', 'effectCondition', 'points']);
    }
  });

  it('名称・コスト・タグ・文言は 文明カード一覧（120枚）.xlsx のとおりである', () => {
    // ユーザー決定 2026-11-06（既存の42枚を一覧に合わせる。対応は docs/civ-cards-xlsx.md 2 節）
    const expected: [string, string, number, string[], string][] = [
      ['001', '建築学', 11, ['academic'], '建物1軒を無料で建設する。'],
      ['005', '利回り', 8, ['economy'], '金の生産を5上げる。'],
      ['011', '水洗トイレ', 7, ['life'], 'インフラレベルを1上げる。'],
      ['015', '炭鉱', 11, ['economy'], '資材の生産を2上げる。'],
      ['018', '知識の泉', 10, ['academic'], '常時：音楽タグ、文学タグ、美術タグのいずれかを持つ文明カードをプレイする度に、文明カードを1枚引く。'],
      ['025', '『未来商店』', 10, ['academic', 'literature'], '所持している文学タグ1つにつき1点を得る。金の生産3につき1金を得る。'],
      ['026', '『瓦礫から生まれた子』', 10, ['academic', 'literature'], '所持している文学タグ1つにつき1点を得る。襲撃の撃退ライン1につき1金を得る。'],
      ['027', '『勝利の御旗』', 10, ['academic', 'art'], '所持している美術タグ1つにつき1点を得る。軍事レベルが3以上なら、3資材を得る。6以上なら、もう2資材を得る。'],
      ['042', '『空に願いを』', 10, ['academic', 'music'], '所持している音楽タグ1つにつき1点を得る。軍事力が撃退ラインより低いなら、文明カードを1枚引く。防衛ラインより低いなら、もう1枚引く。'],
    ];
    for (const [id, name, gold, tags, text] of expected) {
      const card = GAME_DATA.civilizationCards.find((c) => c.id === id);
      expect(card).toMatchObject({ name, cost: { gold }, tags, text });
    }
    const tagsOf = (from: number, to: number): string[][] =>
      GAME_DATA.civilizationCards.slice(from - 1, to).map((c) => [...c.tags]);
    expect(tagsOf(19, 26).every((t) => t.join() === 'academic,literature')).toBe(true);
    expect(tagsOf(27, 34).every((t) => t.join() === 'academic,art')).toBe(true);
    expect(tagsOf(35, 42).every((t) => t.join() === 'academic,music')).toBe(true);
  });

  it('仮置きの解釈を持つ', () => {
    // 指示書 2-1（003、006〜009）、2026-11-06 の取り込み（018 の複数分類、019〜042 の得点の評価軸）
    const provisionalIds = GAME_DATA.civilizationCards
      .slice(0, 42)
      .filter((c) => c.clarifications.some((x) => x.provisional))
      .map((c) => c.id);
    const range = (from: number, to: number): string[] =>
      Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(3, '0'));
    expect(provisionalIds).toEqual(['003', '006', '007', '008', '009', '018', ...range(19, 42)]);
  });
});

describe('文明カードの解釈（ユーザー決定 2026-11-03）', () => {
  const textsOf = (id: string): string =>
    GAME_DATA.civilizationCards
      .find((c) => c.id === id)
      ?.clarifications.filter((c) => !c.provisional && c.source.includes('ユーザー決定'))
      .map((c) => c.text)
      .join() ?? '';

  it('017 は目標値の宣言とトークンの消費なしに、異なる遠征報酬を4つ獲得する', () => {
    // rules.md v0.8 6-3-6-3、6-3-6-4（017 には適用しない）
    expect(textsOf('017')).toContain('軍事力トークンの消費を行わない');
    expect(textsOf('017')).toContain('異なる報酬を4つ');
    expect(textsOf('017')).toContain('現在の軍事レベル以下の報酬に限る');
    expect(textsOf('017')).toContain('指揮官の追加報酬（19-2-6）も選べる');
  });

  // 018 の「自身のプレイでは引かない」（2026-11-03）は、2026-11-06 に 018 の条件が音楽・文学・美術に変わり、
  // 018（学術だけ）が自身に反応しなくなったため、解釈から外した。

  it('032・040 の2段目は通常ワーカー8人以上だけで満たす', () => {
    // rules.md v0.8 9-2-7（各効果の適用条件を個別に判定する）
    expect(textsOf('032')).toContain('1段目（住宅4軒以上）の成否を問わない');
    expect(textsOf('040')).toContain('1段目（住宅4軒以上）の成否を問わない');
  });

  it('034・042 のラインは 026 と同じく、そのラウンドまでの累積値である', () => {
    // rules.md v0.8 7-4-2
    expect(textsOf('034')).toContain('累積した値');
    expect(textsOf('042')).toContain('累積した値');
  });
});

describe('ドラフトの候補数（ユーザー決定 2026-11-03）', () => {
  it('3人・4人とも、個人ボード5枚・キャラクター10人をすべて候補にする', () => {
    // rules.md v0.8 2-6-2
    for (const n of ['3', '4']) {
      expect(GAME_DATA.params.setupByPlayerCount[n]?.draftBoardCandidates).toBe(GAME_DATA.boards.length);
      expect(GAME_DATA.params.setupByPlayerCount[n]?.draftCharacterCandidates).toBe(GAME_DATA.characters.length);
    }
  });

  it('候補がプレイ人数以下、または収録数を超えると検出する', () => {
    // rules.md v0.8 2-6-2
    const raw = mutateRaw((r) => {
      at(r, 'params', 'setupByPlayerCount', '4')['draftCharacterCandidates'] = 4;
      at(r, 'params', 'setupByPlayerCount', '3')['draftBoardCandidates'] = 6;
    });
    const issues = issuesOf(parseGameData(raw)).join('\n');
    expect(issues).toContain('setupByPlayerCount.4.draftCharacterCandidates：キャラクターの候補がプレイ人数（4）以下');
    expect(issues).toContain('setupByPlayerCount.3.draftBoardCandidates：個人ボードの収録数（5）を超えている');
  });
});

describe('計画都市カード・自然公園カード', () => {
  it('計画都市カードは13枚で、建物数は3〜5軒、条件は3種類を組み合わせる', () => {
    // rules.md v0.8 13-2-1、13-2-2、指示書 2-3（枚数と恩恵は 2026-11-08 作成の調整案）
    const cards = GAME_DATA.plannedCityCards;
    expect(cards).toHaveLength(13);
    const kinds = new Set<string>();
    for (const card of cards) {
      expect(card.provisional).toBe(true);
      expect(card.slots.length).toBeGreaterThanOrEqual(3);
      expect(card.slots.length).toBeLessThanOrEqual(5);
      const cardKinds = new Set(
        card.slots.map((s) => (s.terrain !== null && s.building !== null ? 'both' : s.terrain !== null ? 'terrain' : 'building')),
      );
      expect(cardKinds.size).toBeGreaterThanOrEqual(2);
      cardKinds.forEach((k) => kinds.add(k));
      expect(card.benefit.amount).toBeGreaterThan(0);
    }
    expect(kinds).toEqual(new Set(['both', 'terrain', 'building']));
  });

  it('自然公園カードは8枚で、各カードは2枚・3枚・4枚のセットを持ち、どのセットも森林を含む', () => {
    // rules.md v0.8 14-1-2、14-1-4、14-2-1、指示書 2-4
    const cards = GAME_DATA.natureParkCards;
    expect(cards).toHaveLength(8);
    for (const card of cards) {
      expect(card.provisional).toBe(true);
      expect(card.sets.map((s) => s.cells.length)).toEqual([2, 3, 4]);
      for (const set of card.sets) {
        expect(set.cells.some((c) => c.terrain === 'forest')).toBe(true);
      }
    }
  });
});

describe('設計文書からの取り込み', () => {
  const stripAdded = (item: unknown): unknown => {
    // changes はユーザー決定で原本から変えた点の説明（2026-11-06）。原本にはないため除いて照らす。
    // revisedEffects は特別な市民カードのいまの効果の文言（2026-11-10）。原本にはないため除いて照らす。
    const { provisional: _p, script: _s, changes: _c, revisedEffects: _r, ...rest } = item as Record<string, unknown>;
    return rest;
  };

  it('キャラクターは design/data_characters.json の文言のまま取り込む', () => {
    // 指示書 3-1（文言をそのまま取り込み、clarifications も保持する）
    // チューナーで新しく作ったキャラクターは原本にないため、原本の10人だけを照らす（ユーザー決定 2026-11-04）。
    const original = readDesignJson('data_characters.json')['characters'] as { id: string }[];
    expect(original).toHaveLength(10);
    expect(GAME_DATA.characters.filter((c) => original.some((o) => o.id === c.id)).map(stripAdded)).toEqual(original);
  });

  it('特別な市民カードは design/data_special_citizens.json の文言のまま取り込む', () => {
    // 指示書 3-1、rules.md v0.8 19-4-4（特別な住民カードと同一物）
    const original = readDesignJson('data_special_citizens.json')['cards'] as { id: string }[];
    expect(original).toHaveLength(20);
    expect(GAME_DATA.specialCitizens.filter((c) => original.some((o) => o.id === c.id)).map(stripAdded)).toEqual(original);
  });

  it('襲撃カードは design/data_raid_cards.json の値と文言のまま取り込み、第19章の解釈を加える', () => {
    // 指示書 3-1、rules.md v0.8 7-6-1、19-3-1、19-3-3
    const original = readDesignJson('data_raid_cards.json')['cards'] as Record<string, unknown>[];
    const imported = GAME_DATA.raidCards.filter((card) => original.some((o) => o['id'] === card.id)).map((card) => {
      const {
        provisional: _p,
        clarifications: _c,
        replacesBasePoints: _r,
        defenseFailEffects: _f,
        repelEffects: _e,
        ...rest
      } = card;
      return rest;
    });
    expect(imported).toEqual(original);
    expect(GAME_DATA.raidCards.filter((c) => original.some((o) => o['id'] === c.id)).reduce((sum, c) => sum + c.repel_increase, 0)).toBe(12);
    expect(GAME_DATA.raidCards.find((c) => c.id === 5)?.clarifications?.join()).toContain('基本得点は加えない');
  });

  it('ボーナスタイルは rules.md 11-2-1 の10種である', () => {
    // rules.md v0.8 2-4-1、11-1-1、11-2-1
    expect(GAME_DATA.bonusTiles.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(GAME_DATA.bonusTiles[1]?.text).toBe('8金獲得');
  });
});

describe('params.json の値', () => {
  const p = GAME_DATA.params;

  it('プレイ人数ごとの準備の枚数', () => {
    // rules.md v0.8 2-3-1、2-3-3、2-4-2、13-3-5
    for (const n of [3, 4]) {
      expect(p.setupByPlayerCount[String(n)]).toEqual({
        specialCitizensRevealed: n + 1,
        plannedCityRevealed: n - 1,
        bonusTilesOnBoard: n + 3,
        plannedCityMaxDeclarers: n - 1,
        draftBoardCandidates: 5,
        draftCharacterCandidates: 10,
      });
    }
  });

  it('初期資源と初期レベル', () => {
    // rules.md v0.8 2-2-1、2-2-2
    expect(p.initial).toEqual({
      gold: 0,
      materials: 5,
      goldProduction: 20,
      materialProduction: 3,
      regularWorkers: 5,
      tempWorkers: 2,
      civCards: 3,
      militaryLevel: 0,
      infraLevel: 0,
    });
  });

  it('ワーカーの上限の係数', () => {
    // rules.md v0.8 3-3-1-2、3-1-3
    expect(p.workers).toEqual({ regularBase: 5, housesPerExtraRegular: 2, regularMax: 10, tempMax: 3 });
  });

  it('最上位アクションの解放条件', () => {
    // rules.md v0.8 6-3-1-2、6-3-2-3、6-3-3-3、6-3-4-3、6-3-5-7、6-3-6-10、6-3-7-2、6-3-8-4、6-3-9-3、6-3-10-4
    expect(p.actions.unlockTop.pioneer).toEqual({ metric: 'totalBuildings', atLeast: 4 });
    expect(p.actions.unlockTop.build).toEqual({ metric: 'landTiles', atLeast: 7 });
    expect(p.actions.unlockTop.expedition).toEqual({ metric: 'militaryLevel', atLeast: 5 });
    expect(p.actions.unlockTop.migration).toEqual({ metric: 'buildingsOfType', building: 'house', atLeast: 5 });
    expect(p.actions.unlockTop.spread).toEqual({ metric: 'civCardsPlayed', atLeast: 4 });
  });

  it('得点計算の換算表', () => {
    // rules.md v0.8 17-3-1、13-3-4。17-2-2、17-2-3、17-4-1、14-2-1 の値はユーザー決定 2026-11-07 で変えた。
    expect(p.scoring.goldPerPointByShops).toEqual([20, 5, 4, 3]);
    expect(p.scoring.materialsPerPointByWorkshops).toEqual([10, 3, 2, 1]);
    expect(p.scoring.civCardsPerPointByUniversities).toEqual([5, 4, 3, 2]);
    expect(p.scoring.regularWorkerPointsByOffices).toEqual([0, 0.5, 1, 2]);
    expect(p.scoring.plannedCityPointsByRank).toEqual([7, 5, 3]);
    expect(p.scoring.natureParkPointsBySetSize).toEqual({ '2': 3, '3': 5, '4': 7 });
  });

  it('アクション・インフラ・襲撃・基礎得点の調整値（ユーザー決定 2026-11-07）', () => {
    // rules.md v0.8 6-1-2、6-3、8-1、7-5-1、17-1 からの変更
    expect(p.actions.workerCost).toEqual({ normal: 1, upper: 2, top: 2 });
    expect(p.actions.pioneer.top.maxTiles).toBe(4);
    expect(p.actions.import.upper).toEqual({ payGold: 3, gainMaterials: 1, maxTimes: 5, bonusMaterials: 1 });
    expect(p.actions.import.top).toEqual({ payGold: 3, gainMaterials: 1, maxTimes: 7, bonusMaterials: 2 });
    expect(p.actions.export.upper).toEqual({ payMaterials: 1, gainGold: 5, maxTimes: 5, bonusGold: 3 });
    expect(p.actions.export.top).toEqual({ payMaterials: 1, gainGold: 5, maxTimes: 7, bonusGold: 6 });
    expect(p.actions.drill.top.choices).toEqual([
      { payGold: 3, gainTokens: 3 },
      { payGold: 6, gainTokens: 5 },
      { payGold: 9, gainTokens: 8 },
    ]);
    expect(p.actions.expedition.selection.top).toEqual({ mode: 'total', total: 4, maxSame: 2 });
    expect(p.actions.welfare.normal).toEqual({ choices: [{ payMaterials: 1, infra: 1 }], tempWorkers: 0 });
    expect(p.actions.welfare.upper).toEqual({ choices: [{ payMaterials: 3, infra: 2 }], tempWorkers: 1 });
    expect(p.actions.welfare.top.choices.map((c) => c.payMaterials)).toEqual([1, 3, 6]);
    expect(p.actions.migration.top).toEqual({ tempWorkers: 1, regularWorkers: 3, regularWorkersIsMax: true, materials: 2 });
    expect(p.actions.research.top).toEqual({ draw: 3, playCards: 1 });
    expect(p.actions.spread.top).toEqual({ maxCards: 4, cardsIsMax: true, goldDiscount: 2 });
    expect(p.infra.rewards.map((r) => r.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(p.infra.rewards[0]?.grants).toEqual([{ kind: 'goldProduction', amount: 2 }]);
    expect(p.infra.rewards[4]?.grants).toEqual([{ kind: 'materialProduction', amount: 1 }]);
    expect(p.infra.overflowPointsPerRaise).toBe(2);
    expect(p.raid.basePointsPerRound).toEqual({ defenseFailed: -1, defended: 0, repelled: 0 });
    expect(p.raid.cardEffectKinds).toEqual({ defenseFailed: [], defended: [], repelled: ['gold', 'materials', 'landTiles'] });
    expect(p.scoring.base).toEqual({ landTilesPerPoint: 2, buildingsPerPoint: 1, regularWorkersPerPoint: 1 });
  });
});
