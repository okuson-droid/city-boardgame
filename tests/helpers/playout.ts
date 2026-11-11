// 乱択プレイアウト。本体は src/game/selfplay.ts にあり（チューナーの保存前の検査と共用する、2026-11-11）、
// ここでは既定のデータを補って再輸出する。

import { GAME_DATA } from '../../src/data/index.ts';
import type { GameData } from '../../src/data/types.ts';
import { playout as playoutWith, yieldOnce, type PlayoutResult } from '../../src/game/selfplay.ts';

export type { PlayoutResult };

export const playout = (playerCount: number, seed: number, maxMoves: number, d: GameData = GAME_DATA): PlayoutResult =>
  playoutWith(playerCount, seed, maxMoves, d);

/**
 * 処理を一度だけ Vitest の作業者に譲る。乱択プレイアウトを何十局も同期で続けると、作業者が親との通信に
 * 答えられず「Timeout calling onTaskUpdate」で全体が失敗するため、1局ごとに呼ぶ。
 */
export const yieldToRunner = yieldOnce;
