// チューナーの画面に出す日本語の名前（ユーザー決定 2026-11-04：編集画面の文言は日本語にする）。
// データの項目名（JSON のキー）と、選択肢の値（地形・建物・アクションなど）を日本語にする。保存する値は英語の識別子のままである。
// 資源・建物・地形などの名前は、ゲームの画面と同じアイコンの対応表（icon_keys.json）から取る。

import { ICON_KEYS } from '../../src/data/index.ts';

type Table = Readonly<Record<string, string>>;

const labelsOf = (table: Readonly<Record<string, { readonly label: string }>>): Record<string, string> =>
  Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.label]));

export const ACTION_NAMES: Table = {
  pioneer: '開拓',
  build: '建築',
  import: '輸入',
  export: '輸出',
  drill: '教練',
  expedition: '遠征',
  welfare: '福祉',
  migration: '移住',
  research: '研究',
  spread: '普及',
};

const TIER_NAMES: Table = labelsOf(ICON_KEYS.tiers);
const TERRAIN_NAMES: Table = labelsOf(ICON_KEYS.terrains);
const BUILDING_NAMES: Table = labelsOf(ICON_KEYS.buildings);
const TAG_NAMES: Table = labelsOf(ICON_KEYS.tags);
const TRACK_NAMES: Table = labelsOf(ICON_KEYS.tracks);
const RESOURCE_NAMES: Table = labelsOf(ICON_KEYS.resources);

/** 評価軸（rules.md 1-1-1、17-0-2）。 */
const AXIS_NAMES: Table = {
  economy: '経済・産業',
  culture: '文化・学術',
  welfare: '生活・福祉',
  nature: '自然・環境',
  military: '軍事・防衛',
  other: 'その他',
};

const METRIC_NAMES: Table = {
  ...labelsOf(ICON_KEYS.metrics),
  buildingsOfType: '指定した建物の数',
  buildingsOnTerrain: '指定した地形に建てた建物',
  tagsOf: '指定した分類のタグ（プレイ済みの文明カード）',
  tags: '分類',
  totalBuildings: '建物の合計',
  civCardsPlayed: 'プレイ済みの文明カード',
};

/** 得るもの・支払うもの・ボーナスタイル・襲撃の効果・補正の種類。 */
const KIND_NAMES: Table = {
  gold: '金',
  materials: '資材',
  drawCivCards: '文明カードを引く',
  civCards: '文明カード',
  militaryTokens: '軍事力トークン',
  landTiles: '土地タイル',
  tempWorkers: '臨時ワーカー',
  regular: '通常ワーカー',
  temp: '臨時ワーカー',
  specialCitizen: '特別な市民カード',
  points: '得点',
  buildRight: '建設の権利',
  freeBuildOnTerrain: '地形を指定した無料建設',
  goldProduction: '金の生産力',
  materialProduction: '資材の生産力',
  militaryLevel: '軍事レベル',
  infraLevel: 'インフラレベル',
  discardCivCards: '文明カードを捨てる',
  loseGold: '金を失う',
  loseMaterials: '資材を失う',
  loseGoldProduction: '金の生産力を失う',
  ...labelsOf(ICON_KEYS.modifiers),
};

const ABILITY_LABELS: Table = {
  ...labelsOf(ICON_KEYS.abilities),
  on: '常時（〜する度に）',
  modifier: '常時（補正）',
};

const COMMAND_NAMES: Table = { ...labelsOf(ICON_KEYS.commands), if: '条件付き' };

const EVENT_LABELS: Table = {
  tilePlaced: '土地タイルを置いた時',
  cardPlayed: '文明カードをプレイした時',
  actionExecuted: 'アクションを実行した時',
  built: '建設した時',
  workerGained: 'ワーカーを獲得した時',
  raid: '襲撃の時',
};

const OTHER_VALUES: Table = {
  distinct: '異なる報酬を選ぶ',
  total: '合計の個数で選ぶ',
  houses: '住宅',
  buildingTypes: '建物の種類',
  playedCivCards: 'プレイ済みの文明カード',
  ...labelsOf(ICON_KEYS.results),
};

/** 項目名ごとに、選択肢の値の名前の表を選ぶ（同じ値でも項目によって意味が違うため。例：build はアクションの建築と命令の「建物を建てる」）。 */
const VALUE_TABLES: Readonly<Record<string, Table>> = {
  action: ACTION_NAMES,
  tier: TIER_NAMES,
  terrain: TERRAIN_NAMES,
  initialTerrain: TERRAIN_NAMES,
  tile: TERRAIN_NAMES,
  building: BUILDING_NAMES,
  buildings: BUILDING_NAMES,
  tags: TAG_NAMES,
  tag: TAG_NAMES,
  track: TRACK_NAMES,
  res: RESOURCE_NAMES,
  axis: AXIS_NAMES,
  metric: METRIC_NAMES,
  left: METRIC_NAMES,
  right: METRIC_NAMES,
  kind: KIND_NAMES,
  ability: ABILITY_LABELS,
  op: COMMAND_NAMES,
  event: EVENT_LABELS,
  mode: OTHER_VALUES,
  count: OTHER_VALUES,
  result: OTHER_VALUES,
  compare: { '>=': '以上（≥）', '<': 'より小さい（<）' },
};

const ANY_VALUE: Table = {
  ...OTHER_VALUES,
  ...KIND_NAMES,
  ...TAG_NAMES,
  ...BUILDING_NAMES,
  ...TERRAIN_NAMES,
  ...TIER_NAMES,
  ...ACTION_NAMES,
};

/**
 * 選択肢の値の日本語の名前。key は値を持つ項目名で、項目に応じた表を使う。表にない値はそのまま返す。
 * 「指標:引数」の形（buildingsOfType:shop など）は、指標と引数をそれぞれ日本語にする。
 */
export const valueLabel = (value: string, key = ''): string => {
  const table = VALUE_TABLES[key];
  const direct = table?.[value] ?? ANY_VALUE[value];
  if (direct !== undefined) return direct;
  const [metric, arg] = value.split(':');
  if (arg !== undefined && metric !== undefined) {
    const argName = BUILDING_NAMES[arg] ?? TERRAIN_NAMES[arg] ?? TAG_NAMES[arg] ?? arg;
    if (metric === 'buildingsOfType') return `${argName}の数`;
    if (metric === 'tagsOf') return `${argName}タグ`;
    if (metric === 'buildingsOnTerrain') return `${argName}に建てた建物`;
  }
  return value;
};

/** データの項目名（JSON のキー）の日本語の名前。 */
const KEY_LABELS: Table = {
  // 共通
  id: '識別子',
  name: '名前',
  text: '文言（原本）',
  notes: '注記',
  source: '出どころ',
  clarifications: '文言の解釈',
  changes: '原本からの変更',
  open_issues: '未決の事項',
  importedFrom: '取り込み元',
  schema: 'スキーマ',
  version: '版',
  updated: '更新日',
  provisional: '仮置き',
  provisionalFields: '仮置きの項目',
  rulesRef: 'rules.md の条項',
  rulesVersion: 'rules.md の版',
  generatedWithSeed: '生成に使ったシード',
  cards: 'カード',
  tiles: 'タイル',
  items: '項目',
  kind: '種類',
  kinds: '種類の数',
  amount: '数',
  value: '値',
  min: '最小',
  max: '最大',
  total: '合計',
  level: 'レベル',
  cost: 'コスト',
  effects: '効果',
  script: '効果',
  points: '得点',
  tags: 'タグ',
  terrain: '地形',
  building: '建物',
  action: 'アクション',
  tier: '段階',
  gold: '金',
  materials: '資材',
  per: 'につき',
  // パラメータ（params.json）
  rounds: 'ラウンド数',
  playerCount: 'プレイ人数',
  setupByPlayerCount: '人数ごとの準備',
  specialCitizensRevealed: '特別な市民カードの公開枚数',
  plannedCityRevealed: '計画都市カードの公開枚数',
  bonusTilesOnBoard: '場のボーナスタイルの枚数',
  plannedCityMaxDeclarers: '計画都市1枚に宣言できる人数',
  draftBoardCandidates: 'ドラフトの個人ボードの候補数',
  draftCharacterCandidates: 'ドラフトのキャラクターの候補数',
  board: '個人ボード',
  terrainCounts: '地形の枚数',
  initialCells: '最初に土地タイルを置くマス',
  initialTerrain: '最初に置く土地タイルの地形',
  initial: '初期資源',
  goldProduction: '金の生産力',
  materialProduction: '資材の生産力',
  regularWorkers: '通常ワーカー',
  tempWorkers: '臨時ワーカー',
  civCards: '文明カード',
  militaryLevel: '軍事レベル',
  infraLevel: 'インフラレベル',
  workers: 'ワーカー',
  regularBase: '通常ワーカーの基本の上限',
  housesPerExtraRegular: '上限を1人増やす住宅の数',
  regularMax: '通常ワーカーの上限の最大',
  tempMax: '臨時ワーカーの上限',
  land: '土地タイル',
  materialsPerTile: '1枚あたりの資材',
  mismatchExtraMaterials: '地形が異なるときの追加の資材',
  minTotalMaterials: '資材の合計の最小',
  buildings: '建物',
  limits: '建てられる軒数の上限',
  minCost: 'コストの最小',
  terrainBonus: '地形ボーナス',
  grant: '得るもの',
  grants: '得るもの',
  shop: '商店',
  workshop: '工房',
  fort: '砦',
  office: '役所',
  university: '大学',
  house: '住宅',
  camp: '飯場',
  goldProductionOnBuild: '建設時の金の生産力',
  goldProductionAfterImportByCount: '輸入後の金の生産力（商店の数ごと）',
  materialProductionOnBuild: '建設時の資材の生産力',
  goldAfterExportByCount: '輸出後の金（工房の数ごと）',
  militaryOnBuild: '建設時の軍事レベル',
  drillTokenCostByCount: '教練の上昇1回の軍事力トークン（砦の数ごと）',
  infraOnBuild: '建設時のインフラレベル',
  welfareConvertMaterialsByCount: '福祉の変換の資材（役所の数ごと）',
  welfareConvertMaxWorkers: '福祉の変換の最大人数',
  drawOnBuild: '建設時に引く文明カード',
  civCardGoldDiscountPerUniversity: '大学1軒あたりの文明カードの割引',
  landTilesOnBuild: '建設時の土地タイル',
  adjacentMaterialDiscount: '隣接する建設の資材の軽減',
  maxTotalDiscount: '軽減の合計の上限',
  actions: 'アクション',
  workerCost: '置くワーカーの数',
  shared: '共有スペース',
  unlockTop: '最上位の解放条件',
  metric: '指標',
  atLeast: '以上',
  normal: '通常',
  upper: '上位',
  top: '最上位',
  pioneer: '開拓',
  build: '建築',
  import: '輸入',
  export: '輸出',
  drill: '教練',
  expedition: '遠征',
  welfare: '福祉',
  migration: '移住',
  research: '研究',
  spread: '普及',
  maxTiles: '置く枚数の最大',
  materialDiscount: '資材の軽減',
  maxBuildings: '建てる軒数の最大',
  goldDiscount: '金の割引',
  payGold: '払う金',
  gainMaterials: '得る資材',
  maxTimes: '回数の最大',
  bonusMaterials: '追加で得る資材',
  payMaterials: '払う資材',
  gainGold: '得る金',
  bonusGold: '追加で得る金',
  gainTokens: '得る軍事力トークン',
  maxRaises: '上昇の回数の最大',
  rewards: '報酬',
  selection: '報酬の選び方',
  mode: '選び方',
  maxSame: '同じ報酬の最大',
  infra: 'インフラレベル',
  regularWorkersIsMax: '通常ワーカーは「最大N人」',
  draw: '引く枚数',
  discard: '捨てる枚数',
  maxCards: 'プレイする枚数の最大',
  cardsIsMax: '枚数は「最大N枚」',
  goldPerCard: '1枚プレイするごとの金',
  military: '軍事レベル',
  overflowPointsPerRaise: '上限を超えた上昇1回の得点',
  raid: '襲撃',
  firstRoundCard: '最初のラウンドの襲撃カード',
  basePointsPerRound: '襲撃ラウンド数1あたりの基本得点',
  defenseFailed: '防衛失敗',
  defended: '防衛成功',
  repelled: '撃退成功',
  freeActions: 'フリーアクション',
  conversions: '交換',
  pay: '支払うもの',
  gain: '得るもの',
  emptyDeckFallbackMaterials: '山札が尽きたときの資材',
  bonusTiles: 'ボーナスタイル',
  characters: 'キャラクター',
  spiritChipReturnRound: '精霊チップを回収するラウンド',
  scoring: '得点',
  base: '基本得点',
  landTilesPerPoint: '1点あたりの土地タイル',
  buildingsPerPoint: '1点あたりの建物',
  regularWorkersPerPoint: '1点あたりの通常ワーカー',
  goldPerPointByShops: '1点あたりの金（商店の数ごと）',
  materialsPerPointByWorkshops: '1点あたりの資材（工房の数ごと）',
  civCardsPerPointByUniversities: '1点あたりの文明カード（大学の数ごと）',
  regularWorkersDivisorByOffices: '通常ワーカーを割る数（役所の数ごと）',
  plannedCityPointsByRank: '計画都市の得点（先着順）',
  natureParkPointsBySetSize: '自然公園の得点（セットの枚数ごと）',
  water: '水場',
  mountain: '山岳',
  plains: '平原',
  forest: '森林',
  // 個人ボード
  squares: 'マス',
  bonus: 'マスボーナス',
  // 文明カード
  playCondition: 'プレイ条件',
  effectCondition: '効果適用条件',
  // 計画都市・自然公園
  shape: '形状',
  slots: 'マスの条件',
  q: '横の位置（q）',
  r: '行（r）',
  benefit: '達成時に得るもの',
  sets: 'セット',
  cells: 'マス',
  // 特別な市民カード・キャラクター
  timing: 'タイミング',
  worker_cost: 'ワーカーの数',
  label: '分類',
  axis: '評価軸',
  initial_bonus: '初期ボーナス',
  // 襲撃カード
  defense_increase: '防衛ラインの上昇',
  repel_increase: '撃退ラインの上昇',
  on_defense_fail: '防衛失敗時（原本）',
  on_repel: '撃退成功時（原本）',
  replacesBasePoints: '得点は基本得点を含めた合算値',
  defenseFailEffects: '防衛失敗時の効果',
  repelEffects: '撃退成功時の効果',
  perRound: '襲撃ラウンド数を掛ける',
  afterNextIncome: '次の収入の後に適用する',
  // ボーナスタイル
  roundStart: 'ラウンド開始時の効果',
  passScore: 'パス時の得点',
  count: '数える対象',
  // 効果スクリプト
  ability: '能力',
  do: '処理',
  op: '命令',
  res: '資源',
  track: 'トラック',
  tile: '土地タイル',
  upTo: '「まで」',
  distinct: '異なる種類だけ',
  onTerrain: '置けるマスの地形',
  exceptBuilding: '除く建物',
  anyPlayer: 'どのプレイヤーの出来事にも反応する',
  builtDuring: 'アクション中に建てた建物',
  free: '無料',
  options: '選択肢',
  cond: '条件',
  left: '左辺',
  right: '右辺',
  then: 'ならば',
  event: 'きっかけ',
  filter: '絞り込み',
  every: 'N回ごと',
  once: 'ゲーム中1回',
  oncePerRound: '1ラウンドに1回',
  require: '条件',
  modifier: '補正',
  table: '表',
  add: '追加',
  command: '命令',
  excludeSelf: 'このカード自身を除く',
  tag: 'タグ',
  times: '倍数',
  result: '結果',
};

/** データの項目名の日本語の名前。表にない項目名はそのまま返す（数字の添字や人数など）。 */
export const keyLabel = (key: string | number): string => (typeof key === 'number' ? String(key) : (KEY_LABELS[key] ?? key));
