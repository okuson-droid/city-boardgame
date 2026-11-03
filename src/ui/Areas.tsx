// 共有の場（右列）・個人の資源（中央の下）・手持ち（下帯）・履歴・ドラフト・終了時の得点（ui_design.md 1-2、4-3、5、6-3）。

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
import { colorOf, type UiModel } from './model.ts';
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
// 共有の場（右列、5-1）
// ---------------------------------------------------------------------------

export const SharedArea = ({ state, model, onChoose }: { state: GameState; model: UiModel; onChoose: Choose }) => {
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
      <section className="panel-box">
        <h3>ボーナスタイル</h3>
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
      </section>
      <section className="panel-box">
        <h3>特別な市民カード</h3>
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
      </section>
      <section className="panel-box">
        <h3>計画都市</h3>
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
                reason={option === undefined ? explain(state, { kind: 'plannedCity', id }) : null}
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
      </section>
      <section className="panel-box">
        <h3>文明カード</h3>
        <IconRow tokens={[tok('resources', 'drawCivCards', `山${state.civDeck.length}`), tok('symbols', 'pay', `捨${state.civDiscard.length}`)]} size="sm" />
      </section>
      <EventLog state={state} />
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
      return [tok('commands', 'playCard'), { icon: 'card', label: e.card, value: e.card }];
    case 'cardsDrawn':
      return [tok('resources', 'drawCivCards', e.count)];
    case 'specialCitizen':
      return [tok('resources', 'specialCitizen'), { icon: 'card', label: e.card, value: e.card }];
    case 'raid':
      return [tok('results', e.result)];
    case 'pass':
      return [{ icon: 'pass', label: 'パス' }];
    case 'plannedCity':
      return [{ icon: 'pc', label: `計画都市${e.card}`, value: e.rank }];
    case 'round':
      return [{ icon: 'round', label: `第${e.round}ラウンド`, value: e.round }];
    default:
      return null;
  }
};

export const EventLog = ({ state, onFocus }: { state: GameState; onFocus?: (cell: CellId | null) => void }) => {
  const rows = state.events
    .map((e, i) => ({ e, i, tokens: eventTokens(e) }))
    .filter((r) => r.tokens !== null)
    .slice(-14)
    .reverse();
  return (
    <section className="panel-box event-log">
      <h3>履歴</h3>
      <ol>
        {rows.map(({ e, i, tokens }) => (
          <li key={i} onClick={() => onFocus?.('cell' in e ? e.cell : null)}>
            {'player' in e ? <span className="worker-dot" style={{ background: colorOf(e.player) }} /> : null}
            <IconRow tokens={tokens ?? []} size="sm" />
          </li>
        ))}
      </ol>
    </section>
  );
};

// ---------------------------------------------------------------------------
// 個人の資源とトラック（5-2）
// ---------------------------------------------------------------------------

const trackMarks = (levels: readonly number[], claimed: readonly number[]): string =>
  levels.map((l) => (claimed.includes(l) ? `●${l}` : `○${l}`)).join(' ');

export const PlayerStatus = ({ player }: { player: PlayerState }) => {
  const w = workerSummary(player);
  return (
    <div className="status">
      <IconRow
        tokens={[
          tok('resources', 'gold', player.gold),
          tok('resources', 'materials', player.materials),
          tok('resources', 'militaryTokens', player.militaryTokens),
          tok('resources', 'goldProduction', player.goldProduction),
          tok('resources', 'materialProduction', player.materialProduction),
          tok('resources', 'points', player.score),
        ]}
      />
      <IconRow
        tokens={[
          tok('resources', 'regularWorkers', `${w.regularUsable}/${w.regularCap}`),
          tok('resources', 'tempWorkers', `${w.tempUsable}/${w.tempMax}`),
          tok('tracks', 'military', player.militaryLevel),
          tok('tracks', 'infra', player.infraLevel),
        ]}
      />
      <Tip text={`配置済み${w.regularPlaced}人・次ラウンドから${w.regularNextRound}人・手番中に得た臨時${w.tempLocked}人`}>
        <span className="muted small">
          軍事 {trackMarks(GAME_DATA.params.military.rewards.map((r) => r.level), player.militaryRewardsClaimed)}／インフラ{' '}
          {trackMarks(GAME_DATA.params.infra.rewards.map((r) => r.level), player.infraRewardsClaimed)}
        </span>
      </Tip>
      <IconRow
        size="sm"
        tokens={BUILDINGS.map((b) => tok('buildings', b, `${buildingCount(player, b)}/${GAME_DATA.params.buildings.limits[b]}`))}
      />
      <span className="unlocks">
        {ACTIONS.map((a) => (
          <span key={a} className={`unlock ${isTopUnlocked(GAME_DATA, player, a) ? 'on' : 'off'}`}>
            {ACTION_LABELS[a].slice(0, 1)}
          </span>
        ))}
      </span>
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
  const character = GAME_DATA.characters.find((c) => c.id === player.characterId);
  const tile = GAME_DATA.bonusTiles.find((t) => t.id === player.bonusTile);
  const park = GAME_DATA.natureParkCards.find((c) => c.id === player.natureParkCard);
  const owned = abilitiesOf(GAME_DATA, player);
  const abilityOption = (source: string) =>
    isOwner
      ? model.find((t) => (t.kind === 'ability' || t.kind === 'specialSpace') && t.source === source)
      : undefined;
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
                    reason={explain(state, { kind: 'handCard', card })}
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
        <h3>キャラクター・タイル・市民</h3>
        <div className="cards-row">
          {character ? (
            <AbilityCard
              title={character.name}
              options={abilityOptions(`char:${character.id}`)}
              fallback={abilityOption(`char:${character.id}`)?.id}
              onChoose={onChoose}
            >
              <ScriptView script={character.script} />
            </AbilityCard>
          ) : null}
          {tile ? (
            <div className="card tile">
              <BonusTileView tile={tile} />
            </div>
          ) : null}
          {player.specialCitizens.map((id) => {
            const card = GAME_DATA.specialCitizens.find((c) => c.id === id);
            const used = owned.some((o) => o.source === `sc:${id}` && state.occupied.includes(o.key));
            return (
              <AbilityCard key={id} title={`市民${id}${used ? '（使用済み）' : ''}`} options={abilityOptions(`sc:${id}`)} onChoose={onChoose}>
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
  options,
  onChoose,
  children,
}: {
  title: string;
  options: ReturnType<UiModel['choices']['filter']>;
  fallback?: string | undefined;
  onChoose: Choose;
  children: React.ReactNode;
}) => (
  <div className="card ability-card">
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

export const DraftView = ({ state, model, onChoose }: { state: GameState; model: UiModel; onChoose: Choose }) => {
  const opt = (group: 'board' | 'bonus' | 'character', id: string) =>
    model.find((t) => t.kind === 'draft' && t.group === group && t.id === id)?.id;
  const reason = (group: 'board' | 'bonus' | 'character', id: string) => explain(state, { kind: 'draft', group, id });
  return (
    <div className="draft">
      <section>
        <h3>個人ボード</h3>
        <div className="cards-row">
          {state.draftPool.boards.map((id) => (
            <CardFrame key={id} optionId={opt('board', id)} onChoose={onChoose} reason={reason('board', id)} className="draft-board">
              <span className="card-name">{GAME_DATA.boards.find((b) => b.id === id)?.name}</span>
              <MiniBoard boardId={id} />
            </CardFrame>
          ))}
        </div>
      </section>
      <section>
        <h3>ボーナスタイル</h3>
        <div className="cards-row">
          {state.draftPool.bonusTiles.map((id) => {
            const tile = GAME_DATA.bonusTiles.find((t) => t.id === id);
            return tile ? (
              <CardFrame key={id} optionId={opt('bonus', String(id))} onChoose={onChoose} reason={reason('bonus', String(id))} className="tile">
                <BonusTileView tile={tile} />
              </CardFrame>
            ) : null;
          })}
        </div>
      </section>
      <section>
        <h3>キャラクター</h3>
        <div className="cards-row">
          {state.draftPool.characters.map((id) => {
            const c = GAME_DATA.characters.find((x) => x.id === id);
            return c ? (
              <CardFrame key={id} optionId={opt('character', id)} onChoose={onChoose} reason={reason('character', id)} className="character">
                <span className="card-name">{c.name}</span>
                <ScriptView script={c.script} />
              </CardFrame>
            ) : null;
          })}
        </div>
      </section>
    </div>
  );
};

const MiniBoard = ({ boardId }: { boardId: string }) => {
  const board = GAME_DATA.boards.find((b) => b.id === boardId);
  if (!board) return null;
  const counts = new Map<string, number>();
  for (const sq of Object.values(board.squares)) {
    if (sq?.bonus) counts.set(sq.bonus.kind, (counts.get(sq.bonus.kind) ?? 0) + 1);
  }
  return <IconRow tokens={[...counts.entries()].map(([k, n]) => tok('resources', k, n))} size="sm" />;
};

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
