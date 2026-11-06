// design/ の設計文書から src/data/ の JSON を作る。
// 文言は変更せずに取り込み、provisional と、rules.md・指示書に基づく解釈（clarifications）を加える。
// 実行：npm run import:design
//
// design/ は読むだけで変更しない（指示書 0-1）。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARACTER_SCRIPTS, SPECIAL_CITIZEN_SCRIPTS } from './effect-scripts.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const designDir = join(root, 'design');
const dataDir = join(root, 'src', 'data');

const readJson = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(designDir, name), 'utf8')) as Record<string, unknown>;

const writeJson = (name: string, value: unknown): void => {
  writeFileSync(join(dataDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  console.log(`書き出した：src/data/${name}`);
};

const asRecords = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    throw new Error('配列ではない');
  }
  return value as Record<string, unknown>[];
};

// ---------------------------------------------------------------------------
// キャラクター・特別な市民カード：原本の構造のまま provisional を加える
// ---------------------------------------------------------------------------

// src/data/ の既存の値。効果スクリプトと仮置きの項目は、チューナーで調整した値を保つため既存の値を優先する。
// scripts/effect-scripts.ts は、まだ値がないときの初期値としてだけ使う。
const existingItems = (target: string, listKey: string): Map<string, Record<string, unknown>> => {
  const path = join(dataDir, target);
  if (!existsSync(path)) return new Map();
  const file = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const list = Array.isArray(file[listKey]) ? (file[listKey] as Record<string, unknown>[]) : [];
  return new Map(list.map((item) => [String(item['id']), item]));
};

/**
 * 原本にない（チューナーで新しく作った）既存の項目。取り込み直しても消さず、原本の項目の後ろに残す
 * （ユーザー決定 2026-11-04：チューナーで新しくカードを作れるようにする）。
 */
const tunerItems = (existing: Map<string, Record<string, unknown>>, importedIds: readonly unknown[]): Record<string, unknown>[] => {
  const imported = new Set(importedIds.map(String));
  return [...existing.entries()].filter(([id]) => !imported.has(id)).map(([, item]) => item);
};

const scriptOf = (scripts: Record<string, unknown[]>, existing: Map<string, Record<string, unknown>>, id: string): unknown[] => {
  const kept = existing.get(id)?.['script'];
  if (Array.isArray(kept)) return kept;
  const script = scripts[id];
  if (script === undefined) {
    throw new Error(`効果スクリプトがない：${id}`);
  }
  return script;
};

const importPlain = (source: string, target: string, listKey: string, scripts: Record<string, unknown[]>): void => {
  const original = readJson(source);
  const existing = existingItems(target, listKey);
  const items = asRecords(original[listKey]).map((item) => ({
    ...item,
    provisional: false,
    script: scriptOf(scripts, existing, String(item['id'])),
  }));
  writeJson(target, {
    importedFrom: `design/${source}`,
    provisional: false,
    ...original,
    [listKey]: [...items, ...tunerItems(existing, asRecords(original[listKey]).map((item) => item['id']))],
  });
};

// script は原本の文言を命令セットに書き直したもの。src/data/ に値があればそれを保つ。
importPlain('data_characters.json', 'characters.json', 'characters', CHARACTER_SCRIPTS);
importPlain('data_special_citizens.json', 'special_citizens.json', 'cards', SPECIAL_CITIZEN_SCRIPTS);

// ---------------------------------------------------------------------------
// 襲撃カード：rules.md 第19章の暫定規定を clarifications として加える
// ---------------------------------------------------------------------------

const raidClarifications = (id: number): string[] => {
  const list = ['「襲撃ラウンド数」は、その襲撃を判定するラウンドの番号（1〜5）である（rules.md v0.8 19-3-1）。'];
  if (id === 5) {
    list.push('得点は基本得点を含めた合算後の数値であり、7-5-1 の基本得点は加えない（rules.md v0.8 19-3-3）。');
  } else {
    list.push('7-5-1 の基本得点に加えて、この固有効果を適用する（rules.md v0.8 19-3-3）。');
  }
  if (id === 1 || id === 2 || id === 4) {
    list.push('「〜を失う」で保有量が足りない場合は、保有量を0にして終える（rules.md v0.8 19-3-4）。');
  }
  if (id === 3) {
    list.push('金の生産力は0未満にならない（rules.md v0.8 19-3-4）。');
  }
  if (id === 1 || id === 3) {
    list.push('撃退成功時の土地タイルは資材を支払わずに 4-2 に従って配置する（rules.md v0.8 19-1-1）。');
  }
  return list;
};

// 7-6-1 の固有効果を構造化したもの。perRound は「襲撃ラウンド数×」、afterNextIncome は「次の収入後」を表す。
// replacesBasePoints はカード5の「合算後の数値」（19-3-3）を表す。
const RAID_STRUCTURED: Record<number, Record<string, unknown>> = {
  1: {
    replacesBasePoints: false,
    defenseFailEffects: [{ kind: 'loseGold', amount: 3, perRound: false, afterNextIncome: true }],
    repelEffects: [{ kind: 'landTiles', amount: 1, perRound: false, afterNextIncome: false }],
  },
  2: {
    replacesBasePoints: false,
    defenseFailEffects: [{ kind: 'loseMaterials', amount: 1, perRound: true, afterNextIncome: true }],
    repelEffects: [{ kind: 'materials', amount: 1, perRound: true, afterNextIncome: false }],
  },
  3: {
    replacesBasePoints: false,
    defenseFailEffects: [{ kind: 'loseGoldProduction', amount: 1, perRound: true, afterNextIncome: false }],
    repelEffects: [{ kind: 'landTiles', amount: 1, perRound: true, afterNextIncome: false }],
  },
  4: {
    replacesBasePoints: false,
    defenseFailEffects: [{ kind: 'loseGold', amount: 2, perRound: true, afterNextIncome: true }],
    repelEffects: [
      { kind: 'gold', amount: 1, perRound: true, afterNextIncome: false },
      { kind: 'points', amount: 1, perRound: true, afterNextIncome: false },
    ],
  },
  5: {
    replacesBasePoints: true,
    defenseFailEffects: [{ kind: 'points', amount: -3, perRound: true, afterNextIncome: false }],
    repelEffects: [{ kind: 'points', amount: 4, perRound: true, afterNextIncome: false }],
  },
};

{
  const original = readJson('data_raid_cards.json');
  const existingRaid = existingItems('raid_cards.json', 'cards');
  const designCards = asRecords(original['cards']).map((card) => ({
    ...card,
    provisional: false,
    clarifications: raidClarifications(Number(card['id'])),
    ...RAID_STRUCTURED[Number(card['id'])],
  }));
  writeJson('raid_cards.json', {
    importedFrom: 'design/data_raid_cards.json',
    provisional: false,
    ...original,
    cards: [...designCards, ...tunerItems(existingRaid, asRecords(original['cards']).map((card) => card['id']))],
  });
}

// ---------------------------------------------------------------------------
// 文明カード：取り込まない
// ---------------------------------------------------------------------------
// 文明カードの正は 文明カード一覧（120枚）.xlsx に合わせた src/data/cards_civilization.json である
// （ユーザー決定 2026-11-06、docs/civ-cards-xlsx.md）。design/文明カード一覧_sample.md は古い版のため、
// ここから取り込み直すと名称・コスト・タグ・文言が古い値に戻る。よって文明カードは取り込まない。
