# Floodgate v7 外部supervisor / verifierのsource境界

> この変更は、外部trust rootの署名付きhandoff、独立verifier、activation rollback防止、process identity、将来のruntime launch policyをSwift sourceとtestで定義する。ただし、2つのexecutable targetはprotocol libraryへlinkせず、入力を一切読まず、常にexit 78・stdout/stderr 0 byteで停止する。root install、production key、production activation head、実process起動、production inspectionはまだ無いため、運用判断は引き続き**UNAVAILABLE / STOP**である。English version: [blog-shogi-floodgate-v7-external-supervisor-verifier-source.en.md](./blog-shogi-floodgate-v7-external-supervisor-verifier-source.en.md)

## 1. 今回できたもの

| 境界               | source / testで固定したこと                                                                                                                             | まだ無いもの                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| authority record   | Ed25519で署名されたenrollment / activation envelopeをverify-onlyで再生                                                                                  | production authority public keyのroot-owned選択、private key             |
| anti-rollback head | authority key ID、最新activation sequence/envelope、active enrollmentのenvelope/recordを148-byte canonical recordで一致必須化                           | root-owned create-only storageとfresh load                               |
| source manifest    | approved commit/tree、repository closure、bundle/JXA/Node、3実行役のartifact/code identity、役割鍵、policy digest                                       | filesystemからこれらを独立観測する実装                                   |
| process identity   | PID/PPID/EUID、unique ID、start time、audit token、親identity、whole-file、CodeDirectory、designated requirement、held executable、anonymous FD channel | audit token取得、no-follow open、code-sign検査の実装                     |
| handoff            | signed challenge → verifier receipt → one-shot attestation、最大30秒、壁時計とmonotonic clock、single use                                               | system clock / CSPRNG / IPCへの接続                                      |
| runtime policy     | supervisorがpinned Nodeを直接起動し、JXAは認証済みdormant sourceのまま実行しない、というpolicy                                                          | argv/cwd/env/install policyのcanonical preimageとprocess-group lifecycle |
| executable targets | supervisor / verifierの名前とfixed STOP                                                                                                                 | operational wiring、sign、notarize、package、install                     |

実装source revisionは`0f5446b51908b419cb40372cc1a59e7dc25dbef0`、baseはPR #498のregular merge `87bfcae6e35e03ed37a91b860417b9b943180ee0`である。

## 2. authorityの「署名済み」と「現在」を分ける

署名が正しいだけではcurrent stateとは限らない。攻撃者が新しいrevokeやrotationを配列の末尾から落とし、古いsigned `activate` prefixだけを渡せば、そのprefix自体の署名とchainは正しいからである。

そこで`ExpectedActivationHeadV1`は次をexactに固定する。

- authority signer key ID
- latest activation sequence
- latest signed activation envelope SHA-256
- active signed enrollment envelope SHA-256
- active enrollment record SHA-256

supervisorとverifierはそれぞれ独立に署名chainを最初から再生し、最後のsequence、activation envelope、active enrollment envelope、active enrollment recordがすべてheadへ一致する場合だけ続行する。testでは、sequence 2のsigned revokeをcurrent headとしながらsequence 1までに切り詰めた入力に加え、同じenrollment IDを持つ別のauthority-signed enrollment recordも拒否した。receipt verificationでもenrollment record digestを再確認するため、challenge発行後に有効期間だけを差し替えてもfail closedになる。

さらにauthority、supervisor attestation、verifier attestationの3 key IDはpairwise distinctでなければならない。revocation authorityとruntime attestation authorityを同じ鍵へ畳み込むprovisioning mistakeをfail closedにする。

ただし、repositoryやcallerから渡されたheadを「trusted」と呼ぶことはできない。productionで使うには、headとauthority public keyをroot-owned / create-onlyに保存し、freshに読み、rollbackできないことを別PRで実装しなければならない。今回のtest keyは毎回生成されるephemeral keyだけであり、production key materialではない。

## 3. verifierはsupervisorの主張を信用し直さない

独立verifierはchallenge署名だけでなく、次を自分の入力から再検査する。

- supervisorのwhole-file SHA-256
- CodeDirectory SHA-256
- designated requirement SHA-256
- held executable identity SHA-256
- supervisor PIDとtarget PIDの一致
- supervisor process identityとtarget identityの一致
- verifierがsupervisorのdirect childであること
- verifier artifact / code identity / anonymous FD channel
- repository observationの全closure field、UID、PID、target identity
- approved commit/tree、clean repository、git common/object directory、alternates / replacement object不在
- current activation head

reviewでは、正しいsupervisor keyを持つ別artifact、targetとsupervisorを分離したchallenge、正しいverifier keyで署名したbad observation receiptをそれぞれ作るadversarial testを追加した。いずれも拒否される。

`VerifierReceiptV1.verify`と`OneShotAttestationV1.verify`はpartial chainだけを安全そうに呼べないようinternalにした。公開されたfull-chain入口は、verifier receipt issuance、stateful supervisor session、final one-shot consumerである。

## 4. 最大30秒でもheadを最後まで再確認する

challengeはwall-clockとmonotonic-clockの両方で最大30秒であり、receiptとattestationはそのexpiryを超えられない。sessionは時計のrollbackを拒否し、同じchallenge / receiptを2回attestationへ変換しない。consumerはattestation ID、challenge、receipt、child process identityをatomicに一度だけ消費する。replay digestは署名済みexpiryまでだけ保持して後続操作前に削除し、有効時間内も固定上限を超えたらfail closedにしてmemoryを有界化する。

challengeは148-byte head全体のSHA-256を署名対象へ含める。さらにcurrent expected headはreceipt verification、attestation issuance / verification、final consumptionでもcanonical digestを完全一致で再確認する。receipt発行後にheadが新しいrevokeへ進んだ場合だけでなく、authority key ID、sequence、選択enrollmentのいずれかだけが変わった場合も、30秒の残り時間を待たず古いtranscriptは拒否される。

## 5. runtime launch policyは実装ではない

`RuntimeLaunchPolicyRecordV1`は将来のarchitectureを次のように固定する。

1. external supervisorがpinned Node imageを直接起動する。
2. JXA launcherはsource closureへ含めて認証するが、dormantのまま実行しない。
3. runtimeはroot-ownedでwritable ancestorを持たない。
4. no-followで保持したruntime identityを使い、suspended spawn後にactual imageを再検査してからresumeする。
5. new process group、anonymous attestation FD、bounded stdout/stderrを使う。
6. caller arguments、caller environment、shell、intermediary launcher processを禁止する。

これは220-byteのpolicy recordであり、process spawn実装ではない。またfixed argv、working directory、environment、runtime-install policyは現時点ではopaque digestで、独立実装が同じdigestを再計算するcanonical preimage recordがまだ無い。これを定義するまでoperational wiringへ進めない。

現在利用者所有のNode path/versionを知っていても、そのbytes、所有者、ancestor、CodeDirectoryをこの境界では認証していない。したがって、そのNodeをproduction-safeとは扱わない。既存のtwo-file install policyもNode runtimeをinstall対象に含めない。

## 6. 2つのtargetは構造的なSTOP

`floodgate-v7-trust-root-supervisor`と`floodgate-v7-trust-root-verifier`はSwift package上に存在するが、両targetのdependencyは空である。sourceはDarwinの`_exit(78)`だけで、protocol library、Foundation、CryptoKit、NSLockをlinkしない。

実測では、任意argv、任意environment、stdin、cwdを与えても両方がexit 78、stdout 0 byte、stderr 0 byteだった。release binaryのdynamic dependencyは`libSystem`とweak `libswiftDarwin`だけである。このlocal buildはsigned / notarized / installed release artifactの証拠ではない。

## 7. 実測とnonclaim

Xcode 15.3 / Swift 5.10でSwift test **44 / 44 PASS**、release build PASS、fixed STOP integration PASSだった。replay retention 6 testsはThread Sanitizer付きでもPASSし、決定的clock-race testは20回反復して全てPASSした。canonical recordのround-trip/count、signature mutation、wrong role key、history truncation、same-ID enrollment substitution、process/code/channel substitution、clock rollback、invalid receipt retention poisoning、expiry eviction、fixed replay capacity、concurrent clock ordering、observation drift、one-shot replayを含む。

今回の実行回数は次のとおりである。

- production inspector: 0
- production authority/head load: 0
- root install: 0
- private clean-room copy: 0
- teacher generation: 0
- training / candidate selection / formal A/B: 0
- live weight activation: 0

したがって、この変更は棋力証拠を増やさず、ライブ評価関数も変更しない。machine-readable recordは[floodgate-v7-external-supervisor-verifier-source-2026-07-17.json](./data/floodgate-v7-external-supervisor-verifier-source-2026-07-17.json)に分離した。

## 8. 次のgate

次のPRでは、少なくとも次を別々にreviewする。

1. root-owned authority public keyとactivation headのcreate-only storage / fresh load / rollback防止
2. fixed argv / cwd / environment / runtime install policyのcanonical preimage
3. fixed test keyによるchallenge / receipt / attestationのgolden bytes/digest（将来のcross-process parser用）
4. actual filesystem / git / code-sign / audit-token observation
5. held runtime image、suspended spawn、process group、TERM→KILL→reap、bounded output
6. signed/notarized packageとroot install
7. zero-argument read-only production inspection

これらがreview、CI、regular mergeを通るまで、production recoveryは**UNAVAILABLE / STOP**のままである。
