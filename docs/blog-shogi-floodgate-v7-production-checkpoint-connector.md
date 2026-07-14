# production capabilityを一境界へ閉じる — Floodgate v7 checkpoint connector

> 前段の[single-use coordinator handoff](./blog-shogi-floodgate-v7-checkpoint-handoff.md)はexact production coordinatorからcheckpoint用operationを一度だけ投影し、[opaque key bridge](./blog-shogi-floodgate-v7-checkpoint-key-bridge.md)はfixed deployment rootを公開せずV3専用key capabilityをcheckpoint sinkへ渡せるようにした。しかし、active [stage lease](./blog-shogi-floodgate-teacher-stage-authorization.md)、[authenticated training rows](./blog-shogi-floodgate-training-row-consumer.md)、[consumer postflight](./blog-shogi-floodgate-consumer-postflight-capability.md)、[V3 milestone checkpoint](./blog-shogi-floodgate-v7-checkpoint-v3-milestones.md)を同じproduction ownershipへ閉じる入口はまだなかった。historical connector v1はそれらを合成し、最初にmetadata-only deployment-key readinessを検査した。現行v2はreadiness前に[approved enrollment](./blog-shogi-floodgate-v7-approved-key-enrollment-control-plane.md)を同期claimし、caller-supplied expected-ID authorityを除く。どちらもproduction gateの実行、teacher label、学習、weight、live評価関数、対局、棋力の結果ではない。English version: [blog-shogi-floodgate-v7-production-checkpoint-connector.en.md](./blog-shogi-floodgate-v7-production-checkpoint-connector.en.md)

---

## 1. historical v1境界とcurrent v2 delta

このconnectorは、新しい探索や評価関数を作るのではなく、既存のproduction capability ownerを1つのtrusted composition boundaryへ接続する。historical PR #456はv1を実装し、記録されたlocal validationを通し、重複2指摘を解決した後、regular merge commit `e543eb4`で統合された。それらの数値はhistorical v1 evidenceである。現行v2はapproved identityのmintをfixed approved-enrollment loaderとmodule-private single-use registryへ委譲し、connectorはexact 1回の同期claimだけを所有する。v2 deltaのfocused / related / stable full validation、production build、final independent reviewは完了し、ready PR #463のactionable review 3 / 3も修正・resolveした。CIとmergeはpendingである。どちらもproduction readyやreal run成功を確立しない。

| capability          | 既存owner                                             | connectorが行うこと                                                        | 現在の実行証拠                            |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------- |
| approved enrollment | fixed private loader + module-private claim registry  | readiness前にopaque capabilityを1回claimし、approved identityだけをcapture | temporary fixtureのみ、production claim 0 |
| key readiness       | fixed current-EUID metadata probe                     | engine / stage開始前に`ready`、`not-provisioned`、`unsafe`を判定           | metadata probeのみ                        |
| coordinator         | zero-argument production factory + single-use handoff | exact `runBinding`と`produce` / `abortAndDrain` / `close`を取得            | parent operation 0                        |
| stage               | production stage authorizer                           | active private leaseを取得しterminal cleanupまで所有                       | production lease 0                        |
| deployment key      | fixed authority + opaque V3 facade                    | exact run / stage / gate用facadeをprepareしkey instanceを照合              | key bytes read 0                          |
| training input      | production full-bundle verifier + pathless callback   | callbackへexact 24,000 training rowsを一度だけ渡す                         | real rows callback 0                      |
| checkpoint          | production V3 sink                                    | 100 / 500 / 24,000の1 gateを同じstream上で進める                           | gate execution 0                          |
| postflight          | production consumer postflight registry               | checkpoint settlement後のexact receiptを一度だけclaim                      | production postflight 0                   |
| combined receipt    | connector                                             | capability、rows、pathsを落としたmetadata projectionだけを返す             | connector success receipt 0               |

v1記事はPR #455 merge `4067beec`をbaseに書かれ、そのmain CIとproduction Vercelはhistorical contextだった。v1自体は後にPR #456 merge `e543eb4`で統合された。現行v2はready PR #463の別deltaであり、未確定のCI値をどちらの過去mergeからも推定しない。

## 2. readiness、execution、provisionを分離する

key namespaceを「見て準備状態を返すこと」、keyを「作ること」、key authorityで「実際に開いて使うこと」は別の権限である。

| boundary  | API / owner                                            | filesystem action                                              |         key bytes | authority                |
| --------- | ------------------------------------------------------ | -------------------------------------------------------------- | ----------------: | ------------------------ |
| readiness | `inspectFloodgateV7DeploymentKeyReadiness()`           | fixed current-user slotのmetadataだけを検査                    |                 0 | advisory only            |
| execution | `runFloodgateV7ProductionCheckpointConnector(options)` | stageとcheckpointを所有し、authorityがkeyを再open / revalidate | authority内部だけ | exact run / stage / gate |
| provision | connector外の明示承認工程                              | exclusive no-clobberでparent / keyを新規作成                   |    exact 32 bytes | connectorには未実装      |

readiness receiptは`authoritative_reopen_required: true`を固定する。`ready`は後続実行の許可tokenではなく、TOCTOUを閉じない。connectorはその後もopaque keyをprepareし、held descriptorsからkeyを読み直し、final metadata revalidationを通す。readinessと実行の間にkeyが削除・差替えされた場合、後段authorityがfail closedする。

実machineのread-only probeは`not-provisioned`で、fixed parentは`absent`、keyは`absent`、`key_bytes_read: false`だった。probeはdirectory / fileを作らず、connectorも`not-provisioned`から自動provisionしない。専用provisionerを追加する場合も別の明示承認段とし、current EUID、parent `0700`、key `0600`、regular file、link count 1、exact 32 random bytes、exclusive create、file / parent fsync、never overwriteを要求する。

readinessはkey instance IDを公開しない。connector v2はcaller-supplied `expectedKeyInstanceId`を受け取らず、[approved enrollment control plane](./blog-shogi-floodgate-v7-approved-key-enrollment-control-plane.md)が発行するopaque single-use capabilityを同期的にclaimする。そのclaimがreadiness前にexpected public IDとdeployment identityを固定する。provision receiptは意図的にinstance IDを持たず、connectorが実行時に見つけたinstanceを無条件に採用しない。

## 3. exact requestをI/O前にcaptureする

production entry pointはexact 1 argumentを受け、top-level requestは次の5 fieldsだけである。

| field                | contract                                                                    |
| -------------------- | --------------------------------------------------------------------------- |
| `runId`              | lowercase 32-byte hex                                                       |
| `gate`               | `durable-prefix-100`、`durable-prefix-500`、`sealed-final-24000`のexact 1つ |
| `keyEnrollment`      | fixed approved-enrollment loader由来のopaque single-use capability          |
| `stageAuthorization` | existing production stage authorization options                             |
| `consumer`           | existing pinned training-row consumer options                               |

connectorは`phase = capture`で、enrollmentとreadinessより前にProxy、accessor、symbol key、unknown / missing field、sparse `engineArgs`、NULを含む文字列をrejectし、fresh frozen projectionへcaptureする。stageとconsumerの`repositoryRoot`、`rawLockRoot`、`roleLockRoot`、legacy protected-ID pathをexact比較し、stage `roleBundleRoot`とconsumer `outputRoot`も一致させる。stage / destination basenameは`runId`から固定する。

requestがabsolute pathsを含むことと、public outputへpathを返すことは別である。stage / consumer ownerには既存contractどおりpathsを渡すが、combined receiptとpublic errorにはabsolute path、caller-selected path、stage root、destination rootを投影しない。

dependency-injected `CoreForTests`はexact 2 argumentsで、receiptの`execution_boundary`を`test-only-injected-capability-composition`へ固定する。さらに`test_boundary`をfresh frozen recordとして返し、`production_coordinator_origin`、`production_stage_origin`、`production_key_origin`、`production_input_origin`、`production_checkpoint_origin`をすべて`false`へ固定する。production receiptの`test_boundary`は`null`である。これによりinjected fixtureの成功をproduction-origin evidenceとして読めない。production entry pointはmodule-private fixed dependency tableだけを使い、callerからfilesystem、key bytes、signer、callback、runtime facadeを注入させない。

## 4. 1 invocationのcapability flow

exact request capture後、v2はopaque approved-enrollment capabilityを同期claimする。fake、consumed、wrong-origin capabilityはreadiness前、actual key authorityを開く前に`phase = enrollment`で失敗する。その後のreadinessが`ready`でなければ、connectorはcoordinator factoryもstage authorizerも開始しない。`ready`後だけcoordinatorとstageを並列に開始し、両方のsettlementを回収してから次へ進む。

```text
exact request capture
            |
            v
opaque approved-enrollment claim
            |
            v
metadata-only key readiness
            |
            v
coordinator factory || stage authorization
            |              |
            +-- all settled+
                    |
                    v
       exact coordinator handoff
                    |
                    v
        opaque gate-key prepare
                    |
                    v
 approved key instance + deployment identity match
                    |
                    v
 full label-free bundle verification
                    |
                    v
 training callback synchronous entry
                    |
                    v
  V3 sink claims lease + rows + key
                    |
                    v
 checkpoint settles -> callback Promise fulfills undefined
                    |
                    v
 consumer postflight + exact claim
                    |
                    v
 key discard/no-op -> lease close || coordinator close/abort
                    |
                    v
       all terminal cleanup settled
                    |
                    v
       metadata-only combined receipt
```

callbackはreceived rowsをmodule stateやpublic objectへ保存せず、consumer ownerのcall window内にある最初の同期entryでV3 sinkへ渡す。0回、2回以上、window終了後の呼出しはfail closedする。sinkはstage、rows、derived keyをmatching production registryからclaimし、connector-owned callback Promiseはcheckpoint settlementとreceipt validationをjoinした後だけexact `undefined`でfulfillする。consumer ownerがcallback後に早くresolve / rejectしても、connectorは外側でも同じcallback Promiseを再joinし、sink settlement前にkey discard、lease close、coordinator close / abortへ進まない。checkpoint receiptをcallback fulfillment valueとしてconsumerへ流さない。

## 5. run、stage、key、24,000 rowsを同じbindingへ閉じる

connectorはstructurally similarなmetadataを組み合わせるのではなく、既存ownerから得たexact valuesを同じrequestへ通す。

| binding           | source                        | connector check / use                                                                                                     |
| ----------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| run ID            | captured request              | stage basename、HKDF salt、checkpoint headerを同じ値へ固定                                                                |
| gate              | captured request              | key facadeとV3 sinkの100 / 500 / 24,000 requestを一致                                                                     |
| key ID            | module fixed constant         | caller-selected key IDを受けない                                                                                          |
| key enrollment    | claimed approved capability   | readiness前にpublic instance ID、owner UID、parent/key device+inodeを固定                                                 |
| key instance      | authoritative prepare receipt | claimed approved identityとexact比較する。secretのconstant-time比較ではなくpublic metadata比較                            |
| run binding       | exact coordinator handoff     | fixed plan bytes / SHA-256、producer control contract、stable / teacher runtime receipt digestsを検証してcheckpointへ渡す |
| stage binding     | active lease receipt          | key authorizationとcheckpointのsame private stage identityを固定                                                          |
| input binding     | consumer postflight           | manifest / raw bytes、24,000 parent / 1,000 game、ID digestsをmetadata projectionへ固定                                   |
| checkpoint result | V3 sink receipt               | path / MACを落とし、gate、sealed state、record / byte count、SHA-256、durabilityだけを投影                                |

100 gateと500 gateにも別の100-row / 500-row datasetを渡さず、同じauthenticated 24,000-row input全体を渡す。gateが制限するのはdurable completed prefixであり、training input identityではない。valid transitionは100 → 500 → 24,000で、後段gateは同じwork streamをresumeする。

`key_instance_id`はkey bytesやSHA-256ではなく、authorityが別domainで作るpseudonymous deployment-instance identifierである。receipt比較に必要なのでcombined receiptへ残すが、authorization MAC、root key、V3 derived key、そのhashは返さない。

owner receiptはshapeが似ているだけでは採用しない。coordinator run bindingではschema、module-fixed plan bytes / SHA-256、producer-control schema、deadline、abort drain、fixed max-in-flight / cancel / late-settlement policy、runtime receipt digestsをdata descriptorから検査する。postflightではschema、claim / execution boundary、training role、callback settlement、filesystem再検証、descriptor close、verifier revisionに加え、`raw_format`をexact `shogi-floodgate-label-free-raw-parent-jsonl-v1`へ固定する。checkpointではrequestの`run_id` / `key_id` / `gate`、gate contract、statusとsealedの対応、24,000 training parents、target / completed parents、durabilityを照合してからfresh projectionを作る。

## 6. ownership transfer matrix

resourceを「変数が見えるか」ではなく、「誰がterminal cleanupを行うか」で追う。

| phase                           | connector ownership                                              | sink / consumer ownership                                  | terminal action                                                        |
| ------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------- |
| capture / readiness             | none                                                             | none                                                       | fixed public failureだけを返す                                         |
| coordinator + stage startup     | fulfilled coordinatorとlease                                     | none                                                       | safe pin可能なinvalid Promiseをsettleまで観測し、取得resourceをcleanup |
| handoff                         | exact handoff lifecycle                                          | none                                                       | successは`close`、failureは`abortAndDrain`                             |
| key prepared                    | unclaimed opaque facade                                          | none                                                       | sink未到達なら`discard`                                                |
| consumer callback entry         | rows referenceを保持しない                                       | consumerがinput claim windowとdescriptorsを所有            | callbackはsinkを同期呼出し                                             |
| sink stage-claim failure        | lease ownershipはconnectorに残る                                 | sinkはprepared keyをdiscard                                | connectorがlease closeを完了                                           |
| sink stage-claim success        | close Promiseのjoinだけを行う                                    | sinkがlease / rows / keyをclaimしzeroize / close           | sink success / failureの両方でcleanup                                  |
| checkpoint + postflight success | checkpoint / postflight metadataだけ                             | consumerがsnapshot再検証とdescriptor close後にreceipt mint | connectorがpostflightをexactly once claim                              |
| final cleanup                   | unclaimed key no-op discard、lease close join、handoff lifecycle | none                                                       | lease / coordinator cleanupを両方startしてからall-settled join         |

`discardKey`はsinkが既にclaimしたcapabilityにはsafe no-opであり、未claimならstored derived keyをzeroizeする。`lease.close()`はsinkが開始したcloseと同じPromiseへjoinする。成功時はcoordinator `close()`、どこかにprimary / cleanup failureがあれば`abortAndDrain()`を選ぶ。key discardの後、lease closeとcoordinator close / abortを一方ずつawaitせず両方startし、all-settled joinで両結果を回収する。一方がhang / rejectしても、もう一方のterminal action開始を妨げない。

## 7. failureとall-settled cleanup

public errorはraw causeを返さず、operation phase、readiness status、checkpoint persistence可能性、cleanup failure count、retry dispositionだけを持つ。

| phase / case                             | parent search / checkpoint      | cleanup                                                 | public disposition                                  |
| ---------------------------------------- | ------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `capture` failure                        | 0 / 0                           | resourceなし、capability未claim                         | `fresh-invocation-required`                         |
| `enrollment` claim / origin failure      | 0 / 0                           | runtime resourceなし、actual key authority未open        | `fresh-invocation-required`                         |
| `readiness`: `not-provisioned`           | 0 / 0                           | resourceなし                                            | `provision-required`                                |
| `readiness`: `unsafe`                    | 0 / 0                           | resourceなし                                            | `operator-reconciliation-required`                  |
| `coordinator-stage` failure              | parent search 0                 | fulfilled / late-captured側をclose / abort              | 常に`operator-reconciliation-required`              |
| `handoff` failure                        | checkpoint 0                    | lease close + coordinator abort                         | cleanup成功なら`fresh-invocation-required`          |
| `key-prepare` failure                    | consumer / checkpoint 0         | 取得済みkeyのdiscard + lease close + coordinator abort  | private detailを出さずoperator reconciliation       |
| `key-instance` actual-authority mismatch | consumer / checkpoint 0         | key discard + lease close + coordinator abort           | mismatch内容を出さずoperator reconciliation         |
| `consumer` failure before sink           | checkpoint 0                    | key discard + lease close + coordinator abort           | cleanup成功なら`fresh-invocation-required`          |
| `checkpoint` failure                     | success receipt 0               | sink cleanup + connector close join + coordinator abort | persisted可能性でfresh / reconciliationを分岐       |
| `postflight` failure                     | checkpointがpersist済みの可能性 | key / lease / coordinatorを全てsettle                   | `checkpoint-reconciliation-required`になり得る      |
| `cleanup` failure                        | success receipt 0               | remaining terminalを全部試す                            | countだけを出しoperator / checkpoint reconciliation |
| `receipt` projection failure             | public success receipt 0        | key / lease / coordinatorはsettle済み                   | checkpoint reconciliation                           |

test coreだけは`observeFailureForTests`へraw primary / cleanup failuresを渡せる。これはfault-injection assertion用であり、production dependency tableでは`undefined`に固定する。production public errorには`cause`、`primary`、cleanup Error、path、row、key materialを含めない。

connectorとtraining consumerは同じsafe native-Promise境界を使う。各内部Promiseのown `constructor`を、`Symbol.species`だけがcaptured native `Promise`を指すfrozen null-prototype holderへ固定し、own frozen `then`はcaptured `Promise.prototype.then`へ委譲する。そこから作られるPromiseも再帰的にpinするため、callerによるconstructor / species / then差替えを後続awaitやcleanupへ持ち込まない。

shapeが不正でも、own constructorをgetter / Proxy trapなしでsafe pinできるgenuine native Promiseなら、public operationはfail closedのままcaptured native `then`でsettlementまで観測する。coordinator、stage lease、key authorizationがfulfillした場合は、その値をsuccess evidenceには使わずterminal cleanup専用にcaptureし、coordinator abort / close、lease close、key discardを実行する。non-configurable unsafe constructorなどsafe pin不能なshapeはgetter / trapを実行せず即rejectし、隠されたresourceを回収できるとは主張しない。

## 8. public surfaceの漏洩を4面で閉じる

「secretをfield名に入れなかった」だけでは足りない。success、failure、callback、source importの4面を別々に閉じる。

| surface           | allowed                                                                                                           | forbidden                                                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| success receipt   | fixed metadata、counts、digests、gate、key instance ID、lifecycle booleans                                        | Buffer / Uint8Array、key / MAC、rows / SFEN / move、absolute / caller path、facade、function                                  |
| public error      | fixed phase / status / boolean / count / retry enum                                                               | raw cause / primary、cleanup Error、private message、path、row、key                                                           |
| consumer callback | exact rowsをproduction V3 sinkへ同期entryで渡す                                                                   | caller callback、module-level retention、rowsをreturn / serialize                                                             |
| imports           | approved-enrollment claim、readiness、coordinator、stage、authority prepare/discard、consumer/postflight、V3 sink | `node:fs` / `node:path`、approved-record writer、derived-key claim、raw-root test core、provisioner、selection / holdout APIs |

ownerから返るreadiness、coordinator handoff / run binding、stage lease、key metadata、postflight、checkpoint metadataも、そのままpublic receiptへ渡さない。各境界でProxyとaccessor / symbol keyをrejectし、own enumerable data descriptorsだけをbounded captureする。必要なstring、safe integer、boolean、canonical hex、fixed contract valueを検証してfresh recordへ投影するため、metadata getterを実行せず、path / function / row canaryをblind copyしない。

combined receiptはfresh null-prototype recordsから構築し、nested recordも含めてfreezeする。top-level projectionは次である。

```text
contract / status / claim_boundary / trust_boundary / execution_boundary / test_boundary
run_id / gate / key_id / key_instance_id
approved_key_enrollment
run_binding / input_binding / checkpoint
lifecycle / holdout_boundary / nonclaims
```

`approved_key_enrollment`はfixed claim boundary、claim execution boundary、record bytes / SHA metadata、candidate-receipt bytes / SHA metadata、approval metadata、approved deployment identityを投影し、capabilityやkey materialを含まない。productionでは`test_boundary: null`、test coreでは5つのproduction origin flagがすべて`false`である。checkpoint original receiptのstage basename、work filename、milestone MAC、authorization MACはcopyしない。postflight original receiptもexact runtime authorityとして返さず、input bindingだけをcopyする。production connector source自身はfilesystemをimportせず、approved enrollment、readiness、stage、consumerの既存capability APIへdelegateする。

## 9. labeled holdout未読とlabel-free role verificationを区別する

connector callbackが受けるroleは`training`だけで、rowsはexact 24,000 parentsである。しかしproduction training consumerはcomplete label-free role bundle verifierを使う。したがって、selection / finalについて言えることを次のように分ける。

| claim                                                       |      value | meaning                                                                           |
| ----------------------------------------------------------- | ---------: | --------------------------------------------------------------------------------- |
| callback role                                               | `training` | selection / final rowsをcallbackへ渡さない                                        |
| callback parents                                            |     24,000 | full training inputだけをV3 sinkへ渡す                                            |
| labeled selection read                                      |    `false` | model-selection labelを開かない                                                   |
| labeled final holdout read                                  |    `false` | sealed final labelを開かない                                                      |
| label-free selection / final role artifacts may be verified |     `true` | complete bundle integrity verificationではraw role artifact bytesを読む場合がある |

このため「labeled / sealed holdoutへアクセスしていない」は正しいが、「final-role file bytesを一切読んでいない」は正しくない。strict zero-readが必要なら、complete bundle verifierとは別にauthenticated training-only projection / verifierを設計し、open/read instrumentationで証明する必要がある。

100 / 500 / 24,000 gateはteacher-data throughput、resume、durabilityのgateであり、selection scoreや棋力gateではない。training完了後もseed 42 / 43 / 44、QAT、fresh selection、fresh / legacy final、known regression、production parity、formal A/Bが別段に残る。

## 10. historical v1 evidenceとcurrent v2 local validation

確定値と未実行値を混ぜない。最初の表はPR #456時点のhistorical v1状態であり、そのscope内の「current」は現行v2を意味しない。

| validation layer              | revision / scope                      | status    | result                                           |
| ----------------------------- | ------------------------------------- | --------- | ------------------------------------------------ |
| readiness focused             | historical v1 readiness / local macOS | `PASS`    | 6 / 6、約`0.17 s`                                |
| training consumer focused     | historical v1 native-Promise consumer | `PASS`    | 61 / 61                                          |
| connector focused             | historical v1 connector               | `PASS`    | 57 / 57                                          |
| TypeScript                    | historical PR #456 branch             | `PASS`    | `tsc --noEmit`                                   |
| scoped ESLint                 | historical PR #456 branch             | `PASS`    | connector / consumer / readiness scope           |
| JA / EN Prettier + diff-check | these two articles                    | `PASS`    | format / whitespace / structure checked          |
| full Vitest                   | current connector branch              | `PASS`    | 117 files、2,119 / 2,119、`154.99 s`             |
| PR review                     | PR #456                               | `PASS`    | 重複2 threadsを`05c1c25`で修正・返信・解決       |
| branch required CI            | post-review documentation head        | `pending` | documentation fix後のheadを未検証                |
| base main CI                  | PR #455 merge `4067beec`              | `green`   | connector codeを含まないhistorical base evidence |
| production Vercel             | current main deployment               | `green`   | live weight / connector activationは変更なし     |

readiness suiteはmissing parent / key、safe empty parent、wrong size、wrong mode、symlink、hard link、metadata-only ready、Proxy trap 0、argumentless production probeを検査する。ready fixtureのkey bytesはtest前後で一致し、receiptへhome pathやkey hexを出さない。

connector focused 57 / 57はexact composition、metadata capture、Promise pin / invalid settlement、callback join、parallel cleanup、retry disposition、receipt leak boundaryを検査する。training consumer focused 61 / 61もconstructor / species / then pinとcallback identity revocationを含む。これらはfocused regression evidenceであり、real production gateや棋力evidenceではない。

historical v1 full regressionは117 files・2,119 / 2,119で通過し、PR #456の重複2 threadsも解決された。記事作成時点のpost-review branch-CI fieldはpendingだったが、v1は後に`e543eb4`としてmergeされた。これらをcurrent v2 validationやproduction execution evidenceへ読み替えない。

| current v2 delta               | status             | evidence / measured result                                                               |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| approved-enrollment focused    | 21 / 21 PASS       | canonical bytes/SHA、BOM reject / reorder / oversize / TOCTOU / poison、single-use claim |
| connector-focused integration  | 111 / 111 PASS     | capability-only request、UID / byte bounds、identity / layout / algorithm、gate bounds   |
| combined focused               | 132 / 132 PASS     | 2 files、duration `0.736 s`、real `1.073 s`                                              |
| related regression             | 335 / 335 PASS     | 10 files、duration `146.22 s`、real `147.12 s`                                           |
| stable full Vitest             | 2,245 / 2,245 PASS | 122 / 122 files、6 workers、duration `150.69 s`                                          |
| Python stdlib                  | 58 / 58 PASS       | Node 22.13 runtime path、suite `0.106 s`                                                 |
| TypeScript                     | PASS               | revision `599385e6`、real `14.517 s`                                                     |
| scoped ESLint / format         | PASS               | revision `599385e6`、scoped lint real `1.739 s`、targeted format / diff-check PASS       |
| full lint / npm audit          | PASS / 0           | earlier capture: errors 0、warnings 157、real `29.82 s` / vulnerabilities 0              |
| production Turbopack build     | PASS               | earlier capture: real `29.30 s`、compile `8.4 s`、TS `18.3 s`、193 / 193（13 workers）   |
| final independent review       | P0/P1/P2 = 0       | 初回2 P1とfollow-on P2を修正後にseal                                                     |
| ready PR / required CI / merge | #463 / pending     | actionable threads 3 / 3 resolved、checksとmergeは未完了                                 |

direct related 10 files / 335 testsのtimed runはrevision `a3d16f7880f567ec1f825eba6563ca297cd8f619`でcaptureした。identity validatorの表現を明確化したrevision `599385e6bd194a71c0382fafe07fa3700d0fc893`ではfocused、TypeScript、scoped ESLint、targeted format / diff-checkを再実行し、同じ10 filesを含むfinal 122-file full suiteが2,245 / 2,245 PASSした。related timingは旧capture、current revisionの全体合否はfinal full runへ結び付く。build、full lint、auditの表中の値はsuccessfulな旧captureであり、599 revisionで再実行した値ではない。

current revisionのfinal 6-worker full runはcommand real `151.20 s`、maximum RSS 4,228,874,240 bytesで122 / 122 files、2,245 / 2,245 PASSした。その前の8-worker attemptは、WASM worker initializationが30秒以内に完了せず121 / 122 files、2,244 / 2,245 testsとなった（duration `150.44 s`、real `151.10 s`、maximum RSS 4,064,821,248 bytes）。同じ53-test fileは直後の単独実行で53 / 53 PASSした（duration `14.10 s`、real `14.63 s`、maximum RSS 347,815,936 bytes）。この単独成功はtransientなworker-start contentionと整合する診断値だが、8-worker full attemptをPASSへ変えず、timeout原因を確定もしない。後続の6-worker full PASSだけをcurrent revisionのauthoritative local full resultとする。

これとは別に、以前のmaximum-parallel full attemptもUSI transcript timeoutで121 / 122 files、2,244 / 2,245 testsとなり、同じfileは直後に43 / 43 PASSした。この旧USI transientと今回のWASM initialization timeoutは別attemptとしてmachine-readable evidenceに残し、同じaggregate countだけを見て同一failureとは扱わない。checkpoint trailing lineの自動破棄表示はexpected cleanup diagnosticであり、test failureには数えない。これらはすべてsource / temporary-fixture evidenceであり、actual approved record、production connector gate、teacher、training、weight、棋力の実行結果ではない。

## 11. production execution 0とlive unchanged

実machineではfixed keyが未配備なので、production connectorを実行していない。readiness probe以外のlive stateは変えていない。

| item                                         | current value                 |
| -------------------------------------------- | ----------------------------- |
| fixed deployment parent / key                | `absent` / `absent`           |
| readiness status / key bytes read            | `not-provisioned` / 0 bytes   |
| provision attempts                           | 0                             |
| production gate executions                   | 100: 0、500: 0、24,000: 0     |
| real Floodgate dataset read by connector     | 0 games / 0 parents / 0 bytes |
| real stable / teacher search                 | 0 parents                     |
| teacher labels / teacher JSONL               | 0 / 0 bytes                   |
| checkpoint entries / milestone / seal        | 0 / 0 / 0                     |
| optimizer steps / model checkpoints          | 0 / 0                         |
| candidate weight generation                  | 0 bytes                       |
| production weight overwrite                  | 0 bytes                       |
| live evaluation-function / weight activation | unchanged                     |
| matches / Elo / rating / rank evidence       | 0                             |

historical connector v1はPR #456 merge `e543eb4`で統合された。現行v2 source、local validation、ready PR #463、resolved review 3 / 3は、pendingのCI / merge workが完了したことを示さない。source mergeやgreen application deploymentのどちらも、production connector、real dataset、teacher engine、学習、weight activationを実行した証拠ではない。

したがって、この変更から「評価関数が強くなった」「退行しなかった」「高段で安定した」とは言えない。live weightは同じbytesのままである。

## 12. 12-worker ETAと次の承認gate

次の時間はconnectorのreal Floodgate run実測ではない。以前のreal WCSC36 depth-16 teacher evidenceを24,000 parentsへ線形換算したraw lower estimateと、stable proposal、追加candidate rescore、startup、checkpoint fsync、短いvariance marginを見込むoperational budgetである。

| gate              | new parents at this invocation | prior raw lower estimate | planning-only operational budget |
| ----------------- | -----------------------------: | -----------------------: | -------------------------------: |
| 100               |                            100 |               `00:02:52` |                 about `00:03:30` |
| 500 cumulative    |                            400 |               `00:14:20` |                 about `00:17:30` |
| 24,000 cumulative |                         23,500 |                `11.47 h` |                     about `14 h` |

raw `11.47 h`はstable proposerとstable moveがunionへ追加された場合の追加rescoreを含まないlower estimateである。operational `14 h`も予約枠であってSLAや実測throughputではない。timeout、mate、candidate count、resume量で変わる。

100 / 500 / 24,000は同じwork streamをresumeするため、24,600 parentsを別々に生成する計画ではない。100で新規100、500で追加400、finalで追加23,500を処理する。最初の100-parent pilotでparents/hour、candidate count、timeout、score / mate distribution、resume、残留process、work bytesを測り、500と24,000のETAを更新する。

次の実行順序は次である。

1. current v2の完了したlocal validationとready PR #463の解決済みreview 3 / 3を保持し、required CI、regular mergeを完了する
2. separate explicit operational approvalの下でfixed keyをprovision / inspectし、candidateを別reviewしてapproved recordをcreate-only installする
3. fresh opaque capabilityをload / claimし、read-only readinessが`ready`であることを確認する
4. holdoutを開かず100-parent gateを実行し、enrollment projection、途中receipt、cleanupを監査する
5. ユーザー承認後だけ500へ進み、実測ETAを再計算する
6. もう一度承認後だけ24,000 sealへ進む
7. その後に初めて3-seed学習、selection / final、回帰、production parity、formal A/Bを別gateで行う

mergeやreadinessだけでreal runを自動開始しない。各gateの間に人の確認を残し、production weightとlive activationは全後段gateを通るまで変更しない。
