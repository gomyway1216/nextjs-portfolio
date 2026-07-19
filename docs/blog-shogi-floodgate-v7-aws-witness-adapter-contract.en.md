# Shogi evaluator: freezing the AWS witness-adapter contract first

> This change candidate freezes the DynamoDB and KMS requests, responses, and failure rules needed to connect the durable remote witness to AWS. It is an isolated Swift package containing pure data contracts. There is no AWS SDK, credential access, network transport, Lambda, IaC, real resource, or production entrypoint. The operational decision remains **UNAVAILABLE / STOP**; teacher execution, training, and live weights remain unchanged. Japanese version: [blog-shogi-floodgate-v7-aws-witness-adapter-contract.md](./blog-shogi-floodgate-v7-aws-witness-adapter-contract.md)

> **Publication status: LOCAL PASS; REVIEW REMEDIATION APPLIED; PR #508 REREVIEW / CI RERUN PENDING.** Local debug and release Swift tests are 22 / 22, repository compatibility is 9 / 9, and the boundary checker passes. Independent rereview of the original pinned implementation and publication snapshot found zero P0, P1, or P2 issues. Two later findings from PR review and Swift 6.3.2 CI have now been remediated, so the new exact head has no production authority until rereview and every check pass.

## 1. Conclusion

The preceding `DurableRemoteWitnessServiceCoreV1` fixed the abstract ordering: read STATE and OP transactionally, place the STATE CAS, create-only OP, and immutable receipt in one commit plan, and resend only the identical plan after an ambiguous result. The provider boundary still lacked AWS-specific definitions for item counts, transaction actions, KMS DER keys, and physical table generation after restore.

This candidate closes that gap as five contracts.

| Contract            | Frozen behavior                                                              |
| ------------------- | ---------------------------------------------------------------------------- |
| provider DTOs       | SDK-independent async request, response, and failure envelopes               |
| Dynamo record codec | exact `STATE`, `OP`, and `ATTEMPT` items and canonical decoding              |
| Dynamo transaction  | two-item read, three-action write, and a token no longer than 36 bytes       |
| KMS                 | exact Ed25519 capability set, while Sign uses only `RAW` + `ED25519_SHA_512` |
| store generation    | exact `TableARN` and `TableId` across preflight and postflight               |

The provider shapes a future AWS adapter must obey are now testable. However, the preserved service core calls **SYNCHRONOUS** provider closures while every AWS DTO provider is async. A nonblocking AWS adapter cannot be plugged into that byte-exact core. An async service-core successor, or an equally strict nonblocking continuation design, is a prerequisite. No SDK call was made, so this does not claim that real DynamoDB durability or KMS signing has been established.

## 2. The reviewed service core remains byte-exact

The new `FloodgateV7AWSWitnessAdapterContract` package has one local dependency on the existing public protocol package. It publishes no product, has no production consumer, and emits zero public or SPI symbols. It adds no AWS SDK; source imports are restricted to `Foundation`, `CryptoKit`, and the existing protocol.

The boundary checker fail-closes the package graph, source and test inventories, import allowlist, forbidden capabilities, public/SPI symbol graphs, and its exact CI job. It forbids semaphore and sleep-based blocking bridges. It also pins the existing service core's package manifest, source, tests, and boundary checker by byte count and SHA-256.

| Boundary                                | Current value |
| --------------------------------------- | ------------: |
| package products                        |             0 |
| external dependencies                   |             0 |
| production consumers                    |             0 |
| public / SPI symbols                    |         0 / 0 |
| AWS SDK / network / credential APIs     |     0 / 0 / 0 |
| existing service-core fingerprint drift |             0 |

An earlier evidence test overreached by requiring exactly one upload-artifact action in the entire CI workflow while attempting to protect the external trust-root job. That rejected the legitimate artifact upload in this independent job. The gate now counts within the protected job. That job still requires exactly one upload, the exact action version and paths, `if: always()`, and `if-no-files-found: error`.

In PR #508's first CI run, `29670280886`, the Swift tests themselves passed, but a boundary checker calibrated only to Swift 5.10 `dump-package` metadata misclassified Swift 6.3.2's valid default trait `[{ "name": "default" }]` as identity or path drift. We differentially checked real output from the official Swift 6.3.2 toolchain against local 5.10 output. The checker now accepts only the known exact three-key and four-key forms; aliases, empty or unknown traits, unknown keys, and identity or path drift still stop. The symbol-graph upload failure was cascading: the early package-graph exit occurred before graph generation, rather than exposing a separate source failure.

## 3. Binding restore generation to `TableARN` and `TableId`

A DynamoDB restore creates another table. Persisting a generation ID only inside a data item is insufficient because the old value returns with the backup.

The contract validates two caller-supplied `DescribeTable` observations, named preflight and postflight, and requires:

1. exact equality between the pinned `TableARN` and both observed ARNs;
2. exact equality between the preflight and postflight `TableId`;
3. `ACTIVE` status in both observations;
4. no unknown provider-envelope fields; and
5. a lowercase ASCII UUID-shaped `TableId`; and
6. `SHA256("FGV7AWSGEN1" || length-prefixed TableARN || length-prefixed TableId)` as the generation ID.

A different `TableId` therefore yields a different generation ID. Because the service core cryptographically binds its endpoint ID to the store generation, reusing the old endpoint after restore can stop.

There is still no wrapper that enforces the runtime order preflight → operation → postflight, and there is no real `DescribeTable` call, table provision, backup, or restore drill. The future async integration must enforce and test that exact sequence; this package only validates supplied observations.

## 4. DynamoDB is fixed to a two-item read and a three-action write

The transactional read has exactly two ordered entries:

1. `STATE`;
2. the requested `OP#<operation-id>`.

A missing STATE, third response, reordered response, unknown field, or projection drift stops. A missing OP alone is allowed for a new operation. The suffix after `OP#` is read bytewise as exactly 64 lowercase ASCII hex digits. PR review found that a multibyte string could have 67 UTF-8 bytes while containing too few characters for the old Character indexing, which could trap. Character indexing is gone, and a regression test requires the same input to return `stop`. STATE must name the exact KMS-bound signer, and an existing OP's endpoint must match STATE. Decoders require the exact attribute set and reject unknown attributes, wrong types, leading-zero numbers, and checkpoint/request/receipt digest drift. The stored receipt signature is reverified with the KMS-bound public key.

The write has exactly three ordered actions:

1. conditional `STATE` update over deployment identity, store generation, checkpoint SHA, and operation count;
2. create-only `OP` put with `attribute_not_exists(PK) AND attribute_not_exists(SK)`;
3. create-only `ATTEMPT` put with the same condition.

The client request token is exactly 36 characters: `FGV1` plus Base32 of the first 160 bits of the exact commit-plan SHA-256. The only submit helper accepts validated commit input, internally builds the three-action request, and exact-revalidates it before invoking a provider. The short AWS idempotency token is not treated as a permanent ledger. OP and ATTEMPT are the transactionally stored delayed-retry evidence. An attempt ID may not alias the store-generation ID.

## 5. KMS accepts one Ed25519 shape

`GetPublicKey` must return the pinned key ARN, `ECC_NIST_EDWARDS25519`, `SIGN_VERIFY`, and the exact order-insensitive capability set `[ED25519_SHA_512, ED25519_PH_SHA_512]`. AWS does not let a key remove one of those two capabilities. The SPKI must be the exact 44-byte RFC 8410 Ed25519 form. The 32-byte compressed point must do more than encode a canonical y: it fully recovers x under RFC 8032 §5.1.3 and stops a value with no curve point, x = 0 with sign bit 1, or any of the eight small-order points before deriving the signer key ID. Acceptance by the CryptoKit initializer alone is not treated as point validation.

Although the key advertises both capabilities, this contract's `Sign` request is fixed to message type `RAW`, algorithm `ED25519_SHA_512`, and no grant tokens. A response is accepted only after its 64-byte signature verifies under the bound Ed25519 public key over the exact originating RAW request bytes. A signature for another message, an invalid signature, DIGEST mode, prehash signing, ECDSA, another key ARN, an all-zero signature, or unknown fields stops.

This does not call KMS. No key, IAM policy, key policy, rotation, multi-Region configuration, or audit policy exists yet.

## 6. No unknown success

Provider outcomes map conservatively.

| Provider outcome                                                         | Meaning returned to the core |
| ------------------------------------------------------------------------ | ---------------------------- |
| matching token, HTTP 200, nonempty request ID, no unknown fields         | `committed`                  |
| conditional-check failure                                                | `definitiveCASLoss`          |
| transaction conflict or throttling                                       | `transientConflict`          |
| timeout, unavailable network, or internal server error                   | `ambiguous`                  |
| transaction still in progress for the same token                         | `ambiguous`                  |
| access denied, missing resource, validation, or token-parameter mismatch | `stop`                       |
| unknown provider failure                                                 | `stop`                       |
| untyped thrown error                                                     | `ambiguous`                  |
| non-200, token drift, empty request ID, or unknown success fields        | `stop`                       |

A returning SDK call is not automatically success. Existing service-core logic resends only the identical plan up to three times after ambiguity and reconciles a winner through another transactional read.

## 7. Validation and measurements

Local validation used Xcode 15.3 / Swift 5.10 on arm64 macOS. The SwiftPM schema differential also ran the same `Package.swift` through the official Swift 6.3.2 toolchain and inspected its real output.

The original Ed25519 implementation revision `ed3932f6ec9818340144abf7949545ed292b1261`, with tree `e127fd5c21c6b611cd9c021257fe9c6d19a6f441`, has passed independent exact rereview. The post-review implementation revision is `2fcc0d29fb756db50d5042dacf7f64562d091173`, with tree `29de147b75318768c611dbbc84939c0f8154be81`; it includes safe multibyte operation-key rejection and the exact Swift 5.10 / 6.3.2 dual-schema boundary. Independent rereview and the PR CI rerun for this new snapshot remain pending.

Independent rereview covered publication revision `f332bdc8774593323ec91d567e01ca86a72ef097` (tree `8b7b5b57b6fea30dd538b725c1e1320709da7e5b`) and found **0 / 0 / 0** P0, P1, and P2 issues. The remaining publication-only follow-up records that verdict and the differential measurements above; it does not change the implementation.

- new package tests: **debug 22 / 22 and release 22 / 22 PASS** (4.75 / 4.10 seconds wall time)
- independent Ed25519 differential review: **4,810 unique encodings / 0 mismatches / 0 crashes / zero P0, P1, or P2 findings** (debug 43.816 seconds; release 1.727 seconds)
- real SwiftPM payload differential: **PASS on Swift 5.10 and 6.3.2**; unknown schema mutations stop
- repository compatibility: **2 files / 9 tests PASS**
- publication boundary: **1 file / 5 tests PASS**
- boundary checker: PASS
- package products / external dependencies / production consumers: **0 / 0 / 0**
- public / SPI symbols: **0 / 0**
- preserved service-core fingerprints: **4 / 4 exact**
- main `b8625cee` post-merge CI run `29666132754` and security run `29666132781`: **5 / 5 jobs and 59 / 59 reported steps PASS**
- PR #508 first run `29670280886`: AWS job **failed on schema calibration**, now remediated locally and awaiting rerun
- AWS resources / network calls / credential reads: **0 / 0 / 0**
- teacher / training / formal A/B / external calibration / live changes: **0 / 0 / 0 / 0 / 0**

These numbers validate a source contract, not real AWS durability or playing strength.

## 8. Next gate

Ready PR #508 is open. The next action is independent rereview of the remediated exact head, followed by a PR CI rerun in which every check passes. Later work remains separated:

1. rereview PR #508's fixes, require every check including the isolated AWS job on that exact head, and merge normally;
2. merge the planned fail-closed aggregate CI edge so `Test and build` cannot pass when the AWS job fails;
3. implement and independently review an async service-core successor, or a strict nonblocking continuation design, preserving dynamic read → sign → reread/commit/retry ordering;
4. implement the SDK-backed adapter and enforce the exact DescribeTable preflight → operation → postflight sequence without semaphores or blocking bridges;
5. inject timeout, conflict, transaction-in-progress, and ambiguous-apply failures in a provider emulator;
6. separately review table, KMS, IAM, backup, restore, and audit policy before touching an AWS account;
7. run crash, retry, and restore-generation drills outside production, connect every protected handoff fail-closed, and run a safe target-Mac probe; and
8. only then continue teacher 100 → 500 → 24,000, retraining, selection, formal A/B, and external calibration.

Primary AWS references used for this contract are [DynamoDB TransactGetItems](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TransactGetItems.html), [transaction semantics](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html), [TableDescription / TableId](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_TableDescription.html), [DescribeTable](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_DescribeTable.html), [point-in-time restore](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/pointintimerecovery_restores.html), [KMS GetPublicKey](https://docs.aws.amazon.com/kms/latest/APIReference/API_GetPublicKey.html), [KMS Sign](https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html), and the [KMS Ed25519 key-spec table](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html). Ed25519 point encoding and verification follow [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032.html).

There is no real adapter or resource yet, so production recovery remains closed. Stable high-dan strength, playing-strength improvement, and any live weight change remain unestablished.
