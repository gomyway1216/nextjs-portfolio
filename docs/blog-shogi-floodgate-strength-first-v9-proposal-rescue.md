# v8停止からv9へ：提案をdepth 14、採点をdepth 16に分離した

> 2026年7月20日時点。正式v8教師生成の停止原因、実局面によるdepth比較、高速入力、12対14・12対13並列の実測、v9 runner実装と正式実行の進捗を記録する。正式v9はclean merged revision `682e5a1dd8027519f2277ec311000bfedf4aced3`からローカルで開始し、500 milestoneをexact完了した。24,000の最終結果、再学習、棋力向上、live反映はまだ完了していない。English version: [blog-shogi-floodgate-strength-first-v9-proposal-rescue.en.md](./blog-shogi-floodgate-strength-first-v9-proposal-rescue.en.md)

## 結論

v8は24,000局面を完走していない。1,388枠をaccountingした時点で、内訳はlabel済み1,383、proposal timeout skip 5だった。次の局面でMultiPV 6順位のうちdepth 16の完全な最終順位が5つしか出ず、部分labelを作らず安全に停止した。したがって評価関数はまだ強くなっておらず、live weightも変えていない。

v9では候補を探す仕事と、その候補を正確に採点する仕事を分ける。

| 処理             |                    v8 |                        v9 |
| ---------------- | --------------------: | ------------------------: |
| 候補提案         | MultiPV 12 / depth 16 | MultiPV 12 / **depth 14** |
| 各候補の独立採点 |              depth 16 |        **depth 16のまま** |
| 並列             |            12 engines |                13 engines |
| Hash             |      512 MiB / engine |          512 MiB / engine |
| 1探索上限        |                 600秒 |                     600秒 |

depth 14への変更は最終scoreを浅くする変更ではない。浅くするのは候補集合を作る最初の探索だけで、学習labelに使うscoreは各候補をdepth 16で独立に再探索して作る。

## depth 14を選んだ実データ

v8の5 timeout局面、停止した1局面、それらと合法手数が近い正常終了6局面をprivateに再測定した。局面、parent ID、候補手は公開していない。

| 診断                                      | depth 14 | depth 15 |
| ----------------------------------------- | -------: | -------: |
| 完了                                      |  11 / 12 |  11 / 12 |
| timeout                                   |        0 |        0 |
| 不完全MultiPV                             |        1 |        1 |
| 正常6局面の旧depth 16候補集合recall中央値 |  91.667% |  91.667% |
| 旧depth 16 proposalに対するnodes中央値    |  31.411% |  51.278% |

5つの旧timeoutはdepth 14と15の両方で完了した。残った1局面は両depthとも6順位中5順位しか完全にならず、探索を長くするだけでは直らない種類だった。

さらに正常6局面をdepth 16で独立再採点したところ、その最終1位の手はdepth 14候補集合に6 / 6含まれた。標本は小さいため棋力同等の証明ではないが、depth 15はdepth 14よりnodes中央値で約1.66〜1.88倍必要なのに、この確認では最終1位の包含率を改善しなかった。そこでv9はdepth 14を採用した。

不完全MultiPVはproposalだけ、型付きの`proposal_incomplete_no_label`としてlabelなしで隔離できる。timeoutと合わせた従来の回復可能skip上限は緩めない。depth 16の独立再採点が不完全なら引き続きfatalである。

## 1コアで長時間かかった入力確認を約3.7秒へ

従来の入口は24,000 training局面を使う前に、元データからrole分割全体を再構築して検証していた。これは監査には有用だが、教師生成を始めるたびに繰り返す必要はない。

新しいfast input境界は次だけを行う。

- 固定manifestと固定training bytesを照合
- `O_NOFOLLOW`で開いたdescriptorを保持して読み取る
- 24,000行すべてのJSON、SFEN、指し手、ID関係を既存parserで検証
- holdoutとselection fileは開かない
- 教師生成の前後に同じ処理を行い、manifest / source identityの完全一致を要求
- 一致後にだけ`result.json`を最後にcommit

実24,000局面のloadは約3.70秒だった。9時間file descriptorを保持する方式ではなく、検証済みのfreeze済みrowsをmemoryに置き、終了後に同じ固定入力をもう一度読む。これで長い直列前処理を削りつつ、途中改ざん時は結果を公開しない。

## 13並列を採用し、14並列は採用しない

「14コアなら14 engineにすべき」を推測で採用せず、本番と同じfull label処理を実測した。各trialは同じ42局面に対し、depth 14 proposalと全候補のdepth 16独立再採点を行った。順序は12 → 14 → 14 → 12、合計168局面、forced skip 0だった。

| 並列       | 実測wall time      |   中央値 |
| ---------- | ------------------ | -------: |
| 12 engines | 59.672秒、87.004秒 | 73.338秒 |
| 14 engines | 73.295秒、86.510秒 | 79.903秒 |

14並列のthroughputは12並列の91.784%で、約8.216%遅かった。そこで12と14の間にある13を、別のcounterbalanced runで測った。条件は同じ42局面、Threads 1、Hash 512 MiB / engine、順序12 → 13 → 13 → 12、合計168局面、forced skip 0である。

| 並列       | 実測wall time      |   中央値 |
| ---------- | ------------------ | -------: |
| 12 engines | 90.314秒、74.878秒 | 82.596秒 |
| 13 engines | 78.288秒、72.873秒 | 75.581秒 |

13並列の中央値throughputは12並列の109.2814%で、事前の選定閾値101%を超えた。wall time中央値では8.493%短い。2組の短いtrialなので棋力や24,000局面の所要時間を証明するものではなく、別run間の12並列の絶対時間も揺れている。それでも同一run内の比較では13が速く、別の12対14比較では14が遅かったため、測定した12・13・14の中からv9は13 enginesを採用する。

## 正式v9は500をexact完了し、そのまま24,000へ進行中

正式実行はclean merged revision `682e5a1dd8027519f2277ec311000bfedf4aced3`から開始した。時刻と経過時間は次のとおりである。

| 観測点        | epoch      | 開始からの経過 |
| ------------- | ---------: | -------------: |
| 正式開始      | 1784539512 |              0 |
| 100 milestone | 1784539923 |   411秒（6分51秒） |
| 500 milestone | 1784540513 | 1,001秒（16分41秒） |

500 milestoneではtarget / completedがexact 500 / 500、emitted 500、forced skip 0だった。`fewer-than-two`と`search-timeout`もともに0である。

その後の監視時点では、開始から1,705秒でdurable work entryが1,003件まで増えていた。これは正式な追加milestoneでも、1,003件の最終labelを独立検証したという意味でもない。進行中のwork fileに耐久記録された件数を読むための監視sampleであり、正式runnerは同じrunのまま24,000へ進んでいる。

| 実行資源                         | 観測値                    |
| -------------------------------- | ------------------------- |
| 場所                             | ローカルのみ              |
| engine                           | 13並列                    |
| Threads / engine                 | 1                         |
| Hash / engine                    | 512 MiB                   |
| run使用memory                    | 約9 GiB                   |
| 空きmemory                       | 約50%                     |
| 空きstorage                      | 約81 GiB                  |
| cloud利用 / live weight変更      | 0 / 0                     |

監視sampleまでの全体rateから外挿した残りは約10.9時間、500以降のsteady rateからは約8.9時間だった。この差を誤差として含め、現時点では**残り9〜11時間**を暫定範囲とする。完了時刻の保証ではなく、2,000 work entryの監視点で再計算する。

24,000の最終結果はまだなく、教師dataも未完成である。したがって再学習、候補選抜、正式A/B、棋力向上のclaimはなく、live weightも変えていない。

## ここから本当に棋力へ進む

今回追加したrunnerは、別のv9出力root、clean Git revision、fast input policy、depth 14 / 16分離、13 engines、Hash 512、型付きproposal隔離を正式resultへ固定する。旧v8 labelは混ぜない。正式v9 rootはmerge済みrevisionからだけ開始した。

次の順番は以下である。

1. 同じ正式runを24,000まで継続し、2,000件でETAを更新する
2. 最終集計と入力のpostflight検証が成功した後だけseed 42 / 43 / 44で再学習する
3. 候補選抜とsealed holdoutを通す
4. 正式paired A/Bと外部校正で棋力を測る
5. 高段安定の証拠が揃った候補だけlive昇格する

現時点の正確な結論は「v8の既知停止を回避し、長い直列入力確認を削り、最速と実測した13並列で正式v9を開始し、500件をskipなしでexact完了した」である。「AIが高段になった」ではない。

機械可読の集計は[公開evidence](./data/floodgate-strength-first-v9-proposal-rescue-2026-07-20.json)に置いた。
