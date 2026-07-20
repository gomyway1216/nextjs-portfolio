# fresh final教師生成を「候補選抜後だけ」実行可能にした

> 2026年7月20日、固定4,800親局面 / 200局のfresh final holdoutから
> `final.jsonl`を生成するローカル経路を実装した。現在は候補選抜receiptが存在しないため、
> 実commandは元データを一度も開かず`STOP`する。棋力向上、高段到達、live weight変更を
> 示す結果ではない。English:
> [blog-shogi-floodgate-strength-first-fresh-final-teacher-runner.en.md](./blog-shogi-floodgate-strength-first-fresh-final-teacher-runner.en.md)

## 結論

| 項目 | 現在の実測状態 |
| --- | --- |
| fresh-final generator / runner | 実装・focused validation済み |
| 選抜済みcandidate | なし |
| selection receipt | 未発行、read 0 |
| fresh-final元データ | read 0 |
| YaneuraOu process | 0 |
| `final.jsonl` | 未生成 |
| live weight変更 | 0 |
| AWS / GCP / Vercel compute | 不使用 |

引数なしの実commandは次である。

```sh
npx tsx ml/run-floodgate-fresh-final-teacher.ts
```

現在これを実行するとexit 2になり、`selected-candidate-receipt-not-ready`を返す。観測した
counterはselection registry read 1、それ以外のselection receipt、selection dataset、
fresh-final source、fresh-final label、teacher process、network、cloud、live writeがすべて
0だった。

## このgateだけは棋力検証に直接必要

fresh finalは、3 seedから一つを選んだ**後**に初めて使う未見評価データである。候補を選ぶ前に
開いて調整へ使うと、最終テストへ適合しただけなのか、本当に一般化したのかを区別できなくなる。
そのため次の順序を固定した。

1. tracked selection-evaluator registryを検証する。
2. registryが閉じていれば、private selection receiptを開く前に停止する。
3. READY時だけ固定receiptを1回読み、3-checkpoint preflight hash、各seedの4 gate、
   ranking、中央値candidate、family gate、選択checkpointを再計算する。
4. その後だけfresh-final source、engine asset、search policyを開く。
5. 4,800親すべてを処理し、同じ証拠をpostflightで再検証する。
6. `manifest.json`と`authority.json`を保存し、唯一の完了markerである`result.json`を最後に保存する。

ここでは後工程用のdownstream READY registryを前提にしていない。選抜を実施した既存registryと
発行済みreceiptを直接検証するので、「finalを生成するにはfinal後のregistryが必要」という循環を
作らない。

## Macを使う並列設定

選抜用teacherで固定済みの探索方針をそのまま共有する。

| 設定 | 値 |
| --- | ---: |
| YaneuraOu process | 12 |
| thread / process | 1 |
| Hash / process | 512 MiB |
| Hash合計 | 6,144 MiB |
| proposal | depth 14 / MultiPV 6 |
| 独立再評価 | depth 16 / MultiPV 1 / `searchmoves` 1手 |
| timeout | 600,000 ms / search |

14 coreをすべてengineに割り当てず、12 processで探索し、残りを入力供給、永続化、OSへ残す。
これはcloud処理ではなくローカルMac上の実行で、AWS、Firebase/GCP、Vercelは使わない。

ただし、既存の13-process優位の計測はMultiPV 12条件であり、このMultiPV 6方針の最適値を
証明していない。最初の4,800 run前、現在の24,000 runがCPUを解放した後に、fresh finalではない
公開局面を使って同じMultiPV 6条件の12対13を測る。13が実測で速い場合だけ、reviewed policyを
変更する。このbenchmarkでもfresh-final holdout readは0のままにする。

合法手が6手以下でtyped incomplete proposalになった場合だけ、partial rankを捨てて全合法手を
個別に探索し直す。それ以外の不完全proposalやtimeoutはfatalで、部分的な`final.jsonl`や
完了markerを公開しない。完走時に許すskipは`fewer_than_two_legal_moves`だけである。

## 出力と再開時の改ざん検知

出力先は
`~/.codex/shogi-runs/floodgate-q1-2026-strength-first-fresh-final-teacher-v1`
に固定した。directoryは`0700`、fileはsingle-link `0600`で、再開用`work.jsonl`と完走後の
`final.jsonl`を分ける。

既存`result.json`がある場合も、ファイルが存在するだけでは完了扱いしない。datasetの実hash、
manifest、authority、resultの相互identity、全completion型、selection receipt、selected
checkpoint、search policy、source、run fingerprint、boundaryを再検証する。focused testでは
dataset 1 byte、manifest、authority、completion型、selected checkpointの各改ざんをすべて
拒否した。

## validationと次工程

Node v22で、fresh-final generator、fresh-selection既存runner、fresh-final runnerのfocused
20 tests、Python receipt preflight 4 tests、TypeScript compile、diff checkがPASSした。
実commandのSTOPも上記の全0 counterで確認した。元の4,800局面は開いておらず、重いteacher runも
開始していない。

次は24,000局面の教師生成、3-seed再学習、fresh-selectionによる候補選抜を完了し、その実receiptを
発行すること。その後この固定commandが12 processで`final.jsonl`を生成し、選抜済みcandidateと
stableの最終比較へ進める。

機械可読記録:
[floodgate-strength-first-fresh-final-teacher-runner-2026-07-20.json](./data/floodgate-strength-first-fresh-final-teacher-runner-2026-07-20.json)
