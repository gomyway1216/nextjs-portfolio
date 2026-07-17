# stable-WASMのpool poisonで失われた原因を安全に保持する

> 最初のdurable prefix-100は1,597秒で停止し、同一構成read-only再現では候補12件中7件が0.8〜244.9秒で成功、5件が約600.0秒で同じgeneric pool-poison errorへ落ちた。時間境界は固定10分timeoutと一致したが、従来のpoolは最初のworker errorを捨てていたため、typed原因とtrigger parentを確定できなかった。今回の候補はraw stderr、PID、index、局面、IDを公開せず、7種類のsafe failure kindとtimeout値だけを最初のworker境界からpool-wide poisonへ保持する。focused 110 / 110、TypeScript、changed-file ESLint、独立review P0 / P1 / P2 = 0 / 0 / 0はPASSしたが、PR、final-head CI、通常merge、12候補の再実行はまだPENDINGである。English version: [blog-shogi-floodgate-stable-wasm-failure-kind.en.md](./blog-shogi-floodgate-stable-wasm-failure-kind.en.md)

## 1. 結論

この変更はtimeoutを延長せず、worker数、探索depth、proposal row、runtime receipt、production bindingを変えない。変更するのは失敗時の情報境界だけである。

| 項目                        | 候補の結果                                    |
| --------------------------- | --------------------------------------------- |
| safe failure kinds          | 7種類                                         |
| timeout value               | `number`または`null`                          |
| raw stderr / message        | 保存・公開しない                              |
| PID / index / SFEN / ID     | 保存・公開しない                              |
| active / queued rejection   | 最初の同一safe error object                   |
| poison後の新規proposal      | 同じsafe error object                         |
| worker cleanup              | 全workerをforce-stopしてreap                  |
| normal receipt / binding    | 変更なし                                      |
| production state / weights  | 変更なし                                      |

## 2. 従来なぜ原因が消えたのか

workerのsearch promiseがrejectすると、従来のreusable poolは`poison(_error)`を呼んだ。引数名どおり最初のerrorは使われず、active job、queued job、後続proposalの全てへ新しいgeneric errorを配った。

```text
worker timeout / exit / protocol failure
  -> raw worker error
  -> pool poison discards the argument
  -> all jobs receive one generic poisoned-pool error
  -> outer failure remains conservative, but cause classification is lost
```

この挙動はprivate stderrを漏らさない点では安全だった。しかし、600秒timeout、worker exit、transport、protocol、result validationを区別できず、今回の5件のgeneric rejectからtriggerを特定できなかった。

## 3. 新しいsafe failure contract

候補が許可する分類は次のexact 7種類だけである。

| failure kind       | 意味                                             | `timeout_ms` |
| ------------------ | ------------------------------------------------ | ------------ |
| `search-timeout`   | search requestの固定timeout                      | exact number |
| `startup-timeout`  | worker初期化の固定timeout                        | exact number |
| `worker-exit`      | unexpected process close / child error           | `null`       |
| `transport`        | stdin、source pipe、stderr、write、close transport | `null`       |
| `protocol`         | stdout frame、schema、digest、ready / bye mismatch | `null`       |
| `validation`       | typed search resultまたはproposal rowの拒否      | `null`       |
| `unknown`          | genuine safe errorへ分類できないfail-closed fallback | `null`    |

errorはmodule-private `WeakMap`へ登録したexact objectだけをgenuineとして扱う。公開inspectorはProxyを先に拒否し、structural forgeryやaccessor-bearing lookalikeのfieldを読まない。error object、safe metadata record、stack、fieldはfreezeされる。

## 4. pool-wide poisonの一貫性

最初のgenuine safe errorを`terminalWorkerFailure`へ一度だけ保存する。その後は次を同じobject identityでrejectする。

1. 実行中のactive proposal
2. FIFO queue内のproposal
3. poison完了後に呼ばれた新規proposal

後から別workerがfailしても最初のcauseを置き換えない。全workerへforce-stopを開始し、`close()`はbounded cleanupを待ってから完了する。これにより「どのfailure kindがpoolを止めたか」をprivate raw causeなしで再現できる。

## 5. raw情報を残さない境界

従来のworker diagnosticはstderr textをerror messageへ連結できた。候補はstderr bytesをcontentとして保持せず、受信した時点で`transport`へ分類する。次の値はsafe errorにもmetadataにも入らない。

- raw stderrまたは元error message
- process ID、worker index、input index
- parent SFEN、move、position ID、game ID、parent ID
- request / result payload、asset path、private filesystem identity

runtime wrapperとparent coordinatorは、nested `primary`がgenuine safe errorであることだけをtestし、private canaryがJSON、message、stackへ現れないことを固定した。

## 6. 検証

| 検査                              | 結果                         |
| --------------------------------- | ---------------------------- |
| stable proposer focused tests     | PASS                         |
| production stable runtime tests   | PASS                         |
| production parent coordinator     | PASS                         |
| focused合計                       | 3 files / 110 tests          |
| TypeScript                        | PASS                         |
| changed-file ESLint               | PASS                         |
| `git diff --check`                | PASS                         |
| independent review                | P0 / P1 / P2 = 0 / 0 / 0    |

テストはsearch / startup timeout、worker exit、transport、protocol、validation、unknown、Proxy、forgery、accessor、active / queued / future identity、全child reap、runtime / coordinatorのraw-canary非公開を含む。

## 7. nonclaims

この候補は次を証明しない。

- 5件のgeneric rejectが全て個別にtimeoutしたこと
- index 3 / 6 / 7 / 9 / 14のどれが最初のtriggerだったか
- 12 workersが最適であること
- timeout延長、worker削減、depth変更のどれが品質とthroughputを両立するか
- partial checkpointのresume authority
- teacher data、再学習、棋力向上、高段到達

また、このsource変更は既存V3 run bindingとapplication source bindingを変える。従って現在の3-parent partialをこの変更後コードでそのままresumeすることはできない。review済みquarantineと別承認のfresh runが必要になる。

## 8. 安全な次の順序

1. この候補をready-for-review PRとして公開する
2. final-head CI、独立review、通常mergeを通す
3. merge済みcodeで同じ12候補をread-only再実行し、最初のsafe failure kindとtimeout値を取得する
4. 4 / 6 / 8 / 12 workersでtail latency、timeout、throughputを比較する
5. playing-quality contractを保った修正を選び、変更後run bindingを新runとして扱う
6. recovery inspectorとhuman-confirmed quarantineを完成し、現在のstale lease / partial checkpointを別authorityで解決する
7. fresh prefix-100を成功させても一度STOPし、独立review後だけ500、final-24,000へ進む
8. 完全な教師data後にのみ再学習、候補選抜、正式A/B、外部校正を実行する

## 9. 現時点の判断

pool poisonが捨てていたtrigger原因を、private情報を増やさず保持する候補は実装・検証・独立reviewまで完了した。まだPR、GitHub CI、通常merge、実12候補再実行は完了していないため、productionは**STOP**である。[機械可読証拠](./data/floodgate-stable-wasm-failure-kind-2026-07-16.json)も、実装済みの安全境界と未実行のproduction / strength工程を分けて記録する。
