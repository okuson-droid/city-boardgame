// 計画都市・自然公園の達成の見込みの表示（ユーザー決定 2026-11-15）。
// カードの札（あと何手か）と、盤面の上の帯（どの配置を示しているか・次の候補・閉じる）を描く。盤面に重ねる印は Board.tsx が描く。

import { GAME_DATA } from '../data/index.ts';
import {
  natureParkProspect,
  parkSetSummary,
  plannedCityProspect,
  prospectSummary,
  type NatureParkProspect,
  type ParkSetProspect,
  type PlannedCityProspect,
  type ProspectPlacement,
} from '../game/queries.ts';
import type { PlayerState } from '../game/types.ts';
import { Tip } from './Tip.tsx';

/** 盤面に示している計画都市（pc）か自然公園のセット（np、set はセットの番号）と、何番目の候補か。 */
export type ProspectPreview =
  | { readonly kind: 'pc'; readonly id: string; readonly index: number }
  | { readonly kind: 'np'; readonly id: string; readonly set: number; readonly index: number };

export const prospectOf = (player: PlayerState, id: string): PlannedCityProspect | null => {
  const card = GAME_DATA.plannedCityCards.find((c) => c.id === id);
  if (card === undefined || player.boardId === null) return null;
  return plannedCityProspect(GAME_DATA, player, card);
};

export const parkProspectOf = (player: PlayerState): NatureParkProspect | null => {
  const card = GAME_DATA.natureParkCards.find((c) => c.id === player.natureParkCard);
  if (card === undefined || player.boardId === null) return null;
  return natureParkProspect(GAME_DATA, player, card);
};

/** 示している対象の名前・候補・地形違いの追加の資材。 */
const previewTarget = (
  player: PlayerState,
  preview: ProspectPreview,
): { title: string; placements: readonly ProspectPlacement[]; mismatchExtra: number } | null => {
  if (preview.kind === 'pc') {
    const p = prospectOf(player, preview.id);
    const card = GAME_DATA.plannedCityCards.find((c) => c.id === preview.id);
    if (p === null || card === undefined) return null;
    return { title: card.name, placements: p.placements, mismatchExtra: p.mismatchExtraMaterials };
  }
  const p = parkProspectOf(player);
  const set = p?.sets[preview.set];
  if (p === null || set === undefined) return null;
  return { title: `自然公園 セット${set.index + 1}（${set.size}枚・${set.points}点）`, placements: set.placements, mismatchExtra: p.mismatchExtraMaterials };
};

/** 示している配置（候補を巡る）。対象がなくなっていれば null。 */
export const previewPlacementOf = (player: PlayerState, preview: ProspectPreview | null): ProspectPlacement | null => {
  if (preview === null) return null;
  const t = previewTarget(player, preview);
  if (t === null || t.placements.length === 0) return null;
  return t.placements[preview.index % t.placements.length] ?? null;
};

const detailText = (p: PlannedCityProspect): string => {
  const best = p.placements[0];
  if (p.achieved) return '盤面の建物が条件を満たしている。手番中に達成を宣言できる（宣言の枠が残っていれば）。';
  if (best === undefined) return '置ける配置がない（別の建物・違う種類の土地・精霊チップ・建物の上限のため）。';
  const land = [
    ...(best.tiles > 0 ? [`形の中の土地${best.tiles}枚${best.mismatches > 0 ? `（うち地形と違う種類${best.mismatches}枚）` : ''}`] : []),
    ...(best.bridge > 0 ? [`つなぐ土地${best.bridge}枚`] : []),
  ];
  return [
    `置ける配置は${p.placementCount}通り。最も近い配置で足りないもの：${[...land, ...(best.buildings > 0 ? [`建物${best.buildings}軒`] : [])].join('・')}。`,
    '資源・他のプレイヤーの先着・残りのラウンドは数えない目安である。押すと盤面に置き場所を示す。',
  ].join('\n');
};

/** カードの下に付ける札。押すと盤面に置き場所を示す（もう一度押すと消す）。 */
export const ProspectBadge = ({
  player,
  id,
  claimed,
  active,
  onPreview,
}: {
  player: PlayerState;
  id: string;
  claimed: boolean;
  active: boolean;
  onPreview: (id: string) => void;
}) => {
  const p = prospectOf(player, id);
  if (p === null) return null;
  const kind = claimed ? 'claimed' : p.achieved ? 'achieved' : p.placements.length === 0 ? 'blocked' : 'open';
  const text = claimed ? '宣言済み' : prospectSummary(p);
  return (
    <Tip text={claimed ? `${player.name}はこのカードの達成を宣言した。` : detailText(p)}>
      <button
        type="button"
        className={`pc-prospect pc-prospect-${kind}${active ? ' active' : ''}`}
        data-ui="pc-prospect"
        aria-pressed={active}
        disabled={kind === 'blocked'}
        onClick={(e) => {
          e.stopPropagation();
          onPreview(id);
        }}
      >
        {text}
      </button>
    </Tip>
  );
};

const parkSetTip = (s: ParkSetProspect, mismatchExtra: number): string => {
  const best = s.placements[0];
  if (best === undefined) return 'この盤面では、このセットの形を作れない（建物の建ったマスと違う種類の土地は使えない）。';
  if (best.steps === 0) return '建物のない土地にこの形がある。ただし同じ土地タイルを2つのセットに使えないため、点は上の合計で数える。';
  return [
    `作れる配置は${s.placementCount}通り。最も近い配置で足りない土地：形の中${best.tiles}枚${
      best.mismatches > 0 ? `（うち地形と違う種類${best.mismatches}枚、開拓で1枚につき資材+${mismatchExtra}）` : ''
    }${best.bridge > 0 ? `・つなぐ土地${best.bridge}枚` : ''}。`,
    '形のマスに建物を建てると、そのセットには使えなくなる。押すと盤面に置き場所を示す。',
  ].join('\n');
};

/** 自然公園カードの下の札：いまの得点と、セットごとの見込み。 */
export const ParkProspect = ({
  player,
  active,
  onPreview,
}: {
  player: PlayerState;
  /** 示しているセットの番号。 */
  active: number | null;
  onPreview: (set: number) => void;
}) => {
  const p = parkProspectOf(player);
  if (p === null) return null;
  return (
    <div className="np-prospect" data-ui="np-prospect">
      <Tip text="いまゲームが終わったときの自然公園の得点（同じ土地タイルを2つのセットに使わない、最も高い割り当て）。">
        <span className="np-prospect-score">
          いま{p.score}点／最大{p.maxScore}点
        </span>
      </Tip>
      {p.sets.map((s) => {
        const kind = s.achieved ? 'achieved' : s.placements.length === 0 ? 'blocked' : 'open';
        return (
          <Tip key={s.index} text={parkSetTip(s, p.mismatchExtraMaterials)}>
            <button
              type="button"
              className={`pc-prospect pc-prospect-${kind}${active === s.index ? ' active' : ''}`}
              data-ui={`np-prospect-${s.index}`}
              aria-pressed={active === s.index}
              disabled={kind === 'blocked'}
              onClick={(e) => {
                e.stopPropagation();
                onPreview(s.index);
              }}
            >
              {s.size}枚{s.points}点：{parkSetSummary(s)}
            </button>
          </Tip>
        );
      })}
    </div>
  );
};

/** 盤面の上の帯：示している対象・候補の番号・足りないもの・凡例。 */
export const ProspectBar = ({
  player,
  preview,
  onNext,
  onClose,
}: {
  player: PlayerState;
  preview: ProspectPreview;
  onNext: () => void;
  onClose: () => void;
}) => {
  const t = previewTarget(player, preview);
  if (t === null) return null;
  const n = t.placements.length;
  const placement = n > 0 ? t.placements[preview.index % n] : undefined;
  const park = preview.kind === 'np';
  return (
    <div className="pc-preview-bar" data-ui="pc-preview">
      <span className="pc-preview-title">
        {t.title}
        {n > 1 ? `（候補 ${(preview.index % n) + 1}/${n}）` : ''}
      </span>
      <span>
        {placement === undefined
          ? 'この盤面では置ける配置がない'
          : placement.steps === 0
            ? park
              ? '形がある（建物を建てなければ得点になる）'
              : '条件を満たしている'
            : `あと${placement.steps}（土地${placement.tiles + placement.bridge}${park ? '' : `・建物${placement.buildings}`}）${
                placement.mismatches > 0 ? `・地形違い${placement.mismatches}枚（開拓で1枚につき資材+${t.mismatchExtra}）` : ''
              }${placement.bridge > 0 ? `・離れているため、つなぐ土地${placement.bridge}枚を含む` : ''}`}
      </span>
      <span className="pc-preview-legend muted small">
        {park ? '緑の✓：済み／点線：土地が要る（建物は建てない）' : '緑の✓：済み／点線：土地が要る／薄い建物：建てる'}
      </span>
      {n > 1 ? (
        <button type="button" data-ui="pc-preview-next" onClick={onNext}>
          次の候補
        </button>
      ) : null}
      <button type="button" data-ui="pc-preview-close" onClick={onClose}>
        閉じる
      </button>
    </div>
  );
};
