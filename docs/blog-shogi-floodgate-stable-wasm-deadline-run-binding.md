# stable-WASM 長尾診断を、書込み権限なしで実データへ結ぶ

> 既存の診断coreは「1 request = 1 child」でpool-wide poisonを除きましたが、private入力へ安全に接続する実行経路はありませんでした。今回、固定launcher、公開校正、read-only入力認証、固定13ファイルの前後比較、aggregate-only出力を一つのfail-closed bindingにしました。公開repository assetだけを使う校正では5 / 5項目の完全一致と `1,002,562 ppm` のcallback/reference比を確認しました。private診断は **0回**、teacher生成・再学習・本番重み変更も **0** です。English version: [blog-shogi-floodgate-stable-wasm-deadline-run-binding.en.md](./blog-shogi-floodgate-stable-wasm-deadline-run-binding.en.md)

## 1. なぜrun bindingが必要だったか

前段の診断contractは、固定12候補を最大6 childで分離し、600,000 msの協調期限と615,000 msの外側watchdogを与えます。しかしcore関数だけでは、次のことを保証できません。

- 誰が、どのcheckoutから、どのNodeで起動したか。
- 校正より先にprivate training rowを開いていないか。
- registry、WASM、weights、role入力が実行中に変わっていないか。
- aggregateへprivate識別子や個別lane値が混ざっていないか。
- failure後にretry、resume、checkpoint、live更新へ進んでいないか。

今回のbindingは、この実行境界を固定するものです。長尾原因を直す変更でも、棋力向上を示す結果でもありません。

## 2. 固定された実行順

実行順は次の一方向だけです。

```text
argumentless native launcher
  -> launcher attestation
  -> dedicated diagnostic checkout exact-clean capture
  -> control 2 files before fingerprint
  -> registry locator load as an unclaimed opaque capability
  -> tracked calibration/diagnostic worker identity check
  -> pinned WASM/weights before fingerprint and read-only authority
  -> PUBLIC calibration child closes successfully
  -> registry capability claim
  -> existing production application checkout binding comparison
  -> fixed 9 role paths before fingerprint
  -> manifest/receipt/revision-bound training-row authentication
  -> logical training rows 3..14 become exactly 12 diagnostic inputs
  -> isolated aggregate-only diagnostic
  -> consumer postflight and one-shot claim
  -> asset cleanup
  -> all fixed 13 files after fingerprint
  -> application and diagnostic source after checks
  -> one canonical sanitized stdout line
```

PUBLIC校正が失敗すれば、registry capabilityをclaimせず、role pathを受け取らず、training rowを開きません。registry locator record自体は校正前に構造・owner・mode・single-linkを検査してopaque capabilityへ閉じ込めます。したがって「校正前にprivate control fileを一切読まない」というclaimはしません。

## 3. launcherとsource closure

package commandは引数を受け取らない専用JXA helperだけを呼びます。helperはcurrent-EUIDのhomeから固定diagnostic checkout、固定Node `v22.13.0`、固定CommonJS bundleを導出し、`/usr/bin/caffeinate -dimsu`で起動します。`tsx/cjs`、`NODE_OPTIONS`、caller-supplied path、caller-supplied revisionは使いません。

child側のlauncher attestationが最初に成功するまでrun-binding graphを初期化しません。実行前後には専用diagnostic checkoutがexact-cleanで同じrevisionかを確認します。既存production application checkoutはregistryに記録されたrevisionとの比較対象として別に読みますが、diagnostic codeの実行権限にはしません。

tracked bundleは18個のsource inputを明示allowlistし、runtime external dependencyをNode builtinだけに限定します。同じtreeからの再buildがbyte-identicalでなければ失敗します。bundle内のlocal user path、`node_modules`、preload文字列、private canaryもhard gateで拒否します。

## 4. PUBLIC校正をprivate claimより先に置く

校正childは固定公開局面を使い、同じpinned WASMとweightsについて次を5組実行します。

```text
reference: searchBestMove(0, 11, 10)
callback : searchBestMove(1, 11, 10), hostNow = 0
```

move、score、depth、nodes、leavesの5項目は各組で完全一致しなければ失敗します。親へ返す時間値は次の一つだけです。

```text
callback_overhead_ratio_ppm
  = round(sum(callback duration) / sum(reference duration) * 1,000,000)
```

したがって `1,002,562 ppm` はcallback側の時間合計がreferenceの約1.002562倍だったという意味です。「1,002,562 ppm遅くなった」「差が100.2562%」という意味ではありません。raw durationはchildから出しません。また、この短い固定局面の比率は600秒長尾のwall-time同等性を証明しません。

今回の専用実測はrepositoryの公開WASM、公開weights、tracked calibration workerだけで実施し、`exact_parity_count = 5`、`callback_overhead_ratio_ppm = 1,002,562` でした。production binding内の校正は、同じidentityへ固定されたread-only deployment assetを使います。校正Promiseはstdout受信時ではなくchildの`close`後だけ成功します。

## 5. registryはlocatorであり、approved-key再認証ではない

専用registry loaderが検証するのは、固定record pathまでのheld directory/file、current-EUID ownership、mode、single-link、canonical JSON v2の構造です。そのopaque capabilityを校正後に一度だけclaimすると、consumer pathとapplication-source bindingだけが出ます。

このloaderはapproved-key recordを再読込み・再認証しません。record内のapproved-key binding fieldを構造検証しても、「この診断がapproved production keyを認証した」とはclaimしません。role入力のintegrityは別の境界で、固定verifier revision、pinned result receipt、pinned manifest、各固定pathのbytes/SHA-256を照合します。

## 6. manifest-authenticated fixed 9 paths

consumerはrole rootと次の固定9 pathをread-only handleでcallback終了まで保持します。

1. `fresh-final-holdout.protected-position-ids.txt`
2. `fresh-final-holdout.raw.jsonl`
3. `fresh-selection.protected-position-ids.txt`
4. `fresh-selection.raw.jsonl`
5. `manifest.json`
6. `replay-excluded-position-ids.txt`
7. `replay-exclusion-receipt.json`
8. `training.protected-position-ids.txt`
9. `training.raw.jsonl`

manifestは7,202 bytes、SHA-256 `2bafc01f602c98ea63069e04b8d39c36470bcc6d31e1861fdaa83c6fc50e3cf9`へ固定し、tracked result receiptは14,735 bytes、SHA-256 `56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf`へ固定します。manifestから得た9個のpath/bytes/SHA-256 identityと、実際に保持した9ファイルを一対一で照合します。8個の非manifest pathは、それぞれ1 byteだけ事前改ざんするtable testですべてcallback前に拒否しました。

ここでのclaimは **manifest-authenticated fixed 9 pathsだけ** です。directory entryは列挙しません。無関係なentryはclaimとscopeの外であり、「directoryに余分なpathnameがない」「exact directory treeである」とはclaimしません。

training rawはbyte identityだけでなく、canonical JSONL、2026-Q1 Floodgate URL、game/parent/position ID、strict parent order、canonical SFEN、合法手、集合digestを共有pure parserで再検証します。production consumerと診断consumerは同じparserを使います。認証済み配列の論理3行目から14行目だけを選び、ちょうど12入力に変換します。

## 7. 固定13ファイルの不変条件

永続状態の前後比較scopeは、directory treeではなく次の固定13ファイルです。

| 分類    |  数 | 内容                                               |
| ------- | --: | -------------------------------------------------- |
| control |   2 | connector registry record、approved-key enrollment |
| runtime |   2 | stable WASM、stable weights                        |
| role    |   9 | 上記manifest-authenticated fixed paths             |

各fileについてcanonical path、regular-file、single-link、current-EUID owner、byte count、SHA-256、device/inode/mode/link/owner/size/mtime/ctimeを比較します。13 / 13が同一でなければ成功を出しません。approved-key enrollmentはここでも不変性fingerprintの対象であり、key認証の対象ではありません。root keyは読みません。

WASMとweightsはheld read-only handleから一時copyだけをcallbackへ渡し、settlement後にzero-fillします。role側も9ファイルとreceiptをheld handleで再検査し、callback内の同期one-shot input claimと、callback後のone-shot postflight claimを要求します。

## 8. aggregate-only出力とfailure

成功時もstdoutはcanonical ASCII JSON 1行だけです。含むのは公開校正比、outcome count、固定順phase/depth/nodes/leaves histogram、configured/observed parallelism、12 lane settled、全child reap、13 / 13不変、source closure、nonclaimだけです。

次は出しません。

- SFEN、board、game/parent/position ID、入力index
- path、SHA-256、PID、stderr、error message、stack
- move、score、個別laneの正確なnodes/leaves/elapsed time
- 個別lane record

入れ子のextra key、accessor、Proxy、histogram total不整合、`all_children_reaped = false`は出力前に拒否します。failureもprivate detailを捨て、固定phase、固定schema、`STOP` statusの1行だけです。stderrは出しません。

## 9. 意図的に存在しない経路

runtime closureにはfile writer、directory enumeration、deployment root-key read、checkpoint、quarantine、lease、retry、resume、teacher生成、training、live mutationを含めません。shared TTも常にoffです。

診断結果を見てTT retry/resumeを自動的に始めることもありません。必要なら、まず今回の12 lane histogramをreviewし、別PR・別contractとして設計します。

## 10. 現在の実測と検証

| 対象                                               | 結果                               |
| -------------------------------------------------- | ---------------------------------- |
| 公開asset専用calibration                           | 1回、`1,002,562 ppm`、parity 5 / 5 |
| launcher / boundary / run-binding focused suite    | 3 files、53 / 53 PASS              |
| 共有parser / production consumer / SFEN回帰        | 3 files、68 / 68 PASS              |
| 非manifest固定pathの1-byte初期tamper               | 8 / 8 callback前拒否               |
| deterministic 18-source bundle / privacy hard gate | PASS                               |
| TypeScript / targeted lint                         | PASS                               |
| private training rowを開いた正式run                | **0**                              |
| private 12-lane diagnostic                         | **0**                              |
| teacher生成 / training / formal A/B / 外部校正     | **0 / 0 / 0 / 0**                  |
| live weights変更 / production activation           | **false / 0**                      |

machine-readable evidenceは[こちら](./data/floodgate-stable-wasm-deadline-run-binding-2026-07-17.json)です。公開校正aggregateだけを記録し、raw timingやprivate識別子は保存していません。

## 11. 次の安全なgate

このPRをfinal-head CI、独立review、通常のmerge commitで確定した後、operatorは専用diagnostic checkoutをそのmerge commitへ揃え、exact-cleanとbundle byte identityを再確認します。既存production application checkoutをdiagnostic code実行用に切り替えません。

その後に初めて、固定package commandからaggregate-only正式runを1回実施します。成功条件は公開校正5 / 5、固定12 lane、最大6 child、全child reap、one-shot claims、13 / 13不変、両source closure一致です。どれかが失敗したら`STOP`のまま終了し、retry/resumeしません。

そのrunが答えるのは長尾laneのphase分布だけです。teacher生成、再学習、候補選抜、formal A/B、外部棋力校正、live activationを許可しません。長尾の観測結果をreviewしてから、次の変更を別の証拠付きgateとして決めます。

## 12. 現在の判断

run bindingの実装と公開校正は通りました。しかしprivate診断はまだ走らせていません。したがって長尾原因、速度改善、評価関数の改善、棋力向上、安定した高段はすべて未確立です。

現在の本番判断は **STOP**、live weightsは **unchanged** です。
