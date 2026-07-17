# Binding production execution to exact application source — Floodgate v7

> PR #479 was integrated with regular merge commit `4c71e664dae67ccd4afdb369a666bcdb4d4bbb37`. An independent post-merge audit then found a P1 blocker: the verifier was fixed, but the **application source executing production commands was not**. [PR #481](https://github.com/gomyway1216/nextjs-portfolio/pull/481) closes that gap with an exact-clean tracked Git closure, a pre-mutation capability, a create-only registry V2, and an outer-gate public receipt V3. Implementation revision `7223c3ddb50201614f62337827be9e22211c0aff` passed 610 focused tests and 3,004 full-suite tests, and later PR head `f69322583bf2d86df302e43022ac56788bc5eb5f` passed 6 / 6 remote checks. Merge was nevertheless held because a post-green audit found a P1 gap in `NODE_OPTIONS` preload handling before the production child Node and P2 gaps involving absolute `engineArgs`, exact test-home confinement, and documentation claims. The remediation, including a native JXA clean launcher, is now committed as exact implementation revision `9ec2d01da4b6e50c4b4c5afd83ce68999d501019`; its isolated local validation passed 165 / 165 files and 3,027 / 3,027 tests, and the independent final audit found P0 / P1 / P2 = 0 / 0 / 0. These evidence-document edits are outside that implementation revision, so GitHub CI, re-review, and regular merge for the eventual final PR head remain PENDING. It has executed no production registry, gate, teacher, label, training, selection, formal A/B, external calibration, or live-activation operation. It has not changed the live weight or runOp1. Japanese version: [blog-shogi-floodgate-v7-production-application-source-provenance.md](./blog-shogi-floodgate-v7-production-application-source-provenance.md)

## 1. Result and current position

The next required step was not retraining from strong games. It was making the source that creates production data reproducible. Starting the 24,000-position teacher run without that property would leave the provenance of the teacher data, checkpoint, and candidate weight ambiguous. Even a stronger candidate could not safely be adopted from such evidence.

This candidate permits one fixed application worktree:

```text
~/.codex/worktrees/shogi-floodgate-v7-production-application
```

It captures the worktree's 40-character Git revision, requires a clean nonignored status, verifies every tracked entry's bytes and mode, and then binds the result once in the private registry. In this document, exact-clean means that **tracked closure**; it does not include ignored or untracked dependency bytes. Every later mutation may proceed only when the current tracked source closure matches the registry binding.

This remains a **candidate implementation**. Exact remediation revision `9ec2d01...` passed final isolated local validation and independent audit, but GitHub CI, re-review, and regular merge for the eventual final PR head are PENDING. The fixed worktree has not been aligned to the eventual merge revision, and the registry has not been provisioned. The production decision is therefore explicitly **NO-GO**.

## 2. P1 blockers found after PR #479 and during implementation audit

PR #479 serialized prefix-100, prefix-500, final-24000, and training-label finalization under one common OS lock and purpose-bound durable leases. That boundary checked the registry, deployment key, verifier, and lease, but the application tree loaded by Node still depended on the current working directory.

The fixed verifier revision could therefore be correct while a production gate was launched from a different, stale, or dirty application checkout. The receipt also carried no binding to that application revision, so it could not establish that the same implementation produced the production evidence. This was a P1 blocker before playing strength and had to be closed before create-only registry provisioning.

Independent auditing continued after the first fix and found two direct bypasses plus two concrete variants inside the test boundary:

- a CLI context check alone did not fully close direct imports of mutation-capable exports from a stale checkout; and
- a dependency-injected `CoreForTests` could reach the production namespace if given the production home or a filesystem alias of it.
- rejecting only the exact production home still allowed a canonical descendant or a dangling symlink targeting a nonexistent production-home descendant to reach the same namespace; and
- after rejecting a foreign or cloned stage lease, invoking its untrusted `close()` during cleanup could still mutate a production lease namespace.

The candidate now verifies the fixed entrypoint and tracked closure **before** loading the production mutation graph and issues a module-private, single-use capability. Ordinary gates consume the same exact object in `runner-entry -> outer-owner` order. Registry provisioning consumes its bootstrap capability in the provisioner and issues no installer authority until its input is fixed. Production exports require both the correct capability and entrypoint context.

The hardened outer-gate, registry loader / installer / provisioner, and stage / connector / training-label composition test owners reject explicitly supplied test homes or options that resolve to the production home, a canonical descendant, a symlink alias (including a dangling link targeting a nonexistent production-home descendant), or an alias through the same device/inode before entering the owner or OS lock. Only callback-returned registry paths and paths bound to an authenticated exact test-realm lease are rechecked against the production-home boundary before downstream mutation authority. A foreign or cloned lease is rejected without inspecting its properties or paths, invoking its `close()`, or reaching key / consumer / checkpoint / preflight / finalizer authority. Test capabilities and continuations live in WeakMap realms separate from production, so production and test objects cannot be exchanged. A successful test-only training-label owner receipt now uses a dedicated contract, status, and claim boundary and does not claim an outer-gate capability or OS lock. The existing production receipt contract and true verification remain unchanged. This is not a sandbox for arbitrary side effects inside an injected callback. These remediations passed the historical validation at `7223c3d...`.

Auditing continued even after `f693225...` passed 6 / 6 remote checks. Merge was held when that post-green audit found:

- **P1 — hidden preload:** direct Node startup executes `NODE_OPTIONS=--require=...` before the application's first guard. A preload can erase `NODE_OPTIONS` and `process.execArgv` after running and can alter the module loader or intrinsics that the application intended to capture, so a Node-only check could not prove that no code ran first;
- **P2 — absolute `engineArgs`:** the test-only connector and training-label paths checked their main paths but did not include every absolute engine argument in the same boundary;
- **P2 — exact test home:** merely staying outside production did not reject a test registry or lease path that escaped its authenticated test home through a sibling or symlink; and
- **P2 — documentation claims:** phrases such as “only the minimal source-authorization module” and “no application-source revision values” were broader than the implemented boundary, which also includes a mutation-neutral shared CLI boundary and a private registry binding.

The P1 remediation uses a tracked native JXA launcher evaluated before the attested production child Node to establish a clean environment dedicated to that child. The P2 remediations add absolute `engineArgs` to path checks, confine test registry and lease paths to the authenticated exact test home, and narrow the documentation to the implemented boundary. These changes are committed in exact implementation revision `9ec2d01...`, which passed focused and final isolated local validation plus an independent final audit. Final PR-head GitHub CI and re-review remain separate delivery gates.

## 3. Capturing source once in registry record V2

The new private registry contract is `shogi-floodgate-v7-production-connector-registry-record-v2`. Its canonical record contains this source binding:

```json
{
  "layout": "fixed-current-euid-userinfo-home-production-application-v1",
  "revision": "<40 lowercase hex Git object id from exact-clean tracked closure>"
}
```

The provisioner checks the fixed application worktree and captures the binding before current-key verification, entropy, or create-only installation. The installer uses a staged write, fsync, no-clobber hard link, directory fsync, reopen, and postflight revalidation. It never adopts, overwrites, or rotates an existing registry.

The provisioner consumes the source-bootstrap capability once, invalidating the original object and producing an opaque continuation that cannot yet start the installer. Only after the exact installation input—including the application binding, approved/current key binding, and run ID—is fixed does it late-arm a **distinct installer-capability object**. The installer claims that distinct capability once, and unused continuations or installer capabilities are revoked on failure paths. The bootstrap capability is never passed through to the installer unchanged.

Legacy record V1 remains strictly parseable for inspection, but it cannot issue a current production capability or mutation authority. There is no automatic V1-to-V2 migration, overwrite, or adoption. Because no registry has been created yet, V2 provisioning remains a separate, explicit operational step after merge.

## 4. Exact order before any mutation

All four mutation purposes now share this order:

```text
acquire the OS-lifetime lock while holding the registry file descriptor
  -> read the application binding from canonical locked V2 bytes
  -> verify exact HEAD, tracked bytes, tracked modes, and clean status
     in the fixed application worktree
  -> revalidate the held/named registry bytes, SHA-256, device, and inode
  -> only then enter the control namespace, authenticated lease, and operation
```

A revision, byte, mode, clean-status, or registry-anchor mismatch fails closed in phase `application-source`. On this failure path, control-directory creation, active-lease publication, gate operation, checkpointing, and label finalization all remain zero, and `authenticated_lease_published` remains false.

The registry file descriptor and OS lock remain held while source is checked, and the same registry anchor is revalidated afterward. This rejects a straightforward race that substitutes a different registry between observation and mutation authority.

## 5. Public outer receipt V3, private persisted lease V2

The public receipt advances to `shogi-floodgate-v7-production-outer-gate-lease-v3` and adds three success conditions:

- the application-source binding was read from the locked registry;
- the exact-clean tracked application closure was verified before persistent mutation; and
- the registry anchor was revalidated after source verification and before mutation.

The private persisted HMAC lease record remains V2 so the established crash-evidence and reconciliation semantics do not change unnecessarily. The public receipt version and private on-disk lease format are deliberately separate concepts.

Public outer, connector, and training-label receipts disclose no application revision, path, or digest. Those values remain inside private registry bytes and held-lock comparisons.

## 6. Establishing source authority before the mutation graph

The post-green remediation no longer starts the attested production child for an affected evidence command through direct Node. The npm package-script runner is itself a Node process, and the `osascript` / JXA process may see the invoking shell or npm environment. The boundary instead guarantees that, from the canonical fixed application root, root-owned absolute `/usr/bin/osascript` evaluates the tracked JXA at the canonical helper path with one fixed purpose **before the production child Node**, and that arbitrary operator-provided keys are not forwarded to that child. JXA constructs a fresh fixed minimal NSTask environment with no `NODE_OPTIONS` and starts fixed Node `v22.13.0` through `/usr/bin/caffeinate` with only `-r tsx/cjs` and the exact entrypoint.

The native launcher currently covers exactly 8 commands:

- 5 mutation-capable commands: create-only registry provisioning, durable prefix-100, durable prefix-500, sealed final-24000, and training-label finalization; and
- 3 read-only or disposable commands: application-source readiness, prefix-100 read-only preflight, and the disposable kill drill.

The launcher binds a 32-byte CSPRNG nonce to a private one-shot stdin pipe and the clean child environment. The Node side checks the live parent's exact command and `/usr/bin/osascript` image through root-owned `/usr/sbin/lsof` and `/bin/ps`. It also checks the production child's cwd, `process.execPath`, main filename, `process.argv`, `process.execArgv`, and allowlisted environment as one exact tuple. The attestation is claimable once. After claim, its five attestation keys are removed from `process.env`; zeroization of JS string copies is not claimed. The mutation-neutral entry/shared-CLI boundary and source-authorization module then verify the fixed tracked closure and obtain an opaque capability before lazily loading the applicable production operation module or graph. An alternate checkout, direct Node parent, preload-bearing child environment, clone, proxy, wrong purpose, wrong stage order, or reuse fails closed.

This boundary checks fixed-tool ownership, mode, and canonical path; the live parent image and command; the exact child tuple; and the one-shot pipe. It does not claim byte-digest closure for `osascript`, `lsof`, `ps`, `caffeinate`, or the Node binary, an atomic process-lineage snapshot, or isolation from a hostile same-UID or ancestor process.

Production and test capability registries and provisioner-continuation registries are separate. The test-stage realm exists to exercise state machines and failure paths; it cannot mint, claim, or arm a production capability and does not accept a home that aliases the production namespace.

The candidate also adds an argumentless, read-only source-readiness inspector. It observes only a point-in-time exact-clean tracked closure of the fixed worktree. It neither creates, loads, nor modifies the registry and claims no gate authority, checkpoint, teacher label, training, weight, match, or playing strength. Its public output includes no revision, path, or digest.

## 7. Rechecking in prefix-100 preflight V3

A provisioning-time source success is not reusable as future execution authority. Fresh prefix-100 read-only preflight V3 claims private registry V2 under the common OS lock and matches its binding against the current exact-clean tracked application closure before checking the verifier, runs namespace, deployment key, and approved/current bindings.

Preflight `GO` means only that read-only core preconditions were observed at that point in time; it does not authorize a gate invocation. The receipt is not reusable, and a source mismatch returns sanitized `NO-GO`. Preflight itself performs no namespace or file-content mutation.

## 8. Tracked-closure guarantees and nonclaims

The candidate does not claim:

- isolation from every hostile process running under the same UID;
- byte closure over ignored or untracked content, especially `node_modules`;
- detection of a transient modification that is perfectly restored between observations;
- an atomic snapshot of the entire filesystem;
- invariance of every read-related metadata field, including access time;
- automatic migration, reconciliation, deletion, adoption, or overwrite of registry V1; or
- registry, gate, human-approval, or playing-strength authority from source readiness alone.

Every tracked Git entry is checked by full bytes and mode, but this is not an OS sandbox or same-UID adversary-isolation boundary. The remaining assumptions stay explicit for later production approval.

Outer, connector-runner / CLI, training-label-runner / CLI, preflight, readiness, and provision receipts explicitly state `ignored_untracked_dependency_bytes_verified: false`, `same_uid_race_isolation: false`, and `atomic_source_snapshot: false`. The native launch boundary likewise has the equivalent of `tool_byte_closure_verified: false` and `atomic_process_lineage_snapshot: false`. “Exact clean” must therefore not be read as verification of every dependency byte in `node_modules`, fixed-tool byte closure, or an atomic source or process-lineage snapshot.

## 9. Exact remediation implementation passed locally; final delivery is PENDING

The first local validation is fixed to implementation revision `7223c3ddb50201614f62337827be9e22211c0aff`. The then-uncommitted article and JSON edits were not part of that revision, so this is validation of the **exact historical implementation revision** at that time. Later head `f693225...` also passed 6 / 6 remote checks, but that predates the post-green findings and is not a current merge gate.

| Historical check at `7223c3d...`                    | State | Final value                                                                   |
| --------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| Focused source / registry / outer / preflight tests | PASS  | 21 files / 610 tests / 9.93 seconds                                           |
| Full Vitest                                         | PASS  | 164 files / 3,004 tests / 312.58 seconds; RSS 2,416,541,696 bytes; zero swaps |
| TypeScript                                          | PASS  | `tsc --noEmit`                                                                |
| Full lint                                           | PASS  | 0 errors; 157 pre-existing warnings                                           |
| Changed-file Prettier                               | PASS  | 47 files                                                                      |
| Production build                                    | PASS  | exit 0 / 30.68 seconds; RSS 2,625,978,368 bytes; zero swaps                   |
| ML stdlib                                           | PASS  | 58 / 58 tests                                                                 |
| npm audit                                           | PASS  | 0 vulnerabilities                                                             |
| Independent security / docs audit at that time      | PASS  | P0 / P1 / P2 = 0 / 0 / 0; zero TypeScript import cycles                       |

The post-green remediation is tracked separately. The exact implementation revision below excludes these article and JSON evidence edits; their later commit will form the final PR head that must pass remote gates.

| Timeline / gate                                      | State       | Established value or PENDING boundary                                                   |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| Remote checks for PR head `f693225...`               | PASS-HELD   | 6 / 6 passed; not used for merge after the later audit                                  |
| Post-green independent audit                         | FOUND-FIXED | 1 P1 hidden preload and 3 P2 findings; remediated at `9ec2d01...`                       |
| Exact remediation implementation revision            | PASS        | `9ec2d01da4b6e50c4b4c5afd83ce68999d501019`                                              |
| Native launcher + 8 CLI focused Node 22 tests        | PASS        | 9 files / 136 tests; 0 production command or namespace use                              |
| Native-launcher exact-child-tuple adversarial matrix | PASS        | 22 / 22; wall 2.34 seconds; RSS 146,620,416 bytes; zero swaps and block I/O             |
| P2 exact-home / absolute-`engineArgs` boundary tests | PASS        | 2 files / 139 tests                                                                     |
| Combined focused run                                 | PASS        | 9 files / 255 tests; wall 2.51 seconds; RSS 298,795,008 bytes; zero swaps and block I/O |
| Final isolated full Vitest                           | PASS        | 165 / 165 files; 3,027 / 3,027 tests; Vitest 314.34 seconds; wall 314.51 seconds        |
| Full-suite resource envelope                         | PASS        | RSS 2,402,271,232 bytes; zero swaps and block I/O; 13 workers initially, 1 at the tail  |
| Production build                                     | PASS        | wall 26.83 seconds; RSS 2,637,201,408 bytes; zero swaps and block I/O                   |
| TypeScript                                           | PASS        | `tsc --noEmit`; exit 0; 3.08 seconds                                                    |
| Full ESLint                                          | PASS        | 1,168 files; 0 errors / 157 pre-existing warnings; 26.88 seconds                        |
| Prettier / JXA syntax                                | PASS        | 23 normal files + 2 JXA files; `osacompile` 2 / 2                                       |
| ML stdlib / npm audit                                | PASS        | 58 / 58 in 1.38 seconds; 0 vulnerabilities                                              |
| Evidence JSON / Japanese-English parity              | PASS        | JSON parse and article-parity checks passed                                             |
| Independent final audit                              | PASS        | P0 / P1 / P2 = 0 / 0 / 0                                                                |
| GitHub CI / re-review for the final PR head          | PENDING     | rerun after the evidence-document commit creates the final head                         |
| Regular merge                                        | PENDING     | held until every final-head gate is green                                               |

The launcher test fixture uses only a tracked test helper and disposable child. It does not use the production application root, registry, control namespace, or gate. Its 22 tests do not increment production command, kill-drill, preflight, or gate counts.

A whole-repository Prettier check is not counted as a final gate because it cannot read an existing huge JSONL, its standard parser does not accept an AssemblyScript decorator, and many unrelated files are already unformatted. For the final remediation revision, all 23 normal changed files and both JXA files passed the applicable formatting checks, and both JXA files passed `osacompile`. Full ESLint covered 1,168 files; its 157 warnings are pre-existing, and the error count is zero.

One duplicate full-suite run was intentionally interrupted after 77.10 seconds because the already-running isolated validation was further ahead. It is non-evidence. The final timed isolated run of 165 files and 3,027 tests above supersedes it.

One intermediate full-Vitest observation overlapped heavy build and lint jobs. It reached 162 of 163 files and 2,955 of 2,963 tests, with eight kill-drill failures around arm-stage IPC. A separate run that started in isolation then saw its source tree change and ended with 2 failed files out of 164 and 9 failed tests out of 2,989. Resource contention was initially suspected, but an isolated reproduction later showed a real disposable-fixture regression: the child still used a placeholder registry that was not source-bound V2 and did not return the exact application binding. After updating the fixture to canonical V2 plus a matching exact frozen test binding, an isolated kill-drill diagnostic passed 20 / 20 tests in 70.38 seconds. The two old runs and the pre-commit diagnostic are not final evidence; only the isolated full run at `7223c3d...` counts as final local evidence.

A later full run found eight failures in one file because the legacy offline connector fixture had not been registered in the exact test-stage realm. This was an integration regression in an old test fixture, not a production-connector failure. The fixture now registers an exact four-field synthetic lease and explicitly performs read-only current-EUID / home / ancestor exclusion. Its monitor counts the exact realpath / lstat multiset per fixed leaf and ancestor across nine logical guards and rejects any count other than `9 / 9 / 9 / 9 / 153 / 153 / 54 / 54 = 450`. The offline suite then passed 11 / 11, and the final full suite passed 164 / 164 files and 3,004 / 3,004 tests.

The current offline receipt boundary is now the following. The revision-pinned historical `04f6dad` protocol artifact is not overwritten.

```text
status = complete-fixed-synthetic-three-gate-test-only-contract-composition-with-read-only-home-exclusion
claim_boundary = fixed-synthetic-test-only-approved-enrollment-and-connector-core-contract-composition-for-100-500-24000-gates-with-read-only-current-euid-production-home-exclusion-closed-synthetic-lifecycles-and-pathless-summaries-not-production-filesystem-continuity-dataset-training-live-or-strength-evidence
trust_boundary = trusted-current-process-js-realm-captured-intrinsics-current-euid-userinfo-home-read-only-existing-ancestor-resolution-and-imported-test-only-core-seams-with-fixed-synthetic-metadata-v2
execution_boundary = test-only-fixed-synthetic-read-only-current-euid-home-exclusion-no-production-capability-composition
```

## 10. Every production and playing-strength counter remains zero

For this change, production commands, registry provisions, kill drills, prefix-100 / 500 / final-24000 gates, teacher generation, label finalization, training, optimizer steps, candidate selection or promotion, formal A/B, external calibration, weight overwrite, and live activation all remain 0.

Managed production state such as the registry, control namespace, and evaluator was not freshly read for this change. Only current-EUID home identity metadata was inspected read-only for the test-isolation boundary; no production application or control content was read. The native-launcher test-only fixture is also excluded from production counts. The last-known evidence through PR #479 had runOp1 as both current and rollback evaluator, and this change has modified neither runOp1 nor the live weight. Application provenance is therefore not evidence that the engine became stronger or reached high-dan strength. It is safety infrastructure that makes later strength evidence trustworthy.

## 11. Safe next order

The order remains:

1. commit these evidence documents, run GitHub CI and independent re-review on the resulting final PR head, then integrate this application-source provenance candidate with a regular merge;
2. in the next PR, without preassigning its number, complete operator guards: native exact launch for the standalone approved-current-binding CLI and standalone verifier readiness, without claiming unimplemented reconciliation authority;
3. align the fixed application worktree to this PR's merge revision and the fixed verifier worktree to `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`;
4. provision create-only registry V2 exactly once;
5. run the reviewed disposable kill drill;
6. run a fresh standalone read-only preflight;
7. run prefix-100 exactly once, STOP, obtain independent evidence review and informed human approval;
8. run prefix-500, STOP, review, and obtain another informed human approval;
9. run sealed final-24000, inspect terminal evidence, and finalize training labels;
10. retrain, select candidates, run 192 color-swapped pairs / 384 formal A/B games, then 200 external calibration games; and
11. consider live activation only after every safety, quality, strength, and rollback-rehearsal gate passes.

Any stale, quarantined, or indeterminate state means STOP: no retry and no next gate. A broad prior permission does not substitute for the still-unimplemented reconciliation authority or for evidence-dependent approval after prefixes 100 and 500.

The production manual inspect, quarantine-confirmation, and reconciliation-cancel exports deliberately always reject until a fixed-origin operator entrypoint and policy receive separate review. The existence of a test-only state machine is not production reconciliation authority.

## 12. Current decision

The P1 cause was not the evaluator formula itself. It was an open production-application provenance and pre-production-child launch boundary before teacher generation. Exact implementation revision `9ec2d01...` passed final isolated local validation and independent audit, but fixed-worktree alignment and registry provisioning remain **NO-GO** until GitHub CI, re-review, and regular merge of the final PR head complete.

The [machine-readable evidence](./data/floodgate-v7-production-application-source-provenance-2026-07-16.json) keeps established facts, PENDING work, zero production counters, nonclaims, and stop points separate.
