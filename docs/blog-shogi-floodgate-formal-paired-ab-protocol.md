# 将棋評価関数: 384局A/Bを「結果を見てから変えられない」形に固定した

> この段階では対局を1局も実行していない。候補weight、stable weight、上流receipt、opening manifest、match bindingはすべて未登録で、実行・結果読取・採用・本番weight書換えは明示的に閉じている。English version: [blog-shogi-floodgate-formal-paired-ab-protocol.en.md](./blog-shogi-floodgate-formal-paired-ab-protocol.en.md)

## 結論

[fresh sibling plan](../ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json)で事前登録していた正式A/Bを、Torchや対局実行系に依存しない純粋な検証・解析コードへ落とした。

- exact 192 opening pairs / 384 games
- 各pairは同じopeningでcandidate先手、candidate後手の順に2局
- 統計単位はgameではなく2局pair
- `random.Random(20260710)`で192 pairを復元抽出し、100,000 replicate
- 昇順5,000番目をone-sided 95% lower bound、2,500番目をtwo-sided 95% lower bound
- 安全gateはlower boundが厳密に45%超
- 「強くなった」と呼ぶgateはtwo-sided lower boundが厳密に50%超

しかし解析reportだけでは採用権限にならない。現行のpromotion validatorは常に`production remains STOP`で失敗し、closed registryは全artifact identityを`null`、全authorityを`false`にしている。

## なぜgame単位ではなくpair単位なのか

同じopeningを先後反転した2局は独立ではない。opening固有の有利不利を共有するため、384局を独立標本としてbootstrapすると不確実性を過小評価し得る。そこでcandidateの各局を勝ち1、引分0.5、負け0として2局平均を1 blockにし、192 blockを復元抽出する。

実装内部では浮動小数点の境界誤差を避けるため、1局を勝ち2・引分1・負け0のhalf-point unitで保持する。1 pairは0〜4、全体の分母は`192 × 4 = 768`である。45%と50%の判定も整数の交差積で行う。

## resultの厳格な形

入力は次をすべて満たさなければ解析前に停止する。

1. fresh planのpath / bytes / SHA-256 / schemaがexact一致
2. candidate weightとstable weightは別のlowercase SHA-256
3. match bindingもlowercase SHA-256
4. pair indexは0〜191の連続順序
5. opening IDはpairごとに一意な`sha256:<64 lowercase hex>`
6. 各pairはexact 2 games、candidate先手→candidate後手の順
7. 全384 game IDが一意
8. resultは`win | draw | loss`だけ
9. extra field、欠落field、型違いを拒否

これにより、片側だけの対局、openingの重複、色反転漏れ、gameの二重計上、別planへのすり替えをfail-closedにする。

## 現在の実データ

現時点のmachine-readable registryは[こちら](../ml/protocols/floodgate-q1-2026-formal-paired-ab-registry.json)、検証記録は[こちら](./data/floodgate-formal-paired-ab-protocol-2026-07-17.json)。

| 項目                     | 現在値 |
| ------------------------ | -----: |
| 実対局                   |    0局 |
| 登録済みcandidate weight |      0 |
| 登録済みstable weight    |      0 |
| 登録済み上流receipt      |      0 |
| execution authorized     |  false |
| promotion authorized     |  false |
| live weights changed     |  false |

synthetic検証では、全勝fixtureが両gateを通り、exact 50% fixtureは安全gateだけ通って「強くなった」gateを通らないことを確認した。交互にpair score 0 / 100%を置いた固定vectorでは、100,000 replicateのlower numeratorがone-sided `340/768`、two-sided `328/768`になった。これは実棋力の数字ではなく、固定seed・pair resampling実装の再現性testである。

Node環境から実行するML stdlib suiteは80/80 pass、実時間2.99秒だった。ここにはexact 100,000 replicate vector、非JSON equality objectを含むstrict type/schema、pair/game一意性、色反転、closed registry、常時STOPのpromotion validatorが含まれる。

## 次に必要なもの

このPRだけで384局を始めてはいけない。順番は次のとおりである。

1. fresh teacher生成とseed 42 / 43 / 44の再学習を完了
2. fresh selectionを通過したcandidate hashを固定
3. fresh / legacy final holdout、retention、既知`P*8f`回帰、production parityをすべて通過
4. candidate / stable /全receipt / opening manifest / match条件のidentityを別PRで登録
5. そのexact bindingだけで192 pair / 384 gamesを1回実行
6. resultを本moduleで解析し、別のevidence reconstructionが完全一致を確認
7. 内部gate通過後も、人間の段位は81Dojoの外部校正で別に測る

したがって現時点の結論は「正式A/Bの判定規則を先に固定した」であり、「評価関数が強くなった」ではない。
