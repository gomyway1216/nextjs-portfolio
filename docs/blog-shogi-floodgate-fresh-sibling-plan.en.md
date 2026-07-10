# Do not add another seed: change only the data with 1,400 strong Floodgate games

> Exact-int16-aware training improved deployed sibling-pair accuracy over stable for all three WCSC36 seeds. It still produced **0/3** candidates that passed the complete top-1 and quantization contract. Reusing the same 341-parent selection set to tune another seed or loss would optimize the development set, not demonstrate strength. The next experiment therefore freezes the model, objective, seeds, and gates while replacing the data with independent strong-engine Floodgate games. 日本語版: [blog-shogi-floodgate-fresh-sibling-plan.md](./blog-shogi-floodgate-fresh-sibling-plan.md)

---

## TL;DR

- Use the official [Floodgate archive](https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/) from 2026-01-01 through 2026-03-31. All 90 daily pages exist; 36,168 of 36,419 CSA records are in the target `floodgate-300-10F` event
- Require both full player identities to be in rating group 0 with at least 30 cumulative games before the game date, both embedded game-time ratings to be at least 3600, a legal hirate game starting with sente, and `%TORYO` termination. Join by the CSA identity hash, never the visible name alone
- Lock exactly 1,400 games before teacher scores: 1,000 training, 200 fresh selection, and 200 fresh final holdout. At 24 parents per game, the roles contain 24,000 / 4,800 / 4,800 parents
- Protect each parent plus **every legal child position** by semantic ID. Apply priority final → selection → training and exclude the 8,678 existing WCSC36 protected IDs
- Use YaneuraOu depth 16. The candidate union is MultiPV 12, the strong game's played move, and stable runOp1's fixed-depth-11 move. Rescore every candidate independently
- Keep the `2282→256→32→1` model, exact-int16 STE objective, seeds 42/43/44, 20 epochs, `lr=1e-4`, and 500,000-row replay unchanged. Fresh data is the only experimental factor
- Do not create fresh-selection labels until all three final checkpoints exist and strict-load. Create either final-holdout label set only after a family static pass. Production remains runOp1 after any failure
- After every internal gate, require the fixed 384-game paired A/B and a separate 200-rated-game official 81Dojo COM calibration. This plan calls the result “stable high-dan” only if every post-game rating for games 171–200 is at least 2050

---

## 1. Why the next attempt changes data, not another hyperparameter

The failed QAT experiment was not empty. All three deployed int16 checkpoints beat stable on within-parent pair accuracy, so training through the production integer path produced a repeatable partial gain. Top-1 and float-to-int16 stability did not repeat across seeds, however.

The used development set had only four WCSC36 games and 341 parents. One changed top-1 parent moves the metric by about `0.00293`, or 0.293 percentage point. Seed 43 missed its stable top-1 gate by exactly that granularity. Continuing to inspect this set while changing seeds, learning rate, or loss weights would invite overfitting.

The training distribution was also narrow: 1,725 parents from 28 WCSC36 games. The new hypothesis is deliberately singular:

> If the exact-int16 family is unstable mainly because its strong-game distribution is too small and narrow, applying the unchanged training contract to a much larger independent corpus should make pair, top-1, and quantization fidelity pass together across seeds.

This experiment does not simultaneously enlarge the network or add KP features. Otherwise a result could not be attributed to the data change.

## 2. Label-blind public inventory

The Q1 2026 Floodgate inventory found:

| Item                            |                 Observed |
| ------------------------------- | -----------------------: |
| daily URLs returning HTTP 200   |                  90 / 90 |
| all CSA links                   |                   36,419 |
| `floodgate-300-10F` links       |                   36,168 |
| January / February / March      | 12,790 / 11,716 / 11,913 |
| exact daily-listing HTML bytes  |               10,098,337 |
| 90-row listing manifest SHA-256 |        `05d35341…bfc822` |

The first cumulative snapshot covering the complete period, [players-floodgate-20260401](https://wdoor.c.u-tokyo.ac.jp/shogi/x/rating/players-floodgate-20260401.html), is 332,094 bytes with SHA-256 `17bd9969…ac5b4`. Group 0 contains 316 identities; 152 have rating at least 3600 and at least 30 games. Header checks on only the first 9,000 name-prefiltered records already found at least 8,391 games satisfying both identity and embedded game-time-rating conditions. The fixed 1,400-game quota is therefore feasible without lowering quality thresholds.

No teacher centipawn score, winner-based filter, candidate score, or sealed local holdout was read for this inventory.

### Visible names are not identities

Five visible names map to multiple identity hashes. Filename-only filtering is therefore invalid. The source pipeline must cross-check these CSA fields:

```text
'rating:<player+identity-hash>:<player+identity-hash>
'black_rate:<identity>:<game-time-rate>
'white_rate:<identity>:<game-time-rate>
```

The official rating page cautions that ratings in different groups are not comparable. Restricting the corpus to group 0 is a within-pool engine-strength filter, not a conversion to human rank.

## 3. Frozen source filter

For each game, use the same-date cumulative `players-floodgate-YYYYMMDD.html` snapshot generated before that day's games.

1. Both full identities are in group 0
2. Both have at least 30 cumulative games in that snapshot
3. Both embedded CSA game-time ratings are at least 3600
4. The two full identities are distinct
5. Event is exactly `floodgate-300-10F`
6. Hirate initial position, sente to move, and every move is legal
7. Terminal is exactly `%TORYO`
8. At least 24 parent candidates exist from zero-based ply 16 through 119

The pipeline must not filter by winner, opening name, apparent played-move quality, teacher score, or candidate-model score. If exact CSA bytes appear at multiple URLs, only the lowest UTF-8-bytewise URL remains. Within each role, games containing one identity are capped at 10%, and the same unordered identity pair is capped at 2%. If exact quotas fail, the run stops without relaxing rating, experience, diversity, or semantic-isolation rules.

Remote acquisition uses at most four concurrent requests with at least 100 ms between starts. It rejects other origins, redirects, queries, fragments, userinfo, and non-default ports. Exact listing, rating, and CSA bytes are SHA-256 locked and reproduced offline after discovery.

## 4. Seal 1,400 whole games into three roles

| Role                | Games | Parents/game | Parents | Labels become available                 |
| ------------------- | ----: | -----------: | ------: | --------------------------------------- |
| training            | 1,000 |           24 |  24,000 | after the role lock                     |
| fresh selection     |   200 |           24 |   4,800 | once, after all three final checkpoints |
| fresh final holdout |   200 |           24 |   4,800 | only after the static family passes     |

Each role has a separate domain-separated game hash. Allocation priority is fresh final, fresh selection, then training; no game may enter two roles.

Each game's preferred 24 parents are six from ply 16–31, twelve from 32–79, and six from 80–119. A short phase fills from the same game's remaining ply-16–119 parents in a separate deterministic hash order. This retains broad phase coverage without admitting only unusually long games.

### Protect every legal child before labels exist

For each candidate parent, enumerate legal moves and create this label-free set:

```text
protected(parent) = parent position ID ∪ every legal child position ID
```

Any parent group touching the existing 8,678-ID union of WCSC36 selection, unopened final holdout, and production-policy exposure is ineligible. New cross-role overlaps are dropped in final → selection → training priority. Parent-to-child transpositions count as collisions, as do duplicates within a role.

This protects the final input space without generating its MultiPV candidates or teacher labels early.

## 5. Teacher and candidate policy

The teacher remains YaneuraOu at fixed depth 16, the depth that completed reliably in the earlier pilot. The pipeline pins the binary, evaluation tree, and receipt for the official [YaneuraOu](https://github.com/yaneurao/YaneuraOu) USI/MultiPV engine.

The candidate union is:

- YaneuraOu MultiPV 12
- the strong game's played move
- the current runOp1 production-int16 move at fixed depth 11

Each candidate is then searched independently with MultiPV 1, exactly one `searchmoves` move, and depth 16. The engine receives `isready` and a TT reset before the proposal and every candidate. Candidate execution order is ascending UTF-8 bytes. The fixed runtime uses 12 one-thread engine processes, 64 MiB Hash each, and a 600-second per-search timeout. Missing, incomplete, timed-out, or provenance-mismatched parents fail closed.

The stable move lets the strong teacher explicitly compare what production currently chooses. Moves from the failed QAT candidates are not added, avoiding adaptation to the already-used selection result.

## 6. Training is unchanged

| Field                                 | Frozen value                                              |
| ------------------------------------- | --------------------------------------------------------- |
| architecture                          | board `2282→256→32→1`                                     |
| initializer                           | runOp1 `571ca309…aa65ff8`                                 |
| objective                             | `0.5 × float full task + 0.5 × exact-int16 STE full task` |
| seeds                                 | 42 / 43 / 44                                              |
| epochs / batch                        | 20 / 256                                                  |
| optimizer / learning rate             | AdamW / `1e-4`                                            |
| replay                                | 500,000 rows / ratio `1.0`                                |
| checkpoint                            | final epoch only                                          |
| early stopping                        | false                                                     |
| selection evaluations during training | 0                                                         |

Architecture, loss, optimizer, seeds, quantization arithmetic, and gates may not change. Training receives no selection path. Fresh-selection teacher work starts only after all three `final.pt` and `result.json` artifacts strict-load under one runtime contract.

## 7. Gates and unlock order

Stable is recomputed on the same fresh selection. Every seed must pass all four conditions:

1. deployed int16 pair accuracy `> stable`
2. deployed int16 top-1 `>= stable`
3. `abs(float-int16 pair delta) <= 0.002`
4. `abs(float-int16 top1 delta) <= 0.005`

The fixed order is int16 pair, top-1, MAE, seed, and checkpoint hash; the median-ranked seed is representative. A family pass requires the representative to pass 4/4, at least two of three seeds to pass 4/4, and all three seeds to pass both quantization-delta gates. The spent WCSC36 selection set is not reopened.

Only a static family pass unlocks, in order:

1. fresh Floodgate final, where candidate pair and top-1 must both be at least stable
2. the existing unopened WCSC36 final under the same requirement
3. general/opening retention, the known `P*8f` regression, and production parity/search/browser checks
4. 384 games in 192 color-swapped opening pairs against stable

The A/B uses a 100,000-replicate paired bootstrap. A one-sided 95% lower bound above 45% is the safety gate; a two-sided 95% lower bound above 50% is required to say “stronger.” Any failure leaves later labels sealed and production unchanged.

## 8. Compute estimate

Linear scaling from the completed WCSC36 depth-16 run estimates 11.47 hours for the 24,000-parent training teacher and 2.29 hours for the 4,800-parent selection teacher: about 13.8 hours to the first static decision. A passing family spends another estimated 2.29 hours on the fresh final, about 16.1 hours maximum. Concurrent three-seed training should take roughly 30–45 minutes.

These are estimates, not promises; candidate counts and timeouts may move them. Teacher search dominates the cost.

## 9. What “stable high-dan” means here

The internal A/B measures strength against stable under fixed conditions; it does not prove a human rank. Only after every internal gate may the candidate play 200 rated games through an official COM account and official client under the [81Dojo terms](https://81dojo.com/en/terms.html), without selected pairings. This plan calls it stable high-dan only if every post-game rating from games 171 through 200 is at least 2050, the lower edge of 5-dan in the [official rank table](https://system.81dojo.com/pages/ranks).

Account, connection, and match details require final user confirmation before execution. No internal score is presented as a conversion to human rank.

## 10. Execution order

1. Merge this plan before the acquisition implementation
2. Implement strict source parsing, checksum locks, role allocation, and all-legal-child protection
3. Acquire once online, reproduce offline, and verify exact quotas
4. Generate training labels only
5. Train the same three QAT seeds concurrently
6. Generate and evaluate fresh selection exactly once
7. Only on pass, continue to finals, regressions, paired A/B, and external calibration

The canonical plan is 10,623 bytes with SHA-256:

```text
3360a1bf3798eb9462797958e8ff893f4e829f896cf90158d98bdbb622f52329
```

This is not an in-place overwrite of the current evaluator. Stable production remains available while an independent candidate passes fresh selection, two finals, retention, search/browser parity, and match evidence. A failed experiment costs compute, not existing playing strength.
