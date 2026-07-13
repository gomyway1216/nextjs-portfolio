# Issuing stable candidates through a fixed production WASM capability

> **Digest-authority update (current boundary):** The production and test stable-runtime factories now register each issued exact facade and receipt digest in separate module-private `WeakMap` registries. Each production / test getter accepts exactly one argument, rejects a clone, Proxy, plain receipt, or facade from the other registry, and returns the registered digest without proposing. Merely computing the same SHA-256 from a plain receipt is not production-origin authority. The existing receipt / result schemas and `shogi-floodgate-production-stable-runtime-receipt-v1\0` domain are unchanged. The [runtime digest authority](./blog-shogi-floodgate-production-runtime-digest-authority.en.md) documents the boundary. The body below remains the historical record from before this authority was added and makes no claim about coordinator or checkpoint wiring, real labels, training, a weight, live deployment, or playing strength.

> The [production asset authority](./blog-shogi-floodgate-production-teacher-asset-authority.en.md) pinned the real bytes of the stable WASM, weights, and worker, while the [stable proposer](./blog-shogi-floodgate-stable-wasm-proposer.en.md) assembled a stable-candidate row from a search result. The earlier proposer / pool was still a dependency-injected test core: a completed row alone could not show that fixed production assets produced it. This PR adds a zero-argument production factory, a reusable 12-worker pool initialized inside the ephemeral asset callback, and domain-separated binding for direct capability results. It is a stable-runtime configuration and initialization boundary, not evidence of parent authenticity, a teacher label, training, holdout results, or playing strength. Japanese version: [blog-shogi-floodgate-production-stable-wasm-runtime.md](./blog-shogi-floodgate-production-stable-wasm-runtime.md)

---

## Current boundary

| Item                               | Current state        | Meaning                                                                               |
| ---------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| Pinned stable assets               | Completed earlier    | Fixes private bytes and SHA-256 for the WASM / weights / worker                       |
| Reusable low-level pool            | Implemented          | Repeats one-parent searches but makes no production-authority claim by itself         |
| Production stable runtime          | Implemented          | Internally joins the fixed asset callback to the fixed pool factory with no injection |
| Direct result binding              | Implemented          | Domain-separates parent / row / authority / pool / runtime receipt bindings           |
| v7 coordinator / HMAC              | Next stage           | Must immediately bind the owning runtime's direct result into the same parent chain   |
| Real training / holdout / strength | Not run; no evidence | This PR handles no game record, label, weight, A/B result, or rank                    |

## 1. Discovery: a correct shape is not production origin

The existing `FloodgateStableWasmProposalRow` strictly carries the parent ID, stable move, child SFEN, depth, and score encoding. A caller can nevertheless construct the same plain object. If an HMAC verifier validates a row but returns no verified-row capability, while a finalization receipt contains only hashes, downstream code cannot distinguish “a structurally valid row” from “a row just obtained from the fixed assets.”

The implementation therefore does not embed a production claim in the row shape. The claim basis is a capability relationship: a later coordinator invokes the zero-argument factory itself and consumes the result returned by that exact runtime object's `propose(parent)` in the same coordinator-owned live processing flow. The result also fixes `plain_result_authentication_claim: false`; a persisted plain result is not reusable as standalone authentication evidence.

## 2. Zero-argument production factory

There is one production entry point.

```text
createFloodgateProductionStableWasmRuntime()
```

The runtime rejects even a JavaScript call that supplies one argument. A caller cannot change the asset provider, WASM / weight / worker bytes, worker factory, worker count, queue, timeout, depth, or score contract. Only the test core accepts a synthetic provider / pool factory, and its receipt cannot escalate from `test-only-injected-asset-provider-and-pool-factory` to the production boundary.

The returned surface is only null-prototype / frozen `receipt / propose / close`. It exposes no constructor, internal worker, raw lease, asset byte, or queue-mutation API. Data results and nested receipts are also deep-frozen with null prototypes, and the methods themselves are frozen.

## 3. Make every worker ready inside the ephemeral asset callback

The asset authority verifies the fixed private deployment and passes WASM / weights / worker source as owned mutable `Uint8Array` values to exactly one callback. Before its first await, the runtime checks an exact native typed-array prototype, a whole owned buffer, non-Proxy storage, and a non-SharedArrayBuffer, then copies each input. It fully initializes the low-level pool inside that callback and constructs the façade only after all 12 workers are ready.

Each callback-delivered `Uint8Array` has a backing `ArrayBuffer` marked untransferable. On callback success, the authority rehashes the delivered copies; before the operation settles on either success or failure, it zero-fills only its own retained and delivered copies. This does not claim to erase arbitrary copies created by the callback. The runtime and low-level pool separately zeroize the handoff copies each owns. The pool first owns the copies required for worker initialization, so `propose` continues to work after the authority and runtime handoff buffers become zero.

Audit found that ordinary `bytes.fill(0)` is not a safe boundary. An injected factory could install an own `fill` getter on the typed array and make cleanup execute hostile code. The implementation uses only typed-array getters / set / fill captured at module load through `Reflect.apply`, and rejects a subclass before touching its getter. If validation fails partway through the three assets, it still zeroizes every copy already made.

## 4. Fixed reusable-pool contract

Production options are fixed as follows.

| Option                    | Fixed value |
| ------------------------- | ----------: |
| Workers                   |          12 |
| Bounded FIFO queue        |  48 parents |
| Startup timeout           |  120,000 ms |
| One-parent search timeout |  600,000 ms |
| Close timeout             |   15,000 ms |
| Requested depth           |          11 |
| Quiescence depth          |          10 |

Each worker handles only one parent at a time and clears its private TT for every parent. The contract forbids a book, external mate solver, fallback, shared TT, and wall-clock completion. Completion at depth 11 is normal; early completion at depths 1–10 is allowed only for the parent-perspective positive winning mate band `89,990,000..90,000,000`. The score encoding is fixed to `wasm-v20-raw-parent-perspective-mate-band-v1`.

A full queue rejects only that request, while worker protocol / timeout / search failure poisons the whole pool. Poison rejects queued, active, and future work and force-stops all workers. Normal close uses the quit protocol for idle workers and force-stops active workers. The runtime does not obscure this policy through retries or a silent fallback pool.

## 5. Cross-binding the receipts

The runtime captures the asset authority's full receipt into a canonical projection and binds the following values with domain-separated SHA-256.

```text
asset-authority full receipt
  -> reusable-pool receipt
  -> production-runtime receipt
  -> direct propose result(parent payload + stable row)
```

It compares exact pool-receipt values for WASM / weights / worker-source bytes and SHA-256, NNUE `k=600` / `buckets=1`, the search contract, 12 / 48 / timeouts, and cleanup policy. Even when the outer pool object is correct, one mismatched receipt value causes the runtime to invoke the captured `close` capability before returning no runtime.

Each result carries the row plus the runtime-receipt digest, pool-receipt digest, parent-payload digest, row digest, and execution boundary. Every digest uses a domain string and NUL separator so an identical JSON payload from another artifact is not confused with it. The binding object remains reproducible as plain structure, however, so it is not an authentication claim on its own.

## 6. Capture the parent before awaiting

`propose(parent)` synchronously captures the parent before handing it to the low-level queue. It rechecks exact keys / data descriptors, semantic IDs, `parent_id = H(game_id, ply)`, canonical SFEN, move number, position ID, and rules-complete legality of the played move, then gives only a frozen copy to the pool. Changing the original object immediately after receiving the Promise cannot change the searched parent.

An abnormal position whose legal generator returns even one opposing-king capture is never sent to the pool, even if the played move is a different legal move. On return, the runtime rechecks parent IDs, parent-payload digest, stable-move legality, child SFEN / position ID, depth / termination, positive-mate early exit, and score / node counters.

## 7. Cleanup boundaries found by adversarial tests

Synthetic tests use no real asset, real game record, or holdout, and fix the following behaviors.

- production-factory arity zero and runtime injection rejection;
- exact 12 / 48 / 120s / 600s / 15s arguments;
- rejection of zero / multiple provider callbacks and callback-result replacement;
- null-prototype / freeze / extra-property / Proxy boundaries;
- no parent mutation entering search after the call;
- rejection of a Uint8Array subclass with zero hostile getter calls;
- intrinsic zeroization with zero calls to a hostile own `fill` getter;
- entry into the cleanup path for every copy owned before partial asset-validation failure;
- close of an initialized pool without invoking a getter after an invalid pool façade / receipt;
- rejection of Promise subclasses while allowing only the low-level pool's exact pinned native Promise;
- one propagation of pool-wide poison without automatic retry; and
- rejection of an adjacent-kings king-capture legal set before a pool call.

For Promises, `isPromise` alone is insufficient. The boundary requires exact native `Promise.prototype`, a non-Proxy value, and either zero own keys or only the low-level pool's non-enumerable / non-writable / non-configurable `constructor === captured NativePromise`. It rejects Promise subclasses and every other decorated Promise, and observes the value with captured native `then` instead of live `Promise.prototype.then`. Rejections are also constructed directly from the captured constructor rather than live `Promise.reject`. Coercing a hostile rejection value into an error message could invoke a hook, so failure details use only a native Error's own data `message` or a bounded string.

Post-review hardening explicitly imports `Buffer` from `node:buffer` and captures the `Error` / `AggregateError` constructors at module load. A throw from the worker-failure notification callback is aggregated with the original failure before pending rejection / kill continues, and a synchronous throw from invoking `quit` / `forceStop` is converted into a rejected native Promise. The current methods are `async`, but a future implementation change still cannot make `close()` throw synchronously past the cleanup chain.

## 8. Direct connection to the v7 coordinator

The later v7 coordinator will create this production runtime itself inside the authenticated training-row callback and directly call `runtime.propose(parent)` for each parent. It can pass `result.row` to the pure candidate-union core, but production origin does not come from that core's structural validation. It comes from immediately adding the `runtime_binding` received from the owning runtime to the same parent's HMAC chain.

The parent chain must bind at least the training-parent identity / SFEN / played move, core-derived legal-set digest, stable runtime / row binding, USI proposal receipt / full-result digest, canonical candidate union, and every independent rescore. No route should reread a plain stable row from another file and call that production origin.

## 9. Validation and nonclaims

| Validation                                     | Result                           |
| ---------------------------------------------- | -------------------------------- |
| Focused production stable runtime              | 10 tests pass                    |
| Related asset callback / pool / runtime suites | 80 tests pass                    |
| Full Vitest                                    | 1,873 tests / 109 files pass     |
| Python ML stdlib                               | 58 tests pass                    |
| Fixed-asset 12-worker production smoke         | Pass                             |
| Next production build                          | Pass                             |
| TypeScript                                     | Pass                             |
| Scoped ESLint / Prettier                       | Pass / pass                      |
| Repository ESLint                              | 0 errors / 157 existing warnings |

### Fixed-asset production smoke and concurrency-width pilot

On 2026-07-12 PDT, the zero-argument production runtime was actually started from the private fixed deployment on an Apple Silicon Mac with 14 physical / logical cores (10 performance + 4 efficiency) and 51,539,607,552 bytes of RAM. The only input was the public initial position with `7g7f`; no real Floodgate row, selection, final, or holdout was opened.

The first smoke made all 12 workers ready in 350 ms, then the pool's exact seven-key check correctly rejected the runtime's audit object because it also carried `parent_payload_sha256`. Closing all 12 workers after that failure took 23 ms. The fix gives the pool a separate frozen projection containing only the seven parent fields and adds a regression assertion. The rerun succeeded with 375 ms initialization and 20 ms close; all 31 results across concurrent widths 1 / 8 / 10 / 12 had one row digest for the same parent.

A subsequent three-run pilot in balanced order produced the following results. Each sample concurrently searched the same public parent, and all 90 results had one row digest.

| Concurrent parents |  Elapsed samples (ms) | Median (ms) | Median positions/s |
| -----------------: | --------------------: | ----------: | -----------------: |
|                  8 | 2,378 / 1,835 / 1,891 |       1,891 |               4.23 |
|                 10 | 1,972 / 1,927 / 1,901 |       1,927 |               5.19 |
|                 12 | 2,319 / 2,185 / 2,187 |       2,187 |               5.49 |

In this short fixed-position pilot, width 12 delivered about 5.8% more throughput than width 10, so the production pool retains 12 workers. This is runtime throughput / determinism evidence only; it measures neither a position distribution, teacher quality, nor evaluation-function playing strength.

This PR reads no real Floodgate training row, fresh selection, or fresh / legacy final holdout. It creates no teacher CP / PV, label JSONL, checkpoint, weight, A/B result, or 81Dojo rating. It therefore makes zero claim that the evaluation function became stronger or reached stable high-dan strength.

The concrete gain is only that the production entry point to a fixed-asset stable-move origin capability is now closed. Per-parent authenticated origin remains incomplete until the next HMAC coordinator is implemented. The next step is to bind this direct result into the per-parent HMAC work checkpoint, close synthetic crash / resume behavior, and only then start real labeling for 24,000 parents.
