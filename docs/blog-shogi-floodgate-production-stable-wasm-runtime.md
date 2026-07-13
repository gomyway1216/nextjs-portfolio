# stable候補をproduction capabilityとして発行する固定WASM runtime

> **digest authority update（現在の境界）:** production / test stable runtime factoryは、発行したexact facadeとreceipt digestを別々のmodule-private `WeakMap`へ登録する。production / test getterはそれぞれexact 1引数だけを受け、clone、Proxy、plain receipt、別registryのfacadeを拒否し、proposalを実行せずに登録済みdigestを返す。plain receiptから同じSHA-256を計算できること自体はproduction origin authorityではない。既存receipt / result schemaと`shogi-floodgate-production-stable-runtime-receipt-v1\0` domainは変更していない。詳細は[runtime digest authority](./blog-shogi-floodgate-production-runtime-digest-authority.md)に分離した。以下の本文はdigest authority追加前のhistorical recordとして残し、coordinator、checkpoint配線、real label、training、weight、live、棋力を主張しない。

> [production asset authority](./blog-shogi-floodgate-production-teacher-asset-authority.md)はstable WASM / weights / workerの実在bytesを固定し、[stable proposer](./blog-shogi-floodgate-stable-wasm-proposer.md)は探索結果からstable候補rowを組み立てた。しかし従来のproposer / poolはdependency-injected test coreであり、完成済みrowだけを見ても「固定production assetから実行された」とは言えなかった。このPRはzero-argument production factory、ephemeral asset callback内で初期化するreusable 12-worker pool、direct capability resultのdomain-separated bindingを追加する。これはstable runtimeの構成・初期化境界であり、parent真正性、teacher label、training、holdout、棋力の証拠ではない。English version: [blog-shogi-floodgate-production-stable-wasm-runtime.en.md](./blog-shogi-floodgate-production-stable-wasm-runtime.en.md)

---

## 現在の境界

| 項目                               | 現在の状態       | 意味                                                                             |
| ---------------------------------- | ---------------- | -------------------------------------------------------------------------------- |
| pinned stable assets               | 前段で完成       | WASM / weights / workerのprivate bytesとSHA-256を固定する                        |
| reusable low-level pool            | 実装             | 1 parentずつ繰り返し探索できるが、それ単独はproduction authorityを名乗らない     |
| production stable runtime          | 実装             | fixed asset callbackとfixed pool factoryを内部で直結し、外部注入を受けない       |
| direct result binding              | 実装             | parent / row / authority / pool / runtime receiptをdomain-separated digestで結ぶ |
| v7 coordinator / HMAC              | 次段階           | owning runtimeのdirect resultを同じparent chainへ即時bindする必要がある          |
| real training / holdout / strength | 未実行・証拠なし | 棋譜、label、weight、A/B、段位をこのPRでは扱わない                               |

## 1. 発見: 正しいshapeはproduction originではない

既存`FloodgateStableWasmProposalRow`は、parent ID、stable move、child SFEN、depth、score encodingを厳密に持つ。一方、同じplain objectはcallerも組み立てられる。HMAC verifierがrowを検査してもverified row capabilityを返さず、finalization receiptもhashだけなら、後続処理は「構造が正しいrow」と「固定assetから今得たrow」を区別できない。

そこでproduction claimをrowの形へ埋め込まない。claimの根拠は、後続coordinatorが自分でzero-argument factoryを呼び、そのexact runtime objectの`propose(parent)`から返ったresultを同じcoordinator-owned live processing flowで受け取るcapability relationに置く。resultにも`plain_result_authentication_claim: false`を固定し、保存済みplain resultを単独の認証証拠として再利用しない。

## 2. zero-argument production factory

production入口は次だけである。

```text
createFloodgateProductionStableWasmRuntime()
```

argumentを1つでも渡す呼出しはruntimeでも拒否する。callerはasset provider、WASM / weight / worker bytes、worker factory、worker数、queue、timeout、depth、score contractを変更できない。test-only coreだけがsynthetic provider / pool factoryを注入でき、そのreceiptは`test-only-injected-asset-provider-and-pool-factory`からproduction boundaryへ昇格しない。

返すsurfaceはnull-prototype / frozenの`receipt / propose / close`だけである。constructor、内部worker、raw lease、asset bytes、queue mutation APIを公開しない。data resultとnested receiptもnull-prototypeでdeep-freezeし、methods自体もfreezeする。

## 3. ephemeral asset callbackの中で全workerをreadyにする

asset authorityはfixed private deploymentを検査し、owned mutable `Uint8Array`としてWASM / weights / worker sourceをcallbackへ1回だけ渡す。runtimeは最初のawait前にexact native typed-array prototype、whole owned buffer、non-Proxy、non-SharedArrayBufferを検査してcopyする。そのcallbackの中でlow-level poolを完全に初期化し、12 workerすべてがreadyになってからだけfacadeを組み立てる。

callbackへ渡す各`Uint8Array`のbacking `ArrayBuffer`は`markAsUntransferable`でtransferを拒否する。callback成功時にはdelivered copiesを再hashし、成功・失敗を問わずoperationがsettleする前にauthority自身のretained / delivered copiesだけをzero-fillする。callbackが独自に作った任意のcopyまでzeroizeする主張ではない。runtimeとlow-level poolも、それぞれ自身がcaptureしたhandoff copiesを別々にzeroizeする。poolはworker初期化に必要なcopyを先に所有するため、authorityとruntimeのhandoff bufferが0になった後も`propose`できる。

監査で、通常の`bytes.fill(0)`は安全境界にならないと分かった。injected factoryがtyped arrayへown `fill` getterを置けば、cleanupがhostile codeを実行する。実装はmodule load時にcaptureしたtyped-array getter / set / fillだけを`Reflect.apply`し、subclassはgetterへ触れる前にrejectする。3 assetの途中で検査が失敗しても、それまでのcopyをすべてzeroizeする。

## 4. fixed reusable pool contract

production optionsは次で固定した。

| option                    | fixed value |
| ------------------------- | ----------: |
| workers                   |          12 |
| bounded FIFO queue        |  48 parents |
| startup timeout           |  120,000 ms |
| one-parent search timeout |  600,000 ms |
| close timeout             |   15,000 ms |
| requested depth           |          11 |
| quiescence depth          |          10 |

各workerは1 parentだけを同時に扱い、private TTをparentごとにclearする。book、external mate solver、fallback、shared TT、wall-clock completionを禁止する。depth 11完了が原則で、depth 1–10での早期完了はparent perspectiveのpositive winning mate band `89,990,000..90,000,000`だけを許す。score encodingは`wasm-v20-raw-parent-perspective-mate-band-v1`で固定する。

queue fullはそのrequestだけをrejectし、worker protocol / timeout / search failureはpool全体をpoisonする。poison後はqueued / active / future workをrejectして全workerをforce-stopする。通常closeはidle workerへquit protocolを通し、active workerはforce-stopする。runtimeはこのpolicyをretryや別poolへのsilent fallbackで覆わない。

## 5. receiptのcross-binding

runtimeはasset authorityのfull receiptをcanonical projectionへcaptureし、次をdomain-separated SHA-256でbindする。

```text
asset-authority full receipt
  -> reusable-pool receipt
  -> production-runtime receipt
  -> direct propose result(parent payload + stable row)
```

pool receiptではWASM / weights / worker sourceのbytes / SHA-256、NNUE `k=600` / `buckets=1`、search contract、12 / 48 / timeout / cleanup policyをexact比較する。pool objectの外形が正しくてもreceiptが1値違えば、runtimeを返す前にcaptured `close` capabilityを呼んでcleanupする。

各resultはrowに加えて、runtime receipt digest、pool receipt digest、parent payload digest、row digest、execution boundaryを持つ。すべてdomain stringとNUL区切りを使い、別artifactの同じJSON digestとして取り違えない。ただしこのbinding objectもplain structureとして複製できるため、単独ではauthentication claimではない。

## 6. parentはawait前にcaptureする

`propose(parent)`はlow-level queueへ渡す前にparentを同期captureする。exact keys / data descriptors、semantic IDs、`parent_id = H(game_id, ply)`、canonical SFEN、move number、position ID、played moveのrules-complete legalityを再検査し、frozen copyだけをpoolへ渡す。callerがPromiseを受け取った直後に元objectを変更しても探索対象は変わらない。

legal generatorがopposing king captureを1手でも返す異常局面は、played moveが別の合法手でもpoolへ送らない。返却rowでもparent IDs、parent payload digest、stable move legality、child SFEN / position ID、depth / termination、positive mate early exit、score / node countersを再検査する。

## 7. adversarial testで見つけたcleanup境界

synthetic testsはreal asset、real棋譜、holdoutを使わず、次を固定した。

- production factoryのarity 0とruntime injection拒否
- exact 12 / 48 / 120s / 600s / 15s arguments
- provider callbackの0回 / 複数回 / result置換拒否
- null-prototype / freeze / extra property / Proxy境界
- parent mutation after callが探索へ入らないこと
- Uint8Array subclass getterを0回のままrejectすること
- hostile own `fill` getterを0回のままintrinsic zeroizationすること
- partial asset validation failure時に、それまでに所有したcopyのcleanup pathを通ること
- invalid pool facade / receipt時にgetterを実行せずinitialized poolをcloseすること
- Promise subclassをrejectし、low-level poolのexact pinned native Promiseだけを許すこと
- pool-wide poisonを1回だけ伝播し、自動retryしないこと
- adjacent kingsのking-capture legal setをpool call前にrejectすること

Promiseについても`isPromise`だけでは足りない。exact native `Promise.prototype`、non-Proxyに加え、own key 0またはlow-level poolが固定するnon-enumerable / non-writable / non-configurableな`constructor === captured NativePromise`だけを許す。Promise subclassや他のdecorated Promiseを拒否し、live `Promise.prototype.then`を使わずcaptured native `then`でobserveする。rejectionもlive `Promise.reject`ではなくcaptured constructorから直接作る。hostile rejection valueをerror messageへ変換するとcoercion hookを実行し得るため、failure detailはnative Errorのown data `message`またはbounded stringだけを使う。

review後のhardeningでは`Buffer`を`node:buffer`から明示importし、`Error` / `AggregateError` constructorもmodule load時に固定した。worker failure通知callbackのthrowは元failureとaggregateしてからpending reject / killを続け、`quit` / `forceStop`呼出し自体の同期throwもrejected native Promiseへ変換する。現在のmethodsは`async`だが、将来の実装変更でも`close()`が同期throwしてcleanup chainを飛び越えない。

## 8. v7 coordinatorへの直接接続

後続v7 coordinatorは、authenticated training-row callbackの中でこのproduction runtimeを自分で生成し、各parentについて`runtime.propose(parent)`をdirect callする。pure candidate-union coreへは`result.row`を渡せるが、production originの根拠はcoreのstructural validationではなく、coordinatorがowning runtimeから受け取った`runtime_binding`を同じparentのHMAC chainへ即時追加することにある。

parent chainは少なくともtraining parent identity / SFEN / played move、core-derived legal-set digest、stable runtime / row binding、USI proposal receipt / full result digest、canonical candidate union、各independent rescoreを含める。plain stable rowを別fileから読み直してproduction originと呼ぶ経路は作らない。

## 9. validationとnonclaims

| validation                                     | result                           |
| ---------------------------------------------- | -------------------------------- |
| focused production stable runtime              | 10 tests pass                    |
| related asset callback / pool / runtime suites | 80 tests pass                    |
| full Vitest                                    | 1,873 tests / 109 files pass     |
| Python ML stdlib                               | 58 tests pass                    |
| fixed-asset 12-worker production smoke         | pass                             |
| Next production build                          | pass                             |
| TypeScript                                     | pass                             |
| scoped ESLint / Prettier                       | pass / pass                      |
| repository ESLint                              | 0 errors / 157 existing warnings |

### fixed-asset production smokeと並列幅pilot

2026-07-12 PDT、14 physical / logical cores（performance 10 + efficiency 4）、51,539,607,552 bytes RAMのApple Silicon Macで、private fixed deploymentからzero-argument production runtimeを実際に起動した。入力は公開初期局面と`7g7f`だけであり、real Floodgate row、selection、final、holdoutは開いていない。

最初のsmokeでは12 workerを350 msでreadyにした後、runtime監査用に`parent_payload_sha256`を加えたobjectをlow-level poolへ渡していたため、poolのexact 7-key検査が正しくrejectした。failure後の12 worker closeは23 msだった。poolへは7項目だけの別frozen projectionを渡す修正とregression assertionを追加した。再実行では初期化375 ms、close 20 msで成功し、1 / 8 / 10 / 12同時の計31結果は同じparentについて同一row digestになった。

続くbalanced orderの3回pilotは次だった。各sampleは同じ公開parentの同時探索であり、90結果のrow digestは1種類だった。

| concurrent parents |  elapsed samples (ms) | median (ms) | median positions/s |
| -----------------: | --------------------: | ----------: | -----------------: |
|                  8 | 2,378 / 1,835 / 1,891 |       1,891 |               4.23 |
|                 10 | 1,972 / 1,927 / 1,901 |       1,927 |               5.19 |
|                 12 | 2,319 / 2,185 / 2,187 |       2,187 |               5.49 |

この短い固定局面pilotでは12並列が10並列より約5.8%高throughputだったため、production poolは12 workerを維持する。これはruntime throughput / determinism evidenceだけであり、局面分布、teacher品質、評価関数の棋力を測った結果ではない。

このPRではreal Floodgate training row、fresh selection、fresh / legacy final holdoutを読んでいない。teacher CP / PV、label JSONL、checkpoint、weights、A/B result、81Dojo ratingを作っていない。したがって「評価関数が強くなった」「高段で安定した」という主張は0である。

得られた実利は、fixed-asset stable-move origin capabilityへのproduction入口を閉じたことだけである。parent単位のauthenticated originは、次段のHMAC coordinatorが完成するまで未達である。次はこのdirect resultをper-parent HMAC work checkpointへbindし、synthetic crash / resumeを閉じてから24,000 parentのreal labelingへ進む。
