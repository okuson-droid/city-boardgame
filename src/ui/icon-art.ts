// アイコンの図案（docs/styleguide-icons.md 4-2、案）。icon_keys.json の識別子ごとに、
// viewBox 0 0 24 24 の SVG の中身を文字列で持つ。描き込みは最小限とし、形で区別する（4-1）。
// 表にない識別子は Icon.tsx が仮の素材（色と1字）で出す。

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

const hex = (fill: string): string =>
  `<polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="${fill}" stroke="#444" stroke-width="1.5"/>`;

const meeple = (fill: string): string =>
  `<path d="M12 3a3 3 0 1 1 0 6a3 3 0 1 1 0-6zM6 21l1.5-6L4 12.5l4-1.5h8l4 1.5-3.5 2.5L18 21h-4l-2-4-2 4z" fill="${fill}" stroke="#222" stroke-width="1.5" stroke-linejoin="round"/>`;

const card = (inner: string): string =>
  `<rect x="5" y="2.5" width="14" height="19" rx="2" fill="#2f4a7a" stroke="#1d2f50" stroke-width="1.5"/>${inner}`;

const building = (roof: string, color: string): string =>
  `<rect x="5" y="11" width="14" height="10" fill="${color}" stroke="#333" stroke-width="1.5"/>${roof}`;

export const ICON_ART: Readonly<Record<string, string>> = {
  // 資源
  'res.gold': `<circle cx="12" cy="12" r="9" fill="${AXIS_COLORS.economy}" stroke="#7a5f10" stroke-width="1.5"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#7a5f10" stroke-width="1.2"/>`,
  'res.materials': `<rect x="3" y="14" width="18" height="5" rx="1" fill="#9a6b3e" stroke="#5a3b1e" stroke-width="1.2"/><rect x="5" y="9" width="14" height="5" rx="1" fill="#b3824f" stroke="#5a3b1e" stroke-width="1.2"/><rect x="7" y="4" width="10" height="5" rx="1" fill="#c99a63" stroke="#5a3b1e" stroke-width="1.2"/>`,
  'res.militaryTokens': `<path d="M12 2l8 3v6c0 5-3.5 9-8 11c-4.5-2-8-6-8-11V5z" fill="${AXIS_COLORS.military}" stroke="#5e1f1a" stroke-width="1.5"/>`,
  'res.civCard': card(`<path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`),
  'res.specialCitizen': card(`<circle cx="12" cy="9" r="2.6" fill="#fff"/><path d="M7.5 18c.8-3 2.4-4.5 4.5-4.5s3.7 1.5 4.5 4.5z" fill="#fff"/>`),
  'res.points': `<path d="M8 20C3.5 17.5 2.5 10 6 4.5M16 20c4.5-2.5 5.5-10 2-15.5" fill="none" stroke="${AXIS_COLORS.nature}" stroke-width="2" stroke-linecap="round"/><path d="M5.2 8.5c-2-.3-2.8-1.6-2.6-3 1.6-.2 2.8.8 2.6 3zM4.6 13c-2 .3-3.2-.6-3.4-2 1.5-.6 2.9.1 3.4 2zM6.3 17c-1.7 1-3.1.7-3.8-.5 1.1-1.1 2.7-.9 3.8.5zM18.8 8.5c2-.3 2.8-1.6 2.6-3-1.6-.2-2.8.8-2.6 3zM19.4 13c2 .3 3.2-.6 3.4-2-1.5-.6-2.9.1-3.4 2zM17.7 17c1.7 1 3.1.7 3.8-.5-1.1-1.1-2.7-.9-3.8.5z" fill="${AXIS_COLORS.nature}"/>`,
  'res.regularWorkers': meeple('#222'),
  'res.tempWorkers': meeple('#fff'),
  // 生産力：台座に載せる（4-3-4）
  'res.goldProduction': `<rect x="2" y="18" width="20" height="4" rx="1" fill="#555"/><circle cx="12" cy="10" r="7" fill="${AXIS_COLORS.economy}" stroke="#7a5f10" stroke-width="1.5"/><circle cx="12" cy="10" r="4" fill="none" stroke="#7a5f10" stroke-width="1.2"/>`,
  'res.materialProduction': `<rect x="2" y="18" width="20" height="4" rx="1" fill="#555"/><rect x="4" y="11" width="16" height="5" rx="1" fill="#9a6b3e" stroke="#5a3b1e" stroke-width="1.2"/><rect x="7" y="5" width="10" height="5" rx="1" fill="#c99a63" stroke="#5a3b1e" stroke-width="1.2"/>`,
  // トラック
  'track.military': `<path d="M6 18L16 8M14 6l4-1-1 4M5 15l4 4M4 20l2-2" ${S} stroke="${AXIS_COLORS.military}"/><path d="M20 22v-7M17.5 17.5L20 15l2.5 2.5" ${S} stroke="#222"/>`,
  'track.infra': `<path d="M2 16h14M4 16v-4a5 5 0 0 1 10 0v4" ${S} stroke="#2e6db0"/><path d="M20 22v-7M17.5 17.5L20 15l2.5 2.5" ${S} stroke="#222"/>`,
  // 建物（屋根の形で描き分け、評価軸の色で塗る）
  'bld.shop': building(`<path d="M3 11l2-5h14l2 5z" fill="#fff" stroke="#333" stroke-width="1.5"/><path d="M7 6l-1 5M12 6v5M17 6l1 5" stroke="${AXIS_COLORS.economy}" stroke-width="1.5"/>`, AXIS_COLORS.economy),
  'bld.workshop': building(`<circle cx="12" cy="7" r="3.5" fill="#fff" stroke="#333" stroke-width="1.5"/><path d="M12 2v1.5M12 10.5V12M7 7h1.5M15.5 7H17" stroke="#333" stroke-width="1.5"/>`, AXIS_COLORS.economy),
  'bld.fort': `<path d="M5 21V7h3v2h2V7h4v2h2V7h3v14z" fill="${AXIS_COLORS.military}" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/>`,
  'bld.office': building(`<path d="M3 11l9-6 9 6z" fill="#fff" stroke="#333" stroke-width="1.5"/><path d="M8.5 13v6M12 13v6M15.5 13v6" stroke="#fff" stroke-width="1.5"/>`, AXIS_COLORS.welfare),
  'bld.university': building(`<path d="M2 8l10-4 10 4-10 4z" fill="#fff" stroke="#333" stroke-width="1.5"/><path d="M19 9v4" stroke="#333" stroke-width="1.5"/>`, AXIS_COLORS.culture),
  'bld.house': building(`<path d="M3 12l9-8 9 8z" fill="#fff" stroke="#333" stroke-width="1.5"/>`, AXIS_COLORS.welfare),
  'bld.camp': `<path d="M2 20L12 4l10 16z" fill="${AXIS_COLORS.other}" stroke="#333" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 20l-3-6h6z" fill="#fff"/>`,
  // 地形（rules.md 2-1-6）
  'ter.plains': hex('#e9d66b'),
  'ter.forest': hex('#4f9a4f'),
  'ter.mountain': hex('#9a9a9a'),
  'ter.water': hex('#7fc4e8'),
  'ter.match': `${hex('#ffffff')}<path d="M8 10h8M8 14h8" stroke="#444" stroke-width="2"/>`,
  'ter.any': `<path d="M12 2L21 7V12H12z" fill="#e9d66b"/><path d="M21 12V17L12 22V12z" fill="#4f9a4f"/><path d="M12 22L3 17V12H12z" fill="#9a9a9a"/><path d="M3 12V7L12 2V12z" fill="#7fc4e8"/><polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="none" stroke="#444" stroke-width="1.5"/>`,
  // 命令
  'cmd.placeTiles': `${hex('#e9d66b')}<path d="M12 8v8M8 12h8" stroke="#444" stroke-width="2"/>`,
  'cmd.build': building(`<path d="M3 12l9-8 9 8z" fill="#fff" stroke="#333" stroke-width="1.5"/><path d="M12 14v5M9.5 16.5h5" stroke="#fff" stroke-width="2"/>`, '#555'),
  'cmd.playCard': card(`<path d="M12 7l1.5 3.2 3.5.4-2.6 2.4.7 3.5-3.1-1.8-3.1 1.8.7-3.5L7 10.6l3.5-.4z" fill="#f2d24b"/>`),
  'cmd.expeditionRewards': `<path d="M6 21V3M6 4h11l-3 4 3 4H6" ${S} stroke="${AXIS_COLORS.military}"/>`,
  'cmd.chooseOne': `<path d="M7 4H4v16h3M17 4h3v16h-3M12 6v12" ${S} stroke="#444"/>`,
  'cmd.copyAction': `<rect x="3" y="3" width="12" height="12" rx="2" ${S} stroke="#444"/><rect x="9" y="9" width="12" height="12" rx="2" fill="#fff" stroke="#444" stroke-width="2"/>`,
  // 能力の札（4-3-6）
  'ability.onPlay': card(`<path d="M12 7l1.5 3.2 3.5.4-2.6 2.4.7 3.5-3.1-1.8-3.1 1.8.7-3.5L7 10.6l3.5-.4z" fill="#f2d24b"/>`),
  'ability.onAcquire': card(`<path d="M12 6v9M8.5 11.5L12 15l3.5-3.5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  // 準備時は「最初の手番」の旗1と対にする旗0（ユーザー決定 2026-11-03）。
  'ability.setup': `<path d="M6 21V3M6 4h12v8H6" ${S} stroke="#2f5d8a"/><text x="12" y="10.5" text-anchor="middle" font-size="7" font-weight="700" fill="#2f5d8a">0</text>`,
  'ability.firstTurnStart': `<path d="M6 21V3M6 4h12v8H6" ${S} stroke="#2f5d8a"/><text x="12" y="10.5" text-anchor="middle" font-size="7" font-weight="700" fill="#2f5d8a">1</text>`,
  'ability.gameEnd': `<path d="M6 21V3" ${S} stroke="#222"/><path d="M6 3h4v4H6zM14 3h4v4h-4zM10 7h4v4h-4z" fill="#222"/><rect x="6" y="3" width="12" height="8" fill="none" stroke="#222" stroke-width="1.5"/>`,
  'ability.on': `<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" ${S} stroke="#2f5d8a"/>`,
  'ability.modifier': `<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" ${S} stroke="#2f5d8a"/>`,
  'ability.freeAction': `<path d="M13 2L5 14h6l-1 8 8-12h-6z" fill="#f2d24b" stroke="#7a5f10" stroke-width="1.5" stroke-linejoin="round"/>`,
  'ability.actionSpace': `<rect x="3" y="3" width="18" height="18" rx="4" fill="#eee" stroke="#444" stroke-width="1.5" stroke-dasharray="3 2"/>${meeple('#222').replace('stroke-width="1.5"', 'stroke-width="1" transform="translate(4.8 4.8) scale(0.6)"')}`,
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
};

/** 4-2 のアクションの道具（アクションボード・履歴に使う）。 */
export const ACTION_ART: Readonly<Record<string, string>> = {
  pioneer: `<path d="M5 19l9-9M12 5l7 7-3 1-5-5z" ${S} stroke="#222"/>`,
  build: `<path d="M4 20l9-9M11 5l5-2 5 5-2 5z" ${S} stroke="#222"/>`,
  import: `<path d="M3 15h18l-3 5H6zM12 3v9M8.5 8.5L12 12l3.5-3.5" ${S} stroke="#222"/>`,
  export: `<path d="M3 15h18l-3 5H6zM12 12V3M8.5 6.5L12 3l3.5 3.5" ${S} stroke="#222"/>`,
  drill: `<path d="M5 19L15 9M13 7l5-3-3 5M4 16l4 4" ${S} stroke="#222"/>`,
  expedition: `<path d="M6 21V3M6 4h11l-3 4 3 4H6" ${S} stroke="#222"/>`,
  welfare: `<path d="M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10-8 10z" ${S} stroke="#222"/>`,
  migration: `<circle cx="8" cy="7" r="2.5" ${S} stroke="#222"/><path d="M4 20c0-4 2-7 4-7s4 3 4 7M14 12h7M18 9l3 3-3 3" ${S} stroke="#222"/>`,
  research: `<path d="M4 5c3-1 6-1 8 1 2-2 5-2 8-1v14c-3-1-6-1-8 1-2-2-5-2-8-1z M12 6v14" ${S} stroke="#222"/>`,
  spread: `<path d="M5 4h11a3 3 0 0 1 0 6H8v8a2 2 0 1 1-4 0V6a2 2 0 0 1 1-2z" ${S} stroke="#222"/>`,
};
