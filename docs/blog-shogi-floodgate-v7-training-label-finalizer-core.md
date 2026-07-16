# test-only opaque planを壊さず永続化する — Floodgate v7 training-label finalizer core

> 前段のpure projectionとsealed-work visitorだけでは、学習rowを再開可能なprivate datasetとして確定できない。今回追加するのは、test-only opaque planを`train.jsonl`、`result.json`、`manifest.json`へexact-prefixで永続化し、private directoryとして排他的にpublicationした後で再監査する内側のcoreである。V3 workのorigin認証、production two-pass plan mint、common outer lock、実24,000親、学習、weight、対局、棋力はまだ証明しない。English version: [blog-shogi-floodgate-v7-training-label-finalizer-core.en.md](./blog-shogi-floodgate-v7-training-label-finalizer-core.en.md)

---

## 1. projectionとvisitorの後にもdurable-output gapが残る

#475のprojectionはcompleted-parent valueを決定論的なtraining rowへ変換するが、入力originを認証しない。#476のvisitorはheld-FD scanner内で検証済みentryを観測できるが、sealや最終snapshotより前に呼ばれ得るためprovisionalであり、output authorityではない。

今回閉じるのは、その次にある内側の永続化lifecycleだけである。test factoryは小さいsynthetic projectionをdeep-captureしてtest-only planをmintするが、finalizerはcaller-supplied row、serialized output bytes、pathname、replay callbackをplan/payload authorityとして受け取らない。trusted test-only write seamはmodule-owned positional writeの上限指定と失敗注入だけに使い、output bytesやauthorityを供給できない。このfactory入力をproduction authorityには数えない。

## 2. opaque planはtest-only authorityである

plan capabilityはmodule-privateな`WeakMap`へexact object identityで登録する。公開facadeは固定contract、status、claim boundary、test execution boundaryだけを持ち、row、bytes、path、file handle、key、replay callbackを持たない。private planだけが再開可能なasync replay driverとexpected summaryを持つ。spread clone、Proxy、別object、二重claimは拒否する。

ただしこれは同じprocessと現在のJavaScript realmをtrustedとするtest-only capabilityである。V3 HMAC origin、production authority、processを越えた復元、hostile same-process mutation resistanceを意味しない。

## 3. deterministicな4-file lifecycleを固定する

authorized stageで扱うentryは次の4つだけである。

| 順序 | file            | 役割                                                                         |
| ---: | --------------- | ---------------------------------------------------------------------------- |
|    1 | `work.jsonl`    | synthetic planがpinしたsource byte snapshot                                  |
|    2 | `train.jsonl`   | canonical sibling training rows                                              |
|    3 | `result.json`   | plan、work、train、teacher run binding、consumer postflightの認証済みsummary |
|    4 | `manifest.json` | complete content setの最後のcommit marker                                    |

training bindingのparent-ID集合commitment、teacher run-binding digest、stageのparent/stage dev+inodeとstage/destination basenameをresult/manifestへbindする。retryごとに変わるlease identity、absolute path、mtime、callbackはdeterministic payloadへ入れない。fresh leaseで再開しても同じ入力は同じbytesになる。ただし#477のteacher run-binding値はsynthetic plan入力であり、V3 origin認証済みという意味ではない。

## 4. 受理する開始stateは4通りだけである

`W=work`、`T=train`、`R=result`、`M=manifest`とすると、自動処理できるentry setは`{W}`、`{W,T}`、`{W,T,R}`、`{W,T,R,M}`だけである。

successorが存在する場合、predecessorは完全なexpected bytesでなければならない。たとえばpartial `train.jsonl`と`result.json`が同時にある状態を、trainへ追記して自動修復しない。欠落、飛び越し、`val.jsonl`、unknown/temp entry、余分なfileは既存bytesを保持してmanual reconciliationにする。

## 5. resumeはexact prefixの続きをposition指定で書く

既存fileはowner-only regular single-link fileで、期待payload以下の長さかつbyte-for-byte exact prefixの場合だけ再開できる。writeは現在offsetからのbounded positional writeで、short writeなら残りを続ける。zero progress、native write未実行、二重実行、負数、NaN、remaining超過のreportはfail closedになる。

finalizerは既存fileをtruncate、unlink、rename-overwriteしない。1 byte mismatch、長すぎるfile、symlink、hardlink、wrong mode、wrong owner、directoryなどはそのまま残す。

## 6. result keyとmanifest keyを分離する

32-byte caller root keyは内部owned copyへ取り込み、run IDをsaltにして別々のHKDF infoからresult keyとmanifest keyを導出する。resultとmanifestはさらに別のHMAC domainを使う。

```text
result key info:   shogi-floodgate-v7-training-label-result-key-v1\0
manifest key info: shogi-floodgate-v7-training-label-manifest-key-v1\0
result MAC domain: shogi-floodgate-v7-training-label-result-mac-v1\0
manifest domain:   shogi-floodgate-v7-training-label-manifest-mac-v1\0
```

success、publication前failure、publication後failure、test observer failureの全経路でowned root/result/manifest keyをzeroizeし、caller keyは変更しない。同じroot key compromiseへの耐性やanti-rollbackは主張しない。

## 7. manifestは最後のcontent commit markerである

順序はtrainのwrite、file data sync、reread/hash、stage directory sync、次にresult、最後にmanifestである。`train.jsonl`自体へMACは付けず、そのexact byte count、SHA-256、row count、parent summaryをresultとmanifestの両方へbindする。

manifestを作る時点でtrainとresultはexact completeかつdirectory sync済みでなければならない。manifestが存在しても、そのbytesがpartialならmanifestだけをexact-prefix resumeできる。これはcontent completeness markerであり、engineのteacher truthや将来のimmutabilityを証明しない。

## 8. source auditとdestination auditでpublicationを閉じる

artifact作成前とpublication直前に、planへ固定したparent/stage identityとbasename、held stageとpathname、held workとpathname、dev/inode、owner、mode、link count、size、snapshot、SHA-256を再確認する。stage lease identity自体はdeterministic planへ入れない。4 filesがexact setで、各held fileがexpected bytesのままの場合だけ既存のexclusive private-directory publication transactionをcommitする。

publication後はdestination directoryを再openし、published identityとexact 4 entriesを確認し、全fileを再openしてidentity、size、hash、bytesを再検証する。successはこのpoint-in-time auditまでであり、その後のsame-EUID/root mutation、internet公開、anti-rollback、exactly-onceを意味しない。

## 9. failure phaseとretry dispositionを固定する

failureはauthority transfer、plan claim、postflight claim、cross-binding、source preflight、train/result/manifest persistence、source reverify、publication、destination reverify、cleanupに分類する。created、written、file data synced、directory synced、source reopened/reverified、publication直前、destination reopen/reverify直前にtest failpointを持つ。

`throw undefined`を成功sentinelと混同しないよう、failure発生は独立したbooleanで記録する。publication前でcontentがexact prefixならfresh authorityで再開できる。unsafe contentはmanual content reconciliationにする。unsafe mode/linkなどのためtransaction abort自身もstage inspectionを拒否してleaseを安全に削除できない場合は、contentとleaseの両方をmanual reconciliationとして返す。rename開始後の曖昧さはmanual publication/lease reconciliationになる。

## 10. threat matrixとtrust assumption

| condition                          | このcoreの扱い                           | 残る境界                             |
| ---------------------------------- | ---------------------------------------- | ------------------------------------ |
| exact prefix後の中断               | 同じinodeへposition指定で続ける          | actual process kill / power loss実証 |
| mismatch / oversize / unsafe inode | mutationせずmanual                       | operator reconciliation              |
| clone / Proxy / reused plan        | exact WeakMap authorityで拒否            | production plan registry             |
| source/destination交換             | pathnameとheld identity/hash再監査で拒否 | 将来mutation、same-EUID/root         |
| result/manifest key混同            | separate HKDF infoとMAC domain           | root key compromise                  |
| hostile test hook / realm          | current test realmをtrustedとする        | hostile same-process耐性             |

## 11. synthetic validationとproduction zeroを分けて記録する

focused testは通常parent 1件とforced parent 1件からなる小さいsynthetic planを使い、24,000件scanを繰り返さない。temporary stageでtrain/result/manifestとprivate publicationを実際に作るため、synthetic outputはnonzeroである。一方、このchangeによるproduction finalizer invocation、production output、実Floodgate棋譜read、teacher生成、training、optimizer step、candidate weight、live activation、正式A/B、外部校正はすべて0である。検証candidateは`311c0a8a79b413336a0d46f2179257a968a639bb`である。

| validation         | result                  | wall秒 | maximum RSS bytes | swaps |
| ------------------ | ----------------------- | -----: | ----------------: | ----: |
| focused finalizer  | 1 file / 22 tests pass  |  12.85 |         302776320 |     0 |
| related contracts  | 3 files / 20 tests pass |   0.95 |         270450688 |     0 |
| TypeScript         | exit 0                  |   2.40 |        1127546880 |     0 |
| Prettier           | 7 files all matched     |   0.89 |         225853440 |     0 |
| full ESLint        | 0 errors / 157 warnings |  26.72 |        2268020736 |     0 |
| full Vitest        | 155 files / 2,852 tests |  98.48 |        2433712128 |     0 |
| production build   | 193 / 193 static pages  |  26.83 |        2620227584 |     0 |
| ML stdlib          | 58 / 58 tests           |   0.52 |          63979520 |     0 |
| npm audit high以上 | 0 vulnerabilities       |   0.96 |         132186112 |     0 |

最初のfull Vitestは2,852件中2,850件passだった。今回追加した18 failpoint総当たりtestがfull-suite負荷下で既定5秒を超えたため、test内容を緩めず30秒の明示budgetを追加した。もう1件は今回と無関係な既存stable-resume testの一時的retry-disposition不一致で、対象testだけの隔離再実行は1/1 passだった。その後、最終candidateでfull suiteを再実行して2,852/2,852 passを確認した。この初回失敗と隔離再実行もmachine evidenceに残す。

実測値はmachine evidenceへcommand、pass/fail、wall、maximum RSS、swapとともに記録する。GitHub CI、PR、reviewは実際に観測するまで`PENDING` / `null`とし、failpointはinterruption simulationであってactual killや停電試験には数えない。

## 12. 次はproduction two-pass compositionである

#478ではcommon outer lockを保持し、pass 1前にfresh active stage leaseとopaque V3 scan-key authorityを取得する。pass 1はvisitorなし、pass 2は同じheld identity/snapshotをvisitor付きで走査し、2回目のenclosing scan、seal、tail、snapshot、path confirmationまで成功した後だけproduction opaque planをmintする。

#478では同じmodule内にmodule-private persistence runnerを抽出し、test adapterとproduction adapterを別々のWeakMap、claim、postflight、publication、key authorityから呼ぶ。production adapterはexport済みの`...CoreForTests`やtest registryを通さない。production adapterがmintしたplanは、current production consumer postflight、separate result/manifest key authority、保持中のstage publication transactionとだけ組み合わせる。

publication transaction自身のdestination reconciliationが終わるまではそのtransactionのleaseを保持し、lease removalとparent syncをdurableにしてからcommitが返る。後段のfinalizer content auditのauthorityは、引き続き保持しているcommon outer lockだけである。最後のwork再検証とcontent audit後に全keyをzeroizeし、そのouter lockを最後に解放する。owner/CLIと実final-24000成功経路はさらに次段である。その後も正式判定には192 color-swapped pairs / 384 gamesと外部校正200局が必要である。それまでは、このcoreはreal dataset、training、weight、棋力、Elo、段位、stable high-danの証拠ではない。
