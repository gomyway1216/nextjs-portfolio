# production復旧operatorを「実行不能な契約」へ戻す — Floodgate v7

> [PR #486](https://github.com/gomyway1216/nextjs-portfolio/pull/486)の旧head `6466c6f6f02c11ac8d2085304ca11d2c5c5b5a61`は全remote checkを通過したが、独立したpost-green監査で、検証対象のrepository codeが検証より先に実行される循環bootstrapが見つかった。そこで実装commit `33a1ebee795b16bc38e8b98fb99ad2b31a2544a7`はproduction package command、repository JXA、`tsx/cjs` preload、source authorizer、capability issuer、CLIを削除した。残るのはimport-freeな`UNAVAILABLE / STOP`契約だけであり、production stateを読む入口も権限もない。English version: [blog-shogi-floodgate-v7-production-recovery-operator-foundation.en.md](./blog-shogi-floodgate-v7-production-recovery-operator-foundation.en.md)

## 1. 結論

このPRは復旧operatorではない。将来のoperatorが満たすべき外部信頼条件と、現時点では実行不能であることを固定する**非運用の設計契約**である。

| 判断対象                                     | 現在の確定値                               |
| -------------------------------------------- | ------------------------------------------ |
| foundation delivery                          | PR #486、OPEN / ready for review           |
| non-operational redesign                     | `33a1ebee795b16bc38e8b98fb99ad2b31a2544a7` |
| latest `main` integration                    | `beb1dc817b0c2dd2cc6891dca31d64d7b94e7384` |
| package recovery command                     | なし                                       |
| repository JXA / native launcher             | なし                                       |
| `-r tsx/cjs` production preload              | なし                                       |
| production authorizer / issuer / capability  | なし                                       |
| production CLI / entrypoint                  | なし                                       |
| fixed contract decision                      | `UNAVAILABLE / STOP`                       |
| production state inspection                  | 0                                          |
| registry / lease / stage / work / key access | 0 / 0 / 0 / 0 / 0                          |
| persistent mutation / live change            | 0 / 0                                      |

[prefix-100初回停止の記事](./blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.md)に記録したstale active leaseと3-parent partial checkpointは、この変更では読んでいない。削除、隔離、再開、retryもしていない。

## 2. green CIでも止めた理由

旧設計のtestは、起動後の引数、nonce、process lineage、tracked sourceを細かく検査した。しかし、信頼判断の前に次のcodeが既に実行される構造だった。

1. `package.json`がrepository内のJXAを`osascript`へ直接渡すため、JXA自身の検査より先にそのbytesが解釈される
2. JXAがNodeを`-r tsx/cjs`で起動するため、Gitで追跡しない`node_modules/tsx`がentrypointとattestationより先に実行される
3. source captureは「cleanな40桁HEAD」であることだけを確認し、外部で承認されたcommit / treeとの一致を要求しない

さらに、required source全体のowner / mode、ancestor chain、absolute Git directory、common directory、object directoryを閉じていないのに、旧記事とJSONはそれらを検査済みと記録していた。

これはtest追加だけでは直らない。検証されるcode自身を検証主体にすると循環が残るため、今回のredesignでは運用経路と権限発行を削除した。旧headのgreen CIは削除前実装の回帰test結果であり、新しい設計のmerge authorityとして再利用しない。

## 3. 残した純粋なSTOP契約

残したsourceは[`ml/floodgate-v7-production-recovery-operator-foundation.ts`](../ml/floodgate-v7-production-recovery-operator-foundation.ts)だけである。import、filesystem、process、Git、network、production moduleへの参照を持たず、package scriptから到達できない。

| field                                                   | 固定値                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `contract`                                              | `shogi-floodgate-v7-production-recovery-operator-non-operational-foundation-v1` |
| `status` / `decision`                                   | `UNAVAILABLE` / `STOP`                                                          |
| `future_purpose`                                        | `inspect-stale-prefix-100`                                                      |
| `operational_entrypoint_available`                      | `false`                                                                         |
| `production_issuer_available`                           | `false`                                                                         |
| `repository_self_authorization_available`               | `false`                                                                         |
| `external_trust_root_installed`                         | `false`                                                                         |
| `approved_revision_enrolled` / `approved_tree_enrolled` | `false` / `false`                                                               |
| `source_authorized`                                     | `false`                                                                         |
| state access / mutation / live / disclosure             | すべて`false`                                                                   |

これはreceiptを出すCLIでも、sourceを認証するAPIでもない。direct importしたtestや説明用codeが同じfrozen markerを読むだけで、production authorityへ変換する関数は存在しない。

## 4. 次のPRに必要な外部信頼起点

将来のread-only inspectorを作る前に、別PRで少なくとも次を実装・reviewする必要がある。

- repository外へ固定installしたnativeまたは単一bundle launcher
- JXA self-attestationやuntracked loaderに依存しない起動
- create-onlyに登録したapproved commitとtree digestの認証
- HEADがそのapproved revisionとexact一致すること
- launcher、runtime、bundle、required source、全ancestorのowner / mode / nlink / canonical identity
- `--absolute-git-dir`、`--git-common-dir`、object directory、alternatesを含むGit control closure
- cleanだが未承認のcommit、ignored loader差替え、外部common/object store、group-writable / foreign-owner sourceを拒否するnegative test

その外部rootが一度だけ発行するopaque attestation以外から、repository codeがproduction capabilityを作れてはならない。今回のPRはこのrootをinstallも模擬もしていない。

## 5. 同じ12候補の診断で前進した点

[PR #487](https://github.com/gomyway1216/nextjs-portfolio/pull/487)は、PR #485のexact final headで同じ12候補をread-only診断した証拠を別管理し、最終head `cb3fd9697a8d5dfc5402c0a73b2a1e110a6adbff`を通常のmerge commit `bf643ceedb78c5103019609f7991f1a9f9664fef`で統合済みである。

| 項目                            | 観測                                            |
| ------------------------------- | ----------------------------------------------- |
| final head                      | `6a804a7954a9685361944aeb2be32494638fae2e`      |
| run-start bounds                | 2026-07-17 08:10:33Z〜08:27:23.026Z             |
| regular merge                   | 2026-07-17 08:27:59Z                            |
| run-finish bounds               | 2026-07-17 08:38:57.974Z〜08:55:48Z             |
| chronology                      | merge前に開始、merge中も継続、結果記録はmerge後 |
| post-merge deployment開始の証拠 | なし                                            |
| outcome                         | 7 fulfilled / 5 rejected                        |
| first pool failure safe kind    | `search-timeout`                                |
| timeout                         | 600,000 ms                                      |
| production gate / mutation      | 0 / 0                                           |

5 rejectは、最初のgenuine `search-timeout`をpool-wide poisonがbroadcastした結果である。5件が個別にtimeoutしたことや最初のtrigger indexは確定していない。これはtimeout分類の前進だが、timeoutの修正、最適worker数、partial checkpointの解決、棋力向上ではない。

## 6. 検証と未完gate

non-operational redesignと証拠更新を含むvalidation head `29b37ec25d5acd334a26d199c2617249f202e932`では、focused test 5 / 5、全167 files / 3,078 tests、production build、TypeScript、changed-file ESLint、format、Git whitespace checkがPASSした。その後、最新`main` `f1cc9bb9ad80af6916a5a9112f4128b38adc887b`を通常のmerge commit `beb1dc817b0c2dd2cc6891dca31d64d7b94e7384`で取り込み、影響範囲Vitest 11 / 11、Python stdlib 68 / 68、production build、TypeScript、changed-file ESLint、format、JSON parse、Git whitespace checkを再度PASSした。新しいfinal headのGitHub CIと独立reviewはまだ必要であり、旧headの結果を代用しない。

| validation                               | 現在の状態                               |
| ---------------------------------------- | ---------------------------------------- |
| non-operational contract focused test    | PASS、5 / 5                              |
| full Vitest                              | PASS、167 files / 3,078 tests / 303.47秒 |
| production build                         | PASS                                     |
| TypeScript                               | PASS                                     |
| format                                   | PASS                                     |
| changed-file ESLint                      | PASS                                     |
| Git diff whitespace                      | PASS                                     |
| latest-main affected Vitest              | PASS、2 files / 11 tests                 |
| latest-main Python stdlib                | PASS、68 / 68                            |
| latest-main production build             | PASS                                     |
| redesigned final-head GitHub CI          | PENDING                                  |
| redesigned final-head independent review | PENDING                                  |
| regular merge                            | PENDING                                  |

## 7. 実行していないこと

| operation                                           |         count |
| --------------------------------------------------- | ------------: |
| recovery operator / production inspector invocation |         0 / 0 |
| retry / cleanup / quarantine / resume               | 0 / 0 / 0 / 0 |
| 4 / 6 / 8 / 12 worker comparison                    |             0 |
| teacher generation / label finalization             |         0 / 0 |
| retraining / optimizer step                         |         0 / 0 |
| candidate selection / promotion                     |         0 / 0 |
| formal A/B / external calibration                   |         0 / 0 |
| production weight overwrite / live activation       |         0 / 0 |

exact-final-head 12候補read-only診断は1回完了したが、merge前に開始しており、post-merge deployment実行には数えない。production incident stateへのoperator invocationにも数えない。

## 8. 安全な次の順序

1. redesigned PR #486のfull test、final-head CI、fresh independent reviewを完了し、通常mergeする
2. PR #486をoperatorとして配備・実行せず、非運用契約としてのみ扱う
3. 4 / 6 / 8 / 12 workersを同じprivacy境界で比較し、tail latency、timeout、throughputを測る
4. playing qualityを保つruntime修正を選び、変更後bindingを新runとして扱う
5. repository外のtrust root、approved commit / tree enrollment、no-preload bundleを別PRで実装する
6. そのtrust rootのreview・CI・通常merge後にだけ、zero-argument read-only inspectorを別PRで作る
7. inspectorのreview・merge後に1回だけfresh inspectionし、不一致、認証不能、indeterminateならSTOPする
8. fresh evidenceが一致した場合だけ、human-confirmed quarantineまたは別承認fresh restartをreviewする
9. 完全な教師data後にのみ再学習、候補選抜、正式A/B、外部校正を行い、棋力とrollback証拠が揃った場合だけlive activationを検討する

## 9. 現時点の判断

旧設計をgreenのままマージせず、危険なbootstrapと権限発行を削除した。現在のPR #486はproductionを動かせず、外部trust rootもapproved revisionもまだない。従ってproduction判断は引き続き**STOP**であり、live weightsは変更しない。[機械可読証拠](./data/floodgate-v7-production-recovery-operator-foundation-2026-07-17.json)は、削除したauthority、#487の正確な時系列、zero production access、未完gateを分離して記録する。
