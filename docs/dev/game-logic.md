# ゲームロジックの約束事

CLAUDE.md から分けた開発の手引きの一部である（2026-11-11、指示書 2026-11-11 8 の次の候補を実施）。CLAUDE.md の「作業ごとに読む文書」から引く。運用を変えたら更新する。

## ゲームロジックの約束事

- 選択待ちモデル：`GameState.stack` の最上段が現在のタスクである。自動タスク（`roundStart`・`income`・`nextTurn` など）は `advance` が処理し、選択タスクは `applyMove(state, optionId)` を待つ。選択肢のない選択タスクは不発として取り除く（16-2-5、16-2-6、4-4-5）。
- `applyMove` は状態を `structuredClone` した写しを変更して返す。元の状態は変更しない。
- 選択肢の識別子は `act:<action>:<tier>`・`pass`・`end`・`free:<id>[:<card>]`・`temp:<n>`・`count:<n>`・`tile:<cell>:<terrain>`・`build:<building>:<cell>`・`done`・`reward:<i>`・`convert:<0|1>`・`card:<id>`・`sc:<id>`・`order:<i>`・`bonus:<n>`・`raid:<none|defense|repel|skip>`・`draft:<board|bonus|character>:<id>` である。
- 資源を得るだけの効果は `processEffects` が尋ねずに処理し、選択を伴う効果（土地タイル・建設の権利・無料建設・特別な市民カード・捨て札）はタスクにする。2つ以上あれば `chooseOrder` で順番を尋ねる（decisions.md 3-4）。
- 「〜した時」の効果（16-1-4）は、`emit` が記録する1単位ごとの出来事に反応させる（`effects.ts` の `react`）。
- 文明カードの正は、文明カード一覧（120枚）.xlsx に合わせた `cards_civilization.json` である（ユーザー決定 2026-11-06）。識別子は一覧の番号と一致しない（対応は `docs/civ-cards-xlsx.md`）。`npm run import:design` は文明カードを取り込まない（`design/文明カード一覧_sample.md` は古い版のため）。
- 効果スクリプトの正は `src/data/` の JSON である（チューナーで編集し書き戻す）。`npm run import:design` は `design/` 由来の文言だけを更新し、効果スクリプトは既存の値を保つ。`scripts/effect-scripts.ts` は値がないときの初期値としてだけ使う。
- 軍事力トークンの支払いは `payMilitaryTokens`（core.ts）、払えるかの判定は `tokenBudget` を使う。傭兵団の「金に替える数」（`tokenSwap`、選択肢 `count:<k>`）は `applyMove` が支払いの直後に最上段へ移す。
- アクションを始めると、その下に自動タスク `actionEnd` を積む。アクションの処理（途中で起きた効果を含む）をすべて終えると `actionFinished` の出来事を起こし、その間に建てた建物を渡す（発明王・注文住宅・開拓小屋）。命令 `later` は自動タスク `later` として、同じ効果の選択タスクより下に積む（繁栄）。
- 文明カードの上の住宅（移動住宅）は `PlayerState.cardHouses`（出どころ `civ:<カード>` ごとの数）に持ち、`buildingCount` に数える。盤面のマスを見る処理（計画都市・自然公園・`buildingCells`）には数えない。画面はプレイ済みのカードの右下に住宅の駒を重ね（`.card-houses`）、個人の情報の建物の吹き出しに盤面とカードの上の内訳を出す（`housesOnCard`・`buildingBreakdown`、queries.ts）。
- タスクをスタックから取り除くときは `removeTask(state, task)` を使う。処理中に常時効果が上にタスクを積むため、`pop()` では誤って別のタスクを取り除く。
- 能力の識別子は「出どころ#添字」（例：`sc:09#0`、`char:merchant#1`）。選択肢は `ability:<識別子>`（フリーアクション）・`space:<識別子>`（専用スペース）・`plan:<id>`（計画都市の宣言）・`choose:<i>`・`copy:<action>:<tier>`・`spirit:<terrain>:<cell>`・`hero:<cell>`。
- 骨格のテストは `withoutCharacters` でキャラクターを外して局面を作る。キャラクターの効果がテストに混ざらないようにするためである。
- 得点は `addScore` で得点トラックに加え、評価軸を付けた `score` 出来事を残す（17-0-3）。評価軸の指定がない得点は `other`（17-0-2）。
- 手番の最初へ戻す（ユーザー決定 2026-11-08）：`undoToTurnStart`（history.ts）は直前のチェックポイントの直後まで再生し直す。カードを引いた・特別な市民カードを獲得した選択はチェックポイントのため、その直後までしか戻らない。オンライン版は `undo` に `toTurnStart` を添え、戻す選択がすべてその席のものに限る（`undoInRoom`）。画面は上部の「手番の最初へ」（`data-ui="undo-turn"`、`GameController.undoTurn`、チュートリアルでは出さない）。
- 巻き戻しは記録（`state.log`）の再生で行う。テストで局面を直接書き換えた状態は再生できないため、巻き戻しのテストは実際の選択だけで組み立てる。
- 乱択プレイアウトの性質テスト（3人・4人で各100局）は約30秒かかる。判定は `src/game/selfplay.ts` にあり、チューナーの保存前の検査と共用する。
