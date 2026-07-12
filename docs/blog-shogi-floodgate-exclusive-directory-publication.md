# postflight後にdirectoryを非置換で公開する — Darwin exclusive directory publication primitive

> [前段のpathless staging core](./blog-shogi-floodgate-pathless-teacher-staging.md)は、consumer callback内で作るcandidate stageと、consumer postflight後にだけ行うfinal publicationを分離した。v1 reviewで、parent FDだけではsource inodeの移動結果やhelper実行境界を十分に閉じないことが分かった。本PRのv2 primitiveは、caller-held source FDをFD 4として保持し、current-euid ownershipとexact `0700`、SHA固定helper、root-owned system Python、bounded subprocess、read-only reconciliationを加えたうえで、Darwin `renameatx_np(RENAME_EXCL | RENAME_NOFOLLOW_ANY)`をplain rename fallbackなしで呼ぶ。成功はfrozen verified receiptとして返す。ただしproduction runner、consumerとの接続、content integrity、fsync / durability transaction、teacher result receipt、real data、teacher searchはこのPRの範囲外である。selectionとfinal holdoutは未読であり、棋力evidenceもない。English version: [blog-shogi-floodgate-exclusive-directory-publication.en.md](./blog-shogi-floodgate-exclusive-directory-publication.en.md)

---

## 現在地

| 項目                                   | 状態       | v2で確認する境界                                                                    |
| -------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| Darwin exclusive directory rename      | 実装済み   | `renameatx_np`を`RENAME_EXCL \| RENAME_NOFOLLOW_ANY`で呼ぶ                          |
| held parent / source FD                | 実装済み   | parentをFD 3、caller-held sourceをFD 4としてbasenameとinodeを束縛する               |
| ownership / mode                       | 実装済み   | parentとsourceをcurrent-euid-owned exact `0700`として前後に確認する                 |
| helper / interpreter boundary          | 実装済み   | pinned helper bytesとOS-managed `/usr/bin/python3`だけを実行境界に入れる            |
| bounded helper / reconciliation        | 実装済み   | 5秒・4096-byte cap後も`close`を待ち、read-only `inspect`でheld inodeをreconcileする |
| existing destinationの非置換           | 実装済み   | empty directoryを含む既存entryを置換しない                                          |
| typed outcome / receipt gate           | 実装済み   | verified receipt、NotCommitted、Indeterminateを区別する                             |
| plain `rename` fallback                | なし       | Darwin primitiveを使えなければfail closed                                           |
| content integrity / fsync / durability | caller責務 | このprimitiveはartifact内容やcrash durabilityを保証しない                           |
| production runner / consumer接続       | 未実装     | consumer postflight後に呼ぶ一段上のtrusted writerは別PR                             |
| real data / teacher / search           | 未実行     | training rows、engine、teacher labelsをこのPRでは読んでいない                       |
| selection / final holdout              | 未読       | role selectorもselection / final pathも受け取らない                                 |
| strength claim                         | なし       | これはnamespace primitiveであり、teacher値や棋力のevidenceではない                  |

ここでいう「実装済み」は、trusted-writer critical section内でcaller-held source inodeのnamespace移動をreconcileし、成功receiptまたはcommit可能性付きerrorを返すprimitiveができたという意味である。completeなteacher artifactを生成・公開した、またはconsumer postflightを実bundleで完走した、という意味ではない。

## 1. plain renameではなぜ足りないのか

B2が必要とする境界は、「private stageが完成し、consumer全体のpostflightが成功するまでfinal pathnameを見せず、その後にcomplete directoryを一度で公開する」である。sourceとdestinationが同じfilesystemにあればdirectory rename自体はatomicだが、plain renameには別の問題がある。

destinationに既存のempty directoryがある場合、plain renameはそれを置換できる。したがって次のprecheckだけでは安全にならない。

```text
lstat(final) -> ENOENT
attacker or competing publisher creates final/
rename(stage, final)
```

checkとrenameの間に競合が入るためである。既存entryがfileやsymlinkなら拒否できても、empty directoryだけを置換する余地を残したAPIは「no-clobber publication」ではない。

このPRはrename syscall自体へ`RENAME_EXCL`を渡す。destinationがfile、symlink、empty directory、non-empty directoryのどれであっても、既に存在すれば置換しない。Nodeのplain `fs.rename`へfallbackする経路もない。さらにv2はrename childのexit codeだけでcommitを推測せず、callerが保持するsource FDを後続のread-only `inspect`で照合して結果を確定する。

## 2. exact `0700`はtrust assumptionを置き換えない

このprimitiveが明示するtrust boundaryは`trusted-current-euid-writer-private-0700-parent-v1`である。wrapperとhelperは、held parent、parent pathname、caller-held source、source pathnameがcurrent EUID所有のdirectoryであり、permission bitsがexact `0700`であることをrename前に確認する。rename後もheld parent、parent pathname、held source、destination pathnameに同じownership / mode条件を課す。

しかしexact `0700`はsandboxではない。同じUIDで動く別process、root、ACLで権限を与えられたactor、または既にFDなどのcapabilityを持つactorからのaccessやmutationは止めない。root自体をadversaryとして排除できるという主張もない。

したがってcallerは、parentとsourceに対するsame-UID / root / ACL-based accessやpre-existing capabilityを持つuntrusted actorが競合しない、trusted-writer critical sectionを所有しなければならない。この仮定を置けない環境では、mode checkが通ってもこのprimitiveだけでpublication boundaryは成立しない。

## 3. held parent FD 3とcaller-held source FD 4

sourceとdestinationはcanonicalなabsolute pathで、同じparentを持つdistinct siblingでなければならない。

```text
/private/publish-parent/
├── teacher-stage-<token>/   source
└── teacher-final/           destination; rename前は不存在
```

wrapperはparentの`realpath`が要求pathと一致することを確認し、`O_NOFOLLOW | O_DIRECTORY`でparentをopenして保持する。sourceについてはcallerがopen済みdirectory `FileHandle`を必須引数として渡し、そのhandleをpromiseがsettleするまでopenかつunmodifiedに保つ。wrapperは両descriptorの`fstat`とpathnameの`lstat`を比較し、期待した`dev / ino`、ownership、exact `0700`、sourceの`realpath`を確認する。

rename childとreconciliation childには次だけを渡す。

1. held parent directory descriptorをFD 3
2. caller-held source directory descriptorをFD 4
3. `/`、NUL、control character、`.`、`..`を許さないdistinct source / destination basename
4. held sourceのexpected `dev / ino`

helperもFD 3とFD 4を`fstat`し、current-euid-owned exact `0700`とexpected source identityを再確認する。renameは概念上、同じparent FDを両側へ使う次の形である。

```text
renameatx_np(parent_fd, source_basename,
             parent_fd, destination_basename,
             RENAME_EXCL | RENAME_NOFOLLOW_ANY)
```

same-parent sibling制約、held parent、held sourceを組み合わせることで、absolute pathnameの再解釈だけに結果判定を依存しない。

## 4. helper bytesとsystem Pythonのexecution boundary

production wrapperが起動するinterpreterは固定の`/usr/bin/python3`である。起動前にcanonical real pathでsymlinkを通らないこと、real regular fileであること、root-ownedであること、いずれかのexecute bitがあること、group / other writableでないことを確認する。これはOS-managed system Pythonをtrust boundaryに置くという契約であり、root compromiseに耐えるという意味ではない。

Python helper sourceもpathnameからそのまま実行しない。wrapperはhelperを`O_NOFOLLOW`でopenし、current-EUID-owned exact `0644`のregular file、link count 1、1 byte以上65536 bytes以下であることを確認する。read前後のdescriptor / pathname statが同じstable inodeを表すこと、read bytes数がsizeと一致すること、SHA-256がsourceに固定された値と完全一致することを検証し、fatal modeでstrict UTF-8 decodeする。

検証済みのdecoded sourceは、helper pathnameを再openせず、次の形でin-memory codeとして実行する。

```text
/usr/bin/python3 -I -S -c <decoded pinned helper source> ...
```

childのworking directoryは`/`、`LANG`と`LC_ALL`は`C`、`PYTHONHASHSEED`は`0`に固定する。helperはDarwin libcの`renameatx_np`へ`RENAME_EXCL | RENAME_NOFOLLOW_ANY`を渡す。platform、required flags、pinned helper、system Python、またはsyscall contractを満たせない場合にplain renameへ切り替える処理はない。

## 5. bounded childとread-only reconciliation

rename childと`inspect` childには、それぞれ5秒のtimeoutとstdout / stderr合計4096-byteのcapture上限がある。どちらかを超えれば`SIGKILL`を送り、wrapperはchildの`close` eventまで待ってから先へ進む。これによりFD 3 / FD 4を継承したchildが残ったまま結果を返さない。

rename helperがspawnした後は、そのexit code、signal、timeout、output、diagnosticだけでcommit / non-commitを決めない。同じpinned sourceを`inspect` modeで別processとして起動し、held source inodeのlocationを照合する。`inspect` modeはrename syscallを呼ばず、FD 3 / FD 4の`fstat`とheld parentに相対なsource / destinationのnon-following statだけを行い、exactに次の1つを返す。

| `inspect`結果 | 意味とwrapperの扱い                                                           |
| ------------- | ----------------------------------------------------------------------------- |
| `source`      | held source inodeがsourceだけにある。NotCommittedとして扱う                   |
| `destination` | held source inodeがdestinationだけにあり、sourceは不存在。追加postcheckへ進む |
| `other`       | どちらか一意に確定できない。Indeterminateとして扱う                           |

`inspect`自体をspawnできない、timeout / output capに達する、出力がstrictでない場合もIndeterminateである。たとえばexisting empty directoryとのraceでrenameが`EEXIST`になり、`inspect`がheld inodeを`source`に確認した場合はNotCommittedになる。一方、rename childがspawnしたのにreconciliationできない場合は、diagnosticからcommitしていないと推測してはならない。

`destination`を得た後、wrapperはparent descriptor / pathname、source descriptor / destination pathnameのidentityとownership / exact `0700`を再確認し、source pathnameが不存在であることを検査する。これらが完了して初めてverified receiptを作る。

## 6. verified receiptだけをconsume gateにする

成功時に返すreceiptは次のshapeを持つ。

```text
contract: darwin-renameatx-np-excl-nofollow-any-held-parent-source-v2
trust_boundary: trusted-current-euid-writer-private-0700-parent-v1
status: verified-committed
parent_identity: { dev, ino }
destination_identity: { dev, ino }
```

receipt本体とnested identityはfreezeされる。`destination_identity`はcaller-held sourceと同じinodeである。これは検証したnamespace移動のreceiptであり、pathnameが存在するという観察とは区別する。

| outcome                                      | `mayHaveCommitted` | callerの扱い                                              |
| -------------------------------------------- | ------------------ | --------------------------------------------------------- |
| frozen verified receipt                      | —                  | このoutcomeだけがconsumerによるdestination利用を認可する  |
| `FloodgateExclusiveRenameNotCommittedError`  | `false`            | primitiveがnon-commitを確定した。成功として扱わない       |
| `FloodgateExclusiveRenameIndeterminateError` | `true`             | commitした可能性がある。上位のrecovery / quarantineへ渡す |

NotCommittedはhelperがrenameを開始しなかった場合、またはspawn後の`inspect`がheld inodeを`source`に確定した場合を表す。Indeterminateはspawn後に`other`になった、`inspect`できなかった、またはdestinationへの移動後のpostcheck / cleanupを完了できなかった場合を含む。rename helper spawn後の未分類failureはcommit可能性を捨てずIndeterminateへ正規化する。成功経路でparent handleの`close`だけが失敗した場合もIndeterminateである。すでに`source`への残留をreconcileしたNotCommitted outcomeは、後続のhandle cleanup failureによってcommit扱いへ変えない。

destination pathnameの存在だけをconsume gateにすることは禁止する。Indeterminateでpathを見て成功扱いする、blind retryする、destinationを削除する、またはそのままconsumeすることも禁止する。上位callerはverified receiptを必須gateとしなければならない。ただしそのreceiptはdirectory content、file bytes、fsync、crash durabilityのevidenceではない。

## 7. fsyncとartifact closureはcallerが完成させる

atomic namespace renameとcontent integrity、crash後のdurabilityは別の保証である。このprimitiveはdirectory内のfileをparse / hashせず、staged file、stage directory、parent directoryをfsyncしない。

一段上のtrusted publisherはcritical sectionを保ち、少なくとも次の順序を所有しなければならない。

1. consumer callback内でstageを生成し、stage fileのFD / inode / bytesをsealする
2. callback return後にconsumer postflightとdescriptor `close`が成功したことを確認する
3. postflightを跨いでstageとengine / eval等のprotected inputが変わっていないことを再検証する
4. final rootへ含めるexact artifact setと各file contentを検証し、各fileをfsyncする
5. stage directoryをfsyncする
6. caller-held source FDをopenかつunmodifiedに保ったままこのprimitiveを呼び、verified receiptを必須とする
7. parent directoryをfsyncする
8. final pathを再openし、root inode、exact entries、mode、bytes、SHA-256、manifest / result receiptのcross-bindingを検証する

B1の`train.jsonl`、`val.jsonl`、`manifest.json`、`work.jsonl`や、将来の`result.json`をcomplete setとして認可する責務はcallerに残る。missing file、extra temp file、same-byte inode replacement、in-place rewrite、manifest mismatch、fsync / durabilityはこのprimitiveの保証ではない。teacher production result receiptも、このnamespace rename receiptとは別に上位transactionが構築する。

## 8. 検証snapshot

| validation                      | 結果              | このPRで確認した範囲                                         |
| ------------------------------- | ----------------- | ------------------------------------------------------------ |
| local Darwin adversarial Vitest | 28/28 PASS        | 実syscall、race、inode swap、mode、helper、異常後reconcile   |
| full Vitest                     | 1,487/1,487       | repository全97 test file                                     |
| Python ML stdlib                | 58/58 PASS        | 既存ML protocol / audit regression                           |
| TypeScript                      | PASS              | `tsc --noEmit --incremental false`                           |
| ESLint                          | 0 error           | 157 existing repository warnings                             |
| Next production build           | PASS              | 193 pages                                                    |
| CI platform gate                | 設定済み          | macOS全28件、Ubuntu portable 15件＋SHA / `py_compile`        |
| independent final audit         | P0–P2 findingなし | post-fix code / helper / tests / 日英contractのread-only照合 |

targeted suiteはtemporary directory、synthetic sentinel bytes、test専用のSHA固定helperだけを使う。precheck後にexisting empty destinationを作る実`RENAME_EXCL` race、caller-held source inodeの差し替え、hookによる移動後throw、`0755` / `01700` directory、`01644` helper、helper symlink / SHA mismatchを含む。さらにrename前のnonzero / timeout / output capをNotCommittedへ、rename後の同じ3異常をdestination reconciliation後のfrozen receiptへ分類する両方向を検証する。real training row、engine、selection、final holdoutはtest inputにしていない。

GitHub Actionsには`macos-latest`のtargeted jobを追加し、Darwin 13件を含む全28件とhelperの`py_compile`を実行する。Ubuntuの通常jobでも15件のportable test、helper bytesとpinned SHAの無条件照合、`test:ml:stdlib`内の`py_compile`が走る。ここで「設定済み」はworkflowにgateを追加したという事実であり、この表のPASS数はlocal Darwin実行snapshotである。

## 9. このPRが読まず、主張しないもの

このmoduleの入力はsource / destination directory pathとcaller-held source directory handleだけである。role bundle、training JSONL、engine binary、eval tree、teacher score、model checkpointを受け取らない。

| 言えること                                                                         | 言えないこと                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Darwinのheld parent / source FD上でdirectoryをexclusiveにrenameするprimitiveがある | production consumer postflightから実際に呼ばれた                  |
| existing empty directoryを含むdestinationを置換しない                              | trusted-writer critical sectionをrunnerが確立した                 |
| pinned helperとsystem Pythonを検証し、plain renameへfallbackしない                 | complete artifact contentとcrash durabilityを保証した             |
| spawn後にread-only inspectを行い、typed outcomeかfrozen receiptを返す              | complete result receiptやteacher manifestがproduction publish済み |
| selection / final holdoutを選ぶAPIもpathもない                                     | real training dataを読んだ、teacher searchを実行した              |
| receiptが表すparent / destination identityを再確認する                             | teacher値、accuracy、Elo、rank、棋力向上を示した                  |

selectionとfinal holdoutは未読である。training rowsもこのprimitiveからは読んでいない。real dataに対する結果はなく、teacher labelも生成していない。この変更はstrength evidenceではない。

## 10. 結論

この独立PRが閉じるのは、Darwin上の狭いnamespace primitiveである。caller-held source FD 4、held parent FD 3、same-parent sibling、current-euid-owned exact `0700`、pinned helper bytes、root-owned system Python、bounded child、`RENAME_EXCL | RENAME_NOFOLLOW_ANY`、read-only reconciliation、typed outcome、frozen verified receiptを1つのcontractにした。existing empty directoryを置換せず、plain rename fallbackもない。

同時に、このcontractはtrusted-writer critical sectionを仮定する。exact `0700`はsame-UID、root、ACL-based access、pre-existing capabilityを排除しない。verified receipt以外をconsume gateにしてはならず、そのreceiptもcontent integrity、fsync、durabilityを保証しない。

次段のrunnerはconsumer postflight成功後にだけこのprimitiveを呼び、critical section、artifact closure、file / stage / parent fsync、final verification、production result receiptを所有しなければならない。それが実装・実行されるまでは、atomic teacher publicationが完成したとは言わない。このPRはnamespace primitiveのevidenceであり、runner、consumer実行、real data、teacher search、teacher label、または棋力のevidenceではない。
