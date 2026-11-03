// src/data/ の入口。JSON を型検査（validate.ts）と整合検査（check.ts）に通し、GameData として公開する。
// ゲームロジックとチューナーはこのモジュールを通してデータを読む。

import bonusTilesJson from './bonus_tiles.json';
import civilizationJson from './cards_civilization.json';
import natureParkJson from './cards_nature_park.json';
import plannedCityJson from './cards_planned_city.json';
import charactersJson from './characters.json';
import paramsJson from './params.json';
import raidCardsJson from './raid_cards.json';
import specialCitizensJson from './special_citizens.json';
import { checkGameData, type DataIssue } from './check.ts';
import type { GameData } from './types.ts';
import {
  parseBoard,
  parseBonusTiles,
  parseCharacters,
  parseCivilizationCards,
  parseNatureParkCards,
  parseParams,
  parsePlannedCityCards,
  parseRaidCards,
  parseSpecialCitizens,
} from './validate.ts';

export * from './types.ts';
export { checkGameData, type DataIssue } from './check.ts';
export { DataValidationError } from './validate.ts';

/** JSON から読んだままの、検査前のデータ一式。チューナーの調整案はこの形を編集する。 */
export type RawGameData = {
  readonly params: unknown;
  readonly boards: readonly unknown[];
  readonly civilizationCards: unknown;
  readonly plannedCityCards: unknown;
  readonly natureParkCards: unknown;
  readonly specialCitizens: unknown;
  readonly characters: unknown;
  readonly raidCards: unknown;
  readonly bonusTiles: unknown;
};

const boardModules = import.meta.glob<unknown>('./board_*.json', { eager: true, import: 'default' });

const boardOrder = (path: string): number => Number(/board_(\d+)\.json$/.exec(path)?.[1] ?? Number.NaN);

export const RAW_GAME_DATA: RawGameData = {
  params: paramsJson,
  boards: Object.keys(boardModules)
    .sort((a, b) => boardOrder(a) - boardOrder(b))
    .map((path) => boardModules[path]),
  civilizationCards: civilizationJson,
  plannedCityCards: plannedCityJson,
  natureParkCards: natureParkJson,
  specialCitizens: specialCitizensJson,
  characters: charactersJson,
  raidCards: raidCardsJson,
  bonusTiles: bonusTilesJson,
};

/** 型検査を行い GameData にする。型に合わない値があれば DataValidationError を投げる。 */
export const parseGameData = (raw: RawGameData): GameData => ({
  params: parseParams(raw.params),
  boards: raw.boards.map((board, i) => parseBoard(board, `boards[${i}]`)),
  civilizationCards: parseCivilizationCards(raw.civilizationCards),
  plannedCityCards: parsePlannedCityCards(raw.plannedCityCards),
  natureParkCards: parseNatureParkCards(raw.natureParkCards),
  specialCitizens: parseSpecialCitizens(raw.specialCitizens),
  characters: parseCharacters(raw.characters),
  raidCards: parseRaidCards(raw.raidCards),
  bonusTiles: parseBonusTiles(raw.bonusTiles),
});

/** 型検査と整合検査を行う。問題があれば例外を投げる。 */
export const loadGameData = (raw: RawGameData): GameData => {
  const data = parseGameData(raw);
  const issues: DataIssue[] = checkGameData(data);
  if (issues.length > 0) {
    const lines = issues.map((issue) => `- ${issue.path}：${issue.message}`).join('\n');
    throw new Error(`データの整合検査に失敗した：\n${lines}`);
  }
  return data;
};

/** 同梱のデータ一式。 */
export const GAME_DATA: GameData = loadGameData(RAW_GAME_DATA);
export * from './script.ts';
export { ICON_KEYS, checkIconKeys, type IconEntry, type IconKeys } from './icon-keys.ts';
