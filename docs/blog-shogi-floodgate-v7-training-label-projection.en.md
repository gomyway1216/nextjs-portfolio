# Projecting completed parents into training rows — Floodgate v7 training-label projection

> On success, the preceding final-24000 contract seals HMAC-chained authenticated work while every completed parent still records `teacher_labels_emitted: 0`. Advancing from that state to `shogi-sibling-v1` training rows requires one deterministic boundary that projects the search evidence exactly once. As the first narrow step, this PR structurally reverifies one completed-parent evidence object and synchronously projects it into training rows. It neither reads sealed work nor authenticates the input's origin. No real data, engine, training, weight, live activation, holdout, or strength measurement has run. Japanese version: [blog-shogi-floodgate-v7-training-label-projection.md](./blog-shogi-floodgate-v7-training-label-projection.md)

---

## 1. Final-24000 completion is not label publication

The existing final-24000 boundary advances checkpoint work to an authenticated completed state. A completed parent retains candidates, independent rescores, and search bindings, while its completion deliberately remains `teacher_labels_emitted: 0`.

```text
authenticated completed-parent work
              |
              +-> teacher_labels_emitted: 0
              +-> training row: not yet present
```

Success of final-24000—or merely the existence of code that can execute it—must not be reinterpreted as teacher-label generation, publication, or a trained weight.

## 2. This change adds only a pure synchronous projection

The new function accepts one caller-supplied completed-parent evidence value and returns a readonly array of `shogi-sibling-v1` rows within the same call stack. It touches no filesystem, network, clock, randomness, engine, checkpoint, or key.

```text
completed-parent evidence
          |
          v
strict structural reverification
          |
          v
deeply frozen shogi-sibling-v1 rows
```

This is a format-and-semantics boundary. It is not the finalizer that materializes a label dataset from sealed work.

## 3. Structure is reverified, but origin is not authenticated

Before projection, the existing completed-parent verifier rederives and cross-checks the schema, exact key sets, parent / legal / candidate / rescore bindings, child identities, scores, completion, and semantic digest. The projection neither trusts the caller object as-is nor performs a partial field copy.

The completed-parent digest is still an unkeyed semantic identity. The projection receives no held checkpoint descriptor, scans no HMAC chain, and reads no sealed work bytes. It cannot establish that a structurally self-consistent value came from an approved final-24000 run. Origin authentication remains the next boundary.

## 4. A forced parent produces zero rows

A forced parent with exactly one rules-complete legal move skips both teacher proposal and independent rescoring upstream. Synthesizing a lone label from that parent would violate the sibling-ranking contract because there is nothing to compare.

The projection result for `forced-parent-skip` is therefore exactly an empty array. It does not infer a pseudo-score from the played / stable match and emits no training record.

## 5. Ordinary parents rank by CP and UTF-8 only

For a non-forced parent, independent-rescore parent-perspective CP is ordered descending. Equal scores are broken by ascending UTF-8 move bytes. `teacher_rank` is assigned contiguously from one, and output rows use that same order.

```text
primary:   teacher_parent_cp descending
tie-break: UTF-8(move) ascending
rank:      1, 2, ... N
```

The result does not depend on the candidate's prior enumeration, engine-response order, locale, or worker count.

## 6. Child-side CP inverts the sign

An independent rescore is expressed from the parent side's perspective. `teacher_parent_cp` retains that value. Because the side to move changes in the child position consumed by the model, `teacher_child_cp` and canonical `cp` receive its sign-inverted value.

```text
teacher_child_cp = cp = -teacher_parent_cp
```

Canonical zero remains zero. Ranking is performed in the parent perspective before this conversion, so the parent's ordering is preserved.

## 7. Canonical sources come from provenance

Only the candidate's already-validated provenance is mapped into sources, deduplicated in the fixed `played`, `teacher`, `stable` order.

| Completed-parent provenance | `shogi-sibling-v1` source |
| --------------------------- | ------------------------- |
| `strong_game_played`        | `played`                  |
| `production_proposal`       | `teacher`                 |
| `stable_policy`             | `stable`                  |

The projection does not infer a source from move text or rank and does not fill in a false provenance flag. A move reached through several paths remains one row with several sources.

## 8. Mate metadata remains exact

An ordinary CP score carries only `teacher_score_kind: "cp"` and no mate fields. A mate score carries `teacher_score_kind: "mate"`; signed `teacher_mate` is reconstructed from the verified distance and sign, while `mate_sign` is copied exactly to `teacher_mate_sign`. A zero distance is normalized to canonical `+0` instead of JSON-inexpressible `-0`, with the negative-side meaning retained by the explicit sign. The corresponding mapped parent CP and sign-inverted child CP remain present.

The projection does not infer distance or sign from rank, discard the sign of a zero-distance mate, or erase mate metadata after mapping it to CP. It projects the tuple already checked by the structural verifier as one unit.

## 9. `split: "train"` records earlier role isolation

A future authenticated finalizer will call this projection only downstream from the existing role-lock boundary that separated selection and final holdout from the training role. As an output assignment for that caller, every row receives exactly `split: "train"`; this function performs no new random split. This pure function itself checks neither the role lock nor an HMAC and issues no evidence that caller input really came from the training role.

That field does not mean a holdout was read, a dataset was published, or training completed. It is an explicit assignment for a future training-only caller, and the receipt retains `training_role_authenticated: false`.

## 10. Output is deterministic and deeply frozen

Output is derived only from normalized parent identity, move, child SFEN / position identity, score, rank, provenance, and `split`. The same verified evidence produces rows with the same bytewise semantics and order. The top-level array, every row, and nested `sources` arrays are deeply frozen.

Later caller mutation of the input cannot change returned rows, and returned values cannot be edited afterward. The projection itself creates no file and claims no JSONL serialization, fsync, rename, or manifest authentication.

## 11. Threat matrix and validation result

| Threat / condition                                        | Handling in this change                                    | Not claimed                     |
| --------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------- |
| Malformed / inconsistent completed-parent evidence        | Fail closed through the existing structural verifier       | Origin authentication           |
| Nondeterminism from candidate order or tied CP            | Re-rank by descending parent CP, then ascending UTF-8 move | Engine re-execution             |
| Synthetic label from a forced parent                      | Exactly zero rows                                          | Teacher score for a lone move   |
| Mismapped provenance, mate data, or child perspective     | Check exact mapping and sign inversion                     | Search quality                  |
| Self-consistent forged object / recomputed unkeyed digest | Not prevented by this pure boundary alone                  | Checkpoint HMAC provenance      |
| Crash or mismatched partial work/result/manifest          | No filesystem operation occurs here                        | Durability / atomic publication |

The focused unit suite passed **1 file / 6 tests, 6 / 6 PASS** (631 ms Vitest duration; 90 ms test time). It covers a normal 14-candidate parent, CP ties, source combinations, mate metadata and negative-zero canonicalization, sign inversion, forced zero-row output, deep freezing, reproducibility, and clone / tamper / Proxy / arity rejection. `tsc --noEmit` and Prettier also passed. Full regression, lint, and the production build had not run at this point and will be recorded separately during final validation.

## 12. Authenticated finalization comes next

The next boundary must incrementally scan the private checkpoint through a held file descriptor, validating each record's HMAC chain and the exact final-24000 completion before passing it to this projection. It must then finalize training JSONL, result, and manifest crash-safely, and bind them to the consumer's exact postflight receipt and the publication transaction.

```text
held-FD incremental HMAC scan
              |
              v
deterministic projection
              |
              v
train JSONL -> fsync -> result -> fsync -> manifest -> fsync
              |
              v
exact consumer postflight -> publication
```

At this point no real Floodgate data has been read, no engine started, no teacher dataset finalized, no training run, no weight changed, no live evaluator activated, no selection / holdout opened, and no Elo or rank measured. The only result is a deterministic projection contract awaiting an authenticated finalizer; it is not evidence of improved playing strength.
