# P2 R1 効率化
## 無駄
- 開拓の入口（D1・E2・F2）が分からず dry-run を5回空振り。
- temp:/count: の要否が段で違い move を4回失敗。
- resume の ref 全文と候補10人が show --board と重複。
## 変更案
1. 選べない指定で止まったら、その段の選択肢IDを1行で出す。
2. 地図に最初に置けるマスを * で示す。
3. commander.md に ID 列を書く（drill:top count:2 count:3、expedition:top reward:4×2 reward:6×2、import:upper count:2）。
## 自分
- 不明な段は1段だけ move して選択肢を見る。
- 決まった手は end まで1回にまとめる。
