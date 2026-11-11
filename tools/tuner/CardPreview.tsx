// カードのプレビュー（ユーザー決定 2026-11-08：チューナーでゲーム画面と同じカードの面を見ながら、面の上で直接直せるようにする）。
// 作業中の写し（調整案）の値をそのまま描く。文明カードは名前・コスト・分類・得点を面の上で直せ、計画都市は達成の報酬の数を直せる。
// 効果は面の下の「効果（命令と引数）」で直し、その結果がすぐ面に映る。値が型に合わず描けないときは、理由を出して描かない。

import { Component, useState, type ReactNode } from 'react';
import { CIV_TAGS, GRANT_KINDS, ICON_KEYS, TERRAINS, type BonusTile, type Grant, type GrantKind, type Terrain, type NatureParkCard, type PlannedCityCard, type RaidCard, type Script } from '../../src/data/index.ts';
import { describeRaidOutcomes } from '../../src/game/queries.ts';
import { BonusTileView, NatureParkView, PlannedCityView, ScriptView } from '../../src/ui/Cards.tsx';
import { Icon, IconRow } from '../../src/ui/Icon.tsx';
import { tagColor } from '../../src/ui/icon-art.ts';
import type { OnSet } from './JsonEditor.tsx';
import { valueLabel } from './labels.ts';

/** 描けない値で画面全体が止まらないようにする。 */
class PreviewBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: string | null; key: string }> {
  override state = { error: null as string | null, key: '' };

  static getDerivedStateFromError(error: unknown) {
    return { error: String(error) };
  }

  static getDerivedStateFromProps(props: { resetKey: string }, state: { error: string | null; key: string }) {
    // 値が変わったら描き直す。
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  override render() {
    return this.state.error !== null ? <p className="preview-error small">この値では面を描けない：{this.state.error}</p> : this.props.children;
  }
}

const tok = (section: keyof typeof ICON_KEYS, key: string, value?: number | string) => {
  const e = (ICON_KEYS[section] as Readonly<Record<string, { icon: string; label: string }>>)[key] ?? { icon: `${section}.${key}`, label: key };
  return value === undefined ? { icon: e.icon, label: e.label } : { icon: e.icon, value, label: e.label };
};

/** 面の上の数値。押すと入力欄になり、確定（Enter・欄の外）で値を書き換える。 */
const InlineNumber = ({ value, onSet, className, label }: { value: number; onSet: (v: number) => void; className: string; label: string }) => {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="number"
        className={`inline-edit ${className}`}
        defaultValue={value}
        autoFocus
        aria-label={label}
        onBlur={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onSet(v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button type="button" className={`inline-target ${className}`} title={`${label}を直す`} data-ui="preview-edit" onClick={() => setEditing(true)}>
      {value}
    </button>
  );
};

/** 面の上の文字。allowEmpty なら空にでき（名前を外す）、空のときは placeholder を出す。 */
const InlineText = ({
  value,
  onSet,
  label,
  allowEmpty = false,
  placeholder = '',
}: {
  value: string;
  onSet: (v: string) => void;
  label: string;
  allowEmpty?: boolean;
  placeholder?: string;
}) => {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        type="text"
        className="inline-edit card-name"
        defaultValue={value}
        autoFocus
        aria-label={label}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v !== '' || allowEmpty) onSet(v);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <button type="button" className="inline-target card-name" title={`${label}を直す`} data-ui="preview-edit" onClick={() => setEditing(true)}>
      {value !== '' ? value : placeholder}
    </button>
  );
};

/**
 * 計画都市の達成の報酬（ユーザー決定 2026-11-11：複数の種類を持てる）。1行が得るもの1つで、種類・数（無料建設は地形も）を選び、
 * 足し・消せる。報酬は1つ以上なければならない（check.ts）。
 */
const BenefitsEditor = ({ benefits, onChange }: { benefits: readonly Grant[]; onChange: (list: Grant[]) => void }) => {
  const replace = (i: number, next: Grant) => onChange(benefits.map((b, j) => (j === i ? next : b)));
  const withKind = (b: Grant, kind: GrantKind): Grant =>
    kind === 'freeBuildOnTerrain' ? { kind, amount: b.amount, terrain: b.kind === 'freeBuildOnTerrain' ? b.terrain : 'plains' } : { kind, amount: b.amount };
  return (
    <div className="benefits-editor" data-ui="benefits-editor">
      <span className="small">達成の報酬</span>
      {benefits.map((b, i) => (
        <div key={i} className="benefit-row">
          <select aria-label="得るもの" value={b.kind} onChange={(e) => replace(i, withKind(b, e.target.value as GrantKind))}>
            {GRANT_KINDS.map((k) => (
              <option key={k} value={k}>
                {valueLabel(k, 'kind')}
              </option>
            ))}
          </select>
          {b.kind === 'freeBuildOnTerrain' ? (
            <select aria-label="地形" value={b.terrain} onChange={(e) => replace(i, { ...b, terrain: e.target.value as Terrain })}>
              {TERRAINS.map((t) => (
                <option key={t} value={t}>
                  {valueLabel(t, 'terrain')}
                </option>
              ))}
            </select>
          ) : null}
          <input
            type="number"
            min={1}
            aria-label="数"
            value={b.amount}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 1) replace(i, { ...b, amount: Math.floor(v) });
            }}
          />
          <button type="button" className="btn small" disabled={benefits.length <= 1} onClick={() => onChange(benefits.filter((_, j) => j !== i))}>
            消す
          </button>
        </div>
      ))}
      <button type="button" className="btn small" data-ui="benefit-add" onClick={() => onChange([...benefits, { kind: 'gold', amount: 1 }])}>
        報酬を足す
      </button>
    </div>
  );
};

type CivItem = { name: string; cost: { gold: number }; tags: string[]; points: number; script: Script; provisional?: boolean };

/** 文明カードの面（ゲームの CivCardView と同じ並び）。名前・コスト・分類・得点を面の上で直せる。 */
const CivFace = ({ card, onSet }: { card: CivItem; onSet: OnSet }) => {
  const [tagsOpen, setTagsOpen] = useState(false);
  const color = tagColor(card.tags[0] ?? '') ?? '#8a7a5a';
  return (
    <div className="card civ preview-card">
      <div className="civ-face" style={{ ['--tag' as string]: color }}>
        <div className="civ-band">
          <InlineNumber value={card.cost.gold} className="civ-cost" label="コスト（金）" onSet={(v) => onSet(['cost', 'gold'], v)} />
          <InlineText value={card.name} label="名前" onSet={(v) => onSet(['name'], v)} />
        </div>
        <div className="civ-tags">
          <span className="civ-section-label">分類</span>
          <button type="button" className="inline-target" title="分類を直す" data-ui="preview-tags" onClick={() => setTagsOpen(!tagsOpen)}>
            <IconRow tokens={card.tags.map((t) => tok('tags', t))} size="sm" />
            {card.tags.length === 0 ? <span className="small">（なし）</span> : null}
          </button>
        </div>
        {tagsOpen ? (
          <div className="preview-tags">
            {CIV_TAGS.map((t) => (
              <label key={t}>
                <input
                  type="checkbox"
                  checked={card.tags.includes(t)}
                  onChange={(e) => onSet(['tags'], e.target.checked ? [...card.tags, t] : card.tags.filter((x) => x !== t))}
                />
                <Icon token={tok('tags', t)} size="sm" />
                {valueLabel(t, 'tags')}
              </label>
            ))}
          </div>
        ) : null}
        <div className="civ-effect">
          <ScriptView script={card.script} />
        </div>
        <div className="civ-foot">
          <span className="civ-points">
            <Icon token={tok('resources', 'points')} size="sm" />
            <InlineNumber value={card.points} className="preview-points" label="得点" onSet={(v) => onSet(['points'], v)} />
          </span>
        </div>
        {card.provisional ? <span className="provisional-badge">仮</span> : null}
      </div>
    </div>
  );
};

const ScriptCard = ({ name, script, className, provisional }: { name: string; script: Script; className: string; provisional: boolean }) => (
  <div className={`card ${className} preview-card`}>
    <div className="card-head">
      <span className="card-name">{name}</span>
      {provisional ? <span className="provisional-badge">仮</span> : null}
    </div>
    <ScriptView script={script} />
  </div>
);

const RaidFace = ({ card }: { card: RaidCard }) => {
  const o = describeRaidOutcomes(card);
  return (
    <div className="card preview-card preview-raid">
      <div className="card-head">
        <span className="card-name">襲撃カード {card.id}</span>
      </div>
      <p className="small">
        防衛ライン＋{card.defense_increase}・撃退ライン＋{card.repel_increase}
      </p>
      <p className="small">防衛失敗：{o.defenseFailed}</p>
      <p className="small">撃退成功：{o.repelled}</p>
    </div>
  );
};

/** 種類ごとのプレビュー。kind は TunerApp の種類の識別子。 */
export const CardPreview = ({ kind, item, onSet }: { kind: string; item: unknown; onSet: OnSet }) => {
  if (typeof item !== 'object' || item === null) return null;
  const any = item as Record<string, unknown>;
  const body = (() => {
    switch (kind) {
      case 'civ':
        return <CivFace card={any as unknown as CivItem} onSet={onSet} />;
      case 'sc':
        // カード名（ユーザー決定 2026-11-11）は面の上で直せる。空にすると「市民<id>」と出す。
        return (
          <div className="card sc preview-card">
            <div className="card-head">
              <InlineText
                value={typeof any['name'] === 'string' ? any['name'] : ''}
                placeholder={`市民${String(any['id'])}`}
                allowEmpty
                label="カード名"
                onSet={(v) => onSet(['name'], v)}
              />
              {any['provisional'] === true ? <span className="provisional-badge">仮</span> : null}
            </div>
            <ScriptView script={any['script'] as Script} />
          </div>
        );
      case 'char':
        return <ScriptCard name={String(any['name'])} script={any['script'] as Script} className="character" provisional={any['provisional'] === true} />;
      case 'planned': {
        const card = any as unknown as PlannedCityCard;
        return (
          <div className="preview-stack">
            <div className="card pc preview-card">
              <PlannedCityView card={card} />
            </div>
            <BenefitsEditor benefits={card.benefits} onChange={(list) => onSet(['benefits'], list)} />
          </div>
        );
      }
      case 'nature':
        return (
          <div className="card np preview-card">
            <NatureParkView card={any as unknown as NatureParkCard} />
          </div>
        );
      case 'bonus':
        return (
          <div className="card tile preview-card">
            <BonusTileView tile={any as unknown as BonusTile} />
          </div>
        );
      case 'raid':
        return <RaidFace card={any as unknown as RaidCard} />;
      default:
        return null;
    }
  })();
  if (body === null) return null;
  return (
    <section className="card-preview" data-ui="card-preview">
      <h3>プレビュー（ゲーム画面と同じ面）</h3>
      <PreviewBoundary resetKey={JSON.stringify(item)}>{body}</PreviewBoundary>
      {kind === 'civ' ? <p className="muted small">面の上の名前・コスト・分類・得点を押すと直せる。効果は下の「効果（命令と引数）」で直す。</p> : null}
      {kind === 'sc' ? <p className="muted small">面の上のカード名を押すと直せる。空にすると「市民{String(any['id'])}」と出す。</p> : null}
    </section>
  );
};
