import { describe, expect, it } from 'vitest';

import { slotFor } from '@/components/game/MedalPusher/account';
import { BANK_KEY, ledgerKey, type SeatHandlers } from '@/components/game/MedalCenter/bank';
import { CENTER, parseHistory, recordsOf, serializeHistory, createHistory, totalsOf, type History } from '@/components/game/MedalCenter/history';
import { HISTORY_CHECK_AFTER, HISTORY_KEY, HISTORY_LOOK_EVERY, HISTORY_SEND_EVERY, historyKey } from '@/components/game/MedalCenter/historyStore';
import { WELCOME, balanceOf, createLedger, give, parseLedger, serializeLedger } from '@/components/game/MedalCenter/ledger';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';
import { FakeBrowser, quiet, type FakePage } from './bankFakes';

// The medals' history as the bank keeps it (historyStore.ts), in a fake browser (bankFakes.ts) with fake accounts:
// what is written when, by which tab, through a reload, across a sign-in and between devices; and that nothing in it
// moves a medal. Nothing is fetched and no real account is named.

const UID = 'test-player-1';
const GUEST = { uid: null, settled: true, expected: false };

/** A page with a machine of `game` on it, at the bank. */
function machine(page: FakePage, game = 'roulette') {
  const handlers: SeatHandlers = { granted: () => undefined, yielding: () => undefined };
  return page.bank.sit(game, handlers);
}

/** Lets `seconds` go by, second by second: the clocks move on, every page's timer ticks, and what follows happens. */
async function pass(seconds: number, browsers: FakeBrowser[], pages: FakePage[]): Promise<void> {
  for (let second = 0; second < seconds; second++) {
    for (const browser of browsers) browser.clock += 1000;
    for (const page of pages) if (!page.closed) page.watchers?.tick();
    await quiet(...browsers);
  }
}

/** Plays a round of roulette on a page that holds the card: the stake, and what came back. */
function spin(page: FakePage, round: string, bet: number, won: number, game = 'roulette') {
  expect(page.bank.apply({ game, round, step: 'stake', medals: -bet })).toBe('applied');
  expect(page.bank.apply({ game, round, step: 'pay', medals: won })).toBe('applied');
}

const shown = (page: FakePage): History | null => page.bank.historyState().history;
const stored = (browser: FakeBrowser, uid: string | null = null): History | null => parseHistory(browser.storage.get(historyKey(uid)) ?? null);
const storedMedals = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const rounds = (history: History | null) => (history ? totalsOf(recordsOf(history)) : null);

describe('the history of the medals in one browser', () => {
  it('writes a round as it is played, beside the medals and without touching them, and has it again after a reload', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    page.bank.watchHistory(() => undefined);
    machine(page);
    await quiet(browser);
    spin(page, 'spin0001', 5, 35);
    expect(page.bank.balance()).toBe(WELCOME - 5 + 35);
    expect(shown(page)?.entries).toEqual([expect.objectContaining({ g: 'roulette', r: 'spin0001', k: 'round', bet: 5, won: 35, left: WELCOME + 30, done: 1 })]);
    // Written with the card: a couple of seconds on, or when the page lets it go, whichever is first.
    await pass(2, [browser], [page]);
    expect(stored(browser)?.entries).toHaveLength(1);
    page.close();
    const again = browser.open();
    again.bank.watchHistory(() => undefined);
    await quiet(browser);
    expect(again.bank.historyState()).toMatchObject({ loaded: true, owner: null, where: 'device' });
    expect(rounds(shown(again))).toEqual({ rounds: 1, bet: 5, won: 35 });
    expect(storedMedals(browser)).toBe(WELCOME + 30);
  });

  it('writes what is left unwritten as the page is hidden, since the card goes with it', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    machine(page);
    await quiet(browser);
    spin(page, 'spin0001', 2, 0);
    expect(stored(browser)).toBeNull();
    page.hide();
    await quiet(browser);
    expect(stored(browser)?.entries).toHaveLength(1);
  });

  it('writes the counter’s bonus, refill and reset once each, and what the reset threw away', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.watchHistory(() => undefined);
    const table = browser.open();
    machine(table);
    await quiet(browser);
    hub.bank.claimBonus();
    await pass(1, [browser], [hub, table]);
    browser.clock += 1000;
    table.bank.take(table.bank.balance());
    expect(table.bank.refill()).toBe(true);
    await pass(1, [browser], [hub, table]);
    browser.clock += 1000;
    hub.bank.reset();
    await pass(2, [browser], [hub, table]);
    const kinds = stored(browser)?.entries.filter((entry) => entry.g === CENTER).map((entry) => [entry.k, entry.bet, entry.won]);
    expect(kinds).toEqual([
      ['reset', WELCOME, WELCOME],
      ['refill', 0, WELCOME],
      ['bonus', 0, 30],
    ]);
    expect(storedMedals(browser)).toBe(WELCOME);
  });

  it('shows another tab what a machine in this one played, which only the tab holding the card writes', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.watchHistory(() => undefined);
    const table = browser.open();
    machine(table);
    await quiet(browser);
    spin(table, 'spin0001', 3, 0);
    browser.clock += 1000;
    spin(table, 'spin0002', 3, 9);
    await pass(2, [browser], [hub, table]);
    expect(rounds(shown(hub))).toEqual({ rounds: 2, bet: 6, won: 9 });
    expect(shown(hub)?.entries.map((entry) => entry.r)).toEqual(['spin0002', 'spin0001']);
  });

  it('hears what a machine says itself: a roll of the craps table, and the Medal Pusher’s medals fed and won', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    page.bank.watchHistory(() => undefined);
    machine(page, 'craps');
    await quiet(browser);
    // The table's chips move as moves of its own, which are not rounds.
    expect(page.bank.apply({ game: 'craps', round: 'table00001-1', step: 'move', medals: -10 })).toBe('applied');
    page.bank.played({ game: 'craps', round: 'table00001-r1', bet: 10, won: 20 });
    page.bank.played({ game: 'medal-pusher', fed: 12, won: 7, prize: 0, jackpots: [] });
    const records = recordsOf(shown(page)!);
    expect(records.find((row) => row.game === 'craps')).toMatchObject({ rounds: 1, bet: 10, won: 20 });
    expect(records.find((row) => row.game === 'medal-pusher')).toMatchObject({ rounds: 0, bet: 12, won: 7 });
    expect(shown(page)?.entries.map((entry) => entry.k).sort()).toEqual(['play', 'round']);
  });

  it('puts aside a history this version cannot read and begins again: no medal is touched', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(HISTORY_KEY, '{"v":99,"from":"a later version"}');
    const page = browser.open();
    machine(page);
    await quiet(browser);
    spin(page, 'spin0001', 4, 8);
    page.hide();
    await quiet(browser);
    expect(browser.storage.get(`${HISTORY_KEY}#unread`)).toBe('{"v":99,"from":"a later version"}');
    expect(stored(browser)?.entries).toHaveLength(1);
    expect(storedMedals(browser)).toBe(WELCOME + 4);
  });

  it('loses at most the last of the history, never a medal, when the browser dies between the medals’ write and the history’s', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    machine(page);
    await quiet(browser);
    browser.writesLeft = 2;
    spin(page, 'spin0001', 4, 8);
    // Both moves of the medals reached storage; the history had not been written yet when the browser died.
    const revived = browser.revive();
    expect(storedMedals(revived)).toBe(WELCOME + 4);
    expect(stored(revived)).toBeNull();
  });
});

describe('the history of a player who is signed in', () => {
  const setup = () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const histories = new FakeAccounts(() => browser.clock);
    browser.historyAccounts = histories.store;
    return { browser, accounts, histories };
  };

  it('goes with the guest’s medals into an account that had none, leaves the guest’s place, and reaches the account', async () => {
    const { browser, accounts, histories } = setup();
    const page = browser.open();
    page.bank.watchHistory(() => undefined);
    machine(page);
    await quiet(browser);
    spin(page, 'spin0001', 5, 0);
    page.bank.attend(signedIn(UID), accounts.store);
    await pass(3, [browser], [page]);
    expect(page.bank.historyState()).toMatchObject({ loaded: true, owner: UID, where: 'account' });
    expect(rounds(shown(page))).toEqual({ rounds: 1, bet: 5, won: 0 });
    expect(browser.storage.has(BANK_KEY)).toBe(false);
    expect(browser.storage.has(HISTORY_KEY)).toBe(false);
    expect(rounds(stored(browser, UID))).toEqual({ rounds: 1, bet: 5, won: 0 });
    expect(rounds(parseHistory(histories.text(UID)))).toEqual({ rounds: 1, bet: 5, won: 0 });
    // Played on as the account's: it is the account's history that grows.
    spin(page, 'spin0002', 5, 20);
    await pass(HISTORY_SEND_EVERY + HISTORY_LOOK_EVERY + 5, [browser], [page]);
    expect(rounds(parseHistory(histories.text(UID)))).toEqual({ rounds: 2, bet: 10, won: 20 });
  });

  it('stays the guest’s when the account has medals of its own, as the guest’s medals do', async () => {
    const { browser, accounts } = setup();
    accounts.put(UID, serializeLedger(give(createLedger('laptop0001'), 4000)), 'm-elsewhere');
    const page = browser.open();
    page.bank.watchHistory(() => undefined);
    machine(page);
    await quiet(browser);
    spin(page, 'spin0001', 5, 0);
    page.bank.attend(signedIn(UID), accounts.store);
    await pass(3, [browser], [page]);
    expect(page.bank.historyState().owner).toBe(UID);
    expect(shown(page)?.entries).toEqual([]);
    expect(rounds(stored(browser))).toEqual({ rounds: 1, bet: 5, won: 0 });
    page.bank.attend(GUEST, accounts.store);
    await pass(2, [browser], [page]);
    expect(page.bank.historyState().owner).toBeNull();
    expect(rounds(shown(page))).toEqual({ rounds: 1, bet: 5, won: 0 });
  });

  it('joins what two devices played through the account, each once', async () => {
    const accounts = new FakeAccounts(() => 0);
    const histories = new FakeAccounts(() => 0);
    accounts.put(UID, serializeLedger(createLedger('first00001', 500)), 'm-start');
    const phone = new FakeBrowser();
    const laptop = new FakeBrowser();
    const pages = [phone, laptop].map((browser) => {
      browser.historyAccounts = histories.store;
      const page = browser.open();
      page.bank.watchHistory(() => undefined);
      page.bank.attend(signedIn(UID), accounts.store);
      machine(page);
      return page;
    });
    await quiet(phone, laptop);
    spin(pages[0], 'phone001', 10, 30);
    spin(pages[1], 'laptop01', 7, 0);
    // Both send at the same moment, and the one whose read came before the other's write writes over it. Each reads
    // the account again a little after its write, and sends again what it finds missing.
    await pass(HISTORY_SEND_EVERY + HISTORY_LOOK_EVERY + HISTORY_CHECK_AFTER / 1000 + 15, [phone, laptop], pages);
    const onAccount = parseHistory(histories.text(UID));
    expect(rounds(onAccount)).toEqual({ rounds: 2, bet: 17, won: 30 });
    expect(new Set(onAccount?.entries.map((entry) => entry.d)).size).toBe(2);
    // The laptop opened again has the account's history: both devices' rounds, each once.
    pages[1].close();
    const again = laptop.open();
    again.bank.watchHistory(() => undefined);
    again.bank.attend(signedIn(UID), accounts.store);
    await pass(2, [phone, laptop], [pages[0], again]);
    expect(rounds(shown(again))).toEqual({ rounds: 2, bet: 17, won: 30 });
  });

  it('sends nothing as a player who has signed out', async () => {
    const { browser, accounts, histories } = setup();
    const page = browser.open();
    page.bank.watchHistory(() => undefined);
    page.bank.attend(signedIn(UID), accounts.store);
    machine(page);
    await pass(3, [browser], [page]);
    spin(page, 'spin0001', 1, 2);
    page.bank.attend(GUEST, accounts.store);
    await quiet(browser);
    const writes = histories.count('store');
    spin(page, 'spin0002', 1, 2);
    page.hide();
    page.show();
    await pass(HISTORY_SEND_EVERY * 2, [browser], [page]);
    expect(histories.count('store')).toBe(writes);
    // What the account's history had not had stays on this device, in its own place, for the next time.
    expect(shown(page)?.entries.map((entry) => entry.r)).toEqual(['spin0002']);
    expect(stored(browser, UID)?.entries.map((entry) => entry.r)).toEqual(['spin0001']);
  });

  it('leaves a history on the account that this version cannot read exactly as it is', async () => {
    const { browser, accounts, histories } = setup();
    const unreadable = JSON.stringify({ v: 99, device: 'later00001' });
    histories.put(UID, unreadable, 'm-later');
    const page = browser.open();
    page.bank.watchHistory(() => undefined);
    page.bank.attend(signedIn(UID), accounts.store);
    machine(page);
    await pass(3, [browser], [page]);
    spin(page, 'spin0001', 1, 2);
    await pass(HISTORY_SEND_EVERY + 5, [browser], [page]);
    expect(page.bank.historyState().where).toBe('unreadable');
    expect(histories.text(UID)).toBe(unreadable);
    expect(rounds(shown(page))).toEqual({ rounds: 1, bet: 1, won: 2 });
  });

  it('keeps the account’s copy in the keeper’s own place on this device, apart from the history the card writes', async () => {
    const { browser, accounts, histories } = setup();
    histories.put(UID, serializeHistory({ ...createHistory('elsewhere1', 1_700_000_000_000) }), 'm-old');
    const page = browser.open();
    page.bank.watchHistory(() => undefined);
    page.bank.attend(signedIn(UID), accounts.store);
    machine(page);
    await pass(3, [browser], [page]);
    expect(browser.storage.has(slotFor(HISTORY_KEY, UID))).toBe(true);
    // The account's history began earlier than this device's: that is when the history began.
    expect(shown(page)?.since).toBe(1_700_000_000_000);
  });
});
