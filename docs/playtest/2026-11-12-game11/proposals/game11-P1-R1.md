# P1 R1 効率化の提案
## 無駄
- 最初の resume が全文、直後の wait も局面を再掲。move の後の wait で選択肢が2回出た
- 精霊チップの決まり（地形ごと1枚・隣だけ）が ref になく、下見と失敗で4回呼び、山岳チップを弱い E2 に使った
- dry-run が残る選択待ちの名前しか出さず、開拓の費用を知るのに実行が要った
- end を付け忘れて wait が1回無駄
## 変更案
1. dry-run の末尾に残る選択肢と費用を出す
2. openings/spirit_caller.md にチップの決まり、knowledge に「開拓1枚資材2・手番は end・パス時タイルは必ず替える」
3. wait の既定を events,options だけにする
## 自分
- `move … end; wait --only events,options` を1回にまとめる
- 占有型は解放した次の手番で取る
