// 個人ボードの編集（指示書 3-5）。マスごとに地形とマスボーナスを編集し、地形の内訳を params.json と照らす。

import { useState } from 'react';
import { CELLS, type CellId } from '../../src/game/board.ts';
import { GRANT_KINDS, TERRAINS, type Terrain } from '../../src/data/index.ts';
import { TERRAIN_COLORS } from '../../src/ui/Board.tsx';
import type { OnSet } from './JsonEditor.tsx';
import { valueLabel } from './labels.ts';
import { deepEqual } from './proposal.ts';

type Square = { terrain: Terrain; bonus: { kind: string; amount: number; terrain?: string } | null };

const R = 22;
const W = Math.sqrt(3) * R;

const hexPoints = (cx: number, cy: number): string =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + (R - 1) * Math.cos(a)).toFixed(1)},${(cy + (R - 1) * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

export const BoardEditor = ({
  value,
  base,
  expected,
  onSet,
}: {
  value: { squares: Record<string, Square>; name?: string };
  base: { squares: Record<string, Square> } | undefined;
  expected: Record<string, number>;
  onSet: OnSet;
}) => {
  const [selected, setSelected] = useState<CellId>('A1');
  const square = value.squares[selected];
  const counts = Object.fromEntries(TERRAINS.map((t) => [t, CELLS.filter((c) => value.squares[c.id]?.terrain === t).length]));
  return (
    <div className="board-editor">
      <svg viewBox={`0 0 ${W * 8 + 20} ${R * 2 + R * 1.5 * 5 + 20}`} className="board-edit-svg">
        {CELLS.map((cell) => {
          const cx = 10 + W / 2 + cell.x * W;
          const cy = 10 + R + cell.rowIndex * 1.5 * R;
          const sq = value.squares[cell.id];
          const changed = !deepEqual(sq, base?.squares[cell.id]);
          return (
            <g key={cell.id} onClick={() => setSelected(cell.id)} className="edit-cell" data-cell={cell.id}>
              <polygon
                points={hexPoints(cx, cy)}
                fill={TERRAIN_COLORS[sq?.terrain ?? 'plains']}
                stroke={selected === cell.id ? '#e08a1e' : changed ? '#b5523b' : '#555'}
                strokeWidth={selected === cell.id || changed ? 3 : 1}
              />
              {sq?.bonus ? (
                <text x={cx} y={cy - 4} className="edit-bonus">
                  {sq.bonus.kind.slice(0, 4)}
                  {sq.bonus.amount}
                </text>
              ) : null}
              <text x={cx} y={cy + 12} className="edit-id">
                {cell.id}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="board-side">
        <h3>{selected}</h3>
        {square ? (
          <>
            <label>
              地形
              <select value={square.terrain} onChange={(e) => onSet(['squares', selected, 'terrain'], e.target.value)}>
                {TERRAINS.map((t) => (
                  <option key={t} value={t}>
                    {valueLabel(t, 'terrain')}
                  </option>
                ))}
              </select>
            </label>
            <label>
              マスボーナス
              <select
                value={square.bonus?.kind ?? ''}
                onChange={(e) =>
                  onSet(['squares', selected, 'bonus'], e.target.value === '' ? null : { kind: e.target.value, amount: square.bonus?.amount ?? 1 })
                }
              >
                <option value="">（なし）</option>
                {GRANT_KINDS.filter((k) => k !== 'freeBuildOnTerrain').map((k) => (
                  <option key={k} value={k}>
                    {valueLabel(k, 'kind')}
                  </option>
                ))}
              </select>
            </label>
            {square.bonus ? (
              <label>
                数
                <input
                  type="number"
                  value={square.bonus.amount}
                  onChange={(e) => onSet(['squares', selected, 'bonus', 'amount'], Number(e.target.value))}
                />
              </label>
            ) : null}
          </>
        ) : null}
        <h3>地形の内訳</h3>
        <table className="counts">
          <tbody>
            {TERRAINS.map((t) => (
              <tr key={t} className={counts[t] === expected[t] ? '' : 'mismatch'}>
                <th>{valueLabel(t, 'terrain')}</th>
                <td>{counts[t]}</td>
                <td>／{expected[t]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
