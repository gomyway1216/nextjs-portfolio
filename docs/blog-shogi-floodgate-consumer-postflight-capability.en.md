# Closing the void gap with an exact receipt — Floodgate consumer postflight capability

> The [preceding runtime input claim](./blog-shogi-floodgate-consumer-runtime-claim.en.md) made it possible to claim, exactly once during synchronous invocation, the exact input that the production consumer passed to its callback. The existing consumer still returned `Promise<void>`, however, so it could not pass an exact object to a downstream finalizer proving that callback settlement, the post-callback filesystem revalidation, and both raw/root descriptor closes had all succeeded. This PR adds a postflight API that requires the synchronous input claim and mints a deeply frozen, single-use receipt only after the entire lifecycle succeeds. It is an in-process consumer input/lifecycle binding, not evidence of staged output, teacher labels, training, or playing strength. Real data, selection, and final holdout remain unused and unread. Japanese version: [blog-shogi-floodgate-consumer-postflight-capability.md](./blog-shogi-floodgate-consumer-postflight-capability.md)

---

## 1. `Promise<void>` did not compose successful provenance

The existing `withVerifiedPinnedFloodgateTrainingRows(...)` resolves with `void` after verifying the pinned bundle, running the callback, revalidating the snapshot after the callback, and closing its descriptors. That API retains its fail-closed behavior, but downstream receives no exact capability bound to the successful invocation.

```text
verified input -> callback -> postflight -> close -> void
                                                  |
                                                  +-> no exact lifecycle object
```

A future finalizer that verifies a private stage and seals a result/manifest therefore could not require, by object identity, proof that this consumer invocation synchronously claimed the exact input and subsequently completed postflight and closure. A Boolean or caller-reconstructed record would not be bound to the successful invocation itself.

The new API leaves the existing void API unchanged and returns a receipt through an explicit postflight variant.

- `withVerifiedPinnedFloodgateTrainingRowsAndPostflight(...)` uses the fixed production verifier
- `withVerifiedPinnedFloodgateTrainingRowsAndPostflightCoreForTests(...)` uses only the dependency-injected test boundary
- The legacy void API remains compatible, and its callback need not perform a runtime claim
- Only the new postflight API requires the exact synchronous input claim before minting a receipt

## 2. Minting follows one fixed order

The route to a postflight receipt has this order.

1. Verify the pinned training bundle and held filesystem snapshot
2. Build the pathless, deeply frozen callback input
3. Arm a runtime claim for that exact input immediately before the callback
4. Require the callback to claim the exact input during synchronous invocation—before the first `await` in an `async` callback
5. Close the claim window when the callback returns its native `Promise`, then single-use consume the successful-claim marker
6. Verify that the callback Promise resolves to `undefined`
7. Revalidate the held raw/root snapshot after the callback
8. Close both the raw descriptor and the root descriptor
9. Only if neither close reports an error, construct the receipt and register it in the matching postflight registry
10. Return the exact receipt to the caller

If the claim marker is absent at step 5, the consumer attaches only a rejection observer to the callback Promise, does not await settlement, and immediately enters failure handling and descriptor closure. An unclaimed callback therefore cannot retain the raw/root descriptors by returning a never-settling Promise.

```text
exact input claim
       |
       v
callback resolves undefined
       |
       v
filesystem snapshot revalidated
       |
       v
raw FD closed -> root FD closed
       |
       v
deep-frozen receipt minted and armed
```

A synchronous throw, asynchronous rejection, or value-bearing fulfillment yields no receipt. Neither does a change to the raw/root identity after the callback, or a failure while closing either descriptor.

## 3. The exact synchronous input claim is mandatory

Callbacks passed to the postflight API must synchronously complete the runtime claim added by the preceding boundary.

```ts
const receipt = await withVerifiedPinnedFloodgateTrainingRowsAndPostflight(
  options,
  async (input) => {
    claimActiveVerifiedPinnedFloodgateTrainingRows(input);
    await writeOnlyToPrivateStage(input);
  },
);
```

The consumer consumes the runtime registry's `claimed` marker when the callback returns synchronously. If the callback never claims, claims a clone, uses the production API for a test input, or postpones the claim to a microtask or after its first `await`, that marker is absent and the postflight receipt is not minted.

A callback failure after a successful claim still produces no receipt. The runtime claim is necessary but not sufficient; it is not authorization to bypass settlement, snapshot, or closure.

## 4. The callback must not return a value

The type is `Promise<void>`, but TypeScript alone cannot prevent a value-bearing runtime fulfillment. The new boundary checks the callback Promise's settlement value and rejects anything other than exactly `undefined`.

| Callback outcome                    | Receipt                                  |
| ----------------------------------- | ---------------------------------------- |
| `Promise.resolve(undefined)`        | Eligible if every later condition passes |
| Synchronous throw                   | Not minted                               |
| Rejected Promise                    | Not minted                               |
| `Promise.resolve("unexpected")`     | Not minted                               |
| Non-native / malformed Promise path | Rejected by the consumer guard           |

This prevents a callback-specific return value from becoming an implicit result or authorization. A separate finalizer must explicitly verify staged-output identity and teacher results before binding them into a manifest.

## 5. Mint only after snapshot postflight and descriptor closure

After the callback settles, the consumer uses the raw-file and root-directory descriptors held since startup to revalidate that the filesystem snapshot did not change across the callback boundary. It then closes both the raw and root descriptors.

The receipt is neither built nor entered into a registry before closure. A raw-close failure does not skip the root-close attempt, and an error from either close makes the operation fail. If callback processing and closure both fail, a combined failure retains the primary failure and the close failures; no success receipt exists.

That ordering lets these three receipt fields describe the same completion point.

```text
callback_settled_without_value: true
filesystem_snapshot_revalidated_after_callback: true
input_descriptors_closed: true
```

They concern only the input snapshot held by the consumer. They do not mean that the private stage, output bytes, allowed-file set, or publication durability has been verified.

## 6. Exact receipt fields and trust model

The receipt is built from null-prototype objects with non-writable, non-configurable fields and is deeply frozen, including all nested objects. Its top-level own keys have this exact order and set.

```text
schema
status
claim_boundary
execution_boundary
input
runtime_claim
postflight
```

`input.binding` captures the result-receipt bytes/SHA-256, bundle-manifest bytes/SHA-256, producer/verifier revisions, raw format, raw bytes/SHA-256, record/game counts, and game/parent/position identifier digests from the verified binding. The receipt contains no path, file descriptor, raw bytes, rows, role selector, staged output, or teacher label.

The principal constant values are as follows.

| Field                | Exact value / meaning                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `schema`             | `shogi-authenticated-floodgate-training-postflight-v1`                        |
| `status`             | `verified-runtime-input-claim-postflight-and-descriptors-closed`              |
| `execution_boundary` | Fixed production verifier or test-only injected verifier                      |
| `runtime_claim`      | The exact input was single-use claimed during synchronous callback invocation |
| `claim_boundary`     | Consumer input/lifecycle binding only, not output, label, or strength         |

The trust model is module-private object identity within one process. The receipt is neither a cryptographic credential nor a durable receipt; possession of the exact object gives the bearer authority. Downstream must not merely read its fields—it must synchronously claim the exact receipt through the matching claim API.

## 7. Production and test use separate postflight registries

As with runtime input claims, postflight receipts use two module-private `WeakSet`s.

```text
PRODUCTION_POSTFLIGHT_CLAIMS -> production receipts only
TEST_POSTFLIGHT_CLAIMS       -> CoreForTests receipts only
```

A production receipt can be claimed only with `claimVerifiedFloodgateTrainingConsumerPostflight(...)`. A CoreForTests receipt can be claimed only with `claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(...)`. Test dependencies have no route to add a receipt to the production registry.

Claiming is a single-use operation built on the captured native `WeakSet.prototype.delete`. Only the first claim of the exact receipt succeeds. A double claim, structured clone, spread/manual copy, `Proxy` targeting the exact receipt, or cross-registry claim fails. Failed clone and Proxy attempts do not consume the exact receipt, so the subsequent valid first claim still succeeds.

## 8. Failure matrix and nonclaims

| Condition                                                                           | Receipt mint   | Explanation                                      |
| ----------------------------------------------------------------------------------- | -------------- | ------------------------------------------------ |
| Synchronous exact-input claim, void settlement, stable snapshot, all closes succeed | Yes            | Completes the consumer lifecycle binding         |
| No input claim / clone / wrong registry / late claim                                | No             | Exact synchronous input provenance is absent     |
| Callback throw / reject / value-bearing fulfillment                                 | No             | Callback completion contract did not hold        |
| Raw/root snapshot changes after callback                                            | No             | Held input filesystem identity is unstable       |
| Raw/root descriptor close failure                                                   | No             | Input lifecycle is incomplete                    |
| Receipt clone / Proxy / double / cross-registry claim                               | Claim rejected | It is not the exact unclaimed single-use receipt |

A successful receipt explicitly does not establish any of the following.

- Private-stage contents, completeness, allowed file set, or durability
- Proposal/checkpoint, engine execution, search depth, score, or teacher label
- Result/manifest existence, authentication, publication, or admission to training
- Use of real training data
- Reading or winning on selection/final holdout
- Accuracy, Elo, rank, stability, or improved playing strength

Any bearer that obtains the active exact receipt in the same process can claim it. This primitive is not caller identity, module identity, `AsyncLocalStorage` affinity, or a sandbox against hostile same-process code.

## 9. Synthetic evidence

The new focused suite uses only temporary directories, synthetic training rows, a fake manifest/verifier, and instrumented descriptor closes. It does not touch a real bundle, real game records, an engine, a teacher, selection, or final holdout.

| Evidence                          | Result  | Coverage                                                                              |
| --------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| Consumer postflight focused suite | 14 / 14 | Exact receipt, deep freeze, single use, clone/Proxy/cross-registry rejection          |
| Postflight + existing consumer    | 61 / 61 | Joint regression of the new API and legacy void API                                   |
| Required input claim              | Covered | Missing/clone/wrong-registry/late/never-settling cases do not mint and close promptly |
| Callback completion               | Covered | Synchronous throw, asynchronous rejection, and value-bearing fulfillment do not mint  |
| Postflight filesystem check       | Covered | Post-callback mutation does not mint                                                  |
| Descriptor lifecycle              | Covered | Raw/root close ordering, return only after both closes, and each close failure        |
| Legacy compatibility              | Covered | The existing void API continues to accept a callback without a claim                  |

This evidence is a synthetic contract regression, not an experiment measuring game-record quality or engine strength. Fixture digests and revisions are synthetic as well and must not be interpreted as production-data results.

## 10. The result/manifest finalizer comes next

This PR lets a future coordinator receive successful consumer lifecycle provenance as an exact, single-use capability. The next boundary is a finalizer that verifies the private-stage artifacts, binds them to this postflight receipt and proposal/checkpoint evidence, and seals result and manifest files in a crash-safe order.

```text
authenticated proposal/checkpoint
            +
exact consumer postflight receipt
            +
verified private stage artifacts
            |
            v
result -> fsync -> directory sync
            |
            v
manifest -> fsync -> directory sync
```

The finalizer must at least distinguish the crash states `{work}`, `{work,result}`, and `{work,result,manifest}`, while making the manifest authenticate the work/result identities and consumer binding. Only then may the publication transaction proceed.

What exists now is a capability that composes an exact synchronous input claim, value-free callback settlement, post-callback snapshot, and raw/root descriptor closure into one process-local receipt. No real data, holdout, teacher label, training, or match evaluation has run, and there is no claim of stable high-dan strength.
