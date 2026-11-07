// 一覧（ユーザー決定 2026-11-06：トップページからカード一覧・キャラクター一覧・ボード一覧に飛べるようにする）。
// カードは種類ごと（文明カード・特別な市民カード・計画都市・自然公園・ボーナスタイル・襲撃カード）に、ゲーム画面と同じ
// カードの面と原本の文言を並べる。キャラクターは効果のアイコンと文言、ボードは地図とマスボーナスの合計を並べる。
// ゲームを進めない要素のため、ボタンには data-ui を付ける。

import { useState } from 'react';
import { GAME_DATA } from '../data/index.ts';
import { BoardMap } from './Board.tsx';
import { BonusTileView, CivCardView, NatureParkView, PlannedCityView, ScriptView } from './Cards.tsx';
import { bonusTotals } from './DraftScreen.tsx';
import { describeRaidOutcomes } from '../game/queries.ts';
import { IconRow } from './Icon.tsx';

export type CatalogView = 'cards' | 'characters' | 'boards';
type CardKind = 'civ' | 'citizen' | 'planned' | 'park' | 'bonus' | 'raid';

const VIEW_LABELS: Record<CatalogView, string> = { cards: 'カード一覧', characters: 'キャラクター一覧', boards: 'ボード一覧' };
const CARD_KINDS: readonly CardKind[] = ['civ', 'citizen', 'planned', 'park', 'bonus', 'raid'];
const CARD_LABELS: Record<CardKind, string> = {
  civ: '文明カード',
  citizen: '特別な市民カード',
  planned: '計画都市',
  park: '自然公園',
  bonus: 'ボーナスタイル',
  raid: '襲撃カード',
};

const countOf = (kind: CardKind): number =>
  kind === 'civ'
    ? GAME_DATA.civilizationCards.length
    : kind === 'citizen'
      ? GAME_DATA.specialCitizens.length
      : kind === 'planned'
        ? GAME_DATA.plannedCityCards.length
        : kind === 'park'
          ? GAME_DATA.natureParkCards.length
          : kind === 'bonus'
            ? GAME_DATA.bonusTiles.length
            : GAME_DATA.raidCards.length;

/** カード1枚と、その横の文言。 */
const Item = ({ card, children }: { card?: React.ReactNode; children?: React.ReactNode }) => (
  <article className="catalog-item">
    {card !== undefined ? <div className="catalog-card">{card}</div> : null}
    {children !== undefined ? <div className="catalog-text">{children}</div> : null}
  </article>
);

const includes = (q: string, ...texts: (string | null | undefined)[]): boolean => q === '' || texts.some((t) => (t ?? '').includes(q));

const CardList = ({ kind, q }: { kind: CardKind; q: string }) => {
  if (kind === 'civ') {
    return (
      <>
        {GAME_DATA.civilizationCards
          .filter((c) => includes(q, c.name, c.text, c.id))
          .map((c) => (
            <Item
              key={c.id}
              card={
                <div className="card civ">
                  <CivCardView card={c.id} player={null} />
                </div>
              }
            >
              <p className="catalog-name">{c.name}</p>
              <p>{c.text}</p>
              {c.playCondition !== null ? <p className="muted small">プレイ条件：{c.playCondition}</p> : null}
              {c.effectCondition !== null ? <p className="muted small">効果適用条件：{c.effectCondition}</p> : null}
            </Item>
          ))}
      </>
    );
  }
  if (kind === 'citizen') {
    return (
      <>
        {GAME_DATA.specialCitizens
          .filter((c) => includes(q, c.id, ...c.effects.map((e) => e.text)))
          .map((c) => (
            <Item
              key={c.id}
              card={
                <div className="card sc">
                  <div className="card-head">
                    <span className="card-name">市民{c.id}</span>
                    {c.provisional ? <span className="provisional-badge">仮</span> : null}
                  </div>
                  <ScriptView script={c.script} />
                </div>
              }
            >
              <p className="catalog-name">特別な市民カード {c.id}</p>
              {c.effects.map((e, i) => (
                <p key={i}>
                  <b>{e.timing}</b>：{e.text}
                </p>
              ))}
            </Item>
          ))}
      </>
    );
  }
  if (kind === 'planned') {
    return (
      <>
        {GAME_DATA.plannedCityCards
          .filter((c) => includes(q, c.name, c.shape))
          .map((c) => (
            <Item
              key={c.id}
              card={
                <div className="card pc">
                  <PlannedCityView card={c} />
                </div>
              }
            >
              <p className="catalog-name">{c.name}</p>
              <p>形：{c.shape}</p>
            </Item>
          ))}
      </>
    );
  }
  if (kind === 'park') {
    return (
      <>
        {GAME_DATA.natureParkCards
          .filter((c) => includes(q, c.name))
          .map((c) => (
            <Item
              key={c.id}
              card={
                <div className="card np">
                  <NatureParkView card={c} />
                </div>
              }
            >
              <p className="catalog-name">{c.name}</p>
              <p>形の組 {c.sets.length}つ</p>
            </Item>
          ))}
      </>
    );
  }
  if (kind === 'bonus') {
    return (
      <>
        {GAME_DATA.bonusTiles
          .filter((t) => includes(q, String(t.id), t.text))
          .map((t) => (
            <Item
              key={t.id}
              card={
                <div className="card tile">
                  <BonusTileView tile={t} />
                </div>
              }
            >
              <p className="catalog-name">ボーナスタイル {t.id}番</p>
              <p>{t.text}</p>
            </Item>
          ))}
      </>
    );
  }
  return (
    <>
      {GAME_DATA.raidCards
        .filter((r) => includes(q, String(r.id), r.on_defense_fail, r.on_repel))
        .map((r) => (
          <Item key={r.id}>
            <p className="catalog-name">
              襲撃カード {r.id}
              {r.provisional ? <span className="provisional-badge">仮</span> : null}
            </p>
            <p>
              防衛ライン＋{r.defense_increase}・撃退ライン＋{r.repel_increase}
            </p>
            <p>
              <b>防衛失敗</b>：{r.on_defense_fail}
            </p>
            <p>
              <b>撃退成功</b>：{r.on_repel}
            </p>
            {/* 結果ごとに適用する効果を変えた（ユーザー決定 2026-11-07）。原本の文言に添えて、実際に起きることを示す。 */}
            <p className="muted small">実際の処理（調整後）</p>
            <ul className="char-changes">
              <li>
                <b>防衛失敗</b>：{describeRaidOutcomes(r).defenseFailed}
              </li>
              <li>
                <b>防衛成功</b>：{describeRaidOutcomes(r).defended}
              </li>
              <li>
                <b>撃退成功</b>：{describeRaidOutcomes(r).repelled}
              </li>
            </ul>
          </Item>
        ))}
    </>
  );
};

const CharacterList = ({ q }: { q: string }) => (
  <>
    {GAME_DATA.characters
      .filter((c) => includes(q, c.name, c.label, c.axis, ...c.effects.map((e) => e.text)))
      .map((c) => (
        <Item
          key={c.id}
          card={
            <div className="card character">
              <div className="card-head">
                <span className="card-name">{c.name}</span>
                {c.provisional ? <span className="provisional-badge">仮</span> : null}
              </div>
              <ScriptView script={c.script} />
            </div>
          }
        >
          <p className="catalog-name">{c.name}</p>
          <p className="muted small">
            型：{c.label}／評価軸：{c.axis}
          </p>
          {c.initial_bonus.length > 0 ? <p>初期ボーナス：{c.initial_bonus.join('・')}</p> : null}
          <ul className="catalog-effects">
            {c.effects.map((e, i) => (
              <li key={i}>
                {e.text}
                {e.items && e.items.length > 0 ? (
                  <ul>
                    {e.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          {c.changes && c.changes.length > 0 ? (
            <ul className="char-changes">
              {c.changes.map((text, i) => (
                <li key={i}>
                  <b>変更</b>：{text}
                </li>
              ))}
            </ul>
          ) : null}
        </Item>
      ))}
  </>
);

const BoardList = () => (
  <>
    {GAME_DATA.boards.map((b) => (
      <article key={b.id} className="catalog-board">
        <p className="catalog-name">
          {b.name}
          {b.provisional ? <span className="provisional-badge">仮</span> : null}
        </p>
        <BoardMap boardId={b.id} />
        <div className="draft-board-foot">
          <span className="muted small">マスボーナス計</span>
          <IconRow tokens={bonusTotals(b.id)} size="sm" />
        </div>
      </article>
    ))}
  </>
);

export const Catalog = ({ initial, onClose }: { initial: CatalogView; onClose: () => void }) => {
  const [view, setView] = useState<CatalogView>(initial);
  const [kind, setKind] = useState<CardKind>('civ');
  const [filter, setFilter] = useState('');
  const q = filter.trim();
  return (
    <div className="overlay" data-ui="catalog-overlay" onClick={onClose}>
      <div className="overlay-box catalog" role="dialog" aria-label={VIEW_LABELS[view]} onClick={(e) => e.stopPropagation()}>
        <div className="catalog-head">
          <nav className="catalog-tabs" role="tablist">
            {(Object.keys(VIEW_LABELS) as CatalogView[]).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                className={`btn${view === v ? ' active' : ''}`}
                data-ui={`catalog-${v}`}
                onClick={() => setView(v)}
              >
                {VIEW_LABELS[v]}
              </button>
            ))}
          </nav>
          {view !== 'boards' ? <input data-ui="catalog-filter" placeholder="語で絞り込む" value={filter} onChange={(e) => setFilter(e.target.value)} /> : null}
          <button type="button" className="btn" data-ui="catalog-close" onClick={onClose}>
            閉じる
          </button>
        </div>
        {view === 'cards' ? (
          <nav className="catalog-kinds">
            {CARD_KINDS.map((k) => (
              <button key={k} type="button" className={`btn small${kind === k ? ' active' : ''}`} data-ui={`catalog-kind-${k}`} onClick={() => setKind(k)}>
                {CARD_LABELS[k]}（{countOf(k)}）
              </button>
            ))}
          </nav>
        ) : null}
        <div className={`catalog-grid catalog-grid-${view === 'cards' ? kind : view}`}>
          {view === 'cards' ? <CardList kind={kind} q={q} /> : view === 'characters' ? <CharacterList q={q} /> : <BoardList />}
        </div>
      </div>
    </div>
  );
};
