# Recovering the teacher safely after it stopped at 99 / 100

> Record as of 2026-07-19. This documents the failed run and a prospective recovery contract for the next clean run. The teacher dataset, retraining, strength gain, and live promotion are not complete. [日本語版](./blog-shogi-floodgate-strength-first-timeout-recovery.md)

## What actually happened

The first strength-first run authenticated the real 24,000-parent training input successfully in 1,088.743 seconds. It then started twelve one-thread YaneuraOu processes at depth 16 and data-synced 99 parent entries to `work.jsonl`. One independent MultiPV-1, one-move `searchmoves` search for the next parent reached the fixed 600,000 ms bound.

The old implementation propagated that timeout as an ordinary error. It persisted no part of the affected parent, the worker failure reached the runner, and the run stopped:

| Item | Observed result |
| --- | ---: |
| Input authentication | Passed, 1,088.743 seconds |
| Durable parent entries | 99 |
| 100 milestone | None |
| Final teacher result | None |
| Training / selection / A/B | Not started |
| Live weight changes | 0 |

The run was slow, but its fail-closed behavior was correct: it published neither an incomplete label nor a partial result. This public record contains no private parent ID, digest, or path.

## Never use an incomplete search result

Accepting a PV or score at the 600-second boundary would create a label that does not satisfy the fixed depth-16 contract. Stopping the search and using its partial value, reducing depth, or filling the hole from another move is forbidden.

The recovery contract permits only a typed `USI search timeout` to become an explicit no-label work entry:

- Reason `search-timeout-no-label`
- Proposal versus independent-rescore phase
- Requested MultiPV, depth or node limit, `searchmoves`, and fixed timeout
- Zero label records, partial scores, and ranks for that parent
- A payload SHA-256 over the complete entry
- Resume validation against the run fingerprint, raw parent, legal moves, and fixed search contract

Every non-timeout engine error, malformed MultiPV, illegal move, incomplete depth, or checkpoint-write error remains fatal.

## Never reuse the timed-out process

Expiration of the JavaScript timer does not prove that YaneuraOu stopped searching. Sending another `isready` or `position` command to that process would be unsafe.

The new implementation fixes this order:

1. Recognize the timeout by type.
2. Send `quit` and force-kill after a short bounded close if necessary.
3. Only after the process closes, data-sync the no-label timeout entry.
4. If work remains, initialize a new process in a fresh private working directory.
5. Use the same pinned engine, eval, options, and hermetic environment.

No stdout, TT, history, or working-directory state from the timed-out search can reach the next parent.

If either the initial process or a replacement cannot complete its `usiok` / `readyok` handshake, cleanup is enforced at both the wrapper and worker boundaries: send quit, apply a bounded force-kill, wait for the OS close, and only then propagate the error. An initialization failure never becomes another search-timeout skip; it stops the run without an additional parent entry or published result.

## Timeout skips are strictly bounded

One hard parent can be quarantined; a dataset with widespread timeouts cannot be called complete. The cumulative limit for each canonical target prefix is:

```text
timeout_skip_limit = ceil(target_parents / 1000)
```

| Target | Maximum timeout skips |
| ---: | ---: |
| 100 | 1 |
| 500 | 1 |
| 24,000 | 24 |

An excess parent is not recorded as another skip; the run fails. Private work entries distinguish the existing fewer-than-two-legal-moves case from a search timeout. In final `parent-completion.jsonl`, either is an explicitly processed parent with no training group, bound by its entry checksum as `forced_parent_skipped=true`.

The existing exact accounting remains:

```text
forced_parents_skipped + emitted_parent_groups = 24,000
model_training_parents = emitted_parent_groups
```

Inferring a skip from a missing group, replacing a parent, and resampling remain forbidden.

To make the cap auditable without opening private `work.jsonl`, every prefix milestone, the teacher manifest, the staged result, and the final public result carry exact `fewer_than_two_legal_moves` and `search_timeout_no_label` counts. The three final values must be identical, their sum must equal `forced_parents_skipped`, and the timeout count must stay within the table above.

The v2 `parent-completion.jsonl` rows and binding are unchanged. They continue to record only whether a parent emitted a group; this recovery amendment makes the reason-specific aggregate a required addition to the teacher completion documents. The downstream training bridge now reads the v7 output root and rechecks the manifest/public-result reason equality, total, and 24-parent cap before training starts.

## Do not migrate the 99 entries across revisions

The old `work.jsonl` header and every entry are bound to the old runner’s full Git revision through the run fingerprint. The recovery revision must correctly reject that checkpoint.

Reusing 99 entries would require a new cross-revision migration authority that reauthenticates and revalidates every old entry and proves the transition between label policies. That boundary is disproportionate to the few minutes saved.

- Preserve failed v6 output unchanged as private failure evidence.
- Use a new v7 output generation for recovery.
- Reauthenticate all 24,000 inputs and start clean from zero.

## Validation scope

With fixed Node v22.13.0, the three focused USI-wrapper, generator, and runner test files passed 49 tests. Eight training-bridge stdlib tests also passed. They cover typed proposal and independent-rescore timeouts, zero partial labels, replacement in a fresh private directory, no surviving child after initial or replacement handshake timeouts, no extra skip or result for initialization failure, forced/emitted accounting, the public reason breakdown, timeout-metadata tamper rejection, fatal behavior beyond the cap, the new v7 root, and the pre-training revalidation.

That pass validates recovery code; it is not evidence of teacher completion or playing strength. Only after review, CI, and a regular merge should the v7 run begin, followed by separate audits of the 100, 500, and 24,000 receipts.

Machine-readable facts are in the [timeout recovery evidence](./data/floodgate-strength-first-timeout-recovery-2026-07-19.json), and the prospective policy is in the [timeout recovery amendment](../ml/protocols/floodgate-q1-2026-strength-first-timeout-recovery-amendment.json).
