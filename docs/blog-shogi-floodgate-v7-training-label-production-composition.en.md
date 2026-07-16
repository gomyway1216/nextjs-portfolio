# Minting a production plan only after held-work preflight and two authenticated scans — Floodgate v7 training-label production composition

> #477 established exact-prefix persistence for a test-only opaque plan, but did not provide an authority path from authenticated V3 work to a production plan. Under a contract that the caller already holds the common outer lock, this boundary performs an unkeyed preflight of the same held `work.jsonl`, internally obtains a scan key from those measured facts, and then authenticates the file twice. It permits a production opaque plan only after the second enclosing scan succeeds completely. It adds a production entry point, but does not add the fixed owner / CLI that proves outer-lock ownership, invoke the fixed current-user operation, finalize a real 24,000-parent dataset, train, create a weight, run A/B or external calibration, or change the live evaluator. Japanese version: [blog-shogi-floodgate-v7-training-label-production-composition.md](./blog-shogi-floodgate-v7-training-label-production-composition.md)

---

## 1. The test-only #477 plan could not close production origin

#477's private persistence runner verified the exact-prefix state machine for `work.jsonl`, `train.jsonl`, `result.json`, and `manifest.json`, plus the post-publication content audit. Its plan, however, came from a test factory supplied with tiny synthetic projections. It did not bind V3 HMAC, seal, tail, full snapshot, and pathname confirmation into production authority.

This change closes that preceding production composition boundary. It adds a production code path but does not run the fixed current-user production operation. It neither reads nor mutates the production namespace and does not change real Floodgate games, teacher labels, the optimizer, candidate weights, matches, or live `runOp1`.

## 2. Test and production enter one private runner from separate registries

Test plans and production plans live in separate module-private `WeakMap` registries. Each opaque facade is claimed once by exact object identity; clones, Proxies, other objects, and second claims are rejected.

| Authority                    | Test boundary             | Production boundary            |
| ---------------------------- | ------------------------- | ------------------------------ |
| sealed replay / scan session | injected test registry    | fixed production registry      |
| opaque plan                  | test plan registry        | production plan registry       |
| consumer postflight          | `...CoreForTests` claim   | current production claim       |
| stage publication            | injected test transaction | production transaction         |
| output key                   | injected owned copy       | fixed deployment-key authority |

The test and production adapters share only a module-private persistence runner. The production adapter never enters an exported `...CoreForTests` function, a test plan registry, an injected publication seam, or a caller-supplied root key. Its facade exposes no row, byte, path, file descriptor, key, or callback.

Scanner entry claims fresh consumer input synchronously before its first `await` and also transfers ownership of the active stage-authorization lease into the scanner synchronously. A microtask or delayed callback cannot claim the input or reuse the lease later, and cannot mint postflight or plan authority.

The caller does not prepare a scan-key authorization and pass it in early. The scanner opens the held stage and work, completes an unkeyed full-file preflight, constructs the request internally with the measured byte count and SHA-256 plus the run, stage, and gate bindings, then prepares and immediately claims the purpose-specific authorization in that same internal boundary. The snapshot is retained locally for same-held-descriptor continuity; it is not a field in this scan-key request. Scan-key preparation and claim therefore are not an external “before first `await`” capture condition.

## 3. After unkeyed preflight, keyed pass one has no sink and only keyed pass two has a sink

The composition entry assumes that the common outer lock is already held, but cannot observe or prove that fact itself. The scanner synchronously claims fresh consumer input, transfers the active stage lease internally, and then opens held stage and work descriptors that remain open until the session ends. Only exact sealed-final V3 work qualifies; prefix-100 and prefix-500 do not.

1. The unkeyed full-file preflight reads the same held work from start to finish and establishes only its full snapshot, file bytes, complete-file SHA-256, and held / named pathname continuity. It neither parses nor authenticates V3 framing, seal, tail, or HMAC; those become authoritative only in a keyed pass.
2. The scanner internally prepares its scan-key request only from that actual preflight, then immediately claims the returned one-shot authorization in the same boundary. It accepts no externally prepared key. The caller supplies expected bytes and SHA-256 only as a prior equality commitment; those values cannot replace or override the scanner's measured key request.
3. Keyed pass one scans the same held work from position zero without a sink and completes the V3 HMAC-chain, binding, seal, tail, record-count, snapshot, and held / named path checks.
4. Keyed pass two uses the same held descriptor and full snapshot, projecting completed parents through an awaited, backpressured sink. The scanner does not read the next parent until the current sink Promise fulfills without a value.
5. Plan mint may begin only after keyed pass two returns with 24,004 complete records, 24,000 completed parents, `authenticatedBytes === fileBytes`, no torn tail, the same hash and snapshot, and successful post-scan pathname confirmation.

Neither a sink-call count nor the final parent event establishes success. The second scanner Promise must return its terminal receipt.

## 4. Preflight, both keyed scans, and terminal revalidation pin the same held work

Unkeyed preflight, keyed pass one, keyed pass two, and terminal keyed revalidation bind the same held descriptor and work identity. Inode equality alone is insufficient.

- device and inode;
- regular-file type, owner, mode, and link count;
- size, `mtimeNs`, and `ctimeNs`;
- complete-file SHA-256 and authenticated byte count;
- held stage / work versus named stage / work pathname identity; and
- stage parent / stage identity plus stage / destination basenames.

After the scanner has opened and pinned its descriptors, a same-byte replacement inode, append, truncate, chmod, hardlink, mtime / ctime change, symlink, pathname deletion, whole-stage move, or extra entry that remains observable at a scan or confirmation fails closed before plan mint. #478 binds no pre-invocation inode or snapshot, and it is not a continuous namespace monitor: a path move or extra entry created and fully restored between confirmations may be unobservable. Pre-open continuity and exclusion of those transient namespace competitors are outer-lock assumptions that #479's fixed lexical owner must establish. Content and metadata must match the complete pinned snapshot and digest at every recheck.

## 5. Every sink event remains provisional until the end

The keyed pass-two sink runs only after an entry passes canonical-byte, HMAC-chain, binding, and completed-evidence checks. It can nevertheless run before the stream's final seal, tail, snapshot, and pathname checks, so every projected value is provisional.

If early valid events are followed by a wrong seal, a tail after an authenticated seal, snapshot mutation, pathname replacement, sink throw or rejection, or a fulfilled non-`undefined` value, the enclosing scan fails. No production plan is registered, no output key is acquired, and no `train.jsonl` is created. There is no path that directly converts a sink event into a receipt or durable queue item.

## 6. A production plan retains only restartable scanner-backed replay

After the second keyed terminal success, the production plan registry receives an opaque one-shot plan. Its private state retains the production publication transaction that owns the active stage lease, a scan session that holds the stage, work, and owned scan key, the expected deterministic summary, and a restartable scanner-backed async replay.

Each replay starts at position zero and must drain the same held work through seal, tail, snapshot, and pathname confirmation. Early return, concurrent replay, a changed row order / count / digest on a later replay, or an iterator throw is an authority failure. Multiple replay passes during resume must still produce the same canonical training bytes and parent summary before publication is possible.

A production caller cannot supply projection arrays, a replay callback, or a prepared scan-key authorization. An abandoned plan closes its held stage and work descriptors, zeroizes its owned scan key, aborts the publication transaction, and terminally handles the active stage lease that was transferred into the scanner.

## 7. Run, key, parent, stage, and postflight form one closure

The production plan and result / manifest cross-bind:

- the exact run ID and deployment key ID;
- the canonical teacher-run-binding SHA-256 obtained from the authenticated V3 header;
- the current training-input binding and parent-ID commitment;
- the parent-ID digest recomputed from the sink stream (the digest itself is order-independent), with exact sequence enforced separately, and the expected training summary;
- held parent / stage device and inode plus stage / destination basenames;
- the held work full snapshot, bytes, and SHA-256; and
- the current exact consumer-postflight SHA-256.

The production API does not accept a caller-supplied `teacherRunBindingSha256`, serialized rows, absolute path, lease identity, raw root key, or caller digest as the measured preflight fact or a key-request override. Its expected work bytes and SHA-256 are only an equality commitment checked against the held-file preflight. V3 scan authorization and output-finalizer authority are separate capabilities with different registries, requests, and module purposes; neither can be claimed as the other.

This does not introduce a cryptographically distinct “read-only key” for V3 authentication. To verify V3 HMACs produced by the existing checkpoint writer, the scan side must derive the same HMAC key bytes from the same V3 HKDF info and MAC domain. Separation begins after the shared deployment root authority: distinct requests, registries, one-shot capability claims, and module purposes prevent cross-use. Result and manifest keys, by contrast, use HKDF info strings and MAC domains distinct from each other and from the scan key.

## 8. Terminal keyed work revalidation completes before commit

The persistence runner accepts the same four initial stage states as #477: `{W}`, `{W,T}`, `{W,T,R}`, and `{W,T,R,M}`, where `W=work`, `T=train`, `R=result`, and `M=manifest`. A successor requires complete exact predecessor bytes. The runner never truncates, unlinks, overwrites, or automatically repairs an existing artifact.

The production adapter emits no test-only status or synthetic literal in result, manifest, or receipt. After exact-prefix completion of train, result, and manifest and the source-content audit, it performs a terminal no-sink keyed work scan using the retained scan key and the same held descriptor. That scan must re-establish the HMAC chain, binding, seal, tail, full snapshot, and held / named pathname continuity. It then zeroizes the scan key. All of this happens before `transaction.commit()`.

The production publication transaction commits afterward. The commit itself performs the exclusive rename, reopened-destination reconciliation, publication-parent sync, stage-authorization lease removal, and the post-removal parent sync. It returns only once stage-lease removal is durable. The finalizer's later content audit is a point-in-time destination audit authorized only by the still-held common outer lock, not by the scan key or stage lease.

## 9. Two leases remain distinct, and the #479 owner will prove outer-lock ownership

The stage-authorization lease and outer-gate active lease are different objects with different cleanup points.

```text
common OS lock acquired by the caller (#478 assumption; #479 fixed owner)
  -> outer active lease durable
  -> fresh consumer input synchronously claimed
  -> active stage-authorization lease transferred into scanner
  -> held stage + held work opened and retained
  -> unkeyed full-file preflight
  -> scan-key authorization internally prepared from actual preflight and immediately claimed
  -> keyed pass 1 without sink -> keyed pass 2 with awaited sink
  -> production plan mint
  -> postflight + output keys -> exact-prefix persistence
  -> terminal no-sink keyed work scan -> scan-key zeroization
  -> transaction.commit
       -> exclusive rename and destination reconciliation
       -> parent sync before stage-lease removal
       -> stage-authorization lease removal
       -> parent sync after removal; commit returns
  -> later destination/content audit under common outer lock only
  -> remaining owned-key zeroization and descriptor cleanup
  -> outer callback returns
  -> outer active lease removal/retirement durable
common OS lock released last
```

The stage lease is already absent when the late content audit starts, but the caller-held common outer lock continues to serialize all three competing gates. The #478 composition entry point does not prove “lock held” from an argument or observable OS state; it contractually assumes invocation inside the correct lexical owner. #479's fixed owner / CLI will lazy-load it from the existing outer-gate owner, fixing that call relationship and establishing the outer-callback return, outer-active-lease cleanup, and OS-lock release order for the production entry point.

## 10. Failure, retry, and abandoned-plan cleanup are explicit

Failures are classified across fresh-input claim, stage-lease transfer, held stage / work open, unkeyed preflight, internal scan-key prepare / immediate claim, keyed pass one, between-pass continuity, keyed pass-two provisional projection, terminal confirmation, plan mint, replay, postflight, output-key acquisition, train / result / manifest persistence, terminal keyed work scan, publication, later content audit, and cleanup. An independent failure boolean prevents `throw undefined` from becoming success.

Before keyed pass-two completion, provisional projections are discarded. A safe pre-publication exact prefix may resume with fresh input, a fresh stage lease, and fresh scan authority derived from an actual preflight. A scanner replay or work-authentication failure during partial train persistence instead requires manual content reconciliation; it is not a fresh retry. Failures after rename, during stage-lease removal, or in post-publication audit conservatively retain publication and lease facets.

Every owned key is zeroized immediately after its last use. On failure, zeroization happens synchronously before asynchronous handle-close cleanup begins. Primary and close / abort failures remain separately represented internally, while public errors disclose no raw key, path, MAC, or private cause.

An authority that was never successfully transferred remains with its caller; a cloned, foreign, or stale facade failure does not call a copied lease-close closure. After transfer, scanner and plan discard keep an indeterminate cleanup tombstone: repeated discard rethrows the remembered close / abort failure rather than reporting an idempotent success. Only a fully successful discard removes the private plan mapping.

## 11. Local validation is complete, and production execution remains zero

Local validation fixed candidate code revision `cfd29ff` under Node 22.13.0 / npm 11.14.1. The exact synthetic 24,000-parent integration passed both its primary run and an independent root replicate that regenerated and exercised the test from the beginning. The primary recorded test 303.006 seconds / Vitest 303.59 seconds; the replicate recorded test 305.48 seconds / Vitest 306.10 seconds. Both had zero unhandled errors. The focused, related, and full-suite Vitest durations were 0.552, 87.12, and 314.95 seconds, respectively. The commands and raw structured values are in the [machine evidence](./data/floodgate-v7-training-label-production-composition-2026-07-16.json).

| Validation                                       | Status   | Tests / result           | Wall    | Maximum RSS   | Swaps |
| ------------------------------------------------ | -------- | ------------------------ | ------- | ------------- | ----- |
| focused fast/adversarial                         | COMPLETE | 3 files / 34 passed      | 0.96s   | 278,020,096   | 0     |
| exact synthetic 24k — primary                    | COMPLETE | 1 file / 1 passed        | 303.99s | 786,579,456   | 0     |
| exact synthetic 24k — independent root replicate | COMPLETE | 1 file / 1 passed        | 306.47s | 810,287,104   | 0     |
| related contracts — final                        | COMPLETE | 5 files / 90 passed      | 87.52s  | 2,413,199,360 | 0     |
| TypeScript                                       | COMPLETE | exit 0                   | 3.18s   | 1,146,044,416 | 0     |
| Prettier                                         | COMPLETE | 12 files / all matched   | 1.24s   | 333,316,096   | 0     |
| scoped ESLint                                    | COMPLETE | 9 files / 0 warnings     | 1.95s   | 552,910,848   | 0     |
| full ESLint                                      | COMPLETE | 0 errors / 157 warnings  | 25.35s  | 1,415,282,688 | 0     |
| full Vitest                                      | COMPLETE | 158 files / 2,864 passed | 315.35s | 2,380,939,264 | 0     |
| production build                                 | COMPLETE | 193 / 193 static pages   | 26.87s  | 2,639,167,488 | 0     |
| ML stdlib                                        | COMPLETE | 58 / 58 passed           | 0.42s   | 64,208,896    | 0     |
| npm audit                                        | COMPLETE | 0 vulnerabilities        | 0.62s   | 136,036,352   | 0     |
| local security review                            | COMPLETE | P0 0 / P1 0; P2 2 / P3 2 | —       | —             | —     |
| GitHub CI / review                               | PENDING  | PR not created           | —       | —             | —     |

The evidence also retains every iteration that led to the formal pass.

- The approximately 61.24-second initial run found that some lookup failures in a Promise-returning API threw synchronously. The implementation contract was corrected so they reject the Promise.
- The 103.5-second run expected pathname replacement to fail at a later pathname check, while the implementation safely rejected the earlier ctime mutation. The fail-closed implementation remained intact and the test expectation was corrected.
- The 53.27-second run awaited clone rejection across the fresh-row claim window. The test was reordered so it actually verifies synchronous authority claim.
- The 271.24-second run used a copied stage that could not match the V3 header's stage binding, and its early-abort hook fixture did not preserve the original inode. The fixture was corrected to retain the same inode before the formal pass.
- The first related-contract run failed only two stale source-marker expectations (87.17 seconds, maximum RSS 2,244,427,776 bytes, zero swaps). The corrected evidence-only 2-file / 14-test rerun passed, followed by the formal 5-file / 90-test pass.

The independent security review ended with zero blocking P0 and P1 findings. Its two nonblocking P2 findings are the absence of a direct scanner commit-indeterminate injection seam and the exact end-to-end corpus being all-forced with `training_records=0` (existing projection and finalizer tests separately cover non-forced training). Its two P3 findings are three scanner-internal `AggregateError` constructions that use array spread and an observability limitation when sanitizing a generic plan-discard `AggregateError`: the sanitizer cannot classify the internal cleanup count, so public `cleanupFailureCount` may retain its default of zero. The latter still keeps `leaseMayRemain` and the retry disposition on the safe side. The evidence does not misreport these as “no findings”; it records them as follow-up items that do not invalidate #478's safety claim. Only GitHub CI and review remain unobserved, so their fields stay `PENDING` / `null`.

Adding a production composition entry point in source is different from executing the fixed current-user production operation. This change records zero fixed production invocations, production preflight / keyed scans, production plan mints, production outputs, real-game reads, teacher-generation runs, training runs, weights, formal A/B games, external-calibration games, and live activations. Test-only temporary fixtures and a synthetic 24,000-parent scan are not counted as production execution or real data.

## 12. The next boundary is the fixed owner / CLI; strength proof comes later

#479 must contain this composition behind an owner and zero-argument CLI that lazy-load only fixed dependencies from the existing sealed-final common outer-gate owner. That boundary will establish, for the production entry point, the common outer lock's lexical ownership and release-last order that #478 assumes. The production command must expose no test dependency, raw path, raw key, or run option, and must validate signal, exit, sanitized failure, and one-shot capability handling.

Even after that owner / CLI merges, a real 24,000-parent run remains a separate operational gate. Real teacher generation, dataset finalization, retraining, candidate selection, formal A/B over 192 color-swapped pairs / 384 games, and 200 external-calibration games must complete in order. `runOp1` remains unchanged until rollback and live-safety conditions pass. This composition alone establishes no dataset, weight, Elo, rank, or stable high-dan strength.
