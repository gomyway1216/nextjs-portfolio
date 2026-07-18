# 将棋評価関数: 384 pair / 768局の正式A/Bを結果を見る前にv2へ改訂した

> この変更は対局を実行しない。original fresh sibling planとv1 registryをbyte不変で保存し、formal A/Bが0局、candidate未選抜、artifact未登録の時点で、明示的なdownstream amendmentを追加した。実行、結果読取、採用、本番weight書換えはすべて閉じたままである。English version: [blog-shogi-floodgate-formal-paired-ab-protocol-v2.en.md](./blog-shogi-floodgate-formal-paired-ab-protocol-v2.en.md)

## 結論

original planが固定した192 color-swapped pairs / 384局は実行しない。未実行のv1を後から書き換えるのではなく、そのexact identity、観測0件、v2の完全な判定規則を束縛した[pre-result amendment](../ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-amendment.json)を追加し、別schemaのv2を事前登録した。

v2の固定条件は次のとおりである。

- 384個の一意なopening、各openingでcandidate先手とcandidate後手を1局ずつ、合計768局
- 有効な途中pairから統計的なearly success / early failureや採否判断をしない
- exact 384 pair / 768局が揃い、technical faultが0件のrunだけを解析対象にする
- technical faultは棋力上の負けではない。発生時点でrunをinvalidとして停止し、同じrun内のretryでfaultを消さない
- `random.Random(20260710)`で384 pairを100,000回復元抽出
- 昇順5,000番目をone-sided 95% lower、2,500番目をtwo-sided 95% lowerとする
- safetyはone-sided lowerが厳密に45%超
- 「stableより強い」はtwo-sided lowerが厳密に50%超
- candidate / stableごとのexperimentは追記専用attempt ledgerを持ち、試行は最大2回
- 2回目は結果を1件もunblindする前にtechnical-fault evidenceだけで承認し、2回目もfaultなら棋力結論なしでcandidate experimentを終了

この解析がpassしてもpromotion authorityにはならない。promotion validatorは常に`production remains STOP`で失敗する。

## v1を黙って変更しなかった

original [fresh sibling plan](../ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json)は192 pair / 384局を固定している。そのため、v2をoriginal planと同じものだとは扱わない。

pre-result recordは次のように固定する。最終行はamendmentから自己参照せず、validatorが別に固定する。

| artifact                    |  bytes | SHA-256                                                            |
| --------------------------- | -----: | ------------------------------------------------------------------ |
| original fresh sibling plan | 10,890 | `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af` |
| original v1 closed registry |  1,642 | `79e5b559c7d58bc5facec207bcc26813c2e797ff27f95068eea8b4110e10de50` |
| pre-result v2 amendment     |  4,459 | `3ce939d40e011503f2ab27db235de8ad144322a876f1cfcfdcea5b17b8d2157c` |
| current closed v2 registry  |  3,480 | `fbd3f8c87a046a5d5f448106434aca4861a85056d48512194818860b7e9c39b9` |

amendment-chain validatorはoriginal plan、v1 registry、amendmentのbytes、SHA-256、schemaを照合する。closed-registry validatorはcurrent v2 registryのexact bytes / SHA-256を別に固定したうえで、このchainも要求する。amendment自体がseed、rank、threshold、完走規則、runをまたぐfault policyをすべて含むため、可変なregistry pathではなくamendment SHA-256がcanonicalな判定規則identityになる。v1 registryが欠落、1 byte変更、open gate化した場合はv2 registryも受理しない。v1の解析code、test、記事、evidence、registry、original planはこの変更で編集しない。

amendmentが記録した時点ではfresh candidateは未選抜、candidate weightと上流receiptの登録は0、v1 A/Bは0 pair / 0局、external calibrationも0局、live weightsは未変更である。したがって結果を見てからsample sizeを増やした変更ではない。

## 384 pairの意味と限界

pair scoreを0から1の有界値とすると、varianceの上限は0.25である。独立なpair blockを仮定した計画用のnormal approximation

`1.96 × sqrt(0.25 / n)`

では、192 pairのtwo-sided 95% half-widthは約`0.07073`、384 pairでは約`0.05001`になる。v2はこの約5.0 percentage pointsの計画scaleを採用した。

ただし、これは次のどれも意味しない。

- half-widthが必ず5.000 points以内になる保証
- true +5 pointsを一定確率で検出するpower保証
- bootstrap intervalの実測幅
- Eloや人間段位への換算

正式判定はnormal approximationではなく、完走後の384 pairを固定seedでbootstrapした実際のlower boundだけを使う。実現したinterval幅は結果分布に依存する。

## technical faultと途中停止

「有効な途中結果でearly failureを宣言しない」と「technical faultが起きても完走する」は別である。

- 有効なpairが100件、200件と蓄積しても、途中勝率を採否に使わない
- engine crash、timeout、protocol違反など、後でmatch bindingが定義するtechnical faultが起きたrunは、その時点でinvalidとして停止する
- その停止を「candidateが弱かった」とは数えない
- 同じrun IDでfault局を差し替えたりretryしてfault countを0へ戻したりしない
- faulted attempt、fault evidence、partial-result identityはexperimentの追記専用ledgerへ残す
- 新しいrunを承認できるのは最大1回で、その承認はfaulted attemptの結果を1件もunblindする前にimmutable化する
- 2回目もtechnical faultなら棋力結論なしでexperimentを終了し、同じcandidateに3回目を与えない

現行v2 result decoderはさらにexact experiment ID、run ID、attempt index、attempt-ledger SHA-256、およびattempt 1の場合だけrerun-authorization SHA-256を束縛する。`run_status: "complete"`、exact 384 pair、768 unique game ID、`technical_fault_count: 0`だけを解析し、途中runやfault runからstrength reportを作らない。

このPRは追記専用store、result blinding、rerun authorityをまだ実装しない。これらの運用controlがないためexecutionとpromotionは閉じたままであり、ここで固定するfield / policyは後続match bindingが証明すべき事前登録contractである。

## strict resultとpair bootstrap

v2 resultは解析前に次をすべて満たす必要がある。

1. original planのpath / bytes / SHA-256 / schemaがexact一致
2. amendment SHA-256がexact一致
3. experiment / run IDが別々のcanonical semantic ID
4. attempt indexがexact integer 0または1で、append-only attempt-ledger SHA-256がある
5. attempt 0ならrerun authorizationが`null`、attempt 1ならlowercase authorization SHA-256
6. candidate / stable weightが別々のlowercase SHA-256
7. match bindingがlowercase SHA-256
8. `run_status`がexact `complete`、technical faultがexact 0
9. pair indexが0〜383の連続順序
10. opening IDがpairごとに一意なcanonical semantic ID
11. 各pairがcandidate先手、candidate後手の順にexact 2局
12. 全768 game IDが一意
13. outcomeが`win | draw | loss`だけで、余分・欠落fieldがない

direct decoderへ渡すdictionary / stringもexact JSON `dict` / `str`だけを許す。Python subclassやcustom mappingでhash、同文ID、protocol recordを偽装できない。

1局を勝ち2、引分1、負け0のhalf-point unitで保持するため、1 pairは0〜4、全体の分母は`384 × 4 = 1,536`になる。pairをblockのまま復元抽出し、45%と50%の比較は整数の交差積で行う。

交互にpair score 0 / 100%を置くsynthetic vectorでは、100,000 replicateの固定lower numeratorがone-sided `704/1536`、two-sided `692/1536`になる。これは再現性testであり、棋力データではない。

## 現在の実データ

machine-readableな[v2 closed registry](../ml/protocols/floodgate-q1-2026-formal-paired-ab-v2-registry.json)と[validation evidence](./data/floodgate-formal-paired-ab-protocol-v2-2026-07-18.json)は、すべての運用gateを閉じている。

| 項目                                    |                   現在値 |
| --------------------------------------- | -----------------------: |
| v2 formal A/B                           | 0 / 384 pairs、0 / 768局 |
| candidate / stable weight enrollment    |                    0 / 0 |
| upstream receipt enrollment             |                        0 |
| opening manifest / match binding        |          未登録 / 未登録 |
| attempt ledger / rerun authorization    |          未登録 / 未登録 |
| execution / result reader authorized    |            false / false |
| promotion / production write authorized |            false / false |
| external calibration                    |                      0局 |
| live weights changed                    |                    false |

追加したのはTorch非依存のdecoder、bootstrap analyzer、closed-registry / amendment-chain validator、unit testだけである。match launcher、weight reader、holdout reader、production importは追加していない。

## 実対局の前にまだ固定すべきもの

v2 registryへidentityを登録する別PRの前に、fresh teacher、3-seed retraining、selection、fresh / legacy final、retention、既知`P*8f`回帰、production parity / browserがすべてpassしている必要がある。

その後もmatch bindingには少なくとも次を固定する。

- exact candidate / stable weightsとengine/runtime revision
- 384件のopening manifestと抽出規則
- time control、最大手数、引分・投了・adjudication規則
- hardware / OS / worker数 / pair schedulingとresource isolation
- technical faultの分類、検出、停止、evidence保存規則
- candidate / stable experiment ID、run ID、追記専用attempt ledger、result-blinding boundary、結果unblind前のrerun authorization
- run identity、result出力、独立reconstruction手順

これらが`null`の現状では1局も開始しない。v2を通っても主張できるのは固定内部条件でstableより強いということだけで、人間の高段ではない。

後続external gateについて、現行の公式[81Dojo利用規約](https://81dojo.com/jp/terms.html)はソフト対局に専用`COM_` accountを要求し、公式app以外によるアクセスを禁止している。公式[2026年4月の段級位閾値表](https://81dojo.com/announcements/260411.html)では2050が五段の下限である。別途定める「rated 200局を行い、171〜200局目の全post-game ratingが2050以上」という安定条件は、81Dojoの規則ではなく、このproject独自の事前登録calibrationである。実行直前に公式規約と閾値を再確認し、重要な変更があれば結果を見る前に外部calibration amendmentを作る。結果後の書換えは行わない。

live weight変更は、そのexternal gate、後続rollback rehearsal、別の安全なrelease gateがすべて通るまで行わない。
