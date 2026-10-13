import { describe, expect, it } from 'vitest';

import { CATCHER, caught } from '@/components/game/MedalPusher/catcher';
import {
  AIM,
  CHECKERS,
  DROP_INTERVAL,
  FALL_TIME,
  FIELD,
  JEWEL_DROP,
  MAX_STEP,
  PUSHER,
  ROLL_TIME,
  START_RIDE,
  TOWER,
  TOWER_SITES,
  aimArm,
  ballsOnField,
  buildTowers,
  checkerAt,
  jewelsOnField,
  luckySlot,
  medalsOnField,
  pusherFront,
  seededRng,
  slotWidthAt,
  step,
  towerSizes,
} from '@/components/game/MedalPusher/engine';
import {
  BALL_JACKPOT_CHANCE,
  BOARD,
  BOWL,
  BOWLS,
  CHAIN_GOAL,
  CHALLENGE_CHANCE,
  CHANCE,
  CHANCE_BONUS,
  CHEST_TOWERS_FROM,
  FALLS,
  FEVER_SQUARE,
  JACKPOT_START,
  JACKPOT_STEP,
  JEWEL,
  JEWEL_SET,
  ROULETTE,
  bowlChance,
  chanceSpinValue,
  drawFall,
  pouredOf,
  rouletteValue,
  spinValue,
  squareAfter,
} from '@/components/game/MedalPusher/lottery';
import {
  BOWL_TIMES,
  MAX_STOCK,
  START_BALLS,
  START_CREDITS,
  START_JEWELS,
  TIMING,
  advance,
  bowlShowTime,
  chanceLeft,
  createSession,
  isBusy,
  insert,
  jewelsCollected,
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
/** The medals that went through a pocket, as the screen was told of them: each as it dropped in, a ride after it came over the lip. */
const pocketed = (events: SessionEvent[]) => events.filter((event) => event.type === 'checker');
/** The medals the lip's rule counted, as the screen was told of them: each as it came over on to its tongue. */
const riders = (events: SessionEvent[]) => events.filter((event) => event.type === 'riding');
/** The steps a medal the lip's rule has counted is on its tongue for: the machine takes it in the last of them. */
const RIDE = Math.round(START_RIDE / DT);
/** Lets every medal that is on its tongue ride it out and drop into its pocket, and says what happened on the way. */
function rideOut(session: Session, events: SessionEvent[] = []): SessionEvent[] {
  for (let i = 0; i <= RIDE && session.riding.length > 0; i++) advance(session, DT, events);
  expect(session.riding).toEqual([]);
  return events;
}
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
    // Eleven medals go over the lip through the middle pocket, one after another. None is the machine's yet: each is on its tongue.
    for (let medal = 0; medal < MAX_STOCK + 3; medal++) {
      overTheLip(session, CHECKERS.positions[1]);
      advance(session, DT, events);
    }
    expect(riders(events)).toHaveLength(MAX_STOCK + 3);
    expect(pocketed(events)).toEqual([]);
    expect([session.riding.length, session.hits, session.stock, session.wasted]).toEqual([MAX_STOCK + 3, 0, 0, 0]);
    // They drop into the pocket a ride later, in the order they came over, and that is when the machine takes each.
    rideOut(session, events);
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
    // With the screen free: the tower's medals fill the hold, the rest find it full, and the first of them spins at
    // once. All of that a ride after the tower went over, as it is for a medal by itself.
    const session = emptied();
    overTheLip(session, CHECKERS.positions[2], MAX_STOCK + 3);
    const events = play(session, DT);
    expect(types(events)).toContain('toppled');
    expect([riders(events).length, pocketed(events).length, session.hits, session.spins]).toEqual([MAX_STOCK + 3, 0, 0, 0]);
    rideOut(session, events);
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
    // Through a pocket: it rides its tongue, drops in, and is a hit, held for a moment and spun at once. The screen
    // is told which pocket it was, and whether it was the one the lucky lamp was on as the medal came over, which
    // on a new machine is the left one.
    expect(luckySlot(0)).toBe(0);
    CHECKERS.positions.forEach((x, pocket) => {
      const through = over(x);
      // A tenth of a second after it came over it is still on its tongue, and the machine has not taken it.
      expect(through.events.filter((event) => event.type === 'riding' || event.type === 'checker' || event.type === 'spinStart')).toEqual([
        { type: 'riding', gate: pocket, lit: pocket === 0, seconds: START_RIDE },
      ]);
      expect([through.session.hits, through.session.spins, through.session.stock, through.session.riding.length]).toEqual([0, 0, 0, 1]);
      expect(isBusy(through.session)).toBe(true);
      const dropped = rideOut(through.session);
      expect(pocketed(dropped)).toEqual([{ type: 'checker', gate: pocket, held: true, gold: false, lucky: pocket === 0 }]);
      // The spin starts in the step the medal drops, after the screen has been told of the medal.
      expect(types(dropped).filter((type) => type === 'checker' || type === 'spinStart')).toEqual(['checker', 'spinStart']);
      expect(through.session.hits).toBe(1);
      expect(through.session.spins).toBe(1);
      expect(through.session.stock).toBe(0);
    });
    // With its middle just off the pocket's, it goes over the lip like any other medal and nothing starts.
    for (const x of [CHECKERS.positions[1] + CHECKERS.halfWidth + 0.1, CHECKERS.positions[0] - CHECKERS.halfWidth - 0.1, AIM.min, AIM.max]) {
      const beside = over(x);
      expect(types(beside.events)).not.toContain('riding');
      expect(beside.session.riding).toEqual([]);
      expect(types(play(beside.session, START_RIDE))).not.toContain('checker');
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
   * No jewel lies on its field: one that the pour pushed over the front would be paid for, and these are the bowls' books.
   */
  const withRun = (end: number): Session => {
    const session = createSession(6, { balls: 0, jewels: 0 });
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

  it.each([
    ['the jackpot', ENDS[0].way, 300],
    ['the fifty', ENDS[1].way, 50],
    ['the hundred', ENDS[2].way, 100],
  ] as const)('pays %s the same with gold spins held: chance time pays a square or a chest over, never a ball', (_name, way, payout) => {
    const ended = (session: Session) => {
      const events: SessionEvent[] = [];
      advance(session, 0, events);
      return events.find((event) => event.type === 'bowlEnd');
    };
    const ordinary = atTheDrop(way, 0);
    // The same machine with the hold full and three of the held spins gold; and, though the machine is never
    // there with a ball in the bowls, with the screen itself marked as a gold spin's.
    const held = atTheDrop(way, 0);
    Object.assign(held, { stock: MAX_STOCK, gold: 3, gilded: 3, wasted: 3 });
    const marked = atTheDrop(way, 0);
    Object.assign(marked, { stock: MAX_STOCK, gold: 3, gilded: 4, wasted: 4, chance: true });
    const end = ended(ordinary);
    expect(end).toMatchObject({ type: 'bowlEnd', payout, total: 40 + payout });
    for (const session of [held, marked]) {
      expect(ended(session)).toEqual(end);
      expect(session.paidOut).toBe(payout);
      expect(session.machine.payoutQueue).toBe(ordinary.machine.payoutQueue);
      expect(inTowers(session)).toBe(inTowers(ordinary));
      // The gold spins are still held, as gold as they were.
      expect(session.gold).toBe(3);
    }
    expect(chanceLeft(held)).toBe(3);
    expect(CHANCE.multiplier).toBeGreaterThan(1);
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

/** Lays a jewel on the lower table just past its front edge: the next step takes it over. */
function overTheFront(session: Session, x = 50): void {
  const { machine } = session;
  machine.medals.push({ id: machine.nextId++, x, y: FIELD.depth + 0.1, level: 0, tier: 0, sinceDrop: -1, stack: 1, grow: 0, ball: false, grown: 1, jewel: true });
}

describe('the jewels', () => {
  it('lie on a new machine, two of them, with no lamp lit', () => {
    const session = createSession(1);
    expect(START_JEWELS).toBe(2);
    expect(jewelsOnField(session.machine)).toBe(START_JEWELS);
    expect([session.jewels, session.jewelBonuses, jewelsCollected(session)]).toEqual([0, 0, 0]);
    expect(jewelsOnField(createSession(1, { jewels: 0 }).machine)).toBe(0);
    expect(jewelsOnField(createSession(1, { jewels: 1 }).machine)).toBe(1);
    // The balls are where they were before there were jewels.
    expect(ballsOnField(session.machine)).toBe(START_BALLS);
  });

  it('come out of the hatch with a treasure line, as its chests go up, and with no other line', () => {
    const line = (draws: number[]) => {
      const session = createSession(5, { balls: 0, jewels: 0 });
      session.stock = 1;
      script(session, draws);
      const before = medalsOnField(session.machine);
      const events = play(session, LINE + 0.05);
      return { session, events, before };
    };
    // Three odd digits: the chests, and a jewel in the air, bound for the middle of the lower table.
    const treasure = line([0.01, 0.3, ORDINARY, 0.99, 0.99, 0.5]);
    expect(treasure.session.tiers.big).toBe(1);
    expect(types(treasure.events).filter((type) => type === 'chestStart' || type === 'jewelDrop')).toEqual(['chestStart', 'jewelDrop']);
    expect(jewelsOnField(treasure.session.machine)).toBe(1);
    const [falling] = treasure.session.machine.falling.filter((medal) => medal.jewel);
    expect(falling.x).toBe((JEWEL_DROP.from + JEWEL_DROP.to) / 2);
    // It is not a medal, and nothing has been paid for it.
    expect(medalsOnField(treasure.session.machine) + treasure.session.won + treasure.session.lost).toBe(treasure.before);
    expect(treasure.session.paidOut).toBe(0);
    // It is down before the chest is opened, and lies on the lower table.
    play(treasure.session, JEWEL_DROP.time + 0.1);
    expect(treasure.session.machine.medals.filter((medal) => medal.jewel).map((medal) => medal.level)).toEqual([0]);
    // Three even digits and three sevens let none go.
    const sugoroku = line([0.03, 0.3, ORDINARY, 0.5]);
    expect(sugoroku.session.tiers.small).toBe(1);
    const sevens = line([0.001, 0.5, ORDINARY]);
    expect(sevens.session.tiers.seven).toBe(1);
    for (const other of [sugoroku, sevens]) {
      expect(types(other.events)).not.toContain('jewelDrop');
      expect(jewelsOnField(other.session.machine)).toBe(0);
    }
  });

  it('pay a prize at once when one goes over the front, thrown on loose, and light a lamp', () => {
    const session = emptied();
    overTheFront(session);
    const events: SessionEvent[] = [];
    advance(session, DT, events);
    expect(events.filter((event) => event.type === 'jewel')).toEqual([{ type: 'jewel', lamps: 1, payout: JEWEL.prize }]);
    expect(types(events)).not.toContain('won');
    expect(types(events)).not.toContain('ball');
    expect([session.jewels, session.jewelBonuses, jewelsCollected(session)]).toEqual([1, 0, 1]);
    // The prize is the machine's to throw on. The jewel itself is neither a medal won nor a ball.
    expect(session.paidOut).toBe(JEWEL.prize);
    expect(medalsOnField(session.machine)).toBe(JEWEL.prize);
    expect(towersOf(session)).toHaveLength(0);
    expect([session.won, session.balls, session.credits]).toEqual([0, 0, START_CREDITS]);
    expect(jewelsOnField(session.machine)).toBe(0);
  });

  it('pay the bonus as a tower for the jewel that would light the last lamp, and put the lamps out', () => {
    const session = emptied();
    session.jewels = JEWEL.lamps - 1;
    overTheFront(session);
    const events: SessionEvent[] = [];
    advance(session, DT, events);
    expect(events.filter((event) => event.type === 'jewelBonus' || event.type === 'jewel')).toEqual([{ type: 'jewelBonus', payout: JEWEL.bonus }]);
    expect([session.jewels, session.jewelBonuses, jewelsCollected(session)]).toEqual([0, 1, JEWEL.lamps]);
    expect(session.paidOut).toBe(JEWEL.bonus);
    expect(session.machine.payoutQueue).toBe(0);
    expect(towersOf(session)).toHaveLength(towerSizes(JEWEL.bonus).length);
    expect(medalsOnField(session.machine)).toBe(JEWEL.bonus);
  });

  it('pay a set of five what the odds say, one lamp at a time, and start the next set from nothing', () => {
    const session = emptied();
    const events: SessionEvent[] = [];
    for (let jewel = 1; jewel <= JEWEL.lamps + 1; jewel++) {
      overTheFront(session, 20 + jewel * 8);
      advance(session, DT, events);
      if (jewel < JEWEL.lamps) expect([session.jewels, session.paidOut]).toEqual([jewel, jewel * JEWEL.prize]);
      if (jewel === JEWEL.lamps) expect([session.jewels, session.paidOut]).toEqual([0, JEWEL_SET]);
    }
    expect(types(events).filter((type) => type.startsWith('jewel'))).toEqual(['jewel', 'jewel', 'jewel', 'jewel', 'jewelBonus', 'jewel']);
    expect([session.jewels, session.jewelBonuses, jewelsCollected(session), session.paidOut]).toEqual([1, 1, JEWEL.lamps + 1, JEWEL_SET + JEWEL.prize]);
    // Two that go over in the same step are two jewels.
    overTheFront(session, 30);
    overTheFront(session, 70);
    advance(session, DT, events);
    expect([session.jewels, jewelsCollected(session)]).toEqual([3, JEWEL.lamps + 3]);
  });
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
    // From a new machine, something under the one medal in eight that goes through a slot once it has been fed for a while.
    expect(session.hits).toBeGreaterThan(session.inserted / 16);
    expect(session.hits).toBeLessThan(session.inserted / 5);
    // At five a second the reels cannot keep up with a player who feeds the middle, even with eight held.
    expect(session.wasted).toBeGreaterThan(0);
    expect(session.stock).toBeLessThanOrEqual(MAX_STOCK);
    // The gold spins add up too. Each was a medal that found the hold full and turned a held spin, or one that was
    // held through a lit slot or open wings; a held medal was not wasted and a wasted one was not held.
    const told = (what: 'gold' | 'lucky' | 'held') => events.filter((event) => event.type === 'checker' && event[what]).length;
    expect(session.gilded).toBe(told('gold'));
    expect(session.lucky).toBe(told('lucky'));
    expect(session.hits - session.wasted).toBe(told('held'));
    expect(events.some((event) => event.type === 'checker' && event.lucky && !event.held)).toBe(false);
    expect(events.some((event) => event.type === 'checker' && event.gold && event.held)).toBe(false);
    expect(session.lucky).toBeGreaterThan(0);
    expect(session.gilded).toBeLessThanOrEqual(session.wasted);
    expect(session.gold).toBeLessThanOrEqual(session.stock);
    expect(session.gold + (session.chance ? 1 : 0)).toBeLessThanOrEqual(session.gilded + session.lucky);
    // Chance time began as often as it ended, or once more if it is on now, and it is on only with a gold spin still to play.
    const times = (type: 'chanceStart' | 'chanceEnd') => events.filter((event) => event.type === type).length;
    expect(times('chanceStart') - times('chanceEnd')).toBe(session.rush ? 1 : 0);
    if (session.rush) expect(chanceLeft(session)).toBeGreaterThan(0);
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
    // A jewel came out with every treasure chance, and every jewel is on the field still or was collected: none is ever lost.
    expect(count('jewelDrop')).toBe(count('chestStart'));
    expect(count('jewel') + count('jewelBonus')).toBe(jewelsCollected(session));
    expect(jewelsCollected(session) + jewelsOnField(session.machine)).toBe(START_JEWELS + count('jewelDrop'));
    expect(jewelsCollected(session)).toBeGreaterThan(0);
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

/** A session with nothing on the field and a chest nobody picks on its screen, so that spins are held and not played. */
const busy = (): Session => {
  const session = emptied();
  session.bonus = { ...CHEST, prizes: [...CHEST.prizes] };
  return session;
};
/**
 * Sends `count` medals over the lip through a slot, one a step, lets them ride their tongue and drop in, and says
 * what happened. The slot is the middle one unless another is named. A new machine's lamp is on the left slot for
 * its first stroke, so the middle one is not lit.
 */
const through = (session: Session, count: number, slot = 1): SessionEvent[] => {
  const events: SessionEvent[] = [];
  for (let i = 0; i < count; i++) {
    overTheLip(session, CHECKERS.positions[slot]);
    advance(session, DT, events);
  }
  return rideOut(session, events);
};
/** Runs the session until `done` says so, `limit` seconds at most, and says what happened on the way. */
const until = (session: Session, done: () => boolean, limit = 30): SessionEvent[] => {
  const events: SessionEvent[] = [];
  for (let i = 0; i < limit * 60 && !done(); i++) advance(session, DT, events);
  expect(done()).toBe(true);
  return events;
};
const count = (events: SessionEvent[], type: SessionEvent['type']) => events.filter((event) => event.type === type).length;
/** The draws of a spin that stops on three even digits, with an ordinary reach, and of the die that follows: a two. */
const SMALL = [0.03, 0.3, ORDINARY, 0.2];
/** How long each spin that started was given, in the order they started. */
const spinTimes = (events: SessionEvent[]): number[] => events.flatMap((event) => (event.type === 'spinStart' ? [event.duration] : []));

describe('chance time', () => {
  it('turns one held spin gold for each medal that finds the hold full, until every held spin is gold', () => {
    const session = busy();
    // Eight medals fill the hold. Nothing is gold yet: a full hold is not chance time, a medal wasted on it is.
    const filling = through(session, MAX_STOCK);
    expect(pocketed(filling).every((event) => event.type === 'checker' && event.held && !event.gold && !event.lucky)).toBe(true);
    expect([session.stock, session.gold, session.gilded, session.wasted]).toEqual([MAX_STOCK, 0, 0, 0]);
    expect(chanceLeft(session)).toBe(0);
    expect(count(filling, 'chanceStart')).toBe(0);
    expect(session.rush).toBe(false);
    // The ninth starts no spin of its own. It turns one of the eight gold, and chance time begins.
    const ninth = through(session, 1);
    expect(pocketed(ninth)).toEqual([{ type: 'checker', gate: 1, held: false, gold: true, lucky: false }]);
    expect(count(ninth, 'chanceStart')).toBe(1);
    expect(session.rush).toBe(true);
    expect([session.stock, session.gold, session.gilded, session.wasted]).toEqual([MAX_STOCK, 1, 1, 1]);
    expect(chanceLeft(session)).toBe(1);
    // Seven more turn the other seven. Chance time is already on: it does not begin again.
    const more = through(session, MAX_STOCK - 1);
    expect(pocketed(more).every((event) => event.type === 'checker' && !event.held && event.gold && !event.lucky)).toBe(true);
    expect(count(more, 'chanceStart')).toBe(0);
    expect([session.stock, session.gold, session.gilded, session.wasted]).toEqual([MAX_STOCK, MAX_STOCK, MAX_STOCK, MAX_STOCK]);
    // With every held spin gold there is nothing left to turn, and a medal through a slot is only wasted.
    const last = through(session, 2);
    expect(pocketed(last)).toEqual([
      { type: 'checker', gate: 1, held: false, gold: false, lucky: false },
      { type: 'checker', gate: 1, held: false, gold: false, lucky: false },
    ]);
    expect([session.stock, session.gold, session.gilded, session.wasted, session.hits]).toEqual([MAX_STOCK, MAX_STOCK, MAX_STOCK, MAX_STOCK + 2, 2 * MAX_STOCK + 2]);
    // Every medal through a slot was held or wasted; none has been spun yet. None was gold from the start: the lamp was on another slot.
    expect(session.hits).toBe(session.spins + session.stock + session.wasted);
    expect(session.spins).toBe(0);
    expect(session.lucky).toBe(0);
    expect(session.rush).toBe(true);
  });

  it('does the same for a tower that goes over through a slot: its medals fill the hold and then turn it gold', () => {
    const session = emptied();
    // Through the middle slot, which the lamp is not on.
    expect(luckySlot(session.machine.time)).not.toBe(1);
    overTheLip(session, CHECKERS.positions[1], 2 * MAX_STOCK + 4);
    const events = rideOut(session, play(session, DT));
    const hits = pocketed(events);
    expect(hits.map((event) => event.type === 'checker' && event.held)).toEqual([...Array(MAX_STOCK).fill(true), ...Array(MAX_STOCK + 4).fill(false)]);
    expect(hits.map((event) => event.type === 'checker' && event.gold)).toEqual([...Array(MAX_STOCK).fill(false), ...Array(MAX_STOCK).fill(true), false, false, false, false]);
    expect(hits.some((event) => event.type === 'checker' && event.lucky)).toBe(false);
    expect(count(events, 'chanceStart')).toBe(1);
    // The screen was free, so the first gold spin is on it already.
    expect([session.spins, session.stock, session.gold, session.gilded, session.wasted]).toEqual([1, MAX_STOCK - 1, MAX_STOCK - 1, MAX_STOCK, MAX_STOCK + 4]);
    expect(session.chance).toBe(true);
    expect(session.rush).toBe(true);
    expect(chanceLeft(session)).toBe(MAX_STOCK);
  });

  it('plays the gold spins first and quickly, and ends when the last of them is done', () => {
    const session = busy();
    through(session, MAX_STOCK + 3);
    expect([session.stock, session.gold]).toEqual([MAX_STOCK, 3]);
    // The chest goes, and the reels are free. Every spin from here misses, with no reach.
    session.bonus = null;
    const events = until(session, () => session.stock === 0 && session.spin === null);
    const starts = events.flatMap((event) => (event.type === 'spinStart' ? [event.duration] : []));
    expect(starts).toHaveLength(MAX_STOCK);
    // Three gold spins, each in half the time of a hurried one; then the five that were not turned, at their own pace.
    expect(TIMING.chanceSpin).toBe(TIMING.quickSpin / 2);
    expect(starts.slice(0, 3)).toEqual([TIMING.chanceSpin, TIMING.chanceSpin, TIMING.chanceSpin]);
    expect(starts.slice(3)).toEqual([TIMING.quickSpin, TIMING.quickSpin, TIMING.quickSpin, TIMING.spin, TIMING.spin]);
    // Chance time was on already, and ended once: between the third spin's end and the fourth's start.
    expect(count(events, 'chanceStart')).toBe(0);
    expect(count(events, 'chanceEnd')).toBe(1);
    const order = types(events).filter((type) => type === 'spinStart' || type === 'spinEnd' || type === 'chanceEnd');
    expect(order.indexOf('chanceEnd')).toBe(6);
    expect([session.gold, session.chance, chanceLeft(session)]).toEqual([0, false, 0]);
    expect(session.gilded).toBe(3);
    expect(session.hits).toBe(session.spins + session.stock + session.wasted);
  });

  it('pays a gold spin’s square on the board twice over', () => {
    const session = busy();
    through(session, MAX_STOCK + 1);
    session.bonus = null;
    script(session, SMALL);
    const start = play(session, DT);
    const [spin] = start.flatMap((event) => (event.type === 'spinStart' ? [event] : []));
    // The same draw as any spin, and its reach as long as any reach: only the reels are quicker.
    expect(spin.result).toMatchObject({ tier: 'small', reach: true, reachKind: 'normal' });
    expect(spin.duration).toBe(TIMING.chanceSpin + TIMING.reach);
    expect([session.chance, session.gold, session.stock]).toEqual([true, 0, MAX_STOCK - 1]);
    const events = until(session, () => session.bonus?.kind === 'sugoroku' && session.bonus.payout >= 0);
    // What is on the screen stays gold from the spin through the game its line leads to.
    expect(session.chance).toBe(true);
    expect(chanceLeft(session)).toBe(1);
    const square = squareAfter(0, 2);
    expect(events.find((event) => event.type === 'sugorokuEnd')).toEqual({ type: 'sugorokuEnd', square, payout: BOARD[square] * CHANCE.multiplier, fever: false });
    expect(CHANCE.multiplier).toBe(2);
    expect(session.paidOut).toBe(BOARD[square] * 2);
    // When its prize has been up, the screen is gold no longer, and chance time is over: the next spin is an ordinary one.
    const after = until(session, () => session.spin !== null);
    expect(count(after, 'chanceEnd')).toBe(1);
    expect(session.chance).toBe(false);
    expect(after.flatMap((event) => (event.type === 'spinStart' ? [event.duration] : []))).toEqual([TIMING.quickSpin]);
  });

  it('pays a gold spin’s chest twice over, as towers', () => {
    for (const chest of [0, 1, 2]) {
      const session = busy();
      through(session, MAX_STOCK + 1);
      session.bonus = null;
      // Three odd digits, and then whatever the shuffle makes of the chests.
      script(session, [0.01, 0.3, ORDINARY]);
      until(session, () => session.bonus?.kind === 'chest');
      const { bonus } = session as Session;
      if (bonus?.kind !== 'chest') throw new Error('no chests');
      expect(session.chance).toBe(true);
      expect(pickChest(session, chest)).toBe(true);
      const events = until(session, () => bonus.payout >= 0);
      const prize = bonus.prizes[chest];
      expect(events.find((event) => event.type === 'chestEnd')).toEqual({ type: 'chestEnd', chest, payout: prize * 2 });
      expect(session.paidOut).toBe(prize * 2);
      // Twice the smallest chest is already a tower's worth.
      expect(prize * 2).toBeGreaterThanOrEqual(CHEST_TOWERS_FROM);
      expect(towersOf(session).reduce((sum, tower) => sum + tower.stack + tower.grow, 0)).toBe(prize * 2);
      until(session, () => session.bonus === null);
      expect(session.chance).toBe(false);
    }
  });

  it('lets one jewel go with a gold spin’s treasure line, and pays for a jewel once whatever is on the screen', () => {
    const session = busy();
    through(session, MAX_STOCK + 1);
    session.bonus = null;
    // Three odd digits on a gold spin: the chests, which will pay double, and a jewel.
    script(session, [0.01, 0.3, ORDINARY]);
    const events = until(session, () => session.bonus?.kind === 'chest');
    expect(session.chance).toBe(true);
    expect(count(events, 'jewelDrop')).toBe(1);
    expect(jewelsOnField(session.machine)).toBe(1);
    expect(session.paidOut).toBe(0);
    // A jewel that goes over the front while the gold spin's chests are up pays what a jewel pays, once.
    overTheFront(session);
    const over: SessionEvent[] = [];
    advance(session, DT, over);
    expect(session.chance).toBe(true);
    expect(over.filter((event) => event.type === 'jewel')).toEqual([{ type: 'jewel', lamps: 1, payout: JEWEL.prize }]);
    expect(session.paidOut).toBe(JEWEL.prize);
    // So does the one that makes the set: the bonus, once.
    session.jewels = JEWEL.lamps - 1;
    overTheFront(session);
    advance(session, DT, over);
    expect(session.chance).toBe(true);
    expect(over.filter((event) => event.type === 'jewelBonus')).toEqual([{ type: 'jewelBonus', payout: JEWEL.bonus }]);
    expect(session.paidOut).toBe(JEWEL.prize + JEWEL.bonus);
    // And the chest still pays twice over, on top of what the jewels paid.
    const { bonus } = session as Session;
    if (bonus?.kind !== 'chest') throw new Error('no chests');
    expect(pickChest(session, 0)).toBe(true);
    until(session, () => bonus.payout >= 0);
    expect(bonus.payout).toBe(bonus.prizes[0] * CHANCE.multiplier);
    expect(session.paidOut).toBe(JEWEL.prize + JEWEL.bonus + bonus.payout);
  });

  it('leaves a gold spin’s ball a ball', () => {
    const session = busy();
    through(session, MAX_STOCK + 1);
    session.bonus = null;
    const balls = ballsOnField(session.machine);
    script(session, [0.001, 0.3, ORDINARY]);
    const events = until(session, () => session.spin === null && session.spins === 1);
    expect(events.flatMap((event) => (event.type === 'spinEnd' ? [event.result.tier] : []))).toEqual(['seven']);
    // Three sevens drop one ball, gold or not, and it will have its roulette like any other.
    expect(ballsOnField(session.machine)).toBe(balls + 1);
    expect(session.chance).toBe(false);
    expect(count(events, 'chanceEnd')).toBe(1);
    expect(session.paidOut).toBe(0);
  });

  it('pays an ordinary spin once, even if the hold turns gold behind it', () => {
    const session = emptied();
    // One medal through a pocket: its spin starts at once, an ordinary one that will stop on three even digits.
    script(session, SMALL);
    through(session, 1);
    expect([session.spins, session.chance]).toEqual([1, false]);
    // While its reels turn, the hold fills and three more medals turn three of the held spins gold.
    const filling = through(session, MAX_STOCK + 3);
    expect(count(filling, 'chanceStart')).toBe(1);
    expect([session.stock, session.gold, session.chance]).toEqual([MAX_STOCK, 3, false]);
    const events = until(session, () => session.bonus?.kind === 'sugoroku' && session.bonus.payout >= 0);
    const square = squareAfter(0, 2);
    expect(events.find((event) => event.type === 'sugorokuEnd')).toMatchObject({ square, payout: BOARD[square] });
    expect(session.paidOut).toBe(BOARD[square]);
    // The gold spins come next.
    const next = until(session, () => session.spin !== null);
    expect(next.flatMap((event) => (event.type === 'spinStart' ? [event.duration] : []))).toEqual([TIMING.chanceSpin]);
    expect([session.chance, session.gold]).toEqual([true, 2]);
  });

  it('never makes the medal that turned a spin gold worth what a spin of its own would have been', () => {
    // A spin that a full hold turned gold has cost two medals through a slot. What being gold adds is less than the
    // spin the second would have been. What a full hold gives back is the rest of chance time, which is measured and not worked out.
    expect(CHANCE_BONUS).toBeGreaterThan(0);
    expect(CHANCE_BONUS).toBeLessThan(spinValue(JACKPOT_START));
    expect(chanceSpinValue(JACKPOT_START)).toBeLessThan(2 * spinValue(JACKPOT_START));
    expect(chanceSpinValue(JACKPOT_START) - spinValue(JACKPOT_START)).toBeCloseTo(CHANCE_BONUS, 12);
    // And a machine nobody feeds has no chance time.
    const idle = createSession(4);
    const events = play(idle, 8);
    expect(count(events, 'chanceStart')).toBe(0);
    expect([idle.gold, idle.gilded, idle.lucky, idle.rush, idle.chance, chanceLeft(idle)]).toEqual([0, 0, 0, false, false, 0]);
  });
});

describe('the lucky lamp and the wings', () => {
  /** A place across the lip that is outside the middle slot and inside its open wings: halfway between the two widths. */
  const BESIDE = CHECKERS.positions[1] + (CHECKERS.halfWidth + CHECKERS.wingWidth) / 2;

  it('holds a gold spin for a medal that is held through the slot the lamp is on, and an ordinary one through any other', () => {
    for (const lit of [0, 1, 2]) {
      const session = busy();
      // In the middle of the stroke that has the lamp on this slot.
      session.machine.time = (lit + 0.5) * PUSHER.period;
      expect(luckySlot(session.machine.time)).toBe(lit);
      const events = [0, 1, 2].flatMap((slot) => through(session, 1, slot));
      expect(pocketed(events)).toEqual([0, 1, 2].map((slot) => ({ type: 'checker', gate: slot, held: true, gold: false, lucky: slot === lit })));
      expect([session.hits, session.stock, session.gold, session.lucky]).toEqual([3, 3, 1, 1]);
      expect(session.gold).toBeLessThanOrEqual(session.stock);
      // A spin that is gold from the start is not chance time: no medal has found the hold full.
      expect([session.gilded, session.wasted, session.rush]).toEqual([0, 0, false]);
      expect(count(events, 'chanceStart')).toBe(0);
      expect(chanceLeft(session)).toBe(1);
    }
  });

  it('takes the lamp from the machine’s clock: the same slot is gold in one stroke and not in the next', () => {
    const session = busy();
    // The left slot while the lamp is on it, and again a stroke later when it has moved on.
    expect(pocketed(through(session, 1, 0))).toEqual([{ type: 'checker', gate: 0, held: true, gold: false, lucky: true }]);
    play(session, PUSHER.period);
    expect(luckySlot(session.machine.time)).toBe(1);
    expect(pocketed(through(session, 1, 0))).toEqual([{ type: 'checker', gate: 0, held: true, gold: false, lucky: false }]);
    expect(pocketed(through(session, 1, 1))).toEqual([{ type: 'checker', gate: 1, held: true, gold: false, lucky: true }]);
    expect([session.stock, session.gold, session.lucky, session.rush]).toEqual([3, 2, 2, false]);
  });

  it('plays the lamp’s gold spin before the others and quickly, and pays its square on the board twice over', () => {
    const session = busy();
    // Two medals through the middle slot hold two ordinary spins, and one through the lit slot a gold spin behind them.
    through(session, 2, 1);
    expect(pocketed(through(session, 1, 0))).toEqual([{ type: 'checker', gate: 0, held: true, gold: false, lucky: true }]);
    expect([session.stock, session.gold, session.lucky, session.rush]).toEqual([3, 1, 1, false]);
    // The chest goes, and the gold spin is the first on the reels: three even digits, and a two on the die.
    session.bonus = null;
    script(session, SMALL);
    const start = play(session, DT);
    expect(spinTimes(start)).toEqual([TIMING.chanceSpin + TIMING.reach]);
    expect([session.chance, session.gold, session.stock]).toEqual([true, 0, 2]);
    const events = until(session, () => session.bonus?.kind === 'sugoroku' && session.bonus.payout >= 0);
    const square = squareAfter(0, 2);
    expect(events.find((event) => event.type === 'sugorokuEnd')).toEqual({ type: 'sugorokuEnd', square, payout: BOARD[square] * CHANCE.multiplier, fever: false });
    expect(session.paidOut).toBe(BOARD[square] * 2);
    // The two behind it are ordinary spins. And it never was chance time: nothing began, nothing ended, and the wings stayed shut.
    const after = until(session, () => session.spin !== null);
    expect(session.chance).toBe(false);
    expect(spinTimes(after)).toEqual([TIMING.spin]);
    const all = [...start, ...events, ...after];
    expect([count(all, 'chanceStart'), count(all, 'chanceEnd'), session.rush]).toEqual([0, 0, false]);
    // The medals the board paid are taken off the pusher first: the wings reach so little further than the slot
    // that one lying by the lip could nudge the medal into it.
    session.machine.medals = [];
    overTheLip(session, BESIDE);
    expect(pocketed(play(session, DT))).toEqual([]);
  });

  it('fills the hold with gold spins when a tower goes over through the lit slot, which is not chance time', () => {
    const session = emptied();
    expect(luckySlot(session.machine.time)).toBe(0);
    overTheLip(session, CHECKERS.positions[0], MAX_STOCK + 4);
    const events = rideOut(session, play(session, DT));
    const hits = pocketed(events);
    expect(hits.map((event) => event.type === 'checker' && event.held)).toEqual([...Array(MAX_STOCK).fill(true), false, false, false, false]);
    expect(hits.map((event) => event.type === 'checker' && event.lucky)).toEqual([...Array(MAX_STOCK).fill(true), false, false, false, false]);
    // The four that found the hold full found every held spin gold already: there was none left to turn, and with none turned chance time does not begin.
    expect(hits.some((event) => event.type === 'checker' && event.gold)).toBe(false);
    expect(count(events, 'chanceStart')).toBe(0);
    // The screen was free, so the first of the eight is on it already.
    expect([session.spins, session.stock, session.gold, session.lucky, session.gilded, session.wasted]).toEqual([1, MAX_STOCK - 1, MAX_STOCK - 1, MAX_STOCK, 0, 4]);
    expect([session.chance, session.rush, chanceLeft(session)]).toEqual([true, false, MAX_STOCK]);
  });

  it('opens the wings when a medal finds the hold full, and shuts them when the last gold spin has been played', () => {
    const session = busy();
    /** A chest nobody picks is put up, which holds whatever is on the reels where it is, or taken away again. */
    const hold = () => (session.bonus = { ...CHEST, prizes: [...CHEST.prizes] });
    const free = () => (session.bonus = null);
    // Before chance time a medal that goes over just beside the middle slot is on no tongue, and starts nothing.
    overTheLip(session, BESIDE);
    expect(riders(play(session, DT))).toEqual([]);
    expect(pocketed(play(session, START_RIDE))).toEqual([]);
    expect([session.hits, session.riding.length]).toEqual([0, 0]);
    // Eight through the middle slot fill the hold, and the ninth finds it full: chance time, with one spin gold. It
    // begins as the ninth drops into the slot, which is when the machine takes it, and not as it comes over the lip.
    const filling: SessionEvent[] = [];
    for (let i = 0; i < MAX_STOCK + 1; i++) {
      overTheLip(session, CHECKERS.positions[1]);
      advance(session, DT, filling);
    }
    expect([riders(filling).length, pocketed(filling).length, count(filling, 'chanceStart'), session.rush]).toEqual([MAX_STOCK + 1, 0, 0, false]);
    rideOut(session, filling);
    expect(count(filling, 'chanceStart')).toBe(1);
    expect(filling.indexOf(pocketed(filling)[MAX_STOCK])).toBeLessThan(types(filling).indexOf('chanceStart'));
    expect([session.rush, session.stock, session.gold, session.gilded, session.lucky]).toEqual([true, MAX_STOCK, 1, 1, 0]);
    // The chest goes and the gold spin is on the reels, which leaves room in the hold. Every spin from here misses,
    // with no reach. Another chest holds the reels where they are while the next medals ride their tongues.
    free();
    const first = play(session, DT);
    expect(spinTimes(first)).toEqual([TIMING.chanceSpin]);
    expect([session.rush, session.chance, session.stock, session.gold]).toEqual([true, true, MAX_STOCK - 1, 0]);
    hold();

    // The wings are open. A medal over the lip just beside the middle slot is on a tongue now, to a slot that is
    // lit, as every slot is; and the spin it holds when it drops is gold.
    overTheLip(session, BESIDE);
    const wide = play(session, DT);
    expect(riders(wide)).toEqual([{ type: 'riding', gate: 1, lit: true, seconds: START_RIDE }]);
    expect(pocketed(rideOut(session, wide))).toEqual([{ type: 'checker', gate: 1, held: true, gold: false, lucky: true }]);
    expect([session.stock, session.gold, session.lucky]).toEqual([MAX_STOCK, 1, 1]);
    // The hold is full again: the next medal starts nothing, and turns another held spin gold.
    expect(pocketed(through(session, 1, 2))).toEqual([{ type: 'checker', gate: 2, held: false, gold: true, lucky: false }]);
    expect([session.gold, session.gilded]).toEqual([2, 2]);
    // When the first gold spin is done the next is played, and there is room again. A medal through a slot the lamp
    // is not on is held, and holds a gold spin all the same: every medal that is held does if the wings were open
    // as it came over.
    free();
    const second = until(session, () => session.spins === 2);
    expect(spinTimes(second)).toEqual([TIMING.chanceSpin]);
    expect(count(second, 'chanceEnd')).toBe(0);
    hold();
    expect(luckySlot(session.machine.time + DT)).not.toBe(2);
    expect(pocketed(through(session, 1, 2))).toEqual([{ type: 'checker', gate: 2, held: true, gold: false, lucky: true }]);
    expect([session.rush, session.stock, session.gold, session.gilded, session.lucky]).toEqual([true, MAX_STOCK, 2, 2, 2]);
    expect(session.gold).toBeLessThanOrEqual(session.stock);

    // Nothing more goes over. The gold spins are played out, and chance time ends with the last of them: once,
    // after its reels have stopped and before the first ordinary spin starts.
    free();
    const rest = until(session, () => !session.rush);
    expect(count(rest, 'chanceEnd')).toBe(1);
    expect(rest[rest.length - 1]).toEqual({ type: 'chanceEnd' });
    expect(spinTimes(rest)).toEqual([TIMING.chanceSpin, TIMING.chanceSpin]);
    expect([session.gold, session.chance, chanceLeft(session), session.spin]).toEqual([0, false, 0, null]);
    expect([session.spins, session.stock]).toEqual([4, MAX_STOCK - 2]);
    // The spins that were never gold come next, at their own pace, and the wings are shut: beside the slot is beside it again.
    const next = play(session, DT);
    expect(spinTimes(next)).toEqual([TIMING.quickSpin]);
    expect(count(next, 'chanceStart')).toBe(0);
    overTheLip(session, BESIDE);
    expect(riders(play(session, DT))).toEqual([]);
    expect(session.riding).toEqual([]);
    // Every medal through a slot started a spin, is held, or found the hold full, and every gold spin has its medal.
    expect(session.hits).toBe(session.spins + session.stock + session.wasted);
    expect([session.hits, session.wasted, session.gilded, session.lucky]).toEqual([MAX_STOCK + 4, 2, 2, 2]);
  });

  it('holds a gold spin for a medal that came over open wings, though chance time is over by the time it drops: what it is was settled at the lip', () => {
    const session = busy();
    // The hold full and one spin of it gold: chance time. The chest goes, and that one gold spin is on the reels, a miss.
    through(session, MAX_STOCK + 1);
    session.bonus = null;
    play(session, DT);
    expect([session.rush, session.chance, session.stock, session.gold]).toEqual([true, true, MAX_STOCK - 1, 0]);
    // A medal comes over beside the middle slot, inside its open wings, and is on its tongue: its slot is lit.
    overTheLip(session, BESIDE);
    const events = play(session, DT);
    expect(riders(events)).toEqual([{ type: 'riding', gate: 1, lit: true, seconds: START_RIDE }]);
    // The gold spin is quicker than the ride. Its reels stop, it was the last, and chance time is over: the wings shut
    // with the medal still on its way.
    expect(TIMING.chanceSpin).toBeLessThan(START_RIDE);
    rideOut(session, events);
    const said = types(events).filter((type) => type === 'chanceEnd' || type === 'checker' || type === 'chanceStart');
    expect(said).toEqual(['chanceEnd', 'checker']);
    // It is held, and its spin is gold from the start, as the lit slot it came over promised. That is not chance time.
    expect(pocketed(events)).toEqual([{ type: 'checker', gate: 1, held: true, gold: false, lucky: true }]);
    expect([session.rush, session.gold, session.lucky, session.gilded]).toEqual([false, 1, 1, 1]);
    // And one that comes over the same place now is beside the slot: the wings are shut.
    session.machine.medals = [];
    overTheLip(session, BESIDE);
    expect(riders(play(session, DT))).toEqual([]);
  });

  it('starts a spin for about one medal in eight fed down the middle at two a second, and a third of them gold', () => {
    // Three new machines, two hundred medals each, the two rails by turns. Over many more machines and medals the
    // rate is about 12 in 100 (scripts/medal-pusher-tune.ts); a machine that is new starts a little under that.
    const fed = { medals: 0, started: 0, gold: 0, wasted: 0 };
    for (const seed of [10, 11, 12]) {
      const session = createSession(seed, { balls: 0, quickPick: true });
      session.credits = 1000;
      let clock = 0.5;
      while (session.inserted < 200) {
        if (clock >= 0.5) {
          const arm = session.inserted % 2 === 0 ? 0 : 1;
          aimArm(session.machine, arm, CHECKERS.positions[1]);
          if (insert(session, arm)) clock -= 0.5;
        }
        advance(session, DT);
        clock += DT;
      }
      fed.medals += session.inserted;
      fed.started += session.hits - session.wasted;
      fed.gold += session.lucky + session.gilded;
      fed.wasted += session.wasted;
    }
    expect(fed.medals).toBe(600);
    expect(fed.started / fed.medals).toBeGreaterThan(0.09);
    expect(fed.started / fed.medals).toBeLessThan(0.15);
    // The lamp is on one slot in three, and the middle slot takes more than the two beside it.
    expect(fed.gold / fed.started).toBeGreaterThan(0.2);
    expect(fed.gold / fed.started).toBeLessThan(0.5);
    // At this pace the hold is hardly ever full.
    expect(fed.wasted).toBeLessThan(fed.started / 10);
  }, LONG);
});

describe('a frame that took long', () => {
  /**
   * Lets a medal go in the air so that it comes down on the pusher just past its lip at `x` in the machine's
   * `piece`th sixtieth of a second from now, and goes over the lip in that same sixtieth.
   */
  const overTheLipIn = (session: Session, x: number, piece: number): void => {
    const { machine } = session;
    const y = pusherFront(machine.time + piece * DT) + 0.5;
    machine.falling.push({ id: machine.nextId++, x, y, level: 1, fromX: x, fromY: y, rank: 0, ball: false, remaining: (piece - 0.5) * DT, duration: FALL_TIME, source: 'payout' });
  };
  /** The same four sixtieths of a second as four frames, as two, and as one long one. */
  const WAYS: [string, number[]][] = [
    ['four frames of a sixtieth', [1, 1, 1, 1]],
    ['two frames of two', [2, 2]],
    ['one frame of four', [4]],
    ['a short frame and a long one', [1, 3]],
  ];
  const played = (session: Session, frames: number[]): SessionEvent[] => {
    const events: SessionEvent[] = [];
    for (const frame of frames) advance(session, frame * DT, events);
    return events;
  };

  it('is cut into the engine’s own pieces, each no longer than the engine steps at once', () => {
    expect(MAX_STEP).toBe(DT);
    // Stepped a piece at a time the field is the very field one long step makes of it.
    const [whole, pieces] = [createSession(21), createSession(21)];
    for (const session of [whole, pieces]) for (let i = 0; i < 40; i++) insert(session, i % 2 === 0 ? 0 : 1);
    for (let frame = 0; frame < 30; frame++) {
      const long = 7.5 * MAX_STEP;
      step(whole.machine, long);
      let remaining = long;
      while (remaining > 1e-9) {
        const piece = Math.min(MAX_STEP, remaining);
        step(pieces.machine, piece);
        remaining -= piece;
      }
    }
    expect(pieces.machine.time).toBe(whole.machine.time);
    expect(pieces.machine.medals).toEqual(whole.machine.medals);
  });

  it.each(WAYS)('opens the wings for a medal that goes over after the one that found the hold full has dropped, though both are in one frame: %s', (_name, frames) => {
    const session = busy();
    Object.assign(session, { stock: MAX_STOCK, hits: MAX_STOCK });
    // A medal over the lip at the middle slot, which has ridden its tongue to within a sixtieth of a second of its
    // drop. It drops in the next sixtieth and finds the hold full. And one that comes over two sixtieths after
    // that just beside the right slot: outside the slot, and inside its open wings.
    const beside = CHECKERS.positions[2] + (CHECKERS.halfWidth + CHECKERS.wingWidth) / 2;
    expect(checkerAt(beside, CHECKERS.halfWidth)).toBe(-1);
    expect(checkerAt(beside, CHECKERS.wingWidth)).toBe(2);
    overTheLip(session, CHECKERS.positions[1]);
    expect(pocketed(play(session, RIDE * DT))).toEqual([]);
    expect(session.riding).toHaveLength(1);
    expect(session.riding[0].left).toBeCloseTo(DT, 9);
    overTheLipIn(session, beside, 3);
    const events = played(session, frames);
    // Chance time began as the first dropped, so the wings were open by the time the second came over, and it is
    // on its tongue, to a slot that is lit.
    expect(pocketed(events)).toEqual([{ type: 'checker', gate: 1, held: false, gold: true, lucky: false }]);
    expect(riders(events)).toEqual([{ type: 'riding', gate: 2, lit: true, seconds: START_RIDE }]);
    expect(count(events, 'chanceStart')).toBe(1);
    // What is said of the slots comes after what the field itself did, however many pieces the frame was.
    const order = events.map((event) => event.type).filter((type) => type === 'landed' || type === 'checker' || type === 'riding');
    expect(order.slice(-1)).toEqual(['riding']);
    // It drops in its turn, a ride after it came over, and turns another held spin gold.
    rideOut(session, events);
    expect(pocketed(events)).toEqual([
      { type: 'checker', gate: 1, held: false, gold: true, lucky: false },
      { type: 'checker', gate: 2, held: false, gold: true, lucky: false },
    ]);
    expect([session.rush, session.hits, session.wasted, session.gold, session.gilded, session.lucky]).toEqual([true, MAX_STOCK + 2, 2, 2, 2, 0]);
    // Both lie on the lower table, where they came down, and each remembers how wide the slots were as it came over.
    const [first, second] = session.machine.medals;
    expect([first.level, second.level]).toEqual([0, 0]);
    expect([slotWidthAt(first), slotWidthAt(second)]).toEqual([CHECKERS.halfWidth, CHECKERS.wingWidth]);
    expect(second.x).toBeCloseTo(beside, 9);
    expect(session.hits).toBe(session.spins + session.stock + session.wasted);
  });

  it('leaves the second medal beside its slot when nothing has opened the wings, however the time is cut', () => {
    for (const [, frames] of WAYS) {
      // The same two medals, with room in the hold: the first is held as it drops, and nothing begins.
      const session = busy();
      overTheLip(session, CHECKERS.positions[1]);
      play(session, RIDE * DT);
      overTheLipIn(session, CHECKERS.positions[2] + (CHECKERS.halfWidth + CHECKERS.wingWidth) / 2, 3);
      const events = played(session, frames);
      expect(pocketed(events)).toEqual([{ type: 'checker', gate: 1, held: true, gold: false, lucky: false }]);
      expect(riders(events)).toEqual([]);
      expect([session.rush, session.hits, session.stock, session.riding.length]).toEqual([false, 1, 1, 0]);
      expect(session.machine.medals.map((medal) => slotWidthAt(medal))).toEqual([CHECKERS.halfWidth, CHECKERS.halfWidth]);
    }
  });

  it.each(WAYS)('reads the lucky lamp where it was as each medal came over, when the lamp steps in the middle of the frame, and keeps that for the medal until it drops: %s', (_name, frames) => {
    const session = busy();
    // A sixtieth and a half before the pusher comes to the back of its first stroke, which is when the lamp steps
    // from the left slot to the middle one.
    session.machine.time = PUSHER.period - 1.5 * DT;
    expect([luckySlot(session.machine.time + DT), luckySlot(session.machine.time + 3 * DT)]).toEqual([0, 1]);
    // Over the lip at the left slot in the first sixtieth, while the lamp is on it; and at the left slot again and
    // at the middle one two sixtieths later, when it has stepped.
    overTheLip(session, CHECKERS.positions[0]);
    overTheLipIn(session, CHECKERS.positions[0], 3);
    overTheLipIn(session, CHECKERS.positions[1], 3);
    const events = played(session, frames);
    expect(riders(events)).toEqual([
      { type: 'riding', gate: 0, lit: true, seconds: START_RIDE },
      { type: 'riding', gate: 0, lit: false, seconds: START_RIDE },
      { type: 'riding', gate: 1, lit: true, seconds: START_RIDE },
    ]);
    expect(luckySlot(session.machine.time)).toBe(1);
    // Each drops as what it was at the lip. The lamp has been on the middle slot for the whole of their rides but
    // the first sixtieth: the first medal's spin is gold all the same, and the second's is not.
    rideOut(session, events);
    expect(pocketed(events)).toEqual([
      { type: 'checker', gate: 0, held: true, gold: false, lucky: true },
      { type: 'checker', gate: 0, held: true, gold: false, lucky: false },
      { type: 'checker', gate: 1, held: true, gold: false, lucky: true },
    ]);
    expect([session.stock, session.gold, session.lucky, session.rush]).toEqual([3, 2, 2, false]);
    expect(luckySlot(session.machine.time)).toBe(1);
  });

  it('is the same time to the machine however it is cut, and is still refused when it is no length of time', () => {
    const sessions = WAYS.map(([, frames]) => {
      const session = createSession(31);
      for (let i = 0; i < 12; i++) insert(session, i % 2 === 0 ? 0 : 1);
      played(session, frames);
      return session;
    });
    for (const session of sessions) {
      expect(session.machine.time).toBeCloseTo(4 * DT, 12);
      expect(session.machine.medals).toHaveLength(sessions[0].machine.medals.length);
    }
    const session = createSession(31);
    for (const bad of [-DT, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => advance(session, bad)).toThrow('the time step must be a non-negative number');
    // No time at all is a frame in which the field does nothing.
    const still = JSON.stringify(session.machine.medals);
    advance(session, 0);
    expect([session.machine.time, JSON.stringify(session.machine.medals)]).toEqual([0, still]);
  });
});

describe('the ride from the lip to the pocket', () => {
  it('is as long as the catcher shows it: the machine takes a medal in the very step the catcher stops showing it, and not a step sooner', () => {
    expect(CATCHER.sink).toBe(START_RIDE);
    const session = emptied();
    overTheLip(session, CHECKERS.positions[1]);
    const events: SessionEvent[] = [];
    advance(session, DT, events);
    const [medal] = session.machine.medals;
    expect([medal.level, medal.sinceDrop]).toEqual([0, 0]);
    expect(riders(events)).toEqual([{ type: 'riding', gate: 1, lit: false, seconds: START_RIDE }]);
    let steps = 0;
    while (pocketed(events).length === 0) {
      // On its tongue: shown on its way to the middle slot, and nothing counted, held or started.
      expect(caught(medal, session.machine.time)?.chucker).toBe(1);
      expect(session.riding).toHaveLength(1);
      expect([session.hits, session.stock, session.spins, session.spin]).toEqual([0, 0, 0, null]);
      // A machine with a medal on a tongue has something still to do.
      expect(isBusy(session)).toBe(true);
      advance(session, DT, events);
      steps += 1;
      expect(steps).toBeLessThanOrEqual(RIDE);
    }
    expect(steps).toBe(RIDE);
    expect(medal.sinceDrop).toBeCloseTo(START_RIDE, 9);
    // Gone from the catcher, and the machine's: counted, and on the reels at once, since the screen was free.
    expect(caught(medal, session.machine.time)).toBeNull();
    expect([session.hits, session.spins, session.stock, session.riding.length]).toEqual([1, 1, 0, 0]);
  });

  it('takes the medal in the frame the catcher stops showing it, whatever lengths the frames are', () => {
    const random = seededRng(5);
    for (let run = 0; run < 60; run++) {
      const session = emptied();
      overTheLip(session, CHECKERS.positions[run % 3]);
      let frames = 0;
      while (session.hits === 0) {
        // From a 240th of a second to a twentieth, as a page's frames are: seldom a whole number of sixtieths.
        advance(session, 1 / 240 + random() * (1 / 20 - 1 / 240));
        const [medal] = session.machine.medals;
        expect(medal.level).toBe(0);
        const shown = caught(medal, session.machine.time);
        expect(shown === null).toBe(session.riding.length === 0);
        expect(session.hits).toBe(session.riding.length === 0 ? 1 : 0);
        if (shown) expect(shown.chucker).toBe(run % 3);
        frames += 1;
        expect(frames).toBeLessThan(400);
      }
      // It was taken in the frame its ride was up in: not before, and no more than that one frame after.
      const [medal] = session.machine.medals;
      expect(medal.sinceDrop).toBeGreaterThanOrEqual(START_RIDE - 1e-9);
      expect(medal.sinceDrop).toBeLessThan(START_RIDE + 1 / 20);
    }
  });

  it('takes a medal at once on a cabinet that shows nothing moving, and lets the ones already on their tongues ride on', () => {
    const session = busy();
    const events: SessionEvent[] = [];
    // One comes over the middle slot and is on its tongue. Then less motion is asked for, and one comes over the left slot.
    overTheLip(session, CHECKERS.positions[1]);
    advance(session, DT, events);
    overTheLip(session, CHECKERS.positions[0]);
    advance(session, DT, events, true);
    // The second is taken as it comes over: nothing is said of a ride, and it holds its spin now. On a new machine the lamp is on the left slot.
    expect(events.filter((event) => event.type === 'riding' || event.type === 'checker')).toEqual([
      { type: 'riding', gate: 1, lit: false, seconds: START_RIDE },
      { type: 'checker', gate: 0, held: true, gold: false, lucky: true },
    ]);
    expect([session.hits, session.stock, session.gold]).toEqual([1, 1, 1]);
    // The first is still on its tongue, a step further along, and drops when its own ride is up.
    expect(session.riding).toHaveLength(1);
    expect(session.riding[0]).toMatchObject({ gate: 1, lit: false });
    expect(session.riding[0].left).toBeCloseTo(START_RIDE - DT, 9);
    for (let i = 0; i < RIDE - 2; i++) advance(session, DT, events, true);
    expect([session.riding.length, session.hits]).toEqual([1, 1]);
    advance(session, DT, events, true);
    expect([session.riding.length, session.hits, session.stock]).toEqual([0, 2, 2]);
    expect(pocketed(events)[1]).toEqual({ type: 'checker', gate: 1, held: true, gold: false, lucky: false });
  });

  it(
    'counts every medal the lip’s rule counted exactly once, a ride after it came over and as what it was there, over two minutes of both rails held',
    () => {
      const session = createSession(3, { quickPick: true });
      session.credits = 1e6;
      const events: SessionEvent[] = [];
      /** The medals on their tongues as the screen was told of them: the step each is due to drop in, its slot, and whether that was lit. */
      const due: { at: number; gate: number; lit: boolean }[] = [];
      let over = 0;
      let taken = 0;
      let gold = 0;
      for (let step = 0; step < 120 * 60; step++) {
        insert(session, 0);
        insert(session, 1);
        events.length = 0;
        const wings = session.rush;
        advance(session, DT, events);
        for (const event of events) {
          if (event.type === 'riding') {
            // Lit by the lamp where the machine's clock has it, or by the wings as they stood when the step began.
            expect(event.lit).toBe(wings || event.gate === luckySlot(session.machine.time));
            due.push({ at: step + RIDE, gate: event.gate, lit: event.lit });
            over += 1;
          } else if (event.type === 'checker') {
            // The oldest of them, in this very step; and a spin it holds is gold exactly when its slot was lit as it came over.
            const first = due.shift();
            expect(first).toMatchObject({ at: step, gate: event.gate });
            if (event.held) expect(event.lucky).toBe(first?.lit);
            else expect(event.lucky).toBe(false);
            taken += 1;
            if (event.lucky) gold += 1;
          }
        }
        // What the machine has on its tongues is what it has said, and it has counted the rest and no other.
        expect(session.riding.map(({ gate, lit }) => ({ gate, lit }))).toEqual(due.map(({ gate, lit }) => ({ gate, lit })));
        expect(session.hits).toBe(taken);
        expect(over).toBe(taken + session.riding.length);
      }
      expect(taken).toBeGreaterThan(100);
      expect(gold).toBeGreaterThan(10);
      expect(session.lucky).toBe(gold);
      // Every medal that dropped started a spin, is held, or found the hold full.
      expect(session.hits).toBe(session.spins + session.stock + session.wasted);
    },
    LONG,
  );
});
