# candidate bytesをapproved capabilityへ閉じる — Floodgate v7 key enrollment control plane

> [deployment-key instance inspector](./blog-shogi-floodgate-v7-deployment-key-instance-enrollment.md)は、fixed keyを短時間だけ読み、non-secretな`key_instance_id`を含むcandidate receiptを返す。しかしcandidate観測は承認ではない。本変更は、exact candidate bytesとSHA-256へbindingしたfixed private approved recordを読み、公開IDをown propertyに持たないopaque single-use capabilityをmintするsource境界を追加する。[production checkpoint connector](./blog-shogi-floodgate-v7-production-checkpoint-connector.md)もv2へ更新し、public optionsからcaller-supplied `expectedKeyInstanceId`を除き、approved capabilityだけを同期claimする。focused validationは**132 / 132 PASS**、related regressionは**335 / 335 PASS**、stable full regressionは**2,245 / 2,245 PASS**で、production buildとfinal independent reviewも完了した。PR、CI、mergeはpendingである。actual keyのprovision / inspection、record approval / installation / load、connector、teacher、training、weight、live activation、対局、棋力のexecution evidenceはすべて0のままである。English version: [blog-shogi-floodgate-v7-approved-key-enrollment-control-plane.en.md](./blog-shogi-floodgate-v7-approved-key-enrollment-control-plane.en.md)

## 1. 現在地

| 項目                                      | current status                | 意味                                                            |
| ----------------------------------------- | ----------------------------- | --------------------------------------------------------------- |
| approved-enrollment module source         | implemented / source-reviewed | exported contract、loader、factory、claim APIをreviewで固定     |
| canonical candidate bytes / SHA binding   | locally validated             | exact JSONL bytes、byte count、SHA-256、deploymentを照合する    |
| fixed private production loader           | implemented / source-reviewed | zero-argument production identity / originのactual executionは0 |
| shared fixed-record reader                | fixture-validated             | injected test loaderでfixed path / metadata / held readを検証   |
| temporary-home loader / synthetic factory | locally validated             | production homeを読むtest shortcutを分離する                    |
| opaque single-use capability              | locally validated             | public IDはcapability own fieldではなくprivate claimに置く      |
| connector v2 integration                  | locally validated             | public optionはapproved capabilityだけを受ける                  |
| operator preflight source                 | implemented / source-checked  | argumentless metadata-only load / claim、actual executionは0    |
| focused validation                        | 132 / 132 PASS                | enrollment 21、connector integration 111                        |
| related / stable full validation          | PASS                          | 10 files / 335、122 files / 2,245                               |
| local build / static validation           | PASS                          | production build、TypeScript、lint、format、audit               |
| independent security review               | P0 / P1 / P2 = 0 / 0 / 0      | 初回2 P1とfollow-on P2を修正後にfinal seal                      |
| PR review / CI / merge                    | pending                       | 未作成・未実行をPASSとして扱わない                              |
| real provision / inspection / enrollment  | 0 / 0 / 0                     | actual key byteもapproved recordも扱っていない                  |
| 100 / 500 / 24,000 connector gates        | 0 / 0 / 0                     | real connector / teacher executionはない                        |
| training / weight / live / strength claim | 0 / 0 / 0 / 0                 | production evaluation bytesは変更しない                         |

このchangeのcompletion conditionは、temporary fixturesでcandidate → approved record → opaque capability → exact connector claim / authority comparisonを検証することである。actual-home key、実approved record、real connectorを動かすことではない。

## 2. Exact record contractとcanonical candidate binding

sourceが固定するrecord contractは次である。

```text
contract       = shogi-floodgate-v7-approved-key-enrollment-control-plane-record-v1
status         = separately-reviewed-candidate-approved-and-pinned
approval.method= separate-human-review-and-fixed-private-record-persistence-v1
claim_boundary = canonical-candidate-bytes-digest-fixed-deployment-identity-and-public-instance-pinned-in-private-current-euid-record-no-key-material-signature-run-gate-checkpoint-runtime-training-live-or-strength-authority
trust_boundary = trusted-separate-review-fixed-current-euid-private-0700-control-plane-parent-0600-record-and-current-js-realm-intrinsics-without-cryptographic-approval-signature-v1
```

`FloodgateV7ApprovedKeyEnrollmentRecord`は、exact top-level keys `contract`、`status`、`claim_boundary`、`trust_boundary`、`approval`、`key_deployment`、`nonclaims`だけを受け入れる。`approval`は、64 lowercase hexの`approval_id`、millisecond付きexact UTC timestamp、上のmethod、candidate envelopeを持つ。これはseparate human reviewが行われたと宣言するprivate recordであり、cryptographic approval signature / MACではない。

candidate envelopeは次の3つを一緒に固定する。

- `canonical_json`: candidate inspector receiptのexact 1-record JSONL string
- `bytes`: UTF-8 byte count
- `sha256`: `canonical_json` UTF-8 bytesの64 lowercase hex SHA-256

loaderはcandidate内のcontract / status / claim / trust / algorithm / execution boundary / test boundary / nonclaimsを再検証する。さらにfixed `key_id`、public `key_instance_id`、owner UID、parent / key device・inode、mode、size、link count、held-descriptor revalidationを読み、approved record側の`key_deployment`とcanonical valueで一致させる。

record自身も`JSON.stringify(capturedRecord) + "\n"`とexact一致する1 LF JSONLでなければならない。別key order、unknown / duplicate key、accessor / Proxy、別escape、noncanonical number、CRLF、candidate byte count / SHA mismatch、candidateとrecordのdeployment mismatchをrepairしない。candidate inspectorも本moduleもactual candidateをapproveまたはinstallしない。

## 3. Fixed private production loader

production entry pointはzero-argumentの`loadFloodgateV7ApprovedKeyEnrollment()`である。callerからhome、record path、candidate bytes、expected ID、approval flag、filesystem callbackを受けない。current effective UIDと`os.userInfo()`から、次のfixed slotだけを導出する。

```text
<userinfo home>/Library/Application Support/nextjs-portfolio/
  shogi-floodgate-v7-control-plane-v1/approved-key-instance.json
maximum record bytes = 65,536
```

production pathは次をfail closedにする。

1. POSIX effective UID、`os.userInfo().uid`との一致、nonnegative UID、canonical absolute homeを確認する。
2. fixed parent / recordのnamed metadataとrealpathを確認する。
3. current-EUID owner、exact `0700` directory、exact `0600` regular file、`nlink = 1`、size 2..65,536 bytesを要求する。
4. parentを`O_DIRECTORY | O_NOFOLLOW`、recordを`O_NOFOLLOW`で開き、named / held device・inode・metadataを一致させる。
5. statで固定したexact sizeのfull bufferへcaptured `readvSync`で1回だけ読む。short readはfail closedにし、その後の1-byte growth probeでEOFを要求する。
6. final named / held identityとmetadataを再検証してからrecord bytesをcaptureする。
7. record / parent descriptorの両方がcloseできた場合だけcapabilityをcallerへ返す。

loaderはdeployment key fileを開かず、key bytesを読まない。successが意味するのは、このprocessがfixed approved recordを読み、そのrecordに書かれたcandidate bindingを検証したことだけである。actual key continuity、現実のapproval手続、connector successは証明しない。

sourceは`TextDecoder("utf-8", { fatal: true, ignoreBOM: true })`でrecord bytesをdecodeし、malformed UTF-8をJSON parse前に拒否する。その後にLF / CR、exact parsed shape、canonical string equalityを確認する。malformed sequence、leading BOM rejection、reordered outer record、oversized record rejectionのadversarial testはすべて**PASS**した。

argumentless operator preflightは`npm run --silent shogi:floodgate-v7-key-enrollment-preflight`である。`loadFloodgateV7ApprovedKeyEnrollment()`のcapabilityを直ちにproduction claimし、key materialを含まないclaim JSONLだけをstdoutへ出す。argument、load、claim、stdoutのどれかが失敗すればfixed stderr messageとnonzero exitにする。このcommandはsourceへ追加されたが、actual fixed recordに対するexecutionは**0**である。

## 4. Opaque single-use capabilityとclaim

`FloodgateV7ApprovedKeyEnrollmentCapability`のpublic own fieldsは次の4つだけで、null-prototypeかつfrozenである。

```text
contract           = shogi-floodgate-v7-approved-key-enrollment-capability-v1
status             = opaque-single-use-approved-key-enrollment-not-claimed
claim_boundary     = <recordと同じfixed claim boundary>
execution_boundary = production...record または test-only...record
```

capability自体は`key_instance_id`、candidate / record bytes、path、descriptor、function、Buffer / `Uint8Array`を持たない。実bindingはmodule-private `WeakMap`へexact object identityをkeyとして保存する。source上はproduction用とtest用の2つのmapではなく、**1つのmapにexact execution boundaryを付ける実装**である。

- `claimFloodgateV7ApprovedKeyEnrollment(capability)`はproduction boundaryだけを受ける。
- `claimFloodgateV7ApprovedKeyEnrollmentCoreForTests(capability)`はtest boundaryだけを受ける。
- fake、clone、Proxy、same-shaped objectはclaimできない。
- 正しいAPIとboundaryが一致したclaimはmap entryをdeleteしてからfrozen claimを1回返す。2回目は失敗する。
- wrong production / test APIはboundary checkで拒否し、entryをdeleteしない。したがって正しいAPIでの後続claimは可能である。

claim resultはrecord bytes / SHA、candidate bytes / SHA、approval metadata、fixed `key_id`、public `key_instance_id`、owner UIDとdeployment device / inodeを含む。つまりpublic IDはcapabilityから永久に隠れるのではなく、exact successful claim後に初めて返る。connector v2はこのclaimを同期消費し、返ったbindingを同じinvocationのactual key authorityと比較する。

## 5. Temporary-home test boundary

filesystem test loaderは`loadFloodgateV7ApprovedKeyEnrollmentCoreForTests({ effectiveUserId, homeDirectory })`である。recordを開く前に、current effective UID、production `userInfo` UID、production homeとのstring equality、realpath equality、device / inode equalityを検査し、actual home aliasを拒否する。fixed relative components、owner / mode / type、held readはproduction loaderと共有するが、candidateにはexact test-only execution / test boundaryを要求する。

`createFloodgateV7ApprovedKeyEnrollmentCapabilityCoreForTests(record)`はfilesystemを読まないsynthetic factoryである。test-boundary candidateを含むexact recordだけをcaptureし、test claimだけが通るcapabilityをmintする。これはproduction origin、actual approval、actual key continuityを主張しない。

unit test、TypeScript、lint、build、PR、CI、module importはactual key provision / inspection、approved record installation / production load、connector / checkpoint / runtime / teacher executionを行わない。

## 6. Connector integration boundary

connector contractは`shogi-floodgate-v7-production-checkpoint-connector-v2`へ更新された。public `FloodgateV7ProductionCheckpointConnectorOptions`のexact keysは`runId`、`gate`、`keyEnrollment`、`stageAuthorization`、`consumer`であり、caller-supplied `expectedKeyInstanceId`はない。

production entryはasync work開始前に`claimFloodgateV7ApprovedKeyEnrollment(request.keyEnrollment)`、test coreはtest claim APIを同期実行する。successful claimのpublic IDをinternal expected valueに変換し、actual key authorityをopenした後、次をすべてexact比較する。

- `key_instance_id`
- owner UID
- parent device / inode
- key device / inode

mismatched claim origin、fake / consumed capability、wrong production / test claim APIは、actual key authorityを開く前にconnector `phase = enrollment`でfail closedになる。これらはkey-instance mismatchではない。claim成功後にactual authorityが返したpublic ID、owner UID、parent / key device・inodeのどれかがapproved deployment identityと異なる場合は`phase = key-instance`になる。capabilityはconnector開始時に一度消費されるため、その後のreadiness / key / checkpoint failureはfresh invocationとfresh capabilityを必要とする。connector v2はgate receiptのfixed status / sealed / target / completed / records、resumed-parent range、maximum total bytesもcaptureする。

connector-focused integrationは**111 / 111 PASS**である。related / stable full regression、production build、final independent reviewもPASSした。PR、CI、mergeはまだpendingであり、local synthetic evidenceだけからconnector-ready、production-ready、gate-readyとは書かない。

## 7. Failureとretry

| failure                                             | capability / claim    | exact behavior                     |
| --------------------------------------------------- | --------------------- | ---------------------------------- |
| production identity / argument capture failure      | mintしない            | `phase = capture`                  |
| test homeがactual homeをalias                       | mintしない            | `phase = test-boundary`            |
| record absent / unsafe / changed / close failure    | callerへ返さない      | `phase = record-read`              |
| malformed / noncanonical record                     | callerへ返さない      | `phase = record-validation`        |
| synthetic factoryのinvalid record                   | mintしない            | `phase = record-validation`        |
| candidate bytes / count / SHA / deployment mismatch | mintしない            | recordをrepair / auto-enrollしない |
| fake / clone / Proxy                                | claimしない           | `phase = claim`                    |
| wrong production / test claim API                   | reject / not consumed | 正しいAPIでretryできる             |
| 1回successful claimした同じcapability               | reject / consumed     | capabilityを復活させない           |

全public errorは`capability_issued: false`を持つ。recordの再readは過去capabilityを復活させず、新しいloader invocationと新しいexact capabilityを作る。rotation、revocation、recoveryは別のexplicit operator workflowである。

## 8. Validation status — local validation / review完了、PR / CI / mergeはpending

| validation                             | status             | evidence / measured result                                                                |
| -------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| focused approved-enrollment tests      | 21 / 21 PASS       | exact record、canonical bytes/SHA、load、single-use claim                                 |
| adversarial record / filesystem tests  | PASS               | malformed UTF-8、BOM reject、reorder、>64 KiB、alias、ancestor swap、replacement / growth |
| intrinsic-poison boundary tests        | PASS               | Promise / iterator / number / crypto / typed-array poison下でもlive access 0              |
| connector-focused integration tests    | 111 / 111 PASS     | capability-only options、UID 0 / byte bounds、identity / layout / algorithm、gate bounds  |
| combined focused                       | 132 / 132 PASS     | 2 files、`0.664 s`                                                                        |
| related regression                     | 335 / 335 PASS     | 10 files、`143.37 s`                                                                      |
| stable full Vitest                     | 2,245 / 2,245 PASS | 122 / 122 files、8 workers、duration `152.80 s`                                           |
| Python stdlib                          | 58 / 58 PASS       | Node 22.13 runtime pathで再確認、suite `0.106 s`                                          |
| TypeScript / scoped ESLint / Prettier  | PASS               | exact current source / test / document delta                                              |
| full lint                              | PASS               | errors 0、今回のdiffと無関係な既存warnings 157、real `29.82 s`                            |
| production Turbopack build             | PASS               | real `29.30 s`、compile `8.4 s`、TypeScript `18.3 s`、static 193 / 193（13 workers）      |
| npm audit                              | PASS               | vulnerabilities 0                                                                         |
| independent security review            | P0/P1/P2 = 0       | 初回2 P1とfollow-on P2を修正し、final deltaをseal                                         |
| ready PR / required CI / regular merge | pending            | URL、head、checks、merge commitはまだ存在しない                                           |

final post-P2 stable runのcommand real timeは`153.64 s`、maximum RSSは4,129,849,344 bytesだった。full suiteの最初のmaximum-parallel runは、無関係なUSI transcript timeoutで121 / 122 files、2,244 / 2,245 testsとなった。同じfileは直後の単独実行で43 / 43 PASSした。そのためこのtransientを隠さず途中dataとして残し、上表ではresource contentionを抑えたfinal 8-worker runの122 / 122 files、2,245 / 2,245 PASSをauthoritative local resultとしている。

これらはsourceとtemporary fixtureのlocal validationである。actual production record、actual key、real connector gate、teacher、training、live weight、棋力を検証した値ではない。

## 9. Explicit nonclaims

- actual deployment-key provisioning: **0**
- actual-home key-instance inspection / key bytes read: **0 / 0**
- approved production record creation / installation / load: **0 / 0 / 0**
- production capability mint / claim: **0 / 0**
- production connector 100 / 500 / 24,000 gates: **0 / 0 / 0**
- real role-bundle callback / stable proposal / teacher proposal / rescore: **0 / 0 / 0 / 0**
- published teacher labels / optimizer steps / candidate weights: **0 / 0 / 0**
- production weight overwrite / live evaluation activation: **unchanged / unchanged**
- matches / rating / stable high-dan evidence: **0 / not established / not established**

temporary fixtureでapproved-shaped recordやcapabilityを作っても、actual control-plane approval、production origin、actual key continuity、connector successにはならない。このchangeが現時点で証明できるのはsource authority boundaryと、完了したlocal synthetic validation / reviewだけである。

## 10. 次の順序

1. 完了した132 / 132 focused、335 / 335 related、2,245 / 2,245 stable full、build、reviewのlocal evidenceを保持する。
2. ready PRを作成し、review commentへ対処し、required CIを通してregular mergeする。
3. separate explicit approvalがない限りactual key provision / inspectionやrecord install / loadを実行しない。
4. approval後にだけcandidate raw bytesを別reviewし、approved recordをcreate-only installする。
5. その後だけ100-parent connector gateを別のexecution evidenceとして扱う。

merge、CI、application deployはstep 5以降を自動実行しない。approved enrollment capabilityはgate開始条件の1つにすぎず、teacher label、training、live weight、stable high-dan strengthではない。
