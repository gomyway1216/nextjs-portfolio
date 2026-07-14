# production authorityの前に3 gateを合成する — Floodgate v7 offline connector gate contract composition

> 本稿は、100 / 500 / 24,000の3 gateをactual production authorityなしで固定in-memory fixtureへ合成する、次PRの**設計draft**である。contract targetはsynthetic `CoreForTests` compositionを各gate exactly 1回、production gate executionを**0 / 0 / 0**とする。actual approved record / deployment key / dataset / checkpoint application-data I/Oは**0 / 0 / 0 / 0**、network request / child process / training / matchも**0 / 0 / 0 / 0**である。module sourceのcode-loadはこのapplication-data I/O countへ含めない。live evaluation functionとweightは**unchanged**、stable high-dan strengthは**not established**のままである。実装、test、review、PR、CI、mergeの値は完了するまで`PENDING`とし、fixture targetを実行証拠へ読み替えない。English version: [blog-shogi-floodgate-v7-offline-connector-gate-contract-composition.en.md](./blog-shogi-floodgate-v7-offline-connector-gate-contract-composition.en.md)

## 1. 現在地

| item                                           | current value                       | meaning                                 |
| ---------------------------------------------- | ----------------------------------- | --------------------------------------- |
| document                                       | design draft                        | 実装完了の証拠ではない                  |
| fixed synthetic fixture target                 | 100 / 500 / 24,000を各1 composition | exact 3 cases。実行結果は`PENDING`      |
| production gate execution                      | 0 / 0 / 0                           | real connectorを呼ばない                |
| actual record / key / dataset / checkpoint I/O | 0 / 0 / 0 / 0                       | application-data I/Oだけを数える        |
| production entrypoint named import / call      | 0 / 0                               | shared moduleのcode-loadとは区別する    |
| shared module source loading                   | I/O countの対象外                   | production wrapper定義もcode-loadされる |
| network / child / training / match             | 0 / 0 / 0 / 0                       | teacher、optimizer、対局を開始しない    |
| live weight / stable high-dan                  | unchanged / not established         | 棋力claimを生成しない                   |
| implementation / validation / review           | `PENDING`                           | 完了前にPASSを書かない                  |
| PR / CI / merge                                | `PENDING` / `PENDING` / `PENDING`   | URLやcheckを推定しない                  |

このPRが閉じるのは「3つのgate contractを、同じ固定fixture familyと同じtest-only ownership規則で決定論的に合成できるか」というgapだけである。production readiness、actual connector success、teacher throughput、学習、棋力は別のexecution evidenceである。

## 2. なぜoperational authorityより先にoffline compositionするのか

production connectorはapproved enrollment、readiness、coordinator、stage lease、deployment-key authority、authenticated training rows、checkpoint sink、postflightを1 invocationへ束ねる。real keyやdatasetを先に開くと、contract mismatchとoperational failureが同じrunで混ざり、cleanup不備もactual stateへ影響し得る。

offline compositionは次を先に検査する。

- 100 → 500 → 24,000のcumulative record contractが一致する。
- gateごとのsealed state、resume delta、receipt projectionが固定される。
- capability origin、single use、sequence、cleanupがproduction I/Oなしで検査できる。
- public JSONへpath、row、key、MAC、function、error causeが漏れない。
- failureが起きてもactual record、key、dataset、checkpointを変更しない。

これはproduction authorityの代替ではない。offline fixtureがPASSしても、actual key continuity、approved recordの正当性、real row integrity、checkpoint durabilityは証明しない。

## 3. Zero-argument APIと禁止経路

予定するoperator entryは次である。

```text
public API exact export name = PENDING
public API arguments         = 0
CLI                          = npm run shogi:floodgate-v7-offline-connector-gates
CLI positional arguments    = 0
CLI environment authority   = none
```

exact export名は実装で固定するまで`PENDING`だが、API contractはzero-argumentである。callerからgate、path、home、record、key ID、key bytes、rows、checkpoint root、clock、random source、filesystem facade、network client、child-process launcher、production capabilityを受け取らない。CLIも追加argumentを拒否し、内部のfixed three-gate suiteだけを実行する。

禁止経路は次である。

- production approved-record loader / preflightを呼ばない。
- deployment-key provisioner / inspector / readiness / authorityを呼ばない。
- production connector entry point、real coordinator、stage authorizer、row consumer、checkpoint sinkを呼ばない。
- `node:fs`、network、`child_process`経由で外部stateへ到達しない。
- teacher、training、selection、match、weight activationをimport side effectから開始しない。
- caller-injected production facadeをtest-only successへ混ぜない。

この境界はproduction関連module graphの不在を意味しない。runnerがshared modulesから実行可能なものとしてnamed import / callするのはtest-only factoryとinjected `CoreForTests` seamだけであり、production loader、production claim、production connector entrypointをnamed importもcallもしない。一方で、同じshared module graphにはproduction wrapperとproduction dependency definitionも同居するため、それらのsourceはcode-loadされ、その推移的依存には`node:fs`、`node:os`、`node:path`、`node:child_process`が含まれ得る。したがって、本稿は「production module import 0」や「transitive filesystem / child-process import graph 0」をclaimしない。module source loadingはapplication-data I/O countから除外し、code-loadのside effectでproduction entrypointやexternal state accessを開始しないことを別に検査する。

実装がこれらの禁止経路をsource、dependency table、testで証明するまでは、section 8の値を`PENDING`から変更しない。

## 4. 固定synthetic fixtures

fixtureはmodule-ownedなfixed in-memory dataだけで構成する。gateごとにcallerが値を選べるfactoryは公開せず、test-only coreへ渡すdependencyもfresh、frozen、exact-shapeにする。

| fixture field                | fixed rule                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| execution boundary           | `test-only-fixed-in-memory-no-production-capability-composition`                                            |
| gate order                   | 100、500、24,000                                                                                            |
| composition count            | 各gate exactly 1                                                                                            |
| approved enrollment origin   | test-only。production claim originをmintしない                                                              |
| readiness                    | fixed synthetic `ready` metadata。actual homeをprobeしない                                                  |
| coordinator / stage / key    | test-only single-use capability。production registryへ登録しない                                            |
| training rows                | fixed synthetic row 1件。内部にSFEN / moveを持つがpublic projectionへ出さず、label / real datasetは持たない |
| checkpoint / postflight      | in-memory receipt owner。file、directory、fsyncを使わない                                                   |
| time / randomness            | dynamic timestampとrandom IDを使わない                                                                      |
| paths / secrets / byte views | fixture、receipt、errorのpublic fieldへ含めない                                                             |

fixture shapeのunknown key、symbol key、accessor、Proxy、sparse array、NULを含むstring、unsafe integer、wrong originはfail closedにする。予定するreceipt field `dynamic_identifiers_are_synthetic: true`はfixed test constantの`run_id`、`key_instance_id`、`approval_id`だけを指す。`key_id`はshared public contract identifierであり、synthetic dynamic IDではないが、それ自体はproduction authorityやcapabilityでもない。

## 5. 100 → 500 → 24,000 gate matrix

3 fixtureは同じlogical streamのcumulative contractを表す。24,600件を別々に作る意味ではない。

| gate contract        | before |  added |  after | sealed | synthetic composition target | production execution |
| -------------------- | -----: | -----: | -----: | :----: | ---------------------------: | -------------------: |
| `durable-prefix-100` |      0 |    100 |    100 | false  |                            1 |                    0 |
| `durable-prefix-500` |    100 |    400 |    500 | false  |                            1 |                    0 |
| `sealed-final-24000` |    500 | 23,500 | 24,000 |  true  |                            1 |                    0 |

各caseはtarget、completed record count、resume boundary、sealed flag、gate-specific byte ceiling、checkpoint statusをexact比較する。byte ceilingやreceipt fieldの最終constantはimplementation sourceとtestが固定するまで`PENDING`であり、本稿で値を発明しない。1 caseの成功から別gateの成功を推定せず、3 caseを別々に検査してからordered aggregateを作る。

## 6. Capability、sequence、cleanup

予定する1 gateのsequenceは次である。

1. fixed fixtureをexact-shapeでcaptureする。
2. test-only approved-enrollment capabilityを1つmintする。
3. test-only claim APIでexact 1回claimし、production claim APIは使わない。
4. synthetic readiness、coordinator、stage、key、input、checkpoint、postflight ownerを取得する。
5. connectorのinjected `CoreForTests`をexact 1回composeする。
6. gate receipt、ownership transition、public projectionを検証する。
7. success / failureの両方で未claim capabilityをrevokeし、lease、key、coordinatorをterminal stateへ進める。
8. resource countとcleanup resultを検証してから次gateへ進む。

各capabilityはexact object identity、test-only origin、single-useを要求する。clone、same-shaped object、wrong-origin、consumed capabilityは拒否する。failure後に同じcapabilityを再利用せず、fresh fixture invocationを必要とする。

cleanupはprimary failureと分離して全terminal actionを開始し、結果をsettleする。public failureへraw cause、path、row、key、MAC、capabilityを返さない。cleanup failure countとfixed retry dispositionだけをbounded projectionへ含める設計とし、実装・fault-injection coverageは`PENDING`である。

## 7. Deterministic JSON

成功時のtarget schemaは次のexact public valuesを使う。

```text
schema             = shogi-floodgate-v7-offline-connector-gate-contract-composition-v1
status             = complete-fixed-in-memory-three-gate-test-only-contract-composition
execution_boundary = test-only-fixed-in-memory-no-production-capability-composition
encoding           = UTF-8
records            = exact 1 pretty-printed JSON document + final LF
```

`status = complete...`が意味するのは、fixed in-memory 3-gate compositionがそのCLI invocation内で完了したことだけである。production connector、actual checkpoint、training、strengthのcompletionではない。実装前の現在はこのstatusをemitした実行証拠も`PENDING`である。

JSON field order、gate order、boolean、safe integer、lowercase hex、string ceilingを固定する。timestamp、hostname、absolute path、random ID、process ID、descriptor、function、Buffer / `Uint8Array`、row、SFEN、move、label、key material、MAC、raw errorを含めない。canonical bytesは同じfixtureとimplementation revisionでrepeat可能にする。stdoutはindent 2 spacesのpretty-printed JSON document 1件とfinal LFであり、one-line JSONLではない。stderrはfixed sanitized failureだけにし、stdout writeまたはclose failureもsuccessとして返さない。

予定するtop-level projectionは`schema`、`status`、`execution_boundary`、ordered `gate_compositions`、aggregate `nonclaims`である。final exact key set、field order、canonical sample bytes、digestはimplementation testが固定するまで`PENDING`とする。

## 8. Validation、review、途中attempt

実装未完成のため、次の値を先にPASSへしない。

| evidence                                 | status    | measured value                                            |
| ---------------------------------------- | --------- | --------------------------------------------------------- |
| focused contract / CLI tests             | `PENDING` | `PENDING`                                                 |
| 100 / 500 / 24,000 composition cases     | `PENDING` | `PENDING`                                                 |
| failure / cleanup / poison tests         | `PENDING` | resource取得後のcheckpoint failure cleanup testを追加予定 |
| connector-related regression             | `PENDING` | `PENDING`                                                 |
| full Vitest                              | `PENDING` | `PENDING`                                                 |
| Python stdlib                            | `PENDING` | `PENDING`                                                 |
| TypeScript                               | `PENDING` | `PENDING`                                                 |
| scoped / full lint、Prettier、diff check | `PENDING` | `PENDING`                                                 |
| production build / npm audit             | `PENDING` | `PENDING`                                                 |
| independent code / test review P0/P1/P2  | `PENDING` | `PENDING`                                                 |
| ready PR review / required CI / merge    | `PENDING` | `PENDING`                                                 |

途中attemptが失敗した場合は、runtime、revision、worker count、file / test count、duration、wall time、maximum RSS、failure phaseを保存する。単独rerunがPASSしても全体runをPASSへ変えず、後続のauthoritative full runを別に記録する。原因が証明されるまでは`resource contention`、`flaky`、`unrelated`と断定しない。数値を得るまではすべて`PENDING`である。

## 9. Explicit nonclaimsとlive unchanged

- production approved-record load / claim: **0 / 0**
- actual deployment-key open / key bytes read: **0 / 0 bytes**
- real dataset read / production training-row callback: **0 / 0**
- fixed synthetic in-memory row callback: **各gate 1 target**
- actual checkpoint write / fsync / seal: **0 / 0 / 0**
- production connector 100 / 500 / 24,000 gates: **0 / 0 / 0**
- network request / child process / teacher label: **0 / 0 / 0**
- training run / optimizer step / candidate weight: **0 / 0 / 0**
- production weight overwrite / live activation: **0 / unchanged**
- match / Elo / rating / rank evidence: **0 / 0 / not established / not established**
- stable high-dan strength: **not established**
- production readiness: **not established**

synthetic fixture各1というtargetはproduction execution countではない。offline CLI、unit test、CI、merge、application deployはactual key、record、dataset、checkpointを開かず、teacher、training、match、weight activationを自動開始しない。

## 10. Next safe step

1. exact export名、fixed dependency table、3 fixture、deterministic projectionを実装する。
2. gate matrix、origin / single-use、resource取得後のcheckpoint failure cleanup、leak boundary、CLI argument / stream failureのunit testを追加する。
3. focused、related、full、static validationを実測し、section 8の`PENDING`をexact値だけで置き換える。
4. independent code / test reviewを行い、指摘を修正してからfinal sealを取る。
5. ready PRを作成し、review comment、required CI、regular mergeを別々に記録する。
6. merge後もproduction executionは0のまま保持する。
7. actual record / key / dataset I/Oや100-parent gateは、このoffline PRとは別のexplicit operational approvalがあるまで開始しない。

最も近い安全な到達点は、**3つのfixed test-only compositionが決定論的にPASSし、production I/Oが0であることをreview可能な証拠へすること**である。それは高段の達成ではなく、real 100-parent gateへ進む前のcontract boundaryである。
