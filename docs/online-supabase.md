# オンライン版（Supabase）の準備と仕組み

GitHub Pages に置いた画面から、Supabase を通してオンラインで遊ぶための手順と仕組みを記す（ユーザー決定 2026-11-03）。
自前のサーバー（`npm run server`）による遊び方も引き続き使える。

## 仕組み

| 部分 | 置き場所 | 役割 |
|---|---|---|
| 画面 | GitHub Pages（`dist/index.html`） | ビルド時の `VITE_SUPABASE_URL`・`VITE_SUPABASE_ANON_KEY` があればオンライン版の入口を出す |
| Edge Function `rooms` | Supabase（`supabase/functions/rooms`） | 部屋の作成・入室・局面の取得・選択・取り消し。ゲームのエンジンを含み、選択の合法性を判定する |
| テーブル `rooms` | Supabase の Postgres | 部屋の記録（設定・シード・選択の列）と局面の写し、版 |
| Realtime の Broadcast | Supabase | 部屋が更新されたことの知らせ（版の番号だけ） |

- 対局の状態は Edge Function だけが持つ。テーブルは RLS を有効にしてポリシーを作らないため、画面の鍵（anon / publishable）からは読めない。
- 各席は自分の鍵を添えて局面を取りに行き、伏せた写し（`viewFor`、rules.md 19-6-1）だけを受け取る。
- Broadcast には版の番号しか載せないため、公開のチャンネルでも秘密は漏れない。知らせが届かないときは画面が定期的に（2秒ごと、届いている間も15秒ごと）取りに行く。
- 同時の書き換えは版（`version`）で排他する。古い局面からの選択は拒む。
- service role の鍵は Edge Function の中にだけある（Supabase が自動で与える）。リポジトリや画面には置かない。
- ライブラリ（`@supabase/supabase-js`）は使わず、`fetch` と WebSocket で直接話す。

## 準備（初回だけ）

### 1. Supabase のプロジェクトを作る

1. https://supabase.com でプロジェクトを作る。
2. SQL Editor で `supabase/migrations/20261103000000_rooms.sql` の内容を実行し、`rooms` テーブルを作る。
3. Project Settings → API（または API Keys）で次の2つを控える。
   - Project URL（`https://<project-ref>.supabase.co`）。末尾に `/rest/v1/` が付いた URL が表示された場合も、画面のビルドがパスを捨てて読むためそのまま使える。
   - anon（または publishable）の鍵。公開してよい鍵である。**service_role（secret）の鍵は控えない・どこにも貼らない。**
4. Realtime の設定で、公開のチャンネル（public channels）を許可しておく（既定で許可されている）。

### 2. Edge Function を配置する

どちらかの方法で行う。

- GitHub Actions で配置する（推奨）：手順3で `SUPABASE_ACCESS_TOKEN` と `SUPABASE_PROJECT_REF` を設定すれば、main への push のたびに画面と同じエンジンで配置し直す。
- 手元から配置する：

```bash
npx --yes supabase@2.121.0 login
```

```bash
npm run supabase:deploy -- --project-ref <project-ref>
```

画面と関数のエンジンが食い違うと、画面が出す選択肢を関数が拒むことがある。ルールやデータを変えたら両方を配置し直すこと。

### 3. GitHub の設定

リポジトリの Settings で次を設定する。

- Pages → Build and deployment → Source を「GitHub Actions」にする。非公開のリポジトリで Pages を使うには有料のプランが要る。
- Secrets and variables → Actions
  - Variables：`SUPABASE_URL`（Project URL）、`SUPABASE_ANON_KEY`（anon / publishable の鍵）、`SUPABASE_PROJECT_REF`（Project URL の `<project-ref>` の部分）
  - Secrets：`SUPABASE_ACCESS_TOKEN`（Supabase のアカウントの Access Tokens で作る。関数の配置にだけ使う）

main に push すると `.github/workflows/pages.yml` が検査・ビルド・配置を行う。Actions の画面から手動でも実行できる。

## 遊び方

1. Pages の URL（`https://<user>.github.io/<repo>/`）を開く。
2. 名前を入れ、人数を選んで「作る」。表示されたルームコードを他のプレイヤーに伝える。
3. 他のプレイヤーは同じ URL を開き、名前とルームコードを入れて「入る」。全員がそろうと始まる。
4. ページを閉じても、同じブラウザなら「続きから」で同じ席に戻れる（席の鍵はブラウザに保存している）。

## 検査

- `npm test`：部屋の窓口（`src/online/service.ts`）と Edge Function の HTTP の窓口・保存先（`src/online/edge.ts`）の単体テスト。
- `npm run accept:supabase`：Supabase の模擬（`e2e/supabase-mock.ts`。本番と同じ `bundle.js` で要求を処理し、Realtime は最小の WebSocket で模擬する）に向けてビルドした画面で、3つのブラウザで1局を打ち切る。再接続と模擬の再起動を含む。
- 本物の Supabase との結合は、自動の検査では確かめていない。配置後に2つのブラウザで部屋を作って入り、手番が相手の画面に反映されることを確かめること。
