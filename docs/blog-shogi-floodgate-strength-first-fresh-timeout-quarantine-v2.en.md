# Replacing the zero-timeout fresh-teacher premise with measured bounds

> On July 20, 2026, the 4,800-parent fresh-selection teacher stopped twice on the
> same private parent at the 600-second search limit. The 2,669 durable v1
> parents remain intact, but v1 did not complete. Before opening any fresh-final
> labels, we fixed a shared v2 policy that permits at most five typed
> `search-timeout-no-label` quarantines for both fresh-selection and
> fresh-final. 日本語版:
> [blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.md](./blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.md)

## What happened

| Run | Wall time | Durable parents | Newly saved | Complete dataset / result |
| --- | ---: | ---: | ---: | ---: |
| Initial v1 run | 1,194.49 s | 1,678 / 4,800 | 1,678 | 0 / 0 |
| Exact-condition resume | 784.54 s | 2,669 / 4,800 | 991 | 0 / 0 |

Both runs used 12 YaneuraOu processes, one thread and 512 MiB Hash per process,
depth-14 MultiPV-6 proposals, independent depth-16 rescoring, and a 600,000 ms
limit per search. The same private parent timed out twice. Its identifier, SFEN,
move, and teacher scores are not published.

The private checkpoint contains one header and 2,669 unique completed parents,
zero skips, and 15,884 completed label records. No `selection.jsonl`,
`manifest.json`, `authority.json`, or `result.json` was published. No partial
dataset reached candidate evaluation, and no live weight changed.

## Why another identical retry is not the answer

The formal 24,000-parent training teacher observed 15 timeouts, or 0.0625%.
Using that rate in a simple Poisson approximation gives three expected timeouts
per 4,800 parents.

| Event | Approximate probability |
| --- | ---: |
| Zero timeouts | 4.98% |
| At most five timeouts | 91.61% |

The approximation is not a proof of independence; two failures on the same
parent instead suggest a deterministic hard case. It does show that a
zero-timeout completion contract was inconsistent with the measured runtime.
Another blind resume could save more unrelated parents but still could not
complete that parent.

## The v2 contract

The shared v2 policy is fixed for both fresh roles before any fresh-final label
is opened:

- Only typed proposal or independent-rescore timeouts may be quarantined.
- The cap is `ceil(4,800 / 1,000) = 5`; the sixth timeout fails closed.
- No partial rank, score, or record from a timed-out parent enters the dataset.
- The failed engine is closed and a fresh engine is started for subsequent work.
- Proposal incompleteness remains fatal.
- A timeout during the all-legal fallback remains fatal.
- Forced-move and timeout reasons are counted separately.
- Canonical work plus all-parent, emitted-parent, forced-parent, and
  reason-specific parent digests are bound into manifest, authority, and result
  evidence.

The maximum missing share is 5 / 4,800 = 0.1042%. Stable and seeds 42, 43, and
44 are evaluated on the same fixed dataset. Offline selection does not establish
playing strength; sealed holdouts and formal paired A/B remain separate gates.

The two historical v1 attempts used twelve processes. A later MultiPV-6 ABBA
measurement on the same 42 positions ran `12 → 13 → 13 → 12`; thirteen was
faster in both pairs and delivered about 3.94% higher median throughput.
The clean v2 run therefore uses thirteen one-thread processes with 512 MiB Hash
each, or 6,656 MiB total. Search quality settings and the timeout contract do
not change.

## No silent v1-to-v2 migration

The v1 checkpoint is bound to its runner revision, search policy, and run
fingerprint. We will not rewrite its header or re-label its 2,669 entries as v2.
It remains private diagnostic evidence, while v2 starts clean in a new fixed
output root.

This costs roughly one hour of recomputation, but preserves reproducible
provenance instead of mixing labels produced under different contracts.

## Validation and current boundary

The generator, shared artifact validator, and both fresh-role runners pass 64
focused tests across four files. The integrated run including publication
evidence passes 76 tests across seven files. Real generator fixtures cover
engine restart after quarantine, zero partial labels, the sixth-timeout
failure, fatal proposal incompleteness, fatal fallback timeout, forbidden
resume entries, source order and game counts, and nested search, score, and
record drift.

New generation and idempotent result reuse both invoke the same shared
validator. If `result.json` exists while the manifest, authority, dataset, or
work file is missing, the runner fails closed instead of treating it as a
resume. Independent review found no blocker in this validator/runner boundary.
Node 22 TypeScript compilation and the diff check also pass.

A read-only semantic bridge now also runs immediately before candidate
evaluation. It accepts no arguments and reads only the fixed source, result,
manifest, dataset, and work under the operating-system account home, with
explicit byte limits. It cross-checks the result against the real manifest,
the dataset and work identities, completion, run fingerprint, and generation
fingerprint before re-deriving every parent search, score, and child record.
A fixture that coherently rewrites every artifact byte count and SHA-256 still
fails on its nested semantic change before evaluation or registry-candidate
emission. Tracked policy and implementation must have the same clean HEAD
before and after validation; the downstream Python boundary re-fingerprints
private artifacts again before publication.

The semantic bridge and real-generator fixture pass 68 TypeScript tests across
five files. The Python evaluator and builder pass 33 focused tests, and the
full Python suite passes 400 tests. TypeScript compilation, ESLint, Prettier,
and the diff check pass. Independent audit gave this semantic-only boundary a
GO verdict.

This is evidence for the v2 policy and runner, not for a completed v2 dataset,
candidate selection, holdout, formal A/B, high-dan calibration, or live
promotion. Live weight changes remain zero.

Machine-readable record:
[floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json](./data/floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json)
