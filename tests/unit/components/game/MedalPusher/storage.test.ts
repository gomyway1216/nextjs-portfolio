import { describe, expect, it } from 'vitest';

import { DROP_INTERVAL, FIELD, SETTLE, TOWER, ballsOnField, buildTowers, medalsOnField, queuePayout, seededRng } from '@/components/game/MedalPusher/engine';
import { BOARD, CHESTS, JACKPOT_START, JACKPOT_STEP, ROULETTE } from '@/components/game/MedalPusher/lottery';
import {
  MAX_STOCK,
  START_CREDITS,
  advance,
  createSession,
  insert,
  pickChest,
  refill,
  sugorokuDuration,
  type Session,
} from '@/components/game/MedalPusher/session';
import { LIMITS, STORAGE_KEY, STORAGE_VERSION, restore, serialize } from '@/components/game/MedalPusher/storage';

const DT = 1 / 60;
/** Tests that run the machine for a good while get room on a slow machine. */
const LONG = 30_000;

/** A machine that has been played: three medals a second across the field, the purse refilled when it is empty. */
function played(seed: number, seconds = 40): Session {
  const session = createSession(seed);
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (session.credits === 0) refill(session);
    if (i % 20 === 0) insert(session, 12 + ((i * 37) % 76));
    advance(session, DT);
  }
  return session;
}

/** Everything about a session but its generator, which is the one thing a save does not hold. */
const plain = (session: Session) => ({ ...session, machine: { ...session.machine, rng: null } });

/** The session written down and read back. */
function reread(session: Session, seed = 1): Session {
  const back = restore(serialize(session), seed);
  if (!back) throw new Error('the save was refused');
  return back;
}

/** Makes the machine's next draws come out as scripted, then fall back to a fixed value. */
function script(session: Session, values: number[], then = 0.5): void {
  const queue = [...values];
  session.machine.rng = () => queue.shift() ?? then;
}

/** The roll that stops the roulette on a given pocket. */
const pocketRoll = (pocket: number): number => (pocket + 0.5) / ROULETTE.length;

const everyPosition = (session: Session): number[] => [
  ...session.machine.medals.flatMap((medal) => [medal.x, medal.y, medal.grown, medal.sinceDrop]),
  ...session.machine.falling.flatMap((medal) => [medal.x, medal.y, medal.fromX, medal.fromY, medal.remaining]),
];

describe('a save', () => {
  it('brings a played machine back with the same plain data', { timeout: LONG }, () => {
    const session = played(11);
    expect(session.inserted).toBeGreaterThan(100);
    expect(session.won).toBeGreaterThan(0);
    const back = reread(session, 3);
    expect(plain(back)).toEqual(plain(session));
    expect(serialize(back)).toBe(serialize(session));
    // The generator is a new one: it draws, and it is not the old one.
    expect(back.machine.rng).not.toBe(session.machine.rng);
    const draw = back.machine.rng();
    expect(draw).toBeGreaterThanOrEqual(0);
    expect(draw).toBeLessThan(1);
  });

  it('is a version, the field, the numbers and the screen, without the generator', () => {
    const session = createSession(2);
    const save = JSON.parse(serialize(session));
    expect(Object.keys(save).sort()).toEqual(['machine', 'screen', 'session', 'version']);
    expect(save.version).toBe(STORAGE_VERSION);
    expect(save.machine).not.toHaveProperty('rng');
    expect(save.machine.medals).toHaveLength(session.machine.medals.length);
    expect(save.session.credits).toBe(START_CREDITS);
    expect(save.session.jackpot).toBe(JACKPOT_START);
    expect(save.screen).toEqual({ spin: null, bonus: null, roulette: null });
    expect(STORAGE_KEY).toMatch(/^medal-pusher/);
  });

  it('stays well under 100 KB for a machine in play', { timeout: LONG }, () => {
    // Every character of a save is ASCII, so its length is its size in bytes.
    const fresh = serialize(createSession(4));
    const inPlay = serialize(played(4));
    expect(fresh).toMatch(/^[\x20-\x7e]*$/);
    expect(fresh.length).toBeGreaterThan(10_000);
    expect(fresh.length).toBeLessThan(100_000);
    expect(inPlay.length).toBeLessThan(100_000);
  });

  it('carries on exactly as the machine it was written from would have, given the same draws', { timeout: LONG }, () => {
    const session = played(21, 20);
    session.machine.rng = seededRng(77);
    const back = reread(session, 77);
    for (let i = 0; i < 600; i++) {
      for (const machine of [session, back]) {
        if (machine.credits === 0) refill(machine);
        if (i % 15 === 0) insert(machine, 20 + ((i * 13) % 60));
        advance(machine, DT);
      }
    }
    expect(session.machine.time).toBeGreaterThan(29);
    expect(plain(back)).toEqual(plain(session));
  });

  it('carries on with a generator of its own, and its books still balance', { timeout: LONG }, () => {
    const session = played(8, 20);
    const medals = medalsOnField(session.machine);
    const back = reread(session, 123456);
    expect(medalsOnField(back.machine)).toBe(medals);
    expect(ballsOnField(back.machine)).toBe(ballsOnField(session.machine));
    back.stock = MAX_STOCK;
    for (let i = 0; i < 900; i++) {
      if (back.credits === 0) refill(back);
      if (i % 12 === 0) insert(back, 15 + ((i * 29) % 70));
      advance(back, DT);
    }
    expect(back.spins).toBeGreaterThan(session.spins);
    expect(back.credits).toBe(START_CREDITS * (1 + back.refills) - back.inserted + back.won);
    expect(everyPosition(back).every(Number.isFinite)).toBe(true);
    // And it can be written down and read back again.
    expect(plain(reread(back))).toEqual(plain(back));
  });

  it('holds a machine in the middle of a jackpot, however full the field gets', { timeout: LONG }, () => {
    const session = played(5, 10);
    buildTowers(session.machine, TOWER.max * 18);
    queuePayout(session.machine, 300);
    let most = 0;
    for (let i = 0; i < 60 * 40; i++) {
      if (session.credits === 0) refill(session);
      insert(session, 10 + ((i * 7) % 80));
      advance(session, DT);
      if (i % 60 === 0) {
        const text = serialize(session);
        most = Math.max(most, text.length);
        expect(restore(text, 1)).not.toBeNull();
      }
    }
    expect(session.machine.medals.length).toBeLessThan(LIMITS.medals);
    expect(most).toBeLessThan(LIMITS.length / 2);
  });
});

describe('what the screen is in the middle of', () => {
  /** A session with nothing on the field's mind: no balls lying about, nothing held. */
  const quiet = (): Session => createSession(5, { balls: 0 });

  /** Runs a session, writing it down and reading it back ten times a second, and notes what was on the screen each time. */
  function follow(session: Session, seconds: number, seen: Set<string>, each?: (step: number) => void): void {
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      each?.(i);
      advance(session, DT);
      if (i % 6 !== 0) continue;
      const { spin, bonus, roulette } = session;
      if (spin) seen.add(spin.done ? 'spin done' : 'spin');
      if (bonus?.kind === 'sugoroku') seen.add(bonus.payout < 0 ? 'sugoroku' : 'sugoroku paid');
      if (bonus?.kind === 'chest') seen.add(bonus.payout >= 0 ? 'chest paid' : bonus.picked >= 0 ? 'chest picked' : 'chest');
      if (roulette) seen.add(roulette.jackpot ? 'jackpot' : roulette.over ? 'roulette over' : roulette.landed ? 'roulette landed' : 'roulette');
      const back = reread(session);
      expect(serialize(back)).toBe(serialize(session));
      expect(back.spin).toEqual(session.spin);
      expect(back.bonus).toEqual(session.bonus);
      expect(back.roulette).toEqual(session.roulette);
    }
  }

  it('comes back at every moment of a spin, a bonus game and a roulette', { timeout: LONG }, () => {
    const seen = new Set<string>();

    // Two spins that miss: every draw is one no line comes of.
    let session = quiet();
    session.stock = 2;
    script(session, [0.99]);
    follow(session, 7, seen);
    expect(session.tiers.miss).toBe(2);

    // 2·2·2 and a roll on the board.
    session = quiet();
    session.stock = 1;
    script(session, [0.03, 0, 0.5]);
    follow(session, 9, seen);
    expect(session.tiers.small).toBe(1);
    expect(session.square).toBeGreaterThan(0);

    // 1·1·1 and the chests, once left to the clock and once picked by the player.
    for (const pick of [false, true]) {
      session = quiet();
      session.stock = 1;
      script(session, [0.01, 0]);
      follow(session, 17, seen, () => {
        if (pick && session.bonus?.kind === 'chest' && session.bonus.elapsed > 1) pickChest(session, 1);
      });
      expect(session.tiers.big).toBe(1);
      expect(session.paidOut).toBeGreaterThan(0);
    }

    // A ball's roulette: two numbers and a cross.
    session = quiet();
    session.balls = 1;
    script(session, [pocketRoll(1), pocketRoll(2), pocketRoll(0)]);
    follow(session, 16, seen);
    expect(session.roulettes).toBe(1);
    expect(session.jackpots).toBe(0);

    // And one that goes all the way.
    session = quiet();
    session.balls = 1;
    script(session, [1, 2, 3, 5, 6, 7].map(pocketRoll));
    follow(session, 30, seen);
    expect(session.jackpots).toBe(1);

    const everything = ['spin', 'spin done', 'sugoroku', 'sugoroku paid', 'chest', 'chest picked', 'chest paid', 'roulette', 'roulette landed', 'roulette over', 'jackpot'];
    expect([...seen].sort()).toEqual(everything.sort());
  });
});

// ── Saves that are not what they should be ──────────────────────────────────

type Row = Record<string, unknown>;
/** A save as it is stored, typed loosely enough for a test to damage it. */
interface Save {
  version: unknown;
  machine: Row & { medals: Row[]; falling: Row[] };
  session: Row & { tiers: Row };
  screen: Row;
}

/**
 * A good save with one of everything: medals in both tiers of both tables,
 * two balls, three towers still going up and a medal in the air.
 */
const GOOD = (() => {
  const session = createSession(3);
  buildTowers(session.machine, 60);
  insert(session, 50);
  for (let i = 0; i < 4; i++) advance(session, DT);
  session.roulettes = 3;
  return serialize(session);
})();

const good = (): Save => JSON.parse(GOOD);
const damaged = (damage: (save: Save) => void): string => {
  const save = good();
  damage(save);
  return JSON.stringify(save);
};
const find = (rows: Row[], test: (row: Row) => boolean): Row => {
  const row = rows.find(test);
  if (!row) throw new Error('the good save has no such medal');
  return row;
};
const tower = (save: Save): Row => find(save.machine.medals, (medal) => (medal.grow as number) > 0);
const ball = (save: Save): Row => find(save.machine.medals, (medal) => medal.ball === true);
const loose = (save: Save): Row => find(save.machine.medals, (medal) => medal.ball === false && medal.stack === 1 && medal.grow === 0);
const inAir = (save: Save): Row => save.machine.falling[0];

describe('the good save the damaged ones are made from', () => {
  it('reads, and holds one of everything', () => {
    const save = good();
    expect(restore(GOOD, 1)).not.toBeNull();
    expect(save.machine.medals.filter((medal) => (medal.grow as number) > 0)).toHaveLength(3);
    expect(save.machine.medals.filter((medal) => medal.ball)).toHaveLength(2);
    expect(save.machine.medals.some((medal) => medal.tier === 1 && medal.level === 0)).toBe(true);
    expect(save.machine.medals.some((medal) => medal.tier === 1 && medal.level === 1)).toBe(true);
    expect(save.machine.falling).toHaveLength(1);
    expect(save.machine.growing).toBeGreaterThan(0);
    // Damage that changes nothing is no damage.
    expect(restore(damaged(() => {}), 1)).not.toBeNull();
  });
});

describe('a text that is not a save', () => {
  const texts: [string, string][] = [
    ['nothing at all', ''],
    ['a word', 'medals'],
    ['null', 'null'],
    ['a number', '42'],
    ['a string', '"a save"'],
    ['a list', '[]'],
    ['an empty object', '{}'],
    ['half a save', GOOD.slice(0, GOOD.length / 2)],
    ['a save with something after it', `${GOOD}}`],
    ['a save inside a list', `[${GOOD}]`],
    ['a number too big to be a number', GOOD.replace(/"credits":\d+/, '"credits":1e999')],
    ['a negative number too big to be a number', GOOD.replace(/"time":[^,]+/, '"time":-1e999')],
    ['a text longer than any machine', `${GOOD}${' '.repeat(LIMITS.length)}`],
  ];

  it.each(texts)('refuses %s', (_name, text) => {
    expect(text).not.toBe(GOOD);
    expect(restore(text, 1)).toBeNull();
  });

  it('refuses no text, and anything that is not text, without throwing', () => {
    expect(restore(null, 1)).toBeNull();
    for (const value of [undefined, 42, true, {}, [], () => GOOD, Symbol('save'), JSON.parse(GOOD)]) {
      expect(restore(value as unknown as string, 1)).toBeNull();
    }
  });

  it('refuses a seed no generator can start from, without throwing', () => {
    expect(restore(GOOD, Number.NaN)).toBeNull();
    expect(restore(GOOD, Number.POSITIVE_INFINITY)).toBeNull();
    expect(restore(GOOD, -7.5)).not.toBeNull();
  });
});

describe('a save that has been damaged', () => {
  const cases: [string, (save: Save) => void][] = [
    // The save as a whole
    ['an older version', (save) => (save.version = STORAGE_VERSION - 1)],
    ['a newer version', (save) => (save.version = STORAGE_VERSION + 1)],
    ['a version written as text', (save) => (save.version = String(STORAGE_VERSION))],
    ['no version', (save) => delete (save as unknown as Row).version],
    ['a part it should not have', (save) => ((save as unknown as Row).extra = 1)],
    ['no field', (save) => delete (save as unknown as Row).machine],
    ['a field that is a list', (save) => ((save as unknown as Row).machine = [])],
    ['no numbers', (save) => delete (save as unknown as Row).session],
    ['numbers that are null', (save) => ((save as unknown as Row).session = null)],
    ['no screen', (save) => delete (save as unknown as Row).screen],
    ['a screen that is a list', (save) => ((save as unknown as Row).screen = [])],
    ['a screen that is null', (save) => ((save as unknown as Row).screen = null)],

    // The purse and the counters
    ['a purse in debt', (save) => (save.session.credits = -1)],
    ['half a medal in the purse', (save) => (save.session.credits = 99.5)],
    ['a purse written as text', (save) => (save.session.credits = '100')],
    ['a purse that is not a number', (save) => (save.session.credits = Number.NaN)],
    ['no purse', (save) => delete save.session.credits],
    ['an absurd purse', (save) => (save.session.credits = LIMITS.purse + 1)],
    ['a jackpot below where it starts', (save) => (save.session.jackpot = JACKPOT_START - 1)],
    ['a jackpot of no medals', (save) => (save.session.jackpot = 0)],
    ['an absurd jackpot', (save) => (save.session.jackpot = LIMITS.purse + 1)],
    ['a jackpot with a fraction', (save) => (save.session.jackpot = JACKPOT_START + 0.5)],
    ['jackpot progress past its step', (save) => (save.session.jackpotProgress = JACKPOT_STEP)],
    ['negative jackpot progress', (save) => (save.session.jackpotProgress = -1)],
    ['more spins held than the machine holds', (save) => (save.session.stock = MAX_STOCK + 1)],
    ['fewer than no spins held', (save) => (save.session.stock = -1)],
    ['a piece off the end of the board', (save) => (save.session.square = BOARD.length)],
    ['a piece before the start of the board', (save) => (save.session.square = -1)],
    ['a piece between two squares', (save) => (save.session.square = 1.5)],
    ['fewer than no balls waiting', (save) => (save.session.balls = -1)],
    ['an absurd number of balls waiting', (save) => (save.session.balls = LIMITS.balls + 1)],
    ['a negative count of medals dropped', (save) => (save.session.inserted = -1)],
    ['an absurd count of medals won', (save) => (save.session.won = LIMITS.count + 1)],
    ['a count that is infinite', (save) => (save.session.lost = Number.POSITIVE_INFINITY)],
    ['a count that is a list', (save) => (save.session.paidOut = [1])],
    ['a count that is true', (save) => (save.session.hits = true)],
    ['a negative count of wasted hits', (save) => (save.session.wasted = -3)],
    ['a count of spins with a fraction', (save) => (save.session.spins = 2.5)],
    ['a count of roulettes that is null', (save) => (save.session.roulettes = null)],
    ['a negative count of fevers', (save) => (save.session.fevers = -1)],
    ['a count of jackpots written as text', (save) => (save.session.jackpots = '0')],
    ['a negative count of refills', (save) => (save.session.refills = -1)],
    ['a tier missing from the tally', (save) => delete save.session.tiers.seven],
    ['a tier the slot does not have', (save) => (save.session.tiers.jackpot = 0)],
    ['a tier counted below zero', (save) => (save.session.tiers.miss = -1)],
    ['a tally that is a list', (save) => ((save.session as Row).tiers = [0, 0, 0, 0])],
    ['a quick pick that is not yes or no', (save) => (save.session.quickPick = 'no')],
    ['a number it should not have', (save) => (save.session.bonusMedals = 5)],
    ['the screen kept among the numbers', (save) => (save.session.spin = null)],

    // The field
    ['a clock running backwards', (save) => (save.machine.time = -1)],
    ['a clock that is not a number', (save) => (save.machine.time = Number.NaN)],
    ['a clock past its bound', (save) => (save.machine.time = LIMITS.clock * 2)],
    ['no clock', (save) => delete save.machine.time],
    ['a generator written into it', (save) => (save.machine.rng = 12345)],
    ['medals that are not a list', (save) => ((save.machine as Row).medals = 'none')],
    [
      'more medals than the tables hold',
      (save) => {
        const nextId = save.machine.nextId as number;
        for (let i = 0; i <= LIMITS.medals; i++) save.machine.medals.push({ ...loose(save), id: nextId + i });
        save.machine.nextId = nextId + LIMITS.medals + 1;
      },
    ],
    ['a payout queue below zero', (save) => (save.machine.payoutQueue = -1)],
    ['half a medal in the payout queue', (save) => (save.machine.payoutQueue = 0.5)],
    ['an absurd payout queue', (save) => (save.machine.payoutQueue = LIMITS.purse + 1)],
    ['a payout clock running backwards', (save) => (save.machine.payoutClock = -0.1)],
    ['a payout clock past a minute', (save) => (save.machine.payoutClock = LIMITS.timer + 1)],
    ['a tower clock that is not a number', (save) => (save.machine.towerClock = Number.NaN)],
    ['a cooldown below zero', (save) => (save.machine.cooldown = -1)],
    ['a cooldown longer than the slot ever waits', (save) => (save.machine.cooldown = DROP_INTERVAL * 2)],
    ['more medals to stack than the towers are waiting for', (save) => (save.machine.growing = (save.machine.growing as number) + 1)],
    ['no medals to stack while towers are waiting', (save) => (save.machine.growing = 0)],
    ['a next id of zero', (save) => (save.machine.nextId = 0)],
    ['a next id a medal already has', (save) => (save.machine.nextId = loose(save).id)],
    ['a next id past its bound', (save) => (save.machine.nextId = LIMITS.count + 1)],

    // A medal
    ['a medal that is null', (save) => ((save.machine.medals as unknown[])[0] = null)],
    ['a medal that is a number', (save) => ((save.machine.medals as unknown[])[0] = 7)],
    ['a medal with a field missing', (save) => delete loose(save).grown],
    ['a medal with a field too many', (save) => (loose(save).colour = 'gold')],
    ['a medal nowhere across the field', (save) => (loose(save).x = Number.NaN)],
    ['a medal far off to the right', (save) => (loose(save).x = 500)],
    ['a medal far off to the left', (save) => (loose(save).x = -50)],
    ['a medal far behind the back wall', (save) => (loose(save).y = -50)],
    ['a medal far beyond the front', (save) => (loose(save).y = 1e6)],
    ['a medal whose place is text', (save) => (loose(save).y = '40')],
    ['a medal on a third table', (save) => (loose(save).level = 2)],
    ['a medal on a table below the lower one', (save) => (loose(save).level = -1)],
    ['a medal in a third tier', (save) => (loose(save).tier = 2)],
    ['a medal between two tiers', (save) => (loose(save).tier = 0.5)],
    ['a medal whose tier is true', (save) => (loose(save).tier = true)],
    ['a stack of no medals', (save) => (loose(save).stack = 0)],
    ['a tower taller than the tallest', (save) => (loose(save).stack = TOWER.max + 1)],
    ['a tower that will be taller than the tallest', (save) => (tower(save).stack = TOWER.max)],
    ['a tower waiting for fewer than no medals', (save) => (tower(save).grow = -1)],
    ['a ball that is a tower', (save) => (ball(save).stack = 2)],
    ['a ball that is a number', (save) => (ball(save).ball = 1)],
    ['a medal that has taken up no room', (save) => (loose(save).grown = 0)],
    ['a medal that has taken up more than its room', (save) => (loose(save).grown = 1.5)],
    ['a medal that dropped before the machine was on', (save) => (loose(save).sinceDrop = -2)],
    ['a medal with no id', (save) => (loose(save).id = 0)],
    ['a medal with half an id', (save) => (loose(save).id = 1.5)],
    ['a medal with an id not yet given out', (save) => (loose(save).id = save.machine.nextId)],
    ['two medals with one id', (save) => (save.machine.medals[1].id = save.machine.medals[0].id)],
    ['a medal in the air with the id of one lying down', (save) => (inAir(save).id = loose(save).id)],
    [
      'more balls than a field ever holds',
      (save) => {
        for (const medal of save.machine.medals) if (medal.stack === 1 && medal.grow === 0) medal.ball = true;
      },
    ],

    // A medal in the air
    ['medals in the air that are not a list', (save) => ((save.machine as Row).falling = {})],
    [
      'more medals in the air than every tower holds',
      (save) => {
        const nextId = save.machine.nextId as number;
        for (let i = 0; i <= LIMITS.falling; i++) save.machine.falling.push({ ...inAir(save), id: nextId + i });
        save.machine.nextId = nextId + LIMITS.falling + 1;
      },
    ],
    ['a medal in the air from nobody', (save) => (inAir(save).source = 'thrown')],
    ['a fall that takes no time', (save) => (inAir(save).duration = 0)],
    ['a fall with more time left than it takes', (save) => (inAir(save).remaining = (inAir(save).duration as number) + 1)],
    ['a fall with less than no time left', (save) => (inAir(save).remaining = -1)],
    ['a fall that takes for ever', (save) => (inAir(save).duration = Number.POSITIVE_INFINITY)],
    ['a medal off the top of the tallest tower', (save) => (inAir(save).rank = TOWER.max)],
    ['a medal in the air towards a third table', (save) => (inAir(save).level = 3)],
    ['a medal let go far outside the field', (save) => (inAir(save).fromX = 1000)],
    ['a medal let go from nowhere', (save) => (inAir(save).fromY = null)],
    ['a medal in the air with a field missing', (save) => delete inAir(save).rank],
  ];

  it.each(cases)('refuses %s', (_name, damage) => {
    expect(restore(damaged(damage), 1)).toBeNull();
  });
});

describe('a save at the very edge of what a machine can be', () => {
  const cases: [string, (save: Save) => void][] = [
    ['an empty purse', (save) => (save.session.credits = 0)],
    ['the fullest purse', (save) => (save.session.credits = LIMITS.purse)],
    ['the biggest jackpot', (save) => (save.session.jackpot = LIMITS.purse)],
    ['jackpot progress one medal short of its step', (save) => (save.session.jackpotProgress = JACKPOT_STEP - 1)],
    ['every spin held', (save) => (save.session.stock = MAX_STOCK)],
    ['the piece on the last square', (save) => (save.session.square = BOARD.length - 1)],
    ['as many balls waiting as may wait', (save) => (save.session.balls = LIMITS.balls)],
    ['a quick pick', (save) => (save.session.quickPick = true)],
    ['a medal a diameter outside the left wall', (save) => (loose(save).x = -LIMITS.margin)],
    ['a medal a diameter beyond the front', (save) => (loose(save).y = FIELD.depth + LIMITS.margin)],
    ['a tower that will be as tall as the tallest', (save) => (tower(save).stack = TOWER.max - (tower(save).grow as number))],
    ['a medal that has only just landed', (save) => (loose(save).grown = SETTLE.from)],
    ['a medal that dropped this instant', (save) => (loose(save).sinceDrop = 0)],
    ['a slot that has only just fed a medal', (save) => (save.machine.cooldown = DROP_INTERVAL)],
    ['a medal about to land', (save) => (inAir(save).remaining = 0)],
    ['a clock that has run for years', (save) => (save.machine.time = LIMITS.clock / 2)],
    ['nothing in the air', (save) => (save.machine.falling = [])],
    [
      'a field with no medals on it at all',
      (save) => {
        save.machine.medals = [];
        save.machine.falling = [];
        save.machine.growing = 0;
      },
    ],
  ];

  it.each(cases)('keeps %s, and the machine runs', (_name, change) => {
    const text = damaged(change);
    expect(text).not.toBe(GOOD);
    const back = restore(text, 1);
    expect(back).not.toBeNull();
    for (let i = 0; i < 30; i++) advance(back as Session, DT);
    expect(everyPosition(back as Session).every(Number.isFinite)).toBe(true);
  });
});

describe('a screen that has been damaged', () => {
  const SPIN = { result: { tier: 'small', digits: [4, 4, 4], reach: true }, elapsed: 0.5, duration: 2.9, done: false };
  const SUGOROKU = { kind: 'sugoroku', roll: 3, from: 0, elapsed: 0.4, duration: sugorokuDuration(3), payout: -1 };
  const CHEST = { kind: 'chest', prizes: [20, 10, 30], fallback: 2, picked: -1, elapsed: 1, pickedAt: -1, told: false, payout: -1 };
  const PICKED = { ...CHEST, picked: 0, pickedAt: 0.5, told: true, elapsed: 3, payout: 20 };
  const ROULETTE_RUN = { pocket: 1, from: 0, elapsed: 0.2, duration: 2.8, landed: false, level: 0, total: 0, gain: 0, over: false, jackpot: false };
  const ENDED = { ...ROULETTE_RUN, elapsed: 3, landed: true, over: true, pocket: 0, level: 2, total: 30 };

  const withScreen = (screen: Row): Session | null => restore(damaged((save) => (save.screen = screen)), 1);
  const untouched = plain(reread(restore(GOOD, 1) as Session));

  it('keeps what is in order', () => {
    expect(BOARD[3]).toBe(8);
    expect([...CHESTS].sort()).toEqual([...CHEST.prizes].sort());
    expect(withScreen({ spin: SPIN, bonus: null, roulette: null })?.spin).toEqual(SPIN);
    expect(withScreen({ spin: null, bonus: SUGOROKU, roulette: null })?.bonus).toEqual(SUGOROKU);
    expect(withScreen({ spin: null, bonus: { ...SUGOROKU, elapsed: 2.5, payout: BOARD[3] }, roulette: null })?.bonus).not.toBeNull();
    expect(withScreen({ spin: null, bonus: CHEST, roulette: null })?.bonus).toEqual(CHEST);
    expect(withScreen({ spin: null, bonus: PICKED, roulette: null })?.bonus).toEqual(PICKED);
    const run = withScreen({ spin: null, bonus: null, roulette: ROULETTE_RUN });
    expect(run?.roulette).toEqual(ROULETTE_RUN);
    expect(run?.balls).toBe(0);
    expect(run?.roulettes).toBe(3);
    expect(withScreen({ spin: null, bonus: null, roulette: ENDED })?.roulette).toEqual(ENDED);
  });

  const spins: [string, unknown][] = [
    ['a spin that is a number', 5],
    ['a spin that is a list', []],
    ['a spin with no result', { ...SPIN, result: null }],
    ['a spin of a tier the slot does not have', { ...SPIN, result: { ...SPIN.result, tier: 'jackpot' } }],
    ['a reel showing a digit it does not have', { ...SPIN, result: { tier: 'miss', digits: [0, 1, 2], reach: false } }],
    ['a reel showing ten', { ...SPIN, result: { tier: 'miss', digits: [10, 1, 2], reach: false } }],
    ['two reels', { ...SPIN, result: { ...SPIN.result, digits: [4, 4] } }],
    ['four reels', { ...SPIN, result: { ...SPIN.result, digits: [4, 4, 4, 4] } }],
    ['a winning tier without a line', { ...SPIN, result: { tier: 'small', digits: [4, 4, 6], reach: true } }],
    ['a line of another tier', { ...SPIN, result: { tier: 'seven', digits: [3, 3, 3], reach: true } }],
    ['a miss that is a line', { ...SPIN, result: { tier: 'miss', digits: [7, 7, 7], reach: true } }],
    ['a reach that is a number', { ...SPIN, result: { ...SPIN.result, reach: 1 } }],
    ['a spin that takes no time', { ...SPIN, duration: 0 }],
    ['a spin that takes for ever', { ...SPIN, duration: 1e9 }],
    ['a spin that began before it began', { ...SPIN, elapsed: -1 }],
    ['a spin whose clock is not a number', { ...SPIN, elapsed: null }],
    ['a spin that is neither done nor not', { ...SPIN, done: 'yes' }],
    ['a spin with a field too many', { ...SPIN, kind: 'spin' }],
    ['a spin with a field missing', { result: SPIN.result, elapsed: 0.5, duration: 2.9 }],
  ];

  it.each(spins)('leaves off %s and keeps the machine', (_name, spin) => {
    const back = withScreen({ spin, bonus: null, roulette: null });
    expect(back).not.toBeNull();
    expect(plain(back as Session)).toEqual(untouched);
  });

  const bonuses: [string, unknown][] = [
    ['a bonus that is text', 'chest'],
    ['a game the machine does not have', { ...SUGOROKU, kind: 'dice' }],
    ['a die showing nothing', { ...SUGOROKU, roll: 0 }],
    ['a die showing seven', { ...SUGOROKU, roll: 7 }],
    ['a piece setting off from off the board', { ...SUGOROKU, from: BOARD.length }],
    ['a roll that takes no time', { ...SUGOROKU, duration: 0 }],
    ['a square that paid what it does not hold', { ...SUGOROKU, payout: BOARD[3] + 1 }],
    ['a square that paid less than nothing', { ...SUGOROKU, payout: -2 }],
    ['chests holding the same prize twice', { ...CHEST, prizes: [10, 10, 30] }],
    ['two chests', { ...CHEST, prizes: [10, 20] }],
    ['four chests', { ...CHEST, prizes: [10, 20, 30, 30] }],
    ['chests holding prizes of their own', { ...CHEST, prizes: [100, 200, 300] }],
    ['chests that are not a list', { ...CHEST, prizes: null }],
    ['a clock picking a fourth chest', { ...CHEST, fallback: 3 }],
    ['a fourth chest picked', { ...PICKED, picked: 3 }],
    ['a chest paid before one was picked', { ...CHEST, payout: 20 }],
    ['a chest told before one was picked', { ...CHEST, told: true }],
    ['a chest picked at no time', { ...PICKED, pickedAt: -1 }],
    ['a chest picked later than now', { ...PICKED, pickedAt: 4 }],
    ['a chest that paid what another holds', { ...PICKED, payout: 30 }],
    ['a chest clock past a minute', { ...CHEST, elapsed: LIMITS.timer + 1 }],
    ['a chest with a field of the board game', { ...CHEST, roll: 3 }],
  ];

  it.each(bonuses)('leaves off %s and keeps the machine', (_name, bonus) => {
    const back = withScreen({ spin: null, bonus, roulette: null });
    expect(back).not.toBeNull();
    expect(plain(back as Session)).toEqual(untouched);
  });

  const roulettes: [string, unknown][] = [
    ['a roulette that is a number', 5],
    ['a roulette that is true', true],
    ['a pocket past the last', { ...ROULETTE_RUN, pocket: ROULETTE.length }],
    ['a pocket before the first', { ...ROULETTE_RUN, from: -1 }],
    ['a pocket between two', { ...ROULETTE_RUN, pocket: 1.5 }],
    ['a turn that takes no time', { ...ROULETTE_RUN, duration: 0 }],
    ['a turn whose time is not a number', { ...ROULETTE_RUN, duration: Number.NaN }],
    ['a run past its goal', { ...ROULETTE_RUN, level: 7 }],
    ['a run of fewer than no numbers', { ...ROULETTE_RUN, level: -1 }],
    ['a run that has paid less than nothing', { ...ROULETTE_RUN, total: -10 }],
    ['a pocket that paid an absurd amount', { ...ROULETTE_RUN, gain: LIMITS.purse + 1 }],
    ['a run that ended before the light stopped', { ...ROULETTE_RUN, over: true }],
    ['a jackpot in a run that has not ended', { ...ROULETTE_RUN, landed: true, jackpot: true }],
    ['a roulette with a field missing', { pocket: 1, from: 0 }],
    ['a roulette with a field too many', { ...ROULETTE_RUN, bowl: 3 }],
  ];

  it.each(roulettes)('leaves off %s, keeps the machine and gives the ball back', (_name, roulette) => {
    const back = withScreen({ spin: null, bonus: null, roulette });
    expect(back).not.toBeNull();
    expect(plain(back as Session)).toEqual({ ...untouched, balls: 1, roulettes: 2 });
  });

  it('leaves everything off when more than one thing is on, and still gives the ball back', () => {
    expect(plain(withScreen({ spin: SPIN, bonus: CHEST, roulette: null }) as Session)).toEqual(untouched);
    expect(plain(withScreen({ spin: SPIN, bonus: null, roulette: ROULETTE_RUN }) as Session)).toEqual({ ...untouched, balls: 1, roulettes: 2 });
    expect(plain(withScreen({ spin: SPIN, bonus: SUGOROKU, roulette: ENDED }) as Session)).toEqual({ ...untouched, balls: 1, roulettes: 2 });
  });

  it('takes a screen with nothing written on it as an empty one', () => {
    expect(plain(withScreen({}) as Session)).toEqual(untouched);
    expect(plain(withScreen({ spin: null, reels: [1, 2, 3] }) as Session)).toEqual(untouched);
  });

  it('never gives back more balls than a machine holds, nor counts a roulette that was never started', () => {
    const text = damaged((save) => {
      save.session.balls = LIMITS.balls;
      save.session.roulettes = 0;
      save.screen.roulette = 'spinning';
    });
    const back = restore(text, 1);
    expect(back?.balls).toBe(LIMITS.balls);
    expect(back?.roulettes).toBe(0);
    expect(restore(serialize(back as Session), 1)).not.toBeNull();
  });
});

describe('garbage', () => {
  it('is refused without throwing, whatever it is', () => {
    const random = seededRng(2024);
    const pieces = ['{', '}', '[', ']', '"', ':', ',', '-', '.', 'e', '0', '1', '9', ' ', 'null', 'true', 'false', '\\', 'u', '"medals"', '"version"', '"machine"', '\n'];
    for (let i = 0; i < 3000; i++) {
      let text = '';
      const length = Math.floor(random() * 60);
      for (let j = 0; j < length; j++) text += pieces[Math.floor(random() * pieces.length)];
      expect(restore(text, 1)).toBeNull();
    }
  });

  it('is refused when it is well-formed JSON of any shape', () => {
    const random = seededRng(7);
    const names = ['version', 'machine', 'session', 'screen', 'medals', 'falling', 'spin', 'tiers', '__proto__', 'constructor', 'toString', 'length', 'x'];
    const leaves = [null, true, false, 0, 1, -1, 0.5, 1e21, -1e-7, '', 'medal', '1', [], {}, STORAGE_VERSION];
    const any = (depth: number): unknown => {
      const roll = random();
      if (depth === 0 || roll < 0.4) return leaves[Math.floor(random() * leaves.length)];
      if (roll < 0.6) return Array.from({ length: Math.floor(random() * 4) }, () => any(depth - 1));
      const entries: string[] = [];
      const count = Math.floor(random() * 5);
      for (let i = 0; i < count; i++) entries.push(`${JSON.stringify(names[Math.floor(random() * names.length)])}:${JSON.stringify(any(depth - 1))}`);
      return JSON.parse(`{${entries.join(',')}}`);
    };
    for (let i = 0; i < 2000; i++) {
      // The top of every one is an object carrying the right version, so the checks below it are reached.
      const text = JSON.stringify({ version: STORAGE_VERSION, machine: any(4), session: any(4), screen: any(3) });
      expect(restore(text, 1)).toBeNull();
    }
  });

  it('either refuses a good save with one thing changed, or gives a machine that runs', { timeout: LONG }, () => {
    const random = seededRng(99);
    const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
    const junk: unknown[] = [null, true, false, -1, 0, 1, 2, 3, 7, 25, 26, 99, 101, 0.5, -0.5, 0.1, 1e5, 1e15, '', '0', 'chest', [], {}, [1, 2, 3]];
    // A machine in play with a roulette on its screen, a ball's turn having come round, and spins held behind it.
    const start = serialize((() => {
      const session = played(31, 6);
      session.balls = 1;
      for (let i = 0; i < 60 * 30 && !session.roulette; i++) advance(session, DT);
      session.stock = 2;
      return session;
    })());
    expect(JSON.parse(start).screen.roulette).not.toBeNull();

    let refused = 0;
    let ran = 0;
    for (let i = 0; i < 1500; i++) {
      const save = JSON.parse(start);
      // Walk down to somewhere in the save and change what is there, take it out, or add to it.
      let node: Record<string, unknown> | unknown[] = save;
      for (let depth = 0; depth < 4; depth++) {
        const keys = Object.keys(node);
        if (keys.length === 0) break;
        const key = pick(keys);
        const next = (node as Record<string, unknown>)[key];
        if (typeof next === 'object' && next !== null && random() < 0.8) {
          node = next as Record<string, unknown> | unknown[];
          continue;
        }
        const what = random();
        if (what < 0.75) (node as Record<string, unknown>)[key] = pick(junk);
        else if (what < 0.9) delete (node as Record<string, unknown>)[key];
        else (node as Record<string, unknown>)[`${key}2`] = pick(junk);
        break;
      }
      const back = restore(JSON.stringify(save), i);
      if (!back) {
        refused++;
        continue;
      }
      ran++;
      for (let step = 0; step < 40; step++) {
        if (step % 10 === 0) insert(back, 20 + step);
        advance(back, DT);
      }
      expect(everyPosition(back).every(Number.isFinite)).toBe(true);
      expect(Number.isSafeInteger(back.credits)).toBe(true);
      expect(restore(serialize(back), 1)).not.toBeNull();
    }
    // Most changes spoil the save; the ones that do not leave a machine that plays.
    expect(refused).toBeGreaterThan(300);
    expect(ran).toBeGreaterThan(50);
  });
});
