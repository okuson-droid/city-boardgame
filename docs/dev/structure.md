# 構成

CLAUDE.md から分けた開発の手引きの一部である（2026-11-11、指示書 2026-11-11 8 の次の候補を実施）。CLAUDE.md の「作業ごとに読む文書」から引く。運用を変えたら更新する。

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
| `src/game/reference.ts` | 早見表と吹き出しの説明（建物の効果のまとめ・遠征の報酬表・得るものの文・解放条件の文）。params.json から組み立てる |
| `src/ui/QuickRef.tsx` | 早見表（上部の「早見表」から開く、タブで引く） |
| `tools/tuner/ShapeEditor.tsx` | チューナーの計画都市・自然公園の形の編集（六角形のマス目を押してマスを足し、地形・建物を選ぶ。60度回す） |
| `tools/tuner/CardPreview.tsx` | チューナーのカードのプレビュー（ゲーム画面と同じ面。文明カードは名前・コスト・分類・得点を面の上で直せる） |
| `src/ui/Catalog.tsx` | 一覧（カード・キャラクター・ボード）。トップページから開く |
| `src/ui/DraftScreen.tsx` | ドラフトの専用画面（選ぶ順番の帯・選んだもののまとめ・種類ごとのタブ・個人ボードの地図 `BoardMap`・キャラクターの文言） |
| `src/ui/Online.tsx` | オンライン版の入口（部屋を作る・入る・続きから）と対局画面 |
| `server/main.ts` | オンライン版のサーバー（node:http だけ、SSE＋HTTP）。`server/vite.config.ts` で `dist-server/main.js` にまとめる |
| `tools/play/` | 対話プレイ用のコマンド。`record.ts`（記録の再生・選択の適用・取り消し、ファイルの読み書き）、`online.ts`（オンライン版の部屋に席として入って打つ）、`compact.ts`（既定の短い出力・選択肢の畳み方・`ref`・`resume`・手番ごとのまとめ）、`measure.ts`（出力量の計測）、`render.ts`（局面・選択肢・出来事・得点の文字化と `--json` の模型）、`cli.ts`（引数と入出力だけ）、`vite.config.ts`（`dist-play/cli.js` へのビルド） |
| `src/game/replay.ts` | 対局の記録（リプレイ）の形 `ReplayRecord`（`{ format, config, seed, moves, dataVersion }`）、検査 `parseReplay`、作成 `replayRecordOf`、再生 `replayTo`・`replayPrefix`。対話プレイの記録・画面の保存と再生・オンライン版の `replay` が同じ形を使う |
| `src/ui/Replay.tsx`・`replay-file.ts` | 記録の再生画面（1手ずつ・手番ずつ進め・戻す、自動で進める、手数へ飛ぶ、視点の固定、この手番の行動、この局面から遊ぶ）と、ファイルの保存・読み込み |
| `src/game/narrate.ts` | `eventText`：出来事（GameEvent）を文にする。手番ごとのまとめ `turnDelta`・`deltaText`・`turnSummary` と、出来事の列だけからの手番の区切り `eventTurns`（オンライン版の写しのため）。対話プレイのコマンドと記録の再生画面が共用する |
| `CLAUDE.md`・`docs/dev/` | 開発の手引き。CLAUDE.md はいつも要ることと「作業ごとに読む文書」の索引だけを持ち、領域ごとの約束事は `docs/dev/`（`progress.md` 経過・`structure.md` 構成・`game-logic.md`・`rules-and-data.md`・`ui.md`・`play-cli.md`・`tuner.md`・`online.md`）に置く |
| `docs/playtest/` | 対局の回し方（`README.md`）、打ち手への指示（`player-brief.md`）と知見の要約（`knowledge-play.md`）、日付ごとの記録（`<日付>/replays/*.json`）と経緯の知見 |
| `src/game/labels.ts` | 選択肢のラベルと文字表示のための名前・説明（内部の識別子を出さない。効果文は効果スクリプトから組み立てる） |
| `tools/tuner/labels.ts` | チューナーの画面に出す項目名・選択肢の日本語 |
| `tools/tuner/github.ts` | 公開ページのチューナーの GitHub への保存（Git Data API で1つの commit、保存先の最新に変更点を適用し直す） |
| `tools/tuner/vite.pages.config.ts` | 公開ページ用のチューナーのビルド（`dist/tuner/index.html`・`play.html`） |
| `tools/tuner/` | チューナー。`proposal.ts`（調整案の作成・差分・適用・保存と読み込み・検査・Markdown）、`TunerApp.tsx`（画面）、`JsonEditor.tsx`（汎用フォーム）、`ScriptEditor.tsx`（効果を命令と引数の単位で編集）、`BoardEditor.tsx`（個人ボード）、`vite.config.ts`（開発サーバーと書き戻しの口）、`play.html`（試遊） |
| `scripts/import-design.ts` | `design/` から characters・special_citizens・raid_cards・cards_civilization を取り込む |
| `scripts/generate-boards.ts` | 仮置きの個人ボードをシード付きで生成する |
| `tests/` | Vitest の単体テスト。`tests/helpers/` に局面づくりと乱択プレイアウトの補助 |
