# Removing the raw path from the teacher: the Floodgate pathless staging core

> The preceding [training-row consumer](./blog-shogi-floodgate-training-row-consumer.en.md) created a boundary that hands authenticated training rows to a callback without a path. PR-B1 removes the literal raw path, independently chosen output paths, and old CLI from the teacher generator, then moves a non-production `CoreForTests` seam to the `AuthenticatedFloodgateTrainingRows` type. The targeted suite is 12/12 PASS. However, that structural type is forgeable in B1, and stage, engine, and eval paths are not yet authorized as disjoint. The production runner, atomic final publication after consumer postflight, real-bundle execution, and teacher search remain unimplemented or unrun. This is a pre-runner core migration record, not a teacher-data or playing-strength result. 日本語版: [blog-shogi-floodgate-pathless-teacher-staging.md](./blog-shogi-floodgate-pathless-teacher-staging.md)

---

## Current status

| Item                                | Status          | Scope established by PR-B1                                    |
| ----------------------------------- | --------------- | ------------------------------------------------------------- |
| pathless core seam                  | implemented     | non-production `CoreForTests` accepts a structural input      |
| fixed relative filenames            | implemented     | four names are fixed below a caller-chosen root               |
| stage / input path authorization    | not implemented | B2 must prove privacy and disjointness from sealed roots      |
| resume binding                      | implemented     | the complete training binding enters the run fingerprint      |
| resume semantic audit               | implemented     | current MultiPV, limit, and candidate union are rederived     |
| targeted unit tests                 | 12/12 PASS      | synthetic rows and a fake engine only                         |
| production runner / final publisher | not implemented | the post-consumer-postflight publication boundary is separate |
| real bundle / teacher run           | not run         | selection and final labels remain unread                      |
| strength claim                      | none            | the claim boundary is `non-production-core-migration-only`    |

## 1. Authority removed from the old CLI

The old generator accepted an arbitrary input pathname through `--raw` and let the caller independently choose `--out-train`, `--out-val`, `--manifest`, and `--work`. It also accepted `--max-parents`, allowing only a prefix of the input to be processed. That shape left room to reopen a file other than the rows authenticated by the consumer, overlap an output with protected input, or present a partial set of 24,000 rows as if it were the same run.

PR-B1 replaces the non-production test seam with:

```text
stageSiblingTeacherDatasetCoreForTests(
  structuralTrainingRows,
  { stageRoot, engineBin, engineReceipt, evalDir, search options },
  dependencies,
)
```

This seam has no raw pathname, individual output pathname, `maxParents`, or caller-selected pipeline revision. The pipeline revision comes from the supplied binding's `verifier_revision`. The parent set is all of `input.rows`; there is no option to select only a prefix.

But a TypeScript interface is not a runtime capability. A caller can create self-consistent fake rows and binding, while `engineBin`, `engineReceipt`, `engineArgs`, `evalDir`, and `stageRoot` still accept arbitrary paths. The export is therefore named `CoreForTests`, and its code comment plus the CLI tombstone say that it is not a production entry. The test file's old-shape compatibility helper is also only for synthetic fixtures.

## 2. Four fixed candidate-staging filenames

Below the caller-supplied `stageRoot`, the core derives exactly these relative filenames.

| File            | Role in staging                               |
| --------------- | --------------------------------------------- |
| `train.jsonl`   | training records after the game-level split   |
| `val.jsonl`     | validation records after the game-level split |
| `manifest.json` | the existing teacher manifest v2              |
| `work.jsonl`    | the durable per-parent resume checkpoint      |

In the clean targeted fixture, these were the four files emitted directly under the stage root. The output verifier always receives these four output paths, and this fixture did not retain the deleted raw path. The engine binary, engine receipt, engine argument files, and eval tree remain protected inputs.

This proves neither a private/disjoint stage nor final publication. B2 must use realpath and inode checks to prove that `stageRoot` and engine/eval paths do not alias, contain, or lie beneath the role bundle, raw lock, role lock, or final root. `train.jsonl`, `val.jsonl`, and `manifest.json` are written into candidate staging when the core completes, but the publisher that adopts them in another root only after consumer postflight has not been implemented.

## 3. Binding the complete receipt context into resume

`AuthenticatedFloodgateTrainingRows.binding` contains:

- Result-receipt bytes and SHA-256
- Role-bundle-manifest bytes and SHA-256
- Bundle-producer and verifier revisions
- Raw format, bytes, and SHA-256
- Record, game, and semantic-position counts
- Set digests for game, parent, and position IDs

A work fingerprint containing only the raw SHA cannot distinguish another receipt or verifier context that refers to the same raw identity. PR-B1 places the entire supplied binding object in the canonical run-fingerprint preimage as `authenticated_training_binding`. In the targeted test, changing only `result_receipt_sha256` while leaving rows and raw SHA unchanged makes resume stop with a checkpoint-header mismatch. This is a unit fact about fingerprint behavior, not runtime authentication that the binding was issued by the consumer.

The complete binding is not exposed as a new field in the existing manifest v2. It changes the `run_fingerprint` stored in the `work.jsonl` header while preserving the existing schema. The guarantee at this stage is therefore “do not resume a checkpoint under a different binding,” not “manifest v2 alone is a new production result receipt.” The final publisher will still need a separate receipt.

## 4. Recomputing row aggregates

The staging core does more than copy the binding. It recomputes the following from the received rows and compares them with that binding:

- Row and parent-ID counts equal `records`
- Distinct game-ID count equals `games`
- Distinct position-ID count equals `position_ids_count`
- Domain-separated game, parent, and position set digests match their binding digests
- `parent_id` order is strict UTF-8 byte order and semantic-position duplicates are zero

It also rechecks each row's schema, parent SFEN and position identity, ply, and `played_move`. It does not reopen JSONL and recompute raw bytes or raw SHA. When B2 passes an input actually issued by the consumer, byte authentication belongs to that preceding consumer. B1 alone checks only the self-consistency of caller-supplied rows and binding aggregates.

## 5. Rederiving the current search contract on resume

A matching payload checksum and run fingerprint are not enough to trust a resume entry. Every time `work.jsonl` is opened, the core rederives the following from the current input row and current options:

1. Proposal count from current MultiPV capped by legal-move count
2. The current requested limit for the proposal and every single-move search
3. The current v6 candidate union of proposal moves and `played_move`
4. Strict UTF-8-bytewise candidate order and candidate-set SHA-256
5. MultiPV 1 and exactly one `searchmoves` move for every independent search
6. The relationships among scores, ranks, child SFENs, and `played` / `teacher` sources

Consequently, an entry from an old depth or node limit, another MultiPV value, or a missing or added candidate cannot be resumed even if its payload is resealed. False skips, candidate execution order, total nodes, tie ranks, and child derivations are also revalidated.

However, `payload_sha256` is an unkeyed checksum and only detects torn writes. It cannot authenticate against an actor who changes a score and every derived field consistently before resealing. Until B2 introduces a trusted exclusive stage or separate authentication, `work.jsonl` is not teacher evidence.

“Current candidate union” here means the existing v6 contract: **teacher MultiPV proposals plus the strong game's `played_move`**. The runOp1 stable-move proposer from the wider plan is not connected in PR-B1. B1 removes the literal raw field and tightens resume validation; it does not yet complete the final proposal union.

## 6. Why manifest v2 remains unchanged

The teacher output continues to use:

```text
shogi-sibling-teacher-manifest-v2
shogi-sibling-teacher-work-v2
```

The existing manifest shape for teacher engine and eval snapshots, search resets, candidate accounting, progress checkpoint, split, and output bytes and SHA-256 remains unchanged. Pathless input authority and resume authentication are narrowed without simultaneously changing label records or the downstream trainer schema.

This does not mean that a v2 manifest has been published for production. The only artifacts created here came from synthetic tests using a fake engine. No manifest for the real training stage exists yet.

## 7. What the 12/12 targeted tests cover

The targeted suite passes these 12 cases:

1. A nonzero tombstone for the old raw-path CLI that leaves an existing sentinel unchanged
2. Structural input without a raw pathname, every binding field, and four fixed outputs
3. A played move outside top N, deterministic resume, and zero duplicates
4. Reset before proposal and each candidate, with canonical execution order
5. Rejection of resealed corrupt independent-search derivations
6. Rejection of a false skip for a parent with multiple legal moves
7. Exactly one of depth and node limits
8. Legal-move MultiPV cap, parent-boundary TT reset, and forced-move skip
9. Rules-complete sibling candidates including optional bishop non-promotion
10. A canonical, exact-key receipt bound to the exact engine binary
11. Immutable engine, argument-file, and eval runtime snapshots
12. Rejection of `eval_options.txt` as a mutable option override

These are unit-level facts about the staging core. They do not exercise a production runner invoking the consumer, postflight across the consumer callback, atomic adoption from staging into a final root, a production result receipt, the real bundle, or YaneuraOu execution.

## 8. PR-B1's conclusion

Selection and final labels remain unread. No teacher search or candidate training has run, so there are no claims about evaluation values, accuracy, win rate, Elo, or rank.

The one defensible conclusion is: **the old raw-path CLI now fails closed instead of looking like a successful no-op, and the non-production teacher seam no longer has a literal raw field, individually selected output paths, or a partial-parent option.** Runtime row authenticity, exclusion of sealed trees through other paths, a private stage, and postflight final publication are not yet proven. The next step is to make a consumer-owned runner the only production entry and close all of those boundaries together.
