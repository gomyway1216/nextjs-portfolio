# strength-first候補を既存の厳格な3-run選抜境界へ接続

> 2026年7月19日、将来のstrength-first 3-seed学習が出す`result.json`と
> `final.pt`を、既存のfresh QAT候補選抜と同じfail-closed検証順序へ渡すbridgeを
> 実装・focused検証した。**tracked registryは全identityが`null`のclosed状態であり、
> selection label、final holdout、production weightは開いていない。**
> English version:
> [blog-shogi-floodgate-strength-first-selection-preflight-bridge.en.md](./blog-shogi-floodgate-strength-first-selection-preflight-bridge.en.md)

## 何がつながったか

strength-first学習は、既存fresh QATと同じ最終checkpoint構造・固定20 epoch・
3 seedを使う。一方で、次のidentityは別物である。

| 項目 | strength-firstで固定する値 |
| --- | --- |
| plan schema | `shogi-floodgate-strength-first-qat-training-plan-v1` |
| result schema | `shogi-floodgate-strength-first-qat-training-result-v1` |
| checkpoint schema | `shogi-floodgate-strength-first-qat-final-checkpoint-v1` |
| run root | `ml/runs/floodgate-q1-2026-strength-first-int16-aware` |
| slot | seed `42` / `43` / `44` |

既存validatorの公開fresh APIと既定値は変えず、内部の共通検証へ
`result schema`、`plan binding`、`training contract`、`checkpoint schema`、
`replay identity`を明示的に渡せるようにした。strength-firstの固定公開APIが渡す値は
code内の定数と検証済みplanから作られ、呼出側がloader、model validator、path familyを
公開functionの引数として差し替えることはできない。ただし、同一processのPythonがprivate
helperを直接importして呼ぶことまで防ぐsecurity boundaryではない。

新しいregistryは
[`floodgate-q1-2026-strength-first-qat-selection-preflight-registry.json`](../ml/protocols/floodgate-q1-2026-strength-first-qat-selection-preflight-registry.json)
である。現在値は次のとおり。

| Field | 現在値 |
| --- | --- |
| status | `awaiting-exact-strength-first-plan-and-three-final-run-identities` |
| training plan bytes / SHA-256 | `null` / `null` |
| training pipeline revision | `null` |
| 3 result / 3 checkpoint identities | すべて`null` |
| artifact identities registered | `false` |
| selection preflight ready | `false` |

そのため、現在の公開preflightはregistry自体をstrict parseし、tracked bytesを確認した直後に
data-only STOPする。存在しないplan、run directory、Torch、selection readerには到達しない。

## readyになった後も先に6 artifact全部を閉じる

将来、実測identityだけを入れるdata-only reviewでregistryを開いた後の順序も固定した。

```text
closed registry
  -> STOP

ready registry
  -> tracked registry + exact tracked strength-first plan
  -> 3 result + 3 checkpointのbytesを全部capture
  -> 3 resultを全部strict parse / binding検証
  -> 3 runが同一pipeline / runtimeであることを確認
  -> capture済み3 checkpointを全部Torch strict-load / model strict-load
  -> tracked input、result、checkpoint identityを再確認
  -> one-shot receipt
  -> selection readerを1回だけ呼べる
```

1つ目のcheckpointをloadしてから3つ目が欠けていたと分かる順序にはしていない。
まずresultとcheckpointの6 fileをすべてimmutable bytesとして保持し、全resultを検証してから
初めてTorchへ進む。pathを一時的に差し替えて戻しても、parse / load対象はcapture済みbytes
から変わらない。

## strength-first固有のprovenanceも省略しない

resultの`experiment_plan`はschemaとslotだけでなく、学習bridgeが実際に書く次の値を
exact matchする。

- planのbytes / SHA-256と絶対path
- teacher `manifest.json` / `result.json` / `work.jsonl`のSHA-256
- `parent-completion.jsonl`のSHA-256
- input parent、forced skip、emitted group、model-training parentの会計
- replacement / resampleが0であることと、emitted order維持
- seedごとの固定training contract

各resultが指すcandidate artifactは、同じslotの登録済み`final.pt` bytes / SHA-256と一致しなければ
ならない。checkpoint側でもresultとplan、contract、pipeline、runtime、20 epoch history、
固定initializer、replay / replay-exclusion、final-only selection metadataを照合し、最後に
`DistillNet`へstrict-loadする。3 runのpipelineまたはruntimeが1件でも違えばreceiptを発行しない。

## selectionとfinal holdoutは別の権限

このpreflight自身はselection labelを読まない。固定公開preflightの正常経路は、全3候補が
通ったときにone-shot receiptを発行し、通常の公開API経路ではselection readerを1回だけ呼べる。
plain `dict`、別class、任意のbrand、使用済みreceiptは通常functionに拒否され、
reader自身が失敗してもreceiptは消費済みになる。

これは協調的なcall siteで、検証済みreceiptの取り違え・再利用を防ぐための
**accidental-misuse guard**である。同一processのPythonに対する認可tokenではない。
`_RECEIPT_BRAND`と`_RECEIPT_STATES`はPythonの命名上privateなだけでimport可能であり、それらへ
アクセスできるcodeはreceiptを構築できる。selection readerを直接呼ぶcodeもこのmoduleでは
止められない。したがって暗号的な偽造不能性、same-process authorization、敵対的Pythonからの
security isolationは主張しない。

final holdoutのlabel pathはこのpreflightへ渡さず、receiptにも
`not_opened_by_this_preflight`と記録する。候補選抜後にもsealed final holdout、既知回帰、
量子化後探索、正式paired A/B、外部高段校正が残る。production promotionとlive weight writeは
常に`false`であり、本変更は棋力向上の証拠ではない。

## focused validation

稼働中teacherの復旧と競合しないよう、今回は新規境界と変更した共通validatorの回帰だけを
低優先度で実行した。

| 検証 | 結果 |
| --- | ---: |
| strength-first focused stdlib | 6 / 6 PASS |
| 既存fresh preflight stdlib回帰 | 17 / 17 PASS |
| Python compile | PASS |
| Ruff / Black / diff check | PASS |
| broad suite | 未実行（teacher復旧とのCPU競合回避） |

synthetic temporary artifactだけを使い、closed registryがplan / artifact / Torchへ進まないこと、
strength-firstの3 schema / path / seedを受け入れること、fresh schemaやwrong pathを拒否すること、
resultのteacher-work binding改変をcheckpoint load前に拒否すること、最後のcheckpoint欠落時にも
loaderを1回も呼ばないこと、通常APIでone-shot receiptを再利用できないことを確認した。またtestは
private brandをimportすればreceiptを構築できることを意図的に示し、これが認可境界ではないことも
固定した。既存fresh 17件も全成功し、旧公開経路の既定動作が維持されている。

実teacher worktree、実teacher output、process controlには触れていない。AWS、GCP、Vercelを含む
cloud computeも使わず、将来の実行先は引き続きlocal Macである。

次は実teacher完了後にexact training planを登録して3-seed学習を行う。その3 runが完成した後、
観測したplan / result / checkpoint identityだけを別のdata-only reviewでregistryへ登録する。
それまではclosed状態を解除しない。

機械可読記録:
[floodgate-strength-first-selection-preflight-bridge-2026-07-19.json](./data/floodgate-strength-first-selection-preflight-bridge-2026-07-19.json)
