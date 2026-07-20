# Auditing All 35 Games on My Site — UI Smoothness and AI-Opponent Quality

> The [games collection](https://meetyudai.com/games) on my personal site (meetyudai.com) has grown to 35 titles. I built them one at a time, so I had never once looked across the whole set and asked: is the UI smooth everywhere, and can the AI opponents actually play? This time I audited all 35 games with a combination of hands-on play-testing and systematic code review, then fixed what I found in four separate PRs. This is the work log. Japanese version: [blog-games-ui-bot-audit.md](./blog-games-ui-bot-audit.md).

---

## TL;DR

- **Audited all 35 games along two axes**: (1) hands-on browser play-testing (for the board games I actually played the AI and watched its behavior), and (2) systematic per-category code review run in parallel across four groups — board, card, arcade, and puzzle/simulation.
- The most dramatic find: **Gomoku and Mirror Othello's top difficulties freeze the main thread for up to ~20 seconds per move.** Synchronous alpha-beta search, too deep. Benchmarked: expert ~1.8s, master ~20s. Fixed with **time-budgeted iterative deepening**.
- The most interesting find: **Doubt Word's difficulty ladder was inverted.** Higher-tier AIs doubted even *truthful* claims (suspicion ≈ 0.84 for a typical truth; master doubted truths ~99% of the time), so "just always tell the truth" made the strongest AI destroy itself. Recalibrated suspicion against the truthful-claim baseline.
- Found a family of "displays/advice are backwards" bugs: **Mirror Othello's pass message named the wrong side every time**, **Shichinarabe ranked the first-eliminated player highest among the eliminated**, and **Blackjack advised "Stand" on soft 12** (correct basic strategy: always hit).
- The cross-cutting UI issue was **i18n leakage**: "Game setup" and "Close dialog" hardcoded in shared components, the "W - L - D" stats pill, default player name "You" in Daifugo/Doubt, and **the entire Shogi setup screen in English** — stray English sprinkled through the Japanese UI.
- Arcade issues: **frame-rate-dependent physics** (Chaos Breakout runs 2× speed on a 120Hz display), **blurry canvases on Retina** (no devicePixelRatio scaling), and **Ghost Tetris runs destroyed by switching tabs** (wall-clock fade with no auto-pause).
- Just as important, **I recorded what was already solid**: Daifugo's rule engine (8-giri, revolution, 11-back, shibari — all correct), the math across the probability simulations (Monty Hall, gambler's ruin, UCB1/Thompson bandits — all verified correct), and Bigger Number's game-theoretically optimal fictitious-play AI.

---

## Why

I built these games one at a time. The shogi and Othello AIs got dedicated deep-dives ([Shogi AI rebuild](./blog-shogi-ai-rebuild.en.md), [Othello AI strengthening](./blog-othello-ai.en.md)), but many of the other 33 titles were in "built it, it works, moving on" state. Each game runs. But:

- Do the AI opponents *really* play properly? (Only legal moves? Do they block obvious threats? Do the difficulty tiers actually differ?)
- Does the UI hold up in both Japanese and English?
- I only ever tested on a 60Hz display — what happens at 120Hz, or on Retina?

I had never verified any of this across the whole collection. Time to do it in one sweep.

---

## Approach: hands-on play × systematic review

### Axis 1: browser play-testing

I ran the dev server and actually played the key versus-AI games. Tic-tac-toe: played a full game against the master AI, confirmed perfect blocking and a draw. Gomoku: built open threes and fours and confirmed the AI **blocks correctly while developing its own counter-threats**. Othello and Shogi: verified legal-move hints and response latency. Daifugo: played far enough to watch **11-back correctly invert card strength**.

Play-testing is great for confirming things work, but a 20-second freeze only shows up if you happen to pick the top difficulty, and a 120Hz bug is invisible on 60Hz hardware. Hence axis 2.

### Axis 2: systematic per-category code review

I split the 35 games into four categories (board vs-AI, card vs-AI, arcade, puzzle/simulation) and reviewed each for AI/logic correctness and UI/UX smoothness. The key rule: **no speculative findings.** Every issue had to come with a logic trace of why it's real — and where possible, an actual measured benchmark. That discipline paid off in the fix phase: almost zero "tried to fix it, turned out to be a false positive."

---

## What I found (by severity)

### 1. Top difficulties freeze the UI (Gomoku, Mirror Othello)

Gomoku's expert/master ran a synchronous alpha-beta search inside a `setTimeout` on the main thread. Benchmarked on a realistic mid-game position:

| Difficulty | Think time per move |
|---|---|
| easy | 3ms |
| medium | 20ms |
| hard | 98ms |
| expert | **1,803ms** |
| master | **20,035ms** |

Master froze the page for **20 seconds per move** — even the "thinking" spinner stops, because the main thread is dead. Mirror Othello had the same shape: expert 1.6s, master 22s.

The fix is **time-budgeted search cutoff**. Hard plays strongly in under 100ms, so instead of raising fixed depth, the top tiers now search "as deep as the time budget allows." This is exactly the lesson from the Othello AI article — fixed depth is a trap; time control is the answer — replaying itself.

### 2. Doubt Word's inverted difficulty

Doubt Word's AI computed suspicion from how "rare" a claim's signature was. But most words in the pool have a unique (first letter × length) signature, so **even a truthful claim scored suspicion ≈ 0.84**. Higher tiers react more sharply to suspicion, so master **doubted truthful claims ~99% of the time** — and doubting the truth costs the challenger a life. Playing honestly farmed the strongest AI to death.

Fix: normalize suspicion against the **typical likelihood of a truthful claim** (the pool's median signature plausibility ≈ 0.26), so plausible-if-true claims land near neutral and only genuinely implausible claims spike.

### 3. Backwards displays and backwards advice

- **Mirror Othello's pass message**: the display condition inverted the engine's `passed` semantics ("turn returned to mover" = the *opponent* passed), so it **named the wrong player in every pass case**.
- **Shichinarabe's final ranking**: eliminated players were ranked in elimination order, so the **first player eliminated ranked best** among the eliminated. Surviving longer should rank better.
- **Blackjack soft 12**: A,A with splitting unavailable (4-hand cap etc.) fell through to the hard-12 table and advised **"Stand vs dealer 4-6"**; soft 12 is always a hit in basic strategy.
- **Gambler's Ruin capped runs**: a run stopped at the 5,000-step cap displayed as **"🏆 target reached"** when the bankroll never reached the target.

### 4. Exploitable card-game AI patterns

- **Doubt**: hard/expert **deterministically dumped their entire hand as one claim** whenever they held ≤4 cards with a small pile — no truth check, no randomness. Hand counts are visible in the UI, so a human can simply doubt every ≤4-card claim and win. Now gated behind probability and a near-truthful condition.
- **Shichinarabe**: the AI's "keep a pass in reserve" logic was off by one — elimination fires at `passCount >= maxPasses` but the guard was `passesLeft <= 1`, so **the reserved last pass was itself the eliminating one**. The smarter tiers were the most suicidal.

### 5. Arcade smoothness

- **Chaos Breakout**: the game loop had no delta-time handling — **everything runs 2× speed on a 120Hz display** (the config even documented its timers in "frames at 60fps"). Added rAF-timestamp dt normalization.
- **Retina blur**: 4 of 5 canvas games ignored devicePixelRatio, rendering soft and blurry on high-DPI screens. The repo already contained the correct pattern (ReverseJump) — rolled it out to the rest.
- **Ghost Tetris**: a memory game where locked blocks fade — but the fade ran on wall-clock time with no auto-pause, so **switching tabs for 30 seconds wiped the board and often ended the run**. Added a visibilitychange auto-pause.
- **Space Invaders**: a global key handler swallowed a/d/w/space **while typing in the multiplayer lobby text inputs** — pressing space mid-name-entry yanked you into a single-player game.

### 6. i18n leakage (cross-cutting)

English kept leaking into the Japanese UI. The emblematic cases were in shared components: the difficulty screen's "Game setup" kicker, the modal's "Close dialog" aria-label, the "W - L - D" stats pill. Per-game: Daifugo/Doubt pre-filled the player name as "You", Shichinarabe surfaced raw "Not your turn" errors, and **the Shogi setup screen was entirely English** — title, description, and all five difficulty labels ("Shogi Improved" / "Choose engine strength" / "Level 1 (Easy)"). All fixed through each game's existing i18n mechanism, in both languages.

---

## What was already solid (the praise log)

An audit hunts for problems, but "no problem found" results deserve equal weight in the record:

- **Daifugo's rule engine**: 8-giri, revolution, 11-back, shibari, geki-shibari, 7-watashi, 10-sute, forbidden finishes, miyako-ochi, card exchange — all correctly implemented. I could not construct an illegal-play scenario.
- **The probability/simulation math**: generalized Monty Hall (N-1)/(N(N-2)), the birthday-paradox product formula, coupon-collector mean/variance, ruin probability with overflow-safe rewrites for r>1, the secretary problem's O(n) sweep, UCB1/Thompson/Wilson intervals, Beta CDF via Lentz continued fractions — verified, all correct.
- **Bigger Number's AI** actually **solves the zero-sum matrix game with fictitious play** (hand contents are public information in this game, so it's not cheating). Game-theoretically unexploitable. Absurd overkill for a minigame; I love it.
- **Tic-tac-toe**: master is a genuine perfect minimax (65ms worst case) with a well-tuned blunder ladder below it.
- **Turn hygiene**: the card games' AI-turn timers were correctly guarded against StrictMode double-fires and unmount leaks across the board.

---

## How the fixes were split into PRs

Four PRs, each independently reviewable and revertable:

1. **AI quality & correctness** (7 games, [#534](https://github.com/gomyway1216/nextjs-portfolio/pull/534)): the two freezes, Doubt Word recalibration, the Doubt exploit, both Shichinarabe issues, Blackjack soft 12, the Gambler's Ruin banner.
2. **i18n/UX** ([#535](https://github.com/gomyway1216/nextjs-portfolio/pull/535)): the three shared-component leaks, Japanese localization of the Shogi setup screen, default names and error strings.
3. **Arcade smoothness** ([#537](https://github.com/gomyway1216/nextjs-portfolio/pull/537)): delta-time, DPR scaling, visibility pause, input-handler fixes.
4. **Puzzle input & purity** ([#536](https://github.com/gomyway1216/nextjs-portfolio/pull/536)): Memory Battle's key mapping, StrictMode double-counting, constraining the IQ-test generator so "odd one out" questions have exactly one defensible answer.

Each merged only after existing unit tests plus new ones (under `tests/unit/**`) confirmed no regressions.

---

## Lessons

- **Building games one at a time and auditing across them are different activities.** Every game individually "worked." Only the cross-cutting view revealed that shared-component English leaked into every game, that the same dt-normalization bug existed in multiple games, and that the repo already contained the correct patterns (ReverseJump's DPR handling, TimedButton's key guards) that sibling games simply weren't using.
- **Before an AI is "strong," it must be "not broken."** A master that freezes for 20 seconds, a master that doubts every truth — both meant the highest setting was effectively the weakest. The top of a difficulty ladder is where implementation cracks show first.
- **Demanding measurements from review massively improves its precision.** Not "this looks slow" but "measured 20,035ms"; not "this seems suspicious" but "computed suspicion is 0.84." Near-zero wasted work in the fix phase because of it.
- **Recording what's already good sets the baseline for the next audit.** The Daifugo engine and the probability math now carry a "verified" label — next time, I can skip them.
