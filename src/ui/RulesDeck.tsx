// ルール解説（ユーザー決定 2026-11-06：claude.ai のルール解説スライドと同じ内容を、ゲーム中とトップページから見られるようにする）。
// - スライドは src/rules/rule-deck.ts（scripts/import-rules-deck.ts が生成）。1920×1080 の画面を、表示枠に合わせて縮める。
// - 画像のうちゲームのアイコンと同じものは、最新の図案（icon-art.ts）から作る。
// - 各スライドの補足（条項の参照）は、スライドの下に畳んで出す。
// ゲームを進めない要素のため、ボタンには data-ui を付ける。

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RULE_DECK_TITLE, RULE_ICON_KEYS, RULE_SECTIONS, RULE_SLIDES, RULE_STATIC_SVGS } from '../rules/rule-deck.ts';
import { ACTION_ART, ICON_ART } from './icon-art.ts';

const SLIDE_W = 1920;
const SLIDE_H = 1080;

/** 資産の識別子から画像の data URI を作る。図案の線（currentColor）は墨色で描く。 */
const imageUri = (blob: string): string => {
  const key = RULE_ICON_KEYS[blob];
  const art = key === undefined ? RULE_STATIC_SVGS[blob] : key.startsWith('act.') ? ACTION_ART[key.slice(4)] : ICON_ART[key];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" color="#2a2a2a">${art ?? ''}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

/** スライドの HTML の画像の参照（/_blob/<識別子>）を data URI に置き換える。 */
const resolveImages = (html: string): string => html.replace(/src="\/_blob\/([0-9a-f]+)"/g, (_, blob: string) => `src="${imageUri(blob)}"`);

/** そのスライドが属する章の添字。 */
const sectionOf = (index: number): number => {
  let found = 0;
  RULE_SECTIONS.forEach((s, i) => {
    const start = RULE_SLIDES.findIndex((slide) => slide.id === s.start);
    if (start !== -1 && start <= index) found = i;
  });
  return found;
};

/** スライドの書体（Google Fonts）。ルール解説を開いたときに一度だけ読み込む。読めないときは手元の書体で描く。 */
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&family=Zen+Old+Mincho:wght@700&display=swap';
const loadFonts = (): void => {
  if (document.querySelector(`link[data-rules-fonts]`) !== null) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONT_HREF;
  link.dataset['rulesFonts'] = '1';
  document.head.appendChild(link);
};

export const RulesDeck = ({ onClose }: { onClose: () => void }) => {
  const [index, setIndex] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [scale, setScale] = useState(0.5);
  const stage = useRef<HTMLDivElement>(null);
  const htmls = useMemo(() => RULE_SLIDES.map((s) => resolveImages(s.html)), []);
  const slide = RULE_SLIDES[index];
  const last = RULE_SLIDES.length - 1;
  const go = (i: number) => setIndex(Math.max(0, Math.min(last, i)));

  useEffect(loadFonts, []);

  // 表示枠に合わせて縮める。
  useLayoutEffect(() => {
    const el = stage.current;
    if (el === null) return undefined;
    const fit = () => setScale(Math.min(el.clientWidth / SLIDE_W, el.clientHeight / SLIDE_H));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ←→ でめくり、Esc で閉じる。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') setIndex((i) => Math.min(last, i + 1));
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [last, onClose]);

  return (
    <div className="overlay rules-overlay" data-ui="rules-overlay" onClick={onClose}>
      <div className="overlay-box rules-box" role="dialog" aria-label="ルール解説" onClick={(e) => e.stopPropagation()}>
        <div className="rules-head">
          <h2>{RULE_DECK_TITLE}</h2>
          <select
            data-ui="rules-section"
            value={sectionOf(index)}
            onChange={(e) => {
              const start = RULE_SLIDES.findIndex((s) => s.id === RULE_SECTIONS[Number(e.target.value)]?.start);
              if (start !== -1) go(start);
            }}
            aria-label="章"
          >
            {RULE_SECTIONS.map((s, i) => (
              <option key={s.start} value={i}>
                {i + 1}. {s.title}
              </option>
            ))}
          </select>
          <button type="button" className="btn" data-ui="rules-close" onClick={onClose}>
            閉じる
          </button>
        </div>
        <div className="rules-stage" ref={stage}>
          <div className="rules-frame" style={{ width: SLIDE_W * scale, height: SLIDE_H * scale }}>
            <div
              className="rules-canvas"
              style={{ transform: `scale(${scale})` }}
              // スライドはリポジトリに取り込んだ固定の内容である（取り込み時に script とイベント属性を拒んでいる）。
              dangerouslySetInnerHTML={{ __html: htmls[index] ?? '' }}
            />
          </div>
        </div>
        <div className="rules-foot">
          <button type="button" className="btn" data-ui="rules-prev" disabled={index === 0} onClick={() => go(index - 1)}>
            ← 前へ
          </button>
          <span className="rules-page">
            {index + 1}／{RULE_SLIDES.length}
          </span>
          <button type="button" className="btn primary" data-ui="rules-next" disabled={index === last} onClick={() => go(index + 1)}>
            次へ →
          </button>
          {slide !== undefined && slide.notes !== '' ? (
            <button type="button" className="btn small" data-ui="rules-notes" aria-expanded={notesOpen} onClick={() => setNotesOpen(!notesOpen)}>
              {notesOpen ? '補足を閉じる' : '補足（条項）'}
            </button>
          ) : null}
        </div>
        {notesOpen && slide !== undefined && slide.notes !== '' ? <p className="rules-notes">{slide.notes}</p> : null}
      </div>
    </div>
  );
};

/** ルール解説を開くボタン。どの画面からでも開ける。 */
export const RulesButton = ({ label = 'ルール解説', primary = false }: { label?: string; primary?: boolean }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn${primary ? ' primary' : ''}`} data-ui="rules" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open ? <RulesDeck onClose={() => setOpen(false)} /> : null}
    </>
  );
};
