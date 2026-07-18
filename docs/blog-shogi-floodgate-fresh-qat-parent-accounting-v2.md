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
| parent-accounting v2 amendment |  6,469 | `2a9c6ebb8b7c6d50d606bbdf0f1eb0cb5d971159e2cee836ff26a5d96c8c80d5` |
| closed v2 registry             |  3,046 | `08f3ebecc880f2e3c97f4591d3a2e68cb186dde8772bcbaf534fe518fdd89130` |

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

materializerは、callerから渡された24,000件の`game_id` / `parent_id` / `position_id`をこのidentityと照合する。出力親は入力順を保つsubsequenceでなければならず、入力外parent、順序変更、group再開を拒否する。したがってreplacementもresamplingも0である。

## `train.jsonl`から束縛するもの

stdlib-only materializerは、渡されたexact bytesをstrict JSONLとして読む。CR、末尾LF不正、空行、duplicate JSON key、`NaN`、非canonical semantic ID、入力と違うgame / position、2 sibling未満のgroupを拒否する。

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

materializerはteacher出力のorigin認証を主張しない。将来のdata-only enrollmentでは、既存production finalizerが認証・durabilityを確立したartifactだけを入力し、別PRでproposal bytes / SHA-256を登録する必要がある。この変更自身はartifactを読みに行かず、書き込まず、registryも変更しない。

## 3つのcase

| case                             | 判定                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `F = 0`, `E = 24000`             | valid。empty forced digestと、input = emitted digestを要求する                              |
| `0 < F < 24000`, `E = 24000 - F` | valid。全forcedをaccountし、学習へ渡すparentsは`E`                                          |
| `F = 24000`, `E = 0`             | 全入力をaccountしたSTOP receiptを返し、`no-trainable-parent-groups`で学習proposalを作らない |

all-forcedはデータ欠落として曖昧に失敗するのではない。input / forced / emitted digest、空train identity、authority=falseを持つreceiptを残せる形で明示停止する。

## 学習条件は変えていない

変更したのはparent accountingだけである。full training、slot、selection contractのcanonical SHA-256を次の通り固定した。

| contract      | canonical SHA-256                                                  |
| ------------- | ------------------------------------------------------------------ |
| training      | `b0bf9dbd2342b8be325fae4d195e9bdd909a702361d229293f30849f1348d8ac` |
| seeds / slots | `aab83502378adca6557e4ba0d9da4cf545061eed8d15b1aeae0b99b8a41ffeed` |
| selection     | `9aeade0c64556bd8c3b59bff7b1b1cedb386d2226a4ce60fc7b59677d305352c` |

seedは42 / 43 / 44、architectureは`2282-256-32-1-clipped-relu`、lossは`sibling-ranking`、optimizerはAdamW、learning rateは`0.0001`、epochは20のままである。source replacement、parent replacement、resampling、model / loss / optimizer / seed / epoch / selection gate / holdout policy変更はすべて禁止した。

## 閉じたままの境界

[v2 registry](../ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry-v2.json)は、training result、manifest、`train.jsonl`、parent-accounting proposal、execution plan v2の5 enrollmentをすべて`null`にしている。8 gateと7 authority flagもすべて`false`である。

今回追加したPython moduleはTorchをimportせず、teacher / model / holdout / selection reader、network、artifact enrollment、training launcherを持たない。明示的なauthorization関数も常に`not implemented; registry remains STOP`で停止する。

## 検証

検証対象revisionは`635d98f1083c0fdbbe8dbf4d2e922eb9d574a739`、treeは`054f16b85d17697de7288a222d1814ec332fe555`である。core実装commitは`dd017f8c907b908fc3de1e77ed0b0c4ca67201e9`、続く`800e1c8e…`は既存のbyte-pinned `package.json`をbaseへexact復元し、`635d98f1…`はbool / int aliasとauthority/nonclaim field削除を拒否するhardeningである。履歴は書き換えていない。

- parent-accounting adversarial stdlib test: 15 / 15 PASS、wall 0.07秒
- v1 fresh QAT + v1 selection preflight + v2 accounting互換test: 41 / 41 PASS、wall 1.57秒
- repository全stdlib suite: 134 / 134 PASS、wall 10.73秒
- pinned stable-WASM deadline diagnostic: 11 / 11 PASS、wall 2.99秒。`package.json`はbaseとexact一致
- 日英記事・machine evidence publication test: 5 / 5 PASS、wall 0.35秒
- zero / some / all forced、replacement、reorder、reopen、metadata substitution、framing、duplicate JSON、nonfinite、contract tamper、authority tamperを検証
- actual teacher / Torch / artifact / selection / holdout / match / production weight実行: 0

machine-readable recordは[`floodgate-fresh-qat-parent-accounting-v2-2026-07-18.json`](./data/floodgate-fresh-qat-parent-accounting-v2-2026-07-18.json)にある。

次はproduction teacher artifactが安全に完成した後、認証済みinput metadataとexact `train.jsonl` bytesをmaterializerへ渡し、得たproposalをdata-only PRでreview・登録する。その時点でもtrainingは自動で始まらない。v2 execution planとregistryのexact identity、CI、独立reviewが揃うまでSTOPを維持する。
