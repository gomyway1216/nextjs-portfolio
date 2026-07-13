# production stable / teacher runtimeをdeadline付きzero-work lifecycleで所有する

> 前段の[runtime digest authority](./blog-shogi-floodgate-production-runtime-digest-authority.md)は、matching factoryが発行したexact stable / teacher facadeからだけreceipt digestを取得できるようにした。しかし、2つのruntimeを同時に初期化し、失敗時と終了時のcleanupを一つのdeadline付きlifecycleで所有する境界はまだなかった。この変更はzero-argument production entrypointを追加し、両factoryをawait前に開始する。受理したsource Promise自体をcaptured `Promise.allSettled`へ渡し、両方の成功後だけmatching production getterを呼ぶ。公開facadeは`receipt`、`close`、`abortAndDrain`だけで、親局面、stable proposal、teacher search、checkpointを開始しない。focused testはinjected `CoreForTests`だけを実行しており、production asset、production engine pool、live環境、棋力の証拠ではない。English version: [blog-shogi-floodgate-v7-production-runtime-owner.en.md](./blog-shogi-floodgate-v7-production-runtime-owner.en.md)

---

## 現在の境界

| 項目                        | 現在の実装・検証                                                                         | この変更から言えること                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| production entrypoint       | zero-argument、fixed stable / teacher factoryとmatching production getterへ固定          | production pathへdependency injectionできない                             |
| test entrypoint             | exact 4 dependencyの`CoreForTests`                                                       | concurrency / timeout / failure / lifecycle mechanicsのtest harnessだけ   |
| initialization deadline     | production 180,000ms、test 250ms                                                         | 無期限pending、source cycle、inherited `then` stallをdeadline内にfailする |
| cleanup deadline            | production 30,000ms、test 250ms                                                          | accepted cleanupのsettlementまたはtimeoutまで待つ                         |
| timeout recovery            | known runtimeをcleanupし、late trusted fulfillmentも各runtime一度だけbest-effort cleanup | unresolved factory resourceを所有したとは主張しない                       |
| production digest authority | 両production factory成功後にexact facade getterを呼ぶcode path                           | 同じprocess / module instance内のephemeral authority                      |
| cleanup result              | exact-native Promiseが`undefined`でfulfillすることを要求                                 | runtime valueをcleanup成功として受理しない                                |
| owner work surface          | `receipt` / `close` / `abortAndDrain`だけ                                                | 親operation、proposal、rescore、labelを実行できない                       |
| focused validation          | Node 22で49 / 49 pass                                                                    | production factoryやlive deploymentを実行した件数ではない                 |
| 棋力                        | 対局・Elo・段位測定なし                                                                  | 「強くなった」「高段で安定した」というclaimは0                            |

ここでいうzero-workは、runtime factoryの初期化costが0という意味ではない。stable worker poolやteacher process poolを初期化するproduction code pathは存在する。zeroなのは、ownerが親局面を受け取らず、proposal / search / rescoreを一度も公開・開始しないことである。

## 1. 2つのfactoryを同じownershipへ入れる

production entrypointは次の4 functionへmodule内で固定される。

- `createFloodgateProductionStableWasmRuntime`
- `createFloodgateProductionTeacherUsiRuntime`
- `getFloodgateProductionStableWasmRuntimeReceiptDigest`
- `getFloodgateProductionTeacherUsiRuntimeReceiptDigest`

stable factoryを呼んだ後、そのsettlementをawaitする前にteacher factoryも呼ぶ。同期throwまたはcontract-invalidなreturnはowner内部のrejected Promiseへ変換するため、もう片方の起動を妨げない。factoryが返したvalidなsource Promiseにはown `constructor` / `then`を直接固定し、別wrapperや`resolve(value)` bridgeを作らず、そのsource自体をcaptured `Promise.allSettled`へ渡す。

| factory結果                                     | operation failure                                     | failure cleanup                                                         |
| ----------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| stable / teacherともdeadline内にtrusted fulfill | 0。両digest getterをそれぞれ1回attempt                | ownerを返すまでcleanup 0                                                |
| 片側reject、もう片側trusted fulfill             | stable→teacher順のknown failure                       | known runtimeを`close`または`abortAndReap`                              |
| 片側known failure、もう片側pending              | known failureを先に保ち、その後initialization timeout | timeout時点のknown runtimeをcleanup                                     |
| timeout後にtrusted runtimeがfulfill             | すでに返したtimeout errorは変更しない                 | late observerが各runtimeをexactly once、best-effort cleanup             |
| factoryが永久pending                            | initialization timeout                                | capability未取得なのでresource ownershipを主張しない                    |
| 両方fulfill後にdigest失敗                       | 両getterを独立にattempt                               | `stable.close()`と`teacher.abortAndReap()`をcleanup deadline内でattempt |

initializationはproduction 180,000ms、test 250msで、accepted Promiseがすべてsettleするかowner deadlineに達するまで待つ。timeout時も、それ以前に判明したfactory rejection / runtime-capture failureをstable→teacher順に保持し、最後にtimeout failureを加える。片方のdigest getterがthrowしても、もう片方を隠さずattemptする。digestはcaptured `String.prototype.charCodeAt`による64 code-unit検査でlowercase hexだけを受理し、大文字、短い値、non-stringはfail closedになる。

## 2. production receiptとtest receiptを分離する

productionとtestは同じlifecycle algorithmを通るが、receiptのauthorityは共有しない。

| receipt field                | production boundary                                            | test boundary                                                                      |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `contract`                   | `shogi-floodgate-v7-production-runtime-owner-v1`               | 同じcontract                                                                       |
| `execution_boundary`         | `production-fixed-stable-and-teacher-runtime-factories`        | `test-only-injected-runtime-factories-and-digest-getters`                          |
| `status`                     | `initialized-zero-work-stable-teacher-runtime-lifecycle-owner` | `initialized-injected-test-lifecycle-harness-not-production-or-zero-work-evidence` |
| `digest_authority`           | `exact-production-facade-authorities-v1`                       | `injected-test-getters-not-origin-authority-v1`                                    |
| `initialization_timeout_ms`  | `180000`                                                       | `250`                                                                              |
| `cleanup_timeout_ms`         | `30000`                                                        | `250`                                                                              |
| `plain_receipt_origin_claim` | `false`                                                        | `false`                                                                            |

exact `claim_boundary`は次の2 literalであり、test receiptにproduction wordingを混ぜない。

- production: `concurrent-fixed-production-runtime-initialization-exact-production-facade-digest-lookup-and-first-valid-zero-argument-call-wins-deadline-bounded-cleanup-not-parent-operations-producer-coordinator-checkpoint-key-label-training-weight-live-or-playing-strength-evidence`
- test: `injected-runtime-lifecycle-harness-and-injected-digest-getters-not-production-origin-zero-work-or-playing-strength-evidence`

`lifecycle`は、initializationを`concurrent-factories-captured-all-settled-with-owner-deadline-v1`、initialization failure cleanupを`known-trusted-fulfilled-stable-close-and-teacher-abort-and-reap-deadline-bounded-v1`、completionを`all-accepted-promises-settled-or-owner-timeout-failure-v1`と記録する。Promise policyは`trusted_factory_promise = pinnable-undecorated-exact-native-promise-v1`、`invalid_factory_promise = rejected-before-authority-best-effort-observation-not-runtime-ownership-v1`である。transition policyは`transition = first-valid-zero-argument-call-wins-later-calls-return-exact-same-promise-v1`、`pre_transition_invalid_arity = reject-without-establishing-transition-v1`、`late_invalid_calls = join-existing-transition-v1`である。`close`は`stable-close-and-teacher-close-deadline-bounded-v1`、`abort_and_drain`は`stable-close-and-teacher-abort-and-reap-deadline-bounded-v1`である。

production receiptが記録するauthorityも、現在のprocess・module instance・owner initializationに閉じている。receipt objectや2つのdigest stringを別contextへcopyしてもauthorityは移転しない。test getterはcaller注入であり、ownerが検査するのはlowercase 64-hexだけなので、test receiptをproduction digest authorityとして扱ってはならない。

両receiptのcommon `nonclaims`は、`parent_operations`、`producer`、`production_coordinator`、`checkpoint`、`key_authority`、`teacher_label`、`training`、`weight`、`live_deployment`、`playing_strength`、`invalid_promise_runtime_ownership`、`injected_behavior_evidence`、`unresolved_factory_resource_ownership`、`invalid_promise_rejection_observation`をすべて`false`にする。

test receiptはさらに`production_factory_execution`、`production_runtime_origin`、`production_exact_facade_digest_authority`、`zero_work_evidence`を`false`にする。つまり、pending factoryがtimeoutしただけではその先のresourceを所有したとは言わず、pinできないinvalid Promiseのrejectionを必ず観測できたとも言わない。

## 3. pinnable exact native Promiseだけをownershipへ入れる

factoryとcleanup methodの戻り値には、単なる`PromiseLike`ではなくpinnable exact native Promiseを要求する。受理条件は次のとおりである。

1. native Promiseのinternal slotを持つ
2. Proxyではない
3. prototypeがmodule load時にcaptureしたexact `Promise.prototype`である
4. fresh sourceはown keyが0、再利用sourceはcaptured `WeakSet`のadopted-source membershipを持つ
5. `constructor`をprivate species holderへnon-configurableにpinできる

ownerは受理したsource Promiseそのものへown non-writable `constructor`とown non-writable `then`を固定してfreezeし、captured native `then`へdelegateする。したがって、再利用可能なadopted sourceのown keyは`constructor`だけではなく`constructor` + `then`であり、その正当性はkey形状の推測ではなくcaptured `WeakSet` membershipで決まる。fulfillment valueを別Promiseの`resolve(value)`へ渡して再assimilationするbridgeは作らず、source自体をall-settled inputにする。同期throwとcontract-invalid returnだけがinternal rejected Promiseへ変換される。

この遮断はownerがsourceを受理した後の再assimilationに対するものだ。pending sourceのnative resolveがruntime facadeを解決するとき、その時点で`Object.prototype.then`が存在すれば、source Promise自身のnative resolutionは継承`then`を呼び得る。ownerはそれを「trap 0」とは主張しない。resolutionがstallしてもinitialization deadlineでboundし、すでにknownなpeer runtimeをcleanupする。反対に、mutation前にfulfill済みのruntimeをownerが別`resolve(value)`へ通して再assimilationすることはない。

## 4. invalid / decorated Promiseの観測はbest-effortでありownershipではない

thenable、Promise Proxy、subclass / cross-realm Promise、owner-adopted setにないown decorationを持つnative Promiseはcontract違反としてrejectする。これらの値をruntime fulfillmentとして採用せず、そこからstable / teacher lifecycle capabilityをcaptureしない。

| invalid return                               | ownerの動作                                                        | 明示的な非主張                                                       |
| -------------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| thenable                                     | `then`を読まずreject                                               | assimilationなし                                                     |
| Promise Proxy                                | Proxy trapを起動せずreject                                         | wrapped Promiseのownershipなし                                       |
| subclass / cross-realm Promise               | exact prototype不一致でreject                                      | settlement observationなし                                           |
| pinnable decorated same-realm native Promise | captured `then`でbest-effort observerを付けてreject                | fulfillmentのsemantic利用、runtime ownership、raw settlement証明なし |
| unpinnable / hostile rejected native Promise | contract errorへ変換するが、安全なobserverを付けられない場合がある | rejection observation保証なし、unhandled-rejection riskの吸収なし    |

best-effort observerの目的は、すでに作られたinvalid native Promiseのlater rejectionを可能な範囲で放置しないことだけである。observerが見たfulfillment valueをownerへ戻さず、そのPromiseをawaitせず、cleanup対象にも数えない。non-extensible Promiseやnon-configurable hostile `constructor`を持つPromiseはpin前にrejectされ、observerを安全に付けられないことがある。すでにreject済みならhost側でunhandled rejectionになるriskが残り、その管理責任はinvalid Promiseのproducer側にある。

したがって、receiptのall-settled-or-timeoutは、ownerが受理したtrusted source Promiseとexact-native cleanup Promiseに対するclaimである。invalid / decorated raw Promiseや永久pending factoryのresource ownership、eventual settlement、停止、reap、rejection observationを証明する言葉ではない。片側がinvalidでも、もう片側でtrusted fulfillmentしたruntimeは通常どおり`stable.close()`または`teacher.abortAndReap()`へ送る。

## 5. first-call-winsはvalidな最初のtransitionから始まる

ownerがまだtransitionを持たない間は、引数付き`close(...)` / `abortAndDrain(...)`をcapture errorとしてrejectし、そのcallはwinnerにならない。validなzero-argument lifecycle callが最初に入ると、child cleanupを1つも呼ぶ前に共有Promiseをmemoizeする。

- `close()`が勝つ: `stable.close()` + `teacher.close()`
- `abortAndDrain()`が勝つ: `stable.close()` + `teacher.abortAndReap()`

memoizationがchild invocationより先なので、child methodから同期的に反対側のlifecycle callが再入してもexact same Promiseへjoinする。一度transitionが確立した後は、arity検査より既存stateを先に見る。extra arguments付きのlate invalid callを含むすべての後続callが、fulfilled / rejected後も同じPromiseを返す。先に選ばれたmodeの変更、cleanup再実行、別errorへの差し替えは起きない。

cleanup methodの戻り値もpinnable exact-native Promiseでなければならず、successful fulfillment valueはexact `undefined`でなければならない。factoryで一度adoptしたsourceをcleanupから再利用できても、それがruntime valueでfulfillするならcleanup contract failureになる。

childがowner lifecycle Promiseを直接返す場合はadopted-source membershipがないためrejectする。別Promiseでwrapしたlifecycle、またはpending cleanup Promiseを後からlifecycleでresolveするhidden cycleはnative Promise内部でpendingになり得るが、cleanup deadlineがboundする。timeout前に判明したcleanup rejectionはstable→teacher順に保持し、最後にtimeout failureを加える。

## 6. 両cleanupをsettle-or-timeoutし、failureはimmutable snapshotへ変える

stable側が先に失敗してもteacher側cleanupを中止しない。両methodを先にinvokeし、accepted Promiseがすべてsettleするかcleanup deadlineに達するまで待つ。deadline前のknown failureをstable→teacher順で集約し、timeoutした場合はその後ろにtimeout failureを置く。

raw Errorや任意objectを共有error graphへ直接残すと、最初のobserverが`name`、`message`、`stack`を変更して後続observerの見え方を変えられる。このownerは各failureを次のbounded evidenceへ変換する。

```text
{
  classification: "error" | "non-error",
  name: string,
  message: string
}
```

own data descriptorだけを読み、accessorは呼ばない。descriptorの`value`自体もown data propertyとして検査するため、lifecycle methodやfunction arityのcapture中に継承`Object.prototype.value` accessorを起動しない。Proxyは中身をwalkせず、name / messageは最大512文字へ制限する。snapshot、failure array、`AggregateError.errors`はfreezeし、owner errorとAggregateErrorの`name` / `stack`はown non-writable data propertyとしてmaterializeしてからfreezeする。`cause`もraw external Errorではなくsnapshotまたはfrozen AggregateErrorだけを指す。arrayのnumeric indexはassignmentや`push`ではなくcaptured `Object.defineProperty`で作り、継承された`Array.prototype["0"]` setterへevidenceを渡さない。

これは全failureの順序と分類を保持するが、raw Error object identityやraw stack traceを保存するclaimではない。

## 7. Promise、Array、digest validationをlive intrinsicから切る

captured `Promise.allSettled`を保存するだけでは十分ではない。built-inはcall時にconstructorの`resolve`やinputの`then`を取得する。ownerはprivate constructorへown `resolve`を固定し、input Promiseへown `constructor` / `then`をpinして、このdynamic lookupを閉じる。`Reflect.apply`もmodule load時のcaptured functionを使う。

同様に、`Promise.allSettled`へ渡すarrayがlive `Array.prototype[Symbol.iterator]`を使うと、後からiteratorを差し替えられる。ownerはindex loopとown numeric data propertyでarrayをcopyし、own frozen iterator / `next`を付ける。さらに全owner arrayへown `then: undefined`を固定し、`Array.prototype.then`や`Object.prototype.then`を後付けされてもPromise resolutionが結果arrayをthenableとして誤認しないようにする。failure listと`AggregateError.errors`にも同じ遮断を入れる。`map`、`flatMap`、`push`、spreadへcleanup aggregationを依存させない。

digest検査はlive RegExpを使わない。lengthが64であることを確認し、captured `String.prototype.charCodeAt`で各code unitが`0-9`または`a-f`かを検査するため、後から`RegExp.prototype.exec`を差し替えてもauthority判定へ入らない。

focused testはlive `Promise.resolve`、`Promise.allSettled`、`Promise.prototype.then`、`Promise[Symbol.species]`、prototype constructor、`WeakSet` method、timer function、`Reflect.apply`、Array helper / numeric setter / iterator、prototype `then`、`RegExp.prototype.exec`、descriptor accessor、Error stack formatterを差し替える境界を検査する。owner受理後のpathはcaptured intrinsicへ固定するが、pending source自身のnative resolutionにおける継承`then` lookupまで無かったとは主張せず、そこはdeadlineとknown-peer cleanupを検査する。

## 8. focused validationの記録

記事作成時点の同じworking-tree sourceをNode 22で実行したfocused resultと、別に実行したrepository全体のvalidationである。

| 対象                                                       | 結果         |
| ---------------------------------------------------------- | ------------ |
| `floodgateV7ProductionRuntimeOwner.test.ts`                | 49 / 49 pass |
| concurrent start / digest gating                           | pass         |
| initialization timeout / known failure ordering            | pass         |
| timeout時known runtime + late trusted fulfillment cleanup  | pass         |
| cleanup timeout / known failure ordering                   | pass         |
| direct / wrapped / late-resolved lifecycle cycle bound     | pass         |
| cleanup fulfillmentがexact `undefined`                     | pass         |
| thenable / Proxy / decorated / unpinnable Promise          | pass         |
| Promise species / constructor / WeakSet / timer poisoning  | pass         |
| inherited source `then` stallのdeadline + peer cleanup     | pass         |
| descriptorの継承`value` accessor isolation                 | pass         |
| Array helper / numeric setter / iterator-next poisoning    | pass         |
| immutable failure graph / stack-hook isolation             | pass         |
| digest code-unit validation / live `RegExp.exec` isolation | pass         |
| TypeScript `--noEmit`                                      | pass         |
| scoped ESLint（warning 0）                                 | pass         |
| full Vitest（113 files、`--maxWorkers=4`）                 | 1996 / 1996  |
| Python ML stdlib                                           | 58 / 58      |
| Next.js production build                                   | 193 / 193    |
| production factoryをfocused testで実行                     | 0            |
| parent operation / proposal / rescore                      | 0            |
| checkpoint / key / label / training / weight変更           | 0            |
| live対局 / 棋力測定                                        | 0            |

この49件はtest-only injectionでowner mechanicsを検査したfocused件数である。別行のfull Vitest 1996件、Python 58件、build 193 pageもcode validationであり、production runtimeが正常起動した回数、production label数、対局数ではない。full CIやdeployment validationの代用にもならない。

## 9. 未実装と次の段階

このownerはlifecycleとephemeral digest lookupだけを所有する。次は別の境界として、親operationを受けるproduction coordinator、checkpoint run binding、deployment key authorityを接続する必要がある。その後にもreal teacher label生成、training rows、optimizer、weight候補、independent selection / holdout、A/B対局、live deploymentが残る。

現時点で評価関数weightとlive環境は1 byteも変更していない。この変更だけから「強くなった」「安定して高段になった」とは言えない。
