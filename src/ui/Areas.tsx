// 共有の場（左の列、アクションボードの下）・個人の情報（右の列）・手持ち（下帯）・履歴・終了時の得点（ui_design.md 1-2、4-3、5、6-3）。

import { useState } from 'react';
import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import { BUILDINGS, SCORE_AXES, type ScoreAxis } from '../data/types.ts';
import { explain } from '../game/explain.ts';
import type { IconToken } from '../game/icons.ts';
import { abilitiesOf } from '../game/abilities.ts';
import { buildingCount, isTopUnlocked, workerSummary } from '../game/queries.ts';
import { finalScores } from '../game/scoring.ts';
import type { GameEvent, GameState, PlayerState } from '../game/types.ts';
import { ACTIONS } from '../data/types.ts';
import { ACTION_LABELS } from './ActionBoard.tsx';
import { BonusTileView, CardFrame, CivCardView, NatureParkView, PlannedCityView, ScriptView } from './Cards.tsx';
import { Icon, IconRow } from './Icon.tsx';
import { colorOf, WAITING_REASON, type UiModel } from './model.ts';
import { TrackBar, trackChanges, type Speed } from './Motion.tsx';
import { Tip } from './Tip.tsx';
import type { CellId } from '../game/board.ts';

const entry = (section: keyof typeof ICON_KEYS, key: string): { icon: string; label: string } =>
  (ICON_KEYS[section] as Readonly<Record<string, { icon: string; label: string }>>)[key] ?? { icon: `${section}.${key}`, label: key };

const tok = (section: keyof typeof ICON_KEYS, key: string, value?: number | string): IconToken => {
  const e = entry(section, key);
  return value === undefined ? { icon: e.icon, label: e.label } : { icon: e.icon, value, label: e.label };
};

type Choose = (optionId: string) => void;

// ---------------------------------------------------------------------------
// 共有の場（左半分の右寄り、5-1）
// ---------------------------------------------------------------------------

/**
 * クリックで中身を開く見出し（ユーザー決定 2026-11-05：スイーツランドに倣い、常に見える必要のないものは畳む）。
 * 中に選べるものがあるときは自動で開き（force）、閉じていても印を出す。
 */
const Fold = ({
  name,
  label,
  summary,
  force = false,
  children,
}: {
  name: string;
  label: string;
  summary?: React.ReactNode;
  force?: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(false);
  const shown = open || force;
  return (
    <section className={`panel-box fold${shown ? ' open' : ''}${force ? ' forced' : ''}`} data-fold={name}>
      <button type="button" className="fold-head" data-ui={`fold-${name}`} aria-expanded={shown} onClick={() => setOpen(!open)}>
        <span className="fold-arrow" aria-hidden="true">
          {shown ? '▾' : '▸'}
        </span>
        <span className="fold-label">{label}</span>
        {summary !== undefined ? <span className="fold-summary">{summary}</span> : null}
        {force ? <span className="fold-hint">選ぶ</span> : null}
      </button>
      {shown ? <div className="fold-body">{children}</div> : null}
    </section>
  );
};

export const SharedArea = ({
  state,
  model,
  onChoose,
  onFocus,
}: {
  state: GameState;
  model: UiModel;
  onChoose: Choose;
  onFocus?: (cell: CellId | null, player: number | null) => void;
}) => {
  const round = Math.max(1, state.round);
  const raidCard = GAME_DATA.raidCards.find((c) => c.id === state.raidOrder[round - 1]);
  const shown = state.phase !== 'draft';
  return (
    <div className="shared">
      <section className="panel-box">
        <h3>襲撃</h3>
        {shown && raidCard ? (
          <Tip text={`防衛失敗：${raidCard.on_defense_fail}／撃退成功：${raidCard.on_repel}`}>
            <div className="raid-card">
              <span>カード{raidCard.id}</span>
              <IconRow tokens={[tok('metrics', 'defenseLine', state.defenseLine), tok('metrics', 'repelLine', state.repelLine)]} size="sm" />
              <span className="muted">残り{Math.max(0, state.raidOrder.length - round)}枚</span>
            </div>
          </Tip>
        ) : (
          <span className="muted">ゲーム開始前</span>
        )}
      </section>
      <Fold
        name="bonus"
        label="ボーナスタイル"
        summary={`場に${state.bonusTilesOnBoard.length}枚`}
        force={model.choices.some((c) => c.target.kind === 'bonusTile')}
      >
        <div className="tiles">
          {state.bonusTilesOnBoard.map((id) => {
            const tile = GAME_DATA.bonusTiles.find((t) => t.id === id);
            const holder = state.players.find((p) => p.bonusTile === id);
            const option = model.find((t) => t.kind === 'bonusTile' && t.id === id);
            if (tile === undefined) return null;
            return (
              <CardFrame key={id} optionId={option?.id} onChoose={onChoose} className="tile" reason={null}>
                <BonusTileView tile={tile} />
                {holder ? <span className="worker-dot" style={{ background: colorOf(holder.index) }} /> : null}
              </CardFrame>
            );
          })}
        </div>
      </Fold>
      <Fold
        name="citizens"
        label="特別な市民カード"
        summary={`公開${state.scRevealed.length}枚`}
        force={model.choices.some((c) => c.target.kind === 'specialCitizen')}
      >
        <div className="cards-row">
          {state.scRevealed.map((id) => {
            const card = GAME_DATA.specialCitizens.find((c) => c.id === id);
            const option = model.find((t) => t.kind === 'specialCitizen' && t.id === id);
            return (
              <CardFrame key={id} optionId={option?.id} onChoose={onChoose} className="sc">
                <div className="card-head">
                  <span className="card-name">市民{id}</span>
                </div>
                {card ? <ScriptView script={card.script} /> : null}
              </CardFrame>
            );
          })}
        </div>
      </Fold>
      <Fold
        name="planned"
        label="計画都市"
        summary={`公開${state.plannedCityRevealed.length}枚`}
        force={model.choices.some((c) => c.target.kind === 'plannedCity' && state.plannedCityRevealed.includes(c.target.id))}
      >
        <div className="cards-row">
          {state.plannedCityRevealed.map((id) => {
            const card = GAME_DATA.plannedCityCards.find((c) => c.id === id);
            const option = model.find((t) => t.kind === 'plannedCity' && t.id === id);
            const claims = state.plannedCityClaims[id] ?? [];
            return (
              <CardFrame
                key={id}
                optionId={option?.id}
                onChoose={onChoose}
                className="pc"
                reason={option !== undefined ? null : model.waiting ? WAITING_REASON : explain(state, { kind: 'plannedCity', id })}
              >
                {card ? <PlannedCityView card={card} /> : null}
                <span className="claims">
                  {claims.map((p, i) => (
                    <span key={i} className="rank-marker" style={{ background: colorOf(p) }}>
                      {i + 1}
                    </span>
                  ))}
                </span>
              </CardFrame>
            );
          })}
        </div>
      </Fold>
      <Fold name="history" label="履歴" summary="直近の出来事">
        <EventLog state={state} {...(onFocus ? { onFocus } : {})} />
      </Fold>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 出来事の履歴（6-3）
// ---------------------------------------------------------------------------

const eventTokens = (e: GameEvent): IconToken[] | null => {
  switch (e.type) {
    case 'action':
      return [{ icon: `act.${e.action}`, label: ACTION_LABELS[e.action] }, tok('tiers', e.tier)];
    case 'score':
      return [tok('resources', 'points', e.points)];
    case 'tilePlaced':
      return [tok('commands', 'placeTiles'), tok('terrains', e.terrain)];
    case 'built':
      return [tok('commands', 'build'), tok('buildings', e.building)];
    case 'cardPlayed':
      return [tok('commands', 'playCard'), { icon: 'num', label: e.card, value: e.card }];
    case 'cardsDrawn':
      return [tok('resources', 'drawCivCards', e.count)];
    case 'specialCitizen':
      return [tok('resources', 'specialCitizen'), { icon: 'num', label: e.card, value: e.card }];
    case 'raid':
      return [tok('results', e.result)];
    case 'pass':
      return [{ icon: 'sym.pass', label: 'パス' }];
    case 'plannedCity':
      return [{ icon: 'pc', label: `計画都市${e.card}`, value: e.rank }];
    case 'round':
      return [{ icon: 'num', label: `第${e.round}ラウンド`, value: `第${e.round}ラウンド` }];
    default:
      return null;
  }
};

/** 出来事の履歴（6-3）。行をタップすると、その出来事で変わった盤面の要素を強調する。 */
export const EventLog = ({ state, onFocus }: { state: GameState; onFocus?: (cell: CellId | null, player: number | null) => void }) => {
  const rows = state.events
    .map((e, i) => ({ e, i, tokens: eventTokens(e) }))
    .filter((r) => r.tokens !== null)
    .slice(-14)
    .reverse();
  return (
    <section className="event-log">
      <ol>
        {rows.map(({ e, i, tokens }) => (
          <li key={i} data-ui="history-row" onClick={() => onFocus?.('cell' in e ? e.cell : null, 'player' in e ? e.player : null)}>
            {'player' in e ? <span className="worker-dot" style={{ background: colorOf(e.player) }} /> : null}
            <IconRow tokens={tokens ?? []} size="sm" />
          </li>
        ))}
      </ol>
    </section>
  );
};

// ---------------------------------------------------------------------------
// 個人の情報（右の列、ユーザー決定 2026-11-05）：キャラクターの能力・資源・生産・ワーカー・トラック・建物・最上位の解放
// ---------------------------------------------------------------------------

const InfoRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="info-row">
    <span className="info-label">{label}</span>
    <div className="info-value">{children}</div>
  </div>
);

export const PersonalInfo = ({
  player,
  isOwner,
  model,
  onChoose,
  lastEvents = [],
  speed = 'none',
}: {
  player: PlayerState;
  isOwner: boolean;
  model: UiModel;
  onChoose: Choose;
  lastEvents?: readonly GameEvent[];
  speed?: Speed;
}) => {
  const w = workerSummary(player);
  const tracks = trackChanges(lastEvents, player.index);
  const character = GAME_DATA.characters.find((c) => c.id === player.characterId);
  const options = isOwner && character
    ? model.choices.filter((c) => (c.target.kind === 'ability' || c.target.kind === 'specialSpace') && c.target.source === `char:${character.id}`)
    : [];
  return (
    <div className="status personal-info" data-info={player.index}>
      <h3 className="info-name">
        <span className="worker-dot" style={{ background: colorOf(player.index) }} />
        {player.name}
      </h3>
      {character ? (
        <AbilityCard className="character" title={character.name} options={options} onChoose={onChoose}>
          <ScriptView script={character.script} />
        </AbilityCard>
      ) : null}
      <InfoRow label="資源">
        <IconRow
          tokens={[
            tok('resources', 'gold', player.gold),
            tok('resources', 'materials', player.materials),
            tok('resources', 'militaryTokens', player.militaryTokens),
            tok('resources', 'points', player.score),
          ]}
        />
      </InfoRow>
      <InfoRow label="生産">
        <IconRow tokens={[tok('resources', 'goldProduction', player.goldProduction), tok('resources', 'materialProduction', player.materialProduction)]} />
      </InfoRow>
      <InfoRow label="ワーカー">
        <Tip text={`配置済み${w.regularPlaced}人・次ラウンドから${w.regularNextRound}人・手番中に得た臨時${w.tempLocked}人`}>
          <IconRow
            tokens={[tok('resources', 'regularWorkers', `${w.regularUsable}/${w.regularCap}`), tok('resources', 'tempWorkers', `${w.tempUsable}/${w.tempMax}`)]}
          />
        </Tip>
      </InfoRow>
      <InfoRow label="トラック">
        <TrackBar
          key={`m-${player.index}-${player.militaryLevel}`}
          track="military"
          level={player.militaryLevel}
          claimed={player.militaryRewardsClaimed}
          rose={tracks.military.rose}
          rewarded={tracks.military.rewarded}
          speed={speed}
        />
        <TrackBar
          key={`i-${player.index}-${player.infraLevel}`}
          track="infra"
          level={player.infraLevel}
          claimed={player.infraRewardsClaimed}
          rose={tracks.infra.rose}
          rewarded={tracks.infra.rewarded}
          speed={speed}
        />
      </InfoRow>
      <InfoRow label="建物">
        <IconRow
          size="sm"
          tokens={BUILDINGS.map((b) => tok('buildings', b, `${buildingCount(player, b)}/${GAME_DATA.params.buildings.limits[b]}`))}
        />
      </InfoRow>
      <InfoRow label="最上位">
        <span className="unlocks">
          {ACTIONS.map((a) => {
            const on = isTopUnlocked(GAME_DATA, player, a);
            return (
              <Tip key={a} text={`${ACTION_LABELS[a]}の最上位：${on ? '解放済み' : 'まだ使えない'}`}>
                <span className={`unlock ${on ? 'on' : 'off'}`} data-unlock={a}>
                  <Icon token={{ icon: `act.${a}`, label: ACTION_LABELS[a] }} size="sm" />
                </span>
              </Tip>
            );
          })}
        </span>
      </InfoRow>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 手持ち（下帯、5-2）
// ---------------------------------------------------------------------------

export const HandArea = ({
  state,
  player,
  isOwner,
  model,
  onChoose,
}: {
  state: GameState;
  player: PlayerState;
  isOwner: boolean;
  model: UiModel;
  onChoose: Choose;
}) => {
  const tile = GAME_DATA.bonusTiles.find((t) => t.id === player.bonusTile);
  const park = GAME_DATA.natureParkCards.find((c) => c.id === player.natureParkCard);
  const owned = abilitiesOf(GAME_DATA, player);
  const abilityOptions = (source: string) =>
    isOwner ? model.choices.filter((c) => (c.target.kind === 'ability' || c.target.kind === 'specialSpace') && c.target.source === source) : [];
  const tagCounts = new Map<string, number>();
  for (const id of player.played) {
    for (const tag of GAME_DATA.civilizationCards.find((c) => c.id === id)?.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  return (
    <div className="hand-area">
      <section className="hand">
        <h3>手札 {player.hand.length}枚</h3>
        <div className="cards-row">
          {isOwner
            ? player.hand.map((card, i) => {
                const option = model.find((t) => t.kind === 'handCard' && t.card === card);
                return (
                  <CardFrame
                    key={`${card}-${i}`}
                    optionId={option?.id}
                    onChoose={onChoose}
                    className="civ"
                    reason={model.waiting ? WAITING_REASON : explain(state, { kind: 'handCard', card })}
                    extra={{ 'data-hand-card': card, 'data-owner': String(player.index) }}
                  >
                    <CivCardView card={card} player={player} />
                  </CardFrame>
                );
              })
            : Array.from({ length: player.hand.length }, (_, i) => <div key={i} className="card card-back" />)}
        </div>
      </section>
      <section className="owned">
        <h3>タイル・市民・カード</h3>
        <div className="cards-row">
          {tile ? (
            <div className="card tile">
              <BonusTileView tile={tile} />
            </div>
          ) : null}
          {player.specialCitizens.map((id) => {
            const card = GAME_DATA.specialCitizens.find((c) => c.id === id);
            const used = owned.some((o) => o.source === `sc:${id}` && state.occupied.includes(o.key));
            return (
              <AbilityCard key={id} className="sc" title={`市民${id}${used ? '（使用済み）' : ''}`} options={abilityOptions(`sc:${id}`)} onChoose={onChoose}>
                {card ? <ScriptView script={card.script} /> : null}
              </AbilityCard>
            );
          })}
          {park ? (
            <div className="card np">
              <NatureParkView card={park} />
            </div>
          ) : null}
          {player.privatePlannedCities.map((id) => {
            const card = GAME_DATA.plannedCityCards.find((c) => c.id === id);
            const option = isOwner ? model.find((t) => t.kind === 'plannedCity' && t.id === id) : undefined;
            return card ? (
              <CardFrame key={id} optionId={option?.id} onChoose={onChoose} className="pc">
                <PlannedCityView card={card} />
              </CardFrame>
            ) : null;
          })}
        </div>
      </section>
      <section className="played">
        <h3>文明カードの山</h3>
        <IconRow tokens={[tok('resources', 'drawCivCards', `山${state.civDeck.length}`), tok('symbols', 'discard', `捨${state.civDiscard.length}`)]} size="sm" />
        <h3>プレイ済み {player.played.length}枚</h3>
        <IconRow tokens={[...tagCounts.entries()].map(([tag, n]) => tok('tags', tag, n))} size="sm" />
        <Tip text={player.played.join('・')}>
          <span className="muted small">一覧</span>
        </Tip>
      </section>
    </div>
  );
};

/** キャラクター・特別な市民カード。能力ごとに選択肢（フリーアクション・専用スペース）を出す。 */
const AbilityCard = ({
  title,
  className,
  options,
  onChoose,
  children,
}: {
  title: string;
  /** 大きさの種類。character はキャラクター（横長の一定の大きさ）、sc は特別な市民カード（カードの大きさ）。 */
  className: 'character' | 'sc';
  options: ReturnType<UiModel['choices']['filter']>;
  onChoose: Choose;
  children: React.ReactNode;
}) => (
  <div className={`card ability-card ${className}`}>
    <div className="card-head">
      <span className="card-name">{title}</span>
    </div>
    {children}
    {options.length > 0 ? (
      <div className="ability-buttons">
        {options.map((c) => (
          <button key={c.option.id} type="button" className="btn selectable" data-target={c.option.id} onClick={() => onChoose(c.option.id)}>
            {c.target.kind === 'specialSpace' ? '専用スペース' : 'フリーアクション'}
          </button>
        ))}
      </div>
    ) : null}
  </div>
);

// ---------------------------------------------------------------------------
// ドラフト（2-6）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 終了時の得点（4-3）
// ---------------------------------------------------------------------------

const AXIS_LABELS: Record<ScoreAxis, string> = {
  economy: '経済・産業',
  culture: '文化・学術',
  welfare: '生活・福祉',
  nature: '自然・環境',
  military: '軍事・防衛',
  other: 'その他',
};

export const FinalScores = ({ state, onRestart }: { state: GameState; onRestart: () => void }) => {
  const scores = finalScores(state);
  return (
    <div className="overlay" data-final="true">
      <div className="overlay-box">
        <h2>ゲーム終了</h2>
        <table className="score-table">
          <thead>
            <tr>
              <th />
              {scores.map((s) => (
                <th key={s.player} style={{ color: colorOf(s.player) }}>
                  {state.players[s.player]?.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>基礎得点</th>
              {scores.map((s) => (
                <td key={s.player}>{s.base}</td>
              ))}
            </tr>
            {SCORE_AXES.map((axis) => (
              <tr key={axis}>
                <th>{AXIS_LABELS[axis]}</th>
                {scores.map((s) => (
                  <td key={s.player}>{s.axes[axis]}</td>
                ))}
              </tr>
            ))}
            <tr className="total">
              <th>合計</th>
              {scores.map((s) => (
                <td key={s.player}>{s.total}</td>
              ))}
            </tr>
            <tr>
              <th>残った金（同点判定）</th>
              {scores.map((s) => (
                <td key={s.player}>{s.leftoverGold}</td>
              ))}
            </tr>
            <tr>
              <th>順位</th>
              {scores.map((s) => (
                <td key={s.player}>{s.rank}位</td>
              ))}
            </tr>
          </tbody>
        </table>
        <button type="button" className="btn" data-ui="restart" onClick={onRestart}>
          最初から
        </button>
      </div>
    </div>
  );
};

export { Icon };
