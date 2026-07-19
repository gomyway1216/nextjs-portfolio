# 将棋評価関数: AWS witness adapterの契約だけを先に閉じた

> この変更候補は、durable remote witnessをAWSへ接続するときに必要なDynamoDB / KMSの要求・応答・失敗条件を、別Swift packageの純粋データ契約として固定した。AWS SDK、認証情報、network、Lambda、IaC、実resource、production entrypointは一切ない。本番判断は引き続き **UNAVAILABLE / STOP**、teacher・training・live weightsも不変である。English version: [blog-shogi-floodgate-v7-aws-witness-adapter-contract.en.md](./blog-shogi-floodgate-v7-aws-witness-adapter-contract.en.md)

> **Publication status: LOCAL PASS; REVIEW REMEDIATION APPLIED; PR #508 REREVIEW / CI RERUN PENDING.** localのdebug / releaseはSwift 22 / 22、repository互換9 / 9、boundary checkerがPASSした。元の固定implementation / publication snapshotの独立再reviewはP0 / P1 / P2すべて0だったが、その後のPR reviewとSwift 6.3.2 CIで2件を修正したため、新しいexact headの再reviewと全checkが終わるまで本番authorityはない。

## 1. 結論

前段の`DurableRemoteWitnessServiceCoreV1`は、STATEとOPを一つのtransactionで読むこと、STATE CAS・create-only OP・immutable receiptを一つのcommit planへ入れること、曖昧な結果では同じplanだけを再送することを抽象契約として固定した。しかし実providerへ落とす直前には、AWS固有の「どのitemを何件読むか」「transactionを何actionにするか」「KMSのDER keyをどう読むか」「restore後のtableをどう別generationと認識するか」が未定義だった。

今回、その空白を次の5つへ分けて閉じた。

| 契約                | 固定した内容                                                             |
| ------------------- | ------------------------------------------------------------------------ |
| provider DTO        | SDKに依存しないasync request / response / failure envelope               |
| Dynamo record codec | exactな`STATE` / `OP` / `ATTEMPT` itemとcanonical decode                 |
| Dynamo transaction  | 2-item read、3-action write、36-byte以下のclient token                   |
| KMS                 | Ed25519 capability setをexact化し、実Signは`RAW` + `ED25519_SHA_512`だけ |
| store generation    | `TableARN`と`TableId`をpreflight / postflightで一致させる                |

これで「AWS adapterが将来守るべきprovider shape」はテストできるようになった。ただし既存service coreのprovider closureは **SYNCHRONOUS** で、新しいAWS provider DTOはasyncである。byte-exactな既存coreへnonblocking AWS adapterを接続することはできないため、async core successorか同等に厳密なnonblocking continuation設計が先に必要である。実SDK callは0であり、DynamoDBのdurabilityやKMS signingが実際に成立したとは主張しない。

## 2. 既存coreを1バイトも変更していない

新しいpackageは`FloodgateV7AWSWitnessAdapterContract`で、既存protocol packageへlocal dependencyを1本だけ持つ。package productは0、source targetを読むproduction consumerも0、public / SPI symbolも0である。AWS SDKを依存へ追加せず、source importは`Foundation`、`CryptoKit`、既存のpublic protocolだけに制限した。

boundary checkerは、package graph、source / test inventory、import allowlist、禁止capability、public / SPI symbol graph、CI jobをfail closedで検査し、semaphoreやsleepによるblocking bridgeも禁止する。さらに既存service coreのpackage manifest、source、tests、boundary checkerの4ファイルをbyte countとSHA-256で固定した。

| 検査                               |    現在値 |
| ---------------------------------- | --------: |
| package product                    |         0 |
| external dependency                |         0 |
| production consumer                |         0 |
| public / SPI symbol                |     0 / 0 |
| AWS SDK / network / credential API | 0 / 0 / 0 |
| 既存service-core fingerprint drift |         0 |

過去のevidence testには、external trust-root jobを守るために「workflow全体のupload-artifactは1個だけ」と数える過剰な制約があった。新しい独立jobを追加すると正当なartifact uploadまで拒否したため、厳密性の単位をworkflow全体から対象jobへ修正した。対象job内は今もexact 1件、exact action version、exact path、`if: always()`、`if-no-files-found: error`を要求する。

PR #508の初回CI run `29670280886`ではSwift tests自体は通ったが、Swift 5.10の`dump-package`だけを許していたboundary checkerが、Swift 6.3.2の正当な既定trait `[{ "name": "default" }]`をidentity / path driftと誤判定した。公式Swift 6.3.2 toolchainの実出力とlocal 5.10実出力を差分確認し、現在は既知のexact 3-key / 4-key形式だけを許す。alias、空・未知trait、未知key、identity / path driftは引き続きSTOPする。symbol graph upload失敗は、最初のpackage graph検査で終了してgraph生成へ到達しなかった連鎖失敗であり、独立したsource failureではなかった。

## 3. `TableARN`と`TableId`でrestore generationを分ける

DynamoDB restoreは別tableとして作られる。data item内にgeneration IDを書くだけでは、古いbackupに含まれた値も一緒に戻るため、物理世代を独立観測したことにならない。

契約はcallerから渡されたpreflight / postflightという2つの`DescribeTable`観測値に次を要求する。

1. pinned `TableARN`とpreflight / postflightのARNが完全一致
2. preflight / postflightの`TableId`が完全一致
3. 両方のstatusが`ACTIVE`
4. provider envelopeに未知fieldがない
5. `TableId`がlowercase ASCII UUID shape
6. generation IDを`SHA256("FGV7AWSGEN1" || length-prefixed TableARN || length-prefixed TableId)`で導出

同じARNのように見える設定でも`TableId`が変われば別generation IDになる。既存coreのendpoint IDはstore generationへ暗号学的にbindされるため、旧endpointをrestore後にそのまま使う経路はSTOPできる。

ただしpreflight → operation → postflightの実行順を強制するwrapper、実`DescribeTable` call、table provision、backup / restore drillはまだない。future async integrationでこの順序自体を実装・testする必要があり、このpackageが行うのは渡された観測値の検証だけである。

## 4. DynamoDBは2-item readと3-action writeに固定した

transactional readは順序を含めてexact 2件である。

1. `STATE`
2. requested `OP#<operation-id>`

STATE欠落、3件目、response順序drift、未知field、projection driftはSTOPする。OP欠落だけはnew operationとして許可する。`OP#`の後ろは64桁のlowercase ASCII hexだけをbyte単位で読む。PR reviewで、UTF-8上は67 byteでも文字数が足りないmultibyte入力が文字indexをtrapさせ得ると分かったため、Character indexを廃止し、同じ入力が必ず`STOP`になる回帰testを追加した。STATEのsignerはKMS bindと一致し、既存OPのendpointはSTATEと一致しなければならない。item decodeはattribute setを完全一致させ、未知attribute、型違い、leading zero付きnumber、checkpoint / request / receipt digest driftを拒否する。保存receiptはKMSから固定したpublic keyで署名を再検証する。

writeはexact 3 actionである。

1. deployment identity、store generation、checkpoint SHA、operation countを条件にした`STATE` update
2. `attribute_not_exists(PK) AND attribute_not_exists(SK)`のcreate-only `OP` put
3. 同じcreate-only条件の`ATTEMPT` put

`ClientRequestToken`はexact commit-plan SHA-256の先頭160 bitをBase32化し、`FGV1` prefixを付けた36文字に固定した。唯一のsubmit helperは検証済みcommit inputを受け、3-action requestを内部生成してexact再検証してからproviderを呼ぶ。AWS側の短期idempotency tokenだけを永久ledgerとは扱わない。遅いretryはtransaction内に永久保存するOP / ATTEMPTで照合する。attempt IDはstore-generation IDとaliasできない。

## 5. KMSはEd25519の一形だけを許可した

`GetPublicKey` responseは、pinned key ARN、`ECC_NIST_EDWARDS25519`、`SIGN_VERIFY`、signing capabilityが順序非依存でexactに`[ED25519_SHA_512, ED25519_PH_SHA_512]`であることを要求する。AWSでは鍵ごとに片方だけを無効化できない。SPKIはRFC 8410のEd25519 prefixを含む44 byteだけを受け付ける。32-byte compressed pointは、canonicalなyを要求するだけでなくRFC 8032 §5.1.3どおりxを完全復元し、曲線上に点が存在しない値、x=0なのにsign bit=1の値、8つのsmall-order pointをすべてSTOPしてからsigner key IDを導出する。CryptoKitのinitializerが受理することだけはpoint validationの根拠にしない。

鍵のcapabilityは2方式でも、このcontractの`Sign` requestはmessage type `RAW`、algorithm `ED25519_SHA_512`、grant tokenなしに固定する。responseの64-byte signatureは、bind済みEd25519 public keyを使い、元のexact RAW request bytesに対して暗号学的に検証できた場合だけ受理する。別messageのsignature、不正signature、`DIGEST`、prehash signing、ECDSA、別key ARN、0 signature、未知fieldはSTOPする。

これはKMS APIを呼ぶ実装ではない。実keyは作っておらず、IAM policy、key policy、rotation、multi-region、auditも未確定である。

## 6. 未知の成功を作らないfailure mapping

provider結果は次へ保守的に写像する。

| provider結果                                                             | coreへ返す意味      |
| ------------------------------------------------------------------------ | ------------------- |
| token一致、HTTP 200、request IDあり、未知fieldなし                       | `committed`         |
| conditional check failure                                                | `definitiveCASLoss` |
| transaction conflict / throttle                                          | `transientConflict` |
| timeout / network unavailable / internal server error                    | `ambiguous`         |
| 同じtokenのtransaction in progress                                       | `ambiguous`         |
| access denied / resource missing / validation / token parameter mismatch | `stop`              |
| 未知error                                                                | `stop`              |
| 型付けされていないthrow                                                  | `ambiguous`         |
| 200以外、token drift、空request ID、未知success field                    | `stop`              |

「SDK callがreturnしたら成功」とは扱わない。曖昧結果は既存service coreが同一planだけを最大3回再送し、その後もwinnerをtransactional rereadで照合する。

## 7. 検証結果と実測

local Xcode 15.3 / Swift 5.10、arm64 macOSで実行した。SwiftPM schema差分だけは、公式Swift 6.3.2 toolchainで同じ`Package.swift`を実行して実出力を照合した。

元のEd25519 implementation revision `ed3932f6ec9818340144abf7949545ed292b1261`（tree `e127fd5c21c6b611cd9c021257fe9c6d19a6f441`）は独立exact rereview済みである。PR review後の新しいimplementation revisionは`2fcc0d29fb756db50d5042dacf7f64562d091173`（tree `29de147b75318768c611dbbc84939c0f8154be81`）で、multibyte operation keyの安全停止とSwift 5.10 / 6.3.2 dual-schema boundaryを含む。この新snapshotの独立再reviewとPR CI rerunは未完了である。

独立再reviewはpublication revision `f332bdc8774593323ec91d567e01ca86a72ef097`（tree `8b7b5b57b6fea30dd538b725c1e1320709da7e5b`）まで確認し、P0 / P1 / P2は**0 / 0 / 0**だった。残るpublication follow-upは上のreview結果とdifferential実測を記録するだけで、実装差分はない。

- 新package tests: **debug 22 / 22、release 22 / 22 PASS**（wall 4.75秒 / 4.10秒）
- Ed25519独立differential review: **4,810 unique encoding / mismatch 0 / crash 0 / P0・P1・P2すべて0**（debug 43.816秒、release 1.727秒）
- SwiftPM実payload差分: **Swift 5.10 / 6.3.2ともPASS**、未知schema mutationはSTOP
- repository compatibility: **2 files / 9 tests PASS**
- publication boundary: **1 file / 5 tests PASS**
- boundary checker: PASS
- package products / external dependencies / production consumers: **0 / 0 / 0**
- public / SPI symbols: **0 / 0**
- 既存service core fingerprint: **4 / 4 exact**
- main `b8625cee` post-merge CI run `29666132754`とsecurity run `29666132781`: **5 / 5 job、59 / 59工程PASS**
- PR #508初回run `29670280886`: AWS jobは**schema calibrationでFAIL**、修正済み・rerun待ち
- AWS resource / network call / credential read: **0 / 0 / 0**
- teacher / training / formal A/B / external calibration / live change: **0 / 0 / 0 / 0 / 0**

この数字はsource contractの検証であり、実AWS durabilityや棋力向上の測定ではない。

## 8. 次のgate

ready PR #508は作成済みである。次はreview修正を含むexact headを独立再reviewし、PR CIを再実行して全checkを通す。その後も順序を分ける。

1. PR #508のreview修正を再reviewし、isolated AWS jobを含むexact headの全PR checkを要求して通常mergeする
2. AWS job失敗時に`Test and build`も失敗する予定中のfail-closed aggregate CI edgeをmergeする
3. dynamicなread → sign → reread/commit/retry順序を保つasync service-core successorかstrict nonblocking continuation設計を実装・独立reviewする
4. SDK-backed adapterを実装し、semaphoreやblocking bridgeなしでexact DescribeTable preflight → operation → postflight順序を強制する
5. provider emulatorでtimeout、conflict、transaction-in-progress、ambiguous applyを注入する
6. 実accountを触る前にtable / KMS / IAM / backup / restore / audit policyを別reviewする
7. non-productionでcrash / retry / restore-generation drill、全protected handoffのfail-closed接続、target Mac安全probeを通す
8. その後にteacher 100 → 500 → 24,000、再学習、候補選抜、formal A/B、外部校正へ進む

この契約で参照したAWS一次資料は、[DynamoDB TransactGetItems](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactGetItems.html)、[transaction semantics](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)、[TableDescription / TableId](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TableDescription.html)、[DescribeTable](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_DescribeTable.html)、[point-in-time restore](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/pointintimerecovery_restores.html)、[KMS GetPublicKey](https://docs.aws.amazon.com/kms/latest/APIReference/API_GetPublicKey.html)、[KMS Sign](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html)、[KMS Ed25519 key-spec table](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html)である。Ed25519のpoint encoding / verificationは[RFC 8032](https://www.rfc-editor.org/rfc/rfc8032.html)を参照した。

現在は実adapterもresourceもないため、production recoveryは再開しない。安定した高段、棋力改善、live weight変更はいずれも未立証である。
