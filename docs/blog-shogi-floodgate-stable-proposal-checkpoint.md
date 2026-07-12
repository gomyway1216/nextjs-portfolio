# stable proposalをMAC認証してprivate stageへdurable checkpointする

> [stable-WASM proposer](./blog-shogi-floodgate-stable-wasm-proposer.md)は、synthetic-onlyのdependency-injected `CoreForTests`としてcanonical proposal artifactをmemory内へ返せるようになった。しかしSHA-256だけでは、同じ権限を持つactorがproposalとchecksumを一緒に書き換えることを検出できず、process crash後にどこまでdurableになったかも決められない。このPRは、[authorized private stage](./blog-shogi-floodgate-teacher-stage-authorization.md)のactive leaseを最初の同期actionで一度だけclaimし、exact file set `{work.jsonl}`へHMAC chain付きのheader、proposal entry、sealを追記するsynthetic-only checkpoint primitiveを追加する。statusはprivate checkpointまでであり、production runner、consumer postflight、publication、engine authentication、teacher label、学習、棋力の証拠ではない。real training data、selection、fresh/legacy final holdoutは読んでいない。English version: [blog-shogi-floodgate-stable-proposal-checkpoint.en.md](./blog-shogi-floodgate-stable-proposal-checkpoint.en.md)

---

## 現在の境界

| 項目                                  | 現在の状態                   | 意味                                                                                                              |
| ------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| active stage lease claim              | `CoreForTests`へ実装         | test-only registryが発行したexact active leaseを最初の同期actionでsingle-use claimする                            |
| dedicated private stage               | 実装                         | trusted current-EUID境界でstageをexactly `{work.jsonl}`へ限定し、symlink、hard link、mode / owner不一致を拒否する |
| authenticated checkpoint chain        | 実装                         | header、dense entry、sealをrun-derived HMAC keyとcanonical JSONでbindする                                         |
| durability / resume                   | 実装                         | file / directory syncとauthenticated-prefix scanにより、許された状態だけをresumeする                              |
| proposer artifact timing              | memory内artifact完成後に開始 | artifact構築前のcrashではstable searchをやり直す必要がある                                                        |
| production consumer / stage handoff   | 未実装                       | production input claimからこのtest coreへauthorityを安全に渡すcoordinatorはまだない                               |
| consumer postflight / publication     | 未実装                       | input close成功、result receipt、exclusive rename、published artifact再検証は行わない                             |
| engine / teacher / training / playing | 証拠なし                     | HMACはengine実行、teacher score、学習済みcheckpoint、accuracy、Elo、段位を証明しない                              |
| real data / selection / final holdout | 未読                         | synthetic fixtureだけを使い、保護されたlabelは開いていない                                                        |

ここで「complete」が表すのは、private stage上のproposal checkpointにheader、全entry、sealが揃い、同じ鍵と同じ期待artifactから再構築できることだけである。production transaction全体の完了や、評価関数が強くなったことを意味しない。

途中prefixとcomplete sealのstatus、そしてreceipt全体のclaim boundaryは意図的に長い文字列で固定する。

```text
authenticated-durable-private-checkpoint-prefix-not-complete-not-postflight-not-published
complete-authenticated-private-proposal-checkpoint-not-consumer-postflight-not-published
key-holder-authenticated-checkpoint-integrity-only-not-engine-authentication-teacher-label-or-playing-strength-evidence
```

## 1. SHA-256だけではactorを区別できない

unkeyed SHA-256は、偶発的な破損やtorn writeの検出には使える。しかしstageを書けるactorは、proposal rowを変更したあと新しいSHA-256も計算できる。payloadとchecksumを一緒にresealした変更は、unkeyed digestだけでは正規writerの出力と区別できない。

このcheckpointでは、呼び出し側が同期的にsnapshotしたroot keyからrun固有keyを導出し、各recordへHMAC-SHA-256を付ける。鍵を持たないstage-only writerは、既存chainと整合する別のcomplete lineを作れない。比較はdecodeした32-byte tagに対するtiming-safe comparisonで行う。

ただし、この境界を大きく読んではいけない。root keyを持つactorは有効なchainを作れるため、HMACが示すのは「このkey holderが認証したcheckpointの整合性」だけである。正しいengine、正しい検索結果、teacher labelの正しさ、鍵の秘匿性、non-repudiation、単調なanti-rollbackは証明しない。

## 2. dedicated stageとexact file set

checkpoint APIは、authorized stage leaseを受け取った直後、stage pathやartifactへ触れる前の最初の同期actionとしてtest-only claimをconsumeする。close済みlease、すでにclaim済みのlease、clone、Proxy、production/test registryを跨ぐleaseは通らない。成功後はstage pathを`O_NOFOLLOW | O_DIRECTORY`で開いたdescriptorとpathへの`lstat`を使い、lease receiptにあるstageのdevice、inode、owner、exact modeと一致させる。parent identityとbasenameは認証済みheaderへbindされる。

このprimitive専用stageで許されるfile setは次の1件だけである。

```text
{work.jsonl}
```

fresh startではstageが空でなければならず、`work.jsonl`は`O_CREAT | O_EXCL`で作り、requested modeだけに依存せず`fchmod(0600)`相当の処理でexact `0600`を確立する。current EUID ownerであることも検証する。resumeでは同名fileが`O_NOFOLLOW`で開けるregular file、current EUID owner、exact `0600`、link count 1であることを要求する。別file、temporary file、directory、symlink、hard link、unknown entryが1つでもあればfail-closedする。

stage identityはheader MACへbindされる。同じbytesの`work.jsonl`を別stageへcopyしても、parent / stage identityと一致しないためresumeできない。ただし、directory listing、`work.jsonl`のopen、final reopenはいずれもstage pathから行い、その前後にdescriptor / path identityを再検査する方式である。directory descriptor相対の`openat`系operationではない。この境界はcurrent EUIDのnamespace操作を信頼するcritical sectionであり、悪意あるsame-EUID actorによる検査間のrename / swapを防ぐOS sandboxではない。

## 3. header、entry、seal

`work.jsonl`のschemaは`shogi-floodgate-stable-proposal-work-v1`で、canonical JSONを1 record 1行、LF区切りで保存する。record順は固定される。

```text
header
proposal sequence=0, previous_mac=header_mac
proposal sequence=1, previous_mac=entry[0].entry_mac
...
seal, final_entry_mac=entry[last].entry_mac
```

headerは少なくとも次をbindする。

- 64桁lowercase hexの`run_id`とopaque `key_id`
- MAC algorithmと狭いclaim boundary
- authorization contract / trust、stage basename、parent / stage device・inode
- proposer inputのauthenticated-training binding、input-row SHA-256、record count
- proposal schema、semantic run fingerprint、plan、engine asset、search contract、operational configuration、proposal receipt

各entryはdense sequence、expected parent ID、`previous_mac`、そのparentのproposal rowをbindする。欠番、並べ替え、重複、別parent、別proposalは許さない。sealはentry count、最後のentry MAC、proposal output bytes / SHA-256 / record count、private-checkpoint statusをbindする。seal後の追加byteやrecordは拒否する。

resume時はMACだけを見るのではなく、callerが渡したin-memory proposer artifactを再検証し、canonical JSONL、receipt、semantic fingerprint、input binding、proposal順、parent / child digest、output identityを再導出する。したがって、MACが有効でも今回期待するartifactと異なるchainは受理しない。ただしproposer自体がdependency-injected test coreであるため、ここでengine authenticationへ昇格するわけではない。

## 4. HKDFとdomain separation

algorithm identifierは`hmac-sha256-hkdf-sha256-v1`で固定する。root keyはpath、environment variable、command-line argument、stage fileから読み込まない。このPRではsynthetic test dependencyとしてpreloaded bytes capabilityを受け取り、最初の`await`より前にcopyする。`run_id`はcallerが渡す32-byte identifierを64桁lowercase hexで表し、HKDF-SHA-256のsaltとして使う。`CoreForTests`が検証するのは形式だけであり、randomnessやrun間のuniquenessは生成も証明もしない。HKDF infoは次で固定する。

```text
shogi-floodgate-stable-proposal-checkpoint-key-v1\0
```

canonical MAC payloadはrecord kindごとに別domainを持つ。

```text
shogi-floodgate-stable-proposal-work-header-v1\0
shogi-floodgate-stable-proposal-work-entry-v1\0
shogi-floodgate-stable-proposal-work-seal-v1\0
```

`key_id`は鍵materialではなく、どの外部key slotを期待したかを示すopaque identifierにすぎない。root key自体とderived keyは`work.jsonl`、receipt、errorへ保存しない。missing key、wrong key、別`run_id`、別`key_id`はterminal mismatchとして扱い、既存bytesを変更しない。

## 5. durability orderとindeterminate failure

fresh fileの順序は次で固定する。

1. exact active leaseを同期claimする
2. pathから開いたstage descriptorとstage pathのidentity、exact file setを検証する
3. `work.jsonl`をexclusive createし、exact `0600`を`fchmod`で確立してからheaderとfinal LFを書く
4. fileをsyncし、そのあとstage directory descriptorをsyncする
5. proposal entryをcomplete line単位でappendし、各lineのあとにfileを`datasync` / `sync`する
6. sync成功後にだけin-memoryのcompleted sequenceを進める
7. sealをappendし、file sync、stage-directory syncの順で閉じる
8. stage pathから`work.jsonl`を`O_NOFOLLOW`でreopenし、元のfile identityとの一致とstage descriptor / path identityを再検査して、全recordとproposal artifactを再構築してから成功receiptを返す

existing `work.jsonl`を検証してresumeするときも、torn tailの有無にかかわらず、entryやsealを追加する前にstage directory descriptorをsyncする。zero-byteのexact-private fileは、exclusive create後かつheader前のcrash stateとして認め、directory syncを通してからheaderを再構築する。

fresh createの可能性が生じた後や既存fileのresume処理へ入った後など、mutationが始まった可能性のある時点以降のfailureでは、呼び出し側へ「何も保存されなかった」とは報告できない。write / truncate / syncだけでなく、final work / stage descriptor closeや、その後のauthorized lease closeのfailureも`mayHavePersisted: true`のtyped persistence-indeterminate failureになる。stage bytesをその場で消したり、自動で成功扱いにしたりしない。次回は新しいauthorized leaseを取り、同じrun / key / artifactでauthenticated scanしてからresumeする。

file syncはcontent / inode durability、directory syncはfile creationというnamespace updateのdurabilityを閉じるために別々に必要である。このPRはprivate checkpointまでしか閉じないため、published directoryのrename durabilityやdestination reopenはまだ対象外である。

## 6. resumeとcorruptionの判定表

| 検出した状態                                                 | 処理                                                                                                        |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| empty authorized stage、`work.jsonl`なし                     | exact `0600`を確立し、fresh headerをexclusive createして開始                                                |
| exact-privateなzero-byte `work.jsonl`                        | header前のpost-create crash stateとしてdirectory sync後にheaderを再構築                                     |
| valid header + authenticated entry prefix                    | 最後のverified sequenceの次からappend                                                                       |
| 全entryがvalid、sealだけなし                                 | expected sealだけをappend                                                                                   |
| valid complete seal、expected artifactと完全一致             | byteを書き換えずreconstructして成功                                                                         |
| LFなしの単一末尾fragment                                     | expected next canonical lineのbyte prefixと一致する場合だけ、last verified offsetへtruncateしてsync後resume |
| malformedなcomplete line、bad MAC、gap / reorder / duplicate | terminal corruption。既存bytesを保存して停止                                                                |
| wrong key / run / stage / input / semantic fingerprint       | terminal mismatch。既存bytesを変更しない                                                                    |
| seal後のrecord / byte、過大file / line、invalid UTF-8        | terminal corruption。BOM、NUL、CR、不正control byteも受理しない                                             |
| symlink、hard link、wrong owner / mode / type、extra entry   | stage contract違反として停止                                                                                |

切り詰めを許すのは、LFがない最後の1 fragmentだけである。すでにLFで完結したlineは、壊れていても削除して都合よくresumeしない。authenticatedな短いprefixへstage全体をrollbackされた場合は同じartifactから不足entryを再計算できるが、外部のmonotonic counterを持たないためrollback attackを検出したとは主張しない。

stage authorizationのexclusive leaseも永久lockではない。process crashでstale lease directoryが残った場合、same-EUID processが自動でstealしてよい根拠はない。operatorがstage、lease owner、process stateをreconcileし、新しいauthorizationを明示的に作るまで停止する。

## 7. このcheckpointが保存を始める時点

現在のAPIは、stable proposerが全parentを検索し、canonical proposal artifactとreceiptをmemory内で完成させたあとに呼ばれる。その完成artifactをexpected transcriptとして使うからこそ、resume時に各lineをsemanticに再導出できる。一方、この順序には重要な制約がある。

```text
stable search完了 -> in-memory artifact完成 -> durable checkpoint開始
```

searchの途中、またはartifact構築前にprocessがcrashすると、`work.jsonl`にはまだ何もなく、stable searchを最初からやり直す必要がある。このPRが省けるのはcheckpoint append途中、seal途中、または完成後の再実行であり、mid-search progress resumeではない。将来それを実現するなら、proposerが1 parentずつ認証済みproposalをstage coordinatorへ渡す別contractと、その時点までのengine / input authorityを設計しなければならない。

## 8. synthetic-only evidenceと非claim

このPRの検証対象は、temporary directory、synthetic proposer artifact、synthetic root key、test-only stage authorizationだけである。checkpoint testは18 / 18、stage authorizationと合わせたtargeted testは120 / 120を通過し、TypeScript typecheckとscoped ESLintも通過した。fresh write、zero-byte recovery、no-rewrite completed resume、valid-prefix resume、single torn-tail truncation、wrong key / run / stage / artifact、MAC tamper、sequence mutation、post-seal bytes、file identity / mode違反、post-durability failpoint、short / zero-progress write、descriptor / lease lifetimeを回帰対象にする。実際のfile / directory `sync()` syscall failureを注入するtest seamがあるとは主張しない。real Floodgate parent、real role bundle、selection label、fresh final holdout、legacy final holdoutは入力しない。

| このPRが示すこと                                         | このPRが示さないこと                                                       |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| key holderが認証したexpected proposal checkpointの整合性 | proposerを実行したactor、production consumer、またはengineのauthentication |
| run / stage / input / semantic artifactへbindしたresume  | teacher scoreが正しいこと、depth-16 v7 unionが完成したこと                 |
| file / directory sync順とindeterminate failureの扱い     | consumer postflight、result receipt、exclusive publication、reopen成功     |
| exact `{work.jsonl}` private-stage contract              | production dataset、学習済みNNUE、production int16 weight                  |
| synthetic contract / corruption testの対象               | accuracy、loss改善、Elo、段位、安定した高段level                           |

MAC-validなproposal checkpointを得ても、teacher labelは1件も生まれず、model weightも1 byteも更新されない。棋力claimは、frozen multi-seed training、quantization、sealed holdout、production parity、fixed paired A/B、external calibrationを通過したあとにだけ行う。

## 9. 次の工程

安全な順序は次である。

1. production consumer callbackのexact input claim、stage lease authority、stable proposer、private checkpointを1つのcoordinator / handoff contractで接続する
2. outer consumerのpostflight / close成功後だけresult receiptを完成させ、exclusive directory publication、rename durability、destination reopen verificationへ渡す
3. exact YaneuraOu binary / evaluation assetを復元してpinし、synthetic interruption / resumeを含むreal-engine contractを閉じる
4. YaneuraOu depth-16 MultiPV 12、強い実戦のplayed move、stable proposalをunionし、全unique candidateをdepth 16でindependent rescoreするv7 teacherを完成させる
5. そのrunner全体が閉じてからreal training parentをlabelし、seeds 42 / 43 / 44のfrozen training、QAT / production-int16 export、static family gateを実行する
6. 事前登録順にselectionとsealed final holdoutを一度だけ開き、production parity、known regression、fixed paired A/Bを通す
7. internal gateをすべて通った候補だけを、別途authorizeした81Dojo calibrationで評価する

この順序の途中で既存評価関数へweightを上書きしない。まずteacher inputとartifact authorityを閉じ、そのあとにfresh dataから複数seedを同じ条件で学習し、stable baselineと比較する。

## 10. 結論

このPRは、memory内stable proposal artifactを、authorized private stageのexact `{work.jsonl}`へHMAC chain付きでdurable checkpointするtest-core boundaryを追加する。header、dense entry、sealはrun、stage、input、semantic artifactへbindされ、file / directory sync、zero-byte / valid-prefix resume、限定的なtorn-tail truncation、terminal corruption preservationを明示する。filesystem namespace操作はpath-basedのdescriptor / path identity再検査であり、trusted current-EUID境界を越える保護ではない。

それでも現在あるのはprivate checkpointだけである。artifact完成前のcrashではstable searchを再実行し、stale leaseはoperator reconciliationを待つ。production coordinator、consumer postflight、publication、engine authentication、depth-16 teacher、学習、holdout、対局はまだ先であり、安定した高段levelを示す結果はまだない。
