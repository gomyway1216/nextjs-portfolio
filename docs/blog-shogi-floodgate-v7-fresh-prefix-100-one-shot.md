# fresh prefix-100 one-shotの安全条件を固定する — Floodgate v7

> [production outer-gate lease recovery](./blog-shogi-floodgate-v7-production-lease-recovery.md)は三つのgateを共通OS lockで直列化し、異常終了時の認証済みevidenceを保存する基盤を追加した。本変更はその次の最小段階として、production namespaceやfile contentを書き換えないfresh zero-work preflightと、完全にdisposableなprocess-death kill-drillを固定する。readによるatimeの不変までは主張しない。**この変更だけではproduction prefix-100を実行せず、公開preflight receiptもgate実行権限ではない。** real registry provision、production gate、teacher label、training、weight、live activation、match、棋力測定はいずれも0のままである。English version: [blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.en.md](./blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.en.md)

## 1. 結果と今回の範囲

次のproduction writeへ進む前に必要な二つの独立した観測境界を固定する。

| 境界                       | 対象                                                                     | productionへの作用                                                |
| -------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| fresh prefix-100 preflight | fixed private namespace、registry、key binding、readiness、zero-work状態 | namespace/file contentを変更しない。成功receiptもgateを許可しない |
| disposable kill-drill      | 一時home内のouter、inner stage、checkpoint failpoint                     | production namespaceを読まず、実gateを呼ばない                    |

本変更はsource、unit/adversarial test、fixed CLI、package script、Darwin CI、日英記事、machine-readable evidenceまでを対象にする。実production commandはmerge後に別のfresh判断として扱う。

## 2. なぜfresh one-shot前に二つの証拠が要るか

prefix-100は最小milestoneだが、一度開始した後はcheckpointがdurableになった可能性を無視して再実行できない。以前の成功したunit testや過去のprivate snapshotは、現在のlock、run root、stage lease、checkpoint、registry bindingを証明しない。

必要なのは、現在のproduction stateが未着手であることをread-onlyに観測するpreflightと、process deathが起きても「消してやり直す」のではなくevidenceを残して次回をblockすることをdisposable namespaceで確認するkill-drillである。二つを同じ数値へ混ぜず、real production counterは別に0から数える。

## 3. fresh zero-work read-only preflight

preflight contractは`shogi-floodgate-v7-production-prefix-100-read-only-preflight-v1`、success statusは`fresh-zero-work-prefix-100-read-only-preconditions-observed`である。public ownerはzero argumentで、callerからpath、key、registry、run ID、override、既存receiptを受け取らない。

観測は共通outer lockの保持中に行う。private rootと対象directoryはheld descriptorから二回観測し、同一性とexact entry setが途中で変化した場合はNO-GOにする。成功decisionも次の固定値に留める。

outer ownerが発行するopaque capabilityは、module-private state内でexact effective UID、canonical home、およびlockしたregistryのbyte数・digest・dev・inoへbindする。inner preflightはcapabilityをsingle-use claimし、自分が導出したUID / homeがanchorと一致することを確認した後、registryをheld read-only descriptorでopenする。そのdescriptorのidentity・bytes・digestを内部処理の開始時と終了時に再検証し、outerがlockしたhome / registry Aと別のhome / registry Bを混ぜる経路を閉じる。anchorのprivate値はreceiptへ返さない。

approved bindingも二段で閉じる。registryと照合した最初のapproved claim Aをprivate expected bindingとして持ち、expected-binding verifierがapproved recordを再load / claimしてcurrent keyをfresh inspectionする。Aと再loadしたapproved、そのapprovedとcurrent keyの両方がexact一致した場合だけ、identifierを含まないreceiptを返す。これはapproved recordとregistryのcreate-only / no-clobber性を変更しない。

runs、stage、outer control、registryとapproved/current bindingの観測は、共通lockとheld descriptorの下でfail closedに再検証するが、複数namespaceを1つのatomic filesystem transactionとしてsnapshotしたとは主張しない。この境界はcurrent process内でloadされたcodeと同一EUIDをtrustedとし、任意のsame-EUID processやhostile require-cache replacementに対するbroker分離を証明するものではない。

```text
result = GO
scope = read-only-core-preconditions-only
gate_invocation_authorized = false
```

つまり`GO`は「1回のouter-lock-held observation中に、必要な全checkとterminal revalidationがpassした」という意味であり、複数namespaceが同時に1つのatomic snapshotになったという意味ではない。後からreceiptを提示すればgateを実行できるという意味でもない。

## 4. GO / NO-GO matrix

production prefix-100の候補条件はすべてANDである。

| 条件                                                        | false / unknown時 |
| ----------------------------------------------------------- | ----------------- |
| reviewed・merged HEAD、exact Node v22.13.0                  | NO-GO             |
| approved enrollment、registry、current key exact binding    | NO-GO             |
| production readiness                                        | NO-GO             |
| common outer lockが取得可能                                 | NO-GO             |
| fixed runs rootがcurrent EUID所有、private mode、完全空     | NO-GO             |
| stage、destination、inner lease、work、checkpointが全て不在 | NO-GO             |
| outer active、quarantine、pending、unknownが全て0           | NO-GO             |
| held descriptorによる二回のsnapshotがexact一致              | NO-GO             |
| disposable process-death 6ケース成功                        | NO-GO             |
| monitorとSTOP ownerが記録済み                               | NO-GO             |

この記事のevidence作成時点ではprivate production preflightとreview済みkill-drill commandを実行していないため、総合判断は`NO-GO`である。

## 5. 同じouter lock内に残すべきTOCTOU境界

公開preflight receiptを保存し、outer lockを解放した後に既存prefix-100 commandを別processで起動すると、その間にnamespaceが変わり得る。したがって公開receiptをcapabilityへ変換してはいけない。

実production one-shotへ進む後続境界は、disposable drill成功後に共通outer lockを一度だけ取得し、そのlock保持中にunder-lock preflightを再実行して、同じ所有権のままfixed prefix-100 connectorをexactly onceで呼ぶ必要がある。本変更は既存production prefix-100 entryを変更も呼出しもしない。

## 6. disposable process-death kill-drill

kill-drill contractは`shogi-floodgate-v7-production-prefix-100-disposable-kill-drill-v1`で、三つのprocess-death injection pointへSIGTERMとSIGKILLをそれぞれ与える計6ケースを扱う。最初の2点はdurableだが、3点目はwrite後・fsync前のvisible 1-byteである。

| failpoint                       | 観測するevidence                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `outer-active-durable`          | death前はlock contention、death後はOS lock release、認証済みouter staleが全gateをblock |
| `stage-lease-durable`           | inner leaseのEEXISTが再開をblockし、bytesとidentityを保存                              |
| `checkpoint-first-byte-written` | write後・fsync前に1 byteがvisibleになった不明状態を、削除・truncate・repairせず保存    |

fixed production drillは`TMPDIR`などのenvironment値でrootを選ばず、`/private/tmp`の下にcurrent-EUID所有・exact `0700`のprivate anchorをcreate-onlyで作る。canonical realpathとnamed `lstat`でowner、mode、identityを確認し、cleanup前にも同じnamed identityを再検証する。anchorのdirectory descriptorを全期間保持するとは主張しない。anchorとproduction homeがalias、ancestor、descendantのどの関係でも双方向に拒否し、fixtureはこのprivate anchor内だけに閉じてproduction home、production registry、実gateを使わない。

各caseのparent側fixture cleanupは、そのcaseの全検証が成功した後だけ行う。fixed private anchor自体は6ケース全体のsuccess receiptが完成した後だけ削除する。signal、timeout、receipt / snapshot mismatch、child path不整合ではfixtureを保存し、pathを含まないtyped failureでmanual reconciliationが必要と返す。後の自動runがそのevidenceをcleanupすることもない。setupが途中で失敗した場合は、exact cleanup authorityを保てる範囲だけrollbackし、identityやcontainmentが不明な部分はorphan evidenceとして保存する。

child IPCはpoint / signalだけでなく、registry、stage、training input、checkpointに必要なexact nested key setもcaptureする。すべてのpathはcanonicalで、disposable fixtureの適切なparent下にあり、production homeと非alias・非overlapであることをchildが操作前に再検証する。

成功はprocess deathとfail-closed preservationのlocal evidenceであり、production recovery、電源断、rebootを証明しない。特に`checkpoint-first-byte-written`は1 byteのvisibilityだけを観測し、fsync durability、power-loss survival、torn-write recoveryを主張しない。

実装中のDarwin drillで、`lockf`へregistry pathを直接渡すprobeはhelper終了時にlock対象fileをunlinkし得ることが判明した。fresh probeはregistryを`O_RDONLY | O_NOFOLLOW`でopenしてheld descriptorをstdio fd3へ渡し、`lockf -s -t 0 3`だけを実行する。path形式のprobeは使わない。またcheckpoint caseはconsumer inputをcallback最初の`await`より前に同期handoffし、root keyはshared backing storeを持たない32-byte copyへ分離してから渡す。receiptがzero-fillを主張するのはparent fixture key bufferだけで、全process memoryやchild key copyの消去は主張しない。

## 7. fixed CLI、Node 22 guard、lazy load

preflightとkill-drillは別々のargumentless CLIを持つ。いずれも`process.argv.length === 2`と`process.version === "v22.13.0"`を確認してからimplementationをlazy loadする。wrong argumentやwrong runtimeではprivate moduleをloadしない。

package scriptsはproduction prefix-100 commandとは別名にする。kill-drillだけはmacOSのprocess lifetime中のsleep抑制に固定`/usr/bin/caffeinate`を使う。CLIはenvironment override、path、receipt入力、retry optionを受けない。

成功stdoutと失敗stderrはいずれもallowlistから再構築した一行JSONだけである。raw receipt、raw error、path、UID/PID、hostname、device/inode、digest、MAC、nonce、key、registry contentは公開しない。成功したlocal operationのstdout writeが失敗してもそのoperationを再実行しない。これはproduction gate successのclaimではない。

## 8. receipt、privacy、公開evidence

preflight public receiptはcontract、status、fixed gate、read-only decision、boolean verification/nonclaimsだけを返す。kill-drill public receiptはfixed failpoint/signal分類とboolean verification/nonclaimsだけを返す。fixture path、child identity、filesystem identity、private authentication値は含めない。

[machine-readable evidence](./data/floodgate-v7-fresh-prefix-100-one-shot-2026-07-16.json)はlocal implementation/testとreal production executionを分離する。日英記事とJSONはpersonal absolute home prefix、64桁hex、private canary、private-value keyを拒否するtestで検証する。

## 9. fail-closed state matrix

| 観測                                                        | public result                            | retry                                     | mutation                       |
| ----------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- | ------------------------------ |
| 必要な全checkとterminal revalidationが1回のlock保持中にpass | read-only `GO`、gate authorization false | gateは別の同-lock compositionが必要       | namespace/file content変更なし |
| 条件がfalseまたはunknown                                    | `NO-GO`                                  | 原因をread-onlyにreconcileしてfresh再観測 | なし                           |
| kill-drill 6ケース成功                                      | disposable success                       | reviewed HEADで次段階を判断               | productionにはなし             |
| kill-drill failure / signal / timeout / receipt不一致       | STOP                                     | 自動retryなし                             | evidence保存                   |
| production prefix-100開始後の不明failure                    | STOP                                     | checkpoint reconciliationまで再実行なし   | delete/truncate/repairなし     |

prefix-100が成功してもprefix-500を自動許可しない。exact 100件のread-only postflightを行い、そこで停止して別のreview判断を作る。

## 10. test matrixと途中データ

最低限、次を同じreviewed treeで検証する。

- preflightの全GO条件と各条件一つだけを壊したNO-GO
- held descriptorの二重snapshot、rename、symlink、hardlink、owner/mode、extra entry
- outerのUID / home / registry anchorとinnerのheld-FD開始・終了時再検証、approved Aとreloaded approved/currentの同一binding
- argumentless Node guard、guard前lazy-load禁止、import-only無作用
- success/failure receipt exact shape、Proxy/accessor/extra key拒否、private canary非漏えい
- 三failpoint × 二signal、death前contention、death後release
- stale/EEXISTによるblock、bytes/identity保存、delete/truncate/repairなし
- fixed `/private/tmp` private anchor、production-home ancestry双方向拒否、child nested-path escape拒否
- failure fixture / partial-setup orphan保存と、成功時だけのcleanup
- production namespace/registry/gate callが0
- 日英12章、duplicate JSON key、公開privacy

PR #471 final review repair後の最終安定substantive treeについて、authoritative local validationをexact Node v22.13.0で完了した。focusedは8 files・153 / 153 PASS、Vitest 69.36秒、wall 69.71秒、maximum RSS 419,643,392 bytes、swap 0だった。fullは143 files・2,680 / 2,680 PASS、Vitest 156.65秒、wall 157.07秒、maximum RSS 4,374,691,840 bytes、swap 0だった。production buildは193 / 193 static pageを生成し、wall 26.11秒、maximum RSS 2,619,424,768 bytes、swap 0で成功した。

その直前のpost-fix pre-review candidateではfocused 149 / 149、full 2,676 / 2,676、production build 193 / 193がPASSしていたが、PR #471 final review repairで置き換えられたnonfinal途中データとしてのみ残す。authoritative値へ混ぜない。

TypeScriptはPASS、full ESLintはexit 0・error 0・既存warning 157、changed-scope ESLintはerror 0 / warning 0だった。ML stdlibは58 / 58 PASS、`npm audit`はall severity 0、git diff-checkもPASSした。post-fix auditのresidualはP0 / P1 / P2のすべて0である。これはauthoritative **local** evidenceであり、review、merge、production commandの証拠ではない。

確定APIを含むpre-audit focused 5-file rerunはNode v22.13.0で43 / 43 PASS、Vitest 21.40秒、wall 21.73秒、maximum RSS 365,248,512 bytes、swap 0だった。内訳には三failpoint × 二signalのlocal child termination 6ケースを含む。expanded integrationは109 / 109、二回目のfull regressionは143 files・2,644 / 2,644 PASSだった。production buildも193 / 193 static page生成までPASSした。これはpublic fixed kill-drill commandやproduction gateの実行数ではない。

独立read-only再確認は2026-07-16にinput manifestのcountとhash一致を再検証した。training / selection / finalのraw parentはそれぞれ24,000 / 4,800 / 4,800、protected-IDは2,121,074 / 425,344 / 413,221で、各roleのmanifest記録と一致した。この公開evidenceにpath、hash値、private値は記録しない。これはinput同一性のread-only再確認であり、teacher generationやproduction gateの実行ではない。

その後の独立監査で検出したseverityは、preflightがP1 1件とP2 1件、kill-drillがP1 2件とP2 3件である。preflightのP1はouter capabilityのUID / home / registry anchor binding、P2は最初のapproved Aをreloaded approved/currentへ結び直すexpected-bindingである。kill-drillのP1はtemporary-root / production-home overlapとfailure cleanup、P2はchild nested path、partial-setup rollback / orphan preservation、および3点目をdurableと呼んでいたwordingである。これらのrepairとregression coverageはauthoritative post-fix local validationを通過し、residual P0 / P1 / P2は0 / 0 / 0になった。歴史的pre-audit PASS値は引き続きnonfinalとして残し、production判断もNO-GOとする。

post-fix再監査では、preflightのlock contention coverage欠落をP2として修正した。kill-drillのP2再監査は、partial capture / setup failureの`fixture_preserved`分類、anchor descriptorを全lifetime保持するというoverclaimをcanonical realpath + named `lstat`の実装範囲へ縮小する修正、global `/private/tmp` snapshotを他processと競合させないexact owned-prefix accounting、test seam failureからのinjected path非漏えいを確認した。integration P2ではexecution accountingの境界、non-atomic observation wording、package / Darwin CI source contractを固定し、kill CLIも`cases`がexact native array・exact indices / lengthであることを必須にした。preflight CLIのexact-record / privacy boundaryもP2として修正し、Proxy、accessor、extra string / symbol key、nonplain prototypeをすべて拒否するregressionを固定した。

PR #471 final reviewでは、failure、timeout、malformed IPCの経路がchildのcloseを確認しないままkill後に終了できた独立P2を追加検出した。shared close observationを導入し、全失敗経路でterminate後にcloseまでawaitするよう修正した。4件のadversarial arm / probe regressionで、child PIDが`ESRCH`になること、実際の`registry.json`をfd 3で再lockできること、process treeが150ms安定してlate writeがないことを確認した。続くtest reviewでは、最初のlock assertionが`registry.json`自体ではなくregistry directoryを対象にしていたP2も見つけ、実ファイルを対象に修正した。これらを含むrepair後のresidual P0 / P1 / P2は0 / 0 / 0である。

execution countは境界ごとに分ける。review済みpost-merge kill-drill CLIの実行は0である。一方、authoritative post-fix kill test fileの1 run内ではfixed zero-argument ownerを2回呼び、complete six-case drillを3回完了し、local successful caseは18だった。distinct failpoint/signal classは6のままで、production caseは0である。追加したfailure-path child-reap regressionは1 runあたり4件であり、complete drill、successful local case、production caseのいずれにも加算しない。歴史的なpre-audit local case 6はこの18とは別に残し、24としてauthoritativeに合算しない。

## 11. production countersとnonclaims

この記事の範囲では次がすべて0である。

- real production preflight command、reviewed disposable kill-drill command、production process-death case、production registry provision
- prefix-100、prefix-500、final-24,000 gate
- real teacher process、teacher label、checkpoint finalization、optimizer step、training run
- candidate weight、formal A/B、live activation、external rank observation

したがってrunOp1は変更せず、棋力が上がった、安定して高段になった、production recoveryが完成したとは主張しない。source/test PASSもproduction executionへ数えない。

歴史的pre-audit focused testではdisposable childのSIGTERM/SIGKILLを6 local case観測した。authoritative post-fix kill test file runは別に18 local successful caseを観測したが、review済みpost-merge CLIは0、production caseも0である。これらをproduction counterへ混ぜず、歴史6はnonfinal、post-fix 18をauthoritative local aggregateとして別々に記録する。

## 12. 次のexactly-once工程

PR #471はready / openである。今回のfinal review repairだけがlocalでcommit、push、re-CI待ちであり、PR全体を未commit / 未pushとは扱わない。このrepairを反映してCIとreviewを通し、通常mergeした後のreview済みHEADで次の順序を守る。

1. fixed disposable kill-drillを一度実行し、sanitized success receiptを記録する。
2. fresh production one-shot ownerが共通outer lockを取得する。
3. 同じlock保持中にprivate zero-work preflightを再実行する。
4. 必要な全checkとterminal revalidationがpassしたらprefix-100をexactly onceで実行する。
5. nonzero、signal、timeout、receipt不一致なら自動retryせずSTOPする。
6. 成功時もexact 100件のread-only postflightを行って停止する。

prefix-500、24,000、training、candidate selection、formal A/B、外部校正、live activationはこの順序の後に別々の証拠とreviewを必要とする。
