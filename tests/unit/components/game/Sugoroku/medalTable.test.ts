import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BANK_KEY, ledgerKey, type Seat } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, serializeLedger } from '@/components/game/MedalCenter/ledger';
import type { Player } from '@/components/game/MedalPusher/account';
import { JP_LAMPS, STAR, START, medalsFor, playOf, type Draw } from '@/components/game/Sugoroku/engine';
import {
  BOARD_KEY,
  SUGOROKU_GAME,
  boardKey,
  createTable,
  parseBoard,
  rollId,
  serializeBoard,
  standingOf,
  type BoardRecord,
  type Staked,
} from '@/components/game/Sugoroku/medalTable';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// Whale Isle Sugoroku plays with the medal center's medals and keeps its board: a roll's bet is taken once, what it
// wins comes back once, the boat stays where the roll left it, and none of it is lost or doubled by a reload, another
// tab, a reset or a browser that dies between two writes. The bank here is the real one (MedalCenter/bank.ts) in a fake
// browser (bankFakes.ts); nothing is fetched and no account is real.

const STAR_LAMP = JP_LAMPS.indexOf(STAR);
const roll = (face: number, extra: Partial<Draw> = {}): Draw => ({ roll: face, ride: [1, 1, 1], lamp: 0, final: 1, ...extra });
/** From START: a 2 to the pearl, 2 per 2 medals; a 3 to the palm, nothing; a 6 to the LAMP CHANCE, its first lamp 20 per 2 medals. */
const PEARL = roll(2);
const PALM = roll(3);
const LAMP = roll(6, { lamp: 0 });
/** From the lamp chance (6): a 6 to the whale, up its back on 4 and 6 (2 and 2), the blowhole, the star and a 6: 204 per 2 medals. */
const JACKPOT = roll(6, { ride: [4, 6, 5], lamp: STAR_LAMP, final: 6 });
const BET = 4;

const stored = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const board = (browser: FakeBrowser, owner: string | null = null): BoardRecord | null => parseBoard(browser.storage.get(boardKey(owner)) ?? null);
const wins = (from: number, draw: Draw, bet = BET) => medalsFor(bet, playOf(from, draw).pays);

/** A page with the machine on it, wired as PlayTab wires it: it sits at the medal center for the card, and a roll still under way is settled as the card goes. */
function machineOn(page: FakePage) {
  let running: Staked | null = null;
  const yielded: string[] = [];
  const seat: { current: Seat | null } = { current: null };
  const table = createTable({ bank: page.bank, storage: page.env, holding: () => seat.current?.holding() ?? false, newId: () => page.browser.name('roll') });
  seat.current = page.bank.sit(SUGOROKU_GAME, {
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
    page.bank.restarted(SUGOROKU_GAME);
  });
  return {
    table,
    seat: seat.current,
    yielded,
    /** ROLL: the roll is drawn (here: given) and the bet taken. */
    roll(draw: Draw, bet = BET): Staked | null {
      const outcome = table.stake(bet, draw);
      running = outcome.kind === 'staked' ? outcome.staked : null;
      return running;
    },
    /** The boat stops on this page. */
    stop() {
      const ran = running;
      running = null;
      return ran ? table.settle(ran) : null;
    },
    /** Where the boat stands, as the machine reads its board. */
    at: () => standingOf(table.board()),
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

describe('the bet and the board', () => {
  it('names a roll so that no two share a name, within the length a record allows', () => {
    const names = new Set(Array.from({ length: 200 }, (_, i) => rollId(1_800_000_000_000 + i, Math.random)));
    expect(names.size).toBe(200);
    for (const name of names) expect(name).toMatch(/^[0-9a-z]{1,24}$/);
  });

  it('pays the board’s figures in proportion to the bet: per 2 medals, on 2, 4, 6 and 10', () => {
    expect(wins(START, PEARL, 2)).toBe(2);
    expect(wins(START, PEARL, 10)).toBe(10);
    expect(wins(START, LAMP, 4)).toBe(40);
    expect(wins(6, JACKPOT, 10)).toBe(1_020);
  });
});

describe('a roll, once', () => {
  it('takes the bet once at ROLL, pays once as the boat stops, and the next roll sails on from where it stopped', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.seat.holding()).toBe(true);
    expect(machine.at()).toBe(START);

    const staked = machine.roll(LAMP);
    expect(staked?.record).toMatchObject({ at: START, owner: null, era: 0, roll: { bet: BET, won: 40, paid: false } });
    expect(stored(browser)).toBe(WELCOME - BET);
    expect(board(browser)).toMatchObject({ at: START, roll: { id: staked?.record.roll.id, paid: false } });

    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET + 40);
    expect(board(browser)).toMatchObject({ roll: { paid: true } });
    expect(machine.at()).toBe(6);
    expect(machine.table.settle(staked!)).toBe('already');
    expect(stored(browser)).toBe(WELCOME - BET + 40);

    // From the lamp chance: up the whale's back to the blowhole and the jackpot.
    expect(machine.roll(JACKPOT, 10)?.record).toMatchObject({ at: 6, roll: { won: 1_020 } });
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET + 40 - 10 + 1_020);
    // A ride leaves the boat at the whale's gate.
    expect(machine.at()).toBe(12);
  });

  it('takes a roll that wins nothing, and moves the boat all the same', async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.roll(PALM);
    expect(machine.stop()).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET);
    expect(machine.at()).toBe(3);
    expect(medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!)).toEqual([]);
  });

  it('keeps the board through a reload: the next page finds the boat where it was left', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.roll(PEARL);
    machine.stop();
    page.hide('left');
    page.close();
    const reloaded = machineOn(browser.open());
    await quiet(browser);
    expect(reloaded.at()).toBe(2);
    expect(reloaded.table.leftover()).toBeNull();
    expect(reloaded.roll(roll(4))?.record).toMatchObject({ at: 2 });
  });

  it('takes nothing it should not: a bet it does not take, a roll it could not draw, medals the player does not have', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    expect(machine.table.stake(5, PEARL).kind).toBe('short');
    expect(machine.table.stake(BET, { ...PEARL, roll: 7 }).kind).toBe('short');
    expect(machine.table.stake(BET, { ...PEARL, ride: [1, 2] }).kind).toBe('short');
    expect(machine.table.stake(BET, { ...PEARL, lamp: 12 }).kind).toBe('short');
    expect(stored(browser)).toBe(WELCOME);
    expect(browser.storage.has(BOARD_KEY)).toBe(false);
  });

  it('takes nothing on a page that does not hold the card', async () => {
    const browser = new FakeBrowser();
    const one = machineOn(browser.open());
    await quiet(browser);
    machineOn(browser.open());
    await quiet(browser);
    expect(one.table.stake(BET, PEARL).kind).toBe('away');
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('a reload while the boat sails', () => {
  it('settles the roll as the page is left, so the reloaded page finds it paid and the boat where it stopped', async () => {
    const browser = new FakeBrowser();
    const before = browser.open();
    const machine = machineOn(before);
    await quiet(browser);
    machine.roll(LAMP);
    before.hide('left');
    before.close();
    expect(machine.yielded).toEqual(['left']);
    expect(stored(browser)).toBe(WELCOME - BET + 40);
    const reloaded = machineOn(browser.open());
    await quiet(browser);
    expect(reloaded.table.leftover()).toBeNull();
    expect(reloaded.at()).toBe(6);
    expect(machine.stop()).toBe('already');
    expect(stored(browser)).toBe(WELCOME - BET + 40);
  });

  it('finishes a roll whose page was killed mid-hop, mid-chance: the next page finds the same roll and pays it once', async () => {
    const browser = new FakeBrowser();
    const first = machineOn(browser.open());
    await quiet(browser);
    first.roll(LAMP);
    first.stop();
    const killed = browser.pages[0];
    const staked = first.roll(JACKPOT, 10);
    crash(browser, killed);
    expect(stored(browser)).toBe(WELCOME - BET + 40 - 10);

    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ at: 6, roll: { id: staked?.record.roll.id, draw: JACKPOT, won: 1_020, paid: false } });
    // Until it is finished, the boat is shown where it was rolled from, and no other roll is taken.
    expect(reopened.table.stake(BET, PEARL).kind).toBe('unfinished');
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET + 40 - 10 + 1_020);
    expect(reopened.table.leftover()).toBeNull();
    expect(reopened.at()).toBe(12);
    // A page that finds it again finds it paid.
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('already');
    expect(stored(browser)).toBe(WELCOME - BET + 40 - 10 + 1_020);
  });
});

describe('the medals out on a roll', () => {
  it('are out from ROLL until the boat stops, a roll that wins nothing included, and stay out over a page killed meanwhile', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const machine = machineOn(killed);
    await quiet(browser);
    const out = () => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);
    machine.roll(PALM);
    expect(out()).toEqual([SUGOROKU_GAME]);
    crash(browser, killed);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    const left = reopened.table.leftover();
    expect(left).toMatchObject({ roll: { won: 0, paid: false } });
    expect(out()).toEqual([SUGOROKU_GAME]);
    expect(reopened.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(out()).toEqual([]);
  });
});

describe('another tab', () => {
  it('settles the roll as another tab takes the medals; that tab finds the boat where the roll left it', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machineOn(first);
    await quiet(browser);
    one.roll(LAMP);
    const two = machineOn(browser.open());
    await quiet(browser);
    expect(one.yielded).toEqual(['moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(stored(browser)).toBe(WELCOME - BET + 40);
    expect(two.table.leftover()).toBeNull();
    expect(two.at()).toBe(6);
    expect(one.stop()).toBe('already');
    two.roll(roll(1));
    expect(two.stop()).toBe('paid');
    // A 1 from the lamp chance: the tailwind, on to the shell at 10.
    expect(two.at()).toBe(10);
    expect(stored(browser)).toBe(WELCOME - BET + 40 - BET + wins(6, roll(1)));
  });
});

describe('the medal center’s reset', () => {
  it('settles a roll under way before the reset, then starts the board over at START: nothing of before is paid after', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.roll(PEARL);
    machine.stop();
    machine.roll(roll(4));
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(SUGOROKU_GAME)).toBe(false);
    expect(browser.storage.has(BOARD_KEY)).toBe(false);
    expect(machine.stop()).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
    expect(machine.at()).toBe(START);
  });

  it('throws away a board and a roll left unfinished before a reset: they went with every other medal', async () => {
    const browser = new FakeBrowser();
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    before.roll(LAMP);
    crash(browser, killed);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    const reopened = machineOn(browser.open());
    await quiet(browser);
    expect(reopened.table.leftover()).toBeNull();
    expect(reopened.at()).toBe(START);
    expect(browser.storage.has(BOARD_KEY)).toBe(false);
    expect(stored(browser)).toBe(WELCOME);
  });

  it('pays nothing into the new medals for a roll bet before the reset, even if nobody voided it', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const outcome = machine.table.stake(BET, LAMP);
    expect(outcome.kind).toBe('staked');
    page.bank.reset();
    await quiet(browser);
    if (outcome.kind !== 'staked') return;
    expect(machine.table.settle({ ...outcome.staked, paid: false, void: false })).toBe('void');
    expect(stored(browser)).toBe(WELCOME);
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-1';
  const GUEST_PLAYER: Player = { uid: null, settled: true, expected: false };

  it('brings a guest’s board and unfinished roll along when the first sign-in moves the medals into the account, and pays it there once', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const killed = browser.open();
    const before = machineOn(killed);
    await quiet(browser);
    before.roll(PEARL);
    before.stop();
    const staked = before.roll(roll(4))!;
    const guestLedger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!.device;
    crash(browser, killed);

    const next = browser.open();
    const after = machineOn(next);
    await quiet(browser);
    next.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: UID, where: 'account', balance: WELCOME - 2 * BET + wins(START, PEARL) });
    const left = after.table.leftover();
    expect(left).toMatchObject({ owner: UID, ledger: guestLedger, at: 2, roll: { id: staked.record.roll.id, paid: false } });
    expect(board(browser, UID)?.roll?.id).toBe(staked.record.roll.id);
    expect(browser.storage.has(BOARD_KEY)).toBe(false);
    expect(after.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser, UID)).toBe(WELCOME - 2 * BET + wins(START, PEARL) + wins(2, roll(4)));
    expect(after.at()).toBe(6);

    next.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(next.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(after.table.leftover()).toBeNull();
    expect(after.at()).toBe(START);
  });

  it('never moves a guest’s board onto an account that has medals of its own: it waits for the guest', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(createLedger('laptop0001', 500)), 'm-elsewhere');
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    machine.roll(PEARL);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    expect(machine.stop()).toBe('later');
    expect(machine.table.leftover()).toBeNull();
    expect(machine.at()).toBe(START);
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    const left = machine.table.leftover();
    expect(left).toMatchObject({ owner: null, roll: { paid: false } });
    expect(machine.table.settle({ record: left!, stored: true, paid: false, void: false })).toBe('paid');
    expect(stored(browser)).toBe(WELCOME - BET + wins(START, PEARL));
    expect(stored(browser, UID)).toBe(500);
    expect(machine.at()).toBe(2);
  });
});

describe('when storage will not keep things', () => {
  it('plays no roll it cannot write down, where storage can be read: nothing is bet', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    const write = page.env.write;
    page.env.write = (key, text) => {
      if (key === BOARD_KEY) throw new Error('quota');
      write(key, text);
    };
    expect(machine.table.stake(BET, PEARL).kind).toBe('unsaved');
    expect(stored(browser)).toBe(WELCOME);
  });

  it('plays from memory where storage is blocked: the bet taken and the winnings given once, the boat moved', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = machineOn(page);
    await quiet(browser);
    browser.blocked = true;
    const staked = machine.roll(LAMP);
    expect(staked?.stored).toBe(false);
    expect(page.bank.getState().balance).toBe(WELCOME - BET);
    expect(machine.stop()).toBe('paid');
    expect(page.bank.getState().balance).toBe(WELCOME - BET + 40);
    expect(machine.table.settle(staked!)).toBe('already');
    expect(machine.at()).toBe(6);
    expect(machine.roll(roll(2))?.record).toMatchObject({ at: 6 });
  });
});

describe('reading a board back', () => {
  it('reads back only a board it could have written: every field checked, what a roll won worked out again', () => {
    const good: BoardRecord = { v: 1, owner: null, ledger: 'device00001', era: 0, at: 6, roll: { id: 'roll1', bet: 10, draw: JACKPOT, won: 1_020, paid: false } };
    expect(parseBoard(serializeBoard(good))).toEqual(good);
    expect(parseBoard(serializeBoard({ ...good, roll: null }))).toEqual({ ...good, roll: null });
    const bad: unknown[] = [
      null,
      'not json',
      '[]',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, at: 30 }),
      // Nobody stands on an arrow.
      JSON.stringify({ ...good, at: 7 }),
      JSON.stringify({ ...good, roll: { ...good.roll, won: 1_021 } }),
      JSON.stringify({ ...good, roll: { ...good.roll, bet: 5 } }),
      JSON.stringify({ ...good, roll: { ...good.roll, draw: { ...JACKPOT, final: 7 } } }),
      JSON.stringify({ ...good, roll: { ...good.roll, id: '' } }),
      JSON.stringify({ ...good, roll: { ...good.roll, paid: 'yes' } }),
      JSON.stringify({ ...good, owner: 5 }),
      JSON.stringify({ ...good, ledger: 'Not A Ledger!' }),
      'x'.repeat(3_000),
    ];
    for (const text of bad) expect(parseBoard(text)).toBeNull();
  });

  it('clears anything at the board’s place that is not a board', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(BOARD_KEY, '{"v":0,"square":99}');
    const machine = machineOn(browser.open());
    await quiet(browser);
    expect(machine.table.leftover()).toBeNull();
    expect(machine.at()).toBe(START);
    expect(browser.storage.has(BOARD_KEY)).toBe(false);
  });
});

describe('a browser that dies between two writes', () => {
  // The board's record and the medals are two writes: the browser is killed at every moment between them and started
  // again, and the machine finishes whatever it left. Every roll is paid exactly once, or, if its bet never went in,
  // never happened at all, and the boat is where the roll left it, or where it was rolled from.
  const machines = new Map<FakeBrowser, ReturnType<typeof machineOn>>();
  /** A browser with the boat on the lamp chance (6), its first roll paid. */
  const setUp = async () => {
    const browser = new FakeBrowser();
    const machine = machineOn(browser.open());
    await quiet(browser);
    machine.roll(LAMP);
    machine.stop();
    machines.set(browser, machine);
    return browser;
  };
  const AFTER_SET_UP = WELCOME - BET + 40;
  const reopened = async (after: FakeBrowser) => {
    const machine = machineOn(after.open());
    await quiet(after);
    const left = machine.table.leftover();
    if (left) machine.table.settle({ record: left, stored: true, paid: false, void: false });
    return machine;
  };
  const spentIn = (browser: FakeBrowser): number => {
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    return ledger.rows[ledger.device]?.spent ?? 0;
  };

  for (const [what, draw, bet] of [
    ['a ride up the whale to the jackpot', JACKPOT, 10],
    ['a roll to a shell', roll(4), BET],
    ['a roll to a palm that wins nothing', roll(3), BET],
  ] as const) {
    const won = wins(6, draw, bet);
    const to = playOf(6, draw).to;
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies between ROLL and the stop`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const machine = machines.get(browser)!;
          machine.roll(draw, bet);
          machine.stop();
        },
        async (after, reached) => {
          const staked = spentIn(after) === BET + bet;
          const machine = await reopened(after);
          expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - bet + won : AFTER_SET_UP);
          expect(machine.table.leftover(), `died after ${reached} writes`).toBeNull();
          expect(machine.at(), `died after ${reached} writes`).toBe(staked ? to : 6);
          // The next roll takes and pays as ever, from where the boat is, and the rolls before it let go of their receipts.
          const next = machine.roll(roll(1));
          expect(next?.record.at, `died after ${reached} writes`).toBe(staked ? to : 6);
          expect(machine.stop()).toBe('paid');
          const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
          const id = next!.record.roll.id;
          const paysNext = next!.record.roll.won > 0;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual(paysNext ? [`${SUGOROKU_GAME}:${id}:pay`, `${SUGOROKU_GAME}:${id}:stake`] : [`${SUGOROKU_GAME}:${id}:stake`]);
          expect(medalsOutAt(ledger)).toEqual([]);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(won > 0 ? 4 : 3);
    });
  }

  it('pays a roll exactly once wherever the browser dies while the page going settles it', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        machines.get(browser)!.roll(JACKPOT, 10);
        browser.pages[0].hide('left');
      },
      async (after, reached) => {
        const staked = spentIn(after) === BET + 10;
        await reopened(after);
        expect(stored(after), `died after ${reached} writes`).toBe(staked ? AFTER_SET_UP - 10 + 1_020 : AFTER_SET_UP);
      },
    );
  });

  it('is marked paid before its winnings go in, so a page that looks at the machine as the medals move never finds it to finish', async () => {
    const browser = await setUp();
    const machine = machines.get(browser)!;
    const found: string[] = [];
    let finishing = false;
    browser.pages[0].bank.subscribe(() => {
      const left = finishing ? machine.table.leftover() : null;
      if (left) found.push(left.roll.id);
    });
    machine.roll(JACKPOT, 10);
    finishing = true;
    expect(machine.stop()).toBe('paid');
    expect(found).toEqual([]);
    expect(stored(browser)).toBe(AFTER_SET_UP - 10 + 1_020);
  });
});

describe('the Odds tab', () => {
  it('never touches the player’s medals', () => {
    for (const file of ['OddsTab.tsx', 'engine.ts']) {
      const source = readFileSync(path.join(process.cwd(), 'src/components/game/Sugoroku', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|useBank|\bbank\(/);
    }
  });
});
