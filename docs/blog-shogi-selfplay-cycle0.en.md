# Stopping the No-Gain Lane and Starting Self-Play Cycle 0 for Our Own NNUE

> Over the past week, we investigated evaluation representations, authenticated datasets, retraining, static metrics, and match gates. But the goal was not merely to make the process safer; it was to make the engine clearly stronger in play. The formal 768-game candidate scored 51.24%, yet failed to establish superiority. The subsequent browser-confusion training also failed to improve held-out top-1 move choice. We therefore closed the static-data lane and started cycle 0: self-play with our own engine, deeper post-game relabeling, retraining, and direct candidate matches. This article records what did not pay off, what remains useful, and what is actually running now.

---

## Bottom line

- We still cannot claim that the live AI is stronger. `public/shogi-nnue-weights.bin` has not changed
- The HalfKP81 alpha-0.5 candidate finished its formal 768 games at **376 wins, 357 losses, 35 draws: 51.236979%**. It passed the safety condition, but its two-sided 95% lower bound was 47.72%, not above 50%, so the decision was `rejected-complete`
- All three eight-epoch browser-confusion runs regressed held-out top-1. The final temperature-50 diagnostic produced **65/643** for all three arms, below the 66/643 baseline. That lane is closed
- The new self-play pipeline has run end to end on real data. Thirty-one Vitest tests and 15 Python tests pass. The real 82-row integration corpus split into 75 training and seven validation rows with zero source/game/opening/position overlap, and both training arms completed. This proves wiring, not strength
- The selected generator uses 12 workers, play depth 2, post-game label depth 6, one sample every four plies, and at most 24 samples per game. The 20-game dense pilot completed in 62.48 seconds with 247 positions and zero technical faults
- Full generation of 24,000 games started at about 23:27 PDT on July 21, 2026. The first roughly three minutes produced 54 games and 612 positions, but the roughly 12-minute observation was 135 games and 1,592 positions, which extrapolates to about 35 hours. The 9–11 hour estimate from the short pilot was optimistic, so the current planning range is **24–48 hours on one Mac**. This is not a promised completion time
- At roughly 12 hours 30 minutes, with 6,219 games and 74,826 positions saved, four of the 12 workers were found stopped. The committed prefixes had zero corruption. The cause was a stale root move from an effective 30-bit WASM TT collision. A one-time clean-TT re-search only for an illegal root move crossed the failing game, and 12-worker generation resumed from 6,251 committed games
- We later sealed only the **16,255 / 24,000 completed games (67.73%)** as an immutable snapshot. Without mutating the source run, 198,391 positions produced 186,634 training and 6,818 validation rows after deduplication and leakage removal; two candidates were then trained and quantized
- Lambda 0.50 and lambda 0.75 completed two MPS epochs. Validation loss and pair accuracy improved slightly, but **these static metrics are not playing-strength evidence**
- Both screens ended with zero technical faults and legal moves throughout. Lambda 0.50 stopped mathematically after 54 games at 21 wins, 27 losses, and six draws, or 48/108 half-points. Lambda 0.75 completed 56 games at 24 wins and 32 losses, or 48/112. Both missed the 62-half-point threshold, so neither independent 96, formal 768, nor a live change was authorized

## 1. An honest account of the week

Much of the work completed so far did not directly increase playing strength.

Data ownership, tamper checks, keys, PR boundaries, reproducible hashes, and legal-move validation help prevent the wrong artifact from reaching production. They do not win a single extra game by themselves. We spent too long on those concerns before moving to actual training and head-to-head evidence. That ordering was wrong for the stated goal.

Some durable value remains. We followed one candidate through the complete 768-game match and did not call a visible 51.24% score “stronger” when the interval could not establish superiority. We also reproduced, across three seeds and a final bounded diagnostic, that better average pair/value proxies can coexist with worse best-move choice. That let us close the recipe instead of spending several more days scaling the same failed hypothesis.

The revised rules are simple:

1. A completed training run is not an outcome
2. Static metrics alone do not establish strength
3. A recipe that repeatedly misses a preregistered criterion stops
4. Only a candidate that establishes superiority in direct play can reach live

## 2. Why self-play is the next experiment

This cycle is not an attempt to copy a downloadable evaluation. We use our own HalfKP81 evaluation and our own WASM search to generate games, re-search selected positions more deeply after each game, then train the next candidate from a mixture of the search score and the final game outcome.

```text
Starting positions from strong games
        │
        ▼
Our fixed-depth WASM plays both sides
        │
        ▼
After termination, retained positions are
re-searched more deeply from an empty TT
        │
        ▼
Fine-tune HalfKP81 on search value + outcome
        │
        ▼
Play the candidate directly against an immutable champion
```

The 24,000 starting positions come from strong-game data so that a weak actor does not define the entire opening distribution. In-game random moves, wall-clock search cutoffs, and fallback moves are disabled. Fixed depth makes a run easier to reproduce across the two Macs than a fixed time limit.

This is still not guaranteed to work. Play depth 2 is shallow, label depth 6 is not a YaneuraOu-class teacher, and a model playing itself can reinforce its own blind spots. That is why generated volume never authorizes promotion. Direct play is the only route forward.

## 3. Speed pilots rejected depths that were too expensive

Starting all 24,000 games at a high depth would risk discovering a throughput failure days later. We first measured the same 20-game job with 12 workers.

| Configuration            |             Observation or completed result | Decision                                                   |
| ------------------------ | ------------------------------------------: | ---------------------------------------------------------- |
| play 4 / label 12        |                    zero games after 20m 22s | stopped as too slow                                        |
| play 3 / label 8         |              10 of 20 games after about 20m | stopped as too slow                                        |
| play 2 / label 6, sparse |  24.89s, 82 positions, 17 mates / 3 max-ply | retained as wiring fixture, too sparse for full generation |
| play 2 / label 6, dense  | 62.48s, 247 positions, 19 mates / 1 max-ply | selected for full generation                               |

The dense configuration samples from ply 12 through ply 180, every four plies, with at most 24 positions per game and a game cap of 192 plies. The pilot had zero zero-sample games, zero technical faults, and 12.35 positions per game. A direct row-count projection gives 296,400 positions for 24,000 games.

We have already corrected the time estimate twice. The 62.48-second pilot suggested 9–11 hours. The first roughly three minutes of the full run completed 54 games, around 18 games per minute, but the roughly 12-minute observation was 135 games and 1,592 positions, around 11.5 games per minute. A naive extrapolation of the later point is about 35 hours. Long games and deeper labeling create a long tail, so the current planning range is 24–48 hours. It will be updated from a longer steady-state window; it is not a completion promise.

## 4. The stop found at 6,219 games and the prefix-preserving recovery

At the roughly 12-hour-30-minute observation, full generation had reached 6,219 / 24,000 games (25.91%) and 74,826 positions. Workers 1, 3, 4, and 9 had exited, leaving eight running. Cross-checking every shard's progress and position files found no duplicate, partial line, row-count mismatch, or game-ID mismatch. Every completed-game prefix remained usable.

Replaying one failure, game 5193, showed the WASM returning `S*7g` at ply 111. The destination held the opposing king, so the move was unambiguously illegal. The JS and WASM position hashes, side to move, and count of 172 legal moves still matched. Searching that exact position from an empty TT consistently returned the legal `S*6h` instead.

The cause was not position synchronization. The WASM search retained an effective 30-bit transposition table across plies and returned a collided stale root move without checking membership in the current root legal-move set. The host fix clears the TT and re-searches the **same position at the same depth exactly once**, only when the returned root move is outside the JS legal set. It does not substitute the first JS move or a random fallback. A second invalid result still stops generation.

The fixed path completed game 5193 as a 140-ply Gote win with 24 samples, and shard 9 advanced from 432 to 438 games. Replaying already completed game 0 with the fix produced the exact stored 9,660 bytes and SHA-256. All processes were then closed on committed-game boundaries and restarted through one fixed coordinator with 12 workers from 6,251 games and 75,268 positions. This is recovery evidence, not playing-strength evidence.

The permanent correction is to validate a root TT move against the WASM root legal set and use a wider hash identity. Changing the WASM would change its pinned SHA and the run fingerprint, so that change is reserved for a later cycle rather than mixed into this in-progress run.

## 5. The fixed full-generation configuration

| Item                           | Fixed value                                     |
| ------------------------------ | ----------------------------------------------- |
| Games / workers                | 24,000 / 12                                     |
| Seed                           | `2026072205`                                    |
| Play / post-game label search  | depth 2 / depth 6                               |
| Quiescence                     | 10                                              |
| Sampling interval              | every four plies                                |
| Maximum retained per game      | 24 positions                                    |
| Maximum sampled ply / game ply | 180 / 192                                       |
| Bootstrap weights              | `2b91060f…b47c`, 81 buckets                     |
| Research WASM                  | `1b95659d…bdb`                                  |
| Starts                         | 24,000 rows, 1,000 source games, `c9ee90da…b62` |

The source output directory is `/Users/yudaiyaguchi/.codex/shogi-runs/selfplay-cycle0-full24k-depth2x6-dense-v1`. A read-only snapshot captured completed games only at 16,255 without touching in-flight source writes. Its per-shard completed-game counts are `[1906, 761, 2000, 670, 794, 2000, 829, 2000, 1545, 1711, 1794, 245]`, totaling 16,255.

While both 56-game screens ran, source-generation workers were suspended in memory so the same Mac could concentrate CPU on direct-play evidence. The nine preserved workers resumed automatically after both screens ended. This does not mark the 24,000-game source run complete. It is a compute-allocation choice that tested the 16,255-game snapshot while preserving the remaining generation work.

## 6. Splitting and full training of the 16,255-game snapshot

We sealed an immutable snapshot from completed full-run prefixes. Its input contains 16,255 games and 198,391 positions.

- 186,634 training rows across 15,499 games; 6,818 validation rows across 610 games
- zero train/validation overlap by source game, generated game, opening, and position
- 4,771 duplicate current positions and 151 duplicate validation positions were removed
- the cycle-zero holdout seed is fixed as `selfplay-cycle0-fixed-holdout-20260722`
- future cycles request 75% current accepted data and 25% past accepted replay; cycle zero has no past accepted data, so its effective mixture is 100/0

The training plan was sealed first. Both candidates initialize from checkpoint `ea36d0b9…a8c4` and then run two MPS epochs with batch 256 and learning rate 3e-6. Only two target mixtures are allowed:

| Arm         | Deep search-score fraction | Final-outcome fraction | trainer `wdl_mix` |
| ----------- | -------------------------: | ---------------------: | ----------------: |
| lambda-0.50 |                        50% |                    50% |              0.50 |
| lambda-0.75 |                        75% |                    25% |              0.25 |

The naming is easy to reverse: local `wdl_mix` is the **outcome** fraction, not the search-score fraction. Lambda 0.75 therefore maps to `wdl_mix=0.25`.

Both checkpoints were exported as 94,656,708-byte HalfKP81 int16 weights:

| Arm         | Initializer val loss | Epoch-2 val loss | Initializer pair acc | Epoch-2 pair acc | Best checkpoint SHA |
| ----------- | -------------------: | ---------------: | -------------------: | ---------------: | ------------------- |
| lambda-0.50 |             0.078309 |         0.076182 |               0.8743 |           0.8750 | `785ff6ea…cc9`      |
| lambda-0.75 |             0.045156 |         0.043336 |               0.8743 |           0.8757 | `bd964ea0…f8e`      |

This table establishes only that loss fell and pair accuracy rose slightly. Earlier work already demonstrated that improved static proxies can fail to improve direct play. We therefore do not call either candidate stronger at this stage.

The prior audit checklist remains intact: completed games only in the snapshot, one run fingerprint, zero overlap under all four holdout identities, SHA-256-pinned input/plan/checkpoint/export artifacts, and `live_weight_write_authorized=false` in both data and training evidence. These controls prevent an invalid promotion; they are not playing strength.

## 7. What will count as stronger

Completion of the 24,000 games still does not trigger a live change.

1. Verify the 16,255-game snapshot and every shard — complete
2. Publish the fixed train/validation holdout and train both arms — complete
3. Quantize both candidates and confirm runtime compatibility — complete
4. Run a **56-game screen** against the immutable comparison model — both candidates rejected
5. Automatically advance only passers to an **independent 96-game** confirmation on disjoint seeds — not run because there were zero passers
6. Select exactly one independent-96 passer under the preregistered rule for the **formal 768-game** match — not run
7. Review formal superiority and external calibration before making a separate live-deployment decision — not reached

Each screen used seven pair workers, 1,500ms per move, and at most 28 pairs. Lambda 0.50 became unable to reach the threshold after 27 pairs and stopped under the preregistered futility rule with `rejected-futility`. Lambda 0.75 completed all 28 pairs and ended `rejected-complete`. There were zero technical faults, no repeated observed openings, and all moves were legal. This is not a harness failure: the cycle-zero recipe—depth-2 self-play, depth-6 labels, and two-epoch fine-tuning—failed to beat the current model in play. We will not treat more epochs or more rows under the unchanged recipe as a successful continuation.

## 8. Current position

The confirmed outcome is that static metrics improved on 16,255 games of self-play, yet both trained candidates played worse than the current model. Lambda 0.50 scored 21 wins, 27 losses, and six draws; lambda 0.75 scored 24 wins and 32 losses. Each accumulated 48 half-points, below the required 62. We therefore cannot say that the AI became stronger, and live weights remain unchanged.

This does not prove that self-play can never work. It does directly show that **re-searching shallow-actor positions at depth 6 and returning them to the same actor for two epochs was not enough**. The remaining source generation resumed so its already committed work is not discarded, but an unchanged teacher depth, loss, and full-update recipe will not be promoted merely because it reaches 24,000 games. A next candidate needs either a stronger teacher signal or a different hypothesis that limits excessive movement from the initializer, followed by a fresh direct-play test on new seeds.

The design draws on the [Stockfish NNUE training documentation](https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md) and [YaneuraOu's NNUE training notes](https://yaneuraou.yaneu.com/2018/12/30/nnue%E8%A9%95%E4%BE%A1%E9%96%A2%E6%95%B0%E3%81%AE%E5%AD%A6%E7%BF%92%E6%96%B9%E6%B3%95%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6/). General success elsewhere is not evidence that this candidate will improve. Our conclusion will come only from the saved data and direct games in this cycle.
