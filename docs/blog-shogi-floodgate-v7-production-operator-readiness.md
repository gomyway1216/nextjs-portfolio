# production operator readinessを独立CLIで確かめる — Floodgate v7

> [PR #481](https://github.com/gomyway1216/nextjs-portfolio/pull/481)は、production application source provenanceを通常のmerge commit `67ccd9b8c49392132fdffaa625468ac1d128a5d5`で統合した。今回の候補は、その基盤上でapproved/current bindingと固定verifierのstandalone readinessをnative exact launchへ追加し、production evidence launcherをexactly 10用途へ広げる。[PR #482](https://github.com/gomyway1216/nextjs-portfolio/pull/482)をreview-readyで作成したが、まだ未mergeであり、最終headのGitHub CI / reviewもPENDINGである。統合後のrevision alignment、production command、registry provision、教師生成、再学習、候補選抜、正式A/B、外部校正、live activationはすべて未実行である。English version: [blog-shogi-floodgate-v7-production-operator-readiness.en.md](./blog-shogi-floodgate-v7-production-operator-readiness.en.md)

## 1. 結論

PR #481で「どのapplication sourceがproduction evidenceを作るか」を固定できる基盤が入った。しかし、安全にcreate-only registryを作るには、operatorが次の2条件を、それぞれ独立したread-only commandとしてfreshに確認できる必要がある。

- 固定connector verifierのrevision、tracked source closure、pinned receipt closureが一致する
- human-approved deployment-key recordとfresh current keyがexact 8-field bindingで一致する

今回の候補は、この2つをstandalone CLIにし、既存8用途と同じnative launcher、fixed application entrypoint、redacted receipt境界へ入れる。readiness successは、その時点のread-only observationであり、registry、gate、reconciliation、teacher、training、live activationのauthorityではない。

この候補はまだ未mergeである。固定production application worktreeをPR #481のmerge commitだけへ合わせても、新しい2 CLIは存在しない。operator-readiness PRが通常mergeされた後、その**operator-readiness PR自身のmerge commit**へalignするまでproductionは明確に**NO-GO**である。

## 2. native launcherのexactly 10用途

tracked JXA launcherとNode側attestationは、purposeとentrypointのexact bijectionを共有する。operatorは10個のallowlisted purposeから1つを選べるが、allowlist外purposeや、そのpurposeから切り離したcaller-selected entrypointは渡せない。

| class                        | purpose                              | fixed entrypoint                                                     |
| ---------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| read-only                    | `application-source-readiness`       | `ml/inspect-floodgate-v7-production-application-source.ts`           |
| read-only                    | `approved-current-binding-readiness` | `ml/inspect-floodgate-v7-approved-key-current-binding.ts`            |
| read-only                    | `connector-verifier-readiness`       | `ml/inspect-floodgate-v7-production-connector-verifier-readiness.ts` |
| read-only                    | `prefix-100-read-only-preflight`     | `ml/inspect-floodgate-v7-production-prefix-100-preflight.ts`         |
| disposable safety drill      | `prefix-100-disposable-kill-drill`   | `ml/run-floodgate-v7-production-prefix-100-kill-drill.ts`            |
| mutation-capable             | `durable-prefix-100`                 | `ml/run-floodgate-v7-production-connector-prefix-100.ts`             |
| mutation-capable             | `durable-prefix-500`                 | `ml/run-floodgate-v7-production-connector-prefix-500.ts`             |
| mutation-capable             | `sealed-final-24000`                 | `ml/run-floodgate-v7-production-connector-final-24000.ts`            |
| mutation-capable             | `training-label-finalization-24000`  | `ml/run-floodgate-v7-training-label-production.ts`                   |
| create-only mutation-capable | `production-registry-provision`      | `ml/provision-floodgate-v7-production-connector-registry.ts`         |

内訳はmutation-capable 5、read-only 4、disposable safety drill 1で、合計10である。launcherは固定Node `v22.13.0`、`-r tsx/cjs`、exact entrypoint、引数なし、minimal child environmentへ固定する。これはnative toolのbyte-digest closure、atomic process-lineage snapshot、same-UIDまたはancestor hostile processからの完全隔離をclaimしない。

## 3. coreをloadする前の順序

JXAはattested production child Nodeが存在する前に評価され、その子専用のminimal environmentとone-shot attestation pipeを作る。子Node内でstandalone operator CLIが進む順序は、次で固定する。

```text
required Node versionと引数なしargvを検査
  -> exact purpose / entrypointのnative launcher attestationを一度だけclaim
  -> fixed production application entrypoint contextを検査
  -> readiness core moduleを初めてlazy load
  -> core receiptをexact allowlistで検査
  -> public successまたはfailureを固定schemaから再構築
```

つまり、readiness coreがlauncher attestationやapplication entrypoint contextより先に評価される経路を作らない。direct Node、別purpose、別entrypoint、追加argument、別Node version、attestation再利用はfail closedする。

この順序は「readiness coreのload前」を保証する境界であり、npmやinvoking ancestor processをtrusted application childとして扱うものではない。invoking shell、npm、`osascript`はclean childを作る前の呼出元environmentを見得る。保証対象はJXAが新しく組み立てたattested child environmentである。PR #481で入ったnative pre-child boundaryとapplication-source foundationを前提に、その上へ2つのoperator checkを追加する。

## 4. strict success / failure projectionとprivacy

2つのCLIはcoreから返ったobjectをそのままJSON化しない。proxy、accessor、余分・不足key、異なるprototype、異なるconstant、誤ったbooleanを拒否し、期待するown enumerable plain-data fieldだけを検査する。成功時も既知の値からpublic receiptを新しく組み立てる。

`approved-current-binding-readiness`の成功は、approved record validation、fresh current-key inspection、exact binding match、held descriptor revalidation、memory-only comparisonを示す。一方で、approval record / key contentの作成・書換えやnamespace entryの変更、single-use capability、run / stage / connector / checkpoint authority、dataset、teacher label、training、weight、match、棋力を示さない。readに伴うatime不変は別途nonclaimのままである。

`connector-verifier-readiness`の成功は、固定current-EUID homeに基づくrepository root、固定verifier revision、pinned receipt Git closure、closure receiptをread-onlyで検査したことを示す。external role-bundle filesの読込やfull verifier run、gate / registry / connector authorityを示さない。

失敗はnonzero exitと固定のsanitized failure receiptへ畳み込む。raw exception、path、Git revision、digest、numeric EUID、home directory、key identity material、private registry valueは出力しない。success / failureのどちらもproduction managed namespace / file contentの変更とreconciliationを行わず、そのauthorityを発行しない。readに伴うatimeまで不変であるとはclaimしない。

さらに成功・失敗の両receiptは、`reconciliation_performed`、`reconciliation_authority`、`ignored_untracked_dependency_bytes_verified`、`same_uid_race_isolation`、`atomic_source_snapshot`、`tool_byte_closure_verified`、`atomic_process_lineage_snapshot`、`same_uid_or_ancestor_hostile_process_isolation`、`production_managed_namespace_or_file_content_mutation_performed`、`atime_invariance`をすべて`false`として固定する。readiness成功を、ignored dependencyを含むbyte closure、atomic snapshot、same-UID / ancestor adversary隔離、atime不変へ拡張解釈しない。

## 5. reconciliation authorityは意図的にない

この候補はreconciliationを実装しない。既存のproduction manual inspect、quarantine confirmation、cancel reconciliation exportは、fixed-origin operator entrypointとpolicyが別途reviewされるまで常時拒否のままである。test-only state machineが存在してもproduction authorityにはならない。

stale、quarantined、indeterminateなproduction stateをreadiness failureで見つけた場合は**STOP**する。自動修復、削除、上書き、adopt、rotation、retry、次gateへの進行はしない。過去の包括的な許可も、未実装のreconciliation authorityを代替しない。

## 6. validationとdeliveryの現在地

operator-readiness実装はexact commit `947f6e547039a62c17d74e08d1102af26dc46903`へ固定した。下のlocal validationはその実装commitに対して実行した。この記事とJSONは後続のevidence commitであり、実装revisionの測定対象には含めない。PR #482はreview-readyでOPENだが、このPR-state更新を含む最終headのGitHub CI、review、通常mergeはPENDINGであり、先取りしない。

| gate / 検査                           | 状態    | exact結果                                                                                         |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| PR #481 application-source foundation | MERGED  | regular merge `67ccd9b8...`                                                                       |
| operator-readiness implementation     | PASS    | `947f6e547039a62c17d74e08d1102af26dc46903`                                                        |
| focused launcher + 2 standalone CLI   | PASS    | 3 files / 57 tests                                                                                |
| full Vitest                           | PASS    | 166 / 166 files、3,057 / 3,057 tests、Vitest 319.41秒、wall 319.81秒、最大RSS 2,376,368,128 bytes |
| full-suite resource boundary          | PASS    | 8 workers、swap 0、block input / output 0                                                         |
| production build                      | PASS    | wall 27.59秒、最大RSS 2,641,051,648 bytes、swap / block I/O 0                                     |
| TypeScript                            | PASS    | `tsc --noEmit`、wall 2.85秒、最大RSS 1,146,142,720 bytes                                          |
| full ESLint                           | PASS    | errors 0、既存warnings 157、wall 27.27秒、最大RSS 2,041,626,624 bytes                             |
| ML stdlib / npm audit                 | PASS    | 58 / 58 tests、wall 0.48秒 / vulnerabilities 0、wall 0.52秒                                       |
| Prettier / JXA syntax / JSON          | PASS    | changed files、`osacompile -l JavaScript`、JSON parse / 10-purpose mapping parity                 |
| independent final audit               | PASS    | P0 / P1 / P2 = 0 / 0 / 0                                                                          |
| operator-readiness PR                 | OPEN    | [#482](https://github.com/gomyway1216/nextjs-portfolio/pull/482)、review-ready                    |
| final-head GitHub CI / review         | PENDING | このPR-state evidence更新をpush後に判定                                                           |
| regular merge                         | PENDING | final headの全gate通過後                                                                          |
| production alignment / commands       | BLOCKED | mergeとfresh checks前はNO-GO                                                                      |

buildはexit 0で完了した。既存のbuild-time Firebase初期化抑止とdynamic route fallbackの診断logは出たが、compile、TypeScript、193 page generation、最終optimizationは完了している。full lintの157件は既存warningで、errorは0だった。

## 7. productionと棋力のカウンタ

この候補でproduction application alignment、verifier alignment、source readiness、verifier readiness、approved/current binding check、registry provision、kill drill、prefix-100 / 500 / final-24000、teacher generation、label finalization、training、optimizer step、candidate selection / promotion、正式A/B、外部校正、weight overwrite、live activationを実行した回数はすべて0である。

production managed stateはこの記事のためにfresh観測していない。live weightもrunOp1も変更していない。この変更はoperator evidenceを安全に得る境界であって、「評価関数が強くなった」「安定して高段になった」という棋力証拠ではない。

## 8. merge後の安全な順序

1. operator-readiness候補をexact commitへ固定し、integrated local validation、GitHub CI、独立reviewを通して通常mergeする
2. 固定production application worktreeを**このoperator-readiness PR自身のmerge commit**へalignする
3. 固定verifier worktreeを`e8a9197608cb48b1160b6707d97b0c4f78f90a1d`へalignする
4. fresh standalone application-source readinessを実行する
5. fresh standalone connector-verifier readinessを実行する
6. fresh standalone approved/current binding readinessを実行する
7. provisioner内でsource、verifier、approved/current bindingをすべて再検査し、その同じfail-closed invocationだけでregistry V2をcreate-only provisionする
8. reviewed disposable kill drillとfresh read-only prefix-100 preflightを順に実行する
9. prefix-100をexactly once実行してSTOPし、独立evidence reviewと結果を理解したhuman approvalを待つ
10. その後もprefix-500、sealed final-24000、label finalization、再学習、候補選抜、正式A/B、外部校正をそれぞれのstop gate付きで進める
11. safety、品質、棋力、rollback rehearsalの全証拠が揃った場合だけlive activationを検討する

standalone readiness receiptを将来のauthorityとして再利用しない。provisionerがfreshに再検査すること、既存registryをadopt / overwrite / rotateしないことがcreate-only boundaryの一部である。

## 9. 現時点の判断

PR #481のsource foundationはmergedだが、operator-readiness候補はまだmergeされていない。したがってproduction alignmentとcreate-only provisionは**NO-GO**、棋力は**未評価**である。今回の前進は、教師生成へ進む前に「正しいapplication、正しいverifier、正しいapproved/current key bindingを見た」というread-only evidenceを、private値を漏らさず独立に得られるようにすることだ。

[機械可読証拠](./data/floodgate-v7-production-operator-readiness-2026-07-16.json)は、確定済みのPR #481、未確定のcurrent delivery、10-purpose mapping、zero counters、nonclaims、merge後の順序を分けて記録する。
