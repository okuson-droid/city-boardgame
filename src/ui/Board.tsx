// 個人ボード（ui_design.md 1-2、3-3）。頂点が上を向く六角形で描き、7マスの行は半マス内側に置く（rules.md 2-1-3-2）。

import { CELLS, type CellId } from '../game/board.ts';
import { GAME_DATA, ICON_KEYS } from '../data/index.ts';
import type { Terrain } from '../data/types.ts';
import type { PlayerState } from '../game/types.ts';
import { ICON_ART } from './icon-art.ts';

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
const BONUS_ART: Record<string, string> = {
  gold: 'res.gold',
  materials: 'res.materials',
  drawCivCards: 'res.civCard',
  militaryTokens: 'res.militaryTokens',
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
          const tip =
            state === 'selectable'
              ? `${cell.id}（${labelOf('terrains', terrain)}）`
              : (explainCell(cell.id) ?? `${cell.id}（${labelOf('terrains', terrain)}）`);
          return (
            <g
                key={cell.id}
              className={`cell cell-${state}${highlight === cell.id ? ' cell-highlight' : ''}${fresh.has(cell.id) ? ' cell-fresh' : ''}`}
                data-cell={cell.id}
                {...(state === 'selectable' ? { 'data-target': `cell:${cell.id}` } : {})}
                onClick={() => onCell(cell.id)}
              >
                <title>{tip}</title>
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
                      dangerouslySetInnerHTML={{ __html: ICON_ART[BONUS_ART[square.bonus.kind] ?? ''] ?? '' }}
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
                  <text x={cx - R * 0.5} y={cy + R * 0.55} className="cell-chip">
                    精
                  </text>
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
