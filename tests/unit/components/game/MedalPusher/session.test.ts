import { describe, expect, it } from 'vitest';

import {
  AIM,
  CHECKERS,
  DROP_INTERVAL,
  FALL_TIME,
  ROLL_TIME,
  TOWER,
  TOWER_SITES,
  ballsOnField,
  buildTowers,
  medalsOnField,
  pusherFront,
  seededRng,
} from '@/components/game/MedalPusher/engine';
import {
  BALL_JACKPOT_CHANCE,
  BOARD,
  BOWL,
  BOWLS,
  CHAIN_GOAL,
  CHALLENGE_CHANCE,
  FALLS,
  FEVER_SQUARE,
  JACKPOT_START,
  JACKPOT_STEP,
  ROULETTE,
  bowlChance,
  drawFall,
  pouredOf,
  rouletteValue,
} from '@/components/game/MedalPusher/lottery';
import {
  BOWL_TIMES,
  MAX_STOCK,
  START_BALLS,
  START_CREDITS,
  TIMING,
  advance,
  bowlShowTime,
  createSession,
  isBusy,
  insert,
  pickChest,
  reachTime,
  refill,
  sugorokuDuration,
  type Session,
  type SessionEvent,
} from '@/components/game/MedalPusher/session';

import { insertAt } from './feeding';

const DT = 1 / 60;
/** Tests that run the machine for a minute or more of its own time get room on a slow machine. */
const LONG = 30_000;

/** Runs the session for `seconds` and returns what happened. */
function play(session: Session, seconds: number): SessionEvent[] {
  const events: SessionEvent[] = [];
  for (let i = 0; i < Math.round(seconds / DT); i++) advance(session, DT, events);
  return events;
}

/** Makes the machine's next draws come out as scripted, then fall back to a fixed value. */
function script(session: Session, values: number[], then = 0.5): void {
  const queue = [...values];
  session.machine.rng = () => queue.shift() ?? then;
}

const types = (events: SessionEvent[]) => events.map((event) => event.type);
const towersOf = (session: Session) => session.machine.medals.filter((m) => m.stack > 1 || m.grow > 0);
/** A session with no balls on the field and one spin held. */
const withSpin = (seed = 5): Session => {
  const session = createSession(seed, { balls: 0 });
  session.stock = 1;
  return session;
};
/** The draw that plays a reach the usual way, and the one that plays it long. It comes last in a spin with a reach. */
const ORDINARY = 0.9;
const DRAWN_OUT = 0.1;
/** The seconds a winning line takes from the start of its spin to the game it leads to, with an ordinary reach. */
const LINE = TIMING.spin + TIMING.reach + TIMING.celebrate;
/** A session with nothing on the field at all, so that a medal laid on it goes where it is put. */
const emptied = (seed = 5): Session => {
  const session = createSession(seed, { balls: 0 });
  session.machine.medals = [];
  script(session, []);
  return session;
};
/** Lays a medal, or a tower of `stack`, on the pusher just past its lip at `x`: the next step takes it over. */
function overTheLip(session: Session, x: number, stack = 1): void {
  const { machine } = session;
  machine.medals.push({ id: machine.nextId++, x, y: pusherFront(machine.time) + 0.5, level: 1, tier: 0, sinceDrop: -1, stack, grow: 0, ball: false, grown: 1 });
}
/** The medals that went through a pocket, as the screen was told of them. */
const pocketed = (events: SessionEvent[]) => events.filter((event) => event.type === 'checker');
/** A chest nobody picks: it keeps the screen busy, so that spins are held and not played. */
const CHEST = { kind: 'chest', prizes: [10, 20, 30], fallback: 0, picked: -1, elapsed: 0, pickedAt: -1, told: false, payout: -1 } as const;

describe('a new session', () => {
  it('starts with a purse, a jackpot, the piece on the first square and two balls on the field', () => {
    const session = createSession(1);
    expect(session.credits).toBe(START_CREDITS);
    expect(session.jackpot).toBe(JACKPOT_START);
    expect(session.square).toBe(0);
    expect(ballsOnField(session.machine)).toBe(START_BALLS);
    expect(ballsOnField(createSession(1, { balls: 0 }).machine)).toBe(0);
    expect(isBusy(session)).toBe(false);
    expect(session.spin).toBeNull();
    expect(session.bonus).toBeNull();
    expect(session.roulette).toBeNull();
    expect(session.quickPick).toBe(false);
    expect(createSession(1, { quickPick: true }).quickPick).toBe(true);
  });

  it('takes a medal from the purse for every drop the machine accepts', () => {
    const session = createSession(2);
    expect(insertAt(session, 50)).toBe(true);
    expect(session.credits).toBe(START_CREDITS - 1);
    expect(session.inserted).toBe(1);
    // That arm's slot is still feeding the first one.
    expect(insertAt(session, 50)).toBe(false);
    expect(session.credits).toBe(START_CREDITS - 1);
    expect(isBusy(session)).toBe(true);
    advance(session, DROP_INTERVAL + 0.01);
    expect(insertAt(session, 50)).toBe(true);
    expect(session.inserted).toBe(2);
  });

  it('takes a medal into either arm, and into both at once: each arm’s slot waits on its own', () => {
    const session = createSession(2, { balls: 0 });
    const aims = [...session.machine.aims];
    // The left arm and the right arm in the same instant: two medals out of the purse, one on each rail.
    expect(insert(session, 0)).toBe(true);
    expect(insert(session, 1)).toBe(true);
    expect(session.credits).toBe(START_CREDITS - 2);
    expect(session.inserted).toBe(2);
    expect(session.machine.rolling.map((medal) => medal.arm)).toEqual([0, 1]);
    // Feeding does not aim: both arms point where they did.
    expect(session.machine.aims).toEqual(aims);
    // Each is busy with its own medal, and neither takes another yet.
    expect(insert(session, 0)).toBe(false);
    expect(insert(session, 1)).toBe(false);
    expect(session.inserted).toBe(2);
    // Held down together, the two feed twice what one does: here for two seconds, a medal each every eleven steps.
    let fed = 0;
    for (let i = 0; i < 120; i++) {
      for (const arm of [0, 1] as const) if (insert(session, arm)) fed++;
      advance(session, DT);
    }
    expect(fed).toBe(20);
    expect(session.inserted).toBe(22);
    expect(session.credits).toBe(START_CREDITS - 22);
    // The last medal in the purse goes into whichever arm asks first, and the other gets none.
    session.credits = 1;
    session.machine.waits = [0, 0];
    expect(insert(session, 1)).toBe(true);
    expect(insert(session, 0)).toBe(false);
    expect(session.credits).toBe(0);
  });

  it('feeds a medal into an arm, where it is one of the field’s medals and keeps the machine busy until it is down', () => {
    const session = createSession(2, { balls: 0 });
    const medals = medalsOnField(session.machine);
    // Landing starts nothing on the screen, here or anywhere: the pockets are at the far end of the pusher.
    expect(insertAt(session, AIM.min)).toBe(true);
    expect(session.machine.rolling).toEqual([{ id: expect.any(Number), arm: 0, remaining: ROLL_TIME }]);
    expect(session.machine.aims[0]).toBe(AIM.min);
    expect(medalsOnField(session.machine)).toBe(medals + 1);
    expect(isBusy(session)).toBe(true);
    // It rolls down the rail, drops off the tip, falls and lands, and only then is the machine at rest.
    expect(types(play(session, ROLL_TIME - 0.05))).toEqual([]);
    expect(session.machine.rolling).toHaveLength(1);
    expect(types(play(session, 0.1))).toEqual([]);
    expect(session.machine.rolling).toHaveLength(0);
    expect(session.machine.falling).toHaveLength(1);
    expect(medalsOnField(session.machine)).toBe(medals + 1);
    expect(isBusy(session)).toBe(true);
    expect(play(session, FALL_TIME)).toEqual([{ type: 'landed', count: 1 }]);
    expect(medalsOnField(session.machine)).toBe(medals + 1);
    expect(isBusy(session)).toBe(false);
  });

  it('stops at an empty purse and refills only then', () => {
    const session = createSession(3);
    expect(refill(session)).toBe(false);
    session.credits = 0;
    expect(insertAt(session, 50)).toBe(false);
    expect(session.inserted).toBe(0);
    expect(refill(session)).toBe(true);
    expect(session.credits).toBe(START_CREDITS);
    expect(session.refills).toBe(1);
  });

  it('grows the jackpot by one medal for every forty dropped', () => {
    const session = createSession(4);
    session.credits = 1000;
    for (let i = 0; i < JACKPOT_STEP * 3 + 5; i++) {
      session.machine.waits = [0, 0];
      insertAt(session, 50);
    }
    expect(session.jackpot).toBe(JACKPOT_START + 3);
    expect(session.jackpotProgress).toBe(5);
  });
});

describe('the slot', () => {
  it('pays nothing for a losing spin and moves straight on to the next', () => {
    const session = withSpin();
    session.stock = 2;
    // A miss with no reach: tier, left digit, the reach roll, right and centre digits.
    script(session, [0.5, 0.1, 0.9, 0.5, 0.5]);
    advance(session, DT);
    expect(session.spin?.result.reach).toBe(false);
    expect(session.spin?.duration).toBeCloseTo(TIMING.spin, 9);
    const events = play(session, TIMING.spin + 0.05);
    expect(session.paidOut).toBe(0);
    expect(session.tiers.miss).toBe(1);
    expect(session.bonus).toBeNull();
    expect(events.filter((event) => event.type === 'spinStart')).toHaveLength(1);
    expect(session.spins).toBe(2);
  });

  it('hurries the reels when spins are queueing behind', () => {
    const session = withSpin();
    session.stock = MAX_STOCK;
    script(session, [0.5, 0.1, 0.9, 0.5, 0.5]);
    advance(session, DT);
    expect(session.spin?.duration).toBeCloseTo(TIMING.quickSpin, 9);
  });

  it('holds eight spins while the screen is busy, and wastes a medal through a pocket beyond that', () => {
    expect(MAX_STOCK).toBe(8);
    const session = emptied();
    session.bonus = { ...CHEST, prizes: [...CHEST.prizes] };
    const events: SessionEvent[] = [];
    // Eleven medals go over the lip through the middle pocket, one after another.
    for (let medal = 0; medal < MAX_STOCK + 3; medal++) {
      overTheLip(session, CHECKERS.positions[1]);
      advance(session, DT, events);
    }
    const hits = pocketed(events);
    expect(hits).toHaveLength(MAX_STOCK + 3);
    expect(hits.every((event) => event.type === 'checker' && event.gate === 1)).toBe(true);
    // The first eight are held, in the order they came; the three after them start nothing.
    expect(hits.map((event) => event.type === 'checker' && event.held)).toEqual([...Array(MAX_STOCK).fill(true), false, false, false]);
    expect(session.hits).toBe(MAX_STOCK + 3);
    expect(session.stock).toBe(MAX_STOCK);
    expect(session.wasted).toBe(3);
    expect(session.spins).toBe(0);
    expect(types(events)).not.toContain('spinStart');
    // They are on the lower table now, medals like any others.
    expect(session.machine.medals.map((medal) => medal.level)).toEqual(Array(MAX_STOCK + 3).fill(0));
  });

  it('holds what it can of a tower that goes over through a pocket, and wastes the rest of it', () => {
    // With the screen free: the tower's medals fill the hold, the rest find it full, and the first of them spins at once.
    const session = emptied();
    overTheLip(session, CHECKERS.positions[2], MAX_STOCK + 3);
    const events = play(session, DT);
    const hits = pocketed(events);
    expect(hits).toHaveLength(MAX_STOCK + 3);
    expect(hits.every((event) => event.type === 'checker' && event.gate === 2)).toBe(true);
    expect(hits.map((event) => event.type === 'checker' && event.held)).toEqual([...Array(MAX_STOCK).fill(true), false, false, false]);
    expect(types(events)).toContain('toppled');
    expect(session.hits).toBe(MAX_STOCK + 3);
    expect(session.wasted).toBe(3);
    expect(session.spins).toBe(1);
    expect(session.stock).toBe(MAX_STOCK - 1);
    // A tower that goes over between two pockets, where the towers go up, starts nothing at all.
    const between = emptied();
    overTheLip(between, (CHECKERS.positions[1] + CHECKERS.positions[2]) / 2, MAX_STOCK + 3);
    const quiet = play(between, DT);
    expect(types(quiet)).toContain('toppled');
    expect(pocketed(quiet)).toEqual([]);
    expect(between.hits).toBe(0);
    expect(between.spins).toBe(0);
  });

  it('starts a spin for a medal that goes over the lip through a pocket, and for no other', () => {
    /** One medal taken over the lip at `x` on an empty field, and what came of it. */
    const over = (x: number) => {
      const session = emptied();
      overTheLip(session, x);
      return { session, events: play(session, 0.1) };
    };
    // Through a pocket: a hit, held for a moment and spun at once. The screen is told which pocket it was.
    CHECKERS.positions.forEach((x, pocket) => {
      const through = over(x);
      expect(pocketed(through.events)).toEqual([{ type: 'checker', gate: pocket, held: true }]);
      expect(through.session.hits).toBe(1);
      expect(through.session.spins).toBe(1);
      expect(through.session.stock).toBe(0);
    });
    // With its middle just off the pocket's, it goes over the lip like any other medal and nothing starts.
    for (const x of [CHECKERS.positions[1] + CHECKERS.halfWidth + 0.1, CHECKERS.positions[0] - CHECKERS.halfWidth - 0.1, AIM.min, AIM.max]) {
      const beside = over(x);
      expect(types(beside.events)).not.toContain('checker');
      expect(beside.session.hits).toBe(0);
      expect(beside.session.spins).toBe(0);
      expect(beside.session.machine.medals.map((medal) => medal.level)).toEqual([0]);
    }
    // And a medal the player feeds starts nothing by landing, even right behind a pocket: it has the pusher to cross first.
    const fed = emptied();
    expect(insertAt(fed, CHECKERS.positions[1])).toBe(true);
    expect(types(play(fed, ROLL_TIME + FALL_TIME + 0.1))).toEqual(['landed']);
    expect(fed.hits).toBe(0);
  });

  it('starts no spin by itself: a machine nobody feeds sends nothing over the lip', () => {
    // Any medal over the lip through a pocket counts, so a new machine must not shed its own heap: three strokes of the pusher and more, and nothing.
    for (const seed of [1, 7, 20261012]) {
      const session = createSession(seed);
      const events = play(session, 12);
      expect(types(events)).not.toContain('checker');
      expect(types(events)).not.toContain('spinStart');
      expect([session.hits, session.spins, session.stock, session.won, session.lost]).toEqual([0, 0, 0, 0, 0]);
    }
  });

  it('holds a winning line up before the game it leads to begins', () => {
    const session = withSpin();
    script(session, [0.03, 0.3, ORDINARY, 0.5]);
    play(session, TIMING.spin + TIMING.reach + 0.05);
    expect(session.spin?.done).toBe(true);
    expect(session.tiers.small).toBe(1);
    expect(session.bonus).toBeNull();
    expect(session.paidOut).toBe(0);
    play(session, TIMING.celebrate);
    expect(session.spin).toBeNull();
    expect(session.bonus?.kind).toBe('sugoroku');
  });

  it('draws a long reach out, and pays the line behind it exactly as it would have', () => {
    expect(reachTime({ tier: 'miss', digits: [4, 7, 2], reach: false, reachKind: 'none' })).toBe(0);
    expect(reachTime({ tier: 'miss', digits: [5, 6, 5], reach: true, reachKind: 'normal' })).toBe(TIMING.reach);
    expect(reachTime({ tier: 'big', digits: [5, 5, 5], reach: true, reachKind: 'long' })).toBeCloseTo(TIMING.reach + TIMING.longReach, 12);
    expect(TIMING.longReach).toBeGreaterThan(0);

    // The same line twice, a four on the die both times: once with an ordinary reach, once with a long one.
    const ordinary = withSpin();
    script(ordinary, [0.03, 0.3, ORDINARY, 0.5]);
    const long = withSpin();
    script(long, [0.03, 0.3, DRAWN_OUT, 0.5]);
    advance(ordinary, DT);
    advance(long, DT);
    expect(ordinary.spin?.result).toEqual({ tier: 'small', digits: [4, 4, 4], reach: true, reachKind: 'normal' });
    expect(long.spin?.result).toEqual({ tier: 'small', digits: [4, 4, 4], reach: true, reachKind: 'long' });
    expect(ordinary.spin?.duration).toBeCloseTo(TIMING.spin + TIMING.reach, 9);
    expect(long.spin?.duration).toBeCloseTo(TIMING.spin + TIMING.reach + TIMING.longReach, 9);
    // When the ordinary reach has stopped, the long one is still turning.
    play(ordinary, TIMING.spin + TIMING.reach + 0.05);
    play(long, TIMING.spin + TIMING.reach + 0.05);
    expect(ordinary.spin?.done).toBe(true);
    expect(long.spin?.done).toBe(false);
    expect(long.tiers.small).toBe(0);
    play(long, TIMING.longReach);
    expect(long.spin?.done).toBe(true);
    expect(long.tiers.small).toBe(1);
    // Both lead to the same roll, the same square and the same medals.
    play(ordinary, TIMING.celebrate + sugorokuDuration(4) + 0.2);
    play(long, TIMING.celebrate + sugorokuDuration(4) + 0.2);
    expect(long.square).toBe(ordinary.square);
    expect(long.paidOut).toBe(ordinary.paidOut);
    expect(long.paidOut).toBe(BOARD[4]);
  });

  it('holds a losing spin as long as its reach lasts, and pays nothing for it', () => {
    const session = withSpin();
    // A miss, a five on the left, a reach, the centre one past, and the reach played long.
    script(session, [0.5, 0.45, 0.1, 0.2, DRAWN_OUT]);
    advance(session, DT);
    expect(session.spin?.result).toEqual({ tier: 'miss', digits: [5, 6, 5], reach: true, reachKind: 'long' });
    expect(session.spin?.duration).toBeCloseTo(TIMING.spin + TIMING.reach + TIMING.longReach, 9);
    play(session, TIMING.spin + TIMING.reach + TIMING.longReach - 0.1);
    expect(session.spin).not.toBeNull();
    expect(session.tiers.miss).toBe(0);
    play(session, 0.2);
    expect(session.spin).toBeNull();
    expect(session.tiers.miss).toBe(1);
    expect(session.paidOut).toBe(0);
    expect(session.bonus).toBeNull();
  });

  it('pays three sevens as a ball, with no medals and no game on the screen', () => {
    const session = withSpin();
    const before = medalsOnField(session.machine);
    script(session, [0.001, 0.5, ORDINARY]);
    const events = play(session, LINE + 0.1);
    expect(session.tiers.seven).toBe(1);
    expect(session.paidOut).toBe(0);
    expect(ballsOnField(session.machine)).toBe(1);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before);
    expect(types(events)).not.toContain('rouletteStart');
    expect(session.bonus).toBeNull();
    expect(session.roulettes).toBe(0);
  });
});

describe('the sugoroku board', () => {
  it('rolls the die, moves the piece and pays the square it lands on', () => {
    const session = withSpin();
    // Three even digits, then a four on the die.
    script(session, [0.03, 0.3, ORDINARY, 0.5]);
    const before = play(session, LINE + 0.05);
    expect(before.find((event) => event.type === 'sugorokuStart')).toMatchObject({ roll: 4, from: 0 });
    expect(session.bonus).toMatchObject({ kind: 'sugoroku', roll: 4, from: 0, payout: -1 });
    expect(session.bonus?.kind === 'sugoroku' && session.bonus.duration).toBeCloseTo(sugorokuDuration(4), 9);
    // The piece has not landed, so the square and the purse are as they were.
    play(session, sugorokuDuration(4) - 0.2);
    expect(session.square).toBe(0);
    expect(session.paidOut).toBe(0);
    const after = play(session, 0.3);
    expect(after.find((event) => event.type === 'sugorokuEnd')).toMatchObject({ square: 4, payout: BOARD[4], fever: false });
    expect(session.square).toBe(4);
    expect(session.paidOut).toBe(BOARD[4]);
    expect(session.machine.growing).toBe(0);
    expect(session.fevers).toBe(0);
    // The prize stays up, then the screen is free again.
    expect(session.bonus).not.toBeNull();
    play(session, TIMING.prize);
    expect(session.bonus).toBeNull();
  });

  it('pays a fever on the fever square and leaves the piece there for the next roll', () => {
    const session = withSpin();
    session.square = FEVER_SQUARE - 2;
    // A two on the die.
    script(session, [0.03, 0.3, ORDINARY, 0.2]);
    const events = play(session, LINE + sugorokuDuration(2) + 0.2);
    expect(events.find((event) => event.type === 'sugorokuEnd')).toMatchObject({ square: FEVER_SQUARE, payout: 30, fever: true });
    expect(session.fevers).toBe(1);
    expect(session.paidOut).toBe(30);
    expect(session.square).toBe(FEVER_SQUARE);
  });

  it('goes round the loop', () => {
    const session = withSpin();
    session.square = 10;
    // A six on the die: ten, eleven, and on round to four.
    script(session, [0.03, 0.3, ORDINARY, 0.99]);
    play(session, LINE + sugorokuDuration(6) + 0.2);
    expect(session.square).toBe(4);
    expect(session.paidOut).toBe(BOARD[4]);
  });
});

describe('the treasure chests', () => {
  /** Three odd digits, the chests left in order (10, 20, 30), and the middle one as the clock's pick. */
  const withChests = (options: { quickPick?: boolean } = {}): Session => {
    const session = createSession(5, { balls: 0, ...options });
    session.stock = 1;
    script(session, [0.01, 0.3, ORDINARY, 0.99, 0.99, 0.5]);
    play(session, LINE + 0.05);
    return session;
  };

  it('puts three chests up and waits for one to be picked', () => {
    const session = withChests();
    expect(session.bonus).toMatchObject({ kind: 'chest', prizes: [10, 20, 30], fallback: 1, picked: -1, payout: -1 });
    play(session, TIMING.choose - 1);
    expect(session.bonus).toMatchObject({ picked: -1, payout: -1 });
    expect(session.paidOut).toBe(0);
  });

  it('opens the chest the player picks and stacks thirty medals as two towers', () => {
    const session = withChests();
    const before = medalsOnField(session.machine);
    expect(pickChest(session, 2)).toBe(true);
    // One pick is all there is.
    expect(pickChest(session, 0)).toBe(false);
    const opening = play(session, TIMING.open - 0.1);
    expect(types(opening)).toContain('chestPicked');
    expect(session.paidOut).toBe(0);
    const opened = play(session, 0.2);
    expect(opened.find((event) => event.type === 'chestEnd')).toMatchObject({ chest: 2, payout: 30 });
    expect(session.paidOut).toBe(30);
    expect(session.machine.payoutQueue).toBe(0);
    expect(towersOf(session)).toHaveLength(2);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before + 30);
    play(session, TIMING.prize + 0.1);
    expect(session.bonus).toBeNull();
  });

  it('throws ten medals on loose', () => {
    const session = withChests();
    pickChest(session, 0);
    play(session, TIMING.open + 0.1);
    expect(session.paidOut).toBe(10);
    expect(session.machine.growing).toBe(0);
    expect(towersOf(session)).toHaveLength(0);
  });

  it('picks for a player who does not, when the time is up', () => {
    const session = withChests();
    const events = play(session, TIMING.choose + TIMING.open + 0.2);
    expect(events.find((event) => event.type === 'chestPicked')).toMatchObject({ chest: 1 });
    expect(events.find((event) => event.type === 'chestEnd')).toMatchObject({ chest: 1, payout: 20 });
    expect(towersOf(session)).toHaveLength(1);
  });

  it('picks at once for the simulation’s player', () => {
    const session = withChests({ quickPick: true });
    expect(session.bonus).toMatchObject({ picked: 1 });
    play(session, TIMING.open + 0.1);
    expect(session.paidOut).toBe(20);
  });

  it('refuses a pick that makes no sense', () => {
    const idle = createSession(5, { balls: 0 });
    expect(pickChest(idle, 0)).toBe(false);
    const session = withChests();
    expect(pickChest(session, 3)).toBe(false);
    expect(pickChest(session, -1)).toBe(false);
    expect(pickChest(session, 0.5)).toBe(false);
    expect(session.bonus).toMatchObject({ picked: -1 });
  });
});

describe('the roulette', () => {
  /** A pocket's index as the draw that picks it. */
  const draw = (pocket: number) => (pocket + 0.5) / ROULETTE.length;
  const TURN = TIMING.roulette;
  const withBall = (draws: number[], then = draw(0)): Session => {
    const session = createSession(6, { balls: 0 });
    session.balls = 1;
    script(session, draws, then);
    return session;
  };

  it('starts when a ball has gone over, ahead of any held spin', () => {
    const session = withBall([draw(1)]);
    session.stock = 2;
    const events: SessionEvent[] = [];
    advance(session, DT, events);
    expect(types(events)).toEqual(['rouletteStart']);
    expect(session.roulette).toMatchObject({ pocket: 1, from: 0, level: 0, total: 0, landed: false, over: false });
    expect(session.roulettes).toBe(1);
    expect(session.balls).toBe(0);
    expect(session.stock).toBe(2);
    expect(session.spins).toBe(0);
  });

  it('ends at once on a cross, with nothing paid', () => {
    const session = withBall([draw(0)]);
    session.stock = 1;
    const events = play(session, TURN + 0.1);
    expect(events.find((event) => event.type === 'rouletteEnd')).toMatchObject({ total: 0, level: 0 });
    expect(types(events)).not.toContain('rouletteStep');
    expect(session.paidOut).toBe(0);
    expect(session.roulette).toMatchObject({ over: true, jackpot: false, gain: 0 });
    // The end stays up, then the held spin gets the screen.
    expect(session.spins).toBe(0);
    play(session, TIMING.prize + 0.1);
    expect(session.roulette).toBeNull();
    expect(session.spins).toBe(1);
  });

  it('stacks every number as a tower and turns again until a cross', () => {
    // Pockets 1, 3 and 7 are 10, 30 and 50; pocket 4 is a cross.
    const session = withBall([draw(1), draw(3), draw(7), draw(4)]);
    const before = medalsOnField(session.machine);
    const first = play(session, TURN + 0.1);
    expect(first.find((event) => event.type === 'rouletteStep')).toMatchObject({ pocket: 1, medals: 10, level: 1 });
    expect(session.roulette).toMatchObject({ level: 1, total: 10, gain: 10, landed: true, over: false });
    expect(session.paidOut).toBe(10);
    expect(towersOf(session)).toHaveLength(1);
    // After a pause the light sets off again from where it stopped.
    play(session, TIMING.step);
    expect(session.roulette).toMatchObject({ pocket: 3, from: 1, landed: false, gain: 0 });
    const rest = play(session, (TURN + TIMING.step) * 2 + TURN + 0.2);
    expect(rest.filter((event) => event.type === 'rouletteStep').map((event) => (event.type === 'rouletteStep' ? event.medals : 0))).toEqual([30, 50]);
    expect(rest.find((event) => event.type === 'rouletteEnd')).toMatchObject({ total: 90, level: 3 });
    expect(types(rest)).not.toContain('bowlStart');
    expect(session.roulette).toMatchObject({ over: true, bowl: null });
    expect(session.paidOut).toBe(90);
    expect(session.jackpots).toBe(0);
    expect(session.machine.payoutQueue).toBe(0);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before + 90);
  });

  it('waits for the game a winning line leads to, then runs ahead of any held spin', () => {
    const session = withSpin();
    session.stock = 2;
    // Three even digits and a two on the die. Every draw after that picks pocket 1,
    // whatever the medals thrown onto the field have drawn in between.
    script(session, [0.03, 0.3, ORDINARY, 0.2], draw(1));
    play(session, TIMING.spin + 0.5);
    // A ball goes over while the reels are still turning.
    session.balls = 1;
    const events = play(session, TIMING.reach + TIMING.celebrate + sugorokuDuration(2) + TIMING.prize + 0.3);
    const order = types(events).filter((type) => ['spinEnd', 'sugorokuStart', 'sugorokuEnd', 'rouletteStart', 'spinStart'].includes(type));
    // The line's own game follows it at once; the roulette takes the next free moment, before the held spin.
    expect(order).toEqual(['spinEnd', 'sugorokuStart', 'sugorokuEnd', 'rouletteStart']);
    expect(session.roulette?.pocket).toBe(1);
    expect(session.balls).toBe(0);
    expect(session.spins).toBe(1);
    // The spin that was held is held still, and with it one for every medal the pusher has sent through a pocket meanwhile.
    expect(session.wasted).toBe(0);
    expect(session.stock).toBe(1 + session.hits);
    // From here every draw is a cross: one number, then the end, then the held spin.
    session.machine.rng = () => draw(0);
    const after = play(session, TURN + TIMING.step + TURN + TIMING.prize + 0.3);
    expect(types(after).filter((type) => type === 'rouletteEnd' || type === 'spinStart')).toEqual(['rouletteEnd', 'spinStart']);
    expect(session.spins).toBe(2);
  });
});

describe('the jackpot challenge', () => {
  const draw = (pocket: number) => (pocket + 0.5) / ROULETTE.length;
  const TURN = TIMING.roulette;
  /** The seconds a full run takes, from the start of its first turn to its last number landing. */
  const RUN = (TURN + TIMING.step) * (CHAIN_GOAL - 1) + TURN;
  /** The seconds from the start of a ball's roulette to the ball being let go in the top bowl. */
  const TO_BOWLS = RUN + TIMING.step;
  /** The three ends, as the draws below come to them: the way down, the bowl it ends in, and the seconds the ball is in the bowls. */
  const ENDS = [
    { way: [0, 0, 0], last: 2, rolling: TIMING.bowl + TIMING.bowlMiddle + TIMING.bowlLast },
    { way: [2], last: 0, rolling: TIMING.bowl },
    { way: [0, 1], last: 1, rolling: TIMING.bowl + TIMING.bowlMiddle },
  ] as const;
  /**
   * A ball whose every draw comes out the same, whatever the field draws in between.
   * Pockets 1, 5 and 9 are all tens, and the draws that pick them pick a way down to the jackpot, to fifty and to a hundred.
   */
  const withRun = (end: number): Session => {
    const session = createSession(6, { balls: 0 });
    session.balls = 1;
    script(session, [], draw([1, 5, 9][end]));
    return session;
  };
  /** Runs the session a step at a time until something of this type happens, and returns it with everything else that happened on the way. */
  function until<T extends SessionEvent['type']>(session: Session, type: T, steps = 60 * 60): { event: Extract<SessionEvent, { type: T }>; events: SessionEvent[] } {
    const events: SessionEvent[] = [];
    for (let i = 0; i < steps; i++) {
      advance(session, DT, events);
      const event = events.find((one): one is Extract<SessionEvent, { type: T }> => one.type === type);
      if (event) return { event, events };
    }
    throw new Error(`no ${type} in ${steps} steps`);
  }
  /** The medals standing in towers, with what each tower has still to gain. */
  const inTowers = (session: Session) => towersOf(session).reduce((sum, tower) => sum + tower.stack + tower.grow, 0);

  it('has the bowls, the pockets and the times its tests rely on', () => {
    expect(CHAIN_GOAL).toBe(4);
    expect(BOWL).toEqual(['jackpot', 50, 100]);
    expect(BOWLS).toEqual([['down', 'down', 50], ['down', 100], ['jackpot']]);
    expect([1, 5, 9].map((pocket) => ROULETTE[pocket])).toEqual([10, 10, 10]);
    expect([1, 5, 9].map((pocket) => FALLS[drawFall(() => draw(pocket))])).toEqual(ENDS.map((end) => end.way));
    expect(TIMING.bowl).toBeCloseTo(6.5, 9);
    // Each bowl has its own time, and none of them is over in a moment.
    expect(BOWL_TIMES).toEqual([TIMING.bowl, TIMING.bowlMiddle, TIMING.bowlLast]);
    expect(BOWL_TIMES).toHaveLength(BOWLS.length);
    for (const time of BOWL_TIMES) expect(time).toBeGreaterThanOrEqual(4);
    // The jackpot is counted out for longer than a prize from one of the upper bowls.
    expect(bowlShowTime(true)).toBe(TIMING.jackpot);
    expect(bowlShowTime(false)).toBe(TIMING.bowlPrize);
    expect(TIMING.jackpot).toBeGreaterThan(TIMING.bowlPrize);
    expect(TIMING.bowlPrize).toBeGreaterThan(TIMING.prize);
  });

  it('lets the ball go in the top bowl after four numbers in a row, its whole way down already drawn', () => {
    const session = withRun(1);
    const run = play(session, RUN + 0.1);
    expect(run.filter((event) => event.type === 'rouletteStep')).toHaveLength(CHAIN_GOAL);
    // The last number is up, and the run is neither over nor in the bowls yet.
    expect(types(run)).not.toContain('bowlStart');
    expect(types(run)).not.toContain('rouletteEnd');
    expect(session.roulette).toMatchObject({ level: 4, total: 40, gain: 10, landed: true, over: false, bowl: null });
    const start = play(session, TIMING.step);
    expect(start.find((event) => event.type === 'bowlStart')).toEqual({ type: 'bowlStart', holes: [2], duration: TIMING.bowl });
    expect(session.roulette?.bowl).toMatchObject({ holes: [2], stage: 0, duration: TIMING.bowl, payout: -1 });
    // While the ball rolls there is no fifth turn and nothing more is paid.
    const rolling = play(session, TIMING.bowl - 0.3);
    expect(types(rolling)).not.toContain('rouletteStep');
    expect(types(rolling)).not.toContain('bowlEnd');
    expect(session.roulette).toMatchObject({ level: 4, total: 40, over: false, jackpot: false });
    expect(session.paidOut).toBe(40);
    expect(isBusy(session)).toBe(true);
  });

  it('lets the ball down from bowl to bowl through the holes that lead down, each bowl in its own time', () => {
    const session = withRun(0);
    play(session, TO_BOWLS - 0.1);
    const { events: first } = until(session, 'bowlStart');
    expect(types(first).filter((type) => type.startsWith('bowl'))).toEqual(['bowlStart']);
    // Through the first hole of the top bowl into the middle one, where its time starts again.
    let steps = 0;
    const count = () => (steps += 1);
    const dropped: SessionEvent[] = [];
    while (!dropped.some((event) => event.type === 'bowlDrop')) {
      advance(session, DT, dropped);
      count();
    }
    expect(dropped).toContainEqual({ type: 'bowlDrop', bowl: 1, hole: 0, duration: TIMING.bowlMiddle });
    expect(Math.abs(steps * DT - TIMING.bowl)).toBeLessThan(2 * DT);
    expect(session.roulette?.bowl).toEqual({ holes: [0, 0, 0], stage: 1, elapsed: 0, duration: TIMING.bowlMiddle, payout: -1 });
    // Nothing is paid for getting down a bowl, and the run goes on.
    expect(session.paidOut).toBe(40);
    expect(session.roulette).toMatchObject({ over: false, jackpot: false, gain: 0, total: 40 });
    // Then through the middle bowl's hole into the bottom one.
    const { event: second } = until(session, 'bowlDrop');
    expect(second).toEqual({ type: 'bowlDrop', bowl: 2, hole: 0, duration: TIMING.bowlLast });
    expect(session.roulette?.bowl).toMatchObject({ stage: 2, elapsed: 0, duration: TIMING.bowlLast, payout: -1 });
    expect(session.paidOut).toBe(40);
    // And the bottom bowl's one hole is the jackpot's.
    const { event: end, events: last } = until(session, 'bowlEnd');
    expect(types(last).filter((type) => type.startsWith('bowl'))).toEqual(['bowlEnd']);
    expect(end).toMatchObject({ bowl: 2, hole: 0, jackpot: true, payout: JACKPOT_START });
  });

  it('pays fifty from the top bowl or a hundred from the middle one, part poured and the rest as towers, and leaves the jackpot alone', () => {
    for (const [end, medals] of [
      [1, 50],
      [2, 100],
    ]) {
      const { way, last, rolling } = ENDS[end];
      const session = withRun(end);
      session.jackpot = 337;
      session.jackpotProgress = 12;
      const before = medalsOnField(session.machine);
      play(session, TO_BOWLS + rolling - 0.2);
      const stacked = inTowers(session);
      const { event, events } = until(session, 'bowlEnd');
      expect(event).toEqual({ type: 'bowlEnd', bowl: last, hole: way[last], payout: medals, poured: pouredOf(medals), total: 40 + medals, jackpot: false });
      // The ball ends the run: there is no cross to announce.
      expect(types(events)).not.toContain('rouletteEnd');
      expect(session.roulette).toMatchObject({ over: true, jackpot: false, gain: medals, total: 40 + medals });
      expect(session.roulette?.bowl).toMatchObject({ holes: way, stage: last, payout: medals });
      // In the step it is paid: so many waiting to be poured, and the rest in towers that have still to go up.
      expect(session.machine.payoutQueue).toBe(pouredOf(medals));
      expect(inTowers(session) - stacked).toBe(medals - pouredOf(medals));
      expect(session.paidOut).toBe(40 + medals);
      expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before + 40 + medals);
      expect(session.jackpots).toBe(0);
      expect(session.jackpot).toBe(337);
      expect(session.jackpotProgress).toBe(12);
      // The prize stays up while it is counted out, then the screen is free.
      play(session, TIMING.bowlPrize - 0.4);
      expect(session.roulette).not.toBeNull();
      play(session, 0.5);
      expect(session.roulette).toBeNull();
      // And every medal of it has been thrown on or stacked by then, or is about to be.
      play(session, 3);
      expect(session.machine.payoutQueue).toBe(0);
      expect(session.machine.growing).toBe(0);
      expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before + 40 + medals);
    }
  });

  it('pays the jackpot when the ball drops into the hole of the bottom bowl, part poured and the rest as towers, and starts it over', () => {
    const session = withRun(0);
    session.jackpot = 337;
    session.jackpotProgress = 12;
    const before = medalsOnField(session.machine);
    const events = play(session, TO_BOWLS + ENDS[0].rolling - 0.2);
    expect(types(events).filter((type) => type.startsWith('bowl'))).toEqual(['bowlStart', 'bowlDrop', 'bowlDrop']);
    const stacked = inTowers(session);
    const { event, events: last } = until(session, 'bowlEnd');
    expect(event).toEqual({ type: 'bowlEnd', bowl: 2, hole: 0, payout: 337, poured: 101, total: 40 + 337, jackpot: true });
    expect(types(last)).not.toContain('rouletteEnd');
    expect(session.roulette).toMatchObject({ over: true, jackpot: true, gain: 337, total: 377 });
    expect(session.jackpots).toBe(1);
    expect(session.jackpot).toBe(JACKPOT_START);
    expect(session.jackpotProgress).toBe(0);
    // A hundred and one medals wait to be poured from the lip, and the other 236 are towers going up.
    expect(session.machine.payoutQueue).toBe(101);
    expect(inTowers(session) - stacked).toBe(236);
    expect(session.paidOut).toBe(377);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before + 377);
    expect(isBusy(session)).toBe(true);
    // It is paid once, it stays up while it is counted out, and then the run is over.
    const during = play(session, TIMING.jackpot - 0.3);
    expect(types(during).filter((type) => type.startsWith('roulette') || type.startsWith('bowl'))).toEqual([]);
    expect(session.roulette).not.toBeNull();
    const after = play(session, 0.5);
    expect(types(after).filter((type) => type.startsWith('roulette') || type.startsWith('bowl'))).toEqual([]);
    expect(session.roulette).toBeNull();
    expect(session.paidOut).toBe(377);
    // The pour goes on after the screen has moved on, until every medal owed is on the field.
    play(session, 8);
    expect(session.machine.payoutQueue).toBe(0);
    expect(session.machine.growing).toBe(0);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before + 377);
  });

  it('pays the jackpot as it stands when the ball drops', () => {
    const session = withRun(0);
    play(session, TO_BOWLS + 1);
    // Medals dropped while the ball is in the bowls still count.
    session.jackpot = JACKPOT_START + 3;
    const { event } = until(session, 'bowlEnd');
    expect(event).toMatchObject({ payout: JACKPOT_START + 3, poured: pouredOf(JACKPOT_START + 3), jackpot: true });
    expect(session.jackpot).toBe(JACKPOT_START);
  });

  it('pays every jackpot of a few hundred exactly what is owed, whichever way the ball went and however big it is', () => {
    const session = createSession(12, { balls: 0 });
    // Nobody is feeding this machine: its field starts bare, and is swept bare again as soon as each prize has been counted.
    const sweep = () => {
      session.machine.medals = [];
      session.machine.falling = [];
      session.machine.payoutQueue = 0;
      session.machine.growing = 0;
    };
    sweep();
    const runs = 300;
    let owed = 0;
    for (let i = 0; i < runs; i++) {
      // Jackpots from where one starts up to more than the pusher has places for in towers, down either of the top bowl's holes.
      const jackpot = JACKPOT_START + ((i * 37) % 900);
      const down = i % 2;
      session.jackpot = jackpot;
      session.jackpotProgress = i % 40;
      session.balls = 1;
      // Four tens, then the draw that goes down this hole of the top bowl and on to the jackpot.
      const draws = [draw(1), draw(1), draw(1), draw(1), (down + 0.5) / FALLS.length];
      session.machine.rng = () => draws.shift() ?? draw(1);
      const paidBefore = session.paidOut;
      let end: SessionEvent | undefined;
      const drops: number[][] = [];
      for (let step = 0; session.roulette || step === 0; step++) {
        if (step > 400) throw new Error('the run never ended');
        const events: SessionEvent[] = [];
        const lying = medalsOnField(session.machine);
        const gone = session.won + session.lost;
        advance(session, 0.5, events);
        for (const event of events) if (event.type === 'bowlDrop') drops.push([event.bowl, event.hole]);
        // A tower from one of the four tens is swept as it is paid: this is about the jackpot.
        if (events.some((event) => event.type === 'rouletteStep')) sweep();
        const paid = events.find((event) => event.type === 'bowlEnd');
        if (!paid || paid.type !== 'bowlEnd') continue;
        end = paid;
        // In the step it is paid, every medal of it is on the field: waiting to be poured, or in a tower, standing or still to go up.
        const poured = pouredOf(jackpot);
        expect(medalsOnField(session.machine) + session.won + session.lost - lying - gone).toBe(jackpot);
        const stacked = session.machine.medals.reduce((sum, medal) => sum + medal.stack + medal.grow, 0);
        expect(stacked + session.machine.payoutQueue).toBe(jackpot);
        // What the towers cannot hold is poured with the rest: the pusher has places for 450 in towers.
        expect(stacked).toBe(Math.min(jackpot - poured, TOWER_SITES * TOWER.max));
        expect(session.machine.payoutQueue).toBe(jackpot - stacked);
        sweep();
      }
      // The count it gives of what is poured is what was really poured, the towers' overflow with the rest.
      const towers = Math.min(jackpot - pouredOf(jackpot), TOWER_SITES * TOWER.max);
      expect(end).toEqual({ type: 'bowlEnd', bowl: 2, hole: 0, payout: jackpot, poured: jackpot - towers, total: 40 + jackpot, jackpot: true });
      expect(drops).toEqual([
        [1, down],
        [2, 0],
      ]);
      // Paid once, and all of it: four tens and the jackpot to the medal.
      expect(session.paidOut - paidBefore).toBe(40 + jackpot);
      expect(session.jackpots).toBe(i + 1);
      expect(session.jackpot).toBe(JACKPOT_START);
      expect(session.jackpotProgress).toBe(0);
      owed += 40 + jackpot;
    }
    expect(session.paidOut).toBe(owed);
    expect(owed).toBeGreaterThan(runs * 600);
  });

  /**
   * A machine with a bare field and a full run behind it, the ball at the very moment it drops into the last hole of
   * `way`, and `taken` of the pusher's places for towers already standing full. The prize is paid in a step of no
   * time, so the pusher is where it was when those towers went up and each still stands on its place.
   */
  const atTheDrop = (way: readonly number[], taken: number, jackpot = JACKPOT_START): Session => {
    const session = createSession(12, { balls: 0 });
    Object.assign(session.machine, { medals: [], falling: [], payoutQueue: 0, growing: 0 });
    session.jackpot = jackpot;
    session.roulettes = 1;
    const stage = way.length - 1;
    session.roulette = {
      pocket: 1,
      from: 1,
      elapsed: TURN + TIMING.step,
      duration: TURN,
      landed: true,
      level: CHAIN_GOAL,
      total: 40,
      gain: 0,
      over: false,
      jackpot: false,
      bowl: { holes: [...way], stage, elapsed: BOWL_TIMES[stage], duration: BOWL_TIMES[stage], payout: -1 },
    };
    buildTowers(session.machine, TOWER.max * taken);
    return session;
  };

  it.each([
    ['a jackpot with every place for a tower free', ENDS[0].way, 0, 300, 90],
    ['a jackpot with some of the places taken', ENDS[0].way, 14, 300, 200],
    ['a jackpot with one place left', ENDS[0].way, TOWER_SITES - 1, 300, 275],
    ['a jackpot with no place free', ENDS[0].way, TOWER_SITES, 300, 300],
    ['a jackpot of 1,199 medals, more than the pusher has places for', ENDS[0].way, 0, 1199, 749],
    ['a jackpot of 1,199 medals with some of the places taken', ENDS[0].way, 10, 1199, 999],
    ['fifty with every place free', ENDS[1].way, 0, 300, 15],
    ['fifty with one place left', ENDS[1].way, TOWER_SITES - 1, 300, 25],
    ['fifty with no place free', ENDS[1].way, TOWER_SITES, 300, 50],
    ['a hundred with two places left', ENDS[2].way, TOWER_SITES - 2, 300, 50],
    ['a hundred with no place free', ENDS[2].way, TOWER_SITES, 300, 100],
  ] as const)('says how many medals are really poured: %s', (_name, way, taken, jackpot, poured) => {
    const session = atTheDrop(way, taken, jackpot);
    // The towers in the way stand full, each on a place of its own, and nothing waits to be poured.
    expect(towersOf(session)).toHaveLength(taken);
    expect(inTowers(session)).toBe(TOWER.max * taken);
    expect(session.machine.payoutQueue).toBe(0);
    const before = medalsOnField(session.machine);
    const events: SessionEvent[] = [];
    advance(session, 0, events);
    const end = events.find((event): event is Extract<SessionEvent, { type: 'bowlEnd' }> => event.type === 'bowlEnd');
    if (!end) throw new Error('the ball did not drop');
    const last = way.length - 1;
    const payout = last === 2 ? jackpot : last === 0 ? 50 : 100;
    expect(end).toEqual({ type: 'bowlEnd', bowl: last, hole: way[last], payout, poured, total: 40 + payout, jackpot: last === 2 });
    // What it says is poured is what the prize added to the queue: the share that always is, and all the free places could not hold.
    const room = (TOWER_SITES - taken) * TOWER.max;
    expect(poured).toBe(payout - Math.min(payout - pouredOf(payout), room));
    expect(poured).toBeGreaterThanOrEqual(pouredOf(payout));
    expect(session.machine.payoutQueue).toBe(poured);
    // The rest went up as towers, on free places only, and the two together are the prize to the medal.
    expect(inTowers(session) - TOWER.max * taken).toBe(payout - poured);
    expect(towersOf(session).length).toBeLessThanOrEqual(TOWER_SITES);
    expect(session.paidOut).toBe(payout);
    expect(medalsOnField(session.machine) - before).toBe(payout);
    expect(session.roulette).toMatchObject({ over: true, gain: payout, total: 40 + payout });
  });

  it('holds the screen until the ball has dropped for good and its prize has been up', () => {
    const session = withRun(2);
    session.stock = 2;
    play(session, TO_BOWLS + 0.1);
    expect(session.roulette?.bowl).not.toBeNull();
    // Another ball goes over while this one is in the bowls.
    session.balls = 1;
    const during = play(session, ENDS[2].rolling + TIMING.bowlPrize - 0.3);
    expect(types(during).filter((type) => ['rouletteStart', 'spinStart', 'sugorokuStart', 'chestStart'].includes(type))).toEqual([]);
    expect(types(during).filter((type) => type.startsWith('bowl'))).toEqual(['bowlDrop', 'bowlEnd']);
    expect(session.spins).toBe(0);
    expect(session.roulettes).toBe(1);
    // Then the waiting ball has its roulette, ahead of the held spins.
    const after = play(session, 0.4);
    expect(types(after).filter((type) => type === 'rouletteStart' || type === 'spinStart')).toEqual(['rouletteStart']);
    expect(session.roulette).toMatchObject({ level: 0, total: 0, bowl: null, over: false });
    expect(session.roulettes).toBe(2);
    // Neither held spin has been played, and the medals the pusher sent through a pocket meanwhile are held with them.
    expect(session.wasted).toBe(0);
    expect(session.stock).toBe(2 + session.hits);
  });

  it('gets to the bowls, down them and to the jackpot as often as the exact odds say', () => {
    // Ball after ball in big steps of time. This is about the screen, so the field is kept bare all the while: whatever
    // a prize puts on it is swept off in the step it is paid, and nothing piles up for the pusher to work on.
    const session = createSession(9, { balls: 0 });
    session.machine.rng = seededRng(4242);
    const runs = 6000;
    const events: SessionEvent[] = [];
    for (let i = 0; i < runs; i++) {
      session.balls = 1;
      do {
        advance(session, 0.5, events);
        session.machine.medals = [];
        session.machine.falling = [];
        session.machine.payoutQueue = 0;
        session.machine.growing = 0;
      } while (session.roulette);
    }
    const count = (type: SessionEvent['type']) => events.filter((event) => event.type === type).length;
    expect(session.roulettes).toBe(runs);
    expect(count('rouletteStart')).toBe(runs);
    // Every run ends once: on a cross, or with the ball in a hole that holds a prize.
    expect(count('rouletteEnd') + count('bowlEnd')).toBe(runs);
    expect(count('bowlStart')).toBe(count('bowlEnd'));
    const within = (seen: number, p: number) => Math.abs(seen / runs - p) < 4 * Math.sqrt((p * (1 - p)) / runs);
    expect(within(count('bowlStart'), CHALLENGE_CHANCE)).toBe(true);
    expect(within(session.jackpots, BALL_JACKPOT_CHANCE)).toBe(true);
    // Of the balls in the top bowl, two in three get to the middle one and one in three to the bottom.
    const into = (bowl: number) => events.filter((event) => event.type === 'bowlDrop' && event.bowl === bowl).length;
    expect(within(into(1), CHALLENGE_CHANCE * bowlChance(1))).toBe(true);
    expect(within(into(2), CHALLENGE_CHANCE * bowlChance(2))).toBe(true);
    // Every ball that gets to the bottom bowl wins the jackpot, and no other does.
    expect(into(2)).toBe(session.jackpots);
    // Nobody drops a medal, so the jackpot stays where it starts and a ball is worth its exact average.
    // What one ball pays varies by about 99 medals, so the mean of 6,000 varies by about 1.3.
    expect(session.jackpot).toBe(JACKPOT_START);
    expect(Math.abs(session.paidOut / runs - rouletteValue(JACKPOT_START))).toBeLessThan(6);
  }, LONG);
});

describe('a session played for a while', () => {
  it('keeps its books: medals, the purse, medals through the pockets and spins all add up', () => {
    const session = createSession(77, { quickPick: true });
    const start = medalsOnField(session.machine);
    const events: SessionEvent[] = [];
    let clock = 1;
    for (let i = 0; i < 60 * 100; i++) {
      if (clock >= 0.2) {
        clock = 0;
        if (session.credits === 0) refill(session);
        insertAt(session, CHECKERS.positions[1]);
      }
      advance(session, DT, events);
      clock += DT;
    }
    expect(session.inserted).toBeGreaterThan(400);
    expect(start + session.inserted + session.paidOut).toBe(medalsOnField(session.machine) + session.won + session.lost);
    expect(session.credits).toBe(START_CREDITS * (1 + session.refills) - session.inserted + session.won);
    // Every medal through a pocket either started a spin, is held, or found the machine full.
    expect(session.hits).toBe(session.spins + session.stock + session.wasted);
    expect(pocketed(events)).toHaveLength(session.hits);
    expect(session.hits).toBeGreaterThan(50);
    // At five a second the reels cannot keep up with a player who feeds the middle, even with eight held.
    expect(session.wasted).toBeGreaterThan(0);
    expect(session.stock).toBeLessThanOrEqual(MAX_STOCK);
    const finished = session.tiers.miss + session.tiers.small + session.tiers.big + session.tiers.seven;
    expect(finished).toBe(session.spins - (session.spin && !session.spin.done ? 1 : 0));
    // Both balls it started with have gone over and had their roulette.
    const count = (type: SessionEvent['type']) => events.filter((event) => event.type === type).length;
    const ballsOver = events.reduce((sum, event) => sum + (event.type === 'ball' ? event.count : 0), 0);
    expect(ballsOver).toBeGreaterThanOrEqual(START_BALLS);
    expect(session.roulettes + session.balls).toBe(ballsOver);
    expect(events.reduce((sum, event) => sum + (event.type === 'won' ? event.count : 0), 0)).toBe(session.won);
    // Every game the slot led to was started once, and none overlapped another.
    expect(count('sugorokuStart') + count('chestStart')).toBeLessThanOrEqual(session.tiers.small + session.tiers.big);
    expect(count('sugorokuEnd')).toBeLessThanOrEqual(count('sugorokuStart'));
    expect(count('chestEnd')).toBeLessThanOrEqual(count('chestStart'));
    expect(session.square).toBeGreaterThanOrEqual(0);
    expect(session.square).toBeLessThan(BOARD.length);
  }, LONG);

  it('plays out the same way from the same seed', () => {
    const play300 = () => {
      const session = createSession(31337);
      let clock = 1;
      for (let i = 0; i < 60 * 60; i++) {
        if (clock >= 0.25) {
          clock = 0;
          insertAt(session, [25, 50, 75][session.inserted % 3]);
        }
        advance(session, DT);
        clock += DT;
      }
      return [session.inserted, session.won, session.lost, session.hits, session.spins, session.paidOut, session.credits, session.jackpot, session.roulettes, session.square];
    };
    expect(play300()).toEqual(play300());
  }, LONG);
});
