# Shogi evaluator: closing durable-witness transaction ordering in a service core

> This candidate translates the transaction ordering required of a future durable remote-witness provider into a Swift source/test-only core. No real service, cloud adapter, endpoint, KMS key, root writer, or production entry point exists. The service target is not a package product and has **0 public / SPI symbols and 0 production consumers**. The operational decision remains **UNAVAILABLE / STOP**, and live weights are unchanged. Japanese version: [blog-shogi-floodgate-v7-durable-witness-service-core.md](./blog-shogi-floodgate-v7-durable-witness-service-core.md)

> **Publication status: LOCAL SNAPSHOT MEASURED; EXACT COMMIT PENDING.** All discovered OP / STATE retry, endpoint-generation binding, and divergent-fork findings are reflected in the snapshot and local measurements below. The implementation revision, independent exact-commit review, PR, and GitHub CI remain pending, so these local results do not authorize production.

## 1. Conclusion

This candidate adds a provider-neutral `DurableRemoteWitnessServiceCoreV1` above the wire records and signature verification frozen in PR #504. The core fixes what an advance reads, what it signs, what enters one commit plan, how it reconciles an ambiguous result, and the point before which it must never return a response.

Only source-level ordering has been established.

| Item                                                   |              Current value |
| ------------------------------------------------------ | -------------------------: |
| Local Swift package tests                              |         **127 / 127 PASS** |
| New service-core tests                                 |           **23 / 23 PASS** |
| Service-target public / SPI                            | **0 public / SPI symbols** |
| Package products / production consumers                |                      0 / 0 |
| Cloud resources / network requests                     |                      0 / 0 |
| Root-state reads / writes                              |                      0 / 0 |
| Teacher / training / formal A/B / external calibration |              0 / 0 / 0 / 0 |
| Live weights changes                                   |                          0 |

The implementation revision, tree, PR, exact-commit review, and GitHub CI remain `null` or `PENDING`. A local PASS is not a reviewed commit or remote-CI result.

## 2. Isolated from products, public API, cloud, and root

The new Swift target is a regular package target but belongs to no package product. Its only dependency is the existing `FloodgateV7ExternalTrustRootProtocol`, and its only consumer is its test target.

An independent boundary checker inspects the package graph, source files, imports, forbidden capability markers, and symbol graph. The locally generated service graph under Xcode 15.3 / Swift 5.10 contains zero symbols and zero relationships. A release build also passes.

The source imports only `CryptoKit`, `Foundation`, and the existing protocol. It has no `public`, `open`, or `package` declaration, AWS SDK, `URLSession`, `FileManager`, environment access, Darwin / Glibc import, or executable entry point. The checker recursively scans the target's Swift sources. This is a structural surface gate; it does not establish cloud-provider safety.

The existing PR #504 articles and machine evidence are unchanged. This publication does not rewrite that history; it records only the new service-core candidate in separate files.

## 3. Transaction ordering

A query reads one transactional snapshot by operation ID, validates the deployment identity and snapshot, signs a receipt, rereads the exact transactional snapshot, and returns only if the complete state is unchanged. A signed rejection follows the same post-sign reread rule. Neither path commits.

A deployment identity also requires `endpointID = SHA256("FGV7DEI1" || witnessID || storeGenerationID)`. Reusing the old endpoint ID with a changed generation stops at construction. A new advance then follows this fixed order:

1. validate witness, endpoint, signer key, `storeGenerationID`, caller role, and `exactAttemptID`
2. transactionally read by operation ID
3. validate persisted deployment identity, independently observed `observedStoreGenerationID`, current checkpoint, and accepted-operation count
4. validate expected-checkpoint CAS, successor chain, and the 4,096-operation bound
5. construct, sign, freshness-check, and retain the last observed time for the accepted receipt
6. put request bytes / SHA, candidate, and `immutableInitialReceipt` into a create-only operation
7. freeze deployment identity, expected checkpoint SHA, expected operation count, replacement checkpoint, and operation in one exact commit plan
8. submit that plan to the abstract commit adapter
9. after `committed`, reread by operation ID and require the durable operation to match exactly
10. after `definitiveCASLoss`, reread and either return the exact same-request winner or sign a rejection for the different-fork winner and reread that exact state again
11. reverify freshness with clock samples chained monotonically across sign, commit, reconcile, and response
12. return only the reconciled durable receipt or the exactly revalidated rejection

A signing failure or clock rollback / expiry immediately after signing therefore occurs before commit. Even after commit returns, no response is released before durable reread and exact reconciliation.

The future adapter—not this closure—must provide atomicity. The core alone does not prove that checkpoint state, accepted-operation count, create-only ledger, and receipt outbox were committed in one durable transaction.

## 4. Ambiguous exact-plan resend and immutable outbox

Commit outcomes are split into `committed`, `definitiveCASLoss`, `transientConflict`, and `ambiguous`. For `ambiguous` or `transientConflict`, the core neither resigns the receipt nor rereads current state to construct another plan. It resubmits only the same `DurableRemoteWitnessCommitPlanV1`, including the same `exactAttemptID`, up to three times.

- if the exact plan was applied ambiguously and a later attempt reports `definitiveCASLoss`, reread and require that the durable winner is the same operation
- after three ambiguous results, `STOP` without inferring that the operation is absent
- after `committed`, `STOP` unless the matching durable operation exists
- after `definitiveCASLoss`, a same-request winner returns only its durable receipt; a different fork returns a freshly signed rejection only after another exact post-sign state reread
- reuse of an operation ID with drifted request bytes, nonce, or candidate stops

The operation record keeps canonical request bytes / SHA, the accepted checkpoint, and the first signed receipt as `immutableInitialReceipt`. Before any retry receipt is returned, the operation and current STATE must have provable lineage:

- the same sequence requires the exact accepted checkpoint
- one direct successor must pass the full successor check, including `previousWitnessedCheckpointSHA256 == acceptedCheckpoint.canonicalSHA256()`
- a divergent direct successor stops
- any STATE more than one step later stops, even if legitimate, because this snapshot carries no immutable intermediate checkpoints

Thus an exact unexpired retry returns the original receipt only at the accepted checkpoint or its proven direct successor. The conservative greater-than-one-step `STOP` is an explicit availability limit, not proof that multi-step history is invalid. Accepted-operation validation also caps the stored sequence at 4,096.

This is an abstract immutable-receipt outbox contract, not a deployed durable outbox. The adapter must atomically implement checkpoint CAS, operation-count CAS, the create-only ledger, and `immutableInitialReceipt`.

## 5. Expiry retry and restore generation

The maximum receipt lifetime is 30 seconds. If an accepted operation's initial receipt is still fresh and STATE is exact or a proven direct successor, an exact retry returns it unchanged. After expiry, the core signs a fresh receipt for the accepted checkpoint without modifying the stored operation, then transactionally rereads and requires the exact immutable operation, independently observed generation, and the same conservative lineage proof to remain valid. This expiry retry performs no commit and does not replace the outbox's `immutableInitialReceipt`.

If commit becomes durable but the response-time freshness check sees an expired receipt, the first call stops. A later exact retry can recover with a fresh receipt only while STATE remains exact or one proven successor later; after two or more later advances it stops until a future proof-carrying snapshot contract exists. This prevents an unproved fork from being treated as durable history.

Deployment identity includes `storeGenerationID`, while the snapshot separately carries `observedStoreGenerationID`. Both must equal the pinned generation or the core stops before signing. The endpoint ID cryptographically binds the `FGV7DEI1` domain, witness ID, and pinned generation. The observed value is explicitly required to come from physical provider metadata independent of restored table data. This supplies a restore-detection contract if a future adapter can provide that observation.

No component currently reads a physical table ID or provisions, uniquely derives, rotates, or durably binds that generation. The core's endpoint hash does not establish physical-generation uniqueness. There has been no backup/restore drill, and restored-table binding, offline-rollback exclusion, and restart-persistent protection remain unestablished.

## 6. Validation

The full Swift package ran locally with Xcode 15.3 build 15E5188j, Apple Swift 5.10, targeting `arm64-apple-macosx15.0`.

- debug build: 0.29 seconds
- tests: **127 / 127 PASS**, 3.343-second test body, 4.11-second wall time
- new `DurableRemoteWitnessServiceCoreTests`: **23 / 23 PASS**
- release build: PASS, 0.65 Swift-reported seconds, 0.83-second wall time
- local service symbol graph: 359 bytes, zero symbols / zero relationships
- boundary checker: zero products, zero external dependencies, zero production consumers, **0 public / SPI symbols**
- focused repository Vitest evidence boundary: one file / five tests PASS

The 23 tests cover post-sign query / rejection reread, role / independently observed generation mismatch, sign / commit failure, post-commit reconciliation, transient / ambiguous exact-plan resend, ambiguous-applied-then-definitive-loss, same-request and different-fork CAS outcomes, three-ambiguity STOP, competing forks, exact / direct-successor retry, same-sequence and direct divergent forks, unproved multi-step lineage STOP, expired retry and its post-sign reread, committed-but-expired response, clock rollback before and after commit and during refresh, the 4,096 boundary, endpoint-generation reuse, and wrong signer / aliased identity.

This is local source/test evidence. The implementation revision, exact-commit review, PR, and GitHub-CI symbol graph are still pending.

## 7. What remains between this core and AWS

AWS remains a research candidate. No provider has been selected and no resource has been created. The following official primary documentation describes semantics a future adapter must evaluate:

- [DynamoDB read consistency](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html): strongly consistent reads must be requested on tables / LSIs and are unavailable for GSIs / streams
- [DynamoDB condition expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html): foundations for create-only puts and conditional updates
- [DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html): same-Region all-or-nothing transactions, conflicts, and client-token idempotency
- [DynamoDB point-in-time recovery restores](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/pointintimerecovery_restores.html): restore creates a new table, so a new-generation identity still requires separate binding
- [AWS KMS asymmetric key specs](https://docs.aws.amazon.com/kms/latest/developerguide/symm-asymm-choose-key-spec.html): `ECC_NIST_EDWARDS25519` and raw-message `ED25519_SHA_512`

DynamoDB's transaction client token has a ten-minute idempotency window. It does not replace this service's 4,096-entry immutable operation ledger or delayed-retry contract. Global-table replication, streams, and backup propagation must not be treated as the same atomic view as a same-Region transaction.

There are currently zero DynamoDB tables, Lambda functions, API Gateway endpoints, IAM authorization policies, mTLS identities, KMS keys, alarms, backups, restore generations, or failure-injection runs. There is no real strongly consistent transactional read, physical TableId observation, physical-generation uniqueness enforcement, proof-carrying multi-step lineage, root writer, or PREPARE recovery. Single-provider operator / signer collusion, split views, a malicious signer, and regional control-plane rollback remain outside the established threat boundary.

## 8. Next gate

The immediate next step is to seal this implementation as an exact commit, complete independent review, run PR CI, and merge normally. The later order remains:

1. implement the abstract commit plan, real strongly consistent transactional read, and independent physical table-ID observation against one fixed provider adapter and atomic durable store
2. add proof-carrying multi-step OP / STATE lineage or freeze an explicit one-step retry-window policy
3. freeze the KMS signer, physical-generation provisioning / uniqueness, endpoint enrollment, TLS / mTLS, authentication / authorization, rate limit, and audit policy
4. implement restore-generation provision / rotation and run backup, restore, crash, retry, and outage tests
5. implement the root writer, provisioner, release installer, and inspector as separate gates
6. wire the remote witness fail-closed into every protected handoff
7. run a safe production probe on the target Mac
8. proceed through teacher 100 → 500 → 24,000, retraining, selection, formal A/B, and external calibration
9. consider a live change only after all evidence and a rollback rehearsal pass

Merging this source core alone does not reopen production recovery. The conclusion remains **UNAVAILABLE / STOP**. Playing-strength improvement and stable high-dan strength are unestablished, and live weights remain unchanged.
