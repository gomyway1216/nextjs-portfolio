# 将棋評価関数の次工程：大型モデルで「そもそも学べるか」を先に判定する

> 現行AIはまだ強くなっていない。全合法手warm-startと70KB residualは静的ゲートで棄却され、ライブ重みは変更していない。次は同じ小型レシピを回さず、約595万パラメータのオフラインモデルで教師順位を学べるかを先に判定する。[English](./blog-shogi-capacity-policy-value-plan.en.md)

## 結論

新しいcapacity診断の実装と事前プロトコルを用意した。目的は高段を主張することではなく、次の分岐を短時間で決めることにある。

- 大型モデルでも訓練データを学べないなら、表現、損失、教師ラベルを見直して停止する
- 大型モデルが未見tuneでも明確に改善するなら、別seedで再現し、新しいsealed holdoutへ一度だけ進む
- そこまで通った場合だけ、小型NNUEへの蒸留、WASM試験、直接対局を検討する

本番 `public/shogi-nnue-weights.bin` は1,185,988バイト、SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc` のままである。

## なぜこの工程か

直前の2実験では、value誤差や一部pair指標は動いたが、全合法手から教師最善手を選ぶTop-1は改善しなかった。

| 棄却済み方式 | 規模 | Browser Top-1 |
|---|---:|---:|
| 現行NNUEの全合法手warm-start | 本番と同じ1,185,988バイト | 63/643 → 61/643 |
| 明示的residual policy | 35,307 parameters、量子化70,614バイト | 63/643 → 63/643 |

この結果から、同じ小さな器へepochやseedを追加する根拠はない。次の診断では配布サイズをいったん無視し、表現容量が原因だったかを直接調べる。

## 監査で新たに分かったこと

### 旧residualは35,307パラメータだった

新モデルは5,953,522パラメータで、旧residualの168.6倍である。fp32重みは22.71MiB、AdamWの重み・勾配・一次／二次モーメントを合わせても約90.84MiBなので、48GBのM4 Proでメモリは問題にならない。

### 元のfresh-final 200局を、そのまま完全sealedとは呼べなかった

4,800親・200局のfresh-final rawはまだ教師ラベルを生成していない。しかし、その後に数値を確認した既知評価集合とのsemantic overlapを調べると、59局・161親が交差していた。

ラベルを見ずに、既知局面へ1件でも触れるゲームを丸ごと除外したclean derivativeは次の通り。

| 項目 | clean derivative |
|---|---:|
| 局数 | 141 |
| 親局面 | 3,384 |
| raw bytes | 2,165,346 |
| raw SHA-256 | `d2285225aab6612506536931933410b8a285cc573c5bd6c8feabdd0fe7501626` |
| protected semantic IDs | 284,117 |
| 既知評価集合とのsemantic overlap | 0 |

候補を固定するまでは、この集合の教師ラベルを生成しない。

### 訓練側も既知評価とsealed候補を先に除外した

既知評価98,420 semantic IDs、fresh-selection、fresh-finalのprotected IDsを訓練より優先した。Browserを先に保持し、その後にV9とのcross-domain overlapも除いた。

| 分布 | 入力 | 保持 | 除外 | fit | tune |
|---|---:|---:|---:|---:|---:|
| Browser | 1,334親 | 1,071 | 263 | 875 | 196 |
| V9 | 23,980親 | 23,675 | 305 | 19,264 | 4,411 |

fit/tuneはゲームまたは親・子semantic IDを共有する連結成分単位で分割した。ゲーム重複、semantic overlap、Browser/V9間のsemantic overlapはいずれも0である。

## 新しいモデル

| 部分 | 設計 |
|---|---|
| 局面入力 | 手番側視点へ正規化した28駒平面＋14持駒平面＋1 ply平面 |
| 局面encoder | 64 channel stem＋6 residual blocks＋384次元global表現 |
| 指し手入力 | 移動元／移動先の空間特徴、駒種、成・捕獲・drop、玉との関係、現行live CP |
| 合法手集合 | 256次元、4層Set Transformer、8 heads、FFN 1024 |
| 出力 | 現行live CPへ加える非clip policy residualと、別のparent value |
| 総パラメータ | 5,953,522 |

合法手には順番の意味がないため、Set Transformerへ位置embeddingは入れない。padding maskを必須にし、候補順を入れ替えても同じ指し手が同じscoreを得ることをテストした。

損失は親局面を等重みにしたlistwise policyを中心に、50cp以上のpair、最善手margin、各指し手のQ回帰、親局面value回帰を組み合わせる。Top-1に関係しないvalue改善だけで通らないよう、合否は別に固定した。

## 3段階の停止ゲート

### 1. 過学習sentinel

保持fitからparent ID順で固定したBrowser 256親とV9 1,024親を40 epoch学習する。両分布でTop-1 85%以上、pair 98%以上が必要である。

ここを通らなければ、モデルが一般化しない以前に、実装または表現が教師問題を学べていない。sentinel重みを捨て、本学習を開始しない。

### 2. 既知ではあるが学習に使わないtune

live baselineはoptimizer作成前に固定した。

| tune | live Top-1 | live pair | candidate要件 |
|---|---:|---:|---|
| Browser 196親 | 16/196（8.16%） | 0.663704 | 26/196以上、pair 0.673704以上、regret悪化なし |
| V9 4,411親 | 1,078/4,411（24.44%） | 0.598464 | Top-1低下0.5pt以内、pair低下0.002以内 |

seed 42が全項目を通った場合だけseed 314159を同じ条件で実行する。追加seed、追加epoch、閾値変更はしない。

### 3. 新しいsealed all-legal holdout

両seedのcheckpoint SHA-256を固定した後だけ、clean derivativeから128局以上へ分散する決定的な512親を選び、全合法手を同じdepth-12教師で独立再評価する。

両seedとも、live比Top-1 +26親、pair +0.01、NDCG@5 +0.01、片側McNemar `p≤0.05`をすべて満たす必要がある。失敗すれば蒸留や本番統合へ進まない。

## Macをどう使うか

Browserは平均83.97手・最大267手、V9は平均11.62手・最大13手で、同じbatchへ混ぜるとpaddingが無駄になる。両分布を別microbatchにし、候補数を16/32/64/96/128/192/272へbucket化する。

M4 Pro上で同じMPS GPUへ複数の学習processを重ねると、統合メモリとGPUを奪い合って遅くなる。重い学習は1本にし、データ監査、テスト、記事、PR確認をCPUとサブエージェントで並行する。実装前見積りは8 epoch相当で20〜60分、sentinelと16 epochの本学習を含むseed 42全体は実測benchmark後に更新する。

## 現在地

- 実入力のoptimizer前audit：完了
- 5,953,522 parameterモデル：実装済み
- permutation、padding、live初期一致、損失、tiny fit、canonical ID、分割、ゲートのテスト：実装済み
- MPS forward/backward/optimizer smoke：成功（初回graph compile込み4.28秒）
- MPS本学習：プロトコルと実装のPRを固定してから開始
- sealed教師生成：未開始
- WASM、対局、ライブ重み変更：未開始

この順序は安全手続きのためだけではない。短いsentinelで学べない仮説を先に捨て、数日規模の教師生成を、内部tuneを通った候補にだけ使うためである。

機械可読の入力hash、分割レシート、baseline、モデル、ゲートは [shogi-capacity-policy-value-plan-2026-07-26.json](./data/shogi-capacity-policy-value-plan-2026-07-26.json) に記録した。
