# v7 checkpointを意味的にvalidな24,000親で実測する

> [incremental checkpoint scanner](./blog-shogi-floodgate-v7-incremental-checkpoint-scan.md)は64 KiB read chunkと24,576-byte line bufferで、file sizeに比例するscanner固有bufferを除いた。しかし、前PRで実行した最大境界の検査はsparse fileであり、候補集合とHMAC chainを持つ意味的にvalidな24,000-parent streamではなかった。このPRはholdoutを使わないsynthetic parentだけでmerged test-only checkpoint coreを通し、stream bytes、digest、read上限、wall time、child process RSS、resume / final一致を実測する。real teacher label、production coordinator、学習、対局、棋力の証拠ではない。English version: [blog-shogi-floodgate-v7-valid-24k-scan-load.en.md](./blog-shogi-floodgate-v7-valid-24k-scan-load.en.md)

---

## 現在の結論

| 対象                      | 状態             | このPRで確かめること                         |
| ------------------------- | ---------------- | -------------------------------------------- |
| bounded test-only scanner | 実装・マージ済み | 既存`CoreForTests` entry pointを変更せず使う |
| 100 / 1,000 parent        | 予備実測済み     | fixtureと測定手順が動くことを確認            |
| valid 24,000 parent       | 実行中           | 実bytes・SHA-256・RSS・時間を確定する        |
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

ハーネスは次のSHA-256を別々に得る。

1. fresh-build後にfileから計算したdigest
2. resume receiptが返したwork digest
3. scanner外で独立にstreaming計算したdigest

三者が同じでなければfailする。外部stream counterのJSONL line数は`parents + header + seal`であり、receiptの`work.records`はparent数だけを表すので区別する。candidate数は各親exact 14、最大lineは24,576 bytes以下、read hookが観測する最大要求は65,536 bytes以下でなければならない。

resume時にproducer callが1回でも起きた場合もfailする。これは24,000親すべてが認証済みsealed streamとして再利用され、新しいsearchを要求していないことを示す。

## 5. RSSと時間の測り方

fresh生成とresume scanはchildを分け、OSが報告するprocess-lifetime peak RSS、checkpoint呼出し直前と直後の`process.memoryUsage().rss`、各scanのwall timeを記録する。ただしscan childも件数に比例するsynthetic training bindingを構築・保持するため、これらをscanner固有RSSとは呼ばない。

実行machineはApple M4 Pro、14 physical / logical CPU core、51,539,607,552 bytes RAM、macOS 15.1である。runtimeはrepositoryが要求するNode v22.13.0へ固定する。

100、1,000、24,000 parentのchild RSSとfile bytesは運用上の観察値として並べるが、RSS比率をscanner固有memoryの合否には使わない。構造的な合否はread要求65,536 bytes以下、line 24,576 bytes以下、全fileを保持するscanner配列がないことに置く。Node heap、認証済みtraining rows、JSON一行のparse objectは残るため、「process全体がO(1) memory」とは主張しない。

## 6. 予備実測と24,000親の確定欄

次はprototypeの予備実測であり、最終commitの確定load resultではない。

| parents | file bytes | prefix wall ms | final wall ms | scan-child maxRSS (decimal MB) | digest                           |
| ------: | ---------: | -------------: | ------------: | -----------------------------: | -------------------------------- |
|     100 |  1,772,797 |            296 |           338 |                          148.6 | fresh / resume / independent一致 |
|   1,000 | 17,956,845 |          3,050 |         3,155 |                          199.6 | fresh / resume / independent一致 |
|  24,000 |     未実測 |         未実測 |        未実測 |                         未実測 | 未実測                           |

単純比例の予測は約430,964,280 bytes、1 scan約73–76秒、全工程約7.2分だった。これは旧記事のone-fixture予測416,185,154 bytesより14,779,126 bytes、3.551%大きく、fixture差による上方改定である。capacity planningだけに使い、実測値へ混ぜない。24,000親の完走後、この表を同一source SHA、64-hex digest、再現command、evidence pathを持つ確定値へ更新する。

## 7. 合否条件

valid 24,000-parent runは、process exit 0だけでは合格しない。次をすべて満たす必要がある。

- exact 24,000 unique parentsとexact 336,000 candidate recordsを検証する
- 外部stream counterでheader + parents + sealの24,002 JSONL linesを確認し、receiptの24,000 parent recordsと区別する
- fresh / resume / independent SHA-256が一致する
- resume producer callが0である
- resumable-prefixとsealed-finalが同じsealed bytesを受理する
- read要求が65,536 bytes、lineが24,576 bytesを超えない
- observed file bytes、最大line、両scan wall time、peak RSSを保存する
- checkpoint前後RSSとprocess-lifetime maxRSSを観察値として保存し、scanner固有memoryの証明とは呼ばない

fast CIでは100-parent contractを毎回実行し、数分かかる24,000-parent loadは明示的なstandalone commandとして実行する。CI timeoutを伸ばして毎pushで巨大fixtureを作る設計にはしない。

## 8. claim boundary

このload testが示せるのは、syntheticながら意味的にvalidな最大件数をmerged test-only scanner coreがbounded readで再検証し、digest、順序、HMAC、resume、sealの整合を保てることだけである。production coordinatorへの接続はまだ示さない。

teacher engineを動かさず、teacher cp / mate / PVを得ず、training JSONL、checkpoint weight、A/B result、81Dojo ratingを作らない。live環境のweightも変更しない。したがって「評価関数が強くなった」「高段で安定した」というclaimは0である。

次はproducer timeout / cancellation v2を実装し、失敗後にengine processを回収できる境界を閉じる。その後にdeployment key authority、training-only finalizer、zero-argument coordinator、100→500 parent pilotへ進む。
