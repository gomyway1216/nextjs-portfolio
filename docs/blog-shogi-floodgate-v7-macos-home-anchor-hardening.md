# macOSの`0755` homeを安全にanchorする — Floodgate v7 deployment-key namespace hardening

> 本稿は、Floodgate v7のactual deployment-key provisioningを初めて試した際に見つかったnamespace bugと、その修正の監査記録である。PR #464の通常merge後、Node v22.13.0でproduction provisionerを1回実行したが、actual homeが`0755`、旧provisionerのhome要件がexact `0700`だったため`namespace` phaseで停止した。停止はentropy生成、directory作成、key commitより前で、public failureは`durability = no-deployment-change-established`、`may_have_committed = false`だった。続くread-only instance inspectorにもcandidateはなく、keyがabsentだったこのrunではkey contentを0 bytes読んだ。key、live環境、評価関数、weightはいずれも変更されていない。implementation revision `635f94515a47d2d453133fe05bed9250f6bafffa`はhome anchorとmanaged namespaceのmode policyを分離し、provisionerのbugを修正するとともに、関連する4つのproduction reader / enrollment pathを同じ規則へhardeningした。focused 5 files / 121 tests、related 10 files / 339 tests、full 123 files / 2,298 testsとrevision-bound validationはすべてPASSした。PR、CI、mergeは本稿時点で`PENDING`である。English version: [blog-shogi-floodgate-v7-macos-home-anchor-hardening.en.md](./blog-shogi-floodgate-v7-macos-home-anchor-hardening.en.md)

## 1. 現在地

| item                              | current value                                | meaning                                                               |
| --------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- |
| prerequisite delivery             | PR #464 merged                               | offline connector gate contract compositionはdefault branchへ統合済み |
| actual key-provision attempt      | 1回、Node v22.13.0、sanitized failure        | production wrapperを実際に呼んだがnamespaceでfail closed              |
| failure phase                     | `namespace`                                  | entropy / mkdir / key publicationより前                               |
| durability                        | `no-deployment-change-established`           | deployment changeが成立したとは扱わない                               |
| commit ambiguity                  | `may_have_committed = false`                 | keyがcommitされた可能性はない                                         |
| subsequent instance inspection    | read-only、candidateなし、key content read 0 | key absentだったこのrunではcontent readに到達していない               |
| real metadata probe               | `not-provisioned`、parent / key absent       | key content read 0、key content write 0                               |
| implementation revision           | `635f94515a47d2d453133fe05bed9250f6bafffa`   | source / test / validationの固定revision                              |
| focused validation                | 5 files、121 / 121 PASS                      | namespaceとterminal raceの回帰を含む                                  |
| static validation                 | TypeScript / ESLint / Prettier PASS          | full ESLintもerror 0（既存warning 157）                               |
| independent review                | P0 / P1 / P2 = 0 / 0 / 0                     | final code findings                                                   |
| public schema                     | unchanged                                    | success receipt / sanitized public errorへfield追加なし               |
| related / full / build            | 339 / 339、2,298 / 2,298、PASS               | final revisionに対する各authoritative run                             |
| Python / dependency audit         | 58 / 58 PASS / vulnerabilities 0             | cross-language regressionと依存関係を確認                             |
| PR / CI / merge for this revision | `PENDING` / `PENDING` / `PENDING`            | PR #464のmergeと今回の変更を混同しない                                |
| deployment key / live weight      | absent / unchanged                           | provisioning successも棋力変化もまだない                              |

今回閉じたのは「一般的なmacOS home modeを安全なanchorとして扱いながら、その下の秘密用namespaceをprivateに保てるか」という実装gapである。key provisioning、approved control-plane enrollment、real 100-parent run、学習、対局、棋力向上はまだ完了していない。

## 2. 実runで何が起きたか

offline testだけではactual user-info homeのmetadata差を観測できないため、PR #464 merge後に既存のaudited production commandをNode v22.13.0で1回実行した。結果はsecretやpathを含まない次のpublic classificationだった。

```text
name               = FloodgateV7DeploymentKeyProvisionerError
phase              = namespace
durability         = no-deployment-change-established
may_have_committed = false
retry_disposition  = manual-reconciliation-required
```

失敗点はhome namespaceの検証であり、entropy生成、missing managed directoryの作成、staging key作成、final key publicationには到達しなかった。その後にread-only instance inspectorを実行したがcandidateはなく、keyがabsentだったこのrunではkey contentを0 bytes読んだ。別のreal metadata probeでもstatusは`not-provisioned`、fixed parentとkeyはabsentだった。probeもkey contentを読まず、書かず、作らなかった。instance inspectorはkeyが存在する場合にはcandidate IDを導出するためkey contentを読むので、一般にmetadata-onlyという意味ではない。

ここで重要なのは、失敗を「ほぼ成功」と数えないことである。actual production entryを呼んだ事実はあるが、provision receiptもkey instanceも生成されていない。したがってkey authority、production connector、training runnerへ進む根拠にはならない。

## 3. 原因 — 旧provisionerがhomeとmanaged secret directoryを同じmodeで判定していた

旧provisionerは、homeからfixed deployment-key parentまでの全directoryにcurrent EUID ownershipとexact `0700`を要求していた。秘密用に自分で管理するdirectoryへexact `0700`を要求すること自体は正しい。一方、OS-managedかつcurrent-EUID-ownedのuser homeにも同じexact policyを適用したため、actual canonical homeの`0755`をunsafeとして拒否した。実runを直接停止したのはこのprovisioner固有の判定であり、readiness、authority、key-instance enrollment、approved-key enrollmentの4経路が同じexact-`0700`判定で`0755`を拒否していたわけではない。

この2つは同じdirectory chainにあっても役割が異なる。

| directory role                  | trust requirement                                                         | mode policy         |
| ------------------------------- | ------------------------------------------------------------------------- | ------------------- |
| canonical home anchor           | current-EUID-owned、owner `rwx`、group / other write bitとspecial bitなし | safe-home predicate |
| home以下の4 managed directories | key / approval namespaceを構成するprivate components                      | exact `0700`        |

homeがgroup / otherからreadまたはexecute可能でも、group / otherからwriteできなければ通常のPOSIX mode上は固定child nameを書き換えられない。group-writeまたはother-write bitだけで、execute bitやACLなどの条件を無視して常にpath componentを置換できるとは限らない。それでも本contractはplatformごとの差や追加権限を個別に推測せず、group / other write bitが1つでもあれば保守的に拒否する。これはmode bitに対するfail-closed条件であって、effective traversal permissionやACLまで安全だと証明する主張ではない。修正はこのmode-bit policyを明示し、homeのpermissionを勝手に`chmod`して「直す」処理は追加していない。

## 4. 新しいsafe-home anchor contract

home anchorは次を全て満たす必要がある。

- absoluteかつcanonicalで、symlink aliasではない。
- real directoryで、ownerがcurrent effective UIDと一致する。
- ownerのread / write / executeが全て立っている。
- group-writeとother-writeが立っていない。
- setuid、setgid、stickyなどのspecial bitが立っていない。
- 初回snapshotと最終revalidationでmodeとidentityが変わらず、descriptorを保持する経路ではheld identityとも一致する。

このpredicateの代表的なaccepted modeとして`0700`、`0750`、`0755`をtestで固定した。`0755`を特別扱いするallowlistではなく、「owner `rwx`、group / other writeなし、special bitなし」という権限predicateである。owner execute欠如、group-writable、other-writable、special-bit、wrong owner、noncanonical aliasはfail closedにする。

homeの下にある4つのmanaged directoryは引き続きcurrent-EUID-owned exact `0700`である。既存directoryを緩いmodeのまま受け入れず、既存のunsafe modeを自動`chmod`せず、symlinkやidentity driftも拒否する。経路ごとの保持方法は責務に応じて異なる。provisioner、key-instance enrollment、approved-key enrollmentはhomeとmanaged chain全体をno-followでheld-openする。authorityはfull chainをmetadata snapshotで検証し、最終parentとkeyをheld-openする。metadata-only readinessはdescriptorを保持しない。homeと存在するmanaged prefixを前後のpath-based metadata snapshotで照合した上でterminal stateも再確認する。present keyなら初回とfinalのsnapshot一致およびfinal canonical pathを検査し、absent terminalなら同じfixed pathが2回目の`lstat`でも`ENOENT`であることを要求する。これはadvisory classificationであり、receiptが明記するauthoritative reopenを置き換えない。

つまり今回の修正は秘密用namespaceを`0755`へ緩める変更ではない。OS-managedかつcurrent-EUID-ownedのhome anchorとapplication-managed private namespaceを別contractとして正しく表現した変更である。

## 5. 5つのproduction pathを同じ規則へそろえた理由

actual failureを直すだけならprovisionerのhome判定変更で足りる。しかし旧readiness、authority、key-instance enrollment、approved-key enrollmentはprovisionerと異なるchain検証を持ち、group / other writableなhomeや途中componentを含むnamespaceをprovisionerより緩く受け入れ得た。provisionerだけを修正すると、writerが拒否するnamespace stateをdownstream reader / enrollment pathが受け入れる不整合が残る。そこでimplementation revisionは、直接のbug fixをprovisionerへ適用し、残る4領域も同じanchor contractへhardeningした。

| area                              | responsibility after the change                                      | namespace evidence lifetime                                 |
| --------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| deployment-key provisioner        | safe homeからprivate managed chainをcreate-onlyで検証 / 作成する     | homeとfull managed chainをheld-openし、逆順にclose          |
| deployment-key readiness          | contentを読まず、home / existing managed prefix / terminalを分類する | present keyはsnapshot一致、absent terminalは2回目の`ENOENT` |
| deployment-key authority          | full chainを検証し、actual keyからrequest-bound authorityを作る      | full chainをsnapshotし、最終parentとkeyをheld-open          |
| key-instance enrollment inspector | candidate ID derivationの前後に同じnamespace identityを保持する      | homeとfull managed chainをheld-openし、逆順にclose          |
| approved-key enrollment loader    | approved recordを読む間、homeとcontrol-plane managed chainを保持する | homeとfull managed chainをheld-openし、逆順にclose          |

各areaでhomeはsafe-home policy、4 managed directoriesはexact `0700`である。途中componentまで検査して最終parentだけを見る実装には戻さない。最終結果を作る前にpresent entryはmetadata snapshotを再検証し、held handleを持つ経路ではpathname snapshotとの一致も再確認する。readinessでterminalがabsentだった場合はsnapshotが存在しないため、同じfixed pathのabsenceを2回目の`ENOENT`として再観測する。いずれの場合もreadinessはdescriptor-freeかつauthoritative reopen requiredである。

public JSON schema、receipt field、status vocabulary、sanitized error fieldは変更していない。これはpublic contractの拡張ではなく、内部namespace validationのbug fixである。

## 6. 並行reviewで見つけた追加hardening

home mode修正のreview中に、同じpath-chain codeで2つのdefense-in-depth gapも見つかった。

### 6.1 inherited numeric `Array` setterによるpath redirect

ordinary arrayへ`array[index] = value`と代入すると、そのindexがown propertyでない場合、汚染された`Array.prototype`上のnumeric setterを呼び得る。path、held descriptor、snapshotの追跡arrayでこれが起きると、値を別pathへredirectしたり、opened descriptorをcleanup trackingから外したりできる。

修正後はsecurity-sensitiveなnumeric slotをown data propertyとして定義し、inherited setterへdispatchしない。回帰testは`Array.prototype`の該当numeric indexへredirecting setterを置き、unrelated arrayではsetterが実際に発火することをcontrolとして確認した上で、production path trackingがそこを参照せず正しいfixed path / descriptor / snapshotを使うことを検査する。

### 6.2 provisioner descriptor tracking gap

directoryをopenした直後から、validation完了、state登録、final cleanupまでのどのfailure点でもdescriptor ownershipが曖昧にならないようにした。局所validation中のfailureはそのscopeでcloseし、stateへ移したdescriptorは専用trackingへown data propertyとして登録し、逆順cleanupする。close failureはsuccess receiptへ変換せず、public failureは引き続きpathless / secretlessである。

この2点はactual `0755` failureの直接原因ではない。ただしkey namespaceのfixと同じpath traversal / resource lifetimeに属し、後段のactual key operationへ進む前に閉じる必要があった。

## 7. validationと途中データ

implementation revision `635f94515a47d2d453133fe05bed9250f6bafffa`に対するfinal local evidenceは次のとおりである。

| validation / evidence               | status    | observed result                                                                                |
| ----------------------------------- | --------- | ---------------------------------------------------------------------------------------------- |
| focused Vitest                      | PASS      | 5 files、121 / 121、duration 1.45秒、real 2.34秒                                               |
| accepted safe-home cases            | PASS      | canonical current-EUID `0700` / `0750` / `0755`                                                |
| rejected home cases                 | PASS      | missing owner access、group / other write、special bit、alias、wrong owner、late metadata race |
| managed-chain strictness            | PASS      | 4 componentsはexact `0700`、first / intermediate unsafe modeとraceを拒否                       |
| readiness terminal revalidation     | PASS      | present keyのreplacement / removal、absent key / managed componentのappearanceを`unsafe`へ固定 |
| inherited numeric setter regression | PASS      | path / descriptor / snapshot redirectを拒否                                                    |
| descriptor cleanup regression       | PASS      | failure pathでtracked descriptorをclose-attempt、public errorへpathを出さない                  |
| TypeScript                          | PASS      | diagnostics 0                                                                                  |
| scoped ESLint                       | PASS      | 変更対象でerror 0                                                                              |
| full ESLint                         | PASS      | error 0、既存warning 157                                                                       |
| Prettier                            | PASS      | formatting check成功                                                                           |
| related Vitest                      | PASS      | 10 files、339 / 339、duration 174.51秒、real 175.25秒                                          |
| full Vitest                         | PASS      | 123 files、2,298 / 2,298、duration 170.58秒、real 171.07秒                                     |
| production build                    | PASS      | compile 13.1秒、type check 21.4秒、193 / 193 page generation、real 38.01秒                     |
| Python regression                   | PASS      | 58 / 58 tests                                                                                  |
| dependency audit                    | PASS      | vulnerabilities 0                                                                              |
| independent code review             | PASS      | final P0 / P1 / P2 = 0 / 0 / 0                                                                 |
| real post-failure metadata probe    | PASS      | `not-provisioned`、parent / key absent、key content read / write 0 / 0                         |
| ready PR / review / CI / merge      | `PENDING` | URLや結果を先にclaimしない                                                                     |

focused 121 testsにはhomeの許容mode、managed parentのstrict mode、symlink / identity race、late mutation、Array prototype poison、descriptor cleanup、public failure sanitizationに加え、readinessの4つのterminal raceを含む。具体的には、present keyのreplacement、present keyのremoval、absent keyのappearance、first missing managed componentのappearanceをいずれもstale `ready` / `not-provisioned`ではなく`unsafe`へ固定する。focused、related、full、buildはそれぞれ別のauthoritative runとして実行し、focused結果から残りを推定していない。

## 8. 変わっていないものとnonclaims

今回の変更から次はclaimしない。

- deployment keyがprovisionされたとは言わない。actual keyはabsentである。
- key-instance candidate、approved control-plane record、production connector authorityが得られたとは言わない。
- real dataset、teacher、checkpoint、training、selection、対局を実行したとは言わない。
- live evaluation functionやweightが更新されたとは言わない。どちらもunchangedである。
- stable high-dan strengthが確立したとは言わない。棋力測定は0である。
- PR #464のCI / mergeを今回のrevisionのCI / mergeとして数えない。
- focused testとstatic validationからCIの成功を推定しない。related / full / buildは別runでPASSしたが、PR CIは未実行である。
- held-descriptor revalidationがsame-EUID malicious processやfilesystem / kernel failureを完全に封じるとは言わない。
- descriptor-free readinessが証明するのは2時点のpath-based advisory observationだけであり、連続的またはatomicなabsence / identity、held identity、key content integrityを証明しない。authoritative reopenは常に必要である。
- no group / other writeのhomeを、managed secret directoryと同じprivacy levelだとは言わない。秘密用4 componentsはexact `0700`を維持する。

public evidenceへabsolute private path、key content、derived key、MAC、raw filesystem cause、descriptor numberを含めない。real probeの`read / write 0 / 0`はkey content accessについてのcountであり、namespaceを分類するためのmetadata operationsまで0という意味ではない。

## 9. 次の順序

1. 日英記事とmachine-readable evidenceをimplementation revisionへ固定し、ready-for-review PRを作る。
2. review commentを処理し、required CIが全てgreenになったことを確認して通常merge commitで統合する。
3. merged codeからproduction provisionerを一度だけ実行し、secretを含まないreceiptとfresh metadata probeを保存する。
4. fresh instance inspectorでcandidateを得ても自動承認せず、separate audited control-plane enrollmentでexpected instanceを固定する。
5. authorityがそろった後にだけreal durable-prefix-100へ進み、throughput、failure、durability、cleanupを監査する。
6. 100 gateを通した後も500、24,000、3-seed training、holdout、formal color-swapped A/B、live rolloutを別gateとして順に進める。

home anchor fixは、production key workflowをactual macOS環境で開始可能にするための前提修正である。評価関数を上書きする変更ではなく、棋力向上そのものでもない。repository-wide local validationは完了した。次の確かな到達点は、このrevisionのreview / CI / merge、その後のcreate-only provisioning成功である。
