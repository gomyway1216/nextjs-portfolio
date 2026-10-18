import { describe, expect, it } from 'vitest';

import { ledgerKey } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, medalsOutAt, parseLedger, receiptsOf } from '@/components/game/MedalCenter/ledger';
import { TOTAL_WAYS, analyzeMachine, paylineOf, type Stops } from '@/components/game/SlotMachine/engine';
import {
  BET_OPTIONS,
  NOTICE_KEY,
  ROUND_KEY,
  SLOT_GAME,
  createTable,
  isBet,
  markNoticeRead,
  noticeRead,
  parseRound,
  roundKey,
  serializeRound,
  winOf,
  type Round,
  type TableStorage,
} from '@/components/game/SlotMachine/medals';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

const UID = 'test-player-1';
const GUEST_PLAYER = { uid: null, settled: true, expected: false };

// The slot machine at the medal center's bank, run against the real bank in a fake browser (bankFakes.ts): one
// storage that every page shares, the one card, and pages that can be hidden, left, reloaded or lost. Nothing is
// fetched and no real account is named.

/** 7-7-7 on the payline: the first stop of every reel is its 7. */
const JACKPOT: Stops = [0, 0, 0];
/** Plum, BAR, plum: no win. */
const LOSS: Stops = [4, 8, 2];
/** A cherry on the first reel only. */
const CHERRY: Stops = [2, 8, 2];

let rounds = 0;
const name = () => `round${String(++rounds).padStart(4, '0')}`;

/** A page with the slot machine on it, seated at the bank, in a tab of the given name. */
function slot(page: FakePage, tab = 'taba', storage: TableStorage = page.env) {
  const events: string[] = [];
  const table = createTable({
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
  const getUp = table.sit();
  return { table, events, getUp };
}

const stored = (browser: FakeBrowser, uid: string | null = null) => parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
const storedBalance = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = stored(browser, uid);
  return ledger ? balanceOf(ledger) : null;
};
const storedRound = (browser: FakeBrowser, owner: string | null = null): Round | null => parseRound(browser.storage.get(roundKey(owner)) ?? null);

/** Bets and expects the bet to be taken. */
function bet(table: ReturnType<typeof slot>['table'], medals: number, stops: Stops): Round {
  const placed = table.bet(medals, stops);
  if (!placed.ok) throw new Error(`the bet was refused: ${placed.why}`);
  return placed.round;
}

/** A page lost without a word, as when a tab crashes: whatever lock it held is let go, and nothing else happens. */
function crash(browser: FakeBrowser, page: FakePage) {
  page.closed = true;
  browser.pages = browser.pages.filter((other) => other !== page);
  if (browser.holder === page) browser.holder = null;
}

describe('the medals a spin bets and wins', () => {
  it('pays exactly what the engine says, times the medals bet, and the odds are the ones the machine has always had', () => {
    expect(BET_OPTIONS).toEqual([1, 2, 3]);
    expect(paylineOf(JACKPOT)).toEqual(['seven', 'seven', 'seven']);
    expect(paylineOf(CHERRY)[0]).toBe('cherry');
    for (const medals of BET_OPTIONS) {
      expect(winOf({ bet: medals, stops: JACKPOT })).toBe(1000 * medals);
      expect(winOf({ bet: medals, stops: CHERRY })).toBe(2 * medals);
      expect(winOf({ bet: medals, stops: LOSS })).toBe(0);
    }
    // Medals change the units, not the machine: the exact return is the same 249,724 of every 262,144.
    const odds = analyzeMachine();
    expect(odds.totalReturn).toBe(249_724);
    expect(odds.totalWays).toBe(TOTAL_WAYS);
    expect(isBet(4)).toBe(false);
    expect(isBet(0)).toBe(false);
    expect(isBet(1.5)).toBe(false);
  });

  it('takes the stake once as the lever is pulled, and pays the win once as the reels stop', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table, events } = slot(page);
    await quiet(browser);
    expect(events).toEqual(['granted']);
    expect(table.holding()).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME);

    const round = bet(table, 3, JACKPOT);
    expect(storedBalance(browser)).toBe(WELCOME - 3);
    expect(storedRound(browser)).toEqual({ ...round, paid: false });
    expect(round).toMatchObject({ bet: 3, stops: JACKPOT, owner: null, era: 0, tab: 'taba', paid: false });

    expect(table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 3000);
    expect(storedRound(browser)).toBeNull();
    // However often it is said again, it is not paid again.
    expect(table.finish(round)).toBe(true);
    expect(table.payDue()).toBeNull();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 2997);

    const lost = bet(table, 2, LOSS);
    expect(table.finish(lost)).toBe(true);
    const small = bet(table, 1, CHERRY);
    expect(table.finish(small)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME + 2997 - 2 - 1 + 2);
    expect(page.bank.getState().balance).toBe(WELCOME + 2996);
  });

  it('refuses a bet the machine does not take, one the medals do not cover, and a second while the first is unpaid', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table } = slot(page);
    await quiet(browser);
    expect(table.bet(4, LOSS)).toEqual({ ok: false, why: 'bet' });
    expect(table.bet(0, LOSS)).toEqual({ ok: false, why: 'bet' });
    // Down to two medals: three cannot be bet, two can.
    expect(page.bank.take(WELCOME - 2)).toBe(true);
    expect(table.bet(3, LOSS)).toEqual({ ok: false, why: 'medals' });
    expect(storedRound(browser)).toBeNull();
    const round = bet(table, 2, LOSS);
    expect(storedBalance(browser)).toBe(0);
    // With nothing left, nothing more can be bet.
    expect(table.bet(1, LOSS)).toEqual({ ok: false, why: 'medals' });
    table.finish(round);
    expect(storedBalance(browser)).toBe(0);
    // A round written down and not paid, which this page cannot pay (another player's era, say), blocks the next bet.
    page.bank.give(5);
    browser.storage.set(ROUND_KEY, serializeRound({ v: 1, id: 'later', tab: 'taba', owner: null, era: 7, bet: 1, stops: JACKPOT, paid: false }));
    expect(table.bet(1, LOSS)).toEqual({ ok: false, why: 'unpaid' });
    expect(storedBalance(browser)).toBe(5);
  });
});

describe('the medals out on a spin', () => {
  it('are out while the reels spin, and none are once they stop, on a loss as on a win', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table } = slot(page);
    await quiet(browser);
    const out = () => medalsOutAt(stored(browser)!);
    for (const stops of [LOSS, CHERRY]) {
      const round = bet(table, 1, stops);
      expect(out()).toEqual(['slot-machine']);
      expect(page.bank.getState().out).toEqual(['slot-machine']);
      expect(table.finish(round)).toBe(true);
      expect(out()).toEqual([]);
    }
  });
});

describe('a round in progress when the page goes', () => {
  it('resumes after a reload: the page going pays it while it still holds the card, and the same tab shows it again, paid once', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = slot(first, 'taba');
    await quiet(browser);
    const round = bet(one.table, 1, JACKPOT);
    expect(storedBalance(browser)).toBe(WELCOME - 1);
    // The reload: the page is left (pagehide) before its reels have stopped.
    first.hide('left');
    expect(one.events.at(-1)).toBe('yielding left');
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 1000);
    expect(storedRound(browser)).toEqual({ ...round, paid: true });
    first.close();

    // The tab comes back with the same name (it is kept in the tab's own storage), and is shown its spin again.
    const again = browser.open();
    const two = slot(again, 'taba');
    await quiet(browser);
    expect(two.table.leftover()).toEqual({ ...round, paid: true });
    expect(two.table.finish(round)).toBe(true);
    expect(storedRound(browser)).toBeNull();
    expect(two.table.leftover()).toBeNull();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 1000);

    // Nothing is paid again by anyone, however many pages open after.
    const third = browser.open();
    const three = slot(third, 'tabc');
    await quiet(browser);
    expect(three.table.payDue()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME + 999);
  });

  it('pays a round whose page was lost without a word (a crash) when the next page of the machine holds the card, once', async () => {
    const browser = new FakeBrowser();
    const lost = browser.open();
    const one = slot(lost, 'taba');
    await quiet(browser);
    const round = bet(one.table, 2, JACKPOT);
    crash(browser, lost);
    expect(storedBalance(browser)).toBe(WELCOME - 2);
    expect(storedRound(browser)?.paid).toBe(false);

    // Another tab's machine finds it and pays it, but does not show it: it was not its spin.
    const other = browser.open();
    const two = slot(other, 'tabb');
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 2 + 2000);
    expect(storedRound(browser)).toEqual({ ...round, paid: true });
    expect(two.table.leftover()).toBeNull();

    // The lost tab, reopened, shows it, and nothing is paid twice.
    const back = browser.open();
    const three = slot(back, 'taba');
    await quiet(browser);
    expect(three.table.leftover()?.id).toBe(round.id);
    three.table.finish(round);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 1998);
    expect(storedRound(browser)).toBeNull();
  });

  it('pays a lost page’s round in the same tab after a reload, when nothing paid it as the page went', async () => {
    const browser = new FakeBrowser();
    const lost = browser.open();
    const one = slot(lost, 'taba');
    await quiet(browser);
    const round = bet(one.table, 3, CHERRY);
    crash(browser, lost);
    const back = browser.open();
    const two = slot(back, 'taba');
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 6);
    expect(two.table.leftover()).toEqual({ ...round, paid: true });
    expect(two.table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME + 3);
  });
});

describe('the card', () => {
  it('pays the round as the card goes to a machine in another tab, takes no bet without it, and has it back with Play here', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = slot(first, 'taba');
    await quiet(browser);
    const round = bet(one.table, 1, JACKPOT);

    const second = browser.open();
    const two = slot(second, 'tabb');
    await quiet(browser);
    // The first machine was paid as the card left it, and waits: "playing in another tab — Play here".
    expect(one.events).toEqual(['granted', 'yielding moment']);
    expect(first.bank.getState().card).toBe('away');
    expect(one.table.holding()).toBe(false);
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 1000);
    expect(one.table.bet(1, LOSS)).toEqual({ ok: false, why: 'card' });
    // Its reels stop later: nothing more is paid.
    expect(one.table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME + 999);

    // The second machine plays on with the same medals.
    expect(two.table.holding()).toBe(true);
    expect(second.bank.getState().balance).toBe(WELCOME + 999);
    const there = bet(two.table, 3, LOSS);
    two.table.finish(there);
    expect(storedBalance(browser)).toBe(WELCOME + 996);

    // Back to the first: it has the card, and the second waits.
    one.table.play();
    await quiet(browser);
    expect(one.table.holding()).toBe(true);
    expect(two.table.holding()).toBe(false);
    expect(second.bank.getState().card).toBe('away');
    expect(first.bank.getState().balance).toBe(WELCOME + 996);
    const here = bet(one.table, 1, CHERRY);
    one.table.finish(here);
    expect(storedBalance(browser)).toBe(WELCOME + 997);
  });

  it('pays the round under way when the machine is put away mid-spin, as when the player goes to another page of the site', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const one = slot(page, 'taba');
    await quiet(browser);
    const round = bet(one.table, 2, JACKPOT);
    // The play tab is taken down (a client-side navigation): it gets up from the bank with the card still in hand.
    one.getUp();
    expect(storedBalance(browser)).toBe(WELCOME - 2 + 2000);
    expect(storedRound(browser)).toEqual({ ...round, paid: true });
    await quiet(browser);
    expect(hub.bank.getState().balance).toBe(WELCOME + 1998);
    // Coming back to it in the same tab shows the spin the player did not see stop, and pays nothing more.
    const back = slot(page, 'taba');
    await quiet(browser);
    expect(back.table.leftover()?.id).toBe(round.id);
    back.table.finish(round);
    expect(storedRound(browser)).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME + 1998);
  });

  it('never writes or removes a round without the card: a stale tab cannot remove the round another tab has just written', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const touched: string[] = [];
    // The first tab's storage, which notes every write and removal it makes.
    const watched: TableStorage = {
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
    const one = slot(first, 'taba', watched);
    await quiet(browser);
    const mine = bet(one.table, 1, CHERRY);
    const second = browser.open();
    const two = slot(second, 'tabb');
    await quiet(browser);
    expect(one.table.holding()).toBe(false);
    // The second tab bets before the first tab's reels have stopped.
    const theirs = bet(two.table, 3, JACKPOT);
    touched.length = 0;
    // The first tab's reels stop now, and it may still be reading what it wrote itself: whatever it reads, it touches nothing.
    browser.storage.set(ROUND_KEY, serializeRound({ ...mine, paid: true }));
    expect(one.table.finish(mine)).toBe(true);
    expect(touched).toEqual([]);
    browser.storage.set(ROUND_KEY, serializeRound(theirs));
    // The second tab's round is whole, and pays when its reels stop.
    expect(two.table.finish(theirs)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 1 + 2 - 3 + 3000);
    expect(storedRound(browser)).toBeNull();
  });

  it('clears a round shown without the card the next time it holds the card, and does not show it again', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = slot(first, 'taba');
    await quiet(browser);
    const round = bet(one.table, 1, JACKPOT);
    const second = browser.open();
    slot(second, 'tabb');
    await quiet(browser);
    // Paid as the card went; its reels stop afterwards, with the card in the other tab: it stays written down for now.
    expect(one.table.finish(round)).toBe(true);
    expect(storedRound(browser)).toEqual({ ...round, paid: true });
    expect(one.table.leftover()).toBeNull();
    one.table.play();
    await quiet(browser);
    expect(one.table.holding()).toBe(true);
    expect(storedRound(browser)).toBeNull();
    expect(one.table.leftover()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME + 999);
  });

  it('lends the card to the medal center’s front for a moment mid-spin: the round is paid once, around the day’s bonus', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const { table, events } = slot(page);
    await quiet(browser);
    const round = bet(table, 2, CHERRY);
    hub.bank.claimBonus();
    await quiet(browser);
    expect(events).toEqual(['granted', 'yielding moment', 'granted']);
    expect(table.holding()).toBe(true);
    const bonus = storedBalance(browser)! - (WELCOME - 2 + 4);
    expect(bonus).toBeGreaterThan(0);
    expect(table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 2 + 4 + bonus);
  });

  it('pays a round once in a browser that cannot keep its tabs apart, whichever tab settles it', async () => {
    const browser = new FakeBrowser();
    browser.apart = false;
    const [first, second] = [browser.open(), browser.open()];
    const one = slot(first, 'taba');
    const two = slot(second, 'tabb');
    await quiet(browser);
    const round = bet(one.table, 1, JACKPOT);
    // The other tab plays as though it held the card too, and settles the first tab's round when it next looks.
    expect(two.table.payDue()?.id).toBe(round.id);
    expect(storedRound(browser)).toEqual({ ...round, paid: true });
    // The first tab's reels stop: the round is written down as paid, so it pays nothing more. (Settling, the first tab
    // reads the medals again, the second tab's pay among them.)
    const before = storedBalance(browser);
    expect(before).toBe(WELCOME - 1 + 1_000);
    expect(one.table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(before);
    expect(first.bank.balance()).toBe(before);
    expect(storedRound(browser)).toBeNull();
    expect(two.table.payDue()).toBeNull();
    expect(one.table.payDue()).toBeNull();
    // (Two such tabs can still lose a medal to each other in the bank itself, as bank.ts says: that is not the round's.)
  });
});

describe('a player who signs out and in again mid-spin', () => {
  it('pays the round into their own medals once they are back, and never shows or counts it a second time', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const page = browser.open();
    page.bank.attend(signedIn(UID), accounts.store);
    const { table } = slot(page, 'taba');
    await quiet(browser);
    expect(page.bank.owner()).toBe(UID);
    const before = page.bank.balance();
    const round = bet(table, 1, JACKPOT);
    expect(round.owner).toBe(UID);

    // Signed out while the reels turn: the guest's medals are on the table, and the round is not theirs to be paid.
    page.bank.attend(GUEST_PLAYER, accounts.store);
    await quiet(browser);
    expect(page.bank.owner()).toBeNull();
    expect(table.finish(round)).toBe(false);
    expect(storedBalance(browser, UID)).toBe(before - 1);
    expect(page.bank.getState().balance).toBe(WELCOME);
    expect(table.leftover()).toBeNull();

    // Back in, with the machine still open: it is paid into their medals, once, and is not shown again.
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.owner()).toBe(UID);
    expect(table.payDue()?.id).toBe(round.id);
    expect(table.leftover()).toBeNull();
    expect(storedRound(browser, UID)).toBeNull();
    expect(table.payDue()).toBeNull();
    await quiet(browser);
    expect(storedBalance(browser, UID)).toBe(before - 1 + 1000);
  });
});

describe('the reset at the medal center', () => {
  it('voids the round under way, starts the machine over, and notes that this device’s machine has started over', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const { table, events } = slot(page);
    await quiet(browser);
    page.bank.give(500);
    const round = bet(table, 3, JACKPOT);
    hub.bank.reset();
    await quiet(browser);
    expect(events).toContain('restart');
    expect(stored(browser)?.era).toBe(1);
    // Every medal of the era before is gone, the ones on the reels with them: a new member's medals, nothing more.
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(storedRound(browser)).toBeNull();
    expect(table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(SLOT_GAME)).toBe(false);
    const ledger = stored(browser)!;
    expect(ledger.restarted[`${SLOT_GAME}@${ledger.device}`]).toBe(1);
    // It plays on in the new era.
    const next = bet(table, 1, CHERRY);
    expect(next.era).toBe(1);
    table.finish(next);
    expect(storedBalance(browser)).toBe(WELCOME + 1);
  });

  it('starts over when it is opened after a reset made while it was closed, and never pays a round from before it', async () => {
    const browser = new FakeBrowser();
    const lost = browser.open();
    const one = slot(lost, 'taba');
    await quiet(browser);
    bet(one.table, 3, JACKPOT);
    crash(browser, lost);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);

    const back = browser.open();
    const two = slot(back, 'taba');
    await quiet(browser);
    expect(two.events).toEqual(['restart', 'granted']);
    expect(storedRound(browser)).toBeNull();
    expect(two.table.leftover()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(back.bank.restartDue(SLOT_GAME)).toBe(false);
    // And not again the next time it is opened.
    two.getUp();
    const later = browser.open();
    const three = slot(later, 'taba');
    await quiet(browser);
    expect(three.events).toEqual(['granted']);
  });
});

describe('what was kept before', () => {
  it('ignores anything under the round’s name that is not a round, and anything the machine kept before, and adds no medals for it', async () => {
    const browser = new FakeBrowser();
    // The slot machine never saved its old count, but nothing a device holds under these names may break it or pay.
    browser.storage.set('slot-machine', JSON.stringify({ credits: 500, stats: { spins: 12 } }));
    browser.storage.set(ROUND_KEY, JSON.stringify({ credits: 500 }));
    const page = browser.open();
    const { table } = slot(page);
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(table.current()).toBeNull();
    expect(table.leftover()).toBeNull();
    const round = bet(table, 1, LOSS);
    expect(table.finish(round)).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 1);
    expect(browser.storage.get('slot-machine')).toContain('"credits":500');
  });

  it('reads back only a whole round, as written', () => {
    const round: Round = { v: 1, id: 'abc123', tab: 'taba', owner: null, era: 2, bet: 3, stops: [1, 2, 3], paid: false };
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
      JSON.stringify({ ...round, bet: 10 }),
      JSON.stringify({ ...round, bet: '3' }),
      JSON.stringify({ ...round, stops: [0, 0] }),
      JSON.stringify({ ...round, stops: [0, 0, 22] }),
      JSON.stringify({ ...round, stops: [0, -1, 0] }),
      JSON.stringify({ ...round, era: -1 }),
      JSON.stringify({ ...round, era: 1.5 }),
      JSON.stringify({ ...round, paid: 'yes' }),
      JSON.stringify({ ...round, id: 'Not A Name!' }),
      JSON.stringify({ ...round, tab: '' }),
      JSON.stringify({ ...round, owner: 7 }),
      'x'.repeat(5_000),
    ];
    for (const text of broken) expect(parseRound(text)).toBeNull();
  });

  it('leaves another player’s round alone: it is paid only into that player’s medals', async () => {
    const browser = new FakeBrowser();
    const theirs: Round = { v: 1, id: 'theirs1', tab: 'taba', owner: 'test-player-1', era: 0, bet: 1, stops: JACKPOT, paid: false };
    browser.storage.set(roundKey('test-player-1'), serializeRound(theirs));
    // Written under the guest's name by mistake: still not the guest's to be paid.
    browser.storage.set(ROUND_KEY, serializeRound(theirs));
    const page = browser.open();
    const { table } = slot(page);
    await quiet(browser);
    expect(table.payDue()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(parseRound(browser.storage.get(roundKey('test-player-1')))).toEqual(theirs);
  });
});

describe('storage that keeps nothing', () => {
  it('holds the round on the page instead, and still takes the stake once and pays the win once', async () => {
    const browser = new FakeBrowser();
    browser.blocked = true;
    const page = browser.open();
    const { table } = slot(page);
    await quiet(browser);
    expect(table.holding()).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME);
    const round = bet(table, 2, JACKPOT);
    expect(page.bank.balance()).toBe(WELCOME - 2);
    expect(table.current()?.id).toBe(round.id);
    expect(table.finish(round)).toBe(true);
    expect(table.finish(round)).toBe(true);
    expect(page.bank.balance()).toBe(WELCOME - 2 + 2000);
    expect(table.current()).toBeNull();
  });

  it('remembers on the device that the player has read the note, and does not throw where it cannot', () => {
    const kept = new Map<string, string>();
    const storage: TableStorage = { read: (key) => kept.get(key) ?? null, write: (key, text) => kept.set(key, text), remove: (key) => kept.delete(key) };
    expect(noticeRead(storage)).toBe(false);
    markNoticeRead(storage);
    expect(kept.get(NOTICE_KEY)).toBe('1');
    expect(noticeRead(storage)).toBe(true);
    const blocked: TableStorage = {
      read: () => {
        throw new Error('blocked');
      },
      write: () => {
        throw new Error('blocked');
      },
      remove: () => {
        throw new Error('blocked');
      },
    };
    expect(noticeRead(blocked)).toBe(false);
    expect(() => markNoticeRead(blocked)).not.toThrow();
  });
});

describe('a browser that dies between two writes', () => {
  // The round and the medals are two writes (medals.ts): the browser is killed at every moment between them, started
  // again, and the machine opened again in the same tab. Every spin is paid exactly once, or, if its stake never went
  // in, never happened at all.

  /** A browser with the machine open and holding the card, the medals read. */
  const opened = async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const machine = slot(page, 'taba');
    await quiet(browser);
    return { browser, page, ...machine };
  };
  const machines = new Map<FakeBrowser, Awaited<ReturnType<typeof opened>>>();
  const setUp = async () => {
    const at = await opened();
    machines.set(at.browser, at);
    return at.browser;
  };

  /** What the browser left, opened again: the machine pays what it owes as it is given the card, and shows this tab's spin. */
  async function reopened(after: FakeBrowser) {
    const page = after.open();
    const machine = slot(page, 'taba');
    await quiet(after);
    const shown = machine.table.leftover();
    if (shown) machine.table.finish(shown);
    await quiet(after);
    return { page, ...machine };
  }

  for (const [what, stops] of [
    ['a 7-7-7', JACKPOT],
    ['a spin that wins nothing', LOSS],
  ] as const) {
    it(`pays ${what} exactly once, or takes nothing for it, wherever the browser dies in a spin`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const { table } = machines.get(browser)!;
          const round = bet(table, 3, stops);
          table.finish(round);
        },
        async (after, reached) => {
          const before = stored(after)!;
          const staked = before.rows[before.device]?.spent === 3;
          const { table } = await reopened(after);
          expect(storedBalance(after), `died after ${reached} writes`).toBe(staked ? WELCOME - 3 + winOf({ bet: 3, stops }) : WELCOME);
          const left = storedRound(after);
          expect(left === null || left.paid, `died after ${reached} writes`).toBe(true);
          // Another spin, played through: every receipt is let go of once nothing needs it.
          bet(table, 1, LOSS);
          table.finish(table.current()!);
          const ledger = stored(after)!;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([]);
          expect(balanceOf(ledger)).toBe((staked ? WELCOME - 3 + winOf({ bet: 3, stops }) : WELCOME) - 1);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(4);
    });
  }

  it('pays a spin exactly once wherever the browser dies while the page going pays it, and the tab shows it again', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        const { table, page } = machines.get(browser)!;
        bet(table, 2, JACKPOT);
        // A reload: the page going pays the spin before the card goes.
        page.hide('left');
      },
      async (after, reached) => {
        const before = stored(after)!;
        const staked = before.rows[before.device]?.spent === 2;
        const back = after.open();
        const { table } = slot(back, 'taba');
        await quiet(after);
        const shown = table.leftover();
        expect(shown !== null, `died after ${reached} writes`).toBe(staked);
        if (shown) expect(table.finish(shown)).toBe(true);
        expect(storedBalance(after), `died after ${reached} writes`).toBe(staked ? WELCOME - 2 + 2000 : WELCOME);
      },
    );
  });

  it('takes a round from before receipts at its word: its stake was taken, and its win is paid once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    // As the machine wrote it before receipts: stake taken, round written, reels still turning.
    const opener = slot(page, 'taba');
    await quiet(browser);
    page.bank.take(3);
    const old: Round = { v: 1, id: 'old0001', tab: 'taba', owner: null, era: 0, bet: 3, stops: JACKPOT, paid: false };
    browser.storage.set(roundKey(null), serializeRound(old));
    expect(opener.table.payDue()?.id).toBe('old0001');
    expect(storedBalance(browser)).toBe(WELCOME - 3 + 3000);
    expect(opener.table.payDue()).toBeNull();
    expect(storedRound(browser)).toEqual({ ...old, paid: true });
  });
});
