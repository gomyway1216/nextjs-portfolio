# My Shogi AI's Opening Was Way Too Weak, So I'm Rebuilding the Book From "Whack-a-Mole" to Full Coverage — From a Floating-Rook Bug Hunt to a Large-Scale Opening-Book Pipeline

> A sequel to "[My Blog's Shogi AI Was Embarrassingly Weak, So I Had a Fleet of AI Agents Rebuild It in a Day](./blog-shogi-ai-rebuild.en.md)". The NNUE eval made the midgame and endgame strong — but the AI stayed **oddly weak in the opening**, repeatedly playing the same "premature floating rook." This is the record of chasing that down: diagnosis → adding book lines one at a time (whack-a-mole) → measuring the limits of that approach → pivoting to a large-scale opening-book pipeline. As always, every failure and finding stays in. (Serialized: I'm appending as the work progresses.)

---

## 0. Map of this article

1. **The symptom**: the "premature floating rook" the author (amateur 2-dan) kept hitting in real games
2. **Eliminating suspects**: was it the book? the variety mechanism? → both innocent
3. **The real culprit**: NNUE's opening bias, leaking through holes in the book
4. **How the book actually works**: hash lookup, transpositions, falling out of book
5. **Whack-a-mole, documented**: I fixed one line, and the problem moved one ply deeper
6. **What real engines do**: books that are orders of magnitude bigger
7. **The pivot**: from dozens of lines to thousands of positions — a large-scale book pipeline
8. **An honest measurement**: quantifying the book's effect with A/B — and why it looks small in self-play
9. **Cycle 4**: deepen the book to 30 plies + cure the opening bias by retraining the NNUE (shipped to production)
10. **Lab notebook: what didn't work**: the endgame-speedup dead end, how KP features and self-play data couldn't win, and the ceiling on "cheap" gains
11. **What the real games exposed**: the "freeze" bug we'd falsely accused, why multi-threading is only a modest gain, and the NNUE eval that calls the mid-game winner backwards ~90% of the time (in progress)

---

## 1. The symptom: the same "weird move," over and over

It started with a report from the author's real game. On hard mode (~2s per move):

```
▲7f △8d ▲2f △8e ▲Bishop-7g △3d ▲6f △Rook-8d
```

Move 8: **△Rook-8d**, a "floating rook." The floating rook is a legitimate strategy in general — but **at this moment, in this position, it's premature.** To a 2-dan player it feels clearly off. And similar loose moves showed up in other rook-pawn games too.

First, check objectively whether the move is actually bad. Feeding the position to **YaneuraOu** (a superhuman engine) at depth 24:

- Best is **△Bishop-3c** (−23cp from White's perspective)
- **△Rook-8d is −126cp** — about **100cp (a full pawn) worse than best, and outside the top 6 candidates**

The author's instinct was right. The AI was systematically playing measurably inferior moves in the opening.

## 2. Eliminating suspects: don't fix by guesswork

Following the lesson burned in from the previous article — **guessing the cause from the symptom misses; get hard evidence** — I eliminated suspects one by one. I got it wrong twice along the way, and I'm keeping that in.

**Suspect A: the opening book holds a bad move?**
The AI has a handwritten opening book, and plays book moves in covered positions. My first guess: "a bad move slipped into the enlarged book." But the git history showed this book had **every move verified by YaneuraOu at depth 18 (zero blunders)**. Wrong guess.

**Suspect B: the variety mechanism picks loose moves?**
The book deliberately varies its play, accepting moves within a margin of the best (140cp on hard). "That margin, combined with a shallow one-ply evaluation, must be letting loose moves through" — plausible, but also **refuted by measurement**.

The decisive evidence was a **live probe harness**: a test that feeds the actual problem position to the book function. The answer:

```
[game A / hard] book returns: NULL (out of book → search)
```

**The book simply didn't know this position (NULL = out of book).** The book and the variety mechanism were both innocent. △Rook-8d was chosen by the **search (NNUE eval) on its own**, after the game left the book.

## 3. The real culprit: NNUE's "opening bias"

Why does NNUE like the floating rook? There's a structural reason.

- **The floating rook loses no material.** Judged by one-move material balance, it's even.
- NNUE is the "eyes" that turn a position into a number, but **most of its training data is midgame and endgame**. The opening's sense of *shape* — same material, but this rook lift is strategically slack right now — is thinly represented.
- Searching deeper doesn't help: **as long as the leaf eval says "roughly equal," the subtle difference never surfaces.**

This is the opening-side twin of the previous article's **sigmoid saturation** (the endgame disease). Saturation crushed small differences inside a big lead; this crushes conceptual differences inside an equal position. Both are weaknesses of the **evaluation (data)**, not the search.

## 4. How the book actually works (mechanics)

Before the fix, it's worth stating precisely how the book is consulted — this is widely misunderstood.

**Lookup is a hash-table probe on the position.** The book isn't a "list of move sequences" at runtime; at build time the sequences are replayed on a board and converted into a table of **position hash (Zobrist) → candidate moves**. At runtime the current position's hash indexes the table — O(1).

Two important consequences:

- **Transpositions are handled.** Play the moves in a different order and, if you **arrive at the same position, the hash matches and the book hits.** "The book stops working if move orders swap" is a myth here.
- **A genuinely unknown position falls out of book instantly.** The book returns NULL and the engine switches to search. It doesn't "stop functioning" — it hands over to the AI's raw judgment... which is exactly where the §3 bias shows up.

So the book's weakness isn't the lookup. It's **how few positions it covers.**

## 5. Whack-a-mole, documented: fix one ply, the problem moves one ply deeper

Since the culprit was a hole in the book, I plugged it directly: added a YaneuraOu-verified **△Bishop-3c** for the problem line, plus a regression test mechanically guaranteeing "△Rook-8d is never returned."

Hours later, the author reported back:

```
8. △Bishop-3c   ← the fix, working
9. ▲2e
10. △Rook-8d    ← it's back
```

**The fix worked — and fell one move short.** The added line covered through move 8. The instant the author continued ▲2e, the position left the book again, and NNUE played the same floating rook. YaneuraOu confirms: move 10's △Rook-8d is **−85cp** (about 58cp below the best, a quiet △Silver-6b at −27cp). Inferior again.

I extended the line to **move 18** and covered a second natural branch at move 9 (▲Gold-7h). Move 10 now returns △7d (the engine's best), with regression tests. But at this point the conclusion was unavoidable:

> **Adding book lines one at a time is whack-a-mole.** One ply past the patched line, or one branch to the side, the same bias will resurface. Until coverage becomes a *surface* instead of a *line*, this loop never ends.

## 6. What real engines do

The obvious question: **why doesn't a real engine like YaneuraOu play loose opening moves?**

Two-part answer:

1. **Their books are orders of magnitude bigger.** Publicly distributed book files (the YaneuraOu project publishes "standard" and larger books) hold **hundreds of thousands to millions of positions**. In any mainstream opening, the first 20–30 moves never leave book — the eval never gets asked.
2. **Their eval is trained on vastly more data**, so even out of book, the opening doesn't fall apart.

My AI has a book of **dozens of hand-written lines** and a small, data-light NNUE. **Same approach as the pros — just smaller by orders of magnitude.** And as §5 measured, that gap can't be closed by whack-a-mole.

The other finding: **book data exists as a public resource.** Besides the YaneuraOu project's book files, **floodgate** (the computer-shogi game server) publishes its game archives — masses of strong-engine opening play. Hand-writing lines one at a time was never necessary in the first place.

## 7. The pivot: from dozens of lines to thousands of positions (in progress)

So the plan changed. **Build the book as a surface.**

The design:

- **Data source**: convert the YaneuraOu project's public book as the first choice (license check included). If that falls through, auto-generate: run YaneuraOu in parallel, expanding a tree that only keeps moves within 50cp of best at depth 16–18.
- **Delivery**: no giant data in the code bundle — the same **"static file + fetch at startup"** scheme as the NNUE weights. Target: 1–3MB gzipped, **5,000–50,000 positions**.
- **The quality gate stays**: sampled depth-18 verification, **zero blunders** (no move more than 100cp below best). The hand-verified curated lines remain, and take **priority** over the bulk book.
- **Fallback**: if the fetch fails, the engine runs on the curated book as before (no regression).
- **Use all the hardware**: generation/verification runs YaneuraOu across parallel processes (10–12 threads).

Once this lands, mainstream openings stay in book to around move 20, and the "loose move's turn" mostly never comes. From whack-a-mole (patching lines the author happens to hit) to **covering the space up front.**

### 7.1 The result: a 50,000-position book, live in production

The pipeline is done and deployed. The numbers:

**The data source is the YaneuraOu team's "new Petashock book"** — a 2.33-million-position book used at the World Computer Shogi Championship (WCSC35), published under the **MIT License** with an explicit "feel free to use for research" note. (Checking the license is the first step of any ingestion like this.) From those 2.33M positions, a breadth-first walk from the initial position over the opening (≤20 plies) extracted **49,961 positions / 171,512 moves**.

**Delivery is a static 844KB file (535KB gzipped)** — same scheme as the NNUE weights: not in the code bundle, fetched asynchronously at page start (~86ms measured). If the fetch fails, the engine runs on the hand-written book as before — zero regression. The hand-verified curated lines (the basis of the floating-rook regression tests) always take **per-position priority**.

Coverage, before and after:

| | before (hand-written) | after (Petashock ingestion) |
|---|---|---|
| Positions | dozens of lines | **49,961 positions** |
| Distinct positions at move 10 | a handful | **~1,400** |
| Distinct positions at move 20 | — | **~5,100** |
| Measured time in book | out within a few moves | **in book through moves 17–19 at every difficulty**; ~13 moves even against offbeat orders |

The feel changes too: book moves answer in **~0.5s** (vs seconds of search), and the opening simply no longer reaches the "loose move's turn."

### 7.2 The key discovery: even a published book couldn't be trusted blindly

This was the crux of the episode. The Petashock book ships with evaluation scores, so the initial plan was "filter on the bundled evals and the zero-blunder gate is satisfied." **Sample verification said otherwise** — of the moves passing the bundled-eval filter, **about 1.5% were more than 100cp below best when re-measured at depth 18.** A book's scores are from the time it was built; on shallow positions they drift from the current engine's judgment.

So the plan changed to exhaustive verification: **all 171,512 moves (176,941 pre-pruning) were re-scored by YaneuraOu at depth 18, and 5,429 moves more than 90cp below best were pruned.** On the M4 Pro this ran as **12 parallel engines** (never trading depth for speed — parallelism supplies the volume), about 2.5 hours.

And in the middle of that exhaustive run, another trap: with a shared transposition table across parallel engines, **the same position's depth-18 score wobbled by up to ~150cp between runs** — which silently invalidates a 90cp pruning threshold. The fix was a **deterministic protocol that reallocates the TT before every search** (same position → identical score and node count, invariant to how the work is split), established before the measurements counted. An independent-seed re-verification (891 positions / 3,096 moves) found **zero moves >100cp below best.**

> The previous article's lesson — "verification itself is full of traps" — held for book ingestion too. **Don't trust external data's quality labels; re-measure with your own gate. And doubt the measuring instrument itself until it's reproducible.**

---

## 8. So, how much stronger did it get? — an honest measurement

A 50,000-position book shipped — but instead of ending on "and they lived happily ever after," **I measured the effect.** Same engine on both sides, only one side carrying the big book: 144 games of self-play across three conditions (different time controls and opening setups, colors alternating, with 95% confidence intervals).

The honest result: **"a small positive. Not statistically significant."**

| Condition (48 games each) | Book side's score | Elo diff (point estimate) |
|---|---|---|
| 2s/move, random opening | 54.2% | +29 |
| 2s/move, in-book opening | 57.3% | +51 |
| 1s/move, in-book opening | 51.0% | +7 |
| **Total, 144 games** | **54.2% (95% CI 46.6–61.7%)** | **+29 (CI crosses 0)** |

The point estimate is +30–50 Elo, but the confidence interval straddles zero. Detecting +50 Elo significantly would take ~400 games; at this sample size all we can honestly say is "a large effect is ruled out; a small positive one is likely."

**The interesting part is the analysis of *why* it's small.** Digging into the logs:

1. **In self-play, the big book barely fires.** The hand-verified curated book already covers the self-play main line through move 17, and one step off that line puts **both** sides out of book. Even with 50,000 positions, the external book contributed only ~1.3–1.4 moves per game. A book only works while the opponent stays on book shapes.
2. **The "save time in the opening, think deeper in the midgame" effect structurally does not exist here.** The engine's clock is per-move (no game clock), so time saved by book moves doesn't carry over.
3. Which means the big book's real value shows **against humans, not in self-play.** Humans play book shapes, so the game stays inside the net much longer. Indeed, the author (2-dan) clearly feels the opening improved — **self-play win rate and human-facing quality diverge**, a variation on the last article's "proxy metrics don't predict match strength." The same improvement looks different depending on the arena you measure in.

> Added lesson: **an improvement's value depends on the arena you measure it in.** A book that looks marginal in self-play matters a lot against book-playing humans — and vice versa. Decide *what you want to be strong against* before you measure.

## 9. Cycle 4: extend the book to 30 plies, and fix the opening bias in the "brain" itself

The two things flagged as "in progress" at the end of §8 — the **30-ply book deepening plus deviation coverage (v2)** and the **NNUE retrain that targets the opening bias at its root** — both shipped to production. Together they're a clean mirror image of §8's point that "the same improvement looks different depending on where you measure it."

### 9.1 Book v2: 50k → 98k positions, turning a "line" into a "surface"

First, the book was rebuilt with two goals:

1. **Depth**: extend the main lines from ~20 plies to **~30 plies** (all of ply 20, plus the major branches through ply 21–30).
2. **Surface coverage**: give the book a reply to the "natural deviations from book shape" that humans actually play. Do the §5 whack-a-mole by **exhaustive generation** instead of by hand.

The deviation-coverage pass seeds from the 1,200 most-frequently-reached positions, enumerates the book-leaving moves that are still natural (within 300cp), and adds **one YaneuraOu depth-18 reply per deviation**. Result: **49,961 → 97,767 positions** (~1MB gzipped, under the 2.5MB limit). The natural-deviation probe went from **6/10 to 10/10**.

Rebuilding also surfaced **a real hole in v1**: after ▲P-7f, White's reply △P-3d (only 31cp below best — essentially a co-main move) had been clipped by a "expand at most 5 moves per position" cap during generation, so **the entire Ranging-Rook subtree was missing**. Loosening the cap to 8 at shallow plies fixed it. "The line is right but the surface has holes" — this chapter's own lesson, produced by my own book.

Zero-blunder assurance used the same **deterministic protocol**: all 303,321 moves verified at depth 18, moves with gap > 90cp pruned. The reused 50k positions were carried over only after a determinism gate (12 positions matching cp exactly). Independent-seed re-verification found zero moves with gap > 100cp.

### 9.2 NNUE retrain: the "creepy" △Rook-8d was a brain problem

As pinned down in §3, the root cause of the unnatural opening moves (the floating rook △Rook-8d, etc.) was not the book but the **NNUE's opening bias**. A book only works *while you're inside book shape*. If a weird move appears the instant you leave the book, the thing to fix is **the brain itself**.

So I **retrained** on opening-heavy teacher data, without throwing away existing assets — adding ~560k opening positions: nodes from expanding the production book (Petashock-derived) via BFS, centered on **positions one move after leaving the book** (exactly where the weird moves appear), scored with YaneuraOu depth 12. The mixed training set was ~5.9M positions.

**Adoption was decided by real games, not a proxy metric** — this is the contrast with §8:

| Metric | Before retrain | After retrain |
|---|---|---|
| Opening-holdout MAE | 214.7 | **175.6 (−18%)** |
| Opening-holdout pair-acc | 0.897 | **0.931 (+3.4pt)** |
| General-holdout pair-acc | 0.9040 | 0.9001 (**−0.4pt**, a small regression, stated honestly) |
| **Self-play A/B (192 games, colors alternated)** | — | **61.7% win rate (95% CI 54.7–68.3%, p≈0.0006)** |

In the problem position, △Rook-8d sank from **15th to 23rd** in the static ranking, and the floating-rook moves consistently dropped too. Positions where an unnatural move (like a no-promote pawn push) topped the list disappeared.

**And the biggest difference from §8: this time the A/B was statistically significant.** The reason is simple — **the book rarely fires, but the eval works on every move.** §8's large book looked small in self-play because both engines leave the book almost immediately, so the book has "no turn." An eval improvement has no such escape hatch: it acts on every move of every game, so across 192 games the lower bound cleared 50% decisively.

> Added lesson: **"where it takes effect" decides significance.** A change that touches every position (the eval) turns significant in self-play naturally; a change that only helps when conditions line up (the book) shows its true value against humans. Even for the same word "stronger," the right way to measure depends on the nature of the improvement.

(Both were shipped only after independent verification — re-tallying the A/B logs, re-running the holdouts, bit-exact parity, the full test suite passing. The proxy pair-accuracy was *not* used to decide adoption, keeping faith with the earlier "proxy metrics don't predict playing strength.")

## 10. Lab notebook: what didn't work

Writing only about the wins isn't fair. Real development is mostly **experiments that don't work**. After Cycle 4, I ran two more experiments in parallel to push the strength further. One was a complete dead end; the other is looking shaky too. Records of failure are the useful ones, so here they are, honestly.

### 10.1 Make the endgame faster — an "it was already done" dead end

A real-game endgame miss (a mate overlooked at move 72) made me suspect the endgame search was too slow and too shallow. Material-heavy endgames explode the number of drop moves (160–330 drops vs ~20 board moves). Speed up move generation there, the reasoning went, and it reads deeper.

Profiling confirmed that most of an endgame node's cost was **move generation and legality checking** (~99% combined, evaluation only ~1%), driven by the drop-move explosion. A bitmask that computes empty squares and legal drop targets in one pass would speed it up.

**Except: that optimization was already done.** An earlier cycle had shipped exactly that bit-op speedup into both the JS and WASM search (legality-check skipping, one-pass drop-gen precompute). With bit-exactness preserved, there was no remaining fat to trim.

Worse, **the original "it's slow" diagnosis was itself off-target.** The 27–41µs/node figure was measured on the **JS engine**. Production runs the WASM engine (15–30× faster), and re-measuring there put an endgame node at ~2.76µs — with the dominant cost now the **NNUE leaf evaluation, not move generation.** I'd been looking at the "slow spot" through the wrong ruler.

> Added lesson: **measure the exact path that runs in production.** A profile from a proxy engine (the easy-to-measure JS build) doesn't transfer to an optimized, differently-implemented production (the WASM build). "Where the time goes" reshuffles when the implementation changes — the path-level version of the earlier "doubt the measuring instrument."

It wasn't a total zero: I left behind a **benchmark that correctly measures endgame throughput and depth on the production WASM path**, and learned, with numbers, that the next endgame hot path is NNUE evaluation, not move generation. In other words, the road to a stronger endgame also loops back to making the **evaluation (the brain) better/faster.**

### 10.2 KP features — the "smarter input" couldn't win

The second experiment changed **how the NNUE's input is built.** Today the brain feeds the board in directly as "which piece sits on which square." A staple of strong evaluations is **KP (King-Piece)**, which encodes piece placement **relative to your own king's position** — it captures king safety better and is generally said to be a big strength gain. I tried it (splitting the own-king position into 6 buckets, each with its own table: "factored KP").

Training ran fine, and **wiring the KP model into the browser inference (WASM) worked too** (the "inference doesn't support it" wall I'd feared wasn't there — even the per-bucket table selection runs in WASM). So far so good.

The problem is the actual strength. In self-play A/B against the current production (the board-feature runOp1), **the KP version scored 20 wins and 40 losses over 60 games — a 33.3% win rate (Wilson 95% CI 23–46%)**. Even the upper bound of the interval doesn't reach 50% — meaning it's **statistically, clearly weaker**. Its training pair-accuracy was also marginally lower (KP 0.911 vs board 0.916), and it plainly lost over the board. **Not adopted.**

> Lesson: **a "theoretically smarter input" can lose to a plain one.** In Cycle 2, a fancy loss function helped only while data was scarce and got overtaken by plain regression once data was sufficient. KP smells the same: a clever structure may only pay off once there's enough data and training to exploit it (5.9M positions and this training budget couldn't). KP isn't "bad" — it just "didn't win in this configuration." A loss is logged as a loss, and the plain board-feature version stays in production.

### 10.3 What was tried next, and how it turned out

With KP lost and the endgame speedup a dead end, I tried two more levers. The endgame episode's finding — **the production hot path is NNUE evaluation** — pointed the way. The short version: **neither one moved production.**

**(a) Make evaluation faster (SIMD) → already done.**
Vectorize NNUE inference with WASM SIMD128, and deeper search follows in the same time budget, helping every move… except when I went to do it, **it was already implemented and merged in an earlier cycle** (the whole inference hot path is written in v128 instructions, ~6.2× faster on the fast path). I re-verified both bit-exactness (moves, scores, node counts all match) and the speedup independently, but **there was zero new headroom** — the same "dug in and the vein was already mined out" pattern as the endgame.

**(b) Train on self-play data → proxy metrics improved, real games were a tie.**
I redrew the teacher positions from **the positions the production engine actually reaches** (which needed a new generation tool that swaps the search's leaf eval to the production NNUE while playing on). Generated 239k positions, mixed into the existing 5.9M, retrained.

- **Holdout (proxy) improved:** on the self-play distribution, MAE −8% and pair-accuracy +0.86pt. The "correct the distribution mismatch" mechanism did work.
- **But the A/B was a tie:** candidate vs current production, **96 games at 52.1% (1000ms was exactly 50.0%), 95% CI [42.2, 61.8]** — straddling 50% widely. Below the adoption bar, **not adopted.**

Why it didn't translate: the reached distribution wasn't as different from the base as expected (only 3% dropped in dedup), and self-play was just 3.7% of the data — **too weak a gradient to move a model already near-saturated on 5.9M positions**. Contrast the Cycle-4 opening retrain, which hit 61.7% with 650k positions at 11% share. Making self-play pay off would need one of: >1M positions, deeper-search generation, or several rounds of iterated distillation.

> Chapter conclusion: **production has spent its cheap wins.** Two sound ideas — KP and self-play data — both showed proxy-metric gains yet produced no significant A/B edge, and every speedup lever turned out to be already implemented. The next step up now lives in "multi-day investment" territory: **re-distilling from deeper labels, a dedicated mate solver, or a bigger network.** The cheap gains are, honestly, picked clean. And that's not a failure — it's progress: we've pinned down, by measurement, **where the ceiling is.** A record of losses is what tells you where to bet next.

## 11. What the real games exposed: a mid-game eval bias (in progress)

Chapter 10 ended with "the cheap wins are spent; next comes multi-day investment." Starting that investment cleared the name of a bug we'd blamed on the wrong thing for a year — and then the author's own games (he's a 2-dan) pinned the AI's single biggest flaw with a hard number.

### 11.1 The "freeze" bug we'd falsely accused

This AI once had **multi-threaded search (Lazy SMP — many cores reading together)**, but it was shelved because in production the page would **hang forever on "AI thinking…"**. The cause was assumed to be a parallel-search deadlock.

Re-investigating in a faithful production build (headless Chrome), bisection showed the opposite:
- **It froze even with parallelism fully off (single-thread)** → parallelism was not the cause.
- **Turning off cross-origin isolation (COEP) fixed it** → the culprit was a header.
- The smoking gun: `net::ERR_BLOCKED_BY_RESPONSE /_next/.../worker-*.js`.

Root cause: **under COEP `require-corp`, the Web Worker's own script body must also carry a COEP header** (CORP alone is insufficient). Without it, the browser blocked the worker script, so the **AI worker never booted and every search hung forever**. It happens single-threaded too. The fix is one line: add COEP to `/_next/*`.

> Lesson: **kill the symptom and you hide the cause.** The old "fix" stripped COOP/COEP wholesale — the freeze vanished, but the real cause stayed buried and an innocent feature (parallelism) took the blame. And a **production-only bug has to be reproduced in a production-identical environment**, not stared at in the source.

### 11.2 Parallelism restored — a modest gain, and why

With the real cause fixed, parallelism finally ran (main + helpers). A/B: **+59% at 2000ms** (the hard/master tiers the author actually plays), **roughly even at 1000ms**. "Reads a bit deeper," but not dramatic. Three reasons: touching the shared TT across the JS boundary costs, a browser gives you only a handful of threads, and — the key one — **depth is only worth anything if the eval is right**. Search a wrong eval more deeply and you just grow more confident in the wrong answer. That third reason feeds straight into the next finding.

### 11.3 The real culprit, measured from the author's own games — the NNUE gets the winner wrong ~90% of the time in the mid-game

Every time the author played, he reported "loose mid-game moves": pointless bishop repositioning, drops onto dead squares, pawns thrown at the *opponent's* king instead of defending his own, attacking when he should defend and losing. To check each one **with the engine**, we reconstructed his real games (ambiguous kifu — where several pieces can reach the same square — were resolved by a **backtracking parser that searches for a self-consistent interpretation**).

Then we lined up **the browser NNUE's eval against YaneuraOu's ground truth, ply by ply**, and a decisive number fell out. In the mid-game (ply 15–70, excluding settled positions):

- **Mean signed error −1525cp** (i.e. in the mid-game it rates its own side — gote — about 1500cp better than reality).
- **Fraction where it even gets the sign of "who's winning" right: only 7.8%.**
- **36 of 51 positions were sign-flipped** (shows gote-good when it's actually sente-good).

In other words, **in the mid-game this NNUE calls the winner backwards about nine times out of ten**. The author's persistent complaint — "the eval bar shows gote crushing even when it's even or sente-better" — was not a misread or a one-game fluke; it was **this severe systematic bug**.

This **explains every real-game loss**: the AI thinks it's winning, so it **picks loose attacks instead of defending, overpushes, walks off a cliff without noticing**. The loose bishops, the pawns at the king, the endgames it can't hold — one root. The same shape as §9 (the "queasy floating-rook" opening move traced to the brain, not the book), but **in the mid-game, and worse**.

> This is the biggest finding of the whole effort. **The largest flaw — missed by self-play A/B and every proxy metric — was nailed in one shot by the author's real games.** The spine of this series ("proxy metrics don't predict playing strength; the author's real play is the final judge") proved itself again.

**The fix (in progress):** re-distill the eval from deeper (depth-16) YaneuraOu labels, **concentrated in the mid-game**. The pass/fail gate is not just win-rate but "**did this mid-game bias (−1525cp, 7.8% sign-agreement) actually shrink**." Data is being gathered in parallel across the author's several Macs right now. Honestly: **deeper labels alone are not guaranteed to fix a systematic bias** — if the cause is data imbalance rather than shallow labels, a different lever is needed. When the result lands — pass or fail — it goes here.

> Lesson (provisional): **a deep search cannot rescue a broken eval.** Before you spend threads reading deeper, fix the eval itself. Strong engines parallelize well because their underlying eval is sound; we're going after the eval first.

### 11.4 Result: deeper labels did NOT fix the mid-game bias (an honest miss)

The re-distillation ran to completion. Starting from the 5.9M-position teacher set, we synthesized **918,566 depth-16 labels** (599k existing positions re-scored + 319k freshly generated mid-game positions from a second machine, focused on ply 20-60). Train (board features, sigmoid, 20 epochs) → quantize → measure against the two gates.

Result (truth = YaneuraOu depth-16, game3 mid-game ply 15-70, n=51):

| | mean signed | sign-agreement | A/B (40 self-play games) | holdout MAE / pair |
|---|---|---|---|---|
| runOp1 (current) | −1524.9 | 7.8% | — | 476.1 / 0.9001 |
| **deep16 (candidate)** | **−1331.3** | **7.8%** | **52.5% (a tie — 95% CI [37, 68])** | **443.2 / 0.9031** |

- **Mid-game sign-agreement went 7.8% → 7.8% — it did not move at all.** The mean signed error shrank 13% (1525→1331), but "who's winning" is still called backwards ~90% of the time.
- The A/B was 52.5% — **a statistical tie**. The only thing that improved was the proxy metric (holdout MAE 476→443, pair-acc 0.900→0.903).
- It **missed the pre-registered adoption gate** (sign-agreement ≥35%, a significant A/B), so it was **not adopted** and never shipped to production.

**What this taught us.** Overall accuracy (holdout) rose while the mid-game sign bias didn't budge a millimeter — strong evidence that **the mid-game bias is not a label-depth problem.** Make the labels deeper and more accurate, and the net still emits the same wrong sign on the same positions. The culprit is more likely the **training distribution** (the mid-games that arise in the author's real play are learned as "gote-favored" in the teacher set), or the fact that this **metric is a single game — game3, 51 positions — too narrow a window.** On the 4000-position holdout the net is well-calibrated (pair-acc 0.90), yet on game3 it's 7.8% — the shape of "the net systematically misjudges a specific kind of mid-game that the author's style produces."

> The spine of this series held up again. **Improving a proxy metric (holdout) guarantees neither playing strength nor the removal of the bias you were aiming at.** "Deeper labels" was a plausible-looking move that, on this one game, looked like a whiff. What will move the needle next is probably not *depth* but *distribution* — oversampling the mid-games the author actually loses, with correct labels — and re-measuring the bias across several real games, not one. A whiff, recorded with the number that shows where you missed, becomes the next aim.

### 11.5 Correction: measured on a second game, it *did* help — the author of "don't conclude from one game" concluded from one game

The "whiff" verdict in §11.4 was drawn from **one game — game3, 51 positions.** The exact mistake this series keeps preaching against — "don't let a proxy or a single sample decide adoption" — and the person writing it walked right into it. So I re-measured on a **different real game, game4 (78 plies)**, with the same yardstick (YaneuraOu depth-16 truth).

game4 mid-game (ply 15-70, n=51):

| model | mean signed | sign-agreement | flips |
|---|---|---|---|
| runOp1 (current) | −607.0 | 25.5% | 23 |
| **deep16 (candidate)** | **−520.3** | **43.1%** | 16 |

**On game4, deep16 clearly improved.** Sign-agreement 25.5% → **43.1%**, mean signed −607 → −520, flips 23 → 16 (30.3% → 48.5% across all positions). The exact opposite of game3's "unchanged."

The reason is simple: **game3 is a game the author lost badly — an extreme outlier where the eval is hopelessly wrong**; game4 is a more typical mid-game. The re-distillation **did** improve calibration on ordinary positions — I just looked at the single worst game and declared it dead.

**Honest revised verdict:** deep16 vs current is **better mid-game bias on game4, equal on game3, slightly better holdout, tied A/B (no regression).** Not a whiff — a **modest, non-regressing improvement to mid-game calibration on typical positions.** The tied A/B means self-play can't separate them, so the final call went to the author.

**Adopted (shipped):** judging it a no-regression gain with better typical-position calibration, the author adopted deep16 as the production eval (swapped after confirming bit-exact parity 1200/1200 and mean quantization error 17cp). It's a small win; **the mid-game of a lost game (game3) that it still can't fix** is left as the next cycle's homework — to be attacked not with depth but with distribution (learning the author's losing mid-games in bulk).

> The most painful lesson here: **the guy sermonizing "never conclude from one game" concluded from one game.** For a negative result especially, widen the sample before you decide adoption. On game3 alone: "deeper labels are useless." Add game4: "they help on typical positions." Same experiment — one extra window flips the story.

## Lessons from this chapter

- **"A verified book" and "a sufficient book" are different things.** Every move can be correct and the coverage still leaks through the holes of a line-shaped book.
- **Verify a fix along the continuation, not just at the position.** Fix one ply and declare victory, and the problem moves one ply deeper (lived experience).
- **An eval's weaknesses surface at both ends** — the endgame (saturation) and the opening (strategy). The midgame is strong because that's where the training data is thick.
- **Look for public resources first.** Reinventing the wheel (hand-written book lines) runs straight into a wall of scale.
- **Never trust external data's quality labels blindly.** The bundled evals let 1.5% inferior moves through; only re-measuring every move with our own depth-18 gate justified the words "zero blunders."
- **Doubt the measuring instrument until it's reproducible.** A shared TT wobbled identical positions by ~150cp, silently breaking the pruning threshold. Make the measurement deterministic first.
- **Design the fallback before the feature.** "Fetch fails → hand-written book, unchanged behavior" is what makes a big change safe to ship.
- **"Where it takes effect" decides significance.** An eval change (every move) turns significant in self-play; a book change (only under the right conditions) shows its value against humans. Same goal, different correct measurement (Cycle 4).
- **For a weird move, suspect the brain, not the book.** A blunder the instant you leave book is cured by an opening-heavy retrain. Don't let the proxy metric (pair-acc) decide adoption — settle it on 192 real games.
- **Kill the symptom and you hide the cause.** A production-only freeze shouldn't be papered over by disabling the feature; reproduce it in a production-identical environment and expose the real cause (a missing COEP header). We'd falsely blamed innocent parallelism (Ch. 11).
- **A deep search can't rescue a broken eval.** Multi-threaded depth only pays off when the eval is sound; strong engines parallelize well because their base eval is good. Order of operations: eval first, then depth (Ch. 11).
- **The biggest flaw was found by the author's real games.** A mid-game eval bias (winner's sign backwards ~90% of the time) that self-play A/B and every proxy metric missed — surfaced in one shot by a 2-dan's actual play. The real games are the final judge, re-proven (Ch. 11).
- **Don't conclude from one game — the guy preaching it did exactly that.** The deeper-label re-distillation looked like a whiff on game3 alone, but re-measured on game4 the mid-game sign-agreement improved 25.5→43.1%. For a negative result especially, widen the sample before deciding adoption. The real picture: a modest, non-regressing gain in typical-position calibration, with a tied A/B (Ch. 11).
