# P2 R1 効率化
## 無駄
- move の後に毎回 show --only options（約15回）。options は同じ内容が2回出る
- wait の既定が毎手番、局面全体と「選べない」を出す（約3KB）
- 開拓のコストが ref に無く打って知った。temp:0 で1回失敗
## 変更案
1. move の末尾に次の選択肢を1回だけ出す
2. wait の既定を出来事・狙い・資源1行・選択肢に絞る
3. ref に土地タイルのコスト、通常の再使用可、得たワーカーは当ラウンド不可を書く
## 自分
- wait に --only progress,options
- 行動から end まで1回の move、未知の段だけ --dry-run
