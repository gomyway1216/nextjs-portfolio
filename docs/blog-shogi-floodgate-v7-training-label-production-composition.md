# 2回の認証済み走査が完了してからproduction planを発行する — Floodgate v7 training-label production composition

> #477はtest-only opaque planのexact-prefix永続化を成立させたが、認証済みV3 workからproduction planを発行する権限経路はまだなかった。今回の境界では、common outer lockの内側で同じheld `work.jsonl`を2回走査し、2回目のenclosing scan全体が成功した後だけproduction opaque planを発行できるようにする。production entrypointは追加するが、fixed current-user invocation、owner / CLI、実24,000親dataset、学習、weight、A/B、external calibration、live evaluator変更は行わない。English version: [blog-shogi-floodgate-v7-training-label-production-composition.en.md](./blog-shogi-floodgate-v7-training-label-production-composition.en.md)

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

consumer inputとprepared scan-key authorityはcallbackがreturnする前、最初の`await`より前に同期的にclaim / captureする。microtaskやdelayed callbackからのclaimは失敗し、postflightやplan authorityを発行しない。

## 3. pass 1はvisitorなし、pass 2だけvisitor付きで走査する

common outer lock下でfresh active stage leaseとpurpose-specific V3 scan keyを先に取得し、held stage descriptorとheld work descriptorを開く。対象はexact sealed-final V3 workだけであり、prefix-100 / prefix-500は受け付けない。

1. pass 1はvisitorなしで同じheld workを先頭から走査する。
2. pass 1のseal、tail、record count、snapshot、held / named path確認がすべて成功したことをprivate stateへ記録する。
3. pass 2は同じheld descriptorとfull snapshotを使い、awaited / backpressured sinkでcompleted parentをprojectする。現在のsink Promiseが値なしでfulfillするまでscannerは次のparentを読まない。
4. pass 2が24,004 complete records、24,000 completed parents、`authenticatedBytes === fileBytes`、no torn tail、same hash / snapshot、post-scan path confirmationを満たしてreturnした後だけplan mintへ進む。

visitor call数や最後のparent eventだけでは成功にならない。2回目のscanner Promiseがterminal receiptをreturnすることが必要である。

## 4. 2回のscanとterminal reverifyは同じheld workへ固定する

pass 1、pass 2、terminal keyed reverifyは同じheld work identityへbindする。比較するのはinodeだけではない。

- device / inode
- regular-file type、owner、mode、link count
- size、`mtimeNs`、`ctimeNs`
- complete-file SHA-256とauthenticated byte count
- held stage / workとnamed stage / workのpathname identity
- stage parent / stage identityとstage / destination basename

同じbyteを持つ別inodeへの交換、append / truncate、chmod、hardlink、mtime / ctime change、symlink、pathname deletion、whole-stage move、extra entryはすべてplan mint前にfail closedとなる。一度変えて元へ戻したつもりでも、full snapshotまたはdigestが一致しない限り受理しない。

## 5. visitor eventは最後までprovisionalである

pass 2 visitorは、各entryがcanonical bytes、HMAC chain、binding、completed-evidence検査を通過した後だけ呼ばれる。しかしstream末尾のseal、tail、snapshot、path確認より前に呼ばれ得るため、各projectionはprovisionalである。

early valid eventの後にwrong seal、authenticated seal後のtail、snapshot mutation、path replacement、sinkのthrow / reject、または値ありfulfillがあれば、enclosing scanは失敗する。その場合はproduction planを発行せず、output keyを取得せず、`train.jsonl`を作らない。sink eventをreceiptやdurable queueへ直接変換する経路も作らない。

## 6. production planはrestartable scanner-backed replayだけを保持する

2回目のterminal success後、production plan registryへopaque one-shot planを登録する。private planはproduction publication transaction、retained scan session、expected deterministic summary、restartable scanner-backed async replayを保持する。

各replayはposition 0から開始し、same held workをseal、tail、snapshot、path confirmationまでdrainしなければならない。先頭だけ読んでreturnする、同時に2つのreplayを走らせる、2回目だけrow順・count・digestが変わる、途中でthrowする場合はauthority failureである。resume時にreplayを複数回使っても、同じcanonical training bytesとparent summaryにならなければpublicationしない。

production callerはprojection arrayやreplay callbackを渡せない。abandoned planはscan descriptorをcloseし、owned scan keyをzeroizeし、publication transactionをabortしてactive stage leaseをterminalに処理する。

## 7. run、key、parent、stage、postflightを1つのclosureへ結ぶ

production planとresult / manifestは次をcross-bindする。

- exact run IDとdeployment key ID
- authenticated V3 headerから得たcanonical teacher-run-binding SHA-256
- current training-input bindingとparent-ID commitment
- visitor順序から再計算したparent-ID digestとexpected training summary
- held parent / stage device・inode、stage / destination basename
- held work full snapshot、bytes、SHA-256
- current exact consumer-postflight SHA-256

production APIはcaller-supplied `teacherRunBindingSha256`、serialized row、absolute path、lease identity、raw root keyをauthorityとして受け取らない。V3 scan keyとoutput-finalizer authorityは別registry、別request、別purposeであり、result keyとmanifest keyも別HKDF info / MAC domainから得る。

## 8. terminal keyed work reverifyをcommitより前に完了する

persistence runnerが扱うinitial stage stateは#477と同じく、`W=work`、`T=train`、`R=result`、`M=manifest`として`{W}`、`{W,T}`、`{W,T,R}`、`{W,T,R,M}`の4つだけである。successorがある場合はpredecessorがcomplete exact bytesでなければならず、truncate、unlink、overwrite、automatic repairは行わない。

production adapterはtest-only statusやsynthetic literalをresult、manifest、receiptへ混ぜない。train、result、manifestを順にexact-prefixで完成し、source contentを監査した後、retained scan keyでterminal no-visitor work reverifyを行う。このreverifyがseal、tail、full snapshot、held / named pathを再確認して成功した後、scan keyをzeroizeする。ここまでが`transaction.commit()`より前である。

その後にproduction publication transactionをcommitする。commit自身がexclusive rename、reopened destination reconciliation、publication-parent sync、stage-authorization lease removal、removal後のparent syncを行い、stage lease removalがdurableになってからreturnする。commit後のfinalizer content auditは、scan keyやstage leaseではなく、まだ保持しているcommon outer lockの内側で行うpoint-in-time destination auditである。

## 9. 2種類のleaseを混同せず、outer lockを最後に解放する

stage-authorization leaseとouter-gate active leaseは別物である。

```text
common OS lock acquired
  -> outer active lease durable
  -> fresh stage-authorization lease + scan key
  -> pass 1 -> pass 2 -> production plan mint
  -> postflight + output keys -> exact-prefix persistence
  -> terminal keyed work reverify -> scan-key zeroization
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

late content audit開始時にはstage leaseが消えていても、common outer lockは競合する3 gateを引き続き直列化する。成功receiptは、outer callbackがreturnし、outer ownerがactive leaseを片付け、lockを解放する前には返さない。

## 10. failure、retry、abandon cleanupを明示する

failureはauthority capture、pass 1、between-pass continuity、pass 2 provisional projection、terminal confirmation、plan mint、replay、postflight、output-key acquisition、train / result / manifest persistence、terminal work reverify、publication、later content audit、cleanupへ分類する。独立したfailure booleanで`throw undefined`をsuccessと誤認しない。

pass 2完了前ならprovisional projectionを破棄する。safeなpre-publication exact prefixはfresh authorityでresumeできる。一方、partial train persistence中のscanner replay / work authentication failureはfresh retryではなくmanual content reconciliationとする。rename後、stage-lease removal中、またはpost-publication audit失敗はpublication / lease facetsを保守的に報告する。

owned keyは最後の利用直後にzeroizeし、failure pathではasync handle-close cleanupへ入る前に同期的にzeroizeする。primary failureとclose / abort failureは別々に保持するが、public errorへraw key、path、MAC、private causeを出さない。

## 11. validationはPENDING、production executionはzeroである

このarticle scaffoldを作成した時点ではcandidate revision、focused test、full suite、build、CI、reviewはまだ実測していない。未観測値をpassとして埋めず、[machine evidence](./data/floodgate-v7-training-label-production-composition-2026-07-16.json)へ`PENDING` / `null`で残す。code candidateが固まった後、command、test数、wall time、maximum RSS、swap、最初の失敗と再実行も追記する。

| Validation                               | Status  | Tests / result | Wall | Maximum RSS | Swaps |
| ---------------------------------------- | ------- | -------------- | ---- | ----------- | ----- |
| focused fast/adversarial                 | PENDING | null           | null | null        | null  |
| exact synthetic 24k two-pass integration | PENDING | null           | null | null        | null  |
| related contracts                        | PENDING | null           | null | null        | null  |
| TypeScript / Prettier / ESLint           | PENDING | null           | null | null        | null  |
| full Vitest / build / ML stdlib / audit  | PENDING | null           | null | null        | null  |
| GitHub CI / review                       | PENDING | null           | null | null        | null  |

production composition entrypointをcodeとして追加することと、fixed current-user production operationを実行することは別である。この変更によるfixed production invocation、production plan mint、production work scan、production output、real game read、teacher generation、training、weight、formal A/B、external calibration、live activationはすべて0である。test-only temporary fixtureやsynthetic 24,000-parent scanをproduction executionまたはreal dataへ数えない。

## 12. 次はfixed owner / CLIであり、棋力証明はさらに後である

#479では、このcompositionを既存のsealed-final common outer-gate ownerからfixed dependencyだけでlazy-loadするownerとzero-argument CLIへ閉じ込める。test dependency、raw path、raw key、run optionをproduction commandへ公開せず、signal、exit、sanitized failure、one-shot capability consumptionを検証する。

そのowner / CLIがmergeされても、実24,000親runは別のoperational gateである。real teacher generation、dataset finalization、retraining、candidate selection、192 color-swapped pairs / 384 gamesのformal A/B、200 external-calibration gamesを順に完了し、rollbackとlive安全条件を満たすまで`runOp1`を変更しない。このcompositionだけではdataset、weight、Elo、段位、stable high-danを主張しない。
