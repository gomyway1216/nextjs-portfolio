# v7 teacher runを固定deployment keyでMAC認証する

> 前段の[production parent coordinator](./blog-shogi-floodgate-v7-production-parent-coordinator.md)は、固定plan / producer policyとproduction runtime receipt digestを`run_binding`へ閉じた。しかし同じshapeのobjectをcallerが組み立てられるため、それだけではdeployment key holderがrunを認証したことにならない。この変更は、current EUIDに固定したprivate 32-byte keyをheld descriptorから読み、strict captureしたrun / stage metadataへdomain-separated HMACを発行する最小のmetadata authorityを追加する。production keyの実配備・production API実行、active stage / coordinator origin、checkpoint、実label、学習、weight、live評価関数、対局、棋力の証拠ではない。English version: [blog-shogi-floodgate-v7-deployment-key-authority.en.md](./blog-shogi-floodgate-v7-deployment-key-authority.en.md)

---

## 現在の境界

| 項目             | 現在の実装・検証                                                                                                                          | この変更から言えること                                                               |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| production API   | `authorizeFloodgateV7DeploymentTeacherRun(request)`の1引数。dependency injectionなし                                                      | production callerが渡したexact metadataをfixed key slotでMACするsurfaceを閉じる      |
| test API         | `authorizeFloodgateV7DeploymentTeacherRunCoreForTests(request, dependencies)`                                                             | temporary home / synthetic keyによるfilesystem fault test。production originではない |
| key slot         | `floodgate-v7-teacher-checkpoint-root-v1`、32 bytes                                                                                       | caller-selected key IDやkey bytesを受け取らない                                      |
| fixed deployment | current EUIDの`os.userInfo().homedir`配下`Library/Application Support/nextjs-portfolio/shogi-floodgate-v7-deployment-key-v1/root-key.bin` | `HOME`環境変数をproduction authorityにしない                                         |
| filesystem       | canonical path、parent exact `0700`、key exact `0600` regular / nlink 1 / size 32、`O_NOFOLLOW`、held pre/post identity                   | 1 invocation中のpath / descriptor identityとmetadata driftをfail closedにする        |
| authorization    | run IDをsaltにしたHKDF-SHA-256、別domainのcanonical HMAC-SHA-256                                                                          | exact receipt metadataの変更でMACが変わる                                            |
| key instance     | 別salt / info / HMAC domainから`key_instance_id`を導出                                                                                    | root key/hashを出さず、downstreamが異なるkey instanceを比較できる                    |
| secret lifetime  | root、authorization-derived、instance-derived、oversized-read byteをMAC直後、final hook / revalidation / closeより前に同期zero-fill       | hookやfilesystem awaitの遅延へsecret lifetimeを依存させない                          |
| 実行証拠         | Node v22.13.0、temporary filesystem / synthetic key focused **11 / 11 PASS**                                                              | production key provision / production wrapper executionの証拠ではない                |
| live / 棋力      | weight activation 0、対局0                                                                                                                | 「強くなった」「高段で安定した」というclaimは0                                       |

## 1. なぜrun bindingだけでは足りないか

coordinatorの`run_binding`は、固定plan、producer timeout / cancel policy、stable / teacher runtime receipt SHA-256を1つのvalueへまとめる。これはcheckpoint resumeの意味を固定するために必要だが、plain objectの構造だけでは「そのexact production coordinatorから来た」ことや「deployment key holderが許可した」ことを証明しない。

このauthorityは後者だけを担当する。固定key slotをcurrent-EUID private deploymentから読み、callerが渡したexact metadataへMACを発行する。一方、caller-supplied digestがexact runtime facadeから得られたか、stage receiptが現在activeなleaseに属するかはclaimしない。したがってstatusは`mac-issued-for-strictly-captured-caller-supplied-run-and-stage-metadata-not-checkpointed`であり、claim boundaryにも`not-coordinator-origin-active-stage-authority`を明記する。

次段connectorは、このMAC receiptだけをproduction-origin証明として扱ってはならない。同じownership内でexact coordinator facade / run bindingとactive stage leaseをclaimし、その値をauthority requestとcheckpoint invocationへ一度だけ渡す必要がある。

## 2. APIと最初のI/O前のexact capture

production APIのrequestはexact 4 keysである。

```text
runId
keyId
runBinding
stageAuthorizationReceipt
```

`runId`は64文字lowercase hex、`keyId`は固定literal以外を拒否する。`runBinding`はschema `shogi-floodgate-v7-teacher-run-binding-v2`、plan 10,890 bytes / SHA-256 `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af`へ固定する。producer controlも次のexact policyだけを受理する。

| field                | exact value                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| schema               | `shogi-floodgate-v7-teacher-producer-control-v2`                                                  |
| `parent_deadline_ms` | `1,800,000`                                                                                       |
| `abort_drain_ms`     | `30,000`                                                                                          |
| `max_in_flight`      | `12`                                                                                              |
| cancel               | `first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2` |
| late settlement      | `observe-from-start-consume-after-terminal-without-validation-or-append-v2`                       |

2つのruntime receipt digestはlowercase SHA-256だけを受けるが、そのproduction originはこのmoduleでは認証しない。request、run binding、producer control、plan、stage receipt、identity、allowed-entry arrayはordinary non-Proxy object / dense array、exact own enumerable data keysだけを受理し、accessorを評価しない。すべてをfresh frozen valueへcopyしてからproduction identityやfilesystemへ進む。invalid requestではkey file I/Oを始めない。

test coreだけが`effectiveUserId`、`homeDirectory`と2つのoptional hookを受ける。production wrapperはdependencyを公開せず、`process.geteuid()`と`os.userInfo()`のUID一致を要求する。test hookが観測できるauthority-owned key copyはtest境界だけであり、production wrapperはhookへ`undefined`を固定する。

## 3. fixed deploymentとheld-descriptor検査

production deploymentは次へ固定する。

```text
<os.userInfo().homedir>/Library/Application Support/nextjs-portfolio/
  shogi-floodgate-v7-deployment-key-v1/root-key.bin
```

home、key parent、key fileの`realpath`がconstructed absolute pathと一致しなければ拒否する。key parentはcurrent EUID所有のexact `0700` directory、keyはcurrent EUID所有のexact `0600` regular file、link count 1、size 32 bytesでなければならない。parentは`O_RDONLY | O_DIRECTORY | O_NOFOLLOW`、keyは`O_RDONLY | O_NOFOLLOW`で開く。

検査はpathname `lstat`、held `fstat`、exact 32-byte positional read、33 byte目がEOFであること、final held `fstat`、final pathname `lstat`の順で行う。device、inode、mode、link count、UID、size、mtime、ctimeをpre / held / postで比較し、差があればreceiptを返さない。signed `key_deployment`はabsolute home / key pathやkey hashを含めず、relative path、owner UID、mode / byte / link contract、parent / keyのdecimal dev / ino、`key_instance_id`、held revalidation flagだけを含む。

これはsame-EUID process全体へのsandboxやremote attestationではない。trust boundaryは`trusted-current-euid-private-0700-key-deployment-and-current-js-realm-intrinsics-v1`であり、正しいoperator provisioningとcurrent process / realmを信頼する。

## 4. run bindingとdurable stage binding

stage authorization receiptはexact contract / trust boundary / status、exact allowed entries、parent / stage / lease identities、安全なstage / destination basenameをstrict captureする。その後、MAC対象の`stage_binding`へ次を射影する。

```text
authorization_contract / authorization_trust_boundary / authorization_status
allowed_entries
parent_dev / parent_ino
stage_dev / stage_ino
stage_basename / destination_basename
lease_inode_included = false
```

retryごとに変わるlease inodeをMACへ入れると、同じprivate stageをfresh leaseで安全にresumeできない。そのためlease identityはinput receiptの構造検証には使うが、durable stage bindingから明示的に除外する。parent / stage identityとbasenamesは残す。

ただしこれはcaller-supplied receiptのstructural projectionである。authorityはactive lease registryをclaimせず、stage pathをopenせず、stage entry contentも読まない。`stage_receipt_origin`、`active_stage_lease`、`stage_lease_origin`、`input_authentication`はreceiptのnonclaimsで全て`false`である。

## 5. HKDF、canonical HMAC、key instance ID

authorization keyは32-byte root keyを直接HMAC keyにせず、run ID bytesをsalt、`shogi-floodgate-v7-deployment-run-authorization-key-v1\0`をHKDF infoとして32 bytesへ導出する。そのkeyで`shogi-floodgate-v7-deployment-run-authorization-v1\0`とcanonical unsigned receiptを順にHMAC-SHA-256へ入れる。algorithm literalは`hkdf-sha256-then-domain-separated-canonical-hmac-sha256-v1`である。

canonical JSONはUTF-8 bytewise key order、finite number、negative-zero拒否、dense exact array、enumerable data propertyに限定する。MAC対象にはcontract / status / claim / trust / execution boundary、run / key ID、run binding、stage binding、key deployment、test boundary、nonclaimsが含まれる。`authorization_mac`だけを最後に追加し、rootと全nested recordをnull-prototype / frozenへする。

fixed `keyId`だけでは、operatorが同じslotのfileを別keyへ交換した事実をreceipt比較で区別できない。そのため別のfixed salt、HKDF info、HMAC domainからdeterministicな`key_instance_id`を導出し、signed key deploymentへ含める。これはroot keyのraw bytesやSHA-256ではなく、authorization domainとも分離したpseudonymous identifierである。module自身は過去receiptやrotation registryを読まないため、`cross_invocation_key_rotation_detection`はなお`false`である。次段がinstance IDを比較してfail closedにする必要がある。

## 6. keyを返さず、MAC直後・次のawait前にzeroizeする

public receiptはroot key、key hash、derived key、generic signer callbackを返さない。sourceもdataset、checkpoint implementation、production coordinator/runtimeをimportせず、`train.jsonl` / `work.jsonl` / weight pathを扱わない。

authority-owned byte bufferはroot 32 bytes、authorization-derived 32 bytes、instance-derived 32 bytes、oversized-read確認用1 byteである。success pathでは2つのHMACを計算した直後に、これらをcaptured `Buffer.prototype.fill`で同期zero-fillし、全byteが0か再確認する。これはtest-only final hook、held / pathnameの最終`fstat` / `lstat`、descriptor closeの**全てのawaitより前**である。MAC計算より前に失敗したpathも`finally`の先頭で同じbufferを再zeroizeしてからcloseへ進む。faulty hookやfilesystem operationが停止してもsecret lifetimeを延ばさない。zeroize failureとdescriptor cleanup failureはprimary failureと分けて保持し、cleanupが失敗したsuccess receiptは返さない。

test-only observerはinternal root copyを同期的に保持できるが、resolve / reject後に全zeroであることをテストするためだけのseamである。production execution boundaryには存在しない。

## 7. 実装中に確認した発見と途中データ

| 発見 / 途中値                                                                     | 現時点の意味                                                                        |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `HOME`ではなく`os.userInfo().homedir`とEUID一致が必要                             | environment overrideをproduction key root authorityにしない                         |
| parent / key両方をheld fdへ結び、pathとdescriptorを前後比較する                   | symlink、mode、owner、link、size、identity driftを1 invocation内でfail closedにする |
| fixed key IDだけではkey replacementをreceipt比較で識別できない                    | separate-domain `key_instance_id`をsigned metadataへ追加した                        |
| key instance IDがあってもこのmoduleは履歴を読まない                               | cross-invocation rotation detection / policy enforcementは次段                      |
| stage lease inodeはretry-specific                                                 | inputでは検証し、durable signed stage bindingからは除外する                         |
| exact-shape stage / run objectはproduction originではない                         | coordinator / runtime / active-stage originをnonclaimへ固定した                     |
| secret zeroizationをfinal hook / revalidation / close後へ置くとstall中にkeyが残る | MAC直後、次のawaitより前へzero-fillを移した                                         |
| synthetic focused testは11 / 11                                                   | production key、実dataset、teacher throughput、棋力の測定ではない                   |
| formal A/B preregistrationは192 color-swapped pairs / 384 games                   | このmetadata authorityでは1局も実行しない                                           |

## 8. テスト証拠と明示的nonclaims

2026-07-13、repository指定のNode v22.13.0で次を確認した。

| 検査                                              | 結果                                           | 境界                                                              |
| ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| focused deployment-key authority                  | **PASS: 11 / 11**                              | temporary filesystem / synthetic 32-byte key / injected test core |
| related authority / stage / checkpoint（3 files） | **PASS: 157 / 157**                            | imported stage contractとcheckpoint regression                    |
| full Vitest                                       | **PASS: 115 / 115 files、2,037 / 2,037 tests** | repository regression                                             |
| Python ML stdlib                                  | **PASS: 58 / 58**                              | unchanged training verifier regression                            |
| TypeScript `--noEmit`                             | **PASS**                                       | source / test type closure                                        |
| scoped ESLint / Prettier / diff-check             | **PASS**                                       | changed source / test / 日英docs                                  |
| Next production build                             | **PASS: exit 0、13 workers**                   | 既存Firebase build-phase / dynamic-route warningのみ              |
| production key provision                          | **0**                                          | fixed real pathへsecretを作成・変更していない                     |
| production API execution                          | **0**                                          | test-only injected execution boundaryだけ                         |
| real parent / label / checkpoint                  | **0**                                          | dataset / checkpoint I/Oなし                                      |

11 testsはgolden HKDF / HMAC、deep-frozen null records、exact records / arrays、Proxy trap 0、accessor非評価、v1 / plan / policy / digest / run / key / stage mutationのpre-I/O reject、MAC sensitivity、unsafe mode / link / size / directory / ownership / symlink / noncanonical path、post-read swap、success / failure zeroization、source import surfaceを対象にする。synthetic keyを使うためproduction secretの存在・正しさは示さない。

receiptのnonclaimsは`key_export`、`key_hash_disclosure`、`generic_signing`、`coordinator_origin`、`runtime_origin`、`active_stage_lease`、`stage_lease_origin`、`stage_receipt_origin`、`input_authentication`、`cross_invocation_key_rotation_detection`、`checkpoint_connector`、`dataset_read`、`checkpoint`、`runtime`、`teacher_label`、`training`、`selection_or_holdout_access`、`weight`、`live_evaluation_activation`、`match`、`playing_strength`が全て`false`である。

したがって、実Floodgate label、optimizer step、candidate weight、production weight上書き、live評価関数 / weight activation、対局、Elo、rating、段位は全て0である。application codeが将来merge / deployされることとweight activationは別であり、この記事にはlive weight変更のclaimがない。

## 9. 次はexact connector、100 / 500 durable prefix、24,000 seal

次段はauthorityへさらに責務を足すのではなく、別のtrusted connectorでexact authorityを組み合わせる。

1. exact production parent coordinatorをsingle-use claimし、そのexact `run_binding`を取り出す
2. active stage leaseをsingle-use claimし、そのexact authorization receiptを使う
3. authority receiptのrun / stage / key instanceをcheckpoint invocationとexact比較する
4. coordinatorからcheckpoint用exact 2-operation controller `{ produce, abortAndDrain }`だけを射影する
5. timeout、simultaneous failure、late settlement、close stall、resume、key / instance mismatchでfail closedになるsynthetic connector testを通す
6. holdoutを開かない100-parent production pilotでdurable authenticated prefix、fsync、resume、failure、throughput、残留processを監査する
7. 同じfixed policyで500 parentsのdurable prefixを通し、PASS後だけ24,000 training parentsをfull authenticated sealまで完走する

100 / 500 prefixと24,000 sealはteacher-data production / durability gateであり、棋力結果ではない。その後にもseed 42 / 43 / 44のQAT、fresh selection、fresh / legacy final、known regression、production parity、formal 192-pair / 384-game A/Bが残る。全内部gateを通過した候補だけが、別の明示承認後に81Dojo較正へ進める。
