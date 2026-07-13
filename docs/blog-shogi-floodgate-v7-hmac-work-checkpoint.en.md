# An HMAC work checkpoint that resumes the v7 teacher by parent

> The [v7 candidate union](./blog-shogi-floodgate-v7-candidate-union.en.md) joins proposal, strong-game played, and stable moves over the same legal-move set, while the [production stable runtime](./blog-shogi-floodgate-production-stable-wasm-runtime.en.md) can issue a direct result from fixed assets. A safe crash-resume boundary was still missing while previously unknown independent rescores are executed. This PR adds completed-parent evidence and a v7-specific append-only HMAC checkpoint. It remains a synthetic test core, not evidence of real Floodgate labels, training, holdout results, or playing strength. Japanese version: [blog-shogi-floodgate-v7-hmac-work-checkpoint.md](./blog-shogi-floodgate-v7-hmac-work-checkpoint.md)

---

## Current boundary

| Item                              | State                  | Meaning                                                                       |
| --------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| Candidate union                   | Completed earlier      | Checks proposal / played / stable legality and the canonical union            |
| Direct stable runtime result      | Completed earlier      | Returns a stable row and runtime binding from the same owning-runtime call    |
| Completed-parent semantic core    | Implemented in this PR | Cross-binds the union, direct stable result, and every rescore to one parent  |
| Per-parent HMAC checkpoint        | Implemented in this PR | Reuses only durable parents and asks the producer only for unfinished parents |
| Production coordinator / key      | Next stage             | Must directly own zero-argument runtimes and deployment key authority         |
| Real labels / training / strength | Not run; no evidence   | This PR proves no weight, A/B result, rank, or stable high-dan strength       |

## 1. Why the existing checkpoint is not overwritten

The existing stable-proposal checkpoint receives a completed artifact first, then stores every deterministic line with HMAC protection. That is correct for stable candidates, but the v7 teacher independently rescores an initially unknown number of candidates at depth 16 after each parent's proposal. Completing all 24,000 parents in memory before persistence would lose every search on an intermediate crash.

Reusing the existing schema or HKDF domain for an artifact with different semantics could also let verifiers confuse the two. The v1 format remains unchanged; the new stream has a v7-specific schema, HKDF info, and header / parent-entry / seal domains.

## 2. Why a dense parent entry was selected

The work stream has only three record kinds.

```text
header -> parent[0] -> parent[1] -> ... -> parent[n-1] -> seal
```

Each parent entry contains its candidate rescores in canonical candidate order. Treating one parent as the semantic transaction keeps resume state, duplicate rejection, canonical order, and the final seal smaller than an fsync for every candidate. A crash after search but before the parent append reruns that parent, while a durable parent is never rerun.

Serial search would leave 11 engines in the fixed 12-engine pool idle, so the writer runs a rolling window of at most 12 parents. Entries and fsyncs remain in strict input-index order even when completion order is reversed. One task failure stops new scheduling, drains every already-started task, and appends nothing at or after the failed index.

The guarantee boundary is therefore:

- engine search execution: at least once;
- parent entries durably accepted into the HMAC stream: exactly once; and
- a prefix before completion: resumable private work, not a successful artifact.

## 3. Run identity fixed by the header

The header HMAC covers at least:

- run ID / key ID / the v7-specific algorithm and claim boundary;
- parent / stage device, inode, and basename of the authorized private stage;
- the full authenticated-training binding;
- record count, parent-ID digest, and parent-row digest in strict parent-ID order;
- fixed teacher-plan identity;
- production stable-runtime receipt digest; and
- production teacher-USI-runtime receipt digest.

Resume authenticates the header and every existing parent entry before invoking the callback. Work from another key, run, stage, training input, or runtime receipt is not accepted even as a prefix.

## 4. Cross-binding completed-parent evidence

A non-forced parent synchronously captures the following into one immutable projection.

```text
authenticated training parent
  + rules-complete legal-set binding
  + stable runtime result { row, stable_runtime_binding }
  + teacher proposal runtime binding
  + canonical candidate union
  + every independent searchmoves rescore
```

Each rescore carries its candidate index / move / child identity, depth, cp or mate score, nodes, PV length, domain-separated PV digest, and full-result digest. The work file does not duplicate raw PV text, preventing the 24,000-parent stream from scaling without bound with the maximum USI line length. The full result is strictly checked during capture; after raw PV text is discarded, its digest remains a commitment inside the HMAC stream. Resume reverifies the compact projection's semantics but does not claim to reconstruct unstored raw engine output or engine truth.

A forced parent still requires the stable-runtime result, but its teacher proposal runtime binding is `null` and its candidate / rescore count is zero. The sole legal move, played move, and stable move must agree.

### Discovery: the two stable-row digests are not equal

The production stable runtime's `row_sha256` and the candidate-union receipt's `stable_row_sha256` use different domains for the same row. Similar names do not permit an equality check. The completed-parent core captures the row once, independently rederives each domain, and binds both the direct stable-runtime binding and the union binding to the same parent.

Likewise, the union's `runtime_binding` belongs to the YaneuraOu proposal side, not the stable side. The checkpoint stores `stable_runtime_binding` separately from the teacher proposal binding. The former remains present for a forced parent; only the latter is `null`.

### Discovery: normalize USI `-0` to canonical zero

The USI parser accepts signed decimal tokens, so protocol input can contain `cp -0`, `nodes -0`, or mate `-0`. Canonical JSON rejects negative zero. Proposal and rescore capture preserve every integer / score bound while normalizing only zero to `+0`; mate becomes distance zero plus an explicit sign. Regression tests fix digest equivalence for `-0` and `+0` while continuing to reject negative nodes and out-of-range CP.

## 5. Crash / resume state machine

| Failure point                            | Restart behavior                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------- |
| Before search                            | Ask the producer for that parent                                                  |
| After search, before append begins       | No entry exists, so rerun that parent                                             |
| During an incomplete tail append         | Keep the authenticated prefix and fail closed except for explicitly safe recovery |
| After a full line, with unknown fsync    | Reauthenticate the HMAC line and avoid a rerun when it is valid                   |
| After parent fsync, before the next call | Use the durable sequence as the cursor and ask only for the next parent           |
| After all parents, before the seal       | Append only the seal without rerunning a parent                                   |
| After the seal                           | Treat it as complete only after final reopen and exact verification               |

A producer result with the wrong parent, order, candidate, extra key, or rescore is rejected before append. The checkpoint never trusts the callback result as authenticated evidence; it reruns the synchronous semantic core internally.

One canonical line is bounded to 24,576 bytes, while the entire stream is bounded to 589,897,154 bytes for 24,000 parents plus a header and seal. The measured maximum-14-candidate fixture entry is 17,338 bytes, or 70.55% of the line cap. Conservatively repeating that maximum entry 24,000 times gives an arithmetic projection of 416,185,154 bytes, leaving 173,712,000 bytes below the cap. This is a capacity calculation from one synthetic fixture, not a 24,000-parent run or scanner load test.

The test-core resume verifier still allocates the entire stream into one bounded `Buffer` through `readWholeFile`. The 589,897,154-byte (562.57 MiB) ceiling is only a rejection bound, not an operational guarantee that scanning at that scale is safe. Before production labeling of 24,000 parents, this must become bounded incremental line parsing / HMAC and pass a load test. This PR makes no production-scale memory, throughput, or scanner-readiness claim.

## 6. HMAC does not establish engine truth

A writer holding the root key can correctly HMAC arbitrary content. This layer proves only that content recorded by the same key holder remains unmodified and bound to its run, stage, and input. Authentic engine bytes, a real runtime call, and a correct teacher label become claimable only when the next zero-argument coordinator takes its input directly from the owning runtime capability.

This test core treats the producer, every test hook, and the current JavaScript realm / intrinsics as trusted code. It synchronously reverifies the returned parent evidence as adversarial, but HMAC shows only that a non-key-holder has not changed persisted bytes under that trusted realm. It is not a sandbox against hostile same-process mutation of prototypes, crypto methods, filesystem methods, or key access. The exported claim string fixes this boundary explicitly.

The test core makes no production-origin claim, and plain completed evidence has no authentication claim. A partial prefix, an unkeyed SHA-256 digest, and a test key capable of resigning content are all non-evidence for playing strength.

## 7. Parallel allocation on the 14-core Mac

The machine has 14 CPU cores and 51,539,607,552 bytes of RAM. The stable-search pilot showed about 5.8% more throughput with 12 workers than with 10, so real labeling keeps a 12-worker engine pool. During implementation and audit, separate sub-agents handle the checkpoint, completed-parent semantic core, and adversarial tests, while focused Vitest uses up to four workers and TypeScript / lint / bilingual-document checks overlap where useful.

Continuously running 12 engine workers and four full-test workers on the same 14 cores would create contention and slow search. Validation work is parallelized, while real search reserves priority for the 12 engines. The objective is minimum completion time for 24,000 parents, not maximum instantaneous CPU utilization.

## 8. Validation and non-claims

Review follow-up found that `requiredInteger` admitted parser-valid `-0` and left negative zero in place until later canonical hashing. Capture now normalizes it to `+0`, with a regression that calls the same helper directly. The first CI run's only failure was an unchanged reusable-pool test; every new v7 test had passed. Its stack receiver was `Array.value`, not the parent, showing that a temporary `Object.prototype.then` installed across the Vitest realm had intercepted an unrelated Promise resolution. Rerunning the failed job at the same SHA passed, but the assertion was moved into the existing bundled child-process fixture to prevent recurrence. The isolated case passed 10/10 repetitions on Node v22.13.0. This changes test isolation, not the runtime or weight.

This PR uses only synthetic parents, results, and keys. It opens no real Floodgate training row, fresh selection, or fresh / legacy final holdout, and starts no production engine. The checkpoint API receives no selection / final-label path or reader. After review follow-up on Node v22.13.0, all 64 focused Vitest cases passed: 34 candidate-union, 12 completed-parent, and 18 checkpoint cases; the four files including the proposer passed 117/117 tests, and the full 111 files passed 1,904/1,904 tests. TypeScript, all 58 Python ML stdlib tests, the Next production build with 193/193 pages, scoped ESLint with `--max-warnings=0`, and Prettier passed. Repository-wide ESLint reported 0 errors and 157 existing warnings. These checks cover semantic capture, compact-evidence reverification, HMAC resume, wrong bindings, forced skips, key isolation, and crash boundaries.

This stage creates no teacher JSONL, weight, A/B result, Elo, rank, or 81Dojo rating. It makes zero claim that the evaluation function became stronger or reached stable high-dan strength. The next step is to close deployment key authority and the training-only projection, then run a 100–500-parent pilot through the zero-argument production coordinator. Failure rate, throughput, resume behavior, and score distributions must pass before scaling to 24,000 parents.
