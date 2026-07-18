# callerからauthority keyを受け取らないread-only current-state境界 — Floodgate v7

> 前段のexternal supervisor / verifier sourceは、署名済みenrollmentとactivationを検証するprotocolを作ったが、各security stageがauthority public keyと`ExpectedActivationHeadV1`をcallerから受け取れるsurfaceを残していた。本稿は、それらを固定したrepository外state rootから毎回fresh loadするread-only Swift source境界を記録する。これはwriter、provisioner、installed trust root、production inspectorではない。English version: [blog-shogi-floodgate-v7-authority-current-state.en.md](./blog-shogi-floodgate-v7-authority-current-state.en.md)

## 1. 結論

今回のsourceは、production用authority state rootを次の固定pathへ一意に閉じる。

`/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/state`

そこから76-byte authority public-key record、112-byte activation-head journal header、連続した200-byte journal entryをread-onlyで読み、challenge、receipt、attestation、final consumeの各stageの前後でstateが変わっていないことを確認する。public stage entrypointは、callerがraw authority keyやexpected headを注入する形を残さない。

| 項目                              | 今回の状態                     |
| --------------------------------- | ------------------------------ |
| canonical record source           | 追加対象                       |
| fixed-path read-only store source | 追加対象                       |
| real root-owned state             | 作成していない / 読んでいない  |
| writer / provisioner              | なし / なし                    |
| production inspector              | なし / 実行0                   |
| supervisor / verifier executable  | 従来どおりfixed `exit 78` STOP |
| teacher / training / A/B          | 0 / 0 / 0                      |
| live weights                      | 変更0                          |
| operational decision              | `UNAVAILABLE / STOP`           |

この境界が閉じるのは「repository callerが任意のcurrent authority stateを渡す」経路である。rootまたはoffline attacker、artifact installation、実運用のstate作成、再起動をまたぐrollbackは閉じていない。

## 2. 3つのcanonical record

すべてのintegerはbig-endianで、schema version 1、reserved 0、audience 1、purpose 1を固定する。

| Record                          | bytes | 固定layout                                                                                                    |
| ------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------- |
| `AuthorityPublicKeyRecordV1`    |    76 | `FGV7APK1` 8 + domain 4 + raw Ed25519 key 32 + `SHA-256(raw key)` 32                                          |
| `ActivationHeadJournalHeaderV1` |   112 | `FGV7AJH1` 8 + domain 4 + entry size `UInt32BE` 4 + journal ID 32 + key ID 32 + key-record SHA-256 32         |
| `ActivationHeadJournalEntryV1`  |   200 | `FGV7AJE1` 8 + domain 4 + sequence `UInt64BE` 8 + previous-record SHA-256 32 + `ExpectedActivationHeadV1` 148 |

entry 1のprevious digestはcanonical headerのSHA-256である。entry 2以降は直前entryのcanonical SHA-256へ鎖状にbindする。entryのsequenceは内包する`ExpectedActivationHeadV1.latestActivationSequence`と一致し、内包headのauthority key IDはheaderのkey IDと一致しなければならない。

別fixture [floodgate-v7-authority-current-state-golden-v1.json](../tests/fixtures/floodgate-v7-authority-current-state-golden-v1.json) は、既存cross-parser fixtureのsynthetic authority public keyと148-byte expected headをbyte-for-byteで再利用する。journal IDはsynthetic domain `shogi-floodgate-v7-authority-current-state-journal-v1`のUTF-8 bytesをSHA-256した固定値であり、運用identifierではない。

## 3. read-only storeが検証するもの

`TrustRootAuthorityStateStoreV1.swift`のproduction configurationはcallerからpathを受け取らず、固定rootとその全ancestorをheld file descriptorで辿る。test-only initializerだけがtemporary rootを内部注入できる。

source境界は次をfail-closedに検証する。

- production ancestorのexact owner / group / modeと、state root以下のsame-device / local-filesystem条件
- `O_NOFOLLOW`、path metadataとopened FD metadataの一致、前後の`fstat` identity一致
- regular fileのexact type、size、mode、owner、group、`nlink == 1`
- readerがopenできる全node（全ancestorとcommitted leafを含む）にextended ACL objectが無いこと。metadata-onlyの`pending` directoryはopenしないため、non-root readerはそのACLを検査しない
- state root、journal、committed entriesのexact visible namespace。root-only `0700` pending directoryはmetadataだけを検証し、private contentsは読まない
- entry名が`00000000000000000001.bin`から始まる20桁・gapなしの連番であること
- recordのexact 76 / 112 / 200 bytes、double `pread`結果、canonical decode、key / header / entryの全cross-link
- journal entry上限4,096

これはsource-levelのreader policyであり、signed / notarized / installed artifactの検証結果ではない。実際の固定rootはこの変更で作らず、testはtemporary directoryだけを使う。

## 4. security stageごとのfresh load

challenge発行、receipt発行、attestation発行、final consumeは、それぞれstage開始時にfresh snapshotを読む。処理中はsnapshot tokenとしてsequence、key-record digest、header digest、last-entry digestを保持し、stage完了前にもう一度loadして完全一致を要求する。途中でheadがadvanceした場合は古いstateへ自動rebaseせずSTOPする。

supervisor sessionとone-shot consumerは同じprocess内でstore instanceを保持する。security-stageのpublic callableからraw authority public key、`ExpectedActivationHeadV1`、authority store、authority path/providerを差し込むsurfaceはpublic symbol-graph gateの拒否対象になる。canonical data constructorである`AuthorityPublicKeyRecordV1.init`（検証・encode対象のkeyを受け取る）と`ActivationHeadJournalEntryV1.init`（検証・encode対象のheadを受け取る）は意図的なpublic例外であり、security-stage handoffではない。内部test helperはproduction APIではない。

ただし、enrollment / activation envelopes、repository manifest、observationなどprotocolの他のinputが全てtrustedになったという意味ではない。それらは既存の署名・transcript・artifact closure検証を引き続き通過する必要がある。

## 5. anti-rollbackの正確な上限

readerは同一store instanceのprocess lifetimeでhigh-water markを保持する。一度sequence 2を観測した後にsequence 1へ戻ること、または同一sequenceのlast-entry digestが差し替わることを拒否する。journal chainは、観測したnamespace内のgap、並べ替え、破損、部分的差し替えも拒否する。

しかしこれは**再起動をまたぐdurable anti-rollbackではない**。processが終了するとhigh-water memoryは消える。root権限またはoffline accessで、key、header、entriesを内部整合した古いsnapshotへ丸ごと戻された場合、新しいprocessには以前のhigh-waterを証明する外部anchorがない。従って、restart-persistent protection against root/offline rollbackは未成立である。

`flock`も同様に過大評価しない。readerは同じlock inodeへnonblocking shared lockを取り、contentionならSTOPする。これはそのinodeを使うcooperating writerとの調整に限られ、advisoryかつinode-scopedである。lockを無視するprivileged writerに対するsecurity boundaryではない。owner / mode / ACL / link policyは通常の非privileged mutationを狭めるが、悪意あるrootを排除しない。

## 6. future writer contractは設計だけ

将来のwriterが実装される場合のper-entry exclusive publication contractは、今回のmachine recordで先に固定する。

1. readerと同じlock inodeへexclusive `flock`を取得する
2. lock保持中にkey、header、全entry、namespaceを再検証する
3. last sequence + 1と直前canonical digestだけから次entryを作る
4. root-only `pending`へexclusive / no-followで1つのfileを作り、exact 200 bytesを書いてfileを`fsync`する
5. no-replaceのatomic operationで20桁のfinal entry名へpublishする
6. entries directoryを`fsync`し、全stateを再検証してからunlockする

これは**frozen future contract**であり、writer実装の成功報告ではない。このPRにwriter source、private key、provisioning command、root mutation、writer test runはない。実装時には別PR、negative test、release artifact reviewが必要である。

## 7. golden parserと現在のvalidation

independent Node/Vitest parserはSwift decoderを呼ばず、既存fixtureから公開鍵とexpected headを読み直して、3 recordの全byte、offset、length、SHA-256、key ID、header binding、entry chain、sequence / authority cross-linkを再構築する。fixed field、truncation、trailing byte、zero ID、broken hash、sequence driftを拒否し、exact synthetic transcriptの全388 bytesについて1-bitずつ変えたcaseも全て拒否する。

Node 22.13.0でfocused golden parserは**1 file / 7 tests PASS**した。dependency-free Swift packageは**82 / 82 tests PASS**し、release buildも成功した。単独実行した全Vitestは313.30秒、4 workersで**183 files PASS、3,245 tests PASS、1 skipped、failure 0**だった。ML standard-library suiteは**101 / 101 PASS**、ESLintはerror 0、Next production buildも成功した。merge baseは実測`985a09cf957af7b86fde6e8e0857dcd31f8b9d1b`である。implementation commit `5b7f0281811532ebb06d5c1c1f3bea2240e05b86`（tree `fbe47f96f06a946bc4ec44c04aadddded069c4d8`）とpublication commit `59cca9876b7114d2a728166aa6850ef58e452786`（tree `ce63b5fd023d4c5cf89dbeab9437fee25501172f`）はそれぞれ2系統のexact reviewを受け、P0 / P1 / P2はいずれも0だった。一方、PR、CI、remote / CI symbol-graph confirmation、target Mac compatibility probeは本snapshot時点で`PENDING`であり、PASSを先取りしない。

local Xcode 15.3 / Apple Swift 5.10のpublic symbol graphは実測516 symbols / 570 relationships、normalized SHA-256 `879f1001337dafa13f078756220990a8cb5eb106153189468f2b9ab249e1a59a`でsemantic gate PASSだった。既に実測したtoolchain transformから導出したXcode 26.5 / Swift 6.3.2 profileは516 / 609、SHA-256 `1d2cc49fc73fb21b1b99dd8bc8d68288bebbae30c907df56436767eb0150f7ce`だが、これは**derived / remote confirmation pending**であり、CI実測として数えない。

`Package.swift`は、このsnapshotのmerge baseからimplementation commitを経て、後続のservice-core target追加直前のmain `9aacb89670f566ab3b5d219e815f490580713455`まで同じblobだったことをrepository evidence testで履歴固定する。現在のmanifestは別のsource / test-only target追加により意図的に異なる。一方、現在の2つの`main.swift`は引き続きmerge baseとbyte-identicalなfixed STOP executableとして検査され、supervisorとverifierはproduction authorityを実行しない。

## 8. 今回していないこと

この変更では次を実行していない。

- canonical rootの作成、owner / mode設定、authority keyまたはjournalのprovisioning
- writer、rotation、key replacement、restart-persistent rollback anchor
- signing、notarization、Gatekeeper acceptance、outside-repository install
- zero-argument read-only production inspectorとfresh incident inspection
- production supervisor / verifier起動、incident stateのread / reconcile / mutation
- 教師生成、再学習、候補選抜、正式A/B、外部校正
- live evaluation weightのoverwriteまたはactivation

従って、棋力が改善した、安定して高段になった、productionが安全に再開できる、というclaimは0である。今回の実利は、その前提となるauthority current-state inputをcallerから固定filesystem readerへ狭めたことだけである。

## 9. 次の安全な順序

1. source、negative test、golden parser、public surfaceをexact commitでreviewし、全CI成功後に通常mergeする
2. separate PRでroot provisioner / writerとrestart-persistent rollback anchorを設計・実装する
3. release artifactをbuild、sign、notarizeし、固定pathへ別gateでinstallする
4. separate zero-argument read-only inspectorをreviewし、全不一致 / indeterminateでSTOPさせる
5. exactly one fresh inspectionが一致した場合だけ、次のproduction recovery gateをreviewする
6. 完全な教師dataから既存live weightを上書きせず別candidateを再学習する
7. candidate selection、正式A/B、外部校正、rollback rehearsalを完了する
8. 棋力・安全性・rollback証拠が揃った場合だけlive activationを検討する

現在の判断は**`UNAVAILABLE / STOP`**である。[機械可読記録](./data/floodgate-v7-authority-current-state-2026-07-18.json)は、sourceで成立したread-only/process-lifetime保証と、writer・restart-persistent保証・運用・棋力について未成立のclaimを分離している。
