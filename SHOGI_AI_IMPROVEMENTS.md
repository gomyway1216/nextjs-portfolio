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

Additionally, the TT key now includes **side-to-move (`teban`)**:
- `HashVal = BanHash ^ HandHash ^ TebanHashSeed(when GOTE to move)`
- Without this, the same board+hand state for SENTE and GOTE would collide and corrupt TT cutoffs / best-move ordering.

---

## 2) The New Search Algorithm (ShogiAIImproved)

Implemented in `src/components/game/ShogiImproved/ShogiAIImproved.ts`.

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
- `src/components/game/ShogiImproved/ShogiAIImproved.ts` (defaults in `getNextTe()`)
- UI text in:
  - `src/components/game/Shogi/Shogi.tsx`
  - `src/components/game/ShogiImproved/ShogiImproved.tsx`

### Experimental engine variant: `ShogiAIImprovedV3`

Implemented in `src/components/game/ShogiImproved/ShogiAIImprovedV3.ts`.

This keeps the same public API as the V2 engine but adds:

- **Repetition (sennichite) detection** inside search/quiescence (prevents many loop-y lines)
- **Null-move pruning (Expert/Master only)** to search deeper within the same time budget

This variant is not wired into the UI by default; use self-play to compare it to V2.

---

## 3) Evaluation (KyokumenImproved)

`src/components/game/ShogiImproved/KyokumenImproved.ts` implements evaluation as:

- incremental material (`eval`, SENTE perspective)
- small **hand bonus** (pieces-in-hand are flexible due to drops)
- **file defense** heuristics (prevents immediate opening disasters)
- **promotion threats** heuristics

Additional lightweight terms:
- **king safety** (defenders around king + basic shelter)
- **major piece activity** (rook/bishop mobility + lines toward enemy king)

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

Compare V2 vs V3:

```bash
npm run shogi:match -- --engineA v2 --engineB v3 --difficulty medium --games 10 --maxDepth 4 --maxTimeMs 60
```

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
