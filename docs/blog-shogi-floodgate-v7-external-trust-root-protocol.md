# repositoryより先に検証するSwift protocolをcode-onlyで切り出す — Floodgate v7

> [production recovery foundation](./blog-shogi-floodgate-v7-production-recovery-operator-foundation.md)は、検証対象のrepository codeが検証より先に実行される循環bootstrapを発見し、旧operatorのlauncher、preload、issuer、CLIを削除した。本稿の対象は、その次の境界を定義するdependency-freeなSwift protocol library `FloodgateV7ExternalTrustRootProtocol`である。ただし、これは外部trust rootそのものではない。実行物、installer、署名鍵、issuer、production entrypointは作らず、運用判断は引き続き`UNAVAILABLE / STOP`である。English version: [blog-shogi-floodgate-v7-external-trust-root-protocol.en.md](./blog-shogi-floodgate-v7-external-trust-root-protocol.en.md)

> **履歴注記:** 「executable targetなし」など以下のsurface/countは本稿revisionのsnapshotである。後続の[current source boundary](./blog-shogi-floodgate-v7-external-supervisor-verifier-source.md)は、protocolへlinkせずexit 78するfixed STOP targetだけを追加しており、production entrypointは引き続き無い。

## 1. 結論

今回切り出すのは、将来repository外へinstallするnative verifierが保持するapproved enrollmentと、そのenrollmentをactivate / revoke / rollbackする順序を表す**純粋なprotocol境界**である。目的は、trust policyを曖昧なobjectやrepository内callbackではなく、固定長・version付き・strictなcanonical bytesとして表現できるようにすることだ。

| 項目                                       | 今回の境界                                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 成果物                                     | `native/floodgate-v7-external-trust-root-protocol`のdependency-free Swift library source |
| executable / `@main`                       | なし                                                                                     |
| package script / production import         | なし / なし                                                                              |
| installer / canonical outside-repo install | なし / 未実装                                                                            |
| signer / issuer / key material             | なし / なし / なし                                                                       |
| approved commit / tree enrollment          | 未実装                                                                                   |
| production state access / mutation         | 0 / 0                                                                                    |
| recovery / retry / cleanup / resume        | 0 / 0 / 0 / 0                                                                            |
| fixed status / decision                    | `UNAVAILABLE / STOP`                                                                     |

protocolを定義しただけでは、署名、notarization、OS code-signing、root-owned install、approved revision enrollmentのどれも成立しない。従って、このlibraryがparseまたはcanonicalizeできることをproduction authorityとして扱ってはならない。

## 2. なぜSwift native protocolなのか

旧bootstrapの問題は、repository JXA、Gitで追跡しない`tsx/cjs` loader、承認されていないclean commitが、信頼判断より先に実行できたことだった。将来のtrust rootには次の順序が必要である。

1. repository外のroot-ownedな固定pathから、署名・notarize済みnative binaryを起動する
2. OS code-signing identity、binary、runtime dependency、全ancestorのowner / mode / nlinkを閉じる
3. create-onlyに登録済みのapproved commitとtreeを読む
4. repository codeを実行する前にGit control closureとrequired sourceを検証する
5. 一致した場合だけ、短寿命かつone-shotな外部attestationを発行する
6. 後続の別PRで作るread-only inspectorだけが、そのopaque attestationをconsumeする

SwiftはmacOSのcode-signing / notarization境界へ自然に接続でき、単一native executableへ閉じやすい。一方、self-contained JS bundleでもNode/JSC interpreter、preload、環境変数、module resolution、dynamic libraryを追加で信頼しなければならず、今回除去した循環bootstrapを再導入しやすい。

今回のlibraryはこの将来像のうち、approved enrollment、activation log、pure state transition、canonical ruleだけをrepository内でreview可能にする。native executableへのlink、install、sign、notarizeとfresh one-shot attestationは別gateである。

## 3. 実装する2種類のcanonical record

source moduleは4つの役割へ分かれる。

| source                   | 役割                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `CanonicalBytes.swift`   | `CanonicalBytes20` / `CanonicalBytes32`、big-endian codec、dependency-free SHA-256、canonical decode error |
| `EnrollmentRecord.swift` | approved revisionとartifact closureを固定する232-byte enrollment                                           |
| `ActivationRecord.swift` | enrollmentのactivate / revoke / rollbackを順序づける124-byte record                                        |
| `ProtocolState.swift`    | record列をpureに適用し、active enrollmentをfail-closedに導出するstate machine                              |

`EnrollmentRecord`はexact 232 bytesで、encodingが固定schema / domainを持つ。値は`audience = productionRecovery`、`purpose = inspectStalePrefix100`、32-byte `enrollmentID`、非zeroの`expectedUID`、20-byte `approvedCommit` / `approvedTree`、32-byte `sourceManifest` / `supervisorArtifact` / `childArtifact` / `runtimeClosure`、`notBefore` / `expiresAt`である。未設定値との曖昧さを残さないため、有効期間は`0 < notBefore < expiresAt`を満たさなければならない。

`ActivationRecord`はexact 124 bytesで、同じ固定audience、`action = activate | revoke | rollback`、単調な`sequence`、32-byte `activationID` / `targetEnrollmentID` / `previousActivationDigest`、`issuedAt`を持つ。

両recordは別々のfixed magicを使い、integerはbig-endianでencodeする。string、map、optional field、可変field orderingがないため、unknown fieldやduplicate fieldという表現自体をwire formatへ入れない。length、magic、tag、固定値、値域、余剰byteのいずれかが不正なら、decoderはprivate inputの詳細を漏らさず、Equatableな単一error `invalidCanonicalRecord`へcollapseする。

`ProtocolState`はcanonical decode errorと運用state errorを分離する。後者は`duplicateEnrollment`、`duplicateActivation`、`invalidSequence`、`invalidPreviousActivationDigest`、`nonMonotonicIssuedAt`、`unknownEnrollment`、`revokedEnrollment`、`alreadyRevoked`、`alreadyActivated`、`rollbackTargetNeverActivated`、`enrollmentNotYetValid`、`enrollmentExpired`、`sameEnrollmentAlreadyActive`の固定enumで表し、失敗時に部分適用しない。各activationのcanonical SHA-256が次recordの`previousActivationDigest`を鎖状にbindする。

state ruleも意図的に狭い。`activate`は各enrollmentについて一度だけ許可し、過去にactivateしたenrollmentへ戻す場合は`rollback`を要求する。rollback先は「直前のactive」だけではなく、過去に一度activate済みで、登録済み、未revoke、かつrollback時点で有効期間内の任意のenrollmentでよい。一方、`revoke`は安全側の不可逆操作なので、登録済みなら一度もactivateされていないtargetにも、`notBefore`前またはexpiry後にも適用できる。`previousActivationDigest`の正解値を決めるauthorityはcallerではなく、`ProtocolState`が内部で計算した直前activationのcanonical digestだけである。

ただし、これらのrecordをrepository codeが生成できることはenrollmentの認証ではない。署名検証、create-only保存、approved recordの採用authorityは、将来のoutside-repository verifierにのみ置く。また、このmoduleはfresh challengeやone-shot attestationのhandoff protocolをまだ実装しない。

## 4. code-only境界で禁止するもの

この段階では、次を意図的に実装しない。

- executable target、`@main`、daemon、privileged helper
- package command、JXA、Node、`tsx/cjs`、dynamic module loader
- filesystem、process、Git、network、production registryへのaccess
- Security / Keychainを使うsigner、issuer、capability minting
- private key、public-key enrollment、certificate、notarization artifact
- canonical install pathの作成、owner / mode変更、root privilege
- incident lease、stage、checkpoint、quarantine、deployment keyのread / write
- retry、cleanup、resume、teacher generation、training、weight promotion

protocol libraryはproduction stateを読む必要がない。固定長recordのstrict validation、canonical encoding / decoding、pure state transitionだけに閉じることで、後続実装がauthorityを混入させにくくする。

## 5. non-circular bootstrapの完成条件

将来このprotocolを実運用へ進めるには、repository外で次の証拠がすべて必要になる。

| gate            | 必須証拠                                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| native artifact | release toolchainで再現可能な単一artifact、署名、notarization、dependency closure                                   |
| install         | canonical absolute path、root owner、group / other non-writable、全ancestor closure                                 |
| enrollment      | authenticated create-only approved commit / tree、rotationとrollback rule                                           |
| repository      | HEAD exact match、clean required source、Git control / object / alternates closure                                  |
| negative tests  | cleanだが未承認、ignored loader canary、external object store、foreign owner、writable ancestorを拒否               |
| handoff         | 今回のrecord protocolとは別に、fresh challenge、短いexpiry、one-shot consume、replay / substitution / downgrade拒否 |
| inspector       | 別PR、zero-argument、read-only、mismatch / auth failure / indeterminateでSTOP                                       |

repository内のunit testがprotocol round-tripを通すことは、この表の代替にならない。local Xcodeでのtestはsource-levelの開発確認に限り、release binary、署名、notarization、install済みartifactの証拠として数えない。

## 6. validationの読み方

このPRで許されるvalidationは、232 / 124-byte exact length、big-endian round-trip、不正magic / tag / length / trailing byteの単一error化、`CanonicalBytes20` / `CanonicalBytes32`のcopy isolation、SHA-256 test vector、state transitionと固定errorなどのpure testである。testはproduction pathを開かず、private path、key、incident valueへ接触しない。

latest main `040f61ad6b44c6accb0db68375ec66877c021f17`（tree `3630df561f25d3d222f77ba650cddd97728071d9`）は、merge commit `d7565c31b7fc862792858fc90f8ac66f68f30a7b`で通常mergeした。統合後のsource-level実測もPASSした。local Xcode 15.3 build 15E5188j、Apple Swift 5.10（swiftlang-5.10.0.12.7 clang-1500.3.9.3）、target `arm64-apple-macosx15.0`で、Swift 14 / 14 tests（canonical 9、state 5）がPASSし、build 0.09秒、tests 0.023秒だった。repository側のVitest evidence testもNode 22.13.0で5 / 5 PASSした。さらに全Vitest 170 files / 3,096 tests、Python stdlib 80 tests、lint、production buildもPASSした（全lintには今回の差分外にある既存warning 157件、error 0件が残る）。ただし、このlocal XcodeでのPASSが確定するのは「そのlocal toolchainでsource-level testが通った」ことだけである。release artifact用toolchainの採用、artifact closure、code-signing、notarization、Gatekeeper acceptanceはすべて未確定のまま残す。

## 7. 次の安全な順序

1. code-only Swift enrollment / activation protocolとnegative testをreviewし、通常mergeする
2. release toolchain、artifact closure、canonical outside-repo install policyを別PRで固定する
3. repository外のsigned / notarized verifierとcreate-only enrollmentを別のreview / install gateで完成させる
4. clean unapproved commit、ignored loader、external Git store、owner / mode異常のnegative testをartifactに対して通す
5. external verifierのfresh one-shot attestationだけを受け取るzero-argument read-only inspectorを別PRで実装する
6. inspectorのreview・通常merge後に一度だけfresh inspectionし、mismatch、認証不能、indeterminateならSTOPする
7. 一致するfresh evidenceが揃った場合だけ、human-confirmed quarantineまたは別承認fresh restartをreviewする
8. 完全な教師data、再学習、候補選抜、正式A/B、外部校正を終え、棋力とrollback証拠が揃った場合だけlive activationを検討する

## 8. 現在の判断

今回のprotocol設計は、外部trust rootを作る前にmessage境界を小さくreviewできるようにする前進である。しかし、external verifierはinstallされておらず、approved commit / treeもenrollされていない。production inspector、reconciliation authority、retry authorityも存在しない。

従って現在は**`UNAVAILABLE / STOP`**である。incident state、live weights、教師data、学習済み候補は変更しない。[機械可読記録](./data/floodgate-v7-external-trust-root-protocol-2026-07-17.json)は、code-only scope、禁止されたauthority、未完artifact gate、zero production accessを分離して記録する。
