// 補足表示（ui_design.md 2-1）。PC はホバー（title）、スマホは長押しで文章を出す。
// 合法手の選択には使わない。子要素に直接 title と長押しの処理を付ける。

import { cloneElement, isValidElement, useRef, useState, type ReactElement, type ReactNode } from 'react';

const LONG_PRESS_MS = 450;

type Props = { title?: string; onPointerDown?: (e: React.PointerEvent) => void; onPointerUp?: () => void; onPointerLeave?: () => void };

export const Tip = ({ text, children }: { text: string | null; children: ReactNode }) => {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  if (text === null || text === '' || !isValidElement(children)) return <>{children}</>;
  const clear = (): void => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const child = children as ReactElement<Props>;
  return (
    <>
      {cloneElement(child, {
        title: text,
        onPointerDown: (e: React.PointerEvent) => {
          child.props.onPointerDown?.(e);
          if (e.pointerType !== 'touch') return;
          clear();
          timer.current = window.setTimeout(() => setOpen(true), LONG_PRESS_MS);
        },
        onPointerUp: () => {
          child.props.onPointerUp?.();
          clear();
        },
        onPointerLeave: () => {
          child.props.onPointerLeave?.();
          clear();
        },
      })}
      {open ? (
        <span className="tip-bubble" role="tooltip" onClick={() => setOpen(false)}>
          {text}
        </span>
      ) : null}
    </>
  );
};
