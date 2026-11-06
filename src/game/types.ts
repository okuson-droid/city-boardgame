// ゲーム状態の型。GameState は JSON で直列化できる値だけで構成する（指示書 3-2）。
// 進行は「選択待ちモデル」で表す。stack の最上段が現在処理中のタスクであり、
// 自動タスクは advance が処理し、選択タスクはプレイヤーの選択（applyMove）を待つ。

import type { CellId } from './board.ts';
import type { RngState } from './rng.ts';
import type { Action, Building, ScoreAxis, Terrain, Tier } from '../data/types.ts';
import type { Command } from '../data/script.ts';

/** ヴァリアントルール（ユーザー決定）。省略した項目は採用しない。古い記録との互換のため、項目はすべて省略可とする。 */
export type GameVariants = {
  /** 準備のドラフトをスネークドラフト（N…1、1…N、N…1）にする（ユーザー決定 2026-11-06）。 */
  readonly snakeDraft?: boolean;
};

export type GameConfig = {
  readonly playerCount: number;
  readonly playerNames?: readonly string[];
  readonly variants?: GameVariants;
};

export type PendingLoss = { readonly kind: 'gold' | 'materials'; readonly amount: number };

export type PlayerState = {
  readonly index: number;
  readonly name: string;
  boardId: string | null;
  characterId: string | null;
  /** 現在保有するボーナスタイルの番号。 */
  bonusTile: number | null;
  /** 配置済みの土地タイル。値は土地タイルの種類（4-1-3-2）。 */
  land: Partial<Record<CellId, Terrain>>;
  buildings: Partial<Record<CellId, Building>>;
  /**
   * 文明カードの上に建てた住宅の数（移動住宅）。鍵は出どころ（`civ:<カード>`）。
   * 盤面にはないが、建物の数・住宅の数・上限に数える（ユーザー決定 2026-11-06）。
   */
  cardHouses: Record<string, number>;
  gold: number;
  materials: number;
  goldProduction: number;
  materialProduction: number;
  militaryTokens: number;
  regularWorkers: number;
  /** このラウンドに獲得した通常ワーカー。ラウンド中は使えない（3-3-3）。 */
  regularNewThisRound: number;
  /** このラウンドに配置した通常ワーカー。 */
  regularPlaced: number;
  tempWorkers: number;
  /** この手番に獲得した臨時ワーカー。手番中は使えない（3-4-4-2）。 */
  tempLocked: number;
  militaryLevel: number;
  infraLevel: number;
  militaryRewardsClaimed: number[];
  infraRewardsClaimed: number[];
  hand: string[];
  played: string[];
  specialCitizens: string[];
  natureParkCard: string | null;
  unlockedTop: Action[];
  passed: boolean;
  /** 得点トラック（17-0-3）。内訳は events の score で持つ。 */
  score: number;
  /** 襲撃の防衛失敗による「次の収入後」の損失（7-6-1、7-6-3）。 */
  pendingLosses: PendingLoss[];
  /** 最初の手番開始時の効果を処理したか（芸術家・聖女・デザイナー）。 */
  firstTurnDone: boolean;
  /** 「1ラウンドに1回」の能力のうち、このラウンドに使ったもの（能力の識別子）。 */
  usedThisRound: string[];
  /** 「N回に1回」の能力の数え上げ（能力の識別子→回数）。 */
  abilityCounters: Record<string, number>;
  /** ゲーム中1回だけ発動する能力のうち、発動済みのもの。 */
  onceFired: string[];
  /** この手番に獲得した特別な市民カード。手番中はフリーアクションと専用スペースを使えない（9-3-3）。 */
  lockedSources: string[];
  /** 精霊チップの置かれた土地（19-5-7）。 */
  spiritChips: Partial<Record<Terrain, CellId>>;
  /** デザイナー専用の計画都市カード（19-5-3）。 */
  privatePlannedCities: string[];
};

export type BuildPick = { readonly building: Building; readonly cell: CellId };

/** 建設の指定。建築アクション・建設の権利・無料建設・効果による建設をまとめて表す。 */
export type BuildSpec = {
  readonly min: number;
  readonly max: number;
  /** 建築アクションの段階。null なら建築アクションの割引を適用しない（19-1-3）。 */
  readonly tier: Tier | null;
  readonly buildings: readonly Building[] | null;
  readonly terrain: Terrain | null;
  readonly payGold: boolean;
  readonly payMaterials: boolean;
};

/** 選択を伴う効果。複数が同時に発生したときは処理順を尋ねる（decisions.md 3-4）。 */
export type ChoiceEffect =
  | { readonly k: 'command'; readonly command: Command; readonly source: string }
  /** any は地形と異なる種類も置ける（強行軍の遠征報酬）。 */
  | { readonly k: 'landTiles'; readonly n: number; readonly any?: boolean }
  | { readonly k: 'buildRight' }
  | { readonly k: 'freeBuild'; readonly terrain: Terrain | null }
  | { readonly k: 'specialCitizen' }
  | { readonly k: 'discard'; readonly n: number };

export type Task =
  | { readonly t: 'draftPick'; readonly player: number }
  | { readonly t: 'setupFinish' }
  | { readonly t: 'roundStart' }
  | { readonly t: 'bonusTileStart'; readonly player: number }
  | { readonly t: 'income' }
  | { readonly t: 'turn'; readonly player: number; acted: boolean; started: boolean }
  | { readonly t: 'turnStart'; readonly player: number }
  | { readonly t: 'payWorkers'; readonly player: number; readonly cost: number; readonly target: string }
  | { readonly t: 'pioneerCount'; readonly player: number; readonly tier: Tier }
  | {
      readonly t: 'placeTiles';
      readonly player: number;
      remaining: number;
      placed: CellId[];
      readonly mode: 'pioneer' | 'effect';
      readonly tier: Tier | null;
      mismatches: number;
      /** 効果による配置の土地タイル：match は地形と同じ種類、any は任意、地形名はその種類（地形を無視）。 */
      readonly tile: 'match' | 'any' | Terrain;
      /** 異なる種類の土地タイルだけを置く（大規模開拓）。古い記録の局面では欠ける。 */
      readonly distinct?: boolean;
      /** 「配置を終える」（done）を選べる。 */
      readonly upTo?: boolean;
      /** この地形のマスにだけ置く（山小屋など）。 */
      readonly onTerrain?: Terrain;
    }
  | { readonly t: 'build'; readonly player: number; readonly spec: BuildSpec; picks: BuildPick[] }
  | { readonly t: 'importCount'; readonly player: number; readonly tier: Tier }
  | { readonly t: 'exportCount'; readonly player: number; readonly tier: Tier }
  | { readonly t: 'drillRaise'; readonly player: number; readonly tier: Tier }
  | {
      readonly t: 'expeditionPick';
      readonly player: number;
      readonly tier: Tier;
      picks: number[];
      /** card は文明カード017（目標値とトークンなし、軍事レベル以下、異なる報酬を count 個まで）。 */
      readonly mode: 'action' | 'card';
      readonly count: number;
    }
  | { readonly t: 'welfareConvert'; readonly player: number }
  | { readonly t: 'migrationCount'; readonly player: number; readonly tier: Tier }
  | {
      readonly t: 'discard';
      readonly player: number;
      remaining: number;
      /** 兵法：途中で（0枚でも）終えられ、捨てた枚数だけこのトラックを上げる。古い記録の局面では欠ける。 */
      readonly raise?: 'military' | 'infra';
      discarded?: number;
    }
  | { readonly t: 'spreadPlay'; readonly player: number; readonly tier: Tier; played: number }
  | { readonly t: 'chooseSpecialCitizen'; readonly player: number }
  | {
      readonly t: 'playCard';
      readonly player: number;
      remaining: number;
      readonly free: boolean;
      /** true なら「プレイを終える」（done）を選べる。古い記録の局面では欠ける。 */
      readonly upTo?: boolean;
    }
  | { readonly t: 'chooseOne'; readonly player: number; readonly options: readonly (readonly Command[])[]; readonly source: string }
  | { readonly t: 'copyAction'; readonly player: number }
  | { readonly t: 'spiritPlace'; readonly player: number }
  | { readonly t: 'heroStart'; readonly player: number }
  | { readonly t: 'chooseOrder'; readonly player: number; items: ChoiceEffect[] }
  | { readonly t: 'passTile'; readonly player: number; readonly returned: number | null }
  | { readonly t: 'nextTurn'; readonly from: number }
  | { readonly t: 'raidDeclare'; readonly player: number }
  /**
   * 傭兵団：払った軍事力トークンのうち何個を金に替えるか（count:<k>）。トークンを k 個戻し、k×率 の金を払う。
   * 払った時点でまずトークンを使い、足りない分だけ金で払う。替える数は払った直後に尋ねる。
   */
  | { readonly t: 'tokenSwap'; readonly player: number; readonly max: number; readonly rate: number }
  /**
   * アクションの終わりの印（自動タスク）。アクションの選択タスクより下に積み、処理（途中で起きた効果を含む）を
   * すべて終えたときに actionFinished の出来事を起こす。built はその間に建てた建物である。
   */
  | { readonly t: 'actionEnd'; readonly player: number; readonly action: Action; readonly tier: Tier; built: Building[] }
  /** 選択を伴う命令の後に処理する命令（自動タスク、命令 later）。 */
  | { readonly t: 'later'; readonly player: number; readonly commands: readonly Command[]; readonly source: string; readonly axis: ScoreAxis }
  | { readonly t: 'roundEnd' }
  | { readonly t: 'gameEnd' };

export type GameEvent =
  | {
      readonly type: 'score';
      readonly player: number;
      readonly points: number;
      readonly axis: ScoreAxis;
      readonly source: string;
    }
  | { readonly type: 'round'; readonly round: number; readonly raidCard: number }
  | { readonly type: 'draft'; readonly player: number; readonly kind: string; readonly id: string }
  | {
      readonly type: 'action';
      readonly player: number;
      readonly action: Action;
      readonly tier: Tier;
      /** 特別市民11 で他のスペースの効果を写した（スペースは使っていない、19-2-11）。 */
      readonly copied: boolean;
    }
  | { readonly type: 'tilePlaced'; readonly player: number; readonly cell: CellId; readonly terrain: Terrain }
  /** cell が null の建物は文明カードの上に建てた（移動住宅）。 */
  | { readonly type: 'built'; readonly player: number; readonly cell: CellId | null; readonly building: Building }
  | {
      readonly type: 'actionFinished';
      readonly player: number;
      readonly action: Action;
      readonly tier: Tier;
      readonly built: readonly Building[];
    }
  | { readonly type: 'trackRaised'; readonly player: number; readonly track: 'military' | 'infra'; readonly level: number }
  | { readonly type: 'cardPlayed'; readonly player: number; readonly card: string }
  | { readonly type: 'cardsDrawn'; readonly player: number; readonly count: number }
  | { readonly type: 'workerGained'; readonly player: number; readonly kind: 'regular' | 'temp' }
  | { readonly type: 'specialCitizen'; readonly player: number; readonly card: string }
  | { readonly type: 'levelReward'; readonly player: number; readonly track: 'military' | 'infra'; readonly level: number }
  | { readonly type: 'pass'; readonly player: number }
  | { readonly type: 'free'; readonly player: number; readonly id: string }
  | {
      readonly type: 'raid';
      readonly player: number;
      readonly round: number;
      readonly result: RaidResult;
      readonly declared: RaidDeclaration;
    }
  | { readonly type: 'fizzle'; readonly player: number; readonly what: string }
  | { readonly type: 'plannedCity'; readonly player: number; readonly card: string; readonly rank: number; readonly points: number }
  | { readonly type: 'ability'; readonly player: number; readonly key: string }
  | {
      readonly type: 'delta';
      readonly player: number;
      /** move は選択1つの処理、それ以外は自動の処理（roundStart・bonusTileStart・income・gameEnd など）。 */
      readonly cause: string;
      readonly changes: Readonly<Partial<Record<string, number>>>;
    }
  | { readonly type: 'gameOver' };

export type RaidResult = 'defenseFailed' | 'defended' | 'repelled';
export type RaidDeclaration = 'none' | 'defense' | 'repel';

export type Phase = 'draft' | 'play' | 'raid' | 'over';

export type GameState = {
  readonly config: GameConfig;
  readonly seed: number;
  rng: RngState;
  phase: Phase;
  /** 現在のラウンド（1〜5）。ドラフト中は 0。 */
  round: number;
  /** そのラウンドの手番順（プレイヤー番号の列）。 */
  turnOrder: number[];
  /** そのラウンドでパスした順（12-0-5）。 */
  passOrder: number[];
  players: PlayerState[];
  civDeck: string[];
  civDiscard: string[];
  scDeck: string[];
  scRevealed: string[];
  plannedCityRevealed: string[];
  /** 計画都市カードの山札（デザイナー専用カードを引く、19-5-3）。 */
  plannedCityDeck: string[];
  /** 計画都市カードごとの達成宣言の順（13-3-4、13-3-6）。 */
  plannedCityClaims: Record<string, number[]>;
  /** ラウンド順の襲撃カード番号（7-3-1、7-3-2）。 */
  raidOrder: number[];
  defenseLine: number;
  repelLine: number;
  bonusTilesOnBoard: number[];
  draftPool: { boards: string[]; characters: string[]; bonusTiles: number[] };
  /** 占有済みのアクションスペース（"action.tier"）。 */
  occupied: string[];
  stack: Task[];
  events: GameEvent[];
  /** 非公開情報が公開された回数（カードを引くなど）。チェックポイントの判定に用いる。 */
  revealCount: number;
  /** 適用した選択の記録。巻き戻しは記録の再生で行う（history.ts）。 */
  log: { readonly move: string; readonly checkpoint: boolean }[];
};

/** 選択肢。id は applyMove に渡す識別子、label は確認用の短い説明である。 */
export type Option = { readonly id: string; readonly player: number; readonly label: string };
