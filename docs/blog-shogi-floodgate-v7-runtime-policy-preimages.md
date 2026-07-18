# digestだけだった実行条件をcanonical bytesへ閉じる — Floodgate v7

> 前段の[外部supervisor / verifier source境界](./blog-shogi-floodgate-v7-external-supervisor-verifier-source.md)は、署名付きhandoffと220-byteのruntime launch policyを定義した。しかし、argv、working directory、environment、runtime install policyはSHA-256だけで、独立実装が同じ値を再計算するcanonical preimageを持っていなかった。本稿はその4つの前像と固定鍵golden vectorをsource / testへ追加する。実process起動、root install、production key、production inspectionは行わず、2つのexecutableもexit 78のfixed STOPのままである。運用判断は引き続き**UNAVAILABLE / STOP**。English version: [blog-shogi-floodgate-v7-runtime-policy-preimages.en.md](./blog-shogi-floodgate-v7-runtime-policy-preimages.en.md)

## 1. 結論

「このdigestを信じる」という宣言を、「どのbytesをhashし、何を起動し、どのfilesystem metadataを要求するか」という再計算可能なrecordへ置き換えた。

| 境界            | 今回canonicalに固定したこと                                                                      | まだ無いもの                     |
| --------------- | ------------------------------------------------------------------------------------------------ | -------------------------------- |
| argv            | root-owned予定のNode absolute pathとdiagnostic bundle absolute pathのexact 2要素                 | spawn / exec                     |
| cwd             | exact `/`                                                                                        | 実processへの適用                |
| environment     | exact 0 entries                                                                                  | 実processへの適用                |
| runtime install | 11 path、owner、group、mode、link rule、no-follow、same-device、local-filesystem、writable ACL 0 | installer / filesystem verifier  |
| signed handoff  | manifest → runtime launch policy → 4前像 → Node / bundle identityを必須のclosureで結合           | production manifest / key / head |
| cross parser    | 固定Ed25519鍵とcanonical bytes / SHA-256 / signatureの共有golden fixture                         | production key material          |

この変更は実行条件の**表現と検証可能性**を強くする。実行物を安全にinstallした証拠でも、実際にproductionをinspectした証拠でも、棋力が上がった証拠でもない。

## 2. opaque digestの何が不足していたか

SHA-256は、正しい前像が既に合意されているときには強い。しかし「argv digest」「environment digest」という名前と32 bytesだけでは、次が決まらない。

- 要素数、length encoding、integer endianness
- pathの文字コードとabsolute / relativeの区別
- argv[0]を含めるか
- environmentの順序、重複、空との区別
- ancestorをどこまで検査するか
- owner / group / mode / link count / ACLの比較規則

その状態では、Swiftと将来の別processが別々のbytesを「同じpolicy」と解釈し得る。今回は可変JSONやmapをwire formatにせず、version付きmagic、fixed field order、big-endian length、exact byte countを持つrecordにした。length、magic、tag、固定path、metadata、trailing byteのどれかが違えば単一の`invalidCanonicalRecord`へfail closedする。

## 3. 4つのcanonical preimage

| record                           | magic      | bytes | pinned SHA-256                                                     |
| -------------------------------- | ---------- | ----: | ------------------------------------------------------------------ |
| fixed argv                       | `FGV7ARV1` |   265 | `bf7c65abbc101939ca4b3bccbd52c17891e12e6db50af141b6784d753b936b15` |
| fixed working directory          | `FGV7CWD1` |    17 | `01329f16e0b138c9583da158e6f533dfc8278d5102e0c2d0e9b2e30704d4c98e` |
| fixed environment                | `FGV7ENV1` |    16 | `b4c85fb22072c92826ccfadce1555b3a25515aa45c27224498f0cad35c5a509d` |
| runtime install mutation fixture | `FGV7RIP1` | 1,307 | `9582e2e987ece65e3d9dc4d6291ddeae055d97e06033d9e45590c0518e0c9803` |

最初の3 recordは値自体も固定なのでdigestは常に同じである。runtime install recordはNode / bundle identityを含む9つの可変digest fieldを持つため、formatと長さは固定でもdigestはその9 fieldの値に応じて変わる。表の値はfixed-record mutation用のsynthetic fixtureである。runtime installではframing、固定policy、path metadataを網羅的に変異させる。一方、9つの可変32-byte fieldはrecord ID、6つのNode / bundle identity digest、filesystem identity policy digest、ACL policy digestから成り、canonical decoderが保証するのはnonzeroかつpairwise-distinctであることまでである。実artifact / filesystemに対するidentityとpolicyの観測は後続gateで行う。共有golden fixtureと将来のproduction recordはそれぞれ別digestになる。

argvは次の2要素だけを許す。

1. `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/runtime/bin/node`
2. `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7/ExternalTrustRoot/v1/runtime/lib/floodgate-v7-stable-deadline-diagnostic.cjs`

caller argument、`--eval`、preload、shell、JXA intermediaryは入らない。cwdは`/`、environmentは0 entriesである。これにより、`NODE_OPTIONS`、`PATH`、`HOME`、`DYLD_*`などcaller由来の値を暗黙に継承する表現を禁止した。

## 4. runtime install recordが閉じる11 path

recordは`/`からruntimeの2 fileまで、次の順序を固定する。

1. `/`
2. `/Library`
3. `/Library/Application Support`
4. `/Library/Application Support/com.gomyway1216.shogi-floodgate-v7`
5. `.../ExternalTrustRoot`
6. `.../ExternalTrustRoot/v1`
7. `.../ExternalTrustRoot/v1/runtime`
8. `.../runtime/bin`
9. `.../runtime/bin/node`
10. `.../runtime/lib`
11. `.../runtime/lib/floodgate-v7-stable-deadline-diagnostic.cjs`

directoryはroot owner、mode 0755を要求し、`/Library/Application Support`だけはmacOSの既定に合わせてgroup `admin`（GID 80）を固定する。Nodeはroot:wheel、0555、regular file、link count exact 1、bundleはroot:wheel、0444、regular file、link count exact 1である。全体としてno-follow、same-device、local filesystem、許可するwritable ACL entry 0を要求する。

さらにNodeのwhole-file、CodeDirectory、designated requirement、held executable identityと、bundleのwhole-file / held identityを別々のdigestとして保持する。pathが正しくても別bytes、別code-sign identity、開いた後の差し替えを同一視しないためである。

## 5. signed handoffから前像を外せなくする

前像recordを追加するだけでは、呼び出し側が従来のraw `RuntimeLaunchPolicyRecordV1`だけを渡す経路を残せば迂回できる。そこで全challenge / receipt / attestation APIを`RuntimeLaunchPreimageClosureV1`必須へ変更した。

結合は次の順である。

```text
signed challenge / receipt / attestation
  → source manifest SHA-256
    → runtime launch policy SHA-256
      → fixed argv / cwd / environment / runtime-install SHA-256
        → Node / bundle bytes・code identity・held identity
```

closureは、4前像のcanonical digest、bundle digest、manifestにpinされたNodeの4 identity、audience / purpose、manifest全体のcanonical digestを毎回再検査する。argvだけ、cwdだけ、environmentだけ、install recordだけ、bundleだけ、Node identityだけ、manifestの無関係に見えるfieldだけを差し替える合成attackもすべて拒否する。

## 6. Swiftだけで正しいと思い込まない

同じencoderとdecoderでround-tripするtestだけでは、両方が同じ誤りを持つ可能性がある。そのため、固定seedから導出したauthority / supervisor / verifierの3つのEd25519 keyを使い、次を共有JSON fixtureへ固定する。

- raw public keyとそのSHA-256 key ID
- fixed argv / cwd / environment、runtime install、runtime launch policy
- repository source manifestと、authorityが署名したenrollment / activation envelope
- signed activation envelopeを指すexpected head
- manifest / head / signed activationを指すsupervisor challenge、verifier receipt、one-shot attestation
- signature payload、64-byte signature、canonical bytes、canonical SHA-256
- field offset、length、manifest → enrollment → signed envelope → head → challenge → receipt → attestationのdigest chain

Swiftはfixtureのcanonical bytesをstrict decodeして完全一致で再encodeし、CryptoKitで公開鍵、key ID、fixture署名を検証する。Node側はSwift sourceをimportせず、標準`crypto`と独立したbig-endian parserだけでlength、offset、SHA-256、key ID、Ed25519 signatureを検査する。domain magic、role key、chained digestを変えるnegative caseも拒否する。

この14-record fixtureは、release supervisor / verifier用の`FGV7ACL1` artifact closureと`FGV7INP1` install policyのcanonical preimageを含まない。そのためmanifestにはruntime用`FGV7RIP1`と異なるsynthetic digestを置き、未収録preimageをscope外と明記する。authorityとmanifestの実際のprotocol linkは、authority keyで署名されたenrollmentがmanifestのcanonical SHA-256を保持することで成立する。fixture専用の別derivation ruleは追加しない。

さらに4つのpublic handoff entrypointへ、別manifestに対しては内部整合したclosureを実際に注入し、すべてfail closedすることをSwiftで確認する。CIはpublic symbol graphも生成し、4入口が`RuntimeLaunchPreimageClosureV1`必須であることと、signature / freshnessだけ、またはraw launch policyだけを検査する6つのpartial entrypointがpublicでないことを確認する。

実装中に、local CryptoKitの同一seed / payload再署名は、同じ公開鍵で検証可能でも64-byte署名値が実行ごとに変わることを実測した。従ってcross-parser契約は「両実装が同じ署名bytesを生成する」ではなく、「fixtureのcanonical signed bytesを両方が同じfield境界でparseし、同じ公開鍵で検証する」とした。fixture署名はNode標準`crypto`で生成した固定test vectorである。

これはproduction keyの作成ではない。seedは公開test vectorであり、productionへ持ち込めないこと自体がfixtureの前提である。

## 7. 実測とnonclaim

実装evidence revisionは`773f7eb88f943385ac89a6ec0e61d9e7a23e5e12`で、PR #499のregular merge `e142d844fcf5e2b189bb29a1ee9880df74afaf1a`をbaseとする。最初の独立reviewは`385f1c8bc9f31f784a491526c86125642cb9b622`にP2を3件見つけ、signed envelope chain、実closure drift、partial public APIを修正した。次のreviewは`f75638e66f6903ba3ccac93de7b3f9bd484b405f`にP2を2件見つけ、別policy domainのaliasとfixture専用authority ruleを修正した。実装treeだけを対象とする最終再reviewは`773f7eb88f943385ac89a6ec0e61d9e7a23e5e12`をP0 / P1 / P2 = 0 / 0 / 0で確認した。

日英記事、data、evidence test、履歴照合用CI設定は別publication reviewで確認する。初回はchronology / scope / gateのP1を3件と、mutation / 日英文言 / false-passのP2を4件発見した。独立provenance監査は9欄の分類、ordered gate、counter provenanceのP2を3件、green snapshot監査はschema key、再度のchronology、意図的red testのP2をさらに3件発見した。#500のregular merge `0601268a57af32c910b785c3f79da647d3fbb428`は`3adfd0651e22ecb801b958eef8c9ca00f054a52e`で競合なく統合し、そのpost-main merge tree reviewはP0 / P1 / P2 = 0 / 0 / 0で一度PASSしたが、続くfinalization差分にPrettier driftのP2を1件発見して再び修正した。さらにworking-tree reviewをintegration base commitへ誤帰属したP2を1件修正し、reviewed contentとintegration baseを分離した。PR #501を開く前の修正済み合計はP1 3件 / P2 12件で、5回のCHANGES_REQUESTED履歴をdataに残す。CI差分のうち`test_and_build`変更はfull-history checkoutと25分timeoutによるprovenance gateのためで、`external_trust_root_protocol`変更はpublic symbol graphのsecurity gateである。前者はpublication review、後者は実装security evidenceとして分離する。発見時の記録をPASSへ書き換えず、各修正revisionとreview scopeを機械可読記録に分離する。

ready状態のPR #501をinitial head `3b0b37a353d478cf235901d391848886574621be`で開いた後、GitHub reviewは`COMMENTED`だったが、未解決のP2相当threadを3件受けた。内容は複数build configurationのsymbol graph、`/usr/bin/git`固定、CI設定をworkflow全体で数えるfalse-passである。初回CI run `29639949306`は**COMPLETED / FAILURE**となり、Darwin job `88068705524`の`strips or rejects DYLD injection before the attested child`だけが23件中22 PASS / 1 FAILで停止した。spawnの`status`は`null`、child-process errorのundefined検査は通過し、signalは初回logに記録されなかったため、この結果だけから終了原因は断定しない。一方、`Test and build` job `88068705540`はlint、unit tests、deadline calibration、ML contract、production buildを含め**SUCCESS**した。

失敗したlauncher testとtest launcher fixtureのblobはinitial headと統合済みmain `0601268a57af32c910b785c3f79da647d3fbb428`でそれぞれ同一だった。さらにmain CI run `29637691079`のDarwin job `88062776481`は、同じmacOS 26.4、`macos-26-arm64` image `20260715.0248.1`、provisioner `20260707.563`で同じlauncher testを23 / 23 PASSした。従ってこれはUnit Bのcanonical-preimage実装が直接起こしたproduct regressionではなく、既存のrunner依存CI portability failureと判断する。ただしrequired gateの失敗なので無視せず、merge blockerとして修正する。

local working treeでは、各build configurationのbase graphとexternal-extension shardをSPI symbol込みで検査し、global function / operator / instance・static subscript / initializer / function-valued property / function-returning callable / security typealiasまで含め、parameter labelに依存せずclosure型consumerを列挙してcomposed public callableをexact 4、raw-policy consumerを0に固定するnegative self-checkを追加した。さらに合成memberを除いたmodule全体のpublic / SPI surface 491 symbolと542 relationshipを、access level、SPI marker、kind、path components、symbol precise identifier、declaration fragmentのkind / spelling / precise identifier、およびrelationship全fieldのcanonical JSONで正規化し、local Xcode 15.3 / Swift 5.10のSHA-256 `3e040bc6097a0d7ab1ea7c511b0e6fd32c8a2d7a5c5076ee00beba1a21ae8160`へ固定した。同じkind / path / symbol件数のまま型宣言だけ変えたsynthetic symbolと、symbolを変えずprotocol conformance relationshipだけ変えたsynthetic graphを必ず拒否するため、新しいsymbol、同名overload、既存public signatureの型変更、公開protocol適合の変更に明示reviewが必要になる。PR CIはlocalより新しいSwift toolchainなので校正はまだ`NOT_STARTED`であり、CIはXcode / Swift versionとsymbol-graph generator / format / platformを記録し、base / shard graphをcommit SHAとrun attempt別のartifactとして14日保持する。初回rerunで不一致ならfail closedのままそのartifactでexact surface diffを確認し、expected fingerprintを自動更新しない。これはdirect signature / `Self` / extension / conformance surfaceの構造gateであり、既存public symbolのbody、arbitrary wrapper / byte decoder / generic / dynamic castの挙動までは証明しない。そのsemantic controlにはsource security reviewとadversarial testを引き続き必須とする。

shellを使わない`/usr/bin:/bin`限定のGit解決、次の任意job境界までのCI scope、`SIGABRT` / `SIGKILL`時に一度だけ再試行してraw child outputを含まないsanitized outcome shapeだけを記録する診断も追加した。最初のsignal自体は成功扱いせず、再試行後も最終`status` 0または6と`signal === null`を必須にする。独立local reviewとlocal validationはこの修正過程で追加P1を5件、P2を28件見つけた。技術修正は中間commit `eba6e9ecbd271fa4d8354fe1552a8123ac326959`と追補commit `735398093f7c839c8c2a97f33ef96607961bd829`へ分け、最終commit / tree `735398093f7c839c8c2a97f33ef96607961bd829` / `5f8b873ffe1d15d5a9efc50e7e986478d826f3bc`のexact reviewはP0 / P1 / P2 = 0 / 0 / 0でPASSした。以前の実装security review PASSと途中のCHANGES_REQUESTEDは履歴として残す。このsnapshotではcurrent headのremediation 2 commitとpublication tracking 4 pathがまだremote未反映であり、最終local validation、publication exact revision review、CI rerun、3 threadのremote resolutionは未完である。従ってPR validationは**IN_PROGRESS / STOP**のままである。

fixed argv / cwd / environmentの全byte mutation、runtime-install framing / 固定policy / path metadata drift、5種類のpolicy digest substitution、install swap、Node identity drift、manifest drift、4つのpublic handoff入口のclosure drift拒否を含むSwift source testは**58 / 58 PASS**した。runtime install recordの9つの可変digest fieldはcanonical decode時にnonzero / pairwise-distinctだけを要求し、そのうち6つがruntime identityを保持する。全byteの固定や、実環境でのidentity / policy観測完了は主張しない。このうちSwift cross-parserは4 / 4、独立Node parserは**6 / 6 PASS**である。public symbol graphはcomposed入口4、非公開partial入口6をexactに確認した。TypeScript全体型検査、対象ESLint、対象Prettier、Python symbol-graph checker compile、`git diff --check`もPASSした。

実装range `e142d844fcf5e2b189bb29a1ee9880df74afaf1a` exclusive → `773f7eb88f943385ac89a6ec0e61d9e7a23e5e12` inclusiveで、このtaskが観測したproduction操作はすべて0である。tracked stateはgit diff、command counterはtask内の観測に基づき、immutableな外部command ledgerで独立machine verificationした実行総数ではない。post-implementationのpublication activityやprogram lifetime totalも表さない。

- production inspector / handoff: 0
- production authority key / activation head load: 0
- root install / process spawn: 0
- private clean-room copy: 0
- teacher generation: 0
- training / candidate selection / formal A/B / external calibration: 0
- live weight activation: 0

このPRはライブ重みとライブ設定を変更しておらず、新しい棋力測定も0である。したがって改善も低下も主張せず、棋力変化は**UNKNOWN / NOT MEASURED**とする。機械可読記録は[floodgate-v7-runtime-policy-preimages-2026-07-18.json](./data/floodgate-v7-runtime-policy-preimages-2026-07-18.json)へ分離する。

## 8. 次のgate

canonical bytesが揃っても、runtimeを安全に実行できるわけではない。次は別PRで少なくとも次を順に閉じる。

1. root-owned / create-only authority public keyとactivation headのfresh load、anti-rollback
2. signed / notarized release artifactとcanonical root install
3. production manifest、authority-signed enrollment / activation、role key lifecycle
4. no-followで保持したruntime / bundleのfilesystem、ACL、code-signing実測
5. actual Git control / repository source、audit token、held process identityの実測
6. exact argv / cwd / empty environment / UIDのexec時強制
7. suspended spawn後のactual image再検査、new process group、TERM→KILL→reap、bounded stdout/stderr
8. zero-argument read-only production inspectorと一度だけのfresh evidence
9. private clean-room教師生成、再学習、候補選抜、封印holdout、正式A/B、外部校正
10. reversible canary、監視、rollbackを伴うevidence-gated live activation

これらの証拠が通常review、CI、regular mergeを通るまで、production recoveryは**UNAVAILABLE / STOP**、ライブ重みはunchangedのままである。
