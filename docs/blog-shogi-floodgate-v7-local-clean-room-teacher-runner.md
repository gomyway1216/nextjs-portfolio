# AWSを使わない明示的ローカル教師runner — Floodgate v7

> `shogi:floodgate-v7-local-clean-room-teacher` という引数なしcommandを追加した。ただし、これはAWS、Firebase/GCP、Vercel、network、production worktree、live weightを使わず、ローカルMacのhome外clean roomだけで教師生成を進めるための入口である。checkpoint workは既存の固定されたMacユーザー単位local deployment-key authorityを使い、別のrandom local integrity keyはprivate control・receipt・handoffのMACだけに使う。最終review時点では実教師run、生成parent、network request、AWS call、finalizer、training、A/B、live変更はすべて0。English version: [blog-shogi-floodgate-v7-local-clean-room-teacher-runner.en.md](./blog-shogi-floodgate-v7-local-clean-room-teacher-runner.en.md)

## 1. 結論

「なぜAWSなのか」への答えは、このrunnerについては**AWSではない**。repository内には将来候補として追加されただけの未接続・source-onlyなAWS witness adapter契約が残るが、このlocal teacher commandはそれをimportせず、AWS credentialもnetworkも子processへ渡さない。AWS account、SDK、resource、deployment、課金もすべて0である。

ここでいうdeployment-key authorityもcloud deploymentではない。既存のMacユーザー単位local checkpoint key authorityであり、AWS、Firebase/GCP、Vercelのcredential・service・networkを使わない。鍵値、private path、正確な端末容量は記事にも機械可読証拠にも公開しない。

今回作ったのは、固定inputをhome外へ値コピーして再検証し、real stable WASMとreal YaneuraOuをローカルで所有し、同じ認証済みstreamを100 → 500 → 24,000 parentsへ進めるsource候補である。deployment-key互換性差分のblocking findingsは修正され、独立再reviewは`P0 / P1 / P2 = 0 / 0 / 0`で完了した。ただしpublication evidenceとCIはまだ完了していないため、operational readinessはまだ成立していない。commandは追加済みだが、成功する実runはまだ0回である。したがって、評価関数や棋力はまだ変わっていない。

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

checkpoint workは既存の固定されたMacユーザー単位local deployment-key authorityで認証する。これとは別に、runごとにrandom local integrity keyを作り、private control・completion receipt・finalizer handoffのMACだけに使う。このintegrity keyをcheckpoint署名鍵として使ったり、cloud credentialとして扱ったりしない。

各gate後に同じrun ID、checkpoint key ID、stage identity、exact canonical `runBinding`とそのSHA-256 digest、100/500 milestone chainを検証する。`runBinding`とdigestは最初のgateで保持し、100、500、24,000の全gateと最終handoffまで一致しなければ停止する。work bytesは増え、digestは各advanceで変わらなければならない。前gateのexact receiptをclaimし終えるまで次authorityを発行しない。100と500はdurable checkpointだが、label finalization対象ではない。

## 4. handoffはfinalizerそのものではない

24,000到達後もrunnerはlabelをpublishしない。順序は次で固定した。

1. 3 receiptのsame-stream continuityとsealed finalを検証する
2. runtime ownerの`close()`完了を待つ
3. その後だけprivate `finalizer-handoff.json`を書く

`close()`が失敗した場合、handoffは0件のままである。handoffはdeployment-key authorityで認証されたsealed checkpoint work、exact `runBinding`とdigest、private MAC用local integrity keyの役割を分離して結び付けるが、label、weight、match、live activationの権限ではない。別の明示的finalizer commandが同じsealed workとbindingを再検証して初めて次段へ進める。prefix 100または500のfinalizeは禁止される。

## 5. exact reviewで確認した防御

private fileはheld parent/file descriptor、`O_NOFOLLOW | O_EXCL`、owner一致、mode `0600`、`nlink == 1`、device/inode/path/parent identityの前後確認を通す。rename、symlink、same-content差し替え、parent replacement、hardlinkは拒否された。

Gitとengineの子process環境はexact allowlistで再構築する。AWS、Firebase、Vercel、proxy、SSH、credential helper、hooks、filterを継承せず、promisor/lazy objectと欠損objectを拒否する。51 local modulesのclosure scanでは外部importはNode builtinだけだった。文字列上の`fetch`定義は2つあったが、local runner実行から到達するものは0だった。import side-effect trapでもeventは0だった。

## 6. 実測validation

最初のexact review対象はremediation commit `5e4f42d8a8a38bf7790cbff91dd6cd8a32b6fe49`（tree `6b882b8cea5a3a9322b4649e824ccd524090cfc8`）だった。その後、正式A/B launcherを含むmain `1e7025b827797b856e7fa4cd72008acc7dc813ed`を統合したsnapshotはmerge commit `d4e13ce36cb4371ceaa836ba93339138a80e83fb`（tree `19426ff805a8d4079654787475c91f0bff9a34a0`）である。統合mergeはreview済み実装pathを変えず、競合した`package.json`の識別値だけを両command入りの内容へ更新した。

deployment-key / `runBinding`互換性を実装したcommitは`b9d8a96fd9620ba4646aeab346f259e0383a511d`（tree `26c9cd548abbcba8265dbad158a3c96ffbee4281`）、対応testは`e2c88f718e936586b2ab7e898aeaef3d43f32985`（tree `2930f48ed869c2e90f16f071b12764ccd1f0fa55`）である。このsnapshotの独立reviewは、production側がdeployment keyを拒否する食い違いとkey準備失敗時のstage lease未解放というP1を2件、動的test不足というP2を1件見つけた。remediation後のexact対象は`e56c5a5bf0197ddf319dc181e95e513f7db09461`（tree `db86a90b5af516c543d792962d010909c788b344`）で、production / test鍵境界4ケース、lease ownership 4ケース、関連279 testを再検証し、実装判定は`P0 / P1 / P2 = 0 / 0 / 0`になった。これはsourceがPR候補として安全という判定であり、実command未実行・CI未完了のためoperational readinessは引き続き主張しない。

| validation                              | 結果                    |
| --------------------------------------- | ----------------------- |
| focused Vitest                          | 4 files / 46 tests PASS |
| publication evidence Vitest             | 1 file / 6 tests PASS   |
| changed source/test lint                | 8 / 8 PASS              |
| publication artifacts Prettier          | 4 / 4 PASS              |
| custom adversarial probes               | 15 / 15 PASS            |
| import side-effect events               | 0                       |
| base review findings P0 / P1 / P2       | 0 / 0 / 0               |
| deployment-key互換性remediation再review | 0 / 0 / 0 PASS          |
| real teacher / network / AWS / live操作 | 0 / 0 / 0 / 0           |

15 probesはtest receipt昇格、CLI/brand偽造、one-shot replay/clone、private parent replacement/hardlink、5種のGit config、欠損object、engineへのAWS環境追加、CLI追加引数を含む。これはsourceとsynthetic/test seamの安全性検証であり、実24,000-parent処理の成功証拠ではない。

## 7. まだしていないこと

この変更は、教師生成を**実行可能な安全境界へ接続するsource候補を作った**段階である。互換性差分のblocking findings修正と独立再reviewは完了したが、publication evidenceとCIが閉じるまでは実runを開始できず、次の処理もまだ行っていない。

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
