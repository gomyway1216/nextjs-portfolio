# 将棋評価関数を強くする前に: clean-room教師生成を3段階で再開する安全gate

> この変更で評価関数やlive環境はまだ変わりません。PR1で作ったclean-room準備capabilityを、同じ認証済みV3 work stream上の100件 → 500件 → 24,000件へ結ぶための、source/test-only所有境界を追加しました。実private copy、教師process、label生成、再学習、A/B、live activationはすべて0回です。English version: [blog-shogi-floodgate-v7-clean-room-run-gates.en.md](./blog-shogi-floodgate-v7-clean-room-run-gates.en.md)

## 1. 今回解いた問題

24,000件を一度に走らせると、runtime配線、容量不足、checkpoint再開、終了処理のどこに問題があるかを切り分けにくくなります。一方、100件・500件・24,000件を別fileとして作ると、後段が前段を本当に認証して再開した証拠になりません。

今回の境界は次を同時に固定します。

- PR1のtest準備capabilityを1回だけ消費し、その場でmintしたopaque grantだけを受け付ける
- workを作る前に、準備済みfilesystemで20 GiB以上を測る
- 既存の自己清掃型parent coordinator coreで1つのtest-origin coordinatorを作り、checkpoint handoffを1回だけclaimする
- その同じhandoffを保持したまま、100 → 500 → 24,000の権限を1つずつ発行する
- 各段階でdeployment-key V3 coreが成功・lease close後に登録した、同一objectの未claim receiptだけを受け付ける
- 500は100をexact resumeし、finalは500をexact resumeしたreceiptだけを受け付ける
- 失敗時はownerをabort/drainしてからcloseへjoinし、partial stateを消さない

package command、固定private runner、本番lease、production key authority、label finalizer、trainer、weight activationは追加していません。

## 2. 20 GiB gateで公開しないもの

容量測定はcheckpointと同じprepared publication filesystem上で行います。測定前後にclean-room root、publication parent、state rootのdirectory identity、owner、`0700` modeを再確認し、publication/stateが空であることも再確認します。固定thresholdは正確に次です。

`20 × 1024 × 1024 × 1024 bytes`

receiptとerrorが外へ返すのは次だけです。

| 項目                   |         公開値 |
| ---------------------- | -------------: |
| minimum                |         20 GiB |
| threshold通過          | true / failure |
| 正確な空きbytes        |         非公開 |
| path / HOME / volume名 |         非公開 |
| 使用率                 |         非公開 |

容量不足でwork namespaceが空と再確認できた場合は、`definitely-absent-fresh-retry-allowed`です。executorを呼ぶ直前からは保守的にpartial扱いにします。失敗後にabort/drainとcloseがすべて成功し、preflight時と同じ3 directory identityでpublication/stateが空だと再確認できた場合だけ、definitely absentへ戻します。それ以外は`preserved-partial-reconciliation-required`です。

## 3. 同じstreamをどう証明するか

各gateのexecutorは、現在activeなopaque authorityを1回だけclaimできます。さらに、返却receiptはdeployment-key V3 coreがcheckpoint成功とlease closeの後にWeakSetへ登録したexact objectでなければなりません。このreceipt claimも1回限りです。clone、forged object、replay、production/test registryの取り違え、deployment keyを通らないraw test coreのreceiptは拒否されます。次のauthorityは前gateのreceipt provenanceと内容の検証が終わるまで作られません。

| order | gate                 | completed | exact resumed | records | sealed |
| ----: | -------------------- | --------: | ------------: | ------: | ------ |
|     1 | `durable-prefix-100` |       100 |             0 |     102 | false  |
|     2 | `durable-prefix-500` |       500 |           100 |     503 | false  |
|     3 | `sealed-final-24000` |    24,000 |           500 |  24,004 | true   |

3 receiptでは、次をすべて一致させます。

- 生成時に内部で作った同じrun ID
- deployment key ID
- stage basename、parent device/inode、stage device/inode
- 100 milestone MAC
- 500 milestone MAC

さらにwork bytesは単調増加し、各段階のdigestは異なる必要があります。run ID、stage identity、MAC、work digestは検証にだけ使い、clean-roomの公開receiptへは出しません。

## 4. 既存認証を作り直さない

この層はHMAC、key derivation、stage lease、training-row authenticationを実装し直していません。親processは任意factoryではなく既存の自己清掃型parent coordinator coreで作り、`claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests`から1回だけ受け取ります。coordinator初期化の途中で片側runtimeが失敗した場合も、既存coreが開始済みの兄弟runtimeを回収します。

今回のexecutorはinjected test seamなので、通過したreceipt自体はoperational evidenceではありません。ただしsource境界は手作りreceiptを受け付けず、既存deployment-key V3 test core由来のexact successful receiptを要求します。composition testではこのprovenance claimだけを明示的にstubし、別の実V3 testでclone、replay、registry取り違え、raw test-core receiptの拒否を検証しました。実際のauthenticated JSONL、milestone、exact resume、sealも既存V3 checkpoint integration testで引き続き検証しています。production-origin APIへfallbackするrouteはありません。

## 5. 失敗時の扱い

| failure位置                                         | work state             | 次の扱い                                              |
| --------------------------------------------------- | ---------------------- | ----------------------------------------------------- |
| 20 GiB未満、かつnamespace空                         | definitely absent      | 容量確保後にfresh invocation可                        |
| executor開始前                                      | definitely absent      | fresh invocation可                                    |
| prepared stateがすでに非empty                       | may exist              | 自動削除せずreconcile                                 |
| executor開始後                                      | まずmay exist          | abort/drain、close join、同一identity＋空状態を再検証 |
| executor失敗後、cleanup成功・同一identity・空状態   | definitely absent      | fresh invocation可                                    |
| executor失敗後、出力あり・identity変化・cleanup失敗 | may exist              | 自動削除せずreconcile                                 |
| receipt continuity不一致                            | may exist              | 証拠を採用せずreconcile                               |
| final後のclose failure                              | sealed state may exist | success扱いせずreconcile                              |

error message、stack、JSON fieldにはdependencyの例外、path、容量値、run ID、MACを含めません。failure observerもphase、state disposition、cleanup failure countだけを受け取ります。

## 6. 実測したtest

| 検証                                                           |                     結果 |
| -------------------------------------------------------------- | -----------------------: |
| 新規run-gates test                                             |   1 file / 13 tests PASS |
| clean-room preparation + run gates + parent coordinator        |  3 files / 59 tests PASS |
| stage + row + deployment key + V3 checkpointを含むaffected set | 7 files / 298 tests PASS |
| TypeScript no-emit                                             |                     PASS |
| targeted ESLint                                                |                     PASS |

新規testはexact 20 GiB境界、容量不足、nonempty partial state、opaque grantとsingle-use claim、100 → 500 → final順序、exact 0 → 100 → 500 resume、stage continuity破壊、coordinator片側初期化失敗の自己清掃、executorのclaim前後の失敗、出力後reject、empty directory identity差し替え、abort/drain/close join、sanitized errorを確認します。実V3 checkpoint testはreceiptのclone・replay・registry取り違え・deployment-key迂回を拒否することも確認します。

## 7. 現在のoperational state

- real private copy: 0
- private input read: 0
- teacher process / teacher row: 0 / 0
- label finalizer: 0
- training / candidate selection: 0 / 0
- formal A/B / external calibration: 0 / 0
- live weight change / activation: false / 0

したがって、このPRは「強くなった」証拠ではありません。得られたのは、教師生成を始める前に容量、所有権、順序、再開、失敗回収をreviewできるsource/test contractです。

次のoperational変更はこのPRのCIと独立reviewが閉じた後、別の明示的gateで行います。最初に実行可能にするのは100件だけで、500件と24,000件は前段の実測receiptを通過しない限り開きません。sealed finalができても、label projection、retraining、候補選抜、formal A/B、外部校正、live activationはそれぞれ別gateのままです。

Machine-readable evidence: [floodgate-v7-clean-room-run-gates-2026-07-18.json](./data/floodgate-v7-clean-room-run-gates-2026-07-18.json)
