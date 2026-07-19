# 将棋評価関数: exact 24,000件の安全検証を5並列へ分離した

> これは評価関数を変更する作業ではなく、変更候補をより早く、同じ厳しさで検証するためのCI改善である。`ml/`、教師生成ロジック、学習データ、候補重み、ライブ重み、本番環境は変更していない。English version: [blog-shogi-floodgate-exact24k-ci-parallel-shards.en.md](./blog-shogi-floodgate-exact24k-ci-parallel-shards.en.md)

> **Publication status: LOCAL VALIDATION PASS; AWS PR #508 MERGED; POST-MERGE MAIN CI PASS; CURRENT-BRANCH GITHUB CI PENDING.** AWS source-only contractは通常merge commit `42d8757dde054f969942b9995f6b254c845839c5`で`main`へ入り、このbranchもmerge commit `2a9031513b190382f2fcfd5717fb8c87f4e92bdd`で同期した。post-merge main CI run `29672131794`は5 / 5、security run `29672131782`は1 / 1で成功した。一方、このexact-24k branch自身のGitHub CIとPR reviewはまだ実行していない。AWS jobはsource-only / unconnectedのままで、production credential、network、service、ライブ重みには接続していない。

## 1. 結論

以前は、24,000 parentのsealed scannerについてauthority、mutation、replay、cleanup、production publicationを1本のVitest testで直列に実行していた。どれか一つを速くしてもjob全体は分割できず、この1ファイルがCIの長い直列区間になっていた。

今回、同じ検証を次の5本へ分けた。各test fileは独立した一時directory、24,000件のauthenticated fixture、deployment key fixtureを作り、**100 → 500 → exact 24,000**のgateを自分で通す。Vitestのtitle filter (`-t`)やgeneric `--shard`は使わず、workflow matrixがexact file pathを直接渡す。

| shard      | 固定した検証範囲                                                                   | local wall |
| ---------- | ---------------------------------------------------------------------------------- | ---------: |
| authority  | lease capture、premature terminal、key authority拒否                               |    75.74秒 |
| mutation   | pass-two sink失敗、pathname置換、seal MAC破損                                      |   112.35秒 |
| replay     | exact two-pass、opaque facade、single-flight、W / WT / WTR / WTRM replay           |   108.69秒 |
| cleanup    | descriptor close失敗、sticky cleanup failure、plan-level aggregate cleanup失敗     |   138.54秒 |
| production | production plan入力拒否、finalize / publish、result / manifest accounting、zeroize |   107.60秒 |

14-core / 48 GiBのlocal Macで5本を同時起動したとき、scanner群のcritical pathは**138.589秒**だった。各processのwall time合計は542.92秒なので、この測定では直列実行に対して約3.917倍のwall-time短縮に相当する。ただしGitHub-hosted runnerのqueue、checkout、`npm ci`を含むremote値ではない。

## 2. 厳しさを落とさずに分けた

速くするために24,000を小さくしたわけではない。shared supportへfixture構築とcleanupを集約したが、各shardの入口は毎回次を実行する。

1. authenticated training identityが24,000 recordsであることを確認
2. fixed V3 contractが24,000 parentsであることを確認
3. fresh workを100、500、24,000の順でcheckpoint / seal
4. shard固有のadversarial scenarioを実行
5. test終了時に一時rootを削除し、mockを復元

旧1本にあったconceptual scenarioを19個の安定IDへ分類した。独立監査後は、これらをinventory上の説明だけにはしていない。各scenarioの検証が終わった位置でordered runtime receiptへIDを追加し、全件が正しい順序で揃わなければreceiptをsealできない。5本のVitest reportにはauthority 3、mutation 3、replay 6、cleanup 3、production 4、合計19件が実際のruntime testとして現れる。架空ID、順序違反、重複、不足はfail closedになる。

Teacher checkpoint fileはscannerとは別の6本目のheavy fileとして、exact pathで単独jobにした。通常unit jobはこのTeacher 1本とscanner 5本、合計6本を明示的に除外する。除外集合、matrixの5つのID / file pair、Teacherの40個の直接`it(...)` titleと49個のexact runtime titleは一つのmachine-readable inventoryへ固定した。

## 3. 「違うテストが通った」を成功にしない

CIはVitestの終了codeだけを信用しない。各heavy jobはJSON reportを書き、独立verifierが次を要求する。

- reportに含まれるtest fileがinventoryのexact pathと一致
- scannerはimmutable runtime case集合（3 / 3 / 6 / 3 / 4件）、Teacherはexact runtime title 49件と一致
- duplicate titleなし
- failed / pending / todo testが0
- 各targetのsuiteがexact 2 / 2 PASSで、suite / test counterが非負整数かつ内部整合
- `assertionResults`件数、title集合、statusがcounterと一致
- file resultと全assertion resultが`passed`
- report全体の`success`がtrue

inventory自身もschema、24,000 parent、`[100, 500, 24000]` gate、5 shard、19 runtime case ID、40 direct / 49 runtime Teacher title、6 core exclusionを検証する。workflowは文字列検索ではなく、checked-inのstrict parserでjob、matrix、step、`run`、`needs`を構造として読む。コメント内の偽配線、decoy文字列、duplicate、disabled step、欠落したresult checkは成功扱いにならない。scanner / Teacher reportは隠しdirectory `.artifacts`から必ずuploadし、`include-hidden-files: true`かつ`if-no-files-found: error`を要求する。test commandはworkflowへ直接固定し、既存のproduction identity evidenceがpinする`package.json`と`package-lock.json`は変更しなかった。

## 4. required checkをfail closedに保つ

既存branch protectionが見る名前を変えないため、最終aggregateは引き続き正確に`Test and build`である。ただし実作業はcore、scanner 5-way matrix、Teacher、external trust-root、AWS source-only contract、Darwin、E2Eへ分け、aggregateは`if: always()`で全jobの`result == success`を明示的に要求する。途中jobがfail、cancel、skipになってもaggregateだけが緑になる経路を作らない。

初期base revision `ec64549e429803d406383376162eaeb9456df9ef`にはAWS jobがなかったが、[PR #508](https://github.com/gomyway1216/nextjs-portfolio/pull/508)は`42d8757d`として通常mergeされ、このbranchは`2a903151`でその`main`をmergeした。現在のworkflowでは`aws_witness_adapter_contract`を7本の固定required jobの一つとして無条件に要求する。AWS jobだけでなく、そのaggregate `need`とresult checkまで一緒に削除してrequired集合を縮める改ざんもrejectする。

このrequired化はAWSを本番へ接続する操作ではない。job名どおりSDK-freeなsource contractとpublic surface / isolationを検証するだけで、AWS SDK client、credential、endpoint、network call、production connectorはいずれも接続していない。

## 5. ローカル検証と限界

測定環境はmacOS arm64、14 physical / logical CPU、48 GiB RAM、Node 22.13.0、npm 11.14.1である。

| 検証                                                | 結果                                            |
| --------------------------------------------------- | ----------------------------------------------- |
| scanner shard                                       | **5 files / 19 tests / 10 suites PASS**         |
| scanner JSON exact file / runtime-case verification | **5 / 5 PASS**                                  |
| inventory / adversarial verifier unit tests         | **13 / 13 PASS（Node 22）**                     |
| Teacher exact file / 49-runtime-title verification  | **49 / 49 PASS、101.16秒**                      |
| core unit with six explicit exclusions              | **187 files、3,229 PASS、1 skip、0 fail**       |
| core unit wall                                      | **81.54秒**                                     |
| lint / workflow / evidence validation               | **PASS**                                        |
| dependency-free ML contract                         | **119 / 119 PASS、11.59秒**                     |
| production build                                    | **PASS、28.87秒**                               |
| local test-only critical path                       | **138.589秒（5 shard同時起動）**                |
| first rereview focused validation                   | **5 files / 37 tests PASS**                     |
| final integrated rereview validation                | **5 files / 37 tests PASS（Node 22）**          |
| post-merge `main` CI / security                     | **29672131794: 5 / 5、29672131782: 1 / 1 PASS** |
| current exact-24k branch GitHub Actions             | **PENDING — not yet run**                       |
| production `ml/` source changes                     | **0**                                           |
| teacher / training / A/B / external calibration     | **0 / 0 / 0 / 0**                               |
| live weights / production execution                 | **0 / 0**                                       |

途中検証では三つの誤った前提も見つかった。第一に、Teacherはsource上の直接`it(...)`が40個でもparameterized case展開後は49 assertionsであり、最初の40-title inventoryはverifierが意図どおり拒否した。第二に、既存evidence testの一部が、歴史的workflow snapshotをpinすることと現在のworkflow全体を永久に同一byteへ固定することを混同し、またrepository全体に`upload-artifact`が1個しかないと仮定していた。歴史的revision / hashは変更せず、live external-trust-root job自身のexact stepを検証する境界へ修正した。第三に、汎用YAML packageを直接追加する案はproduction identity回帰testが拒否したため撤回した。依存追加なしのstrict structural parserへ置き換え、`package.json`とlockfileを元のexact byteへ戻した。

独立再レビューは二段階で行った。第一再レビューは**P1 1件 / P2 2件**だった。P1は全required jobのexact keyとjob-level `if` / `continue-on-error`拒否、P2はscanner / Teacherのexact ordered step・upload contract、およびown-property shard ID / prototype-safe YAML mappingの不足である。`4c923ccb`で修正し、改ざんnegative testを追加した。第二再レビューは**P1 1件 / P2 1件**だった。P1はAWS merge後もrequired集合をjob存在に応じて縮められたこと、P2は日英記事とevidenceがpre-merge pending表現のままだったことである。P1は`a34b76fe`でAWSを無条件requiredにして削除mutationを拒否し、P2は本節とmachine-readable evidenceで現在事実へ更新した。

実測できたlocal test-only critical pathは138.589秒である。post-merge `main`のCI / securityは成功したが、現在のexact-24k branch headについてGitHub上のqueue、checkout、`npm ci`、lint、buildを含むcritical pathはまだ測っていない。AWS source contractもproductionへ未接続である。現branchのremote CIとreviewが揃うまではこの候補をmerge-readyとしない。

## 6. 次のgate

1. 分離したcode / evidence commitをfinal exact review
2. inventory / workflow / evidence / unitをNode 22で再検証
3. ready-for-review PRで現branchのGitHub CIを測定
4. actionable review commentとCI failureだけを修正
5. 全required checkがPASSしてから通常merge

この変更は評価関数を強くしない。教師生成・再学習・候補選抜・formal A/B・外部校正を安全に反復する待ち時間を短くする基盤である。安定した高段、候補の優位、本番投入可否はいずれも未証明で、ライブ重みは変えない。
