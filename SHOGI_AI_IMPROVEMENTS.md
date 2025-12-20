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
   - searches via `src/components/game/ShogiImproved/ShogiAIImprovedV12.ts` (default)
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

## 2) The Search Algorithm (ShogiAIImprovedV12 default)

Default engine wired in the UI is `src/components/game/ShogiImproved/ShogiAIImprovedV12.ts`.

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
- medium: `maxDepth <= 6`, `maxTimeMs ~= 800ms`
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

### Current default: `ShogiAIImprovedV12` (Lv1-5)

Implemented in `src/components/game/ShogiImproved/ShogiAIImprovedV12.ts`.

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
