# 30bit局面hash衝突を実証し、第2lockで直す

_2026年7月25日_

[English version](./blog-shogi-dual-hash-lock-pilot.en.md)

## 先に結論

次に直す対象は評価関数の係数でもhistoryの再調整でもない。現行の本番WASM探索コアで、**異なる2局面が同じ30bit局面hashになり、前の局面の着手と評価を再利用して違法な着手keyを返す**ことを再現した。

これは理論上の心配ではない。固定seedの合法手だけで52,067局面を生成すると、hash `218180606`で衝突した。本番WASMと現在のライブ重みを使い、局面Aを探索してTTを残したまま局面Bを探索すると、Aの`8d8c+`とscore `3178`をBでも返した。`8d8c+`はBでは違法である。TTを消してBを単独探索すると、合法な`3a3b`とscore `-1409`を返した。現在のブラウザhostには返却手の合法性を再確認し、失敗時にJSへfallbackする防御があるため、この証拠だけからライブ画面が違法手を実際に指したとは主張しない。

この不具合を、現在の30bit hashを変えずに独立した32bitの第2lockを追加して直す。まず研究WASMだけで正しさ、速度、非退行対局を検証する。ライブ重みと本番配信物は、証拠が揃うまで変更しない。

## 前の候補はここで終える

bounded quiet-history malusは、正式52局で26勝25敗1分、53/104 halfpoints、得点率50.96%だった。残り4局を全勝しても61/112で、事前合格点62へ届かないため不採用にした。壊れてはいなかったが、明確な強化を示さなかった。同じ案の係数調整や追加seedは行わない。

今回のdual-hash lockはその探索heuristicを引き継がない。重み、枝刈り、move ordering、思考時間を変えず、別局面のcache値を同一局面だと誤認する具体的なidentity不具合だけを対象にする。

## 何が衝突したか

衝突した2局面は、平手初期局面から`GenerateMovesImproved.generateLegalMoves`が返した合法手だけを選んで到達した。両方ともcanonical SFENへround-tripでき、物理条件を満たし、JSと本番WASMの合法手数も一致した。

- A: `1nk1s2n1/l1rs1+P3/+Pgp5N/1P1pp1ppl/p4P3/1GPPS+bP1p/B3P2P1/L3GG3/1NK1RS2L b 2P 89`
- B: `1sk3s1l/2g2r+B2/l1n1pp1+B1/p1p3p2/3p3np/PpP4P1/2NPPPP1P/R2SGG1S1/L4K1NL w GPp 56`

現行hashは約10.7億通りしかない。TTは約100万entry、評価cacheは約26万entryを持ち、同じ対局内で保持される。primary hashが完全一致するとindexも一致するため、primaryだけを照合する現在のTTは別局面を区別できない。

発見方法、asset identity、2局面、探索結果、主張できる範囲は[機械可読の衝突証拠](../ml/protocols/dual-hash-lock-collision-preflight-v1.json)へ固定した。この証拠は通常対局での発生頻度やEloを示さない。本番trafficで実際に同じ違法手が出たとも主張しない。

## 修正方法

現在のprimary hashとそのseed生成順は変更しない。既存のopening bookや過去証拠との互換性を守るためである。別seed・別streamでfull 32bitのsecondary lockを作り、盤、持駒、手番の変更に合わせてincrementalに更新する。

候補をONにした研究WASMでは、次のidentity判定が`primary + secondary`の両方を要求する。

- private transposition table
- NNUEを含む評価cache
- 探索path内の千日手判定

共有TT、JS fallback、mate solver、opening cacheを含むライブ全経路への適用は、研究WASMのgateを通った後の別PRで行う。primary hashだけでindexを選ぶ点は変えず、同じindexのentryが同じ局面かを第2lockでも確認する。

## 対局前の必須gate

研究toggleはdefault OFFとする。OFFは本番と固定64局面でbest move、score、depth、nodes、leavesが64/64完全一致しなければならない。

ONでは、衝突局面をA→BとB→Aの両順序で探索し、cacheを残した対象局面のbest move、score、depthが、その局面をcache clear後に単独探索した結果と一致し、返した手が合法でなければならない。正当な別entry再利用でnodesとleavesは変わり得るため、そこはONの同一条件に含めない。TT、評価cache、千日手は別々のtest seamでprimary一致・secondary不一致を必ず検出する。

第2hashはWASM自身の値だけを信じない。TypeScript側の独立実装で、少なくとも16,384合法遷移についてincremental値と毎回のfull recomputationを照合し、各trajectory後に平手を再同期して4つのhashが復元することも確認する。固定64局面のON探索は64件の返却手がすべて合法、決定的、state復元、技術故障0であることが必須である。

速度はproduction、toggle OFF、candidate ONを交互に測る。candidate/productionのaggregate throughputは0.97以上、medianは0.95以上、p90 wall regressionは8%以下、WASM memory増は6MiB以下を要求する。研究候補は共有TTを使わない。これは棋力ではなく、正しい修正が時間制御を壊さないためのgateである。

## 正しさ・速度gateの正式結果（2026年7月26日）

事前計画を固定した[PR #625](https://github.com/gomyway1216/nextjs-portfolio/pull/625)のmerge後、そのplan SHA `dfb82a42…de63`に結び付いた正式結果は、登録済みの27 gateを27/27合格した。追跡した[生receipt](./data/shogi-dual-hash-lock-correctness-raw-2026-07-26.json)は34,210 bytes、SHA-256 `5529d03c…314e`で、[読みやすい要約](./data/shogi-dual-hash-lock-correctness-result-2026-07-26.json)とは別に、出力byteを整形せず保存している。生receipt自体には開始・終了時刻を含む実行時間envelopeがないため、この記事では所要時間を主張しない。

衝突のprimary hashは両局面とも`218180606`だが、第2lockはA=`3957758389`、B=`1939556287`に分離した。toggle OFFはA→B、B→Aの両方向でproductionとbest move key、score、depth、nodes、leavesが完全一致した。productionでは後から探索した局面に先の局面のkeyとscoreが残った一方、toggle ONは両方向とも対象局面のclean探索とkey、score、depthが一致し、返却手は合法だった。正当なcache再利用で変わり得るnodesとleavesは、計画どおりONのclean一致条件には含めていない。

評価cacheと千日手の独立seamも合格し、secondary不一致による拒否はTT 16回、評価cache 3回、千日手3回を実測した。TypeScriptの独立full recomputationとWASMのincremental第2hashは16,384合法遷移すべてで一致し、再同期失敗は0。固定64局面も各カテゴリ16件ずつで、OFFの5項目完全一致、ONの決定性・合法性、state復元、incremental一致が64/64だった。

| 速度・memory指標               |  必須条件 |    実測 |
| ------------------------------ | --------: | ------: |
| aggregate candidate/production |   97%以上 | 99.622% |
| median candidate/production    |   95%以上 | 99.424% |
| p90 wall regression            |    8%以下 | -0.171% |
| WASM memory増                  | 6 MiB以下 | 0 bytes |

p90の負値は、この測定ではcandidate側のwall timeが0.171%短かったことを表す。ただし、これは固定深さ・固定workの性能安全性であり、棋力向上の測定ではない。このreceiptが許可したのは、固定済み96局の非退行対局を開始することだけである。ライブ変更、productionへの反映、重み更新、昇格、「強くなった」という結論は許可していない。

## 96局は強化証明ではなく非退行gate

正しさと速度を通った候補は、新しい48 openingを先後交換した96局で本番と比較する。対局ランナーは、同じ固定plan SHAへ結び付いた全gate合格のcorrectness receiptを必須入力として再認証する。両腕は同じライブ重み、1手1.5秒、12 pair workers、定跡なし、mate solverなしとする。

固定証拠に含まれる3,198 enrolled openingと、直前の固定planにある28 openingの和集合を使う。集合は3,226種類、seed `980001..980048`はすべてfreshで交差0である。

合格floorは候補82/192 halfpoints、得点率42.71%とする。これは「強くなった」基準ではない。既知のcorrectness bugを直す変更を短い対局の勝率ノイズだけで棄却せず、同時に大きな棋力悪化は止めるための非退行境界である。PASSには96局完走と、故障、違法手、opening重複がすべて0であることが必須である。棄却だけは、残り全勝でも82へ届かない数学的futilityが確定した場合に早期停止できる。

## 正式96局の結果（2026年7月26日）

固定した研究WASMは96局を完走し、47勝47敗2分、96/192 halfpoints、得点率50.00%だった。合格floorの82/192を14 halfpoints上回り、48 openingはすべて一意、technical faultは0だった。先手では27勝20敗1分、後手では20勝27敗1分である。固定runnerが照合した11,163着手keyはすべてその時点の合法手集合に含まれた。

| 指標               |            結果 |
| ------------------ | --------------: |
| 完了               | 48 pairs / 96局 |
| 候補の勝敗         |     47勝47敗2分 |
| halfpoints         |        96 / 192 |
| 合格floor          |        82 / 192 |
| opening重複        |               0 |
| technical fault    |               0 |
| runnerの合法手照合 | 11,163 / 11,163 |

[読みやすい要約](./data/shogi-dual-hash-lock-match-result-2026-07-26.json)とは別に、[run、terminal result、48 pairの生receipt](./data/shogi-dual-hash-lock-match-raw-2026-07-26/)を整形せず追跡した。独立testはrunnerをimportせず、固定planとcorrectness receipt、48 seedとopening fingerprint、各pairのdomain seal、集計、合否を再計算する。`result_sha256`はJSONファイル全体のSHAではなく、同fieldを除いたcanonical bodyにdomainを付けた内部sealである。ファイル自体のSHAは別に記録した。

この証拠には限界がある。pair receiptはplan SHAを持つが、correctness receipt SHAやrun IDを持たず、terminal resultもrun SHAや48 pairのmanifest rootを持たない。そのため、追跡testがこれらを独立に結び付けているが、「単一runからの全receiptであることを暗号学的に証明した」とは主張しない。またpairには完全棋譜がなく、結果、終局理由、plies、合法手照合数だけが残るため、全着手を後から独立再生した証拠ではない。terminal receiptに認証済み終了時刻もないので、正確な所要時間は主張しない。

47勝47敗2分は、候補がこの限定的な直接対局で大幅退行を検出されず、事前登録した非退行screenを通過したことを示す。強化、Elo上昇、高段到達、ブラウザ全経路の強さは示していない。このPASSが許可するのは、別PRでproduction実装とブラウザ検証を行うことだけである。`promotion_authorized=false`は変わらず、ライブ変更、配信、重み更新はまだ許可されない。

## 通過後

全gateを通っても、この研究PRだけではライブを変更しない。通過後の別PRで、AssemblyScript本番源泉、WASM、埋め込みbase64、JS V20 fallback、共有TT、mate solver、opening cacheへ同じdual identityを実装し、ブラウザ実機とrollback条件を確認する。

この修正は高段を保証しない。しかし、別局面の探索結果を誤って使い、探索コアが違法な着手keyまで返すことがある現行の穴を残したまま学習量だけ増やすより、先に直すべき明確な土台である。
