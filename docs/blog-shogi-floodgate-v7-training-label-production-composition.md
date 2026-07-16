# held workのpreflightと2回の認証済み走査が完了してからproduction planを発行する — Floodgate v7 training-label production composition

> #477はtest-only opaque planのexact-prefix永続化を成立させたが、認証済みV3 workからproduction planを発行する権限経路はまだなかった。今回の境界では、callerがcommon outer lockを保持しているという契約の下で、同じheld `work.jsonl`をunkeyed preflightし、その実測値から内部でscan keyを取得して2回認証走査する。2回目のenclosing scan全体が成功した後だけproduction opaque planを発行できる。production entrypointは追加するが、outer lock保持をentrypoint単体で証明するfixed owner / CLI、fixed current-user invocation、実24,000親dataset、学習、weight、A/B、external calibration、live evaluator変更は行わない。English version: [blog-shogi-floodgate-v7-training-label-production-composition.en.md](./blog-shogi-floodgate-v7-training-label-production-composition.en.md)

---

## 1. #477のtest-only planだけではproduction originを閉じられない

#477のprivate persistence runnerは、`work.jsonl`、`train.jsonl`、`result.json`、`manifest.json`のexact-prefix state machineとpublication後のcontent auditを検証した。しかし、そのplanはtiny synthetic projectionをtest factoryへ渡して作るものであり、V3 HMAC、seal、tail、full snapshot、pathname confirmationをproduction authorityとして結び付けてはいなかった。

今回閉じるのは、その手前にあるproduction composition boundaryである。production code pathは追加するが、この変更ではfixed current-user production operationを一度も実行しない。production namespaceを読み書きせず、real Floodgate game、teacher label、optimizer、candidate weight、対局、live `runOp1`を変えない。

## 2. testとproductionは別registryから同じprivate runnerへ入る

test planとproduction planは別々のmodule-private `WeakMap`へ登録する。opaque facadeのobject identityを一度だけclaimし、clone、Proxy、別object、2回目のclaimを拒否する。

| Authority                    | Test boundary             | Production boundary            |
| ---------------------------- | ------------------------- | ------------------------------ |
| sealed replay / scan session | injected test registry    | fixed production registry      |
| opaque plan                  | test plan registry        | production plan registry       |
| consumer postflight          | `...CoreForTests` claim   | current production claim       |
| stage publication            | injected test transaction | production transaction         |
| output key                   | injected owned copy       | fixed deployment-key authority |

test adapterとproduction adapterはmodule-private persistence runnerだけを共有する。production adapterはexport済みの`...CoreForTests`、test plan registry、injected publication seam、caller-supplied root keyへ入らない。production facadeにもrow、byte、path、file descriptor、key、callbackを載せない。

scanner entryはfresh consumer inputを最初の`await`より前に同期的にclaimし、active stage-authorization leaseの所有権もscanner内部へ同期的にtransferする。microtaskやdelayed callbackからinputをclaimしたりleaseを再利用したりすることはできず、postflightやplan authorityも発行しない。

scan-key authorizationはcallerがprepareして先に渡すものではない。scannerがheld stage / workを開き、unkeyed full-file preflightを完了して得た実測byte count / SHA-256とrun / stage / gate bindingからrequestを内部で組み立て、その場でpurpose-specific authorizationをprepareして直ちにclaimする。snapshotはsame-held-descriptor continuityのためscanner内部に保持するが、このscan-key requestのfieldではない。したがってscan keyのprepare / claimを「最初の`await`より前」という外部capture条件に置かない。

## 3. unkeyed preflightの後、keyed pass 1はsinkなし、keyed pass 2だけsink付きで走査する

composition entryはcommon outer lockがすでに保持されていることを前提にするが、その保持を自身では観測・証明できない。scannerはfresh consumer inputを同期claimし、active stage leaseを内部へ移してからheld stage descriptorとheld work descriptorを開き、両方をsession終了まで保持する。対象はexact sealed-final V3 workだけであり、prefix-100 / prefix-500は受け付けない。

1. unkeyed full-file preflightは同じheld workを先頭から末尾まで読み、full snapshot、file bytes、complete-file SHA-256、held / named path continuityだけを確定する。V3 framing、seal、tail、HMACはここでは解析・認証済みと扱わず、keyed passで初めて権威ある検査になる。
2. scannerはそのactual preflightだけからscan-key requestを内部prepareし、返されたone-shot authorizationを同じ内部境界で直ちにclaimする。external prepared keyは受け付けない。callerが渡すexpected bytes / SHA-256は事前の一致commitmentにすぎず、scannerが実測したkey requestを置換・上書きできない。
3. keyed pass 1はsinkなしで同じheld workを先頭から走査し、V3 HMAC chain、binding、seal、tail、record count、snapshot、held / named path確認を完了する。
4. keyed pass 2は同じheld descriptorとfull snapshotを使い、awaited / backpressured sinkでcompleted parentをprojectする。現在のsink Promiseが値なしでfulfillするまでscannerは次のparentを読まない。
5. keyed pass 2が24,004 complete records、24,000 completed parents、`authenticatedBytes === fileBytes`、no torn tail、same hash / snapshot、post-scan path confirmationを満たしてreturnした後だけplan mintへ進む。

sink call数や最後のparent eventだけでは成功にならない。2回目のscanner Promiseがterminal receiptをreturnすることが必要である。

## 4. preflight、2回のkeyed scan、terminal reverifyを同じheld workへ固定する

unkeyed preflight、keyed pass 1、keyed pass 2、terminal keyed reverifyは同じheld descriptorとwork identityへbindする。比較するのはinodeだけではない。

- device / inode
- regular-file type、owner、mode、link count
- size、`mtimeNs`、`ctimeNs`
- complete-file SHA-256とauthenticated byte count
- held stage / workとnamed stage / workのpathname identity
- stage parent / stage identityとstage / destination basename

scannerがdescriptorをopenしてpinした後は、同じbyteを持つ別inodeへの交換、append / truncate、chmod、hardlink、mtime / ctime change、symlink、pathname deletion、whole-stage move、extra entryのうち、scanまたはconfirmation時点で観測可能な変化がplan mint前にfail closedとなる。#478はscanner呼び出し前のinode / snapshotをbindせず、namespaceを連続監視するものでもないため、confirmation間だけpathをmoveして完全に戻す、またはextra entryを一時作成して消す操作は観測できない場合がある。open前のcontinuityと、そのような一時的namespace競合の排除は#479のfixed lexical ownerが成立させるouter-lock前提である。content / metadataは各recheckでpin済みfull snapshotとdigestに一致しなければならない。

## 5. sink eventは最後までprovisionalである

keyed pass 2のsinkは、各entryがcanonical bytes、HMAC chain、binding、completed-evidence検査を通過した後だけ呼ばれる。しかしstream末尾のseal、tail、snapshot、path確認より前に呼ばれ得るため、各projectionはprovisionalである。

early valid eventの後にwrong seal、authenticated seal後のtail、snapshot mutation、path replacement、sinkのthrow / reject、または値ありfulfillがあれば、enclosing scanは失敗する。その場合はproduction planを発行せず、output keyを取得せず、`train.jsonl`を作らない。sink eventをreceiptやdurable queueへ直接変換する経路も作らない。

## 6. production planはrestartable scanner-backed replayだけを保持する

2回目のkeyed terminal success後、production plan registryへopaque one-shot planを登録する。private planはactive stage leaseを所有するproduction publication transaction、held stage / workとowned scan keyを保持するscan session、expected deterministic summary、restartable scanner-backed async replayを保持する。

各replayはposition 0から開始し、same held workをseal、tail、snapshot、path confirmationまでdrainしなければならない。先頭だけ読んでreturnする、同時に2つのreplayを走らせる、2回目だけrow順・count・digestが変わる、途中でthrowする場合はauthority failureである。resume時にreplayを複数回使っても、同じcanonical training bytesとparent summaryにならなければpublicationしない。

production callerはprojection array、replay callback、prepared scan-key authorizationを渡せない。abandoned planはheld stage / work descriptorをcloseし、owned scan keyをzeroizeし、publication transactionをabortしてscannerへtransfer済みのactive stage leaseをterminalに処理する。

## 7. run、key、parent、stage、postflightを1つのclosureへ結ぶ

production planとresult / manifestは次をcross-bindする。

- exact run IDとdeployment key ID
- authenticated V3 headerから得たcanonical teacher-run-binding SHA-256
- current training-input bindingとparent-ID commitment
- sink streamから再計算したparent-ID digest（digest自体は順序非依存）と、別に強制するexact sequence、expected training summary
- held parent / stage device・inode、stage / destination basename
- held work full snapshot、bytes、SHA-256
- current exact consumer-postflight SHA-256

production APIはcaller-supplied `teacherRunBindingSha256`、serialized row、absolute path、lease identity、raw root key、caller digestを「実測preflight fact」またはkey-request overrideとして受け取らない。expected work bytes / SHA-256はheld-file preflightとの一致commitmentにすぎない。V3 scan authorizationとoutput-finalizer authorityは別registry、別request、別module purposeのcapabilityであり、片方をもう片方としてclaimできない。

ただし、これはV3認証に「暗号学的なread-only key」を新設するという意味ではない。既存checkpoint writerが生成したV3 HMACを検証するには、scan側も同じV3 HKDF info / MAC domainから同じHMAC key bytesを導出する必要がある。separationは共通deployment root authorityから先のrequest、registry、one-shot capability claim、利用moduleのpurposeにある。対してresult keyとmanifest keyは互いにもscan keyにも異なるHKDF info / MAC domainから得る。

## 8. terminal keyed work reverifyをcommitより前に完了する

persistence runnerが扱うinitial stage stateは#477と同じく、`W=work`、`T=train`、`R=result`、`M=manifest`として`{W}`、`{W,T}`、`{W,T,R}`、`{W,T,R,M}`の4つだけである。successorがある場合はpredecessorがcomplete exact bytesでなければならず、truncate、unlink、overwrite、automatic repairは行わない。

production adapterはtest-only statusやsynthetic literalをresult、manifest、receiptへ混ぜない。train、result、manifestを順にexact-prefixで完成し、source contentを監査した後、retained scan keyと同じheld descriptorでterminal no-sink keyed work scanを行う。このscanがHMAC chain、binding、seal、tail、full snapshot、held / named pathを再確認して成功した後、scan keyをzeroizeする。ここまでが`transaction.commit()`より前である。

その後にproduction publication transactionをcommitする。commit自身がexclusive rename、reopened destination reconciliation、publication-parent sync、stage-authorization lease removal、removal後のparent syncを行い、stage lease removalがdurableになってからreturnする。commit後のfinalizer content auditは、scan keyやstage leaseではなく、まだ保持しているcommon outer lockの内側で行うpoint-in-time destination auditである。

## 9. 2種類のleaseを混同せず、#479 ownerがouter lock保持を証明する

stage-authorization leaseとouter-gate active leaseは別物である。

```text
common OS lock acquired by the caller (#478 assumption; #479 fixed owner)
  -> outer active lease durable
  -> fresh consumer input synchronously claimed
  -> active stage-authorization lease transferred into scanner
  -> held stage + held work opened and retained
  -> unkeyed full-file preflight
  -> scan-key authorization internally prepared from actual preflight and immediately claimed
  -> keyed pass 1 without sink -> keyed pass 2 with awaited sink
  -> production plan mint
  -> postflight + output keys -> exact-prefix persistence
  -> terminal no-sink keyed work scan -> scan-key zeroization
  -> transaction.commit
       -> exclusive rename and destination reconciliation
       -> parent sync before stage-lease removal
       -> stage-authorization lease removal
       -> parent sync after removal; commit returns
  -> later destination/content audit under common outer lock only
  -> remaining owned-key zeroization and descriptor cleanup
  -> outer callback returns
  -> outer active lease removal/retirement durable
common OS lock released last
```

late content audit開始時にはstage leaseが消えていても、callerが保持し続けるcommon outer lockが競合する3 gateを直列化する。ただし#478のcomposition entrypointは「lock held」を引数やOS stateから証明せず、正しいlexical ownerの内側から呼ばれることを契約として仮定する。#479のfixed owner / CLIが既存outer-gate ownerからlazy-loadしてこの呼び出し関係を固定し、outer callback return、outer active lease cleanup、OS lock releaseの順序を初めてproduction entryとして証明する。

## 10. failure、retry、abandon cleanupを明示する

failureはfresh-input claim、stage-lease transfer、held stage / work open、unkeyed preflight、internal scan-key prepare / immediate claim、keyed pass 1、between-pass continuity、keyed pass 2 provisional projection、terminal confirmation、plan mint、replay、postflight、output-key acquisition、train / result / manifest persistence、terminal keyed work scan、publication、later content audit、cleanupへ分類する。独立したfailure booleanで`throw undefined`をsuccessと誤認しない。

keyed pass 2完了前ならprovisional projectionを破棄する。safeなpre-publication exact prefixはfresh input、fresh stage lease、actual preflight由来のfresh scan authorityでresumeできる。一方、partial train persistence中のscanner replay / work authentication failureはfresh retryではなくmanual content reconciliationとする。rename後、stage-lease removal中、またはpost-publication audit失敗はpublication / lease facetsを保守的に報告する。

owned keyは最後の利用直後にzeroizeし、failure pathではasync handle-close cleanupへ入る前に同期的にzeroizeする。primary failureとclose / abort failureは別々に保持するが、public errorへraw key、path、MAC、private causeを出さない。

正常にtransferされていないauthorityはcallerに残し、cloned / foreign / stale facadeの失敗からcopyされたlease-close closureを呼ばない。transfer後にcleanupがindeterminateになった場合はscanner discardとplan discardの両方がtombstoneを保持し、反復discardでidempotent successを返さず、記憶したclose / abort failureを再提示する。private plan mappingを消すのはdiscardが完全に成功した後だけである。

## 11. local validationは完了し、production executionはzeroのままである

candidate code revision `cfd29ff`をNode 22.13.0 / npm 11.14.1で固定してlocal validationを実測した。exact synthetic 24,000-parent integrationは、primary runだけでなく独立したroot replicateも同じtestを最初から生成し直して通過した。primaryはtest 303.006秒 / Vitest 303.59秒、replicateはtest 305.48秒 / Vitest 306.10秒で、どちらもunhandled errorは0だった。focused、related、full VitestのVitest durationはそれぞれ0.552秒、87.12秒、314.95秒である。commandを含む生の構造化値は[machine evidence](./data/floodgate-v7-training-label-production-composition-2026-07-16.json)へ記録した。

| Validation                                       | Status   | Tests / result           | Wall    | Maximum RSS   | Swaps |
| ------------------------------------------------ | -------- | ------------------------ | ------- | ------------- | ----- |
| focused fast/adversarial                         | COMPLETE | 3 files / 34 passed      | 0.96s   | 278,020,096   | 0     |
| exact synthetic 24k — primary                    | COMPLETE | 1 file / 1 passed        | 303.99s | 786,579,456   | 0     |
| exact synthetic 24k — independent root replicate | COMPLETE | 1 file / 1 passed        | 306.47s | 810,287,104   | 0     |
| related contracts — final                        | COMPLETE | 5 files / 90 passed      | 87.52s  | 2,413,199,360 | 0     |
| TypeScript                                       | COMPLETE | exit 0                   | 3.18s   | 1,146,044,416 | 0     |
| Prettier                                         | COMPLETE | 12 files / all matched   | 1.24s   | 333,316,096   | 0     |
| scoped ESLint                                    | COMPLETE | 9 files / 0 warnings     | 1.95s   | 552,910,848   | 0     |
| full ESLint                                      | COMPLETE | 0 errors / 157 warnings  | 25.35s  | 1,415,282,688 | 0     |
| full Vitest                                      | COMPLETE | 158 files / 2,864 passed | 315.35s | 2,380,939,264 | 0     |
| production build                                 | COMPLETE | 193 / 193 static pages   | 26.87s  | 2,639,167,488 | 0     |
| ML stdlib                                        | COMPLETE | 58 / 58 passed           | 0.42s   | 64,208,896    | 0     |
| npm audit                                        | COMPLETE | 0 vulnerabilities        | 0.62s   | 136,036,352   | 0     |
| local security review                            | COMPLETE | P0 0 / P1 0; P2 2 / P3 2 | —       | —             | —     |
| GitHub CI / review                               | PENDING  | PR未作成                 | —       | —             | —     |

formal passまでのiterationも証拠から落としていない。

- 約61.24秒の初回は、Promiseを返すAPIが一部のlookup failureを同期throwしていた。implementation contractを修正し、rejectionへ統一した。
- 103.5秒のrunは、path replacementが後段のpathname checkで落ちるとtestが限定していたが、実際には先行するctime mutation checkが安全に拒否した。fail-closedの実装は維持し、test expectationを正した。
- 53.27秒のrunは、clone rejectionを`await`したためfresh-row claim windowを越えた。authorityの同期claimを検証できる順序へtestを直した。
- 271.24秒のrunは、copied stageがV3 headerのstage bindingと一致せず、early-abort hook fixtureも元inodeを保てなかった。同じinodeを維持するfixtureへ直してformal passへ進んだ。
- related contractsの初回はsource-marker expectation 2件だけが失敗した（87.17秒、maximum RSS 2,244,427,776 bytes、swap 0）。該当evidence 2 files / 14 testsを修正後に全件通過させ、最後に5 files / 90 testsを再実行してformal passを確定した。

独立security reviewの最終結果はblocking P0 / P1が各0件だった。nonblocking P2は2件で、scannerのcommit-indeterminateを直接注入するtest seamがないこと、exact end-to-end corpusがall-forcedで`training_records=0`であること（non-forced trainingは既存projection / finalizer testが別に覆う）である。P3は2件で、scanner内部の3か所の`AggregateError`構築がarray spreadを使うこと、generic plan-discardの`AggregateError`をsanitizeする場合は内部cleanup件数を分類できず、公開`cleanupFailureCount`が既定の0になり得ることである。後者でも`leaseMayRemain`とretry dispositionは安全側に倒れる。これらを「所見なし」とは数えず、#478の安全claimを妨げない残課題として記録した。GitHub CI / reviewだけはまだ観測していないため`PENDING` / `null`を維持する。

production composition entrypointをcodeとして追加することと、fixed current-user production operationを実行することは別である。この変更によるfixed production invocation、production preflight / keyed scan、production plan mint、production output、real game read、teacher generation、training、weight、formal A/B、external calibration、live activationはすべて0である。test-only temporary fixtureやsynthetic 24,000-parent scanをproduction executionまたはreal dataへ数えない。

## 12. 次はfixed owner / CLIであり、棋力証明はさらに後である

#479では、このcompositionを既存のsealed-final common outer-gate ownerからfixed dependencyだけでlazy-loadするownerとzero-argument CLIへ閉じ込める。そこで#478が仮定するcommon outer lockのlexical ownershipとrelease-last順序をproduction entryとして成立させる。test dependency、raw path、raw key、run optionをproduction commandへ公開せず、signal、exit、sanitized failure、one-shot capability consumptionを検証する。

そのowner / CLIがmergeされても、実24,000親runは別のoperational gateである。real teacher generation、dataset finalization、retraining、candidate selection、192 color-swapped pairs / 384 gamesのformal A/B、200 external-calibration gamesを順に完了し、rollbackとlive安全条件を満たすまで`runOp1`を変更しない。このcompositionだけではdataset、weight、Elo、段位、stable high-danを主張しない。
