# Persisting a test-only opaque plan without destructive repair — Floodgate v7 training-label finalizer core

> Pure projection and sealed-work visitation do not yet finalize training rows as a resumable private dataset. This change adds an inner core that exact-prefix persists a test-only opaque plan as `train.jsonl`, `result.json`, and `manifest.json`, publishes the private directory exclusively, and re-audits the destination. It does not establish V3 work origin, a production two-pass plan mint, the common outer lock, a real 24,000-parent run, training, a weight, match results, or playing strength. Japanese version: [blog-shogi-floodgate-v7-training-label-finalizer-core.md](./blog-shogi-floodgate-v7-training-label-finalizer-core.md)

---

## 1. A durable-output gap remains after projection and visitation

The #475 projection deterministically converts one completed-parent value into training rows, but does not authenticate input origin. The #476 visitor can observe an entry validated inside the held-FD scanner, but may run before the seal and terminal snapshot checks. Its event is provisional, not output authority.

This change closes only the inner persistence lifecycle after those boundaries. The test factory deep-captures a tiny synthetic projection set to mint test-only plan authority, but the finalizer accepts no caller-supplied rows, serialized output bytes, paths, or replay callbacks as plan or payload authority. A trusted test-only write seam can only bound the module-owned positional write and inject failure; it cannot supply output bytes or authority. Factory input is not production authority.

## 2. The opaque plan is test-only authority

The module registers a plan capability by exact object identity in a private `WeakMap`. Its public facade contains only fixed contract, status, claim-boundary, and test-execution-boundary fields. It exposes no row, byte buffer, path, file handle, key, or replay callback. Only the private plan holds a restartable async replay driver and expected summary. Spread clones, Proxies, different objects, and second claims are rejected.

This remains a test-only capability that trusts the current process and JavaScript realm. It does not mean V3 HMAC origin, production authority, cross-process restoration, or resistance to hostile same-process mutation.

## 3. A deterministic four-file lifecycle is fixed

Only four entries participate in the authorized stage.

| Order | File            | Role                                                                                  |
| ----: | --------------- | ------------------------------------------------------------------------------------- |
|     1 | `work.jsonl`    | source byte snapshot pinned by the synthetic plan                                     |
|     2 | `train.jsonl`   | canonical sibling training rows                                                       |
|     3 | `result.json`   | authenticated plan, work, train, teacher-run binding, and consumer-postflight summary |
|     4 | `manifest.json` | final commit marker for the complete content set                                      |

The training binding's parent-ID-set commitment, a teacher-run-binding digest, and the stage parent/stage device and inode plus stage/destination basenames are bound into result and manifest. Retry-varying lease identity, absolute paths, timestamps, and callbacks are excluded from deterministic payloads. A fresh lease can resume the same input to the same bytes. In #477, the teacher-run-binding value is synthetic plan input, not authenticated V3 origin.

## 4. Exactly four initial states are accepted

Writing `W=work`, `T=train`, `R=result`, and `M=manifest`, automatic handling accepts only `{W}`, `{W,T}`, `{W,T,R}`, and `{W,T,R,M}`.

If a successor exists, every predecessor must already equal its complete expected bytes. A partial train beside a result is never “repaired” by appending to train. Missing or skipped predecessors, `val.jsonl`, unknown or temporary entries, and any extra file are preserved for manual reconciliation.

## 5. Resume writes only an exact-prefix continuation

An existing file is resumable only when it is an owner-only regular single-link file, no longer than the expected payload, and byte-for-byte equal to its exact prefix. Writes are bounded and positional at the current offset; short writes continue with the remainder. Zero progress, a missing or duplicated native write, negative or non-finite reports, and over-reporting fail closed.

The finalizer never truncates, unlinks, or rename-overwrites an existing file. A one-byte mismatch, oversized file, symlink, hardlink, wrong mode or owner, or directory is left untouched.

## 6. Result and manifest keys are separated

The 32-byte caller root key is copied into owned memory. With the run ID as salt, distinct HKDF info strings derive distinct result and manifest keys, and each artifact uses a distinct HMAC domain.

```text
result key info:   shogi-floodgate-v7-training-label-result-key-v1\0
manifest key info: shogi-floodgate-v7-training-label-manifest-key-v1\0
result MAC domain: shogi-floodgate-v7-training-label-result-mac-v1\0
manifest domain:   shogi-floodgate-v7-training-label-manifest-mac-v1\0
```

Owned root, result, and manifest keys are zeroized on success, pre-publication failure, post-publication failure, and observer failure; the caller key remains unchanged. This does not claim resistance to compromise of the shared root key or anti-rollback.

## 7. The manifest is the final content commit marker

The order is train write, file data sync, reread/hash, stage-directory sync; then result; then manifest last. `train.jsonl` has no independent MAC. Its exact byte count, SHA-256, row count, and parent summary are bound into both result and manifest.

Train and result must be exact complete and directory-synced before manifest creation. If a manifest exists only as an exact prefix, only that manifest may resume. The marker establishes content completeness in this key model, not teacher truth or future immutability.

## 8. Source and destination audits close publication

Before artifact creation and again immediately before publication, the core checks the plan-bound parent/stage identities and basenames, held-stage versus pathname identity, and held-work versus pathname identity, including device/inode, owner, mode, link count, size, snapshot, and SHA-256. Lease identity itself is excluded from the deterministic plan. It commits the existing exclusive private-directory publication transaction only when the exact four entries and all expected held bytes remain intact.

After publication it reopens the destination directory, matches the published identity and exact four entries, and reopens every file to recheck identity, size, hash, and bytes. Success covers this point-in-time audit only. It is not internet publication, future immutability, anti-rollback, exactly-once delivery, or same-EUID/root resistance.

## 9. Failure phases and retry dispositions are explicit

Failures are classified across authority transfer, plan claim, postflight claim, cross-binding, source preflight, train/result/manifest persistence, source revalidation, publication, destination revalidation, and cleanup. Test failpoints cover created, written, file-data-synced, directory-synced, source-reopened/reverified, immediately before publication, and immediately before destination reopen/revalidation.

A separate failure boolean prevents `throw undefined` from being mistaken for success. A safe pre-publication exact prefix may resume with fresh authority. Unsafe content requires manual content reconciliation. If unsafe mode or link metadata also makes the transaction abort reject stage inspection, so the lease cannot be removed safely, both content and lease require manual reconciliation. Ambiguity after rename requires manual publication and/or lease reconciliation.

## 10. Threat matrix and trust assumptions

| Condition                          | Handling in this core                                 | Remaining boundary                          |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| interruption after an exact prefix | continue positionally on the same inode               | actual process-kill and power-loss evidence |
| mismatch, oversize, unsafe inode   | preserve and require manual handling                  | operator reconciliation                     |
| cloned, proxied, or reused plan    | reject by exact WeakMap authority                     | production plan registry                    |
| source or destination replacement  | reject through pathname/held identity and hash audits | future mutation and same-EUID/root          |
| result/manifest key confusion      | distinct HKDF info and MAC domains                    | root-key compromise                         |
| hostile test hook or realm         | trust the current test realm                          | hostile same-process resistance             |

## 11. Synthetic validation and production zero are recorded separately

Focused tests use a tiny synthetic plan with one ordinary and one forced parent. They never repeat the 24,000-parent scan. Tests really create train/result/manifest files and a temporary private publication, so synthetic output is nonzero. In contrast, production finalizer invocations, production output, real Floodgate reads, teacher generation, training, optimizer steps, candidate weights, live activation, formal A/B, and external calibration caused by this change are all zero. The validation candidate is `311c0a8a79b413336a0d46f2179257a968a639bb`.

| Validation        | Result                  | Wall s | Maximum RSS bytes | Swaps |
| ----------------- | ----------------------- | -----: | ----------------: | ----: |
| focused finalizer | 1 file / 22 tests pass  |  12.85 |         302776320 |     0 |
| related contracts | 3 files / 20 tests pass |   0.95 |         270450688 |     0 |
| TypeScript        | exit 0                  |   2.40 |        1127546880 |     0 |
| Prettier          | 7 files all matched     |   0.89 |         225853440 |     0 |
| full ESLint       | 0 errors / 157 warnings |  26.72 |        2268020736 |     0 |
| full Vitest       | 155 files / 2,852 tests |  98.48 |        2433712128 |     0 |
| production build  | 193 / 193 static pages  |  26.83 |        2620227584 |     0 |
| ML stdlib         | 58 / 58 tests           |   0.52 |          63979520 |     0 |
| npm audit high+   | 0 vulnerabilities       |   0.96 |         132186112 |     0 |

The first full Vitest attempt passed 2,850 of 2,852 tests. The new 18-event failpoint matrix exceeded the default five-second test timeout under full-suite load, so an explicit 30-second budget was added without weakening any assertion. The other failure was a transient retry-disposition mismatch in an unrelated pre-existing stable-resume test; its isolated rerun passed 1/1. The final candidate then passed the full suite 2,852/2,852. Machine evidence retains the initial failure and isolated rerun instead of hiding them.

Machine evidence records commands, pass/fail counts, wall time, maximum RSS, and swaps. GitHub CI, PR, and review fields remain `PENDING` / `null` until observed. Failpoints are interruption simulations, not actual kill drills or hardware power-loss tests.

## 12. Production two-pass composition comes next

#478 must retain the common outer lock and acquire a fresh active stage lease plus opaque V3 scan-key authority before pass one. Pass one runs without a visitor. Pass two scans the same held identity and snapshot with the visitor, and a production opaque plan may be minted only after the second enclosing scan, seal, tail, snapshot, and pathname confirmation all succeed.

#478 must extract a module-private persistence runner in the same module. Separate test and production adapters call it from distinct WeakMaps, claims, postflights, publication authorities, and key authorities. The production adapter must never enter the exported `...CoreForTests` function or any test registry. A production-minted plan combines only with the current production consumer postflight, separate result/manifest key authority, and the held stage publication transaction.

The transaction retains its lease through its own destination reconciliation, then makes lease removal and the parent sync durable before `commit` returns. Only the still-held common outer lock authorizes the later finalizer content audit. All keys are zeroized after the final work verification and content audit, and that outer lock is released last. The owner/CLI and real final-24000 success path remain later work. Formal acceptance still requires 192 color-swapped pairs / 384 games and 200 external-calibration games. Until then, this core is not evidence of a real dataset, training, a weight, Elo, rank, or stable high-dan strength.
