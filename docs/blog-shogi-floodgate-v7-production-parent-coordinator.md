# 1親をproduction runtimeへ渡すv7 coordinator

> 前段の[production runtime owner](./blog-shogi-floodgate-v7-production-runtime-owner.md)は、固定production factoryからstable / teacher runtimeを同時に初期化し、失敗時と終了時のcleanupを1つのdeadline付きlifecycleへ閉じた。ただし公開surfaceは意図的に`receipt`、`close`、`abortAndDrain`だけで、親局面を1件も実行できなかった。この変更は、ownerが保持するexact runtimeをreceiptの写しから推測せずにhandoffし、1親についてstable proposal、teacher MultiPV、candidate union、独立rescore、completed-parent projectionを順に構成するproduction parent coordinator境界を追加する。実dataset read、teacher label、checkpoint、学習、weight、live評価関数 / weight activation、対局、棋力の実行結果ではない。English version: [blog-shogi-floodgate-v7-production-parent-coordinator.en.md](./blog-shogi-floodgate-v7-production-parent-coordinator.en.md)

---

## 現在の境界

| 項目                | 現在の実装・検証                                                                                                     | この変更から言えること                                                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| owner handoff       | module-private single-use claimでexact ownerをflat operation capabilityへ変換する                                    | raw runtimeを公開せず、receipt digestを持つ別objectも受理しない                   |
| 1-parent operation  | stable proposal、teacher proposal、candidate union、全candidate独立rescore、completed-parent projection              | 1親のoperation graphをproduction runtimeへ接続できる                              |
| coordinator surface | null-prototype / frozen exact 5 keys: `receipt`、`run_binding`、`produce(request)`、`close()`、`abortAndDrain()`     | checkpointのexact 2-key controllerへ次段で射影するoperation capabilityを閉じる    |
| v2 run binding      | coordinatorがfixed plan / producer controlとownerのruntime digestから構築する                                        | callerが別timeout・別runtime identityを注入できない                               |
| deadline / cancel   | 親ごとの`AbortSignal`とv2 producer-control policyをoperationへ伝える                                                 | terminal後に新しいsearchや結果組立を始めない                                      |
| cleanup             | operation失敗時はownerの`abortAndDrain()`、正常終了側はowner lifecycleへ集約                                         | stable workerとteacher processのcleanupを別々のcaller判断に分裂させない           |
| I/O authority       | `node:fs`、dataset path、checkpoint path、root keyを持たず、test dependencyの余分なI/O-shaped keyもfactory前にreject | parent operation以外のdata / key / persistence authorityを得ない                  |
| trust boundary      | `trusted-current-process-js-realm-and-imported-structural-validator-intrinsics-v1`                                   | process / realmとimport済み構造validatorを信頼する。sandboxやattestationではない  |
| checkpoint / key    | 未接続                                                                                                               | parent input origin、durable HMAC record、official runをまだ認証できない          |
| 実行証拠            | Node v22.13.0でsynthetic / injected focused 30 / 30、関連5 files 169 / 169を実測                                     | production asset、実Floodgate親、実teacher searchの完走証拠ではない               |
| live activation     | 評価関数 / weight activation 0                                                                                       | application codeのmerge / deployとは別の状態であり、code deploy receiptは持たない |
| 棋力                | 対局・Elo・段位測定0                                                                                                 | 「強くなった」「高段で安定した」というclaimは0                                    |

## 1. なぜruntime ownerだけでは足りなかったか

runtime ownerは、2種類のproduction runtimeを同時に起動し、どちらかの初期化失敗でも既知runtimeを回収し、最初のvalid lifecycle callへ全callerをjoinさせる。しかし、owner自身は親operationを公開しない。これは前段では正しい停止線だった。operation APIを同時に公開すると、digest authority、cleanup ownership、parent authentication、checkpoint authorizationが一度に混ざるからである。

次に必要なのは、ownerのreceiptだけを見て同じshapeのruntimeを組み立てるadapterではない。必要なのは、今まさにproduction factoryから作られownerに保持されている**exact runtime object**を、限定されたcoordinatorへ一度だけ渡すhandoffである。これにより次を分離できる。

- ownerはruntime origin、receipt digest、close / abort lifecycleを所有する
- parent coordinatorは1親のproposal / rescore順序と結果組立を所有する
- 次段のkey authorityはrun IDとHMAC keyを所有する
- checkpointは入力順、resume、durability、first-terminal cancellationを所有する

このPRは2番目までを閉じる。keyとcheckpointまで同時に完成したとは扱わない。

## 2. exact owner handoff

handoffの基本条件は、plain receiptをauthorityにしないことである。`stable_runtime_receipt_sha256`と`teacher_usi_runtime_receipt_sha256`が一致しても、それだけではruntime objectのoriginを証明しない。production pathは`claimFloodgateV7ProductionRuntimeOwnerForParentCoordinator(...)`でexact owner identityをconsumeし、raw runtimeを公開せず、`FloodgateV7ProductionRuntimeOwnerParentCoordinatorHandoff`のflat capabilityだけをcoordinatorへ渡す。test側は別registryと`claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests(...)`を使い、production originを得ない。

```text
receipt
stablePropose(parent)
teacherReceipt
teacherPropose(sfen, legalMoveCount)
teacherRescore(sfen, move)
close()
abortAndDrain()
```

coordinatorはこのhandoff後も同じowner lifecycleの中に残る。runtime class、pool、worker、engine pathをcallerへ返さない。

productionとtestのhandoff registryは別のmodule-private `WeakMap`である。claimはexact non-Proxy owner facadeだけを引き、operationをcaptureする**前**にentryをdeleteする。Proxyはtrapを起動せずrejectする。したがって、同じownerの二重claim、production / test境界のcross-use、malformed test runtimeを直してretryすることはできない。stable `propose`はown arity 1、teacher `propose` / `rescore`はown arity 2、teacher receiptはown object data propertyでなければならない。返すhandoffはnull-prototypeのexact 7 keysで、全体をfreezeする。

実装が固定する詳細は次のとおりである。

- production entrypointからdependency injectionを受けない
- owner receiptのcopy、Proxy、同shape objectをhandoff authorityとして受理しない
- stableとteacherの片方だけを別owner / 別初期化runから混ぜない
- single-use claim済みownerを別coordinatorへ再handoffしない
- operation失敗後の回収はruntimeを直接closeするのではなく、ownerの共有`abortAndDrain()`へ集約する
- orderly completionでもownerのfirst-call-wins lifecycleを迂回しない

coordinator receiptのexact literalもproductionとtestを混ぜない。

| receipt field        | production                                                                         | injected test                                                                    |
| -------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `contract`           | `shogi-floodgate-v7-production-parent-coordinator-v1`                              | 同じcontract                                                                     |
| `status`             | `initialized-exact-production-owner-parent-operation-coordinator`                  | `initialized-injected-test-parent-operation-coordinator-not-production-evidence` |
| `trust_boundary`     | `trusted-current-process-js-realm-and-imported-structural-validator-intrinsics-v1` | 同じtrust boundary                                                               |
| `execution_boundary` | `production-exact-runtime-owner-single-use-handoff`                                | `test-only-injected-runtime-owner-single-use-handoff`                            |
| `test_boundary`      | `null`                                                                             | `{ production_factory_execution: false, production_runtime_origin: false }`      |

production `claim_boundary`は`exact-single-use-production-owner-handoff-direct-stable-teacher-parent-operations-v2-run-binding-and-deadline-bounded-owner-cleanup-not-checkpoint-key-label-training-weight-live-or-playing-strength-evidence`である。test側は`injected-owner-parent-operation-composition-not-production-origin-checkpoint-key-label-training-weight-live-or-playing-strength-evidence`へ分ける。receiptはさらに`exact_owner_facade_claimed_once: true`、`raw_runtime_facades_exposed: false`、`stable_then_teacher_then_union_then_rescore: true`、`candidate_order: "utf8-bytewise-ascending-v1"`、`completed_parent_core_reverified_before_return: true`を固定する。

`trust_boundary`は「任意の同一process内攻撃にも安全」というclaimではない。module評価時にcurrent realmのselected intrinsicsをcaptureし、後からlive `Promise`、`Set`、timer、`Object.freeze`などが差し替えられてもoperationがそれらへ戻らないようにする一方、current process / JS realm、Node intrinsic、およびimport済みのcandidate-union、completed-parent、SFEN / legality validator自体は信頼する。受理したruntime-operation Promiseと内部workflow / lifecycle mirrorはcaptured constructor / `then`へpinするが、checkpoint契約へ返すpublic PromiseはownKeys 0のexact native valueを維持し、その消費はcheckpoint側のtrusted current-realm boundaryが担う。OS sandbox、process isolation、remote attestation、pre-import compromise対策、production input authenticationではない。

production receiptの`test_boundary`は`null`で、injected coreだけが`production_factory_execution: false`と`production_runtime_origin: false`を持つ。したがってtestでproductionと同じshapeのoperationを通しても、production factoryを実行した証拠にもproduction runtime originにもならない。production / test共通の11 nonclaimsは`checkpoint`、`key_authority`、`input_authentication`、`dataset_read`、`teacher_label`、`training`、`selection_or_holdout_access`、`weight`、`live_evaluation_activation`、`match`、`playing_strength`がすべて`false`である。

## 3. 1親のpipeline

1親のoperationは、候補集合とteacher scoreの意味を混ぜないように段階を分ける。

ここで「1親」はcoordinator全体が1件で終了するという意味ではない。`produce(request)`の1 callがexactly one parentを扱い、将来のcheckpointが最大12 callをrolling windowで管理する。coordinatorは複数親を1つのbatch resultへ混ぜない。

1. authenticated checkpointから将来渡される形と同じexact 3 keysの`{ input_index, parent, signal }`を最初の`await`前にcaptureする。`input_index`はnonnegative safe integer、parentはexact 7 keys、5つの文字列は各1〜4,096 code units、signalはcurrent-realm non-Proxy `AbortSignal`に限定したうえでrules-complete legal movesを再導出する
2. fixed production stable WASM runtimeで、現行runOp1が選ぶstable moveを得る
3. legal moveが2つ以上ならfixed production teacher runtimeでdepth-16 MultiPV最大12のproposalを得る
4. `buildFloodgateV7CandidateUnionForProductionParentCoordinator(...)`でteacher proposal、strong-gameの`played_move`、stable moveをUTF-8 byte orderでdeduplicateしてcandidate unionを作る。このplain receipt単体はorigin authentication claimではない
5. unionの全candidateをstrict UTF-8 byte orderで順に検査し、MultiPV 1、`searchmoves` exactly one move、depth 16、search前`isready` / TT resetで独立rescoreする
6. proposal rank、provenance、child SFEN / position ID、各rescore evidenceをcompleted-parent inputへ閉じ、completed-parent coreで全体を再検証する
7. stable / teacher / union / rescoreのruntime出力は共有100,000-entry、depth 32のJSON-like snapshot budgetで再captureし、operation Promiseはcurrent realmのundecorated exact native `Promise`だけを受理してからcaptured constructor / `then`へpinする。最後にexact 3 keysの`{ union, stable_runtime, rescores }`をcaller inputからdetachedなdeep-frozen valueとして返す。coordinator自身はfileへappend、seal、publishしない

forced one-move parentではteacher proposalと独立rescoreを行わない。rules-complete legal move、played move、stable moveが同じforced moveであることを確認し、skip projectionを作る。これは検索を省略してよい唯一の分岐であり、通常parentのshallow resultや不足candidateを許す抜け道ではない。

candidate unionにstable scoreは入れない。stable runtimeが提供するのは比較対象となる**move**だけで、後段のteacher target sourceになれる値はYaneuraOuの独立rescoreだけである。このcoordinatorはlabelへ変換・公開しない。played moveもcandidate sourceであって正解labelではない。

coordinatorがparent schemaとrules-complete legalityを再検証しても、requestのproduction input originやdurable authenticationが自動的に付くわけではない。返す`FloodgateV7CompletedParentInput`もcheckpointへ渡すためのvalidated valueであり、completed evidenceの`teacher_labels_emitted`は0である。それ単体はHMAC-authenticated record、published teacher label、training rowではない。

## 4. v2 run bindingをfactory内で固定する

[v2 teacher checkpoint](./blog-shogi-floodgate-v7-producer-timeout-cancellation.md)は、同じwork bytesを別timeoutや別runtimeでresumeできないように、次をHMAC chainのrun bindingへ含める。

| binding          | 固定する意味                                                                                  |
| ---------------- | --------------------------------------------------------------------------------------------- |
| plan             | preregistered fresh-sibling plan、10,890 bytes / SHA-256 `ad9e6d7f…b7a0af`                    |
| producer control | `parent_deadline_ms`、`abort_drain_ms`、`max_in_flight = 12`、cancel / late-settlement policy |
| stable runtime   | exact production stable runtime receipt SHA-256                                               |
| teacher runtime  | exact production teacher USI runtime receipt SHA-256                                          |

zero-argument production factoryはowner receiptから得た2つのruntime digestとfixed plan / producer controlからschema `shogi-floodgate-v7-teacher-run-binding-v2`の`run_binding`を構築し、facade上でread-onlyに公開する。callerはrun bindingを引数で渡さず、deadline、drain、runtime digestを差し替えられない。

producer controlはschema `shogi-floodgate-v7-teacher-producer-control-v2`、`parent_deadline_ms = 1,800,000`、`abort_drain_ms = 30,000`、`max_in_flight = 12`である。cancel policyは`first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2`、late settlementは`observe-from-start-consume-after-terminal-without-validation-or-append-v2`へ固定する。test coreだけがruntime ownerと同じ4 dependencyを注入し、production factoryはzero-argumentに固定する。

coordinatorはcaller-supplied bindingをcapture / compareせず、自身が構築した唯一のv2 `run_binding`を公開するだけである。またcheckpointはexact 2 keysの`{ produce, abortAndDrain }` controllerしか受け取らないため、exact 5-key coordinator facade自体を直接渡すことはできない。将来のtrusted connectorは2 operationだけを新しいfrozen controllerへ射影し、key authorityとcheckpoint側へcoordinatorのexact `run_binding`を渡さなければならない。そのうえで異なるdigest、v1 binding、unknown key、余分なfield、別producer policyとの組合せを同じresumeとしてfail closedに拒否する。その射影・比較・resume認証はこのPRではまだ実装していない。

ただし、この変更はrun bindingへHMACを発行するdeployment key authorityではない。callerが同じshapeのbindingを渡せることと、official key holderがそのrunを認可したことは別である。次PRでkey authorityを閉じるまで、このcoordinator単体をofficial production runへ接続しない。

## 5. deadline、cancel、cleanupを同じterminalへ閉じる

coordinatorは各`produce`にcurrent-realm signalのone-shot abort listenerと1,800,000ms timerを設定する。これは1親のoperation全体のsupervisor deadlineであり、USI runtime固有の600,000ms per-search timeoutやownerの30,000ms cleanup timeoutを置き換えない。どの段階でterminalを観測しても、coordinatorは以後のproposal、rescore、assemblyを始めず、listenerとtimerを外す。

| terminal                                              | coordinatorの動作                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| caller signal abort                                   | 新規operationを止め、started operationを観測し、owner abortへ進む       |
| stable proposal failure                               | teacher検索を開始せず、初期化済みteacher runtimeを回収してprimaryを保つ |
| teacher proposal / rescore failure                    | 残りcandidateをscheduleせずowner abortへ進む                            |
| candidate union / completed-parent validation failure | engine resultをcheckpoint valueとして返さずowner abortへ進む            |
| owner abort failure / timeout                         | primaryとcleanup failureを分けて保持する                                |
| success                                               | completed-parent inputだけを返し、checkpoint durabilityは次段に残す     |

factory内のowner handoffが失敗した場合も、取得済みownerを`abortAndDrain()`へ送り、handoff primaryとcleanup failureを分ける。operation phaseは`capture`、`owner-handoff`、`stable-proposal`、`teacher-proposal`、`candidate-union`、`independent-rescore`、`completed-parent`、`deadline`、`cancellation`、`cleanup`へ固定する。`FloodgateV7ProductionParentCoordinatorError`はphaseとprimaryを保持し、owner cleanupも失敗した場合は`cleanup_failures`を別配列に残す。

`Promise.race`でcallerの待ちだけを終えてもraw engine processは消えない。started workflowにはsettlement observerを残し、ownerの`abortAndDrain()`がstable closeとteacher `abortAndReap()`を1つのdeadline付きcleanupへ送る。late fulfillmentはsettled guardで捨て、新しいcandidateやcheckpoint appendへ再利用しない。coordinatorの`close()`と`abortAndDrain()`もfirst valid transitionを共有し、active `produce`を同じterminalへ送る。

## 6. 実装中に確認した発見と途中データ

| 発見 / 途中値                                                                                | 現時点の意味                                                                              |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| production ownerは親operation surfaceを意図的に0へしていた                                   | receipt copyからruntimeを復元せずexact handoffが必要                                      |
| handoff registryはproduction / testで別、claimはcapture前にdelete                            | cross-boundary claim、double claim、malformed runtimeのrepair-and-retryを拒否する         |
| 現freeze候補のfocusedは30 / 30、関連5 filesは169 / 169（Node v22.13.0）                      | synthetic / injected regressionであり、production runtime実行や棋力証拠ではない           |
| fixed plan identityは10,890 bytes / `ad9e6d7f…b7a0af`                                        | coordinatorの`run_binding`からcallerが計画を差し替えられない                              |
| requestは最初の`await`前にdetached snapshot化し、Proxyはtrap 0でreject                       | caller mutationやhostile requestが後段engine workへ入り込まない                           |
| parent文字列は各4,096 code units、runtime snapshotは100,000 entries / depth 32へbounded      | 巨大objectや深いgraphをruntime work前 / 結果assembly中にfail closedにする                 |
| selected intrinsicはmodule評価時にcaptureし、runtime unionは再snapshot / freezeする          | post-import live intrinsic poisoningへの防御。pre-import / process compromise証拠ではない |
| coordinator sourceはfilesystem、dataset、checkpoint、root keyをimport / acceptしない         | 1-parent operation boundaryとdurable authorityを分離する                                  |
| stable runtimeは12 workers、teacher runtimeは12 engines                                      | checkpointの`max_in_flight = 12`と整合させる                                              |
| stable 12並列smokeのmedianは2,187ms / 5.49 positions/s                                       | stable proposalはteacher独立rescoreより軽い参考値。実data throughputではない              |
| v2 synthetic 24,000-parent scanは435.60秒、429,245,287 bytes、RSS 483,491,840 bytes          | checkpoint scannerの証拠だけ。producer callsは0                                           |
| role bundleにはtraining 24,000、selection 4,800、fresh final 4,800 parentsがlabel-freeで存在 | このPRではどれも開いていない                                                              |
| formal A/Bは192 color-swapped pairs / 384 games                                              | canonical preregistrationを変更しない                                                     |

途中データを棋力結果と混ぜない。特にstable smoke、synthetic scan、focused testの件数は、real teacher depth-16 throughput、label quality、weight改善、対局強度を示さない。

## 7. テスト証拠

この節は2026-07-13のfreeze候補を、repository指定のNode v22.13.0で実測した値だけ記録する。

| 検査                                         | 結果                                           | 境界                                                                         |
| -------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| focused production-parent coordinator tests  | **PASS: 30 / 30**                              | exact handoff、bounds、foreign Promise、intrinsic poisoning、lifecycleを含む |
| related regression tests（5 files）          | **PASS: 169 / 169**                            | owner handoff、checkpoint、candidate union、completed-parentを含む           |
| TypeScript `--noEmit`                        | **PASS**                                       | Node v22.13.0、type closure                                                  |
| scoped ESLint / Prettier / diff-check        | **PASS**                                       | changed TypeScript / testと日英docs                                          |
| full Vitest（maxWorkers = 2最終実行）        | **PASS: 114 / 114 files、2,026 / 2,026 tests** | repository regression                                                        |
| Python ML stdlib                             | **PASS: 58 / 58**                              | unchanged training verifier regression                                       |
| Next production build                        | **PASS: exit 0、13 workers**                   | 既存Firebase build-phase / dynamic-route warningあり。build failureではない  |
| production factory / origin in focused tests | production実行0 / originなし                   | injected receiptの`test_boundary`どおり。production evidenceではない         |
| real Floodgate parents / labels / weights    | 0                                              | このPRの実行scope外                                                          |

Promise-hardening testを2件追加する前の初回全Vitest（maxWorkers = 4）では、2,024件中、既存WASM初期化test 1件が3,000ms timeoutとなり2,023 / 2,024だった。同testは単独1 / 1でPASSし、当時のmaxWorkers = 2再実行は2,024 / 2,024だった。hardening後の最終branchはmaxWorkers = 2で114 / 114 files、2,026 / 2,026 testsがPASSした。初回flaky timeoutを消さずに履歴として残し、synthetic test resultをproduction runtime origin evidenceへ格上げしない。

## 8. 明示的なnonclaims

この変更で実行・生成したものは次のとおりである。

- production input authentication: **0**
- real Floodgate dataset readとtraining / selection / final parent access: **0**
- production YaneuraOuによるreal proposal / rescore: **0**
- official teacher label / teacher JSONL: **0**
- HMAC checkpoint / official completion receipt: **0**
- optimizer step / `final.pt` / candidate weight: **0**
- production weightの上書き: **0 bytes**
- live評価関数 / weight activation: **0**
- application codeのmerge / deploy: 上のactivationとは別で、本記事はdeploy receiptも0 / PASS claimも持たない
- 対局実行: **0**
- formal A/B: **0 / 192 pairs、0 / 384 games**
- 81Dojo rated game、Elo、rating、段位: **0**

したがって、このPRが閉じるのは「ownerが保持するexact runtime pairへ、1親のoperation graphを接続できる」というcode boundaryだけである。評価関数が強くなった、退行しなかった、高段で安定した、というplaying-strength claimはすべて0である。

## 9. 次はkey authority、checkpoint、その後100 / 500 parent pilot

次の順序を変えない。

1. deployment key authorityを追加し、run ID、key ID、v2 run binding、stageをofficial HMAC capabilityへ結ぶ
2. そのauthorityとproduction parent coordinatorをv2 checkpointへ接続し、input順、resume、first-terminal、fsync、sealを閉じる
3. synthetic fault injectionでtimeout、simultaneous failure、raw-never-settles、late settlement、cleanup failure、resumeを再検証する
4. holdoutを開かない100-parent real pilotを実行し、failure、throughput、candidate count、score / mate分布、resume、残留processを監査する
5. 同じfixed policyで500 parentsへ広げ、PASS後だけ24,000 training parentsを開始する

100 / 500 pilotを通っても棋力結果ではない。その後に24,000 training teacher、固定seed 42 / 43 / 44のQAT、fresh selection、fresh / legacy final、既知回帰、production parity、formal 192-pair / 384-game A/Bが残る。全内部gateを通過した候補だけが、別承認の81Dojo較正へ進める。
