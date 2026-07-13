# complete workとmetadata prefixをexplicit finalization resumeへ配線する

> [generate-and-checkpoint coordinator](./blog-shogi-floodgate-stable-proposal-coordinator.md)はsynthetic consumer、stable proposer、checkpoint、postflight、finalizerを一つのtest-only lifecycleへ接続した。しかしそのentry pointは毎回checkpointを先に通るため、checkpoint後に残った`result.json` / `manifest.json`のdeterministic prefixを再開できない。checkpointはstageをemptyまたは`work.jsonl`だけへ狭める一方、[finalizer](./blog-shogi-floodgate-stable-proposal-finalizer.md)はcomplete authenticated workとmetadata prefixをfresh authorityで安全に再開できる。このPRは両者を混ぜず、proposerとcheckpointを明示的にskipする`resume-finalization-only` coordinatorを追加する。これはsynthetic finalization resumeのruntime compositionであり、proposal生成、production engine、teacher label、学習、棋力のpipelineではない。real data、selection、fresh / legacy final holdoutは未使用・未読である。English version: [blog-shogi-floodgate-stable-proposal-finalization-resume.en.md](./blog-shogi-floodgate-stable-proposal-finalization-resume.en.md)

---

## 現在の境界

| 項目                            | 現在の状態                  | 意味                                                                                                |
| ------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| coordinator entry point         | test-onlyで実装             | explicit finalization resumeだけを公開し、generate pathと自動判定を共有しない                       |
| execution path                  | `resume-finalization-only`  | consumer、fresh lease、postflight、finalizerへ進み、proposerとcheckpointを呼ばない                  |
| boundary selection              | fixed                       | callerはconsumer / authorization / finalizer function自体を差し替えられない                         |
| required staged content         | complete authenticated work | `work.jsonl`の生成やpartial repairをせず、finalizerのcomplete-work verificationを必須にする         |
| metadata prefix resume          | finalizerへ委譲             | exact deterministic `result.json` / `manifest.json` prefixだけをfresh authorityで再開する           |
| runtime authority               | 毎回fresh                   | exact input claim、fresh stage lease、fresh postflight receiptをretryごとに再取得する               |
| success output                  | 実装                        | resume handoff factsとdeep-frozen finalization / publication receiptだけを返す                      |
| production / teacher / strength | 未実装・証拠なし            | production registry、engine authority、teacher label、training、Elo、段位、高段の安定性を証明しない |

contract、status、claim boundaryは次で固定する。

```text
shogi-floodgate-stable-proposal-finalization-resume-coordinator-v1
synthetic-consumer-postflight-authenticated-work-finalization-resume-publication-complete
test-only-synthetic-finalization-resume-composition-evidence-not-proposal-generation-engine-teacher-label-training-or-playing-strength-evidence
```

success receiptのexecution boundaryとpathも狭く固定する。

```text
test-only-fixed-boundary-composition
resume-finalization-only
```

## 1. 発見: checkpointとfinalizerは異なるstate setを受理する

checkpoint writerはfresh / resumableな`work.jsonl`を作るboundaryである。開始時stageはemptyか`work.jsonl`だけでなければならず、`result.json`や`manifest.json`があればextra entryとして拒否する。この制約はcheckpointがmetadataを誤って上書きしないために必要である。

一方finalizerは、complete workをstandalone再認証したあと、次のinitial entry setを受理する。

```text
{work.jsonl}
{result.json, work.jsonl}
{manifest.json, result.json, work.jsonl}
```

`result.json`と`manifest.json`はcomplete fileだけでなく、今回再導出したexpected bytesのzero-byte / partial exact prefixでもよい。manifestがあるのにresultがcompleteでないstate、prefix mismatch、oversize、unsafe metadata、`train.jsonl` / `val.jsonl`などのextra entryは自動修復せずmanual content reconciliationへ送る。

したがって、generate coordinatorへretry modeを足してcheckpoint errorの文字列から分岐する設計は採らない。入力contractの違う二つのentry pointを明示し、callerが`generate-and-checkpoint`か`resume-finalization-only`を選ぶ。

## 2. resumeはauthorityやverificationの省略ではない

このpathがskipするのはproposal generationとcheckpoint persistenceだけである。次はretryのたびに必須である。

- fresh consumer invocation
- callback同期invocation中のexact input claim
- fresh stage authorization lease
- callback settlement後のfresh exact postflight receipt
- complete `work.jsonl`のstandalone authentication
- consumer input bindingとのcross-binding
- result / manifestのdeterministic validationとdurability
- exclusive publicationとdestination content audit

disk上の`result.json`に保存されたpostflight structural projectionは、過去のexact object authorityではない。process crash後にlease、input claim、postflight receiptを復元したとは扱わず、fresh invocationから同じcanonical projectionを再導出する。

## 3. invocation captureと固定boundary

coordinatorは最初のfilesystem / consumer operationより前に、optionsとdependenciesのexact own data propertyを同期captureする。Proxy、accessor、symbol key、unexpected field、Proxy function、shared-backed byte viewを拒否する。root keyはcaller viewを保持せずprivate copyへ移し、caller buffer自体は変更しない。coordinator copyとfinalizerへ渡す一時copyは成功・失敗の両方でzeroizeする。

この監査では、下位authorizerがunsafeなstage basenameを拒否したあとにwrapperが未検証値からmarker pathnameを組み立てると、publication parent外をread-only `lstat`し得ることも見つかった。resumeと既存generate coordinatorの両方で、`publicationParent`をcanonical non-root absolute path、`stageBasename`をstrict direct-child basenameとして最初のcapture中に固定し、consumer / authorization / marker readより前にtraversalを拒否する。

dependenciesは高水準consumer、authorization、finalizer functionを受け取らない。moduleからimportした既存`CoreForTests` entry pointだけを呼び、その内部に既にあるsynthetic verifier、failpoint、exclusive rename / fsync seamをcaptureして渡す。proposer searchとcheckpoint dependencyはresume API surfaceに存在しない。

このためexecution boundaryは`test-only-fixed-boundary-composition`であり、production固定dependencyを使うentry pointではない。

## 4. fresh authority handoffのexact順序

clean resume invocationのauthority flowは次である。

```text
enter test consumer postflight boundary
  -> callback receives exact AuthenticatedFloodgateTrainingRows
  -> synchronously claim that exact input before the first await
  -> authorize a fresh finalizer lease over the existing private stage
  -> callback settles without a value
consumer revalidates input snapshot and closes raw / root descriptors
  -> fresh exact postflight receipt is minted
resume coordinator enters fixed finalizer
  -> consume fresh lease + exact postflight receipt
  -> verify complete work and consumer cross-binding
  -> resume result / manifest exact prefix
  -> private publication -> destination content audit
```

leaseはconsumer callback内で取得する。callbackをsettleさせてpostflight receiptをmintしたあとにleaseを取り始めると、consumer successとstage authorityの間に新しいgapができる。一方postflight receipt自体はcallback return、snapshot revalidation、descriptor closeが完了するまで得られない。coordinatorはfresh leaseをcallbackから持ち出し、mint後にexact receiptと一緒にfinalizerへ渡す。

success handoffは少なくとも次を`true`で閉じる。

```text
exact_input_claimed_synchronously
proposer_skipped
checkpoint_skipped
exact_postflight_minted
fresh_finalizer_lease_acquired
```

## 5. stage state matrix

| 開始state                                     | explicit resume pathの扱い                                                    |
| --------------------------------------------- | ----------------------------------------------------------------------------- |
| stageなし / empty stage                       | 対象外。generate-and-checkpoint pathへ戻し、自動fallbackしない                |
| zero-byte / partial / torn `work.jsonl`       | 対象外。checkpoint writerのrecovery boundaryへ戻す                            |
| complete authenticated `{work}`               | workを再認証し、result、manifestの順に作ってpublicationする                   |
| `{work,result-prefix}`                        | fresh postflightからexpected resultを再導出し、exact prefixなら残りだけを書く |
| `{work,result}`                               | resultのexact bytesをno-rewrite検証し、manifestへ進む                         |
| `{work,result,manifest-prefix}`               | complete resultを確認し、exact manifest prefixなら残りだけを書く              |
| `{work,result,manifest}`                      | exact 3-file setをno-rewrite再検証し、publicationへ進む                       |
| manifestあり・result missing / incomplete     | bytesを変更せずmanual content reconciliation                                  |
| prefix mismatch / oversize / unsafe metadata  | bytesを変更せずmanual content reconciliation                                  |
| extra entry                                   | automatic deleteをせずmanual content reconciliation                           |
| wrong run / key / stage / consumer binding    | work verificationまたはcross-bindingでfail closed                             |
| stale authorization marker                    | steal / deleteせずmanual lease reconciliation                                 |
| publication commit開始後のindeterminate state | blind retryせずmanual publication reconciliation                              |
| publicationとleaseの両方がindeterminate       | manual publication and lease reconciliation                                   |

resume-only pathはstage stateを見てgenerate pathへ切り替えない。partial workをfinalizer用metadataで包んだり、foreign contentを削除したりもしない。

## 6. deterministic prefixをfresh authorityで再導出できる条件

work headerとmanifestがbindするstage identityはparent / stage device・inode、basename、authorization contract / trust boundaryであり、retryごとに変わるlease directory inodeそのものではない。そのため同じprivate stageへfresh leaseを取り直しても、同じrun、key、complete work、consumer structural projectionなら同じresult / manifest expected bytesを再導出できる。

逆に、fresh consumer input binding、postflight projection、run、key、stage identity、work bytesのどれかが変わればexpected metadataも変わる。既存prefixが1 byteでも違えば「前回のほぼ同じresult」として採用せず停止する。prefix resumeはsemantic mergeではなく、exact deterministic byte continuationである。

complete metadata fileもfinalizer contract上は書き直さない。resume focused suiteはprefix fileのinodeと既存prefix bytesを保ったappend、およびpublished workのinode / bytes保持を検査するが、開始時からcompleteなmetadataのno-rewriteはまだ専用caseで検査していない。success receiptへpathname観測だけから開始時prefix stateを推測したclaimは追加しない。

## 7. success receiptはauthorityを外へ出さない

成功receiptは次のnarrow dataだけを含む。

```text
contract, status, claim_boundary,
execution_boundary, execution_path,
run_id, key_id,
handoff,
finalization
```

`handoff`はexact input claim、proposer / checkpoint skip、postflight mint、fresh lease、finalizer contractを記録する。`finalization`は既存finalizerのdeep-frozen content / publication / postpublication receiptである。

coordinatorはroot key、lease、postflight object、file descriptor、raw bytes、rows、transactionを返さない。receiptのcompactnessとexact top-level / handoff keys、recursive deep freeze、禁止authority keyの不在をfocused suiteで検査する。

## 8. typed failure、cleanup、retry disposition

consumer / authorization / postflight / finalizerのどこで失敗しても、coordinator successにはしない。cleanupは次を区別する。

- authorizationがleaseを返す前に失敗したらmarker pathnameをread-only再照合する
- finalizer開始前にfresh leaseが残ればcloseを試みる
- mint済みpostflight receiptをfinalizerがconsumeしていなければsingle-use claimして破棄する
- typed finalizer errorのcontent、lease、publication facetを保持する
- Proxy / unknown failureは、finalizer開始後ならpublicationとleaseを保守的にindeterminateとして扱う
- primary failureとcleanup failureを別に保持する

retry dispositionは少なくともfresh resume invocation、upstream checkpoint recovery、manual content、manual lease、manual publication、manual publication + leaseを区別する。error textやdirectory名だけからautomatic retryを選ばない。

## 9. synthetic test設計と途中証拠

focused suiteはsynthetic consumer rows / key / search result、stage上のsynthetic engine placeholder、temporary directoryを使う。complete authenticated workやprefix fixtureを作るため、tracked plan、WASM、embedded WASM、existing weight、worker sourceのbytesをidentity fixtureとして読む。tracked assetを読むこととproduction engine processを実行することは同じではなく、subject resume invocation自身はproposer searchとcheckpointを呼ばない。

resume coordinatorのfocused suiteが直接検査する範囲は次である。

- proposer / checkpoint field、hostile shared root-key view、traversal stage basenameをside effect前のcaptureで拒否する
- work-only stateからone fresh lease、exact event order、exact handoffで成功する
- result prefixとmanifest prefixをfresh consumer invocationでcomplete bytesへ戻す
- prefix fileのinodeと既存prefix bytesを保ってappendし、published workのinode / bytesを保持したままdestination exact 3-file setをauditする
- mismatched metadata prefixを変更せずmanual content reconciliationへ送る
- wrong root keyをmetadata persistence前に拒否し、work bytesとcaller keyを変更しない
- postflight mutationでfresh leaseをcloseし、finalizer前interruptionでleaseとmint済みreceiptをcleanupする
- foreign `train.jsonl`を保存してmanual content reconciliationへ送る
- stale authorization markerをstealせずmanual lease reconciliationへ送る
- post-rename interruptionをmanual publication + lease reconciliationへ保守的に写像する
- success receiptのexact keys、compactness、recursive deep freeze、禁止authority key不在を検査する

既存の関連boundary suiteは別の証拠を持つ。finalizer suiteはdifferent authenticated consumer binding、result / manifest exact prefix、invalid initial entry set、persistence failure、lease / content / publication reconciliation、hostile failureを検査する。consumer postflight suiteはpost-callback mutationとdescriptor lifecycleを、generate coordinator suiteはpostflight後かつfinalizer前のinterruptionでlease / receipt cleanupを、checkpoint / verifier suiteはpartial work recoveryとcomplete-work authenticationを検査する。

現在のresume focused suiteは、開始時からcompleteなresult / manifestのno-rewriteと、finalizer開始後に漏れたforged / Proxy failure facetを直接検査しない。関連primitiveのtestをresume coordinator固有のcoverageとして数えず、wrapper-level claimが必要ならfocused caseを追加する。

prefix fixtureはgenerate coordinatorと既存finalizer failpointでsynthetic crash stateを作り、その後fresh consumer invocationでresumeする。fixture setupとsubject resume invocationを分離し、resume APIがproposer / checkpoint surfaceを受け取らないことを検査する。

## 10. synthetic evidenceと明示的nonclaims

source、contract、日英claim boundaryを監査し、focused / related / full regression、Python stdlib、typecheck、lint、format、buildを最終実行した。以下はsynthetic resume compositionだけについての実測値である。

| validation                                     | 現在の結果                                       |
| ---------------------------------------------- | ------------------------------------------------ |
| source / contract / bilingual claim audit      | 独立監査でblocker / high / mediumの残件なし      |
| focused finalization-resume module-pin suite   | 11 / 11 PASS                                     |
| resume + related boundary suites               | 8 files、257 / 257 PASS                          |
| full Vitest / Python stdlib audit              | 105 files、1758 / 1758 PASS；stdlib 58 / 58 PASS |
| TypeScript / scoped and full ESLint / Prettier | PASS；full ESLintは0 errors、既存157 warnings    |
| production build                               | PASS                                             |

| resume coordinator successが示すこと                                   | resume coordinator successが示さないこと                                        |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| fresh exact input claim、postflight、leaseをresume lifecycleへ配線した | crash前のobject authority復元やprocessを越えるexactly-once                      |
| complete workとfresh consumer bindingを再検証した                      | proposalを特定engine binary / evalで生成したこと                                |
| deterministic metadata prefixをexact bytesとして再開した               | stable proposalがteacher score、centipawn truth、正解labelであること            |
| private publication後にdestination contentを再検証した                 | production coordinator、deployment readiness、hostile same-EUIDへのsandbox      |
| proposer / checkpointを明示的にskipした                                | real dataset、training、weight更新、QAT / int16、accuracy、Elo、段位、高段level |

HMACはkey holderが作ったcanonical bindingを認証するが、engine identity、source truth、non-repudiation、key secrecy、anti-rollbackを証明しない。prefix resumeもexternal monotonic counterを持たず、validな古いstateへのrollbackを検出したとは主張しない。

testはreal Floodgate training row、selection label、fresh final holdout、legacy final holdoutを読まない。production YaneuraOu depth-16 v7 search、training、A/B match、81Dojo較正を実行せず、model-weight byteを変更せず、既存評価関数を上書きしない。test countやelapsed timeは棋力やproduction throughputの証拠ではない。

## 11. 次はproduction teacher、その後に学習と棋力評価である

explicit resumeを閉じても、得られるのはsynthetic proposal publicationをcrash prefixから再開できるtest-only compositionだけである。次はproduction registryと固定dependencyだけを使うentry point、pinned YaneuraOu binary / evaluation authority、MultiPV 12 + strong-game played move + stable moveのcandidate union、全unique candidateのdepth-16 independent rescore、teacher label / result schemaが必要である。

その後もreal training-only parents、seeds 42 / 43 / 44のfresh retraining、QAT / production-int16 export、frozen selection、sealed final holdout、production parity、known regression、384 color-swapped pair / 768局のfixed A/B、別途authorizeした81Dojo較正が残る。

今回の`complete`は、test-only `resume-finalization-only` invocationがfresh authorityでdeterministic prefixを閉じ、private publicationとdestination auditへ到達したことにだけ掛かる。production teacherも強い評価関数も完成しておらず、安定した高段levelを示す証拠はまだない。
