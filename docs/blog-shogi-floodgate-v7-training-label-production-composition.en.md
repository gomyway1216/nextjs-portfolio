# Minting a production plan only after two authenticated scans — Floodgate v7 training-label production composition

> #477 established exact-prefix persistence for a test-only opaque plan, but did not provide an authority path from authenticated V3 work to a production plan. This boundary scans the same held `work.jsonl` twice inside the common outer lock and permits a production opaque plan only after the second enclosing scan succeeds completely. It adds a production entry point, but does not invoke the fixed current-user operation, add the owner / CLI, finalize a real 24,000-parent dataset, train, create a weight, run A/B or external calibration, or change the live evaluator. Japanese version: [blog-shogi-floodgate-v7-training-label-production-composition.md](./blog-shogi-floodgate-v7-training-label-production-composition.md)

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

Consumer input and prepared scan-key authority are claimed and captured synchronously before the callback returns and before the first `await`. A microtask or delayed callback cannot claim them later and cannot mint postflight or plan authority.

## 3. Pass one has no visitor; only pass two has a visitor

The composition first acquires a fresh active stage lease and a purpose-specific V3 scan key under the common outer lock, then opens held stage and work descriptors. Only exact sealed-final V3 work qualifies; prefix-100 and prefix-500 do not.

1. Pass one scans the same held work from position zero without a visitor.
2. Private state records that pass one's seal, tail, record count, snapshot, and held / named path checks all succeeded.
3. Pass two uses the same held descriptor and full snapshot, projecting completed parents through an awaited, backpressured sink. The scanner does not read the next parent until the current sink Promise fulfills without a value.
4. Plan mint may begin only after pass two returns with 24,004 complete records, 24,000 completed parents, `authenticatedBytes === fileBytes`, no torn tail, the same hash and snapshot, and successful post-scan pathname confirmation.

Neither a visitor count nor the final parent event establishes success. The second scanner Promise must return its terminal receipt.

## 4. Both scans and terminal revalidation pin the same held work

Pass one, pass two, and terminal keyed revalidation bind the same held work identity. Inode equality alone is insufficient.

- device and inode;
- regular-file type, owner, mode, and link count;
- size, `mtimeNs`, and `ctimeNs`;
- complete-file SHA-256 and authenticated byte count;
- held stage / work versus named stage / work pathname identity; and
- stage parent / stage identity plus stage / destination basenames.

A same-byte replacement inode, append, truncate, chmod, hardlink, mtime / ctime change, symlink, pathname deletion, whole-stage move, or extra entry fails closed before plan mint. A mutate-and-restore attempt is not accepted unless the complete snapshot and digest still match.

## 5. Every visitor event remains provisional until the end

The pass-two visitor runs only after an entry passes canonical-byte, HMAC-chain, binding, and completed-evidence checks. It can nevertheless run before the stream's final seal, tail, snapshot, and pathname checks, so every projected value is provisional.

If early valid events are followed by a wrong seal, a tail after an authenticated seal, snapshot mutation, pathname replacement, sink throw or rejection, or a fulfilled non-`undefined` value, the enclosing scan fails. No production plan is registered, no output key is acquired, and no `train.jsonl` is created. There is no path that directly converts a sink event into a receipt or durable queue item.

## 6. A production plan retains only restartable scanner-backed replay

After the second terminal success, the production plan registry receives an opaque one-shot plan. Its private state retains the production publication transaction, scan session, expected deterministic summary, and a restartable scanner-backed async replay.

Each replay starts at position zero and must drain the same held work through seal, tail, snapshot, and pathname confirmation. Early return, concurrent replay, a changed row order / count / digest on a later replay, or an iterator throw is an authority failure. Multiple replay passes during resume must still produce the same canonical training bytes and parent summary before publication is possible.

A production caller cannot supply projection arrays or a replay callback. An abandoned plan closes its scan descriptors, zeroizes its owned scan key, aborts the publication transaction, and terminally handles the active stage lease.

## 7. Run, key, parent, stage, and postflight form one closure

The production plan and result / manifest cross-bind:

- the exact run ID and deployment key ID;
- the canonical teacher-run-binding SHA-256 obtained from the authenticated V3 header;
- the current training-input binding and parent-ID commitment;
- the parent-ID digest recomputed in visitor order and expected training summary;
- held parent / stage device and inode plus stage / destination basenames;
- the held work full snapshot, bytes, and SHA-256; and
- the current exact consumer-postflight SHA-256.

The production API does not accept a caller-supplied `teacherRunBindingSha256`, serialized rows, absolute path, lease identity, or raw root key as authority. The V3 scan key and output-finalizer authority use separate registries, requests, and purposes. Result and manifest keys also use different HKDF info strings and MAC domains.

## 8. Terminal keyed work revalidation completes before commit

The persistence runner accepts the same four initial stage states as #477: `{W}`, `{W,T}`, `{W,T,R}`, and `{W,T,R,M}`, where `W=work`, `T=train`, `R=result`, and `M=manifest`. A successor requires complete exact predecessor bytes. The runner never truncates, unlinks, overwrites, or automatically repairs an existing artifact.

The production adapter emits no test-only status or synthetic literal in result, manifest, or receipt. After exact-prefix completion of train, result, and manifest and the source-content audit, it performs a terminal no-visitor work revalidation using the retained scan key. That revalidation must re-establish seal, tail, full snapshot, and held / named pathname continuity. It then zeroizes the scan key. All of this happens before `transaction.commit()`.

The production publication transaction commits afterward. The commit itself performs the exclusive rename, reopened-destination reconciliation, publication-parent sync, stage-authorization lease removal, and the post-removal parent sync. It returns only once stage-lease removal is durable. The finalizer's later content audit is a point-in-time destination audit authorized only by the still-held common outer lock, not by the scan key or stage lease.

## 9. Two different leases are kept distinct, and the outer lock releases last

The stage-authorization lease and outer-gate active lease are different objects with different cleanup points.

```text
common OS lock acquired
  -> outer active lease durable
  -> fresh stage-authorization lease + scan key
  -> pass 1 -> pass 2 -> production plan mint
  -> postflight + output keys -> exact-prefix persistence
  -> terminal keyed work reverify -> scan-key zeroization
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

The stage lease is already absent when the late content audit starts, but the common outer lock still serializes all three competing gates. No success receipt crosses the boundary before the outer callback returns, the outer owner cleans up its active lease, and the OS lock is released.

## 10. Failure, retry, and abandoned-plan cleanup are explicit

Failures are classified across authority capture, pass one, between-pass continuity, pass-two provisional projection, terminal confirmation, plan mint, replay, postflight, output-key acquisition, train / result / manifest persistence, terminal work revalidation, publication, later content audit, and cleanup. An independent failure boolean prevents `throw undefined` from becoming success.

Before pass-two completion, provisional projections are discarded. A safe pre-publication exact prefix may resume with fresh authority. A scanner replay or work-authentication failure during partial train persistence instead requires manual content reconciliation; it is not a fresh retry. Failures after rename, during stage-lease removal, or in post-publication audit conservatively retain publication and lease facets.

Every owned key is zeroized immediately after its last use. On failure, zeroization happens synchronously before asynchronous handle-close cleanup begins. Primary and close / abort failures remain separately represented internally, while public errors disclose no raw key, path, MAC, or private cause.

## 11. Validation is pending and production execution is zero

At the time this article scaffold was created, the candidate revision, focused tests, full suite, build, CI, and review had not been measured. Unobserved values remain `PENDING` / `null` in [machine evidence](./data/floodgate-v7-training-label-production-composition-2026-07-16.json). After the code candidate is fixed, it will record commands, test counts, wall time, maximum RSS, swaps, initial failures, and reruns.

| Validation                               | Status  | Tests / result | Wall | Maximum RSS | Swaps |
| ---------------------------------------- | ------- | -------------- | ---- | ----------- | ----- |
| focused fast/adversarial                 | PENDING | null           | null | null        | null  |
| exact synthetic 24k two-pass integration | PENDING | null           | null | null        | null  |
| related contracts                        | PENDING | null           | null | null        | null  |
| TypeScript / Prettier / ESLint           | PENDING | null           | null | null        | null  |
| full Vitest / build / ML stdlib / audit  | PENDING | null           | null | null        | null  |
| GitHub CI / review                       | PENDING | null           | null | null        | null  |

Adding a production composition entry point in source is different from executing the fixed current-user production operation. This change records zero fixed production invocations, production plan mints, production work scans, production outputs, real-game reads, teacher-generation runs, training runs, weights, formal A/B games, external-calibration games, and live activations. Test-only temporary fixtures and a synthetic 24,000-parent scan are not counted as production execution or real data.

## 12. The next boundary is the fixed owner / CLI; strength proof comes later

#479 must contain this composition behind an owner and zero-argument CLI that lazy-load only fixed dependencies from the existing sealed-final common outer-gate owner. The production command must expose no test dependency, raw path, raw key, or run option, and must validate signal, exit, sanitized failure, and one-shot capability handling.

Even after that owner / CLI merges, a real 24,000-parent run remains a separate operational gate. Real teacher generation, dataset finalization, retraining, candidate selection, formal A/B over 192 color-swapped pairs / 384 games, and 200 external-calibration games must complete in order. `runOp1` remains unchanged until rollback and live-safety conditions pass. This composition alone establishes no dataset, weight, Elo, rank, or stable high-dan strength.
