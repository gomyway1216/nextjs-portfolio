# v7が500件目で止まった原因と、512MB Hashで始め直すv8

> 2026年7月19日時点。これは実際のv7失敗、同じYaneuraOu資産を使った局所診断、v8回復実装を記録する。v8の正式teacher生成、再学習、棋力向上、live反映はまだ完了していない。English version: [blog-shogi-floodgate-strength-first-v8-hash-recovery.en.md](./blog-shogi-floodgate-strength-first-v8-hash-recovery.en.md)

## v7は安全に止まったが、完走はしなかった

v7は24,000 training parentの認証を終え、100件milestoneも通過した。その後、500件prefixの2つ目の探索timeoutで停止した。500件までに許可していたtimeout skipは1件だけなので、2件目をlabelやskipとして保存せずfail closedした。

| v7終了時 | 実測 |
| --- | ---: |
| `work.jsonl` | headerを含む500 records、6,818,743 bytes |
| non-timeout parent entry | 498 |
| 保存済みtimeout skip | 1 |
| 2件目のtimeout entry / partial label | 0 / 0 |
| milestone 100 / 500 | 完了 / 未完了 |
| final result / training / live変更 | なし / 未開始 / 0 |

全runner / YaneuraOu processは回収済みである。残っているlock fileは開かれたlockではなく、同じprivate inodeを再利用するための通常状態である。

## 問題は「CPUを使っていなかった」ことではなく、64MB TTで探索が病的に膨らんだこと

12個のYaneuraOuは各1 threadで並列に動いていた。しかしformal設定の`USI_Hash=64`では、一部のdepth 16探索がtransposition tableの衝突・置換を繰り返し、600秒を超えた。CPUをさらに同じ1探索へ足して解決する種類の直列不足ではない。

同じpinned engine / eval、同じdepth 16で、v7を止めた2局面だけをprivate temporary directoryから再測定した。局面、parent ID、候補手は公開していない。

| 測定対象 | Hash 64 | Hash 256 | Hash 512 |
| --- | ---: | ---: | ---: |
| 1件目の独立rescore | 870.566秒 / 707,909,200 nodes | 132.162秒 / 130,950,979 nodes | 157.325秒 / 162,457,860 nodes |
| 2件目のparent全label | 1,007.432秒後も未完了。900秒rescore timeout | 88.063秒 | 70.316秒 |
| 通常9局面の合計 | — | 212.208秒 | 206.092秒 |

1件目だけなら256MBの方が速い。一方、512MBは通常9局面の合計で256MBより2.882%速く、2件目の失敗局面では20.153%速かった。256MBと512MBのどちらも、既知の2失敗をformal上限600秒以内で解いた。ここから「今後timeoutが0になる」とは主張しない。

## v8は`512MB × 12 process`に固定する

v8候補は次を固定する。

- 12 process、各1 thread
- 各processのHash 512MB、合計6,144MiB
- proposalはMultiPV 12 / depth 16
- 各候補の独立rescoreはMultiPV 1 / 1手`searchmoves` / depth 16
- 1探索600,000ms
- timeout skip上限は従来どおり`ceil(target / 1000)`

このMacは48GiB memoryを持つ。15 processまで並行した診断のpeakでもCPUは合計1,258%、memory freeは47%、throttled pageは0だった。12個の512MB Hashは物理memoryの12.5%であり、約92GiBの空きstorageもbottleneckではない。

さらに本番と同じ12並列・Hash 512MBで通常parentを1件ずつ同時処理したload testは、12 / 12件が成功し、failure 0、wall time 47.557秒、各parent 11.894〜47.520秒だった。12 engineのpeak RSSは合計約8.0GiB、system memory freeは45%、throttled pageは0だった。終了後はengine 0、private test directory 0、memory free 49%まで戻った。これで48GiB / 14-core host上の`12 × 512MB`実行可能性を、設定値だけでなく同時負荷でも確認した。

Hashを1,024MBへ増やし続ける案は採用しなかった。既知の1件目では512MBより遅く、必要memoryだけ増えるためである。大きい値そのものではなく、実測した安全域と通常局面のthroughputを選んだ。

## v7の498件をv8へコピーしない

Hashは単なるperformance knobではない。同じdepthでも探索順、TT hit、提案候補、scoreが変わり、実際の診断でもnodesと結果時間が変わった。run fingerprintはHashと完全runner revisionを含むため、64MBで作ったv7 labelを512MBのv8へ上書き・移植する権限はない。

そのため実装は次の境界を持つ。

- 新出力は`~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v8`
- runner / milestone / result / public receiptをv2 schemaへ更新
- v7 pathとv1 resultを後続training bridgeが拒否
- 24,000 inputを再認証し、空のv8 rootから開始
- v7の失敗artifactは変更・削除しない

public JSONには件数、bytes、時間、protocol設定だけを置く。parent identity、局面、候補手、private work / prefix digestを含む完全な照合情報は、Gitへ追加しないmode `0600`のlocal receiptへ分離する。

## ここまでで強くなったとは言わない

今回完了したのは、既知timeoutを再現し、実測に基づくHash設定を選び、v7と混ざらないv8入口・downstream境界・回帰testを作るところまでである。formal v8 teacherはこの変更では起動していない。review、CI、通常merge後、cleanなmerge revisionを固定して初めてv8を走らせる。

したがって現時点の正確な結論は「既知の完走阻害要因を除くv8候補ができた」であり、「AIが高段になった」ではない。棋力の主張には、24,000 teacher完了、3-seed再学習、候補選抜、封印holdout、正式paired A/B、外部校正が引き続き必要である。

機械可読記録は[公開集計evidence](./data/floodgate-strength-first-v8-hash-recovery-2026-07-19.json)、事前登録した変更は[v8 hash recovery amendment](../ml/protocols/floodgate-q1-2026-strength-first-v8-hash-recovery-amendment.json)に置いた。
