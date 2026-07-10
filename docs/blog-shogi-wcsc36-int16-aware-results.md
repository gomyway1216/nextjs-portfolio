# 全seedのint16 pairは上がった。それでも0/3で不採用 — WCSC36 int16-aware学習の結果

> [前回のsealed 6-run結果](./blog-shogi-wcsc36-sibling-training-results.md)では、warm seed 42がstableよりpair accuracyを上げた一方、top-1とfloat→int16 pair差のgateに落ちた。そこで今回は、productionと同じint16演算を学習中のforwardへ入れるint16-aware / STE学習を、結果を見る前に3 seedだけ事前登録した。3 run完了後にmodel-selectionを1回だけ開いた結果、**全seedのint16 pair accuracyはstableを上回ったが、4 gateを全部通ったseedは0/3**だった。statusは`static_selection_fail`、final holdoutは未開封、productionはrunOp1のままである。これは棋力向上の発表ではなく、2回目の開発screeningを不採用で止めた記録である。English version: [blog-shogi-wcsc36-int16-aware-results.en.md](./blog-shogi-wcsc36-int16-aware-results.en.md)

---

## TL;DR

- exact production int16 forwardとSTE backwardを共有し、`0.5 × float full task + 0.5 × int16 STE full task`でseed 42 / 43 / 44を各20 epoch学習した。epoch途中のcheckpoint選択、early stopping、学習中のselection評価はない
- 3つの`result.json`が揃う前にselectionを読まないpreflightを通し、その後に4局・341親・3,912行のmodel-selectionを各checkpointちょうど1回評価した
- int16 pair accuracyはstableの`0.6048966902`に対し、seed 42が`0.6071636764`、seed 43が`0.6092363495`、seed 44が`0.6073579895`。**pair対stable gateだけなら3/3 pass**だった
- しかしseed 42はfloat→int16 pair差、seed 43はint16 top-1対stable、seed 44はpair差とtop-1差に失敗した。4 gateを全部通ったseedは`0/3`
- int16 pairを先頭metricにした順位は43 → 44 → 42。事前登録どおりmedian-rankedのseed 44が代表だが、4 gate中2つに落ちた
- family gateは「代表が4/4」「少なくとも2 seedが4/4」「全3 seedが両方の量子化差gateをpass」を要求する。実測はすべてfalseで、audit statusは`static_selection_fail`
- final holdoutは`not_opened_by_this_command`、`production_promotion_authorized`はfalse。retention、既知回帰、production browser、384局paired A/B、外部高段校正へは進めず、runOp1を維持した
- 次は失敗後にseedを足したり、同じselectionを見ながらratio・learning rate・epoch数を調整したりしない。**新しい強い教師データとfresh development splitを用意し、新しいplanとして事前登録する**

---

## 0. 今回の結論を先に固定する

この実験で確認できたのは、次の2点である。

1. exact int16を目的関数へ入れると、少なくとも今回の3 seedではproduction int16のpair accuracyがすべてstableを上回った
2. それでもtop-1とfloat→int16差はseed間で安定せず、事前登録したfamily gateには1 seedも合格しなかった

1だけを抜き出せば「改善した」と書ける。しかし目標は、選んだseedだけが偶然よいことではなく、量子化後も安定してよいfamilyを作ることだった。したがって判定は`static_selection_fail`であり、**「安定して高段になった」証拠はまだない**。

なお、ここで使ったmodel-selectionは4局・341親のdevelopment screeningである。仮にstatic gateを通っていても、それだけで棋力や因果を証明する設計ではない。今回はその入口にも通らなかった。

---

## 1. なぜint16-aware学習を試したのか

[前回](./blog-shogi-wcsc36-sibling-training-results.md)のprovisional candidateは、floatではpair accuracyがよくても、production用int16へ丸めるとpair順位が許容幅より大きく動いた。最後にexportするだけでは、学習器は丸め、int16 clamp、int32 accumulator、activation clamp、arithmetic right shiftを目的関数として見ていない。

今回の仮説は単純である。productionと共通のexact integer forwardを学習中にも通し、そのforwardへSTEで勾配を返せば、floatだけでなく配布形のint16でもpair/top-1を保ちやすくなるのではないか。

ただし、結果を見ながら実装や判定を変えないため、[事前登録plan](../ml/protocols/wcsc36-int16-aware-plan.json)を先にmergeした。planは8,152 bytes、SHA-256は次である。

```text
bef7863a5f6c85d5d6c5b97cc21aef48d17dae137ffd679efeda764d352a6b6b
```

学習目的はfloat branchとint16 STE branchを同率にした。

```text
combined task = 0.5 * float full task + 0.5 * int16 STE full task
```

両branchは同じprimary batchと同じreplay indexを使う。full taskはvalue、within-parent ranking、policy、replay valueを含む。量子化forwardはproductionと共通で、weightはsigned int16、bias/accumulatorはchecked signed int32、activationは0〜127、後段weight scaleは64、出力scaleは8,128である。

---

## 2. 結果を見る前に固定したone-shot protocol

### 2.1 学習中はselectionを読まない

seed 42 / 43 / 44は、同じwarm initializerから固定final epochまで学習する。各result manifestが確認している契約は次のとおりである。

| 項目                                  | 固定値                      |
| ------------------------------------- | --------------------------- |
| seed                                  | 42 / 43 / 44                |
| epoch                                 | 20                          |
| batch                                 | 256                         |
| learning rate                         | `0.0001`、CosineAnnealingLR |
| replay                                | 500,000行、ratio `1.0`      |
| checkpoint policy                     | `fixed-final-epoch-only`    |
| candidate artifact                    | `final.pt`                  |
| early stopping                        | false                       |
| selection evaluations during training | 0                           |
| selection labels read during training | false                       |

途中epochのlossを見てcheckpointを選ばず、3 seedすべてが`complete`になってから初めてselectionを読む。auditのpreflightは`all_three_complete_before_selection_read: true`を記録した。

### 2.2 代表seedの決め方

各final checkpointをproduction int16で評価し、次の順で並べる。

1. int16 pair accuracyが高い
2. int16 teacher top-1 accuracyが高い
3. int16 value MAEが小さい
4. seedが小さい
5. checkpoint SHA-256が小さい

3 seedの中央、つまりmedian-ranked seedだけを代表にする。結果を見て「一番都合のよいseed」へ差し替えない。

### 2.3 seedごとの4 gateとfamily gate

stable int16の基準はpair `0.6048966902`、top-1 `0.2668621701`。各seedは次を全部満たす必要がある。

| gate                | 条件                   |
| ------------------- | ---------------------- |
| int16 pair          | stableよりstrictに高い |
| int16 top-1         | stable以上             |
| float→int16 pair差  | 絶対値`≤ 0.002`        |
| float→int16 top-1差 | 絶対値`≤ 0.005`        |

さらにfamily全体では、代表が4/4、3 seed中少なくとも2 seedが4/4、全3 seedが両方の量子化差gateをpass、の全部を要求した。static passは棋力証明ではなく、final holdout以降へ進むためのscreening passにすぎない。

---

## 3. 実行identityと再現台帳

実験はPR #408「[Preregister exact int16-aware shogi training](https://github.com/gomyway1216/nextjs-portfolio/pull/408)」を通常のmerge commitで取り込んだclean revisionから実行した。

```text
753f90a026dfd6ec837b4444f3220db5648dc212
```

3 runとselection auditはこのrevision、`tracked_tree_clean: true`を記録している。主要input identityは次のとおりである。

| artifact                      |                       bytes / records | SHA-256                                                            |
| ----------------------------- | ------------------------------------: | ------------------------------------------------------------------ |
| stable runOp1 checkpoint      |                       2,375,274 bytes | `571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8` |
| model training                | 17,154,270 bytes / 20,123行 / 1,725親 | `f6dcfd6a7ca0b42e730ba0aff46394bf61e772a9b01270c5bfe126daf81c6e26` |
| model selection               |     3,319,397 bytes / 3,912行 / 341親 | `97b15ba1ee780009986b5e8210cbfdbfc181f93555b7c1a87f4a6a585b7bb5ba` |
| sibling teacher manifest      |                           4,895 bytes | `3381e238d722751a73f50e3e89c332ce7344e443e588ea061946cec4e2d4cecc` |
| validation partition manifest |                           5,357 bytes | `d95e66239dbf2dcf3979f4cf52a5ed666922f808f82b35aff4ccefc95c0d8ee1` |
| legacy replay source          |                                     — | `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb` |
| replay exclusion ID file      |                                     — | `1cddfa87218de7c0752acfd6d238d3581103a6051e7f17bf54256bee2586ce5a` |

runtimeも3 manifestで一致した。

| 項目                     | 値                            |
| ------------------------ | ----------------------------- |
| CPU                      | Apple M4 Pro、14 logical CPUs |
| device                   | CPU                           |
| Python                   | 3.13.0                        |
| PyTorch                  | 2.12.1                        |
| torch threads / interop  | 2 / 1                         |
| deterministic algorithms | true                          |
| deterministic debug mode | error                         |

result manifestは環境identityを固定しているが、run全体のwall-clock秒は記録していない。したがって、ここでは経過時間を後付けで推定せず、保存されたruntimeだけを報告する。

---

## 4. 学習は正常に収束した

3 runとも20 epochを完了し、combined task lossは約1.00から約0.647まで下がった。

| seed | epoch 1 combined / float / STE   | epoch 20 combined / float / STE  |
| ---: | -------------------------------- | -------------------------------- |
|   42 | `1.000488 / 1.002071 / 0.998905` | `0.647379 / 0.647099 / 0.647658` |
|   43 | `1.000453 / 1.002026 / 0.998880` | `0.647199 / 0.646760 / 0.647639` |
|   44 | `1.001134 / 1.002752 / 0.999517` | `0.646645 / 0.646287 / 0.647003` |

「lossが下がった」は学習processが動いた証拠であって、未知局面や対局で強くなった証拠ではない。またseed 44のfinal lossが3 seed中最小でも、代表選択はlossではなく事前登録したint16 metricsの順位で行う。

candidateとresult commit markerのidentityは次のとおりである。

| seed | `final.pt` bytes | checkpoint SHA-256                                                 | `result.json` SHA-256                                              |
| ---: | ---------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
|   42 |        2,383,313 | `2a643831d1a00cb062150fce25d98aca7b773cc82169a903152a8f855c325ac9` | `64a0c43727ba137462885f8e08e5753148327ea8432a51c0f23ff2b7a82398e3` |
|   43 |        2,383,313 | `2160926e71eee03aaf6038e08699a4bbf907f88aeafe55e6ac7757a18b45924d` | `6cd7f878fb514328911c54d88ebe967efca02a345e9b34fb05d9fa170f86f942` |
|   44 |        2,383,313 | `6497c81309a5e1273d2d9c013a4cdfe97923e05762e150986309bd8b789c42fb` | `e6cf4e89f027bcf3c454822baef6db615d9b3d1e18e8d2dc7a04ed50e8f39080` |

---

## 5. one-shot selectionの実測

### 5.1 全seedでint16 pairはstableを上回った

[selection audit](../ml/protocols/wcsc36-int16-aware-selection-audit.json)に埋め込まれた同一reportの主要metricは次のとおりである。
audit自体は29,616 bytes、SHA-256は`aab9a6fdb49e4d393ca11132671d5aa433b9a208bfafeaa031f3e9554b148737`である。

| model   |     float pair |     int16 pair |    float top-1 |    int16 top-1 | int16 MAE cp |
| ------- | -------------: | -------------: | -------------: | -------------: | -----------: |
| stable  | `0.6062568819` | `0.6048966902` | `0.2697947214` | `0.2668621701` |   `496.8903` |
| seed 42 | `0.6096249757` | `0.6071636764` | `0.2727272727` | `0.2727272727` |   `488.9024` |
| seed 43 | `0.6105965412` | `0.6092363495` | `0.2609970674` | `0.2639296188` |   `490.2155` |
| seed 44 | `0.6107260833` | `0.6073579895` | `0.2668621701` | `0.2756598240` |   `485.3566` |

int16 pairのstable差はseed 42が`+0.0022669862`、seed 43が`+0.0043396593`、seed 44が`+0.0024612993`で、3 seedすべてがstrict improvementだった。int16 MAEも3 seedすべてstableより小さい。

これは今回の明確な前進である。ただし、MAEは4 gateに入っておらず、pair improvementも他gateの失敗を相殺しない。

### 5.2 seedごとの失敗は異なった

| seed | int16 pair > stable |           int16 top-1 ≥ stable           |   `abs(Δ pair) ≤ 0.002`    |   `abs(Δ top-1) ≤ 0.005`   |   4/4    |
| ---: | :-----------------: | :--------------------------------------: | :------------------------: | :------------------------: | :------: |
|   42 |        pass         |                   pass                   | **fail** (`-0.0024612993`) |   pass (`0.0000000000`)    | **fail** |
|   43 |        pass         | **fail** (`0.2639296188 < 0.2668621701`) |   pass (`-0.0013601917`)   |   pass (`+0.0029325513`)   | **fail** |
|   44 |        pass         |                   pass                   | **fail** (`-0.0033680938`) | **fail** (`+0.0087976540`) | **fail** |

- **seed 42**：stable比較のpair/top-1は両方通った。しかしfloatからint16へ移すとpairが`0.0024612993`下がり、上限`0.002`を超えた
- **seed 43**：2つの量子化差gateは両方通った。だがint16 top-1がstableより`0.0029325513`低く、static quality gateに落ちた
- **seed 44**：pair/top-1のstable比較は両方通ったが、量子化でpairが`0.0033680938`下がり、top-1が`0.0087976540`動いた。方向がよくても絶対差の安定性gateは免除しない

pairを第一metricにしたranked orderは`43 → 44 → 42`であり、median-ranked representativeはseed 44である。seed 42のほうが4 gate中3つを通っていても、失敗後に代表へ差し替えない。

### 5.3 family gateは3条件ともfalse

| family条件                         |         実測 | 判定 |
| ---------------------------------- | -----------: | :--: |
| 代表seedが4/4                      | seed 44は2/4 | fail |
| 少なくとも2 seedが4/4              |          0/3 | fail |
| 全3 seedが両方の量子化差gateをpass |  seed 43のみ | fail |

auditの最終状態は次のとおりである。

```text
status: static_selection_fail
production_promotion_authorized: false
final_holdout: not_opened_by_this_command
```

---

## 6. 何が改善し、何がまだ足りないのか

今回のint16-aware objectiveは、前回の主要な問題だったproduction int16のpair qualityを一方向へ押した。3 seed全部がstableを上回ったため、単一seedだけの偶然よりはよい兆候である。float/int16のvalue MAEもstableより小さかった。

一方で、次の問題は残った。

- pairの量子化差を上限内に収めたのはseed 43だけだった
- seed 43は量子化差を守れても、int16 top-1がstableを下回った
- 代表seed 44はint16 top-1自体は高いが、その値がfloatから大きく動いており、再現性を狙った差gateに落ちた
- 4/4 passが0/3なので、「int16-aware familyとして安定した」とは言えない

つまり、exact int16 branchを足すという方向はpairには効いたが、pairとtop-1を量子化前後で同時に安定させるには足りなかった。ここから同じselectionを見ながらweightやlearning rateを調整すれば、その4局へ適応するだけになる。

---

## 7. final holdoutとproductionはどうなったか

3つのtraining resultは`selection_labels_read: false`、`selection_evaluations: 0`を記録している。3 run完了後のauditだけがselectionを読み、そこでfailした。

final holdoutについてauditが記録したのは`not_opened_by_this_command`だけであり、label metricは存在しない。static gateに落ちたcandidateへholdoutを使って「実はよかった」と救済することもしない。

したがって、以下は未実施である。

- sealed final-holdout evaluation
- general / opening retentionと既知回帰suite
- production int16 search / browser verification
- 384局のpreregistered paired A/B
- 外部のhigh-dan rating evidence

production promotionはauthorizeされず、stable runOp1 checkpoint SHA-256 `571ca309…65ff8`を継続する。現在の正確な答えは、**pair qualityには前進があったが、評価関数はまだ高段levelへ更新されていない**、である。

---

## 8. PRとレビューで固定したこと

実験コードと事前登録は、結果runより先にPR #408へ分離した。そこではexact int16 reference / STE、plan binding、replay exclusion、final-only training、3-run preflight、one-shot selectorを同時にreview可能にした。

reviewでは主に2種類の懸念を確認した。

- first-layer accumulatorを毎加算後にint32 range checkするのは重いのではないか
- PyTorch schedulerの`step()`位置が、事前登録した20 epochのcosine列と1 epochずれるのではないか

前者は、productionがsigned int32で逐次加算する以上、最終和だけでなく途中prefix overflowも意味を持つため、per-addition checkを維持した。後者は固定runtimeのPyTorch 2.12.1で20 epoch列を検証した。どちらも口頭説明だけにせず、prefix overflowとscheduler列のregression testを追加するcommit `7a6a8ba`で固定してからmergeした。

そのmerge commit `753f90a…212`を3 runとauditのsource revisionにしたため、結果を見たあとにtraining/selector実装を差し替えていない。

---

## 9. 次にやること — freshな強いデータからやり直す

今回のfailure policyは明示的である。

- fail後にseedを追加しない
- seed 42 / 43 / 44から都合のよい1つを選び直さない
- 同じselectionを見ながらreplay ratio、learning rate、epoch数を調整しない
- fail candidateのfinal holdoutを開かない
- 次はfresh development dataを結んだnew planにする

次の一手は、今の3 checkpointを上書き学習して救うことではない。強い実戦棋譜から新しい親局面を増やし、各siblingを独立探索した教師をfreshに作る。特に、候補手の差が小さい局面、現行stableと深い教師が食い違う局面、序中終盤の偏りを抑えた局面を増やす。ただし、どの局面を使うか、探索budget、試行family、seed数、判定gateは新しいdevelopment labelを見る前に固定する。

実行順は次のとおりである。

1. 新しい強い棋譜・局面からteacher datasetを作り、現在のselectionとは別のfresh development splitをsealする
2. exact int16でpairとtop-1を同時に保つ新しいobjectiveを、結果を見る前に1 familyだけ事前登録する
3. 固定seedを完走し、全result marker確認後にone-shot selectionを行う
4. static family gateを通った場合だけsealed final holdout、retention、既知回帰、production browserへ進む
5. さらに384局paired A/Bと外部high-dan evidenceまで通って初めて「安定して高段」を主張する

今回の3 seedは捨てた計算ではない。exact int16を学習へ入れるとpairは3/3でstableを超える、しかし現行data/objectiveでは量子化差とtop-1が安定しない、という次のplanを絞る証拠になった。productionへ載せるには、その兆候ではなく、fresh dataで再現した合格結果が必要である。
