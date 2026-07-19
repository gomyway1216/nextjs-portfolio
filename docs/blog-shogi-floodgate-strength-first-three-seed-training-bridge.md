# Strength-first 3-seed学習bridgeを準備

> 2026年7月19日、将来の24,000-parent training-only teacher datasetを固定条件の
> 3-seed warm-start学習へ渡すbridgeとargumentless local launcherを実装・検証した。
> **実24,000 teacher artifactのbytes / SHA-256がまだ存在しないため、exact planは意図的に
> 作っていない。現在のcommandはGit revision確認、subprocess生成、Torch読込より前でSTOPする。**
> 実teacher、実training、candidate、live weight変更はすべて0である。English version:
> [blog-shogi-floodgate-strength-first-three-seed-training-bridge.en.md](./blog-shogi-floodgate-strength-first-three-seed-training-bridge.en.md)

## 現在地

| 項目                                      | 状態                     |
| ----------------------------------------- | ------------------------ |
| bridge / argumentless Python launcher     | 実装・検証済み           |
| future exact plan                         | 意図的にabsent           |
| direct argumentless command               | exit 1 / expected STOP   |
| Git revision read / training subprocess   | 0 / 0                    |
| Torch load / 実training                   | 0 / 0                    |
| 実24,000 teacher / completed training run | 0 / 0                    |
| candidate selection / live weight変更     | 0 / 0                    |
| focused / full stdlib                     | 26 / 26、193 / 193 PASS  |
| independent rereview                      | P0 / P1 / P2 = 0 / 0 / 0 |

`ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json`は、実teacher完了後に
得られるfile identityを入れるdata-only planである。架空のhashや暫定値で先に作ると、別の
datasetを学習できる余地が生まれる。このためplan loaderを処理の最初に置き、fileが存在しない
現在は次の直接commandを安全に停止させる。

```sh
python3 ml/run_strength_first_three_seed_training.py
```

実測した終了はcode 1で、理由は「実24,000-parent teacher artifact完成後にexact data-only
planを追加するまでSTOP」だった。plan loadがrevision reader、local input scan、
`subprocess.Popen`、`train.py`、Torchより前なので、STOP確認のために学習processや大量データを
開かない。`package.json`は変更せず、npm scriptも追加していない。

## flat teacher rootを一組のtraining sourceとして再検証

将来planはprivateなflat root
`~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v6`の次の5 fileを個別の
bytes / SHA-256で固定する。

| file                      | bridgeが確認する関係                                                    |
| ------------------------- | ----------------------------------------------------------------------- |
| `work.jsonl`              | teacher resultのstaged `work` bindingと一致する                         |
| `result.json`             | 24,000 completionと全staged output bindingを持つ                        |
| `manifest.json`           | outputがtraining-only `train`だけで、completionも一致する               |
| `train.jsonl`             | manifest / result / planの全identityが一致し、rawから内容を再scanする   |
| `parent-completion.jsonl` | manifest / result / planが一致し、24,000 parent dispositionを再scanする |

bridgeはrole-bundleの`training.raw.jsonl`も同じplanへ束縛する。teacher resultから
`work` / `train` / `parent_completion` / `manifest`を、teacher manifestから
`train` / `parent_completion`を相互照合するだけでは終わらない。raw training input、
completion、trainをneutral scannerへ再入力し、各parentがforced skipまたはemitted groupの
どちらか一方であること、group records / digest、親順序、game / parent / semantic-position
accountingを再計算する。宣言されたJSONだけが一致してもsource bytesが違えばSTOPする。

固定path以外、near-name、symlink経由のplanはstrength-first routeへ入れない。plan自体も
tracking verification後にもう一度読み、途中変更を拒否する。

## plan追加後の3-seed並列学習

実artifact identityを入れたexact planが追加された後だけ、launcherはseed 42 / 43 / 44を
すべてspawnしてから完了待ちへ入る。3 processは同時に走り、1つが失敗すれば残りを停止する。
各slotの固定条件は次のとおりである。

| 条件                    | 固定値                                                             |
| ----------------------- | ------------------------------------------------------------------ |
| initializer             | fixed warm model-only initializer                                  |
| learning rate           | `1e-4`                                                             |
| epochs / batch          | `20` / `256`                                                       |
| device                  | CPU                                                                |
| threads                 | 各process Torch 2、interop 1                                       |
| seeds                   | `42`, `43`, `44`                                                   |
| output                  | `ml/runs/floodgate-q1-2026-strength-first-int16-aware/seed-{seed}` |
| internal selection data | なし                                                               |

warm initializerからはmodelだけを読み、optimizer / schedulerは新規にする。3 runは同じ
training-only source、固定replay、固定hyperparameterを使う。早期停止や途中epoch選択はせず、
fixed final epoch checkpointをcandidate artifactとして残す。

## 学習だけの権限境界

bridgeが発行できるのはtraining contractだけである。selection labelとholdout labelを読む権限、
candidateを選ぶ権限、production weightを書き換える権限はない。holdout / selectionの
protected ID listはデータ混入を拒否するために使えるが、ラベルを開く経路ではない。

3 processが完了しても、それだけではcandidateは選ばれない。別工程で3つのfinal checkpointを
検証し、fresh selection、sealed holdout、正式A/B、外部校正を通す必要がある。本bridgeから
棋力向上、高段到達、live昇格は主張しない。実データがまだないため、学習時間や強さの数値も
推測していない。

## validation

plan追加後のpipeline revision読取は絶対pathの`/usr/bin/git`、固定allowlist環境、
replace object無効化、固定Git設定を使う。親processの`PATH`、`GIT_DIR`、
`GIT_WORK_TREE`、config注入、dynamic-loader変数は渡さず、40桁小文字hashとLFの
exact 41 bytesだけを受け入れる。

bridge、launcher、exact plan dispatchのfocused stdlibは26 / 26、ML stdlib全体は
193 / 193を12.094秒でPASSした。direct commandのexpected STOP、plan absent時にrevision /
processへ進まないこと、3 seedをpoll前にすべてspawnすること、固定training command、
source cross-binding、byte drift、near path / symlink拒否、1 seed failure時の残process停止を
含む。壊れたnested result / role manifestの明示STOP、親Git環境を継承しないrevision読取も
回帰対象に追加した。diff checkはPASSし、`package.json`はcleanである。独立rereviewの結果は
P0 / P1 / P2 = 0 / 0 / 0だった。

次の変更はteacher実行を待ち、その実bytes / SHA-256だけをexact data-only planへ登録する。
それまではSTOPを解除しない。

機械可読記録:
[floodgate-strength-first-three-seed-training-bridge-2026-07-19.json](./data/floodgate-strength-first-three-seed-training-bridge-2026-07-19.json)
