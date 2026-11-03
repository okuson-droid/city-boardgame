// データの型検査。JSON から読んだ unknown の値を検査し、types.ts の型にして返す。
// 型に合わない値は DataValidationError を投げる。エラーには値の位置（パス）を含める。
// 参照の整合や内訳など、型を超えた検査は check.ts で行う。

import { isCellId, CELL_IDS, type CellId } from '../game/board.ts';
import {
  ACTIONS,
  BUILDINGS,
  CIV_TAGS,
  GRANT_KINDS,
  PAYMENT_KINDS,
  TERRAINS,
  TIERS,
  type Action,
  type BonusTile,
  type Board,
  type BoardSquare,
  type Building,
  type Character,
  type CharacterEffect,
  type CivilizationCard,
  type Clarification,
  type ExpeditionSelection,
  type Grant,
  type LevelReward,
  type NatureParkCard,
  type Params,
  type Payment,
  type PlannedCityCard,
  type RaidCard,
  type SpecialCitizen,
  type SpecialCitizenEffect,
  type Terrain,
  type Tier,
  type TierTable,
  type UnlockCondition,
} from './types.ts';

export class DataValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}：${message}`);
    this.name = 'DataValidationError';
    this.path = path;
  }
}

// ---------------------------------------------------------------------------
// 基本の読み取り
// ---------------------------------------------------------------------------

type Obj = Readonly<Record<string, unknown>>;

const fail = (path: string, message: string): never => {
  throw new DataValidationError(path, message);
};

const describe = (value: unknown): string => (value === null ? 'null' : Array.isArray(value) ? '配列' : typeof value);

export const readObject = (value: unknown, path: string): Obj => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, `オブジェクトでなければならない（実際は ${describe(value)}）`);
  }
  return value as Obj;
};

const field = (obj: Obj, key: string, path: string): unknown => {
  if (!(key in obj)) {
    return fail(`${path}.${key}`, '項目がない');
  }
  return obj[key];
};

export const readString = (value: unknown, path: string): string =>
  typeof value === 'string' ? value : fail(path, `文字列でなければならない（実際は ${describe(value)}）`);

export const readBoolean = (value: unknown, path: string): boolean =>
  typeof value === 'boolean' ? value : fail(path, `真偽値でなければならない（実際は ${describe(value)}）`);

/** 0以上の整数。負の値を許すときは allowNegative を true にする。 */
export const readInt = (value: unknown, path: string, allowNegative = false): number => {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return fail(path, `整数でなければならない（実際は ${String(value)}）`);
  }
  if (!allowNegative && value < 0) {
    return fail(path, `0以上でなければならない（実際は ${value}）`);
  }
  return value;
};

const readPositiveInt = (value: unknown, path: string): number => {
  const n = readInt(value, path);
  return n > 0 ? n : fail(path, `1以上でなければならない（実際は ${n}）`);
};

export const readArray = <T>(value: unknown, path: string, item: (v: unknown, p: string) => T): T[] => {
  if (!Array.isArray(value)) {
    return fail(path, `配列でなければならない（実際は ${describe(value)}）`);
  }
  return value.map((v: unknown, i) => item(v, `${path}[${i}]`));
};

export const readOneOf = <T extends string>(values: readonly T[], value: unknown, path: string): T => {
  const found = values.find((v) => v === value);
  return found ?? fail(path, `${values.join('・')} のいずれかでなければならない（実際は ${String(value)}）`);
};

const readNullable = <T>(value: unknown, path: string, item: (v: unknown, p: string) => T): T | null =>
  value === null ? null : item(value, path);

const readStringArray = (value: unknown, path: string): string[] => readArray(value, path, readString);

const readOptionalStringArray = (obj: Obj, key: string, path: string): { [k: string]: string[] } =>
  key in obj ? { [key]: readStringArray(obj[key], `${path}.${key}`) } : {};

const readRecord = <K extends string, T>(
  keys: readonly K[],
  value: unknown,
  path: string,
  item: (v: unknown, p: string) => T,
): Record<K, T> => {
  const obj = readObject(value, path);
  for (const key of Object.keys(obj)) {
    readOneOf(keys, key, `${path}.${key}`);
  }
  const result: Partial<Record<K, T>> = {};
  for (const key of keys) {
    result[key] = item(field(obj, key, path), `${path}.${key}`);
  }
  return result as Record<K, T>;
};

const readTierTable = <T>(value: unknown, path: string, item: (v: unknown, p: string) => T): TierTable<T> =>
  readRecord<Tier, T>(TIERS, value, path, item);

const readProvisional = (obj: Obj, path: string): { provisional: boolean; provisionalFields?: string[] } => ({
  provisional: readBoolean(field(obj, 'provisional', path), `${path}.provisional`),
  ...('provisionalFields' in obj
    ? { provisionalFields: readStringArray(obj['provisionalFields'], `${path}.provisionalFields`) }
    : {}),
});

const readIntFields = <K extends string>(
  keys: readonly K[],
  value: unknown,
  path: string,
  allowNegative = false,
): Record<K, number> => {
  const obj = readObject(value, path);
  const result: Partial<Record<K, number>> = {};
  for (const key of keys) {
    result[key] = readInt(field(obj, key, path), `${path}.${key}`, allowNegative);
  }
  return result as Record<K, number>;
};

// ---------------------------------------------------------------------------
// 共通の部品
// ---------------------------------------------------------------------------

export const readTerrain = (value: unknown, path: string): Terrain => readOneOf(TERRAINS, value, path);
export const readBuilding = (value: unknown, path: string): Building => readOneOf(BUILDINGS, value, path);
const readAction = (value: unknown, path: string): Action => readOneOf(ACTIONS, value, path);
const readTier = (value: unknown, path: string): Tier => readOneOf(TIERS, value, path);

export const readCellId = (value: unknown, path: string): CellId => {
  const id = readString(value, path);
  return isCellId(id) ? id : fail(path, `存在しないマス ID である（${id}）`);
};

export const readGrant = (value: unknown, path: string): Grant => {
  const obj = readObject(value, path);
  const kind = readOneOf(GRANT_KINDS, field(obj, 'kind', path), `${path}.kind`);
  const amount = readPositiveInt(field(obj, 'amount', path), `${path}.amount`);
  if (kind === 'freeBuildOnTerrain') {
    return { kind, amount, terrain: readTerrain(field(obj, 'terrain', path), `${path}.terrain`) };
  }
  return { kind, amount };
};

const readPayment = (value: unknown, path: string): Payment => {
  const obj = readObject(value, path);
  return {
    kind: readOneOf(PAYMENT_KINDS, field(obj, 'kind', path), `${path}.kind`),
    amount: readPositiveInt(field(obj, 'amount', path), `${path}.amount`),
  };
};

const readLevelReward = (value: unknown, path: string): LevelReward => {
  const obj = readObject(value, path);
  return {
    level: readInt(field(obj, 'level', path), `${path}.level`),
    grants: readArray(field(obj, 'grants', path), `${path}.grants`, readGrant),
  };
};

const readClarification = (value: unknown, path: string): Clarification => {
  const obj = readObject(value, path);
  return {
    text: readString(field(obj, 'text', path), `${path}.text`),
    source: readString(field(obj, 'source', path), `${path}.source`),
    provisional: readBoolean(field(obj, 'provisional', path), `${path}.provisional`),
  };
};

const readUnlock = (value: unknown, path: string): UnlockCondition => {
  const obj = readObject(value, path);
  const metric = readOneOf(
    ['buildingsOfType', 'totalBuildings', 'landTiles', 'militaryLevel', 'civCardsPlayed'] as const,
    field(obj, 'metric', path),
    `${path}.metric`,
  );
  const atLeast = readInt(field(obj, 'atLeast', path), `${path}.atLeast`);
  if (metric === 'buildingsOfType') {
    return { metric, atLeast, building: readBuilding(field(obj, 'building', path), `${path}.building`) };
  }
  return { metric, atLeast };
};

const readExpeditionSelection = (value: unknown, path: string): ExpeditionSelection => {
  const obj = readObject(value, path);
  const mode = readOneOf(['distinct', 'total'] as const, field(obj, 'mode', path), `${path}.mode`);
  if (mode === 'distinct') {
    return { mode, max: readPositiveInt(field(obj, 'max', path), `${path}.max`) };
  }
  return {
    mode,
    total: readPositiveInt(field(obj, 'total', path), `${path}.total`),
    maxSame: readPositiveInt(field(obj, 'maxSame', path), `${path}.maxSame`),
  };
};

const readIntArray = (value: unknown, path: string): number[] => readArray(value, path, (v, p) => readInt(v, p));

// ---------------------------------------------------------------------------
// params.json
// ---------------------------------------------------------------------------

export const parseParams = (value: unknown, path = 'params'): Params => {
  const obj = readObject(value, path);
  const at = (key: string): unknown => field(obj, key, path);
  const p = (key: string): string => `${path}.${key}`;

  const playerCountObj = readObject(at('playerCount'), p('playerCount'));
  const setupObj = readObject(at('setupByPlayerCount'), p('setupByPlayerCount'));
  const setupByPlayerCount: Params['setupByPlayerCount'] = Object.fromEntries(
    Object.entries(setupObj).map(([count, v]) => [
      count,
      readIntFields(
        ['specialCitizensRevealed', 'plannedCityRevealed', 'bonusTilesOnBoard', 'plannedCityMaxDeclarers', 'draftBoardCandidates', 'draftCharacterCandidates'] as const,
        v,
        `${p('setupByPlayerCount')}.${count}`,
      ),
    ]),
  );

  const boardObj = readObject(at('board'), p('board'));
  const buildingsObj = readObject(at('buildings'), p('buildings'));
  const bp = (key: string): string => `${p('buildings')}.${key}`;
  const effectsObj = readObject(field(buildingsObj, 'effects', p('buildings')), bp('effects'));
  const ep = (key: string): string => `${bp('effects')}.${key}`;
  const effect = (key: string): Obj => readObject(field(effectsObj, key, bp('effects')), ep(key));
  const shop = effect('shop');
  const workshop = effect('workshop');
  const fort = effect('fort');
  const office = effect('office');
  const university = effect('university');
  const camp = effect('camp');

  const actionsObj = readObject(at('actions'), p('actions'));
  const ap = (key: string): string => `${p('actions')}.${key}`;
  const action = (key: string): unknown => field(actionsObj, key, p('actions'));
  const expeditionObj = readObject(action('expedition'), ap('expedition'));

  const militaryObj = readObject(at('military'), p('military'));
  const infraObj = readObject(at('infra'), p('infra'));
  const raidObj = readObject(at('raid'), p('raid'));
  const freeObj = readObject(at('freeActions'), p('freeActions'));
  const civObj = readObject(at('civCards'), p('civCards'));
  const bonusObj = readObject(at('bonusTiles'), p('bonusTiles'));
  const scoringObj = readObject(at('scoring'), p('scoring'));
  const sp = (key: string): string => `${p('scoring')}.${key}`;
  const scoring = (key: string): unknown => field(scoringObj, key, p('scoring'));
  const natureObj = readObject(scoring('natureParkPointsBySetSize'), sp('natureParkPointsBySetSize'));

  return {
    ...readProvisional(obj, path),
    rulesVersion: readString(at('rulesVersion'), p('rulesVersion')),
    rounds: readPositiveInt(at('rounds'), p('rounds')),
    playerCount: {
      min: readPositiveInt(field(playerCountObj, 'min', p('playerCount')), `${p('playerCount')}.min`),
      max: readPositiveInt(field(playerCountObj, 'max', p('playerCount')), `${p('playerCount')}.max`),
    },
    setupByPlayerCount,
    board: {
      terrainCounts: readRecord(TERRAINS, field(boardObj, 'terrainCounts', p('board')), `${p('board')}.terrainCounts`, (v, q) =>
        readInt(v, q),
      ),
      initialCells: readArray(field(boardObj, 'initialCells', p('board')), `${p('board')}.initialCells`, readCellId),
      initialTerrain: readTerrain(field(boardObj, 'initialTerrain', p('board')), `${p('board')}.initialTerrain`),
    },
    initial: readIntFields(
      [
        'gold',
        'materials',
        'goldProduction',
        'materialProduction',
        'regularWorkers',
        'tempWorkers',
        'civCards',
        'militaryLevel',
        'infraLevel',
      ] as const,
      at('initial'),
      p('initial'),
    ),
    workers: readIntFields(
      ['regularBase', 'housesPerExtraRegular', 'regularMax', 'tempMax'] as const,
      at('workers'),
      p('workers'),
    ),
    land: readIntFields(['materialsPerTile', 'mismatchExtraMaterials', 'minTotalMaterials'] as const, at('land'), p('land')),
    buildings: {
      limits: readRecord(BUILDINGS, field(buildingsObj, 'limits', p('buildings')), bp('limits'), (v, q) => readInt(v, q)),
      cost: readRecord(BUILDINGS, field(buildingsObj, 'cost', p('buildings')), bp('cost'), (v, q) =>
        readIntFields(['gold', 'materials'] as const, v, q),
      ),
      minCost: readInt(field(buildingsObj, 'minCost', p('buildings')), bp('minCost')),
      terrainBonus: readArray(field(buildingsObj, 'terrainBonus', p('buildings')), bp('terrainBonus'), (v, q) => {
        const o = readObject(v, q);
        return {
          terrain: readTerrain(field(o, 'terrain', q), `${q}.terrain`),
          buildings: readArray(field(o, 'buildings', q), `${q}.buildings`, readBuilding),
          grant: readGrant(field(o, 'grant', q), `${q}.grant`),
        };
      }),
      effects: {
        shop: {
          goldProductionOnBuild: readInt(field(shop, 'goldProductionOnBuild', ep('shop')), `${ep('shop')}.goldProductionOnBuild`),
          goldProductionAfterImportByCount: readIntArray(
            field(shop, 'goldProductionAfterImportByCount', ep('shop')),
            `${ep('shop')}.goldProductionAfterImportByCount`,
          ),
        },
        workshop: {
          materialProductionOnBuild: readInt(
            field(workshop, 'materialProductionOnBuild', ep('workshop')),
            `${ep('workshop')}.materialProductionOnBuild`,
          ),
          goldAfterExportByCount: readIntArray(
            field(workshop, 'goldAfterExportByCount', ep('workshop')),
            `${ep('workshop')}.goldAfterExportByCount`,
          ),
        },
        fort: {
          militaryOnBuild: readInt(field(fort, 'militaryOnBuild', ep('fort')), `${ep('fort')}.militaryOnBuild`),
          drillTokenCostByCount: readIntArray(
            field(fort, 'drillTokenCostByCount', ep('fort')),
            `${ep('fort')}.drillTokenCostByCount`,
          ),
        },
        office: {
          infraOnBuild: readInt(field(office, 'infraOnBuild', ep('office')), `${ep('office')}.infraOnBuild`),
          welfareConvertMaterialsByCount: readIntArray(
            field(office, 'welfareConvertMaterialsByCount', ep('office')),
            `${ep('office')}.welfareConvertMaterialsByCount`,
          ),
          welfareConvertMaxWorkers: readInt(
            field(office, 'welfareConvertMaxWorkers', ep('office')),
            `${ep('office')}.welfareConvertMaxWorkers`,
          ),
        },
        university: {
          drawOnBuild: readInt(field(university, 'drawOnBuild', ep('university')), `${ep('university')}.drawOnBuild`),
          civCardGoldDiscountPerUniversity: readInt(
            field(university, 'civCardGoldDiscountPerUniversity', ep('university')),
            `${ep('university')}.civCardGoldDiscountPerUniversity`,
          ),
        },
        camp: readIntFields(['landTilesOnBuild', 'adjacentMaterialDiscount', 'maxTotalDiscount'] as const, camp, ep('camp')),
      },
    },
    actions: {
      workerCost: readTierTable(action('workerCost'), ap('workerCost'), readPositiveInt),
      shared: readArray(action('shared'), ap('shared'), (v, q) => {
        const o = readObject(v, q);
        return {
          action: readAction(field(o, 'action', q), `${q}.action`),
          tier: readTier(field(o, 'tier', q), `${q}.tier`),
        };
      }),
      unlockTop: readRecord(ACTIONS, action('unlockTop'), ap('unlockTop'), readUnlock),
      pioneer: readTierTable(action('pioneer'), ap('pioneer'), (v, q) =>
        readIntFields(['maxTiles', 'materialDiscount'] as const, v, q),
      ),
      build: readTierTable(action('build'), ap('build'), (v, q) =>
        readIntFields(['maxBuildings', 'goldDiscount', 'materialDiscount'] as const, v, q),
      ),
      import: readTierTable(action('import'), ap('import'), (v, q) =>
        readIntFields(['payGold', 'gainMaterials', 'maxTimes', 'bonusMaterials'] as const, v, q),
      ),
      export: readTierTable(action('export'), ap('export'), (v, q) =>
        readIntFields(['payMaterials', 'gainGold', 'maxTimes', 'bonusGold'] as const, v, q),
      ),
      drill: readTierTable(action('drill'), ap('drill'), (v, q) =>
        readIntFields(['payGold', 'gainTokens', 'maxRaises'] as const, v, q),
      ),
      expedition: {
        rewards: readArray(field(expeditionObj, 'rewards', ap('expedition')), `${ap('expedition')}.rewards`, readLevelReward),
        selection: readTierTable(
          field(expeditionObj, 'selection', ap('expedition')),
          `${ap('expedition')}.selection`,
          readExpeditionSelection,
        ),
      },
      welfare: readTierTable(action('welfare'), ap('welfare'), (v, q) =>
        readIntFields(['payMaterials', 'infra', 'tempWorkers'] as const, v, q),
      ),
      migration: readTierTable(action('migration'), ap('migration'), (v, q) => {
        const o = readObject(v, q);
        return {
          ...readIntFields(['tempWorkers', 'regularWorkers'] as const, o, q),
          regularWorkersIsMax: readBoolean(field(o, 'regularWorkersIsMax', q), `${q}.regularWorkersIsMax`),
        };
      }),
      research: readTierTable(action('research'), ap('research'), (v, q) =>
        readIntFields(['draw', 'discard'] as const, v, q),
      ),
      spread: readTierTable(action('spread'), ap('spread'), (v, q) => {
        const o = readObject(v, q);
        return {
          ...readIntFields(['maxCards', 'goldPerCard'] as const, o, q),
          cardsIsMax: readBoolean(field(o, 'cardsIsMax', q), `${q}.cardsIsMax`),
        };
      }),
    },
    military: {
      max: readPositiveInt(field(militaryObj, 'max', p('military')), `${p('military')}.max`),
      rewards: readArray(field(militaryObj, 'rewards', p('military')), `${p('military')}.rewards`, readLevelReward),
      overflowPointsPerRaise: readInt(
        field(militaryObj, 'overflowPointsPerRaise', p('military')),
        `${p('military')}.overflowPointsPerRaise`,
      ),
    },
    infra: {
      max: readPositiveInt(field(infraObj, 'max', p('infra')), `${p('infra')}.max`),
      rewards: readArray(field(infraObj, 'rewards', p('infra')), `${p('infra')}.rewards`, readLevelReward),
    },
    raid: {
      firstRoundCard: readPositiveInt(field(raidObj, 'firstRoundCard', p('raid')), `${p('raid')}.firstRoundCard`),
      basePointsPerRound: readIntFields(
        ['defenseFailed', 'defended', 'repelled'] as const,
        field(raidObj, 'basePointsPerRound', p('raid')),
        `${p('raid')}.basePointsPerRound`,
        true,
      ),
    },
    freeActions: {
      conversions: readArray(field(freeObj, 'conversions', p('freeActions')), `${p('freeActions')}.conversions`, (v, q) => {
        const o = readObject(v, q);
        return {
          id: readString(field(o, 'id', q), `${q}.id`),
          pay: readPayment(field(o, 'pay', q), `${q}.pay`),
          gain: readGrant(field(o, 'gain', q), `${q}.gain`),
        };
      }),
    },
    civCards: {
      emptyDeckFallbackMaterials: readInt(
        field(civObj, 'emptyDeckFallbackMaterials', p('civCards')),
        `${p('civCards')}.emptyDeckFallbackMaterials`,
      ),
    },
    bonusTiles: {
      kinds: readPositiveInt(field(bonusObj, 'kinds', p('bonusTiles')), `${p('bonusTiles')}.kinds`),
    },
    scoring: {
      base: readIntFields(
        ['landTilesPerPoint', 'buildingsPerPoint', 'regularWorkersPerPoint'] as const,
        scoring('base'),
        sp('base'),
      ),
      goldPerPointByShops: readArray(scoring('goldPerPointByShops'), sp('goldPerPointByShops'), readPositiveInt),
      materialsPerPointByWorkshops: readArray(
        scoring('materialsPerPointByWorkshops'),
        sp('materialsPerPointByWorkshops'),
        readPositiveInt,
      ),
      civCardsPerPointByUniversities: readArray(
        scoring('civCardsPerPointByUniversities'),
        sp('civCardsPerPointByUniversities'),
        readPositiveInt,
      ),
      regularWorkersDivisorByOffices: readArray(
        scoring('regularWorkersDivisorByOffices'),
        sp('regularWorkersDivisorByOffices'),
        (v, q) => readNullable(v, q, readPositiveInt),
      ),
      plannedCityPointsByRank: readIntArray(scoring('plannedCityPointsByRank'), sp('plannedCityPointsByRank')),
      natureParkPointsBySetSize: Object.fromEntries(
        Object.entries(natureObj).map(([size, v]) => [size, readInt(v, `${sp('natureParkPointsBySetSize')}.${size}`)]),
      ),
    },
  };
};

// ---------------------------------------------------------------------------
// 個人ボード
// ---------------------------------------------------------------------------

export const parseBoard = (value: unknown, path = 'board'): Board => {
  const obj = readObject(value, path);
  const squaresObj = readObject(field(obj, 'squares', path), `${path}.squares`);
  for (const key of Object.keys(squaresObj)) {
    readCellId(key, `${path}.squares.${key}`);
  }
  const squares: Partial<Record<CellId, BoardSquare>> = {};
  for (const id of CELL_IDS) {
    const q = `${path}.squares.${id}`;
    const square = readObject(field(squaresObj, id, `${path}.squares`), q);
    squares[id] = {
      terrain: readTerrain(field(square, 'terrain', q), `${q}.terrain`),
      bonus: readNullable(field(square, 'bonus', q), `${q}.bonus`, readGrant),
    };
  }
  const seed = field(obj, 'generatedWithSeed', path);
  return {
    ...readProvisional(obj, path),
    id: readString(field(obj, 'id', path), `${path}.id`),
    name: readString(field(obj, 'name', path), `${path}.name`),
    generatedWithSeed: readNullable(seed, `${path}.generatedWithSeed`, (v, q) => readInt(v, q)),
    squares: squares as Record<CellId, BoardSquare>,
  };
};

// ---------------------------------------------------------------------------
// カード類
// ---------------------------------------------------------------------------

const readList = <T>(value: unknown, path: string, listKey: string, item: (v: unknown, p: string) => T): T[] => {
  const obj = readObject(value, path);
  readBoolean(field(obj, 'provisional', path), `${path}.provisional`);
  return readArray(field(obj, listKey, path), `${path}.${listKey}`, item);
};

export const parseCivilizationCards = (value: unknown, path = 'cards_civilization'): CivilizationCard[] =>
  readList(value, path, 'cards', (v, q) => {
    const o = readObject(v, q);
    const cost = readObject(field(o, 'cost', q), `${q}.cost`);
    return {
      ...readProvisional(o, q),
      id: readString(field(o, 'id', q), `${q}.id`),
      name: readString(field(o, 'name', q), `${q}.name`),
      cost: { gold: readInt(field(cost, 'gold', `${q}.cost`), `${q}.cost.gold`) },
      tags: readArray(field(o, 'tags', q), `${q}.tags`, (t, tp) => readOneOf(CIV_TAGS, t, tp)),
      playCondition: readNullable(field(o, 'playCondition', q), `${q}.playCondition`, readString),
      effectCondition: readNullable(field(o, 'effectCondition', q), `${q}.effectCondition`, readString),
      points: readInt(field(o, 'points', q), `${q}.points`, true),
      text: readString(field(o, 'text', q), `${q}.text`),
      clarifications: readArray(field(o, 'clarifications', q), `${q}.clarifications`, readClarification),
    };
  });

export const parsePlannedCityCards = (value: unknown, path = 'cards_planned_city'): PlannedCityCard[] =>
  readList(value, path, 'cards', (v, q) => {
    const o = readObject(v, q);
    return {
      ...readProvisional(o, q),
      id: readString(field(o, 'id', q), `${q}.id`),
      name: readString(field(o, 'name', q), `${q}.name`),
      shape: readString(field(o, 'shape', q), `${q}.shape`),
      slots: readArray(field(o, 'slots', q), `${q}.slots`, (s, sp) => {
        const so = readObject(s, sp);
        return {
          q: readInt(field(so, 'q', sp), `${sp}.q`, true),
          r: readInt(field(so, 'r', sp), `${sp}.r`, true),
          terrain: readNullable(field(so, 'terrain', sp), `${sp}.terrain`, readTerrain),
          building: readNullable(field(so, 'building', sp), `${sp}.building`, readBuilding),
        };
      }),
      benefit: readGrant(field(o, 'benefit', q), `${q}.benefit`),
    };
  });

export const parseNatureParkCards = (value: unknown, path = 'cards_nature_park'): NatureParkCard[] =>
  readList(value, path, 'cards', (v, q) => {
    const o = readObject(v, q);
    return {
      ...readProvisional(o, q),
      id: readString(field(o, 'id', q), `${q}.id`),
      name: readString(field(o, 'name', q), `${q}.name`),
      sets: readArray(field(o, 'sets', q), `${q}.sets`, (s, sp) => {
        const so = readObject(s, sp);
        return {
          cells: readArray(field(so, 'cells', sp), `${sp}.cells`, (c, cp) => {
            const co = readObject(c, cp);
            return {
              q: readInt(field(co, 'q', cp), `${cp}.q`, true),
              r: readInt(field(co, 'r', cp), `${cp}.r`, true),
              terrain: readTerrain(field(co, 'terrain', cp), `${cp}.terrain`),
            };
          }),
        };
      }),
    };
  });

export const parseBonusTiles = (value: unknown, path = 'bonus_tiles'): BonusTile[] =>
  readList(value, path, 'tiles', (v, q) => {
    const o = readObject(v, q);
    return {
      ...readProvisional(o, q),
      id: readPositiveInt(field(o, 'id', q), `${q}.id`),
      text: readString(field(o, 'text', q), `${q}.text`),
      rulesRef: readString(field(o, 'rulesRef', q), `${q}.rulesRef`),
      clarifications: readArray(field(o, 'clarifications', q), `${q}.clarifications`, readClarification),
    };
  });

export const parseCharacters = (value: unknown, path = 'characters'): Character[] =>
  readList(value, path, 'characters', (v, q) => {
    const o = readObject(v, q);
    return {
      ...readProvisional(o, q),
      id: readString(field(o, 'id', q), `${q}.id`),
      name: readString(field(o, 'name', q), `${q}.name`),
      label: readString(field(o, 'label', q), `${q}.label`),
      axis: readString(field(o, 'axis', q), `${q}.axis`),
      initial_bonus: readStringArray(field(o, 'initial_bonus', q), `${q}.initial_bonus`),
      effects: readArray(field(o, 'effects', q), `${q}.effects`, (e, ep): CharacterEffect => {
        const eo = readObject(e, ep);
        return {
          text: readString(field(eo, 'text', ep), `${ep}.text`),
          ...readOptionalStringArray(eo, 'items', ep),
        };
      }),
      open_issues: readStringArray(field(o, 'open_issues', q), `${q}.open_issues`),
      ...readOptionalStringArray(o, 'clarifications', q),
    };
  });

export const parseSpecialCitizens = (value: unknown, path = 'special_citizens'): SpecialCitizen[] =>
  readList(value, path, 'cards', (v, q) => {
    const o = readObject(v, q);
    return {
      ...readProvisional(o, q),
      id: readString(field(o, 'id', q), `${q}.id`),
      effects: readArray(field(o, 'effects', q), `${q}.effects`, (e, ep): SpecialCitizenEffect => {
        const eo = readObject(e, ep);
        return {
          timing: readString(field(eo, 'timing', ep), `${ep}.timing`),
          text: readString(field(eo, 'text', ep), `${ep}.text`),
          ...('worker_cost' in eo ? { worker_cost: readPositiveInt(eo['worker_cost'], `${ep}.worker_cost`) } : {}),
        };
      }),
      open_issues: readStringArray(field(o, 'open_issues', q), `${q}.open_issues`),
      ...readOptionalStringArray(o, 'clarifications', q),
    };
  });

export const parseRaidCards = (value: unknown, path = 'raid_cards'): RaidCard[] =>
  readList(value, path, 'cards', (v, q) => {
    const o = readObject(v, q);
    return {
      ...readProvisional(o, q),
      id: readPositiveInt(field(o, 'id', q), `${q}.id`),
      defense_increase: readInt(field(o, 'defense_increase', q), `${q}.defense_increase`),
      repel_increase: readInt(field(o, 'repel_increase', q), `${q}.repel_increase`),
      on_defense_fail: readString(field(o, 'on_defense_fail', q), `${q}.on_defense_fail`),
      on_repel: readString(field(o, 'on_repel', q), `${q}.on_repel`),
      open_issues: readStringArray(field(o, 'open_issues', q), `${q}.open_issues`),
      ...readOptionalStringArray(o, 'clarifications', q),
    };
  });
