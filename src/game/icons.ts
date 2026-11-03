// 効果スクリプトから「アイコンと数字の並び」と補足表示の文章を組み立てる（ui_design.md 0-1、指示書 3-3）。
// カードごとに表示用の文章を手で書かず、命令と要素の対応表（icon_keys.json）から作る。

import { ICON_KEYS, type IconEntry, type IconKeys, type IconSection } from '../data/icon-keys.ts';
import type { Ability, Amount, Command, Condition, EventFilter, Metric, Modifier, Script } from '../data/script.ts';

/** アイコン1つ分。value は数字（なければ数字なし）。 */
export type IconToken = { readonly icon: string; readonly value?: number | string; readonly label: string };

const entry = (keys: IconKeys, section: IconSection, key: string): IconEntry => {
  const found = keys[section][key];
  if (found === undefined) {
    throw new Error(`アイコンの対応表に ${section}.${key} がない`);
  }
  return found;
};

const token = (keys: IconKeys, section: IconSection, key: string, value?: number | string): IconToken => {
  const e = entry(keys, section, key);
  return value === undefined ? { icon: e.icon, label: e.label } : { icon: e.icon, value, label: e.label };
};

const metricEntry = (keys: IconKeys, metric: Metric): IconEntry => {
  const [name = '', arg] = metric.split(':');
  const base = entry(keys, 'metrics', name);
  if (arg === undefined) return base;
  const section: IconSection = name === 'buildingsOfType' ? 'buildings' : 'terrains';
  const target = entry(keys, section, arg);
  return { icon: `${base.icon}:${target.icon}`, label: `${target.label}${base.label}` };
};

const metricToken = (keys: IconKeys, metric: Metric, value?: number): IconToken => {
  const e = metricEntry(keys, metric);
  return value === undefined ? { icon: e.icon, label: e.label } : { icon: e.icon, value, label: e.label };
};

// ---------------------------------------------------------------------------
// アイコンの並び
// ---------------------------------------------------------------------------

const amountTokens = (keys: IconKeys, amount: Amount, target: IconToken): IconToken[] =>
  typeof amount === 'number'
    ? [{ ...target, value: amount }]
    : [metricToken(keys, amount.count, amount.per), token(keys, 'symbols', 'per'), { ...target, value: amount.times }];

const conditionTokens = (keys: IconKeys, cond: Condition): IconToken[] => [
  metricToken(keys, cond.left),
  token(keys, 'symbols', cond.op === '>=' ? 'ge' : 'lt'),
  typeof cond.right === 'number' ? { icon: 'num', value: cond.right, label: String(cond.right) } : metricToken(keys, cond.right),
];

const commandTokens = (keys: IconKeys, command: Command): IconToken[] => {
  switch (command.op) {
    case 'gain':
      return amountTokens(keys, command.amount, token(keys, 'resources', command.res));
    case 'raise':
      return [token(keys, 'tracks', command.track, `+${command.amount}`)];
    case 'placeTiles':
      return [token(keys, 'commands', 'placeTiles', command.count), token(keys, 'terrains', command.tile)];
    case 'build':
      return [
        token(keys, 'commands', 'build', command.max),
        ...(command.upTo ? [token(keys, 'symbols', 'upTo')] : []),
        ...(command.buildings ?? []).map((b) => token(keys, 'buildings', b)),
        ...(command.terrain !== null ? [token(keys, 'terrains', command.terrain)] : []),
        ...(!command.payGold && !command.payMaterials
          ? [token(keys, 'symbols', 'free')]
          : !command.payGold
            ? [token(keys, 'symbols', 'noGold')]
            : []),
      ];
    case 'playCard':
      return [token(keys, 'commands', 'playCard', command.count), ...(command.free ? [token(keys, 'symbols', 'free')] : [])];
    case 'expeditionRewards':
      return [token(keys, 'commands', 'expeditionRewards', command.count)];
    case 'chooseOne':
      return command.options.flatMap((option, i) => [
        ...(i > 0 ? [token(keys, 'symbols', 'or')] : []),
        ...option.flatMap((c) => commandTokens(keys, c)),
      ]);
    case 'if':
      return [
        ...conditionTokens(keys, command.cond),
        token(keys, 'symbols', 'then'),
        ...command.then.flatMap((c) => commandTokens(keys, c)),
      ];
    default:
      return [token(keys, 'commands', command.op)];
  }
};

const filterTokens = (keys: IconKeys, filter: EventFilter): IconToken[] => [
  ...(filter.terrain !== undefined ? [token(keys, 'terrains', filter.terrain)] : []),
  ...(filter.tag !== undefined ? [token(keys, 'tags', filter.tag)] : []),
  ...(filter.building !== undefined ? [token(keys, 'buildings', filter.building)] : []),
  ...(filter.tier !== undefined ? [token(keys, 'tiers', filter.tier)] : []),
  ...(filter.kind !== undefined ? [token(keys, 'resources', filter.kind === 'regular' ? 'regularWorkers' : 'tempWorkers')] : []),
  ...(filter.result !== undefined ? [token(keys, 'results', filter.result)] : []),
  ...(filter.cond !== undefined ? conditionTokens(keys, filter.cond) : []),
  ...(filter.excludeSelf === true ? [token(keys, 'symbols', 'excludeSelf')] : []),
];

const modifierTokens = (keys: IconKeys, modifier: Modifier): IconToken[] => {
  const head = token(keys, 'modifiers', modifier.kind);
  switch (modifier.kind) {
    case 'buildCost':
      return [token(keys, 'buildings', modifier.building), head, token(keys, 'resources', 'materials', modifier.materials)];
    case 'pioneerMismatchExtra':
      return [{ ...head, value: modifier.value }];
    case 'goldPointsMultiplier':
      return [{ ...head, value: `×${modifier.value}` }];
    case 'natureParkPoints':
      return [head, ...Object.entries(modifier.table).map(([size, points]) => token(keys, 'resources', 'points', `${size}:${points}`))];
    case 'expeditionRewards':
      return [head, ...modifier.add.flatMap((a) => [token(keys, 'tracks', 'military', a.level), ...commandTokens(keys, a.command)])];
    default:
      return [head];
  }
};

const abilityTokens = (keys: IconKeys, ability: Ability): IconToken[] => {
  const head = token(keys, 'abilities', ability.ability);
  switch (ability.ability) {
    case 'on':
      return [
        head,
        token(keys, 'events', ability.event),
        ...filterTokens(keys, ability.filter),
        ...(ability.every !== undefined ? [token(keys, 'symbols', 'every', ability.every)] : []),
        ...(ability.once === true ? [token(keys, 'symbols', 'once')] : []),
        ...ability.do.flatMap((c) => commandTokens(keys, c)),
      ];
    case 'freeAction':
      return [
        head,
        ...(ability.oncePerRound ? [token(keys, 'symbols', 'oncePerRound')] : []),
        ...(ability.require !== null ? conditionTokens(keys, ability.require) : []),
        ...(ability.pay !== null ? [token(keys, 'symbols', 'pay'), token(keys, 'resources', ability.pay.res, ability.pay.amount)] : []),
        ...ability.do.flatMap((c) => commandTokens(keys, c)),
      ];
    case 'actionSpace':
      return [head, token(keys, 'symbols', 'workers', ability.workers), ...ability.do.flatMap((c) => commandTokens(keys, c))];
    case 'modifier':
      return [head, ...modifierTokens(keys, ability.modifier)];
    default:
      return [head, ...ability.do.flatMap((c) => commandTokens(keys, c))];
  }
};

/** 効果スクリプトを、能力ごとのアイコンと数字の並びにする。 */
export const iconSequence = (script: Script, keys: IconKeys = ICON_KEYS): IconToken[][] =>
  script.map((ability) => abilityTokens(keys, ability));

// ---------------------------------------------------------------------------
// 補足表示の文章
// ---------------------------------------------------------------------------

const label = (keys: IconKeys, section: IconSection, key: string): string => entry(keys, section, key).label;

const quantity = (unit: string, n: number): string => (unit === '点' ? `${n}点` : `${unit}${n}`);

const describeAmount = (keys: IconKeys, amount: Amount, unit: string): string =>
  typeof amount === 'number'
    ? quantity(unit, amount)
    : `${metricEntry(keys, amount.count).label}${amount.per}${label(keys, 'symbols', 'per')}${quantity(unit, amount.times)}`;

const describeCondition = (keys: IconKeys, cond: Condition): string => {
  const right = typeof cond.right === 'number' ? String(cond.right) : metricEntry(keys, cond.right).label;
  return cond.op === '>='
    ? `${metricEntry(keys, cond.left).label}が${right}${label(keys, 'symbols', 'ge')}`
    : `${metricEntry(keys, cond.left).label}が${right}${label(keys, 'symbols', 'lt')}`;
};

const describeCommand = (keys: IconKeys, command: Command): string => {
  switch (command.op) {
    case 'gain':
      return `${describeAmount(keys, command.amount, label(keys, 'resources', command.res))}を${label(keys, 'commands', 'gain')}`;
    case 'raise':
      return `${label(keys, 'tracks', command.track)}を${command.amount}${label(keys, 'commands', 'raise')}`;
    case 'placeTiles':
      return `${label(keys, 'commands', 'placeTiles')}（${command.count}枚、${label(keys, 'terrains', command.tile)}）`;
    case 'build': {
      const what = command.buildings === null ? '' : `${command.buildings.map((b) => label(keys, 'buildings', b)).join('・')}を`;
      const where = command.terrain === null ? '' : `${label(keys, 'terrains', command.terrain)}に`;
      const cost = !command.payGold && !command.payMaterials ? `（${label(keys, 'symbols', 'free')}）` : !command.payGold ? `（${label(keys, 'symbols', 'noGold')}）` : '';
      const verb = command.buildings === null ? label(keys, 'commands', 'build') : '建てる';
      return `${where}${what}${command.max}軒${command.upTo ? label(keys, 'symbols', 'upTo') : ''}${verb}${cost}`;
    }
    case 'playCard':
      return `${label(keys, 'commands', 'playCard')}（${command.count}枚${command.free ? `、${label(keys, 'symbols', 'free')}` : ''}）`;
    case 'expeditionRewards':
      return `${label(keys, 'commands', 'expeditionRewards')}（${command.count}つ）`;
    case 'chooseOne':
      return `${command.options.map((o) => o.map((c) => describeCommand(keys, c)).join('、')).join(`／`)}の${label(keys, 'commands', 'chooseOne')}`;
    case 'if':
      return `${describeCondition(keys, command.cond)}${label(keys, 'symbols', 'then')}、${command.then.map((c) => describeCommand(keys, c)).join('、')}`;
    default:
      return label(keys, 'commands', command.op);
  }
};

const describeModifier = (keys: IconKeys, modifier: Modifier): string => {
  const head = label(keys, 'modifiers', modifier.kind);
  switch (modifier.kind) {
    case 'buildCost':
      return `${label(keys, 'buildings', modifier.building)}の${head}が資材${modifier.materials}`;
    case 'pioneerMismatchExtra':
      return `${head}が${modifier.value}`;
    case 'goldPointsMultiplier':
      return `${head}が${modifier.value}倍`;
    case 'natureParkPoints':
      return `${head}を${Object.entries(modifier.table)
        .map(([size, points]) => `${size}枚${points}点`)
        .join('・')}にする`;
    case 'expeditionRewards':
      return `${head}：${modifier.add
        .map((a) => `${label(keys, 'tracks', 'military')}${a.level}で${describeCommand(keys, a.command)}`)
        .join('、')}`;
    default:
      return head;
  }
};

const describeDo = (keys: IconKeys, commands: readonly Command[]): string => commands.map((c) => describeCommand(keys, c)).join('。');

const describeAbility = (keys: IconKeys, ability: Ability): string => {
  const head = label(keys, 'abilities', ability.ability);
  switch (ability.ability) {
    case 'on': {
      const { cond, excludeSelf, ...rest } = ability.filter;
      const filter = filterTokens(keys, rest).map((t) => t.label).join('・');
      // 出来事の語は助詞から始まる（「の土地タイルを置く度に」「を建設する度に」）。絞り込みがなければ助詞を落とす。
      const event = label(keys, 'events', ability.event);
      const eventText = filter === '' ? event.replace(/^[のを]/, '') : `${filter}${event}`;
      const every = ability.every !== undefined ? `、${ability.every}${label(keys, 'symbols', 'every')}` : '';
      const when = cond !== undefined ? `、${describeCondition(keys, cond)}のとき` : '';
      const once = ability.once === true ? `、${label(keys, 'symbols', 'once')}` : '';
      const self = excludeSelf === true ? `、${label(keys, 'symbols', 'excludeSelf')}` : '';
      return `${head}（${eventText}${self}${every}${when}${once}）：${describeDo(keys, ability.do)}`;
    }
    case 'freeAction': {
      const parts = [
        ability.oncePerRound ? label(keys, 'symbols', 'oncePerRound') : '',
        ability.require !== null ? describeCondition(keys, ability.require) : '',
        ability.pay !== null ? `${label(keys, 'resources', ability.pay.res)}${ability.pay.amount}を${label(keys, 'symbols', 'pay')}` : '',
      ].filter((x) => x !== '');
      return `${head}${parts.length > 0 ? `（${parts.join('、')}）` : ''}：${describeDo(keys, ability.do)}`;
    }
    case 'actionSpace':
      return `${head}（${label(keys, 'symbols', 'workers')}${ability.workers}）：${describeDo(keys, ability.do)}`;
    case 'modifier':
      return `${head}：${describeModifier(keys, ability.modifier)}`;
    default:
      return `${head}：${describeDo(keys, ability.do)}`;
  }
};

/** 効果スクリプトから補足表示の文章を組み立てる。能力ごとに1文。 */
export const describeScript = (script: Script, keys: IconKeys = ICON_KEYS): string[] =>
  script.map((ability) => describeAbility(keys, ability));
