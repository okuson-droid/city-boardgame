// 効果スクリプトの型と型検査（docs/effect-commands.md、指示書 3-3）。
// 効果は「能力（いつ発動するか）」と「命令（何をするか）」の2層で書く。

import type { Building, ScoreAxis, Terrain } from './types.ts';
import { BUILDINGS, SCORE_AXES, TERRAINS } from './types.ts';

// ---------------------------------------------------------------------------
// 指標と条件
// ---------------------------------------------------------------------------

export const SIMPLE_METRICS = [
  'regularWorkers',
  'tempWorkers',
  'landTiles',
  'freeLandTiles',
  'buildings',
  'maxedBuildingTypes',
  'houses',
  'militaryLevel',
  'infraLevel',
  'militaryTokens',
  'goldProduction',
  'materialProduction',
  'repelLine',
  'defenseLine',
  'repelShortfall',
  'playedCivCards',
  'spiritAdjacency',
] as const;
export type SimpleMetric = (typeof SIMPLE_METRICS)[number];

/** 指標。建物の種類・地形を伴う指標は「名前:引数」で書く。 */
export type Metric = SimpleMetric | `buildingsOfType:${Building}` | `buildingsOnTerrain:${Terrain}`;

export type Amount = number | { readonly count: Metric; readonly per: number; readonly times: number };

export type Condition = {
  readonly left: Metric;
  readonly op: '>=' | '<';
  readonly right: number | Metric;
};

// ---------------------------------------------------------------------------
// 命令
// ---------------------------------------------------------------------------

export const GAIN_RESOURCES = [
  'gold',
  'materials',
  'militaryTokens',
  'tempWorkers',
  'regularWorkers',
  'goldProduction',
  'materialProduction',
  'drawCivCards',
  'specialCitizen',
  'points',
] as const;
export type GainResource = (typeof GAIN_RESOURCES)[number];

export type Command =
  | { readonly op: 'gain'; readonly res: GainResource; readonly amount: Amount; readonly axis?: ScoreAxis }
  | { readonly op: 'raise'; readonly track: 'military' | 'infra'; readonly amount: number }
  | { readonly op: 'placeTiles'; readonly count: number; readonly tile: 'match' | 'any' | Terrain }
  | {
      readonly op: 'build';
      readonly max: number;
      /** true なら 0軒も選べる（「〜軒まで」）。false なら建てられる限り max 軒を建てる。 */
      readonly upTo: boolean;
      readonly buildings: readonly Building[] | null;
      readonly terrain: Terrain | null;
      readonly payGold: boolean;
      readonly payMaterials: boolean;
    }
  | { readonly op: 'playCard'; readonly count: number; readonly free: boolean }
  | { readonly op: 'expeditionRewards'; readonly count: number }
  | { readonly op: 'chooseOne'; readonly options: readonly (readonly Command[])[] }
  | { readonly op: 'if'; readonly cond: Condition; readonly then: readonly Command[] }
  | { readonly op: 'copyAction' }
  | { readonly op: 'drawPlannedCity'; readonly count: number }
  | { readonly op: 'spiritPlace' }
  | { readonly op: 'heroStart' };

export const COMMAND_OPS = [
  'gain',
  'raise',
  'placeTiles',
  'build',
  'playCard',
  'expeditionRewards',
  'chooseOne',
  'if',
  'copyAction',
  'drawPlannedCity',
  'spiritPlace',
  'heroStart',
] as const;
export type CommandOp = (typeof COMMAND_OPS)[number];

// ---------------------------------------------------------------------------
// 能力
// ---------------------------------------------------------------------------

export const EVENT_NAMES = ['tilePlaced', 'cardPlayed', 'actionExecuted', 'built', 'workerGained', 'raid'] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export type EventFilter = {
  readonly terrain?: Terrain;
  readonly tag?: string;
  readonly excludeSelf?: boolean;
  readonly tier?: 'normal' | 'upper' | 'top';
  readonly building?: Building;
  readonly kind?: 'regular' | 'temp';
  readonly result?: 'defenseFailed' | 'defended' | 'repelled';
  /** 出来事の後にこの条件を満たすときだけ発動する（聖女の「10人になった時」）。 */
  readonly cond?: Condition;
};

export type Modifier =
  | { readonly kind: 'buildCost'; readonly building: Building; readonly materials: number }
  | { readonly kind: 'pioneerMismatchExtra'; readonly value: number }
  | { readonly kind: 'regularWorkersImmediate' }
  | { readonly kind: 'goldPointsMultiplier'; readonly value: number }
  | { readonly kind: 'natureParkPoints'; readonly table: Readonly<Record<string, number>> }
  | {
      readonly kind: 'expeditionRewards';
      readonly add: readonly { readonly level: number; readonly command: Command }[];
    }
  | { readonly kind: 'noBuildOnSpiritLand' };

export const MODIFIER_KINDS = [
  'buildCost',
  'pioneerMismatchExtra',
  'regularWorkersImmediate',
  'goldPointsMultiplier',
  'natureParkPoints',
  'expeditionRewards',
  'noBuildOnSpiritLand',
] as const;

export type Ability =
  | { readonly ability: 'onPlay' | 'onAcquire' | 'setup' | 'firstTurnStart' | 'gameEnd'; readonly do: readonly Command[] }
  | {
      readonly ability: 'on';
      readonly event: EventName;
      readonly filter: EventFilter;
      readonly do: readonly Command[];
      /** N回に1回発動する（学者の「3枚プレイするごとに」）。 */
      readonly every?: number;
      /** ゲーム中1回だけ発動する。 */
      readonly once?: boolean;
    }
  | {
      readonly ability: 'freeAction';
      readonly pay: { readonly res: 'gold' | 'materials'; readonly amount: number } | null;
      readonly require: Condition | null;
      readonly oncePerRound: boolean;
      readonly do: readonly Command[];
    }
  | { readonly ability: 'actionSpace'; readonly workers: number; readonly do: readonly Command[] }
  | { readonly ability: 'modifier'; readonly modifier: Modifier };

export type Script = readonly Ability[];

export const ABILITY_NAMES = [
  'onPlay',
  'onAcquire',
  'setup',
  'firstTurnStart',
  'gameEnd',
  'on',
  'freeAction',
  'actionSpace',
  'modifier',
] as const;

// ---------------------------------------------------------------------------
// 型検査
// ---------------------------------------------------------------------------

export class ScriptError extends Error {
  constructor(path: string, message: string) {
    super(`${path}：${message}`);
    this.name = 'ScriptError';
  }
}

type Obj = Readonly<Record<string, unknown>>;

const fail = (path: string, message: string): never => {
  throw new ScriptError(path, message);
};

const obj = (v: unknown, path: string): Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : fail(path, 'オブジェクトでなければならない');

const arr = (v: unknown, path: string): readonly unknown[] => (Array.isArray(v) ? v : fail(path, '配列でなければならない'));

const int = (v: unknown, path: string, allowNegative = false): number =>
  typeof v === 'number' && Number.isInteger(v) && (allowNegative || v >= 0)
    ? v
    : fail(path, `${allowNegative ? '' : '0以上の'}整数でなければならない（実際は ${String(v)}）`);

const bool = (v: unknown, path: string): boolean => (typeof v === 'boolean' ? v : fail(path, '真偽値でなければならない'));

const oneOf = <T extends string>(values: readonly T[], v: unknown, path: string): T =>
  values.find((x) => x === v) ?? fail(path, `${values.join('・')} のいずれかでなければならない（実際は ${String(v)}）`);

const optional = <T>(o: Obj, key: string, read: (v: unknown, p: string) => T, path: string): { [k: string]: T } =>
  key in o && o[key] !== undefined ? { [key]: read(o[key], `${path}.${key}`) } : {};

export const readMetric = (v: unknown, path: string): Metric => {
  if (typeof v !== 'string') {
    return fail(path, '指標は文字列でなければならない');
  }
  const [name, arg] = v.split(':');
  if (name === 'buildingsOfType') {
    oneOf(BUILDINGS, arg, path);
    return v as Metric;
  }
  if (name === 'buildingsOnTerrain') {
    oneOf(TERRAINS, arg, path);
    return v as Metric;
  }
  return oneOf(SIMPLE_METRICS, v, path);
};

const readAmount = (v: unknown, path: string): Amount => {
  if (typeof v === 'number') {
    return int(v, path, true);
  }
  const o = obj(v, path);
  return {
    count: readMetric(o['count'], `${path}.count`),
    per: int(o['per'], `${path}.per`) || fail(`${path}.per`, '1以上でなければならない'),
    times: int(o['times'], `${path}.times`, true),
  };
};

export const readCondition = (v: unknown, path: string): Condition => {
  const o = obj(v, path);
  const right = o['right'];
  return {
    left: readMetric(o['left'], `${path}.left`),
    op: oneOf(['>=', '<'] as const, o['op'], `${path}.op`),
    right: typeof right === 'number' ? int(right, `${path}.right`, true) : readMetric(right, `${path}.right`),
  };
};

const readCommands = (v: unknown, path: string): Command[] => arr(v, path).map((c, i) => readCommand(c, `${path}[${i}]`));

const readNullableList = <T extends string>(values: readonly T[], v: unknown, path: string): T[] | null =>
  v === null ? null : arr(v, path).map((x, i) => oneOf(values, x, `${path}[${i}]`));

export const readCommand = (v: unknown, path: string): Command => {
  const o = obj(v, path);
  const op = oneOf(COMMAND_OPS, o['op'], `${path}.op`);
  const p = (key: string): string => `${path}.${key}`;
  switch (op) {
    case 'gain':
      return {
        op,
        res: oneOf(GAIN_RESOURCES, o['res'], p('res')),
        amount: readAmount(o['amount'], p('amount')),
        ...optional(o, 'axis', (x, q) => oneOf(SCORE_AXES, x, q), path),
      };
    case 'raise':
      return {
        op,
        track: oneOf(['military', 'infra'] as const, o['track'], p('track')),
        amount: int(o['amount'], p('amount')),
      };
    case 'placeTiles': {
      const tile = o['tile'];
      return {
        op,
        count: int(o['count'], p('count')),
        tile: tile === 'match' || tile === 'any' ? tile : oneOf(TERRAINS, tile, p('tile')),
      };
    }
    case 'build':
      return {
        op,
        max: int(o['max'], p('max')),
        upTo: bool(o['upTo'], p('upTo')),
        buildings: readNullableList(BUILDINGS, o['buildings'], p('buildings')),
        terrain: o['terrain'] === null ? null : oneOf(TERRAINS, o['terrain'], p('terrain')),
        payGold: bool(o['payGold'], p('payGold')),
        payMaterials: bool(o['payMaterials'], p('payMaterials')),
      };
    case 'playCard':
      return { op, count: int(o['count'], p('count')), free: bool(o['free'], p('free')) };
    case 'expeditionRewards':
      return { op, count: int(o['count'], p('count')) };
    case 'chooseOne':
      return { op, options: arr(o['options'], p('options')).map((x, i) => readCommands(x, `${p('options')}[${i}]`)) };
    case 'if':
      return { op, cond: readCondition(o['cond'], p('cond')), then: readCommands(o['then'], p('then')) };
    case 'drawPlannedCity':
      return { op, count: int(o['count'], p('count')) };
    case 'copyAction':
    case 'spiritPlace':
    case 'heroStart':
      return { op };
  }
};

const readFilter = (v: unknown, path: string): EventFilter => {
  const o = obj(v, path);
  return {
    ...optional(o, 'terrain', (x, q) => oneOf(TERRAINS, x, q), path),
    ...optional(o, 'tag', (x, q) => (typeof x === 'string' ? x : fail(q, '文字列でなければならない')), path),
    ...optional(o, 'excludeSelf', bool, path),
    ...optional(o, 'tier', (x, q) => oneOf(['normal', 'upper', 'top'] as const, x, q), path),
    ...optional(o, 'building', (x, q) => oneOf(BUILDINGS, x, q), path),
    ...optional(o, 'kind', (x, q) => oneOf(['regular', 'temp'] as const, x, q), path),
    ...optional(o, 'result', (x, q) => oneOf(['defenseFailed', 'defended', 'repelled'] as const, x, q), path),
    ...optional(o, 'cond', readCondition, path),
  };
};

const readModifier = (v: unknown, path: string): Modifier => {
  const o = obj(v, path);
  const kind = oneOf(MODIFIER_KINDS, o['kind'], `${path}.kind`);
  switch (kind) {
    case 'buildCost':
      return {
        kind,
        building: oneOf(BUILDINGS, o['building'], `${path}.building`),
        materials: int(o['materials'], `${path}.materials`, true),
      };
    case 'pioneerMismatchExtra':
    case 'goldPointsMultiplier':
      return { kind, value: int(o['value'], `${path}.value`) };
    case 'natureParkPoints': {
      const table = obj(o['table'], `${path}.table`);
      return {
        kind,
        table: Object.fromEntries(Object.entries(table).map(([k, x]) => [k, int(x, `${path}.table.${k}`)])),
      };
    }
    case 'expeditionRewards':
      return {
        kind,
        add: arr(o['add'], `${path}.add`).map((x, i) => {
          const a = obj(x, `${path}.add[${i}]`);
          return { level: int(a['level'], `${path}.add[${i}].level`), command: readCommand(a['command'], `${path}.add[${i}].command`) };
        }),
      };
    case 'regularWorkersImmediate':
    case 'noBuildOnSpiritLand':
      return { kind };
  }
};

export const readAbility = (v: unknown, path: string): Ability => {
  const o = obj(v, path);
  const ability = oneOf(ABILITY_NAMES, o['ability'], `${path}.ability`);
  const p = (key: string): string => `${path}.${key}`;
  switch (ability) {
    case 'onPlay':
    case 'onAcquire':
    case 'setup':
    case 'firstTurnStart':
    case 'gameEnd':
      return { ability, do: readCommands(o['do'], p('do')) };
    case 'on':
      return {
        ability,
        event: oneOf(EVENT_NAMES, o['event'], p('event')),
        filter: readFilter(o['filter'] ?? {}, p('filter')),
        do: readCommands(o['do'], p('do')),
        ...optional(o, 'every', (x, q) => int(x, q), path),
        ...optional(o, 'once', bool, path),
      };
    case 'freeAction': {
      const pay = o['pay'];
      return {
        ability,
        pay:
          pay === null || pay === undefined
            ? null
            : {
                res: oneOf(['gold', 'materials'] as const, obj(pay, p('pay'))['res'], `${p('pay')}.res`),
                amount: int(obj(pay, p('pay'))['amount'], `${p('pay')}.amount`),
              },
        require: o['require'] === null || o['require'] === undefined ? null : readCondition(o['require'], p('require')),
        oncePerRound: bool(o['oncePerRound'], p('oncePerRound')),
        do: readCommands(o['do'], p('do')),
      };
    }
    case 'actionSpace':
      return { ability, workers: int(o['workers'], p('workers')), do: readCommands(o['do'], p('do')) };
    case 'modifier':
      return { ability, modifier: readModifier(o['modifier'], p('modifier')) };
  }
};

export const readScript = (v: unknown, path: string): Script => arr(v, path).map((a, i) => readAbility(a, `${path}[${i}]`));
