# P0 R4 効率化の案
## 無駄
- resume と wait が毎回、選択肢30行超と選べない理由を出す。計画の後は不要
- 段の id が分からず下見を3回使った（count・done・choose）
- resume が R4 でも全キャラクター・済んだ襲撃カードを出す
## 変更案
1. wait・resume：選択肢は狙いに登録したものだけ出し、全体は show --only options
2. dry-run が止まったら次の段の id を1行で出す。空き地が尽きたら done を受ける
3. resume：R2以降はドラフト候補と済んだ襲撃を省き、建物の上限までの残りと空き地を1行で出す
## 自分
- wait は --only progress で受ける
- id はノートから引き、下見は比べるときだけ
