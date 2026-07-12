# Claiming a callback input exactly once — Floodgate consumer runtime provenance

> The [preceding training-row consumer](./blog-shogi-floodgate-training-row-consumer.en.md) held and verified the pinned training bytes by descriptor, then passed a pathless, deeply frozen `AuthenticatedFloodgateTrainingRows` object to a callback. Constructing another object with the same shape, however, is different from receiving the exact object that the production consumer is issuing right now. This PR adds separate module-private `WeakSet` registries for production and tests, arms a runtime claim only immediately before the callback, and provides a single-use claim over exact object identity. This is an ephemeral bearer-provenance boundary, not evidence of caller identity, `AsyncLocalStorage` affinity, successful consumer postflight, teacher search, or playing strength. Real data, selection, and final holdout remain unread. Japanese version: [blog-shogi-floodgate-consumer-runtime-claim.md](./blog-shogi-floodgate-consumer-runtime-claim.md)

---

## Current status

| Item                                   | Status          | Boundary closed by this PR                                                                                   |
| -------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| production runtime registry            | Implemented     | Only the module-private production `WeakSet` arms production callback inputs                                 |
| test-only runtime registry             | Implemented     | Isolates the dependency-injected core in another `WeakSet`, preventing it from minting production provenance |
| activation immediately before callback | Implemented     | Arms after input construction with no `await` between activation and callback invocation                     |
| exact-identity claim                   | Implemented     | Single-use claims only the identical object during synchronous callback invocation                           |
| revocation at synchronous return       | Implemented     | Deletes any remaining claim immediately after return/throw, before waiting for Promise settlement            |
| production runner integration          | Not implemented | Assumes a future runner claims synchronously on callback receipt, before its first `await`                   |
| caller / async-context affinity        | None            | Authority is bearer possession only, with no binding to a caller or `AsyncLocalStorage`                      |
| postflight / teacher / strength        | No evidence     | A successful claim does not mean the entire consumer or any teacher result succeeded                         |
| real data / selection / final holdout  | Unread          | This PR opens no data artifact or holdout label                                                              |

Here, “implemented” means that a primitive checks input-object provenance and single use during synchronous callback invocation. It does not mean that a production runner is connected, consumer postflight has completed, a teacher label exists, or playing strength improved.

## 1. A frozen shape is not runtime provenance

The consumer input is deeply frozen, and its schema, role, binding, and rows have been strictly verified. An object that copies those fields can nevertheless look and compare the same. A TypeScript type, schema check, or `Object.freeze` does not establish that an object is the instance issued to this production callback invocation.

```text
verified production input ── exact reference ──> eligible
{ ...verified production input }              ──> different object
new Proxy(verified production input, {})       ──> different object
```

The runtime claim does not parse the contents again. Only consumer internals register the exact input in a `WeakSet`; downstream code can claim only by presenting that same reference. Reconstructing the fields cannot reconstruct membership. The exact reference itself is the authority, however, so this is neither cryptographic identity nor caller authentication.

## 2. Production and CoreForTests use separate registries

Module scope contains two registries that are not exported.

```text
PRODUCTION_RUNTIME_CLAIMS -> WeakSet, boundary = production
TEST_RUNTIME_CLAIMS       -> WeakSet, boundary = test-only
```

The production entry point `withVerifiedPinnedFloodgateTrainingRows(...)` uses only the production registry. The dependency-injected `withVerifiedPinnedFloodgateTrainingRowsCoreForTests(...)` uses only the test-only registry. The registry objects, `WeakSet`s, and add / activation function remain module-private; the public API exposes only the claim side.

The corresponding claim APIs are separate as well.

- `claimActiveVerifiedPinnedFloodgateTrainingRows(...)` claims only from the production registry
- `claimActiveVerifiedPinnedFloodgateTrainingRowsCoreForTests(...)` claims only from the test-only registry

Passing a callback input created by CoreForTests to the production claim API therefore fails. Even if a test dependency constructs a self-consistent input, it has no path to add that object to the production registry and cannot mint production provenance. The reverse direction is likewise isolated: the test claim API cannot claim a production callback input.

## 3. Arm, delete, and revoke ordering

The runtime-claim lifecycle is fixed as follows.

1. The consumer builds a deeply frozen input from verified rows
2. Immediately before invoking the callback, it adds that exact input to the corresponding `WeakSet` and arms it
3. There is no `await` or other user callback between arming and callback invocation
4. A claim inside the callback synchronously invokes the captured native `WeakSet.prototype.delete`
5. A `true` deletion means success and consumes membership in the same operation
6. A `finally` revokes remaining membership immediately after the callback returns a Promise or throws synchronously
7. Only after revocation does the consumer guard the callback's native `Promise<void>` and wait for settlement
8. The claim is already expired for resolve, reject, non-native Promise, and value-bearing fulfillment paths
9. Filesystem postflight and descriptor closure occur after callback completion

Conceptually, the implementation has this shape.

```text
input = buildAuthenticatedInput(...)
available.add(input)                 // arm immediately before callback
let callbackPromise
try {
  callbackPromise = consume(input)   // async body runs synchronously to its first await
} finally {
  available.delete(input)            // revoke immediately after return / throw
}
await guardNativePromise(callbackPromise)
postflightAndClose()
```

The claim itself is a `delete`, rather than separate check and delete steps. Only the internal `delete` for the first exact-reference bearer returns `true`; a second attempt fails even during the same synchronous invocation. If the callback never claims, membership is gone as soon as the callback returns its Promise.

This narrow window is intentional. A callback can enqueue `queueMicrotask(...)` or `promise.then(...)` before returning an already-settled Promise, and that job can run before the consumer's `await` continuation. Leaving the input armed through Promise settlement therefore creates a race in any “expired at settlement” contract. Revoking at synchronous return prevents callback-scheduled microtasks, Promise reactions, and continuations after the first `await` from claiming.

## 4. What exact identity rejects

Claims use `WeakSet` key identity, not structural equality.

| Input and timing                                                     | Result   | Reason                                                         |
| -------------------------------------------------------------------- | -------- | -------------------------------------------------------------- |
| First claim of the exact input during synchronous callback execution | Succeeds | The identical reference exists in the corresponding registry   |
| First claim through another alias of the exact input                 | Succeeds | An alias is the same reference; bearer possession is authority |
| Spread, manual copy, or structured clone                             | Rejected | Equal fields do not make the same object identity              |
| A `Proxy` whose target is the exact input                            | Rejected | The proxy is a different `WeakSet` key from its target         |
| Production input passed to the test claim API                        | Rejected | The registry boundary differs                                  |
| CoreForTests input passed to the production claim API                | Rejected | The test core does not mint into the production registry       |
| Double claim of the same input                                       | Rejected | The first `delete` already consumed the single-use membership  |
| Saved input after synchronous return while Promise is pending        | Rejected | `finally` already revoked it without waiting for settlement    |
| Callback-scheduled microtask or Promise reaction                     | Rejected | It runs after callback return, outside the claim window        |
| Saved input after callback-Promise settlement                        | Rejected | It already expired at synchronous return                       |
| Structurally valid object created outside the callback               | Rejected | It was never armed in a registry                               |

Failure reports that the production or test-only boundary requires the “exact active unclaimed input.” The claim returns neither a Boolean token nor a copyable credential; on success it returns `void`.

## 5. The production runner must claim before its first `await`

A future production runner must invoke the production claim API synchronously as its first action after receiving the exact input at callback entry, before handing that input to other code and before its first `await`.

```text
await withVerifiedPinnedFloodgateTrainingRows(options, async (input) => {
  claimActiveVerifiedPinnedFloodgateTrainingRows(input) // first synchronous action
  await stageTeacherWork(input)                         // private stage only
})

// Reaching here means consumer postflight / close also succeeded
// Final publication occurs through a separate verified transaction
```

An `async` callback body runs synchronously until its first `await`, so this ordering consumes the claim before ordinary scheduled asynchronous work can observe the input. Claims after the first `await`, from `queueMicrotask`, a Promise reaction, or a timer are rejected because the callback has already returned its Promise. The registry does not enforce ordering within the synchronous invocation, however. If the runner hands the input to other synchronous code before claiming, that code can use the exact reference to claim first.

This is the important limitation. The claim has no affinity to the consume callback function, call stack, module, task, request ID, or `AsyncLocalStorage` context. Any bearer possessing the active exact reference within the synchronous-invocation window can win the first claim. If an unintended bearer claims first, the intended runner's attempt fails, but the registry does not determine which bearer was legitimate. Synchronous claiming is therefore a required caller-side protocol, not a substitute for caller authentication against a same-process adversary.

## 6. What a successful claim does not prove

A successful claim establishes only three narrow facts.

- The exact object was issued by the corresponding production or test-only consumer
- It was claimed before that consumer callback's synchronous invocation returned
- It had not already been claimed in that registry

The claim can succeed at callback entry, while filesystem postflight and descriptor closure occur only after callback-Promise settlement. It therefore does not establish successful postflight, final input-filesystem stability, resolution of the whole consumer, completeness of staged output, or publication authorization. The runner may create only a private stage inside the callback and still needs a separate artifact-verification / publication boundary after the outer consumer Promise resolves.

| Established by this PR                                   | Not established                                                        |
| -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Exact-object provenance for a synchronous callback input | Identity of the callback recipient or `AsyncLocalStorage` affinity     |
| Separation of production and test-only registries        | An ability for CoreForTests to mint production provenance              |
| Single-use claim and expiry at synchronous return        | Successful consumer postflight, descriptor close, or final publication |
| Rejection of clone / proxy / expired / double claims     | Teacher engine, proposal, search, score, or teacher-label results      |
| An API that adds no role selector or holdout path        | Reading real data, selection, or final holdout                         |
| A runtime capability boundary                            | Evidence about accuracy, Elo, rank, or improved playing strength       |

This PR does not execute the real bundle or read real training rows. Selection and final holdout remain unread, and it performs no teacher search or label generation. The runtime claim is ephemeral process state, not a durable result receipt or strength evidence.

## 7. Verification snapshot

| Validation                       | Result     | Scope checked by this PR                                                                            |
| -------------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| Targeted consumer Vitest         | 47/47 PASS | Existing parser / FD-consumer regression plus adversarial runtime claims                            |
| Production / test registry split | PASS       | Module-isolated fake production wiring proves production success and both cross-registry rejections |
| Forgery / lifetime vectors       | PASS       | Clone, Proxy, prototype, primitive, double, post-return, and failure paths                          |
| Scheduling vectors               | PASS       | Pending Promise, after first `await`, microtask, settled reaction, nested / concurrent              |
| Primordial poisoning             | PASS       | Captured native `WeakSet.add/delete` for activation, claim, and cleanup                             |
| Full-repository Vitest           | 1501/1501  | 97 test files                                                                                       |
| Python ML stdlib                 | 58/58      | ML contract regression, including `py_compile`                                                      |
| TypeScript                       | PASS       | `tsc --noEmit`                                                                                      |
| Full-repository ESLint           | 0 errors   | 157 existing warnings; no warning in the files changed here                                         |
| Production build                 | 193/193    | Static-page generation in the Next.js production build                                              |
| Independent security review      | 2/2 CLEAN  | Two separate reviewers found no P0–P2 after the synchronous-window fix                              |
| Prettier / diff check            | PASS       | Target source, test, and bilingual articles                                                         |

The targeted suite uses only temporary directories, synthetic rows, and a fake verifier. CoreForTests does not arm the production registry. The production-registry test runs only in a module-isolated instance with a synthetic verifier and manifest; it uses no real bundle, real training rows, engine, selection, or final holdout as input. An independent review first found the Promise-settlement / microtask race; after narrowing the contract to revocation at synchronous callback return and adding its reproducer, two reviewers independently reclassified the result as clean.

## 8. Conclusion

This small PR adds a runtime primitive through which the exact input issued by the production consumer can be claimed once during synchronous callback invocation. It separates module-private production and test-only `WeakSet`s, arms immediately before callback invocation, uses captured native `WeakSet.delete` for single use, and revokes immediately after the callback returns a Promise or throws. Clones, proxies, post-return inputs, double claims, and cross-registry claims do not pass.

At the same time, this is a bearer-possession boundary only. It has no caller or async-context affinity, and the registry does not identify the correct runner. The production runner must claim synchronously on callback receipt before its first `await`, and final publication must still be gated on successful postflight / close for the entire consumer plus a separate artifact transaction.

What exists now is only the runtime object-provenance primitive. It is not a result for a production runner, real data, selection, final holdout, teacher search, teacher labels, or playing strength.
