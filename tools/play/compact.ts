// 対話プレイの短い出力（指示書 2026-11-11 対話プレイ軽量化、decisions.md 3-5）。
// 既定の出力をこの形にし、従来の全文（render.ts の renderShow・renderSteps）は --full のときだけ出す。
// - 対局中に変わらない文言（アクションボードの効果文・キャラクターの能力・カードの文）は ref に分け、既定の出力では ID と名前だけにする。
// - 新しく公開・獲得したもの（特別な市民カード・計画都市・ボーナスタイル・引いた文明カード・襲撃カード）は、その時点の出来事に1回だけ内容を出す。
// - 同じ種類の選択肢は1行に畳む（選択肢 ID の接頭辞と targetOf の種類だけで決める）。
// - 他の席の出来事は、手番ごとに1行にまとめる（replayTurns・turnSummary、記録の再生画面と共用）。
// ルールは計算しない。非公開情報（19-6-1）の規則は render.ts と同じで、視点以外の手札の内容と山札の順序を出さない。

import { ACTIONS, BUILDINGS, GAME_DATA, TERRAINS, TIERS, type GameData } from '../../src/data/index.ts';
import {
  decider,
  deltaText,
  describeScript,
  eventText,
  eventTurns,
  getOptions,
  isGameOver,
  queries,
  replayTurns,
  targetOf,
  turnSummary,
  type GameEvent,
  type GameState,
} from '../../src/game/index.ts';
import { conversionLabel } from '../../src/game/labels.ts';
import { PlayError, type Reveal, type Step } from './record.ts';
import { renderBoard, renderModel, scoreModel, showModel, type PlayerView, type ShowModel, type Viewer } from './render.ts';

// ---------------------------------------------------------------------------
// 欄（--only）
// ---------------------------------------------------------------------------

export const SECTIONS = ['progress', 'raid', 'actions', 'shared', 'self', 'hand', 'others', 'board', 'events', 'options'] as const;
export type Section = (typeof SECTIONS)[number];

const SECTION_LABELS: Readonly<Record<Section, string>> = {
  progress: '進行',
  raid: '襲撃',
  actions: 'アクションボード',
  shared: '共有の場',
  self: '自分',
  hand: '手札',
  others: '他のプレイヤー',
  board: '個人ボード',
  events: '出来事',
  options: '選択肢',
};

/** --only の指定を欄の列にする。知らない名前は、使える名前の一覧を添えて失敗する。 */
export const parseSections = (spec: string): Section[] => {
  const names = spec.split(',').map((s) => s.trim()).filter((s) => s !== '');
  const unknown = names.filter((n) => !(SECTIONS as readonly string[]).includes(n));
  if (unknown.length > 0 || names.length === 0) {
    throw new PlayError(`知らない欄の名前である：${unknown.join(',') || '（なし）'}（使える名前：${SECTIONS.map((s) => `${s}（${SECTION_LABELS[s]}）`).join('・')}）`);
  }
  return SECTIONS.filter((s) => names.includes(s));
};

export const REF_SECTIONS = ['actions', 'expedition', 'characters', 'bonus', 'raid', 'buildings', 'free', 'public'] as const;
export type RefSection = (typeof REF_SECTIONS)[number];

const REF_LABELS: Readonly<Record<RefSection, string>> = {
  actions: 'アクションボード',
  expedition: '遠征の報酬表',
  characters: 'キャラクター',
  bonus: 'ボーナスタイル',
  raid: '襲撃カード',
  buildings: '建物',
  free: 'フリーアクション',
  public: '公開中のカード',
};

export const parseRefSections = (spec: string): RefSection[] => {
  const names = spec.split(',').map((s) => s.trim()).filter((s) => s !== '');
  const unknown = names.filter((n) => !(REF_SECTIONS as readonly string[]).includes(n));
  if (unknown.length > 0 || names.length === 0) {
    throw new PlayError(`知らない欄の名前である：${unknown.join(',') || '（なし）'}（使える名前：${REF_SECTIONS.map((s) => `${s}（${REF_LABELS[s]}）`).join('・')}）`);
  }
  return REF_SECTIONS.filter((s) => names.includes(s));
};

export type CompactOptions = {
  /** 視点（省略時は選択待ちのプレイヤー）。 */
  readonly as?: Viewer;
  /** 出す欄（指定した欄だけを、詳しい形で出す）。 */
  readonly only?: readonly Section[];
  /** 個人ボードの地図も出す。 */
  readonly board?: boolean;
};

// ---------------------------------------------------------------------------
// 小さな部品
// ---------------------------------------------------------------------------

const P = (i: number | null): string => (i === null || i < 0 ? '-' : `P${i}`);

const nonZero = (entries: Readonly<Record<string, string | number>>): string =>
  Object.entries(entries)
    .filter(([, v]) => (typeof v === 'number' ? v !== 0 : !v.startsWith('0/') && v !== '0'))
    .map(([k, v]) => `${k}${typeof v === 'number' ? v : v.split('/')[0]}`)
    .join(' ');

const cardShort = (c: PlayerView['hand'] extends readonly (infer T)[] | null ? T : never): string =>
  `${c.id}「${c.name}」金${c.cost} [${c.tags.join('・')}] ${c.points}点`;

const raidOutcomeText = (d: GameData, id: number): string => {
  const card = d.raidCards.find((c) => c.id === id);
  if (card === undefined) return '';
  const o = queries.describeRaidOutcomes(card, d);
  return `防衛ライン+${card.defense_increase}・撃退ライン+${card.repel_increase}。防衛失敗 ${o.defenseFailed}／防衛成功 ${o.defended}／撃退成功 ${o.repelled}`;
};

const plannedText = (d: GameData, id: string): string => {
  const card = d.plannedCityCards.find((c) => c.id === id);
  if (card === undefined) return id;
  const slots = card.slots.map((s) => {
    const parts = [s.terrain === null ? '' : queries.terrainLabel(s.terrain), s.building === null ? '任意の建物' : queries.buildingLabel(s.building)];
    return `(${s.q},${s.r})${parts.filter((x) => x !== '').join('の')}`;
  });
  return `${card.name}（${id}）${card.shape}：${slots.join(' ')}／恩恵 ${card.benefits.map(queries.grantText).join('・')}`;
};

/** カード1枚の内容（文明カード・特別な市民カード・計画都市）。ref --card と、公開・獲得の出来事が使う。 */
export const cardText = (d: GameData, id: string): string | null => {
  const civ = d.civilizationCards.find((c) => c.id === id);
  if (civ !== undefined) {
    return `${id}「${civ.name}」金${civ.cost.gold}（割引前） [${civ.tags.map((t) => TAG_LABELS[t] ?? t).join('・')}] ${civ.points}点: ${queries.civCardEffect(d, id)}`;
  }
  if (d.specialCitizens.some((c) => c.id === id)) return `特別な市民カード${id}: ${queries.specialCitizenText(d, id)}`;
  if (d.plannedCityCards.some((c) => c.id === id)) return plannedText(d, id);
  return null;
};

const TAG_LABELS: Readonly<Record<string, string>> = {
  military: '軍事',
  economy: '経済',
  academic: '学術',
  life: '生活',
  environment: '環境',
  literature: '文学',
  art: '美術',
  music: '音楽',
};

// ---------------------------------------------------------------------------
// 選択肢を畳む（指示書 2-4）
// ---------------------------------------------------------------------------

type Opt = { readonly n: number; readonly id: string; readonly label: string };

/** 畳んだ選択肢の行。prefix があれば、各項目の識別子は prefix＋項目の先頭の語である。 */
export type FoldedRow = {
  readonly n: number;
  readonly header: string | null;
  readonly prefix: string | null;
  readonly items: readonly { readonly n: number; readonly key: string; readonly text: string }[];
};

/** マスを対象にする選択肢をマスごとに畳む閾値（選択肢の数がこれを超えたら畳む）。 */
const CELL_FOLD_OVER = 8;

const cellOf = (id: string): string | null => {
  const t = targetOf({ id, player: 0, label: '' });
  return t?.kind === 'cell' ? t.cell : null;
};

/** 同じ種類として畳む選択肢の家族。選択肢 ID の接頭辞と targetOf の種類だけで決める。null は畳まない。 */
const familyOf = (id: string, cellMode: boolean): string | null => {
  if (cellMode) {
    const cell = cellOf(id);
    // 「種類:値:マス」（建設）は種類と値でまとめ、それ以外（土地タイルの「種類:マス:値」など）はマスでまとめる。
    const parts = id.split(':');
    if (cell !== null && parts.length === 3 && parts[2] === cell) return `${parts[0]}:${parts[1]}:`;
    if (cell !== null) return `cell:${cell}`;
  }
  const parts = id.split(':');
  if (parts[0] === 'free' && parts.length === 3) return `free:${parts[1]}:`;
  if ((parts[0] === 'card' || parts[0] === 'sc') && parts.length === 2) return `${parts[0]}:`;
  if (parts[0] === 'draft' && parts.length === 3) return `draft:${parts[1]}:`;
  return null;
};

const familyHeader = (family: string, first: Opt, d: GameData): string => {
  if (family.startsWith('free:')) {
    const conv = d.params.freeActions.conversions.find((c) => `free:${c.id}:` === family);
    return conv === undefined ? 'フリーアクション' : conversionLabel(conv).replace(/：手札の文明カード(\d+)枚/, '：手札の文明カード$1枚を捨てる');
  }
  if (family === 'card:') {
    const verb = /をプレイする/.test(first.label) ? 'をプレイする' : /を捨てる/.test(first.label) ? 'を捨てる' : 'を選ぶ';
    return `文明カード${verb}`;
  }
  if (family === 'sc:') return '特別な市民カード（効果は ref --card <番号> か共有の場の公開時の出来事で見る）';
  if (family === 'draft:board:') return 'ドラフト：個人ボード';
  if (family === 'draft:character:') return 'ドラフト：キャラクター（能力は ref --only characters）';
  if (family === 'draft:bonus:') return 'ドラフト：ボーナスタイル';
  // マスを対象にする選択肢（建設など）：ラベルからマスを除いた部分（「商店を建てる」）。
  return first.label.replace(/^\S+ に/, '');
};

const itemText = (o: Opt, family: string, d: GameData, cellInfo?: (cell: string) => string): { key: string; text: string } => {
  const suffix = o.id.slice(family.length);
  if (family.startsWith('free:')) return { key: suffix, text: `${queries.civCardName(d, suffix)}` };
  if (family === 'card:') {
    const cost = /（([^（）]*)）$/.exec(o.label)?.[1];
    return { key: suffix, text: `${queries.civCardName(d, suffix)}${cost === undefined ? '' : ` ${cost}`}` };
  }
  if (family === 'sc:') return { key: suffix, text: suffix };
  if (family === 'draft:board:') return { key: suffix, text: `${suffix}（${queries.boardName(d, suffix)}）` };
  if (family === 'draft:character:') return { key: suffix, text: `${suffix}（${queries.characterName(d, suffix)}）` };
  if (family === 'draft:bonus:') return { key: suffix, text: `${suffix}（${queries.bonusTileText(d, Number(suffix))}）` };
  return { key: suffix, text: `${suffix}${cellInfo?.(suffix) ?? ''}` };
};

/**
 * マスごとの行。選択肢 ID が「種類:マス:値」でそろっていれば接頭辞と値に分け、そうでなければ ID をそのまま並べる。
 * 見出しはラベルの「マス（地形）」とマスボーナスの部分（地図を出さなくてもマスの地形とボーナスが分かるように）。
 * 「地形と異なる」の注記は、見出しのマスの地形と比べれば分かるため項目には付けない。
 */
const cellRow = (cell: string, group: readonly Opt[]): FoldedRow => {
  const first = group[0];
  const head = first === undefined ? cell : (/^(\S+?（[^）]*）)/.exec(first.label)?.[1] ?? cell);
  const bonus = first === undefined ? null : /（マスボーナス：[^）]*）/.exec(first.label)?.[0] ?? null;
  const prefixes = new Set(group.map((o) => o.id.split(':').slice(0, 2).join(':')));
  const [only] = [...prefixes];
  const uniform = prefixes.size === 1 && only !== undefined && group.every((o) => o.id.split(':').length === 3 && o.id.split(':')[1] === cell);
  const items = group.map((o) => {
    const what = /に(.+?)の土地タイルを置く/.exec(o.label)?.[1] ?? o.label.replace(/^.*?に/, '').replace(/を(置く|建てる).*$/, '');
    return uniform ? { n: o.n, key: o.id.split(':')[2] ?? '', text: `${o.id.split(':')[2] ?? ''}（${what}）` } : { n: o.n, key: o.id, text: `${o.id}（${what}）` };
  });
  return { n: group[0]?.n ?? 0, header: `${head}${bonus ?? ''}`, prefix: uniform ? `${only}:` : null, items };
};

/** cellInfo はマスの補足（置いた土地タイルの地形など）。省略すれば付けない。 */
export const foldOptions = (options: readonly Opt[], d: GameData = GAME_DATA, cellInfo?: (cell: string) => string): FoldedRow[] => {
  const cellMode = options.length > CELL_FOLD_OVER;
  const rows: { n: number; header: string | null; prefix: string | null; items: { n: number; key: string; text: string }[] }[] = [];
  const byFamily = new Map<string, (typeof rows)[number]>();
  const byCell = new Map<string, Opt[]>();
  for (const o of options) {
    const family = familyOf(o.id, cellMode);
    if (family === null) {
      rows.push({ n: o.n, header: null, prefix: null, items: [{ n: o.n, key: o.id, text: `${o.id} — ${o.label}` }] });
      continue;
    }
    if (family.startsWith('cell:')) {
      const cell = family.slice(5);
      byCell.set(cell, [...(byCell.get(cell) ?? []), o]);
      continue;
    }
    let row = byFamily.get(family);
    if (row === undefined) {
      row = { n: o.n, header: familyHeader(family, o, d), prefix: family, items: [] };
      byFamily.set(family, row);
      rows.push(row);
    }
    const item = itemText(o, family, d, cellInfo);
    row.items.push({ n: o.n, key: item.key, text: item.text });
  }
  const cellRows = [...byCell].map(([cell, group]) => cellRow(cell, group));
  // 1つしかない家族は畳まずに出す（ラベルの全文が読める）。
  return [...rows, ...cellRows]
    .map((r) => {
      const only = r.items[0];
      if (r.items.length !== 1 || r.header === null || only === undefined) return r;
      const o = options.find((x) => x.n === only.n);
      return o === undefined ? r : { n: o.n, header: null, prefix: null, items: [{ n: o.n, key: o.id, text: `${o.id} — ${o.label}` }] };
    })
    .sort((a, b) => a.n - b.n);
};

export const foldedLines = (rows: readonly FoldedRow[]): string[] =>
  rows.map((r) => {
    if (r.header === null) return r.items.map((i) => `${i.n}. ${i.text}`).join(' ');
    const ids = r.prefix === null ? '' : `［${r.prefix}*］`;
    return `${r.header}${ids}: ${r.items.map((i) => `${i.n}.${i.text}`).join(' ')}`;
  });

/** 畳んだ表示から、番号と選択肢 ID の組を読み取る（テストと、打ち手の読み方の確かめのため）。 */
export const readFolded = (rows: readonly FoldedRow[]): { n: number; id: string }[] =>
  rows.flatMap((r) => r.items.map((i) => ({ n: i.n, id: r.prefix === null ? i.key : `${r.prefix}${i.key}` })));

// ---------------------------------------------------------------------------
// 局面の短い形（既定の show）
// ---------------------------------------------------------------------------

const progressLines = (state: GameState, m: ShowModel): string[] => {
  const pr = m.progress;
  const pass = state.passOrder.length === 0 ? '' : `（パス ${state.passOrder.map(P).join('→')}）`;
  return [
    `R${pr.round}/${pr.rounds} ${pr.phase}｜場面 ${pr.scene}｜手番順 ${state.turnOrder.map(P).join('→')}${pass}｜選択待ち ${pr.decider}（視点 ${m.viewer === 'all' ? 'すべて' : `P${m.viewer}`}）`,
  ];
};

const raidLines = (state: GameState, m: ShowModel): string[] => {
  const r = m.raid;
  if (r.card === null) return ['襲撃: 未公開'];
  const levels = state.players.map((p) => {
    const need = queries.raidNeed(state, p);
    return `P${p.index} Lv${p.militaryLevel}（防衛${need.defense}・撃退${need.repel}／所持${p.militaryTokens}）`;
  });
  return [`襲撃: カード${r.card} 防衛ライン${r.defenseLine}・撃退ライン${r.repelLine}（累積）｜宣言に払うトークン ${levels.join(' ')}`];
};

const actionLines = (m: ShowModel): string[] => {
  const used = m.actionBoard
    .map((a) => {
      const spaces = a.spaces.filter((s) => s.users.length > 0).map((s) => `${s.tier}[${s.users.join(',')}]`);
      return spaces.length === 0 ? null : `${a.action} ${spaces.join('・')}`;
    })
    .filter((x): x is string => x !== null);
  return [`置かれたスペース: ${used.join('／') || 'なし'}（効果文は ref）`];
};

const sharedLines = (m: ShowModel): string[] => {
  const sh = m.shared;
  const lines = [
    `ボーナスタイル: ${sh.bonusTiles.map((b) => `${b.id}${b.holder === null ? '' : `（${b.holder}）`}`).join(' ') || 'なし'}`,
    `特別な市民カード（公開）: ${sh.specialCitizens.map((s) => s.id).join('・') || 'なし'}`,
    `計画都市: ${sh.plannedCities.map((c) => `${c.name}（${c.id}${c.owner === null ? '' : `、P${c.owner} の専用`}）${c.claims.length > 0 ? `達成 ${c.claims.join('・')}` : ''}`).join('、') || 'なし'}`,
    `文明カード: 山札${sh.civDeck}・捨て札${sh.civDiscard}`,
  ];
  if (m.draft !== null) {
    lines.push(`ドラフトの候補: キャラクター ${m.draft.characters.map((c) => c.name).join('・') || 'なし'}／個人ボード ${m.draft.boards.map((b) => b.name).join('・') || 'なし'}`);
  }
  return lines;
};

const selfLines = (v: PlayerView, withHandEffects: boolean): string[] => {
  const w = v.workers;
  const lines = [
    `== 自分 P${v.index}（${v.name}）: キャラクター ${v.character?.name ?? 'なし'}／ボーナスタイル${v.bonusTile?.id ?? 'なし'}／${v.board ?? '個人ボードなし'}／得点トラック${v.score}${v.passed ? '（パス済み）' : ''}`,
    `資源 金${v.gold} 資材${v.materials} 生産力 金${v.goldProduction}・資材${v.materialProduction} トークン${v.militaryTokens}｜ワーカー 通常 使える${w.regularUsable}/総数${w.regularTotal}/上限${w.regularCap}・臨時 使える${w.tempUsable}/上限${w.tempMax}${w.tempLocked > 0 ? `（この手番に得た${w.tempLocked}は使えない）` : ''}`,
    `軍事Lv${v.militaryLevel}（次 ${v.nextMilitaryReward ?? 'なし'}）・インフラLv${v.infraLevel}（次 ${v.nextInfraReward ?? 'なし'}）`,
    `建物 ${nonZero(v.buildings) || 'なし'}｜土地タイル${v.landTiles}枚 ${nonZero(v.landByType)}｜最上位の解放 ${v.topUnlocked.join('・') || 'なし'}`,
    `特別な市民 ${v.specialCitizens.map((s) => s.id).join('・') || 'なし'}｜使用済み ${v.used.join('、') || 'なし'}｜プレイ済み${v.played.length}枚 ${v.played.map((c) => c.name).join('、')}${v.natureParks.length > 0 ? `｜自然公園 いま${v.natureParkPoints}点` : ''}`,
    `手札 ${v.handCount}枚${v.hand === null ? '' : withHandEffects ? '' : '（効果文は show --only hand）'}`,
    ...(v.hand ?? []).map((c) => `  ${cardShort(c)}${withHandEffects ? `: ${c.effect}` : ''}`),
  ];
  return lines;
};

const otherLinesShort = (v: PlayerView): string[] => [
  `P${v.index}（${v.name}）${v.character?.name ?? ''} 得点${v.score}${v.passed ? '・パス済み' : ''}｜金${v.gold} 資材${v.materials} 生産${v.goldProduction}/${v.materialProduction} トークン${v.militaryTokens} 通常${v.workers.regularUsable}/${v.workers.regularTotal} 臨時${v.workers.tempUsable} 軍Lv${v.militaryLevel} インフラLv${v.infraLevel}`,
  `  建物 ${nonZero(v.buildings) || 'なし'} 土地${v.landTiles} 手札${v.handCount} プレイ済み${v.played.length} 特別な市民${v.specialCitizens.map((s) => s.id).join('・') || 'なし'} ボーナスタイル${v.bonusTile?.id ?? 'なし'}`,
  ...(v.hand === null ? [] : [`  手札: ${v.hand.map((c) => `${c.id}「${c.name}」金${c.cost}`).join('、') || 'なし'}`]),
];

const promptExtra = (m: ShowModel): string => {
  const p = m.prompt;
  const extra = [
    p.remaining === null ? '' : `残り${p.remaining}`,
    p.pendingCost === null ? '' : `確定前のコスト 金${p.pendingCost.gold}・資材${p.pendingCost.materials}`,
    p.picks.length === 0 ? '' : `選択中 ${p.picks.join(',')}`,
  ].filter((x) => x !== '');
  return extra.length > 0 ? `、${extra.join('、')}` : '';
};

/** 選択肢の欄。full なら1選択肢1行でラベルの全文、そうでなければ畳む。 */
const optionSection = (state: GameState, m: ShowModel, full: boolean, d: GameData): string[] => {
  const p = m.prompt;
  if (isGameOver(state)) return ['== 選択肢: なし（ゲーム終了。score で得点を見る）'];
  if (p.options === null) return [`選択待ち：${p.player}（${p.heading}）`];
  const head = `== 選択肢（${p.player}：${p.heading}${promptExtra(m)}）`;
  if (full) return [head, ...p.options.map((o) => `${o.n}. ${o.id} — ${o.label}`)];
  const owner = state.players[decider(state) ?? 0];
  const cellInfo = (cell: string): string => {
    const tile = owner?.land[cell as keyof typeof owner.land];
    return tile === undefined ? '' : `（${queries.terrainLabel(tile)}）`;
  };
  // 遠征の報酬は、足したときに確定で払う軍事力トークンを添える（ラベルは変えず、表示の側で足す）。
  const notes = queries.expeditionPickNotes(state, d);
  const options = p.options.map((o) => {
    const cost = notes?.costs[o.id];
    return cost === undefined ? o : { ...o, label: `${o.label}（確定時の軍事力トークン計${cost}）` };
  });
  return [head, ...foldedLines(foldOptions(options, d, cellInfo)), ...unavailableLines(state, d)];
};

/** 理由ごとにまとめた「選べないもの」の行（ユーザー決定 2026-11-11）。 */
const groupByReason = (items: readonly { name: string; reason: string }[]): string[] => {
  const byReason = new Map<string, string[]>();
  for (const it of items) byReason.set(it.reason, [...(byReason.get(it.reason) ?? []), it.name]);
  return [...byReason].map(([reason, names]) => `  ${names.join('・')}：${reason}`);
};

/** 選択肢に出ないもの（アクションスペース・建物・遠征の報酬）と理由。判定は queries（explain と同じ処理）に任せる。 */
export const unavailableLines = (state: GameState, d: GameData = GAME_DATA): string[] => {
  const spaces = queries.unavailableSpaces(state, d).map((u) => ({ name: `${queries.actionLabel(u.action)}・${queries.tierLabel(u.tier)}`, reason: u.reason }));
  const buildings = queries.unavailableBuildings(state, d).map((u) => ({ name: queries.buildingLabel(u.building), reason: u.reason }));
  const rewards = (queries.expeditionPickNotes(state, d)?.unavailable ?? []).map((u) => ({ name: `Lv${u.level}`, reason: u.reason }));
  return [
    ...(spaces.length > 0 ? ['選べないアクション:', ...groupByReason(spaces)] : []),
    ...(buildings.length > 0 ? ['選べない建物:', ...groupByReason(buildings)] : []),
    ...(rewards.length > 0 ? ['選べない遠征の報酬:', ...groupByReason(rewards)] : []),
  ];
};

const viewerSelf = (state: GameState, viewer: Viewer): number => (viewer === 'all' ? (decider(state) ?? 0) : viewer);

/** 欄ごとの詳しい形（--only のとき）。--full の出力の該当する欄と同じ行を出す。 */
const detailedSection = (state: GameState, m: ShowModel, s: Section, d: GameData): string[] => {
  const full = renderModel(m);
  const block = (start: string, ends: readonly string[]): string[] => {
    const i = full.findIndex((l) => l.startsWith(start));
    if (i < 0) return [];
    const j = full.findIndex((l, k) => k > i && ends.some((e) => l.startsWith(e)));
    return full.slice(i, j < 0 ? full.length : j);
  };
  switch (s) {
    case 'progress':
      return block('== 進行', ['== 襲撃']);
    case 'raid':
      return block('== 襲撃', ['== アクションボード']);
    case 'actions':
      return block('== アクションボード', ['== 共有の場']);
    case 'shared':
      return [...block('== 共有の場', ['== 自分']), ...block('== ドラフトの残りの候補', ['== 個人ボード', '== 選択肢'])];
    case 'self':
      return block('== 自分', ['== 詳細', '== 他のプレイヤー']);
    case 'hand': {
      const v = m.self;
      return [`== 手札 P${v.index}（${v.handCount}枚）`, ...(v.hand ?? []).map((c) => `  ${c.id}「${c.name}」 金${c.cost} [${c.tags.join('・')}] ${c.points}点: ${c.effect}`)];
    }
    case 'others':
      return block('== 他のプレイヤー', ['== ドラフトの残りの候補', '== 個人ボード', '== 選択肢']);
    case 'board':
      return ['== 個人ボード', ...renderBoard(state, m.self.index, new Set(), d)];
    case 'options':
      return block('== 選択肢', []);
    case 'events':
      return [];
  }
};

/** 既定の show（短い形）。only があれば、指定した欄だけを詳しい形で出す。 */
export const compactShow = (state: GameState, opts: CompactOptions = {}, d: GameData = GAME_DATA, events: readonly string[] = []): string[] => {
  const m = showModel(state, opts.as === undefined ? {} : { as: opts.as }, d);
  if (opts.only !== undefined) {
    return opts.only.flatMap((s) => (s === 'events' ? (events.length > 0 ? ['== 出来事', ...events] : ['== 出来事: なし']) : detailedSection(state, m, s, d)));
  }
  const lines = [
    ...(events.length > 0 ? ['== 出来事', ...events] : []),
    '== 局面',
    ...progressLines(state, m),
    ...raidLines(state, m),
    ...actionLines(m),
    ...sharedLines(m),
    ...selfLines(m.self, false),
    '== 他のプレイヤー',
    ...m.others.flatMap(otherLinesShort),
  ];
  if (opts.board === true) lines.push('== 個人ボード', ...renderBoard(state, m.self.index, new Set(), d));
  lines.push(...optionSection(state, m, false, d));
  return lines;
};

/** --json：短い形の模型（only があれば、その欄のキーだけを詳しい形で）。 */
export const compactJson = (state: GameState, opts: CompactOptions = {}, d: GameData = GAME_DATA, events: readonly string[] = []): Record<string, unknown> => {
  const m = showModel(state, { ...(opts.as === undefined ? {} : { as: opts.as }), ...(opts.board === true ? { board: true } : {}) }, d);
  const strip = (v: PlayerView): unknown => ({
    ...v,
    character: v.character === null ? null : { id: v.character.id, name: v.character.name },
    bonusTile: v.bonusTile?.id ?? null,
    specialCitizens: v.specialCitizens.map((s) => s.id),
    hand: v.hand === null ? null : v.hand.map(({ effect: _effect, ...rest }) => rest),
    played: v.played.map((c) => c.name),
    natureParks: v.natureParks.length,
  });
  const detailed: Record<Section, unknown> = {
    progress: m.progress,
    raid: m.raid,
    actions: m.actionBoard,
    shared: { ...m.shared, draft: m.draft },
    self: m.self,
    hand: m.self.hand,
    others: m.others,
    board: renderBoard(state, m.self.index, new Set(), d),
    events,
    options: m.prompt,
  };
  if (opts.only !== undefined) {
    const out: Record<string, unknown> = {};
    for (const s of opts.only) out[s] = detailed[s];
    return out;
  }
  return {
    progress: m.progress,
    raid: { ...m.raid, outcomes: undefined },
    actions: m.actionBoard.map((a) => ({ action: a.action, used: a.spaces.filter((s) => s.users.length > 0).map((s) => ({ tier: s.tier, users: s.users })) })),
    shared: {
      bonusTiles: m.shared.bonusTiles.map((b) => ({ id: b.id, holder: b.holder })),
      specialCitizens: m.shared.specialCitizens.map((s) => s.id),
      plannedCities: m.shared.plannedCities.map((c) => ({ id: c.id, name: c.name, owner: c.owner, claims: c.claims })),
      civDeck: m.shared.civDeck,
      civDiscard: m.shared.civDiscard,
      draft: m.draft === null ? null : { characters: m.draft.characters.map((c) => c.id), boards: m.draft.boards.map((b) => b.id) },
    },
    self: strip(m.self),
    others: m.others.map(strip),
    ...(opts.board === true ? { board: m.board ?? renderBoard(state, m.self.index, new Set(), d) } : {}),
    events,
    options: m.prompt.options === null ? null : { player: m.prompt.player, heading: m.prompt.heading, rows: foldOptions(m.prompt.options, d) },
  };
};

/** 自分の状態の要約（move の戻り、指示書 2-1）。 */
export const selfSummary = (state: GameState, seat: number): string => {
  const p = state.players[seat];
  if (p === undefined) return '';
  const w = queries.workerSummary(p);
  return `自分 P${seat}: 金${p.gold} 資材${p.materials} 生産 金${p.goldProduction}・資材${p.materialProduction} トークン${p.militaryTokens}｜ワーカー 通常${w.regularUsable}・臨時${w.tempUsable}｜軍事Lv${p.militaryLevel} インフラLv${p.infraLevel}｜得点トラック${p.score}`;
};

// ---------------------------------------------------------------------------
// 出来事の短い形
// ---------------------------------------------------------------------------

/** 新しく公開・獲得したものの内容（視点の手札だけ、他の席の手札の内容は出さない）。 */
export const revealLines = (state: GameState, reveal: Reveal, viewer: Viewer, d: GameData = GAME_DATA): string[] => {
  const lines: string[] = [];
  if (reveal.specialCitizens.length > 0) lines.push(`特別な市民カード公開: ${reveal.specialCitizens.map((id) => `${id} ${queries.specialCitizenText(d, id)}`).join(' ／ ')}`);
  if (reveal.plannedCities.length > 0) lines.push(`計画都市公開: ${reveal.plannedCities.map((id) => plannedText(d, id)).join(' ／ ')}`);
  if (reveal.bonusTiles.length > 0) lines.push(`ボーナスタイル: ${reveal.bonusTiles.map((id) => `${id} ${queries.bonusTileText(d, id)}`).join(' ／ ')}`);
  for (const [p, ids] of Object.entries(reveal.privatePlanned)) lines.push(`P${p} の専用の計画都市: ${ids.map((id) => plannedText(d, id)).join(' ／ ')}`);
  for (const [p, ids] of Object.entries(reveal.acquired)) {
    if (viewer === 'all' || Number(p) === viewer) lines.push(`${viewer === 'all' ? `P${p} ` : ''}獲得した特別な市民カード: ${ids.map((id) => `${id} ${queries.specialCitizenText(d, id)}`).join(' ／ ')}`);
  }
  for (const [p, ids] of Object.entries(reveal.hands)) {
    if (viewer !== 'all' && Number(p) !== viewer) continue;
    for (const id of ids) lines.push(`${viewer === 'all' ? `P${p} ` : ''}手札に加わった: ${cardText(d, id) ?? id}`);
  }
  void state;
  return lines;
};

const CAUSE_SHORT: Readonly<Record<string, string>> = {
  move: '選択',
  setupFinish: '準備',
  roundStart: 'ラウンド開始',
  bonusTileStart: 'ボーナスタイル',
  income: '収入',
  turnStart: '手番開始',
  nextTurn: '手番の移行',
  raidDeclare: '襲撃',
  roundEnd: 'ラウンド終了',
  gameEnd: 'ゲーム終了時',
};

/**
 * 出来事の短い文。actor は選択した人（その人の action・pass などはラベルと重なるため省く）、viewer は視点。
 * 視点の増減は原因ごとに1行にまとめ、他の席の自動の増減は出さない。共通の結果（ラウンド・襲撃・終了）は出す。
 */
export const eventLines = (state: GameState, events: readonly GameEvent[], actor: number | null, viewer: Viewer, d: GameData = GAME_DATA): string[] => {
  const mine = (p: number): boolean => viewer === 'all' || p === viewer;
  const name = (p: number): string => (p === actor && viewer !== 'all' && p === viewer ? '' : `P${p} `);
  const lines: string[] = [];
  const deltas = new Map<string, string[]>();
  const tiles = new Map<number, string[]>();
  const built = new Map<number, string[]>();
  const tracks = new Map<string, { player: number; track: string; level: number; rewards: number[] }>();
  for (const e of events) {
    switch (e.type) {
      case 'delta':
        if (mine(e.player)) {
          const key = `${e.player}`;
          deltas.set(key, [...(deltas.get(key) ?? []), `${CAUSE_SHORT[e.cause] ?? '自動処理'} ${deltaText(e.changes)}`]);
        }
        break;
      case 'tilePlaced':
        if (e.player === actor || mine(e.player)) tiles.set(e.player, [...(tiles.get(e.player) ?? []), `${e.cell}${queries.terrainLabel(e.terrain)}`]);
        break;
      case 'built':
        if (e.player === actor || mine(e.player)) built.set(e.player, [...(built.get(e.player) ?? []), `${e.cell ?? '文明カードの上'}${queries.buildingLabel(e.building)}`]);
        break;
      case 'trackRaised':
      case 'levelReward': {
        if (!(e.player === actor || mine(e.player))) break;
        const key = `${e.player}:${e.track}`;
        const t = tracks.get(key) ?? { player: e.player, track: e.track, level: 0, rewards: [] };
        if (e.type === 'trackRaised') t.level = e.level;
        else t.rewards.push(e.level);
        tracks.set(key, t);
        break;
      }
      case 'round':
        lines.push(`── 第${e.round}ラウンド開始（襲撃カード${e.raidCard}：${raidOutcomeText(d, e.raidCard)}）`);
        break;
      case 'raid':
      case 'gameOver':
      case 'plannedCity': {
        const text = eventText(state, e, d);
        if (text !== null) lines.push(text.trim());
        break;
      }
      case 'action':
      case 'pass':
      case 'free':
      case 'draft':
      case 'workerGained':
      case 'actionFinished':
      case 'specialCitizen':
        if (e.type !== 'workerGained' && e.type !== 'actionFinished' && e.player !== actor && e.type !== 'specialCitizen') {
          const text = eventText(state, e, d);
          if (text !== null) lines.push(text.trim());
        }
        break;
      case 'cardsDrawn':
        if (!mine(e.player)) lines.push(`P${e.player} 文明カードを${e.count}枚引いた`);
        break;
      case 'score':
      case 'cardPlayed':
      case 'ability':
      case 'fizzle':
        if (e.player === actor || mine(e.player)) {
          const text = eventText(state, e, d, (p) => name(p).trim());
          if (text !== null) lines.push(text.trim());
        }
        break;
    }
  }
  for (const [p, cells] of tiles) lines.push(`${name(p)}土地タイル: ${cells.join(' ')}`.trim());
  for (const [p, cells] of built) lines.push(`${name(p)}建設: ${cells.join(' ')}`.trim());
  for (const t of tracks.values()) {
    if (t.level === 0) continue;
    lines.push(`${name(t.player)}${t.track === 'military' ? '軍事' : 'インフラ'}Lv${t.level}${t.rewards.length > 0 ? `（到達報酬 ${t.rewards.join('・')}）` : ''}`.trim());
  }
  for (const [p, parts] of deltas) lines.push(`${name(Number(p))}増減: ${parts.join('／')}`.trim());
  return lines;
};

/** 自分の選択ごとの出来事（指示書 2-1 の 1）。 */
export const stepLines = (state: GameState, steps: readonly Step[], viewer: Viewer, d: GameData = GAME_DATA): string[] =>
  steps.flatMap((step) => [
    `${step.index}手目${viewer === step.player ? '' : ` P${step.player}`}: ${step.label}`,
    ...eventLines(state, step.events, step.player, viewer, d).map((l) => `  ${l}`),
    ...revealLines(state, step.reveal, viewer, d).map((l) => `  ${l}`),
  ]);

/**
 * 他の席の出来事を手番ごとに1行にまとめる（指示書 2-5）。自動で進んだ処理は、視点に関わる増減と全員に共通の結果だけを出す。
 * 手番のまとまりは replayTurns、1行の要約は turnSummary（記録の再生画面と共用）。
 */
export const turnLines = (state: GameState, steps: readonly Step[], viewer: Viewer, d: GameData = GAME_DATA): string[] => {
  const lines: string[] = [];
  for (const turn of replayTurns(steps)) {
    const span = steps.filter((s) => s.index >= turn.from && s.index <= turn.to);
    const events = span.flatMap((s) => s.events);
    lines.push(`R${turn.round} ${turnSummary(state, turn.player, events, d)}`);
    lines.push(...autoLines(state, events, turn.player, viewer, d).map((l) => `  ${l}`));
    for (const s of span) lines.push(...revealLines(state, s.reveal, viewer, d).map((l) => `  ${l}`));
  }
  return lines;
};

/** 手番のまとまりの中の、視点に関わる出来事と共通の結果。 */
const autoLines = (state: GameState, events: readonly GameEvent[], turnPlayer: number | null, viewer: Viewer, d: GameData): string[] => {
  const picked = events.filter((e) => {
    if (e.type === 'round' || e.type === 'gameOver') return true;
    if (e.type === 'raid' || e.type === 'plannedCity') return e.player !== turnPlayer;
    if (!('player' in e) || e.player === turnPlayer || viewer === 'all' || e.player !== viewer) return false;
    return e.type === 'delta' || e.type === 'score' || e.type === 'trackRaised' || e.type === 'levelReward';
  });
  return eventLines(state, picked, null, viewer, d);
};

/** オンライン版：出来事の列だけから手番ごとにまとめる（選択と出来事の対応を持たないため eventTurns で区切る）。 */
export const eventTurnLines = (state: GameState, events: readonly GameEvent[], viewer: Viewer, d: GameData = GAME_DATA): string[] =>
  eventTurns(events).flatMap((t) =>
    t.player === null || t.player === viewer
      ? eventLines(state, t.events, t.player, viewer, d)
      : [turnSummary(state, t.player, t.events, d), ...autoLines(state, t.events, t.player, viewer, d).map((l) => `  ${l}`)],
  );

// ---------------------------------------------------------------------------
// 参照（ref、指示書 2-2）
// ---------------------------------------------------------------------------

export const refLines = (
  state: GameState,
  viewer: Viewer,
  only: readonly RefSection[] = REF_SECTIONS,
  cards: readonly string[] = [],
  d: GameData = GAME_DATA,
): string[] => {
  const self = viewerSelf(state, viewer);
  const selfPlayer = state.players[self];
  const lines: string[] = [];
  if (cards.length > 0) {
    lines.push('== カード');
    for (const id of cards) {
      const text = cardText(d, id);
      if (text === null) throw new PlayError(`知らないカードの番号である：${id}（文明カードは3桁、特別な市民カードは2桁、計画都市は PC で始まる）`);
      lines.push(text);
    }
    return lines;
  }
  for (const s of only) {
    switch (s) {
      case 'actions':
        lines.push('== アクションボード（ワーカー数・共有・最上位の解放条件・効果）');
        for (const a of ACTIONS) {
          lines.push(
            `${queries.actionLabel(a)}: ${TIERS.map((t) => {
              const flags = [`W${d.params.actions.workerCost[t]}`, queries.isSharedSpace(a, t, d) ? '共有' : '', t === 'top' ? `解放 ${queries.unlockText(d.params.actions.unlockTop[a])}${selfPlayer !== undefined && queries.isTopUnlocked(d, selfPlayer, a) ? '・解放済み' : ''}` : ''].filter((x) => x !== '');
              return `${queries.tierLabel(t)}（${flags.join('・')}）${queries.describeActionSpace(a, t, d)}`;
            }).join('｜')}`,
          );
        }
        break;
      case 'expedition': {
        // 報酬表（指揮官などの追加報酬を含む）。目標値（選んだ報酬の最も高いレベル）と軍事レベルの差だけ軍事力トークンを払う（6-3-6-3）。
        const rows = queries.expeditionRows(selfPlayer ?? null, d);
        lines.push(`== 遠征の報酬表（目標値＝選んだ報酬の最も高いレベル。軍事レベルとの差だけ軍事力トークンを払う。自分 P${self}：軍事Lv${selfPlayer?.militaryLevel ?? 0}・トークン${selfPlayer?.militaryTokens ?? 0}）`);
        for (const r of rows) {
          const need = Math.max(0, r.level - (selfPlayer?.militaryLevel ?? 0));
          lines.push(`Lv${r.level}: ${r.text}${r.extra ? '（追加）' : ''}｜${need === 0 ? 'トークンなしで届く' : `トークン${need}`}`);
        }
        lines.push(
          `選べる数: ${TIERS.map((t) => {
            const sel = d.params.actions.expedition.selection[t];
            return `${queries.tierLabel(t)} ${sel.mode === 'distinct' ? `異なる報酬を${sel.max}つまで` : `合計${sel.total}個まで（同じ報酬は${sel.maxSame}個まで）`}`;
          }).join('｜')}`,
        );
        break;
      }
      case 'characters': {
        lines.push('== キャラクター');
        const ids = [...state.players.map((p) => p.characterId).filter((c): c is string => c !== null), ...state.draftPool.characters];
        for (const id of ids) {
          const owner = state.players.find((p) => p.characterId === id);
          const c = d.characters.find((x) => x.id === id);
          lines.push(`${queries.characterName(d, id)}（${owner === undefined ? 'ドラフトの候補' : `P${owner.index}`}）: ${describeScript(c?.script ?? []).join('／')}`);
        }
        if (ids.length === 0) lines.push('なし');
        break;
      }
      case 'bonus':
        lines.push('== ボーナスタイル（場に出ているもの）');
        for (const id of state.bonusTilesOnBoard) lines.push(`${id}: ${queries.bonusTileText(d, id)}`);
        for (const p of state.players) if (p.bonusTile !== null && !state.bonusTilesOnBoard.includes(p.bonusTile)) lines.push(`${p.bonusTile}（P${p.index}）: ${queries.bonusTileText(d, p.bonusTile)}`);
        break;
      case 'raid':
        lines.push('== 襲撃カード（公開済みのラウンドだけ順番を出す）');
        for (const c of d.raidCards) lines.push(`カード${c.id}: ${raidOutcomeText(d, c.id)}`);
        lines.push(`公開済み: ${state.raidOrder.slice(0, state.round).map((c, i) => `第${i + 1}ラウンド カード${c}`).join('、') || 'なし'}`);
        break;
      case 'buildings':
        lines.push('== 建物');
        for (const b of BUILDINGS) lines.push(queries.describeBuilding(b, d).split('\n').join('／'));
        lines.push(`地形: ${TERRAINS.map(queries.terrainLabel).join('・')}`);
        break;
      case 'free':
        lines.push('== フリーアクション（自分の手番中、アクションの前後に何度でも）');
        for (const c of d.params.freeActions.conversions) lines.push(conversionLabel(c).replace(/^フリーアクション：/, ''));
        break;
      case 'public': {
        lines.push('== 公開中のカード');
        for (const id of state.scRevealed) lines.push(`特別な市民カード${id}（場）: ${queries.specialCitizenText(d, id)}`);
        for (const id of state.plannedCityRevealed) lines.push(`計画都市（場）: ${plannedText(d, id)}`);
        for (const p of state.players) {
          for (const id of p.privatePlannedCities) lines.push(`計画都市（P${p.index} の専用）: ${plannedText(d, id)}`);
          for (const id of p.specialCitizens) lines.push(`特別な市民カード${id}（P${p.index}）: ${queries.specialCitizenText(d, id)}`);
        }
        if (selfPlayer !== undefined) {
          for (const id of selfPlayer.played) lines.push(`プレイ済み（自分）: ${cardText(d, id) ?? id}`);
        }
        break;
      }
    }
  }
  return lines;
};

// ---------------------------------------------------------------------------
// コマンドの出力（cli.ts と measure.ts が使う）
// ---------------------------------------------------------------------------

/** move の既定の出力：出来事・自分の要約・次の選択肢（指示書 2-1）。 */
export const moveOutput = (state: GameState, steps: readonly Step[], seat: number | undefined, opts: CompactOptions = {}, d: GameData = GAME_DATA): string => {
  const viewer: Viewer = opts.as ?? seat ?? steps[0]?.player ?? decider(state) ?? 0;
  const events = stepLines(state, steps, viewer, d);
  if (opts.only !== undefined) return compactShow(state, { ...opts, as: viewer }, d, events).join('\n');
  return [...events, ...tailLines(state, viewer, opts, d)].join('\n');
};

/** move の出力の後半：自分の要約と、次の選択待ちが自分なら選択肢、他の席なら「選択待ち：P1」。 */
export const tailLines = (state: GameState, viewer: Viewer, opts: CompactOptions = {}, d: GameData = GAME_DATA): string[] => {
  const self = viewerSelf(state, viewer);
  const deciding = decider(state);
  const lines = [selfSummary(state, self)];
  if (opts.board === true) lines.push(...renderBoard(state, self, new Set(), d));
  if (isGameOver(state)) lines.push('ゲーム終了（score で得点を見る）');
  else if (deciding !== null && (viewer === 'all' || deciding === viewer)) {
    const m = showModel(state, { as: viewer }, d);
    lines.push(...optionSection(state, m, false, d));
  } else lines.push(`選択待ち：${P(deciding)}`);
  return lines;
};

/** 自分のこれまでの手番ごとのまとめ（resume）。 */
export const ownTurnLines = (state: GameState, steps: readonly Step[], seat: number, d: GameData = GAME_DATA): string[] =>
  replayTurns(steps)
    .filter((t) => t.player === seat)
    .map((t) => `R${t.round} ${turnSummary(state, seat, steps.filter((s) => s.index >= t.from && s.index <= t.to).flatMap((s) => s.events), d)}`);

/** いま終わったときの得点の見込み（その席の分）。 */
export const scoreLine = (state: GameState, seat: number, d: GameData = GAME_DATA): string => {
  const m = scoreModel(state, d);
  const p = m.players.find((x) => x.player.startsWith(`P${seat}`));
  if (p === undefined) return '';
  return `${m.over ? '最終得点' : 'いま終わったときの見込み（終了時の能力を除く）'}: ${p.rank}位 合計${p.total}（得点トラック${p.track}・基礎${p.base} ${Object.entries(p.axes).map(([k, n]) => `${k}${n}`).join(' ')}）｜全員 ${m.players.map((x) => `${x.player.split('（')[0]} ${x.total}`).join(' ')}`;
};

/** resume の出力（指示書 2-6）。作り直した打ち手が最初に1回だけ呼ぶ。 */
export const resumeOutput = (state: GameState, steps: readonly Step[], seat: number, d: GameData = GAME_DATA): string =>
  [
    ...refLines(state, seat, REF_SECTIONS, [], d),
    ...compactShow(state, { as: seat }, d),
    ...compactShow(state, { as: seat, only: ['hand'] }, d),
    `== P${seat} のこれまでの手番`,
    ...(ownTurnLines(state, steps, seat, d).length > 0 ? ownTurnLines(state, steps, seat, d) : ['なし']),
    '== 得点',
    scoreLine(state, seat, d),
  ].join('\n');

/** 局面のラウンド（ドラフトと準備は第1ラウンドに含める、指示書 2-6）。 */
export const effectiveRound = (state: GameState): number => Math.max(1, state.round);

/** 選択待ちの選択肢の数（テストのため）。 */
export const optionCount = (state: GameState, d: GameData = GAME_DATA): number => getOptions(state, d).length;
