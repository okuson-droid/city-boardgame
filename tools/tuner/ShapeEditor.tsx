// 計画都市・自然公園の形の編集（ユーザー決定 2026-11-08：タイルの配置関係を直感的に決められるようにする）。
// 六角形のマス目をクリックしてマスを足し、選んだマスの地形（計画都市は建物も）を押して決める。
// 座標はアキシャル座標 (q, r) で、r は行、6方向の隣接は (±1,0)・(0,±1)・(1,−1)・(−1,1)（CLAUDE.md「データの約束事」）。

import { useState } from 'react';
import { BUILDINGS, TERRAINS, type Building, type Terrain } from '../../src/data/index.ts';
import { TERRAIN_COLORS } from '../../src/ui/Board.tsx';
import { ANY_BUILDING_ART, ICON_ART } from '../../src/ui/icon-art.ts';
import { valueLabel } from './labels.ts';

export type ShapeCellValue = { q: number; r: number; terrain: Terrain | null; building?: Building | null };

const R = 26;
const W = Math.sqrt(3) * R;
/** 置いたマスの周りに、足せるマスを何マス分まで出すか。 */
const MARGIN = 2;

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
] as const;

const key = (q: number, r: number): string => `${q},${r}`;
const distance = (a: { q: number; r: number }, b: { q: number; r: number }): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

const hexPoints = (cx: number, cy: number): string =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return `${(cx + (R - 1.5) * Math.cos(a)).toFixed(1)},${(cy + (R - 1.5) * Math.sin(a)).toFixed(1)}`;
  }).join(' ');

/** マスがすべて辺でつながっているか（check.ts の形状のつながりと同じ考え方）。 */
export const isConnected = (cells: readonly { q: number; r: number }[]): boolean => {
  if (cells.length <= 1) return true;
  const set = new Set(cells.map((c) => key(c.q, c.r)));
  const first = cells[0];
  if (first === undefined) return true;
  const seen = new Set([key(first.q, first.r)]);
  const queue = [first];
  while (queue.length > 0) {
    const c = queue.shift();
    if (c === undefined) break;
    for (const [dq, dr] of NEIGHBORS) {
      const k = key(c.q + dq, c.r + dr);
      if (set.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push({ q: c.q + dq, r: c.r + dr });
      }
    }
  }
  return seen.size === set.size;
};

/** 60度回す（アキシャル座標の回転）。 */
export const rotateCells = <T extends { q: number; r: number }>(cells: readonly T[]): T[] => cells.map((c) => ({ ...c, q: -c.r, r: c.q + c.r }));

/** 最初のマスが (0, 0) になるように平行移動する（形は変わらない）。 */
export const anchorCells = <T extends { q: number; r: number }>(cells: readonly T[]): T[] => {
  const first = cells[0];
  if (first === undefined) return [...cells];
  return cells.map((c) => ({ ...c, q: c.q - first.q, r: c.r - first.r }));
};

/** 表示するマス目：置いたマスから MARGIN 以内（何もなければ原点の周り）。 */
const gridOf = (cells: readonly { q: number; r: number }[]): { q: number; r: number }[] => {
  const centers = cells.length > 0 ? cells : [{ q: 0, r: 0 }];
  const qs = centers.map((c) => c.q);
  const rs = centers.map((c) => c.r);
  const result: { q: number; r: number }[] = [];
  for (let r = Math.min(...rs) - MARGIN; r <= Math.max(...rs) + MARGIN; r += 1) {
    for (let q = Math.min(...qs) - MARGIN - MARGIN; q <= Math.max(...qs) + MARGIN + MARGIN; q += 1) {
      if (centers.some((c) => distance(c, { q, r }) <= MARGIN)) result.push({ q, r });
    }
  }
  return result;
};

export const ShapeEditor = ({
  cells,
  base,
  mode,
  onChange,
}: {
  cells: readonly ShapeCellValue[];
  /** 元データのマス（変わったマスに印を付ける）。 */
  base: readonly ShapeCellValue[] | undefined;
  /** planned は地形を「任意」にでき、建物も決める。nature は地形だけ。 */
  mode: 'planned' | 'nature';
  onChange: (cells: ShapeCellValue[]) => void;
}) => {
  const [selected, setSelected] = useState<string | null>(null);
  const grid = gridOf(cells);
  const pos = (q: number, r: number) => ({ x: W * (q + r / 2), y: 1.5 * R * r });
  const xs = grid.map((g) => pos(g.q, g.r).x);
  const ys = grid.map((g) => pos(g.q, g.r).y);
  const minX = Math.min(...xs) - W / 2 - 4;
  const minY = Math.min(...ys) - R - 4;
  const width = Math.max(...xs) - Math.min(...xs) + W + 8;
  const height = Math.max(...ys) - Math.min(...ys) + 2 * R + 8;
  const byKey = new Map(cells.map((c, i) => [key(c.q, c.r), { cell: c, index: i }]));
  const baseKeys = new Map((base ?? []).map((c) => [key(c.q, c.r), c]));
  const current = selected !== null ? byKey.get(selected) : undefined;

  const update = (index: number, patch: Partial<ShapeCellValue>) =>
    onChange(cells.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const clickCell = (q: number, r: number) => {
    const k = key(q, r);
    if (byKey.has(k)) {
      setSelected(selected === k ? null : k);
      return;
    }
    // 空きマスを押すと足す。足したマスは、計画都市なら任意の地形と任意の建物、自然公園なら森林から始める。
    const added: ShapeCellValue = mode === 'planned' ? { q, r, terrain: null, building: null } : { q, r, terrain: 'forest' };
    onChange([...cells, added]);
    setSelected(k);
  };

  const connected = isConnected(cells);
  return (
    <div className="shape-editor">
      <div className="shape-editor-main">
        <svg viewBox={`${minX} ${minY} ${width} ${height}`} className="shape-edit-svg" style={{ width: Math.min(420, width * 1.1) }}>
          {grid.map(({ q, r }) => {
            const { x, y } = pos(q, r);
            const k = key(q, r);
            const found = byKey.get(k);
            const was = baseKeys.get(k);
            const changed = found !== undefined && (was === undefined || was.terrain !== found.cell.terrain || (was.building ?? null) !== (found.cell.building ?? null));
            if (found === undefined) {
              return (
                <g key={k} className="shape-empty" onClick={() => clickCell(q, r)} data-shape-cell={k}>
                  <title>{`(${q}, ${r}) を足す`}</title>
                  <polygon points={hexPoints(x, y)} fill="#fff" fillOpacity={0.4} stroke="#c8c0b0" strokeDasharray="3 3" />
                  <text x={x} y={y + 5} className="shape-plus">
                    ＋
                  </text>
                </g>
              );
            }
            const c = found.cell;
            const building = c.building;
            const art = mode === 'planned' ? (building === null || building === undefined ? ANY_BUILDING_ART : ICON_ART[`bld.${building}`]) : undefined;
            return (
              <g key={k} className="shape-cell" onClick={() => clickCell(q, r)} data-shape-cell={k}>
                <title>{`(${q}, ${r}) ${c.terrain === null ? '任意の地形' : valueLabel(c.terrain, 'terrain')}${mode === 'planned' ? `・${building ? valueLabel(building, 'building') : '任意の建物'}` : ''}`}</title>
                <polygon
                  points={hexPoints(x, y)}
                  fill={c.terrain === null ? '#f4f1ea' : TERRAIN_COLORS[c.terrain]}
                  stroke={selected === k ? '#e08a1e' : changed ? '#b5523b' : '#555'}
                  strokeWidth={selected === k ? 4 : changed ? 3 : 1.5}
                  strokeDasharray={c.terrain === null ? '5 3' : undefined}
                />
                {art !== undefined ? (
                  <svg x={x - 13} y={y - 13} width={26} height={26} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: art }} />
                ) : null}
                {found.index === 0 ? (
                  <text x={x} y={y - R + 11} className="shape-origin">
                    基準
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
        <div className="shape-tools">
          <span className="muted small">{cells.length}マス</span>
          <button type="button" className="btn small" data-ui="shape-rotate" onClick={() => {
              // 回すとマスの座標が変わるため、選んでいるマスを外す。
              setSelected(null);
              onChange(anchorCells(rotateCells(cells)));
            }}
          >
            60度回す
          </button>
          {!connected ? <span className="shape-warn">マスがつながっていない</span> : null}
        </div>
      </div>
      <div className="shape-panel">
        {current === undefined ? (
          <p className="muted small">空きマス（＋）を押すとマスを足す。置いたマスを押すと、地形{mode === 'planned' ? 'と建物' : ''}を決められる。</p>
        ) : (
          <>
            <p className="small">
              <b>
                ({current.cell.q}, {current.cell.r})
              </b>{' '}
              のマス
            </p>
            <div className="shape-choices">
              <span className="small">地形</span>
              {mode === 'planned' ? (
                <button type="button" className={`btn small${current.cell.terrain === null ? ' active' : ''}`} onClick={() => update(current.index, { terrain: null })}>
                  任意
                </button>
              ) : null}
              {TERRAINS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn small terrain-btn${current.cell.terrain === t ? ' active' : ''}`}
                  style={{ borderLeft: `10px solid ${TERRAIN_COLORS[t]}` }}
                  onClick={() => update(current.index, { terrain: t })}
                >
                  {valueLabel(t, 'terrain')}
                </button>
              ))}
            </div>
            {mode === 'planned' ? (
              <div className="shape-choices">
                <span className="small">建物</span>
                <button type="button" className={`btn small${current.cell.building === null ? ' active' : ''}`} onClick={() => update(current.index, { building: null })}>
                  任意
                </button>
                {BUILDINGS.map((b) => (
                  <button key={b} type="button" className={`btn small${current.cell.building === b ? ' active' : ''}`} onClick={() => update(current.index, { building: b })}>
                    <svg width={18} height={18} viewBox="0 0 24 24" dangerouslySetInnerHTML={{ __html: ICON_ART[`bld.${b}`] ?? '' }} />
                    {valueLabel(b, 'building')}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="btn small"
              data-ui="shape-remove"
              disabled={cells.length <= 1}
              onClick={() => {
                onChange(cells.filter((_, i) => i !== current.index));
                setSelected(null);
              }}
            >
              このマスを消す
            </button>
          </>
        )}
      </div>
    </div>
  );
};
