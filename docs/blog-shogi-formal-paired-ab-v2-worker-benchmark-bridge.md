# 将棋評価関数: formal A/Bの並列度を実測で決めるbridge

> 2026-07-20時点で、実worker benchmarkは **0 / 8 round**、formal A/B本番は **0 / 768局**、live weight変更は0である。この変更は棋力向上の結果ではない。候補選抜後にローカルPCの2/4/8/12 pair workerを同じ対局で比較し、最速かつ結果が一致する設定だけをformal A/Bへ渡すための実行bridgeである。English version: [blog-shogi-formal-paired-ab-v2-worker-benchmark-bridge.en.md](./blog-shogi-formal-paired-ab-v2-worker-benchmark-bridge.en.md)

## 結論

[P0基盤](./blog-shogi-formal-paired-ab-v2-p0-foundation.md)で残していた、benchmark receiptと実formal runnerの間の接続を実装した。

ただし、現在のchecked-in registryは意図的に`BLOCKED`である。実候補weight、専用opening、production rules preflightがまだ登録されていないため、argumentless production entryを実行してもbenchmarkを1 roundも開始せず停止する。ここで0なのは遅延ではなく、候補選抜前の対局を測定値として混ぜないための境界である。

## パソコンのフルパワーを安全に選ぶ

候補は`[2, 4, 8, 12]` pair workerで、各pairはcandidateとstableの2局を同時ではなく同一pair単位で実行する。最大12 pair workerでは、最大24 engine processが動く。

実benchmarkは同じ12 pair / 24局を次の固定順で測る。

`2, 4, 8, 12, 12, 8, 4, 2`

合計は8 round、96 pair、192局である。各worker数を前半と後半に分けて2回測ることで、温度や一時的な負荷の影響を一方向に偏らせない。選抜条件は次のすべてを満たすことだ。

- 全roundで24局のtranscript hash vectorが完全一致する
- technical faultが0
- 実測peak worker数が要求値と一致する
- 8 roundが固定順序で欠けずに完了する
- 2回のelapsed time合計が最小のworker数を選ぶ
- 同率なら小さいworker数を選ぶ

つまり「コアを多く使った設定」ではなく、「同じ結果を保ったまま、このMacで実際に最も速かった設定」を採用する。

## 自己申告のbenchmarkをformal A/Bへ入れない

最初の実装だけでは、呼び出し側が用意したregistryやreceiptを渡せる余地、実行中にソースが変わる余地、別ユーザーの出力先へ誘導される余地が残っていた。独立レビューで見つかった境界を閉じ、production経路を次の形にした。

1. production CLIはargumentlessで、コードに固定されたregistryだけを読む。
2. registryは2,383 bytesとSHA-256で外側のauthority sourceに固定する。
3. benchmark開始前に、実runnerが到達するPython/TypeScript/WASMの25 source identityを検証する。
4. source revisionが現在の履歴に含まれることを確認し、実行後にも同じregistry、opening、asset、source identityを再確認する。
5. 出力先は環境変数`HOME`ではなくOSの現在ユーザー情報から決め、current-user-owned 0700 directoryと0600 single-link receiptだけを許す。
6. benchmark receiptはregistry、opening preflight、candidate/stable weight、全round transcript、選ばれたworker数を一つのdigestへ結ぶ。
7. formal READY registryは、そのreceipt identityと`selected_pair_workers`の一致を要求する。
8. benchmarkはformal pair journal、network、cloud、AWS、GCP、live weightへアクセスできない。

これにより、benchmarkが速さを測る役割と、formal A/Bが棋力差を測る役割を混ぜない。

## 今回のレビューで直した5点

独立再監査では、実行前に閉じるべき5点を修正した。

- benchmark registryそのものを外部sourceからcontent-pinする
- production outputをcallerの`HOME`ではなくOS account homeへ固定する
- production APIとCLIからpathやregistry引数を除く
- Python import closureと、実pair adapter/playerが読むTypeScript/WASM closureを25 sourceまで固定する
- 実行後のsource driftでもreceipt公開を拒否する

これは棋力を上げる処理ではないが、192局のbenchmarkや768局のformal A/Bを条件違いでやり直す事故を防ぐため、実対局開始前に一度だけ必要な修正である。

## 実測値と現在地

| 項目 | 結果 |
| --- | ---: |
| Python全体 | 406 pass / 0 fail |
| formal関連TypeScript | 37 pass / 0 fail |
| 独立focused監査 | 15 pass / 0 fail |
| 実worker benchmark | 0 / 8 round |
| 実benchmark pair / game | 0 / 0 |
| 実formal pair / game | 0 / 0 |
| network / cloud job | 0 / 0 |
| live weight変更 | 0 |

機械可読データは[worker benchmark bridge evidence](./data/floodgate-formal-paired-ab-v2-worker-benchmark-bridge-2026-07-20.json)に記録した。

## 次に何が起きるか

このbridgeは候補選抜の完了を待つ。次の順序は固定している。

1. 13-engineのfresh selection teacherを完了する。
2. 3候補を同じselection datasetで評価し、候補を1つ選ぶ。
3. 実候補weightと専用12-pair openingをreviewed benchmark registryへ登録する。
4. ローカルで8 round / 192局のworker benchmarkを一度だけ実行する。
5. 選ばれたworker数をformal READY registryへ固定する。
6. 384 pair / 768局のformal A/Bを実行する。

その後にretention、既知局面regression、外部校正を行う。現在は候補が強くなったとも、高段に達したとも言えない。証拠が揃うまでlive weightは変更しない。
