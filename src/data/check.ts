// データの整合検査。型検査（validate.ts）を通ったデータについて、
// 参照の整合（存在しない ID がない）、内訳、範囲、形状のつながりなどを確かめる。
// 問題はすべて集めて返す。チューナーの保存前検査（指示書 3-5）でも用いる。

import { CELL_IDS, isConnectedAxial } from '../game/board.ts';
import { BUILDINGS, CIV_TAGS, TERRAINS, type GameData, type LevelReward } from './types.ts';

export type DataIssue = { readonly path: string; readonly message: string };

type Report = (path: string, message: string) => void;

const checkUniqueIds = (ids: readonly (string | number)[], path: string, report: Report): void => {
  const seen = new Set<string | number>();
  ids.forEach((id, i) => {
    if (seen.has(id)) {
      report(`${path}[${i}].id`, `ID が重複している（${String(id)}）`);
    }
    seen.add(id);
  });
};

const checkLevelRewards = (rewards: readonly LevelReward[], max: number, path: string, report: Report): void => {
  rewards.forEach((reward, i) => {
    if (reward.level > max) {
      report(`${path}[${i}].level`, `レベルが上限 ${max} を超えている（${reward.level}）`);
    }
    const previous = rewards[i - 1];
    if (previous !== undefined && previous.level >= reward.level) {
      report(`${path}[${i}].level`, 'レベルは昇順で重複なく並べなければならない');
    }
  });
};

/** 建物数を添字とする表の長さが「上限＋1」であることを確かめる。 */
const checkByCountTable = (
  table: readonly unknown[],
  limit: number | undefined,
  path: string,
  report: Report,
): void => {
  if (limit !== undefined && table.length !== limit + 1) {
    report(path, `建物数0〜${limit} に対応する ${limit + 1} 要素が必要である（実際は ${table.length}）`);
  }
};

const checkParams = (data: GameData, report: Report): void => {
  const { params } = data;
  const limits = params.buildings.limits;

  // プレイ人数と準備（rules.md 2-3、2-4-2、13-3-5）
  if (params.playerCount.min > params.playerCount.max) {
    report('params.playerCount', '最小人数が最大人数を超えている');
  }
  for (let n = params.playerCount.min; n <= params.playerCount.max; n += 1) {
    const setup = params.setupByPlayerCount[String(n)];
    const path = `params.setupByPlayerCount.${n}`;
    if (setup === undefined) {
      report(path, `${n}人プレイの準備がない`);
      continue;
    }
    if (setup.specialCitizensRevealed > data.specialCitizens.length) {
      report(`${path}.specialCitizensRevealed`, '特別な市民カードの枚数を超えている');
    }
    if (setup.plannedCityRevealed > data.plannedCityCards.length) {
      report(`${path}.plannedCityRevealed`, '計画都市カードの枚数を超えている');
    }
    if (setup.plannedCityMaxDeclarers > params.scoring.plannedCityPointsByRank.length) {
      report(`${path}.plannedCityMaxDeclarers`, '先着順位の得点表（scoring.plannedCityPointsByRank）より多い');
    }
    // ドラフトの候補はプレイ人数より多く、収録数以下でなければならない（rules.md 2-6-2）。
    const candidates = [
      ['draftBoardCandidates', setup.draftBoardCandidates, data.boards.length, '個人ボード'],
      ['draftCharacterCandidates', setup.draftCharacterCandidates, data.characters.length, 'キャラクター'],
      ['bonusTilesOnBoard', setup.bonusTilesOnBoard, data.bonusTiles.length, 'ボーナスタイル'],
    ] as const;
    for (const [key, count, available, label] of candidates) {
      if (count <= n) {
        report(`${path}.${key}`, `${label}の候補がプレイ人数（${n}）以下である`);
      }
      if (count > available) {
        report(`${path}.${key}`, `${label}の収録数（${available}）を超えている`);
      }
    }
  }
  // ドラフトでは各種類についてプレイ人数より多い候補を用意する（rules.md 2-6-2）。
  if (data.boards.length <= params.playerCount.max) {
    report('boards', `個人ボードが最大人数（${params.playerCount.max}）以下である`);
  }
  if (data.characters.length <= params.playerCount.max) {
    report('characters', `キャラクターが最大人数（${params.playerCount.max}）以下である`);
  }
  if (data.natureParkCards.length < params.playerCount.max) {
    report('natureParkCards', `自然公園カードが最大人数（${params.playerCount.max}）より少ない`);
  }

  // 盤面（rules.md 2-1-2、2-1-5、2-1-7）
  const terrainTotal = TERRAINS.reduce((sum, t) => sum + params.board.terrainCounts[t], 0);
  if (terrainTotal !== CELL_IDS.length) {
    report('params.board.terrainCounts', `地形の合計が ${CELL_IDS.length} マスでない（${terrainTotal}）`);
  }
  if (params.board.initialCells.length > params.board.terrainCounts[params.board.initialTerrain]) {
    report('params.board.initialCells', '初期マスの数が初期地形のマス数を超えている');
  }

  // 初期値と上限（rules.md 2-2、3-3、3-4）
  if (params.workers.regularBase > params.workers.regularMax) {
    report('params.workers.regularBase', '基本値が上限を超えている');
  }
  if (params.initial.regularWorkers > params.workers.regularMax) {
    report('params.initial.regularWorkers', '通常ワーカーの上限を超えている');
  }
  if (params.initial.tempWorkers > params.workers.tempMax) {
    report('params.initial.tempWorkers', '臨時ワーカーの上限を超えている');
  }
  if (params.workers.housesPerExtraRegular <= 0) {
    report('params.workers.housesPerExtraRegular', '1以上でなければならない');
  }
  if (params.initial.militaryLevel > params.military.max) {
    report('params.initial.militaryLevel', '軍事レベルの上限を超えている');
  }
  if (params.initial.infraLevel > params.infra.max) {
    report('params.initial.infraLevel', 'インフラレベルの上限を超えている');
  }

  // 建物数を添字とする表（rules.md 5-5、第17章）
  const e = params.buildings.effects;
  checkByCountTable(e.shop.goldProductionAfterImportByCount, limits.shop, 'params.buildings.effects.shop.goldProductionAfterImportByCount', report);
  checkByCountTable(e.workshop.goldAfterExportByCount, limits.workshop, 'params.buildings.effects.workshop.goldAfterExportByCount', report);
  checkByCountTable(e.fort.drillTokenCostByCount, limits.fort, 'params.buildings.effects.fort.drillTokenCostByCount', report);
  checkByCountTable(e.office.welfareConvertMaterialsByCount, limits.office, 'params.buildings.effects.office.welfareConvertMaterialsByCount', report);
  checkByCountTable(params.scoring.goldPerPointByShops, limits.shop, 'params.scoring.goldPerPointByShops', report);
  checkByCountTable(params.scoring.materialsPerPointByWorkshops, limits.workshop, 'params.scoring.materialsPerPointByWorkshops', report);
  checkByCountTable(params.scoring.civCardsPerPointByUniversities, limits.university, 'params.scoring.civCardsPerPointByUniversities', report);
  checkByCountTable(params.scoring.regularWorkerPointsByOffices, limits.office, 'params.scoring.regularWorkerPointsByOffices', report);
  e.fort.drillTokenCostByCount.forEach((cost, i) => {
    if (cost <= 0) {
      report(`params.buildings.effects.fort.drillTokenCostByCount[${i}]`, '1以上でなければならない');
    }
  });

  // 地形ボーナスは同じ地形・建物の組を重複して定めない（rules.md 5-4-1）。
  const bonusPairs = new Set<string>();
  params.buildings.terrainBonus.forEach((bonus, i) => {
    for (const building of bonus.buildings) {
      const key = `${bonus.terrain}:${building}`;
      if (bonusPairs.has(key)) {
        report(`params.buildings.terrainBonus[${i}]`, `${key} の地形ボーナスが重複している`);
      }
      bonusPairs.add(key);
    }
  });

  // 最上位アクションの解放条件で参照する建物の上限（rules.md 6-3）
  for (const [action, unlock] of Object.entries(params.actions.unlockTop)) {
    if (unlock.metric === 'buildingsOfType' && unlock.atLeast > limits[unlock.building]) {
      report(`params.actions.unlockTop.${action}.atLeast`, `${unlock.building} の建設上限を超えている`);
    }
    if (unlock.metric === 'militaryLevel' && unlock.atLeast > params.military.max) {
      report(`params.actions.unlockTop.${action}.atLeast`, '軍事レベルの上限を超えている');
    }
    if (unlock.metric === 'totalBuildings') {
      const totalLimit = BUILDINGS.reduce((sum, b) => sum + limits[b], 0);
      if (unlock.atLeast > totalLimit) {
        report(`params.actions.unlockTop.${action}.atLeast`, '建物の総数の上限を超えている');
      }
    }
    if (unlock.metric === 'landTiles' && unlock.atLeast > CELL_IDS.length) {
      report(`params.actions.unlockTop.${action}.atLeast`, 'マス数を超えている');
    }
  }

  // 共有スペースの重複
  const sharedKeys = params.actions.shared.map((s) => `${s.action}.${s.tier}`);
  sharedKeys.forEach((key, i) => {
    if (sharedKeys.indexOf(key) !== i) {
      report(`params.actions.shared[${i}]`, `${key} が重複している`);
    }
  });

  // トラックの到達報酬（rules.md 7-1-2、8-1-2）と遠征の報酬（6-3-6-2）
  checkLevelRewards(params.military.rewards, params.military.max, 'params.military.rewards', report);
  checkLevelRewards(params.infra.rewards, params.infra.max, 'params.infra.rewards', report);
  checkLevelRewards(params.actions.expedition.rewards, params.military.max, 'params.actions.expedition.rewards', report);
  if (params.actions.expedition.rewards[0]?.level !== 0) {
    report('params.actions.expedition.rewards', '軍事レベル0の報酬がない');
  }

  // 襲撃（rules.md 7-3）
  if (!data.raidCards.some((card) => card.id === params.raid.firstRoundCard)) {
    report('params.raid.firstRoundCard', `存在しない襲撃カードである（${params.raid.firstRoundCard}）`);
  }
  if (data.raidCards.length !== params.rounds) {
    report('raidCards', `襲撃カードの枚数がラウンド数（${params.rounds}）と一致しない（${data.raidCards.length}）`);
  }

  // フリーアクション（rules.md 10-1-3）
  checkUniqueIds(params.freeActions.conversions.map((c) => c.id), 'params.freeActions.conversions', report);

  // ボーナスタイル（rules.md 2-4-1、11-1-1）
  if (data.bonusTiles.length !== params.bonusTiles.kinds) {
    report('bonusTiles', `種類数が params.bonusTiles.kinds（${params.bonusTiles.kinds}）と一致しない`);
  }
};

const checkBoards = (data: GameData, report: Report): void => {
  const { params } = data;
  checkUniqueIds(data.boards.map((b) => b.id), 'boards', report);
  data.boards.forEach((board, i) => {
    const path = `boards[${i}]`;
    // 地形の内訳（rules.md 2-1-5）
    for (const terrain of TERRAINS) {
      const count = CELL_IDS.filter((id) => board.squares[id]?.terrain === terrain).length;
      if (count !== params.board.terrainCounts[terrain]) {
        report(`${path}.squares`, `${terrain} が ${count} マスある（規定は ${params.board.terrainCounts[terrain]}）`);
      }
    }
    // 初期開拓済みマス（rules.md 2-1-4、2-1-7）。初期マスにマスボーナスは置かない（指示書 2-2）。
    for (const id of params.board.initialCells) {
      const square = board.squares[id];
      if (square?.terrain !== params.board.initialTerrain) {
        report(`${path}.squares.${id}.terrain`, `初期マスは ${params.board.initialTerrain} でなければならない`);
      }
      if (square !== undefined && square.bonus !== null) {
        report(`${path}.squares.${id}.bonus`, '初期マスにマスボーナスは置かない');
      }
    }
  });
};

const checkCards = (data: GameData, report: Report): void => {
  checkUniqueIds(data.civilizationCards.map((c) => c.id), 'civilizationCards', report);
  data.civilizationCards.forEach((card, i) => {
    if (card.tags.length === 0) {
      report(`civilizationCards[${i}].tags`, 'タグが1つもない');
    }
  });

  // 計画都市カード（rules.md 13-2）
  checkUniqueIds(data.plannedCityCards.map((c) => c.id), 'plannedCityCards', report);
  data.plannedCityCards.forEach((card, i) => {
    const path = `plannedCityCards[${i}]`;
    if (card.slots.length < 3 || card.slots.length > 5) {
      report(`${path}.slots`, `建物は3〜5軒でなければならない（${card.slots.length}軒）`);
    }
    card.slots.forEach((slot, k) => {
      if (slot.terrain === null && slot.building === null) {
        report(`${path}.slots[${k}]`, '土地種・建物種の少なくとも一方を指定しなければならない');
      }
    });
    if (!isConnectedAxial(card.slots)) {
      report(`${path}.slots`, '形状がつながっていない、または同じ位置が重複している');
    }
    // 達成の報酬は1つ以上（13-3-8。複数の種類はユーザー決定 2026-11-11）。
    if (card.benefits.length === 0) {
      report(`${path}.benefits`, '達成時に得るものが1つもない');
    }
  });

  // 自然公園カード（rules.md 14-1、14-2）
  checkUniqueIds(data.natureParkCards.map((c) => c.id), 'natureParkCards', report);
  const pointSizes = Object.keys(data.params.scoring.natureParkPointsBySetSize).map(Number);
  data.natureParkCards.forEach((card, i) => {
    const path = `natureParkCards[${i}]`;
    if (card.sets.length !== 3) {
      report(`${path}.sets`, `セットは3つでなければならない（${card.sets.length}）`);
    }
    card.sets.forEach((set, k) => {
      const setPath = `${path}.sets[${k}]`;
      if (!pointSizes.includes(set.cells.length)) {
        report(`${setPath}.cells`, `${set.cells.length}枚のセットの得点が scoring.natureParkPointsBySetSize にない`);
      }
      if (!set.cells.some((cell) => cell.terrain === 'forest')) {
        report(`${setPath}.cells`, '森林を含まない（rules.md 14-1-4）');
      }
      if (!isConnectedAxial(set.cells)) {
        report(`${setPath}.cells`, '形状がつながっていない、または同じ位置が重複している');
      }
    });
  });

  // 効果スクリプトの絞り込みで参照するタグは文明カードのタグでなければならない。
  const scripts = [
    ...data.civilizationCards.map((c, i) => ({ path: `civilizationCards[${i}].script`, script: c.script })),
    ...data.specialCitizens.map((c, i) => ({ path: `specialCitizens[${i}].script`, script: c.script })),
    ...data.characters.map((c, i) => ({ path: `characters[${i}].script`, script: c.script })),
  ];
  for (const { path, script } of scripts) {
    script.forEach((ability, k) => {
      if (ability.ability === 'on' && ability.filter.tag !== undefined && !CIV_TAGS.some((t) => t === ability.filter.tag)) {
        report(`${path}[${k}].filter.tag`, `存在しないタグである（${ability.filter.tag}）`);
      }
    });
  }

  checkUniqueIds(data.specialCitizens.map((c) => c.id), 'specialCitizens', report);
  checkUniqueIds(data.characters.map((c) => c.id), 'characters', report);
  checkUniqueIds(data.raidCards.map((c) => c.id), 'raidCards', report);
  checkUniqueIds(data.bonusTiles.map((c) => c.id), 'bonusTiles', report);
};

export const checkGameData = (data: GameData): DataIssue[] => {
  const issues: DataIssue[] = [];
  const report: Report = (path, message) => {
    issues.push({ path, message });
  };
  checkParams(data, report);
  checkBoards(data, report);
  checkCards(data, report);
  return issues;
};
