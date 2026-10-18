import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { betOdds, shoeOdds } from '@/components/game/Baccarat/analysis';
import {
  BET_IDS,
  PAYS,
  createShoe,
  dealHand,
  settleBet,
  type BetId,
  type Card,
  type Hand,
  type Mode,
  type Rank,
} from '@/components/game/Baccarat/engine';
import {
  BET_STEPS,
  COMMISSION_STEP,
  DEFAULT_MODE,
  GAME,
  NEW_TABLE,
  SPOT_MAX,
  TABLE_KEY,
  afterCoup,
  coupKey,
  createMedalTable,
  dealtInOrder,
  medalsBack,
  parseCoup,
  parseTable,
  pressAmount,
  refusal,
  replayHand,
  serializeCoup,
  serializeTable,
  stepFor,
  tableTakes,
  type Coup,
  type TableHooks,
  type TableStore,
} from '@/components/game/Baccarat/medals';
import { ledgerKey, type BankState } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, medalsOutAt, parseLedger, receiptsOf, resetLedger, serializeLedger } from '@/components/game/MedalCenter/ledger';
import { GUEST } from '@/components/game/MedalPusher/account';
import { BONUS_CARD } from '@/components/game/MedalPusher/records';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';

// The table at the medal bank, with a browser made of fakes (bankFakes.ts): one storage every page shares, the one
// card, and a channel between the pages. No real account, token or network is anywhere in it.

const UID = 'test-player-1';

/** A hand from its cards in dealing order: player, banker, player, banker, then the thirds. */
const hand = (...ranks: Rank[]): Hand => {
  const cards: Card[] = ranks.map((rank, i) => ({ rank, suit: (['♠', '♥', '♦', '♣'] as const)[i % 4] }));
  const made = replayHand(cards);
  if (!made) throw new Error(`not a hand: ${ranks.join(' ')}`);
  return made;
};

// A few hands that reach every way a bet can settle.
const BANKER_NATURAL = hand('2', '9', '3', 'K'); // P 5, B 9: a natural, nobody draws.
const PLAYER_WINS = hand('8', '2', 'K', '3'); // P 8 natural, B 5.
const TIE = hand('4', '4', '3', '3'); // 7 and 7, both stand.
const BANKER_THREE_CARD_7 = hand('2', '3', '3', 'K', 'K', '4'); // P 5 draws K → 5; B 3 draws 4 → 7.
const PAIRS = hand('5', '9', '5', '9'); // P 0 (pair), B 8 (pair): banker natural.
const PANDA = hand('2', 'K', '3', '6', '3'); // P 5 draws 3 → 8; B 6 stands against a 3: player wins with three cards.
const HANDS = [BANKER_NATURAL, PLAYER_WINS, TIE, BANKER_THREE_CARD_7, PAIRS, PANDA];

/** The bank as storage has it: what every page of the browser sees. */
const storedBalance = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};

const storeOf = (browser: FakeBrowser): TableStore => ({
  read: (key) => browser.storage.get(key) ?? null,
  write: (key, text) => {
    browser.storage.set(key, text);
    return true;
  },
  remove: (key) => {
    browser.storage.delete(key);
  },
});

/** The device name of the medals a page has on the table, and the key its coups are written down under. */
const deviceOf = (page: FakePage): string => page.bank.getState().ledger!.device;
const keyOf = (page: FakePage): string => coupKey(deviceOf(page));

/** A page with the baccarat table on it, sitting at the bank, writing down what the table tells it. */
function tableOn(page: FakePage) {
  const told: string[] = [];
  let ids = 0;
  const hooks: TableHooks = {
    granted: (moved) => told.push(moved ? 'granted, moved' : 'granted'),
    yielding: (why) => told.push(`yielding ${why}`),
    paid: (coup, early) => told.push(`paid ${coup.returned}${early ? ' early' : ''}`),
    resumed: (coup, paid) => told.push(`${paid ? 'resumed' : 'dropped'} ${coup.returned}`),
  };
  const table = createMedalTable(page.bank, storeOf(page.browser), hooks, () => `${page.name}-coup-${++ids}`);
  table.sit();
  return { table, told };
}

/** A page that is killed without a word (the tab crashes): it lets nothing go and pays nothing, as a browser frees a dead page's lock. */
function kill(page: FakePage) {
  page.closed = true;
  page.watchers = null;
  const { browser } = page;
  browser.pages = browser.pages.filter((other) => other !== page);
  if (browser.holder === page) {
    browser.holder = null;
    const next = browser.queue.shift();
    if (next) browser.tasks.push(() => browser.give2(next));
  }
  browser.queue = browser.queue.filter((request) => request.page !== page);
}

describe('medal-sized bets', () => {
  it('has BET buttons of 1 to 100 medals and limits of 100 on the main bets and 20 on the others', () => {
    expect(BET_STEPS).toEqual([1, 5, 10, 20, 100]);
    expect(SPOT_MAX).toEqual({ player: 100, banker: 100, tie: 20, playerPair: 20, bankerPair: 20, dragon7: 20, panda8: 20 });
    // Every step a spot takes divides its limit, so a spot can be filled to the top.
    for (const mode of ['ez', 'commission'] as Mode[]) for (const id of BET_IDS) expect(SPOT_MAX[id] % stepFor(id, mode)).toBe(0);
    expect(DEFAULT_MODE).toBe('ez');
  });

  it('bets the Banker in twenties on the 5% table, and everything else in single medals', () => {
    expect(stepFor('banker', 'commission')).toBe(COMMISSION_STEP);
    expect(stepFor('banker', 'ez')).toBe(1);
    expect(stepFor('player', 'commission')).toBe(1);
    expect(BET_STEPS.map((chip) => pressAmount('banker', 'commission', chip))).toEqual([20, 20, 20, 20, 100]);
    expect(BET_STEPS.map((chip) => pressAmount('banker', 'ez', chip))).toEqual([1, 5, 10, 20, 100]);
  });

  it('says why a bet cannot go down: a spot this table lacks, a stake off its step, over the limit, or more than the medals held', () => {
    expect(refusal({}, 'dragon7', 1, 'commission', 100)).toBe('closed');
    expect(refusal({}, 'banker', 5, 'commission', 100)).toBe('step');
    expect(refusal({}, 'banker', 1.5, 'ez', 100)).toBe('step');
    expect(refusal({ tie: 15 }, 'tie', 10, 'ez', 100)).toBe('max');
    expect(refusal({ player: 95 }, 'player', 5, 'ez', 100)).toBeNull();
    expect(refusal({ player: 95 }, 'banker', 10, 'ez', 100)).toBe('medals');
    expect(refusal({}, 'banker', 20, 'commission', 20)).toBeNull();
    expect(tableTakes({ banker: 40, tie: 3 }, 'commission')).toBe(true);
    expect(tableTakes({ banker: 30 }, 'commission')).toBe(false);
    expect(tableTakes({ dragon7: 1 }, 'commission')).toBe(false);
    expect(tableTakes({ player: 101 }, 'ez')).toBe(false);
  });

  it('pays every bet the table takes in whole medals, on every kind of hand, at both tables', () => {
    for (const mode of ['ez', 'commission'] as Mode[]) {
      for (const id of BET_IDS) {
        if (id === 'dragon7' || id === 'panda8') {
          if (mode === 'commission') continue;
        }
        for (let stake = stepFor(id, mode); stake <= SPOT_MAX[id]; stake += stepFor(id, mode)) {
          for (const h of HANDS) {
            const exact = settleBet(id, stake, h, mode).returned;
            const { returned } = medalsBack({ [id]: stake }, h, mode);
            expect(Number.isInteger(returned)).toBe(true);
            // The engine's own figure, to well within a rounding: nothing is rounded away.
            expect(Math.abs(returned - exact)).toBeLessThan(1e-9);
          }
        }
      }
    }
  });

  it('pays a 5%-table Banker win 19 for every 20, so its house edge is the exact one on the Odds tab', () => {
    expect(BANKER_NATURAL.winner).toBe('banker');
    for (let stake = COMMISSION_STEP; stake <= SPOT_MAX.banker; stake += COMMISSION_STEP) {
      expect(medalsBack({ banker: stake }, BANKER_NATURAL, 'commission').returned).toBe(stake + (stake / 20) * 19);
    }
    // 19/20 is 0.95: the Odds tab's 1.058% (eight decks) is what this table charges, to the last digit.
    const odds = shoeOdds(8);
    const edge = -betOdds('banker', odds).ev;
    const bankerWin = odds.banker / odds.total;
    const lose = odds.player / odds.total;
    expect(edge).toBeCloseTo(lose - (19 / 20) * bankerWin, 15);
    expect((edge * 100).toFixed(3)).toBe('1.058');
    // And the EZ table: a three-card 7 pushes the Banker and pays Dragon 7 40:1.
    expect(medalsBack({ banker: 7, dragon7: 2 }, BANKER_THREE_CARD_7, 'ez').returned).toBe(7 + 2 * 41);
    expect(medalsBack({ banker: 20 }, BANKER_THREE_CARD_7, 'commission').returned).toBe(39);
  });

  it('returns the stakes of pushes and nothing for losses', () => {
    expect(TIE.winner).toBe('tie');
    expect(medalsBack({ player: 10, banker: 20 }, TIE, 'commission').returned).toBe(30);
    expect(medalsBack({ player: 10, tie: 2 }, TIE, 'ez').returned).toBe(10 + 2 * (PAYS.tie[0] + 1));
    expect(medalsBack({ player: 10 }, BANKER_NATURAL, 'ez').returned).toBe(0);
    expect(medalsBack({}, PLAYER_WINS, 'ez')).toEqual({ results: [], returned: 0 });
  });
});

describe('the table at the bank', () => {
  it('takes the stake once when the coup is dealt and gives back what it won once when it settles', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table, told } = tableOn(page);
    await quiet(browser);
    expect(told).toEqual(['granted']);
    expect(table.holding()).toBe(true);
    const coup = table.deal(10, 25);
    expect(coup).not.toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    // Written down before the stake was taken, under the medals' own device name, in case the page is killed before it can pay.
    expect(parseCoup(browser.storage.get(keyOf(page)))).toEqual({ id: coup!.id, owner: null, device: deviceOf(page), era: 0, stake: 10, returned: 25, spentBefore: 0, state: 'dealt', receipts: true });
    // A second coup is not dealt over one in flight.
    expect(table.deal(5, 0)).toBeNull();
    expect(table.settle(coup!.id)).toBe('paid');
    expect(storedBalance(browser)).toBe(WELCOME + 15);
    expect(browser.storage.has(keyOf(page))).toBe(false);
    // Once.
    expect(table.settle(coup!.id)).toBe('gone');
    table.resume();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 15);
    expect(told).toEqual(['granted', 'paid 25']);
  });

  it('is told the card is here only once the bank has published it', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const seen: BankState['card'][] = [];
    createMedalTable(page.bank, storeOf(browser), { granted: () => seen.push(page.bank.getState().card), yielding: () => undefined, paid: () => undefined, resumed: () => undefined }).sit();
    await quiet(browser);
    expect(seen).toEqual(['here']);
  });

  it('gives back the stake of a push, gives nothing for a loss, and writes nothing down for a hand dealt with no bets', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table } = tableOn(page);
    await quiet(browser);
    const push = table.deal(5, 5)!;
    table.settle(push.id);
    expect(storedBalance(browser)).toBe(WELCOME);
    const loss = table.deal(5, 0)!;
    table.settle(loss.id);
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    const none = table.deal(0, 0)!;
    expect(browser.storage.has(keyOf(page))).toBe(false);
    expect(table.settle(none.id)).toBe('paid');
    expect(storedBalance(browser)).toBe(WELCOME - 5);
  });

  it('deals nothing the medals do not cover, nothing without the card, and takes nothing when the coup cannot be written down', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table } = tableOn(page);
    expect(table.deal(1, 0)).toBeNull();
    await quiet(browser);
    expect(table.deal(WELCOME + 1, 0)).toBeNull();
    expect(table.deal(-1, 0)).toBeNull();
    expect(table.deal(2.5, 0)).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME);
    // A browser that will not keep the coup's record (full, say): nothing is dealt and no medal is taken.
    const full = new FakeBrowser();
    const there = full.open();
    const refusing = createMedalTable(there.bank, { ...storeOf(full), write: () => false }, { granted: () => undefined, yielding: () => undefined, paid: () => undefined, resumed: () => undefined });
    refusing.sit();
    await quiet(full);
    expect(refusing.holding()).toBe(true);
    expect(refusing.deal(10, 20)).toBeNull();
    expect(storedBalance(full)).toBe(WELCOME);
    expect(refusing.deal(0, 0)).not.toBeNull();
  });

  it('pays a coup in flight before the card leaves for another tab, once, and stops dealing until it is played here again', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = tableOn(first);
    await quiet(browser);
    const coup = one.table.deal(10, 30)!;
    // The player opens the table in a second tab: the first pays its coup while it still holds the card.
    const second = browser.open();
    const two = tableOn(second);
    await quiet(browser);
    expect(one.told).toEqual(['granted', 'paid 30 early', 'yielding moment']);
    expect(storedBalance(browser)).toBe(WELCOME + 20);
    expect(first.bank.getState().card).toBe('away');
    expect(one.table.holding()).toBe(false);
    // Its cards go on being turned over; when they have been, nothing more comes back.
    expect(one.table.settle(coup.id)).toBe('gone');
    expect(one.table.deal(1, 0)).toBeNull();
    expect(two.told).toEqual(['granted']);
    const there = two.table.deal(4, 0)!;
    two.table.settle(there.id);
    expect(storedBalance(browser)).toBe(WELCOME + 16);
    // Back to the first: the second waits, and the first is told the other table played since.
    one.table.play();
    await quiet(browser);
    expect(one.told.at(-1)).toBe('granted, moved');
    expect(second.bank.getState().card).toBe('away');
    expect(two.table.holding()).toBe(false);
    expect(storedBalance(browser)).toBe(WELCOME + 16);
  });

  it('pays a coup in flight as its page is hidden or left, before the card goes', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table, told } = tableOn(page);
    await quiet(browser);
    const coup = table.deal(20, 39)!;
    page.hide('left');
    expect(told).toEqual(['granted', 'paid 39 early', 'yielding left']);
    expect(storedBalance(browser)).toBe(WELCOME + 19);
    expect(table.settle(coup.id)).toBe('gone');
    expect(browser.storage.has(keyOf(page))).toBe(false);
  });

  it('lends the card to the Medal Game Center for a moment: the coup in flight is paid first, and the day’s bonus lands once beside it', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const { table, told } = tableOn(page);
    await quiet(browser);
    const coup = table.deal(10, 20)!;
    hub.bank.claimBonus();
    await quiet(browser);
    expect(told).toEqual(['granted', 'paid 20 early', 'yielding moment', 'granted']);
    expect(table.settle(coup.id)).toBe('gone');
    expect(storedBalance(browser)).toBe(WELCOME + 10 + BONUS_CARD[0]);
  });

  it('finishes a coup whose page was killed mid-deal: the next table to hold the card pays it, once', async () => {
    const browser = new FakeBrowser();
    const dead = browser.open();
    const gone = tableOn(dead);
    await quiet(browser);
    gone.table.deal(10, 25);
    const key = keyOf(dead);
    kill(dead);
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    // The page opened again (a reload that the old page did not live to see out).
    const again = browser.open();
    const reopened = tableOn(again);
    await quiet(browser);
    expect(reopened.told).toEqual(['resumed 25', 'granted']);
    expect(storedBalance(browser)).toBe(WELCOME + 15);
    expect(browser.storage.has(key)).toBe(false);
    // And never again: another tab, a reload, the table asked to look.
    reopened.table.resume();
    const third = browser.open();
    const another = tableOn(third);
    await quiet(browser);
    expect(another.told).toEqual(['granted']);
    expect(storedBalance(browser)).toBe(WELCOME + 15);
  });

  it('never pays a coup twice: one marked paid is struck off unpaid, whether the page went before striking it off or the striking off failed', async () => {
    // A page killed after its coup's medals went back, before it could strike the coup off.
    const browser = new FakeBrowser();
    const dead = browser.open();
    const gone = tableOn(dead);
    await quiet(browser);
    const coup = gone.table.deal(10, 30)!;
    const key = keyOf(dead);
    dead.bank.give(30);
    browser.storage.set(key, serializeCoup({ ...coup, state: 'paid' }));
    kill(dead);
    expect(storedBalance(browser)).toBe(WELCOME + 20);
    const again = browser.open();
    const reopened = tableOn(again);
    await quiet(browser);
    expect(reopened.told).toEqual(['granted']);
    expect(storedBalance(browser)).toBe(WELCOME + 20);
    expect(browser.storage.has(key)).toBe(false);

    // A browser whose striking off does not take: the coup stays as it was dealt, its return in under its receipt and
    // its receipts let go of with it, and is not paid again: to the next table it is a coup whose stake never went in.
    const stuck = new FakeBrowser();
    const page = stuck.open();
    const sticky = createMedalTable(page.bank, { ...storeOf(stuck), remove: () => undefined }, { granted: () => undefined, yielding: () => undefined, paid: () => undefined, resumed: () => undefined });
    sticky.sit();
    await quiet(stuck);
    const paid = sticky.deal(10, 30)!;
    expect(sticky.settle(paid.id)).toBe('paid');
    expect(storedBalance(stuck)).toBe(WELCOME + 20);
    expect(parseCoup(stuck.storage.get(keyOf(page)))?.state).toBe('dealt');
    sticky.resume();
    const other = stuck.open();
    tableOn(other);
    await quiet(stuck);
    expect(storedBalance(stuck)).toBe(WELCOME + 20);
  });

  it('pays nothing for a coup whose page went after writing it down and before taking its stake', async () => {
    const browser = new FakeBrowser();
    const dead = browser.open();
    tableOn(dead);
    await quiet(browser);
    // Written down, and the page gone before the stake left the medals.
    const written: Coup = { id: 'early-1', owner: null, device: deviceOf(dead), era: 0, stake: 10, returned: 30, spentBefore: 0, state: 'dealt' };
    browser.storage.set(keyOf(dead), serializeCoup(written));
    kill(dead);
    const page = browser.open();
    const { told } = tableOn(page);
    await quiet(browser);
    expect(told).toEqual(['dropped 30', 'granted']);
    expect(storedBalance(browser)).toBe(WELCOME);
  });

  it('throws away unpaid a coup left from before the Medal Game Center’s reset: the medals it was dealt from are gone', async () => {
    const browser = new FakeBrowser();
    const dead = browser.open();
    const gone = tableOn(dead);
    await quiet(browser);
    expect(gone.table.deal(50, 100)).not.toBeNull();
    const key = keyOf(dead);
    kill(dead);
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME);
    const page = browser.open();
    const { told } = tableOn(page);
    await quiet(browser);
    expect(told).toEqual(['dropped 100', 'granted']);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(browser.storage.has(key)).toBe(false);
  });

  it('throws it away even when the reset is found only as the card arrives, before the bank has published it', async () => {
    const browser = new FakeBrowser();
    const dead = browser.open();
    const gone = tableOn(dead);
    await quiet(browser);
    gone.table.deal(10, 30);
    kill(dead);
    // A page whose bank has read the medals (era 0) and published them...
    const page = browser.open();
    page.bank.subscribe(() => undefined);
    expect(page.bank.getState().ledger?.era).toBe(0);
    // ...and a reset written meanwhile by a page it has not heard from yet: it is found only when the card arrives.
    const before = parseLedger(browser.storage.get(ledgerKey(null)) ?? null)!;
    browser.storage.set(ledgerKey(null), serializeLedger(resetLedger(before)));
    const { told } = tableOn(page);
    await quiet(browser);
    expect(told).toEqual(['dropped 30', 'granted']);
    expect(storedBalance(browser)).toBe(WELCOME);
  });

  it('drops a coup in flight when a reset reaches the page that holds the card without the card leaving it, and deals again', async () => {
    const accounts = new FakeAccounts(() => 0);
    accounts.put(UID, serializeLedger(createLedger('first00001', 500)), 'm-start');
    const [phone, laptop] = [new FakeBrowser(), new FakeBrowser()];
    const p = phone.open();
    const l = laptop.open();
    p.bank.attend(signedIn(UID), accounts.store);
    p.bank.subscribe(() => undefined);
    l.bank.attend(signedIn(UID), accounts.store);
    const { table, told } = tableOn(l);
    await quiet(phone, laptop);
    expect(l.bank.getState()).toMatchObject({ owner: UID, balance: 500 });
    const coup = table.deal(10, 0)!;
    expect(table.open()?.id).toBe(coup.id);
    // Reset on the phone; the laptop hears of it from the account, holding the card all the while.
    p.bank.reset();
    for (let second = 0; second < 120 && l.bank.getState().ledger?.era !== 1; second++) {
      for (const browser of [phone, laptop]) browser.clock += 1000;
      for (const page of [p, l]) page.watchers?.tick();
      await quiet(phone, laptop);
    }
    expect(l.bank.getState().ledger?.era).toBe(1);
    expect(told.some((line) => line.startsWith('yielding'))).toBe(false);
    expect(table.open()).toBeNull();
    expect(laptop.storage.has(coupKey(coup.device))).toBe(false);
    expect(table.settle(coup.id)).toBe('gone');
    // The table deals again.
    const next = table.deal(5, 10);
    expect(next).not.toBeNull();
    table.settle(next!.id);
    expect(l.bank.getState().balance).toBe(WELCOME + 5);
  });

  it('leaves alone a coup dealt from other medals than those on the table', async () => {
    const browser = new FakeBrowser();
    const theirs: Coup = { id: 'someone-1', owner: UID, device: 'otherdev01', era: 0, stake: 10, returned: 20, spentBefore: 0, state: 'dealt' };
    browser.storage.set(coupKey('otherdev01'), serializeCoup(theirs));
    const page = browser.open();
    const { told } = tableOn(page);
    await quiet(browser);
    expect(told).toEqual(['granted']);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(parseCoup(browser.storage.get(coupKey('otherdev01')))).toEqual(theirs);
  });

  it('starts over once after the Medal Game Center’s reset', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const heard: string[] = [];
    page.bank.listen((event) => heard.push(event.type));
    const { table } = tableOn(page);
    await quiet(browser);
    expect(table.restartIfDue()).toBe(false);
    table.deal(30, 0);
    hub.bank.reset();
    await quiet(browser);
    expect(heard).toEqual(['reset']);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(GAME)).toBe(true);
    expect(table.restartIfDue()).toBe(true);
    await quiet(browser);
    expect(page.bank.restartDue(GAME)).toBe(false);
    expect(table.restartIfDue()).toBe(false);
  });

  it('plays where the browser cannot keep its tabs apart, one tab at a time', async () => {
    const browser = new FakeBrowser();
    browser.apart = false;
    const page = browser.open();
    const { table } = tableOn(page);
    await quiet(browser);
    const coup = table.deal(3, 6)!;
    table.settle(coup.id);
    expect(storedBalance(browser)).toBe(WELCOME + 3);
  });

  it('plays with a signed-in player’s own medals, and pays a coup only into the medals it was dealt from', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const page = browser.open();
    const { table, told } = tableOn(page);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME });
    const coup = table.deal(10, 30)!;
    expect(coup.owner).toBe(UID);
    expect(parseCoup(browser.storage.get(keyOf(page)))?.owner).toBe(UID);
    expect(storedBalance(browser, UID)).toBe(WELCOME - 10);
    // Signed out mid-deal: a guest's new medals are on the table now, and the coup is not paid into them.
    page.bank.attend(GUEST, accounts.store);
    await quiet(browser);
    expect(page.bank.getState().owner).toBeNull();
    expect(deviceOf(page)).not.toBe(coup.device);
    expect(table.settle(coup.id)).toBe('waiting');
    expect(page.bank.getState().balance).toBe(WELCOME);
    expect(parseCoup(browser.storage.get(coupKey(coup.device)))?.id).toBe(coup.id);
    // Signed in again: it is paid into theirs, once.
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    table.resume();
    table.resume();
    expect(told.filter((line) => line.startsWith('resumed'))).toEqual(['resumed 30']);
    expect(storedBalance(browser, UID)).toBe(WELCOME + 20);
    expect(browser.storage.has(coupKey(coup.device))).toBe(false);
  });

  it('follows a guest’s medals into a new account: a guest’s unpaid coup is paid there, and not into a later guest’s medals', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const dead = browser.open();
    const gone = tableOn(dead);
    await quiet(browser);
    gone.table.deal(10, 30);
    kill(dead);
    // Signed in on the Medal Game Center's front, to an account with no medals yet: the guest's medals become the account's.
    const hub = browser.open();
    hub.bank.attend(signedIn(UID), accounts.store);
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    expect(hub.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME - 10 });
    // The table, signed in: the coup is paid into the account's medals.
    const page = browser.open();
    page.bank.attend(signedIn(UID), accounts.store);
    const { told } = tableOn(page);
    await quiet(browser);
    expect(told).toEqual(['resumed 30', 'granted']);
    expect(storedBalance(browser, UID)).toBe(WELCOME + 20);
    // Signed out: a new guest's medals, and nothing of that coup in them.
    page.bank.attend(GUEST, accounts.store);
    await quiet(browser);
    tableOn(browser.open());
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(storedBalance(browser)).toBe(WELCOME);
  });
});

describe('a browser that dies between two writes', () => {
  // The coup and the medals are two writes (medals.ts): the browser is killed at every moment of a coup and started
  // again, and the next table to hold the card settles what it left. Every coup is paid exactly once, or, if its stake
  // never went in, never dealt at all. Here the table writes through the page's own storage, which can die.
  const storeOn = (page: FakePage): TableStore => ({
    read: (key) => page.env.read(key),
    write: (key, text) => {
      page.env.write(key, text);
      return true;
    },
    remove: (key) => page.env.remove(key),
  });
  const quietHooks: TableHooks = { granted: () => undefined, yielding: () => undefined, paid: () => undefined, resumed: () => undefined };
  const tables = new Map<FakeBrowser, { page: FakePage; table: ReturnType<typeof createMedalTable> }>();
  let coups = 0;
  const setUp = async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const table = createMedalTable(page.bank, storeOn(page), quietHooks, () => `coup${++coups}`);
    table.sit();
    await quiet(browser);
    tables.set(browser, { page, table });
    return browser;
  };
  /** The table opened again on what the browser left: it settles a coup left written down as it is given the card. */
  const reopened = async (after: FakeBrowser) => {
    const page = after.open();
    const table = createMedalTable(page.bank, storeOn(page), quietHooks, () => `coup${++coups}`);
    table.sit();
    await quiet(after);
    return { page, table };
  };
  const spentIn = (browser: FakeBrowser): number => {
    const ledger = parseLedger(browser.storage.get(ledgerKey(null)) ?? null)!;
    return ledger.rows[ledger.device]?.spent ?? 0;
  };

  for (const [what, returned] of [
    ['a coup that wins', 25],
    ['a coup that loses', 0],
  ] as const) {
    it(`pays ${what} exactly once, or never deals it, wherever the browser dies between the deal and the settling`, async () => {
      const writes = await atEveryWrite(
        setUp,
        (browser) => {
          const { table } = tables.get(browser)!;
          const coup = table.deal(10, returned);
          if (coup) table.settle(coup.id);
        },
        async (after, reached) => {
          const dealt = spentIn(after) === 10;
          const { page, table } = await reopened(after);
          expect(storedBalance(after), `died after ${reached} writes`).toBe(dealt ? WELCOME - 10 + returned : WELCOME);
          expect(after.storage.has(keyOf(page)), `died after ${reached} writes`).toBe(false);
          // Settled, none of its medals are out any more, wherever the browser died: nothing keeps a refill back.
          expect(medalsOutAt(parseLedger(after.storage.get(ledgerKey(null)) ?? null)!), `died after ${reached} writes`).toEqual([]);
          // The next coup deals and pays as ever, with every receipt let go of once it is settled.
          const next = table.deal(5, 10)!;
          expect(medalsOutAt(parseLedger(after.storage.get(ledgerKey(null)) ?? null)!)).toEqual(['baccarat']);
          expect(table.settle(next.id)).toBe('paid');
          const ledger = parseLedger(after.storage.get(ledgerKey(null)) ?? null)!;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([]);
          expect(storedBalance(after)).toBe((dealt ? WELCOME - 10 + returned : WELCOME) + 5);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(returned > 0 ? 4 : 3);
    });
  }

  it('pays a coup exactly once wherever the browser dies while the page going pays it', async () => {
    await atEveryWrite(
      setUp,
      (browser) => {
        const { page, table } = tables.get(browser)!;
        table.deal(10, 25);
        page.hide('left');
      },
      async (after, reached) => {
        const dealt = spentIn(after) === 10;
        await reopened(after);
        expect(storedBalance(after), `died after ${reached} writes`).toBe(dealt ? WELCOME + 15 : WELCOME);
      },
    );
  });

  it('pays nothing for a coup whose stake never went in, even when other medals have been spent since', async () => {
    const browser = await setUp();
    const { page } = tables.get(browser)!;
    // Written down, the browser gone before its stake went in; then another machine spent medals of this device.
    const written: Coup = { id: 'neverdealt', owner: null, device: deviceOf(page), era: 0, stake: 10, returned: 30, spentBefore: 0, state: 'dealt', receipts: true };
    browser.storage.set(keyOf(page), serializeCoup(written));
    page.bank.take(10);
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    tables.get(browser)!.table.resume();
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    expect(browser.storage.has(keyOf(page))).toBe(false);
  });
});

describe('the table this device keeps, and old saved state', () => {
  const played = () => {
    let table = NEW_TABLE;
    let shoe = createShoe(8, () => 0.37);
    for (let i = 0; i < 5; i++) {
      const { hand: h, shoe: after } = dealHand(shoe);
      table = afterCoup(table, h, after, i === 0, i % 2 ? { player: 5, tie: 1 } : {}, 'ez');
      shoe = after;
    }
    return table;
  };

  it('reads back exactly the table it wrote: shoe, scoreboards, the last hand and the bets to put back', () => {
    const table = played();
    expect(table.shoeNumber).toBe(1);
    expect(table.hand).toBe(5);
    expect(table.roads).toHaveLength(5);
    expect(table.stats.hands).toBe(5);
    expect(table.lastBets).toEqual({ player: 5, tie: 1 });
    // A hand with no bets on it does not take away the bets to put back.
    expect(table.last?.bets).toEqual({});
    expect(parseTable(serializeTable(table))).toEqual(table);
    expect(parseTable(serializeTable(NEW_TABLE))).toEqual(NEW_TABLE);
    // Its cards are replayed through the drawing rules, so a last hand read back is a real hand.
    expect(replayHand(dealtInOrder(table.last!.hand))).toEqual(table.last!.hand);
  });

  it('opens a new table, and takes nothing for medals, for anything it cannot read: nothing saved before, garbage, another version, a tampered shoe', () => {
    const good = JSON.parse(serializeTable(played())) as Record<string, unknown>;
    const shoe = good.shoe as { decks: number; cards: string; next: number };
    const variants: unknown[] = [
      null,
      undefined,
      '',
      'not json',
      '[]',
      '{}',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, v: 0 }),
      // The old table kept its chips only in the page's memory; a made-up save of them is not a table.
      JSON.stringify({ bankroll: 1000, chips: [1, 5, 25, 100, 500] }),
      JSON.stringify({ ...good, mode: 'macau' }),
      JSON.stringify({ ...good, chip: 25 }),
      JSON.stringify({ ...good, roads: 'abz' }),
      JSON.stringify({ ...good, stats: { ...(good.stats as object), hands: -1 } }),
      JSON.stringify({ ...good, shoe: { ...shoe, cards: shoe.cards.slice(2) } }),
      JSON.stringify({ ...good, shoe: { ...shoe, cards: 'A♠'.repeat(416) } }),
      JSON.stringify({ ...good, shoe: { ...shoe, next: 0 } }),
      JSON.stringify({ ...good, shoe: { ...shoe, decks: 9 } }),
      JSON.stringify({ ...good, last: { cards: 'A♠A♠', bets: {}, mode: 'ez' } }),
      JSON.stringify({ ...good, last: { cards: (good.last as { cards: string }).cards, bets: { banker: 5 }, mode: 'commission' } }),
      JSON.stringify({ ...good, lastBets: { player: 500 } }),
      JSON.stringify({ ...good, lastBets: { chips: 5 } }),
      'x'.repeat(30_000),
    ];
    for (const text of variants) expect(parseTable(text)).toBeNull();
    // Bets to put back from the other table are kept, whatever their step: Rebet places what this table takes.
    expect(parseTable(JSON.stringify({ ...good, mode: 'commission', lastBets: { banker: 5 } }))?.lastBets).toEqual({ banker: 5 });
  });

  it('reads no coup out of anything but one it wrote', () => {
    const coup: Coup = { id: 'c1', owner: null, device: 'device0001', era: 2, stake: 5, returned: 10, spentBefore: 40, state: 'dealt' };
    expect(parseCoup(serializeCoup(coup))).toEqual(coup);
    for (const text of [null, '', '{}', 'nope', JSON.stringify({ ...coup, v: 2 }), JSON.stringify({ v: 1, ...coup, stake: -1 }), JSON.stringify({ v: 1, ...coup, returned: 1.5 }), JSON.stringify({ v: 1, ...coup, id: '' }), JSON.stringify({ v: 1, ...coup, owner: 7 }), JSON.stringify({ v: 1, ...coup, device: 'No Device!' }), JSON.stringify({ v: 1, ...coup, state: 'refunded' })]) {
      expect(parseCoup(text)).toBeNull();
    }
  });

  it('opens with old or damaged saved state without a crash, and pays nothing from it', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(TABLE_KEY, '{"v":1,"mode":');
    const page = browser.open();
    page.bank.subscribe(() => undefined);
    browser.storage.set(keyOf(page), '{"v":1,"id":"x","owner":null,"era":0,"stake":"ten"}');
    const { told } = tableOn(page);
    await quiet(browser);
    expect(told).toEqual(['granted']);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(parseTable(browser.storage.get(TABLE_KEY))).toBeNull();
  });

  it('keeps its own keys apart from the medal bank’s: the table holds no medals', () => {
    expect(TABLE_KEY).toBe('baccarat-table');
    expect(coupKey('device0001')).toBe('baccarat-coup:device0001');
    expect(GAME).toBe('baccarat');
    expect(Object.keys(JSON.parse(serializeTable(played())) as object).sort()).toEqual(['chip', 'hand', 'last', 'lastBets', 'mode', 'shoe', 'shoeNumber', 'stats', 'v', 'roads'].sort());
  });
});

describe('simulations', () => {
  it('never touch the player’s medals: the Simulation and Odds tabs and their engines do not reach the medal bank', () => {
    for (const file of ['SimTab.tsx', 'sim.ts', 'analysis.ts', 'OddsTab.tsx', 'charts.tsx', 'engine.ts']) {
      const source = readFileSync(path.resolve(process.cwd(), 'src/components/game/Baccarat', file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|from '\.\/medals'|bank\(/);
    }
  });

  it('settle a bet the way the table does (one engine), so what the Simulation tab measures is what the table pays', () => {
    const ids: BetId[] = ['player', 'banker', 'tie'];
    for (const h of HANDS) for (const id of ids) expect(medalsBack({ [id]: 20 }, h, 'commission').returned).toBeCloseTo(settleBet(id, 20, h, 'commission').returned, 9);
  });
});
