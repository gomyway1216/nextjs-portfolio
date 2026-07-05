# My Blog's Shogi AI Was Embarrassingly Weak, So I Had a Fleet of AI Agents Rebuild It in a Day — From Bug Hunts to WASM and NNUE Distillation

> The homemade shogi AI on my personal site (meetyudai.com) was, in the words of its owner (an amateur 2-dan shogi player), "way too weak." This is the record of running up to five Claude Code subagents in parallel to see how strong it could get in a single day: the diagnostic logs, a catalog of failed ideas, the things that actually worked, and all the real measurements. Total cost: roughly zero (electricity and LLM usage).

---

## TL;DR

- The biggest reason the AI "ignored attacks and played nonsense" was **not the search engine — it was an opening-book fallback that bypassed search entirely and answered in 1–23ms**. Thinking-time logs were the smoking gun
- Small improvements to the handwritten engine (search tricks, eval tuning) **mostly measured as "no effect" at production time controls**. Roughly 70–90% of plausible-sounding ideas died in A/B testing
- What actually worked was structural: **porting TypeScript → WebAssembly made the search ~15x faster, +3–4 plies deeper, and the new engine beat the old one 10–0**
- On top of that we built **NNUE distillation**: had YaneuraOu (a superhuman open-source engine) label 100,000 positions, then distilled that knowledge into a 1.13MB neural net that approximates the teacher **2.0–2.5x better than the handwritten eval**
- The verification methodology itself is full of traps: **self-play statistical degeneration, time-control bias, and mismatched defaults** nearly led us to wrong conclusions several times

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

Handwritten evals historically plateau around amateur dan level. Going beyond requires a learned evaluation function. Common misconceptions vs reality:

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

### The final A/B: NNUE **failed** — and taught the biggest lesson

The equal-time self-play with real weights (both sides WASM, eval function the only difference, 28 games) came back **19.6% score for NNUE — a rout**. Inference was verified bit-identical across torch/TS/WASM on 300 positions, and speed was fine (equal node counts at equal time; the lazy accumulator worked perfectly). **The implementation was correct. The model itself lost.**

The diagnosis is the interesting part. **"Closeness to the teacher" (2.0–2.5x better than the handwritten eval) turned out to be a poor predictor of playing strength.** What alpha-beta search needs is the *relative ranking of sibling positions* — and the net's ~405cp error is larger than the typical eval difference between candidate moves (<100cp), so it scrambles rankings. The handwritten eval, meanwhile, is self-consistent even where its absolute scale is off, and a monotone scale error is harmless to alpha-beta. On top of that, the search's margin constants (aspiration/futility/delta) were calibrated to the handwritten eval's scale, making them effectively ~3.7x too generous for a net that outputs true centipawns.

The next moves are documented in the repo: scale the teacher data 100k → 1M (generation is free), raise teacher depth, scale-adapt the search margins, and consider a ranking-oriented loss. **The NNUE infrastructure (inference, accumulator, A/B harness) is preserved in the repo, disabled by default**, ready for the rematch.

---

## 9. Lessons: what worked and what didn't

1. **Before assuming "the search is weak", check whether it searched at all.** Thinking-time logs are the strongest diagnostic
2. **Self-play cannot detect bugs both sides share.** Real human games are the most valuable test cases
3. **Most plausible improvements die under measurement.** Build the rejection mechanism (frozen-baseline direct matches) before building improvements
4. **The verification setup itself can be the bug** (opening degeneration, time-scale bias, default mismatches). Verify the verifier
5. **Boundary bugs come in symmetric pairs** (invisible promoted pieces / the silver's intrusion ranks / the unscanned 1st–2nd ranks)
6. **Structural changes are what reliably work**: constant-factor speed (WASM ×15) and knowledge quality (distillation). The sum of clever tweaks measured neutral at production time
7. **Large eval terms are poison**: ±1000 went 2W–7L; ±350 recovered; the threat term only worked narrowed to "undefended-only, 1/3 value"
8. **Distrust proxy metrics.** "2x closer to the teacher" passed the quality gate — and then lost the actual games 19.6% to 80.4%. Search doesn't need absolute accuracy; it needs correct sibling rankings. **The final gate must always be: play the games**
9. **Zero budget is enough.** An open-source engine + a public eval + a local GPU builds a distillation pipeline in hours

This project began with its 2-dan owner calling the AI "way too weak." The next milestone is unambiguous: **beat the owner.**

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
