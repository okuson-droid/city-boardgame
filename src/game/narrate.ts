// 出来事（GameEvent）を文にする（ユーザー決定 2026-11-10）。対話プレイのコマンドの出来事の出力と、
// 記録の再生画面の「この手番の行動」が同じ文を使う。他の席が引いたカードの内容はもともと出来事に含まれない（19-6-1）。

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

const DELTA_LABELS: Readonly<Record<string, string>> = {
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

