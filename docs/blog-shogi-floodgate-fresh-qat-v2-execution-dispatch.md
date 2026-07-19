# fresh QAT v2 execution dispatch: 後継がなければデータを読む前に止める

> 2026-07-18時点では、v2 execution plan、parent-accounting proposal、`train.jsonl`を有効化するready successorは存在しない。したがってproduction routeはartifact reader、Torch runtime reader、training contract生成の前で必ずSTOPする。実teacher生成、学習、候補選抜、A/B、ライブ重み変更はすべて0件のままである。English version: [blog-shogi-floodgate-fresh-qat-v2-execution-dispatch.en.md](./blog-shogi-floodgate-fresh-qat-v2-execution-dispatch.en.md)

## 今回何を追加したか

parent-accounting v2は、固定入力24,000親と実際に学習groupを出した親数を分けた。しかし、正しい会計式を定義しただけでは、学習入口へ安全につなげられない。

今回追加したのは、その間をつなぐfail-closedなexecution-plan verifier / dispatcherである。役割は次の4つに限定した。

1. v2に完全一致するplan pathだけを新しいverifierへ送る
2. 永久に閉じたactivation anchorと、将来別PRで追加されるready successorを分離する
3. successorがなければ、proposal、plan、train、他の学習artifact、runtime reader、training contractへ進まない
4. successorがあっても、登録済みinput / completion / trainのexact bytesからproduction source-accounting validatorがproposal全体を再計算するまではtraining contractへ進まない

teacherを走らせる機能、artifactを登録する機能、学習を開始する機能は追加していない。

## なぜ永久anchorと追加式successorに分けたか

既存の閉じたregistryを後から書き換えて開く方式だと、「以前は何が閉じていたか」と「どの変更が権限を与えたか」が同じファイルの差分に混ざる。

そこで、[activation anchor](../ml/protocols/floodgate-q1-2026-fresh-qat-v2-activation-anchor.json)は永久に閉じたままにした。

| record                               | bytes | SHA-256                                                            |
| ------------------------------------ | ----: | ------------------------------------------------------------------ |
| v1 plan registry                     |   409 | `9a1af8144cda4a222e300676c1475d69314c5ac32fe6a11a58adf7acfe5d9a00` |
| v1 selection registry                | 2,294 | `7593d5675884431e5fbcc71c7925b7f094c3ab48f6de9f74850b195f57aedd39` |
| closed parent-accounting v2 registry | 3,501 | `97bd6c1839288f505d31e62904ba095a0ccd11a5dc1f5a58d37f21bea11e214c` |
| permanent activation anchor          | 3,387 | `c6b22c202087f0142cc73c37fc033a8e322cb12867a59d9ed027be9eb89eaca7` |

上の既存3ファイルはbyte-for-byte不変である。anchorはそれらのexact identity、将来のv2 path、現在の全gate / authorityが`false`であることを固定する。

将来readyにする場合もanchorは編集しない。次の1ファイルを追記する。

```text
ml/protocols/floodgate-q1-2026-fresh-qat-v2-ready-successor.json
```

このファイルは現在存在しない。存在しないこと自体がproduction STOP条件である。

## 実際の停止順序

dispatcherは次の順序で処理する。

1. plan引数がexact v2 pathで、symlinkでないことを確認する
2. permanent anchorのbytes、SHA-256、canonical JSON valueを確認する
3. exact ready-successor pathを読む
4. successorがなければ即STOPする
5. successorがある場合だけ、既存3 registryの不変identityを再確認する
6. successorに登録されたinput、per-parent completion、proposal、plan、trainをexact bytes / SHA-256で2回読む
7. productionのsource-accounting validatorへexact input / completion / train bytesとproposalを渡し、completion enrollmentとsourceからの全digest / contract再生成を必須にする
8. source validatorが返した同一proposalについて、plan、train、F / E、3つのtraining contractを相互照合する
9. その後で初めてruntimeと他の入力artifactを確認する

ready successor自身が`parent_completion_evidence_enrolled: true`と書くだけでは認証にならない。production validatorは現在のclosed registryでcompletion enrollmentが`null`であることを確認して停止するため、synthetic successor、自己申告した`upstream`、自己申告した`materialization_boundary`だけからcontractを発行できない。

テストでは、step 4のSTOP時にartifact readerとruntime readerのcall countがともに0であることを直接確認した。STOP例外も次をすべて`false`として持つ。

- artifact read authorized
- Torch runtime read authorized
- training contract issued
- training dispatch authorized

## exact pathとschema pair

v2 routeが受け付けるpathは次の1つだけである。

```text
ml/protocols/floodgate-q1-2026-fresh-qat-execution-plan-v2.json
```

`.copy`を付けたnear path、同名へのsymlink、別directoryの類似名は拒否する。既存v1のexact routeとWCSC36 fallbackは維持した。

artifact schema resolverに追加した組み合わせも1つだけである。

| execution plan                                | training contract                                  | result   |
| --------------------------------------------- | -------------------------------------------------- | -------- |
| `shogi-floodgate-fresh-qat-execution-plan-v2` | `shogi-floodgate-fresh-qat-training-experiment-v1` | accepted |

学習条件はv1から変えていないため、training contractは既存v1 schemaを使う。v2 planとWCSC36 contract、v1 planと架空のv2 contractなどのhybridはすべて拒否する。

## FとEをどこまで束縛するか

ready successorは次の式をtyped-exactに満たす必要がある。

```text
input_parents = 24000
forced_parents_skipped = F
emitted_parent_groups = E
F + E = 24000
model_training_parents = E
```

さらにEは次のすべてで同一でなければならない。

- successorのparent accounting
- parent-accounting proposal
- proposalが持つexact train identity
- execution planの`inputs.model_training`
- seed 42 / 43 / 44のtraining contract

`0 < E < 24000`は、登録済みinput / completion / trainのexact bytesからproduction validatorがproposalを再計算し、そのproposalとtrainのbytes / SHA-256 / records / parents / games / semantic IDsが完全一致する場合だけ許す。replacementとresamplingは0、emitted orderは保存済みでなければならない。

`E = 0`というsuccessor上の**宣言**は、source authenticationより前にfail closedする早期例外である。これは24,000件が認証済みforcedであることを証明せず、parent-accounting materializerのliteralな`STOP-no-trainable-parent-groups` receiptを返すものでもない。一方、この早期例外ではtraining contract builderへ到達しない。

## 変えていないもの

training、slot、selection contractのcanonical identityはそのままである。

| contract      | canonical SHA-256                                                  |
| ------------- | ------------------------------------------------------------------ |
| training      | `b0bf9dbd2342b8be325fae4d195e9bdd909a702361d229293f30849f1348d8ac` |
| seeds / slots | `aab83502378adca6557e4ba0d9da4cf545061eed8d15b1aeae0b99b8a41ffeed` |
| selection     | `9aeade0c64556bd8c3b59bff7b1b1cedb386d2226a4ce60fc7b59677d305352c` |

seed 42 / 43 / 44、モデル、loss、optimizer、learning rate、20 epoch、selection gate、holdout policyは変更していない。selection reader、holdout reader、production weight writeは、将来ready successorが追加されてもこの段階では`false`のままである。

## AWS、GCP、Vercelはどこで使うのか

この変更にはAWSは不要で、実際に使っていない。ローカルCPUでstdlib testとhash検証を行っただけである。network accessも0である。

Firebase Cloud FunctionsがGCP上で動くこと、VercelがWeb deploymentを担当することはその通りだが、どちらも今回の評価関数学習入口の検証とは別系統である。

| infrastructure  | 今回の用途                  |
| --------------- | --------------------------- |
| ローカルMac CPU | verifierと153 stdlib tests  |
| AWS             | 使用なし                    |
| Firebase / GCP  | 使用なし                    |
| Vercel          | 使用なし                    |
| Torch           | 実学習・checkpoint readなし |

将来、大量teacher生成を別のcomputeへ移す判断はあり得るが、それは実データ量と所要時間を見て決める別PR / 別運用である。今回の安全gateを成立させるためにAWSを導入する必要はない。

## 検証結果

source-authentication remediationのcode commitは`7af69a1fe518ff3f2c64a7238d695d173f642e87`、test commitsは`0aaa09aae018f90648edccd9763e55c06103f031`と`f9fee197def90681c1444dc68a646b7f5f06a936`で、履歴は書き換えていない。

- 新v2 dispatch + route test: 20 / 20 PASS、0.041秒
- repository全stdlib suite: 153 / 153 PASS、10.575秒
- Python compile: PASS
- JSON validation: PASS
- `git diff --check`: PASS
- actual teacher / training artifact / Torch training / selection / A/B / live weight write: 0
- CI: pending
- 初回independent review: P0 / P1 / P2 = 0 / 1 / 2、remediation後の再review: pending

敵対ケースには、successor欠落、near / symlink path、v2を指す`Path` / `bytes` / `str` subclass、wrong schema、v1/v2/WCSC36 hybrid、boolをintとして渡す型alias、F+E不一致、partial / full / all-forced宣言、proposal / train identity drift、input / completion / trainのexact-byte drift、未登録synthetic input / completion、自己申告upstream、replacement、slot drift、contract drift、authority escalation、duplicate key、`NaN`、既存registry driftを含めた。

machine-readable evidenceは[`floodgate-fresh-qat-v2-execution-dispatch-2026-07-18.json`](./data/floodgate-fresh-qat-v2-execution-dispatch-2026-07-18.json)にある。

## 次に必要なこと

次は、production finalizerが認証したcompletion evidence、実train bytes、parent-accounting proposalを完成させ、production source-accounting validatorがそのenrollmentとexact input / completion / train bytesからproposalを再生成できる状態にすることである。その後にv2 execution planを作り、別のdata-only PRでready successorを新規追加する。successorの自己申告だけではこのgateは開かない。

そのPRでもCIと独立reviewが通るまではsuccessorを追加しない。追加後も許されるのは学習dispatchまでであり、selection、holdout、promotion、ライブ重み変更にはそれぞれ別の証拠とgateが必要である。
