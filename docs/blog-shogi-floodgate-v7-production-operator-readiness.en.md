# Verifying production operator readiness with standalone CLIs — Floodgate v7

> [PR #481](https://github.com/gomyway1216/nextjs-portfolio/pull/481) integrated the production application-source provenance foundation with regular merge commit `67ccd9b8c49392132fdffaa625468ac1d128a5d5`. Building on that foundation, this candidate adds standalone approved/current-binding and fixed-verifier readiness checks to the native exact-launch boundary, expanding the production evidence launcher to exactly ten purposes. [PR #482](https://github.com/gomyway1216/nextjs-portfolio/pull/482) is open and ready for review, but it is not merged and final-head GitHub CI / review remain PENDING. Post-merge revision alignment, production commands, registry provisioning, teacher generation, retraining, candidate selection, formal A/B, external calibration, and live activation have not run. Japanese version: [blog-shogi-floodgate-v7-production-operator-readiness.md](./blog-shogi-floodgate-v7-production-operator-readiness.md)

## 1. Result

PR #481 established the foundation for fixing which application source creates production evidence. Before safely creating the registry, however, an operator also needs fresh, independent, read-only checks of two conditions:

- the fixed connector-verifier revision, tracked source closure, and pinned receipt closure agree; and
- the human-approved deployment-key record exactly matches a fresh inspection of the current key across the eight binding fields.

This candidate exposes those observations as standalone CLIs under the same native launcher, fixed application entrypoint, and redacted receipt boundaries as the existing eight purposes. A readiness success is a point-in-time read-only observation. It is not registry, gate, reconciliation, teacher, training, or live-activation authority.

The candidate is not merged. Aligning the fixed production application worktree only to PR #481's merge commit would not provide the two new CLIs. Production remains explicitly **NO-GO** until the operator-readiness PR is regularly merged and the worktree is aligned to **that operator-readiness PR's own merge commit**.

## 2. Exactly ten native-launcher purposes

The tracked JXA launcher and Node-side attestation share an exact purpose-to-entrypoint bijection. An operator may select one of the ten allowlisted purposes, but cannot supply an unlisted purpose or a caller-selected entrypoint decoupled from that purpose.

| Class                        | Purpose                              | Fixed entrypoint                                                     |
| ---------------------------- | ------------------------------------ | -------------------------------------------------------------------- |
| read-only                    | `application-source-readiness`       | `ml/inspect-floodgate-v7-production-application-source.ts`           |
| read-only                    | `approved-current-binding-readiness` | `ml/inspect-floodgate-v7-approved-key-current-binding.ts`            |
| read-only                    | `connector-verifier-readiness`       | `ml/inspect-floodgate-v7-production-connector-verifier-readiness.ts` |
| read-only                    | `prefix-100-read-only-preflight`     | `ml/inspect-floodgate-v7-production-prefix-100-preflight.ts`         |
| disposable safety drill      | `prefix-100-disposable-kill-drill`   | `ml/run-floodgate-v7-production-prefix-100-kill-drill.ts`            |
| mutation-capable             | `durable-prefix-100`                 | `ml/run-floodgate-v7-production-connector-prefix-100.ts`             |
| mutation-capable             | `durable-prefix-500`                 | `ml/run-floodgate-v7-production-connector-prefix-500.ts`             |
| mutation-capable             | `sealed-final-24000`                 | `ml/run-floodgate-v7-production-connector-final-24000.ts`            |
| mutation-capable             | `training-label-finalization-24000`  | `ml/run-floodgate-v7-training-label-production.ts`                   |
| create-only mutation-capable | `production-registry-provision`      | `ml/provision-floodgate-v7-production-connector-registry.ts`         |

The total is five mutation-capable commands, four read-only commands, and one disposable safety drill. The launcher fixes Node `v22.13.0`, `-r tsx/cjs`, the exact entrypoint, zero operator arguments, and a minimal child environment. It does not claim native-tool byte-digest closure, an atomic process-lineage snapshot, or complete isolation from a hostile same-UID or ancestor process.

## 3. Order before loading a core

JXA is evaluated before the attested production child Node exists and creates that child's minimal environment and one-shot attestation pipe. Inside the child, each standalone operator CLI follows this fixed order:

```text
check the required Node version and argumentless argv
  -> claim the exact purpose/entrypoint native-launcher attestation once
  -> check the fixed production application entrypoint context
  -> only then lazy-load the readiness core module
  -> check the core receipt against an exact allowlist
  -> rebuild public success or failure from a fixed schema
```

The readiness core therefore has no route that evaluates before launcher attestation and application entrypoint context. Direct Node, a different purpose, a different entrypoint, an extra argument, a different Node version, or attestation reuse fails closed.

This is specifically a pre-readiness-core load boundary. It does not classify npm or an invoking ancestor process as the trusted application child. The invoking shell, npm, and `osascript` may observe the caller environment before the clean child is created; the guarantee applies to the attested child environment newly assembled by JXA. The two new operator checks build on PR #481's native pre-child boundary and application-source foundation.

## 4. Strict success/failure projection and privacy

Neither CLI serializes a core-returned object directly. It rejects proxies, accessors, extra or missing keys, unexpected prototypes, altered constants, and incorrect booleans. Even on success, it constructs a new public receipt solely from known values.

A successful `approved-current-binding-readiness` receipt says that the approved record was validated, the current key was freshly inspected, the exact binding matched, held descriptors were revalidated, and comparison remained in memory. It does not say that approval-record or key content was created or rewritten or that a namespace entry changed, nor does it issue a single-use capability, run / stage / connector / checkpoint authority, dataset, teacher label, training, weight, match, or playing-strength evidence. Access-time invariance from reads remains a separate nonclaim.

A successful `connector-verifier-readiness` receipt says that the repository root derived from the fixed current-EUID home, fixed verifier revision, pinned receipt Git closure, and closure receipt were checked read-only. It does not say that external role-bundle files were read or that the full verifier ran, and it issues no gate / registry / connector authority.

Failure collapses to a fixed sanitized receipt and nonzero exit. Output contains no raw exception, path, Git revision, digest, numeric EUID, home directory, key identity material, or private registry value. Neither success nor failure mutates production-managed namespace or file content or performs reconciliation, and neither issues reconciliation authority. It does not claim that reads leave access times unchanged.

Both success and failure receipts also fix `reconciliation_performed`, `reconciliation_authority`, `ignored_untracked_dependency_bytes_verified`, `same_uid_race_isolation`, `atomic_source_snapshot`, `tool_byte_closure_verified`, `atomic_process_lineage_snapshot`, `same_uid_or_ancestor_hostile_process_isolation`, `production_managed_namespace_or_file_content_mutation_performed`, and `atime_invariance` to `false`. A readiness success therefore cannot be broadened into a claim of byte closure over ignored dependencies, an atomic snapshot, isolation from a same-UID or ancestor adversary, or access-time invariance.

## 5. Reconciliation authority deliberately remains unavailable

This candidate does not implement reconciliation. Existing production manual-inspection, quarantine-confirmation, and reconciliation-cancel exports continue to always reject until a fixed-origin operator entrypoint and policy receive separate review. A test-only state machine is not production authority.

A stale, quarantined, or indeterminate production state found through a readiness failure means **STOP**. There is no automatic repair, deletion, overwrite, adoption, rotation, retry, or progression to the next gate. Prior blanket permission does not substitute for the unimplemented reconciliation authority.

## 6. Validation and delivery status

The operator-readiness implementation is fixed at exact commit `947f6e547039a62c17d74e08d1102af26dc46903`. The local validation below ran against that implementation commit. This article and its JSON belong to a later evidence commit and are not part of the measured implementation revision. PR #482 is open and ready for review, but GitHub CI, review, and regular merge for the final head that includes this PR-state evidence update remain PENDING.

| Gate / check                           | State   | Exact result                                                                                      |
| -------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| PR #481 application-source foundation  | MERGED  | regular merge `67ccd9b8...`                                                                       |
| operator-readiness implementation      | PASS    | `947f6e547039a62c17d74e08d1102af26dc46903`                                                        |
| focused launcher + two standalone CLIs | PASS    | 3 files / 57 tests                                                                                |
| full Vitest                            | PASS    | 166 / 166 files, 3,057 / 3,057 tests, Vitest 319.41 s, wall 319.81 s, max RSS 2,376,368,128 bytes |
| full-suite resource boundary           | PASS    | 8 workers, zero swaps, zero block input / output                                                  |
| production build                       | PASS    | wall 27.59 s, max RSS 2,641,051,648 bytes, zero swap / block I/O                                  |
| TypeScript                             | PASS    | `tsc --noEmit`, wall 2.85 s, max RSS 1,146,142,720 bytes                                          |
| full ESLint                            | PASS    | zero errors, 157 existing warnings, wall 27.27 s, max RSS 2,041,626,624 bytes                     |
| ML stdlib / npm audit                  | PASS    | 58 / 58 tests, wall 0.48 s / zero vulnerabilities, wall 0.52 s                                    |
| Prettier / JXA syntax / JSON           | PASS    | changed files, `osacompile -l JavaScript`, JSON parse / ten-purpose mapping parity                |
| independent final audit                | PASS    | P0 / P1 / P2 = 0 / 0 / 0                                                                          |
| operator-readiness PR                  | OPEN    | [#482](https://github.com/gomyway1216/nextjs-portfolio/pull/482), ready for review                |
| final-head GitHub CI / review          | PENDING | evaluate after pushing this PR-state evidence update                                              |
| regular merge                          | PENDING | only after every final-head gate passes                                                           |
| production alignment / commands        | BLOCKED | NO-GO before merge and fresh checks                                                               |

The build completed with exit zero. Existing diagnostics about build-time Firebase initialization suppression and dynamic-route fallback appeared, while compilation, TypeScript, all 193 generated pages, and final optimization completed. The full lint's 157 findings were existing warnings; errors remained zero.

## 7. Production and playing-strength counters

This candidate has executed zero production application alignments, verifier alignments, source-readiness checks, verifier-readiness checks, approved/current-binding checks, registry provisions, kill drills, prefix-100 / 500 / final-24000 gates, teacher-generation runs, label finalizations, training runs, optimizer steps, candidate selections or promotions, formal A/B games, external-calibration games, weight overwrites, or live activations.

Production managed state was not freshly observed for this article. It changed neither the live weight nor runOp1. This is a boundary for safely obtaining operator evidence, not evidence that the evaluator became stronger or reached stable high-dan strength.

## 8. Safe order after merge

1. pin the operator-readiness candidate to an exact commit, pass integrated local validation, GitHub CI, and independent review, and integrate it with a regular merge;
2. align the fixed production application worktree to **this operator-readiness PR's own merge commit**;
3. align the fixed verifier worktree to `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`;
4. run fresh standalone application-source readiness;
5. run fresh standalone connector-verifier readiness;
6. run fresh standalone approved/current-binding readiness;
7. have the provisioner freshly recheck source, verifier, and approved/current binding, then create-only provision registry V2 within that same fail-closed invocation;
8. run the reviewed disposable kill drill and then a fresh read-only prefix-100 preflight;
9. run prefix-100 exactly once, STOP, and wait for independent evidence review and informed human approval;
10. continue through prefix-500, sealed final-24000, label finalization, retraining, candidate selection, formal A/B, and external calibration, retaining each stop gate; and
11. consider live activation only after every safety, quality, playing-strength, and rollback-rehearsal item has evidence.

No standalone readiness receipt is reusable as future authority. The provisioner's fresh rechecks and its refusal to adopt, overwrite, or rotate an existing registry are part of the create-only boundary.

## 9. Current decision

PR #481's source foundation is merged, but the operator-readiness candidate is not. Production alignment and create-only provisioning are therefore **NO-GO**, and playing strength is **not evaluated**. The concrete improvement is the ability to obtain independent, redacted, read-only evidence that the application, verifier, and approved/current key binding are correct before teacher generation starts.

The [machine-readable evidence](./data/floodgate-v7-production-operator-readiness-2026-07-16.json) separates the established PR #481 foundation, unresolved current delivery, ten-purpose mapping, zero counters, nonclaims, and post-merge order.
