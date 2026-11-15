// 計画都市の達成の見込みの表示（ユーザー決定 2026-11-15）。
// カードの札（あと何手か）と、盤面の上の帯（どの配置を示しているか・次の候補・閉じる）を描く。盤面に重ねる印は Board.tsx が描く。

import { GAME_DATA } from '../data/index.ts';
import { plannedCityProspect, prospectSummary, type PlannedCityProspect } from '../game/queries.ts';
import type { PlayerState } from '../game/types.ts';
import { Tip } from './Tip.tsx';

/** 盤面に示している計画都市と、何番目の候補か。 */
export type ProspectPreview = { readonly id: string; readonly index: number };

export const prospectOf = (player: PlayerState, id: string): PlannedCityProspect | null => {
  const card = GAME_DATA.plannedCityCards.find((c) => c.id === id);
  if (card === undefined || player.boardId === null) return null;
  return plannedCityProspect(GAME_DATA, player, card);
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

/** 盤面の上の帯：示している計画都市・候補の番号・足りないもの・凡例。 */
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
  const p = prospectOf(player, preview.id);
  const card = GAME_DATA.plannedCityCards.find((c) => c.id === preview.id);
  if (p === null || card === undefined) return null;
  const placement = p.placements[preview.index % Math.max(1, p.placements.length)];
  return (
    <div className="pc-preview-bar" data-ui="pc-preview">
      <span className="pc-preview-title">
        {card.name}
        {p.placements.length > 1 ? `（候補 ${(preview.index % p.placements.length) + 1}/${p.placements.length}）` : ''}
      </span>
      <span>
        {placement === undefined
          ? 'この盤面では置ける配置がない'
          : placement.steps === 0
            ? '条件を満たしている'
            : `あと${placement.steps}（土地${placement.tiles + placement.bridge}・建物${placement.buildings}）${
                placement.mismatches > 0 ? `・地形違い${placement.mismatches}枚（開拓で1枚につき資材+${p.mismatchExtraMaterials}）` : ''
              }${placement.bridge > 0 ? `・離れているため、つなぐ土地${placement.bridge}枚を含む` : ''}`}
      </span>
      <span className="pc-preview-legend muted small">緑の✓：済み／点線：土地が要る／薄い建物：建てる</span>
      {p.placements.length > 1 ? (
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
