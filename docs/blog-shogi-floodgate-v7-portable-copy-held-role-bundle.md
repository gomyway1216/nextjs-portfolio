# Floodgate v7 portable copy held role-bundle: exact 9 filesをheld descriptorから読む

> 2026-07-19時点の結論: portable copy先のrole-bundleを、callback前後のpath再検証だけでなく、held root descriptorとexact 9 file descriptorから読み、SHA-256・EOF・post-callback identityまで確認する最後の安全基盤を追加した。snapshotはpath / FD / dev / inoを出さず、同期one-shot claim、callback settlement後のbuffer zeroization、全handle close、composite postflightを通る。このPR / current gate executionによる棋力への直接効果は0で、実teacher、sealed / final label、training、候補選抜、正式A/B、live weight変更もすべて0である。これはproject全履歴のteacher開始回数を0とする主張ではない。次の別工程は既存gate下で最初の100実ラベルを生成する。English version: [blog-shogi-floodgate-v7-portable-copy-held-role-bundle.en.md](./blog-shogi-floodgate-v7-portable-copy-held-role-bundle.en.md)

## 追加した境界

`role-bundle-tree`はroot直下の次の9 filesだけを受け入れる。

1. `fresh-final-holdout.protected-position-ids.txt`
2. `fresh-final-holdout.raw.jsonl`
3. `fresh-selection.protected-position-ids.txt`
4. `fresh-selection.raw.jsonl`
5. `manifest.json`
6. `replay-excluded-position-ids.txt`
7. `replay-exclusion-receipt.json`
8. `training.protected-position-ids.txt`
9. `training.raw.jsonl`

composite precheck後、rootを`O_DIRECTORY | O_NOFOLLOW`で開き、9 filesも`O_NOFOLLOW`で開く。各descriptorをprivate inventoryのidentityへ照合し、全byteのSHA-256と明示的EOFを確認する。callback settlement後にもheld descriptorを`fstat`し、retained bufferをzeroizeして9 file handlesとroot handleをすべて閉じ、その後にcomposite destinationを再検証する。途中open、callback、zeroization、close、postflightのどこで失敗しても成功値は返さず、開いたhandleをdrainする。

公開snapshotのexact keysは`files` / `manifestBytes` / `trainingRawBytes`で、各file identityは`filename` / `bytes` / `sha256`だけである。`manifest.json`は最大65,536 bytes、`training.raw.jsonl`は最大67,108,864 bytes。zero-byteの非retained fileも正しいSHA-256 / EOFで受理する。byte viewはcallbackのPromiseがsettleするまで読めるが、その後はzeroizeされる。callerが別途作ったcopyまで消す、または一般的な機密消去を証明するものではない。

低層claimは同期one-shotで、replay、clone、Proxy、microtask-late、production / test registry混同を拒否する。owner経路はさらにexact ownerとbound bridgeへ一つのunderlying claimを束縛し、generic borrowとheld borrowの直列化、cross-owner拒否、reentry / revoke失敗時の失効を共有する。

## 明示的な非主張

この基盤のSHA-256はcopy destination inventoryとのbyte一致であり、generic source semantic verifierが認証したSHA-256 / record identityではない。manifestやtraining rowsの意味検証、callback中のabsolute-path namespace排他性、callbackが別途保持したpathから読むことの禁止も証明しない。

したがって、次は**このPR / current held-role-bundle gate executionだけ**のカウンタであり、project全履歴の累計ではない。

| operation                                   | count |
| ------------------------------------------- | ----: |
| real source semantic verification           |     0 |
| real copy / destination consumer            |     0 |
| teacher process / teacher label             |     0 |
| optimizer training / candidate selection    |     0 |
| holdout / formal A/B / external calibration |     0 |
| weight change / live activation / match     |     0 |

AWSは不要で使用0、Firebase Cloud Functions / GCPとVercel evaluator computeも0、runtime / unit testのnetwork使用も0である。GitHub CIやVercel Web previewはsource-control / Web deploymentの検証であり、将棋teacherや学習computeではない。

既知の過去履歴として、2026-07-16にprefix-100を1回開始し、1,597秒後に安全停止した。そのrunは認証済み親レコード3件を保存し、永続化fileはheader込み4行である。ただし100件は完成せず、sealed / final labels、training、正式A/B、live activationは0だった。この過去runは上表のcurrent gate executionへ加算せず、今回のPRがreal executionを行った証拠にも使わない。

## 実測とidentity pin

Node v22.13.0で、evidence追加前の関連回帰は6 files / 94 / 94 PASS、wall 3.21秒だった。owner単体は37 / 37 PASS、1.66秒、held専用testは11 / 11 PASS。evidenceを含むfocused回帰は7 files / 99 / 99 PASS。独立reviewはP0 / P1 / P2 / P3 = 0 / 0 / 0 / 0である。

低層導入revisionは`7418a4f8262137e058eafd081eeae3d72dd01fca`、owner束縛を含むvalidated revisionは`4aac34df6b65beeade12722fd116f6ce39a2105a`。mutable HEADではなくvalidated revisionのhistorical bytesを固定する。

| file                                                          |   bytes | SHA-256                                                            | Git blob                                   |
| ------------------------------------------------------------- | ------: | ------------------------------------------------------------------ | ------------------------------------------ |
| `ml/floodgate-v7-clean-room-copy.ts`                          | 101,566 | `71059b52666292654a6d1f556dbb6aa1aad97e915d603aaffca3945f4c2503f4` | `1b5cc466b9bdc19be2f77253090faa7930061e75` |
| `ml/floodgate-v7-portable-copy-owner.ts`                      |  43,192 | `c781320bc91dae97b87c8bfbb9ac31ac5f169dec4000bf4d800cb72b662b5312` | `72aa74d709b957dabeac76364c129a9e7ca06219` |
| `tests/unit/ml/floodgateV7PortableCopyWitness.test.ts`        |  38,656 | `8db59f7f3261f16f38ac498e215d8df7611a18c041ab30a3ca97634b563f5570` | `db6b2ca96760f4c979542dd607eb8e5280d409a8` |
| `tests/unit/ml/floodgateV7PortableCopyOwner.test.ts`          |  47,856 | `de728a71209cc841a4691c14cd3a6b121c9d85c6959c0eae1edf7893d009a3f8` | `059767f9a9e15c1d93d229d38634b439076bf7d7` |
| `tests/unit/ml/floodgateV7PortableCopyHeldRoleBundle.test.ts` |  25,719 | `fb87bd1229c0e9c4ad1c134fc03bb8ad19eeaecebf2e440eef7cdafe1a544418` | `07f1f8d4fdc7597c4ca9625ed030007fde0158aa` |

machine-readable evidenceは[`floodgate-v7-portable-copy-held-role-bundle-2026-07-19.json`](./data/floodgate-v7-portable-copy-held-role-bundle-2026-07-19.json)にある。

## 次の工程

これは100実ラベル前の最後の安全基盤である。次は別のruntime gateでgeneric source verifierの認証identityとこのheld snapshotを結び、最初の100実ラベルだけを生成してreceipt、失敗分類、重複排除を検査する。このPR自身はteacherやtrainingを実行せず、100件の結果が揃っても候補学習・A/B・live activationは別gateのままである。
