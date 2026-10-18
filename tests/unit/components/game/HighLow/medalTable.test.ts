import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { TOP, payFor, type Card, type Guess } from '@/components/game/HighLow/engine';
import {
  HIGH_LOW_GAME,
  PAY_STEP,
  ROUND_KEY,
  STAKE_STEP,
  createTable,
  inPlay,
  lostOf,
  offerOf,
  overOf,
  parseRound,
  roundId,
  roundKey,
  rungOf,
  serializeRound,
  wonOf,
  type RoundRecord,
} from '@/components/game/HighLow/medalTable';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// The High & Low Ladder plays with the medal center's medals: a game's bet goes out once at START, what TAKE (or the
// top) pays comes in once, a loss returns nothing, and none of it is lost, doubled or undone by a reload, another tab,
// a reset or a browser that dies between two writes. The bank here is the real one (MedalCenter/bank.ts) in a fake
// browser (bankFakes.ts); nothing is fetched and no account is real.

/** A card of a rank (0 for a 2 up to 12 for an ace), in a suit. */
const card = (rank: number, suit = 0): Card => rank * 4 + suit;
const SEVEN = card(5);
const NINE = card(7);
const KING = card(11);
const ANOTHER_SEVEN = card(5, 2);

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const record = (browser: FakeBrowser, owner: string | null = null): RoundRecord | null => parseRound(browser.storage.get(roundKey(owner)) ?? null);
const out = (browser: FakeBrowser, uid: string | null = null): readonly string[] => medalsOutAt(parseLedger(browser.storage.get(ledgerKey(uid)) ?? null)!);

/** A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card. */
function machineOn(page: FakePage) {
  const seat: { current: Seat | null } = { current: null };
  const table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('game') });
  seat.current = page.bank.sit(HIGH_LOW_GAME, { granted: () => undefined, yielding: () => undefined });
  // As PlayTab does: on a reset the machine starts over (its game went with the medals), and says so to the medal center.
  page.bank.listen((event) => {
    if (event.type === 'reset') page.bank.restarted(HIGH_LOW_GAME);
  });
  return { table, seat: seat.current };
}

/** A page killed without a word: no `pagehide`, the card let go by the browser. */
function crash(browser: FakeBrowser, page: FakePage): void {
  page.closed = true;
  page.watchers = null;
  browser.pages = browser.pages.filter((other) => other !== page);
  if (browser.holder === page) browser.holder = null;
  const next = browser.queue.shift();
  if (next) browser.tasks.push(() => browser.give2(next));
}

/** A browser with the machine open on one page, holding the card. */
async function opened() {
  const browser = new FakeBrowser();
  const page = browser.open();
  const machine = machineOn(page);
  await quiet(browser);
  return { browser, page, machine };
}

/** Plays guesses on game `id`, each with the card it turns. */
function play(machine: ReturnType<typeof machineOn>, id: string, turns: [Guess, Card][]) {
  return turns.map(([guess, next]) => machine.table.guess(id, guess, next));
}

/** Twelve right guesses in a row: 2, 3, 4 … A, each HIGH. */
const CLIMB: [Guess, Card][] = Array.from({ length: TOP }, (_, i) => ['high', card(i + 1)]);

describe('a game, once', () => {
  it('takes the bet at START, climbs on right guesses, and TAKE pays the rung lit once, the bet included', async () => {
    const { browser, machine } = await opened();
    const started = machine.table.start(10, SEVEN);
    expect(started.kind).toBe('started');
    const id = started.kind === 'started' ? started.record.id : '';
    expect(stored(browser)).toBe(WELCOME - 10);
    expect(record(browser)).toMatchObject({ id, bet: 10, cards: [SEVEN], guesses: [], taken: false });
    expect(out(browser)).toEqual([HIGH_LOW_GAME]);

    const [first, second] = play(machine, id, [
      ['high', NINE],
      ['high', KING],
    ]);
    expect(first.kind).toBe('right');
    expect(second.kind).toBe('right');
    // Nothing is paid while it climbs: the bet is out, and the ladder shows 2 rungs.
    expect(stored(browser)).toBe(WELCOME - 10);
    const now = record(browser)!;
    expect(rungOf(now)).toBe(2);
    expect(offerOf(now)).toBe(payFor(10, 2));
    expect(payFor(10, 2)).toBe(16);

    const taken = machine.table.take(id);
    expect(taken).toMatchObject({ kind: 'taken', won: 16 });
    expect(stored(browser)).toBe(WELCOME - 10 + 16);
    expect(record(browser)).toMatchObject({ taken: true });
    expect(out(browser)).toEqual([]);
    // Taken once: TAKE again, or a guess on it, does nothing.
    expect(machine.table.take(id).kind).toBe('gone');
    expect(machine.table.guess(id, 'low', SEVEN).kind).toBe('gone');
    expect(stored(browser)).toBe(WELCOME - 10 + 16);
  });

  it('loses the bet on a wrong guess, and on a tie, with its medals out no more', async () => {
    for (const [guess, next] of [
      ['low', KING],
      ['high', ANOTHER_SEVEN],
      ['low', ANOTHER_SEVEN],
    ] as [Guess, Card][]) {
      const { browser, machine } = await opened();
      const started = machine.table.start(5, SEVEN);
      const id = started.kind === 'started' ? started.record.id : '';
      const lost = machine.table.guess(id, guess, next);
      expect(lost.kind).toBe('lost');
      expect(stored(browser)).toBe(WELCOME - 5);
      expect(out(browser)).toEqual([]);
      const kept = record(browser)!;
      expect(lostOf(kept)).toBe(true);
      expect(overOf(kept)).toBe(true);
      expect(wonOf(kept)).toBe(0);
      // A lost game cannot be taken or played on.
      expect(machine.table.take(id).kind).toBe('gone');
      expect(machine.table.guess(id, 'high', KING).kind).toBe('gone');
    }
  });

  it('pays the top at once on the twelfth right guess, once', async () => {
    const { browser, machine } = await opened();
    const started = machine.table.start(50, card(0));
    const id = started.kind === 'started' ? started.record.id : '';
    const turns = play(machine, id, CLIMB);
    expect(turns.slice(0, TOP - 1).every((turn) => turn.kind === 'right')).toBe(true);
    expect(turns[TOP - 1]).toMatchObject({ kind: 'top', won: 2_000 });
    expect(stored(browser)).toBe(WELCOME - 50 + 2_000);
    expect(record(browser)).toMatchObject({ taken: true });
    expect(machine.table.take(id).kind).toBe('gone');
    expect(stored(browser)).toBe(WELCOME - 50 + 2_000);
    expect(out(browser)).toEqual([]);
  });

  it('takes nothing it should not: a bet it does not take, more medals than there are, TAKE before a right guess', async () => {
    const { browser, page, machine } = await opened();
    expect(machine.table.start(7, SEVEN).kind).toBe('short');
    expect(machine.table.start(5, 52).kind).toBe('short');
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(ROUND_KEY)).toBe(false);
    const started = machine.table.start(5, SEVEN);
    const id = started.kind === 'started' ? started.record.id : '';
    expect(machine.table.take(id).kind).toBe('gone');
    // A second START while a game is played goes back to that game: nothing more is bet.
    expect(machine.table.start(5, KING)).toMatchObject({ kind: 'inPlay', record: { id } });
    expect(stored(browser)).toBe(WELCOME - 5);
    machine.table.guess(id, 'low', KING);
    // Not that many medals left.
    expect(page.bank.getState().balance).toBe(WELCOME - 5);
    expect(machine.table.start(50, SEVEN).kind).toBe('started');
    expect(machine.table.read()).toMatchObject({ bet: 50 });
    const second = machine.table.read()!;
    machine.table.guess(second.id, 'low', KING);
    expect(machine.table.start(50, SEVEN).kind).toBe('short');
    expect(stored(browser)).toBe(WELCOME - 55);
  });

  it('plays nothing on a page that does not hold the card', async () => {
    const { browser, machine } = await opened();
    machineOn(browser.open());
    await quiet(browser);
    expect(machine.table.start(5, SEVEN).kind).toBe('away');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('names a game so that no two share a name, within what a round’s name may be', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => roundId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,24}$/);
  });
});

describe('a ladder begun stays begun', () => {
  it('finds the same card and the same rung after a reload, and goes on from there', async () => {
    const { browser, page, machine } = await opened();
    const started = machine.table.start(5, SEVEN);
    const id = started.kind === 'started' ? started.record.id : '';
    play(machine, id, [['high', NINE]]);
    page.hide('left');
    page.close();

    const reloaded = machineOn(browser.open());
    await quiet(browser);
    const found = reloaded.table.read()!;
    expect(found).toMatchObject({ id, cards: [SEVEN, NINE], guesses: ['high'] });
    expect(inPlay(found)).toBe(true);
    expect(rungOf(found)).toBe(1);
    expect(out(browser)).toEqual([HIGH_LOW_GAME]);
    expect(reloaded.table.guess(id, 'high', KING).kind).toBe('right');
    expect(reloaded.table.take(id)).toMatchObject({ kind: 'taken', won: payFor(5, 2) });
    expect(stored(browser)).toBe(WELCOME - 5 + 8);
  });

  it('finds a loss lost after a reload: the card that lost was written down before it was shown', async () => {
    const { browser, page, machine } = await opened();
    const started = machine.table.start(5, SEVEN);
    const id = started.kind === 'started' ? started.record.id : '';
    machine.table.guess(id, 'high', card(2));
    crash(browser, page);
    const reloaded = machineOn(browser.open());
    await quiet(browser);
    const found = reloaded.table.read()!;
    expect(lostOf(found)).toBe(true);
    expect(reloaded.table.guess(id, 'low', card(2)).kind).toBe('gone');
    expect(reloaded.table.take(id).kind).toBe('gone');
    expect(stored(browser)).toBe(WELCOME - 5);
    // The next game is a new one, its own bet.
    expect(reloaded.table.start(5, SEVEN).kind).toBe('started');
    expect(stored(browser)).toBe(WELCOME - 10);
  });

  it('is played on in another tab, and the first tab cannot take a loss back there', async () => {
    const { browser, page: first, machine: one } = await opened();
    const started = one.table.start(10, SEVEN);
    const id = started.kind === 'started' ? started.record.id : '';
    one.table.guess(id, 'high', KING);
    const second = browser.open();
    const two = machineOn(second);
    await quiet(browser);
    expect(first.bank.getState().card).toBe('away');
    // The first tab is paused: it plays nothing while the other holds the medals.
    expect(one.table.guess(id, 'low', SEVEN).kind).toBe('away');
    expect(two.table.read()).toMatchObject({ id, cards: [SEVEN, KING] });
    expect(two.table.guess(id, 'high', card(12, 3)).kind).toBe('right');
    expect(two.table.guess(id, 'high', card(3)).kind).toBe('lost');
    one.seat.play();
    await quiet(browser);
    expect(one.seat.holding()).toBe(true);
    // Back in the first tab: the game is lost, as the other tab left it.
    expect(one.table.guess(id, 'low', SEVEN).kind).toBe('gone');
    expect(one.table.take(id).kind).toBe('gone');
    expect(lostOf(one.table.read()!)).toBe(true);
    expect(stored(browser)).toBe(WELCOME - 10);
  });
});

describe('a browser that dies between two writes', () => {
  // The game's record and the medals are separate writes: the browser is killed at every moment between them and
  // started again, and the machine squares what it left with the medals' receipts. A game whose bet never went in
  // never began; one taken is paid exactly once; a loss stays lost; a game still climbing goes on.
  const machines = new Map<FakeBrowser, ReturnType<typeof machineOn>>();
  const setUp = async () => {
    const { browser, machine } = await opened();
    machines.set(browser, machine);
    return browser;
  };
  const reopened = async (after: FakeBrowser) => {
    const machine = machineOn(after.open());
    await quiet(after);
    return machine;
  };

  for (const [what, turns, take, won] of [
    ['a game climbed two rungs and taken', [['high', NINE], ['high', KING]] as [Guess, Card][], true, 16],
    ['a game lost on its second guess', [['high', NINE], ['low', KING]] as [Guess, Card][], false, 0],
    ['a game climbed to the top', CLIMB, false, 2_000],
  ] as const) {
    it(`settles ${what} exactly once, or finds it never began, wherever the browser dies`, async () => {
      const first = what.includes('top') ? card(0) : SEVEN;
      const bet = what.includes('top') ? 50 : 10;
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const { table } = machines.get(browser)!;
          const started = table.start(bet, first);
          const id = started.kind === 'started' ? started.record.id : '';
          for (const [guess, next] of turns) table.guess(id, guess, next);
          if (take) table.take(id);
        },
        async (after, reached) => {
          const machine = await reopened(after);
          const found = machine.table.read();
          const balance = stored(after)!;
          const at = `died after ${reached} writes`;
          if (found === null) {
            // It never began: no bet went in, nothing came out.
            expect(balance, at).toBe(WELCOME);
            expect(out(after), at).toEqual([]);
          } else if (inPlay(found)) {
            // Still climbing: the bet is out, nothing paid; it goes on, and is taken once.
            expect(balance, at).toBe(WELCOME - bet);
            expect(out(after), at).toEqual([HIGH_LOW_GAME]);
            if (rungOf(found) > 0) {
              const taken = machine.table.take(found.id);
              expect(taken.kind, at).toBe('taken');
              expect(stored(after), at).toBe(WELCOME - bet + payFor(bet, rungOf(found)));
            }
          } else {
            // Over: paid what it won, once, and nothing is out.
            expect(balance, at).toBe(WELCOME - bet + wonOf(found));
            expect(wonOf(found), at).toBe(won);
            expect(out(after), at).toEqual([]);
          }
          // The next game takes and pays as ever, and the games before it let go of their receipts.
          const next = machine.table.read();
          if (next && inPlay(next)) machine.table.guess(next.id, 'high', card(0));
          const started = machine.table.start(5, SEVEN);
          expect(started.kind, at).toBe('started');
          const id = started.kind === 'started' ? started.record.id : '';
          machine.table.guess(id, 'high', KING);
          machine.table.take(id);
          const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
          expect([...receiptsOf(ledger, ledger.device).ids].sort(), at).toEqual([`${HIGH_LOW_GAME}:${id}:${PAY_STEP}`, `${HIGH_LOW_GAME}:${id}:${STAKE_STEP}`].sort());
        },
      );
      expect(writes).toBeGreaterThanOrEqual(take || won > 0 ? 3 : 2);
    });
  }

  it('finds a game taken whose record never said so: its pay went in, so it is over and paid no more', async () => {
    const { browser, page, machine } = await opened();
    const started = machine.table.start(10, SEVEN);
    const id = started.kind === 'started' ? started.record.id : '';
    machine.table.guess(id, 'high', KING);
    const climbing = browser.storage.get(ROUND_KEY)!;
    machine.table.take(id);
    // The browser put the record back as it was before the take (it died before the record's write reached the disk).
    browser.storage.set(ROUND_KEY, climbing);
    crash(browser, page);
    const reloaded = machineOn(browser.open());
    await quiet(browser);
    const found = reloaded.table.read()!;
    expect(found.taken).toBe(true);
    expect(overOf(found)).toBe(true);
    expect(reloaded.table.take(id).kind).toBe('gone');
    expect(stored(browser)).toBe(WELCOME - 10 + 12);
    expect(out(browser)).toEqual([]);
  });
});

describe('the medal center’s reset', () => {
  it('throws a game in play away with the medals it was bet from: nothing of it is paid into the new ones', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const started = machine.table.start(10, SEVEN);
    const id = started.kind === 'started' ? started.record.id : '';
    machine.table.guess(id, 'high', KING);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(machine.table.read()).toBeNull();
    expect(machine.table.take(id).kind).toBe('gone');
    expect(stored(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(HIGH_LOW_GAME)).toBe(false);
  });
});

describe('signing in', () => {
  const UID = 'test-player-1';
  const GUEST_PLAYER: Player = { uid: null, settled: true, expected: false };

  it('brings a guest’s game in play along when the first sign-in moves the medals into the account, and plays it there', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    const started = before.table.start(10, SEVEN);
    const id = started.kind === 'started' ? started.record.id : '';
    before.table.guess(id, 'high', KING);
    crash(browser, killed);

    const next = browser.open();
    const after = machineOn(next);
    await quiet(browser);
    next.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME - 10 });
    expect(after.table.read()).toMatchObject({ id, cards: [SEVEN, KING] });
    expect(after.table.take(id)).toMatchObject({ kind: 'taken', won: 12 });
    expect(record(browser, UID)).toMatchObject({ id, taken: true });
    expect(browser.storage.has(ROUND_KEY)).toBe(false);
    expect(stored(browser, UID)).toBe(WELCOME - 10 + 12);

    next.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(after.table.read()).toBeNull();
  });

  it('never plays a guest’s game with an account that has medals of its own', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(createLedger('laptop0001', 500)), 'm-elsewhere');
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const started = machine.table.start(5, SEVEN);
    const id = started.kind === 'started' ? started.record.id : '';
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    expect(machine.table.read()).toBeNull();
    expect(machine.table.guess(id, 'high', KING).kind).toBe('gone');
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(machine.table.read()).toMatchObject({ id, owner: null });
    expect(stored(browser, UID)).toBe(500);
  });
});

describe('when storage will not keep the game', () => {
  it('turns no card when storage can be read but will neither keep the card nor let go of the game: the guess waits', async () => {
    const { browser, page, machine } = await opened();
    const started = machine.table.start(5, SEVEN);
    const id = started.kind === 'started' ? started.record.id : '';
    const { write, remove } = page.env;
    page.env.write = (key, text) => {
      if (key === ROUND_KEY) throw new Error('quota');
      write(key, text);
    };
    page.env.remove = (key) => {
      if (key === ROUND_KEY) throw new Error('quota');
      remove(key);
    };
    expect(machine.table.guess(id, 'low', KING).kind).toBe('unsaved');
    expect(record(browser)).toMatchObject({ cards: [SEVEN], guesses: [] });
    expect(stored(browser)).toBe(WELCOME - 5);
    page.env.write = write;
    page.env.remove = remove;
    expect(machine.table.guess(id, 'high', KING).kind).toBe('right');
  });

  it('plays from memory where storage is blocked: the bet taken and the take paid once', async () => {
    const { browser, page, machine } = await opened();
    browser.blocked = true;
    const started = machine.table.start(10, SEVEN);
    expect(started.kind).toBe('started');
    const id = started.kind === 'started' ? started.record.id : '';
    expect(page.bank.getState().balance).toBe(WELCOME - 10);
    expect(machine.table.guess(id, 'high', KING).kind).toBe('right');
    expect(machine.table.take(id)).toMatchObject({ kind: 'taken', won: 12 });
    expect(page.bank.getState().balance).toBe(WELCOME - 10 + 12);
    expect(machine.table.take(id).kind).toBe('gone');
  });
});

describe('reading a game back', () => {
  it('reads back only a game it could have written', () => {
    const good: RoundRecord = { v: 1, id: 'game1', owner: null, ledger: 'device00001', era: 0, bet: 10, cards: [SEVEN, KING], guesses: ['high'], taken: false };
    expect(parseRound(serializeRound(good))).toEqual(good);
    expect(parseRound(serializeRound({ ...good, taken: true }))).toMatchObject({ taken: true });
    const lost: RoundRecord = { ...good, cards: [SEVEN, KING, NINE], guesses: ['high', 'high'] };
    expect(parseRound(serializeRound(lost))).toEqual(lost);
    const bad: unknown[] = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, bet: 7 }),
      JSON.stringify({ ...good, cards: [SEVEN, 52] }),
      JSON.stringify({ ...good, cards: [] }),
      JSON.stringify({ ...good, guesses: [] }),
      JSON.stringify({ ...good, guesses: ['up'] }),
      // A guess after a wrong one.
      JSON.stringify({ ...good, cards: [SEVEN, card(2), KING], guesses: ['high', 'high'] }),
      // Taken before any right guess, or after a loss.
      JSON.stringify({ ...good, cards: [SEVEN], guesses: [], taken: true }),
      JSON.stringify({ ...lost, taken: true }),
      // More guesses than the ladder has rungs.
      JSON.stringify({ ...good, cards: Array.from({ length: TOP + 2 }, (_, i) => card(Math.min(i, 12))), guesses: new Array(TOP + 1).fill('high') }),
      JSON.stringify({ ...good, owner: 5 }),
      JSON.stringify({ ...good, id: '' }),
      JSON.stringify({ ...good, id: 'Not An Id!' }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
      'x'.repeat(5_000),
    ];
    for (const text of bad) expect(parseRound(text), String(text).slice(0, 80)).toBeNull();
  });

  it('clears anything at the game’s place that is not a game', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(ROUND_KEY, '{"v":0,"cards":[1,2,3]}');
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.table.read()).toBeNull();
    expect(browser.storage.has(ROUND_KEY)).toBe(false);
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'engine.ts', 'Cards.tsx']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/HighLow', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
