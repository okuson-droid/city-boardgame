# CLAUDE.md — 都市開発ボードゲーム（仮）

Claude Code がこのリポジトリで作業するときの手引きである。運用を変えたら更新する。

## 現在の段階

- 指示書：`design/指示書_2026-11-03_初期実装.md`
- 完了：3-1 データ層（`src/data/`、`src/game/board.ts`）。main に取り込み済み。
- 完了：3-2 ゲームロジックの骨格（`src/game/`）。main に取り込み済み。
- 作業中：3-3 効果。命令セットの設計方針を報告し、ユーザーの承認を待っている。

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
| `src/game/index.ts` | `src/game/` の公開窓口 |
| `src/ui/` | 画面。現在はデータ層の確認ページのみ |
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
- 「〜した時」の効果（16-1-4）は、`emit` が記録する1単位ごとの出来事に `registerReactor` で反応させる。段階2では反応は空である。
- 得点は `addScore` で得点トラックに加え、評価軸を付けた `score` 出来事を残す（17-0-3）。評価軸の指定がない得点は `other`（17-0-2）。
- 巻き戻しは記録（`state.log`）の再生で行う。テストで局面を直接書き換えた状態は再生できないため、巻き戻しのテストは実際の選択だけで組み立てる。
- 乱択プレイアウトの性質テスト（3人・4人で各100局）は約30秒かかる。

## データの約束事

- 地形：`water`（水場）・`mountain`（山岳）・`plains`（平原）・`forest`（森林）。
- 建物：`shop`（商店）・`workshop`（工房）・`fort`（砦）・`office`（役所）・`university`（大学）・`house`（住宅）・`camp`（飯場）。
- アクション：`pioneer`（開拓）・`build`（建築）・`import`（輸入）・`export`（輸出）・`drill`（教練）・`expedition`（遠征）・`welfare`（福祉）・`migration`（移住）・`research`（研究）・`spread`（普及）。段階は `normal`・`upper`・`top`。
- 建物数を添字とする表（例：`goldPerPointByShops`）は、添字0〜上限の「上限＋1」要素を持つ。
- 形状（計画都市・自然公園）はアキシャル座標 `(q, r)` の相対位置で書く。`r` は行番号（A＝0）、`q＝x − r/2`（x は decisions.md 2-1 の横位置）。6方向の隣接は `(±1,0)`・`(0,±1)`・`(1,−1)`・`(−1,1)`。
- `design/` 由来の JSON（characters・special_citizens・raid_cards）は原本の構造と文言のまま持ち、`provisional` だけを加える。襲撃カードには rules.md 第19章に基づく `clarifications` を加える。テストで原本との一致を確かめている。

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

## 既知の制約・落とし穴

- `scripts/` は Node 22 の `--experimental-strip-types` で直接実行する。そのため `src/` 内の import は拡張子 `.ts` を付ける（`allowImportingTsExtensions`）。`scripts/` から読む `src/` のモジュールは JSON を import しないこと（Node では import 属性が要るため）。
- `board_*.json` は `import.meta.glob` で読み込む。ボードを増やすときはファイルを置くだけでよい。
- JSX は Vite（esbuild）の automatic ランタイムで変換している。`@vitejs/plugin-react` は導入していない。
- 作業ブランチはセッションの指定により `claude/dazzling-hamilton-lebn9y` を用いている（指示書のブランチ名 `feat/data-layer` とは異なる）。
