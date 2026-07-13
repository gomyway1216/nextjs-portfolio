# generate-and-checkpointをsynthetic proposal publicationへ配線するcoordinator

> [training-row consumer](./blog-shogi-floodgate-training-row-consumer.md)、[stable-WASM proposer](./blog-shogi-floodgate-stable-wasm-proposer.md)、[authenticated checkpoint](./blog-shogi-floodgate-stable-proposal-checkpoint.md)、[consumer postflight](./blog-shogi-floodgate-consumer-postflight-capability.md)、[result / manifest finalizer](./blog-shogi-floodgate-stable-proposal-finalizer.md)は個別のsynthetic contractを閉じた。しかし個別testのPASSだけでは、exact input claim、checkpoint lease close、postflight mint、fresh finalizer lease、private publicationが正しい順序で1回のruntime lifecycleに接続されたことを示せない。このPRは固定した既存`CoreForTests` entry pointを`generate-and-checkpoint` pathとして合成し、consumer callbackからdestination content auditまでのtest-only coordinatorを追加する。これはsynthetic stable-proposal publicationのend-to-end wiringであり、production engine、teacher label、学習、棋力のend-to-end pipelineではない。real data、selection、fresh / legacy final holdoutは未使用・未読である。English version: [blog-shogi-floodgate-stable-proposal-coordinator.en.md](./blog-shogi-floodgate-stable-proposal-coordinator.en.md)

---

## 現在の境界

| 項目                            | 現在の状態                | 意味                                                                                                               |
| ------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| coordinator entry point         | test-onlyで実装           | `runFloodgateStableProposalCoordinatorCoreForTests(...)`だけを公開する                                             |
| execution path                  | `generate-and-checkpoint` | 毎回consumer、proposer、checkpointへ入り、その成功後にfinalizer / publicationへ進む                                |
| boundary selection              | fixed                     | coordinator callerはconsumer / proposer / checkpoint / finalizer function自体を差し替えられない                    |
| inner failure seams             | test-only injection       | 各固定boundaryが既に持つbundle verifier、search、checkpoint failpoint、rename / fsync seamをcaptureして渡す        |
| authority handoff               | 実装                      | exact input claim、initial checkpoint lease close、exact postflight mint、fresh finalizer leaseを順序付ける        |
| success output                  | 実装                      | finalization receiptを含むdeep-frozen coordinator receiptを返す                                                    |
| checkpoint resume               | 限定的                    | stageが`work.jsonl`だけならcheckpointのvalid prefix / complete work contractを再利用できるが、proposerは再実行する |
| finalization resume             | 次PR                      | `result.json` / `manifest.json` prefixがあるstageへcheckpointを先に通せないため、専用entry pointがまだない         |
| production / teacher / strength | 未実装・証拠なし          | production registry、engine authority、depth-16 label、training、Elo、段位を証明しない                             |

contract、status、claim boundaryは次で固定した。

```text
shogi-floodgate-stable-proposal-coordinator-v1
synthetic-consumer-proposal-checkpoint-postflight-finalization-publication-complete
test-only-synthetic-runtime-composition-evidence-not-production-engine-teacher-label-training-or-playing-strength-evidence
```

success receiptのexecution boundaryとpathも狭く固定する。

```text
test-only-fixed-boundary-composition
generate-and-checkpoint
```

## 1. 個別primitiveの成功だけではruntime compositionにならない

consumer callbackのinputは同期invocation中だけclaimできる。checkpointはexact active stage leaseをclaimして`work.jsonl`を閉じたあと、そのleaseをcloseする。postflight receiptはcallback settlement、callback後snapshot、raw / root descriptor closeがすべて成功したあとにしかmintされない。finalizerは、そのexact postflight receiptと別のfresh active leaseを必要とする。

これらをcaller conventionだけで並べると、次のgapが残る。

- input claimより前にproposerを始める
- checkpoint promiseのsettlement前にcallbackをreturnする
- checkpoint leaseをcloseせずpostflightへ進む
- postflight成功前にfinalizerへauthorityを渡す
- close済みleaseを再利用する
- finalizerに渡せなかったexact postflight receiptをregistryへ残す

coordinatorは既存boundaryを弱めず、この順序だけを1つのsuccess contractへ合成する。途中artifactを成功扱いせず、finalizerのdestination content auditと全cleanupが通ったときだけcoordinator receiptを返す。

## 2. invocationを同期captureし、module boundaryを固定する

coordinatorは最初のfilesystem / consumer operationより前に、optionsとdependenciesのexact own data propertyをcaptureする。Proxy、symbol key、accessor、unexpected field、shared backingのbyte input、Proxy functionを拒否する。

captured inputは次を含む。

- stage authorizationとconsumerのpath / revision option
- 32-byte root key、64桁lowercase hexのrun ID、opaque key ID、effective UID
- proposerのplan、WASM、embedded WASM、weights、worker source bytesのprivate copy
- workers、startup timeout、search timeout
- synthetic bundle verifierとexpected manifest identity
- injected proposer search
- checkpoint write / close / failpoint seam
- finalizer failpointとpublication rename / reconciliation / sync / close seam

root keyとproposer asset bytesはcaller viewを保持せずcopyする。`Uint8Array` subclassがpublicな`buffer` / `byteLength` getterを偽装してSharedArrayBufferやlength checkを迂回できないよう、intrinsic TypedArray getterとsetterだけでbacking storage、exact length、copyを確定する。coordinator用root-key copyは成功・失敗の両方で、hostile error inspectionや注入可能なcleanup hookより前にzeroizeし、checkpoint / finalizerへ渡す一時copyも、それぞれのfunctionが同期captureした直後にzeroizeする。

一方、coordinator dependenciesは高水準boundary functionを受け取らない。consumer postflight、input claim、proposer、stage authorization、checkpoint、finalizerはmoduleからimportした固定entry pointを呼ぶ。そのためexecution boundaryは`test-only-fixed-boundary-composition`である。ただし各entry pointの内側にはsynthetic failureを再現するtest seamが残る。これはproduction固定dependencyではなく、fixed test boundaryの配線を検査するための設計である。

## 3. exact authority handoffの順序

clean invocationのevent順は次である。

```text
input-claimed
proposal-complete
initial-lease-acquired
checkpoint-complete
fresh-lease-acquired
postflight-complete
before-finalization
```

実際のauthority flowは次になる。

```text
enter test consumer postflight boundary
  -> callback receives exact AuthenticatedFloodgateTrainingRows
  -> synchronously claim that exact input before the first await
  -> generate complete in-memory stable proposal artifact
  -> authorize initial checkpoint lease
  -> checkpoint claims the lease, persists / resumes work.jsonl, then closes it
  -> authorize a fresh finalizer lease over the existing private stage
  -> callback settles without a value
consumer revalidates input snapshot and closes raw / root descriptors
  -> exact postflight receipt is minted
finalizer consumes fresh lease + exact postflight receipt
  -> result / manifest -> private publication -> destination audit
```

initial leaseをproposer前に取らないのは、現在のcheckpointがcomplete in-memory artifactを受け取ってからpersistを始めるためである。fresh finalizer leaseはcheckpoint close後、まだconsumer callback内にいる間に取得する。postflight receipt自体はcallbackがreturnし、consumer postflightとdescriptor closeが完了したあとにだけ得られる。

success receiptの`handoff`は次を`true`で閉じる。

- exact inputを同期claimした
- initial checkpoint leaseがpostflight前にcloseした
- exact postflight receiptがmintされた
- fresh finalizer leaseを取得した
- finalizer contractが期待するexact constantと一致した

## 4. `generate-and-checkpoint` pathが閉じる範囲

coordinatorは毎回consumerへ入り、proposerを実行してcomplete artifactをmemory内で作る。そのartifactを得たあとだけinitial stage leaseをauthorizeし、checkpointへ渡す。checkpointはheader、dense proposal entry、sealをrun / key / stage / input / semantic artifactへHMACでbindし、file / directory syncとvalid-prefix resumeを担当する。

checkpoint呼び出しはleaseを同期claimするため、coordinatorは返されたPromiseをawaitしてから`checkpoint-complete`を立てる。checkpoint側の成功は、exact `work.jsonl`がcompleteで、lease closeも成功したことを意味する。そのあと同じstage pathへfresh leaseをauthorizeする。fresh lease取得までcallbackをsettleさせないため、postflight receiptがmintされた時点でfinalizerへ渡すstage authorityも揃っている。

このpathはstable search途中のper-parent progressをcheckpointしない。proposerがcomplete artifactを返す前に失敗すれば`work.jsonl`へ新しいproposal progressはなく、次回もsearchを最初から実行する。checkpoint prefixがすでにある場合でも、expected transcriptを再導出するためproposerは再実行する。

proposerはdependency-injected `search` adapterを使うsynthetic coreである。asset bytes、required tuple、semantic fingerprintをrecordしても、そのadapterがrecordどおりのproduction engine processを実行した証明にはならない。

## 5. postflightからfinalization / publicationまで

callback settlement後、consumerはpostflight snapshotとraw / root descriptor closeを完了し、exact test postflight receiptをmintする。coordinatorは`postflight-complete`と`before-finalization` hookを通したあと、fresh leaseとreceiptをfinalizerへ渡す。

finalizerは次を既存contractどおり実行する。

1. fresh lease ownershipをpublication transactionへ移す
2. exact postflight receiptをsingle-use claimする
3. `work.jsonl`をstandalone verifyし、consumer bindingへcross-bindする
4. HMAC付き`result.json`をfile sync、stage-directory syncする
5. HMAC付き`manifest.json`をfile sync、stage-directory syncする
6. exact source 3-file setを再検証する
7. exclusive renameと2段階parent syncでprivate destinationへpublishする
8. destinationと3 fileをreopenし、identity、bytes、work authentication、cross-bindingを再検証する

成功したcoordinator receiptはcontract、status、claim boundary、test-only execution boundary、`generate-and-checkpoint` path、run ID、key ID、handoff facts、deep-frozen finalization receiptだけを公開する。coordinator独自にteacher scoreやengine claimを足さない。

## 6. 現在のresume boundaryと次PRの境界

現在のcoordinatorは必ずproposerとcheckpointを先に通る。このため、retry可能性はstage entry setで分かれる。

| 開始時またはfailure後のstate                             | 現在の扱い                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| stageなし / empty stage                                  | consumerとproposerを実行し、fresh checkpointを作る                                                             |
| zero-byteまたはvalid `work.jsonl` prefixだけ             | proposerを再実行してexpected artifactを作り、checkpoint contractでresumeする                                   |
| complete `work.jsonl`だけ                                | proposerを再実行し、checkpointがexact bytesをno-rewrite検証してfinalizerへ進める                               |
| complete work後、finalizer開始前に失敗                   | errorは`resume-finalization-over-complete-authenticated-work`を示せるが、現在のexportは専用resume pathではない |
| `result.json` / `manifest.json` deterministic prefixあり | 現在のgenerate-and-checkpoint exportではresumeできない。checkpointがstageのextra entryを拒否する               |
| publication commit開始後                                 | blind retryせずmanual publication reconciliation                                                               |
| stale authorization marker                               | 自動steal / deleteせずmanual lease reconciliation                                                              |

したがって`resume-finalization-over-complete-authenticated-work`はrecovery dispositionであり、「この同じentry pointが全finalizer prefixを受理する」という意味ではない。次PRではconsumerからfresh exact postflight receiptを得たうえでcheckpointを再実行せず、complete authenticated workと既存result / manifest prefixをfinalizerへ直接渡すexplicit resume-finalization coordinatorを追加する。

process crash後にdisk上のpostflight projectionからexact object authorityを復元することもできない。retryはfresh consumer invocation、fresh synchronous input claim、fresh postflight receipt、fresh stage leaseを必要とする。

## 7. typed failureとcapability cleanup

`FloodgateStableProposalCoordinatorError`はphaseと進捗を次のfacetへ分ける。

```text
phase,
inputClaimed, proposalComplete,
checkpointStarted, checkpointComplete,
postflightMinted, freshLeaseAcquired, finalizerStarted,
mayHavePublished, leaseMayRemain,
retryDisposition, primary, cleanupFailures[]
```

phaseは`capture`、`consumer-claim-proposer`、`checkpoint-authorization`、`checkpoint`、`consumer-postflight`、`finalization-publication`、`cleanup`である。capture failureではfilesystem authorityを取らず、fresh synthetic invocationからやり直せる。

coordinator cleanupはauthorityを無言で残さない。

- checkpoint開始前のinitial leaseはcloseする
- checkpointへownership移譲後の失敗はauthorization marker pathnameをread-only再照合し、残存または観測不能ならmanual lease reconciliationへ送る
- finalizer開始前、またはfinalizerがauthority transferに失敗したfresh leaseはcloseする
- mint済みpostflight receiptをfinalizerがconsumeしていなければ、coordinatorがsingle-use claimして破棄する
- typed finalizer errorのpublication / lease facetを引き継ぐ
- Proxyや未知のfinalizer failureは、publicationとleaseを保守的にindeterminateとして扱う
- primary failureとlease / capability cleanup failureを分離する

retry dispositionはfresh rerun、complete-work上のfinalization resume、manual content reconciliation、manual lease reconciliation、manual publication reconciliation、両方のmanual reconciliationを区別する。`checkpointComplete`だけでcoordinator successにはならず、finalization receiptが完成しなければ必ずerrorで終わる。

## 8. isolated synthetic module-pin testで検査するもの

coordinator focused testは、synthetic bundle manifestのidentity constantだけをmodule graph全体で同じ値へpinする。artifact receiptを後編集せず、consumerからproposerへexact inputを渡すためのtest-only整合化である。consumer、proposer、authorization、checkpoint、postflight、finalizer本体は実際の`CoreForTests`実装を通し、temporary filesystem上でorchestrationを検査する。

- exact event orderと、各hook時点のprogress
- input claimがproposerより先に同期実行されること
- proposal完了後にinitial leaseを取得すること
- checkpoint settlement / lease close後だけfresh leaseを取得すること
- postflight mint後だけfinalizerを開始すること
- run / key、root-key copy、captured asset / optionsが同じboundaryへ渡ること
- success receiptのexact keys、deep freeze、execution path、handoff facts
- 選択した各handoff interruptionでinitial / fresh leaseとpostflight capabilityがcleanupされること
- finalizer開始前のhostile prototype / forged accessor failureをcontainすること
- complete work、finalizer prefix、manual content、authorization markerでretry dispositionが分かれること

module-pin suiteは実際のtest-only file sync、HMAC verification、consumer filesystem snapshotとinjected exclusive-rename seamを通る。ただしproduction固定rename、production bundle verifier、production engineは使わず、各下層の全adversarial matrixを重複実行するものでもない。coordinator evidenceはfocused wiring suiteと関連boundary suiteの両方を並べて解釈する。

## 9. synthetic evidenceと明示的なnonclaims

source contractと日英claim boundaryを監査し、focused module-pin test、関連boundary suite、full regression、typecheck、lint、buildを最終実行した。以下はその実測値であり、synthetic wiringの証拠だけとして扱う。

| validation                                     | 現在の結果                                       |
| ---------------------------------------------- | ------------------------------------------------ |
| coordinator source / contract audit            | 独立監査でblocker / high / mediumの残件なし      |
| isolated coordinator module-pin suite          | 16 / 16 PASS                                     |
| coordinator + related boundary suites          | 7 files、246 / 246 PASS                          |
| full Vitest / Python audit                     | 104 files、1747 / 1747 PASS；stdlib 58 / 58 PASS |
| TypeScript / scoped and full ESLint / Prettier | PASS；full ESLintは0 errors、既存157 warnings    |
| production build                               | PASS                                             |

| coordinator successが示すこと                                                                   | coordinator successが示さないこと                                            |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| fixed test boundaryをexact authority順に配線した                                                | production coordinator、production registry、production deployment readiness |
| synthetic consumer inputからproposal、checkpoint、postflight、finalizationへhandoffした         | injected search adapterが特定engine binary / evalを実行したこと              |
| complete authenticated work、HMAC result / manifest、private publicationを一つのreceiptへ閉じた | stable proposalがteacher score、centipawn truth、正解labelであること         |
| destination content audit完了後だけsuccessを返した                                              | hostile same-EUID actor、root、ACL、pre-existing capabilityへのOS sandbox    |
| enumerated failure / cleanup / retry dispositionを保持した                                      | mid-search resume、automatic stale-lock takeover、crashを越えるexactly-once  |
| synthetic runtime compositionを検査した                                                         | real dataset、training、QAT / int16、accuracy、Elo、段位、高段の安定性       |

checkpoint / result / manifest HMACはkey holderが作ったbindingのintegrityを示す。engine identity、source truth、non-repudiation、key secrecy、anti-rollbackを示さない。exact object claimは同一process内のsingle-use authorityであり、process crashを越えて永続化されない。trusted-current-EUIDのprivate `0700` / `0600` boundaryは、hostile same-EUID writerやrootへのsandboxではない。

testはtracked plan / WASM / embedded WASM / existing weight / worker-source bytesをidentity fixtureとして読み、synthetic rows、key、search adapter、stage上のengine placeholderとtemporary stageを使う。real Floodgate training row、selection、fresh final holdout、legacy final holdoutは読まず、production YaneuraOu depth-16 v7 search、training、A/B matchも実行しない。model-weight byteは変更せず、既存評価関数を上書きしない。test countとsynthetic elapsed timeは棋力やproduction throughputの証拠ではない。

## 10. 次はexplicit finalization resume、その後production teacherである

次PRでは、checkpoint後にcomplete workがあり、さらに`result.json` / `manifest.json`のdeterministic prefixが残るstateを対象にする。fresh consumer invocationからexact input claimとpostflight receiptを再取得し、standalone work verificationを通したあと、checkpointを再実行せずfinalizerへ直接handoffするexplicit resume-finalization coordinatorが必要である。publication ambiguityとstale markerは引き続きmanual reconciliationのままにする。

その後もproduction registryと固定dependencyだけを使うentry point、pinned YaneuraOu binary / eval authority、MultiPV 12 + strong-game played move + stable moveのv7 union、全unique candidateのdepth-16 independent rescore、teacher label / result schema、必要ならper-parent durable progressを閉じなければならない。

real training-only parentsをlabelしてからも、seeds 42 / 43 / 44のfresh retraining、QAT / production-int16 export、frozen selection、sealed final holdout、production parity、known regression、384 color-swapped pair / 768局のfixed A/B、別途authorizeした81Dojo較正が残る。

今回の`complete`はtest-only `generate-and-checkpoint` invocationがfinalizer / private publicationまで成功したことにだけ掛かる。production teacherも強い評価関数も完成しておらず、安定した高段levelを示す証拠はまだない。
