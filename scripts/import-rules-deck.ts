// ルール解説のスライド（claude.ai の Slides アーティファクト）を、ゲーム内で読める形に取り込む（ユーザー決定 2026-11-06）。
//
// 使い方：node --experimental-strip-types scripts/import-rules-deck.ts <取り込み元のフォルダー>
//   取り込み元のフォルダーには、アーティファクトから読み出した次のものを置く。
//   - project/deck.json（題・順番・章立て）
//   - project/slides/<id>.html（スライド1枚ずつ）
//   - blobs/<資産の識別子>.svg（スライドの画像。/_blob/<識別子> で参照される）
//
// 出力は src/rules/rule-deck.ts である。画像は、ゲームのアイコンの図案（icon-art.ts）と同じものは図案の識別子で
// 持ち、画面で描くときに最新の図案から作る（アイコンを描き直してもスライドが追従する）。一致しない画像だけ、
// SVG の本文をそのまま持つ。

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACTION_ART, ICON_ART } from '../src/ui/icon-art.ts';

const source = process.argv[2];
if (source === undefined) {
  console.error('使い方：node --experimental-strip-types scripts/import-rules-deck.ts <取り込み元のフォルダー>');
  process.exit(1);
}

type DeckIndex = {
  title: string;
  order: string[];
  sections: Record<string, { description: string; start: string }>;
};

const deck = JSON.parse(readFileSync(join(source, 'project/deck.json'), 'utf8')) as DeckIndex;

// 図案の比較：自己終了タグと閉じタグ、currentColor（書き出し時に墨色へ置き換わる）、空白の違いをそろえる。
const normalize = (svg: string): string =>
  svg
    .replace(/currentColor/g, '#2a2a2a')
    .replace(/<(\w+)([^>]*?)\s*\/>/g, '<$1$2></$1>')
    .replace(/\s+/g, ' ')
    .replace(/> </g, '><')
    .trim();

const art: Record<string, string> = { ...ICON_ART };
for (const [key, value] of Object.entries(ACTION_ART)) art[`act.${key}`] = value;
const byShape = new Map<string, string>();
for (const [key, value] of Object.entries(art)) byShape.set(normalize(value), key);

const iconKeys: Record<string, string> = {};
const staticSvgs: Record<string, string> = {};
const blobDir = join(source, 'blobs');
for (const file of readdirSync(blobDir)) {
  if (!file.endsWith('.svg')) continue;
  const id = file.slice(0, -4);
  const svg = readFileSync(join(blobDir, file), 'utf8');
  if (/<script|\son\w+=|href=/i.test(svg)) throw new Error(`画像 ${file} に許可しない要素がある`);
  const inner = svg.replace(/^\s*<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const key = byShape.get(normalize(inner));
  if (key !== undefined) iconKeys[id] = key;
  else staticSvgs[id] = inner.trim();
}

type Slide = { id: string; html: string; notes: string };
const slides: Slide[] = deck.order.map((id) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error(`スライドの識別子が不正である：${id}`);
  const raw = readFileSync(join(source, 'project/slides', `${id}.html`), 'utf8').trim();
  if (/<script|\son\w+=/i.test(raw)) throw new Error(`スライド ${id} に許可しない要素がある`);
  const notesMatch = raw.match(/<aside>([\s\S]*?)<\/aside>/);
  const html = raw.replace(/<aside>[\s\S]*?<\/aside>/, '').trim();
  for (const m of html.matchAll(/\/_blob\/([0-9a-f]+)/g)) {
    const blob = m[1] ?? '';
    if (iconKeys[blob] === undefined && staticSvgs[blob] === undefined) throw new Error(`スライド ${id} の画像 ${blob} が取り込み元にない`);
  }
  return { id, html, notes: (notesMatch?.[1] ?? '').trim() };
});

const sections = Object.values(deck.sections).map((s) => ({ title: s.description, start: s.start }));

const out = `// 生成ファイル。scripts/import-rules-deck.ts が claude.ai のルール解説スライドから作る。手で編集しない。
// 取り込み：${new Date().toISOString().slice(0, 10)}

export type RuleSlide = { readonly id: string; readonly html: string; readonly notes: string };

export const RULE_DECK_TITLE = ${JSON.stringify(deck.title)};

/** 章立て（各章の説明と最初のスライド）。 */
export const RULE_SECTIONS: readonly { readonly title: string; readonly start: string }[] = ${JSON.stringify(sections, null, 2)};

/** スライドの画像のうち、ゲームのアイコンの図案と同じもの（資産の識別子 → 図案の識別子）。 */
export const RULE_ICON_KEYS: Readonly<Record<string, string>> = ${JSON.stringify(iconKeys, null, 2)};

/** スライドの画像のうち、図案と一致しないもの（資産の識別子 → SVG の本文）。 */
export const RULE_STATIC_SVGS: Readonly<Record<string, string>> = ${JSON.stringify(staticSvgs, null, 2)};

export const RULE_SLIDES: readonly RuleSlide[] = ${JSON.stringify(slides, null, 2)};
`;

writeFileSync(new URL('../src/rules/rule-deck.ts', import.meta.url), out);
console.log(`スライド ${slides.length} 枚、図案 ${Object.keys(iconKeys).length} 件、固定の画像 ${Object.keys(staticSvgs).length} 件を取り込んだ。`);
