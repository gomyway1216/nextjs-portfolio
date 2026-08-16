# DPA-HalfKP96 NNUE — 10M fast lane

この文書は現在実行中の候補だけを説明する。過去の失敗理由は
[postmortem](./blog-shogi-ai-20260808-postmortem.md)、artifact SHAと最終採否は
[研究台帳](./blog-shogi-ai-research-ledger.md)、コードが読む固定値は
[machine protocol v2](../ml/protocols/dpa-halfkp96-nnue-10m-fast-v2-plan.json)を正本とする。v2で追加する
holdout除外、旧lineage上限、7日停止判断は[再発防止メモ](./blog-shogi-ai-dpa-10m-v2-failure-controls.md)へ分離する。

## 目的

1週間以内に「Aoba 500ms級」を約束するのではなく、現productionを別panel formal 768局で
統計的に上回る自作評価関数を一つ作り、採用か不採用かまで決める。Aoba/YaneuraOuは評価ラベルと
比較相手に限り、コードや重みはコピーしない。

## なぜ旧KingPairを学習しなかったか

旧24M KingPair interactionは、zero-outputでproductionと完全に同じ探索木を作っても226.5%遅く、
500msの探索workが29.38%しか残らなかった。数日学習した後に速度で捨てる失敗を防ぐため、10M学習を
始める前に終了した。生成済み教師ラベルは局面とCPの組なので、新しい本体へそのまま使える。

## 固定した評価本体

- HalfKP81 feature tableを両視点で共有する96 lane NNUE。
- `us`と`them`を別々にincremental更新し、出力は
  `w · (clip(us) - clip(them))`だけで求める。
- 17,744,928 trainable parameters。auxiliary head、積特徴、dense interaction trunkは持たない。
- first-layer biasとscalar output biasを学習しない。視点交換で必ず符号が反転する。
- 合法手、alpha-beta、TT、pruning、move ordering、500ms契約は変更しない。

これは既存NNUEへ小型headを足す候補ではない。評価本体をscratchから置き換える候補である。

## 学習前runtimeの実測

zero-output payloadで64局面のbest move、score、depth、nodes、leavesをproductionと完全一致させ、
評価構造のcostだけを測った。

| 指標 | 結果 | 条件 |
|---|---:|---:|
| fixed-work一致 | 64/64 | 全一致 |
| production平均 | 890.069ms | 参照 |
| DPA-HalfKP96平均 | 887.053ms | +5%以内 |
| slowdown | -0.339% | PASS |
| 500ms探索work比 | 1.00737 | 0.95以上 |
| incremental/full mismatch | 0 | 必須0 |

これは速度適合の証明であって、棋力向上の証明ではない。棋力は学習後の対局だけで決める。

## データ契約

合計10M unique rowsを固定する。

| arm | rows | 目的 |
|---|---:|---|
| runOp1からのuniform semantic sample | 2,000,000 | 既存value知識の保持。全体の20%を超えない |
| fresh Aoba depth12 MultiPV4 exact | 8,000,000 | fresh sibling orderingと旧lineage依存からの脱却 |

legacy 2Mは589万行のprefixではなく、全sourceを走査してsemantic重複とlabel conflictを除外した
salted SHA-256 sampleである。manifest SHAは
`0588234ef6d2d26336faf75ca35fab655a897ac33791e52fedc6df7e2ab1a6d6`。

fresh 8Mはunused runOp1、public Floodgate/WCSC、fresh selfplay、browser training-onlyへ分け、
一つのposition domainを3.2M rows以下にする。Aobaの最終depth 12がbound/incompleteならラベルにせず
rejectする。trainとsealed holdoutのsemantic parent overlapは0にする。

## 固定学習recipe

- scratch seed `20260810`、2 epochs、batch 1,024。
- 各露出をlegacy 20% / fresh 80%に固定する。
- AdamW、learning rate `5e-5`、weight decay `1e-5`。
- value SmoothL1と、同じparent・同じteacherの50..600cp差だけのranking loss。
- 10M rowsをRAMへ一括loadしない。
- best checkpoint選択、追加seed、epoch延長、結果を見てからの係数変更は禁止。

## Gate

Staticは対局を許可するreject-only gateで、採用権限を持たない。domain別MAE、same-parent pair、top-1を
測り、一つのdomain改善で別domain回帰を相殺しない。量子化後はPython/WASM parity、overflow 0、
random make/unmake、slowdown +5%以内、2局smoke fault 0を再確認する。

強さは次の順番だけで判定する。

1. screen56: 62/112 half-points以上、fault 0。
2. independent96: 完全分離panelで106/192以上、fault 0。
3. formal768: 完全分離384 pairのbootstrap lower 95%が50%を超える。

早期PASSは行わない。formalとbrowser runtimeの両方を通った候補だけをproductionへ昇格する。

## 同じ失敗を防ぐ停止条件

- runtimeは学習前に通過済み。学習後も実payloadで再測定する。
- data不足をlegacy追加で埋めず、exact fresh 8Mへ届かなければ停止する。
- freshだけ改善してbrowser/v9を忘れた候補は対局前に停止する。
- staticだけ良い候補を「強い」と呼ばない。
- screen/independentの小標本が良くてもformalが再現しなければ不採用にする。
- FAILした同じarchitectureのseed、LR、epoch、閾値を動かして再試行しない。
- 支援コードを増やす前に教師生成・学習・対局の実仕事へ戻る。

## 実行順

教師生成、fresh自己対局、学習実装、量子化/runtimeを安全な範囲で並列化する。教師生成worker数は
CPU数ではなくexact parents/secとfault 0で決める。完成shardはcreate-onlyで保持し、障害時は未完だけを
再開する。10M freeze後は固定2 epoch、static/runtime、screen、independent、formalへ直進する。
