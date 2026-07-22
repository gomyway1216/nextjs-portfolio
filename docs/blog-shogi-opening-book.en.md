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

### 11.6 The distribution approach hits a wall — two straight losses where "more data" backfired

deep16's homework was the game3-type (lost-game) mid-game it couldn't fix. The plan: fix the distribution — **learn the author's losing mid-games in bulk.** Two runs overnight.

**cycle2 (hard-example mining):** self-play with deep16 to generate 250k mid-game positions, **mine the 16,326 where deep16's eval sign disagrees with YaneuraOu-d16 (its blind spots)**, oversample them ×8, retrain. Result:

| | game3 | game4 | holdout | A/B (vs deep16) |
|---|---|---|---|---|
| deep16 (current) | 7.8% | **43.1%** | 443 / .903 | — |
| cycle2 | 7.8% | **29.4%** ⬇ | 448 / .902 ⬇ | 47.5% ⬇ |

Memorizing the blind spots left game3 unchanged, **broke game4's calibration**, and lost games. Textbook overfitting.

**cycle2b (no oversampling):** to isolate whether oversampling was the culprit, just add the 250k as plain deep labels and retrain. Result: **game4 43.1% → 27.5%, holdout also worse, A/B 51.2% (a tie).** So oversampling wasn't the culprit — **adding the M4b-generated data at all made the eval worse.**

The cause is almost certainly this: **positions generated by self-play with deep16 form a narrow, skewed distribution.** Pour 250k of those self-made positions into the diverse teacher set and generalization (game4, holdout) thins out. deep16's winning recipe (base + rescore + M5's 319k) was already a knife's-edge balance; adding to it went downhill.

> **The wall:** neither depth (§11.4) nor distribution (§11.6) moved this mid-game bias — least of all game3's lost game. **deep16 is a local optimum for this data and this small net.** The next thing that could work isn't depth or distribution but a different axis — **more network capacity** (against the browser-speed trade-off), or **accept this strength.** The time for kneading the data ends here.
>
> The consolation: **three straight whiffs, and nothing bad reached production.** The three gates — mid-game bias, holdout, A/B — earned their keep on the losing rounds. **An adoption gate pays for itself not on the experiments that win, but on the ones that lose.**

(Note: the "infinite rook-pawn exchange loop" that recurred throughout this chapter is a separate structural bug — the engine isn't handed the real-game history, so its repetition/sennichite avoidance can't fire — tracked as its own task. Fixing the eval doesn't fix that; it needs its own fix.)

### 11.7 Correction: deep16 was rolled back from production

Section 11.5 said deep16 was shipped because it appeared to be a non-regressing improvement. A later real game exposed a regression in which the engine repeatedly dropped a pawn on the rook file, and the behavior reproduced in the production WASM search at fixed depth 11. In that position deep16 chose `P*8f`; runOp1 chose `3a4b`. Deep16 was therefore removed from production and the weights were restored to runOp1. The production evaluator today is runOp1.

This also corrects the wording in §11.5: calling deep16 "non-regressing" because its A/B was tied was too strong. Failure to detect a difference in a limited A/B is not proof that no regression exists. Better calibration on typical positions can still be outweighed by one bad ranking that search selects repeatedly. **Improved proxy metrics and a tied short A/B did not make this candidate safe for production.**

### 11.8 A one-week detour: the safety foundation remains, but playing strength barely moved

The next plan was to rebuild teacher data from strong Floodgate games. In practice, the work was split across ownership, tamper detection, keys, execution-origin authentication, checkpoints, failure recovery, a separate PR boundary for each stage, independent review, and responses to automated review comments. Some of this has a real purpose: do not train on broken partial data, and do not overwrite production weights by accident. It also left reusable infrastructure. But **almost none of it changed evaluator parameters, teacher labels, search, or game results. Its direct contribution to playing strength was effectively zero.**

The honest accounting is:

| Work | What remains useful | Direct playing-strength effect |
|---|---|---|
| Acquired 36,168 Floodgate games | Strong games available for a future fresh training run | 0 until they are actually used for training |
| YaneuraOu/Háo teacher environment | Can label new data for our own evaluator | Begins only after generation and training |
| Checkpoint, resume, and reproducibility records | Long generation jobs can recover safely | 0 |
| Ownership, key, tamper, and execution-origin boundaries | Prevent wrong inputs and accidental production changes | 0 |
| Many small PRs and non-required review responses | Fixed several implementation details | **0 evidence of added strength** |
| Candidate trained from 24,000 parent positions | About +0.97 points pair accuracy and +1.19 points top-1 on already-used candidate data | Unproven; no direct A/B against production |

The schedule slipped because the safety prerequisites were subdivided without a stopping point while the actual strength work waited. Safety was not worthless. **The mistake was turning each boundary into an end in itself instead of building one minimal gate and moving on.** There is no evidence that responding to automated review comments made the engine stronger; it added waiting and follow-up work. That priority was wrong.

The earlier failures had already warned against assuming that the next plausible step would work. Reduced KP scored 33.3% over 60 games, added self-play data scored 52.1% over 96, and depth-16 re-distillation scored 52.5% over 40. **More data, a deeper teacher, and a somewhat smarter model each failed to guarantee improvement.** Even so, the process assumed that finishing the foundation would eventually produce strength without first defining the current gap, success threshold, and stopping rules.

The order now changes. No PR is created during an experiment. Scratch and warm-start are compared on identical data, and data volume and model capacity are not changed in the same experiment. Candidates are accepted by direct A/B against production, not by proxy metrics. Required CI and a real-browser check remain, but **we will not wait for non-required automated review comments or add new boundaries unrelated to strength.** Only a clearly winning candidate is packaged into one PR and considered for production replacement.

It would be misleading to summarize this week only as "not entirely wasted." The strong games, teacher, and resumable generation foundation remain valuable. But when the goal was to reach stable high-dan strength, **most of the time spent extending safety infrastructure without measuring strength was a detour from that goal.** From here, progress is measured by direct match score, not by the amount of process completed.

### 11.9 The direct-match verdict: a +1% proxy gain scored 14.1% in play

The seed-42 candidate trained from 24,000 parent positions, listed in §11.8 as not yet directly tested, was matched against production runOp1. The conditions matched production: K=600, output scale 1/1, one second per move, and 32 color-swapped pairs (64 games) sharing the same six-ply opening within each pair. All 6,439 moves were legal and every process exited normally.

The result was **candidate 9 wins, production 55, no draws: a 14.1% candidate score.** The candidate lost both colors in 23 pairs, split 9 pairs, and won both colors in none. The latest checkpoint and the original seed-42 export were byte-identical after quantization, so both were rejected. The candidate did not advance to a formal A/B, and production runOp1 was not changed.

This was not merely a case where a roughly +0.97-point pair-accuracy gain and +1.19-point top-1 gain were too small. **The proxy and actual play pointed in opposite directions.** The premise that another incremental fit on new data would make the evaluator stronger was wrong. That line is now stopped. The next experiment compares scratch initialization against a production warm-start on exactly the same fresh data.

The first 10,000 positions for that comparison have been prepared from Floodgate games where both players were rated at least 3,000: 9,000 train, 500 validation, and 500 sealed test positions, drawn from 262, 106, and 102 games respectively. Cross-split game overlap and semantic-position overlap are both zero. Preparation also exposed a real bug in the old Floodgate rating parser: a player name beginning with digits could be mistaken for the rating. The corpus was rebuilt after changing the parser to read the authoritative final rating field. The sealed test split will not be labeled or inspected until the candidate is fixed.

**Pilot result:** all 9,000 train and 500 validation positions were labeled by YaneuraOu/Háo at depth 12, then used to train scratch and warm-start models from the same bytes. The 500 sealed test positions remain unlabeled.

| model | validation MAE | validation pair accuracy | direct match vs production |
|---|---:|---:|---:|
| runOp1 (production) | 575.6cp | 67.30% | — |
| scratch | 434.0cp | 61.43% | **stopped at 0–8** |
| warm-start | **408.3cp** | **69.05%** | **stopped at 4–12 (25%)** |

Scratch had roughly 590,000 parameters for only 9,000 training positions and its validation loss worsened after epoch two. Warm-start looked better than production by proxy metrics, but across eight color-swapped pairs it split four pairs, lost both colors in four, and won both colors in none. Including five additional games that completed before termination, it was still 6–15. Every checked move was legal; this was not a technical failure.

Therefore **both the 10,000-position rebuild and the incremental warm-start are rejected.** Once again validation MAE and pair accuracy pointed in a different direction from actual play. The pilot still answered its intended question before a large run: at this scale scratch is starved relative to model capacity, while warm-start adaptation damages practical move ordering learned by production. Neither model was shipped.

**Root-cause audit and the switch to large scratch training:** all 9,500 new labels, teacher best moves, and played moves were legal, with no duplicate or split leakage. Consecutive evaluations flipped strongly with the side to move (`corr(cp_t, -cp_t+1)=0.935`) and matched fresh YaneuraOu probes. This was not a sign-convention bug or corrupt teacher data.

The real problem was scale: roughly 590,000 parameters were fit from 9,000 positions across only 262 games, leaving 30.5% of input features unseen. Warm-start improved the narrow new validation set while worsening MAE on 20,000 positions from the old broad distribution from 354 to 499cp, a 41% regression. It was forgetting outside the new slice.

Rather than repeat the same design at only five times the size, the main path now switches to a large scratch rebuild with no production initializer. After scanning 17,356 strong games, we prepared **800,000 train, 3,000 validation, and 3,000 sealed test positions** from 14,861, 678, and 669 games, with zero game or semantic-position overlap. Parent data alone is 364MB and will be roughly 0.8GB with teacher labels. This is the intended experiment: build our evaluator from scratch on a broad distribution of strong games instead of stacking changes onto a weak base. It is still not guaranteed to win; only direct matches decide adoption.

### 11.10 Even 800,000 positions lost: stopping the small representation and moving to 81 king squares

The 800,000-position scratch run from §11.9 was trained to completion. Its direct match, however, reached **candidate 0 wins, production 52 wins, one draw** before the stop. Rebuilding from far more data was still decisively weaker than production. Two v9 experiments then used multiple searched moves from the same parent position: a scratch net trained only on child-position values stopped at **0–15**, and one trained directly on sibling-move ordering stopped at **0–11**. Those last two are early-screen observations rather than completed preregistered match totals, but they were one-sided enough to give no reason to scale them.

That ends changes to data volume, initialization, value loss, and sibling-ranking loss inside the 1,185,988-byte board-only representation. Even changing the objective from value approximation to move ordering produced only losses in play. The next bottleneck is therefore the roughly 590,000-parameter vessel itself: it cannot represent a board piece jointly with the location of its own king. **We will not keep pouring positions into the same vessel.**

The next candidate is a HalfKP-style model with a piece table for each of the 81 normalized own-king squares. This does not reuse a published YaneuraOu NNUE. It expands our own network to about 90.27MiB (94,656,708 bytes). It also does not start from scratch: production runOp1 is copied exactly into a shared table and all 81 bucket deltas start at zero. Before training, every bucket is therefore mathematically identical to the current evaluator.

The first single-WASM real-engine gate passed. Static evaluation matched on **1,000/1,000 positions**. Across six fixed-depth searches, including positions immediately after king moves, best move, score, nodes, and leaves matched **6/6 exactly**. Median search slowdown was 3.99% and aggregate slowdown 3.49%, within the preregistered 5% ceiling. WASM memory grew from 56,623,104 to 151,322,624 bytes and loading took about 40ms. This used the research WASM with SHA-256 `1b95659d54fc897e2ff766583ccc2035a0932929fcb9520800c3a5ca2b1430db` and measured the untrained exact lift in one instance. The research WASM is separate from the unchanged production WASM.

Reproducing the same topology with one to four private instances under Node measured 605,290,496 bytes of logical WASM memory, 283,970,124 bytes of transient weight clones, and about 1.17GB peak RSS at four instances. This is a resource measurement, not a browser pass. Trained-candidate speed and the real four-worker browser gate run before promotion only if a candidate first passes direct play.

The first million-position pilot compared an all-parameter candidate, a candidate that froze the shared and dense layers and trained only the 81 deltas, and different checkpoint-selection choices. Delta-only stopped after an additional screen at **6 wins, 21 losses, one draw**. Epoch 1 of the all-parameter run, selected by minimum validation value loss, also failed to advance at **13–14–1**. Epoch 6, selected by validation pair accuracy, scored **28–25–3** across two independent 500ms/move screens, then **16–15–1** at one second per move. Combined, that is **44 wins, 40 losses, four draws over 88 games: a 52.3% score**. It is not the catastrophic loss of earlier candidates, but it is not evidence that strength improved.

The original two-week gate was: (1) prove exact equivalence and speed, (2) train million-position pilots and play direct matches, (3) scale only a clearly winning setting to 5.9 million positions, and (4) run color-swapped formal A/B plus external calibration. **The guarantee is not that training must create strength; it is that weights which have not beaten production in direct play can never enter production.** Production remains runOp1 at 1,185,988 bytes, SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`, and has not changed.

At 52.3%, the million-position model did not pass that "win before scaling" gate. It also avoided a large regression, however, and one million positions cannot separate insufficient coverage of 81 squares from failure of the representation itself. We therefore recorded one explicit exception: a **single final coverage test** trained on all 5,892,140 valid rows (52 malformed rows skipped) in 14m55s. Peak RSS was about 11.1GB with zero process swaps. Validation move-ranking accuracy rose from 93.38% to 93.43%, while MAE worsened from 374cp to 389cp.

The final epoch then played production at 500ms/move and failed at **eight candidate wins, 18 production wins, and one draw: a 31.5% candidate score**. At 27 completed games, even winning the last game could only have raised the final score to 33.9%, so that game was stopped. Across 13 completed color-swapped pairs, the candidate swept one, production swept five, and seven were mixed; all 3,181 searched moves were legal. This rejects the hypothesis that roughly six times the coverage would turn HalfKP81 into a winner. Further HalfKP81 training, formal A/B, and production promotion are stopped. Production weights remain unchanged.

The final-epoch loss still left one question: had checkpoint selection, rather than the representation, failed? We therefore did no more training and audited only the saved epoch 1 and epoch 2 checkpoints in the same 500ms/move, 56-game screen against production. Epoch 1 led **12–4** after 16 games, but finished at **29 wins, 26 losses, one draw: a 52.68% score**. That was 59 half-points against the 62-half-point pass line. Epoch 2 finished at **29 wins, 24 losses, three draws: a 54.46% score**, 61 half-points and one short of passing. All 13,069 searched moves across both audits were legal. The intermediate 12–4 looked like improvement; completing the preregistered game count did not pass the gate. Neither checkpoint advanced to an independent 96-game confirmation, formal A/B, or production promotion, closing the single-perspective HalfKP81 candidate family.

The next official experiment does not use published NNUE weights. It applies one shared HalfKP feature transformer from both king perspectives in a **dual-perspective `[256 us, 256 them] -> 32 -> 32 -> 1`** network. Production evaluation can be copied into the first 256 inputs, with the opposite-perspective inputs zeroed and the added 32-unit layer initialized as an identity, making an exact mathematical lift before training. A reason to test a different representation is not evidence of greater playing strength, however. As with the saved checkpoints, it will not be called stronger or change production weights unless it first passes direct play.

### 11.11 Dual perspective lost too — “closer to the standard” is not evidence of strength

This experiment read the same piece features from both players' king perspectives. Two candidates first preserved the current representation and trained only a residual. The candidate with 25% game-outcome targets screened at **eight candidate wins, 26 production wins, and two draws** at 500ms/move. Its 18 half-points after 36 games could reach at most 58 even if it won every remaining game, below the 62-point pass line, so the screen stopped. The scalar-value candidate was worse at **5–31–0**, or ten half-points.

Even the untrained exact-equivalence model searched about 33.9% slower than production and failed the 5% ceiling. This was therefore not just a poor training setting: **the cost of the added perspective and layer in this browser search outweighed the accuracy obtained.** Both candidates matched Torch, exported integer weights, and WASM on 64/64 static positions, so a conversion bug cannot explain the losses. This custom dual-perspective family is closed rather than retrained again.

### 11.12 Self-built official BonaPiece semantics also lost badly — the outcome data was sound

The next implementation used the BonaPiece semantics in YaneuraOu's public source rather than merely being “HalfKP-style”: hand-piece slots, promoted minor pieces collapsed to gold, and kings excluded from piece features. It did not use published weights; it trained only on **our own 800,000 teacher positions**. An independent pass over all 803,000 training and validation records found zero outcome mismatches, malformed records, duplicates, or train/validation overlap. Tracing back to all 15,539 source CSA games also found no missing or altered inputs. Reversed game-outcome labels cannot explain this miss.

Warm seed 42 trained all ten epochs in 108.12 seconds and was already best at epoch 1. Seed 43's first epoch was the best of the three warm candidates at 376.3cp validation MAE and 71.39% pair accuracy. Scratch was clearly worse even at its best first epoch — 439.3cp MAE and 61.5% pair accuracy — and then overfit, so we did not multiply the same scratch miss across more seeds.

The best warm seed-43 model played production through a new fixed-time gate with color swaps, opening fingerprints, and bound weight/WASM hashes. After 42 games it stood at **eight candidate wins, 34 production wins, and no draws**. Its 16 half-points could reach at most 44 after all 56 planned games, below the 62-point pass line, so it stopped by mathematical elimination. Every move was legal, openings were unique, and there were no process faults. There is no justification for advancing it to the independent 96-game or formal 768-game stages.

Speed failed as well. Compared on the same search path, the untrained equivalent route was about 62.9% slower than production. An earlier short speed test had compared it only with another research WASM, not production, and was corrected rather than promoted as evidence. **Matching a standard input definition, lowering training loss, and proving exact conversion still did not imply stronger play.** Production weights remain unchanged.

Only single-perspective, speed-preserving paths remain. One fine-tunes the saved epoch-2 model — which missed its 56-game pass line by one half-point — at a low learning rate on the audited outcomes. The other retains BonaPiece's piece semantics while removing the second perspective and extra layer. If either fails its short direct screen, it will not be allowed to consume the rest of the two-week window.

### 11.13 “Outcomes will supply the missing point” also failed

The saved epoch-2 model had previously scored 29 wins, 24 losses, and three draws over 56 games: 61 half-points, one short of the 62-point pass line. We therefore mixed 25% of the audited game outcomes into the 800,000 teacher targets and fine-tuned that checkpoint for one epoch at learning rates `1e-5` and `3e-5`. Each run took about 41 seconds. The higher rate improved WDL validation loss, MAE, and pair accuracy more, and both exports were bit-exact across Torch, TypeScript, and WASM on 64/64 positions.

Play reversed that proxy ranking. The apparently better `3e-5` candidate finished at **25 candidate wins, 30 production wins, and one draw: 51 half-points**. The smaller `1e-5` update led 20–17–1 after 38 games, but completed at **28–26–2: 58 half-points**. That is a nominal winning record, not the preregistered 62-point pass. Both runs had unique opening fingerprints, all legal moves, and zero faults; neither advanced to the independent 96-game gate.

Correct outcome labels and effective outcome training are separate questions. The larger update substantially improved WDL approximation while making play worse; the smaller update remained approximately tied with production. **There was no guarantee behind “the old candidate missed by one point, so outcomes will put it over the line.”** Rather than run either setting longer, compute moved to single-perspective BonaPiece trained on all 5.9 million strong-teacher positions. Production weights remain unchanged.

The first 5.9-million-row load stopped before training after 198.42 seconds and about 12.48GB maximum RSS when it reached one of the 52 known malformed rows — an impossible position with five silver pieces. That is the correct fail-closed default, not a row to accept silently. The default remains strict; an explicit path now classifies and counts malformed JSON/SFEN rows only, while any invalid CP or outcome label still aborts. The stopped process recorded zero swaps and made zero model updates from bad data.

The counted retry then reported **5,889,953 valid rows and 2,239 rejected SFENs**, not the older syntax-oriented audit's 52 rejects. The new parser also enforces physical inventories — for example, no more than four silvers across board and hands — so it may have caught 2,187 impossible positions that the earlier audit accepted. Training did not continue under an unexplained population change: it was interrupted manually before an epoch-1 checkpoint existed.

Two independent streaming implementations then re-audited all 5,892,192 rows. They agreed: all 2,239 rejects were invalid and the parser had zero false positives. Of those, 2,099 had physically impossible material inventories; 140 stayed within inventory bounds but one side had zero or two kings. JSON and CP were valid on every row. The old path had rejected only 52 positions missing the side-to-move king and missed the other 2,187. The cause is not the parser but a state-transition, make/unmake, capture, or king-bookkeeping fault in the source generator. Research training resumed only after the rejected rows were sealed by row hash and checkpoints/exports were required to record **5,889,953 accepted and 2,239 quarantined**. Future teacher ingestion stays stopped until inventory and king counts are enforced around serialization.

The audited two-epoch run completed in 392.94 seconds with about 14.38GB maximum RSS and zero process swaps. More data still did not mean a better model. The best 800,000-row warm model had 382.6cp validation MAE and 70.07% pair accuracy; the 5.9-million-row model scored 551.8cp/60.10% at epoch 1 and 559.3cp/62.08% at epoch 2. Epoch 2 lowered training loss from 0.009256 to 0.006230 while held-out error worsened. The 5.9-million model therefore does not get priority: the clearly better held-out 800,000-row warm model enters direct play first.

### 11.14 The first candidate to pass a short playing gate — by retaining half of the current model

The single-perspective BonaPiece candidate trained on 800,000 positions also lost decisively in direct play. Seed 43, which had the best validation pair accuracy, scored **two wins and 26 losses** against production. The screen stopped when even winning every remaining game could no longer reach the pass line. The two-epoch model trained on all 5,889,953 valid positions was much worse than the 800k model on validation MAE and pair accuracy. We verified exact quantized/runtime parity, but did not spend games on it. Roughly 7.4 times more data did not strengthen this path.

We also found the source of the 2,239 invalid positions. All 4,284,992 rows generated on the first Mac were physically consistent; the invalid rows came only from the second Mac. That machine had been given a `--wasm` command before the option was implemented. The old CLI silently ignored the unknown option and fell back to a different JavaScript selector path, which applied a returned move without matching it against the already generated legal-move set. The generator now rejects unknown options, hashes the position around selector calls, canonicalizes every selected move against the legal set, and checks the complete piece inventory and both kings after every move. Twelve regression tests, including real invalid positions, and 1,000 random generated games produced no recurrence.

We then reconsidered a candidate that did not require more training. It interpolates every parameter halfway between the HalfKP81 exact lift — mathematically identical to production — and the full-data epoch-2 model. On two frozen validation distributions, alpha 0.5 improved loss, MAE, and pair accuracy over alpha 0. The first preregistration had required a maximum quantization error below 175cp, although alpha 0 itself measured 207.6cp. We did not retroactively declare that failed rule passed. Instead, before any match, we fixed a new relative-within-5% rule, alpha 0.5 as the only candidate, and fresh match seeds.

The 1.5-second, color-swapped 56-game screen finished **31 candidate wins, 20 production wins, and five draws: 67/112 half-points, or 59.8%**. The pass line was 62. Every move was legal, openings were unique, and there were no technical faults. This was the first short-screen pass, not yet proof that the model was reliably stronger.

The first independent run with 96 games, unused seeds, and unused openings encountered one technical fault when a dependency rebuild interfered with the running match. We preserved its evidence but allowed no strength conclusion from that attempt. A clean rerun from the beginning under the same preregistered conditions finished **53 candidate wins, 37 production wins, and six draws: 112/192 half-points, or 58.33%**. Every move was legal, openings were unique, and there were no technical faults. A 100,000-replicate bootstrap over the two-game color-swapped pairs gave a one-sided 95% lower bound of **98/192, or 51.04%**, passing the preregistered strictly-above-50% rule.

The formal 768-game test then converged to **376 candidate wins, 357 production wins, and 35 draws: 787/1,536 half-points, or 51.236979%**. It completed all 384 color-swapped pairs and 768 games with legal moves throughout, unique openings, and zero technical faults. With bootstrap seed `20260710` and 100,000 paired resamples, the one-sided 95% lower bound was **742/1,536, or 48.307292%**; the two-sided 95% lower bound was **733/1,536, or 47.721354%**. The result passed the safety bound above 45% but failed the formal requirement that the lower bound be strictly above 50%, so its decision is `rejected-complete`. The report SHA-256 is `1f83896df8e55c631caa475494a4ba66a10f930068d2ec8ee236c9bf4abfa8ec`; the manifest SHA-256 is `6470c79b95ccf94fdd51fd017b05daab9e39b9ea98f7a22db4e8a7b72f0cc4e0`. Passing the independent 96-game gate did not prove an advantage at the larger sample. The candidate therefore does not advance to external calibration or production, and production weights remain unchanged.

In parallel, three HalfKP candidates warm-started from the near-pass checkpoint and trained for eight epochs on 278,736 legal sibling rows. They combined pairwise/listwise move ranking with a one-to-one replay of 500,000 ordinary value positions. Value MAE improved by 121–161cp, but independent pair accuracy fell by 0.53–0.94 points and top-1 by 1.19–1.81 points. No checkpoint was admitted, so this family stopped before matches. For the next cycle, we built a generator that mines only positions where production browser search and the depth-12 teacher disagree, then independently scores **every legal child position**. The initial three-parent smoke covered 239/239 legal moves, child SFENs, and perspective signs, with byte-identical reruns. We then merged the audited ranking-dataset preparation path in [PR #609](https://github.com/gomyway1216/nextjs-portfolio/pull/609) and ran batch 3 across 16 shards at 125 parents each. It generated 171,429 ranking records covering every legal move from 2,000 parents in 42 minutes 35 seconds, completing with zero technical faults. This completes teacher generation, not a playing-strength result, and production weights remain unchanged.

Three ranking fine-tunes then trained on 112,011 rows from 1,334 parents, validated on 57,658 rows from 643 parents, and replayed 500,000 value rows. The preservation set contained 2,959 rows after excluding 41 overlaps, leaving zero semantic overlap. Seeds 42, 43, and 44 all exited successfully and completed eight epochs in 489.769, 472.128, and 487.720 seconds. Final pair accuracy improved by **0.6003, 0.4077, and 0.5207 percentage points**, while preservation MAE improved by **69.6, 47.2, and 70.1cp**; both gates passed. Top-1 accuracy, however, was still **0.1555 points below baseline** even at the best epoch of every run, and finished **0.6221, 0.3110, and 0.4666 points lower**. Average pair ordering and value preservation improved while the argmax that chooses the actual first move worsened. No epoch therefore passed every preregistered condition. All three results were `complete-no-admitted-candidate`, with `best_epoch` null and no `best.pt`. The preregistered stop rule ended the lane before export, quantized parity, or matches: zero games were run and production weights remain unchanged.

The change that crossed both the 56-game screen and the independent 96-game confirmation was neither a larger model nor more data. **It retained half of production's practical ordering and averaged away an over-large training update.** The formal 768-game result reduced that promising early signal to an approximately 1.24-point edge and did not establish statistical superiority. Independent confirmation reduces error; it does not turn a small sample into a guarantee. Batch 3 browser-confusion generation and all three ranking fine-tunes are now complete, but the fine-tunes never passed the top-1 condition. The preregistered rule therefore stopped this lane before searching exports or matches for a favorable result.

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
- **Don't conclude from one game — but a tied short A/B is not a safety proof either.** The deeper-label re-distillation improved typical mid-game calibration on game4, yet a later real game exposed the `P*8f` regression and production returned to runOp1. Do not adopt from proxy metrics, a few positions, or a short A/B alone (Ch. 11).
- **Safety infrastructure is not playing strength.** Strong games and a working teacher are assets, but more ownership, key, tamper boundaries, and non-required review responses do not strengthen the evaluator. Keep the minimum safety gate and put direct A/B first (Ch. 11).
- **Better WDL approximation is not playing strength either.** Even audited-correct outcomes did not make the mixed-target candidates beat production. Promote on direct play with fresh seeds, not on lower loss (Ch. 11).
