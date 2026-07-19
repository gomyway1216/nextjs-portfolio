# AWSを使わない明示的ローカル教師runner — Floodgate v7

> `shogi:floodgate-v7-local-clean-room-teacher` という引数なしcommandを追加した。ただし、これはAWS、Firebase/GCP、Vercel、network、production worktree、live weightを使わず、ローカルMacのhome外clean roomだけで教師生成を進めるための入口である。最終review時点では実教師run、生成parent、network request、AWS call、finalizer、training、A/B、live変更はすべて0。English version: [blog-shogi-floodgate-v7-local-clean-room-teacher-runner.en.md](./blog-shogi-floodgate-v7-local-clean-room-teacher-runner.en.md)

## 1. 結論

「なぜAWSなのか」への答えは、このrunnerについては**AWSではない**。repository内には将来候補として追加されただけの未接続・source-onlyなAWS witness adapter契約が残るが、このlocal teacher commandはそれをimportせず、AWS credentialもnetworkも子processへ渡さない。AWS account、SDK、resource、deployment、課金もすべて0である。

今回成立したのは、固定inputをhome外へ値コピーして再検証し、real stable WASMとreal YaneuraOuをローカルで所有し、同じ認証済みstreamを100 → 500 → 24,000 parentsへ進めるsource境界である。commandは追加済みだが、成功する実runはまだ0回である。したがって、評価関数や棋力はまだ変わっていない。

| 項目                      | 実測状態           |
| ------------------------- | ------------------ |
| package command           | 追加済み           |
| 成功した実教師run         | 0                  |
| 完了parent / teacher rows | 0 / 0              |
| network / AWS calls       | 0 / 0              |
| finalizer / training      | 0 / 0              |
| formal A/B / 外部校正     | 0 / 0              |
| live weight変更           | 0                  |
| 判断                      | `STOP-NOT-YET-RUN` |

## 2. commandが固定するlocal-only境界

入口は次の1つだけで、追加引数を受け取らない。

```text
npm run shogi:floodgate-v7-local-clean-room-teacher
```

direct invocation以外のmodule importではrunnerを開始しない。実CLIの成功は、実runnerだけがmodule-private `WeakMap`へ登録できるexact objectを一度だけclaimした場合に限る。test callbackが返すreceiptは明示的に`operational_evidence: false`であり、同じshapeの偽物、clone、replayは運用成功へ昇格できない。

実runが始まる場合も、固定clean room、固定verifier revision、copy-by-value後の再検証、role bundle、teacher assetsを先に確認する。空き容量はprivate copy前とteacher process前の2回、20 GiB以上かだけを検査し、正確な空き容量やpathは公開しない。

## 3. 100 → 500 → 24,000は同じstream

3つの数字は別datasetを足した24,600 parentsではない。1本の認証済みstage/work streamを、別々のsingle-use authorityで順に延長する。

| gate               | resume | 今回追加するparent | 到達prefix | sealed |
| ------------------ | -----: | -----------------: | ---------: | :----: |
| durable-prefix-100 |      0 |                100 |        100 |   no   |
| durable-prefix-500 |    100 |                400 |        500 |   no   |
| sealed-final-24000 |    500 |             23,500 |     24,000 |  yes   |

各gate後に同じrun key、stage identity、100/500 milestone chainを検証する。work bytesは増え、digestは各advanceで変わらなければならない。前gateのexact receiptをclaimし終えるまで次authorityを発行しない。100と500はdurable checkpointだが、label finalization対象ではない。

## 4. handoffはfinalizerそのものではない

24,000到達後もrunnerはlabelをpublishしない。順序は次で固定した。

1. 3 receiptのsame-stream continuityとsealed finalを検証する
2. runtime ownerの`close()`完了を待つ
3. その後だけprivate `finalizer-handoff.json`を書く

`close()`が失敗した場合、handoffは0件のままである。handoffにはsealed workとlocal integrity keyのbindingが入るが、label、weight、match、live activationの権限ではない。別の明示的finalizer commandが同じsealed workを再検証して初めて次段へ進める。prefix 100または500のfinalizeは禁止される。

## 5. exact reviewで確認した防御

private fileはheld parent/file descriptor、`O_NOFOLLOW | O_EXCL`、owner一致、mode `0600`、`nlink == 1`、device/inode/path/parent identityの前後確認を通す。rename、symlink、same-content差し替え、parent replacement、hardlinkは拒否された。

Gitとengineの子process環境はexact allowlistで再構築する。AWS、Firebase、Vercel、proxy、SSH、credential helper、hooks、filterを継承せず、promisor/lazy objectと欠損objectを拒否する。51 local modulesのclosure scanでは外部importはNode builtinだけだった。文字列上の`fetch`定義は2つあったが、local runner実行から到達するものは0だった。import side-effect trapでもeventは0だった。

## 6. 実測validation

review対象はremediation commit `5e4f42d8a8a38bf7790cbff91dd6cd8a32b6fe49`（tree `6b882b8cea5a3a9322b4649e824ccd524090cfc8`）で、main統合後のsnapshotはmerge commit `30663f7f496382a0f9082d22cc2c8fb09a10dca7`（tree `1ef5aa8c0626d8b5c08795bf6a9852601a1712be`）である。統合mergeはreview済み対象pathを変えていない。

| validation                              | 結果                    |
| --------------------------------------- | ----------------------- |
| focused Vitest                          | 4 files / 43 tests PASS |
| changed source/test lint                | 8 / 8 PASS              |
| custom adversarial probes               | 15 / 15 PASS            |
| import side-effect events               | 0                       |
| unresolved review findings P0 / P1 / P2 | 0 / 0 / 0               |
| real teacher / network / AWS / live操作 | 0 / 0 / 0 / 0           |

15 probesはtest receipt昇格、CLI/brand偽造、one-shot replay/clone、private parent replacement/hardlink、5種のGit config、欠損object、engineへのAWS環境追加、CLI追加引数を含む。これはsourceとsynthetic/test seamの安全性検証であり、実24,000-parent処理の成功証拠ではない。

## 7. まだしていないこと

この変更は、教師生成を**実行可能な安全境界へ接続した**段階であり、次の処理はまだ行っていない。

- 実clean-room copyと100 → 500 → 24,000 parent生成
- sealed workの別finalizerによるlabel publication
- live weightを上書きしない別candidateの再学習
- candidate selection
- formal A/B
- 外部校正
- rollback rehearsal
- live deploy / activation

次はsource・記事・機械可読証拠のreviewとCIを閉じ、その後に明示的local commandを実行する。24,000 labelsが完成しても、training、候補選抜、正式A/B、外部校正、rollback証拠なしにはlive weightを変更しない。

Machine-readable evidence: [floodgate-v7-local-clean-room-teacher-runner-2026-07-19.json](./data/floodgate-v7-local-clean-room-teacher-runner-2026-07-19.json)
