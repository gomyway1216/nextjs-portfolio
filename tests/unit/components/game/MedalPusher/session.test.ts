import { describe, expect, it } from 'vitest';

import { DROP_INTERVAL, ballsOnField, medalsOnField } from '@/components/game/MedalPusher/engine';
import { BOARD, FEVER_SQUARE, JACKPOT_START, JACKPOT_STEP, ROULETTE } from '@/components/game/MedalPusher/lottery';
import {
  MAX_STOCK,
  START_BALLS,
  START_CREDITS,
  TIMING,
  advance,
  createSession,
  insert,
  isBusy,
  pickChest,
  refill,
  sugorokuDuration,
  type Session,
  type SessionEvent,
} from '@/components/game/MedalPusher/session';

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
/** The seconds a winning line takes from the start of its spin to the game it leads to. */
const LINE = TIMING.spin + TIMING.reach + TIMING.celebrate;

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
    expect(insert(session, 50)).toBe(true);
    expect(session.credits).toBe(START_CREDITS - 1);
    expect(session.inserted).toBe(1);
    // The slot is still feeding the first one.
    expect(insert(session, 50)).toBe(false);
    expect(session.credits).toBe(START_CREDITS - 1);
    expect(isBusy(session)).toBe(true);
    advance(session, DROP_INTERVAL + 0.01);
    expect(insert(session, 50)).toBe(true);
    expect(session.inserted).toBe(2);
  });

  it('stops at an empty purse and refills only then', () => {
    const session = createSession(3);
    expect(refill(session)).toBe(false);
    session.credits = 0;
    expect(insert(session, 50)).toBe(false);
    expect(session.inserted).toBe(0);
    expect(refill(session)).toBe(true);
    expect(session.credits).toBe(START_CREDITS);
    expect(session.refills).toBe(1);
  });

  it('grows the jackpot by one medal for every forty dropped', () => {
    const session = createSession(4);
    session.credits = 1000;
    for (let i = 0; i < JACKPOT_STEP * 3 + 5; i++) {
      session.machine.cooldown = 0;
      insert(session, 50);
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

  it('holds a winning line up before the game it leads to begins', () => {
    const session = withSpin();
    script(session, [0.03, 0.3, 0.5]);
    play(session, TIMING.spin + TIMING.reach + 0.05);
    expect(session.spin?.done).toBe(true);
    expect(session.tiers.small).toBe(1);
    expect(session.bonus).toBeNull();
    expect(session.paidOut).toBe(0);
    play(session, TIMING.celebrate);
    expect(session.spin).toBeNull();
    expect(session.bonus?.kind).toBe('sugoroku');
  });

  it('pays three sevens as a ball, with no medals and no game on the screen', () => {
    const session = withSpin();
    const before = medalsOnField(session.machine);
    script(session, [0.001]);
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
    script(session, [0.03, 0.3, 0.5]);
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
    script(session, [0.03, 0.3, 0.2]);
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
    script(session, [0.03, 0.3, 0.99]);
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
    script(session, [0.01, 0.3, 0.99, 0.99, 0.5]);
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
  it('starts when a ball has gone over, ahead of any held spin', () => {
    const session = createSession(6, { balls: 0 });
    session.stock = 2;
    session.balls = 1;
    // Pocket 1 of 12: thirty medals.
    script(session, [1.5 / ROULETTE.length]);
    const events: SessionEvent[] = [];
    advance(session, DT, events);
    expect(types(events)).toEqual(['rouletteStart']);
    expect(session.roulette?.pocket).toBe(1);
    expect(session.roulettes).toBe(1);
    expect(session.balls).toBe(0);
    expect(session.stock).toBe(2);
    expect(session.spins).toBe(0);
  });

  it('throws thirty medals on loose and holds the prize up before the next spin', () => {
    const session = createSession(6, { balls: 0 });
    session.balls = 1;
    session.stock = 1;
    script(session, [1.5 / ROULETTE.length]);
    const events = play(session, TIMING.roulette + 0.1);
    expect(events.find((event) => event.type === 'rouletteEnd')).toMatchObject({ pocket: 1, payout: 30, jackpot: false });
    expect(session.paidOut).toBe(30);
    expect(session.machine.growing).toBe(0);
    expect(session.roulette?.payout).toBe(30);
    expect(session.spins).toBe(0);
    play(session, TIMING.prize + 0.1);
    expect(session.roulette).toBeNull();
    expect(session.spins).toBe(1);
  });

  it('stacks a hundred medals as four towers', () => {
    const session = createSession(6, { balls: 0 });
    session.balls = 1;
    script(session, [4.5 / ROULETTE.length]);
    play(session, TIMING.roulette + 0.1);
    expect(session.paidOut).toBe(100);
    expect(session.machine.payoutQueue).toBe(0);
    expect(towersOf(session)).toHaveLength(4);
  });

  it('pays the jackpot as a wall of towers and starts it over', () => {
    const session = createSession(6, { balls: 0 });
    session.jackpot = 337;
    session.jackpotProgress = 12;
    session.balls = 1;
    script(session, [0]);
    const events = play(session, TIMING.roulette + 0.1);
    expect(events.find((event) => event.type === 'rouletteEnd')).toMatchObject({ pocket: 0, payout: 337, jackpot: true });
    expect(session.jackpots).toBe(1);
    expect(session.jackpot).toBe(JACKPOT_START);
    expect(session.jackpotProgress).toBe(0);
    expect(session.paidOut).toBe(337);
    expect(towersOf(session)).toHaveLength(14);
    expect(isBusy(session)).toBe(true);
  });
});

describe('a session played for a while', () => {
  it('keeps its books: medals, the purse, gate hits and spins all add up', () => {
    const session = createSession(77, { quickPick: true });
    const start = medalsOnField(session.machine);
    const events: SessionEvent[] = [];
    let clock = 1;
    for (let i = 0; i < 60 * 100; i++) {
      if (clock >= 0.2) {
        clock = 0;
        if (session.credits === 0) refill(session);
        insert(session, 50);
      }
      advance(session, DT, events);
      clock += DT;
    }
    expect(session.inserted).toBeGreaterThan(400);
    expect(start + session.inserted + session.paidOut).toBe(medalsOnField(session.machine) + session.won + session.lost);
    expect(session.credits).toBe(START_CREDITS * (1 + session.refills) - session.inserted + session.won);
    // Every medal through a gate either started a spin, is held, or found the machine full.
    expect(session.hits).toBe(session.spins + session.stock + session.wasted);
    expect(session.hits).toBeGreaterThan(50);
    // At five a second the reels cannot keep up with the centre gate.
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
          insert(session, [25, 50, 75][session.inserted % 3]);
        }
        advance(session, DT);
        clock += DT;
      }
      return [session.inserted, session.won, session.lost, session.hits, session.spins, session.paidOut, session.credits, session.jackpot, session.roulettes, session.square];
    };
    expect(play300()).toEqual(play300());
  }, LONG);
});
