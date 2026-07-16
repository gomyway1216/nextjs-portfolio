# A recovery foundation for the production outer-gate lease — Floodgate v7

> The [preceding production runner](./blog-shogi-floodgate-v7-production-connector-runner.en.md) fixed dedicated entry points for 100, 500, and 24,000, but stopped before a real gate because an empty stage-authorization lease left by a vanished process could not be safely distinguished from a live owner. This change adds one common OS-lifetime lock and an authenticated persistent record outside all three entry points, then synchronizes stage-authorization lease creation and removal through the parent directory. It is **not completed recovery for every lease**. It is a foundation for outer crash evidence, inspection, and explicit quarantine, plus stage synchronization hardening. No real stale recovery, real reboot recovery, production gate, teacher label, training, weight, live activation, match, or strength measurement has been performed. Japanese version: [blog-shogi-floodgate-v7-production-lease-recovery.md](./blog-shogi-floodgate-v7-production-lease-recovery.md)

---

## 1. Result and scope of this change

**The production-gate hold remains.** A crash can also leave the inner empty stage lease. Quarantining the outer stale source does not remove that inner lease, so the next exclusive create still stops with `EEXIST`. This change also has no authority to acknowledge, resolve, or release quarantine. Real 100, 500, and 24,000 therefore remain at zero and blocked until a follow-up closes authenticated inner-stage metadata, inner reconciliation, and quarantine resolution.

| Item                     | Current result                                                                                           | Meaning                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Common outer gate        | All three fixed gates enter the same outermost wrapper                                                   | The gates do not own separate exclusion boundaries                    |
| OS-lifetime lock         | Held against the same private registry object from before the operation until after settlement           | The kernel rejects concurrent execution while the process lives       |
| Active record            | Authenticated with a dedicated derived key and synchronized before the operation                         | A crash record is not treated like an unauthenticated empty directory |
| Normal retirement        | Retired evidence is created while retaining the exact active source, then active removal is synchronized | Normal success is distinct from stale evidence                        |
| Manual stale flow        | Inspection and confirmation are separate; only fresh reinspection can publish a create-only quarantine   | Ordinary runners never auto-delete a stale source                     |
| Quarantine               | Any entry blocks all three gates                                                                         | Quarantine is not authority for the next gate                         |
| Stage authorization v3   | The held parent is synchronized after lease creation/removal and revalidated around each synchronization | Indeterminate directory-entry durability is never reported as success |
| Production execution     | 0                                                                                                        | This is not evidence of a real gate or a changed live evaluator       |
| Real recovery drill      | 0 stale, 0 reboot                                                                                        | Fixture success is not presented as operational recovery              |
| Recovery for every lease | Incomplete                                                                                               | Inner empty lease and quarantine resolution are the next blockers     |

The result is not approval to start a production runner. It adds state that can support decisions before startup and after abnormal termination. Quarantine acknowledgement, deletion, and authorization of a later gate are intentionally absent.

## 2. The preceding blocker and the exact delta

The preceding stage-authorization lease exclusively created a current-user-owned private directory, then revalidated and removed the same object on normal close. That prevents duplicate use within the running system, but only an empty directory remains after forced termination or power loss. Persistent state carried no run/gate binding and no kernel lock tied to the owner's lifetime, so an ordinary runner could not safely delete the directory merely because it appeared old.

This delta has two layers.

1. One OS-lifetime lock and authenticated active record now surround the three production runners.
2. The inner stage-authorization lease now synchronizes create/remove through the held publication parent and blocks same-process recreation after indeterminate synchronization.

The outer record is not authority to auto-delete the inner empty lease. Even after explicit quarantine of an outer stale source, the system cannot proceed without separate inspection of any remaining stage object and checkpoint effects. This preserves the distinction between evidence that an owner died and proof that every side effect was safely reconciled.

The preceding PR's latest known fresh snapshot had no production registry and no gate process, so real v2 persistent data created by a production gate was zero. No migration was run. Automatic adoption, upgrade, and deletion are absent; a future legacy empty stage lease is preserved and rejected. This is not a claim that this article freshly observed the current production state.

## 3. One OS-lifetime lock shared by all three gates

The public 100, 500, and 24,000 entry points all reach the outer wrapper through the common `runProductionGate`. The wrapper opens the immutable private registry through a held descriptor and checks ownership policy, mode, link policy, agreement with the named object, allowed size, and content binding before applying the fixed macOS lock helper nonblockingly. Registry loading, approved binding, the connector, stage setup, and the teacher process do not start before lock acquisition succeeds.

Production exposes only three fixed zero-argument owners; there is no generic production export that accepts a gate or callback. After active publication, the outer owner uses a captured CommonJS `require` to lazy-load the fixed runner module and calls the one exact under-outer operation for that gate. It does not use dynamic `import()`. The inner result is rejected if the legitimate connector does not claim the capability exactly once, a clone or wrong-gate/double claim is attempted, or the fixed module fails to load.

| State                                               | Ordinary-runner result                             | Operations run |
| --------------------------------------------------- | -------------------------------------------------- | -------------: |
| Another gate holds the lock                         | Stop as `another-gate-invocation-active`           |              0 |
| Namespace differs after lock acquisition            | Require manual reconciliation                      |              0 |
| A stale active record exists after lock acquisition | Stop at inspect-only handling                      |              0 |
| Lock acquired; no stale source or quarantine        | Start only after durable authenticated publication |              1 |

Local process tests check that prefix gates do not overlap, all three gates use the same boundary, and process death after SIGTERM releases the lock. They do not reproduce a real production process, kernel panic, exhausted battery, power loss, or reboot. They therefore do not prove reboot recovery.

## 4. Make the authenticated active record durable before the operation

The active record is canonical JSONL with an exact ordered shape, installed create-only in a private control namespace. A key derived from the deployment root under a dedicated domain authenticates the gate, registry binding, and private owner-lifecycle metadata. The implementation synchronizes the staging file, creates the active name with a no-clobber link, synchronizes the control directory, removes the staging name, and synchronizes its directory. Only after reopened exact bytes match, authentication succeeds, and quarantine remains empty does it issue an opaque single-use connector capability bound to the exact gate. The capability is not returned to an ordinary caller; only the fixed under-outer operation receives it. The production checkpoint connector cannot start unless it synchronously claims that capability.

The fourth independent audit repair found that an unknown failure during partial publication could understate a staging remnant or active link. The repair monotonically tracks `authenticated_lease_published / quarantine_blocks_all_gates` as F/T after staging creation but before the active link, T/T after the active link but before staging removal is directory-durable, and T/F only after staging removal is durable through the quarantine-directory sync. Four focused failpoints cover the boundaries: `after-staging-create`, `after-active-link-before-control-sync`, `after-durable-active-publish-before-staging-cleanup`, and `after-staging-unlink-before-quarantine-sync`. These are local injections, not a real process crash or reboot, so they do not prove real crash or reboot recovery.

The public receipt returns only fixed contract, status, algorithm, Boolean fields, and a fixed `execution_boundary` that distinguishes the native production descriptor close from the injected test-only boundary. The production runner accepts only the production value, so a test receipt whose close hook is a no-op cannot be reinterpreted as proof that the production lock was released. Personal environment details, owner values, file-identity values, authentication tags, entropy values, machine identity, root key, registry contents, raw connector receipts, and raw failures are not returned. Private values may participate in authentication but are absent from this article and the [machine-readable evidence](./data/floodgate-v7-production-lease-recovery-2026-07-15.json).

Authentication establishes that a record can be bound to deployment authority and the registry. A surviving record does not establish that the operation completed, no checkpoint persisted, the stage was safely removed, or another gate may start.

## 5. Separate normal success, operation failure, and retirement

The normal flow is ordered as follows.

```text
common OS lifetime lock
        |
        v
private namespace + quarantine/retired checks
        |
        v
authenticated active publish + durability sync
        |
        v
exact fixed production gate operation
        |
        v
create pending retired evidence
        |
        v
remove exact active + control-directory sync
        |
        v
close retired evidence + retired-directory sync
        |
        v
final private namespace + retired/quarantine validation under lock
        |
        v
release OS lock
```

Before active removal, the implementation rechecks the exact bytes and file identity held from before the operation; it never unlinks a replacement object. It creates create-only evidence in the retired namespace and synchronizes that directory before removing active. A closed retired record is freshly checked for exact ordered shape, authentication, and current registry binding. If control-directory synchronization fails after active unlink, pending retirement remains and a later run fails closed.

For final success, it keeps the OS lock while jointly revalidating the private identities of control, quarantine, and retired directories, the exact control entry set, active absence, empty quarantine, and retired authentication and current binding. Only then does it close the descriptor. This removes a race in which a predecessor's final validation could observe the active record created by a successor after lock release. A normal success receipt is issued only after this final validation under lock, durable active removal, authenticated closed retirement, and close at the corresponding execution boundary have all succeeded.

If the inner operation rejects, active evidence is preserved and the public failure requires manual reconciliation. It does not claim that the operation never ran or that no checkpoint persisted.

## 6. Two-phase stale inspection, explicit confirmation, and quarantine

When a lock can be acquired but an active record remains, the ordinary runner stops. Only an exact source that authenticates and matches the current registry binding can obtain an opaque single-use capability from the separate inspection entry point. An empty legacy source, unauthenticated source, binding mismatch, or identity change receives no capability. Inspection alone does not modify the source.

Confirmation requires both the opaque capability and the fixed confirmation phrase. While retaining the lock, the confirmation phase freshly reopens the same source and rechecks bytes, identity, authentication, registry binding, and empty quarantine. Only then does it hard-link to a unique create-only destination, synchronize the quarantine directory, unlink the exact active source, and synchronize the control directory. A source change between inspection and confirmation prevents quarantine. Cancellation leaves the source unchanged and only releases the lock.

While any quarantine entry exists, all of 100, 500, and 24,000 stop. The receipt has the meaning of `next_gate_authorized: false`; it neither acknowledges nor deletes quarantine. Local quarantine success is therefore not called completed stale recovery or authorization to resume.

Production inspect/confirm/cancel module APIs exist, but there is no fixed operator CLI, interactive orchestrator, or `finally` owner that guarantees cancellation when a capability is abandoned. Because an inspection capability retains the OS lock in the same process, custom code is not treated as a production operating procedure. This is another reason real stale recovery remains zero.

## 7. Parent-directory durability in stage authorization v3

The stage-authorization contract advances to v3. After opening the exclusively created lease directory, it keeps a same-process namespace guard active, synchronizes the held lease directory first, revalidates the held lease, and then synchronizes the held publication parent. It checks before and after synchronization that the parent path still names the same private directory. Close, authorization-failure cleanup, publication abort, and publication-transaction removal require the same parent synchronization after removing the exact lease, and the guard is not released before settlement.

| Failpoint                                  | Public behavior                                         | Same-process recreation |
| ------------------------------------------ | ------------------------------------------------------- | ----------------------- |
| Parent sync fails after create             | Typed durability-indeterminate result; lease may remain | Blocked                 |
| Held lease-directory sync fails            | Stop before parent sync with typed indeterminate result | Blocked                 |
| Identity differs before removal            | Exact object is not removed                             | Blocked/fail closed     |
| Parent sync fails after successful removal | Cleanup/close is reported indeterminate                 | Blocked                 |
| Publication parent changes around sync     | Publication is not reported successful                  | Blocked                 |
| Parent sync fails after abort cleanup      | Lease removal is not claimed durable                    | Blocked                 |

The implementation also records active and indeterminate states in a process-local guard state machine. This prevents the same process from immediately overwriting uncertainty; it is not an authenticated stage tombstone that survives restart. Stage-namespace recovery after a real reboot remains unperformed and unproven.

## 8. Ownership of signals, exit, and the error surface

The outer wrapper does not claim graceful signal cleanup. On a covered signal it removes every listener for the delivered signal, including a pre-existing persistent listener, then resends the same signal so the native default terminates the process. The exit path deliberately leaves the active record intact, so only the OS lock is released with process lifetime while authenticated crash evidence remains. Both the fixed ordinary owner and manual inspection own this handler; confirmation or cancellation removes it. Local child-process tests cover both SIGTERM paths, but they are not a production-daemon or reboot drill.

The outer wrapper places namespace-path construction, key derivation, locking, publication, operation, and cleanup under one phase-aware typed sanitation boundary. The runner then sanitizes that outer failure into its `outer-gate-lock` phase and does not forward a private error object to the CLI. An unknown failure after authenticated publication conservatively retains the possibility that an operation or checkpoint ran. Public output includes only the allowlisted gate, phase, and may-have-run information needed for handling, not private metadata or a raw error.

Descriptor-close completion is tracked independently from metadata removal. If close fails after metadata was durably settled, `finally` makes another best-effort close attempt; if that also does not succeed, success is not claimed before process death releases the descriptor.

Ownership order is strict: the outer wrapper acquires the lock and active record before handing control to the runner, finishes retirement after runner settlement, and only then releases the lock. The runner has no path that releases the outer lock early, and an inner operation cannot directly remove outer active evidence.

## 9. Fail-closed state matrix

| Fresh observation                                    | Authentication             | Mutable action                   | Next ordinary gate           |
| ---------------------------------------------------- | -------------------------- | -------------------------------- | ---------------------------- |
| OS lock busy                                         | Not evaluated              | None                             | Fresh retry after owner exit |
| Lock free; no active/quarantine; retired state valid | Not needed                 | Publish fresh active create-only | May start if all checks pass |
| Lock free; authenticated active exists               | Current binding matches    | Inspection does not mutate       | Blocked pending manual flow  |
| Lock free; empty legacy active exists                | Cannot authenticate        | No mutation, no capability       | Blocked                      |
| Lock free; modified active exists                    | Cannot authenticate        | No mutation, no capability       | Blocked                      |
| Source changes after inspection                      | Fresh check differs        | No quarantine                    | Blocked                      |
| Explicit confirmation succeeds                       | Fresh authentication       | Create-only quarantine           | All gates blocked            |
| Quarantine entry exists                              | Not evaluated              | No automatic deletion            | All gates blocked            |
| Pending or invalid retired entry exists              | Not evaluated              | No automatic repair              | All gates blocked            |
| Stage-parent durability is unknown                   | Separate from outer result | No automatic recreation          | Blocked by stage boundary    |

This matrix prioritizes evidence preservation over availability. It does not claim defense against an attacker outside the trusted same-user runtime who can modify the private namespace or key.

The trust boundary treats same-process code as trusted, including loaded application code and the CommonJS module cache. The three fixed production owners do not expose a supported API through which an ordinary caller can mint a connector capability for an arbitrary callback. They are not, however, an OS security boundary against hostile `require.cache` or export replacement, or arbitrary same-process code that can reach the root key, filesystem, and process APIs. That stronger requirement would need a separate UID or an isolated broker.

## 10. Local validation and the intermediate timeline

Outer-lease tests cover the common lock across three gates, prefix serialization, an empty legacy source, authenticated stale source, quarantine blocking all gates, source replacement, operation rejection, pending retirement, SIGTERM, two-phase confirmation, the inspection-to-confirmation race, and cancellation. Stage-authorization tests cover create/remove synchronization order, failpoints, publication abort, parent-identity changes, and shared close. Runner tests exactly validate the outer success receipt and conservatively project outer failures.

The independent audit found and closed the following issues without erasing the intermediate record.

| Audit finding                                                                  | Fix and regression evidence                                                                                                                                |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A generic production callback could become a capability issuer                 | Removed it in favor of three zero-argument fixed owners, lazy fixed operations, and unclaimed/clone/forge/double/wrong-gate tests                          |
| Production manual APIs could surface raw failures                              | Fixed inspect/confirm/cancel to typed sanitized failures and exercised descriptor-close faults                                                             |
| A pre-existing signal listener could absorb process death                      | Remove every delivered-signal listener before resend; verify both ordinary and manual child processes                                                      |
| Every nonzero `lockf` result was classified as contention                      | Treat only exit 75 as contention; classify every other result as a sanitized manual failure                                                                |
| Closed-retirement negative coverage was incomplete                             | Fail closed on tampering, an extra field with a recomputed valid HMAC, and current-registry mismatch                                                       |
| A missing macOS helper could leave a zero-test green job                       | Require executable `/usr/bin/lockf` in Darwin CI and run the outer adversarial suite unconditionally                                                       |
| A test-only no-op close could produce the same receipt as a production release | Separate production/test `execution_boundary` values and accept only production in the runner; add a test proving the no-op still holds the lock           |
| Final namespace validation raced after lock release                            | Revalidate private directories, exact entries, active, quarantine, and retired state under lock before close; add a successor-owner race test              |
| Early phases and final close lacked one sanitation/settlement boundary         | Wrap the entire owner in a phase-aware typed failure and track lock release independently; regress pre/post-publish proxy/raw faults and cleanup downgrade |
| Partial-publication failures could understate staging/active progress          | Track F/T, T/T, and T/F monotonically; regress staging remnants, active links, and directory durability at four injected failpoints                        |

After the earlier audit fixes, the focused outer, runner, checkpoint-connector, and CLI set passed 187 / 187 on the required Node version. The 193 / 193 result with the preceding three repairs is retained as a snapshot from before the fourth partial-publication repair. The latest tree including the fourth repair passed 197 / 197 across those same four files. A separate independent rerun passed the two stage-authorization/publication files at 147 / 147.

The first combined rerun used the wrong Node version and ended at 271 / 280; the required-version run while implementation was moving ended at 278 / 280; a later stable snapshot passed 337 / 337. A seven-file snapshot with the preceding three audit repairs passed 344 / 344 in 8.33 seconds of Vitest time and 8.69 seconds of wall time, with a 304,496,640-byte maximum resident set and zero swaps. Because it predates the fourth partial-publication repair, 344 / 344 is now prior evidence. The latest seven-file tree, including the fourth repair, passed 348 / 348 under Node v22.13.0 in 8.14 seconds of Vitest time and 8.49 seconds of wall time, with a 298,811,392-byte maximum resident set and zero swaps. This 348 / 348 result is the current final combined evidence.

The first Prettier check expanded to every changed file found a formatting-only difference in the single Darwin CI YAML file. After mechanical formatting, the expanded check and diff check passed. This is retained instead of claiming that every static check passed on its first attempt.

A full-regression snapshot with the preceding three audit repairs passed 2,597 / 2,597 across 138 files in 159.26 seconds of Vitest time and 159.68 seconds of wall time, with a 4,373,102,592-byte maximum resident set and zero swaps. Because it predates the fourth partial-publication repair, it is now prior evidence; 2,590 / 2,590 is retained as an even earlier snapshot. The latest full regression, including the fourth repair, passed 2,601 / 2,601 across 138 files under Node v22.13.0 in 153.22 seconds of Vitest time and 153.67 seconds of wall time, with a 4,325,474,304-byte maximum resident set and zero swaps. This 2,601 / 2,601 result is the current final full evidence.

Every successful test is a local fixture or local child process. The four partial-publication failpoints are local hooks, not a real process crash, reboot, or production gate.

## 11. Privacy, nonclaims, and zero production execution

The public articles, JSON evidence, public receipts, and public failures contain no personal location, owner identifier, file identity, private registry content, key material, key instance, authentication tag, entropy value, machine identity, raw connector receipt, or raw error. Private fixture values needed by tests are not copied into public artifacts.

All of these execution counts for this change are zero.

- Real authenticated stale recoveries: 0
- Real reboot recoveries: 0
- Production prefix 100 / prefix 500 / final 24,000 gates: 0 / 0 / 0
- Real teacher processes / labels / checkpoint finalizations: 0 / 0 / 0
- Optimizer steps / training runs / candidate weights: 0 / 0 / 0
- Formal A/B matches / live activations / external-rank observations: 0 / 0 / 0

Production state was not freshly inspected for this article. “This change did not alter a live weight” and “the current live state was independently observed” are different claims; this article makes only the former. Playing strength has not changed as a result of this work.

## 12. Next gates and remaining work

Local test success does not skip this order.

1. Rerun focused tests, TypeScript, lint, formatting, and the diff check on the stable shared tree.
2. Review as a ready pull request, address actionable comments, and integrate with a regular merge commit.
3. Implement authenticated inner-stage metadata and stale reconciliation, then define outer-quarantine acknowledgement, retention, deletion, inspection of any remaining stage object, and later-gate authorization as a separate explicit authority/runbook. This PR's quarantine receipt carries none of that authority.
4. Implement a fixed operator CLI/orchestrator and an owner that always confirms or cancels an inspection capability on every exit path.
5. In an isolated non-production environment, drill inspection/cancellation/confirmation after a real process kill and across a restart. Real reboot recovery remains zero.
6. After a fresh production preflight, inspect the private registry and, if still absent, install it exactly once through the existing create-only provisioner.
7. Run and inspect 100, require human approval before 500, and require another approval before 24,000.
8. Complete checkpoint finalization, QAT/selection, sealed holdout, sufficient paired A/B games, staged live rollout, and external-rank calibration.

An independent design audit produced the following **full hardened recovery design estimate**. It is a planning estimate rather than measured runtime or a completion deadline, and it assumes parallel execution, the current safety scope, and dependency order between pull requests.

| Remaining scope                                                                    | Engineer-hours | Parallel dependency-aware wall-hours | Qualification                                                                                                                                                                                |
| ---------------------------------------------------------------------------------- | -------------: | -----------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reassess a speed-first minimum-safe one-shot plan                                  |              — |                                 8–16 | Preliminary planning range with scope not yet frozen. It is not equivalent to full hardened recovery; the smallest plan that preserves the safety requirements will be decided after this PR |
| Two PRs for the inner scanner, signed journal, resolution/release, and crash tests |          43–67 |                                31–56 | Not measured. A speed-first minimum-safe recovery plan will be reassessed after this PR, so a narrower scope may change the estimate                                                         |
| Real macOS reboot drill and production preflight                                   |              — |                                  3–6 | Separate work after the implementation above; it does not include time for a real production gate                                                                                            |

Stable high-dan strength is a later evaluation result. It is not inferred from this PR's lock and durability tests.
