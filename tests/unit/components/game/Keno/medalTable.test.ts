import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { LAST_BALL_TIMES, PAYS, winOf } from '@/components/game/Keno/engine';
import { GAME_KEY, KENO_GAME, createTable, gameId, gameKey, parseGame, parseTicket, serializeGame, type GameRecord, type Staked } from '@/components/game/Keno/medalTable';
import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// Video Keno plays with the medal center's medals: a game's bet is taken once, what it wins comes back once, and none
// of it is lost or doubled by a reload, another tab, a reset or a browser that dies between two writes. A game left
// unfinished is shown again by the next page that holds the card, with the same twenty balls, and paid then. The bank
// here is the real one (MedalCenter/bank.ts) in a fake browser (bankFakes.ts); nothing is fetched and no account is
// real.

/** Twenty balls: 1 to 19 first, and 80 last. */
const BALLS = [...Array.from({ length: 19 }, (_, i) => i + 1), 80];
/** Four spots, three caught, the last ball not one of them: 4 a medal. */
const THREE_OF_FOUR = [1, 2, 3, 50];
/** The same with the last ball one of them: 4 × 5 = 20 a medal. */
const LAST_BALL = [1, 2, 80, 50];
/** Five spots, none caught: nothing. */
const NONE = [41, 42, 43, 44, 45];
/** Five spots, all caught on the last ball: 250 × 5 a medal. */
const ALL_FIVE = [1, 2, 3, 4, 80];

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const record = (browser: FakeBrowser, owner: string | null = null): GameRecord | null => parseGame(browser.storage.get(gameKey(owner)) ?? null);
const out = (browser: FakeBrowser) => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);

/** A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card, and a game under way is settled as the card goes. */
function machineOn(page: FakePage) {
  let running: Staked | null = null;
  const yielded: string[] = [];
  const seat: { current: Seat | null } = { current: null };
  const table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('game') });
  seat.current = page.bank.sit(KENO_GAME, {
    granted: () => undefined,
    yielding: (why) => {
      yielded.push(why);
      if (running && !running.paid && !running.void) table.settle(running);
    },
  });
  page.bank.listen((event) => {
    if (event.type !== 'reset') return;
    if (running) running.void = true;
    table.clear();
    page.bank.restarted(KENO_GAME);
  });
  return {
    table,
    seat: seat.current,
    yielded,
    /** DRAW: the balls are drawn (here: given) and the bet taken. */
    draw(spots: readonly number[] = THREE_OF_FOUR, bet = 1, balls: readonly number[] = BALLS): Staked | null {
      const outcome = table.stake(spots, bet, balls);
      running = outcome.kind === 'staked' ? outcome.staked : null;
      return running;
    },
    /** The last ball comes out on this page (or Skip is pressed). */
    end() {
      const ran = running;
      running = null;
      return ran ? table.settle(ran) : null;
    },
    running: () => running,
  };
}

/** A page that is killed without a word: no `pagehide`, the card let go by the browser. */
function crash(browser: FakeBrowser, page: FakePage): void {
  page.closed = true;
  page.watchers = null;
  browser.pages = browser.pages.filter((other) => other !== page);
  if (browser.holder === page) browser.holder = null;
  const next = browser.queue.shift();
  if (next) browser.tasks.push(() => browser.give2(next));
}

const finishLeft = (machine: ReturnType<typeof machineOn>) => {
  const left = machine.table.leftover();
  return left ? { left, settled: machine.table.settle({ record: left, stored: true, paid: false, void: false }) } : null;
};

describe('a game, once', () => {
  it('names a game so that no two share a name, within the length a record allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => gameId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,24}$/);
  });

  it('takes the bet once at DRAW, keeps the balls drawn, and pays once as the last ball comes out', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);
    const staked = machine.draw(THREE_OF_FOUR, 5);
    expect(staked?.record).toMatchObject({ owner: null, era: 0, spots: THREE_OF_FOUR.slice().sort((a, b) => a - b), bet: 5, balls: BALLS, won: 20, paid: false });
    expect(stored(browser)).toBe(WELCOME - 5);
    expect(out(browser)).toEqual([KENO_GAME]);
    expect(record(browser)?.balls).toEqual(BALLS);
    expect(machine.end()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 5 + 20);
    expect(record(browser)).toMatchObject({ paid: true, won: 20 });
    expect(out(browser)).toEqual([]);
    expect(machine.table.settle(staked!)).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 5 + 20);
    // The next game pays the last ball's ×5, and lets go of the last one's receipts.
    machine.draw(LAST_BALL, 2);
    expect(machine.end()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 5 + 20 - 2 + 4 * LAST_BALL_TIMES * 2);
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    expect(receiptsOf(ledger, ledger.device).ids.every((id) => id.startsWith(`${KENO_GAME}:${record(browser)!.id}:`))).toBe(true);
  });

  it('pays nothing for a catch that pays nothing, and lets the medals out no longer', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.draw(NONE, 10);
    expect(out(browser)).toEqual([KENO_GAME]);
    expect(machine.end()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 10);
    expect(out(browser)).toEqual([]);
    expect(record(browser)).toMatchObject({ won: 0, paid: true });
  });

  it('takes nothing it should not: a ticket, a bet or a draw it does not take, medals the player does not have, a page without the card', async () => {
    const browser = new FakeBrowser();
    const one = machineOn(browser.open());
    await quiet(browser);
    expect(one.table.stake([], 1, BALLS).kind).toBe('short');
    expect(one.table.stake([1, 1], 1, BALLS).kind).toBe('short');
    expect(one.table.stake(Array.from({ length: 11 }, (_, i) => i + 1), 1, BALLS).kind).toBe('short');
    expect(one.table.stake([81], 1, BALLS).kind).toBe('short');
    expect(one.table.stake([1], 4, BALLS).kind).toBe('short');
    expect(one.table.stake([1], 1, BALLS.slice(1)).kind).toBe('short');
    expect(one.table.stake([1], 1, [...BALLS.slice(1), 2]).kind).toBe('short');
    expect(stored(browser)).toBe(WELCOME);
    expect(one.draw([1], 10)).not.toBeNull();
    expect(stored(browser)).toBe(WELCOME - 10);
    one.end();
    machineOn(browser.open());
    await quiet(browser);
    expect(one.table.stake([1], 1, BALLS).kind).toBe('away');
  });

  it('plays no second game while one of these medals is unfinished: it is finished first', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    first.draw();
    crash(browser, killed);
    const next = machineOn(browser.open());
    await quiet(browser);
    expect(next.table.stake(THREE_OF_FOUR, 1, BALLS).kind).toBe('unfinished');
    expect(finishLeft(next)?.settled).toBe('paid');
    expect(next.table.stake(THREE_OF_FOUR, 1, BALLS).kind).toBe('staked');
  });
});

describe('the re-entrancy of the bank', () => {
  it('never takes the game being staked for one left unfinished: the bank tells its listeners inside DRAW', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    // A game before it, so that DRAW lets go of its receipts too.
    machine.draw();
    machine.end();
    const found: (string | null)[] = [];
    const lasts: (string | null)[] = [];
    let inside = false;
    page.bank.subscribe(() => {
      if (!inside) return;
      found.push(machine.table.leftover()?.id ?? null);
      lasts.push(machine.table.last()?.id ?? null);
    });
    inside = true;
    const staked = machine.draw(LAST_BALL, 3);
    inside = false;
    // The bank told its listeners as the bet went in and as the last game's receipts were let go of: none found a game
    // to finish, and none took the game being drawn for a game already over.
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((id) => id === null)).toBe(true);
    expect(lasts.every((id) => id !== staked?.record.id)).toBe(true);
    // And the medals are still out on the game: a look from inside the press settled nothing.
    expect(out(browser)).toEqual([KENO_GAME]);
    expect(machine.end()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 1 + 4 - 3 + 4 * LAST_BALL_TIMES * 3);
  });
});

describe('a reload, another tab, a page killed mid-draw', () => {
  it('settles a game as the page is left, so the reloaded page shows the same draw, paid once', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const machine = machineOn(before);
    await quiet(browser);
    const staked = machine.draw(ALL_FIVE, 2);
    before.hide('left');
    before.close();
    expect(machine.yielded).toEqual(['left']);
    const won = PAYS[5][5] * LAST_BALL_TIMES * 2;
    expect(stored(browser)).toBe(WELCOME - 2 + won);
    const reloaded = machineOn(browser.open());
    await quiet(browser);
    expect(reloaded.table.leftover()).toBeNull();
    // The same game, its twenty balls as they were drawn, to show again.
    expect(reloaded.table.last()).toMatchObject({ id: staked?.record.id, balls: BALLS, spots: ALL_FIVE, won, paid: true });
    expect(machine.end()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 2 + won);
  });

  it('finds the same game after a page killed mid-draw, shows the same balls, and pays it once', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const first = machineOn(killed);
    await quiet(browser);
    const staked = first.draw(LAST_BALL, 10);
    crash(browser, killed);
    expect(stored(browser)).toBe(WELCOME - 10);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ id: staked?.record.id, balls: BALLS, spots: [1, 2, 50, 80], paid: false });
    expect(out(browser)).toEqual([KENO_GAME]);
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 10 + 200);
    expect(out(browser)).toEqual([]);
    // A page that finds it again finds it paid.
    expect(reopened.table.leftover()).toBeNull();
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('already');
    expect(stored(browser)).toBe(WELCOME - 10 + 200);
  });

  it('settles the game as another tab takes the medals; that tab finds nothing left to finish', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machineOn(first);
    await quiet(browser);
    one.draw(THREE_OF_FOUR, 3);
    const two = machineOn(browser.open());
    await quiet(browser);
    expect(one.yielded).toEqual(['moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(stored(browser)).toBe(WELCOME - 3 + 12);
    expect(two.table.leftover()).toBeNull();
    expect(one.end()).toBe('already');
    expect(two.draw()).not.toBeNull();
  });
});

describe('the medal center’s reset', () => {
  it('voids a game under way: nothing of before is paid after', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.draw(ALL_FIVE, 10);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(KENO_GAME)).toBe(false);
    expect(browser.storage.has(GAME_KEY)).toBe(false);
    expect(machine.end()).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('throws away a game left unfinished before a reset', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    before.draw(ALL_FIVE, 10);
    crash(browser, killed);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.table.leftover()).toBeNull();
    expect(browser.storage.has(GAME_KEY)).toBe(false);
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-1';
  const GUEST_PLAYER: Player = { uid: null, settled: true, expected: false };

  it('brings a guest’s unfinished game along when the first sign-in moves the medals into the account, and pays it there once', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    const staked = before.draw(LAST_BALL, 1)!;
    crash(browser, killed);
    const next = browser.open();
    const after = machineOn(next);
    await quiet(browser);
    next.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - 1 });
    const left = after.table.leftover();
    expect(left).toMatchObject({ owner: UID, id: staked.record.id, balls: BALLS, paid: false });
    expect(record(browser, UID)?.id).toBe(staked.record.id);
    expect(browser.storage.has(GAME_KEY)).toBe(false);
    expect(after.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser, UID)).toBe(WELCOME - 1 + 20);
    next.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(after.table.leftover()).toBeNull();
  });

  it('never moves a guest’s game onto an account that has medals of its own: it waits for the guest', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(createLedger('laptop0001', 500)), 'm-elsewhere');
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.draw(THREE_OF_FOUR, 1);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    expect(machine.end()).toBe('later');
    expect(machine.table.leftover()).toBeNull();
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(finishLeft(machine)?.settled).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - 1 + 4);
    expect(stored(browser, UID)).toBe(500);
  });
});

describe('when storage will not keep things', () => {
  it('plays no game it cannot write down, where storage can be read: nothing is taken', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === GAME_KEY) throw new Error('quota');
      write(key, text);
    };
    expect(machine.table.stake(THREE_OF_FOUR, 1, BALLS).kind).toBe('unsaved');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('plays from memory where storage is blocked: the bet taken and the win given once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    browser.blocked = true;
    const staked = machine.draw(LAST_BALL, 2);
    expect(staked?.stored).toBe(false);
    expect(page.bank.getState().balance).toBe(WELCOME - 2);
    expect(machine.end()).toBe('paid');
    expect(page.bank.getState().balance).toBe(WELCOME - 2 + 40);
    expect(machine.table.settle(staked!)).toBe('already');
  });
});

describe('reading a game back', () => {
  it('reads back only a game it could have written: every field checked, what it won worked out again', () => {
    const good: GameRecord = { v: 1, id: 'game1', owner: null, ledger: 'device00001', era: 0, spots: [1, 2, 3, 50], bet: 2, balls: BALLS, won: winOf([1, 2, 3, 50], BALLS, 2), paid: false };
    expect(good.won).toBe(8);
    expect(parseGame(serializeGame(good))).toEqual(good);
    expect(parseGame(serializeGame({ ...good, paid: true }))).toEqual({ ...good, paid: true });
    const bad: unknown[] = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, id: '' }),
      JSON.stringify({ ...good, owner: 5 }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
      JSON.stringify({ ...good, spots: [2, 1] }),
      JSON.stringify({ ...good, spots: [] }),
      JSON.stringify({ ...good, bet: 4 }),
      JSON.stringify({ ...good, balls: BALLS.slice(1) }),
      JSON.stringify({ ...good, balls: [...BALLS.slice(1), 2] }),
      // What it won does not follow from its spots, bet and balls.
      JSON.stringify({ ...good, won: 9 }),
      JSON.stringify({ ...good, paid: 'yes' }),
      'x'.repeat(3_000),
    ];
    for (const text of bad) expect(parseGame(text)).toBeNull();
  });

  it('clears anything at the game’s place that is not a game', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(GAME_KEY, '{"v":0,"balls":99}');
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.table.leftover()).toBeNull();
    expect(browser.storage.has(GAME_KEY)).toBe(false);
  });

  it('reads back the ticket kept between visits: none, or 1 to 10 spots, and a bet it takes', () => {
    expect(parseTicket(JSON.stringify({ spots: [3, 17, 80], bet: 5 }))).toEqual({ spots: [3, 17, 80], bet: 5 });
    expect(parseTicket(JSON.stringify({ spots: [], bet: 1 }))).toEqual({ spots: [], bet: 1 });
    for (const text of [null, 'x', JSON.stringify({ spots: [17, 3], bet: 5 }), JSON.stringify({ spots: [3], bet: 4 }), JSON.stringify({ spots: Array.from({ length: 11 }, (_, i) => i + 1), bet: 1 })]) expect(parseTicket(text)).toBeNull();
  });
});

describe('a browser that dies between two writes', () => {
  // The game's record and the medals are separate writes: the browser is killed at every moment between them and
  // started again, and the machine finishes whatever it left. Every game is paid exactly once, or, if its bet never
  // went in, never happened at all. A reload mid-draw shows the same balls and pays once.
  const machines = new Map<FakeBrowser, ReturnType<typeof machineOn>>();
  /** A browser with one game already played (three of four, 4 medals). */
  const setUp = async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.draw(THREE_OF_FOUR, 1);
    machine.end();
    machines.set(browser, machine);
    return browser;
  };
  const AFTER_SET_UP = WELCOME - 1 + 4;
  const reopened = async (after: FakeBrowser) => {
    const machine = machineOn(after.open());
    await quiet(after);
    const finished = finishLeft(machine);
    return { machine, finished };
  };
  const spentIn = (browser: FakeBrowser): number => {
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    return ledger.rows[ledger.device]?.spent ?? 0;
  };

  for (const [what, spots, bet, won] of [
    ['five of five on the last ball', ALL_FIVE, 10, PAYS[5][5] * LAST_BALL_TIMES * 10],
    ['three of four, the last ball not theirs', THREE_OF_FOUR, 3, 12],
    ['a game that catches nothing that pays', NONE, 5, 0],
  ] as const) {
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies from DRAW to the last ball`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const machine = machines.get(browser)!;
          machine.draw(spots, bet);
          machine.end();
        },
        async (after, reached) => {
          const staked = spentIn(after) === 1 + bet;
          const { machine, finished } = await reopened(after);
          expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - bet + won : AFTER_SET_UP);
          expect(machine.table.leftover(), `died after ${reached} writes`).toBeNull();
          // A game found unfinished is the one drawn: the same balls.
          if (finished) expect(finished.left.balls).toEqual(BALLS);
          // The next game takes and pays as ever, and the games before it let go of their receipts.
          const next = machine.draw(LAST_BALL, 1);
          expect(machine.end(), `died after ${reached} writes`).toBe('paid');
          const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
          const id = next!.record.id;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${KENO_GAME}:${id}:pay`, `${KENO_GAME}:${id}:stake`]);
          expect(medalsOutAt(ledger)).toEqual([]);
        },
      );
      // The game's record, its bet, the record marked paid, and its win (when it won).
      expect(writes).toBeGreaterThanOrEqual(2 + (won > 0 ? 2 : 1));
    });
  }

  it('pays a game exactly once wherever the browser dies while a reload mid-draw settles it, and the reload shows the same balls', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        const machine = machines.get(browser)!;
        machine.draw(ALL_FIVE, 2);
        browser.pages[0].hide('left');
      },
      async (after, reached) => {
        const staked = spentIn(after) === 1 + 2;
        const { machine } = await reopened(after);
        expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - 2 + PAYS[5][5] * LAST_BALL_TIMES * 2 : AFTER_SET_UP);
        // The reloaded page shows the game it drew, paid; where the bet never went in, the game never happened, and the
        // page shows the one before it if its record is still there, or none.
        const shown = machine.table.last();
        if (staked) expect(shown, `died after ${reached} writes`).toMatchObject({ spots: ALL_FIVE, balls: BALLS, paid: true });
        else expect(shown === null || shown.spots.join() === '1,2,3,50', `died after ${reached} writes`).toBe(true);
      },
    );
  });

  it('is marked paid before its win goes in, so a page that looks for a game to finish as the medals move never finds it', async () => {
    const browser = await setUp();
    const machine = machines.get(browser)!;
    const found: string[] = [];
    let finishing = false;
    browser.pages[0].bank.subscribe(() => {
      const left = finishing ? machine.table.leftover() : null;
      if (left) found.push(left.id);
    });
    machine.draw(LAST_BALL, 5);
    finishing = true;
    expect(machine.end()).toBe('paid');
    expect(found).toEqual([]);
    expect(stored(browser)).toBe(AFTER_SET_UP - 5 + 100);
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'engine.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/Keno', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
