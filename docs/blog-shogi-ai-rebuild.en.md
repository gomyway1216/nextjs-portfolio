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

**(2) More and better teacher data.** 1M positions → 5–10M. Cycle 2 already made generation 14x faster, so this is a matter of wall-clock waiting, not heroics. At the same time, deepen the teacher's search from depth 8 to 12+ — more accurate model answers from a deeper-reading YaneuraOu. As the run100k → run1m lineage showed (19.6% → 77.1%), this axis hasn't bent yet.

**(3) WASM SIMD128.** The net's inner loop is almost entirely multiply-accumulate, so computing 4–8 elements per instruction with SIMD128 makes inference 2–4x faster. And as Cycle 2 kept demonstrating: with the same eval, more search nodes compound the ranking accuracy.

**(4) Multithreaded search.** Parallelize the search with SharedArrayBuffer. It requires COOP/COEP headers on Vercel, but once through, four cores read simply four times the nodes.

**(5) The self-play loop.** Today's teacher positions come from the *old* engine's self-play. Have the NNUE version of ourselves generate them and retrain — a positive loop where every gain in strength produces better-distributed training data.

Where's the theoretical ceiling? The browser as hardware can run professional-grade shogi AI — other sites have already proven that (lishogi, among others, runs the WASM build of YaneuraOu). So the limit isn't the browser; it's this engine's maturity. But this project **will not take the drop-in-someone-else's-engine route**. Growing a homegrown engine by measurement is the point of the project, and it's the owner's explicit policy.

Cycle 3 is underway, following exactly this blueprint.

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

This project began with its 2-dan owner calling the AI "way too weak," and reached its verdict across PRs #287–#305: the instant-answer book bug excised, all difficulties unified onto one brain, a 15x WASM port, thinking on the opponent's time, the opening book audited by a superhuman engine — and finally, **a neural network distilled overnight from a million positions replacing, at 77.1%, an evaluation function that took seven months to handwrite**. That is the AI running on meetyudai.com right now. The remaining milestone hasn't changed: **beat the owner.**

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
