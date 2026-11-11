// 演出（ui_design.md 4節）。出来事（GameState.events）だけを見て組み立て、状態の差分から推測しない。
// - 増減のまとめ（4-1）：選択1つの処理で変わった資源・得点を、資源ごとに合算して1回だけ出す。
// - トラック（4-1）：軍事・インフラを1段ずつ動かし、到達報酬の段を一度強調する。
// - ラウンドの区切り（4-3）：前のラウンドの襲撃の結果と、ラウンド開始時の増減を1画面で見せる。

import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import type { IconToken } from '../game/icons.ts';
import type { GameEvent, GameState } from '../game/types.ts';
import type { Grant } from '../data/types.ts';
import { grantTokens } from './Cards.tsx';
import { IconRow } from './Icon.tsx';
import { grantText } from '../game/queries.ts';
import { colorOf } from './model.ts';
import { Tip } from './Tip.tsx';

export type Speed = 'standard' | 'fast' | 'none';

/** 1つの出来事の長さ（4-2：250〜400ms）。 */
export const STEP_MS: Record<Speed, number> = { standard: 300, fast: 120, none: 0 };

const DELTA_ICON: Record<string, { section: keyof typeof ICON_KEYS; key: string }> = {
  gold: { section: 'resources', key: 'gold' },
  materials: { section: 'resources', key: 'materials' },
  militaryTokens: { section: 'resources', key: 'militaryTokens' },
  goldProduction: { section: 'resources', key: 'goldProduction' },
  materialProduction: { section: 'resources', key: 'materialProduction' },
  regularWorkers: { section: 'resources', key: 'regularWorkers' },
  tempWorkers: { section: 'resources', key: 'tempWorkers' },
  militaryLevel: { section: 'tracks', key: 'military' },
  infraLevel: { section: 'tracks', key: 'infra' },
  hand: { section: 'resources', key: 'drawCivCards' },
  score: { section: 'resources', key: 'points' },
};

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

/** 増減の出来事を合算する。cause を指定すればその処理の分だけ。 */
export const sumDeltas = (events: readonly GameEvent[], player: number, causes?: readonly string[]): Record<string, number> => {
  const total: Record<string, number> = {};
  for (const e of events) {
    if (e.type !== 'delta' || e.player !== player) continue;
    if (causes !== undefined && !causes.includes(e.cause)) continue;
    for (const [key, value] of Object.entries(e.changes)) total[key] = (total[key] ?? 0) + (value ?? 0);
  }
  return total;
};

export const deltaTokens = (changes: Record<string, number>): IconToken[] =>
  Object.entries(changes)
    .filter(([, v]) => v !== 0)
    .map(([key, value]) => {
      const ref = DELTA_ICON[key];
      const entry = ref ? (ICON_KEYS[ref.section] as Readonly<Record<string, { icon: string; label: string }>>)[ref.key] : undefined;
      return { icon: entry?.icon ?? key, label: entry?.label ?? key, value: signed(value) };
    });

/** 増減のまとめ（「−5 金　＋2 資材　＋3 点」）。 */
export const DeltaChips = ({ changes, speed }: { changes: Record<string, number>; speed: Speed }) => {
  const tokens = deltaTokens(changes);
  if (tokens.length === 0) return null;
  return (
    <div className={`delta-chips anim-${speed}`} data-ui="delta">
      <IconRow tokens={tokens} size="sm" />
    </div>
  );
};

/** 軍事・インフラのトラック。上がった段を1段ずつ動かし、到達報酬の段を強調する。 */

export const TrackBar = ({
  track,
  level,
  claimed,
  rose,
  rewarded,
  speed,
}: {
  track: 'military' | 'infra';
  level: number;
  claimed: readonly number[];
  /** この選択で上がった段数（出来事から）。 */
  rose: number;
  /** この選択で得た到達報酬のレベル。 */
  rewarded: readonly number[];
  speed: Speed;
}) => {
  const table = track === 'military' ? GAME_DATA.params.military : GAME_DATA.params.infra;
  const rewardAt = new Map(table.rewards.map((r) => [r.level, r]));
  const name = track === 'military' ? '軍事レベル' : 'インフラレベル';
  const from = level - rose;
  const next = table.rewards.find((r) => r.level > level && !claimed.includes(r.level));
  const overflow = table.overflowPointsPerRaise;
  const levels = Array.from({ length: table.max }, (_, i) => i + 1);
  return (
    <div className={`track track-${track}`} data-track={track}>
      <div className="track-head">
        <span className="track-label">{name}</span>
        <b className="track-level">{level}</b>
        <span className="track-max">／{table.max}</span>
        <span className="track-next">
          {next !== undefined
            ? `次の報酬：${next.level}で${next.grants.map(grantText).join('・')}（あと${next.level - level}）`
            : overflow > 0 && level >= table.max
              ? `報酬はすべて獲得。${track === 'military' ? '教練で' : ''}${table.max}を超えて上げると1段につき${overflow}点`
              : '報酬はすべて獲得'}
        </span>
      </div>
      <div className="track-grid" style={{ gridTemplateColumns: `repeat(${table.max}, minmax(0, 1fr))` }}>
        {levels.map((l) => {
          const filled = l <= level;
          const stepping = rose > 0 && l > from && l <= level;
          const delay = stepping ? (l - from - 1) * STEP_MS[speed] : 0;
          const classes = [
            'track-cell',
            filled ? 'filled' : '',
            rewardAt.has(l) ? 'reward' : '',
            claimed.includes(l) ? 'claimed' : '',
            stepping && speed !== 'none' ? 'stepping' : '',
            rewarded.includes(l) && speed !== 'none' ? 'flash' : '',
          ].join(' ');
          return (
            <span key={l} className={classes} style={stepping ? { animationDelay: `${delay}ms` } : undefined} title={`${name}${l}`}>
              {l}
            </span>
          );
        })}
        {levels.map((l) => {
          const reward = rewardAt.get(l);
          if (reward === undefined) return <span key={`r${l}`} className="track-reward-slot" />;
          const got = claimed.includes(l);
          const state = got ? '獲得済み' : next?.level === l ? '次の報酬' : '未到達';
          return (
            <Tip key={`r${l}`} text={`${name}${l}の到達報酬：${reward.grants.map(grantText).join('・')}（${state}）`}>
              <span className={`track-reward${got ? ' got' : ''}${next?.level === l ? ' next' : ''}`} data-reward={l}>
                <IconRow tokens={reward.grants.flatMap(grantTokens)} size="sm" />
                {got ? <span className="track-check" aria-label="獲得済み">✓</span> : null}
              </span>
            </Tip>
          );
        })}
      </div>
    </div>
  );
};

/** 選択1つで得たトラックの上昇と到達報酬（出来事から）。 */
export const trackChanges = (
  events: readonly GameEvent[],
  player: number,
): { military: { rose: number; rewarded: number[] }; infra: { rose: number; rewarded: number[] } } => {
  const sum = sumDeltas(events, player);
  const rewarded = (track: 'military' | 'infra') =>
    events.flatMap((e) => (e.type === 'levelReward' && e.player === player && e.track === track ? [e.level] : []));
  return {
    military: { rose: Math.max(0, sum['militaryLevel'] ?? 0), rewarded: rewarded('military') },
    infra: { rose: Math.max(0, sum['infraLevel'] ?? 0), rewarded: rewarded('infra') },
  };
};

const RESULT_LABEL: Record<string, string> = { defenseFailed: '防衛失敗', defended: '防衛成功', repelled: '撃退成功' };
const DECLARED_LABEL: Record<string, string> = { none: '宣言なし', defense: '防衛ライン', repel: '撃退ライン' };

/**
 * ラウンドの区切り（4-3）。新しいラウンドの開始の出来事から、前のラウンドの襲撃の結果と、
 * ラウンド開始時（ボーナスタイル・収入）の増減を組み立てる。
 */
export const RoundSummary = ({ state, round, onClose }: { state: GameState; round: number; onClose: () => void }) => {
  const starts = state.events.map((e, i) => (e.type === 'round' ? i : -1)).filter((i) => i >= 0);
  const current = starts[starts.length - 1] ?? 0;
  const previous = starts[starts.length - 2] ?? -1;
  const raidEvents = previous >= 0 ? state.events.slice(previous, current) : [];
  const startEvents = state.events.slice(current);
  const raidCard = GAME_DATA.raidCards.find((c) => c.id === state.raidOrder[round - 1]);
  return (
    <div className="overlay" data-ui="round-summary" onClick={onClose}>
      <div className="overlay-box round-summary" onClick={(e) => e.stopPropagation()}>
        <h2>第{round}ラウンド</h2>
        <p className="muted">
          襲撃カード{raidCard?.id}：防衛ライン {state.defenseLine}・撃退ライン {state.repelLine}
        </p>
        <table className="score-table">
          <thead>
            <tr>
              <th />
              {round > 1 ? <th>前のラウンドの襲撃</th> : null}
              <th>ラウンド開始（ボーナスタイル・収入）</th>
            </tr>
          </thead>
          <tbody>
            {state.turnOrder.map((p) => {
              const raid = raidEvents.find((e) => e.type === 'raid' && e.player === p);
              const raidPoints = raidEvents
                .filter((e) => e.type === 'score' && e.player === p && e.source.startsWith('raid'))
                .reduce((sum, e) => sum + (e.type === 'score' ? e.points : 0), 0);
              return (
                <tr key={p}>
                  <th style={{ color: colorOf(p) }}>{state.players[p]?.name}</th>
                  {round > 1 ? (
                    <td>
                      {raid?.type === 'raid' ? `${DECLARED_LABEL[raid.declared]}・${RESULT_LABEL[raid.result]}` : '—'}
                      {raidPoints !== 0 ? `（${signed(raidPoints)}点）` : ''}
                    </td>
                  ) : null}
                  <td>
                    <IconRow tokens={deltaTokens(sumDeltas(startEvents, p, ['bonusTileStart', 'income']))} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button type="button" className="btn primary" data-ui="close-summary" onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
};
