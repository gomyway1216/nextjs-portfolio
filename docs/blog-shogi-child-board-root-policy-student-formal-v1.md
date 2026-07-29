# root-policy student正式768局の実行境界

## 2026-07-28: 先に「走らないrunner」を固定した

root-policy studentのformalは、従来のNNUE対NNUEのformal v2をそのまま再利用できない。今回比較したいのは別の評価関数ではなく、**同じlive NNUE・同じworker・同じWASM・同じ探索条件**に対して、rootでstudent順位を使うかどうかだけである。candidateとstableの差は`student_enabled=true/false`の1箇所に限定する。

そのため、`child-board-root-policy-student-formal-v1-registry.json`と専用controllerを先に追加した。ただしregistryは`blocked`であり、現在のCLIはoutput directoryもsubprocessもgameも作らず終了する。これは未完成をPASS扱いするためではない。凍結student tensor、tune、sealed、parity、latency、static/determinism/no-contaminationをまとめたruntime admission、同一buildのcandidate/stable adapterが全部content addressされるまでgame 1を許さないためである。

## 固定した比較

| 項目                     | 固定値                                 |
| ------------------------ | -------------------------------------- |
| opening pair             | 384                                    |
| games                    | 768（各openingでcandidate先手・後手）  |
| pair workers             | 12                                     |
| search                   | depth 11、quiescence 10、K=600         |
| TT                       | 毎手clear                              |
| book / fallback / clocks | 全て無効                               |
| technical fault          | 1件目で停止、partial runは判定権限なし |
| authoritative statistic  | 384 pair完了後のpair bootstrapのみ     |
| bootstrap                | seed 20260710、100,000回               |
| safety gate              | one-sided 95% lower > 0.45             |
| stronger gate            | two-sided 95% lower > 0.50             |

途中のSPRTは進捗診断だけで、早期の棋力判定や外部対局許可には使わない。正式判定はzero faultで384 pair / 768局が全て揃った後だけ行う。

## runnerで固定した安全性

controllerには、READY registryの完全性、same-build role binding、openingごとのcolor swap request、pair receipt、stable側のstudent tensor read/inferenceが0であること、candidate側で実際にstudent inferenceが発生したことを検証する処理を入れた。

12 workerは最初から384件をqueueへ投げず、最大12件だけを常に飛行中にする。最初のfaultで新規submitを止め、partial resultをbootstrapへ渡さない。したがって「速く並列実行すること」と「fault後に大量の無効局を走らせないこと」を両立する。

## 現在の非主張

この変更だけではformal gameは0/768で、棋力向上、外部高段校正、live weight変更、production flag変更はどれも主張しない。次のregistry enrollmentは、実studentの学習完了とone-shot tune / sealed / runtime admissionが成功した後に、別のreviewed commitで行う。
