# A pathless stable-WASM proposer before the depth-16 teacher

> The [private-stage authorization](./blog-shogi-floodgate-teacher-stage-authorization.en.md) established where a future Floodgate teacher may work, but the preregistered candidate union still lacks the move chosen by the currently deployed runOp1 NNUE/WASM engine. This note documents a synthetic-only, dependency-injected `CoreForTests` primitive that snapshots its byte inputs before the first `await`, can run the stable search in bounded child processes without giving them asset paths, and returns canonical proposal JSONL in memory. Its status is `complete-in-memory-dependency-injected-test-core-not-engine-authenticated-not-durable-not-published`. It has not read real training rows, selection, or either final holdout, and it is neither an authenticated engine result, a completed v7 teacher, nor playing-strength evidence. Japanese version: [blog-shogi-floodgate-stable-wasm-proposer.md](./blog-shogi-floodgate-stable-wasm-proposer.md)

---

## Current boundary

| Item                                   | Current state                                   | What it means                                                                                                 |
| -------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| stable-WASM proposal core              | Implemented in the working tree                 | Structural synthetic input can produce one in-memory stable move per parent                                   |
| exact byte identities                  | Implemented                                     | Plan, tracked WASM, embedded WASM, weights, and worker source must match fixed byte counts and SHA-256 values |
| child-process search                   | Implemented                                     | Children receive snapshotted source and assets through bounded IPC, not filesystem paths                      |
| deterministic proposal JSONL           | Implemented; real pool checked at 1/2/3 workers | Parent order and output bytes do not depend on the tested worker widths or completion order                   |
| production consumer provenance         | Not implemented                                 | `CoreForTests` cannot claim the exact object issued by the production consumer                                |
| checkpoint authentication / durability | Not implemented                                 | No file, MAC, fsync, postflight receipt, or publication is produced                                           |
| v7 union / depth-16 teacher            | Not implemented                                 | Stable moves are not yet joined to teacher MultiPV and played moves or independently rescored                 |
| real data and holdouts                 | Unread                                          | No real training, selection, fresh final, or legacy final artifact enters this primitive                      |
| strength claim                         | None                                            | A deterministic candidate move is not evidence of accuracy, Elo, rank, or improvement                         |

“Complete” in the status string refers only to one successful in-memory invocation of the structurally forgeable test core. It does not mean that production provenance, the full teacher run, training, evaluation, or publication completed.

## 1. Why the stable move is a separate phase

The preregistered Floodgate plan requires three candidate sources for each parent:

1. YaneuraOu MultiPV 12 at depth 16
2. The strong game's played move
3. The frozen runOp1 production-int16 move requested at depth 11

The current v6 teacher combines only the first two. Running it on 24,000 real parents would therefore generate a dataset that does not match the frozen candidate-union plan. The stable search is also synchronous and CPU-heavy; placing it in the same Node event loop as the USI engine pool could starve engine pipes and watchdog timers. The proposer consequently computes stable moves first in its own process pool and returns an artifact that a later teacher runner can authenticate and join.

This PR-sized boundary intentionally stops before that join. It should not be described as “v7 complete.” A true v7 must bind this proposal artifact to the same authenticated parents, add the stable move to the union, and independently rescore every unique candidate at depth 16.

## 2. Exact byte identities

All asset arguments are synchronously captured as fresh `Uint8Array` copies before the first asynchronous operation. The child pool never receives the caller's mutable buffers. The core then checks these identities:

| Artifact                                                 |     Bytes | SHA-256                                                            |
| -------------------------------------------------------- | --------: | ------------------------------------------------------------------ |
| `ml/protocols/floodgate-q1-2026-fresh-sibling-plan.json` |    10,890 | `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af` |
| tracked `shogi.wasm`                                     |    35,597 | `e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c` |
| decoded embedded WASM                                    |    35,597 | `e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c` |
| `public/shogi-nnue-weights.bin`                          | 1,185,988 | `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc` |
| `ml/floodgate-stable-wasm-worker.mjs`                    |    18,416 | `db15628cceb34c8ef98ce60cb1d167566ff3ae4d2ed90da74699e9b03bb03986` |

The tracked and decoded embedded WASM snapshots must also be byte-for-byte equal. Matching only their lengths is insufficient. Inside each child, the WASM and weights are decoded from canonical base64, rehashed, and checked again. The copied weight region in exported WASM memory is rehashed after the copy.

The plan itself preregistered the stable weight path, byte count, SHA-256, `K = 600`, depth 11, no book, no external mate solver, and no fallback. The WASM hash, quiescence depth, start depth, TT policy, output scale, child protocol, and watchdogs are a later implementation lock; they must not be retroactively described as fields that were explicit in the original plan.

The input shape also has to carry the pinned role-bundle result receipt—14,735 bytes with SHA-256 `56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf`—and bundle manifest—7,202 bytes with SHA-256 `2bafc01f602c98ea63069e04b8d39c36470bcc6d31e1861fdaa83c6fc50e3cf9`. This is strict structural validation in `CoreForTests`; it does not prove that the production consumer issued the object.

## 3. Pathless child byte snapshots

The child launcher evaluates the already-captured worker-source string with the current Node executable, an empty environment, root working directory, `shell: false`, and pipe-only stdio. It does not pass a worker path, WASM path, weights path, role-bundle path, or output path. Initialization sends the exact WASM and weight snapshots as canonical base64 in a single-line canonical-JSON message.

The protocol is phase ordered:

```text
await-init -- init(bytes) --> ready(asset hashes + Node version)
ready      -- search(position vector) --> result(index + move + raw stats)
ready      -- quit --> bye --> clean process exit
```

Messages use exact keys, printable ASCII plus LF, canonical JSON, bounded lines, one outstanding request per child, and separate startup and per-search watchdogs. Before sending a search, the parent hashes the canonical request payload with the domain `shogi-floodgate-stable-wasm-worker-request-v1\0`. The child recomputes that `request_sha256`, rejects a mismatch, and echoes it in the result; the parent rejects a response that does not echo the assigned digest. This binds a response to one canonical request frame, but it is an unkeyed digest, not engine authentication or a MAC. Unexpected stdout, noncanonical bytes, stderr on a successful run, a crash, timeout, wrong asset receipt, malformed move, bad depth, invalid counter, wrong request echo, or incomplete result coverage fails the invocation. On one worker failure the pool force-stops its peers and returns no proposal artifact.

This pathless design narrows accidental authority: a child can search only the bytes and position vectors handed to it. It is not an OS sandbox against the same user, root, or the Node runtime itself.

## 4. The strict stable-search tuple

Every real worker search reapplies the same configuration and clears the private TT before loading the parent position.

| Field                       | Fixed value                 |
| --------------------------- | --------------------------- |
| time limit supplied to WASM | `0` (disabled)              |
| requested depth             | `11`                        |
| quiescence depth            | `10`                        |
| iterative-deepening start   | `1`                         |
| root tesu                   | authenticated parent `ply`  |
| private TT                  | cleared before every parent |
| shared TT                   | disabled                    |
| NNUE                        | enabled, one bucket         |
| sigmoid scale               | `K = 600`                   |
| output scale                | `1/1`                       |
| forced-full NNUE mode       | disabled (`0`)              |
| book / external mate solver | disabled / absent           |
| fallback                    | forbidden                   |

The worker requires the corresponding WASM exports, verifies the weight pointer and size, fixes shared TT off and start depth one, loads the canonical board / hand / side vectors, and sets `root_tesu` to the input ply. A returned packed move is checked in the child and then decoded and checked again against the rules-complete legal moves in the parent process. The parent recomputes the child SFEN and semantic child-position ID.

The number of stable workers is an operational option from 1 through 12. It is not the preregistered YaneuraOu runtime. The plan's 12 one-thread engines, 64 MiB Hash per engine, and 600,000 ms per-search timeout belong to the later depth-16 YaneuraOu proposal and independent-rescore phase. Stable-WASM searches are internally untimed (`max_time_ms = 0`); their parent-process startup and search watchdogs only fail stuck child processes and are recorded as operational metadata.

## 5. The early winning-mate addendum

The WASM iterative-deepening loop intentionally stops when it finds a winning score in its mate band. Therefore a request capped at depth 11 can honestly finish before depth 11. The proposal contract records requested and completed depth separately and accepts exactly two outcomes:

- `completed_depth = 11`, with `termination = requested-depth-complete`
- `completed_depth` from 1 through 10 and raw parent-perspective score from `89,990,000` through `90,000,000`, with `termination = winning-mate-band-early`

Every other shallow result fails closed. This is an implementation addendum frozen before real Floodgate rows are read; the original preregistration did not spell out the early-mate band. Silently reporting such a result as “completed depth 11” would be false, while rejecting every valid early winning mate would make the production move contract unusable on legitimate mating positions.

The field is named `raw_search_score` and its encoding is `wasm-v20-raw-parent-perspective-mate-band-v1`. It is not an ordinary centipawn value, not a YaneuraOu score, and not a teacher label. In particular, values near 90 million are mate-band sentinels. The later teacher may use only the stable move as a candidate and must obtain the training score from its own independent depth-16 search.

## 6. Worker-count-invariant canonical JSONL

The input is recaptured into exact plain data, checked for the training schema and role, canonical SFEN, legal played move, parent occurrence ID, aggregate digests, unique semantic positions, and strict UTF-8-bytewise `parent_id` order. Search requests receive dense indexes in that order. Workers may finish in any order, but results are stored back at their assigned index before serialization.

The final adversarial audit found four gaps because an injected search can modify process-wide built-ins while the core is awaiting it. A live `Object.is` allowed `-0` to collide with canonical JSON's `0`; the expected-key spread invoked a mutable array iterator; live `node:util.types` guards allowed the Proxy / SharedArrayBuffer rejection to be bypassed; and live `Hash.update` / `Hash.digest` methods could corrupt output digests. The fixed core captures those operations during module initialization, copies expected keys by index, and computes parent and child position IDs only through the captured Hash methods. Regression tests have the search callback itself poison each built-in: `-0`, Proxy objects, and shared backing are still rejected, while iterator and Hash-prototype poisoning still yields the same artifact. This is evidence for the in-process dependency-injection boundary, not for an OS sandbox.

Each output row contains:

- game, parent, and semantic parent IDs
- a domain-separated digest of the complete minimal parent payload
- the legal stable move
- recomputed child SFEN and semantic child-position ID
- requested / completed depth, termination, raw score encoding, nodes, leaves, and root tesu

Rows use schema `shogi-floodgate-stable-wasm-proposal-row-v1`. They are serialized as bytewise-key canonical JSON, one row per line, with exactly one final LF under format `canonical-jsonl-utf8-single-final-lf-v1`. The output identity records exact bytes, SHA-256, record count, parent-ID digest, and child-position-ID digest.

The semantic run fingerprint binds the authenticated-training structural binding, a domain-separated digest of all captured parent rows, the plan identity, `supplied_engine_assets`, and `required_search_contract`. It deliberately excludes worker count, watchdog values, and Node version. The current real-child test demonstrates identical rows, proposal JSONL, output SHA-256, and semantic fingerprint with one, two, and three workers. The design permits an operational width from 1 through 12, but real-engine invariance beyond 1/2/3 is not claimed by this result. The receipt separately records operational fields, so `receipt_json` itself is allowed to differ when the operational configuration differs.

## 7. What `CoreForTests` does not authenticate

The only public generator is `generateFloodgateStableWasmProposalsCoreForTests(...)`, and the actual pool is likewise exported as a test-core building block. Both capture enumerable own data properties and mutable byte inputs before asynchronous execution, return deeply frozen in-memory data, and write no file.

Their input TypeScript type matches `AuthenticatedFloodgateTrainingRows`, but a caller can construct that shape. More importantly, the generator accepts a dependency-injected `search` adapter. The receipt records the bytes the caller supplied under `supplied_engine_assets` and the tuple it requires under `required_search_contract`; it does not prove that the injected adapter actually executed those assets or that tuple. The explicit `execution_boundary` is `dependency-injected-search-adapter-not-authenticated-by-this-receipt`. The pinned real child pool has separate tests, but merely presenting its function as the dependency does not turn this synthetic receipt into cryptographic engine authentication.

The test core never calls `claimActiveVerifiedPinnedFloodgateTrainingRows(...)` and cannot mint membership in the production consumer's private runtime registry. Its receipt therefore carries:

```text
complete-in-memory-dependency-injected-test-core-not-engine-authenticated-not-durable-not-published
```

and the claim boundary:

```text
stable-candidate-structure-only-not-search-authentication-teacher-label-or-playing-strength-evidence
```

No real role bundle, training row, selection row, fresh final row, or legacy final row has been passed to this implementation work. A synthetic result demonstrates contract behavior only.

## 8. Remaining path to useful training evidence

The safe sequence remains:

1. Add a production runner that enters through `withVerifiedPinnedFloodgateTrainingRows(...)` and synchronously consumes the exact-object production claim as its first callback action, before its first `await`.
2. Bind proposal checkpoints to the authorized private stage with an exact file set, MAC-authenticated resume, crash reconciliation, file and directory fsync, consumer postflight, a result receipt, exclusive rename, and reopen verification.
3. Restore and pin the exact YaneuraOu binary and evaluation assets, then run interruption / resume tests with the real engine on synthetic parents.
4. Implement the actual v7 union: YaneuraOu MultiPV 12, strong-game played move, and exactly one stable proposal for every authenticated parent; deduplicate in UTF-8 byte order and independently rescore every candidate at depth 16.
5. Only after the complete runner closes should the real 24,000 training parents be labeled. Selection and final data remain on their preregistered schedules.
6. Retrain the frozen family for seeds 42, 43, and 44, quantize through the production int16 path, apply the static family gates, and only then open the preregistered holdouts in order.
7. Run production parity, known-regression checks, the fixed paired A/B, and—only after all internal gates and a fresh rules preflight—the separately authorized external 81Dojo calibration.

Even completing steps 1–4 would establish a conforming teacher-input pipeline, not a stronger evaluation function. Strength becomes an evidence-backed claim only after the frozen multi-seed, holdout, quantization, search, and game gates pass.

## 9. Validation status

| Check                       | Current result   | Scope                                                                                                     |
| --------------------------- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| targeted Vitest             | 30/30 PASS       | strict capture, receipt boundary, worker protocol, failure cleanup, real WASM, and deterministic assembly |
| targeted three-way repeat   | 3 × 30/30 PASS   | the same targeted suite executed simultaneously in three processes                                        |
| four related suites         | 128/128 PASS     | proposer plus regression coverage for the upstream role-bundle / authenticated-row contracts              |
| full Vitest                 | 1,628/1,628 PASS | the complete repository, 99 files                                                                         |
| Python ML unit tests        | 58/58 PASS       | standard-library test suite                                                                               |
| TypeScript                  | PASS             | `tsc --noEmit`                                                                                            |
| scoped ESLint               | PASS             | proposer source, proposer test, and then-poison fixture                                                   |
| full ESLint                 | PASS             | 0 errors; 157 pre-existing warnings unrelated to this change                                              |
| production build            | PASS             | 193 pages; only the known Firebase / dynamic-route build-time messages                                    |
| real early-mate observation | PASS             | move `4c5b`, depth 1, raw score 89,999,999, 133 nodes, 2,856 leaves, no fallback                          |
| known depth-11 sentinel     | PASS             | move `3a4b`, raw score -114, 644,923 nodes, 1,533,244 leaves                                              |
| real pool invariance        | PASS             | identical rows / JSONL / output digest / semantic fingerprint at 1, 2, and 3 workers                      |
| loader-free then isolation  | PASS             | a bundled plain-Node child poisons `Object.prototype.then` and prints `real-pool-then-isolation-pass`     |
| final independent review    | 2/2 CLEAN        | no P0/P1/P2 findings in either the adversarial audit or the claim/count audit                             |

The exact mate and sentinel values above are observations from pinned synthetic positions, not a corpus result or strength measurement. The targeted suite also exercises startup/search hangs and crashes, malformed and duplicate responses, wrong request-digest echoes, sibling-result discard after another worker fails, and no-partial-artifact behavior.

## Conclusion

The stable-WASM proposer closes one narrow design gap: it can transform strictly shaped synthetic training parents and exact byte snapshots into worker-count-invariant, canonical in-memory stable-move proposals under a visible depth / early-mate contract. It keeps the raw WASM score separate from centipawns and teacher labels, and it gives child processes no asset path.

It deliberately stops before production provenance, durable staging, v7 depth-16 labeling, real-data execution, retraining, and strength evaluation. Those omissions are not paperwork; they are the boundaries that prevent a reproducible stable move from being mistaken for a complete or stronger model.
