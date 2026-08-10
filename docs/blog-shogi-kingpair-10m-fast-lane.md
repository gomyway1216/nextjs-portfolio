# Dual-perspective KingPair NNUE — 10M fast lane

> この文書は、1週間以内に現productionを統計的に上回る正式候補を作れるか判定するための
> **実行計画**である。過去候補の詳細は[postmortem](./blog-shogi-ai-20260808-postmortem.md)、
> 採否とartifact SHAは[研究台帳](./blog-shogi-ai-research-ledger.md)へ分離する。

## 1. 目的と非目的

目的は、dual-perspective KingPair interaction NNUEを10M unique teacher rowsでscratch学習し、
固定時間のpaired matchで現productionより強いかを7日以内に判断することである。

この1週間でAoba 500ms級へ到達するとは主張しない。10M候補が有望かを確定する前に50M生成へ
数か月を使わず、使えないarchitectureを早く、しかしproxyだけで誤判定せず止める。

## 2. なぜ前回と同じ失敗にしないか

| 前回の失敗 | 今回の制御 |
|---|---|
| 1.58M mixed corpusを24M modelへ入れ、教師差をaggregateした | 10M unique rows、旧lineage上限20%、domain別metricを固定する |
| bootstrapの悪い表現を引き継ぐ危険 | 同じseedでscratch再初期化し、bootstrap checkpointは読み込まない |
| 無関係な局面間のrandom ranking | 同じparent・同じteacherの兄弟手にだけranking lossを掛ける |
| static改善を実戦改善とみなした | staticはreject-only。採用はformal768だけ |
| freshへ合わせてbrowser/v9を忘れた | fresh Aoba、fresh Yaneura、browser、v9を独立holdoutにし、一つでも回帰すれば止める |
| 学習後にruntimeが重いと判明 | 未学習weightでWASM skeletonの速度を先に測る |
| 行数だけを数えた | unique parent、semantic position、game/domain比率もmanifestへ記録する |
| 小型headを次々追加した | 候補は本体architecture一個。FAIL時の第二候補もmaterially differentな本体一個まで |
| provenance整備が実workを遅らせた | corruptionを防ぐ最低限のshard/SHA/atomic publishだけ実装する |

## 3. 固定architecture

- 2 perspectives、それぞれHalfKP 128 lanes。
- `us`、`them`、`us - them`、`us * them`を明示的に結合する。
- relative king 17x17 interactionを持つ。
- parametersは23,992,849。
- dense workは1評価40,000 MAC以下。
- 合法手、alpha-beta、TT、pruning、move ordering、時間管理は変更しない。
- Aoba/Yaneuraのコード・重みは取り込まず、評価ラベルだけを使う。

architectureを学習後に縮小・拡大しない。runtime budgetを満たせなければ、このslotはFAILである。

## 4. データ契約

### 4.1 Training

| source | unique rows | 役割 |
|---|---:|---|
| runOp1 production-lineageからの固定uniform sample | 2,000,000 | 既存value知識の保持。上限20% |
| fresh AobaNNUE depth12、MultiPV4、exact-only | 8,000,000 | fresh sibling orderingと旧lineage依存からの脱却 |
| 合計 | 10,000,000 | 固定、追加や削減なし |

runOp1の5,892,192 rowsを全再利用しない。既知invalid 2,239 rowsを除外した5,889,953 rowsから、
内容に依存しないhashで2,000,000 rowsをuniform選択する。残りを不足分の穴埋めへ使うことも禁止する。
これは、現productionを作ったラベルが過半を占め、旧評価の上限を再学習する経路を切るためである。

fresh Aobaは2,000,000 unique parentを最大4 siblingsへ展開して8,000,000 exact rowsを作る。
source positionは`fresh-selfplay`、`browser-confusion`、`public-floodgate/WCSC`などに分け、
単一domainを40%以下にする。候補手が4未満のparentは実数を使い、不足をduplicateで埋めない。
最終的に8,000,000 unique rowsへ届かなければdata admission FAILとする。trainとは別にholdoutを生成し、
parent、semantic position、game identityが交差しないようにする。

各epochの学習露出もlegacy/freshを20:80に固定する。5 batchを一単位に、legacyを
`205, 205, 205, 205, 204` rows、freshを残りへ入れるため、5,120 exposures中legacy 1,024、
fresh 4,096となる。2 epochとも全unique rowを一度ずつ見る。旧lineageをデータでも勾配でも20%に
抑えるので、「589万を再利用したから旧モデルの上限へ戻った」という交絡を残さない。

### 4.2 Holdout

- fresh Aoba depth12 exact: 最低100,000 rows。
- fresh YaneuraOu depth16 exact: 最低20,000 rows。trainingには使わない。
- browser confusion sealed validation。
- v9 sealed validation。
- production value preservation validation。
- 既存の人間実戦/hard24 critical positionsはbehavior regressionとして別集計する。

holdoutを見てrecipe、epoch、seed、architectureを変更しない。holdoutは候補の選択ではなく、固定した
1候補を棄却するためだけに使う。

## 5. 学習前に止める条件

### 5.1 Data admission

- schema、teacher binary/eval SHA、depth、MultiPV、exact/faultを全rowで検証する。
- train/holdoutのparent、semantic position、可能ならgame overlapを0にする。
- sourceごとのrow、parent、game、phase、mate/bound/rejectをmanifestへ記録する。
- cross-source duplicateは一つのsplitへ束ね、同じ局面をtrainとholdoutへ置かない。

### 5.2 Discarded sentinel

本学習と同じcodeで、固定65,536 rowsのsentinelを一度だけ実行する。weightは破棄し、本候補のinitializerへ
使わない。finite、loss低下、same-parent pair改善、checkpoint round-tripを確認する。これはrecipe選択ではなく、
符号、perspective、grouping、optimizer配線の破損検出である。

### 5.3 旧lineage依存を調べるdiscarded ablation

最終holdoutとは別のdevelopment splitで、legacy-only、fresh-only、固定20:80 mixの3 armを各131,072 rows、
同じstep数で学習する。全weightを破棄し、最終候補のinitializerに使わない。比率探索は行わず、20:80 mixが
fresh developmentでlegacy-onlyより最低5cp良く、legacy developmentでlegacy-onlyから10cp超悪化しないことを
10M生成・学習のgo条件にする。FAIL時は比率を動かさず、data/label仮説のFAILとしてslotを止める。

このablationは「どの比率が一番良いか」を選ぶmodel selectionではない。ユーザーが指摘した旧589万の
悪影響を、本学習前に反証できるか確認する一度限りの因果診断である。

### 5.4 Runtime skeleton

ランダムまたはzero output weightで、学習と並行してexport/WASM evaluatorを完成させる。weight値に依存しない
feature更新、payload size、MAC、500ms探索slowdownを先に測る。production比+5%を超えるarchitectureは、
10M学習完了を待たずFAILとする。

## 6. 固定学習contract

- initializer: scratch、seed `20260810`。
- epochs: 2。
- batch: 1,024。5 batch単位でlegacy 1,024 + fresh 4,096、露出比20:80。
- optimizer: AdamW、learning rate `5e-5`、weight decay `1e-5`。
- value loss: row単位SmoothL1。source別に集計し、aggregateだけで判断しない。
- ranking loss: same parent、same teacher、50..600cp gapの兄弟手だけ。
- cross-parent、cross-teacher pairは禁止。
- best checkpoint selection、追加seed、epoch延長、holdout後の係数変更は禁止。
- epoch 2の固定finalだけを候補にする。

## 7. Gateの意味

### 7.1 Static gate — 対局を許可するだけ

- 全domain finite。
- weighted MAEはproductionより最低10cp改善。
- fresh Aoba sibling pairは最低+0.5pp、top-1非回帰。
- fresh Yaneura、browser、v9 sibling pairは最低+0.2pp、top-1非回帰。
- production preservation MAE/lossは非回帰。
- 一つのdomainの改善で別domainの回帰を相殺しない。

Static PASSは「強い」ではない。screenを実行してよいという意味だけを持つ。

### 7.2 Runtime gate

- Python float、quantized payload、AssemblyScript/WASMの出力parity。
- clipping、overflow、NaNは0。
- NNUE buckets 1/6/81、random make/unmake、full recompute/differential parity。
- fixed-work deterministic、全合法手、fault fallback。
- 500ms探索slowdownはproduction比+5%以下。
- 100ms色替え2局smokeは全手合法、fault 0。

### 7.3 Strength gate

1. screen56: 62/112 half-points以上、fault 0。
2. independent96: 完全分離panelで106/192以上、fault 0。
3. formal768: 完全分離384 pair、paired bootstrap lower 95% > 50%、fault 0。

早期PASSは行わない。formal PASSだけがproduction昇格を許可する。

## 8. 失敗時の分類

| failure | 意味 | 次の行動 |
|---|---|---|
| sentinel FAIL | data/model配線のtechnical defect | 原因を直してsentinelだけ再実行。本候補学習は未開始 |
| runtime skeleton FAIL | architectureがブラウザbudgetに不適合 | 同slot終了。学習で解決しない |
| 全domain static FAIL | dataまたはrepresentationが根本不足 | 対局せず終了 |
| freshのみ改善、旧domain回帰 | catastrophic forgetting | 同じweightsを調整せず終了。第二architectureは分離表現を使う |
| static PASS、screen FAIL | proxy-to-play接続不良 | dataを増やさず終了。探索接続を疑う |
| screen/independent PASS、formal FAIL | sampling noiseまたは効果不足 | 2-way TTと同じく不採用。閾値を緩めない |
| formal PASS、browser FAIL | deployment/runtime差 | productionを変更せず終了 |

FAILのたびにheadやlossを足さない。原因分類が第二候補の仮説へ直接つながらない場合、1週間slotを終了する。

## 9. 7日スケジュール

| 日 | 実work |
|---|---|
| Day 1 | protocol/test固定、compact shard generator、runtime skeleton、discarded ablation開始 |
| Day 1–3 | fresh Aoba 8,000,000 rowsとholdout生成。Yaneura holdoutを別workerで生成 |
| Day 3–4 | data freeze、discarded sentinel、10M scratch 2 epoch学習 |
| Day 4 | quantization、WASM parity、slowdown、smoke |
| Day 5 | screen56、PASSならindependent96 |
| Day 5–6 | formal768、PASSならbrowser production parityと昇格 |
| Day 6–7 | 第一候補がformal前にFAILした場合だけ、固定10M corpusで第二の本体architectureを1個評価 |

CPU teacher、shard validation、runtime実装は並行する。学習はMPSを使うが、teacher CPUを飽和させて
学習preprocessingを妨げる場合はworker数を一時的に減らす。並列度は仕事量ではなく実測rows/secで決める。

## 10. 成果物

- machine protocol: `ml/protocols/kingpair-interaction-nnue-10m-fast-v1-plan.json`
- compact training shardsとmanifest: `~/.codex/shogi-runs/`、create-only
- fixed final checkpoint、quantized payload、runtime report、各match result
- 最終採否: [研究台帳](./blog-shogi-ai-research-ledger.md)へ別commit

production assetはformalとbrowser gateが完了するまでbyte-exactで維持する。
