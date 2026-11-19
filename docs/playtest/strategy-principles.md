# ワーカープレイスメント／拡大再生産ゲームの汎用戦略原則（LLM打ち手の強化用）

ユーザーが用意した調査資料である（2026-11-19）。打ち手に読ませる要約は `strategy.md`。ゲーム14（`2026-11-19-game14/`、Fable 3席、データの版 18ce29a8）で使い、いまのデータと食い違った箇所を次のように直した。

- インフラの到達報酬（第2節）：「4・8・12 で特別な市民カード」は誤り。いまのデータ（`params.json` の `infra.rewards`）では特別な市民カードは Lv5・10・15、点は Lv1（1点）・6（2点）・11（3点）、Lv12 は土地タイル1枚である。ゲーム14では3席とも Lv8 で特別な市民カードを当てにして外した。
- 終盤の基準点（要点・汎用の指針）：「1手2点」は低すぎた。ゲーム14の第5ラウンドは1手3〜16点だった。
- 終盤の生産投資（第1節）：「残り2回を切ったら換算点だけで評価し直す」は、商店・工房の3軒目には当てはまらない。終了時の換算の割る数が軒数で変わる（金の生産力は商店0〜3軒で÷20・5・4・3、資材の生産力は工房0〜3軒で÷10・3・2・1）ため、最終ラウンドに建てても1軒5〜11点になった。
- 最終ラウンドの資源（第4節）：ゲーム14では金より先にワーカーと手札のプレイ枠が尽きた。金は第4ラウンドまでに建物に替える。


いちばん効く原則は、手を「1手で何点になるか」と「その手が残りのラウンドで何回効くか」で比べること、そして増員とエンジン作りを第1〜2ラウンドに前倒しすることである。Agricola Norge の Bernt Ivar のガイドが「Early actions are worth more than late actions」と書くように、上級者の指南は共通して早い手ほど価値が高いと述べている。行動数（ワーカー）を増やす投資は、早いほど複利で効く。さらにこの自作ゲームでは、ワーカー数・生産力・役所×ワーカーが終了時の得点にもなる。このため、増員と生産への投資は「エンジン」と「得点」を兼ねる。ここが定番ゲームより前倒しを強く勧める理由である。

## 要点

- 早い手ほど価値が高い（Bernt Ivar のガイド）。ワーカー・生産力・建物の種類は第1〜2ラウンドに作る。第5ラウンドに作るものは、ほぼその場の得点としての価値しかない。
- 終盤は「1手あたり何点か」の基準値を持ち、基準を下回る手を打たない。Agricola Norge の Bernt Ivar は「A baseline good action in the late game is 2 points」とし、手順の平均が1手2点に届かなければ見直すよう勧めている。この自作ゲームでも、ラウンドごとに基準値を決めて比べる。ただし2点はこのゲームでは低い（ゲーム14の第5ラウンドは1手3〜16点）。
- 占有型で皆が欲しいスペースを先に取り、自分しか欲しくないものと共有スペースは後に回す。
- 最終ラウンドは終了時から逆算して計画する。金・資材は得点にならないので、使い切る順番を前のラウンドから組む。
- キャラクターの得意軸は主軸にしつつ、全員に効く大きい得点源（インフラ到達報酬・特別な市民・役所×ワーカー）は捨てない。
- ペナルティは「防ぐのに要る手数」と「失点」で比べて判断する。安く防げるなら防ぎ、高くつくなら意図して受ける。
- パスは「今ラウンドの残りの手の価値」と「次ラウンドの手番＋ボーナスタイル」の比較で決める。
- LLM の弱点（貪欲さ、終局の見落とし、計算違い、記憶の欠落）は、ラウンド開始時の計画テンプレート、数値のチェックリスト、引き継ぎノートの定型化で補う。

## 弱点ごとの原則・根拠・行動指針

### 1. エンジンの立ち上げが遅い

効く原則
- 行動数を増やす投資は、残りのラウンド数だけ効く。早いほど価値が高い。
- 生産施設の価値は「何回生産するか」で決まる。終盤に建てた生産施設は元が取れない。
- 「効率の良い手」と「テンポの良い手」は違う。まとめて2軒建てるより、1軒ずつでも早く建てて増員を早める方が強いことが多い。

根拠
- Agricola の上級者ガイド（Bernt Ivar）は「早い手は遅い手より価値が高い」としている。部屋を2つまとめて建てると家族の増員が遅れるので、1部屋ずつ建てる方が良いことが多いとも書いている。 [agricola](https://agricola.no/agricola-strategy-guide/) https://agricola.no/agricola-strategy-guide/
- Agricola の入門解説：第4ラウンドに3人目を増やせば残り10ラウンドで10手増える。第11ラウンドなら3手しか増えない。 [fjord-labs](https://www.fjord-labs.com/games/agricola/agricola-beginner-strategy/) https://www.fjord-labs.com/games/agricola/agricola-beginner-strategy/
- BGA の Agricola 4人戦の考察（note）：増員は終了時に1人3点、最大+9点の得点行動でもある。 [note](https://note.com/tetoranpator2828/n/nb520eb5f7df9?hl=en) https://note.com/tetoranpator2828/n/nb520eb5f7df9?hl=en
- ワーカー数による拡大率：2→3人は1.5倍、10→11人は1.1倍。初期ワーカーが少ないほど増員の重要性は高い。 [note](https://note.com/tozukachuou/n/n4e26695847c1) https://note.com/tozukachuou/n/n4e26695847c1
- ナショナルエコノミーの攻略記事：最優先は「ワーカーを増やすこと」。ただし人件費が上がる終盤は、1人の稼ぎが人件費を上回るかで判断する。 [boardgame](http://boardgame.or.jp/archives/1132) http://boardgame.or.jp/archives/1132
- 拡大再生産の勝ち方（bged.info）：2コインで建てて毎ラウンド1コイン生む家は、20ラウンド中19ラウンド目に建てると赤字になる。序中盤は「基礎（生産）フェイズ」、後半は「攻勢（得点）フェイズ」と分ける。 [bged](https://bged.info/boardgamemakekakudaisaise) https://bged.info/boardgamemakekakudaisaise
- Viticulture の上級者のコツ：「早く、何度も訓練（増員）する」。 [elusivemeeple](https://elusivemeeple.com/2018/05/27/viticulture-strategy-tips/) https://elusivemeeple.com/2018/05/27/viticulture-strategy-tips/
- Ark Nova の考察：序盤3ラウンドは点を取りに行かず、後で点を生む仕組みを作る。 [boardgamestrategy](https://boardgamestrategy.blog/2026/05/20/ark-nova-first-three-rounds/) https://boardgamestrategy.blog/2026/05/20/ark-nova-first-three-rounds/
- Terra Mystica：収入を生む建物は第1〜2ラウンドに建てる方が、第6ラウンドに建てるより価値が高い。 [boardgamearchive](https://boardgamearchive.com/strategy/terra-mystica-strategy/) https://boardgamearchive.com/strategy/terra-mystica-strategy/

この自作ゲームへの当てはめ（目安）
- 住宅→移住を第1ラウンドから始める。第2ラウンドの終わりに通常ワーカー8人前後、第3ラウンド中に10人を目標にする。ワーカーは行動数と基礎点の両方に効くので、遅らせる理由は少ない。
- 商店・工房の1軒目、役所の1軒目は第2ラウンドまでに建てる。生産力は毎ラウンドの収入でもあり、終了時の経済点でもあるので二重に効く。
- 文明カードは「効果が何ラウンド効くか」で順番を決める。継続効果のあるカードは早く出し、点だけのカードは最終ラウンドに回す。
- 第4ラウンド以降に「あと何回生産するか」が2回を切った生産投資は、終了時の換算点だけで評価し直す。ただし商店・工房は軒数で終了時の割る数が変わる（商店0〜3軒で金の生産力÷20・5・4・3、工房0〜3軒で資材の生産力÷10・3・2・1）。3軒目まで揃えると最終ラウンドでも1軒5〜11点になる（ゲーム14）。1軒目が最も効くので、第4ラウンドまでに0軒のままにしない。

### 2. 得意軸だけに寄り、共通の大きい得点源を捨てる

効く原則
- 非対称能力は戦略の主軸にするが、それだけでゲームを作らない。全員が使える得点源のうち、1手あたりの点が高いものは能力と関係なく取る。
- 多軸得点では「主軸＋安い副軸」を取る。しきい値のある得点は、最初の段（安い段）がいちばん効率が良いことが多い。
- 手札や能力に過剰にこだわらない。盤面の良い手を見送ってまで能力を活かそうとしない。

根拠
- Terra Mystica：種族能力が戦略を決めるわけではないが、無視するのも賢くない。https://www.meeplemountain.com/articles/board-game-step-ladder-asymmetric-powers/ [meeplemountain](https://www.meeplemountain.com/articles/board-game-step-ladder-asymmetric-powers/)
- Agricola の上級者ガイド：手札に過剰にこだわるのはよくある失敗。点数カードを準備するために盤面の良い得点手（井戸など）を避けてはいけない。 [agricola](https://agricola.no/agricola-strategy-guide/) https://agricola.no/agricola-strategy-guide/
- Ark Nova：複数の保全プロジェクトの最下段を支援する方が、1つの最上段を狙うより総点が伸びやすい。 [wingsplain](https://wingsplain.com/ark-nova-strategy-tips/) https://wingsplain.com/ark-nova-strategy-tips/
- Terra Mystica：ラウンド得点は「タイミングのボーナスで、命令ではない」。経済がもともと欲しいものと合うときに強い。 [boardgamearchive](https://boardgamearchive.com/strategy/terra-mystica-strategy/) https://boardgamearchive.com/strategy/terra-mystica-strategy/
- 意見が割れる点：Terraforming Mars の入門ルール解説は「早く1つの方向に特化せよ」とする。 [therulebook](https://therulebook.com/board-games/terraforming-mars/) https://therulebook.com/board-games/terraforming-mars/ 一方、Agricola Norge の Bernt Ivar は「Probably the most important advice for becoming a really strong player: Learn to have flexible plans and not hard commit to a single plan」と書き、1つの計画に固く決めず複数の計画を持って局面で選ぶことを、最も重要な助言としている。https://agricola.no/agricola-strategy-guide/ 行動数が少なく得点源が広く散らばるゲームでは特化が、上限のある得点源が多いゲームでは分散が有利になる傾向がある。

この自作ゲームへの当てはめ（目安）
- インフラは到達報酬と特別な市民カードの両方が効く。特別な市民カードは Lv5・10・15、点は Lv1・6・11（1・2・3点）、Lv12 は土地タイル1枚である（`ref` で確かめる。データの調整で変わりうる）。どのキャラクターでも第3ラウンドまでに5に届く計画を立てる。
- 役所×ワーカーは、ワーカー10人を作るなら役所を増やすほど伸びる掛け算の得点。増員と同時に役所3軒を視野に入れる。
- 自然公園（建物のない土地の組）と計画都市は、建設計画を立てる時点で「どのマスを空けておくか」「どの並びにするか」を決める。後から合わせようとすると、空き土地が尽きて取れない。

### 3. 取り合いの読みが弱い

効く原則
- 「皆が欲しいものは先、自分しか欲しくないものは後、共有スペースは最後」。
- 手番の価値は「次のラウンドの最初の1手で取りたい占有スペースがあるか」で決まる。手番を取ること自体には価値がない。
- 4人戦で相手を妨害するためだけに手を使うのは、ほとんどの場合割に合わない。他の2人が得をするから。自分にも良い手でついでに妨害するのが基本。
- パス順は「次ラウンドの手番＋ボーナスタイル」を買う行為。残りの手が弱いなら早くパスする方が得なことがある。

根拠
- Agricola の入門解説：取り合いになるスペースを先に取り、取り合いにならないアクションは待てる。どうしても必要なスペースがあるなら、前のラウンドにスタートプレイヤーを取るのが正しいことが多い。 [fjord-labs](https://www.fjord-labs.com/games/agricola/agricola-beginner-strategy/) https://www.fjord-labs.com/games/agricola/agricola-beginner-strategy/
- 日本語の個人ブログ（bged.info）：牛は他の人が取らないと思うので、今は強い麦のアクションを取る、という例で同じ原則を説明している。 [bged](https://bged.info/warker_place_nonob) https://bged.info/warker_place_nonob
- Agricola の上級者ガイド：スタートプレイヤーはそれ自体は弱い手で、次のラウンドで非常に重要な手を最初に打つために取る。終盤の3ラウンドは先手の価値が上がる。妨害については「In a 4-player game spending an action merely to block one player is rarely correct, because the 2 other players will just benefit」と書いている。https://agricola.no/agricola-strategy-guide/
- Terra Mystica：次ラウンドの手番はパス順で決まる。次ラウンドのボーナスを待つために早めにパスする方が良い場合がある。 [meeplemountain](https://www.meeplemountain.com/articles/general-strategies-for-terra-mystica/) https://www.meeplemountain.com/articles/general-strategies-for-terra-mystica/ [meeplemountain](https://www.meeplemountain.com/articles/general-strategies-for-terra-mystica/)
- BGG の Terra Mystica のスレッド：早いパスは資源を失わないので非効率とは限らない。効率は「何手打ったか」ではなく「何の資源で何点取ったか」で測るべき。https://boardgamegeek.com/thread/1104871/rules-question-about-choosing-your-next-bonus-tile [boardgamegeek](https://boardgamegeek.com/thread/1104871/rules-question-about-choosing-your-next-bonus-tile)
- Games Precipice の手番分析は、Terra Mystica の15,000局超で先手の勝率21.13%、最後手29.86%という数字を挙げている（出典は明記されていない）。手番の価値はゲームによって違い、先手が常に有利とは限らない。 [gamesprecipice](https://www.gamesprecipice.com/turn-order/) https://www.gamesprecipice.com/turn-order/

この自作ゲームへの当てはめ（目安）
- 各ラウンドの最初に、占有型スペースを「他の席も欲しがりそうか」で格付けし、上位から1手目・2手目に置く。福祉・最上位、建築・最上位のように解放済みの強い占有スペースは、原則1手目で取る。
- 共有の「通常」スペースは最後に回して連打する枠と考える。
- 相手の盤面（空き土地、住宅の数、インフラまでの残り、手持ちの金）を見て「次に何を欲しがるか」を1行で書き出してから置く。
- パスの判断は「残りの手の点」と「次ラウンドで先手に取れる占有スペースの価値＋取れるボーナスタイルの価値」を比べる。最終ラウンドの前のラウンドでは、パス時に点が入るタイルを確保できるパス順を優先する。

### 4. 資源の見積もり違いと余らせ

効く原則
- 終了時に価値のない資源は、残った分だけ損になる。最終ラウンドは使い切る順番から逆算する。
- 必要な量を先に数え、取りに行く回数を決める（端数を残さない、取り過ぎない）。
- 効果文の「1回ごと」「全体で1回」を、計画の前に必ず確かめる。

根拠
- Agricola の上級者ガイド：粘土のような「離散的な資源」は、合計の必要量から取る回数を決める（9個要るなら2回で済ませる）。余らせについては「it is a common mistake to end with a lot of stone which has no use because all the majors are gone」と書いている。https://agricola.no/agricola-strategy-guide/
- Gaia Project では残った資源も3つで1点に換算されるので、余りを点に変えられる。 [boardgamegeek](https://boardgamegeek.com/thread/1906815/final-resource-scoring) https://boardgamegeek.com/thread/1906815/final-resource-scoring この自作ゲームは残った資源が0点なので、余りはまるごと損失になる。
- Terra Mystica：1手で「点のため」に使い過ぎ、次のラウンドの収入不足で手が止まるのを避ける。 [gaming-strategy](https://www.gaming-strategy.com/board-games/terra-mystica/) https://www.gaming-strategy.com/board-games/terra-mystica/
- LLM の誤りの分析（GTBench）：GPT-4 の誤りには「終局の見落とし」「計算違い」「事実の誤認」などが含まれていた。 [neurips](https://proceedings.neurips.cc/paper_files/paper/2024/file/3191170938b6102e5c203b036b7c16dd-Paper-Conference.pdf) https://proceedings.neurips.cc/paper_files/paper/2024/file/3191170938b6102e5c203b036b7c16dd-Paper-Conference.pdf [neurips](https://proceedings.neurips.cc/paper_files/paper/2024/file/3191170938b6102e5c203b036b7c16dd-Paper-Conference.pdf)

この自作ゲームへの当てはめ（目安）
- 第4ラウンドの終わりに、最終ラウンドの手の一覧と必要な金・資材の合計を書き出す。収入を足して、不足と余りがどちらも0に近くなるよう第4ラウンドの手を調整する。
- 最終ラウンドに余りそうな資材は臨時ワーカー（資材4で1人）に、金はカードのプレイに回す。余る見込みが出た時点で使い道を割り当てる。ただし最終ラウンドはワーカーと手札のプレイ枠が金より先に尽きやすい（ゲーム14）。金は第4ラウンドまでに建物に替える。
- 建設の直前に「所持金−費用≥0」を数字で書いて確かめる。1〜2不足で建て損ねるのを防ぐ。

### 5. 小さな得点源の取りこぼし（襲撃・公園・パス時タイル）

効く原則
- 毎ラウンドのペナルティは「防ぐ手数×1手の価値」と「失点」で比べる。防ぐ手が安ければ防ぎ、高ければ意図して受ける。ただし放置するなら、その分の行動で失点以上を稼ぐ見込みが必要になる。
- 小さな得点源は「ついでに取れる」形で計画に組み込む。後から取りに行くと1手あたりの点が低くなる。

根拠
- Stone Age の「飢餓戦略」：食料のペナルティ（−10点／ラウンド）を毎ラウンド受けても、浮いたワーカーで10点以上稼げれば得になる。ペナルティは「防ぐコスト」と比べるもので、絶対に避けるものではない。 [boardgamearena](https://forum.boardgamearena.com/viewtopic.php?t=24064) https://forum.boardgamearena.com/viewtopic.php?t=24064 [boardgamegeek](https://boardgamegeek.com/thread/455987/first-try-at-starvation) [tickettocarcassonne](https://tickettocarcassonne.com/stone-age/) ただし上級者からは、−10点が均衡よりやや重いという意見も出ている（均衡は−9点前後との見方）。 [boardgamearena](https://forum.boardgamearena.com/viewtopic.php?t=19952) https://forum.boardgamearena.com/viewtopic.php?t=19952
- Agricola：家族を養えないと食料1つ不足ごとに3点失う。50点が高得点のゲームでは大きい。 [github](http://dave-choi.github.io/strategy/agricola/index.html) https://dave-choi.github.io/strategy/agricola/index.html
- Wingspan の一人用ガイド：勝てないラウンド目標も完全には捨てず、1つ分だけ進めて0点を避ける。https://everythingisagame.com/wingspan-solo-mode/ [everythingisagame](https://everythingisagame.com/wingspan-solo-mode/)

この自作ゲームへの当てはめ（目安）
- 襲撃の失点はラウンド数×1点で、後半ほど重い（第4・5ラウンドで計9点）。第3ラウンドまでに、軍事を後半の襲撃に足りる水準へ「1〜2手で」上げる計画を入れる。届かないなら、意図的に受ける点数を計画に書く。
- 自然公園は、土地タイルを置く時点で「建物を建てない組」を確保する。最終ラウンドの前に満たせるかを確かめる。
- パス時に点が入るボーナスタイルは、第4ラウンドのパス時に最終ラウンド用として確保する。

### 6. ラウンドをまたぐ計画が弱い

効く原則
- 終わりから逆算する。最終ラウンドに打ちたい強い手を先に決め、そのための前提（空き土地、手札、解放条件、資源）を前のラウンドで用意する。
- 「次に悪い手しか打てない状況」を前もって避ける。悪い手の多くは1〜2ラウンド前のミスの結果。
- 計画は1本に固めず、2〜3本の候補を持ち、盤面で選ぶ。

根拠
- Agricola の上級者ガイド：悪い手を打つのは、たいてい1〜2ラウンド前のミスの結果。終盤は最終ラウンドでも良い手を打てる状況を作っておくことが重要。 [agricola](https://agricola.no/agricola-strategy-guide/) https://agricola.no/agricola-strategy-guide/
- Wingspan：最終ラウンドは残り手数が少ないので、手順を全部書き出して最大点の組み合わせを選べる。https://steamcommunity.com/app/1054490/discussions/0/3200367300173503919/ [steamcommunity](https://steamcommunity.com/app/1054490/discussions/0/3200367300173503919/)
- Ark Nova：休憩（収入）の1つ先を見て、次の2つの大きな手に要る金額を見積もる。 [boardgamearchive](https://boardgamearchive.com/strategy/ark-nova-strategy/) https://boardgamearchive.com/strategy/ark-nova-strategy/
- LLM 研究：UC Santa Barbara の Belle らの「Agents of Change」によると、Catan で毎手番盤面全体を読み直して手を選ぶ LLM エージェントは、全体計画を保てず不安定だった。「考える」と「打つ」を分け、戦略をコードなどの外部の成果物として持たせた HexMachina は、Catanatron で最強のヒューリスティック型ボット（アルファベータ探索の AlphaBeta）に54%勝った。同じ研究では、プロンプトを進化させるだけでも Claude 3.7 の成績が基準エージェント比で95%改善したと報告されている。https://arxiv.org/html/2506.04651v2
- DSGBench（国防科技大学の Tang、Zhou ら。StarCraft II・Civilization・Street Fighter III・Diplomacy・Werewolf・Stratego の6ゲームで6モデルを評価）：LLM エージェントは長期目標と目先の判断の両立が苦手で、長い局面で重要な出来事の記憶を保てない。https://arxiv.org/pdf/2503.06047

この自作ゲームへの当てはめ（目安）
- 引き継ぎノート（1.5KB）を定型にする：①最終ラウンドに打つ予定の上位3手とその前提条件、②現ラウンドで用意すべき前提、③各軸の現在値と目標値（ワーカー、インフラ、軍事、役所、商店・工房、空き土地、手札）、④他の席が狙っているもの、⑤前ラウンドの失敗1行。
- 第3ラウンド開始時に「最終ラウンドの姿」を一度書き出し、以後のラウンドではそこからの差分で手を選ぶ。
- 空き土地と手札は最終ラウンドの燃料と考え、第4ラウンドの終わりに最低限の残数を確保する。

### 7. 得点のぶれが大きい

効く原則
- ぶれの多くは「序盤の投資不足」と「終盤の変換不足」の片方に寄ることで生まれる。前半は作る、後半は点に替える、という型を毎局守る。
- 毎ラウンド、自分の現在の位置（各軸の値）を相手と比べてから計画する。

根拠
- LudoBench（Ojas Jain と Dhruv Kumar、2026年4月。480の局面シナリオで、4つのモデル系統の6モデルを評価）：LLM は「仕上げる型」（駒を完成させるが展開を怠る）と「作る型」（展開するが仕上げない）に分かれ、どちらも理論上の最善の半分しか捉えていない。ゲーム理論ベースラインとの一致は、どのモデルも40〜46%にとどまった。https://arxiv.org/abs/2604.05681
- 計画中心の分析：LLM の推論は「1手ずつの貪欲な方策」として振る舞い、早い局面の近視眼的な選択が後で増幅される。浅い先読みを足すだけで、こうした罠は大きく減る。https://arxiv.org/html/2601.22311 [arxiv](https://arxiv.org/html/2601.22311v1) [arxiv](https://arxiv.org/html/2601.22311)
- 拡大再生産の勝ち方（bged.info）：得点行動への切り替えは、他の人が得点行動を増やし始めたとき、またはその一歩手前でよい。 [bged](https://bged.info/boardgamemakekakudaisaise) https://bged.info/boardgamemakekakudaisaise
- Dominion：「緑（得点カード）は、必要だと思うより早く買い始める」という指針がある。一方、強いコンボのデッキでは遅らせる派もいて、意見が割れている。 [dominionstrategy](https://dominionstrategy.com/2011/06/19/guide-to-the-dominion-base-game/) https://dominionstrategy.com/2011/06/19/guide-to-the-dominion-base-game/

この自作ゲームへの当てはめ（目安）
- 第1〜2ラウンドは「作る」（増員・生産・建物の種類・インフラ）、第3ラウンドは両立、第4〜5ラウンドは「点に替える」を基本の型として毎局守る。
- 各ラウンドの最後に、自分の推定終了点を軸ごとに見積もり、最も低い軸に安く上げられる手があるか確かめる。

## 研究から分かった LLM 打ち手の運用上の対策

- 外部に計画を持たせる：毎手番、盤面全体から手を選び直すのは不安定になる。 [arxiv](https://arxiv.org/html/2506.04651v2) ラウンド開始時に計画を書き、手番ではその計画との差分だけを判断させる。（HexMachina の結果） [arxiv](https://arxiv.org/html/2506.04651v2)
- 反省は失敗の診断として書かせる：Reflexion では、直前の失敗の軌跡を見せるだけより、一人称で「何が悪かったか」を書かせる方が、HotPotQA で8ポイント（絶対値）上回った。 [alphaxiv](https://www.alphaxiv.org/abs/2303.11366)  [arxiv](https://arxiv.org/html/2303.11366) https://arxiv.org/html/2303.11366 ただし、誤った反省がメモリに残って強化される危険も指摘されている。 [arxiv](https://arxiv.org/pdf/2605.29463) 反省は対局結果の数値と照らし合わせて確かめる。https://arxiv.org/pdf/2605.29463
- 先読みを強制する：「この手の後、相手が取りそうな手」「次のラウンドの最初の手」まで1〜2段の先読みを書かせる。https://arxiv.org/html/2601.22311 [arxiv](https://arxiv.org/html/2601.22311v1)
- 相手の意図の推定を明示的にさせる：アントワープ大学の Gevers と Daelemans によるボードゲーム Concept のベンチマークでは、人間の正答率94%に対して LLM はどのモデルも40%を超えず、「LLMs struggle with interpreting other players' strategic intents」と報告されている。相手ごとに「次に欲しいもの」を書く欄をテンプレートに入れる。https://arxiv.org/html/2510.13271v2
- 数値は書き出して検算する：所持・収入・費用・残りの手数を毎ラウンド表ではなく箇条で書き、足し引きを明示する。

## 汎用の指針（案）

- 早い手ほど価値が高いので、増員・生産・建物の種類は第1〜2ラウンドに作る。
- 手は「1手で何点か」と「残りラウンドで何回効くか」の掛け算で比べる。
- 終盤は1手あたりの基準点（このゲームでは3点以上）を決め、それを下回る手は打たない。
- 皆が欲しい占有スペースを先に取り、自分しか欲しくない手と共有スペースは後に回す。
- 相手ごとに「次に欲しいもの」を1行で推定してから置く。
- 妨害だけの手は打たず、自分にも良い手でついでに妨害する。
- パスは「残りの手の点」と「次ラウンドの手番＋ボーナスタイル」を比べて決める。
- 最終ラウンドは終了時から逆算し、前提（空き土地・手札・解放条件・資源）を前のラウンドで用意する。
- 金・資材は終了時に0点なので、最終ラウンドで使い切る割り当てを第4ラウンドに決める。
- 建設やカードの前に「所持−費用」を数字で書いて確かめる。
- 効果文は「1回ごと」か「全体で1回」かを確かめてから計画に入れる。
- キャラクターの得意軸を主軸にし、インフラ到達・特別な市民・役所×ワーカーは誰でも取りに行く。
- しきい値のある得点は、最初の安い段から取る。商店・工房は1軒目から終了時の割る数が変わる。
- ペナルティは防ぐ手数と失点を比べ、受けるならそれを上回る稼ぎを計画に書く。
- 自然公園と計画都市は、土地や建物を置く時点でマスを決めておく。
- パス時に点が入るタイルは、最終ラウンド用に前のラウンドで確保する。
- 計画は2〜3本の候補を持ち、盤面に合わせて選ぶ。
- 引き継ぎノートには、最終ラウンドの予定手、各軸の現在値と目標、相手の狙い、前回の失敗を書く。

## 注意点

- 「第2ラウンドの終わりにワーカー8人」などの数値は、定番ゲームの原則から移した目安で、この自作ゲームで検証された値ではない。自己対局で調整してほしい。ゲーム14では通常ワーカーは第2ラウンドの終わりに7人、第4ラウンドの終わりに8〜10人だった。
- 引用した Web 上の戦略記事には、入門者向けや個人の意見記事も含まれる。上級者の指南として信頼度が高いのは、Agricola Norge の Bernt Ivar のガイドと Dominion Strategy の記事。
- 特化か分散か、得点化を始める時期は、上級者の間でも意見が割れている。ゲームの得点上限の有無や行動数によって最適は変わる。
- LLM 研究の数値は、それぞれの実験環境（Catan、Ludo、HotPotQA など）の結果で、この自作ゲームでの効果を保証するものではない。