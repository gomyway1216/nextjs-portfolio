# Direct-teacher HalfKP81 v2は学習前のMPS技術停止で終了した

> 2026年7月29日のone-shot attemptは、学習候補を1つも作らず終了した。固定したMPS環境でPyTorchの`aten::_embedding_bag`が使えず、initializerのbaseline推論の最初のforwardで停止したためである。optimizer、gradient、学習batch、性能metricはすべて0だった。同じexecution planを再実行せず、旧claimと旧outputを変更しないauthoritative terminalizerを追加した。[English](./blog-shogi-direct-teacher-halfkp81-v2-technical-stop.en.md)

## 結論

これは棋力評価の失敗ではない。棋力を測る候補そのものが作られていない。

実行順は次の位置で止まった。

1. 200,944 training行と22,890 validation行のidentityと5種類のcross-role overlapを再検証した。
2. execution plan SHA-256 `c6fd910e…e19751`に対するcreate-only claimを取得した。
3. 凍結initializerを94,656,708-byteの研究用weightsへexportした。
4. modelをMPSへ移し、validation上のinitializer baseline推論を開始した。
5. 最初の`EmbeddingBag` forwardが`aten::_embedding_bag`未実装で停止した。
6. `train_exactly_one_epoch`には到達しなかった。

trainerのコードではAdamWの生成、`zero_grad`、`backward`、`optimizer.step`はすべて`train_exactly_one_epoch`内にある。したがって実測会計はoptimizer生成0、step 0、training batch 0、training row 0、metric 0である。旧outputに残ったのは既知の凍結initializerと同じSHA-256 `2b91060f…b47c`の`initializer-weights.bin`だけだった。candidate weights、final checkpoint、trainer result、static sanity resultは存在しない。live weightsも1,185,988 bytes / SHA-256 `e4e738f9…e28dc`から変わっていない。

完全な値は[machine-readable data memo](./data/shogi-direct-teacher-halfkp81-v2-technical-stop-2026-07-29.json)に固定した。

## なぜ同じplanをやり直さないのか

claimはexecution plan SHAだけをkeyにしたglobal one-shotで、688 bytes / SHA-256 `a39863b1…574f7`としてdurableに残っている。出力先を変えても同じplanの再利用にはならない。claimや途中outputを削除して再実行することも許可しない。

失敗logは465 bytes / SHA-256 `b8e81e9e…7bd6`で、MPS上の`aten::_embedding_bag`停止を固定している。これはcandidateの性能を見た後の中止ではなく、initializerのno-gradient baseline forwardで起きたruntime capability failureである。それでも、one-shot境界を例外扱いして同じplanを再利用することはしない。

## authoritative terminalizer

`ml/terminalize_direct_teacher_halfkp81_v2_technical_stop.py`はこの1回のattemptだけを閉じるstdlib CLIである。torch、training dataset、optimizer、model forwardを使わない。

CLIは次をすべて再認証する。

- claim、execution plan、failure logのexact bytes / SHA-256
- claimがexecution plan、pipeline revision `34729b04…e3cb`、旧outputへ正しく束縛されていること
- planがMPS、seed 42、1 epoch、candidate 1を固定していること
- 旧outputのentryが`initializer-weights.bin`だけで、そのbytes / SHAが固定値と一致すること
- live weightsがbyte-exactで変わっていないこと
- candidate、checkpoint、trainer/static resultが存在しないこと

入力を2回認証して同一である場合だけ、別directoryの
`~/.codex/shogi-runs/direct-teacher-halfkp81-v2-technical-stop-v1/result.json`
をsame-directory temporary file、file `fsync`、hard-link create-only、directory `fsync`の順で1回だけ公開する。旧claimと旧outputへの書込み権限はreceipt内でも常にfalseである。

## 次の学習との境界

旧v2から性能metricは1つも得ていないため、deviceの技術修正を性能結果から選んだ選別バイアスはない。ただし次の実行はv2のretryとは呼ばない。明示的にCPUを固定した新protocol、新execution plan、新claimを持つ独立successorとして事前登録する。dataset bytes、initializer、seed、batch、learning rate、epoch、static thresholdは変えず、claim取得前に予定deviceでinitializer forward capabilityを確認する。

PyTorchの暗黙MPS fallbackは旧planに束縛されておらず、既存のruntime-only測定でもCPUより遅かった。native MPSは別環境でforward/backwardできてもweight hashが再現しなかった。したがってsuccessorは明示CPUとし、この技術停止をcandidate比較に利用しない。

このterminal receiptは棋力向上、高段到達、paired56許可、expanded stage許可、live変更のいずれも証明しない。
