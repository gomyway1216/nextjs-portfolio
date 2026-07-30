# direct-teacher HalfKP81 v3：MPS失敗をCPU固定の新しい一回だけの実験へ分離する

> 2026-07-29、v3は固定CPUで正式な1 epochを完走した。200,944行を99 batch、7.917秒で学習し、9個のstatic gateのうち8個は通った。しかし、量子化後の最大CP差比率が上限1.05に対して1.1732だったため不合格となり、このfamilyは閉じた。56局は0、live weightは変更していない。[English](./blog-shogi-direct-teacher-halfkp81-v3-cpu-successor.en.md)

## v2で何が起きたか

v2は新しい評価関数を作る前に停止した。one-shot claimを取得し、初期値を81-bucket形式へexportした後、optimizer作成前のinitializer baseline inferenceでMPSが `aten::_embedding_bag` を実行できなかった。

| v2の実測 | 値 |
|---|---:|
| optimizer作成 / step | 0 / 0 |
| 学習batch / 行 | 0 / 0 |
| candidate weight | なし |
| 棋力観測 | なし |
| live weight変更 | 0 bytes |

したがって、v2の結果から「この教師データでは強くならない」とも「強くなる」とも言えない。学習が始まっていないためである。一方、消費済みclaimを削除して同じv2を再実行するのも禁止する。技術停止を別の学習結果のように扱わず、旧出力を保存したまま閉じる。

## v3で変えるもの、変えないもの

v3がv2から変える学習条件は `device=mps` から `device=cpu` の1項目だけである。

- 同じtrain 200,944行、validation 22,890行をコピーも再生成もせずmetadataだけで再bindする
- 同じinitializer、seed 42、batch 2048、AdamW、learning rate `3e-6`、weight decay 0、1 epochを使う
- direct scalar BCE、K=600、CP clamp=3000、全parameter更新を維持する
- 9個のstatic gateと、28 opening pair・56局・62/112 half-pointsの判定を変えない
- v2 terminal receipt、v3 protocol、metadata manifest、execution plan、CPU probeを別schemaと別SHAで結ぶ
- claimは新しい `.direct-teacher-halfkp81-v3-cpu-one-shot-claims` namespaceに作り、v2 claimへ触らない

これは「CPUにすれば強くなる」という仮説ではない。CPU固定で確認できるのは、同じ計算を実行可能か、そして再現可能かだけである。棋力は1 epoch後のstatic gateと56局で初めて観測する。

## claimより前に行う実CPU probe

入力、dataset ID、initializer architecture、全parameterの有限性を照合した後、claim作成より前にseed 42の最初の2,048行を使う。initializerの独立copyを2個作り、それぞれCPUでforward、direct BCE、backwardを実行する。

probeは次をすべて要求する。

- output、loss、全parameter gradientが有限
- 2回のoutput SHA-256が一致
- 2回のgradient SHA-256が一致
- optimizerを作らない
- parameter stepを行わない
- 棋力metricを作らない

どれか一つでも失敗すればv3 claimは作られない。probeが通って初めて、新execution-plan SHAに対応するcreate-only claimを1個だけ作れる。

## 実データread-only preflight

正式terminal receiptを待つ間、claimも成果物も作らないpremerge検査として、実際の200,944行と固定initializerを新しいprobe実装へ入力した。

| 項目 | 実測 |
|---|---:|
| dataset照合・tensor化 | 7.929秒 |
| 独立2-run forward+BCE+backward | 0.541秒 |
| 全体 | 8.986秒 |
| peak RSS | 2,294,382,592 bytes |
| output SHA一致 | yes |
| gradient SHA一致 | yes |
| optimizer / step | 0 / 0 |

output SHA-256は `64ff6dc816d491d8fd5c055b537e7cee62d0c38a75b370c86a3f4f3dd0deb1de`、gradient SHA-256は `b43290206b6327e9ddcc2c49cfb20dcbc452df550273694956756a0ec0dd0681` だった。この結果はCPU技術能力の観測であり、正式execution receiptでも棋力証拠でもない。実測値は [`docs/data/shogi-direct-teacher-halfkp81-v3-cpu-preflight-2026-07-29.json`](./data/shogi-direct-teacher-halfkp81-v3-cpu-preflight-2026-07-29.json) に記録した。

## 正式実行の結果

実装とv2 terminal receiptがmainへ入った後、cleanなmain revision `1f5e4a4a`から正式v3を一度だけ実行した。metadata rebindはtrainとvalidationの合計223,834行を読み直し、game、parent、position、child position、semantic positionの5集合すべてで交差0を確認した。JSONLのコピー・再生成・hard linkは0である。

正式CPU probeはpreflightと同じoutput SHA、gradient SHAを2回連続で再現し、optimizerを作る前にPASSした。その後にだけv3 claimを取得し、固定された1 epochを実行した。

| 学習実測 | 値 |
|---|---:|
| train rows / batch | 200,944 / 2,048 |
| optimizer batch・step | 99 / 99 |
| epoch時間 | 7.917秒 |
| train direct scalar BCE | 0.6786804361 |
| validation rows | 22,890 |
| candidate checkpoint | 191,659,516 bytes |
| candidate weights | 94,656,708 bytes |

static gateは次の結果になった。

| static check | 実測 | 基準 | 結果 |
|---|---:|---:|---|
| finite training / inference | true | true | PASS |
| technical faults | 0 | 最大0 | PASS |
| float export mismatch | 0 | 最大0 | PASS |
| WASM parity mismatch | 0 / 512 | 最大0 | PASS |
| teacher MAE改善 | +8.0133 CP | 最低+5 CP | PASS |
| pair accuracy差 | +0.0000972 | 最低-0.002 | PASS |
| 量子化mean CP差比率 | 1.001686 | 最大1.05 | PASS |
| 量子化max CP差比率 | 1.173216 | 最大1.05 | **FAIL** |
| runtime slowdown | 2.4955% | 最大5% | PASS |

唯一の失敗は、量子化で生じた最悪1点のCP差がinitializer比で17.32%増えたことだった。平均の量子化差、WASM parity、runtime、teacher MAE、pair accuracyは通った。ただし、teacher MAEとpair accuracyはvalidation上の代理指標であり、対局棋力そのものではない。事前登録した9/9条件を1個でも外したため、候補を56局へ送らず、v3を「強くなった」とは扱わない。

正式結果と全artifact identityは [`docs/data/shogi-direct-teacher-halfkp81-v3-cpu-result-2026-07-29.json`](./data/shogi-direct-teacher-halfkp81-v3-cpu-result-2026-07-29.json) に固定した。

## 終了状態と次の有効な分岐

| 工程 | 最終値 | 権限 |
|---|---:|---|
| v3正式probe | PASS、2 / 2 hash一致 | claim取得済み |
| v3学習 | 1 epoch、99 steps | 完了、再実行禁止 |
| static gate | 8 / 9 PASS | family closed |
| paired screen | 0 / 56局 | 未許可 |
| expanded stage | 0局 | 未許可 |
| live weight変更 | 0 bytes | 禁止・byte exact不変 |

同じv3のseed、epoch、learning rate、閾値を事後変更して再実行しない。次に試す価値があるのは、別familyとして量子化後の最大外れ値を直接抑える学習方法を事前登録することである。候補にはquantization-aware fine-tuning、量子化rangeの正則化、またはexport前clippingのいずれかがある。まず固定validation上で「teacher MAE改善を保ちながらmax CP差比率を1.05以下にする」という技術仮説を新しいplanへ固定し、その結果だけがstatic 9/9を通った場合に56局へ進める。
