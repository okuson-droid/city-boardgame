// アイコンの表示（docs/styleguide-icons.md）。図案は icon-art.ts、表にない識別子は仮の素材（色と1字）で出す。
// 文法の区切り（条件のカプセル・「〜する度に」の輪・「いずれか1つ」の角括弧）は IconRow が枠で囲む。

import type { ReactNode } from 'react';
import type { GroupKind, IconToken } from '../game/icons.ts';
import { ACTION_ART, compositeArt, ICON_ART } from './icon-art.ts';
import { iconTipText, Tip, useTipContext } from './Tip.tsx';

const COLORS: Record<string, string> = {
  res: '#c9a227',
  track: '#b5523b',
  bld: '#6d5a8c',
  ter: '#3f8f5a',
  cmd: '#3c6e9e',
  ability: '#555',
  met: '#7a6a4f',
  sym: '#888',
  tag: '#a0527a',
  mod: '#4f7a78',
  evt: '#5d6b8c',
  raid: '#8c3b3b',
  tier: '#666',
  num: '#444',
  scene: '#2f5d8a',
};

const colorOf = (icon: string): string => COLORS[icon.split('.')[0] ?? ''] ?? '#666';

/** 図案のない識別子の仮の字。 */
const GLYPHS: Record<string, string> = {
  'sym.noGold': '金0',
  'sym.pay': '−',
  'sym.every': '毎',
  'sym.excludeSelf': '自除',
  'sym.workers': '人',
  'sym.pass': 'パ',
  'sym.none': '×',
  'evt.tilePlaced': '土',
  'evt.cardPlayed': '文',
  'evt.actionExecuted': '行',
  'evt.built': '建',
  'evt.workerGained': '人',
  'evt.raid': '襲',
};

const artOf = (icon: string): string | undefined => {
  if (icon.startsWith('act.')) return ACTION_ART[icon.slice('act.'.length)];
  // 出来事のきっかけは、対応する要素の図案で表す（4-3-2）。
  const alias: Record<string, string> = {
    'evt.tilePlaced': 'cmd.placeTiles',
    'evt.cardPlayed': 'cmd.playCard',
    'evt.built': 'cmd.build',
    'evt.workerGained': 'res.regularWorkers',
    'evt.raid': 'res.militaryTokens',
    'met.landTiles': 'cmd.placeTiles',
    'met.buildings': 'cmd.build',
    'met.playedCivCards': 'cmd.playCard',
    'res.drawCivCards': 'res.civCard',
    // 場面の見出し（ui_design.md 3-1）は、その場面で扱う要素の図案で表す。
    'scene.turn': 'res.regularWorkers',
    'scene.workers': 'res.tempWorkers',
    'scene.tile': 'cmd.placeTiles',
    'scene.build': 'cmd.build',
    'scene.reward': 'cmd.expeditionRewards',
    'scene.discard': 'sym.discard',
    'scene.play': 'cmd.playCard',
    'scene.citizen': 'res.specialCitizen',
    'scene.choose': 'cmd.chooseOne',
    'scene.copy': 'cmd.copyAction',
    'scene.raid': 'res.militaryTokens',
  };
  return ICON_ART[icon] ?? ICON_ART[alias[icon] ?? ''] ?? compositeArt(icon);
};

/**
 * 単独で出すときの名前（アイコンの一覧と、カーソルを合わせたときの吹き出し）。
 * 対応表の語のうち「の数」「を建設する度に」などは、効果の文章で前の語（地形・建物など）につなげる部品である。
 * 単独では読みにくいため、前に入るものを括弧で補う。対応表の語そのもの（文章の組み立て）は変えない。
 */
const STANDALONE: Readonly<Record<string, string>> = {
  'met.buildingsOfType': '（建物）の数',
  'met.buildingsOnTerrain': '（地形）に建てた建物',
  'met.tagsOf': '（分類）タグ',
  'evt.tilePlaced': '（地形）の土地タイルを置く度に',
  'evt.cardPlayed': '（タグ）の文明カードをプレイする度に',
  'evt.actionExecuted': '（種類）のアクションを実行する度に',
  'evt.built': '（建物）を建設する度に',
  'evt.workerGained': '（ワーカー）を獲得する度に',
  'evt.raid': '襲撃で（防衛成功など）した時',
  'evt.actionFinished': '（種類）のアクションを終えた時',
  'evt.trackRaised': '（トラック）が1上がる度に',
  'sym.per': '（数える対象）につき',
};

export const standaloneLabel = (icon: string, label: string): string => STANDALONE[icon] ?? label;

const glyphOf = (token: IconToken): string => {
  if (token.icon === 'num') return String(token.value ?? '');
  const fixed = GLYPHS[token.icon];
  if (fixed !== undefined) return fixed;
  // 助詞から始まる語（「の土地タイルを置く度に」など）は助詞を飛ばす。
  return token.label.replace(/^[のをにがへと]/, '').slice(0, 1);
};

export const Icon = ({ token, size = 'md' }: { token: IconToken; size?: 'sm' | 'md' }) => {
  const art = artOf(token.icon);
  const hasValue = token.value !== undefined && token.icon !== 'num';
  // カーソルを合わせると、アイコンの語に続けて、囲む効果の文章を出す。
  const tip = iconTipText(`${standaloneLabel(token.icon, token.label)}${hasValue ? ` ${String(token.value)}` : ''}`, useTipContext());
  // 得点は数字を輪の中に入れる（4-2）。
  const inside = token.icon === 'res.points' && hasValue;
  return (
    <Tip text={tip}>
      <span className={`icon icon-${size}`} data-icon={token.icon}>
        {art !== undefined ? (
          <svg className="icon-art" viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art }} />
        ) : token.icon === 'num' ? (
          <span className="icon-num">{glyphOf(token)}</span>
        ) : (
          <span className="icon-glyph" style={{ background: colorOf(token.icon) }}>
            {glyphOf(token)}
          </span>
        )}
        {inside ? <span className="icon-inside">{String(token.value)}</span> : null}
        {hasValue && !inside ? <span className="icon-value">{String(token.value)}</span> : null}
      </span>
    </Tip>
  );
};

type Node = { kind: 'token'; token: IconToken } | { kind: 'group'; group: GroupKind; children: Node[] };

/** 区切りの印（grp.<種類>.open / close）を入れ子の枠に組み立てる。 */
const parse = (tokens: readonly IconToken[]): Node[] => {
  const root: Node[] = [];
  const stack: { group: GroupKind; children: Node[] }[] = [];
  for (const token of tokens) {
    const m = /^grp\.(\w+)\.(open|close)$/.exec(token.icon);
    const target = stack[stack.length - 1]?.children ?? root;
    if (m === null) {
      target.push({ kind: 'token', token });
    } else if (m[2] === 'open') {
      stack.push({ group: m[1] as GroupKind, children: [] });
    } else {
      const done = stack.pop();
      if (done !== undefined) (stack[stack.length - 1]?.children ?? root).push({ kind: 'group', group: done.group, children: done.children });
    }
  }
  return root;
};

const render = (nodes: readonly Node[], size: 'sm' | 'md'): ReactNode[] =>
  nodes.map((node, i) =>
    node.kind === 'token' ? (
      <Icon key={`${node.token.icon}-${i}`} token={node.token} size={size} />
    ) : (
      <span key={`g-${i}`} className={`icon-group group-${node.group}`}>
        {node.group === 'loop' ? <Icon token={{ icon: 'ability.on', label: '〜する度に' }} size={size} /> : null}
        {render(node.children, size)}
      </span>
    ),
  );

export const IconRow = ({ tokens, size = 'md' }: { tokens: readonly IconToken[]; size?: 'sm' | 'md' }) => (
  <span className="icon-row">{render(parse(tokens), size)}</span>
);
