# 効率化の案 Fable-B R4
無駄だった場面：
- wait・move の後に毎回30行超の選択肢の一覧が出る。
- ref --only public・characters が長い（他席の SC・ドラフト候補まで）。
- temp:・order: の段を知らず move が2回失敗。大学を含む --dry-run は比べられなかった。
- 「まだ番ではない」で wait を呼び直した。
案：
1. wait・--then-wait の既定で行動の一覧を省き、使用済みのスペースと注意だけ出す（--options で一覧）。wait --until-turn を足す。
2. ref --only sc（場の特別な市民カードだけ）を足し、characters は自分だけを既定に。
3. ids に temp:・order: が入る条件を1行足す。--dry-run は札を引く手でも確定分の増減を出す。
