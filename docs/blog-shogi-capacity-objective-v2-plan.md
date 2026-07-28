# 将棋capacity objective-only v2の結果：Top-1は通過、pairで棄却

> v1と同じモデル・データ・1,280親・40 epochで、objectiveだけを合否指標へ合わせた。Top-1はBrowserとV9の両方で閾値を超えたが、pairは両方でv1より悪化し、事前登録どおりv2全体を棄却した。本学習、2つ目のseed、sealed教師、ライブ変更には進んでいない。[English](./blog-shogi-capacity-objective-v2-plan.en.md)

## 結論

objective-only v2は `complete-sentinel-rejected` で終了した。

| 指標 | v1 | v2 | v2−v1 | v2ゲート | 判定 |
|---|---:|---:|---:|---:|---|
| Browser Top-1 | 179/256（69.92%） | 222/256（86.72%） | +43親、+16.80pt | 85%以上 | PASS |
| Browser pair | 73.85% | 73.08% | -0.78pt | 98%以上 | FAIL |
| V9 Top-1 | 811/1,024（79.20%） | 921/1,024（89.94%） | +110親、+10.74pt | 85%以上 | PASS |
| V9 pair | 87.00% | 84.85% | -2.15pt | 98%以上 | FAIL |

objective変更は無反応ではなかった。Top-1はBrowserで閾値を1.72pt、V9で4.94pt上回った。一方、直接合わせようとしたpairはBrowserで閾値を24.92pt、V9で13.15pt下回った。4条件のうち2つがFAILなので、総合判定は棄却である。

これは訓練内sentinelであり、棋力や未見局面への一般化を測った結果ではない。Top-1通過だけを取り出して「AIが強くなった」とは主張できない。

## v1から変えたのはobjectiveだけ

| objective | v2 |
|---|---:|
| listwise policy | 1.0 |
| 各domain batchの全eligible pairをpoolするmicro logistic | 1.0 |
| 教師同率首位を集合で扱うhardest-negative Top-1 margin | 1.0 |
| move-value | 0.20 |
| state-value | 0 |

5,953,522-parameterモデル、43-plane入力、データ、除外、分割、sentinel親、seed、AdamW、learning rate、batch、順序、40 epoch、Top-1 85% / pair 98%ゲートはv1と同一である。実際にv1とv2の `data_receipt` とlive baselineは完全一致し、評価pair数もBrowser 1,042,139、V9 49,889で一致した。

外部 `result.json` は25,053バイト、SHA-256 `1f16f030d52d2aff1d8009614aaeb2183a68b462e212933924fae594c2136e3a`。objectiveは `gate-aligned-micro-pair-hard-negative-v2`、固定protocolは21,089バイト、SHA-256 `15e7c8ffee90a9ad2d6caad41267d9e788984ffd97627a4f1c734aa49954d3d8` である。

## 40 epochの実測曲線

v2 lossは12.2130から3.1358まで下がり、最小値はepoch 40だった。ただしv1とv2ではobjectiveの定義と重みが違うため、v1のloss 2.2629とv2の3.1358を大小比較して優劣を決めることはできない。

| epoch | loss | 秒 | epoch | loss | 秒 |
|---:|---:|---:|---:|---:|---:|
| 1 | 12.213042 | 23.195 | 21 | 3.718387 | 7.383 |
| 2 | 11.226556 | 7.967 | 22 | 3.709730 | 6.960 |
| 3 | 9.722485 | 7.884 | 23 | 3.573894 | 7.002 |
| 4 | 8.641396 | 7.781 | 24 | 3.551910 | 7.291 |
| 5 | 7.358148 | 7.720 | 25 | 3.644022 | 7.126 |
| 6 | 6.357735 | 7.808 | 26 | 3.474080 | 7.624 |
| 7 | 5.619614 | 8.101 | 27 | 3.517037 | 7.268 |
| 8 | 4.961493 | 7.350 | 28 | 3.530302 | 7.578 |
| 9 | 4.801455 | 8.276 | 29 | 3.465568 | 7.559 |
| 10 | 4.625634 | 8.551 | 30 | 3.365900 | 7.397 |
| 11 | 4.362289 | 7.698 | 31 | 3.300953 | 7.459 |
| 12 | 4.328898 | 7.675 | 32 | 3.509236 | 7.495 |
| 13 | 4.126601 | 7.648 | 33 | 3.409219 | 7.161 |
| 14 | 4.127328 | 7.407 | 34 | 3.311161 | 7.399 |
| 15 | 4.016109 | 7.369 | 35 | 3.353493 | 7.254 |
| 16 | 4.120951 | 7.264 | 36 | 3.338644 | 7.545 |
| 17 | 4.025909 | 7.272 | 37 | 3.293471 | 7.284 |
| 18 | 3.899232 | 7.248 | 38 | 3.203737 | 7.289 |
| 19 | 3.872783 | 7.365 | 39 | 3.156432 | 7.185 |
| 20 | 3.728324 | 6.964 | 40 | 3.135810 | 6.982 |

記録されたepoch時間の合計は314.78秒（5分14.78秒）。epoch 1は23.19秒、epoch 2〜40は合計291.59秒、中央値7.40秒/epochだった。これは入力読込や事前監査を除くepoch区間だけの時間である。v1より合計68.45秒長いが、初回compile条件も同一ではないため、この2runだけから一般的な速度差は主張しない。

参考値のmean regretはBrowser 3,965.14cp、V9 19.40cpで、v1よりそれぞれ9.84cp、2.06cp悪化した。regretはsentinelゲートではないが、v2を救済する材料でもない。

## 何が分かり、何が分からないか

v2は「v1のobjective不一致を直せば4ゲートをすべて通る」という仮説を否定した。Top-1へ直接寄せる変更は効いた一方、全体のpair順位を同時には学べなかった。

まだ次の原因は区別できない。

- parent boardと手特徴だけでは、各合法手後の局面差を表現しにくい
- 1つのscoreでTop-1 marginと100万超のBrowser pairを同時に満たす最適化が難しい
- 教師scoreの分布や、固定40 epochの範囲に別の制約がある

したがって「大型モデルでも不可能」とは結論しない。一方、同じv2へepochやseedを追加する根拠もない。

## 次はchild-board encoder診断

事前登録した停止規則どおり、v2はここで閉じる。次は別protocolで、各合法手を実際に適用した後の盤面をencodeする小規模child-board capacity診断を行う。

目的は、現行のparent-board＋手特徴に欠ける「指した後の盤面」表現を与えると、Top-1だけでなくpairも訓練内で学べるかを分離することである。まず固定sentinelだけを実行し、通らなければ本学習へ進まない。アーキテクチャやゲートは新protocolで結果を見る前に固定する。

## 現在地

- v2 sentinel：40 epoch完了、Top-1 2条件PASS・pair 2条件FAIL、総合棄却
- v2正式candidate本学習：未開始
- seed 314159：未許可・未開始
- sealed教師生成：未許可・未開始
- 蒸留、WASM、対局A/B：未開始
- ライブ重み：未変更
- 次工程：child-board encoderの小規模capacity診断

完全な40 epoch曲線とv1比較は [shogi-capacity-policy-value-v2-result-2026-07-28.json](./data/shogi-capacity-policy-value-v2-result-2026-07-28.json)、v1結果は [capacity v1記事](./blog-shogi-capacity-policy-value-plan.md) に記録した。
