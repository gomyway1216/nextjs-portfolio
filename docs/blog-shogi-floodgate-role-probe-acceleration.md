# Floodgate full-bundle verifierの7時間51分を縮める

> [deployment-key instance enrollment](./blog-shogi-floodgate-v7-deployment-key-instance-enrollment.md)を閉じても、production connectorの前には実測7時間51分20秒のfull-bundle verifierが残る。本稿は、2回のrole-lock replayがその約99.4%を説明すること、その内部では最大約297万件へ成長するblocked position ID集合を候補ごとにcopy・sort・serialize・hashする2度目のone-game probeが支配的な除去可能costであることをprofileし、同じparent selectionを巨大blocked Setのartifact生成なしで行う共有samplerへ置換する実装記録である。strict zero-quota normalizationは残す。source、focused 40 tests、再現可能benchmarkはlocal PASS、ready PR #460の重複2 review commentsは修正済みで、optimized production full verifierは**0**である。real teacher、training、weight、live evaluation、対局、棋力のclaimは生じない。English version: [blog-shogi-floodgate-role-probe-acceleration.en.md](./blog-shogi-floodgate-role-probe-acceleration.en.md)

## 1. 現在地

| 項目                               | current status         | 意味                                                 |
| ---------------------------------- | ---------------------- | ---------------------------------------------------- |
| 旧full-bundle verify               | 7:51:20 / 28,280.32 s  | accepted historical measurement                      |
| role-lock replay 1回               | 3:54:19.5              | bundle verifierがexact 2回呼ぶ                       |
| role-lock由来のwall-time           | 約99.4%                | bundle固有差分は約2分41秒                            |
| peak RSS / average CPU             | 6.23 GB / 約1.06 cores | multi-process複製ではなくalgorithmを直すべきevidence |
| optimized sampler source           | implemented            | global Setをiterate / clone / mutateしない           |
| focused source + benchmark tests   | 40 / 40 PASS           | strict decode、rollback、retry、parity、harness      |
| related suites                     | 14 files / 364 PASS    | role-lock / bundle / consumer / connector            |
| full Vitest regression             | 120 files / 2,165 PASS | 8 workers / 146.93 s                                 |
| Python stdlib                      | 58 / 58 PASS           | py_compile + unittest                                |
| TypeScript                         | PASS                   | current local diff                                   |
| ESLint / targeted format / diff    | PASS                   | role-lockの既存whole-file driftは除外                |
| production build / npm audit       | PASS / 0 vulns         | full lintは0 errors / 既存157 warnings               |
| independent final review           | PASS                   | 2 reviews / P0 = P1 = P2 = 0                         |
| ready PR #460 review               | 2 duplicate / fixed    | protected IDsを1-passでunion check                   |
| optimized production full verify   | 0                      | real bundleではまだ未実行                            |
| teacher / training / weight / live | 0 / 0 / 0 / unchanged  | 棋力evidenceではない                                 |

## 2. ボトルネックはcore数不足ではなく二次的な再計算だった

historical verifyはwall `28,280.32 s`、user CPU `28,376.91 s`、system CPU `1,564.28 s`、block I/O 0だった。平均CPUは約1.06 coreである。role-lock full replay 1回の実測は3時間54分19.5秒で、bundle verifierはsource closureを保つため同じrole-lockを2回独立再現する。2回分だけで7時間48分39秒となり、full-bundle totalの約99.4%を説明する。

role-lockは1,825 gamesをlazy materializeし、1,619 gamesをfully materializedに保ち、219 unique gamesでsemantic / parent-quota rejectionを観測した。旧経路は各tentative gameについて次を実行していた。

1. current `reservedProtectedIds`をarrayへ全copyする
2. one-game用に`allocateFloodgateRolesPure`全体を呼ぶ
3. legacy IDsをSetへcopyする
4. canonical input用に全IDをUTF-8 bytewise sort / JSON serialize / SHA-256する
5. sampling用にblocked Setをさらにcloneする
6. output summaryでも巨大ID集合をsort / digestする

selected 1,400 gamesだけでも累積blocked-ID走査は約20.76億件、最低2回のsort対象は約41.53億elementsになる。`compareBytewise`は比較ごとにBufferも生成する。これはcoreを増やす前に消すべき仕事である。

## 3. Reproducible synthetic profile

Apple M4 Pro、48 GB、Node `v22.13.0`でchecked-in harnessを実行した。fixtureはcheap semanticsの32 candidate parentsからexact 24 parentsを選ぶ。blocked Set構築は計測外、3回warm-up、各path 4 raw samples、順序を交互にし、explicit GCはtimerの前、表はmedianである。removed pathで消えたsampler Set cloneはbaseline内で1回明示的にemulateし、current full allocatorが残るarray conversion / canonicalization / digestを実行する。

| blocked IDs | emulated removed full probe | new sampler |   speedup | exact parent parity |
| ----------: | --------------------------: | ----------: | --------: | ------------------: |
|           0 |                    3.439 ms |    2.636 ms |     1.30x |                true |
|      10,000 |                   48.619 ms |    3.596 ms |    13.52x |                true |
|      50,000 |                  258.069 ms |    3.574 ms |    72.22x |                true |
|     100,000 |                  554.174 ms |    3.693 ms |   150.06x |                true |
|     250,000 |                1,614.940 ms |    3.782 ms |   427.00x |                true |
|   1,000,000 |                8,251.390 ms |    3.744 ms | 2,203.69x |                true |

全6 sizesでparent projection SHA-256は`8a7bee9b...40cb3f0`と一致した。コマンドは`npm run shogi:floodgate-role-probe-benchmark -- --sizes 0,10000,50000,100000,250000,1000000 --samples 4`、全raw samplesとmethod / runtime / fixture hashesは[data JSON](./data/floodgate-role-probe-benchmark-2026-07-14.json)に保存した。このraw dataはPR reviewの重複指摘でglobal / local membershipを1-pass union checkにまとめた後に再計測した。このparityはcurrent full-artifact wrapperとdirect shared sampler間であり、2つの独立algorithm間ではない。独立authorityはfinal pure oracleとintegration testsに残る。また、これはfull verifier ETAそのものではない。

先行調査のrandom-order syntheticでは250,000 IDsの1.525秒中、2回のsortだけで1.412秒、92.6%だった。これとworker数比較はsource command / raw logをrepositoryに保存しないexploratory one-shotで、gating evidenceには使わない。

## 4. 置換する境界

new `sampleFloodgatePlannedGameParentsForRoleLock(game, blockedSet)`は次を固定する。

- productionと同じseed、phase / fill rank domains、6 / 12 / 6 quotas、exact 24 parents
- untrusted gameを`decodePureGames`と同じstrict boundaryで再captureする
- parent SFENをrules-completeに展開し、parentと全legal childrenをprotected groupにする
- `globalBlocked.has(id) || localOverlay.has(id)`だけでcollisionを判定する
- tentative sampling中はglobal Setをiterate、clone、mutateしない
- 24 parentsが揃った場合だけcallerがexact selected protected IDsをglobal Setへcommitする
- multi-million blocked Setに結びついた2度目のcanonical artifact、bytes、SHA、summaryを作らない

`normalizeMaterializedGame`は、untrusted callback outputのstrict capture / canonical snapshotのため、empty role countsとempty legacy IDsのzero-quota pure allocationを候補ごとに一度残す。これはmulti-million blocked Setを持たない。final `allocateFloodgateRolesPure`も削除しない。全materialized gamesからcanonical input / outputを従来どおり一度生成し、manual lazy resultとgame IDだけでなく、identities、全parent fields、phase / sampling stage、position ID、protected-ID listsまで`isDeepStrictEqual`で比較する。historical artifact bytes / SHAのauthorityはこのfinal oracleに残る。

## 5. strict decodeをserialize removalの外へ逃がさない

旧probeではcanonical JSONが最後の拒否を担っていた値がある。特に`Number.isSafeInteger(-0)`はtrueなので、`ply: -0`とrole count `-0`はserialize時まで残れた。new pathは次をsemantic sampling前に拒否する。

- `ply`とcountsのnegative zero、negative、non-safe integer
- top-level / nested Proxy（trapを呼ばない）
- accessor、symbol、hidden / extra score-like key、custom prototype
- sparse array、duplicate parent ID / ply
- wrong game / parent occurrence binding、invalid identity
- noncanonical SFEN / move-number mismatch

typed TypeScript objectはtrusted evidenceではない。new helperの引数型よりruntime captureがauthorityである。

## 6. Failed candidateはglobal stateを汚さない

samplingはlocal overlayへだけ追加する。23 parentsまで選んでquota failureになっても、global Setはbyte-for-byte不変でなければならない。intra-game parent-childまたはchild-child transpositionもglobal / localのOR membershipでrejectする。

さらにfailureはblocked Setが増えるほど単調ではない。early-ranked hub parent Hがtwo leaves L1 / L2と衝突すると、Hを選ぶ集合Sでは23 parentsで失敗する。しかし後のroleでH自体がglobal blockされるsuperset Tでは、HをskipしてL1 / L2と22 disjoint fillersの24 parentsを選べる。このためsemantic failureを全role共通のpermanent rejectにしてはならない。

adversarial integration fixtureは次を証明する。

- candidate Cはfirst roleでhubをgreedy選択し23 parentsで失敗
- predecessor game Bがfirst roleに選ばれ、Bのprotected setとCのcandidate semantic groupsとの唯一のoverlapがlegal child H
- Cはsecond roleで再試行され、exact 24 parentsで成功
- materializationはC / Bの2回だけで、Cのvalidated snapshotをreuse
- final pure oracleはfirst role B、second role Cのfull projectionと一致

## 7. Workerはfollow-upに分離する

current verifierをprocess単位で4 / 8 / 10 / 12並列にすると、historical peak RSS 6.23 GBから単純計算で約24.9 / 49.8 / 62.3 / 74.8 GBとなり、48 GB machineには不適切である。

algorithmic fix後もparent semanticsが支配的なら、persistent worker_threadsへ渡すのはSFENとsmall parent identityだけにする。raw path、key、23 MB raw manifest、236 MB allocation、multi-million blocked Setはworkerへ渡さない。global selection / ordered commit、raw verification、filesystem closureはmain threadに残す。exploratory ad-hoc one-shotでは8 workersが6.51x / peak約624 MB、10 workersは6.65x / 763 MB、12 workersは6.51x / 898 MBだった。source command / raw logは保存されていないため、これは8 workersをfollow-upの出発点にするdesign clueであり、採用判定やreproducible evidenceではない。follow-upでは改めてchecked-in harnessを作る。

## 8. Validationとstop conditions

focused 40 testsは、new / full-wrapper parent parity、global Set non-iteration、23-parent rollback、negative zero、Proxy / accessor traps、score-like extras、sparse arrays、actual semantic transpositions、non-monotone cross-role retry、caller mutation後のsnapshot、full projection oracle、benchmark raw-sample contractを検査してPASSした。related 14 files / 364 tests、TypeScript、scoped ESLint、targeted formatting、diff checkもPASSした。`ml/floodgate-role-lock.ts`全体にはこのPRより前のPrettier driftがあり、whole-file writeは無関係な大量churnを生むため対象外とした。modified hunksと`git diff --check`はcleanである。

残るrequired evidenceは次である。

1. ready PRのreview / CIとregular merge
2. clean merged revisionからreal production full verifierを1回だけ実行し、manifest / artifact identitiesをhistorical bytesと照合
3. phase wall / CPU / RSSを記録し、algorithmic-only target **60分未満**を判定

first 12-worker full regressionは119 files / 2,163 tests中1件だけ、今回非関連のstable-proposal resume testで状態分類がずれた。同file単独は11 / 11 PASS、benchmark file追加後の低contention 8-worker full rerunは120 files / 2,165 tests全件PASSした。Python 58 tests、production build、TypeScript、full lint、npm auditもexit 0で、full lintの157 warningsは既存で0 errorsだった。full-run実測の事前ETAは中心約45分、幅35〜60分、悲観75分という推定であり、まだ計測値ではない。

real verifyが60分以上ならworker follow-upへ進む。artifact / selection parityが1 byteでもずれる、filesystem closureが弱まる、memory pressureでswapする、またはfail-closed errorが失われる場合は停止する。

## 9. 現在のnonclaims

- optimized production full-verifier executions: **0**
- real role-bundle consumer callbacks: **0**
- production key provision / inspection / enrollment: **0 / 0 / 0**
- 100 / 500 / 24,000 gates: **0 / 0 / 0**
- teacher labels / optimizer steps / candidate weights: **0 / 0 / 0**
- formal games / rating / stable high-dan evidence: **0 / 0 / not established**
- production weight overwrite / live activation: **unchanged**

## 10. 次のexecution order

1. algorithmic parity PRをfocused / related / full validationとindependent reviewへ通す。
2. ready PRをopenし、review / CIを完了してregular mergeする。
3. clean merged revisionでoptimized real full verifierを1回測る。
4. 60分未満かつexact artifact parityならworkerなしで採用する。
5. 足りない場合だけ8-worker parent-semantics PRを別に実装・検証する。
6. verifier blockerが閉じた後も、production key write / inspectionは別の明示承認まで実行しない。

この高速化は同じ入力を短時間で検証するだけであり、評価関数を強くしたevidenceではない。
