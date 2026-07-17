# JXAのNSNumber変換で止まったproduction launcherを修正する — Floodgate v7

> [PR #482](https://github.com/gomyway1216/nextjs-portfolio/pull/482)はGitHub check 6 / 6を通過し、通常のmerge commit `52d73dd5a82de2ca508da2aee664326c47acc5d2`で統合された。その後、固定production applicationをこのmergeへ合わせて最初のreadinessを実行したところ、native launcherがauthorizationより前にexit 70で停止した。原因はFoundationの`NSNumber`をJXAの`Number(...)`へ直接渡した数値変換だった。修正はexact commit `03d5ef257b19c4d429626065d957487517cd86c4`へ固定し、`ObjC.unwrap(...)`後のsafe integer変換をfile permissions、PID、task statusへ適用した。full 3,058 testsを含むlocal validationと独立auditはPASSしたが、修正PR番号、final-head GitHub CI、通常mergeはPENDINGである。productionは引き続き**STOP**であり、registry、教師、学習、weight、live評価は変更していない。English version: [blog-shogi-floodgate-v7-production-native-launcher-nsnumber-fix.en.md](./blog-shogi-floodgate-v7-production-native-launcher-nsnumber-fix.en.md)

## 1. 結論

今回止まったのは評価関数でもsource readiness本体でもない。macOSのJXAでFoundation objectからPOSIX permissionを読み出した後、その`NSNumber` wrapperへ直接`Number(...)`を適用したnative launcherのpre-authorization検査である。

このhostで最小診断を行うと、結果は次のように分かれた。

```text
Number(NSFilePosixPermissionsのNSNumber)          -> NaN
Number(ObjC.unwrap(NSFilePosixPermissionsの値))  -> 493
```

493は対象fileのexact modeを表すsafe integerである。元のlauncherは最初の値をintegerとして拒否したため、意図どおりfail closedし、固定のsanitized messageとexit 70だけを返した。sourceがdirtyだった、owner / modeが不正だった、approved key bindingが違った、という判定にはまだ到達していない。

修正候補はFoundation numeric wrapperを明示的にunwrapしてから`Number.isSafeInteger`で検査する`integerValue`を追加し、permission、parent PID、child termination statusの3か所を同じ境界へ揃える。さらにDarwin上で実際のFoundation file attributeを読むruntime regressionを加える。ただし、候補を作ったことと、最終deliveryが通ったことは別である。修正PRとその検証結果が確定するまでproductionは進めない。

## 2. #482 merge後に実行した準備

| 工程                                 | 結果              | 境界                                                          |
| ------------------------------------ | ----------------- | ------------------------------------------------------------- |
| operator-readiness PR                | PASS / MERGED     | #482、GitHub check 6 / 6、regular merge `52d73dd5...`         |
| 固定production application worktree  | CREATED / ALIGNED | 最初は存在せず、detached HEADで`52d73dd5...`へ作成            |
| 固定connector verifier               | ALIGNED           | `b086243`から`e8a9197608cb48b1160b6707d97b0c4f78f90a1d`へ更新 |
| application dependencies             | INSTALLED         | Node `v22.13.0`、npm `11.14.1`、`npm ci --ignore-scripts`     |
| npm経由のsource readiness            | STOPPED           | authorization前、exit 70                                      |
| direct `osascript`のsource readiness | STOPPED           | 同じauthorization前、exit 70                                  |

固定worktreeの作成、revision alignment、dependency installは、readinessを実行可能にする準備である。`npm ci --ignore-scripts`はinstall scriptを実行していないが、ignored / untracked dependency bytesの完全なclosureを証明するものではない。

npm wrapperを外したdirect `osascript`でも同じexit 70だったため、失敗はnpmの終了code変換やpackage script routingだけでは説明できなかった。launcher内のFoundation numeric conversionまで切り分けた診断で、unwrap前だけが`NaN`になり、unwrap後にはexact mode 493が得られることを確認した。

## 3. fail closedが守ったもの

2回のreadiness attemptは、いずれもattested child authorizationより前に停止した。したがって、この失敗中に次の処理は実行していない。

- application-source authorizationまたはそのcapability発行
- registryの作成、adopt、overwrite、rotation
- approved/current bindingをauthorityとして利用する処理
- control namespace、durable lease、quarantine、reconciliationの変更
- gate、checkpoint、teacher generation、label finalization
- training、optimizer step、candidate selection、正式A/B、外部校正
- production weight overwriteまたはlive activation

これは「productionがGOだった」ことを示さない。逆に、数値の扱いを証明できなかった時点で停止し、後続authorityを出さなかったことを示す。

## 4. 根本原因と修正境界

JXAではObjective-C bridge objectの見た目がJavaScript primitiveに近くても、JavaScriptの直接変換が期待どおりになるとは限らない。このhostでは`NSFilePosixPermissions`から得たFoundation `NSNumber`の直接変換が`NaN`となった。一方、`ObjC.unwrap(...)`でbridgeを外した値はexact integer 493へ変換できた。

候補の`integerValue`は次を一か所で行う。

```text
Foundation numeric value
  -> ObjC.unwrap
  -> Number
  -> Number.isSafeInteger
  -> integer、またはauthorization前にfail closed
```

この関数を次へ適用する。

1. native tool / helperのowner-mode検査に使うPOSIX permission
2. live parent照合に使うcurrent process PID
3. child taskの終了判定に使うtermination status

Darwin runtime regressionは、source textに`unwrap`という文字があるだけでなく、実際にFoundationからfile attributeを取得し、unwrap後のpermissionがfilesystemのmodeと一致するsafe integerであることを検査する。これは今回のhost固有挙動を再現するための回帰境界である。

一方、この修正はtool byte closure、atomic process-lineage snapshot、same-UID / ancestor hostile process isolation、ignored dependency closureを追加しない。また、readiness success、registry authority、reconciliation authority、棋力証拠も発行しない。

## 5. sanitized read-only state audit

停止後に、private値を出さないread-only棚卸しで次の状態だけを確認した。

| state                 | metadata-safe observation |
| --------------------- | ------------------------- |
| production registry   | absent                    |
| human-approved record | present                   |
| current key           | present                   |
| control state         | absent                    |
| active lease          | absent                    |
| quarantine state      | absent                    |
| indeterminate state   | absent                    |

この棚卸しはpath、numeric user identity、key identity、digest、private record valueを公開しない。approved recordとcurrent keyが「存在する」ことは、両者のexact 8-field bindingがfreshに成功したことを意味しない。native launcherがその検査より前に止まったため、現時点の運用判断は**NOT GO / STOP**である。

registryがabsentであることも、作成してよいauthorityにはならない。fixed application source、fixed verifier、approved/current bindingを修正後のfresh invocationで順番に確かめ、provisioner自身が同じ条件を再検査するまでcreate-only provisionへ進まない。

## 6. 修正deliveryの現在地

| gate / 検査                        | 状態    | exact結果                                                                                  |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| 根本原因のhost診断                 | PROVED  | direct wrapper conversionは`NaN`、unwrap後はexact 493                                      |
| exact fix commit                   | PASS    | `03d5ef257b19c4d429626065d957487517cd86c4`                                                 |
| Darwin launcher regression         | PASS    | 1 file / 23 tests、Foundation mode / PID / `/usr/bin/true` termination statusを実機確認    |
| full Vitest                        | PASS    | 166 / 166 files、3,058 / 3,058 tests、303.62秒、wall 303.99秒、最大RSS 2,374,696,960 bytes |
| production build                   | PASS    | wall 24.67秒、最大RSS 2,640,740,352 bytes、swap / block I/O 0                              |
| TypeScript / full ESLint           | PASS    | 2.75秒 / errors 0・既存warnings 157・24.22秒                                               |
| ML stdlib / npm audit              | PASS    | 58 / 58、0.36秒 / vulnerabilities 0、0.47秒                                                |
| Prettier / JXA syntax              | PASS    | changed files / `osacompile -l JavaScript`                                                 |
| independent final audit            | PASS    | P0 / P1 / P2 = 0 / 0 / 0                                                                   |
| fix pull request                   | PENDING | 番号未確定                                                                                 |
| final-head GitHub CI / review      | PENDING | 完了を先取りしない                                                                         |
| regular merge                      | PENDING | 全gate通過後のみ                                                                           |
| production application realignment | BLOCKED | fix PR自身のmerge commit待ち                                                               |
| fresh production readiness         | BLOCKED | merge / realignment待ち                                                                    |

PR #482の6 checksとmergeはoperator-readiness deliveryの証拠であり、その後に見つかったNSNumber修正候補のCI証拠として再利用しない。

## 7. productionと棋力への影響

今回行ったproduction側の変更は、固定application worktreeの作成と#482 mergeへのalignment、固定verifierの既承認revisionへのalignment、application dependency installまでである。live evaluator、runOp1、weight、教師data、training stateは変更していない。

source readinessは成功0回で、registry provision、kill drill、prefix-100 / 500 / final-24000、teacher generation、training、candidate promotion、正式A/B、外部校正、live activationも0回である。したがって棋力は未評価であり、「強くなった」「安定して高段になった」というclaimはない。

## 8. 安全な次の順序

1. このevidenceをcommitし、NSNumber修正をreview-ready PRとして公開する
2. final headのGitHub CIとreviewをすべて通し、通常mergeする
3. 固定production application worktreeを**この修正PR自身のmerge commit**へrealignする
4. 固定verifierが`e8a9197608cb48b1160b6707d97b0c4f78f90a1d`であることをfreshに確認する
5. standalone application-source readinessをfreshに実行する
6. standalone connector-verifier readinessをfreshに実行する
7. standalone approved/current binding readinessをfreshに実行する
8. 3つすべてが成功した場合だけ、provisioner内でもfreshに再検査してregistry V2をcreate-onlyで作成する
9. その後もkill drill、prefix-100 preflight、prefix-100 exactly onceのstop gateを守る
10. 教師生成、再学習、候補選抜、正式A/B、外部校正を終え、安全性・品質・棋力・rollback証拠が揃った場合だけlive activationを検討する

いずれかのfresh checkが失敗、stale、quarantined、indeterminateならSTOPする。自動修復、adopt、overwrite、rotation、retry、次gateへの進行はしない。

## 9. 現時点の判断

NSNumberの根本原因は再現でき、修正はexact commitへ固定され、full local validationと独立auditも通過した。しかし、修正PR、final-head CI、通常mergeはまだ確定していない。sanitized auditに危険なcontrol / lease / quarantine / indeterminate stateは見えていない一方、それはGO evidenceではない。

したがって現時点は**STOP**である。次の有効な前進はlauncher fixを通常mergeし、そのmerge revisionへapplicationを再固定して、source、verifier、approved/current bindingの3つをfreshに通すことである。[機械可読証拠](./data/floodgate-v7-production-native-launcher-nsnumber-fix-2026-07-16.json)も、確定した#482、実行済み準備、失敗したreadiness、sanitized state、未確定のfix deliveryを分けて記録する。
