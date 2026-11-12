// 対話プレイ用のコマンドの入口（指示書 2026-11-10 対話プレイ 2-3）。引数の解釈と入出力だけを行い、
// 記録の処理は record.ts、文字の組み立ては render.ts に任せる。対話的な入力待ちは作らない。
// 成功は終了コード0、失敗は1とし、失敗の理由を標準エラーに1行で出す。

import { DATA_VERSION } from '../../src/data/index.ts';
import { decider, isGameOver, type GameConfig, type GameState } from '../../src/game/index.ts';
import {
  applyMoves,
  dataChanged,
  DEFAULT_RECORD_PATH,
  logSteps,
  newRecord,
  PlayError,
  readRecord,
  recordExists,
  stateOf,
  undoMoves,
  writeRecord,
  type PlayRecord,
} from './record.ts';
import {
  createOnline,
  credentialsPath,
  DEFAULT_ONLINE_URL,
  eventsSince,
  joinOnline,
  moveOnline,
  myTurn,
  readCredentials,
  revealSince,
  seenOf,
  viewRoom,
  writeCredentials,
  type OnlineCredentials,
  type OnlineView,
} from './online.ts';
import {
  compactJson,
  compactShow,
  effectiveRound,
  eventTurnLines,
  moveOutput,
  parseRefSections,
  parseSections,
  refLines,
  resumeBrief,
  resumeOutput,
  stepLines,
  unavailableFolded,
  waitOutput,
  revealLines,
  tailLines,
  turnLines,
  type CompactOptions,
} from './compact.ts';
import { measure } from './measure.ts';
import { clearPlan, orderLine, parseTargets, planList, planNotice, planPath, readPlan, setPlan, writePlan } from './plan.ts';

/** wait と --then-wait の既定の時間切れ（秒）。打ち手の道具の上限（約120秒）より短くする（指示書案 2026-11-13 2-3）。 */
const WAIT_TIMEOUT = 100;
import { compareOutput, previewOutput } from './preview.ts';
import { renderLog, renderScore, renderShow, renderSteps, scoreModel, showModel, type ShowOptions, type Viewer } from './render.ts';

const HELP = `対話プレイ用のコマンド（1回の呼び出しで完結する。局面は記録ファイルに保存する）

使い方: npm run -s play -- <コマンド> [引数] [--file <パス>]（記録の既定は ${DEFAULT_RECORD_PATH}）
リポジトリの外からは node <リポジトリ>/dist-play/cli.js <コマンド> ... で呼ぶ（記録の既定の場所は呼び出したディレクトリからの相対）。

既定の出力は短い形である。対局中に変わらない文言（アクションボードの効果文・キャラクターの能力・カードの文）は ref で引き、
局面は ID と名前と数値だけを出す。新しく公開・獲得したものの内容は、その時点の出来事に1回だけ出す。

  new --players <3|4> --seed <整数> [--snake] [--names a,b,c] [--force]
      新しい記録を作り、局面を出す（全文）。既にファイルがあれば --force のときだけ上書きする。--snake はスネークドラフト。
  show [--seat <番号>] [--as <番号|all>] [--only <欄,...>] [--board] [--json] [--full] [--player <番号>]
      局面と、選択待ちのプレイヤーの選択肢を出す。番号はプレイヤー番号（0始まり）。--as がなければ --seat の席が視点。
      --as は視点（省略時は選択待ちのプレイヤー、all はすべての手札を見る分析用）。--board は個人ボードの地図も出す。
      --only は指定した欄だけを詳しい形で出す。欄：progress（進行）・raid（襲撃）・actions（アクションボード）・shared（共有の場）・
        self（自分）・hand（手札、効果文つき）・others（他のプレイヤー）・board（個人ボード）・events（出来事）・options（選択肢、畳まない）
      --full は従来の全文（--player はそのプレイヤーの詳細、--full と同じく全文で出す）。--brief は受け付けるが何もしない。
  move <選択肢> [<選択肢> ...] [--seat <番号>] [--only <欄,...>] [--full]
      選択肢 ID か、いまの選択肢の番号（1始まり）を順に適用する。1つでも選べなければ記録を変えずに失敗する。
      出力は、起きた出来事・自分の要約・次の選択肢（次の選択待ちが他の席なら「選択待ち：P1」）だけ。全局面は show で見る。
      選択肢の後に、選べないアクション・建物・遠征の報酬とその理由を出す。遠征の報酬には確定時に払う軍事力トークンを添える。
      --seat を付けると、選択待ちがその席でなければ記録を変えずに失敗する（席ごとに別の打ち手が打つとき）。
      選択肢の後の「注意：」の行は、過去に失点になった型（自然公園を崩す・撃退を選べる・役所の変換が出ない・残したままのパス・
      選ばずに済ませられない建設）に当たる選択肢の事実である（5行まで）。登録した狙いが変われば、出来事の後に「狙い：」の行が出る。
  move <選択肢> ... --seat <番号> --then-wait [--round <ラウンド>] [--timeout <秒>]
      適用した後、選択待ちが他の席に移ったら、そのまま番を待って wait と同じ形で出す（手番の終わり・番待ち・次の手を1回にする）。
      end・pass は補わない（並べること）。
  move --dry-run <選択肢> ... [--or <選択肢> ...] [--seat <番号>]
      記録を変えずに下見する。1通りなら、起きた出来事・自分の増減の合計・得点の見込み（終了時の能力を含む）の増減・残る選択待ちを出す。
      --or で区切ると最大4通りを比べ、手順ごとに増減と見込みだけを出す（途中で選べない手順はその旨と何個目かを出す）。
      乱数を消費する・非公開の情報が公開される選択（山札から引く・特別な市民カードの補充など）の手前と、選択待ちが他の席に移った後は下見しない。
  wait --seat <番号> [--round <ラウンド>] [--timeout <秒>] [--state] [--only <欄,...>] [--full]
      席の番が来るまで待ち（既定100秒）、前回のその席の選択の後に起きたこと（他の席は手番ごとに1行）・狙いの知らせ・
      襲撃（ラウンドの最初の番だけ）・置かれたスペース・自分の要約1行・選択肢と注意を出す。選べない理由は前回から変わったときだけ。
      --state は従来の局面全体（show の既定の形）を出す。
      --round を付けると、局面がそのラウンドより先へ進んでいれば番を待たずに「ラウンド N は終わった」と出して終える
      （ドラフトと準備は第1ラウンドに含める）。時間切れなら「まだ番ではない」と出して終わる。ゲームが終われば最終得点を出す。
  ref [--seat <番号>] [--only <欄,...>] [--card <番号,...>]
      対局中に変わらない文言をまとめて出す。欄：actions（アクションボード）・expedition（遠征の報酬表と払うトークン）・characters（キャラクター）・bonus（ボーナスタイル）・
        raid（襲撃カード）・buildings（建物）・free（フリーアクション）・public（公開中の特別な市民カード・計画都市と自分のプレイ済みのカード）
      --card は文明カード（3桁）・特別な市民カード（2桁）・計画都市（PC…）の内容。
  resume --seat <番号> [--ref]
      作り直した打ち手が最初に呼ぶ。第2ラウンド以降は、局面・手札の効果文・自分のキャラクターの能力・自分と場の特別な市民カードと
      計画都市・手番順と狙い・いま終わったときの得点の見込み（終了時の能力を含む）を出す。第1ラウンドと --ref では、
      ref の全文とその席のこれまでの手番ごとのまとめも出す。
  plan --seat <番号> [--set <狙い,...> | --clear]
      狙いを登録する（--set は上書き、最大8個）・一覧を出す・消す。置き場は記録と同じディレクトリの plan-P<席>.json（記録には入れない）。
      狙いの書き方：act:<アクション>:<段階>・sc:<特別な市民カードの番号>・bonus:<ボーナスタイルの番号>・plan:<計画都市の番号>。
      wait・move・resume の出来事の後に、前回の出力から状態が変わった狙い（他の席に先を越されたなど）を「狙い：」の行で出す（3行まで）。
      ラウンドの最初の wait には、このラウンドの手番順と自分より先に打つ席を1行で出す。
  undo [<手数>] [--seat <番号>]
      記録の末尾から手数（既定1）を取り除き、取り除いた選択肢 ID と選択肢を出す。分析用の取り消しで、ルール上の巻き戻し（第15章）とは異なりチェックポイントを越えて戻せる。
  log [--from <手数>] [--seat <番号>]（--seat はその席の選択だけ）      記録の選択を、手数・選択したプレイヤー・ラベルとともに出す。
  score [--json]           終局していれば最終得点の内訳、していなければいま終わったときの見込み（終了時の能力を含む）を出す。
  measure                  記録を再生し、席ごとの出力量（従来の全文と既定の形）を数える（npm run -s play:measure -- --file <記録>）。
  --help                   この説明を出す。

オンライン版の部屋で打つ（人がブラウザのオンライン版で遊ぶ部屋に、席として入る。局面は窓口が伏せた写しだけを使う）:
  online join --code <ルームコード> --name <名前> [--url <Supabase の Project URL>]
      部屋に入り、席の資格情報を .play/online/<コード>-<席>.json に保存する（--creds で場所を替える）。
  online create --players <3|4> --name <名前> [--snake] [--url ...]   部屋を作り、ルームコードと資格情報を出す。
  online show --creds <パス> [--only <欄,...>] [--board] [--json] [--full]   自分の席の視点の局面を出す。
  online wait --creds <パス> [--round <ラウンド>] [--timeout <秒>] [--state] [--only ...] [--full]
      自分の番が来るまで待ち（既定100秒）、前回の出力の後に起きたことと、wait と同じ短い形を出す。対局の開始前は全員の入室を待つ。
  online move <選択肢> [<選択肢> ...] --creds <パス> [--then-wait] [--only ...] [--full]
      選択肢 ID か、いまの選択肢の番号を順に送る。1手ずつ送るため、途中で失敗するとそれより前の手は送られたままになる。
  窓口の既定は ${DEFAULT_ONLINE_URL}（環境変数 PLAY_ONLINE_URL でも替えられる）。

例:
  npm run -s play -- new --players 3 --seed 1
  npm run -s play -- resume --seat 0
  npm run -s play -- wait --seat 0 --round 2
  npm run -s play -- move act:build:normal temp:0 build:house:E3 end --seat 0 --then-wait --round 2
  npm run -s play -- move act:pioneer:normal count:1 tile:E2:plains --seat 0
  npm run -s play -- move --dry-run act:build:normal temp:0 build:house:E3 --or act:welfare:normal temp:0 --seat 0
  npm run -s play -- plan --seat 0 --set act:build:top,sc:05,bonus:6
  npm run -s play -- show --seat 0 --only hand,options
  npm run -s play -- ref --card 045,08
  npm run -s play -- undo 2
  npm run -s play -- score`;

type Args = { readonly positional: string[]; readonly flags: Map<string, string | true> };

/** move --dry-run の手順の区切り（位置引数として残す）。 */
const OR = '--or';

const VALUE_FLAGS = new Set(['file', 'players', 'seed', 'names', 'as', 'player', 'from', 'seat', 'timeout', 'code', 'name', 'url', 'creds', 'only', 'card', 'round', 'set']);

const parseArgs = (argv: readonly string[]): Args => {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === OR) {
      positional.push(OR);
    } else if (arg.startsWith('--')) {
      const name = arg.slice(2);
      if (VALUE_FLAGS.has(name)) {
        const value = argv[i + 1];
        if (value === undefined) throw new PlayError(`--${name} に値がない`);
        flags.set(name, value);
        i += 1;
      } else {
        flags.set(name, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
};

const str = (args: Args, name: string): string | undefined => {
  const v = args.flags.get(name);
  return typeof v === 'string' ? v : undefined;
};

const int = (args: Args, name: string): number | undefined => {
  const v = str(args, name);
  if (v === undefined) return undefined;
  if (!/^-?\d+$/.test(v)) throw new PlayError(`--${name} は整数で指定すること：${v}`);
  return Number(v);
};

const viewerArg = (args: Args): Viewer | undefined => {
  const v = str(args, 'as');
  if (v === undefined) return undefined;
  if (v === 'all') return 'all';
  if (!/^\d+$/.test(v)) throw new PlayError(`--as はプレイヤー番号か all で指定すること：${v}`);
  return Number(v);
};

const checkPlayer = (record: PlayRecord, n: number | undefined, flag: string): void => {
  if (n !== undefined && (n < 0 || n >= record.config.playerCount)) {
    throw new PlayError(`--${flag} は 0〜${record.config.playerCount - 1} で指定すること：${n}`);
  }
};

const load = (path: string): PlayRecord => {
  const record = readRecord(path);
  if (dataChanged(record)) {
    process.stderr.write(`警告：記録を作った後にゲームデータが変わった（記録 ${record.dataVersion}、いま ${DATA_VERSION}）\n`);
  }
  return record;
};

/** 従来の全文の show（--full）。 */
const showFull = (record: PlayRecord, args: Args): string => {
  // --as がなく --seat があれば、その席を視点にする（席ごとの打ち手が他の席の手札を見ないように）。
  const seat = int(args, 'seat');
  const viewer = viewerArg(args) ?? seat;
  const player = int(args, 'player');
  checkPlayer(record, typeof viewer === 'number' ? viewer : undefined, 'as');
  checkPlayer(record, player, 'player');
  const opts: ShowOptions = {
    ...(viewer === undefined ? {} : { as: viewer }),
    ...(player === undefined ? {} : { player }),
    ...(args.flags.has('board') ? { board: true } : {}),
    ...(args.flags.has('brief') ? { brief: true } : {}),
  };
  const state = stateOf(record);
  return args.flags.has('json') ? JSON.stringify(showModel(state, opts), null, 2) : renderShow(state, opts);
};

/** 短い形の指定（視点・欄・地図）。--brief は既定の形に吸収したため何もしない。 */
const compactOpts = (record: PlayRecord, args: Args): CompactOptions => {
  const seat = int(args, 'seat');
  const viewer = viewerArg(args) ?? seat;
  checkPlayer(record, typeof viewer === 'number' ? viewer : undefined, 'as');
  const only = str(args, 'only');
  return {
    ...(viewer === undefined ? {} : { as: viewer }),
    ...(only === undefined ? {} : { only: parseSections(only) }),
    ...(args.flags.has('board') ? { board: true } : {}),
  };
};

const showState = (state: GameState, opts: CompactOptions, args: Args, events: readonly string[] = []): string =>
  args.flags.has('json') ? JSON.stringify(compactJson(state, opts, undefined, events), null, 2) : compactShow(state, opts, undefined, events).join('\n');

const show = (record: PlayRecord, args: Args): string => {
  if (args.flags.has('full') || args.flags.has('player')) return showFull(record, args);
  return showState(stateOf(record), compactOpts(record, args), args);
};

/** 同期で待つ（wait の見回り。シェルの sleep を使わずに済ませる）。 */
const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * 狙いの知らせ（plan、指示書 2026-11-12 2-4）。狙いを登録していれば、前回の出力から変わった狙いの行を返し、知らせた状態を残す。
 * withOrder なら、ラウンドの最初の1回だけ手番順と自分より先に打つ席の行を添える（resume は常に添える）。
 */
const notices = (recordPath: string, state: GameState, seat: number, withOrder: 'always' | 'roundFirst' | 'never'): string[] => {
  const path = planPath(recordPath, seat);
  const plan = readPlan(path);
  const notice = planNotice(state, plan, seat);
  const order = withOrder === 'never' ? null : orderLine(state, seat);
  const showOrder = order !== null && (withOrder === 'always' || plan.orderShown !== state.round);
  const next = { ...notice.plan, orderShown: showOrder ? state.round : plan.orderShown };
  if (plan.targets.length > 0 || showOrder) writePlan(path, next);
  return [...(showOrder && order !== null ? [order] : []), ...notice.lines];
};

/**
 * wait の短い形の本体（指示書案 2026-11-13 2-1）。襲撃の行はラウンドの最初の番だけ、選べない理由は前回から変わったときだけ出す。
 * 出した内容（襲撃の行のラウンド・選べない理由の署名）は狙いと同じファイルに残す。
 */
const waitBody = (recordPath: string, state: GameState, seat: number, events: readonly string[]): string => {
  const path = planPath(recordPath, seat);
  const plan = readPlan(path);
  const raid = state.round >= 1 && plan.raidShown !== state.round;
  const folded = unavailableFolded(state, plan.unavailable);
  writePlan(path, { ...plan, raidShown: state.round, unavailable: folded.signature });
  return waitOutput(state, seat, events, { raid, unavailable: folded.lines }).join('\n');
};

/** 席の番まで待つ（wait と move --then-wait が使う）。番が来たら turnReport、ラウンドが終わった・時間切れならその文。 */
const waitFor = (path: string, seat: number, args: Args, prefix: readonly string[] = []): string => {
  const limit = Date.now() + (int(args, 'timeout') ?? WAIT_TIMEOUT) * 1000;
  const round = int(args, 'round');
  const head = prefix.length > 0 ? `${prefix.join('\n')}\n` : '';
  for (;;) {
    let record: PlayRecord | null = null;
    try {
      record = readRecord(path);
    } catch (e) {
      if (!(e instanceof PlayError)) throw e;
    }
    if (record !== null) {
      checkPlayer(record, seat, 'seat');
      const state = stateOf(record);
      const deciding = decider(state);
      if (isGameOver(state)) return `${head}ゲーム終了\n\n${renderScore(state)}`;
      // 打ち手の作り直し（指示書 2-6）：指定のラウンドが終わっていれば、番を待たずに終える。
      if (round !== undefined && effectiveRound(state) > round) return `${head}ラウンド ${round} は終わった（いまは第${effectiveRound(state)}ラウンド）。ノートを書いて終えること`;
      if (deciding === seat) return turnReport(record, seat, args, path, prefix);
      if (Date.now() >= limit) return `${head}まだ P${seat} の番ではない（選択待ち P${deciding ?? '-'}）。もう一度 wait を呼ぶこと`;
    } else if (Date.now() >= limit) {
      throw new PlayError(`記録を読めない：${path}`);
    }
    sleep(1000);
  }
};

/** 席 seat の番が来たときの出力：前回のその席の選択の後に起きたことと、その席の視点の局面。 */
const turnReport = (record: PlayRecord, seat: number, args: Args, recordPath: string, prefix: readonly string[] = []): string => {
  const steps = logSteps(record);
  let last = -1;
  steps.forEach((s, i) => {
    if (s.player === seat) last = i;
  });
  const since = steps.slice(last + 1);
  const state = stateOf(record);
  if (!args.flags.has('full')) {
    // 既定：他の席の分は手番ごとに1行にまとめる（指示書 2-5）。
    const events = [...turnLines(state, since, seat), ...notices(recordPath, state, seat, 'roundFirst')];
    const head = prefix.length > 0 ? `${prefix.join('\n')}\n` : '';
    // --state か --only か --json：従来の局面全体（指示書案 2026-11-13 2-1）。
    if (args.flags.has('state') || args.flags.has('only') || args.flags.has('json')) return `${head}${showState(state, { ...compactOpts(record, args), as: seat }, args, events)}`;
    return `${head}${waitBody(recordPath, state, seat, events)}`;
  }
  const shown = since.slice(-40);
  const head =
    since.length === 0
      ? ''
      : `== 前回の P${seat} の選択の後に起きたこと（${since.length}手${since.length > shown.length ? '、最後の40手だけ' : ''}）\n${renderSteps(state, shown)}\n\n`;
  return `${head}${showFull(record, { ...args, flags: new Map([...args.flags, ['as', String(seat)]]) })}`;
};

/** 自分の席の視点の局面（オンライン版）。--full は従来の全文、既定は短い形。 */
const onlineShow = (view: OnlineView, args: Args, events: readonly string[] = []): string => {
  const state = view.state;
  if (state === null) {
    return `対局の開始を待っている（入室 ${view.summary.names.length}／${view.summary.playerCount}人：${view.summary.names.join('・')}）。ルームコード ${view.summary.code}`;
  }
  if (isGameOver(state)) return `${events.length > 0 ? `== 出来事\n${events.join('\n')}\n\n` : ''}ゲーム終了\n\n${renderScore(state)}`;
  if (args.flags.has('full')) {
    const opts: ShowOptions = {
      as: view.seat,
      ...(args.flags.has('board') ? { board: true } : {}),
      ...(args.flags.has('brief') ? { brief: true } : {}),
    };
    const body = args.flags.has('json') ? JSON.stringify(showModel(state, opts), null, 2) : renderShow(state, opts);
    return `${events.length > 0 ? `== 前回の出力の後に起きたこと\n${events.join('\n')}\n\n` : ''}${body}`;
  }
  const only = str(args, 'only');
  const opts: CompactOptions = {
    as: view.seat,
    ...(only === undefined ? {} : { only: parseSections(only) }),
    ...(args.flags.has('board') ? { board: true } : {}),
  };
  return showState(state, opts, args, events);
};

/** 前回の出力の後に起きたこと（既定は手番ごとのまとめ、--full は出来事を1つずつ）。 */
const onlineEvents = (creds: OnlineCredentials, view: OnlineView, args: Args): string[] => {
  const state = view.state;
  if (state === null) return [];
  const from = Math.min(creds.seenEvents, state.events.length);
  if (args.flags.has('full')) {
    const text = eventsSince(state, from);
    return text === '' ? [] : text.split('\n');
  }
  return [
    ...eventTurnLines(state, state.events.slice(from), view.seat),
    ...revealLines(state, revealSince(creds.seen, state, view.seat), view.seat),
  ];
};

/** 見た出来事の数と公開物を資格情報に残す。 */
const markSeen = (path: string, creds: OnlineCredentials, view: OnlineView): void => {
  if (view.state !== null) writeCredentials(path, { ...creds, seenEvents: view.state.events.length, seen: seenOf(view.state, view.seat) });
};

/** 前回の出力の後に起きたことと局面を出し、見た出来事の数を資格情報に残す。 */
const onlineReport = (path: string, creds: OnlineCredentials, view: OnlineView, args: Args, prefix: readonly string[] = []): string => {
  const events = [...prefix, ...onlineEvents(creds, view, args)];
  markSeen(path, creds, view);
  const state = view.state;
  // 番が来たときの既定は wait の短い形（指示書案 2026-11-13 2-1）。前回の内容を持たないため、襲撃の行と選べない理由は毎回出す。
  if (state !== null && !isGameOver(state) && myTurn(state, view.seat) && !['full', 'state', 'only', 'json'].some((f) => args.flags.has(f))) {
    return waitOutput(state, view.seat, events, { raid: true, unavailable: unavailableFolded(state, undefined).lines }).join('\n');
  }
  return onlineShow(view, args, events);
};

/** 自分の番まで待つ（online wait と online move --then-wait）。 */
const onlineWaitFor = async (path: string, creds: OnlineCredentials, args: Args, prefix: readonly string[] = []): Promise<string> => {
  const limit = Date.now() + (int(args, 'timeout') ?? WAIT_TIMEOUT) * 1000;
  const round = int(args, 'round');
  const head = prefix.length > 0 ? `${prefix.join('\n')}\n` : '';
  for (;;) {
    const view = await viewRoom(creds);
    const state = view.state;
    if (state !== null && (isGameOver(state) || myTurn(state, creds.seat))) return onlineReport(path, creds, view, args, prefix);
    if (state !== null && round !== undefined && effectiveRound(state) > round) {
      return `${head}ラウンド ${round} は終わった（いまは第${effectiveRound(state)}ラウンド）。ノートを書いて終えること`;
    }
    if (Date.now() >= limit) {
      return state === null
        ? `${head}まだ始まっていない（入室 ${view.summary.names.length}／${view.summary.playerCount}人）。もう一度 wait を呼ぶこと`
        : `${head}まだ P${creds.seat} の番ではない（選択待ち P${decider(state) ?? '-'}）。もう一度 wait を呼ぶこと`;
    }
    await sleepAsync(3000);
  }
};

const sleepAsync = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const online = async (args: Args, rest: readonly string[]): Promise<string> => {
  const [sub, ...specs] = rest;
  const url = (str(args, 'url') ?? process.env['PLAY_ONLINE_URL'] ?? DEFAULT_ONLINE_URL).replace(/\/+$/, '');
  const credsPath = (): string => {
    const path = str(args, 'creds');
    if (path === undefined) throw new PlayError('--creds で資格情報のファイルを指定すること');
    return path;
  };
  const saveNew = async (creds: OnlineCredentials): Promise<string> => {
    const path = str(args, 'creds') ?? credentialsPath(creds.code, creds.seat);
    writeCredentials(path, creds);
    const view = await viewRoom(creds);
    return `ルームコード ${creds.code}、席 P${creds.seat}。資格情報：${path}（以後 --creds ${path} を付ける）\n\n${onlineShow(view, args)}`;
  };
  switch (sub) {
    case 'join': {
      const code = str(args, 'code');
      const name = str(args, 'name');
      if (code === undefined || name === undefined) throw new PlayError('--code と --name を指定すること');
      return saveNew(await joinOnline(url, code, name));
    }
    case 'create': {
      const players = int(args, 'players');
      const name = str(args, 'name');
      if (players !== 3 && players !== 4) throw new PlayError('--players は 3 か 4 で指定すること');
      if (name === undefined) throw new PlayError('--name を指定すること');
      return saveNew(await createOnline(url, players, name, args.flags.has('snake')));
    }
    case 'show': {
      const creds = readCredentials(credsPath());
      return onlineShow(await viewRoom(creds), args);
    }
    case 'wait': {
      const path = credsPath();
      return onlineWaitFor(path, readCredentials(path), args);
    }
    case 'move': {
      const path = credsPath();
      const creds = readCredentials(path);
      const { sent, view } = await moveOnline(creds, specs);
      if (args.flags.has('full') || view.state === null) return `送った選択：${sent.join(' ')}\n\n${onlineReport(path, creds, view, args)}`;
      // 既定：出来事・自分の要約・次の選択肢だけ（指示書 2-1）。
      const events = onlineEvents(creds, view, args);
      markSeen(path, creds, view);
      const only = str(args, 'only');
      if (only !== undefined) return onlineShow(view, args, events);
      // --then-wait（指示書案 2026-11-13 2-3）：自分の番でなくなったら、そのまま番を待つ。
      if (args.flags.has('then-wait') && !isGameOver(view.state) && !myTurn(view.state, view.seat)) {
        return onlineWaitFor(path, readCredentials(path), args, [`送った選択：${sent.join(' ')}`, ...events]);
      }
      return [`送った選択：${sent.join(' ')}`, ...events, ...tailLines(view.state, view.seat, args.flags.has('board') ? { board: true } : {})].join('\n');
    }
    default:
      throw new PlayError(`知らない online のコマンドである：${sub ?? '（なし）'}（join・create・show・wait・move）`);
  }
};

const run = (argv: readonly string[]): string | Promise<string> => {
  const args = parseArgs(argv);
  const [command, ...rest] = args.positional;
  if (command === undefined || args.flags.has('help') || command === 'help') return HELP;
  if (command === 'online') return online(args, rest);
  const path = str(args, 'file') ?? DEFAULT_RECORD_PATH;
  switch (command) {
    case 'new': {
      const players = int(args, 'players');
      const seed = int(args, 'seed');
      if (players !== 3 && players !== 4) throw new PlayError('--players は 3 か 4 で指定すること');
      if (seed === undefined) throw new PlayError('--seed を指定すること');
      if (recordExists(path) && !args.flags.has('force')) throw new PlayError(`記録が既にある：${path}（上書きするなら --force）`);
      const names = str(args, 'names')?.split(',');
      if (names !== undefined && names.length !== players) throw new PlayError(`--names の数がプレイ人数と合わない：${names.length}`);
      const config: GameConfig = {
        playerCount: players,
        ...(names === undefined ? {} : { playerNames: names }),
        ...(args.flags.has('snake') ? { variants: { snakeDraft: true } } : {}),
      };
      const record = newRecord(config, seed);
      stateOf(record);
      writeRecord(path, record);
      // new は従来どおり全文を出す（指示書 2026-11-11 2-1）。
      return showFull(record, args);
    }
    case 'show':
      return show(load(path), args);
    case 'move': {
      const record = load(path);
      const seat = int(args, 'seat');
      checkPlayer(record, seat, 'seat');
      if (args.flags.has('dry-run')) {
        // 手の下見（指示書 2026-11-12 2-2）。記録は変えない。
        const state = stateOf(record);
        const deciding = decider(state);
        if (seat !== undefined && deciding !== seat) throw new PlayError(`いまの選択待ちは P${deciding ?? '-'} であり、P${seat} は選べない（下見もしない）`);
        const who = seat ?? deciding;
        if (who === null) throw new PlayError('選択待ちがない');
        const sequences: string[][] = [[]];
        for (const r of rest) {
          if (r === OR) sequences.push([]);
          else sequences[sequences.length - 1]?.push(r);
        }
        if (sequences.length === 1) {
          const [only = []] = sequences;
          if (only.length === 0) throw new PlayError('下見する選択肢を指定すること');
          return previewOutput(state, only, who, record.moves.length);
        }
        return compareOutput(state, sequences, who, record.moves.length);
      }
      if (rest.includes(OR)) throw new PlayError('--or は --dry-run と一緒に使う');
      if (args.flags.has('then-wait') && seat === undefined) throw new PlayError('--then-wait は --seat と一緒に使う');
      const result = applyMoves(record, rest, undefined, seat);
      writeRecord(path, result.record);
      // --then-wait（指示書案 2026-11-13 2-3）：選択待ちが他の席に移ったら、そのまま番を待って wait の短い形で出す。
      if (args.flags.has('then-wait') && seat !== undefined && !args.flags.has('full') && !isGameOver(result.state) && decider(result.state) !== seat) {
        return waitFor(path, seat, args, ['== 適用した選択', ...stepLines(result.state, result.steps, seat)]);
      }
      // 席を指定したときは、選択待ちが他の席に移っても視点をその席に保つ（他の席の手札を出さない）。
      const view = seat === undefined || args.flags.has('as') ? args : { ...args, flags: new Map([...args.flags, ['as', String(seat)]]) };
      if (args.flags.has('full')) return `${renderSteps(result.state, result.steps)}\n\n${showFull(result.record, view)}`;
      const opts = compactOpts(result.record, view);
      return args.flags.has('json')
        ? JSON.stringify(compactJson(result.state, { ...opts, as: opts.as ?? seat ?? result.steps[0]?.player ?? 0 }, undefined, renderSteps(result.state, result.steps).split('\n')), null, 2)
        : moveOutput(result.state, result.steps, seat, opts, undefined, notices(path, result.state, seat ?? result.steps[0]?.player ?? 0, 'never'));
    }
    case 'wait': {
      const seat = int(args, 'seat');
      if (seat === undefined) throw new PlayError('--seat を指定すること');
      return waitFor(path, seat, args);
    }
    case 'undo': {
      const record = load(path);
      const n = rest[0] === undefined ? 1 : Number(rest[0]);
      const result = undoMoves(record, n);
      stateOf(result.record);
      writeRecord(path, result.record);
      if (args.flags.has('full')) return `取り消した選択（古い順）：${result.removed.join(' ')}\n\n${showFull(result.record, args)}`;
      const state = stateOf(result.record);
      const opts = compactOpts(result.record, args);
      return `取り消した選択（古い順）：${result.removed.join(' ')}\n${moveOutput(state, [], int(args, 'seat'), opts)}`;
    }
    case 'ref': {
      const record = load(path);
      const state = stateOf(record);
      const seat = int(args, 'seat');
      checkPlayer(record, seat, 'seat');
      const only = str(args, 'only');
      const cards = str(args, 'card')?.split(',').map((c) => c.trim()).filter((c) => c !== '') ?? [];
      return refLines(state, seat ?? decider(state) ?? 0, only === undefined ? undefined : parseRefSections(only), cards).join('\n');
    }
    case 'resume': {
      const record = load(path);
      const seat = int(args, 'seat');
      if (seat === undefined) throw new PlayError('--seat を指定すること');
      checkPlayer(record, seat, 'seat');
      const steps = logSteps(record);
      const state = stateOf(record);
      // 第2ラウンド以降の既定は短い形（指示書案 2026-11-13 2-2）。第1ラウンドと --ref は従来の全文。
      if (effectiveRound(state) >= 2 && !args.flags.has('ref')) {
        const plan = readPlan(planPath(path, seat));
        return resumeBrief(state, seat, [...notices(path, state, seat, 'always'), ...planList(state, readPlan(planPath(path, seat)), seat).slice(plan.targets.length === 0 ? 1 : 0)]);
      }
      return resumeOutput(state, steps, seat, undefined, notices(path, state, seat, 'always'));
    }
    case 'plan': {
      // 狙いの登録・一覧・消去（指示書 2026-11-12 2-4）。置き場は記録と同じディレクトリの plan-P<席>.json。
      const record = load(path);
      const seat = int(args, 'seat');
      if (seat === undefined) throw new PlayError('--seat を指定すること');
      checkPlayer(record, seat, 'seat');
      const state = stateOf(record);
      const file = planPath(path, seat);
      const plan = readPlan(file);
      const set = str(args, 'set');
      if (args.flags.has('clear')) {
        writePlan(file, clearPlan(plan));
        return `P${seat} の狙いを消した`;
      }
      if (set !== undefined) {
        const next = setPlan(state, plan, parseTargets(set), seat);
        writePlan(file, next);
        return planList(state, next, seat).join('\n');
      }
      return planList(state, plan, seat).join('\n');
    }
    case 'measure':
      return measure(load(path));
    case 'log': {
      const record = load(path);
      const from = int(args, 'from') ?? 1;
      const steps = logSteps(record);
      const seat = int(args, 'seat');
      checkPlayer(record, seat, 'seat');
      const text = renderLog(stateOf(record), seat === undefined ? steps : steps.filter((s) => s.player === seat), from);
      return text === '' ? '記録に選択がない' : text;
    }
    case 'score': {
      const state = stateOf(load(path));
      return args.flags.has('json') ? JSON.stringify(scoreModel(state), null, 2) : renderScore(state);
    }
    default:
      throw new PlayError(`知らないコマンドである：${command}（--help で一覧を出す）`);
  }
};

const fail = (e: unknown): void => {
  const message = e instanceof Error ? e.message : String(e);
  const line = message.split('\n')[0] ?? message;
  process.stderr.write(`${line}\n`);
  // 標準出力だけを読む呼び出し方（パイプで絞るなど）でも失敗が分かるよう、標準出力にも出す。
  process.stdout.write(`失敗：${line}\n`);
  process.exitCode = 1;
};

try {
  void Promise.resolve(run(process.argv.slice(2))).then((out) => {
    process.stdout.write(`${out}\n`);
  }, fail);
} catch (e) {
  fail(e);
}
