// 個人ボードのマスのタグを付ける帯（ユーザー決定 2026-11-15）。盤面の上に置く。
// 「タグ」を押すと帯が開き、タグを選んでからマスを押すと付け外しする。帯が開いている間、マスを押してもゲームは進まない。

import { CELL_TAGS, cellTagArt, cellTagColor, cellTagLabel, type CellTag } from './cell-tags.ts';

/** 選んでいる道具：付けるタグか、マスのタグを消す消しゴム。 */
export type TagTool = CellTag | 'erase';

export const CellTagBar = ({
  open,
  tool,
  count,
  onOpen,
  onTool,
  onClearAll,
}: {
  open: boolean;
  tool: TagTool | null;
  /** 表示中の盤面でタグの付いたマスの数。 */
  count: number;
  onOpen: (open: boolean) => void;
  onTool: (tool: TagTool | null) => void;
  onClearAll: () => void;
}) => {
  if (!open) {
    return (
      <div className="tag-bar closed">
        <button type="button" className="btn small" data-ui="tag-mode" onClick={() => onOpen(true)}>
          マスにタグを付ける{count > 0 ? `（${count}マス）` : ''}
        </button>
      </div>
    );
  }
  return (
    <div className="tag-bar" data-ui="tag-bar">
      <span className="tag-bar-note muted small">{tool === null ? 'タグを選んでからマスを押す' : tool === 'erase' ? 'マスを押すとタグを消す' : 'マスを押すと付け外しする'}</span>
      {CELL_TAGS.map((tag) => (
        <button
          key={tag}
          type="button"
          className={`tag-chip${tool === tag ? ' active' : ''}`}
          style={{ ['--tag-color' as string]: cellTagColor(tag) }}
          data-ui={`tag-${tag}`}
          aria-pressed={tool === tag}
          onClick={() => onTool(tool === tag ? null : tag)}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: cellTagArt(tag) }} />
          {cellTagLabel(tag)}
        </button>
      ))}
      <button type="button" className={`tag-chip erase${tool === 'erase' ? ' active' : ''}`} data-ui="tag-erase" aria-pressed={tool === 'erase'} onClick={() => onTool(tool === 'erase' ? null : 'erase')}>
        消しゴム
      </button>
      <button
        type="button"
        className="btn small"
        data-ui="tag-clear"
        disabled={count === 0}
        onClick={() => {
          if (window.confirm('この盤面のタグをすべて消す。よいか？')) onClearAll();
        }}
      >
        すべて消す
      </button>
      <button
        type="button"
        className="btn small"
        data-ui="tag-done"
        onClick={() => {
          onTool(null);
          onOpen(false);
        }}
      >
        終える
      </button>
    </div>
  );
};
