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
   - searches via `src/components/game/ShogiImproved/ShogiAIImproved.ts`
   - converts the chosen move back to UI `Te`

This keeps the existing UI logic (and opening book) intact, but replaces the slow clone-heavy search with a much faster make/unmake engine.

### Move legality filtering no longer clones positions

The largest performance killer in both engines was cloning during king-safety checks.

`src/components/game/ShogiImproved/GenerateMovesImproved.ts` now uses `move()` / `back()` when filtering moves and when verifying TT/PV moves, instead of cloning the entire position per candidate move.

### Transposition table hashing was fixed

The improved engine relies on Zobrist hashing to make the TT work.

`src/components/game/ShogiImproved/KyokumenImproved.ts` now generates Zobrist seeds using a deterministic 32-bit PRNG.

Why this mattered:
- a previous 48-bit Java-style LCG approach can silently collapse in JS because bitwise operations are 32-bit,
  which can produce all-zero seeds → **every position hashes to the same value** → TT becomes useless.

---

## 2) The New Search Algorithm (ShogiAIImproved)

Implemented in `src/components/game/ShogiImproved/ShogiAIImproved.ts`.

### Core loop

- **Iterative deepening**: search depth 1 → depth N while time remains
- **Negamax + alpha-beta pruning**
- **Principal Variation Search (PVS)** for extra pruning after the first move
- **Check extension**: extend depth by +1 when side-to-move is in check (tactically sharp positions)
- **Quiescence search** at depth 0:
  - when *not* in check: expand only captures/promotions to reduce horizon effect
  - when *in* check: expand all legal evasion moves (otherwise you miss mates)

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

You can tune this in:
- `src/components/game/ShogiImproved/ShogiAIImproved.ts` (defaults in `getNextTe()`)
- UI text in:
  - `src/components/game/Shogi/Shogi.tsx`
  - `src/components/game/ShogiImproved/ShogiImproved.tsx`

---

## 3) Evaluation (KyokumenImproved)

`src/components/game/ShogiImproved/KyokumenImproved.ts` implements evaluation as:

- incremental material (`eval`, SENTE perspective)
- small **hand bonus** (pieces-in-hand are flexible due to drops)
- **file defense** heuristics (prevents immediate opening disasters)
- **promotion threats** heuristics

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

### `Te.capture` must be correct

Undo logic (`back()`) relies on `Te.capture` to restore the destination square.
Move generation fills it, but legality checks also enforce it before doing move/unmove.

---

## 5) Debugging / Benchmarks

This repo’s environment may fail with `npx tsx ...` due to an IPC permission issue.
Use Node + the tsx register instead:

### Run improved-engine tests

```bash
node -r tsx/cjs src/components/game/ShogiImproved/test.ts
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

- Run the search inside a Web Worker (keep UI thread responsive even with 5–10s budgets)
- Add repetition (sennichite) detection and draw handling
- Add better evaluation features (king safety, piece activity, endgame heuristics)
- Add additional pruning (late move reductions, null-move pruning) once legality/check handling is solid
