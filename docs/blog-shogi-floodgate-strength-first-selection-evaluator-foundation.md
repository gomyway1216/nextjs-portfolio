# strength-first fresh selectionを実評価まで接続した

> 2026年7月19日、3つの学習済みcheckpointを同じfresh selectionで実評価し、固定gateを通った代表seedだけをprivacy-safeな受領証へするREADY経路を実装した。現在のregistryは、実24,000 teacher・3-seed学習・selection teacherがまだ揃っていないため閉じている。したがってこの変更で実selection labelは読まず、候補も選ばず、ライブweightも変えていない。English version: [blog-shogi-floodgate-strength-first-selection-evaluator-foundation.en.md](./blog-shogi-floodgate-strength-first-selection-evaluator-foundation.en.md)

## 結論

今回追加したのは「将来の契約だけ」ではない。必要なidentityがdata-only registryへ登録された後に、同じ引数なしcommandが次の処理を最後まで実行する。

1. exact-cleanなrevisionと、固定された実装source・plan・selection preflight registryを検証する。
2. 既存のpublic one-shot preflightを使い、seed 42・43・44の`result.json`と`final.pt`がすべてidentity検証・strict-loadを終えたことを確認する。
3. その後にだけ、固定private pathのfresh-selection raw、selection-teacher authority、manifest、result、dataset、stable checkpointを開く。
4. stableと3候補を同じselection datasetでfloat / production-exact int16の両方について各1回評価する。
5. 固定metric順、4つのper-seed gate、3-seed family gateを再計算する。
6. gateが通った場合だけ、絶対path・SFEN・局面ごとのteacher scoreを含まない受領証を`0600`で排他的にpublishする。

既存fileを上書きせず、一時fileを`fsync`してからhard-linkでfinal nameを排他的に作る。途中書き込みや2回目の実行で、既存receiptを置換しない。

## なぜ専用adapterが必要だったか

既存の`eval-sibling.py`にあるtensor load、float評価、int16量子化、productionと同じinteger forward、pair / top-1 / MAE計算はそのまま再利用した。

一方、既存の高水準`evaluate_checkpoints`は、trainingとselectionが1つのteacher / partition manifestから同時に作られる旧実験を前提にしている。strength-first planでは、selection labelは3つのfinal checkpointがstrict-loadされた**後**に別teacher runで生成される。この2つのmanifestを同一扱いすると、正しい実行でもprovenance mismatchになり、無理に合わせると逆に隔離条件を壊す。

そこで`strength_first_qat_selection_eval_adapter.py`は、実metric coreだけを再利用し、次の責務を分けた。

| 責務 | 検証元 |
|---|---|
| 3候補がfinal-onlyでstrict-load済み | 既存strength-first preflight |
| selection labelの元が固定4,800 parent | role-bundle resultとteacher authority |
| teacherが全parentをaccountした | authority / manifest / resultの同一completion |
| datasetとcheckpointが評価中に不変 | 評価前後のbytes / SHA-256 |
| float / int16 metric | 既存の実`eval-sibling.py` core |
| 代表seedとgate | 既存のgeneric selection gate |

## timeoutやskipをlabelとして数えない

selection-teacher completionは`input_parents = completed_parents = 4,800`を要求する。合法手が2つ未満のparentだけは、理由を明示して`forced_parents_skipped`へ数えられ、`emitted_parent_groups + forced_parents_skipped = 4,800`を満たさなければならない。

`search_timeout_no_label`は許可fieldに含めていない。timeout parentを「評価済みlabel」として数えたり、dataset rowを作ったりしたauthorityは拒否される。datasetも、各emitted parentに最低2候補があり、実loaderが返すparent / row数とauthority accountingが一致しなければ停止する。

## 並列数の正確な説明

registryの`max_workers = 2`は上限である。今回の実adapterはdatasetを1回だけloadし、4モデルを順番に評価するため、reportへ`actual_workers = 1`と記録する。2 workerを動かしたという主張はしていない。

selection datasetをprocessごとに複製してメモリとI/Oを増やすより、まずexactな実経路を固定した。将来2-process化する場合は、同じ評価を二重実行しないことと、各processが同じdataset fingerprintを使うことを別のreviewed changeで証明する必要がある。

## checkpoint preflight hashの接続修正（2026年7月20日）

selection teacher preflightは、`checkpoint_preflight_sha256`をcanonical UTF-8 JSON payloadそのもの、つまり末尾LFなしのbytesから作る。evaluatorは以前、受領証file用の末尾LF付きserializerをこの再計算にも使っていたため、実teacher authorityとREADY registryを同時に満たすhashが存在しなかった。

evaluatorのpayload hashとfile serializationを分離し、producerと同じ末尾LFなしの契約へ統一した。実teacher-preflight builderのsummaryをREADY evaluatorへ渡すcross-interface regressionも追加した。受領証fileの末尾LFは維持し、registryの`null`値、private artifact、実selection、ライブweightは変更していない。

## 現在の閉じた状態

引数なしcommandは次である。

```sh
python3 ml/strength_first_qat_selection_evaluator.py
```

現在はtracked registryの全identityが`null`なので、commandはprivate selection artifact、checkpoint、Torch evaluatorを開く前に`STOP`する。READYへ変えるには、次の実identityが揃った後のdata-only reviewが必要である。

- exact strength-first training plan
- 3つのfinal result / checkpointを登録したselection preflight registry
- そのcheckpoint setへ結び付くselection-teacher authority / manifest / result / dataset
- stable checkpoint
- evaluator、adapter、preflight、実metric coreのsource identity

## synthetic検証

focused suiteはproductionと別の弱いcoreを試していない。productionが使う同じclosed / READY compositionへ、filesystem・preflight・evaluator・publisherだけをdependency injectionしている。

確認した失敗条件には、candidateの不足・追加・重複・順序変更、plan / preflight hash drift、teacher fingerprint drift、incomplete accounting、partial report、NaN、family gate failure、評価中のdataset / tracked plan変更、one-shot receipt再利用、既存output上書きが含まれる。

これらはsynthetic evidenceであり、実teacher、実学習、実selection、棋力向上の結果ではない。final holdout、正式A/B、外部対局、ライブweightは未使用・未変更である。
