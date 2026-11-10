// src/data/ の型定義。
// 調整の対象になりうる数値はすべてデータに置き、ゲームロジックはこの型を通して読む（指示書 1）。
// JSON の読み込み直後の値は unknown として扱い、validate.ts の検査を通して以下の型にする。

import type { CellId } from '../game/board.ts';
import type { Script } from './script.ts';

// ---------------------------------------------------------------------------
// 列挙
// ---------------------------------------------------------------------------

/** 地形・土地タイルの種類（rules.md 2-1-5、4-1-2）。 */
export const TERRAINS = ['water', 'mountain', 'plains', 'forest'] as const;
export type Terrain = (typeof TERRAINS)[number];

/** 建物の種類（rules.md 5-2-1）。camp は飯場である。 */
export const BUILDINGS = ['shop', 'workshop', 'fort', 'office', 'university', 'house', 'camp'] as const;
export type Building = (typeof BUILDINGS)[number];

/** アクション（rules.md 6-3）。 */
export const ACTIONS = [
  'pioneer',
  'build',
  'import',
  'export',
  'drill',
  'expedition',
  'welfare',
  'migration',
  'research',
  'spread',
] as const;
export type Action = (typeof ACTIONS)[number];

/** アクションの段階（rules.md 6-1-1）。normal＝通常、upper＝上位、top＝最上位。 */
export const TIERS = ['normal', 'upper', 'top'] as const;
export type Tier = (typeof TIERS)[number];

/** 文明カードのタグ（decisions.md 1-1：8種は同じ分類で上下の区別はない）。 */
export const CIV_TAGS = [
  'military',
  'economy',
  'academic',
  'life',
  'environment',
  'literature',
  'art',
  'music',
] as const;
export type CivTag = (typeof CIV_TAGS)[number];

/** 評価軸（rules.md 1-1-1）と「その他」（17-0-2）。 */
export const SCORE_AXES = ['economy', 'culture', 'welfare', 'nature', 'military', 'other'] as const;
export type ScoreAxis = (typeof SCORE_AXES)[number];

/** 遠征・到達報酬・マスボーナスなどで得るものの単位。効果の命令セット（段階3）はこれを包含する。 */
export const GRANT_KINDS = [
  'gold',
  'materials',
  'drawCivCards',
  'militaryTokens',
  'landTiles',
  'tempWorkers',
  'specialCitizen',
  'points',
  'buildRight',
  'freeBuildOnTerrain',
  'goldProduction',
  'materialProduction',
] as const;
export type GrantKind = (typeof GRANT_KINDS)[number];

export type Grant =
  | { readonly kind: Exclude<GrantKind, 'freeBuildOnTerrain'>; readonly amount: number }
  | { readonly kind: 'freeBuildOnTerrain'; readonly terrain: Terrain; readonly amount: number };

/** フリーアクションなどで支払うものの単位。 */
export const PAYMENT_KINDS = ['gold', 'materials', 'militaryTokens', 'civCards', 'tempWorkers'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];
export type Payment = { readonly kind: PaymentKind; readonly amount: number };

/** 仮置きの印（指示書 1）。provisionalFields は仮置きの項目名で、空なら項目全体が仮置きである。 */
export type ProvisionalMark = {
  readonly provisional: boolean;
  readonly provisionalFields?: readonly string[];
};

export type TierTable<T> = { readonly normal: T; readonly upper: T; readonly top: T };

// ---------------------------------------------------------------------------
// params.json
// ---------------------------------------------------------------------------

export type SetupForPlayerCount = {
  /** 特別な市民カードの公開枚数（rules.md 2-3-1）。 */
  readonly specialCitizensRevealed: number;
  /** 計画都市カードの公開枚数（rules.md 2-3-3）。 */
  readonly plannedCityRevealed: number;
  /** 場のボーナスタイル枚数（rules.md 2-4-2）。 */
  readonly bonusTilesOnBoard: number;
  /** 計画都市カード1枚に達成を宣言できる人数（rules.md 13-3-5）。 */
  readonly plannedCityMaxDeclarers: number;
  /** ドラフトで提示する個人ボードの候補数（rules.md 2-6-2。ユーザー決定 2026-11-03：3人でも5枚すべて）。 */
  readonly draftBoardCandidates: number;
  /** ドラフトで提示するキャラクターの候補数（rules.md 2-6-2。ユーザー決定 2026-11-03：10人すべて）。 */
  readonly draftCharacterCandidates: number;
};

export type InitialResources = {
  readonly gold: number;
  readonly materials: number;
  readonly goldProduction: number;
  readonly materialProduction: number;
  readonly regularWorkers: number;
  readonly tempWorkers: number;
  readonly civCards: number;
  readonly militaryLevel: number;
  readonly infraLevel: number;
};

export type UnlockCondition =
  | { readonly metric: 'buildingsOfType'; readonly building: Building; readonly atLeast: number }
  | {
      readonly metric: 'totalBuildings' | 'landTiles' | 'militaryLevel' | 'civCardsPlayed';
      readonly atLeast: number;
    };

export type ExpeditionSelection =
  | { readonly mode: 'distinct'; readonly max: number }
  | { readonly mode: 'total'; readonly total: number; readonly maxSame: number };

export type LevelReward = { readonly level: number; readonly grants: readonly Grant[] };

export type Params = ProvisionalMark & {
  readonly rulesVersion: string;
  readonly rounds: number;
  readonly playerCount: { readonly min: number; readonly max: number };
  readonly setupByPlayerCount: Readonly<Record<string, SetupForPlayerCount>>;
  readonly board: {
    readonly terrainCounts: Readonly<Record<Terrain, number>>;
    readonly initialCells: readonly CellId[];
    readonly initialTerrain: Terrain;
  };
  readonly initial: InitialResources;
  readonly workers: {
    readonly regularBase: number;
    readonly housesPerExtraRegular: number;
    readonly regularMax: number;
    readonly tempMax: number;
  };
  readonly land: {
    readonly materialsPerTile: number;
    readonly mismatchExtraMaterials: number;
    readonly minTotalMaterials: number;
  };
  readonly buildings: {
    readonly limits: Readonly<Record<Building, number>>;
    readonly cost: Readonly<Record<Building, { readonly gold: number; readonly materials: number }>>;
    readonly minCost: number;
    readonly terrainBonus: readonly {
      readonly terrain: Terrain;
      readonly buildings: readonly Building[];
      readonly grant: Grant;
    }[];
    readonly effects: {
      readonly shop: {
        readonly goldProductionOnBuild: number;
        /** 添字は商店数（0〜上限）。 */
        readonly goldProductionAfterImportByCount: readonly number[];
      };
      readonly workshop: {
        readonly materialProductionOnBuild: number;
        readonly goldAfterExportByCount: readonly number[];
      };
      readonly fort: {
        readonly militaryOnBuild: number;
        readonly drillTokenCostByCount: readonly number[];
      };
      readonly office: {
        readonly infraOnBuild: number;
        readonly welfareConvertMaterialsByCount: readonly number[];
        readonly welfareConvertMaxWorkers: number;
      };
      readonly university: {
        readonly drawOnBuild: number;
        readonly civCardGoldDiscountPerUniversity: number;
      };
      readonly camp: {
        readonly landTilesOnBuild: number;
        readonly adjacentMaterialDiscount: number;
        readonly maxTotalDiscount: number;
      };
    };
  };
  readonly actions: {
    readonly workerCost: TierTable<number>;
    /** 共有スペースとするアクションと段階（rules.md 6-2-2）。ここにないものは占有型（6-2-1）。 */
    readonly shared: readonly { readonly action: Action; readonly tier: Tier }[];
    readonly unlockTop: Readonly<Record<Action, UnlockCondition>>;
    readonly pioneer: TierTable<{ readonly maxTiles: number; readonly materialDiscount: number }>;
    readonly build: TierTable<{
      readonly maxBuildings: number;
      readonly goldDiscount: number;
      readonly materialDiscount: number;
    }>;
    readonly import: TierTable<{
      readonly payGold: number;
      readonly gainMaterials: number;
      readonly maxTimes: number;
      readonly bonusMaterials: number;
    }>;
    readonly export: TierTable<{
      readonly payMaterials: number;
      readonly gainGold: number;
      readonly maxTimes: number;
      readonly bonusGold: number;
    }>;
    /** choices が2つ以上なら、払う金と得るトークンの組を選ぶ（ユーザー決定 2026-11-07）。 */
    readonly drill: TierTable<{
      readonly choices: readonly { readonly payGold: number; readonly gainTokens: number }[];
      readonly maxRaises: number;
    }>;
    readonly expedition: {
      readonly rewards: readonly LevelReward[];
      readonly selection: TierTable<ExpeditionSelection>;
    };
    /** choices が2つ以上なら、払う資材と上げるインフラの組を選ぶ（ユーザー決定 2026-11-07）。 */
    readonly welfare: TierTable<{
      readonly choices: readonly { readonly payMaterials: number; readonly infra: number }[];
      readonly tempWorkers: number;
    }>;
    readonly migration: TierTable<{
      readonly tempWorkers: number;
      readonly regularWorkers: number;
      /** true なら「最大N人」で0〜Nを選べる（rules.md 6-1-6）。 */
      readonly regularWorkersIsMax: boolean;
      /** 得る資材（ユーザー決定 2026-11-07）。 */
      readonly materials: number;
    }>;
    /** playCards は引いた後に通常のコストでプレイしてよい枚数（ユーザー決定 2026-11-07）。 */
    readonly research: TierTable<{ readonly draw: number; readonly playCards: number }>;
    readonly spread: TierTable<{
      readonly maxCards: number;
      readonly cardsIsMax: boolean;
      /** 1枚ごとの金の割引（下限0、ユーザー決定 2026-11-07）。 */
      readonly goldDiscount: number;
    }>;
  };
  readonly military: {
    readonly max: number;
    readonly rewards: readonly LevelReward[];
    readonly overflowPointsPerRaise: number;
  };
  readonly infra: {
    readonly max: number;
    readonly rewards: readonly LevelReward[];
    /** 上限を超えた上昇1回ごとの得点。上昇の出どころを問わない（ユーザー決定 2026-11-07）。 */
    readonly overflowPointsPerRaise: number;
  };
  readonly raid: {
    readonly firstRoundCard: number;
    /** 襲撃ラウンド数1あたりの基本得点（rules.md 7-5-1）。 */
    readonly basePointsPerRound: {
      readonly defenseFailed: number;
      readonly defended: number;
      readonly repelled: number;
    };
    /** 襲撃カードの効果のうち、結果ごとに適用する種類（ユーザー決定 2026-11-07）。ないものは無視する。 */
    readonly cardEffectKinds: {
      readonly defenseFailed: readonly RaidEffectKind[];
      readonly defended: readonly RaidEffectKind[];
      readonly repelled: readonly RaidEffectKind[];
    };
  };
  readonly freeActions: {
    readonly conversions: readonly { readonly id: string; readonly pay: Payment; readonly gain: Grant }[];
  };
  readonly civCards: {
    readonly emptyDeckFallbackMaterials: number;
  };
  readonly bonusTiles: {
    readonly kinds: number;
  };
  readonly characters: {
    /** 精霊チップを回収するラウンド。そのラウンドの襲撃の後に回収する（19-5-7）。 */
    readonly spiritChipReturnRound: number;
  };
  readonly scoring: {
    readonly base: {
      readonly landTilesPerPoint: number;
      readonly buildingsPerPoint: number;
      readonly regularWorkersPerPoint: number;
    };
    /** 添字は商店数（rules.md 17-2-2）。 */
    readonly goldPerPointByShops: readonly number[];
    /** 添字は工房数（rules.md 17-2-3）。 */
    readonly materialsPerPointByWorkshops: readonly number[];
    /** 添字は大学数（rules.md 17-3-1）。 */
    readonly civCardsPerPointByUniversities: readonly number[];
    /** 添字は役所数。通常ワーカー1人あたりの点（端数は切り捨て。rules.md 17-4-1 からの変更、ユーザー決定 2026-11-07）。 */
    readonly regularWorkerPointsByOffices: readonly number[];
    /** 先着順位ごとの得点（rules.md 13-3-4）。 */
    readonly plannedCityPointsByRank: readonly number[];
    /** セットの枚数ごとの得点（rules.md 14-2-1）。 */
    readonly natureParkPointsBySetSize: Readonly<Record<string, number>>;
  };
};

// ---------------------------------------------------------------------------
// 個人ボード（board_*.json）
// ---------------------------------------------------------------------------

export type BoardSquare = {
  readonly terrain: Terrain;
  /** マスボーナス（rules.md 4-4-4-2）。なければ null。 */
  readonly bonus: Grant | null;
};

export type Board = ProvisionalMark & {
  readonly id: string;
  readonly name: string;
  readonly generatedWithSeed: number | null;
  readonly squares: Readonly<Record<CellId, BoardSquare>>;
};

// ---------------------------------------------------------------------------
// カード類
// ---------------------------------------------------------------------------

export type CivilizationCard = ProvisionalMark & {
  readonly id: string;
  readonly name: string;
  readonly cost: { readonly gold: number };
  readonly tags: readonly CivTag[];
  /** プレイ条件（rules.md 9-2-1）。null は条件なし。 */
  readonly playCondition: string | null;
  /** 効果適用条件（rules.md 9-2-1）。null は条件なし。 */
  readonly effectCondition: string | null;
  /** 固有得点（rules.md 17-3-1）。 */
  readonly points: number;
  /** 原本の効果の文言。 */
  readonly text: string;
  readonly clarifications: readonly Clarification[];
  /** 効果スクリプト（docs/effect-commands.md）。 */
  readonly script: Script;
};

/** 文言の解釈。provisional なら仮置きの解釈（指示書 2-1）、そうでなければ決定済みの解釈である。 */
export type Clarification = {
  readonly text: string;
  readonly source: string;
  readonly provisional: boolean;
};

export type ShapeCell = { readonly q: number; readonly r: number };

/** 計画都市カードの1マス分の条件（rules.md 13-2-2）。terrain・building の少なくとも一方を指定する。 */
export type PlannedCitySlot = ShapeCell & {
  readonly terrain: Terrain | null;
  readonly building: Building | null;
};

export type PlannedCityCard = ProvisionalMark & {
  readonly id: string;
  readonly name: string;
  /** 形状の呼び名（表示用）。判定には slots を用いる。 */
  readonly shape: string;
  readonly slots: readonly PlannedCitySlot[];
  readonly benefit: Grant;
};

export type NatureParkCell = ShapeCell & { readonly terrain: Terrain };

export type NatureParkSet = { readonly cells: readonly NatureParkCell[] };

export type NatureParkCard = ProvisionalMark & {
  readonly id: string;
  readonly name: string;
  readonly sets: readonly NatureParkSet[];
};

/** ボーナスタイルのラウンド開始時効果の単位（rules.md 11-2-1）。 */
export const TILE_EFFECT_KINDS = [
  ...GRANT_KINDS.filter((k) => k !== 'freeBuildOnTerrain'),
  'militaryLevel',
  'infraLevel',
  'discardCivCards',
] as const;
export type TileEffect = {
  readonly kind: (typeof TILE_EFFECT_KINDS)[number];
  readonly amount: number;
};

/** パス時の得点（rules.md 11-2-1 No.6〜8）。count の数 per につき points 点。 */
export type PassScore = {
  readonly count: 'houses' | 'buildingTypes' | 'playedCivCards';
  readonly per: number;
  readonly points: number;
};

export type BonusTile = ProvisionalMark & {
  readonly id: number;
  readonly text: string;
  readonly rulesRef: string;
  readonly clarifications: readonly Clarification[];
  readonly roundStart: readonly TileEffect[];
  readonly passScore: PassScore | null;
};

// design/ の JSON は文言を変えずに取り込む。原本の構造を保ち、provisional を加える。

export type CharacterEffect = { readonly text: string; readonly items?: readonly string[] };

export type Character = ProvisionalMark & {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly axis: string;
  readonly initial_bonus: readonly string[];
  readonly effects: readonly CharacterEffect[];
  readonly open_issues: readonly string[];
  readonly clarifications?: readonly string[];
  /** ユーザー決定で原本の効果から変えた点（原本の文言は effects のまま残し、画面ではこれを添える）。 */
  readonly changes?: readonly string[];
  readonly script: Script;
};

export type SpecialCitizenEffect = {
  readonly timing: string;
  readonly text: string;
  readonly worker_cost?: number;
};

export type SpecialCitizen = ProvisionalMark & {
  readonly id: string;
  readonly effects: readonly SpecialCitizenEffect[];
  readonly open_issues: readonly string[];
  readonly clarifications?: readonly string[];
  /** ユーザー決定で原本から変えた点（原本の文言は effects のまま残し、画面ではこれを添える。2026-11-10）。 */
  readonly changes?: readonly string[];
  readonly script: Script;
};

/** 襲撃カードの固有効果の単位（rules.md 7-6-1）。 */
export const RAID_EFFECT_KINDS = ['loseGold', 'loseMaterials', 'loseGoldProduction', 'landTiles', 'materials', 'gold', 'points'] as const;
export type RaidEffectKind = (typeof RAID_EFFECT_KINDS)[number];
export type RaidEffect = {
  readonly kind: RaidEffectKind;
  readonly amount: number;
  /** true なら amount に襲撃ラウンド数を掛ける。 */
  readonly perRound: boolean;
  /** true なら次の収入の後に適用する（7-6-1、7-6-3）。 */
  readonly afterNextIncome: boolean;
};

export type RaidCard = ProvisionalMark & {
  readonly id: number;
  readonly defense_increase: number;
  readonly repel_increase: number;
  readonly on_defense_fail: string;
  readonly on_repel: string;
  readonly open_issues: readonly string[];
  readonly clarifications?: readonly string[];
  /** true なら固有効果の得点が基本得点を含めた合算後の数値である（19-3-3）。 */
  readonly replacesBasePoints: boolean;
  readonly defenseFailEffects: readonly RaidEffect[];
  readonly repelEffects: readonly RaidEffect[];
};

export type GameData = {
  readonly params: Params;
  readonly boards: readonly Board[];
  readonly civilizationCards: readonly CivilizationCard[];
  readonly plannedCityCards: readonly PlannedCityCard[];
  readonly natureParkCards: readonly NatureParkCard[];
  readonly specialCitizens: readonly SpecialCitizen[];
  readonly characters: readonly Character[];
  readonly raidCards: readonly RaidCard[];
  readonly bonusTiles: readonly BonusTile[];
};
