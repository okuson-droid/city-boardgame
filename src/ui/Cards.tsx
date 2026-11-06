// カード・タイル類の表示部品。効果はアイコンと数字の並びで出し、補足は効果スクリプトから組み立てる（ui_design.md 0-1）。

import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import type { Script } from '../data/script.ts';
import type { BonusTile, PlannedCityCard, NatureParkCard } from '../data/types.ts';
import { describeScript, iconSequence, type IconToken } from '../game/icons.ts';
import { civCardCost } from '../game/queries.ts';
import type { PlayerState } from '../game/types.ts';
import { IconRow } from './Icon.tsx';
import { ShapeView } from './Board.tsx';
import { ICON_ART, tagColor } from './icon-art.ts';
import { Tip } from './Tip.tsx';
import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const entry = (section: keyof typeof ICON_KEYS, key: string): { icon: string; label: string } =>
  (ICON_KEYS[section] as Readonly<Record<string, { icon: string; label: string }>>)[key] ?? { icon: `${section}.${key}`, label: key };

const tok = (section: keyof typeof ICON_KEYS, key: string, value?: number | string): IconToken => {
  const e = entry(section, key);
  return value === undefined ? { icon: e.icon, label: e.label } : { icon: e.icon, value, label: e.label };
};

/** 効果スクリプトの表示。能力ごとに1行、補足は自動で組み立てた文章。 */
export const ScriptView = ({ script }: { script: Script }) => {
  const rows = iconSequence(script);
  const texts = describeScript(script);
  return (
    <div className="script">
      {rows.map((tokens, i) => (
        <Tip key={i} text={texts[i] ?? null}>
          <div className="script-row">
            <IconRow tokens={tokens} size="sm" />
          </div>
        </Tip>
      ))}
    </div>
  );
};

type CardProps = {
  readonly optionId?: string | undefined;
  readonly onChoose: (id: string) => void;
  readonly reason?: string | null;
  readonly className?: string;
  readonly children: ReactNode;
  readonly extra?: Record<string, string>;
};

/** 選べるカードは data-target を持つボタン、選べないカードは理由を補足に出す。 */
export const CardFrame = ({ optionId, onChoose, reason = null, className = '', children, extra = {} }: CardProps) => (
  <Tip text={optionId === undefined ? reason : null}>
    <div
      className={`card ${className}${optionId !== undefined ? ' selectable' : ''}`}
      role={optionId !== undefined ? 'button' : undefined}
      {...(optionId !== undefined ? { 'data-target': optionId } : {})}
      {...extra}
      onClick={() => optionId !== undefined && onChoose(optionId)}
    >
      {children}
    </div>
  </Tip>
);

/**
 * 文明カード（ユーザー決定 2026-11-05：コスト・分類・効果の区切りをはっきりさせ、カードらしく飾る）。
 * 上から、分類の色の帯（左に金貨のコスト、右に名前）、分類のアイコンの段、枠で囲んだ効果、固有の得点の順に並べる。
 */
export const CivCardView = ({ card, player }: { card: string; player: PlayerState | null }) => {
  const data = GAME_DATA.civilizationCards.find((c) => c.id === card);
  if (data === undefined) return <span>{card}</span>;
  const cost = player === null ? data.cost.gold : civCardCost(GAME_DATA, player, card);
  const reduced = cost < data.cost.gold;
  const color = tagColor(data.tags[0] ?? '') ?? '#8a7a5a';
  return (
    <div className="civ-face" style={{ ['--tag' as string]: color }} data-tags={data.tags.join(' ')}>
      <div className="civ-band">
        <Tip text={`プレイに要る金：${cost}${reduced ? `（元は${data.cost.gold}）` : ''}`}>
          <span className={`civ-cost${reduced ? ' reduced' : ''}`} aria-label={`コスト 金${cost}`}>
            {cost}
          </span>
        </Tip>
        <span className="card-name">{data.name}</span>
      </div>
      <div className="civ-tags">
        <span className="civ-section-label">分類</span>
        <IconRow tokens={data.tags.map((t) => tok('tags', t))} size="sm" />
      </div>
      <div className="civ-effect">
        <ScriptView script={data.script} />
      </div>
      {data.points !== 0 ? (
        <div className="civ-foot">
          <Tip text={`このカードの得点：${data.points}点（ゲーム終了時）`}>
            <span className="civ-points">
              <IconRow tokens={[tok('resources', 'points', data.points)]} size="sm" />
            </span>
          </Tip>
        </div>
      ) : null}
      {data.provisional ? <span className="provisional-badge">仮</span> : null}
    </div>
  );
};

export const bonusTileIcons = (tile: BonusTile): IconToken[] => [
  ...tile.roundStart.map((e) => {
    switch (e.kind) {
      case 'militaryLevel':
        return tok('tracks', 'military', `+${e.amount}`);
      case 'infraLevel':
        return tok('tracks', 'infra', `+${e.amount}`);
      case 'landTiles':
        return tok('commands', 'placeTiles', e.amount);
      case 'discardCivCards':
        return tok('symbols', 'discard', e.amount);
      case 'buildRight':
        return tok('commands', 'build', e.amount);
      default:
        return tok('resources', e.kind, e.amount);
    }
  }),
  ...(tile.passScore
    ? [tok('symbols', 'pass'), tok('metrics', tile.passScore.count === 'playedCivCards' ? 'playedCivCards' : tile.passScore.count === 'houses' ? 'houses' : 'buildings', tile.passScore.per), tok('resources', 'points', tile.passScore.points)]
    : []),
];

export const BonusTileView = ({ tile }: { tile: BonusTile }) => (
  <Tip text={tile.text}>
    <div className="tile-body">
      <span className="tile-id">{tile.id}</span>
      <IconRow tokens={bonusTileIcons(tile)} size="sm" />
    </div>
  </Tip>
);

const plannedCells = (card: PlannedCityCard) =>
  card.slots.map((s) => ({
    q: s.q,
    r: s.r,
    terrain: s.terrain,
    text: '',
    ...(s.building === null ? {} : { art: ICON_ART[`bld.${s.building}`] ?? '', title: entry('buildings', s.building).label }),
  }));

const plannedBenefit = (card: PlannedCityCard): IconToken[] => [
  tok('resources', card.benefit.kind === 'drawCivCards' ? 'drawCivCards' : card.benefit.kind, card.benefit.amount),
];

/**
 * 計画都市の拡大表示（ユーザー決定 2026-11-06：カードの形が小さくて見づらいため）。
 * カードは選べる所作（data-target）の中にあるため、画面の最上位に描き（createPortal）、クリックは外へ伝えない。
 */
const PlannedCityZoom = ({ card, onClose }: { card: PlannedCityCard; onClose: () => void }) => {
  const needs = new Map<string, number>();
  for (const s of card.slots) {
    const terrain = s.terrain === null ? null : entry('terrains', s.terrain).label;
    const building = s.building === null ? null : entry('buildings', s.building).label;
    const name =
      terrain !== null && building !== null
        ? `${terrain}の${building}`
        : building !== null
          ? `${building}（地形は問わない）`
          : terrain !== null
            ? `${terrain}の土地`
            : null;
    if (name !== null) needs.set(name, (needs.get(name) ?? 0) + 1);
  }
  return createPortal(
    <div
      className="overlay pc-zoom-overlay"
      data-ui="pc-zoom-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="overlay-box pc-zoom" role="dialog" aria-label={`${card.name}の拡大`} onClick={(e) => e.stopPropagation()}>
        <div className="pc-zoom-head">
          <strong>{card.name}</strong>
          {card.provisional ? <span className="provisional-badge">仮</span> : null}
          <button type="button" className="btn small" data-ui="pc-zoom-close" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className="pc-zoom-shape">
          <ShapeView cells={plannedCells(card)} />
        </div>
        <div className="pc-zoom-foot">
          <span className="civ-section-label">達成</span>
          <IconRow tokens={plannedBenefit(card)} />
        </div>
        <ul className="pc-zoom-needs">
          {[...needs.entries()].map(([name, n]) => (
            <li key={name}>
              {name}×{n}
            </li>
          ))}
        </ul>
        <p className="muted small">個人ボードに、この形のとおりに建物を並べると達成を宣言できる。回転した配置はよく、裏返した（鏡像の）配置はよくない（rules.md 19-1-6）。</p>
      </div>
    </div>,
    document.body,
  );
};

export const PlannedCityView = ({ card }: { card: PlannedCityCard }) => {
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <div className="card-head">
        <span className="card-name">{card.name}</span>
        {card.provisional ? <span className="provisional-badge">仮</span> : null}
        <button
          type="button"
          className="pc-zoom-btn"
          data-ui="pc-zoom"
          aria-label={`${card.name}を拡大する`}
          title="拡大する"
          onClick={(e) => {
            e.stopPropagation();
            setZoom(true);
          }}
        >
          ⤢
        </button>
      </div>
      <div className="pc-shape">
        <ShapeView cells={plannedCells(card)} />
      </div>
      <div className="pc-reward">
        <span className="civ-section-label">達成</span>
        <IconRow tokens={plannedBenefit(card)} size="sm" />
      </div>
      {zoom ? <PlannedCityZoom card={card} onClose={() => setZoom(false)} /> : null}
    </>
  );
};

export const NatureParkView = ({ card }: { card: NatureParkCard }) => (
  <>
    <div className="card-head">
      <span className="card-name">{card.name}</span>
      {card.provisional ? <span className="provisional-badge">仮</span> : null}
    </div>
    <div className="np-sets">
      {card.sets.map((set, i) => (
        <ShapeView key={i} cells={set.cells.map((c) => ({ q: c.q, r: c.r, terrain: c.terrain, text: '' }))} />
      ))}
    </div>
  </>
);
