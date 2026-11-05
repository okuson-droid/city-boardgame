// チュートリアル（ユーザー決定 2026-11-04：ルールを知らない人が実践形式で理解できるもの）。
// 実際の対局（3人、決まったシード）で、プレイヤー（席0）に一手ずつ案内を出す。他の2席は簡単な自動の打ち手が受け持つ。
// - 台本は「手順」の列である。手順は「説明を読んで次へ」か「決まった選択をする」のどちらかである。
// - 選択の手順は、選んでよい選択肢を型（末尾の * は前方一致）で決める。型に合わない選択は受け付けず、案内を出し直す。
// - 手順は when が偽なら飛ばし、done が真になったら次へ進む。台本にない選択（マスボーナスの順番など）が来たら、
//   どの選択肢でも選べるようにし、場面の見出しで案内する（詰まらないようにするため）。
// - 説明の数値は GAME_DATA から読む（チューナーで値を変えても説明が食い違わない）。
// 画面には依存しない。画面は src/ui/Tutorial.tsx。

import { GAME_DATA } from '../data/index.ts';
import type { GameData } from '../data/types.ts';
import { applyMove, createGame, decider, getOptions, isGameOver } from '../game/engine.ts';
import { createRng, nextInt, type RngState } from '../game/rng.ts';
import type { GameState, Option, Task } from '../game/types.ts';

/** プレイヤーの席（手番順の最初になるシードを選ぶ）。 */
export const TUTORIAL_SEAT = 0;
export const TUTORIAL_PLAYERS = 3;
/** 席0が第1ラウンドの最初の手番になるシード（tests/tutorial.test.ts で確かめる）。 */
export const TUTORIAL_SEED = 20261107;
export const TUTORIAL_NAMES = ['あなた', 'アオイ', 'ミドリ'];

export type StepContext = { readonly state: GameState; readonly d: GameData };

export type Step = {
  readonly id: string;
  readonly title: string;
  readonly body: (ctx: StepContext) => string;
  /** 光らせる要素の data-target（末尾の * は前方一致）。 */
  readonly highlight?: readonly string[];
  /** 案内の札を置く側。共有の場（襲撃・ボーナスタイル）を見せたい手順では left にする（縮退配置で左上に置く）。既定は right。 */
  readonly placement?: 'left' | 'right';
  /** 進め方。next は「次へ」を押す。move は allow に合う選択をする。 */
  readonly kind: 'next' | 'move';
  /** 選んでよい選択肢の型（kind が move のとき）。 */
  readonly allow?: readonly string[];
  /** この手順が当てはまるか。 */
  readonly when?: (state: GameState) => boolean;
  /**
   * 起きないことがある手順か。true なら、自分の番で when が偽のとき飛ばす。
   * false（既定）なら飛ばさずに待ち、その間に来た台本にない選択は、どれでも選べるようにして場面の見出しで案内する。
   */
  readonly optional?: boolean;
  /** 選択の後、次の手順へ進むか（既定は1回選んだら進む）。 */
  readonly done?: (state: GameState) => boolean;
};

const top = (state: GameState): Task | undefined => state.stack[state.stack.length - 1];
const myTask = (state: GameState): Task | undefined => (decider(state) === TUTORIAL_SEAT ? top(state) : undefined);
const myTaskIs = (t: Task['t']) => (state: GameState): boolean => myTask(state)?.t === t;
/** 自分の手番の最初（アクションをまだしていない）に戻ったか。 */
const backToTurn = (state: GameState): boolean => {
  const task = myTask(state);
  return task?.t === 'turn' || decider(state) !== TUTORIAL_SEAT;
};
const turnAfterAction = (state: GameState): boolean => {
  const task = myTask(state);
  return task?.t === 'turn' && task.acted;
};

/** 型に合うか（末尾の * は前方一致）。 */
export const matches = (pattern: string, id: string): boolean =>
  pattern.endsWith('*') ? id.startsWith(pattern.slice(0, -1)) : pattern === id;

const p = (d: GameData): GameData['params'] => d.params;

// ---------------------------------------------------------------------------
// 台本
// ---------------------------------------------------------------------------

export const STEPS: readonly Step[] = [
  {
    id: 'welcome',
    kind: 'next',
    title: 'ようこそ',
    body: ({ d }) =>
      `あなたは国王から新しい都市づくりを任された領主である。${p(d).rounds}ラウンドのあいだに土地を開拓し、建物を建て、住民を増やして、最後に最も多くの得点を集めた人が勝つ。\n` +
      'このチュートリアルでは、実際の対局を3人で遊びながら、1ラウンド目を一手ずつ案内する。ほかの2人（アオイとミドリ）は自動で動く。',
  },
  {
    id: 'draft-intro',
    kind: 'next',
    title: 'はじめにドラフト',
    body: () =>
      '対局の前に、3つのものを1つずつ選ぶ。\n' +
      '・個人ボード：あなたの都市になる六角形のマス目。マスごとに地形（水場・山岳・平原・森林）がある。\n' +
      '・ボーナスタイル：ラウンドの始めにもらえるボーナス。\n' +
      '・キャラクター：あなただけの特別な能力。\n' +
      '選ぶ順番は交互に回ってくる。カードにカーソルを合わせると、効果の説明が出る。',
  },
  {
    id: 'draft-board',
    kind: 'move',
    title: '個人ボードを選ぶ',
    body: () => '光っている個人ボードから1枚選ぶ。どれを選んでもよい。迷ったら一番上でよい。',
    allow: ['draft:board:*'],
    highlight: ['draft:board:*'],
    when: myTaskIs('draftPick'),
    done: (s) => s.players[TUTORIAL_SEAT]?.boardId !== null,
  },
  {
    id: 'draft-bonus',
    kind: 'move',
    title: 'ボーナスタイルを選ぶ',
    body: () => 'ボーナスタイルを1枚選ぶ。1ラウンド目の始めに効果をもらえる。パスするときに返して、次のラウンドの1枚を選び直す。',
    allow: ['draft:bonus:*'],
    highlight: ['draft:bonus:*'],
    when: myTaskIs('draftPick'),
    done: (s) => s.players[TUTORIAL_SEAT]?.bonusTile !== null,
  },
  {
    id: 'draft-character',
    kind: 'move',
    title: 'キャラクターを選ぶ',
    body: () => '最後にキャラクターを1人選ぶ。能力はゲームのあいだずっと使える。気になる人を選んでよい。',
    allow: ['draft:character:*'],
    highlight: ['draft:character:*'],
    when: myTaskIs('draftPick'),
    done: (s) => s.players[TUTORIAL_SEAT]?.characterId !== null,
  },
  {
    id: 'setup-choices',
    optional: true,
    kind: 'move',
    title: 'キャラクターの準備',
    body: () => 'キャラクターの能力で、準備のときに選ぶことがある。光っているものから選ぶ。',
    allow: ['*'],
    when: (s) => s.round === 0 && decider(s) === TUTORIAL_SEAT && top(s)?.t !== 'draftPick',
    done: (s) => s.round > 0 || decider(s) !== TUTORIAL_SEAT,
  },
  {
    id: 'screen',
    kind: 'next',
    title: '画面の見かた',
    body: ({ d }) =>
      `ラウンドの始めに、生産力に応じた収入が入る。いまは金${p(d).initial.goldProduction}・資材${p(d).initial.materialProduction}の収入があった。\n` +
      '・左：アクションボード。ここにワーカーを置いて行動する。その下に、みんなで使う場（襲撃・ボーナスタイル・特別な市民カード）と、これまでの履歴がある。\n' +
      '・中央：あなたの個人ボード。\n' +
      '・右：あなたのキャラクターの能力と自然公園カード、資源・生産・ワーカーなどの個人の情報、プレイ済みのカード。\n' +
      '・下：いまやること（帯）と、計画都市・手札・文明カードの山。\n' +
      'アイコンの意味は、上の「アイコン一覧」でいつでも見られる。',
  },
  {
    id: 'workers',
    kind: 'next',
    title: 'ワーカーを置いて行動する',
    body: ({ d }) => {
      const cost = p(d).actions.workerCost;
      return (
        `手番には、アクションを1つ実行するか、パスするかを選ぶ。アクションは通常（${cost.normal}人）・上位（${cost.upper}人）・最上位（${cost.top}人）の3段階で、強いほど多くのワーカーが要る。最上位は、錠前の印の横にある条件を満たすと使える。\n` +
        `あなたは通常ワーカー${p(d).initial.regularWorkers}人と臨時ワーカー${p(d).initial.tempWorkers}人を持っている。通常ワーカーはラウンドの終わりに戻ってくる。臨時ワーカーは使うとなくなる。\n` +
        '多くのスペースは、誰かが使うとそのラウンドは使えなくなる。点線の枠のスペースは、何人でも何度でも使える。'
      );
    },
  },
  {
    id: 'pioneer',
    kind: 'move',
    title: '土地を開拓する',
    body: ({ d }) =>
      `まずは都市を広げる。「開拓」の通常を選ぶ。土地タイルを最大${p(d).actions.pioneer.normal.maxTiles}枚、個人ボードに置ける。`,
    allow: ['act:pioneer:normal'],
    highlight: ['act:pioneer:normal'],
    when: myTaskIs('turn'),
  },
  {
    id: 'pay-workers',
    optional: true,
    kind: 'move',
    title: 'ワーカーの内訳',
    body: () => '臨時ワーカーを何人使うかを選ぶ。ここでは「0」を選び、通常ワーカーで払う。臨時ワーカーは後のために取っておける。',
    allow: ['temp:*'],
    highlight: ['temp:0'],
    when: myTaskIs('payWorkers'),
  },
  {
    id: 'pioneer-count',
    optional: true,
    kind: 'move',
    title: '置く枚数を決める',
    body: ({ d }) =>
      `土地タイル1枚の費用は資材${p(d).land.materialsPerTile}。マスの地形と違う種類のタイルを置くと、さらに資材${p(d).land.mismatchExtraMaterials}が要る。置く枚数を選ぶ。`,
    allow: ['count:*'],
    highlight: ['count:*'],
    when: myTaskIs('pioneerCount'),
  },
  {
    id: 'pioneer-place',
    kind: 'move',
    title: '土地タイルを置く',
    body: () =>
      '土地タイルは、すでに開拓した土地と辺でつながるマスにだけ置ける。光っているマスをタップする。\n' +
      'マスによってはボーナスがもらえる。置いたあとに続けて選ぶことがあれば、光っているものを選ぶ。',
    allow: ['tile:*', '*'],
    highlight: ['cell:*', 'tile:*'],
    when: (s) => myTask(s) !== undefined && myTask(s)?.t !== 'turn',
    done: turnAfterAction,
  },
  {
    id: 'end-1',
    kind: 'move',
    title: '手番を終える',
    body: () => '1回の手番でできるアクションは1つだけ。「手番を終える」を押すと、次の人の番になる。',
    allow: ['end'],
    highlight: ['end'],
    when: turnAfterAction,
  },
  {
    id: 'others',
    kind: 'next',
    title: 'ほかの人の番',
    body: () =>
      'アオイとミドリが順番に動く。ほかの人が使ったスペースには色の付いた丸が付き、多くのスペースはそのラウンドはもう使えない。\n' +
      '左下の「履歴」を開くと、誰が何をしたかを見られる。',
  },
  {
    id: 'build',
    kind: 'move',
    title: '建物を建てる',
    body: ({ d }) =>
      `次は「建築」の通常を選ぶ。建物を最大${p(d).actions.build.normal.maxBuildings}軒、開拓した土地に建てられる（建物が建っていない土地だけ）。`,
    allow: ['act:build:normal'],
    highlight: ['act:build:normal'],
    when: myTaskIs('turn'),
  },
  {
    id: 'build-pay',
    optional: true,
    kind: 'move',
    title: 'ワーカーの内訳',
    body: () => 'さっきと同じく、使う臨時ワーカーの数を選ぶ。',
    allow: ['temp:*'],
    highlight: ['temp:0'],
    when: myTaskIs('payWorkers'),
  },
  {
    id: 'build-place',
    kind: 'move',
    title: '建てる建物とマス',
    body: ({ d }) => {
      const house = p(d).buildings.cost.house;
      const shop = p(d).buildings.cost.shop;
      return (
        `下の帯で建物の種類を選び、光っているマスをタップする。住宅は金${house.gold}・資材${house.materials}と安く、ほかの建物は金${shop.gold}・資材${shop.materials}かかる。\n` +
        '地形によっては建てたときにボーナスがある（平原の住宅は1点、山岳の工房・砦は資材、水場の商店・役所は金）。\n' +
        '建てる建物を選び終えたら「確定」を押す。'
      );
    },
    allow: ['build:*', 'done', '*'],
    highlight: ['pen:*', 'cell:*', 'done'],
    when: (s) => myTask(s) !== undefined && myTask(s)?.t !== 'turn',
    done: turnAfterAction,
  },
  {
    id: 'end-2',
    kind: 'move',
    title: '手番を終える',
    body: () => '「手番を終える」を押す。',
    allow: ['end'],
    highlight: ['end'],
    when: turnAfterAction,
  },
  {
    id: 'research',
    kind: 'move',
    title: '文明カードを引く',
    body: ({ d }) =>
      `文明カードは、プレイすると効果が出るカードである。「研究」の通常を選ぶと、${p(d).actions.research.normal.draw}枚引いて${p(d).actions.research.normal.discard}枚捨てる。手札はほかの人には見えない。`,
    allow: ['act:research:normal'],
    highlight: ['act:research:normal'],
    when: myTaskIs('turn'),
  },
  {
    id: 'research-rest',
    kind: 'move',
    title: '捨てるカードを選ぶ',
    body: () => '手札から捨てるカードを選ぶ。カードの左上の数がプレイに要る金である。高すぎるカードや、使いにくそうなカードを捨てるとよい。',
    allow: ['*'],
    highlight: ['card:*', 'temp:0'],
    when: (s) => myTask(s) !== undefined && myTask(s)?.t !== 'turn',
    done: turnAfterAction,
  },
  {
    id: 'end-3',
    kind: 'move',
    title: '手番を終える',
    body: () => '「手番を終える」を押す。',
    allow: ['end'],
    highlight: ['end'],
    when: turnAfterAction,
  },
  {
    id: 'spread',
    optional: true,
    kind: 'move',
    title: '文明カードをプレイする',
    body: ({ d }) =>
      `「普及」の通常を選ぶと、手札の文明カードを${p(d).actions.spread.normal.maxCards}枚、金を払ってプレイできる。プレイしたカードは得点にもなる。\n` +
      'ワーカーが足りないときや、払える金がないときは、このあと「パス」してよい。',
    allow: ['act:spread:normal', 'pass'],
    highlight: ['act:spread:normal'],
    when: myTaskIs('turn'),
  },
  {
    id: 'spread-rest',
    optional: true,
    kind: 'move',
    title: 'プレイするカードを選ぶ',
    body: () => '光っている手札のカードを選ぶ。カードによっては、続けて置き場所などを選ぶ。',
    allow: ['*'],
    highlight: ['card:*', 'temp:0'],
    when: (s) => myTask(s) !== undefined && myTask(s)?.t !== 'turn' && myTask(s)?.t !== 'passTile' && s.phase === 'play',
    done: (s) => turnAfterAction(s) || backToTurn(s),
  },
  {
    id: 'end-4',
    optional: true,
    kind: 'move',
    title: '手番を終える',
    body: () => '「手番を終える」を押す。',
    allow: ['end'],
    highlight: ['end'],
    when: turnAfterAction,
  },
  {
    id: 'pass',
    optional: true,
    kind: 'move',
    title: 'パスする',
    body: () =>
      'これ以上アクションをしないときは「パス」する。パスした順番が、次のラウンドの手番の順番になる（早くパスすると次は先に動ける）。\n' +
      'パスしたら、そのラウンドはもう何もできない。',
    allow: ['pass'],
    highlight: ['pass'],
    when: (s) => myTask(s)?.t === 'turn' && s.round === 1,
  },
  {
    id: 'pass-tile',
    optional: true,
    placement: 'left',
    kind: 'move',
    title: '次のボーナスタイルを選ぶ',
    body: () => 'パスすると、いまのボーナスタイルを返して、場から次のラウンドの1枚を選ぶ。次のラウンドの始めに効果をもらえる。',
    allow: ['bonus:*', '*'],
    highlight: ['bonus:*'],
    when: (s) => myTask(s) !== undefined && myTask(s)?.t !== 'turn' && s.phase === 'play',
    done: (s) => myTask(s) === undefined || s.phase !== 'play',
  },
  {
    id: 'raid',
    optional: true,
    placement: 'left',
    kind: 'move',
    title: '襲撃',
    body: ({ state }) =>
      'みんながパスすると、ラウンドの終わりに襲撃が来る。画面の左、アクションボードの下の襲撃の欄にある「防衛ライン」と「撃退ライン」が目標である。\n' +
      `・防衛ライン（いまは${state.defenseLine}）に届かないと「防衛失敗」で点を失う。\n` +
      `・撃退ライン（いまは${state.repelLine}）に届けば「撃退成功」で点をもらえる。\n` +
      '自分の軍事レベルで足りない分は、軍事力トークンを使って補える。どこを目指すかを選ぶ。',
    allow: ['raid:*', '*'],
    highlight: ['raid:*'],
    when: (s) => myTask(s) !== undefined && s.phase === 'raid',
    done: (s) => myTask(s) === undefined || s.phase !== 'raid',
  },
  {
    id: 'round2',
    kind: 'next',
    title: '次のラウンドへ',
    body: ({ d }) =>
      'ワーカーが戻り、2ラウンド目が始まった。ボーナスタイルの効果と、生産力に応じた収入が入っている。\n' +
      '商店を建てると金の生産力が、工房を建てると資材の生産力が上がり、次のラウンドから収入が増える。\n' +
      `こうして${p(d).rounds}ラウンドを遊ぶ。`,
    when: (s) => s.round >= 2,
  },
  {
    id: 'scoring',
    kind: 'next',
    title: '得点のしくみ',
    body: () =>
      '得点は、ゲーム中に得た点と、ゲームの終わりの計算の合計である。\n' +
      '・基礎得点：土地タイル・建物・通常ワーカーの数（それぞれ2つで1点）。\n' +
      '・5つの評価軸：経済・産業（残った金と資材）、文化・学術（文明カード）、生活・福祉（住宅や住民）、自然・環境（自然公園カード）、軍事・防衛（襲撃の結果）。\n' +
      '・計画都市カード：場のカードの形どおりに建物を並べると、早い者勝ちで点がもらえる。',
  },
  {
    id: 'free',
    kind: 'next',
    title: 'あとは自由に',
    body: () =>
      '案内はここまで。このまま最後まで自由に遊べる。迷ったら、アイコンやアクションにカーソルを合わせると説明が出る（スマホは長押し）。\n' +
      '選べないものにも、選べない理由が出る。',
  },
];

// ---------------------------------------------------------------------------
// 進め方
// ---------------------------------------------------------------------------

export type TutorialState = {
  readonly game: GameState;
  /** いまの手順の番号。STEPS.length なら案内は終わり（自由に遊ぶ）。 */
  readonly step: number;
  /** 自動の打ち手の乱数。 */
  readonly botRng: RngState;
  /** 自動の打ち手がこのラウンドに実行したアクションの数（席ごと）。 */
  readonly botActions: Readonly<Record<number, number>>;
};

export const createTutorial = (d: GameData = GAME_DATA): TutorialState =>
  settle({
    game: createGame({ playerCount: TUTORIAL_PLAYERS, playerNames: TUTORIAL_NAMES }, TUTORIAL_SEED, d),
    step: 0,
    botRng: createRng(TUTORIAL_SEED ^ 0x5bd1e995),
    botActions: {},
  });

/** いまの手順。案内が終わっていれば null。 */
export const currentStep = (t: TutorialState): Step | null => STEPS[t.step] ?? null;

/**
 * 起きなかった手順を飛ばす。飛ばすのは、optional の手順で、自分が選ぶ番なのに when が偽のときだけである。
 * ほかの人の番の間は、次の自分の番まで手順を保つ（ほかの人が動いている間に手順を飛ばさないため）。
 */
const settle = (t: TutorialState): TutorialState => {
  let step = t.step;
  const mine = !isGameOver(t.game) && decider(t.game) === TUTORIAL_SEAT;
  const skippable = (s: Step | undefined): boolean => s?.optional === true && s.when !== undefined && !s.when(t.game);
  while (step < STEPS.length && mine && skippable(STEPS[step])) step += 1;
  return step === t.step ? t : { ...t, step };
};

/** 案内が、いま自分が選ぶ番で、選択を待っているか。 */
export const isMyDecision = (t: TutorialState): boolean => !isGameOver(t.game) && decider(t.game) === TUTORIAL_SEAT;

/**
 * 自分の選択肢のうち、いまの手順で選んでよいもの。手順が「次へ」なら空。案内が終わっていれば全部。
 * 型に合う選択肢が1つもなければ（台本にない場面）、詰まらないよう全部を選べるようにする。
 */
export const allowedOptions = (t: TutorialState, d: GameData = GAME_DATA): Option[] => {
  if (!isMyDecision(t)) return [];
  const options = getOptions(t.game, d);
  const step = currentStep(t);
  if (step === null) return options;
  if (step.kind === 'next' && stepActive(t)) return [];
  // 台本にない選択（キャラクターやカードの効果など）は、どれでも選べる。
  if (!stepActive(t)) return options;
  const allowed = options.filter((o) => (step.allow ?? []).some((pattern) => pattern !== '*' && matches(pattern, o.id)));
  return allowed.length > 0 ? allowed : options;
};

/** 「次へ」を押す。 */
export const nextStep = (t: TutorialState): TutorialState => {
  const step = currentStep(t);
  if (step === null || step.kind !== 'next' || !stepActive(t)) return t;
  return settle({ ...t, step: t.step + 1 });
};

/** 案内をやめて、自由に遊ぶ。 */
export const skipTutorial = (t: TutorialState): TutorialState => ({ ...t, step: STEPS.length });

/** 自分の選択を適用する。いまの手順で選べない選択なら null。 */
export const chooseInTutorial = (t: TutorialState, move: string, d: GameData = GAME_DATA): TutorialState | null => {
  if (!allowedOptions(t, d).some((o) => o.id === move)) return null;
  const game = applyMove(t.game, move, d);
  const step = currentStep(t);
  const finished = step !== null && step.kind === 'move' && stepActive(t) && (step.done === undefined || step.done(game));
  return settle({ ...t, game, step: finished ? t.step + 1 : t.step, botActions: resetOnRound(t, game) });
};

const resetOnRound = (t: TutorialState, game: GameState): Readonly<Record<number, number>> =>
  game.round !== t.game.round ? {} : t.botActions;

/** 自動の打ち手が1ラウンドに実行するアクションの数。多すぎると案内の間が長くなるため少なくする。 */
const BOT_ACTIONS_PER_ROUND = 2;

/** 案内で使うため、自動の打ち手が第1ラウンドに使わないアクションスペース（占有型）。 */
const RESERVED_IN_ROUND_1 = ['act:research:normal'];

/**
 * 自動の打ち手の選択。手番ではアクションを BOT_ACTIONS_PER_ROUND 回まで乱数で選び、その後はパスする。
 * それ以外の選択（置き場所・枚数など）は乱数で選ぶ。フリーアクションと計画都市の宣言は使わない。
 */
export const botMove = (t: TutorialState, d: GameData = GAME_DATA): string | null => {
  const seat = decider(t.game);
  if (seat === null || seat === TUTORIAL_SEAT || isGameOver(t.game)) return null;
  const options = getOptions(t.game, d);
  const task = top(t.game);
  let pool = options;
  if (task?.t === 'turn') {
    if (task.acted) return options.some((o) => o.id === 'end') ? 'end' : (options[0]?.id ?? null);
    const actions = options.filter((o) => o.id.startsWith('act:') && !(t.game.round === 1 && RESERVED_IN_ROUND_1.includes(o.id)));
    pool = (t.botActions[seat] ?? 0) >= BOT_ACTIONS_PER_ROUND || actions.length === 0 ? options.filter((o) => o.id === 'pass') : actions;
  }
  const [i] = nextInt(t.botRng, pool.length);
  return pool[i]?.id ?? options[0]?.id ?? null;
};

/** 自動の打ち手の選択を1つ適用する。自動の番でなければそのまま返す。 */
export const stepBot = (t: TutorialState, d: GameData = GAME_DATA): TutorialState => {
  const move = botMove(t, d);
  if (move === null) return t;
  const seat = decider(t.game) ?? -1;
  const task = top(t.game);
  const game = applyMove(t.game, move, d);
  const [, botRng] = nextInt(t.botRng, 2);
  const counted = task?.t === 'turn' && move.startsWith('act:');
  const botActions = counted ? { ...t.botActions, [seat]: (t.botActions[seat] ?? 0) + 1 } : t.botActions;
  return settle({ ...t, game, botRng, botActions: game.round !== t.game.round ? {} : botActions });
};

/** いまの手順が当てはまる局面か（when が無いか真）。当てはまらない間は、案内を出さずに局面が進むのを待つ。 */
export const stepActive = (t: TutorialState): boolean => {
  const step = currentStep(t);
  return step !== null && (step.when === undefined || step.when(t.game));
};

/** 自動の打ち手を進めてよいか（「次へ」の説明を読んでいる間は止める）。 */
export const botsMayMove = (t: TutorialState): boolean => {
  const step = currentStep(t);
  const reading = step !== null && step.kind === 'next' && stepActive(t);
  return !isGameOver(t.game) && decider(t.game) !== TUTORIAL_SEAT && !reading;
};
