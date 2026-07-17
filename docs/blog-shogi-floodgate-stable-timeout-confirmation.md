# merged safe failure kindを実12候補で確認した

> PR #485のfinal head `6a804a7954a9685361944aeb2be32494638fae2e`を通常mergeした後、前回と同じ12-worker構成と認証済みtraining inputを使い、production stateへ書かないread-only診断を実行した。候補12件中7件は0.855〜264.590秒で成功し、残る5件は約600秒でrejectされた。5 rejectは全てmodule-private authorityが認証した`search-timeout`、`timeout_ms = 600000`を受け取った。ただし、5件が個別に独立timeoutしたと特定したのではない。最初のworker failureをpool-wide poisonがbroadcastしたため5件が同じgenuine safe metadataを受けたのであり、最初にtriggerしたindexは非特定である。runtime closeと全worker reapは完了し、production persistent stateの比較カウンタは全scopeで0だった。English version: [blog-shogi-floodgate-stable-timeout-confirmation.en.md](./blog-shogi-floodgate-stable-timeout-confirmation.en.md)

## 1. 結論

今回確定したのは「固定600秒境界の最初のpool failure kindが`search-timeout`だった」ことである。以前は時間だけが600秒に一致し、poolが元errorを捨てていたため安全な分類は`unknown`、時間推定だけが`search-timeout`だった。merged codeでは、module-private `WeakMap`でmintされたgenuine errorだけをinspectorが受理する。同じ構成を再現した結果、5 reject全てのnested primaryから次を取得できた。

| field          | 確認値              |
| -------------- | ------------------- |
| `failure_kind` | `search-timeout`    |
| `timeout_ms`   | `600000`            |
| genuine brand  | inspectorで確認済み |
| raw cause      | 保存・公開なし      |

これはtimeoutを直した結果ではない。分類が失われず、安全な値だけで停止理由を確認できるようになった結果である。

## 2. 実行境界

診断はPR #485の通常merge commit `4b46fd3761512f38bada4c7c23537a969349a804`を前提に、final implementation headと同じcodeで実施した。

| 項目                       | 値                                         |
| -------------------------- | ------------------------------------------ |
| implementation head        | `6a804a7954a9685361944aeb2be32494638fae2e` |
| merge method               | regular merge commit                       |
| workers                    | 12                                         |
| search timeout             | 600,000 ms                                 |
| logical candidate window   | index 3〜14相当の12件                      |
| input                      | pinned verifierで認証済みtraining rows     |
| production gate invocation | 0                                          |
| checkpoint retry / resume  | 0 / 0                                      |
| lease cleanup / quarantine | 0 / 0                                      |
| live evaluator change      | false                                      |

これはproduction gateの再実行でも、stale leaseのreconciliationでもない。固定asset authorityとproduction training-row verifierを読み取り専用で使い、stable proposalだけを同じ構成で直接再現した診断である。

## 3. 実測結果

入力認証・整列に1,103.693秒、stable runtime初期化に0.165秒かかった。12件を同時投入した後のsanitized結果は次のとおりである。

| outcome   | count | elapsed seconds                                       |
| --------- | ----: | ----------------------------------------------------- |
| fulfilled |     7 | 0.855, 1.334, 5.728, 66.382, 95.132, 107.763, 264.590 |
| rejected  |     5 | 599.997, 599.999, 600.000, 600.001, 600.003           |

5 rejectは全て`failure_kind = search-timeout`、`timeout_ms = 600000`だった。診断総時間は1,704.974秒で、parent Node processのpeak RSSは6,781.5 MiBだった。runtime `close()`はfulfilledし、終了後にfixed worker bootstrap signatureで確認した残存stable workerは0、YaneuraOu processも0だった。

## 4. pool broadcastをどう読むか

この5 rejectを「5件がそれぞれ独立に600秒timeoutした」と読んではならない。

```text
one worker emits the first genuine search-timeout
  -> reusable pool stores that terminal safe error
  -> pool-wide poison rejects every still-active job
  -> five wrappers expose the same genuine safe metadata
```

従って今回の正確なclaimは次のとおりである。

- 最初のpool poison causeのsafe kindは`search-timeout`
- exact timeout値は600,000 ms
- pool broadcastにより5 reject全てが同じgenuine safe metadataを受けた
- 5個別の独立timeout eventは未確定
- 最初にtriggerしたworkerまたはinput indexは非特定

runtime wrapperはjobごとに外側errorを作るため、この診断は外側wrapper objectの同一identityをclaimしない。merged unit testsはpool内のterminal safe error identityがactive、queued、future proposalで保持されることを別に固定している。

## 5. persistent stateとcleanup

実行前後に、pathやdigestを公開しないin-memory fingerprintを比較した。

| scope                        | mutation counter |
| ---------------------------- | ---------------: |
| connector registry           |                0 |
| authenticated training input |                0 |
| stable / teacher assets      |                0 |
| approved control plane       |                0 |
| deployment-key metadata      |                0 |

registry scopeには既存lease、runs、stage checkpoint、quarantine / retired namespaceが含まれる。asset scopeには現在の固定評価assetが含まれる。全scopeが一致し、persistent state unchangedは`true`だった。deployment root-key bytesはfingerprintのために読んでおらず、metadataだけを比較した。

診断後にproduction retry、cleanup、quarantine、checkpoint resume、teacher generation、training、weight overwrite、live activationは実行していない。

## 6. privacy境界

公開したのは件数、経過秒、allowlist済みfailure kind、timeout値、resourceとcleanupの安全な集計だけである。次は出力、記事、machine-readable evidenceへ保存していない。

- raw stderr、raw error message、stack、child exit detail
- PID、worker index、個別のtrigger index
- SFEN、move、game ID、parent ID、position ID
- request / result payload、private path、private digest、filesystem identity
- deployment key bytes、checkpoint authentication material

operatorがlogical candidate windowを3〜14相当として選んだ事実は記録するが、safe error object自体はinput indexを含まない。

## 7. 現在の判断

PR #485の目的だった「private causeを増やさず、最初のworker failure kindをpool poison越しに保持する」は、merged codeと認証済み実データで確認できた。一方、次は未確定である。

- なぜ5件のうち少なくとも1件がdepth 11を10分以内に完了しなかったか
- 4 / 6 / 8 / 12 workersのどれがtail latencyとthroughputを最適化するか
- worker数、timeout、探索戦略のどの修正がplaying qualityを保つか
- stale leaseと3-parent partial checkpointをどうreconcileするか
- 教師data、再学習、候補選抜、正式A/B、外部校正、安定高段

従ってproductionは引き続き**STOP**であり、live weightsは変更しない。次は同じprivacy境界でworker数別のtail-latency比較を設計し、別authorityのrecovery operatorで既存partial stateを解決する。[機械可読証拠](./data/floodgate-stable-timeout-confirmation-2026-07-17.json)は実測、broadcastの解釈、zero mutation、nonclaimを分離して記録する。
