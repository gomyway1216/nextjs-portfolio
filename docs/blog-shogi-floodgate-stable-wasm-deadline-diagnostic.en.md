# Isolating the stable-WASM long tail without pool-wide poison

> Both the twelve-worker and six-worker comparisons completed seven of twelve candidates and stopped five at approximately 600 seconds. Six workers did not improve the median, mean, or RSS. The existing pool, however, broadcasts its first failure to the remaining lanes, so the five rejections are not evidence of five independent timeouts. This PR adds only a non-operational diagnostic contract: the same unchanged pinned WASM, one request per child, at most six concurrent children, a 600,000 ms cooperative deadline, and a 615,000 ms outer watchdog. It performs zero real-data diagnostic runs and changes neither production nor live weights. Japanese version: [blog-shogi-floodgate-stable-wasm-deadline-diagnostic.md](./blog-shogi-floodgate-stable-wasm-deadline-diagnostic.md)

## 1. What remains unknown

The existing rerun established that the first safe failure kind was `search-timeout` and its timeout value was 600,000 ms. Pool-wide poison then delivered that same failure to every unfinished lane. It did not answer:

- whether each long-tail lane independently reaches its deadline;
- how far each lane progresses toward depth 11;
- whether one stopped lane merely poisons otherwise viable siblings; or
- whether any lane is a true hang that requires an outer kill.

This PR fixes a method for separating those cases. It does not connect that method to real data.

## 2. A deadline that preserves the time-dependent search knobs

The existing fixed search calls `searchBestMove(0, 11, 10)`. Passing 600,000 directly would select different time-dependent WASM search knobs. The diagnostic child instead uses:

```text
host now = (performance.now() - epoch) / deadlineMs
searchBestMove(1, 11, 10)
```

An elapsed 600,000 ms maps to one WASM time unit. Like `maxTimeMs = 0`, `maxTimeMs = 1` selects null-move reduction 2, quiescence check move limit 1, and try limit 2. Shared TT is always off. A constant-clock sentinel unit test with the real pinned WASM and real pinned weights compares max-time 0 and 1 without crossing the deadline. Move, score, depth, nodes, and leaves are exactly equal internally; none of their values is published.

This does not establish equal wall performance. `maxTimeMs = 1` calls the JavaScript `hostNow` callback approximately once per 2,048 nodes plus leaves, adding a boundary-crossing cost absent when `maxTimeMs = 0`. Zero callback overhead, equal 600-second wall time, and production timing equivalence are all nonclaims.

## 3. One request per child, bounded at six

Every request owns a fresh child and no child is reused. A fixed six-slot scheduler supplies at most six concurrent children for the twelve-request design. Before scheduling, the parent snapshots every asset and validates exact board-piece codes, exactly one king per side, droppable hand slots, and physical material limits. Malformed caller input is rejected before child launch rather than counted as a generic child failure.

```text
lane request
  -> fresh child
  -> pinned WASM + pinned weights
  -> cooperative result / outer watchdog / fixed failure
  -> child reap
  -> aggregate histogram only
```

A deadline, failure, or hang in one lane never poisons another lane. The outer watchdog kills only the child it guards, and aggregation waits for every child to close. Observed peak children increments only on Node's successful `spawn` event and decrements only on that child's `close`, so it is a timing-sensitive per-run measurement rather than a logical-slot count or an order-invariant value. One synthetic batch combines complete, deadline, hang, and stderr-canary children. It verifies a measured peak of six, continued sibling work, and complete reap. The two tested synthetic input/completion-order permutations produced the same histogram/count aggregate; this is not a claim about every possible ordering. A negative asynchronous-spawn-failure test records an observed peak of zero.

## 4. Phase names avoid false precision

Only a fixed-order phase histogram is exposed:

- `requested-depth-complete`;
- `winning-mate-early`;
- `cooperative-deadline-after-completed-depth-0` through `-10`;
- `outer-watchdog`; and
- `failure`.

`cooperative-deadline-after-completed-depth-d` means only that depth d completed before the cooperative deadline returned. Outside the WASM, the check immediately after depth d cannot be distinguished from a sampled stop during the following iteration. The diagnostic therefore does not claim that it stopped specifically inside depth d+1. A partial iteration's move and score are never adopted, and `partial_iteration_results_adopted = 0` is fixed.

## 5. Aggregate and privacy boundary

The parent receives only outcome counts, the phase histogram, a completed-depth histogram, fixed nodes/leaves range histograms, configured parallelism, and observed peak parallelism. It receives no individual lane record.

The output excludes:

- SFEN, board, input index, and digests;
- game, parent, and position IDs;
- PID, stderr, error messages, and stacks;
- moves and scores; and
- exact per-lane nodes, leaves, and elapsed time.

Any child that writes even one stderr byte becomes a fixed failure without retaining the content. A privacy-canary test confirms that identifying terms placed in input or stderr never enter the aggregate JSON.

## 6. The 600-second and 615-second boundaries

The cooperative deadline is 600,000 ms and the outer watchdog is 615,000 ms. This does not establish a guaranteed 15,000 ms cleanup allowance. The outer watchdog starts at child spawn, so bootstrap, input transfer, validation, WASM instantiation, and weight copying all consume its 615,000 ms budget. The cooperative search clock is used inside the child.

The 15,000 ms difference is therefore nominal, not guaranteed post-search cleanup time. The [machine-readable evidence](./data/floodgate-stable-wasm-deadline-diagnostic-2026-07-17.json) fixes this nonclaim. A separately bound execution must aggregate startup behavior and full child reap before any operational use.

## 7. Production scope and validation

The diff is limited to a diagnostic-only worker, a non-operational in-memory core, unit tests, Japanese and English articles, and machine-readable design evidence.

| Boundary                                  | State           |
| ----------------------------------------- | --------------- |
| production worker / pool / runtime        | unchanged       |
| production authority / import graph       | unchanged       |
| package script / CLI / file writer        | 0 added         |
| existing WASM / weights / binding         | unchanged       |
| real-WASM constant-clock 0-vs-1 parity    | PASS            |
| real-WASM scaled-clock cooperative return | PASS            |
| callback overhead / wall-time equivalence | not established |
| partial-result adoption                   | 0               |
| synthetic isolation / max six / reap      | PASS            |
| real-data diagnostic runs                 | 0               |

Tests pin the byte count and SHA-256 for nine production-relevant identities from latest main `398b6d20dbe9b2de4648e77424c2a15820f15dec` and establish that every one remains unchanged.

## 8. Current decision and next gate

This is a design for measuring the long-tail cause, not evidence that the cause is fixed. Teacher data, retraining, candidate selection, formal A/B, external calibration, improved playing strength, and stable high-dan strength all remain unestablished. Production remains **STOP**, and live weights remain unchanged.

After final-head CI and independent review, the next step is a separately bound non-production aggregate-only run of the fixed twelve requests. Before the long-tail run, a fast sentinel must record the callback-overhead ratio against the constant-clock reference as a separate aggregate. The long-tail run must also establish unchanged persistent state before and after, at most six children, no cross-lane poison, and complete child reap. Teacher generation and live activation remain closed until that evidence exists.
