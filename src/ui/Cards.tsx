// カード・タイル類の表示部品。効果はアイコンと数字の並びで出し、補足は効果スクリプトから組み立てる（ui_design.md 0-1）。

import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import type { Script } from '../data/script.ts';
import type { BonusTile, PlannedCityCard, NatureParkCard } from '../data/types.ts';
import { describeScript, iconSequence, type IconToken } from '../game/icons.ts';
import { civCardCost } from '../game/queries.ts';
import type { PlayerState } from '../game/types.ts';
import { IconRow } from './Icon.tsx';
import { ShapeView } from './Board.tsx';
import { ANY_BUILDING_ART, ICON_ART, tagColor } from './icon-art.ts';
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
    // 建物の種類を指定しないマスも建物が要るため、「任意の建物」の図案を描く（rules.md 13-2-2）。
    ...(s.building === null
      ? { art: ANY_BUILDING_ART, title: '建物（種類は問わない）' }
      : { art: ICON_ART[`bld.${s.building}`] ?? '', title: entry('buildings', s.building).label }),
  }));

const plannedBenefit = (card: PlannedCityCard): IconToken[] => [
  tok('resources', card.benefit.kind === 'drawCivCards' ? 'drawCivCards' : card.benefit.kind, card.benefit.amount),
];

/**
 * カードの拡大表示の枠（ユーザー決定 2026-11-06：計画都市・自然公園の形が小さくて見づらいため）。
 * カードは選べる所作（data-target）の中にあるため、画面の最上位に描き（createPortal）、クリックは外へ伝えない。
 */
const ZoomOverlay = ({ title, provisional, onClose, children }: { title: string; provisional: boolean; onClose: () => void; children: ReactNode }) =>
  createPortal(
    <div
      className="overlay pc-zoom-overlay"
      data-ui="zoom-overlay"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="overlay-box pc-zoom" role="dialog" aria-label={`${title}の拡大`} onClick={(e) => e.stopPropagation()}>
        <div className="pc-zoom-head">
          <strong>{title}</strong>
          {provisional ? <span className="provisional-badge">仮</span> : null}
          <button type="button" className="btn small" data-ui="zoom-close" onClick={onClose}>
            閉じる
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );

/** カードの見出しの拡大ボタン。押してもカードを選ばない。 */
const ZoomButton = ({ name, kind, onOpen }: { name: string; kind: 'pc' | 'np'; onOpen: () => void }) => (
  <button
    type="button"
    className="pc-zoom-btn"
    data-ui={`${kind}-zoom`}
    aria-label={`${name}を拡大する`}
    title="拡大する"
    onClick={(e) => {
      e.stopPropagation();
      onOpen();
    }}
  >
    ⤢
  </button>
);

/** 計画都市の拡大の中身：形・達成の報酬・必要な土地と建物・回転と鏡像の扱い。 */
const PlannedCityZoom = ({ card, onClose }: { card: PlannedCityCard; onClose: () => void }) => {
  const needs = new Map<string, number>();
  for (const s of card.slots) {
    const terrain = s.terrain === null ? null : entry('terrains', s.terrain).label;
    const building = s.building === null ? null : entry('buildings', s.building).label;
    // 種類を指定しないマスにも建物が要る（rules.md 13-2-1、13-2-2）。
    const name =
      terrain !== null && building !== null
        ? `${terrain}の${building}`
        : building !== null
          ? `${building}（土地は問わない）`
          : terrain !== null
            ? `${terrain}の建物（種類は問わない）`
            : null;
    if (name !== null) needs.set(name, (needs.get(name) ?? 0) + 1);
  }
  return (
    <ZoomOverlay title={card.name} provisional={card.provisional === true} onClose={onClose}>
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
      <p className="muted small">個人ボードに、この形のとおりに建物を並べると達成を宣言できる。どのマスにも建物が要る（種類を指定しないマスは、どの建物でもよい）。回転した配置はよく、裏返した（鏡像の）配置はよくない（rules.md 13-2、19-1-6）。</p>
    </ZoomOverlay>
  );
};

export const PlannedCityView = ({ card }: { card: PlannedCityCard }) => {
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <div className="card-head">
        <span className="card-name">{card.name}</span>
        {card.provisional ? <span className="provisional-badge">仮</span> : null}
        <ZoomButton name={card.name} kind="pc" onOpen={() => setZoom(true)} />
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

/** 自然公園の土地の名前（1セット分、例：「森林2・平原1」）。 */
const parkSetText = (cells: readonly { terrain: string }[]): string => {
  const counts = new Map<string, number>();
  for (const c of cells) counts.set(c.terrain, (counts.get(c.terrain) ?? 0) + 1);
  return [...counts.entries()].map(([t, n]) => `${entry('terrains', t).label}${n}`).join('・');
};

/** 自然公園の拡大の中身：3セットの形・各セットの土地と得点・判定のきまり。 */
const NatureParkZoom = ({ card, onClose }: { card: NatureParkCard; onClose: () => void }) => {
  const points = GAME_DATA.params.scoring.natureParkPointsBySetSize;
  return (
    <ZoomOverlay title={card.name} provisional={card.provisional === true} onClose={onClose}>
      <div className="np-zoom-sets">
        {card.sets.map((set, i) => (
          <figure key={i} className="np-zoom-set">
            <div className="pc-zoom-shape">
              <ShapeView cells={set.cells.map((c) => ({ q: c.q, r: c.r, terrain: c.terrain, text: '' }))} />
            </div>
            <figcaption>
              セット{i + 1}：{parkSetText(set.cells)}（{set.cells.length}枚、{points[String(set.cells.length)] ?? 0}点）
            </figcaption>
          </figure>
        ))}
      </div>
      <p className="muted small">
        ゲーム終了時に、建物の建っていない土地タイルで、この形と土地の種類のとおりに並んでいれば、そのセットの点を得る（rules.md 14-2、14-3）。回転した配置はよく、裏返した（鏡像の）配置はよくない（19-1-5）。同じ土地タイルを2つのセットに使うことはできない。
      </p>
    </ZoomOverlay>
  );
};

export const NatureParkView = ({ card }: { card: NatureParkCard }) => {
  const [zoom, setZoom] = useState(false);
  return (
    <>
      <div className="card-head">
        <span className="card-name">{card.name}</span>
        {card.provisional ? <span className="provisional-badge">仮</span> : null}
        <ZoomButton name={card.name} kind="np" onOpen={() => setZoom(true)} />
      </div>
      <div className="np-sets">
        {card.sets.map((set, i) => (
          <ShapeView key={i} cells={set.cells.map((c) => ({ q: c.q, r: c.r, terrain: c.terrain, text: '' }))} />
        ))}
      </div>
      {zoom ? <NatureParkZoom card={card} onClose={() => setZoom(false)} /> : null}
    </>
  );
};
