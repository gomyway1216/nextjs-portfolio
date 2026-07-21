# Legacy retention data re-enrolled as operator-recovered

> On July 20, 2026, the missing legacy general- and opening-retention files were
> recovered into durable local storage. A fixed registry now records their path, byte size,
> raw newline count, and SHA-256. **This neither reconstructs an original manifest nor passes
> a playing-strength evaluation.** It removes only the data-availability blocker; connection
> to downstream gates remains closed for a separate reviewed change. Japanese version:
> [blog-shogi-floodgate-retention-recovery-enrollment.md](./blog-shogi-floodgate-retention-recovery-enrollment.md)

## What was recovered

| Intended role     | Durable path                                                                                | Bytes   | Raw rows | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------------------------------- | ------- | -------- | ------------------------------------------------------------------ |
| general retention | `$HOME/.codex/shogi-data/floodgate-q1-2026-retention-recovered-v1/holdout5m-4k.jsonl`       | 542,594 | 4,000    | `3d25f6bf113710c8ea326c132d2fc2cc9f76f572dddbd09c1d397b78cb07d00e` |
| opening retention | `$HOME/.codex/shogi-data/floodgate-q1-2026-retention-recovered-v1/opening-holdout-4k.jsonl` | 538,870 | 4,000    | `1f8d91f286eec160eb1141ba5adfd36b842af12ceec37aa4f959038a60969ce6` |

The durable directory is owner-only and both files are mode `0600`. The builder opens only
the fixed paths without following symlinks, checks that file identity is unchanged across
the read, and recomputes byte count, SHA-256, and raw newline count. It does not decode JSON,
access a label field, or print file contents. “4,000 raw rows” means only that a
newline-terminated file contains 4,000 newline bytes; it is not a claim that 4,000 positions
have been semantically validated.

This argumentless command emits a review candidate to stdout only. With the current durable
files, its bytes exactly match the checked-in registry:

```sh
python3 ml/build_retention_recovery_enrollment_registry_candidate.py
```

## What is known about the recovery sources

The public registry redacts the original private absolute paths and inode values. It retains
operator observations under source A / B labels only.

- Two general-file copies had distinct file identities and exactly the same bytes, raw row
  count, and SHA-256. This independent duplicate evidence lowers the chance that a single
  damaged copy was selected accidentally.
- Only one opening-file copy was observed. Its branch name and working-tree HEAD observation
  are recorded, but it has no independent duplicate.
- The registry builder does not authenticate these source observations. It re-authenticates
  only the two recovered durable files on every run.

The two matching general copies are useful evidence, but they do not replace an original
creation manifest or role receipt. The opening artifact has weaker provenance because only
one source copy was observed.

## What this does not claim

No original manifest, original receipt, preregistered hash, or Git object for either artifact
was found. The registry is therefore explicitly classified as `operator-recovered` and fixes
all of these boundaries:

| Nonclaim                                     | State   |
| -------------------------------------------- | ------- |
| original manifest / historical role auth     | false   |
| row-semantic validation                      | false   |
| authenticated freshness / non-use            | false   |
| connection to downstream retention gates     | false   |
| playing-strength gain / high-dan calibration | false   |
| formal A/B / external calibration            | 0 games |
| live-weight change                           | false   |

This change does not make the AI stronger by itself. Its concrete value is that both files
needed to start later retention evaluation are available again under durable exact
identities, removing the “data file is missing” blocker. A separate change must evaluate the
candidate and stable model with the same implementation, fail closed on row semantics and
role suitability, and only then connect exact identities to the downstream gate. This
registry cannot serve as a gate receipt or live authority.

## Validation

Focused stdlib tests cover canonical checked-in bytes, byte-for-byte builder reproduction
from the real durable files, deterministic rebuilding, rejection of mutation, missing files,
symlinks, authority expansion, and CLI path substitution. Test fixtures likewise use only
opaque bytes and newlines; they never parse or display shogi labels.

Machine-readable record:
[floodgate-retention-recovery-enrollment-2026-07-20.json](./data/floodgate-retention-recovery-enrollment-2026-07-20.json)
