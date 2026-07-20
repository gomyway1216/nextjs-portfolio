# 24,000局面の認証は、どこまでフルパワー化できるか

> 2026-07-19追記：この文書は非本番foundation時点の記録である。source closureを閉じて本番12 workerへ接続した結果は[続編](./blog-shogi-floodgate-raw-authentication-worker-production.md)を参照。

結論から言うと、**一部は並列化できる**。「仕様上ほぼ直列」という以前の説明は強すぎた。36,349個のreceiptを読み、保存物のhashと照合する部分は互いに独立しており、入力順に結果を戻せば複数coreで処理できる。

ただし、24,000局面の認証全体を14倍速にはできない。役割を割り当てる途中で「それ以前に使われた局面」を反映する処理は入力順に依存する。この順序依存部分を無理に同時実行すると、同じ入力から別のtraining / holdout分割を作り得る。速くても証明が変わる実装は採用できない。

この変更はその境界を切り分ける非本番foundationである。正式v7（formal v7）、教師生成、学習、live weightにはまだ接続していない。AWS、GCP/Firebase、Vercelも使っていない。

English version: [How much of the 24,000-position authentication can use the whole machine?](./blog-shogi-floodgate-raw-authentication-worker-foundation.en.md)

## 実測結果

Apple M4 Pro（14 core、51,539,607,552 bytes RAM）で、同じ実ロック済みCSA receipt 4,000件を使った。現行の直列処理を正解とし、1・4・8・12 workerを実行順を入れ替えて各3回測定した。全12回で、receiptの内容と入力順は直列結果と完全一致した。

さらにdaily listing 90件、daily rating 90件、period inventory 1件、CSA 24件の計205件を混ぜ、1 / 4 / 8 / 12 workerすべてが直列結果と完全一致することも確認した。これにより4種類すべてのworker response captureを実データで通した。

|       処理 |      中央値 | 現行直列比 | 観測peak RSS |
| ---------: | ----------: | ---------: | -----------: |
|   現行直列 | 2,087.96 ms |      1.00x |       315 MB |
|   1 worker | 2,559.35 ms |      0.82x |       354 MB |
|  4 workers | 1,124.14 ms |      1.86x |       403 MB |
|  8 workers |   859.82 ms |      2.43x |       468 MB |
| 12 workers |   775.08 ms |      2.69x |       532 MB |

1 workerが現行直列より遅いのは、worker起動とTypeScript runtime読込の固定費があるためである。8から12へ増やした改善は約9.9%で、RSSは約64 MB増えた。この時点では8と12の両方をfull比較へ残し、後述の36,349件比較で12を選んだ。

36,349件を再構成まで通した1 raw passの別実測では、当時の直列が33.29秒・maximum RSS 606,666,752 bytes、4 workerが20.14秒・727,515,136 bytesだった。wall timeは1.65倍、1 pass当たり13.15秒短縮した。このfull-pass値は親側response captureを厳格化する直前のfoundationで測ったため、historical evidenceとして残し、現在sourceの採用値には使わない。

厳格化後の最初のfull診断では、worker検証とtest core再構成だけが4 / 8 / 12 workerで11.756 / 10.635 / 9.438秒だった。一方、比較対象の直列35.008秒にはcandidate再validationとmanifest serialization比較も入っていた。したがって当初計算した3.71倍は同形比較ではなく、production速度の主張から撤回した。途中値は監査JSONに残している。

最終比較ではworker側にもcandidate再validation、再構成、2回のmanifest serializationを入れた。test coreのdeep equalityはproductionより余分に残す保守的なemulationであり、production wiringそのものではない。重い別testがない状態で4→8→12、次に12→8→4の2巡を測った。

| production-shape emulation |  round 1 |  round 2 |   中央値 | 直列35.008秒比 |
| -------------------------: | -------: | -------: | -------: | -------------: |
|                  4 workers | 15.765秒 | 15.571秒 | 15.668秒 |          2.23x |
|                  8 workers | 13.861秒 | 13.721秒 | 13.791秒 |          2.54x |
|                 12 workers | 12.503秒 | 12.334秒 | 12.418秒 |          2.82x |

全6 runが36,349 receiptの再構成に成功した。12 workerは8 workerより9.96%速かった。再利用した測定processで観測したRSSはすべて1 GB未満だったが、run順の影響を含むprocess値であり、worker単体のallocation上限とは呼ばない。このraw passの非本番推奨は12 workerである。

さらにfinal sourceの直列結果と12 worker結果を同じprocess内に保持し、36,349件すべてを比較した。全receipt・listing / period evidence・入力順のdeep equalityとcanonical receipt bytesが完全一致し、その結果からの再構成も36,349 / 36,349で成功した。

後述のdeadline強化後にも、実CSA receipt 4,000件で1回の回帰測定を行った。現行直列2,141.96 msに対して4 / 8 / 12 workerは1,113.32 / 885.38 / 793.61 msで、12 workerは2.70倍だった。全worker数で入力順を含め直列結果と完全一致した。この1 sampleはdeadline追加による大幅な退行がないことの確認であり、source closure後のfull end-to-end再測定の代わりではない。

## それでも18分が3分にならない理由

完全な24,000局面認証はraw verifierを4回通すため、receipt検証は合計145,396回ある。この4 passがすべてproduction-shape emulation中央値と同じ22.590秒短縮になると仮定すると、短縮は約90.360秒である。過去の実測1,088.743秒は推定998.383秒、すなわち18.15分から16.64分になる。改善は実在するが、これはraw-pass実測からの投影であり、end-to-end認証の実測ではない。

残りの大きな直列床はrole semantic replayである。保存済み入力だけの診断でもpure replay 1回が191.86秒で、full bundleはこれを2回行う。局面ごとの解析準備は将来workerへ分けられるが、global blocked setを更新して役割を確定するcommitはcanonical input orderを守る必要がある。

24,000 training rowのparser自体は、100 / 500 / 1,000行で31 / 82 / 159 msだった。ここへmemoryやSSDを大量投入しても主要時間は消えない。また過去のfull認証ではblock input / output operationが0で、raw lockはpage cacheに載っていた。約100,624,528 KiBの空きstorageは十分だが、空き容量を増やすこと自体はCPUと順序依存の問題を解かない。

full verifierを8個丸ごと複製する案も違う。各processが同じ証明を最初から最後まで別々に作るだけで、1つの完了は速くならない。過去のpeak RSS 5.63 GBを単純に8倍すると約45 GBとなり、48 GiB machineでは安全余白もほぼ消える。必要なのは、小さなtaskだけを渡すpersistent worker poolである。

## 今作ったものと安全境界

非本番worker foundationには次を入れた。

- 1 workerにつき同時taskは1件だけ
- taskへ入力ordinalを付け、結果を必ず元の順序へ戻す
- 時計上先に失敗したtaskではなく、最小input indexの失敗を返す
- raw bytesをthread間で複製せず、検証済みreceiptと小さなevidenceだけを返す
- 1 / 4 / 8 / 12 workerの同値性、canonical receipt bytes、失敗順、in-flight上限をtestする
- task応答は60秒、graceful shutdownは5秒で期限を切り、超過時はworkerを強制終了する
- startup error、途中のworker constructor失敗、task hang、shutdown hang、malformed response、余計なmessage、失敗順の逆転を実workerで注入し、各異常test後の残存workerが0であることを確認する
- 1 workerのV8 old generation上限384 MB、最大12 workerを明示する。ただしこれはprocess RSS上限ではない

一方、production verifierからこのpoolへのimportはゼロに戻した。理由は、workerがspawn後にTypeScript entryと`tsx` runtimeをpathから読み込むためである。main verifierがclean commitを確認しても、workerが後から別bytesを読む余地をまだ閉じていない。

productionへ接続する前に、worker entryと推移的runtime依存をcode-pinned manifestへ束縛し、spawn前と全worker終了後にexact-clean revisionを再確認する。symlink / path swap、dirty tree、実行途中のsource mutationも拒否しなければならない。速さのために認証sourceの同一性を弱めることはしない。

最初の独立reviewはP0 / P1を0件、P2を1件報告した。指摘はtask応答とshutdown / exitに期限がなく、生存したまま応答しないworkerを永久に待ち得ることだった。同じfoundation内でtask deadline、shutdown deadline後の強制terminate、8種類の実worker異常注入testを追加した。集中testは17 / 17件が通り、異常test後の残存workerも毎回0だった。deadline追加後の独立再reviewはP0 / P1 / P2すべて0件で通過した。productionは引き続き未接続である。

## 次の順序

1. 自己完結したworker runtimeとsource closureを作り、別の独立reviewを通す。
2. source closure後にend-to-end 12-worker認証を再測定し、その証拠が揃って初めてproduction raw verifierへ接続する。
3. 次の大きな短縮として、role replayの「局面ごとの不変な準備」をworker化し、順序依存commitだけをmain threadに残す。
4. 認証後の教師探索は予定どおり12 engine processを使う。現在進行中の正式v7を、このfoundationのために再起動・待機させない。

この作業は認証時間を短くするもので、評価関数そのものを強くした証拠ではない。高段を安定して出すための本体は、認証後の教師label生成、再学習、候補選抜、正式A/Bである。live weight変更は引き続き0である。

機械可読の全sampleと境界は[監査JSON](./data/floodgate-raw-authentication-worker-foundation-2026-07-19.json)へ保存した。
