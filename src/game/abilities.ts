// プレイヤーが持つ能力の収集と、計算への補正（modifier）の読み取り。
// 能力の出どころは、キャラクター・獲得した特別な市民カード・プレイ済みの文明カードである。
// 文明カードは常時効果（9-2-9）だけを持続する能力として扱い、onPlay はプレイ時に1回だけ処理する。

import type { Ability, Modifier } from '../data/script.ts';
import type { Building, GameData } from '../data/types.ts';
import type { PlayerState } from './types.ts';

export type OwnedAbility = {
  /** 能力の識別子（"sc:09#0" など）。1ラウンド1回・N回に1回・ロックの管理に使う。 */
  readonly key: string;
  /** 出どころ（"char:hero"・"sc:09"・"civ:018"）。 */
  readonly source: string;
  readonly ability: Ability;
};

const fromScript = (source: string, script: readonly Ability[], skip: (a: Ability) => boolean): OwnedAbility[] =>
  script.flatMap((ability, index) => (skip(ability) ? [] : [{ key: `${source}#${index}`, source, ability }]));

export const abilitiesOf = (d: GameData, player: PlayerState): OwnedAbility[] => {
  const result: OwnedAbility[] = [];
  const character = d.characters.find((c) => c.id === player.characterId);
  if (character !== undefined) {
    result.push(...fromScript(`char:${character.id}`, character.script, () => false));
  }
  for (const id of player.specialCitizens) {
    const card = d.specialCitizens.find((c) => c.id === id);
    if (card !== undefined) {
      result.push(...fromScript(`sc:${id}`, card.script, () => false));
    }
  }
  for (const id of player.played) {
    const card = d.civilizationCards.find((c) => c.id === id);
    if (card !== undefined) {
      result.push(...fromScript(`civ:${id}`, card.script, (a) => a.ability === 'onPlay'));
    }
  }
  return result;
};

export const modifiersOf = (d: GameData, player: PlayerState): Modifier[] =>
  abilitiesOf(d, player).flatMap((owned) => (owned.ability.ability === 'modifier' ? [owned.ability.modifier] : []));

/** 建設コストの資材の補正（特別市民12、指揮官、官僚）。負の数が軽減である。 */
export const buildCostMaterialsModifier = (d: GameData, player: PlayerState, building: Building): number =>
  modifiersOf(d, player).reduce((sum, m) => (m.kind === 'buildCost' && m.building === building ? sum + m.materials : sum), 0);

export const hasModifier = (d: GameData, player: PlayerState, kind: Modifier['kind']): boolean =>
  modifiersOf(d, player).some((m) => m.kind === kind);

/** 開拓で地形と異なる土地タイルを置く追加資材（4-2-4）。デザイナーは0（その最小値を使う）。 */
export const mismatchExtraMaterials = (d: GameData, player: PlayerState): number =>
  modifiersOf(d, player).reduce(
    (value, m) => (m.kind === 'pioneerMismatchExtra' ? Math.min(value, m.value) : value),
    d.params.land.mismatchExtraMaterials,
  );
