# production復旧operatorの固定入口をSTOP-onlyで分離する — Floodgate v7

> prefix-100の部分checkpointを安全に扱うには、通常applicationとは別の固定origin、native launch証明、exact clean source証明、目的限定capabilityが先に必要である。本candidateはその入口だけを実装し、production stateへは一切accessしない。実行可能な唯一のpurposeは`inspect-stale-prefix-100`だが、現在のentrypointは必ず`NOT-YET-IMPLEMENTED / STOP`、exit 78を返す。inspector、reconciliation、retry、cleanup、quarantine、resumeはまだ実装していない。production weightとlive activationも変更していない。English version: [blog-shogi-floodgate-v7-production-recovery-operator-foundation.en.md](./blog-shogi-floodgate-v7-production-recovery-operator-foundation.en.md)

## 1. 結論

これは「復旧を実行する変更」ではない。production incident stateへ近づく前に、誰が、どの固定sourceから、どの1目的でoperatorを開始できるかをfail-closedに限定する基盤である。

| 判断対象                               | 確定結果                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| diagnostic projection prerequisite     | [PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484)、通常merge `1c5ec24a8c3a9ad9871bef1621034113112396b5` |
| safe failure-kind prerequisite         | [PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485)、通常merge `4b46fd3761512f38bada4c7c23537a969349a804` |
| foundation implementation              | `dfa295d6bb505652ec4fa39fe9fc71c6205b3834`                                                                                |
| initial `main` integration             | 通常merge `3a12802acc0a538d22a92b76f7e02669fde61ea3`                                                                      |
| latest integrated `main` revision      | `4b46fd3761512f38bada4c7c23537a969349a804`                                                                                |
| latest integration merge               | 通常merge `5f22bd14a10b35e09cef39a0cba93f733464dc52`                                                                      |
| allowed purpose                        | `inspect-stale-prefix-100`だけ                                                                                            |
| implemented stage                      | `stop-entry`だけ                                                                                                          |
| CLI status / decision                  | `NOT-YET-IMPLEMENTED` / **STOP**                                                                                          |
| process exit                           | 78                                                                                                                        |
| production state inspection            | 0                                                                                                                         |
| registry / lease / stage / work access | 0 / 0 / 0 / 0                                                                                                             |
| persistent mutation                    | 0                                                                                                                         |
| live weight / activation change        | 0 / 0                                                                                                                     |

[prefix-100初回停止の記事](./blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.md)で記録した認証済みstale active leaseと4件の完全recordは、そのまま保全対象である。このfoundationはそれらを読んでおらず、記事のread-only auditを再実行したものでもない。

#485により、最初のbranded / frozen worker failureからpool-wide poisonまで、allowlist済み`failure_kind`と必要な`timeout_ms`だけを保持するcodeは通常mergeされた。ただし同じ12件のread-only再実行もproduction incident stateへの適用も0である。source foundationはこの新しいcode availabilityをproduction observationとして扱わない。

## 2. なぜ入口を先に分離するのか

prefix-100 incidentでは、outer lease、inner stage、checkpointを一貫したauthorityで再検査しない限り、自動retryも手作業cleanupも安全ではない。ただしinspector本体を先に接続すると、sourceの取り違えや通常application capabilityの流用がproduction accessへ直結する。

そこで今回の変更は、次の二段階を分けた。

1. 今回: production dataをimportしない固定入口、launch証明、source証明、STOP-only capabilityを作る
2. 次回以降: 別review単位でread-only inspectorを実装し、さらに別gateでreconciliation authorityを作る

foundationのsource rootは通常production application checkoutと異なる固定suffixを持つ。callerがpath、revision、purpose、entrypoint、runtime optionを選ぶinterfaceはない。通常applicationのcapability registryも共有しない。

## 3. 固定launchとsource closure

native helperはDarwin JXAから固定Node v22.13.0を起動し、標準入力をoperator inputではなくprivate one-shot attestation pipeとして使う。child側はnonce、parent PID、helper、purpose、entrypoint、`osascript` parent commandを照合し、replayを拒否する。

source authorizationは固定checkoutのclean revisionだけを受理し、次の9 pathをtracked closureとして検査する。

| closure class   | 固定対象                                                      |
| --------------- | ------------------------------------------------------------- |
| project binding | `package.json`、`package-lock.json`、`tsconfig.json`          |
| native launch   | production JXA helper、attestation module                     |
| operator entry  | STOP-only entrypoint、source authorization、source provenance |
| Git verifier    | fixed Git helper                                              |

加えて、required pathのHEAD / index / ordinary-file一致、real path一致、symlinkなし、hardlinkなし、group/other書込みなしを検査する。Git object directory、common object directory、`info/alternates`、environment alternatesも固定境界外なら拒否する。entrypointのcwd、argv、main module、loader optionもexact tupleでなければcapabilityを発行しない。

## 4. STOP receiptが保証する境界

source authorizationが成功しても、現在のentrypointが返せるのは次の固定contractだけである。

| field                              | 値                                                            |
| ---------------------------------- | ------------------------------------------------------------- |
| `contract`                         | `shogi-floodgate-v7-production-recovery-operator-cli-stop-v1` |
| `status`                           | `NOT-YET-IMPLEMENTED`                                         |
| `decision`                         | `STOP`                                                        |
| `purpose`                          | `inspect-stale-prefix-100`                                    |
| `source_authorized`                | authorization結果だけ                                         |
| state access flags                 | すべて`false`                                                 |
| mutation / live / disclosure flags | すべて`false`                                                 |

authorizationが失敗してもproductionへfallbackしない。`source_authorized = false`のSTOP receiptを試み、nonzero exitを維持する。stderrへ書けない場合もexit 78がauthorityである。

entrypointはproduction registry、lease、stage、work、deployment keyをimportしない。このため「sourceが正しい」ことを「incident stateをinspectionした」「cleanupしてよい」「resumeしてよい」へ読み替えることはできない。

## 5. 検証

foundation単独のfocused testは49 / 49、#484のconnector回帰を含む最初の`main`統合後は77 / 77がPASSした。さらに#485を通常mergeした最新integrationでは、foundation、projection、failure-kindのaffected 6 files、187 / 187がPASSした。Darwin実機のJXA integrationは、実際のFoundation `NSNumber`と数値へcoerceできる値を通し、native `integerValue`分岐も検証した。

| validation                               | 結果            |
| ---------------------------------------- | --------------- |
| foundation unit + source-hardening tests | PASS、49 / 49   |
| post-`main` focused regression           | PASS、77 / 77   |
| latest affected integration regression   | PASS、187 / 187 |
| TypeScript typecheck                     | PASS            |
| changed-file ESLint                      | PASS            |
| TypeScript / JSON / JXA formatting       | PASS            |
| production + fixture JXA compile         | PASS            |
| Git diff whitespace check                | PASS            |
| public artifact privacy scan             | PASS            |

testは、wrong root / argv / loader / runtime、replayed attestation、symlink / hardlink、dirty tracked source、alternate object store、proxy argv、module-load bypass patternをfail-closedで拒否する境界を含む。これらのPASSはsource入口の証拠であり、production inspectorの正しさや復旧可能性の証拠ではない。

## 6. 実行していないこと

| operation                                     | count / state |
| --------------------------------------------- | ------------: |
| production operator invocation                |             0 |
| production state inspection                   |             0 |
| registry / lease / stage / work access        | 0 / 0 / 0 / 0 |
| deployment key access                         |             0 |
| retry / cleanup / quarantine / resume         | 0 / 0 / 0 / 0 |
| merged failure-kind production rerun          |             0 |
| 4 / 6 / 8 / 12 worker benchmark               |             0 |
| teacher generation / label finalization       |         0 / 0 |
| retraining / optimizer step                   |         0 / 0 |
| candidate selection / promotion               |         0 / 0 |
| formal A/B / external calibration             |         0 / 0 |
| production weight overwrite / live activation |         0 / 0 |

したがって、この変更は棋力を変えていない。「強くなった」「高段へ到達した」というclaimも作っていない。

## 7. 安全な次の順序

1. foundation candidateをfinal-head CI、独立review、通常mergeへ通す
2. 通常merge済みrevisionを専用の固定recovery checkoutへ配備し、clean tracked sourceを固定する。ただしSTOP-only entrypointをproduction inspectionとして実行しない
3. 通常merge済み[PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485)のcodeで、同じ12件をread-only再実行する。raw stderr、PID、局面、parent IDを公開せず、最初のsafe worker failure kindとtimeout値を取得する
4. 同じread-only inputで4 / 6 / 8 / 12 workersを比較し、timeout境界とtail latencyの原因を確定する
5. foundationとは別PRで、production registry、lease、stage、checkpointを同じprocessで認証するzero-argument read-only inspectorを実装する。出力はsanitized countと固定classificationだけにする
6. inspectorをfinal-head CI、独立review、通常mergeした後、固定revisionからread-only inspectionを1回だけ実行する。不一致、認証不能、indeterminateならSTOPする
7. fresh evidenceが一致した場合だけ、resumeまたはquarantine後の別承認fresh restartを人間が選ぶreconciliation flowを別途reviewする。自動選択しない
8. exact-100が成功しても一度STOPし、承認後だけ500、final-24,000、教師確定、再学習、候補選抜、正式A/B、外部校正へ進む
9. 安全性、品質、棋力、rollbackの証拠が揃った場合だけlive activationを検討する

## 8. 現時点の判断

#484によりsanitized outer phaseの投影修正、#485によりsafe worker failure-kind伝播は通常mergeされた。ただしどちらもproduction incident stateでは未実行で、同じ12件も再実行していない。今回のcandidateは、将来のread-only inspectorを接続するための固定入口を作ったが、意図的に**STOP-only**である。

従って現在のproduction判断は引き続き**STOP**である。[機械可読証拠](./data/floodgate-v7-production-recovery-operator-foundation-2026-07-17.json)は、source foundationの証拠と、未実装・未実行のproduction operation、棋力nonclaimを分離して記録する。
