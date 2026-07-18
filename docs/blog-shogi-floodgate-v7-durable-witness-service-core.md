# 将棋評価関数: durable witnessのtransaction orderingをservice coreとして閉じた

> この変更候補は、将来のdurable remote witness providerが守るtransaction orderingをSwiftのsource / test-only coreへ落とした。実service、cloud adapter、endpoint、KMS key、root writer、production entrypointは存在しない。service targetはpackage productではなく、**0 public / SPI symbols、0 production consumers**である。本番判断は引き続き **UNAVAILABLE / STOP**、live weightsは不変である。English version: [blog-shogi-floodgate-v7-durable-witness-service-core.en.md](./blog-shogi-floodgate-v7-durable-witness-service-core.en.md)

> **Publication status: LOCAL SNAPSHOT MEASURED; EXACT COMMIT PENDING.** 発見されたOP / STATE retry、endpoint-generation binding、divergent-forkの修正を以下のsnapshotとlocal測定へ反映済みである。ただしimplementation revision、独立exact-commit review、PR、GitHub CIは未確定なので、このlocal結果に本番実行のauthorityはない。

## 1. 結論

PR #504で固定したwire recordと署名検証の上に、provider-neutralな`DurableRemoteWitnessServiceCoreV1`を追加した。このcoreが固定するのは、advanceを受けたときに何を読み、何を署名し、何を一つのcommit planへ入れ、ambiguousな結果をどう照合し、どの時点までresponseを返してはいけないかである。

今回確認できたのはsource-level orderingだけである。

| 項目                                                   |                     現在値 |
| ------------------------------------------------------ | -------------------------: |
| local Swift package tests                              |         **127 / 127 PASS** |
| 新しいservice-core tests                               |           **23 / 23 PASS** |
| service targetのpublic / SPI                           | **0 public / SPI symbols** |
| package product / production consumer                  |                      0 / 0 |
| cloud resource / network request                       |                      0 / 0 |
| root state read / write                                |                      0 / 0 |
| teacher / training / formal A/B / external calibration |              0 / 0 / 0 / 0 |
| live weights change                                    |                          0 |

implementation revision、tree、PR、exact-commit review、GitHub CIはまだ`null`または`PENDING`である。local PASSをreview済みcommitやremote CIへ読み替えない。

## 2. product・public・cloud・rootから隔離した

新しいSwift targetはpackage内のregular targetだが、どのpackage productにも含まれない。依存先は既存の`FloodgateV7ExternalTrustRootProtocol`だけで、service coreを読むtargetはtest targetだけである。

独立boundary checkerはpackage graph、source file、import、forbidden capability marker、symbol graphを検査する。local Xcode 15.3 / Swift 5.10で生成したservice graphは0 symbols / 0 relationshipsで、release buildもPASSした。

sourceは`CryptoKit`、`Foundation`、既存protocolだけをimportし、`public`、`open`、`package` declaration、AWS SDK、`URLSession`、`FileManager`、environment、Darwin / Glibc、executable entrypointを持たない。checkerはtarget内のSwift sourceをrecursive scanする。これは構造上のsurface gateであり、cloud providerの安全性を証明するものではない。

既存のPR #504記事とmachine evidenceは編集していない。新しいpublicationはその履歴を上書きせず、別fileでservice-core候補だけを記録する。

## 3. transaction ordering

queryはoperation IDで一つのtransactional snapshotを読み、deployment identityとsnapshotを検証し、receiptへ署名し、同じtransactional snapshotを再読する。完全なstateが不変のときだけ返す。signed rejectionにも同じ署名後再読ruleを適用し、どちらもcommitは行わない。

deployment identityは`endpointID = SHA256("FGV7DEI1" || witnessID || storeGenerationID)`も要求する。generationを変更したまま旧endpoint IDを再利用するとconstruction時点で`STOP`する。new advanceは次の順序に固定した。

1. witness / endpoint / signer key / `storeGenerationID`とcaller role、`exactAttemptID`を検証
2. operation IDでtransactional snapshotを読む
3. persisted deployment identity、独立観測した`observedStoreGenerationID`、current checkpoint、accepted-operation countを検証
4. expected checkpoint CAS、successor chain、4,096件上限を検証
5. accepted receiptを組み立て、署名し、freshnessを検証して最後の観測時刻を保持
6. request bytes / SHA、candidate、`immutableInitialReceipt`をcreate-only operationへ入れる
7. exact commit planへdeployment identity、expected checkpoint SHA、expected operation count、replacement checkpoint、operationを固定
8. abstract commit adapterへそのplanを渡す
9. `committed`ならoperation IDを再読し、durable operationがexact一致することを確認
10. `definitiveCASLoss`なら再読し、same-request winnerのexact receipt、またはdifferent-fork winnerに対する再署名・再読済みrejectionだけを返す
11. sign、commit、reconcile、responseまでclock sampleが単調非減少で、stored receiptがまだfreshか再検証
12. reconciled durable receiptまたはexact revalidation済みrejectionだけを返す

したがって、sign failureや署名直後のclock rollback / expiryではcommitへ到達しない。commitが返ってもdurable operationを再読して一致させる前にはresponseを返さない。

ただし、atomicityを実行するのは将来のadapterである。coreが渡すclosureだけでは、checkpoint、accepted-operation count、create-only ledger、receipt outboxが本当に一つのdurable transactionで確定したとは証明できない。

## 4. ambiguous exact-plan resendとimmutable outbox

commit結果は`committed`、`definitiveCASLoss`、`transientConflict`、`ambiguous`へ分離した。`ambiguous`または`transientConflict`なら、receiptを再署名したりcurrent stateを再読して別planを作ったりしない。`exactAttemptID`を含む同じ`DurableRemoteWitnessCommitPlanV1`だけを最大3回送る。

- ambiguous後にexact planが適用済みで、次が`definitiveCASLoss`なら、再読したdurable winnerが同じoperationであることを確認して進む
- 3回すべてambiguousなら、未commitだと推測せず`STOP`
- `committed`でもmatching operationがなければ`STOP`
- `definitiveCASLoss`のsame-request winnerはdurable receiptだけを返し、different forkではfresh rejectionを署名後にもう一度exact stateへ照合してから返す
- 同じoperation IDでrequest bytes、nonce、candidateがdriftすれば`STOP`

operation recordはcanonical request bytes / SHA、accepted checkpoint、最初のsigned receiptを`immutableInitialReceipt`として保持する。retry receiptを返す前に、operationとcurrent STATEのlineageを次の条件で証明する。

- 同じsequenceならaccepted checkpointとのexact一致を要求
- 直後1手なら`previousWitnessedCheckpointSHA256 == acceptedCheckpoint.canonicalSHA256()`を含むfull successor checkを要求
- direct divergent successorは`STOP`
- immutable intermediate checkpointをsnapshotが持たないため、正当なhistoryでも2手以上先なら`STOP`

したがってunexpiredなexact retryがoriginal receiptを返せるのはaccepted checkpointそのものか、証明済みdirect successorまでである。2手以上での保守的`STOP`は明示的なavailability limitであり、multi-step historyが不正だと証明したわけではない。accepted operationのsequenceも4,096以下に固定する。

これはimmutable receipt outboxの抽象contractであって、deployed durable outboxではない。adapterはcheckpoint CAS、operation-count CAS、create-only ledger、`immutableInitialReceipt`を一つのatomic transitionとして実装しなければならない。

## 5. expiry retryとrestore generation

receipt lifetimeは最大30秒である。accepted operationのinitial receiptが期限内で、STATEがexactまたは証明済みdirect successorならexact retryは同じreceiptを返す。期限切れなら、stored operationを変更せず、accepted checkpointに対するfresh receiptへ署名し、その後transactional rereadでexact immutable operation、独立観測generation、同じ保守的lineage proofが不変だと確認してから返す。このexpiry retryはcommitを行わず、outbox内の`immutableInitialReceipt`を置換しない。

commitがdurableになった直後、response前のfreshness checkでreceiptがexpireした場合、最初のcallは`STOP`になる。後続のexact retryがfresh receiptでrecoverできるのは、STATEがexactまたは証明済みdirect successorの間だけである。2手以上進んだ後はfuture proof-carrying snapshot contractができるまで`STOP`する。未証明forkをdurable historyとして扱わないためである。

deployment identityには`storeGenerationID`を含め、snapshotは別fieldとして`observedStoreGenerationID`を持つ。両方がpinned generationと一致しなければ署名前に`STOP`する。endpoint IDは`FGV7DEI1` domain、witness ID、pinned generationを暗号学的にbindする。observed valueはrestored table dataとは独立したphysical provider metadataから得るcontractである。将来のadapterがその観測を提供できる場合のrestore検出条件を固定した。

しかしphysical table IDを読むcomponentも、generationを一意に発行・derive・rotate・保存するprovisionerも未実装である。core内のendpoint hashだけではphysical generationのuniquenessを確立しない。backup restore drillもなく、restored tableとgenerationのbinding、offline rollback排除、restart-persistent protectionは未達である。

## 6. 検証結果

local Xcode 15.3 build 15E5188j、Apple Swift 5.10、target `arm64-apple-macosx15.0`でSwift package全体を実行した。

- debug build: 0.29秒
- tests: **127 / 127 PASS**、test body 3.343秒、wall 4.11秒
- new `DurableRemoteWitnessServiceCoreTests`: **23 / 23 PASS**
- release build: PASS、Swift reported 0.65秒、wall 0.83秒
- local service symbol graph: 359 bytes、0 symbols / 0 relationships
- boundary checker: 0 products、0 external dependencies、0 production consumers、**0 public / SPI symbols**
- focused repository Vitest evidence boundary: 1 file / 5 tests PASS

23 testsは署名後query / rejection reread、role / independently observed generation mismatch、sign / commit failure、commit後reconciliation、transient / ambiguous exact-plan resend、ambiguous applied then definitive loss、same-request / different-fork CAS outcome、3回ambiguous STOP、competing fork、exact / direct-successor retry、same-sequence / direct divergent fork、未証明multi-step lineage STOP、expired retryと署名後reread、commit済みresponse expiry、commit前後とrefresh中のclock rollback、4,096境界、endpoint-generation reuse、wrong signer / aliased identityを含む。

これはlocal source/test evidenceである。implementation revision、exact commit review、PR、GitHub CI symbol graphはまだ確定していない。

## 7. AWSへ実装するときに残る差

AWSはまだresearch candidateであり、provider選定もresource作成もしていない。次のofficial primary docsは、将来のadapterが確認すべきservice semanticsを示す。

- [DynamoDB read consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html): strongly consistent readはtable / LSIで明示的に選ぶ必要があり、GSI / streamは対象外
- [DynamoDB condition expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html): create-only putとconditional updateの基本
- [DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html): same-Regionのall-or-nothing transaction、conflict、client token idempotency
- [DynamoDB point-in-time recovery restores](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/pointintimerecovery_restores.html): restoreは新しいtableを作るため、新generation identityとのbindingが別に必要
- [AWS KMS asymmetric key specs](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html): `ECC_NIST_EDWARDS25519`とraw-message `ED25519_SHA_512`

DynamoDBのtransaction client tokenは10分のidempotency windowであり、このserviceが要求する4,096件のimmutable operation ledgerやdelayed retry contractの代替ではない。global-table replication、stream、backupへのpropagationもsame-Region transactionと同じatomic viewだとは扱わない。

現時点ではDynamoDB table、Lambda、API Gateway endpoint、IAM authorization、mTLS identity、KMS key、alarm、backup、restore generation、failure injectionはすべて0である。real strongly consistent transactional read、physical TableId observation、physical-generation uniqueness enforcement、proof-carrying multi-step lineage、root writer、PREPARE recoveryもない。単一provider operator / signerの共謀、split view、malicious signer、regional control-plane rollbackも除外していない。

## 8. 次のgate

次はこの実装をexact commitとしてsealし、独立review、PR CI、通常mergeを完了する。その後も順序は次のままである。

1. fixed provider adapterでabstract commit plan、real strongly consistent transactional read、independent physical table-ID observationをatomic durable storeへ実装
2. proof-carrying multi-step OP / STATE lineageを追加するか、explicitなone-step retry-window policyを固定
3. KMS signer、physical-generation provisioning / uniqueness、endpoint enrollment、TLS / mTLS、authentication / authorization、rate limit、auditを固定
4. restore generation provision / rotation、backup / restore、crash / retry / outage test
5. root writer / provisioner / release installer / inspectorを別gateで実装
6. 全protected handoffへremote witnessをfail closedで組み込む
7. target Macで安全なproduction probe
8. teacher 100 → 500 → 24,000、再学習、候補選抜、formal A/B、外部校正
9. 全証拠とrollback rehearsal後にだけlive変更を検討

このsource coreのmergeだけではproduction recoveryを再開しない。結論は **UNAVAILABLE / STOP**、棋力改善もstable high-danも未証明で、live weightsは変えない。
