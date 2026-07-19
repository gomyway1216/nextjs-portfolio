# Floodgate v7 portable copy owner: source A / copy B / destination Cを同じlifecycleへ束縛する

> 2026-07-19時点の結論: PR #517は、元sourceのfilesystem closureをpresealし、fresh inodeへcopy-by-valueし、copy先をcallback前後に再検証するdormant基盤を追加した。ただし、その低水準capabilityを呼び出し側が個別に組み合わせるだけでは、別sessionの正しいA / B / Cを取り違える余地をowner境界として閉じていない。この変更はexact 4-kind source→destination mappingをprivate snapshotへ固定し、このowner経路ではPR #517のpreseal / seal / witness / compositeを外へ出さない。意味検証済みbyteの真正性、callback中のnamespace排他性、teacher、学習、ライブ重み、棋力はまだ証明しない。English version: [blog-shogi-floodgate-v7-portable-copy-owner.en.md](./blog-shogi-floodgate-v7-portable-copy-owner.en.md)

## なぜPR #517の次にownerが要るのか

PR #517は、historical receiptが元inodeを固定する一方、clean-room copyがfresh inodeを要求するという安全契約の衝突に対して、次のfilesystem-only transitionを用意した。

```text
source preseal
  → 外部の意味検証を置くgap
  → one-shot source filesystem seal
  → copy-by-value + one-shot witness
  → 4-kind composite destination seal
  → callback前後のdestination revalidation
  → revoke
```

各段階が単独で正しくても、それだけでは一つのoperationのownershipを証明しない。たとえば、正しいsource closure A、別sessionで作った正しいcopy witness B、さらに別のdestination closure Cをcallerが混ぜれば、各部品の局所検査だけを通過する設計になり得る。structural fakeだけを拒否しても、**別operation由来の本物**の取り違えは別の脅威である。

今回のownerは、callerに低水準capabilityを組み立てさせない。ownerが一つのprivate lifecycleとしてA → B → Cを進め、外へ返すのはownerに束縛されたopaque bridge / lifecycle capabilityだけに限定する。

既存のPR #517 low-level export自体は変更せず、repository全体から到達不能になったとは主張しない。
保証するのは、この新しいowner経路がunderlying capabilityを引数、戻り値、callback、public receiptへ
漏らさないことだけである。

owner-presealが返すopaque owner / verification pauseは、4つのunderlying A presealを
module-private `WeakMap`に保持したstaged stateを指す。callerはこのpause中にowner外のgeneric source verifierを
実行し、その後、最初と同じfixed-order mappingをone-shot bindへ渡す。exact matchしたbindだけが
内部でseal → copy → compositeを進め、ownerに対応するopaque bound bridgeを返す。このpauseは
verifier成功の自己申告をauthorityへ変換するものではない。bindはexternal verifier receiptを
受け取らず、その成功を証明もしない。今回のreal verifier実行回数も0である。

## A / B / Cがそれぞれ意味するもの

この文書では境界を次のように呼ぶ。

| 記号 | 境界                      | 保証する範囲                                                                                               | 単独では保証しないこと                                                                              |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| A    | source filesystem closure | canonical source pathとexact inventoryがpreseal後に変わっていない                                          | dataset semantics、generic verifierの成功                                                           |
| B    | by-value copy transition  | source inventoryにbindしたcopyをfresh destination inodeへ作り、hidden final inventoryからwitnessを発行する | callerが選んだ別A / Cとの同一operation性                                                            |
| C    | destination closure       | 4 destinationとshared parentをcallback前後にexact revalidationする                                         | callback中のabsolute-path namespace exclusivity、operationが実際に読んだbyteのsemantic authenticity |

したがって、このownerが閉じるのは**A / B / Cのsession取り違え**であり、Cの非主張を意味検証済みに格上げすることではない。source Aも「意味検証済みsource」という略称ではなく、PR #517が捕捉するsource filesystem closureを指す。

## 公開APIはstaged ownerの4操作だけ

production wrapperのcapability操作は次の4つである。

| API                                            | public input                                           | public result / effect                                                   |
| ---------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| `presealFloodgateV7PortableCopyOwner`          | fixed-order 4 bindings + owner-local safe dependencies | `{ owner, verificationPause }`。両tokenはempty / frozen / null-prototype |
| `bindFloodgateV7PortableCopyOwnerBridge`       | exact owner + pause + same fixed-order exact bindings  | internal seal / copy / composite後のempty opaque bound bridge            |
| `withFloodgateV7PortableCopyOwnerRevalidation` | exact owner + bound bridge + zero-argument callback    | serialized pre / callback / post revalidationのcallback result           |
| `revokeFloodgateV7PortableCopyOwner`           | exact owner                                            | private lifecycleとunderlying composite authorityを失効                  |

`CoreForTests`版は同じmechanicsを別registryで検査する。production wrapperにdependency injectionを
追加せず、test wrapperのcapabilityをproductionで使うこともできない。owner errorが公開するのは
fixed name / message / contract、`preseal` / `bind` / `borrow` / `revoke`のoperation、そして
`sensitive_values_disclosed = false`であり、nested error textやconfigured pathを転送しない。

owner errorは自動retryを防ぐため、operationごとに保守的な復旧分類も公開する。

| operation | `destination_write_may_have_started` | `consumer_callback_may_have_started` | `retry_disposition`                                      |
| --------- | ------------------------------------ | ------------------------------------ | -------------------------------------------------------- |
| `preseal` | `false`                              | `false`                              | `fresh-preseal-allowed`                                  |
| `bind`    | `true`                               | `false`                              | `manual-clean-room-reconciliation-required`              |
| `borrow`  | `true`                               | `true`                               | `manual-consumer-and-clean-room-reconciliation-required` |
| `revoke`  | `true`                               | `true`                               | `manual-owner-reconciliation-required`                   |

これは個別failureでwrite / public borrow consumer callbackが実際に始まったかを精密に証明する
receiptではなく、起こり得る範囲を過小評価しないoperation-level classifierである。failureの
exact lifecycle phaseを漏らすoracleにせず、`preseal`以外を無条件に自動再実行させない。

production bindingが受理するdependency own-data keyは`effectiveUserId`、任意の`maxEntries`、
任意の`maxTotalBytes`だけである。Proxy / accessorは拒否し、`maxConcurrencyForTests`と4つの
`*ForTests` callback keyはTypeScript typeだけでなくruntimeでも拒否する。full
`FloodgateV7CleanRoomCopyDependencies`を使えるのは別型
`FloodgateV7PortableCopyOwnerBindingForTests`を受ける`CoreForTests` presealだけである。

## exact 4-kind mapping

ownerが受理するkindは次の4つだけである。

- `raw-lock-tree`
- `role-lock-tree`
- `role-bundle-tree`
- `legacy-file`

最初の3 kindはtree、`legacy-file`だけはstandalone fileである。ownerは各kindのcanonical sourceとcanonical destinationを一つのprivate snapshotへ固定する。bind時には、欠落、重複、未知kind、順序を利用した差し替え、source / destinationの取り違えを許さず、4件すべてをexact mappingとして照合する。

callerがB bindへ渡すmappingはfixed orderの4件であり、Proxyを受理せず、getterを実行しない
data-descriptor snapshotとして取得する。そのsnapshotをowner-privateなkind / source / destinationと
strict比較し、一致したときだけcompositeを一回消費する。

さらに、underlying presealを一件も始める前にall-pairs namespace preflightを行う。4 source相互、
4 destination相互、全destination×全sourceのどこか一つでもsame pathまたはancestor /
descendant関係なら拒否する。これにより、あるkindのcopy destinationが別kindのsourceへ入り込み、
copy中にsourceを変えるcross-kind overlapを開始前に閉じる。

source / destination pathはcallerからpreseal / bindのbinding inputとして受け取るが、opaque
owner / pause / bound bridgeや成功result、sanitized errorへは載せない。mappingとfoundation
capabilityの実体はownerのprivate stateに残し、callerがplain objectをclone、spread、再構成して
authorityを得る設計にしない。

## opaque、replay、revokeの境界

owner経路ではPR #517の次のcapabilityをraw valueとしてcallerへ返さない。

- source preseal
- source filesystem seal
- copy witness
- composite destination seal

公開するbridge / lifecycle valueは、形が似たobjectでは復元できないopaque capabilityであり、ownerのprivate registryとのexact identityが必要になる。同じcapabilityの二重bind、消費済みvalueのreplay、別owner instance / production-test registry間のcross-useはfail closedにする。

production wrapperと`CoreForTests` wrapperは別registryを使う。underlyingのnominal capability
typeであるsource preseal / source filesystem seal / copy witness / composite destination sealは
owner APIのpublic parameter / resultへ現れない。preseal resultはopaque owner / verification pauseだけ、
bind resultはopaque bound bridgeだけであり、borrow / revokeもraw compositeのmethodではなく
top-level owner APIを通る。revokeが受理するのはexact ownerである。

revokeは「今後使わない」というcallerの自己申告ではなく、ownerがprivate lifecycleを無効化する境界である。失敗後または明示的revoke後に、古いbridgeからfoundation compositeを再取得できるとは主張しない。成功回数の上限やexact 3-gate sessionは、今回のownerだけではまだteacher authorizationとして完成していない。

bindのseal / copyを開始した後にrevokeまたはfailureが起きた場合、owner authorityは即失効し、
bound bridgeの発行は0になる。ただし、すでに開始したfilesystem Promiseのcancelやpartial
destinationのrollbackは主張しない。既存copy contractどおりpartial destinationを保持し得るため、
fresh run前にcallerが4つのconfigured destinationを保守的にreconcile / removeし、
fresh-absent条件からやり直す必要がある。

## post-module intrinsic検査の範囲

plain Node childでmodule初期化後に組み込み機能を差し替え、`array-string`、
`weak-collections`、`reflect`、`promise-resolve-preseal`というexact 4 modeを検査する。`array-string`は
`Array.isArray`、`Array.prototype.map` / `some` / `includes`、`String.prototype.includes` /
`startsWith`、`weak-collections`は`WeakMap.prototype.get` / `set` / `delete`と
`WeakSet.prototype.has` / `add`、`reflect`は`Reflect.apply` / `Reflect.ownKeys`を差し替える。
`promise-resolve-preseal`はpost-init `Promise.resolve`だけを差し替え、preseal後にrevokeして止める。
bind / copy / borrowはこのmodeの検査範囲ではない。

旧captured `Promise.allSettled` + native `Promise` patternを使う対照実験は、genuine native
Promise生成後の`Promise.resolve`差し替えを参照して
`OLD_PATTERN_REJECTED=substituted Promise.resolve consulted`になった。新しい`settleFour`は、
開始済み4 operationすべてへ`settleOne` rejection handlerを同期に付けてから一件目をawaitする。
後続3件が先にrejectする回帰でも`unhandledRejection`は0だった。

これは`Promise.prototype.then`、arbitraryなglobal `Promise` / `Object` poisoningへの耐性を
証明しない。また、PR #517のunderlying low-level module全体について、任意のpoisoning下で
full lifecycleが安全だとは主張しない。

## Cの残る非主張

PR #517のsynthetic fixtureでは、callback中にdestination共通ancestorを一時renameし、同じabsolute pathへ異なるbyteを置いて読み、callback終了前に元へ戻すとpost-revalidationがPASSすることを確認している。これは既知の非主張であり、ownerで隠さない。

今回のCはowner-boundになっても、検査範囲はcallback**前後**である。後続compositionは、destinationをheld directory / file descriptorから読み、operationが使うexact bytesをsource verifierのSHA-256とrecord identityへbindしなければならない。それが実装されるまでは、次を0のまま保持する。

- real source semantic verification
- semantic input authenticity
- teacher authorization
- teacher generation / label
- training / selection / holdout
- A/B / external calibration
- live-weight activation

## ローカルだけの候補

この変更の検証対象はowner contractとsynthetic temporary fixturesであり、実private datasetを使うoperationではない。import / mergeだけでcopy、generic semantic verifier、teacher、optimizer、対局は開始しない。

| infrastructure                         | 今回のowner検証での使用             |
| -------------------------------------- | ----------------------------------- |
| ローカルMac CPU / temporary filesystem | unit test、hash、Git identityの検証 |
| AWS                                    | 0、不要                             |
| Firebase Cloud Functions / GCP         | 0                                   |
| Vercel evaluator compute               | 0                                   |
| real private source / destination      | 0                                   |
| teacher / optimizer / live activation  | 0                                   |

GitHubへのpushとCI、VercelのPR Web previewが後で走る場合も、それらはsource-control / Web deploymentの検証であり、将棋のteacher・学習computeではない。共通CIにある`AWS witness adapter contract (source only)`もAWS serviceを起動しない。

## まだ強くなった証拠ではない

このownerはdormantなownership boundaryである。実棋譜からの再学習、候補weight、対局、Elo、段位測定を一度も実行していない。「評価関数が強くなった」「高段で安定した」というclaimは0であり、ライブ重みを変更する権限も発行しない。

machine-readable evidenceは[`floodgate-v7-portable-copy-owner-2026-07-19.json`](./data/floodgate-v7-portable-copy-owner-2026-07-19.json)にある。

owner導入revisionは`ab9ac4d8363682776fc0e8518ec3f8b539f3566b`、Promise settlement
hardeningと最終freeze revisionは`dff9ee445686693e852afafb9ac0f593027bca27`
（`Harden owner promise settlement`）である。最終revisionの3 fileは次のidentityを持つ。

- `ml/floodgate-v7-portable-copy-owner.ts`: 32,309 bytes、SHA-256 `040798583c6cb56e6fe461d51179a2ff5c289effc7d2ca1966be88f1ea931b3c`、Git blob `391c08cf3551086a2a2e398cfcc03096dab82e23`
- `tests/unit/ml/floodgateV7PortableCopyOwner.test.ts`: 30,117 bytes、SHA-256 `9560dd70a2ba6b285f7fae8d32a9d39300b8841cd64c9bddbb94704d82034a75`、Git blob `9a0ab95d552b20938bd7876bec4ecf067de7b364`
- `tests/unit/ml/floodgateV7PortableCopyOwnerPoisoning.child.ts`: 6,921 bytes、SHA-256 `6610f685ad19fc6b527bd48c75090706fc194709868ead6f67b233ea3e539c6d`、Git blob `a008fee38008c12ebc7031fe2b7c3072e2783d62`

Node v22.13.0のowner focused validationはfunctional 25 + evidence 5 = 30 / 30 PASS。
functional 25件の5回反復も125 / 125 PASSした。関連回帰はclean-room copy 13 +
portable witness 19 + foundation evidence 4 + owner 25 + owner evidence 5 =
5 files / 66 / 66 PASS（`maxWorkers=4`、Vitest 1.83秒、test aggregate 5.73秒）だった。
TypeScriptはrepository baseline 21に対しchanged-file error 0、
ESLint / Prettier / diff errorも0である。最終security reviewはP0 / P1 / P2 / P3 =
0 / 0 / 0 / 0、unresolved 0だった。

## 次の安全な工程

次は、変更していないgeneric source semantic verifierをsource presealとfilesystem sealの間で実行し、その認証済みSHA-256 / record identityをowner sessionへ入れる。その後、Cがheld directory / file descriptorから読むexact bytesと同じidentityを照合し、bounded exact 3-gate sessionを構成する。

その実装と独立review / CIが完了するまでは、残存clean-roomでreal teacher準備を再開しない。意味検証、held-read binding、session revokeのすべてが揃った後も、100 → review → 500 → review → 24,000という既存の安全gateを飛ばさない。
