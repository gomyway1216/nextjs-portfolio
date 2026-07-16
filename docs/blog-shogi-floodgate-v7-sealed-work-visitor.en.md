# Observing validated entries without granting output authority — Floodgate v7 sealed-work visitor

> The V3 checkpoint scanner already authenticates the private `work.jsonl` stream, but its validated completed-parent values previously remained inside the scanner. This change adds a non-production, synchronous internal visitor seam to the existing sealed-final scan. The visitor observes an entry only after that entry has passed every existing structural, binding, canonical-byte, and HMAC-chain check. It is not a capability, does not make the enclosing scan successful, and grants no authority to write or publish output. No production-executable reader, production command, dataset, weight, live evaluator, or strength evidence changes in this boundary. Japanese version: [blog-shogi-floodgate-v7-sealed-work-visitor.md](./blog-shogi-floodgate-v7-sealed-work-visitor.md)

---

## 1. The projection still needs an authenticated source

The preceding training-label projection converts one structurally verified completed parent into deterministic `shogi-sibling-v1` rows. By design, that pure function does not open `work.jsonl`, hold a checkpoint descriptor, verify the V3 HMAC chain, or prove final-24000 origin.

The V3 scanner already performs those checks while it owns the held file descriptor and the checkpoint key. Re-parsing a caller-supplied clone after that scan would discard the strongest available origin boundary. The narrow gap is therefore an internal observation seam inside the scanner, not a new public reader.

## 2. This seam is deliberately non-authorizing

The visitor is the optional test dependency `verifiedParentVisitorForTests` inside the existing V3 scan. It receives a scanner-controlled completed-parent event and returns within the same call stack. It does not receive a stage lease, deployment key, publication transaction, consumer postflight capability, output descriptor, or signing operation.

```text
held V3 work descriptor
          |
          v
existing exact line + chain validation
          |
          +----> internal synchronous observation
          |
          v
remaining milestones, seal, tail, snapshot, and gate checks
```

An observed event is evidence only that one entry passed validation up to that point. It is not evidence that the file is a complete sealed-final stream.

## 3. Exact final-24000 means 24,004 complete records

The sealed V3 stream has one exact record layout:

| Record kind              |      Count | Required position                            |
| ------------------------ | ---------: | -------------------------------------------- |
| Header                   |          1 | First complete record                        |
| Completed parent         |     24,000 | Sequence and input index `0..23,999`         |
| Durable-prefix milestone |          2 | Exactly after parents 100 and 500            |
| Seal                     |          1 | After all 24,000 parents and both milestones |
| **Total**                | **24,004** | No complete or partial bytes after the seal  |

The scanner's complete-record bound remains `24_000 + 4`. The visitor does not change the count, insert a record, skip a milestone, or relax the exact final gate assertion.

## 4. Existing held-file and byte bounds remain authoritative

The seam runs inside the current held-descriptor scanner. Before, during, and after the read, the scanner continues to enforce the existing private regular-file metadata, expected device/inode identity, and unchanged filesystem snapshot. Reads remain incremental in bounded chunks; every JSON line is limited to 24 KiB before the newline, and the full V3 file remains bounded by `FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES`.

Each line must be non-empty, fatal UTF-8, a plain canonical JSON object, and byte-for-byte equal to its expected canonical encoding. A zero-progress read, oversized line, too many records, mutation during the read, unauthenticated tail, or fragment after a valid seal still fails closed. The visitor event carries no read buffer or capability to change those limits. As with the existing checkpoint, however, test hooks and the current JavaScript realm are trusted; this is not a security boundary against a hostile same-process callback or previously modified intrinsic.

## 5. An event appears only after the completed entry is exact

For a completed-parent record, the scanner first completes all existing checks:

1. exact schema and key set;
2. canonical `sequence` and `input_index` in stream order;
3. exact parent ID and exact parent object for that input;
4. exact `previous_mac` chain link;
5. valid entry HMAC under the V3 domain;
6. structural reverification of the completed-parent evidence;
7. exact completed-evidence digest; and
8. byte-for-byte equality with the canonical expected authenticated line.

Only after those checks succeed may the visitor receive the validated entry event. Its exact contract is `shogi-floodgate-v7-teacher-verified-parent-entry-event-v1`; the readonly event contains the fixed contract, provisional status and claim boundary, plus `input_index`, exact parent, verified completed evidence, completed-evidence SHA-256, and entry MAC. A malformed parent, forged digest, wrong sequence, broken chain, noncanonical byte representation, or structurally inconsistent completed evidence produces no event for that entry.

## 6. The callback contract is synchronous, `void`, and non-Proxy

The optional visitor must be a direct non-Proxy function. Its result must be synchronous and exactly `undefined`. Returning a value, Promise, thenable, or other asynchronous handoff is rejected. A visitor throw aborts the enclosing scan.

This restriction prevents an await or Promise-species boundary from extending ownership beyond the scanner's held descriptor and mutable scan state. It also makes event order identical to authenticated entry order and prevents concurrent observation from racing later line, seal, or snapshot validation.

## 7. A visitor can run before the seal, so every event is provisional

Streaming necessarily reaches completed-parent entries before it reaches the final seal. The visitor can therefore observe valid entries and the enclosing scan can still fail later because a milestone is absent, the seal MAC is wrong, a tail follows the seal, the file snapshot changes, or the exact final gate count is not 24,004.

For that reason, visitor invocation alone must never authorize durable output, a manifest, publication, training, or a strength claim. Any consumer must keep its work provisional until the entire enclosing `sealed-final` scan returns successfully and its final snapshot and gate contract are accepted.

## 8. Prefix-100 and prefix-500 scans do not invoke the visitor

The new seam belongs only to sealed-final observation. Durable-prefix-100 and durable-prefix-500 retain their current checkpoint and resume behavior with no visitor invocation. Their exact final shapes remain 102 records and 503 records respectively, both unsealed.

This separation prevents partial gates from being mistaken for a label source and avoids projecting the same early parents once at a prefix and again at final-24000. Prefix execution, milestone durability, torn-tail resume, producer scheduling, and gate receipts are unchanged by this boundary.

## 9. No ownership, production reader or command, or output surface is added

The visitor is not exported as a production-executable reader and adds no argument to any zero-argument production CLI. The change does add contract constants, types, a test dependency, and a test-only helper that exercises the existing callback contract in O(1), but that helper neither authenticates nor mints an event. It does not mint or claim the outer-lock capability, stage lease, training-input claim, consumer postflight receipt, checkpoint-key authorization, finalizer key, or publication transaction.

It also performs no output operation: no `train.jsonl`, `result.json`, `manifest.json`, temporary file, truncate, append, sync, rename, destination reopen, or live-weight update. The current production runner and its nonclaims do not become label-finalizer evidence merely because an internal observer exists.

## 10. Threat and failure matrix

| Threat or condition                                | Handling in this boundary                                                     | Still outside this boundary              |
| -------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| Forged or noncanonical completed entry             | Existing exact structural, digest, byte, and HMAC checks run before the event | Production finalizer authority           |
| Wrong order or replayed parent                     | Exact sequence, input index, parent, and previous-MAC checks fail             | Crash-safe output resume                 |
| Valid early entries followed by an invalid seal    | Early events remain provisional; enclosing scan fails                         | Output rollback or publication           |
| Visitor returns a Promise or other value           | Reject as a non-`void` synchronous callback                                   | Asynchronous worker orchestration        |
| Proxy callback or callback throw                   | Reject the Proxy; a throw aborts the scan                                     | Caller recovery policy                   |
| Hostile same-process hook or realm mutation        | Trust the test hook and current JavaScript realm                              | Hostile callback or intrinsic resistance |
| Prefix gate supplied with an observer              | No prefix visitor path                                                        | Label generation from partial work       |
| Separate process or cloned object attempts handoff | No durable or public capability exists                                        | Fresh same-lock ownership bridge         |

## 11. Validation is pending and no result is claimed yet

The implementation candidate must be validated before this article records any pass count or timing. The evidence fields remain intentionally pending:

The focused-test design itself is fixed. Its synthetic corpus contains 23,999 legal forced parents and one non-forced parent and reads no real Floodgate game. During the test-only fixture build, it suppresses only the 23,501 per-line regular-file syncs for the 23,500 parents appended after prefix 500 plus the seal. It then restores native `FileHandle.sync` exactly, batch-syncs the work file and stage directory once each, and runs one visitor-enabled final scan. This optimized run therefore does not re-establish per-entry fsync durability; that remains the responsibility of the existing checkpoint and scan-load evidence. Exact-undefined violations are exercised in O(1) by passing a real event retained from that full scan through the same callback-enforcement helper. A failpoint after the successful full scan also confirms that an event alone is not terminal operation success.

| Validation item                              | Status      |
| -------------------------------------------- | ----------- |
| Focused sealed-work visitor unit tests       | **PENDING** |
| V3 checkpoint and scan-load regression tests | **PENDING** |
| TypeScript typecheck                         | **PENDING** |
| Scoped lint and formatting checks            | **PENDING** |
| Full unit suite and production build         | **PENDING** |
| GitHub CI and review                         | **PENDING** |

No test count, duration, memory figure, commit revision, or CI result is asserted here before it is actually observed and recorded.

## 12. Next is a two-pass authenticated finalizer

The intended finalizer must not turn a provisional visitor event into output authority. The safe composition is two-pass:

```text
first:  retain the common outer lock and acquire a fresh active stage lease
        plus an opaque V3 checkpoint-scan key capability

pass 1: held-FD sealed scan without visitor under retained authority
        -> prove exact 24,004-record sealed stream and pin its snapshot

pass 2: re-scan the same held identity/snapshot with the synchronous visitor
        -> project deterministic training rows provisionally
        -> require the enclosing sealed scan to succeed again

then:   claim the current consumer postflight and acquire a
        domain-separated output-finalizer key authority
        -> continue retaining the fresh active stage lease
        -> crash-safe train/result/manifest finalization
        -> publication and destination revalidation

finish: zeroize keys after the last required work reverification, then
        terminally close the stage lease while retaining the outer lock
```

The later boundary must first acquire a fresh active stage lease and checkpoint-scan key under the common outer lock and bind both passes to the same work identity and bytes. It must not release the stage lease after pass 2: the lease remains active across the current consumer-postflight claim, acquisition of the separately domain-separated output-finalizer key, no-overwrite partial-output finalization, publication, and destination revalidation. The checkpoint-scan key remains available through the last required work reverification; all key zeroization and terminal stage-lease close also occur while the outer lock is retained. Until that boundary is implemented and validated, this visitor establishes no teacher dataset, optimizer run, candidate weight, live activation, match result, Elo, rank, or stable high-dan strength.
