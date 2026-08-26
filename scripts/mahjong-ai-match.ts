/**
 * Riichi Mahjong — M7 duplicate-wall A/B harness.
 *
 * This is the instrument the whole strengthening loop hangs off, and it exists
 * because `scripts/mahjong-ai-baseline.ts` structurally cannot measure the
 * thing M7 wants to change. The baseline seats one AI against three uniform
 * random players; random players never reach tenpai on purpose and almost
 * never ron, so *folding is pure loss* against them. The M5 numbers say it out
 * loud: `easy` (defence disabled) scored 1.0100 average placement and `medium`
 * (defence on) scored 1.0333. A harness in which the correct defensive policy
 * scores worse than no defence at all cannot be used to tune defence.
 *
 * The fix is the mahjong equivalent of the shogi paired-opening harness.
 *
 * ## Duplicate walls and seat rotation
 *
 * One **set** is four games played on the *same* wall — same shuffle, same
 * deal, same draw order — with the A arm rotated through seats 0, 1, 2, 3 and
 * the B arm in the other three seats each time. Every dealt hand in the set is
 * therefore played once by A and three times by B, and A is the dealer in
 * exactly one of the four games. Wall luck and seat luck, which dominate the
 * variance of a mahjong result, are shared between the arms instead of being
 * sampled independently.
 *
 * The wall stream is kept **strictly separate** from every other source of
 * randomness (`wallRng` is passed to `startGame`/`advanceHand` and to nothing
 * else), so the k-th hand of a game always uses the k-th wall of the seed no
 * matter how the play diverged. Decisions do not draw from that stream at all:
 * each decision derives its own RNG from a pure function of
 * `(seed, hand, ply, seat, salt)`, so a policy that consults its RNG (only
 * `easy` does) sees the identical stream in every rotation. Common random
 * numbers, in the variance-reduction sense.
 *
 * A consequence worth knowing before reading an A-vs-A run: when both arms
 * resolve to the same deterministic policy, all four games of a set are the
 * same game with the seats relabelled, so A's placements are exactly
 * `{1,2,3,4}` and the paired difference is **exactly zero** on every set. That
 * is a stronger statement than "not significant", and it is asserted in
 * `tests/unit/components/game/Mahjong/match.test.ts`. For a genuine random
 * null, salt the A arm's decision stream with `--aa-salt=<s>` and use a
 * stochastic policy (`easy`).
 *
 * ## Statistics
 *
 * The unit of analysis is the set, not the game. For set `i`,
 *
 *     d_i = mean placement of A over its 4 games
 *         − mean placement of B over its 12 seat-games
 *
 * and the report is a two-sided one-sample t-test on `d` (equivalently a
 * paired t-test, which is what it is). Lower placement is better, so the gate
 * wants `mean(d) < 0` with `p < 0.05`.
 *
 * The same run also reports the **unblocked** standard error: the identical
 * estimand and the identical A-games, analysed one game at a time instead of
 * one set at a time (see {@link perGameContrast}). The ratio of the two is
 * exactly what the duplicate wall and the rotation bought, and it is not
 * assumed — it is measured, and it depends on how far apart the two arms play.
 * The t-tests (Student, Welch) are implemented inline in § "Statistics" below;
 * this repository adds no dependency for a t-test.
 *
 * ## Usage
 *
 *     node -r tsx/cjs scripts/mahjong-ai-match.ts --a=hard-ev --b=medium \
 *       --sets=500 --seed=20260826
 *     node -r tsx/cjs scripts/mahjong-ai-match.ts --a=easy --b=easy \
 *       --sets=300 --seed=1 --aa-salt=aa      # the random null control
 *     node -r tsx/cjs scripts/mahjong-ai-match.ts --a=medium \
 *       --sets=400 --seed=99 --ev-log=docs/data/mahjong-ev-tables-v1-source.json
 *
 * Flags: `--a` / `--b` (arm specs), `--sets`, `--seed`, `--length`,
 * `--json=<path>` (`none` to skip), `--jobs=N` (fan out over N child
 * processes), `--ev-log=<path>`, `--aa-salt=<s>`, `--quiet`.
 *
 * `--ev-log` switches the run into **self-play collection**: arm A sits in all
 * four seats and `--sets` × 4 *independent* games are played with no rotation,
 * because a duplicate set of a deterministic policy against itself is the same
 * game four times over and would quadruple the row count without adding a
 * single independent observation. The output is the counts `ai/evTables.ts` is
 * written from, not an A/B result.
 *
 * ## Adding an arm
 *
 * An arm spec is either one of the built-in names in {@link NAMED_ARMS}
 * (`easy`, `medium`, `hard`, `expert`, `master`, `hard-ev`) or a path to a
 * JSON file holding an {@link AiPolicy} — `{"useDefence":true,
 * "discardRandomTop":1,"useEvPushFold":true}`. Built-in names that are plain
 * difficulties go through `chooseActionSync`, i.e. the exact call the game
 * makes; policy arms go through `chooseActionWithPolicy`, which is the
 * function `chooseActionSync` reaches once the difficulty has been resolved
 * (the worker RPC carries a `Difficulty` string and cannot express an ad-hoc
 * policy). The two paths are asserted equivalent in the unit test. To add a
 * permanent arm, add an entry to {@link NAMED_ARMS}.
 *
 * `package.json` is byte-sealed for this repository, so there is deliberately
 * no npm script wrapper — the convention `mahjong-sim-smoke.ts` and
 * `mahjong-ai-baseline.ts` already follow.
 */

import { fork } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import type { Difficulty } from '../src/components/game/common/types';
import {
  chooseActionWithPolicy,
  estimateHan,
  policyFor,
  EASY_POLICY,
  HARD_POLICY,
  MEDIUM_POLICY,
  type AiPolicy,
} from '../src/components/game/Mahjong/ai/heuristicAI';
import {
  createSafetyContext,
  threatSeats,
  weightedDangerIn,
} from '../src/components/game/Mahjong/ai/safety';
import {
  advanceHand,
  applyAction,
  currentActors,
  startGame,
} from '../src/components/game/Mahjong/engine/gameState';
import { createRng } from '../src/components/game/Mahjong/engine/random';
import { DEFAULT_RULES, HANCHAN_RULES } from '../src/components/game/Mahjong/engine/rules';
import { shanten } from '../src/components/game/Mahjong/engine/shanten';
import { kindOf, tilesToCounts } from '../src/components/game/Mahjong/engine/tiles';
import {
  SEATS,
  type Action,
  type GameLength,
  type GameState,
  type RoundState,
  type Rules,
  type Seat,
} from '../src/components/game/Mahjong/engine/types';
import { chooseActionSync } from '../src/components/game/Mahjong/mahjongAiWorkerClient';

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Hard stop per hand; a real hand never needs anywhere near this many plies. */
const MAX_ACTIONS_PER_HAND = 2000;
/** Hard stop per game. Dealer repeats are unbounded in v1 (no agari-yame). */
const MAX_HANDS_PER_GAME = 60;
/** Games in one duplicate set: one per seat the A arm rotates through. */
export const GAMES_PER_SET = 4;

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

/**
 * One side of the comparison.
 *
 * `difficulty` is non-null only for arms that are exactly a shipped difficulty
 * level; those take the production `chooseActionSync` path so the harness is
 * demonstrably measuring what the game plays.
 */
export interface Arm {
  name: string;
  difficulty: Difficulty | null;
  policy: AiPolicy;
}

function difficultyArm(difficulty: Difficulty): Arm {
  return { name: difficulty, difficulty, policy: policyFor(difficulty) };
}

/** The built-in arm names. Add a permanent arm here, not at a call site. */
export const NAMED_ARMS: Readonly<Record<string, () => Arm>> = {
  easy: () => difficultyArm('easy'),
  medium: () => difficultyArm('medium'),
  hard: () => difficultyArm('hard'),
  expert: () => difficultyArm('expert'),
  master: () => difficultyArm('master'),
  /**
   * `hard` with the M7 EV push/fold forced on, so the candidate can be played
   * against the shipped policy *before* `HARD_POLICY` is promoted. Once the EV
   * arm wins its gate and `HARD_POLICY.useEvPushFold` flips, `hard` and
   * `hard-ev` become the same arm — which is the promotion, and which is why
   * the plan JSON records the policy objects and not just the names.
   */
  'hard-ev': () => ({
    name: 'hard-ev',
    difficulty: null,
    policy: { ...HARD_POLICY, useEvPushFold: true },
  }),
};

function isAiPolicy(value: unknown): value is AiPolicy {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.useDefence === 'boolean' &&
    typeof candidate.discardRandomTop === 'number' &&
    typeof candidate.useEvPushFold === 'boolean'
  );
}

/** Resolve an arm spec: a built-in name, or a path to a JSON {@link AiPolicy}. */
export function resolveArm(spec: string): Arm {
  const builtin = NAMED_ARMS[spec];
  if (builtin !== undefined) return builtin();

  let raw: string;
  try {
    raw = fs.readFileSync(spec, 'utf8');
  } catch {
    throw new Error(
      `Unknown arm "${spec}" — expected one of ${Object.keys(NAMED_ARMS).join('|')} ` +
        'or the path to a JSON policy file',
    );
  }
  const parsed: unknown = JSON.parse(raw);
  if (!isAiPolicy(parsed)) {
    throw new Error(
      `${spec} is not an AiPolicy — need {useDefence, discardRandomTop, useEvPushFold}`,
    );
  }
  return { name: path.basename(spec, '.json'), difficulty: null, policy: parsed };
}

// A sanity check on the built-in table: `easy`/`medium`/`hard` must still be
// exactly the shipped policies, or the harness is measuring something the game
// does not play.
const BUILTIN_POLICY_CHECK: readonly [string, AiPolicy][] = [
  ['easy', EASY_POLICY],
  ['medium', MEDIUM_POLICY],
  ['hard', HARD_POLICY],
];
for (const [name, expected] of BUILTIN_POLICY_CHECK) {
  const resolved = NAMED_ARMS[name]().policy;
  if (resolved !== expected) {
    throw new Error(`arm ${name} no longer resolves to the shipped policy`);
  }
}

// ---------------------------------------------------------------------------
// Per-seat accounting
// ---------------------------------------------------------------------------

export interface SeatStats {
  /** Hands the seat sat through. */
  hands: number;
  /** Hands the seat won (tsumo or ron). */
  wins: number;
  /** Points the winning hands were worth, honba and sticks excluded. */
  winPoints: number;
  /** Hands the seat paid a ron. */
  dealIns: number;
  /** Points those rons were worth. */
  dealInPoints: number;
  /** Hands the seat declared riichi in. */
  riichi: number;
  /** Hands the seat made at least one open call in. */
  calls: number;
  decisions: number;
  decisionMs: number;
}

function emptySeatStats(): SeatStats {
  return {
    hands: 0,
    wins: 0,
    winPoints: 0,
    dealIns: 0,
    dealInPoints: 0,
    riichi: 0,
    calls: 0,
    decisions: 0,
    decisionMs: 0,
  };
}

function addSeatStats(target: SeatStats, source: SeatStats): void {
  target.hands += source.hands;
  target.wins += source.wins;
  target.winPoints += source.winPoints;
  target.dealIns += source.dealIns;
  target.dealInPoints += source.dealInPoints;
  target.riichi += source.riichi;
  target.calls += source.calls;
  target.decisions += source.decisions;
  target.decisionMs += source.decisionMs;
}

/** The reported diagnostics for one arm. */
export interface ArmMetrics {
  seatGames: number;
  seatHands: number;
  /** Placement counts, index 0 = first place. */
  placements: [number, number, number, number];
  averagePlacement: number;
  averageScore: number;
  winRate: number;
  dealInRate: number;
  riichiRate: number;
  callRate: number;
  averageWinValue: number;
  averageDealInValue: number;
  decisions: number;
  msPerDecision: number;
}

// ---------------------------------------------------------------------------
// EV table collection
// ---------------------------------------------------------------------------

/** Turn buckets (own discard index, capped) in the win-probability table. */
export const EV_TURN_BUCKETS = 18;
/** Shanten buckets (capped) in the win-probability table. */
export const EV_SHANTEN_BUCKETS = 7;
/** Danger buckets: `floor(weightedDanger)` capped, so 0 is genbutsu-safe. */
export const EV_DANGER_BUCKETS = 13;
/** Estimated-han buckets in the win-value table. */
export const EV_HAN_BUCKETS = 14;

const THREAT_KEYS = ['none', 'riichi', 'melds', 'yakuhai', 'flush'] as const;
type ThreatKey = (typeof THREAT_KEYS)[number];

/**
 * Counters for the two tables §M7 names, plus the two expectations the EV
 * comparison needs to put them on the same scale.
 *
 * Everything here is measured at a **discard decision**, from features the
 * policy itself can see at that moment, and resolved when the hand ends.
 */
export interface EvCounters {
  hands: number;
  discards: number;
  /** Decisions at (turn, shanten-after-discard). */
  winTrials: number[][];
  /** …of which the seat went on to win the hand. */
  winHits: number[][];
  /** Discards at danger band `b`, made while at least one threat was live. */
  dangerTrials: number[];
  /** …of which that exact discard was ronned. */
  dangerHits: number[];
  /** Further discards the seat still made in the hand, summed by turn. */
  pushTrials: number[];
  pushRemaining: number[];
  /** Wins by estimated han at the decision, and the points they were worth. */
  valueTrials: number[];
  valuePoints: number[];
  /** Deal-ins by strongest live threat reason, and the points they cost. */
  costTrials: Record<ThreatKey, number>;
  costPoints: Record<ThreatKey, number>;
}

function zeros(n: number): number[] {
  return Array.from({ length: n }, () => 0);
}

function zeroGrid(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => zeros(cols));
}

export function emptyEvCounters(): EvCounters {
  return {
    hands: 0,
    discards: 0,
    winTrials: zeroGrid(EV_TURN_BUCKETS, EV_SHANTEN_BUCKETS),
    winHits: zeroGrid(EV_TURN_BUCKETS, EV_SHANTEN_BUCKETS),
    dangerTrials: zeros(EV_DANGER_BUCKETS),
    dangerHits: zeros(EV_DANGER_BUCKETS),
    pushTrials: zeros(EV_TURN_BUCKETS),
    pushRemaining: zeros(EV_TURN_BUCKETS),
    valueTrials: zeros(EV_HAN_BUCKETS),
    valuePoints: zeros(EV_HAN_BUCKETS),
    costTrials: { none: 0, riichi: 0, melds: 0, yakuhai: 0, flush: 0 },
    costPoints: { none: 0, riichi: 0, melds: 0, yakuhai: 0, flush: 0 },
  };
}

/** One discard decision, held until the hand resolves it. */
interface EvRow {
  seat: Seat;
  turn: number;
  shantenAfter: number;
  han: number;
  dangerBand: number;
  threat: ThreatKey;
  hadThreat: boolean;
  tile: number;
  /** Discards this seat still made in the hand after this one. */
  laterDiscards: number;
}

function bucket(value: number, size: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(size - 1, Math.floor(value));
}

// ---------------------------------------------------------------------------
// One game
// ---------------------------------------------------------------------------

export interface GameOptions {
  rules: Rules;
  /** Seeds the wall stream, and nothing else. */
  wallSeed: string;
  /** Policy by absolute seat. */
  policies: readonly [Arm, Arm, Arm, Arm];
  /** Mixed into the per-decision seed, by absolute seat. `''` for none. */
  salts: readonly [string, string, string, string];
  /** Collect EV-table rows while playing. */
  ev: EvCounters | null;
  /** Called once with each freshly dealt round, before any action. */
  observe?: (round: RoundState, handOrdinal: number) => void;
}

export interface GameOutcome {
  /** Finishing place `1..4` by absolute seat. */
  places: [number, number, number, number];
  scores: [number, number, number, number];
  stats: [SeatStats, SeatStats, SeatStats, SeatStats];
  hands: number;
}

function decide(arm: Arm, state: RoundState, seat: Seat, seed: string): Action {
  if (arm.difficulty !== null) {
    return chooseActionSync({ state, seat, difficulty: arm.difficulty, seed });
  }
  return chooseActionWithPolicy(state, seat, arm.policy, createRng(seed));
}

/**
 * Features of a discard the EV tables are estimated from, read from the state
 * the policy saw and *before* the discard is applied.
 */
function evFeaturesFor(state: RoundState, seat: Seat, tile: number): Omit<EvRow, 'laterDiscards'> {
  const player = state.players[seat];
  const ctx = createSafetyContext(state, seat);
  const threats = threatSeats(state, seat);
  const kind = kindOf(tile);

  const counts = tilesToCounts(player.hand);
  counts[kind] -= 1;
  const shantenAfter = shanten(counts, player.melds.length);

  const danger = weightedDangerIn(ctx, kind, threats);
  const strongest = threats.length === 0 ? null : threats[0].reason;
  return {
    seat,
    turn: bucket(player.discards.length, EV_TURN_BUCKETS),
    shantenAfter: bucket(shantenAfter, EV_SHANTEN_BUCKETS),
    han: bucket(estimateHan(state, seat, ctx), EV_HAN_BUCKETS),
    dangerBand: bucket(danger, EV_DANGER_BUCKETS),
    threat: strongest === null ? 'none' : strongest,
    hadThreat: threats.length > 0,
    tile,
  };
}

/** Fold the finished hand's EV rows into the counters. */
function resolveEvRows(round: RoundState, rows: EvRow[], ev: EvCounters): void {
  const result = round.result;
  const won = new Set<Seat>();
  const winPoints = new Map<Seat, number>();
  const dealInTile = new Map<Seat, { tile: number; points: number }>();
  if (result !== null) {
    for (const agari of result.agari) {
      won.add(agari.winner);
      winPoints.set(agari.winner, (winPoints.get(agari.winner) ?? 0) + agari.value.points);
      if (agari.loser !== null) {
        dealInTile.set(agari.loser, { tile: agari.winTile, points: agari.value.points });
      }
    }
  }

  ev.hands += 1;
  for (const row of rows) {
    ev.discards += 1;
    ev.winTrials[row.turn][row.shantenAfter] += 1;
    ev.pushTrials[row.turn] += 1;
    ev.pushRemaining[row.turn] += row.laterDiscards;
    if (won.has(row.seat)) {
      ev.winHits[row.turn][row.shantenAfter] += 1;
      ev.valueTrials[row.han] += 1;
      ev.valuePoints[row.han] += winPoints.get(row.seat) ?? 0;
    }
    if (row.hadThreat) {
      ev.dangerTrials[row.dangerBand] += 1;
      const dealt = dealInTile.get(row.seat);
      if (dealt !== undefined && dealt.tile === row.tile) {
        ev.dangerHits[row.dangerBand] += 1;
        ev.costTrials[row.threat] += 1;
        ev.costPoints[row.threat] += dealt.points;
      }
    }
  }
}

function playHand(
  round: RoundState,
  handOrdinal: number,
  options: GameOptions,
  stats: [SeatStats, SeatStats, SeatStats, SeatStats],
): void {
  const called = [false, false, false, false];
  const rows: EvRow[] = [];
  const discardCount = [0, 0, 0, 0];
  let plies = 0;

  while (round.phase !== 'ended') {
    plies += 1;
    if (plies > MAX_ACTIONS_PER_HAND) {
      throw new Error(`hand did not finish within ${MAX_ACTIONS_PER_HAND} actions`);
    }
    const actors = currentActors(round);
    if (actors.length === 0) throw new Error(`no actor in phase ${round.phase}`);
    // Deterministic on purpose: claims are ranked by the engine, not resolved
    // first-come, so asking the pending seats in seat order changes nothing
    // about the outcome and keeps a set byte-reproducible.
    const seat = actors[0];

    const seed = `${options.wallSeed}|${handOrdinal}|${plies}|${seat}|${options.salts[seat]}`;
    const started = process.hrtime.bigint();
    const action = decide(options.policies[seat], round, seat, seed);
    stats[seat].decisionMs += Number(process.hrtime.bigint() - started) / 1e6;
    stats[seat].decisions += 1;

    if (action.type === 'chi' || action.type === 'pon' || action.type === 'minkan') {
      called[seat] = true;
    }
    if (action.type === 'discard') {
      discardCount[seat] += 1;
      if (options.ev !== null) {
        rows.push({ ...evFeaturesFor(round, seat, action.tile), laterDiscards: 0 });
      }
    }
    applyAction(round, action);
  }

  if (options.ev !== null) {
    const seen = [0, 0, 0, 0];
    for (const row of rows) {
      seen[row.seat] += 1;
      row.laterDiscards = discardCount[row.seat] - seen[row.seat];
    }
    resolveEvRows(round, rows, options.ev);
  }

  const result = round.result;
  for (const seat of SEATS) {
    stats[seat].hands += 1;
    if (called[seat]) stats[seat].calls += 1;
    if (round.players[seat].riichi !== null) stats[seat].riichi += 1;
  }
  if (result !== null) {
    for (const agari of result.agari) {
      stats[agari.winner].wins += 1;
      stats[agari.winner].winPoints += agari.value.points;
      if (agari.loser !== null) {
        stats[agari.loser].dealIns += 1;
        stats[agari.loser].dealInPoints += agari.value.points;
      }
    }
  }
}

/** Play one whole game (tonpuu or hanchan) on the wall named by `wallSeed`. */
export function playGame(options: GameOptions): GameOutcome {
  const wallRng = createRng(options.wallSeed);
  const stats: [SeatStats, SeatStats, SeatStats, SeatStats] = [
    emptySeatStats(),
    emptySeatStats(),
    emptySeatStats(),
    emptySeatStats(),
  ];

  let game: GameState = startGame({ rules: options.rules, rng: wallRng });
  let handOrdinal = 0;
  while (!game.finished) {
    const round = game.round;
    if (round === null) throw new Error('game has no round to play');
    if (handOrdinal >= MAX_HANDS_PER_GAME) {
      throw new Error(`game did not finish within ${MAX_HANDS_PER_GAME} hands`);
    }
    options.observe?.(round, handOrdinal);
    try {
      playHand(round, handOrdinal, options, stats);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`wall ${options.wallSeed}, hand ${handOrdinal + 1}: ${message}`);
    }
    handOrdinal += 1;
    game = advanceHand(game, wallRng);
  }

  const placements = game.placements;
  if (placements === null) throw new Error('game finished without placements');
  const places = [0, 0, 0, 0] as [number, number, number, number];
  for (const seat of SEATS) places[seat] = placements.indexOf(seat) + 1;

  return { places, scores: game.scores, stats, hands: handOrdinal };
}

// ---------------------------------------------------------------------------
// One set: the same wall, four seat rotations
// ---------------------------------------------------------------------------

export interface SetRecord {
  seed: string;
  /** A's finishing place in rotation `r` (A sits in seat `r`). */
  placesA: [number, number, number, number];
  /** A's final score in each rotation. */
  scoresA: [number, number, number, number];
  /** Every place B took, twelve of them. */
  placesB: number[];
  scoresB: number[];
  meanA: number;
  meanB: number;
  /** `meanA - meanB`. Negative is A playing better. */
  diff: number;
  statsA: SeatStats;
  statsB: SeatStats;
  hands: number;
}

export interface SetOptions {
  a: Arm;
  b: Arm;
  rules: Rules;
  seed: string;
  /** Mixed into the A arm's decision seeds only. Turns A-vs-A into a real null. */
  aaSalt: string;
  observe?: (round: RoundState, handOrdinal: number, rotation: number) => void;
}

/** Play the four duplicate games of one set. */
export function playSet(options: SetOptions): SetRecord {
  const placesA = [0, 0, 0, 0] as [number, number, number, number];
  const scoresA = [0, 0, 0, 0] as [number, number, number, number];
  const placesB: number[] = [];
  const scoresB: number[] = [];
  const statsA = emptySeatStats();
  const statsB = emptySeatStats();
  let hands = 0;

  for (let rotation = 0; rotation < GAMES_PER_SET; rotation += 1) {
    const seatOfA = rotation as Seat;
    const policies = SEATS.map((seat) => (seat === seatOfA ? options.a : options.b)) as unknown as [
      Arm,
      Arm,
      Arm,
      Arm,
    ];
    const salts = SEATS.map((seat) =>
      seat === seatOfA ? options.aaSalt : '',
    ) as unknown as [string, string, string, string];

    const outcome = playGame({
      rules: options.rules,
      wallSeed: options.seed,
      policies,
      salts,
      // EV collection is a separate mode: see `collectEvTables`, which plays
      // independent games rather than duplicated ones.
      ev: null,
      observe:
        options.observe === undefined
          ? undefined
          : (round, handOrdinal) => options.observe?.(round, handOrdinal, rotation),
    });

    placesA[rotation] = outcome.places[seatOfA];
    scoresA[rotation] = outcome.scores[seatOfA];
    addSeatStats(statsA, outcome.stats[seatOfA]);
    for (const seat of SEATS) {
      if (seat === seatOfA) continue;
      placesB.push(outcome.places[seat]);
      scoresB.push(outcome.scores[seat]);
      addSeatStats(statsB, outcome.stats[seat]);
    }
    hands += outcome.hands;
  }

  const meanA = mean(placesA);
  const meanB = mean(placesB);
  return {
    seed: options.seed,
    placesA,
    scoresA,
    placesB,
    scoresB,
    meanA,
    meanB,
    diff: meanA - meanB,
    statsA,
    statsB,
    hands,
  };
}

// ---------------------------------------------------------------------------
// Statistics — implemented here on purpose; no dependency is added for a t-test
// ---------------------------------------------------------------------------

export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let total = 0;
  for (const value of values) total += value;
  return total / values.length;
}

/** Sample variance (Bessel-corrected). `0` for fewer than two observations. */
export function variance(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  let total = 0;
  for (const value of values) total += (value - m) * (value - m);
  return total / (values.length - 1);
}

/** Lanczos log-gamma, accurate to ~15 digits over the range used here. */
function lnGamma(x: number): number {
  const coefficients = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let series = 1.000000000190015;
  for (const coefficient of coefficients) {
    y += 1;
    series += coefficient / y;
  }
  return -tmp + Math.log((2.5066282746310005 * series) / x);
}

/** Continued fraction for the incomplete beta (Numerical Recipes §6.4). */
function betaContinuedFraction(a: number, b: number, x: number): number {
  const tiny = 1e-30;
  const epsilon = 3e-14;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;

  for (let m = 1; m <= 300; m += 1) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

/** Regularized incomplete beta `I_x(a, b)`. */
export function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(a, b, x)) / a
    : 1 - (front * betaContinuedFraction(b, a, 1 - x)) / b;
}

/**
 * Two-sided p-value of Student's `t` on `df` degrees of freedom.
 *
 * `P(|T| > |t|) = I_{df/(df+t^2)}(df/2, 1/2)`, which is exact rather than a
 * normal approximation — at 300 sets the difference is small but the harness
 * is also run at 50 sets while iterating, where it is not.
 */
export function studentTwoSidedP(t: number, df: number): number {
  if (df <= 0) return 1;
  if (!Number.isFinite(t)) return 0;
  if (t === 0) return 1;
  return incompleteBeta(df / 2, 0.5, df / (df + t * t));
}

export interface TTest {
  /** Estimated difference (A − B). */
  estimate: number;
  standardError: number;
  t: number;
  df: number;
  p: number;
  /** 95% interval, normal-approximated at the reported standard error. */
  ci95: [number, number];
  n: number;
}

/** One-sample (equivalently paired) two-sided t-test on the differences. */
export function pairedTTest(differences: readonly number[]): TTest {
  const n = differences.length;
  const estimate = mean(differences);
  const sd = Math.sqrt(variance(differences));
  const standardError = n === 0 ? 0 : sd / Math.sqrt(n);
  const df = n - 1;
  // Every difference identical: either exactly the null (p = 1) or a
  // degenerate non-zero constant, which no finite sample can call.
  const t = standardError === 0 ? 0 : estimate / standardError;
  return {
    estimate,
    standardError,
    t,
    df,
    p: studentTwoSidedP(t, df),
    ci95: [estimate - 1.96 * standardError, estimate + 1.96 * standardError],
    n,
  };
}

/** Welch's unequal-variance t-test, used for the unpaired comparison. */
export function welchTTest(a: readonly number[], b: readonly number[]): TTest {
  const na = a.length;
  const nb = b.length;
  const va = variance(a);
  const vb = variance(b);
  const estimate = mean(a) - mean(b);
  const sa = na === 0 ? 0 : va / na;
  const sb = nb === 0 ? 0 : vb / nb;
  const standardError = Math.sqrt(sa + sb);
  const denominator =
    (na > 1 ? (sa * sa) / (na - 1) : 0) + (nb > 1 ? (sb * sb) / (nb - 1) : 0);
  const df = denominator === 0 ? 0 : ((sa + sb) * (sa + sb)) / denominator;
  const t = standardError === 0 ? 0 : estimate / standardError;
  return {
    estimate,
    standardError,
    t,
    df,
    p: studentTwoSidedP(t, df),
    ci95: [estimate - 1.96 * standardError, estimate + 1.96 * standardError],
    n: Math.min(na, nb),
  };
}

// ---------------------------------------------------------------------------
// The match
// ---------------------------------------------------------------------------

export interface MatchOptions {
  a: Arm;
  b: Arm;
  sets: number;
  seed: number | string;
  length: GameLength;
  aaSalt: string;
  /** Called after each finished set; used by the CLI progress line. */
  onSet?: (index: number, record: SetRecord) => void;
}

export interface MatchResult {
  arms: { a: Arm; b: Arm };
  sets: number;
  seed: string;
  length: GameLength;
  aaSalt: string;
  seeds: { first: string; last: string; count: number };
  games: number;
  hands: number;
  decisions: number;
  decisionMs: number;
  elapsedMs: number;
  metrics: { a: ArmMetrics; b: ArmMetrics };
  /** The gate's test: one duplicate set is one observation. */
  paired: TTest;
  /** The same estimand with no blocking: one game is one observation. */
  unblocked: TTest;
  /** Welch on A's and B's placements. Dependent samples — reported, never used. */
  naiveTwoSample: TTest;
  variance: {
    pairedStandardError: number;
    unblockedStandardError: number;
    /** How many times narrower the blocked interval is. */
    standardErrorRatio: number;
    /** Squared: the factor by which an unblocked run would need more games. */
    effectiveSampleMultiplier: number;
  };
  gate: {
    metric: 'averagePlacement';
    direction: 'lower-is-better';
    alpha: number;
    improved: boolean;
    significant: boolean;
    met: boolean;
    verdict: string;
  };
  records: SetRecord[];
}

/** Seats the B arm holds in one game. */
export const B_SEATS_PER_GAME = GAMES_PER_SET - 1;

/**
 * The single-game version of the paired contrast.
 *
 * The four placements of a game always sum to `10`, so the three B seats
 * average `(10 - place) / 3` and the contrast "A minus B" for that one game is
 * `place - (10 - place) / 3 = (place - 2.5) * 4 / 3`. Averaging it over a set's
 * four games reproduces {@link SetRecord.diff} exactly, which is why the
 * blocked and unblocked analyses share a point estimate and differ only in
 * their standard error.
 */
export function perGameContrast(place: number): number {
  return ((place - 2.5) * GAMES_PER_SET) / B_SEATS_PER_GAME;
}

/** The seed of set `index` under `seed`. Pure, so shards agree without talking. */
export function setSeed(seed: number | string, index: number): string {
  return `${seed}#${index}`;
}

function metricsFor(
  stats: SeatStats,
  places: readonly number[],
  scores: readonly number[],
): ArmMetrics {
  const placements: [number, number, number, number] = [0, 0, 0, 0];
  for (const place of places) placements[place - 1] += 1;
  const hands = Math.max(1, stats.hands);
  return {
    seatGames: places.length,
    seatHands: stats.hands,
    placements,
    averagePlacement: mean(places),
    averageScore: mean(scores),
    winRate: stats.wins / hands,
    dealInRate: stats.dealIns / hands,
    riichiRate: stats.riichi / hands,
    callRate: stats.calls / hands,
    averageWinValue: stats.wins === 0 ? 0 : stats.winPoints / stats.wins,
    averageDealInValue: stats.dealIns === 0 ? 0 : stats.dealInPoints / stats.dealIns,
    decisions: stats.decisions,
    msPerDecision: stats.decisions === 0 ? 0 : stats.decisionMs / stats.decisions,
  };
}

/** Assemble a {@link MatchResult} from finished set records. */
export function summarize(
  options: MatchOptions,
  records: readonly SetRecord[],
  elapsedMs: number,
): MatchResult {
  const statsA = emptySeatStats();
  const statsB = emptySeatStats();
  const placesA: number[] = [];
  const placesB: number[] = [];
  const scoresA: number[] = [];
  const scoresB: number[] = [];
  const diffs: number[] = [];
  let hands = 0;

  for (const record of records) {
    addSeatStats(statsA, record.statsA);
    addSeatStats(statsB, record.statsB);
    placesA.push(...record.placesA);
    placesB.push(...record.placesB);
    scoresA.push(...record.scoresA);
    scoresB.push(...record.scoresB);
    diffs.push(record.diff);
    hands += record.hands;
  }

  const paired = pairedTTest(diffs);
  // The counterfactual: the *same* estimand and the *same* number of A-games,
  // with the blocking thrown away. In one game, A's placement fixes the mean
  // placement of the three B seats (the four places always sum to 10), so the
  // per-game contrast is `(place - 2.5) * 4 / 3` and an unblocked design tests
  // it one game at a time. Its point estimate is identical to the paired one
  // by construction; only the standard error differs, and that difference is
  // exactly what the duplicate wall and the seat rotation bought.
  const unblocked = pairedTTest(placesA.map(perGameContrast));
  const ratio =
    paired.standardError === 0
      ? Number.POSITIVE_INFINITY
      : unblocked.standardError / paired.standardError;
  // Reported for completeness and deliberately *not* used by the gate: A's and
  // B's placements inside one game are mechanically dependent, so a two-sample
  // test on them understates the standard error of the difference.
  const naiveTwoSample = welchTTest(placesA, placesB);

  const alpha = 0.05;
  const improved = paired.estimate < 0;
  const significant = paired.p < alpha;
  const met = improved && significant;
  const verdict = met
    ? `GATE MET: ${options.a.name} improves average placement by ` +
      `${Math.abs(paired.estimate).toFixed(4)} (p=${paired.p.toExponential(2)})`
    : improved
      ? `GATE NOT MET: ${options.a.name} is ahead by ${Math.abs(paired.estimate).toFixed(4)} ` +
        `but p=${paired.p.toFixed(4)} >= ${alpha}`
      : `GATE NOT MET: ${options.a.name} is behind by ${Math.abs(paired.estimate).toFixed(4)} ` +
        `(p=${paired.p.toFixed(4)})`;

  return {
    arms: { a: options.a, b: options.b },
    sets: records.length,
    seed: String(options.seed),
    length: options.length,
    aaSalt: options.aaSalt,
    seeds: {
      first: setSeed(options.seed, 0),
      last: setSeed(options.seed, Math.max(0, records.length - 1)),
      count: records.length,
    },
    games: records.length * GAMES_PER_SET,
    hands,
    decisions: statsA.decisions + statsB.decisions,
    decisionMs: statsA.decisionMs + statsB.decisionMs,
    elapsedMs,
    metrics: {
      a: metricsFor(statsA, placesA, scoresA),
      b: metricsFor(statsB, placesB, scoresB),
    },
    paired,
    unblocked,
    naiveTwoSample,
    variance: {
      pairedStandardError: paired.standardError,
      unblockedStandardError: unblocked.standardError,
      standardErrorRatio: ratio,
      effectiveSampleMultiplier: ratio * ratio,
    },
    gate: {
      metric: 'averagePlacement',
      direction: 'lower-is-better',
      alpha,
      improved,
      significant,
      met,
      verdict,
    },
    records: [...records],
  };
}

/**
 * Play `games` independent self-play games with `arm` in all four seats,
 * accumulating the EV-table counters.
 *
 * Independent, not duplicated: the tables estimate frequencies in the policy's
 * own play, and replaying one wall four times would count the same hand four
 * times over.
 */
export function collectEvTables(
  arm: Arm,
  rules: Rules,
  seed: number | string,
  games: number,
): EvCounters {
  const ev = emptyEvCounters();
  const policies: [Arm, Arm, Arm, Arm] = [arm, arm, arm, arm];
  for (let index = 0; index < games; index += 1) {
    playGame({
      rules,
      wallSeed: setSeed(seed, index),
      policies,
      salts: ['', '', '', ''],
      ev,
    });
  }
  return ev;
}

/** Play `options.sets` duplicate sets in this process. */
export function runMatch(options: MatchOptions): MatchResult {
  const rules = options.length === 'hanchan' ? HANCHAN_RULES : DEFAULT_RULES;
  const started = Date.now();
  const records: SetRecord[] = [];
  for (let index = 0; index < options.sets; index += 1) {
    const record = playSet({
      a: options.a,
      b: options.b,
      rules,
      seed: setSeed(options.seed, index),
      aaSalt: options.aaSalt,
    });
    records.push(record);
    options.onSet?.(index, record);
  }
  return summarize(options, records, Date.now() - started);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
  a: string;
  b: string;
  sets: number;
  seed: number | string;
  length: GameLength;
  json: string | null;
  evLog: string | null;
  aaSalt: string;
  jobs: number;
  quiet: boolean;
  /** Internal: play sets `[shardStart, shardStart + sets)` and print JSON. */
  shardStart: number;
  shard: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    a: 'hard-ev',
    b: 'medium',
    sets: 100,
    seed: 1,
    length: 'tonpuu',
    json: null,
    evLog: null,
    aaSalt: '',
    jobs: 1,
    quiet: false,
    shardStart: 0,
    shard: false,
  };

  for (const arg of argv) {
    const match = /^--([a-zA-Z-]+)(?:=(.*))?$/.exec(arg);
    if (match === null) throw new Error(`Unexpected argument ${arg}`);
    const [, flag, rawValue] = match;
    const value = rawValue ?? '';
    switch (flag) {
      case 'a':
        options.a = value;
        break;
      case 'b':
        options.b = value;
        break;
      case 'sets':
        options.sets = Number(value);
        break;
      case 'seed':
        options.seed = /^\d+$/.test(value) ? Number(value) : value;
        break;
      case 'length':
        if (value !== 'tonpuu' && value !== 'hanchan') {
          throw new Error(`--length must be tonpuu or hanchan, got ${value}`);
        }
        options.length = value;
        break;
      case 'json':
        // `none` is kept as a sentinel rather than folded into `null`, which
        // means "not given, use the generated path".
        options.json = value;
        break;
      case 'ev-log':
        options.evLog = value;
        break;
      case 'aa-salt':
        options.aaSalt = value;
        break;
      case 'jobs':
        options.jobs = Number(value);
        break;
      case 'quiet':
        options.quiet = true;
        break;
      case 'shard-start':
        options.shardStart = Number(value);
        options.shard = true;
        break;
      default:
        throw new Error(
          `Unknown flag --${flag} (expected --a, --b, --sets, --seed, --length, ` +
            '--json, --ev-log, --aa-salt, --jobs, --quiet)',
        );
    }
  }

  if (!Number.isInteger(options.sets) || options.sets <= 0) {
    throw new Error(`--sets must be a positive integer, got ${options.sets}`);
  }
  if (!Number.isInteger(options.jobs) || options.jobs <= 0) {
    throw new Error(`--jobs must be a positive integer, got ${options.jobs}`);
  }
  if (options.evLog !== null && options.jobs !== 1) {
    // Shards would each need to ship their counters back; the EV collection
    // run is short enough that it is not worth the protocol.
    throw new Error('--ev-log cannot be combined with --jobs>1');
  }
  return options;
}

function defaultJsonPath(options: CliOptions): string {
  const name =
    `mahjong-duplicate-ab-${options.a}-vs-${options.b}-${options.length}` +
    `-${options.sets}sets-seed${options.seed}`;
  return path.join('docs', 'data', `${name.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
}

function percent(value: number): string {
  return `${(100 * value).toFixed(2)}%`;
}

function formatArm(arm: Arm): string {
  return (
    `${arm.name} (defence=${arm.policy.useDefence}, top=${arm.policy.discardRandomTop}, ` +
    `ev=${arm.policy.useEvPushFold}${arm.difficulty === null ? '' : `, difficulty=${arm.difficulty}`})`
  );
}

function formatSummary(result: MatchResult): string {
  const { a, b } = result.metrics;
  const rows: [string, string, string][] = [
    ['average placement', a.averagePlacement.toFixed(4), b.averagePlacement.toFixed(4)],
    ['average score', a.averageScore.toFixed(0), b.averageScore.toFixed(0)],
    ['win rate', percent(a.winRate), percent(b.winRate)],
    ['deal-in rate', percent(a.dealInRate), percent(b.dealInRate)],
    ['riichi rate', percent(a.riichiRate), percent(b.riichiRate)],
    ['call rate', percent(a.callRate), percent(b.callRate)],
    ['avg win value', a.averageWinValue.toFixed(0), b.averageWinValue.toFixed(0)],
    ['avg deal-in value', a.averageDealInValue.toFixed(0), b.averageDealInValue.toFixed(0)],
    ['placements 1/2/3/4', a.placements.join('/'), b.placements.join('/')],
    ['seat-games', String(a.seatGames), String(b.seatGames)],
    ['seat-hands', String(a.seatHands), String(b.seatHands)],
  ];

  const lines = [
    'mahjong-ai-match — duplicate wall, 4 seat rotations per set',
    `  A  ${formatArm(result.arms.a)}`,
    `  B  ${formatArm(result.arms.b)}`,
    `  sets ${result.sets} × ${GAMES_PER_SET} games = ${result.games} games, ` +
      `${result.hands} hands, length=${result.length}`,
    `  seeds ${result.seeds.first} … ${result.seeds.last}` +
      (result.aaSalt === '' ? '' : `  (arm A salted "${result.aaSalt}")`),
    '',
    `  ${'metric'.padEnd(20)} ${'A'.padStart(12)} ${'B'.padStart(12)}`,
    ...rows.map(([label, av, bv]) => `  ${label.padEnd(20)} ${av.padStart(12)} ${bv.padStart(12)}`),
    '',
    '  paired difference (A − B) in average placement, one set = one observation',
    `    mean               ${result.paired.estimate.toFixed(5)}`,
    `    standard error     ${result.paired.standardError.toFixed(5)}`,
    `    95% CI             [${result.paired.ci95[0].toFixed(5)}, ${result.paired.ci95[1].toFixed(5)}]`,
    `    t (df=${result.paired.df})${' '.repeat(Math.max(1, 14 - String(result.paired.df).length))}${result.paired.t.toFixed(4)}`,
    `    p (two-sided)      ${result.paired.p.toPrecision(4)}`,
    '',
    '  variance reduction from the duplicate wall + seat rotation',
    `    unblocked SE       ${result.unblocked.standardError.toFixed(5)}  (one game = one observation)`,
    `    blocked SE         ${result.paired.standardError.toFixed(5)}  (one set = one observation)`,
    `    SE ratio           ${result.variance.standardErrorRatio.toFixed(3)}×`,
    `    equivalent games   ${result.variance.effectiveSampleMultiplier.toFixed(2)}× ` +
      'more games needed unblocked',
    '',
    `  ${result.gate.verdict}`,
    '',
    `  decisions          ${result.decisions}`,
    `  ms / decision      ${(result.decisionMs / Math.max(1, result.decisions)).toFixed(4)}`,
    `  games / second     ${(result.games / Math.max(0.001, result.elapsedMs / 1000)).toFixed(2)}`,
    `  elapsed            ${(result.elapsedMs / 1000).toFixed(1)}s`,
    '',
  ];
  return lines.join('\n');
}

/** The result JSON, without the per-set records that make it unreadable. */
function resultDocument(result: MatchResult): unknown {
  return {
    schema: 'mahjong-duplicate-ab-result-v1',
    plan: 'docs/data/mahjong-duplicate-ab-v1-plan.json',
    generatedAt: new Date().toISOString(),
    arms: {
      a: { name: result.arms.a.name, difficulty: result.arms.a.difficulty, policy: result.arms.a.policy },
      b: { name: result.arms.b.name, difficulty: result.arms.b.difficulty, policy: result.arms.b.policy },
    },
    design: {
      duplicateWall: true,
      gamesPerSet: GAMES_PER_SET,
      rotation: 'arm A occupies seat 0,1,2,3 in turn; arm B holds the other three',
      length: result.length,
      aaSalt: result.aaSalt,
    },
    seeds: result.seeds,
    counts: {
      sets: result.sets,
      games: result.games,
      hands: result.hands,
      decisions: result.decisions,
      msPerDecision: result.decisionMs / Math.max(1, result.decisions),
      gamesPerSecond: result.games / Math.max(0.001, result.elapsedMs / 1000),
      elapsedSeconds: result.elapsedMs / 1000,
    },
    metrics: result.metrics,
    paired: result.paired,
    unblocked: result.unblocked,
    naiveTwoSample: result.naiveTwoSample,
    variance: result.variance,
    gate: result.gate,
    setDifferences: result.records.map((record) => record.diff),
  };
}

/** Turn the raw counters into the ratios `ai/evTables.ts` is written from. */
export function evTablesDocument(
  ev: EvCounters,
  options: CliOptions,
  games: number,
): unknown {
  const winProb = ev.winTrials.map((row, turn) =>
    row.map((trials, shantenBucket) =>
      trials === 0 ? null : ev.winHits[turn][shantenBucket] / trials,
    ),
  );
  const dealInProb = ev.dangerTrials.map((trials, band) =>
    trials === 0 ? null : ev.dangerHits[band] / trials,
  );
  const pushes = ev.pushTrials.map((trials, turn) =>
    trials === 0 ? null : ev.pushRemaining[turn] / trials,
  );
  const winValue = ev.valueTrials.map((trials, han) =>
    trials === 0 ? null : ev.valuePoints[han] / trials,
  );
  const dealInCost: Record<string, number | null> = {};
  for (const key of THREAT_KEYS) {
    dealInCost[key] =
      ev.costTrials[key] === 0 ? null : ev.costPoints[key] / ev.costTrials[key];
  }

  return {
    schema: 'mahjong-ev-tables-source-v1',
    generatedAt: new Date().toISOString(),
    source: {
      command:
        `--a=${options.a} --sets=${options.sets} --seed=${options.seed} ` +
        `--length=${options.length} --ev-log`,
      seed: String(options.seed),
      selfPlayGames: games,
      hands: ev.hands,
      discards: ev.discards,
    },
    buckets: {
      turn: EV_TURN_BUCKETS,
      shanten: EV_SHANTEN_BUCKETS,
      danger: EV_DANGER_BUCKETS,
      han: EV_HAN_BUCKETS,
    },
    winProbabilityByTurnShanten: winProb,
    winTrialsByTurnShanten: ev.winTrials,
    dealInProbabilityByDanger: dealInProb,
    dealInTrialsByDanger: ev.dangerTrials,
    remainingDiscardsByTurn: pushes,
    winValueByEstimatedHan: winValue,
    winValueTrialsByEstimatedHan: ev.valueTrials,
    dealInCostByThreat: dealInCost,
    dealInTrialsByThreat: ev.costTrials,
  };
}

/** Run the sets in `jobs` child processes and merge their set records. */
async function runSharded(options: CliOptions): Promise<SetRecord[]> {
  const jobs = Math.min(options.jobs, options.sets);
  const perJob = Math.ceil(options.sets / jobs);
  const tasks: Promise<SetRecord[]>[] = [];

  for (let job = 0; job < jobs; job += 1) {
    const start = job * perJob;
    const count = Math.min(perJob, options.sets - start);
    if (count <= 0) break;
    tasks.push(
      new Promise<SetRecord[]>((resolve, reject) => {
        const child = fork(
          __filename,
          [
            `--a=${options.a}`,
            `--b=${options.b}`,
            `--sets=${count}`,
            `--seed=${options.seed}`,
            `--length=${options.length}`,
            `--aa-salt=${options.aaSalt}`,
            `--shard-start=${start}`,
            '--json=none',
            '--quiet',
          ],
          { execArgv: ['-r', 'tsx/cjs'], stdio: ['ignore', 'pipe', 'inherit', 'ipc'] },
        );
        let out = '';
        child.stdout?.on('data', (chunk: Buffer) => {
          out += chunk.toString('utf8');
        });
        child.on('error', reject);
        child.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`shard ${job} exited with code ${code}`));
            return;
          }
          try {
            resolve(JSON.parse(out) as SetRecord[]);
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      }),
    );
  }

  const shards = await Promise.all(tasks);
  return shards.flat();
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const a = resolveArm(options.a);
  const b = resolveArm(options.b);
  const rules = options.length === 'hanchan' ? HANCHAN_RULES : DEFAULT_RULES;

  if (options.evLog !== null) {
    const games = options.sets * GAMES_PER_SET;
    const startedEv = Date.now();
    const ev = collectEvTables(a, rules, options.seed, games);
    fs.mkdirSync(path.dirname(options.evLog), { recursive: true });
    fs.writeFileSync(
      options.evLog,
      `${JSON.stringify(evTablesDocument(ev, options, games), null, 2)}\n`,
    );
    process.stdout.write(
      `mahjong-ai-match ev-log: ${games} self-play games, ${ev.hands} hands, ` +
        `${ev.discards} discards, ${((Date.now() - startedEv) / 1000).toFixed(1)}s\n` +
        `  wrote ${options.evLog}\n`,
    );
    return;
  }

  // A shard plays its slice of the seed space and hands the records back as
  // JSON on stdout. The seeds are a pure function of (seed, index), so no
  // coordination beyond the index range is needed.
  if (options.shard) {
    const records: SetRecord[] = [];
    for (let index = 0; index < options.sets; index += 1) {
      records.push(
        playSet({
          a,
          b,
          rules,
          seed: setSeed(options.seed, options.shardStart + index),
          aaSalt: options.aaSalt,
        }),
      );
    }
    process.stdout.write(JSON.stringify(records));
    return;
  }

  const matchOptions: MatchOptions = {
    a,
    b,
    sets: options.sets,
    seed: options.seed,
    length: options.length,
    aaSalt: options.aaSalt,
  };

  const started = Date.now();
  let records: SetRecord[];
  if (options.jobs > 1) {
    if (!options.quiet) {
      process.stderr.write(`[mahjong-ai-match] ${options.jobs} shards × ~${Math.ceil(options.sets / options.jobs)} sets\n`);
    }
    records = await runSharded(options);
  } else {
    records = [];
    for (let index = 0; index < options.sets; index += 1) {
      records.push(
        playSet({
          a,
          b,
          rules,
          seed: setSeed(options.seed, index),
          aaSalt: options.aaSalt,
        }),
      );
      if (!options.quiet && (index + 1) % 25 === 0) {
        const elapsed = (Date.now() - started) / 1000;
        process.stderr.write(
          `[mahjong-ai-match] ${index + 1}/${options.sets} sets, ${elapsed.toFixed(1)}s ` +
            `(${((index + 1) / elapsed).toFixed(2)} sets/s)\n`,
        );
      }
    }
  }

  const result = summarize(matchOptions, records, Date.now() - started);
  process.stdout.write(formatSummary(result));

  const jsonPath = options.json ?? defaultJsonPath(options);
  if (jsonPath !== 'none') {
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, `${JSON.stringify(resultDocument(result), null, 2)}\n`);
    process.stdout.write(`  wrote ${jsonPath}\n`);
  }
}

const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  /mahjong-ai-match\.[cm]?ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`mahjong-ai-match FAILED: ${message}\n`);
    process.exit(1);
  });
}
