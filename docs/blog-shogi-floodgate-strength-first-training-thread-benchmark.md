# 3-seed学習のCPU thread数を実測で選ぶ準備

> 2026年7月20日、正式v9教師の実行中に、次工程の3-seed学習がCPUを十分使えるかを
> 監査した。ベンチマーク基盤だけを実装し、教師と競合する実測はまだ行っていない。
> English:
> [blog-shogi-floodgate-strength-first-training-thread-benchmark.en.md](./blog-shogi-floodgate-strength-first-training-thread-benchmark.en.md)

## 結論

現在の学習設定はseed 42 / 43 / 44を同時に動かすが、各processはTorch 2 threads固定で、
3 process合計は6 intra-op threadsである。この2 threadsは、以前の6-run構成で
`6 × 2 = 12`にするために決めた値を継承しており、現在の3-run構成で2と4を比較した
実測記録はなかった。

そこで、3 processを同時に動かした実際のQAT計算で、各process 2 threadsと4 threadsを
`2, 4, 4, 2`の順に比較するargumentlessベンチマークを追加した。4 threadsなら合計12
intra-op threadsになる。ただし、速くなると測定できるまでは2を維持する。

## 何を測るか

実棋譜、教師data、学習plan、選抜label、holdoutは一切読まない。固定の合成tensorと
seed 42 / 43 / 44から毎trial同じinitializerを作り、production学習が使う
`int16_aware_dual_task_loss`をそのまま呼ぶ。float taskとint16 STE task、replay value、
sibling ranking、policy lossを計算し、backwardとAdamW更新まで12 batch行う。

各trialでは3 seed workerが全て準備完了してから共通barrierを解除する。process起動、
Torch import、tensor生成、model初期化、結果書込みは計測外で、loss forward、
backward、AdamW stepだけを計測する。

## 選択条件

各seedについて、同じthread設定を再実行した後の全model tensorと固定probe出力のhashが
一致しなければSTOPする。AdamWの`step`、`exp_avg`、`exp_avg_sq`を含むoptimizer stateの
canonical hashも同じ条件で比較する。2 threadsと4 threadsの間でも全hashが一致しなければ、
計算内容や次stepが変わる可能性があるためSTOPし、thread数を選ばない。各stepのcombined、
float、STE loss、final model parameter、float/STE probeはfinite必須で、NaNやinfinityを
hash一致として通さない。integer probeはdetached int64必須である。

各workerは開始時と終了時に、Python実行体、Torch Python moduleとnative `_C` moduleの
bytes/hash、version、CPU、実thread数、interop 1、deterministic algorithm、debug error
modeを記録する。開始終了が一致しない場合、またはthread数以外が12 worker間で一致しない
場合もSTOPする。workerのstderrはpipeへ溜めず、seed別のprivate fileへ残す。

一致した場合だけ二つのcounterbalanced pairを比較する。両pairで4 threadsがstrictに
速く、二つのspeedupの中央値が1.05倍以上なら4を選ぶ。判定は丸めた表示用ppmではなく
整数の交差積で行う。それ以外は2を選ぶ。この結果だけでproduction学習設定は変わらず、
review済みの後続変更が別に必要である。

## 実行順序

実ベンチは正式教師がCPUを解放した後、exact QAT plan candidateを作る前に実行する。
現在のbuilder、bridge、launcherは2 threadsを固定し、v3 planはそのruntimeを封印するため、
plan作成後に4へ変えることはできない。2が選ばれたら現行契約のままcandidate作成へ進む。
4が選ばれたら、まず別PRでproduction契約・test・記事をreviewしてmergeし、そのrevisionから
candidateを作る。

sleepによる中断を避ける実行commandは次のとおり。Python scriptへ渡す引数は0である。

```sh
/usr/bin/caffeinate -dimsu ~/.codex/shogi-data/floodgate-training-venv/bin/python3 ml/run_strength_first_training_thread_benchmark.py
```

builderのstdoutをtracked planへ直接redirectしてはいけない。builderは既存plan fileが
あると安全にSTOPするため、stdout candidateを別の一時fileへ保存し、review後の登録工程を
使う。

## 現在地

pure-stdlib unit test 14件とPython compile、Ruff、diff checkはPASSした。testはprocess
dispatch、3-seed barrier、ABBA順、5% gate、同設定の決定性STOP、設定間parity STOP、
runtime照合、logical CPU fail-closed、Git revisionのstrict decode、worker log descriptorの
cleanup、finite STOP、optimizer state hash、training-only境界を検証し、Torch workerも
optimizer trainingも起動していない。

正式24,000局面教師がCPUを使用中なので、実ベンチマークは教師完了後かつplan candidate
作成前に行う。現時点では計測値も選択thread数もなく、3-seed再学習、候補選抜、棋力改善、
live weight変更はいずれもまだない。

機械可読status:
[floodgate-strength-first-training-thread-benchmark-2026-07-20.json](./data/floodgate-strength-first-training-thread-benchmark-2026-07-20.json)
