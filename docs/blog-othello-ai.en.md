# Strengthening an Othello AI with the Same Discipline I Used for Shogi

> My personal site (meetyudai.com) has a handful of mini-games with AI opponents. I already rebuilt the shogi AI in a separate article ([Shogi AI rebuild](./blog-shogi-ai-rebuild.en.md)). This time I applied the same discipline I established there — *stack only changes that are proven not to regress, verified by A/B* — to the Othello AI. This is a running work-log of what I did, what I learned, and what didn't work. Japanese version: [blog-othello-ai.md](./blog-othello-ai.md).

---

## TL;DR

- Before touching any code, I built the **measuring sticks**: a self-play A/B harness (color-swapped pairing to cancel first/second-player advantage) and a move-generation correctness check (perft — 0 mismatches across 18,154 positions). So I could talk in numbers, not "it feels stronger."
- The first thing that worked wasn't a new feature — it was a **bug fix**. The evaluation's mobility term had its **sign flipped for White** (it scored "the more moves I have, the worse" for the White side). Fixing that alone won **82.5% at medium / 93.8% at hard** (the gap widens the deeper it searches).
- I deleted 82 lines of unused pattern-evaluation code (dead code that was **allocating millions of array slots every single move**) — after proving via A/B that the eval output didn't change by a single bit.
- Adding evaluation terms (**corner-relative X/C squares** and **frontier discs**) was **noise on its own for both (51–54%), but jumped to 64% when combined** — a great example of evaluation terms interacting.
- Fixing the difficulty ladder (expert/master were no stronger than hard) had a trap: **raising the fixed search depth caused a 7-second UI freeze at depth 7**. I solved it with **time control** — wiring up an `aborted` branch that was already embedded in the code but had never actually fired — so the top tiers search deeper *safely*.
- Consistent discipline throughout: **record the experiments that didn't work, honestly**, and guarantee every time that **"the implementation I measured in A/B" and "the implementation I actually shipped" are the same thing**, by reproducing the exact result with the same random seed. All the same as the shogi work.

---

## Why Othello?

Board-game AI is built from two pillars: **search** (looking ahead) and **evaluation** (scoring how good a position is). Othello is an especially good subject for this approach:

- The board is small — 8×8 = 64 squares — so **solving to the end** ("perfect play") becomes practical in the endgame.
- The quality of a move is strongly governed by clear principles: *can you take a corner?* *can you reduce your opponent's available moves?*
- There is a rich body of established techniques for speed and strength: **bitboards** (representing all 64 squares in a single 64-bit integer) and **pattern evaluation** (the Logistello approach).

Because the state is simpler than shogi, the effects of "search deeper" and "evaluate more correctly" show up cleanly. It's an ideal practice ground for strengthening.

---

## 0. Starting point: taking stock of the current Othello AI

The AI lives in `src/components/game/Othello/`. A comment says it's "based on the Thell 3.0.3 implementation." Thell is a real, strong Othello engine, and the skeleton here was legitimately built. The files:

- `Board.ts` — board state and move generation
- `AI.ts` — search (alpha-beta)
- `Evaluator.ts` — evaluation function
- `MobilityTable.ts` — precomputed table for move generation

Reading through it, I found that **the skeleton was impressive but had holes in the guts.**

### Board representation & move generation (Board.ts)

Not bitboards, but a **"line-index + mobility-table" scheme**. Each row, column, and diagonal of the board is encoded as a base-3 number (each cell packed in as `color+1`; since the color constants are white=-1, empty=0, black=1, the digit values are white=0, empty=1, black=2), and that number keys a precomputed table of "where can you play on this line and how many discs flip." Each move updates the indices incrementally, so it doesn't rescan the whole board every time. It's not a bitboard, but it's a legitimate and fast enough implementation.

### Search (AI.ts)

- Alpha-beta (pruning look-ahead) + PVS (a null-window confirmation of the principal line for speed)
- Iterative deepening (search progressively deeper from shallow depths)
- A dedicated endgame solver (`last1`–`last4`, hand-expanded to read out the final 1–4 moves fast)
- The endgame switches from "just decide win/loss/draw" to "solve the exact disc difference"

A textbook-correct structure. But the weaknesses were also clear:

- **No transposition table (TT).** It re-searches the same position many times.
- **No move-ordering heuristics** like killer/history moves.
- Move ordering is done by **fully evaluating every child position and sorting** — which is heavy.
- Iterative deepening exists, but the **time-out flag (`aborted`) never fires**, so it effectively runs at a fixed depth.
- **The expert/master difficulties have exactly the same parameters as hard** (depth 6). Choosing a higher difficulty doesn't make it any stronger.

### Evaluation (Evaluator.ts) ← the biggest weakness

This is where the most upside was. The **scaffolding for Logistello-style pattern evaluation** (splitting the position into many small patterns and scoring each with learned weights) **existed, but its contents were all zero.** `stageWeights` (a weight table per pattern × 15 game stages) is initialized to all zeros by `createDefaultWeights()` and then never trained or read — completely dead code. The diagonal indices and the `corner25` table were likewise unused.

The evaluation that was actually doing the work was a simplified version alongside that dead code:

1. A fixed positional weight table (corners high, squares next to corners low, etc. — hand-tuned)
2. Mobility (the difference in the number of available moves)
3. Corner stability (a bonus for holding a corner)
4. Parity (the even/odd count of empty squares)

And in that simplified mobility term, I found a **sign bug.** That became the first target.

---

## 1. Chapter 1: Start with the smallest clearly-correct fix

The lesson from shogi was: "80–90% of plausible-sounding ideas get rejected in A/B, so build small, correct, and verified." Same discipline for Othello. The first thing I touched was not a guess — it was an **obvious bug.**

### Build the verification foundation first

Before touching any code, I set up the same "A/B self-play harness" and "move-generation correctness check" I used for shogi.

- `scripts/othello-ai-match.ts` — plays two engine configurations against each other from randomized opening positions. It plays **each opening twice with the colors swapped** to cancel any first/second-player advantage, and tallies win rate, score rate (draws worth 0.5), and average disc margin from engine A's perspective.
- `scripts/othello-perft.ts` — checks the mobility-table move generation against an independently written brute-force reference at every position, and also verifies that move→undo restores the board exactly.

Harness sanity checks:

- **Engine vs. random play**: 40 wins out of 40, +39 discs on average. Confirms the current engine is far stronger than random (i.e. the evaluation does something).
- **Engine vs. itself**: exactly 20–20, average disc margin 0.00. Confirms the color-swap pairing gives the harness **zero color bias.**
- **perft**: 0 mismatches across 300 games / 18,154 positions, for both move generation and make/undo. The incremental update is trustworthy.

Now I had a ruler for saying "it got stronger."

### The bug: the mobility term's sign was flipped for White

By convention (and because of how the search negates scores), the evaluation returns a score **from the side-to-move's perspective.** The code computes each term in an absolute frame (black-positive) and then multiplies the whole thing by `the color to move (black=+1, white=-1)` at the end to convert to the side-to-move frame. Position and stability are written correctly this way.

But the mobility term alone was computed **from the start as "my side − opponent" = the side-to-move frame.** Then the final `× color-to-move` multiplies it *again*. The result: **for White, the mobility sign is inverted**, so it evaluated "the more moves I have, the worse." Mobility is an extremely important signal in Othello, so this hurts real play.

The fix is simply to compute mobility in the same absolute frame as the other terms (black mobility − white mobility, independent of whose turn it is). The final `× color-to-move` then converts it correctly.

As with shogi, I **left the production default untouched and isolated the fix behind a flag**, then pitted "before" against "after" directly in A/B.

### Results

Fixed version (A) vs. buggy version (B), self-play A/B. Random 6-ply openings, each played twice with swapped colors:

| Difficulty | Games | Fixed version score rate | Avg. disc margin |
|---|---|---|---|
| medium (depth 4+) | 120 | **82.5% ± 3.5%** | +25.0 discs/game |
| hard (depth 6) | 40 | **93.8% ± 3.8%** | +28.1 discs/game |

An unmistakable improvement, far beyond the ±1σ error. And **the gap widens the deeper it searches** (medium 82.5% → hard 93.8%). This is intuitive: when the evaluation becomes correct, a deeper search amplifies that correctness more. Conversely, searching a buggy evaluation deeply just searches deeper in the wrong direction.

Choosing an "obvious bug" rather than a "plausible new feature" as the first target was the right call. New features get rejected ~80% of the time in A/B, but **a sign-inversion bug improves things for certain once fixed.** Stack one sure step first, then move to the uncertain improvements.

I switched the production default to the fixed version and deployed. The old behavior is frozen as `mobilityFrameFix: false`, kept as an immutable A/B baseline.

### Chapter takeaways

- **An evaluation function must return "the score from the side-to-move's view" with a consistent sign.** If just one term's coordinate frame is off, it silently breaks for one color.
- **Build the ruler (A/B harness + correctness check) before touching code.** Be able to state improvement in numbers, not "it feels stronger."
- **Color-swap pairing** cancels first/second-player advantage, so the difference in the evaluator itself shows up even with few games.
- Start with the **smallest clearly-correct fix.** Big design changes and uncertain new features come after.

---

## 2. Chapter 2: First, clean up the dead evaluation code

The automated reviewers (Gemini/Copilot) gave a good comment: "the `MidEvaluator` constructor recomputes lookup tables in a 6561-iteration loop every time — that's heavy." Digging in, the root was deeper.

The "empty Logistello scaffolding" from Chapter 0 — `stageWeights` (a weight table per pattern × 15 stages), `reversedLast5`/`first5`, `createDefaultWeights()` — was **completely dead code, never read by `evaluate()`.** And in production, **`new OthelloAI()` → `new MidEvaluator()` runs on every single move** (`Othello.tsx`), so this dead-code initialization — 15 stages × `createDefaultWeights()` (each allocating several arrays of 59,049 elements) + two 6561-iteration loops — **was re-run in full every move.** Millions of array-slot allocations per move. A candidate cause of UI stalls.

I chose **deletion over hoisting (to a module constant).** Sharing code that's never read is pointless, and it would only obscure the evaluation improvements in later chapters. I deleted 82 lines including the `Weights` type and `createDefaultWeights`, and the constructor became the single line `this.opts = opts`.

**Verifying "the behavior does not change by one iota" is important.** Deleting dead code shouldn't change `evaluate()`'s return value by definition — but never assume. I confirmed via A/B:

- Fixed version vs. old version (medium, n=120): **exactly 98 wins / 20 losses / 2 draws, 82.5%, +24.98 discs — identical before and after** the deletion (proof the eval value is bit-for-bit unchanged).
- Engine vs. itself: exactly 50%, 0 average margin (the deterministic symmetry is preserved too).
- perft: PASS (move generation is unrelated, but a cheap safety check).

As a side effect, the A/B runs got faster too (combined with reusing cached AI instances, the same 120 openings went from 119s → ~75s). A step that changed no strength, just cleaned up the foundation.

### Chapter takeaways

- **Address review comments only after verifying them.** Behind the surface (heavy initialization) can be the real issue (it was dead code all along).
- **Even when deleting dead code, confirm "no behavior change" via A/B.** If a single number shifts, then it wasn't dead code.
- **Separate cleanup PRs (no strength change) from improvement PRs (strength change).** Mixing them makes the A/B causality unreadable.

---

## 3. Chapter 3: Adding evaluation terms — useless alone, effective together

With the foundation cleaned up, I added evaluation terms one at a time and ran each through A/B. I prepared two:

- **Corner-relative X/C squares (`cornerRelative`)**: the fixed positional table penalizes the X-square (−40) and C-squares (−20) next to a corner unconditionally. But an X-square is only dangerous *while the adjacent corner is still empty.* **Once you own the corner, the neighbor is safe** (in fact, likely to become a stable disc). Yet the penalty remained. So I added: "if you own the corner and its adjacent X/C square is also your color, cancel the positional-table penalty and add a small bonus."
- **Frontier discs (`frontier`)**: a disc of yours that touches an empty square is a frontier disc. It's easy to flip and tends to hand the opponent moves. **Fewer of your own frontier discs is better.** I added `(white frontier − black frontier) × weight`.

### On their own, both were noise

The shogi lesson: "80–90% of plausible ideas get rejected in A/B." Exactly so — measured at medium with color-swapped pairs:

| Term | Solo score rate | Verdict |
|---|---|---|
| `cornerRelative` alone | 51.6% ± 4.0% (n=160) | ~50%, within noise |
| `frontier` alone | 53.8% ± 3.9% (n=160) | borderline, not decisive |

It would not have been unreasonable to give up here and reject both. But **turning both on at once** changed the picture.

### Together, it clearly worked

| Test | Games | Both terms ON, score rate | Avg. disc margin |
|---|---|---|---|
| medium, seed A | 240 | **64.4% ± 3.1%** | +8.0 discs/game |
| medium, seed B (reproducibility) | 240 | **59.0% ± 3.2%** | +5.7 discs/game |
| hard (depth 6, confirmation) | 32 | **67.2% ± 8.3%** | +8.9 discs/game |

A winning margin beyond the error, across two different random seeds and two depths. And **the gap widens the deeper it searches** (medium 59–64% → hard 67%) — the same "good evaluation gets amplified by deeper search" pattern as the mobility fix.

Why does it fail alone but work combined? My guess: `cornerRelative` encourages "confidently filling the squares next to a corner you've taken," and `frontier` encourages "not needlessly exposing discs." With only one, a side effect (e.g. "taking the corner and filling its neighbor increases frontier discs") cancels the benefit; with both, you get a coherent policy — **fortify the corner while keeping exposure down** — and they mesh.

### Implementation and deployment discipline

I ran the experiments behind throwaway flags (`cornerRelative` / `frontier`) and, once the win was solid, **switched the production default ON** (same style as the mobility fix). The old evaluation is kept as `base` (both terms OFF) as an A/B baseline. And the most important check — **"does the clean production implementation reproduce, exactly, the win rate I measured in the experiment?"** — I ran `mid` (the new default) vs. `base` with the same seed and same game count, confirmed it matched the experiment game-for-game, and only then committed. This guarantees that "the implementation that did well in A/B" and "the implementation I actually shipped" are the same thing.

### Chapter takeaways

- **Evaluation terms interact.** If you measure one in isolation and toss it as "no effect," you'll miss the ones that work in combination. Conversely, even when a combination works, **isolate which term contributes** what.
- **Judge borderline results (52–54%) with more games or in combination** with other terms. Don't jump on a small sample.
- **Guarantee the identity of "the experimented implementation" and "the shipped implementation"** by reproducing it with the same seed.

---

## 4. Chapter 4: Fixing the difficulty ladder — using "deeper is stronger" safely

The current flaw: the expert/master difficulties have **exactly the same parameters as hard** (depth 6). Choosing a higher tier makes it no stronger at all. And although iterative deepening exists, the time-out flag (`aborted`) never fired, so it effectively ran at a fixed depth.

"Deeper is stronger" was obvious from fixed-depth A/B: **depth 8 vs. depth 6 is 4–0, +17 discs on average.** So just make expert=7, master=8, right? ... And then **I measured the per-move thinking time, and that's where the trap was.**

### The trap: raising fixed depth freezes a move

The production AI runs **synchronously on the main thread** (the UI freezes during search). So it's not "average thinking time" that matters, but "the worst single move." Measuring per-move time by depth:

| Setting | Median | p95 | Worst single move |
|---|---|---|---|
| depth 6 (current hard) | 177ms | 494ms | 2841ms (endgame solver) |
| depth 7 | 557ms | 2041ms | **7135ms** (38th move) |

At depth 7, a move froze for **7 seconds.** The cause: an existing "boost" that adds +2 to the search from the 38th move onward (making depth 7 → 9), and the heavy move ordering that fully evaluates every child before sorting. A naive ladder that just raises fixed depth causes **a multi-second UI freeze = a clear UX regression.** That violates the "zero regressions" principle.

### The fix: restore iterative deepening to its true form with time control

The correct answer is not to fix the depth but to **bound by time.** The engine already had `if (this.aborted)` branches embedded throughout the search — designed for time control, but nobody was ever firing them. So I connected the wiring:

- At the start of a search, set a deadline (`deadline = now + budget`).
- At key points in the search, check the clock every so many nodes, and set `aborted` once the deadline passes.
- Iterative deepening becomes: "first search a shallow depth to completion, then deepen until the deadline; discard any depth that got aborted mid-search and return the move from the last completed depth." — **so a valid move is always returned, no matter how little time there is.**

Difficulty → time budget: easy/medium/hard **keep their existing fixed depth** (deterministic, unchanged); expert=1000ms, master=2500ms. The new path only runs when there's a budget, so the existing behavior is bit-for-bit unchanged (hard vs. hard is exactly 50%, and the medium evaluation improvement reproduces exactly — both confirmed). **The exact endgame solve is exempt from time control** (it must read to the end for correctness; this is shared with hard and was already ~3-second class).

### Measurements

**Did per-move time stay within budget** (mid-game moves)?

| Difficulty | Worst mid-game move | Note |
|---|---|---|
| expert (budget 1000ms) | ~1010ms | cleanly bounded |
| master (budget 2500ms) | ~2512ms | cleanly bounded |

The 7-second freeze seen at depth 7 is gone; every mid-game move is within budget. The endgame solver's few-second spike is behavior shared with hard — not something the ladder newly worsened.

**Did it get stronger?** (Time-controlled games are slow, so few games and high noise, but:)

- expert (1000ms) vs. hard (depth 6): **59.4% ± 12.3% (+3.9 discs, n=16)** — winning
- master (2500ms) vs. hard (depth 6): **58.3% ± 14.2% (+1.8 discs, n=12)** — winning

Time control is non-deterministic (depends on wall-clock), so it's hard to gather a large sample and the error alone is large. But the foundation is the **decisive result that depth 8 crushes depth 6 4–0**, and time control is the mechanism for reaching that depth within a time budget (timing measurements also confirmed expert/master search beyond hard's depth 6). From a state where the top difficulties were "identical to hard," this is a sure step forward. The reason master (2.5s) and expert (1.0s) don't separate in this small sample is that both comfortably beat hard (so the difference is buried) and diminishing returns on depth.

### Chapter takeaways

- **A way to make the AI stronger (search deeper) can break UX (freeze).** You won't see it unless you measure "the worst single move's time."
- **Time control beats fixing the depth.** On a fast machine it goes deeper, on a slow one shallower, and **the thinking time is always constant.** This is what iterative deepening is *for* (it secures a shallow move first, then deepens, so it's safe to be cut off partway).
- An unused mechanism embedded in existing code (the `aborted` branches) turned out to be the wiring toward the right answer. **Reading "why is this branch here?" reveals the design intent.**

---

## Epilogue: what got stacked up

| Stage | Change | Measurement |
|---|---|---|
| 1 | Fix the mobility coordinate-frame bug | medium 82.5% / hard 93.8% |
| 2a | Remove dead code | behavior unchanged (fewer per-move allocations) |
| 2b | Corner-relative X/C squares + frontier discs | noise alone → combined 59–64% (medium) / 67% (hard) |
| 4 | Difficulty ladder (time control) | top tiers search deeper than hard; moves stay within a time cap |

I was able to reproduce, on a different game, the same discipline I used for shogi: **confirm zero regressions via A/B, and stack only the changes that got stronger.** I recorded the experiments that didn't work (the corner-relative and frontier terms on their own), honestly. If there's a next step, it would be in the direction of speeding up the search (lighter move ordering, a transposition table) to go deeper, or freeing the main thread with a Web Worker to allow longer thinking times.

(End of log)
