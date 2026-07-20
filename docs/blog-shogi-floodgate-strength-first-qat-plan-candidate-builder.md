# 将棋評価関数: v7 teacher完了物から3-seed学習plan候補を作る入口を準備

> 2026年7月19日、実24,000-parent teacherの完了後に、固定3-seed学習へ渡すexact plan候補を
> stdoutへ出すargumentless builderを実装した。最初の実測ではactive lock、lock解放後の
> 再測定では`result.json`未公開により、どちらも大容量scanやTorch runtime probeより前で
> expected `STOP`した。tracked plan、optimizer step、candidate checkpoint、selection、
> live weight変更はすべて0のままである。English version:
> [blog-shogi-floodgate-strength-first-qat-plan-candidate-builder.en.md](./blog-shogi-floodgate-strength-first-qat-plan-candidate-builder.en.md)

## 結論

teacherが終了しても、そのfileをそのまま学習へ渡すことはできない。3つの学習processが同じ
24,000-parent source、同じ完了accounting、同じruntimeを使うように、実bytes / SHA-256を
tracked planへ固定する必要がある。

今回追加した入口は次である。

```sh
python3 ml/build_strength_first_qat_training_plan_candidate.py
```

成功時は、既存validatorを通ったexact plan JSONをstdoutへ1件だけ出す。builder自身は
`ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json`を書かず、既存fileを
上書きしない。候補をtraining authorityにするには、内容を別のdata-only changeとして
commitし、review / CI / regular mergeを終える必要がある。argumentを1つでも渡すとexit 2、
artifact未完または不一致ではstdout 0 bytesのままexit 1で停止する。

## 完了前に重い処理へ入らない

production entryは固定v7 rootだけを使う。処理順は次のとおりである。

| 順序 | gate                                                         | 失敗時にまだ実行していないもの   |
| ---: | ------------------------------------------------------------ | -------------------------------- |
|    1 | tracked planがまだ存在しない                                 | artifact read、runtime probe     |
|    2 | retained lockを非ブロッキング取得して保持                    | terminal read、large scan、Torch |
|    3 | `result.json`を先頭にterminal 5 fileが全て存在               | role / replay read、Torch        |
|    4 | 許可した10 fileを安全にsnapshotし、大fileはstreaming hash    | runtime probe、training          |
|    5 | role / teacher manifest / resultをstrict parseし相互束縛     | runtime probe、training          |
|    6 | raw / completion / trainをneutral scannerで再計算            | runtime probe、training          |
|    7 | replay exclusionをcanonical sorted-unique ID setとして再計算 | runtime probe、training          |
|    8 | owner、mode、link count、inodeと全identity/accountingを確定  | runtime probe、training          |
|    9 | 固定venvでdeterministic CPU runtimeだけをprobe               | optimizer、selection、live write |
|   10 | 全snapshotとlockを再確認し、lock保持中にstdoutへ候補を出す   | tracked plan write、training     |

lock fileは完了後も残る仕様なので、存在しないことは要求しない。active v7 runでの実測はexit 1、
stdout 0 bytesで、理由は別processがretained lockを保持中だったことだった。この経路では
artifact snapshot、runtime probe、Torch importは0回である。

その後lockが解放された時点の再測定では、builderは同じretained fileのadvisory lockを取得したが、
`result.json`が未公開だったためexit 1 / stdout 0 bytesで停止した。この経路でもartifact
snapshot、runtime probe、Torch importは0回だった。persistentだがunlockedなlock fileは
「active」と誤判定されず、欠けたterminal resultが次のauthoritative gateになる。

## 読むものと読まないもの

builderが読むproduction fileは次だけである。

- v7 teacherの`result.json`、`manifest.json`、`work.jsonl`、
  `parent-completion.jsonl`、`train.jsonl`
- label-free role bundleの`manifest.json`、`training.raw.jsonl`、
  `replay-excluded-position-ids.txt`
- fixed sealed inputの`runOp1-train.jsonl`と`runOp1-best.pt`

fresh-selection / fresh-final-holdoutのraw file、label、protected-ID file、model output、
既存training output slotは読まない。Git、network、AWS、GCP / Firebase、Vercel、engine、
optimizer、selection reader、holdout reader、weight writerも呼ばない。

`training.raw.jsonl`、completion、trainはbytesを保持して内容を再scanする。
`replay-excluded-position-ids.txt`もcanonical framing、ASCII ID、byte順、unique membership、
count、file SHA-256、identifier-set SHA-256を再計算する。一方、teacher work、800 MB replay、
initializerはstreaming hashとmetadata snapshotだけで、全体をmemoryへ保持しない。

## 出力するplan

候補は既存の
`shogi-floodgate-strength-first-qat-training-plan-v1`と完全に同じ7 top-level fieldを持つ。

- 実teacher / role / replay / initializerのartifact identity
- 固定venvで観測したCPU / Python / Torch / deterministic runtime
- warm model-only、learning rate `1e-4`、20 epochs、batch 256
- seed 42 / 43 / 44のexact 3 slot
- training-only `true`
- selection label、holdout label、candidate selection、production weight writeのauthorityは全て
  `false`

runtime probeは固定training Pythonをisolated modeで起動し、`train.py`の既存
`configure_sealed_torch_runtime(2)`だけを呼ぶ。Torchはruntime測定のためにimportするが、
dataset load、model作成、optimizer step、checkpoint writeは行わない。

## validation

synthetic 4-parent fixtureによるfocused testは、exact candidate、byte-identical serialization、
active lock / missing resultのearly STOP、duplicate JSON、teacher / work / replay / initializer
drift、canonical replay exclusion、runtime field / type drift、symlink、permissive mode、
snapshot再検証、retained lockのpath / inode交換拒否とsuccess / error release、stdoutまでの
lock保持、runtime probe順序、selection / holdout path access 0を確認した。既存bridgeとの
combined focusedは20 / 20、ML stdlib全体は259 / 259（14.555秒）、builder publicationは
4 / 4、既存bridge publicationとの合計は9 / 9をPASSした。Python compile、changed-file
Ruff、Prettier、diff checkもPASSした。full ML Ruffには今回変更していないfileの既存errorが
7件あり、changed fileのerrorは0だった。

また、bridge記事、machine evidence、`ml/README.md`に残っていた旧`v6`表記を、実装が固定する
`v7`へ修正した。これはteacher datasetやplanを変更するものではなく、運用pathの記録を現行codeへ
合わせる訂正である。

machine-readable record:
[floodgate-strength-first-qat-plan-candidate-builder-2026-07-19.json](./data/floodgate-strength-first-qat-plan-candidate-builder-2026-07-19.json)

## 次の直線的なhandoff

1. v7 teacherがterminal 5 fileを完成しretained lockの保持を解放する。
2. builderを実行し、stdoutのcandidateを検査する。
3. exact planだけを追加するdata-only PRでreview / CI / regular mergeする。
4. cleanな更新済みmainで`python3 ml/run_strength_first_three_seed_training.py`を実行する。
5. seed 42 / 43 / 44の全`result.json` / `final.pt`が揃うまでselectionを開かない。

このbuilderはhandoffの待ち時間を短くするが、それ自体はAIを強くしない。棋力の証拠は3-seed
学習後のfresh selection、sealed final、回帰、production parity、formal A/B、外部校正が
全て通った場合にだけ得られる。live weightはその証拠が揃うまで変更しない。
