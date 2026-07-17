# fresh Floodgate QAT selectionを3-run完了まで開かない

> 2026-07-17時点で、fresh QATの実teacher生成、3-seed学習、候補選抜はまだ始まっていない。今回追加したのは、将来の3つの`result.json`と`final.pt`がすべて揃い、exact identityと内容を検証できるまでselection readerを呼べなくする、fresh専用のpreflightである。tracked registryは全bytes / SHA-256を`null`にして閉じたままであり、final holdout、production state、ライブ重みは変更していない。English version: [blog-shogi-floodgate-fresh-qat-selection-preflight.en.md](./blog-shogi-floodgate-fresh-qat-selection-preflight.en.md)

## なぜ旧WCSC36 auditへ足さなかったのか

旧WCSC36 QATは、失敗結果を後から別実験に読み替えられないよう、plan、result、checkpoint、selection auditのschemaとidentityを固定している。fresh実験の入口をそこへ追加すると、過去のsealed artifactの解釈まで変わる。

そこで次を分離した。

| Artifact | fresh専用schema |
| --- | --- |
| training contract | `shogi-floodgate-fresh-qat-training-experiment-v1` |
| result | `shogi-floodgate-fresh-qat-training-result-v1` |
| final checkpoint | `shogi-floodgate-fresh-qat-final-checkpoint-v1` |
| selection registry | `shogi-floodgate-fresh-qat-selection-preflight-registry-v1` |
| preflight receipt | `shogi-floodgate-fresh-qat-selection-preflight-v1` |

学習側は、検証済みbindingのplan schemaとcontract schemaが両方とも旧版、または両方ともfresh版の場合だけ、対応するresult / checkpoint schemaを出力する。旧版とfresh版を混ぜたbindingは拒否する。旧`qat_protocol.py`、旧`qat_selection_audit.py`、WCSC36 artifactは変更しておらず、旧学習runが従来schemaを出す統合テストも残した。

## replay isolationを名前ではなく実体で固定する

以前のfresh planは、replay exclusionの構成を`legacy`、`fresh_final_holdout`、`fresh_selection`という名前だけで宣言していた。名前が正しくても、unionに1件欠落、余分な1件、同数のすり替え、component間の重複があれば、selectionまたはfinal用の局面が学習replayへ混ざり得る。

新しいcontractは3 componentそれぞれについて、format、bytes、file SHA-256、count、canonical identifier-set SHA-256を固定する。

1. 旧WCSC36 replay exclusion
2. fresh final-holdout protected position IDs
3. fresh selection protected position IDs

各ID fileはASCIIの`sha256:` + lowercase 64桁だけを許可し、byte順でsort済み、unique、CRなし、末尾LFがちょうど1つ、というcanonical形式で読む。identifier-set digestはproductionと同じく、sort済みIDをLFでjoinし、**末尾LFを付けないbytes**から計算する。3集合は相互にdisjointでなければならず、実replay-exclusion fileは3集合のexact unionでなければならない。エラーにはprotected semantic IDを出さず、欠落・余分・重複の件数だけを出す。

旧component fileは既存生成物のexact bytes / digestとして検証するが、Git管理外であることが正常なのでtracked-file verifierへは渡さない。fresh plan、fresh input identity、fresh unionは従来どおり検証される。

## selection readerへ到達する順序

fresh selection registryは
[`floodgate-q1-2026-fresh-qat-selection-preflight-registry.json`](../ml/protocols/floodgate-q1-2026-fresh-qat-selection-preflight-registry.json)
に置いた。現在は次の状態である。

| Field | 現在値 |
| --- | --- |
| status | `awaiting-exact-fresh-plan-and-three-final-run-identities` |
| execution plan bytes / SHA-256 | `null` / `null` |
| seed 42 result / checkpoint identity | `null` / `null` |
| seed 43 result / checkpoint identity | `null` / `null` |
| seed 44 result / checkpoint identity | `null` / `null` |
| selection preflight ready | `false` |

このclosed状態ではselection registry自身を検証した直後に停止し、training registry、plan、result、checkpoint、Torchを読まない。将来data-only reviewでregistryを開いた場合も、順序は固定される。

```text
closed selection registry
  -> STOP

ready selection registry
  -> exact training registry + plan
  -> 3 result + 3 checkpointをすべてidentity snapshot
  -> 3 resultをすべてstrict parse / validate
  -> 3 checkpointをすべてTorch strict-load / model strict-load
  -> registry / plan / 6 artifactを再確認
  -> opaque one-shot receiptを発行
  -> selection readerを1回だけ呼べる
```

公開preflight APIが受け取るのはexact audit revisionだけである。checkpoint loaderやmodel validatorは差し替えられず、固定Torch loaderと`DistillNet` strict validatorを使う。synthetic test用の注入点はprivate helperだけに閉じた。

receipt本体には状態を書けるfieldも`__dict__`もない。未使用状態はmodule-privateなweak mapに置き、reader呼び出し時に原子的に取り出して消す。偽造object、field書換え、2回目のreader、使用後の再読は拒否される。receiptが発行されてもfinal holdoutは未開封で、production昇格は`false`のままである。

## synthetic検証で見つけて塞いだもの

実teacher、実checkpoint、selection label、production stateを使わず、temporary artifactだけで次を検証した。

- blocked registryがartifact reader、Torch、model validatorへ到達しない
- 3 checkpointのうち1つでも欠ければcheckpoint loaderを1回も呼ばない
- 3つすべてをstrict-loadする前にselection readerを呼ばない
- result / checkpointのold WCSC36 schema、hybrid schema、boolによる整数偽装を拒否
- wrong seed / output / plan / pipeline / contract / runtime / history / modelを拒否
- duplicate JSON key、途中改変、missing / extra artifactを拒否
- replay unionのmissing / extra / same-count swap、component duplicate / overlap、非canonical IDを拒否
- protected IDがエラー文字列へ漏れない
- 公開APIからloader / validatorを差し替えられない
- opaque receiptのfield書換え、偽造、replayを拒否
- 旧WCSC36 result / checkpoint schemaの出力を維持し、fresh bindingだけfresh schemaを出す

| Suite | 結果 |
| --- | ---: |
| fresh focused stdlib | 24 pass |
| Python stdlib ML全体 | 82 pass |
| Torch ML全体 | 72 pass |
| legacy / fresh schema実出力 integration | 1 pass（synthetic run各1） |
| 関連TypeScript | 5 pass |
| `py_compile` / Ruff / Black / diff check | pass |

検証件数とscope boundaryは
[`floodgate-fresh-qat-selection-preflight-2026-07-17.json`](./data/floodgate-fresh-qat-selection-preflight-2026-07-17.json)
にもmachine-readableに記録した。

## 今回も棋力は変わっていない

- real teacher / partition生成: 未完
- exact fresh execution plan: 未作成
- 3-seed QAT training: 0 run
- fresh selection read: 0
- final holdout read: 0
- 384局paired A/B: 0局
- 外部高段校正: 0局
- live weight write: 0
- playing-strength evidence: なし

次は、teacherと3 role bundleが完成した後に、exact replay component identitiesとexecution planをdata-only PRで登録する。そのreviewが通るまでtraining registryとselection registryは開かない。3つのfinal artifactが完成した後も、このpreflightを通して初めてfresh selectionを1回読み、さらにsealed final holdout、既知回帰、量子化後探索、事前登録paired A/B、外部校正を順に通す。
