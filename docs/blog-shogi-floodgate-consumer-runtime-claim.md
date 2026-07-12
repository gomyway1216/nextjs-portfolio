# callback入力を一度だけclaimする — Floodgate consumer runtime provenance

> [前段のtraining-row consumer](./blog-shogi-floodgate-training-row-consumer.md)は、pinned training bytesをdescriptorで保持して検証し、pathlessでdeep-frozenな`AuthenticatedFloodgateTrainingRows`をcallbackへ渡した。しかし、同じshapeのobjectを別の場所で組み立てられることと、production consumerが今まさに発行したexact objectを受け取ったことは別である。本PRはproduction用とtest用を分離したmodule-private `WeakSet` registryを追加し、callback直前だけruntime claimをarmし、exact object identityに対するsingle-use claimを提供する。これはephemeralなbearer-provenance境界であり、caller identity、`AsyncLocalStorage` affinity、consumer postflight成功、teacher search、または棋力の証拠ではない。real data、selection、final holdoutは未読である。English version: [blog-shogi-floodgate-consumer-runtime-claim.en.md](./blog-shogi-floodgate-consumer-runtime-claim.en.md)

---

## 現在地

| 項目                                  | 状態     | このPRで閉じる境界                                                                 |
| ------------------------------------- | -------- | ---------------------------------------------------------------------------------- |
| production runtime registry           | 実装済み | module-private production `WeakSet`だけがproduction callback inputをarmする        |
| test-only runtime registry            | 実装済み | dependency-injected coreを別`WeakSet`へ隔離し、production provenanceをmintさせない |
| callback直前のactivation              | 実装済み | input構築後、callback invocationとの間に`await`を置かずarmする                     |
| exact-identity claim                  | 実装済み | 同期callback invocation中の同一objectだけをsingle-use claimする                    |
| 同期return時revoke                    | 実装済み | callbackがPromiseを返すかthrowした直後、settlementを待つ前に残存claimを削除する    |
| production runner接続                 | 未実装   | 将来のrunnerがcallback受領直後、最初の`await`前に同期claimすることを前提にする     |
| caller / async-context affinity       | なし     | bearer possessionだけであり、callerや`AsyncLocalStorage`へ束縛しない               |
| postflight / teacher / strength       | 証拠なし | claim成功はconsumer全体の成功やteacher resultを意味しない                          |
| real data / selection / final holdout | 未読     | このPRはdata artifactやholdout labelを開かない                                     |

ここでいう「実装済み」は、callbackの同期invocation中にinputのobject provenanceとsingle useを検査するprimitiveができたという意味である。production runnerが接続された、consumer postflightが完走した、teacher labelが生成された、または強くなったという意味ではない。

## 1. frozen shapeだけではruntime provenanceにならない

consumerが渡すinputはdeep-frozenで、schema、role、binding、rowsも厳密に検証されている。それでもfieldをcopyした別objectは、見た目と値が同じになり得る。TypeScript type、schema check、`Object.freeze`のどれも、「このobjectがproduction callbackへ今回発行されたinstanceである」ことまでは表さない。

```text
verified production input ── exact reference ──> eligible
{ ...verified production input }              ──> different object
new Proxy(verified production input, {})       ──> different object
```

runtime claimは内容をもう一度parseする仕組みではない。consumer内部だけがexact inputを`WeakSet`へ登録し、後段はその同じreferenceを提示できた時だけclaimできる。fieldを再構成してmembershipを作ることはできない。一方、exact reference自体を持つことがauthorityになるため、これはcryptographic identityでもcaller authenticationでもない。

## 2. productionとCoreForTestsは別registryである

module scopeには、外部へexportしない2つのregistryがある。

```text
PRODUCTION_RUNTIME_CLAIMS -> WeakSet, boundary = production
TEST_RUNTIME_CLAIMS       -> WeakSet, boundary = test-only
```

production entry pointの`withVerifiedPinnedFloodgateTrainingRows(...)`はproduction registryだけを使う。dependency-injected `withVerifiedPinnedFloodgateTrainingRowsCoreForTests(...)`はtest-only registryだけを使う。registry object、`WeakSet`、add / activate functionはmodule-privateであり、public APIが提供するのはclaim側だけである。

対応するclaim APIも分かれている。

- `claimActiveVerifiedPinnedFloodgateTrainingRows(...)`はproduction registryからだけclaimする
- `claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(...)`はtest-only registryからだけclaimする

したがって、CoreForTestsが生成したcallback inputをproduction claim APIへ渡しても失敗する。test dependencyが自己整合するinputを作れてもproduction registryへaddする経路はなく、production provenanceをmintできない。逆方向も同じであり、test claim APIはproduction callback inputをclaimできない。

## 3. arm、delete、revokeの順序

runtime claimのlifecycleは次に固定される。

1. consumerがverified rowsからdeep-frozen inputを構築する
2. callbackを呼ぶ直前に、そのexact inputを対応する`WeakSet`へaddしてarmする
3. armとcallback invocationの間には`await`も別のuser callbackも置かない
4. callback内のclaimはcaptured native `WeakSet.prototype.delete`を同期実行する
5. `delete`が`true`ならclaim成功であり、同じ操作でmembershipを消費する
6. callbackがPromiseを返すか同期throwした直後の`finally`で、残存membershipをrevokeする
7. revoke後に、callbackが返したnative `Promise<void>`をguardしてsettlementまで待つ
8. resolve、reject、non-native Promise、値付きresolveのどの場合もclaimはすでに失効している
9. callback completion後に、filesystem postflightとdescriptor closeが続く

概念形は次のとおりである。

```text
input = buildAuthenticatedInput(...)
available.add(input)                 // callback直前にarm
let callbackPromise
try {
  callbackPromise = consume(input)   // async callbackは最初のawaitまで同期実行
} finally {
  available.delete(input)            // 同期return / throw直後にrevoke
}
await guardNativePromise(callbackPromise)
postflightAndClose()
```

claim自体も`delete`なのでcheck-then-deleteの二段階にならない。最初のexact-reference bearerに対する内部`delete`だけが`true`になり、同じ同期invocation内でも2回目は失敗する。callbackがclaimしなかった場合も、callbackがPromiseを返した瞬間にはmembershipが消えている。

この短いwindowは意図的である。callbackがすでにsettledしたPromiseを返す前に`queueMicrotask(...)`や`promise.then(...)`を予約すると、そのjobがconsumer側の`await` continuationより先に走り得る。Promise settlementまでarmしたままにすると「settlement後は失効」という境界にraceが残る。同期return直後にrevokeすれば、callbackが予約したmicrotask、Promise reaction、または最初の`await`後のcontinuationはclaimできない。

## 4. exact identityが拒否するもの

claimはstructural equalityではなく`WeakSet` keyのobject identityで判定する。

| 入力と時点                                       | 結果 | 理由                                                           |
| ------------------------------------------------ | ---- | -------------------------------------------------------------- |
| callback同期実行中のexact inputの初回claim       | 成功 | 対応registryに同一referenceが存在する                          |
| exact inputへの別aliasからの初回claim            | 成功 | aliasも同じreferenceであり、bearer possessionがauthorityである |
| spread、manual copy、structured clone            | 拒否 | fieldが同じでも別object identityである                         |
| exact inputをtargetにした`Proxy`                 | 拒否 | proxyはtargetと別の`WeakSet` keyである                         |
| production inputをtest claim APIへ渡す           | 拒否 | registry boundaryが異なる                                      |
| CoreForTests inputをproduction claim APIへ渡す   | 拒否 | test coreはproduction registryへmintしない                     |
| 同一inputのdouble claim                          | 拒否 | 初回の`delete`でsingle-use membershipを消費済みである          |
| callbackの同期return後、Promise pending中のinput | 拒否 | settlementを待たず`finally`ですでにrevoke済みである            |
| callbackが予約したmicrotask / Promise reaction   | 拒否 | callback return後に実行されるためclaim window外である          |
| callback Promise settlement後の保存済みinput     | 拒否 | 同期return時点ですでにexpiredしている                          |
| callback外で作ったstructurally valid object      | 拒否 | 一度もregistryへarmされていない                                |

失敗時は、productionまたはtest-only boundaryについて「exact active unclaimed input」が必要だというerrorになる。claimはboolean tokenやcopy可能なcredentialを返さず、成功時は`void`である。

## 5. production runnerは最初の`await`前にclaimする

将来のproduction runnerは、callback entryでexact inputを受け取った直後、他のcodeへ渡す前かつ最初の`await`前にproduction claim APIを同期実行する。

```text
await withVerifiedPinnedFloodgateTrainingRows(options, async (input) => {
  claimActiveVerifiedPinnedFloodgateTrainingRows(input) // 最初の同期action
  await stageTeacherWork(input)                         // private stageだけ
})

// ここへ到達して初めてconsumer postflight / closeも成功済み
// final publicationは別のverified transactionで行う
```

`async` callbackのbodyは最初の`await`まで同期実行されるため、この順序なら通常のscheduled async workへinputを露出する前にclaimを消費できる。最初の`await`後、`queueMicrotask`、Promise reaction、timerからのclaimは、callbackがすでにPromiseを返しているため拒否される。ただしregistry自身は同期invocation内の実行順序を強制しない。runnerがclaimより先にinputを別の同期codeへ渡せば、そのcodeがexact referenceで先にclaimできる。

ここが重要な限界である。claimはconsume callback function、call stack、module、task、request ID、または`AsyncLocalStorage` contextへaffinityを持たない。同期invocationのwindow内でactiveなexact referenceを所持するbearerなら誰でも最初のclaimに成功する。意図しないbearerが先にclaimすれば、意図したrunnerのclaimは失敗するが、registryは「誰が正当だったか」を判定しない。したがって同期claimは必須のcaller-side protocolであり、same-process adversaryに対するcaller authenticationの代用ではない。

## 6. claim成功が証明しないもの

successful claimが示すのは、次の狭い3点だけである。

- 対応するproductionまたはtest-only consumerが発行したexact objectである
- consumer callbackの同期invocationがreturnする前にclaimされた
- そのregistryでまだclaimされていなかった

claimはcallback開始直後に成功し得るが、consumerのfilesystem postflightとdescriptor closeはcallback Promise settlement後に行われる。したがってclaim成功はpostflight成功、input filesystemの最終不変、consumer全体のresolve、staged outputのcomplete性、またはpublication authorizationを示さない。runnerはcallback内ではprivate stageだけを作り、外側のconsumer Promiseがresolveした後にも別のartifact verification / publication boundaryを必要とする。

| このPRが確立すること                          | 確立しないこと                                                     |
| --------------------------------------------- | ------------------------------------------------------------------ |
| 同期callback inputのexact-object provenance   | callbackを受け取ったcallerのidentityや`AsyncLocalStorage` affinity |
| production / test-only registryの分離         | CoreForTestsからproduction provenanceをmintする能力                |
| single-use claimと同期callback return時expiry | consumer postflight、descriptor close、final publicationの成功     |
| clone / proxy / expired / double claimの拒否  | teacher engine、proposal、search、score、teacher labelの実行結果   |
| role selectorもholdout pathも追加しないAPI    | real data、selection、final holdoutを読んだという事実              |
| runtime capability boundary                   | accuracy、Elo、rank、または棋力向上のevidence                      |

このPRはreal bundleを実行せず、real training rowsを読まない。selectionとfinal holdoutも未読であり、teacher searchやlabel生成も行わない。runtime claimはprocess内のephemeral stateであり、durable result receiptでもstrength evidenceでもない。

## 7. 検証snapshot

| validation                     | 結果       | このPRで確認した範囲                                                               |
| ------------------------------ | ---------- | ---------------------------------------------------------------------------------- |
| targeted consumer Vitest       | 47/47 PASS | parser / FD consumer既存回帰とruntime claim敵対case                                |
| production / test registry隔離 | PASS       | module分離fake production配線で双方向拒否とproduction claim成功を確認              |
| forged / lifetime vectors      | PASS       | clone、Proxy、prototype、primitive、double、sync-return後、failure path            |
| scheduling vectors             | PASS       | pending Promise、最初の`await`後、microtask、settled reaction、nested / concurrent |
| primordial poisoning           | PASS       | captured native `WeakSet.add/delete`でactivation / claim / cleanup                 |
| full repository Vitest         | 1501/1501  | 97 test files                                                                      |
| Python ML stdlib               | 58/58      | `py_compile`を含むML contract回帰                                                  |
| TypeScript                     | PASS       | `tsc --noEmit`                                                                     |
| full repository ESLint         | 0 errors   | 既存warning 157件、今回の対象fileはwarningなし                                     |
| production build               | 193/193    | Next.js production buildのstatic page生成                                          |
| independent security review    | 2/2 CLEAN  | sync-window修正後に別々のreviewerがP0–P2なしと判定                                 |
| Prettier / diff check          | PASS       | 対象source、test、日英記事                                                         |

targeted suiteはtemporary directory、synthetic rows、fake verifierだけを使う。CoreForTestsはproduction registryをarmしない。production registryのtestはsynthetic verifier / manifestを使うmodule-isolated instanceだけで行い、real bundle、real training rows、engine、selection、final holdoutを入力にしていない。独立reviewで最初に見つかったPromise settlement / microtask raceは、同期callback return時revokeへ契約を狭めて修正し、再現testを加えた後に2者がcleanと再判定した。

## 8. 結論

この小PRは、production consumerがcallbackへ発行したexact inputを、同期callback invocation中に一度だけclaimできるruntime primitiveを追加した。production / test-onlyのmodule-private `WeakSet`を分離し、callback直前にarmし、captured native `WeakSet.delete`でsingle-useにし、callbackがPromiseを返すかthrowした直後にrevokeする。clone、proxy、同期return後のinput、double claim、registryを跨ぐclaimは通らない。

同時に、これはbearer possessionだけの境界である。callerやasync contextへのaffinityはなく、正しいrunnerであることをregistryが識別するわけではない。production runnerはcallback受領直後、最初の`await`前に同期claimし、それでも最終publicationはconsumer全体のpostflight / close成功と別のartifact transactionにgateしなければならない。

現時点で確立したのはruntime object provenanceのprimitiveだけである。production runner、real data、selection、final holdout、teacher search、teacher label、または棋力についての結果ではない。
