// 補足表示（ui_design.md 2-1）。PC はカーソルを合わせると吹き出し（HoverTip）、スマホは長押しで文章を出す。
// 合法手の選択には使わない。子要素に data-tip と長押しの処理を付ける。
// Tip の文章は文脈（TipContext）として子孫に渡る。アイコンはこれを受け取り、自身の語に続けて効果文を出す。

import { cloneElement, createContext, isValidElement, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

const LONG_PRESS_MS = 450;

/** 最も内側の Tip の文章（アイコンが効果文として添える）。 */
export const TipContext = createContext<string | null>(null);

export const useTipContext = (): string | null => useContext(TipContext);

type Props = {
  'data-tip'?: string;
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerUp?: () => void;
  onPointerLeave?: () => void;
};

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
    <TipContext.Provider value={text}>
      {cloneElement(child, {
        // 内側の要素（アイコン）が自身の data-tip を持つ場合は、そちらが優先される（HoverTip が最も近い要素を探す）。
        'data-tip': child.props['data-tip'] ?? text,
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
    </TipContext.Provider>
  );
};

/** アイコン1つの補足。アイコンの語（と数）に、囲む Tip の効果文を続ける。 */
export const iconTipText = (label: string, context: string | null): string =>
  context === null || context === '' || context === label ? label : `${label}\n${context}`;

/**
 * カーソルを合わせた要素の補足を、カーソルの近くに吹き出しで出す（マウスとペンだけ。タッチは長押しの Tip が受け持つ）。
 * 画面に1つだけ置く。最も近い data-tip を持つ祖先の文章を出す。
 */
export const HoverTip = () => {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const move = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return;
      const target = e.target instanceof Element ? e.target.closest('[data-tip]') : null;
      const text = target?.getAttribute('data-tip') ?? null;
      setTip(text === null || text === '' ? null : { text, x: e.clientX, y: e.clientY });
    };
    const hide = (): void => setTip(null);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerdown', hide);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerdown', hide);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);
  if (tip === null) return null;
  // 画面の端では、カーソルの反対側に出す。
  const width = box.current?.offsetWidth ?? 280;
  const height = box.current?.offsetHeight ?? 40;
  const left = tip.x + 14 + width > window.innerWidth ? Math.max(4, tip.x - 14 - width) : tip.x + 14;
  const top = tip.y + 18 + height > window.innerHeight ? Math.max(4, tip.y - 10 - height) : tip.y + 18;
  return (
    <div ref={box} className="hover-tip" role="tooltip" style={{ left, top }}>
      {tip.text}
    </div>
  );
};
