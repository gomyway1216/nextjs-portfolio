# The next shogi-strength experiment: discard one-sided self-play and relearn hard high-rated positions at depth 18

> HalfKP81 v4 finished its fresh 56-game screen at 29 wins, 24 losses, and three draws: 61/112, one half-point below the preregistered 62/112 line. The point estimate moved upward, but the candidate was rejected. The successor is not a rescue of that model. It preserves the broad direct-teacher data, selects 8,192 hard parents from 800,000 high-rated game positions, and labels their sibling moves afresh with YaneuraOu at depth 18. [日本語](./blog-shogi-halfkp81-hard-depth18-strength-plan.md)

## What actually failed

The earlier training was not literally worthless. Its frozen candidate passed quantization, WASM parity, and runtime checks, then scored 29–24–3 in fresh direct play. But its pair-accuracy gain over 22,890 validation positions was only `+0.000445`, or `+0.0445 percentage point`. That is not evidence of playing strength. The candidate missed the direct-play gate, so it will not be rescued with another epoch, another seed, or a changed threshold.

The schedule drift also needs a plain accounting. Ownership, tamper detection, keys, and PR boundaries were necessary for a reproducible formal run, but they did not directly increase strength. Too much work expanded those boundaries, while small training-metric changes were treated as if they were close to playing evidence. This lane reuses the safety foundation and spends most compute on new, stronger labels.

## A source assumption failed before compute started

The initial plan selected from 186,634 cycle-0 self-play positions. An independent audit counted the SFEN side to move and found `b=186,634 / w=0`. Four-ply sampling had retained only even plies. Using it would make the new fit, tune, and sealed sets one-sided, repeating a known parity defect. The pool was rejected before formal teacher computation began.

The replacement is an authenticated set of 800,000 positions from high-rated Floodgate Q1 2026 games: 14,861 games with `b=402,090 / w=397,910`. Every row has a YaneuraOu depth-12 score and final game outcome. That old score is selection metadata only, never a teacher target.

A read-only scan found 175,903 opening rows, 298,191 middle rows, and 197,394 late rows after the fixed ply and `|CP|≤1000` filters but before legal-count and overlap exclusions. Distinct-game supply is 11,392, 13,622, and 11,692 respectively, leaving ample headroom for one selected position per game. Formal quota feasibility is established only by the completed selection manifest after both exclusions.

| Phase   |    Ply | Eligible distinct games |        Fixed selection |
| ------- | -----: | ----------------------: | ---------------------: |
| Opening |  12–39 |                  11,392 | 2,048 (1,024 per side) |
| Middle  |  40–79 |                  13,622 | 3,072 (1,536 per side) |
| Late    | 80–119 |                  11,692 | 3,072 (1,536 per side) |
| Total   |        |                         | 8,192 (4,096 per side) |

Ranking is fixed by depth-12 CP/outcome surprise, then the lower player rating, then SHA-256. The selector takes one position per game and splits `game_id` before assigning fit 6,144, tune 1,024, and sealed 1,024. Every role is exactly 50/50 by side. It excludes every direct-teacher train/validation parent and child plus the initial position and six prefixes of all 56 selected v2/v4 formal openings that can be reconstructed from their seeds. The v4 candidate's exploratory 3–9 record in openings with exactly three central-file pawn pushes remains a hypothesis, not the sole selector criterion.

The source rows do not contain legal-move counts. The formal CLI rejects missing counts. A preprocessing step uses the production-rules move generator to add counts deterministically and binds the executing tool plus an 11-file move-rules closure by bytes/SHA from held, double-read descriptors. The selector reauthenticates that fixed closure and the current files, so a stale or fabricated self-asserted manifest cannot pass. It then binds the semantic-overlap inventory covering every direct parent/child and the 56 reconstructible selected formal openings.

Historical inventories retain only 3,198 v2 and 3,302 v4 fingerprints. They carry neither seeds nor SFENs and cannot be inverted into semantic positions. This plan does not claim to exclude that unrecoverable range. The limitation is fixed in the formal selection manifest; a wider scope would require recoverable source evidence and a new preregistered version.

The old source has another parity artifact after ply 120, where only `b` positions remain. The hard set therefore stops at ply 119. This does not remove endgames from training: the 200,944 direct training-replay rows retain broad late-game coverage, while a separate 22,890 rows remain out of training as preservation validation with late-game diagnostics. The fresh hard set has the narrower job of learning balanced sibling rankings in difficult opening and middlegame positions.

## What will be learned

Each parent is processed with the following fixed YaneuraOu configuration.

| Item                  |                                  Fixed value |
| --------------------- | -------------------------------------------: |
| Proposal              |                       MultiPV 12 at depth 16 |
| Extra moves           | Recorded move and fixed-depth-11 stable move |
| Final sibling rescore |                                     Depth 18 |
| Processes             |                                           13 |
| Threads per process   |                                            1 |
| Hash per process      |                                      512 MiB |
| Timeout per parent    |                                  600 seconds |

The point estimate is 11.62 moves per parent, approximately 95,191 teacher rows, with a hard maximum of 114,688. The existing 200,944 direct training labels remain broad replay data; the separate 22,890 validation labels never enter training and remain reserved for preservation checks. Parent batches are 50% old direct replay and 50% new hard labels. The objective is 50% direct sigmoid BCE and 50% groupwise ListNet over sibling rankings.

Training restarts from the original alpha-050 checkpoint, not the failed v3/v4 candidate. The representation is HalfKP81, with one seed, exactly three epochs, and only the final epoch eligible. This prevents selecting a lucky-looking checkpoint after seeing results.

## What improvement is required

There is no guarantee that this will make the engine stronger. The advantage is narrower: it tests a materially different causal hypothesis and stops failures early.

Teacher authentication runs after 100 and 500 parents. Every parent must have at least two rows; any missing parent, non-depth-18 result, or technical fault is fatal. Both tune and untouched sealed sets must beat the initializer by at least `+2.0 percentage points` top-1 and `+1.0 point` sibling-pair accuracy. The old 22,890-row validation set must improve teacher MAE by at least `5 CP` without decreasing pair accuracy.

Before a teacher plan can be authorized, a second verifier double-reads the selection manifest and all 8,192 JSONL rows through held descriptors and recomputes canonical bytes/SHA/rows, semantic IDs, hardness and order, phase/side and role/side quotas, one position per game, zero cross-role game overlap, and the source/legal/overlap bindings. The mapping between compact selector phase names and preregistered phase names is explicit. The plan must bind both this evidence and the caller-authenticated merged source revision; an arbitrary 40-hex string is insufficient. The current teacher receipt validator still checks only the plan, counts, and path structure and grants no training-plan authority. That authority remains blocked until an artifact verifier reads each teacher JSONL through held descriptors and recomputes actual bytes, SHA-256, row counts, all 8,192 parent-role memberships, depth 18 for every target, and zero reuse of old depth-12 targets.

Only then do the integer and runtime gates run: zero int16 clipping, zero WASM mismatches, p99.9 quantization ratio `≤1.05`, absolute delta `≤300 CP`, and slowdown `≤5%`. Passing all of them may authorize a fresh 56-game screen with the unchanged requirement of 62/112 and zero technical faults. Any miss closes the lane. There is no extra epoch, seed, QAT, distillation, threshold change, or same-candidate continuation.

## Cost and current state

The prior depth-16 teacher run took about 11.47 hours for 24,000 parents. A linear 8,192-parent estimate is 3.91 hours, but depth 18 is materially more expensive, so the preregistered planning range is 8–16 hours for teacher generation. Legal-count enrichment and selection over 800,000 rows, training, and static gates should take under an hour; the 56-game screen should take 15–25 minutes. The total M4 Pro range is 9–18 hours, not a completion-time guarantee.

On July 30, 2026, PR #665—containing the preregistration, selector, and authenticators—was regularly merged as `0ec6807c7d6c13f3e7caf4f08d45e87ce1ba005b`. Against that merged revision, the formal run produced and reauthenticated a 243,368-row semantic-overlap inventory, an 800,000-row legal-count pool, and exactly 8,192 hard parents. The split is fit 6,144, tune 1,024, and sealed 1,024. All 8,192 `game_id` and `position_id` values are unique, cross-role game overlap is zero, and every role is 50/50 by side to move.

After a Mac restart, the sizes and SHA-256 identities of all three artifacts were unchanged. Depth-18 teacher generation itself remains at zero parents and zero rows. The current PR work adds a dedicated runner that fsyncs row-level progress and can resume the 13-process job after a restart, proves the production depth-11 stable move, and independently verifies all 8,192 parents instead of trusting the raw receipt. The 8–16-hour teacher job starts only after that PR is regularly merged and an immutable teacher plan is published from clean `main`.

The live baseline remains `public/shogi-nnue-weights.bin`, 1,185,988 bytes, SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`. Completing selection is not evidence of stronger play, and the public flag remains unchanged.

The exact conditions and measured feasibility data are separated into the [machine-readable memo](./data/shogi-halfkp81-hard-depth18-strength-plan-2026-07-29.json).
