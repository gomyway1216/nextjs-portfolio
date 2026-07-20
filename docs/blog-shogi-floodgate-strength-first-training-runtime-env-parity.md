# 3-seed学習の子process環境を固定した

> 2026年7月20日、実3-seed学習の開始前監査で、thread benchmarkは固定していた
> `PYTHONHASHSEED`、`OMP_DYNAMIC`、`MKL_DYNAMIC`をproduction学習launcherが
> 親shellから継承している差を発見した。launcherと敵対的testだけを修正し、
> 教師data、学習plan、checkpoint、選抜label、live weightは変更していない。
> English:
> [blog-shogi-floodgate-strength-first-training-runtime-env-parity.en.md](./blog-shogi-floodgate-strength-first-training-runtime-env-parity.en.md)

## 修正

`ml/run_strength_first_three_seed_training.py`は、seed 42 / 43 / 44の各子processへ
独立した環境mapを渡し、親環境より後に次の値を上書きする。

| 変数                     | 固定値  | 目的                               |
| ------------------------ | ------- | ---------------------------------- |
| `PYTHONHASHSEED`         | `0`     | Python interpreterのhash seed固定  |
| `OMP_NUM_THREADS`        | `2`     | processごとのOpenMP thread数       |
| `MKL_NUM_THREADS`        | `2`     | processごとのMKL thread数          |
| `OPENBLAS_NUM_THREADS`   | `2`     | processごとのOpenBLAS thread数     |
| `VECLIB_MAXIMUM_THREADS` | `2`     | processごとのAccelerate thread上限 |
| `OMP_DYNAMIC`            | `FALSE` | OpenMPの動的thread調整を無効化     |
| `MKL_DYNAMIC`            | `FALSE` | MKLの動的thread調整を無効化        |

thread数4が正式benchmarkで選ばれた場合は、その値を別のreview済み変更で更新してから
exact planを作る。今回の変更は2 threadsという現行契約を変えず、benchmarkと実launcherの
環境制御だけを一致させる。

## なぜ必要だったか

従来も4つのthread上限は`2`へ上書きしていたが、残る3変数は呼出し元shell次第だった。
そのため、同じrevision・data・seedでも、起動元が`PYTHONHASHSEED=random`や
`OMP_DYNAMIC=TRUE`を設定していれば、事前benchmarkと実学習のruntime条件が一致しない。
これは棋力低下を観測した証拠ではないが、3 seedを比較する実験の再現性境界としては
未固定だった。

敵対的unit testは7変数すべてへ異なる不正値を親環境から注入し、3つの子processが
すべて固定値を受け取ること、seed順が42 / 43 / 44であること、各processの環境mapが
独立していること、親環境を変更しないことを検証する。focused Python 8件と
machine-evidence contract 3件、Python compile、Ruff、Prettier、diff checkはPASSした。

## 証拠の境界

このPRはランチャーを起動せず、実optimizer stepも行わない。過去のCPU model修正記事や
その当時のtest件数は書き換えていない。実3-seed再学習、候補選抜、sealed holdout、
正式paired A/B、外部校正、live変更の証拠ではなく、それらの前に必要なruntime parity
修正である。

機械可読記録:
[floodgate-strength-first-training-runtime-env-parity-2026-07-20.json](./data/floodgate-strength-first-training-runtime-env-parity-2026-07-20.json)
