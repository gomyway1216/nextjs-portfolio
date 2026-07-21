# Replacing the zero-timeout fresh-teacher premise with measured bounds

> On July 20, 2026, the old 12-process v1 fresh-selection run stopped twice on
> the same private parent. Based on that measurement, we preregistered a v2
> policy that permits at most five no-label timeout quarantines. A clean
> 13-process v2 run then completed in about 57 minutes and 30 seconds, accounting
> for all 4,800 parents and producing 4,798 parent groups and 28,518 records
> with two timeout skips and zero partial labels. A later real evaluation
> completed all four models: every candidate beat stable on int16 pair and
> top1, but the fixed family gate failed. This is not evidence of candidate
> selection, high-dan strength, or a live-weight change. 日本語版:
> [blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.md](./blog-shogi-floodgate-strength-first-fresh-timeout-quarantine-v2.md)

## What happened

| Run                    |     Wall time | Durable parents | Emitted groups / records | Complete dataset / result |
| ---------------------- | ------------: | --------------: | -----------------------: | ------------------------: |
| Initial v1 run         |    1,194.49 s |   1,678 / 4,800 |            1,678 / 9,993 |                     0 / 0 |
| Exact-condition resume |      784.54 s |   2,669 / 4,800 |           2,669 / 15,884 |                     0 / 0 |
| Clean v2 run           | About 3,450 s |   4,800 / 4,800 |           4,798 / 28,518 |                     1 / 1 |

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

| Completed v2 artifact |      Bytes |
| --------------------- | ---------: |
| Selection dataset     | 23,800,461 |
| Canonical work        | 35,630,716 |

The machine-readable record at the end preserves the complete dataset, work,
completion, generation, and run identities. No private parent identifier,
SFEN, move, teacher score, or absolute path is published.

## Why another identical retry is not the answer

The formal 24,000-parent training teacher observed 15 timeouts, or 0.0625%.
Using that rate in a simple Poisson approximation gives three expected timeouts
per 4,800 parents.

| Event                 | Approximate probability |
| --------------------- | ----------------------: |
| Zero timeouts         |                   4.98% |
| At most five timeouts |                  91.61% |

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

The recomputation took about 57 minutes and 30 seconds and preserved reproducible
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
the tracked registry byte for byte. That READY registration was reviewed and
regular-merged in PR #579.

## The first real selection invocation stopped safely before evaluation

After the READY merge, the first invocation of the fixed local evaluator
strict-loaded all three candidate checkpoints, then failed closed in about
four seconds before reading the selection dataset or running selection-metric
inference. The raw preflight receipt's `training_plan` had the established
three fields, `path`, `bytes`, and `sha256`, while the evaluator alone required
a fourth `schema` field. Selection-metric evaluations, selection outputs,
fresh-final holdout reads, and live-weight writes all remained zero. This was
therefore neither a candidate result nor a playing-strength measurement.

This narrow fix was reviewed and regular-merged in PR #581. It accepts the
established three-field preflight receipt and obtains the schema from the
training-plan identity already enrolled in the READY registry. Teacher-artifact
identities and the checkpoint-preflight binding are unchanged.

## The second real selection invocation also stopped safely before evaluation

The fixed local evaluator was invoked again after PR #581 merged. In about 13.2
seconds it strict-loaded all three candidate checkpoints, read all 28,518
fresh-selection records, and strict-scanned them under the configured bounds.
Every record intentionally lacked a per-record `split`. The reused legacy
loader, however, requires either `train` or `val`, so it excluded and rejected
all records. The teacher data was not corrupt; the adapter lacked the format
bridge from a fixed-role fresh-selection dataset to the legacy loader.

The three checkpoint preflight loads are a separate stage from loading models
for selection metrics. Stable and candidate selection-metric model loads both
remained zero, as did metric evaluations, selection outputs, fresh-final
holdout reads, and live-weight writes. The second stop was therefore not a
candidate result or a playing-strength measurement.

The adapter-only fix projects only records with a missing `split` to `val` in a
private `0600` temporary file and rejects the input if any record already has a
`split`. It preserves original identity, order, features, CP values, and ranks,
deletes the temporary file on success or error, and does not change the teacher
artifacts. The fix was reviewed and regular-merged in PR #583.

## The third invocation completed four models but failed the fixed family gate

After PR #583 merged, stable and seeds 42 / 43 / 44 were evaluated on the same
fixed dataset. After computing all four models, the formal CLI returned the
fixed family-gate failure and stopped with exit code 2. Its exact wall time was
not durably recorded, so no approximate CLI duration is used as evidence. The
STOP payload's `candidate_evaluations: 0` is a generic fail-closed field fixed
for every STOP reason, not an internal-work counter. Four metric evaluations—
stable once and the three candidates once each—did complete before the gate
decision. A subsequent read-only aggregate diagnostic reproduced the same computation
without publishing outputs: it processed 49,692 eligible pairs in 72.525
seconds and peaked at 452.2 MiB RSS. Accuracies in the table are fractions and
MAE is in centipawns; these are the reproduced measurements preserved by the
machine-readable record.

| Model   |         Float pair |         Int16 pair |         Float top1 |         Int16 top1 |          Float MAE |          Int16 MAE |
| ------- | -----------------: | -----------------: | -----------------: | -----------------: | -----------------: | -----------------: |
| Stable  | 0.5927513483055623 | 0.5915841584158416 | 0.3040850354314298 | 0.3034597749062109 |  525.0306201407702 |  526.6006381934217 |
| Seed 42 |   0.60363841262175 | 0.6013040328423086 | 0.3186744476865361 | 0.3153397248853689 |  405.6228289329656 |  405.9221193632092 |
| Seed 43 |  0.602511470659261 | 0.6019882476052484 | 0.3186744476865361 | 0.3161734055856607 |   405.502088185782 |  402.7880987446525 |
| Seed 44 | 0.6018071319327055 | 0.6000563470981245 | 0.3238849520633597 | 0.3186744476865361 | 405.48167040083933 | 405.71302335367136 |

A positive gate margin is remaining pass headroom; a negative margin is the
amount beyond the threshold. Stable is the comparison reference and therefore
does not itself receive the four candidate gates.

| Seed |          Int16 pair > stable |         Int16 top1 >= stable |        Abs float/int16 pair delta |         Abs float/int16 top1 delta | All four |
| ---- | ---------------------------: | ---------------------------: | --------------------------------: | ---------------------------------: | -------: |
| 42   | PASS `+0.009719874426467046` | PASS `+0.011879949979157978` | **FAIL `-0.0003343797794413978`** |      PASS `+0.0016652771988327998` |     FAIL |
| 43   | PASS `+0.010404089189406829` | PASS `+0.012713630679449806` |     PASS `+0.0014767769459873552` |      PASS `+0.0024989578991246276` | **PASS** |
| 44   | PASS `+0.008472188682282944` | PASS `+0.015214672780325178` |     PASS `+0.0002492151654189794` | **FAIL `-0.00021050437682363244`** |     FAIL |

The fixed ranking was `43 -> 42 -> 44`, making seed 42 the median-ranked
representative. Seed 42 missed the pair quantization-delta gate, while seed 44
missed the top1 quantization-delta gate. Only seed 43 passed all four, so the
family failed all three aggregate requirements: the representative did not pass
all four, fewer than two seeds passed all four, and not every seed passed both
quantization-delta gates.

Every candidate's int16 pair accuracy, top1 accuracy, and MAE improved over
stable on this fresh-selection dataset. That is promising static evidence, but
it is not a selected candidate or evidence of playing strength or high-dan
calibration. Evaluation-report, receipt, and publication-result outputs remain
zero, as do fresh-final holdout reads, formal A/B games, external calibration,
and live-weight writes. The next step is a quantization-alignment fine-tune that
directly reduces the seed 42 / 44 float-to-int16 gaps without relaxing any
preregistered gate, followed by a new candidate evaluation through the same
protocol.

Machine-readable record:
[floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json](./data/floodgate-strength-first-fresh-timeout-quarantine-v2-2026-07-20.json)
