# 評価関数は上書きしない。Floodgate強豪棋譜で学び直す実行ログ

> 前回のexact-int16-aware学習は、3 seedすべてで一部指標を改善した一方、完全なstatic gateは`0/3`だった。そこで現行productionは残したまま、2026年Q1のFloodgate強豪棋譜を新しいtraining / selection / finalへ分離する。このページは、その取得、検証、学習、実戦比較を途中の失敗も含めて追記する実行ログである。計画の固定値は[事前登録記事](./blog-shogi-floodgate-fresh-sibling-plan.md)、English versionは[こちら](./blog-shogi-floodgate-fresh-sibling-run.en.md)。

---

## 現在地

2026-07-10時点で、まだ「高段レベルになった」とは判定していない。labelを見ずに公開在庫を固定し、36,349件のraw responseを単一processで取得して、全参照をofflineで再現するところまでは完了した。

| 段階                              | 状態   | 証拠                                                  |
| --------------------------------- | ------ | ----------------------------------------------------- |
| 事前登録                          | 完了   | 10,890 bytes / SHA-256 `ad9e6d7f…b7a0af`              |
| label-blind在庫                   | 完了   | 90 listings / 36,419 official CSA / 36,168 target CSA |
| source・合法CSA parser            | 完了   | strict codec、identity join、全合法手                 |
| raw CAS lock                      | 完了   | PR #415、通常merge `2c272f37`                         |
| process-wide scheduler            | 完了   | PR #416、通常merge `b5832cea`                         |
| lease / resume / offline verifier | 完了   | PR #417、通常merge `649423d`                          |
| live raw取得                      | 完了   | 36,349 / 36,349、result SHA `f48155a5…0301`           |
| 1,000 / 200 / 200 role lock       | 未開始 | 次PRをmerge後、label生成前に固定                      |
| teacher / 3 seed学習              | 未開始 | model・loss・seedは変更しない                         |
| fresh selection                   | 封印   | 3 final checkpoint完成後だけ                          |
| final / 384局A/B / 81Dojo         | 封印   | 前段合格時だけ                                        |

## なぜ今の評価関数へ上書きしないのか

強い棋譜から学び直す方針自体はよい。ただし、現在使っているweightへ直接追加学習すると、失敗した時に比較対象まで失う。今回の運用は次の形にする。

1. 現行runOp1をstable productionとして保存する
2. 新しいFloodgateデータから独立candidateを3 seed作る
3. fresh selectionでstableと同時比較する
4. family gateを通った時だけfinalを開く
5. final、回帰、384局paired A/Bを通った時だけproduction置換候補にする

つまり「強い棋譜を上書き学習する」のではなく、「強い棋譜で別candidateを作り、現行を対照群として残す」。これなら失敗は計算時間の損失で止まり、現在の強さを壊さない。

## 途中で固定できた公開データ

[Floodgate公式2026年archive](https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/)の日別listing 90件を、`URL<TAB>bytes<TAB>SHA-256<LF>`のexact manifestにした。

| 項目                      |                                                               実測 |
| ------------------------- | -----------------------------------------------------------------: |
| 日別listing               |                                                   90 / 90 HTTP 200 |
| listing合計               |                                                   10,098,337 bytes |
| listing identity manifest |                                                       10,963 bytes |
| listing identity SHA-256  | `05d353413f310087316e16cfc1ec29800967886db43f090aee59f713c4bfc822` |
| official CSA URL          |                                                             36,419 |
| target event CSA URL      |                                                             36,168 |
| period inventory body     |                                                      332,094 bytes |
| period inventory SHA-256  | `17bd9969ba31a2b9a723be4b7defb7b3045816b19e325de19e8b65158fbac5b4` |
| group 0 identities        |                                                                316 |
| rating 3600以上・30局以上 |                                                                152 |

ここでは勝者、teacher cp、候補モデルscoreを読んでいない。既存final holdoutも開いていない。

## PR #415: responseを「取れたこと」にしないraw lock

最初の実装は、HTTP responseのexact bytesをcontent-addressed objectへ保存し、URL別receiptと最後のmanifestで結ぶ部分だった。

```text
raw-lock/
  objects/sha256/ab/<body-sha256>
  receipts/sha256/cd/<url-domain-sha256>.json
  manifest.json  # 全offline検証後の最後のwrite
```

実装前レビューでは、次の不具合をPR前に発見した。

- pinned listing SHAをmanifestへ書くだけで、90行の`url / bytes / sha256`から再生成していなかった
- object publish後のdirectory fsync失敗まで「別workerが同じCAS objectを作ったrace」として成功扱いできた
- duplicate CSA aliasのgame IDをcanonical game digestへ重複投入していた
- manifestを読むだけの関数がfull verifierのような名前だった

修正後は、90行TSVをLF固定し、各listing identityから事前登録SHAを再生成する。CAS reuseはexact-byte EEXISTだけに限定し、durability errorは必ず失敗のまま返す。duplicateはbody SHA groupごとにUTF-8 byte順最小URLをcanonicalにする。

GitHub reviewでは、`O_NOFOLLOW`がない環境でsymlinkを追うfallbackと、cleanup failureがprimary failureを隠す問題も直した。directory fsyncをWindowsで黙ってskipする提案は採用しなかった。今回のruntimeはmacOS固定であり、syncせず「durable」と記録する方が危険だからである。

## PR #416: sub-agentを増やしてもrequest policyを増幅しない

network schedulerは次を固定した。

- 全production factoryで共有する最大4 in-flight
- 実fetch開始間隔100ms以上
- `Accept-Encoding: identity`
- redirect拒否
- kind別status allowlist
- response URL完全一致
- Content-Encodingはabsentまたはidentityだけ
- Content-Lengthとcopied body bytesの一致
- 最初のfailure後はそのrunの新規startを停止

相互レビューでは、scheduler instanceを2つ作ると合計8並列になったこと、`Uint8Array.byteLength`や`Reflect.apply`、`Promise.race`、`Object.freeze`などをcallbackから差し替えるとgateやbody検証を迂回できたことを再現した。

最終版では、production gateをprocess-wideにし、pending permitをfailure時に同期cancelする。external Promiseはnativeか検査し、captured `then`でsealed internal Promiseへadoptしてからだけ待つ。request objectはdescriptor valueを1回だけ読み、Setやiterator dispatchに検証を委ねない。

20個のscheduler adversarial testと、合計120個の関連Floodgate testを通した。独立sub-agentの最終再監査はP1/P2 finding 0だった。

## PR #417で固定した取得順

取得runnerは次の順を変えられないようにした。

1. 最初のwriteより前にclean Git revisionを確認する
2. 既存manifestがあれば、leaseやauditも作らずnetworkなしで全参照を検証して終了する
3. raw rootの兄弟pathでexclusive leaseを取る
4. 競合終了直後のmanifestをもう一度確認し、不足する90 listingだけを取得する
5. 90 listingを再読し、10,963-byte identity、10,098,337 bytes、36,419 / 36,168 URLを再導出する
6. listing barrier合格後だけrating 90、period 1、CSA 36,168を取得可能にする
7. 64 response固定batchごとにobject→receiptの順でdurable publishする
8. 全receipt/object/bodyからcandidate manifestを再構築する
9. networkなしでmanifestの全参照と派生集計をもう一度検証する
10. Git revisionを再確認し、`manifest.json`を最後にno-clobber publishする

自動retryはしない。失敗したprocessのschedulerはpoisonされるため停止し、次processで厳密に検証できたreceiptだけをskipする。receiptがあるのにobjectが欠落・破損している場合は、再取得で修理せず失敗にする。

ここでいうoffline verifierは、manifestが参照する全receipt / CAS objectと、listing、period inventory、duplicate group、canonical game IDの再導出を閉じる。クラッシュで残り得る未参照CASやtmp fileの不存在までは主張しない。後段はstorage directoryを走査せず、検証済みmanifestのindexだけを入力にする。したがって未参照artifactが学習集合へ混入することはない。

## live取得の規模と制約

予定request数は次のとおり。

```text
90 listing
+ 90 daily rating
+ 1 period inventory
+ 36,168 CSA
= 36,349 requests
```

100ms start intervalだけで理論下限は約60分35秒である。listing barrier、通信、object/receipt fsync、offline再検証を含む実測は70〜120分を見込む。

ここは「パソコンのフルパワー」を複数processのHTTP取得に使わない。schedulerのglobal gateは1 process内で共有されるため、別processを並べると公式siteへのpolicyを増幅してしまう。network取得はexclusive lease下の1 processだけにし、sub-agentはcode review、記事、次段のeligibility設計を並行する。

実行とread-only statusは同じstrict CLIを使う。出力先はGit worktreeと双方向に交差しないabsolute pathだけを受け付ける。

```bash
npm run shogi:floodgate-acquire -- status --output /absolute/path/to/raw-lock
npm run shogi:floodgate-acquire -- run --output /absolute/path/to/raw-lock
```

## live runの途中監査

runは`2026-07-11T03:57:40.891Z`にsource revision `649423d455b5762a697864610d9e8f606cc327c3`から開始した。次の値は、filesystemにreceiptが見えた数ではなく、LFまでdurableに完結したaudit JSONLだけを合算したものだ。batch保存後・audit追記前の短い区間ではreceiptが最大64件先行し得るため、その未確定値を進捗記録へ混ぜていない。

| UTC時刻                  | fetched |   進捗 | response bytes | unexpected failure / resume |
| ------------------------ | ------: | -----: | -------------: | --------------------------: |
| 2026-07-11T04:21:31Z付近 |  10,997 | 30.25% |    190,944,202 |                       0 / 0 |
| 2026-07-11T04:31:52Z     |  15,797 | 43.46% |    258,797,090 |                       0 / 0 |
| 2026-07-11T04:43:37Z     |  21,365 | 58.78% |    333,234,256 |                       0 / 0 |
| 2026-07-11T04:51:03Z     |  24,885 | 68.46% |    385,067,521 |                       0 / 0 |
| 2026-07-11T04:55:39Z     |  27,061 | 74.44% |    415,839,970 |                       0 / 0 |
| 2026-07-11T05:16:18Z     |  36,349 |   100% |    541,445,115 |                       0 / 0 |

daily ratingのHTTP 404は事前に許可した2件だけで、表のfailureには数えていない。自動retryは発生せず、run tokenも1個のまま完了した。取得と同時に動かしたsub-agentは、network processを増やさず、結果summarizerと次段のlabel-blind role lockだけを監査した。

## live runの最終監査

process自身のclosure、lease解放後のread-only status、別branchのresult summarizerという3経路が同じmanifestと集計を再現した。

| 項目                           |                                                                     live result |
| ------------------------------ | ------------------------------------------------------------------------------: |
| source revision                |                                      `649423d455b5762a697864610d9e8f606cc327c3` |
| 開始 / 終了                    |                         `2026-07-11T03:57:40.891Z` / `2026-07-11T05:16:18.501Z` |
| 所要時間                       |                                                     01:18:37.610 / 4,717,610 ms |
| attempt / resume               |                                                                           1 / 0 |
| fetched / reused receipts      |                                                                      36,349 / 0 |
| daily rating HTTP 200 / 404    |                                                                          88 / 2 |
| total response bytes           |                                                                     541,445,115 |
| unique objects                 |                                                                          36,348 |
| canonical games                |                                                                          36,168 |
| duplicate groups / aliases     |                                                                           0 / 0 |
| audit JSONL                    |                                 573 records / 373,700 bytes / `9412a6d6…44ce52` |
| final manifest bytes / SHA-256 | 23,698,679 / `1479a3a207458c9d3afe6cf9ba88abc6c44fb7b8b0e621aca9d6558637314619` |
| result receipt bytes / SHA-256 |      1,534 / `f48155a5371411f7ea3b27abdf035c86c9df059b5e924620432449c45f650301` |
| offline referential closure    |                            pass / `shogi-floodgate-raw-offline-verification-v1` |

unique objectがreceiptより1少ないのは欠落ではない。2件のdaily-rating 404が同じexact bodyを持ち、CASで1 objectになったためである。36,168 CSAはすべて別bodyで、canonical gameも36,168、duplicate groupは0だった。

result summarizerの独立監査では、読んだmanifest Aではなく別読込Bを検証できる競合、crash後の空・途中auditを拒否する問題、audit rootのABA差替え、BOMでraw SHAを誤る問題、token名FIFOで停止する問題をPR前に再現した。修正後はdirectory FD相対read、lease前後確認、raw-byte二重snapshot、完全行prefix、BigInt inode、timeoutを使い、最終P1/P2は0、ML testは278/278だった。

## raw取得中に先回りして見つけた次段の停止条件

- 合法手が1つしかない親はsibling 2候補契約を満たさない。role lock前にrules-complete合法手2つ以上をlabel-blind条件にし、同じhash/fill順で補う
- search用合法手generatorは飛車角の任意不成を省くため、roleのprotected child IDsとteacherで同じrules-complete helperを使う
- role allocationだけでは`played_move`がない。raw CASを再検証してrole別parent bundleを作り、legacy 8,678 IDとfresh final/selection IDのunionをreplay抽出前に固定する
- 事前登録したwarm initializer `571ca309…65ff8`、replay `2207eba5…a56cb`、Python 3.13.0 / PyTorch 2.12.1環境はexact一致で回収し、安定領域へ複製した

## 高段判定までの残り

raw取得が成功しても、まだ棋力証明ではない。次にrating、対局時rating、合法性、`%TORYO`、diversity cap、semantic isolationをlabelなしで適用し、1,000 / 200 / 200局を固定する。その後だけtraining teacherを作り、同じmodel・loss・seed 42/43/44を学習する。

fresh selection family gateを通った候補だけが、fresh final、未開封WCSC36 final、回帰、384局paired A/Bへ進む。最後の81Dojo 200局は公式COM accountとclientを使う必要があり、外部対局を始める前にユーザーの明示確認を取る。

このログの結論はまだ「強くなった」ではない。現時点の結論は、現在の評価関数を壊さずに、次のcandidateを検証できるraw取得経路が完成した、である。
