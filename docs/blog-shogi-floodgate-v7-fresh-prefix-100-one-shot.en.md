# Fixing the safety conditions for a fresh prefix-100 one-shot — Floodgate v7

> The [production outer-gate lease recovery](./blog-shogi-floodgate-v7-production-lease-recovery.en.md) serialized all three gates through one common OS lock and added authenticated evidence preservation on abnormal termination. As the next minimum step, this change fixes a fresh zero-work preflight that does not modify the production namespace or file contents and a fully disposable process-death kill drill. It does not claim that reads leave atime unchanged. **This change does not execute production prefix-100, and its public preflight receipt is not gate authority.** Real registry provisioning, production gates, teacher labels, training, weights, live activation, matches, and strength measurements all remain zero. Japanese version: [blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.md](./blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.md)

## 1. Result and scope of this change

The change fixes two independent observation boundaries required before the next production write.

| Boundary                   | Scope                                                                          | Production effect                                                                      |
| -------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Fresh prefix-100 preflight | Fixed private namespace, registry, key binding, readiness, and zero-work state | No namespace/file-content mutation; even a success receipt does not authorize the gate |
| Disposable kill drill      | Outer, inner-stage, and checkpoint failpoints under a temporary home           | Does not read the production namespace or invoke a real gate                           |

This scope covers source, unit/adversarial tests, fixed CLIs, package scripts, Darwin CI, bilingual articles, and machine-readable evidence. Only the read-only production audits described below ran from the feature checkout. Write, gate, teacher, training, weight, and live actions remain separate fresh decisions after merge.

## 2. Why the fresh one-shot needs both proofs

Prefix-100 is the smallest milestone, but after it starts, the possibility of a durable checkpoint makes a blind rerun unsafe. A prior unit-test pass or historical private snapshot does not prove the current lock, runs root, stage lease, checkpoint, or registry binding.

The required evidence is a preflight that observes the current zero-work production state read-only and a kill drill that confirms, in a disposable namespace, that process death preserves evidence and blocks a successor instead of deleting state and trying again. Read-only audits, disposable tests, and production writes or gates are accounted for as separate action classes.

## 3. Fresh zero-work read-only preflight

The preflight contract is `shogi-floodgate-v7-production-prefix-100-read-only-preflight-v1`; its success status is `fresh-zero-work-prefix-100-read-only-preconditions-observed`. Its public owner is zero-argument and accepts no caller path, key, registry, run ID, override, or prior receipt.

Observation happens while the common outer lock is held. The private root and target directories are observed twice through held descriptors; a change to identity or the exact entry set produces NO-GO. Even success is limited to this decision:

The opaque capability issued by the outer owner is bound in module-private state to the exact effective UID, canonical home, and the locked registry's byte count, digest, device, and inode. The inner preflight single-use claims that capability, checks that its own derived UID and home match the anchor, and only then opens the registry through a held read-only descriptor. It revalidates that descriptor's identity, bytes, and digest at both the start and end of the inner operation. This closes the path that could lock home/registry A and inspect home/registry B. No private anchor value is returned in the receipt.

Approved binding is also closed in two stages. The first approved claim A, already matched to the registry, is retained as a private expected binding. The expected-binding verifier reloads and claims the approved record and freshly inspects the current key. It returns an identifier-free receipt only when expected A exactly matches the reloaded approved record and that reloaded record exactly matches the current key. This does not change the approved record or registry's create-only/no-clobber properties.

The runs, stage, outer-control, registry, and approved/current-binding observations are fail-closed and revalidated under the common lock and held descriptors. They are not claimed to be one atomic filesystem transaction across multiple namespaces. This boundary trusts the code loaded in the current process and the same EUID; it does not establish broker isolation against an arbitrary same-EUID process or hostile require-cache replacement.

```text
result = GO
scope = read-only-core-preconditions-only
gate_invocation_authorized = false
```

Thus `GO` means every required check and terminal revalidation passed during one outer-lock-held observation. It does not claim one simultaneous atomic snapshot across multiple namespaces, and it does not mean a caller may later present the receipt to execute the gate.

## 4. GO / NO-GO matrix

Every candidate condition for production prefix-100 is joined by AND.

| Condition                                                            | If false or unknown |
| -------------------------------------------------------------------- | ------------------- |
| Reviewed and merged HEAD; exact Node v22.13.0                        | NO-GO               |
| Exact approved-enrollment, registry, and current-key binding         | NO-GO               |
| Production readiness                                                 | NO-GO               |
| Common outer lock can be acquired                                    | NO-GO               |
| Fixed runs root is current-EUID-owned, private, and exactly empty    | NO-GO               |
| Stage, destination, inner lease, work, and checkpoint are all absent | NO-GO               |
| Outer active, quarantine, pending, and unknown counts are all zero   | NO-GO               |
| Two held-descriptor snapshots match exactly                          | NO-GO               |
| All six disposable process-death cases pass                          | NO-GO               |
| Monitor and STOP owner are recorded                                  | NO-GO               |

After commit `afcf7b4`, the exact-Node-v22.13.0 zero-argument production preflight CLI ran exactly once from the feature checkout. Its sanitized result was exit 1 and `NO-GO` at phase `outer-gate-lock` because the fixed `registry.json` was absent. It read current-user production ancestor and path metadata but no registry bytes. Before and after the command, the fixed registry root, final, staging, and runs paths were all absent; there was no persistent mutation, gate invocation, or success receipt.

A separate approved-current-binding read-only CLI passed once with identifier-free output. The deployment-key-instance read-only inspector also passed once, but its result is candidate-only. Exact Node, binding, and the teacher/input assets described below were observed as passing, but PR #471 is not merged, the fixed registry is absent, the same-lock one-shot owner is not present, and the remaining under-lock zero-work conditions were not reached. The reviewed kill-drill command remains at zero, so the overall decision is `NO-GO`.

## 5. The TOCTOU boundary that must remain under one outer lock

If a public preflight receipt is saved and the outer lock released before the existing prefix-100 command starts in another process, the namespace can change in between. A public receipt must therefore never be converted into a capability.

The later real production one-shot boundary must first complete the disposable drill, then acquire the common outer lock exactly once, rerun the under-lock preflight, and invoke the fixed prefix-100 connector exactly once under the same ownership. This change neither modifies nor invokes the existing production prefix-100 entry.

## 6. Disposable process-death kill drill

The kill-drill contract is `shogi-floodgate-v7-production-prefix-100-disposable-kill-drill-v1`. It covers six cases: SIGTERM and SIGKILL at each of three process-death injection points. The first two points are durable; the third is a visible 1-byte write observed before fsync.

| Failpoint                       | Evidence observed                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `outer-active-durable`          | Lock contention before death, OS-lock release after death, and authenticated outer stale state blocking every gate |
| `stage-lease-durable`           | Inner-lease EEXIST blocks restart while preserving bytes and identity                                              |
| `checkpoint-first-byte-written` | A 1-byte write visible after write but before fsync is preserved without delete, truncate, or repair               |

The fixed production drill does not select its root from `TMPDIR` or another environment value. It create-only installs a current-EUID-owned exact-`0700` private anchor below `/private/tmp`, checks its canonical realpath plus owner, mode, and identity through named `lstat`, and revalidates the same named identity before cleanup. It does not claim to hold an anchor-directory descriptor for the full lifetime. It rejects aliases and ancestor/descendant overlap with the production home in both directions. The fixture is confined to that private anchor and uses no production home, production registry, or real gate.

Each case's parent-side fixture cleanup runs only after every verification for that case succeeds. The fixed private anchor itself is removed only after the complete six-case success receipt is built. A signal, timeout, receipt/snapshot mismatch, or child-path mismatch preserves the fixture and returns a pathless typed failure requiring manual reconciliation. A later automatic run does not clean that evidence. If setup fails partway through, rollback removes only objects for which exact cleanup authority is still held; uncertain identity or containment is preserved as orphan evidence.

Child IPC captures exact nested key sets for the registry, stage, training input, and checkpoint in addition to point and signal. Before any operation, the child revalidates that every path is canonical, below its proper disposable-fixture parent, and neither aliases nor overlaps the production home.

Success is local evidence for process death and fail-closed preservation, not proof of production recovery, power loss, or reboot behavior. In particular, `checkpoint-first-byte-written` establishes only 1-byte visibility. It does not claim fsync durability, power-loss survival, or torn-write recovery.

The Darwin drill exposed an implementation hazard: passing a registry path directly to `lockf` can let the helper unlink the lock target when it exits. The fresh probe instead opens the registry with `O_RDONLY | O_NOFOLLOW`, passes the held descriptor as stdio fd3, and runs only `lockf -s -t 0 3`. It never uses the path form. The checkpoint case also hands consumer input off synchronously before the callback's first `await` and gives the checkpoint a non-shared 32-byte root-key copy. The receipt claims zero-fill only for the parent fixture key buffer, not all process memory or child key copies.

## 7. Fixed CLIs, Node 22 guard, and lazy load

Preflight and kill drill have separate argumentless CLIs. Each checks `process.argv.length === 2` and `process.version === "v22.13.0"` before lazily loading its implementation. A wrong argument or runtime cannot load the private module.

Package scripts are distinct from the production prefix-100 command. Only the kill drill uses fixed `/usr/bin/caffeinate` to prevent sleep during its macOS process-lifetime cases. Neither CLI accepts environment overrides, paths, receipt input, or retry options.

Success stdout and failure stderr are each one-line JSON rebuilt from allowlists. They disclose no raw receipt, raw error, path, UID/PID, hostname, device/inode, digest, MAC, nonce, key, or registry content. If stdout fails after a successful local operation, that operation is not rerun. This is not a production-gate success claim.

## 8. Receipts, privacy, and public evidence

The public preflight receipt contains only a contract, status, fixed gate, read-only decision, and Boolean verification/nonclaims. The public kill-drill receipt contains only fixed failpoint/signal classifications and Boolean verification/nonclaims. Fixture paths, child identities, filesystem identities, and private authentication values are excluded.

The [machine-readable evidence](./data/floodgate-v7-fresh-prefix-100-one-shot-2026-07-16.json) separates local implementation/tests from real production execution. Tests reject personal absolute home prefixes, 64-digit hexadecimal values, private canaries, and private-value keys across both articles and the JSON evidence.

## 9. Fail-closed state matrix

| Observation                                                                  | Public result                            | Retry                                            | Mutation                           |
| ---------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------ | ---------------------------------- |
| Every required check and terminal revalidation passes while one lock is held | Read-only `GO`; gate authorization false | Gate needs a separate same-lock composition      | No namespace/file-content mutation |
| Any condition is false or unknown                                            | `NO-GO`                                  | Reconcile read-only and make a fresh observation | None                               |
| All six kill-drill cases pass                                                | Disposable success                       | Review the next step at the reviewed HEAD        | None in production                 |
| Kill-drill failure, signal, timeout, or receipt mismatch                     | STOP                                     | No automatic retry                               | Preserve evidence                  |
| Unknown failure after production prefix-100 starts                           | STOP                                     | No rerun before checkpoint reconciliation        | No delete, truncate, or repair     |

A successful prefix-100 does not automatically authorize prefix-500. It requires an exact 100-record read-only postflight and a stop for a separate reviewed decision.

## 10. Test matrix and intermediate data

At minimum, one reviewed tree validates:

- every preflight GO condition and NO-GO with each single condition broken;
- held-descriptor double snapshots, rename, symlink, hardlink, owner/mode, and extra entries;
- outer UID, home, and registry anchoring; inner held-FD start/end revalidation; and one binding across approved A and reloaded approved/current;
- argumentless Node guard, no pre-guard lazy load, and import-only inactivity;
- exact success/failure receipt shapes, Proxy/accessor/extra-key rejection, and private-canary non-disclosure;
- three failpoints times two signals, contention before death, and release after death;
- stale/EEXIST blocking, byte/identity preservation, and no delete/truncate/repair;
- fixed `/private/tmp` private anchoring, bidirectional production-home ancestry rejection, and child nested-path escape rejection;
- failure-fixture and partial-setup orphan preservation, with cleanup only after success;
- zero production registry-byte reads, persistent mutations, and gate calls, with read-only audits counted separately; and
- bilingual twelve-section parity, duplicate JSON-key detection, and public privacy.

Authoritative local validation of the final stable substantive tree after the PR #471 final-review repair completed under exact Node v22.13.0. Focused validation passed 153 / 153 across eight files: 69.36 seconds Vitest duration, 69.71 seconds wall time, 419,643,392 bytes maximum RSS, and zero swaps. Full validation passed 2,680 / 2,680 across 143 files: 156.65 seconds Vitest duration, 157.07 seconds wall time, 4,374,691,840 bytes maximum RSS, and zero swaps. The production build generated 193 / 193 static pages and passed in 26.11 seconds wall time with 2,619,424,768 bytes maximum RSS and zero swaps.

The immediately preceding post-fix pre-review candidate passed focused 149 / 149, full 2,676 / 2,676, and production build 193 / 193. It is retained only as nonfinal intermediate data superseded by the PR #471 final-review repair and is not mixed into the authoritative values.

TypeScript passed. Full ESLint exited zero with zero errors and 157 existing warnings; changed-scope ESLint had zero errors and zero warnings. ML stdlib passed 58 / 58, `npm audit` reported zero at every severity, and git diff-check passed. Post-fix audit residuals are zero P0, zero P1, and zero P2. These validation results are authoritative **local** evidence, not evidence of review, merge, or production-command execution.

The pre-audit focused five-file rerun with the fixed APIs passed 43 / 43 under Node v22.13.0: 21.40 seconds Vitest duration, 21.73 seconds wall time, 365,248,512 bytes maximum RSS, and zero swaps. It includes six local child terminations across three failpoints and two signals. Expanded integration passed 109 / 109, and the second full regression passed 2,644 / 2,644 across 143 files. The production build also passed through all 193 / 193 generated static pages. These are not executions of the public fixed kill-drill command or the production gate.

An independent teacher/input-readiness audit passed read-only on 2026-07-16. The input bundle passed identity, hash, and mode checks for 9 / 9 files and totaled 295,620,795 bytes. Training, selection, and final raw-parent counts were 24,000 / 4,800 / 4,800; their protected-ID counts were 2,121,074 / 425,344 / 413,221, with 847,243 replay-exclusion position IDs. Fixed teacher assets passed 7 / 7 files totaling 66,169,459 bytes. Related validation passed 72 / 72 across three files in 7.40 seconds with zero swaps. Readiness capacity was 14 logical cores, 48 GiB memory, 162.25 GiB available disk, and 12 fixed engines. No path, hash value, or private value is recorded in this public evidence. This was one readiness audit, not search, teacher generation, training, or production-gate execution.

The subsequent independent-audit severity count was one P1 and one P2 for preflight, plus two P1 and three P2 findings for the kill drill. The preflight P1 was UID, home, and registry anchoring of the outer capability; its P2 was rebinding the first approved A to reloaded approved/current. The kill-drill P1 findings were temporary-root/production-home overlap and failure cleanup. Its P2 findings were child nested paths, partial-setup rollback/orphan preservation, and wording that had called the third point durable. These repairs and regressions passed authoritative post-fix local validation, leaving residual P0 / P1 / P2 at 0 / 0 / 0. Historical pre-audit passes remain separately nonfinal, and the production decision remains NO-GO.

Post-fix re-audit repaired a P2 gap in preflight lock-contention coverage. The kill-drill P2 re-audit covered partial capture/setup `fixture_preserved` classification; narrowed the anchor-descriptor overclaim to the implemented canonical-realpath plus named-`lstat` checks; replaced a racy global `/private/tmp` snapshot with exact owned-prefix accounting; and confirmed injected-path privacy at the test seam. Integration P2 repairs fixed execution-accounting boundaries, non-atomic observation wording, and the package/Darwin-CI source contract. The kill CLI now also requires `cases` to be an exact native array with exact indices and length. A further P2 repair fixed the preflight CLI exact-record/privacy boundary, with regressions rejecting Proxy, accessor, extra string or symbol keys, and nonplain prototypes.

The PR #471 final review found another independent P2: failure, timeout, and malformed-IPC paths could kill a child and finish without confirming its close. The repair introduced one shared close observation and now terminates and awaits close on every failure path. Four adversarial arm/probe regressions prove that the child PID reaches `ESRCH`, fd 3 can reacquire the lock on the actual `registry.json`, the process tree remains stable for 150 ms, and no late write appears. Follow-up test review found a second P2 because the initial lock assertion targeted the registry directory rather than `registry.json` itself; the assertion now targets the actual file. Residual findings after these repairs remain P0 / P1 / P2 = 0 / 0 / 0.

Execution counts remain boundary-specific. Reviewed post-merge kill-drill CLI executions are zero. In one authoritative post-fix kill test-file run, the fixed zero-argument owner was invoked twice, three complete six-case drills finished, and 18 local cases succeeded. There were six distinct failpoint/signal classes and zero production cases. The four added failure-path child-reap regressions per run are not counted as complete drills, successful local cases, or production cases. The six historical pre-audit local cases remain separate from these 18; they are not summed into an authoritative 24.

## 11. Production counters and nonclaims

The read-only audit counters are one real production preflight command, one approved-current-binding CLI, one deployment-key-instance inspector, and one teacher/input asset-readiness audit. All were read-only and non-authorizing, and the preflight itself returned sanitized `NO-GO`.

The following action counters remain zero:

- reviewed disposable kill-drill command, production process-death case, and production registry provision;
- prefix-100, prefix-500, and final-24,000 gates;
- search run, real teacher process, teacher label, checkpoint finalization, optimizer step, and training run; and
- candidate weight, formal A/B, live activation, and external-rank observation.

Accordingly, runOp1 remains unchanged. This article does not claim stronger play, stable high-dan strength, or completed production recovery. Source/test PASS is not counted as production execution.

The historical pre-audit focused test observed six disposable-child SIGTERM/SIGKILL local cases. A separate authoritative post-fix kill test-file run observed 18 successful local cases, while reviewed post-merge CLI execution remained zero and production cases remained zero. These are not mixed into production counters: historical six remains nonfinal, while post-fix 18 is the authoritative local aggregate.

## 12. The next exactly-once sequence

PR #471 is ready and open, and the post-review evidence refresh is recorded. The whole pull request is not treated as uncommitted or unpushed. After this refresh is reflected in CI and review and regular-merged, the reviewed HEAD follows this order:

1. Run the fixed disposable kill drill once and record its sanitized success receipt.
2. Let the fresh production one-shot owner acquire the common outer lock.
3. Rerun the private zero-work preflight while holding that same lock.
4. If every required check and terminal revalidation passes, invoke prefix-100 exactly once.
5. On nonzero exit, signal, timeout, or receipt mismatch, STOP without automatic retry.
6. Even on success, perform an exact 100-record read-only postflight and stop.

Prefix-500, 24,000, training, candidate selection, formal A/B, external calibration, and live activation each require separate evidence and review after this sequence.
