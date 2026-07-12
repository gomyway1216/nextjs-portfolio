# authorized private stageをdurable publicationへ移すtransaction

> [private-stage authorization](./blog-shogi-floodgate-teacher-stage-authorization.md)はstageとlease markerのexact inodeをheld descriptorで所有できるようにしたが、従来の`lease.close()`とdirectory renameを安全に合成できなかった。このPRはexact lease objectの所有権をpublication transactionへ一度だけ移し、exclusive rename、独立したnamespace reconciliation、destination reopen、parent fsync、exact marker removalを1つのlifecycleにする。これはcontent-agnosticなnamespace publicationだけであり、[proposal checkpoint](./blog-shogi-floodgate-stable-proposal-checkpoint.md)のMAC検証、consumer postflight、engine authentication、teacher label、学習、棋力の証拠ではない。real training data、selection、fresh / legacy final holdoutは読んでいない。English version: [blog-shogi-floodgate-stage-publication-transaction.en.md](./blog-shogi-floodgate-stage-publication-transaction.en.md)

---

## 1. `close -> rename`と`rename -> close`はどちらも成立しない

従来のstage leaseは、`close()`時にauthorized stageが元の`stageRoot`に残り、destinationが存在しないことを再検証してからlease markerを削除する。このcontractへrenameをそのまま足すと、順序の両側で安全性が壊れる。

| 順序              | 問題                                                                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `close -> rename` | markerを削除してparent / stage / lease descriptorを閉じたあとにrenameするため、exclusive ownershipとheld-inode evidenceを失う              |
| `rename -> close` | stageはdestinationへ移っているため、元pathにstageがあることを要求する`close()`が失敗する。marker removalとdescriptor cleanupも完了できない |

必要なのは、`close()`の前後へrenameを差し込むことではない。exact lease objectが持つparent、stage、leaseのdescriptorとmarker removal authorityを、新しいtransactionへ不可逆に移すことである。transactionはrename後もmarkerを保持し、destinationとdurabilityを確認してからだけ削除する。

## 2. exact lease ownership transferとfirst-call-wins

`beginFloodgateTeacherStagePublication(lease)`はproduction registry、`beginFloodgateTeacherStagePublicationCoreForTests(lease, dependencies)`はtest-only registryから、exact object identityのactiveかつ未claimのleaseだけをconsumeする。copy、Proxy、別registryのlease、close済みlease、二度目のbeginは通らない。test APIではdependency objectを読むより前にexact leaseをlookupするため、偽leaseからgetterを起動する余地も作らない。

beginが成功した同期時点でownershipは`lease`から`publication`へ移る。callerへ公開するtransaction fieldは次の固定されたsurfaceだけで、held descriptorやmarker removal functionそのものは渡さない。

```text
phase
authorizationReceipt
stageRoot
destinationRoot
commit()
abort()
```

`commit()`と`abort()`は、最初の呼び出しが最初の`await`より前にwinnerを同期確定する。同じwinnerの再呼び出しは同一Promiseを返し、loserはownership-transfer errorになる。begin後の元の`lease.close()`も常に拒否される。この拒否はtransactionが`committed`または`aborted`になったあとも変わらず、古いauthorization cleanupへ再入してdescriptorやmarkerを二重処理しない。

`abort()`はrenameを始めず、従来の厳しいstage / destination / protected-path再検証を通してleaseを閉じる。`commit()`だけがpublication lifecycle全体を所有する。

## 3. production primitiveは固定し、failure seamはtestへ隔離する

production entry pointはdependency injectionを受け取らず、[exclusive directory rename primitive](./blog-shogi-floodgate-exclusive-directory-publication.md)を固定して使う。成功receiptの`execution_boundary`は次で区別される。

```text
production-fixed-exclusive-rename
test-only-injected-exclusive-rename
```

test-only entry pointだけがexclusive rename、reconciliation前、destination reopen前、2回のparent sync、exact marker removal、descriptor closeへbounded seamを注入できる。これによりrename前後のthrow、fsync failure、path swap、cleanup failureをsynthetic fixtureで再現できる一方、production callerがweaker renameへ差し替えるAPIは存在しない。

productionとtestのruntime registryも分離される。production leaseをtest beginへ、test leaseをproduction beginへ渡してもauthorityは移らない。両境界ともsingle-useであり、transaction開始後にgeneric checkpoint claimや元のcloseへauthorityを戻す経路はない。

## 4. rename receiptとnamespaceを独立に判定する

commit preflightは、held parent / stage / lease、destination absence、stage entry metadata、protected-path identityを再検証し、authorized stageと同じinodeを指すfresh source directory handleを開く。そのhandleを保持したままexclusive renameを呼ぶ。

rename callのreturn / throwだけではcommit結果を決めない。call後はsourceとdestinationをそれぞれ2回、独立に`lstat`し、authorized stage inodeがどちらにあるかを次のtruth tableで判定する。

| source namespace                 | destination namespace           | 判定                                                                          |
| -------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| exact authorized stage、2回一致  | 2回ともabsent                   | `NotCommitted`。元stageを保持したままauthorization cleanupを試みる            |
| 2回ともabsent                    | exact authorized stage、2回一致 | rename済み。後続のdestination reopen / durabilityへ進む                       |
| replacement、foreign、両方存在等 | 上記2状態以外                   | `Indeterminate`。markerを保守的に残し、blind retry / delete / consumeをしない |

exclusive renameがsuccessを返した場合は、contract、trust boundary、`verified-committed` status、parent identity、destination identityがexactなreceiptも必要である。receiptが正しくてもnamespaceがsourceのままなら`NotCommitted`であり、receipt mismatchのままdestinationへ動いていれば`Indeterminate`になる。

一方、rename helperがexact moveのあとにthrowした場合は、namespace observationをauthoritative evidenceとして後続へ進める。throwだけを理由にsourceへ戻すことも、同じrenameを再実行することもしない。つまりreceiptとnamespaceは別々に検証し、実際の配置は独立したnamespace reconciliationで決める。

## 5. destinationをreopenし、entryとprotected pathを再検証する

destinationにexact stage inodeがあると分類したあとも、pathの存在だけではpublication成功にしない。destinationを`O_NOFOLLOW | O_DIRECTORY`でreopenし、current EUID owner、exact `0700`、authorized stageと同じdevice / inodeであることを確かめる。さらにheld parent、destination、lease markerのdescriptor / path identityを照合する。

stage entry inspectorはheld directory FDに対して、allowlist内のname、regular-file type、current-EUID owner、exact `0600`、link count 1、protected inodeとの非aliasを2 snapshotで検証する。repository root、raw / role lock、role bundle、legacy protected-position IDs、engine binary / receipt、inspector Python、任意のeval directoryとabsolute engine argumentも、authorization時のidentityから変わっていないことを再検証する。

ここで検証するのはmetadataでありcontentではない。`work.jsonl`、将来の`result.json` / `manifest.json`、train / val artifactのbytes、SHA-256、MAC chain、record schema、cross-bindingはparseしない。current EUIDを持つtrusted writerがcritical section中にnamespaceを排他的に扱う前提であり、悪意あるsame-EUID actorとのrename / rewrite raceをOS levelで遮断するsandboxではない。

## 6. parent fsyncを2回行い、exact markerだけを削除する

destination reopenと再検証が通ったあとのdurability orderは固定される。

1. held parent directoryをfsyncし、stage-to-destination renameをdurableにする
2. parent、destination、lease、stage entry metadata、protected pathをもう一度再検証する
3. held lease descriptorをcloseする
4. marker pathがauthorized leaseのcurrent-EUID-owned exact `0700` inodeであることを確認し、そのexact directoryだけを`rmdir`する
5. held parent directoryを再度fsyncし、marker removalをdurableにする
6. parent / destination identityを再検証し、source pathとmarker pathがabsentであることを確認する
7. 全descriptorをcloseしてからfrozen receiptを返す

最初のparent fsync後は`renamed-parent-synced`、2回目のparent fsync後だけ`published-and-lease-removal-durable`になる。marker名が同じでもreplacement inodeは削除しない。2回目のfsyncが失敗した場合、現在のpathでmarkerが見えなくてもcrash後のremoval durabilityを確定できないため、`leaseMayRemain`は保守的に`true`のままにする。

成功receiptのfield setは次だけである。

```text
contract, trust_boundary, status, claim_boundary, execution_boundary,
publication_durability, parent_identity, destination_identity,
lease_identity, stage_basename, destination_basename
```

statusは`verified-durable-exclusive-publication`、claim boundaryは`namespace-publication-only-not-content-authentication-consumer-postflight-training-teacher-label-or-playing-strength-evidence`で固定する。

## 7. typed failureはprimaryとcleanupを混ぜない

rename前のpreflight failure、または独立reconciliationでexact stageがsourceに残ったことを確定できた場合だけ、`FloodgateTeacherStagePublicationNotCommittedError`を返す。`mayHavePublished` / `mayHaveCommitted`はともに`false`である。それ以外のpost-rename ambiguity、destination reopen failure、fsync / marker removal / final recheck / cleanup failureは`FloodgateTeacherStagePublicationIndeterminateError`で、両facetは`true`になる。

両errorはrecovery判断に必要なfacetを保持する。

```text
phase
primary
cleanupFailures[]
publicationDurability
destinationReopened
leaseMayRemain
mayHavePublished / mayHaveCommitted
```

failure phaseは`preflight`、`rename`、`reconcile`、`destination-reopen`、`parent-sync-before-lease-removal`、`lease-removal`、`parent-sync-after-lease-removal`、`cleanup`から選ぶ。最初のsemantic / durability failureを`primary`として保存し、その後のdescriptor close failureは`cleanupFailures`へ別に集め、各handleを1回だけcloseする。

`leaseMayRemain`は「いまpathが見えるか」より保守的なrecovery facetである。exact marker removalと2回目のparent fsyncが完了するまで原則`true`を維持する。2回目のfsyncまで完了したあとのdestination / stage / parent close failureならpublication durabilityは完成済み、`leaseMayRemain: false`を保持したまま`cleanup`のIndeterminateを返す。

## 8. receiptはcontent-agnosticで、trust boundaryは狭い

このtransactionが検証するのは、current-EUID-owned exact-private parent内で、authorized stage inodeがexclusive destinationへ移り、authorization marker removalまでparent directoryへdurableになったというnamespace lifecycleだけである。receiptはfrozenされ、parent / destination / lease identityとbasenameをbindするが、artifact content digestは持たない。

| このPRが示すこと                                                   | このPRが示さないこと                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| exact lease objectからtransactionへのsingle-use authority transfer | checkpointのHMAC chain、result / manifest contentのauthentication         |
| exclusive rename後のsource / destination reconciliation            | training-row consumer callbackとpostflight / closeが成功したこと          |
| destination reopen、metadata / protected-path revalidation         | engine binaryを実行したこと、teacher score / labelが正しいこと            |
| renameとmarker removalに対する2段階のparent-directory durability   | real dataset、学習済みweight、production int16、accuracy、Elo、段位、棋力 |

exact `0700` / `0600`とcurrent EUIDの検証はaccidental exposureと別UID writerを狭めるが、root、ACL / pre-existing capability、hostile same-EUID actorを排除する証明ではない。callerはtrusted-writer critical sectionを別途成立させる必要がある。

したがって、valid publication receiptだけを見てもpublished directoryをteacher artifactとしてconsumeしてはいけない。次のcontent finalizerがcheckpoint、result、manifest、input / output bindingを認証し、consumer postflight後のcomplete setを再検証する必要がある。

## 9. synthetic evidenceと現在地

この変更はtemporary directoryとsynthetic `work.jsonl`だけで検証した。publication transaction testは32 / 32、stage authorization、exclusive rename、proposal checkpointを含むrelated testは180 / 180を通過した。copy / Proxy / duplicate claim、production / test registry isolation、close / begin race、commit / abort first-call-wins、rename前後のthrow、receipt mismatch、全namespace truth-table branch、destination symlink / replacement / wrong mode、parent swap、2回のfsync failure、marker removal failure、descriptor cleanup failureを回帰対象にする。

| validation                                               | 結果      |
| -------------------------------------------------------- | --------- |
| `floodgateTeacherStagePublication.test.ts`               | 32 / 32   |
| publication + authorization + rename + checkpoint suites | 180 / 180 |

fixtureは1件のsynthetic private `work.jsonl`を使い、bytes preservationを確認するだけである。checkpoint MACをこのtransactionが検証したとは主張しない。real Floodgate row、selection label、fresh final holdout、legacy final holdoutは入力していない。engine search、teacher generation、training、A/B matchも実行していないため、このtest countは棋力evidenceではない。

## 10. 次はauthenticated finalizer、そのあとsynthetic coordinator

次の独立PRでは、MAC-authenticated proposal checkpointからconsumer postflight後のresult / manifestを作り、exact file set、bytes、digest、run / input / proposal / output cross-bindingを検証するcontent finalizerを実装する。そのfinalizerが成功したartifactだけを、このtransactionへ渡せるcontractにする。

その次に、training-row consumer、stable proposer、durable checkpoint、authenticated result / manifest finalizer、publication transactionを1つのsynthetic coordinatorへ接続する。crash / retry / stale-marker recoveryをsynthetic failure matrixで閉じてから、production engine authorityとreal teacher runnerへ進む。

このPRの結論は狭い。`lease.close()`とrenameの合成不能を、exact ownership transferとfirst-call-wins transactionで解消し、rename、namespace truth、destination reopen、parent fsync #1、exact marker removal、parent fsync #2、final recheckを1つのdurable namespace lifecycleにした。しかしcontent authentication、consumer postflight、engine、teacher、training、strengthはまだ未完成である。評価関数へweightを上書きせず、まず次のauthenticated finalizerとsynthetic coordinatorを閉じる。
