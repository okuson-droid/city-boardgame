// 選択肢と画面要素の対応（ui_design.md 0-2、2-3、指示書 3-4）。
// 画面は選択肢の識別子を解釈せず、targetOf が返す画面要素に選択肢を割り当てる。
// targetOf が null を返す選択肢は、プロンプト帯の「その他」に出す（安全網）。

import type { CellId } from './board.ts';
import type { Action, Building, Terrain, Tier } from '../data/types.ts';
import type { Option } from './types.ts';

export type PanelKind = 'workers' | 'count' | 'reward' | 'convert' | 'order' | 'choose' | 'copy' | 'raid';

export type Target =
  | { readonly kind: 'draft'; readonly group: 'board' | 'bonus' | 'character'; readonly id: string }
  | { readonly kind: 'actionSpace'; readonly action: Action; readonly tier: Tier }
  | { readonly kind: 'specialSpace'; readonly key: string; readonly source: string }
  | { readonly kind: 'ability'; readonly key: string; readonly source: string }
  | { readonly kind: 'conversion'; readonly id: string; readonly card: string | null }
  | { readonly kind: 'plannedCity'; readonly id: string }
  /** 個人ボードのマス。variant は同じマスで選び分ける値（土地タイルの種類・建物・置き換える初期マス）。 */
  | {
      readonly kind: 'cell';
      readonly cell: CellId;
      readonly variantKind: 'terrain' | 'building' | null;
      readonly variant: string | null;
    }
  | { readonly kind: 'handCard'; readonly card: string }
  | { readonly kind: 'bonusTile'; readonly id: number }
  | { readonly kind: 'specialCitizen'; readonly id: string }
  | { readonly kind: 'panel'; readonly panel: PanelKind; readonly value: string }
  | { readonly kind: 'button'; readonly button: 'pass' | 'end' | 'done' };

const sourceOf = (key: string): string => key.split('#')[0] ?? key;

/** 選択肢に対応する画面要素。対応がなければ null。 */
export const targetOf = (option: Option): Target | null => {
  const id = option.id;
  if (id === 'pass' || id === 'end' || id === 'done') {
    return { kind: 'button', button: id };
  }
  const [kind = '', a = '', b = ''] = id.split(':');
  switch (kind) {
    case 'draft':
      return a === 'board' || a === 'bonus' || a === 'character' ? { kind: 'draft', group: a, id: b } : null;
    case 'act':
      return { kind: 'actionSpace', action: a as Action, tier: b as Tier };
    case 'space': {
      const key = id.slice('space:'.length);
      return { kind: 'specialSpace', key, source: sourceOf(key) };
    }
    case 'ability': {
      const key = id.slice('ability:'.length);
      return { kind: 'ability', key, source: sourceOf(key) };
    }
    case 'free':
      return { kind: 'conversion', id: a, card: b === '' ? null : b };
    case 'plan':
      return { kind: 'plannedCity', id: a };
    case 'tile':
      return { kind: 'cell', cell: a as CellId, variantKind: 'terrain', variant: b as Terrain };
    case 'build':
      return { kind: 'cell', cell: b as CellId, variantKind: 'building', variant: a as Building };
    case 'spirit':
      return { kind: 'cell', cell: b as CellId, variantKind: 'terrain', variant: a as Terrain };
    case 'hero':
      // 英雄の初期配置：山岳マスに山岳タイルを置く（hero:<マス>）。
      return { kind: 'cell', cell: a as CellId, variantKind: 'terrain', variant: 'mountain' };
    case 'card':
      return { kind: 'handCard', card: a };
    case 'bonus':
      return { kind: 'bonusTile', id: Number(a) };
    case 'sc':
      return { kind: 'specialCitizen', id: a };
    case 'temp':
      return { kind: 'panel', panel: 'workers', value: a };
    case 'count':
      return { kind: 'panel', panel: 'count', value: a };
    case 'reward':
      return { kind: 'panel', panel: 'reward', value: a };
    case 'convert':
      return { kind: 'panel', panel: 'convert', value: a };
    case 'order':
      return { kind: 'panel', panel: 'order', value: a };
    case 'choose':
      return { kind: 'panel', panel: 'choose', value: a };
    case 'copy':
      return { kind: 'panel', panel: 'copy', value: `${a}:${b}` };
    case 'raid':
      return { kind: 'panel', panel: 'raid', value: a };
    default:
      return null;
  }
};
