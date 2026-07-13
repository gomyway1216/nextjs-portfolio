# production runtime receipt digestをexact factory facadeへ結び付ける

> [production stable WASM runtime](./blog-shogi-floodgate-production-stable-wasm-runtime.md)と[production teacher USI runtime](./blog-shogi-floodgate-production-teacher-usi-runtime.md)は固定asset・option・lifecycleを持つfacadeを発行できる。しかし、receiptをcanonical JSONへ直してSHA-256を計算するだけなら、同じshapeをcopyしたcallerにもできる。この変更はstable / teacherの各module内にproduction / test別の`WeakMap` registryを置き、factoryが発行したexact facadeだけから既存domainのdigestを取得できるようにした。これはorigin authorityのcode evidenceであり、production coordinator、adapter、checkpoint、key、real label、training、weight、live、棋力の証拠ではない。English version: [blog-shogi-floodgate-production-runtime-digest-authority.en.md](./blog-shogi-floodgate-production-runtime-digest-authority.en.md)

---

## 現在の境界

| 項目                           | 状態                   | ここで証明すること                                                  |
| ------------------------------ | ---------------------- | ------------------------------------------------------------------- |
| plain receipt digest           | identityのみ           | 同じbytesのSHA-256であり、factory originの証明にはならない          |
| stable exact-facade authority  | code・focused test完了 | matching factory / registryが発行したfacadeだけから既存digestを返す |
| teacher exact-facade authority | code・focused test完了 | matching factory / registryが発行したfacadeだけから既存digestを返す |
| schema / digest domain         | 変更なし               | downstream resultとcandidate unionの既存identityを維持する          |
| production positive evidence   | factory pathのみ       | unit testはtest registryのpositiveとproduction cross-rejectを使う   |
| coordinator / key / strength   | 未実装・証拠なし       | durable origin binding、label、training、weight、live、棋力は次段階 |

## 1. plain receipt hashはorigin authorityではない

receipt digestは、receiptのcanonical bytesへdomain separatorを前置してSHA-256を計算したidentityである。bytesが同じなら、factoryから受け取ったreceiptでも、後でcopyしたplain objectでも同じdigestになる。したがって、digestの値だけから「このprocessが固定production factoryのruntimeを所有していた」とは言えない。

必要なのはreceipt shapeの再検査ではなく、factoryが返したcapability objectそのものとのidentity bindingである。stableはfacade生成時にdigestを一度計算してresult closureとprivate pending authorityへ共有し、factory全体が成功した後だけpromoteする。teacherはengine / snapshot初期化後のpublic-facade successful-return boundaryでdigestを計算して直接登録する。どちらのgetterも、そのprocess・module instance内でmatching factoryが正常に返したfacadeをcallerが保持している場合だけ成功する。

ただし、getterから取り出した64-hex stringだけを別contextへcopyすれば、そのstring単独は再びorigin proofではない。owning production adapterがruntimeを作り、同じownershipの中でgetterを呼び、その値をcheckpoint run bindingへ直ちに渡す必要がある。

## 2. productionとtestを別registryにする

stable moduleとteacher moduleは、それぞれ次の2 registryを外部へexportせず保持する。

```text
production factory -> exact frozen facade -> production WeakMap -> digest
test core factory  -> exact frozen facade -> test-only WeakMap  -> digest
```

production getterはproduction registryだけ、test getterはtest registryだけを参照する。test fixtureがproductionと同じreceipt shapeやdigestを作れてもproduction registryには入らない。逆に、plain receipt、facade clone、methodをcopyしたobjectもWeakMapの同じkeyではない。

登録はfacadeを構築しただけでは行わず、factory全体の成功が確定した後に行う。stable runtimeではasset providerがexact callback resultを返し、callback-finallyのasset-copy zeroizationも成功した後だけ登録する。失敗したfactoryからproviderが途中facadeを保持してもauthorityは付かない。teacher runtimeは全engine / snapshot初期化とpublic facade構築が成功したreturn boundaryで登録する。どちらもnull-prototype frozen facadeをkeyにし、receipt objectそのものはkeyにしない。

registry lookup / registrationはnative `WeakMap.prototype.get` / `set`だけでなく、それを呼ぶ`Reflect.apply`もmodule load時にcaptureする。reviewでlive `Reflect.apply`を差し替えると未登録objectへ偽64-hexを返せる穴が見つかったためである。修正後はlive `Reflect.apply`を差し替えても登録済みfacadeだけが元digestを返し、未登録objectはrejectする。

## 3. getter contractとfail-closed matrix

公開production getterとtest-only getterは、stable / teacherともfunction arity 1で、runtime facadeをexact 1引数だけ受ける。missing argumentやextra argumentもrejectする。

| input                        | production getter | test getter | property / Proxy trap |
| ---------------------------- | ----------------- | ----------- | --------------------- |
| matching production facade   | digest            | reject      | 0                     |
| matching test facade         | reject            | digest      | 0                     |
| structurally identical clone | reject            | reject      | 0                     |
| plain receipt / plain object | reject            | reject      | 0                     |
| Proxy around a valid facade  | reject            | reject      | 0                     |
| missing / extra argument     | reject            | reject      | 0                     |

Proxyは`node:util`のnative Proxy判定でWeakMap lookup前に拒否する。`get`や`ownKeys`を仕掛けたadversarial Proxyでもtrap callは0である。cloneやplain objectもpropertyをwalkして「似ているか」を調べず、登録済みobject identityがなければrejectする。さらにlive `Reflect.apply`を偽digest functionへ置換しても、capture済みcall pathを使うため結果は変わらない。

## 4. digest取得はproposalもsearchも開始しない

stable digestはfacade生成時にreceiptから一度計算し、result closureとprivate pending authorityへ同じ値を保持して、factory全体の成功後にpromoteする。teacher digestはengine / snapshot初期化が完了したpublic-facade successful-return boundaryで一度計算して直接登録する。getterはいずれも登録値を返すだけで、stableの`propose()`、teacherの`propose()` / `rescore()`、engine `go depth`、pool cleanupを呼ばない。

focused testはstable側のproposal callをdigest取得前後とも0、teacher側のsearch transcriptを取得前後とも0に固定する。これは重要で、identity取得が新しい探索、timeout、state transition、label候補を暗黙に作らない。

production positive pathは、zero-argument production factoryがproduction execution boundaryのfacadeを作った場合にだけproduction registryへ登録するcode pathである。focused unit testはreal pinned production assetや12-process poolを起動せず、test core factoryから得たfacadeをtest registryでpositive確認し、同じfacadeをproduction getterへ渡すcross-registry caseをrejectする。したがって、unit testはproduction factoryを実行した証拠ではない。

## 5. stable domainと後続resultを変えない

stable runtime digestは既存domainをそのまま使う。

```text
SHA-256(
  "shogi-floodgate-production-stable-runtime-receipt-v1\0" ||
  canonical_json(runtime_receipt)
)
```

facade生成時に計算した同じ値を、registryと後続`runtime_binding.runtime_receipt_sha256`の両方へ使う。testはgetterでproposal前に得たdigestが、その後1回だけproposalしたresult内のdigestとexact一致することを確認する。receipt schema、runtime result schema、domain separatorは変更していないため、既存result consumerにmigrationを要求しない。

## 6. teacher domainとcandidate union互換を維持する

teacher runtimeも既存domainを維持する。

```text
SHA-256(
  "shogi-floodgate-v7-runtime-receipt-v1\0" ||
  canonical_json(teacher_runtime_receipt)
)
```

これは[v7 candidate union](./blog-shogi-floodgate-v7-candidate-union.md)がproduction teacher receiptをcanonical projectionして使う既存domainと同じである。runtime contract、receipt field、candidate-union schema、checkpoint v2 run bindingの形式は変えない。authorityはdigestの算術を新しくするのではなく、同じdigestを誰が取得できるかをexact facade identityで狭める。

focused unitではtest factory facadeのdigestが同じdomainとcanonical receiptから独立計算した値に一致することを確認する。production receiptのcandidate-union positiveはproduction factoryとowning adapterがまだないため、この変更のunit evidenceには含めない。

## 7. validation記録

現時点の同じworking-tree内容に対する記録であり、最終PR値は追加reviewやfull validation後に更新し得る。

| 対象                                   | 現時点の結果                                                                                              |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| focused stable + teacher runtime tests | 55 / 55 pass                                                                                              |
| TypeScript                             | `tsc --noEmit` pass                                                                                       |
| scoped lint                            | pass                                                                                                      |
| exact facade positive                  | matching test registryでpass                                                                              |
| adversarial rejection                  | clone / Proxy / plain / cross-registry / wrong arity / live `Reflect.apply`差し替えをreject、Proxy trap 0 |
| no-work getter                         | stable proposal 0 / teacher search 0                                                                      |

この55件はdigest authorityだけでなく各runtime fileの既存focused testsを含む。production runtimeのpositive authorityはfactory registration code pathにあり、unit testがreal production runtimeを起動した件数として数えない。

## 8. claim境界と次の作業

この変更が追加するのは、現在のmodule instance内でfactory-issued facadeとdigestを結ぶephemeral authorityである。durable fileへ書かれたdigestを認証するkey authorityでも、stable / teacher runtimeを同時所有するproduction coordinatorでもない。既存test-only checkpointへ自動接続せず、real teacher labelを生成しない。

次はstableとteacherのproduction factoryを同じlifecycleで所有するall-settled adapterを作る。片方の初期化や親処理が失敗しても両runtimeのstarted workとcleanupを回収し、matching production getterから2 digestを取得し、同じ呼び出しでcheckpoint run bindingへ渡す。そのadapterのlifecycle / cleanup境界を実装・検証した後、次の実装段階としてdeployment key authorityを接続する。

label生成、training row、optimizer、weight、A/B、Elo、rating、段位、live環境は変更していない。「評価関数が強くなった」「高段で安定した」というclaimは0である。
