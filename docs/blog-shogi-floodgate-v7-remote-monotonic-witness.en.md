# A source-only remote monotonic witness protocol — Floodgate v7

> This article records canonical Swift records, an in-memory reference CAS state machine, and an internal fail-closed comparison gate for a future remote rollback witness. It does not record a deployed endpoint, durable provider, production key, or live recovery run. The operational decision remains **UNAVAILABLE / STOP**. Japanese version: [blog-shogi-floodgate-v7-remote-monotonic-witness.md](./blog-shogi-floodgate-v7-remote-monotonic-witness.md)

## 1. Result

The change defines enough source and test behavior to ask a remote witness, “What is the latest authority checkpoint you have accepted?” and to reject a local authority state that does not exactly match the signed answer. It also defines the compare-and-swap transition a future provider would have to implement.

| Subject                                  | Current state                  |
| ---------------------------------------- | ------------------------------ |
| canonical checkpoint / request / receipt | implemented and tested         |
| reference CAS and idempotency behavior   | in-memory, internal, test-only |
| local-to-remote comparison gate          | internal, test-only            |
| real network endpoint                    | absent                         |
| durable remote state                     | absent                         |
| production witness key or KMS resource   | absent                         |
| authenticated production caller          | absent                         |
| root writer / provisioner                | absent / absent                |
| production supervisor / verifier         | unchanged STOP                 |
| live weights / live configuration        | 0 changes / 0 changes          |
| operational decision                     | **UNAVAILABLE / STOP**         |

The implementation commit is `b6bc5146f7512db9653a7e04aacaf363f65e3735`, with tree `d448abfc901cbf0570d43adfb50768c52e244282`. This is source and synthetic-test evidence only. It does not establish that rollback resistance survives a process restart, a provider outage, a split view, or a malicious signer.

The post-merge evidence-test defect exposed by the preceding change was fixed in PR #503 and regular-merged after all checks at `bb08e6019b1a42f631be06e400df01b1baf336f4`. This branch incorporates it through merge commit `92f3f5850c2896fb4194a1d4b885ec9e378a75b6`.

## 2. Three canonical records

All integers are big-endian. Schema version 1, reserved 0, production-recovery audience 1, and inspect-stale-prefix purpose 1 are fixed.

| Record                            | Magic      | Bytes | Purpose                                                                                                                                      |
| --------------------------------- | ---------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `AuthorityRollbackCheckpointV1`   | `FGV7ARC1` |   212 | fixes the journal identity, sequence, authority-key record, header, last entry, expected activation head, and predecessor witness checkpoint |
| `RemoteMonotonicWitnessRequestV1` | `FGV7RWR1` |   418 | carries a nonce-bound query or a conditional advance                                                                                         |
| `RemoteMonotonicWitnessReceiptV1` | `FGV7RCP1` |   530 | carries the signed request binding, accepted bit, checkpoint, and validity interval                                                          |

The checkpoint contains five required nonzero, pairwise-distinct 32-byte roles. Sequence 1 requires a zero predecessor. Later sequences require a nonzero `previousWitnessedCheckpointSHA256`, and a valid successor must name the exact SHA-256 of the current checkpoint.

A query has an all-zero 276-byte candidate tail. An advance carries both the expected current-checkpoint SHA-256 and a complete candidate whose predecessor equals that expected digest. The receipt consists of a 466-byte signed payload and a 64-byte Ed25519 signature. It binds the operation, accepted result, witness ID, endpoint ID, signer-key ID, client nonce, operation ID, complete request SHA-256, complete checkpoint SHA-256, checkpoint bytes, issue time, and expiry.

The shared JSON fixture is explicitly synthetic and non-operational. The independent Node parser reconstructs the layouts and cryptographic links without calling the Swift decoder.

## 3. Monotonic CAS and stable retries

The internal reference state machine serializes requests around one current checkpoint. A new advance succeeds only when:

- the expected digest equals the current checkpoint digest;
- the candidate sequence is exactly current sequence plus one;
- the candidate sequence does not exceed 4,096;
- the journal ID, authority-public-key-record digest, and journal-header digest remain fixed;
- the candidate predecessor equals the current checkpoint digest; and
- the bounded accepted-operation ledger still has capacity.

Concurrent advances from the same checkpoint therefore accept at most one successor. The reference retains up to 4,096 accepted `operationID → requestSHA256` entries, but it also has a separate maximum journal sequence of 4,096. Starting from sequence 1, at most 4,095 new successor checkpoints can be committed; an advance to sequence 4,097 stops even if a ledger slot would otherwise remain. This is a finite reference contract, not an indefinitely operating service.

An exact delayed retry remains accepted even after later checkpoints have committed and returns the original candidate. Reusing an operation ID that is already in the accepted ledger with a different request fails closed. Rejected operation IDs are not recorded, so this reference does not reject their later reuse.

Evaluation does not mutate state. The state machine first builds the response checkpoint, validates the 30-second window, constructs the signature payload, obtains a signature, and constructs the complete receipt. Only then, while still serialized, does it update the in-memory checkpoint and accepted-operation ledger. Invalid time, role aliasing that cannot produce a canonical receipt, signer failure, or malformed signature length leaves the in-memory state unchanged.

This is not a durable transaction design. A production provider must atomically persist the checkpoint and idempotency ledger, define crash recovery, and prove that an acknowledged receipt cannot diverge from durable state. The reference signer callback runs while the state-machine lock is held, so a future adapter must use a bounded, non-reentrant signer or replace this with a separately reviewed versioned signing protocol.

## 4. Fresh signed comparison

The internal gate samples its request-start clock and then takes a fresh local authority snapshot. Its internal test harness supplies the witness ID, endpoint ID, expected public-key bytes, client nonce, operation ID, clock, and fetch callback. The gate creates a fixed-audience, fixed-purpose query and proves that the signed receipt is bound to those supplied values, the complete request digest, and the signed checkpoint digest.

This establishes receipt binding, not nonce unpredictability or production public-key pinning. A production integration must provide and separately prove both properties.

Receipt lifetime is at most 30 seconds, with `issuedAt <= now < expiresAt`. The gate samples its trusted Unix clock at request start, receipt arrival, and completion. It rejects clock rollback, verifies freshness immediately after the fetch, reloads the local authority state and requires the original token to be unchanged, then verifies freshness again at completion. A receipt that expires while the final local check runs therefore stops instead of being accepted.

The signed remote checkpoint must exactly equal the local token's journal ID, sequence, authority-public-key-record SHA-256, journal-header SHA-256, last-journal-entry SHA-256, and expected-activation-head SHA-256. Remote-ahead, local-ahead, same-sequence forks, wrong keys, expired receipts, and a local advance during the remote callback all stop.

This is still one signed observation, not a lease on future witness state. It does not exclude a witness advance immediately after the response, a provider split view, a compromised signing authority, or a malicious trusted-clock implementation.

The final threat model requires either an independent-provider 2-of-2 or 2-of-3 quorum, or an append-only public log with gossip. This single signed observation satisfies neither requirement.

## 5. Public-surface boundary

The three canonical records and the operation enum are public data types so an independent implementation can encode, decode, hash, sign, and verify the wire format. The state store, comparison gate, and reference state machine remain internal. No public production handoff accepts a caller-selected witness store, provider, endpoint, transport, key, clock, or gate.

The symbol-graph checker pins the complete public/SPI surface and separately rejects protected witness types in unapproved callables, type aliases, stored properties, and function properties. It exact-whitelists the legitimate witness-data callables and four witness-typed data properties. This is a structural public-surface check; it does not prove method bodies or eliminate arbitrary `Any`, dynamic-cast, generic-wrapper, or runtime-reflection behavior. Source review and adversarial tests remain required.

## 6. Validation at the implementation commit

Validation at commit `b6bc5146f7512db9653a7e04aacaf363f65e3735` recorded:

- Swift package: **104 / 104 PASS**;
- Node/Vitest: **9 / 9 PASS**, comprising five independent golden-transcript tests and four focused runtime-evidence tests;
- Swift release build: **PASS**;
- local Xcode 15.3 / Swift 5.10 public surface: **575 symbols / 635 relationships**, normalized SHA-256 `57ff6311d811d0f4ae3459cdc65d0a87c2595f78a45d91565ba714f5c39f2461`; and
- final read-only source review: **P0 / P1 / P2 = 0 / 0 / 0**.

Applying only the previously measured toolchain transform yields a derived Xcode 26.5 / Swift 6.3.2 profile of **575 symbols / 678 relationships**, normalized SHA-256 `1c7cfd318999e04a46513d96895f6b345801b948937fdc01a7064fe42d16266a`. That profile is **derived / remote confirmation pending**. It is not counted as a remotely measured CI pass.

The tests cover canonical round trips and drift, zero and aliased roles, request and receipt binding, wrong key, signature mutation, issue/expiry boundaries, concurrent forks, exact and delayed idempotent retries, operation-ID drift, receipt-before-memory-commit atomicity, local mutation during fetch, post-fetch expiry, completion-time expiry, and trusted-clock rollback. Passing synthetic tests does not create operational evidence.

## 7. Provider research, not a provider decision

The likely next experiment is a single-region AWS design with one DynamoDB item read strongly consistently, conditional writes implementing the checkpoint CAS, a Lambda handler behind a fixed API Gateway Regional custom domain, and an asymmetric KMS signing key. AWS documents strongly consistent table reads and conditional item updates in [DynamoDB read consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html) and [condition expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html). API Gateway documents the Regional endpoint and custom-domain mapping in [Regional custom domain setup](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-regional-api-custom-domain-create.html), while client authentication and authorization still require a separately fixed policy. AWS KMS currently documents the `ECC_NIST_EDWARDS25519` signing key spec and the raw-message `ED25519_SHA_512` algorithm in its [key-spec reference](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html).

That makes DynamoDB + Lambda + KMS a plausible research candidate, not a selected architecture. No table, function, endpoint, IAM policy, KMS key, region, alarm, backup, recovery drill, latency measurement, cost estimate, or failure-injection run exists.

Two alternatives remain open: Cloudflare Durable Objects and Google Cloud Spanner. Cloudflare documents each Durable Object as a single-threaded actor with private transactional, strongly consistent storage in [What are Durable Objects?](https://developers.cloudflare.com/durable-objects/concepts/what-are-durable-objects/). Google documents externally consistent transactions and strong reads for Cloud Spanner in [TrueTime and external consistency](https://cloud.google.com/spanner/docs/true-time-external-consistency) and [transactions](https://cloud.google.com/spanner/docs/transactions). Neither alternative has been selected, provisioned, benchmarked, or threat-modeled for this protocol.

## 8. Explicit nonclaims

This change does **not** provide or prove:

- a network service, durable remote provider, transactional database schema, KMS key, production endpoint, transport authentication, authorization policy, rate limit, or audit sink;
- a writer, provisioner, root-owned installation, authority-state mutation, key rotation, backup, restore, disaster recovery, or restart-persistent rollback anchor;
- exclusion of split views, a malicious witness operator, compromised signer, malicious root, offline rollback, denial of service, or regional control-plane failure;
- a production supervisor/verifier run, a fresh production inspection, or safe reopening of the live path;
- teacher generation, retraining, candidate selection, formal A/B, external calibration, or playing-strength measurement; or
- any live weight overwrite, live activation, live configuration change, or evidence of stable high-dan strength.

In the fixture's machine-readable terms, `split_view_excluded` and `malicious_witness_signer_excluded` are both false. The source narrows a future protocol contract; it does not make the current product operational.

## 9. Safe next order

1. Regular-merge this source only after exact-commit review and all required CI, including a remotely measured Swift 6.3.2 symbol graph.
2. Choose one provider only after a written threat model compares consistency, conditional-write semantics, endpoint identity, authentication, authorization, signer behavior, failure domains, recovery, cost, and operator access.
3. Implement durable state and the 4,096-entry idempotency ledger as one atomic provider transition, with authenticated advances and strongly consistent queries.
4. Fix the endpoint, witness identity, Ed25519 public key, trusted clock, nonce generation, timeouts, and response-size limits outside caller control.
5. Add provider conformance, concurrency, crash, retry, stale-read, split-view, outage, backup/restore, and malicious-input tests in a separate PR.
6. Implement and review the root writer/provisioner and its ordering with the remote CAS; do not let local publication outrun durable witness acceptance.
7. Build, sign, notarize, install, and inspect the production artifacts under separate safety gates.
8. Only after an exactly matching fresh production inspection may teacher generation, retraining, candidate selection, sealed holdout, formal A/B, and external calibration resume.
9. Consider a reversible live activation only after strength, safety, monitoring, and rollback evidence all pass.

Until then, production recovery is **UNAVAILABLE / STOP**, and live weights remain unchanged.
