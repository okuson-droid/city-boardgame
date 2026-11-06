# CLAUDE.md — 都市開発ボードゲーム（仮）

Claude Code がこのリポジトリで作業するときの手引きである。運用を変えたら更新する。

## 現在の段階

- 指示書：`design/指示書_2026-11-03_初期実装.md`
- 完了：3-1 データ層（`src/data/`、`src/game/board.ts`）。main に取り込み済み。
- 完了：3-2 ゲームロジックの骨格（`src/game/`）。main に取り込み済み。
- 完了：3-3 効果（命令セットは `docs/effect-commands.md`）。main に取り込み済み。
- 完了：3-4 ローカル UI（ui_design.md は 2026-11-03 に承認済み）。受け入れ検査は合格。main に取り込み済み。演出は現段階では最小限とする（ユーザー決定 2026-11-03）。
- 完了：アイコンの文法（`docs/styleguide-icons.md`、承認済み 2026-11-03）。図案は `src/ui/icon-art.ts`、画面への組み込みは `Icon.tsx`。
- 完了：アイコンの一覧（`Legend.tsx`）とカーソルを合わせたときの効果文（`HoverTip`、ユーザー決定 2026-11-04）。main に取り込み済み。
- 完了：アイコンの見直し（ユーザー決定 2026-11-04・05）。開拓・建築・普及・インフラ・建物7種を描き直し、文字1字の仮の素材をすべて図案に置き換えた。文明カードを捨てる（`symbols.discard`）を支払うから分けた。教練と軍事レベルは塗りの剣にした（2026-11-05）。main に取り込み済み。
- 完了：ドラフトの専用画面（ユーザー決定 2026-11-05、スイーツランドの準備のドラフトを参考にした。`src/ui/DraftScreen.tsx`）。main に取り込み済み。
- 完了：カードの大きさの統一と画面の配置の組み替え（ユーザー決定 2026-11-05、スイーツランドに倣う。左に共有の盤面、中央に地図、右に個人の情報、下に計画都市・手札）。main に取り込み済み。
- 完了：ルール解説（スライドの写し）・一覧（カード・キャラクター・ボード）・トラックの到達報酬の表示（ユーザー決定 2026-11-06）。main に取り込み済み。
- 完了：3-5 チューナー（`tools/tuner/`、`npm run tuner`）。main に取り込み済み。指示書の段階1〜4とチューナーはすべて完了した。検証（シミュレーションによる比較）は別の指示書で扱う。
- 完了：演出の残り（ui_design.md 4節：増減のまとめ、トラックの1段ずつの表示、ラウンドの区切りの画面、置いたマスの強調、履歴からの強調）。main に取り込み済み。
- 完了：オンライン化（段階5、`server/`・`src/online/`）。受け入れ検査（`npm run accept:online`）は合格。main に取り込み済み。
- 完了：公開ページのチューナー（案A、ユーザー決定 2026-11-04、`docs/tuner-pages.md`）。main に取り込み済み。GitHub への保存は模擬の API で単体テストを行った。本物の GitHub への保存は未確認（ユーザーのトークン待ち）。
- 完了：チュートリアル（ユーザー決定 2026-11-04、`src/tutorial/`・`src/ui/Tutorial.tsx`）。受け入れ検査（`npm run accept:tutorial`）は合格。main に取り込み済み。
- 完了：オンライン版の Supabase 化と GitHub Pages への配置（ユーザー決定 2026-11-03、`docs/online-supabase.md`）。模擬に対する受け入れ検査（`npm run accept:supabase`）は合格。main に取り込み済み。本物の Supabase では、Edge Function とテーブルが動き部屋を作れることを確かめた（2026-11-04）。Project URL はパスを捨てて起点だけを使う（`projectOrigin`）。

## 構成

| パス | 内容 |
|---|---|
| `design/` | 設計文書の写し（rules.md、decisions.md、data_*.json など）。**読むだけで変更しない。** |
| `src/data/*.json` | ゲームが読むデータ。数値パラメータ（`params.json`）、個人ボード（`board_*.json`）、カード類 |
| `src/data/types.ts` | データの型 |
| `src/data/validate.ts` | 型検査（unknown → 型）。違反は `DataValidationError`（パス付き） |
| `src/data/check.ts` | 整合検査（参照・内訳・範囲・形状のつながり）。問題を全件返す |
| `src/data/index.ts` | 入口。`GAME_DATA`（検査済み）、`RAW_GAME_DATA`（検査前）、`parseGameData`、`loadGameData` |
| `src/game/board.ts` | マスの座標・隣接・ヘクス距離・回転（rules.md 2-1-3〜2-1-3-3） |
| `src/game/rng.ts` | シード付き擬似乱数（mulberry32）。状態は JSON で直列化できる |
| `src/game/types.ts` | GameState・PlayerState・Task（選択待ちのタスク）・GameEvent・Option |
| `src/game/engine.ts` | 公開窓口 `createGame`・`getOptions`・`applyMove`・`isGameOver`。準備・ドラフト・手番・パス・ラウンド・襲撃 |
| `src/game/actions.ts` | 10アクションと、土地・建物の配置の選択タスク |
| `src/game/core.ts` | 数え上げ、資源・トラック・カードの変化、効果の処理（`processEffects`）、出来事（`emit`） |
| `src/game/scoring.ts` | `finalScores`（第17章、同点判定 17-7-2） |
| `src/game/history.ts` | `replay`・`isCheckpoint`・`undoLast` |
| `src/game/abilities.ts` | プレイヤーが持つ能力（キャラクター・特別な市民カード・プレイ済みの文明カード）と補正（modifier） |
| `src/game/effects.ts` | 効果スクリプトの実行（`runCommands`）、指標、常時効果の反応 |
| `src/game/effect-tasks.ts` | 効果由来の選択タスク、能力のフリーアクション・専用スペース、計画都市の達成宣言 |
| `src/game/planned.ts` | 計画都市の形状の判定と自然公園の得点（最大の割り当て） |
| `src/game/icons.ts` | `iconSequence`（アイコンと数字の並び）・`describeScript`（補足の文章） |
| `src/game/index.ts` | `src/game/` の公開窓口 |
| `src/data/script.ts` | 効果スクリプト（能力と命令）の型と検査 |
| `src/data/icon_keys.json`・`icon-keys.ts` | アイコンの対応表と検査 |
| `scripts/effect-scripts.ts` | 文明カード・特別な市民カード・キャラクターの効果スクリプト（取り込みで JSON に埋め込む） |
| `src/game/targets.ts` | `targetOf`：選択肢と画面要素の対応（ui_design.md 0-2）。null は安全網（「その他」）に出す |
| `src/game/explain.ts` | `explain`・`explainUndo`：選べない理由 |
| `src/game/deltas.ts` | 増減の出来事（`delta`）。選択1つの処理（cause＝move）と自動の処理（cause＝タスクの種類）ごとに記録する |
| `src/game/queries.ts` | 画面のための派生値（場面の見出し、アクションスペースのアイコン、コストの見込み、ワーカーの内訳など） |
| `src/ui/` | ローカル版の画面（React）。`Game.tsx`（全体）・`ActionBoard.tsx`・`Board.tsx`（SVG の個人ボード）・`Areas.tsx`（共有の場・手持ち・履歴・ドラフト・終了時の得点）・`PromptBar.tsx`・`Cards.tsx`・`Icon.tsx`（仮のアイコン素材）・`Tip.tsx`（補足表示と HoverTip）・`Legend.tsx`（アイコンの一覧）・`model.ts`（選択肢の振り分け） |
| `e2e/accept.ts` | 受け入れ検査（Playwright の自動対戦） |
| `src/tutorial/tutorial.ts` | チュートリアルの台本（手順の列）と進め方、自動の打ち手。画面に依存しない |
| `src/ui/Tutorial.tsx` | チュートリアルの画面（ゲーム画面に案内の札を重ね、選ぶ所作を光らせる） |
| `e2e/tutorial.ts` | チュートリアルの受け入れ検査（光っている所作だけを押して案内の最後まで進む） |
| `e2e/online.ts` | オンライン版の受け入れ検査（3つのブラウザで1局、再接続とサーバーの再起動を含む） |
| `src/online/rooms.ts` | 部屋（作成・入室・選択・取り消し・記録からの再生）と伏せた写し（`viewFor`） |
| `src/online/client.ts` | 画面側の通信。`Transport`（自前のサーバー：POST と SSE、Supabase：Edge Function への POST と Realtime）、席の鍵の保存 |
| `src/online/service.ts` | 部屋の窓口 `handleAction`（create・join・view・move・undo）と保存先 `RoomStore`（版による排他）。Web Crypto だけを使う |
| `src/online/edge.ts` | Edge Function の中身（HTTP・CORS、PostgREST の保存先、Broadcast の知らせ）。`npm run supabase:build` で `supabase/functions/rooms/bundle.js` にまとめる |
| `src/online/supabase-realtime.ts` | Realtime の Broadcast を受ける最小の WebSocket 接続（Phoenix の約束） |
| `supabase/` | Edge Function の入口（`functions/rooms/index.ts`、Deno）、`config.toml`、テーブルの SQL（`migrations/`） |
| `e2e/supabase-mock.ts` | Supabase の模擬（`bundle.js` で処理し、Realtime を最小の WebSocket で模擬する） |
| `.github/workflows/pages.yml` | GitHub Pages への配置と Edge Function の配置 |
| `src/ui/RulesDeck.tsx` | ルール解説（claude.ai のルール解説スライドと同じ内容）。1920×1080 のスライドを表示枠に合わせて縮め、章の選択・前後・補足（条項）を出す |
| `src/rules/rule-deck.ts` | ルール解説のスライド（生成ファイル、`npm run import:rules` が作る。手で編集しない） |
| `scripts/import-rules-deck.ts` | ルール解説のスライドを取り込む。画像はゲームの図案と一致すれば図案の識別子で持ち、最新の図案から描く |
| `src/ui/Catalog.tsx` | 一覧（カード・キャラクター・ボード）。トップページから開く |
| `src/ui/DraftScreen.tsx` | ドラフトの専用画面（選ぶ順番の帯・選んだもののまとめ・種類ごとのタブ・個人ボードの地図 `BoardMap`・キャラクターの文言） |
| `src/ui/Online.tsx` | オンライン版の入口（部屋を作る・入る・続きから）と対局画面 |
| `server/main.ts` | オンライン版のサーバー（node:http だけ、SSE＋HTTP）。`server/vite.config.ts` で `dist-server/main.js` にまとめる |
| `tools/tuner/labels.ts` | チューナーの画面に出す項目名・選択肢の日本語 |
| `tools/tuner/github.ts` | 公開ページのチューナーの GitHub への保存（Git Data API で1つの commit、保存先の最新に変更点を適用し直す） |
| `tools/tuner/vite.pages.config.ts` | 公開ページ用のチューナーのビルド（`dist/tuner/index.html`・`play.html`） |
| `tools/tuner/` | チューナー。`proposal.ts`（調整案の作成・差分・適用・保存と読み込み・検査・Markdown）、`TunerApp.tsx`（画面）、`JsonEditor.tsx`（汎用フォーム）、`ScriptEditor.tsx`（効果を命令と引数の単位で編集）、`BoardEditor.tsx`（個人ボード）、`vite.config.ts`（開発サーバーと書き戻しの口）、`play.html`（試遊） |
| `scripts/import-design.ts` | `design/` から characters・special_citizens・raid_cards・cards_civilization を取り込む |
| `scripts/generate-boards.ts` | 仮置きの個人ボードをシード付きで生成する |
| `tests/` | Vitest の単体テスト。`tests/helpers/` に局面づくりと乱択プレイアウトの補助 |

## コマンド

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest run
npm run build         # dist/index.html（1枚の HTML）
npm run dev           # 開発サーバー
npm run import:design # design/ からデータを取り込み直す
npm run gen:data      # 仮置きの個人ボードを生成し直す
npm run accept        # ビルドして受け入れ検査（自動対戦3局、数分かかる）
npm run tuner         # チューナーの開発サーバー（/tools/tuner/index.html）
npm run build:tuner   # 公開ページ用のチューナーを dist/tuner/ にビルドする（npm run build の後に行う）
npm run icons:preview # アイコンの見本 docs/icon-preview.html を生成する
npm run server        # クライアントとサーバーをビルドしてオンライン版を起動（PORT・HOST・ROOMS_DIR で設定、既定 8787）
npm run accept:online # オンライン版の受け入れ検査
npm run supabase:build   # Edge Function の中身を supabase/functions/rooms/bundle.js にまとめる
npm run supabase:deploy  # 上のビルドのあと Edge Function を配置する（-- --project-ref <ref> を付ける）
npm run accept:supabase  # Supabase の模擬に対するオンライン版の受け入れ検査
npm run accept:tutorial  # チュートリアルの受け入れ検査
npm run import:rules -- <フォルダー>  # ルール解説のスライドを取り込み直す（project/deck.json・project/slides/・blobs/ を置いたフォルダー）
```

## 守ること

- 調整の対象になりうる数値をコードに書かない。`src/data/` に置き、ゲームロジックは `GAME_DATA` を通して読む。
- 仮置きのデータには `provisional: true` を付ける。部分的な仮置きは `provisionalFields` に項目名を列挙する。仮置きの文言解釈は `clarifications` の `provisional: true` で表す。
- `design/` は変更しない。設計文書と食い違う実装をしたくなったら、実装を止めて報告する。
- rules.md の未定義箇所のうち、合法手・得点・勝敗に影響するものは推測で補完せず、止めて列挙する。
- 単体テストの各ケースに、対応する rules.md のバージョンと条項番号をコメントで書く（例：`// rules.md v0.8 3-3-1-2`）。
- コード内のコメントと文書は日本語の「である調」で書く。
- `Math.random()` を使わない。乱数は `src/game/rng.ts` を使う。
- 導入するライブラリは TypeScript・React・Vite・Vitest・vite-plugin-singlefile・Playwright に限る（型定義の `@types/*` を除く）。追加が必要なら導入前に報告する。
- ブランチの完了条件：`npm run typecheck`・`npm test`・`npm run build` がすべて通ること。

## ゲームロジックの約束事

- 選択待ちモデル：`GameState.stack` の最上段が現在のタスクである。自動タスク（`roundStart`・`income`・`nextTurn` など）は `advance` が処理し、選択タスクは `applyMove(state, optionId)` を待つ。選択肢のない選択タスクは不発として取り除く（16-2-5、16-2-6、4-4-5）。
- `applyMove` は状態を `structuredClone` した写しを変更して返す。元の状態は変更しない。
- 選択肢の識別子は `act:<action>:<tier>`・`pass`・`end`・`free:<id>[:<card>]`・`temp:<n>`・`count:<n>`・`tile:<cell>:<terrain>`・`build:<building>:<cell>`・`done`・`reward:<i>`・`convert:<0|1>`・`card:<id>`・`sc:<id>`・`order:<i>`・`bonus:<n>`・`raid:<none|defense|repel>`・`draft:<board|bonus|character>:<id>` である。
- 資源を得るだけの効果は `processEffects` が尋ねずに処理し、選択を伴う効果（土地タイル・建設の権利・無料建設・特別な市民カード・捨て札）はタスクにする。2つ以上あれば `chooseOrder` で順番を尋ねる（decisions.md 3-4）。
- 「〜した時」の効果（16-1-4）は、`emit` が記録する1単位ごとの出来事に反応させる（`effects.ts` の `react`）。
- 効果スクリプトの正は `src/data/` の JSON である（チューナーで編集し書き戻す）。`npm run import:design` は `design/` 由来の文言だけを更新し、効果スクリプトと文明カードの仮置きの項目（名称・条件・固有得点）は既存の値を保つ。`scripts/effect-scripts.ts` は値がないときの初期値としてだけ使う。
- タスクをスタックから取り除くときは `removeTask(state, task)` を使う。処理中に常時効果が上にタスクを積むため、`pop()` では誤って別のタスクを取り除く。
- 能力の識別子は「出どころ#添字」（例：`sc:09#0`、`char:merchant#1`）。選択肢は `ability:<識別子>`（フリーアクション）・`space:<識別子>`（専用スペース）・`plan:<id>`（計画都市の宣言）・`choose:<i>`・`copy:<action>:<tier>`・`spirit:<terrain>:<cell>`・`hero:<E1|F1>:<cell>`。
- 骨格のテストは `withoutCharacters` でキャラクターを外して局面を作る。キャラクターの効果がテストに混ざらないようにするためである。
- 得点は `addScore` で得点トラックに加え、評価軸を付けた `score` 出来事を残す（17-0-3）。評価軸の指定がない得点は `other`（17-0-2）。
- 巻き戻しは記録（`state.log`）の再生で行う。テストで局面を直接書き換えた状態は再生できないため、巻き戻しのテストは実際の選択だけで組み立てる。
- 乱択プレイアウトの性質テスト（3人・4人で各100局）は約30秒かかる。

## 画面の約束事

- 補足表示：`Tip` は子要素に `data-tip` を付け、文章を `TipContext` で子孫に渡す。PC はカーソルを合わせると `HoverTip`（画面に1つ、`App` に置く）が最も近い `data-tip` を吹き出しで出し、スマホは長押しで出す。アイコンは自身の語に続けて、囲む `Tip` の効果文を出す（ユーザー決定 2026-11-04）。アクションスペースの効果文は `describeActionSpace`（queries.ts）。
- アイコンの一覧は `Legend.tsx`（上部の「アイコン一覧」、`data-ui="legend"`）。対応表の全要素・10アクション・並べ方の約束の例を出し、語の補足は styleguide-icons.md 4-3 に従う。
- 前の語につなげる部品の名前（「の数」「を建設する度に」など）は、一覧と吹き出しに単独で出すとき `standaloneLabel`（Icon.tsx）で前に入るものを括弧で補う（ユーザー決定 2026-11-05）。効果の文章を組み立てる対応表の語は変えない。
- 画面はルールを計算しない（ui_design.md 0-2）。選択肢は `getOptions`、画面要素の対応は `targetOf`、選べない理由は `explain`、派生値は `queries.ts` だけから得る。
- ゲームを進める所作の要素には `data-target`（選択肢の識別子、または `pen:<建物>`・`free-panel` などの画面内の操作）を付ける。受け入れ検査はこの属性を持つ要素だけをクリックする。タブ・取り消し・設定など、ゲームを進めない要素は `data-ui` にする。
- 手札の要素には `data-hand-card` と `data-owner` を付ける。受け入れ検査はこれで他人の手札の漏れを数える。手札の内容は、表示中のタブが画面の持ち主（選択待ちのプレイヤー）のときだけ描く。
- 演出の速度は URL の `#speed=none|fast|standard`、シードは `#seed=<数>` で指定できる。受け入れ検査は `speed=none` の3局と `speed=fast` の1局で行う。
- 演出は `src/ui/Motion.tsx` にまとめ、`delta`・`levelReward`・`raid`・`round`・`tilePlaced`・`built` の出来事だけから組み立てる。速度「なし」では動きを止め、ラウンドの区切りの画面も出さない。
- 建築は「建物の種類を選んでからマスをタップ」、遠征は「報酬を選ぶだけ」とする（ユーザー決定 2026-11-03。ui_design.md 2-3・2-3-1 の記述からの変更）。
- 画面の配置（ユーザー決定 2026-11-05、スイーツランドに倣う。ui_design.md 1-2 の3列からの変更）：左の列（`col-left`）にアクションボードとその下の共有の場（襲撃・ボーナスタイル・特別な市民カード・履歴）、中央（`col-center`）に個人ボードの地図、右の列（`col-info`、`PersonalInfo`）に個人の情報（キャラクターとその右の自然公園カード、資源・生産・ワーカー・トラック・建物・最上位の解放、その下に畳んだプレイ済みのカード）、下（`bottom`）に左から計画都市（場の公開分と表示中のプレイヤーの専用分）・手札・特別な市民カード・文明カードの山を置く。自分のボーナスタイルは個人の欄に出さない（共有の場のボーナスタイルに持ち主の色の印が付く）。ボーナスタイル・特別な市民カード（共有の場）・履歴・プレイ済みのカードは畳んだ見出し（`Fold`）に入れ、クリックで開く。中に選べるものがあるときは自動で開く。縮退配置（幅1099px以下・高さ599px以下）は、共有の場（左の列を全幅）と個人領域（地図と、`personal-side` にまとめた個人の情報・手札）を切り替える。
- カードの大きさ（ユーザー決定 2026-11-05、2026-11-06 に 11.2em×15.7em へ拡大）：文明カード・特別な市民カード・計画都市・自然公園は縦長の一定の大きさ（`--card-w`・`--card-h`、幅：高さ ≒ 5：7）、キャラクターは横長の一定の大きさ（`--char-w`・`--char-h`）にする。中身が収まらないときはカードの中でスクロールし、仮置きの印は右下の隅に付ける。ドラフトのキャラクターも一定の大きさにそろえる。
- 計画都市・自然公園はカードの右上の「⤢」（`data-ui="pc-zoom"`・`np-zoom`）で拡大表示する（ユーザー決定 2026-11-06）。拡大の枠は `ZoomOverlay`（Cards.tsx）。拡大は `createPortal` で画面の最上位に描き、クリックをカード（選べる所作）へ伝えない。キャラクターのカードは大きさを変えず、中のアイコンだけを大きくする（`.card.character .script`）。下の帯の高さは `clamp(200px, 26vh, 240px)`。
- アクションボードの行の見出しは、名前の代わりにアクションのアイコン（`act.<action>`）を白い丸に入れて出す（ユーザー決定 2026-11-06）。名前はカーソルを合わせると吹き出しに出し、`aria-label` にも渡す。輸入・輸出・遠征・福祉・移住・研究の図案は塗りの絵に描き直した（2026-11-06）。
- ルール解説（ユーザー決定 2026-11-06）：トップページの「ルール解説」とゲーム中の上部の「ルール」（`data-ui="rules"`）から開く。内容は claude.ai のルール解説スライド（https://claude.ai/artifact/JCfBVdvBQV4N5yDvF9ibHC）の写しで、スライドを直したら `npm run import:rules` で取り込み直す。書体（Noto Sans JP・Zen Old Mincho）は開いたときに Google Fonts から読み、読めなければ手元の書体で描く。
- 一覧（ユーザー決定 2026-11-06）：トップページの「カード一覧」「キャラクター一覧」「ボード一覧」から `Catalog` を開く。カードは種類ごと（文明カード・特別な市民カード・計画都市・自然公園・ボーナスタイル・襲撃カード）にゲーム画面と同じ面と原本の文言を並べ、語で絞り込める。
- トラック（ユーザー決定 2026-11-06）：`TrackBar` は現在値と上限、次の到達報酬の文（「次の報酬：6で資材3を得る（あと1）」）、レベルのマス、到達報酬のアイコン（次の報酬は金の縁、獲得済みは薄くして ✓）を並べる。報酬の文とアイコンは `params.military/infra.rewards` から作る。
- 文明カードの面（ユーザー決定 2026-11-05）：`CivCardView` は、分類の色（`tagColor`、icon-art.ts の `TAG_COLORS`）の帯に金貨のコスト（割引時は緑の縁）と名前、その下に分類の段、枠で囲んだ効果、固有の得点の順に並べる。
- 装飾（ユーザー決定 2026-11-06、3段階の案から「凝った」段階を採用）：`src/ui/deco.css` にまとめ、styles.css の後に読む。カード類は文明カードと同じ作り（種類の色の帯・囲んだ中身・紙の地、金の縁と隅の飾り）、アクションボードは系統の色の札と段階の銅・銀・金の札を額に入れ、上部は濃い帯に金の罫、卓と欄に紙・布の質感を付ける。装飾は見た目だけを変え、大きさと配置は変えない。
- ドラフト（ユーザー決定 2026-11-05）：選択待ちが `draftPick` の間は、3列の画面の代わりに `DraftScreen` を出す。個人ボードは地図そのもの（`BoardMap`）を見せ、タブは選ぶ人がまだ選んでいない種類だけ押せる。「閉じて盤面を見る」で畳み、上部の「ドラフトを開く」で戻る（選ぶ人が変わると開き直す）。手札の欄は通常の画面と同じく、表示中のタブが画面の持ち主のときだけ内容を描く。
- 表示の切り替え（ドラフトの一覧か個人ボードか）は、フェイズではなく選択待ちのタスクで判断する。準備の処理（英雄・デザイナーの初期配置）はフェイズが「ドラフト」のまま進むためである。
- アイコンの図案は `src/ui/icon-art.ts`（識別子ごとの SVG）。文字1字の仮の素材は画面に出さない（ユーザー決定 2026-11-04）。新しい識別子を足したら図案も足す。合成のアイコン（指標:建物・指標:地形）は `compositeArt` が組み立てる。見本は `npm run icons:preview` で `docs/icon-preview.html` に生成する。
- 文法の区切り（条件のカプセル・「〜する度に」の輪・「いずれか1つ」の角括弧）は、`iconSequence` が `grp.<cond|loop|choice>.open/close` の印を返し、`IconRow` が枠に組み立てる。支払いは矢（`sym.then`）の左に置き、負の数にしない。

## チュートリアルの約束事（ユーザー決定 2026-11-04）

- 実際の対局（3人、`TUTORIAL_SEED`、席0が第1ラウンドの最初の手番）で、第1ラウンドを一手ずつ案内し、その後は自由に遊ぶ。他の2席は自動の打ち手（`botMove`、`rng.ts` の乱数、1ラウンドにアクション2回まで、第1ラウンドは案内で使う占有型のスペースを使わない）。
- 台本は `STEPS`。手順は「次へ」（kind: next）か「決まった選択」（kind: move、`allow` の型。末尾の * は前方一致）。`when` が偽の手順は、`optional` なら自分の番で飛ばし、そうでなければ待つ。待つ間に来た台本にない選択（キャラクターやカードの効果）は、どれでも選べるようにする。
- 説明の数値は `GAME_DATA` から読む（チューナーで値を変えても説明が食い違わない）。台本を変えたら `tests/tutorial.test.ts`（全キャラクターで最後まで通るか）と `npm run accept:tutorial` を通す。
- 台本にない選択や、光らせる指定のない手順では、選べる選択肢を光らせる。マスに対応する選択肢は `cell:<マス>` も光らせる（`patternsOf`）。
- 画面は `GameController.seat` を席0に固定し、取り消しは使わない。光らせる所作は CSS（`data-target` の属性セレクタ）で強調し、それ以外の所作は薄くする。案内の札は、横長の画面では右の個人の情報の列の上（`coach-left` の手順も同じ位置）、縮退配置では右上に置く。個人ボードのマス（SVG の g）には枠線を付けず、六角形の縁取りで光らせる。

## チューナーの約束事

- 調整案は「ファイル名・位置（path）・元の値・新しい値」の変更点の列である。差分はファイル単位（`DATA_FILES`、`rawFromFiles`）で取る。配列の長さやオブジェクトの項目が変わった場合は、その配列・オブジェクト全体を1つの変更点にする。
- 保存・試遊・書き出しの前に `validateFiles`（型検査と整合検査）を行い、問題があれば止める。作業中の写しはブラウザ（localStorage の `tuner:work`）に保つ。
- 試遊は `tools/tuner/play.html` が調整案のデータを `globalThis.__TUNER_FILES__` に置き、`src/data/index.ts` がチューナーの開発サーバー（`VITE_TUNER=1`）のときだけそれを読む。配布用ビルドには含まれない。
- 書き出しは開発サーバーの `POST /__tuner/export` が受け、`src/data/` に既にあるゲームデータの JSON（`icon_keys.json` を除く）だけを書き換える。あわせて変更点の一覧を Markdown で出し、ユーザーが claude/tuning_log.md に転記する。
- 識別子・原本の文言・仮置きの印・プレイ条件と効果適用条件は、チューナーでは読むだけにする。
- 新しいカード（ユーザー決定 2026-11-04）：一覧のある種類は「新しく作る」で選んでいるカードを写して加える（`newItemFrom`、識別子は `nextId`、仮置きの印を付け、解釈と未決の事項は写さない）。新しいカードだけは文言・分類・効果の説明も編集でき、消せる。元データのカードは消せない。`npm run import:design` は原本にないカードを消さずに後ろに残し、原本との一致のテストは原本の識別子のカードだけを照らす。変更点の一覧と Markdown は、カードの一覧を件数と追加・削除・変更した識別子で表す（`summarizeChange`）。
- チューナーの画面の文言は日本語にする（ユーザー決定 2026-11-04）。項目名と選択肢の値の日本語は `tools/tuner/labels.ts`（`keyLabel`・`valueLabel`）にまとめ、資源・建物・地形などはアイコンの対応表の語を使う。保存する値は英語の識別子のままである。データに項目を足したら labels.ts にも足す。
- 公開ページのチューナー（案A、ユーザー決定 2026-11-04）：開発サーバーへの書き出しの代わりに「GitHub に保存」を使う。トークン（Contents の読み書きだけの fine-grained PAT）はユーザーが貼り、ブラウザにだけ置く。リポジトリの初期値はビルド時の `VITE_GITHUB_REPO`、ゲームからのリンクは `VITE_TUNER_URL`（どちらも `pages.yml` が与える）。
- `index.html`・`play.html` の入口と試遊ページへのリンクは相対パスで書く（開発サーバーと公開ページの両方で動かすため）。試遊ページではオンライン版を出さない。
- データの更新は進行中の対局に反映しない（ユーザー決定 2026-11-04）。部屋は作成時の `DATA_VERSION`（データ一式の FNV-1a）を記録し、版が違えば `assertDataVersion` が 410 で止める。版を持たない古い記録はそのまま続ける。

## オンライン版の約束事（段階5、ユーザー決定 2026-11-03）

- 自前の Node サーバー（`node:http` だけ、ライブラリなし）。通信はサーバーからの知らせが SSE、選択の送信が HTTP の POST。
- 入室はルームコード＋名前（アカウントなし）。席ごとに秘密の鍵を渡し、サーバーはハッシュだけを保存する。鍵が合わない席では操作できない。
- 再接続だけ認める。制限時間・観戦・途中離脱の処理は設けない（抜けた人の手番は戻るまで待つ）。部屋は「設定・シード・選択の列」として `ROOMS_DIR` に保存し、再起動後は再生で作り直す。
- サーバーが全体の状態を持ち、各席には `viewFor` で伏せた写しだけを送る（他の席の手札の内容、山札の順序と内容、未公開の襲撃カード、乱数とシードを伏せる、19-6-1）。
- 画面は同じ `Game` を使う。`GameController.seat` が席の番号ならオンライン版で、視点を自分の席に固定し、他の席の手番では選択肢も選べない理由も計算しない（`waitingModel`。伏せた手札では選択肢を組み立てられないため）。
- 選択は局面の版（`log.length`）を添えて送り、サーバーは古い局面からの送信を拒む。取り消しは直前の選択をした席だけができる。
- Supabase 版（ユーザー決定 2026-11-03）：ライブラリは使わない（`@supabase/supabase-js` を導入せず、fetch と WebSocket で話す）。対局の状態は Edge Function だけが持ち、テーブルは RLS でポリシーなし（画面の鍵からは読めない）。Broadcast には版の番号だけを載せ、局面は各席が鍵を添えて `view` で取りに行く。service role の鍵はリポジトリと画面に置かない。
- 画面の通信先は `detectTransport` が決める。ビルド時に `VITE_SUPABASE_URL`・`VITE_SUPABASE_ANON_KEY` があれば Supabase、無ければ同じオリジンの `/api/health` が応答すれば自前のサーバー、どちらも無ければローカル版だけ。
- 画面と Edge Function は同じエンジンで配置する（食い違うと画面の選択肢を関数が拒む）。`pages.yml` は設定があれば両方を配置する。

## データの約束事

- 地形：`water`（水場）・`mountain`（山岳）・`plains`（平原）・`forest`（森林）。
- 建物：`shop`（商店）・`workshop`（工房）・`fort`（砦）・`office`（役所）・`university`（大学）・`house`（住宅）・`camp`（飯場）。
- アクション：`pioneer`（開拓）・`build`（建築）・`import`（輸入）・`export`（輸出）・`drill`（教練）・`expedition`（遠征）・`welfare`（福祉）・`migration`（移住）・`research`（研究）・`spread`（普及）。段階は `normal`・`upper`・`top`。
- 建物数を添字とする表（例：`goldPerPointByShops`）は、添字0〜上限の「上限＋1」要素を持つ。
- 形状（計画都市・自然公園）はアキシャル座標 `(q, r)` の相対位置で書く。`r` は行番号（A＝0）、`q＝x − r/2`（x は decisions.md 2-1 の横位置）。6方向の隣接は `(±1,0)`・`(0,±1)`・`(1,−1)`・`(−1,1)`。
- `design/` 由来の JSON（characters・special_citizens・raid_cards）は原本の構造と文言のまま持ち、`provisional` だけを加える。襲撃カードには rules.md 第19章に基づく `clarifications` を加える。テストで原本との一致を確かめている。

## ヴァリアントルール（ユーザー決定）

- `GameConfig.variants`（`GameVariants`）に持つ。項目はすべて省略可で、省略は不採用とする（古い記録の再生と互換にするため）。
- スネークドラフト（`snakeDraft`、ユーザー決定 2026-11-06、スイーツランドの準備のドラフトに倣う）：準備のドラフトの順番を N…1、1…N、N…1 にする（標準は rules.md 2-6-7 の N…1 を3回）。順番は `draftPickOrder`（`src/game/draft.ts`）だけが決め、エンジンとドラフトの画面の両方がこれを使う。トップページとオンラインの「部屋を作る」で選ぶ。部屋の記録は `variants` を持ち（採用しないときは書かない）、対局の開始と記録の再生で同じ設定を使う（`configOf`）。

## ユーザー決定のうち design/ に未反映のもの

`design/` は変更しないため、ユーザーの回答（2026-11-03）は `src/data/` とコードのコメントに記録している。decisions.md への転記はユーザーが行う。

- ドラフトの候補は、3人・4人とも個人ボード5枚・キャラクター10人のすべて（`params.setupByPlayerCount.*.draft*Candidates`）。
- 文明カード 017：遠征報酬の獲得で目標値の宣言と軍事力トークンの消費を行わない。選べるのは現在の軍事レベル以下の報酬に限る。同じ報酬は重ねて取れず、異なる報酬を4つ得る。指揮官は指揮官の追加報酬（19-2-6）も選べる。
- 文明カード 018：自身をプレイしたときには引かない。
- 文明カード 032・040：2段目は通常ワーカー8人以上だけで満たす。
- 文明カード 034・042：撃退ライン・防衛ラインは 026 と同じく、そのラウンドまでの累積値。
- 建築（5-6-1）：種類と場所をすべて選んだ時点でコスト（飯場の軽減を含む）を確定して払う。開拓も同じく、配置をすべて選んだ時点で資材を確定する。
- 普及の上位・最上位の1金：1枚プレイするごとに即時に得て、続くカードのコストに使える。
- 遠征の最上位：報酬は合計5個まで（1〜5個）。
- 上位・最上位の福祉で得た臨時ワーカーは、同じ福祉の役所の変換に使えない。
- 通常ワーカーが上限のときの通常の移住は選べない。
- 開拓の枚数は空きマスの数まで。研究で手札が捨てる枚数に足りないときは、あるだけ捨てる。
- 3-2 の報告に対する承認（2026-11-03）：
  - インフラが上限・臨時ワーカーが上限・役所の変換もできないときの福祉は、何も実行しない選び方に当たり選べない（6-1-6）。
  - 軍事レベル12を超えた上昇の2点（6-3-5-6、7-1-5）は教練の上昇処理にだけ与える。砦の建設やボーナスタイル9による超過分は得点なしで破棄する。
  - 襲撃の宣言は手番順に1人ずつ公開で行い、宣言のたびに判定する。
  - 初期手札の文明カード3枚はドラフトの前に配る。

- 3-3 の設計に対する承認（2026-11-03）：命令セットは docs/effect-commands.md のとおり。得点の評価軸は、特別な市民カードを生活・福祉（17-4-3）、特別市民08 を自然・環境（17-5-2）、英雄を軍事・防衛（17-6-2-2）、他のキャラクターを「その他」（17-0-2）とする。特別市民11 が写せるのは10アクション×3段階に限る。学者の「3枚ごと」は無料プレイも数える。003 は資材の軽減（飯場・特別市民12・指揮官・官僚）を適用し、建築アクションの割引は適用しない。精霊使いの終了時得点は1枚を1回だけ数える。
- 3-3 の報告に対する承認（2026-11-03）：最初の手番開始時の効果（芸術家・聖女・デザイナー）は手番より前の処理とする。そこで得た特別な市民カードのフリーアクション・専用スペース、資源・臨時ワーカーはその手番から使える（9-3-3）。

## 既知の制約・落とし穴

- `scripts/` は Node 22 の `--experimental-strip-types` で直接実行する。そのため `src/` 内の import は拡張子 `.ts` を付ける（`allowImportingTsExtensions`）。`scripts/` から読む `src/` のモジュールは JSON を import しないこと（Node では import 属性が要るため）。
- `board_*.json` は `import.meta.glob` で読み込む。ボードを増やすときはファイルを置くだけでよい。
- JSX は Vite（esbuild）の automatic ランタイムで変換している。`@vitejs/plugin-react` は導入していない。
- 作業ブランチはセッションの指定により `claude/dazzling-hamilton-lebn9y` を用いている（指示書のブランチ名 `feat/data-layer` とは異なる）。
