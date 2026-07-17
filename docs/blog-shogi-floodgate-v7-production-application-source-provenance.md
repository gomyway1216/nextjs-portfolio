# production実行アプリをexact sourceへ固定する — Floodgate v7

> PR #479は通常のmerge commit `4c71e664dae67ccd4afdb369a666bcdb4d4bbb37`で統合された。しかし統合後の独立棚卸しで、verifierは固定されていても、**production commandを実行するアプリケーションsourceそのものが固定されていない**というP1 blockerが見つかった。[PR #481](https://github.com/gomyway1216/nextjs-portfolio/pull/481)は、その穴をexact-clean tracked Git closure、pre-mutation capability、create-only registry V2、outer-gate receipt V3で閉じる。実装revision `7223c3ddb50201614f62337827be9e22211c0aff`はfocused 610件とfull 3,004件を通過し、その後のPR head `f69322583bf2d86df302e43022ac56788bc5eb5f`もremote check 6 / 6を通過した。ただしmerge前のpost-green監査で、production child Node開始前の`NODE_OPTIONS` preloadを閉じていないP1と、absolute `engineArgs`、exact test-home、文書claimに関するP2が見つかったため、greenのままmergeを保留した。native JXA clean launcherを含むremediationはexact実装revision `9ec2d01da4b6e50c4b4c5afd83ce68999d501019`としてcommit済みで、isolated local validationは165 / 165 files、3,027 / 3,027 testsを通過し、独立final auditもP0 / P1 / P2 = 0 / 0 / 0だった。この証拠文書の変更はその実装revision外なので、最終PR headのGitHub CI、re-review、通常mergeはPENDINGである。production registry、gate、teacher、label、training、selection、正式A/B、外部校正、live activationは実行しておらず、live weightとrunOp1は変更していない。English version: [blog-shogi-floodgate-v7-production-application-source-provenance.en.md](./blog-shogi-floodgate-v7-production-application-source-provenance.en.md)

## 1. 結論と現在地

今回必要なのは、強い棋譜からの再学習を始めることではなく、**どのsourceがproduction dataを作ったかを後から再現できる状態にすること**だった。ここが曖昧なまま24,000件の教師を生成すると、教師、checkpoint、候補weightの出自を固定できず、棋力が上がっても安全に採用できない。

この候補は固定application worktreeを次の一か所に限定する。

```text
~/.codex/worktrees/shogi-floodgate-v7-production-application
```

そこから40桁Git revisionを取得し、nonignored statusがcleanで、全tracked entryのbytes / modesが一致することを検査して、private registryへ一度だけ固定する。この文書でいうexact-cleanはこの**tracked closure**を指し、ignored / untracked dependency bytesを含まない。以後のmutationは、そのregistry bindingと現在のtracked source closureが一致した場合にだけ先へ進む。

ただし、これはまだ**候補実装**である。exact remediation revision `9ec2d01...`はfinal isolated local validationと独立auditを通過したが、最終PR headのGitHub CI、re-review、通常mergeはPENDINGである。固定worktreeのmerge revisionへのalignmentもregistry provisionも行っていない。現時点のproduction開始判定は明確に**NO-GO**である。

## 2. #479後と実装監査で見つかったP1 blocker

#479はprefix-100、prefix-500、final-24000、training-label finalizationの4用途を共通OS lockとpurpose-bound durable leaseで直列化した。だが、その境界が検査していたのはregistry、key、verifier、leaseであり、Nodeが読み込む現在のapplication treeは実行時のcurrent working directoryに依存していた。

そのため、固定verifier revisionが正しくても、別checkout、古いcheckout、dirty sourceからgateを起動できる余地があった。receiptにもapplication revisionが結び付いていないので、「同じ入力と同じ実装を使った」というproduction provenanceを証明できない。これは棋力以前のP1 blockerであり、create-only registryを作る前に閉じる必要がある。

最初の修正後にも独立監査を続け、2つの直接迂回と、test境界内の2つの具体的な派生穴を見つけた。

- CLI context checkだけでは、古いcheckoutからmutation-capable exportを直接importする経路を閉じ切れなかった
- dependency-injectedな`CoreForTests`へproduction homeまたはそのfilesystem aliasを渡すと、test-only経路がproduction namespaceへ届く余地があった
- exact production homeだけを拒否しても、そのcanonical descendantや、未存在のproduction-home descendantを指すdangling symlinkから同じnamespaceへ届く余地があった
- foreign / cloned stage leaseを拒否した後でも、そのuntrustedな`close()`をcleanupで呼ぶとproduction lease namespaceを変更できる余地があった

候補実装は、production mutation graphをloadする**前**に固定entrypointとtracked closureを検査し、module-privateなsingle-use capabilityを発行する。通常gateでは同じexact objectを`runner-entry -> outer-owner`の順に消費し、registry provisionではbootstrap capabilityをprovisionerが消費した後、入力確定までinstaller authorityを発行しない。production exportは正しいcapabilityとentrypoint contextの両方を要求する。

今回hardeningしたouter-gate、registry loader / installer / provisioner、stage / connector / training-label compositionのtest-only ownerは、明示的に渡されたtest home / optionsがproduction home、そのcanonical descendant、symlink alias（未存在のproduction-home descendantを指すdangling linkを含む）、または同じdevice / inodeを経由するaliasなら、ownerやOS lockへ入る前に拒否する。callbackから返るregistry pathと、認証済みexact test-realm lease bindingのpathだけをdownstream mutation authority前にproduction-home境界へ再照合する。foreign / cloned leaseはpropertyやpathを検査せず、`close()`も呼ばず、key / consumer / checkpoint / preflight / finalizer authorityへ進む前に拒否する。test capability / continuationはproductionとは別のWeakMap realmに置き、production objectとtest objectを相互利用できない。test-only training-label ownerの成功receiptも専用contract / status / claim boundaryを使い、outer-gate capabilityやOS lockを取得したとはclaimしない。production receiptの既存contractとtrue verificationは変更しない。ただし、任意に注入されたcallback自身の副作用を隔離するsandboxではない。ここまでのremediationは`7223c3d...`のhistorical validationを通過した。

さらに、`f693225...`がremote check 6 / 6を通過した後もmergeせず監査を続け、次のpost-green findingを見つけた。

- **P1 — hidden preload:** direct Node起動ではapplication codeの最初のguardより前に`NODE_OPTIONS=--require=...`が実行される。preload自身が`NODE_OPTIONS`と`process.execArgv`を消し、module loaderやcaptured予定のintrinsicを変更すると、Node内だけの検査では先行実行を後から証明できなかった
- **P2 — absolute `engineArgs`:** test-only connector / training-label経路は主要pathを検査しても、absoluteなengine argumentを同じ境界へ含め切れていなかった
- **P2 — exact test-home:** production homeの外であることだけでは、認証したtest homeとは別のsiblingやsymlink先へtest registry / lease pathが出ることを拒否できなかった
- **P2 — documentation claims:** 「最小source-authorization moduleだけ」「application source revision値を一切含めない」という表現は、mutation-neutral shared CLI boundaryやprivate registry bindingまで含めた実際の境界より広すぎた

P1はattested production child Nodeより前に評価されるtracked native JXA launcherが、そのchild専用のclean environmentを作ることでremediateし、P2はabsolute `engineArgs`をpath検査へ追加し、test registry / lease pathを認証済みexact test home内へ固定し、文書claimを実装境界へ狭めた。これらはexact実装revision `9ec2d01...`へcommitされ、focused / final isolated local validationと独立final auditを通過した。最終PR headのGitHub CIとre-reviewは別のdelivery gateとして残る。

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

post-green remediationでは、対象production evidence commandのattested production childをdirect Nodeでは起動しない。package scriptを実行するnpm自体はNode processであり、`osascript` / JXA processもinvoking shell / npm environmentを見得る。境界が保証するのは、canonicalな固定application rootからroot-owned absolute `/usr/bin/osascript`がcanonical helper pathのtracked JXAと固定purposeを**production child Nodeより先に**評価し、operator由来の任意keyをそのchildへforwardしないことである。JXAは`NODE_OPTIONS`を含まないfresh fixed minimal NSTask environmentを組み立て、fixed Node `v22.13.0`を`/usr/bin/caffeinate`経由で`-r tsx/cjs`とexact entrypointだけに固定して起動する。

native launcherが現在coverするのはexactly 8 commandsである。

- mutation-capable 5件: create-only registry provision、durable prefix-100、durable prefix-500、sealed final-24000、training-label finalization
- read-only / disposable 3件: application-source readiness、prefix-100 read-only preflight、disposable kill drill

launcherは32-byte CSPRNG nonceをprivate one-shot stdin pipeとclean child environmentへ結び、Node側はlive parentのexact commandと`/usr/bin/osascript` imageをroot-owned `/usr/sbin/lsof`と`/bin/ps`で照合する。さらにproduction childのcwd、`process.execPath`、main filename、`process.argv`、`process.execArgv`、allowlisted environmentをexact tupleとして照合する。attestationは一度だけclaimでき、claim後は5つのattestation keyを`process.env`から削除する。ただしJS string copyのmemory zeroizationはclaimしない。その後、mutation-neutralなentrypoint / shared CLI boundaryとsource-authorization moduleが固定tracked closureを検査してopaque capabilityを得てから、該当するproduction operation module / graphを遅延loadする。別checkout、direct Node parent、preloadを含むchild environment、clone、proxy、purpose違い、stage順序違い、再利用はfail closedする。

これはfixed toolのowner / mode / canonical path、live parent image / command、exact child tuple、one-shot pipeを照合する境界であり、`osascript`、`lsof`、`ps`、`caffeinate`、Node binaryのbyte digest closure、process lineageのatomic snapshot、same-UID hostile / ancestor process isolationをclaimしない。

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

outer、connector runner / CLI、training-label runner / CLI、preflight、readiness、provision receiptは、保証境界を曖昧にしないため、`ignored_untracked_dependency_bytes_verified: false`、`same_uid_race_isolation: false`、`atomic_source_snapshot: false`を明示する。native launcherも`tool_byte_closure_verified: false`、`atomic_process_lineage_snapshot: false`に相当する境界である。したがって「exact clean」を`node_modules`を含む全dependency bytesの検証、fixed toolのbyte closure、atomic source / process-lineage snapshotと読み替えてはならない。

## 9. exact remediation実装はlocal PASS、最終deliveryはPENDING

最初のlocal validationは実装revision `7223c3ddb50201614f62337827be9e22211c0aff`へ固定した。証拠記事とJSONの未commit変更はこのrevisionに含まれなかったため、これはその時点の**exact historical implementation revision**の検証である。その後の`f693225...`もremote check 6 / 6を通過したが、post-green findingより前の結果なので、現在のmerge gateには使わない。

| `7223c3d...` historical検査                         | 状態 | 確定値                                                                  |
| --------------------------------------------------- | ---- | ----------------------------------------------------------------------- |
| focused source / registry / outer / preflight tests | PASS | 21 files / 610 tests / 9.93秒                                           |
| full Vitest                                         | PASS | 164 files / 3,004 tests / 312.58秒、max RSS 2,416,541,696 bytes、swap 0 |
| TypeScript                                          | PASS | `tsc --noEmit`                                                          |
| full lint                                           | PASS | errors 0、既存warning 157                                               |
| changed-file Prettier                               | PASS | 47 files                                                                |
| production build                                    | PASS | exit 0 / 30.68秒、max RSS 2,625,978,368 bytes、swap 0                   |
| ML stdlib                                           | PASS | 58 / 58 tests                                                           |
| npm audit                                           | PASS | vulnerabilities 0                                                       |
| 当時のindependent security / docs audit             | PASS | P0 / P1 / P2 = 0 / 0 / 0、TypeScript import cycle 0                     |

post-green remediationの現在地は別に扱う。下のexact実装revisionにはこの記事とJSONの証拠変更を含まない。これらを後続commitした最終PR headをremote gateへ通す。

| timeline / gate                                      | 状態        | 確定値またはPENDING境界                                                         |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| PR head `f693225...` remote checks                   | PASS-HELD   | 6 / 6 PASS。ただし後続監査のためmergeに使用しない                               |
| post-green independent audit                         | FOUND-FIXED | P1 hidden preload 1件、P2 3件。`9ec2d01...`でremediate                          |
| exact remediation実装revision                        | PASS        | `9ec2d01da4b6e50c4b4c5afd83ce68999d501019`                                      |
| native-launcher + 8 CLI focused Node 22 tests        | PASS        | 9 files / 136 tests。production command / namespace使用0                        |
| native-launcher exact-child-tuple adversarial matrix | PASS        | 22 / 22、wall 2.34秒、max RSS 146,620,416 bytes、swap / block I/O 0             |
| P2 exact-home / absolute-`engineArgs` boundary tests | PASS        | 2 files / 139 tests                                                             |
| combined focused run                                 | PASS        | 9 files / 255 tests、wall 2.51秒、max RSS 298,795,008 bytes、swap / block I/O 0 |
| final isolated full Vitest                           | PASS        | 165 / 165 files、3,027 / 3,027 tests、Vitest 314.34秒、wall 314.51秒            |
| full-suite resource envelope                         | PASS        | max RSS 2,402,271,232 bytes、swap / block I/O 0、開始13 workers、tail 1 worker  |
| production build                                     | PASS        | wall 26.83秒、max RSS 2,637,201,408 bytes、swap / block I/O 0                   |
| TypeScript                                           | PASS        | `tsc --noEmit`、exit 0、3.08秒                                                  |
| full ESLint                                          | PASS        | 1,168 files、errors 0 / 既存warnings 157、26.88秒                               |
| Prettier / JXA syntax                                | PASS        | normal 23 files + JXA 2 files、`osacompile` 2 / 2                               |
| ML stdlib / npm audit                                | PASS        | 58 / 58、wall 1.38秒、vulnerabilities 0                                         |
| evidence JSON / 日英parity                           | PASS        | JSON parseと記事parity check通過                                                |
| independent final audit                              | PASS        | P0 / P1 / P2 = 0 / 0 / 0                                                        |
| 最終PR headのGitHub CI / re-review                   | PENDING     | 証拠文書commitで最終headを作った後に再実行                                      |
| regular merge                                        | PENDING     | 最終headの全gateがgreenになるまで保留                                           |

launcher test fixtureはtracked test helperとdisposable childだけを使い、production application root、registry、control namespace、gateを使わない。この22件をproduction command、kill drill、preflight、gateの実行数へ加算しない。

全repositoryへのPrettier checkは、既存の巨大JSONLを読み切れないこと、AssemblyScript decoratorを標準parserが扱えないこと、今回と無関係な既存未整形ファイルが多数あるためfinal gateに数えない。final remediation revisionではnormal変更23 filesとJXA 2 filesを該当format checkへ通し、JXA 2 filesは`osacompile`も通過した。full ESLintは1,168 filesを検査し、157 warningsは既存warning、errorは0だった。

duplicate full-suite run 1件は、先に動いていたisolated validationの方が進んでいたため77.10秒で意図的にinterruptした。これは証拠に数えない。上記の165 files / 3,027 testsのfinal timed isolated runがこれをsupersedeする。

最初のpost-remediation delivery head `6d00f65d6bb1772b336021a8ac425437fd7f9727`ではSecurity、E2E、VercelがPASSした一方、macOS 26.4 runnerのDarwin jobがnative-launcher test 22件中1件で失敗した。テストは存在しない`DYLD_INSERT_LIBRARIES`がprotected `caffeinate`で必ずstripされてchildがstatus 0になると仮定していたが、新runnerではloaderがattested childの開始前にstatus 6で拒否した。どちらもinjection stateがattested childへ届かないfail-closed outcomeであり、production implementationの失敗ではない。`494ad72e55a4eaa890b775bbeafc9a52d9e2bf4d`でtestを「stripされてattest成功」または「protected loaderがstatus 6で開始前拒否」の両方をsafeとして固定し、Node 22の対象testは22 / 22を再通過した。`6d00f65...`のCIは最終headのmerge gateに数えず、後続headで全checkを再実行する。

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

今回、registry / control / evaluatorなどのmanaged production stateはfreshには読んでいない。test-isolation境界のためcurrent-EUID homeのidentity metadataだけをread-onlyで検査し、production application / control contentは読んでいない。native launcherのtest-only fixtureもproduction countには含めない。PR #479までの既存証拠でrunOp1がcurrent evaluatorかつrollback evaluatorだった状態をlast-knownとして継承し、この変更ではrunOp1もlive weightも変更していない。したがって、このsource provenanceを「強くなった」「高段になった」という証拠には数えない。これは、その後に得る棋力証拠を信用できるようにする安全基盤である。

## 11. 次に進む順序

安全な順序は次で固定する。

1. この証拠文書をcommitし、その最終PR headでGitHub CIと独立re-reviewを通してから、このapplication-source provenance候補を通常mergeする
2. 番号を先取りしない次PRでoperator guardsを完成させる（approved-current-binding standalone CLIのnative exact launch、standalone verifier readiness）。reconciliation authorityはまだ実装しない
3. operator-guard PRを通常mergeした後、固定application worktreeを**そのoperator-guard PR自身のmerge revision**へ、固定verifier worktreeを`e8a9197608cb48b1160b6707d97b0c4f78f90a1d`へalignする。#481のmerge revisionには新しいstandalone CLIが含まれないため、#481だけへalignしてはならない
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

P1の原因は評価関数そのものではなく、教師生成へ入る前のproduction application provenanceとpre-production-child launch boundaryが閉じていなかったことだった。exact実装revision `9ec2d01...`はfinal isolated local validationと独立auditを通過したが、最終PR headのGitHub CI、re-review、通常mergeが終わるまではproduction application worktreeのalignmentもregistry provisionも**NO-GO**である。

[機械可読証拠](./data/floodgate-v7-production-application-source-provenance-2026-07-16.json)は、確定事項、PENDING、production 0、nonclaim、次の停止点を分けて記録する。
