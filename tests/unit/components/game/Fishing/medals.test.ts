import { describe, expect, it } from 'vitest';

import { ledgerKey } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, medalsOutAt, parseLedger, receiptsOf } from '@/components/game/MedalCenter/ledger';
import { type Cast } from '@/components/game/Fishing/engine';
import { FISHING_GAME, ROUND_KEY, createPier, parseRound, roundKey, serializeRound, winOf, type PierStorage, type Round } from '@/components/game/Fishing/medals';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

const UID = 'test-player-1';
const GUEST_PLAYER = { uid: null, settled: true, expected: false };

// Big Catch Harbor at the medal center's bank, run against the real bank in a fake browser (bankFakes.ts): one storage
// that every page shares, the one card, and pages that can be hidden, left, reloaded or lost. Nothing is fetched and no
// real account is named.

/** The harbor's lord, landed: ×300. */
const LORD: Cast = { fish: 'lord', landed: true, prize: null };
/** A Pebble Goby, landed: ×2. */
const GOBY: Cast = { fish: 'goby', landed: true, prize: null };
/** Nothing bites. */
const NOTHING: Cast = { fish: null, landed: false, prize: null };
/** A Crescent Marlin that gets away. */
const AWAY: Cast = { fish: 'marlin', landed: false, prize: null };

let rounds = 0;
const name = () => `round${String(++rounds).padStart(4, '0')}`;

/** A page with the machine on it, seated at the bank, in a tab of the given name. */
function harbor(page: FakePage, tab = 'taba', storage: PierStorage = page.env) {
  const events: string[] = [];
  const pier = createPier({
    bank: page.bank,
    storage,
    tab,
    name,
    events: {
      granted: () => events.push('granted'),
      yielding: (why) => events.push(`yielding ${why}`),
      restart: () => events.push('restart'),
    },
  });
  const getUp = pier.sit();
  return { pier, events, getUp };
}

const stored = (browser: FakeBrowser, uid: string | null = null) => parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
const storedBalance = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = stored(browser, uid);
  return ledger ? balanceOf(ledger) : null;
};
const storedRound = (browser: FakeBrowser, owner: string | null = null): Round | null => parseRound(browser.storage.get(roundKey(owner)) ?? null);

/** Casts and expects the cast to be taken. */
function cast(pier: ReturnType<typeof harbor>['pier'], medals: number, drawn: Cast): Round {
  const placed = pier.cast(medals, drawn);
  if (!placed.ok) throw new Error(`the cast was refused: ${placed.why}`);
  return placed.round;
}

/** A page lost without a word, as when a tab crashes: whatever lock it held is let go, and nothing else happens. */
function crash(browser: FakeBrowser, page: FakePage) {
  page.closed = true;
  browser.pages = browser.pages.filter((other) => other !== page);
  if (browser.holder === page) browser.holder = null;
}

describe('the medals a cast takes and gives', () => {
  it('pays exactly what the engine says, times the medals bet', () => {
    for (const medals of [1, 3, 5] as const) {
      expect(winOf({ bet: medals, cast: LORD })).toBe(300 * medals);
      expect(winOf({ bet: medals, cast: GOBY })).toBe(2 * medals);
      expect(winOf({ bet: medals, cast: NOTHING })).toBe(0);
      expect(winOf({ bet: medals, cast: AWAY })).toBe(0);
      expect(winOf({ bet: medals, cast: { fish: 'chest', landed: true, prize: 3 } })).toBe(200 * medals);
    }
  });

  it('takes the stake once as CAST is pressed, and pays the catch once as it is landed', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { pier, events } = harbor(page);
    await quiet(browser);
    expect(events).toEqual(['granted']);
    expect(pier.holding()).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME);

    const round = cast(pier, 5, LORD);
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    expect(storedRound(browser)).toEqual({ ...round, paid: false });
    expect(round).toMatchObject({ bet: 5, cast: LORD, owner: null, era: 0, tab: 'taba', paid: false });

    expect(pier.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 1_500);
    expect(storedRound(browser)).toBeNull();
    // However often it is said again, it is not paid again.
    expect(pier.finish(round)).toBe(true);
    expect(pier.payDue()).toBeNull();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 1_495);

    const lost = cast(pier, 3, AWAY);
    expect(pier.finish(lost)).toBe(true);
    const none = cast(pier, 1, NOTHING);
    expect(pier.finish(none)).toBe(true);
    const small = cast(pier, 1, GOBY);
    expect(pier.finish(small)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME + 1_495 - 3 - 1 - 1 + 2);
    expect(page.bank.getState().balance).toBe(WELCOME + 1_492);
  });

  it('refuses a bet the machine does not take, a cast it could not draw, one the medals do not cover, and a second while the first is unpaid', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { pier } = harbor(page);
    await quiet(browser);
    expect(pier.cast(2, NOTHING)).toEqual({ ok: false, why: 'bet' });
    expect(pier.cast(0, NOTHING)).toEqual({ ok: false, why: 'bet' });
    expect(pier.cast(1, { fish: 'whale', landed: true, prize: null } as unknown as Cast)).toEqual({ ok: false, why: 'bet' });
    expect(pier.cast(1, { fish: 'fry', landed: true, prize: 2 })).toEqual({ ok: false, why: 'bet' });
    // Down to four medals: five cannot be cast, three can.
    expect(page.bank.take(WELCOME - 4)).toBe(true);
    expect(pier.cast(5, NOTHING)).toEqual({ ok: false, why: 'medals' });
    expect(storedRound(browser)).toBeNull();
    const round = cast(pier, 3, GOBY);
    expect(storedBalance(browser)).toBe(1);
    // A cast still on the line is settled before the next is taken (the cabinet never casts over one): paid once.
    const last = cast(pier, 1, NOTHING);
    expect(storedBalance(browser)).toBe(1 + 6 - 1);
    expect(pier.finish(round)).toBe(true);
    pier.finish(last);
    expect(storedBalance(browser)).toBe(6);
    expect(page.bank.take(6)).toBe(true);
    // With nothing left, nothing more can be cast.
    expect(pier.cast(1, NOTHING)).toEqual({ ok: false, why: 'medals' });
    // A round written down and not paid, which this page cannot pay (another era, say), blocks the next cast.
    page.bank.give(5);
    browser.storage.set(ROUND_KEY, serializeRound({ v: 1, id: 'later', tab: 'taba', owner: null, era: 7, bet: 1, cast: LORD, paid: false }));
    expect(pier.cast(1, NOTHING)).toEqual({ ok: false, why: 'unpaid' });
    expect(storedBalance(browser)).toBe(5);
  });
});

describe('the medals out on a cast', () => {
  it('are out while the cast plays out, and none are once it is finished, on a loss as on a catch', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { pier } = harbor(page);
    await quiet(browser);
    const out = () => medalsOutAt(stored(browser)!);
    for (const drawn of [NOTHING, AWAY, GOBY]) {
      const round = cast(pier, 1, drawn);
      expect(out()).toEqual([FISHING_GAME]);
      expect(page.bank.getState().out).toEqual([FISHING_GAME]);
      expect(pier.finish(round)).toBe(true);
      expect(out()).toEqual([]);
    }
  });
});

describe('a cast in progress when the page goes', () => {
  it('resumes after a reload: the page going pays it while it still holds the card, and the same tab shows it again, paid once', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = harbor(first, 'taba');
    await quiet(browser);
    const round = cast(one.pier, 1, LORD);
    expect(storedBalance(browser)).toBe(WELCOME - 1);
    // The reload: the page is left (pagehide) before the lord is landed on the screen.
    first.hide('left');
    expect(one.events.at(-1)).toBe('yielding left');
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 300);
    expect(storedRound(browser)).toEqual({ ...round, paid: true });
    first.close();

    // The tab comes back with the same name (it is kept in the tab's own storage), and is shown its cast again.
    const again = browser.open();
    const two = harbor(again, 'taba');
    await quiet(browser);
    expect(two.pier.leftover()).toEqual({ ...round, paid: true });
    expect(two.pier.finish(round)).toBe(true);
    expect(storedRound(browser)).toBeNull();
    expect(two.pier.leftover()).toBeNull();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 300);

    // Nothing is paid again by anyone, however many pages open after.
    const third = browser.open();
    const three = harbor(third, 'tabc');
    await quiet(browser);
    expect(three.pier.payDue()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME + 299);
  });

  it('pays a round whose page was lost without a word (a crash) when the next page of the machine holds the card, once', async () => {
    const browser = new FakeBrowser();
    const lost = browser.open();
    const one = harbor(lost, 'taba');
    await quiet(browser);
    const round = cast(one.pier, 3, LORD);
    crash(browser, lost);
    expect(storedBalance(browser)).toBe(WELCOME - 3);
    expect(storedRound(browser)?.paid).toBe(false);

    // Another tab's machine finds it and pays it, but does not show it: it was not its cast.
    const other = browser.open();
    const two = harbor(other, 'tabb');
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 900);
    expect(storedRound(browser)).toEqual({ ...round, paid: true });
    expect(two.pier.leftover()).toBeNull();

    // The lost tab, reopened, shows it, and nothing is paid twice.
    const back = browser.open();
    const three = harbor(back, 'taba');
    await quiet(browser);
    expect(three.pier.leftover()?.id).toBe(round.id);
    three.pier.finish(round);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 897);
    expect(storedRound(browser)).toBeNull();
  });
});

describe('the card', () => {
  it('pays the round as the card goes to a machine in another tab, takes no cast without it, and has it back with Play here', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = harbor(first, 'taba');
    await quiet(browser);
    const round = cast(one.pier, 1, LORD);

    const second = browser.open();
    const two = harbor(second, 'tabb');
    await quiet(browser);
    // The first machine was paid as the card left it, and waits: "playing in another tab — Play here".
    expect(one.events).toEqual(['granted', 'yielding moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(one.pier.holding()).toBe(false);
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 300);
    expect(one.pier.cast(1, NOTHING)).toEqual({ ok: false, why: 'card' });
    // Its show ends later: nothing more is paid.
    expect(one.pier.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME + 299);

    // The second machine plays on with the same medals.
    expect(two.pier.holding()).toBe(true);
    const there = cast(two.pier, 5, NOTHING);
    two.pier.finish(there);
    expect(storedBalance(browser)).toBe(WELCOME + 294);

    // Back to the first: it has the card, and the second waits.
    one.pier.play();
    await quiet(browser);
    expect(one.pier.holding()).toBe(true);
    expect(two.pier.holding()).toBe(false);
    expect(second.bank.getState().card).toBe('away');
    const here = cast(one.pier, 1, GOBY);
    one.pier.finish(here);
    expect(storedBalance(browser)).toBe(WELCOME + 295);
  });

  it('pays the round under way when the machine is put away mid-cast, as when the player goes to another page of the site', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const one = harbor(page, 'taba');
    await quiet(browser);
    const round = cast(one.pier, 3, GOBY);
    one.getUp();
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 6);
    expect(storedRound(browser)).toEqual({ ...round, paid: true });
    await quiet(browser);
    expect(hub.bank.getState().balance).toBe(WELCOME + 3);
    // Coming back to it in the same tab shows the cast the player did not see finished, and pays nothing more.
    const back = harbor(page, 'taba');
    await quiet(browser);
    expect(back.pier.leftover()?.id).toBe(round.id);
    back.pier.finish(round);
    expect(storedRound(browser)).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME + 3);
  });

  it('never writes or removes a round without the card: a stale tab cannot remove the round another tab has just written', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const touched: string[] = [];
    const watched: PierStorage = {
      read: first.env.read,
      write: (key, text) => {
        touched.push(`write ${key}`);
        first.env.write(key, text);
      },
      remove: (key) => {
        touched.push(`remove ${key}`);
        first.env.remove(key);
      },
    };
    const one = harbor(first, 'taba', watched);
    await quiet(browser);
    const mine = cast(one.pier, 1, GOBY);
    const second = browser.open();
    const two = harbor(second, 'tabb');
    await quiet(browser);
    expect(one.pier.holding()).toBe(false);
    const theirs = cast(two.pier, 5, LORD);
    touched.length = 0;
    browser.storage.set(ROUND_KEY, serializeRound({ ...mine, paid: true }));
    expect(one.pier.finish(mine)).toBe(true);
    expect(touched).toEqual([]);
    browser.storage.set(ROUND_KEY, serializeRound(theirs));
    expect(two.pier.finish(theirs)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 2 - 5 + 1_500);
    expect(storedRound(browser)).toBeNull();
  });

  it('lends the card to the medal center’s front for a moment mid-cast: the round is paid once, around the day’s bonus', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const { pier, events } = harbor(page);
    await quiet(browser);
    const round = cast(pier, 3, GOBY);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(events).toEqual(['granted', 'yielding moment', 'granted']);
    expect(pier.holding()).toBe(true);
    const bonus = storedBalance(browser)! - (WELCOME - 3 + 6);
    expect(bonus).toBeGreaterThan(0);
    expect(pier.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 6 + bonus);
  });

  it('pays a round once in a browser that cannot keep its tabs apart, whichever tab settles it', async () => {
    const browser = new FakeBrowser();
    browser.apart = false;
    const [first, second] = [browser.open(), browser.open()];
    const one = harbor(first, 'taba');
    const two = harbor(second, 'tabb');
    await quiet(browser);
    const round = cast(one.pier, 1, LORD);
    expect(two.pier.payDue()?.id).toBe(round.id);
    expect(storedRound(browser)).toEqual({ ...round, paid: true });
    const before = storedBalance(browser);
    expect(before).toBe(WELCOME - 1 + 300);
    expect(one.pier.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(before);
    expect(storedRound(browser)).toBeNull();
    expect(two.pier.payDue()).toBeNull();
    expect(one.pier.payDue()).toBeNull();
  });
});

describe('a player who signs out and in again mid-cast', () => {
  it('pays the round into their own medals once they are back, and never shows or counts it a second time', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const page = browser.open();
    page.bank.attend(signedIn(UID), accounts.store);
    const { pier } = harbor(page, 'taba');
    await quiet(browser);
    expect(page.bank.owner()).toBe(UID);
    const before = page.bank.balance();
    const round = cast(pier, 1, LORD);
    expect(round.owner).toBe(UID);

    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(page.bank.owner()).toBeNull();
    expect(pier.finish(round)).toBe(false);
    expect(storedBalance(browser, UID)).toBe(before - 1);
    expect(page.bank.getState().balance).toBe(WELCOME);
    expect(pier.leftover()).toBeNull();

    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.owner()).toBe(UID);
    expect(pier.payDue()?.id).toBe(round.id);
    expect(pier.leftover()).toBeNull();
    expect(storedRound(browser, UID)).toBeNull();
    expect(pier.payDue()).toBeNull();
    await quiet(browser);
    expect(storedBalance(browser, UID)).toBe(before - 1 + 300);
  });
});

describe('the reset at the medal center', () => {
  it('voids the round under way, starts the machine over, and notes that this device’s machine has started over', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const { pier, events } = harbor(page);
    await quiet(browser);
    page.bank.give(500);
    const round = cast(pier, 5, LORD);
    hub.bank.reset();
    await quiet(browser);
    expect(events).toContain('restart');
    expect(stored(browser)?.era).toBe(1);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(storedRound(browser)).toBeNull();
    expect(pier.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(FISHING_GAME)).toBe(false);
    const ledger = stored(browser)!;
    expect(ledger.restarted[`${FISHING_GAME}@${ledger.device}`]).toBe(1);
    const next = cast(pier, 1, GOBY);
    expect(next.era).toBe(1);
    pier.finish(next);
    expect(storedBalance(browser)).toBe(WELCOME + 1);
  });

  it('starts over when it is opened after a reset made while it was closed, and never pays a round from before it', async () => {
    const browser = new FakeBrowser();
    const lost = browser.open();
    const one = harbor(lost, 'taba');
    await quiet(browser);
    cast(one.pier, 5, LORD);
    crash(browser, lost);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);

    const back = browser.open();
    const two = harbor(back, 'taba');
    await quiet(browser);
    expect(two.events).toEqual(['restart', 'granted']);
    expect(storedRound(browser)).toBeNull();
    expect(two.pier.leftover()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(back.bank.restartDue(FISHING_GAME)).toBe(false);
  });
});

describe('what was kept before', () => {
  it('reads back only a whole round, as written', () => {
    const round: Round = { v: 1, id: 'abc123', tab: 'taba', owner: null, era: 2, bet: 3, cast: { fish: 'chest', landed: true, prize: 1 }, paid: false };
    expect(parseRound(serializeRound(round))).toEqual(round);
    expect(parseRound(serializeRound({ ...round, owner: 'test-player-1' }))?.owner).toBe('test-player-1');
    const broken = [
      null,
      42,
      '',
      'not json',
      '[]',
      JSON.stringify({ credits: 500 }),
      JSON.stringify({ ...round, v: 2 }),
      JSON.stringify({ ...round, bet: 2 }),
      JSON.stringify({ ...round, bet: '3' }),
      JSON.stringify({ ...round, cast: { fish: 'chest', landed: true, prize: null } }),
      JSON.stringify({ ...round, cast: { fish: 'whale', landed: true, prize: null } }),
      JSON.stringify({ ...round, cast: { fish: null, landed: true, prize: null } }),
      JSON.stringify({ ...round, cast: null }),
      JSON.stringify({ ...round, era: -1 }),
      JSON.stringify({ ...round, era: 1.5 }),
      JSON.stringify({ ...round, paid: 'yes' }),
      JSON.stringify({ ...round, id: 'Not A Name!' }),
      JSON.stringify({ ...round, id: 'x'.repeat(25) }),
      JSON.stringify({ ...round, tab: '' }),
      JSON.stringify({ ...round, owner: 7 }),
      'x'.repeat(5_000),
    ];
    for (const text of broken) expect(parseRound(text), String(text).slice(0, 80)).toBeNull();
  });

  it('ignores anything under the round’s name that is not a round, and adds no medals for it', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(ROUND_KEY, JSON.stringify({ credits: 500 }));
    const page = browser.open();
    const { pier } = harbor(page);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(pier.current()).toBeNull();
    expect(pier.leftover()).toBeNull();
    const round = cast(pier, 1, NOTHING);
    expect(pier.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 1);
  });

  it('leaves another player’s round alone: it is paid only into that player’s medals', async () => {
    const browser = new FakeBrowser();
    const theirs: Round = { v: 1, id: 'theirs1', tab: 'taba', owner: 'test-player-1', era: 0, bet: 1, cast: LORD, paid: false };
    browser.storage.set(roundKey('test-player-1'), serializeRound(theirs));
    browser.storage.set(ROUND_KEY, serializeRound(theirs));
    const page = browser.open();
    const { pier } = harbor(page);
    await quiet(browser);
    expect(pier.payDue()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(parseRound(browser.storage.get(roundKey('test-player-1')))).toEqual(theirs);
  });

  it('never pays a round written down whose stake the bank never took', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { pier } = harbor(page);
    await quiet(browser);
    // Written as a cast would be, but the browser died before its stake went in: no receipt for it.
    browser.storage.set(ROUND_KEY, serializeRound({ v: 1, id: 'nostake1', tab: 'taba', owner: null, era: 0, bet: 5, cast: LORD, paid: false }));
    expect(pier.payDue()).toBeNull();
    expect(storedRound(browser)).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME);
  });
});

describe('storage that keeps nothing', () => {
  it('holds the round on the page instead, and still takes the stake once and pays the catch once', async () => {
    const browser = new FakeBrowser();
    browser.blocked = true;
    const page = browser.open();
    const { pier } = harbor(page);
    await quiet(browser);
    expect(pier.holding()).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME);
    const round = cast(pier, 3, LORD);
    expect(page.bank.balance()).toBe(WELCOME - 3);
    expect(pier.current()?.id).toBe(round.id);
    expect(pier.finish(round)).toBe(true);
    expect(pier.finish(round)).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME - 3 + 900);
    expect(pier.current()).toBeNull();
  });
});

describe('a browser that dies between two writes', () => {
  // The round and the medals are two writes (medals.ts): the browser is killed at every moment between them, started
  // again, and the machine opened again in the same tab. Every cast is paid exactly once, or, if its stake never went
  // in, never happened at all.

  const opened = async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = harbor(page, 'taba');
    await quiet(browser);
    return { browser, page, ...machine };
  };
  const machines = new Map<FakeBrowser, Awaited<ReturnType<typeof opened>>>();
  const setUp = async () => {
    const at = await opened();
    machines.set(at.browser, at);
    return at.browser;
  };

  /** What the browser left, opened again: the machine pays what it owes as it is given the card, and shows this tab's cast. */
  async function reopened(after: FakeBrowser) {
    const page = after.open();
    const machine = harbor(page, 'taba');
    await quiet(after);
    const shown = machine.pier.leftover();
    if (shown) machine.pier.finish(shown);
    await quiet(after);
    return { page, ...machine };
  }

  for (const [what, drawn] of [
    ['the harbor’s lord', LORD],
    ['a treasure chest', { fish: 'chest', landed: true, prize: 2 } as Cast],
    ['a cast that nothing bites', NOTHING],
    ['a fish that gets away', AWAY],
  ] as const) {
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies in a cast`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const { pier } = machines.get(browser)!;
          const round = cast(pier, 5, drawn);
          pier.finish(round);
        },
        async (after, reached) => {
          const before = stored(after)!;
          const staked = before.rows[before.device]?.spent === 5;
          const { pier } = await reopened(after);
          const expected = staked ? WELCOME - 5 + winOf({ bet: 5, cast: drawn }) : WELCOME;
          expect(storedBalance(after), `died after ${reached} writes`).toBe(expected);
          const left = storedRound(after);
          expect(left === null || left.paid, `died after ${reached} writes`).toBe(true);
          // No medals are left out on a round, so a player who ran out would be given the refill.
          expect(medalsOutAt(stored(after)!), `died after ${reached} writes`).toEqual([]);
          // Another cast, played through: every receipt is let go of once nothing needs it.
          cast(pier, 1, NOTHING);
          pier.finish(pier.current()!);
          const ledger = stored(after)!;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([]);
          expect(balanceOf(ledger)).toBe(expected - 1);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(3);
    });
  }

  it('pays a cast exactly once wherever the browser dies while the page going pays it, and the tab shows it again', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        const { pier, page } = machines.get(browser)!;
        cast(pier, 3, LORD);
        // A reload: the page going pays the cast before the card goes.
        page.hide('left');
      },
      async (after, reached) => {
        const before = stored(after)!;
        const staked = before.rows[before.device]?.spent === 3;
        const back = after.open();
        const { pier } = harbor(back, 'taba');
        await quiet(after);
        const shown = pier.leftover();
        expect(shown !== null, `died after ${reached} writes`).toBe(staked);
        if (shown) expect(pier.finish(shown)).toBe(true);
        expect(storedBalance(after), `died after ${reached} writes`).toBe(staked ? WELCOME - 3 + 900 : WELCOME);
      },
    );
  });
});
