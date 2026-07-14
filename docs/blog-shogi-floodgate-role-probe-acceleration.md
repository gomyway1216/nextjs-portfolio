# Floodgate full-bundle verifierの7時間51分を縮める

> [deployment-key instance enrollment](./blog-shogi-floodgate-v7-deployment-key-instance-enrollment.md)を閉じても残っていた実測7時間51分20秒のfull-bundle verifierを、巨大blocked Setのcandidateごとのcopy・sort・serialize・hashを除く共有samplerへ置換した。PR #460はreview / CI後にregular mergeした。最初の実データrunは、retry済みgameをhistorical pre-materialization cap counterへ6回再加算した1-field accounting不一致を448.86秒でfail-closed検出した。保存済み3 artifactから再実行できるnon-gating診断では、allocation 236,504,991 bytesと全game / parent / protected-ID digestが不変だったため、retryを保ったままcounterだけv1互換に修正した。clean revision `e8a9197`のproduction full verifierは**17分25.52秒、27.05x、96.30%短縮、exit 0、全9 bundle files exact**で60分gateを通過した。このexit-0 runが採用authorityであり、診断単独ではない。real teacher、training、weight、live evaluation、対局、棋力のclaimはまだ生じない。English version: [blog-shogi-floodgate-role-probe-acceleration.en.md](./blog-shogi-floodgate-role-probe-acceleration.en.md)

## 1. 現在地

| 項目                               | current status         | 意味                                                  |
| ---------------------------------- | ---------------------- | ----------------------------------------------------- |
| 旧full-bundle verify               | 7:51:20 / 28,280.32 s  | accepted historical measurement                       |
| role-lock replay 1回               | 3:54:19.5              | bundle verifierがexact 2回呼ぶ                        |
| role-lock由来のwall-time           | 約99.4%                | bundle固有差分は約2分41秒                             |
| peak RSS / average CPU             | 6.23 GB / 約1.06 cores | multi-process複製ではなくalgorithmを直すべきevidence  |
| optimized sampler source           | merged / PR #460       | global Setをiterate / clone / mutateしない            |
| first optimized real verify        | 448.86 s / exit 1      | accounting 1 fieldだけ1930 != 1924                    |
| stored-input diagnostic replay     | 193.35 s / non-gating  | allocation 236,504,991 bytes / SHA exact              |
| v1 accounting compatibility fix    | `e8a9197`              | retry / caps維持、既materialized retryを再countしない |
| optimized real full verify         | 1,045.52 s / exit 0    | 全9 files exact / stderr 0 / swap 0                   |
| wall speedup / reduction           | 27.05x / 96.30%        | 7:51:20から17:25.52                                   |
| max RSS                            | 5.63 GB                | 旧6.23 GBから9.65%減                                  |
| focused source + diagnostic tests  | 4 files / 45 PASS      | strict decode、retry、cap accounting、replay、parity  |
| direct related suites              | 10 files / 167 PASS    | role-lock / bundle / diagnostic / CLI / result        |
| full Vitest regression             | 121 files / 2,170 PASS | 8 workers / 151.19 s                                  |
| Python stdlib                      | 58 / 58 PASS           | py_compile + unittest                                 |
| TypeScript                         | PASS                   | current local diff                                    |
| ESLint / targeted format / diff    | PASS                   | role-lockの既存whole-file driftは除外                 |
| production build / npm audit       | PASS / 0 vulns         | full lintは0 errors / 既存157 warnings                |
| independent compatibility review   | PASS                   | P0 = P1 = P2 = 0、pair coverage指摘も解決             |
| algorithm-only 60-minute gate      | PASS                   | worker follow-up不要                                  |
| teacher / training / weight / live | 0 / 0 / 0 / unchanged  | 棋力evidenceではない                                  |

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

## 6. Retryは残し、historical counterだけを互換にする

samplingはlocal overlayへだけ追加する。23 parentsまで選んでquota failureになってもglobal Setは不変で、intra-game parent-child / child-child transpositionはglobal / localのOR membershipでrejectする。

failureはblocked Setが増えるほど単調ではない。early-ranked hub parent Hがleaves L1 / L2と衝突すると、Hを選ぶ集合Sでは23 parentsで失敗する。一方、後のroleでHがglobal blockされたsuperset Tでは、HをskipしてL1 / L2と22 disjoint fillersを選べる。このためretry自体は必要であり、adversarial fixtureはfirst roleで失敗したcandidateがsecond roleでexact 24 parentsを得てfinal pure oracleとfull projection一致することを固定する。

最初のreal runはretry ruleではなくhistorical accounting compatibilityで停止した。semantic-rejected gameのlater-role encounterは12 events / 11 unique gamesだった。6 events / 6 unique gamesはidentity capで止まり、残る6 reprobe / re-rejection eventsは5 unique gamesに属し、pair-cap stopは0だった。同じ1 gameが`fresh_selection`と`training`の両方で再拒否されたため、event数とunique game数は同じではない。selection、parents、protected IDs、236,504,991-byte allocationはexact一致したが、すでにmaterialize済みのidentity-cap 6 eventsを`skipped_before_materialization`へ再加算したため、manifestの`accounting.identity_cap_role_checks_skipped_before_materialization`だけが`1924`から`1930`へ変わった。

compatibility fixはroleごとのidentity / pair capを必ず適用し、non-monotone retryも残す。ただし`wasSemanticRejected`がtrueならcandidateはすでにmaterialize済みなので、historicalな“before materialization” counterへ再加算しない。real dataで差が出たidentity capと、将来の対称性を守るpair capの両方をdeterministic regression fixtureで固定した。

## 7. Worker follow-upは不要になった

verifier全体をprocess単位で4 / 8 / 10 / 12並列にすると、旧peak RSS 6.23 GBから単純計算で約24.9 / 49.8 / 62.3 / 74.8 GBとなり、48 GB machineには不適切である。そこで先にalgorithmic wasteを除いた。

結果は1,045.52秒で60分gateを大幅に通過したため、worker implementationは作らない。将来入力規模が変わり再びparent semanticsが支配的になった場合だけ、SFENとsmall parent identityだけをpersistent workerへ渡し、global selection / ordered commit、raw verification、filesystem closureをmain threadに残す案を再検討する。

## 8. Validationとreal full-run evidence

PR #460ではfocused 40、related 364、full 2,165 tests、Python 58 tests、production build、TypeScript、full lint、npm audit、review / CIを通過した。compatibility fixとchecked-in diagnosticは4 focused files / 45 tests、direct-related 10 files / 167 tests、full 121 files / 2,170 testsをPASSし、full runは8 workers / 151.19秒だった。Python 58 tests、TypeScript、scoped ESLint、0 errors / 既存157 warningsのfull lint、0 vulnerabilitiesのnpm audit、format / diff checkもPASSし、独立reviewsはP0 / P1 / P2すべて0である。

最初のreal attempt `11c4ce7`は448.86秒でexit 1となりfail closedした。revision `a13365d`の[checked-in diagnostic](../ml/diagnose-floodgate-role-lock-accounting.ts)をclean detached worktreeで実行すると、193.35秒、exit 0、swap 0で、保存済みmaterialized input / allocationはbyte-exactに再現した。[diagnostic status](./data/floodgate-role-lock-accounting-diagnostic-a13365d-status.json)、[raw output](./data/floodgate-role-lock-accounting-diagnostic-a13365d-output.json)、[time](./data/floodgate-role-lock-accounting-diagnostic-a13365d-time.txt)は、12 encounters / 11 unique games、identity / pair cap stops 6 / 0、6 reprobes / 5 unique games、1-field modeled counterfactualを固定する。これはderived non-gating診断であり、旧`11c4ce7` executableの再実行でもproduction artifactの独立承認でもない。exit 0のfull verifier、raw output / time、artifact identityが採用authorityである。失敗runのstdout 0 bytes、worktree clean、失敗後もbundle manifestが7,202 bytes / SHA-256 `2bafc01f...e3cf9`だった点はoperator observationとしてのみ記録し、採用判定には使わない。

fix後のreal full verifyは2026-07-14 16:01:28Zから16:18:54Zまで実行した。

| metric                |      historical | optimized `e8a9197` | change              |
| --------------------- | --------------: | ------------------: | ------------------- |
| wall                  |     28,280.32 s |          1,045.52 s | 27.05x / -96.30%    |
| user CPU              |     28,376.91 s |          1,040.35 s | -27,336.56 s        |
| system CPU            |      1,564.28 s |             75.68 s | -1,488.60 s         |
| maximum RSS           | 6,230,917,120 B |     5,629,476,864 B | -9.65%              |
| peak memory footprint | 5,380,204,472 B |     5,079,357,328 B | -5.59%              |
| swaps / block I/O     |           0 / 0 |               0 / 0 | no regression       |
| exit / stderr         |    0 / accepted |         0 / 0 bytes | fail-closed success |

raw-lock manifest、role-lock manifest、legacy exclusion、bundle 9 filesはすべてhistorical bytes / SHA-256とexact一致した。さらに別のclean detached worktreeで2026-07-14 16:35:31Zから16:53:41Zまでconfirmationを実行した。こちらも`e8a9197`、exit 0、1,089.52秒、swap / block I/O 0、全artifact exactで、実行前後のtracked status captureはともに0 bytesだった。2つのsuccessful stdoutは`repository_root`を除けば同一である。[summary evidence JSON](./data/floodgate-role-bundle-verify-acceleration-2026-07-14.json)、[accepted raw output](./data/floodgate-role-bundle-verify-e8a9197-output.json)、[accepted time](./data/floodgate-role-bundle-verify-e8a9197-time.txt)、[confirmation status](./data/floodgate-role-bundle-verify-e8a9197-confirmation-status.json)、[confirmation raw output](./data/floodgate-role-bundle-verify-e8a9197-confirmation-output.json)、[confirmation time](./data/floodgate-role-bundle-verify-e8a9197-confirmation-time.txt)、[failed-attempt stderr / time](./data/floodgate-role-bundle-verify-11c4ce7-failed-stderr-time.txt)に固定した。

raw filesには実行環境を固定するローカル絶対path（ユーザー名、worktree / data / bundle root）が含まれる。既存protocol evidenceと同じnon-secret execution-provenance metadataであり、credential-like valueは検出されなかった。raw bytes / SHA-256を保つためredactionしていない。

事前のunder-60-minute、artifact exactness、no-swap gatesをすべて通過したためalgorithmic accelerationを採用し、worker follow-upは行わない。事前ETA 35〜60分は保守的で、実測17分25.52秒はその下限より速かった。

## 9. 現在のnonclaims

- optimized real full-verifier attempts / accepted: **3 / 2**（1件はfail closed、1件はclean confirmation）
- real role-bundle consumer callbacks: **0**
- production key provision / inspection / approved enrollment: **0 / 0 / 0**
- 100 / 500 / 24,000 gates: **0 / 0 / 0**
- network requests / teacher or candidate scores read: **0 / false**
- teacher labels / optimizer steps / candidate weights: **0 / 0 / 0**
- formal games / rating / stable high-dan evidence: **0 / not established / not established**
- production weight overwrite / live activation: **unchanged**

exact artifact parityが証明するのはverifierが既存データを保存したことだけであり、label qualityやmodel strengthではない。

## 10. 次のexecution order

1. compatibility fix、failed / successful raw evidence、日英記事をready PRへまとめる。
2. focused / related / full CIとreviewを通し、regular mergeする。
3. `1,045.52 < 3,600`、9 / 9 exact、swap 0なのでworker PRは作らない。
4. merge後はfull-verifier blockerをclosedとし、入力またはverifier codeが変わらない限り同じ高cost runを繰り返さない。
5. production key provision / inspection / approved enrollmentは別の明示承認されたoperational stepとして扱う。
6. key pinning後に100 → 500 → 24,000 connector gatesへ進み、その後だけteacher、training、selection、formal A/B、external calibrationを実行する。全adoption gateを通るまでlive weightsは変えない。

この高速化は同じ入力を短時間で検証するdata-integrity / performance evidenceであり、評価関数が強くなったevidenceではない。
