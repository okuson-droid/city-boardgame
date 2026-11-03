// アイコンの仮の素材（ui_design.md 0-1）。styleguide.md のアイコンの文法が決まるまでは、
// 識別子の種類ごとの色と、語の頭文字1字の図形で表す。素材の差し替えはこのファイルだけで済む。

import type { IconToken } from '../game/icons.ts';
import { Tip } from './Tip.tsx';

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

/** 記号の仮の字。語の頭の1字では意味が読めないものに割り当てる。 */
const GLYPHS: Record<string, string> = {
  'sym.per': '/',
  'sym.ge': '≥',
  'sym.lt': '<',
  'sym.then': '→',
  'sym.or': '|',
  'sym.upTo': '≤',
  'sym.free': '0',
  'sym.noGold': '金0',
  'sym.pay': '−',
  'sym.oncePerRound': '1R',
  'sym.every': '毎',
  'sym.once': '1回',
  'sym.excludeSelf': '自除',
  'sym.workers': '人',
  'sym.pass': 'パ',
  'sym.none': '×',
  'ability.on': '常',
  'ability.modifier': '常',
  'ability.onPlay': 'プ',
  'ability.onAcquire': '獲',
  'ability.setup': '準',
  'ability.firstTurnStart': '初',
  'ability.gameEnd': '終',
  'ability.freeAction': 'F',
  'ability.actionSpace': '専',
  'evt.tilePlaced': '土',
  'evt.cardPlayed': '文',
  'evt.actionExecuted': '行',
  'evt.built': '建',
  'evt.workerGained': '人',
  'evt.raid': '襲',
};

const glyphOf = (token: IconToken): string => {
  if (token.icon === 'num') return String(token.value ?? '');
  const fixed = GLYPHS[token.icon];
  if (fixed !== undefined) return fixed;
  // 助詞から始まる語（「の土地タイルを置く度に」など）は助詞を飛ばす。
  return token.label.replace(/^[のをにがへと]/, '').slice(0, 1);
};

export const Icon = ({ token, size = 'md' }: { token: IconToken; size?: 'sm' | 'md' }) => {
  const showValue = token.value !== undefined && token.icon !== 'num';
  const tip = `${token.label}${showValue ? ` ${String(token.value)}` : ''}`;
  return (
    <Tip text={tip}>
      <span className={`icon icon-${size}`} data-icon={token.icon}>
        <span className="icon-glyph" style={{ background: colorOf(token.icon) }}>
          {glyphOf(token)}
        </span>
        {showValue ? <span className="icon-value">{String(token.value)}</span> : null}
      </span>
    </Tip>
  );
};

export const IconRow = ({ tokens, size = 'md' }: { tokens: readonly IconToken[]; size?: 'sm' | 'md' }) => (
  <span className="icon-row">
    {tokens.map((t, i) => (
      <Icon key={`${t.icon}-${i}`} token={t} size={size} />
    ))}
  </span>
);
