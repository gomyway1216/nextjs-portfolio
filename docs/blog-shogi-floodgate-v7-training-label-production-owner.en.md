# Closing #478's outer-lock assumption with a fixed lexical owner and zero-argument CLI — Floodgate v7 training-label production owner

> #478 made it possible to issue a production plan from an unkeyed preflight and two authenticated V3 scans of held `work.jsonl`. Its entry point did not itself prove that the common outer lock was held; it assumed invocation from the correct owner. This candidate adds a fourth mutation purpose, a purpose-specific single-use capability, a fixed lexical owner, a sanitized runner, and a zero-argument CLI. Together they fix one call order from outer-lock acquisition through label-artifact finalization, outer-lease cleanup, and OS-lock release. This is a production-capable code boundary, not a production execution: real registry provision, real work reads, real label finalization, training, weights, matches, and live-evaluator changes all remain at zero. Japanese version: [blog-shogi-floodgate-v7-training-label-production-owner.md](./blog-shogi-floodgate-v7-training-label-production-owner.md)

The related #478 boundary is documented in the [production composition article](./blog-shogi-floodgate-v7-training-label-production-composition.en.md). This candidate's structured state is in the [machine evidence](./data/floodgate-v7-training-label-production-owner-2026-07-16.json).

---

## 1. What this candidate closes

The #478 production composition had a contract that its caller already held the common outer lock. This candidate adds a fixed production entry point that accepts no path, run ID, key, binding, row, callback, dependency, or option. A zero-argument runner invokes the common outer-gate owner. Only that owner can mint the purpose-specific capability, and it lazy-loads the training-label owner inside both the lock and the authenticated active lease.

The successful order is therefore fixed as follows.

```text
fixed zero-argument runner
  -> common OS lock
  -> authenticated purpose-bound active outer lease (durable)
  -> one-shot training-label capability
  -> fixed lexical training-label owner
       -> private registry
       -> approved enrollment / current binding
       -> stage authorization
       -> unkeyed held-stage/work preflight
       -> fresh authenticated-training-row callback
            -> #478 scanner-backed plan composition
       -> consumer postflight
       -> terminal label finalizer / destination revalidation
  -> outer active-lease removal + retired evidence (durable)
  -> common OS lock release last
  -> sanitized public receipt
```

The label finalizer and destination-content revalidation finish before the outer callback returns. Durable active-lease cleanup follows the callback, and OS-lock release follows that cleanup. This is the lexical-ownership and release-last closure that #478 alone could not prove.

## 2. Extending the outer lease to a V2 purpose record

The candidate adds `training-label-finalization-24000` to the existing three checkpoint gates. One OS-lifetime lock anchored to the same registry descriptor serializes all four mutation purposes. The existing control directory, `active-lease.json`, quarantine, and retired namespace do not move.

New active leases are V2 records. They carry one of four `purpose` values instead of `gate` and use a new purpose-record HMAC domain. V1 and V2 shapes, contracts, statuses, algorithms, and HMAC domains are verified separately and exactly. To avoid losing existing authenticated crash evidence during the upgrade, the same namespace retains read-only dual-read authentication for legacy V1 records. A V1 gate maps only to the identically named checkpoint purpose; legacy `sealed-final-24000` can never be interpreted as evidence for training-label finalization. Only V2 records are newly written.

A quarantine entry, unknown active record, authenticated stale lease, or indeterminate cleanup evidence stops all four purposes conservatively. Signal or process exit does not claim graceful metadata removal. The OS releases the descriptor, while authenticated stale evidence remains for manual reconciliation.

## 3. Production and test training-label capabilities do not mix

The outer owner creates an opaque capability meaningful only while both the common lock and the `training-label-finalization-24000` lease are active. Production and test registries are separate module-private `WeakMap` instances. Only the exact object identity can be claimed synchronously and once; clones, proxies, foreign-registry objects, and second claims are rejected.

The production training-label owner claims the capability before its first `await` and before any registry, key, or stage operation. The production export composes only fixed dependencies, while dependency injection remains confined to the test-only core. The outer owner also defers module loading until after OS-lock acquisition and durable publication of the authenticated active lease.

## 4. Fixing the private authority chain in one order

After capability claim, the private authority chain cannot be reordered.

1. Load the production connector registry and obtain its one-shot private claim.
2. Load and claim approved key enrollment, then exactly match its bytes, SHA-256, and key instance to the registry binding.
3. Reverify that the expected binding is still current against the deployment key.
4. Acquire an active stage lease using only the registry's fixed stage authorization.
5. Perform a read-only unkeyed preflight of the held stage and held work.
6. Obtain fresh authenticated training rows with the registry's consumer option, and invoke the #478 composer only inside that callback.
7. Receive consumer postflight after the callback closes and pass it with the plan to the terminal finalizer.

The public receipt excludes paths, run IDs, key IDs and instances, key material and hashes, authorization and content MACs, run bindings, header candidates, row and position content, and raw nested receipts. Public file evidence is limited to bytes and SHA-256 plus parent and training-record counts, and both runner and CLI rebuild it again from explicit allowlists.

## 5. Preflight accepts only W / WT / WTR / WTRM stages

Preflight opens the stage directory through a held descriptor and requires its exact entry set to be one of the following.

| State | Exact entries                                               |
| ----- | ----------------------------------------------------------- |
| W     | `work.jsonl`                                                |
| WT    | `work.jsonl`, `train.jsonl`                                 |
| WTR   | `work.jsonl`, `train.jsonl`, `result.json`                  |
| WTRM  | `work.jsonl`, `train.jsonl`, `result.json`, `manifest.json` |

The stage must match the owner's private-directory identity. Work must have private regular-file metadata and one link. Preflight reads all held work to measure bytes and SHA-256, parses the bounded first line as canonical JSON, and checks the shapes of the V3 header, stage binding, training binding, fixed run policy, and expected run ID. It finally rechecks snapshot equality for held and named stage, held and named work, and the exact entry set during preflight.

This is **not an authenticated preflight**. Seeing the header-MAC field's form does not verify the MAC, so the header and `runBinding` are unauthenticated candidates. Bytes and SHA-256 are only equality inputs for the later authenticated scanner; they are neither caller authority nor teacher truth. A production plan is issued only if #478's keyed scanner validates the V3 HMAC, seal, tail, complete snapshot, and bindings and its authenticated result agrees with the candidate.

Preflight closes its descriptors before the composer opens scanner descriptors, so the implementation also **does not claim inode continuity between preflight and scanner**. The common outer lock serializes the four fixed workflows that honor it, but an uncooperative same-UID hostile writer can ignore that lock and alter the stage. The later scanner's fresh open, authenticated whole-file checks, and snapshot and pathname confirmations cover the changes they can observe and fail closed. There is no claim of continuous namespace monitoring or guaranteed detection of a transient change fully restored between confirmation points.

## 6. A plan cannot be created outside the fresh callback

The training consumer passes fresh input into a callback. Only inside that callback does the owner give the active stage lease, unauthenticated candidate run binding, measured preflight bytes and SHA-256, and fixed run ID to the #478 composer. The composer synchronously claims fresh consumer input, takes ownership of the stage lease, and returns a scanner-backed opaque plan only after both keyed authenticated scans succeed completely.

The consumer issues postflight only after the callback closes successfully. The owner passes the plan and this fresh postflight to the terminal finalizer. From an exact W, WT, WTR, or WTRM prefix, the finalizer advances only missing artifacts without clobbering and completes its terminal work scan, publication, destination reopen, and content revalidation. This training-label finalization must not be confused with optimizer training or weight production.

## 7. Making failure and cleanup ownership explicit

Cleanup ownership for the stage lease and plan changes at explicit progress points.

- Before composer invocation, the owner closes the stage lease on failure.
- After composer invocation, the composer or issued plan owns the stage lease.
- If the consumer or postflight fails after plan issuance, the owner discards the plan before returning.
- After finalizer invocation, the finalizer owns the plan terminally and the owner performs no double cleanup.

The public error projects only phase, publication-may-have-occurred, lease-may-remain, cleanup-failure count, and retry disposition, all conservatively. Publication or indeterminate cleanup is never projected as a fresh safe retry; it requires publication or lease reconciliation. If the outer owner crosses the operation boundary and fails, it does not claim successful active-lease cleanup: it releases the lock and preserves authenticated stale evidence. Only success completes active-lease removal, retired evidence, directory sync, and final namespace checks under lock before closing the lock descriptor last.

## 8. The CLI is fixed to Node 22.13.0, zero arguments, and caffeinate

The package script starts Node under `/usr/bin/caffeinate -dimsu` so a long finalization is not interrupted by sleep. The CLI requires `process.argv.length === 2`, meaning no extra argument, and accepts only exact runtime `v22.13.0`. It lazy-loads the runner only after validating argv and runtime. The runner likewise invokes only the zero-argument fixed outer operation.

Success writes one sanitized JSON line to stdout. Failure sets a nonzero exit status and writes one sanitized JSON line to stderr; an unknown failure or malformed nested receipt is not converted into an optimistic safe retry. A stdout-write failure is not treated as success. Raw owner, outer, and finalizer receipts, paths, identities, MACs, and row content are never emitted. The CLI does not promise a separate graceful-signal cleanup; the outer owner's signal policy preserves stale evidence after lock release.

## 9. Validation and GitHub gates remain PENDING

At the time this article was written, the final measured candidate revision, focused and adversarial tests, related tests, full suite, build, lint, typecheck, ML stdlib, audit, GitHub CI, and review results were not yet fixed. No guessed test count, duration, RSS, or commit SHA is written as evidence. Measured runs must replace every `PENDING` and `null` below.

| Validation                              | Status  | Result                       | Duration | Maximum RSS |
| --------------------------------------- | ------- | ---------------------------- | -------- | ----------- |
| focused owner / outer / runner / CLI    | PENDING | null                         | null     | null        |
| related authority / scanner / finalizer | PENDING | null                         | null     | null        |
| TypeScript                              | PENDING | null                         | null     | null        |
| Prettier                                | PENDING | null                         | null     | null        |
| scoped / full ESLint                    | PENDING | null                         | null     | null        |
| full Vitest                             | PENDING | null                         | null     | null        |
| production build                        | PENDING | null                         | null     | null        |
| ML stdlib                               | PENDING | null                         | null     | null        |
| npm audit                               | PENDING | null                         | null     | null        |
| GitHub CI / review                      | PENDING | PR / checks / review unknown | null     | null        |

PENDING is not a success claim. Merge requires the necessary local validation, including implementation and source-boundary evidence, a green ready-PR CI result, and zero actionable unresolved reviews. The normal regular merge commit policy applies, and live operation remains a separate gate from merge.

## 10. Every production counter remains zero and the live evaluator is unchanged

This candidate adds a production-capable owner, runner, and CLI; it does not prove that they ran against the live production namespace. Real registry provisions, production-work observations, production CLI and owner invocations, real teacher parents, finalized labels, optimizer runs, candidate weights, formal A/B games, external-calibration games, and live activations attributable to this change all remain zero. Synthetic fixtures and unit tests are not counted as real work or labels.

The current live weight and `runOp1` therefore remain unchanged. This candidate makes no new Elo, dan-rank, stable-high-dan, or playing-strength claim.

## 11. A separate operational gate still follows merge

Only after this owner and CLI PR is merged and its CI and review evidence is closed should a separate operational gate perform the following sequence.

1. Create a fixed verifier worktree from main and pin the exact revision and runtime.
2. Provision the production registry and reverify approved and current binding.
3. After read-only preflight, run the 100-parent gate and preserve its receipt.
4. Run the 500-parent gate and preserve its receipt.
5. Run the sealed 24,000-parent teacher gate to produce real work and a terminal receipt.
6. Invoke this zero-argument owner and CLI for training-label finalization and preserve artifact bytes, SHA-256 values, and cleanup receipt.
7. Only then proceed to retraining, candidate selection, 192 color-swapped pairs / 384 formal A/B games, 200 external-calibration games, and the safe live gate.

Every stage consumes measured evidence from its predecessor. It must not skip past a failure, stale lease, quarantine, or indeterminate publication. Weight adoption and live activation remain prohibited until strength and rollback evidence are complete.
