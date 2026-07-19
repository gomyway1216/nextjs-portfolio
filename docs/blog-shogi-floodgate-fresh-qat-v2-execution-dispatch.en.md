# Fresh QAT v2 execution dispatch: stop before data reads without a successor

> As of 2026-07-19, no ready successor exists to activate a v2 execution plan, parent-accounting proposal, or `train.jsonl`. The production route therefore always stops before its artifact reader, Torch-runtime reader, or training-contract builder. Real teacher generation, training, candidate selection, A/B games, and live-weight changes all remain at zero. [日本語版](./blog-shogi-floodgate-fresh-qat-v2-execution-dispatch.md)

## What this change adds

Parent accounting v2 separates the fixed 24,000 input parents from the parents that actually emitted trainable groups. Defining the correct accounting equation was not enough, however: a safe bridge to the training entry point was still missing.

This change adds that bridge as a fail-closed execution-plan verifier and dispatcher. It has only four responsibilities:

1. Route only the exact v2 plan path to the new verifier
2. Separate a permanently closed activation anchor from a future ready successor added by a different PR
3. Avoid the proposal, plan, train data, other training artifacts, runtime reader, and training-contract builder when the successor is absent
4. Even with a successor, avoid the training-contract builder until the production source-accounting validator has recomputed the whole proposal from enrolled exact input, completion, and train bytes

It does not add a teacher runner, artifact enrollment, or a training launcher.

## Why the anchor and successor are separate

Opening an existing closed registry in place would mix two facts in one mutable record: what used to be closed, and which later change granted authority.

The [activation anchor](../ml/protocols/floodgate-q1-2026-fresh-qat-v2-activation-anchor.json) therefore remains permanently closed.

| Record                               | Bytes | SHA-256                                                            |
| ------------------------------------ | ----: | ------------------------------------------------------------------ |
| V1 plan registry                     |   409 | `9a1af8144cda4a222e300676c1475d69314c5ac32fe6a11a58adf7acfe5d9a00` |
| V1 selection registry                | 2,294 | `7593d5675884431e5fbcc71c7925b7f094c3ab48f6de9f74850b195f57aedd39` |
| Closed parent-accounting v2 registry | 3,501 | `97bd6c1839288f505d31e62904ba095a0ccd11a5dc1f5a58d37f21bea11e214c` |
| Permanent activation anchor          | 3,387 | `c6b22c202087f0142cc73c37fc033a8e322cb12867a59d9ed027be9eb89eaca7` |

The three predecessor files remain byte-for-byte unchanged. The anchor pins their exact identities, the future v2 paths, and the fact that every current gate and authority flag is `false`.

Making the route ready in the future must not edit the anchor. It requires one additive file:

```text
ml/protocols/floodgate-q1-2026-fresh-qat-v2-ready-successor.json
```

That file does not exist today. Its absence is itself the production STOP condition.

## The actual stop order

The dispatcher processes the route in this order:

1. Require the exact, nonsymlinked v2 plan argument
2. Verify the permanent anchor's bytes, SHA-256, and canonical JSON value
3. Attempt to read the exact ready-successor path
4. Stop immediately when the successor is absent
5. Only with a successor, reverify the three immutable predecessor registries
6. Read the enrolled input, per-parent completion, proposal, plan, and train identities twice by exact bytes and SHA-256
7. Pass the exact input, completion, and train bytes plus the proposal to the production source-accounting validator, requiring completion enrollment and complete source-derived digest and contract regeneration
8. For the same proposal returned by that validator, cross-check the plan, train identity, F/E accounting, and all three training contracts
9. Only then verify the runtime and other input artifacts

A ready successor merely declaring `parent_completion_evidence_enrolled: true` is not authentication. The production validator observes that completion enrollment is still `null` in the current closed registry and stops, so a synthetic successor, self-asserted `upstream`, or self-asserted `materialization_boundary` cannot issue a contract.

The tests directly assert that both artifact-reader and runtime-reader call counts are zero at step 4. The STOP exception also carries all of these values as `false`:

- Artifact read authorized
- Torch-runtime read authorized
- Training contract issued
- Training dispatch authorized

## Exact path and schema pair

The v2 route accepts exactly one path:

```text
ml/protocols/floodgate-q1-2026-fresh-qat-execution-plan-v2.json
```

A `.copy` near path, a symlink to the same name, or a similar name elsewhere is rejected. The exact v1 route and the existing WCSC36 fallback remain intact.

Path conversion is also a single immutable boundary: the dispatcher calls `os.fspath` exactly once and uses only that captured text for every subsequent absolute-path and real-path decision. A stateful `PathLike` that first returns an old fallback path and would return v2 on a second call is never queried twice. If its single captured value is v2, it is rejected because it is not a plain `str`. The regression test covers both switching directions and asserts an exact call count of one.

An ancestor symlink alias outside the repository, such as `/tmp` to `/private/tmp`, is allowed only when it resolves to the same canonical repository root. Below that root, every component of the plan, output, and model-training paths is checked, and an intermediate or final symlink is rejected. A malformed custom `PathLike` that raises `AttributeError` is also closed after its single capture attempt.

Before reading, the production default reader walks the canonical path from the root through held directory descriptors, then requires the final name to be a regular non-symlink file with `stat(..., follow_symlinks=False)` relative to the held parent. It opens from that same parent FD with `O_NOFOLLOW` / `O_NONBLOCK`, binds the opened device, inode, and size with `fstat`, and reads at most one byte beyond the registered exact length. The not-yet-identified successor also has a fixed 1 MiB limit, so a FIFO, device, symlink, or oversized file cannot cause a blocking or unbounded read.

The artifact-schema resolver adds exactly one pair:

| Execution plan                                | Training contract                                  | Result   |
| --------------------------------------------- | -------------------------------------------------- | -------- |
| `shogi-floodgate-fresh-qat-execution-plan-v2` | `shogi-floodgate-fresh-qat-training-experiment-v1` | Accepted |

The training method is unchanged, so v2 reuses the existing v1 training-contract schema. Hybrids such as a v2 plan with a WCSC36 contract, or a v1 plan with an invented v2 contract, are rejected.

## How F and E are bound

A ready successor must satisfy this equation with exact JSON types:

```text
input_parents = 24000
forced_parents_skipped = F
emitted_parent_groups = E
F + E = 24000
model_training_parents = E
```

The same E must then appear in every one of these records:

- Successor parent accounting
- Parent-accounting proposal
- The proposal's exact train identity
- Execution-plan `inputs.model_training`
- Training contracts for seeds 42, 43, and 44

Partial emission, `0 < E < 24000`, is accepted only after the production validator recomputes the proposal from enrolled exact input, completion, and train bytes and the proposal and train byte length, SHA-256, record, parent, game, and semantic-ID identities all agree exactly. Replacement and resampling must remain zero, and emitted order must be preserved.

An `E = 0` **declaration** in the successor triggers an early fail-closed exception before source authentication. It does not prove that all 24,000 inputs are authenticated forced parents, nor does it return the parent-accounting materializer's literal `STOP-no-trainable-parent-groups` receipt. The early exception does not reach the training-contract builder.

## What remains unchanged

The canonical identities of the training, slot, and selection contracts are unchanged.

| Contract      | Canonical SHA-256                                                  |
| ------------- | ------------------------------------------------------------------ |
| Training      | `b0bf9dbd2342b8be325fae4d195e9bdd909a702361d229293f30849f1348d8ac` |
| Seeds / slots | `aab83502378adca6557e4ba0d9da4cf545061eed8d15b1aeae0b99b8a41ffeed` |
| Selection     | `9aeade0c64556bd8c3b59bff7b1b1cedb386d2226a4ce60fc7b59677d305352c` |

Seeds 42/43/44, model, loss, optimizer, learning rate, 20 epochs, selection gates, and holdout policy remain unchanged. Selection reads, holdout reads, and production-weight writes remain unauthorized even in the future ready-successor shape.

## Where AWS, GCP, and Vercel fit

AWS is neither required nor used by this change. All verifier and hash validation ran on the local CPU, and network use was zero.

Firebase Cloud Functions running on GCP and Vercel handling web deployment are separate systems from this evaluation-function training-entry verification.

| Infrastructure | Use in this change                  |
| -------------- | ----------------------------------- |
| Local Mac CPU  | Verifier and 177 stdlib tests       |
| AWS            | Not used                            |
| Firebase / GCP | Not used                            |
| Vercel         | Not used                            |
| Torch          | No real training or checkpoint read |

A later decision could move large-scale teacher generation to different compute after measuring the real data volume and runtime. That would be a separate operational change. AWS is not needed to establish this safety gate.

## Validation

The source-authentication remediation code commit is `7af69a1fe518ff3f2c64a7238d695d173f642e87`; the original remediation tests are `0aaa09aae018f90648edccd9763e55c06103f031` and `f9fee197def90681c1444dc68a646b7f5f06a936`. The stateful-`PathLike` single-snapshot remediation is the separate commit `33d9b3139068fac69c44d368869006f5d5d919db`. History was not rewritten.

The latest `main` revision `00f255a62e01ea5a980ada987682c994e76dd1f9`, including PR #513, was integrated by regular merge commit `038f6d7bc251c91547949a717daa056f363089cc`. That integration left the Fresh-QAT implementation paths unchanged and retained both the teacher-finalizer and Fresh-QAT command entries. Four PR-review findings covering path aliases, symlinks, and a malformed `PathLike` were fixed in `ade5554bdcc222183cd12183cbbfdb5301675c65`; the blocking/unbounded default-reader finding was fixed in `6b5577ab98709e824f0596ddcb7e2cb1fb6a5bfb`. A subsequent self-review found an intermediate-directory replacement TOCTOU between the then-current preliminary `lstat` and absolute `open`. Commit `91ae5c69591a38c7119f9d15a1c2a1e4fbf1c8d7` now walks every directory component from the canonical repository root with held directory descriptors and `O_DIRECTORY | O_NOFOLLOW`, then opens the final file from the held parent with `O_NOFOLLOW | O_NONBLOCK`. Raw OS failures are normalized to label-only `ValueError` messages without absolute paths, and `0b10dff9a405778773e6dd3483ac6be6baf54475` prevents the original path from remaining in the hidden `__context__` exception chain.

- New v2 dispatch and routing tests: 25/25 PASS in 0.050 seconds
- Full repository stdlib suite: 177/177 PASS in 11.978 seconds
- Python compilation: PASS
- JSON validation: PASS
- `git diff --check`: PASS
- Actual teacher / training artifact / Torch training / selection / A/B / live-weight write executions: zero
- CI: pending
- Initial independent review: P0/P1/P2 = 0/1/2
- Source-authentication remediation rereview: P0/P1/P2 = 0/0/1; the remaining stateful-`PathLike` finding is implemented and locally validated in `33d9b313`; final independent rereview is pending

Adversarial coverage includes missing successors; near and symlink paths; v2-targeting `Path`, `bytes`, and `str` subclasses; stateful `PathLike` values that switch between a fallback and v2; intermediate-directory rename-to-symlink replacement; final-file symlink replacement; redaction of private absolute paths from raw OS failures and removal of their `__context__` exception chains; wrong schemas; v1/v2/WCSC36 hybrids; Boolean-as-integer aliases; broken F+E accounting; partial, full, and all-forced declarations; proposal/train identity drift; exact-byte drift in input, completion, or train; unenrolled synthetic input/completion sources; self-asserted upstream values; replacement; slot drift; contract drift; authority escalation; duplicate keys; `NaN`; and predecessor-registry drift.

The machine-readable record is [`floodgate-fresh-qat-v2-execution-dispatch-2026-07-18.json`](./data/floodgate-fresh-qat-v2-execution-dispatch-2026-07-18.json).

## What comes next

The next step is to finish production-finalizer-authenticated completion evidence, exact train bytes, and the parent-accounting proposal, and make the production source-accounting validator regenerate that proposal from the enrolled exact input, completion, and train bytes. After that, a v2 execution plan can be created and the ready successor can be added in a separate data-only PR. A successor's declarations alone cannot open this gate.

That successor must not be added until CI and independent review pass. Even after it exists, it authorizes only the training-dispatch stage. Selection, holdout, promotion, and live-weight changes each require separate evidence and gates.
