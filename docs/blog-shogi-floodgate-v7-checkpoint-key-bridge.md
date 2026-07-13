# deployment key authorityからV3 checkpointへraw rootを出さずに一度だけ渡す

> 前段の[deployment key authority](./blog-shogi-floodgate-v7-deployment-key-authority.md)は、fixed deployment root keyでstrict captureしたrun / stage metadataを認証するが、checkpointへkey materialを渡さない。[V3 milestone checkpoint](./blog-shogi-floodgate-v7-checkpoint-v3-milestones.md)は100 / 500 / 24,000の順序、resume、durabilityを閉じるが、既存entry pointはtest-only raw-root dependencyである。この変更は、authority内部でV3用にHKDFした32-byte keyをopaque single-use facadeへ結び、exact claimからcheckpoint sinkへ短時間だけ渡すbridgeを追加する。raw deployment root、generic signer、実dataset、teacher label、学習、weight、live評価関数、対局、棋力の証拠ではない。English version: [blog-shogi-floodgate-v7-checkpoint-key-bridge.en.md](./blog-shogi-floodgate-v7-checkpoint-key-bridge.en.md)

---

## 1. 現在の境界

| 項目            | 実装方針                                                                                | この境界から言えること                                                    |
| --------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| deployment root | current EUID / `os.userInfo().homedir`配下のfixed 32-byte rootをheld descriptorから読む | key deployment metadataとexact requestを同じauthority operationで認証する |
| V3 key material | `runId`をsalt、fixed V3 HKDF infoをinfoとして32 bytesをauthority内部で導出する          | checkpointへraw rootを渡さず、V3専用keyだけを準備する                     |
| opaque facade   | frozen null-prototype exact metadata recordをmodule-private `WeakMap` keyとして使う     | facadeのclone、receipt copy、同shape objectからsecretを取得できない       |
| registry        | productionとinjected testを別`WeakMap`へ分離する                                        | test capabilityをproduction authorityへ格上げしない                       |
| lifecycle       | exact `prepare` / `claim` / `discard`で1つのderived keyを所有する                       | unclaimed keyを明示破棄でき、同じfacadeから2回claimできない               |
| checkpoint sink | claimed keyを同期copyし、claim resultを直ちにzeroizeする                                | caller-owned byte lifetimeを最初の`await`やproducer開始より前に閉じる     |
| executor        | authority pathではV3 derived keyを直接使い、再HKDFしない                                | authorityとcheckpointで二重導出やinfo不一致を起こさない                   |
| compatibility   | 既存raw-root `CoreForTests`を残す                                                       | 既存synthetic / fault-injection testの入力契約を壊さない                  |
| validation      | local validation完了、PR / CI pending                                                   | Node 22、full Vitest、Python、TypeScript、buildの実測を固定した           |

このbridgeだけではactive stage lease、authenticated training rows、production coordinator originを証明しない。それぞれのproduction capabilityを同じtrusted connectorがclaimし、同じrun / stage / gate bindingへ閉じる必要がある。

## 2. なぜraw rootではなくV3 derived keyをopaqueに保持するか

raw deployment rootをcheckpoint moduleへ渡すと、V3以外のdomainへ再利用できるkey material surfaceが増える。generic signing callbackも同様に、caller's payloadをauthority keyで処理できる余地を作る。どちらもmetadata-only authorityの境界を必要以上に広げる。

prepare pathはheld rootから次のV3専用keyを一度だけ導出する。

```text
HKDF-SHA256(
  ikm  = fixed deployment root,
  salt = 32-byte runId,
  info = "shogi-floodgate-v7-teacher-checkpoint-key-v3\0",
  len  = 32
)
```

root、authority MAC用derived key、key-instance用key、oversize確認用byteは既存authority規則どおりfinal revalidation前にzeroizeする。V3 derived keyだけをmodule-private registryへ移し、public facadeにはbytes、hash、signer、filesystem pathを載せない。したがって、facadeをserializeしてもsecretは出ず、正しいmodule内claimまでkey bytesはauthority内部に留まる。

## 3. exact requestとopaque facade

V3 prepare / claim requestはexact 5 keysである。

| request field               | binding                                                                           |
| --------------------------- | --------------------------------------------------------------------------------- |
| `gate`                      | `durable-prefix-100`、`durable-prefix-500`、`sealed-final-24000`のいずれか1つ     |
| `keyId`                     | fixed `floodgate-v7-teacher-checkpoint-root-v1`                                   |
| `runBinding`                | pinned plan、producer control、stable / teacher runtime receipt digests           |
| `runId`                     | lowercase hex 32 bytes                                                            |
| `stageAuthorizationReceipt` | exact stage boundary、allowed entries、parent / stage / lease identity、basenames |

requestはProxy / accessorを評価せず、ordinary exact own data propertiesからfresh frozen valueへcopyする。prepare時のcanonical requestをhidden registry stateへ保存し、claim時に同じcaptureを行ってcanonical equalityを比較する。

public facadeは次のexact 5 fieldsだけを持つ。

| facade field     | 意味                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------- |
| `contract`       | V3 deployment checkpoint key authorization contract                                         |
| `status`         | opaque single-use V3 derived keyがpreparedであり、checkpoint未実行であること                |
| `claim_boundary` | run / stage / gate-bound key capabilityであり、root exportやcheckpoint evidenceではないこと |
| `gate`           | このcapabilityが許可するexact 1 gate                                                        |
| `authorization`  | 既存deployment teacher-run authorization receipt                                            |

facade metadataはkey bytesを含まず、同じfield valuesを持つcloneにもauthorityはない。module-private registryに登録されたexact object identityだけがclaim / discard対象になる。

## 4. prepare lifecycle

prepareは次の順序を固定する。

1. productionはexact 1引数、test coreはexact 2引数であることをrequest captureより先に確認する
2. gateを含むexact requestと、test coreだけが持つdependenciesをstrict captureする
3. productionではcurrent EUIDと`os.userInfo().uid` / homeを一致させる
4. canonical path、ownership、mode、link count、sizeを検査し、parent / key descriptorsをholdする
5. rootをexact 32 bytes読み、authorization MAC、key instance ID、V3 derived keyを同じheld rootから作る
6. V3 derived key以外の全owned key copiesを次の`await`前にzeroizeする
7. held / pathname metadataをfinal revalidateし、descriptorsをcloseする
8. revalidationとcleanupが全て成功した後だけ、exact facadeとV3 derived keyをmatching registryへ登録する

途中で失敗した場合はfacadeを返さず、準備済みV3 derived keyもzeroizeする。prepare successは「このexact binding用key capabilityが準備された」ことまでであり、checkpoint file、parent entry、milestone、sealが作られたことを意味しない。

## 5. claim / discardとsingle-use規則

claimはproduction / testで別APIと別registryを使う。重要な順序は次のとおりである。

1. exact arityをfacade / request captureより先に確認する。arity errorはprepared capabilityを消費しない
2. non-object / Proxy / clone / unknown facadeをrejectする
3. matching registryのexact facadeを見つけた後、request captureより先にprepared entryをdeleteする
4. claim requestをstrict captureし、prepare時のcanonical bindingと比較する
5. 一致した場合だけfresh owned 32-byte `Uint8Array`へcopyする
6. success / binding failure / copy failureの全てでregistry側stored derived keyをzeroizeする

このため、exact facadeに対するwrong bindingはcapabilityを**消費する**。gate、run、key ID、runtime digest、stage identityの誤りを直して同じsecret-bearing facadeへretryできない。一方、production facadeをtest claimへ渡すなどのwrong-registry lookupはkeyを公開せずrejectし、matching boundaryをproductionへ昇格させない。

`discard`はexact known facadeだけを受け付ける。まだunclaimedならstored keyをzeroizeし、既にclaim / discard済みの同じexact facadeならharmless no-opである。fake / cloneは既知identityではないためrejectする。connectorはtraining verification、stage、coordinator、cancellationなどがcheckpoint sink到達前に失敗した全pathでdiscardを呼ぶ必要がある。

## 6. checkpoint sinkとexecutorのkey lifetime

checkpoint sinkはauthority claimとcheckpoint captureの間を閉じるnarrow boundaryである。

1. matching production / test claim APIからowned V3 derived `Uint8Array`を同期取得する
2. stage lease、authenticated full 24,000-row input、run binding、2-key producer controller、gate optionsを同じ同期captureへ渡す
3. sink内部のowned `Buffer`へderived keyを同期copyする
4. captureのsuccess / failureにかかわらず、claim resultを`finally`で直ちにzeroizeする
5. capture成功後だけcheckpoint Promiseを返し、I/O / producerを開始する
6. executor cleanupでsink内部copyもzeroizeする

authority pathのcaptured key kindは`v3-derived`である。executorはこのbytesをHMAC chain / milestone / sealへ直接使い、もう一度HKDFしない。再HKDFするとauthorityが許可したkeyとcheckpointが使うkeyが別domainになり、resume MACを互換に検証できなくなるためである。

claim resultのzeroizeは最初の`await`より前でなければならない。checkpointが長時間走る間に残るのはcheckpoint invocationが所有する1 copyだけであり、public facade、connector、authority registryにはkey bytesを残さない。

## 7. 既存raw-root `CoreForTests`との互換性

既存`checkpointFloodgateV7TeacherParentsV3CoreForTests(...)`は、test lease、test authenticated rows、raw `dependencies.rootKey`を受けるcontractを維持する。このpathはraw rootを同期copyし、executor内で同じV3 HKDF infoとrun IDを使ってderived keyを作る。

| path                     | input key                                                  | HKDF location                     | registry origin                        |
| ------------------------ | ---------------------------------------------------------- | --------------------------------- | -------------------------------------- |
| existing raw-root core   | test caller supplied exact 32-byte root                    | checkpoint executor内で1回        | test stage / rows registry             |
| opaque test bridge       | authority test prepareが保持するV3 derived key             | authority内で1回、executorでは0回 | test key / stage / rows registry       |
| opaque production bridge | fixed deployment rootからauthorityが保持するV3 derived key | authority内で1回、executorでは0回 | production key / stage / rows registry |

この分岐により、既存failpoint、short read / write、torn tail、resume、corruption testをraw-root coreのまま残しつつ、production pathだけをopaque key authorityへ閉じられる。test coreの成功をproduction originやproduction key evidenceへ読み替えてはならない。

## 8. failure matrixと検証対象

| case                                            | expected result                     | key / capability outcome                                       |
| ----------------------------------------------- | ----------------------------------- | -------------------------------------------------------------- |
| prepare arity mismatch                          | request capture / key I/O前にreject | capabilityなし                                                 |
| invalid request / Proxy / accessor              | trapを起動せずpre-I/O reject        | capabilityなし                                                 |
| key path / mode / owner / size / identity drift | fail closed                         | root / derived copiesをzeroize、facadeなし                     |
| exact facade clone / fake                       | claim / discard reject              | valid registry entryを構造比較で取得しない                     |
| wrong production / test registry                | boundary reject                     | keyを公開せず、testをproductionへ昇格しない                    |
| claim arity mismatch                            | pre-capture reject                  | prepared entryを保持                                           |
| exact facade + wrong binding                    | reject                              | entryをconsumeしstored keyをzeroize                            |
| exact facade + valid binding                    | owned 32-byte derived keyを1回返す  | stored keyを返却前にzeroize                                    |
| second claim                                    | reject                              | key再発行なし                                                  |
| discard before claim                            | success                             | stored keyをzeroize                                            |
| repeated exact discard                          | harmless no-op                      | keyなし                                                        |
| sink capture failure                            | checkpoint未開始                    | claimed copy / partial internal copyをzeroizeしleaseをclose    |
| executor failure / cleanup failure              | no success receipt                  | invocation-owned keyをzeroizeしprimary / cleanup failureを保持 |
| raw-root test core                              | existing behavior                   | checkpoint内でV3 HKDFし、root / derivedをzeroize               |

focused testsはexact keys / descriptors、Proxy trap 0、arity-before-capture、production / test registry separation、clone、double claim、wrong-binding consumption、idempotent exact discard、stored / claimed / captured key zeroization、derived pathのno-re-HKDF、既存raw-root receipt互換を対象にした。実測結果を次節へ固定する。

## 9. ローカルvalidation結果と残るCI

bridge source commitは`2dbcdae55b22907daedb95f65db8bfe517ffac6d`、bridge test commitは`758f235095e3cecc2a4c35992c6b7d5984e8a530`である。高負荷test isolation修正を含む最終local validation revisionは`df740ac0f790e0f8c095d15ac7831f288430ecff`、Nodeは`v22.13.0`である。

| validation layer                       | status         | 実測値                                                              |
| -------------------------------------- | -------------- | ------------------------------------------------------------------- |
| deployment key authority focused tests | `PASS`         | 1 file / 16 tests、`0.273 s`                                        |
| V3 checkpoint focused tests            | `PASS`         | boundary 1 / 1、exact-24k 1 / 1（`145.97 s`、独立再実行`143.70 s`） |
| key bridge cross-boundary tests        | `PASS`         | 新規6 / 6。prepare / claim / discard / sink / no-re-HKDFを包含      |
| related Vitest files                   | `PASS`         | authority + checkpoint、2 files / 64 tests（full run内）            |
| full Vitest                            | `PASS`         | 115 / 115 files、2,056 / 2,056 tests、12 workers、`153.60 s`        |
| Python ML regression                   | `PASS`         | `npm run test:ml:stdlib`、58 / 58、unittest本体`0.123 s`            |
| TypeScript                             | `PASS`         | `npx tsc --noEmit`                                                  |
| scoped ESLint / Prettier / diff-check  | `PASS`         | 変更source / tests / 日英記事、exit 0                               |
| Next production build                  | `PASS`         | `npm run build`、13 workers、`25.97 s`                              |
| independent security audit             | `PASS`         | 最終unresolved P0 / P1 / P2 = `0 / 0 / 0`                           |
| PR / CI                                | `pending`      | ready PR作成後にURL、required checks、merge commitを追記する        |
| production fixed-key smoke             | `not executed` | real production実行はこのPRの範囲外。secret値も取得・記録していない |

full-power runは途中値も捨てなかった。最初の2回は2,055 / 2,056 testsまで通った後、既存coordinator testがoperation完了後も`setImmediate`までglobal `Promise.prototype`をpoisonし、並列runner通信を巻き込んだ（`166.08 s`、`154.77 s`）。同じ35-test fileは単独35 / 35だったため、operation settlement callbackで直ちにrestoreするようtestを隔離した。3回目は別のreal-child fixtureがCPU飽和下で20,000ms startup上限を約0.3秒超え、2,055 / 2,056（`152.70 s`）だった。単独実測は`0.261 s`だったためproduction timeoutは変えず、test-only fixture上限だけ60,000msへ広げた。最終4回目が上表の2,056 / 2,056である。

buildは成功し、既存のedge-runtime static-generation注意、build-phase Firebase Admin拒否、`cookies`によるdynamic routeメッセージを再確認した。これらをbridge起因の新しいwarningやproduction data accessへ読み替えない。PR / CIだけは記事commit時点で未確定なので`pending`のまま残す。

## 10. 明示的nonclaimsとlive状態

今回のcode / documentation boundaryにおける実行・変更量は次のとおりである。

- production 100 / 500 / 24,000 checkpoint gate: **0 executions**
- real Floodgate dataset read: **0 games / 0 parents / 0 bytes**
- real stable / teacher search: **0 parents**
- teacher labels / teacher JSONL: **0**
- training / optimizer steps / model checkpoints: **0**
- holdout / final selection access: **0**
- candidate weight generation: **0 bytes**
- production weight overwrite: **0 bytes**
- live evaluation-function / weight activation: **unchanged**
- matches / Elo / rating / rank / playing-strength evidence: **0**
- formal A/B: **0 / 192 color-swapped pairs、0 / 384 games**

したがって、このbridgeは評価関数を変更せず、強くなった、退行しなかった、高段で安定した、というclaimを一切作らない。閉じるのは、fixed deployment rootをexportせず、exact run / stage / gate用のV3 derived keyを一度だけcheckpoint sinkへ移すcode boundaryまでである。

## 11. 次のproduction connector

次段のtrusted connectorは、既存の[single-use coordinator handoff](./blog-shogi-floodgate-v7-checkpoint-handoff.md)とこのkey bridgeを同じownershipへ閉じる。

1. exact coordinator facadeを一度だけhandoffし、`runBinding`と`{ produce, abortAndDrain }`を取得する
2. active private stage leaseをproduction boundaryでauthorizeする
3. exact gate / run / stage / bindingでopaque V3 key facadeをprepareする
4. authenticated full 24,000-row training consumerの同期callback内でcheckpoint sinkを呼ぶ
5. sinkへ到達しなかったfailure pathではprepared facadeをdiscardする
6. checkpoint、training postflight、coordinator cleanupが全て成功した後だけcombined success receiptを返す
7. manual approvalを挟み、同じrun / stage / input / key instanceで100、500、24,000を別invocationとして進める

100 / 500 gateにも24,000 rows全体を渡し、別sliceやholdoutを作らない。これらはteacher-data durability gateであって棋力gateではない。label、学習、weight選択、production activation、正式A/Bは、別の明示的な検証・承認段階に残る。
