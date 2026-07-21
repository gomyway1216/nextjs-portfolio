# Replacing the zero-timeout fresh-teacher premise with measured bounds

> On July 20, 2026, the old 12-process v1 fresh-selection run stopped twice on
> the same private parent. Based on that measurement, we preregistered a v2
> policy that permits at most five no-label timeout quarantines. A clean
> 13-process v2 run then completed in about 57 minutes 30 seconds, accounting
> for all 4,800 parents and producing 4,798 parent groups and 28,518 records
> with two timeout skips and zero partial labels. This is not evidence of
> candidate selection, stronger play, high-dan strength, or a live-weight change. 日本語版:
> [blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.md](./blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.md)

## What happened

| Run | Wall time | Durable parents | Emitted groups / records | Complete dataset / result |
| --- | ---: | ---: | ---: | ---: |
| Initial v1 run | 1,194.49 s | 1,678 / 4,800 | 1,678 / 9,993 | 0 / 0 |
| Exact-condition resume | 784.54 s | 2,669 / 4,800 | 2,669 / 15,884 | 0 / 0 |
| Clean v2 run | About 3,450 s | 4,800 / 4,800 | 4,798 / 28,518 | 1 / 1 |

Both runs used 12 YaneuraOu processes, one thread and 512 MiB Hash per process,
depth-14 MultiPV-6 proposals, independent depth-16 rescoring, and a 600,000 ms
limit per search. The same private parent timed out twice. Its identifier, SFEN,
move, and teacher scores are not published.

The private checkpoint contains one header and 2,669 unique completed parents,
zero skips, and 15,884 completed label records. No `selection.jsonl`,
`manifest.json`, `authority.json`, or `result.json` was published. No partial
dataset reached candidate evaluation, and no live weight changed.

The later clean v2 run completed all 4,800 parents with 13 engines. It
quarantined two timed-out parents as `search-timeout-no-label`, within the cap
of five, and retained no partial rank, score, or record from either parent. The
accounting is exactly 4,798 emitted parent groups plus two timeout skips equals
4,800 completed parents, with zero other skips. Those 4,798 parents produced
28,518 records and a complete dataset and result. AWS, GCP / Firebase, and
Vercel training compute remained zero, as did live-weight writes.

| Completed v2 artifact | Bytes |
| --- | ---: |
| Selection dataset | 23,800,461 |
| Canonical work | 35,630,716 |

The machine-readable record at the end preserves the complete dataset, work,
completion, generation, and run identities. No private parent identifier,
SFEN, move, teacher score, or absolute path is published.

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
fingerprint. We did not rewrite its header or re-label its 2,669 entries as v2.
It remains private diagnostic evidence, while v2 was generated cleanly in a
new fixed output root.

The recomputation took about 57 minutes 30 seconds and preserved reproducible
provenance without mixing labels produced under different contracts.

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
full Python suite passes 416 tests. TypeScript compilation, ESLint, Prettier,
and the diff check pass. Independent audit gave this semantic-only boundary a
GO verdict.

The real v2 run completed fresh-selection teacher generation with all 4,800
parents accounted for, 4,798 groups, 28,518 records, two timeout quarantines,
and zero partial labels. Read-only semantic validation also passed, and the
selection-evaluator registry generated from the measured identities matches
the tracked registry byte for byte. The next step is to review and merge that
READY registration, then evaluate stable and seeds 42, 43, and 44 on the same
dataset. Candidate selection, holdouts, formal A/B, and external calibration
remain incomplete. This does not establish stronger or high-dan play. Live
weight changes remain zero.

Machine-readable record:
[floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json](./data/floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json)
