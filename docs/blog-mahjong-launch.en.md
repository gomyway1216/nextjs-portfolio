# After Shogi, I Built Mahjong — How Much the Design Changes Between Perfect and Imperfect Information

> I added a four-player riichi mahjong game to my personal site (meetyudai.com) — [/games/mahjong](https://meetyudai.com/games/mahjong). One human plus three AI seats, tonpuusen (East-only), open tanyao and atozuke (late yaku) allowed, three red fives, ippatsu and ura dora on. The same site already hosts a shogi AI I wrote about at length in [the rebuild post](./blog-shogi-ai-rebuild.en.md). The interesting part was never "I made a mahjong game" — it was that **almost every design decision that was right for shogi turned out to be wrong for mahjong**. This is a record of that delta. Japanese version: [blog-mahjong-launch.md](./blog-mahjong-launch.md).

---

## TL;DR

- Shogi strength comes from **search depth**. That is why it needed a WASM port, SIMD, Lazy SMP, `SharedArrayBuffer` and COOP/COEP headers. Mahjong needed **none of it**. `next.config.ts` was never touched, not once.
- Strength here comes instead from an **exactly correct rules engine**, **fast shanten/acceptance maths**, and **expected-value push/fold**. Plain TypeScript is fast enough: shanten in **3.2 µs**, a full 34-kind acceptance scan in **0.097 ms**, a complete AI decision in **0.31–0.44 ms**.
- The first thing frozen was the tile representation: `kind = tileId >> 2`, and the wall index layout (dora indicator at `130 - 2i`, ura at `131 - 2i`, replacement at `135 - n`, `liveEnd = 122 - kanCount`). **Freezing the type contract first is what let the wall, shanten and scoring milestones be built in parallel by different agents.**
- The real content of this post is how correctness was established: a **deliberately slow brute-force shanten reference** cross-checked against the fast DP on **10,000 random hands**, a **hand-written fu × han payment table**, **118 yaku snapshots**, and a **random-play fuzz** that re-checks after *every single action* that 136 tiles still exist exactly once, that every hand is a legal size, and that scores plus riichi sticks still sum to 100,000 — **about 420,000 actions per seed with zero violations**.
- The rule subtleties all live in code comments: why haitei and houtei are **asymmetric** about a replacement draw, why the head must be treated as a **fifth block** or `123m456m789m12p34s` is misread as tenpai, takame (high-point) parse selection, and why `pendingClaims` is needed to order a double ron head-bump-first.
- The AI is honestly a **solid intermediate**, not Mortal-class. Shanten-first shortlist then acceptance, genbutsu/suji/kabe defence, threshold-based push/fold. A learned policy is future work.
- What is **deliberately not in v1** is stated explicitly: pao, suufon renda, nagashi mangan, and sanma (three-player — a genuine variant needing 108 tiles, three seats, no chi and North as a pulled dora, planned as its own milestone).

---

## 0. Why mahjong is not shogi

Strengthening the shogi AI converged, in the end, on a single question: how many nodes per second can it search? Porting TypeScript to WebAssembly made search 15× faster; SIMD128 made evaluation 6.2× faster; Lazy SMP added threads, which needed `SharedArrayBuffer`, which needed COOP/COEP headers. The evaluation function was distilled into an NNUE. **Every one of those was an investment in searching deeper.**

Bring that instinct to mahjong and it buys you almost nothing.

| Aspect | Shogi | Mahjong |
|---|---|---|
| Information | Perfect | **Imperfect** (opponents' hands and the wall are hidden) |
| Players | Two-player zero-sum | Four-player and stochastic (draw order) |
| Source of strength | Deep search (alpha-beta + NNUE) | **Accurate evaluation + expected value** |
| Where the work goes | Search speed → WASM required | **Rules and arithmetic correctness** → TS is plenty |
| Measuring strength | 80–200 self-play games is significant | Variance is enormous → **duplicate walls, thousands of games** |

The reason is simple: in mahjong the game tree past your own turn is interleaved with **invisible randomness** — the next draw, the opponents' hands. Reading five plies ahead means nothing if you cannot price the branch probabilities at ply five. In shogi, depth + 1 converts directly into playing strength. In mahjong, depth + 1 mostly buys variance.

What mahjong has instead is a large supply of things that can be **computed exactly in closed form**. How many tiles from tenpai is this hand? If I discard this tile, how many kinds and how many copies does the remainder accept? What fu, what han, and who pays whom for this winning hand? Is this tile genbutsu, suji, or ruled out by a wall? All of those are **arithmetic, not search** — and all of them **break the AI instantly if they are wrong**.

So the v1 plan was not "port the search". It was, in order:

1. Make the rules engine exactly correct (pinned by test vectors).
2. Have fast shanten and acceptance maths.
3. Put push/fold heuristics on top.

The consequence: `next.config.ts` was never edited. No COOP/COEP, no `SharedArrayBuffer`, no multi-threaded workers. There *is* an AI worker, but only so the UI never blocks — it is a stateless one-request-one-response RPC.

The measurements back the call (all measured locally in Node / the browser):

| Operation | Target | Measured |
|---|---|---|
| `shanten` per hand | < 0.05 ms | **0.0032 ms (3.2 µs)** |
| `ukeire` full 34-kind scan | < 2 ms | **0.097 ms** |
| One full AI decision | < 2 ms | **0.31–0.44 ms** |

At 0.44 ms per decision, a whole go-around of three AI seats finishes in under 1.5 ms. There is nowhere for WASM to help.

---

## 1. The first thing frozen was how a tile is represented

The single most valuable decision in this project was to **fix the type contract before writing any code**. Milestone M0's only deliverables were `engine/types.ts` and `engine/rules.ts` — not one line of implementation.

The tile representation:

- **Tile kind (`TileKind`)**: `0..33`. `0..8` = manzu 1-9, `9..17` = pinzu, `18..26` = souzu, `27..30` = East/South/West/North, `31..33` = Haku/Hatsu/Chun.
- **Tile id (`TileId`)**: `0..135`. There are exactly four copies of each kind, **`kind = tileId >> 2`**, and the copy index is `tileId & 3`.
- Red fives are copy 0 of their kind: `16` (5m), `52` (5p), `88` (5s).
- A concealed hand is a `Uint8Array(34)` histogram (the shape shanten/ukeire take); ponds and melds are arrays of tile ids.

That one-line contract, `kind = tileId >> 2`, makes every downstream module easier. Shanten only ever looks at the kind histogram, so it never has to know red fives exist. Fu and yaku detection *do* need physical tiles, so they work on tile-id arrays. **Two granularities for the same tile, and the conversion between them is always a single shift** — that held all the way to the end.

The wall's index layout was frozen as a diagram before it was implemented, too. The doc comment at the top of `wall.ts` *is* the specification:

```
index:  0 ............ drawIndex ........ liveEnd | 122 ........... 135
        +---- drawn ----+---- live wall ---+------ dead wall -------+
```

- The live wall is `[drawIndex, liveEnd)`. The haitei tile is `tiles[liveEnd - 1]`.
- The dead wall **slots** `122..135` are fourteen fixed positions that **never move**.
- A kan pulls one tile off the live end into the dead wall — modelled by decrementing `liveEnd` — so after `k` kans, `liveEnd = 122 - k`.
- Dora indicator `i` is at `130 - 2i` and its ura at `131 - 2i` (`i` in `0..4`): 130/131, 128/129, 126/127, 124/125, 122/123.
- Replacement (rinshan) draw `n`, zero-based, takes `tiles[135 - n]`: 135, 134, 133, 132.

That the ten indicator slots and the four replacement slots **partition the fourteen with no overlap** is pinned by a test, not left as a comment. And the decisive line is the last one: **the contents of `wall.tiles` are fixed the moment `buildWall` returns, and no tile ever moves again.** Only the `drawIndex` and `liveEnd` cursors move. That makes the "136 tiles exist exactly once" invariant trivially checkable by walking one array — which is the foundation the fuzz test below stands on.

### The contract is what made parallel work possible

This project ran across several subagents. Once M0 (types) was done, **M2 (shanten/ukeire) and M3 (yaku/scoring) could start simultaneously, knowing nothing about each other.** They share `types.ts`, they write to different files, and all they need to agree on is contract-level facts: "`TileCounts` is a length-34 `Uint8Array`", "called melds are passed separately as `meldCount`". Likewise M6 (UI) ran in parallel with M5 (AI) once M4 (the state machine) was in.

The UI put the AI behind a two-line interface and developed against a deliberately trivial stand-in driver — one that plays the first legal non-riichi discard — until the real AI merged:

```ts
export type AiDriver = (state: RoundState, seat: Seat) => Action | Promise<Action>;
export type AiDriverFactory = (difficulty: MahjongDifficulty) => AiDriver;
```

Without a frozen contract, that parallelism would have turned into "everything breaks on every merge".

---

## 2. How correctness was actually established (the real content)

What makes mahjong hard to implement is not the algorithms — it is that **you cannot tell when you are wrong**. In shogi an illegal move corrupts the board and you notice immediately. In mahjong you can be 10 fu off, or miss one case of sanankou, and the hand still plays out to the end. So there are four separate verification mechanisms.

### (a) Cross-checking against a deliberately slow reference

The production `engine/shanten.ts` builds a per-suit profile — "the most sets reachable using exactly `b` blocks" — memoises it, and joins the four groups with a four-step DP. Fast, but not something you can verify by eye.

So the test tree carries `shantenReference.ts`. Its opening comment says it all:

```
Nothing here is memoised, split per suit, or pruned beyond the block budget:
the point is that each function is short enough to be checked by eye, so the
fast DP in `engine/shanten.ts` can be cross-checked against it on tens of
thousands of random hands. Never import this from production code.
```

No suit split, no DP, no memoisation — a single recursion over all 34 kinds. Slow, but **short enough to follow by eye**. The two are cross-checked on **10,000 random legal hands** (alternating 13- and 14-tile sizes, cycling `meldCount` 0..4) with **zero mismatches**, plus **2,000 structured hands** assembled from real blocks (runs, triplets, ryanmen, kanchan, pairs, honours) which produce far denser decompositions than uniform random hands.

There are also tests that anchor the formula to the **definition** of shanten. `isWinningShape` — a plain recursive four-sets-plus-a-pair checker written without reference to the shanten formula — is used to verify that `standardShanten === 0` exactly when the hand is one tile from a winning shape (800 hands), and that the best draw-and-discard exchange lowers shanten by exactly one, never two (300 hands).

### (b) Writing the fu × han payment table out by hand

Scoring can be derived from formulas or looked up in a table. v1 **writes the table out by hand and pins it**: 20 fu through 110 fu × 1–4 han, plus mangan through yakuman, dealer and non-dealer, tsumo and ron — every cell enumerated in the test. Since kiriage mangan is not used, 4 han 30 fu stays 7700 / 11600, and that is an explicit case too.

Where the spec left something open, the decision is **written down in the `score.ts` docblock** so nobody has to excavate the reasoning later. For example:

- **Menzen ron is +10 fu**, not +2. The milestone brief said "+2"; that is a typo for the universal +10. With +2, a closed 40 fu ron (say, one concealed triplet of simples) would score 30 fu and the entire closed-hand column would be shifted.
- **A double-wind pair is 4 fu** — the seat and round roles counted separately — mirroring how a double-wind *triplet* yields two yakuhai. The 2-fu reading is also common; we picked the one consistent with our own yakuhai handling.
- **A triplet completed by a ron counts as an open triplet**, both for fu and for sanankou/suuankou. Only a tsumo, or a shanpon that was already complete, gives a concealed triplet.
- **Kuipinfu floors to 30 fu**: an open hand whose fu total lands on exactly 20 becomes 30. A closed pinfu tsumo stays at 20.
- **Fu rounds up to the next multiple of 10.** That is universal, and unrelated to *kiriage mangan*, which v1 does not use.

### (c) 118 yaku snapshots

`score.test.ts` enumerates **118 cases** that spell out, from the hand, melds, winning tile and situational flags, the expected yaku list, fu, han and points. Riichi/ippatsu/menzen-tsumo/pinfu stacks; haitei raoyue versus rinshan kaihou; chankan; kuisagari on and off; the chiitoitsu-versus-ryanpeikou crossing; daisangen + tsuuiisou as a double yakuman. The **emission order of yaku is fixed too**, so a test fails even if only the ordering of a composition changed.

Yaku and fu both depend on **how the winning hand is read**. So `parseWinningHand` enumerates **every legal reading**, and `evaluateHand` scores all of them and keeps the best under takame (高点法: more yakuman, then more han, then more fu, then more points).

```ts
export function evaluateHand(ctx: WinContext, isDealer?: boolean): HandValue {
  const parses = parseWinningHand(ctx);
  if (parses.length === 0) return emptyValue();
  ...
}
```

Note that **dora, red fives and ura dora are not yaku**. They are added to `HandValue.han` but never appear in `HandValue.yaku`, so a dora-only hand fails `hasYaku` and cannot be declared a win at all. That separation is not a code convenience — it is the rule.

### (d) Random-play fuzz — invariants re-checked after every single action

This is the one that earned its keep. `scripts/mahjong-sim-smoke.ts` plays whole games with every seat choosing uniformly at random from `legalActions`, and re-checks the structural invariants **after every single action**:

- All 136 tile ids present exactly once across wall + hands + melds + ponds.
- Every hand at a legal size (`13 - 3 × melds`, plus one on your own turn).
- **Scores + riichi sticks == 4 × 25000** (= 100,000).
- A non-empty action list for every seat the engine is waiting on.

It is the mahjong equivalent of shogi perft. It proves nothing about strength, but **any bookkeeping mistake in the state machine shows up within a few thousand hands**: a tile duplicated by a call, a riichi stick created twice, a hand left the wrong size after a kan, a position where nobody can move.

Games alternate between uniform-random play (which reaches strange positions) and a shanten-greedy policy (which actually completes hands), so both the odd corners and the scoring paths get exercised.

| Seed | Hands | Actions | Tsumo / Ron | Draws | Riichi | Kans / Calls | Time |
|---|---|---|---|---|---|---|---|
| `1` | 5000 | 421,101 | 338 / 860 (1 double ron) | 3802 + 1 kyuushu | 1719 | 644 / 22,770 | 38s |
| `20260826` | 5000 | 419,922 | 323 / 880 (1 double ron) | 3795 + 3 kyuushu | 1722 | 610 / 22,756 | 36s |
| `deadbeef` | 5000 | 420,084 | 327 / 902 (3 double ron) | 3774 | 1776 | 629 / 22,704 | 34s |

Zero exceptions, zero invariant violations. CI runs the same loop over 2000 hands (~13s); the 5000-hand budget is run from the script by hand.

Today the mahjong test tree is **468 tests across 9 files** in **3.7 seconds**, against roughly 8,600 lines of engine + AI + UI and 6,700 lines of tests.

---

## 3. Rule subtleties worth reading

A few things that felt worth writing down so the next person does not rediscover them.

### Haitei and houtei are asymmetric about a replacement draw

Both are "win on the last tile" yaku, and yet they behave differently. Straight from the comment in `actions.ts`:

```ts
// Haitei and houtei are deliberately asymmetric. Haitei raoyue is winning
// on *the last tile drawn from the live wall*, so a replacement tile never
// qualifies — that win is rinshan kaihou instead, which is why this checks
// `lastDrawSource === 'wall'`. Houtei raoyui is winning on *the last
// discard of the hand*, and the discard that follows a replacement draw is
// still the last discard once the live wall is empty, so it correctly does
// not exclude rinshan.
haitei: isTsumo && state.lastDrawSource === 'wall' && isExhausted(state.wall),
houtei: !isTsumo && !chankan && isExhausted(state.wall),
```

Haitei raoyue is winning on **the last tile of the live wall**, so a replacement tile never qualifies — that win is rinshan kaihou. Houtei raoyui is winning on **the last discard of the hand**, and a discard that follows a replacement draw is still the last discard once the live wall is empty, so it correctly does *not* exclude rinshan. Same word "last", two different things being counted: the last of the wall versus the last of the pond.

Relatedly, a chankan is never a houtei — the robbed tile is not a discard. Every such flag is derived from the round inside `buildWinContext`, which both `legalActions` (deciding whether a win has a yaku) and `applyAction` (scoring it) go through — so the two **cannot possibly disagree** about whether a tile was the haitei.

### The head is the fifth block, not four blocks plus an extra

The easiest trap in shanten. A standard-shape decomposition picks `S` complete sets, `P` partial sets, and optionally one pair as the head. A winning hand is four sets plus a head — **five blocks in total** — so:

- with a head: `meldCount + S + P + 1 <= 5`
- without a head: `meldCount + S + P <= 4`

Both reduce to `S + P <= 4 - meldCount`. The point is the **refusal to count a fifth block when no head exists**. Skip that and `123m456m789m12p34s` gets reported as tenpai. That hand has five blocks — three runs and two ryanmen — but no pair anywhere, so one of them still has to be reworked into the head. The correct answer is one-shanten.

The shanten of a decomposition is

```
8 - 2 * (meldCount + S) - P - (head ? 1 : 0)
```

and the hand's shanten is the minimum over every decomposition. Writing `B = S + P`, the quantity to maximise is `2S + P = S + B`. Blocks never span two suits, so manzu, pinzu, souzu and honours are decomposed independently into a profile — "the most sets reachable using exactly `b` blocks" — and a four-step DP joins them under the shared block budget, with profiles memoised on the suit's packed count signature. A hand therefore costs a handful of map lookups plus a 4×5×5 DP per head candidate. That is what 3.2 µs is made of.

### Takame can only be chosen afterwards

A winning hand can have several readings. A pair-heavy hand may read as chiitoitsu or as sets-plus-a-pair; a pinfu tsumo at 20 fu can compete with a different decomposition at 30. Yaku and fu **depend on the reading**, so you cannot pick a reading first and score it — you have to score them all and take the best. That is why `parseWinningHand` is exhaustive rather than greedy.

### Double ron is why `pendingClaims` exists

This one reached back into the state machine's design. Responses to a discard are resolved **by rank, not by arrival order**: ron beats pon/kan beats chi, with directional constraints on top (chi only from the seat to your left).

Double ron makes it worse. The honba and the riichi sticks all go to the **head bump** — the winner closest counter-clockwise from the discarder. Which means **you cannot decide who takes the honba until every ron has been declared**. Process claims as they arrive and the second ron forces you to redo the first payment.

So `RoundState` gained exactly one field:

```ts
/**
 * Claims cannot be executed the moment they arrive — ron beats pon/kan beats
 * chi, and a double ron needs every ron declared before the payments can be
 * ordered head-bump first — so they are parked here until every seat the
 * engine is waiting on has answered.
 */
pendingClaims: Action[];
```

The existing `pendingResponses: Seat[]` records *who* answered but cannot carry *what* they chose, so the declarations themselves needed somewhere to wait. Once any ron is declared, seats that can only pon or chi drop out of the waiting set — they could not win anyway. With this in place a double ron is not a special case at all; it is an ordinary settlement that happens to have two winners.

Across 5000 hands × 3 seeds of fuzzing, double ron occurred only 1–3 times. **Without a hand-written scenario test, that path is one you essentially never reach.**

---

## 4. The AI, honestly scoped

Let me be straight about how strong the current AI is: a **solid intermediate**, not a deep-learning heavyweight like Mortal. The design is plain.

### Offence

1. Shortlist discards **using shanten alone** (34 cheap evaluations).
2. Only the two or three survivors pay for a **full acceptance (`ukeire`) scan**.
3. Ties on acceptance break on tile value — proximity to dora, never break a completed set, a bonus for isolated tiles, and a danger penalty subtracted when anybody looks tenpai.

The two-pass structure is the result of an optimisation. The comment records it:

```
Two passes on purpose: shanten alone (34 cheap evaluations) narrows a
fourteen-tile hand to the two or three candidates that matter, and only
those pay for a full `ukeire` scan. Running `bestDiscards` over the whole
hand instead measured 1.2ms per decision, most of it spent on acceptance
counts for tiles the AI would never throw.
```

The straightforward version — a full acceptance scan for every tile — measured 1.2 ms, most of it spent counting acceptance for tiles the AI would never throw. Two passes brings it to 0.44 ms (0.31 ms on a local 100-game run).

Riichi is the default on any menzen tenpai. It is declined only when **all three** conditions hold at once: the wait is narrow, the hand is cheap, *and* a single live draw would widen the wait by two or more tiles. Calls are made only after positively checking that a real **open** yaku path survives the call — yakuhai, kuitan tanyao, honitsu/chinitsu and toitoi are modelled; open sanshoku and open ittsu are not, so the AI **simply never calls for them** (declining a good call costs far less than opening a hand that cannot win).

### Defence

`ai/safety.ts` answers exactly one question: *if I put this tile on the table, how likely is it to be ronned, and by whom?* The reads are the standard human ones, applied in the order a human applies them:

1. **Genbutsu** — a tile in that opponent's own pond can never be ronned by them (furiten), and neither can a tile anybody else discarded after their riichi and which they did not claim. `DiscardEntry` carries no turn index, so "after their riichi" is reconstructed from the go-around structure — and the reconstruction is deliberately **conservative**: it can miss a genuinely safe tile, but it can never invent one.
2. **Suji** — documented explicitly as **ryanmen-only**. A suji tile is still fully live against tanki, shanpon and kanchan, so it lowers the danger by a factor rather than to zero.
3. **Kabe / one-chance** — if all four copies of a tile a ryanmen would need are visible, that ryanmen cannot exist. That is the same class of statement as suji, so the two are combined **per side** rather than multiplied together: a tile that is suji above and walled below is exactly as safe as a double-suji tile.
4. **Honours by remaining count** — an honour nobody can pair up is nearly safe; a fresh one is not.
5. **No-suji middle tiles** — the most dangerous thing in the hand.

Threat detection flags a declared riichi (weight 1.0), three or more melds (0.7), a yakuhai pon plus a second meld (0.6), and a visible one-suit lean — all melds in one suit with five or more off-suit number tiles already in the pond (0.5).

### Push/fold

v1 is threshold-based. Against a live threat: fold at 2+ shanten; fold even at tenpai when the hand is **cheap *and* the wait is bad**; otherwise push.

Every threshold is an **exported, named constant** (`FOLD_MIN_SHANTEN` 2, `RIICHI_BAD_WAIT_TILES` 4, `SET_BREAK_PENALTY` 40, …). That is the tuning surface for the next milestone.

### Next up: the A/B harness

M7 builds a self-play A/B harness under the same discipline as the shogi one. The hard part in mahjong is variance — naive self-play buries a placement difference in noise even at a thousand games. The countermeasure is **duplicate walls**: one set is four games on the *same* seed (same wall, same deal, same draw order) with the tested AI rotated through all four seats, and both arms use the same set of seeds. Same idea as the paired openings in the shogi harness.

The current M5 gate instrument (`scripts/mahjong-ai-baseline.ts`, one AI against three random players) reports an average placement of 1.02 — but **that instrument cannot measure defence at all**. Random opponents essentially never complete a hand, so folding against them is pure loss. In fact `easy`, which has defence switched off entirely, scores slightly *ahead* of `medium` on the same seed. That is exactly why M7 replaces the instrument. **No A/B results have been produced yet**, so the numbers belong in that post, not this one.

There are three difficulties: `easy` disables defence and picks from the top three discard candidates at random; `medium` is the full policy; `hard` today carries the same policy constants as `medium` and flips to EV push/fold with a single flag once M7's version wins significantly. **Nothing gets promoted to production `hard` until it wins an A/B** — the promotion discipline carried over from shogi unchanged.

---

## 5. What is deliberately not in v1

Stated explicitly so "not implemented yet" can be told apart from "chosen not to implement":

- **Pao** (liability payment for daisangen / daisuushii).
- **Suufon renda, suucha riichi, suukaikan** — the only abortive draw is **kyuushu kyuuhai**.
- **Nagashi mangan**, **kiriage mangan**, **renhou**.
- **Double yakuman** — kokushi 13-wait, suuankou tanki and junsei chuuren are all single yakuman in v1 (`rules.doubleYakuman` is `false`).
- **Kuikae restrictions**, **agari-yame**, **sudden-death extensions** past East 4 / South 4.
- **Online play** and **game-record storage**.

And the big one: **sanma (three-player mahjong)**. That is not a config flag but a genuine rule variant, so it waits until four-player v1 has shipped and then gets its own milestone.

| Item | Four-player | Sanma |
|---|---|---|
| Tiles | 136 | **108** (2m–8m removed, 28 tiles; 1m and 9m stay) |
| Seats | 4 (E/S/W/N) | **3 (E/S/W)** |
| Deal | 13 × 4 = 52 | 13 × 3 = 39 |
| Dead wall | 14, live wall is index 0..121 | 14, **live wall is index 0..93** |
| Chi | Yes | **No** (pon and kan only) |
| North | A guest wind | **A pulled dora** — taken out of the hand, replaced from the dead wall; each one counts as one dora |
| Tsumo payment | Split three ways | **Split two ways** |

The real cost is not the rules but the refactor. `Seat = 0 | 1 | 2 | 3` and four-element tuples `[number, number, number, number]` are baked into `PlayerState`, `RoundResult.scoreDeltas` and `GameState.scores`; **widening those to variable length (`number[]` plus a `seatCount`)** is the bulk of the milestone. `TILE_COUNT` and `DEAD_WALL_START` also stop being constants and become a rules-derived `wallLayout(rules)`.

A nice side effect: changing the tile set makes **some yaku disappear on their own**. With only 1m and 9m present, a manzu chinitsu and a manzu-flavoured junchan become effectively impossible — while kokushi is unaffected, since 1m and 9m are exactly the tiles it wants.

The sanma gate is shaped like the four-player one: all four-player tests stay green, and `mahjong-sim-smoke`'s invariants hold for 5000 sanma hands with zero violations.

---

## Closing

What the shogi work actually taught me was not a technique but a **discipline**. Build the measuring stick first. Record the experiments that failed. Guarantee every time, by reproducing from the same seed, that "the implementation I measured" and "the implementation I shipped" are the same thing. Promote nothing until it clears its gate.

Mahjong changed **where that discipline points**. In shogi the measuring stick was self-play win rate and the investment went into search speed. In mahjong the measuring stick is per-action invariant checking and agreement with a deliberately slow reference, and the investment went into rules correctness. Getting through the whole build without adding a single COOP/COEP header is, I think, evidence that the difference was read correctly.

Next is the duplicate-wall A/B harness, and replacing threshold push/fold with an expected-value comparison. Only if that wins significantly does `hard` actually become stronger than `medium`.
