# Floodgate v7 external supervisor / verifier source boundary

> This change defines the external trust-root signed handoff, independent verifier, activation rollback protection, process identity, and future runtime-launch policy as Swift source and tests. The two executable targets do not link the protocol library, read no input, and always stop with exit 78 and zero stdout/stderr bytes. There is still no root install, production key, production activation head, real process launch, or production inspection, so the operational decision remains **UNAVAILABLE / STOP**. Japanese version: [blog-shogi-floodgate-v7-external-supervisor-verifier-source.md](./blog-shogi-floodgate-v7-external-supervisor-verifier-source.md)

## 1. What this boundary adds

| Boundary           | Fixed in source / tests                                                                                                                                          | Still absent                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| authority records  | verify-only replay of Ed25519-signed enrollment and activation envelopes                                                                                         | root-owned selection of the production authority public key; any private key    |
| anti-rollback head | exact 84-byte record for authority key ID, latest activation sequence, and latest signed-envelope digest                                                         | root-owned create-only storage and fresh loading                                |
| source manifest    | approved commit/tree, repository closure, bundle/JXA/Node, three executable-role code identities, role keys, and policy digests                                  | independent filesystem observation                                              |
| process identity   | PID/PPID/EUID, unique ID, start time, audit token, parent identity, whole-file, CodeDirectory, designated requirement, held executable, and anonymous-FD channel | audit-token acquisition, no-follow open, and code-sign inspection               |
| handoff            | signed challenge → verifier receipt → one-shot attestation, at most 30 seconds, wall and monotonic clocks, single use                                            | system-clock, CSPRNG, and IPC wiring                                            |
| runtime policy     | supervisor directly launches pinned Node while authenticated JXA stays dormant and is never executed                                                             | canonical preimages for argv/cwd/env/install policy and process-group lifecycle |
| executable targets | named supervisor / verifier fixed STOPs                                                                                                                          | operational wiring, signing, notarization, packaging, and installation          |

The implementation source revision is `e4ae076f1540d849707c1cf6e7be8bc253555f4a`, based on PR #496's regular merge `163dc696e4e6453919547386294058285516c236`.

## 2. Separating “signed” from “current”

A correctly signed chain is not necessarily current. An attacker could remove a newer revoke or rotation from the tail and supply an older signed `activate` prefix whose signatures and internal chain remain valid.

`ExpectedActivationHeadV1` therefore fixes:

- the authority signer key ID;
- the latest activation sequence; and
- the latest signed activation-envelope SHA-256.

The supervisor and verifier independently replay the signed chain from the beginning and continue only when the final sequence and envelope digest exactly match the head. The adversarial test sets a signed sequence-2 revoke as the current head, truncates the input after the sequence-1 activation, and observes rejection.

The authority, supervisor-attestation, and verifier-attestation key IDs must also be pairwise distinct. This fails closed if provisioning accidentally collapses revocation authority and runtime-attestation authority into one key.

A head or public key supplied by repository code or an arbitrary caller is not trusted. Production use still requires separate root-owned, create-only storage, fresh reads, and rollback protection. Tests use newly generated ephemeral keys only; no production key material exists here.

## 3. The verifier independently rechecks the supervisor

The independent verifier checks more than the challenge signature:

- supervisor whole-file SHA-256;
- CodeDirectory SHA-256;
- designated-requirement SHA-256;
- held-executable identity SHA-256;
- equality of supervisor PID and target PID;
- equality of supervisor process identity and target identity;
- direct supervisor → verifier parentage;
- verifier artifact, code identities, and anonymous-FD channel;
- every repository-observation closure field, UID, PID, and target identity;
- approved commit/tree, clean repository, Git common/object directories, and absence of alternates and replacement objects; and
- the current activation head.

Adversarial tests create a different artifact holding the correct supervisor key, a challenge that separates target from supervisor, and a bad-observation receipt signed by the correct verifier key. All are rejected.

`VerifierReceiptV1.verify` and `OneShotAttestationV1.verify` are internal so callers cannot mistake partial-chain checks for safe public entry points. Public full-chain entry points are verifier receipt issuance, the stateful supervisor session, and the final one-shot consumer.

## 4. Rechecking the head through final consumption

The challenge is valid for at most 30 seconds under both wall and monotonic clocks; receipts and attestations cannot outlive it. The session rejects clock rollback and cannot turn the same challenge or receipt into two attestations. The consumer atomically consumes the attestation ID, challenge, receipt, and child-process identity once.

The signed challenge includes the SHA-256 of the complete 84-byte head. Receipt verification, attestation issuance and verification, and final consumption then require an exact match to the current head's canonical digest. If a new revoke advances the head after receipt issuance—or only the authority key ID or sequence changes—the old transcript is rejected immediately instead of retaining the remainder of its 30-second lifetime.

## 5. A runtime-launch policy is not an implementation

`RuntimeLaunchPolicyRecordV1` fixes the intended future architecture:

1. The external supervisor directly launches the pinned Node image.
2. The JXA launcher remains authenticated dormant source and is never executed.
3. The runtime is root-owned and has no writable ancestor.
4. A held no-follow runtime identity is used; the actual image is rechecked after suspended spawn and before resume.
5. A new process group, anonymous attestation FD, and bounded stdout/stderr are used.
6. Caller arguments, caller environment, shell, and intermediary launcher processes are forbidden.

This is a 220-byte policy record, not process-launch code. The fixed argv, working directory, environment, and runtime-install policy are currently opaque digests; canonical preimage records that let independent implementations recompute those digests do not yet exist. Operational wiring is blocked until they do.

Knowing the current user-owned Node path and reported version does not authenticate its bytes, owner, ancestors, or CodeDirectory. This boundary therefore does not treat that Node runtime as production-safe. The existing two-file install policy also does not install Node.

## 6. Structurally inert executable targets

`floodgate-v7-trust-root-supervisor` and `floodgate-v7-trust-root-verifier` exist as Swift package targets, but both have empty dependency lists. Their source is only Darwin `_exit(78)` and does not link the protocol library, Foundation, CryptoKit, or NSLock.

With arbitrary argv, environment, stdin, and cwd, both measured exit 78 with zero stdout and zero stderr bytes. The release binaries dynamically depend only on `libSystem` and weak `libswiftDarwin`. This local build is not evidence of a signed, notarized, installed release artifact.

## 7. Measurements and nonclaims

Under Xcode 15.3 / Swift 5.10, Swift tests are **37 / 37 PASS**, the release build passes, and the fixed-STOP integration passes. Coverage includes canonical record round trips and counts, signature mutation, wrong role keys, history truncation, process/code/channel substitution, clock rollback, expiry, observation drift, and one-shot replay.

This revision performed:

- 0 production inspector runs;
- 0 production authority/head loads;
- 0 root installs;
- 0 private clean-room copies;
- 0 teacher generation;
- 0 training, candidate selection, or formal A/B runs; and
- 0 live-weight activations.

It adds no playing-strength evidence and does not change the live evaluator. The separate machine-readable record is [floodgate-v7-external-supervisor-verifier-source-2026-07-17.json](./data/floodgate-v7-external-supervisor-verifier-source-2026-07-17.json).

## 8. Next gates

At minimum, later PRs must separately review:

1. root-owned create-only authority-key and activation-head storage, fresh loading, and rollback protection;
2. canonical preimages for fixed argv, cwd, environment, and runtime-install policy;
3. fixed-test-key golden challenge / receipt / attestation bytes and digests for future cross-process parsers;
4. actual filesystem, Git, code-sign, and audit-token observation;
5. held runtime image, suspended spawn, process group, TERM→KILL→reap, and bounded output;
6. signed/notarized packaging and root installation; and
7. a zero-argument read-only production inspector.

Production recovery remains **UNAVAILABLE / STOP** until those boundaries pass review, CI, and regular merge.
