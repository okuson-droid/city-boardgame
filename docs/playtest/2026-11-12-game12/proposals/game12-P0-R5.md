# P0 R5 効率化
## 無駄
- resume 約25KB。ドラフト候補・他席の計画都市・全効果文・履歴は不要。
- wait の既定が毎回約5KB。--only progress で1/10。
- 建築を dry-run して打ち直し。wait の時間切れ2回。
## 変更案
1. resume：R2以降は局面・自分・手札・他席・選択肢だけ。効果文は ref。
2. wait：既定を出来事＋自分1行＋選べる id の1行に。
3. 指示書：wait は timeout 590・--only progress。「move … end; wait; 次の move」を1呼び出しに。
## 自分で
- 最初に全手番の順を決める。
- temp:0・count:N も最初から並べる。
- dry-run は2案の比べだけ。
