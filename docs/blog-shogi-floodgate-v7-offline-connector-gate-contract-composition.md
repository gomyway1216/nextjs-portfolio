# production authorityの前に3 gateを合成する — Floodgate v7 offline connector gate contract composition

> 本稿は、100 / 500 / 24,000の3 gateをactual production authorityなしで固定in-memory fixtureへ合成した**実装とローカル検証の記録**である。synthetic `CoreForTests` compositionは各gate exactly 1回、production gate executionは**0 / 0 / 0**だった。actual approved record / deployment key / dataset / checkpoint application-data I/Oは**0 / 0 / 0 / 0**、runner applicationのnetwork request / `child_process` launch / training / matchも**0 / 0 / 0 / 0**である。module sourceのcode-loadとtest harness infrastructureはこのapplication-data / application-operation countへ含めず、後段で別記する。live evaluation functionとweightは**unchanged**、stable high-dan strengthは**not established**のままである。focused / 3-file / related / full Vitest、production build、TypeScript、full ESLint、Prettier、Python stdlib、npm audit、independent reviewはローカルでPASSした。PR、CI、mergeの実施結果はclaimせず、引き続き`PENDING`である。offline fixtureの成功をproduction実行や棋力向上へ読み替えない。English version: [blog-shogi-floodgate-v7-offline-connector-gate-contract-composition.en.md](./blog-shogi-floodgate-v7-offline-connector-gate-contract-composition.en.md)

## 1. 現在地

| item                                           | current value                                                          | meaning                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------- |
| document                                       | implemented / local validation complete                                | PR / CI / mergeはこの結果に含めない             |
| implementation revision                        | `04f6dad7cd35737c9d7e9f67e85cb98afd418f43`                             | source、test、local evidenceの対象              |
| fixed synthetic fixture execution              | 100 / 500 / 24,000を各1 composition                                    | exact 3 casesが完了                             |
| deterministic fresh-process capture            | 4 / 4 PASS                                                             | 4回ともexit 0かつbyte-identical                 |
| production gate execution                      | 0 / 0 / 0                                                              | production connector entrypointを実行していない |
| actual record / key / dataset / checkpoint I/O | 0 / 0 / 0 / 0                                                          | application-data I/Oだけを数える                |
| production entrypoint named import / call      | 0 / 0                                                                  | shared moduleのcode-loadとは区別する            |
| shared module source loading                   | I/O countの対象外                                                      | production wrapper定義も推移的にcode-loadされる |
| runner network / child / training / match      | 0 / 0 / 0 / 0                                                          | harnessを除くapplication operation count        |
| live weight / stable high-dan                  | unchanged / not established                                            | 棋力claimを生成しない                           |
| completed validation                           | focused 11 / 11、3-file 73 / 73、related 449 / 449、full 2,257 / 2,257 | 列挙したlocal checkはすべてPASS                 |
| PR / CI / merge                                | `PENDING` / `PENDING` / `PENDING`                                      | URLやcheck結果を推定しない                      |

この変更が閉じるのは「3つのgate contractを、同じ固定fixture familyと同じtest-only ownership規則で決定論的に合成できるか」というgapだけである。production readiness、actual connector success、teacher throughput、学習、棋力は別のexecution evidenceである。

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

実装したoperator entryは次である。

```text
public API exact export name = runFloodgateV7OfflineConnectorGateContractComposition
public API arguments         = 0
CLI                          = npm run shogi:floodgate-v7-offline-connector-gates
CLI positional arguments    = 0
CLI environment authority   = none
```

API contractはzero-argumentである。callerからgate、path、home、record、key ID、key bytes、rows、checkpoint root、clock、random source、filesystem facade、network client、child-process launcher、production capabilityを受け取らない。CLIも追加argumentを拒否し、内部のfixed three-gate suiteだけを実行する。CLIは`argv`を検査してからrunnerをlazy-loadするため、import-onlyでは何も実行せず、追加argumentはrunner graphをloadする前に拒否される。

禁止経路は次である。

- production approved-record loader / preflightを呼ばない。
- deployment-key provisioner / inspector / readiness / authorityを呼ばない。
- production connector entry point、real coordinator、stage authorizer、row consumer、checkpoint sinkを呼ばない。
- runner application executionから`node:fs`、network、`child_process`経由でproduction external stateへ到達しない。
- teacher、training、selection、match、weight activationをimport side effectから開始しない。
- caller-injected production facadeをtest-only successへ混ぜない。

この境界はproduction関連module graphの不在を意味しない。runnerがshared modulesから実行可能なものとしてnamed import / callするのは`createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests`と`runFloodgateV7ProductionCheckpointConnectorCoreForTests`だけであり、production loader、production claim、production connector entrypointをnamed importもcallもしない。一方で、同じshared module graphにはproduction wrapperとproduction dependency definitionも同居するため、それらのsourceはcode-loadされ、その推移的依存には`node:fs`、`node:os`、`node:path`、`node:child_process`が含まれ得る。したがって、本稿は「production module import 0」や「transitive filesystem / child-process import graph 0」をclaimしない。module source loadingはapplication-data I/O countから除外する。fresh-process trapは列挙したapplication-facing public APIの範囲でcode-loadと実行を検査し、その集合に対するunexpected call **0**を観測した。一方、別のinstrumentationでは必要なharness infrastructureとしてTSX loader source read、config read、`Worker` creation、effective-ID lookup、parent IPCがいずれもnonzeroであることを確認した。これはenumerated API-level trapの結果であり、general syscall sandboxでもOS activity全体が0というclaimでもない。

この検査で見つかったimport-time identity accessを避けるため、training-row consumerは`process.getuid`の関数参照だけをcaptureし、module import時には呼ばない。real snapshotを開く時点でexactly 1回だけ呼び、同じUIDをrootとraw snapshotの検査へ使う。fresh-module regression testはimport時0回、snapshotごと1回、2 snapshotで累計2回、正しい`this` bindingを固定している。

## 4. 固定synthetic fixtures

fixtureはmodule-ownedなfixed in-memory dataだけで構成する。gateごとにcallerが値を選べるfactoryは公開せず、test-only coreへ渡すdependencyもfresh、frozen、exact-shapeにする。

| fixture field                | fixed rule                                                                                            |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| execution boundary           | `test-only-fixed-in-memory-no-production-capability-composition`                                      |
| gate order                   | 100、500、24,000                                                                                      |
| composition count            | 各gate exactly 1                                                                                      |
| approved enrollment origin   | test-only。production claim originをmintしない                                                        |
| readiness                    | fixed synthetic `ready` metadata。actual homeをprobeしない                                            |
| coordinator / stage / key    | test-only single-use capability。production registryへ登録しない                                      |
| training rows                | fixed synthetic row 1件。内部のSFEN / moveはpublic projectionへ出さず、label / real datasetは持たない |
| checkpoint / postflight      | in-memory receipt owner。file、directory、fsyncを使わない                                             |
| time / randomness            | dynamic timestampとrandom IDを使わない                                                                |
| paths / secrets / byte views | fixture、receipt、errorのpublic fieldへ含めない                                                       |

fixture shapeのunknown key、symbol key、accessor、Proxy、sparse array、NULを含むstring、unsafe integer、wrong originはfail closedにする。receipt field `dynamic_identifiers_are_synthetic: true`はfixed test constantの`run_id`、`key_instance_id`、`approval_id`だけを指す。`key_id`はshared public contract identifierであり、synthetic dynamic IDではないが、それ自体はproduction authorityやcapabilityでもない。

## 5. 100 → 500 → 24,000 gate matrix

3 fixtureは同じlogical streamのcumulative contractを表す。24,600件を別々に作る意味ではない。

| gate contract        | before |  added |  after | sealed | synthetic composition execution | production execution |
| -------------------- | -----: | -----: | -----: | :----: | ------------------------------: | -------------------: |
| `durable-prefix-100` |      0 |    100 |    100 | false  |                               1 |                    0 |
| `durable-prefix-500` |    100 |    400 |    500 | false  |                               1 |                    0 |
| `sealed-final-24000` |    500 | 23,500 | 24,000 |  true  |                               1 |                    0 |

各caseはtarget、completed parent count、resume boundary、record count、sealed flag、gate-specific bytes、checkpoint statusをexact比較する。確定した`records / bytes`は順に`102 / 1,791,893`、`503 / 8,948,379`、`24,004 / 429,247,143`である。1 caseの成功から別gateの成功を推定せず、3 caseを別々に検査してからordered aggregateを作る。

## 6. Capability、sequence、cleanup

実装した1 gateのsequenceは次である。

1. fixed fixtureをexact-shapeでcaptureする。
2. test-only approved-enrollment capabilityを1つmintする。
3. test-only claim APIでexact 1回claimし、production claim APIは使わない。
4. synthetic readiness、coordinator、stage、key、input、checkpoint、postflight ownerを取得する。
5. connectorのinjected `CoreForTests`をexact 1回composeする。
6. gate receipt、ownership transition、public projectionを検証する。
7. success / failureの両方で未claim capabilityをrevokeし、lease、key、coordinatorをterminal stateへ進める。
8. resource countとcleanup resultを検証してから次gateへ進む。

各capabilityはexact object identity、test-only origin、single-useを要求する。clone、same-shaped object、wrong-origin、consumed capabilityは拒否する。failure後に同じcapabilityを再利用せず、fresh fixture invocationを必要とする。

cleanupはprimary failureと分離して全terminal actionを開始し、結果をsettleする。public failureへraw cause、path、row、key、MAC、capabilityを返さない。resource取得後に2番目のgateのcheckpointを失敗させるtestでは、key discard、lease close、coordinator abortをそれぞれexactly 1回settleし、failure observerを呼び、postflight claimと3番目のgateを開始しないことを確認した。成功経路では各gateのkey、lease、coordinator cleanupが完了してから次のfresh capabilityを作る。

## 7. Deterministic JSON

成功時は次のexact public valuesを使う。

```text
schema             = shogi-floodgate-v7-offline-connector-gate-contract-composition-v1
status             = complete-fixed-in-memory-three-gate-test-only-contract-composition
execution_boundary = test-only-fixed-in-memory-no-production-capability-composition
encoding           = UTF-8
records            = exact 1 pretty-printed JSON document + final LF
```

`status = complete...`が意味するのは、fixed in-memory 3-gate compositionがそのCLI invocation内で完了したことだけである。production connector、actual checkpoint、training、strengthのcompletionではない。

JSON field order、gate order、boolean、safe integer、lowercase hex、string ceilingを固定する。timestamp、hostname、absolute path、random ID、process ID、descriptor、function、Buffer / `Uint8Array`、row、SFEN、move、label、key material、MAC、raw errorを含めない。canonical bytesは同じfixtureとimplementation revisionでrepeat可能にする。stdoutはindent 2 spacesのpretty-printed JSON document 1件とfinal LFであり、one-line JSONLではない。stderrはfixed sanitized failureだけにし、stdout writeまたはclose failureもsuccessとして返さない。

top-level public keyは順に`schema`、`status`、`claim_boundary`、`trust_boundary`、`execution_boundary`、`connector`、`synthetic_fixture`、`gates`、`cross_gate`、`operation_counts`、`nonclaims`である。

保存したprotocolは[`ml/protocols/floodgate-v7-offline-connector-gate-contract-composition-04f6dad-result.json`](../ml/protocols/floodgate-v7-offline-connector-gate-contract-composition-04f6dad-result.json)で、CLI stdoutとexact一致する6,254 bytes、SHA-256 `f66f1b6745626a22d22c1e2e484b4bb674e6d57f65ae7138e60f621a0be6505f`である。fresh process 4回はすべてexit 0で、4 / 4のbytesとdigestが一致した。

## 8. Validation、review、途中attempt

次はimplementation revision `04f6dad7cd35737c9d7e9f67e85cb98afd418f43`に対する確定済みのローカル結果である。

| evidence                              | status    | measured value                                                                                                                                      |
| ------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| deterministic CLI capture             | PASS      | fresh process 4 / 4、exit 0、6,254 bytes、exact byte-identical                                                                                      |
| focused contract / CLI tests          | PASS      | Node v22.13.0、1 file、11 / 11 tests、Vitest 1.49s、real 1.85s、maximum RSS 316,293,120 bytes                                                       |
| 100 / 500 / 24,000 composition cases  | PASS      | 各gate 1 test-only composition、production invocation 0 / 0 / 0                                                                                     |
| failure / cleanup / poison tests      | PASS      | resource取得後のsecond-gate checkpoint failureを含む                                                                                                |
| row-consumer 3-file regression        | PASS      | 3 files、73 / 73 tests、Vitest 2.02s。wall time / RSSは記録なし                                                                                     |
| connector-related regression          | PASS      | Node v22.13.0 / npm 11.14.1、12 files、449 / 449 tests、Vitest 154.26s、real 154.88s、maximum RSS 4,280,254,464 bytes、exit 0                       |
| authoritative full Vitest             | PASS      | Node v22.13.0 / npm 11.14.1、123 files、2,257 / 2,257 tests、Vitest 179.26s、real 179.92s、maximum RSS 3,310,829,568 bytes、exit 0                  |
| production build                      | PASS      | real 34.13s、maximum RSS 2,549,137,408 bytes、edge-runtime warning 1件、build-time Firebase / `DYNAMIC_SERVER_USAGE` logはhandled、terminal error 0 |
| TypeScript                            | PASS      | diagnostics 0、real 3.16s、maximum RSS 1,082,179,584 bytes、exit 0                                                                                  |
| full ESLint                           | PASS      | errors 0、warnings 157、real 28.75s、maximum RSS 1,343,275,008 bytes                                                                                |
| Prettier                              | PASS      | real 1.39s、maximum RSS 161,300,480 bytes                                                                                                           |
| Python stdlib                         | PASS      | 58 / 58 tests、real 0.89s、maximum RSS 65,011,712 bytes                                                                                             |
| npm audit                             | PASS      | 全severityでvulnerability 0、real 0.97s、maximum RSS 134,791,168 bytes                                                                              |
| enumerated public-API security trap   | PASS      | unexpected call 0。別途TSX loader / `Worker` / effective-ID / parent-IPC infrastructureのnonzeroを確認。general syscall sandboxではない             |
| independent review                    | PASS      | final P0 / P1 / P2 = 0 / 0 / 0                                                                                                                      |
| ready PR review / required CI / merge | `PENDING` | 実施結果をclaimしない                                                                                                                               |

Node permission-modelによる補助検査はgating evidenceにしていない。最初の3 attemptは順にTSX cache write、case-sensitive source read、esbuild worker permissionでrunner開始前に失敗した。4回目はexit 0だったが、`--allow-worker`がpermission modelを弱め得るというNodeのwarningを伴ったためsupporting-onlyである。代わりに、fresh-process trap testと通常のunit / regression結果をgating evidenceとして扱う。

runtime pinningも必要だった。machine defaultのNode v20.14.0はpackageのsupported range `>=22.13.0 <24`外であり、このruntimeによるattemptはすべてnon-gatingである。先のwrong-runtime full-suite attemptは`structuredClone` failureに達し、real 266.71s、maximum RSS 3,891,511,296 bytesでabortした。後のrelated-suite initial invocationも誤ってNode v20.14.0へfall throughしたためdiscardして再実行した。上表ではfinal Node v22.13.0 / npm 11.14.1 resultだけを採用している。

## 9. Explicit nonclaimsとlive unchanged

- production approved-record load / claim: **0 / 0**
- actual deployment-key open / key bytes read: **0 / 0 bytes**
- real dataset read / production training-row callback: **0 / 0**
- fixed synthetic in-memory row callback: **各gate exactly 1**
- actual checkpoint write / fsync / seal: **0 / 0 / 0**
- production connector 100 / 500 / 24,000 gates: **0 / 0 / 0**
- runner application network request / `child_process` launch / teacher label: **0 / 0 / 0**
- training run / optimizer step / candidate weight: **0 / 0 / 0**
- production weight overwrite / live activation: **0 / unchanged**
- match / Elo / rating / rank evidence: **0 / 0 / not established / not established**
- stable high-dan strength: **not established**
- production readiness: **not established**

synthetic fixture各1という実行数はproduction execution countではない。このoffline runnerと列挙したlocal検証はactual key、record、dataset、checkpointを開かず、teacher、training、match、weight activationを開始しない。未実行のremote CIについては、同じzero-operation結果をまだclaimしない。

## 10. Next safe step

1. revision `04f6dad7cd35737c9d7e9f67e85cb98afd418f43`へ固定したlocal evidenceをready PRでreview可能にし、review comment、required CI、regular mergeは観測後に別々に記録する。
2. sourceまたはtestを変更した場合は、影響するfocused / related checkとauthoritative full validationを再実行してから同じPASSをclaimする。
3. merge後もこのoffline変更によるproduction executionは0のまま保持する。
4. actual record / key / dataset I/Oとreal 100-parent gateは、別のoperational approvalとexecution recordを持つrunとして扱う。

現在到達したのは、**3つのfixed test-only compositionが4 / 4のfresh processで決定論的に一致し、観測したproduction I/Oが0で、列挙したlocal validationとindependent reviewがPASSしたこと**である。残る直近の到達点はready PR、required CI、regular mergeをそれぞれ実測・記録することであり、いずれも本稿では未claimである。それでも高段の達成ではなく、real 100-parent gateへ進む前のcontract boundaryである。
