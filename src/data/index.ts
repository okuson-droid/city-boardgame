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

/** src/data/ のファイル名と中身。チューナーの調整案はファイル単位で差分を持ち、書き戻す。 */
export type DataFiles = Readonly<Record<string, unknown>>;

/** ファイル名と RawGameData の項目の対応（個人ボードは board_*.json の番号順）。 */
export const DATA_FILE_NAMES = {
  params: 'params.json',
  civilizationCards: 'cards_civilization.json',
  plannedCityCards: 'cards_planned_city.json',
  natureParkCards: 'cards_nature_park.json',
  specialCitizens: 'special_citizens.json',
  characters: 'characters.json',
  raidCards: 'raid_cards.json',
  bonusTiles: 'bonus_tiles.json',
} as const;

export const isBoardFileName = (name: string): boolean => /^board_\d+\.json$/.test(name);

/** 同梱のデータをファイル単位で持つ。 */
export const DATA_FILES: DataFiles = {
  [DATA_FILE_NAMES.params]: paramsJson,
  [DATA_FILE_NAMES.civilizationCards]: civilizationJson,
  [DATA_FILE_NAMES.plannedCityCards]: plannedCityJson,
  [DATA_FILE_NAMES.natureParkCards]: natureParkJson,
  [DATA_FILE_NAMES.specialCitizens]: specialCitizensJson,
  [DATA_FILE_NAMES.characters]: charactersJson,
  [DATA_FILE_NAMES.raidCards]: raidCardsJson,
  [DATA_FILE_NAMES.bonusTiles]: bonusTilesJson,
  ...Object.fromEntries(Object.entries(boardModules).map(([path, json]) => [path.replace('./', ''), json])),
};

/** ファイル単位のデータを RawGameData にする。 */
export const rawFromFiles = (files: DataFiles): RawGameData => ({
  params: files[DATA_FILE_NAMES.params],
  boards: Object.keys(files)
    .filter(isBoardFileName)
    .sort((a, b) => boardOrder(a) - boardOrder(b))
    .map((name) => files[name]),
  civilizationCards: files[DATA_FILE_NAMES.civilizationCards],
  plannedCityCards: files[DATA_FILE_NAMES.plannedCityCards],
  natureParkCards: files[DATA_FILE_NAMES.natureParkCards],
  specialCitizens: files[DATA_FILE_NAMES.specialCitizens],
  characters: files[DATA_FILE_NAMES.characters],
  raidCards: files[DATA_FILE_NAMES.raidCards],
  bonusTiles: files[DATA_FILE_NAMES.bonusTiles],
});

export const RAW_GAME_DATA: RawGameData = rawFromFiles(DATA_FILES);

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

declare global {
  // チューナーの試遊ページ（tools/tuner/play.html）が、調整案を適用したデータを置く。
  var __TUNER_FILES__: DataFiles | undefined;
}

/**
 * 調整案を適用したデータ。チューナーの開発サーバー（VITE_TUNER=1）でだけ読み、配布用ビルドでは常に undefined である。
 */
const tunerFiles: DataFiles | undefined = import.meta.env['VITE_TUNER'] === '1' ? globalThis.__TUNER_FILES__ : undefined;

/** 調整案で試遊しているか（画面に印を出すため）。 */
export const TUNER_PLAYTEST = tunerFiles !== undefined;

/**
 * データの版。データ一式の JSON から作る短い要約値（FNV-1a、32ビット）で、データを1か所でも変えると変わる。
 * オンライン版の部屋は作成時の版を記録し、版が変わった部屋は続けない（データの更新は進行中の対局に反映しない、ユーザー決定 2026-11-04）。
 */
export const dataVersionOf = (files: DataFiles): string => {
  const text = JSON.stringify(Object.keys(files).sort().map((name) => [name, files[name]]));
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
};

/** 使っているデータの版。 */
export const DATA_VERSION: string = dataVersionOf(tunerFiles ?? DATA_FILES);

/** 同梱のデータ一式。チューナーの試遊では調整案を適用したデータになる。 */
export const GAME_DATA: GameData = loadGameData(tunerFiles !== undefined ? rawFromFiles(tunerFiles) : RAW_GAME_DATA);
export * from './script.ts';
export { ICON_KEYS, checkIconKeys, type IconEntry, type IconKeys } from './icon-keys.ts';
