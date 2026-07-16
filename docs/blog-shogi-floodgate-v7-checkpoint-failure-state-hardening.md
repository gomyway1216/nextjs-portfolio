# `undefined`を成功と誤認しない — Floodgate v7 checkpoint failure-state hardening

> [production checkpoint connector](./blog-shogi-floodgate-v7-production-checkpoint-connector.md)は、coordinator、stage lease、deployment key、24,000 training rows、V3 checkpoint、postflightを一つのownership boundaryへ閉じる。本変更は、その内部failure stateでJavaScriptの値`undefined`を「failureなし」のsentinelとして兼用していた問題を修正する。ready PR [#473](https://github.com/gomyway1216/nextjs-portfolio/pull/473)のimplementation revisionは`2480ff0d4af4324bee3d79ba7dbace54e69ca34a`、prerequisiteはPR #472のregular merge `6e5197fb9a9200cc1b00db1ee34e072b9de84ea2`である。focused 2 files / 127 tests、related 10 files / 252 tests、TypeScript、changed-file ESLint、Prettier、diff checkはPASSし、independent auditのresidual P0 / P1 / P2は0 / 0 / 0である。review comment 2 / 2は修正・reply・resolve済みでunresolved threadは0、PR CI、full suite、production build、mergeは`PENDING`であり、production actionは一つも実行していない。English version: [blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.en.md](./blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.en.md)

## 1. 結果と今回の範囲

JavaScriptでは`throw undefined`と`Promise.reject(undefined)`が有効である。したがってraw payloadそのものをfailureの有無として判定してはいけない。PR #473はproduction checkpoint connectorに明示的なfailure-observed stateを追加し、payloadが`undefined`でも次を保証する。

| invariant                   | 修正後の動作                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------ |
| primary failure presence    | `primaryObserved`で追跡し、payload値と分離する                                       |
| sink failure observation    | Promiseのrejected settlement branch自体で観測し、reason値をpresence sentinelにしない |
| coordinator terminal action | primaryを観測したらpayloadに関係なく`abortAndDrain`を選ぶ                            |
| public result               | failureをsuccess receiptへ変換しない                                                 |
| private evidence            | test seamだけがraw payloadを観測でき、production public errorへは出さない            |
| checkpoint ambiguity        | sink呼出し直前からpersist済みの可能性を保守的にtrueとする                            |

これはmodel、探索、teacher、training、weightを変更するPRではない。実runを安全に一度だけ進める前提を狭く強化する変更である。

## 2. 原因 — 値と状態を一つのsentinelへ重ねていた

旧実装は`let primary: unknown`を宣言し、`primary === undefined`を「primary failureなし」と解釈していた。通常の`Error`では動くが、JavaScriptのthrow / rejection reasonには型制約がない。catchが`undefined`を受け取ると、failureが実際に観測されたにもかかわらず変数の値は初期sentinelと同じになる。

この種の値sentinelは、cleanup branch、observer invocation、public failure生成、retry classificationのようなcontrol decisionに使うべきではない。nested settlementではPromiseのfulfilled / rejected branch自体が観測状態を与える。後から別のrejectionをjoinしたときは、staleなsink cacheではなく現在のprimaryと直接比較し、異なるpayloadをprivate compound failureへ残す。

成功したconsumer callbackがexact `undefined`でfulfillする既存contractは別の話であり、変更していない。重要なのはPromiseのfulfilled / rejected branchと、failure payloadの値を分けることである。

## 3. 明示的なfailure-presence model

修正後はpayloadとpresenceを別々に保持する。

```text
primaryObserved = false
primary = undefined

catch (payload):
  primary = payload
  primaryObserved = true
```

`primaryObserved`はcoordinatorのclose / abort、failure evidenceの生成、public errorのthrowを決める。`primary`はtest-only observerへ渡すraw evidenceであり、値が`undefined`でもfailure stateを取り消さない。production dependency tableではobserver自体が`undefined`に固定され、raw payloadは公開されない。

sink rejectionはPromiseのrejected branchへ入った事実で観測する。最初のrejection時に`primaryObserved`がfalseなら、そのreasonが`undefined`でもprimaryへ保存してbitをtrueにする。既にprimaryがある場合は、後続reasonを現在のprimaryと直接比較する。同じpayloadなら重複compound化せず、異なるpayloadなら既存どおりprivate compound failureへまとめる。別のsink-presence cacheは持たない。

## 4. checkpoint persistence境界を呼出し前に固定する

旧分類は、checkpoint rejection objectがprivate `mayHavePersisted` markerを持つか、Promise shapeがinvalidかなど、callee側のpayload / shapeへ強く依存していた。通常の`Error`や`undefined` rejectionでは、sinkを呼んだ後でも`checkpoint_may_have_persisted = false`になり、fresh retryを示し得た。

修正後の順序は次のとおりである。

```text
capture exact checkpoint options
        |
        v
checkpointMayHavePersisted = true
        |
        v
invoke checkpoint sink exactly once
```

options captureが失敗した段階ではsinkをまだ呼んでいない。そこを通過したら、同期throw、任意の値でのPromise rejection、invalid Promise shape、receipt capture failure、consumer wrapper failure、postflight failureのどれであってもcheckpoint persistenceを否定しない。sinkが内部でwriteしたかをconnectorから安全に証明できないためである。

## 5. lifecycleはpayloadではなく観測状態で決める

coordinatorの正常終了は「payloadが`undefined`か」ではなく、primary failureを一度も観測せずcleanup failureもない場合だけ許される。

| state                                 | coordinator action                  | success receipt         |
| ------------------------------------- | ----------------------------------- | ----------------------- |
| primary未観測、cleanup failure 0      | `close`                             | 全receipt検証後だけ可能 |
| primary観測済み、payloadが`Error`     | `abortAndDrain`                     | 不可                    |
| primary観測済み、payloadが`undefined` | `abortAndDrain`                     | 不可                    |
| primary未観測、cleanup failure 1以上  | terminal cleanupを全て試行しfailure | 不可                    |

lease closeとcoordinator close / abortは既存どおり両方startしてall-settledで回収する。修正はresource ownershipを変えず、failure branchの選択を正しくする。

## 6. callbackとsinkの二重settlementを閉じる

consumer ownerはcallbackを呼んだ後に独自のPromiseをresolve / rejectでき、connectorは外側でcallback Promiseを再joinする。このため同じsink failureがconsumer pathとcallback pathの両方から見えることがある。

PR #473は各Promiseのsettlement branchを観測し、primaryが未観測ならreason値に関係なく`primaryObserved`を立てる。primaryが既にある場合、後続reasonをそのcurrent primaryと直接比較する。同じpayloadを重複してcompound化せず、異なるpayloadは失わない。staleなsink failure cacheによってconsumer primaryと別のsink rejectionを抑制しない。どの場合もprimary failure presenceはcleanup後まで残り、public failureとなる。

## 7. fail-closed state matrix

| failure boundary                               | sink invocation | checkpoint persistence | retry dispositionの原則                     |
| ---------------------------------------------- | --------------: | ---------------------: | ------------------------------------------- |
| capture / enrollment                           |               0 |                  false | fresh invocationまたは固定control-plane対応 |
| readiness                                      |               0 |                  false | provisionまたはoperator reconciliation      |
| coordinator-stage / key prepare / key identity |               0 |                  false | operator reconciliation                     |
| handoff / consumer before sink                 |               0 |                  false | cleanup成功時だけfreshになり得る            |
| checkpoint options capture                     |               0 |                  false | pre-sink failureとして分類                  |
| checkpoint sink invocation以後                 |               1 |                   true | `checkpoint-reconciliation-required`        |
| checkpoint receipt validation                  |               1 |                   true | `checkpoint-reconciliation-required`        |
| postflight claim                               |               1 |                   true | `checkpoint-reconciliation-required`        |

「pre-sinkなら必ずfresh」という意味ではない。unsafe readiness、key mismatch、cleanup failureなどはoperator reconciliationを要求する。逆方向の条件は強い。**sinkを呼んだ後のfailureはすべてcheckpoint reconciliationが必要であり、自動fresh retryしない。**

## 8. adversarial regression coverage

focused regressionsは少なくとも三つの`undefined` failure pointを固定する。

| injected point                                   | expected phase | checkpoint may have persisted | terminal expectation                         |
| ------------------------------------------------ | -------------- | ----------------------------: | -------------------------------------------- |
| synchronous handoff `throw undefined`            | `handoff`      |                         false | coordinator abort、success receipt 0         |
| checkpoint `Promise.reject(undefined)`           | `checkpoint`   |                          true | checkpoint reconciliation、success receipt 0 |
| valid checkpoint後のpostflight `throw undefined` | `postflight`   |                          true | checkpoint reconciliation、success receipt 0 |

各caseはtyped public error、cleanup count、key discard、lease close、coordinator abort、test observer exact onceを確認する。observer内ではraw primaryが実際に`undefined`であることも確認するが、それはtest-only evidenceでありpublic surfaceへ出さない。

supplementary regressionsは、checkpoint sinkが同期的に`throw undefined`するcaseでも呼出し直前のpersistence boundaryが効くことと、lease-close Promiseが`undefined`でrejectしてもcleanup failure countが1になりpublic successへ落ちないことを確認する。後者はsuccessful checkpoint後の`cleanup` phase、`checkpoint-reconciliation-required`である。

既存のordinary Error、compound cleanup failure、consumer wrap / ignore、invalid Promise shape、post-claim lease close joinも関連10-file regressionへ含まれ、今回のpresence-state変更が既存ownershipを壊さないことを検査した。

## 9. revision-bound validationとpending項目

implementation revision `2480ff0d4af4324bee3d79ba7dbace54e69ca34a`に対する記録は次のとおりである。

| validation           | status    | measured evidence                                    |
| -------------------- | --------- | ---------------------------------------------------- |
| focused Vitest       | PASS      | 2 files、127 / 127、duration 1.63秒                  |
| related Vitest       | PASS      | 10 files、252 / 252、duration 68.88秒                |
| TypeScript           | PASS      | diagnostics 0                                        |
| changed-file ESLint  | PASS      | error 0                                              |
| Prettier             | PASS      | targeted files                                       |
| diff check           | PASS      | whitespace errors 0                                  |
| independent audit    | PASS      | residual P0 / P1 / P2 = 0 / 0 / 0                    |
| ready PR #473 review | PASS      | actionable 2 / 2を修正・reply・resolve、unresolved 0 |
| PR #473 CI           | `PENDING` | ready PR headの全check完了前                         |
| full Vitest          | `PENDING` | focused / relatedから推定しない                      |
| production build     | `PENDING` | static page数や時間を推定しない                      |
| regular merge        | `PENDING` | prerequisite mergeと混同しない                       |

[machine-readable evidence](./data/floodgate-v7-checkpoint-failure-state-hardening-2026-07-16.json)も同じrevisionとstatus boundaryを使う。pending項目にnull、仮count、過去PRの値を埋めない。

## 10. production countersとnonclaims

このchangeのproduction / live actionは全て0である。

| action                                  |     count |
| --------------------------------------- | --------: |
| registry provisioning                   |         0 |
| production gate（100 / 500 / 24,000）   | 0 / 0 / 0 |
| teacher generation / teacher label      |     0 / 0 |
| training / optimizer step               |     0 / 0 |
| candidate selection / promotion         |     0 / 0 |
| candidate weight / production overwrite |     0 / 0 |
| formal A/B games                        |         0 |
| external calibration games              |         0 |
| live weight write / activation          |     0 / 0 |

current production evaluatorとrollback evaluatorはともに`runOp1`で、live weightも変更していない。本変更は棋力向上、rating、高段、安定性を証明しない。

## 11. 高段目標との関係

failure-state hardeningは直接Eloを上げない。しかし、prefix-100を失敗後に誤ってfresh rerunすると、同じcheckpoint streamへ重複writeしたり、provenanceを曖昧にしたりできる。壊れたteacher datasetや不明なresume状態は、その後の学習比較を無効にするため、強さのpipelineにも必要な安全条件である。

棋力の正式判定は別工程で、candidateと`runOp1`を192 color-swapped pairs / 384 gamesで比較し、その後に外部校正200 gamesを行う。selection、known regression、production parityも別gateである。このPRのtest passを対局結果へ換算しない。

## 12. 次に進む順序

1. ready PR #473のreviewとCIを完了し、actionable commentを解決する。
2. full suiteとproduction buildをactual ready headで完了し、数値を実測値だけで更新する。
3. regular merge commitでPR #473を統合する。
4. registry verifier closure、training-label finalizer、create-only provisioningなど未完の安全gateを既定順序で閉じる。
5. reviewed same-lock ownerでprefix-100をexactly once実行し、failureならcheckpoint reconciliationまでSTOPする。
6. teacher generation、retraining、candidate selection、formal A/B、external calibrationを別々のevidence boundaryとして進める。
7. すべての証拠が揃うまで`runOp1`とlive weightを変更しない。

今回の到達点は狭いが明確である。**failure payloadが`undefined`でもfailureは消えず、sink invocation後の不明状態は必ずcheckpoint reconciliationへ送られる。**
