# Confirming the merged safe failure kind on twelve real candidates

> After PR #485 final head `6a804a7954a9685361944aeb2be32494638fae2e` was merged with a regular merge commit, we ran a read-only diagnostic with the same twelve-worker configuration and authenticated training input used by the earlier reproduction. Seven of twelve candidates completed in 0.855 to 264.590 seconds; the other five rejected at approximately 600 seconds. All five rejections carried a module-private-authority-authenticated `search-timeout` with `timeout_ms = 600000`. This does not establish five independent per-candidate timeout events. Pool-wide poison broadcast the first worker failure, so all five rejections received the same genuine safe metadata, and the first triggering index remains unidentified. Runtime close and full worker reap completed, while every production persistent-state comparison counter remained zero. Japanese version: [blog-shogi-floodgate-stable-timeout-confirmation.md](./blog-shogi-floodgate-stable-timeout-confirmation.md)

## 1. Result

The new fact is that the safe kind of the failure that first poisoned the pool was `search-timeout` at the fixed 600-second boundary. Previously, timing alone matched 600 seconds. Because the old pool discarded its source error, the conservative classification was `unknown`, with only a timing inference of `search-timeout`. On the merged code, the inspector accepts only a genuine error minted into a module-private `WeakMap`. The same-configuration rerun recovered the following from the nested primary of every rejection.

| Field          | Confirmed value                   |
| -------------- | --------------------------------- |
| `failure_kind` | `search-timeout`                  |
| `timeout_ms`   | `600000`                          |
| genuine brand  | accepted by the trusted inspector |
| raw cause      | neither retained nor published    |

This result does not fix the timeout. It confirms that the stop reason can now be classified without retaining or publishing the private cause.

## 2. Execution boundary

The diagnostic ran after PR #485 was integrated by regular merge commit `4b46fd3761512f38bada4c7c23537a969349a804`, using the exact final implementation code.

| Subject                    | Value                                                   |
| -------------------------- | ------------------------------------------------------- |
| implementation head        | `6a804a7954a9685361944aeb2be32494638fae2e`              |
| merge method               | regular merge commit                                    |
| workers                    | 12                                                      |
| search timeout             | 600,000 ms                                              |
| logical candidate window   | twelve candidates corresponding to indices 3 through 14 |
| input                      | training rows authenticated by the pinned verifier      |
| production gate invocation | 0                                                       |
| checkpoint retry / resume  | 0 / 0                                                   |
| lease cleanup / quarantine | 0 / 0                                                   |
| live evaluator change      | false                                                   |

This was neither a production-gate retry nor stale-lease reconciliation. It used the fixed asset authority and production training-row verifier read-only, then reproduced only stable proposals under the same runtime configuration.

## 3. Measurements

Input authentication and ordering took 1,103.693 seconds. Stable runtime initialization took 0.165 seconds. After all twelve candidates were submitted concurrently, the sanitized outcomes were:

| Outcome   | Count | Elapsed seconds                                       |
| --------- | ----: | ----------------------------------------------------- |
| fulfilled |     7 | 0.855, 1.334, 5.728, 66.382, 95.132, 107.763, 264.590 |
| rejected  |     5 | 599.997, 599.999, 600.000, 600.001, 600.003           |

Every rejection reported `failure_kind = search-timeout` and `timeout_ms = 600000`. The full diagnostic took 1,704.974 seconds, and the parent Node process peaked at 6,781.5 MiB RSS. Runtime `close()` fulfilled. A post-run check using the fixed worker-bootstrap signature found zero residual stable workers and zero YaneuraOu processes.

## 4. Reading the pool broadcast correctly

The five rejections must not be interpreted as five independently established timeout events.

```text
one worker emits the first genuine search-timeout
  -> the reusable pool stores that terminal safe error
  -> pool-wide poison rejects every still-active job
  -> five wrappers expose the same genuine safe metadata
```

The exact claims are:

- the safe kind that caused the first pool poison was `search-timeout`;
- its exact timeout was 600,000 ms;
- pool broadcast gave all five rejections the same genuine safe metadata;
- five independent per-candidate timeout events are not established; and
- the first triggering worker or input index remains unidentified.

The runtime wrapper creates an outer error per job, so this diagnostic does not claim identical outer-wrapper object identity. Merged unit tests separately pin the terminal safe-error identity inside the pool across active, queued, and future proposals.

## 5. Persistent state and cleanup

The diagnostic compared in-memory fingerprints before and after execution without publishing paths or digests.

| Scope                        | Mutation counter |
| ---------------------------- | ---------------: |
| connector registry           |                0 |
| authenticated training input |                0 |
| stable / teacher assets      |                0 |
| approved control plane       |                0 |
| deployment-key metadata      |                0 |

The registry scope includes the existing lease, runs, stage checkpoint, and quarantine/retired namespaces. The asset scope includes the current fixed evaluation assets. Every scope matched, so `persistent_state_unchanged` was true. Deployment root-key bytes were not read for fingerprinting; only metadata was compared.

No production retry, cleanup, quarantine, checkpoint resume, teacher generation, training, weight overwrite, or live activation followed the diagnostic.

## 6. Privacy boundary

The public result contains only counts, elapsed seconds, an allowlisted failure kind, the timeout value, and safe resource/cleanup aggregates. It does not retain or publish:

- raw stderr, raw error messages, stacks, or child-exit details;
- PIDs, worker indices, or the individual triggering index;
- SFEN, moves, game IDs, parent IDs, or position IDs;
- request/result payloads, private paths, private digests, or filesystem identities; or
- deployment-key bytes or checkpoint-authentication material.

The operator records that the logical window corresponded to indices 3 through 14, but the safe error object itself contains no input index.

## 7. Current decision

The merged code now has real authenticated-data confirmation of PR #485's purpose: preserve the first worker failure kind through pool poison without expanding private disclosure. It does not yet establish:

- why at least one of the five searches could not finish depth 11 within ten minutes;
- which of 4, 6, 8, or 12 workers best balances tail latency and throughput;
- which worker-count, timeout, or search-strategy change preserves playing quality;
- how to reconcile the stale lease and three-parent partial checkpoint; or
- teacher data, retraining, candidate selection, formal A/B, external calibration, or stable high-dan strength.

Production therefore remains **STOPPED**, and live weights remain unchanged. The next safe work is a privacy-preserving worker-count tail-latency comparison plus resolution of the existing partial state under the separate recovery-operator authority. The [machine-readable evidence](./data/floodgate-stable-timeout-confirmation-2026-07-17.json) separates measurements, broadcast interpretation, zero mutation, and nonclaims.
