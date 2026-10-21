import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LAMPS, MAX_DOUBLES } from '@/components/game/Janken/engine';
import { JANKEN_GAME, createMachine, type Happening, type RoundStorage } from '@/components/game/Janken/machine';
import { ROUND_KEY, readRound, roundKey } from '@/components/game/Janken/round';
import { BANK_KEY, ledgerKey } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, restartDue, serializeLedger } from '@/components/game/MedalCenter/ledger';
import { BONUS_CARD } from '@/components/game/MedalPusher/records';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';

// What the medal floor is told (reporter.ts), kept here instead of sent.
const reports = vi.hoisted(() => [] as unknown[][]);
vi.mock('@/components/game/MedalCenter/floor/reporter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/game/MedalCenter/floor/reporter')>()),
  floorReport: (...args: unknown[]) => {
    reports.push(args);
  },
}));
beforeEach(() => {
  reports.length = 0;
});
const played = () => reports.reduce((sum, [, win]) => sum + ((win as { played?: number }).played ?? 0), 0);

// The machine with the medal center's real bank, in a browser that is all fakes (bankFakes.ts): one storage that every
// page shares, the one card, a channel between the pages. Nothing is fetched and no account is named.

/** Random numbers that make the cat throw a hand: rock, scissors, paper are the thirds of [0, 1). */
const CAT = { gu: 0.1, choki: 0.5, pa: 0.9 } as const;
/** The random number that stops the roulette on a lamp. */
const lamp = (at: number) => (at + 0.5) / LAMPS.length;

/** The page's storage, as the machine is given it. */
const storageOf = (page: FakePage): RoundStorage => ({ read: (key) => page.env.read(key), write: (key, text) => page.env.write(key, text), remove: (key) => page.env.remove(key) });

/** A page with the machine on it, playing from the page's bank, its cat drawing from `draws` in order. */
function cabinet(page: FakePage, storage: RoundStorage | null = storageOf(page)) {
  const draws: number[] = [];
  const machine = createMachine({
    bank: page.bank,
    storage,
    random: () => {
      if (draws.length === 0) throw new Error('the test did not say what the cat draws');
      return draws.shift()!;
    },
  });
  const happened: Happening[] = [];
  machine.hear((happening) => happened.push(happening));
  const close = machine.open();
  return { machine, happened, close, draws };
}

/** The player's medals as this browser keeps them: a guest's, or an account's. */
const stored = (browser: FakeBrowser, uid: string | null = null): number => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : -1;
};
const UID = 'test-player-1';
const GUEST_PLAYER = { uid: null, settled: true, expected: false };
const roundIn = (browser: FakeBrowser) => readRound(browser.storage.get(ROUND_KEY) ?? null);

/** A page with the machine on it, its card held and its medals found. */
async function opened(browser: FakeBrowser) {
  const page = browser.open();
  const at = cabinet(page);
  await quiet(browser);
  expect(at.machine.view().ready).toBe(true);
  return { page, ...at };
}

/** A page that goes the way a crashed one does: nothing is told, and the browser lets go of its card. */
function crash(page: FakePage) {
  page.watchers = null;
  page.close();
}

describe('a round at the machine', () => {
  it('takes one medal as it goes in, and pays a win once, when it is taken', async () => {
    const browser = new FakeBrowser();
    const { machine, draws } = await opened(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(machine.insert()).toBe(true);
    expect(stored(browser)).toBe(WELCOME - 1);
    expect(roundIn(browser)).toMatchObject({ phase: 'calling', stake: 1 });
    // A second medal does not go in while one is in play.
    expect(machine.insert()).toBe(false);
    expect(stored(browser)).toBe(WELCOME - 1);

    draws.push(CAT.choki, lamp(15));
    const result = machine.press('gu');
    expect(result).toMatchObject({ player: 'gu', machine: 'choki', outcome: 'win', lamp: 15 });
    expect(roundIn(browser)).toMatchObject({ phase: 'spinning', win: LAMPS[15], lamp: 15 });
    // Nothing is paid while the ring runs, nor when it stops: only when the medals are taken.
    expect(stored(browser)).toBe(WELCOME - 1);
    machine.stopped();
    expect(roundIn(browser)).toMatchObject({ phase: 'offer', win: 5 });
    expect(stored(browser)).toBe(WELCOME - 1);
    expect(machine.collect()).toBe(true);
    expect(stored(browser)).toBe(WELCOME - 1 + 5);
    expect(roundIn(browser)).toBeNull();
    expect(machine.collect()).toBe(false);
    expect(stored(browser)).toBe(WELCOME + 4);
  });

  it('takes the medal on a loss and pays nothing, and throws a draw again for nothing', async () => {
    const browser = new FakeBrowser();
    const { machine, draws } = await opened(browser);
    const out = () => medalsOutAt(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);
    machine.insert();
    // The medal is out on the round until it is thrown: no refill is given for it meanwhile.
    expect(out()).toEqual([JANKEN_GAME]);
    draws.push(CAT.pa);
    expect(machine.press('gu')?.outcome).toBe('lose');
    expect(roundIn(browser)).toBeNull();
    expect(stored(browser)).toBe(WELCOME - 1);
    // Lost: it pays nothing, and none of its medals are out any more.
    expect(out()).toEqual([]);

    machine.insert();
    draws.push(CAT.gu, CAT.gu);
    expect(machine.press('gu')?.outcome).toBe('draw');
    expect(machine.press('gu')?.outcome).toBe('draw');
    expect(roundIn(browser)).toMatchObject({ phase: 'calling', stake: 1, draws: 2 });
    expect(stored(browser)).toBe(WELCOME - 2);
    draws.push(CAT.gu, lamp(0));
    expect(machine.press('pa')).toMatchObject({ outcome: 'win', lamp: 0, draws: 2 });
    machine.collect();
    expect(stored(browser)).toBe(WELCOME - 2 + 10);
  });

  it('draws the cat’s hand only when the player presses, and the lamp only on a won play', async () => {
    const browser = new FakeBrowser();
    const { machine, draws } = await opened(browser);
    machine.insert();
    // Nothing has been drawn: the round written down knows nothing of the cat's hand (only its own name, for its receipts).
    expect(Object.keys(roundIn(browser)!).sort()).toEqual(['doubles', 'draws', 'id', 'kind', 'lamp', 'phase', 'stake', 'v', 'win']);
    expect(roundIn(browser)?.lamp).toBe(-1);
    draws.push(CAT.choki, lamp(3));
    machine.press('gu');
    expect(draws).toEqual([]);
  });

  it('doubles a win up, throws a draw of a double-up again, and loses the medals on a loss', async () => {
    const browser = new FakeBrowser();
    const { machine, draws } = await opened(browser);
    machine.insert();
    draws.push(CAT.choki, lamp(6));
    machine.press('gu');
    machine.stopped();
    expect(machine.double()).toBe(true);
    expect(roundIn(browser)).toMatchObject({ kind: 'double', phase: 'calling', stake: 3, win: 0 });
    // Nothing was paid out to be put back: the medals won stay at the machine.
    expect(stored(browser)).toBe(WELCOME - 1);
    draws.push(CAT.gu, CAT.choki);
    expect(machine.press('gu')?.outcome).toBe('draw');
    expect(machine.press('gu')).toMatchObject({ outcome: 'win', lamp: -1, kind: 'double' });
    expect(roundIn(browser)).toMatchObject({ phase: 'offer', win: 6, doubles: 1 });
    machine.double();
    draws.push(CAT.pa);
    expect(machine.press('gu')?.outcome).toBe('lose');
    expect(roundIn(browser)).toBeNull();
    expect(stored(browser)).toBe(WELCOME - 1);
  });

  it('pays the last double-up there can be at once', async () => {
    const browser = new FakeBrowser();
    const { machine, draws, happened } = await opened(browser);
    machine.insert();
    draws.push(CAT.choki, lamp(0));
    machine.press('gu');
    machine.stopped();
    for (let k = 0; k < MAX_DOUBLES; k++) {
      expect(machine.double()).toBe(true);
      draws.push(CAT.choki);
      machine.press('gu');
    }
    expect(machine.double()).toBe(false);
    expect(roundIn(browser)).toBeNull();
    expect(stored(browser)).toBe(WELCOME - 1 + 10 * 2 ** MAX_DOUBLES);
    expect(happened.filter((h) => h.type === 'paid')).toEqual([{ type: 'paid', medals: 160, left: false }]);
  });

  it('does nothing without medals, and offers the free refill only with none left and no round in play', async () => {
    const browser = new FakeBrowser();
    const { page, machine } = await opened(browser);
    expect(page.bank.take(WELCOME)).toBe(true);
    expect(machine.insert()).toBe(false);
    expect(roundIn(browser)).toBeNull();
    expect(machine.refill()).toBe(true);
    expect(stored(browser)).toBe(100);
    expect(machine.refill()).toBe(false);
  });
});

describe('a round and the medal floor', () => {
  it('tells the floor a medal is played when a throw decides it, not as it goes in: one given back is no jackpot ticket', async () => {
    const browser = new FakeBrowser();
    const first = await opened(browser);
    // Put in and given back as the page goes, again and again: nothing was ever at stake, so nothing was played.
    first.machine.insert();
    expect(played()).toBe(0);
    first.page.close();
    await quiet(browser);
    expect(first.happened.at(-1)).toEqual({ type: 'returned', medals: 1 });
    const second = await opened(browser);
    second.machine.insert();
    second.draws.push(CAT.gu);
    expect(second.machine.press('gu')?.outcome).toBe('draw');
    // A draw decides nothing either: the medal is still given back if the page goes.
    expect(played()).toBe(0);
    second.page.close();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(played()).toBe(0);

    // Thrown and decided, it is played, once: a loss as a win.
    const third = await opened(browser);
    third.machine.insert();
    third.draws.push(CAT.pa);
    expect(third.machine.press('gu')?.outcome).toBe('lose');
    expect(played()).toBe(1);
    third.machine.insert();
    third.draws.push(CAT.gu, CAT.gu, lamp(0));
    expect(third.machine.press('gu')?.outcome).toBe('draw');
    expect(third.machine.press('pa')?.outcome).toBe('win');
    expect(played()).toBe(2);
    // A double-up stakes what was won, not a medal put in: it plays nothing more.
    third.machine.collect();
    expect(played()).toBe(2);
  });
});

describe('a round across a reload', () => {
  it('gives back a medal that was put in and not thrown, once, as the page goes', async () => {
    const browser = new FakeBrowser();
    const first = await opened(browser);
    first.machine.insert();
    expect(stored(browser)).toBe(WELCOME - 1);
    first.page.close();
    await quiet(browser);
    expect(first.happened.at(-1)).toEqual({ type: 'returned', medals: 1 });
    expect(stored(browser)).toBe(WELCOME);
    expect(roundIn(browser)).toBeNull();
    // The page that opens after it finds nothing to carry on with, and nothing more is given back.
    const second = await opened(browser);
    expect(second.machine.view().round).toBeNull();
    second.page.close();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
  });

  it('pays a win drawn before the reload, while the ring was still running, exactly once: the reload cannot draw it again', async () => {
    const browser = new FakeBrowser();
    const first = await opened(browser);
    first.machine.insert();
    first.draws.push(CAT.choki, lamp(0));
    first.machine.press('gu');
    expect(roundIn(browser)?.phase).toBe('spinning');
    first.page.close();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME - 1 + 10);
    expect(first.happened.at(-1)).toEqual({ type: 'paid', medals: 10, left: true });
    for (let reloads = 0; reloads < 3; reloads++) {
      const again = await opened(browser);
      expect(again.machine.view().round).toBeNull();
      again.page.close();
      await quiet(browser);
    }
    expect(stored(browser)).toBe(WELCOME + 9);
  });

  it('pays medals on offer, and a double-up not yet thrown, as won', async () => {
    const browser = new FakeBrowser();
    const first = await opened(browser);
    first.machine.insert();
    first.draws.push(CAT.choki, lamp(3));
    first.machine.press('gu');
    first.machine.stopped();
    first.machine.double();
    expect(roundIn(browser)).toMatchObject({ phase: 'calling', kind: 'double', stake: 2 });
    first.page.hide('hidden');
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME - 1 + 2);
    expect(roundIn(browser)).toBeNull();
  });

  it('carries on with a round a crashed page left written down: the medal still in, the ring still to stop', async () => {
    const browser = new FakeBrowser();
    const first = await opened(browser);
    first.machine.insert();
    crash(first.page);
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME - 1);
    expect(roundIn(browser)?.phase).toBe('calling');

    const second = await opened(browser);
    expect(second.happened).toContainEqual({ type: 'resumed', round: expect.objectContaining({ phase: 'calling', stake: 1 }) });
    // No second medal is taken for it, and the throw is the round's.
    expect(second.machine.insert()).toBe(false);
    second.draws.push(CAT.choki, lamp(15));
    second.machine.press('gu');
    crash(second.page);
    await quiet(browser);
    expect(roundIn(browser)?.phase).toBe('spinning');

    const third = await opened(browser);
    expect(third.machine.view().round).toMatchObject({ phase: 'spinning', win: 5 });
    third.machine.stopped();
    expect(third.machine.collect()).toBe(true);
    expect(stored(browser)).toBe(WELCOME - 1 + 5);
  });
});

describe('a round and the other tabs', () => {
  it('stops where it is when another tab’s machine takes the card; the other carries the round on, and nothing is paid twice', async () => {
    const browser = new FakeBrowser();
    const first = await opened(browser);
    first.machine.insert();
    first.draws.push(CAT.choki, lamp(0));
    first.machine.press('gu');
    first.machine.stopped();
    expect(roundIn(browser)?.phase).toBe('offer');

    const second = browser.open();
    const other = cabinet(second);
    await quiet(browser);
    expect(first.machine.view().holding).toBe(false);
    expect(first.page.bank.getState().card).toBe('away');
    expect(other.machine.view()).toMatchObject({ ready: true, round: expect.objectContaining({ phase: 'offer', win: 10 }) });
    // The first tab's buttons do nothing now.
    expect(first.machine.collect()).toBe(false);
    expect(first.machine.insert()).toBe(false);
    expect(stored(browser)).toBe(WELCOME - 1);
    expect(other.machine.collect()).toBe(true);
    expect(stored(browser)).toBe(WELCOME + 9);

    // Played here again: the round is read again, and it has been paid.
    first.machine.play();
    await quiet(browser);
    expect(first.machine.view()).toMatchObject({ ready: true, round: null });
    expect(first.machine.collect()).toBe(false);
    expect(stored(browser)).toBe(WELCOME + 9);
  });
});

describe('a round and the medal center’s reset', () => {
  it('is struck out with every other medal: the medal at stake is not given back', async () => {
    const browser = new FakeBrowser();
    const { machine, happened } = await opened(browser);
    machine.insert();
    machine.insert();
    expect(stored(browser)).toBe(WELCOME - 1);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME);
    expect(roundIn(browser)).toBeNull();
    expect(machine.view().round).toBeNull();
    expect(happened.at(-1)).toEqual({ type: 'restarted' });
    const ledger = parseLedger(browser.storage.get(ledgerKey(null)) ?? null)!;
    expect(ledger.era).toBe(1);
    expect(restartDue(ledger, JANKEN_GAME)).toBe(false);
    // And the machine plays on in the new era.
    expect(machine.insert()).toBe(true);
    expect(stored(browser)).toBe(WELCOME - 1);
  });

  it('starts over when it opens after a reset made while it was closed, whatever round it had left written down', async () => {
    const browser = new FakeBrowser();
    const first = await opened(browser);
    first.machine.insert();
    crash(first.page);
    await quiet(browser);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    expect(roundIn(browser)?.phase).toBe('calling');

    const second = await opened(browser);
    expect(second.machine.view().round).toBeNull();
    expect(roundIn(browser)).toBeNull();
    expect(stored(browser)).toBe(WELCOME);
    expect(restartDue(parseLedger(browser.storage.get(ledgerKey(null)) ?? null)!, JANKEN_GAME)).toBe(false);
  });
});

describe('the round’s place in storage', () => {
  it('keeps a guest’s round and an account’s apart', () => {
    expect(roundKey(null)).toBe(ROUND_KEY);
    expect(roundKey('someone')).toBe(`${ROUND_KEY}:someone`);
  });
});

describe('a round and the page it is on', () => {
  it('settles the round as the cabinet is put away without the page going (moving to another page of the site)', async () => {
    const browser = new FakeBrowser();
    const first = await opened(browser);
    first.machine.insert();
    expect(stored(browser)).toBe(WELCOME - 1);
    first.close();
    await quiet(browser);
    expect(first.happened.at(-1)).toEqual({ type: 'returned', medals: 1 });
    expect(stored(browser)).toBe(WELCOME);
    expect(roundIn(browser)).toBeNull();

    // And medals won, the same way.
    const second = cabinet(first.page);
    await quiet(browser);
    second.machine.insert();
    second.draws.push(CAT.choki, lamp(0));
    second.machine.press('gu');
    second.close();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME - 1 + 10);
    expect(roundIn(browser)).toBeNull();
  });

  it('keeps a round it could not write down, and settles it when the card comes back from a moment’s loan', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { machine, happened } = cabinet(page, null);
    await quiet(browser);
    expect(machine.insert()).toBe(true);
    expect(stored(browser)).toBe(WELCOME - 1);
    // The medal center's front borrows the card for a moment to pay the day's bonus, and gives it back.
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME - 1 + BONUS_CARD[0]);
    // The card went to the front and came back: the machine read its round again, and found the one it had kept.
    expect(happened.filter((h) => h.type === 'resumed')).toHaveLength(1);
    expect(machine.view()).toMatchObject({ ready: true, round: expect.objectContaining({ phase: 'calling', stake: 1 }) });
    page.close();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME + BONUS_CARD[0]);
  });

  it('keeps a round whose write storage refused, rather than the older one storage still holds', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const storage = storageOf(page);
    let refuse = false;
    const { machine, draws } = cabinet(page, {
      ...storage,
      write: (key, text) => {
        if (refuse) throw new Error('full');
        storage.write(key, text);
      },
    });
    await quiet(browser);
    machine.insert();
    refuse = true;
    draws.push(CAT.choki, lamp(0));
    machine.press('gu');
    // Storage still holds the round as it was called; this page holds the win.
    expect(roundIn(browser)?.phase).toBe('calling');
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(stored(browser)).toBe(WELCOME - 1 + BONUS_CARD[0]);
    expect(machine.view().round).toMatchObject({ phase: 'spinning', win: 10 });
    machine.stopped();
    expect(machine.collect()).toBe(true);
    expect(stored(browser)).toBe(WELCOME - 1 + BONUS_CARD[0] + 10);
  });
});

describe('a browser that dies between two writes', () => {
  // The round and the medals are two writes (machine.ts): the browser is killed at every moment of a round, started
  // again, and the machine opened on what it left; the round left is then settled as a page going settles it. Every
  // medal put in is taken once and every win paid once, or the round was never played.
  const machines = new Map<FakeBrowser, Awaited<ReturnType<typeof opened>>>();
  const setUp = async () => {
    const browser = new FakeBrowser();
    machines.set(browser, await opened(browser));
    return browser;
  };
  /** The machine opened again on what the browser left, and the round it finds settled as the page goes. */
  const reopenedAndLeft = async (after: FakeBrowser) => {
    const again = await opened(after);
    again.page.hide('left');
    await quiet(after);
    return again;
  };
  const rowIn = (browser: FakeBrowser) => {
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    return ledger.rows[ledger.device] ?? { got: 0, spent: 0 };
  };

  it('pays a won round exactly once, or never plays it, wherever the browser dies in it', async () => {
    const won = LAMPS[15];
    const writes = await atEveryWrite(
      setUp,
      (browser) => {
        const { machine, draws } = machines.get(browser)!;
        machine.insert();
        draws.push(CAT.choki, lamp(15));
        machine.press('gu');
        machine.stopped();
        machine.collect();
      },
      async (after, reached) => {
        // The throw is in once it is written down (the round moved on from calling), or once its win has gone in.
        const left = roundIn(after);
        const thrown = (left !== null && (left.phase !== 'calling' || left.paying !== undefined)) || rowIn(after).got > 0;
        await reopenedAndLeft(after);
        expect(stored(after), `died after ${reached} writes`).toBe(thrown ? WELCOME - 1 + won : WELCOME);
        expect(roundIn(after), `died after ${reached} writes`).toBeNull();
        // No round in play: none of its medals are out, wherever the browser died.
        expect(medalsOutAt(parseLedger(after.storage.get(BANK_KEY) ?? null)!), `died after ${reached} writes`).toEqual([]);
        // The next medal in lets go of whatever receipts the round left: only its own are kept, and its medal is out on it.
        const next = await opened(after);
        expect(next.machine.insert()).toBe(true);
        const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
        expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${JANKEN_GAME}:${roundIn(after)!.id}:in`, `${JANKEN_GAME}:${roundIn(after)!.id}:out`]);
      },
    );
    expect(writes).toBeGreaterThanOrEqual(5);
  });

  it('gives a medal put in and not thrown back exactly once, wherever the browser dies as the page goes', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        const { machine, page } = machines.get(browser)!;
        machine.insert();
        page.hide('left');
      },
      async (after, reached) => {
        await reopenedAndLeft(after);
        expect(stored(after), `died after ${reached} writes`).toBe(WELCOME);
        expect(roundIn(after), `died after ${reached} writes`).toBeNull();
      },
    );
  });

  it('pays a double-up exactly once wherever the browser dies in it', async () => {
    const won = LAMPS[15] * 2;
    await atEveryWrite(
      setUp,
      (browser) => {
        const { machine, draws } = machines.get(browser)!;
        machine.insert();
        draws.push(CAT.choki, lamp(15));
        machine.press('gu');
        machine.stopped();
        machine.double();
        draws.push(CAT.choki);
        machine.press('gu');
        machine.collect();
      },
      async (after, reached) => {
        const left = roundIn(after);
        const thrown = (left !== null && (left.phase !== 'calling' || left.kind === 'double' || left.paying !== undefined)) || rowIn(after).got > 0;
        const doubled = (left !== null && left.doubles === 1) || rowIn(after).got === won;
        await reopenedAndLeft(after);
        expect(stored(after), `died after ${reached} writes`).toBe(!thrown ? WELCOME : WELCOME - 1 + (doubled ? won : LAMPS[15]));
      },
    );
  });

  it('takes a round from before receipts at its word: its medal went in, and its win is paid once', async () => {
    const browser = new FakeBrowser();
    const { machine, page } = await opened(browser);
    page.bank.take(1);
    browser.storage.set(ROUND_KEY, JSON.stringify({ v: 1, kind: 'play', phase: 'offer', stake: 0, win: 5, lamp: 15, doubles: 0, draws: 0 }));
    page.hide();
    page.show();
    await quiet(browser);
    expect(machine.view().round).toMatchObject({ phase: 'offer', win: 5 });
    expect(machine.collect()).toBe(true);
    expect(machine.collect()).toBe(false);
    expect(stored(browser)).toBe(WELCOME - 1 + 5);
  });
});

describe('a round across a sign-in', () => {
  it('goes with the guest’s medals into an account that had none, and is finished and paid there', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const { page, machine, draws } = await opened(browser);
    machine.insert();
    expect(stored(browser)).toBe(WELCOME - 1);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME - 1 });
    expect(browser.storage.has(BANK_KEY)).toBe(false);
    expect(browser.storage.has(ROUND_KEY)).toBe(false);
    expect(readRound(browser.storage.get(roundKey(UID)) ?? null)).toMatchObject({ phase: 'calling', stake: 1 });
    expect(machine.view()).toMatchObject({ ready: true, round: expect.objectContaining({ phase: 'calling' }) });
    draws.push(CAT.choki, lamp(15));
    machine.press('gu');
    machine.stopped();
    expect(machine.collect()).toBe(true);
    expect(stored(browser, UID)).toBe(WELCOME - 1 + 5);
    // Signed out, the guest has a new member's medals and no round of the account's to finish.
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(machine.view().round).toBeNull();
  });

  it('stays the guest’s when the account has medals of its own, and is there for the guest again after signing out', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(createLedger('laptop0001', 500)), 'm-elsewhere');
    const { page, machine } = await opened(browser);
    machine.insert();
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    expect(machine.view().round).toBeNull();
    expect(roundIn(browser)).toMatchObject({ phase: 'calling', stake: 1 });
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME - 1 });
    expect(machine.view().round).toMatchObject({ phase: 'calling', stake: 1 });
  });
});
