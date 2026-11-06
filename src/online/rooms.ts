// オンライン版の部屋（段階5、ユーザー決定 2026-11-03）。サーバーが対局の状態を持ち、各席には伏せた写しだけを渡す。
// 対局は「設定・シード・選択の列」として記録し、再生で状態を作り直す（サーバーの再起動後も続きから遊べる）。
// 通信や鍵の照合はサーバー（server/main.ts）が行い、ここには画面にも通信にも依存しない処理だけを置く。

import { DATA_VERSION, GAME_DATA } from '../data/index.ts';
import type { GameData } from '../data/types.ts';
import { applyMove, createGame, decider, getOptions } from '../game/engine.ts';
import { undoLast } from '../game/history.ts';
import type { GameConfig, GameState, GameVariants } from '../game/types.ts';

export type SeatRecord = { readonly name: string; readonly keyHash: string };

/** 部屋の記録。ファイルに保存する。 */
export type RoomRecord = {
  readonly code: string;
  readonly playerCount: number;
  readonly createdAt: string;
  /** 部屋を作ったときのデータの版（DATA_VERSION）。この版と異なるデータでは対局を続けない。古い記録には無い。 */
  readonly dataVersion?: string;
  /** 採用したヴァリアントルール。採用しないときと古い記録には無い。 */
  readonly variants?: GameVariants;
  seats: SeatRecord[];
  /** 全席が埋まって対局を始めたときのシード。始まる前は null。 */
  seed: number | null;
  /** 適用した選択と、選んだ席。 */
  moves: { readonly seat: number; readonly move: string }[];
};

export type Room = { record: RoomRecord; state: GameState | null };

export type RoomSummary = {
  readonly code: string;
  readonly playerCount: number;
  readonly names: readonly string[];
  readonly started: boolean;
  readonly variants: GameVariants;
  /** 部屋のデータの版（DATA_VERSION）。画面の版と違えば、画面は読み込み直しを求める。古い記録には無い。 */
  readonly dataVersion?: string;
};

export class RoomError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'RoomError';
    this.status = status;
  }
}

export const summaryOf = (room: Room): RoomSummary => ({
  code: room.record.code,
  playerCount: room.record.playerCount,
  names: room.record.seats.map((s) => s.name),
  started: room.state !== null,
  variants: room.record.variants ?? {},
  ...(room.record.dataVersion !== undefined ? { dataVersion: room.record.dataVersion } : {}),
});

/** 対局の設定（人数・名前・ヴァリアント）。始めるときと記録の再生で同じものを使う。 */
const configOf = (record: RoomRecord): GameConfig => ({
  playerCount: record.playerCount,
  playerNames: record.seats.map((s) => s.name),
  ...(record.variants !== undefined ? { variants: record.variants } : {}),
});

/** 送られてきたヴァリアントの指定を、知っている項目の真偽値だけに絞る。採用するものが無ければ undefined。 */
export const parseVariants = (value: unknown): GameVariants | undefined => {
  const v = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  return v['snakeDraft'] === true ? { snakeDraft: true } : undefined;
};

const validName = (name: string): string => {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed.length > 20) throw new RoomError(400, '名前は1〜20文字にすること');
  return trimmed;
};

export const createRoom = (
  code: string,
  playerCount: number,
  name: string,
  keyHash: string,
  now: Date,
  d: GameData = GAME_DATA,
  variants?: GameVariants,
): Room => {
  if (playerCount < d.params.playerCount.min || playerCount > d.params.playerCount.max) {
    throw new RoomError(400, `対応していないプレイ人数である：${playerCount}`);
  }
  return {
    record: {
      code,
      playerCount,
      createdAt: now.toISOString(),
      dataVersion: DATA_VERSION,
      ...(variants !== undefined ? { variants } : {}),
      seats: [{ name: validName(name), keyHash }],
      seed: null,
      moves: [],
    },
    state: null,
  };
};

/** 席に着く。返り値は席の番号（プレイヤー番号）。全席が埋まったら seed で対局を始める。 */
export const joinRoom = (room: Room, name: string, keyHash: string, seed: number, d: GameData = GAME_DATA): number => {
  if (room.record.seats.length >= room.record.playerCount) throw new RoomError(409, '席が埋まっている');
  room.record.seats.push({ name: validName(name), keyHash });
  const seat = room.record.seats.length - 1;
  if (room.record.seats.length === room.record.playerCount) {
    room.record.seed = seed;
    room.state = createGame(configOf(room.record), seed, d);
  }
  return seat;
};

/**
 * 部屋のデータの版が、いま使っているデータの版と同じか確かめる。違えば例外。
 * データの更新は進行中の対局に反映しない（ユーザー決定 2026-11-04）。選択の列を新しいデータで再生すると局面が食い違うためである。
 */
export const assertDataVersion = (record: RoomRecord, current: string = DATA_VERSION): void => {
  if (record.dataVersion !== undefined && record.dataVersion !== current) {
    throw new RoomError(410, 'ゲームのデータが更新されたため、この部屋の対局は続けられない。新しい部屋を作ること');
  }
};

/** 記録から部屋を作り直す（選択の列を再生する）。データの版が違う部屋は作り直さない。 */
export const loadRoom = (record: RoomRecord, d: GameData = GAME_DATA, version: string = DATA_VERSION): Room => {
  assertDataVersion(record, version);
  if (record.seed === null) return { record, state: null };
  let state = createGame(configOf(record), record.seed, d);
  for (const { move } of record.moves) state = applyMove(state, move, d);
  return { record, state };
};

/**
 * 席の選択を適用する。選択待ちの持ち主でない席、選べない選択、古い局面からの送信（logLength の食い違い）は拒む。
 */
export const moveInRoom = (room: Room, seat: number, move: string, logLength: number, d: GameData = GAME_DATA): void => {
  const state = room.state;
  if (state === null) throw new RoomError(409, '対局が始まっていない');
  if (state.log.length !== logLength) throw new RoomError(409, '局面が更新されている。最新の局面から選び直すこと');
  if (decider(state) !== seat) throw new RoomError(403, '選択待ちの持ち主ではない');
  if (!getOptions(state, d).some((o) => o.id === move)) throw new RoomError(400, `選べない選択肢である：${move}`);
  room.state = applyMove(state, move, d);
  room.record.moves.push({ seat, move });
};

/** 直前の選択を取り消す。取り消せるのは、その選択をした席だけで、チェックポイントの後は取り消せない（15-1-2、19-6-3）。 */
export const undoInRoom = (room: Room, seat: number, d: GameData = GAME_DATA): void => {
  const state = room.state;
  const last = room.record.moves[room.record.moves.length - 1];
  if (state === null || last === undefined) throw new RoomError(409, '取り消す選択がない');
  if (last.seat !== seat) throw new RoomError(403, '直前の選択をした席ではない');
  const back = undoLast(state, d);
  if (back === null) throw new RoomError(409, '直前の処理より前には戻れない');
  room.state = back;
  room.record.moves.pop();
};

/**
 * 席に渡す伏せた写し（19-6-1）。他の席の手札の内容、山札の順序と内容、未公開の襲撃カード、乱数の状態とシードを伏せる。
 * 枚数は残すため、画面は手札の枚数や山札の枚数を出せる。
 */
export const viewFor = (state: GameState, seat: number): GameState => {
  const hidden = '?';
  const view = structuredClone(state);
  return {
    ...view,
    seed: 0,
    rng: { seed: 0, state: 0 },
    civDeck: view.civDeck.map(() => hidden),
    scDeck: view.scDeck.map(() => hidden),
    plannedCityDeck: view.plannedCityDeck.map(() => hidden),
    raidOrder: view.raidOrder.map((card, i) => (i < view.round ? card : 0)),
    players: view.players.map((p) => (p.index === seat ? p : { ...p, hand: p.hand.map(() => hidden) })),
  };
};
