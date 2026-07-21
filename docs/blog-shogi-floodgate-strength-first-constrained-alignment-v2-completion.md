# constrained alignment v2の3シード実行が完了

> 2026年7月20日、seed 42 / 43 / 44のconstrained alignment v2をローカルMacで
> 3 process同時に完了した。目的はfloat評価と本番int16評価の表現差を縮めることであり、
> 親候補の7個の整数テンソルは1 bitも変えていない。したがって、これは棋力向上、
> 高段到達、候補選抜、live反映の証拠ではない。English:
> [blog-shogi-floodgate-strength-first-constrained-alignment-v2-completion.en.md](./blog-shogi-floodgate-strength-first-constrained-alignment-v2-completion.en.md)

## 実行結果

3 seedを各2 Torch threadsで同時実行した。terminalからoperatorが転記した
`/usr/bin/time -lp`観測はwall 92.69秒、user 263.29秒、system 63.90秒、maximum resident
set size 1,860,321,280 bytes、swap 0だった。この時間・資源値はregistry builderが
認証するraw receiptではなく、参考観測として明示的に分離している。
入力は元の278,736行 / 23,980親だけで、replay、selection、final holdoutは読んでいない。

| seed | int target cache | epoch 21 → 24 loss | epoch 24 policy KL | `result.json` | `final.pt` |
| ---: | ---: | --- | ---: | --- | --- |
| 42 | 6.7437秒 | 0.0059724 → 0.0031964 → 0.0022139 → 0.0017836 | 0.00017521 | 8,306 bytes / `3cce48e8…402b` | 2,381,393 bytes / `5140b3fb…fd88` |
| 43 | 6.7866秒 | 0.0058711 → 0.0031672 → 0.0022037 → 0.0017856 | 0.00017131 | 8,307 bytes / `1dda7687…cd68` | 2,381,393 bytes / `649898e8…af9` |
| 44 | 6.6411秒 | 0.0062094 → 0.0033325 → 0.0023152 → 0.0018715 | 0.00018006 | 8,308 bytes / `ce5f354a…246d` | 2,381,393 bytes / `a3e894b4…02ae` |

固定cacheは各seedで整数target 278,736個を一度だけ計算し、4 epochで再利用した。
実行revisionは`a6fefc3f41543e35b9745da7f22fc8c7f2f6112f`である。各epochのloss、Huber、
policy KL、時間、量子化セルから出かけて親へ戻した座標数は機械可読recordとregistryへ
省略せず保存した。

## 「強くなった」実行ではない理由

この処理は、各float parameterを親と同じ量子化セル内だけで動かした。本番int16へ変換すると、
`w1_board`、`w1_hand`、`b1`、`w2`、`b2`、`w3`、`b3`は親候補と完全に同じになる。
したがって整数評価で指す手と棋力は、この工程だけでは変わらない。今回下げたlossは
「float側が、その同じ整数評価をより忠実に再現する度合い」であり、対局勝率ではない。

これは前のselectionでfloat指標とint16指標の差が小さくfamily gateを落とした問題を、
selection labelを再利用せずに直すための表現整合工程である。spent selectionは次に
表現差の確認だけへ使い、棋力の主張には使わない。棋力は未使用fresh-finalと正式A/B、
外部校正で別に測る。

## 独立検証とlive境界

result内の自己申告とは別に、3つの親checkpointと3つのv2 checkpointをstrict loadし、
再量子化して`torch.equal`で比較した。3 seed × 7 tensor = 21比較がすべて一致した。
builderは各resultの親identityが固定planの同seed親と完全一致する
ことも、親fileを開く前に要求する。result / checkpointのbytesとSHA-256は固定registryへ
登録し、argumentless builderの再生成をbyte-for-byteで照合できる。

別のoperator観測ではproductionの`public/shogi-nnue-weights.bin`は1,185,988 bytes、SHA-256
`e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`のままで、
Git上もclean、live変更は0である。候補選抜、holdout、正式A/B、外部校正が通るまで変更しない。

機械可読記録:
[floodgate-strength-first-constrained-alignment-v2-completion-2026-07-20.json](./data/floodgate-strength-first-constrained-alignment-v2-completion-2026-07-20.json)
