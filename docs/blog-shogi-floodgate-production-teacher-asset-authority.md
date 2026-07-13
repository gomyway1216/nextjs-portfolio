# production teacherを起動する前に実在assetを固定する

> [explicit finalization resume](./blog-shogi-floodgate-stable-proposal-finalization-resume.md)までで、synthetic stable proposalをfresh authorityからprivate publicationへ閉じるruntime compositionは完成した。しかしproduction depth-16 teacherへ進むには、実際に使うYaneuraOu binary、eval、stable runOp1 assetを「どこかにあるfile path」ではなく、固定したprivate deployment registryとexact identityへ結び付けなければならない。read-only recoveryでは、過去のWCSC36 teacherで使ったYaneuraOu binaryがtracked engine receiptのexpected binary identityとexact一致し、既存eval treeも過去manifestのexact hashと一致することを確認した。このPRは個人のsource absolute pathを公開せず、それらを固定private deployment rootへ置くregistryとargumentless production preflightを追加する。これはasset authorityのpreflightであり、engine process、teacher label、training、selection / holdout、棋力を実行・証明しない。English version: [blog-shogi-floodgate-production-teacher-asset-authority.en.md](./blog-shogi-floodgate-production-teacher-asset-authority.en.md)

---

## 現在の境界

| 項目                            | 現在の状態               | 意味                                                                                         |
| ------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- |
| real engine recovery            | exact identityを発見     | local binaryがtracked receiptに記録されたYaneuraOu binary SHA-256と一致した                  |
| real eval recovery              | exact identityを発見     | local eval treeが既存teacher manifestのeval-tree SHA-256と一致した                           |
| private deployment root         | fixed registryとして実装 | caller指定pathを受けず、current-EUID private root直下のexact relative file setだけを検査する |
| production preflight API        | argumentless             | `verifyPinnedFloodgateProductionTeacherAssets()`だけを公開し、path / hash overrideを受けない |
| engine execution                | 未実装・未実行           | binaryをspawnせず、USI handshake、search、depth、MultiPV、scoreを証明しない                  |
| teacher / training / strength   | 未実装・証拠なし         | candidate union、label、weight更新、selection、Elo、段位、高段の安定性を証明しない           |
| real data / selection / holdout | 未使用・未読             | Floodgate row、fresh selection、fresh / legacy final holdoutをpreflightへ渡さない            |

この境界でいう`production`は、dependency-injected fixtureではなくfixed registryと実在asset identityを使うことだけを指す。production teacherが実行済み、またはproduction modelへ採用済みという意味ではない。

## 1. 発見: missingだったassetを別の場所で見つけてもpathをcontractにしない

以前のpreflightではtracked receiptとstable assetは存在したが、予定した場所のYaneuraOu binaryとeval `nn.bin`がmissingだった。その後のread-only recoveryで、過去のclean WCSC36 teacher runに使った実assetをlocal machine上で発見した。

| recovered identity       | exact evidence                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------- |
| YaneuraOu binary SHA-256 | `1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1`                    |
| engine receipt           | 654 bytes、SHA-256 `a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e` |
| eval-tree SHA-256        | `639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568`                    |

重要なのは発見元pathではなくbytes identityである。個人home、過去worktree、download directoryのabsolute pathをsource provenanceとして公開すると、別machineで再現できず、private layoutも漏れる。そこで発見元から固定deployment rootへ明示的にcopyし、copy後にexact hashとmetadataを再検査する。記事、receipt、errorへ個人のsource absolute pathを残さない。

receiptが期待するbinary SHAと実fileが一致することは、過去runと同じbinary bytesを回収できた証拠である。ただしreceiptがそのengineを強い、正しい、または安全と証明するわけではない。

## 2. fixed private deployment registry

記事ではmachine固有のrootを`<fixed-private-deployment-root>`とだけ表す。public contractへ出すのは次のexact direct-child layoutである。

```text
<fixed-private-deployment-root>/
  engine/
    yaneuraou
    yaneuraou-receipt.json
  eval/
    nn.bin
  stable/
    floodgate-plan.json
    shogi.wasm
    shogi-nnue-weights.bin
    floodgate-stable-wasm-worker.mjs
```

relative nameはaliasではなくregistry keyである。extra entry、別basename、symlink、directory/file type違い、hardlink、wrong owner / mode、root外へのtraversalは拒否する。root、`engine`、`eval`、`stable`はcurrent EUID所有のprivate directoryでなければならない。preflightはcallerのcurrent working directoryやenvironment path searchからassetを補完しない。

exact treeは`.DS_Store`も例外扱いしない。private deploymentへsystem-generated fileが混入した場合も、黙って無視せずpreflightを失敗させて明示的なcleanupと再検証を要求する。

registryのlogical identityは次で固定する。

| registry file                             | exact identity                                                                               |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `engine/yaneuraou`                        | binary SHA-256 `1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1`            |
| `engine/yaneuraou-receipt.json`           | 654 bytes、SHA-256 `a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e`        |
| `eval/nn.bin`                             | 64,217,066 bytes、SHA-256 `1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782` |
| `stable/floodgate-plan.json`              | 10,890 bytes、SHA-256 `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af`     |
| `stable/shogi.wasm`                       | 35,597 bytes、SHA-256 `e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c`     |
| `stable/shogi-nnue-weights.bin`           | 1,185,988 bytes、SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`  |
| `stable/floodgate-stable-wasm-worker.mjs` | 19,216 bytes、SHA-256 `d21e347268fa0830882a7f8fb40893aeeed0425f8d92519b26a13444efc467e3`     |

embedded WASMはdeployment fileではない。後続stable runtimeがtracked bundle内snapshotと`stable/shogi.wasm`をbyte-for-byte照合する別contractである。

eval-tree identityは`nn.bin`のpath、bytes、SHA-256からcanonicalに再導出し、`639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568`へ照合する。registryに書かれたtree hashをそのまま成功receiptへ転記するだけではない。

## 3. argumentless production preflight

public APIは次だけである。

```text
verifyPinnedFloodgateProductionTeacherAssets()
```

APIはoptions、dependencies、root path、expected hash、engine argumentsを受け取らない。fixed rootとregistry constantをmodule内部で選ぶ。test-only coreが必要でもproduction APIとregistryを分離し、test injectionでproduction success receiptを発行できないようにする。

独立監査では、zero-argumentだけではfixed rootにならないことも判明した。最初の実装が使った`os.homedir()`は`HOME`環境変数で別rootへ向けられた。最終実装はOSのeffective-user accountからhome directoryを取得し、そのaccount UIDとprocess EUIDの一致を要求する。`HOME=/tmp`での実asset smokeでも同じfixed deploymentを検証できた。

このregistryのengine receiptは`APPLEM1` binaryを固定するため、production APIも`darwin/arm64`以外をfail closedにする。Linuxのstandard data directoryへ同じcontractを自動で切り替えない。別platformのbinaryとrootは、別registry identityとしてreviewする。

preflightは次の順でassetを検証する。

1. fixed deployment rootと3 subdirectoryのcanonical real path、owner、private mode、device / inode、exact entry setをcaptureする
2. 全registry fileをexact relative pathから`O_NOFOLLOW`でopenする
3. pathnameとheld file descriptorのidentity一致を確認する
4. owner、type、mode、link count、bounded sizeを検査する
5. held descriptorからstable readし、read前後metadata不変を確認する
6. 全fileのbytes / SHA-256をregistryへ照合する
7. engine receiptをstrict parseし、receipt内binary identityとheld engine fileをcross-bindする
8. eval fileをexact eval-tree identityへbindする
9. directoryとfileのpathname identity、owner、mode、exact entry setを再照合する
10. 全file descriptor close成功後だけdeep-frozen receiptを返す

argumentlessであることは利便性よりauthority narrowingのためである。CLI flagやenvironment variableで別engine、eval、rootを選べると、同じproduction contract名で別assetを実行できてしまう。別asset setは新registry / contractとしてreviewする。

## 4. preflight receiptとruntime handoff

成功receiptはsecretやopen handleを返さず、検証したidentityだけを保持する。

```text
contract
status
claim_boundary
trust_boundary
execution_boundary
deployment
assets.engine
assets.eval
assets.stable
engine
runtime
postverification
```

各file evidenceはregistry-relative name、bytes、SHA-256、device / inode、modeを含める。current-EUID owner検証はdeployment evidenceにまとめる。receipt全体はexact keysでdeep-frozenとし、source discovery path、root key、raw file bytes、file descriptorを含めない。

このreceiptはengineを実行するcapabilityではない。次PRのhardened fixed USI runtimeは、同じfixed registryを再openしてidentityを再検証し、private runtime snapshotへcopyし、copy後hashを照合してwrite bitを落としたassetだけをspawnへ渡す。preflight receiptだけをfield-copyして任意binaryを起動してはいけない。

次PRのruntime execution contractは少なくとも次を固定する。

- YaneuraOu binary、receipt、evalを同じregistry generationへbindする
- engine argumentはfixed listだけで、caller inputやinline pathを受けない
- private working directoryとread-only runtime snapshotを使う
- Threads 1、book off、network delay 0、Hash 64 MiBを固定する
- stdout / stderr、USI handshake、option、timeout、shutdownをboundedにする
- proposal前と各candidate前に`isready`とTT resetを行う
- production runnerはpreflight successだけでsearch successを推論しない

## 5. failureとthreat boundary

preflightは次をfail closedにする。

| condition                                    | handling                      |
| -------------------------------------------- | ----------------------------- |
| fixed root / subdirectory missing            | success receiptを発行しない   |
| extra / missing / renamed registry entry     | automatic fallbackせず拒否    |
| symlink / hardlink / wrong type / owner/mode | path cleanupせず拒否          |
| file size / SHA-256 mismatch                 | discovered sourceへ戻らず拒否 |
| receipt malformed / binary identity mismatch | engine authority不成立        |
| eval identity mismatch                       | teacher eval authority不成立  |
| read中またはclose前のmetadata mutation       | receiptを発行しない           |
| descriptor close failure                     | receiptを発行せず失敗         |

held readとcleanup closeが同時に失敗した場合は、closeをbest-effortにして元のverification failureを保持する。元の失敗がないclose failureは、それ自体でreceipt発行を止める。

このboundaryが防ぐのは、wrong asset、accidental path drift、registry外fallback、検査中のpathname replacementをproduction teacher identityへ混ぜることである。

失敗するpreflightもprivate asset bytesを一時bufferへ読む。embedded WASMはdecode前にexpected encoded lengthでboundし、optional hookもdecode前に検査する。file readのscratch、余剰byte検査buffer、返却されないretained bufferは成功・失敗の両経路でzero-fillする。これはprocess memory全体の消去を保証する主張ではない。

防がないものも明示する。

- hostile same-EUID process、root、ACL actor、pre-existing open capability
- pinned binary自体のmalice、compiler / source supply-chain compromise
- validな古いregistry一式へのrollback
- runtime開始後のprocess memory compromise
- OS sandbox、code signing、notarization、remote attestation
- engine scoreのtruthや棋力

SHA-256一致は同じbytesのidentity evidenceであり、そのbytesを信頼すべき理由を自動的に作らない。

## 6. local real-asset smoke evidence

このPRのlocal smokeは実在7 asset、合計66,169,459 bytesをargumentless public APIからread-only検査し、成功した。binaryはspawnしていない。

| validation                                | 現在の結果                           |
| ----------------------------------------- | ------------------------------------ |
| engine file vs tracked receipt identity   | PASS                                 |
| eval raw file vs derived eval-tree        | PASS                                 |
| stable four-file registry                 | PASS                                 |
| fixed-root metadata / exact entry set     | PASS                                 |
| argumentless production preflight receipt | PASS                                 |
| `HOME=/tmp` root-injection resistance     | PASS                                 |
| targeted adversarial suite                | 11 / 11 PASS                         |
| related asset / stage / proposer suites   | 259 / 259 PASS                       |
| full Vitest / Python stdlib audit         | 1,769 / 1,769、58 / 58 PASS          |
| TypeScript / ESLint / Prettier / build    | PASS（ESLint 0 error / 157 warning） |

smoke evidenceには、registry-relative identities、receipt cross-binding、eval digest、stable file identities、descriptor lifecycleだけを記録する。engine stdout、USI handshake、bestmove、depth、nodes、scoreは存在しない。

## 7. explicit nonclaims

| preflight successが示すこと                             | preflight successが示さないこと                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| fixed private registryのexact file setを検証した        | YaneuraOu processを起動・handshake・searchしたこと                      |
| recovered engine bytesがtracked receiptと一致した       | engine binaryが正しい、無害、または強いこと                             |
| recovered evalがpinned existing eval identityと一致した | evalがteacher truthや最新最強であること                                 |
| stable plan / WASM / weights / worker identityを揃えた  | stable proposal、v7 union、depth-16 independent rescoreの完成           |
| argumentless fixed production boundaryを用意した        | teacher label、training row output、model weight更新                    |
| asset registryだけをreal local smokeで検査した          | selection、fresh / legacy final holdout、accuracy、Elo、段位、高段level |

preflightはreal Floodgate training row、selection label、fresh final holdout、legacy final holdoutを読まない。engineを実行せず、teacher cp、candidate union、training JSONL、checkpoint、model、A/B match、81Dojo較正を作らない。existing production weightsを変更せず、runOp1を維持する。

`production asset authority complete`という表現は、このfixed registryのpreflightだけに掛かる。production teacher、強い評価関数、安定した高段levelがcompleteという意味ではない。

## 8. 次はhardened fixed USI runtime、その後v7 unionである

次PRはこのregistryを任意引数なしでconsumeするhardened fixed USI runtimeを追加する。real engineをprivate snapshotから起動し、bounded USI handshake、fixed option、`isready` / TT reset、timeout、stderr / exit cleanupをsynthetic positionとreal assetで検証する。そこでもまだteacher labelは作らない。

その後にだけ、training-role exact inputとauthenticated stable proposalをjoinし、YaneuraOu MultiPV 12、strong-game played move、stable moveをUTF-8 byte orderでdeduplicateするv7 unionを実装する。全unique candidateをMultiPV 1、`searchmoves` exactly one move、fixed depth 16でindependent rescoreし、durable teacher work / train / result / manifestへ閉じる。

real 24,000 training parentをlabelするのは、asset authority、fixed USI runtime、v7 union、resume / publicationの全boundaryが閉じた後である。fresh selectionは3 seed final checkpoint後、fresh / legacy final holdoutはstatic family pass後まで開かない。

今回復元できたのはproduction teacherに必要な実assetのidentityであり、labelや棋力ではない。
