# 将棋評価関数の大型capacity診断：40 epochで棄却した実測結果

> 約595万パラメータなら教師順位を暗記できるかを先に試したが、固定sentinelの4条件をすべて下回った。本学習、2つ目のseed、sealed教師生成には進まず、ライブ重みも変更していない。失敗後の監査ではデータ衝突より、学習objectiveと合否指標のずれが次に直すべき箇所として残った。[English](./blog-shogi-capacity-policy-value-plan.en.md)

## 結論

capacity-policy-value v1は `complete-sentinel-rejected` で終了した。これは「AIが強くなった」という結果でも、「大型モデルでは強くできない」という証明でもない。固定した1,280親を訓練内で十分に再現できるかという、一般化より手前の診断に失敗したという結果である。

| 判定対象 | 実測 | 必要値 | 差 | 判定 |
|---|---:|---:|---:|---|
| Browser Top-1 | 179/256（69.92%） | 85% | -15.08pt | FAIL |
| Browser pair | 73.85% | 98% | -24.15pt | FAIL |
| V9 Top-1 | 811/1,024（79.20%） | 85% | -5.80pt | FAIL |
| V9 pair | 87.00% | 98% | -11.00pt | FAIL |

4条件のうち1つではなく、すべてが未達だった。事前ルールどおりsentinel重みを捨て、19,264親のV9 pretrain、875親のBrowserを含むmixed training、seed 314159、新しいsealed all-legal教師生成を開始しなかった。

本番 `public/shogi-nnue-weights.bin` は1,185,988バイト、SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc` のままである。WASMも変更していない。

## 何を実行したか

v1は現行NNUEと旧35,307-parameter residualより大きい、5,953,522-parameterのオフラインモデルを使った。

| 部分 | 設計 |
|---|---|
| 局面入力 | 手番側視点へ正規化した43枚の9×9平面 |
| 局面encoder | 64-channel stem、6 residual blocks、384次元global表現 |
| 合法手集合 | 256次元、4層Set Transformer、8 heads、FFN 1024 |
| 出力 | 現行live CPへのpolicy residualと別のparent value |
| sentinel | Browser 256親＋V9 1,024親、40 epoch |
| 固定ゲート | 両domainでTop-1 85%以上かつpair 98%以上 |

実行結果の外部 `result.json` は25,048バイト、SHA-256 `d7fd48f709bcd149330c8ff86eb4e878aa1b5156d6dde9fe62c2fd6fd55f6cf2` である。プロトコルは17,358バイト、SHA-256 `30b4aab6689679a98a6f86fa835610a5f0fcfd3157d8fc44d4029152d1f7eaf3` と一致した。

結果JSONの `model_training_started: false` は、sentinelとは別の正式candidate本学習を開始していないという意味である。sentinel自体は40 epoch実行され、その重みは `weights_discarded: true` として破棄された。

## 40 epochの実測曲線

lossは6.4844から2.2629まで下がったが、合否はlossではなく上の4指標で固定していた。epoch時間の合計は246.33秒（4分6.33秒）。初回MPS graph compileを含むepoch 1は41.09秒、epoch 2〜40は合計205.24秒、中央値5.12秒/epochだった。これは記録されたepoch区間の合計であり、入力読込・事前監査を含む全wall-clock時間ではない。

| epoch | loss | 秒 | epoch | loss | 秒 |
|---:|---:|---:|---:|---:|---:|
| 1 | 6.484438 | 41.089 | 21 | 2.537276 | 5.152 |
| 2 | 5.967680 | 6.976 | 22 | 2.480719 | 5.013 |
| 3 | 5.266509 | 5.383 | 23 | 2.512001 | 5.131 |
| 4 | 4.607557 | 5.590 | 24 | 2.435230 | 5.098 |
| 5 | 4.000121 | 7.062 | 25 | 2.421870 | 4.980 |
| 6 | 3.639033 | 6.106 | 26 | 2.413802 | 5.003 |
| 7 | 3.525774 | 6.163 | 27 | 2.468018 | 4.993 |
| 8 | 3.224988 | 5.363 | 28 | 2.452481 | 5.057 |
| 9 | 3.081868 | 5.126 | 29 | 2.412609 | 4.900 |
| 10 | 2.984415 | 5.134 | 30 | 2.375254 | 4.963 |
| 11 | 2.881760 | 5.168 | 31 | 2.366159 | 4.916 |
| 12 | 2.828364 | 5.463 | 32 | 2.404753 | 4.922 |
| 13 | 2.745177 | 5.230 | 33 | 2.346734 | 4.975 |
| 14 | 2.710387 | 5.104 | 34 | 2.339329 | 5.184 |
| 15 | 2.677353 | 5.161 | 35 | 2.331683 | 5.196 |
| 16 | 2.663600 | 5.086 | 36 | 2.407578 | 4.940 |
| 17 | 2.660618 | 5.026 | 37 | 2.352084 | 5.149 |
| 18 | 2.609000 | 5.090 | 38 | 2.321472 | 5.079 |
| 19 | 2.590427 | 5.071 | 39 | 2.293029 | 4.952 |
| 20 | 2.538418 | 5.121 | 40 | 2.262851 | 5.217 |

参考値として、最終mean regretはBrowser 3,955.30cp、V9 17.34cpだった。これらはsentinelの通過条件ではないため、4つのFAILを上書きしない。

## 「データがおかしかっただけか」の監査

棄却後、同じsentinelをラベルを変えずに監査した。

| 監査 | Browser | V9 |
|---|---:|---:|
| 重複position ID | 0 | 0 |
| 正規化43-plane局面入力の衝突 | 0 | 0 |
| 同一モデル入力に矛盾する教師label | 0 | 0 |
| 教師scoreをそのまま予測にしたoracle Top-1 | 100% | 100% |
| 同oracle pair | 100% | 100% |
| 教師最善手の同点を含む親 | 3/256 | 13/1,024 |

BrowserとV9のsemantic overlapも0だった。教師最善手が同点の親は存在するが、scorerは同率首位を正解集合として扱う。pairは教師差50cp未満を対象外にするため、teacher-score oracleは両指標とも100%になる。したがって、今回の未達を単純なID衝突、同一入力への矛盾教師、またはscorerが原理的に100%へ届かない問題だけでは説明できない。

この監査は教師の棋力が完全だという意味ではない。与えたラベルと評価器の内部整合性を確認しただけである。

## なぜlossが下がってもゲートに届かなかったか

v1のobjectiveには、合否と一致しない箇所があった。

1. **pairのmacro/micro不一致**
   学習時は各親のeligible pairを平均し、その後に親を等重みで平均した。一方、合否はdomain全体のeligible pairを合算するmicro指標だった。最終評価のpair数はBrowser 1,042,139、V9 49,889である。合法手数の多いBrowser親に合否上の大きな重みがあるのに、学習objectiveでは1親として同じ重みだった。

2. **同率首位とbest-marginの小さな不一致**
   scorerは教師同率首位をすべて正解とするが、v1のbest-margin lossは `argmax` で同率中の1手だけを選び、残りすべてにmarginを要求した。同率はBrowser 3親、V9 13親と少数だが、不要な矛盾である。

3. **合否に直接使わない回帰との競合**
   v1はpolicy、pair、best-marginに加えてmove-valueとstate-valueも同時に最適化した。loss全体の低下がTop-1とpairの十分な上昇を保証する構造ではなかった。

これは「原因がobjectiveだけだ」と証明したものではない。表現、最適化、教師分布にも未解決の可能性は残る。ただし入力衝突とoracle不達は否定でき、次の最小変更としてobjectiveを合否へ合わせる根拠は得た。同じv1をepochやseedだけ増やして続ける根拠はない。

## objective-only v2も棄却された

v1と同じモデル、データ、sentinel親、seed、optimizer、40 epoch、ゲートのままobjectiveだけを合否へ合わせたv2も実行した。

| 指標 | v1 | v2 | v2判定 |
|---|---:|---:|---|
| Browser Top-1 | 69.92% | 86.72% | PASS |
| Browser pair | 73.85% | 73.08% | FAIL |
| V9 Top-1 | 79.20% | 89.94% | PASS |
| V9 pair | 87.00% | 84.85% | FAIL |

Top-1は両domainで閾値を通ったが、pairは両方でv1より悪化した。2/4条件が未達なので、v2も事前登録どおり `complete-sentinel-rejected` で終了した。この結果はobjective変更がTop-1へ効いたことと、objective修正だけでは全pair順位を学ぶのに不十分だったことを同時に示す。棋力改善や未見局面への一般化はまだ測っていない。

次はepoch延長や追加seedではなく、各合法手を指した後の盤面を直接encodeする小規模child-board capacity診断へ進む。v2の完全な結果は [objective-only v2結果記事](./blog-shogi-capacity-objective-v2-plan.md) に記録した。

## 現在地

- capacity v1 sentinel：40 epoch完了、棄却
- objective-only v2 sentinel：40 epoch完了、Top-1 2条件PASS・pair 2条件FAIL、総合棄却
- v1正式candidate本学習：未開始
- v2正式candidate本学習：未開始
- seed 314159：未許可・未開始
- sealed教師生成：未許可・未開始
- 蒸留、WASM、対局A/B：未開始
- ライブ重み：未変更
- 次工程：child-board encoderの小規模capacity診断

v1の完全な実測曲線と監査要約は [shogi-capacity-policy-value-v1-result-2026-07-27.json](./data/shogi-capacity-policy-value-v1-result-2026-07-27.json)、v2は [shogi-capacity-policy-value-v2-result-2026-07-28.json](./data/shogi-capacity-policy-value-v2-result-2026-07-28.json)、事前登録した入力hashと分割は [shogi-capacity-policy-value-plan-2026-07-26.json](./data/shogi-capacity-policy-value-plan-2026-07-26.json) に記録した。
