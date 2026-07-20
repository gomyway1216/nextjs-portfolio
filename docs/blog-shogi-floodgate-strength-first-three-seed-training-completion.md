# strength-first正式3シード学習が完了

> 2026年7月20日、正式v9教師の278,736行を使うseed 42 / 43 / 44の再学習が、
> ローカルMac上で3本とも完了した。3候補はすべて20 epoch、CPU 2 threads、
> final epochだけを候補にする同一条件で生成された。これは「候補を作れた」結果であり、
> まだ棋力向上や高段到達の証明ではない。fresh selection、封印holdout、正式A/B、
> 外部校正が終わるまでlive weightは変更しない。English:
> [blog-shogi-floodgate-strength-first-three-seed-training-completion.en.md](./blog-shogi-floodgate-strength-first-three-seed-training-completion.en.md)

## 実行結果

3本は直列ではなく同時に実行した。launcher全体は1,814.38秒（30分14.38秒）で終了し、
3 processのreturn codeはすべて0だった。`/usr/bin/time -lp`の観測はuser 3,524.01秒、
system 2,918.26秒、maximum resident set size 2,463,711,232 bytes、swap 0である。

| seed | epoch | final task loss | `result.json` bytes / SHA-256 | `final.pt` bytes / SHA-256 |
| ---: | ---: | ---: | --- | --- |
| 42 | 20 | 0.6226236975 | 7,700 / `c68c99eadf5081fee9370023dde2d7bd8c3430ba15d28fc0715c8a2a90809763` | 2,383,633 / `84ab533c7bf36183b83228c5dab5817dd730fcfae5d81be645569f45b5622a6a` |
| 43 | 20 | 0.6225629238 | 7,698 / `e9681e76bd1859ebf4af9e7dbb10b2269e5c024c0d58de0e195d2ef0021cc4b6` | 2,383,633 / `6665c7de16c8f9b6b7eb9c3fccc29db58ae12271e548301b25b9233508c4bbb0` |
| 44 | 20 | 0.6214848745 | 7,700 / `65b0df3892c0d86446d7febe896fb4e59bbb086223a7030ccdf8ec1f8c0a5c30` | 2,383,633 / `00b074439f404c1d95e77ed4d0318ab34c85106d4a18c7a18f394e21f6aabcd5` |

3結果は固定plan 6,242 bytes / SHA-256
`ab5264f14e2ccde65c2aa4a17e21c3dd20839edd268d6c4aa345291f38c5178c`と、
学習revision `ba52b872599356063d1c4790a59564bf758cddcc`へ一致している。
selection labelの読み取りとselection評価は各0で、candidate selection、holdout評価、
live変更も0である。

## なぜ全14コアを各候補へ割り当てなかったか

各seed 2 threadsと4 threadsの事前実測では、4 threadsの速度比中央値が0.982727だった。
つまり4 threadsは2 threadsより中央値で約1.73%遅かった。そこでCPU使用率の表示ではなく
完了時刻を優先し、3 seedを同時に動かしながら各seedは2 threadsに固定した。
途中でthread数を変えると固定planと再現性を壊すため、正式run中の変更は行っていない。

次回の学習では、3 processが重複して行う共通データのparseをhash固定共有cacheへ移す余地が
ある。ただし今回は前処理後に判明したため、完了済みrunを止めて作り直すより、そのまま
完走する方が速かった。

## 3候補を次工程へ登録

学習後、3つの`result.json`と`final.pt`をstrict loadする登録Builderを独立に2回実行した。
両出力は2,965 bytesでbyte-for-byte一致し、SHA-256は
`0526b1633364db4c6e715a612823b1fc2d5375610329f017aff20d810fda88c1`だった。
このexact出力をselection preflight registryへ登録した。focused Python testは20 / 20、
全Python回帰は391 / 391 PASSした。

この登録がreview・CI・通常mergeされた後、3 checkpointをもう一度strict loadしてから、
未使用のfresh-selection 4,800局面をYaneuraOu 12 processで生成する。そこでstableと
3候補を同一条件で評価し、通過候補だけを封印holdoutと正式対局へ進める。

機械可読記録:
[floodgate-strength-first-three-seed-training-completion-2026-07-20.json](./data/floodgate-strength-first-three-seed-training-completion-2026-07-20.json)
