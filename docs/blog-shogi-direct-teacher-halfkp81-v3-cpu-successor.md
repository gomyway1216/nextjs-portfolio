# direct-teacher HalfKP81 v3：MPS失敗をCPU固定の新しい一回だけの実験へ分離する

> 2026-07-29時点で、v2は学習前のMPS演算エラーで技術停止した。optimizer step、学習行、candidate、棋力観測はすべて0である。v3は旧v2を再実行せず、学習条件を変えずにdeviceだけをCPUへ固定する別系統である。実データのread-only CPU probeは通ったが、まだ学習も棋力向上も0で、live weightは変更していない。[English](./blog-shogi-direct-teacher-halfkp81-v3-cpu-successor.en.md)

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

## 現在値と次の順序

| 工程 | 現在値 | 権限 |
|---|---:|---|
| v2学習 | 0 batch / 0行 | 技術停止、再実行禁止 |
| v2 terminal receipt | 固定slot待ち | v3の必須入力 |
| v3 metadata rebind | 実装済み、未発行 | terminal後だけ |
| v3 execution plan | 実装済み、未発行 | rebind後だけ |
| 実データCPU preflight | PASS | claim・学習権限なし |
| v3 optimizer / epoch | 0 / 0 | merge・正式plan・probe後だけ |
| static gate | 0 / 9 | epoch後だけ |
| paired screen | 0 / 56局 | 9/9 PASS後だけ |
| live weight変更 | 0 bytes | 禁止 |

次はv2 technical-stop receiptを固定slotへ発行し、同じdataset bytesをmetadata-only rebindし、正式v3 execution planを作る。実装PRとCIがmergeされた後、そのplanで実CPU probeを再実行し、成功した場合だけ一回のclaimと1 epochへ進む。static gateまたは56局で失敗した場合は、後からseed、epoch、learning rate、閾値を変えて同じfamilyを延命しない。
