// アイコンの図案（docs/styleguide-icons.md 4-2）。icon_keys.json の識別子ごとに、
// viewBox 0 0 24 24 の SVG の中身を文字列で持つ。描き込みは最小限とし、形で区別する（4-1）。
// 表にない識別子は Icon.tsx が仮の素材（色と1字）で出す。仮の素材が画面に出ないよう、表を埋めておく
// （ユーザー決定 2026-11-04：文字1字のアイコンは分かりにくい）。

const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';

/** 評価軸の色（4-5）。 */
export const AXIS_COLORS = {
  economy: '#c9a227',
  culture: '#7b4fa0',
  welfare: '#d9822b',
  nature: '#3f8f5a',
  military: '#b5423b',
  other: '#777777',
} as const;

/** 文明カードのタグの色。8種を色と図柄の両方で見分ける。 */
/** 文明カードの分類の色。アイコンとカードの帯で共有する。 */
export const TAG_COLORS = {
  military: '#b5423b',
  economy: '#b8901a',
  academic: '#7b4fa0',
  life: '#d9822b',
  environment: '#3f8f5a',
  literature: '#4e6a9a',
  art: '#c0577a',
  music: '#2f8a8a',
} as const;

/** 分類の色。分類の名前が表にないときは undefined。 */
export const tagColor = (tag: string): string | undefined => (TAG_COLORS as Readonly<Record<string, string>>)[tag];

const INK = '#2a2a2a';
const BLUE = '#2f5d8a';
const INFRA = '#2e6db0';

const hex = (fill: string): string =>
  `<polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="${fill}" stroke="#444" stroke-width="1.5"/>`;

/** 小さい六角形（cx, cy は中心、r は半径）。 */
const hexAt = (cx: number, cy: number, r: number, fill: string): string => {
  const pts = [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
    })
    .join(' ');
  return `<polygon points="${pts}" fill="${fill}" stroke="#444" stroke-width="1.3"/>`;
};

const meeple = (fill: string): string =>
  `<path d="M12 3a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM6 21l1.5-6L4 12.5l4-1.5h8l4 1.5-3.5 2.5L18 21h-4l-2-4-2 4z" fill="${fill}" stroke="#222" stroke-width="1.5" stroke-linejoin="round"/>`;

/** 小さいワーカー（左上を x, y に置き、scale で縮める）。 */
const smallMeeple = (x: number, y: number, scale: number, fill: string): string =>
  `<g transform="translate(${x} ${y}) scale(${scale})">${meeple(fill)}</g>`;

const card = (inner: string): string =>
  `<rect x="5" y="2.5" width="14" height="19" rx="2" fill="#2f4a7a" stroke="#1d2f50" stroke-width="1.5"/>${inner}`;

const coin = (cx: number, cy: number, r: number): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${AXIS_COLORS.economy}" stroke="#7a5f10" stroke-width="1.3"/>`;

const shieldPath = 'M12 2l8 3v6c0 5-3.5 9-8 11c-4.5-2-8-6-8-11V5z';

/** 丸い札（タグ）。色の地に白い図柄を載せる。 */
const badge = (color: string, inner: string): string => `<circle cx="12" cy="12" r="10.5" fill="${color}"/>${inner}`;
const W = 'stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"';

// ---------------------------------------------------------------------------
// 建物：屋根の形だけでなく、全体の形（店先・工場・神殿・角帽・家・天幕・城壁）で描き分ける（4-2）
// ---------------------------------------------------------------------------

const BUILDING_ART = {
  // 商店：縞の日よけと店先
  shop: `<rect x="4" y="10" width="16" height="11" fill="${AXIS_COLORS.economy}" stroke="#333" stroke-width="1.5"/><rect x="10" y="14" width="4" height="7" fill="#fff" stroke="#333" stroke-width="1.2"/><path d="M3 5h18v4H3z" fill="#fff" stroke="#333" stroke-width="1.5"/><path d="M3 5h4.5v4H3zM12 5h4.5v4H12z" fill="#c8453b"/><path d="M3 9a2.25 2 0 0 0 4.5 0a2.25 2 0 0 0 4.5 0a2.25 2 0 0 0 4.5 0a2.25 2 0 0 0 4.5 0" fill="#fff" stroke="#333" stroke-width="1.3"/>`,
  // 工房：のこぎり屋根の工場と煙突
  workshop: `<circle cx="18.5" cy="2.8" r="1.4" fill="#aaa"/><circle cx="20.8" cy="1.8" r="1" fill="#ccc"/><path d="M3 21V11l5 3.2V11l5 3.2V11l4.5 3V5h3v16z" fill="${AXIS_COLORS.economy}" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 17h2M10.5 17h2M15 17h2" stroke="#fff" stroke-width="2"/>`,
  // 砦：狭間のある城壁
  fort: `<path d="M5 21V7h3v2h2V7h4v2h2V7h3v14z" fill="${AXIS_COLORS.military}" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/><path d="M10 21v-4a2 2 0 0 1 4 0v4" fill="#fff" stroke="#333" stroke-width="1.2"/>`,
  // 役所：三角の破風と柱の並ぶ建物
  office: `<path d="M2.5 9L12 3.5 21.5 9z" fill="${AXIS_COLORS.welfare}" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/><rect x="3.5" y="9" width="17" height="2" fill="${AXIS_COLORS.welfare}" stroke="#333" stroke-width="1.2"/><path d="M6 11v7M10 11v7M14 11v7M18 11v7" stroke="#333" stroke-width="2.2"/><rect x="2.5" y="18" width="19" height="3" fill="${AXIS_COLORS.welfare}" stroke="#333" stroke-width="1.2"/>`,
  // 大学：時計塔のある学舎。塔の上に角帽を載せる
  university: `<rect x="2" y="12" width="20" height="9" fill="${AXIS_COLORS.culture}" stroke="#333" stroke-width="1.5"/><rect x="8.5" y="7.5" width="7" height="13.5" fill="#8f63b5" stroke="#333" stroke-width="1.5"/><path d="M5.5 7.2L12 3.8l6.5 3.4L12 10.4z" fill="#3b2650" stroke="#222" stroke-width="1.1" stroke-linejoin="round"/><path d="M17.2 7.2v3.6" stroke="#f2c84b" stroke-width="1.3"/><circle cx="17.2" cy="11.2" r=".9" fill="#f2c84b"/><circle cx="12" cy="12.3" r="1.8" fill="#fff" stroke="#333" stroke-width="1"/><path d="M12 11.3v1.1l.7.5" stroke="#333" stroke-width=".8" stroke-linecap="round" fill="none"/><path d="M10.5 21v-3.2a1.5 1.5 0 0 1 3 0V21" fill="#fff" stroke="#333" stroke-width="1.1"/><rect x="4" y="14.5" width="2.6" height="3" fill="#fff" stroke="#333" stroke-width=".9"/><rect x="17.4" y="14.5" width="2.6" height="3" fill="#fff" stroke="#333" stroke-width=".9"/>`,
  // 住宅：煙突のある家、戸と窓
  house: `<rect x="15" y="4" width="2.6" height="5" fill="#8a4a16" stroke="#333" stroke-width="1.2"/><path d="M2 12L12 3.5 22 12z" fill="#a85d1c" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/><rect x="5" y="12" width="14" height="9" fill="${AXIS_COLORS.welfare}" stroke="#333" stroke-width="1.5"/><rect x="7" y="14" width="3" height="3" fill="#fff" stroke="#333" stroke-width="1"/><rect x="12.5" y="15" width="3.5" height="6" fill="#fff" stroke="#333" stroke-width="1"/>`,
  // 飯場：入口の開いた天幕
  camp: `<path d="M2 21L12 4l10 17z" fill="#8a8a8a" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 21L8.5 14 12 8.5 15.5 14z" fill="#fff" stroke="#333" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 4L10.5 1.5M12 4l1.5-2.5" stroke="#333" stroke-width="1.3" stroke-linecap="round"/><path d="M1 21h22" stroke="#333" stroke-width="1.5" stroke-linecap="round"/>`,
} as const;

/** 塗った剣（上向き、中心 x=12）。刃は金属、つばと柄頭は金、柄は茶。教練と軍事レベルに使う。 */
const SWORD_UP = `<path d="M12 1.8l1.5 2.2v10.3h-3V4z" fill="#dfe4ea" stroke="#333" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 4.6v9" stroke="#9aa3ad" stroke-width=".9"/><rect x="7.6" y="14.3" width="8.8" height="2.2" rx="1.1" fill="#d4a62a" stroke="#333" stroke-width="1"/><rect x="11" y="16.5" width="2" height="3.8" fill="#7a4a22" stroke="#333" stroke-width=".9"/><circle cx="12" cy="21.3" r="1.4" fill="#d4a62a" stroke="#333" stroke-width=".9"/>`;

/** 剣を中心 (12,12) のまわりに回して、縮めて置く。 */
const swordAt = (angle: number, scale: number, dx: number, dy: number): string =>
  `<g transform="translate(${dx} ${dy}) rotate(${angle} 12 12) translate(12 12) scale(${scale}) translate(-12 -12)">${SWORD_UP}</g>`;

/** 建物の図案を縮めて置く（合成のアイコン用）。 */
const smallArt = (art: string, x: number, y: number, scale: number): string =>
  `<g transform="translate(${x} ${y}) scale(${scale})">${art}</g>`;

// ---------------------------------------------------------------------------
// 防衛ライン・撃退ライン（7-4）：盾と剣、背後に点線（ライン）
// ---------------------------------------------------------------------------

const LINE_BEHIND = `<path d="M1.5 13h21" stroke="#222" stroke-width="1.6" stroke-dasharray="2.2 1.6"/>`;
const SWORD = `<path d="M12 2.5v13" stroke="${AXIS_COLORS.military}" stroke-width="3" stroke-linecap="round"/><path d="M8 15.5h8M12 15.5v5" stroke="#333" stroke-width="2.4" stroke-linecap="round"/>`;

export const ICON_ART: Readonly<Record<string, string>> = {
  // 資源
  'res.gold': `<circle cx="12" cy="12" r="9" fill="${AXIS_COLORS.economy}" stroke="#7a5f10" stroke-width="1.5"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#7a5f10" stroke-width="1.2"/>`,
  'res.materials': `<rect x="3" y="14" width="18" height="5" rx="1" fill="#9a6b3e" stroke="#5a3b1e" stroke-width="1.2"/><rect x="5" y="9" width="14" height="5" rx="1" fill="#b3824f" stroke="#5a3b1e" stroke-width="1.2"/><rect x="7" y="4" width="10" height="5" rx="1" fill="#c99a63" stroke="#5a3b1e" stroke-width="1.2"/>`,
  'res.militaryTokens': `<path d="${shieldPath}" fill="${AXIS_COLORS.military}" stroke="#5e1f1a" stroke-width="1.5"/>`,
  'res.civCard': card(`<path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`),
  'res.specialCitizen': card(`<circle cx="12" cy="9" r="2.6" fill="#fff"/><path d="M7.5 18c.8-3 2.4-4.5 4.5-4.5s3.7 1.5 4.5 4.5z" fill="#fff"/>`),
  'res.points': `<path d="M8 20C3.5 17.5 2.5 10 6 4.5M16 20c4.5-2.5 5.5-10 2-15.5" fill="none" stroke="${AXIS_COLORS.nature}" stroke-width="2" stroke-linecap="round"/><path d="M5.2 8.5c-2-.3-2.8-1.6-2.6-3 1.6-.2 2.8.8 2.6 3zM4.6 13c-2 .3-3.2-.6-3.4-2 1.5-.6 2.9.1 3.4 2zM6.3 17c-1.7 1-3.1.7-3.8-.5 1.1-1.1 2.7-.9 3.8.5zM18.8 8.5c2-.3 2.8-1.6 2.6-3-1.6-.2-2.8.8-2.6 3zM19.4 13c2 .3 3.2-.6 3.4-2-1.5-.6-2.9.1-3.4 2zM17.7 17c1.7 1 3.1.7 3.8-.5-1.1-1.1-2.7-.9-3.8.5z" fill="${AXIS_COLORS.nature}"/>`,
  'res.regularWorkers': meeple('#222'),
  'res.tempWorkers': meeple('#fff'),
  // 生産力：台座に載せる（4-3-4）
  'res.goldProduction': `<rect x="2" y="18" width="20" height="4" rx="1" fill="#555"/><circle cx="12" cy="10" r="7" fill="${AXIS_COLORS.economy}" stroke="#7a5f10" stroke-width="1.5"/><circle cx="12" cy="10" r="4" fill="none" stroke="#7a5f10" stroke-width="1.2"/>`,
  'res.materialProduction': `<rect x="2" y="18" width="20" height="4" rx="1" fill="#555"/><rect x="4" y="11" width="16" height="5" rx="1" fill="#9a6b3e" stroke="#5a3b1e" stroke-width="1.2"/><rect x="7" y="5" width="10" height="5" rx="1" fill="#c99a63" stroke="#5a3b1e" stroke-width="1.2"/>`,
  // トラック：上向きの矢を右に添える
  // 軍事レベル：斜めに掲げた剣と上向きの矢（インフラの道路と対にする）
  'track.military': `${swordAt(40, 1.08, -3.2, 0.3)}<path d="M20 22v-8M17.5 16.5L20 14l2.5 2.5" ${S} stroke="#222"/>`,
  // インフラ：まっすぐ延びる道（遠近の道路と中央の白線）
  'track.infra': `<path d="M1.5 21.5L7 5h4l5.5 16.5z" fill="${INFRA}" stroke="#1f4e80" stroke-width="1.3" stroke-linejoin="round"/><path d="M9 7.5v2M9 12v2.5M9 17.5v3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M20 22v-8M17.5 16.5L20 14l2.5 2.5" ${S} stroke="#222"/>`,
  // 建物
  'bld.shop': BUILDING_ART.shop,
  'bld.workshop': BUILDING_ART.workshop,
  'bld.fort': BUILDING_ART.fort,
  'bld.office': BUILDING_ART.office,
  'bld.university': BUILDING_ART.university,
  'bld.house': BUILDING_ART.house,
  'bld.camp': BUILDING_ART.camp,
  // 地形（rules.md 2-1-6）
  'ter.plains': hex('#e9d66b'),
  'ter.forest': hex('#4f9a4f'),
  'ter.mountain': hex('#9a9a9a'),
  'ter.water': hex('#7fc4e8'),
  'ter.match': `${hex('#ffffff')}<path d="M8 10h8M8 14h8" stroke="#444" stroke-width="2"/>`,
  'ter.any': `<path d="M12 2L21 7V12H12z" fill="#e9d66b"/><path d="M21 12V17L12 22V12z" fill="#4f9a4f"/><path d="M12 22L3 17V12H12z" fill="#9a9a9a"/><path d="M3 12V7L12 2V12z" fill="#7fc4e8"/><polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="none" stroke="#444" stroke-width="1.5"/>`,
  // 文明カードのタグ（8種）：色の丸札に白い図柄
  'tag.military': badge(TAG_COLORS.military, `<path d="M7.5 16.5L16 8M14 6.8l3-.8-.8 3M6.5 14l3.5 3.5M5.5 18.5l1.5-1.5" ${W}/>`),
  'tag.economy': badge(TAG_COLORS.economy, `<ellipse cx="12" cy="16.5" rx="5.5" ry="2" fill="${TAG_COLORS.economy}" stroke="#fff" stroke-width="1.6"/><ellipse cx="12" cy="13" rx="5.5" ry="2" fill="${TAG_COLORS.economy}" stroke="#fff" stroke-width="1.6"/><ellipse cx="12" cy="9.5" rx="5.5" ry="2" fill="${TAG_COLORS.economy}" stroke="#fff" stroke-width="1.6"/>`),
  'tag.academic': badge(TAG_COLORS.academic, `<path d="M9.5 5h5M10.3 5v4.6L6.4 16.6a1.6 1.6 0 0 0 1.4 2.4h8.4a1.6 1.6 0 0 0 1.4-2.4L13.7 9.6V5" ${W}/><path d="M8.2 14.5h7.6" stroke="#fff" stroke-width="1.6"/>`),
  // 生活：箸を添えた茶わん
  'tag.life': badge(TAG_COLORS.life, `<path d="M4.5 12h15a7.5 6.5 0 0 1-15 0z" fill="#fff"/><rect x="9.5" y="17.6" width="5" height="1.6" rx=".6" fill="#fff"/><path d="M11 10.2L18 4.2M13.5 10.6L19.5 6" ${W} stroke-width="1.6"/>`),
  'tag.environment': badge(TAG_COLORS.environment, `<path d="M6 18C6 10.5 10.5 6 18 6c0 7.5-4.5 12-12 12z" fill="#fff"/><path d="M6.5 17.5L13 11" stroke="${TAG_COLORS.environment}" stroke-width="1.6" stroke-linecap="round"/>`),
  'tag.literature': badge(TAG_COLORS.literature, `<path d="M17.5 4.5c-6 .8-9.3 5.5-10.3 12.5l3-3c4.5-.2 7.3-3 7.3-9.5z" fill="#fff"/><path d="M7.2 17l-1.7 2.8" ${W}/>`),
  'tag.art': badge(TAG_COLORS.art, `<path d="M12 4.5a7.5 7.5 0 1 0 0 15c1.4 0 1.9-1 1.4-2s0-2 1.4-2h1.9a2.8 2.8 0 0 0 2.8-2.8c0-4.6-3.4-8.2-7.5-8.2z" fill="#fff"/><circle cx="8.3" cy="10.5" r="1.3" fill="${TAG_COLORS.art}"/><circle cx="11" cy="7.8" r="1.3" fill="${TAG_COLORS.art}"/><circle cx="14.8" cy="8.6" r="1.3" fill="${TAG_COLORS.art}"/>`),
  'tag.music': badge(TAG_COLORS.music, `<path d="M10.3 16.5V6.8l6.9-1.9v9.5" ${W}/><circle cx="8.3" cy="16.6" r="2.2" fill="#fff"/><circle cx="15.2" cy="14.5" r="2.2" fill="#fff"/>`),
  // 命令
  'cmd.gain': `<circle cx="12" cy="12" r="9.5" fill="#e8f3ea" stroke="${AXIS_COLORS.nature}" stroke-width="1.5"/><path d="M12 7v10M7 12h10" stroke="${AXIS_COLORS.nature}" stroke-width="2.4" stroke-linecap="round"/>`,
  'cmd.raise': `<path d="M12 21V5M5.5 11L12 4.5 18.5 11" ${S} stroke="${INK}" stroke-width="2.6"/>`,
  'cmd.if': `<path d="M12 2.5L21.5 12 12 21.5 2.5 12z" fill="#eee" stroke="#444" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.8v.4" ${S} stroke="#444"/><circle cx="12" cy="17" r="1.2" fill="#444"/>`,
  'cmd.placeTiles': `${hex('#e9d66b')}<path d="M12 8v8M8 12h8" stroke="#444" stroke-width="2"/>`,
  'cmd.build': `${smallArt(BUILDING_ART.house, 0, 2, 0.82)}<circle cx="18" cy="17.5" r="5" fill="#fff" stroke="#333" stroke-width="1.3"/><path d="M18 15v5M15.5 17.5h5" stroke="#333" stroke-width="1.8" stroke-linecap="round"/>`,
  'cmd.playCard': card(`<path d="M12 7l1.5 3.2 3.5.4-2.6 2.4.7 3.5-3.1-1.8-3.1 1.8.7-3.5L7 10.6l3.5-.4z" fill="#f2d24b"/>`),
  'cmd.expeditionRewards': `<path d="M6 21V3M6 4h11l-3 4 3 4H6" ${S} stroke="${AXIS_COLORS.military}"/>`,
  'cmd.chooseOne': `<path d="M7 4H4v16h3M17 4h3v16h-3M12 6v12" ${S} stroke="#444"/>`,
  'cmd.copyAction': `<rect x="3" y="3" width="12" height="12" rx="2" ${S} stroke="#444"/><rect x="9" y="9" width="12" height="12" rx="2" fill="#fff" stroke="#444" stroke-width="2"/>`,
  'cmd.drawPlannedCity': `<rect x="4" y="2.5" width="14" height="19" rx="2" fill="#f4efe0" stroke="#6b5a2e" stroke-width="1.5"/>${hexAt(9, 9, 3, '#9a9a9a')}${hexAt(13.5, 11.5, 3, '#e9d66b')}${hexAt(9, 14, 3, '#7fc4e8')}<path d="M20 6v8M17.5 11.5L20 14l2.5-2.5" ${S} stroke="#222"/>`,
  'cmd.spiritPlace': `${hex('#4f9a4f')}<path d="M12 6l1.4 4.1L17.5 12l-4.1 1.4L12 17.5l-1.4-4.1L6.5 12l4.1-1.9z" fill="#fff6c2" stroke="#8a7a20" stroke-width="1"/>`,
  'cmd.heroStart': `${hex('#9a9a9a')}${smallArt(BUILDING_ART.fort, 5, 5.5, 0.58)}`,
  // 能力の札（4-3-6）
  'ability.onPlay': card(`<path d="M12 7l1.5 3.2 3.5.4-2.6 2.4.7 3.5-3.1-1.8-3.1 1.8.7-3.5L7 10.6l3.5-.4z" fill="#f2d24b"/>`),
  'ability.onAcquire': card(`<path d="M12 6v9M8.5 11.5L12 15l3.5-3.5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  // 準備時は「最初の手番」の旗1と対にする旗0（ユーザー決定 2026-11-03）。
  'ability.setup': `<path d="M6 21V3M6 4h12v8H6" ${S} stroke="${BLUE}"/><text x="12" y="10.5" text-anchor="middle" font-size="7" font-weight="700" fill="${BLUE}">0</text>`,
  'ability.firstTurnStart': `<path d="M6 21V3M6 4h12v8H6" ${S} stroke="${BLUE}"/><text x="12" y="10.5" text-anchor="middle" font-size="7" font-weight="700" fill="${BLUE}">1</text>`,
  'ability.gameEnd': `<path d="M6 21V3" ${S} stroke="#222"/><path d="M6 3h4v4H6zM14 3h4v4h-4zM10 7h4v4h-4z" fill="#222"/><rect x="6" y="3" width="12" height="8" fill="none" stroke="#222" stroke-width="1.5"/>`,
  'ability.on': `<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" ${S} stroke="${BLUE}"/>`,
  'ability.modifier': `<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" ${S} stroke="${BLUE}"/>`,
  'ability.freeAction': `<path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="#f2d24b" stroke="#7a5f10" stroke-width="1.5" stroke-linejoin="round"/>`,
  'ability.actionSpace': `<rect x="3" y="3" width="18" height="18" rx="4" fill="#eee" stroke="#444" stroke-width="1.5" stroke-dasharray="3 2"/>${smallMeeple(4.8, 4.8, 0.6, '#222')}`,
  // 指標
  'met.freeLandTiles': `${hex('#e9d66b')}<path d="M8 17v-5l4-3.5 4 3.5v5z" fill="none" stroke="#444" stroke-width="1.5" stroke-dasharray="2 1.5" stroke-linejoin="round"/>`,
  'met.maxedBuildingTypes': `${smallArt(BUILDING_ART.house, 0, 0, 0.5)}${smallArt(BUILDING_ART.shop, 12, 0, 0.5)}${smallArt(BUILDING_ART.fort, 6, 10, 0.5)}<path d="M15 18.5l2.5 2.5 5-6" ${S} stroke="${AXIS_COLORS.nature}" stroke-width="2.4"/>`,
  'met.defenseLine': `${LINE_BEHIND}<path d="M12 4l6 2.3v4.5c0 3.8-2.6 6.8-6 8.2-3.4-1.4-6-4.4-6-8.2V6.3z" fill="#f3d6d3" stroke="${AXIS_COLORS.military}" stroke-width="2"/>`,
  'met.repelLine': `${LINE_BEHIND}${SWORD}`,
  'met.repelShortfall': `${LINE_BEHIND}${SWORD}<path d="M19.5 9V3.5M17.5 5.5l2-2 2 2" ${S} stroke="#222" stroke-width="1.6"/>`,
  'met.spiritAdjacency': `${hexAt(8, 12, 6, '#4f9a4f')}${hexAt(17, 12, 6, '#4f9a4f')}<path d="M8 8.5l.9 2.6 2.6.9-2.6.9L8 15.5l-.9-2.6-2.6-.9 2.6-.9z" fill="#fff6c2" stroke="#8a7a20" stroke-width=".8"/>`,
  'met.buildingsOfType': `<path d="M9 4L7 20M17 4l-2 16M4.5 9h16M3.5 15h16" ${S} stroke="#444"/>`,
  'met.buildingsOnTerrain': `${hex('#e9d66b')}${smallArt(BUILDING_ART.house, 5.5, 5, 0.55)}`,
  // 出来事（〜した時）
  'evt.actionExecuted': `<rect x="3" y="12" width="18" height="9" rx="2" fill="#eee" stroke="#444" stroke-width="1.5"/>${smallMeeple(7.5, 1, 0.38, '#222')}<path d="M12 9.5v3" stroke="#444" stroke-width="1.5"/>`,
  // 補正
  'mod.buildCost': `${smallArt(BUILDING_ART.house, 0, 1, 0.75)}${coin(17.5, 17, 5)}<path d="M15 17h5" stroke="#7a5f10" stroke-width="1.8" stroke-linecap="round"/>`,
  'mod.pioneerMismatchExtra': `${hexAt(7, 9, 5.5, '#e9d66b')}${hexAt(15, 14, 5.5, '#7fc4e8')}<path d="M19 2.5v5M16.5 5h5" stroke="#222" stroke-width="1.8" stroke-linecap="round"/>`,
  'mod.regularWorkersImmediate': `${smallMeeple(0, 2, 0.8, '#222')}<path d="M18.5 3L14 11h3.5l-1 7 5-9h-3.5z" fill="#f2d24b" stroke="#7a5f10" stroke-width="1.1" stroke-linejoin="round"/>`,
  'mod.goldPointsMultiplier': `${coin(8.5, 12, 6.5)}<path d="M15.5 9l5 6M20.5 9l-5 6" stroke="#222" stroke-width="2" stroke-linecap="round"/>`,
  'mod.natureParkPoints': `<path d="M12 2L4.5 13h4L5 18h14l-3.5-5h4z" fill="${AXIS_COLORS.nature}" stroke="#2a5a3a" stroke-width="1.3" stroke-linejoin="round"/><rect x="10.5" y="18" width="3" height="4" fill="#7a5230"/>`,
  'mod.expeditionRewards': `<path d="M5 21V3M5 4h10l-3 4 3 4H5" ${S} stroke="${AXIS_COLORS.military}"/><path d="M19 13v7M15.5 16.5h7" stroke="#222" stroke-width="2" stroke-linecap="round"/>`,
  'mod.noBuildOnSpiritLand': `${smallArt(BUILDING_ART.house, 3, 3, 0.75)}<circle cx="12" cy="12" r="10" fill="none" stroke="#c8453b" stroke-width="2.2"/><path d="M5 19L19 5" stroke="#c8453b" stroke-width="2.2"/>`,
  // 襲撃の結果（7-4-5）
  'raid.defenseFailed': `<path d="${shieldPath}" fill="#9a9a9a" stroke="#555" stroke-width="1.5"/><path d="M12.5 4.5l-2.5 5.5 3.2 2.2-2.6 6.3" ${W} stroke-width="1.8"/>`,
  'raid.defended': `<path d="${shieldPath}" fill="${AXIS_COLORS.military}" stroke="#5e1f1a" stroke-width="1.5"/><path d="M8 12l3 3 5-6" ${W} stroke-width="2.4"/>`,
  'raid.repelled': `<path d="${shieldPath}" fill="${AXIS_COLORS.military}" stroke="#5e1f1a" stroke-width="1.5"/><path d="M12 6l1.6 3.6 3.9.4-2.9 2.6.8 3.9L12 14.5l-3.4 2 .8-3.9-2.9-2.6 3.9-.4z" fill="#f2d24b"/>`,
  // アクションの段階：山形の数（通常1・上位2・最上位3）
  'tier.normal': `<path d="M5 15l7-5 7 5" ${S} stroke="#666" stroke-width="2.6"/>`,
  'tier.upper': `<path d="M5 12.5l7-5 7 5M5 18l7-5 7 5" ${S} stroke="${BLUE}" stroke-width="2.4"/>`,
  'tier.top': `<path d="M5 9l7-5 7 5M5 14l7-5 7 5M5 19l7-5 7 5" ${S} stroke="#b8901a" stroke-width="2.2"/>`,
  // 記号（4-3）
  'sym.per': `<path d="M17 4L7 20" ${S} stroke="#444"/>`,
  'sym.then': `<path d="M4 12h15M14 7l5 5-5 5" ${S} stroke="#444"/>`,
  'sym.ge': `<path d="M7 5l10 5-10 5M7 19h10" ${S} stroke="#444"/>`,
  'sym.lt': `<path d="M17 6L7 12l10 6" ${S} stroke="#444"/>`,
  'sym.upTo': `<path d="M17 5L7 10l10 5M7 19h10" ${S} stroke="#444"/>`,
  'sym.or': `<path d="M12 3v18" ${S} stroke="#444"/>`,
  'sym.colon': `<circle cx="12" cy="7.5" r="2.2" fill="#444"/><circle cx="12" cy="16.5" r="2.2" fill="#444"/>`,
  'sym.oncePerRound': `<circle cx="12" cy="12" r="9" ${S} stroke="#444"/><text x="12" y="16" text-anchor="middle" font-size="10" font-weight="700" fill="#444">1R</text>`,
  'sym.once': `<circle cx="12" cy="12" r="9" fill="#444"/><text x="12" y="16" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">1</text>`,
  'sym.free': `<circle cx="12" cy="12" r="8" fill="${AXIS_COLORS.economy}" stroke="#7a5f10" stroke-width="1.5"/><path d="M5 19L19 5" stroke="#b5423b" stroke-width="2.5" stroke-linecap="round"/>`,
  'sym.noGold': `<circle cx="12" cy="12" r="8" fill="${AXIS_COLORS.economy}" stroke="#7a5f10" stroke-width="1.5"/><path d="M5 19L19 5" stroke="#b5423b" stroke-width="2.5" stroke-linecap="round"/>`,
  // 支払う：硬貨を差し出す（手から出ていく矢）
  'sym.pay': `${coin(9, 12, 7)}<path d="M15 12h7M19 8.5l3.5 3.5-3.5 3.5" ${S} stroke="#222" stroke-width="2.2"/>`,
  // 文明カードを捨てる：ふた付きのごみ箱に、文明カードを入れる
  'sym.discard': `<rect x="10.5" y="0.8" width="7" height="9.5" rx="1.2" fill="#2f4a7a" stroke="#1d2f50" stroke-width="1.2" transform="rotate(20 14 5.5)"/><rect x="3.5" y="8.2" width="14" height="2.6" rx="1" fill="#777" stroke="#333" stroke-width="1.3"/><path d="M8.5 8.2V6.8h4v1.4" fill="none" stroke="#333" stroke-width="1.3"/><path d="M5 10.8h11l-1.2 11H6.2z" fill="#9a9a9a" stroke="#333" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.6 13.5v5.8M10.5 13.5v5.8M12.4 13.5v5.8" stroke="#555" stroke-width="1.2" stroke-linecap="round"/>`,
  'sym.workers': meeple('#888'),
  'sym.every': `<path d="M4.5 10a8 8 0 0 1 14-3.5M19.5 14a8 8 0 0 1-14 3.5" ${S} stroke="#444"/><path d="M19 3v4h-4M5 21v-4h4" ${S} stroke="#444"/>`,
  'sym.excludeSelf': `${card(`<path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`)}<path d="M3 21L21 3" stroke="#c8453b" stroke-width="2.4" stroke-linecap="round"/>`,
  'sym.axis': `<polygon points="12,2.5 21,9 17.6,19.8 6.4,19.8 3,9" fill="none" stroke="#444" stroke-width="1.5" stroke-linejoin="round"/><polygon points="12,6 17,10.5 15,16.5 8.5,15.5 6.5,10" fill="#9fc4e8" stroke="${BLUE}" stroke-width="1.3" stroke-linejoin="round"/>`,
  // パス時：手のひら（待った）
  'sym.pass': `<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.5 0-4-1.2-5.2-3.2L3.6 14a1.5 1.5 0 0 1 2.4-1.8L8 15" fill="#fbe3c8" stroke="#444" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  // 宣言しない・何もしない：斜線の入った輪
  'sym.none': `<circle cx="12" cy="12" r="8.5" fill="none" stroke="#777" stroke-width="2.2"/><path d="M6 18L18 6" stroke="#777" stroke-width="2.2" stroke-linecap="round"/>`,
  // 鍵（最上位の解放条件）
  'sym.lock': `<rect x="4.5" y="10.5" width="15" height="11" rx="2" fill="#666" stroke="#333" stroke-width="1.3"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" ${S} stroke="#333" stroke-width="2.2"/><circle cx="12" cy="15.5" r="1.6" fill="#fff"/>`,
  // 場面の見出し（ui_design.md 3-1）
  'scene.wait': `<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" ${S} stroke="#444"/><path d="M9 19h6l-3-3z" fill="#c9a227"/>`,
  'scene.count': `<path d="M9 4L7 20M17 4l-2 16M4.5 9h16M3.5 15h16" ${S} stroke="#444"/>`,
  'scene.order': `<path d="M10 6h10M10 12h10M10 18h10" ${S} stroke="#444"/><text x="5" y="8" text-anchor="middle" font-size="6.5" font-weight="700" fill="#444">1</text><text x="5" y="14" text-anchor="middle" font-size="6.5" font-weight="700" fill="#444">2</text><text x="5" y="20" text-anchor="middle" font-size="6.5" font-weight="700" fill="#444">3</text>`,
  'scene.convert': `<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" ${S} stroke="#444"/>`,
  'scene.bonus': `<rect x="3" y="3" width="18" height="18" rx="3" fill="#f4efe0" stroke="#6b5a2e" stroke-width="1.5"/><path d="M12 6.5l1.6 3.4 3.7.4-2.8 2.5.8 3.7L12 14.6l-3.3 1.9.8-3.7-2.8-2.5 3.7-.4z" fill="#f2c84b" stroke="#7a5f10" stroke-width="1"/>`,
  'scene.draft': `<rect x="3" y="5" width="10" height="14" rx="1.5" fill="#cfd8e6" stroke="#444" stroke-width="1.3" transform="rotate(-12 8 12)"/><rect x="7" y="4" width="10" height="14" rx="1.5" fill="#e6dcc6" stroke="#444" stroke-width="1.3"/><rect x="11" y="5" width="10" height="14" rx="1.5" fill="#fff" stroke="#444" stroke-width="1.3" transform="rotate(12 16 12)"/>`,
};

/** 4-2 のアクションの道具（アクションボード・履歴に使う）。開拓と建築は、向きと形が重ならないようにする。 */
export const ACTION_ART: Readonly<Record<string, string>> = {
  // 開拓：地面に刺したスコップ（茶色の刃）と、開いた土地
  pioneer: `<path d="M2 21.5h20" stroke="#6b4a2a" stroke-width="2" stroke-linecap="round"/><path d="M9 3h6M12 3v9" stroke="#222" stroke-width="2.2" stroke-linecap="round"/><path d="M8 12h8v3.5L12 20l-4-4.5z" fill="#a8743f" stroke="#222" stroke-width="1.6" stroke-linejoin="round"/>`,
  // 建築：横向きの金づちと積んだれんが
  build: `<rect x="2" y="17" width="9" height="4" fill="#c8634a" stroke="#222" stroke-width="1.3"/><rect x="6.5" y="13" width="9" height="4" fill="#d9785e" stroke="#222" stroke-width="1.3"/><path d="M13 9.5l8-6.5" stroke="#8a5a2b" stroke-width="2.6" stroke-linecap="round"/><path d="M9.2 4.6l4.2-2.2 3 5.6-4.2 2.2z" fill="#666" stroke="#222" stroke-width="1.3" stroke-linejoin="round"/>`,
  import: `<path d="M3 15h18l-3 5H6zM12 3v9M8.5 8.5L12 12l3.5-3.5" ${S} stroke="#222"/>`,
  export: `<path d="M3 15h18l-3 5H6zM12 12V3M8.5 6.5L12 3l3.5 3.5" ${S} stroke="#222"/>`,
  // 教練：交差させた2本の剣（稽古で打ち合う）
  drill: `${swordAt(-42, 1.1, 0, 0)}${swordAt(42, 1.1, 0, 0)}`,
  expedition: `<path d="M6 21V3M6 4h11l-3 4 3 4H6" ${S} stroke="#222"/>`,
  welfare: `<path d="M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10-8 10z" ${S} stroke="#222"/>`,
  migration: `<circle cx="8" cy="7" r="2.5" ${S} stroke="#222"/><path d="M4 20c0-4 2-7 4-7s4 3 4 7M14 12h7M18 9l3 3-3 3" ${S} stroke="#222"/>`,
  research: `<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z M12 6v14" ${S} stroke="#222"/>`,
  // 普及：文明カードを広める（カードから広がる波）
  spread: `<rect x="2.5" y="5" width="10" height="14" rx="1.5" fill="#2f4a7a" stroke="#1d2f50" stroke-width="1.3"/><path d="M5.5 9h4M5.5 12h4M5.5 15h2.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/><path d="M15.5 9a4 4 0 0 1 0 6M18.3 6.3a7.6 7.6 0 0 1 0 11.4" ${S} stroke="#222"/>`,
};

/**
 * 合成のアイコン（指標:建物、指標:地形）の図案。「商店の数」は商店に＃、「森林に建てた建物」は森林の六角形に家を重ねる。
 * 該当しなければ undefined。
 */
export const compositeArt = (icon: string): string | undefined => {
  const [base, target] = icon.split(':');
  if (target === undefined) return undefined;
  const targetArt = ICON_ART[target];
  if (targetArt === undefined) return undefined;
  if (base === 'met.buildingsOfType') {
    return `${smallArt(targetArt, 0, 0, 0.8)}<circle cx="18" cy="18" r="5.5" fill="#fff" stroke="#444" stroke-width="1.2"/><path d="M16.8 14.8l-.9 6.4M20 14.8l-.9 6.4M15 16.9h6.2M14.6 19.1h6.2" stroke="#444" stroke-width="1.1" stroke-linecap="round"/>`;
  }
  if (base === 'met.buildingsOnTerrain') {
    return `${targetArt}${smallArt(BUILDING_ART.house, 5.5, 5, 0.55)}`;
  }
  return undefined;
};
