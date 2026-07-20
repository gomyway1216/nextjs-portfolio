# MultiPV 6の12対13並列を、同じ42局面で測る

> 2026年7月20日時点。fresh-selection教師の実際の探索条件で、12と13のYaneuraOu processを比較するローカル専用ツールを実装した。24,000局面の正式教師生成が動作中なので、比較そのものはまだ実行していない。モデル、live weight、共有search policyは変更していない。English version: [blog-shogi-floodgate-fresh-lane-multipv6-benchmark.en.md](./blog-shogi-floodgate-fresh-lane-multipv6-benchmark.en.md)

## 結論

「コアを増やせば必ず速い」とは限らない。各局面内のYaneuraOu探索はほぼ直列だが、別局面を別processへ配ることで局面間を並列化できる。一方、processを増やしすぎるとCPU競合、Hash memory、memory帯域によって遅くなる。実際、以前のMultiPV 12比較では14 processが12より遅かった。

fresh-selectionの固定条件はproposalがMultiPV 6 / depth 14、各候補の独立再採点がdepth 16である。候補数が違えばprocess数の最適値も変わり得るため、以前のMultiPV 12による12対13の結果をそのまま流用しない。新しいツールは次の同一workloadを測る。

| 項目 | 固定値 |
| --- | ---: |
| 認証済みtraining prefix | 同じ42局面 |
| 実行順 | 12 → 13 → 13 → 12 |
| trial数 / 合計処理枠 | 4 / 168 |
| proposal | MultiPV 6 / depth 14 |
| 不完全proposalのexact fallback | 合法手6以下だけ全合法手を個別探索 |
| 独立再採点 | MultiPV 1 / depth 16 |
| Threads | 1 / engine |
| Hash | 512 MiB / engine |
| 1探索上限 | 600秒 |

これは棋力テストではなく、教師labelを作るthroughputだけの比較である。

## 13 processを選ぶ条件

順序による温度、cache、background loadの偏りを減らすためABBA順にする。対応する比較はtrial 1の12対trial 2の13、trial 4の12対trial 3の13である。

13を推奨するには、次の3条件を全て満たす必要がある。

1. 1組目で13が12より少しでも速い（同率は不可）
2. 2組目でも13が12より少しでも速い（同率は不可）
3. 12の2回と13の2回のwall time中央値でも13が1%以上速い

中央値だけが良くても、片方の組が同率または13の方が遅ければ12を維持する。さらに各trialは42 / 42完了、forced skip 0、emitted group 42、work record 43でなければ比較全体を失敗させる。同じprocess数の2 trialは内部work fingerprintが一致し、12と13では異なることも確認する。fingerprint自体は結果へ公開しない。

## 稼働中の正式処理とは同時実行しない

比較ツールは正式v8 / v9教師の排他lockを先に取る。24,000局面の処理が動いていれば、engineを1つも起動せず失敗する。このため、現在の正式処理からCPUや約6.0 GiBまたは約6.5 GiBのengine Hashを奪わない。

実行前後には次も確認する。

- macOS arm64、Node v22.13.0、利用可能logical CPU 13以上
- cleanな同一Git revision
- tracked search policyのexact 1,349 bytes / SHA-256
- pinned YaneuraOu / eval asset authority
- 固定home、repository、asset、private output root
- argumentなしのentry point

各trialのstageは開始前と成功・失敗後の両方で削除する。skip、件数不一致、policy変更、source変更、asset変更があればreceiptをcommitしない。

## 結果に残すもの、残さないもの

privateな`receipt.json`に残すのは、process数、経過時間、throughput、件数、2組と中央値の比率、12または13の推奨だけである。局面、棋譜、指し手、SFEN、label、path、hash、内部fingerprintは含めない。

また、結果は共有policyを自動変更しない。13が閾値を超えた場合でも「別変更で検討できる推奨」に留まり、モデルやlive weightは一切書かない。

## 現在地

実装と10件の軽量単体テストは完了した。中央値閾値ちょうどの採用、両組が約0.5% / 1.5%速い境界、片方が同率のときの12維持、順序・件数・fingerprint drift、private field、skip後cleanup、入力postflight、policy・platform・root・CLI driftを確認している。

実比較は意図的に未実行であり、12と13のどちらがMultiPV 6で速いかはまだ確定していない。24,000局面の正式処理が終了し、この実装がmergeされたclean revisionからだけABBA比較を実行する。

機械可読の実装statusは[こちら](./data/floodgate-strength-first-fresh-lane-multipv6-benchmark-2026-07-20.json)にある。
