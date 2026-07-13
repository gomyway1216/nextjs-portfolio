# authenticated workからresult / manifestとdurable publicationを一つに閉じる

> [standalone work verifier](./blog-shogi-floodgate-stable-proposal-work-verifier.md)はcompleteな`work.jsonl`をwriter stateなしで再認証でき、[consumer postflight capability](./blog-shogi-floodgate-consumer-postflight-capability.md)はexact consumer invocationの成功をsingle-use objectへ閉じ、[stage publication transaction](./blog-shogi-floodgate-stage-publication-transaction.md)はcontent-agnosticなdirectory publicationをdurableにした。しかし3つが別々のままでは、「どのconsumer inputへ結び付くworkから作ったresult / manifestを、どのdestination inodeへpublishしたか」を1つの成功contractにできない。このPRはtest-only finalizerでexact leaseとexact postflight receiptをconsumeし、HMAC付き`result.json`、HMAC付き`manifest.json`、exclusive publication、destination content再検証までを合成する。real training data、selection、fresh / legacy final holdoutは未使用・未読であり、teacher label、学習、weight更新、棋力の証拠ではない。English version: [blog-shogi-floodgate-stable-proposal-finalizer.en.md](./blog-shogi-floodgate-stable-proposal-finalizer.en.md)

---

## 現在の境界

| 項目                           | 現在の状態      | 意味                                                                                                       |
| ------------------------------ | --------------- | ---------------------------------------------------------------------------------------------------------- |
| runtime authority              | test-onlyで実装 | exact test leaseをpublication transactionへ移し、exact test postflight receiptを一度だけclaimする          |
| work content                   | 実装            | 外部run / key / stage contextでcomplete `work.jsonl`をstandalone verifierへ通す                            |
| result / manifest              | 実装            | deterministic canonical JSONとfinalizer専用HMACを作り、file syncとstage-directory syncを順に行う           |
| crash resume                   | 実装            | `{work}`、`{work,result}`、`{work,result,manifest}`と、そのdeterministic byte prefixを識別する             |
| namespace publication          | 実装            | 既存transactionでexclusive renameと2段階parent syncを行う                                                  |
| postpublication audit          | 実装            | destinationと3 fileをreopenし、inode、mode、bytes、SHA-256、work HMAC、consumer cross-bindingを再検証する  |
| production entry point         | 未実装          | 公開APIは`CoreForTests`だけで、production lease / postflight registryや固定production dependencyを使わない |
| engine / teacher / training    | 証拠なし        | engine process identity、teacher score、label、weight、loss、QAT / int16を証明しない                       |
| real data / holdout / strength | 未読・未測定    | real row、selection、final holdout、対局、Elo、段位、高段の安定性を測っていない                            |

成功contract、status、claim boundaryは次で固定した。

```text
shogi-floodgate-stable-proposal-finalization-publication-v1
verified-consumer-postflight-authenticated-work-durable-manifest-and-exclusive-publication
test-only-synthetic-consumer-work-content-and-private-namespace-publication-evidence-not-teacher-label-training-or-playing-strength-evidence
```

## 1. finalizationとpublicationを一つのlifecycleにする理由

standalone work verification、consumer postflight、namespace publicationは、それぞれ必要だが単独では十分でない。work verification receiptだけではactive leaseもcurrent filesystemも持たず、postflight receiptだけではstaged outputを証明せず、publication receiptだけではpublished fileのcontentを読まない。callerが3つのfieldを寄せ集めたrecordを作っても、成功したexact runtime authorityへは結び付かない。

finalizerは次の順序を一つのoperationに固定する。

```text
exact test lease -> publication authority transfer
exact test postflight receipt -> single-use claim
work.jsonl -> complete HMAC verification + consumer input cross-binding
result.json -> file sync -> stage directory sync
manifest.json -> file sync -> stage directory sync
exact source set revalidation
exclusive directory publication
destination reopen -> exact content revalidation
```

途中で失敗した場合、commit開始前ならtransactionをabortし、すでにdurableになったdeterministic prefixは消さない。commit開始後はblind retryやpath cleanupを行わず、publication reconciliationを要求する。これにより「manifestは完成したが、どのpublicationに対応したか不明」というgapをsuccess receiptの外へ追い出す。

## 2. exact leaseとexact postflight capabilityを一度だけ合成する

entry pointは`finalizeAndPublishFloodgateStableProposalsCoreForTests(...)`だけである。最初に`beginFloodgateTeacherStagePublicationCoreForTests(lease, ...)`を呼び、exact active test leaseのownershipをpublication transactionへ同期移譲する。copy、Proxy、production lease、close済みlease、二重beginは既存transaction registryで拒否される。移譲後の元`lease.close()`もauthorityを取り戻せない。

次に`claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(...)`でexact test postflight receiptをsingle-use claimする。receiptは次をすべて満たさなければならない。

- test-only injected bundle verifierが発行したexact schema / status / claim boundary
- training roleとconsumer input binding
- callbackが値なしでsettleしたこと
- callback後filesystem snapshotが再検証されたこと
- raw / root input descriptorが閉じたこと

claimしたexact object identityそのものはfileへ永続化できない。`result.json`へ保存するのは、claim成功後にstrict captureしたreceiptのcanonical structural projectionである。再開時もdisk上のprojectionが過去のexact authorityを復活させるわけではなく、新しいinvocationが新しいexact test postflight receiptをclaimし、同じdeterministic payloadを再導出しなければならない。

このPRにproduction entry pointはない。productionとtestのauthority分離を保ったまま、synthetic composition contractだけを閉じる。

## 3. authenticated workとconsumer inputをcross-bindする

finalizerはstageを`O_NOFOLLOW | O_DIRECTORY`で開き、authorization receiptと同じdevice / inode、current-EUID owner、exact `0700`であることを確認する。初期entry setは次のいずれかだけを許す。

```text
{work.jsonl}
{result.json, work.jsonl}
{manifest.json, result.json, work.jsonl}
```

`manifest.json`だけが先行する状態、`work.jsonl`欠落、extra entryは自動修復せずmanual content reconciliationへ送る。`work.jsonl`はcurrent-EUID-owned、exact `0600`、link count 1、64 MiB以下でなければならない。

受信bytesは[standalone verifier](./blog-shogi-floodgate-stable-proposal-work-verifier.md)へ渡し、外部の32-byte root key、`runId`、`keyId`、exact stage authorization receiptでheader、全proposal、seal、producer receiptを再認証する。その後、semantic projection内の`authenticated_training_binding`とpostflight receiptのconsumer `binding`をcanonical JSONでexact比較し、input record count、consumer bindingのrecord count、sealed proposal output countも一致させる。

ここでは二種類のidentityを混ぜない。

- exact work evidenceはfile bytes / SHA-256、run、key、stage、authenticated header / sealを示す
- semantic binding SHA-256はstage、run、key、operational差を除いたproducer input / output意味を示す

result / manifestは両方を別fieldでbindする。semantic bindingが同じだからといって別stageのwork bytesを受理せず、exact work SHA-256が違うからといってproposal意味まで違うとは推論しない。

## 4. `result.json`を先にdurable化する

finalizerはroot keyとrun IDから、checkpoint keyとは別のHKDF infoで32-byte finalizer keyを導出する。

```text
HKDF info: shogi-floodgate-stable-proposal-finalizer-key-v1\0
result domain: shogi-floodgate-stable-proposal-result-v1\0
manifest domain: shogi-floodgate-stable-proposal-manifest-v1\0
```

`result.json`は`shogi-floodgate-stable-proposal-result-v1`のcanonical single-line JSONであり、次を含む。

- finalization claim boundary、algorithm、run ID、key ID
- strict captureしたconsumer postflight receipt
- work verifier contract / status / claim boundaryとexact work / stage evidence
- checkpoint schema / status
- proposal schema / status / claim boundary、proposal receipt SHA-256、semantic run fingerprint
- semantic binding domain / SHA-256
- unsigned canonical objectへdomain-separated HMAC-SHA-256を掛けた`result_mac`

fileは`O_CREAT | O_EXCL | O_NOFOLLOW`とmode `0600`で作り、`fchmod(0600)`、deterministic bytesのwrite、file sync、exact-byte reread、held stage-directory syncの順で進める。descriptorはsource / destination再検証が終わるまで保持する。既存fileがある場合は、expected payloadのbyte prefixであるときだけ残りをappendする。zero-byteや途中byte prefixはresumeできるが、1 byteでもexpected prefixと違う、expectedより長い、wrong owner / mode / type / link countなら既存bytesを保存して停止する。

ここでいう`result`は「consumer postflightとauthenticated proposal workをfinalizerが結び付けた結果」であり、対局結果、training result、teacher score、またはlabelではない。

## 5. `manifest.json`を最後のcontent commit markerにする

`result.json`のfile syncとstage-directory syncが完了したあとだけ、`manifest.json`を作る。schemaは`shogi-floodgate-stable-proposal-manifest-v1`であり、次をbindする。

- run ID、key ID、algorithm、claim boundary
- authorization contract / trust boundary、parent / stage identity、stage / destination basename
- exact final entry list `manifest.json`, `result.json`, `work.jsonl`
- `work.jsonl`と`result.json`のfilename、device / inode、mode、bytes、SHA-256
- canonical consumer postflight SHA-256
- proposal receipt SHA-256
- semantic binding SHA-256
- unsigned manifestへ別domainで掛けた`manifest_mac`

manifestはresultと同じexclusive-create、deterministic-prefix resume、file sync、exact reread、stage-directory syncを通る。manifest自身のSHA-256をmanifest自身へ循環的に埋め込まない。完成後のsuccess receiptが、final manifest fileのinode、bytes、SHA-256を外側から記録する。

manifest directory sync後、source stageがexact 3-entry setであること、stage descriptorがauthorized inodeのままであること、3 fileのheld descriptor / pathname identity、owner、mode、link count、bytesが変わっていないことを再検証する。このsource revalidationが通るまでpublicationを始めない。

## 6. crash / resume stateを明示的に扱う

finalizerの再開単位は、完全fileだけでなくdeterministic metadata fileのbyte prefixである。

| 観測state                                       | 処理                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| `{work}`                                        | workを再認証してcross-bindし、result、manifestの順に作る                     |
| `{work,result-prefix}`                          | resultが今回のexpected bytesのexact prefixならappend、sync後にmanifestへ進む |
| `{work,result}`                                 | result exact bytesを再確認し、manifestを作る                                 |
| `{work,result,manifest-prefix}`                 | resultがcompleteで、manifestがexpected prefixならappendして再検証する        |
| `{work,result,manifest}`                        | 3 fileをexpected bytes / identityへ再照合し、書き換えずpublicationへ進む     |
| manifestあり・result incomplete                 | 自動resumeせずmanual content reconciliation                                  |
| prefix mismatch / oversize / extra entry        | 既存bytesを変更せずmanual content reconciliation                             |
| symlink / hard link / wrong mode / owner / type | fail closed。pathname cleanupを行わない                                      |

work自体のpartial prefixやtorn-tail repairはこのfinalizerの責務ではない。complete work verifierが通らない場合、checkpoint writerのresume boundaryへ戻る。result / manifestのresumeもanti-rollbackではない。外部monotonic counterがなく、validな古いdeterministic stateへのrollbackを検出したとは主張しない。

## 7. exclusive publication後にdestination contentを再検証する

sourceのcomplete setを確認したあと、既存publication transactionの`commit()`を呼ぶ。transactionはexclusive rename、source / destination inode reconciliation、destination directory reopen、parent fsync #1、exact authorization marker removal、parent fsync #2を担当する。このreceipt単独はcontent-agnosticであるため、combined finalizerはそこで成功を返さない。

publication receiptを得たあと、finalizer自身がdestinationを`O_NOFOLLOW | O_DIRECTORY`でreopenし、published destination identity、current-EUID owner、exact `0700`を照合する。さらに次を行う。

1. entry setがexact `manifest.json`, `result.json`, `work.jsonl`であることを確認する
2. 各fileを`O_NOFOLLOW`でreopenし、sourceで保持したdevice / inode、exact `0600`、link count 1、bytesと一致させる
3. published `work.jsonl`をroot key / run / key / original authorization receiptで再びstandalone verifyする
4. published workとcaptured postflightをもう一度cross-bindする
5. destination側の全handle close成功後だけcombined receiptを返す

成功receiptは3 fileそれぞれのinode / bytes / SHA-256、consumer postflight SHA-256、proposal receipt SHA-256、semantic binding SHA-256、publication receipt、`destination_reopened: true`、exact entries、`content_reverified: true`をdeep-frozen objectへ閉じる。

## 8. typed failureはpersistenceとpublicationを分ける

`FloodgateStableProposalFinalizerError`は一つのbooleanへ潰さず、次のrecovery facetを保持する。

```text
phase, observedState, workVerified, postflightClaimConsumed,
durability, mayHavePersisted, mayHavePublished,
publicationDurability, destinationReopened, leaseMayRemain,
retryDisposition, primary, cleanupFailures[]
```

phaseはauthority transfer、postflight claim、work verification、result / manifest persistence、source revalidation、publication、destination revalidation、cleanupを区別する。durabilityもwork未syncからcomplete-set directory syncまで段階的に進める。

commit開始前の失敗ではtransaction abortを試みる。abortがdurableに成功し、contentがexpected prefixなら、残ったresult / manifestを削除せずfresh leaseとfresh exact postflight authorityで再開できる。abort / lease cleanupが失敗して`leaseMayRemain: true`なら`manual-lease-reconciliation-required`を使う。authority transfer自体が始められなかった場合は、元leaseがcaller側に残った可能性を`caller-must-reconcile-existing-lease-authority`で示す。mismatch、extra entry、manifest / result順序違反は`manual-content-reconciliation-required`である。

commitを開始したあとの任意の例外を一律にpublishedとは扱わない。既存transactionがdefinitely-not-committedを証明した場合は`mayHavePublished: false`を保ち、それ以外のindeterminateまたはcommit成功後audit失敗では`mayHavePublished: true`と`manual-publication-reconciliation-required`を使う。publicationとleaseが同時にindeterminateなら`manual-publication-and-lease-reconciliation-required`で両方の確認を要求する。いずれもpublication durabilityとlease facetを引き継ぎ、primary failureとdescriptor / abort cleanup failureを別々に保存する。

## 9. synthetic evidenceと明示的なnonclaims

synthetic fixtureだけでfocused、関連boundary、全回帰、Python監査、typecheck、lint、buildを実行した。real dataやholdoutは開いていない。

| validation                                                        | 実測結果                             |
| ----------------------------------------------------------------- | ------------------------------------ |
| focused finalizer suite                                           | 16 / 16 pass                         |
| finalizer + checkpoint + postflight + publication boundary suites | 85 / 85 pass                         |
| full Vitest regression                                            | 1,731 / 1,731 pass                   |
| Python stdlib ML audit                                            | 58 / 58 pass                         |
| TypeScript / scoped ESLint / Prettier                             | pass / 0 warnings / pass             |
| full ESLint                                                       | 0 errors / 157 pre-existing warnings |
| Next production build                                             | pass                                 |

| この境界が成功時に示すこと                                                         | この境界が示さないこと                                                             |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| exact test leaseとexact test postflight receiptをsingle-useで合成した              | production runtime authorityやproduction deployment readiness                      |
| complete workを外部key / run / stage contextで認証し、consumer bindingへ結び付けた | engine binary / processが要求searchを実行したこと                                  |
| HMAC付きdeterministic result / manifestとexact 3-file setをdurableにした           | proposalが正しいteacher score / labelであること                                    |
| exclusive private publication後にdestination bytes / inodeを再検証した             | hostile same-EUID actor、root、ACL、pre-existing capabilityへのOS sandbox          |
| synthetic content / namespace composition contractが完成した                       | real dataset、weight更新、loss改善、QAT / int16、accuracy、Elo、段位、高段の安定性 |

HMACはkey holderが作ったcanonical bindingを認証する。non-repudiation、key secrecy、engine identity、source truth、anti-rollbackを証明しない。exact postflight claimはconsumer input lifecycleを示すが、staged outputやlabelの真偽を証明しない。`publication`はprivate `0700` destination内のnamespace publicationであり、internet公開という意味ではない。

test coreはsynthetic key、synthetic work、synthetic postflight、temporary directoryだけを対象とする。real Floodgate row、selection label、fresh final holdout、legacy final holdoutを読まず、YaneuraOu depth-16 v7 search、training、A/B matchも実行しない。model weightは1 byteも更新せず、既存評価関数へ上書きしない。

## 10. 次はsynthetic coordinator、その後production teacherである

このfinalizerで、consumer postflight、authenticated proposal work、result / manifest durability、exclusive publication、destination content auditを一つのtest-only success receiptへ閉じられる。次はtraining-row consumer、stable proposer、checkpoint writer、standalone verifier、このfinalizerを一つのsynthetic coordinatorへ接続し、各phaseのcrash、retry、stale marker、manual reconciliationをend-to-end failure matrixで検証する。

その後もproduction entry point、pinned YaneuraOu depth-16 v7 engine authority、real teacher label schema、independent rescore、real-data executionが必要である。さらに3-seed retraining、QAT / int16 export、frozen selection、sealed final holdout、paired A/B、81Dojo較正を通って初めて棋力を評価できる。

今回の「complete」は、synthetic test boundary内のconsumer-work-content-publication compositionにだけ掛かる。teacherも評価関数も完成しておらず、安定した高段levelを示す証拠はまだない。
