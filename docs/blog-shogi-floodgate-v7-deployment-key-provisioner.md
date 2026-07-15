# fixed deployment keyを上書きせず配備する — Floodgate v7 provisioner設計

> 前段の[metadata-only readiness probe](./blog-shogi-floodgate-v7-production-checkpoint-connector.md)は、実machineのfixed key slotが`not-provisioned`であることをkey bytesを読まずに確認した。しかし「ない」と確認する権限と、32-byte secretを新規作成する権限は別である。この記事は、manual shell redirectionを禁止し、current EUIDに固定したprivate deploymentへ一度だけexclusive createする専用provisionerの実装と検証結果を固定する。source、focused / related / full test、Python regression、static check、build、code / test reviewに加え、ready [PR #458](https://github.com/gomyway1216/nextjs-portfolio/pull/458)のinitial branch CIまで完了した。一方、final docs-only head CI、merge、actual provisioning、production connector executionはまだ**pending / 0**であり、production weightとlive評価関数は変更していない。English version: [blog-shogi-floodgate-v7-deployment-key-provisioner.en.md](./blog-shogi-floodgate-v7-deployment-key-provisioner.en.md)

> **後日の訂正:** 本稿が記録した旧provisionerの「homeを含む全componentへexact `0700`」という挙動は、一般的なmacOSの`0755` homeを誤拒否するbugだった。秘密用managed directoriesのexact `0700`は維持し、homeだけを別のsafe-anchor predicateへ分離した経緯と最新結果は[macOS home-anchor hardening記事](./blog-shogi-floodgate-v7-macos-home-anchor-hardening.md)を参照。本稿の数値と状態は当時の履歴として残す。

---

## 1. 現在地とこのPRの単一責務

このPR候補の責務は、次のfixed slotへexact 32 random bytesを**存在しないときだけ**作り、durabilityとidentityを検証し、secretを含まないprovision receiptを返すことだけである。

```text
<os.userInfo().homedir>/Library/Application Support/nextjs-portfolio/
  shogi-floodgate-v7-deployment-key-v1/root-key.bin
```

readiness、provision、executionは同じfunctionへ統合しない。

| boundary      | 許可すること                                               | 許可しないこと                           |                       現在の実行回数 |
| ------------- | ---------------------------------------------------------- | ---------------------------------------- | -----------------------------------: |
| readiness     | fixed pathのmetadata-only inspection                       | key read / create / write                |            latest実machine probe完了 |
| provisioner   | missing slotへのexclusive create、fsync、receipt           | overwrite / rotation / connector自動起動 | production 0、temp test-core実行済み |
| key authority | held descriptorからkeyを再openし、run / stage / gateへbind | provisioning                             |                         0 production |
| connector     | 100 / 500 / 24,000 gateを順に実行                          | key自動作成、weight activation           |                                    0 |

source、test、reviewが完成しても、それ自体はactual fixed pathへkeyを作る承認ではない。actual provisioningは別の明示operator approvalを必要とし、PR mergeやdeployから自動実行しない。

## 2. なぜmanual shell redirectionを禁止するか

`head`、`openssl`、`dd`などの出力を`>`で`root-key.bin`へ流す手順は採用しない。shell redirectionはgeneratorを起動する前にdestinationをopenし、通常は既存fileをtruncateし、symlinkをfollowする。`umask 077`を付けても「final componentが存在しないこと」「current EUID ownership」「regular file / nlink 1」「exact 32-byte full write」「held parent identity」「file / directory fsync」「failure時のzeroization」を1 transactionとして証明できない。

特に次の差は後からreadinessだけでは復元できない。

| manual operationの穴         | 起き得る結果                                                  | provisionerの固定策                                 |
| ---------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `>`が既存fileをtruncate      | valid keyを無言でrotation / destruction                       | `O_CREAT` + `O_EXCL`、existing entryは常に拒否      |
| final symlinkをfollow        | fixed slot外へsecretを書く                                    | `O_NOFOLLOW`とpre / held / post identity検査        |
| short write / disk full      | 0〜31 bytesのpoisoned slot                                    | full-write loop、exact size、failure receiptなし    |
| process exit直後のpower loss | bytesまたはdirectory entryが未durable                         | file `fsync`の後にparent directory `fsync`          |
| command / clipboard / log    | secretがargv、terminal、temporary fileへ残る                  | OS CSPRNGからmodule-private bufferへ直接生成        |
| ad-hoc retry                 | existing 32 bytesを上書き、または未durable stateをsuccess扱い | retryもexclusive create、existingはreconciliationへ |

したがってmanual shell作成は「注意すれば可能」ではなく、このproduction contractでは**禁止**である。緊急時にも同じaudited provisionerか、別途レビューされたreconcilerを使う。

## 3. production APIとtest境界

production entry pointは`provisionFloodgateV7DeploymentKey()`でarity 0である。caller-selected path、key bytes、mode、UID、random generator、filesystem adapterを受け取らず、current EUIDと`os.userInfo().homedir`だけからslotを決める。

test core `provisionFloodgateV7DeploymentKeyCoreForTests(dependencies)`だけがarity 1で、temporary canonical home、same effective UID、deterministic 32-byte random source、fault / observation hookをinjectできる。dependenciesとhooksはexact own data properties、non-Proxy、同期return `undefined`へ制限し、thenable / async hookを拒否する。test receiptは`test-only-injected-current-euid-home-key-provisioning` boundaryを持ち、`production_home_origin` / `production_effective_uid_origin`をfalse、`entropy_may_be_test_injected` / `test_hooks_may_observe_key_copy`をtrueにする。production wrapperにはhooksもdependenciesも渡せない。

source / test contractは`shogi-floodgate-v7-deployment-key-provisioner-v1`、success statusは`new-csprng-key-no-clobber-published-durable-and-revalidated`、algorithmは`node-crypto-random-bytes-32-staged-fsync-hard-link-no-clobber-directory-fsync-v1`へ固定した。source implementationとtemporary-home test evidenceは完了したが、production execution evidenceはまだ0である。

public success receiptが持つmetadataは次である。

| metadata                               | 意味                                                                                                     | 含めないもの                        |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| contract / status / execution boundary | exact provision transactionの種類                                                                        | arbitrary signer capability         |
| fixed layout                           | authorityと同じslot contract                                                                             | absolute / relative key path        |
| owner UID、parent `0700`、key `0600`   | verified metadata contract                                                                               | username、environment-selected home |
| parent / key dev・ino                  | このinvocationで検証したidentity                                                                         | open descriptor                     |
| bytes `32`、nlink `1`                  | exact key file contract                                                                                  | root key、key hash                  |
| publication                            | `staged-file-fsynced-hard-link-no-clobber-final-directory-fsynced-staging-unlinked-directory-fsynced-v1` | rename / replacement / rotation     |
| durability                             | `key-published-and-staging-removal-durable`                                                              | future crash-free guarantee         |
| nonclaims                              | dataset / checkpoint / training等が0                                                                     | playing-strength claim              |

## 4. fixed pathとparentを先に固定する

最初のfilesystem effectより前にargument countとproduction identityを確定する。`process.geteuid()`がないplatform、unsafe integer UID、`os.userInfo().uid`との不一致、空またはnon-absolute home、`realpath(home) !== home`は全てrejectする。`HOME`、current working directory、CLI flagはauthorityにしない。

parent creationはkey creationと区別する。homeからfixed deployment parentまで各path componentを1階層ずつ処理し、既存componentは`O_NOFOLLOW`でheld-openしてcurrent-EUID-owned exact `0700` real directoryか検証する。欠損componentだけを`0700`でmkdirし、新しいchild directoryとそのparent directoryを順にsyncする。既存componentをchmodで「直さない」。symlink、non-directory、wrong owner、wrong mode、noncanonical realpathはunsafeとして停止する。

実machineでは先頭3 componentsは既存のexact `0700`で、最終`shogi-floodgate-v7-deployment-key-v1` parentだけが欠損している、というread-only途中データがある。まだmkdirは実行していない。

parentは`O_RDONLY | O_DIRECTORY | O_NOFOLLOW`でheld descriptorへ固定する。pathname `lstat`、held `fstat`、canonical `realpath`からdev / ino / type / UID / modeをcaptureし、key createとdurability処理の後にも同じidentityを再検証する。Nodeのpath-based filesystemとsame-EUID processを超えるsandboxではないため、trust boundaryはcurrent EUID、current JS realm、local filesystem semanticsを明記する。

## 5. exact no-overwrite algorithm

実装が満たす順序を次へ固定した。ここで「成功」は全stepが完了してreceiptがmintされた場合だけである。

1. exact argument count、production EUID / userInfo home、fixed componentsをeffect前にcaptureする。
2. path chainの既存prefixをread-only、canonical、no-followで検査する。final parentが既存ならfinal / fixed staging namespaceも先に検査し、どちらかが存在すればentropyを生成せずno-touch errorにする。
3. `crypto.randomFillSync`でmodule-private 32-byte viewを直接満たし、test injectionはexact ordinary byte view / lengthを検証して内部copyへ移す。productionはcaller bytesやseedを受けず、invalid test entropyではmissing directoryも作らない。
4. 各directory componentをheld-openし、欠損componentだけmkdir / child sync / parent syncする。final parentのheld descriptorとpre identityを取得し、final / staging absentを再確認する。
5. same parent内のfixed private staging nameを`O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW`、requested mode `0600`でopenする。
6. held staging descriptorへoffsetを追跡するpartial-write loopで32 bytes全てを書き、held descriptorからexact readbackしてoriginal copyと一致させる。
7. `fstat`でregular file、current EUID、mode `0600`、nlink 1、size 32を確認し、file `fsync`とheld / pathname revalidationを完了する。
8. POSIX `link(staging, root-key.bin)`で同じinodeをfinal nameへpublishする。finalがraceで先に作られた場合はatomic `EEXIST`で負け、competitorを変更しない。renameやdirect-final createは使わない。
9. staging / finalが同じheld dev / inoを指し、nlink 2であることを確認してheld parent directoryを`fsync`する。
10. staging nameだけをunlinkし、held inodeがnlink 1になったことを確認してheld parentをもう一度`fsync`する。final keyはunlinkしない。
11. final held / pathname identity、bytes、type / UID / mode / nlink / size、parent identityを再検証する。
12. secret buffersを同期zero-fillして直後に全byteが0か検査し、descriptorsを順番に全てclose-attemptする。cleanup failureが1つでもあればsuccess receiptを返さない。
13. absolute / relative path、secret、hash、key-instance ID、capabilityを落としたdeep-frozen null-prototype receiptだけを返す。

このalgorithmはpartial final keyを公開しない。existing keyをopen-for-writeせず、renameによるreplacementもせず、自動rotationも行わない。`force`、`overwrite`、`repair` optionは設けない。direct final `O_EXCL` createは、crashで0〜31-byteのpartial finalが残るため不採用にした。

## 6. identity、mode、durabilityの成立条件

receiptの各flagは単なる「APIを呼んだ」記録ではなく、次の検査が全て通った場合だけtrueにする。

| 対象               | required invariant                                     | 検査時点                                       |
| ------------------ | ------------------------------------------------------ | ---------------------------------------------- |
| home               | canonical absolute userInfo home                       | effect前 / final                               |
| parent             | current EUID、directory、exact `0700`、realpath一致    | create前後、held pre / post、pathname final    |
| key                | current EUID、regular、exact `0600`、nlink 1、size 32  | held after write / after fsync、pathname final |
| identity           | parent / keyのdev・inoがheldとpathnameで一致           | pre / post / final                             |
| contents           | OS CSPRNGから32 bytes、stagingへのwrite / readback一致 | file fsync前                                   |
| file durability    | held staging / final inode descriptor `fsync` success  | final link前                                   |
| name durability    | final hard link後のheld parent `fsync` success         | staging unlink前                               |
| cleanup durability | staging unlink後のheld parent `fsync` success          | receipt mint前                                 |
| cleanup            | file / parent closeがsettled success                   | receipt mint前                                 |

`fsync` successはlocal filesystemが返したdurability境界であり、hardware故障、filesystem bug、backup、cross-machine replicationをclaimしない。success後もkey authorityはexecutionごとにfileをauthoritatively reopenし、held pre / post metadataとbytesを再検証する。provision receiptは将来のexecution tokenではない。

## 7. entropy、public metadata、zeroization

key materialはproductionでは`crypto.randomFillSync`でfresh module-private 32-byte viewへ直接生成する。test random viewはcaller-ownedのまま変更せず、内部copyだけをzeroizeする。random bytesとwrite / readback用の内部copyは、success / failureの両pathでzeroizeする。secretをstring、JSON、Error message、log、metric、test snapshot、command lineへ変換しない。

provision receiptは`key_instance_id`もkey hashも返さない。これはcreate-only provisionerをkey-reading / cryptographic enrollment authorityへ拡張しないための意図的な境界である。receiptはpublication方式、UID、mode、bytes、nlink、file fsync、final-link後directory fsync、staging cleanup、cleanup後directory fsync、held revalidationだけを記録する。

したがってconnectorが要求する`expectedKeyInstanceId`は、このprovision receiptだけからは得られない。actual provisioning後、既存key authorityと同じdomainでIDを取得してtrusted control-plane recordへ固定する別のaudited enrollment stepが必要である。そのstepが実装・承認されるまでproduction connectorは開始しない。

zeroizationはfinal byte revalidationの直後、次のawaitより前にcaptured intrinsicで同期実行し、直後に全byteが0であることを確認する。test-only observerは内部copyのzeroizationを確認できるが、production wrapperでは存在しない。ただしJavaScript heap、kernel page cache、SSD wear levelingから物理的残留を完全除去したというclaimはしない。

## 8. crash、failure、retry matrix

exclusive createはoverwriteを防ぐ一方、crash途中のslotを自動修復しない。曖昧なstateを「もう一度32 bytes書けばよい」と扱わず、次のmatrixへ固定する。

| terminal point                    | diskで観測し得るstate                 | readiness                   | 同じprovisionerのretry                                               |
| --------------------------------- | ------------------------------------- | --------------------------- | -------------------------------------------------------------------- |
| parent create前                   | parent / key absent                   | `not-provisioned`           | 原因除去後にsafe retry                                               |
| parent create後、key create前     | safe `0700` parent、key absent        | `not-provisioned`           | same parentをvalidateしてsafe retry                                  |
| random生成後、`O_EXCL`失敗        | existing entryは不変                  | existing metadata次第       | overwriteせずreconciliation                                          |
| staging create後、final link前    | final absent、0〜32-byte staging      | keyは`absent`               | owned stageをidentity確認後unlink + dir syncできた場合だけsafe retry |
| hard-link開始後、link fsync前     | final / stagingの有無・durability不明 | `unsafe`または`ready`       | 必ずname / inode reconciliation                                      |
| link fsync後、staging unlink前    | final / stagingはsame inode、nlink 2  | `unsafe`                    | committedとしてstaging cleanupをfinish                               |
| staging unlink後、cleanup fsync前 | final-only same inode、nlink 1        | metadata上`ready`になり得る | committedとしてsync / revalidateをfinish                             |
| cleanup fsync後、receipt前        | durable final、receiptなし            | `ready`                     | existingを再provisionせずreceipt recovery手順へ                      |
| receipt後                         | durable key + non-secret metadata     | `ready`                     | rerun不要。rotation / enrollmentは別workflow                         |

same-process failureとretryはheld staging inodeを基準にreconcileする。finalとstagingが同じheld inode / nlink 2ならcommit済みとしてstaging unlinkとdirectory syncを完了し、finalだけがsame held inode / nlink 1ならsync / final revalidationを完了する。final absentでstagingだけがsame held inode / nlink 1ならnot committedとしてstaging cleanupする。競合finalが別inodeでも、自分のheld stagingだけをidentity確認後にunlinkしてparentをsyncできる。identity driftやどちらとも断定できないstateは触らずmanual reconciliationへ送り、published / competing finalを自動削除して別keyへ差し替えない。

public errorはown fieldsを`name`、`message`、sanitized fixed `stack`、`phase`、`durability`、`may_have_committed`、`retry_disposition`だけへ固定する。`cause`、raw filesystem error / code、absolute path、key bytesを含めない。test-only `observeFailureForTests`はraw failureを検証できるがproduction wrapperには存在しない。

## 9. readiness before / afterとtest-production boundary

2026-07-13の実machine read-only probeは次だった。

| probe               | status            | parent      | key         |                bytes read | create / write |
| ------------------- | ----------------- | ----------- | ----------- | ------------------------: | -------------: |
| before provisioning | `not-provisioned` | `absent`    | `absent`    |                         0 |              0 |
| after provisioning  | **pending**       | **pending** | **pending** | provisioner facts pending |   actual run 0 |

provisioner implementation testではtemporary homeとsynthetic entropyだけを使う。そこでafter readinessが`ready`でも、receiptはtest-only boundaryであり、actual userInfo home、production entropy、production key instanceの証拠にはしない。actual provisioning後は別process / fresh invocationのmetadata-only readinessで`ready`を確認し、その後もkey authorityのauthoritative reopenを省略しない。provision receipt自身はinstance IDを持たない。

production provisionerをtestから呼ばないこと、test coreがfixed real homeへ到達できないこと、production wrapperがinjected dependencyを受けないことをsource-boundary testへ含める。actual key createはunit test / PR CI / deploy hookのどこからも発火させない。

## 10. 発見、途中データ、未完了evidence

| 発見 / evidence                              | 現在わかること                                            | まだ言えないこと                         |
| -------------------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| readinessは実machineで`not-provisioned`      | parent / key absent、read / write 0                       | provisioner success                      |
| `O_EXCL`はretry semanticsも変える            | overwriteを防ぐ代わりにambiguous existingを自動修復しない | crash recovery完了                       |
| file fsyncだけでは不足                       | final link後とstaging cleanup後にparent fsyncが必要       | hardware故障ゼロ                         |
| staged hard linkはpartial finalを隠す        | publication前のshort writeはstaging内に留まる             | crash orphan reconciliation              |
| 32-byte exact fileでもreceipt lossはあり得る | metadata-readyとtransaction evidenceは別                  | trusted expected key instance enrollment |
| manual redirectionはcontractを構成できない   | dedicated code / testsとsealed reviewが完了               | production execution                     |
| live weight activation 0、対局0              | 現行live評価関数は不変                                    | 棋力向上                                 |

| delivery check                                        | status                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| provisioner source implementation                     | **completed**                                                                        |
| focused provisioner unit tests                        | **27 / 27 PASS**                                                                     |
| related authority / readiness / provisioner Vitest    | **49 / 49 PASS、3 files**                                                            |
| full Vitest                                           | **2,146 / 2,146 PASS、118 files、162.76s、12 workers**                               |
| Python ML regression                                  | **58 / 58 PASS**                                                                     |
| TypeScript / ESLint / Prettier / diff-check / build   | **PASS**                                                                             |
| sealed code / test review                             | **P0 = 0、P1 = 0、P2 = 0**                                                           |
| ready-for-review PR / review comments                 | **#458 OPEN / ready、Gemini・Copilot actionable 0、unresolved threads 0**            |
| branch CI on head `89ef381`                           | **PASS: Test/build 8m07s、E2E 3m53s、Darwin 49s、audit 18s、Vercel / Preview green** |
| final docs-only head CI / merge                       | **pending / pending**                                                                |
| actual fixed-path provisioning                        | **0 / pending explicit approval**                                                    |
| production connector execution                        | **0**                                                                                |
| training / candidate weight / live activation / games | **0 / 0 / 0 / 0**                                                                    |

buildはNext compile 20.1s、TypeScript 18.2s、static generation 193 pages / 13 workersで完了した。出力は既存のFirebase / cookies warningだけで、新しいbuild errorはない。focused 27 testsにはsuccess / unsafe namespace / race / stale staging / real production home exclusion / zeroizationと11 failpointsが含まれる。final-head CI、merge、actual provisioningのpendingをPASSと読み替えない。

GitHub initial CI run `29299536980`ではhead `89ef381`に対してTest/build 8m07s、E2E 3m53s、Darwin 49sが成功し、Security Audit run `29299536976`も18sで成功した。Vercel / Preview Commentsもgreenである。GeminiとCopilotはsummary reviewを返したがinline / actionable commentは0、review threadも0だった。この段落を追加するdocs-only evidence reconciliation headも同じrequired checksを通してからmergeする。

## 11. provisioning後も100 → 500 → 24,000を飛ばさない

provision成功はteacher-data productionを可能にするmetadata prerequisiteであって、評価関数を強くする処理ではない。順序は次で固定する。

1. ready PR #458のdocs-only final headでもrequired CIを完了し、通常merge commitで統合する。
2. 別の明示承認でproduction wrapperを一度だけ実行し、non-secret provision receiptを保存する。
3. fresh readinessが`ready`であることを確認し、別のaudited enrollmentで`key_instance_id`をtrusted recordへ固定してからconnectorへexpected instanceを事前入力する。
4. holdoutを開かず100-parent durable prefixを実行し、throughput、candidate count、timeout、score / mate distribution、resume、残留process、durabilityを監査する。
5. 100 gateの人手承認後だけcumulative 500へ進み、実測ETAとfailure rateを更新する。
6. 500 gateの人手承認後だけ同じwork streamを24,000 authenticated sealまでresumeする。
7. その後に3-seed QAT、fresh selection / final holdout、regression、production parity、formal color-swapped A/Bを別gateで行う。
8. 事前固定したpromotion ruleを全て通った場合だけcandidate weightとlive activationを別PR / rolloutで扱う。

100 / 500 / 24,000は棋力の証拠ではない。stable高段levelのclaimには、最後のformal A/Bと運用後の独立対局証拠が必要である。key provision、PR merge、application deployのいずれもproduction weightを上書きせず、現時点のlive環境は変更されていない。
