# Shogi evaluator: a resumable six-worker local boundary for formal A/B v2

> As of 2026-07-18, zero real games have run. This change does not automatically execute the 384-pair / 768-game formal A/B. The argumentless command revalidates the current closed v2 registry and stops before creating a pair directory because candidate/stable weights, the opening manifest, and the match binding are not enrolled. Japanese version: [blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.md](./blog-shogi-floodgate-formal-paired-ab-v2-local-launcher.md)

## Conclusion

This change adds the orchestration boundary needed to run and resume the 384 color-swapped pairs fixed by the [v2 protocol](./blog-shogi-floodgate-formal-paired-ab-protocol-v2.en.md) on the local machine with at most six concurrent pair workers.

The implemented scope is:

- revalidation of the original plan, closed v2 registry, and v2 amendment identity;
- a strict ready-registry reader for a future reviewed, data-only enrollment;
- byte and SHA-256 validation of candidate/stable weights, the YaneuraOu binary/receipt/eval, and the existing local match adapter;
- binding of exactly 384 openings, 768 game IDs, pair order, candidate-sente then candidate-gote, and pinned seeds/options;
- at most six pair workers;
- one append-only JSONL journal per pair;
- completed-pair reuse and STOP on a partial pair, technical fault, drift, tamper, duplicate, omission, or order violation; and
- final revalidation plus the existing v2 result decoder after all 384 pairs complete.

Every enrollment in the tracked v2 registry is still `null`. No real weight, opening manifest, match binding, or local adapter is enrolled by this change.

## No AWS

This launcher is limited to local files and local processes. A ready match binding must contain these exact safety values:

| Boundary             | Fixed value |
| -------------------- | ----------- |
| local only           | `true`      |
| network              | `false`     |
| AWS                  | `false`     |
| external calibration | `false`     |
| live weight write    | `false`     |
| automatic run        | `false`     |

Every game request repeats those false values. The launcher does not connect to an AWS account, DynamoDB, KMS, Firebase, Vercel, 81Dojo, or a production weight writer.

## Existing protocols and assets, without new game rules

The launcher does not choose a new time control, resignation rule, draw rule, maximum ply, or adjudication rule. Before results exist, those values must be enrolled as exact JSON in a separately reviewed match binding. Every game receipt returns that binding's SHA-256.

The notation and engine boundary accept only the existing protocols:

- engine protocol: `USI`;
- opening protocol: `SFEN+USI`;
- result: candidate-perspective `win | draw | loss`;
- exact agreement between the YaneuraOu binary and the existing engine receipt's binary byte count/SHA-256; and
- distinct exact candidate and stable weight bytes/SHA-256.

Today's argumentless command never reaches a ready match binding. Unit tests substitute a dependency-injected stub for the real adapter and YaneuraOu process.

## Exact pair plan

A future opening manifest contains pairs 0 through 383 in order. Each pair fixes:

1. canonical SFEN plus a USI move sequence;
2. an opening ID derived from the opening by domain-separated SHA-256;
3. a unique positive signed-64-bit seed;
4. candidate-sente in game 0;
5. candidate-gote in game 1; and
6. a unique game ID derived from opening ID, pair index, game index, and color.

The caller cannot override manifest order, IDs, seed, or color. Match options are part of the reviewed binding's exact bytes and are passed unchanged to the local adapter.

## Six pair workers and append-only journals

The ready registry fixes the worker count, but only integers from one through six are accepted. Pairs start in manifest-order batches of at most six. One worker runs both games of an opening in candidate-sente, then candidate-gote order.

Each pair appends four events to a current-user-owned `0600` regular file:

1. `pair-started`;
2. `game-completed` for candidate-sente;
3. `game-completed` for candidate-gote; and
4. `pair-completed`.

Every event binds the SHA-256 of the preceding canonical JSONL bytes and the registry, plan, amendment, opening manifest, match binding, both weights, pair/opening, and seed identities. The receipt directory must be current-user-owned `0700`; unknown entries, symlinks, hardlinks, and noncanonical JSONL are rejected.

Resume accepts only complete journals forming a contiguous prefix from pair zero. A partial pair, fault event, missing lower pair, game 1 before game 0, duplicate game, wrong color, or digest drift stops before any new game starts. Complete pairs are never replayed, and partial pairs are never silently replayed.

The implementation fsyncs each file before the next event. It does not claim power-loss durability for directory entries or tamper-proof storage against a malicious process with the same UID. This is a trusted local-operator boundary, not a remote witness.

## Technical faults

An adapter throw, wrong ID/color/seed/weight/binding, invalid result, or `technical_fault: true` appends a sanitized fault event and stops the run. It cannot be replaced in the same run. Other pairs already active in that batch are drained, but no new batch starts.

No strength result is made from a faulted or partial journal. Only 384 complete pairs are projected into the existing [`decode_pair_score_units`](../ml/formal_paired_ab_protocol_v2.py), including candidate/stable, run/experiment, attempt ledger, amendment, and all 768 games. Bootstrap analysis and promotion authority remain outside this launcher.

## The argumentless command currently stops at zero

The explicit command is:

```text
npm run shogi:formal-ab-v2-local
```

Any argument produces `arguments-forbidden`. With no argument, today's exact closed registry is validated and the command exits 2 with:

```json
{
  "games_started": 0,
  "pairs_started": 0,
  "reason": "candidate-identities-not-enrolled",
  "schema": "shogi-floodgate-formal-paired-ab-local-cli-receipt-v1",
  "status": "STOP"
}
```

There is not yet a route from this command to the ready core or a real local adapter. That is the intentional pre-enrollment automatic-start boundary.

## Validation

Measured results are recorded in the [machine-readable evidence](./data/floodgate-formal-paired-ab-v2-local-launcher-2026-07-18.json).

| Validation                 |                           Result |    Wall time |
| -------------------------- | -------------------------------: | -----------: |
| focused Python             |                     10 / 10 PASS |       0.87 s |
| full ML stdlib             |                   148 / 148 PASS |      11.75 s |
| argumentless npm preflight | expected STOP, 0 pairs / 0 games | under 0.26 s |

Stub tests cover an exact 384-pair / 768-callback completion, zero callbacks on complete resume, six concurrent pairs, fault/partial state, wrong plan/registry/weight/binding/color/ID, receipt tamper, unknown entries, aliases, and network/AWS/live flags. These are orchestration tests, not playing-strength data.

## Current state and the next data-only gate

| Item                                    |                Current value |
| --------------------------------------- | ---------------------------: |
| real formal A/B                         | 0 / 384 pairs, 0 / 768 games |
| real YaneuraOu / match processes        |                        0 / 0 |
| candidate / stable enrollment           |                        0 / 0 |
| real opening / match-binding enrollment |                        0 / 0 |
| external calibration                    |                      0 games |
| live weight changed                     |                        false |

The next step comes only after teacher generation, three-seed training, selection, fresh/legacy final checks, retention, known regression, and production parity pass. Candidate/stable identities, all 384 openings, the existing local adapter, and every match option can then be enrolled in a data-only review. A separate review must connect this STOP command to the real local adapter after those exact bytes are known.

Completing formal A/B alone is not proof of human high-dan strength. A separately confirmed external calibration and release gate remain required, and live weights remain unchanged until then.
