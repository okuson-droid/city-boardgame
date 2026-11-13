# P0 R2 効率化の案
## 無駄
- resume が全キャラクター・全建物の効果文を毎ラウンド出す。
- wait のたびに選択肢34行、sc:11 の写し30行。
- temp:N・count:N・convert の id が事前に分からず、1手番が3〜4回に割れた。
## 変更案
1. resume はラウンド2以降、自分の欄と変化だけ。
2. 指示書に後続の id の定型（temp:N、count:N、convert:1、copy:<act>:<段>、tile:<マス>:<地形>、build:<種類>:<マス>、bonus:N）を載せる。写しは1行に。
3. wait に --then <手順> を付け、狙いに変化がなければ続けて打つ。
## 自分
- 定型 id で1手番1呼び出し。end と wait をまとめる。board は計画時に1回。
