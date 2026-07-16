# 外側ゲートleaseの復旧基盤を作る — Floodgate v7

> [直前のproduction runner](./blog-shogi-floodgate-v7-production-connector-runner.md)は100・500・24,000専用の入口までを固定した一方、processが途中で消えた後に残る空のstage authorization leaseをlive ownerと安全に区別できないため、real gateの前で停止した。本変更は、三つの入口の最外周へ共通のOS寿命ロックと認証済み永続recordを追加し、stage authorization leaseの作成・削除をparent directoryまで同期する。これは**全lease recoveryの完成ではなく、outer crash evidenceとinspect / explicit quarantineの基盤、ならびにstage fsync hardening**である。実stale recovery、実reboot recovery、production gate、teacher label、training、weight、live activation、対局、棋力測定はいずれも未実施である。English version: [blog-shogi-floodgate-v7-production-lease-recovery.en.md](./blog-shogi-floodgate-v7-production-lease-recovery.en.md)

---

## 1. 結果と今回の範囲

**production gateのholdは続く。** crash時には内側の空stage leaseも残り得る。outer stale sourceをquarantineしても内側leaseは消えず、次のexclusive createは`EEXIST`で止まる。さらにquarantine自身のacknowledgement / resolution / release authorityも今回にはない。したがってauthenticated inner stage metadata、inner reconciliation、quarantine解決を次PRで閉じるまで、実100・500・24,000は0のままblockする。

| 項目                   | 現在の結果                                                                    | この結果が意味すること                                   |
| ---------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------- |
| 共通outer gate         | 三つの固定gateを同じ最外周wrapperへ接続                                       | gate間で別々の排他境界を持たない                         |
| OS寿命ロック           | operation開始前から終了後まで同じprivate registry objectをanchorに保持        | processが生きている間の同時実行をkernel側で拒否する      |
| active record          | 専用派生keyで認証し、operation前にfileとdirectoryを同期                       | crash後に残ったrecordを未認証の空directoryと同一視しない |
| normal retirement      | exact active sourceを保持したままretired evidenceを作り、active removalを同期 | normal successとstale evidenceを同じ扱いにしない         |
| manual stale flow      | inspectとconfirmを分離し、fresh reinspection後だけcreate-only quarantine      | ordinary runnerはstale sourceを自動削除しない            |
| quarantine             | entryが一つでもあれば三つのgateをすべて停止                                   | quarantineは次のgateの許可ではない                       |
| stage authorization v3 | lease create/remove後にheld parentを同期し、前後でidentityを再検査            | directory entryのdurabilityが不明なら成功扱いにしない    |
| production execution   | 0                                                                             | real gateやlive evaluatorを変更した証拠ではない          |
| real recovery drill    | stale 0、reboot 0                                                             | test fixtureの成功を実運用復旧へ読み替えない             |
| 全lease recovery       | 未完成                                                                        | inner空leaseとquarantine resolutionが次blocker           |

本変更の成果は「production runnerを開始してよい」という承認ではなく、開始前と異常終了後に判断できる状態を増やしたことである。とくにquarantine後のacknowledgement、削除、次gate再許可は意図的に実装していない。

## 2. 直前のblockerと今回のdelta

直前のstage authorization leaseは、current-user-owned private directoryをcreate-onlyで作り、normal closeで同じobjectだと再検査して削除する。これは同一process内の二重利用を防ぐが、強制終了や電源断の後には空directoryだけが残る。永続recordにrunとgateのbindingがなく、ownerの寿命と連動するkernel lockもなかったため、ordinary runnerが「古いから」と消すことはできなかった。

今回のdeltaは二層である。

1. 三つのproduction runnerのさらに外側で、一つのOS寿命ロックと認証済みactive recordを所有する。
2. 内側のstage authorization leaseについて、create/removeをheld publication parentまで同期し、同期結果が不明なら同じprocess内の自動再作成を止める。

外側のrecordは内側の空leaseを自動削除する権限ではない。outer stale sourceを明示的にquarantineしても、stage側の残存objectやcheckpointを別途確認せず、次gateへ進むことはできない。この区別を残すことで、「owner deathを示す証拠」と「全ての副作用が安全に片付いた証明」を混同しない。

直前PRのlatest known fresh snapshotではproduction registryもgate processも0で、本番gate由来のv2永続データは0だった。このためmigrationを実行していない。自動adopt、upgrade、deleteも実装せず、将来legacyの空stage leaseを見つけた場合はpreserveして拒否する。これは現在のproduction stateを本稿で再観測したclaimではない。

## 3. 三つのgateで共有するOS寿命ロック

100、500、24,000のpublic entry pointは、いずれも共通の`runProductionGate`からouter wrapperへ入る。wrapperはimmutable private registryをheld descriptorで開き、owner/mode/link、named objectとの一致、許容size、content bindingを検査してから、macOSの固定lock helperをnonblockingで適用する。lock取得に成功するまでregistry load、approved binding、connector、stage、teacher processは開始しない。

production入口はzero-argumentの固定3 ownerだけで、gateやcallbackを外部から注入するgeneric production exportはない。outer ownerはactive publish後にcaptured CommonJS `require`で固定runner moduleをlazy loadし、対応するexact under-outer operationだけを1回呼ぶ。dynamic `import()`は使わない。capabilityが正規connectorによって1回もclaimされない、clone・別gate・二重claimである、またはfixed module loadが失敗する場合は、内側のsuccessとして受理しない。

| 状態                                | ordinary runnerの結果                       | operation実行 |
| ----------------------------------- | ------------------------------------------- | ------------: |
| 別gateがlockを保持                  | `another-gate-invocation-active`として停止  |             0 |
| lock取得後にnamespace不整合         | manual reconciliationを要求                 |             0 |
| lock取得後にstale activeを発見      | inspect-onlyで停止                          |             0 |
| lock取得、staleなし、quarantineなし | 認証済みactiveをdurable publish後にだけ開始 |           1回 |

local process testはprefix同士が重ならないこと、三つのgateが同じ境界を使うこと、SIGTERM後のprocess deathでlockが解放されることを検査する。このtestは実production process、実kernel panic、実battery exhaustion、実rebootを再現していない。したがってreboot recoveryの実証ではない。

## 4. 認証済みactive recordをoperation前にdurableにする

active recordはexact ordered shapeのcanonical JSONLとしてprivate control namespaceへcreate-onlyで置く。専用domainでdeployment root keyから派生したkeyを使い、gate、registry binding、owner lifecycleに必要なprivate metadataを認証する。staging fileを同期し、no-clobber linkでactive nameを作り、control directoryを同期し、staging nameを消してそのdirectoryも同期する。reopenしたexact bytesが一致し、認証が通り、quarantineが空であることを確認してからだけ、exact gateへbindしたopaque single-use connector capabilityを発行する。通常callerにcapabilityは返されず、fixed under-outer operationだけが受け取る。production checkpoint connectorはそのcapabilityを同期claimできなければ開始しない。

独立監査の4件目は、partial publish中のunknown failureがstaging remnantまたはactive linkを過小報告し得る点を検出した。修正後は`authenticated_lease_published / quarantine_blocks_all_gates`を単調にF/T（staging作成後・active link前）、T/T（active link後・staging removalのdirectory durability前）、T/F（staging removalがquarantine directoryまでdurableになった後）と追跡する。`after-staging-create`、`after-active-link-before-control-sync`、`after-durable-active-publish-before-staging-cleanup`、`after-staging-unlink-before-quarantine-sync`の4 failpointを局所注入して境界を検査した。これは実process crashやrebootを起こすtestではなく、real crash/reboot recoveryの証明ではない。

公開receiptはcontract、status、algorithm、固定booleanに加え、productionの固定native descriptor closeをtest-onlyの注入境界と区別する固定`execution_boundary`だけを返す。production runnerはproduction値だけを受け入れるため、testのclose hookをno-opにしたreceiptを「本番でlock releaseを実証した」と読み替えられない。個人環境、所有者、ファイル同一性、認証タグ、乱数、マシン識別子、root key、registry content、生のconnector receipt、生の失敗内容は返さない。これらのprivate値は認証判断に使うが、本稿や[machine-readable evidence](./data/floodgate-v7-production-lease-recovery-2026-07-15.json)には含めない。

認証は「recordをdeployment authorityとregistryへbindできる」ことを示す。recordが残っているだけでoperationが完了した、checkpointが書かれなかった、stageが安全に消えた、次gateを開始できる、という意味にはならない。

## 5. normal success、operation failure、retirementを分ける

normal flowは次の順序である。

```text
common OS lifetime lock
        |
        v
private namespace + quarantine/retired checks
        |
        v
authenticated active publish + durability sync
        |
        v
exact fixed production gate operation
        |
        v
create pending retired evidence
        |
        v
remove exact active + control-directory sync
        |
        v
close retired evidence + retired-directory sync
        |
        v
final private namespace + retired/quarantine validation under lock
        |
        v
release OS lock
```

active removalでは、operation前に保持したexact bytesとfile identityへ再照合し、別objectへ変わっていればunlinkしない。activeを直接消す前にretired namespaceへcreate-only evidenceを作り、そのdirectoryを同期する。closed retired recordもexact ordered shape、認証、current registry bindingをfreshに再検証する。active unlink後のcontrol-directory syncが失敗した場合、pending retirementを残し、次回をfail closedにする。

最終成功ではOS lockを保持したまま、control、quarantine、retiredのprivate directory identity、controlのexact entry set、active不在、quarantine empty、retired evidenceの認証とcurrent bindingをまとめて再検証し、その後にだけdescriptorをcloseする。これにより、lock release後に後続ownerがactiveを作った状態を先行ownerの最終検証が読むraceを消す。normal success receiptはこのlock下最終検証、durable active removal、認証済みclosed retirement、そして対応するexecution boundaryでのcloseが全て成立した場合だけ返る。

内側operationがrejectした場合はactive evidenceを消さず、public failureはmanual reconciliationを要求する。これは「operationが未実行」とも「checkpointが未保存」ともclaimしない。

## 6. stale inspect、明示confirm、quarantineの二段階

lockを取得できたのにactive recordが残る場合、ordinary runnerはそこで停止する。認証済みでcurrent registry bindingと一致するexact sourceだけが、別のinspect entry pointからopaque single-use capabilityを得られる。空のlegacy source、認証不能なsource、binding不一致、identity変化にはcapabilityを発行しない。inspectだけではsourceを変更しない。

confirmにはopaque capabilityと固定confirmation phraseの両方が必要である。confirm phaseはlockを保持したまま、同じsourceをfreshに再openし、bytes、identity、認証、registry binding、quarantine emptyを再確認する。その後だけ、unique create-only destinationへhard linkし、quarantine directoryを同期し、exact active sourceをunlinkし、control directoryを同期する。inspection後にsourceが変わればquarantineしない。cancelはsourceを変えずlockだけを解放する。

quarantine entryがある間、100、500、24,000は全て停止する。今回のreceiptも`next_gate_authorized: false`に相当する意味だけを持ち、acknowledgementや削除を行わない。したがってlocal test上のquarantine成功を「stale recovery完了」や「次gate再開可能」とは呼ばない。

production inspect / confirm / cancelのmodule APIはあるが、固定operator CLI、interactive orchestrator、capabilityを放棄したとき必ずcancelする`finally` ownerはまだない。inspect capabilityは同じprocess内でOS lockを保持するため、custom codeで扱うことをproduction運用手順とはみなさない。これも実stale recoveryを0のままにする理由である。

## 7. stage authorization v3のparent-directory durability

stage authorization leaseのcontractはv3へ更新された。create-only directoryを開いた後、同一process namespace guardをactiveに保ち、held lease directoryを先にsyncし、held leaseを再検査してからheld publication parentをsyncする。そのsyncの前後にもparent pathが同じprivate directoryを指すことを再検査する。close、authorization failure cleanup、publication abort、publication transactionのlease removalでも、exact leaseを削除した後に同じparent syncを要求し、完了するまでguardを解放しない。

| failpoint                         | public behavior                                  | 同じprocessでの再作成 |
| --------------------------------- | ------------------------------------------------ | --------------------- |
| create後のparent sync失敗         | typed durability-indeterminate、lease may remain | block                 |
| held lease directory sync失敗     | parent syncへ進まずtyped indeterminate           | block                 |
| remove前のidentity不一致          | exact objectを削除しない                         | block/fail closed     |
| remove成功後のparent sync失敗     | cleanup/closeをindeterminateとして報告           | block                 |
| publication parent sync前後のswap | publicationを成功扱いしない                      | block                 |
| abort cleanup後のparent sync失敗  | lease removalをdurableとclaimしない              | block                 |

自動再作成blockはprocess-local guard state machineにも記録される。これは同じprocessがactiveまたは不明状態をすぐ上書きすることを防ぐが、再起動をまたぐ認証済みstage tombstoneではない。実reboot後のstage namespace復旧は未実施であり、本変更だけで証明されない。

## 8. signal、exit、error surfaceのownership

outer wrapperのsignal policyはgraceful cleanupをclaimしない。対象signalを受けると、そのsignalのpre-existing persistent listenerを含む全listenerを外し、同じsignalをprocessへ再送してnative defaultのprocess deathへ移る。exit時にactive recordを消さないため、OS lockだけがprocess lifetimeとともに解放され、認証済みrecordはcrash evidenceとして残る。fixed ordinary ownerだけでなくmanual inspectもhandlerをstateととも所有し、confirm/cancelで取り外す。local child-process testは両方のSIGTERM経路を検査するが、実production daemonやrebootのdrillではない。

outer wrapperはnamespace path決定、key派生、lock、publish、operation、cleanupの全phaseを単一のtyped sanitation boundaryで囲み、runnerはそのouter failureを`outer-gate-lock` phaseへsanitiseしてprivate error objectをそのままCLIへ渡さない。認証済みactive publish後の不明failureは、operationやcheckpointが実行された可能性を保守的に残す。public resultはgate、phase、may-have-runに必要なallowlistだけで、private metadataやraw errorを含まない。

descriptor closeの完了はmetadata removalとは別のstateで追跡する。metadataをdurableに片付けた後のcloseが失敗しても、`finally`でcloseをbest-effortでもう一度行い、それも成功しない場合はprocess deathによるdescriptor releaseまで成功をclaimしない。

ownershipの順序は、outer wrapperがlockとactive recordを取得してからrunnerへ渡し、runner settlement後にretirementを完了してからlockを手放す、である。runnerが先にlockを解放したり、内側operationがouter activeを直接消したりする経路はない。

## 9. fail-closed state matrix

| fresh observation                                  | 認証結果            | mutable action                    | 次のordinary gate        |
| -------------------------------------------------- | ------------------- | --------------------------------- | ------------------------ |
| OS lock busy                                       | 判定しない          | なし                              | owner終了後にfresh retry |
| lock free、activeなし、quarantineなし、retired正常 | 不要                | fresh activeをcreate-only publish | 条件を満たせば開始       |
| lock free、認証済みactiveあり                      | current binding一致 | inspectでは変更なし               | manual flowまでblock     |
| lock free、空legacy activeあり                     | 認証不能            | 変更なし、capabilityなし          | block                    |
| lock free、改変activeあり                          | 認証不能            | 変更なし、capabilityなし          | block                    |
| inspect後にsource変化                              | 再検査不一致        | quarantineなし                    | block                    |
| explicit confirm成功                               | fresh再認証         | create-only quarantine            | 全gate block             |
| quarantine entryあり                               | 判定しない          | 自動削除なし                      | 全gate block             |
| pending/不正retired entryあり                      | 判定しない          | 自動修復なし                      | 全gate block             |
| stage parent durability不明                        | outer結果とは別     | 自動再作成なし                    | stage側でblock           |

このmatrixはavailabilityよりevidence preservationを優先する。same-user trusted runtimeの外側からprivate namespaceやkeyを改変できる攻撃者までを防御したというclaimではない。

trust boundaryは、読み込み済みapplication codeとCommonJS module cacheを含む同一process内のcodeをtrustedとする。固定した3つのproduction ownerは、通常のsupported API callerが任意callbackへconnector capabilityを発行させる入口を持たない。一方、hostileな`require.cache`・export差し替え、root key・filesystem・process APIへ到達する任意の同一process codeまでを防ぐOS security boundaryではない。それを要求する場合は、別UIDまたは独立brokerへ境界を移す必要がある。

## 10. local validationと途中の検証時系列

outer lease testsは、三つのgateの共有lock、prefix間serialization、legacy empty source、認証済みstale source、quarantine全gate block、source replacement、operation rejection、pending retirement、SIGTERM、二段階confirm、inspection-to-confirmation race、cancelを覆う。stage authorization testsはcreate/remove sync順序、各failpoint、publication abort、parent identity swap、close共有を覆う。runner testsはouter success receiptをexact検証し、outer failureを保守的なpublic projectionへ変換する。

独立監査で見つけた項目は、途中経緯を消さず次のように閉じた。

| audit finding                                              | 修正・regression evidence                                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| generic production callbackがcapability発行口になる        | exportを削除し、zero-argument fixed 3 owner、lazy fixed operation、unclaimed/clone/forge/double/gate-bound testへ変更                               |
| production manual APIがraw failureを返す可能性             | inspect/confirm/cancelをtyped sanitized failureへ固定し、close faultを実測                                                                          |
| pre-existing signal listenerがdeathを吸収できる            | delivered signalの全listenerを除去後に再送し、ordinary/manual childで確認                                                                           |
| `lockf`の全nonzeroをbusy扱い                               | exit 75だけをcontention、他はsanitized manual failureに分離                                                                                         |
| closed retiredの改変系negative coverage不足                | tamper、valid-HMAC extra field、current-registry mismatchをfail closedで固定                                                                        |
| macOS helperが無い環境でtestが0件greenになる               | Darwin CIで`/usr/bin/lockf`をexecutableとして必須化し、outer adversarial suiteを固定実行                                                            |
| test用no-op closeでproduction releaseと同じreceiptを作れる | production/test `execution_boundary`を分離し、production runnerはproduction値のみ受理。no-op closeでlockが実際に残るtestも追加                      |
| final namespace検証のlock release後race                    | private directory、exact entries、active、quarantine、retiredをlock下でまとめて検証してからclose。後続ownerとの競合testを追加                       |
| 早期phaseとfinal closeに一貫したsanitize/settlementがない  | wrapper全体をphase-aware typed failureで囲み、lock releaseをmetadata removalと独立追跡。publish前後のProxy/raw faultとcleanup downgradeを回帰test化 |
| partial publish failureがstaging / active進捗を過小報告    | F/T、T/T、T/Fを単調追跡し、4 failpointでstaging remnant、active link、directory durabilityを回帰検査                                                |

先の監査修正後、outer・runner・checkpoint connector・CLIの局所4 fileは要求Nodeで187 / 187を通過した。先行3件を追加修正したtreeの193 / 193は4件目のpartial publish修正前snapshotとして保持する。4件目を含む最新treeでは同じ4 fileが197 / 197を通過した。stage authorization・publicationの2 fileは別の独立rerunで147 / 147だった。

最初のcombined rerunは要求版ではないNodeで271 / 280、要求版へ直した実装途中では278 / 280、その後の安定snapshotでは337 / 337だった。先行3件の追加監査修正を含む7 file・344 / 344（Vitest 8.33秒、wall 8.69秒、最大resident set 304,496,640 bytes、swap 0）も通過したが、4件目のpartial publish修正前なのでprior snapshotへ降格した。Node v22.13.0で4件目を含む最新7 fileを再実行し、348 / 348、Vitest 8.14秒、wall 8.49秒、最大resident set 298,811,392 bytes、swap 0で通過した。この348 / 348を現在の最終combined evidenceとする。

最終の変更file全体へPrettier範囲を広げた最初のcheckでは、Darwin CI YAML 1 fileだけの書式差を検出した。機能failureではなく、同fileを機械整形した後のexpanded checkとdiff checkはpassした。このattemptも「最初からstaticが全passだった」とは記録しない。

先行3件の追加監査修正を含む全体回帰snapshotは138 file・2,597 / 2,597、Vitest 159.26秒、wall 159.68秒、最大resident set 4,373,102,592 bytes、swap 0で通過したが、4件目のpartial publish修正前なのでprior snapshotへ降格した。2,590 / 2,590もさらに前のsnapshotとして保持する。Node v22.13.0で4件目を含む最新全体回帰を再実行し、138 file・2,601 / 2,601、Vitest 153.22秒、wall 153.67秒、最大resident set 4,325,474,304 bytes、swap 0で通過した。この2,601 / 2,601を現在の最終full evidenceとする。

全ての成功testはlocal fixtureまたはlocal child processである。partial publishの4 failpointも局所test hookで、実process crash、実reboot、実production gateではない。

## 11. privacy、nonclaims、production execution 0

公開記事、JSON evidence、public receipt、public failureには、個人環境の場所、所有者識別値、file identity、private registry content、key material、key instance、認証タグ、乱数、machine identity、生のconnector receipt、生のerrorを含めない。test fixture内で必要なprivate値もpublic成果物へ転記しない。

本変更による以下の実行数は全て0である。

- real authenticated stale recovery: 0
- real reboot recovery: 0
- production prefix 100 / prefix 500 / final 24,000 gate: 0 / 0 / 0
- real teacher process / label / checkpoint finalization: 0 / 0 / 0
- optimizer / training run / candidate weight: 0 / 0 / 0
- formal A/B match / live activation / external rank observation: 0 / 0 / 0

production stateは本稿のためにfresh観測していない。「このchangeがlive weightを変更していない」と「現在のlive stateを独立に確認した」は別であり、後者はclaimしない。棋力はこの成果からは変化していない。

## 12. 次のgateと残る作業

次の順序は、local test成功だけで飛ばさない。

1. 安定した共有treeでfocused test、TypeScript、lint、format、diff checkを再実行する。
2. ready PRとしてreviewし、actionable commentを修正し、通常のmerge commitで統合する。
3. authenticated inner stage metadataとstale reconciliationを実装し、outer quarantine acknowledgement、retention、削除、stage残存objectの確認、次gate再許可を別の明示authority/runbookとして定義する。現PRのquarantine receiptはそのauthorityを持たない。
4. 固定operator CLI / orchestratorと、全exit pathでinspect capabilityをcancelまたはconfirmするownerを実装する。
5. production外の隔離環境で、実process kill後のinspect/cancel/confirmと再起動をdrillし、証拠を残す。実reboot recoveryはまだ0である。
6. fresh production preflight後にprivate registryを確認し、必要なら既存create-only provisionerで一度だけ設置する。
7. 100を実行・inspectし、人間承認後だけ500、さらに承認後だけ24,000へ進む。
8. checkpoint finalization、QAT/selection、sealed holdout、十分なpaired A/B、段階的live rollout、外部rank calibrationを終える。

独立設計監査による**full hardened recovery design estimate**は次のとおりである。これは実測runtimeや完了期限ではなく、並列実行、現在の安全要件、各PRの依存順序を前提にした計画見積りである。

| 残る範囲                                                           | engineer-hours | 並列・依存込みwall-hours | 限定                                                                                                            |
| ------------------------------------------------------------------ | -------------: | -----------------------: | --------------------------------------------------------------------------------------------------------------- |
| 速度優先のminimum-safe one-shot案の再評価                          |              — |                     8–16 | 予備的な計画範囲でscope未固定。full hardened recoveryと同等ではなく、現PR後に安全要件を落とさない最小案を再判定 |
| inner scanner、signed journal、resolution/release、crash testの2PR |          43–67 |                    31–56 | 実測ではない。現PR後に速度優先の最小safe recovery案を再評価するため、scope削減で変わり得る                      |
| 実macOS reboot drillとproduction preflight                         |              — |                      3–6 | 上の実装後の別工程。real gate実行時間は含まない                                                                 |

stable high-danは最後の評価結果であり、このPRのlock・durability testから推定しない。
