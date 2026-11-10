// アイコンの対応表（icon_keys.json）の型と検査（ui_design.md 0-1、指示書 3-3）。
// 命令・能力・資源・指標などの各要素に、アイコンの識別子と補足表示に使う語を対応づける。

import iconKeysJson from './icon_keys.json';
import { ABILITY_NAMES, COMMAND_OPS, EVENT_NAMES, GAIN_RESOURCES, MODIFIER_KINDS, SIMPLE_METRICS } from './script.ts';
import { ACTIONS, BUILDINGS, CIV_TAGS, TERRAINS, TIERS } from './types.ts';

export type IconEntry = { readonly icon: string; readonly label: string };

export const ICON_SECTIONS = {
  abilities: ABILITY_NAMES,
  commands: COMMAND_OPS,
  resources: GAIN_RESOURCES,
  tracks: ['military', 'infra'],
  buildings: BUILDINGS,
  terrains: [...TERRAINS, 'match', 'any'],
  tags: CIV_TAGS,
  metrics: [...SIMPLE_METRICS, 'buildingsOfType', 'buildingsOnTerrain', 'tagsOf'],
  events: EVENT_NAMES,
  modifiers: MODIFIER_KINDS,
  results: ['defenseFailed', 'defended', 'repelled'],
  tiers: TIERS,
  actions: ACTIONS,
  symbols: ['per', 'ge', 'lt', 'free', 'noGold', 'noMaterials', 'upTo', 'oncePerRound', 'pay', 'workers', 'every', 'once', 'or', 'then', 'excludeSelf', 'axis', 'pass', 'colon', 'discard', 'distinct', 'except', 'anyPlayer'],
} as const;

export type IconSection = keyof typeof ICON_SECTIONS;
export type IconKeys = { readonly provisional: boolean } & { readonly [S in IconSection]: Readonly<Record<string, IconEntry>> };

/** 対応表を検査する。必要な要素がすべてあり、識別子と語が空でないこと。問題の一覧を返す。 */
export const checkIconKeys = (value: unknown): string[] => {
  const issues: string[] = [];
  const root = value as Record<string, unknown>;
  for (const [section, keys] of Object.entries(ICON_SECTIONS)) {
    const table = root[section] as Record<string, unknown> | undefined;
    if (typeof table !== 'object' || table === null) {
      issues.push(`icon_keys.${section}：表がない`);
      continue;
    }
    for (const key of keys) {
      const entry = table[key] as Partial<IconEntry> | undefined;
      if (typeof entry?.icon !== 'string' || entry.icon === '' || typeof entry.label !== 'string' || entry.label === '') {
        issues.push(`icon_keys.${section}.${key}：識別子または語がない`);
      }
    }
  }
  return issues;
};

const loadIconKeys = (value: unknown): IconKeys => {
  const issues = checkIconKeys(value);
  if (issues.length > 0) {
    throw new Error(`アイコンの対応表の検査に失敗した：\n${issues.join('\n')}`);
  }
  return value as IconKeys;
};

export const ICON_KEYS: IconKeys = loadIconKeys(iconKeysJson);
