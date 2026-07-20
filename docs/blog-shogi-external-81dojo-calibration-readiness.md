# 将棋AI: 81Dojo外部校正を、公開commitment後だけ実行できる形にした

> 2026-07-20時点の実績は **外部対局0局、候補未選定、実行許可なし** である。今回の変更はAIを直接強くする学習ではなく、将来選ばれた候補が81Dojo五段相当のrating帯を安定して維持したかを、後から条件変更せず判定するための準備だけである。[English version](./blog-shogi-external-81dojo-calibration-readiness.en.md)

## これは棋力向上そのものではない

教師生成、再学習、候補選抜、formal A/Bが棋力を上げて選ぶ本線である。81Dojo外部校正は、その本線を通過した候補を既知の人間rating poolへ接続する最後の測定であり、学習の代わりにはならない。したがって、この準備を理由にローカル学習を止める必要はない。

必要なのは、同じ「高段」という言葉でも内部AI同士の勝率と人間ratingが別の物差しだからである。内部A/Bで現行版より強いことは示せても、それだけでは人間の段位を主張できない。一方、外部対局を候補確定前に始めたり、結果を見て時間設定や相手を変えたりすると、その測定も信用できなくなる。

## 実行前に固定した条件

| 項目         | 固定値                                                                                 |
| ------------ | -------------------------------------------------------------------------------------- |
| 場所         | 81Dojo、公式clientのみ                                                                 |
| account      | 規約に沿う`COM_`名義、rating確定済み                                                   |
| 対局         | rating戦、平手、10分 + 30秒、200局                                                     |
| matching     | 公式auto-match、相手を選ばない                                                         |
| relay        | 人が公式clientを操作するmanual relayのみ                                               |
| 禁止         | server API、外部scriptによるserver/UI操作、credential記録                              |
| 候補runtime  | production Worker / WASM / NNUE、master、1手最大5秒、depth 32、quiescence 12、bookあり |
| 候補identity | repository、weights、Worker、WASM、定跡、hardware、clientをgame 1前に固定              |

81Dojoの[利用規約](https://81dojo.com/jp/terms.html)は、`COM_`名義のsoftware利用を扱う一方、外部toolやscriptによるserver accessを認めていない。そのため、このrepositoryには81Dojoへ接続するcode、browser操作、client自動操作を追加していない。2026-07-20に、[段級位対応表](https://system.81dojo.com/pages/ranks)、[rating基準の告知](https://81dojo.com/announcements/260411.html)、[持時間別係数の告知](https://81dojo.com/announcements/260517.html)、[rating system](https://81dojo.com/documents/Rating_System)も再確認した。

## 自己申告時刻は事前登録の証拠にしない

候補protocolに「この時刻に作った」と書くだけでは、対局結果を見た後に時刻を戻して作れてしまう。したがって、その時刻だけで事前登録済みとは主張しない。

game 1前に、候補、runtime、内部gate receipt、account、持時間、matching、判定規則を含むprotocol coreのSHA-256 commitmentを、独立したdata-only JSONとしてpublic `main`へmergeする必要がある。最終protocolは、その公開fileのpath・bytes・SHA-256、merge commit、tree、blob、PR番号、GitHub serverの`merged_at`を束縛する。

技術commit `86b1d9e30dda4326bf67fbc1b82f8db23b94f6fb`では、localの`origin/main`や自己申告時刻を事前登録の証拠として受け入れない。固定host `api.github.com`への直接TLS GETだけを使い、PRが対象repositoryの`main`へmerge済みであること、server側のmerge時刻とmerge commit、記録時と現在の`main` ancestry、commit tree、公開pathのblob identityとbase64 bytesを照合する。同じrevision・tree・blob・bytesをlocal Git objectとも一致させ、最終receipt発行時にもGitHubのlive stateを再検査する。これはpublic read-only通信であり、token、credential、GitHubへの書込みは使わない。現在は候補未選定なので、この公開commitmentもまだ0件である。

## 200局を差し替えられない形で残す

81Dojo対局の記録処理はlocalだけで動く。authoritative dataは追記型JSONL fileではなく、private directory内のread-onlyな1局1fileである。JSONLは診断用のderived viewにすぎず、terminal receiptを発行できない。最終判定はlock中のauthoritative directoryから全entryを読み、各file identityを含むmanifestを作れた場合だけ進む。人が公式clientから確認した各局について、次を1entryへ保存する。

- 公式側game ID、対局時刻、先後、相手の公開identityのhash
- 対局前後ratingとaccountのrating戦局数
- 公式棋譜artifactと、その全指し手
- 固定candidate runtimeのtrace artifactと各探索receipt
- 対局がratingへ算入されたか、technical faultがなかったか

candidate traceは、outer traceだけでなく、nested runtime receiptと各decision receiptのcanonical bytesにもprotocol SHA-256、candidate、runtime・hardware、server game ID、公式棋譜artifact、正規化指し手digestを重ねて束縛する。各receiptはdomain-separated digestとexact artifact identityを持つため、外側のlabelだけを変えて別候補、別protocol、別game、別server recordへ流用できない。

新entryをdiskへ書く前に、既存prefixと新entryを結合したderived JSONL全体を検査する。重複game ID、ratingまたはrating戦局数の不連続、時刻逆行、hash-chain不一致があればtemporary fileすら作らない。各entryは直前entryのSHA-256を含み、1から200まで欠番を許さない。game 1もGitHub serverが記録したpublic `main` mergeと最終protocol組立ての両方より後でなければならない。通常のappendとderived-view確認はGitHubへ接続せず、API rate limitも消費しない。

ledger pathはfilesystem rootから各componentを`dir_fd`と`O_NOFOLLOW`で順に開き、保持したdescriptorを基準に作成・読取り・postflightを行う。親directoryの差し替えや途中componentのsymlinkを追わず、原子的なdescriptor-relative primitiveがないOSでは停止する。初回namespace作成では親directory、lock file、ledger root、entries directoryを必要な順で`fsync`してからentry発行へ進む。

entryの発行はcomplete temporary file作成、file `fsync`、上書き不能なexclusive hard-link publish、entries directory `fsync`の順で行う。partial temporary fileはauthoritative prefixに入らない。link、最初の`fsync`、temporary unlink、最後の`fsync`でerrorになっても、同じlock内でexact entryを再読込して`committed`、`not-committed-safe-to-retry`、`indeterminate-stop-and-inspect`のいずれかへreconcileする。committed entryへ同じ観測を再送した場合は新しい局を作らず、idempotentに既存commitを返す。

これは公式serverによる暗号署名を主張する仕組みではない。public protocol-core commitment、manual exportのidentity、immutable local entry、hash chainを組み合わせ、project側で条件や結果を後から選び直す余地を減らす仕組みである。

## 主判定と補助統計を分離する

主判定は次の全条件を満たした場合だけPASSする。

1. 固定条件のrating戦がちょうど200局ある。
2. 相手選択、欠損、technical fault、candidate trace不一致が1件もない。
3. 171局目から200局目まで、各局終了後ratingがすべて2050以上である。

2050は確認日の81Dojo五段thresholdである。ただし「200局」「最後の30局をすべて2050以上」という受入規則は81Dojo公式認定ではなく、このprojectが結果を見る前に固定した安定性基準である。PASSしても主張範囲は「このcandidateが、このaccount・hardware・client・持時間・matching条件で、そのthresholdを維持した」に限られる。

勝率には、同じ相手との複数局を独立標本とみなさないopponent単位cluster bootstrapも計算する。seedは`20260720`、100,000回、両側95%区間である。review後はclusterごとの得点合計と局数を先に1回だけ計算し、各反復で棋譜全体を再集計しない。ただしこれは補助表示であり、primary判定を通したり、ratingを段位へ変換したりしない。

## 現在地と次の実行条件

| 状態                                           |                         2026-07-20 |
| ---------------------------------------------- | ---------------------------------: |
| 固定policy                                     |                               完了 |
| local ledger / public-commit verifier          |                               完了 |
| focused Python fixture                         |             23 / 23 PASS、30.417秒 |
| 独立bounded rereview                           | 9 / 9 PASS、15.386秒、P0/P1/P2 = 0 |
| candidate選定・runtime binding                 |                               未完 |
| internal formal A/B                            |                               未完 |
| 公式`COM_` account・client・reference hardware |                             未準備 |
| userの外部実行許可                             |                               なし |
| candidate coreのpublic `main` commitment       |                                  0 |
| 81Dojo外部対局                                 |                            0 / 200 |
| live weights変更                               |                                  0 |

候補が内部gateを通るまでは外部対局を始めない。候補確定後も、account、公式client、reference hardware、現在の規約再確認、userの明示許可をprotocol coreへ固定し、そのdata-only commitmentをpublic `main`へmergeしてGitHub server上のPR・commit・objectを確認する必要がある。確認後に最終protocolを組み立て、公式clientを人が操作して200局をlocal authoritative ledgerへ記録する。最終判定は完全なimmutable-entry manifestとGitHub live再検査の両方が通った場合だけ発行する。

AWS、GCP、Firebase、Vercelはこの校正の計算・保存・実行には使わない。学習と内部評価はlocal、外部対局は81Dojo公式client、ledger appendはlocalで行う。例外となる唯一のnetwork処理は、事前登録の組立て時とterminal receipt発行時に行うpublic GitHub APIへのread-only TLS GETである。認証tokenやcredentialを送らず、GitHubを含む外部serviceへ書き込まず、対局dataも送らない。live weights変更は0である。ready PR #567のpush後に既設のGitHub連携が起動したVercel previewはdelivery CIであり、学習、対局、校正計算ではない。

固定値と未解決条件は[機械可読evidence](./data/shogi-external-81dojo-calibration-readiness-2026-07-20.json)に記録した。
