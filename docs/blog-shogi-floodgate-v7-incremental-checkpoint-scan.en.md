# An incremental scanner that reverifies the v7 checkpoint with constant memory

> The [v7 HMAC work checkpoint](./blog-shogi-floodgate-v7-hmac-work-checkpoint.en.md) persists completed parents in strict input order and reruns only unfinished parents after a crash. Its resume and final-verification scanner still read the entire work file into memory first. This change authenticates one line at a time with a 64 KiB read chunk and a 24,576-byte line buffer, separating incremental working memory from file size without changing the HMAC chain, ordering, or torn-tail recovery. Implementation, local full validation, and independent review are complete, but the semantically valid 24,000-parent load test and PR CI are not. This article does not yet claim production readiness or stronger play. Japanese version: [blog-shogi-floodgate-v7-incremental-checkpoint-scan.md](./blog-shogi-floodgate-v7-incremental-checkpoint-scan.md)

---

## Current boundary

| Item                         | State                 | Meaning                                                                                          |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------ |
| Per-parent HMAC checkpoint   | Completed earlier     | Reuses only durable parents and authenticates an ordered stream from header through seal         |
| Whole-file scanner           | Removed from the code | Uses no `readWholeFile`, all-slice array, or retained set of every decoded line                  |
| Bounded incremental scanner  | Locally validated     | Fixes a 64 KiB chunk and a 24,576-byte line buffer, then immediately verifies each complete line |
| 24,000-parent load test      | Not run               | Must measure peak RSS, time, short reads, resume, and sealed-final scanning                      |
| Labels / training / strength | Not run; no evidence  | This change proves no weight, A/B result, Elo, rank, or stable high-dan strength                 |

## 1. Why a whole-file bound alone is insufficient

The work-stream ceiling is 589,897,154 bytes (562.57 MiB). That ceiling is necessary to reject an abnormally large file early, but it does not mean that every file below it can be scanned safely. The previous `readWholeFile`-style verification allocated at least one `Buffer` for the complete file and could add decoded strings and line-management allocations. The 562.57 MiB figure was a rejection boundary, not a measurement of acceptable peak RSS, garbage-collection pressure, or throughput.

Labeling 24,000 parents may resume repeatedly after intermediate crashes. A design that needs working memory proportional to file size on every resume competes with the search engines for memory and can make completion time unstable under OS memory pressure. The fix is not to remove the total-byte cap. It is to preserve that cap while making scanner-specific incremental memory independent of file size.

## 2. The 64 KiB chunk and 24,576-byte line design

The incremental scanner uses positional reads from an open file descriptor and assembles lines with only two fixed buffers.

```text
read buffer: 65,536 bytes (64 KiB)
line buffer: 24,576 bytes

chunk -> find LF -> copy only the needed segment into the line buffer
      -> parse / check canonical form / authenticate one complete line
      -> discard line state and continue
```

If LF crosses a chunk boundary, only the unfinished fragment remains in the line buffer. The scanner rejects a line as soon as it would exceed 24,576 bytes and allocates no oversized-line storage. It continues correctly after a short read, while a zero-byte read before the captured file size is reached fails closed as a concurrent change. Complete records remain bounded by `parents + header + seal`, and total bytes remain bounded by 589,897,154.

The file SHA-256 is also updated chunk by chunk; no array of every record or decoded line is retained. JSON parsing and semantic verification of one record still allocate within the line bound, so the precise claim is that scanner-specific buffer overhead is `O(chunk + line)`, or `O(1)` in file size, not that the entire process uses mathematically constant memory. Existing authenticated-training input and the Node runtime itself are outside this boundary.

## 3. Preserve HMAC, ordering, and torn-tail behavior

Changing I/O must not change the authentication state machine. The scanner retains only the complete-record count, completed-parent count, previous MAC, sealed state, and byte offset of the last authenticated record.

```text
header
  -> parent[0]
  -> parent[1]
  -> ...
  -> parent[n-1]
  -> seal
```

State advances only after a complete line passes raw-byte canonicality, strict-key, expected-parent, previous-MAC, and current-entry-MAC checks. A missing, duplicated, or reordered parent, an entry beyond the training input, an early seal, or a complete line after the seal is rejected. The whole-file SHA-256 is for the receipt; it does not replace the HMAC chain or semantic verification.

There are still two scan policies.

- `resumable-prefix`: only an incomplete final fragment before the seal may return the last authenticated offset for truncation and resume under the existing durability procedure.
- `sealed-final`: rejects a torn tail, missing seal, missing parent, and every byte beyond the authenticated sealed stream.

A fragment after a valid seal is not resumable. The scanner does not widen torn-tail recovery and preserves the existing boundary: durable parent acceptance is exactly once, while engine execution is at least once.

## 4. Discovery: TextDecoder can hide a BOM

UTF-8 decoding exposed a canonical-byte verification trap. Default `TextDecoder` BOM processing can remove leading UTF-8 BOM bytes from the decoded text. Parsing that result and comparing only strings with canonical JSON could accept a line whose raw file contains extra bytes.

The scanner makes invalid UTF-8 fatal and configures decoding not to discard a BOM implicitly. The decoder option is not the security boundary, however. After parsing, it re-encodes canonical JSON as UTF-8 and exactly compares both length and content with the original raw line bytes. A future decoder behavior change therefore cannot admit a BOM, alternative representation, extra whitespace, or any other byte sequence that differs from canonical serialization.

The boundary is not that two values look like the same Unicode text. It is that the file contains exactly the canonical bytes expected for a record in the HMAC chain. Adversarial tests reject a BOM at the header and parent-entry start, invalid UTF-8, CRLF, and disagreement with canonical re-encoding.

## 5. Recheck the final pathname and inode

Holding an open file descriptor throughout scanning keeps that inode stable even if another file replaces the pathname. It does not prove that the `work.jsonl` pathname named in the success receipt still points to the held inode. Checking only the held file could miss a pathname swap.

At scan start, the scanner therefore snapshots the held file's `dev`, `ino`, type, mode, owner, link count, size, `mtime`, and `ctime`, then requires the same descriptor to match the full snapshot after scanning. After the final sealed scan, it uses `lstat` on the stage pathname to recheck the authorized stage identity and verifies that the entry set contains only `work.jsonl`. It then separately uses `lstat` on the `work.jsonl` pathname and requires that snapshot to match the held work file, followed by one more check that the held descriptor still matches the same snapshot. Open and reopen operations do not follow symlinks.

This reinspection strengthens the observed path-to-inode binding; it is not a sandbox against a hostile root user or trusted code in the same process. The HMAC threat model also remains unchanged: it detects persisted-byte tampering by a party that does not hold the key.

## 6. The 24,000-parent load-test plan

Before production labeling, synthetic fixtures that do not use holdout data will measure 100, 1,000, and 24,000 parents on the same Node runtime. Passing a 24,000 count alone is insufficient; the run records the following evidence.

| Measurement or check | Recorded evidence                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stream size          | Parent count, record count, file bytes, maximum line bytes, and file SHA-256                                                                       |
| Memory               | RSS before scan, peak RSS, RSS after scan, delta, and scaling trend as parent count grows                                                          |
| Time                 | Wall time for resumable-prefix and sealed-final scans                                                                                              |
| Read behavior        | Maximum read at or below 65,536 bytes, short reads including one byte, and LF split across a chunk boundary                                        |
| Recovery             | Header-only, intermediate-parent, pre-seal resume, and the permitted torn tail                                                                     |
| Fail closed          | Oversized line / file, BOM, invalid UTF-8, wrong HMAC, order violation, post-seal fragment, mutation during scan, and pathname / inode replacement |

The 24,000 fixture uses only a test key and synthetic parents; it opens no fresh selection or fresh / legacy final holdout. The 589,897,154-byte cap is a conservative theoretical bound in which all 24,002 lines are 24,576 bytes, so a sparse exact-cap / cap-plus-one allocation-boundary test remains separate from a semantically valid 24,000-parent stream built with the observed maximum-14-candidate entry. The latter measures actual bytes, SHA-256, RSS, wall time, and the read bound. We do not claim to have completed the full theoretical cap as a valid stream, and neither result establishes real teacher-label correctness or playing strength.

Success is not merely process completion. Scanner-specific memory must not grow linearly with file size, every record and digest must match, resume and final policies must return consistent decisions for the same bytes, and adversarial cases must fail closed before connection to the production coordinator.

## 7. Holdout and claim boundary

The scanner reads only `work.jsonl` inside the private stage plus the authenticated-training binding already captured by its invocation. No selection / final-label path, reader, or key is passed to the API. Load fixtures also use synthetic training parents, so implementing, testing, and tuning the scanner requires no access to fresh selection, fresh final, or legacy final data.

This change does not alter label policy, candidate scores, training rows, the optimizer, or a weight. It deploys no new weight to the live environment and runs no match A/B. The evidence produced at this stage is limited to bounded scanning, canonical bytes, HMAC ordering, crash / resume behavior, and file identity.

It therefore supports no inference about teacher-JSONL quality, weight improvement, A/B win rate, Elo, 81Dojo rating, or rank. It makes zero claim that the evaluation function became stronger or reached stable high-dan strength.

## 8. Validation record

The following are confirmed on Node v22.13.0 from the same working-tree content. Intermediate runs, results from another SHA, and estimates are not mixed into pass counts.

| Target                                      | Confirmed result                                                                |
| ------------------------------------------- | ------------------------------------------------------------------------------- |
| Focused incremental-scanner tests           | Checkpoint 24/24                                                                |
| Related checkpoint / completed-parent tests | Candidate union + completed parent + checkpoint 70/70                           |
| Full Vitest                                 | 111 files / 1,910 tests                                                         |
| TypeScript / scoped ESLint / Prettier       | Pass / 0 warnings / Prettier 3.9.5 pass                                         |
| Python ML stdlib / Next production build    | 58/58 / 193/193 pages                                                           |
| Repository-wide ESLint                      | 0 errors / 157 existing warnings                                                |
| Byte ceiling / 24,000-parent load test      | Sparse exact cap enters bounded read and cap+1 makes 0 reads; valid 24k not run |
| Independent review / CI                     | GO with no P0–P2 finding / PR CI not run                                        |

## 9. Next: producer timeout and cancellation

Even after bounded scanning is closed, a producer Promise that never settles can stop both failure draining and checkpoint completion for the rolling window. The next boundary is a per-parent deadline, cancellation / termination of the engine process, shutdown ordering that preserves already durable parents, and a deterministic rule that appends nothing at or after the timed-out parent.

A plain `Promise.race` timeout could leave the underlying engine running or allow a late result to enter another run. The owning coordinator must control engine lifetime directly, stop search on timeout, collect every started task, and leave the stage as a resumable prefix. Deployment key authority, the training-only projection, and a 100–500-parent pilot follow; real labeling of 24,000 parents begins only after those boundaries have evidence.
