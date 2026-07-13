# Owning the production stable and teacher runtimes under one deadline-bounded zero-work lifecycle

> The earlier [runtime digest authority](./blog-shogi-floodgate-production-runtime-digest-authority.en.md) made receipt digests available only from exact stable and teacher facades issued by matching factories. It still did not provide one deadline-bounded lifecycle for initializing both runtimes and recovering them after failure or shutdown. This change adds a zero-argument production entrypoint and starts both factories before awaiting either. It passes each accepted source Promise itself to the captured `Promise.allSettled` and calls the matching production getters only after both succeed. Its public facade contains only `receipt`, `close`, and `abortAndDrain`; it starts no parent position, stable proposal, teacher search, or checkpoint. Focused tests execute only the injected `CoreForTests`. They are not evidence that production assets, the production engine pool, a live environment, or playing strength ran. Japanese version: [blog-shogi-floodgate-v7-production-runtime-owner.md](./blog-shogi-floodgate-v7-production-runtime-owner.md)

---

## Current boundary

| Item                        | Current implementation and validation                                                | What this change establishes                                                    |
| --------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Production entrypoint       | Zero arguments; fixed stable / teacher factories and matching production getters     | Dependencies cannot be injected into the production path                        |
| Test entrypoint             | `CoreForTests` with exactly four dependencies                                        | A test harness for concurrency, timeouts, failure, and lifecycle mechanics only |
| Initialization deadline     | Production 180,000ms; test 250ms                                                     | Bounds permanent pending, source cycles, and inherited-`then` stalls            |
| Cleanup deadline            | Production 30,000ms; test 250ms                                                      | Waits for accepted cleanup settlement or timeout                                |
| Timeout recovery            | Cleans known runtimes; best-effort cleans each late trusted fulfillment exactly once | Does not claim ownership of unresolved factory resources                        |
| Production digest authority | Calls exact-facade production getters after both production factories succeed        | Ephemeral authority in the same process and module instance                     |
| Cleanup result              | Exact-native Promise must fulfill with `undefined`                                   | A runtime value cannot count as successful cleanup                              |
| Owner work surface          | Only `receipt`, `close`, and `abortAndDrain`                                         | Cannot perform a parent operation, proposal, rescore, or label                  |
| Focused validation          | 49 / 49 pass on Node 22                                                              | Not a count of production-factory or live-deployment executions                 |
| Strength                    | No games, Elo, or rank measurement                                                   | No claim of improved strength or stable high-dan level                          |

Zero-work does not mean that runtime-factory initialization costs nothing. The production code path can initialize the stable worker pool and teacher process pool. It means that the owner accepts no parent position and neither exposes nor starts proposal, search, or rescore work.

## 1. Put both factories under the same ownership

The production entrypoint is module-fixed to four functions.

- `createFloodgateProductionStableWasmRuntime`
- `createFloodgateProductionTeacherUsiRuntime`
- `getFloodgateProductionStableWasmRuntimeReceiptDigest`
- `getFloodgateProductionTeacherUsiRuntimeReceiptDigest`

It invokes the teacher factory after invoking the stable factory but before awaiting the stable result. A synchronous throw or contract-invalid return becomes an internal rejected Promise, so it cannot prevent the other factory from starting. A valid Promise returned by a factory receives own pinned `constructor` and `then` properties. The owner creates no wrapper or `resolve(value)` bridge: the source itself enters the captured `Promise.allSettled`.

| Factory result                                   | Operation failure                                       | Failure cleanup                                                               |
| ------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Both trusted-fulfill within the deadline         | Zero; attempt each digest getter once                   | Zero before returning the owner                                               |
| One rejects and the other trusted-fulfills       | Known failures remain in stable-then-teacher order      | `close` or `abortAndReap` the known runtime                                   |
| One has a known failure and the other is pending | Preserve the known failure, then initialization timeout | Clean any runtime known at timeout                                            |
| A trusted runtime fulfills after timeout         | Do not change the already-published timeout error       | Late observer best-effort cleans each runtime exactly once                    |
| A factory remains pending forever                | Initialization timeout                                  | No resource-ownership claim without a captured capability                     |
| Both fulfill and then digest lookup fails        | Attempt both getters independently                      | Attempt `stable.close()` and `teacher.abortAndReap()` within cleanup deadline |

Initialization waits until every accepted Promise settles or the owner deadline expires: 180,000ms in production and 250ms in tests. A timeout preserves every factory rejection or runtime-capture failure already known in stable-then-teacher order, followed by the timeout failure. A throw from the first digest getter does not hide the second attempt. Digest validation uses the captured `String.prototype.charCodeAt` to check exactly 64 lowercase-hex code units; uppercase, short, and non-string values fail closed.

## 2. Separate production and test receipts

Production and test use the same lifecycle algorithm, but they do not share authority claims.

| Receipt field                | Production boundary                                            | Test boundary                                                                      |
| ---------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `contract`                   | `shogi-floodgate-v7-production-runtime-owner-v1`               | The same contract                                                                  |
| `execution_boundary`         | `production-fixed-stable-and-teacher-runtime-factories`        | `test-only-injected-runtime-factories-and-digest-getters`                          |
| `status`                     | `initialized-zero-work-stable-teacher-runtime-lifecycle-owner` | `initialized-injected-test-lifecycle-harness-not-production-or-zero-work-evidence` |
| `digest_authority`           | `exact-production-facade-authorities-v1`                       | `injected-test-getters-not-origin-authority-v1`                                    |
| `initialization_timeout_ms`  | `180000`                                                       | `250`                                                                              |
| `cleanup_timeout_ms`         | `30000`                                                        | `250`                                                                              |
| `plain_receipt_origin_claim` | `false`                                                        | `false`                                                                            |

The exact `claim_boundary` values are the following literals. Production wording never enters a test receipt.

- Production: `concurrent-fixed-production-runtime-initialization-exact-production-facade-digest-lookup-and-first-valid-zero-argument-call-wins-deadline-bounded-cleanup-not-parent-operations-producer-coordinator-checkpoint-key-label-training-weight-live-or-playing-strength-evidence`
- Test: `injected-runtime-lifecycle-harness-and-injected-digest-getters-not-production-origin-zero-work-or-playing-strength-evidence`

`lifecycle` records initialization as `concurrent-factories-captured-all-settled-with-owner-deadline-v1`, initialization-failure cleanup as `known-trusted-fulfilled-stable-close-and-teacher-abort-and-reap-deadline-bounded-v1`, and completion as `all-accepted-promises-settled-or-owner-timeout-failure-v1`. Its Promise policy is `trusted_factory_promise = pinnable-undecorated-exact-native-promise-v1` and `invalid_factory_promise = rejected-before-authority-best-effort-observation-not-runtime-ownership-v1`. Its transition policy is `transition = first-valid-zero-argument-call-wins-later-calls-return-exact-same-promise-v1`, `pre_transition_invalid_arity = reject-without-establishing-transition-v1`, and `late_invalid_calls = join-existing-transition-v1`. Its `close` literal is `stable-close-and-teacher-close-deadline-bounded-v1`; `abort_and_drain` is `stable-close-and-teacher-abort-and-reap-deadline-bounded-v1`.

Even the production receipt records authority only within the current process, module instance, and owner initialization. Copying the receipt object or either digest string into another context does not transfer authority. A test getter is caller-injected, and the owner verifies only lowercase 64-hex output. A test receipt must therefore never be treated as production digest authority.

Both receipts set all common `nonclaims` to `false`: `parent_operations`, `producer`, `production_coordinator`, `checkpoint`, `key_authority`, `teacher_label`, `training`, `weight`, `live_deployment`, `playing_strength`, `invalid_promise_runtime_ownership`, `injected_behavior_evidence`, `unresolved_factory_resource_ownership`, and `invalid_promise_rejection_observation`.

A test receipt additionally sets `production_factory_execution`, `production_runtime_origin`, `production_exact_facade_digest_authority`, and `zero_work_evidence` to `false`. A timed-out pending factory therefore does not establish ownership of a downstream resource, and the owner does not claim that it necessarily observed rejection from an invalid Promise that could not be pinned.

## 3. Admit only pinnable exact native Promises

Factory and cleanup methods must return a pinnable exact native Promise, not merely a `PromiseLike`. An accepted value must satisfy all of the following conditions.

1. It has native Promise internal slots.
2. It is not a Proxy.
3. Its prototype is exactly the `Promise.prototype` captured at module load.
4. A fresh source has no own keys, or a reused source has membership in the captured adopted-source `WeakSet`.
5. Its `constructor` can be pinned non-configurably to the private species holder.

The owner freezes the accepted source Promise after pinning own non-writable `constructor` and own non-writable `then` properties; the latter delegates through the captured native `then`. A reusable adopted source therefore has both `constructor` and `then` own keys, not only `constructor`. Its legitimacy comes from captured `WeakSet` membership rather than a guess based on key shape. The owner does not build a bridge that sends the fulfillment value through another Promise's `resolve(value)` and re-assimilates it. The source itself is the all-settled input; only a synchronous throw or contract-invalid return is converted to an internal rejected Promise.

This protection covers re-assimilation after the owner accepts a source. If a pending source's native resolve later receives a runtime facade while `Object.prototype.then` exists, that source Promise's native resolution may itself invoke the inherited `then`. The owner does not make a zero-trap claim for that event. If it stalls, the initialization deadline bounds it and the owner cleans an already-known peer runtime. In contrast, the owner does not pass a runtime that fulfilled before the mutation through a second `resolve(value)`.

## 4. Observation of invalid or decorated Promises is best-effort, not ownership

Thenables, Promise Proxies, subclass or cross-realm Promises, and decorated native Promises outside the owner-adopted set violate the contract. The owner rejects them rather than accepting their fulfillment as a runtime and never captures stable or teacher lifecycle capabilities from them.

| Invalid return                               | Owner behavior                                                        | Explicit nonclaim                                                          |
| -------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Thenable                                     | Reject without reading `then`                                         | No assimilation                                                            |
| Promise Proxy                                | Reject without triggering Proxy traps                                 | No ownership of the wrapped Promise                                        |
| Subclass / cross-realm Promise               | Reject because the exact prototype differs                            | No settlement observation                                                  |
| Pinnable decorated same-realm native Promise | Attach a captured-`then` best-effort observer and reject              | No semantic use of fulfillment, runtime ownership, or raw-settlement proof |
| Unpinnable / hostile rejected native Promise | Convert to a contract failure, but safe observation may be impossible | No rejection-observation guarantee or absorption of unhandled risk         |

The best-effort observer exists only to avoid abandoning a later rejection from an invalid native Promise where possible. It does not feed a fulfillment value back into the owner, await that Promise, or count it as a cleanup target. A non-extensible Promise or one with a non-configurable hostile `constructor` can be rejected before a safe observer can be attached. If it was already rejected, a host-level unhandled-rejection risk remains; responsibility for it stays with the producer of the invalid Promise.

The receipt's all-settled-or-timeout language therefore applies to accepted trusted source Promises and exact-native cleanup Promises. It does not prove resource ownership, eventual settlement, stopping, reaping, or rejection observation for an invalid or decorated raw Promise or a permanently pending factory. When one side is invalid, a trusted runtime fulfilled by the other side still goes through the normal `stable.close()` or `teacher.abortAndReap()` failure cleanup.

## 5. First-call-wins begins with the first valid transition

Before the owner has a transition, an extra-argument `close(...)` or `abortAndDrain(...)` rejects with a capture error and does not win. Once a valid zero-argument lifecycle call arrives, the owner memoizes its shared Promise before invoking either child cleanup method.

- If `close()` wins: `stable.close()` + `teacher.close()`
- If `abortAndDrain()` wins: `stable.close()` + `teacher.abortAndReap()`

Because memoization precedes child invocation, even a synchronous reentrant call from a child method joins the exact same Promise. After a transition exists, lifecycle state is checked before arity. Every later call—including an invalid call carrying extra arguments—returns that same Promise after fulfillment or rejection. It cannot switch the selected mode, rerun cleanup, or replace the shared error.

A cleanup method must also return a pinnable exact-native Promise, and a successful fulfillment value must be exactly `undefined`. Even if a source adopted during factory initialization is reused by cleanup, fulfillment with its runtime value is a cleanup-contract failure.

A child that directly returns the owner's lifecycle Promise is rejected because that internal Promise has no adopted-source membership. Wrapping the lifecycle in another Promise, or later resolving a pending cleanup Promise with the lifecycle, can create a hidden native-Promise dependency that remains pending. The cleanup deadline bounds both forms. A cleanup rejection known before timeout remains in stable-then-teacher order, followed by the timeout failure.

## 6. Settle or time out both cleanup attempts and publish immutable failure snapshots

A stable-side failure does not cancel the teacher-side cleanup attempt. Both methods are invoked first, and the owner waits until every accepted Promise settles or the cleanup deadline expires. Known failures retain stable-then-teacher order; a timeout failure follows them.

Retaining raw Errors or arbitrary objects in a shared error graph would allow an early observer to change `name`, `message`, or `stack` for later observers. The owner instead converts each failure into bounded evidence.

```text
{
  classification: "error" | "non-error",
  name: string,
  message: string
}
```

Only own data descriptors are read; accessors are not invoked. Descriptor fields such as `value` are themselves checked as own data properties, so an inherited `Object.prototype.value` accessor cannot run while lifecycle methods or function arity are captured. A Proxy is not walked, and names and messages are limited to 512 characters. Snapshots, failure arrays, and `AggregateError.errors` are frozen. The owner error and AggregateError materialize `name` and `stack` as own non-writable data properties before freezing. A `cause` points only to a snapshot or frozen AggregateError, never to the raw external Error. Numeric array indices are created through captured `Object.defineProperty`, not assignment or `push`, so an inherited `Array.prototype["0"]` setter never receives evidence.

This preserves the order and classification of every failure. It does not claim to retain raw Error identity or a raw stack trace.

## 7. Cut Promise, Array, and digest validation off from live intrinsics

Saving `Promise.allSettled` alone is insufficient. The built-in obtains the constructor's `resolve` and each input's `then` when called. The owner gives a private constructor an own `resolve`, pins each input Promise's own `constructor` and `then`, and invokes through the captured `Reflect.apply`.

Likewise, an array passed to `Promise.allSettled` would normally use the live `Array.prototype[Symbol.iterator]`. The owner copies arrays with index loops and own numeric data properties, then installs own frozen iterator and `next` methods. Every owner array also receives an own `then: undefined`, so adding `Array.prototype.then` or `Object.prototype.then` cannot make Promise resolution mistake the result array for a thenable. Failure lists and `AggregateError.errors` receive the same protections. Cleanup aggregation does not depend on live `map`, `flatMap`, `push`, or spread behavior.

Digest validation does not use a live RegExp. It checks length 64 and uses the captured `String.prototype.charCodeAt` to verify that every code unit is `0-9` or `a-f`. Replacing `RegExp.prototype.exec` later cannot enter the authority decision.

Focused tests replace live `Promise.resolve`, `Promise.allSettled`, `Promise.prototype.then`, `Promise[Symbol.species]`, prototype constructors, `WeakSet` methods, timer functions, `Reflect.apply`, Array helpers, numeric setters and iterators, prototype `then`, `RegExp.prototype.exec`, descriptor accessors, and the Error stack formatter. Paths after owner admission use captured intrinsics. The tests do not claim that inherited-`then` lookup was absent from a pending source's own native resolution; they instead verify its deadline and known-peer cleanup.

## 8. Focused validation record

The table records focused results from the same working-tree source on Node 22 and separate repository-wide validation runs.

| Target                                                      | Result       |
| ----------------------------------------------------------- | ------------ |
| `floodgateV7ProductionRuntimeOwner.test.ts`                 | 49 / 49 pass |
| Concurrent start / digest gating                            | Pass         |
| Initialization timeout / known-failure ordering             | Pass         |
| Known runtime plus late trusted-fulfillment timeout cleanup | Pass         |
| Cleanup timeout / known-failure ordering                    | Pass         |
| Direct / wrapped / late-resolved lifecycle-cycle bounds     | Pass         |
| Cleanup fulfillment is exactly `undefined`                  | Pass         |
| Thenable / Proxy / decorated / unpinnable Promise           | Pass         |
| Promise species / constructor / WeakSet / timer poisoning   | Pass         |
| Inherited source-`then` stall deadline / peer cleanup       | Pass         |
| Descriptor inherited-`value` accessor isolation             | Pass         |
| Array helper / numeric setter / iterator-next poisoning     | Pass         |
| Immutable failure graph / stack-hook isolation              | Pass         |
| Digest code-unit validation / live `RegExp.exec` isolation  | Pass         |
| TypeScript `--noEmit`                                       | Pass         |
| Scoped ESLint (zero warnings)                               | Pass         |
| Full Vitest (113 files, `--maxWorkers=4`)                   | 1996 / 1996  |
| Python ML stdlib                                            | 58 / 58      |
| Next.js production build                                    | 193 / 193    |
| Production-factory executions in focused tests              | 0            |
| Parent operations / proposal / rescore                      | 0            |
| Checkpoint / key / label / training / weight changes        | 0            |
| Live games / strength measurements                          | 0            |

The 49 cases are a focused count of owner mechanics inspected through test-only injection. The separate 1,996 Vitest cases, 58 Python cases, and 193 built pages are code validation too; none counts successful production-runtime launches, production labels, or games. They do not replace full CI or deployment validation.

## 9. Missing boundaries and next work

This owner covers only lifecycle ownership and ephemeral digest lookup. Separate work is still required to connect a production coordinator that accepts parent operations, a checkpoint run binding, and deployment key authority. Real teacher-label generation, training rows, an optimizer, candidate weights, independent selection and holdout, A/B games, and live deployment all remain later stages.

No evaluation-function weight or live environment changed by one byte here. This change alone cannot establish that the engine became stronger or reached stable high-dan strength.
