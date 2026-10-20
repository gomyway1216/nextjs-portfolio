/**
 * Goldfish Lantern Pachinko (金魚ちょうちんパチンコ): the machine's rules, slot by slot.
 *
 * A medal pachinko of a Japanese game center's pachinko corner: a 甘デジ-style デジパチ (a light-odds digital
 * pachinko) whose balls are lent for medals. Everything on the board happens in **slots** of 0.6 s, the time one ball
 * takes to fire at the legal 100 a minute. In each slot, in this order:
 *
 * 1. **The ball** (`fire`), if the handle is held and there is a ball to fire: its throw by the nails (`fate`, one of
 *    `FATE_SLOTS` equally likely throws) and the handle's strength decide the pocket it reaches, and the machine as it
 *    stands decides whether the pocket takes it.
 * 2. **The machine** (`tick`): the digital reels' spin goes on or ends, a hit's rounds go on, and a hold waiting starts
 *    the next spin.
 *
 * ## The board
 *
 * - **Seven strengths** (`STRENGTHS`, shown 1 to 7). 1 to 4 are 左打ち: the ball comes down the left of the nails,
 *   past the windmill, to the ヘソ (the start pocket), a side pocket or OUT. 5 to 7 are 右打ち: the ball rides the rail
 *   over to the right, through the gate, past the 電チュー (the electric tulip) and down to the attacker.
 * - **The ヘソ** pays 3 balls (`PAY_HESO`) and takes a hold when fewer than four of its holds wait (`HOLDS`). A ball
 *   that comes in with four waiting pays its 3 and starts nothing: that is why experts stop firing (止め打ち).
 * - **The side pockets** (袖, the 一般入賞口) pay 5 (`PAY_SIDE`).
 * - **The 電チュー** opens only while the machine is in ST or 時短 (電サポ), and then catches every ball shot right:
 *   it pays 1 (`PAY_DENCHU`) and takes a hold of its own queue, four at most.
 * - **The attacker** (アタッカー, the 大入賞口) opens only during a hit's rounds; a ball shot right comes into it with
 *   its strength's chance (`ATTACKER`) and pays 10 (`PAY_ATTACKER`). A round closes when ten balls are in (`COUNT`).
 *   Real machines also close it after 30 seconds; this one waits for its ten.
 *
 * ## The lottery
 *
 * Every hold carries a number drawn when it is taken (`lot`, 0 to 65,535, as on a real machine). When its spin starts
 * it is a hit if the number is under the odds of the moment: 656 (1 in 99.9) in normal play and 時短, 1,638 (1 in
 * 40.0) in ST. The 電チュー's holds spin first; the ヘソ's wait while any of them do.
 *
 * - A hit from the ヘソ (`SPLIT_HESO`): 10 rounds and ST 5%, 4 rounds and ST 45%, 4 rounds and 時短 50%.
 * - A hit from the 電チュー (`SPLIT_DENCHU`): 10 rounds and ST 30%, 4 rounds and ST 70%.
 * - **ST**: 30 spins at 1 in 40.0 with the 電チュー open. **時短**: 20 spins at 1 in 99.9 with the 電チュー open.
 *   A hit in either starts it all again; 30 (or 20) spins without one, and play is normal again. The 電チュー's holds
 *   still waiting then (残保留) spin first, at the normal odds.
 *
 * ## The spins
 *
 * A spin is a plain spin, a normal reach or an SP reach (`SpinKind`), drawn with its result from the hold's numbers.
 * It lasts a number of slots that is not fixed: each of its phases (the reels, the reach, the SP scene) ends at each
 * slot with a chance of its own (`phaseChances`), so a phase is as likely to end in the next slot however long it has
 * gone on. That is what keeps the exact reckoning (analysis.ts) a Markov process over a few states. A plain spin in
 * normal play runs faster the more holds wait (保留短縮).
 *
 * ## The draw
 *
 * Everything random is drawn ahead, in a press (the medal lend, the handle taken hold of): five numbers in [0, 1) for
 * each ball (`drawBall`), its throw by the nails and, should it take a hold, the hold's lottery number, its split, its
 * show (the kind of spin, the hold lamp's colour) and the seed its spin's phases are weighed against. A ball uses them
 * as it is fired; a test chooses them by queueing the numbers for the press.
 *
 * Nothing here touches React, the browser or the medals.
 */

// ── The board ───────────────────────────────────────────────────────────────

/** One slot of machine time, in ms: a ball fired every slot is the legal 100 a minute. */
export const SLOT_MS = 600;
/** Balls lent for a medal, and back for a medal at the counter (rounded down). */
export const BALLS_PER_MEDAL = 10;
/** Medals one lend takes, and the balls it gives. */
export const LEND_MEDALS = 5;
export const LEND_BALLS = LEND_MEDALS * BALLS_PER_MEDAL;
/** The handle's strengths: 0 to 6 here, shown as 1 to 7. 0 to 3 shoot left, 4 to 6 right. */
export const STRENGTHS = 7;
export const FIRST_RIGHT = 4;
/** The strength the handle starts at: 4 (shown), 左打ち. */
export const DEFAULT_STRENGTH = 3;
/** The equally likely throws the nails can give a ball. */
export const FATE_SLOTS = 128;
/** Of a strength's throws, those that reach the ヘソ, then those that reach a side pocket (the rest go OUT). */
export const HESO: readonly number[] = [4, 7, 10, 6, 0, 0, 0];
export const SIDE: readonly number[] = [1, 2, 1, 3, 0, 0, 0];
/** Of a strength's throws, those the open 電チュー catches, and those the open attacker takes. */
export const DENCHU: readonly number[] = [0, 0, 0, 0, 128, 128, 128];
export const ATTACKER: readonly number[] = [0, 0, 0, 0, 96, 128, 104];
/** The best strength for the ヘソ (in normal play), and for the 電チュー and the attacker. */
export const BEST_LEFT = 2;
export const BEST_RIGHT = 5;

export const PAY_HESO = 3;
export const PAY_SIDE = 5;
export const PAY_DENCHU = 1;
export const PAY_ATTACKER = 10;
/** Holds each queue keeps. */
export const HOLDS = 4;
/** Balls into the attacker that close a round. */
export const COUNT = 10;
/** Slots of the hit's fanfare before round 1, between rounds, and of its ending. */
export const FANFARE_SLOTS = 6;
export const INTERVAL_SLOTS = 3;
export const ENDING_SLOTS = 6;

/** The lottery's numbers, and the hits among them at each odds. */
export const LOTTERY = 65_536;
export const HIT_NORMAL = 656;
export const HIT_ST = 1_638;
/** Spins of ST and of 時短. */
export const ST_SPINS = 30;
export const JITAN_SPINS = 20;

export type Mode = 'normal' | 'st' | 'jitan';
/** Whether the 電チュー is helping: ST or 時短 (電サポ). */
export const helping = (mode: Mode): boolean => mode !== 'normal';
/** The hits among the lottery's numbers in a mode. */
export const hitsIn = (mode: Mode): number => (mode === 'st' ? HIT_ST : HIT_NORMAL);

/** What a hit gives: its rounds, and what follows them. */
export interface HitKind {
  rounds: 4 | 10;
  after: 'st' | 'jitan';
}
/** The splits, out of 100: from the ヘソ (queue 1) and from the 電チュー (queue 2). */
export const SPLIT_HESO: readonly { kind: HitKind; percent: number }[] = [
  { kind: { rounds: 10, after: 'st' }, percent: 5 },
  { kind: { rounds: 4, after: 'st' }, percent: 45 },
  { kind: { rounds: 4, after: 'jitan' }, percent: 50 },
];
export const SPLIT_DENCHU: readonly { kind: HitKind; percent: number }[] = [
  { kind: { rounds: 10, after: 'st' }, percent: 30 },
  { kind: { rounds: 4, after: 'st' }, percent: 70 },
];
export const splitOf = (from: 1 | 2): readonly { kind: HitKind; percent: number }[] => (from === 1 ? SPLIT_HESO : SPLIT_DENCHU);
/** The kind of hit a split number (0 to 99) gives a hold from queue `from`. */
export function hitKindOf(from: 1 | 2, split: number): HitKind {
  const table = splitOf(from);
  let sum = 0;
  for (const { kind, percent } of table) {
    sum += percent;
    if (split < sum) return kind;
  }
  return table[table.length - 1].kind;
}

/** A spin's kind: a plain spin, a normal reach, or an SP reach (the goldfish-scooping scene). */
export type SpinKind = 'plain' | 'nr' | 'sp';
export const SPIN_KINDS: readonly SpinKind[] = ['plain', 'nr', 'sp'];
/** The show numbers: there are `SHOWS` of them. */
export const SHOWS = 1_024;
/**
 * Of the show numbers, those that make a hit a normal reach (the rest an SP reach), and those that make a miss a
 * normal reach, then an SP reach (the rest plain): in normal play, and with the 電チュー helping.
 */
export const SHOW_TABLE = {
  normal: { hitNr: 320, missNr: 48, missSp: 16 },
  helping: { hitNr: 512, missNr: 32, missSp: 8 },
} as const;
export const showTable = (mode: Mode) => (helping(mode) ? SHOW_TABLE.helping : SHOW_TABLE.normal);
/** The kind a spin started in `mode` spins as. */
export function spinKindOf(mode: Mode, hit: boolean, show: number): SpinKind {
  const t = showTable(mode);
  if (hit) return show < t.hitNr ? 'nr' : 'sp';
  return show < t.missNr ? 'nr' : show < t.missNr + t.missSp ? 'sp' : 'plain';
}

/** A chance as a fraction whose denominator is a power of two: `num / 2^shift`. */
export interface Chance {
  num: number;
  shift: number;
}
const chance = (num: number, shift: number): Chance => ({ num, shift });
/**
 * The chance each phase of a spin ends at each slot. A plain spin in normal play is faster the more holds wait: 1 in
 * 16 with one or none, 1 in 8 with two, 1 in 4 with three or more. With the 電チュー helping, every spin's first phase
 * lasts exactly one slot.
 */
export function phaseChances(mode: Mode, kind: SpinKind, waiting: number): readonly Chance[] {
  if (helping(mode)) {
    if (kind === 'plain') return [chance(1, 0), chance(1, 1)];
    if (kind === 'nr') return [chance(1, 0), chance(1, 2)];
    return [chance(1, 0), chance(1, 2), chance(1, 3)];
  }
  if (kind === 'plain') return [waiting <= 1 ? chance(1, 4) : waiting === 2 ? chance(1, 3) : chance(1, 2)];
  if (kind === 'nr') return [chance(1, 2), chance(1, 3)];
  return [chance(1, 2), chance(1, 3), chance(1, 5)];
}
export const phasesOf = (mode: Mode, kind: SpinKind): number => phaseChances(mode, kind, 0).length;

// ── The draw ────────────────────────────────────────────────────────────────

/** What a ball carries, drawn ahead: its throw, and the numbers of the hold it may take. */
export interface BallDraw {
  /** Its throw by the nails: 0 to 127. */
  fate: number;
  /** The lottery number of the hold it takes: 0 to 65,535. */
  lot: number;
  /** The split: 0 to 99. */
  split: number;
  /** The show: 0 to 1,023. */
  show: number;
  /** The seed its spin's phases are weighed against: a 32-bit number. */
  seed: number;
}
export type Hold = Omit<BallDraw, 'fate'>;

/** How many numbers in [0, 1) a ball's draw takes. */
export const BALL_NUMBERS = 5;
const pick = (n: number, of: number): number => Math.min(of - 1, Math.max(0, Math.floor(n * of)));
/** A ball's draw, from five random numbers in [0, 1): its throw, lottery number, split, show and seed. */
export const drawBall = (random: () => number): BallDraw => ({
  fate: pick(random(), FATE_SLOTS),
  lot: pick(random(), LOTTERY),
  split: pick(random(), 100),
  show: pick(random(), SHOWS),
  seed: pick(random(), 2 ** 32),
});
/** The numbers that draw `draw`, in the order `drawBall` takes them: for a test that rigs a press. */
export const numbersForBall = (draw: BallDraw): number[] => [
  (draw.fate + 0.5) / FATE_SLOTS,
  (draw.lot + 0.5) / LOTTERY,
  (draw.split + 0.5) / 100,
  (draw.show + 0.5) / SHOWS,
  (draw.seed + 0.5) / 2 ** 32,
];

const isWhole = (value: unknown, below: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < below;
export const isHold = (value: unknown): value is Hold => {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  return isWhole(d.lot, LOTTERY) && isWhole(d.split, 100) && isWhole(d.show, SHOWS) && isWhole(d.seed, 2 ** 32);
};
export const isBallDraw = (value: unknown): value is BallDraw => isHold(value) && isWhole((value as unknown as Record<string, unknown>).fate, FATE_SLOTS);
export const isStrength = (value: unknown): value is number => isWhole(value, STRENGTHS);

/**
 * A number in [0, 1) for the `age`th slot of a spin with seed `seed`, which its phase's chance to end is weighed
 * against: the same seed and age give the same number, so a reload goes on as the page would have.
 */
export function spinUnit(seed: number, age: number): number {
  let z = (seed ^ Math.imul(age + 1, 0x9e3779b1)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return z / 2 ** 32;
}
/** Whether a phase with chance `c` ends, for a number `unit` in [0, 1): exactly `c` of the numbers do. */
export const endsAt = (c: Chance, unit: number): boolean => unit * 2 ** c.shift < c.num;

// ── The machine ─────────────────────────────────────────────────────────────

/** A spin of the reels: whose hold, the mode it started in, its result and kind, and how far it has gone. */
export interface Spin {
  from: 1 | 2;
  hold: Hold;
  mode: Mode;
  hit: boolean;
  kind: SpinKind;
  phase: number;
  /** Slots since it started. */
  age: number;
}

export type BonusStage = 'fanfare' | 'open' | 'interval' | 'ending';
/** A hit's rounds: which hit, where they are, and the balls in this round. */
export interface Bonus {
  kind: HitKind;
  from: 1 | 2;
  stage: BonusStage;
  /** The round open, or the next one: 1 to `kind.rounds`. */
  round: number;
  /** Balls into the attacker this round. */
  count: number;
  /** Slots left of a stage that waits (the fanfare, an interval, the ending). */
  wait: number;
}

/** A run of hits one after another, through ST and 時短: how many, and the balls their rounds paid. */
export interface Rush {
  hits: number;
  balls: number;
}

export interface Machine {
  mode: Mode;
  /** Spins left of ST or 時短. */
  left: number;
  /** The ヘソ's holds and the 電チュー's, the first first. */
  q1: Hold[];
  q2: Hold[];
  spin: Spin | null;
  bonus: Bonus | null;
  rush: Rush | null;
}

export const newMachine = (): Machine => ({ mode: 'normal', left: 0, q1: [], q2: [], spin: null, bonus: null, rush: null });
export const copyMachine = (m: Machine): Machine => ({
  mode: m.mode,
  left: m.left,
  q1: m.q1.map((h) => ({ ...h })),
  q2: m.q2.map((h) => ({ ...h })),
  spin: m.spin ? { ...m.spin, hold: { ...m.spin.hold } } : null,
  bonus: m.bonus ? { ...m.bonus, kind: { ...m.bonus.kind } } : null,
  rush: m.rush ? { ...m.rush } : null,
});

/** Whether the attacker is open now. */
export const attackerOpen = (m: Machine): boolean => m.bonus?.stage === 'open';
/** Whether the 電チュー is open now: with the 電チュー helping, and no hit's rounds on. */
export const denchuOpen = (m: Machine): boolean => helping(m.mode) && m.bonus === null;
/** Whether the machine calls for 右打ち: during a hit's rounds, ST and 時短. */
export const shootRight = (m: Machine): boolean => m.bonus !== null || helping(m.mode);
/** Holds waiting in both queues. */
export const waitingOf = (m: Machine): number => m.q1.length + m.q2.length;

export type Pocket = 'heso' | 'side' | 'denchu' | 'attacker' | 'out';
/** Where a ball shot at `strength` with throw `fate` goes, the machine as it stands. */
export function pocketOf(m: Machine, strength: number, fate: number): Pocket {
  if (strength < FIRST_RIGHT) return fate < HESO[strength] ? 'heso' : fate < HESO[strength] + SIDE[strength] ? 'side' : 'out';
  if (attackerOpen(m)) return fate < ATTACKER[strength] ? 'attacker' : 'out';
  if (denchuOpen(m)) return fate < DENCHU[strength] ? 'denchu' : 'out';
  return 'out';
}
export const PAY_OF: Readonly<Record<Pocket, number>> = { heso: PAY_HESO, side: PAY_SIDE, denchu: PAY_DENCHU, attacker: PAY_ATTACKER, out: 0 };

/** A throw that sends a ball shot at `strength` to `where` (null: OUT), for a test that rigs the draw. */
export function fateFor(strength: number, where: 'heso' | 'side' | 'right' | null): number {
  if (where === 'heso' || where === 'right') return 0;
  if (where === 'side') return HESO[strength];
  return FATE_SLOTS - 1;
}

export interface Fired {
  pocket: Pocket;
  /** Balls the pocket pays. */
  paid: number;
  /** The queue it took a hold in, if it did. */
  held: 1 | 2 | null;
}

/** A ball fired at `strength` with its draw: what it does to the machine (changed in place), and what it pays. */
export function fire(m: Machine, strength: number, draw: BallDraw): Fired {
  const pocket = pocketOf(m, strength, draw.fate);
  let held: 1 | 2 | null = null;
  const hold: Hold = { lot: draw.lot, split: draw.split, show: draw.show, seed: draw.seed };
  if (pocket === 'heso' && m.q1.length < HOLDS) {
    m.q1.push(hold);
    held = 1;
  } else if (pocket === 'denchu' && m.q2.length < HOLDS) {
    m.q2.push(hold);
    held = 2;
  } else if (pocket === 'attacker' && m.bonus) m.bonus.count += 1;
  return { pocket, paid: PAY_OF[pocket], held };
}

/** What the machine did in a slot, for the page to show. */
export type Tick =
  | { type: 'start'; spin: Spin }
  | { type: 'phase'; spin: Spin }
  | { type: 'stop'; spin: Spin; kind: HitKind | null }
  | { type: 'open'; round: number }
  | { type: 'close'; round: number }
  | { type: 'end'; kind: HitKind }
  | { type: 'mode'; mode: Mode; rush: Rush | null };

/** Starts the next spin, if a hold waits: the 電チュー's first. */
function startNext(m: Machine, out: Tick[]): void {
  const from: 1 | 2 | null = m.q2.length > 0 ? 2 : m.q1.length > 0 ? 1 : null;
  if (from === null) return;
  const hold = (from === 2 ? m.q2 : m.q1).shift()!;
  const hit = hold.lot < hitsIn(m.mode);
  const spin: Spin = { from, hold, mode: m.mode, hit, kind: spinKindOf(m.mode, hit, hold.show), phase: 0, age: 0 };
  m.spin = spin;
  out.push({ type: 'start', spin: { ...spin } });
}

/** By default a phase ends as its spin's seed says. */
export const SEEDED = (spin: Spin, c: Chance): boolean => endsAt(c, spinUnit(spin.hold.seed, spin.age));

/**
 * One slot of the machine, after the slot's ball (changed in place). `ends` says whether a phase with the chance given
 * ends now: as the spin's seed says, unless a test says otherwise.
 */
export function tick(m: Machine, ends: (spin: Spin, c: Chance) => boolean = SEEDED): Tick[] {
  const out: Tick[] = [];
  const bonus = m.bonus;
  if (bonus) {
    if (bonus.stage === 'open') {
      if (bonus.count >= COUNT) {
        out.push({ type: 'close', round: bonus.round });
        bonus.stage = bonus.round < bonus.kind.rounds ? 'interval' : 'ending';
        bonus.wait = bonus.stage === 'interval' ? INTERVAL_SLOTS : ENDING_SLOTS;
      }
      return out;
    }
    bonus.wait -= 1;
    if (bonus.wait > 0) return out;
    if (bonus.stage !== 'ending') {
      if (bonus.stage === 'interval') bonus.round += 1;
      bonus.stage = 'open';
      bonus.count = 0;
      out.push({ type: 'open', round: bonus.round });
      return out;
    }
    // The ending: ST or 時短 begins. No spin starts in this slot: the 電チュー opens first.
    m.bonus = null;
    m.mode = bonus.kind.after;
    m.left = bonus.kind.after === 'st' ? ST_SPINS : JITAN_SPINS;
    out.push({ type: 'end', kind: bonus.kind });
    out.push({ type: 'mode', mode: m.mode, rush: m.rush ? { ...m.rush } : null });
    return out;
  }
  const spin = m.spin;
  if (spin) {
    spin.age += 1;
    const chances = phaseChances(spin.mode, spin.kind, waitingOf(m));
    if (!ends(spin, chances[spin.phase])) return out;
    if (spin.phase + 1 < chances.length) {
      spin.phase += 1;
      out.push({ type: 'phase', spin: { ...spin } });
      return out;
    }
    m.spin = null;
    if (spin.hit) {
      const kind = hitKindOf(spin.from, spin.hold.split);
      out.push({ type: 'stop', spin: { ...spin }, kind });
      m.rush = { hits: (m.rush?.hits ?? 0) + 1, balls: (m.rush?.balls ?? 0) + kind.rounds * COUNT * PAY_ATTACKER };
      m.bonus = { kind, from: spin.from, stage: 'fanfare', round: 1, count: 0, wait: FANFARE_SLOTS };
      return out;
    }
    out.push({ type: 'stop', spin: { ...spin }, kind: null });
    if (helping(m.mode)) {
      m.left -= 1;
      if (m.left <= 0) {
        m.left = 0;
        m.mode = 'normal';
        out.push({ type: 'mode', mode: 'normal', rush: m.rush ? { ...m.rush } : null });
        m.rush = null;
      }
    }
  }
  if (!m.spin) startNext(m, out);
  return out;
}

/** Whether anything is still to come of balls already fired: holds, a spin, a hit's rounds. */
export const busy = (m: Machine): boolean => m.q1.length > 0 || m.q2.length > 0 || m.spin !== null || m.bonus !== null;

// ── The floor's named wins ──────────────────────────────────────────────────

/** The medals a hit's rounds are worth at the counter. */
export const hitMedals = (kind: HitKind): number => (kind.rounds * COUNT * PAY_ATTACKER) / BALLS_PER_MEDAL;
/** A run of hits long enough to be named to the whole floor, and the most the floor believes one to pay. */
export const RUSH_NAMED = 5;
export const RUSH_MOST = 10_000;
/** What the medal floor calls a hit, by name. */
export const hitLabel = (kind: HitKind): string => (kind.rounds === 10 ? 'pachinko-10r' : 'pachinko-4r');
/** The medals a run of hits shows on the floor (capped at what the floor believes), or null when it is too short to name. */
export const rushPrize = (rush: Rush): number | null => (rush.hits >= RUSH_NAMED ? Math.min(RUSH_MOST, Math.floor(rush.balls / BALLS_PER_MEDAL)) : null);

// ── Reading a machine back ──────────────────────────────────────────────────

const MODES: readonly Mode[] = ['normal', 'st', 'jitan'];
const STAGES: readonly BonusStage[] = ['fanfare', 'open', 'interval', 'ending'];
const isRecordLike = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isKind = (value: unknown): value is HitKind => isRecordLike(value) && (value.rounds === 4 || value.rounds === 10) && (value.after === 'st' || value.after === 'jitan');
const isQueue = (value: unknown): value is Hold[] => Array.isArray(value) && value.length <= HOLDS && value.every(isHold);
const copyHold = (h: Hold): Hold => ({ lot: h.lot, split: h.split, show: h.show, seed: h.seed });

/** A machine as it comes back out of storage, or null when it is not a state this machine could be in. */
export function parseMachine(value: unknown): Machine | null {
  if (!isRecordLike(value)) return null;
  const { mode, left, q1, q2, spin, bonus, rush } = value;
  if (!MODES.includes(mode as Mode) || !isWhole(left, ST_SPINS + 1) || !isQueue(q1) || !isQueue(q2)) return null;
  if ((mode === 'normal') !== (left === 0)) return null;
  let readSpin: Spin | null = null;
  if (spin !== null) {
    if (!isRecordLike(spin) || (spin.from !== 1 && spin.from !== 2) || !isHold(spin.hold) || !MODES.includes(spin.mode as Mode)) return null;
    if (typeof spin.hit !== 'boolean' || !SPIN_KINDS.includes(spin.kind as SpinKind) || !isWhole(spin.age, 1_000_000)) return null;
    const sm = spin.mode as Mode;
    const kind = spin.kind as SpinKind;
    if (!isWhole(spin.phase, phasesOf(sm, kind)) || spin.hit !== spin.hold.lot < hitsIn(sm) || spinKindOf(sm, spin.hit, spin.hold.show) !== kind) return null;
    readSpin = { from: spin.from, hold: copyHold(spin.hold), mode: sm, hit: spin.hit, kind, phase: spin.phase, age: spin.age };
  }
  let readBonus: Bonus | null = null;
  if (bonus !== null) {
    if (readSpin || !isRecordLike(bonus) || !isKind(bonus.kind) || (bonus.from !== 1 && bonus.from !== 2) || !STAGES.includes(bonus.stage as BonusStage)) return null;
    if (!isWhole(bonus.round, bonus.kind.rounds + 1) || bonus.round < 1 || !isWhole(bonus.count, COUNT + 1) || !isWhole(bonus.wait, Math.max(FANFARE_SLOTS, ENDING_SLOTS) + 1)) return null;
    readBonus = { kind: { rounds: bonus.kind.rounds, after: bonus.kind.after }, from: bonus.from, stage: bonus.stage as BonusStage, round: bonus.round, count: bonus.count, wait: bonus.wait };
  }
  let readRush: Rush | null = null;
  if (rush !== null) {
    if (!isRecordLike(rush) || !isWhole(rush.hits, 1_000_000) || !isWhole(rush.balls, 1e12)) return null;
    readRush = { hits: rush.hits, balls: rush.balls };
  }
  return { mode: mode as Mode, left: left as number, q1: (q1 as Hold[]).map(copyHold), q2: (q2 as Hold[]).map(copyHold), spin: readSpin, bonus: readBonus, rush: readRush };
}
