# Shogi evaluator: why the first local teacher run stopped during preparation

> After PR #511 merged normally, the Mac-local teacher command was invoked for the first time. It returned `STOP`, but it never reached AWS, GCP, Vercel, the network, a teacher engine, a checkpoint, training, or live weights. It stopped while preparing inputs in a home-external clean room because the Git configuration policy was overbroad and its stdout cap was too small. Japanese version: [blog-shogi-floodgate-v7-local-clean-room-teacher-first-run-preparation-stop.md](./blog-shogi-floodgate-v7-local-clean-room-teacher-first-run-preparation-stop.md)

## 1. What happened

The argumentless command copied four input trees by value into the private clean room, then exited with code 1 before independently cloning the verifier repository. Its sanitized failure receipt reported `phase: preparation`, `clean_room_may_exist: true`, and `checkpoint_may_exist: false`.

| Observation                                  |        Result |
| -------------------------------------------- | ------------: |
| Command attempts                             |             1 |
| Successful runs                              |             0 |
| Teacher processes / parents / rows           |     0 / 0 / 0 |
| Checkpoints / labels / training              |     0 / 0 / 0 |
| Network / AWS / Firebase-GCP / Vercel runner | 0 / 0 / 0 / 0 |
| Live-weight changes                          |             0 |

This was neither a playing-strength regression nor a cloud failure. Local input preparation failed closed before the teacher could start.

## 2. Two root causes

The cause was not AWS. It was two boundaries in the local Git checks.

The shared Git repository had 800 local configuration names. The existing policy classified exactly one as forbidden: `http.postBuffer`. That setting only sizes HTTP request buffers. The runner fixes `protocol.allow=never` and `protocol.file.allow=always`, so its clone cannot use anything except `file`; the setting cannot inject credentials, proxies, headers, URLs, or network access into this run.

The policy nevertheless rejected every `http.*` key, so it stopped before cloning. A disposable check after correcting that rule found a second problem: the 1,188,132-byte output of `git rev-list --objects --all --missing=print` exceeded the 1,048,576-byte cap by 139,556 bytes.

## 3. Minimal remediation

The only newly allowed key is the case-insensitive exact name `http.postBuffer`. The runner continues to reject:

- every other `http.*`, including `http.extraHeader`, `http.proxy`, and `http.sslCert`;
- every `https.*`;
- credential helpers, remote proxies, and SSH commands;
- filters and include / includeIf controls;
- URL rewrites; and
- partial-clone, promisor, and lazy-object controls.

The Git stdout cap changes from 1 MiB to 64 MiB (67,108,864 bytes). This remains bounded and matches the existing strict Git verifier.

## 4. Validation against the real source

After the fix, the same accepted verifier source was actually cloned with `--no-local` into a separate temporary private root. Full fsck, missing-object checks, exact revision, clean status, and source / destination non-alias checks over all 1,431 tracked files passed. The temporary copy was removed after validation.

Focused Vitest passed 21 / 21 tests across two files; ESLint, Prettier, and diff check also passed. These results validate the preparation remediation. They do not establish a successful teacher run or stronger play.

## 5. Residual clean-room handling

The failure receipt requires manual reconciliation, so the residual root is not deleted automatically. A read-only audit found a current-user-owned `0700` fixed root, zero symlinks, zero multi-link regular files, and zero entries owned by another user. The publication, state, runtime-snapshot, and verifier-destination namespaces are empty, and no checkpoint exists.

After review and CI pass for the remediation, the same facts will be rechecked and only the fixed residual root will be removed. The same argumentless local command will then run again from a fresh root. Live weights remain unchanged.

## 6. PR review and CI

The remediation was published as ready PR #512. Independent exact review of commit `59c7712f` / tree `d73bc162` found P0 / P1 / P2 = 0 / 0 / 0. The two GitHub review comments asked the evidence test to remove its `process.cwd()` dependency and reuse the same hermetic Git helper. Commit `5eefa61d` addressed both; 31 / 31 tests passed normally, 4 / 4 also passed when launched from `/private/tmp`, and both threads received replies and were resolved.

CI run `29678783495` passed 12 / 12 jobs for that HEAD. Across the PR, 15 / 15 checks passed including Security Audit and Vercel. This is a source gate for the remediation and evidence; it is not evidence of a successful teacher run, retraining, or stronger play.

Machine-readable evidence: [floodgate-v7-local-clean-room-teacher-first-run-preparation-stop-2026-07-19.json](./data/floodgate-v7-local-clean-room-teacher-first-run-preparation-stop-2026-07-19.json)
