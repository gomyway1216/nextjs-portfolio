# v7 checkpointを意味的にvalidな24,000親で実測する

> [incremental checkpoint scanner](./blog-shogi-floodgate-v7-incremental-checkpoint-scan.md)は64 KiB read chunkと24,576-byte line bufferで、file sizeに比例するscanner固有bufferを除いた。しかし、前PRで実行した最大境界の検査はsparse fileであり、候補集合とHMAC chainを持つ意味的にvalidな24,000-parent streamではなかった。このPRはholdoutを使わないsynthetic parentだけでmerged test-only checkpoint coreを通し、stream bytes、digest、read上限、wall time、child process RSS、resume / final一致を実測する。real teacher label、production coordinator、学習、対局、棋力の証拠ではない。English version: [blog-shogi-floodgate-v7-valid-24k-scan-load.en.md](./blog-shogi-floodgate-v7-valid-24k-scan-load.en.md)

---

## 現在の結論

| 対象                      | 状態             | このPRで確かめること                         |
| ------------------------- | ---------------- | -------------------------------------------- |
| bounded test-only scanner | 実装・マージ済み | 既存`CoreForTests` entry pointを変更せず使う |
| 100 / 1,000 parent        | 予備実測済み     | fixtureと測定手順が動くことを確認            |
| valid 24,000 parent       | local実測完了    | 24,000親・429,244,881 bytesを再検証した      |
| real Floodgate labels     | 未実行           | timeout、key authority、coordinator後に行う  |
| weight / live環境         | 変更なし         | 現行weightをrollback baselineとして維持      |

## 1. 理論上限とvalid loadは別の証拠

checkpointの最大file sizeは589,897,154 bytesである。これは24,002行すべてが最大24,576 bytesになる保守的な拒否上限で、通常の24,000 parentがその大きさになるという予測ではない。

前PRはsparse exact-cap fileがbounded readへ進み、cap + 1 byteがread前に拒否されることを確かめた。この検査は巨大allocationを防ぐ境界には必要だが、JSON、canonical bytes、HMAC、親順序、candidate evidenceを全部検証する実際のscan costを測らない。

そこで今回は、各親が候補集合とrescore evidenceを持ち、headerから24,000 parent、sealまでmerged test-only state machineを通る別のfixtureを使う。理論上限と意味的にvalidなstreamを混ぜず、両方の証拠が何を保証するかを分ける。

## 2. holdoutを開かないsynthetic parent

fixtureは標準初期局面からrules-complete legal moveを決定的に選び、parent occurrenceを生成する。king captureへ至る状態とlegal moveが14未満の状態は除外する。採用する全親はnon-forcedで、proposal先頭12手、played move、stable moveを相互にdistinctにし、union builder自身が各親exact 14 candidatesをassertする。

これらはtest用game id、parent id、position id、runtime receipt、root keyから組み立てる。fresh selection、fresh final、legacy finalのpath、reader、keyはハーネスAPIにもchild processにも存在しない。real Floodgate rowも読まない。

件数を増やすために同じparent idを複製しない。各parentは一意で、training bindingのparent順とcheckpoint entryの`input_index` / `sequence`をtest-only coreのverifierが照合する。

## 3. 生成と検証を分離する

通常のcheckpoint writerはparentごとに`fsync`する。24,000回のsynthetic fixture生成でそれを繰り返すと、scannerではなくfixture作成のdisk latencyを長時間測ることになる。

専用の隔離childはfresh-build中だけwork fileの`FileHandle.sync`を無効化し、生成後にnative methodを必ず復元する。そのfresh receiptは耐久性証拠として採用しない。work fileとstage directoryを復元後にsyncし、生成childを終了する。

次に別のclean childを起動し、missing-parent producerが呼ばれたらthrowする条件で同じsealed fileを再開する。この実行はnative `fsync`と既存のtest-only incremental scannerを使い、`resumable-prefix` scan、sealed再利用、`sealed-final` scanを通る。つまり短縮措置が検証childへ残ることはない。

## 4. 同一bytesを三つのdigestで照合する

ハーネスはscanner receiptと、同じexternal streaming helperを別child / 別時点で使う次の3 observationsを得る。3つの独立暗号実装という意味ではない。

1. fresh-build後にfileから計算したdigest
2. resume receiptが返したwork digest
3. scanner外で独立にstreaming計算したdigest

三者が同じでなければfailする。外部stream counterのJSONL line数は`parents + header + seal`であり、receiptの`work.records`はparent数だけを表すので区別する。candidate数は各親exact 14、最大lineは24,576 bytes以下、read hookが観測する最大要求は65,536 bytes以下でなければならない。

resume時にproducer callが1回でも起きた場合もfailする。これは24,000親すべてが認証済みsealed streamとして再利用され、新しいsearchを要求していないことを示す。

## 5. RSSと時間の測り方

fresh生成とresume scanはchildを分け、OSが報告するprocess-lifetime peak RSS、checkpoint呼出し直前と直後の`process.memoryUsage().rss`、各policyのphase envelopeを記録する。ただしscan childも件数に比例するsynthetic training bindingを構築・保持するため、これらをscanner固有RSSとは呼ばない。

実行machineはApple M4 Pro、14 physical / logical CPU core、51,539,607,552 bytes RAM、macOS 15.1である。evidence生成とCI runtimeはNode v22.13.0へ固定する。

100、1,000、24,000 parentのchild RSSとfile bytesは運用上の観察値として並べるが、RSS比率をscanner固有memoryの合否には使わない。構造的な合否はread要求65,536 bytes以下、line 24,576 bytes以下、全fileを保持するscanner配列がないことに置く。Node heap、認証済みtraining rows、JSON一行のparse objectは残るため、「process全体がO(1) memory」とは主張しない。

## 6. 予備値と確定値を分ける

次は実装前prototypeの参考値であり、Attempt 3のacceptance evidenceではない。100と1,000のfile bytesも最終harness / sourceと異なるため、24,000確定表へ混ぜない。

| prototype parents | file bytes | prefix envelope ms | final envelope ms | child maxRSS (decimal MB) |
| ----------------: | ---------: | -----------------: | ----------------: | ------------------------: |
|               100 |  1,772,797 |                296 |               338 |                     148.6 |
|             1,000 | 17,956,845 |              3,050 |             3,155 |                     199.6 |

事前の単純比例予測は430,964,280 bytes、1 scan約73–76秒、全工程約7.2分だった。これは旧記事のone-fixture予測416,185,154 bytesより14,779,126 bytes、3.551%大きいfixture差による上方改定だった。Attempt 3の実測429,244,881 bytesは新予測より1,719,399 bytes、0.399%小さかった。予測は書き換えず、予測精度として差を残す。

## 7. 3回の試行を全部残す

完全なresultを得るまでに2回止まった。どちらも部分値を採用せず、発見とcleanupだけを記録する。

| attempt | source    |     wall | 結果                                                                                          | acceptance |
| ------: | --------- | -------: | --------------------------------------------------------------------------------------------- | ---------- |
|       1 | `d5eb700` |   4.05 s | game counter `60`を`00:00:60`としていたfixture timestamp defectをcanonical URL verifierが拒否 | 不採用     |
|       2 | `3ac84a6` |  82.81 s | 対応Node全体でtestを壊さないruntime-test compatibility修正のためoperatorがbuild childを停止   | 不採用     |
|       3 | `7844ea4` | 440.70 s | exit 0、strict result JSON、source不変、temp root 0                                           | 採用       |

Attempt 1はscannerへ到達していない。修正はcounterをHH / MM / SSへ分解し、0、59、60、3,599、3,600、86,399と86,400 rejectを回帰testへ固定した。Attempt 2もload failureではなく意図停止である。両runのRSS、途中bytes、時間をthroughputや24,000-parent resultへ使わない。どちらも終了後に新しい`floodgate-v7-scan-load-*` temp rootが0であることを確認した。

## 8. Attempt 3の確定証拠

raw recordは[監査JSON](../ml/protocols/floodgate-v7-valid-24k-scan-load-7844ea4-result.json)へ保存した。evidence fileのSHA-256は`7fc84e5e6168859d1bdcb0d352839725fe53a1dc8994ea34b7b44bb3b20eda58`である。

| identity        | 確定値                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------- |
| source commit   | `7844ea49f9e0326a5531824d7e356d6d51726d58`                                               |
| harness SHA-256 | `d1debecd249f70c36f5a0b72f653f1de1764f22022f7864fd1baa68a078485ff`                       |
| reproduction    | `npm run shogi:floodgate-v7-checkpoint-scan-load -- --parents 24000`                     |
| runtime         | parent / build child / scan childすべてNode v22.13.0、darwin arm64                       |
| machine         | Apple M4 Pro、physical / logical 14 core、51,539,607,552 bytes RAM、macOS 15.1 (24B2082) |
| lifecycle       | 2026-07-13 09:23:30 UTC開始、440.70秒、post-run verify 09:31:14 UTC、exit 0、temp root 0 |

finish timestampそのものはcaptureしていないため、開始時刻へ440.70秒を足して推定値を作らない。`09:31:14 UTC`は終了時刻ではなくsource / cleanupを再検証した時刻である。

| valid stream                                  |                                                             確定値 |
| --------------------------------------------- | -----------------------------------------------------------------: |
| parents / games / derived candidate instances |                                              24,000 / 67 / 336,000 |
| JSONL lines                                   |                            24,002 = header + 24,000 entries + seal |
| actual bytes                                  |                                     429,244,881 bytes (409.36 MiB) |
| actual / receipt / independent SHA-256        | `055e50c0f783894c4819e503574db4e45577ccac669d04408189f4e8ec781d13` |
| header / entry total / seal bytes             |                                          2,551 / 429,217,823 / 505 |
| entry min / mean / max                        |                                     17,345 / 17,884 / 18,451 bytes |
| maximum line / bound                          |                                              18,451 / 24,576 bytes |
| producer / completed / resumed                |                                                0 / 24,000 / 24,000 |

LFを含む算術は`2,551 + 429,217,823 + 505 + 24,002 = 429,244,881`で一致した。公開JSONが明示するreceipt / independent SHAは同一で、fresh-build digestとの一致もresult発行前のstrict parent validatorが確認する。fresh receipt自体は公開証拠へ使わない。

| native scan observation |                  resumable-prefix |                 sealed-final |
| ----------------------- | --------------------------------: | ---------------------------: |
| calls                   |                             6,550 |                        6,550 |
| bytes                   |                       429,244,881 |                  429,244,881 |
| maximum request         |                            65,536 |                       65,536 |
| phase envelope          | prefix start→final start 76.284 s | final start→receipt 76.526 s |

checkpoint call全体は157.760秒、外部independent SHAは0.238秒だった。phase envelopeには各scan以外の検証も含まれるためpure scan timeとは呼ばない。

| RSS observation                |   raw bytes | decimal MB |
| ------------------------------ | ----------: | ---------: |
| scan checkpoint前              | 190,857,216 |    190.857 |
| scan後                         | 235,749,376 |    235.749 |
| sampled peak                   | 386,564,096 |    386.564 |
| scan-child process max         | 386,646,016 |    386.646 |
| full-command / build-child max | 554,876,928 |    554.877 |

RSSにはtraining bindingとNode heapが含まれる。これは単一machineの観察値と内部整合性であり、scanner-only memory、閾値合格、O(1) scalingの証明ではない。

fresh buildでは24,002回のregular-file syncをfixture作成時間短縮のため抑止し、native method復元後にworkとstageを各1回batch syncした。build checkpointは277.722秒だった。このbuild receiptはnon-evidenceであり、power-loss durability testではない。別childのnative-sync resume / final scanだけをscan evidenceにする。

## 9. 合否条件

Attempt 3はprocess exit 0だけでなく、次をすべて満たした。

- exact 24,000 unique parentsとderived 336,000 candidate instances
- 外部stream counterの24,002 JSONL linesとreceiptの24,000 parent recordsを分離
- actual / receipt / independent SHA-256一致とfresh-build internal一致
- resume producer call 0、completed / resumed 24,000
- 両policyがexact 429,244,881 bytesを各6,550 bounded readsで受理
- 最大read 65,536 bytes、最大line 18,451 bytes
- line-byte算術、read-call算術、timing、RSS関係が全部一致
- source commit / harness SHAがrun前後で不変、worktree clean、temp root 0

fast CIでは100-parent contractだけを毎回実行し、24,000-parent loadはstandalone evidence commandのままにする。pinned Node v22.13.0では6/6 testsがpassし、別runtimeではexact-runtime依存の3件だけをskipしてpure parser / URL / pinned-evidence contract testを継続する。

| final-head local validation           | 結果                             |
| ------------------------------------- | -------------------------------- |
| focused scan-load Vitest              | 1 file / 6 tests                 |
| full Vitest                           | 112 files / 1,916 tests          |
| Python ML stdlib                      | 58 / 58                          |
| TypeScript / scoped ESLint / Prettier | pass / 0 warnings / pass         |
| repository-wide ESLint                | 0 errors / 157 existing warnings |
| Next production build                 | 193 / 193 pages                  |

## 10. claim boundary

このload testが示せるのは、syntheticながら意味的にvalidな最大件数をmerged test-only scanner coreがbounded readで再検証し、digest、順序、HMAC、resume、sealの整合を保てることだけである。production coordinatorへの接続はまだ示さない。

teacher engineを動かさず、teacher cp / mate / PVを得ず、training JSONL、checkpoint weight、A/B result、81Dojo ratingを作らない。live環境のweightも変更しない。したがって「評価関数が強くなった」「高段で安定した」というclaimは0である。

次はproducer timeout / cancellation v2を実装し、失敗後にengine processを回収できる境界を閉じる。その後にdeployment key authority、training-only finalizer、zero-argument coordinator、100→500 parent pilotへ進む。
