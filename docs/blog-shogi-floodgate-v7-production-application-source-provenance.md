# production実行アプリをexact sourceへ固定する — Floodgate v7

> PR #479は通常のmerge commit `4c71e664dae67ccd4afdb369a666bcdb4d4bbb37`で統合された。しかし統合後の独立棚卸しで、verifierは固定されていても、**production commandを実行するアプリケーションsourceそのものが固定されていない**というP1 blockerが見つかった。このplanned PR #480候補は、その穴をexact-clean tracked Git closure、pre-mutation capability、create-only registry V2、outer-gate receipt V3で閉じる。実装revision `7223c3ddb50201614f62337827be9e22211c0aff`のlocal validationと独立監査はPASSしたが、actual PR / URL、GitHub CI、review、mergeはPENDINGである。production registry、gate、teacher、label、training、selection、正式A/B、外部校正、live activationは実行しておらず、live weightとrunOp1は変更していない。English version: [blog-shogi-floodgate-v7-production-application-source-provenance.en.md](./blog-shogi-floodgate-v7-production-application-source-provenance.en.md)

## 1. 結論と現在地

今回必要なのは、強い棋譜からの再学習を始めることではなく、**どのsourceがproduction dataを作ったかを後から再現できる状態にすること**だった。ここが曖昧なまま24,000件の教師を生成すると、教師、checkpoint、候補weightの出自を固定できず、棋力が上がっても安全に採用できない。

この候補は固定application worktreeを次の一か所に限定する。

```text
~/.codex/worktrees/shogi-floodgate-v7-production-application
```

そこから40桁Git revisionを取得し、nonignored statusがcleanで、全tracked entryのbytes / modesが一致することを検査して、private registryへ一度だけ固定する。この文書でいうexact-cleanはこの**tracked closure**を指し、ignored / untracked dependency bytesを含まない。以後のmutationは、そのregistry bindingと現在のtracked source closureが一致した場合にだけ先へ進む。

ただし、これはまだ**候補実装**である。local validationはPASSしたが、GitHub CI、review、通常mergeはPENDINGで、固定worktreeのmerge revisionへのalignmentもregistry provisionも行っていない。現時点のproduction開始判定は明確に**NO-GO**である。

## 2. #479後と実装監査で見つかったP1 blocker

#479はprefix-100、prefix-500、final-24000、training-label finalizationの4用途を共通OS lockとpurpose-bound durable leaseで直列化した。だが、その境界が検査していたのはregistry、key、verifier、leaseであり、Nodeが読み込む現在のapplication treeは実行時のcurrent working directoryに依存していた。

そのため、固定verifier revisionが正しくても、別checkout、古いcheckout、dirty sourceからgateを起動できる余地があった。receiptにもapplication revisionが結び付いていないので、「同じ入力と同じ実装を使った」というproduction provenanceを証明できない。これは棋力以前のP1 blockerであり、create-only registryを作る前に閉じる必要がある。

最初の修正後にも独立監査を続け、2つの直接迂回と、test境界内の2つの具体的な派生穴を見つけた。

- CLI context checkだけでは、古いcheckoutからmutation-capable exportを直接importする経路を閉じ切れなかった
- dependency-injectedな`CoreForTests`へproduction homeまたはそのfilesystem aliasを渡すと、test-only経路がproduction namespaceへ届く余地があった
- exact production homeだけを拒否しても、そのcanonical descendantや、未存在のproduction-home descendantを指すdangling symlinkから同じnamespaceへ届く余地があった
- foreign / cloned stage leaseを拒否した後でも、そのuntrustedな`close()`をcleanupで呼ぶとproduction lease namespaceを変更できる余地があった

候補実装は、production mutation graphをloadする**前**に固定entrypointとtracked closureを検査し、module-privateなsingle-use capabilityを発行する。通常gateでは同じexact objectを`runner-entry -> outer-owner`の順に消費し、registry provisionではbootstrap capabilityをprovisionerが消費した後、入力確定までinstaller authorityを発行しない。production exportは正しいcapabilityとentrypoint contextの両方を要求する。

今回hardeningしたouter-gate、registry loader / installer / provisioner、stage / connector / training-label compositionのtest-only ownerは、明示的に渡されたtest home / optionsがproduction home、そのcanonical descendant、symlink alias（未存在のproduction-home descendantを指すdangling linkを含む）、または同じdevice / inodeを経由するaliasなら、ownerやOS lockへ入る前に拒否する。callbackから返るregistry pathと、認証済みexact test-realm lease bindingのpathだけをdownstream mutation authority前にproduction-home境界へ再照合する。foreign / cloned leaseはpropertyやpathを検査せず、`close()`も呼ばず、key / consumer / checkpoint / preflight / finalizer authorityへ進む前に拒否する。test capability / continuationはproductionとは別のWeakMap realmに置き、production objectとtest objectを相互利用できない。test-only training-label ownerの成功receiptも専用contract / status / claim boundaryを使い、outer-gate capabilityやOS lockを取得したとはclaimしない。production receiptの既存contractとtrue verificationは変更しない。ただし、任意に注入されたcallback自身の副作用を隔離するsandboxではない。これらのremediationはlocal validationと独立監査を通過したが、GitHub reviewはまだPENDINGである。

## 3. registry record V2へsource bindingを一度だけ固定する

新しいprivate registry contractは`shogi-floodgate-v7-production-connector-registry-record-v2`で、次のsource bindingをcanonical recordへ含める。

```json
{
  "layout": "fixed-current-euid-userinfo-home-production-application-v1",
  "revision": "<40 lowercase hex Git object id from exact-clean tracked closure>"
}
```

provisionerは固定application worktreeを検査し、current key、entropy、create-only installより前にbindingを取得する。installerはstaged write、fsync、no-clobber hard link、directory fsync、reopen、postflight revalidationを行い、既存registryをadopt、overwrite、rotateしない。

source bootstrap capabilityはprovisioner stageで一度消費され、そこで元objectは失効し、まだinstallerを起動できないopaque continuationへ変わる。application binding、approved/current key binding、run IDを含むexact installation inputが確定した後にだけ、**別objectのinstaller capability**をlate-armする。installerはそのdistinct capabilityを一度だけclaimし、未使用のcontinuation / installer capabilityは失敗経路でもrevokeする。bootstrap capabilityをinstallerへそのまま横流ししない。

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
- persistent mutation前にexact-clean tracked application source closureを検査した
- source検査後、mutation前にregistry anchorを再検証した

一方、既存のcrash evidenceとreconciliation semanticsを不必要に変えないため、private persisted HMAC lease recordはV2のまま維持する。public receiptのversionとdisk上のprivate lease formatを同じものとして扱わない。

public receipt、connector receipt、training-label receiptはapplication sourceのrevision、path、digestを公開しない。private registry bytesとheld-lock comparisonの中だけで照合する。

## 6. mutation graphより先にsource authorityを確定する

対象production CLIはNode `v22.13.0`、引数なし、`node -r tsx/cjs`、固定application rootと一致するcurrent working directory、exactなentrypoint path、`require.main.filename`を要求する。最小のsource-authorization moduleだけを先にloadし、固定tracked closureを検査してopaque capabilityを得た後に、production mutation moduleを遅延loadする。別checkoutや古い作業treeから同じscript名を実行しても、そのmodule固有のWeakMapでcapabilityをclaimできず、mutation graphへ入る前に失敗する。clone、proxy、purpose違い、stage順序違い、再利用も拒否する。

productionとtestはcapability registry、provisioner continuation registryを分離している。test-stage realmはstate machineと失敗経路を検証するためのもので、production capabilityをmint、claim、armできず、production namespaceへaliasするhomeも受け付けない。

引数なしのread-only source readiness inspectorも追加する。これは固定worktreeのpoint-in-time exact-clean tracked closureを観測するだけで、registryの作成・読込・更新、gate authority、checkpoint、teacher label、training、weight、match、棋力を一切claimしない。出力にもrevision、path、digestを含めない。

## 7. prefix-100 preflight V3で再照合する

provision時のsource successを将来の実行authorityとして再利用しない。fresh prefix-100 read-only preflight V3はcommon OS lock中にprivate registry V2をclaimし、現在のexact-clean tracked application bindingと再照合してからverifier、runs namespace、deployment key、approved/current bindingを確認する。

preflightの`GO`は**read-only core preconditionsをその時点で観測した**という意味だけで、gate invocationをauthorizeしない。receiptは再利用できず、source mismatchはsanitized `NO-GO`となる。preflight自体はnamespaceやfile contentを変更しない。

## 8. tracked closureの保証と非保証

境界を強くしても、次はclaimしない。

- 同じUIDで動く任意のhostile processからの完全な隔離
- ignored / untracked content、特に`node_modules`のbyte closure
- 検査の合間に変更され、検査前後で完全に元へ戻された一時的改変の検知
- filesystem全体のatomic snapshot
- readによるaccess timeを含む全metadataの不変
- V1 registryの自動migration、reconciliation、削除、adopt、overwrite
- source readinessだけによるregistry、gate、human approval、棋力の権限

tracked Git entriesはfull bytesとmodeを検査するが、これはOS-level sandboxやsame-UID adversary isolationではない。残る前提と非保証を隠さず、production approval時の判断材料として残す。

outer、connector runner / CLI、training-label runner / CLI、preflight、readiness、provision receiptは、保証境界を曖昧にしないため、`ignored_untracked_dependency_bytes_verified: false`、`same_uid_race_isolation: false`、`atomic_source_snapshot: false`を明示する。したがって「exact clean」を`node_modules`を含む全dependency bytesの検証やatomic source snapshotと読み替えてはならない。

## 9. local validationはPASS、remote deliveryはPENDING

local validationは実装revision `7223c3ddb50201614f62337827be9e22211c0aff`へ固定した。証拠記事とJSONの未commit変更はこのrevisionに含めないため、ここでclaimするのは**exact implementation revision**の検証であり、最終PR headやmerge commitのGitHub CIではない。

| 検査                                                | 状態    | 確定値                                                                  |
| --------------------------------------------------- | ------- | ----------------------------------------------------------------------- |
| focused source / registry / outer / preflight tests | PASS    | 21 files / 610 tests / 9.93秒                                           |
| full Vitest                                         | PASS    | 164 files / 3,004 tests / 312.58秒、max RSS 2,416,541,696 bytes、swap 0 |
| TypeScript                                          | PASS    | `tsc --noEmit`                                                          |
| full lint                                           | PASS    | errors 0、既存warning 157                                               |
| changed-file Prettier                               | PASS    | 47 files                                                                |
| production build                                    | PASS    | exit 0 / 30.68秒、max RSS 2,625,978,368 bytes、swap 0                   |
| ML stdlib                                           | PASS    | 58 / 58 tests                                                           |
| npm audit                                           | PASS    | vulnerabilities 0                                                       |
| independent security / docs audit                   | PASS    | P0 / P1 / P2 = 0 / 0 / 0、TypeScript import cycle 0                     |
| GitHub CI                                           | PENDING | actual PR未作成                                                         |
| GitHub review / unresolved threads                  | PENDING | actual PR未作成                                                         |
| regular merge                                       | PENDING | 通常merge必須                                                           |

全repositoryへのPrettier checkは、既存の巨大JSONLを読み切れないこと、AssemblyScript decoratorを標準parserが扱えないこと、今回と無関係な既存未整形ファイルが多数あるためfinal gateに数えない。代わりにbaseからの全変更47ファイルを検査しPASSした。full lintの157 warningsも今回の差分外にある既存warningで、errorは0だった。

途中でfull Vitestをbuild / lintなどの重いjobと並行実行した観測では、163 files中162、2,963 tests中2,955まで進み、kill-drillのarm IPC周辺8件が失敗した。別のisolated開始runは実行中にsource treeが変わり、164 files中2 files、2,989 tests中9 testsが失敗した。当初はresource contentionだけが疑われたが、後のisolated再現で、disposable child fixtureがsource-bound V2ではない仮registryを使い、exact application bindingも返していなかった回帰だと判明した。fixtureをcanonical V2と一致するexact frozen test bindingへ更新した後、isolated kill-drill diagnosticは20 / 20 testsを70.38秒で通過した。古い2 runとcommit前diagnosticはいずれも最終証拠には数えず、最終証拠には`7223c3d...`のisolated full runだけを使う。

その後の全体runでは、旧offline connector fixtureがexact test-stage realmへ登録されていなかったため、164 files中1 file、3,004 tests中8 testsが失敗した。これはproduction connectorの失敗ではなく、強化した境界へ旧test fixtureが未適合だった統合回帰である。fixtureをexact 4-field synthetic leaseとして登録し、read-only current-EUID / home / ancestor exclusionを明示した。監視testは9 logical guardsについて、固定leafとancestorごとのrealpath / lstat multisetをexactに数え、`9 / 9 / 9 / 9 / 153 / 153 / 54 / 54 = 450` calls以外を拒否する。offline suiteは11 / 11、最終full suiteは164 / 164 files、3,004 / 3,004 testsを通過した。

current offline receipt境界は次へ更新した。過去のrevision-pinned `04f6dad` protocol artifactは歴史的証拠なので上書きしない。

```text
status = complete-fixed-synthetic-three-gate-test-only-contract-composition-with-read-only-home-exclusion
claim_boundary = fixed-synthetic-test-only-approved-enrollment-and-connector-core-contract-composition-for-100-500-24000-gates-with-read-only-current-euid-production-home-exclusion-closed-synthetic-lifecycles-and-pathless-summaries-not-production-filesystem-continuity-dataset-training-live-or-strength-evidence
trust_boundary = trusted-current-process-js-realm-captured-intrinsics-current-euid-userinfo-home-read-only-existing-ancestor-resolution-and-imported-test-only-core-seams-with-fixed-synthetic-metadata-v2
execution_boundary = test-only-fixed-synthetic-read-only-current-euid-home-exclusion-no-production-capability-composition
```

## 10. productionと棋力の実行数はすべて0

この変更でのproduction command、registry provision、kill drill、prefix-100 / 500 / final-24000 gate、teacher generation、label finalization、training、optimizer step、candidate selection / promotion、正式A/B、外部校正、weight overwrite、live activationはすべて0である。

今回、registry / control / evaluatorなどのmanaged production stateはfreshには読んでいない。test-isolation境界のためcurrent-EUID homeのidentity metadataだけをread-onlyで検査し、production application / control contentは読んでいない。PR #479までの既存証拠でrunOp1がcurrent evaluatorかつrollback evaluatorだった状態をlast-knownとして継承し、この変更ではrunOp1もlive weightも変更していない。したがって、このsource provenanceを「強くなった」「高段になった」という証拠には数えない。これは、その後に得る棋力証拠を信用できるようにする安全基盤である。

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

production向けmanual inspect / confirm quarantine / cancel reconciliation exportは、固定originのoperator entrypointとpolicyが別途reviewされるまで意図的に常時拒否する。test-only state machineが存在することをproduction reconciliation authorityと解釈しない。

## 12. 現時点の判断

P1の原因は評価関数そのものではなく、教師生成へ入る前のproduction application provenanceが閉じていなかったことだった。この候補はその穴を具体的に塞ぎlocal validationも通過したが、GitHub CI、review、通常mergeが終わるまではproduction application worktreeのalignmentもregistry provisionも**NO-GO**である。

[機械可読証拠](./data/floodgate-v7-production-application-source-provenance-2026-07-16.json)は、確定事項、PENDING、production 0、nonclaim、次の停止点を分けて記録する。
