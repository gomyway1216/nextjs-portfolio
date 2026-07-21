# 選抜結果をfresh-finalへ渡す終端registry候補を実装

> 2026年7月20日、fresh-selection評価で生成したreport、receipt、完了markerを、
> その評価を開始したREADY registryと4-model再計算へ束縛し、review用の終端registry候補を
> 標準出力だけに生成するローカルbuilderを実装した。実選抜成果物ではまだ実行しておらず、
> live weightも変更していない。English:
> [blog-shogi-floodgate-strength-first-selection-publication-registry-candidate.en.md](./blog-shogi-floodgate-strength-first-selection-publication-registry-candidate.en.md)

## 何を解決するか

selection evaluatorは同一実行で次の3ファイルをprivateな`0600`として保存する。

1. `selection-evaluation-report.json`
2. `selection-receipt.json`
3. 最後に保存する`selection-publication-result.json`

fresh-final teacherは、これら3 identityがtracked registryへreview登録された
`candidate-selected-publication-enrolled`状態だけを受理する。しかし以前は、READYから
この終端状態を安全に組み立てる専用commandがなかった。今回のbuilderはその欠けた接続だけを
追加する。tracked fileを直接編集せず、候補JSONをstdoutへ1回出す。

固定commandは次である。

```sh
~/.codex/shogi-data/floodgate-training-venv/bin/python3 \
  ml/build_strength_first_selection_publication_registry_candidate.py
```

引数やpath overrideは受け付けない。

## 出力前に再計算するもの

builderは次の順序でfail closedする。

1. tracked registryがREADY、または既に同一の終端状態であることを検証する。
2. READY preimageをcanonical JSONへ直し、そのbytes / SHA-256 identityを再構築する。
3. tracked protocol、実装source、training plan、3-checkpoint preflight identityを現在の
   exact fileへ照合する。
4. 固定private pathからreport、receipt、publication resultを安定readし、それぞれの
   bytes / SHA-256 / schema identityを作る。
5. publication resultがREADY preimage、report、receipt、選抜seed、選抜checkpointを
   正確に指していることを確認する。
6. 同じselection datasetをstable + seed 42 / 43 / 44の4 checkpointで再評価し、
   保存済みreportと完全一致させる。そこからreceiptのmetric gate、順位、中央値代表、
   family gate、選抜checkpointを再構築する。
7. すべてのtracked / private入力を再readし、途中変更がないことを確認してから、
   終端candidateをstdoutへ出す。

既に同じ終端registryがtrackedであれば、再実行結果は完全一致しなければならない。
report改ざん、report / receipt取り違え、再計算不一致、終端identityのreplay差分は
すべて候補出力前に拒否する。

## このcommandが読まないもの

このbuilderはfresh-final source、fresh-final label、downstream READY registry、正式A/B、
外部較正、production weightを読まない。network、AWS、GCP、Vercelも使わない。
役割は選抜publicationからreview可能なdata-only候補を作るところまでで、tracked registryの
更新やmerge、fresh-final開始、live昇格を許可しない。

## 検証と現時点の境界

synthetic READY registryと合成report / receipt / markerを使った標準ライブラリtestで、
正しい終端identity、4 checkpoint再計算、stdout-only、改ざん、取り違え、replay mismatch、
idempotence、downstream / fresh-final非readを確認した。関連するselection evaluatorと
fresh-final preflightを合わせたfocused suiteは31 / 31 PASSした。

これは棋力向上の測定結果ではない。公開時点の実builder invocation、実publication read、
fresh-final read、formal A/B、外部較正、live weight変更はすべて0である。次は3-seed学習と
fresh-selection評価が実完了した後、このcommandのstdoutを通常PRでreviewし、終端identityを
登録する。その証拠が一致した場合だけfresh-finalへ進む。

機械可読記録:
[floodgate-strength-first-selection-publication-registry-candidate-2026-07-20.json](./data/floodgate-strength-first-selection-publication-registry-candidate-2026-07-20.json)
