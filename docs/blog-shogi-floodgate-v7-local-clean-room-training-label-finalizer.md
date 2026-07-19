# sealed 24,000件だけを受け取るMacローカルlabel finalizer

> Floodgate v7のclean-room教師runnerは、100件、500件、24,000件を同じ認証済みstreamで順に作り、最後にsealed handoffを残すところで意図的に停止する。本変更は、そのhandoffだけを別の明示的なMacローカルcommandで受け取り、既存のproduction sealed scannerとtraining-label finalizerへ渡す境界を追加した。AWS、Firebase / GCP、Vercel、HTTP、実教師生成、optimizer学習、weight変更、対局、live activationは使っていない。English version: [blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.en.md](./blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.en.md)

## 1. AWSはどこで使うのか

このfinalizerではAWSを使わない。Firebase Cloud FunctionsはGCPであり、VercelはWeb deployment先だが、この処理はそのどちらにも接続しない。固定されたMacローカルのprivate directory、ローカルengine asset、検証済みtraining input、stage directoryだけを扱い、network clientやcloud SDKをimportしない。

以前の設計にAWS関連のwitness / supervisor案が存在しても、それは別の外部信頼境界である。ローカルで教師データを作ってlabel artifactを確定するための必須条件ではない。この変更が主張するのは「AWS上でないこと」の一般証明ではなく、AWS API、Firebase / GCP、Vercel、networkをこのcommandが使用しないことだけである。

## 2. なぜ別finalizerが必要か

100件と500件はthroughputやresumeを確認するdurable prefixであり、学習datasetとして公開してはいけない。24,000件まで同じworkを継続してsealしても、教師runner自身がその場でlabel publicationまで行うと、次の境界が一つの長時間processへ混ざる。

- prefix検証とfinal publication
- checkpoint keyとlabel finalizer key authority
- training inputのpostflight
- stage leaseのownership移転
- publication後のdestination再監査

そこで教師runnerは、固定key ID、exact run binding、stage identity、work bytes / SHA-256、ordered 100 / 500 / 24,000 completion receiptをHMAC付きprivate handoffへ保存し、`labels_finalized=false`のまま終了する。今回のcommandだけがそのhandoffを消費し、sealed 24,000件以外を拒否する。

## 3. 固定した実行境界

専用package commandは次で、引数を受け取らない。

```sh
npm run shogi:floodgate-v7-local-clean-room-training-label-finalizer
```

ただし、この記事時点では実handoffを使ったcommand実行は0回である。CI、独立review、通常merge、安全な実教師runが完了する前にoperatorが先行実行するための案内ではない。

operational entryはprivate fileを開く前に、Darwin、非root current EUID、repository root、専用entry file、`require.main`、引数なしのexact `argv`を検査する。Linux、別scriptからのimport呼び出し、追加引数は`capture` phaseでSTOPする。

独立reviewでは、以前のexport済みtest seamが実行可能callbackをdependencyとして受け取れたため、production-shaped callbackを渡すとこのoperational contextと後述のclaimを迂回できる問題も見つかった。修正後のtest seamは**実行可能dependencyを受け取らない**。module内で固定したin-memory scenario名だけを受け取り、production authorityへ到達できない。実stage authorization、scanner、publicationへ進む経路はmodule-private one-shot grantを必須とし、そのgrantはoperational command contextの検証とdurable claimの確定後にだけ発行する。任意callbackを渡す回帰testでは、production-shaped functionが1回も呼ばれずSTOPすることを確認した。

その後に読むのは固定private state内の次の2 fileだけである。

- 32-byte local integrity key
- canonical JSONの`finalizer-handoff.json`

directoryはcurrent ownerの`0700`、fileはcurrent ownerのsingle-link `0600`を要求する。`O_NOFOLLOW`で開き、held descriptorとnamed pathのdevice / inode、size、mtime、ctimeを読み取り前後で照合する。path、key、MAC、run ID、row内容はpublic receiptへ出さない。

PR reviewでは、既定のUTF-8 decoderが先頭BOMを除去するため、正しいMACを持つhandoffへBOMだけを前置した別byte列がcanonical照合を通る問題も見つかった。修正後はBOMをdecoderから隠さずexact byte照合へ残すため、valid MACでもBOM付きframingを拒否する。producerとfinalizerが共有するUTF-8 bytewise key orderは、UTF-16 code-unit orderとは一致しないため変更していない。

## 4. handoffのexact検証

stage authorizationより前に、次をすべて検証する。

| 検証対象    | 必須条件                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| framing     | UTF-8、1行、末尾LF、canonical JSON、extra fieldなし                               |
| integrity   | 固定domain HMAC-SHA256、32-byte local key                                         |
| deployment  | current fixed deployment checkpoint key ID                                        |
| run binding | fixed plan、producer control、runtime receipt digest、canonical binding digest    |
| stage       | fixed basenameとparent / stage device・inode                                      |
| work        | fixed filename、bytes / SHA-256、24,000 parents、resume 500、sealed=true          |
| input       | accepted verifier revision、training role、24,000 parents                         |
| completion  | prefix 100 → prefix 500 → sealed final 24,000のexact order                        |
| claims      | cloud / network / training / weight / match / playing-strength claimがすべてfalse |

HMACが正しくても、100件、500件、未seal、別stage、別key、別binding、completion順序変更、cloud使用claimを含むhandoffは拒否する。stageを認可した直後とsealed planを作る直前にもfixed fileを読み直し、最初に検証したhandoffとcanonical byte-equivalentであることを要求する。

## 5. 再起動をまたぐreplay防止

最初の実装はprocess内`Set`で同じMACを拒否していた。しかしCLIを再起動すると`Set`は空になるため、stage authorization前の失敗後に同じhandoffを再利用できた。独立reviewでこの欠陥を見つけ、process-local guardを削除した。

現在はstage authorizationより前に、固定private stateへ`finalizer-handoff.claimed.json`を一度だけ作る。

- `O_NOFOLLOW | O_CREAT | O_EXCL`
- owner-only `0600`
- handoff MACそのものではなく、そのSHA-256とrun-binding / work digestを記録
- file内容をwrite後にfile `fsync`
- directory `fsync`
- held / named device・inode、mode、link count、size、canonical contentを再検証

最初のprocessがclaimを確定すると、次のprocessは`O_EXCL`で必ず失敗する。途中で失敗してもclaimは削除せず、fresh authenticated handoffか手動reconciliationを要求する。別processを2回起動する動的testで、1回目の成功と2回目のreplay拒否を確認した。

## 6. 既存production APIの合成

handoff検証後に新しいfinalization実装を複製せず、次の既存APIを順番に合成する。

1. fixed stage authorization
2. pinned training rowsのconsumerとpostflight
3. authenticated sealed-work scannerによるfinalization plan
4. exact-prefix training-label finalizer
5. exclusive destination publicationとdestination content再検証

成功receiptは24,000 parents、training record count、work / train / result / manifestのbytesとSHA-256だけを返す。実file evidenceに含まれるfilename、device、inode、`0600` modeも内部でexact検証するが、public receiptには出さない。

prefix 100 / 500からplanを作る経路はない。finalizerへ渡すwork identityはhandoffのexact bytes / SHA-256であり、run ID、deployment key ID、run bindingも同じ値をproduction plan composerへ渡す。

## 7. 失敗時のownership

| 失敗位置                              | 動作                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| stage binding / consumer開始前        | caller-owned leaseをclose                                                          |
| plan作成済み、consumer postflight失敗 | production discard APIでplanを破棄                                                 |
| plan composerがthrowしplanを返さない  | ownership移転点を外側から判別できないため、unsafe closeをせずmanual reconciliation |
| finalizer呼び出し後                   | publication済みの可能性をtrueにしてmanual reconciliation                           |
| final receipt不一致                   | publication-sensitive failureとしてSTOP                                            |

plan composerはbegin前ならcallerがleaseを所有し、begin後ならscanner transactionが所有する。throwだけからどちらかを決めて外側がcloseすると二重closeやpublication raceになり得るため、ここは「自動cleanupしない」ことが安全動作である。

## 8. ローカル検証結果

前提だったteacher preparationのPR #512は`origin/main`の`88afd052`へ通常merge済みで、このbranchにも通常merge commit `4855f099`として統合した。競合解消ではPR #512の固定Git実行と`http.postBuffer`だけを許容するlocal configuration規則を保持し、finalizer package commandも残した。この統合中にもreal teacher / finalizer / training / live操作は実行していない。

| 検証                                 |           結果 |
| ------------------------------------ | -------------: |
| 専用adversarial / lifecycle tests    |   27 / 27 PASS |
| 証拠pin整合test                      |     4 / 4 PASS |
| 関連21 test files                    | 199 / 199 PASS |
| 関連suite wall time                  |       141.35秒 |
| targeted ESLint                      |           PASS |
| Prettier check                       |           PASS |
| 新規source / testのTypeScript error  |              0 |
| real fixed-path finalizer invocation |              0 |

攻撃caseにはwrong MAC、wrong key、wrong binding digest、binding内容変更、wrong stage、prefix 100 / 500、unsealed work、wrong resume、wrong input role、completion reorder、cloud claim、extra / duplicate key、noncanonical JSON、valid MAC付き先頭UTF-8 BOM、途中mutation、別process replay、simulated Linux、実行可能dependency injection、consumer / plan / finalizer failureを含む。

PR #513の独立再reviewでは、READMEに残った古いbyte / hash / test件数をmachine evidenceへのauthoritative参照へ置き換え、BOM alternate framingを拒否するP2修正を追加した。UTF-8 bytewise comparatorをJavaScriptの`<`へ変える提案は、U+E000とU+10000で順序が逆転しproducer / finalizerのcanonical HMAC contractを壊すため採用しなかった。修正後のexact source / testではP0 / P1 / P2が0 / 0 / 0である。

証拠JSONは説明だけではなく、PR #512を含むintegrated implementation commitとtree、両parentとancestor関係、4つの実装fileのbytes / SHA-256 / Git blob、必須source marker、日英記事の境界説明、実operationが0であることをhermetic testで再計算する。これにより、実装を変更したのに古いhashや記事だけが残る状態はtest failureになる。証拠だけを追加するcommit自身は自己参照hashにできないため、pin対象は直前の最終実装commitに固定している。

通常のTurbopack buildは、このworktreeの`node_modules`がworktree外を指すsymlinkであるため開始時に停止した。webpack buildはcompileを28.6秒で完了し、その後、既存の無関係な`src/app/api/settli/groups/route.ts`の`verifyPasscode` exportでtype-check停止した。したがってrepository production buildのPASSは主張しない。

## 9. 現在地と次

この変更で評価関数の強さは変わっていない。実教師process、24,000件work、final label publication、optimizer training、候補選抜、formal A/B、外部校正、live weight activationはすべて未実行である。

PR #512を統合したこのbranchはready-for-reviewの[PR #513](https://github.com/gomyway1216/nextjs-portfolio/pull/513)として公開済みで、独立再reviewと2件のreview thread対応は完了したが、まだmergeしていない。次はremediation後の最新HEADでCIを完走し、通常mergeする。その後だけ、Macローカルclean-room教師runを100 → 500 → 24,000の順に実行し、sealed handoffをこの別commandでfinalizeする。完成datasetを検証してから3 seed再学習、候補選抜、formal A/B、外部校正へ進む。高段相当の安定棋力は、その対局証拠が揃うまで未証明のままである。

Machine-readable evidence: [floodgate-v7-local-clean-room-training-label-finalizer-2026-07-19.json](./data/floodgate-v7-local-clean-room-training-label-finalizer-2026-07-19.json)
