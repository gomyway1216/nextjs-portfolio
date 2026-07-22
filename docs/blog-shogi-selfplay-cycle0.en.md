# Stopping the No-Gain Lane and Starting Self-Play Cycle 0 for Our Own NNUE

> Over the past week, we investigated evaluation representations, authenticated datasets, retraining, static metrics, and match gates. But the goal was not merely to make the process safer; it was to make the engine clearly stronger in play. The formal 768-game candidate scored 51.24%, yet failed to establish superiority. The subsequent browser-confusion training also failed to improve held-out top-1 move choice. We therefore closed the static-data lane and started cycle 0: self-play with our own engine, deeper post-game relabeling, retraining, and direct candidate matches. This article records what did not pay off, what remains useful, and what is actually running now.

---

## Bottom line

- The live AI is not stronger yet. `public/shogi-nnue-weights.bin` has not changed
- The HalfKP81 alpha-0.5 candidate finished its formal 768 games at **376 wins, 357 losses, 35 draws: 51.236979%**. It passed the safety condition, but its two-sided 95% lower bound was 47.72%, not above 50%, so the decision was `rejected-complete`
- All three eight-epoch browser-confusion runs regressed held-out top-1. The final temperature-50 diagnostic produced **65/643** for all three arms, below the 66/643 baseline. That lane is closed
- The new self-play pipeline has run end to end on real data. Twenty-six Vitest tests and 15 Python tests pass. The real 82-row integration corpus split into 75 training and seven validation rows with zero source/game/opening/position overlap, and both training arms completed. This proves wiring, not strength
- The selected generator uses 12 workers, play depth 2, post-game label depth 6, one sample every four plies, and at most 24 samples per game. The 20-game dense pilot completed in 62.48 seconds with 247 positions and zero technical faults
- Full generation of 24,000 games started at about 23:27 PDT on July 21, 2026. The first roughly three minutes produced 54 games and 612 positions while using about 1,175% aggregate CPU and 3.82 GB RSS. The 9–11 hour estimate from the short pilot was optimistic, so the current planning range is **10–24 hours on one Mac**. This is not a promised completion time

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

We have already corrected the time estimate. The 62.48-second pilot suggested 9–11 hours, but the first roughly three minutes of the full run completed 54 games, around 18 games per minute. A naive extrapolation of that point is about 22 hours. Long games and deeper labeling create a long tail, so the current planning range is 10–24 hours. It will be updated from a longer steady-state window; it is not a completion promise.

## 4. The fixed full-generation configuration

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

At the 23:31 PDT evidence snapshot on July 21, all 12 workers were active. The output directory is `/Users/yudaiyaguchi/.codex/shogi-runs/selfplay-cycle0-full24k-depth2x6-dense-v1`. The completed run manifest does not exist yet. Full dataset preparation, full training, and candidate matches have not started. The presence of partial shard files is not treated as completion.

## 5. Dataset splitting and both training arms passed a real integration

We used the 82 sparse-pilot rows to exercise actual dataset publication:

- 75 training rows across 19 games; seven validation rows from one game
- zero train/validation overlap by source game, generated game, opening, and position
- the cycle-zero holdout seed is fixed as `selfplay-cycle0-fixed-holdout-20260722`
- future cycles request 75% current accepted data and 25% past accepted replay; cycle zero has no past accepted data, so its effective mixture is 100/0

Full candidates initialize from checkpoint `ea36d0b9…a8c4` and train for two epochs with batch 256 and learning rate 3e-6. Only two prospective target mixtures are allowed:

| Arm         | Deep search-score fraction | Final-outcome fraction | trainer `wdl_mix` |
| ----------- | -------------------------: | ---------------------: | ----------------: |
| lambda-0.50 |                        50% |                    50% |              0.50 |
| lambda-0.75 |                        75% |                    25% |              0.25 |

The naming is easy to reverse: local `wdl_mix` is the **outcome** fraction, not the search-score fraction. Lambda 0.75 therefore maps to `wdl_mix=0.25`.

Both arms produced validated checkpoints from the 82-row fixture. This confirms the binding from authenticated input through split, initialization, fixed arguments, and artifact hashes. Those tiny checkpoints will not be played or promoted; 82 rows are not strength evidence.

## 6. What will count as stronger

Completion of the 24,000 games still does not trigger a live change.

1. Verify the completed run manifest and every shard
2. Publish the fixed train/validation holdout and train both arms
3. Quantize selected candidates and confirm runtime parity
4. Run a **56-game screen** against the immutable comparison model
5. Advance only a passing candidate to a fresh **independent 96-game** confirmation
6. Advance only another pass to the **formal 768-game** match
7. Consider live promotion only after both formal superiority and external calibration pass

Each candidate stops at its first failed gate. The family is capped at three cycles and stops after two consecutive rejected cycle candidates. We will not keep adding epochs to a failed recipe and call the extra compute progress.

## 7. Current position

The confirmed outcome today is not “the AI is stronger.” It is that the no-gain static lane has been closed and the full self-play generation is genuinely using 12 local workers. Live remains unchanged, and playing-strength measurement is still ahead.

The next useful report is the completed-game count, retained-position count, terminal distribution, duplicates, faults, and elapsed time for all 24,000 games. Only after that can we produce two full candidates and direct match numbers. The goal is not to say that training ran; it is to show that a candidate **statistically beats the immutable comparison model under the same playing conditions**.

The design draws on the [Stockfish NNUE training documentation](https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md) and [YaneuraOu's NNUE training notes](https://yaneuraou.yaneu.com/2018/12/30/nnue%E8%A9%95%E4%BE%A1%E9%96%A2%E6%95%B0%E3%81%AE%E5%AD%A6%E7%BF%92%E6%96%B9%E6%B3%95%E3%81%AB%E3%81%A4%E3%81%84%E3%81%A6/). General success elsewhere is not evidence that this candidate will improve. Our conclusion will come only from the saved data and direct games in this cycle.
