# voidの隙間をexact receiptで閉じる — Floodgate consumer postflight capability

> [前段のruntime input claim](./blog-shogi-floodgate-consumer-runtime-claim.md)は、production consumerがcallbackへ渡したexact inputを同期invocation中に一度だけclaimできるようにした。しかし既存consumerの戻り値は`Promise<void>`であり、callback settlement、callback後のfilesystem再検証、raw/root descriptorのcloseがすべて成功した事実を、後段finalizerへexact objectとして渡せなかった。本PRは、同期input claimを必須にした新しいpostflight APIを追加し、成功した全lifecycleの後だけdeep-frozenなsingle-use receiptをmintする。これはprocess内のconsumer input/lifecycle bindingであり、staged output、teacher label、training、または棋力の証拠ではない。real data、selection、final holdoutは未使用・未読である。English version: [blog-shogi-floodgate-consumer-postflight-capability.en.md](./blog-shogi-floodgate-consumer-postflight-capability.en.md)

---

## 1. `Promise<void>`では成功を合成できなかった

既存の`withVerifiedPinnedFloodgateTrainingRows(...)`は、pinned bundleの検証、callback実行、callback後のsnapshot再検証、descriptor closeを完了すると`void`でresolveする。このAPI単体のfail-closed動作は維持されるが、後段から見ると、成功したinvocationへ結び付いたexact capabilityが残らない。

```text
verified input -> callback -> postflight -> close -> void
                                                  |
                                                  +-> exact lifecycle objectなし
```

そのため、private stageを検証してresult/manifestを確定する将来のfinalizerが、「このconsumer invocationでexact inputを同期claimし、その後のpostflightとcloseまで成功した」という事実をobject identityで要求できなかった。booleanやcaller側で再構成したrecordでは、成功したinvocationそのものへ結び付かない。

新しいAPIは既存void APIを変更せず、明示的なpostflight variantとしてreceiptを返す。

- `withVerifiedPinnedFloodgateTrainingRowsAndPostflight(...)`はproduction固定verifierを使う
- `withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(...)`はdependency-injected test boundaryだけを使う
- 従来のvoid APIは互換のままであり、callbackがruntime claimを行わなくてもよい
- 新しいpostflight APIだけが、exact synchronous input claimをreceipt mintの必須条件にする

## 2. mint条件は一つの順序に固定した

postflight receiptへ至る順序は次である。

1. pinned training bundleとheld filesystem snapshotを検証する
2. pathlessでdeep-frozenなcallback inputを構築する
3. callback直前に、そのexact inputのruntime claimをarmする
4. callbackは同期invocation中、すなわち`async` callbackなら最初の`await`より前にexact inputをclaimする
5. callbackがnative `Promise`を返した時点でclaim windowを閉じ、claim成功markerをsingle-useで回収する
6. callback Promiseが`undefined`でresolveしたことを確認する
7. callback後にheld raw/root snapshotを再検証する
8. raw descriptorとroot descriptorを両方closeする
9. close errorが一件もない場合だけreceiptを構築し、対応するpostflight registryへ登録する
10. callerへexact receiptを返す

step 5でclaim markerがなければ、callback Promiseへrejection observerだけを付け、settlementは待たず直ちに失敗処理とdescriptor closeへ進む。したがって、claimしていないcallbackがnever-settling Promiseを返してもraw/root descriptorを保持し続けない。

```text
exact input claim
       |
       v
callback resolves undefined
       |
       v
filesystem snapshot revalidated
       |
       v
raw FD closed -> root FD closed
       |
       v
deep-frozen receipt minted and armed
```

callbackが同期throw、非同期reject、値付きresolveのいずれかならreceiptはない。callback後にraw/root identityが変わった場合も、rawまたはroot descriptorのcloseが失敗した場合もmintしない。

## 3. exact synchronous input claimが必須である

postflight APIのcallbackは、前段で追加したruntime claimを同期的に成功させなければならない。

```ts
const receipt = await withVerifiedPinnedFloodgateTrainingRowsAndPostflight(
  options,
  async (input) => {
    claimActiveVerifiedPinnedFloodgateTrainingRows(input);
    await writeOnlyToPrivateStage(input);
  },
);
```

consumerはruntime registryの`claimed` markerをcallback同期return時に回収する。exact inputをclaimしなかった場合、cloneをclaimした場合、test inputをproduction APIでclaimした場合、またはmicrotaskや最初の`await`後までclaimを遅らせた場合はmarkerがなく、postflight receiptをmintしない。

claim成功後にcallbackが失敗してもreceiptにはならない。runtime claimは必要条件であって十分条件ではなく、後続のsettlement、snapshot、closeを飛び越えるauthorizationではない。

## 4. callbackは値を返してはいけない

型は`Promise<void>`だが、TypeScriptの型だけではruntimeの値付きfulfillmentを防げない。新しいboundaryはcallback Promiseのsettlement valueを実行時に確認し、exactに`undefined`でなければrejectする。

| callback outcome                    | receipt                      |
| ----------------------------------- | ---------------------------- |
| `Promise.resolve(undefined)`        | 後続条件が全部通ればmint可能 |
| synchronous throw                   | mintしない                   |
| rejected Promise                    | mintしない                   |
| `Promise.resolve("unexpected")`     | mintしない                   |
| non-native / malformed Promise path | consumer guardが拒否         |

この制約により、callback独自の戻り値を暗黙のresultやauthorizationとして混ぜない。staged outputのidentityやteacher resultは、別のfinalizerが明示的に検証してmanifestへ結び付ける。

## 5. postflight snapshotとdescriptor closeの後だけmintする

callbackがsettleした後、consumerは開始時から保持していたraw file descriptorとroot directory descriptorを使い、filesystem snapshotがcallback境界をまたいで変わっていないことを再検証する。その後、rawとrootの両descriptorをcloseする。

receiptはcloseより前には作られず、registryにも登録されない。raw closeに失敗してもroot closeを試み、どちらか一方でもerrorがあればfailureとして返す。callback処理とcloseが両方失敗した場合はprimary failureとclose failuresを保持したcombined failureになり、成功receiptはない。

この順序により、receipt中の次の3つのpostflight fieldは同じ完了点を表す。

```text
callback_settled_without_value: true
filesystem_snapshot_revalidated_after_callback: true
input_descriptors_closed: true
```

ただし、これらはconsumerが保持したinput側snapshotについての事実である。private stageの完全性、出力bytes、publication durabilityを検証したという意味ではない。

## 6. receiptのexact fieldsとtrust model

receiptはnull-prototype、non-writable、non-configurable fieldから構築され、nested objectを含めてdeep-frozenである。top-level own keysは次のexact orderと集合に固定される。

```text
schema
status
claim_boundary
execution_boundary
input
runtime_claim
postflight
```

`input.binding`は、result receiptのbytes/SHA-256、bundle manifestのbytes/SHA-256、producer/verifier revision、raw format、raw bytes/SHA-256、record/game count、game/parent/position identifier digestをcopyではなく検証済みbindingからcaptureする。path、file descriptor、raw bytes、rows、role selector、staged output、teacher labelはreceiptへ入らない。

主要なconstant値は次である。

| Field                | Exact value / meaning                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `schema`             | `shogi-authenticated-floodgate-training-postflight-v1`                |
| `status`             | `verified-runtime-input-claim-postflight-and-descriptors-closed`      |
| `execution_boundary` | production固定verifier、またはtest-only injected verifier             |
| `runtime_claim`      | exact inputを同期callback invocation中にsingle-use claimしたこと      |
| `claim_boundary`     | consumer input/lifecycle bindingだけで、output/label/strengthではない |

trust modelはprocess内のmodule-private object identityである。receiptはcryptographic credentialでも永続receiptでもなく、exact objectを持つbearerがauthorityになる。後段はfieldを読むだけでなく、対応するclaim APIでexact receiptを同期claimしなければならない。

## 7. productionとtestは別のpostflight registryである

runtime input claimと同様に、postflight receiptにもmodule-privateな2つの`WeakSet`を使う。

```text
PRODUCTION_POSTFLIGHT_CLAIMS -> production receiptだけ
TEST_POSTFLIGHT_CLAIMS       -> CoreForTests receiptだけ
```

production receiptは`claimVerifiedFloodgateTrainingConsumerPostflight(...)`だけでclaimできる。CoreForTests receiptは`claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(...)`だけでclaimできる。test dependencyはproduction registryへreceiptをaddできない。

claimはcaptured native `WeakSet.prototype.delete`を使うsingle-use operationである。exact receiptの初回claimだけが成功し、double claim、structured clone、spread/manual copy、exact receiptをtargetにした`Proxy`、cross-registry claimは失敗する。cloneやProxyの失敗はexact receiptを消費しないため、その後の正しい初回claimは成功する。

## 8. failure matrixとnonclaims

| 条件                                                               | receipt mint | 説明                                     |
| ------------------------------------------------------------------ | ------------ | ---------------------------------------- |
| exact inputを同期claim、void settlement、snapshot不変、全close成功 | する         | consumer lifecycle bindingが完成         |
| input claimなし / clone / wrong registry / late claim              | しない       | exact synchronous input provenanceがない |
| callback throw / reject / value付きresolve                         | しない       | callback completion contractが不成立     |
| callback後のraw/root snapshot変化                                  | しない       | held input filesystem identityが不安定   |
| raw/root descriptor close failure                                  | しない       | input lifecycleが完了していない          |
| receipt clone / Proxy / double / cross-registry claim              | claim拒否    | exact single-use receiptではない         |

receiptの成功が証明しないものも明示する。

- private stageの内容、完全性、許可file集合、またはdurability
- proposal/checkpoint、engine execution、search depth、score、teacher label
- result/manifestの存在、authentication、publication、またはtrainingへの採用
- real training dataを使ったこと
- selection/final holdoutを読んだこと、またはそれらで勝ったこと
- accuracy、Elo、段位、安定性、棋力向上

同一process内でactiveなexact receiptを取得したbearer自体はclaimできる。このprimitiveはcaller identity、module identity、`AsyncLocalStorage` affinity、またはhostile same-process codeに対するsandboxではない。

## 9. synthetic evidence

新しいfocused suiteはtemporary directory、synthetic training rows、fake manifest/verifier、instrumented descriptor closeだけを使う。real bundle、real棋譜、engine、teacher、selection、final holdoutには触れない。

| Evidence                          | Result  | 検査内容                                                               |
| --------------------------------- | ------- | ---------------------------------------------------------------------- |
| consumer postflight focused suite | 14 / 14 | exact receipt、deep freeze、single use、clone/Proxy/cross-registry拒否 |
| postflight + 既存consumer suites  | 61 / 61 | 新APIと従来void APIの同時回帰                                          |
| required input claim              | covered | missing/clone/wrong-registry/late/never-settlingではmintせず即close    |
| callback completion               | covered | sync throw、async reject、値付きresolveではmintしない                  |
| postflight filesystem check       | covered | callback後mutationではmintしない                                       |
| descriptor lifecycle              | covered | raw/root closeの順序、両close完了後だけreturn、各close failure         |
| legacy compatibility              | covered | 既存void APIはclaimなしcallbackを引き続き受理                          |

このevidenceはsynthetic contract regressionであり、棋譜品質やengine strengthを測るexperimentではない。test fixtureのdigestやrevisionもsyntheticであり、production dataの結果として解釈してはならない。

## 10. 次はresult/manifest finalizerである

このPRで、将来のcoordinatorがconsumer lifecycle成功をexact single-use capabilityとして受け取れるようになった。次の境界は、private stageのartifactを検証し、このpostflight receiptとproposal/checkpoint evidenceへ結び付け、resultとmanifestをcrash-safeな順序で確定するfinalizerである。

```text
authenticated proposal/checkpoint
            +
exact consumer postflight receipt
            +
verified private stage artifacts
            |
            v
result -> fsync -> directory sync
            |
            v
manifest -> fsync -> directory sync
```

finalizerは少なくとも`{work}`、`{work,result}`、`{work,result,manifest}`のcrash stateを区別し、manifestがwork/result identitiesとconsumer bindingを認証する必要がある。その後にだけpublication transactionへ進める。

現時点で得られたのは、exact synchronous input claim、callbackのvoid settlement、callback後snapshot、raw/root descriptor closeを一つのprocess-local receiptへ合成するcapabilityである。real data、holdout、teacher label、training、対局評価はまだ行っておらず、安定して高段になったという主張はしない。
