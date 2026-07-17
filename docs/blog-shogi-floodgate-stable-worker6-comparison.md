# 将棋評価関数: 6ワーカー化では600秒tailを解消できなかった

> [12ワーカーのexact final-head確認](./blog-shogi-floodgate-stable-timeout-confirmation.md)と同じ12親・同じfixed asset・同じdepth 11 / quiescence depth 10 / 600秒timeoutを、worker数だけ12から6へ変えてread-only比較した。結論は7成功 / 5 rejectのままで、典型的な成功待ち時間は悪化し、parent peak RSSも減らなかった。production、incident state、teacher、training、live weightsは変更していない。English version: [blog-shogi-floodgate-stable-worker6-comparison.en.md](./blog-shogi-floodgate-stable-worker6-comparison.en.md)

## 1. 結論

「同時workerを半分にすればmemory pressureが下がり、600秒timeoutが消える」という仮説は、この固定12親では支持されなかった。

| 指標                 |  12 workers |   6 workers | 読み方                       |
| -------------------- | ----------: | ----------: | ---------------------------- |
| fulfilled / rejected |       7 / 5 |       7 / 5 | 完了数は改善なし             |
| fulfilled中央値      |    66.382秒 |    91.617秒 | 6 workersが38.0%遅い         |
| fulfilled平均        |    77.398秒 |   132.708秒 | 6 workersが71.5%遅い         |
| fulfilled最大        |   264.590秒 |   255.621秒 | tail成功1件だけは8.969秒短い |
| 前処理後の総時間     |   601.281秒 |   601.243秒 | 0.038秒差で実質同じ          |
| parent peak RSS      | 6,781.5 MiB | 6,822.3 MiB | 40.8 MiB増、削減なし         |

6-worker runの総時間が40.726秒短いのは、authenticated input preprocessingが偶然40.688秒短かったためである。worker数の効果として扱わない。

## 2. 比較条件

6-worker runはmerged `main`のcommit `ce33913014eb0e990dfaabe344e2e7c8d5e393d5`、tree `c49276cb15568677c65780ddd188f6a4c3fdb247`をdetachedで使った。Nodeは`v22.13.0`である。

12-worker baselineから変えた設定はworker数だけで、次は同一だった。

- authenticated training inputのlogical index 3〜14、exact 12 parents
- fixed stable WASM / weight / worker assets
- depth 11、quiescence depth 10
- queue bound 48
- startup timeout 120秒、search timeout 600秒、close timeout 15秒
- shared TTなし、parentごとにprivate TT clear、internal max time 0
- production gate、lease cleanup、checkpoint resume、quarantineを呼ばないread-only wrapper

ただしinline diagnostic wrapper自体はtracked artifactとして実行していない。この比較が直接確定するのは固定moduleと固定parameter上の観測値であり、production deployment runや再実行authorityではない。

## 3. 6-workerの実測

authenticated preprocessingは1,063.005秒、pool initializationは0.113秒、全体は1,664.248秒だった。parent peak RSSは6,822.3 MiBである。

fulfilled 7件のsafe elapsed secondsは昇順で次のとおりだった。

`5.391, 89.634, 90.887, 91.617, 153.173, 242.635, 255.621`

remaining 5件は`600.000, 600.001, 600.002, 600.002, 600.004`秒でrejectされ、すべてmerged safe metadataの`search-timeout` / `timeout_ms = 600000`を持った。これは5件それぞれの独立timeoutを証明しない。最初のterminal errorがpool-wide poisonでactive wrapperへbroadcastされたため、最初にtriggerしたworker / input indexは非特定のままである。

## 4. 12-workerとの差

workerを6へ減らすと、最初の6 taskだけが即時実行され、残りはFIFO queueで待つ。成功中央値と平均が悪化したのはこのqueue delayと整合する。一方、5件の長いsearchは最終的に全workerへ到達したが、最初の600秒境界までに完了しなかった。

12-workerと6-workerの前処理後総時間はそれぞれ601.281秒と601.243秒であり、terminal wall timeは同じとみなせる。fulfilled最大が3.4%短くなっても、成功数、timeout数、安全なterminal boundaryは変わらない。

parent peak RSSは6-workerの方が0.6%高かった。1回ずつの観測なので「6 workerは必ずmemoryを増やす」とは言わないが、「6 workerでparent memoryを削減できた」とも言えない。

## 5. 発見したこと

この比較で、問題を単純な同時worker数不足として扱う根拠は弱くなった。

1. 12→6で成功数は7のまま
2. 5件は同じ600秒terminal boundaryに残った
3. typical fulfilled latencyはqueueの分だけ悪化
4. parent peak RSSは減らない
5. overall短縮40.726秒はsearchではなくpreprocessing差で説明できる

従って4-workerへさらに下げることを自動的な次手にはしない。まず、棋力条件を変えないままlong-tail searchのどこに時間が掛かるかをsafe milestoneで観測し、同じdepth / candidate semanticsを保つ最適化を設計する必要がある。timeout延長、depth低下、fallback move採用はteacher labelの意味を変えるため、別plan・別reviewなしにproductionへ入れない。

## 6. 安全確認とnonclaim

run終了後、pool closeはfulfilledだった。diagnostic root、stable workers、YaneuraOu processesはすべて0である。

before / after fingerprintはregistry、authenticated training input metadata、fixed assets、approved control plane、deployment-key metadataの5領域すべてmutation counter 0だった。key bytes、private path、private digest、SFEN、move、game / parent / position ID、raw stderr、raw error messageは公開していない。

この結果からは、timeout root causeの完全特定、最適worker数、teacher dataset完成、評価関数改善、段位を主張しない。live weights、incident lease / stage / checkpoint / quarantine、teacher data、training outputは変更していない。

## 7. 次の安全な工程

1. この6-vs-12比較を日英記事・machine JSON・回帰testとしてreviewし、通常mergeする
2. raw positionを漏らさないphase / node / queue milestoneをstable workerへ追加する
3. fixed depthとcandidate semanticsを保ったままlong-tailを短縮する実装候補をsynthetic / read-onlyで比較する
4. 新しいruntime bindingをreviewしてから、holdout-free small pilotを1回だけ行う
5. complete teacher dataがsealされてからseed 42 / 43 / 44再学習、fresh selection、final holdout、384局A/Bへ進む

現在の運用判断は引き続き`STOP`である。6-worker settingをproduction bindingへ採用せず、live weightsも変えない。
