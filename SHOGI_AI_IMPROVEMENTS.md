# Shogi AI Improvements (Strength + Speed)

This repository contains two shogi implementations:

- `src/components/game/Shogi/*` (UI-friendly, original engine + opening book)
- `src/components/game/ShogiImproved/*` (fast engine: make/unmake + TT)

The main `/games/shogi` page now uses the opening book early and then delegates search to the fast engine for much better performance and strength.

---

## 1) What Changed (High Level)

### `/games/shogi` now uses a fast engine for search

Call flow:

1. `src/components/game/Shogi/Shogi.tsx` calls `getBestMove()`
2. `src/components/game/Shogi/ShogiAI.ts`:
   - uses opening book for the first 12 plies (`getOpeningMoveComprehensive()`)
   - converts `Kyokumen` → `KyokumenImproved`
   - searches via `src/components/game/ShogiImproved/ShogiAIImprovedV20.ts` (default)
   - converts the chosen move back to UI `Te`

This keeps the existing UI logic (and opening book) intact, but replaces the slow clone-heavy search with a much faster make/unmake engine.

### `/games/shogi-improved` now uses a small built-in opening book

`src/components/game/ShogiImproved/OpeningBookImproved.ts` provides a small curated set of opening lines (戦法/定跡).

The AI now tries a safe book move before searching:
- UI: `src/components/game/ShogiImproved/ShogiImproved.tsx`
- Worker (Lv4/Lv5): `src/components/game/ShogiImproved/shogi-ai.worker.ts`

The book is guarded by:
- an opening-phase proxy (`hand` totals small)
- a “do not use book while in check” rule
- a simple 1-ply static-eval threshold vs the best legal move (difficulty-dependent)

V14 updates:
- Expanded the curated book with more “shape” lines and better balance of 居飛車/振り飛車.
- Made book validation faster/cheaper by using `KyokumenImproved.evaluateForOpeningBook()` (omits expensive activity scans).
- Reduced per-call allocations in the book (pooled move generation + small caches).

V15 updates:
- New “fast + strong” engine that combines V11’s speed with V12’s “under pressure” opening-order gating.
- Uses `OpeningBookImproved` first inside the engine (book move → search fallback).

V16 updates:
- Improves drop move ordering (attack/defense proximity + anti-random far drops) to reduce ineffective drops.
- Adds small repetition contempt + conservative quiescence delta pruning on Level 4/5 for better practical results.

OpeningBookImproved updates:
- Adds a lightweight “resync” fallback move when the current position is not in the curated book (keeps openings coherent after deviations).
- Adds more curated branching lines (e.g. 相振り飛車 / 右四間飛車).

V17 updates (experimental):
- Adds lightweight SEE-ish ordering with a per-node cached attack scan to reduce obviously hanging drops/captures.
- Enables bounded check extensions + limited quiet-check probing in quiescence for Expert/Master.

V18 updates (experimental, conservative):
- Keeps V16 search behavior but adds a per-node cached attack scan and a cheap “hanging drop” ordering at all plies (high-value drops only).

Anti climbing-silver (対棒銀) updates:
- Reproduced the "primitive 棒銀 always beats the AI" complaint with `scripts/shogi-bogin-repro.ts`
  (scripted ▲2六歩→2五歩→3八銀→2七銀→2六銀→1五銀/2四歩 attack vs the real `/games/shogi` AI path).
- Eval (`KyokumenImproved`):
  - New `evaluateClimbingSilverPressure()` term (v2/v3): models silver-march + rook pressure on the
    rook file and rewards the joseki defense shapes (角3三 covering 2四, 銀2二/金3二 backing up 2三,
    歩1四 denying ▲1五銀). Mirrored for both sides.
  - `evaluatePromotionThreats()` now counts promoted majors (竜/馬) inside the enemy camp — previously
    they were invisible to this term because promoted piece codes no longer match HI/KA. Kept modest
    (±350) after self-play showed ±1000 distorts play.
- Opening books:
  - `OpeningBookComprehensive`: fixed corrupted entries (e.g. an illegal 8二→3七 "８五歩", the broken
    相掛かり/横歩取り/風車/角交換振り飛車 lines) and added two 対原始棒銀 gote lines (△3三角型).
  - `OpeningBookImproved`: added the same 対原始棒銀 (３三角型) line.
  - The "skip book when |eval| > 200" gate was raised to 900 — ±200 is smaller than normal opening
    eval noise, so the gate was silently disabling the defensive book exactly when it was needed.
  - Book safety validators (`OpeningBookValidated` / `OpeningBookImproved`): 1-ply static scores now
    apply a SEE-lite hanging-piece correction, so a fake "great" capture that hangs the capturing
    piece no longer inflates the baseline and rejects every quiet book move.
- Result: at medium, both scripted 棒銀 plans now lose a silver to the AI's defense
  (△1四歩→歩で銀取り / 数の受け) and the AI goes on to win.

V20 updates (current default — unified brain):
- ONE unified search configuration for every difficulty: all techniques (LMR, null-move, futility,
  reverse-futility, LMP, aspiration, delta pruning, SEE-lite, check extensions, quiescence checks,
  countermoves, IID) are always on; difficulty ONLY changes the time budget.
  easy 250ms / medium 1s / hard 2s / expert 4s / master 5s (master was 10s, expert 5s).
- Major speed work (~3-5x more effective search at the same budget):
  - Pseudo-legal move generation + lazy legality at make time (`generatePseudoLegalMovesPooled`):
    king-safety is tested only for moves actually searched, not for all ~80 generated moves per node.
  - Quiescence no longer scores/sorts quiet moves when not in check (noisy-only partition + insertion sort).
  - Expensive per-move attack scans in ordering are skipped at frontier nodes.
  - Reverse futility pruning; TT probes for quiescence ordering; gradual aspiration widening (300 window);
    Internal Iterative Deepening at deep TT-miss nodes; bigger eval cache (2^18).
- Hanging-piece threat eval term (engine-side, v3 mode): charges each side ~1/3 of its most valuable
  attacked-and-undefended piece (silver and up), fixing the "ignores attacks on its own pieces" behavior.
- Self-play vs V18 at *production* budgets (V18 keeps its old, longer budgets):
  easy 7-2-3 (equal 250ms) / medium 13-2-1 / hard 10-0-2 (equal time) / expert 6-2-2 (4s vs old 5s) / master 5-2-1 at HALF the old time.

V19 updates:
- Futility pruning at frontier nodes (depth ≤ 2): skips quiet moves when stand-pat + margin cannot reach alpha,
  guarded so long-range piece moves and moves near the enemy king are never skipped (hard+).
- SEE-lite losing-capture pruning in quiescence using the cached attack scans (hard+).
- Countermove heuristic: quiet refutations of the previous move are ordered just below killer moves.
- Deeper Late Move Reductions for very late quiet moves (fail-highs are verified by full-depth re-search).
- LMR + null-move pruning enabled from “hard” (previously expert/master only). Null move is very safe in shogi
  because zugzwang is essentially nonexistent (drops always provide useful moves).
- Verified by self-play vs V18 (see benchmark section for the command).

### Move legality filtering no longer clones positions

The largest performance killer in both engines was cloning during king-safety checks.

`src/components/game/ShogiImproved/GenerateMovesImproved.ts` now uses `move()` / `back()` when filtering moves and when verifying TT/PV moves, instead of cloning the entire position per candidate move.

### Transposition table hashing was fixed

The improved engine relies on Zobrist hashing to make the TT work.

`src/components/game/ShogiImproved/KyokumenImproved.ts` now generates Zobrist seeds using a deterministic 32-bit PRNG.

Why this mattered:
- a previous 48-bit Java-style LCG approach can silently collapse in JS because bitwise operations are 32-bit,
  which can produce all-zero seeds → **every position hashes to the same value** → TT becomes useless.

Additionally, the TT key now includes **side-to-move (`teban`)**:
- `HashVal = BanHash ^ HandHash ^ TebanHashSeed(when GOTE to move)`
- Without this, the same board+hand state for SENTE and GOTE would collide and corrupt TT cutoffs / best-move ordering.

---

## 2) The Search Algorithm (ShogiAIImprovedV20 default)

Default engine wired in the UI is `src/components/game/ShogiImproved/ShogiAIImprovedV20.ts`.

The original “base” implementation is still available as:
- `src/components/game/ShogiImproved/ShogiAIImproved.ts` (V2)

### Core loop

- **Iterative deepening**: search depth 1 → depth N while time remains
- **Negamax + alpha-beta pruning**
- **Principal Variation Search (PVS)** for extra pruning after the first move
- **Aspiration windows (Hard+)**: narrow alpha/beta window around the previous iteration’s score, with full-window fallback
- **Check extension**: extend depth by +1 when side-to-move is in check (tactically sharp positions)
- **Quiescence search** at depth 0:
  - when *not* in check: expand only captures/promotions to reduce horizon effect
  - when *in* check: expand all legal evasion moves (otherwise you miss mates)
- **Late Move Reductions (Lv4/Lv5)**: late quiet non-drop moves are searched at reduced depth first

### Move ordering (critical for strength)

The engine assigns each move a fast heuristic score used only for sorting:

1. TT best move first
2. Killer moves (non-captures that caused beta cutoffs at the same ply elsewhere)
3. History heuristic (moves that tend to improve alpha / cause cutoffs deeper in the tree)
4. Captures (MVV-LVA-ish)
5. Promotion bonus
6. Drop heuristics (major drops + near-king drops are prioritized)

### Time control / difficulty

Difficulty maps to a time budget and depth cap in `ShogiAIImproved.getNextTe()`:

- easy: `maxDepth <= 4`, `maxTimeMs ~= 250ms`
- medium: `maxDepth <= 6`, `maxTimeMs ~= 1200ms` (V19: raised from 800ms; LMR/null-move/futility/aspiration now enabled from medium)
- hard: `maxDepth <= 8`, `maxTimeMs ~= 2000ms`
- expert: `maxDepth <= 10`, `maxTimeMs ~= 5000ms` (runs in a Web Worker in `/games/shogi` + `/games/shogi-improved`)
- master: `maxDepth <= 12`, `maxTimeMs ~= 10000ms` (runs in a Web Worker)

You can tune this in:
- `src/components/game/ShogiImproved/ShogiAIImprovedV12.ts` (defaults in `getNextTe()`)
- UI text in:
  - `src/components/game/Shogi/Shogi.tsx`
  - `src/components/game/ShogiImproved/ShogiImproved.tsx`

### Experimental engine variant: `ShogiAIImprovedV3`

Implemented in `src/components/game/ShogiImproved/ShogiAIImprovedV3.ts`.

This keeps the same public API as the V2 engine but adds:

- **Repetition (sennichite) detection** inside search/quiescence (prevents many loop-y lines)
- **Null-move pruning (Expert/Master only)** to search deeper within the same time budget

This variant is not wired into the UI by default; use self-play to compare it to V2.

### Experimental engine variant: `ShogiAIImprovedV4`

Implemented in `src/components/game/ShogiImproved/ShogiAIImprovedV4.ts`.

This keeps the same public API as V2/V3 and adds:

- **Repetition draw contempt**: discourages repeating when ahead, accepts when behind *(currently disabled by default in code until tuned)*
- **Check extensions**: improves tactical accuracy on forcing lines *(currently disabled by default in code until tuned)*
- **Quiescence delta pruning**: speeds up capture/promotion-only search so main search can go deeper *(currently disabled by default in code until tuned)*
- **Root fallback move**: always returns a legal move even with very small time budgets

This variant is also not wired into the UI by default; use self-play to compare.

### Experimental engine variant: `ShogiAIImprovedV5`

Implemented in `src/components/game/ShogiImproved/ShogiAIImprovedV5.ts`.

Adds:

- **Mate-distance bounds** (more stable mate scoring)
- **Check-aware quiescence** (includes quiet checking moves in leaf search; bounded)

### Experimental engine variant: `ShogiAIImprovedV6`

Implemented in `src/components/game/ShogiImproved/ShogiAIImprovedV6.ts`.

Adds:

- **Evaluation caching (direct-mapped)** keyed by `(BanHash ^ HandHash)` to reduce repeated evaluation work
- **Opening-aware root move ordering** (quiet development + 1-step pawn pushes) to reduce “random-looking” openings

### Experimental engine variant: `ShogiAIImprovedV7`

Implemented in `src/components/game/ShogiImproved/ShogiAIImprovedV7.ts`.

### Current default: `ShogiAIImprovedV20` (Lv1-5)

Implemented in `src/components/game/ShogiImproved/ShogiAIImprovedV20.ts`.

Notes:
- Lv4/Lv5 still run in a Web Worker (`src/components/game/ShogiImproved/shogi-ai.worker.ts`) to avoid blocking the UI.
- V11 is kept as a stable baseline for A/B testing (`src/components/game/ShogiImproved/ShogiAIImprovedV11.ts`).

Adds:

- Inherits V11’s improvements:
  - **Root-only check extensions (Master)** to improve tactical accuracy on forcing lines
  - **Root-only drop-safety ordering** using cheap attack tests to penalize hanging drops
  - **Opening-aware root move ordering** (quiet development + 1-step pawn pushes) to reduce “random-looking” openings when the book doesn’t apply
  - **Root SEE-lite / “hanging” ordering** (bounded) to reduce obviously losing drops/loose moves without slowing the full tree
  - **Root ordering cache** so the expensive root heuristics run once per move (faster + stronger under tight time budgets)
  - **Packed TT (V10+)**: stores move keys instead of cloning `Te` objects at most nodes (less GC, deeper search)
  - **Pooled move generation (V11)**: reuses `Te` objects per ply to reduce allocations (more nodes per time budget)
- **Hanging-drop safety ordering (all plies)**: mildly penalizes immediately-capturable, undefended drops to reduce ineffective piece drops
- **Opening pressure gating**: reduces castling/development ordering bias when the king is already under pressure (prevents “castle while dying” behavior)
- **Mate solver pre-search (`MateSolverImproved`)**: see the dedicated section below

### Mate solver: `MateSolverImproved` (詰みソルバー)

Implemented in `src/components/game/ShogiImproved/MateSolverImproved.ts`, integrated into
`ShogiAIImprovedV20.getNextTe()` as a pre-search probe.

What it is:
- A **checks-only AND/OR search** (連続王手の詰み探索) with **iterative deepening over the mate
  length** (1, 3, 5, ... plies, up to 9). The attacker only plays checking moves; the defender tries
  *every* legal reply. This proves/refutes “mate in N” exactly, which the heavily pruned main search
  (futility/LMR/null-move) cannot guarantee for deep sacrifice mates.
- **Rule-correct**: 打ち歩詰め (pawn-drop mate) is excluded (the pooled generator filters it via
  `isUtiFuDume`), self-check is filtered lazily after make, and positions already on the current
  search path are never re-entered (repetition/perpetual-check loop cut).
- **Allocation-free**: pooled per-ply move lists, make/unmake on a single clone of the caller’s
  position.
- A cheap geometric **drop pre-filter** skips the make/unmake for drops that cannot possibly give
  check (drops never give discovered check), which matters because drops dominate endgame move lists.

Integration policy in V20 (`tryMateSolve`):
- **Gate (endgame-only)**: runs only when at least one own non-king piece is within Chebyshev
  distance 3 of the enemy king and (near pieces + own hand pieces) >= 2. In the opening/midgame the
  gate is off and costs nothing.
- **Budget**: ~20% of the move time budget, capped at 200ms (fixed 250ms + node cap when the search
  is untimed, e.g. deterministic tests). Unused/failed probe time is handed back to the main search
  so total move time stays honest.
- If a forced mate is found, the mating move is returned **immediately** (skipping the main search).

A/B baseline: `ShogiAIImprovedV20Base.ts` is a frozen pre-mate-solver copy of V20, registered as
engine `v20base` in `scripts/shogi-ai-match.ts` for regression matches.

### Experimental engine variant: `ShogiAIImprovedV13`

Implemented in `src/components/game/ShogiImproved/ShogiAIImprovedV13.ts`.

Notes:
- This is an experimental branch used for testing more aggressive search ideas.
- In self-play it has been **less stable / weaker** than V11/V12, so it is **not** wired into the UI defaults.

---

## 3) Evaluation (KyokumenImproved)

`src/components/game/ShogiImproved/KyokumenImproved.ts` implements evaluation as:

- incremental material (`eval`, SENTE perspective)
- incremental **piece-square table** term (`psqtEval`, SENTE perspective)
- small **hand bonus** (pieces-in-hand are flexible due to drops)
- **file defense** heuristics (prevents immediate opening disasters)
- **promotion threats** heuristics

Additional lightweight terms:
- **king safety** (defenders around king + basic shelter)
- **castle shapes (囲い)** (small bonuses for coherent king safety plans like 美濃/矢倉/穴熊)
- **major piece activity** (rook/bishop mobility + lines toward enemy king)

### Opening-book evaluation (fast)

`KyokumenImproved.evaluateForOpeningBook()` exists only to make opening-book safety validation fast:
- matches the tuned `evaluateV3()` structure/weights
- intentionally omits expensive mobility-style terms (major piece activity)

### Evaluation modes

- `evaluateV1()`:
  - baseline used for regression/self-play comparisons
- `evaluate()` (v2):
  - full evaluation (material + PSQT + king safety v2 + castle shapes + activity + opening heuristics)
- `evaluateV3()`:
  - tuned weights (same terms, same computational structure)
  - phase-aware scaling so opening-only heuristics (file defense / promotion threats) don’t dominate mid/endgame
  - keeps opening weights strong to avoid shallow-search blunders

The evaluation is intentionally simple: most strength comes from deeper search + better ordering.

---

## 4) Important Engine Invariants (Easy to Miss)

### `move()`/`back()` do not flip turns

`KyokumenImproved.move(te)` and `KyokumenImproved.back(te)` do not change `teban`.

Search must do:

1. `k.move(te)`
2. toggle `k.teban`
3. recurse
4. toggle `k.teban` back
5. `k.back(te)`

### Don’t assign `teban` directly (hash consistency)

Because `HashVal` includes side-to-move, prefer:
- `k.setTeban(SENTE | GOTE)` when forcing a specific side
- `k.toggleTeban()` inside search

Directly assigning `k.teban = ...` will desync `HashVal` unless you recompute the hash from scratch.

### `Te.capture` must be correct

Undo logic (`back()`) relies on `Te.capture` to restore the destination square.
Move generation fills it, but legality checks also enforce it before doing move/unmove.

### Major piece promotion (角/飛)

In the improved move generator, **bishop/rook (角/飛) promotions are forced when promotion is legal**.

Rationale:
- `角→馬` and `飛→竜` are strictly stronger (same moves + extra king-like steps), so keeping them unpromoted
  never increases your options.
- Pruning the non-promote variant reduces branching factor → deeper search for the same time budget.

---

## 5) Debugging / Benchmarks

This repo’s environment may fail with `npx tsx ...` due to an IPC permission issue.
Use Node + the tsx register instead:

### Run improved-engine tests

```bash
node -r tsx/cjs src/components/game/ShogiImproved/test.ts
```

### Run A/B self-play (engine vs engine)

Compare engines (V2/V3/V4/V5/V6/V7):

```bash
npm run shogi:match -- --engineA v2 --engineB v5 --difficulty medium --games 10 --maxDepth 4 --maxTimeMs 60
```

To break symmetry (recommended), randomize the starting position via a small number of seeded opening plies:

```bash
npm run shogi:match -- --engineA v2 --engineB v5 --difficulty master --games 20 --maxDepth 5 --maxTimeMs 200 --openingPlies 4 --openingMode curated --seed 1
```

To output an evaluation graph (SVG + CSV) for the first game:

```bash
npm run shogi:match -- --engineA v2 --engineB v5 --difficulty master --games 10 --maxDepth 5 --maxTimeMs 200 --openingPlies 4 --openingMode curated --seed 1 --graph true
```

`--graph true` writes:
- `.svg` (high quality)
- `.png` (preview-friendly)
- `.csv` (data you can plot elsewhere)

You can also compare evaluation modes within the same engine:

```bash
npm run shogi:match -- --engineA v2 --engineB v2 --evalA v1 --evalB v2 --difficulty medium --games 10 --maxDepth 4 --maxTimeMs 60
```

### Benchmark the `/games/shogi` AI entry point

This forces search by bypassing the opening book (`moveNumber > 12`):

```bash
node -r tsx/cjs -e "const { createInitialPosition }=require('./src/components/game/Shogi/InitialPosition.ts'); const { getBestMove }=require('./src/components/game/Shogi/ShogiAI.ts'); const { SENTE }=require('./src/components/game/Shogi/types.ts'); const k=createInitialPosition(); console.time('shogi'); const m=getBestMove(k,SENTE,'medium',20,[]); console.timeEnd('shogi'); console.log(m);"
```

To see engine stats, call `getNextTe(..., { debug: true })` inside `ShogiAIImproved` or temporarily set `debug: true` in `getBestMove()` there.

---

## 6) Legacy / Extra Notes

### Phase-aware evaluation (original engine)

There is an older improvement that added game-phase-aware evaluation in the legacy `Kyokumen` implementation:

- `src/components/game/Shogi/Kyokumen.ts`

This is still present and may affect the fallback clone-based engine, but the primary performance/strength path is now the improved make/unmake engine.

---

## 7) Future Improvements (Optional)

If you want even stronger play without freezing the UI:

- Add better evaluation features (king safety, piece activity, endgame heuristics)
- Add more pruning/ordering (SEE, delta pruning, singular extensions, etc.) once correctness is solid
