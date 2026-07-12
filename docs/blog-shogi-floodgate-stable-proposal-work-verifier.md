# complete stable-proposal workを単独で認証する

> [前段のcheckpoint](./blog-shogi-floodgate-stable-proposal-checkpoint.md)は、完成したstable-proposal artifactをprivate stageの`work.jsonl`へHMAC chain付きでdurableに保存した。しかし次のresult / manifest finalizerへ渡すには、checkpoint writerのin-memory stateに頼らず、受け取ったbytesだけから「header、全proposal、sealが同じrun / key / stage / producer contractのcomplete streamである」と再検証できなければならない。このPRは、そのための高水準API `verifyAuthenticatedFloodgateStableProposalWork`を追加する。parser、producer receipt再構築、MAC scannerはmodule内に閉じ、completeなin-memory streamだけを受理する。これはsynthetic-onlyのcontent verifierであり、consumer postflight、publication、teacher label、学習、棋力の証拠ではない。real training data、selection、fresh / legacy final holdoutは読んでいない。English version: [blog-shogi-floodgate-stable-proposal-work-verifier.en.md](./blog-shogi-floodgate-stable-proposal-work-verifier.en.md)

---

## 現在の境界

| 項目                          | 現在の状態    | 意味                                                                                                               |
| ----------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------ |
| standalone verifier           | 実装          | filesystemやwriter stateへ触れず、受け取ったcomplete `work.jsonl` bytesを検証する                                  |
| public surface                | 高水準APIのみ | entrypointとcontract用の型・定数だけを公開し、低水準parser / reconstruction / scanは非公開にする                   |
| exact evidence                | 実装          | exact work SHA-256、bytes、run、key ID、stage binding、authenticated header / sealを返す                           |
| semantic binding              | 実装          | stage / run / key / operational設定を除いたproducer input / outputのprojectionをdomain-separated SHA-256へ固定する |
| active runtime authority      | 対象外        | stage authorization receiptの構造は検査するが、active leaseをclaimせず、現在のdirectoryを再openしない              |
| partial checkpoint recovery   | 対象外        | prefixやtorn tailは修復せず拒否する。resumeはcheckpoint writerの責務である                                         |
| postflight / publication      | 未実装        | consumer close、result / manifest、exclusive rename、destination reopenを証明しない                                |
| teacher / training / strength | 証拠なし      | teacher score、weight更新、loss、Elo、段位、高段の安定性を証明しない                                               |
| real data / holdout           | 未読          | temporary directoryとsynthetic artifact / keyだけを使う                                                            |

verifierのstatusとclaim boundaryは次で固定した。

```text
verified-complete-authenticated-stable-proposal-work
key-holder-authenticated-complete-work-content-only-not-consumer-postflight-publication-teacher-label-or-playing-strength-evidence
```

## 1. writerから独立したcomplete-stream検証

checkpoint writerはresumeのためにvalid prefixや限定的なtorn tailを扱う。一方、次段へ渡すverification receiptは「途中まで正しい」を成功にしてはいけない。standalone verifierはboundedなnon-shared `Uint8Array`を同期的にcopyし、strict UTF-8、canonical JSON、1 record 1 LF、header → dense proposal entries → sealという全体形を再解析する。

空、final LF欠落、途中fragment、empty / oversized line、BOM、NUL、CR、invalid UTF-8、record過多、seal後の追加recordはすべて拒否する。入力をtruncateしたりappendしたりせず、filesystemにも触れない。partial recoveryとdurability repairはwriter、complete content verificationはverifierという責務分離である。

## 2. 外からrun、key、stageを与える

APIはwork bytesに加えて、32-byte root key、64桁lowercase hexの`runId`、opaqueな`keyId`、stage authorization receiptを要求する。work内の自己申告だけで認証contextを選ばせず、呼び出し側が期待するrun / key slot / stageを外から指定する。

root keyと`runId`からcheckpointと同じHKDF-SHA-256 keyを導出し、header、各entry、sealのHMAC chainを同じdomain separationで再計算する。wrong root key、run、key ID、別stage receiptは失敗する。stage-only writerがpayloadとunkeyed checksumを一緒に書き換えても、外部key contextと一致するchainは作れない。

ただしkey holder自身はvalid chainを作れる。これはkey-holder-authenticated content integrityであり、non-repudiation、key secrecy、engine process identity、anti-rollbackの証明ではない。

## 3. producer receiptをbytesから再構築する

MACだけが通っても、nested proposalの意味やproducer receiptの対応が壊れていれば受理できない。verifierはheaderの`producer`、headerのinput、各entryの`proposal`、sealのoutputからcanonical stable-proposal artifactを再構築する。

再構築したrows、JSONL、proposal receipt、receipt JSONを既存のstrict artifact captureへ通し、そのartifactと外部run / key / stage contextからexpected header、全entry、sealをもう一度生成する。最後に、受信bytesとexpected bytesをlengthも含めてtiming-safeにexact比較する。このため、HMACを正しく再署名したとしても、parent linkage、seal output、semantic fingerprint、proposal receipt identity、nested proposal shapeの不整合は落ちる。

低水準のline parser、artifact reconstruction、MAC scanをexportしないのは、途中状態や部分検査を別の成功contractとして誤用させないためである。公開するのはcomplete streamを入力し、narrow receiptを返す高水準entrypointだけである。

## 4. exact evidence層

成功receiptの`evidence`は、検証した物理的・認証contextを保持する。

- `work.bytes`とexact work SHA-256
- 外から与えた`run_id`と`key_id`
- authorization contract / trust boundary、stage basename、parent / stage device・inode
- MAC認証済みのheader全体とseal全体

receipt全体はdeep-freezeされ、header / sealも入力objectへの参照ではなくstrict parse後のcaptureである。この層は「どのbytesを、どのrun / key / stage contextで認証したか」を照合するために使う。stage、run、keyのどれかが変わればheader MACとwork bytesが変わるので、exact work SHA-256も変わる。

## 5. operational-free semantic binding層

同じproposalの意味を別stageや別runでも照合するため、exact evidenceとは別に`semantic_binding`を返す。projectionは次だけを含む。

- semantic-binding schemaとcheckpoint schema
- producerのproposal schema、status、claim boundary、semantic run fingerprint
- authenticated producer input
- sealed proposal output

worker count、watchdog、Node versionなどのoperational field、stage device / inode、run ID、key ID、HMAC tagはprojectionへ入れない。stable proposerのsemantic run fingerprintがplan、engine assets、required search contractとcaptured parentsを既にbindし、operational configurationを意図的に除外する既存contractを引き継ぐ。projectionは専用domainとNUL separatorを付けたcanonical JSONのSHA-256へ固定する。

この二層により、exact evidenceはbyte-level custodyを、semantic bindingは運用幅やstageが変わっても同じproducer input / output意味であることを表せる。後者もengine authenticationやteacher correctnessへは拡張しない。

## 6. work SHA-256をsemantic IDに使えない理由

synthetic testでは、同じproposal意味を別stage、別run、別key context、または別operational worker設定へ置くと、5つのexact work SHA-256はすべて異なった。headerがstage identity、run ID、key ID、producer operational receiptをbindし、MACもcontextごとに変わるため、これは必要な差である。

一方、5件のsemantic-binding SHA-256は1つに一致した。proposalのinput / output意味は変わっていないからである。したがってwork SHA-256をsemantic identityとして使うと、同じ探索結果が運用上の再配置だけで別物になり、逆にsemantic digestだけではどのstage bytesを検証したかを特定できない。result / manifest finalizerは、用途を混ぜず両方をbindする必要がある。

## 7. root keyの扱いとzeroization

verifierはcallerのroot-key viewをそのまま保持せず、同期的に32-byte internal bufferへcopyし、run saltとderived keyも専用bufferで扱う。成功・失敗のどちらでも`finally`でinternal root-key copy、salt、derived keyをzeroizeする。verifier自身はroot keyやderived keyをresultやerrorへ追加せず、通常writerが生成したsynthetic workにもkey bytesが現れないことをtestする。ただしauthenticated payload内にcallerが同じ文字列を意図的に埋めた場合までredactするcontractではない。

callerが所有する元の`Uint8Array`まではzeroizeしない。外部key providerは呼び出し後の元buffer lifetimeを別途管理しなければならない。またJavaScript runtime全体から過去のcopyが完全に消えたことを証明するcontractでもない。ここで保証するのはverifierが明示的に作ったkey-material bufferのbest-effort cleanupである。

## 8. structural receiptとruntime authorityは別物

`stageAuthorizationReceipt`はexact keys、authorization contract / trust / status、allowed entry list、安全なbasename、nonnegative deviceとpositive inodeをstrictに検査する。work headerのstage bindingを同じreceiptから再生成するため、別stage用bytesの流用は失敗する。

しかしstandalone verifierはactive `FloodgateTeacherStageLease`を受け取らず、lease registryをclaimせず、stage directoryや`work.jsonl`をreopenしない。receiptは過去のauthorization構造を示すデータであって、今この瞬間のexclusive runtime authorityではない。current path identity、mode、owner、file set、durability、namespace exclusivityはcheckpoint / publication側の別contractで検証する必要がある。

## 9. synthetic evidenceと非claim

standalone verifierのtestは5 / 5、既存checkpoint testと合わせて23 / 23を通過した。coverageはexact deep-frozen receipt、同一stageのfresh receipt間の安定性、wrong key / run / key ID / stage、torn bytes、final LF欠落、seal後record、fully re-signed semantic tamper、stage / run / key / operational-only設定を変えたexact-vs-semantic二層の差を含む。すべてsynthetic artifact、synthetic key、temporary stageであり、real Floodgate dataもprotected labelも入力していない。

| このPRが示すこと                                               | このPRが示さないこと                                               |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| complete workのHMAC chainとcanonical contentを単独再検証できる | active lease、current filesystem identity、durability、publication |
| exact bytes / run / key / stage evidenceを返せる               | consumer callbackの成功やpostflight / close                        |
| operational-free semantic bindingを別に返せる                  | result / manifest完成、teacher scoreの正しさ                       |
| partial / torn / re-signed semantic corruptionを拒否する       | real engine authentication、real training dataset、weight更新      |
| synthetic 5件、checkpoint合計23 / 23のcontract evidence        | accuracy、loss改善、Elo、段位、安定した高段level                   |

HMAC-validなcomplete proposalはまだ候補探索のartifactであり、teacher labelではない。model weightは1 byteも更新されておらず、既存評価関数へ上書きもしていない。

## 10. 次はresult / manifest finalizer

次段は、このverifier receiptを入力にしてresult / manifest finalizerを閉じる。想定crash stateは`{work}`、`{work,result}`、`{work,result,manifest}`であり、resultを書いてfile syncとdirectory syncを完了し、その後manifestを書いて同じ順にdurable化する。manifestはworkのexact evidenceとsemantic binding、result bytes、consumer binding、proposal / checkpoint receipt、postflightとdescriptor close成功をbindしなければならない。

その後にだけ、exclusive stage publication transactionへ渡し、destination reopenでpublished namespaceを再検証できる。さらにproduction coordinator、pinned YaneuraOu depth-16 v7 teacher、real training、3 seed、QAT / int16、selection、sealed final holdout、paired A/B、81Dojo較正が続く。

今回できたのは、writer stateなしでcomplete authenticated workを再検証し、exact custodyとsemantic identityを混同しないreceiptを作るところまでである。consumer postflight、publication、teacher、training、棋力は未証明であり、安定した高段levelを示す証拠はまだない。
