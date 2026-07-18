# 何かをbuildする前にrelease・2-binary artifact・root install方針を固定する — Floodgate v7

> 直前の[external trust-root protocol](./blog-shogi-floodgate-v7-external-trust-root-protocol.md)はenrollmentとactivationをcanonicalにしたが、release artifactとinstallのgateは意図的に未完のまま残した。今回はdependency-free Swiftの**policy record validator**を3種類追加する。supervisor、verifier、package、installer、signer、notary client、credential、root-owned installのどれも作らない。現在の判断は引き続き**`UNAVAILABLE / STOP`**である。English version: [blog-shogi-floodgate-v7-release-artifact-install-policy.en.md](./blog-shogi-floodgate-v7-release-artifact-install-policy.en.md)

> **履歴注記:** 以下の「executable targetなし」は本稿revisionのsnapshotである。後続の[current source boundary](./blog-shogi-floodgate-v7-external-supervisor-verifier-source.md)にある2 targetはdependencyなし・exit 78固定で、signed / notarized / installed artifactではない。

## 1. 結論

将来repository codeを実行する前に何を証明しなければならないかを、次の3 recordで固定した。

| canonical record                 | 固定するpolicy                                                                            | 現在の実release証拠 |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ------------------- |
| `ReleaseToolchainRecordV1`       | Apple final Xcode、support対象かつroot-ownedなhost closure、exact tool・recipe・再現build | なし                |
| `ArtifactClosureRecordV1`        | distinctなthin arm64 executable 2個、signing closure、signed flat package 1個             | なし                |
| `InstallPolicyRecordV1`          | exact local path、全ancestor metadata、no-follow / same-device / local-filesystem rule    | なし                |
| executable / flat package        | 未実装                                                                                    | なし                |
| Developer ID / notarization      | policyのみ                                                                                | unavailable         |
| root-owned install               | policyのみ                                                                                | 未試行              |
| production read / write          | 今回は明示的に禁止                                                                        | 0 / 0               |
| teacher / training / live weight | 今回の境界外                                                                              | 0 / 0 / 0           |

3形式はいずれも固定長、domain分離、big-endianである。length、magic、version、固定policy byte、counter、identity、range、trailing byteのどれかが不正なら、単一error `invalidCanonicalRecord`へcollapseする。validatorをpassするのは「そのbytesがこのpolicyを表している」という意味だけであり、policyを満たすartifactの存在証明ではない。

## 2. なぜrelease artifactより先にpolicyを作るのか

先にbuildして後からtrust境界を説明すると、たまたまlocalで動くtoolchainやinstall layoutが事実上のsecurity policyになる。今回は順序を逆にする。

1. 受理可能なrelease証拠を先に固定する
2. pure sourceとして全rejection ruleをtestする
3. policyをreviewし、通常mergeする
4. その後でのみ、別gateの下で適格release hostとcredentialを用意する
5. さらに後続の別工程でreal artifactを作り、独立検証する

これにより、local compile成功を「配布可能な外部trust rootが完成した」と誤報するのを防ぐ。

## 3. `ReleaseToolchainRecordV1`: final channelと再現性をexactにする

release-toolchain recordはmagic `FGV7RTL1`、exact **798 bytes**である。V1は次を固定する。

- Apple final-release catalog channel
- Xcode **15.3.0 build 15E204a**
- build host範囲 `14.0.0 <= macOS < 15.0.0`
- root:wheel、directory mode `0755`、immutable closure、writable ACL entry 0
- target macOS / arm64、Swift 5 language mode
- Apple catalog evidence、Xcode archive、Xcode designated requirement / CDHash、Developer directory、tool manifest、Xcode / Swift / Clang / `ld` version出力、SDK manifest、host、target triple、language mode、build argv、environment、source closure、build recipeの非zero hash
- pre-build identityとpost-build identityの一致
- cleanかつunsignedなbuildをexactly 2回行ったときのbyte完全一致
- network access、plugin、external dependencyがすべて0

Xcode buildは推測で決めていない。Appleの[Xcode Cloud release notes](https://developer.apple.com/xcode-cloud/release-notes/)はXcode 15.3 finalをbuild **15E204a**として掲載している。またAppleの[Xcode support matrix](https://developer.apple.com/support/xcode/)はXcode 15.3のsupport対象hostをmacOS Sonoma 14.xとしている。

### なぜ現在のMacはsource-test-onlyなのか

| check                       | 必須release policy   | 現local観測                       | 結果        |
| --------------------------- | -------------------- | --------------------------------- | ----------- |
| Xcode final build           | 15E204a              | 15E5188j                          | reject      |
| support対象build host       | macOS 14.x           | macOS 15.1                        | reject      |
| Xcode / Developer dir owner | root:wheel           | current non-root userが所有       | reject      |
| Developer ID identity       | 別gateの下で利用可能 | 0（既存sanitized inventory fact） | unavailable |
| notary profile              | 別gateの下で利用可能 | absent（既存sanitized fact）      | unavailable |

今回keychainやnotary-profile inventoryは開いていない。提供済みsanitized factをunavailableとして記録しつつ、credential store、keychain、notary profileへのaccess counterは0のままにした。local Xcode 15.3 build 15E5188jはSwift sourceのcompile / testには使えるが、有効な`ReleaseToolchainRecordV1`を作れない。

## 4. `ArtifactClosureRecordV1`: genericな1 blobではなく2 executable

artifact recordはmagic `FGV7ACL1`、exact **993 bytes**で、次の2 Mach-O executableを個別にbindする。

- `floodgate-v7-trust-root-supervisor`
- `floodgate-v7-trust-root-verifier`

各binaryはwhole-file、semantic Mach-O、executable identifier、designated requirement、CodeDirectory、CDHash、dependency closure、entitlement policyを別々に持つ。validatorはsupervisor / verifier間でwhole-file、semantic、executable identifier、designated requirement、CodeDirectory、CDHashが同じならrejectする。一方、dependency closureとentitlement-policy digestが同一でも受理する。両binaryが同じApple-system-only dependency closureと同じempty / safe entitlement policyを正しく使う場合があるためである。

V1は両payloadをthin arm64 `MH_EXECUTE`、minimum macOS 13.0、macOS 14.4 SDKへ固定する。次の17個の名前付きcounterは必ず0でなければならない。

1. fat-binary slice
2. RPATH load command
3. relative load
4. non-system load
5. weak load
6. reexport load
7. upward load
8. lazy load
9. DYLD environment entry
10. plugin
11. preload
12. dangerous entitlement
13. package script
14. code-signing warning
15. notarization warning
16. staple warning
17. Gatekeeper warning

signing policyは、両executableにDeveloper ID Application、secure timestamp、hardened runtime、library validationを要求する。container policyはregular fileをexactly 2個に固定し、その両方を必須executableとして分類する。non-executable regular file、symlink、hardlink alias、special file、package scriptはすべて0で、directory entryはinstall policyのexact ancestorだけに制限する。さらにsigned flat package 1個、Developer ID Installer、secure timestamp、accepted notarization、stapled ticket、Gatekeeper assessment成功を要求する。

Appleは[Developer ID ApplicationとDeveloper ID Installer certificate](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/)の用途を分けている。後続artifact工程はAppleの[distribution-signing guidance](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)、[hardened runtime](https://developer.apple.com/documentation/security/hardened-runtime)、[notarization workflow](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)、[custom notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)にも従う必要がある。

ここではreal whole-file hash、signature、package、ticket、Gatekeeper結果のどれも成立したと主張しない。test-vector digestはrelease identityではない。

## 5. `InstallPolicyRecordV1`: 全ancestorを判断対象にする

install recordはmagic `FGV7INP1`、exact **980 bytes**である。no-follow traversal、same-device closure、local filesystem、writable ACL entry 0を固定し、1つのparent hashへ要約せず、全9 pathとmetadataをencodeする。

| path                                                                                                                          | kind         | owner      | mode | link rule           |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- | ---- | ------------------- |
| `/`                                                                                                                           | directory    | root:wheel | 0755 | positive and stable |
| `/Library`                                                                                                                    | directory    | root:wheel | 0755 | positive and stable |
| `/Library/Application Support`                                                                                                | directory    | root:admin | 0755 | positive and stable |
| `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7`                                                             | directory    | root:wheel | 0755 | positive and stable |
| `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot`                                           | directory    | root:wheel | 0755 | positive and stable |
| `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1`                                        | directory    | root:wheel | 0755 | positive and stable |
| `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/bin`                                    | directory    | root:wheel | 0755 | positive and stable |
| `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/bin/floodgate-v7-trust-root-supervisor` | regular file | root:wheel | 0555 | exactly 1           |
| `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/bin/floodgate-v7-trust-root-verifier`   | regular file | root:wheel | 0555 | exactly 1           |

directoryのlink countを1へ固定してはいけない。将来のheld-descriptor inspection前後で「positiveかつstable」であることを要求する。`nlink = 1`を要求するのはbinary leafだけである。

さらにsupervisor leafを`ArtifactClosureRecordV1.supervisorWholeFileSHA256`へ、verifier leafを`verifierWholeFileSHA256`へbindし、artifact-closure-record自体のexact digestも要求する。pure composition validationは2 binaryのswapと、正しいbinary pairを別artifact-closure recordへ結びつける置換をrejectする。

今回のsourceはpath作成、`chown` / `chmod`、権限昇格、filesystem descriptor open、installを行わない。これらは独立reviewが必要な後続gateである。

## 6. negative test

dependency-free Swift packageには11 testを追加し、local source testは合計**25 / 25**になった。

- 各recordのpinned length / magic / fixed bytes / round trip / SHA-256 vector
- short、long、trailing、wrong domain / version / purpose / reserved fieldのreject
- final Xcode、host range、root ownership、mode、immutable closure、全zero counterのreject
- 全required digest / CDHashのzero reject
- pre/post toolchain driftと非byte-identical buildのreject
- fat / non-arm64 / wrong file type / wrong minOS / wrong SDKのreject
- 全Mach-O / DYLD / entitlement / package / warning counterのmutation reject
- supervisor / verifier間で異なる必要があるidentityだけのequality reject
- shared safe entitlement / dependency closure identityの受理
- 全path byteとowner、group、mode、kind、link policy、link-countの全byte mutation reject
- exact host境界（`14.0.0`は受理、13.xと`15.0.0`はreject）
- supervisor / verifier leaf swapとwrong artifact-closure compositionのreject

repository側evidence testも、Swift packageがlibrary 1個だけであり、executable target、operational script、dependency、signer、installer、filesystem / process / network API、production importを持たないことを固定する。

最新merge済みbaseでのrepository全体検証も、**172 test files / 3,112 tests**すべてPASSした。

## 7. 未完gate

policy sourceはartifact gateを1つも満たさない。安全な次工程は次の順序である。

1. 3つのsource-only policyをreviewし、通常mergeする
2. Apple-final Xcodeを置いたsupport対象かつroot-ownedなrelease hostと、別承認済みcredentialを用意する
3. offline・dependency-free・cleanなunsigned buildを2回行い、byte identityを証明する
4. 2つのMach-O closureを独立に閉じ、Developer ID Applicationでsignする
5. script-free flat package 1個を作り、Developer ID Installerでsignし、notarize / staple / assessする
6. exact packageを独立reviewした後だけ固定root-owned installを行う
7. installed artifactに対してsubstitution、owner、mode、link、ACL、mount、RPATH、DYLD、replay negative testを通す
8. authenticated create-only enrollmentとread-only inspectorを別々に実装する
9. exactly one fresh production inspectionを行い、mismatch、authentication failure、indeterminateならSTOPする
10. 完全な教師生成、再学習、候補選抜、正式A/B、外部校正、棋力証拠、rollback証拠が揃った後だけlive weightを検討する

## 8. 現在の判断

policy境界は大きく具体化したが、実release trust rootはまだ存在しない。local Xcodeはsource testにしか使えず、credentialを考える前の段階で独立した3つのrelease-toolchain条件に失敗する。Developer ID identity、notary profile、signed package、installed verifierもない。

従って現在は**`UNAVAILABLE / STOP`**である。production state、教師data、学習済みcandidate、live weightは変更していない。[機械可読証拠](./data/floodgate-v7-release-artifact-install-policy-2026-07-17.json)はcanonical field、exact install tree、local rejection fact、未完gate、production activity 0を分離して記録する。
