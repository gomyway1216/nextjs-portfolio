# #478のouter-lock仮定をfixed lexical ownerとzero-argument CLIで閉じる — Floodgate v7 training-label production owner

> #478は、held `work.jsonl`のunkeyed preflightと2回の認証済みV3走査からproduction planを発行できるようにした。ただし、そのentrypoint自身はcommon outer lockの保持を証明せず、正しいownerの内側から呼ばれることを仮定していた。今回の候補は、4つ目のmutation purpose、purpose固有のsingle-use capability、fixed lexical owner、sanitized runner、zero-argument CLIを追加し、outer lock取得からlabel artifactのfinalization、outer lease cleanup、OS lock releaseまでを1本の固定された呼び出し順序にする。これはproduction実行のためのcode boundaryであり、実registry provision、実work読取、実label finalization、学習、weight、対局、live evaluator変更はまだすべて0である。English version: [blog-shogi-floodgate-v7-training-label-production-owner.en.md](./blog-shogi-floodgate-v7-training-label-production-owner.en.md)

関連する#478のcomposition境界は[production composition記事](./blog-shogi-floodgate-v7-training-label-production-composition.md)、この候補の構造化された状態は[machine evidence](./data/floodgate-v7-training-label-production-owner-2026-07-16.json)に記録した。

---

## 1. 何を閉じたのか

#478のproduction compositionは、callerがcommon outer lockをすでに保持しているという契約を置いていた。今回の候補では、外部からpath、run id、key、binding、row、callback、dependency、optionを受け取らない固定production entrypointを追加する。zero-argument runnerがcommon outer-gate ownerを呼び、そのownerだけが目的固有capabilityをmintし、lockとauthenticated active leaseの内側でtraining-label ownerをlazy-loadする。

したがって正常系の順序は次に固定される。

```text
fixed zero-argument runner
  -> common OS lock
  -> authenticated purpose-bound active outer lease (durable)
  -> one-shot training-label capability
  -> fixed lexical training-label owner
       -> private registry
       -> approved enrollment / current binding
       -> stage authorization
       -> unkeyed held-stage/work preflight
       -> fresh authenticated-training-row callback
            -> #478 scanner-backed plan composition
       -> consumer postflight
       -> terminal label finalizer / destination revalidation
  -> outer active-lease removal + retired evidence (durable)
  -> common OS lifetime lock release (filesystem phase complete)
  -> in-memory secret zeroization before return
  -> sanitized public receipt
```

outer callbackがreturnする前にlabel finalizerとdestination content revalidationが完了し、outer active leaseのdurable cleanupはcallback後、OS lock releaseはその後である。さらにreturn前の`finally`でin-memory secretをzeroizeする。これが#478単体では証明できなかったlexical ownershipとdurable filesystem cleanup-before-releaseの閉包である。

## 2. outer leaseをV2 purpose recordへ拡張する

既存の3 checkpoint gateに`training-label-finalization-24000`を加え、同じregistry descriptorをanchorにする1本のOS lifetime lockで4つのmutation purposeを直列化する。control directory、`active-lease.json`、quarantine、retiredという既存namespaceは変えない。

新規発行するactive leaseはV2で、`gate`ではなく4値の`purpose`を持ち、新しいpurpose-record HMAC domainを使う。V1とV2はshape、contract、status、algorithm、HMAC domainを別々に厳密検証する。一方、upgrade時に既存の認証済みcrash evidenceを見失わないよう、同じnamespaceからlegacy V1をread-onlyで認証するdual-readを残す。V1の3 gateは同名のcheckpoint purposeにだけ写像され、legacy `sealed-final-24000`をtraining-label finalizationの証拠として解釈することはない。新たに書くrecordはV2だけである。

quarantine entry、未知のactive record、認証済みstale lease、cleanup不確定の証拠は4 purposeすべてを安全側で止める。signal / process exitではactive metadataを優雅に消したとは主張せず、OSがdescriptorを解放した後も認証済みstale evidenceを残してmanual reconciliationへ送る。

## 3. training-label capabilityはproductionとtestで混ぜない

outer ownerは、common lockと`training-label-finalization-24000` leaseの両方が有効な期間だけ意味を持つopaque capabilityを作る。production registryとtest registryは別々のmodule-private `WeakMap`である。exact object identityを同期的に1回だけclaimでき、clone、proxy、foreign registry、2回目のclaimは受理しない。

production training-label ownerは、そのcapabilityを最初の`await`、registry load、key operation、stage operationより前に同期claimする。production exportはfixed dependencyだけを組み立て、dependency injectionはtest-only coreに限定する。outer owner側のmodule loadもOS lock取得とauthenticated active leaseのdurable publish後まで遅延される。

## 4. private authority chainを固定順序で確認する

capability claim後のprivate authority chainは次の順序から入れ替えない。

1. production connector registryをloadし、one-shot private claimを得る。
2. approved key enrollmentをload / claimし、registryに記録されたbytes、SHA-256、key instanceとexact matchさせる。
3. そのexpected bindingが現在もfreshであることをdeployment keyに対して再確認する。
4. registry由来のfixed stage authorizationを使ってactive stage leaseを取得する。
5. held stage / held workのread-only unkeyed preflightを行う。
6. registry由来のconsumer optionでfresh authenticated training rowsを取得し、そのcallbackの内側だけで#478 composerを呼ぶ。
7. callback完了後のconsumer postflightを受け取り、planと一緒にterminal finalizerへ渡す。

public receiptにはpath、run id、key id / instance、key material / hash、authorization MAC、content MAC、run binding、header candidate、row / position content、raw nested receiptを出さない。公開するfile evidenceはbytesとSHA-256、parents、training-record countに限定され、runnerとCLIがさらにexplicit allowlistで作り直す。

## 5. preflightが受け付けるstageはW / WT / WTR / WTRMだけ

preflightはstage directoryをheld descriptorで開き、exact entry setが次のどれかであることを確認する。

| State | Exact entries                                               |
| ----- | ----------------------------------------------------------- |
| W     | `work.jsonl`                                                |
| WT    | `work.jsonl`, `train.jsonl`                                 |
| WTR   | `work.jsonl`, `train.jsonl`, `result.json`                  |
| WTRM  | `work.jsonl`, `train.jsonl`, `result.json`, `manifest.json` |

stageはownerのprivate directory identity、workはownerのprivate regular-file metadataとsingle linkを満たす必要がある。preflightはheld work全体を読み、実測bytesとSHA-256を作り、上限内の最初の1行をcanonical JSONとしてparseする。V3 header、stage binding、training binding、fixed run policy、expected run idのshapeも確認し、preflight中のheld / named stage、held / named work、exact entry setのsnapshot equalityを最後に再確認する。

ただし、これは**認証preflightではない**。header MACの形式を見てもMACを検証せず、ここで読んだheader / `runBinding`は未認証candidateである。bytes / SHA-256も後段の認証済みscannerに対するequality inputでしかなく、caller authorityやteacher truthにはならない。production planは#478のkeyed scannerがV3 HMAC、seal、tail、完全なsnapshotとbindingを検証し、その結果がcandidateと一致した場合だけ発行される。

さらに、preflightはdescriptorを閉じてからcomposerがscanner descriptorを開くため、**preflight inodeとscanner inodeが連続して同一だったとは主張しない**。common outer lockは、このlockに従う4つのfixed workflow同士を直列化するが、同じUIDのhostile writerがlockを無視してstageを書き換えることまでは防がない。後段scannerのfresh open、認証済みfull-file checks、snapshot / pathname confirmationsがfail-closedで検出できる範囲を担う。ここにはcontinuous namespace monitoringや、確認点の間に完全復元された一時変更を必ず検出するというclaimもない。

## 6. fresh callbackの外からplanを作れない

training consumerはfresh inputをcallbackへ渡す。ownerはそのcallbackの内側でだけ、active stage lease、未認証candidate run binding、preflight実測bytes / SHA-256、fixed run idを#478 composerへ渡す。composerはfresh consumer inputを同期claimし、stage leaseを引き取り、2回のkeyed authenticated scanが完全に成功した後にだけscanner-backed opaque planを返す。

consumer callbackが正常に閉じた後でpostflight receiptが発行される。ownerはplanとそのfresh postflightをterminal finalizerへ渡す。finalizerはW / WT / WTR / WTRMのexact prefixから不足artifactだけをno-clobberで進め、terminal work scan、publication、destination reopen、content revalidationまで完了する。optimizer trainingやweight生成をこの「training-label finalization」と混同しない。

## 7. failureとcleanup ownershipを曖昧にしない

stage leaseとplanのcleanup ownerは進行点で切り替わる。

- composerを呼ぶ前に失敗した場合、ownerがstage leaseをcloseする。
- composer呼び出し後は、composerまたは発行されたplanがstage leaseを所有する。
- plan発行後、consumer / postflight側で失敗した場合、ownerがplanをdiscardしてから返す。
- finalizerを呼んだ後はfinalizerがplanをterminalに所有し、ownerはdouble cleanupしない。

公開errorの可変diagnostic facetはphase、publication may-have-occurred、lease may-remain、cleanup failure count、retry dispositionだけを保守的に投影する。publication後またはcleanup不確定ならfresh retry可能とは扱わず、publication / lease reconciliationを要求する。outer ownerでoperation boundaryを越えた失敗はactive leaseを成功cleanupしたと扱わず、lockを解放して認証済みstale evidenceを残す。成功時だけactive lease removal、retired evidence、directory sync、final namespace checkをlock内で終え、その後にlock descriptorを閉じてfilesystem / lifetime-lock処理を終える。return前の`finally`ではin-memory secret bufferをzeroizeし、lifecycle handler除去も再確認する。

## 8. CLIはNode 22.13.0固定・zero argument・caffeinate付き

package scriptは`/usr/bin/caffeinate -dimsu`の下でNodeを起動し、長いfinalization中のsleepを抑止する。CLIは`process.argv.length === 2`、つまり追加argumentなしを要求し、runtimeはexact `v22.13.0`だけを受理する。argvとruntimeを検査してからrunnerをlazy-loadし、runnerもzero-argument fixed outer operationだけを呼ぶ。

成功はsanitized JSON 1行をstdoutへ出す。失敗はnonzero exitを設定してsanitized JSON 1行のstderr出力を試み、stderr write failureが起きてもnonzero statusは維持する。unknown failureやmalformed nested receiptを楽観的なsafe retryへ変換しない。stdout write failureを成功として扱わず、raw owner / outer / finalizer receipt、path、identity、MAC、row contentを出力しない。CLI自身が別のgraceful signal cleanupを約束するのではなく、outer ownerのsignal policyがlock解放後もstale evidenceを保存する。

## 9. local validationはCOMPLETE、GitHub gateはPENDING

検証済みimplementation / test revisionは`871841ad35dd5e91b97a73b5e63707dbe8673a4e`である。production実装を対象にした独立security reviewはP0 / P1 / P2 / P3すべて0、merge-blocking finding 0で完了した。推測値ではなく、`/usr/bin/time -l`で得たwall time、maximum RSS、swapをmachine evidenceへ記録した。

| Validation                              | Status   | Result                                   | Duration   | Maximum RSS   |
| --------------------------------------- | -------- | ---------------------------------------- | ---------- | ------------- |
| focused owner / outer / runner / CLI    | COMPLETE | 6 files / 134 tests passed               | 2.97 s     | 333,479,936   |
| related authority / scanner / finalizer | COMPLETE | 7 files / 97 tests passed                | 300.11 s   | 767,770,624   |
| TypeScript                              | COMPLETE | exit 0                                   | 3.18 s     | 1,171,046,400 |
| Prettier                                | COMPLETE | 17 files passed                          | 1.17 s     | 191,102,976   |
| scoped / full ESLint                    | COMPLETE | scoped 0/0; full 0 errors / 157 warnings | 29.30 s    | 1,834,876,928 |
| full Vitest                             | COMPLETE | 161 files / 2,911 tests passed           | 310.96 s   | 2,383,593,472 |
| production build                        | COMPLETE | 193 / 193 static pages; exit 0           | 29.38 s    | 2,616,852,480 |
| ML stdlib                               | COMPLETE | 58 / 58 passed                           | 0.49 s     | 64,913,408    |
| npm audit                               | COMPLETE | 0 vulnerabilities                        | 0.56 s     | 133,562,368   |
| GitHub CI / review                      | PENDING  | `0e59d10`: 4 / 4 pass; unresolved 0      | 15m13s max | GitHub runner |

中間結果も隠していない。最初のdefault full runは末尾がfull lint / buildと重なり、161 files中159、2,911 tests中2,909がpassした。1件はV2 recordが正しく`purpose`を書いているのに旧V1の`gate`を期待したtest漏れで、`a95760b`で修正し単独16 / 16を確認した。もう1件はreal-child stable-WASM初期化がtest-only 30秒watchdogを負荷下で超えたものだった。直後の単独実行は53 / 53成功し、本番watchdogは元から120秒である。このsemantic invariance testだけstartupを120秒、1 / 2 / 3-worker構成を含むtest全体上限を180秒へ合わせ、search watchdog 30秒、worker / production実装、retryなしは維持した。負荷中の単独再確認53 / 53と、8-worker final full 2,911 / 2,911が成功した。

ready PR #479のevidence head `0e59d10996ed8be6f818fa2e4258c05615297ff2`では、Test and build 15分13秒、Darwin 2分48秒、E2E 3分15秒、npm audit 12秒の4 checksがすべて成功し、actionable unresolved review threadは0だった。Gemini / Copilotはreview生成自体に失敗したという非actionable通知を1件ずつ残している。このGitHub evidenceを書き込むdocs-only headではchecksを再実行するため、表のPENDINGはその最終再走だけを指す。再走もgreenかつunresolved 0になった後、通常方針どおりregular merge commitを使う。live operationはそのmergeとは別gateにする。

## 10. production counterとlive evaluatorはすべて0のまま

このcandidateが追加するのはproduction-capableなowner / runner / CLIであり、それを実環境で実行した証拠ではない。この変更に数えられる実registry provision、実production work observation、production CLI / owner invocation、real teacher parent、finalized label、optimizer run、candidate weight、formal A/B game、external-calibration game、live activationはすべて0である。synthetic fixtureやunit testをreal work / labelへ数えない。

したがって、現在のlive weightと`runOp1`は不変である。Elo、段位、高段安定、playing strengthについて新しいclaimはない。

## 11. merge後も別のoperational gateを順番に通す

このowner / CLI PRがmergeされ、CI / review evidenceが閉じた後にだけ、別のoperational gateで次を行う。

1. 既存のfixed verifier worktreeを証拠済みrevision `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`へ整合させ、clean source / pinned-artifact closureとruntimeを再検証する。
2. production registryをprovisionし、approved / current bindingを再確認する。
3. read-only preflight後、100-parent gateを実行してreceiptを保存する。
4. 500-parent gateを実行してreceiptを保存する。
5. sealed 24,000-parent teacher gateを実行してreal workとterminal receiptを作る。
6. 今回のzero-argument owner / CLIでtraining-label finalizationを実行し、artifact bytes / SHA-256とcleanup receiptを保存する。
7. その後にretraining、候補選抜、192 color-swapped pairs / 384 gamesのformal A/B、200 gamesのexternal calibration、安全なlive gateへ進む。

各段階は前段の実測証拠を入力にし、失敗・stale lease・quarantine・publication不確定を飛び越えない。weightの採用とlive activationは棋力とrollbackの証拠が揃うまで行わない。
