# テストのデータと公開の検査

チューナーから保存したデータで GitHub Pages の公開が止まった件（2026-11-09、テストが調整前のデータの値を決め打ちしていた）の再発防止として、ユーザー決定 2026-11-11 で次のように分けた。

## 単体テストは固定したデータで行う（再発防止の A）

- 単体テストは `tests/fixtures/data/` の写しを読む。`vite.config.ts` の `pinnedTestData` が、Vitest の中だけ `src/data/` のゲームデータの JSON の代わりに同じ名前の写しを返す（`icon_keys.json` は写さない）。チューナーで `src/data/` を調整しても、単体テストの結果は変わらない。
- いまの `src/data/` は `tests/live-data.test.ts` が確かめる（型と整合の検査、3人・4人の自動対戦 各30局）。どの値でも成り立つべきことだけを確かめ、特定のカードの値は決め打ちしない。
- ゲームの仕組みとデータの形を同時に変えるとき（項目を足す・名前を変えるなど）は、`src/data/` を直したあと `npm run test:pin` で写しを取り直し、テストを直してから commit する。データの形を変えたのに取り直さないと、単体テストが古い形のデータを読む。
- `TEST_DATA=live`（`npm run test:live`）では写しを使わず、いまのデータで全テストを走らせる。

## 公開を止める検査を絞る（再発防止の B）

- `pages.yml` は `npm run typecheck` と `npm test` で公開を止める。
- `npm run test:live` は公開を止めない段で走らせ、落ちれば警告（「いまのデータで落ちるテストがある」）を出す。調整でカードの効果が変わり、決め打ちしたテストと食い違ったことを知らせるためである。落ちたテストは新しい効果に合わせて直すか、`npm run test:pin` で写しを取り直す。

## チューナーは保存の前に自動対戦で確かめる（再発防止の C）

- GitHub への保存と書き出しの前に、型検査・整合検査に加えて自動対戦（`SELF_PLAY_GAMES`＝10局、`selfPlayFiles`、tools/tuner/proposal.ts）で確かめ、処理が止まる・終局しない・不変条件が破れるなどの問題があれば止める。「検査」の欄の「自動対戦で確かめる」でも行える。
- 自動対戦は `src/game/selfplay.ts`（`playout`・`checkInvariants`・`selfPlayGame`・`selfPlayCheck`）にまとめ、性質テスト（`tests/property.test.ts`）・`tests/live-data.test.ts`・チューナーが共用する。
