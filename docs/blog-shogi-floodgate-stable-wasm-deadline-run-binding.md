# stable-WASM 長尾診断の子成果物を安全停止で閉じる

> この変更はprivate診断を実行可能にするPRではありません。review中に、repository内のlauncherが自分自身のrevisionを承認する設計では、検証前に未承認codeが動く循環bootstrapを除けないと判明しました。そのためformal package commandとuser-owned承認recordを削除し、直接起動は必ず `external-supervisor-unavailable` で停止します。公開asset校正は、5組の各組でmove / score / depth / nodes / leavesの5項目すべてが一致し、callback/reference比は `1,002,562 ppm` でした。private診断、teacher生成、再学習、formal A/B、外部棋力校正はすべて **0**、live weightsは未変更です。English version: [blog-shogi-floodgate-stable-wasm-deadline-run-binding.en.md](./blog-shogi-floodgate-stable-wasm-deadline-run-binding.en.md)

## 1. なぜ「実行binding」から「子成果物」へ戻したか

最初の案は、固定JXA、専用checkoutのexact-clean確認、read-only registry / asset / role入力、固定13ファイルの前後比較、aggregate-only出力を一つにつなぐものでした。しかし、repository内にあるJXAやbundleは、そのbytesを外部のtrusted rootが認証する前に評価されます。user-owned fileのmodeを `0600` にしても、同じuserは置換できます。これはapproval authorityではありません。

したがって、このPRは次をclaimしません。

- repository checkoutからprivate runを開始できる。
- exact-clean revisionがapproved revisionである。
- user-owned recordがcreate-only enrollmentやtrust rootになる。
- package commandがformal run authorityを持つ。

exact-clean captureはsource provenanceの記録として残しますが、承認とは呼びません。

## 2. 直接起動は固定STOP

tracked CommonJS entryの順序は次だけです。

```text
launcher attestation
  -> fixed entrypoint context
  -> non-authorizing exact-clean provenance capture
  -> external-supervisor-unavailable
  -> fixed schema / fixed phase / STOP の1行
```

entryはregistryをclaimせず、private training rowを開かず、WASM診断workerを起動しません。package.jsonにはformal diagnostic run commandを置いていません。

bundleは18個のsource inputを明示allowlistし、runtime externalをNode builtinだけに限定します。latentなread-only binding graphは将来の外部監督器が同じbytesをreviewできるようbundleへ保持しますが、attestation前にもSTOP entry内にも初期化しません。同じsource treeからの再buildがbyte-identicalでなければ失敗し、local user path、`node_modules`、preload、private canaryを拒否します。

## 3. dormant JXAの出力境界

JXA helper自体は実行権限ではなく、将来のroot-owned supervisorが認証してから使う子成果物です。caller引数、caller path、caller revision、preloadは受けません。固定pathのNodeを直接 `NSTask` childとして起動し、child側でversion `v22.13.0`を確認し、native process activityでsleepを防ぎます。ただし、これはpathとreported versionの固定であって、Node runtime bytesを実行前に認証するものではありません。その認証も後続のexternal supervisorに必要です。

child stdout / stderrは外へ直結しません。

- stdoutは最大64 KiBまでcaptureする。
- stderrは最初の1 byteで即座にinvalidにする。
- canonical ASCII JSON 1行以外を拒否する。
- successは全nested key、固定label、count合計、13 / 13不変、reap値を検証し、新しいsanitized objectへ再構成する。
- failureもallowlist済みphaseと固定constantから新しく組み立てる。
- timeoutまたはinvalid時はdirect childへTERMを送り、5秒後も同じdirect childが稼働中だとPID取得の前後で再確認できた場合だけSIGKILLし、`close` / reapと両pipe EOFを待つ。
- direct childが終了済みなのにdescendantがpipeを保持してEOFにならない場合は、古いPIDへsignalせず固定STOPにする。
- stdin / stdout / stderr pipeのpost-launch close例外もfail closedにする。

実機fixtureでは、70 KiBを出してSIGTERMを無視するchild、stderrを1 byteだけ出して停止するchild、起動後に何も出さないchildをboundedに強制終了・回収しました。さらに、direct childはTERMで終了する一方、finite descendantがcapture pipeを保持するcaseで、stale PIDへSIGKILLせず固定STOPになることを確認しました。このfixtureはdescendantの回収をclaimしません。nested fieldへ `/Users/...` canaryを埋めたcanonical successも、元objectを転送せず空出力で拒否しました。

このJXA単体は、任意のmalicious grandchildをprivate process groupとして回収するとはclaimしません。その境界は後続のexternal supervisorに必要です。

## 4. worker停止と回収

将来external supervisorがlatent bindingを認証して呼ぶ場合に備え、production `shouldStop` predicateを公開校正childと全diagnostic laneへ渡します。各controllerは25 msごとに停止を確認し、true、non-boolean、throwのどれでもfail closedにしてSIGKILLします。Promiseはchildの`close`後だけsettleします。

合成testでは最大6 laneがactiveになった後にstopを反転し、6 childすべてを回収し、残り6 laneをspawnせずfailure aggregateへ閉じました。これはtracked worker childの回収証拠です。arbitrary grandchild process-group containmentの代用ではありません。

## 5. PUBLIC校正は独立したまま

公開校正はprivate claimを使わず、repositoryの公開WASM、公開weights、tracked worker、固定公開局面だけを使います。5組それぞれで次を比較します。

```text
reference: searchBestMove(0, 11, 10)
callback : searchBestMove(1, 11, 10), hostNow = 0
```

各組でmove、score、depth、nodes、leavesの5項目すべてが一致しなければ失敗します。`exact_parity_count = 5` は「5組すべてで5項目一致」という意味です。

`callback_overhead_ratio_ppm = 1,002,562` はcallback時間合計がreferenceの約1.002562倍だったという比率であり、「1,002,562 ppm遅い」というdeltaではありません。raw durationはchildから返しません。この短い固定局面は600秒長尾のwall-time同等性や棋力を証明しません。

real公開校正は通常unit suiteとCPU競合させず、`npm run test:shogi-floodgate-stable-wasm-deadline-public-calibration` で独立実行します。productionの25% stability limitと180,000 ms watchdogは変更していません。

## 6. latent read-only bindingに残す境界

bundle内のlatent graphには、後続supervisorが認証した後にだけ使う次の防御を残します。

- PUBLIC校正成功後にだけopaque registry capabilityをclaimする。
- manifest / receipt / verifier revisionで固定9 role pathを認証する。
- 認証済みlogical rows 3..14だけを12入力へ変換する。
- 12 requestを最大6 child、600,000 ms cooperative deadline、615,000 ms outer watchdogで分離する。
- 個別lane recordやpartial iteration resultを返さず、固定histogramだけを返す。
- control 2、runtime 2、role 9の固定13ファイルを前後比較する。
- writer、directory enumeration、root-key read、checkpoint、retry、resume、teacher生成、training、live mutationを含めない。

これらはcode/test上の子成果物であり、このPRでprivate inputへ到達した実績ではありません。

## 7. 現在の検証

| 対象                                                         | 結果                                       |
| ------------------------------------------------------------ | ------------------------------------------ |
| 公開asset校正                                                | 1回、5組すべてで5項目一致、`1,002,562 ppm` |
| JXA capture / deep sanitize / direct-child lifecycle fixture | 22 / 22 PASS                               |
| 6 active diagnostic laneのstop / reap                        | PASS                                       |
| calibration childのstop / reap                               | PASS                                       |
| deterministic 18-source bundle / privacy hard gate           | PASS                                       |
| latest `origin/main`の通常merge                              | `163dc696e4e6453919547386294058285516c236` |
| full unit suite                                              | 177 files、3,204 PASS / 1 SKIP             |
| production build                                             | PASS                                       |
| private registry claim / private row open / private lane     | **0 / 0 / 0**                              |
| teacher生成 / training / candidate selection                 | **0 / 0 / 0**                              |
| formal A/B / external calibration                            | **0 / 0**                                  |
| live weight変更 / production activation                      | **false / 0**                              |

Linux CIでは、test fixture helperが共有system temporary root自体のpermissionを変更しようとするtest-onlyの移植性不具合も検出しました。helperはrealpath済みtemporary rootのstrict descendantだけを変更するよう修正し、共有rootへ触れる試みを拒否する回帰testを追加しています。runtime closureとoperational stateは変わりません。

先行PRを通常mergeした最新`origin/main`を取り込んだheadで、focused / isolated public calibration / affected regression / full unit / production buildを完了しました。bundleは287,891 bytes、launcherは24,803 bytesで、exact SHA-256を[machine-readable evidence](./data/floodgate-stable-wasm-deadline-run-binding-2026-07-17.json)へ固定しています。

## 8. 不足している外部authority

formal private runに必要なのはrepository内の別recordではなく、repository codeが動く前にbytesを認証する外部境界です。

1. root-owned、非writable、固定install先のsupervisor / verifier
2. authenticated create-only enrollmentまたは同等のrollback-resistant trust root
3. expected merge revision、JXA、bundle、Node、checkout layoutのexact identity照合
4. private process groupを作り、main childと全descendantをTERM / KILL / reapするlifecycle
5. 認証成功後にだけ子artifactを起動するone-shot gate

このUnit A supervisor / verifierは後続のsource-and-test PRです。admin install、enrollment adoption、release activationもさらに別gateです。このPRへは実装もinstallもしません。

## 9. 次の安全な順序

```text
current child-artifact PRをlatest main上で検証・通常merge
  -> external root-owned supervisor/verifierのsource/test PR
  -> independent review と exact release bytes
  -> separate admin install / create-only enrollment
  -> non-private commissioning test
  -> one formal aggregate-only private diagnostic
  -> aggregate review
  -> 必要なら別PRで長尾fix
```

one formal diagnosticが成功しても、teacher生成、再学習、候補選抜、formal A/B、外部棋力校正、live activationは自動的には許可されません。

## 10. 現在の判断

子成果物のprivacy、determinism、停止・回収は強くなりました。しかしroot-owned external supervisorとauthenticated enrollmentが存在しないため、repositoryからformal private runを正当に開始する方法はありません。

現在のproduction判断は **STOP**。private/formal runは **0**。評価関数、棋力、安定した高段は未確立で、live weightsは **unchanged** です。
