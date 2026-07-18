# 将棋評価関数: exact 24,000件の安全検証を5並列へ分離した

> これは評価関数を変更する作業ではなく、変更候補をより早く、同じ厳しさで検証するためのCI改善である。`ml/`、教師生成ロジック、学習データ、候補重み、ライブ重み、本番環境は変更していない。English version: [blog-shogi-floodgate-exact24k-ci-parallel-shards.en.md](./blog-shogi-floodgate-exact24k-ci-parallel-shards.en.md)

> **Publication status: LOCAL VALIDATION PASS; AWS SYNC / REVIEW / GITHUB CI PENDING.** 5本のscanner shard、Teacher、6本を除外した通常unit、JSON reportのexact file / title照合はローカルでPASSした。最新`main`とのAWS aggregate edge同期、PR review、GitHub CIは完了前である。したがって、この記録をremote CI PASSや本番変更の根拠へ読み替えない。

## 1. 結論

以前は、24,000 parentのsealed scannerについてauthority、mutation、replay、cleanup、production publicationを1本のVitest testで直列に実行していた。どれか一つを速くしてもjob全体は分割できず、この1ファイルがCIの長い直列区間になっていた。

今回、同じ検証を次の5本へ分けた。各test fileは独立した一時directory、24,000件のauthenticated fixture、deployment key fixtureを作り、**100 → 500 → exact 24,000**のgateを自分で通す。Vitestのtitle filter (`-t`)やgeneric `--shard`は使わず、workflow matrixがexact file pathを直接渡す。

| shard      | 固定した検証範囲                                                                   | local wall |
| ---------- | ---------------------------------------------------------------------------------- | ---------: |
| authority  | lease capture、premature terminal、key authority拒否                               |    73.98秒 |
| mutation   | pass-two sink失敗、pathname置換、seal MAC破損                                      |   109.28秒 |
| replay     | exact two-pass、opaque facade、single-flight、W / WT / WTR / WTRM replay           |   106.27秒 |
| cleanup    | descriptor close失敗、sticky cleanup failure、plan-level aggregate cleanup失敗     |   135.12秒 |
| production | production plan入力拒否、finalize / publish、result / manifest accounting、zeroize |   105.42秒 |

14-core / 48 GiBのlocal Macで5本を同時起動したとき、scanner群のcritical pathは最長のcleanupと同じ**135.12秒**だった。各processのwall time合計は530.07秒なので、この測定では直列実行に対して約3.92倍のwall-time短縮に相当する。ただしGitHub-hosted runnerのqueue、checkout、`npm ci`を含むremote値ではない。

## 2. 厳しさを落とさずに分けた

速くするために24,000を小さくしたわけではない。shared supportへfixture構築とcleanupを集約したが、各shardの入口は毎回次を実行する。

1. authenticated training identityが24,000 recordsであることを確認
2. fixed V3 contractが24,000 parentsであることを確認
3. fresh workを100、500、24,000の順でcheckpoint / seal
4. shard固有のadversarial scenarioを実行
5. test終了時に一時rootを削除し、mockを復元

旧1本にあったconceptual scenarioを19個の安定IDへ分類した。IDはinventory内で全shardを通じてuniqueでなければならず、重複や不足はunit testとverifierでfail closedになる。

Teacher checkpoint fileはscannerとは別の6本目のheavy fileとして、exact pathで単独jobにした。通常unit jobはこのTeacher 1本とscanner 5本、合計6本を明示的に除外する。除外集合、matrixの5つのID / file pair、Teacherの40個の直接`it(...)` titleと49個のexact runtime titleは一つのmachine-readable inventoryへ固定した。

## 3. 「違うテストが通った」を成功にしない

CIはVitestの終了codeだけを信用しない。各heavy jobはJSON reportを書き、独立verifierが次を要求する。

- reportに含まれるtest fileがinventoryのexact pathと一致
- scannerはinventoryのexact title 1件、Teacherはexact runtime title 49件と一致
- duplicate titleなし
- failed / pending / todo testが0
- failed / pending suiteが0
- file resultと全assertion resultが`passed`
- report全体の`success`がtrue

inventory自身もschema、24,000 parent、`[100, 500, 24000]` gate、5 shard、19 conceptual case ID、40 direct / 49 runtime Teacher title、6 core exclusionを検証する。workflowの配線も読み、fileの抜け・重複、`-t`、`--shard`、required aggregateの欠落を拒否する。test commandはworkflowへ直接固定し、既存のproduction identity evidenceがpinする`package.json`は変更しなかった。

## 4. required checkをfail closedに保つ

既存branch protectionが見る名前を変えないため、最終aggregateは引き続き正確に`Test and build`である。ただし実作業はcore、scanner 5-way matrix、Teacher、external trust-root、Darwin、E2Eへ分け、aggregateは`if: always()`で全jobの`result == success`を明示的に要求する。途中jobがfail、cancel、skipになってもaggregateだけが緑になる経路を作らない。

このbranchのbase revision `ec64549e429803d406383376162eaeb9456df9ef`には、並行開発中の`aws_witness_adapter_contract` jobがまだ存在しない。存在しないjobを`needs`へ書くとworkflow自体が無効になるため、AWS PRが通常mergeされた後に最新`main`へ同期し、そのjobをaggregateの`needs`とresult checkへ追加する。verifierはworkflow内にAWS jobを検出した時点で、このedgeがなければ必ず失敗する。

## 5. ローカル検証と限界

測定環境はmacOS arm64、14 physical / logical CPU、48 GiB RAM、Node 22.13.0、npm 11.14.1である。

| 検証                                               | 結果                                      |
| -------------------------------------------------- | ----------------------------------------- |
| scanner shard                                      | **5 files / 5 tests PASS**                |
| scanner JSON exact file / title verification       | **5 / 5 PASS**                            |
| inventory / adversarial verifier unit tests        | **4 / 4 PASS**                            |
| Teacher exact file / 49-runtime-title verification | **49 / 49 PASS、101.16秒**                |
| core unit with six explicit exclusions             | **186 files、3,221 PASS、1 skip、0 fail** |
| core unit wall                                     | **80.86秒**                               |
| lint / workflow / evidence validation              | **PASS**                                  |
| dependency-free ML contract                        | **119 / 119 PASS、11.59秒**               |
| production build                                   | **PASS、28.87秒**                         |
| local test-only critical path                      | **135.12秒（cleanup shard）**             |
| GitHub Actions                                     | **PENDING — not yet run**                 |
| production `ml/` source changes                    | **0**                                     |
| teacher / training / A/B / external calibration    | **0 / 0 / 0 / 0**                         |
| live weights / production execution                | **0 / 0**                                 |

途中検証では二つの誤った前提も見つかった。第一に、Teacherはsource上の直接`it(...)`が40個でもparameterized case展開後は49 assertionsであり、最初の40-title inventoryはverifierが意図どおり拒否した。第二に、既存evidence testの一部が、歴史的workflow snapshotをpinすることと現在のworkflow全体を永久に同一byteへ固定することを混同し、またrepository全体に`upload-artifact`が1個しかないと仮定していた。歴史的revision / hashは変更せず、live external-trust-root job自身のexact stepを検証する境界へ修正し、関連24 testsと通常unit全体を再PASSさせた。

実測できたlocal test-only critical pathは135.12秒である。GitHub上のqueue、checkout、`npm ci`、lint、buildを含むcritical pathはまだ測っていないため、分単位の予測値は証拠として掲載しない。remote CI、review、AWS edge同期が揃うまではこの候補をmerge-readyとしない。

## 6. 次のgate

1. 論理commitを分けてexact review
2. AWS adapter contract PRを先に通常merge
3. 最新`main`へ同期し、`aws_witness_adapter_contract`を`Test and build` aggregateへ追加
4. inventory / workflow / evidence / unitを再検証
5. ready-for-review PRでGitHub CIを測定し、失敗コメントを修正
6. 全required checkがPASSしてから通常merge

この変更は評価関数を強くしない。教師生成・再学習・候補選抜・formal A/B・外部校正を安全に反復する待ち時間を短くする基盤である。安定した高段、候補の優位、本番投入可否はいずれも未証明で、ライブ重みは変えない。
