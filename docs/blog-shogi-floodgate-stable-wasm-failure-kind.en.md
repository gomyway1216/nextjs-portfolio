# Preserving the stable-WASM pool-poison trigger safely

> The first durable prefix-100 attempt stopped after 1,597 seconds. A same-configuration read-only replay completed seven of twelve candidates in 0.8 to 244.9 seconds, while five fell into the same generic pool-poison error at approximately 600.0 seconds. The timing matched the fixed ten-minute timeout, but the old pool discarded the first worker error, so neither the typed cause nor the trigger parent could be established. This candidate preserves only one of seven safe failure kinds plus a timeout value from the first worker boundary through pool-wide poison, without publishing raw stderr, PIDs, indices, positions, or IDs. Focused 110 / 110 tests, TypeScript, changed-file ESLint, and independent review with P0 / P1 / P2 = 0 / 0 / 0 pass. The PR, final-head CI, regular merge, and twelve-candidate rerun remain PENDING. Japanese version: [blog-shogi-floodgate-stable-wasm-failure-kind.md](./blog-shogi-floodgate-stable-wasm-failure-kind.md)

## 1. Result

This change does not extend the timeout or alter worker count, search depth, proposal rows, runtime receipts, or production binding. It changes only the failure-information boundary.

| Subject                     | Candidate result                              |
| --------------------------- | --------------------------------------------- |
| safe failure kinds          | exactly seven                                 |
| timeout value               | `number` or `null`                            |
| raw stderr / message        | neither retained nor published                |
| PID / index / SFEN / IDs    | neither retained nor published                |
| active / queued rejection   | the first identical safe error object         |
| proposal after poison       | the same safe error object                    |
| worker cleanup              | force-stop and reap every worker              |
| normal receipt / binding    | unchanged                                     |
| production state / weights  | unchanged                                     |

## 2. Why the cause disappeared before

When a worker search promise rejected, the reusable pool called `poison(_error)`. As the parameter name indicated, the first error was ignored. Every active job, queued job, and later proposal received a newly created generic error.

```text
worker timeout / exit / protocol failure
  -> raw worker error
  -> pool poison discards the argument
  -> all jobs receive one generic poisoned-pool error
  -> the outer failure stays conservative, but classification is lost
```

This prevented private stderr leakage, but it also made a 600-second timeout indistinguishable from a worker exit, transport failure, protocol failure, or result-validation failure.

## 3. The safe failure contract

The candidate permits exactly seven classifications.

| Failure kind       | Meaning                                          | `timeout_ms` |
| ------------------ | ------------------------------------------------ | ------------ |
| `search-timeout`   | fixed timeout for a search request               | exact number |
| `startup-timeout`  | fixed timeout for worker initialization          | exact number |
| `worker-exit`      | unexpected process close or child error          | `null`       |
| `transport`        | stdin, source pipe, stderr, write, or close path  | `null`       |
| `protocol`         | stdout frame, schema, digest, ready/bye mismatch  | `null`       |
| `validation`       | typed search result or proposal-row rejection    | `null`       |
| `unknown`          | fail-closed fallback for an unclassified failure | `null`       |

Only exact objects registered in a module-private `WeakMap` are genuine. The public inspector rejects a Proxy first and does not read fields from structural forgeries or accessor-bearing lookalikes. The error object, safe metadata record, stack, and fields are frozen.

## 4. Pool-wide consistency

The first genuine safe error is stored once as `terminalWorkerFailure`. The same object identity rejects:

1. active proposals;
2. proposals in the FIFO queue; and
3. proposals submitted after poison.

Later worker failures cannot replace the first cause. Poison force-stops all workers, and `close()` awaits bounded cleanup and process reap.

## 5. Keeping raw information out

The previous worker diagnostic could append stderr text to an error message. The candidate never retains stderr content; receiving stderr classifies the failure as `transport`. The safe error and metadata contain none of the following:

- raw stderr or original error messages;
- process IDs, worker indices, or input indices;
- parent SFEN, moves, position IDs, game IDs, or parent IDs;
- request/result payloads, asset paths, or private filesystem identities.

Runtime-wrapper and parent-coordinator regressions verify that a private canary never appears in JSON, messages, or stacks while the nested `primary` remains an inspectable genuine safe error.

## 6. Validation

| Check                             | Result                      |
| --------------------------------- | --------------------------- |
| stable proposer focused tests     | PASS                        |
| production stable runtime tests   | PASS                        |
| production parent coordinator     | PASS                        |
| focused total                     | 3 files / 110 tests         |
| TypeScript                        | PASS                        |
| changed-file ESLint               | PASS                        |
| `git diff --check`                | PASS                        |
| independent review                | P0 / P1 / P2 = 0 / 0 / 0   |

Coverage includes search/startup timeout, worker exit, transport, protocol, validation, unknown, Proxy, forgery, accessor, active/queued/future identity, full child reap, and runtime/coordinator raw-canary non-disclosure.

## 7. Nonclaims

This candidate does not establish:

- that all five generic rejections individually timed out;
- which of indices 3, 6, 7, 9, and 14 triggered poison first;
- that twelve workers are optimal;
- whether a timeout extension, fewer workers, or a depth change best balances quality and throughput;
- authority to resume the partial checkpoint; or
- teacher data, retraining, playing-strength improvement, or stable high-dan strength.

The source change also changes the existing V3 run binding and application-source binding. The current three-parent partial therefore cannot be resumed under this changed code. It requires reviewed quarantine followed by a separately approved fresh run.

## 8. Safe next order

1. Publish this candidate as a ready-for-review PR.
2. Pass final-head CI, independent review, and a regular merge.
3. Rerun the same twelve candidates read-only on the merged code to capture the first safe failure kind and timeout value.
4. Compare tail latency, timeout, and throughput with 4, 6, 8, and 12 workers.
5. Select a fix that preserves the playing-quality contract and treat its changed run binding as a new run.
6. Finish the recovery inspector and human-confirmed quarantine, resolving the current stale lease and partial checkpoint under separate authority.
7. Even after a fresh prefix-100 succeeds, stop once for independent review before advancing to 500 and final-24,000.
8. Retrain, select candidates, run formal A/B, and calibrate externally only after the complete teacher data is finalized.

## 9. Current decision

The candidate that preserves the pool-poison trigger without increasing private disclosure is implemented, validated, and independently reviewed. The PR, GitHub CI, regular merge, and real twelve-candidate rerun are not complete, so production remains **STOPPED**. The [machine-readable evidence](./data/floodgate-stable-wasm-failure-kind-2026-07-16.json) separates the implemented safety boundary from unexecuted production and playing-strength work.
