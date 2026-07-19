# 将棋評価関数: 最初のローカル教師runがpreparationで止まった理由

> PR #511を通常mergeした後、Macローカルの教師生成commandを初めて実行した。結果は`STOP`だったが、AWS、GCP、Vercel、network、教師engine、checkpoint、学習、live weightには到達していない。止まったのはhome外clean roomへ入力をコピーするpreparationで、原因はGit設定policyの過剰拒否とstdout上限だった。English version: [blog-shogi-floodgate-v7-local-clean-room-teacher-first-run-preparation-stop.en.md](./blog-shogi-floodgate-v7-local-clean-room-teacher-first-run-preparation-stop.en.md)

## 1. 何が起きたか

引数なしcommandは4つの入力treeをprivate clean roomへ値コピーした後、verifier repositoryを独立cloneする前に終了code 1で停止した。公開された失敗receiptは`phase: preparation`、`clean_room_may_exist: true`、`checkpoint_may_exist: false`だった。

| 観測項目                                     |          結果 |
| -------------------------------------------- | ------------: |
| command attempt                              |             1 |
| successful run                               |             0 |
| teacher process / parents / rows             |     0 / 0 / 0 |
| checkpoint / labels / training               |     0 / 0 / 0 |
| network / AWS / Firebase-GCP / Vercel runner | 0 / 0 / 0 / 0 |
| live weight changes                          |             0 |

これは棋力低下でもcloud障害でもない。教師を起動する前のローカル入力準備がfail-closedした。

## 2. 根本原因は2つ

原因はAWSではなく、ローカルGit検査の2つの境界だった。

共有Git repositoryには800個のlocal configuration nameがあり、既存policyが危険と分類したものは`http.postBuffer`の1つだけだった。この設定はHTTP request bufferの大きさを調整するが、runnerのcloneは`protocol.allow=never`と`protocol.file.allow=always`で固定され、`file`以外を使えない。従ってこのrunにcredential、proxy、header、URL、networkを注入できない。

policyはそれでも`http.*`を一括拒否していたため、clone前に停止した。さらに、その拒否だけを直した一時検証では、`git rev-list --objects --all --missing=print`の1,188,132-byte出力が1,048,576-byte上限を139,556 bytes超え、もう一度停止した。

## 3. 最小修正

許可を追加したのはcase-insensitiveなexact `http.postBuffer`だけである。次は引き続き拒否する。

- `http.extraHeader`、`http.proxy`、`http.sslCert`など他の全`http.*`
- 全`https.*`
- credential helper、remote proxy、SSH command
- filter、include / includeIf
- URL rewrite
- partial clone / promisor / lazy object

Git stdout上限は1 MiBから64 MiB（67,108,864 bytes）へ変更した。これは無制限化ではなく、既存の厳密Git verifierと同じbounded capである。

## 4. 実データでの再検証

修正後、同じaccepted verifier sourceを別の一時private rootへ実際に`--no-local` cloneした。full fsck、欠損object検査、exact revision、clean status、1,431 tracked filesのsource / destination非alias検査までPASSし、一時copyは検証後に削除した。

focused Vitestは2 files / 21 tests PASS、ESLint、Prettier、diff checkもPASSした。これらはpreparation修正の証拠であり、教師生成成功や棋力向上の証拠ではない。

## 5. 残存clean roomの扱い

失敗receiptがmanual reconciliationを要求するため、残存rootを自動削除しない。read-only監査では、固定rootはcurrent user所有の`0700`、symlink 0、複数link regular file 0、他user所有entry 0だった。publication、state、runtime snapshot、verifier destinationは空で、checkpointは作られていない。

修正PRのreviewとCIが終わった後、この観測と同じ状態であることをもう一度確認し、固定rootだけを削除する。その後、同じ引数なしlocal commandをfresh rootで再実行する。live weightは引き続き変更しない。

Machine-readable evidence: [floodgate-v7-local-clean-room-teacher-first-run-preparation-stop-2026-07-19.json](./data/floodgate-v7-local-clean-room-teacher-first-run-preparation-stop-2026-07-19.json)
