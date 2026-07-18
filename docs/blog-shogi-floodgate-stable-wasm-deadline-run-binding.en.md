# Closing the stable-WASM long-tail child artifact with a safe STOP

> This change does not make the private diagnostic operational. Review found that a repository launcher cannot remove circular bootstrap by approving its own revision: unapproved code would execute before any repository-internal check could authenticate it. The formal package command and user-owned approval record were therefore removed, and direct launch always stops at `external-supervisor-unavailable`. Public-asset calibration matched all five fields—move, score, depth, nodes, and leaves—in each of five pairs and measured a `1,002,562 ppm` callback/reference ratio. Private diagnostics, teacher generation, retraining, formal A/B, and external strength calibration remain **zero**, and live weights are unchanged. Japanese version: [blog-shogi-floodgate-stable-wasm-deadline-run-binding.md](./blog-shogi-floodgate-stable-wasm-deadline-run-binding.md)

## 1. Why this moved from an “execution binding” back to a child artifact

The initial design connected a fixed JXA helper, exact-clean dedicated checkout, read-only registry/assets/role input, before/after comparison of thirteen fixed files, and aggregate-only output. But a JXA helper or bundle stored in the repository is evaluated before an external trusted root authenticates its bytes. Mode `0600` does not make a user-owned file an authority because the same user can replace it.

This PR therefore does not claim that:

- a private run can start from the repository checkout;
- an exact-clean revision is an approved revision;
- a user-owned record provides create-only enrollment or a trust root; or
- a package command has formal-run authority.

Exact-clean capture remains useful source provenance, but it is not called approval.

## 2. Direct launch has one fixed STOP

The tracked CommonJS entry has only this path:

```text
launcher attestation
  -> fixed entrypoint context
  -> non-authorizing exact-clean provenance capture
  -> external-supervisor-unavailable
  -> one fixed-schema / fixed-phase / STOP line
```

The entry does not claim the registry, open private training rows, or launch a WASM diagnostic worker. `package.json` exposes no formal diagnostic run command.

The bundle has an exact allowlist of eighteen source inputs and permits only Node builtins as runtime externals. It retains the dormant read-only binding graph so a future external supervisor can review and authenticate the same bytes, but that graph is initialized neither before attestation nor by the STOP entry. Rebuilding the same source tree must be byte-identical, and hard gates reject local user paths, `node_modules`, preload text, and private canaries.

## 3. Output containment in the dormant JXA helper

The JXA helper is not execution authority. It is a child artifact for use only after a future root-owned supervisor authenticates it. It accepts no caller argument, path, revision, or preload. It starts Node from a fixed path as the direct `NSTask` child, checks the child-reported version `v22.13.0`, and uses a native process activity to prevent sleep. This fixes the path and reported version; it does not authenticate the Node runtime bytes before execution. That authentication also belongs in the later external supervisor.

Child stdout and stderr are never inherited:

- stdout is captured up to 64 KiB;
- the first stderr byte immediately marks the stream invalid;
- anything other than one canonical ASCII JSON line is rejected;
- success is deep-validated for every nested key, fixed label, count total, 13-of-13 invariance value, and reap value, then reconstructed as a new sanitized object;
- failure is also reconstructed from an allowlisted phase and fixed constants;
- timeout or invalid output sends TERM to the direct child, sends SIGKILL after five seconds only if the same direct child is re-confirmed as running both before and after reading its PID, and waits for `close`/reap plus EOF on both pipes;
- if the direct child has exited but a descendant keeps a pipe from reaching EOF, the launcher returns fixed STOP without signaling the stale PID; and
- post-launch close exceptions on stdin, stdout, or stderr fail closed.

macOS fixtures bounded and reaped a child that emitted 70 KiB and ignored SIGTERM, a child that emitted one stderr byte and hung, and a startup child that emitted nothing. A further fixture confirms fixed STOP without SIGKILL to a stale PID when the direct child exits on TERM while a finite descendant keeps a capture pipe open; this fixture does not claim descendant reap. A canonical success object with a nested `/Users/...` canary was rejected with empty output rather than forwarding the original object.

This JXA helper does not claim private-process-group containment for an arbitrary malicious grandchild. That boundary belongs in the later external supervisor.

## 4. Worker cancellation and reap

For future use after external authentication, the production `shouldStop` predicate now reaches the public-calibration child and every diagnostic lane. Each controller polls every 25 ms and fails closed on `true`, a non-boolean result, or a thrown exception. It sends SIGKILL and settles only after the child emits `close`.

A synthetic test flips stop after the maximum six lanes are active, reaps all six children, and prevents the remaining six lanes from spawning. This proves lifecycle closure for the tracked worker children; it is not a substitute for arbitrary grandchild process-group containment.

## 5. PUBLIC calibration remains isolated

Public calibration uses no private claim. It uses only the repository’s public WASM, public weights, tracked worker, and one fixed public position. Each of five pairs compares:

```text
reference: searchBestMove(0, 11, 10)
callback : searchBestMove(1, 11, 10), hostNow = 0
```

Move, score, depth, nodes, and leaves must all match in every pair. `exact_parity_count = 5` means that all five fields matched in each of all five pairs.

`callback_overhead_ratio_ppm = 1,002,562` means the callback total was approximately 1.002562 times the reference total. It is a ratio, not a claim that the callback was “1,002,562 ppm slower.” Raw durations never leave the child. This short fixed position does not establish 600-second tail wall-time equivalence or playing strength.

The real public calibration runs independently from the default unit suite with `npm run test:shogi-floodgate-stable-wasm-deadline-public-calibration`. The production 25% stability limit and 180,000 ms watchdog are unchanged.

## 6. Boundaries retained in the dormant read-only graph

The bundle retains these defenses for use only after a later supervisor authenticates it:

- claim the opaque registry capability only after PUBLIC calibration succeeds;
- authenticate nine fixed role paths through manifest, receipt, and verifier revision;
- convert only authenticated logical rows 3 through 14 into twelve inputs;
- isolate twelve requests in at most six children with a 600,000 ms cooperative deadline and 615,000 ms outer watchdog;
- return fixed histograms rather than per-lane records or partial iteration results;
- compare two control, two runtime, and nine role files before and after; and
- contain no writer, directory enumeration, root-key read, checkpoint, retry, resume, teacher generation, training, or live mutation.

These are code-and-test properties of a child artifact. They are not evidence that this PR reached private input.

## 7. Current validation

| Subject                                                           | Result                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| public-asset calibration                                          | 1 run; all five fields matched in all five pairs; `1,002,562 ppm` |
| JXA capture / deep sanitization / direct-child lifecycle fixtures | 22 / 22 PASS                                                      |
| stop and reap of six active diagnostic lanes                      | PASS                                                              |
| stop and reap of the calibration child                            | PASS                                                              |
| deterministic eighteen-source bundle / privacy hard gate          | PASS                                                              |
| regular merge of latest `origin/main`                             | `163dc696e4e6453919547386294058285516c236`                        |
| full unit suite                                                   | 177 files; 3,204 PASS / 1 SKIP                                    |
| production build                                                  | PASS                                                              |
| private registry claim / private row open / private lane          | **0 / 0 / 0**                                                     |
| teacher generation / training / candidate selection               | **0 / 0 / 0**                                                     |
| formal A/B / external calibration                                 | **0 / 0**                                                         |
| live-weight change / production activation                        | **false / 0**                                                     |

Linux CI also exposed a test-only portability defect: a fixture helper tried to change the shared system temporary root itself. The helper now changes permissions only on strict descendants of the realpath-resolved temporary root, and a regression test rejects any attempt to touch that shared root. This does not change the runtime closure or operational state.

Focused, isolated public-calibration, affected-regression, full-unit, and production-build validation are complete on the head that regularly merged the prerequisite and latest `origin/main`. The bundle is 287,891 bytes and the launcher is 24,803 bytes; their exact SHA-256 identities are frozen in the [machine-readable evidence](./data/floodgate-stable-wasm-deadline-run-binding-2026-07-17.json).

## 8. Missing external authority

A formal private run needs an external boundary that authenticates bytes before repository code executes, not another repository-local record:

1. a root-owned, non-writable supervisor/verifier at a fixed installation path;
2. authenticated create-only enrollment or an equivalent rollback-resistant trust root;
3. exact matching of the expected merge revision, JXA, bundle, Node, and checkout layout;
4. a private process group with TERM/KILL/reap for the main child and every descendant; and
5. a one-shot gate that launches the child artifact only after authentication succeeds.

That Unit A supervisor/verifier belongs in a later source-and-test PR. Administrative installation, enrollment adoption, and release activation are further separate gates. This PR neither builds nor installs them.

## 9. Next safe sequence

```text
validate and regularly merge this child-artifact PR on latest main
  -> external root-owned supervisor/verifier source-and-test PR
  -> independent review and exact release bytes
  -> separate admin install / create-only enrollment
  -> non-private commissioning test
  -> one formal aggregate-only private diagnostic
  -> aggregate review
  -> a separate long-tail fix PR if evidence warrants it
```

Even a successful formal diagnostic would not automatically authorize teacher generation, retraining, candidate selection, formal A/B, external strength calibration, or live activation.

## 10. Current decision

The child artifact now has stronger privacy, determinism, cancellation, and reap behavior. But no root-owned external supervisor or authenticated enrollment exists, so there is no authorized path from the repository to a formal private run.

The production decision remains **STOP**. Private/formal runs remain **zero**. Evaluation quality, playing strength, and stable high-dan strength are unestablished, and live weights remain **unchanged**.
