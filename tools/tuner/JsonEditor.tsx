// データの汎用フォーム（指示書 3-5）。JSON の値を、数値・真偽・選択・文字の入力欄で編集する。
// 識別子と文言の原本は読むだけにする。元データと違う値には印を付ける。

import { ACTIONS, BUILDINGS, CIV_TAGS, GRANT_KINDS, PAYMENT_KINDS, RAID_EFFECT_KINDS, TERRAINS, TIERS, TILE_EFFECT_KINDS } from '../../src/data/index.ts';
import { keyLabel, valueLabel } from './labels.ts';
import { deepEqual, type Path } from './proposal.ts';

export type OnSet = (path: Path, value: unknown) => void;

/** 読むだけの項目（識別子・原本の文言・注記）。識別子を変えると参照が切れるため編集させない。 */
const READ_ONLY = new Set([
  'id',
  'text',
  'notes',
  'source',
  'clarifications',
  'open_issues',
  'importedFrom',
  'schema',
  'version',
  'updated',
  'on_defense_fail',
  'on_repel',
  'effects',
  'initial_bonus',
  'label',
  'axis',
  'rulesRef',
  'generatedWithSeed',
  'rulesVersion',
  // 仮置きの印は、データの出どころを示すものであり調整の対象ではない。
  'provisional',
  'provisionalFields',
  // プレイ条件・効果適用条件は、命令セットでの表し方が決まるまで編集させない（ゲームが解釈しないため）。
  'playCondition',
  'effectCondition',
]);

/**
 * 新しく作ったカード（元データにないカード）で編集できる、読むだけの項目。新しいカードには原本がないため、
 * 名前に加えて文言・分類・効果の説明などを自由に書けるようにする。識別子と仮置きの印は読むだけのままである。
 */
const UNLOCKED_FOR_NEW = new Set(['text', 'label', 'axis', 'effects', 'initial_bonus', 'on_defense_fail', 'on_repel']);

const isReadOnly = (key: string, unlocked: boolean): boolean => READ_ONLY.has(key) && !(unlocked && UNLOCKED_FOR_NEW.has(key));

/** 項目名と位置から、選べる値の一覧を決める。 */
export const enumFor = (key: string, path: Path): readonly (string | null)[] | null => {
  const inside = (k: string) => path.some((p) => p === k);
  switch (key) {
    case 'terrain':
    case 'initialTerrain':
      return inside('slots') ? [...TERRAINS, null] : TERRAINS;
    case 'building':
      return inside('slots') ? [...BUILDINGS, null] : BUILDINGS;
    case 'action':
      return ACTIONS;
    case 'tier':
      return TIERS;
    case 'metric':
      return ['buildingsOfType', 'totalBuildings', 'landTiles', 'militaryLevel', 'civCardsPlayed'];
    case 'mode':
      return ['distinct', 'total'];
    case 'count':
      return inside('passScore') ? ['houses', 'buildingTypes', 'playedCivCards'] : null;
    case 'kind':
      if (inside('roundStart')) return TILE_EFFECT_KINDS;
      if (inside('defenseFailEffects') || inside('repelEffects')) return RAID_EFFECT_KINDS;
      if (inside('pay')) return PAYMENT_KINDS;
      return GRANT_KINDS;
    default:
      return null;
  }
};

/** 配列の要素の選択肢（タグ・建物の一覧）。 */
const listEnumFor = (key: string): readonly string[] | null => {
  if (key === 'tags') return CIV_TAGS;
  if (key === 'buildings') return BUILDINGS;
  if (key === 'initialCells') return null;
  if (key === 'defenseFailed' || key === 'defended' || key === 'repelled') return RAID_EFFECT_KINDS;
  return null;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 読むだけの値の表示。null・真偽は日本語にし、文字はそのまま出す。 */
const readonlyText = (value: unknown): string => {
  if (value === null) return '（なし）';
  if (value === true) return 'はい';
  if (value === false) return 'いいえ';
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const changedClass = (value: unknown, base: unknown): string => (deepEqual(value, base) ? '' : ' changed');

const Primitive = ({
  value,
  base,
  path,
  keyName,
  onSet,
  unlocked,
}: {
  value: unknown;
  base: unknown;
  path: Path;
  keyName: string;
  onSet: OnSet;
  unlocked: boolean;
}) => {
  const options = enumFor(keyName, path);
  const cls = `field-input${changedClass(value, base)}`;
  // いまの効果の文言（revisedEffects、2026-11-10）は原本ではないため、中の文言・時機も編集できる。
  if (isReadOnly(keyName, unlocked) && !path.includes('revisedEffects')) return <span className="readonly">{readonlyText(value)}</span>;
  if (options !== null && (typeof value === 'string' || value === null)) {
    return (
      <select className={cls} value={value === null ? '' : value} onChange={(e) => onSet(path, e.target.value === '' ? null : e.target.value)}>
        {options.map((o) => (
          <option key={o ?? ''} value={o ?? ''}>
            {o === null ? '（なし）' : valueLabel(o, keyName)}
          </option>
        ))}
      </select>
    );
  }
  if (typeof value === 'number') {
    return (
      <input
        className={cls}
        type="number"
        value={value}
        onChange={(e) => onSet(path, e.target.value === '' ? 0 : Number(e.target.value))}
      />
    );
  }
  if (typeof value === 'boolean') {
    return <input className={cls} type="checkbox" checked={value} onChange={(e) => onSet(path, e.target.checked)} />;
  }
  if (value === null) {
    return <span className="readonly">（なし）</span>;
  }
  return <input className={cls} type="text" value={String(value)} onChange={(e) => onSet(path, e.target.value)} />;
};

export const JsonEditor = ({
  value,
  base,
  path,
  keyName = '',
  onSet,
  skip = [],
  unlocked = false,
}: {
  value: unknown;
  base: unknown;
  path: Path;
  keyName?: string;
  onSet: OnSet;
  skip?: readonly string[];
  /** 新しく作ったカードなら true（文言などの読むだけの項目も編集できる）。 */
  unlocked?: boolean;
}) => {
  if (isReadOnly(keyName, unlocked) && (Array.isArray(value) || isObject(value))) {
    return <span className="readonly small">（読むだけ）</span>;
  }
  if (Array.isArray(value)) {
    const listEnum = listEnumFor(keyName);
    if (listEnum !== null && value.every((v) => typeof v === 'string')) {
      return (
        <span className={`checks${changedClass(value, base)}`}>
          {listEnum.map((o) => (
            <label key={o}>
              <input
                type="checkbox"
                checked={value.includes(o)}
                onChange={(e) => onSet(path, e.target.checked ? [...value, o] : value.filter((v) => v !== o))}
              />
              {valueLabel(o, keyName)}
            </label>
          ))}
        </span>
      );
    }
    const baseList = Array.isArray(base) ? base : [];
    return (
      <div className={`list${value.length !== baseList.length ? ' changed' : ''}`}>
        {value.map((item, i) => (
          <div key={i} className="list-item">
            <span className="list-index">{i}</span>
            <JsonEditor value={item} base={baseList[i]} path={[...path, i]} keyName={keyName} onSet={onSet} unlocked={unlocked} />
            <button type="button" className="btn small" onClick={() => onSet(path, value.filter((_, j) => j !== i))}>
              削除
            </button>
          </div>
        ))}
        {value.length > 0 ? (
          <button type="button" className="btn small" onClick={() => onSet(path, [...value, structuredClone(value[value.length - 1])])}>
            追加（最後の要素を写す）
          </button>
        ) : null}
      </div>
    );
  }
  if (isObject(value)) {
    const baseObj = isObject(base) ? base : {};
    return (
      <div className="obj">
        {Object.entries(value)
          .filter(([k]) => !skip.includes(k))
          .map(([k, v]) => (
            <div key={k} className="obj-row">
              <span className="obj-key" title={k}>
                {keyLabel(k)}
              </span>
              <JsonEditor value={v} base={baseObj[k]} path={[...path, k]} keyName={k} onSet={onSet} unlocked={unlocked} />
            </div>
          ))}
      </div>
    );
  }
  return <Primitive value={value} base={base} path={path} keyName={keyName} onSet={onSet} unlocked={unlocked} />;
};
