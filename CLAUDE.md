# CLAUDE.md — 都市開発ボードゲーム（仮）

Claude Code がこのリポジトリで作業するときの手引きである。いつも要ることだけをここに置き、領域ごとの約束事は `docs/dev/` に分けた（2026-11-11）。作業を始める前に、下の「作業ごとに読む文書」から該当するものを読むこと。運用を変えたら、該当する文書を更新する。

## 現在の段階

- 指示書：`design/指示書_2026-11-03_初期実装.md`、`design/指示書_2026-11-10_対話プレイ.md`、`design/指示書_2026-11-11_対話プレイ軽量化.md`、`design/指示書_2026-11-12_対話プレイ強化.md`
- 段階1〜5（データ層・ゲームロジック・効果・ローカル UI・オンライン化）とチューナー・チュートリアル・記録の再生・対話プレイ用のコマンドは完了し、main に取り込み済み。経過の全体は `docs/dev/progress.md`。
- 直近：
  - 完了：対話プレイ用のコマンド（`tools/play/`、`npm run play`、指示書 2026-11-10）。選択肢のラベルを名前と内容が分かる文に改めた（`src/game/labels.ts`）。調整案（2026-11-08）を正とする（ユーザー決定 2026-11-10）。
  - 完了：対話プレイの出力の軽量化（指示書 2026-11-11、decisions.md 3-5）。既定の出力を短い形にし、従来の全文は `--full`。取り込み後の確認（指示書 7）は 2026-11-11 に1局行った（`docs/playtest/2026-11-11/`）。得点はゲーム5〜7と同程度だが、読む量は約13%しか減らなかった（打ち手に CLAUDE.md が読み込まれていた・前回の打ち手は自分で出力を絞っていた）。
  - 完了：CLAUDE.md の分割（2026-11-11）。この文書を索引に縮め、領域ごとの約束事を `docs/dev/` に移した。
  - 完了：`wait`・`resume` の既定の出力の縮小と `move --then-wait`（指示書案 2026-11-13、`docs/dev/drafts/`。AI 同士の対局3局・45人の効率化の方法の上位3案。ユーザー決定 2026-11-12）。`design/` への配置と decisions.md の項はユーザーの側で行う。
  - 完了：対話プレイの打ち手を強くする出力（指示書 2026-11-12、decisions.md 3-6）。見込みに終了時の能力を含める（`projectedScores`）、`move --dry-run`（`--or`）、落とし穴の注意（`src/game/pitfalls.ts`）、狙い（`plan`）、序盤の定石（`docs/playtest/openings/`）。取り込み後の確認（指示書 7）は 2026-11-12 に1局行った（`docs/playtest/2026-11-12/`、ゲーム9）。キャッシュの読み込み・作成・出力はゲーム8を下回ったが、CLAUDE.md の縮小とデータの調整の効果と分けられない。道具の呼び出しは P2 だけ上回った。

## 作業ごとに読む文書

| 作業 | 読む文書 |
|---|---|
| どのファイルが何をするかを調べる | `docs/dev/structure.md`（構成の表） |
| ゲームロジック（`src/game/`）を変える | `docs/dev/game-logic.md`、`docs/dev/rules-and-data.md` |
| ルール・得点・数値・カードの効果に関わる | `docs/dev/rules-and-data.md`（rules.md からの変更とユーザー決定。必ず読む）、`docs/effect-commands.md` |
| 画面（`src/ui/`）・チュートリアル・記録の再生を変える | `docs/dev/ui.md`、アイコンは `docs/styleguide-icons.md` |
| 対話プレイ用のコマンド（`tools/play/`）を変える・対局を回す | `docs/dev/play-cli.md`、`docs/playtest/README.md` |
| チューナー（`tools/tuner/`）を変える | `docs/dev/tuner.md`、`docs/tuner-pages.md` |
| オンライン版（`server/`・`src/online/`・`supabase/`）を変える | `docs/dev/online.md`、`docs/online-supabase.md` |
| 文明カードの取り込み・識別子の対応 | `docs/civ-cards-xlsx.md` |
| テストを書く・データの形を変える・公開の検査を変える | `docs/dev/testing.md` |
| これまでの経過を知る | `docs/dev/progress.md` |

## コマンド

```bash
npm install
npm run typecheck     # tsc --noEmit
npm test              # vitest run（固定したデータ tests/fixtures/data/ で行う。いまの src/data/ は tests/live-data.test.ts が確かめる）
npm run test:live     # いまの src/data/ で全テスト（調整で食い違ったテストを知るため。公開は止めない）
npm run test:pin      # tests/fixtures/data/ をいまの src/data/ の写しで取り直す（データの形を変えたとき）
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
npm run play:build    # 対話プレイ用のコマンドを dist-play/cli.js にビルドする
npm run -s play -- <コマンド>  # 対話プレイ（new・show・move〔--dry-run・--or で下見、--then-wait で番待ち〕・wait・ref・resume・plan・undo・log・score・online、--help で一覧）。ビルドはしない
npm run -s play:measure -- --file <記録>  # 席ごとの出力量（従来の全文と既定の形）を数える
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
- 単体テストは固定したデータ（`tests/fixtures/data/`）で行う（ユーザー決定 2026-11-11）。`src/data/` のデータの形を変えたら（項目を足す・名前を変えるなど）、`npm run test:pin` で写しを取り直してからテストを直す。詳しくは `docs/dev/testing.md`。

## 既知の制約・落とし穴

- `scripts/` は Node 22 の `--experimental-strip-types` で直接実行する。そのため `src/` 内の import は拡張子 `.ts` を付ける（`allowImportingTsExtensions`）。`scripts/` から読む `src/` のモジュールは JSON を import しないこと（Node では import 属性が要るため）。
- `board_*.json` は `import.meta.glob` で読み込む。ボードを増やすときはファイルを置くだけでよい。
- JSX は Vite（esbuild）の automatic ランタイムで変換している。`@vitejs/plugin-react` は導入していない。
- 作業ブランチはセッションの指定に従う（指示書に書かれたブランチ名と異なることがある）。
