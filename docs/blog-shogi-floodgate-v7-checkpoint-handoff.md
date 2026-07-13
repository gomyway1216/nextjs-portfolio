# production coordinatorをcheckpoint connectorへ一度だけhandoffする

> 前段の[production parent coordinator](./blog-shogi-floodgate-v7-production-parent-coordinator.md)は、exact production runtime pairを1親operationとv2 `run_binding`へ閉じた。[deployment key authority](./blog-shogi-floodgate-v7-deployment-key-authority.md)はstrict captureしたcaller-supplied run / stage metadataへfixed deployment keyのMACを発行できる。しかし、5-key coordinator facadeをそのままcheckpointへ渡せず、metadata MACだけでもcoordinator originを証明できない。この変更は、factory-issued exact coordinator identityからtrusted checkpoint connector用の4-key capabilityを一度だけ投影する。checkpoint実行、key provision、dataset read、teacher label、学習、weight、live評価関数、対局、棋力の証拠ではない。English version: [blog-shogi-floodgate-v7-checkpoint-handoff.en.md](./blog-shogi-floodgate-v7-checkpoint-handoff.en.md)

---

## 1. 現在の境界

| 項目                   | 現在の実装・検証                                                                       | この変更から言えること                                                              |
| ---------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| public coordinator     | 既存exact 5 keys `{ receipt, run_binding, produce, close, abortAndDrain }`を変更しない | caller-facing contractやreceipt claimを拡張しない                                   |
| checkpoint handoff     | null-prototype / frozen exact 4 keys `{ produce, abortAndDrain, close, runBinding }`   | trusted connectorが必要なexact referencesを一度だけ取得できる                       |
| identity authority     | factory-issued facadeをmodule-private `WeakMap` keyとして登録                          | receipt、clone、wrapper、同shape objectをorigin authorityにしない                   |
| registry boundary      | production / injected testを別registryと別claim APIへ分離                              | test handoffをproduction originへ格上げしない                                       |
| lifecycle              | unclaimed entryを`close()` / `abortAndDrain()`開始時に失効                             | lifecycle開始後に新しいconnector ownershipを作らない                                |
| checkpoint / key / I/O | checkpoint entrypoint、root key、dataset path、`node:fs`を追加せず、関連I/Oを行わない  | capability handoffだけをcheckpoint executionから分離する                            |
| focused validation     | Node v22.13.0で**35 / 35 PASS**                                                        | synthetic / injected coordinator regression。production checkpoint evidenceではない |
| related / full / build | 関連**174 / 174**、full **115 files / 2,042 tests**、Python **58 / 58**、build PASS    | repository regressionであり、production handoff成功や棋力の証拠ではない             |
| live / strength        | production weight activation 0、対局0                                                  | 「強くなった」「高段で安定した」というclaimは0                                      |

## 2. なぜ5-key facadeをそのままcheckpointへ渡さないか

checkpoint producer controllerが必要とするoperationはexact 2 keysの`{ produce, abortAndDrain }`である。一方、coordinatorのpublic facadeはreceipt、run binding、正常終了用`close()`も持つexact 5-key contractである。余分なkeysを含むfacadeをcheckpointへ直接渡すとcheckpoint側のstrict controller captureに適合せず、逆にcheckpoint向けにcallerがplain objectを組み立てるとexact coordinator originが失われる。

この変更は中間のtrusted boundaryを作る。public facadeは一切変えず、factory成功時にexact facadeと内部operation referencesをmodule-private registryへ結ぶ。claimはreceipt digestやstructural equalityを見ず、同じobject identityだけをauthorityとして受ける。これにより「coordinator originの取得」と「checkpoint exact 2-key projection」を別PRへ分けられる。

handoffを取得してもcheckpointは動かない。`produce`を1回も呼ばずに`close`でき、checkpoint file、header、parent entry、sealを1 byteも作らない。

## 3. production / test別のsingle-use registry

production pathは`claimFloodgateV7ProductionParentCoordinatorForCheckpoint(...)`、injected test pathは`claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests(...)`を使う。どちらもexact 1引数であり、別々のmodule-private `WeakMap`を参照する。

claimの規則は次のとおりである。

1. `null`、non-object、Proxyをregistry lookup前にrejectする。Proxy trapは起動しない
2. exact facadeがmatching registryに存在することを要求する
3. lifecycleがまだ始まっていないことを確認する
4. capability projectionより前にregistry entryをdeleteする
5. expected execution boundaryを確認し、fresh frozen 4-key handoffを返す

clone、receipt copy、同じfunction referencesを並べたplain object、二重claimは失敗する。production facadeをtest registryへ、またはtest facadeをproduction registryへ渡しても失敗する。wrong-registry lookupはmatching registryのentryを消費しないため、その後の正しいclaimは可能である。

test APIが返すoperation shapeはproductionと同じでも、production factory executionやproduction runtime originを証明しない。これは既存coordinator receiptの`test_boundary`とnonclaimsを変更しない。

## 4. lifecycle開始時にunclaimed authorityを失効させる

coordinatorは`close()`または`abortAndDrain()`の最初のvalid transitionを開始するとき、lifecycle Promiseを公開してからactive producerへterminalを通知する。その同じtransitionで、まだclaimされていないcheckpoint handoff registry entryをdeleteする。したがって、shutdown開始後に古いfacadeから新しいconnector handoffを作れない。

claimが先に成功した場合、handoffはcoordinatorと同じ`close` / `abortAndDrain` referencesを持つ。connectorは正常終了なら`close`、failure / cancellationなら`abortAndDrain`へ進めるが、どちらも既存coordinator lifecycleへjoinする。handoff用の第2 lifecycleや別runtime ownerは作らない。

このsingle-use claimはhostile same-process holderから元facadeのoperation referencesを強制失効させるsandboxではない。元facadeを保持するtrusted callerは同じfunctionsを呼べる。保証するのは、module registryがexact facadeからcheckpoint connector capabilityを一度だけ発行し、lifecycle開始後には新規発行しないことまでである。

## 5. exact 4-key projectionとidentity preservation

handoffの4 fieldsはcopyしたmetadataやwrapperではなく、元facadeのexact valuesである。

| handoff field   | identity / 次段での用途                                                                |
| --------------- | -------------------------------------------------------------------------------------- |
| `produce`       | `handoff.produce === coordinator.produce`。次PRでcheckpoint 2-key controllerへ投影する |
| `abortAndDrain` | `=== coordinator.abortAndDrain`。first-terminal時のstarted work回収へ使う              |
| `close`         | `=== coordinator.close`。checkpoint開始前failureや正常終了でruntime pairを閉じる       |
| `runBinding`    | `=== coordinator.run_binding`。key authorityとcheckpointへ同じbindingを渡す            |

returned objectはnull prototype、frozen、enumerable non-writable exact own data keysだけを持つ。functionを`bind`せず、wrapper Promiseを足さず、receipt digestからoperationを復元しない。`runBinding`も再serialize / parseせずexact object identityを維持する。

ただし、この4-key handoff自体はcheckpointが受ける2-key controllerではない。`close`と`runBinding`はtrusted connectorだけが所有し、次PRがcheckpointへ渡すsurfaceをさらに狭める。

## 6. deployment key authorityとの関係

deployment key authorityはfixed private keyでstrictly captured metadataへHMACを発行するが、caller-supplied coordinator digest、stage receipt、active leaseのoriginを証明しない。このhandoffは逆にexact coordinator origin / operation referencesを渡すが、keyを読み、MACを発行し、stage leaseをclaimすることはない。

次のtrusted connectorは同一ownership内で次を組み合わせる必要がある。

1. このsingle-use exact coordinator handoff
2. handoffのexact `runBinding`
3. active private stage leaseとexact authorization receipt
4. fixed key ID / key instanceを持つdeployment authority
5. checkpointへ渡すexact 2-key `{ produce, abortAndDrain }`

今回の変更は上記を接続しない。production checkpoint invocation、key provision / rotation enforcement、input authentication、resume comparison、file durabilityは全て次段に残る。既存coordinator receiptの`checkpoint: false`、`key_authority: false`、`input_authentication: false`も変えない。

## 7. 発見、failure matrix、途中データ

| 発見 / 検証対象                                  | 現時点の意味                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| exact 5-key public facadeを維持                  | checkpoint専用authorityをpublic API拡張と混ぜない                           |
| handoffはexact 4 keys                            | connector cleanupとbindingを保持しつつ、checkpointへの2-key投影を次段へ残す |
| production / test registryを分離                 | injected successをproduction originにしない                                 |
| wrong-registry claimは正しいentryを消費しない    | boundary mistakeの後もmatching authorityだけがclaimできる                   |
| entryはprojection前にsingle-use consume          | 同じfacadeから2つのconnector authorityを発行しない                          |
| lifecycle-firstはunclaimed entryを削除           | shutdown開始後のlate handoffを拒否する                                      |
| handoff取得だけではproposal / rescore call 0     | capability testをteacher execution evidenceにしない                         |
| sourceはcheckpoint / key / dataset I/Oを持たない | ownership projectionとdurable executionを分離する                           |
| Node v22.13.0 focused 35 / 35                    | invalid-arity lifecycle、両方のvalid lifecycle、production API arityも含む  |
| related 5 files 174 / 174                        | owner、candidate union、completed parent、checkpointを含む回帰              |
| full Vitest 115 files / 2,042 tests              | `maxWorkers = 2`でPASS。既存WASM初期化timeoutを避ける再現性優先設定         |
| Python ML 58 / 58、TypeScript / ESLint / build   | 全てPASS。Next production buildは13 workers                                 |

focused testはclone、Proxy trap 0、wrong registry、production / test claimのexact arity、double claim、exact own descriptors、function / binding identity、invalid-arity lifecycle後のclaim維持、valid `close` / `abortAndDrain`双方のlifecycle invalidation、zero-work closeを対象にする。production registryのhappy pathはproduction assetsを起動していないため未実行であり、次connectorのproduction smokeまでblocking evidenceとして残る。

## 8. テスト境界と明示的nonclaims

Node v22.13.0でfocused coordinator **35 / 35**、関連5 files **174 / 174**、full Vitest **115 / 115 files・2,042 / 2,042 tests**、Python ML **58 / 58**、TypeScript、scoped ESLint / Prettier / diff-check、13-worker Next production buildがPASSした。これはinjected stable / teacher runtime fixtureとrepository regressionのcode evidenceであり、production coordinator factoryからproduction registryを成功claimするpath、production key、real filesystem checkpoint、実Floodgate inputは実行していない。build中の既存Firebase build-phase / dynamic-route warningsは残ったが、exit 0であり今回の変更起因のfailureではない。

この変更における実行・生成量は次のとおりである。

- production checkpoint execution / durable prefix / seal: **0**
- production deployment key provision / key-authority execution: **0**
- production dataset read: **0 games / 0 parents / 0 bytes**
- real stable / teacher search: **0 parents**
- teacher label / teacher JSONL: **0**
- training / optimizer step / checkpoint: **0**
- candidate weight / production weight overwrite: **0 / 0 bytes**
- live評価関数 / weight activation: **0**
- matches / Elo / rating / rank / playing-strength evidence: **0**
- formal A/B: **0 / 192 color-swapped pairs、0 / 384 games**
- 81Dojo rated games: **0**

したがって、このPRが閉じるのは「factory-issued exact coordinatorからtrusted checkpoint connector用capabilityを一度だけ投影できる」というcode boundaryだけである。評価関数が強くなった、退行しなかった、高段で安定した、というclaimは全て0である。

## 9. 次はexact 2-key connector、v3 milestone、24,000-only seal

次PRはhandoffの責務を増やさず、別のtrusted connectorを実装する。

1. exact 4-key handoffからcheckpoint用exact 2-key `{ produce, abortAndDrain }`だけを投影する
2. 同じexact `runBinding`をdeployment authorityとcheckpoint invocationへ渡す
3. active stage、run ID、fixed key ID / key instance、resume contextをexact比較する
4. v3 milestone contractのschema / MAC bindingをfreezeする
5. timeout、late settlement、cleanup failure、key / binding mismatch、resumeをsynthetic fault matrixで閉じる
6. 同じauthenticated 24,000-parent training inputを使い、100-parent milestoneをunsealed durable prefixとして記録する
7. 同じrun / inputで500-parent milestoneをunsealed durable prefixとして記録する
8. 24,000 parents全件が揃ったときだけfull authenticated sealを発行する

100 / 500用に別dataset sliceや別identityを作らず、holdoutも開かない。100 / 500 / 24,000はthroughput、failure、resume、durabilityを測るteacher-data milestoneであり、棋力結果ではない。その後にもseed 42 / 43 / 44 QAT、fresh selection、fresh / legacy final、known regression、production parity、formal 192-pair / 384-game A/Bが残る。全内部gateを通過した候補だけが、別の明示承認後に81Dojo較正へ進める。
