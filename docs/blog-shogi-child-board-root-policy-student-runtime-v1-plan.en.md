# Shogi child-board root-policy student/runtime v1: implementation record

> The 6.17M-parameter child-board teacher will not enter production leaf evaluation. Only seed 42 fit outputs distill into an 877,633-parameter root-ordering student; seed 314159 remains replication-only and never becomes a training target. Student, live NNUE, and worker/WASM identities freeze separately before one-way tune, sealed, runtime, and formal gates. Both phase-1 teachers, their hash binding, and the student implementation are complete. The first preparation caught a misinterpreted V9 candidate subset before teacher inference and stopped; the v2 full-production-set correction is now under validation. No student optimizer, tune, sealed scoring, match, or live change has started. [日本語](./blog-shogi-child-board-root-policy-student-runtime-v1-plan.md)

## Why a separate student exists

The large teacher reads child boards and the complete move set presented to it. It is an offline policy model, not an ordinary position-value NNUE. Putting it directly into production leaves or the TT would change both latency and the meaning of the comparison.

This protocol fixes separate roles:

| Artifact                        | Fixed role                                                      |
| ------------------------------- | --------------------------------------------------------------- |
| Seed-42 teacher                 | Fit-only distillation target                                    |
| Seed-314159 teacher             | Replication evidence only                                       |
| Student                         | Root legal-move ordering prior only                             |
| `public/shogi-nnue-weights.bin` | Sole child/leaf static evaluator                                |
| Search                          | Selects the move and never stores student CP as a leaf/TT value |

Disabling the student must restore the prior root ordering and byte-identical non-root search state.

## Parent protocol and frozen teacher binding

The parent is the 42,427-byte [strength-candidate protocol](../ml/protocols/child-board-strength-candidate-v1-plan.json), SHA-256 `b9b8256433cec77da8d32a6d05018b9a5e405e5b57fdabe299490a5f9f90cfe2`.

Only two strings were unresolved in the original pre-implementation core:

- Seed-42 final-checkpoint SHA-256
- Seed-314159 final-checkpoint SHA-256

The phase-1 terminal result matched the parent schema, status, SHA, and false tune/sealed/live flags. The binding commit mechanically copied seed 42 hash `b90baaabbe5a9f7905d7a161ecf5da5abcfebda40f9403af56094847d199d13a` and seed 314159 hash `9b6bbae900d753da18052f880ab090652f4678aa58110d43f08f17e7d858f293` from `training.final_checkpoints`, then published the binding receipt and closed postphase registry. Later production-source pin refreshes and this move-universe input-contract correction leave that historical binding receipt immutable; only the current protocol identity and registry receipt advance.

Seed 42 is the distillation teacher before any score is known. Averaging, ensembling, selecting, or targeting seed 314159 is forbidden.

## Fit-only data

The frozen seed-42 teacher runs in eval mode on the parent fit partitions only:

| Domain  | Fit parents | Tune parents |
| ------- | ----------: | -----------: |
| Browser |         875 |          196 |
| V9      |      19,264 |        4,411 |
| Total   |      20,139 |        4,607 |

Each rules-complete legal list is first projected to the move membership that current production search actually generates. The projection removes only a non-promoting bishop or rook move when promotion is available, because production already omits that branch; every other move remains. Since the teacher consumes the move set as a whole, filtering logits from a rules-complete forward is forbidden. The projected child batch must be rebuilt and the frozen seed-42 teacher re-forwarded on that complete projected set. No teacher retraining is needed.

### Incomplete V9 input stopped during the 2026-07-28 implementation check

The first real-data preparation stopped before teacher inference or optimizer creation. One V9 parent supplied 12 moves that the loader incorrectly treated as rules-complete, while the real production JS and real production WASM independently returned the same 27 moves. The parent was `sha256:0011a06add27c5201bcebcd9b569f197d7fd440ce662e09594128f55bf0103f3`, with SFEN `ln1gk1snl/6gb1/p1spppppp/1rp6/7P1/P5P2/1PPPPP2P/1BGK2SR1/LNS2G1NL b p 19`. The source 12 were a subset of 27: 15 moves were missing, source extras were zero, JS-versus-WASM differences were zero, and this position had zero bishop/rook non-promotion removals.

The engine did not invent 15 illegal moves. A V9 training row contains the played move plus teacher candidates, so it is a candidate subset rather than a complete legal list. Shrinking production to 12, interpolating old teacher labels for the missing 15, or substituting live-NNUE values as teacher targets are all forbidden.

For every fit parent, the corrected implementation runs the pinned production JS list, pinned `rulesCompleteLegalMoves` that restores the known bishop/rook non-promotion branches on top of that JS list, and the separately implemented pinned production WASM list. This is not a third independent shogi-legality oracle; it is an exact current-production-membership check across two production implementations with explicit pre/post-projection lists. Only when the protocol projection of the restored list exactly equals both production lists does it derive every production child SFEN, semantic ID, explicit feature, and frozen live-NNUE baseline. Browser source rows independently authenticate the rules-complete list on 875 parents; a V9 source remains a separately recorded authenticated candidate subset. Before opening the seed-42 checkpoint, the expanded parent-plus-all-child closure must have zero intersection with protected/known-eval IDs, the original tune closure, and the other fit domain. Added moves carry no usable source teacher target; seed 42 is freshly forwarded on the complete production set to create targets.

At the stop, the student output directory was zero bytes: zero distillation shards, zero teacher inference, zero training epochs, zero tune/sealed/formal/external scoring, and zero live-weight changes. No weak result was installed. The only retained outputs from the failure are its diagnosis and regression tests; a receipt with the old subset meaning cannot be rewritten or reused under the corrected meaning.

The corrected full 20,139-parent preflight measured the following. Browser 875 had 75,532 source and rules-complete moves, 74,611 production moves, zero additions, and 921 bishop/rook non-promotion removals. V9 19,264 had 223,834 source candidates, 1,681,740 rules-complete moves, 1,663,442 production moves, 1,439,608 additions, and 18,298 removals. The combined production set contained 1,738,053 moves. Independent projection versus JS/WASM mismatches were zero; intersections with 900,395 protected/known-eval IDs, 72,710 original tune IDs, and the other fit domain were all zero. The teacher-free preflight artifact was 565,336,695 bytes with SHA-256 `e229b6c7d52f322a1ee33f75dce33152ab13f09b1d935695f8835af89cc98c89`, generated in about five and a half minutes. It is a temporary validation artifact and will not be reused as the formal receipt after the public-main merge.

For all 20,139 fit parents, one fixed-order JSONL records parent identity and SFEN, the rules-complete source list, projected production list, removals and reasons, child identity, frozen live-NNUE child-side CP, its sign-negated parent-perspective `base_parent_cp`, and seed-42 combined CP from the projected-set re-forward. Its path, bytes, SHA, parent/move counts, and teacher receipt enter the terminal result.

The run stops unless tune, sealed, v3 sentinel, seed-314159, direct-play, and external parents, labels, and scores all remain zero. The distillation JSONL cannot be regenerated.

A fixed hash function assigns parents to 64 shards. Each shard publishes through temporary file, fsync, atomic rename, then receipt. Only a pre-optimizer technical crash may retain exact content-addressed shards and generate missing shards. Shard numbers are resume units only. A deterministic 64-way merge by `(domain ordinal Browser=0/V9=1, bytewise parent ID)` preserves bytewise-USI order inside each parent and atomically publishes the globally ordered Browser→V9→parent→USI JSONL. Teacher inference cannot run again afterward.

## Fixed student architecture

Every student parameter initializes from scratch under seed `20260728`.

| Component                                              |  Parameters |
| ------------------------------------------------------ | ----------: |
| Shared parent/child 16-channel two-block board encoder |     181,840 |
| Move embeddings                                        |      16,112 |
| 593-to-256 projection plus LayerNorm                   |     152,576 |
| Two 256-to-512-to-256 residual MLP blocks              |     526,848 |
| 256-to-1 output                                        |         257 |
| Total                                                  | **877,633** |

The shared board encoder runs once on the parent and once on every child in the projected production set. Parent 128, child 128, child-minus-parent 128, move embeddings 208, and `tanh(base_parent_cp/3000)` form exactly 593 features. For child-side live-NNUE integer `C`, `base_parent_cp=-C`, `residual_cp=600*output`, and `combined_parent_cp=base_parent_cp+residual_cp`; higher is better for the parent.

Every move uses the same independent score function. Stable descending combined CP with an ascending bytewise-USI tie break is permutation-equivariant. There is no parent-value head, dropout, or BatchNorm.

The FP32 tensor payload is 877,633 × 4 = 3,510,532 bytes. Production serialization concatenates tensors in bytewise tensor-name order as little-endian row-major float32 without padding. A separate manifest fixes name, shape, dtype, offset, length, and SHA.

Four existing source files and two tests are pinned by bytes/SHA for the 43 planes, C-to-y-to-x flattening, from/to/drop, piece/action, delta, king-relation, and ply-bucket maps. GroupNorm fixes four groups, population variance, and epsilon `1e-5`; LayerNorm fixes the last axis, population variance, and epsilon `1e-5`. Every GELU uses the float32 tanh form `0.5*x*(1+tanh(sqrt(2/pi)*(x+0.044715*x^3)))`. The JSON also fixes Conv/norm/GELU, residual add, projection, MLP, 600 scaling, parent-base addition, mask, and stable-sort order.

## Initialization, loss, and schedule

Conv/Linear uses Kaiming uniform with zero bias, embeddings use normal standard deviation 0.02, norms use weight one and bias zero, and the final output weight and bias are reset to exact zero.

The fixed loss compares seed-42 parent-perspective fit logits `T_i` with student combined CP `S_i`:

- Listwise between `softmax(clamp(T_i-max(T),-2000,0)/100)` and `log_softmax(S/100)`: 1.0
- `softplus(-(S_i-S_j)/100)` for every ordered `T_i-T_j≥50` pair: 1.0
- A 50-cp margin between the complete teacher-best tie set and hardest non-best: 1.0
- SmoothL1 beta 0.25 after clamping `S_i,T_i` to ±3000 cp and scaling by 600: 0.20

Training fixes MPS, AdamW, learning rate `0.0003`, weight decay `0.0001`, gradient clip `5`, Browser batch `32`, and V9 batch `256`. Four V9 pretrain epochs precede 12 mixed epochs containing every Browser fit parent once and three rotating V9 parents per Browser parent. Only the mixed-epoch-12 final checkpoint exists for selection. There is no best epoch, early stop, second seed, second attempt, tune monitoring, or replication monitoring.

Output is fixed to `/Users/yudaiyaguchi/.codex/shogi-runs/child-board-root-policy-student-runtime-v1`; the final checkpoint is `student-final-mixed-epoch12.pt`.

Only a technical crash may resume. The latest completed-epoch atomic checkpoint must exactly validate model, optimizer, CPU/MPS RNG, seed, phase, epoch, bound protocol, distillation SHA, and both teacher hashes, then continue at the next epoch. Alternate output, scratch restart, older-epoch rollback, completed-epoch replay, checkpoint choice, and post-tune recovery are forbidden.

Publishing the mixed-epoch-12 checkpoint ends training. From that point, `terminalize-only` recovery forbids optimizer creation/load, model forward, and training/protected-data reads. It may atomically publish only missing artifacts in this order: final checkpoint, 3,510,532-byte payload, manifest, validation of the already frozen parity fixture, then `result.json`. A valid final artifact is never overwritten, and the result is always last.

### Padding limit correction discovered on the complete data

When the completed 20,139-parent / 1,738,053-move teacher artifact reached training, first-batch construction stopped because one 318-move parent exceeded the old 272 limit. The measured maximum across the complete artifact is 333 moves, reached by the single parent `sha256:ad3c5a0a…e0c78`. This was not a teacher-label or strength failure. It was an implementation/preregistration mismatch: the padding cap from the V9-candidate-subset era survived the expansion to every production move. Optimizer steps, checkpoints, tensor, manifest, terminal result, tune, sealed, and live changes all remained zero.

The base protocol, 64 shards, merged distillation, and parity fixture are not rewritten. They are already content-addressed to base-protocol SHA `6bc5478a…db0`, the teacher, fit membership, and production move universe; padding is consumed only later when student batches are built. A post-prepare / pre-first-optimizer-step amendment therefore changes only the final bucket from `272` to `384`. Before model initialization or optimizer construction, the runner authenticates both base and amendment identities, every old receipt, the exact maximum of 333, every parent at or below 384, and checkpoint absence, then creates one immutable activation receipt. Checkpoints and the terminal result record both identities. Existing labels can therefore be reused without teacher inference, while remaining honestly bound to the original data protocol rather than being relabeled as new-protocol artifacts.

The single restart command from the public-main worktree is `PYTHONPATH=ml /Users/yudaiyaguchi/.codex/worktrees/541a/nextjs-portfolio/ml/venv/bin/python ml/train_child_board_root_policy_student.py train`. It does not rerun `prepare`, rename shards, rewrite receipts, change output, or restart from a different lane.

## Artifacts frozen before tune

The terminal result records resolved path, bytes, and SHA-256 for:

- Fit-only distillation JSONL
- Mixed-epoch-12 final checkpoint
- 3,510,532-byte FP32 runtime tensor
- Runtime manifest
- Fit-only parity-1024 fixture
- Student terminal result

Success status is `complete-fit-only-student-frozen-tune-locked`. Artifact hashes are deterministic execution receipts, not unresolved design choices. Tune remains locked until all of them freeze.

The same public-main implementation commit and frozen tensor/manifest then produce exactly one production build. `production-build-receipt.json` atomically binds runtime/search/worker/WASM/TT, package and lockfile/build configuration, emitted main/worker/WASM/student assets, and the Node/npm/Next/TypeScript environment. A partial build or post-tune rebuild is forbidden.

## Production move membership and root-only operation

The current JS and WASM production generators already omit the non-promoting branch of an unpromoted bishop or rook whenever its source or destination is in that side's promotion zone. Training, parity, tune, sealed, and runtime use this same production subset. The student experiment does not make either root or non-root production search rules-complete.

Student inference runs once per search invocation and passes a USI/move-key rank table into WASM. Whenever WASM regenerates ply-zero moves for root fallback, an iterative-deepening depth, an aspiration re-search, or root internal iterative deepening, it restores the same student initial order before the unchanged stable heuristic sort. A one-time outer host sort is forbidden because regeneration would discard it. Existing TT, capture, promotion, history, safety, and opening priorities remain unchanged; student rank deterministically breaks equal heuristic scores.

Student CP cannot enter evaluate, quiescence, alpha/beta, aspiration, pruning, extension/reduction, mate/repetition/terminal score, PV, or UI evaluation. It cannot write TT score, bound, depth, move, age, or replacement state. Large teacher modules and checkpoints must be absent from the production dependency graph and browser bundle.

A model, feature, manifest, hash, shape, or finite-value failure falls back to stable root order and records a technical fault. One formal fault makes the complete formal run unanalyzable.

## Parity 1,024 and M4 Pro latency after sealed

The fit-only fixture takes the lowest hash-ranked 512 Browser and 512 V9 parents and freezes the rules-complete source list, projected production list, and removals before tune. It executes exactly once only after all three artifacts pass tune and sealed.

Parity requires:

- Parent/legal-USI match on 1,024/1,024
- Exact live-NNUE child CP on every projected production move
- Finite output on every projected production move
- Top-1 match on 1,024/1,024
- 100% pair-direction match for reference gaps of at least 1 cp
- Maximum combined-CP absolute error at most 0.5 cp and mean at most 0.05 cp

The same fixture and artifact benchmark on Apple M4 Pro with AC power, Low Power Mode off, foreground production Chromium/WASM, and one worker after 100 warmup roots:

| Scope                                        | Median |    p95 |    p99 |     Max |
| -------------------------------------------- | -----: | -----: | -----: | ------: |
| Incremental student work                     | ≤12 ms | ≤25 ms | ≤40 ms |  ≤75 ms |
| Full root hook including live-NNUE retrieval | ≤20 ms | ≤40 ms | ≤60 ms | ≤100 ms |

Durations use monotonic `performance.now()` in the main thread and worker only. WASM is one synchronous single-thread call. After 100 warmups, one fixed 5,000-ms idle interval occurs with no explicit GC. None of the 1,024 fixture-order samples is removed. Ascending nearest rank `ceil(p*N)` uses median rank 512, p95 973, p99 1,014, and max 1,024; GC and scheduler pauses remain, and every raw duration is stored.

Parity and latency cannot be rescued by a rerun, artifact replacement, or threshold change.

## One-shot runtime admission

A sealed pass does not directly authorize formal play. It authorizes exactly one fixed runtime-admission invocation combining parity, latency, static call graph, determinism, fail-closed behavior, and no-leaf/TT contamination. The result path is `runtime-admission-result.json` with schema `shogi-child-board-root-policy-runtime-admission-result-v1`.

The immutable fit fixture supplies all 1,024 root cases, 256 non-root/TT cases, and 32 fault-injection cases; every case has three fixed repeats inside the same invocation. Gates require byte-identical root scores/orders, zero inference when disabled, zero student calls at plies 1/2/4/8, zero student dataflow into the TT API, identical non-order search state, stable fallback on missing/bad hash/bad shape/NaN, and zero large-teacher production dependencies.

The result binds path, bytes, SHA, and Git/build commit for student runtime, search, worker, WASM, TT sources, and emitted production manifest/main chunk/worker chunk/WASM/student assets. All raw cases, counters, fixture hashes, source/build receipts, and parity/latency receipts publish atomically without partial display. A partial, incomplete, or missed gate closes the lane without resume or rerun.

## One-shot tune and sealed

After both teachers and every student hash freeze, one invocation opens Browser 196 and V9 4,411. Every parent is projected to the same production subset, each frozen teacher is re-forwarded on that complete projected set, and the student scores identical membership. All six artifact/domain cells publish atomically in one result without partial display. Partial or incomplete output closes the lane; there is no resume, rerun, or later completion.

Each of the three artifacts independently passes every parent Browser gate and V9 exact-live overlay. There is no seed selection.

Only a three-artifact tune pass labels sealed 512. Scoring retains the same production subset from independent depth-12 YaneuraOu labels, while each neural teacher is re-forwarded on the projected set. Before any candidate score is opened, exact resume is allowed for label shards content-addressed by parent membership, teacher, depth, enumerator, and protocol. Valid shards are immutable. Exactly 512 parents produce one atomic final label receipt.

Sealed scoring also publishes all three artifacts atomically without partial display. Partial or incomplete output closes the lane. Each artifact independently requires Top-1 gain 26, pair gain 0.01, NDCG@5 gain 0.01, and one-sided McNemar p≤0.05.

## Student-capable formal adapter and external provenance

The existing formal-v2 adapter assumes one NNUE weight hash and cannot represent this candidate. A new `child-board-root-policy-student-formal-v1-registry.json` and root-only candidate adapter freeze after runtime admission and before game 1.

The new registry binds exact receipts for:

- Student tensor and manifest
- Frozen live NNUE
- Student-capable worker source and emitted production chunk
- Student-capable WASM source and emitted production asset
- Production build manifest
- Parity and latency results
- Runtime-admission result and master runtime config
- Stable and candidate public-main commits

Only 384 color-swapped pairs, 768 games, fixed search, zero-fault analyzability, and bootstrap seed `20260710` with 100,000 replicates carry over from v2.

Formal stable and candidate use the same worker, WASM, NNUE, build, and master config. Their only parsed difference is `/student_enabled=false/true`; stable must perform zero student tensor reads and inference calls. A separately built stable is forbidden.

The 200-game external run carries complete provenance for student, NNUE, worker, WASM, build, registry, adapter, formal result, and master runtime config. Its book is fixed to `public/shogi-opening-book-v2.bin`, 1,785,509 bytes, SHA-256 `ec41836b563be4ca3ed7b79f70614f8183f5e6bf01a32c9cfada10514dcc7530`: disabled in formal mode and enabled only in external mode. Any missing or drifted identity stops the run; no substitute candidate is allowed.

## Staged authority

| Phase                | A pass authorizes only                              |
| -------------------- | --------------------------------------------------- |
| Teacher phase 1      | Mechanical binding of two hashes and core merge     |
| Student phase 1b     | One-shot tune after fit-only student/runtime freeze |
| Tune                 | Sealed labels and scoring                           |
| Sealed               | Parity/latency/static/no-contamination admission    |
| Runtime admission    | Formal 768 with the exact adapter/registry          |
| Formal stronger gate | External 200 with exact provenance                  |

No phase permits a live write. Live activation still requires a separate rollback and staged-live protocol.

## Core receipt and current state

The machine-readable [student/runtime core](../ml/protocols/child-board-root-policy-student-runtime-v1-plan.json) has this pre-bind implementation-plan receipt:

- Bytes: 64,020
- SHA-256: `fd05bffa3f1200beb0a0db2ad7345bea4034f1e3d73b3b6cab20a206afd37086`

After phase 1, only its two placeholders change. The binding commit records the new bytes/SHA. This article retains the historical pre-bind receipt and is not rewritten from later results.

At this pre-bind receipt, both phase-1 teachers are frozen, protocol teacher hashes are bound 0/2, student implementation is unmerged, distillation has 0 parents, student epoch is 0, artifacts are zero, tune and sealed are unopened, parity/latency/runtime admission are unexecuted, formal is 0/768, external is 0/200, and live changes are zero.
