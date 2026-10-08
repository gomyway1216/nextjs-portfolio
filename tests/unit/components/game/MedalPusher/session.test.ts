import { describe, expect, it } from 'vitest';

import { DROP_INTERVAL, ballsOnField, medalsOnField } from '@/components/game/MedalPusher/engine';
import { JACKPOT_START, JACKPOT_STEP, ROULETTE } from '@/components/game/MedalPusher/lottery';
import {
  MAX_STOCK,
  PAID_AS_TOWER,
  START_BALLS,
  START_CREDITS,
  TIMING,
  advance,
  createSession,
  insert,
  isBusy,
  refill,
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

describe('a new session', () => {
  it('starts with a purse, a jackpot and two balls on the field', () => {
    const session = createSession(1);
    expect(session.credits).toBe(START_CREDITS);
    expect(session.jackpot).toBe(JACKPOT_START);
    expect(ballsOnField(session.machine)).toBe(START_BALLS);
    expect(ballsOnField(createSession(1, 0).machine)).toBe(0);
    expect(isBusy(session)).toBe(false);
    expect(session.spin).toBeNull();
    expect(session.roulette).toBeNull();
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

describe('the screen', () => {
  it('spins once for a held spin and pays three even digits as loose medals', () => {
    const session = createSession(5, 0);
    session.stock = 1;
    // The tier roll, then the digit: an even triple.
    script(session, [0.03, 0.3]);
    advance(session, DT);
    expect(session.stock).toBe(0);
    expect(session.spins).toBe(1);
    expect(session.spin?.result.tier).toBe('small');
    expect(session.spin?.duration).toBeCloseTo(TIMING.spin + TIMING.reach, 9);

    const events = play(session, TIMING.spin + TIMING.reach + 0.05);
    expect(types(events)).toContain('spinEnd');
    expect(session.paidOut).toBe(8);
    expect(session.tiers.small).toBe(1);
    expect(session.machine.growing).toBe(0);
    expect(PAID_AS_TOWER.small).toBe(false);
    // The line stays up for a moment before the next spin can start.
    expect(session.spin).not.toBeNull();
    play(session, TIMING.celebrate);
    expect(session.spin).toBeNull();
  });

  it('pays three odd digits as a tower on the pusher', () => {
    const session = createSession(5, 0);
    const before = medalsOnField(session.machine);
    session.stock = 1;
    script(session, [0.01, 0.3]);
    play(session, TIMING.spin + TIMING.reach + 0.1);
    expect(session.tiers.big).toBe(1);
    expect(session.paidOut).toBe(20);
    expect(session.machine.payoutQueue).toBe(0);
    expect(session.machine.medals.filter((m) => m.stack > 1 || m.grow > 0)).toHaveLength(1);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before + 20);
    expect(PAID_AS_TOWER.big).toBe(true);
  });

  it('pays three sevens as a ball, with no medals and no roulette yet', () => {
    const session = createSession(5, 0);
    const before = medalsOnField(session.machine);
    session.stock = 1;
    script(session, [0.001]);
    const events = play(session, TIMING.spin + TIMING.reach + 0.1);
    expect(session.tiers.seven).toBe(1);
    expect(session.paidOut).toBe(0);
    expect(ballsOnField(session.machine)).toBe(1);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before);
    expect(types(events)).not.toContain('rouletteStart');
    play(session, TIMING.celebrate + 0.1);
    expect(session.roulette).toBeNull();
    expect(session.roulettes).toBe(0);
  });

  it('pays nothing for a losing spin and moves straight on to the next', () => {
    const session = createSession(5, 0);
    session.stock = 2;
    // A miss with no reach: tier, left digit, the reach roll, right and centre digits.
    script(session, [0.5, 0.1, 0.9, 0.5, 0.5]);
    advance(session, DT);
    expect(session.spin?.result.reach).toBe(false);
    expect(session.spin?.duration).toBeCloseTo(TIMING.spin, 9);
    const events = play(session, TIMING.spin + 0.05);
    expect(session.paidOut).toBe(0);
    expect(session.tiers.miss).toBe(1);
    expect(events.filter((event) => event.type === 'spinStart')).toHaveLength(1);
    expect(session.spins).toBe(2);
  });

  it('hurries the reels when spins are queueing behind', () => {
    const session = createSession(5, 0);
    session.stock = MAX_STOCK;
    script(session, [0.5, 0.1, 0.9, 0.5, 0.5]);
    advance(session, DT);
    expect(session.spin?.duration).toBeCloseTo(TIMING.quickSpin, 9);
  });
});

describe('the roulette', () => {
  it('starts when a ball has gone over, ahead of any held spin', () => {
    const session = createSession(6, 0);
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
    const session = createSession(6, 0);
    session.balls = 1;
    session.stock = 1;
    script(session, [1.5 / ROULETTE.length]);
    const events = play(session, TIMING.roulette + 0.1);
    const end = events.find((event) => event.type === 'rouletteEnd');
    expect(end).toMatchObject({ pocket: 1, payout: 30, jackpot: false });
    expect(session.paidOut).toBe(30);
    expect(session.machine.growing).toBe(0);
    expect(session.roulette?.payout).toBe(30);
    expect(session.spins).toBe(0);
    play(session, TIMING.prize + 0.1);
    expect(session.roulette).toBeNull();
    expect(session.spins).toBe(1);
  });

  it('stacks a hundred medals as four towers', () => {
    const session = createSession(6, 0);
    session.balls = 1;
    script(session, [4.5 / ROULETTE.length]);
    play(session, TIMING.roulette + 0.1);
    expect(session.paidOut).toBe(100);
    expect(session.machine.payoutQueue).toBe(0);
    expect(session.machine.medals.filter((m) => m.stack > 1 || m.grow > 0)).toHaveLength(4);
  });

  it('pays the jackpot as a wall of towers and starts it over', () => {
    const session = createSession(6, 0);
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
    expect(session.machine.medals.filter((m) => m.stack > 1 || m.grow > 0)).toHaveLength(14);
    expect(isBusy(session)).toBe(true);
  });
});

describe('a session played for a while', () => {
  it('keeps its books: medals, the purse, gate hits and spins all add up', () => {
    const session = createSession(77);
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
    const ballsOver = events.filter((event) => event.type === 'ball').reduce((sum, event) => sum + (event.type === 'ball' ? event.count : 0), 0);
    expect(ballsOver).toBeGreaterThanOrEqual(START_BALLS);
    expect(session.roulettes + session.balls).toBe(ballsOver);
    expect(ballsOver + ballsOnField(session.machine)).toBe(START_BALLS + session.tiers.seven);
    expect(events.filter((event) => event.type === 'won').reduce((sum, event) => sum + (event.type === 'won' ? event.count : 0), 0)).toBe(session.won);
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
      return [session.inserted, session.won, session.lost, session.hits, session.spins, session.paidOut, session.credits, session.jackpot, session.roulettes];
    };
    expect(play300()).toEqual(play300());
  }, LONG);
});
