# production実行アプリをexact sourceへ固定する — Floodgate v7

> PR #479は通常のmerge commit `4c71e664dae67ccd4afdb369a666bcdb4d4bbb37`で統合された。しかし統合後の独立棚卸しで、verifierは固定されていても、**production commandを実行するアプリケーションsourceそのものが固定されていない**というP1 blockerが見つかった。このPR #480候補（PR番号、実装head、validation、CI、review、mergeはいずれもPENDING）は、その穴をexact-clean Git closure、create-only registry V2、outer-gate receipt V3で閉じる。production registry、gate、teacher、label、training、selection、正式A/B、外部校正、live activationは実行しておらず、live weightとrunOp1は変更していない。English version: [blog-shogi-floodgate-v7-production-application-source-provenance.en.md](./blog-shogi-floodgate-v7-production-application-source-provenance.en.md)

## 1. 結論と現在地

今回必要なのは、強い棋譜からの再学習を始めることではなく、**どのsourceがproduction dataを作ったかを後から再現できる状態にすること**だった。ここが曖昧なまま24,000件の教師を生成すると、教師、checkpoint、候補weightの出自を固定できず、棋力が上がっても安全に採用できない。

この候補は固定application worktreeを次の一か所に限定する。

```text
~/.codex/worktrees/shogi-floodgate-v7-production-application
```

そこからexact cleanな40桁Git revisionを取得し、private registryへ一度だけ固定する。以後のmutationは、そのregistry bindingと現在のtracked source bytes / modesが一致した場合にだけ先へ進む。

ただし、これはまだ**候補実装**である。local validation、GitHub CI、review、通常mergeはPENDINGで、固定worktreeのmerge revisionへのalignmentもregistry provisionも行っていない。現時点のproduction開始判定は明確に**NO-GO**である。

## 2. #479後に見つかったP1 blocker

#479はprefix-100、prefix-500、final-24000、training-label finalizationの4用途を共通OS lockとpurpose-bound durable leaseで直列化した。だが、その境界が検査していたのはregistry、key、verifier、leaseであり、Nodeが読み込む現在のapplication treeは実行時のcurrent working directoryに依存していた。

そのため、固定verifier revisionが正しくても、別checkout、古いcheckout、dirty sourceからgateを起動できる余地があった。receiptにもapplication revisionが結び付いていないので、「同じ入力と同じ実装を使った」というproduction provenanceを証明できない。これは棋力以前のP1 blockerであり、create-only registryを作る前に閉じる必要がある。

## 3. registry record V2へsource bindingを一度だけ固定する

新しいprivate registry contractは`shogi-floodgate-v7-production-connector-registry-record-v2`で、次のsource bindingをcanonical recordへ含める。

```json
{
  "layout": "fixed-current-euid-userinfo-home-production-application-v1",
  "revision": "<exact-clean 40 lowercase hex Git object id>"
}
```

provisionerは固定application worktreeを検査し、current key、entropy、create-only installより前にbindingを取得する。installerはstaged write、fsync、no-clobber hard link、directory fsync、reopen、postflight revalidationを行い、既存registryをadopt、overwrite、rotateしない。

旧record V1は厳密にparseして状態を確認できるが、current production capabilityもmutation authorityも発行しない。V1からV2への自動migration、既存recordの上書き、adoptはない。現在はregistry自体をまだ作っていないため、V2 provisionはmerge後の別の明示的な運用工程である。

## 4. mutation前の厳密な順序

4つのmutation purposeは、次の順序を共通にする。

```text
registry file descriptorを開いたままOS lifetime lockを取得
  -> lock中のcanonical V2 bytesからapplication source bindingを読む
  -> 固定application worktreeのexact HEAD、tracked bytes、tracked modes、clean statusを検査
  -> held / named registryのbytes、SHA-256、device、inodeを再検証
  -> control namespace / authenticated lease / operationへ進む
```

source revision、tracked byte、mode、clean status、registry anchorのどれかが一致しなければ`application-source` phaseでfail closedする。この失敗経路ではcontrol directory creation、active lease publication、gate operation、checkpoint、label finalizationはすべて0で、`authenticated_lease_published`もfalseのままである。

source確認中もregistry file descriptorとOS lockを保持し、確認後に同じregistry anchorを再検証する。これにより「検査したregistry」と「mutation authorityに使うregistry」が途中で入れ替わる単純なraceを拒否する。

## 5. public outer receipt V3とprivate persisted lease V2

public outer receiptは`shogi-floodgate-v7-production-outer-gate-lease-v3`へ上がり、次の3点を成功条件として追加する。

- locked registryからapplication source bindingを読んだ
- persistent mutation前にexact-clean application source closureを検査した
- source検査後、mutation前にregistry anchorを再検証した

一方、既存のcrash evidenceとreconciliation semanticsを不必要に変えないため、private persisted HMAC lease recordはV2のまま維持する。public receiptのversionとdisk上のprivate lease formatを同じものとして扱わない。

public receipt、connector receipt、training-label receiptはapplication sourceのrevision、path、digestを公開しない。private registry bytesとheld-lock comparisonの中だけで照合する。

## 6. stale checkoutからのCLI起動も拒否する

対象production CLIはNode `v22.13.0`、引数なし、`node -r tsx/cjs`、固定application rootと一致するcurrent working directory、exactなentrypoint path、`require.main.filename`を要求する。別checkoutや古い作業treeから同じscript名を実行しても、production moduleを遅延loadしてauthorityを作る前に失敗する。

引数なしのread-only source readiness inspectorも追加する。これは固定worktreeのpoint-in-time exact-clean closureを観測するだけで、registryの作成・読込・更新、gate authority、checkpoint、teacher label、training、weight、match、棋力を一切claimしない。出力にもrevision、path、digestを含めない。

## 7. prefix-100 preflight V3で再照合する

provision時のsource successを将来の実行authorityとして再利用しない。fresh prefix-100 read-only preflight V3はcommon OS lock中にprivate registry V2をclaimし、現在のexact-clean application bindingと再照合してからverifier、runs namespace、deployment key、approved/current bindingを確認する。

preflightの`GO`は**read-only core preconditionsをその時点で観測した**という意味だけで、gate invocationをauthorizeしない。receiptは再利用できず、source mismatchはsanitized `NO-GO`となる。preflight自体はnamespaceやfile contentを変更しない。

## 8. このclosureが保証しないこと

境界を強くしても、次はclaimしない。

- 同じUIDで動く任意のhostile processからの完全な隔離
- ignored / untracked content、特に`node_modules`のbyte closure
- 検査の合間に変更され、検査前後で完全に元へ戻された一時的改変の検知
- filesystem全体のatomic snapshot
- readによるaccess timeを含む全metadataの不変
- V1 registryの自動migration、reconciliation、削除、adopt、overwrite
- source readinessだけによるregistry、gate、human approval、棋力の権限

tracked Git entriesはfull bytesとmodeを検査するが、これはOS-level sandboxやsame-UID adversary isolationではない。残る前提と非保証を隠さず、production approval時の判断材料として残す。

## 9. validationはまだPENDING

この記事作成時点では、結果を先取りしない。

| 検査                                                | 状態    | 確定値  |
| --------------------------------------------------- | ------- | ------- |
| focused source / registry / outer / preflight tests | PENDING | PENDING |
| related production regression tests                 | PENDING | PENDING |
| full Vitest                                         | PENDING | PENDING |
| TypeScript / lint / Prettier                        | PENDING | PENDING |
| production build                                    | PENDING | PENDING |
| ML stdlib / npm audit                               | PENDING | PENDING |
| GitHub CI                                           | PENDING | PENDING |
| review / unresolved threads                         | PENDING | PENDING |
| regular merge                                       | PENDING | PENDING |

最終数値はexact validation revisionが確定した後に更新する。途中の一部testを、全体PASSやproduction readinessとして書き換えない。

## 10. productionと棋力の実行数はすべて0

この変更でのproduction command、registry provision、kill drill、prefix-100 / 500 / final-24000 gate、teacher generation、label finalization、training、optimizer step、candidate selection / promotion、正式A/B、外部校正、weight overwrite、live activationはすべて0である。

runOp1はcurrent evaluatorかつrollback evaluatorのままで、live weightは変わっていない。したがって、このsource provenanceを「強くなった」「高段になった」という証拠には数えない。これは、その後に得る棋力証拠を信用できるようにする安全基盤である。

## 11. 次に進む順序

安全な順序は次で固定する。

1. このapplication-source provenance候補をvalidation、reviewし、通常mergeする
2. 次PRでoperator guardsを完成させる（approved-current-binding CLIのexact invocation、standalone verifier readiness）。reconciliation authorityはまだ実装しない
3. 固定application worktreeをこのPRのmerge revisionへ、固定verifier worktreeを`e8a9197608cb48b1160b6707d97b0c4f78f90a1d`へalignする
4. create-only registry V2を一度だけprovisionする
5. reviewed disposable kill drillを行う
6. fresh standalone read-only preflightを行う
7. prefix-100をexactly once実行し、STOP、独立evidence review、結果を理解したhuman approvalを待つ
8. prefix-500を実行し、STOP、review、human approvalを待つ
9. sealed final-24000、terminal evidence確認、training-label finalizationへ進む
10. 再学習、候補選抜、192 color-swapped pairs / 384 gamesの正式A/B、200 gamesの外部校正を行う
11. safety、品質、棋力、rollback rehearsalの全gateを通過した場合だけliveを検討する

stale、quarantine、indeterminate stateが見つかった場合はSTOPし、retryや次gateへ進まない。reconciliation authorityが未実装の状態を、過去の包括的な許可で飛び越えない。

## 12. 現時点の判断

P1の原因は評価関数そのものではなく、教師生成へ入る前のproduction application provenanceが閉じていなかったことだった。この候補はその穴を具体的に塞ぐが、validationとmergeが終わるまではproduction application worktreeのalignmentもregistry provisionも**NO-GO**である。

[機械可読証拠](./data/floodgate-v7-production-application-source-provenance-2026-07-16.json)は、確定事項、PENDING、production 0、nonclaim、次の停止点を分けて記録する。
