// アイコンの一覧（凡例）。対応表（icon_keys.json）の全要素と、10アクション、文法の区切りを、図案と意味で並べる。
// 意味の補足は docs/styleguide-icons.md 4-3 の文法に従う。ゲームを進めない要素のため data-ui を付ける。

import { useMemo, useState } from 'react';
import { ICON_KEYS } from '../data/index.ts';
import type { IconSection } from '../data/icon-keys.ts';
import { ACTIONS } from '../data/types.ts';
import type { IconToken } from '../game/icons.ts';
import { ACTION_LABELS } from './ActionBoard.tsx';
import { Icon, IconRow } from './Icon.tsx';

const SECTION_TITLES: Readonly<Record<IconSection, string>> = {
  abilities: 'いつ処理するか（能力の札）',
  commands: '命令',
  resources: '資源・カード・ワーカー',
  tracks: 'トラック',
  buildings: '建物',
  terrains: '地形',
  tags: '文明カードの分類',
  metrics: '数える対象',
  events: 'きっかけ（〜した時）',
  modifiers: '補正',
  results: '襲撃の結果',
  tiers: 'アクションの段階',
  symbols: '記号',
};

const SECTION_ORDER: readonly IconSection[] = [
  'resources',
  'tracks',
  'buildings',
  'terrains',
  'abilities',
  'commands',
  'symbols',
  'metrics',
  'events',
  'modifiers',
  'tags',
  'results',
  'tiers',
];

/** 語だけでは分かりにくい要素の補足（docs/styleguide-icons.md 4-3）。 */
const NOTES: Readonly<Record<string, string>> = {
  'ability.onPlay': '文明カードをプレイしたときに処理する',
  'ability.onAcquire': '特別な市民カードを獲得したときに処理する',
  'ability.setup': '準備のときに追加の初期資源を得る',
  'ability.firstTurnStart': '最初の手番の開始時に処理する',
  'ability.gameEnd': 'ゲーム終了時に処理する（終了時の得点など）',
  'ability.on': '続く効果。輪で囲んだきっかけが起きる度に処理する',
  'ability.modifier': '続く効果。コストや規則を変える',
  'ability.freeAction': '手番中にいつでも使える',
  'ability.actionSpace': 'ワーカーを置いて使う、自分だけのスペース',
  'sym.then': '矢の左を払い、右を得る',
  'sym.per': '斜線の左を数え、1つにつき右を得る',
  'sym.ge': '条件の比較。左の値が右の数以上',
  'sym.lt': '条件の比較。左の値が右の数より小さい',
  'sym.upTo': '最大でこの数まで',
  'sym.colon': '条件やきっかけから効果へつなぐ',
  'sym.oncePerRound': '1ラウンドに1回だけ使える',
  'sym.once': 'ゲーム中に1回だけ使える',
  'sym.every': 'この回数ごとに処理する',
  'sym.or': 'いずれか1つを選ぶ',
  'sym.pay': '支払う・捨てる',
  'res.goldProduction': '台座の上の金。ラウンド開始時の収入（生産力）',
  'res.materialProduction': '台座の上の資材。ラウンド開始時の収入（生産力）',
  'ter.any': '4種類のうち好きなもの',
};

type Entry = { readonly token: IconToken; readonly note: string | undefined };

const num = (value: number): IconToken => ({ icon: 'num', value, label: String(value) });
const open = (group: string): IconToken => ({ icon: `grp.${group}.open`, label: '' });
const close = (group: string): IconToken => ({ icon: `grp.${group}.close`, label: '' });
const key = (section: IconSection, name: string, value?: number): IconToken => {
  const entry = (ICON_KEYS[section] as Readonly<Record<string, { icon: string; label: string }>>)[name] ?? { icon: `${section}.${name}`, label: name };
  return value === undefined ? { icon: entry.icon, label: entry.label } : { icon: entry.icon, value, label: entry.label };
};

/** 並べ方の約束の例（docs/styleguide-icons.md 4-3）。 */
const GRAMMAR: readonly { tokens: IconToken[]; text: string }[] = [
  { tokens: [key('resources', 'gold', 3), key('symbols', 'then'), key('resources', 'materials', 1)], text: '支払いと獲得：矢の左を払い、右を得る。矢のない並びはすべて獲得' },
  { tokens: [key('resources', 'regularWorkers', 1), key('symbols', 'per'), key('resources', 'gold', 1)], text: '〜につき：通常ワーカー1人につき金1を得る' },
  {
    tokens: [open('cond'), key('tracks', 'military'), key('symbols', 'ge'), num(3), close('cond'), key('symbols', 'colon'), key('resources', 'materials', 3)],
    text: '灰色の枠は条件：軍事レベルが3以上なら資材3を得る',
  },
  { tokens: [open('loop'), key('terrains', 'forest'), close('loop'), key('symbols', 'colon'), key('resources', 'points', 2)], text: '輪の矢は「〜する度に」：森林を置く度に得点2を得る' },
  { tokens: [open('choice'), key('resources', 'gold', 2), key('symbols', 'or'), key('resources', 'materials', 1), close('choice')], text: '角括弧は「いずれか1つ」：金2か資材1のどちらかを得る' },
  { tokens: [key('resources', 'goldProduction', 5)], text: '台座の上の資源は生産力（ラウンド開始時の収入）。台座のない資源はその場で得る' },
];

const sections = (): { title: string; entries: Entry[] }[] => {
  const seen = new Set<string>();
  const result: { title: string; entries: Entry[] }[] = [
    {
      title: 'アクション',
      entries: ACTIONS.map((a) => ({ token: { icon: `act.${a}`, label: ACTION_LABELS[a] }, note: undefined })),
    },
  ];
  result.push({
    title: 'アクションボードの印',
    entries: [{ token: { icon: 'sym.lock', label: '最上位の解放条件' }, note: '右に並んだ条件を満たすと、その最上位のアクションが使えるようになる' }],
  });
  for (const section of SECTION_ORDER) {
    const table = ICON_KEYS[section] as Readonly<Record<string, { icon: string; label: string }>>;
    const entries: Entry[] = [];
    for (const { icon, label } of Object.values(table)) {
      if (seen.has(icon)) continue;
      seen.add(icon);
      entries.push({ token: { icon, label }, note: NOTES[icon] });
    }
    result.push({ title: SECTION_TITLES[section], entries });
  }
  return result;
};

export const Legend = ({ onClose }: { onClose: () => void }) => {
  const [filter, setFilter] = useState('');
  const all = useMemo(sections, []);
  const q = filter.trim();
  const shown = all
    .map((s) => ({ ...s, entries: s.entries.filter((e) => q === '' || e.token.label.includes(q) || (e.note ?? '').includes(q) || s.title.includes(q)) }))
    .filter((s) => s.entries.length > 0);
  return (
    <div className="overlay" data-ui="legend-overlay" onClick={onClose}>
      <div className="overlay-box legend" role="dialog" aria-label="アイコンの一覧" onClick={(e) => e.stopPropagation()}>
        <div className="legend-head">
          <h2>アイコンの一覧</h2>
          <input data-ui="legend-filter" placeholder="語で絞り込む" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button type="button" className="btn" data-ui="legend-close" onClick={onClose}>
            閉じる
          </button>
        </div>
        {q === '' ? (
          <section className="legend-section">
            <h3>並べ方の約束</h3>
            <ul className="legend-grammar">
              {GRAMMAR.map((g, i) => (
                <li key={i}>
                  <IconRow tokens={g.tokens} />
                  <span>{g.text}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {shown.map((s) => (
          <section key={s.title} className="legend-section">
            <h3>{s.title}</h3>
            <ul className="legend-list">
              {s.entries.map((e) => (
                <li key={e.token.icon} data-legend={e.token.icon}>
                  <Icon token={e.token} />
                  <span className="legend-label">{e.token.label}</span>
                  {e.note !== undefined ? <span className="legend-note">{e.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {shown.length === 0 ? <p className="muted">当てはまるアイコンがない</p> : null}
      </div>
    </div>
  );
};

/** 一覧を開くボタン。どの画面からでも開ける。 */
export const LegendButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" data-ui="legend" onClick={() => setOpen(true)}>
        アイコン一覧
      </button>
      {open ? <Legend onClose={() => setOpen(false)} /> : null}
    </>
  );
};
