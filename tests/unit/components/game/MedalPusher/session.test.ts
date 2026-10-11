import { describe, expect, it } from 'vitest';

import { DROP_INTERVAL, FALL_TIME, ballsOnField, checkerCentres, medalsOnField, seededRng } from '@/components/game/MedalPusher/engine';
import {
  BALL_JACKPOT_CHANCE,
  BOARD,
  BOWL,
  CHAIN_GOAL,
  CHALLENGE_CHANCE,
  FEVER_SQUARE,
  JACKPOT_START,
  JACKPOT_STEP,
  ROULETTE,
  rouletteValue,
} from '@/components/game/MedalPusher/lottery';
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
/** Where to let a medal go now for it to come down through the centre gate: where that gate will be by then. */
const centreGate = (session: Session): number => checkerCentres(session.machine.time + FALL_TIME)[1];

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

  it('holds eight spins while the screen is busy, and wastes a gate hit beyond that', () => {
    expect(MAX_STOCK).toBe(8);
    const session = createSession(5, { balls: 0 });
    // A chest nobody picks keeps the screen busy, and with no scatter every medal lands where it is aimed.
    session.bonus = { kind: 'chest', prizes: [10, 20, 30], fallback: 0, picked: -1, elapsed: 0, pickedAt: -1, told: false, payout: -1 };
    script(session, []);
    const events: SessionEvent[] = [];
    for (let medal = 0; medal < MAX_STOCK + 3; medal++) {
      expect(insert(session, centreGate(session))).toBe(true);
      for (let i = 0; i < Math.round(0.3 / DT); i++) advance(session, DT, events);
    }
    for (let i = 0; i < Math.round(FALL_TIME / DT); i++) advance(session, DT, events);
    const gates = events.filter((event) => event.type === 'checker');
    expect(gates).toHaveLength(MAX_STOCK + 3);
    expect(gates.every((event) => event.type === 'checker' && event.gate === 1)).toBe(true);
    // The first eight are held, in the order they came; the three after them start nothing.
    expect(gates.map((event) => event.type === 'checker' && event.held)).toEqual([...Array(MAX_STOCK).fill(true), false, false, false]);
    expect(session.hits).toBe(MAX_STOCK + 3);
    expect(session.stock).toBe(MAX_STOCK);
    expect(session.wasted).toBe(3);
    expect(session.spins).toBe(0);
    expect(types(events)).not.toContain('spinStart');
  });

  it('starts a spin only for a medal that comes down where a gate is by then', () => {
    const through = (aim: (session: Session) => number) => {
      const session = createSession(5, { balls: 0 });
      // Just before the gates come back through the middle of their sweep, where they move fastest.
      play(session, 2.8);
      script(session, []);
      insert(session, aim(session));
      const events = play(session, FALL_TIME + 0.1);
      return { session, events };
    };
    // Let go where the centre gate will be: a hit, held for a moment and spun at once.
    const led = through(centreGate);
    expect(led.events.filter((event) => event.type === 'checker')).toEqual([{ type: 'checker', gate: 1, held: true }]);
    expect(led.session.hits).toBe(1);
    expect(led.session.spins).toBe(1);
    // Let go where the gate is now: by the time the medal is down, the gate has moved out from over it.
    const late = through((session) => checkerCentres(session.machine.time)[1]);
    expect(types(late.events)).not.toContain('checker');
    expect(late.session.hits).toBe(0);
    expect(late.session.spins).toBe(0);
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
    script(session, [0.03, 0.3, 0.2], draw(1));
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
    expect(session.stock).toBe(1);
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
  /**
   * A ball whose every draw comes out the same, whatever the field draws in between.
   * Pockets 1, 5 and 9 are all tens, and the draws that pick them pick the first, second and third hole.
   */
  const withRun = (hole: number): Session => {
    const session = createSession(6, { balls: 0 });
    session.balls = 1;
    script(session, [], draw([1, 5, 9][hole]));
    return session;
  };

  it('has the holes and the pockets its tests rely on', () => {
    expect(CHAIN_GOAL).toBe(4);
    expect(BOWL).toEqual(['jackpot', 50, 100]);
    expect([1, 5, 9].map((pocket) => ROULETTE[pocket])).toEqual([10, 10, 10]);
    expect(TIMING.bowl).toBeCloseTo(6.5, 9);
  });

  it('lets the ball go in the bowl after four numbers in a row, its hole already drawn', () => {
    const session = withRun(1);
    const run = play(session, RUN + 0.1);
    expect(run.filter((event) => event.type === 'rouletteStep')).toHaveLength(CHAIN_GOAL);
    // The last number is up, and the run is neither over nor in the bowl yet.
    expect(types(run)).not.toContain('bowlStart');
    expect(types(run)).not.toContain('rouletteEnd');
    expect(session.roulette).toMatchObject({ level: 4, total: 40, gain: 10, landed: true, over: false, bowl: null });
    const start = play(session, TIMING.step);
    expect(start.find((event) => event.type === 'bowlStart')).toMatchObject({ hole: 1, duration: TIMING.bowl });
    expect(session.roulette?.bowl).toMatchObject({ hole: 1, duration: TIMING.bowl, payout: -1 });
    // While the ball rolls there is no fifth turn and nothing more is paid.
    const rolling = play(session, TIMING.bowl - 0.3);
    expect(types(rolling)).not.toContain('rouletteStep');
    expect(types(rolling)).not.toContain('bowlEnd');
    expect(session.roulette).toMatchObject({ level: 4, total: 40, over: false, jackpot: false });
    expect(session.paidOut).toBe(40);
    expect(isBusy(session)).toBe(true);
  });

  it('pays fifty or a hundred medals as towers and leaves the jackpot alone', () => {
    for (const [hole, medals] of [
      [1, 50],
      [2, 100],
    ]) {
      const session = withRun(hole);
      session.jackpot = 337;
      session.jackpotProgress = 12;
      const before = medalsOnField(session.machine);
      const events = play(session, RUN + TIMING.step + TIMING.bowl + 0.2);
      expect(events.find((event) => event.type === 'bowlEnd')).toMatchObject({ hole, payout: medals, total: 40 + medals, jackpot: false });
      // The ball ends the run: there is no cross to announce.
      expect(types(events)).not.toContain('rouletteEnd');
      expect(session.roulette).toMatchObject({ over: true, jackpot: false, gain: medals, total: 40 + medals });
      expect(session.roulette?.bowl).toMatchObject({ hole, payout: medals });
      expect(session.paidOut).toBe(40 + medals);
      expect(session.machine.payoutQueue).toBe(0);
      expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before + 40 + medals);
      expect(session.jackpots).toBe(0);
      expect(session.jackpot).toBe(337);
      expect(session.jackpotProgress).toBe(12);
      // The prize stays up, then the screen is free.
      play(session, TIMING.prize - 0.4);
      expect(session.roulette).not.toBeNull();
      play(session, 0.5);
      expect(session.roulette).toBeNull();
    }
  });

  it('pays the jackpot as towers when the ball drops into its hole, and starts it over', () => {
    const session = withRun(0);
    session.jackpot = 337;
    session.jackpotProgress = 12;
    const before = medalsOnField(session.machine);
    const events = play(session, RUN + TIMING.step + TIMING.bowl + 0.2);
    expect(events.filter((event) => event.type === 'bowlStart')).toHaveLength(1);
    expect(events.find((event) => event.type === 'bowlEnd')).toMatchObject({ hole: 0, payout: 337, total: 40 + 337, jackpot: true });
    expect(types(events)).not.toContain('rouletteEnd');
    expect(session.roulette).toMatchObject({ over: true, jackpot: true, gain: 337, total: 377 });
    expect(session.jackpots).toBe(1);
    expect(session.jackpot).toBe(JACKPOT_START);
    expect(session.jackpotProgress).toBe(0);
    expect(session.paidOut).toBe(377);
    expect(medalsOnField(session.machine) + session.won + session.lost).toBe(before + 377);
    expect(isBusy(session)).toBe(true);
    // It is paid once, and then the run is over.
    const after = play(session, TIMING.prize + 0.2);
    expect(types(after).filter((type) => type.startsWith('roulette') || type.startsWith('bowl'))).toEqual([]);
    expect(session.roulette).toBeNull();
    expect(session.paidOut).toBe(377);
  });

  it('pays the jackpot as it stands when the ball drops', () => {
    const session = withRun(0);
    play(session, RUN + TIMING.step + 1);
    // Medals dropped while the ball rolls still count.
    session.jackpot = JACKPOT_START + 3;
    const events = play(session, TIMING.bowl);
    expect(events.find((event) => event.type === 'bowlEnd')).toMatchObject({ payout: JACKPOT_START + 3, jackpot: true });
    expect(session.jackpot).toBe(JACKPOT_START);
  });

  it('holds the screen until the ball has dropped and its prize has been up', () => {
    const session = withRun(2);
    session.stock = 2;
    play(session, RUN + TIMING.step + 0.1);
    expect(session.roulette?.bowl).not.toBeNull();
    // Another ball goes over while this one is in the bowl.
    session.balls = 1;
    const during = play(session, TIMING.bowl + TIMING.prize - 0.3);
    expect(types(during).filter((type) => ['rouletteStart', 'spinStart', 'sugorokuStart', 'chestStart'].includes(type))).toEqual([]);
    expect(types(during).filter((type) => type.startsWith('bowl'))).toEqual(['bowlEnd']);
    expect(session.spins).toBe(0);
    expect(session.roulettes).toBe(1);
    // Then the waiting ball has its roulette, ahead of the held spins.
    const after = play(session, 0.4);
    expect(types(after).filter((type) => type === 'rouletteStart' || type === 'spinStart')).toEqual(['rouletteStart']);
    expect(session.roulette).toMatchObject({ level: 0, total: 0, bowl: null, over: false });
    expect(session.roulettes).toBe(2);
    expect(session.stock).toBe(2);
  });

  it('gets to the bowl and to the jackpot as often as the exact odds say', () => {
    // Ball after ball in big steps of time. The field is swept bare before each, so the towers never pile up.
    const session = createSession(9, { balls: 0 });
    session.machine.rng = seededRng(4242);
    const runs = 6000;
    const events: SessionEvent[] = [];
    for (let i = 0; i < runs; i++) {
      expect(session.machine.growing).toBe(0);
      session.machine.medals = [];
      session.balls = 1;
      do advance(session, 0.5, events);
      while (session.roulette);
    }
    const count = (type: SessionEvent['type']) => events.filter((event) => event.type === type).length;
    expect(session.roulettes).toBe(runs);
    expect(count('rouletteStart')).toBe(runs);
    // Every run ends once: on a cross, or with the ball in a hole.
    expect(count('rouletteEnd') + count('bowlEnd')).toBe(runs);
    expect(count('bowlStart')).toBe(count('bowlEnd'));
    const within = (seen: number, p: number) => Math.abs(seen / runs - p) < 4 * Math.sqrt((p * (1 - p)) / runs);
    expect(within(count('bowlStart'), CHALLENGE_CHANCE)).toBe(true);
    expect(within(session.jackpots, BALL_JACKPOT_CHANCE)).toBe(true);
    // Nobody drops a medal, so the jackpot stays where it starts and a ball is worth its exact average.
    // What one ball pays varies by about 99 medals, so the mean of 6,000 varies by about 1.3.
    expect(session.jackpot).toBe(JACKPOT_START);
    expect(Math.abs(session.paidOut / runs - rouletteValue(JACKPOT_START))).toBeLessThan(6);
  }, LONG);
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
        insert(session, centreGate(session));
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
    // At five a second the reels cannot keep up with a player who follows the centre gate, even with eight held.
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
