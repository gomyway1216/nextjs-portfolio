# Extracting a code-only Swift protocol that verifies before repository execution — Floodgate v7

> The [production recovery foundation](./blog-shogi-floodgate-v7-production-recovery-operator-foundation.en.md) found a circular bootstrap in which repository code under verification ran before its checks, then removed the former operator's launcher, preload, issuer, and CLI. This article covers the next boundary: the dependency-free Swift protocol library `FloodgateV7ExternalTrustRootProtocol`. It is not the external trust root itself. It creates no executable, installer, signing key, issuer, or production entrypoint, so the operational decision remains `UNAVAILABLE / STOP`. Japanese version: [blog-shogi-floodgate-v7-external-trust-root-protocol.md](./blog-shogi-floodgate-v7-external-trust-root-protocol.md)

## 1. Result

This change isolates a **pure protocol boundary** for approved enrollments held by a future native verifier outside the repository and the ordered activate / revoke / rollback operations applied to them. Its purpose is to represent trust policy as fixed-length, versioned, strict canonical bytes instead of an ambiguous object or repository-local callback.

| Subject                                          | Boundary in this change                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| deliverable                                      | dependency-free Swift library source under `native/floodgate-v7-external-trust-root-protocol` |
| executable / `@main`                             | absent                                                                                        |
| package script / production import               | absent / absent                                                                               |
| installer / canonical outside-repository install | absent / unimplemented                                                                        |
| signer / issuer / key material                   | absent / absent / absent                                                                      |
| approved commit / tree enrollment                | unimplemented                                                                                 |
| production-state access / mutation               | 0 / 0                                                                                         |
| recovery / retry / cleanup / resume              | 0 / 0 / 0 / 0                                                                                 |
| fixed status / decision                          | `UNAVAILABLE / STOP`                                                                          |

Defining a protocol does not establish signing, notarization, OS code-signing, a root-owned installation, or approved-revision enrollment. Parsing or canonicalizing a message with this library must never be treated as production authority.

## 2. Why a native Swift protocol

The old bootstrap allowed repository JXA, a Git-ignored `tsx/cjs` loader, and any clean but unapproved commit to execute before the trust decision. A future trust root needs the opposite order:

1. Launch a signed and notarized native binary from a fixed, root-owned path outside the repository.
2. Close over the OS code-signing identity, binary, runtime dependencies, and owner / mode / link count of every ancestor.
3. Read create-only enrolled approved commit and tree identities.
4. Verify the Git control closure and required source before executing repository code.
5. Issue a short-lived, one-shot external attestation only on an exact match.
6. Let only a separately reviewed read-only inspector consume that opaque attestation.

Swift integrates naturally with macOS code-signing and notarization boundaries and can be closed into one native executable. A self-contained JavaScript bundle still adds a Node or JSC interpreter, preload and environment behavior, module resolution, and dynamic-library closure to the trusted computing base, making it easier to reintroduce the circular bootstrap that was removed.

This library makes only approved enrollment, the activation log, pure state transition, and canonical rules reviewable inside the repository. Linking a native executable, installation, signing, notarization, and a fresh one-shot attestation remain separate gates.

## 3. The two canonical record types

The source module separates four roles:

| Source                   | Role                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `CanonicalBytes.swift`   | `CanonicalBytes20` / `CanonicalBytes32`, a big-endian codec, dependency-free SHA-256, and the canonical decode error |
| `EnrollmentRecord.swift` | exact 232-byte enrollment fixing the approved revision and artifact closure                                          |
| `ActivationRecord.swift` | exact 124-byte record ordering activate / revoke / rollback                                                          |
| `ProtocolState.swift`    | pure state machine that applies records and derives the active enrollment fail-closed                                |

`EnrollmentRecord` is exactly 232 bytes, with a fixed schema and domain encoded into the format. It carries `audience = productionRecovery`, `purpose = inspectStalePrefix100`, a 32-byte `enrollmentID`, nonzero `expectedUID`, 20-byte `approvedCommit` and `approvedTree`, 32-byte `sourceManifest`, `supervisorArtifact`, `childArtifact`, and `runtimeClosure`, plus `notBefore` and `expiresAt`. Its validity interval must satisfy `0 < notBefore < expiresAt`, avoiding ambiguity with an unset epoch value.

`ActivationRecord` is exactly 124 bytes. It carries the same fixed audience, `action = activate | revoke | rollback`, monotonic `sequence`, 32-byte `activationID`, `targetEnrollmentID`, and `previousActivationDigest`, plus `issuedAt`.

The record types use distinct fixed magic and encode integers in big-endian order. There are no strings, maps, optional fields, or variable field order, so the wire format cannot represent unknown or duplicate fields. Any invalid length, magic, tag, fixed value, range, or trailing byte collapses to one Equatable `invalidCanonicalRecord` error without disclosing details from private input.

`ProtocolState` separates canonical decode failure from operational state errors. The fixed enum cases are `duplicateEnrollment`, `duplicateActivation`, `invalidSequence`, `invalidPreviousActivationDigest`, `nonMonotonicIssuedAt`, `unknownEnrollment`, `revokedEnrollment`, `alreadyRevoked`, `alreadyActivated`, `rollbackTargetNeverActivated`, `enrollmentNotYetValid`, `enrollmentExpired`, and `sameEnrollmentAlreadyActive`. A failed transition is never partially applied. Each activation's canonical SHA-256 binds the next record through `previousActivationDigest`.

The state rules are intentionally narrow. `activate` is allowed only once per enrollment; returning to an enrollment that was active before requires `rollback`. A rollback target is not limited to the immediately preceding active enrollment: it may be any registered enrollment that was activated at least once, has not been revoked, and is within its validity interval at rollback time. Conversely, `revoke` is an irreversible safety operation, so it may target any registered enrollment even if it has never been activated or the operation occurs before `notBefore` or after expiry. The authority for the correct `previousActivationDigest` is not the caller; it is only the canonical digest of the preceding activation computed internally by `ProtocolState`.

Repository code being able to construct these records is not authenticated enrollment. Signature verification, create-only storage, and adoption authority belong only to the future outside-repository verifier. This module also does not yet implement the fresh-challenge, one-shot attestation handoff.

## 4. What the code-only boundary forbids

This stage intentionally does not implement:

- an executable target, `@main`, daemon, or privileged helper;
- a package command, JXA, Node, `tsx/cjs`, or dynamic module loader;
- filesystem, process, Git, network, or production-registry access;
- a Security / Keychain signer, issuer, or capability mint;
- private keys, public-key enrollment, certificates, or notarization artifacts;
- canonical-path creation, ownership or mode changes, or root privilege;
- reads or writes of the incident lease, stage, checkpoint, quarantine, or deployment key; or
- retry, cleanup, resume, teacher generation, training, or weight promotion.

The protocol library does not need production state. Keeping it to strict fixed-length records, canonical encoding and decoding, and pure state transitions makes it harder for a later implementation to smuggle authority into this layer.

## 5. Conditions for a non-circular bootstrap

The protocol can advance toward operation only after all of this evidence exists outside the repository:

| Gate            | Required evidence                                                                                                                      |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| native artifact | reproducible single artifact from a release toolchain, signature, notarization, dependency closure                                     |
| install         | canonical absolute path, root owner, group / other non-writable, complete ancestor closure                                             |
| enrollment      | authenticated create-only approved commit / tree plus rotation and rollback rules                                                      |
| repository      | exact HEAD match, clean required source, Git control / object / alternates closure                                                     |
| negative tests  | reject clean-but-unapproved, ignored-loader canary, external object store, foreign owner, writable ancestor                            |
| handoff         | separately from this record protocol: fresh challenge, short expiry, one-shot consumption, replay / substitution / downgrade rejection |
| inspector       | separate PR, zero arguments, read-only, STOP on mismatch / authentication failure / indeterminate                                      |

Repository unit tests that round-trip protocol values do not substitute for any row in this table. Tests run with the local Xcode toolchain establish only source-level development behavior; they are not evidence for a release binary, signature, notarization, installation, or installed artifact.

## 6. How to read validation

The validation allowed in this PR covers pure behavior such as exact 232 / 124-byte lengths, big-endian round trips, collapse of invalid magic / tag / length / trailing bytes to one error, copy isolation for `CanonicalBytes20` / `CanonicalBytes32`, SHA-256 test vectors, and state transitions with fixed errors. It opens no production path and touches no private path, key, or incident value.

Latest main `040f61ad6b44c6accb0db68375ec66877c021f17` (tree `3630df561f25d3d222f77ba650cddd97728071d9`) was regular-merged in merge commit `d7565c31b7fc862792858fc90f8ac66f68f30a7b`. The post-integration source-level measurements passed. Under local Xcode 15.3 build 15E5188j, Apple Swift 5.10 (swiftlang-5.10.0.12.7 clang-1500.3.9.3), targeting `arm64-apple-macosx15.0`, all 14 / 14 Swift tests passed (nine canonical-record tests and five state tests), building in 0.09 seconds and testing in 0.023 seconds. The repository-side Vitest evidence tests also passed 5 / 5 under Node 22.13.0. The full 170-file / 3,096-test Vitest suite, 80 Python stdlib tests, lint, and the production build passed as well (full lint retains 157 existing warnings outside this change and zero errors). A pass under this local Xcode establishes only source-level behavior under that local toolchain. Adoption of a release-artifact toolchain, artifact closure, code-signing, notarization, and Gatekeeper acceptance remain unestablished.

## 7. Safe next order

1. Review the code-only Swift enrollment / activation protocol and negative tests, then regular-merge them.
2. Fix the release toolchain, artifact closure, and canonical outside-repository installation policy in a separate PR.
3. Complete the signed/notarized outside-repository verifier and create-only enrollment under separate review and installation gates.
4. Run artifact-level negative tests for a clean unapproved commit, ignored loader, external Git store, and owner / mode failures.
5. Implement a zero-argument read-only inspector that accepts only the external verifier's fresh one-shot attestation in another PR.
6. After inspector review and regular merge, perform exactly one fresh inspection; mismatch, authentication failure, or indeterminate means STOP.
7. Only matching fresh evidence may open review of human-confirmed quarantine or a separately approved fresh restart.
8. Consider live activation only after complete teacher data, retraining, candidate selection, formal A/B, external calibration, playing-strength evidence, and rollback evidence.

## 8. Current decision

This protocol design is useful progress because it makes the message boundary small enough to review before building the external trust root. The external verifier is nevertheless not installed, and no approved commit or tree is enrolled. There is no production inspector, reconciliation authority, or retry authority.

The current decision is therefore **`UNAVAILABLE / STOP`**. Incident state, live weights, teacher data, and trained candidates remain unchanged. The [machine-readable record](./data/floodgate-v7-external-trust-root-protocol-2026-07-17.json) separates the code-only scope, forbidden authority, open artifact gates, and zero production access.
