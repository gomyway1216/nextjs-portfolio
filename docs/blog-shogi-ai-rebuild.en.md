# My Blog's Shogi AI Was Embarrassingly Weak, So I Had a Fleet of AI Agents Rebuild It in a Day — From Bug Hunts to WASM and NNUE Distillation

> The homemade shogi AI on my personal site (meetyudai.com) was, in the words of its owner (an amateur 2-dan shogi player), "way too weak." This is the record of running up to five Claude Code subagents in parallel to see how strong it could get in a single day: the diagnostic logs, a catalog of failed ideas, the things that actually worked, and all the real measurements. Total cost: roughly zero (electricity and LLM usage).

---

## TL;DR

- The biggest reason the AI "ignored attacks and played nonsense" was **not the search engine — it was an opening-book fallback that bypassed search entirely and answered in 1–23ms**. Thinking-time logs were the smoking gun
- Small improvements to the handwritten engine (search tricks, eval tuning) **mostly measured as "no effect" at production time controls**. Roughly 70–90% of plausible-sounding ideas died in A/B testing
- What actually worked was structural: **porting TypeScript → WebAssembly made the search ~15x faster, +3–4 plies deeper, and the new engine beat the old one 10–0**
- On top of that we built **NNUE distillation**: had YaneuraOu (a superhuman open-source engine) label 100,000 positions, then distilled that knowledge into a 1.13MB neural net that approximates the teacher **2.0–2.5x better than the handwritten eval**
- The verification methodology itself is full of traps: **self-play statistical degeneration, time-control bias, and mismatched defaults** nearly led us to wrong conclusions several times
- **Cycle 2 reached its verdict**: **pondering** (the AI keeps searching on the human's thinking time) shipped to production, +0.35 mean depth. The leading NNUE-defeat hypothesis — "search margins are miscalibrated to the NNUE scale" — was **rejected by an isolated A/B** (19.6% → 8.9%, worse), pinning the culprit on teacher data. **Retrained on 1M positions, the NNUE beat the handcrafted eval 77.1% and shipped to production** (medium and up). Genealogy: 19.6% → 32.1% → **77.1%**
- **Cycle 3 (complete)**: **WASM SIMD128 made eval 6.2x faster**; **multithreading (Lazy SMP) gave a +58 Elo point estimate** (n=24, not significant). KP features were a **negative result at 1M positions** (data dilution). And on production hard, **the NNUE lost to the 2-dan author** — the diagnosis pinned **sigmoid saturation** (all 71 moves collapse into a 15cp band at decided positions, indistinguishable) as the main culprit behind the "nonsense moves." **A hotfix narrowed the NNUE to medium only**, then we **cured the saturation at the root with 5.24M positions (balance-rate 0.5, labeling depth 12).** Recovering decided positions from Cycle 2's 36% to **49.7%** brought the spread of move values at the culprit 72nd ply back from **20cp → 532cp (26x)**, **halved the blunders 8 → 4**, and won A/B **92.2%** vs. the old NNUE and **84.4%** vs. V3 (at both 1000/2000ms). We **re-enabled the NNUE on hard and effectively replaced V3** (pure-NNUE). And — **the author confirmed over the board that it "definitely got stronger"** (shipped in PR #316)

---

## 0. Background: the original system and the version genealogy

The site has two shogi pages:

- `/games/shogi` — original UI + a move-sequence-matching opening book + engine
- `/games/shogi-improved` — fast-engine UI + a position-hash-matching opening book + Web Worker (Lv4/5)

The engine is TypeScript: a 1-D board array indexed `(suji<<4)+dan`, make/unmake, Zobrist hashing + transposition table (TT), negamax + alpha-beta + PVS + iterative deepening. Textbook-correct. Layered on top was a geological record of improvements: `ShogiAIImprovedV2` through `V18`.

### Version genealogy (before this project)

| Version | Key features | Notes |
|---|---|---|
| V2 | Base: negamax+αβ, PVS, TT, killers/history, MVV-LVA, quiescence | Clone-based legality was the bottleneck |
| V3 | Repetition detection, null-move pruning (high levels only) | Experimental |
| V4 | Draw contempt, check extensions, delta pruning (all shipped OFF), root fallback | The "features exist but we're scared to enable them" era |
| V5 | Mate-distance bounds, quiet-check probing in quiescence | |
| V6 | Direct-mapped eval cache, opening-aware root ordering | |
| V7/V8 | Root-only check extensions (master), root-only drop-safety ordering | |
| V9/V10 | Root ordering cache, **packed TT** (stores move keys instead of cloning move objects) | Less GC pressure |
| V11 | **Pooled move generation** (reuse move objects per ply) | Long-time stable baseline |
| V12 | "Don't keep castling while the king is under fire" pressure gating | |
| V13 | Aggressive search experiments → **unstable/weaker in self-play, never adopted** | A preserved failure branch |
| V14 | Book expansion, lightweight eval for book validation | |
| V15 | V11 speed + V12 gating merged, in-engine book probe | |
| V16 | Purposeful drop ordering, contempt, delta pruning finally enabled | |
| V17 | SEE-ish ordering + per-node attack-scan cache, check extensions (experimental) | |
| V18 | V16 + attack cache + hanging-drop ordering for high-value drops | **Starting point (in production)** |

Two patterns jump out of this history: (1) **features accumulate but stay OFF or "high levels only"** — nobody had systematically A/B-tested them; (2) **the evaluation function stayed basically the V2 handwritten structure** (material + PSQT + king safety + castles + file defense) with almost no notion of piece-level threats.

**Baseline measurement**: at 3 seconds of thinking the engine reached about 4,000 interior nodes, ~51,000 quiescence nodes, search depth ≈ **5**. That's 1–2 orders of magnitude slower than a good JS engine — which later became the biggest lever.

---

## 1. Chapter 1: V19 — doing the "orthodox search improvements" systematically

The initial brief: "Make it stronger, open a PR, address review comments, merge, and keep testing until it's actually stronger." The first pass (V19) implemented proven chess/shogi techniques missing from V18:

- **Futility pruning** (skip quiet moves at frontier depth when stand-pat + margin can't reach alpha; long-range pieces and moves near the enemy king are protected)
- **SEE-lite pruning in quiescence** (skip obviously losing high-takes-low captures using cheap attack scans)
- **Countermove heuristic** (order the refutation of the previous move just below killers)
- **Staircase LMR**, and null-move / LMR / aspiration enabled from "hard" upward

### First lessons from the verification process

- Enabling futility at medium (then 800ms) measured 3W–5L; re-gating to hard+ recovered to 6W–2L–2D. **The same technique can flip sign depending on the time-control regime**
- Self-play result: **37W–17L–12D vs V18** across all difficulties (68.5% of decisive games)

### Skirmishes with review bots (worth recording)

PRs get automatic reviews (Gemini/Copilot). On the V19 PR, **5 of 9 findings were false positives that misread the parameter semantics of the attack-scan function** (`getLeastAttackerValue(k, target, teban)` takes the *defender* as its third argument — documented in the code). Meanwhile **2 findings were real** (out-of-bounds ply access on typed arrays) and got fixed. The right relationship with automated review is neither "accept all" nor "ignore all" — it's **verify every finding independently**.

---

## 2. Chapter 2: "Climbing silver beats it every time" — auditing the book and the eval

After V19 shipped, the owner's (2-dan) feedback was blunt: **"Is it really stronger? The primitive climbing-silver attack always wins."** Climbing silver (bōgin) is a basic amateur plan. Losing to it every game is disqualifying.

### Build a reproduction harness first

Instead of guessing, we wrote `scripts/shogi-bogin-repro.ts`: a scripted primitive climbing-silver attack (▲2六歩→2五歩→3八銀→2七銀→2六銀→1五銀→2四歩…) thrown at the real production AI entry point, logging eval and material every ply. **Result: the medium AI lost by checkmate in 49 plies.**

```
ply  9 ▲ 27->26  evalV3(SENTE)=-485   ← silver marching to 2六
ply 10 △ 13->14  evalV3(SENTE)=-640
ply 16 △ 71->62  evalV3(SENTE)=-892   ← silver about to land on 2四; AI develops an unrelated silver
ply 17 ▲ 24->23+                       ← silver promotes
ply 18 △ 32->23  material=-2000
ply 19 ▲ 28->23+ material=+600         ← rook takes the gold and promotes. Textbook bōgin success
```

Three root causes fell out of the logs:

1. **The book had no defensive lines for White at all** — and worse, a "skip book when |eval| > 200" gate fired constantly on normal opening eval noise, **silently disabling the defensive book exactly when it was needed**
2. **The eval's rook-file defense only looked at pawns**, completely ignoring the actual bōgin mechanism (silver march + rook stacking)
3. **Promoted pieces in the enemy camp were invisible to the eval**: a "+800 for a rook/bishop in the promotion zone" term stopped matching the moment the piece promoted (its piece-type code changes) — a classic bug. After being broken through, the engine's eval said "roughly equal"

### Fix with professionally documented joseki

We verified the correct anti-bōgin defense against professional commentary: "**answer ▲2五歩 with △3三角**" and "**△1四歩 to deny the silver the 5th rank**". Implemented as a "climbing-silver pressure" eval term (march level × defensive shape, mirrored for both sides) plus proper △3三角 book lines in both books. We also repaired corrupted book data (illegal entries like `8二→3七` annotated as "８五歩").

**After the fix, both scripted bōgin plans lose a silver outright and get crushed.**

### Failure catalog (1): runaway eval terms

The "±1000 for promoted majors in the enemy camp" term introduced here turned out to make the whole engine **much weaker** (2W–7L in eval-regression self-play vs the previous 5W–2L–3D). Isolating terms via env-var kill switches identified it as the main culprit; reduced to ±350 and strength recovered. **A large hand-tuned term that's right in the intended position is a distortion over the full distribution of positions.** From then on, every eval change had to pass a direct match against a frozen pre-change engine.

A fun side effect: the 1-ply static validator that safety-checks book moves started seeing "bishop takes a defended pawn deep in enemy camp" as a **+1000 brilliant move**, inflating the comparison baseline and **rejecting every correct quiet book move**. We added a SEE-lite hanging-piece correction to the validator. **Eval, book, and validator are a coupled system** — touch one, break another.

---

## 3. Chapter 3: The instant-move "resync" bug — the biggest find of the project

After deploying those fixes, the owner sent a real game. From a standard double-wing opening:

```
9.  ▲２四飛 (rook takes on 2四)
10. ☖４二飛 ??   ← ignores the rook-file exchange, shuffles its own rook
11. ▲２三歩打 (pawn drop threatening the bishop)
12. ☖９四歩 ??   ← ignores the threat, pushes an edge pawn
```

Answering the rook-file exchange with △2三歩 is page one of double-wing theory. Missing it was bizarre.

### The smoking gun: thinking time

Reproducing the position through the production path (`scripts/shogi-position-probe.ts`) produced the decisive evidence:

```
move 10: AI(hard) plays 82->42 (23ms)   ← hard has a 2-second budget
move 12: AI(hard) plays 93->94 (1ms)    ← ONE millisecond
```

**The engine had never searched at all.** The culprit: the book's "resync fallback" — a leftover from the slow-engine era (V16) that, whenever the position wasn't in the curated book, answered instantly with a plausible-looking quiet developing move (heuristics like rook-shift +900, edge-pawn +1400) validated only by a 1-ply static check. Three flaws stacked:

1. Its only phase gate was "total pieces in hand ≤ 2", so it **fired in the middle of a hot rook-file exchange**
2. Its candidates were quiet board moves only, so **the correct △2三歩 — a drop — was structurally impossible for it to choose**
3. **Self-play could never catch it, because both engines shared the same fallback.** Only humans, who deviate from book, exposed it

We removed resync entirely: out of book → always search. The same position now gets △2三歩打 after a real 2.0-second search.

> **Debugging heuristic**: if a bad move comes back instantly at a level with a multi-second budget, suspect a bypass path, not the search. Every reproduction script we wrote afterward prints per-move thinking time.

### Sequel: the pawn-grab silver and the symmetry of blind spots

The next real game featured a silver sneaking ▲3六銀→2五銀→**3四銀**, grabbing a pawn. Investigation: the climbing-silver pressure term from Chapter 2 **only scanned ranks 5–7 for the attacking silver** — the penalty vanished at the exact moment the silver succeeded and entered the defender's half. **The exact same bug shape as the invisible promoted pieces.** A review bot then pointed out ranks 1–2 were *also* unscanned — correct again. Bugs of the same shape nest in the same places (boundaries).

---

## 4. Chapter 4: V20 — one unified brain, and the traps of verification

The owner then issued a design directive: **"Unify every difficulty on the latest thinking; vary only how much it thinks. Refine until it decisively beats the previous model."** Fair. V20 liquidated the historical per-difficulty feature flags: **every level runs the identical search configuration; only the time budget differs** (easy 250ms / medium 1s / hard 2s / expert 4s / master 5s — master halved from 10s).

### Speed: finding the real bottleneck

The first unified build only tied V18 (6W–6L–4D). Profiling found something shocking: **legal move generation performed "make → own-king-in-check test → unmake" for all ~80 generated moves at every node.** Under alpha-beta, most nodes cut off after 1–3 moves, so legality checks for never-searched moves are pure waste.

- Switched to **pseudo-legal generation + lazy legality** (test only when a move is actually made)
- Quiescence had been scoring & sorting *all* moves — switched to partial-sorting only noisy moves when not in check
- Added: reverse futility pruning, late move pruning, staircase LMR, adaptive null move, aspiration window 900→300 with staged widening, IID, TT-move ordering in quiescence

**Result: at the same 3 seconds, depth 5→7 and interior nodes 4k→22k.** Self-play (with old V18 keeping its old, longer budgets):

| Level | Condition | New V20 | Old V18 | Draws |
|---|---|---|---|---|
| easy | equal 250ms | 7 | 2 | 3 |
| medium | 1s vs 0.8s | **13** | 2 | 1 |
| hard | equal time | **10** | **0** | 2 |
| expert | 4s vs old 5s | 6 | 2 | 2 |
| master | **5s vs old 10s** | 5 | 2 | 1 |

### Failure catalog (2): traps in the verification itself

1. **Opening-diversity degeneration**: with only 2 forced opening plies, results suddenly looked like 2W–5L–7D. With 2 plies nearly every game starts from the same position, and deterministic engines then replay "effectively 2–4 distinct games, duplicated". A no-book control losing under the same config proved it was **the setup, not the change**. Rule: **6+ forced opening plies, varied seeds**
2. **Time-scale bias**: 200ms blitz matches behave differently from 1-second production games (mate-probe overhead overweighted; deep-search gains underweighted). Rule: **final verdicts need 30+ games at production budgets.** Run under this rule, the decisive test delivered an important negative: **the sum of all JS-side micro-improvements was strength-neutral at production time** (9W–12L–11D)
3. **Mismatched defaults**: the match script defaulted to a different eval mode ("v2") than production ("v3"); for a while we compared under non-production conditions. Rule: **restate "same as production?" every time**

### Failure catalog (3): designing the "threat" eval term

To address "the AI ignores attacks on its own pieces," we added a hanging-piece penalty. The theory is sound: quiescence only resolves captures *by* the side to move, so threats *against* your pieces are invisible to the static eval. But the first design (also counting "defended but attacked by a cheaper piece" at 50% expected loss) went **0W–4L** — a pawn merely touching a silver moved the eval by ±450 points, i.e., a noise generator. Narrowing to "**attacked AND undefended only, at 1/3 value, silver and up**" made it work. Multiplier, scope, and conditions each had to be measured separately.

---

## 5. Chapter 5: Parallel subagent development, and the real adoption/rejection data

At this point the owner changed the working mode: **"Do everything with subagents, in parallel."** Up to five Claude Code subagents ran concurrently:

- Each agent gets its own **git worktree** (a parallel checkout of the same repo, `.claude/worktrees/agent-xxx/`) so they can't trample each other
- They write code and run it **as real processes on the local machine** (not in a cloud). There's no terminal window, but a human can watch everything with `ps aux`, `tail -f`, `top`
- On completion each returns a commit; the orchestrator resolves conflicts, integrates, **independently re-verifies**, and sends it to human review

Mid-flight, the owner also corrected the verification protocol: agents were initially told to beat old V18; the owner said **"test against current V20, not V18"** — right call. We froze the pre-change engine as a registered `v20base` opponent and made "direct match vs current" the standard gate (more sensitive and more reproducible).

### The five agents' results

| Agent | Outcome | Details |
|---|---|---|
| Search techniques | **1 of 4 adopted** | Continuation history adopted (fixed-depth nodes **−40%**, 9W–5L–6D vs current). **ProbCut rejected** (two variants; bench faster but lost real games — at depth ~7 the "shallow verification search" is depth 3 and prunes real tactics). **History gravity rejected** (at short TCs it just discards fresh information). Singular extensions deferred |
| Mate solver | ✅ Adopted | Checks-only AND/OR search (mates up to 9 plies, pawn-drop-mate legality, perpetual-check rule). Finds a 5-ply mate in **36ms deterministically** (previously up to 1s and luck-dependent). General-position Elo neutral (3W–3L–4D) — its value is endgame *certainty*, and measuring that with a 10-game match is a category error; a lesson in metric design |
| Opening book | ✅ Adopted | 12 verified joseki lines + **3 real mechanism bugs found** (bishop-trade eval spike killing the whole book; a ±900 gate blocking mandatory recapture replies; drops being structurally unplayable from books) |
| Texel tuning | ❌ Not adopted (harness kept) | Coordinate descent over 16 eval weights → 17W–14L–17D in a 48-game direct match: **no significant gain**. The diagnosis was quantified: 1,698 positions from 70ms self-play carry an eval→outcome signal *below noise* (fit error worse than predicting a constant). Real Texel uses millions of positions. Also found and fixed an unbounded hill-climb bug in the K-estimation loop |
| WASM spike | ✅ Jackpot | See below |

**Survival rate of plausible improvements: roughly 1 in 3–4.** Stockfish folklore says 1 in 5–10. Without a rejection mechanism, all of these would have shipped.

### Self-inflicted wound during mate-solver verification

While independently re-verifying the mate solver, we got "both engines miss the mate" — panic — until realizing **my reproduction position had one gold in hand instead of two** (the 5-ply mate needs two gold drops). We were measuring "missed mates" in a position with no mate. The first suspect in a failed reproduction is your own reproduction code.

---

## 6. Chapter 6: The WebAssembly port — a mechanically guaranteed 15x

The decisive production-budget match had made the strategic conclusion clear: **JS-side micro-improvements had plateaued.** Stop betting on idea hit-rates; invest in speed, whose payoff is mechanical.

### Start with a spike (measured, not assumed)

Before committing to a full port, we ported only move generation to AssemblyScript and measured perft:

| Bench | JS | WASM | Speedup |
|---|---|---|---|
| Initial position perft d4 (718k leaves) | 798ms | 28.8ms | **×27.7** |
| Drop-heavy position perft d4 (25.7M leaves) | 28,440ms | 894ms | **×31.8** |

Perft counts matched the JS engine exactly at every depth (proof of porting correctness). Output wasm: 5.2KB. On that evidence, we green-lit the full port as a chain of four agent phases.

### Four phases and the discipline of bit-identity

1. **P1 Move generation**: pawn-drop-mate legality, Zobrist hashing ported with the identical PRNG so hashes are **bit-identical** to JS. 4,184 random-game positions: 100% match on legal move counts, hashes, incremental material
2. **P2 Evaluation**: every eval term ported integer-exact. Eval speed **×29** (100k evals: 5.3s → 0.18s)
3. **P3 Search**: all of V20 (packed 2^20 TT, all pruning, 1296×1296 continuation history, repetition, time management via an imported `env.now`). **Fixed-depth verification: 48/48 positions matched not just best move and score but node counts byte-for-byte** — the search trees are identical. At 3 seconds: depth **11–12**, and a head-to-head **10–0–0 win over the current engine**
4. **P4 Production integration**: the 25KB wasm embedded as base64 (same code path for webpack/Turbopack/vitest/node — zero bundler config), every difficulty moved into the worker, with a layered fallback chain: book (JS) → mate solver (JS) → **WASM search** → JS V20 → main-thread JS. Verified in a real browser *with the fallback temporarily disabled* to behaviorally prove WASM itself was playing

The strongest tool in a port is the **parity test**. Demand bit-identity rather than "close enough" and every bug lands in the net; once parity holds, the speed differential converts directly into strength. We also hit the classic integration snag — CI's ESLint tried to parse AssemblyScript decorators as TypeScript and failed the build (fixed by lint-ignoring the AS sources).

### A field test: the AI was right

After deployment, the owner (2-dan) played master and sent a move he suspected was an error (△3五角, attacking his rook — "wouldn't promoting the bishop and grabbing a pawn have been better?"). We asked the local YaneuraOu (depth 17):

| Candidate | Verdict |
|---|---|
| **△3五角 (the AI's move)** | **+150 for White — the engine's #1 choice**, with a hidden follow-up (△5七角成) |
| △6六角 ("wins a pawn") | −1977 — **▲8八角 takes the bishop for free** (6六 was covered) |
| △1七角成 ("wins a pawn and promotes") | −2037 — **▲2九桂 takes the horse for free** |

**The master-level AI matched a superhuman engine's first choice**, and both human "improvements" lost a whole bishop. Hard to ask for better evidence of progress.

---

## 7. Chapter 7: NNUE distillation — YaneuraOu's knowledge in 1.13MB

Handwritten evals historically plateau around amateur dan level. Going beyond requires a learned evaluation function.

The standard answer is **NNUE (Efficiently Updatable Neural Network)** — which, it turns out, is **a shogi invention**. Devised in 2018 by shogi programmer Yu Nasu, it swept the shogi engine scene via the YaneuraOu family, and in 2020 Stockfish — the strongest chess engine — adopted it, making it the world standard. The essence is in the name: because a single move changes only 2–4 pieces' worth of board facts, the first layer's activations can be **updated differentially** instead of recomputed, letting a CPU keep up with alpha-beta's demand of hundreds of thousands of evaluations per second (our own stumble with this trick is Failure catalog (4)). This chapter implements a miniature NNUE for our engine and trains it with YaneuraOu — the invention's own lineage — as the teacher.

Note that this is **not an LLM** (a language model like ChatGPT). An NNUE is a tiny net of ~590k parameters returning one number for a board; an LLM is a transformer of hundreds of billions of parameters generating text — differing in scale by a factor of about a million. The only place an LLM worked on this project is **the building of the AI itself** (the code was written by Claude agents); the finished playing AI contains no LLM whatsoever.

Common misconceptions vs reality:

- **Training happens once, offline** (locally in PyTorch — measured at 45 seconds for 40 epochs!). At play time you only run inference with the trained weights; no training per game
- **You don't "find" millions of positions — you generate them.** Have a strong open engine evaluate positions and keep the labels (distillation)
- **Cost: zero.** YaneuraOu is open source (built on macOS with clang, ~5M NPS measured), the public NNUE eval "Háo" (tanuki- team) is GPL-3.0 and free for local use, PyTorch is free, and Apple Silicon's MPS does the training

### The pipeline (all local)

```
Self-play of our own engine (25ms/move + 20% random branching)
  → diversified positions to SFEN (skip in-check, dedupe)
  → 8 parallel YaneuraOu processes label them over USI (go depth 8)
  → {"sfen":"...","cp":-2161,...} appended to a resumable JSONL
Measured throughput: ~1,400 positions/second of labeling
```

**100,000 positions in ~65 minutes.** Mid-run, all 8 YaneuraOu processes died and generation stalled — ironically, **exactly the "all engines dead → infinite loop" bug we had fixed in review followups an hour earlier; the job was still running the pre-fix code.** The append-only resumable design meant zero data loss on restart.

### Result: quality gate passed

On a 10,000-position validation split, "how close is each evaluator to the teacher?":

| Evaluator | Mean error | Median | p90 |
|---|---|---|---|
| **Distilled NNUE (float)** | **405cp** | **263cp** | 939cp |
| Handwritten eval (with a best-case linear calibration) | 800cp | 648cp | 1671cp |
| Always-answer-0 baseline | 1662cp | 1962cp | 2824cp |

**The distilled net is 2.0–2.5x closer to the teacher than the handwritten eval** (consistent across every advantage bucket). Int16 quantization costs a mean of 24cp — negligible against the 405cp model error.

### Failure catalog (4): the inference wall and lazy diff application

A naive WASM implementation of inference cost 6.7µs per eval (handwritten: 0.86µs) and **dropped search depth from 11 to 6**. NNUE's essence is in the name — *Efficiently Updatable*: a move changes only 2–3 pieces' worth of features, so you incrementally update the first-layer accumulator on make/unmake.

But the naive "update on every make" made **perft 14x slower** (search makes and immediately prunes mountains of moves, paying the accumulator cost for all of them). The solution: **lazy application** — making a move just pushes the diff onto a stack (nanoseconds); diffs are folded in only when an evaluation actually happens.

**Final numbers: 1.15µs per eval (5.4x faster, within 1.2x of the handwritten eval), search depth 9–15 with NNUE enabled.** Every step verified bit-exact against a TypeScript reference implementation and PyTorch's int16 simulation. The standard two-perspective accumulator design (features are side-to-move-relative) is used — with the nice side effect that null moves become free.

---

## 8. Timeline (the PRs)

| PR | Content | Outcome |
|---|---|---|
| #287 | V19 (futility/SEE-lite/countermove …) + anti-bōgin eval & book fixes | ✅ 68.5% vs V18 |
| #288 | V20 unified engine + speed + shorter budgets | ✅ Unbeaten at hard; master wins on half the time |
| #289 | Remove the resync fallback | ✅ Instant-nonsense class of bug eradicated |
| #290 | Joseki gauntlet (automated attack-pattern tests) | ✅ Regression harness |
| #291 | Fix the silver-intrusion eval blind spot | ✅ Pawn-grab route refuted |
| #292 | **WASM engine to production** (P1–P4) + 5-agent integration | ✅ 10–0 vs current |
| #293 | NNUE distillation pipeline | ✅ Code only; data stays local |
| #294 | ML robustness fixes (10 review findings) | ✅ One of them actually happened an hour later |
| #295 | NNUE inference in WASM (lazy differential accumulators) + NNUE-vs-V3 A/B harness | ❌ 19.6% with real weights — not adopted; infrastructure preserved, disabled by default |
| #296 | **Pondering (permanent brain)** | ✅ Mean search depth 9.00 → 9.35; live in production |
| #297 | NNUE scale calibration `setNnueOutputScale` + isolated A/B | ❌ 8.9% — hypothesis rejected (mechanism kept) |

### The final A/B: NNUE **failed** — and taught the biggest lesson

The equal-time self-play with real weights (both sides WASM, eval function the only difference, 28 games) came back **19.6% score for NNUE — a rout**. Inference was verified bit-identical across torch/TS/WASM on 300 positions, and speed was fine (equal node counts at equal time; the lazy accumulator worked perfectly). **The implementation was correct. The model itself lost.**

The diagnosis is the interesting part. **"Closeness to the teacher" (2.0–2.5x better than the handwritten eval) turned out to be a poor predictor of playing strength.** What alpha-beta search needs is the *relative ranking of sibling positions* — and the net's ~405cp error is larger than the typical eval difference between candidate moves (<100cp), so it scrambles rankings. The handwritten eval, meanwhile, is self-consistent even where its absolute scale is off, and a monotone scale error is harmless to alpha-beta. On top of that, the search's margin constants (aspiration/futility/delta) were calibrated to the handwritten eval's scale, making them effectively ~3.7x too generous for a net that outputs true centipawns.

The next moves are documented in the repo: scale the teacher data 100k → 1M (generation is free), raise teacher depth, scale-adapt the search margins, and consider a ranking-oriented loss. **The NNUE infrastructure (inference, accumulator, A/B harness) is preserved in the repo, disabled by default**, ready for the rematch. — That rematch is the next chapter: cycle 2.

---

## 9. Cycle 2 (in progress) — thinking on the opponent's time, and killing hypotheses one at a time

Cycle 1's defeat (19.6%) ended with several competing hypotheses about *why*. Cycle 2 runs on three tracks: (1) a structural improvement that works regardless of the eval function — **pondering**; (2) **isolated A/B tests** of the defeat hypotheses; (3) the main assault — **scaling up the teacher data**.

### Pondering (PR #296): the human's thinking time is free compute

A classic engine technique, "permanent brain." The moment the AI answers with its move, the Web Worker would otherwise sit idle while the human thinks — so it keeps searching the reply position (the one the human is looking at right now), warming the WASM transposition table that is kept across moves for the whole game. When the human finally moves, the real search probes a hot TT and reaches a deeper ply within the same time budget.

The heart of the implementation is "how do you make a synchronous search interruptible?" The WASM search is a synchronous call; run it naively for a long stretch and the worker goes deaf to messages. The answer is a loop of short 200ms search slices chained via `setTimeout(0)` (from the header of `ponderController.ts`):

```ts
// Why slices:
// - The WASM search is synchronous; a single long call would make the worker
//   deaf to incoming messages (the next `bestMove`, `clearTT`, ...). Instead
//   we run one short slice (default 200ms), return to the event loop via
//   `setTimeout(0)`, and queue the next slice. Any message that arrived during
//   a slice is dispatched *before* the queued slice callback, so calling
//   `stop()` from `onmessage` reliably cancels pondering with at most one
//   slice of latency.
```

Because the event loop dispatches incoming messages before the queued slice callback, pondering is guaranteed to yield within ~200ms of the human's move. Four safety rails:

- **A generation counter**: bumped on every stop()/start(), so stale timers can never run an old session's search
- **A 30-second total cap per turn**: an abandoned tab doesn't burn CPU/battery forever
- **Stop when the tab is hidden**: a worker can't see page visibility, so the client relays `visibilitychange` as `ponderControl` messages; on return, the session resumes with its remaining budget
- **Disabled for easy difficulty and when WASM isn't loaded** (easy is intentionally weak; without WASM there's no shared TT worth warming)

Zero API changes to the UI components — the worker simply starts thinking right after it answers:

```ts
// shogi-ai.worker.ts — answer first, then start thinking on the opponent's time
ctx.postMessage({ type: 'bestMoveResult', id: msg.id, move });
if (best) startPonder(k, best, msg.difficulty, msg.tesu | 0);
```

Benchmark (`scripts/shogi-ponder-benchmark.ts`: an identical 40-ply move sequence, hard settings at 2000ms per search, simulating 3 seconds of human thinking): **mean search depth 9.00 → 9.35 (+0.35 plies)** — deeper in 9 of 20 positions, equal in 8, shallower in 3 (TT replacement noise). In the opening, where the TT warms fastest, gains reached +2 plies (e.g., move 5: d11 → d13). Review findings (defensive message checks, a fallback for environments without `performance`, initial visibility sync, dev-only logging) were addressed; merged and live in production.

### The scale-calibration isolated A/B (PR #297): watching a plausible hypothesis die

Cycle 1's defeat hypothesis #2 was well-reasoned: "NNUE outputs true centipawns, but the search margin constants (aspiration window 300, futility 350/700, delta 150, RFP, …) were tuned for the handwritten V3 eval's scale — roughly 3.7x true cp (teacher fit: cp ≈ 0.27×v3). For NNUE they're effectively ~3.7x too generous, so pruning goes soft."

To measure this **without moving any other variable**, we added `setNnueOutputScale(numer, denom)` to the AssemblyScript engine. The rational rescale factor folds into the same i64 division as the cp conversion, so there is exactly one truncation:

```ts
// wasm-spike/assembly/index.ts (actual code, excerpted)
export function nnueEvaluateCp(): i32 {
  const outQ = nnueEnabled && !nnueForceFull ? nnueEvaluateFast() : nnueEvaluate();
  // Fold the output rescale (numer/denom, default 1/1) into the same i64
  // division so there is only ONE truncation — with 1/1 this is bit-identical
  // to trunc(out_q * K / 8128).
  let cp = (<i64>outQ * <i64>nnueScaleK * <i64>nnueOutNumer) / (<i64>8128 * <i64>nnueOutDenom);
  // ...clamp and return...
}
```

The default 1/1 is **bit-identical** to the previous behavior (a guarantee of zero regression). The setter has overflow guards: numer/denom capped at 1,000,000, the fraction reduced by gcd, and K×numer ≤ 2^32 enforced — no calling order of the setters can produce an overflowing pair.

Same run100k weights (K=600), applying **only the 37/10 calibration**, replayed under identical conditions (same seeds, same opening scheme) against the V3 baseline — 28 games total:

| Condition | Cycle 1 (uncalibrated) | Cycle 2 (37/10 calibrated) |
|---|---|---|
| 200ms × 16 games (seed 1) | 2W–14L–0D (12.5%) | 1W–14L–1D (9.4%) |
| 1000ms × 6 games (seed 2) | 1W–5L–0D (16.7%) | 0W–6L–0D (0.0%) |
| 1000ms × 6 games (seed 3) | 2W–3L–1D (41.7%) | 1W–5L–0D (16.7%) |
| **Total** | **5.5/28 (19.6%)** | **2.5/28 (8.9%)** |

**Not only did it fail to recover — it got worse (−10.7pt). Hypothesis rejected.**

The interpretation: uncalibrated, the effectively ~3.7x looser margins meant *shallower pruning* — which had been quietly acting as insurance, re-verifying the noisy evaluations (teacher MAE ≈ 405cp) with extra search. Calibrate the margins back to their intended strength, and the eval noise lands directly on the pruning decisions. **The dominant cause of defeat is the accuracy of the evaluation itself (hypothesis #1: eval noise scrambles move rankings), and the quality and quantity of the teacher data is the real battleground** — now confirmed.

The lesson: **even a well-reasoned mechanistic hypothesis can be rejected by an A/B test.** Cycle 1's post-mortem had three hypotheses; had we "fixed" them all at once, we would never have learned which one mattered. The tedium of isolating one variable at a time paid out right here. The mechanism stays: when strong weights arrive, one call aligns the scales without touching a single search constant.

### Scaling the teacher data (in progress): the main assault

With the real battleground confirmed, teacher-data generation is running.

- **Target: 1,000,000 positions** (10x cycle 1). Eight parallel YaneuraOu processes are generating continuously; currently **past 680k lines**
- **The `--balance` option**: positions with |cp| > 1200 (decided games) are probabilistically thinned to a 30% acceptance rate after labeling, raising the share of near-equal positions. Cycle 1's data was over 60% |cp| > 1000 — heavy on lopsided endgames and thin on exactly the subtle early/middlegame differences alpha-beta needs most
- **Ranking loss** (`train.py --loss ranking`): cycle 1's biggest lesson — alpha-beta needs the *ranking of sibling positions*, not absolute regression accuracy — encoded directly into the loss. In-batch position pairs whose teacher cp difference falls in a window (default 50–600cp) get an additional margin ranking loss, and **`val_pair_acc`** (pair-order agreement on pairs with teacher diff > 100cp) is now logged every epoch as the headline metric
- **A watcher is in place to automatically kick off an interim checkpoint training run at 300k lines** (baseline vs ranking loss comparison)

### What is an evaluation function, anyway — and how can an unreadable machine give correct answers?

Before going deeper into distillation, let's define the protagonist precisely. Contrary to a common assumption, an evaluation function does **not** directly judge "this move is good/bad." It does exactly one thing:

> **Show it a board, and it returns one number.** +250 means "Black is better by two and a half pawns"; −1200 means "White is winning"; 0 means "equal."

Then who decides whether a *move* is good? The search:

```
What if ▲2四歩?  → play it forward a few plies, ask the eval → +180
What if ▲7八銀?  → play it forward a few plies, ask the eval → −2500 (hangs the bishop)
→ play ▲2四歩
```

**"Move quality" = "a comparison of the scores of the positions that move leads to."** The eval is the judge; the search is a tour guide parading each candidate's future in front of that judge. Cycle 1's lesson — the judge needs correct *orderings* more than correct *scores* — falls straight out of this picture.

The **handwritten eval** running in production is a sum of human-readable rules (the skeleton of the implementation in `KyokumenImproved.ts`):

```text
score  = material balance;      // pawn=100, rook=1040, ... summed difference
score += piece-square bonuses;  // "this piece on this square is worth +N" tables, phase-weighted
score += king-safety count;     // gold/silver defenders around the king
score += castle shapes;         // pattern-matching Yagura / Mino / Anaguma
score += rook-file defense;
score += climbing-silver pressure;  // the term added in Chapter 2
score += major-piece activity;
return score;                   // e.g. +250
```

The **neural-net version** is a completely different machine answering the same question (board → number); open it up and you find 580,000 anonymous numbers, with no row labeled "king safety" anywhere. Yet from the search's point of view the two are **fully interchangeable** — the search only demands "a box that returns a number when handed a position," and never asks what's inside. The A/B matches in this chapter are literally "swap the judge, keep the same search, play the games."

Which leaves the real question: **if you can't read it, how can it be right?** Answer: because "right" is measured by outcomes, not by explainability. There is a perfect precedent close to home — **a strong player's intuition**. A 2-dan player glances at a position and *feels* "Black is better," yet cannot fully verbalize the judgment; the after-the-fact explanations ("material advantage," "thin king") don't describe the actual computation happening in their head, which is invisible even to them. And still the judgment is usually correct. A neural net implements exactly this kind of *intuition that bypasses verbalization* as a block of numbers — where the handwritten eval can only hold knowledge someone managed to put into words, the net absorbs patterns directly from a million of YaneuraOu's judgments.

How do you trust what you can't read? **You don't read it — you examine it.**

1. **Measure its deviation from the teacher on 4,000 unseen positions** (holdout MAE)
2. **Measure how often it agrees with the teacher on *which of two positions is better*** (`val_pair_acc` 0.89 = agreement 89 times out of 100)
3. **Finally, make it play**

This article's refrain — "the final gate is always playing the games" — is also a corollary of *unreadable things can only be audited by their behavior*.

The flip side of the coin lives in the same place: when the net is wrong, **the reason it is wrong is just as unreadable**. With the handwritten eval we once pinpointed "the climbing-silver term cuts off at rank 4" and fixed that line. A net's mistakes can only be fixed by changing the data and retraining — which is why the seemingly roundabout journey from the 19.6% defeat to "scale up the teacher data" was, in fact, the only repair procedure a neural network offers.

### Reading the model and the training loop, line by line

"Machine learning" may conjure something enormous and opaque, but the network used for distillation is small enough to **quote in full** (the complete `DistillNet` from `ml/train.py`; the comments are replaced with annotations for this article). Here is what each line does and why it was designed that way.

```python
class DistillNet(nn.Module):
    H1 = 256   # width of layer 1 — the traditional NNUE choice; this dominates inference speed
    H2 = 32    # width of layer 2 — squeezing straight down to 1/8th, the NNUE signature

    def __init__(self):
        super().__init__()
        # (1) Board input layer. Each of 2,268 possible 'facts' — like "black pawn
        #     on 7f" — gets its own row of 256 numbers (a weight vector). Evaluating
        #     a position starts by summing the rows of every fact that holds.
        #     EmbeddingBag(mode="sum") does exactly that lookup-and-sum in one op;
        #     padding_idx is a dummy row for batch shaping (always zero, contributes nothing).
        self.board = nn.EmbeddingBag(BOARD_FEATS + 1, self.H1, mode="sum", padding_idx=PAD_IDX)
        # (2) Hand input layer: counts of the 14 droppable piece types -> same 256 dims
        self.hand  = nn.Linear(HAND_FEATS, self.H1)  # its bias doubles as layer 1's bias
        # (3)(4) Reduction layers: 256 dims -> 32 -> a single number (the evaluation)
        self.l2    = nn.Linear(self.H1, self.H2)
        self.l3    = nn.Linear(self.H2, 1)
        # Init: the board table starts from small random values (dummy row pinned to zero)
        nn.init.normal_(self.board.weight, std=0.01)
        with torch.no_grad():
            self.board.weight[PAD_IDX].zero_()

    def forward(self, board_idx, hands):
        a1 = self.board(board_idx) + self.hand(hands)  # combine board + hand contributions
        h1 = torch.clamp(a1, 0.0, 1.0)   # ClippedReLU: clip into [0,1] — the NNUE activation,
        h2 = torch.clamp(self.l2(h1), 0.0, 1.0)  # chosen so int16 quantization won't break it
        return self.l3(h2).squeeze(-1)   # one output ≈ cp / 600
```

For scale: almost all the parameters live in table (1) — **2,268 rows × 256 columns ≈ 580,000 numbers** — and nowhere in them is "king safety" or "climbing silver" written down. Where the handcrafted eval is a sum of *concepts a human named* (castle shapes, file defense, ...), this is **580,000 anonymous dials that adjust themselves during training**. ClippedReLU is not a stylistic choice but a practical one: because activations are pinned to [0,1], the trained float weights survive quantization to int16 for the WASM engine's integer arithmetic.

The heart of the training loop:

```python
out = model(b, h)                         # let the net score a minibatch of positions,
loss = F.mse_loss(torch.sigmoid(out), t)  # loss = deviation from YaneuraOu's scores (= base)

if args.loss == "ranking":                # the ranking variant adds this block
    diff = c.unsqueeze(1) - c.unsqueeze(0)     # teacher cp difference for every in-batch pair,
    mask = (diff >= args.rank_pair_min) & (diff <= args.rank_pair_max)
    #  keep only the *subtly different* pairs (default 50–600cp).
    #  Under 50cp: either is fine. Over 600cp: already obvious. In between is where search lives.
    ia, ib = mask.nonzero(as_tuple=True)       # indices of the selected pairs (better/worse side)
    if ia.numel() > 0:                         # only batches that actually contain such pairs
        rank_loss = F.relu(rank_margin_logit - (out[ia] - out[ib])).mean()
        #  Penalize exactly the pairs where the teacher says A is better but the net
        #  does not rank A above B by the margin. Absolute accuracy is not demanded —
        #  only the ordering.
        loss = loss + args.rank_weight * rank_loss

opt.zero_grad()   # clear the previous batch's gradients,
loss.backward()   # backpropagation: compute, for all 580k dials at once, which way
opt.step()        # reduces the loss — then nudge every dial. Repeat for 300k positions × dozens of epochs
```

The two losses have **different goals**. `mse_loss` (base) says "match the teacher's score" — studying to reproduce the teacher's exam marks exactly. `rank_loss` says "your scores may drift, but **the direction of 'which of these two positions is better' must agree with the teacher**." That is cycle 1's core lesson — alpha-beta only ever asks the eval "which sibling is better?", never "what is the true score?" — translated directly into the shape of the loss function. Training runs on the Mac's GPU (MPS); one 300k-position run takes 2–4 minutes. Far lighter than the "machine learning = heavy machinery" image.

#### What actually happens inside `loss.backward()`

"Adjust the weights in the direction that reduces the loss" — but who knows that direction, and how? The principle is humble. **For each of the 580,000 weights, ask: "if I nudged this one up a tiny bit, would the loss go up or down, and how steeply?" That slope is the gradient — and then turn each dial a small step in the loss-reducing direction.** `opt.step()` is essentially this one line:

```
new_weight = current_weight - learning_rate * slope
```

The learning rate is "how far to turn per step": too large and you overshoot into divergence, too small and you never arrive (this project starts at 1e-3 with cosine decay).

The non-obvious part is computing the slopes. Naively you would nudge one weight, re-evaluate the whole net, and repeat — 580,000 re-evaluations. Backpropagation uses the chain rule of calculus to push the *blame* for the error backward through the layers, computing **every weight's slope simultaneously in a single backward pass**:

```
output error: "the evaluation came out 0.3 too low"
  ↓ blame l3's weights   "the final judgment underweighted this feature"
  ↓ blame l2's weights   "that feature came out weak because of this reduction"
  ↓ blame the board table "the numbers in the 'pawn on 7f' row were too small to begin with"
```

The picture to keep: **someone descending a foggy mountain blindfolded**. Nobody can see the whole map (the correct set of weights), but the slope underfoot can be computed at every step — strictly, the slope over the current minibatch, an estimate of the true gradient (that's the "stochastic" in stochastic gradient descent). Take a small step in the steepest downhill direction — one minibatch is one step, and 1M positions × 40 epochs ≈ over a hundred thousand steps. "val_mae dropped to 437cp" means this descent reached a valley whose altitude is a 437cp average error.

The ranking loss also becomes intuitive in this picture: **changing the penalty reshapes the mountain itself**. On a mountain that only punishes score error, the places where sibling positions are ranked in the wrong order are shallow dips the descent ignores. The ranking term carves those places into deep valleys — so the very same descent algorithm now walks toward lowlands where the *ordering* is right. Where you end up is decided by what you punish.

### The 300k interim result: proof that data was the bottleneck

At the 300k-line mark we trained both variants on a snapshot and sent them into the same 28-game gauntlet as cycle 1, under identical conditions.

| Condition | run100k (cycle 1) | run300k-base | run300k-rank |
|---|---|---|---|
| 200ms × 16 games (seed1) | 2-14-0 (12.5%) | **6-10-0 (37.5%)** | 3-13-0 (18.8%) |
| 1000ms × 6 games (seed2) | 1-5-0 (16.7%) | 1-5-0 (16.7%) | **3-3-0 (50.0%)** |
| 1000ms × 6 games (seed3) | 2-3-1 (41.7%) | 1-5-0 (16.7%) | **3-3-0 (50.0%)** |
| **Total** | **5.5/28 (19.6%)** | 8/28 (28.6%) | **9/28 (32.1%)** |

Two things to read here. First, **both variants clearly beat run100k**. Even base — with zero changes to the training method — gained +9pt from 3x data plus balance thinning alone: direct confirmation of the "data was the bottleneck" diagnosis. Second, a **time-control asymmetry** appeared: rank reaches **parity (50%) with the handcrafted eval at 1000ms** (production's medium budget) but sinks in 200ms blitz, while base does the reverse. The interpretation fits the theory — the deeper the search, the more pair-ordering accuracy (rank's strength) compounds; in shallow search, calibration of big scores (base's strength) feeds directly into pruning decisions. Production budgets are 1–5 seconds. **Which horse to back is obvious.**

Along the way we also applied the 37/10 scale calibration to run300k-rank: 50% → 25%, worse again. Another nail in the calibration hypothesis's coffin.

The 1M full training will produce three runs — base / rank(weight 1.0) / rank(weight 0.3–0.5) — and A/B all of them at BOTH 200ms and 1000ms, 16+ games × 3 seeds each. The gate: **stable >50% at 1000ms** — cross it, and the first neural network to replace the handcrafted eval ships to production.

### Generation is slow: how an "11-hour wait" became 45 minutes

Projecting the remaining generation time toward 1M positions gave **about 11 hours**. "Can't you throw more GPU at it?" — a fair question, but the investigation landed somewhere unexpected. One look at per-process CPU usage settled it:

```
node (generation driver)   : CPU 100%   ← one core out of 14, maxed out
YaneuraOu × 8 processes    : CPU ~0%    ← all idle
machine overall            : 81% idle
```

The pipeline alternates between (1) **creating** positions via low-budget self-play of our own engine and (2) **labeling** them with the eight YaneuraOu processes. Measured per chunk: **generation 102s vs labeling 1.5s**. The labeling side (capable of ~1,300 positions/sec across 8 engines) was massively underutilized; the bottleneck was the *creating* side from start to finish. GPUs are irrelevant here — YaneuraOu's NNUE is designed to run on CPU+SIMD, and besides, the engines were the ones sitting idle.

Why was the creating side slow? Node.js is single-threaded, so **one process = one core**, and — the kicker — move selection was still using the **JS version** of our engine. The WASM build (15x faster, bit-identical to JS) built for production was sitting right there. The fix came in two steps:

1. **Scale drivers from 1 to 3 processes** (each writing its own file, concatenated later — one core's work spread over three)
2. **Swap move selection from JS to WASM** (a `--wasm` flag; the position distribution is unchanged since it is the same engine, same search. Chunk generation: 102s → 27s)

```
[gen] chunk done: +1095 (gen 27.5s, label 1.7s = 1176.5 pos/s)   ← after WASM swap
```

Combined throughput went from ~8 positions/sec to **~110 positions/sec (14x)** (each dataset line is one position, so lines/sec is the same number), and the remaining time from **11 hours to 45 minutes**.

The way the cores get used is the interesting part. There are 27 processes in total — 3 Node drivers, **each commanding its own squad of 8 YaneuraOu engines**, hence 24 engines — yet **on average only 3–4 cores are busy**. The 24 engines are burst workers — they sit idle until ~1,000 positions pile up, grade them all in 1.5 seconds flat, and sit back down. The only always-busy workers are the three Node cores producing positions: **size the always-busy roles to your core count, and overprovision the burst roles** so their bursts never stall the producers.

Two lessons. **When a wait feels long, look at `ps` first to see which process is actually busy** — a common-sense remedy like "use the GPU" whiffs entirely if the bottleneck lives elsewhere. And **speed assets you build once get reused in unexpected places**: the WASM engine built to make the browser opponent stronger turned around and made the machine-learning teacher-data factory 14x faster.

### Anatomy of the final phase: waits you can cut, and waits you must not

Once the million positions were in, here is the remaining pipeline to a verdict, with time estimates:

| Stage | Duration (original plan) | Compressible? |
|---|---|---|
| Train 3 runs (base / rank w=1.0 / rank w=0.4, MPS) | 30–45 min | Barely worth it (one GPU, serial is fine) |
| Quantize + 3-way bit-exact verification | 10 min | No need |
| A/B screening (3 models × 22 games) | ~1.5 h | **Yes** |
| A/B finals (top 2 models × 48 games × 1000ms) | **~2.7 h ← dominant** | **Yes** |
| Production wiring PR if the gate passes | 1–2 h | Normal PR flow |
| **Total** | **~5 hours** | **→ ~2.5 hours** |

The games dominate — and games carry a constraint fundamentally different from generation: **you cannot shorten the thinking time of a single game**. The thing being measured is "strength when thinking for 1000ms"; speed up the thinking and you've changed the measurement itself. One game ≈ 150 moves × 1 second ≈ several minutes is the *definition* of the experiment, not waste.

What can be cut is the **serialization between games**. One match process effectively uses one core (both sides think alternately inside the same process), so the 14 cores freed by the finished generation job can host **six parallel matches**, split by seed and model. 48 games through one process take 2.7 hours; through six, about 27 minutes. **Nothing inside any single game changes — every game still gets its full thinking time**; we only rearranged the queue, so the measurement is intact and only the wall clock shrinks.

The fairness argument is also different from the generation case, and worth spelling out: time-controlled engine matches are sensitive to machine load, but **both sides of an A/B think alternately inside the same process**, so any load hits both players equally. Keep the parallelism comfortably below the core count (6 matches + training ≈ 8 of 14 cores) and "one side got unlucky with the scheduler" cannot happen structurally.

The time-saving patterns this project kept reusing boil down to three moves:

1. **Identify the busy process** (`ps` — don't pick remedies by intuition)
2. **Swap in a faster asset you already own** (JS → WASM, only where it changes neither the measurement nor the distribution)
3. **Tile the incompressible waits in parallel** (thinking time is the definition of the experiment — untouchable; the number of boards running side by side is yours to choose)

And cycle 2's verdict will be decided the same way as ever: **by playing the games.**

### The verdict: 77.1% — the day the neural net replaced the handwritten eval

With the million positions in (1,008,878 lines; the last 4,000 held out), we trained the three runs (40 epochs, 7–10 minutes each) and first graded **all six generations of models on the same unseen 4,000 positions**:

| Model | MAE | pair_acc | equal-range (0–300) MAE |
|---|---|---|---|
| run100k | 558.9cp | 0.8370 | 407cp |
| run300k-base | 513.6cp | 0.8471 | 366cp |
| run300k-rank | 645.3cp | 0.8519 | 287cp |
| **run1m-base** | **458.7cp** | **0.8727** | 258cp |
| run1m-rank10 | 699.4cp | 0.8613 | **165cp** |
| run1m-rank04 | 622.8cp | 0.8640 | 217cp |

An unexpected reversal: **at 1M, base overtook the ranking-loss runs even on pair ordering**. At 300k, "ranking loss directly optimizes ordering" had been the winning argument — but with enough data, plain regression learns the ordering too. **Ranking loss was a crutch for data starvation.** One more lesson for the pile: scale the data before reaching for exotic loss functions.

Then the games. Screening (3 models × 22 games) eliminated rank10; the two finalists played **1000ms × 16 games × 3 seeds**:

| Seed | run1m-base | run1m-rank04 |
|---|---|---|
| s11 | 12-3-1 (78.1%) | 10-6-0 (62.5%) |
| s12 | 11-4-1 (71.9%) | 10-5-1 (65.6%) |
| s13 | 13-3-0 (81.3%) | 9-7-0 (56.3%) |
| **Total** | **37/48 (77.1%)** | 29.5/48 (61.5%) |

**The adoption gate (>50%) was cleared at 77.1%, with every seed above 70%.** The genealogy: run100k **19.6%** → run300k-rank **32.1%** → run1m-base **77.1%**. The diagnosis reached by killing the scale-calibration hypothesis in an isolated A/B — *teacher data quality × quantity is the real battleground* — turned out to be exactly the winning move.

### Shipping it: PR #305

Production the same day. The design: aggressive switch, defensive depth:

- The weights (1,185,988 bytes — int16 weight matrices plus int32 biases) ship as a static asset (`public/shogi-nnue-weights.bin`), fetched asynchronously at worker startup and copied into WASM memory. **Zero bundle-size increase.** Until the fetch resolves, the engine plays on V3 as before (the first moves come from the book anyway)
- **Only medium and up (≥1s) use NNUE.** Easy (250ms) stays on V3 — following the measurement that V3 still wins at ~200ms budgets (NNUE 40.9%). The time-control asymmetry observed throughout cycle 2 — deep search compounds ordering accuracy, shallow search leans on score calibration — landed directly in the difficulty design
- Fetch failure, size mismatch, or WASM trouble all fall back silently to V3. Yesterday's production path is today's insurance
- Switching NNUE⇔V3 clears the TT (so V3's ~3.7x-scale scores never mix with true-cp scores inside the table)

The review bot earned its keep once more — six findings including a **production-only trap** ("workers loaded via blob URLs break root-relative fetches"), all addressed. After deploy, we verified the weights served from the production URL are SHA1-identical to the repo file. Shipped.

**The "values" of the medium-and-up AI on meetyudai.com are, as of today, not seven months of handwritten rules — they are some 590,000 numbers distilled overnight from a million of YaneuraOu's judgments.**

### The strength genealogy (a chain of measurements)

No absolute rating was ever measured (that's decided against humans), but every generational matchup was:

| Transition | Measured | Rough Elo |
|---|---|---|
| V18 → V19 | 37-17-12 (68.5%) | +135 |
| V19 → V20 | vs V18: hard 10-0-2, **at half the old time budget** | +200–300 |
| V20 JS → WASM | 10-0, +3–4 plies at equal time | +250–400 |
| + JS micro-improvements | neutral at production time (9-12-11) | ±0 |
| + Pondering | +0.35 mean depth | +20–40 |
| + Book audit | even in self-play; killed 11 human-exploitable holes (up to −2500cp) | real vs humans |
| V3 → NNUE | **77.1%** (1000ms, 48 games) | +210 |

Roughly **+800–1000 Elo cumulative** — the scale of a beginner becoming a dan player. With the usual caveats: self-play Elo overstates strength against humans, and the absolute anchor is unknown. The real grading happens over the board.

### Q. Can it get any stronger? — A. Yes. The blueprint for Cycle 3

Readers will ask, so let's answer up front. **77.1% is not a ceiling.** It's the stage where the *first* step of going neural succeeded — and the remaining headroom is measurable. There are five levers.

**(1) KP features — the biggest headroom.** The current input is a plain one-hot of 2,268 features: "which piece sits on which square," nothing more. Real NNUE doesn't encode the board that way — it uses **piece placement *relative to your own king*** (KP). The same "silver on 5e" becomes a different feature depending on whether your king sits in a static-rook castle or a ranging-rook one — which means the king's context gets expressed orders of magnitude more finely. Given that the single hardest part of seven months of handwritten eval was "valuing the area around the king," this lever can hardly fail to matter. Expected gain: on the order of +200–400 Elo.

**(2) More and better teacher data.** 1M positions → 5–10M. Cycle 2 already made generation 14x faster, so this is a matter of wall-clock waiting, not heroics. At the same time, deepen the teacher's search from depth 8 to 12+ — more accurate model answers from a deeper-reading YaneuraOu. As the run100k → run1m lineage showed (19.6% → 77.1%), we haven't hit diminishing returns on this axis yet.

**(3) WASM SIMD128.** The net's inner loop is almost entirely multiply-accumulate, so computing 4–8 elements per instruction with SIMD128 makes inference 2–4x faster. And as Cycle 2 kept demonstrating: with the same eval, more search nodes compound the ranking accuracy.

**(4) Multithreaded search.** Parallelize the search with SharedArrayBuffer. It requires COOP/COEP headers on Vercel, but once configured, four cores can search roughly four times as many nodes.

**(5) The self-play loop.** Today's teacher positions come from the *old* engine's self-play. Have the NNUE version of ourselves generate them and retrain — a positive loop where every gain in strength produces better-distributed training data.

Where's the theoretical ceiling? The browser as hardware can run professional-grade shogi AI — other sites have already proven that (lishogi, among others, runs the WASM build of YaneuraOu). So the limit isn't the browser; it's this engine's maturity. But this project **will not take the drop-in-someone-else's-engine route**. Growing a homegrown engine by measurement is the point of the project, and it's the owner's explicit policy.

Cycle 3 followed exactly this blueprint. The next chapter is its full record.

---

## 11. Cycle 3 (complete) — going faster, and fighting the "nonsense moves"

After writing the blueprint, we actually did the work. The short version: **the speed came exactly as planned. And on the real battleground — strength — the lessons of Cycle 1 and Cycle 2 both came back to collect at once, but in the end we overcame them, all the way to the author himself confirming over the board that it "got stronger."** This chapter is the full record. Of the blueprint's five levers, the speed ones (SIMD, multithreading) worked cleanly, the knowledge one (KP features) came back a negative result, and the NNUE we had shipped to production **collapsed against a human over the board**. Here is the diagnosis, the 5.24M-position teacher data that cured the saturation, and the moment the author confirmed it "definitely got stronger" — with none of the numbers left out.

### 11.1 Making the search faster (confirmed wins)

Speed first. This is a domain you can guarantee mechanically, so the results landed as intended.

**WASM SIMD128 (PR #309).** What is SIMD, first of all? It's a mechanism for **processing multiple pieces of data with a single instruction**. An ordinary CPU instruction handles one "add a and b" at a time. SIMD does "add a1+b1, a2+b2, …, a8+b8 **all at once**" in one instruction. WebAssembly has a 128-bit-wide register called `v128` (think: a temporary box for computation), and you can pack eight 16-bit integers into it and operate on them in one shot.

NNUE inference — the process of computing "how many points is this position worth" — is, once you unwrap it, **almost entirely multiply-accumulate**: "weight × activation, add it in," repeated thousands of times. This is SIMD's home turf. In the actual code (`wasm-spike/assembly/index.ts`), we rewrote the accumulator update (the array that holds the running total) to read eight 16-bit weights at a time with `v128.load`, sign-extend them into `i32x4` lanes, and add them in — eight elements per loop.

Measured, it came out like this.

| Operation | Scalar | SIMD | Speedup |
| --- | --- | --- | --- |
| One eval (with diff application) | 1191ns | **191ns** | **6.2x** |
| Full recompute (no diff) | 6425ns | **1156ns** | **5.6x** |
| Real search (overall) | — | — | ~**1.4x** |

6.2x on the microbenchmark, 5.6x on full recompute. But the overall effect in real search is only about 1.4x — search does more than evaluate (move generation, alpha-beta pruning checks, etc.), so a 6x-faster eval doesn't stretch the whole thing that far (this is Amdahl's law, exactly). Even so, 1.4x is a lot. As Cycle 2 taught us, **with the same eval, more nodes searched compound the accuracy of ranking sibling moves**.

The most important thing here is **the correctness guarantee**. NNUE inference is built on integer arithmetic. Integer addition is associative (reordering doesn't change the answer), so adding in SIMD batches or one-at-a-time in scalar produces **a bit-for-bit identical result**. Floating point wouldn't allow this (rounding error changes with order). In fact, we searched the same positions with the SIMD and scalar versions and confirmed that **the number of nodes visited matches to the single node**. It got faster, but it doesn't play a single different move. This is a continuation of the "bit-identity" discipline established in the WASM port of Chapter 6.

**Multithreaded search / Lazy SMP (PR #312).** Next, parallelization. On the visitor's browser, **up to four threads search the same position simultaneously**. The technique is called Lazy SMP, and as the name implies it's a "lazy" parallelization — each thread searches independently, but they share results through a **shared transposition table** (a shared notepad where you post the result of a position you've already computed; TT for short). If one thread discovers "this position is a mate," the others read that note and skip the redundant recompute. Rather than strictly dividing the work, the synergy of varied search orders plus the shared notepad makes the whole thing faster.

Result: **nodes go up ~3.0x** (four threads fall short of the ideal 4x, but that's reasonable given sharing/synchronization overhead). And strength? We measured it with an A/B match — the 4-thread multithreaded build (MT) versus the 1-thread single-thread build (ST), at a production-equivalent 1000ms × 24 games.

> **MT 14 wins, 10 losses (58.3%, a point estimate of roughly +58 Elo)**

At a glance, it's ahead. But **to be honest: n=24 is nowhere near statistical significance — it's only a "point estimate."** A 14–10 split over 24 games happens by chance about as often as 14 heads in 24 coin flips. Per the "self-play statistical degeneration" lesson we got stabbed by repeatedly in Chapters 4 and 9, this is a weak "seems to be working" signal, not a settled number. It really should be pushed to 100+ games. Still, with the mechanistic backing of 3.0x nodes, we believe the direction.

Worth recording a technical snag. Sharing positions across threads requires `SharedArrayBuffer` (memory that can be shared between threads). Browsers only permit this under **cross-origin isolation** (a state where the page is isolated from other sites, via two HTTP headers, COOP and COEP) — for security reasons. But if you apply those headers site-wide, externally loaded images and scripts get blocked across the board and **the home page breaks**. So in `next.config.ts` we **scoped COOP/COEP to the shogi page paths only** (a comment in the code spells out "Deliberately NOT site-wide"). Only the shogi page becomes an isolated environment; every other page is untouched — a pinpoint design.

And — this foreshadows the next section — **multithreading only "makes the search faster"; it does not fix the "nonsense move" problem below by even a millimeter.** Fast or slow, if the eval scores the same position wrong in the same way, the move that comes out is identical. Speed and strength are different axes — that's the theme running through this whole chapter.

### 11.2 The negative result on KP features (PR #311)

We tackled the KP features, which the blueprint called "the biggest headroom." The verdict up front: **it whiffed.** But this whiff shares a root with Cycle 2's defeat.

**The aim.** The current NNUE input encodes the board straight as "which piece is on which square." Real (professional-grade) NNUE doesn't do this. It uses **"piece placement relative to your own king"** — King-Piece, KP for short. The same "silver on 5e" is **distinguished as a different feature** depending on whether your king sits in a static-rook castle or a ranging-rook one. That means it can express, orders of magnitude more finely, the single most important and least verbalizable context in shogi: "king safety." Since valuing the area around the king was the single hardest part of seven months of handwritten eval, we figured this could hardly fail. Expected value: +200–400 Elo.

**The implementation.** Full KP explodes the feature count, so we built a **reduced KP that quantizes the king's position into 6 buckets (regions)**. Classify where on the board the king roughly sits into 6 categories, and keep piece-placement features per category. We also prepared a factorized version (which decomposes "king position" and "piece position" so it can learn even with less data). The weight file swelled from **1.19MB to 6.70MB** — more parameters, in exchange for more expressive power.

**The result.** Neither the approximation accuracy on the holdout (positions set aside for validation, never used in training) nor the head-to-head win rate **beat the incumbent.** The reduced-KP, 6-bucket version (kpf6) went **37.5%** against the current NNUE. Not an improvement — a losing record.

**Why.** The cause was "data dilution." Our teacher data is only 1M positions. Split it into 6 buckets and, naively, you get under ~170k positions per bucket on average. Worse, in real shogi games **positions where the king hasn't yet moved from its starting square make up about half of everything** — the opening-to-early-middlegame entryway is common. So the "king hasn't moved" bucket hoards data and the others go empty. We made the representation finer, but there isn't enough data to fill in that fineness. This is **exactly the same "data-shortage wall" as when the NNUE first lost in Cycle 2.**

An intuition for the ML beginner here. **Making features finer increases the model's expressive power (the number of situations it can distinguish). But learning each of those added distinctions requires enough examples for each.** Make the distinctions 10x finer and, in principle, you need 10x the data. Expressive power and data volume can't be raised independently — you have to raise them as a set, or you just mass-produce "fine but hollow" features. That's dilution. KP features are the right direction, but **1M positions was too early.**

So we didn't throw it away — we saved it. The implementation infrastructure for KP (reduction, factorization, weight format) stays intact, and once the 5M positions below are done, we'll **try again**. It's a question of ordering, not a rejection.

### 11.3 A loss over the board, and diagnosing NNUE "saturation"

This is the climax of the chapter — probably of the whole article.

**Background.** In Cycle 2, the NNUE beat the old eval (V3) **77.1%** in self-play. It cleared the quality gate handily, so we shipped it to production at medium difficulty and up (PR #305). The genealogy climbed cleanly, 19.6% → 32.1% → 77.1% — case closed. Or so it should have been.

Except. **The person writing this article (a 2-dan amateur) actually played the production hard difficulty (2 seconds) — and won.** Not by a hair, either, and with the report: "still way too weak. **It keeps playing nonsense moves.**" Dropping a pawn somewhere irrelevant to the mate, walking its own king into the danger zone — moves that any human sees instantly as "what is this," chosen after a full 2 seconds of thought.

This was the complete return of Cycle 1's biggest lesson: **"a self-play win rate does not guarantee strength against humans."** We fell into the same trap a second time. Beating V3 77.1% in self-play, and beating a human 2-dan, were different things.

**The diagnostic method.** To hit it with facts instead of impressions, we ran the entire game record (81 plies) through the reproduction harness. We replayed it through **the exact production call path**, and for each move compared "what the engine picks with NNUE ON" against "what it picks with NNUE OFF (i.e., the V3 eval)." Then we cross-checked every move against **YaneuraOu at depth 18** (the model answer from a professional-grade engine reading to depth 18), quantifying where and how much was lost, in cp (centipawns; an eval unit where one pawn ≈ 100).

**The facts we found, in order.**

**(1) The bad moves weren't an "instant-move bug" — the search genuinely considered them.** The first suspect was a relapse of the "bypass the search and answer instantly" class of bug from Chapter 3. But no. The bad moves reproduced on the NNUE path (ON: 19 of 40 moves disagreed with YaneuraOu), while OFF (V3) the disagreements were only 7. Which means, with NNUE ON, **the engine searched the full 2 seconds and chose that bad move believing it was best**. This isn't a bug — it's a flaw in the evaluation function itself. As diagnoses go, this is the worst kind — the hardest to fix.

**(2) The main culprit is "sigmoid saturation."** This is the core. During training, the NNUE passes the teacher's cp value through the function `sigmoid(cp/600)` before learning from it. Sigmoid is an S-curve that squeezes its input into 0–1, and **as the input grows the output pins to 1 and stops moving** (i.e., it saturates). A sigmoid on `cp/600` **flattens out almost completely once the eval reaches around ±2500cp**. During training this is fine — you don't need to finely distinguish already-decided positions.

But **in the real search**, this is a mortal wound. Consider a near-mate position. At **move 72 of this game — where its own king walks itself into mate, ...K-1a (a loss of 31934cp; since cp counts one pawn as ~100, that's a blunder equivalent to being about 319 pawns of material down)** — what was happening? When we had the NNUE evaluate all 71 legal moves, **all 71 collapsed into a mere 15cp band, indistinguishable from one another.** Whatever you play, it looks like "roughly the same score." In the saturation region, the difference between "the least-bad move" and "the worst move" in a lopsided position gets crushed flat by the sigmoid and vanishes.

Show the same position to V3, and it kept a **spread of about 390cp**. V3 can still rank moves properly in decided positions. **"In a position where the outcome is decided, every move looks like the same score" — this is the direct cause of the "nonsense moves."** If it can't tell moves apart, the engine effectively chooses close to at random. Walking into mate follows naturally.

**(3) A secondary example: move 48, P*8a.** It's not only saturation. At move 48, **a meaningless pawn drop onto the deepest rank of its own camp (8a) (a loss of 1626cp)** was chosen. Here the NNUE **misjudged the position as roughly even**, and as a result "pass-like moves (equivalent to doing nothing)" clustered at the top of the ranking. Dropping a pawn on the very back of your own camp is, in shogi terms, a high-cost move nearly equivalent to killing a piece. But **that cost is nearly invisible to the net.** Why? Because moves of this kind (meaningless drops into one's own camp) are **essentially absent from the teacher data.** YaneuraOu never plays such a move, so the net was never once taught "how bad a pawn drop to your own back rank is." It can't evaluate the cost of a folly it has never seen.

**(4) A further secondary cause: search-speed collapse in the endgame.** Entering the endgame, search speed dropped to **27–41µs/node** and the depth reached fell to **4–6 plies** (far shallower than the opening/middlegame). Read only shallowly and move quality drops. But this is **a separate problem unrelated to the eval** — the same symptom appears with V3, which doesn't use NNUE. It should be separated from saturation (the endgame slowdown remains as its own homework).

**(5) The "true culprit" that worsened the saturation.** Here the story connects back to Cycle 2. Saturation itself is a property of the sigmoid, but **what worsened it into a mortal wound** lay in how the teacher data was made. The causal chain is a little involved, so let me unwind it step by step for the beginner.

Terms first. A **decided position** is one where the outcome is essentially settled. This article draws the line at **|cp|>1200** (one side is ahead by 12 pawns' worth or more). Conversely, a nail-biter that's even or within a few pawns is a **close position**. In human terms: a decided position is "a lead so big you could resign," a close position is "still anyone's game."

**The reason for the thinning was actually good.** If you collect positions from random self-play, left alone you end up with **mostly lopsided endgame positions** (the further a game goes, the wider the gap, so the sample skews). So in Cycle 2 we used the `--balance` option to **discard 70% of the decided positions with |cp|>1200 (keeping only 30%) and raise the proportion of close positions.** The aim was to make the AI practice the middlegame and close fights it agonizes over most — like showing a medical resident plenty of subtle, hard-to-judge patients rather than only textbook-clear cases. That, on its own, is entirely sound.

**But over-thinning worsened the saturation.** By discarding too many decided positions, the NNUE **graduated having barely practiced "positions where the outcome is settled."** So when it meets a decided position in production, it can't tell moves apart — **they all look like the same score.** The region where the sigmoid mathematically flattens out (around ±2500cp) overlapped with this region "made unknown by lack of practice," and the collapse followed.

**The analogy (the resident).** What happens if you show a medical resident only "subtle, hard-to-diagnose patients" and almost never "obviously critical patients," then put them on the floor? When a patient in critical condition is wheeled in, they have no sense of "how bad is this," and everyone looks "medium." The NNUE that never practiced decided positions is the same: it simply can't gauge the severity of critical (near-mate) positions.

**Move 72 of this game was exactly this.** The move 72 we saw in (2) — a decided, near-mate position, yet all 71 moves looked like a 15cp band (nearly the same score) to the NNUE — is precisely the symptom of "the resident who never practiced critical patients." That's why it calmly chose to walk into mate. **The "nonsense moves" were, at their root, the mathematical flattening of saturation and the distributional hole of over-thinning meshing together in the very same place.**

So it's a double trap. **The region the sigmoid structurally saturates in** and **the region left thin by the thinning** (OOD in English, Out-Of-Distribution — a region that was barely in the training data, "unknown" to the net) both **overlap in exactly the same "lopsided, decided positions."** Where the distinctions collapse from saturation, the training data is also insufficient. The two meshed together and produced the endgame collapse. Cycle 2's "well-intentioned thinning" bared its fangs in Cycle 3.

**Immediate response: a hotfix (PR #310).** Once the diagnosis was in, we couldn't leave the collapse in production. **We narrowed the NNUE's scope to medium only.** Looking back soberly, the 77.1% figure was measured **at 1000ms only**, and hard (2000ms) and up was merely an **unverified extrapolation** — "read deeper and it should be even stronger." The deeper you read, the easier you reach saturation-region positions, so if anything hard is *more* prone to collapse. So we reverted hard and up to the V3 eval, removing the saturation-borne nonsense from production. In the code (`shogi-ai.worker.ts`) we narrowed `NNUE_DIFFICULTIES` from `medium..master` down to just `medium`, and documented in a comment the collapse symptoms ("all 71 moves within 15cp at a decided position," "nonsense moves like P\*8a / K-1a") and the conditions for restoring it.

**We changed the verification standard itself (the heaviest lesson of this chapter).** The biggest regret is that **using "self-play win rate" as the acceptance criterion was itself the mistake.** 77.1% is a real number, but what it measured was "can it beat V3 in self-play," not "does it avoid blunders in real human games." We passed the proxy metric while the behavior that mattered was broken.

So we swapped the criterion. The acceptance gate from now on is the **"blunder rate" on real game records cross-checked against YaneuraOu depth 18.** Not a self-play win rate — we directly measure "how often it chose a move YaneuraOu wouldn't" in real games against a human. And — **we made this very 81-ply game record a permanent regression test.** No matter what change we make going forward, we always replay this record and check that the blunder rate hasn't risen. No test case is more valuable than a failure a human actually punished.

### 11.4 The road to a real cure — rebuilding the teacher data, and the saturation resolved (confirmed)

The diagnosis pinned it: **the main cause of saturation is over-thinning decided positions — a data-distribution problem.** The symptomatic treatment (the hotfix) stopped the bleeding, so next is the cure. Right now **we're rebuilding the teacher data from scratch.**

**5 million positions.** Five times Cycle 2's 1M. We changed two things for generation.

- **balance-rate 0.3 → 0.5.** Raise the acceptance rate of decided positions. Cycle 2 thinned them to 30% (i.e., discarded 70%), and that's exactly what made the saturation region "learning-starved." This time we **loosen the discard from 70% to 50%** and keep more decided positions in the data. In the resident analogy: **we now make sure the resident also sees the critical patients.** The actual **measured distribution of the 5.24M positions we generated** came out like this — even (|cp|<300) **23.1%**, middlegame (300–1200) **27.2%**, lopsided (1200–3000) **43.2%**, extremely lopsided (>3000) **6.5%**. The share of decided positions (|cp|>1200) **recovered from Cycle 2's 36% to 49.7%.** The very region that was crushed by saturation now makes up nearly half of the training set. This is the primary fix.
- **Labeling depth 8 → 12.** Label each position (i.e., its correct eval value) by having YaneuraOu read deeper. A more accurate model answer.

**Why depth 12 — not 20 or 30?** Beginners always trip here, so, in three points.

1. **The cost grows exponentially.** Each extra ply of search inflates the amount read by roughly 2–3x (it's the multiplication of branches, so exponential). Going depth 8→12 alone makes labeling 15–20x slower. Depth 20 is hundreds of times; depth 30 would be **minutes per position to label** — weeks to months to process 5M. It doesn't fit a realistic wait.
2. **There's a ceiling on the precision the student can absorb.** This is the essential reason. The NNUE student's approximation error is currently about 450cp. Meanwhile the labeling difference between the teacher's depth 12 and depth 20 averages only 20–50cp. **The teacher's 20–50cp of precision is completely buried and lost inside the student's 450cp of error.** "Even if the teacher grades to the millimeter, the student can only copy to the centimeter" — millimeter precision never reaches the student. Pay the cost of reading deeper and the student's answers don't improve by a single point.
3. **Depth 12 is the standard "knee" (the cost-benefit bend) of shogi NNUE distillation.** Depth 8 is too shallow — in fact, one of Cycle 2's defeats was this shallowness — and depth 20–30 is for special uses (learning between top-level engines, etc.). For distillation at the 5M scale, around 12 is the sweetest spot where "deeper doesn't reach the student, shallower makes the teacher sloppy."

**Why not mix in the old 1M data?** You might think "1M positions we already built — why not just add them for 5.5M?" But **we don't mix them.** The old data was made with **depth-8 labeling + balance-rate 0.3** — that is, it's **the very culprit carrying the two problems we're now trying to fix (shallow labeling, and over-thinned decided positions = the cause of saturation).** Mix new data into it and the hard-won saturation fix (learning decided positions heavily) gets diluted by the old data's thinness. **Don't mix the cause of the disease into its cure.** The old 1M isn't used for training; it's kept as the "baseline to beat" — the weights currently running in production. The question for pass/fail: can the net made from the new 5M clearly beat this old baseline on the real-game blunder rate?

**Distributed generation across two Macs.** Generating 5M positions takes time, so we're running it in parallel across two Macs on hand. Position generation is **fully parallelizable** — labeling each position is independent, with no need to wait on another position's result (embarrassingly parallel, as it's called). The one thing to watch is RNG collisions: if both machines produce the same positions from the same random stream, that's duplicate generation. But since we seed the RNG with **`time ^ process ID`**, different machines and different processes don't collide on the seed, and the generated positions don't duplicate. We run an M4 Pro (14 cores) and a second machine (12 cores) in parallel, then concatenate both files at the end. As a small optimization, we launch slightly more processes than cores — **oversubscription** (run another process in the gaps of I/O waits so cores don't idle) — to pack the idle cores.

**Another approach we considered: a saturation guard (a code fix that needs no data).** At first we braced ourselves this way: **sigmoid saturation itself is a mathematical flattening, so it may not vanish completely even with more data.** Bringing decided positions back to 50% stops the region from being "unknown," but the sigmoid's property of going flat at ±2500cp still remains. So in parallel with the data rebuild (the primary path), we kept a code-only complement in reserve — **"in any position where the NNUE eval exceeds |cp|>1500, switch just that position to the V3 eval."** Let V3 take over only the region where saturation crushes the distinctions, and leave even positions to the NNUE. But the bottom line: **we didn't need the insurance.** Training on 5.24M positions alone resolved the saturation for all practical purposes (the 72nd-ply spread going 20cp → 532cp, below, is the undeniable proof). The mathematical flattening remains, yet **learning decided positions heavily from data restores enough distinguishing spread to tell moves apart even in that region** — confirmed by measurement. Filling the "unknown region" turned out to be more fundamental than dodging the saturation region in code.

#### The results — run5m-base, the anti-saturation net (5.24M positions, balance-rate 0.5, labeling depth 12)

We put the trained net through Cycle 3's new gates — a three-part exam: **holdout approximation accuracy**, the **real-game saturation gate (blunder rate)**, and an **A/B match**. Here are the results in order.

**(A) Holdout (holdout5m-4k, 4,000 positions held out from training).** Against the current production weights (run1m-base), **the new net won on every metric.** Most important, the **pair accuracy in the decided band (|cp|>1500)** — the fraction where it correctly orders two positions by advantage — improved **0.8840 → 0.9044.** Overall mean error (MAE) went **531.7 → 448.8cp**, and the **MAE in the 1000–3000cp band** where saturation bites hardest went **677 → 529cp**. The numbers say something simple — **"telling moves apart" in lopsided positions genuinely came back.**

**(B) The saturation gate (that 81-ply real game, cross-checked against YaneuraOu depth 18).** This is the primary test. On the game we made a permanent regression test, **the count of blunders (>300cp) was halved, 8 → 4.** And — **that 72nd ply (the heart of the author's "all 71 moves are tied" report) was fully resolved.** The spread of move values, crushed into a 15cp band by saturation, came back **20cp → 532cp (26x).** Where the current net had chosen the −35281cp blunder G\*8f (a gold drop into its own camp), **the new net now chooses the true best move, 6f6g+.** That is the moment the resident could finally gauge "how critical the critical patient is."

But let's be honest. **The 74th ply still has a blunder in the new net.** That's already a −30000cp resign-worthy position where any move loses, so getting one wrong doesn't change the outcome — it's only the difference between which way you lose in an already-lost position. What the saturation fix cleaned up was "decided positions where the game can still turn," not positions that are already completely over. But what matters over the board is the former, and that's fixed.

**(C) A/B match.** Playing the new run5m-base against the current NNUE (run1m-base) at production-equivalent settings, it won **92.2% (29.5/32).** Against the old V3 eval, it won **84.4% at 1000ms and 84.4% at 2000ms (hard-equivalent)** — **this time we cleared hard by measurement**, the previously-unverified time control that had triggered the saturation collapse in the first place.

**(D) base > rank, reconfirmed.** The Cycle 2 lesson that "base suits saturation-fixing better than rank" reproduced here too. Trained on the same 5.24M positions with a ranking loss, run5m-rank had good even-band MAE and good holdout decided-band pair accuracy. But **at the crucial 72nd ply in the real game it was still saturated** (spread just 90cp, and it chose the big blunder). Ranking loss, caring only that the order is right, has a side effect of crushing the absolute spread in the lopsided region — counterproductive for the purpose of fixing saturation. **To cure saturation, base — which learns a big gap as a big gap — is clearly superior.** Cycle 2's "base > rank" is confirmed once more, from a different angle.

### 11.5 Lessons of this chapter

- **The self-play trap comes back, over and over.** "A self-play win rate doesn't guarantee strength against humans," which we supposedly learned in Cycle 1, returned in exact form the moment success in Cycle 2 let our guard down. **The game a human actually played is the most valuable test case** — a lesson that thickens every time it hurts.
- **Judge by behavior (blunder rate, real moves), not a proxy metric (self-play win rate).** "How close to the teacher" doesn't guarantee "no follies in production." The final gate must always measure the behavior itself, not a stand-in.
- **Speed and strength are different axes.** SIMD and multithreading both reliably sped up the search, but if the eval scores the same position wrong in the same way, the move doesn't change. Speed may be necessary for strength, but it isn't sufficient.

### 11.6 What we learned by building it (from the field of distributed generation)

Running the 5M-position generation across two Macs surfaced a pile of field lessons that weren't visible on paper. They're **exactly the kind an ML beginner will hit doing this themselves**, so here they are with the numbers intact.

**Finding 1: at depth 12, the bottleneck "moved."** Producing one position has two stages: (a) creating the position via self-play (generation), and (b) scoring it with YaneuraOu (labeling). At Cycle 2's **depth 8**, generation was the bottleneck and labeling was instant — labeling was so shallow that the work was essentially "just waiting to create positions." But raising it to **depth 12** made labeling heavy, and **generation and labeling became roughly fifty-fifty** (about **27s / 28s** respectively). The lesson is simple — **read deeper and the labeling cost starts to bite.** Which stage is the bottleneck shifts with your settings, so when things slow down you have to re-measure "which one is heavy" every time.

**Finding 2: distributed duplication was auto-avoided by the seed.** Run the same code on two Macs and the naive worry is "won't both produce the same positions and double-generate?" No need to worry. Because the generator's **RNG seed is `time ^ process ID`**, different machines and different processes don't collide on the seed, and the generated positions don't duplicate. **No special coordination (e.g., assigning a range per machine) was needed at all.** This is the strength of position generation being an **embarrassingly parallel** problem — each position is independent, so you just run both machines at once and concatenate the files.

**Finding 3: the oversubscription trap.** "More processes = faster" is too naive and backfires. The second machine is a 12-core previous-generation Mac, and starting it with `--engines 8` (4 drivers × 8 engines = 32 engines) made **32 engines fight over 12 cores, and generation got 4x slower (117s).** Launch far more processes than cores and the OS thrashes them against each other, jamming the whole thing. Dropping to `--engines 2` cleared the jam. Observing further, **generation runs at 1 driver = 1 core, and there were 8 idle cores.** So we raised the drivers from **4 to 8** to fill the idle cores and lift total throughput. The lesson — **it is not "the more processes, the faster."** Look at the core count and each process's role (always-busy generation vs. bursty labeling), and allocate accordingly.

**Finding 4: right tool, CPU vs. GPU.** We leave the why to the prerequisites article, but one sentence. **Generation (search, scoring) runs on the CPU; training runs on the GPU (Mac's MPS).** In a phrase: search is "branchy, unpredictable" work that suits the CPU, while training is "run the same computation over a huge batch of data at once" work that suits the GPU. Even "heavy computation" wants different hardware depending on its shape.

**Finding 5: the accident where simultaneous writes corrupted a file.** This one's a failure log. We accidentally **launched the same generation command twice**, and two processes **appended to the same output file simultaneously.** The result: lines got interleaved and corrupted mid-line, to the point that **running `git grep` over the broken file returned `Binary file ... matches`** — the warning you get when invalid bytes make it un-text-like (this message comes not from git in general but from search commands like `git grep` or `grep`/`rg`, which emit it when they judge a file to be binary). **Concurrent appends to the same file will almost certainly corrupt it** (the two writes cross in the middle of a line). Luckily only a small amount was ruined, so we deleted it and redid it. The lesson — if you write in parallel, **have each process write its own file and concatenate at the end** (which is what Finding 2 does). Just never "let two writers write the same file at once."

**Finding 6: one GPU, 14 CPU cores — pipelining across different resources.** This one unpicks an assumption baked into the word "parallelize." Apple Silicon (M4 Pro) has **one GPU built into the chip.** Hearing "20 GPU cores" tricks you into imagining 20 GPUs, but it means **20 cores inside a single GPU** — the same structure as "14 CPU cores = one CPU" (`system_profiler SPDisplaysDataType` confirms it: only one Metal device shows up). So running two trainings (PyTorch/MPS) at once just makes them **fight over the one and only GPU** — no faster.

But there's a way around it. **An A/B match is CPU work** (14 cores reading positions), and **training is GPU work** — the two use **different resources**, so running them simultaneously doesn't cause contention. So instead of running NNUE verification as a naive serial chain (base training → rank training → eval → quantization → A/B match), we pipelined it. **Once run5m-base finishes training, we run its A/B match (about 2 hours on the CPU) while, in the background, the freed-up GPU runs the next rank training in parallel.** We filled the GPU's idle time with the CPU's games. That shrank the whole thing from **about 4 hours to about 3.**

The generalized lesson — **"parallelize" isn't only "line up many copies of the same work." Pipelining that overlaps work on different resources (CPU / GPU) is just as powerful.** Identify the bottleneck (the single GPU, the game time you can't shave), and behind it, feed different work to whatever other resource is idle. If Finding 3 is about "don't make the same resource fight over itself," Finding 6 is about "don't let a different resource sit idle" — two sides of the same coin.

**Meta-lesson (reconfirmed).** All of these reconfirm the Cycle 1 and 2 lesson that "convenient shortcuts (automation, parallelization) have their own field-specific pitfalls." Same root as self-play's 77.1% failing against a human. **Don't swallow the on-paper "parallelize and it's faster"; measure the generation rate and core usage with `ps` and `wc`, and let those numbers decide the allocation** — that becomes the basic move.

### 11.7 Shipping it — going pure-NNUE (PR #316, merged and deployed)

Having cleared all three gates, we shipped run5m-base to production. The work itself is a rerun of the discipline established in Chapters 6 and 7.

- **Swapping the weights.** We replaced the production weights `public/shogi-nnue-weights.bin` with run5m-base. As with the port, **we lock it down with parity** — verifying that torch (the trained original), the TypeScript implementation, and the WASM implementation agree **bit-for-bit (200/200)** across all post-quantization parameters. The quantization scale K=600 is unchanged. Before shipping, we mechanically guarantee that "the weights we trained" and "the weights running in the browser" don't differ by a single bit.
- **Re-enabling the NNUE on hard/expert/master.** We **lifted** the "medium only" hotfix (PR #310) we'd applied during the saturation collapse. `NNUE_DIFFICULTIES` went back from just `medium` to `medium..master`, so pure NNUE runs on hard and up. Only easy still uses V3, for lightness.
- **= We effectively replaced V3 (pure-NNUE).** This had been the author's request from the start. The V3 eval, handwritten over seven months, now retreats from the board with only one role left — **"a safety net for when loading the NNUE weights fails."** With that last defect, saturation, removed, Cycle 2's goal of "unifying every difficulty onto the NNUE" is finally complete.

One extrapolation worth stating honestly. **We did not measure expert (4000ms) and master (5000ms) by direct A/B.** What we measured goes up to hard-equivalent 2000ms. We re-enabled them anyway because a trend was observed consistently across Cycles 2–3: **the deeper the search, the wider the NNUE's advantage** (e.g., the win rate vs. V3 held up better at the deeper 2000ms than at the shallow 1000ms). We extrapolated from that trend that the advantage holds at longer time controls — but **this is an extrapolation, not a measurement**, and we say so plainly. When we next get real game records at the longer controls, we'll confirm it there.

### 11.8 Cycle 3 complete — the day the author admitted it "got stronger"

This is the true goal of this chapter — and probably of this whole article.

After the new NNUE went live on production hard, **the person writing this article (2-dan) played hard again for real.** In Cycle 2 he lost to this very same human despite posting a fine 77.1% self-play number. So this time, braced for it, he sat down at the board.

The result — **the author admitted it "definitely got stronger."**

Concretely, what changed. The "**nonsense moves**" that had been the problem in the earlier losing game — meaningless pawn drops into one's own camp unrelated to any mate, a king marching itself into mate — were **gone.** Instead the AI now plays **bishop drops with a purpose, and precise attacks using the rook and dragon**, as a coherent attacking game. With that saturated eval, where all 71 moves collapsed to the same score at a decided position, this could never happen. **Because the eval can tell moves apart, the AI can now trade blows.**

**This was the real goal.** In hindsight, the Cycle 2 reckoning had set up this moment. When we won 77.1% against V3 in self-play yet lost to the human 2-dan, we questioned the verification standard itself. And we **reset the acceptance gate to "not a proxy metric (self-play win rate), but the blunder rate on the author's real game records."** We made that 81-ply record a permanent regression test, checked it move by move against YaneuraOu depth 18, and measured directly whether the blunders dropped. That policy — that plain, indirect-looking swap of criteria — **was fully vindicated in this moment.** However good the proxy metric looks, if a human feels it's "weak," it's weak. Conversely, **the moment a human admits it's "strong" is the real victory.**

We can now invert a sentence we wrote during the saturation collapse. Back then: "at the decided positions where the AI's eval was crushed by saturation, every move looked the same." **Now, at those same decided positions, it tells the moves apart and trades blows.**

**The remaining homework, honestly.** The eval (NNUE) can trade blows now. But the other symptom found in the diagnosis (11.3) — the **collapse of search speed in the endgame** (with more pieces in hand, a node drops to 27–41µs and reached depth falls to 4–6 plies) — **is still there.** That's a separate, search-side problem unrelated to the eval. We're now working in parallel on **speeding up the search and strengthening the mate solver** (to be appended in a separate chapter / PR). The goal hasn't changed — **3-dan level on hard.** We'll push it there on "both wheels, eval and search." **The eval wheel has started to turn. Search is next.**

### 11.9 Trying to search deeper — a check extension (it lost, so it's on hold)

The first attempt at the "next is search" I promised in 11.8. Back to the homework I shelved in 11.3(4): **in the endgame the search goes shallow, can't read the mate through, and picks the "nonsensical move that walks straight into checkmate."** This is a separate defect from the evaluation saturation (11.3(2)) — it's a flaw in the search itself. Let me unwrap it step by step, for beginners too.

**What is "search," anyway?** To pick one move from the current position, a shogi AI **reads ahead** in its head. "If I play A, my opponent answers with B or C. If B, I play D…" — this branching of "move → reply → move…" spread out like a tree is the **game tree**. How many levels deep you spread the tree is the **depth**. Depth 8 means "read 8 plies ahead." The deeper you read, the sooner you spot mates and traps.

But the tree explodes. From one position there are ~80 legal moves on average in shogi. Read them all naively and you get 80 at depth 1, 80×80 = 6,400 at depth 2, about 1.6 quadrillion at depth 8 — hopeless. So you use the standard trick of **alpha-beta pruning**: once you know "this move is clearly worse than one I've already found," you stop reading that branch (prune it). A shogi AI's search is this loop of "read the promising moves first, prune the dead branches early." On top of that you add **iterative deepening** — instead of aiming straight for depth 12, deepen 1 → 2 → 3… and take the deepest result you had when time ran out. The "good move ordering" from the shallow reads helps the deep read prune, so it's actually faster than reading deep from the start.

**Why did depth collapse in the endgame?** This is the crux. Depth is roughly "time ÷ cost per node." Time is fixed (2s on hard), so **if a node gets heavier, you can read fewer nodes and depth drops.** And in the endgame this per-node cost had ballooned. The diagnosis found that the **~4µs/node of the opening and midgame exploded to 27–41µs/node in the endgame** — about 7–10×. Depth collapsed from the 11–12 plies of the opening/midgame to **4–6 plies** in the endgame.

What was making nodes heavy? **I measured the breakdown with a micro-benchmark** (`wasm-spike/endgame-profile.ts`, `endgame-gen-breakdown.ts`). Building endgame positions with 22–23 pieces in hand and splitting a node's work into "move generation," "legality check," and "evaluation," the timings came out like this:

| Component | ns/node | Share |
| --- | --- | --- |
| Move generation | ~351 | **50%** |
| Legality check | ~348 | **49%** |
| Evaluation (V3) | ~9 | **1%** |

**The main culprit was the sheer volume of drop moves.** Shogi has a rule found nowhere else in chess: a captured piece can be dropped back onto any empty square. When you hold many pieces, these "drop" moves explode. In the measurement, in positions with 22–23 pieces in hand, **88–93% of all generated moves were drops** — against 20–28 board moves, there were 168–336 drops. Generation costs a flat ~1 ns per move, so the move count simply swelling ~10× translates directly into ~10× the cost. The suspect I'd flagged — the pawn-drop-mate check (dropping a pawn to deliver mate is illegal) — is caught first by a cheap geometric filter that only fires when a pawn lands directly in front of the king, so it's essentially innocent. Evaluation, at 1%, is innocent too. **The "endgame node explosion" was, in full, the quantitative explosion of drop moves from a large hand.**

**So why does shallow reading miss the mate?** A mate is "a sequence that catches the enemy king no matter how it runs." To confirm a 7-ply mate, you must read the game tree fully 7 levels deep. If you can only read 4–6 plies, a mate 7 plies out is **outside the tree**, invisible. The same goes for the opponent's mate against you: if you can't see your own king mated 7 plies out, you'll walk into it cheerfully. The move 72 "nonsense move" was exactly this — on top of **the evaluation being saturated so moves can't be told apart** (11.3), **the search being too shallow to even have the mating line in the tree**: a double blindness.

**What I did: a "check extension" to read mating lines.** The quantitative explosion of moves can't be driven to zero — it's a rule of shogi (you can't just not generate the legal drops). So I changed the target. **Rather than "read every move uniformly deeper," extend just the forced sequences of checks — which lead directly to mate — by one ply.**

An extension is a mechanism that says, mid-search, "this move matters, so grant it one extra ply of depth budget." A **check** — a move that attacks the enemy king directly — forces the opponent's reply almost entirely (run the king, or block the check, and nothing else), so the tree barely branches. That means it's **cheap yet leads straight to mate.** Extend it by one ply, and even a depth-6 search reads effectively 7 plies deep along the checking line. The 7-ply mate enters the tree.

In the code, the existing engine had a setting that meant **"check extension is active only at the root," i.e. effectively off** (`CHECK_EXTENSION_MAX_PLY = 0`). Checks deeper in the tree got no extension at all — extension wasn't working precisely where the mating lines live. I **enabled it with a budget on "how many extensions a single reading line may spend."** The budget matters because extending checks unconditionally lets pointless checks (spite checks) or perpetual-check loops blow the tree up without bound.

**The budget landed at 1 — and I decided that by measurement.** I first got greedy and set the budget to 16 ("so it can read a 9-ply mate = 5 checks"). That was **a disaster**: in check-heavy endgames a single line got extended 16 plies, the tree exploded, and the fixed-depth verification harness didn't finish after minutes (it normally takes under a minute). Dropping to 3 contained it, but the reached depth in endgame positions at a fixed 300ms **halved, from an average of 3.0 to 1.4 plies** — the extension was so heavy that iterative deepening couldn't advance. Tightening further to 1 kept depth essentially flat (3.0 → 2.6) while still leaving cases where the chosen move changed in decided positions (i.e. it started actually reading the mating line). **"Per reading line, extend only the check closest to the horizon, by exactly one ply"** was the sweet spot of cost versus effect. Get greedy and the whole search goes *shallower*. With search extensions, less is more.

**Bit-identity was preserved (but this is a behavior-changing edit).** Unlike a speed optimization, a check extension **changes which moves get searched** — it's an intentional strengthening, so bit-identity with the old engine breaks. But a discipline of this project is that **the production WASM engine and the JS engine must pick the same move down to the bit** (the "byte-identity" verification gate established in Chapter 6). So I implemented the check extension **in both engines with exactly the same logic.** The verification harness (`wasm-spike/search-driver.ts`) confirmed that across all 48 positions, **JS and WASM agree on the same move, the same score, down to the visited node count (48/48 EXACT).** Move-generation parity (4,184 positions, 100% match) and NNUE-inference bit-identity also all pass after the rebuild. **"Making it smarter" and "keeping the port identical" can coexist** — as long as you put the change into both engines in the same shape.

**Move 72 was fixed — but for a different reason.** The good news first. That move-72 blunder that saturation caused — run1m-base walking its own king into mate with ☖1一玉 — when replayed through the current (post-fix) engine, the engine picks **☖6二金 instead of ☖1一玉** (confirmed by the regression probe `scripts/shogi-kifu-regression-probe.ts`). It no longer walks into the mate. Honestly, though, that is mostly the payoff of the **saturation fix from §11.3–11.4 (rebuilding the training data)**, not of this section's check extension alone. Even in the move-72 position the reached depth is still a shallow 3 plies; what changed is that the evaluation can now tell the moves apart, so it avoids the blunder.

**And the check extension itself did not win the A/B.** This is the result I have to report straight. I ran the improved engine (budget 1) against the current one (no extension) at the production hard budget, 24 games (colors swapped, same openings):

> **improved 10 wins / current 13 wins / 1 draw (improved win-rate among decisive: 43.5%)**

**Not a win — a slight loss.** The reason is exactly what the micro-bench foreshadowed: the check extension reads the checking line one ply deeper *at the cost of* the reached depth of iterative deepening within a fixed time (3.0 → 2.6 plies in endgame positions). That **loss of depth outweighed the gain** of reading the mating line one ply deeper. Even the minimal budget-1 extension didn't pay off in real hard-time games.

So — **I did not merge this change; I put it on hold (as a draft PR).** If a depth-shaving edit is neutral-to-worse in real games, the safe move is not to ship it. This is a replay of Cycle 2's KP feature (§11.2): **"looks principled, but if it can't win on measurement, don't adopt it."** The hypothesis (read mating lines deeper and you get stronger) is sound, but the *means* (a uniform check extension) cost more than it returned for this evaluation at this time budget.

**Lessons of this section.** (1) **Don't guess; measure the breakdown.** Pinning the culprit of "the endgame is slow" — not pawn-drop-mate, not evaluation, but the quantitative explosion of drop moves — **with numbers** was real progress. A correct diagnosis does not guarantee the countermeasure lands. (2) **Extensions work best in small doses — and it still wasn't enough.** The tighter the budget (16 → 3 → 1), the better the reached depth held up, yet even budget 1 lost the A/B. "Shaving depth" costs more than it looks. (3) **The next move is a strengthening that does NOT shave depth.** The check extension lost precisely because it sacrificed depth, so the next direction is to make the endgame node *cheaper* (pruning/deferring drop generation, expanding the mate solver's budget) — reading mates without giving up depth, while keeping bit-identity. The profile already names the culprit (the drop explosion), so I can hit it directly. **This section will be updated when that next move actually wins on measurement.**


---

## 10. Lessons: what worked and what didn't

1. **Before assuming "the search is weak", check whether it searched at all.** Thinking-time logs are the strongest diagnostic
2. **Self-play cannot detect bugs both sides share.** Real human games are the most valuable test cases
3. **Most plausible improvements die under measurement.** Build the rejection mechanism (frozen-baseline direct matches) before building improvements
4. **The verification setup itself can be the bug** (opening degeneration, time-scale bias, default mismatches). Verify the verifier
5. **Boundary bugs come in symmetric pairs** (invisible promoted pieces / the silver's intrusion ranks / the unscanned 1st–2nd ranks)
6. **Structural changes are what reliably work**: constant-factor speed (WASM ×15) and knowledge quality (distillation). The sum of clever tweaks measured neutral at production time
7. **Large eval terms are poison**: ±1000 went 2W–7L; ±350 recovered; the threat term only worked narrowed to "undefended-only, 1/3 value"
8. **Distrust proxy metrics.** "2x closer to the teacher" passed the quality gate — and then lost the actual games 19.6% to 80.4%. Search doesn't need absolute accuracy; it needs correct sibling rankings. **The final gate must always be: play the games**
9. **Zero budget is enough.** An open-source engine + a public eval + a local GPU builds a distillation pipeline in hours
10. **Even well-reasoned mechanistic hypotheses die in A/B tests.** "Miscalibrated search margins are the culprit" made perfect sense — and the isolated test went 19.6% → 8.9%, worse. Isolating one variable at a time is tedious, and it pays
11. **The opponent's time is free compute.** Pondering is a structural improvement orthogonal to eval quality (+0.35 mean depth, up to +2 plies in the opening) and shipped with zero UI API changes
12. **Speed and strength are different axes.** Cycle 3's SIMD (6.2x eval) and multithreading (3.0x nodes) both reliably sped up the search, but if the eval scores the same position wrong in the same way, not a single move changes. Speed is necessary for strength, not sufficient
13. **The self-play trap comes back, over and over.** "A self-play win rate doesn't guarantee strength against humans," learned in Cycle 1, returned in Cycle 3 as a real over-the-board loss on production hard. **The game a human actually played is the most valuable test case** — and the final gate should be behavior (blunder rate), not a proxy metric (approximation accuracy, self-play win rate)
14. **Convenient shortcuts have field pitfalls too — measure, then allocate.** In distributed generation we hit trap after trap invisible on paper: oversubscription (32 engines ran 4x slower), corruption from concurrent appends to one file, the bottleneck moving at depth 12. **Don't swallow "parallelize and it's faster"; measure the generation rate and core usage with `ps` and `wc`, and let those numbers decide the allocation.** Shortcuts like automation and parallelization, just like self-play, hide field-specific pitfalls behind their convenience
15. **The final gate is the author over the board.** However good the proxy metrics (holdout accuracy, self-play win rate), **if a human actually plays it and feels it's "weak," it's weak** — that's exactly what Cycle 2's 77.1% was. Conversely, when we cured the saturation with 5.24M positions and the author himself admitted over the board that it "definitely got stronger," **that was the real victory.** A proxy metric is an instrument for driving development, not the judge of pass/fail. The judge is always the human who actually sits at the board

This project began with its 2-dan owner calling the AI "way too weak." Across PRs #287–#305 it settled Cycle 2, and in Cycle 3 (PRs #309–#316) it **cured the eval's saturation at the root.** The instant-answer book bug excised, all difficulties unified onto one brain, a 15x WASM port, thinking on the opponent's time, the opening book audited by a superhuman engine — **a neural network distilled overnight from a million positions replacing, at 77.1%, an evaluation function that took seven months to handwrite** — and then, in Cycle 3, from the point where that NNUE collapsed against a human on production hard, we **cured the saturation with 5.24M positions and rebuilt it until it can tell moves apart and trade blows even in decided positions.** We effectively replaced V3 on hard, going pure-NNUE — and at last, **the author himself admitted over the board that it "definitely got stronger."** That is the AI running on meetyudai.com right now. The remaining milestone hasn't changed either. The eval can trade blows now; next is curing the endgame search collapse and pushing it to **3-dan level on hard.** On "both wheels, eval and search," there's still road ahead.

---

## Appendix: the key code (excerpts)

The repository is private, so here are the load-bearing pieces inline (simplified for exposition).

### A. The thinking-time probe — the tool that found the instant-move bug

When a suspicious move shows up in a real game, replay the game into the production AI entry point. The crucial detail: always print the thinking time.

```ts
function askAI(label: string): void {
  const t0 = Date.now();
  const move = getBestMove(k, GOTE, 'hard', moveNumber, history); // same path as production
  const ms = Date.now() - t0;
  console.log(`${label}: AI(hard) -> ${fmt(move)} (${ms}ms)`); // ← this line is the point
}
// Output that broke the case open:
//   move 10: AI(hard) plays 82->42 (23ms)   ← "hard" has a 2-second budget. It never searched!
//   move 12: AI(hard) plays 93->94 (1ms)
```

### B. Scripted attack plans — encoding a human plan as data

A "skip-forward" matcher lets one flat list express a branching human plan: play each step if it's legal right now, otherwise fall through to the next.

```ts
const BOGIN_PLAN: Step[] = [
  { fs: 2, fd: 7, ts: 2, td: 6 }, // P-2f
  { fs: 2, fd: 6, ts: 2, td: 5 }, // P-2e
  { fs: 3, fd: 9, ts: 3, td: 8 }, // S-3h
  { fs: 3, fd: 8, ts: 2, td: 7 }, // S-2g
  { fs: 2, fd: 7, ts: 2, td: 6 }, // S-2f
  { fs: 2, fd: 6, ts: 1, td: 5 }, // S-1e (skipped automatically if P-1d denies it)
  { fs: 2, fd: 5, ts: 2, td: 4 }, // P-2d break
];
while (planIndex < plan.length && !move) {
  const s = plan[planIndex++];
  move = legal.find((m) => matches(m, s)) ?? null; // illegal → skip to next step
}
if (!move) move = getBestMove(k, SENTE, difficulty, n, hist); // plan done → engine takes over
```

### C. The gauntlet's automatic flags — inspect every AI reply

```ts
const problems: string[] = [];
// Answered in <200ms past the book window (12 plies) → suspected search bypass
if (ms < 200 && moveNumber > 12) problems.push(`INSTANT(${ms}ms)`);
// Right after the AI's move, one of its silver-or-better pieces hangs (SEE-lite) → suspected blunder
if (hang.value >= 900) problems.push(`HANGS(${hang.square}:${hang.value})`);
// Eval swung 800+ toward the human → suspected mistake
if (after - before > 800) problems.push(`EVAL(+${after - before})`);
```

These are *suspicions*, not verdicts (exchange sequences false-positive) — the design assumes a human reviews the flags.

### D. Lazy legality — the single idea that made search several times faster

Stop king-safety-checking all ~80 generated moves; check only when a move is actually made. Under alpha-beta most nodes cut off after 1–3 moves, so this eliminates most checks.

```ts
const moves = generatePseudoLegalMovesPooled(k, pool[ply]); // king-safety NOT yet verified
for (const te of moves) {
  k.move(te);
  if (isKingInCheck(k, k.teban)) { k.back(te); continue; } // ← lazy check
  legalTried++;
  k.toggleTeban();
  const score = -search(k, depth - 1, -beta, -alpha, ply + 1);
  k.toggleTeban();
  k.back(te);
  // ... alpha-beta bookkeeping ...
}
// Mate detection: no legal move was playable AND nothing was pruned away
if (legalTried === 0 && !prunedAny) return inCheck ? -MATE + ply : 0;
```

### E. Quiescence partial sort — don't sort what you'll never search

```ts
// Non-check quiescence only ever searches captures/promotions.
// Swap the noisy moves to the front and insertion-sort just that prefix.
let noisyCount = 0;
for (let i = 0; i < moves.length; i++) {
  const m = moves[i];
  if (m.capture !== EMPTY || m.promote) {
    [moves[i], moves[noisyCount]] = [moves[noisyCount], m];
    noisyCount++;
  }
}
insertionSortByScore(moves, 0, noisyCount); // typically a handful of moves
```

### F. The self-play A/B harness — "does the new one win on less time?"

The pre-change engine is registered as a frozen snapshot (`v20base`) and each side can get its own budget.

```bash
# New engine (200ms) vs frozen baseline (160ms) — reproducing the production time ratio
npm run shogi:match -- --engineA v20 --engineB v20base \
  --evalA v3 --evalB v3 --difficulty medium \
  --games 16 --maxTimeMsA 200 --maxTimeMsB 160 \
  --openingPlies 6 --openingMode curated --seed 61
# Lessons baked in: openingPlies >= 6 (2 plies degenerates the sample);
# final verdicts need 30+ games at production budgets
```

### G. USI labeling — running eight YaneuraOu processes as teachers

```ts
// Per process: plain-text stdin/stdout dialogue (the USI protocol)
send('position sfen ' + sfen);
send('go depth 8');
// harvest "info ... score cp -2161 ...", finalize on "bestmove"
const cp = lastInfo.match(/ score cp (-?\d+)/)?.[1];

// Pool parallelism: 8 engines race through a shared pending array
await Promise.all(engines.map(async (engine) => {
  for (;;) {
    const i = cursor++;
    if (i >= pending.length) return;
    const res = await engine.evaluate(pending[i].sfen, depth);
    if (!res || res.bestmove === 'resign' || res.bestmove === 'win') continue;
    lines.push(JSON.stringify({ sfen: pending[i].sfen, cp: res.cp /* ... */ }));
  }
}));
// Measured: ~1,400 positions/second of labeling; append-only JSONL, resumable
```

### H. Lazy accumulator diffs — turning a 14x perft slowdown into ±0%

```ts
// ✗ First attempt: update the accumulator on every makeMove
//   (search makes and immediately discards mountains of moves → perft +1348%)
// ✓ Adopted: makeMove just pushes a diff; diffs fold in only when an eval actually happens.
function makeMove(te: Move): void {
  applyBoard(te);                    // board updates immediately (nanoseconds)
  nnuePending.push(encodeDiff(te));  // accumulator untouched
}
function nnueEvaluate(): i32 {
  while (nnuePending.length > 0) foldDiffIntoAccumulators(nnuePending.shift());
  const acc = sideToMove === SENTE ? accSente : accGote; // both perspectives maintained
  return forwardFromAccumulator(acc); // clamp → layers 2+
}
function unmakeMove(te: Move): void {
  if (wasApplied(te)) unfoldDiff(te); // reverse only diffs that were folded in
  else nnuePending.pop();             // otherwise just cancel the pending diff
  revertBoard(te);
}
// Result: 6.2µs → 1.15µs per eval; depth 9–15 retained with NNUE enabled
```

### I. Parity testing — the only weapon that matters in a port

```ts
// 50 random self-play games × up to 80 plies = 4,184 positions, JS vs WASM checked every ply
for (const pos of randomGamePositions) {
  assert(jsLegalMoveCount(pos) === wasmLegalMoveCount(pos)); // legal move counts
  assert(jsHash(pos) === wasmHash(pos));                     // Zobrist bit-identity
  assert(jsEval(pos) === wasmEval(pos));                     // integer-exact evaluation
}
// Search: fixed-depth runs must match best move, score, AND node counts (48/48 positions).
// Allow "close enough" and bugs slip the net. Demand bit-identity and they all get caught.
```

---

*These excerpts reproduce every experiment in this article. The entire pipeline — teacher generation, training, quantization, WASM inference — runs on free, open-source software.*
