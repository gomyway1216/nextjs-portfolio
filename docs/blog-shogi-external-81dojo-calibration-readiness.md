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

game 1前に、候補、runtime、内部gate receipt、account、持時間、matching、判定規則を含むprotocol coreのSHA-256 commitmentを、独立したdata-only JSONとしてpublic `main`へmergeする必要がある。最終protocolは、その公開fileのpath・bytes・SHA-256、`main` revision・tree、merge時刻を束縛する。offline verifierは構造とdigestの整合を検査するが、remote GitHubで本当にmergeされたことまでは単独で証明しない。人または独立processがpublic commitを確認してからgame 1へ進む。現在は候補未選定なので、この公開commitmentもまだ0件である。

## 200局を差し替えられない形で残す

追加したverifierはofflineでしか動かない。authoritative dataは追記型JSONL fileではなく、private directory内のread-onlyな1局1fileである。JSONLは検証・最終receipt用にそこから生成するderived viewに限定した。人が公式clientから確認した各局について、次を1entryへ保存する。

- 公式側game ID、対局時刻、先後、相手の公開identityのhash
- 対局前後ratingとaccountのrating戦局数
- 公式棋譜artifactと、その全指し手
- 固定candidate runtimeのtrace artifactと各探索receipt
- 対局がratingへ算入されたか、technical faultがなかったか

candidate traceはprotocol SHA-256、candidate、runtime・hardware、server game ID、公式棋譜artifact、正規化指し手digestをすべて束縛する。同じ指し手列でも、別候補、別protocol、別game、別server recordへ流用できない。

新entryをdiskへ書く前に、既存prefixと新entryを結合したderived JSONL全体を検査する。重複game ID、ratingまたはrating戦局数の不連続、時刻逆行、hash-chain不一致があればtemporary fileすら作らない。各entryは直前entryのSHA-256を含み、1から200まで欠番を許さない。game 1もpublic `main` mergeと最終protocol組立ての両方より後でなければならない。

書込みはcomplete temporary file作成、file `fsync`、上書き不能なexclusive hard-link publish、directory `fsync`の順で行う。途中で停止したpartial temporary fileはauthoritative prefixに入らず、再起動後のderived viewも直前の完全prefixを返す。ledger pathの既存ancestorをすべて`lstat`し、leafだけでなく親directoryのsymlinkも拒否する。原子的no-follow機能がないOSでは停止する。

これは公式serverによる暗号署名を主張する仕組みではない。public protocol-core commitment、manual exportのidentity、immutable local entry、hash chainを組み合わせ、project側で条件や結果を後から選び直す余地を減らす仕組みである。

## 主判定と補助統計を分離する

主判定は次の全条件を満たした場合だけPASSする。

1. 固定条件のrating戦がちょうど200局ある。
2. 相手選択、欠損、technical fault、candidate trace不一致が1件もない。
3. 171局目から200局目まで、各局終了後ratingがすべて2050以上である。

2050は確認日の81Dojo五段thresholdである。ただし「200局」「最後の30局をすべて2050以上」という受入規則は81Dojo公式認定ではなく、このprojectが結果を見る前に固定した安定性基準である。PASSしても主張範囲は「このcandidateが、このaccount・hardware・client・持時間・matching条件で、そのthresholdを維持した」に限られる。

勝率には、同じ相手との複数局を独立標本とみなさないopponent単位cluster bootstrapも計算する。seedは`20260720`、100,000回、両側95%区間である。review後はclusterごとの得点合計と局数を先に1回だけ計算し、各反復で棋譜全体を再集計しない。ただしこれは補助表示であり、primary判定を通したり、ratingを段位へ変換したりしない。

## 現在地と次の実行条件

| 状態                                           |   2026-07-20 |
| ---------------------------------------------- | -----------: |
| 固定policy                                     |         完了 |
| offline ledger / verifier                      |         完了 |
| focused fixture                                | 13 / 13 PASS |
| 記事・evidence整合test                         |   4 / 4 PASS |
| candidate選定・runtime binding                 |         未完 |
| internal formal A/B                            |         未完 |
| 公式`COM_` account・client・reference hardware |       未準備 |
| userの外部実行許可                             |         なし |
| candidate coreのpublic `main` commitment       |            0 |
| 81Dojo外部対局                                 |      0 / 200 |
| live weights変更                               |            0 |

候補が内部gateを通るまでは外部対局を始めない。候補確定後も、account、公式client、reference hardware、現在の規約再確認、userの明示許可をprotocol coreへ固定し、そのdata-only commitmentをpublic `main`へmergeして独立確認する必要がある。確認後に最終protocolを組み立て、公式clientを人が操作して200局を記録し、完全なderived ledgerだけを最終判定へ渡す。

AWS、GCP、Firebase、Vercelはこの校正には使わない。学習と内部評価はlocal、外部校正は81Dojo公式clientとlocal ledgerで行う。校正処理によるcloud操作、credential読取、外部書込、live反映はいずれも0である。ただし、ready PR #567のpush後、repositoryに既設のGitHub連携がVercelの通常preview buildを1件自動起動した。これはweb変更を確認するdelivery CIであり、学習、対局、校正実行ではなく、対局dataやcredentialも渡していない。

固定値と未解決条件は[機械可読evidence](./data/shogi-external-81dojo-calibration-readiness-2026-07-20.json)に記録した。
