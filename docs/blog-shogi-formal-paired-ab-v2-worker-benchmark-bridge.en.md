# Shogi evaluation: a measured-concurrency bridge for formal A/B

> As of 2026-07-20, the real worker benchmark remains at **0 / 8 rounds**, production formal A/B remains at **0 / 768 games**, and live-weight changes remain zero. This change is not a strength result. It is the execution bridge that will compare 2/4/8/12 local pair workers after candidate selection and pass only the fastest deterministic setting into formal A/B. Japanese version: [blog-shogi-formal-paired-ab-v2-worker-benchmark-bridge.md](./blog-shogi-formal-paired-ab-v2-worker-benchmark-bridge.md)

## Conclusion

This change implements the connection between a measured worker-benchmark receipt and the real formal runner that was explicitly deferred by the [P0 foundation](./blog-shogi-formal-paired-ab-v2-p0-foundation.en.md).

The checked-in registry is deliberately still `BLOCKED`. No real candidate weight, dedicated opening set, or production-rules preflight has been enrolled yet, so the argumentless production entry stops before starting one benchmark round. Zero here prevents a pre-selection workload from being mixed into the later measurement.

## Selecting full-machine power safely

Eligible settings are `[2, 4, 8, 12]` pair workers. Each pair contains one candidate-as-sente game and one candidate-as-gote game. The 12-pair-worker maximum can therefore use as many as 24 engine processes.

The real benchmark measures the same 12 pairs / 24 games in this fixed order:

`2, 4, 8, 12, 12, 8, 4, 2`

That is eight rounds, 96 pairs, and 192 games. Measuring each setting once in the forward half and once in the reverse half reduces one-directional bias from temperature or transient machine load. A worker setting can be selected only when all of the following hold:

- the 24-game transcript-hash vector is exactly identical in every round;
- the technical-fault count is zero;
- observed peak concurrency equals the requested worker count;
- all eight rounds complete in the preregistered order;
- the setting has the lowest sum of its two elapsed-time samples; and
- an exact tie selects the smaller worker count.

The authority therefore comes from the setting that is actually fastest on this Mac while preserving exact results, not simply from the setting that launches the most processes.

## Preventing self-asserted benchmark evidence

The initial implementation still allowed gaps around caller-supplied registry state, source drift during execution, and redirection to another output root. Independent review closed those boundaries:

1. The production CLI accepts no arguments and reads only a registry pinned in source.
2. An external authority source pins the registry at 2,383 bytes and one SHA-256.
3. Before benchmarking, the bridge verifies 25 Python, TypeScript, and WASM source identities reachable by the real runner.
4. It verifies that the enrolled source revision is in current history, then recaptures registry, opening, asset, and source identity after execution.
5. Output is derived from the operating-system account record rather than caller-controlled `HOME`; only current-user-owned 0700 directories and a 0600 single-link receipt are accepted.
6. The receipt binds the registry, opening preflight, candidate and stable weights, every round transcript, and the selected worker count under one digest.
7. A formal READY registry must bind that receipt identity and equal its `selected_pair_workers`.
8. The benchmark cannot access formal pair journals, the network, cloud services, AWS, GCP, or live weights.

This keeps the benchmark’s job—choosing local concurrency—separate from formal A/B’s job—measuring strength.

## Five findings closed by re-review

The independent re-audit closed five pre-execution issues:

- content-pin the benchmark registry from an external source;
- derive production output from the OS account home, not caller `HOME`;
- remove path and registry parameters from production APIs and the CLI;
- pin the Python import closure and the TypeScript/WASM closure used by the real pair adapter and player, for 25 source identities in total; and
- reject publication if any covered source drifts after the run.

These changes do not improve playing strength. They are a one-time guard against having to discard and repeat a 192-game benchmark or 768-game formal test because its conditions changed.

## Measured values and current position

| Item | Result |
| --- | ---: |
| Full Python suite | 406 pass / 0 fail |
| Formal-related TypeScript | 37 pass / 0 fail |
| Independent focused audit | 15 pass / 0 fail |
| Real worker benchmark | 0 / 8 rounds |
| Real benchmark pairs / games | 0 / 0 |
| Real formal pairs / games | 0 / 0 |
| Network / cloud jobs | 0 / 0 |
| Live-weight changes | 0 |

Machine-readable data is recorded in the [worker benchmark bridge evidence](./data/floodgate-formal-paired-ab-v2-worker-benchmark-bridge-2026-07-20.json).

## What happens next

This bridge waits for candidate selection. The remaining order is fixed:

1. finish the 13-engine fresh selection teacher;
2. evaluate all three candidates on the same selection dataset and select one;
3. enroll the real candidate weight and dedicated 12-pair opening set in a reviewed benchmark registry;
4. run the local eight-round / 192-game worker benchmark once;
5. pin the selected worker count in the formal READY registry; and
6. execute 384 pairs / 768 formal A/B games.

Retention, known-position regression, and external calibration follow. The evidence does not yet show that the candidate is stronger or high-dan calibrated, and live weights remain unchanged until those gates pass.
