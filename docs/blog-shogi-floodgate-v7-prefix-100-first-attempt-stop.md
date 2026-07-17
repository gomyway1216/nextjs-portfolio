# prefix-100初回を安全に停止し、部分checkpointを保全する — Floodgate v7

> [PR #483](https://github.com/gomyway1216/nextjs-portfolio/pull/483)は全checkを通過し、通常のmerge commit `9ddcc032329a4a9f3931494f2348c10d9fe2d696`で統合された。そのmergeへ固定applicationを合わせた後、application source、connector verifier、approved/current bindingのreadiness、create-only registry provision、6-case kill drill、fresh preflightはすべてPASSした。そこでprefix-100をexactly onceで1回だけ開始したが、1,597秒後にsuccess receiptなしで安全に停止した。sanitized failure v2は`phase = runner`を公開したものの、これは有効な`outer-gate-lock`のtrue/true tupleをCLIが誤って拒否した投影不具合であり、実際の原因phaseを証明しない。独立したread-only auditは、認証済みstale active lease、認証済み完全record 4件（header 1件 + parent 3件）、torn tailなし、milestone / sealなし、残存process 0を確認した。その後の同一構成read-only再現では候補12件中7件が0.8〜244.9秒で成功し、5件が約600.0秒でpool-wide rejectとなった。incident revisionのpoolはtrigger errorを捨てたためtyped原因とtrigger parentは未確定だが、固定10分timeout境界は実測再現できた。retry、cleanup、quarantine、resume、教師生成、学習、weight変更、live activationはすべて0で、production判断は**STOP**である。English version: [blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.en.md](./blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.en.md)

> **2026-07-17更新:** 投影修正の[PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484)は、最終head `e9451cb2e3e673ce930f9a40645d1aecb9f8df3f`で全checkとreview対応を完了し、通常のmerge commit `1c5ec24a8c3a9ad9871bef1621034113112396b5`で統合された。ただし、この修正をproduction incident stateに対して実行していない。[PR #486](https://github.com/gomyway1216/nextjs-portfolio/pull/486)の旧recovery入口はgreen CI後の独立監査で循環bootstrapが見つかったため削除され、[非運用の復旧設計契約](./blog-shogi-floodgate-v7-production-recovery-operator-foundation.md)へ縮小された。package command、JXA、`tsx/cjs` preload、source authorizer、production issuer、CLIは存在せず、固定markerは`UNAVAILABLE / STOP`である。production stateのinspection、reconciliation、retry、cleanup、quarantine、resumeは実装も実行もしていない。

> **同日追加:** 安全なstable-WASM failure kind伝播の[PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485)も、最終head `6a804a7954a9685361944aeb2be32494638fae2e`で全checkとreview対応を完了し、通常のmerge commit `4b46fd3761512f38bada4c7c23537a969349a804`で統合された。同じ12件のread-only診断はそのexact final headでmerge前に開始し、merge中も継続した。7件が成功し、5 rejectは全てgenuine `search-timeout`、`timeout_ms = 600000`を受けた。この証拠を記録した[PR #487](https://github.com/gomyway1216/nextjs-portfolio/pull/487)も、最終head `cb3fd9697a8d5dfc5402c0a73b2a1e110a6adbff`を通常のmerge commit `bf643ceedb78c5103019609f7991f1a9f9664fef`で統合済みである。ただしこれはpost-merge deployment開始の証拠ではなく、5件の個別timeoutやincident attempt自体のtyped原因を後付けで証明しない。

## 1. 結論

prefix-100は成功していない。一方で、単に「何も起きなかった」のでもない。固定production connectorは実際に呼ばれ、checkpointへheader 1件とparent 3件の完全な認証済みrecordが残った。100件milestoneとsealは存在しないため、この部分状態を100件成功、教師data、または再開許可として扱うことはできない。

| 判断対象                    | 確定結果                             |
| --------------------------- | ------------------------------------ |
| prefix-100 attempt          | 1回、exactly once                    |
| 経過時間                    | 1,597秒                              |
| success receipt             | なし                                 |
| 完全な認証済みrecord        | 4件 = header 1件 + parent 3件        |
| torn tail                   | なし                                 |
| prefix-100 milestone / seal | なし / なし                          |
| public retry disposition    | `checkpoint-reconciliation-required` |
| retry / cleanup / resume    | 0 / 0 / 0                            |
| live evaluator              | weight変更なし、activationなし       |
| 現在の運用判断              | **STOP**                             |

停止後に同じcommandを再実行していない。active leaseと部分checkpointは事故の証拠であり、review済みreconciliation authorityがない状態で消去、隔離、編集、再利用しない。

## 2. prefix-100までに通過したgate

NSNumber修正を通常mergeしただけでproductionを開始したわけではない。固定revisionへ合わせた後、相互に役割の異なるgateを順番にfresh実行した。

| gate / delivery                    | 結果          | 境界                                                           |
| ---------------------------------- | ------------- | -------------------------------------------------------------- |
| NSNumber fix PR                    | PASS / MERGED | #483、regular merge `9ddcc032329a4a9f3931494f2348c10d9fe2d696` |
| application-source readiness       | PASS          | fixed application sourceをfresh検査                            |
| connector-verifier readiness       | PASS          | fixed verifier closureをfresh検査                              |
| approved/current-binding readiness | PASS          | approved recordとcurrent keyのexact bindingをfresh検査         |
| immutable registry V2 provision    | PASS          | create-only、postflight PASS                                   |
| prefix-100 kill drill              | PASS          | 3 failpoints × SIGTERM / SIGKILL = 6 cases                     |
| prefix-100 fresh preflight         | PASS          | persistent mutationなし、gate invocationなし                   |
| prefix-100 durable execution       | **STOPPED**   | 1,597秒、success receiptなし                                   |

readiness、provision、kill drill、preflightのPASSは、各gateが検査した範囲の証拠である。それらは、その後の長時間operationが必ず完走する証明でも、partial checkpointを自動再開してよいauthorityでもない。

## 3. sanitized failureが示したこと

公開されたfailureはprivate path、実行識別子、key、digest、局面、parent識別子、生のengine errorを含まない。公開してよい固定fieldだけでは、次が確定した。

| sanitized field               | 値                                                       |
| ----------------------------- | -------------------------------------------------------- |
| contract                      | `shogi-floodgate-v7-production-connector-cli-failure-v2` |
| public phase                  | `runner`                                                 |
| connector invoked             | `true`                                                   |
| checkpoint may have persisted | `true`                                                   |
| retry disposition             | `checkpoint-reconciliation-required`                     |
| exact-prefix postflight       | `false`                                                  |

ただし、`public phase = runner`を根本原因として読んではならない。外側lease ownerから返る安全な`outer-gate-lock` failureは、operationが始まりcheckpointが残り得る場合に`connector invoked = true`、`checkpoint may have persisted = true`を持つ。incident revisionのCLI sanitizerはこの有効なtrue/true tupleを`outer-gate-lock`として受理せず、unknown fallbackの`runner`へ落とした。この投影不具合により、公開結果から正確な内側phaseを区別できなかった。

これは失敗を成功へ変える不具合ではない。success receiptを出さずSTOPしたfail-closed判断は正しい。[PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484)の最終head `e9451cb2e3e673ce930f9a40645d1aecb9f8df3f`は、operation前のfalse/false tupleとoperation後のtrue/true tupleだけを`outer-gate-lock`として受理し、nested fieldを持つ不正shapeは引き続きgeneric failureへ落とす。final-headのGitHub CI、Security Audit、Vercel checkはすべてPASSし、3件のreview threadはすべて対応・resolveされた。PRは通常のmerge commit `1c5ec24a8c3a9ad9871bef1621034113112396b5`で統合済みである。ただし、このmerge済み修正をproduction incident stateに対して実行していない。また、この修正が復元するのは安全な外側phaseまでであり、今回のexact inner phaseは依然未確定である。

## 4. 停止後の独立read-only audit

production stateを変更しない独立auditは、認証とfilesystem metadataから次だけを確認した。private値やrecord内容は記事へ出していない。

| state                          | read-only observation |
| ------------------------------ | --------------------- |
| active lease                   | 認証済み、stale       |
| recorded owner process         | 不在                  |
| common OS lifetime lock        | free                  |
| quarantine / retired           | empty / empty         |
| stage work                     | exact single file     |
| complete authenticated records | 4                     |
| record composition             | header 1 + parent 3   |
| torn tail                      | false                 |
| prefix-100 milestone           | false                 |
| final seal                     | false                 |
| residual production processes  | 0                     |

`stale`は「消してよい」を意味しない。owner processが存在せずOS lockがfreeでも、active leaseは認証済みのcrash evidenceであり、stage workには認証済みpartial progressがある。read-only auditはinspectionであって、cleanup、quarantine、checkpoint resume、次gateのauthorizationではない。

## 5. 同一構成read-only再現と、まだ分からないこと

production checkpoint、lease、registryへ書かず、固定application revisionと同じstable runtime構成で、認証済み3-parent prefixの直後に当時activeになり得たindex 3〜14の12件を同時投入した。大規模入力のread-only認証・整列後、12 workerで得たsanitized結果は次のとおりである。

| input index | outcome             | elapsed seconds |
| ----------: | ------------------- | --------------: |
|           3 | generic pool poison |          ~600.0 |
|           4 | fulfilled           |           5.798 |
|           5 | fulfilled           |          93.027 |
|           6 | generic pool poison |          ~600.0 |
|           7 | generic pool poison |          ~600.0 |
|           8 | fulfilled           |         244.880 |
|           9 | generic pool poison |          ~600.0 |
|          10 | fulfilled           |           1.388 |
|          11 | fulfilled           |           0.839 |
|          12 | fulfilled           |          64.223 |
|          13 | fulfilled           |         105.684 |
|          14 | generic pool poison |          ~600.0 |

7件は正常完了し、残る5件は検索開始から固定600秒境界で同じgeneric pool-poison errorへ落ちた。これは固定10分timeout仮説を時間境界として再現する。ただしincident revisionの`poison`は最初のworker errorを破棄し、全active jobへ同じgeneric errorを配ったため、5件すべてが個別timeoutしたとはclaimできず、最初にtriggerしたparentも特定できない。安全な分類は`unknown`、時間からの推定だけが`search-timeout`である。runtime closeは成功し、残存workerは0だった。

| cause question             | 現在の状態                                       |
| -------------------------- | ------------------------------------------------ |
| stable 600-second boundary | 同一構成read-only再現でtiming一致                |
| typed worker failure kind  | `unknown`。incident revisionがtriggerを破棄      |
| exact failing inner phase  | 未確定。CLI projection bugにより公開結果から消失 |
| trigger parent             | 5件のgeneric rejectから未特定                    |
| torn checkpoint write      | 否定。torn tailなし                              |
| prefix-100 completion      | 否定。milestone / sealなし                       |

したがって「index 3 / 6 / 7 / 9 / 14がすべて個別timeoutした」「特定の1件がtriggerだった」「machine resource不足だった」とはまだclaimしない。[PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485)はraw stderrや局面を公開せず、worker境界のsafe failure kindとtimeout値をpool-wide poisonまで保持する実装を通常mergeした。

通常merge済み[PR #487](https://github.com/gomyway1216/nextjs-portfolio/pull/487)のexact-final-head診断では、12件中7件が0.855〜264.590秒で成功し、残る5件は599.997〜600.003秒でrejectされた。最初のgenuine `search-timeout`、`timeout_ms = 600000`がpool-wide poisonで5 rejectへbroadcastされたことを確認したが、5件の独立timeoutやtrigger indexは確認していない。公開commit時刻と1,704.974秒の実行時間から、run開始はmerge前、mergeはrun中、結果記録はmerge後と導出される。従ってこれは後に通常mergeされたexact final-head bytesの確認であり、post-merge deployment実行でもproduction incident stateの再inspectionでもない。historical incident attemptのclassificationは引き続き`unknown`である。

## 6. 実行していない変更

停止後は証拠保全を優先し、次のmutationとdownstream workを一度も実行していない。

| operation                              | count / state |
| -------------------------------------- | ------------: |
| prefix-100 retry                       |             0 |
| active lease cleanup                   |             0 |
| quarantine                             |             0 |
| checkpoint resume                      |             0 |
| teacher generation                     |             0 |
| label finalization                     |             0 |
| retraining / optimizer step            |         0 / 0 |
| candidate selection / promotion        |         0 / 0 |
| formal A/B / external calibration game |         0 / 0 |
| production weight overwrite            |             0 |
| live activation                        |             0 |

別管理のexact-final-head 12候補read-only診断は1回完了した。production gate invocation、incident-state mutation、post-merge deploymentから開始した診断はすべて0である。

live weightsは変更していない。したがって今回の実行は棋力を変えておらず、「強くなった」「高段へ到達した」という証拠も作っていない。

## 7. なぜ自動retryしないのか

partial checkpointがある状態で同じexactly-once commandをもう一度呼ぶと、少なくとも次のどれかを誤って扱う危険がある。

1. stale active leaseを自動削除し、失敗境界の証拠を失う
2. 既存の3 parent recordを無視して重複workを作る
3. 未完成checkpointを完成済みmilestoneと誤認する
4. 根本原因を残したまま同じtimeoutへ再到達する
5. outer lease、inner stage、checkpointのreconciliationを別々のauthorityで進める

現在のproduction入口には、この実stateを安全に解決するreview済みの固定operator flowがない。filesystemを手作業で編集すること、active leaseを削除すること、別commandでstageを再利用することは代替にならない。availabilityより、認証済みevidenceとexactly-once境界を優先する。

さらにV3 headerは、stable / teacher runtime receiptのhashと、worker数、search timeout、depth、sourceなどのrun bindingをHMACで認証する。このため再現調査や修正でいずれかのbytes / configを変えた場合、既存3-parent partialをresumeできず、review済みquarantineの後に別承認のfresh runが必要になる。同一bytes / configなら構造上はresume候補になり得るが、同じtimeoutが再発する危険が残り、それだけでresume authorityにはならない。private hashやbinding値は公開しない。

## 8. 安全な次の順序

1. 現在のactive leaseとstage workをそのまま保全し、retry、cleanup、quarantine、resumeを行わない
2. 通常merge済み[PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484)をdiagnostic prerequisiteとして固定する。ただしproductionで未実行のため、incident stateのfresh observationを得たとは扱わない
3. 通常merge済み[PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485)をsafe failure-kind prerequisiteとして固定する。ただしproductionで未実行のため、過去のgeneric rejectionをtyped原因へ読み替えない
4. exact final headで同じ12件のread-only診断を開始する（完了。通常merge前に開始）
5. 同じfinal headをrun中に通常mergeし、merge後に最初のsafe kindとtimeout値を記録する（完了。`search-timeout` / 600,000 ms）
6. [非運用契約PR #486](https://github.com/gomyway1216/nextjs-portfolio/pull/486)の新headをfull test、final-head CI、独立review、通常mergeへ通す。ただしoperatorとして配備・実行しない
7. 4 / 6 / 8 / 12 workersのtail latency、timeout、throughputを同じread-only入力で比較し、単純なtimeout延長やblind retryではなく、原因と品質境界を両立する構成を選ぶ
8. 根本原因が確定した場合だけ修正し、timeout、cancellation、partial checkpoint、再開境界の回帰testを通す。worker数、timeout、depth、runtime receiptまたはsource bindingが変わる修正なら、既存partialのresumeを禁止する
9. repository外launcher、approved commit / tree enrollment、no-preload bundle、owner / mode / Git-dir closureを別PRで実装する
10. 外部trust rootのreview・CI・通常merge後にだけ、zero-argument read-only inspectorを別PRで実装する
11. inspectorのfinal-head CI、独立review、通常merge後にだけread-only inspectionを1回実行する。fresh evidenceが一致した場合だけ明示reconciliationを検討する
12. outer leaseとinner stage/checkpointを同じprocessで再検査するreconciliation flowを別途実装し、resumeまたはquarantine後のfresh restartには明示的な人間確認を要求する
13. exact-100がpostflightまで成功しても一度STOPし、独立reviewとinformed human approvalの後だけ500、final-24,000へ進む
14. 完全な教師dataの生成と確定後にのみ再学習、候補選抜、正式A/B、外部校正を行い、安全性、品質、棋力、rollback証拠が揃った場合だけlive activationを検討する

途中のfresh inspectionが不一致、認証不能、indeterminate、または新たなquarantineを示した場合はSTOPする。速度を理由にこの順序を飛ばさない。

## 9. 現時点の判断

launcher fixとproduction readiness chainは通過したが、最初のdurable prefix-100は1,597秒でsuccess receiptなしに停止した。認証済みparent 3件は実progressである一方、100件milestoneでも棋力証拠でもない。さらにpublic `runner` phaseはprojection bugによるfallbackである。同一構成read-only再現は固定600秒境界を再現したが、incident revisionのpoolがtrigger errorを捨てたためtyped原因とtrigger parentはまだ確定していない。

したがって現在は**STOP**である。diagnostic projectionはPR #484、安全なworker failure kind伝播はPR #485で通常mergeされた。exact-final-head 12候補診断はmerge前に開始してmerge中も継続し、最初のpool failure kindが`search-timeout`であることまで前進したが、production incident stateでは実行していない。PR #486は実行経路もissuerもない`UNAVAILABLE / STOP`契約へ縮小された。次の有効な前進はretryではなく、4 / 6 / 8 / 12 worker比較、repository外trust root、read-only inspector、review済みreconciliationを別々のgateとして完成させることである。[機械可読証拠](./data/floodgate-v7-prefix-100-first-attempt-stop-2026-07-16.json)は、停止したattempt、partial state、2回のread-only診断、正確な時系列、zero mutation、nonclaimを分離して記録する。
