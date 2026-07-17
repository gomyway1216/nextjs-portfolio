# stable-WASM の長尾を、全体poisonなしで切り分ける設計

> 12 worker と6 workerの比較はいずれも12候補中7件完了・5件が約600秒で停止し、6 worker化は中央値・平均・RSSを改善しませんでした。ただし既存poolは最初の失敗を残りのlaneへ配るため、5件を5個の独立timeoutとは判定できません。このPRは同じpinned WASMを変更せず、1 request = 1 child、最大6 child並列、600,000 msの協調期限、615,000 msの外側watchdogという非運用の診断contractだけを追加します。実データ診断は0回で、本番とlive weightsは変更していません。English version: [blog-shogi-floodgate-stable-wasm-deadline-diagnostic.en.md](./blog-shogi-floodgate-stable-wasm-deadline-diagnostic.en.md)

> 追記: 後続の[read-only run-binding](./blog-shogi-floodgate-stable-wasm-deadline-run-binding.md)が、固定launcherと独立real public-calibration commandを追加しました。以下のscope表は、この元のdesign PR単体についての記録です。後続PRでもprivate診断とlive変更は0のままです。

## 1. まだ分からないこと

既存の再実行で分かったのは、最初の安全な失敗種別が `search-timeout`、timeout値が600,000 msだったことです。一方、pool-wide poisonにより、残りの未完了laneも同じ失敗を受け取りました。そのため次の問いは未解決です。

- 長尾laneはそれぞれ独立に時間切れになるのか。
- 深さ11のどこまで進んでいるのか。
- 1件の停止が別のlaneを巻き込んでいるだけなのか。
- 外側から強制終了しないと戻らない真のhangがあるのか。

このPRはその切り分け方法を固定しますが、実データには接続しません。

## 2. 時間依存search knobを同じに保つ期限

既存の固定探索は `searchBestMove(0, 11, 10)` です。しかし単純に600,000を渡すと、WASM内部の時間依存ノブが変わります。そこで診断childは次を使います。

```text
host now = (performance.now() - epoch) / deadlineMs
searchBestMove(1, 11, 10)
```

実時間600,000 msがWASM内の1に対応します。`maxTimeMs = 1` は既存の `maxTimeMs = 0` と同じく、null-move reduction 2、quiescence check move limit 1、try limit 2を選びます。shared TTは常にoffです。実pinned WASMと実pinned weightsを使ったconstant-clock sentinel unit testで、期限をcrossしない条件の0と1について move・score・depth・nodes・leavesの5項目が内部で完全一致することを確認しました。値そのものは公開しません。

これはwall性能の同等性ではありません。`maxTimeMs = 1` は約2,048 nodes+leavesごとにJSの `hostNow` callbackを呼び、`maxTimeMs = 0` にはないcrossing overheadを持ちます。callback overheadが0、600秒wall timeが同じ、本番timingと同等、のいずれもclaimしません。

## 3. 1 request = 1 child と最大6並列

各requestは新しいchildを1個だけ持ち、childを再利用しません。最大同時実行数は6で、12件は固定6-slot schedulerから供給します。schedule前に親が全assetをsnapshotし、盤上駒code、両側ちょうど1枚ずつの玉、drop可能な持駒slot、物理的な駒数上限を検証します。不正なcaller inputは一般的なchild failureへ数えず、child起動前に拒否します。

```text
lane request
  -> fresh child
  -> pinned WASM + pinned weights
  -> cooperative result / outer watchdog / fixed failure
  -> child reap
  -> aggregate histogram only
```

1 laneのdeadline・failure・hangは他laneをpoisonしません。外側watchdogは対象childだけをkillし、すべてのchildがcloseしてから集約します。観測peak child数はNodeの成功 `spawn` eventでだけ増やし、そのchildの `close` でだけ減らすため、論理slot数でも順序不変値でもなく、実行ごとのtiming-sensitiveな実測値です。synthetic testではcomplete、deadline、hang、stderr canaryを同じbatchに置き、実測peak 6、他lane継続、全child reapを確認しました。テストした2通りのsynthetic入力・完了順ではhistogram/count集約が一致しましたが、あらゆる順序で同じだとはclaimしません。非同期spawn failureのnegative testでは観測peakが0です。

## 4. phaseは断定しすぎない

公開するphaseは固定順のhistogramだけです。

- `requested-depth-complete`
- `winning-mate-early`
- `cooperative-deadline-after-completed-depth-0` から `-10`
- `outer-watchdog`
- `failure`

`cooperative-deadline-after-completed-depth-d` は「深さdまでは完了してから協調期限で戻った」という意味です。WASMの外側からは、深さd完了直後の `timeUpNow` と、次の反復探索中の `sampleTime` を区別できません。したがって「d+1の途中で止まった」とはclaimしません。部分反復のmoveやscoreは採用せず、`partial_iteration_results_adopted = 0` を固定します。

## 5. 集約とprivacy境界

親へ返すのは、outcome数、phase histogram、完了深さhistogram、nodes/leavesの固定範囲histogram、設定並列数、観測peak並列数だけです。個別lane recordは返しません。

次は出力しません。

- SFEN、board、入力index、digest
- game ID、parent ID、position ID
- PID、stderr、error message、stack
- move、score
- 個別laneの正確なnodes、leaves、経過時間

stderrを1 byteでも受けたchildは内容を保持せずfixed failureになります。privacy canary testは、入力やstderrに置いた識別語が集約JSONへ出ないことを確認します。

## 6. 600秒と615秒の境界

協調期限は600,000 ms、外側watchdogは615,000 msです。ただし「必ず15,000 msのcleanup余裕がある」とは言えません。外側watchdogはchild spawn時に始まり、bootstrap、入力転送、検証、WASM instantiate、weights copyも615,000 msに含まれます。WASMの協調時計はchild内で検索時に使われます。

したがって15,000 msは名目差であり、検索後に保証された余裕ではありません。このPRはそのnonclaimをmachine-readable evidenceへ固定します。実運用前には、別bindingでstartup時間と全child reapを集約確認する必要があります。

## 7. 本番scopeと検証

変更対象は診断専用worker、非運用in-memory core、unit test、日英記事、[machine-readable design evidence](./data/floodgate-stable-wasm-deadline-diagnostic-2026-07-17.json)だけです。

| 境界                                      | 状態            |
| ----------------------------------------- | --------------- |
| production worker / pool / runtime        | unchanged       |
| production authority / import graph       | unchanged       |
| package script / CLI / file writer        | added 0         |
| 既存WASM / weights / binding              | unchanged       |
| 実WASM constant-clock 0-vs-1 parity       | PASS            |
| 実WASM scaled-clock cooperative return    | PASS            |
| callback overhead / wall-time equivalence | not established |
| partial result adoption                   | 0               |
| synthetic isolation / max 6 / reap        | PASS            |
| 実データ診断                              | 0               |

最新main `398b6d20dbe9b2de4648e77424c2a15820f15dec` のproduction関連9 identityをbytesとSHA-256で固定し、すべて不変であることをtestします。

## 8. 現在の判断と次のgate

これは長尾原因を測るための設計であり、原因を解消した実績ではありません。teacher data、再学習、候補選抜、formal A/B、外部校正、棋力向上、高段安定性はどれも未達です。本番は **STOP**、live weightsはunchangedです。

次はfinal-head CIと独立reviewの後、別の非本番run bindingで固定12件をaggregate-only実行します。その前に短時間で完了するsentinelを使い、constant-clock基準に対するcallback overhead ratioを別集約で記録します。本番長尾の実行でも永続状態のbefore/after不変、最大6 child、個別poisonなし、全child reapを確認します。証拠が揃うまではteacher生成にもlive activationにも進みません。
