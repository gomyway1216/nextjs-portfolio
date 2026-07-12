# depth-16 teacherの前に置くpathless stable-WASM proposer

> [private stage authorization](./blog-shogi-floodgate-teacher-stage-authorization.md)で将来のFloodgate teacherが作業してよい場所は定義できたが、事前登録したcandidate unionには、現在deploy中のrunOp1 NNUE/WASMが選ぶ手がまだ欠けている。このメモでは、最初の`await`より前にbyte inputをsnapshotし、asset pathを渡さずbounded child processでstable searchを実行でき、canonical proposal JSONLをmemory内で返すsynthetic-only dependency-injected `CoreForTests` primitiveを記録する。statusは`complete-in-memory-dependency-injected-test-core-not-engine-authenticated-not-durable-not-published`である。real training row、selection、fresh/legacyのどちらのfinal holdoutも読んでおらず、authenticated engine resultでもv7 teacher完成でも棋力証拠でもない。English version: [blog-shogi-floodgate-stable-wasm-proposer.en.md](./blog-shogi-floodgate-stable-wasm-proposer.en.md)

---

## 現在の境界

| 項目                                   | 現在の状態                           | 意味                                                                                             |
| -------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| stable-WASM proposal core              | working treeへ実装                   | 構造的なsynthetic inputからparentごとに1つのstable moveをmemory内で作れる                        |
| exact byte identity                    | 実装                                 | plan、tracked WASM、embedded WASM、weights、worker sourceが固定bytes/SHA-256に一致する必要がある |
| child-process search                   | 実装                                 | childはfilesystem pathでなくsnapshot済みsource/assetをbounded IPCで受け取る                      |
| deterministic proposal JSONL           | 実装、real poolは1/2/3 workersで確認 | parent順とoutput bytesは確認済みworker幅や完了順に依存しない                                     |
| production consumer provenance         | 未実装                               | `CoreForTests`はproduction consumerが発行したexact objectをclaimできない                         |
| checkpoint authentication / durability | 未実装                               | file、MAC、fsync、postflight receipt、publicationは作らない                                      |
| v7 union / depth-16 teacher            | 未実装                               | stable moveはteacher MultiPV/実戦手へjoinもindependent rescoreもされていない                     |
| real data / holdout                    | 未読                                 | real training、selection、fresh final、legacy finalはこのprimitiveへ入っていない                 |
| 棋力claim                              | なし                                 | deterministicなcandidate moveはaccuracy、Elo、段位、改善の証拠ではない                           |

status内の「complete」は、構造的にforge可能なtest coreの1回のmemory内呼び出しが成功したことだけを指す。production provenance、teacher全体、training、evaluation、publicationの完了を意味しない。

## 1. stable moveを別phaseにする理由

事前登録済みFloodgate planは、parentごとに3種類のcandidate sourceを要求している。

1. YaneuraOu depth 16のMultiPV 12
2. 強い実戦で指された手
3. frozen runOp1 production-int16がdepth 11をrequestして選ぶ手

現行v6 teacherがunionしているのは最初の2つだけである。このままreal 24,000 parentを流すと、凍結済みcandidate-union planと一致しないdatasetになる。またstable searchは同期的でCPU負荷が高い。同じNode event loopへUSI engine poolと同居させると、engine pipeやwatchdog timerを飢餓させるおそれがある。そのためproposerは独立process poolでstable moveを先に計算し、後続teacher runnerがauthenticateしてjoinできるartifactを返す。

このPRサイズの境界は意図的にjoinの前で止める。「v7 complete」と表現してはいけない。本当のv7には、このproposal artifactを同じauthenticated parentへbindし、stable moveをunionへ加え、unique candidateをすべてdepth 16でindependent rescoreする処理が必要である。

## 2. exact byte identity

全asset引数は最初のasync operationより前に、新しい`Uint8Array`へ同期copyされる。child poolはcallerのmutable bufferを受け取らない。その後coreは次のidentityを検証する。

| Artifact                                                 |     Bytes | SHA-256                                                            |
| -------------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json` |    10,890 | `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af` |
| tracked `shogi.wasm`                                     |    35,597 | `e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c` |
| decode済みembedded WASM                                  |    35,597 | `e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c` |
| `public/shogi-nnue-weights.bin`                          | 1,185,988 | `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc` |
| `ml/floodgate-stable-wasm-worker.mjs`                    |    19,216 | `d21e347268fa0830882a7f8fb40893aeeed0425f8d92519b26a13444efc467e3` |

tracked WASMとdecode済みembedded WASM snapshotは、さらにbyte-for-byteで一致しなければならない。長さだけの一致では足りない。各childの内部でもWASM/weightsをcanonical base64からdecodeし、再hashして再確認する。exported WASM memoryへcopyしたweight領域もcopy後に再hashする。

元のplanが事前登録したstable条件は、weight path、bytes、SHA-256、`K = 600`、depth 11、bookなし、external mate solverなし、fallback禁止である。WASM hash、quiescence depth、start depth、TT policy、output scale、child protocol、watchdogは後から凍結するimplementation lockであり、元planへ明記済みだったと遡及して説明してはいけない。

input shapeは、role-bundle result receiptの固定identity（14,735 bytes、SHA-256 `56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf`）とbundle manifestの固定identity（7,202 bytes、SHA-256 `2bafc01f602c98ea63069e04b8d39c36470bcc6d31e1861fdaa83c6fc50e3cf9`）も保持する必要がある。ただし`CoreForTests`で行うのはstrictな構造検証であり、production consumerがそのobjectを発行した証明にはならない。

## 3. pathless child byte snapshot

child launcherがcommand lineへ置くのは小さな固定bootstrapだけである。capture済みworker-source bytesは専用のanonymous fd 3 pipeへ書いて直ちにcloseし、bootstrapがそのbytesをreadしてdata-URL moduleとしてevaluateする。32 KiBを超えるsynthetic sourceでもsource本文は`execArgv`へ現れず、temporary fileも作らない。fd 0はcanonical runtime protocol専用である。application environmentはPOSIXでは空、Windowsでは検証済みの`SystemRoot` / `SystemDrive`だけをOS bootstrap metadataとして渡す。working directoryは現在のNode executableが置かれたfilesystemのroot、`shell: false`、stdioはanonymous pipeだけである。worker path、WASM path、weights path、role-bundle path、output pathは渡さない。初期化ではexact WASM/weight snapshotをcanonical base64として、1行のcanonical-JSON messageで送る。

protocolのphase順は次で固定する。

```text
await-init -- init(bytes) --> ready(asset hash + Node version)
ready      -- search(position vector) --> result(index + move + raw stats)
ready      -- quit --> bye --> clean process exit
```

messageはexact key、printable ASCII + LF、canonical JSON、bounded line、childごとに1つだけのoutstanding request、startup/per-searchそれぞれのwatchdogを使う。search送信前にparentはcanonical request payloadをdomain `shogi-floodgate-stable-wasm-worker-request-v1\0`でhashする。childはその`request_sha256`を再計算して不一致を拒否し、resultへechoし、parentもassigned digestと違うresponseを拒否する。これはresponseを1つのcanonical request frameへbindするが、unkeyed digestであり、engine authenticationでもMACでもない。unexpected stdout、noncanonical byte、成功時のstderr、crash、timeout、誤ったasset receipt、malformed move、不正depth/counter、誤ったrequest echo、result coverage不足のどれか1つでもinvocation全体を失敗させる。1 workerが失敗するとpoolはpeerをforce-stopし、proposal artifactを返さない。

このpathless設計が狭めるのは偶発的なauthorityである。childがsearchできるのは渡されたbytesとposition vectorだけになるが、same user、root、Node runtime自体に対するOS sandboxではない。

## 4. strict stable-search tuple

実workerはparent positionをloadする前に毎回同じconfigurationを再適用し、private TTをclearする。

| Field                       | 固定値                      |
| --------------------------- | --------------------------- |
| WASMへ渡すtime limit        | `0`（無効）                 |
| requested depth             | `11`                        |
| quiescence depth            | `10`                        |
| iterative-deepening start   | `1`                         |
| root tesu                   | authenticated parentの`ply` |
| private TT                  | parentごとにclear           |
| shared TT                   | 無効                        |
| NNUE                        | 有効、1 bucket              |
| sigmoid scale               | `K = 600`                   |
| output scale                | `1/1`                       |
| forced-full NNUE mode       | 無効（`0`）                 |
| book / external mate solver | 無効 / なし                 |
| fallback                    | 禁止                        |

workerは対応WASM exportを必須とし、weight pointer/sizeを検証し、shared TT offとstart depth 1を固定し、canonical board/hand/side vectorをloadし、`root_tesu`へinput plyを設定する。返されたpacked moveはchildで検査し、parent processでもdecodeしてrules-complete legal moveと再照合する。parentはchild SFENとsemantic child-position IDを再計算する。

stable worker数は1から12までのoperational optionである。事前登録済みYaneuraOu runtimeではない。planの12個×1-thread engine、engineごとのHash 64 MiB、searchごとの600,000 ms timeoutは、後続のdepth-16 YaneuraOu proposal/independent-rescore phaseに属する。stable-WASM search自体はuntimed（`max_time_ms = 0`）であり、parent processのstartup/search watchdogは停止したchildをfailさせるためだけに使い、operational metadataとして記録する。

## 5. early winning-mate addendum

WASMのiterative-deepening loopは、mate bandの勝ちscoreを見つけると意図的にearly stopする。そのためdepth 11をcapとしてrequestしても、正当にdepth 11未満で終了し得る。proposal contractはrequested/completed depthを別々に記録し、次の2種類だけを受理する。

- `completed_depth = 11`、`termination = requested-depth-complete`
- `completed_depth`が1から10、raw parent-perspective scoreが`89,990,000`から`90,000,000`、`termination = winning-mate-band-early`

それ以外のshallow resultはすべてfail-closedする。これはreal Floodgate rowを読む前に固定するimplementation addendumであり、元の事前登録はearly-mate bandまで明文化していなかった。これを黙って「depth 11完了」と記録するのは虚偽であり、有効なearly winning mateをすべて拒否すると正当な詰み局面でproduction move contractが使えなくなる。

field名は`raw_search_score`、encodingは`wasm-v20-raw-parent-perspective-mate-band-v1`である。普通のcentipawn値でも、YaneuraOu scoreでも、teacher labelでもない。特に約9千万の値はmate-band sentinelである。後続teacherが使ってよいのはstable moveをcandidateとして加えることだけで、training scoreはteacher自身のdepth-16 independent searchから得なければならない。

## 6. worker-count-invariant canonical JSONL

inputはexact plain dataへ再captureされ、training schema/role、canonical SFEN、legal played move、parent occurrence ID、aggregate digest、semantic position uniqueness、strict UTF-8-bytewise `parent_id` orderを検査される。search requestはこの順でdense indexを受け取る。workerの完了順は自由だが、serialize前にresultをassigned indexへ戻す。

final adversarial auditでは、injected searchが`await`中にprocess-wide built-inを変更できることから、4つのgapを発見した。liveな`Object.is`は`-0`とcanonical JSONの`0`を衝突させ、expected-keyのspreadはmutableなarray iteratorを呼び、liveな`node:util.types` guardはProxy / SharedArrayBuffer拒否を迂回でき、liveな`Hash.update` / `Hash.digest`はoutput digestを壊せた。修正後はこれらをmodule initialization時にcaptureし、expected keyをindexでcopyし、parent/child position IDもcapture済みHash methodだけで計算する。search callback自身が各built-inをpoisonする回帰testを置き、`-0` / Proxy / shared backingは拒否され、iterator / Hash prototype poison下でも同じartifactが得られることを確認した。これは同一process内のdependency-injection境界を固める証拠であり、OS sandboxの証拠ではない。

PR reviewではさらに、kill完了前のoversized stdout/stderr append、TAB / ESC / DELのtransport受理、sparse-array coverage check、Windowsのempty-env / command-line / esbuild shim依存、unknown exceptionのcoercionが指摘された。parentは残byte budgetをdecode前に検査し、failure後のchunkを捨て、stdoutをLFまたはprintable ASCIIだけに限定する。result arrayはown data descriptorで構築・再captureする。launcherは上記fd 3 bootstrapと最小platform environmentへ移し、test bundleはesbuild JS APIで作る。unknown thrown valueへ`String(...)`を呼ぶことはcoercion hookと情報漏えいを生むため行わず、capture済みnative-error判定とown data `message`だけをbounded ASCIIへ落とす。1 MiB flood、3種のcontrol byte、32 KiB超source、numeric setter、Windows metadata、hostile coercionを回帰testへ追加した。

各output rowは次を含む。

- game ID、parent ID、semantic parent ID
- complete minimal parent payloadのdomain-separated digest
- legal stable move
- 再計算したchild SFENとsemantic child-position ID
- requested/completed depth、termination、raw score encoding、nodes、leaves、root tesu

row schemaは`shogi-floodgate-stable-wasm-proposal-row-v1`である。bytewise-key canonical JSONを1行1row、final LFをexactly 1つ持つ`canonical-jsonl-utf8-single-final-lf-v1`としてserializeする。output identityはexact bytes、SHA-256、record count、parent-ID digest、child-position-ID digestを記録する。

semantic run fingerprintはauthenticated-trainingの構造binding、capture済み全parent rowのdomain-separated digest、plan identity、`supplied_engine_assets`、`required_search_contract`をbindする。worker数、watchdog値、Node versionは意図的に除外する。現在のreal-child testでは1、2、3 workersでrows、proposal JSONL、output SHA-256、semantic fingerprintが同一だった。designは1から12のoperational widthを許すが、このresultから1/2/3以外のreal-engine invarianceまでは主張しない。receiptはoperational fieldを別に記録するので、operational configurationが異なる場合の`receipt_json`自体は異なってよい。

## 7. `CoreForTests`がauthenticateしないもの

public generatorは`generateFloodgateStableWasmProposalsCoreForTests(...)`だけで、actual poolもtest-core building blockとしてのみexportされる。どちらもenumerable own data propertyとmutable byte inputをasync execution前にcaptureし、deeply frozenなmemory内dataを返し、fileを書かない。

inputのTypeScript typeは`AuthenticatedFloodgateTrainingRows`と同じだが、そのshapeはcallerが構築できる。さらにgeneratorはdependency-injected `search` adapterを受け取る。receiptはcallerが供給したbytesを`supplied_engine_assets`、要求tupleを`required_search_contract`として記録するが、injected adapterがそのasset/tupleを実際に実行したことは証明しない。明示的な`execution_boundary`は`dependency-injected-search-adapter-not-authenticated-by-this-receipt`である。pinned real child poolには別のtestがあるが、そのfunctionをdependencyとして渡すだけでsynthetic receiptがcryptographic engine authenticationへ変わるわけではない。

test coreは`claimActiveVerifiedPinnedFloodgateTrainingRows(...)`を呼ばず、production consumerのprivate runtime registryへmembershipをmintできない。したがってreceiptには次のstatusを置く。

```text
complete-in-memory-dependency-injected-test-core-not-engine-authenticated-not-durable-not-published
```

claim boundaryは次である。

```text
stable-candidate-structure-only-not-search-authentication-teacher-label-or-playing-strength-evidence
```

この実装作業へreal role bundle、training row、selection row、fresh final row、legacy final rowは渡していない。synthetic resultが示すのはcontract behaviorだけである。

## 8. 有用なtraining evidenceまでに残る工程

安全な順序は次のままである。

1. `withVerifiedPinnedFloodgateTrainingRows(...)`から入るproduction runnerを追加し、callbackの最初のactionとして、最初の`await`より前にexact-object production claimを同期consumeする。
2. proposal checkpointをauthorized private stageへbindし、exact file set、MAC-authenticated resume、crash reconciliation、file/directory fsync、consumer postflight、result receipt、exclusive rename、reopen verificationを追加する。
3. exact YaneuraOu binary/evaluation assetを復元してpinし、synthetic parentを使うreal-engine interruption/resume testを通す。
4. 実際のv7 unionを実装する。YaneuraOu MultiPV 12、強い実戦のplayed move、authenticated parentごとにexactly 1つのstable proposalをUTF-8 byte orderでdeduplicateし、全candidateをdepth 16でindependent rescoreする。
5. runner全体が閉じてからreal 24,000 training parentをlabelする。selection/final dataは事前登録したscheduleまで閉じたままにする。
6. seeds 42、43、44でfrozen familyを再trainingし、production int16 pathでquantizeし、static family gateを適用し、その後にだけ事前登録順でholdoutを開く。
7. production parity、known regression、fixed paired A/Bを通し、全internal gateと最新rule preflightの後にだけ、別途authorizeした81Dojo external calibrationを行う。

step 1から4までを完了しても、証明できるのはplanへ適合するteacher-input pipelineであり、強い評価関数ではない。棋力はfrozen multi-seed、holdout、quantization、search、game gateが通った後にだけevidence-backed claimになる。

## 9. validation status

| Check                       | 現在のresult     | Scope                                                                                                 |
| --------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| targeted Vitest             | 43/43 PASS       | strict capture、receipt boundary、worker protocol、failure cleanup、real WASM、deterministic assembly |
| targeted 3-way repeat       | 3 × 43/43 PASS   | 同じtargeted suiteを3 processで同時実行                                                               |
| 関連4 suite                 | 141/141 PASS     | proposerに加え、upstreamのrole-bundle / authenticated-row contractとの回帰を検査                      |
| full Vitest                 | 1,641/1,641 PASS | repository全体、99 files                                                                              |
| Python ML unit tests        | 58/58 PASS       | stdlib test suite                                                                                     |
| TypeScript                  | PASS             | `tsc --noEmit`                                                                                        |
| scoped ESLint               | PASS             | proposer source、proposer test、then-poison fixture                                                   |
| full ESLint                 | PASS             | 0 errors、今回と無関係な既存warning 157件                                                             |
| production build            | PASS             | 193 pages。既知のFirebase / dynamic-route build-time messageのみ                                      |
| real early-mate observation | PASS             | move `4c5b`、depth 1、raw score 89,999,999、133 nodes、2,856 leaves、fallbackなし                     |
| known depth-11 sentinel     | PASS             | move `3a4b`、raw score -114、644,923 nodes、1,533,244 leaves                                          |
| real pool invariance        | PASS             | 1、2、3 workersでrows / JSONL / output digest / semantic fingerprintが同一                            |
| loader-free then isolation  | PASS             | bundleしたplain-Node childで`Object.prototype.then`をpoisonし、`real-pool-then-isolation-pass`を出力  |
| final independent review    | 3/3 CLEAN        | transport/coverage、portability、bounded-error監査のすべてでP0/P1/P2なし                              |

上のexact mate/sentinel値はpinned synthetic positionでの観測であり、corpus resultでも棋力測定でもない。targeted suiteはstartup/searchのhang/crash、malformed/duplicate response、誤ったrequest-digest echo、別worker failure後のcompleted sibling result破棄、no-partial-artifact behaviorも検査する。

## 結論

stable-WASM proposerが閉じるのは1つの狭いdesign gapである。strict shapeのsynthetic training parentとexact byte snapshotから、visibleなdepth/early-mate contractの下で、worker-count-invariantなcanonical in-memory stable-move proposalを作れる。raw WASM scoreをcentipawn/teacher labelから分離し、child processへasset pathを渡さない。

production provenance、durable staging、v7 depth-16 labeling、real-data execution、retraining、strength evaluationより前で意図的に停止する。この未実装部分は形式上の残務ではない。reproducible stable moveをcomplete/stronger modelと取り違えないための境界そのものである。
