# Fixing the release, two-binary artifact, and root-install policy before building anything — Floodgate v7

> The preceding [external trust-root protocol](./blog-shogi-floodgate-v7-external-trust-root-protocol.en.md) made enrollment and activation canonical, but it deliberately left the release artifact and installation gates open. This change adds three dependency-free Swift **policy record validators**. It does not create the supervisor, verifier, package, installer, signer, notary client, credential, or root-owned installation. The current decision remains **`UNAVAILABLE / STOP`**. Japanese version: [blog-shogi-floodgate-v7-release-artifact-install-policy.md](./blog-shogi-floodgate-v7-release-artifact-install-policy.md)

## 1. Result

The new source fixes what a future release must prove before any repository code may run:

| Canonical record                 | Fixed policy                                                                                    | Actual release evidence now |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| `ReleaseToolchainRecordV1`       | Apple-final Xcode, supported root-owned host closure, exact tools, recipe, and repeatable build | none                        |
| `ArtifactClosureRecordV1`        | two distinct thin arm64 executables, signing closure, and one signed flat package               | none                        |
| `InstallPolicyRecordV1`          | exact local paths, every ancestor's metadata, no-follow / same-device / local-filesystem rules  | none                        |
| executable / flat package        | not implemented                                                                                 | absent                      |
| Developer ID / notarization      | policy only                                                                                     | unavailable                 |
| root-owned installation          | policy only                                                                                     | not attempted               |
| production read / write          | forbidden in this change                                                                        | 0 / 0                       |
| teacher / training / live weight | outside this boundary                                                                           | 0 / 0 / 0                   |

All three formats are fixed-length, domain-separated, big-endian records. Invalid length, magic, version, fixed policy byte, counter, identity, range, or trailing byte collapses to the single `invalidCanonicalRecord` error. Passing a validator says only that the bytes express this policy; it does not prove that an artifact satisfying it exists.

## 2. Why policy comes before a release artifact

Building first and describing the trust boundary afterward would make a locally convenient toolchain or install layout the de facto security policy. Here the order is reversed:

1. pin the only acceptable release evidence;
2. test every rejection rule as pure source;
3. review and regular-merge that policy;
4. only then acquire an eligible release host and credentials under a separate gate;
5. produce and independently verify real artifacts in later work.

This also prevents a successful local compile from being misreported as a distributable external trust root.

## 3. `ReleaseToolchainRecordV1`: exact final-channel and reproducibility evidence

The release-toolchain record is exactly **798 bytes**, with magic `FGV7RTL1`. V1 fixes:

- Apple final-release catalog channel;
- Xcode **15.3.0 build 15E204a**;
- build-host range `14.0.0 <= macOS < 15.0.0`;
- root:wheel ownership, directory mode `0755`, immutable closure, and zero writable ACL entries;
- target macOS / arm64 and Swift 5 language mode;
- nonzero hashes for the Apple catalog evidence, Xcode archive, Xcode designated requirement and CDHash, Developer directory, tool manifest, Xcode / Swift / Clang / `ld` version outputs, SDK manifest, host, target triple, language mode, build arguments, environment, source closure, and build recipe;
- identical pre- and post-build identities;
- exactly two clean unsigned builds with byte-identical output; and
- zero network accesses, plugins, and external dependencies.

The exact Xcode build is not an assumption. Apple lists Xcode 15.3 final as build **15E204a** in the [Xcode Cloud release notes](https://developer.apple.com/xcode-cloud/release-notes/). Apple's [Xcode support matrix](https://developer.apple.com/support/xcode/) lists macOS Sonoma 14.x as the supported host for Xcode 15.3.

### Why the current Mac is source-test-only

| Check                       | Required release policy | Current local observation                        | Result      |
| --------------------------- | ----------------------- | ------------------------------------------------ | ----------- |
| Xcode final build           | 15E204a                 | 15E5188j                                         | reject      |
| supported build host        | macOS 14.x              | macOS 15.1                                       | reject      |
| Xcode / Developer dir owner | root:wheel              | user-owned by the current non-root user          | reject      |
| Developer ID identities     | available under gate    | 0, from the preexisting sanitized inventory fact | unavailable |
| notary profile              | available under gate    | absent, from the preexisting sanitized fact      | unavailable |

No keychain or notary-profile inventory was opened in this change. The supplied sanitized facts are recorded as unavailable, while credential-store, keychain, and notary-profile accesses remain zero. Local Xcode 15.3 build 15E5188j may compile and test the Swift source, but it cannot create a valid `ReleaseToolchainRecordV1`.

## 4. `ArtifactClosureRecordV1`: two executables, not one generic blob

The artifact record is exactly **993 bytes**, with magic `FGV7ACL1`. It binds two named Mach-O executables:

- `floodgate-v7-trust-root-supervisor`; and
- `floodgate-v7-trust-root-verifier`.

Each has separate whole-file, semantic Mach-O, executable-identifier, designated-requirement, CodeDirectory, CDHash, dependency-closure, and entitlement-policy identities. The validator rejects equality between the two binaries' whole-file, semantic, executable-identifier, designated-requirement, CodeDirectory, or CDHash identity. It intentionally permits identical dependency-closure and entitlement-policy digests, because both executables may correctly use the same Apple-system-only dependency closure and the same empty or safe entitlement policy.

V1 fixes both payloads to thin arm64 `MH_EXECUTE`, minimum macOS 13.0, and macOS 14.4 SDK. Seventeen named counters must be zero:

1. fat-binary slices;
2. RPATH load commands;
3. relative loads;
4. non-system loads;
5. weak loads;
6. reexport loads;
7. upward loads;
8. lazy loads;
9. DYLD environment entries;
10. plugins;
11. preloads;
12. dangerous entitlements;
13. package scripts;
14. code-signing warnings;
15. notarization warnings;
16. staple warnings; and
17. Gatekeeper warnings.

The signing policy requires a Developer ID Application identity, secure timestamp, hardened runtime, and library validation for both executables. The container policy requires one signed flat package with exactly two regular files and both classified as the required executables. Non-executable regular files, symlinks, hardlink aliases, special files, and package scripts are all fixed to zero; directory entries are limited to the exact ancestors in the install policy. It also requires a Developer ID Installer identity, secure timestamp, accepted notarization, a stapled ticket, and successful Gatekeeper assessment.

Apple distinguishes [Developer ID Application and Developer ID Installer certificates](https://developer.apple.com/help/account/certificates/create-developer-id-certificates/). The later artifact stage must also follow Apple's [distribution-signing guidance](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/), [hardened-runtime policy](https://developer.apple.com/documentation/security/hardened-runtime), [notarization workflow](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), and [custom notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).

No real whole-file hash, signature, package, ticket, or Gatekeeper result is asserted here. Test-vector digests are explicitly not release identities.

## 5. `InstallPolicyRecordV1`: every ancestor is part of the decision

The install record is exactly **980 bytes**, with magic `FGV7INP1`. It fixes no-follow traversal, same-device closure, a local filesystem, and zero writable ACL entries. It encodes all nine paths and their metadata rather than summarizing them with one parent hash:

| Path                                                                                                                          | Kind         | Owner      | Mode | Link rule           |
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

Directory link count is **not** fixed to one. The policy requires it to be positive and stable across the future held-descriptor inspection. Only binary leaves require `nlink = 1`.

The record also binds the supervisor leaf to `ArtifactClosureRecordV1.supervisorWholeFileSHA256` and the verifier leaf to `verifierWholeFileSHA256`, in addition to the exact artifact-closure-record digest. Pure composition validation rejects a swapped pair or the right pair under the wrong artifact-closure record.

The source does not create these paths, call `chown` or `chmod`, elevate privilege, open a filesystem descriptor, or install anything. Those actions remain a separately reviewed future gate.

## 6. Negative-test coverage

Eleven new Swift tests bring the dependency-free package to **25 / 25** local source tests:

- pinned length, magic, fixed bytes, round trip, and SHA-256 vector for each record;
- short, long, trailing, wrong-domain, wrong-version, wrong-purpose, and reserved-field rejection;
- final Xcode, host range, root ownership, mode, immutable closure, and all zero-counter rejection;
- every required zero digest and CDHash rejection;
- pre/post toolchain drift and non-byte-identical build rejection;
- fat / non-arm64 / wrong file type / wrong minOS / wrong SDK rejection;
- mutation of every named forbidden Mach-O, DYLD, entitlement, package, and warning counter;
- equality rejection for only the supervisor/verifier identities that must differ;
- acceptance of shared safe entitlement and dependency-closure identities; and
- mutation rejection for every path byte and every owner, group, mode, kind, link-policy, and link-count byte;
- exact host-range boundaries (`14.0.0` accepted, 13.x and `15.0.0` rejected); and
- rejection of supervisor/verifier leaf swaps and wrong artifact-closure composition.

Repository-side evidence tests also enforce that the Swift package remains one library with no executable target, operational script, dependency, signer, installer, filesystem API, process API, network API, or production import.

Full-repository validation on the latest merged base also passed all **172 test files / 3,112 tests**.

## 7. What remains open

Policy source does not satisfy any artifact gate. The safe order remains:

1. review and regular-merge these three source-only policies;
2. acquire a supported root-owned release host with Apple-final Xcode and separately authorized credentials;
3. perform two clean, offline, dependency-free unsigned builds and prove byte identity;
4. close both Mach-O payloads independently and sign them with Developer ID Application;
5. build one script-free flat package, sign it with Developer ID Installer, notarize, staple, and assess it;
6. independently review the exact package and only then perform the fixed root-owned installation;
7. run installed-artifact substitution, owner, mode, link, ACL, mount, RPATH, DYLD, and replay negative tests;
8. separately implement authenticated create-only enrollment and a read-only inspector;
9. perform exactly one fresh production inspection; any mismatch, authentication failure, or indeterminate result means STOP; and
10. only after complete teacher generation, retraining, candidate selection, formal A/B, external calibration, strength evidence, and rollback evidence may live weights be considered.

## 8. Current decision

The policy boundary is now substantially more precise, but the actual release trust root still does not exist. The local Xcode is useful only for source tests and fails three independent release-toolchain conditions before credentials are even considered. There are no Developer ID identities, no notary profile, no signed package, and no installed verifier.

The current status therefore remains **`UNAVAILABLE / STOP`**. Production state, teacher data, trained candidates, and live weights are unchanged. The [machine-readable evidence](./data/floodgate-v7-release-artifact-install-policy-2026-07-17.json) records the canonical fields, exact install tree, local rejection facts, open gates, and zero production activity.
