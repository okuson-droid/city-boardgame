// 早見表（ユーザー決定 2026-11-07：プレイ中に建物の効果や遠征の報酬などを、ルール解説を開かずに確かめられるようにする）。
// 上部の「早見表」から開く。内容はすべて params.json から組み立て（queries.ts）、表示中のプレイヤーに効く値を強調する。
// ルール解説は手順と例外の読み物、早見表は数値を引く辞書として分ける。ゲームを進めない要素のため data-ui を付ける。

import { useEffect, useState } from 'react';
import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import { ACTIONS, TIERS, type Building, type Tier } from '../data/types.ts';
import type { IconToken } from '../game/icons.ts';
import {
  ALL_BUILDINGS,
  actionLabel,
  actionSpaceIcons,
  buildingInfo,
  describeActionSpace,
  describeRaidOutcomes,
  expeditionRows,
  grantText,
  isTopUnlocked,
  ownedCount,
  unlockText,
} from '../game/queries.ts';
import { finalScores } from '../game/scoring.ts';
import type { GameState, PlayerState } from '../game/types.ts';
import { Icon, IconRow } from './Icon.tsx';

type Tab = 'buildings' | 'actions' | 'expedition' | 'tracks' | 'raid' | 'free' | 'scoring';

const TAB_LABELS: Record<Tab, string> = {
  buildings: '建物',
  actions: 'アクション',
  expedition: '遠征の報酬',
  tracks: '軍事・インフラ',
  raid: '襲撃',
  free: 'フリーアクション',
  scoring: '終了時の得点',
};

const tok = (section: keyof typeof ICON_KEYS, key: string, value?: number | string): IconToken => {
  const e = (ICON_KEYS[section] as Readonly<Record<string, { icon: string; label: string }>>)[key] ?? { icon: `${section}.${key}`, label: key };
  return value === undefined ? { icon: e.icon, label: e.label } : { icon: e.icon, value, label: e.label };
};

const tierLabel = (tier: Tier): string => (ICON_KEYS.tiers as Readonly<Record<string, { label: string }>>)[tier]?.label ?? tier;

/** 建物の数を添字とする表を、表示中のプレイヤーの軒数の欄を強調して並べる。 */
const CountTable = ({ head, values, owned, unit }: { head: string; values: readonly (number | string)[]; owned: number | null; unit: string }) => (
  <table className="qr-count">
    <tbody>
      <tr>
        <th>{head}</th>
        {values.map((_, i) => (
          <th key={i} className={owned === i ? 'qr-now' : ''}>
            {i}軒
          </th>
        ))}
      </tr>
      <tr>
        <td>{unit}</td>
        {values.map((v, i) => (
          <td key={i} className={owned === i ? 'qr-now' : ''}>
            {v}
          </td>
        ))}
      </tr>
    </tbody>
  </table>
);

const BuildingsTab = ({ player }: { player: PlayerState | null }) => (
  <table className="qr-table">
    <thead>
      <tr>
        <th>建物</th>
        <th>コスト</th>
        <th>建設時</th>
        <th>常に</th>
        <th>地形ボーナス・解放・終了時</th>
      </tr>
    </thead>
    <tbody>
      {ALL_BUILDINGS.map((b: Building) => {
        const i = buildingInfo(b);
        return (
          <tr key={b} data-building={b}>
            <td className="qr-name">
              <Icon token={tok('buildings', b)} />
              <span>
                <b>{i.name}</b>
                <br />
                <span className="muted small">
                  {player !== null ? `所持 ${ownedCount(player, b)}／` : '上限 '}
                  {i.limit}軒
                </span>
              </span>
            </td>
            <td>
              <IconRow tokens={[tok('resources', 'gold', i.cost.gold), tok('resources', 'materials', i.cost.materials)]} size="sm" />
            </td>
            <td>{i.onBuild.length > 0 ? i.onBuild.join('、') : 'なし'}</td>
            <td>{i.always.join('。')}</td>
            <td>
              {[...i.terrainBonus.map((t) => `地形ボーナス（${t}）`), ...i.unlocks, ...(i.endScore !== null ? [`終了時の${i.endScore}`] : [])].map((t, k) => (
                <div key={k}>{t}</div>
              ))}
            </td>
          </tr>
        );
      })}
    </tbody>
  </table>
);

const ActionsTab = ({ player }: { player: PlayerState | null }) => (
  <table className="qr-table qr-actions">
    <thead>
      <tr>
        <th>アクション</th>
        {TIERS.map((t) => (
          <th key={t}>
            {tierLabel(t)}・{GAME_DATA.params.actions.workerCost[t]}人
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {ACTIONS.map((a) => {
        const unlocked = player !== null && isTopUnlocked(GAME_DATA, player, a);
        return (
          <tr key={a} data-action={a}>
            <td className="qr-name">
              <Icon token={{ icon: `act.${a}`, label: actionLabel(a) }} />
              <b>{actionLabel(a)}</b>
            </td>
            {TIERS.map((t) => (
              <td key={t}>
                <IconRow tokens={actionSpaceIcons(a, t)} size="sm" />
                <div className="small">{describeActionSpace(a, t)}</div>
                {t === 'top' ? (
                  <div className={`small qr-unlock${unlocked ? ' qr-now' : ''}`}>
                    解放：{unlockText(GAME_DATA.params.actions.unlockTop[a])}
                    {unlocked ? '（解放済み ✓）' : ''}
                  </div>
                ) : null}
              </td>
            ))}
          </tr>
        );
      })}
    </tbody>
  </table>
);

const ExpeditionTab = ({ player }: { player: PlayerState | null }) => (
  <div className="qr-stack">
    <table className="qr-table">
      <thead>
        <tr>
          <th>軍事レベル</th>
          <th>報酬</th>
        </tr>
      </thead>
      <tbody>
        {expeditionRows(player).map((r, i) => (
          <tr key={i} className={r.reachable ? 'qr-now' : ''}>
            <td>レベル{r.level}</td>
            <td>
              {r.text}
              {r.extra ? <span className="muted small">（キャラクターの追加報酬）</span> : null}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <ul className="qr-notes">
      {TIERS.map((t) => (
        <li key={t}>
          <b>{tierLabel(t)}</b>：{describeActionSpace('expedition', t)}
        </li>
      ))}
      <li>選んだ報酬の最も高いレベルが軍事レベルを超えるときは、差の分だけ軍事力トークンを払う。</li>
      {player !== null ? <li>色の付いた行は、いまの軍事レベル（{player.militaryLevel}）でトークンを払わずに届く報酬。</li> : null}
    </ul>
  </div>
);

const TrackList = ({ track, player }: { track: 'military' | 'infra'; player: PlayerState | null }) => {
  const table = track === 'military' ? GAME_DATA.params.military : GAME_DATA.params.infra;
  const level = player === null ? null : track === 'military' ? player.militaryLevel : player.infraLevel;
  const claimed = player === null ? [] : track === 'military' ? player.militaryRewardsClaimed : player.infraRewardsClaimed;
  return (
    <section>
      <h3>
        {track === 'military' ? '軍事レベル' : 'インフラレベル'}（0〜{table.max}）{level !== null ? `：いま ${level}` : ''}
      </h3>
      <table className="qr-table">
        <tbody>
          {table.rewards.map((r) => (
            <tr key={r.level} className={claimed.includes(r.level) ? 'qr-done' : ''}>
              <td>レベル{r.level}</td>
              <td>
                {r.grants.map(grantText).join('・')}
                {claimed.includes(r.level) ? ' ✓' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        {track === 'military'
          ? `教練で${table.max}を超えて上げると、1段につき${table.overflowPointsPerRaise}点（軍事・防衛）。`
          : `${table.max}を超えて上げると、出どころを問わず1段につき${table.overflowPointsPerRaise}点（生活・福祉）。`}
        各報酬はゲーム中1回。一度に何段も上がったら通過分もすべて得る。
      </p>
    </section>
  );
};

const RaidTab = ({ state }: { state: GameState }) => {
  const current = state.round > 0 ? state.raidOrder[state.round - 1] : undefined;
  return (
    <div className="qr-stack">
      <p>
        いまの防衛ライン {state.defenseLine}・撃退ライン {state.repelLine}。目標を宣言し、軍事レベルとの差だけ軍事力トークンを払う。
      </p>
      <table className="qr-table">
        <thead>
          <tr>
            <th>カード</th>
            <th>ライン</th>
            <th>防衛失敗</th>
            <th>防衛成功</th>
            <th>撃退成功</th>
          </tr>
        </thead>
        <tbody>
          {GAME_DATA.raidCards.map((c) => {
            const o = describeRaidOutcomes(c);
            return (
              <tr key={c.id} className={current === c.id ? 'qr-now' : ''}>
                <td>
                  {c.id}
                  {current === c.id ? '（このラウンド）' : ''}
                </td>
                <td>
                  防衛＋{c.defense_increase}・撃退＋{c.repel_increase}
                </td>
                <td>{o.defenseFailed}</td>
                <td>{o.defended}</td>
                <td>{o.repelled}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small">ラインはラウンドごとに累積して上がる。色の付いた行がこのラウンドの襲撃カード。</p>
    </div>
  );
};

const FreeTab = () => (
  <div className="qr-stack">
    <ul className="qr-free">
      {GAME_DATA.params.freeActions.conversions.map((c) => (
        <li key={c.id}>
          <IconRow
            tokens={[
              tok('resources', c.pay.kind === 'civCards' ? 'drawCivCards' : c.pay.kind, c.pay.amount),
              tok('symbols', 'then'),
              tok('resources', c.gain.kind, c.gain.amount),
            ]}
          />
          <span className="small">{`${c.pay.kind === 'civCards' ? `手札の文明カード${c.pay.amount}枚` : `${tok('resources', c.pay.kind).label}${c.pay.amount}`} → ${grantText(c.gain)}`}</span>
        </li>
      ))}
    </ul>
    <p className="small">自分の手番中、アクションの前と後に何度でも使える。キャラクターと特別な市民カードのフリーアクションは、それぞれのカードを見る。</p>
  </div>
);

const ScoringTab = ({ state, player }: { state: GameState; player: PlayerState | null }) => {
  const s = GAME_DATA.params.scoring;
  const owned = (b: Building): number | null => (player === null ? null : ownedCount(player, b));
  let estimate: ReturnType<typeof finalScores>[number] | undefined;
  try {
    estimate = player === null ? undefined : finalScores(state).find((f) => f.player === player.index);
  } catch {
    estimate = undefined;
  }
  const parks = Object.entries(s.natureParkPointsBySetSize);
  return (
    <div className="qr-stack">
      <p>
        <b>基礎得点</b>：土地タイル{s.base.landTilesPerPoint}枚・建物{s.base.buildingsPerPoint}軒・通常ワーカー{s.base.regularWorkersPerPoint}人につき1点（項目ごとに端数は切り捨て）。
      </p>
      <CountTable head="経済・産業（商店）" values={s.goldPerPointByShops} owned={owned('shop')} unit="金の収入 N につき1点" />
      <CountTable head="経済・産業（工房）" values={s.materialsPerPointByWorkshops} owned={owned('workshop')} unit="資材の収入 N につき1点" />
      <CountTable head="文化・学術（大学）" values={s.civCardsPerPointByUniversities} owned={owned('university')} unit="プレイ済み N 枚につき1点" />
      <CountTable head="生活・福祉（役所）" values={s.regularWorkerPointsByOffices} owned={owned('office')} unit="通常ワーカー1人の点" />
      <ul className="qr-notes">
        <li>文化・学術には、プレイ済みの文明カードに書かれた点も加える。</li>
        <li>自然・環境：自然公園の組 {parks.map(([n, pt]) => `${n}枚で${pt}点`).join('・')}。計画都市は宣言の先着順に {s.plannedCityPointsByRank.join('・')} 点（ゲーム中に得る）。</li>
        <li>軍事・防衛：襲撃・遠征・教練の超過などでゲーム中に得た点。</li>
        <li>同点なら残った金の多い人、次に基礎得点の高い人が上。</li>
      </ul>
      {estimate !== undefined ? (
        <p className="qr-estimate">
          いま終わったときの見込み（終了時の能力を除く）：合計 <b>{estimate.total}</b> 点（基礎 {estimate.base}・経済 {estimate.axes.economy}・文化 {estimate.axes.culture}・生活 {estimate.axes.welfare}・自然 {estimate.axes.nature}・軍事{' '}
          {estimate.axes.military}・その他 {estimate.axes.other}）
        </p>
      ) : null}
    </div>
  );
};

export const QuickRef = ({ state, viewer, onClose }: { state: GameState; viewer: number | null; onClose: () => void }) => {
  const [tab, setTab] = useState<Tab>('buildings');
  const player = viewer === null ? null : (state.players[viewer] ?? null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="overlay" data-ui="quickref-overlay" onClick={onClose}>
      <div className="overlay-box quickref" role="dialog" aria-label="早見表" onClick={(e) => e.stopPropagation()}>
        <div className="quickref-head">
          <h2>早見表{player !== null ? `（${player.name}）` : ''}</h2>
          <nav className="quickref-tabs" role="tablist">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} className={`btn small${tab === t ? ' active' : ''}`} data-ui={`quickref-${t}`} onClick={() => setTab(t)}>
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
          <button type="button" className="btn" data-ui="quickref-close" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className="quickref-body">
          {tab === 'buildings' ? <BuildingsTab player={player} /> : null}
          {tab === 'actions' ? <ActionsTab player={player} /> : null}
          {tab === 'expedition' ? <ExpeditionTab player={player} /> : null}
          {tab === 'tracks' ? (
            <div className="qr-two">
              <TrackList track="military" player={player} />
              <TrackList track="infra" player={player} />
            </div>
          ) : null}
          {tab === 'raid' ? <RaidTab state={state} /> : null}
          {tab === 'free' ? <FreeTab /> : null}
          {tab === 'scoring' ? <ScoringTab state={state} player={player} /> : null}
        </div>
      </div>
    </div>
  );
};

/** 早見表を開くボタン（上部の帯）。viewer は表示中のプレイヤー。 */
export const QuickRefButton = ({ state, viewer }: { state: GameState; viewer: number | null }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" data-ui="quickref" onClick={() => setOpen(true)}>
        早見表
      </button>
      {open ? <QuickRef state={state} viewer={viewer} onClose={() => setOpen(false)} /> : null}
    </>
  );
};
