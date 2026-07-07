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
7. **The pivot**: from dozens of lines to thousands of positions — a large-scale book pipeline (in progress)

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

## Lessons from this chapter

- **"A verified book" and "a sufficient book" are different things.** Every move can be correct and the coverage still leaks through the holes of a line-shaped book.
- **Verify a fix along the continuation, not just at the position.** Fix one ply and declare victory, and the problem moves one ply deeper (lived experience).
- **An eval's weaknesses surface at both ends** — the endgame (saturation) and the opening (strategy). The midgame is strong because that's where the training data is thick.
- **Look for public resources first.** Reinventing the wheel (hand-written book lines) runs straight into a wall of scale.
- **Never trust external data's quality labels blindly.** The bundled evals let 1.5% inferior moves through; only re-measuring every move with our own depth-18 gate justified the words "zero blunders."
- **Doubt the measuring instrument until it's reproducible.** A shared TT wobbled identical positions by ~150cp, silently breaking the pruning threshold. Make the measurement deterministic first.
- **Design the fallback before the feature.** "Fetch fails → hand-written book, unchanged behavior" is what makes a big change safe to ship.
