# Fixing the production launcher stopped by JXA NSNumber conversion — Floodgate v7

> **Subsequent result (2026-07-16):** PR #483 passed every check and was integrated with regular merge commit `9ddcc032329a4a9f3931494f2348c10d9fe2d696`. Fresh readiness, create-only registry provisioning, the kill drill, and preflight also passed, but the first exactly-once prefix-100 attempt stopped after 1,597 seconds without a success receipt. An independent read-only audit found a partial checkpoint containing three authenticated parent records and a stale active lease; no retry or live-weight change was performed. The current STOP decision and safe next steps are recorded in the [follow-up](./blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.en.md). The remainder of this article is retained as a point-in-time history of the launcher fix.

> [PR #482](https://github.com/gomyway1216/nextjs-portfolio/pull/482) passed all six GitHub checks and was integrated with regular merge commit `52d73dd5a82de2ca508da2aee664326c47acc5d2`. After aligning the fixed production application to that merge, the first readiness run stopped in the native launcher before authorization with exit 70. The cause was conversion of a Foundation `NSNumber` by passing it directly to JXA `Number(...)`. The fix is pinned to exact commit `49e93e8284c3b3fc24fe6eadee1b7c327d95eb5a`; it requires both JavaScript number type and safe-integer validity after `ObjC.unwrap(...)` for file permissions, the PID, and task status. Local validation, including the full 3,058-test suite, and independent audit pass. The fix is now published as review-ready [PR #483](https://github.com/gomyway1216/nextjs-portfolio/pull/483), while final-head GitHub CI and regular merge remain PENDING. Production remains **STOPPED**; registry, teacher, training, weight, and live evaluation have not changed. Japanese version: [blog-shogi-floodgate-v7-production-native-launcher-nsnumber-fix.md](./blog-shogi-floodgate-v7-production-native-launcher-nsnumber-fix.md)

## 1. Result

The evaluator and the application-source readiness core did not fail. The failure occurred in the native launcher's pre-authorization checks after macOS JXA read a POSIX permission from a Foundation object and applied `Number(...)` directly to its `NSNumber` wrapper.

A minimal diagnostic on this host separated the two behaviors:

```text
Number(NSFilePosixPermissions NSNumber)          -> NaN
Number(ObjC.unwrap(NSFilePosixPermissions value)) -> 493
```

The value 493 is the target file's exact mode represented as a safe integer. The original launcher rejected the first result as non-integer, so it failed closed as designed and returned only the fixed sanitized message and exit 70. It had not yet decided that the source was dirty, that owner or mode was wrong, or that the approved-key binding differed.

The fix candidate adds an `integerValue` helper that explicitly unwraps a Foundation numeric wrapper before enforcing `Number.isSafeInteger`, then uses the same boundary for permissions, the parent PID, and child termination status. It also adds a Darwin runtime regression that reads an actual Foundation file attribute. Creating the candidate is not the same as passing final delivery gates. Production will not advance until the fix PR and its validation results are settled.

## 2. Preparation performed after the #482 merge

| Step                                        | Result            | Boundary                                                           |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------------ |
| operator-readiness PR                       | PASS / MERGED     | #482, six of six GitHub checks, regular merge `52d73dd5...`        |
| fixed production application worktree       | CREATED / ALIGNED | initially absent, then created at detached HEAD `52d73dd5...`      |
| fixed connector verifier                    | ALIGNED           | moved from `b086243` to `e8a9197608cb48b1160b6707d97b0c4f78f90a1d` |
| application dependencies                    | INSTALLED         | Node `v22.13.0`, npm `11.14.1`, `npm ci --ignore-scripts`          |
| source readiness through npm                | STOPPED           | before authorization, exit 70                                      |
| source readiness through direct `osascript` | STOPPED           | same pre-authorization exit 70                                     |

Creating the fixed worktree, aligning revisions, and installing dependencies were preparations needed to make readiness runnable. `npm ci --ignore-scripts` did not run installation scripts, but it does not prove a complete byte closure over ignored or untracked dependencies.

Direct `osascript` produced the same exit 70 after removing the npm wrapper, so npm exit-code translation or package-script routing alone could not explain the failure. Diagnosis inside the launcher narrowed it to Foundation numeric conversion: only the wrapped conversion became `NaN`, while the unwrapped conversion produced exact mode 493.

## 3. What fail-closed behavior protected

Both readiness attempts stopped before attested child authorization. The failure therefore did not execute any of the following:

- application-source authorization or capability issuance;
- registry creation, adoption, overwrite, or rotation;
- use of approved/current binding as authority;
- control namespace, durable lease, quarantine, or reconciliation mutation;
- gate, checkpoint, teacher generation, or label finalization;
- training, optimizer step, candidate selection, formal A/B, or external calibration; or
- production weight overwrite or live activation.

This does not show that production was GO. It shows the opposite safety property: when numeric interpretation could not be established, the launcher stopped without issuing downstream authority.

## 4. Root cause and fix boundary

In JXA, an Objective-C bridge object may resemble a JavaScript primitive without supporting the expected direct JavaScript conversion. On this host, direct conversion of the Foundation `NSNumber` obtained from `NSFilePosixPermissions` produced `NaN`. Removing the bridge with `ObjC.unwrap(...)` allowed conversion to exact integer 493.

The candidate `integerValue` helper performs one shared sequence:

```text
Foundation numeric value
  -> ObjC.unwrap
  -> require JavaScript number type
  -> Number.isSafeInteger
  -> integer, or fail closed before authorization
```

It is applied to:

1. the POSIX permission used for native tool and helper owner/mode checks;
2. the current-process PID used in live-parent verification; and
3. the termination status used to evaluate the child task.

The Darwin runtime regression checks more than the presence of an `unwrap` string in source. It reads a file attribute through Foundation and verifies that the unwrapped permission is a safe integer equal to the filesystem mode. It also rejects a numeric string, a boolean, and `NSNull`, preventing JavaScript numeric coercion from accepting an abnormal type as zero. That reproduces both the host behavior and the fail-closed type boundary behind this finding.

The fix does not add native-tool byte closure, an atomic process-lineage snapshot, isolation from a hostile same-UID or ancestor process, or ignored-dependency closure. It does not issue readiness success, registry authority, reconciliation authority, or playing-strength evidence.

## 5. Sanitized read-only state audit

After the stop, a read-only inventory that excluded private values established only the following state:

| State                 | Metadata-safe observation |
| --------------------- | ------------------------- |
| production registry   | absent                    |
| human-approved record | present                   |
| current key           | present                   |
| control state         | absent                    |
| active lease          | absent                    |
| quarantine state      | absent                    |
| indeterminate state   | absent                    |

The inventory discloses no path, numeric user identity, key identity, digest, or private record value. The presence of both an approved record and a current key does not mean that their exact eight-field binding freshly passed. The native launcher stopped before that check, so the current operational decision is **NOT GO / STOP**.

An absent registry is not authority to create one. Create-only provisioning remains blocked until a post-fix fresh invocation verifies the fixed application source, fixed verifier, and approved/current binding in order, and the provisioner rechecks those same conditions itself.

## 6. Current fix-delivery status

| Gate / check                       | State   | Exact result                                                                               |
| ---------------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| host root-cause diagnostic         | PROVED  | direct wrapper conversion is `NaN`; unwrapped result is exact 493                          |
| exact fix commit                   | PASS    | `49e93e8284c3b3fc24fe6eadee1b7c327d95eb5a`                                                 |
| Darwin launcher regression         | PASS    | 1 file / 23 tests; real Foundation mode, PID, and `/usr/bin/true` termination status       |
| full Vitest                        | PASS    | 166 / 166 files, 3,058 / 3,058 tests, 337.77 s, wall 338.24 s, max RSS 2,348,466,176 bytes |
| production build                   | PASS    | 193 / 193 pages, wall 38.26 s, max RSS 2,565,996,544 bytes, zero swap / block I/O          |
| TypeScript / full ESLint           | PASS    | 3.65 s / zero errors, 157 existing warnings, 28.40 s                                       |
| ML stdlib / npm audit              | PASS    | 58 / 58, 0.42 s / zero vulnerabilities, 0.56 s                                             |
| Prettier / JXA syntax              | PASS    | changed files / `osacompile -l JavaScript`                                                 |
| independent final audit            | PASS    | P0 / P1 / P2 = 0 / 0 / 0                                                                   |
| fix pull request                   | OPEN    | review-ready [#483](https://github.com/gomyway1216/nextjs-portfolio/pull/483)              |
| final-head GitHub CI / review      | PENDING | not claimed complete                                                                       |
| regular merge                      | PENDING | only after all gates pass                                                                  |
| production application realignment | BLOCKED | waits for this fix PR's own merge commit                                                   |
| fresh production readiness         | BLOCKED | waits for merge and realignment                                                            |

PR #482's six checks and merge are evidence for the operator-readiness delivery. They are not reused as CI evidence for the later NSNumber fix candidate.

## 7. Production and playing-strength impact

The production-side changes made here were limited to creating the fixed application worktree and aligning it to the #482 merge, aligning the fixed verifier to its already approved revision, and installing application dependencies. The live evaluator, runOp1, weights, teacher data, and training state did not change.

There were zero successful source-readiness checks and zero registry provisions, kill drills, prefix-100 / 500 / final-24000 runs, teacher-generation runs, training runs, candidate promotions, formal A/B games, external-calibration games, or live activations. Playing strength is therefore not evaluated, with no claim that the evaluator became stronger or reached stable high-dan strength.

## 8. Safe next order

1. Pass every final-head GitHub CI check and review on [PR #483](https://github.com/gomyway1216/nextjs-portfolio/pull/483), then integrate it with a regular merge.
2. Realign the fixed production application worktree to **this fix PR's own merge commit**.
3. Freshly confirm that the fixed verifier is at `e8a9197608cb48b1160b6707d97b0c4f78f90a1d`.
4. Run fresh standalone application-source readiness.
5. Run fresh standalone connector-verifier readiness.
6. Run fresh standalone approved/current-binding readiness.
7. Only if all three succeed, have the provisioner freshly recheck them and create-only provision registry V2.
8. Continue to preserve the stop gates for the kill drill, prefix-100 preflight, and prefix-100 exactly once.
9. Consider live activation only after teacher generation, retraining, candidate selection, formal A/B, and external calibration establish all safety, quality, strength, and rollback evidence.

Any failed, stale, quarantined, or indeterminate fresh check means STOP. There is no automatic repair, adoption, overwrite, rotation, retry, or progression to the next gate.

## 9. Current decision

The NSNumber root cause is reproduced, the fix is pinned to an exact commit, and full local validation plus independent audit pass. PR #483 is published ready for review, while final-head CI and regular merge remain unsettled. The sanitized audit found no dangerous control, lease, quarantine, or indeterminate state, but that is not GO evidence.

The current decision is therefore **STOP**. The next valid advance is to regularly merge the launcher fix, repin the application to that merge revision, and freshly pass source, verifier, and approved/current-binding readiness. The [machine-readable evidence](./data/floodgate-v7-production-native-launcher-nsnumber-fix-2026-07-16.json) likewise separates established #482 facts, completed preparation, stopped readiness attempts, sanitized state, and the unresolved fix delivery.
