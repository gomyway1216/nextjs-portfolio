# v7 producer timeout・cancellationとUSI process回収をboundedに閉じる

> [v7 incremental checkpoint scanner](./blog-shogi-floodgate-v7-incremental-checkpoint-scan.md)は、24,000親のwork streamをfile sizeに比例するscanner bufferなしで再検証できるようにした。しかし、producerのraw Promiseが永遠にsettleしなければ、`Promise.allSettled`もcheckpointも永遠に終わらない。この変更ではcheckpointをv2へ上げ、親ごとのdeadline、first-terminal cancellation、bounded abort drainを認証対象にし、[production teacher USI runtime](./blog-shogi-floodgate-production-teacher-usi-runtime.md)へprocess-group reapとprivate snapshot cleanupを持たせた。synthetic v2 24,000-parent scan-loadは完了したが、official receipt、production coordinator、real label、training、weight、対局、棋力の証拠ではない。English version: [blog-shogi-floodgate-v7-producer-timeout-cancellation.en.md](./blog-shogi-floodgate-v7-producer-timeout-cancellation.en.md)

---

## 現在の境界

| 項目                                     | 状態             | ここで言えること                                                    |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------- |
| checkpoint / run binding                 | v2へ更新         | producer controlをheader、HMAC chain、resume identityへ固定する     |
| parent deadline / abort drain            | code・test完了   | raw producerとcontrollerの回収待ちを認証済み時間でboundedにする     |
| USI runtime lifecycle                    | code・test完了   | owner abortの完了をprocess group消滅とsnapshot cleanupの後にする    |
| synthetic v2 24,000-parent scan-load     | 完了             | v2 stream 24,000 / 24,000をproducer call 0でresume・final scanした  |
| Attempt 6 official receipt / coordinator | 未採用・未実装   | runtime receipt自体はあるが、digest authorityとcheckpoint配線はない |
| real label / training / strength         | 未実行・証拠なし | weight、A/B、Elo、rating、段位、高段安定性、live変更を主張しない    |

## 1. 発見: `Promise.allSettled`はdeadlineではない

`Promise.allSettled(started)`は、渡した全Promiseがsettleするまで待つ集約器であり、時刻の上限を作らない。timeout用のsupervisor Promiseだけがrejectしても、背後のraw producer Promiseがpendingなら、そのraw Promiseを含むdrainは終わらない。`Promise.race`も呼び出し側の待ちを終えるだけで、engine processを停止・回収しない。

今回の設計で分けたのは次の2つである。

- **supervisor result:** 認証済み`parent_deadline_ms`までに使える結果またはtimeoutをcheckpoint state machineへ返す。
- **raw producer Promise:** 実際のproducerがいつsettleしたかを開始直後から別に観測し、terminal後の回収状態を判定する。supervisor timeoutでraw Promiseが消えたことにはしない。

実装とadversarial testから、関連する落とし穴もまとめて表へ固定した。

| 発見                                                    | 必要になった規則                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Promise.allSettled`自体には期限がない                  | controllerと全raw producerを別に数え、`abort_drain_ms`で待機だけを打ち切りlate observerは残す |
| Node timerには表現上限とclampの危険がある               | timer値をinteger `1..2,147,483,647 ms`に限定し、HMAC認証する                                  |
| input順待ちとfailure観測順は同じでない                  | 最小input indexではなく、globalに最初に観測したterminalを1回だけlatchする                     |
| timeout後にもraw Promiseはsettleし得る                  | late settlementはconsumeだけ行い、validateもappendも開始しない                                |
| terminal前に始めたappendは途中で止められない            | 完了し得るものとしてpersistence-indeterminateにし、resume時にdurable prefixを再scanする       |
| child PIDだけでは孫processが残り得る                    | dedicated process groupをTERM / KILL escalation付きでreapする                                 |
| engineだけ消してもasset copyが残り得る                  | snapshot identityを再検証し、private snapshotをcleanup完了条件へ含める                        |
| test失敗は通常の`afterEach`より前にも起きる             | `try/finally`でstarted promise観測、group reap、temp-root removalを閉じる                     |
| own property付きnative Promiseも後でrejectし得る        | contract違反として拒否しつつ、captured intrinsicでrejectionだけbest-effort観測する            |
| 同じclose errorをcaller間で共有するとmutationも伝播する | stable identityを保ったままinstanceをfreezeし、後続callerの観測を固定する                     |

## 2. runtimeとcheckpointを別のstate machineにする

checkpointは「どの親をいつscheduleし、どの結果を永続化してよいか」を所有する。USI runtimeは「探索を止め、全engine process groupを消し、private snapshotを片付けること」を所有する。この責任を1つのtimeout Promiseへ押し込めると、待ちは終わってもresourceだけ残る。

```text
authenticated durable prefix
  -> schedule up to 12 parents
  -> observe supervisor result and raw settlement separately
  -> first terminal
       -> latch once / stop scheduling
       -> abort every raw-pending signal once
       -> call producerController.abortAndDrain() once
       -> wait only through authenticated abort_drain_ms

producerController
  -> owning adapter
  -> teacher USI runtime.abortAndReap()
  -> process groups gone + snapshot revalidated/removed
```

この接続の型は作ったが、最後のowning production adapterはまだない。現在のcheckpoint controllerはtest-only trusted boundaryであり、図のproduction配線が存在するというclaimではない。

## 3. USI runtime lifecycle state machine

runtimeでは最初のlifecycle transitionだけがcleanupを所有する。後から来たcallerは新しいcleanupを始めず、同じraw cleanup Promiseへjoinする。

| 現在状態        | event                          | transition / caller結果                                                                                 |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `OPEN`          | search failure                 | `POISONED`へ移り、強制cleanupを1回開始する                                                              |
| `OPEN`          | `abortAndReap()`が先           | abort errorで`POISONED`へ移り、即時TERMからbounded KILL escalationへ進む                                |
| `OPEN`          | `close()`が先                  | `CLOSING`へ移り、orderly quitから必要時TERM / KILLへ進む                                                |
| `CLOSING`       | 後続abortまたはclose           | close-firstの同じexact Promiseへjoinし、abortへ再分類もpoisonもしない                                   |
| `POISONED`      | 後続operation / lifecycle call | 既存のterminal errorまたはraw cleanup Promiseへjoinする                                                 |
| cleanup fulfill | 全状態                         | 全process groupが消滅し、snapshot再検証と削除が成功済み                                                 |
| cleanup reject  | 全状態                         | lifecycle callerはraw cleanup error、operation callerはprimaryとcleanupを集約したterminal errorを受ける |

1 engineの終了に失敗しても残りのengine、snapshot revalidation、snapshot removalを試し、cleanup failureを`AggregateError`へ集める。また、fulfilled cleanup後に遅い`close` eventが来てもprocess groupへ再signalしないようlistenerを解除し、settled guardでも二重処理を止めた。post-merge reviewでは、closed callerへ同じerror instanceを返すだけでは先行callerが`.message`や`.name`を変更できることも見つかった。instanceをfreezeし、共有identityと後続観測の両方を固定した。

## 4. checkpointのfirst-terminal state machine

rolling windowは最大12件で、永続化はstrict input順のままである。ただし、terminalの選択はinput index順ではない。producer rejection、認証済みdeadline、validation、append、timer setupなどから**globalに最初に観測された原因**を1回だけ保存する。

first terminal後は新しい親をscheduleせず、各raw-pending taskのnative `AbortSignal`へ同じ原因を1回だけ通知し、controllerを1回だけ呼ぶ。late raw settlementは開始時から付けたobserverがconsumeするが、reportのvalidationもcheckpoint appendも行わない。

drain結果は次のように分類する。

| bound到達時またはdrain完了時                     | 結果                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| controller fulfilled、raw pending 0              | cleanup addendumなしでprimary failureを返す                                 |
| controller rejected、raw pending 0               | primary + controller cleanup failureを返す                                  |
| controller pending                               | bound到達時にcleanup timeout。raw pendingが0でも成功扱いにしない            |
| controller fulfilled / rejected、raw pendingあり | bound到達時にcleanup timeout。controllerだけ終わっても成功扱いにしない      |
| raw producerがterminal後にsettle                 | consumeのみ。validate / appendしない                                        |
| terminal前にappend開始済み                       | appendが終わる可能性を認め、persistence-indeterminateとして再scanを要求する |

したがって、controllerまたはraw producerのどちらか一方でもbound時にpendingなら`FloodgateV7TeacherAbortDrainTimeoutError`である。raw Promiseを「signalを送ったから回収済み」とは数えない。

## 5. primary failureとcleanup failureを両方失わない

timeout処理でよくある失敗は、後から起きたkill errorで元のproducer failureを上書きすることである。`FloodgateV7TeacherProducerCleanupError`は、`.primary`と`.cause`に最初の原因を保持し、`.cleanupFailure`にcleanup側の`AggregateError`を分離する。

cleanup側へ入るのは、controllerの同期throw、exact native Promise以外のreturn、rejection、abort-drain timerのsetup / cancellation failure、またはdrain timeoutである。複数あればすべて残す。cleanupが正常に閉じた場合はwrapperを足さずprimaryだけを返す。

checkpoint appendは`write`、`sync`、directory syncのどこまでdurableになったかをexceptionだけでは断定できない。特にterminal前から走っていたappendはterminal観測後に完了し得るため、以後のvalidation / append開始を禁止するだけでは十分でない。persistence開始後のfailureは`FloodgateV7TeacherCheckpointPersistenceIndeterminateError`へ上げ、次回resumeでHMAC-authenticated durable prefixを再scanする。これにより、推測で「書けなかった」ことにせず、disk上のcanonical bytesだけを採用する。

## 6. producer controlを認証対象にする

同じwork fileを別のdeadlineや別のlate-result policyでresumeできると、HMACが正しくても実行意味が変わる。v2は次をrun bindingとheaderへ入れ、strict key setとHMAC chainで認証する。

| field                    | v2 contract                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| checkpoint schema        | `shogi-floodgate-v7-teacher-work-v2`                                                              |
| run binding schema       | `shogi-floodgate-v7-teacher-run-binding-v2`                                                       |
| producer control schema  | `shogi-floodgate-v7-teacher-producer-control-v2`                                                  |
| `parent_deadline_ms`     | integer `1..2,147,483,647`                                                                        |
| `abort_drain_ms`         | integer `1..2,147,483,647`                                                                        |
| `max_in_flight`          | exact `12`                                                                                        |
| `cancel_policy`          | `first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2` |
| `late_settlement_policy` | `observe-from-start-consume-after-terminal-without-validation-or-append-v2`                       |
| runtime identity         | `stable_runtime_receipt_sha256`と`teacher_usi_runtime_receipt_sha256`を各64 hexで固定             |

値を変えたresumeはproducerを1件も呼ぶ前にrejectする。timer上限はNodeのdelay clampやoverflowへ処理系依存で落ちるのを避ける境界でもある。24k synthetic evidenceの値は`parent_deadline_ms = 1,800,000`、`abort_drain_ms = 30,000`だが、producer callは0なのでproduction engine timeoutの実測値ではない。

## 7. decorated Promiseをrejectしてもrejectionを捨てない

producerとcontrollerが返してよいのは、current Node realmのnon-Proxy native Promise、exact `Promise.prototype`、own key 0を満たすものだけである。Promise subclass、Proxy、thenable、own property付きのdecorated native Promiseはsemantic inputとしてrejectする。

ここで新しい問題が見つかった。たとえば`trace_id` own propertyを付けたnative Promiseをcontract違反として即時rejectしても、そのPromise自身が後からrejectすればunhandled rejectionになり得る。一方、通常の`.then`へ安易に渡すと、decorated Promiseの`constructor`や`Symbol.species`を信頼する余地が生まれる。

対策は、contract違反という判定を変えず、native・non-Proxy・exact prototypeまで確認できた値だけにcaptured `Promise.prototype.then`を`Reflect.apply`することである。fulfill / reject handlerはいずれも値をcheckpointへ運ばず、species由来のresultも無視する。これはrejection観測だけのbest effortであり、decorated Promiseを信頼済みに格上げしない。内部supervisor Promiseはcaptured native constructorへpinする。current JavaScript realm / intrinsics自体はtrustedであり、hostile same-process codeへのsandboxを主張しない。

## 8. process group、snapshot、test teardownを同じ完了条件にする

owner abortがfulfilledになる条件は「signalを送った」ではない。各USI engineのdedicated process groupが消滅し、private snapshotのidentity再検証と削除が成功した後である。abort-firstはorderly quitを待たずTERMへ進み、bound後にKILLへescalateする。close-firstはorderly quitを試し、それでも残るgroupだけをTERM / KILLする。

testも同じ所有権を守る必要がある。detached childを使うadversarial caseでは、assertion失敗やfixture setup失敗でも`finally`へ入り、開始済みoperation / lifecycle Promiseのrejectionを観測し、process groupをforce-reapし、group消滅を確認してからtemporary rootを削除する。登録済みfixtureだけに依存する`afterEach`では、登録前のthrowやlate settlementを取りこぼす。テストが緑でもchildやdirectoryが残る設計は、production lifecycleの証拠にしない。

## 9. v1からv2へin-place再署名しない

v2ではcheckpoint schema、run binding、HKDF / HMAC domain、format、producer-control policy、runtime identityが変わった。v1 headerにはv2のproducer controlがなく、v1 bytesを同じ意味のままv2として再署名する方法はない。

scannerは真正なv1 HMAC headerもunsupported schemaとしてproducer / controller call 0のままrejectする。運用手順は、旧stageをimmutableなhistorical evidenceとしてarchiveまたはquarantineし、新しいprivate stageでv2をfresh startすることである。key holderがv1をin-placeでv2へre-signしたり、completed parentだけを黙って移植したりしない。

[旧Attempt 5記事](./blog-shogi-floodgate-v7-valid-24k-scan-load.md)と[旧監査JSON](../ml/protocols/floodgate-v7-valid-24k-scan-load-183e95f-result.json)はv1 historical evidenceとして残る。source `183e95f409347c37feee72b0509af17317891a36`、harness SHA-256 `d0f8b2f21b26c523949b4026171c35b7158c2509a54d5a81edba56006623d20f`、443.37秒、429,244,881 bytes、stream SHA-256 `ea6e9d26e4a7b8ac817c586dec9d2b903dbc798a0324e5c63b2d5adddc10fbac`という値は変更しない。ただし、これらを現行v2 resume / acceptance evidenceへ流用しない。

## 10. synthetic v2 24,000-parent evidence

現行v2のraw recordは[Attempt 6監査JSON](../ml/protocols/floodgate-v7-valid-24k-scan-load-017692c-result.json)に保存した。監査identityは短縮せず次のとおりである。

| 監査項目             | 確定値                                                             |
| -------------------- | ------------------------------------------------------------------ |
| source commit        | `017692c7a076babbd40e7be0b14ea27d9988fa6c`                         |
| harness SHA-256      | `23578cbf11deafb49cd288f38d9f3ec081e76d0f41a5b2948b3ccf08fabfb9a2` |
| UTC                  | `2026-07-13T11:51:53Z`開始 / `2026-07-13T11:59:09Z`終了            |
| wrapper / process    | exit 0 / complete result JSON                                      |
| external time        | wall 435.60 s / user 442.23 s / system 5.74 s                      |
| external maximum RSS | 483,491,840 bytes                                                  |
| stream               | 429,245,287 bytes / 24,002 records                                 |
| stream SHA-256       | `8039ec02f3421d934d0a9f1d10b47a97f273e397ad414e64db50bded13c498ac` |
| resume               | completed 24,000 / resumed 24,000 / producer calls 0               |
| cleanup              | temporary roots before 0 / after 0 / new residual 0                |
| source hygiene       | worktreeはrun前後ともclean、source commit / harness SHA-256不変    |

streamのLF込み算術も`2,957 + 429,217,823 + 505 + 24,002 = 429,245,287`で一致した。resumable-prefixとsealed-finalは各6,550 reads、最大request 65,536 bytesで同じstreamを受理し、receipt / independent SHA-256も一致した。外部wallとCPU timeは別の時計なので、user timeがwallを上回ること自体は不整合ではない。

このrunはApple M4 Pro 14 logical CPU、51,539,607,552-byte memory、macOS 15.1 arm64、Node v22.13.0で行った。fresh fixture buildは非証拠として破棄し、native syncを戻してからevidence scanした。RSSは1 machine・1 fixtureの観測値であり、scaling guaranteeではない。

最重要の限定は`producer_calls = 0`である。このevidenceが示すのは、synthetic・holdout-freeなv2 header / producer-control identityを持つ24,000-parent checkpointをresume・final scanできたことだけで、real USI timeout、controller drain、official receipt、またはproduction originを実測していない。

## 11. claim境界と次の作業

現在のcheckpoint controller、timer hook、24k fixtureはtest-onlyで、current realm / intrinsicsとcontrollerをtrustedとする。scan-loadのstable runtime digestはdummy identityであり、teacher runtime digestもofficial production authorityが発行したreceiptではない。productionには、official digest helper / authorityと、checkpointの`abortAndDrain()`をteacher runtimeの`abortAndReap()`およびstable runtime lifecycleへ接続するowning coordinatorがまだ必要である。

次は、そのadapterで実processを使ったtimeout、simultaneous failure、controller rejection、raw-never-settles、late close、snapshot cleanupをfault injectionし、bounded終了と残留group 0をreceiptへ残す。その後にholdoutを開かないsmall real-label pilot、label監査、training、frozen-weight A/B、rating評価を順番に行う。

この変更だけではofficial teacher labelを1件も生成しておらず、training row、optimizer、weightも変えていない。live環境への変更、対局A/B、Elo、81Dojo rating、段位、高段で安定したという証拠はすべて0である。強さを上げる土台の「失敗時に止まり、回収でき、同じpolicyで再開できる」を閉じた段階であり、棋力向上そのものはまだ測定していない。
