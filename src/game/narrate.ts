// 出来事（GameEvent）を文にする（ユーザー決定 2026-11-10）。対話プレイのコマンドの出来事の出力と、
// 記録の再生画面の「この手番の行動」が同じ文を使う。手番ごとのまとめ（turnDelta・turnSummary）も両方が使う（指示書 2026-11-11 2-5）。他の席が引いたカードの内容はもともと出来事に含まれない（19-6-1）。

import { GAME_DATA } from '../data/index.ts';
import type { GameData } from '../data/types.ts';
import {
  actionLabel,
  axisLabel,
  boardName,
  buildingLabel,
  characterName,
  civCardName,
  plannedCityName,
  sourceName,
  terrainLabel,
  tierLabel,
} from './labels.ts';
import type { GameEvent, GameState } from './types.ts';
import { DELTA_KEYS } from './deltas.ts';

const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

const CAUSES: Readonly<Record<string, string>> = {
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

export const DELTA_LABELS: Readonly<Record<string, string>> = {
  gold: '金',
  materials: '資材',
  militaryTokens: '軍事力トークン',
  goldProduction: '金の生産力',
  materialProduction: '資材の生産力',
  regularWorkers: '通常ワーカー',
  tempWorkers: '臨時ワーカー',
  militaryLevel: '軍事レベル',
  infraLevel: 'インフラレベル',
  score: '得点',
  hand: '手札',
};

const RAID_RESULTS: Readonly<Record<string, string>> = { defenseFailed: '防衛失敗', defended: '防衛成功', repelled: '撃退成功' };
const RAID_DECLARED: Readonly<Record<string, string>> = { none: '宣言なし', defense: '防衛を宣言', repel: '撃退を宣言' };

/** 出来事1つの文。who はプレイヤーの呼び方（既定は P0 のような番号）。 */
export const eventText = (
  state: GameState,
  e: GameEvent,
  d: GameData = GAME_DATA,
  who: (player: number) => string = (player) => `P${player}`,
): string | null => {
  const p = 'player' in e ? who(e.player) : '';
  switch (e.type) {
    case 'delta':
      return `${p} ${CAUSES[e.cause] ?? '自動処理'}の増減: ${Object.entries(e.changes)
        .map(([k, n]) => `${DELTA_LABELS[k] ?? k}${signed(n ?? 0)}`)
        .join(' ')}`;
    case 'score':
      return `${p} ${signed(e.points)}点（${axisLabel(e.axis)}、${sourceName(d, e.source)}）`;
    case 'round':
      return `── 第${e.round}ラウンド開始（襲撃カード ${e.raidCard}）`;
    case 'draft':
      return `${p} ドラフトで${e.kind === 'board' ? `個人ボード ${boardName(d, e.id)}` : e.kind === 'bonus' ? `ボーナスタイル${e.id}` : `キャラクター ${characterName(d, e.id)}`}を選んだ`;
    case 'action':
      return `${p} ${actionLabel(e.action)}・${tierLabel(e.tier)}${e.copied ? 'の効果を写した' : 'を実行'}`;
    case 'tilePlaced':
      return `${p} ${e.cell}に${terrainLabel(e.terrain)}の土地タイルを置いた`;
    case 'built':
      return `${p} ${e.cell === null ? '文明カードの上' : e.cell}に${buildingLabel(e.building)}を建てた`;
    case 'trackRaised':
      return `${p} ${e.track === 'military' ? '軍事レベル' : 'インフラレベル'}が${e.level}になった`;
    case 'cardPlayed':
      return `${p} 文明カード ${civCardName(d, e.card)} をプレイした`;
    case 'cardsDrawn':
      return `${p} 文明カードを${e.count}枚引いた`;
    case 'specialCitizen':
      return `${p} 特別な市民カード ${e.card} を獲得した`;
    case 'levelReward':
      return `${p} ${e.track === 'military' ? '軍事レベル' : 'インフラレベル'}${e.level}の到達報酬`;
    case 'pass':
      return `${p} パスした`;
    case 'free':
      return `${p} フリーアクションを使った`;
    case 'raid':
      return `${p} 襲撃：${RAID_DECLARED[e.declared] ?? e.declared}、${RAID_RESULTS[e.result] ?? e.result}`;
    case 'fizzle':
      // 襲撃の fizzle は、雲隠れなどで自分の襲撃の処理を行わなかったことを表す。
      return e.what === 'raid' ? `${p} 襲撃の処理を行わなかった` : `${p} 実行できず不発になった`;
    case 'plannedCity':
      return `${p} ${plannedCityName(d, e.card)}を${e.rank}番目に達成（${e.points}点）`;
    case 'ability':
      return `${p} ${sourceName(d, e.key.split('#')[0] ?? e.key)}の能力が働いた`;
    case 'gameOver':
      return '── ゲーム終了';
    case 'workerGained':
    case 'actionFinished':
      return null;
  }
};


// ---------------------------------------------------------------------------
// 手番ごとのまとめ（指示書 2026-11-11 2-5）
// ---------------------------------------------------------------------------

/** 手番のあいだの、プレイヤー player の増減の合計（選択の処理によるもの、cause＝move だけ）。0 の項目は含めない。 */
export const turnDelta = (events: readonly GameEvent[], player: number): Record<string, number> => {
  const total: Record<string, number> = {};
  for (const e of events) {
    if (e.type !== 'delta' || e.player !== player || e.cause !== 'move') continue;
    for (const [k, n] of Object.entries(e.changes)) total[k] = (total[k] ?? 0) + (n ?? 0);
  }
  const ordered: Record<string, number> = {};
  for (const k of DELTA_KEYS) if ((total[k] ?? 0) !== 0) ordered[k] = total[k] ?? 0;
  return ordered;
};

/** 増減の文（「金+3 資材-2」）。 */
export const deltaText = (changes: Readonly<Record<string, number | undefined>>): string =>
  Object.entries(changes)
    .filter(([, n]) => (n ?? 0) !== 0)
    .map(([k, n]) => `${DELTA_LABELS[k] ?? k}${signed(n ?? 0)}`)
    .join(' ');

const countText = (counts: ReadonlyMap<string, number>): string => [...counts].map(([k, n]) => (n === 1 ? k : `${k}${n}`)).join('・');

const bump = (m: Map<string, number>, k: string): void => {
  m.set(k, (m.get(k) ?? 0) + 1);
};

/**
 * 1つの手番の要約1行：誰が、どのアクションを（段階つき）、何を置き・建て・プレイし、何が増減したか。
 * 例：「P1 建築・上位：住宅2・役所1、資材-7 インフラレベル+1 得点+2」。events は手番のあいだの出来事で、player 以外の出来事は使わない。
 */
export const turnSummary = (
  state: GameState,
  player: number,
  events: readonly GameEvent[],
  d: GameData = GAME_DATA,
  who: (player: number) => string = (p) => `P${p}`,
): string => {
  const parts: string[] = [];
  const built = new Map<string, number>();
  const tiles = new Map<string, number>();
  let free = 0;
  for (const e of events) {
    if (!('player' in e) || e.player !== player) continue;
    switch (e.type) {
      case 'action':
        parts.push(`${actionLabel(e.action)}・${tierLabel(e.tier)}${e.copied ? '（効果を写した）' : ''}`);
        break;
      case 'pass':
        parts.push('パス');
        break;
      case 'draft':
        parts.push(`ドラフト：${e.kind === 'board' ? boardName(d, e.id) : e.kind === 'bonus' ? `ボーナスタイル${e.id}` : characterName(d, e.id)}`);
        break;
      case 'free':
        free += 1;
        break;
      case 'tilePlaced':
        bump(tiles, terrainLabel(e.terrain));
        break;
      case 'built':
        bump(built, buildingLabel(e.building));
        break;
      case 'cardPlayed':
        parts.push(`プレイ ${civCardName(d, e.card)}`);
        break;
      case 'specialCitizen':
        parts.push(`特別な市民カード${e.card}を獲得`);
        break;
      case 'plannedCity':
        parts.push(`${plannedCityName(d, e.card)}を${e.rank}番目に達成`);
        break;
      case 'raid':
        parts.push(`襲撃 ${RAID_DECLARED[e.declared] ?? e.declared}・${RAID_RESULTS[e.result] ?? e.result}`);
        break;
      default:
        break;
    }
  }
  if (free > 0) parts.push(free === 1 ? 'フリーアクション' : `フリーアクション×${free}`);
  if (tiles.size > 0) parts.push(`土地タイル ${countText(tiles)}`);
  if (built.size > 0) parts.push(`建設 ${countText(built)}`);
  const delta = deltaText(turnDelta(events, player));
  return `${who(player)} ${parts.join('、') || '（行動なし）'}${delta === '' ? '' : `：${delta}`}`;
};

/** 手番を始める出来事（選択した人が分かるもの）。 */
const actorOf = (e: GameEvent): number | null => {
  if (e.type === 'delta') return e.cause === 'move' ? e.player : null;
  if (e.type === 'action' || e.type === 'pass' || e.type === 'draft' || e.type === 'free' || e.type === 'raid') return e.player;
  return null;
};

/**
 * 出来事の列だけから、手番のまとまりに分ける（選択と出来事の対応を持たないオンライン版の写しのため）。
 * 選択した人が分かる出来事のプレイヤーが替わったところで区切る。自動の処理の出来事は、直前のまとまりに入れる。
 * 選択の記録がある場合は replayTurns を使う。
 */
export const eventTurns = (events: readonly GameEvent[]): { readonly player: number | null; readonly events: GameEvent[] }[] => {
  const turns: { player: number | null; events: GameEvent[] }[] = [];
  for (const e of events) {
    const actor = actorOf(e);
    const last = turns[turns.length - 1];
    if (last === undefined || (actor !== null && last.player !== actor)) {
      if (last !== undefined && last.player === null) {
        last.player = actor;
        last.events.push(e);
      } else {
        turns.push({ player: actor, events: [e] });
      }
    } else {
      last.events.push(e);
    }
  }
  return turns;
};
