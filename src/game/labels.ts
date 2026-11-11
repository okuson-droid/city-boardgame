// 選択肢のラベルと文字表示のための名前・説明（指示書 2026-11-10 対話プレイ 2-5）。
// ラベルだけを読んで何を選ぶ手か分かるように、内部の識別子を名前と内容に置き換える。
// 文章は効果スクリプト（describeScript）と params.json から組み立て、データの原本の文言（text）は使わない。
// このモジュールは表示だけに関わり、選択肢の識別子と並び順には関わらない。

import { ICON_KEYS } from '../data/icon-keys.ts';
import type { Command } from '../data/script.ts';
import type { Action, BonusTile, Building, GameData, Grant, Payment, ScoreAxis, Terrain, TileEffect, Tier } from '../data/types.ts';
import type { CellId } from './board.ts';
import { describeCommands, describeScript } from './icons.ts';

export const labelIn = (section: keyof typeof ICON_KEYS, key: string): string =>
  (ICON_KEYS[section] as Readonly<Record<string, { label: string }>>)[key]?.label ?? key;

export const terrainLabel = (t: Terrain): string => labelIn('terrains', t);
export const buildingLabel = (b: Building): string => labelIn('buildings', b);
export const actionLabel = (a: Action): string => labelIn('actions', a);
export const tierLabel = (t: Tier): string => labelIn('tiers', t);

/** 得るもの1つの文（到達報酬・遠征の報酬・マスボーナス・地形ボーナス）。 */
export const grantText = (g: Grant): string => {
  switch (g.kind) {
    case 'landTiles':
      return `土地タイル${g.amount}枚を置く`;
    case 'buildRight':
      return `建物${g.amount}軒を建てる（建設の権利）`;
    case 'freeBuildOnTerrain':
      return `${terrainLabel(g.terrain)}に建物${g.amount}軒を無料で建てる`;
    case 'specialCitizen':
      return `特別な市民カード${g.amount}枚を獲得する`;
    case 'drawCivCards':
      return `文明カードを${g.amount}枚引く`;
    case 'points':
      return `${g.amount}点を得る`;
    case 'goldProduction':
    case 'materialProduction':
      return `${labelIn('resources', g.kind)}を${g.amount}上げる`;
    default:
      return `${labelIn('resources', g.kind)}${g.amount}を得る`;
  }
};

/** 得るもの1つの短い形（「資材1」「文明カード1枚」）。フリーアクションの「払う → 得る」に使う。 */
const grantShort = (g: Grant): string => {
  switch (g.kind) {
    case 'drawCivCards':
      return `文明カード${g.amount}枚を引く`;
    case 'landTiles':
      return `土地タイル${g.amount}枚`;
    case 'specialCitizen':
      return `特別な市民カード${g.amount}枚`;
    case 'points':
      return `${g.amount}点`;
    case 'buildRight':
      return `建設の権利${g.amount}`;
    case 'freeBuildOnTerrain':
      return `${terrainLabel(g.terrain)}への無料建設${g.amount}`;
    default:
      return `${labelIn('resources', g.kind)}${g.amount}`;
  }
};

const paymentShort = (p: Payment): string =>
  p.kind === 'civCards' ? `手札の文明カード${p.amount}枚` : `${labelIn('resources', p.kind)}${p.amount}`;

/** 命令1つの短い文（遠征の追加報酬など）。 */
export const commandText = (c: Command): string => describeCommands([c]);

// ---------------------------------------------------------------------------
// カード・キャラクター・タイルの名前と内容
// ---------------------------------------------------------------------------

export const civCardName = (d: GameData, id: string): string => {
  const card = d.civilizationCards.find((c) => c.id === id);
  return card === undefined ? `文明カード ${id}` : `${id}「${card.name}」`;
};

/** 文明カードの効果文（効果スクリプトから組み立てる）。 */
export const civCardEffect = (d: GameData, id: string): string => {
  const card = d.civilizationCards.find((c) => c.id === id);
  return card === undefined ? '' : describeScript(card.script).join('／');
};

export const characterName = (d: GameData, id: string): string => d.characters.find((c) => c.id === id)?.name ?? id;

export const boardName = (d: GameData, id: string): string => d.boards.find((b) => b.id === id)?.name ?? id;

/** 特別な市民カードの内容（効果スクリプトから組み立てる）。 */
export const specialCitizenText = (d: GameData, id: string): string => {
  const card = d.specialCitizens.find((c) => c.id === id);
  return card === undefined ? '' : describeScript(card.script).join('／');
};

export const plannedCityName = (d: GameData, id: string): string => d.plannedCityCards.find((c) => c.id === id)?.name ?? `計画都市 ${id}`;

const tileEffectText = (e: TileEffect): string => {
  switch (e.kind) {
    case 'militaryLevel':
      return `軍事レベルを${e.amount}上げる`;
    case 'infraLevel':
      return `インフラレベルを${e.amount}上げる`;
    case 'discardCivCards':
      return `手札から文明カード${e.amount}枚を捨てる`;
    default:
      return grantText({ kind: e.kind, amount: e.amount });
  }
};

const PASS_COUNT_LABELS: Record<NonNullable<BonusTile['passScore']>['count'], string> = {
  houses: '住宅',
  buildingTypes: '建設済みの建物の種類',
  playedCivCards: 'プレイ済みの文明カード',
};

/** ボーナスタイルの内容（roundStart と passScore から組み立てる）。 */
export const bonusTileText = (d: GameData, id: number): string => {
  const tile = d.bonusTiles.find((t) => t.id === id);
  if (tile === undefined) return '';
  const parts: string[] = [];
  if (tile.roundStart.length > 0) parts.push(`ラウンド開始時：${tile.roundStart.map(tileEffectText).join('・')}`);
  if (tile.passScore !== null) {
    const s = tile.passScore;
    parts.push(`パス時：${PASS_COUNT_LABELS[s.count]}${s.per}につき${s.points}点`);
  }
  return parts.join('／');
};

/** 能力の出どころの名前（"char:hero"・"sc:09"・"civ:018" など）。 */
export const sourceName = (d: GameData, source: string): string => {
  const colon = source.indexOf(':');
  const kind = colon < 0 ? source : source.slice(0, colon);
  const rest = colon < 0 ? '' : source.slice(colon + 1);
  switch (kind) {
    case 'infraOverflow':
      return 'インフラの超過';
    case 'terrainBonus':
      return `${buildingLabel(rest as Building)}の地形ボーナス`;
    case 'pass':
      return `ボーナスタイル${rest.replace(/^bonusTile:/, '')}のパス時`;
    case 'raid':
      return `襲撃カード${rest}`;
    case 'drill':
      return '教練の超過';
    case 'char':
      return `キャラクター「${characterName(d, rest)}」`;
    case 'sc':
      return `特別な市民カード${rest}`;
    case 'civ':
      return `文明カード ${civCardName(d, rest)}`;
    case 'plannedCity':
      return plannedCityName(d, rest);
    case 'square':
      return `${rest} のマスボーナス`;
    case 'military':
      return `軍事レベル${rest}の到達報酬`;
    case 'infra':
      return `インフラレベル${rest}の到達報酬`;
    case 'build':
      return `${buildingLabel(rest as Building)}の建設時効果`;
    case 'expedition':
      return '遠征の報酬';
    default:
      return source;
  }
};

// ---------------------------------------------------------------------------
// 選択肢のラベル
// ---------------------------------------------------------------------------

export const actionSpaceLabel = (d: GameData, action: Action, tier: Tier): string =>
  `${actionLabel(action)}・${tierLabel(tier)}（ワーカー${d.params.actions.workerCost[tier]}人）`;

export const conversionLabel = (conv: { readonly pay: Payment; readonly gain: Grant }, card?: string, d?: GameData): string => {
  const pay = card !== undefined && d !== undefined ? `文明カード ${civCardName(d, card)} を捨てる` : paymentShort(conv.pay);
  return `フリーアクション：${pay} → ${grantShort(conv.gain)}`;
};

export const tileLabel = (cell: CellId, cellTerrain: Terrain, tile: Terrain, bonus: Grant | null = null): string =>
  `${cell}（${terrainLabel(cellTerrain)}）に${terrainLabel(tile)}の土地タイルを置く${cellTerrain === tile ? '' : '（地形と異なる）'}${bonus === null ? '' : `（マスボーナス：${grantText(bonus)}）`}`;

export const buildLabel = (cell: CellId, building: Building): string => `${cell} に${buildingLabel(building)}を建てる`;

/** 能力1つの説明（フリーアクション・専用スペース）。 */
export const abilityLabel = (d: GameData, source: string, ability: Parameters<typeof describeScript>[0][number]): string =>
  `${sourceName(d, source)}の${describeScript([ability])[0] ?? ''}`;

export const commandsLabel = (commands: readonly Command[]): string => describeCommands(commands);

const AXIS_LABELS: Record<ScoreAxis, string> = {
  economy: '経済・産業',
  culture: '文化・学術',
  welfare: '生活・福祉',
  nature: '自然・環境',
  military: '軍事・防衛',
  other: 'その他',
};

/** 評価軸の名前（rules.md 1-1-1、17-0-2）。 */
export const axisLabel = (axis: ScoreAxis): string => AXIS_LABELS[axis];
