// 個人ボード（ui_design.md 1-2、3-3）。頂点が上を向く六角形で描き、7マスの行は半マス内側に置く（rules.md 2-1-3-2）。

import { CELLS, type CellId } from '../game/board.ts';
import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import type { Grant, Terrain } from '../data/types.ts';
import type { PlayerState } from '../game/types.ts';
import { describeBuilding, grantText } from '../game/queries.ts';
import { ICON_ART } from './icon-art.ts';
import { artOf } from './Icon.tsx';

const R = 26;
const W = Math.sqrt(3) * R;
const PAD = 22;

export const TERRAIN_COLORS: Record<Terrain, string> = {
  plains: '#e9d66b',
  forest: '#4f9a4f',
  mountain: '#9a9a9a',
  water: '#7fc4e8',
};

const center = (x: number, rowIndex: number): { cx: number; cy: number } => ({
  cx: PAD + W / 2 + x * W,
  cy: PAD + R + rowIndex * 1.5 * R,
});

const hexPoints = (cx: number, cy: number, r: number): string =>
  Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');

const labelOf = (section: 'buildings' | 'terrains' | 'resources', key: string): string =>
  (ICON_KEYS[section] as Readonly<Record<string, { label: string }>>)[key]?.label ?? key;

/** マスボーナスの図案（docs/styleguide-icons.md 4-2）。 */
/**
 * マスボーナスの図案。得るものの種類からアイコンの対応表（icon_keys.json）を引き、画面の他の場所と同じ図案を使う。
 * 以前は4種類（金・資材・文明カード・軍事力トークン）だけを持ち、調整案（2026-11-08）で増えた特別な市民カード・得点・臨時ワーカーの
 * マスが数字だけになっていた（2026-11-13）。
 */
export const bonusArt = (g: { readonly kind: Grant['kind'] | string }): string => {
  const icon =
    g.kind === 'landTiles'
      ? 'cmd.placeTiles'
      : g.kind === 'buildRight' || g.kind === 'freeBuildOnTerrain'
        ? 'cmd.build'
        : ((ICON_KEYS.resources as Readonly<Record<string, { icon: string }>>)[g.kind]?.icon ?? '');
  return artOf(icon) ?? '';
};

export type CellState = 'selectable' | 'picked' | 'none';

export const Board = ({
  player,
  cellState,
  pickOrder,
  highlight,
  fresh = new Set(),
  explainCell,
  onCell,
}: {
  player: PlayerState;
  cellState: (cell: CellId) => CellState;
  pickOrder: (cell: CellId) => number | null;
  highlight: CellId | null;
  /** 直前の選択で置かれた土地・建物のマス。 */
  fresh?: ReadonlySet<CellId>;
  explainCell: (cell: CellId) => string | null;
  onCell: (cell: CellId) => void;
}) => {
  const board = GAME_DATA.boards.find((b) => b.id === player.boardId);
  if (board === undefined) return <div className="board-empty">個人ボード未選択</div>;
  const width = PAD * 2 + W * 8;
  const height = PAD * 2 + R * 2 + 1.5 * R * 5;
  const chips = new Set(Object.values(player.spiritChips));
  return (
    <div className="board-wrap">
      {board.provisional ? <span className="provisional-badge">仮置き</span> : null}
      <svg className="board" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="個人ボード">
        {CELLS.map((cell) => {
          const { cx, cy } = center(cell.x, cell.rowIndex);
          const square = board.squares[cell.id];
          const terrain = square?.terrain ?? 'plains';
          const tile = player.land[cell.id];
          const building = player.buildings[cell.id];
          const state = cellState(cell.id);
          const order = pickOrder(cell.id);
          // マスの吹き出し（ユーザー決定 2026-11-07）：地形・置いた土地タイル・未開拓ならマスボーナス・建物の効果のまとめ。
          const reason = state === 'selectable' ? null : explainCell(cell.id);
          const tip = [
            `${cell.id}（${labelOf('terrains', terrain)}）${tile !== undefined && tile !== terrain ? `・${labelOf('terrains', tile)}の土地タイル` : ''}${
              square?.bonus && tile === undefined ? `・マスボーナス：${grantText(square.bonus)}` : ''
            }`,
            ...(building !== undefined ? [describeBuilding(building)] : []),
            ...(reason !== null ? [reason] : []),
          ].join('\n');
          return (
            <g
                key={cell.id}
              className={`cell cell-${state}${highlight === cell.id ? ' cell-highlight' : ''}${fresh.has(cell.id) ? ' cell-fresh' : ''}`}
                data-cell={cell.id}
                {...(state === 'selectable' ? { 'data-target': `cell:${cell.id}` } : {})}
                data-tip={tip}
                onClick={() => onCell(cell.id)}
              >
                <polygon
                  points={hexPoints(cx, cy, R - 1)}
                  fill={TERRAIN_COLORS[tile ?? terrain]}
                  fillOpacity={tile === undefined ? 0.35 : 1}
                  stroke={tile === undefined ? '#bbb' : '#555'}
                  strokeWidth={tile === undefined ? 1 : 1.6}
                />
                {tile !== undefined && tile !== terrain ? (
                  <circle cx={cx + R * 0.55} cy={cy + R * 0.45} r={4} fill={TERRAIN_COLORS[terrain]} stroke="#555" />
                ) : null}
                {square?.bonus && tile === undefined ? (
                  <g>
                    <svg
                      x={cx - 8}
                      y={cy - R * 0.72}
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      dangerouslySetInnerHTML={{ __html: bonusArt(square.bonus) }}
                    />
                    <text x={cx + 9} y={cy - R * 0.32} className="cell-bonus">
                      {square.bonus.amount}
                    </text>
                  </g>
                ) : null}
                {building !== undefined ? (
                  <g>
                    <circle cx={cx} cy={cy} r={R * 0.5} fill="#fff" stroke="#333" />
                    <svg
                      x={cx - 10}
                      y={cy - 10}
                      width={20}
                      height={20}
                      viewBox="0 0 24 24"
                      dangerouslySetInnerHTML={{ __html: ICON_ART[`bld.${building}`] ?? '' }}
                    />
                  </g>
                ) : null}
                {chips.has(cell.id) ? (
                  <svg
                    x={cx - R * 0.85}
                    y={cy + R * 0.15}
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    dangerouslySetInnerHTML={{ __html: ICON_ART['cmd.spiritPlace'] ?? '' }}
                  >
                  </svg>
                ) : null}
                {order !== null ? (
                  <text x={cx + R * 0.5} y={cy - R * 0.3} className="cell-order">
                    {order}
                  </text>
                ) : null}
                <text x={cx} y={cy + R * 0.78} className="cell-id">
                  {cell.id}
                </text>
              </g>
          );
        })}
      </svg>
    </div>
  );
};

/**
 * 個人ボードの地図だけを描く（ドラフトで選ぶ前に見せる）。マスの地形・マスボーナス・最初に土地タイルを置くマスを出す。
 * 遊んでいるときの Board と同じ並びと色で描くため、選んだ後の見え方と食い違わない。
 */
export const BoardMap = ({ boardId }: { boardId: string }) => {
  const board = GAME_DATA.boards.find((b) => b.id === boardId);
  if (board === undefined) return null;
  const width = PAD * 2 + W * 8;
  const height = PAD * 2 + R * 2 + 1.5 * R * 5;
  const initial = new Set<string>(GAME_DATA.params.board.initialCells);
  return (
    <svg className="board board-map" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${board.name}の地図`}>
      {CELLS.map((cell) => {
        const { cx, cy } = center(cell.x, cell.rowIndex);
        const square = board.squares[cell.id];
        const terrain = square?.terrain ?? 'plains';
        const start = initial.has(cell.id);
        const bonus = square?.bonus ?? null;
        return (
          <g
            key={cell.id}
            data-cell={cell.id}
            data-tip={`${cell.id}（${labelOf('terrains', terrain)}）${start ? '・最初に土地タイルを置くマス' : ''}${bonus ? `・マスボーナス：${grantText(bonus)}` : ''}`}
          >
            <polygon
              points={hexPoints(cx, cy, R - 1)}
              fill={TERRAIN_COLORS[terrain]}
              fillOpacity={start ? 1 : 0.55}
              stroke={start ? '#222' : '#888'}
              strokeWidth={start ? 3 : 1}
            />
            {bonus ? (
              <g>
                <circle cx={cx} cy={cy - 2} r={R * 0.5} fill="#fff" fillOpacity={0.85} stroke="#666" strokeWidth={0.8} />
                <svg x={cx - 9} y={cy - 11} width={18} height={18} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: bonusArt(bonus) }} />
                <text x={cx + 10} y={cy + 6} className="cell-bonus">
                  {bonus.amount}
                </text>
              </g>
            ) : null}
            {start ? (
              <text x={cx} y={cy + R * 0.78} className="cell-id">
                開始
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
};

/** 形状の小さな図（計画都市・自然公園のカード用）。 */
export const ShapeView = ({
  cells,
}: {
  /** art は建物などの図案（icon-art.ts の SVG の中身）。マスの中に縮めて描く。title はカーソルを合わせたときの名前。 */
  cells: readonly { q: number; r: number; terrain: Terrain | null; text: string; art?: string; title?: string }[];
}) => {
  const r = 9;
  const w = Math.sqrt(3) * r;
  const pts = cells.map((c) => ({ ...c, x: (c.q + c.r / 2) * w, y: c.r * 1.5 * r }));
  const minX = Math.min(...pts.map((p) => p.x)) - w;
  const minY = Math.min(...pts.map((p) => p.y)) - r * 1.2;
  const maxX = Math.max(...pts.map((p) => p.x)) + w;
  const maxY = Math.max(...pts.map((p) => p.y)) + r * 1.2;
  return (
    <svg className="shape" viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}>
      {pts.map((p, i) => (
        <g key={i}>
          {p.title ? <title>{p.title}</title> : null}
          <polygon points={hexPoints(p.x, p.y, r - 0.5)} fill={p.terrain ? TERRAIN_COLORS[p.terrain] : '#fff'} stroke="#555" strokeWidth={0.8} />
          {p.art ? (
            <g transform={`translate(${p.x - 5.5} ${p.y - 5.5}) scale(0.46)`} dangerouslySetInnerHTML={{ __html: p.art }} />
          ) : (
            <text x={p.x} y={p.y + 3} className="shape-text">
              {p.text}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
};
