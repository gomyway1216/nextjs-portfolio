# Before strengthening the shogi evaluator: safely resuming clean-room teacher generation through three gates

> This change still does not modify the evaluator or the live environment. It adds a source/test-only ownership boundary that binds the clean-room preparation capability from PR1 to 100 → 500 → 24,000 parents in one authenticated V3 work stream. Real private copies, teacher processes, label generation, retraining, A/B, and live activation all remain at zero. Japanese version: [blog-shogi-floodgate-v7-clean-room-run-gates.md](./blog-shogi-floodgate-v7-clean-room-run-gates.md)

## 1. The problem addressed here

Running all 24,000 parents at once makes failures in runtime wiring, capacity, checkpoint resume, and shutdown difficult to isolate. Creating unrelated files for 100, 500, and 24,000 parents would not prove that a later gate authenticated and resumed its predecessor.

This boundary fixes all of the following together:

- consume one PR1 test preparation capability exactly once and accept only the opaque grant minted at that moment;
- measure at least 20 GiB on the prepared filesystem before work may start;
- create one test-origin coordinator through the existing self-cleaning parent coordinator core and claim its checkpoint handoff once;
- retain that handoff while issuing only one 100 → 500 → 24,000 authority at a time;
- at each gate, accept only the exact unclaimed receipt object registered by the deployment-key V3 core after both checkpoint success and lease close;
- accept only a 500 receipt that exactly resumed 100 and a final receipt that exactly resumed 500; and
- abort/drain the owner and join close on failure without deleting partial state.

No package command, fixed private runner, production lease, production key authority, label finalizer, trainer, or weight activation was added.

## 2. What the 20 GiB gate does not publish

Capacity is measured on the prepared publication filesystem that will hold the checkpoint. Before and after measurement, the clean-room root, publication parent, and state root are revalidated for directory identity, owner, and `0700` mode. The publication and state namespaces must also remain empty. The threshold is exactly:

`20 × 1024 × 1024 × 1024 bytes`

Receipts and errors expose only:

| Field                     | Published value |
| ------------------------- | --------------: |
| minimum                   |          20 GiB |
| threshold result          |  true / failure |
| exact available bytes     |   not published |
| path / HOME / volume name |   not published |
| utilization               |   not published |

If capacity is insufficient and the work namespaces are reconfirmed empty, the disposition is `definitely-absent-fresh-retry-allowed`. Immediately before the executor is called, the state is conservatively treated as partial. It is downgraded to definitely absent only after abort/drain and close all succeed and the publication and state namespaces are reconfirmed empty under the same three directory identities captured at preflight. Every other case is `preserved-partial-reconciliation-required`.

## 3. Proving one continuous stream

Each executor can claim the currently active opaque authority once. In addition, its returned receipt must be the exact object registered in a WeakSet by the deployment-key V3 core after checkpoint success and lease close. That receipt claim is also one-shot. Clones, forged objects, replays, production/test registry confusion, and receipts from the raw test core that bypass the deployment key are rejected. The next authority is not created until both the prior receipt's provenance and contents pass validation.

| order | gate                 | completed | exact resumed | records | sealed |
| ----: | -------------------- | --------: | ------------: | ------: | ------ |
|     1 | `durable-prefix-100` |       100 |             0 |     102 | false  |
|     2 | `durable-prefix-500` |       500 |           100 |     503 | false  |
|     3 | `sealed-final-24000` |    24,000 |           500 |  24,004 | true   |

All three receipts must share:

- the same internally generated run ID;
- deployment key ID;
- stage basename, parent device/inode, and stage device/inode;
- the 100-parent milestone MAC; and
- the 500-parent milestone MAC.

Work bytes must strictly increase and each advancing gate must have a distinct digest. The run ID, stage identity, MACs, and work digests are used only for validation and never appear in the clean-room public receipt.

## 4. Authentication is not reimplemented

This layer does not recreate HMAC, key derivation, stage leasing, or training-row authentication. It creates the parent process through the existing self-cleaning coordinator core rather than an arbitrary factory, then receives it once through `claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests`. If one side fails during coordinator initialization, the existing core cleans up any sibling runtime it already started.

The executor in this PR is an injected test seam, so a passing receipt is not operational evidence. The source boundary nevertheless rejects hand-built receipts and requires the exact successful receipt from the existing deployment-key V3 test core. The composition tests explicitly stub only this provenance claim; a separate real V3 test rejects clones, replay, registry confusion, and raw test-core receipts. Authenticated JSONL, milestones, exact resume, and sealing also remain covered by the existing V3 checkpoint integration test. There is no fallback to a production-origin API.

## 5. Failure handling

| Failure point                                                     | Work state             | Disposition                                                     |
| ----------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------- |
| Below 20 GiB with empty namespaces                                | definitely absent      | fresh invocation after capacity is available                    |
| Before executor invocation                                        | definitely absent      | fresh invocation allowed                                        |
| Prepared state is already nonempty                                | may exist              | preserve and reconcile                                          |
| After executor invocation                                         | initially may exist    | abort/drain, join close, then revalidate identity and emptiness |
| Executor failure, cleanup succeeds, same identities remain empty  | definitely absent      | fresh invocation allowed                                        |
| Executor failure with output, identity change, or cleanup failure | may exist              | preserve and reconcile                                          |
| Receipt continuity mismatch                                       | may exist              | reject evidence and reconcile                                   |
| Close failure after final                                         | sealed state may exist | do not report success; reconcile                                |

Error messages, stacks, and JSON fields omit dependency failures, paths, capacity measurements, run IDs, and MACs. The failure observer receives only phase, state disposition, and cleanup-failure count.

## 6. Tests measured so far

| Validation                                                          |                                            Result |
| ------------------------------------------------------------------- | ------------------------------------------------: |
| New run-gates tests                                                 |                            1 file / 13 tests PASS |
| Clean-room preparation + run gates + parent coordinator             |                           3 files / 59 tests PASS |
| Affected set including stage + row + deployment key + V3 checkpoint |                          7 files / 298 tests PASS |
| Full post-merge Vitest suite                                        |   179 files / 3,222 passed / 1 skipped / 0 failed |
| ML stdlib                                                           |                                    101 tests PASS |
| TypeScript no-emit                                                  |                                              PASS |
| Repository ESLint                                                   |             0 errors (pre-existing warnings only) |
| Production build                                                    |                                              PASS |
| Clean `npm ci` audit                                                |                                 0 vulnerabilities |
| Independent final review                                            | 8 files / 347 tests PASS; unresolved P0/P1/P2 = 0 |

The new tests cover the exact 20 GiB boundary, insufficient capacity, pre-existing partial state, the opaque grant and one-shot claims, 100 → 500 → final order, exact 0 → 100 → 500 resume, broken stage continuity, self-cleanup when one coordinator side fails to initialize, failures before and after claim, output followed by rejection, replacement of an empty directory with a different identity, abort/drain plus close joining, and sanitized errors. The real V3 checkpoint test also rejects receipt cloning, replay, registry confusion, and deployment-key bypass.

The first independent review found three P1 issues (receipt provenance, prepared-plan bypass, and an incorrect absent-state downgrade) plus one P2 issue (owner cleanup during partial coordinator initialization). All four were fixed. The independent final re-review reported zero unresolved P0, P1, or P2 findings.

## 7. Current operational state

- Real private copies: 0
- Private input reads: 0
- Teacher processes / teacher rows: 0 / 0
- Label finalizers: 0
- Training / candidate selection: 0 / 0
- Formal A/B / external calibration: 0 / 0
- Live weight changes / activations: false / 0

This PR is therefore not evidence that the evaluator became stronger. It provides a reviewable source/test contract for capacity, ownership, ordering, resume, and failure recovery before teacher generation starts.

Any operational change comes through a separate explicit gate only after this PR's CI and independent review close. The first executable gate will be limited to 100 parents. The 500- and 24,000-parent gates cannot open without the measured receipt from their predecessor. Even a sealed final remains separate from label projection, retraining, candidate selection, formal A/B, external calibration, and live activation.

Machine-readable evidence: [floodgate-v7-clean-room-run-gates-2026-07-18.json](./data/floodgate-v7-clean-room-run-gates-2026-07-18.json)
