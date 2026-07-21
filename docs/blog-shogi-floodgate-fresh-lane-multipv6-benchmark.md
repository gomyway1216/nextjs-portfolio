# MultiPV 6の12対13並列を、同じ42局面で測った

> 2026年7月20日時点。fresh-selection教師と同じ探索条件で、12と13のYaneuraOu processをローカル実測した。事前登録した判定規則を満たしたため、**この処理には13 processを選ぶ**。モデル、live weight、共有search policyは変更していない。English version: [blog-shogi-floodgate-fresh-lane-multipv6-benchmark.en.md](./blog-shogi-floodgate-fresh-lane-multipv6-benchmark.en.md)

## 結論

同じ42局面を `12 → 13 → 13 → 12` のABBA順で処理した結果、所要時間は次の通りだった。

| trial | process数 | 42局面の所要時間 | forced skip |
| ----: | --------: | ---------------: | ----------: |
|     1 |        12 |         35.430秒 |           0 |
|     2 |        13 |         32.941秒 |           0 |
|     3 |        13 |         31.332秒 |           0 |
|     4 |        12 |         31.376秒 |           0 |

12 processの中央値は33.403秒、13 processは32.137秒だった。同一workloadに対する速度比は1.039394、つまり13 processが約3.94%高いthroughputになった。wall timeの短縮率で表すと約3.79%である。

1組目の速度比は1.075559、2組目は1.001404だった。2組目は僅差だが、両組とも13が12を厳密に上回り、中央値も事前登録した1%以上の条件を通った。そのため選択結果は13である。

これは棋力テストではない。変わるのは教師label生成の並列数だけで、探索深さ、MultiPV、Hash、1 engineあたりのthread数は同じである。

## 固定した比較条件

各局面内のYaneuraOu探索はほぼ直列だが、別局面は別processへ配れる。一方でprocessを増やしすぎるとCPU競合、Hash memory、memory帯域で逆に遅くなるため、実測で選んだ。

| 項目                           |                            固定値 |
| ------------------------------ | --------------------------------: |
| 認証済みtraining prefix        |                        同じ42局面 |
| 実行順                         |                 12 → 13 → 13 → 12 |
| trial数 / 合計処理枠           |                           4 / 168 |
| proposal                       |              MultiPV 6 / depth 14 |
| 不完全proposalのexact fallback | 合法手6以下だけ全合法手を個別探索 |
| 独立再採点                     |              MultiPV 1 / depth 16 |
| Threads                        |                        1 / engine |
| Hash                           |                  512 MiB / engine |
| 1探索上限                      |                             600秒 |

4 trialすべてで42 / 42局面を完了し、合計168 / 168だった。forced skipは0、emitted groupは168、各trialのwork recordはheader込み43だった。

## 13 processを選ぶ規則

順序による温度、cache、background loadの偏りを減らすためABBA順にした。対応する比較はtrial 1の12対trial 2の13、trial 4の12対trial 3の13である。

13を選ぶには、次の3条件をすべて満たす必要がある。

1. 1組目で13が12より少しでも速い（同率は不可）
2. 2組目でも13が12より少しでも速い（同率は不可）
3. 12の2回と13の2回のwall time中央値でも13が1%以上速い

今回は3条件すべてを満たした。中央値だけを見て都合よく選んだのではなく、実行前に固定した規則をそのまま適用している。

## 実行時間と計算資源

ベンチマーク全体の計測はwall 140.28秒、user 1002.86秒、system 30.16秒、process swap 0だった。trial内の純粋な探索時間の合計は131.079秒で、残りには認証、preflight / postflight、排他、stage cleanupなどが含まれる。

比較ツールは正式v8 / v9教師の排他lockをengine起動前に取得する。正式処理と同時には走らず、CPUやengine Hashを奪わない。さらにcleanな同一Git revision、tracked search policy、認証済みtraining input、pinned YaneuraOu / eval assetsを実行前後で再確認した。各trialの一時stageも開始前と成功後の両方で削除した。

## 公開しない情報

私的receiptはcurrent user所有の通常ファイル、mode 0600、hard link 1としてread-only検証した。schema、status、4 trial、選択規則、集計値も一致し、private payload fieldは0だった。

公開データには私的なpath、receipt hash、内部work fingerprint、局面、棋譜、指し手、SFEN、label、scoreを含めていない。公開しているのはprocess数、時間、throughput、件数と判定結果だけである。

## 次に何が変わるか

この結果は「MultiPV 6のfresh教師処理では13 processを使う」という実測根拠になる。ただし共有search policyを自動変更せず、モデルやlive weightも一切書き換えていない。13 processの採用は、別のレビュー済み変更で反映する。

既存11件のbenchmark単体テストに加え、公開した実測値、判定計算、168 / 168完了、非公開境界を固定する証拠テストを追加した。機械可読の実測証拠は[こちら](./data/floodgate-strength-first-fresh-lane-multipv6-benchmark-2026-07-20.json)にある。
