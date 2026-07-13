# Wiring complete work and metadata prefixes into explicit finalization resume

> The [generate-and-checkpoint coordinator](./blog-shogi-floodgate-stable-proposal-coordinator.en.md) connects the synthetic consumer, stable proposer, checkpoint, postflight, and finalizer in one test-only lifecycle. Because that entry point always runs checkpoint first, however, it cannot resume a deterministic `result.json` / `manifest.json` prefix left after checkpoint. Checkpoint narrows a stage to empty or `work.jsonl` only, while the [finalizer](./blog-shogi-floodgate-stable-proposal-finalizer.en.md) can safely resume complete authenticated work and metadata prefixes under fresh authority. This PR keeps those boundaries separate and adds a `resume-finalization-only` coordinator that explicitly skips proposer and checkpoint. It is runtime composition for synthetic finalization resume, not a proposal-generation, production-engine, teacher-label, training, or playing-strength pipeline. It does not use or read real data, selection, or either fresh or legacy final holdout. Japanese version: [blog-shogi-floodgate-stable-proposal-finalization-resume.md](./blog-shogi-floodgate-stable-proposal-finalization-resume.md)

---

## Current boundary

| Item                            | Current status               | Meaning                                                                                                               |
| ------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Coordinator entry point         | Implemented for tests only   | Exposes explicit finalization resume separately from generate-path or automatic mode selection                        |
| Execution path                  | `resume-finalization-only`   | Enters consumer, fresh lease, postflight, and finalizer without calling proposer or checkpoint                        |
| Boundary selection              | Fixed                        | Callers cannot replace the consumer / authorization / finalizer functions themselves                                  |
| Required staged content         | Complete authenticated work  | Does not generate or partially repair `work.jsonl`; complete-work verification in the finalizer remains mandatory     |
| Metadata-prefix resume          | Delegated to finalizer       | Resumes only exact deterministic `result.json` / `manifest.json` prefixes under fresh authority                       |
| Runtime authority               | Fresh on every attempt       | Reacquires an exact input claim, fresh stage lease, and fresh postflight receipt for every retry                      |
| Success output                  | Implemented                  | Returns only resume-handoff facts and a deeply frozen finalization / publication receipt                              |
| Production / teacher / strength | Not implemented; no evidence | Establishes no production registry, engine authority, teacher label, training, Elo, rank, or stable high-dan strength |

The contract, status, and claim boundary are fixed as follows.

```text
shogi-floodgate-stable-proposal-finalization-resume-coordinator-v1
synthetic-consumer-postflight-authenticated-work-finalization-resume-publication-complete
test-only-synthetic-finalization-resume-composition-evidence-not-proposal-generation-engine-teacher-label-training-or-playing-strength-evidence
```

The success receipt also narrows its execution boundary and path.

```text
test-only-fixed-boundary-composition
resume-finalization-only
```

## 1. Discovery: checkpoint and finalizer accept different state sets

The checkpoint writer is the boundary that creates fresh or resumable `work.jsonl`. Its starting stage must be empty or contain only `work.jsonl`; `result.json` or `manifest.json` is rejected as an extra entry. That restriction prevents checkpoint from overwriting metadata accidentally.

The finalizer, by contrast, standalone-reauthenticates complete work and accepts these initial entry sets.

```text
{work.jsonl}
{result.json, work.jsonl}
{manifest.json, result.json, work.jsonl}
```

`result.json` and `manifest.json` may be complete files or zero-byte / partial exact prefixes of the expected bytes rederived by the current invocation. A manifest with an incomplete result, a prefix mismatch, oversize or unsafe metadata, and an extra entry such as `train.jsonl` or `val.jsonl` are not repaired automatically; they require manual content reconciliation.

The design therefore does not add a retry mode to the generate coordinator or branch on checkpoint error text. Two explicit entry points retain different input contracts, and the caller selects either `generate-and-checkpoint` or `resume-finalization-only`.

## 2. Resume does not skip authority or verification

This path skips only proposal generation and checkpoint persistence. Every retry still requires:

- a fresh consumer invocation;
- an exact input claim during synchronous callback invocation;
- a fresh stage-authorization lease;
- a fresh exact postflight receipt after callback settlement;
- standalone authentication of complete `work.jsonl`;
- cross-binding to the consumer input binding;
- deterministic result / manifest validation and durability; and
- exclusive publication plus destination-content audit.

The structural postflight projection persisted in `result.json` is not the previous exact object authority. A process crash does not restore a lease, input claim, or postflight receipt; the fresh invocation must rederive the same canonical projection.

## 3. Invocation capture and fixed boundaries

Before its first filesystem or consumer operation, the coordinator synchronously captures exact own data properties from options and dependencies. It rejects Proxies, accessors, symbol keys, unexpected fields, Proxy functions, and shared-backed byte views. The root key is copied instead of retaining the caller view, while the caller's buffer is not modified. The coordinator copy and temporary copy passed to finalizer are zeroized on success and failure.

The audit also found that after the lower authorizer rejected an unsafe stage basename, a wrapper could build a marker pathname from that unvalidated value and perform a read-only `lstat` outside the publication parent. Both the resume and existing generate coordinators now pin `publicationParent` as a canonical non-root absolute path and `stageBasename` as a strict direct-child basename during initial capture, rejecting traversal before any consumer, authorization, or marker read.

Dependencies do not accept high-level consumer, authorization, or finalizer functions. The coordinator calls only existing module-imported `CoreForTests` entry points and captures their internal synthetic verifier, failpoint, exclusive-rename, and fsync seams. Proposer-search and checkpoint dependencies do not exist on the resume API surface.

Its execution boundary is therefore `test-only-fixed-boundary-composition`, not a production entry point with fixed production dependencies.

## 4. Exact fresh-authority handoff order

A clean resume invocation follows this authority flow.

```text
enter test consumer postflight boundary
  -> callback receives exact AuthenticatedFloodgateTrainingRows
  -> synchronously claim that exact input before the first await
  -> authorize a fresh finalizer lease over the existing private stage
  -> callback settles without a value
consumer revalidates the input snapshot and closes raw / root descriptors
  -> fresh exact postflight receipt is minted
resume coordinator enters fixed finalizer
  -> consume fresh lease + exact postflight receipt
  -> verify complete work and consumer cross-binding
  -> resume result / manifest exact prefix
  -> private publication -> destination-content audit
```

The lease is acquired inside the consumer callback. Beginning authorization only after callback settlement and postflight minting would create a new gap between consumer success and stage authority. The postflight receipt itself remains unavailable until callback return, snapshot revalidation, and descriptor closure complete. The coordinator carries the fresh lease out of the callback and pairs it with the exact receipt only after minting.

The success handoff closes at least these facts as `true`.

```text
exact_input_claimed_synchronously
proposer_skipped
checkpoint_skipped
exact_postflight_minted
fresh_finalizer_lease_acquired
```

## 5. Stage-state matrix

| Starting state                                      | Handling by the explicit resume path                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------ |
| No stage / empty stage                              | Out of scope; return to generate-and-checkpoint without automatic fallback     |
| Zero-byte / partial / torn `work.jsonl`             | Out of scope; return to the checkpoint-writer recovery boundary                |
| Complete authenticated `{work}`                     | Reauthenticate work, then create result and manifest before publication        |
| `{work,result-prefix}`                              | Rederive expected result from fresh postflight and append only an exact prefix |
| `{work,result}`                                     | No-rewrite verify exact result bytes, then proceed to manifest                 |
| `{work,result,manifest-prefix}`                     | Require complete result, then append only an exact manifest prefix             |
| `{work,result,manifest}`                            | No-rewrite revalidate the exact three-file set, then publish                   |
| Manifest with missing / incomplete result           | Preserve bytes and require manual content reconciliation                       |
| Prefix mismatch / oversize / unsafe metadata        | Preserve bytes and require manual content reconciliation                       |
| Extra entry                                         | Do not delete automatically; require manual content reconciliation             |
| Wrong run / key / stage / consumer binding          | Fail closed during work verification or cross-binding                          |
| Stale authorization marker                          | Do not steal or delete; require manual lease reconciliation                    |
| Indeterminate state after publication commit starts | Do not retry blindly; require manual publication reconciliation                |
| Publication and lease both indeterminate            | Require manual publication and lease reconciliation                            |

The resume-only path does not inspect a state and switch into generation automatically. It neither wraps partial work in finalizer metadata nor deletes foreign content.

## 6. Conditions for rederiving a deterministic prefix under fresh authority

The stage identity bound by the work header and manifest consists of parent / stage device and inode, basenames, and the authorization contract / trust boundary. It does not include the retry-specific lease-directory inode. A fresh lease over the same private stage can therefore rederive the same expected result / manifest bytes when run, key, complete work, and the consumer structural projection also match.

Conversely, a change to the fresh consumer input binding, postflight projection, run, key, stage identity, or work bytes changes the expected metadata. A one-byte mismatch is not accepted as an approximately equivalent prior result. Prefix resume is exact deterministic byte continuation, not a semantic merge.

The finalizer contract does not rewrite a complete metadata file either. The resume-focused suite verifies append with the prefix-file inode and existing prefix bytes preserved plus preservation of published-work inode / bytes, but no dedicated case yet covers no-rewrite metadata that is already complete at invocation start. The success receipt does not infer or expose a starting-prefix claim from pathname observation alone.

## 7. The success receipt does not export authority

A successful receipt contains only this narrow data.

```text
contract, status, claim_boundary,
execution_boundary, execution_path,
run_id, key_id,
handoff,
finalization
```

`handoff` records exact input claim, proposer / checkpoint skip, postflight mint, fresh lease, and the finalizer contract. `finalization` is the existing finalizer's deeply frozen content / publication / postpublication receipt.

The coordinator returns no root key, lease, postflight object, file descriptor, raw bytes, rows, or transaction. The focused suite checks compactness, exact top-level and handoff keys, recursive deep freeze, and absence of forbidden authority keys.

## 8. Typed failures, cleanup, and retry dispositions

A failure in consumer, authorization, postflight, or finalizer never becomes coordinator success. Cleanup distinguishes these cases.

- If authorization fails before returning a lease, read-only reconcile the marker pathname.
- If a fresh lease remains before finalizer starts, attempt to close it.
- If a minted postflight receipt was not consumed by finalizer, single-use claim and discard it.
- Preserve content, lease, and publication facets from a typed finalizer error.
- Treat a Proxy or unknown failure after finalizer start conservatively as indeterminate for publication and lease.
- Keep primary failure separate from cleanup failures.

Retry dispositions distinguish at least a fresh resume invocation, upstream checkpoint recovery, manual content reconciliation, manual lease reconciliation, manual publication reconciliation, and combined manual publication plus lease reconciliation. Neither error text nor a directory name selects an automatic retry.

## 9. Synthetic test design and intermediate evidence

The focused suite uses synthetic consumer rows, key, search result, stage-engine placeholders, and temporary directories. To create complete authenticated work and prefix fixtures it reads tracked plan, WASM, embedded-WASM, existing-weight, and worker-source bytes as identity fixtures. Reading tracked asset bytes is not execution of a production engine process; the subject resume invocation calls neither proposer search nor checkpoint.

The resume-coordinator focused suite directly verifies:

- rejection of proposer / checkpoint fields, a hostile shared root-key view, and a traversal stage basename during capture before side effects;
- success from work-only state through one fresh lease, exact event order, and exact handoff;
- completion of result and manifest prefixes under a fresh consumer invocation;
- append while preserving the prefix-file inode and existing prefix bytes, preserve published-work inode / bytes, and audit the exact destination three-file set;
- preservation of a mismatched metadata prefix with a manual-content disposition;
- rejection of a wrong root key before metadata persistence without changing work bytes or the caller key;
- fresh-lease closure after postflight mutation and cleanup of the lease plus minted receipt after a pre-finalizer interruption;
- preservation of foreign `train.jsonl` with a manual-content disposition;
- preservation rather than theft of a stale authorization marker with a manual-lease disposition;
- conservative mapping of a post-rename interruption to manual publication plus lease reconciliation; and
- exact success-receipt keys, compactness, recursive deep freeze, and absence of forbidden authority keys.

Existing related-boundary suites provide separate evidence. The finalizer suite covers a different authenticated consumer binding, exact result / manifest prefixes, invalid initial entry sets, persistence failure, lease / content / publication reconciliation, and hostile failure. The consumer-postflight suite covers post-callback mutation and descriptor lifecycle; the generate-coordinator suite covers lease / receipt cleanup after an interruption following postflight but before finalizer; and the checkpoint / verifier suites cover partial-work recovery and complete-work authentication.

The current resume-focused suite does not directly cover no-rewrite resume from initially complete result / manifest or forged / Proxy failure facets escaping after finalizer start. Tests of related primitives are not counted as resume-coordinator-specific coverage; add focused cases if a wrapper-level claim is required.

Prefix fixtures are created through the generate coordinator and existing finalizer failpoints to model a synthetic crash, followed by resume with a fresh consumer invocation. Fixture setup remains separate from the subject invocation, and capture verifies that the resume API accepts no proposer / checkpoint surface.

## 10. Synthetic evidence and explicit non-claims

The source, contract, and bilingual claim boundary were audited, followed by final focused / related / full regression, Python stdlib, typecheck, lint, formatting, and build runs. These measured results are evidence only for synthetic resume composition.

| Validation                                     | Current result                                        |
| ---------------------------------------------- | ----------------------------------------------------- |
| Source / contract / bilingual claim audit      | No unresolved blocker / high / medium finding         |
| Focused finalization-resume module-pin suite   | 11 / 11 PASS                                          |
| Resume + related boundary suites               | 8 files, 257 / 257 PASS                               |
| Full Vitest / Python stdlib audit              | 105 files, 1758 / 1758 PASS; stdlib 58 / 58 PASS      |
| TypeScript / scoped and full ESLint / Prettier | PASS; full ESLint has 0 errors, 157 existing warnings |
| Production build                               | PASS                                                  |

| What resume-coordinator success establishes                                         | What it does not establish                                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Fresh exact input claim, postflight, and lease were wired into one resume lifecycle | Restoration of pre-crash object authority or exactly-once behavior across processes         |
| Complete work and the fresh consumer binding were reverified                        | Generation by a particular engine binary / evaluation asset                                 |
| A deterministic metadata prefix resumed as exact bytes                              | That the stable proposal is a teacher score, centipawn truth, or correct label              |
| Destination content was reverified after private publication                        | A production coordinator, deployment readiness, or sandbox against hostile same-EUID code   |
| Proposer and checkpoint were explicitly skipped                                     | A real dataset, training, weight update, QAT / int16, accuracy, Elo, rank, or high-dan play |

HMAC authenticates a canonical binding made by a key holder; it does not establish engine identity, source truth, non-repudiation, key secrecy, or anti-rollback. Prefix resume has no external monotonic counter and does not claim to detect rollback to an older valid state.

Tests read no real Floodgate training row, selection label, fresh final holdout, or legacy final holdout. They run no production YaneuraOu depth-16 v7 search, training, A/B match, or 81Dojo calibration; they change no model-weight byte and do not overwrite the existing evaluation function. Test counts and elapsed time are neither playing-strength nor production-throughput evidence.

## 11. Next: the production teacher, followed by training and strength evaluation

Closing explicit resume establishes only a test-only composition that can continue synthetic proposal publication from a crash prefix. The project still needs an entry point using production registries and fixed dependencies only, pinned YaneuraOu binary / evaluation authority, a MultiPV 12 + strong-game played move + stable-move candidate union, depth-16 independent rescore of every unique candidate, and a teacher-label / result schema.

After that come real training-only parents, fresh retraining with seeds 42 / 43 / 44, QAT / production-int16 export, frozen selection, sealed final holdout, production parity, known regressions, a fixed 384-color-swapped-pair / 768-game A/B, and separately authorized 81Dojo calibration.

“Complete” here means only that a test-only `resume-finalization-only` invocation closed a deterministic prefix under fresh authority and reached private publication plus destination audit. Neither the production teacher nor a stronger evaluation function is complete, and there is still no evidence of stable high-dan strength.
