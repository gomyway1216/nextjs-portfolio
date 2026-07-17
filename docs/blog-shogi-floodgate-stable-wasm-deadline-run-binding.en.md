# Binding the stable-WASM long-tail diagnostic to real inputs without write authority

> The existing diagnostic core removed pool-wide poison with one request per child, but it had no safe execution path to private input. This change combines a fixed launcher, public calibration, read-only input authentication, before/after comparison of thirteen fixed files, and aggregate-only output in one fail-closed binding. A calibration using only public repository assets established exact parity for five of five fields and a `1,002,562 ppm` callback/reference ratio. It has performed **zero** private diagnostic runs, generated zero teacher rows, run zero retraining jobs, and changed **no** live weights. Japanese version: [blog-shogi-floodgate-stable-wasm-deadline-run-binding.md](./blog-shogi-floodgate-stable-wasm-deadline-run-binding.md)

## 1. Why a run binding was still required

The earlier diagnostic contract isolates twelve fixed candidates in at most six children, with a 600,000 ms cooperative deadline and a 615,000 ms outer watchdog. A core function alone cannot establish:

- who launched it, from which checkout, and with which Node runtime;
- whether private training rows were opened before calibration;
- whether the registry, WASM, weights, or role inputs changed during execution;
- whether private identifiers or per-lane values entered the aggregate; or
- whether failure led to retry, resume, checkpointing, or a live update.

This binding fixes those execution boundaries. It is neither a long-tail fix nor playing-strength evidence.

## 2. One fixed execution order

There is one forward-only sequence:

```text
argumentless native launcher
  -> launcher attestation
  -> dedicated diagnostic checkout exact-clean capture
  -> control 2 files before fingerprint
  -> registry locator load as an unclaimed opaque capability
  -> tracked calibration/diagnostic worker identity check
  -> pinned WASM/weights before fingerprint and read-only authority
  -> PUBLIC calibration child closes successfully
  -> registry capability claim
  -> existing production application checkout binding comparison
  -> fixed 9 role paths before fingerprint
  -> manifest/receipt/revision-bound training-row authentication
  -> logical training rows 3..14 become exactly 12 diagnostic inputs
  -> isolated aggregate-only diagnostic
  -> consumer postflight and one-shot claim
  -> asset cleanup
  -> all fixed 13 files after fingerprint
  -> application and diagnostic source after checks
  -> one canonical sanitized stdout line
```

If PUBLIC calibration fails, the binding does not claim the registry capability, receive role paths, or open training rows. Before calibration, it does structurally inspect the registry locator record, its owner, mode, and single-link status, then seals the result in an opaque capability. It therefore does not claim that no private control file is read before calibration.

## 3. Launcher and source closure

The package command invokes only a dedicated argumentless JXA helper. The helper derives a fixed diagnostic checkout, fixed Node `v22.13.0`, and fixed CommonJS bundle from the current-EUID home, then launches it through `/usr/bin/caffeinate -dimsu`. It uses no `tsx/cjs`, `NODE_OPTIONS`, caller-supplied path, or caller-supplied revision.

The child does not initialize the run-binding graph until launcher attestation passes. Before and after execution, the dedicated diagnostic checkout must be exact-clean at the same revision. The existing production application checkout is read separately to compare its revision with the registry binding; it is not execution authority for the diagnostic code.

The tracked bundle has an explicit allowlist of eighteen source inputs and permits only Node builtins as external runtime dependencies. Rebuilding the same tree must be byte-identical. Hard gates reject local user paths, `node_modules`, preload strings, and private canaries in the bundle.

## 4. PUBLIC calibration precedes the private claim

The calibration child uses a fixed public position and runs five pairs against the same pinned WASM and weights:

```text
reference: searchBestMove(0, 11, 10)
callback : searchBestMove(1, 11, 10), hostNow = 0
```

Move, score, depth, nodes, and leaves must match exactly in every pair. The parent receives one timing value:

```text
callback_overhead_ratio_ppm
  = round(sum(callback duration) / sum(reference duration) * 1,000,000)
```

Thus `1,002,562 ppm` means that the callback total was approximately 1.002562 times the reference total. It does not mean “1,002,562 ppm slower” or a 100.2562% delta. Raw durations never leave the child. This short fixed-position ratio also does not establish equal wall time for a 600-second tail.

The dedicated measurement in this change used only the repository's public WASM, public weights, and tracked calibration worker. It returned `exact_parity_count = 5` and `callback_overhead_ratio_ppm = 1,002,562`. Calibration inside the production binding uses read-only deployed assets pinned to those same identities. The calibration promise succeeds only after the child emits `close`, not merely after stdout arrives.

To prevent CPU contention from making wall-clock samples flaky, the default unit suite deterministically exercises the same spawn, file-descriptor-3 source, canonical parser, and `close`/reap path with an exact synthetic worker. The real pinned public calibration is enabled only by `npm run test:shogi-floodgate-stable-wasm-deadline-public-calibration` and is required as a separate CI step after the default unit suite. The synthetic test is a lifecycle test that isolates—not replaces—the real measurement. Neither the production 25% stability limit nor its 180,000 ms watchdog was relaxed.

## 5. The registry is a locator, not approved-key reauthentication

The dedicated registry loader validates held directories and the fixed record path, current-EUID ownership, modes, single-link status, and canonical JSON v2 structure. Claiming its opaque capability once reveals only consumer paths and an application-source binding.

It does not reread or reauthenticate the approved-key record. Structurally validating the approved-key binding field does not establish that this diagnostic authenticated an approved production key. Role-input integrity is established separately through an exact verifier revision, a pinned result receipt, a pinned manifest, and byte/SHA-256 identities for each fixed path.

## 6. Nine fixed, manifest-authenticated paths

The consumer holds the role root and these nine fixed paths through callback completion:

1. `fresh-final-holdout.protected-position-ids.txt`
2. `fresh-final-holdout.raw.jsonl`
3. `fresh-selection.protected-position-ids.txt`
4. `fresh-selection.raw.jsonl`
5. `manifest.json`
6. `replay-excluded-position-ids.txt`
7. `replay-exclusion-receipt.json`
8. `training.protected-position-ids.txt`
9. `training.raw.jsonl`

The manifest is pinned to 7,202 bytes and SHA-256 `2bafc01f602c98ea63069e04b8d39c36470bcc6d31e1861fdaa83c6fc50e3cf9`. The tracked result receipt is pinned to 14,735 bytes and SHA-256 `56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf`. The nine path/byte/SHA-256 identities captured from the manifest must map one-to-one to the nine held files. A table test changes one initial byte in each of the eight non-manifest paths, and all eight cases reject before entering the callback.

The claim is limited to **nine fixed, manifest-authenticated paths**. Directory entries are not enumerated. Unrelated entries are outside the claim and scope, and the implementation does not claim an absence of extra pathnames or an exact directory tree.

Beyond byte identity, the training raw file is revalidated for canonical JSONL, 2026-Q1 Floodgate URLs, game/parent/position IDs, strict parent order, canonical SFEN, legal moves, and set digests. The production and diagnostic consumers use the same pure parser. Only logical rows 3 through 14 of the authenticated array become the exact twelve inputs.

## 7. The fixed thirteen-file invariant

The before/after persistence scope contains files, not a directory tree:

| Class   | Count | Contents                                           |
| ------- | ----: | -------------------------------------------------- |
| control |     2 | connector registry record, approved-key enrollment |
| runtime |     2 | stable WASM, stable weights                        |
| role    |     9 | the manifest-authenticated fixed paths above       |

For each file, the binding compares canonical path, regular-file and single-link status, current-EUID owner, byte count, SHA-256, device, inode, mode, link and ownership metadata, size, mtime, and ctime. It cannot report success unless all 13 of 13 match. The approved-key enrollment file is only an invariance fingerprint here, not a key-authentication input. The root key is never read.

WASM and weights are copied from held read-only handles into temporary callback buffers and zero-filled after settlement. The role side also revalidates the nine held files and receipt, requires a synchronous one-shot input claim during the callback, and requires a one-shot postflight claim afterward.

## 8. Aggregate-only output and failure

Success writes one canonical ASCII JSON line. It contains only the public calibration ratio, outcome counts, fixed-order phase/depth/nodes/leaves histograms, configured and observed parallelism, twelve settled lanes, complete child reap, 13-of-13 invariance, source closure, and nonclaims.

It excludes:

- SFEN, board, game/parent/position IDs, and input index;
- paths, SHA-256 values, PID, stderr, error messages, and stacks;
- moves, scores, and exact per-lane nodes, leaves, or elapsed time; and
- individual lane records.

Nested extra keys, accessors, proxies, inconsistent histogram totals, and `all_children_reaped = false` are rejected before output. Failure also discards private detail and writes only one fixed phase, schema, and `STOP` status line. It emits no stderr.

## 9. Deliberately absent paths

The runtime closure contains no file writer, directory enumeration, deployment root-key read, checkpoint, quarantine, lease, retry, resume, teacher generation, training, or live mutation path. Shared TT is always off.

The binding does not automatically start a TT retry or resume after observing the diagnostic. If warranted, that would require review as a separate PR and contract after the twelve-lane histogram exists.

## 10. Current measurements and validation

| Subject                                                           | Result                                |
| ----------------------------------------------------------------- | ------------------------------------- |
| dedicated public-asset calibration                                | 1 run, `1,002,562 ppm`, parity 5 / 5  |
| default launcher / boundary / run-binding focused suite           | 3 files, 52 PASS; 1 real run isolated |
| isolated real public-calibration command                          | 1 / 1 PASS                            |
| shared parser / production consumer / SFEN regressions            | 3 files, 68 / 68 PASS                 |
| one-byte initial tamper of each non-manifest path                 | 8 / 8 rejected before callback        |
| deterministic eighteen-source bundle/privacy gates                | PASS                                  |
| TypeScript / targeted lint                                        | PASS                                  |
| formal run that opened private training rows                      | **0**                                 |
| private twelve-lane diagnostic                                    | **0**                                 |
| teacher generation / training / formal A/B / external calibration | **0 / 0 / 0 / 0**                     |
| live-weight change / production activation                        | **false / 0**                         |

The [machine-readable evidence](./data/floodgate-stable-wasm-deadline-run-binding-2026-07-17.json) records only the public calibration aggregate, never raw timing or a private identifier.

## 11. Next safe gate

After final-head CI, independent review, and a regular merge commit, the operator must align the dedicated diagnostic checkout to that merge commit and re-establish exact-clean source and exact bundle bytes. The existing production application checkout must not become execution authority for the diagnostic code.

Only then may the fixed package command perform one formal aggregate-only run. Success requires public parity 5 of 5, exactly twelve lanes, at most six children, complete child reap, one-shot claims, 13-of-13 invariance, and both source-closure checks. Any failure remains `STOP` without retry or resume.

That run answers only how the tail lanes distribute across phases. It does not authorize teacher generation, retraining, candidate selection, formal A/B, external playing-strength calibration, or live activation. Those decisions follow review of the aggregate as separate evidence-gated work.

## 12. Current decision

The binding implementation and public calibration pass. The private diagnostic has not run. The long-tail cause, speed improvement, evaluation-function improvement, playing-strength gain, and stable high-dan strength therefore remain unestablished.

The current production decision is **STOP**, and live weights remain **unchanged**.
