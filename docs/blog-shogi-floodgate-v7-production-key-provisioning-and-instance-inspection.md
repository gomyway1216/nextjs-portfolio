# 実機キーを一度だけ作成し、承認前のinstance候補まで観測した — Floodgate v7 production key operation

> [macOS home-anchor hardening](./blog-shogi-floodgate-v7-macos-home-anchor-hardening.md)をPR #465で通常mergeした後、merge commit `1849a675c4b2bbf2fa9e38431baa48ba1b6414ed`からNode v22.13.0のproduction provisionerを1回だけ実行した。32-byte CSPRNG keyはcreate-only / no-clobberで公開・durable化・再検証され、fresh metadata probeは`ready`、read-only inspectorはcandidateを1件返した。candidate観測は承認ではなく、approved recordがないpreflightはreceiptなしでfail closedした。続くimplementation revision `c2ffbb85a93ee3a95a670b14e3e6cc42e11bb0fa`は、digest-bound operator inputを固定private recordへ一度だけ保存するcreate-only installerとCLIを実装した。ready PR #466の初期headは6 / 6 checksに成功し、2件のreview feedbackはrevision `f2b3cb4ec28a18e0dc29cb4e927f0abca5f27471`で修正した。review-fix後のfocused 42 / 42、related 89 / 89、authoritative full 2,340 / 2,340、build、TypeScript、lint、format、Python 58 / 58、audit、独立security / functional reviewは全てPASSした。candidate ID、UID、path、device / inode、digest、key materialはpublic evidenceへ含めない。approved record設置、connector、real parent record、teacher、学習、weight、live評価関数、対局、棋力claimは引き続き0で、review-fix headのpush / final CI / mergeはまだ実施前である。English version: [blog-shogi-floodgate-v7-production-key-provisioning-and-instance-inspection.en.md](./blog-shogi-floodgate-v7-production-key-provisioning-and-instance-inspection.en.md)

## 1. 結果

| 項目                      | 実測結果                                                      | 意味                                                                       |
| ------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| prerequisite              | PR #465、6 / 6 checks成功、通常merge                          | actual macOS namespace fixをdefault branchへ統合済み                       |
| production provisioner    | 1回成功                                                       | 新規keyを作成した。再実行、上書き、adopt、rotateはしていない               |
| public status             | `new-csprng-key-no-clobber-published-durable-and-revalidated` | staging fsync、no-clobber publication、directory fsync、reopen検証まで完了 |
| key shape                 | private parent `0700`、key `0600`、32 bytes、`nlink=1`        | key content / fingerprint / pathは非公開                                   |
| fresh readiness           | 2回とも`ready`                                                | metadata-only。key bytesは読まず、authoritative reopenは別途必要           |
| instance inspection       | 3回ともcandidate 1件、held descriptors再検証済み              | 初回、証拠再取得、serializer適合確認。承認・永続化はしていない             |
| approved record           | 2回ともabsent                                                 | 初回operationと証拠再取得。preflightは固定エラー、exit 1でfail closed      |
| installer implementation  | `c2ffbb85` + review fix `f2b3cb4e`                            | create-only / no-clobber、承認自体は生成しない                             |
| focused / related tests   | 42 / 42、89 / 89 PASS                                         | CLI、loader round-trip、race / failpointを含む                             |
| full / build / static     | 2,340 / 2,340、PASS / PASS                                    | Node 22 authoritative rerun、build 193 / 193、error 0                      |
| independent review        | P0 / P1 / P2 = 0 / 0 / 0                                      | security / functional final freeze review                                  |
| review feedback           | 2件中2件をlocal revisionで修正                                | strong durability境界とCLI listener cleanup                                |
| installer PR / CI / merge | `#466 READY` / initial 6 / 6 / `PENDING`                      | review-fix headのpushとfinal CIはcapture後                                 |
| connector / real parent   | 0 / 0                                                         | keyができただけではrun authorityにならない                                 |
| training / live weight    | 0 / unchanged                                                 | 評価関数は変更していない                                                   |
| strength evidence         | 0                                                             | 高段をclaimできる対局証拠はまだない                                        |

## 2. provisionerが成立させたもの

実行したのはmerged codeに含まれる固定home・固定key slotのproduction wrapperである。秘密値やcaller指定pathを受けず、current effective UIDと`os.userInfo()`からnamespaceを導出する。成功receiptが固定した公開範囲は次のとおりである。

- entropyはNodeのCSPRNGから32 bytesだけ生成した。
- private staging inodeを`0600`で新規作成し、exact write後にfile fsyncした。
- final nameはhard-linkのno-clobber commit pointで公開した。既存finalをopen、adopt、replace、removeしない。
- final directoryとstaging cleanup後のdirectoryをfsyncした。
- final keyをauthoritative reopenし、regular file、current EUID、`0600`、32 bytes、`nlink=1`、held identityを再検証した。
- home / managed chainはoperation中held-openし、完了前にidentity / metadata driftを拒否する。

receiptはkey content、fingerprint、path、instance ID、key authorityを含まない。成功は「この固定slotに新しいprivate keyを安全に作成した」という狭い事実であり、connectorやcheckpointを動かす権限ではない。

## 3. fresh metadata probe

作成後のzero-argument readinessは次を返した。

```text
status                        = ready
parent                        = present-current-euid-exact-0700-directory
key                           = present-current-euid-exact-0600-regular-nlink-1-32-bytes
authoritative_reopen_required = true
```

これはpath-based metadataを2時点で確認するadvisory probeである。key bytes read / write、instance ID、authority、checkpoint、training、weight、playing strengthは全てnonclaimのままである。後段はreadiness結果を信頼してkeyを使い回さず、自分の責務で固定namespaceをauthoritative reopenする必要がある。

## 4. candidate観測と承認の分離

続くread-only instance inspectorは固定keyを32 bytesの上限内で読み、domain-separated HKDF / HMACからpseudonymous `key_instance_id`を導出した。public証拠ではraw IDを省略し、64 lowercase hexであることだけを検証済みとして記録した。inspection receiptはparent `0700`、key `0600`、32 bytes、`nlink=1`、held descriptor revalidationを固定する。

一方、同じreceiptは次を明示的に`false`とする。

- `control_plane_approval`
- `record_persisted`
- `connector_execution`
- `training`
- `weight`
- `live_evaluation_activation`
- `playing_strength`

つまり「実機keyから候補を観測した」と「その候補を別レビューで承認・pinした」は別のイベントである。candidate inspectorを成功させたprocessが、そのまま自分を承認する設計にはしない。

## 5. preflightがexit 1なのは正常

現行preflightはapproved recordを作る診断コマンドではない。固定private control-plane recordをread-only loadし、record内のexact candidate bytes / digestと埋め込まれたdeployment identityの自己整合を検証した後、single-use capabilityを即claimする成功専用commandである。このcommand自体はdeployment key bytesや現在のkey inodeを再検証しない。現行keyとの一致は後段connectorがfresh authorityをopenして確認する。recordが存在しない現在は次の固定出力だけで終了した。

```text
Floodgate v7 approved key enrollment preflight failed without a receipt
```

exit codeは1、capability issuanceは0である。raw pathやabsence reasonをpublic出力へ漏らさない。このfailureをconnector開始の許可に読み替えてはいけない。

## 6. writer gapをcreate-only installerで閉じた

実機操作時のrepositoryにはstrictなapproved-record reader / validatorとpreflightがあったが、production recordを安全に作るwriterがなかった。shell redirection、`cp`、手作業の`mkdir` / `chmod`では、canonical bytes、no-clobber、fsync、symlink / hardlink / race拒否、ambiguous failure reconciliationを同時に保証できない。

implementation revision `c2ffbb85a93ee3a95a670b14e3e6cc42e11bb0fa`は、次の狭いinstallerを追加した。

1. exact candidate JSONLとそのSHA-256へ結び付くcandidate-specificなoperator approval inputだけを受ける。
2. loaderと同じcanonical candidate / record validatorを共有する。
3. actual home以下の4 managed directoriesをcurrent-EUID、canonical、exact `0700`でheld-openする。
4. recordを`0600` stagingへbounded write / fsyncし、final nameへno-clobber publish、directory fsync、cleanup fsyncする。
5. final recordをreopen / 再検証し、既存recordのoverwrite / adoption / rotationを一切しない。
6. receiptからpath、candidate ID、approval ID、digest、UID、filesystem identityを除く。
7. publish前後のfailureをfailpoint testで固定し、retry可否とmanual reconciliationを曖昧にしない。

installerはapprovalを生成する主体ではない。exact candidateを別に確認したoperatorのdigest-bound assertionを、固定private recordへ一度だけ安全に保存する境界である。

operator CLIはargumentを受けず、stdinの65,536-byte以内・strict UTF-8・canonical JSONL 1行だけを受理する。requestはcontract、approval ID、UTC millisecond timestamp、approved candidate SHA-256、exact candidate JSONLの5 fieldだけである。success stdoutはstable IDやpathを含まないsanitized receipt、failure stderrは固定文だけである。CLIのinvalid input 8系統もproduction installerを呼ばずfail closedする。

攻撃testはexisting final、stale staging、EEXIST、symlink / hardlink、unsafe home / managed mode、UID / boundary mismatch、candidate reorder / duplicate / CRLF / digest mismatch、全commit前後failpoint、staging差替え、final mode / size / nlink tamperを固定した。reviewで見つけた「競合stagingを消して強いdurabilityを誤claimし得る経路」と「managed prefix作成後をno changeと誤分類し得る経路」も修正し、ambiguous stateはmanual reconciliationへ閉じた。

ready PR #466のreviewは2点を見つけた。1点目は、最終revalidation成功後のdescriptor close失敗を弱いdurabilityへ落とし過ぎる経路である。`cleanupDirectorySynced`だけでは強くせず、最終revalidation完了後に続くcloseが失敗した専用stateだけをstrong / do-not-retryへ分類し、実close後にerrorを返すtest hookで固定した。2点目は、CLI output失敗時の一時`error` listenerが同一streamの再利用で蓄積し得る経路である。paired errorを同じevent-loop turnで吸収し、detach後にrejectするよう修正し、success / synchronous throw / paired error / 20回反復をtestした。revisionは`f2b3cb4ec28a18e0dc29cb4e927f0abca5f27471`で、独立security / functional reviewの残存P0 / P1 / P2は0である。

initial implementationのauthoritative validationはfocused 37 / 37、related 84 / 84、full 2,335 / 2,335だった。review-fix後はfocused 2 files / 42 tests、related 4 files / 89 tests、full 125 files / 2,340 tests、production build 193 / 193、TypeScript、scoped / full lint、Prettier 3.6.2、Python 58 tests、dependency vulnerabilities 0を再確認した。full-only Node 22 runは146.03秒、wall 146.49秒、maximum RSS 4,283,318,272 bytes、swap 0である。最初のimplementation検証時にbuild / full lintと同時実行したfull suiteはunrelated teacher-asset test 1件が一時失敗しworkerが残ったため採用せず中断しており、review-fix後の採用authorityは単独実行の2,340 / 2,340である。

## 7. privacyとnonclaims

[machine-readable evidence](./data/floodgate-v7-production-key-provisioning-and-instance-inspection-2026-07-15.json)にはraw key、root hash、derived key、MAC、candidate ID、candidate digest、approval ID、UID、absolute path、device / inode、descriptor番号を入れない。identity consistencyは後段のprivate record / loaderがexact値で検証するが、public articleにstable identifierを複製する必要はない。

今回から次はclaimしない。

- key backup、export、rotation、recoveryが完了したとは言わない。
- candidateがapprovedまたはpersistedされたとは言わない。
- preflight、connector、checkpoint、dataset read、teacher request / labelが成功したとは言わない。
- real 100 / 500 / 24,000 parentを処理したとは言わない。
- optimizer、candidate weight、live activation、weight overwriteが起きたとは言わない。
- formal A/B、Elo、段位、安定高段を観測したとは言わない。

## 8. 次の順序

1. review-fix revisionと更新した本稿をready PR #466へpushし、final review / CIを全て通して通常mergeする。
2. fresh candidateのexact bytes / SHAを人間がcandidate-specificに確認する。
3. merged installerを1回だけ実行し、approved recordを設置する。
4. preflightを再実行し、fresh capabilityが成功することを確認する。
5. connectorのreal durable-prefix-100へ進み、失敗・durability・cleanupを証拠化する。
6. 100通過後だけ500、24,000、3-seed training、holdout selection、color-swapped A/B、段階的live rolloutへ進む。

実機keyの安全な作成とcreate-only installerのlocal実装・review修正・全検証は完了した。しかし棋力を変えた工程はまだ0である。次の意味のある境界はPRを通常mergeし、観測済みcandidateを自動採用せずcandidate-specificな人間レビューへ渡すことである。
