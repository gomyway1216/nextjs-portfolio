# teacherを走らせる前にprivate stageを認可する — Floodgate stage transaction

> [前段のruntime claim](./blog-shogi-floodgate-consumer-runtime-claim.md)で、production consumerがcallbackへ渡したexact inputを同期entryで一度だけclaimできるようになった。しかし、そのinputを現在のteacher coreへ直結すると、caller任意のstage path、非鍵checkpoint、未完のdurability、欠けているstable proposerまで同時にproduction扱いしてしまう。本PRは接続をまだ行わず、current-EUID所有のexact `0700` publication parent / private stageをdescriptorで保持し、protected inputとのalias・包含を拒否し、exclusive leaseを取得するstage authorizationだけを追加する。成功receiptのstatusは`authorized-private-stage-not-generated-not-published`である。teacher search、consumer、rename publisher、real training rows、selection、final holdoutは実行・参照しない。English version: [blog-shogi-floodgate-teacher-stage-authorization.en.md](./blog-shogi-floodgate-teacher-stage-authorization.en.md)

---

## 現在地

| 項目                                  | 状態     | このPRで閉じる境界                                                   |
| ------------------------------------- | -------- | -------------------------------------------------------------------- |
| canonical publication parent          | 実装済み | symlinkを通らないcurrent-EUID-owned exact `0700` directory           |
| held parent / stage descriptors       | 実装済み | `O_NOFOLLOW \| O_DIRECTORY`でpathと`dev / ino`を束縛                 |
| direct sibling stage / destination    | 実装済み | strict basename、同一parent、相互にdistinct、destinationは不存在     |
| protected-input disjointness          | 実装済み | realpath、inode、双方向のancestor / descendantを拒否                 |
| exclusive stage lease                 | 実装済み | 同じstageへの同時authorizationを拒否し、stale leaseを自動stealしない |
| fixed stage entry allowlist           | 実装済み | resume stageの未知entry、symlink、特殊fileを拒否                     |
| teacher generation / consumer接続     | 未実装   | このmoduleはgeneratorもconsumerも呼ばない                            |
| MAC resume / fsync / result receipt   | 未実装   | 次段でcheckpoint authenticationとdurabilityを閉じる                  |
| stable depth-11 proposer / depth-16   | 未実装   | 事前登録したcandidate unionはまだ完成していない                      |
| real data / selection / final holdout | 未読     | role dataやlabelをこのPRの入力にしない                               |
| strength claim                        | なし     | path / lease authorizationは棋力evidenceではない                     |

ここでいう「authorized」は、private stageとして使えるnamespaceとheld identityを一時leaseしたという意味だけである。artifactが生成された、checkpointが信用できる、consumer postflightが成功した、directoryがpublishされた、またはモデルが強くなったという意味ではない。

## 1. なぜconsumerへまだ接続しないのか

readiness監査では、現在の`stageSiblingTeacherDatasetCoreForTests(...)`をproductionへ昇格できない理由が4つ見つかった。

1. `work.jsonl`の`payload_sha256`はtorn write検出用の非鍵checksumであり、scoreと派生fieldを整合的に再sealするactorを認証しない
2. `atomicWrite(...)`はfileとdirectoryをfsyncせず、consumer postflight後に作るproduction result receiptもない
3. stage、future destination、repository、role bundle、engine / evalのalias・包含関係をheld inodeで認可していない
4. 現行v6 candidate unionはteacher MultiPVと実戦手だけで、事前登録済みrunOp1 fixed-depth-11 moveを含まない

この状態でreal 24,000 parentsを流すと、完走しても事前登録planに適合する学習dataとは判定できない。本PRはまずpath authorityだけを独立させる。

## 2. authorize APIが受け取るもの

production APIは`authorizeFloodgateTeacherStage(...)`、dependency-injected test seamは`authorizeFloodgateTeacherStageCoreForTests(...)`である。callerは次のcategoryを明示する。

- repository、raw lock、role lock、role bundleの各root
- legacy protected-position ID file
- engine binary、engine receipt、engine argument file、optional eval tree
- publication parent
- strict direct-child stage basenameとfuture destination basename

role selector、training JSONL path、selection path、final-holdout path、teacher scoreは受け取らない。protected inputの内容もreadせず、namespace / metadata identityだけを検査する。`engineArgs`はholeのないown data propertyだけで構成するarrayとして同期captureし、accessorやinherited elementは呼び出さず拒否する。各entryはsimpleな`-option` / `--option` tokenか、canonical absoluteで現在存在するregular fileだけを許す。relative path、存在しないfuture path、`--config=/path`のようなinline pathを推測で通さない。

## 3. parentとstageをpathだけでなくdescriptorで保持する

publication parentとstageはcanonical absolute real pathであり、current effective UIDが所有するexact `0700` directoryでなければならない。special mode bit、group / other permission、symlink traversalは拒否する。

両directoryは`O_NOFOLLOW | O_DIRECTORY`でopenし、descriptor `fstat`とpathname `lstat` / `realpath`を照合する。filesystem callbackが返すstat / entry objectはPromiseへ渡す前にscalarだけのfrozen null-prototype snapshotへ変換するため、継承された`Object.prototype.then`によるthenable assimilationでidentityやprotected pathを落とせない。engine argument、entry name、protected snapshot、cleanup failureなどの内部security arrayも、最初のindex writeより前にnull-prototype化するため、継承されたnumeric setterで要素を吸収できない。authorization中はheld descriptorの`dev / ino`がidentity anchorになる。stageが存在しないfresh caseではexact `0700`で作成してからopenし、既存stageを使うresume caseでは固定entry contractを先に検査する。

stageとdestinationは同じheld parent直下のdistinct basenameである。basenameは`.`または`..`そのものであってはならず、slash、backslash、NUL、control characterを含めない。内部の`.`はsafe basename文字として許す。destinationはfile、symlink、empty directory、non-empty directoryのどれであっても存在すればauthorization前に拒否する。これはpublicationではなく、将来のexclusive renameが使うnamespaceを先に予約するpreconditionである。

## 4. protected inputとのdisjointnessは双方向で見る

単なる文字列比較では、symlink、別alias、ancestor / descendant overlapを見落とす。authorizationは各protected inputをrealpathとinodeへ束縛し、publication parent / stageに対して次を拒否する。

- 同じ`dev / ino`
- protected inputがparentまたはstageのancestor
- parentまたはstageがprotected inputのancestor
- 別表記が同じreal pathへ解決されるalias

したがってstageをrepositoryの内側に置くことも、repositoryをstageの内側に置くことも通らない。raw / role lock、role bundle、legacy exclusion、engine / receipt / argument files、eval treeにも同じ規則を適用する。ただしこれはsame-UID、root、ACL actorを排除するsandboxではない。current-EUID writerがtrusted critical sectionを所有するという明示的な境界である。

## 5. exclusive leaseとstale state

authorizationはstageに対応するexclusive sibling leaseを作成し、そのdirectory identityを保持する。同じstageを別process / invocationが同時にauthorizeしようとすると失敗する。既存leaseは「古そうだから」という時刻やPID推測で削除しない。crashでstale leaseが残った場合も自動stealせず、将来のMAC-authenticated resume / reconciliationへ送る。

成功したleaseの`close()`はidempotentで、held parent / stage / lease、destination absence、protected input、stage entryをlease removal直前にも再照合してからleaseを解放し、descriptorを閉じる。path swapやcleanup failureを成功として隠さない。close failureは`FloodgateTeacherStageCloseError`と`leaseMayRemain`を返す。authorization失敗後のlease removalまたはdescriptor cleanupを完了できない場合は`FloodgateTeacherStageAuthorizationCleanupError`でprimary failure、frozen cleanup failures、lease残存可能性を保持する。照合時にreplacement inodeを観測した場合はそれを削除しないが、これはsame-UID actorとのlstat / rmdir raceを排除する主張ではなく、trusted-current-EUID critical sectionが前提である。authorization receiptとnested identitiesはfreezeし、copy可能な「生成済み」tokenにはしない。

## 6. 固定entry allowlistが証明する範囲

resume stageでは既知のteacher artifact basenameだけを許し、unknown entry、symlink、directory、deviceなどを拒否する。既知entryもcurrent-EUID-owned exact `0600`、regular file、link count 1でなければならず、explicit protected fileとのinode aliasを拒否する。この検査はfile内容、JSON schema、bytes、SHA-256、checkpoint MAC、fsync状態を証明しない。stage authorizationはartifact closureの一段手前であり、次段runnerがexact file setとcontent receiptを所有する。

成功receiptは意図的に次のstatusを返す。

```text
authorized-private-stage-not-generated-not-published
```

この長いstatusは過大claimを防ぐためである。receiptがあってもteacher labelは0件かもしれず、destinationは不存在のままであり、final consumerは何も読めない。

## 7. machine readinessとasset blocker

本PR前のread-only preflightで、実行machineとtracked assetを確認した。

| 項目                    | 観測値                                                                |
| ----------------------- | --------------------------------------------------------------------- |
| machine                 | Apple M4 Pro、14 cores（10 performance + 4 efficiency）、48 GB memory |
| free disk               | 104 GiB                                                               |
| preregistered teacher   | 12 engines × 1 thread、Hash 64 MiB / engine                           |
| TT memory floor         | 768 MiB                                                               |
| depth-16 lower estimate | 約11.47時間 / 24,000 parents。stable proposerと追加rescoreは含まない  |
| tracked engine receipt  | 654 bytes、SHA-256 `a448c6be…6f9c4e`                                  |
| tracked stable weights  | 1,185,988 bytes、SHA-256 `e4e738f9…e28dc`                             |
| YaneuraOu exact binary  | missing                                                               |
| eval `nn.bin`           | missing                                                               |

計算資源は固定12-engine contractに十分だが、exact binary / eval assetとproduction software boundaryが未完成である。したがって現時点の停止理由はmachine capacityではない。11.47時間は旧depth-16実績からの下限で、同期WASM searchを同じNode event loopへ直挿しするとUSI pipe / timeoutをstarveし得るため、stable proposerは別worker-thread / child-process phaseとして先に生成・認証する必要がある。

## 8. 次の実行順序

1. このstage authorizationとexclusive leaseを完成させる
2. runOp1 exact weights / WASM / depth-11 contractを別poolで実行するstable proposer v7を作る
3. checkpointをMACで認証し、file / stage directory fsyncとcrash reconciliationを追加する
4. consumer callbackの最初の同期actionでruntime claimし、private stageだけを生成する
5. consumer Promise全体のpostflight / close成功後に`result.json`を作る
6. exact artifactをfsyncし、Darwin exclusive rename、parent fsync、final reopen verificationを行う
7. exact engine / eval assetを復元してsynthetic real-engine中断再開試験を行う
8. その後だけreal training 24,000 parentsを固定12 enginesで実行する

fresh selectionは3 seed final checkpointとresult receiptがstrict-loadするまで開かず、fresh / legacy final holdoutはstatic family gateまで開かない。

## 9. 検証snapshot

| 検証                        | 結果                                       |
| --------------------------- | ------------------------------------------ |
| targeted adversarial Vitest | 85/85 PASS（1 file）                       |
| full Vitest                 | 1,586/1,586 PASS（98 files）               |
| Python stdlib suite         | 58/58 PASS                                 |
| TypeScript `tsc --noEmit`   | PASS                                       |
| full ESLint                 | 0 errors / 157 unrelated existing warnings |
| Next.js production build    | PASS（193 pages）                          |
| 独立adversarial review      | 2/2 CLEAN                                  |

targeted suiteはfresh / resume、全protected category、ancestor / descendant、hardlink / symlink、path swap、future engine-argument path、同時 / stale lease、replacementを消さないtyped cleanup、close-time mutation、`Promise.all` / `Object.prototype.then` / `Array.prototype.push` / inherited `Array.prototype[0]` setter / `RegExp.prototype.exec` / `Error[Symbol.hasInstance]` poisoning、top-levelと`engineArgs` elementのaccessor descriptor拒否、日英parityを含む。suiteはtemporary directoryとsynthetic sentinelだけを使い、real bundle、training rows、engine search、selection、final holdoutを入力にしない。

## 10. 結論

このPRは強さを上げる計算をまだ始めない。代わりに、その計算が偽stage、sealed inputとのalias、同時runner、stale leaseを経由して「成功」に見える経路を先に閉じる。成功receiptが示すのはprivate stage namespaceを一時認可したことだけで、statusどおりgeneratedでもpublishedでもない。

次のstrength-relevant milestoneはstable depth-11 proposalを含むv7 contractとauthenticated durable resumeである。それらを通さずにdepth-16 teacherを走らせても、安定高段という最終目標へ使える証拠にはならない。
