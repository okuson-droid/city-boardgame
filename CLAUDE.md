# CLAUDE.md — 都市開発ボードゲーム（仮）

Claude Code がこのリポジトリで作業するときの手引きである。運用を変えたら更新する。

## 現在の段階

- 指示書：`design/指示書_2026-11-03_初期実装.md`
- 完了：3-1 データ層（`src/data/`、`src/game/board.ts`）
- 次：3-2 ゲームロジックの骨格（ユーザーの確認後に着手する）

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
| `src/ui/` | 画面。現在はデータ層の確認ページのみ |
| `scripts/import-design.ts` | `design/` から characters・special_citizens・raid_cards・cards_civilization を取り込む |
| `scripts/generate-boards.ts` | 仮置きの個人ボードをシード付きで生成する |
| `tests/` | Vitest の単体テスト |

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

## データの約束事

- 地形：`water`（水場）・`mountain`（山岳）・`plains`（平原）・`forest`（森林）。
- 建物：`shop`（商店）・`workshop`（工房）・`fort`（砦）・`office`（役所）・`university`（大学）・`house`（住宅）・`camp`（飯場）。
- アクション：`pioneer`（開拓）・`build`（建築）・`import`（輸入）・`export`（輸出）・`drill`（教練）・`expedition`（遠征）・`welfare`（福祉）・`migration`（移住）・`research`（研究）・`spread`（普及）。段階は `normal`・`upper`・`top`。
- 建物数を添字とする表（例：`goldPerPointByShops`）は、添字0〜上限の「上限＋1」要素を持つ。
- 形状（計画都市・自然公園）はアキシャル座標 `(q, r)` の相対位置で書く。`r` は行番号（A＝0）、`q＝x − r/2`（x は decisions.md 2-1 の横位置）。6方向の隣接は `(±1,0)`・`(0,±1)`・`(1,−1)`・`(−1,1)`。
- `design/` 由来の JSON（characters・special_citizens・raid_cards）は原本の構造と文言のまま持ち、`provisional` だけを加える。襲撃カードには rules.md 第19章に基づく `clarifications` を加える。テストで原本との一致を確かめている。

## 既知の制約・落とし穴

- `scripts/` は Node 22 の `--experimental-strip-types` で直接実行する。そのため `src/` 内の import は拡張子 `.ts` を付ける（`allowImportingTsExtensions`）。`scripts/` から読む `src/` のモジュールは JSON を import しないこと（Node では import 属性が要るため）。
- `board_*.json` は `import.meta.glob` で読み込む。ボードを増やすときはファイルを置くだけでよい。
- JSX は Vite（esbuild）の automatic ランタイムで変換している。`@vitejs/plugin-react` は導入していない。
- 作業ブランチはセッションの指定により `claude/dazzling-hamilton-lebn9y` を用いている（指示書のブランチ名 `feat/data-layer` とは異なる）。
