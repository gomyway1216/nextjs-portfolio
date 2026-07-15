# 秘密を公開経路へ出さず、人間レビューから現行キー照合までを1回のfail-closed操作にした — Floodgate v7

> PR #466を通常mergeしたcommit `6344ceaac6e6485e205f610fdbf612a7d5450d56`をbaseに、branch `codex/floodgate-v7-private-enrollment-orchestrator`のimplementation commit `76e0a7e46b5837118d228db80427fd7dc021abae`でprivate human key enrollment orchestratorを実装した。固定AppKit / JXA画面は、exact canonical candidate JSONL、そのterminal LF、byte数、完全なSHA-256を表示し、人間が64文字のlowercase digestを再入力して明示承認した場合だけ先へ進む。承認後はcandidateをfresh reinspectionし、32-byte CSPRNG approval IDを生成してcreate-only installerを呼び、保存recordのexact claimと現行keyとのfresh bindingをpostflightする。candidate、digest、stable ID、filesystem identity、path、key materialはargv / env / TTY / temporary file / clipboard / log / public streamへ出さない。関連7 suites 136 / 136（private UI 22 / 22を含む）、authoritative full 2,434 / 2,434、build 193 / 193、Python 58 / 58、TypeScript、ESLint、Prettier、JXA syntax、dependency auditはPASSし、独立security reviewはP0 / P1 / P2 = 0 / 0 / 0だった。一方、production UI、human approval、record installation、connector、training、live weightは全て未実行で0であり、棋力はまだ変わっていない。English version: [blog-shogi-floodgate-v7-private-human-key-enrollment-orchestrator.en.md](./blog-shogi-floodgate-v7-private-human-key-enrollment-orchestrator.en.md)

## 1. 結果

| 項目                          | 現在の結果                                               | 意味                                                                    |
| ----------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------- |
| base                          | PR #466、通常merge `6344cea`                             | create-only / no-clobber installerをdefault branchへ統合済み            |
| implementation                | private enrollment orchestratorをlocal branchで実装      | production実行ではなく、review / install / postflightの安全な経路を追加 |
| private review UI             | AppKit / JXA、固定helper、private pipe                   | candidateをargv、env、TTY、temporary file、clipboard、logへ渡さない     |
| exact human check             | canonical JSONL + terminal LF + bytes + SHA-256を表示    | 人間が確認する対象をinstallerへ渡すexact bytesに固定                    |
| approval                      | 64 lowercase hexの完全typeback + Approve                 | 部分一致、trim、case変換、自動承認を許さない                            |
| freshness                     | 承認後にcandidateを再inspection                          | review中にkey identityが変わればinstall前に停止                         |
| approval metadata             | 32-byte CSPRNG ID + 承認後のUTC timestamp                | candidate-specific recordに必要なmetadataをmemory内で生成               |
| record write                  | create-only installerを直接使用                          | 既存recordのoverwrite、adopt、replace、rotationをしない                 |
| record postflight             | loaded claimを期待値とexact比較                          | 保存済みcandidate、approval、deployment identityのずれを拒否            |
| current binding               | approved recordとfresh current keyを再照合               | read-only / memory-onlyで、run capabilityは返さない                     |
| absence handling              | fixed namespaceをheld-openしてverified absenceを確認     | corrupt / unsafe / indeterminateを「ない」と扱ってUIを開かない          |
| failure receipt               | phase、durability、may-have-committed、retry disposition | 秘密を出さず、再実行してよい失敗と手動照合が必要な失敗を分離            |
| related tests                 | 7 suites、136 / 136 PASS                                 | UI、orchestrator、CLI、binding、absence、failureを検証                  |
| UI tests                      | 22 / 22 PASS                                             | private transport、bounds、cancel / mismatch、zeroizationを検証         |
| static checks                 | TypeScript / ESLint / Prettier / JXA PASS                | sourceとnative helperの構文・規約を確認                                 |
| full / build / Python / audit | 2,434 / 2,434、193 / 193、58 / 58、0 vulnerabilities     | Node 22の全体、production build、Python、依存監査が成功                 |
| independent security review   | P0 / P1 / P2 = 0 / 0 / 0                                 | verified absence race、UI stderr、typed durability修正後の最終判定      |
| production approval / install | 0 / 0                                                    | 本稿時点では人間画面も実record writerも動かしていない                   |
| connector / training / live   | 0 / 0 / 0                                                | dataset、teacher、weight、live評価関数は未変更                          |
| strength evidence             | 0                                                        | 高段、Elo、段位安定性をclaimできる対局証拠はまだない                    |

## 2. installerだけでは足りなかった理由

PR #466のinstallerは、既に別の主体が確認したcandidate-specific approval inputを固定private recordへ安全に保存できる。しかし、次の判断はinstallerの責務外だった。

- 人間がどのexact candidate bytesを見たか。
- terminal LFを含むdigestを本当に確認したか。
- reviewからwriteまでの間に現行keyが変わっていないか。
- 保存後にloaderが同じrecordをclaimできるか。
- 保存したrecordがfreshな現行keyへ今もexact bindingしているか。
- 失敗後に再実行してよいか、それともrecordが既にcommit済みか。

read-only inspectorや既存installer CLIのraw入出力を手作業でつなぐと、candidate ID、UID、device / inode、digestなどをterminal historyやlogへ複製する危険もある。そこで今回のorchestratorは、private reviewからpostflightまでを1つのargumentless production entry pointにまとめた。これは承認を自動化するものではなく、人間の明示判断を秘密のまま正しいbytesへ結び付けるための境界である。

## 3. private AppKit / JXA review

Node側は固定pathの`/usr/bin/osascript -l JavaScript <fixed helper>`だけを起動する。candidateはcommand argumentやenvironmentに含めず、bounded canonical requestをchild stdinへ1回だけ送る。helperのstdoutはbounded response専用、stderrは1,024 bytesを上限に数え、内容を公開せず受信chunkをzeroizeする。request / response bufferも処理後にzeroizeする。shell、TTY、temporary file、clipboard、public stdout / stderrをprivate transportとして使わない。

native画面が表示するのは次の4点である。

1. exact canonical candidate JSONと末尾のLF。画面上ではfinal blank rowがterminal LFであることを明示する。
2. UTF-8 byte数。
3. final byte `0A`とterminal LF count `1`。
4. terminal LFを含む完全なlowercase SHA-256。

候補本文とdigest表示は選択不可で、approveするにはsecure text fieldへ64文字すべてをlowercase hexで再入力する。mismatchならapprovalは記録せずreviewへ戻り、Cancelならinstall前にfail closedする。UI responseを受けたNode側もcontract、field order、canonical JSONL、完全digestを再検証し、digest比較にはconstant-time primitiveを使う。

この画面はproductionではまだ一度も開いていない。testでのApproveはinjected boundaryであり、実機candidateに対する人間承認の証拠ではない。

## 4. 承認後にもう一度観測し、保存後に二重postflightする

最初のinspectionで得たcandidateは、canonical JSONLとterminal LFを含めてhashする。人間のApprove後、orchestratorは同じproduction inspectorをもう一度呼び、fresh candidate bytesがreview済みbytesとexact一致することを確認する。違えばapproval IDもrecordも作らず停止する。

一致した場合だけ、NodeのCSPRNGから32 bytesを得て64 lowercase hexのapproval IDにし、承認後のUTC timestamp、candidate digest、exact candidate JSONLとともにmerged create-only installerへ直接渡す。秘密を含む別CLI requestをpublic process境界へ出す必要はない。

installer成功だけを最終結果にはしない。続けて次の2段階を実行する。

- fixed loaderで保存recordをload / claimし、candidate bytes、digest、approval ID / timestamp、key instance、UID、parent / key device・inodeを期待値とexact比較する。
- approved recordとfreshly inspected current keyを8-field strict equalityで照合するread-only current-binding preflightを実行する。

current-binding receiptはsensitive identityを返さず、single-use capability、run / stage / connector authorityも返さない。したがって成功receiptが意味するのは「人間が見たcandidateがcreate-onlyで保存され、そのrecordと現行keyがpostflight時点で一致した」という狭い事実だけである。

## 5. absenceとraceを楽観しない

既存loaderは意図的にabsence、corruption、unsafe namespace、I/O failureを同じfailureへ畳む。そのfailureだけを見て「recordはない」と決め、fresh approval UIを開くのは危険である。

orchestratorは別のverified-absence traversalを使う。current EUIDと`os.userInfo()`のhomeを固定し、homeからmanaged directory chainを`O_NOFOLLOW`でheld-openする。owner / mode / canonical path / device・inodeをopen前後と終了前に再検証し、固定chainの途中またはfinal record nameで`ENOENT`を確認できた場合だけabsenceを成立させる。既存name、symlink、mode不一致、identity drift、close failure、判定不能は全てmanual reconciliationであり、UIを開かない。test-only probeはproduction homeとそのaliasも拒否する。

それでもkey fileとapproved recordを1つのtransactionでatomic commitしているわけではない。成立するtrust boundaryは、対応するkey writerがcreate-only / no-clobberであり、操作中にout-of-band rotationを行わないことまでである。concurrentな外部rotationは境界外で、postflight mismatchが起きた場合はrecordを勝手に削除・上書きせずmanual reconciliationへ進む。

## 6. failure後の再実行条件を型で固定した

公開failureはraw errorを転送せず、contract、status、phase、durability、`approved_record_may_have_been_created`、retry disposition、installer phase、installer retry disposition、sensitive-values-disclosed、success-receipt-issuedという固定projectionだけをsanitized JSONLで返す。

- install前にno changeが確立した失敗は、fresh private reviewからのrestartだけを許す。
- valid existing recordがある場合は再installしない。
- installerがcommitした可能性を否定できない場合は再実行しない。
- record postflightまたはcurrent-binding postflightのmismatchはmanual reconciliationとする。

success後にstdout serialization / writeが失敗した場合も、成功receiptが見えなかったことを「未install」とは扱わない。CLIは「commit済みかもしれないためsanitized binding preflight前にretryしない」という固定failureへ閉じる。これにより、見えなかった出力を理由にcreate-only operationを重ねる経路を防ぐ。

## 7. validationと公開証拠

関連7 suitesは136 / 136、private AppKit / JXA UI suiteは22 / 22に成功した。対象はcanonical request / response、terminal LFとbyte数、digest mismatch / cancel、argv / env / stdio境界、oversize output、stderr zeroization、listener cleanup、approval後のcandidate drift、32-byte entropy、existing record、verified absenceとmissing-path再検証race、全orchestrator phase、typed durability / retry、loaded-claim mismatch、fresh current-binding、CLI output failureを含む。Node v22.13.0でworker数を4に固定したauthoritative full runは130 files / 2,434 testsすべて成功し、wall 141.15秒、maximum RSS 4,287,922,176 bytes、swap 0だった。production buildは193 / 193を24.39秒で生成し、Python 58 / 58、TypeScript、ESLint、Prettier、JXA syntax check、dependency vulnerabilities 0もPASSした。

default worker数のfull runは2回とも2,433 / 2,434で、1回目は既存finalization-resume test、2回目は別のstable-WASM worker初期化が資源競合下で1件だけ失敗した。直後の単独再実行はそれぞれ11 / 11と53 / 53で成功し、4-worker fullでは両方を含む2,434 / 2,434が成功したため、採用authorityは4-worker runとする。独立security reviewは、unsafe intermediate symlink、exact missing path race、bounded macOS stderr、late buffer zeroization、installer durability mappingを修正後にP0 / P1 / P2 = 0 / 0 / 0と判定した。

[machine-readable evidence](./data/floodgate-v7-private-human-key-enrollment-orchestrator-2026-07-15.json)にはcandidate JSON、candidate digest、key instance ID、approval ID / timestamp、UID、absolute path、device / inode、key materialを含めない。テストで安全な制御経路が成立したことと、production operationが実行されたことは別に記録する。

本稿時点のproduction counterは次のとおりである。

- private UI opened: 0
- human approval: 0
- approved record installed: 0
- current binding production success: 0
- connector / real parent record: 0 / 0
- teacher / training / candidate weight: 0 / 0 / 0
- live weight activation / formal match / strength claim: 0 / 0 / 0

## 8. 次の順序

1. implementation、日英記事、machine evidenceをready PRへまとめ、review / CIを通して通常mergeする。
2. merged codeからprivate human UIを1回だけ開き、表示されたexact candidate、terminal LF、bytes、完全SHA-256を人間が確認してtypebackする。
3. 同じoperation内でfresh reinspection、create-only install、loaded-claim postflight、fresh current-bindingを完了させる。失敗時はtyped retry dispositionに従う。
4. audited production connector runnerを別PRで実装・review・mergeする。
5. real durable-prefix 100を先に通し、成功後だけ500、最終24,000へ進む。
6. 強い棋譜 / teacher labelで再学習し、封印holdout、複数seed、color-swapped A/B、段階的live rolloutで選抜する。
7. 対局証拠が安定して揃った後だけ高段レベルをclaimする。

今回閉じたのは、既に安全に作成済みのproduction keyを、人間が秘密のままexact candidateとして確認し、create-only recordへ結び付け、その場で現行keyとの一致まで検証する経路である。評価関数の上書きや棋力向上はまだ始めていない。次の実運用境界は、このコードを通常mergeした後に人間が画面を確認し、1回だけinstallを成立させることである。
