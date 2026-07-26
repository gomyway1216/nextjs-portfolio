# dual-hashを本番経路へ統合し、定跡もfail-closedで移行する

_2026年7月26日_

[English version](./blog-shogi-production-dual-hash-integration.en.md)

## 結論

研究版で実証したdual-hash修正を、本番WASM、JavaScript fallback、共有TT、千日手・詰探索経路、外部定跡へ広げた。目的は評価関数を学習し直すことではなく、**primary hashが衝突した別局面を同一局面として扱わないこと**である。

正式96局は47勝47敗2分、故障0だった。これは事前登録した非劣化floorを通ったという意味であり、強化の証明ではない。NNUE weightsも変更していない。したがって、この統合で主張できるのはcollision correctnessの改善であり、Elo上昇や高段到達ではない。

機械可読の値は[production integration evidence](./data/shogi-production-dual-hash-integration-2026-07-26.json)へ固定した。

## 何を変えたか

従来は、約30bitのprimary hashが一致すれば、別局面でもTTや評価cacheのentryを受け入れ得た。実際に異なる合法局面が衝突し、本番探索WASMが先に探索した局面の違法な着手keyを次の局面へ返すケースを再現している。発見と研究版の詳細は[dual-hash pilot](./blog-shogi-dual-hash-lock-pilot.md)に残した。

本番候補では、primary hashをindex選択に残しつつ、独立したsecondary hashも局面identityの照合に使う。対象は次である。

- JavaScript V20のTTと評価cache
- JavaScript探索とmate solverの千日手identity
- WASMのprivate TTとshared TT
- shared TTのbrowser host storage
- 外部opening book

primaryを残すのは既存の探索indexingを不要に変えないためである。ただしentryを「同じ局面」と認めるにはsecondaryも一致しなければならない。

## 実asset

| asset             |     bytes | SHA-256          | 変更                          |
| ----------------- | --------: | ---------------- | ----------------------------- |
| production WASM   |    36,545 | `9142b6b0…4c31`  | dual identityを本番探索へ追加 |
| NNUE weights      | 1,185,988 | `e4e738f9…e28dc` | **変更なし**                  |
| SBK2 opening book | 1,785,509 | `ec41836b…7530`  | independent hash pairへ移行   |

weightsのbyte数とSHAは以前のライブ候補から変わっていない。今回のWASM変更は評価係数の上書きではなく、cache identityの修正である。

## 旧定跡をそのまま複製しなかった理由

旧SBK1はprimary hashと、それに相関する短いcheckを持つ。そこから独立secondary hashを一意に復元できないため、97,767個の旧identityを機械的に新形式へ写すのは安全ではない。

移行scriptは初期局面から定跡graphを合法手で再生し、実際に復元できた独立`(hashA, hashB)`だけをSBK2へ書く。結果は次だった。

| 区分                             | 旧identity数 | 扱い                                |
| -------------------------------- | -----------: | ----------------------------------- |
| SBK2へ安全に移行                 |       97,522 | 独立pairとstored moveの合法性を確認 |
| book-induced traversalから未回収 |          175 | 省略                                |
| 1つの旧identityが複数pairへ分岐  |           68 | payloadを複製せず省略               |
| stored move payloadが違法        |            2 | 省略                                |
| 明示的coverage loss              |          245 | 旧97,767の0.251%                    |

これはfail-closedの損失である。曖昧なentryを残して誤った定跡手を返すより、その局面ではbook missとして探索へ渡す。ただし175個が「あらゆる定跡外手順から到達不能」だと証明したわけではないため、そのような主張はしない。

## ローカルで確認できたこと

| 検証                         |                           結果 | 意味                                    |
| ---------------------------- | -----------------------------: | --------------------------------------- |
| JS ↔ WASM secondary identity |              4,184 / 4,184一致 | 独立実装間で局面identityが一致          |
| fixed-depth search           |                48 / 48完全一致 | JS V20とproduction WASMの固定探索が一致 |
| production browser build     |                           PASS | NNUE評価と探索がともにWASM経路          |
| レベル5の実ゲーム            |                           PASS | ▲7六歩に△8四歩、手番が正常に戻る        |
| production WASM identity     | 36,545 bytes / `9142b6b0…4c31` | 配信候補の実byteを固定                  |
| SBK2 identity                |   97,522局面 / `ec41836b…7530` | 安全移行後の実byteを固定                |

production buildの専用browser harnessでは`crossOriginIsolated=true`、`evaluation_path=nnue-wasm`、`search_path=wasm`、worker応答・合法手ともPASSだった。埋込WASMと取得したweightsのbytes/SHAも上表のassetと一致した。これらは実装とartifactのcorrectness証拠であり、対局分布に対する勝率や段位を測ったものではない。

## 最終production binaryの速度

正式96局で使った研究WASMと最終production WASMはbyte-identicalではないため、最終36,545-byte binaryも保存済み旧production snapshotと直接比較した。64個のformal holdout、depth 5 / quiescence 8、同一weights、positionごとのTT clear、各arm 4 warmup、先後順を交互にした6 paired blocksで、`nodes + quiescence leaves`当たりのthroughputを測った。[raw blocks](./data/shogi-production-dual-hash-speed-benchmark-raw-2026-07-26.json)と[集計](./data/shogi-production-dual-hash-speed-benchmark-result-2026-07-26.json)を残し、同じロジックの[再現runner](../wasm-spike/benchmark-production-dual-hash-vs-snapshot.ts)も追跡した。

全block aggregateはfinalが101.749%だったが、最初の旧production blockだけ33.005秒、残る旧blockは29.018〜29.257秒で、system loadの揺れがfinalを有利に見せている。その値を隠したりblockを削除したりせずrawへ残し、中心値にはpaired ratioのrobust medianを使う。

| 指標                                  |             final / old | 読み方                                  |
| ------------------------------------- | ----------------------: | --------------------------------------- |
| 全block aggregate throughput          |                101.749% | 旧側1 blockの遅延で楽観的。判断には不使用 |
| paired throughputのrobust median      |                 99.689% | 約0.311%の低下                          |
| 安定していた5 pairの記述的範囲       |        99.048〜99.934% | 約0.952〜0.066%の低下                   |
| p90 wall regression                   |                 -0.036% | gross wall-time退行なし                 |
| WASM memory delta                     |                 0 bytes | 両方56,623,104 bytes                    |
| 固定探索decision                      |                  63 / 64 | 1件は意図した合法なcollision修正        |

63 / 64という値は「1件壊れた」という意味ではない。`checkEvasion-06`だけは旧primary-only cacheとdual-lockで探索結果が変わり、正式correctness evidenceでもdual-lock側はdeterministicかつlegalだった。今回の目的である衝突修正が実際に効いた局面である。

この短い測定から言えるのは、最終exact binaryに大きなdirect-WASM速度退行が見えず、中心値では約0.3%、保守的な実測blockでも約1.0%以内だったことまでである。これは棋力metricではなく、browser host、shared TT、JavaScript fallback、同時負荷も測っていない。runnerも実行後に同一ロジックを追跡したもので、事前登録されたpromotion権限は持たない。

## 96局が示すこと、示さないこと

研究候補と旧productionの正式direct-playは48 pair、96局を完走し、候補47勝、旧production47勝、2分、故障0だった。得点率は50.00%で、非劣化floorを通った。ただし対局した研究WASMは37,538 bytes（`90cbf3ce…8edf`）であり、今回の統合production WASM 36,545 bytes（`9142b6b0…4c31`）とbyte-identicalではない。

この結果から「dual-hashで強くなった」とは言えない。むしろ観測された勝率は互角である。分かるのは、再現済みのidentity bugを直した研究候補が、この限定条件で大きな退行を示さなかったことだけである。最終production binaryの96局証拠ではなく、その実装は上記のparity・固定探索・browser full-pathで別に検証した。高段という目標との距離は、この96局では測れていない。

## ライブ状況

この記録時点ではproduction integrationのPR、merge、deployment、配信後確認が完了していないため、ライブへ反映済みとは扱わない。ローカルassetが完成していても、`meetyudai.com`が同じWASMとSBK2を配っている証拠にはならない。

次のgateは、現在の統合validationを完了し、PRをmergeした後、配信先でWASM identityとbrowser engine pathを再確認することである。それが終わるまで「ライブ変更済み」は0のままとする。

## 強さを上げる次の作業との関係

今回の修正は学習そのものではないため、単独で高段を作る施策ではない。それでも、別局面の探索結果を混ぜるcache identity bugを残したまま大量自己対局や再学習を行うと、学習候補の比較と実戦評価に不要なノイズが入る。先にcorrectnessを閉じる意味はそこにある。

次の強化判断では、dual-hashを「強くした実績」と数えず、正しい土台として扱う。強化の証明には、別途、変更したweightまたは探索候補を現行と対局させ、事前登録した強化基準を統計的に越える必要がある。
