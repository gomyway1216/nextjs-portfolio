# fresh QAT parent accounting v2: 24,000入力と実学習親を分ける

> 2026-07-18時点で、実teacher label生成、fresh QAT学習、候補選抜はまだ0件である。この変更は既存の10,890-byte plan、role-bundle result、v1 plan/selection registry、過去の日英記事とmachine evidenceをbyte不変で残し、結果を見る前の追記専用amendmentと閉じたv2 registryを追加した。ライブ重みも変更していない。English version: [blog-shogi-floodgate-fresh-qat-parent-accounting-v2.en.md](./blog-shogi-floodgate-fresh-qat-parent-accounting-v2.en.md)

## なぜv2が必要だったか

事前登録したtraining roleは1,000局 × 24親で、入力は24,000親である。一方、production teacher pipelineでは、候補unionがforced skipになった親は処理済みとして完全に会計されるが、sibling training rowを1行も出さない。

したがって次の3値は別物である。

| 値                           | 意味                                  |
| ---------------------------- | ------------------------------------- |
| `input_parents = 24000`      | role bundleからteacherへ渡す固定入力  |
| `forced_parents_skipped = F` | 完了したが学習groupを出さなかった入力 |
| `emitted_parent_groups = E`  | `train.jsonl`に実在する学習親group    |

v2は次のexact equationを要求する。

```text
F + E = 24000
model_training_parents = E
```

v1の`parents = 24000`をそのまま学習contractへ渡すと、`F > 0`の実データに対して存在しない親groupまで学習対象だと主張してしまう。逆にforced親を黙って捨てると、24,000入力の完全性を失う。v2は入力を減らさず、forcedとemittedを分けて両方を記録する。

## 既存記録は書き換えない

[pre-result amendment](../ml/protocols/floodgate-q1-2026-fresh-qat-parent-accounting-v2-amendment.json)は、次の上流identityを固定している。

| record                         |  bytes | SHA-256                                                            |
| ------------------------------ | -----: | ------------------------------------------------------------------ |
| original fresh sibling plan    | 10,890 | `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af` |
| role-bundle result             | 14,735 | `56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf` |
| v1 QAT plan registry           |    409 | `9a1af8144cda4a222e300676c1475d69314c5ac32fe6a11a58adf7acfe5d9a00` |
| v1 selection registry          |  2,294 | `7593d5675884431e5fbcc71c7925b7f094c3ab48f6de9f74850b195f57aedd39` |
| parent-accounting v2 amendment |  7,571 | `983e89b8e611dbcd42c70c51a4109f879dfffe40fd8b560a99c798b826f86bef` |
| closed v2 registry             |  3,501 | `97bd6c1839288f505d31e62904ba095a0ccd11a5dc1f5a58d37f21bea11e214c` |

amendmentは、既存plan binding / selection preflightのmachine evidence 2件と日英記事4件もbytes / SHA-256で固定する。chain validatorはこれらの欠落や1 byte driftを拒否する。v1 registryは引き続きidentityが`null`、dispatch / selection gateが`false`のままである。

## 入力identityも固定する

role-bundle resultのtraining inputは次のexact identityである。

| field                        | value                                                                       |
| ---------------------------- | --------------------------------------------------------------------------- |
| input parents                | 24,000                                                                      |
| input games                  | 1,000                                                                       |
| raw bytes                    | 15,369,952                                                                  |
| raw SHA-256                  | `c9ee90da69135ead5dbb60cbab6eaa82ad018db791132dd4ec122d6088c37b62`          |
| parent IDs SHA-256           | `6681bd08bb282be04f47bf3157ea07fbbe2bc6a6864a100ce65902dc9cc3f08f`          |
| game IDs SHA-256             | `97609ce53a9dee1fffd8faadcf408d79bc3e0724c17d52d8a2ac095bc607e3d7`          |
| position IDs count / SHA-256 | 24,000 / `a97788b608a6687c078b7fbe2172a5c4068c57a42ed322c3997692f697e73b5c` |

materializer coreは、ID集合だけを受け取らない。まず15,369,952 raw bytes全体の長さとSHA-256をrole-bundle identityへ照合し、そのexact bytesをcanonical JSONLとしてstrict parseして、`game_id` / `parent_id` / `position_id` / SFEN / plyのtupleと順序を得る。したがって、ID集合digestを保ったままraw行を並べ替えたり、game / position tupleを別parentへ入れ替えたりしてもraw SHA-256で停止する。

出力親は、この認証済み入力順を保つsubsequenceでなければならない。入力外parent、順序変更、非連続なgroup再開も拒否するので、replacementとresamplingは0である。

## forcedは「欠けたgroup」から推測しない

`train.jsonl`にparent groupが見当たらないだけでは、そのparentをforcedと数えられない。欠落・途中切断・finalizer失敗と、本当に完了したforced skipは別物だからである。

v2が要求するper-parent completion evidenceは、24,000入力と同じ順序で全件をexact coverageし、各行で次を束縛する。

- inputと一致するgame / parent / position tuple
- `completed_parent_sha256`
- 明示的な`forced_parent_skipped`
- non-forcedなら、そのparentの連続train groupのrecord数とLF込みSHA-256
- forcedなら、group record数0、group SHA-256は`null`

このcompletion streamのbytes / SHA-256 / records / forced・emitted ID digest自体も、独立したidentityとして登録されなければならない。さらにoriginはcallerのboolean列ではなく、既存production finalizerの認証済みresult / manifest / `work.jsonl`から導出したprojectionである必要がある。現在のv2 registryではfinalizer workとcompletion evidenceがともに`null`なので、production materializerとvalidatorは必ず`authenticated per-parent completion evidence is not enrolled`でSTOPする。小さなsynthetic coreは敵対test専用で、production authorityを持たない。

## `train.jsonl`から束縛するもの

stdlib-only coreは、渡されたexact bytesをstrict canonical JSONLとして読む。CR、末尾LF不正、空行、duplicate JSON key、`NaN`、非canonical semantic ID、入力と違うgame / position、2 sibling未満のgroupを拒否する。さらに実学習consumerと同じ重要invariant、すなわちcanonical SFENとposition ID、strict integerのply / CP / rank、parent/child CP alias、mate band、sourceの一意canonical順、move重複禁止、groupごとexactly one `played`、rankの1..N連続、rankとCPの単調性まで検査する。

proposalには次をすべて記録する。

- `train.jsonl`のbytesとSHA-256
- record数
- 実在するparent group数`E`
- 実在するgame数とgame ID set digest
- emitted parent ID set digest
- parent positionとchild positionを合わせたsemantic position ID数とdigest
- forced parent ID / position ID digest
- `F + E = 24000`の検証結果
- 3 seedすべての`model_training_parents = E`

proposal validatorはproposalだけを自己整合的に眺めない。exact input / completion / trainの3 byte streamと、それぞれ独立に与えられたidentityからproposal全体を再生成し、typed-exact一致を要求する。このため、forced digestやtrain SHAを改ざんし、それに合わせてtraining contractを作り直しても拒否される。

materializerはteacherやcompletionのoriginを自力で認証したとは主張しない。将来のdata-only enrollmentでは、既存production finalizerが認証・durabilityを確立したresult / manifest / workと、そこから導出したcompletion artifactだけを登録し、別PRでproposal bytes / SHA-256を固定する必要がある。この変更自身はartifactを生成せず、書き込まず、registryも開かない。

## 3つのcase

| case                             | 判定                                                                    |
| -------------------------------- | ----------------------------------------------------------------------- |
| `F = 0`, `E = 24000`             | 認証済みcompletionで全件non-forcedかつ全group一致ならvalid              |
| `0 < F < 24000`, `E = 24000 - F` | 認証済みcompletionがforcedを明示し、全non-forced groupが一致すればvalid |
| `F = 24000`, `E = 0`             | 認証済みcompletionが全件forcedと明示した場合だけSTOP receiptを返す      |

all-forcedは空trainだけから推測しない。24,000件すべてを明示forcedとする認証済みcompletion evidenceが揃った場合だけ、input / forced / emitted digest、空train identity、authority=falseを持つreceiptを残し、`no-trainable-parent-groups`で明示停止する。1件でもnon-forcedなら空trainや途中欠落はaccountable STOPへ格上げせず、エラーで閉じる。

## 学習条件は変えていない

変更したのはparent accountingだけである。full training、slot、selection contractのcanonical SHA-256を次の通り固定した。

| contract      | canonical SHA-256                                                  |
| ------------- | ------------------------------------------------------------------ |
| training      | `b0bf9dbd2342b8be325fae4d195e9bdd909a702361d229293f30849f1348d8ac` |
| seeds / slots | `aab83502378adca6557e4ba0d9da4cf545061eed8d15b1aeae0b99b8a41ffeed` |
| selection     | `9aeade0c64556bd8c3b59bff7b1b1cedb386d2226a4ce60fc7b59677d305352c` |

seedは42 / 43 / 44、architectureは`2282-256-32-1-clipped-relu`、lossは`sibling-ranking`、optimizerはAdamW、learning rateは`0.0001`、epochは20のままである。source replacement、parent replacement、resampling、model / loss / optimizer / seed / epoch / selection gate / holdout policy変更はすべて禁止した。

## 閉じたままの境界

[v2 registry](../ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry-v2.json)は、training result、manifest、work、per-parent completion evidence、`train.jsonl`、parent-accounting proposal、execution plan v2の7 enrollmentをすべて`null`にしている。input raw / finalizer chain / completion originとcoverageを含む12 gate、7 authority flagもすべて`false`である。

今回追加したPython moduleはTorchをimportせず、teacher / model / holdout / selection reader、network、artifact enrollment、training launcherを持たない。明示的なauthorization関数も常に`not implemented; registry remains STOP`で停止する。

## 検証

検証対象revisionは`085023ebae2a5d968b1d8fd7491319856858b056`、treeは`c4ef0c4dcac2c6a21ba16a2b9362765c4228dc19`である。core実装commitは`dd017f8c907b908fc3de1e77ed0b0c4ca67201e9`、`800e1c8e…`は既存のbyte-pinned `package.json`をbaseへexact復元し、`635d98f1…`はbool / int aliasをhardeningした。赤チームreviewで発見したraw input未照合、missing groupのforced誤分類、proposal自己整合だけの検証、skeletal sibling row受理を`baab4a9a…`で追記修正した。再reviewではPythonのUnicode digit判定が`٢٤`のような非ASCII SFEN手数を受理することを発見し、追記commit `085023eb…`でASCII `0`から`9`だけへ制限して敵対testを追加した。履歴は書き換えていない。

- parent-accounting adversarial stdlib test: 19 / 19 PASS、wall 0.10秒
- v1 fresh QAT + v1 selection preflight + v2 accounting互換test: 45 / 45 PASS、wall 1.92秒
- repository全stdlib suite: 138 / 138 PASS、wall 11.07秒
- pinned stable-WASM deadline diagnostic: 11 / 11 PASS、wall 2.99秒。`package.json`はbaseとexact一致
- 日英記事・machine evidence publication test: 5 / 5 PASS、wall 0.35秒
- zero / some / all forced、raw reorder、cross-parent tuple permutation、completion truncation / flag / tuple / group hash改ざん、missing non-forced group、forced group注入、skeletal row、CP / source / move / rank invariant、非ASCII SFEN手数、proposal全digest改ざん、contract再構築、authority tamperを検証
- actual teacher / Torch / artifact / selection / holdout / match / production weight実行: 0

machine-readable recordは[`floodgate-fresh-qat-parent-accounting-v2-2026-07-18.json`](./data/floodgate-fresh-qat-parent-accounting-v2-2026-07-18.json)にある。

次はproduction teacher artifactが安全に完成した後、finalizer result / manifest / workと、そこから導出したexact per-parent completion streamを独立検証・登録する。それまではproduction materializer自体がSTOPする。登録後もexact input / completion / train bytesから再生成したproposalをdata-only PRでreviewし、v2 execution planとregistryのexact identity、CI、独立reviewが揃うまでtrainingは開始しない。
