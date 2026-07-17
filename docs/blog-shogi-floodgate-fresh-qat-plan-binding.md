# fresh Floodgate QATを旧WCSC36から安全に分岐する

> 2026-07-17時点で、fresh Floodgateの3-seed学習はまだ開始していない。今回完成したのは、旧WCSC36専用だったQAT plan bindingを壊さず、fresh実行planを別versionとして受け付けるコード経路である。exact teacher、partition、training artifactのidentityはまだ存在しないため、tracked registryはhash欄を`null`のまま閉じている。これは学習結果や棋力の証拠ではなく、次の実データが揃った時にコード改修なしで安全に学習を開始するための準備である。English version: [blog-shogi-floodgate-fresh-qat-plan-binding.en.md](./blog-shogi-floodgate-fresh-qat-plan-binding.en.md)

## 何が学習開始を妨げていたのか

既存の`qat_protocol.py`は、失敗したWCSC36実験を再現可能にするため、次をすべて固定していた。

- plan path: `ml/protocols/wcsc36-int16-aware-plan.json`
- exact 8,152 bytes / SHA-256
- WCSC36のteacher、partition、training、replay、initializer identity
- seed 42 / 43 / 44
- `ml/runs/wcsc36-int16-aware/seed-*`というoutput slot

この厳しさ自体は正しい。しかしfresh Floodgate planを同じ入口へ渡すと、データを読む前に「WCSC36のexact pathではない」と拒否される。teacher 24,000 parentsが完成してから初めてこの問題に気づくと、そこで再びコードPRとCIを待つことになる。

## 今回の分岐

旧verifierは編集していない。`train.py`から呼ばれる小さなdispatcherだけを追加し、exact fresh pathの場合だけ新しいverifierへ送る。それ以外は、無効pathを含めて従来のWCSC36 verifierへそのまま渡す。

```text
--experiment-plan
  |
  +-- exact fresh path
  |     -> fresh_qat_protocol.py
  |          -> tracked registry
  |          -> exact execution plan snapshot
  |          -> exact real input identities
  |
  +-- everything else
        -> unchanged qat_protocol.py
```

fresh側はplanのroot `schema`も`shogi-floodgate-fresh-qat-execution-plan-v1`へ固定する。したがってpathだけ、またはschemaだけを似せたJSONでは通らない。

## registryを先に閉じて置く理由

tracked machine registryは
[`floodgate-q1-2026-fresh-qat-plan-registry.json`](../ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry.json)
として追加した。検証件数とscope boundaryは
[`floodgate-fresh-qat-plan-binding-2026-07-17.json`](./data/floodgate-fresh-qat-plan-binding-2026-07-17.json)
にもmachine-readableに固定した。registryの現在値は次の通りである。

| Field | 現在値 |
| --- | --- |
| status | `awaiting-exact-tracked-execution-plan-and-artifact-identities` |
| execution-plan bytes | `null` |
| execution-plan SHA-256 | `null` |
| artifact identities registered | `false` |
| training dispatch ready | `false` |

未完成hashを`000…`や仮ファイルのdigestで埋めると、後でそれが実データidentityのように見える。そこで未確定値は明示的に`null`とし、この状態ではverifierが`data-only blocked`で停止する。

teacher、partition、training JSONL、label-free ID setが完成した後は、次のdata-only changeだけで開ける。

1. fixed pathへexecution planを追加する
2. execution planへ実ファイルのbytes / SHA-256 / countを記録する
3. registryへそのplan自身のexact bytes / SHA-256を記録する
4. `artifact_identities_registered`と`training_dispatch_ready`を同じreviewで`true`にする

Python dispatcherやtraining loopを再変更する必要はない。

## fresh execution planが固定するもの

synthetic fixtureで検証したexecution plan contractは、次をexact key setとして要求する。

| Area | 固定内容 |
| --- | --- |
| upstream plan | 10,890-byte preregistered Floodgate planとSHA-256 |
| model | board-only `2282-256-32-1` clipped ReLU |
| initializer | fixed warm model only、runOp1 checkpoint identity |
| objective | float full task 0.5 + exact-int16 STE full task 0.5 |
| optimizer | AdamW、learning rate `1e-4`、20 epochs |
| seeds | exact `42, 43, 44` |
| output | fresh専用の3つのcreate-new slot |
| selection during training | pathなし、evaluation 0 |
| final holdout during training | label受領なし |
| replay | 500,000 rows、既存replay identity、fresh isolation union |
| runtime | deterministic CPU runtimeのexact field set |

planがscratch initializerへ変わる、4つ目のseedを足す、outputを別directoryへ向ける、selection JSONLをCLIへ渡す、holdout label受領を`true`にする、といった変更はすべて入力artifactを読む前に拒否される。

## synthetic検証

実teacher、実checkpoint、production stateは使わず、temporary directory内のsynthetic plan / registry / artifactだけで検証した。

| Suite | 結果 |
| --- | ---: |
| fresh verifier focused tests | 7 pass |
| versioned dispatcher tests | 3 pass |
| unchanged WCSC36 protocol tests | 6 pass |
| preregistered Floodgate plan tests | 3 pass |
| Python stdlib ML suite全体 | 68 pass |
| `py_compile` | pass |
| Ruff | pass |
| Black（新規4 Python file） | pass |

テストはduplicate JSON key、extra/missing key、wrong path、wrong bytes、wrong SHA、post-registry tamper、slot mutation、wrong output、seed 45、scratch initializer、selection path、holdout-label flag、blocked registryへの偽identity混入を含む。旧WCSC36 planのpath、8,152 bytes、SHA-256、seed順も再確認した。

## まだ達成していないこと

- real teacher label生成: 未完
- exact fresh execution plan: 未作成
- 3-seed QAT training: 0 run
- fresh selection: 未開封
- final holdout: 未開封
- 384局paired A/B: 0局
- 81Dojo外部校正: 0局
- live weight / production評価関数変更: 0

今回の結論は「強くなった」ではない。正確には、**QAT trainingのcode blockerを除き、実artifact identity待ちのdata-only blockerへ移した**、である。
