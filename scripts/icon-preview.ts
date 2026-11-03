// アイコンの文法の見本ページ（docs/icon-preview.html）を、src/ui/icon-art.ts の図案から生成する。
// 実行：npm run icons:preview

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACTION_ART, ICON_ART } from '../src/ui/icon-art.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const keys = JSON.parse(readFileSync(join(root, 'src', 'data', 'icon_keys.json'), 'utf8')) as Record<
  string,
  Record<string, { icon: string; label: string }>
>;

const labelOf = (icon: string): string => {
  for (const section of Object.values(keys)) {
    if (typeof section !== 'object' || section === null) continue;
    for (const entry of Object.values(section)) {
      if (entry && typeof entry === 'object' && 'icon' in entry && entry.icon === icon) return entry.label;
    }
  }
  return icon;
};

const svg = (inner: string, size = 32): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${inner}</svg>`;

/** 要素＋数字の札（4-1）。 */
const icon = (id: string, value?: string | number): string => {
  const art = ICON_ART[id] ?? '';
  // 得点は数字を輪の中に入れる（4-2）。
  if (id === 'res.points' && value !== undefined) {
    return `<span class="ic" title="${labelOf(id)}">${svg(art)}<span class="inside">${value}</span></span>`;
  }
  const badge = value === undefined ? '' : `<span class="badge">${value}</span>`;
  return `<span class="ic" title="${labelOf(id)}">${svg(art)}${badge}</span>`;
};

const sym = (id: string): string => `<span class="sym">${svg(ICON_ART[id] ?? '', 22)}</span>`;
const capsule = (inner: string): string => `<span class="capsule">${inner}</span>`;
const loop = (inner: string): string => `<span class="loop">${sym('ability.on')}${inner}</span>`;
const colon = '<span class="colon">：</span>';
const tag = (id: string): string => `<span class="tag">${svg(ICON_ART[id] ?? '', 22)}</span>`;
const corner = (text: string): string => `<span class="corner">${text}</span>`;

type Example = { title: string; rule: string; row: string; read: string };

const examples: Example[] = [
  {
    title: '支払いと獲得（4-3-1）',
    rule: '矢の左は支払い、右は獲得',
    row: `${tag('ability.onPlay')}${icon('res.gold', 3)}${sym('sym.then')}${icon('res.materials', 1)}`,
    read: '輸入（通常）：3金を払って1資材を得る',
  },
  {
    title: '「〜につき」（4-3-2）',
    row: `${tag('ability.onPlay')}${icon('res.regularWorkers', 1)}${sym('sym.per')}${icon('res.gold', 1)}`,
    rule: '斜線の左が数える対象、右が1単位あたり',
    read: '019：通常ワーカー1人につき1金',
  },
  {
    title: '「〜する度に」（4-3-2）',
    rule: '輪の矢で囲んだ要素がきっかけ',
    row: `${loop(icon('ter.forest'))}${colon}${icon('res.points', 2)}`,
    read: '特別市民01：森林タイルを置く度に2点',
  },
  {
    title: '条件付き（4-3-3）',
    rule: '灰色の枠が条件、コロンの右が効果',
    row: `${tag('ability.onPlay')}${capsule(`${icon('track.military')}${sym('sym.ge')}<b>3</b>`)}${colon}${icon('res.materials', 3)}<span class="gap"></span>${capsule(`${icon('track.military')}${sym('sym.ge')}<b>6</b>`)}${colon}${icon('res.materials', 2)}`,
    read: '027：軍事レベル3以上なら3資材、6以上ならもう2資材',
  },
  {
    title: '収入と即時（4-3-4）',
    rule: '台座に載せたものは生産力（毎ラウンドの収入）',
    row: `${tag('ability.onPlay')}${icon('res.goldProduction', '+5')}<span class="gap"></span>${tag('ability.onPlay')}${icon('res.gold', 5)}`,
    read: '左：005（金の生産力+5）／右：5金を得る（比較用）',
  },
  {
    title: '最大（4-3-5）',
    rule: '≤ は0〜Nを選べる',
    row: `${tag('ability.onPlay')}${icon('cmd.build')}${sym('sym.upTo')}<b>3</b>${sym('sym.free')}`,
    read: '003：金を払わずに建物を3軒まで建てる',
  },
  {
    title: 'いずれか1つ（4-3-5）',
    rule: '角括弧の中から1つ',
    row: `${loop(`${icon('cmd.playCard')}${corner('×3')}`)}${colon}<span class="bracket">${icon('track.infra', '+1')}${sym('sym.or')}${icon('cmd.placeTiles', 1)}${sym('sym.or')}${icon('res.tempWorkers', 1)}</span>`,
    read: '学者：文明カードを3枚プレイするごとに、3つから1つ',
  },
  {
    title: '回数の制限と支払い（4-3-2・4-3-6）',
    rule: '稲妻はフリーアクション、1R は1ラウンドに1回',
    row: `${tag('ability.freeAction')}${sym('sym.oncePerRound')}${icon('res.gold', 10)}${sym('sym.then')}${icon('res.tempWorkers', 1)}`,
    read: '豪商：1ラウンドに1回、10金で臨時ワーカー1人',
  },
  {
    title: '専用スペース（4-3-6）',
    rule: 'くぼみの中の数字がワーカー数',
    row: `${tag('ability.actionSpace')}<b>1</b>${colon}${icon('cmd.build', 1)}${sym('sym.free')}`,
    read: '特別市民09：1ワーカーで建物1軒を無料で建てる',
  },
];

const groups: { title: string; ids: string[] }[] = [
  { title: '資源・得点・ワーカー（4-2）', ids: ['res.gold', 'res.materials', 'res.militaryTokens', 'res.civCard', 'res.specialCitizen', 'res.points', 'res.regularWorkers', 'res.tempWorkers', 'res.goldProduction', 'res.materialProduction'] },
  { title: 'トラック', ids: ['track.military', 'track.infra'] },
  { title: '建物（評価軸の色）', ids: ['bld.shop', 'bld.workshop', 'bld.fort', 'bld.office', 'bld.university', 'bld.house', 'bld.camp'] },
  { title: '地形', ids: ['ter.plains', 'ter.forest', 'ter.mountain', 'ter.water', 'ter.match', 'ter.any'] },
  { title: '能力の札（4-3-6）', ids: ['ability.onPlay', 'ability.onAcquire', 'ability.setup', 'ability.firstTurnStart', 'ability.on', 'ability.freeAction', 'ability.actionSpace', 'ability.gameEnd'] },
  { title: '命令と記号（4-3）', ids: ['cmd.placeTiles', 'cmd.build', 'cmd.playCard', 'cmd.expeditionRewards', 'cmd.chooseOne', 'cmd.copyAction', 'sym.then', 'sym.per', 'sym.ge', 'sym.lt', 'sym.upTo', 'sym.or', 'sym.oncePerRound', 'sym.once', 'sym.free'] },
];

const ACTION_LABELS: Record<string, string> = {
  pioneer: '開拓',
  build: '建築',
  import: '輸入',
  export: '輸出',
  drill: '教練',
  expedition: '遠征',
  welfare: '福祉',
  migration: '移住',
  research: '研究',
  spread: '普及',
};

const html = `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>アイコンの文法（案）</title>
<style>
:root{--bg:#f4f1ea;--panel:#fffdf8;--line:#d8d2c4;--ink:#2a2a2a;--muted:#7a7466}
body{margin:0;background:var(--bg);color:var(--ink);font-family:system-ui,'Hiragino Sans','Noto Sans JP',sans-serif}
main{max-width:1100px;margin:0 auto;padding:24px 16px}
h1{font-size:22px;margin:0 0 4px} h2{font-size:16px;margin:24px 0 8px} p{color:var(--muted);margin:0 0 8px}
.grid{display:flex;flex-wrap:wrap;gap:8px}
.cell{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px;width:116px;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:12px;text-align:center}
.cell code{font-size:10px;color:var(--muted)}
.ex{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:8px;display:grid;grid-template-columns:220px 1fr;gap:4px 16px;align-items:center}
.ex h3{margin:0;font-size:13px} .ex .rule{color:var(--muted);font-size:12px} .ex .read{grid-column:2;color:var(--muted);font-size:12px}
.row{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.ic{position:relative;display:inline-flex}
.badge{position:absolute;right:-6px;bottom:-4px;background:#fff;border:1.5px solid #444;border-radius:8px;padding:0 4px;font-size:11px;font-weight:700;line-height:14px}
.inside{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#2a5}
.sym{display:inline-flex}
.tag{display:inline-flex;background:#eef2f7;border-radius:6px;padding:2px;margin-right:4px}
.capsule{display:inline-flex;align-items:center;gap:2px;background:#e3e0d8;border-radius:16px;padding:2px 10px}
.loop{display:inline-flex;align-items:center;gap:2px;border:2px solid #2f5d8a;border-radius:16px;padding:1px 8px}
.bracket{display:inline-flex;align-items:center;gap:4px;border-left:3px solid #444;border-right:3px solid #444;padding:0 6px}
.corner{font-size:11px;font-weight:700;background:#444;color:#fff;border-radius:4px;padding:0 3px}
.colon{font-weight:700;font-size:18px}
.gap{width:20px}
b{font-size:15px}
@media (max-width:640px){.ex{grid-template-columns:1fr}.ex .read{grid-column:1}}
</style></head><body><main>
<h1>アイコンの文法（案）</h1>
<p>docs/styleguide-icons.md の見本である。図案は src/ui/icon-art.ts、識別子は src/data/icon_keys.json に対応する。絵柄は最小限で、形で区別することを優先している。</p>
<h2>文法の例</h2>
${examples.map((e) => `<div class="ex"><h3>${e.title}</h3><div class="row">${e.row}</div><span class="rule">${e.rule}</span><span class="read">${e.read}</span></div>`).join('\n')}
${groups
  .map(
    (g) =>
      `<h2>${g.title}</h2><div class="grid">${g.ids
        .map((id) => `<div class="cell">${svg(ICON_ART[id] ?? '', 40)}<span>${labelOf(id)}</span><code>${id}</code></div>`)
        .join('')}</div>`,
  )
  .join('\n')}
<h2>アクション（4-2）</h2>
<div class="grid">${Object.entries(ACTION_ART)
  .map(([id, art]) => `<div class="cell">${svg(art, 40)}<span>${ACTION_LABELS[id] ?? id}</span><code>act.${id}</code></div>`)
  .join('')}</div>
</main></body></html>
`;

writeFileSync(join(root, 'docs', 'icon-preview.html'), html, 'utf8');
console.log('書き出した：docs/icon-preview.html');
