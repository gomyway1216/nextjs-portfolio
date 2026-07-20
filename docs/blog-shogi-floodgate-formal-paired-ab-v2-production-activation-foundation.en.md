# Shogi evaluation: preparing formal A/B v2 production activation while remaining closed at zero games

> As of 2026-07-19, real formal A/B remains **0 / 768 games**, with zero engine processes, zero network requests, and zero live-weight changes. This change is not strength-improvement compute. It is a small, anticipatory boundary that prevents a later 384-pair / 768-game run from starting with mismatched inputs. Teacher generation continues on a separate path and this work does not consume its search CPU. Japanese version: [blog-shogi-floodgate-formal-paired-ab-v2-production-activation-foundation.md](./blog-shogi-floodgate-formal-paired-ab-v2-production-activation-foundation.md)

## Conclusion

Formal A/B v2 already had a fixed statistical protocol and a local-only test launcher. It did not yet have a production entry that binds the candidate, stable baseline, openings, time control, adapter, and upstream receipts into one exact activation.

This change adds only three things:

1. an exact closed registry whose enrollments are all `null`;
2. an argumentless production entry that validates the registry and returns `STOP` at zero games; and
3. an explicitly named `CoreForTests` that can verify every identity and exact 768-game accounting required by a future ready enrollment.

No real identity is enrolled. There is no production match adapter, and no route to an engine, game process, network, or live-weight writer.

## Closed registry

The new registry has a code-pinned path, byte count, SHA-256, and schema. Its only accepted state is:

| Item                                   | Fixed state     |
| -------------------------------------- | --------------- |
| candidate / stable                     | `null` / `null` |
| opening manifest                       | `null`          |
| time control                           | `null`          |
| pair workers                           | `null`          |
| match adapter                          | `null`          |
| result / retention / rollback receipts | all `null`      |
| execution authorized                   | `false`         |
| production weight write authorized     | `false`         |
| pairs / games started                  | 0 / 0           |

The validator also reads the exact existing v1 registry, v2 amendment, v2 closed registry, and fresh sibling plan with a `no-follow` open for every component of a repository-relative path. A one-byte drift, field or type drift, extra field, duplicate JSON key, schema mismatch, or digest mismatch stops.

## Argumentless production entry

The entry is:

```text
python3 ml/formal_paired_ab_v2_production_activation.py
```

Any argument returns `arguments-forbidden` before registry access. With no arguments, it revalidates the closed chain and exits 2 with a sanitized receipt equivalent to:

```json
{
  "status": "STOP",
  "reason": "enrollments-closed",
  "pairs_started": 0,
  "games_started": 0,
  "engine_processes_started": 0,
  "network_requests": 0,
  "live_weight_changes": 0
}
```

The entry accepts no caller-selected registry path. It does not invoke `CoreForTests` or connect to an engine, game process, AWS, GCP, Vercel, Firebase, an external playing site, or live weights. Opening production requires a separate reviewed change after real inputs exist.

## What `CoreForTests` binds

The test-only composition interface is not an execution API. It validates a synthetic mapping and derives one deterministic binding SHA-256 from:

| Binding            | Validation                                                                             |
| ------------------ | -------------------------------------------------------------------------------------- |
| experiment / run   | distinct, nonzero semantic SHA-256 IDs                                                 |
| candidate / stable | distinct exact weight-artifact identities                                              |
| openings           | canonical SFEN / USI and 384 ordered unique openings                                   |
| colors             | candidate sente, then candidate gote, in every pair                                    |
| time control       | exact content identity, nonnegative clocks, positive thinking time, fixed adjudication |
| pair workers       | integer 1 through 6                                                                    |
| match adapter      | exact artifact identity                                                                |
| result receipt     | exact downstream-result artifact identity                                              |
| retention receipt  | exact retention artifact identity                                                      |
| rollback receipt   | exact rollback-readiness artifact identity                                             |

Opening and game IDs are rederived with the same domain-separated rules as the existing local launcher. The interface validates two games in each of 384 pairs and refuses a composition unless the total is exactly 768: 384 candidate-sente games and 384 candidate-gote games.

Returned authority is always:

- game execution: `false`;
- production activation: `false`; and
- production weight write: `false`.

`CoreForTests` does not open artifact files. It binds receipt identities but does not certify their real production semantics. In particular, the rollback-readiness receipt is a future separate contract; this change creates no real receipt. If final upstream merges change the result or retention schema, the exact enrollment must be updated and reviewed before this closed foundation can open.

## Adversarial tests

Unit tests reject:

- registry byte drift and an intermediate-directory symlink;
- any argument to the production entry;
- 383 pairs, a wrong color, and duplicate or wrong game IDs;
- opening or time-control content that disagrees with its identity digest;
- identical candidate and stable digests or paths;
- boolean, zero, seven, and floating-point pair-worker values;
- wrong adapter or receipt schemas and aliased receipt digests or paths;
- unsafe relative paths, extra fields, and nested or top-level `dict` subclasses; and
- authority expansion such as `production_authority: true`.

The same synthetic input with a different key order produces the same composition receipt. The returned value does not alias the input, and composition performs no filesystem open.

## Validation

At implementation anchor `6cdf145af77fa90db4feac100752d3ff3db328f1`:

| Check                                                            |                       Result |
| ---------------------------------------------------------------- | ---------------------------: |
| Python compile                                                   |                         PASS |
| activation focused                                               |                 11 / 11 PASS |
| related tests including the existing protocol and local launcher |                 48 / 48 PASS |
| publication evidence                                             |                   5 / 5 PASS |
| argumentless production entry                                    | expected STOP, 0 / 768 games |

Machine-readable values are in the [production activation foundation evidence](./data/floodgate-formal-paired-ab-v2-production-activation-foundation-2026-07-19.json).

## Next gate

This change alone does not make the AI stronger. The next work is the running teacher generation, three-seed retraining, candidate selection, and sealed holdout / retention / regression / production-parity gates. Only after those pass should a separate PR enroll the real candidate, stable baseline, openings, time control, adapter, and result / retention / rollback receipts and connect the production entry to a reviewed adapter.

Completing 768 formal A/B games still would not directly prove human high-dan strength. Live weights remain unchanged until formal A/B passes, external calibration succeeds, and rollback plus monitoring are verified.
