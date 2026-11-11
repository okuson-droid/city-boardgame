// 局面・選択肢・出来事・得点を文字にする純粋関数（指示書 2026-11-10 対話プレイ 2-4〜2-7）。
// ルールは計算しない。選択肢は getOptions、得点は finalScores、派生値は queries だけから得る。
// 非公開情報（19-6-1）：視点以外のプレイヤーの手札の内容と、山札の順序は出さない。--as all でも山札の順序は出さない。
// 表示はまず JSON にできる形（ShowModel）に組み立て、文字の出力はそれを並べるだけにする。

import { CELLS, ROW_LABELS, ROW_LENGTHS, type CellId } from '../../src/game/board.ts';
import { GAME_DATA, ACTIONS, BUILDINGS, SCORE_AXES, TERRAINS, TIERS, type GameData, type Terrain } from '../../src/data/index.ts';
import {
  eventText,
  decider,
  describeScript,
  finalScores,
  getOptions,
  isGameOver,
  pitfallLines,
  pitfalls,
  projectedScores,
  queries,
  targetOf,
  type GameEvent,
  type GameState,
  type Option,
  type PlayerState,
} from '../../src/game/index.ts';
import type { Step } from './record.ts';

/** 視点。プレイヤー番号（0始まり）か、分析用にすべての手札を見る 'all'。 */
export type Viewer = number | 'all';

export type ShowOptions = {
  /** 視点。省略時は選択待ちのプレイヤー（いなければ 0）。 */
  readonly as?: Viewer;
  /** 詳細を出すプレイヤー。 */
  readonly player?: number;
  /** 視点のプレイヤーの個人ボードを出す。選択肢がマスを対象にしていれば指定がなくても出す。 */
  readonly board?: boolean;
  /** 短い出力（アクションボードの効果文とドラフトの候補の説明を省く）。 */
  readonly brief?: boolean;
};

const PHASES: Record<GameState['phase'], string> = { draft: 'ドラフト', play: 'アクション', raid: '襲撃', over: '終了' };

const TERRAIN_CODE: Record<Terrain, string> = { water: 'w', mountain: 'm', plains: 'p', forest: 'f' };
const BUILDING_CODE: Record<(typeof BUILDINGS)[number], string> = {
  shop: 'Sh',
  workshop: 'Wk',
  fort: 'Ft',
  office: 'Of',
  university: 'Un',
  house: 'Ho',
  camp: 'Ca',
};

const who = (state: GameState, i: number | null): string => {
  if (i === null || i < 0) return '-';
  const p = state.players[i];
  return p === undefined ? `P${i}` : `P${i}（${p.name}）`;
};

const canSee = (viewer: Viewer, player: number): boolean => viewer === 'all' || viewer === player;

const viewerOf = (state: GameState, opts: ShowOptions): Viewer => opts.as ?? decider(state) ?? 0;

const selfOf = (state: GameState, viewer: Viewer): number => (viewer === 'all' ? (decider(state) ?? 0) : viewer);

const playerAt = (state: GameState, i: number): PlayerState => {
  const p = state.players[i];
  if (p === undefined) throw new Error(`存在しないプレイヤーである：${i}`);
  return p;
};

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

// ---------------------------------------------------------------------------
// 表示の模型（--json はこれをそのまま出す）
// ---------------------------------------------------------------------------

export type CardView = {
  readonly id: string;
  readonly name: string;
  readonly cost: number;
  readonly tags: readonly string[];
  readonly points: number;
  readonly effect: string;
};

export type PlayerView = {
  readonly index: number;
  readonly name: string;
  readonly board: string | null;
  readonly character: { readonly id: string; readonly name: string; readonly abilities: readonly string[] } | null;
  readonly bonusTile: { readonly id: number; readonly text: string } | null;
  readonly gold: number;
  readonly materials: number;
  readonly goldProduction: number;
  readonly materialProduction: number;
  readonly militaryTokens: number;
  readonly workers: queries.WorkerSummary & { readonly regularTotal: number };
  readonly militaryLevel: number;
  readonly infraLevel: number;
  readonly nextMilitaryReward: string | null;
  readonly nextInfraReward: string | null;
  readonly buildings: Readonly<Record<string, string>>;
  readonly landTiles: number;
  readonly landByType: Readonly<Record<string, number>>;
  readonly topUnlocked: readonly string[];
  readonly topLocked: readonly string[];
  readonly specialCitizens: readonly { readonly id: string; readonly text: string }[];
  readonly used: readonly string[];
  readonly handCount: number;
  /** 手札の内容。視点から見えないときは null。 */
  readonly hand: readonly CardView[] | null;
  readonly played: readonly { readonly id: string; readonly name: string; readonly effect: string }[];
  readonly natureParks: readonly string[];
  readonly natureParkPoints: number;
  readonly passed: boolean;
  readonly score: number;
};

export type ShowModel = {
  readonly viewer: Viewer;
  readonly brief: boolean;
  readonly progress: {
    readonly round: number;
    readonly rounds: number;
    readonly phase: string;
    readonly scene: string;
    readonly turnOrder: readonly string[];
    readonly passOrder: readonly string[];
    readonly decider: string;
  };
  readonly raid: {
    readonly card: number | null;
    readonly increase: string | null;
    readonly defenseLine: number;
    readonly repelLine: number;
    readonly outcomes: { readonly defenseFailed: string; readonly defended: string; readonly repelled: string } | null;
    readonly players: readonly string[];
  };
  readonly actionBoard: readonly {
    readonly action: string;
    readonly spaces: readonly {
      readonly tier: string;
      readonly workers: number;
      readonly shared: boolean;
      readonly text: string;
      readonly users: readonly string[];
      /** 最上位だけ：視点のプレイヤーが解放しているか。 */
      readonly unlocked: boolean | null;
      readonly unlock: string | null;
    }[];
  }[];
  readonly shared: {
    readonly bonusTiles: readonly { readonly id: number; readonly text: string; readonly holder: string | null }[];
    readonly specialCitizens: readonly { readonly id: string; readonly text: string }[];
    readonly plannedCities: readonly { readonly id: string; readonly owner: number | null; readonly name: string; readonly condition: string; readonly benefit: string; readonly claims: readonly string[] }[];
    readonly civDeck: number;
    readonly civDiscard: number;
  };
  readonly self: PlayerView;
  readonly detail: PlayerView | null;
  readonly others: readonly PlayerView[];
  readonly prompt: {
    readonly player: string;
    readonly task: string;
    readonly heading: string;
    readonly remaining: number | null;
    readonly pendingCost: { readonly gold: number; readonly materials: number } | null;
    readonly picks: readonly string[];
    /** 選択肢。視点から見えないときは null（他人の選択肢は手札の内容を含むため）。 */
    readonly options: readonly { readonly n: number; readonly id: string; readonly label: string }[] | null;
    /** 落とし穴の注意の行（src/game/pitfalls.ts、5行まで）。選択肢が見えないときは空。 */
    readonly warnings: readonly string[];
  };
  /** ドラフトの残りの候補（ドラフト中だけ）。キャラクターは能力の文、個人ボードは --board のとき地図も出す。 */
  readonly draft: {
    readonly characters: readonly { readonly id: string; readonly name: string; readonly abilities: readonly string[] }[];
    readonly boards: readonly { readonly id: string; readonly name: string; readonly map: readonly string[] | null }[];
  } | null;
  readonly board: readonly string[] | null;
  /** 視点の席の得点の見込み1行（projectedScores、終了時の能力を含む）。 */
  readonly projection: string;
};

const planCondition = (d: GameData, id: string): { condition: string; benefit: string } => {
  const card = d.plannedCityCards.find((c) => c.id === id);
  if (card === undefined) return { condition: '', benefit: '' };
  const slots = card.slots.map((s) => {
    const parts = [s.terrain === null ? '' : queries.terrainLabel(s.terrain), s.building === null ? '任意の建物' : queries.buildingLabel(s.building)];
    return `(${s.q},${s.r})${parts.filter((x) => x !== '').join('の')}`;
  });
  return { condition: `${card.shape}：${slots.join(' ')}`, benefit: card.benefits.map(queries.grantText).join('・') };
};

const cardView = (state: GameState, d: GameData, player: PlayerState, id: string): CardView => {
  const card = d.civilizationCards.find((c) => c.id === id);
  return {
    id,
    name: card?.name ?? id,
    cost: queries.civCardCost(d, player, id, queries.playDiscount(state, player.index, d)),
    tags: (card?.tags ?? []).map((t) => (GAME_TAGS[t] ?? t)),
    points: card?.points ?? 0,
    effect: queries.civCardEffect(d, id),
  };
};

const GAME_TAGS: Readonly<Record<string, string>> = {
  military: '軍事',
  economy: '経済',
  academic: '学術',
  life: '生活',
  environment: '環境',
  literature: '文学',
  art: '美術',
  music: '音楽',
};

const natureParkLines = (d: GameData, player: PlayerState): string[] => {
  const card = d.natureParkCards.find((c) => c.id === player.natureParkCard);
  if (card === undefined) return [];
  return card.sets.map(
    (set) => `${card.name} ${set.cells.length}枚組：${set.cells.map((c) => `(${c.q},${c.r})${queries.terrainLabel(c.terrain)}`).join(' ')}`,
  );
};

const playerView = (state: GameState, d: GameData, viewer: Viewer, index: number): PlayerView => {
  const p = playerAt(state, index);
  const character = d.characters.find((c) => c.id === p.characterId);
  const workers = queries.workerSummary(p, d);
  const buildings: Record<string, string> = {};
  for (const b of BUILDINGS) buildings[queries.buildingLabel(b)] = `${queries.buildingCount(p, b)}/${d.params.buildings.limits[b]}`;
  const land = queries.landByType(p);
  const landNamed: Record<string, number> = {};
  for (const t of TERRAINS) landNamed[queries.terrainLabel(t)] = land[t];
  const used = [
    ...p.usedThisRound.map((key) => `${queries.sourceName(d, key.split('#')[0] ?? key)}（1ラウンドに1回）`),
    ...state.occupied.filter((key) => key.includes('#') && p.specialCitizens.some((sc) => key.startsWith(`sc:${sc}#`))).map((key) => `${queries.sourceName(d, key.split('#')[0] ?? key)}の専用スペース`),
  ];
  const militaryNext = queries.nextTrackReward(p, 'military', d);
  const infraNext = queries.nextTrackReward(p, 'infra', d);
  return {
    index,
    name: p.name,
    board: p.boardId === null ? null : queries.boardName(d, p.boardId),
    character: character === undefined ? null : { id: character.id, name: character.name, abilities: describeScript(character.script) },
    bonusTile: p.bonusTile === null ? null : { id: p.bonusTile, text: queries.bonusTileText(d, p.bonusTile) },
    gold: p.gold,
    materials: p.materials,
    goldProduction: p.goldProduction,
    materialProduction: p.materialProduction,
    militaryTokens: p.militaryTokens,
    workers: { ...workers, regularTotal: p.regularWorkers },
    militaryLevel: p.militaryLevel,
    infraLevel: p.infraLevel,
    nextMilitaryReward: militaryNext === null ? null : `Lv${militaryNext.level}：${militaryNext.text}`,
    nextInfraReward: infraNext === null ? null : `Lv${infraNext.level}：${infraNext.text}`,
    buildings,
    landTiles: queries.landCount(p),
    landByType: landNamed,
    topUnlocked: ACTIONS.filter((a) => queries.isTopUnlocked(d, p, a)).map(queries.actionLabel),
    topLocked: ACTIONS.filter((a) => !queries.isTopUnlocked(d, p, a)).map(
      (a) => `${queries.actionLabel(a)}（${queries.unlockText(d.params.actions.unlockTop[a])}）`,
    ),
    specialCitizens: p.specialCitizens.map((id) => ({ id, text: queries.specialCitizenText(d, id) })),
    used,
    handCount: p.hand.length,
    hand: canSee(viewer, index) ? p.hand.map((id) => cardView(state, d, p, id)) : null,
    played: p.played.map((id) => ({ id, name: queries.civCardName(d, id), effect: queries.civCardEffect(d, id) })),
    natureParks: natureParkLines(d, p),
    natureParkPoints: queries.natureParkPoints(p, d),
    passed: p.passed,
    score: p.score,
  };
};

/** スペースを使ったプレイヤーを、使った順に「P0」「P1×2」の形にまとめる（共有スペースは何度も使われるため）。 */
const countUsers = (users: readonly number[]): string[] => {
  const counts = new Map<number, number>();
  for (const u of users) counts.set(u, (counts.get(u) ?? 0) + 1);
  return [...counts].map(([u, n]) => (n === 1 ? `P${u}` : `P${u}×${n}`));
};

/** 選択肢が対象にしているマス（targetOf）。 */
const targetCells = (options: readonly Option[]): Set<CellId> => {
  const cells = new Set<CellId>();
  for (const o of options) {
    const t = targetOf(o);
    if (t?.kind === 'cell') cells.add(t.cell);
  }
  return cells;
};

export const showModel = (state: GameState, opts: ShowOptions = {}, d: GameData = GAME_DATA): ShowModel => {
  const viewer = viewerOf(state, opts);
  const self = selfOf(state, viewer);
  const deciding = decider(state);
  const options = getOptions(state, d);
  const raidCard = queries.currentRaidCard(state, d);
  const selfPlayer = playerAt(state, self);
  const task = state.stack[state.stack.length - 1];
  const cells = targetCells(options);
  const showBoard = (opts.board === true || cells.size > 0) && selfPlayer.boardId !== null;
  const visibleOptions = deciding === null || canSee(viewer, deciding);
  return {
    viewer,
    brief: opts.brief === true,
    progress: {
      round: state.round,
      rounds: d.params.rounds,
      phase: PHASES[state.phase],
      scene: queries.sceneOf(state).heading,
      turnOrder: state.turnOrder.map((i) => who(state, i)),
      passOrder: state.passOrder.map((i) => who(state, i)),
      decider: who(state, deciding),
    },
    raid: {
      card: raidCard?.id ?? null,
      increase: raidCard === null ? null : `防衛ライン+${raidCard.defense_increase}・撃退ライン+${raidCard.repel_increase}`,
      defenseLine: state.defenseLine,
      repelLine: state.repelLine,
      outcomes: raidCard === null ? null : queries.describeRaidOutcomes(raidCard, d),
      players: state.players.map((p) => {
        const need = queries.raidNeed(state, p);
        return `${who(state, p.index)} 軍事Lv${p.militaryLevel}（宣言に払うトークン 防衛${need.defense}・撃退${need.repel}、所持${p.militaryTokens}）`;
      }),
    },
    actionBoard: ACTIONS.map((action) => ({
      action: queries.actionLabel(action),
      spaces: TIERS.map((tier) => ({
        tier: queries.tierLabel(tier),
        workers: d.params.actions.workerCost[tier],
        shared: queries.isSharedSpace(action, tier, d),
        text: queries.describeActionSpace(action, tier, d),
        users: countUsers(queries.spaceUsers(state, action, tier)),
        unlocked: tier === 'top' ? queries.isTopUnlocked(d, selfPlayer, action) : null,
        unlock: tier === 'top' ? queries.unlockText(d.params.actions.unlockTop[action]) : null,
      })),
    })),
    shared: {
      bonusTiles: state.bonusTilesOnBoard.map((id) => {
        const holder = state.players.find((p) => p.bonusTile === id);
        return { id, text: queries.bonusTileText(d, id), holder: holder === undefined ? null : `P${holder.index}` };
      }),
      specialCitizens: state.scRevealed.map((id) => ({ id, text: queries.specialCitizenText(d, id) })),
      plannedCities: [...state.plannedCityRevealed, ...state.players.flatMap((p) => p.privatePlannedCities)].map((id) => ({
        id,
        // デザイナーの専用カードは持ち主だけが宣言できる（19-5-3）。公開カードと見分けられるよう持ち主を添える。
        owner: state.players.find((p) => p.privatePlannedCities.includes(id))?.index ?? null,
        name: queries.plannedCityName(d, id),
        ...planCondition(d, id),
        claims: queries.plannedCityClaimers(state, id).map((i, rank) => `${rank + 1}位 P${i}`),
      })),
      ...(() => {
        const piles = queries.civPileCounts(state);
        return { civDeck: piles.deck, civDiscard: piles.discard };
      })(),
    },
    self: playerView(state, d, viewer, self),
    detail: opts.player === undefined ? null : playerView(state, d, viewer, opts.player),
    others: state.players.filter((p) => p.index !== self).map((p) => playerView(state, d, viewer, p.index)),
    prompt: {
      player: who(state, deciding),
      task: task?.t ?? '',
      heading: queries.sceneOf(state).heading,
      remaining: queries.remainingInTask(state),
      pendingCost: queries.pendingBuildCost(state, d),
      picks: queries.pendingPicks(state),
      options: visibleOptions ? options.map((o, i) => ({ n: i + 1, id: o.id, label: o.label })) : null,
      warnings: visibleOptions ? pitfallLines(pitfalls(state, d)) : [],
    },
    draft:
      task?.t === 'draftPick'
        ? {
            characters: state.draftPool.characters.map((id) => ({
              id,
              name: queries.characterName(d, id),
              abilities: describeScript(d.characters.find((c) => c.id === id)?.script ?? []),
            })),
            boards: state.draftPool.boards.map((id) => ({
              id,
              name: queries.boardName(d, id),
              map: opts.board === true ? renderBoardOf(state, self, id, new Set(), d) : null,
            })),
          }
        : null,
    board: showBoard ? renderBoard(state, self, cells, d) : null,
    projection: projectionLine(scoreModel(state, d), self),
  };
};

// ---------------------------------------------------------------------------
// 個人ボード
// ---------------------------------------------------------------------------

/**
 * 個人ボードを文字で並べる。各マスは「座標:地形 土地タイル 建物 印」で、7マスの行は半マスずらす。
 * 地形は小文字（w 水場・m 山岳・p 平原・f 森林）、置いた土地タイルは大文字、建物は2字の記号である。
 */
export const renderBoard = (state: GameState, index: number, targets: ReadonlySet<CellId> = new Set(), d: GameData = GAME_DATA): string[] =>
  renderBoardOf(state, index, playerAt(state, index).boardId, targets, d);

/** 個人ボード boardId に、プレイヤー index の土地タイル・建物を重ねて並べる（ドラフトの候補は何も置いていない地図になる）。 */
export const renderBoardOf = (
  state: GameState,
  index: number,
  boardId: string | null,
  targets: ReadonlySet<CellId> = new Set(),
  d: GameData = GAME_DATA,
): string[] => {
  const p = playerAt(state, index);
  const board = d.boards.find((b) => b.id === boardId);
  if (board === undefined) return [`P${index} の個人ボードはまだない`];
  const spirits = new Map<string, Terrain>();
  for (const t of TERRAINS) {
    const c = p.spiritChips[t];
    if (c !== undefined) spirits.set(c, t);
  }
  const lines = [p.boardId === boardId ? `個人ボード（${who(state, index)}、${board.name}）` : `${board.name}（ドラフトの候補）`];
  for (const row of ROW_LABELS) {
    const cells = CELLS.filter((c) => c.row === row);
    const tokens = cells.map((c) => {
      const square = board.squares[c.id];
      const terrain = square === undefined ? '?' : TERRAIN_CODE[square.terrain];
      const tile = p.land[c.id];
      const building = p.buildings[c.id];
      const marks = [
        square?.bonus && tile === undefined ? '$' : ' ',
        spirits.has(c.id) ? '@' : ' ',
        targets.has(c.id) ? '*' : ' ',
      ].join('');
      return `${c.id}:${terrain}${tile === undefined ? '.' : TERRAIN_CODE[tile].toUpperCase()}${building === undefined ? '--' : BUILDING_CODE[building]}${marks}`;
    });
    lines.push(`${ROW_LENGTHS[row] === 7 ? '      ' : ''}${tokens.join(' ')}`);
  }
  const bonuses = CELLS.flatMap((c) => {
    const bonus = board.squares[c.id]?.bonus;
    return bonus && p.land[c.id] === undefined ? [`${c.id} ${queries.grantText(bonus)}`] : [];
  });
  lines.push(
    '凡例：地形 w水場 m山岳 p平原 f森林／土地タイル .なし W M P F／建物 Sh商店 Wk工房 Ft砦 Of役所 Un大学 Ho住宅 Ca飯場／$未獲得のマスボーナス @精霊チップ *選択肢の対象',
  );
  if (bonuses.length > 0) lines.push(`マスボーナス：${bonuses.join('、')}`);
  if (spirits.size > 0) lines.push(`精霊チップ：${[...spirits].map(([c, t]) => `${c}（${queries.terrainLabel(t)}）`).join('、')}`);
  return lines;
};

// ---------------------------------------------------------------------------
// 文字の出力
// ---------------------------------------------------------------------------

const playerLines = (v: PlayerView, full: boolean): string[] => {
  const w = v.workers;
  const lines = [
    `キャラクター: ${v.character?.name ?? 'なし'}　個人ボード: ${v.board ?? 'なし'}`,
    ...(v.character?.abilities ?? []).map((a) => `  能力: ${a}`),
    `ボーナスタイル: ${v.bonusTile === null ? 'なし' : `${v.bonusTile.id}（${v.bonusTile.text}）`}`,
    `資源: 金${v.gold} 資材${v.materials} 金の生産力${v.goldProduction} 資材の生産力${v.materialProduction} 軍事力トークン${v.militaryTokens}`,
    `ワーカー: 通常 使える${w.regularUsable}／総数${w.regularTotal}／上限${w.regularCap}（配置済み${w.regularPlaced}・次のラウンドから${w.regularNextRound}）、臨時 使える${w.tempUsable}／上限${w.tempMax}${w.tempLocked > 0 ? `（この手番に得た${w.tempLocked}は使えない）` : ''}`,
    `軍事レベル: ${v.militaryLevel}（次の到達報酬 ${v.nextMilitaryReward ?? 'なし'}）`,
    `インフラレベル: ${v.infraLevel}（次の到達報酬 ${v.nextInfraReward ?? 'なし'}）`,
    `建物: ${Object.entries(v.buildings).map(([k, n]) => `${k}${n}`).join(' ')}`,
    `土地タイル: ${v.landTiles}枚（${Object.entries(v.landByType).map(([k, n]) => `${k}${n}`).join(' ')}）`,
    `最上位: 解放済み ${v.topUnlocked.join('・') || 'なし'}／未解放 ${v.topLocked.join('・') || 'なし'}`,
    `特別な市民カード: ${v.specialCitizens.length === 0 ? 'なし' : `${v.specialCitizens.length}枚`}`,
    ...v.specialCitizens.map((s) => `  ${s.id}: ${s.text}`),
    `使用済み: ${v.used.join('、') || 'なし'}`,
    `手札: ${v.handCount}枚`,
    ...(v.hand ?? []).map((c) => `  ${c.id}「${c.name}」 金${c.cost} [${c.tags.join('・')}] ${c.points}点: ${c.effect}`),
    `プレイ済み: ${v.played.length}枚 ${full ? '' : v.played.map((c) => c.name).join('、')}`,
    ...(full ? v.played.map((c) => `  ${c.name}: ${c.effect}`) : []),
    `自然公園:${v.natureParks.length === 0 ? ' なし' : `（建物のない土地タイルの組で数える。いま終わったら${v.natureParkPoints}点）`}`,
    ...v.natureParks.map((n) => `  ${n}`),
    `得点トラック: ${v.score}${v.passed ? '（パス済み）' : ''}`,
  ];
  return lines;
};

const otherLines = (v: PlayerView): string[] => [
  `P${v.index}（${v.name}）: ${v.character?.name ?? 'キャラクターなし'}／ボーナスタイル${v.bonusTile?.id ?? 'なし'}／得点トラック${v.score}${v.passed ? '／パス済み' : ''}`,
  `  金${v.gold} 資材${v.materials} 生産力 金${v.goldProduction}・資材${v.materialProduction} トークン${v.militaryTokens} ワーカー 通常${v.workers.regularUsable}/${v.workers.regularTotal}・臨時${v.workers.tempUsable} 軍事Lv${v.militaryLevel} インフラLv${v.infraLevel}`,
  `  建物 ${Object.entries(v.buildings).filter(([, n]) => !n.startsWith('0/')).map(([k, n]) => `${k}${n.split('/')[0]}`).join(' ') || 'なし'} 土地タイル${v.landTiles}枚 手札${v.handCount}枚 プレイ済み${v.played.length}枚 特別な市民${v.specialCitizens.map((s) => s.id).join('・') || 'なし'}`,
  ...(v.hand === null ? [] : [`  手札: ${v.hand.map((c) => `${c.id}「${c.name}」金${c.cost}`).join('、') || 'なし'}`]),
];

/** マスを対象にする選択肢が多いときは、同じマスの選択肢を1行にまとめる。 */
const optionLines = (options: readonly { n: number; id: string; label: string }[]): string[] => {
  const cellOf = (id: string): string | null => {
    const t = targetOf({ id, player: 0, label: '' });
    return t?.kind === 'cell' ? t.cell : null;
  };
  const grouped = options.length > 24 && options.filter((o) => cellOf(o.id) !== null).length > 12;
  if (!grouped) return options.map((o) => `${o.n}. ${o.id} — ${o.label}`);
  // 最初の選択肢の番号の順に並べる。
  const rows: { n: number; text: string }[] = [];
  const byCell = new Map<string, { n: number; items: string[] }>();
  for (const o of options) {
    const cell = cellOf(o.id);
    if (cell === null) {
      rows.push({ n: o.n, text: `${o.n}. ${o.id} — ${o.label}` });
      continue;
    }
    const group = byCell.get(cell) ?? { n: o.n, items: [] };
    group.items.push(`${o.n}. ${o.id}（${o.label.replace(/^.*?に/, '').replace(/を(置く|建てる).*$/, '')}）`);
    byCell.set(cell, group);
  }
  for (const [cell, group] of byCell) rows.push({ n: group.n, text: `${cell}: ${group.items.join(' ')}` });
  return rows.sort((a, b) => a.n - b.n).map((r) => r.text);
};

export const renderShow = (state: GameState, opts: ShowOptions = {}, d: GameData = GAME_DATA): string =>
  renderModel(showModel(state, opts, d)).join('\n');

export const renderModel = (m: ShowModel): string[] => {
  const pr = m.progress;
  const lines: string[] = [
    `== 進行（視点 ${m.viewer === 'all' ? 'すべて' : `P${m.viewer}`}）`,
    `ラウンド: ${pr.round}/${pr.rounds}　フェイズ: ${pr.phase}　場面: ${pr.scene}`,
    `手番順: ${pr.turnOrder.join(' → ')}　パスした順: ${pr.passOrder.join(' → ') || 'なし'}`,
    `選択待ち: ${pr.decider}`,
    '== 襲撃',
  ];
  const r = m.raid;
  if (r.card === null) {
    lines.push('襲撃カード: 未公開');
  } else {
    lines.push(`襲撃カード: ${r.card}（${r.increase}）　防衛ライン${r.defenseLine}・撃退ライン${r.repelLine}（累積）`);
    if (r.outcomes !== null) lines.push(`結果: 防衛失敗 ${r.outcomes.defenseFailed}／防衛成功 ${r.outcomes.defended}／撃退成功 ${r.outcomes.repelled}`);
    lines.push(`軍事: ${r.players.join('、')}`);
  }
  lines.push('== アクションボード（[ ]は置いたプレイヤー）');
  for (const a of m.actionBoard) {
    lines.push(
      `${a.action}: ${a.spaces
        .map((s) => {
          const flags = [`W${s.workers}`, s.shared ? '共有' : '', s.unlocked === null ? '' : s.unlocked ? '解放済み' : `未解放・${s.unlock}`].filter((x) => x !== '');
          return `${s.tier}（${flags.join('・')}）${s.users.length > 0 ? `[${s.users.join(',')}]` : ''}${m.brief ? '' : ` ${s.text}`}`;
        })
        .join('｜')}`,
    );
  }
  const sh = m.shared;
  lines.push('== 共有の場');
  lines.push(...sh.bonusTiles.map((b) => `ボーナスタイル${b.id}${b.holder === null ? '' : `（${b.holder}）`}: ${b.text}`));
  lines.push(...sh.specialCitizens.map((s) => `特別な市民カード ${s.id}: ${s.text}`));
  lines.push(
    ...sh.plannedCities.map((c) => `${c.name}（${c.id}${c.owner === null ? '' : `、P${c.owner} の専用`}）: ${c.condition}／恩恵 ${c.benefit}${c.claims.length > 0 ? `／達成 ${c.claims.join('・')}` : ''}`),
  );
  lines.push(`文明カード: 山札${sh.civDeck}枚・捨て札${sh.civDiscard}枚`);
  lines.push(`== 自分 P${m.self.index}（${m.self.name}）`, ...playerLines(m.self, false), m.projection);
  if (m.detail !== null) lines.push(`== 詳細 P${m.detail.index}（${m.detail.name}）`, ...playerLines(m.detail, true));
  lines.push('== 他のプレイヤー', ...m.others.flatMap(otherLines));
  if (m.draft !== null) {
    lines.push('== ドラフトの残りの候補');
    lines.push(...m.draft.characters.map((c) => `キャラクター ${c.name}: ${c.abilities.join('／')}`));
    lines.push(`個人ボード: ${m.draft.boards.map((b) => b.name).join('、')}${m.draft.boards.some((b) => b.map !== null) ? '' : '（地図は --board で出す）'}`);
    for (const b of m.draft.boards) if (b.map !== null) lines.push(...b.map);
  }
  if (m.board !== null) lines.push('== 個人ボード', ...m.board);
  const p = m.prompt;
  const extra = [
    p.remaining === null ? '' : `残り${p.remaining}`,
    p.pendingCost === null ? '' : `確定前のコスト 金${p.pendingCost.gold}・資材${p.pendingCost.materials}`,
    p.picks.length === 0 ? '' : `選択中 ${p.picks.join(',')}`,
  ].filter((x) => x !== '');
  if (p.options === null) {
    lines.push(`== 選択肢（${p.player}：${p.heading}）`, '選択肢は選択待ちのプレイヤーの視点でだけ出す（--as で視点を指定する）');
  } else if (p.options.length === 0) {
    lines.push('== 選択肢', 'なし（ゲーム終了。score で得点を見る）');
  } else {
    lines.push(`== 選択肢（${p.player}：${p.heading}${extra.length > 0 ? `、${extra.join('、')}` : ''}）`, ...optionLines(p.options), ...p.warnings);
  }
  return lines;
};

// ---------------------------------------------------------------------------
// 出来事
// ---------------------------------------------------------------------------

/** 適用した選択ごとに、見出しと出来事を並べる。 */
export const renderSteps = (state: GameState, steps: readonly Step[], d: GameData = GAME_DATA): string => {
  const lines: string[] = [];
  for (const step of steps) {
    lines.push(`${step.index}手目 ${who(state, step.player)}: ${step.id} — ${step.label}`);
    for (const e of step.events) {
      const text = eventText(state, e, d);
      if (text !== null) lines.push(`  ${text}`);
    }
  }
  return lines.join('\n');
};

/** 記録の一覧。ラベルは選択した時点の選択肢のもので、他人の手札の内容は含まない（プレイと捨て札は公開である）。 */
export const renderLog = (state: GameState, steps: readonly Step[], from = 1): string =>
  steps
    .filter((s) => s.index >= from)
    .map((s) => `${s.index}. ${who(state, s.player)} ${s.id} — ${s.label}`)
    .join('\n');

// ---------------------------------------------------------------------------
// 得点
// ---------------------------------------------------------------------------

export type ScoreModel = {
  /** 終局しているか。していなければ、得点はいま終わったときの見込み（終了時の能力を含む、projectedScores）である。 */
  readonly over: boolean;
  /** 終了の手順の途中に選択が要るため、見込みに含めなかった効果。 */
  readonly omitted: readonly string[];
  readonly players: readonly {
    readonly player: string;
    /** 得点トラックの現在値。 */
    readonly track: number;
    readonly base: number;
    readonly baseParts: { readonly land: number; readonly buildings: number; readonly workers: number };
    readonly axes: Readonly<Record<string, number>>;
    readonly total: number;
    readonly rank: number;
    readonly tiebreak: { readonly leftoverGold: number; readonly base: number };
    /** ゲーム中に得点トラックへ入った点の出どころ別の合計。 */
    readonly sources: readonly { readonly source: string; readonly axis: string; readonly points: number }[];
    readonly natureParks: number;
  }[];
};

export const scoreModel = (state: GameState, d: GameData = GAME_DATA): ScoreModel => {
  // いま終わったときの見込みは、局面の写しに終了の手順を掛けて求める（指示書 2026-11-12 対話プレイ強化 2-1）。
  const projection = projectedScores(state, d);
  const ended = projection.ended;
  return {
    over: isGameOver(state),
    omitted: projection.omitted,
    players: projection.scores.map((s) => {
      const axes: Record<string, number> = {};
      for (const axis of SCORE_AXES) axes[queries.axisLabel(axis)] = s.axes[axis];
      const p = playerAt(state, s.player);
      return {
        player: who(state, s.player),
        track: p.score,
        base: s.base,
        baseParts: s.baseParts,
        axes,
        total: s.total,
        rank: s.rank,
        tiebreak: { leftoverGold: s.leftoverGold, base: s.base },
        sources: queries.scoreSources(ended, s.player, d),
        natureParks: queries.natureParkPoints(playerAt(ended, s.player), d),
      };
    }),
  };
};

/** その席の見込み1行（resume・show --only self・--full の自分の欄）。 */
export const projectionLine = (m: ScoreModel, seat: number): string => {
  const p = m.players.find((x) => x.player.startsWith(`P${seat}`));
  if (p === undefined) return '';
  return `${projectionHeading(m)}: ${p.rank}位 合計${p.total}（得点トラック${p.track}・基礎${p.base} ${Object.entries(p.axes).map(([k, n]) => `${k}${n}`).join(' ')}）｜全員 ${m.players.map((x) => `${x.player.split('（')[0]} ${x.total}`).join(' ')}`;
};

/** 見込みの見出し（含めなかった効果があれば添える）。 */
export const projectionHeading = (m: Pick<ScoreModel, 'over' | 'omitted'>): string =>
  m.over ? '最終得点（第17章）' : `いま終わったときの見込み（終了時の能力を含む${m.omitted.length > 0 ? `。選択が要るため含めなかった効果：${m.omitted.join('・')}` : ''}）`;

export const renderScore = (state: GameState, d: GameData = GAME_DATA): string => {
  const m = scoreModel(state, d);
  return [
    m.over ? projectionHeading(m) : `終局していない。${projectionHeading(m)}：`,
    ...m.players.flatMap((p) => [
      `${p.rank}位 ${p.player}: 合計${p.total}（得点トラック${p.track}）`,
      `  基礎${p.base}（土地${p.baseParts.land}・建物${p.baseParts.buildings}・通常ワーカー${p.baseParts.workers}） ${Object.entries(p.axes)
        .map(([k, n]) => `${k}${n}`)
        .join(' ')}（自然公園${p.natureParks}を含む）`,
      `  ゲーム中の得点：${p.sources.map((x) => `${x.source} ${x.points}点（${x.axis}）`).join('、') || 'なし'}`,
      `  同点判定：残った金${p.tiebreak.leftoverGold}・基礎得点${p.tiebreak.base}`,
    ]),
  ].join('\n');
};
