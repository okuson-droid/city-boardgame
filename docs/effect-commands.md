# 効果の命令セット 設計方針（案）

作成日：2026-11-03
状態：承認済み（2026-11-03）。実装は `src/data/script.ts`（型と検査）、`scripts/effect-scripts.ts`（各カードのスクリプト）、`src/game/effects.ts`・`src/game/effect-tasks.ts`（実行）、`src/game/icons.ts`（アイコンと補足の文章）
準拠するルール：rules.md v0.8

## 0. 方針

- 効果は「能力（いつ発動するか）」と「命令（何をするか）」の2層で書く。カードごとに個別のコードは書かない。
- 命令は文明カード 001〜042、特別な市民カード 01〜20、キャラクター10種、計画都市の恩恵、マスボーナスを書ける最小の集合とする。
- 効果スクリプトはデータ（JSON）に置く。チューナーは命令と引数の単位で編集する。
- 既存の `Grant`（遠征・到達報酬・マスボーナス・計画都市の恩恵）は `gain` 命令の特別な場合として吸収する。
- 文言の原本（`text`）は残し、スクリプトは `script` として並べて持つ。原本とスクリプトの対応は単体テストで確かめる。

## 1. 能力（発動の型）

| 能力 | 引数 | 意味 | 使う箇所 |
|---|---|---|---|
| `onPlay` | `do` | 文明カードをプレイしたとき | 文明カード全般 |
| `onAcquire` | `do` | 特別な市民カードを獲得したとき | 特別市民13・14・19・20 |
| `setup` | `do` | 準備の終わり（追加初期資源） | キャラクターの追加初期資源 |
| `firstTurnStart` | `do` | 自分の最初の手番の開始時 | 芸術家・聖女・デザイナー |
| `on` | `event`、`filter`、`do`、`every?`、`once?` | 出来事への反応（常時効果、16-1-4 の1単位ごと） | 018、特別市民01〜03、英雄・指揮官・資本家・学者・芸術家・聖女・官僚 |
| `freeAction` | `pay?`、`require?`、`limit`（`oncePerRound`）、`do` | フリーアクション | 特別市民15〜18、豪商、官僚、精霊使い |
| `actionSpace` | `workers`、`do` | 持ち主専用の占有型スペース（6-2-4、6-2-5） | 特別市民09・10・11・14 |
| `gameEnd` | `do` | 17-0-1 手順4（ゲーム終了時判定の処理） | 資本家、特別市民05〜07 |
| `modifier` | 下表 | 計算への継続的な補正 | 下表 |

`modifier` の種類：

| 種類 | 引数 | 使う箇所 |
|---|---|---|
| `buildCost` | `building`、`materials`（負の数で軽減） | 特別市民12、指揮官、官僚 |
| `pioneerMismatchExtra` | `value` | デザイナー（0にする） |
| `regularWorkersImmediate` | なし | 特別市民13 |
| `goldPointsMultiplier` | `value` | 特別市民04 |
| `natureParkPoints` | `table`（枚数→得点） | 特別市民08 |
| `expeditionRewards` | `add`（レベルと報酬） | 指揮官（19-2-6） |
| `noBuildOnSpiritLand` | なし | 精霊使い |

## 2. 命令

| 命令 | 引数 | 意味 |
|---|---|---|
| `gain` | `res`、`amount`、`axis?` | 資源・生産力・得点・カードを得る。`res` は gold・materials・militaryTokens・tempWorkers・regularWorkers・goldProduction・materialProduction・drawCivCards・specialCitizen・points |
| `raise` | `track`（military・infra）、`amount` | トラックを上げる（到達報酬を含む）。`amount` は数値か「指標 n につき m」（2026-11-06 追加） |
| `placeTiles` | `count`、`tile`（`match`・`any`・地形名） | 土地タイルを置く。資材は払わない（19-1-1） |
| `build` | `max`、`buildings?`、`terrain?`、`payGold`、`payMaterials` | 建物を建てる。001・09（無料1軒）、003（金なし3軒まで）、特別市民13（住宅2軒まで無料）、建設の権利、軍事レベル12 を表す |
| `playCard` | `count`、`free`、`upTo?` | 文明カードをプレイする（特別市民10、芸術家）。`upTo` が真なら「プレイを終える」を選べる（2026-11-06 追加） |
| `expeditionRewards` | `count`、`distinct`、`payTokens` | 遠征の報酬を得る（017） |
| `chooseOne` | `options`（命令の列の列） | いずれか1つを選ぶ（学者） |
| `if` | `cond`、`then` | 条件を満たせば実行する（027〜042）。各条件は個別に判定する（9-2-7） |
| `copyAction` | なし | 任意のアクションスペースの効果を使う（特別市民11、19-2-11） |
| `drawPlannedCity` | `count` | 専用の計画都市カードを引く（デザイナー、19-5-3） |
| `spiritPlace` | なし | 精霊チップと土地タイルを置く（精霊使い、19-5-7） |
| `heroStart` | なし | 英雄の初期配置（19-5-1） |

`amount` は数値か、`{ count: 指標, per: n, times: m }`（指標 n につき m）とする。019〜026・特別市民05〜07・16・18・資本家の終了時効果に使う。

`cond` は `{ left: 指標, op: '>=' | '<', right: 数値または指標 }` とする。034・042 は右辺に撃退ライン・防衛ラインの指標を置く。

指標の一覧：regularWorkers、tempWorkers、landTiles、freeLandTiles、buildings、buildingsOfType:建物、buildingsOnTerrain:地形、maxedBuildingTypes、houses、militaryLevel、infraLevel、militaryTokens、goldProduction、materialProduction、repelLine、defenseLine、repelShortfall（撃退ライン−軍事レベル、0未満は0）、playedCivCards、buildingTypes（建設済みの建物の種類の数）、freeLandTerrains（建物のない土地タイルの地形の種類の数）。後の2つは 2026-11-06 に追加した（docs/civ-cards-xlsx.md）。

`on` の出来事と絞り込み：

| 出来事 | 絞り込み | 使う箇所 |
|---|---|---|
| `tilePlaced` | `terrain` | 特別市民01（森林）、資本家（山岳） |
| `cardPlayed` | `tag?`、`excludeSelf?` | 018（学術、自身を除く）、特別市民03、芸術家、学者（`every: 3`） |
| `actionExecuted` | `tier`、`action` | 特別市民02（最上位、特別市民11の写しを含む）、開発サイクル（研究、2026-11-06 追加） |
| `built` | `building` | 指揮官（砦）、官僚（役所） |
| `workerGained` | `kind` | 聖女（通常、上限超過の破棄分は数えない 16-1-5） |
| `raid` | `result` | 英雄（撃退成功） |
| `threshold` | `cond` | 聖女（通常ワーカー10人、`once`） |

## 3. 書き方の例

```json
{ "id": "027", "script": [{ "ability": "onPlay", "do": [
  { "op": "if", "cond": { "left": "militaryLevel", "op": ">=", "right": 3 }, "then": [{ "op": "gain", "res": "materials", "amount": 3 }] },
  { "op": "if", "cond": { "left": "militaryLevel", "op": ">=", "right": 6 }, "then": [{ "op": "gain", "res": "materials", "amount": 2 }] }
]}]}
```

```json
{ "id": "01", "script": [{ "ability": "on", "event": "tilePlaced", "filter": { "terrain": "forest" },
  "do": [{ "op": "gain", "res": "points", "amount": 2, "axis": "welfare" }] }] }
```

## 4. アイコンの対応表（`src/data/icon_keys.json`）

- 命令（`gain` は資源ごと）、能力、指標、建物、地形、トラック、ワーカー、カード、得点にアイコンの識別子を対応づける。
- `src/game/` から `iconSequence(script)` を公開し、効果スクリプトを「アイコンと数字の並び」（`{ icon, value?, modifier? }` の配列）に変換する。
- 補足表示の文章は `describeScript(script)` で効果スクリプトから組み立てる。カードごとに文章を手で書かない。

## 5. データの置き場

- 文明カード：`cards_civilization.json` の各カードに `script` を加える。
- 特別な市民カード・キャラクター：原本の文言と構造を保つため、`script` は取り込みスクリプト（`scripts/import-design.ts`）で加える。原本との一致テストは `script` を除いて比べる。
- 計画都市の恩恵とマスボーナスは既存の `Grant` のまま持ち、実行時に `gain` 命令として扱う。

## 6. 計画都市・自然公園

- 計画都市（第13章）：達成宣言を手番の選択肢 `plan:<id>` として出す（12-0-6、19-4-7）。判定は、形状を回転した配置（鏡像は除く）のどれかが盤面の建物と一致すること（19-1-6）。先着順位は7・5・3点で、宣言できるのは人数−1人まで（13-3-4、13-3-5）。
- デザイナー専用カード：共通の山札から2枚を引いて公開し、デザイナーだけが宣言できる。得点は7点（19-5-3）。
- 自然公園（第14章）：ゲーム終了時に、建物のない土地のうち得点が最大になるセットの割り当てを探す（14-3、19-1-5、19-4-8）。
