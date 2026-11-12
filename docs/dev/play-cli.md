# 対話プレイ用のコマンドの約束事

CLAUDE.md から分けた開発の手引きの一部である（2026-11-11、指示書 2026-11-11 8 の次の候補を実施）。CLAUDE.md の「作業ごとに読む文書」から引く。運用を変えたら更新する。

## 対話プレイ用のコマンドの約束事（指示書 2026-11-10）

- 出力の軽量化（指示書 2026-11-11、decisions.md 3-5）：既定の出力を短い形（`compact.ts`）にし、従来の全文（`render.ts` の `renderShow`・`renderSteps`）は `--full` のときだけ出す。`new` は全文、`--brief` は既定の形に吸収して何もしない。
  - `move` は出来事・自分の要約1行・次の選択肢（次の選択待ちが他の席なら「選択待ち：P1」）だけを出す（選択肢を除いて15行以内、テストで確かめる）。全局面は `show` で見る。
  - 対局中に変わらない文言（アクションボードの効果文・キャラクターの能力・ボーナスタイル・襲撃カード・建物・フリーアクション）は `ref` に分け、`show`・`wait` は ID と名前と数値だけを出す。アクションボードは置かれたスペースだけ。手札は1行ずつ（効果文は `show --only hand` か `ref --card`）。
  - 新しく公開・獲得したもの（特別な市民カード・計画都市・ボーナスタイル・手札に加わった文明カード・襲撃カード）は、その時点の出来事に1回だけ内容を出す。記録の側は `Step.reveal`（`revealOf`）、オンライン版は資格情報の `seen` との差（`revealSince`）で求める。
  - `--only <欄,...>`（progress・raid・actions・shared・self・hand・others・board・events・options）は指定した欄だけを、`--full` の該当する欄と同じ詳しい形で出す。知らない欄は使える名前を添えて失敗する。
  - 選択肢の畳み方は選択肢 ID の接頭辞と `targetOf` の種類だけで決める（`foldOptions`）：`free:<変換>:<カード>`、`card:`、`sc:`、`draft:<種類>:`、マスを対象にする選択肢は選択肢が8個を超えたら「種類:値:マス」（建設）は種類と値で、それ以外（土地タイル）はマスでまとめる。畳んだ行の `［接頭辞*］` と項目の先頭の語で ID が読め、`readFolded` で番号と ID の組に戻せる（テストで `getOptions` と一致を確かめる）。
  - `wait` の他の席の分は手番ごとに1行（`replayTurns`・`turnSummary`、記録の再生画面と共用）。自動の処理は視点の増減と共通の結果（ラウンド・襲撃・終了）だけ。オンライン版は選択と出来事の対応を持たないため `eventTurns` で区切る。
  - 選べないものの理由（ユーザー決定 2026-11-11、2026-11-11 の確認の対局の要望）：選択肢の欄の後に、選べないアクションスペース（行動を選ぶ場面、`queries.unavailableSpaces`、文は `explain`）・建物（建築の場面、`unavailableBuildings`・`unavailableBuildReasons`）・遠征の報酬（`expeditionPickNotes`・`expeditionNotes`）を理由ごとにまとめて出す。遠征の報酬の選択肢には、足したときに確定で払う軍事力トークンを添える（ラベルは変えず表示の側で足す）。判定は候補を作る処理（`buildCandidates`・`expeditionCanAdd`・`explain`）と同じ。`ref --only expedition` は遠征の報酬表（追加報酬を含む）と、視点の軍事レベルから届くか・払うトークンを出す。
  - 打ち手の作り直し：`wait --round R` は局面のラウンドが R より先なら番を待たずに終える（ドラフトと準備は第1ラウンド、`effectiveRound`）。`resume --seat N` は ref・局面・手札の効果文・その席の手番ごとのまとめ・得点の見込みを1回で出す。ノート（`.play/notes/P<席>.md`）はコマンドが読み書きしない。
  - 打ち手はリポジトリの外の作業ディレクトリで `node <リポジトリ>/dist-play/cli.js` を呼ぶ（リポジトリの CLAUDE.md を読み込ませないため。ただし同じセッションから起動した打ち手には CLAUDE.md が自動で入る。2026-11-11 に CLAUDE.md を約7KB に縮めた）。運用は `docs/playtest/README.md`。
- 1回の呼び出しで完結し、入力待ちを作らない。ルールを再実装せず、合法手は `getOptions`、進行は `applyMove`、得点は `finalScores`、派生値は `queries` だけから得る。足りない派生値は queries.ts に足す。
- 記録は JSON 1つ（既定 `.play/game.json`、`--file` で指定）で、`{ format, config, seed, moves, dataVersion }` を持つ。局面は常に `replay` 相当の再生で作り、GameState は保存しない。`dataVersion` は `DATA_VERSION` で、食い違えば警告し、再生に失敗したら「データが変わったため再生できない」で止める。
- `move` は選択肢 ID か直前の `show` の番号（1始まり、`getOptions` の順）を順に適用し、1つでも選べなければ記録を一切変えない。
- `undo` は分析用で、記録の末尾を取り除くだけである。ルール上の巻き戻し（第15章、チェックポイント）とは異なり、どこまでも戻せる。
- 非公開情報（19-6-1）：視点（`--as`、省略時は選択待ちのプレイヤー）以外の手札の内容と、山札の順序は出さない。選択肢は手札の内容を含むため、選択待ちのプレイヤーの視点でだけ出す。`--as all` はすべての手札を出すが山札の順序は出さない。`--json` も同じ規則で、GameState をそのまま出さない。プレイ済みのカードと捨て札（の番号）は公開である（オンライン版の `viewFor` と同じ）。
- 選択肢のラベル（`Option.label`）は、ラベルだけで何を選ぶ手か分かる文にする（払うもの・得るもの、アクション名・段階・ワーカー数、カードやマスの名前と内容）。内部の識別子を含めない（tests/play-cli.test.ts が乱択プレイアウトで確かめる）。識別子と並び順は変えない。
- `show` の既定の出力は個人ボードを除いて150行以内を目安とする（tests/play-cli.test.ts が確かめる）。
- 配布用ビルドとオンラインのビルドには含めない。
- オンライン版の部屋で打つ（ユーザー決定 2026-11-10、人と AI の対戦）：`online join|create|show|wait|move`。人がブラウザのオンライン版で作った部屋に、打ち手が席として入る。窓口は Supabase の Edge Function だけ（既定は公開ページの Project URL、`--url`・`PLAY_ONLINE_URL` で替える）。局面は窓口の `view` が返す伏せた写しだけを使い、選択肢はそれに `getOptions` を掛けて作る。席の鍵と、前回どこまで出来事を見たか（`seenEvents`）は資格情報ファイル（既定 `.play/online/<コード>-<席>.json`）に置く。部屋のデータの版が手元と違えば止める。窓口は1手ずつ受けるため、`move` に並べた途中で失敗するとそれより前の手は送られたままになる。

## 打ち手を強くする出力（指示書 2026-11-12、decisions.md 3-6）

- 得点の見込み：`src/game/projection.ts` の `projectedScores` が、局面の写しに終了の手順（`engine.ts` の `endedCopy`：残ったタスクを捨て、`gameEnd` のタスクをエンジンの既存の処理で進める＝最終の収入とゲーム終了時の能力）を掛け、`finalScores` で数える。元の局面（乱数の状態を含む）は変えない。終了時の能力が選択を伴うタスクを積んだら処理せずに止め、その出どころを `omitted` に返す（いまのデータには無い）。`score`・`resume`・`show --only self`・`--full` の自分の欄の見込みはこの値で、見出しは「いま終わったときの見込み（終了時の能力を含む）」。
- 手の下見：`move --dry-run <選択肢...> [--or <選択肢...>]`（`tools/play/preview.ts`）。記録を変えない。1通りは出来事・自分の増減の合計（`deltas.ts` の `snapshot` の差）・見込みの増減（評価軸ごと）・残る選択待ちの見出し、`--or` は最大4通りを増減と見込みだけで並べる。先を見せない規則：`history.ts` の `hiddenFuture`（乱数の消費か `revealCount` の変化。`isCheckpoint` の最初の2条件と同じ）に当たる選択の手前で止め、選択待ちが他の席に移ったら止める。`isCheckpoint` そのものは選択権の移動・手番の終了なども含み広すぎるため、先の情報の判定だけを分けた。
- 落とし穴の注意：`src/game/pitfalls.ts` の `PITFALL_RULES`（自然公園を崩す・撃退を選べる・役所の変換が出ない・残したままのパス・選ばずに済ませられない建設）。型ごとに対象の選択待ちと比べる値を持ち、選択肢を写しに適用して `queries` の値を前後で比べる。`hiddenFuture` に当たる選択肢は適用しない（最後の襲撃の宣言は、適用せずに公開中の襲撃カードの文を出す）。建設は確定（`done`）まで進めた写しで比べる。行は `ShowModel.prompt.warnings` に入れ、選択肢の欄の後（「選べない〜」の後）に5行まで出す（`--full` も同じ位置）。オンライン版も伏せた写しで同じ処理を通す。
- 狙い：`plan --seat N [--set <狙い,...> | --clear]`（`tools/play/plan.ts`）。置き場は記録と同じディレクトリの `plan-P<席>.json`（記録には入れない）。状態は `queries.spaceUsers`・`specialCitizenHolder`・`bonusTileHolder`・`plannedCityClaimers`・`plannedCityRemaining` だけから求める。`wait`・`move`・`resume` の出来事の後に、前回の出力から変わった狙いを3行まで出す。自分の手で変わった状態（自分が使った・獲得した）と、ラウンドが替わって「空いている」に戻ったスペースは知らせない（記録だけ更新する）。`resume` とラウンドの最初の `wait` には手番順と自分より先に打つ席を1行で出す（出したラウンドは同じファイルの `orderShown`）。オンライン版の `online` には `plan` を付けていない（資格情報ごとの置き場を決めていないため）。
- 序盤の定石：`docs/playtest/openings/<キャラクターの ID>.md`（1KB 以内）と `draft.md`。上限は `tests/play-strength.test.ts` が確かめる。

## 待ちと引き継ぎの縮小（指示書案 2026-11-13、`docs/dev/drafts/`。ユーザー決定 2026-11-12「この下書きの通りに進めて」）

- `wait` の既定（番が来たとき）は `compact.ts` の `waitOutput`：出来事（狙いの知らせを含む）・襲撃の行（ラウンドの最初の番だけ）・置かれたスペース・自分の要約1行・選択肢と注意。選べない理由は `unavailableFolded` で、前回の `wait` と同じなら「選べない N 件」の1行にする。襲撃の行を出したラウンドと選べない理由の署名は `plan-P<席>.json`（`raidShown`・`unavailable`）に持つ。`--state`・`--only`・`--json` は従来の局面全体。オンライン版は前回の内容を持たないため、襲撃の行と選べない理由を毎回出す。
- `resume` は第2ラウンド以降の既定を `resumeBrief`（局面・手札・自分のキャラクターの能力・自分と場の特別な市民カードと計画都市・手番順と狙い・見込み）にする。第1ラウンドと `--ref` は従来の全文（`resumeOutput`）。
- `move ... --seat N --then-wait [--round R] [--timeout 秒]`：適用後に選択待ちが他の席へ移ったら、`waitFor`（`wait` と共用）で番を待ち、「== 適用した選択」の後に `wait` の形を出す。`end`・`pass` は補わない。`online move --then-wait` も同じ。
- `wait` と `--then-wait` の既定の時間切れは 100 秒（`WAIT_TIMEOUT`）。打ち手の道具の上限（約120秒）より短くする。
- 検査は `tests/play-wait.test.ts`（`--then-wait` は `dist-play/cli.js` があるときだけ CLI を通して確かめる）。

