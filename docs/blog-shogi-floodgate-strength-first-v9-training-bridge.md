# v9教師から3-seed再学習へ渡すbridge

> 2026年7月20日、strength-first v9教師の完成物をseed 42 / 43 / 44の
> 再学習へ渡すbridgeを実装し、実物同型の小規模データで検証した。
> 正式v9教師は記録時点で稼働中で、最終`result.json`はまだない。
> したがってexact plan、実再学習、候補選抜、live weight変更はまだ0である。
> English version:
> [blog-shogi-floodgate-strength-first-v9-training-bridge.en.md](./blog-shogi-floodgate-strength-first-v9-training-bridge.en.md)

## 結論

v9教師が完了したら、教師データを作り直さず、そのまま3-seed学習候補へ進める入口を用意した。
ただし「ファイルのhashが同じ」だけでは通さない。24,000 raw局面、全work entry、
parent completion、全training group、manifest、staged result、100 / 500 milestone、
outer resultを一つの意味連鎖として再検証してからだけplan候補を作る。

| 項目 | 記録時点 |
| --- | --- |
| v9 semantic bridge | 実装・focused検証済み |
| 正式v9教師 | 稼働中 |
| 最終v9 result / exact plan | なし / なし |
| 実3-seed学習 | 0 |
| 候補選抜 / formal A/B | 0 / 0 |
| live weight変更 | 0 |

## なぜv8用bridgeをそのまま使えなかったか

学習データの行形式は共通でも、v9の完成証拠はv8と同じ形ではない。

- v9は固定manifestとtraining bytesを教師実行の前後で再認証し、同一性を確認してから
  resultをcommitする。
- authorityはv9 search policyからv8 asset authority、さらに固定asset証拠へ入れ子になる。
- 候補提案はMultiPV 12 / depth 14、各候補の独立再採点はdepth 16である。
- 実測で選んだ並列数は13、Hashは各512 MiBである。
- `proposal_incomplete_no_label`が第3の型付きskip理由になり、timeoutとの共通上限を守る。

旧bridgeはv8 schema、v8 postflight、12 engine、depth 16 proposal、2種類のskip理由を
固定していた。表面のfield名だけ合わせる変換では、v9で守ったsearch条件を落としてしまう。
今回の変更はshared verifierへ世代を明示し、それぞれの完全な意味条件を検証する。

## 検証する内容

新しいargumentless v9 verifierは固定ローカルpathだけを読み、`work.jsonl`はstream処理する。
成功時に返すのは親数、採用group数、理由別skip数、train行数だけで、privateな局面IDや
digestは返さない。

検証は次の順でつながる。

1. v9 outer result、fast-input preflight / postflight、入れ子authority、runner条件を確認
2. manifestのd14 proposal、d16 exact rescore、13 engine、runtime policyとfingerprintを再計算
3. 全work rowを既存teacher validatorへ戻し、候補集合、score、skip理由、親順序を再検証
4. 100 / 500 milestoneを実work prefixのbytesと件数へ結合
5. parent completionとtraining groupをraw入力から再構成
6. manifest、staged result、outer resultの全aggregateとfile bindingを相互照合

これにより、宣言JSONとfile identityだけを合わせ、内容の意味を変えたartifactは学習へ進めない。

## plan v3とv8互換

v8由来のreview済みplanは従来の
`shogi-floodgate-strength-first-qat-training-plan-v2`として引き続き検証できる。
v9由来の新規planはsource generationを取り違えないよう
`shogi-floodgate-strength-first-qat-training-plan-v3`にした。

学習結果とfinal checkpointのschemaはv2のままである。モデル構造、loss、warm initializer、
lr `1e-4`、20 epochs、batch 256、seed 42 / 43 / 44、final epochだけを候補にする条件は
変えていない。変更したのは「どの教師証拠からplanを発行できるか」という入口だけである。

正式v9教師の最終resultが出た後、次のcandidate builderが実identityをstdoutへ出す。

```sh
python3 ml/build_strength_first_qat_training_plan_candidate.py
```

その候補をreviewしてexact planとして登録した後だけ、次のlauncherが3 processを並列に始める。

```sh
python3 ml/run_strength_first_three_seed_training.py
```

seed 42 / 43 / 44はすべてspawnしてから待機へ入り、1つが失敗すれば残りも停止する。
選抜・holdout・production weight書込みの権限はこのbridgeにない。

## 検証結果と限界

Pythonのbridge / builder / launcherはfocused 31 test、TypeScriptのv8 / v9 semantic chainは
focused 5 testをPASSした。v9 testは小規模な実物同型runを実際に生成し、depth 14 proposalと
depth 16独立再採点、fast-input二重確認、13 engine、第3 skip aggregate、privacy-safe出力、
改ざん時のfail-closedを確認した。v8回帰も同じsuiteで通した。

これは「教師完成後に安全に再学習へ渡せる」実装証拠であり、棋力向上の証拠ではない。
正式v9教師はまだ完了しておらず、学習も始めていない。高段安定は3-seed学習、fresh selection、
sealed holdout、正式paired A/B、外部校正を通過して初めて判断する。証拠が揃うまでlive weightは
変更しない。

機械可読記録:
[floodgate-strength-first-v9-training-bridge-2026-07-20.json](./data/floodgate-strength-first-v9-training-bridge-2026-07-20.json)
