# 承認済みキーから100・500・24,000局面の本番ゲートへ進む経路を固定した。ただし、まだ実行しない — Floodgate v7

> PR #468は通常のmerge commit `7b9a60e7912d09c5058f789ec1309325941202d2`で統合され、その後、private native UIによる人間レビュー、完全なSHA-256の再入力、承認後のfresh reinspection、create-only approved-key enrollment、保存recordのpostflight、fresh current-key bindingが成功した。独立したcurrent-binding preflightも続けて成功している。本変更は、その承認済みrecordを、上書き不能なprivate run registryと、100・500・24,000 parent専用のargumentless production runnerへ接続する。ただし実装中の安全レビューで、長時間gateが強制終了した場合に残るempty stage-authorization leaseを、現契約だけではlive processや置換directoryと安全に区別できないことが分かった。このため本変更ではregistry provisioningと3つのreal gateを実行せず、HMAC付きlease metadataとOS-backed lockを追加する別PRを先に必須とする。現在の観測ではproduction registryは存在せず、gate processも0である。本変更によるteacher label、training、candidate weight、live activation、棋力証拠はすべて0で、productionは現在もrunOp1のままである。English version: [blog-shogi-floodgate-v7-production-connector-runner.en.md](./blog-shogi-floodgate-v7-production-connector-runner.en.md)

2026-07-16更新: 後段のverifier Git / pinned-artifact closureは[PR #474](https://github.com/gomyway1216/nextjs-portfolio/pull/474)で通常mergeされ、merge commitは`c0b4e55e7fc8a1b3050285ec0cec8a77c35fa98f`である。この記事後半に残る「PR #474は未マージ」という表現は当時のsnapshotであり、現在の状態ではない。training-label finalizer、production registry、real gate、training、live変更は引き続き未完・未実行である。

## 1. 結果

| 項目                                          | 現在の結果                                                | 意味                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| PR #468                                       | 6 checks成功、未解決review thread 0、通常merge済み        | private human review / enrollment経路はdefault branchへ統合済み                                      |
| production human review                       | 成功                                                      | exact canonical JSONLと末尾LFを表示し、完全なlowercase SHA-256を人間が再入力した                     |
| approved-key enrollment                       | create-only installとexact loaded-record postflightが成功 | 既存recordを上書き、adopt、rotateしていない                                                          |
| current-key binding                           | workflow内postflightと独立preflightがともに成功           | approved recordはfreshly inspected current keyとexact一致した                                        |
| immutable run registry                        | 実装・test済み、production未設置                          | private run ID、approved-key binding、固定configurationを1回だけ保存する                             |
| registry provisioner                          | argumentless、実装・test済み、production未実行            | current bindingからinstall / exact postflightまでを1つのfail-closed操作にした                        |
| production runner                             | 100、500、24,000専用の3 entry pointを実装                 | generic gate引数、run ID、path、digestをoperator入力にしない                                         |
| runtime                                       | exact Node `v22.13.0`、3 gateは`caffeinate -dimsu`        | runtime driftを拒否し、macOSの自動sleepを抑止する                                                    |
| focused validation                            | 6 files、108 / 108 PASS                                   | registry、installer、provisioner、runner、2 CLIを検証した                                            |
| broader Floodgate v7 validation               | 26 files、680 / 680 PASS                                  | key、checkpoint、connector、runtimeを含む関連範囲を再検証した                                        |
| full validation / production build            | 136 files、2,544 / 2,544 PASS / build成功                 | repository全体のunit testとNext.js production buildを確認した                                        |
| actual temp-home E2E                          | PASS                                                      | real serializer → installer → loader → single-use claim → provisioner postflightを一時homeで合成した |
| stale lease                                   | **未解決のpre-gate blocker**                              | 現行empty leaseには永続run bindingもliveness lockもなく、安全な自動reconcileはできない               |
| current registry / this-change gate runs      | 不存在 / 0                                                | 現在状態はfresh観測済み。本変更ではblockerを閉じる別PRまで実行しない                                 |
| labels / training / weights / live / strength | 0 / 0 / 0 / 0 / 0                                         | 評価関数も棋力もまだ変わっていない                                                                   |

この表はrunner実装時点のsnapshotである。その後same-lock prefix-100境界まで通常mergeされたが、当時の実測値と[機械可読証拠](./data/floodgate-v7-production-connector-runner-2026-07-15.json)は後続候補の値へ書き換えない。現在の未マージ後続候補もproduction操作を行っておらず、live evaluatorは引き続きrunOp1である。

## 2. PR #468の後、productionで何が成功したか

PR #468の実装だけではproduction approvalを成功したとはclaimしていなかった。通常merge後に、operatorが固定のprivate native UIでexact candidateを確認し、表示された完全な64文字lowercase SHA-256を自分で再入力してApproveした。workflowは承認後にcandidateをもう一度fresh inspectionし、review済みbytesと一致した場合だけcreate-only installerを呼んだ。その後、保存済みrecordのexact claimとfresh current-key bindingをpostflightした。

公開してよいsanitized statusは次の2つである。

- private workflow: `private-human-reviewed-candidate-create-only-installed-postflight-and-current-binding-validated`
- independent binding preflight: `approved-record-exactly-matches-fresh-current-key`

candidate JSON、candidate / record digest、approval ID、approval timestamp、key instance ID、UID、absolute path、device / inode、key materialは本稿と機械証拠へ載せない。成功から得たものもrun / gate authorityではなく、「別に人間承認されたrecordが現行keyへfreshに一致する」という前提条件だけである。

## 3. なぜ、実行時の値をprivate immutable registryへ閉じるのか

production connectorは、run ID、approved record binding、verifier revision、repository / raw lock / role lock / role bundle / legacy exclusionの入力、teacher engine / eval asset、stage / destination namespaceを同じ組として使わなければならない。これらを毎回shell argumentやenvironment variableで組み立てると、100、500、24,000の間で別runや別revisionが混ざり、private pathやdigestがhistoryへ残る。

当時のregistry record設計は次を固定するものだった。

- 32-byte CSPRNGから生成するprivate run ID。
- approved recordのbyte数、digest、key instance identityへのprivate binding。
- 当時のverifier revision `b086243781396e2c197cc9e1cfab1fc6b773ae2a`。
- current-user homeから導く固定repository、raw lock、role lock、role bundle、legacy exclusion、production teacher assetの各namespace。
- 空のengine argument列。
- 同じrun IDから導くstage basename、destination basename、publication parent。

本稿は固定規則を記録するが、実際のabsolute path、run ID、binding値は公開しない。registry rootとruns directoryはexact `0700`、recordはexact `0600` / regular / link count 1でなければならず、loaderはfixed current-EUID homeを`O_NOFOLLOW`で辿り、held descriptorをrevalidateしてからsingle-use opaque capabilityを返す。loaderはprivate capability state内でstage authorizationとtraining-row consumer optionsを導出し、single-use claim成功時だけ同一processのcallerへ渡す。

後続監査により、当時の`b086243`は、後から追加されたpinned result-verifier receipt / evidenceのproducer `0f3cadb76ec46eb82d5bc9623277525ce1d2252b`より前で、必要artifactとproducer ancestry closureを同時に満たせないと判明した。したがって`b086243`は歴史的なblockerの記録であり、利用可能なproduction bindingとして扱わない。evidence-backed candidateは`e8a9197608cb48b1160b6707d97b0c4f78f90a1d`である。

## 4. create-only installerとargumentless provisioner

installerはoperator objectをそのまま`JSON.stringify`しない。exact key set、plain data、primitive、path、revision、engine argsを先にcapture / validateし、内部で新しいcanonical recordを構築する。canonical JSONLを`0600` stagingへ書いてfile fsyncし、hard-link no-clobberでfinal nameを作り、directory fsync、staging unlink、再度directory fsync、final reopen / identity / canonical bytes revalidationを行う。既存finalや競合stagingをoverwrite、adopt、unlinkしない。

この変更時点のprovisioner順序は次で固定されていた。

1. approved recordとfresh current keyのsanitized receiptをexact検証する。
2. approved enrollment capabilityをfresh load / claimする。
3. 32-byte CSPRNGからrun IDを作り、entropy bufferをzeroizeする。
4. current-user homeと固定revisionからconfigurationを組み立てる。
5. create-only installerを1回だけ呼ぶ。
6. registryをfresh load / claimし、run bindingと全configurationをprivate memory内でexact比較する。
7. path、run ID、digest、filesystem identityを含まない固定success receiptだけを返す。

現在の別follow-up候補はready-for-reviewの[PR #474](https://github.com/gomyway1216/nextjs-portfolio/pull/474)として公開済みだが、まだ未マージである。PR #474は上の順序より前に、fixed current-EUID user-info homeから導いたrepositoryと`e8a9197`をbindし、provisioner / preflight v2が要求するfail-before-installの`source-tree-and-pinned-receipt-evidence Git closure`を検証する。standard Git ignore rules下でnonignored worktreeがcleanかつexact revisionであることを要求し、artifact検査の前後2回、全tracked fileのbytesとmodeをHEADと比較する。7個のpinned receipt / evidence artifactもworktreeから直接読み、pinned Git blob、receipt内容、producer ancestryを検査するため、metadata-onlyではない。ignored entryは対象外で、external role-bundle outputを読まず、full verifierも実行しない。readiness receiptはpath、revision、digest、private identityを公開せず、EUID / homeへのprivate single-use identity bindingも要求する。closureまたはidentityが一致しなければ、current-key binding、enrollment、entropy取得、installへ進まない。prefix-100 preflightでもregistryのfixed configuration claim後、namespace / key checkより前に同じclosureとidentityをrecheckする。このreadinessはregistry / gate authorityを得たというclaimではない。

新しいreadiness leaf自身は`shogi-floodgate-v7-production-connector-verifier-readiness-v1`である。既存receiptへclosure fieldと`verifier-readiness` failure phaseを追加する境界は、provisioner success、provisioning CLI failure、public preflight core / claim boundary、preflight under-lock outcome、preflight CLI success / failureをv2へ上げ、旧v1 receiptとの誤った互換性をclaimしない。

production CLIは引数を1つでも受けた場合、またはruntimeがexact Node `v22.13.0`でない場合、本体moduleをlazy-loadする前に停止する。typed failureもraw objectを転送せず、allowlist済みphase、durability、may-have-created、retry dispositionだけへ再構築する。unknown failureやsuccess後のserialization / stdout failureは、registryが既に作られた可能性を保守的に選び、再実行ではなくreconciliationを要求する。

## 5. 100・500・24,000をgeneric引数にしなかった理由

generic production gate操作はない。callableな3つのproduction gate entry pointは、それぞれ次の固定gate専用である。

- `durable-prefix-100`
- `durable-prefix-500`
- `sealed-final-24000`

runnerは各gateで、registry load / single-use claim、approved enrollment load / claim、registry bindingとのexact比較、fresh current-binding receipt検証、connector専用のfresh enrollment load、production checkpoint connector 1回、raw receiptの本番境界と固定checkpoint意味論のexact検証という順序を守る。100は100、500は500、finalは24,000 completed parentとsealed stateを要求する。raw connector receipt、run ID、approved binding、private optionsはpublic receiptへ返さない。

3つのCLIはargv / stdin / environmentからgate configurationを受け取らず、exact Node runtime以外を拒否する。npm scriptはlong-running gateだけを`/usr/bin/caffeinate -dimsu`で包む。これはsleepを抑止するだけで、SIGKILL、SIGTERM、kernel panic、battery exhaustion、power lossからtransactionを回復する仕組みではない。

## 6. 途中レビューで見つかった問題と修正

初期実装をそのまま「安全」とは扱わなかった。独立レビューとadversarial testで、次の境界を修正した。

| finding                                        | 危険                                                                    | 修正                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| operator objectの`toJSON` / coercion           | validation前のserializationでcode実行や値のすり替えが起き得る           | 全fieldをProxy / accessorなしのown dataとしてcaptureし、primitive検証後に新規recordをserialize                           |
| Proxy / getterを含むclaim・receipt・failure    | property access時にcanaryや秘密を返す、または検証中に副作用を起こし得る | Proxyを明示拒否し、own-property descriptorからdata valueだけを読む                                                       |
| fulfilled success receiptの丸ごと出力          | forged extra fieldやprivate pathをstdoutへ複製し得る                    | contract / status / execution boundary / nested verification / nonclaimsをexact検証し、固定public projectionを新しく構築 |
| typed error fieldの丸ごとコピー                | forged phase / retry文字列に秘密を埋め込める                            | enum allowlistとdurability整合を検証し、無効ならunknown conservative failureへ閉じる                                     |
| ordinary objectへの組み立て                    | prototype経由の予期しないfield / coercion余地が残る                     | sensitive internal captureと公開projectionをnull-prototype frozen recordへ再構築                                         |
| fulfilled malformed current-binding receipt    | `{}`のような成功Promiseをbinding成功と誤解し得る                        | official contract / status / boundary / algorithm / 6 verification fields / all-false nonclaimsをexact検証               |
| test / critical semantics欠落receiptの成功扱い | test-only boundaryや重要field欠落をproduction成功と誤認し得る           | production execution / test boundary、connector / checkpoint契約、holdout、nonclaimsを固定値で検証                       |
| typed error内の矛盾した再試行指示              | 永続化の可能性がある失敗をfresh retryと誤表示し得る                     | own data descriptorと項目間matrixを検証し、矛盾・Proxy・accessorは保守的なcheckpoint reconciliationへ閉じる              |
| cleanup失敗による元phase上書き                 | record / revalidation失敗の原因を`cleanup`で隠し得る                    | 先行失敗がない場合だけcleanup phaseへ変更し、先行phaseを保持する回帰testを追加                                           |
| 間接依存の新規critical advisory                | Firebase経由の`websocket-driver 0.7.4`がCI監査で失敗した                | lockfileだけをpatched `0.7.5`へ更新し、`npm audit` 0件、全test、buildを再確認                                            |

review findingは、本変更によるproduction registry作成やgate実行より前にtestで固定した。これは棋力改善ではないが、14時間級のrunを誤ったauthorityや漏洩するreceiptで開始しないために必要である。

## 7. 108 focused tests、680 broader testsとactual temp-home E2E

Node `v22.13.0`で対象6 filesを実行し、108 / 108 testsが成功した。さらにFloodgate v7関連26 filesをまとめて再実行し、680 / 680 testsが成功した（Vitest 166.98秒、wall 167.61秒）。repository全体も136 files、2,544 / 2,544 testsが166.74秒で成功し、Next.js production buildも25.30秒で完了した。build時には既存のFirebase build-phase guardとdynamic routeに関する診断が出たが、build自体の終了statusは成功である。対象は次を含む。

- canonical registry serializer、`toJSON` / Proxy / accessor拒否、reordered / extra / invalid record拒否。
- private mode、owner、link count、symlink、held registry / runs identity replacement、single-use claim。
- installerのstaged fsync / hard-link no-clobber / directory fsync / reopen revalidation、全failpoint、existing final / staging race保存。
- provisionerのcurrent binding、enrollment、entropy zeroization、fixed configuration、installer durability、postflight mismatch、production/test boundary。
- runnerの3 gate、binding mismatch、current-bindingのextra / accessor / Proxy、production / test境界、typed / forged / unknown connector failure、critical receipt mismatch、private value非公開。
- provisioner / gate CLIのargv-before-lazy-load、exact Node fail-closed、listener cleanup、success / failure projection、stdout failure。

特にtemp-home E2Eはmock installer receiptだけではない。privateな一時homeをexact `0700`で作り、productionと分離したtest boundaryで、actual provisionerがactual canonical serializer、actual create-only installer、actual loader、actual single-use claimを通り、exact private-claim postflightまで成功することを確認した。隔離確認のためproduction home root metadataは読むが、production homeを変更せず、production registry namespaceへアクセスせずにreal filesystem semanticsを使う統合testである。

[機械可読証拠](./data/floodgate-v7-production-connector-runner-2026-07-15.json)にも、108 / 108、broader 680 / 680、full 2,544 / 2,544、production build、temp-home E2E、production counters、privacy exclusion、stale-lease blockerを分けて記録した。

## 8. real gate前に止めた理由: empty leaseを安全にreconcileできない

stage authorizerは、同じstageを2 processが同時使用しないため、stage横にempty `0700` authorization-lease directoryを作り、そのdescriptorをauthorization / publication lifetime中保持する。正常終了ならidentityを再検証してleaseを削除する。しかしprocessがSIGKILL、未処理のSIGTERM、kernel failure、またはpower lossで消えれば、empty directoryだけが残り、次のauthorizeはliveかstaleかを判断せず既存leaseを保存して停止する。

ここで安易に`rm -rf`してはいけない。現契約の永続状態には、元leaseのdevice / inode、run binding、nonce、owner processのOS lockがない。同じUIDが同名`0700` directoryを置換しても、停止済み元leaseと公開情報だけでは区別できない。PID、`lsof`、mtime、一定時間待機、2回のsnapshotは、PID reuse、観測race、長いengine search中の無更新を排除できず、「live processを絶対に壊さない」証明にはならない。

別PRには少なくとも次が必要である。

1. run ID、registry binding、gate、parent / stage / lease identity、UID、random nonce、boot session、PID + process-start identityを含むcreate-only lease metadata。
2. deployment keyの別domainでmetadataをHMACし、同一runと元inodeへ結び付けること。
3. owner lifetime中ずっと保持し、parent deathで解放されるOS-backed advisory lock。PIDは補助情報にとどめる。
4. inspect → manual confirmの二段階reconciliation。両段でfresh registry / current binding / checkpoint HMAC / held descriptor / destination absenceを再検証すること。
5. exact source identityをunique quarantineへexclusive renameし、parent directoryをfsyncすること。元inodeを自動削除しないこと。
6. metadataを持たないlegacy empty leaseはfail closedし、自動reconcileしないこと。

このblockerは「stale leaseが実際に発生した」という報告ではない。本変更ではreal gateを実行しておらず、production leaseを残した事実もない。長時間runを始める前に見つかった契約上の回復不能点である。当時は、別PRがmergeされreconciliation testが通るまで、registry provisioner、prefix-100、prefix-500、final-24000を実行しないoperational holdだった。この節はrunner変更が当時停止した理由の歴史的記録であり、現在残るblockerをstale leaseだけだと読み替えてはいけない。現在はcompatible verifier closureとauthenticated training-label finalizerも、production registry / real gate前の必須条件である。

## 9. 残るP2と明示的なnonclaim

レビューでは、本番実行を正当化しない低優先度の制約も記録した。低レベルcreate-only installerは同一current-user JavaScript trust boundaryを前提とするexport済みin-process primitiveで、固定argumentless provisionerだけを意図したproduction callerとしている。実コネクタによる500→24,000の完全sealや、final torn-tail recoveryのfull E2Eはまだclaimしない。outer gate lifetime lock、認証済みlease recovery、signal / owner handoffはblockerである別PRに含める。

現在のfresh観測ではproduction registryは存在せず、gate processは0で、本変更による3 gate実行も0である。本変更はcheckpoint、dataset read、teacher request / label、optimizer step、training run、candidate weight、live evaluator activation、formal match、Elo、段位、安定した高段をclaimしない。raw connector receiptの非critical fieldすべてをexact検証したともclaimしない。

## 10. 棋力はまだ変わっていない

今回productionで成功したのは、人間承認済みkey enrollmentとfresh current bindingまでである。本変更は新registryをproductionに作らず、connector gateも実行していない。したがって本変更によるreal parent、teacher request、teacher process、teacher label、checkpoint、optimizer step、training run、candidate weight、formal A/B、live activation、Elo / rank observationはすべて0である。

既存`public/shogi-nnue-weights.bin`を候補で上書きしていない。production baselineとrollback targetはrunOp1のままである。次の順序は、stale-lease metadata / lock / manual quarantine PR、通常merge、registry provisioning、100、結果確認、500、結果確認、24,000である。その後もcheckpoint finalization、QAT / selection / sealed holdout、runOp1との十分なpaired A/B、段階的live rollout、外部段位較正を通るまで「安定した高段」とはclaimしない。

上の順序はrunner変更時点の計画であり、現在はsame-lock prefix-100実行境界まで通常merge済みである。未マージのPR #474は、`e8a9197` binding、source-tree / pinned-evidence closure、private identity binding、provisionerのfail-before-installとprefix-100 preflight recheckを追加している。PR #474によるproduction registry作成、gate、teacher generation、finalization、training、weight、A/B、live変更は全て0であり、authenticated training-label finalizerをreview・通常mergeする前にはproduction registryやreal gateを動かさない。
