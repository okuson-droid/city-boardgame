// 早見表と吹き出しのための説明（ユーザー決定 2026-11-07：プレイ中に建物の効果や遠征の報酬をルール解説を開かずに確かめられるようにする）。
// 文章と数値はすべて params.json から組み立てる。チューナーで値を変えても表示が食い違わない。
// 画面は queries.ts の再輸出を通して使う。

import { GAME_DATA } from '../data/index.ts';
import { ICON_KEYS } from '../data/icon-keys.ts';
import { ACTIONS, BUILDINGS, type Action, type Building, type GameData, type Grant, type UnlockCondition } from '../data/types.ts';
import type { Command } from '../data/script.ts';
import { expeditionTable } from './actions.ts';
import { buildingCount } from './core.ts';
import type { PlayerState } from './types.ts';

const labelIn = (section: keyof typeof ICON_KEYS, key: string): string =>
  (ICON_KEYS[section] as Readonly<Record<string, { label: string }>>)[key]?.label ?? key;

export const buildingLabel = (b: Building): string => labelIn('buildings', b);
export const actionLabel = (a: Action): string => labelIn('actions', a);

/** 得るもの1つの文（到達報酬・遠征の報酬・マスボーナス・地形ボーナス）。 */
export const grantText = (g: Grant): string => {
  switch (g.kind) {
    case 'landTiles':
      return `土地タイル${g.amount}枚を置く`;
    case 'buildRight':
      return `建物${g.amount}軒を建てる（建設の権利）`;
    case 'freeBuildOnTerrain':
      return `${labelIn('terrains', g.terrain)}に建物${g.amount}軒を無料で建てる`;
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

/** 命令1つの短い文（遠征の追加報酬など、資源を得るだけの命令を想定する）。 */
const commandText = (c: Command): string => {
  if (c.op === 'gain' && typeof c.amount === 'number') {
    return c.res === 'drawCivCards' ? `文明カードを${c.amount}枚引く` : `${labelIn('resources', c.res)}${c.amount}を得る`;
  }
  if (c.op === 'placeTiles') return '土地タイルを置く';
  return c.op;
};

/** 最上位の解放条件の文。 */
export const unlockText = (u: UnlockCondition): string => {
  switch (u.metric) {
    case 'buildingsOfType':
      return `${buildingLabel(u.building)}${u.atLeast}軒`;
    case 'totalBuildings':
      return `建物${u.atLeast}軒`;
    case 'landTiles':
      return `土地タイル${u.atLeast}枚`;
    case 'militaryLevel':
      return `軍事レベル${u.atLeast}`;
    case 'civCardsPlayed':
      return `文明カード${u.atLeast}枚プレイ`;
  }
};

const byCount = (values: readonly (number | string)[], unit: (v: number | string) => string): string =>
  values
    .slice(1)
    .map((v) => unit(v))
    .join('・');

export type BuildingInfo = {
  readonly building: Building;
  readonly name: string;
  readonly limit: number;
  readonly cost: { readonly gold: number; readonly materials: number };
  /** 地形ボーナス（土地タイルの種類 → 得るもの）。 */
  readonly terrainBonus: readonly string[];
  readonly onBuild: readonly string[];
  readonly always: readonly string[];
  /** 終了時の得点への関わり。 */
  readonly endScore: string | null;
  /** この建物の数で解放される最上位。 */
  readonly unlocks: readonly string[];
};

/** 建物1種の効果のまとめ。軒数で変わる値は「1〜上限軒」の順に並べる。 */
export const buildingInfo = (b: Building, d: GameData = GAME_DATA): BuildingInfo => {
  const p = d.params;
  const e = p.buildings.effects;
  const s = p.scoring;
  const terrainBonus = p.buildings.terrainBonus
    .filter((t) => t.buildings.includes(b))
    .map((t) => `${labelIn('terrains', t.terrain)}：${grantText(t.grant)}`);
  const unlocks = ACTIONS.filter((a) => {
    const u = p.actions.unlockTop[a];
    return u.metric === 'buildingsOfType' && u.building === b;
  }).map((a) => {
    const u = p.actions.unlockTop[a];
    return `${u.metric === 'buildingsOfType' ? u.atLeast : ''}軒で${actionLabel(a)}の最上位を解放`;
  });
  const onBuild: string[] = [];
  const always: string[] = [];
  let endScore: string | null = null;
  switch (b) {
    case 'shop':
      onBuild.push(`金の生産力＋${e.shop.goldProductionOnBuild}`);
      always.push(`輸入の後、金の生産力＋${byCount(e.shop.goldProductionAfterImportByCount, String)}（商店1〜${p.buildings.limits.shop}軒）`);
      endScore = `経済・産業：金の収入 ${byCount(s.goldPerPointByShops, String)} につき1点（商店1〜${p.buildings.limits.shop}軒。0軒は${s.goldPerPointByShops[0]}）`;
      break;
    case 'workshop':
      onBuild.push(`資材の生産力＋${e.workshop.materialProductionOnBuild}`);
      always.push(`輸出の後、金${byCount(e.workshop.goldAfterExportByCount, String)}を得る（工房1〜${p.buildings.limits.workshop}軒）`);
      endScore = `経済・産業：資材の収入 ${byCount(s.materialsPerPointByWorkshops, String)} につき1点（工房1〜${p.buildings.limits.workshop}軒。0軒は${s.materialsPerPointByWorkshops[0]}）`;
      break;
    case 'fort':
      onBuild.push(`軍事レベル＋${e.fort.militaryOnBuild}`);
      always.push(`教練の上昇1回に払う軍事力トークン ${byCount(e.fort.drillTokenCostByCount, String)}（砦1〜${p.buildings.limits.fort}軒。0軒は${e.fort.drillTokenCostByCount[0]}）`);
      break;
    case 'office':
      onBuild.push(`インフラレベル＋${e.office.infraOnBuild}`);
      always.push(
        `福祉の後、臨時ワーカー${e.office.welfareConvertMaxWorkers}人を資材${byCount(e.office.welfareConvertMaterialsByCount, String)}に換えられる（役所1〜${p.buildings.limits.office}軒）`,
      );
      endScore = `生活・福祉：通常ワーカー1人につき ${byCount(s.regularWorkerPointsByOffices, String)} 点（役所1〜${p.buildings.limits.office}軒、端数は切り捨て）`;
      break;
    case 'university':
      onBuild.push(`文明カードを${e.university.drawOnBuild}枚引く`);
      always.push(`1軒につき文明カードのコスト−${e.university.civCardGoldDiscountPerUniversity}金（最低0金）`);
      endScore = `文化・学術：プレイ済みの文明カード ${byCount(s.civCardsPerPointByUniversities, String)} 枚につき1点（大学1〜${p.buildings.limits.university}軒。0軒は${s.civCardsPerPointByUniversities[0]}）`;
      break;
    case 'camp':
      onBuild.push(`土地タイル${e.camp.landTilesOnBuild}枚を置く（資材なし）`);
      always.push(`隣接する6マスへの建設コスト−${e.camp.adjacentMaterialDiscount}資材（重なっても−${e.camp.maxTotalDiscount}まで）`);
      break;
    case 'house':
      always.push(`${p.workers.housesPerExtraRegular}軒ごとに通常ワーカーの上限＋1（最大${p.workers.regularMax}人）`);
      break;
  }
  return {
    building: b,
    name: buildingLabel(b),
    limit: p.buildings.limits[b],
    cost: p.buildings.cost[b],
    terrainBonus,
    onBuild,
    always,
    endScore,
    unlocks,
  };
};

/** 建物の吹き出しの文。 */
export const describeBuilding = (b: Building, d: GameData = GAME_DATA): string => {
  const i = buildingInfo(b, d);
  return [
    `${i.name}（上限${i.limit}軒）：金${i.cost.gold}・資材${i.cost.materials}`,
    ...(i.onBuild.length > 0 ? [`建設時：${i.onBuild.join('、')}`] : []),
    ...i.always.map((t) => `常に：${t}`),
    ...(i.terrainBonus.length > 0 ? [`地形ボーナス：${i.terrainBonus.join('、')}`] : []),
    ...(i.endScore !== null ? [`終了時：${i.endScore}`] : []),
    ...i.unlocks,
  ].join('\n');
};

export const ALL_BUILDINGS: readonly Building[] = BUILDINGS;

export type ExpeditionRow = { readonly level: number; readonly text: string; readonly reachable: boolean; readonly extra: boolean };

/** 遠征の報酬表。player を渡すと、指揮官などの追加報酬と、いまの軍事レベルでトークンなしに届くかを含める。 */
export const expeditionRows = (player: PlayerState | null, d: GameData = GAME_DATA): ExpeditionRow[] => {
  const base = d.params.actions.expedition.rewards.length;
  const table = player === null ? d.params.actions.expedition.rewards.map((r) => ({ level: r.level, grants: r.grants, command: null })) : expeditionTable(d, player);
  return table
    .map((row, i) => ({
      level: row.level,
      text: [...row.grants.map(grantText), ...(row.command !== null ? [commandText(row.command)] : [])].join('・'),
      reachable: player !== null && row.level <= player.militaryLevel,
      extra: i >= base,
    }))
    .sort((a, b) => a.level - b.level);
};

/** 遠征の報酬表の1行の文（行動ボードの吹き出し用）。 */
export const describeExpeditionRewards = (player: PlayerState | null, d: GameData = GAME_DATA): string =>
  `報酬：${expeditionRows(player, d)
    .map((r) => `Lv${r.level} ${r.text}${r.extra ? '（追加）' : ''}`)
    .join('／')}`;

/** 表示中のプレイヤーの、建物数で決まる値の添字（0〜上限）。 */
export const ownedCount = (player: PlayerState | null, b: Building): number => (player === null ? 0 : buildingCount(player, b));
