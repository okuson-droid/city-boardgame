// 早見表と吹き出しのための説明（ユーザー決定 2026-11-07：プレイ中に建物の効果や遠征の報酬をルール解説を開かずに確かめられるようにする）。
// 文章と数値はすべて params.json から組み立てる。チューナーで値を変えても表示が食い違わない。
// 画面は queries.ts の再輸出を通して使う。

import { GAME_DATA } from '../data/index.ts';
import { actionLabel, buildingLabel, grantText, labelIn } from './labels.ts';
import { ACTIONS, BUILDINGS, type Building, type GameData, type ScoreRate, type UnlockCondition } from '../data/types.ts';
import type { Command } from '../data/script.ts';
import { expeditionTable } from './actions.ts';
import { buildingCount, fortMilitaryOnBuild } from './core.ts';
import type { PlayerState } from './types.ts';

export { actionLabel, buildingLabel, grantText } from './labels.ts';

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

/** 換算率1つの文（例：「3につき2点」）。 */
export const rateText = (r: ScoreRate, unit = ''): string => (r.points === 0 ? '点なし' : `${r.per}${unit}につき${r.points}点`);

/** 建物数ごとの換算率の文（例：「0軒 20につき1点・1軒 5につき1点…（端数は切り捨て）」）。 */
const rateLine = (table: readonly ScoreRate[], unit = ''): string =>
  `${table.map((r, i) => `${i}軒 ${rateText(r, unit)}`).join('・')}（端数は切り捨て）`;

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
      endScore = `経済・産業：金の収入 ${rateLine(s.goldPerPointByShops)}`;
      break;
    case 'workshop':
      onBuild.push(`資材の生産力＋${e.workshop.materialProductionOnBuild}`);
      always.push(`輸出の後、金${byCount(e.workshop.goldAfterExportByCount, String)}を得る（工房1〜${p.buildings.limits.workshop}軒）`);
      endScore = `経済・産業：資材の収入 ${rateLine(s.materialsPerPointByWorkshops)}`;
      break;
    case 'fort':
      onBuild.push(
        new Set(e.fort.militaryOnBuildByNth).size <= 1
          ? `軍事レベル＋${e.fort.militaryOnBuildByNth[0] ?? 0}`
          : `軍事レベル＋${Array.from({ length: p.buildings.limits.fort }, (_, i) => fortMilitaryOnBuild(d, i + 1)).join('/')}（1〜${p.buildings.limits.fort}軒目）`,
      );
      if (e.fort.drillTokenCost === null) {
        always.push(`教練の上昇1回に払う軍事力トークン ${byCount(e.fort.drillTokenCostByCount, String)}（砦1〜${p.buildings.limits.fort}軒。0軒は${e.fort.drillTokenCostByCount[0]}）`);
      }
      break;
    case 'office':
      onBuild.push(`インフラレベル＋${e.office.infraOnBuild}`);
      always.push(
        `福祉の後、臨時ワーカー${e.office.welfareConvertMaxWorkers}人を資材${byCount(e.office.welfareConvertMaterialsByCount, String)}に換えられる（役所1〜${p.buildings.limits.office}軒）`,
      );
      endScore = `生活・福祉：通常ワーカー ${rateLine(s.regularWorkerPointsByOffices, '人')}`;
      break;
    case 'university':
      onBuild.push(`文明カードを${e.university.drawOnBuild}枚引く`);
      always.push(`1軒につき文明カードのコスト−${e.university.civCardGoldDiscountPerUniversity}金（最低0金）`);
      endScore = `文化・学術：プレイ済みの文明カード ${rateLine(s.civCardsPerPointByUniversities, '枚')}`;
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
