// 文明カード・特別な市民カード・キャラクターの効果スクリプト（docs/effect-commands.md）。
// 原本の文言（text）を命令セットに書き直したものである。import-design.ts が src/data/ の JSON に埋め込む。
// 得点の評価軸：特別な市民カードは生活・福祉（17-4-3）、特別市民08 は自然・環境（17-5-2）、
// 英雄は軍事・防衛（17-6-2-2）、その他のキャラクターは「その他」（17-0-2）とする（ユーザー決定 2026-11-03）。

type Json = Record<string, unknown>;

const gain = (res: string, amount: unknown, axis?: string): Json => ({ op: 'gain', res, amount, ...(axis ? { axis } : {}) });
const per = (count: string, perN: number, times: number): Json => ({ count, per: perN, times });
const when = (left: string, op: '>=' | '<', right: number | string, then: Json[]): Json => ({
  op: 'if',
  cond: { left, op, right },
  then,
});
const raise = (track: 'military' | 'infra', amount: number): Json => ({ op: 'raise', track, amount });
const tiles = (count: number, tile: string): Json => ({ op: 'placeTiles', count, tile });
const build = (max: number, upTo: boolean, opts: Partial<Json> = {}): Json => ({
  op: 'build',
  max,
  upTo,
  buildings: null,
  terrain: null,
  payGold: true,
  payMaterials: true,
  ...opts,
});
const onPlay = (...commands: Json[]): Json[] => [{ ability: 'onPlay', do: commands }];

/** 「Xが a 以上なら 3資材、b 以上なら もう2資材」の型（027〜033）。 */
const tiered = (metric: string, a: number, b: number, res: 'materials' | 'drawCivCards', first: number, second: number): Json[] =>
  onPlay(when(metric, '>=', a, [gain(res, first)]), when(metric, '>=', b, [gain(res, second)]));

export const CIV_SCRIPTS: Record<string, Json[]> = {
  '001': onPlay(build(1, false, { payGold: false, payMaterials: false })),
  '002': onPlay(tiles(2, 'match')),
  // 金だけを免除し、資材は払う（指示書 2-1 の仮置き）。
  '003': onPlay(build(3, true, { payGold: false })),
  '004': onPlay(gain('materials', 5)),
  '005': onPlay(gain('goldProduction', 5)),
  '006': onPlay(tiles(1, 'mountain')),
  '007': onPlay(tiles(1, 'water')),
  '008': onPlay(tiles(1, 'forest')),
  '009': onPlay(tiles(1, 'plains')),
  '010': onPlay(raise('military', 1)),
  '011': onPlay(raise('infra', 1)),
  '012': onPlay(gain('specialCitizen', 1)),
  '013': onPlay(gain('tempWorkers', 2)),
  '014': onPlay(gain('militaryTokens', 5)),
  '015': onPlay(gain('materialProduction', 2)),
  '016': onPlay(gain('drawCivCards', 2)),
  '017': onPlay(gain('militaryTokens', 2), { op: 'expeditionRewards', count: 4 }),
  '018': [
    {
      ability: 'on',
      event: 'cardPlayed',
      filter: { tag: 'academic', excludeSelf: true },
      do: [gain('drawCivCards', 1)],
    },
  ],
  '019': onPlay(gain('gold', per('regularWorkers', 1, 1))),
  '020': onPlay(gain('gold', per('freeLandTiles', 1, 1))),
  '021': onPlay(gain('gold', per('infraLevel', 1, 1))),
  '022': onPlay(gain('gold', per('militaryTokens', 1, 1))),
  '023': onPlay(gain('gold', per('materialProduction', 1, 1))),
  '024': onPlay(gain('gold', per('buildings', 1, 1))),
  '025': onPlay(gain('gold', per('goldProduction', 4, 1))),
  '026': onPlay(gain('gold', per('repelShortfall', 1, 1))),
  '027': tiered('militaryLevel', 3, 6, 'materials', 3, 2),
  '028': tiered('infraLevel', 3, 6, 'materials', 3, 2),
  '029': tiered('goldProduction', 25, 30, 'materials', 3, 2),
  '030': tiered('landTiles', 7, 14, 'materials', 3, 2),
  '031': tiered('buildings', 5, 8, 'materials', 3, 2),
  '032': onPlay(when('houses', '>=', 4, [gain('materials', 3)]), when('regularWorkers', '>=', 8, [gain('materials', 2)])),
  '033': tiered('materialProduction', 5, 8, 'materials', 3, 2),
  '034': onPlay(
    when('militaryLevel', '<', 'repelLine', [gain('materials', 3)]),
    when('militaryLevel', '<', 'defenseLine', [gain('materials', 2)]),
  ),
  '035': tiered('militaryLevel', 3, 6, 'drawCivCards', 1, 1),
  '036': tiered('infraLevel', 3, 6, 'drawCivCards', 1, 1),
  '037': tiered('goldProduction', 25, 30, 'drawCivCards', 1, 1),
  '038': tiered('landTiles', 7, 14, 'drawCivCards', 1, 1),
  '039': tiered('buildings', 5, 8, 'drawCivCards', 1, 1),
  '040': onPlay(when('houses', '>=', 4, [gain('drawCivCards', 1)]), when('regularWorkers', '>=', 8, [gain('drawCivCards', 1)])),
  '041': tiered('materialProduction', 5, 8, 'drawCivCards', 1, 1),
  '042': onPlay(
    when('militaryLevel', '<', 'repelLine', [gain('drawCivCards', 1)]),
    when('militaryLevel', '<', 'defenseLine', [gain('drawCivCards', 1)]),
  ),
};

const W = 'welfare';

export const SPECIAL_CITIZEN_SCRIPTS: Record<string, Json[]> = {
  '01': [{ ability: 'on', event: 'tilePlaced', filter: { terrain: 'forest' }, do: [gain('points', 2, W)] }],
  '02': [{ ability: 'on', event: 'actionExecuted', filter: { tier: 'top' }, do: [gain('points', 2, W)] }],
  '03': [{ ability: 'on', event: 'cardPlayed', filter: {}, do: [gain('points', 1, W)] }],
  '04': [{ ability: 'modifier', modifier: { kind: 'goldPointsMultiplier', value: 2 } }],
  '05': [{ ability: 'gameEnd', do: [gain('points', per('maxedBuildingTypes', 1, 4), W)] }],
  '06': [{ ability: 'gameEnd', do: [gain('points', per('buildingsOnTerrain:water', 1, 2), W)] }],
  '07': [{ ability: 'gameEnd', do: [gain('points', per('buildingsOnTerrain:mountain', 1, 2), W)] }],
  '08': [{ ability: 'modifier', modifier: { kind: 'natureParkPoints', table: { '2': 10, '3': 15, '4': 20 } } }],
  '09': [{ ability: 'actionSpace', workers: 1, do: [build(1, false, { payGold: false, payMaterials: false })] }],
  '10': [{ ability: 'actionSpace', workers: 1, do: [{ op: 'playCard', count: 1, free: true }] }],
  '11': [{ ability: 'actionSpace', workers: 3, do: [{ op: 'copyAction' }] }],
  '12': [{ ability: 'modifier', modifier: { kind: 'buildCost', building: 'house', materials: -1 } }],
  '13': [
    { ability: 'onAcquire', do: [build(2, true, { buildings: ['house'], payGold: false, payMaterials: false })] },
    { ability: 'modifier', modifier: { kind: 'regularWorkersImmediate' } },
  ],
  '14': [
    { ability: 'onAcquire', do: [tiles(2, 'any')] },
    { ability: 'actionSpace', workers: 1, do: [tiles(1, 'any')] },
  ],
  '15': [{ ability: 'freeAction', pay: null, require: null, oncePerRound: true, do: [gain('drawCivCards', 2)] }],
  '16': [{ ability: 'freeAction', pay: null, require: null, oncePerRound: true, do: [gain('gold', per('regularWorkers', 1, 1))] }],
  '17': [{ ability: 'freeAction', pay: null, require: null, oncePerRound: true, do: [gain('tempWorkers', 1)] }],
  '18': [{ ability: 'freeAction', pay: null, require: null, oncePerRound: true, do: [gain('materials', per('tempWorkers', 1, 1))] }],
  '19': [{ ability: 'onAcquire', do: [raise('military', 3), gain('militaryTokens', 4)] }],
  '20': [{ ability: 'onAcquire', do: [gain('goldProduction', 4), gain('materialProduction', 2)] }],
};

export const CHARACTER_SCRIPTS: Record<string, Json[]> = {
  hero: [
    { ability: 'setup', do: [raise('military', 1), { op: 'heroStart' }] },
    { ability: 'on', event: 'raid', filter: { result: 'repelled' }, do: [gain('points', 2, 'military')] },
  ],
  commander: [
    { ability: 'modifier', modifier: { kind: 'buildCost', building: 'fort', materials: -1 } },
    { ability: 'on', event: 'built', filter: { building: 'fort' }, do: [raise('military', 1)] },
    {
      ability: 'modifier',
      modifier: {
        kind: 'expeditionRewards',
        add: [
          { level: 6, command: gain('drawCivCards', 1) },
          { level: 9, command: gain('tempWorkers', 1) },
        ],
      },
    },
  ],
  merchant: [
    { ability: 'setup', do: [gain('goldProduction', 5)] },
    { ability: 'freeAction', pay: { res: 'gold', amount: 10 }, require: null, oncePerRound: true, do: [gain('tempWorkers', 1)] },
    { ability: 'freeAction', pay: { res: 'gold', amount: 5 }, require: null, oncePerRound: true, do: [gain('materials', 2)] },
  ],
  capitalist: [
    { ability: 'setup', do: [gain('materialProduction', 1)] },
    { ability: 'on', event: 'tilePlaced', filter: { terrain: 'mountain' }, do: [gain('materials', 2)] },
    { ability: 'gameEnd', do: [gain('materials', per('buildings', 1, 1))] },
  ],
  scholar: [
    { ability: 'setup', do: [gain('drawCivCards', 2)] },
    {
      ability: 'on',
      event: 'cardPlayed',
      filter: {},
      every: 3,
      do: [{ op: 'chooseOne', options: [[raise('infra', 1)], [tiles(1, 'match')], [gain('tempWorkers', 1)]] }],
    },
  ],
  artist: [
    { ability: 'firstTurnStart', do: [{ op: 'playCard', count: 1, free: true }] },
    { ability: 'on', event: 'cardPlayed', filter: {}, do: [gain('gold', 2), gain('points', 1, 'other')] },
  ],
  saint: [
    { ability: 'firstTurnStart', do: [gain('specialCitizen', 1)] },
    { ability: 'on', event: 'workerGained', filter: { kind: 'regular' }, do: [gain('materials', 1)] },
    {
      ability: 'on',
      event: 'workerGained',
      filter: { kind: 'regular', cond: { left: 'regularWorkers', op: '>=', right: 10 } },
      once: true,
      do: [gain('specialCitizen', 1)],
    },
  ],
  bureaucrat: [
    { ability: 'setup', do: [raise('infra', 1)] },
    { ability: 'modifier', modifier: { kind: 'buildCost', building: 'office', materials: -1 } },
    { ability: 'on', event: 'built', filter: { building: 'office' }, do: [raise('infra', 1)] },
    {
      ability: 'freeAction',
      pay: null,
      require: { left: 'infraLevel', op: '>=', right: 3 },
      oncePerRound: true,
      do: [gain('gold', 3)],
    },
    {
      ability: 'freeAction',
      pay: null,
      require: { left: 'infraLevel', op: '>=', right: 6 },
      oncePerRound: true,
      do: [gain('materials', 1)],
    },
    {
      ability: 'freeAction',
      pay: null,
      require: { left: 'infraLevel', op: '>=', right: 9 },
      oncePerRound: true,
      do: [gain('tempWorkers', 1)],
    },
  ],
  spirit_caller: [
    { ability: 'freeAction', pay: null, require: null, oncePerRound: false, do: [{ op: 'spiritPlace' }] },
    { ability: 'modifier', modifier: { kind: 'noBuildOnSpiritLand' } },
    { ability: 'gameEnd', do: [gain('points', per('spiritAdjacency', 1, 1), 'other')] },
  ],
  designer: [
    { ability: 'setup', do: [tiles(2, 'match')] },
    { ability: 'modifier', modifier: { kind: 'pioneerMismatchExtra', value: 0 } },
    { ability: 'firstTurnStart', do: [{ op: 'drawPlannedCity', count: 2 }] },
  ],
};
