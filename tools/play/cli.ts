// 対話プレイ用のコマンドの入口（指示書 2026-11-10 対話プレイ 2-3）。引数の解釈と入出力だけを行い、
// 記録の処理は record.ts、文字の組み立ては render.ts に任せる。対話的な入力待ちは作らない。
// 成功は終了コード0、失敗は1とし、失敗の理由を標準エラーに1行で出す。

import { DATA_VERSION } from '../../src/data/index.ts';
import { decider, isGameOver, type GameConfig } from '../../src/game/index.ts';
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
  viewRoom,
  writeCredentials,
  type OnlineCredentials,
  type OnlineView,
} from './online.ts';
import { renderLog, renderScore, renderShow, renderSteps, scoreModel, showModel, type ShowOptions, type Viewer } from './render.ts';

const HELP = `対話プレイ用のコマンド（1回の呼び出しで完結する。局面は記録ファイルに保存する）

使い方: npm run -s play -- <コマンド> [引数] [--file <パス>]（記録の既定は ${DEFAULT_RECORD_PATH}）
  new --players <3|4> --seed <整数> [--snake] [--names a,b,c] [--force]
      新しい記録を作り、局面を出す。既にファイルがあれば --force のときだけ上書きする。--snake はスネークドラフト。
  show [--as <番号|all>] [--seat <番号>] [--player <番号>] [--board] [--brief] [--json]（--as がなければ --seat の席が視点。--brief はアクションボードの効果文を省く。wait・move にも付けられる）
      局面と、選択待ちのプレイヤーの選択肢を出す。番号はプレイヤー番号（0始まり）。
      --as は視点（省略時は選択待ちのプレイヤー、all はすべての手札を見る分析用）。--player はそのプレイヤーの詳細。
  move <選択肢> [<選択肢> ...]
      選択肢 ID か、直前の show の番号（1始まり）を順に適用する。1つでも選べなければ記録を変えずに失敗する。
  undo [<手数>]
      記録の末尾から手数（既定1）を取り除く。分析用の取り消しで、ルール上の巻き戻し（第15章）とは異なりチェックポイントを越えて戻せる。
  wait --seat <番号> [--timeout <秒>]
      席 <番号> の番が来るまで待ち（既定300秒）、前回のその席の選択の後に起きたことと、その席の視点の局面を出す。
      時間切れなら「まだ番ではない」と出して終わる（もう一度呼ぶ）。ゲームが終われば最終得点を出す。
  move ... --seat <番号>   選択待ちがその席でなければ記録を変えずに失敗する（席ごとに別の打ち手が打つとき）。
  log [--from <手数>] [--seat <番号>]（--seat はその席の選択だけ）      記録の選択を、手数・選択したプレイヤー・ラベルとともに出す。
  score [--json]           終局していれば最終得点の内訳、していなければ得点トラックの現在値を出す。
  --help                   この説明を出す。

オンライン版の部屋で打つ（人がブラウザのオンライン版で遊ぶ部屋に、席として入る。局面は窓口が伏せた写しだけを使う）:
  online join --code <ルームコード> --name <名前> [--url <Supabase の Project URL>]
      部屋に入り、席の資格情報を .play/online/<コード>-<席>.json に保存する（--creds で場所を替える）。
  online create --players <3|4> --name <名前> [--snake] [--url ...]   部屋を作り、ルームコードと資格情報を出す。
  online show --creds <パス> [--board] [--brief] [--json]             自分の席の視点の局面を出す。
  online wait --creds <パス> [--timeout <秒>] [--board] [--brief]
      自分の番が来るまで待ち（既定300秒）、前回の出力の後に起きたことと局面を出す。対局の開始前は全員の入室を待つ。
  online move <選択肢> [<選択肢> ...] --creds <パス> [--brief]
      選択肢 ID か、いまの選択肢の番号を順に送る。1手ずつ送るため、途中で失敗するとそれより前の手は送られたままになる。
  窓口の既定は ${DEFAULT_ONLINE_URL}（環境変数 PLAY_ONLINE_URL でも替えられる）。

例:
  npm run -s play -- new --players 3 --seed 1
  npm run -s play -- move 3
  npm run -s play -- move act:pioneer:normal count:1 tile:E2:plains
  npm run -s play -- show --as all --board
  npm run -s play -- undo 2
  npm run -s play -- score`;

type Args = { readonly positional: string[]; readonly flags: Map<string, string | true> };

const VALUE_FLAGS = new Set(['file', 'players', 'seed', 'names', 'as', 'player', 'from', 'seat', 'timeout', 'code', 'name', 'url', 'creds']);

const parseArgs = (argv: readonly string[]): Args => {
  const positional: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg.startsWith('--')) {
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

const show = (record: PlayRecord, args: Args): string => {
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

/** 同期で待つ（wait の見回り。シェルの sleep を使わずに済ませる）。 */
const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/** 席 seat の番が来たときの出力：前回のその席の選択の後に起きたことと、その席の視点の局面。 */
const turnReport = (record: PlayRecord, seat: number, args: Args): string => {
  const steps = logSteps(record);
  let last = -1;
  steps.forEach((s, i) => {
    if (s.player === seat) last = i;
  });
  const since = steps.slice(last + 1);
  const state = stateOf(record);
  const shown = since.slice(-40);
  const head =
    since.length === 0
      ? ''
      : `== 前回の P${seat} の選択の後に起きたこと（${since.length}手${since.length > shown.length ? '、最後の40手だけ' : ''}）\n${renderSteps(state, shown)}\n\n`;
  return `${head}${show(record, { ...args, flags: new Map([...args.flags, ['as', String(seat)]]) })}`;
};

/** 自分の席の視点の局面（オンライン版）。 */
const onlineShow = (view: OnlineView, args: Args): string => {
  const state = view.state;
  if (state === null) {
    return `対局の開始を待っている（入室 ${view.summary.names.length}／${view.summary.playerCount}人：${view.summary.names.join('・')}）。ルームコード ${view.summary.code}`;
  }
  if (isGameOver(state)) return `ゲーム終了\n\n${renderScore(state)}`;
  const opts: ShowOptions = {
    as: view.seat,
    ...(args.flags.has('board') ? { board: true } : {}),
    ...(args.flags.has('brief') ? { brief: true } : {}),
  };
  return args.flags.has('json') ? JSON.stringify(showModel(state, opts), null, 2) : renderShow(state, opts);
};

/** 前回の出力の後に起きたことと局面を出し、見た出来事の数を資格情報に残す。 */
const onlineReport = (path: string, creds: OnlineCredentials, view: OnlineView, args: Args, head = ''): string => {
  const state = view.state;
  const since = state === null ? '' : eventsSince(state, Math.min(creds.seenEvents, state.events.length));
  if (state !== null) writeCredentials(path, { ...creds, seenEvents: state.events.length });
  return `${head}${since === '' ? '' : `== 前回の出力の後に起きたこと\n${since}\n\n`}${onlineShow(view, args)}`;
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
      const creds = readCredentials(path);
      const limit = Date.now() + (int(args, 'timeout') ?? 300) * 1000;
      for (;;) {
        const view = await viewRoom(creds);
        const state = view.state;
        if (state !== null && (isGameOver(state) || myTurn(state, creds.seat))) return onlineReport(path, creds, view, args);
        if (Date.now() >= limit) {
          return state === null
            ? `まだ始まっていない（入室 ${view.summary.names.length}／${view.summary.playerCount}人）。もう一度 wait を呼ぶこと`
            : `まだ P${creds.seat} の番ではない（選択待ち P${decider(state) ?? '-'}）。もう一度 wait を呼ぶこと`;
        }
        await sleepAsync(3000);
      }
    }
    case 'move': {
      const path = credsPath();
      const creds = readCredentials(path);
      const { sent, view } = await moveOnline(creds, specs);
      return onlineReport(path, creds, view, args, `送った選択：${sent.join(' ')}\n\n`);
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
      return show(record, args);
    }
    case 'show':
      return show(load(path), args);
    case 'move': {
      const record = load(path);
      const seat = int(args, 'seat');
      checkPlayer(record, seat, 'seat');
      const result = applyMoves(record, rest, undefined, seat);
      writeRecord(path, result.record);
      // 席を指定したときは、選択待ちが他の席に移っても視点をその席に保つ（他の席の手札を出さない）。
      const view = seat === undefined || args.flags.has('as') ? args : { ...args, flags: new Map([...args.flags, ['as', String(seat)]]) };
      return `${renderSteps(result.state, result.steps)}\n\n${show(result.record, view)}`;
    }
    case 'wait': {
      const seat = int(args, 'seat');
      if (seat === undefined) throw new PlayError('--seat を指定すること');
      const limit = Date.now() + (int(args, 'timeout') ?? 300) * 1000;
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
          if (isGameOver(state)) return `ゲーム終了\n\n${renderScore(state)}`;
          if (deciding === seat) return turnReport(record, seat, args);
          if (Date.now() >= limit) return `まだ P${seat} の番ではない（選択待ち P${deciding ?? '-'}）。もう一度 wait を呼ぶこと`;
        } else if (Date.now() >= limit) {
          throw new PlayError(`記録を読めない：${path}`);
        }
        sleep(1000);
      }
    }
    case 'undo': {
      const record = load(path);
      const n = rest[0] === undefined ? 1 : Number(rest[0]);
      const result = undoMoves(record, n);
      stateOf(result.record);
      writeRecord(path, result.record);
      return `取り消した選択（古い順）：${result.removed.join(' ')}\n\n${show(result.record, args)}`;
    }
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
