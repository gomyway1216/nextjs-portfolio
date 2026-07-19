# Fresh QAT v2 execution dispatch: stop before data reads without a successor

> As of 2026-07-18, no ready successor exists to activate a v2 execution plan, parent-accounting proposal, or `train.jsonl`. The production route therefore always stops before its artifact reader, Torch-runtime reader, or training-contract builder. Real teacher generation, training, candidate selection, A/B games, and live-weight changes all remain at zero. [日本語版](./blog-shogi-floodgate-fresh-qat-v2-execution-dispatch.md)

## What this change adds

Parent accounting v2 separates the fixed 24,000 input parents from the parents that actually emitted trainable groups. Defining the correct accounting equation was not enough, however: a safe bridge to the training entry point was still missing.

This change adds that bridge as a fail-closed execution-plan verifier and dispatcher. It has only three responsibilities:

1. Route only the exact v2 plan path to the new verifier
2. Separate a permanently closed activation anchor from a future ready successor added by a different PR
3. Avoid the proposal, plan, train data, other training artifacts, runtime reader, and training-contract builder when the successor is absent

It does not add a teacher runner, artifact enrollment, or a training launcher.

## Why the anchor and successor are separate

Opening an existing closed registry in place would mix two facts in one mutable record: what used to be closed, and which later change granted authority.

The [activation anchor](../ml/protocols/floodgate-q1-2026-fresh-qat-v2-activation-anchor.json) therefore remains permanently closed.

| Record | Bytes | SHA-256 |
| --- | ---: | --- |
| V1 plan registry | 409 | `9a1af8144cda4a222e300676c1475d69314c5ac32fe6a11a58adf7acfe5d9a00` |
| V1 selection registry | 2,294 | `7593d5675884431e5fbcc71c7925b7f094c3ab48f6de9f74850b195f57aedd39` |
| Closed parent-accounting v2 registry | 3,501 | `97bd6c1839288f505d31e62904ba095a0ccd11a5dc1f5a58d37f21bea11e214c` |
| Permanent activation anchor | 3,387 | `c6b22c202087f0142cc73c37fc033a8e322cb12867a59d9ed027be9eb89eaca7` |

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
6. Read the enrolled proposal, plan, and train identities twice by exact bytes and SHA-256
7. Cross-check the proposal, plan, train identity, F/E accounting, and all three training contracts
8. Only then verify the runtime and other input artifacts

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

The artifact-schema resolver adds exactly one pair:

| Execution plan | Training contract | Result |
| --- | --- | --- |
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

Partial emission, `0 < E < 24000`, is accepted only when proposal and train bytes, SHA-256, records, parents, games, and semantic-ID identities all agree exactly. Replacement and resampling must remain zero, and emitted order must be preserved.

When `E = 0`, meaning all 24,000 inputs are authenticated forced parents, the route returns `STOP-no-trainable-parent-groups`. It never reaches the training-contract builder.

## What remains unchanged

The canonical identities of the training, slot, and selection contracts are unchanged.

| Contract | Canonical SHA-256 |
| --- | --- |
| Training | `b0bf9dbd2342b8be325fae4d195e9bdd909a702361d229293f30849f1348d8ac` |
| Seeds / slots | `aab83502378adca6557e4ba0d9da4cf545061eed8d15b1aeae0b99b8a41ffeed` |
| Selection | `9aeade0c64556bd8c3b59bff7b1b1cedb386d2226a4ce60fc7b59677d305352c` |

Seeds 42/43/44, model, loss, optimizer, learning rate, 20 epochs, selection gates, and holdout policy remain unchanged. Selection reads, holdout reads, and production-weight writes remain unauthorized even in the future ready-successor shape.

## Where AWS, GCP, and Vercel fit

AWS is neither required nor used by this change. All verifier and hash validation ran on the local CPU, and network use was zero.

Firebase Cloud Functions running on GCP and Vercel handling web deployment are separate systems from this evaluation-function training-entry verification.

| Infrastructure | Use in this change |
| --- | --- |
| Local Mac CPU | Verifier and 150 stdlib tests |
| AWS | Not used |
| Firebase / GCP | Not used |
| Vercel | Not used |
| Torch | No real training or checkpoint read |

A later decision could move large-scale teacher generation to different compute after measuring the real data volume and runtime. That would be a separate operational change. AWS is not needed to establish this safety gate.

## Validation

The code commit is `a0e136296772840ea93066fe8013e4e2ec339a5a`; the test commit is `8481a8bc283ca648d23ad11ebd77c0c7e4c0c04a`. History was not rewritten.

- New v2 dispatch and routing tests: 17/17 PASS in 0.042 seconds
- Full repository stdlib suite: 150/150 PASS in 10.761 seconds
- Python compilation: PASS
- JSON validation: PASS
- `git diff --check`: PASS
- Actual teacher / training artifact / Torch training / selection / A/B / live-weight write executions: zero
- CI: pending
- Independent review: pending

Adversarial coverage includes missing successors; near and symlink paths; wrong schemas; v1/v2/WCSC36 hybrids; Boolean-as-integer aliases; broken F+E accounting; partial, full, and all-forced cases; proposal/train identity drift; replacement; slot drift; contract drift; authority escalation; duplicate keys; `NaN`; and predecessor-registry drift.

The machine-readable record is [`floodgate-fresh-qat-v2-execution-dispatch-2026-07-18.json`](./data/floodgate-fresh-qat-v2-execution-dispatch-2026-07-18.json).

## What comes next

The next step is to finish production-finalizer-authenticated completion evidence, exact train bytes, and the parent-accounting proposal, then independently verify each identity. After that, a v2 execution plan can be created and the ready successor can be added in a separate data-only PR.

That successor must not be added until CI and independent review pass. Even after it exists, it authorizes only the training-dispatch stage. Selection, holdout, promotion, and live-weight changes each require separate evidence and gates.
