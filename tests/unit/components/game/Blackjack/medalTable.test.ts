import { describe, expect, it } from 'vitest';

import { PUSHER } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, parseLedger, receiptsOf } from '@/components/game/MedalCenter/ledger';
import { DECKS, RANKS, STRATEGIES, SUITS, createShoe, legalActions, type Card, type Rank, type Shoe } from '@/components/game/Blackjack/engine';
import {
  DEFAULT_BET,
  EMPTY_STATS,
  GAME,
  MAX_BET,
  MIN_BET,
  TABLE_KEY,
  createMedalTable,
  freshTable,
  parseTable,
  serializeTable,
  tableKey,
  unsettled,
  type MedalTable,
  type Shelf,
  type TableSave,
} from '@/components/game/Blackjack/medalTable';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';

// The blackjack table at the medal center, played against the medal center's real bank in a browser made for its
// tests (bankFakes.ts): one storage the pages share, the one card, and the channel between them. No account, and
// nothing fetched.

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/**
 * A six-deck shoe that deals these ranks first, after the burn card, in the order startRound and act draw them:
 * player, dealer, player, dealer (the hole card), then each card asked for. The rest of the six decks follow.
 */
function stacked(...ranks: Rank[]): Shoe {
  const pool: Card[] = [];
  for (let d = 0; d < DECKS; d++) for (const suit of SUITS) for (const rank of RANKS) pool.push({ rank, suit });
  const pick = (rank: Rank): Card => pool.splice(pool.findIndex((card) => card.rank === rank), 1)[0];
  const front = ranks.map(pick);
  const burn = pick('2');
  return { decks: DECKS, cards: [burn, ...front, ...pool], next: 1, cutIndex: Math.floor(DECKS * 52 * 0.75) };
}

/** Puts a table with this shoe on it in the browser, as a page that had played there would have left it. */
function shoeOnTable(browser: FakeBrowser, shoe: Shoe, owner: string | null = null) {
  browser.storage.set(tableKey(owner), serializeTable({ ...freshTable(0), shoe }));
}

interface Seated {
  page: FakePage;
  table: MedalTable;
  seat: ReturnType<FakePage['bank']['sit']>;
}

/** This browser's storage as the table is given it. The medal center's own writes go through the page (bankFakes.ts). */
const shelfOf = (browser: FakeBrowser): Shelf => ({ read: (key) => browser.storage.get(key) ?? null, write: (key, text) => browser.storage.set(key, text) });

/** A page with the table on it: seated at the medal center, the card asked for, and the guest's table opened once the card is here. */
async function seated(browser: FakeBrowser, shelf: Shelf = shelfOf(browser)): Promise<Seated> {
  const page = browser.open();
  const seat = page.bank.sit(GAME, { granted: () => undefined, yielding: () => undefined });
  const table = createMedalTable({ bank: page.bank, shelf, holding: () => seat.holding(), random: seeded(7) });
  await quiet(browser);
  table.open(null);
  return { page, table, seat };
}

const medals = (browser: FakeBrowser): number => balanceOf(parseLedger(browser.storage.get('medal-center-bank') ?? null)!);
const stored = (browser: FakeBrowser, owner: string | null = null): TableSave | null => parseTable(browser.storage.get(tableKey(owner)) ?? null);

describe('bets come out of the player’s medals and wins go back in, once each', () => {
  it('takes the bet as the hand is dealt and puts back what it wins when it is settled, once', async () => {
    const browser = new FakeBrowser();
    // 10 and 9 against 6 and a ten; the dealer draws an 8 and busts.
    shoeOnTable(browser, stacked('T', '6', '9', 'K', '8'));
    const { table } = await seated(browser);
    expect(medals(browser)).toBe(WELCOME);

    const dealt = table.deal(2);
    expect(dealt.ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME - 2);
    expect(stored(browser)?.round?.phase).toBe('player');
    expect(stored(browser)?.paid).toBe(false);

    expect(table.act('stand').ok).toBe(true);
    // Played out, and not settled yet: the dealer's cards are still being shown.
    expect(stored(browser)?.round?.result).toMatchObject({ dealerBust: true, returned: 4, net: 2 });
    expect(medals(browser)).toBe(WELCOME - 2);

    expect(table.settle().ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME + 2);
    expect(stored(browser)).toMatchObject({ paid: true, stats: { hands: 1, wins: 1, net: 2, decisions: 1, agreed: 0 } });
    // Asked again, nothing more comes back.
    expect(table.settle()).toMatchObject({ ok: false, why: 'not-now' });
    expect(medals(browser)).toBe(WELCOME + 2);
    // And the next hand can be dealt.
    expect(unsettled(table.current())).toBe(false);
  });

  it('takes a double’s stake as it is made', async () => {
    const browser = new FakeBrowser();
    // 6 and 5 against 6 and a ten; the double draws a ten for 21 and the dealer draws a king and busts.
    shoeOnTable(browser, stacked('6', '6', '5', 'T', 'T', 'K'));
    const { table } = await seated(browser);
    table.deal(2);
    expect(medals(browser)).toBe(WELCOME - 2);
    expect(table.act('double', true).ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME - 4);
    expect(table.current().round?.phase).toBe('done');
    table.settle();
    expect(medals(browser)).toBe(WELCOME - 4 + 8);
    expect(table.current().stats).toMatchObject({ decisions: 1, agreed: 1, net: 4 });
  });

  it('takes a split’s stake as it is made, once, and settles both hands', async () => {
    const browser = new FakeBrowser();
    // Two 8s against a 6: each 8 draws a ten, both stand, and the dealer draws a king and busts.
    shoeOnTable(browser, stacked('8', '6', '8', 'T', 'T', 'T', 'K'));
    const { table } = await seated(browser);
    table.deal(3);
    expect(table.act('split').ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME - 6);
    table.act('stand');
    expect(medals(browser)).toBe(WELCOME - 6);
    table.act('stand');
    table.settle();
    expect(medals(browser)).toBe(WELCOME - 6 + 12);
    expect(table.current().stats).toMatchObject({ hands: 2, wins: 2, net: 6 });
  });

  it('takes insurance as it is bought: half the bet, rounded down, and none on a 1-medal bet', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('9', 'A', '9', 'K'));
    const { table } = await seated(browser);
    table.deal(3);
    expect(table.current().round?.phase).toBe('insurance');
    expect(table.insure(true).ok).toBe(true);
    // 3 bet, 1 insured (half of 3, rounded down).
    expect(medals(browser)).toBe(WELCOME - 4);
    // The dealer has blackjack: the hand is lost, the insurance wins 2:1.
    expect(table.current().round?.result).toMatchObject({ dealerBlackjack: true, insurance: { stake: 1, profit: 2 }, returned: 3, net: -1 });
    table.settle();
    expect(medals(browser)).toBe(WELCOME - 1);

    // A 1-medal bet has no half medal to insure with: the dealer peeks at once.
    const other = new FakeBrowser();
    shoeOnTable(other, stacked('9', 'A', '9', 'K'));
    const one = await seated(other);
    one.table.deal(1);
    expect(one.table.current().round?.phase).toBe('done');
    expect(one.table.insure(true)).toMatchObject({ ok: false, why: 'not-now' });
    expect(medals(other)).toBe(WELCOME - 1);
  });

  it('pays a blackjack 3:2 in whole medals: in full on an even bet, rounded down on an odd one', async () => {
    for (const [bet, back] of [
      [2, 5],
      [3, 7],
      [1, 2],
      [MAX_BET, 25],
    ] as const) {
      const browser = new FakeBrowser();
      shoeOnTable(browser, stacked('A', '6', 'K', '9'));
      const { table } = await seated(browser);
      table.deal(bet);
      expect(table.current().round?.result?.hands[0]).toMatchObject({ outcome: 'blackjack', profit: back - bet });
      table.settle();
      expect(medals(browser)).toBe(WELCOME - bet + back);
    }
  });

  it('refuses a bet outside 1 to 10 medals, a bet the player has not got, and a second hand before the first is settled', async () => {
    const browser = new FakeBrowser();
    const { table, page } = await seated(browser);
    expect(table.deal(0)).toMatchObject({ ok: false, why: 'not-now' });
    expect(table.deal(MAX_BET + 1)).toMatchObject({ ok: false, why: 'not-now' });
    expect(table.deal(1.5)).toMatchObject({ ok: false, why: 'not-now' });
    expect(medals(browser)).toBe(WELCOME);
    page.bank.take(WELCOME - 1);
    expect(table.deal(2)).toMatchObject({ ok: false, why: 'short' });
    expect(medals(browser)).toBe(1);
    expect(table.deal(MIN_BET).ok).toBe(true);
    expect(medals(browser)).toBe(0);
    if (unsettled(table.current())) expect(table.deal(MIN_BET)).toMatchObject({ ok: false, why: 'not-now' });
  });

  it('plays many hands by the chart with every stake taken once and every return put back once', async () => {
    const browser = new FakeBrowser();
    const { table, page } = await seated(browser);
    page.bank.give(10_000);
    let expected = WELCOME + 10_000;
    for (let hand = 0; hand < 300; hand++) {
      const bet = MIN_BET + (hand % MAX_BET);
      expect(table.deal(bet).ok).toBe(true);
      expected -= bet;
      if (table.current().round?.phase === 'insurance') {
        const cost = Math.floor(bet / 2);
        table.insure(hand % 3 === 0);
        if (hand % 3 === 0) expected -= cost;
      }
      for (let guard = 0; table.current().round?.phase === 'player' && guard < 30; guard++) {
        const round = table.current().round!;
        const legal = legalActions(round);
        const hand2 = round.hands[round.active];
        const action = STRATEGIES.basic(hand2, round.dealer[0], legal, round);
        const extra = action === 'double' ? hand2.bet : action === 'split' ? round.bet : 0;
        expect(table.act(legal[action] ? action : 'stand').ok).toBe(true);
        if (legal[action]) expected -= extra;
      }
      expect(medals(browser)).toBe(expected);
      const back = table.current().round!.result!.returned;
      expect(table.settle().ok).toBe(true);
      expected += back;
      expect(medals(browser)).toBe(expected);
      // What is kept reads back as what the table has.
      expect(parseTable(serializeTable(table.current()))).toEqual(table.current());
    }
    expect(table.current().stats.net).toBe(expected - WELCOME - 10_000);
  });
});

describe('a reload in the middle of a hand: the hand carries on', () => {
  it('has the same hand on the table after a reload, its stake not taken again and not handed back', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('T', '6', '6', 'K', '3', '8'));
    const first = await seated(browser);
    first.table.deal(4);
    first.table.act('hit'); // 10, 6 and 3: 19
    const before = first.table.current().round!;
    expect(medals(browser)).toBe(WELCOME - 4);
    first.page.close();

    const second = await seated(browser);
    const round = second.table.current().round!;
    expect(round.phase).toBe('player');
    expect(round.hands[0].cards).toEqual(before.hands[0].cards);
    expect(round.dealer).toEqual(before.dealer);
    expect(round.shoe.next).toBe(before.shoe.next);
    expect(medals(browser)).toBe(WELCOME - 4);
    // Played on from there: the dealer draws the 8 and busts.
    expect(second.table.act('stand').ok).toBe(true);
    second.table.settle();
    expect(medals(browser)).toBe(WELCOME + 4);
  });

  it('puts back a hand played out just before the reload, once, when the table is opened again', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('T', '6', '9', 'K', '8'));
    const first = await seated(browser);
    first.table.deal(2);
    first.table.act('stand');
    // The page goes before the dealer's cards have all been shown.
    first.page.close();
    expect(medals(browser)).toBe(WELCOME - 2);

    const second = await seated(browser);
    expect(second.table.current()).toMatchObject({ paid: false, round: { phase: 'done' } });
    expect(second.table.settle().ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME + 2);
    second.page.close();

    const third = await seated(browser);
    expect(third.table.current().paid).toBe(true);
    expect(third.table.settle()).toMatchObject({ ok: false, why: 'not-now' });
    expect(medals(browser)).toBe(WELCOME + 2);
  });
});

describe('another tab', () => {
  it('stops taking bets when another tab takes the card, plays on there, and does not pay a hand twice when the card comes back', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('T', '6', '9', 'K', '8'));
    const first = await seated(browser);
    first.table.deal(2);

    // The player opens the table in another tab: it has the card, and the hand.
    const second = await seated(browser);
    expect(first.page.bank.getState().card).toBe('away');
    expect(first.table.act('stand')).toMatchObject({ ok: false, why: 'away' });
    expect(first.table.deal(2)).toMatchObject({ ok: false, why: 'away' });
    expect(second.table.current().round?.phase).toBe('player');
    expect(second.table.act('stand').ok).toBe(true);
    expect(second.table.settle().ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME + 2);

    // Back to the first tab: it finds the hand settled there and puts nothing back again.
    first.seat.play();
    await quiet(browser);
    expect(first.seat.holding()).toBe(true);
    const step = first.table.settle();
    expect(step).toMatchObject({ ok: false, why: 'moved' });
    expect(step.save.paid).toBe(true);
    expect(first.table.act('stand')).toMatchObject({ ok: false, why: 'not-now' });
    expect(medals(browser)).toBe(WELCOME + 2);
    expect(first.table.deal(2).ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME);
  });

  it('puts back a hand whose dealer was still being shown when the card went, once, wherever it is settled', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('T', '6', '9', 'K', '8'));
    const first = await seated(browser);
    first.table.deal(2);
    first.table.act('stand');
    const second = await seated(browser);
    // The first tab's reveal ends after the card has gone: nothing is put back from there.
    expect(first.table.settle()).toMatchObject({ ok: false, why: 'away' });
    expect(second.table.settle().ok).toBe(true);
    first.seat.play();
    await quiet(browser);
    expect(first.table.refresh()).toBe(true);
    expect(first.table.settle()).toMatchObject({ ok: false, why: 'not-now' });
    expect(medals(browser)).toBe(WELCOME + 2);
  });
});

describe('the medal center’s reset', () => {
  it('starts the table over: the hand on it goes with the medals, and nothing comes back for it', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('T', '6', '9', 'K', '8'));
    const { table, page } = await seated(browser);
    table.deal(4);
    table.act('stand');
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    expect(medals(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(GAME)).toBe(true);

    // The won hand is not settled into the new medals.
    const step = table.settle();
    expect(step).toMatchObject({ ok: false, why: 'moved' });
    expect(step.save).toMatchObject({ round: null, shoe: null, era: 1 });
    expect(medals(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(GAME)).toBe(false);
    // The record is kept, as the Medal Pusher's record book is.
    expect(stored(browser)?.stats.decisions).toBe(1);
    expect(table.deal(2).ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME - 2);
    expect(stored(browser)?.era).toBe(1);
  });

  it('starts over a table kept from before a reset made while it was closed', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('T', '6', '9', 'K', '8'));
    const first = await seated(browser);
    first.table.deal(4);
    first.page.close();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);

    const second = await seated(browser);
    expect(second.table.current().round).not.toBeNull();
    expect(second.table.refresh()).toBe(true);
    expect(second.table.current()).toMatchObject({ round: null, shoe: null, era: 1 });
    expect(second.table.act('stand')).toMatchObject({ ok: false, why: 'not-now' });
    expect(medals(browser)).toBe(WELCOME);
  });
});

describe('a browser that will not keep something: no medal is lost, and none comes back twice', () => {
  /** This browser's storage, with the table's place full when `full` is set, as a browser out of space for the site would be. */
  const fullable = (browser: FakeBrowser) => {
    const state = { full: false };
    const shelf: Shelf = {
      read: (key) => browser.storage.get(key) ?? null,
      write: (key, text) => {
        if (state.full && key.startsWith(TABLE_KEY)) throw new Error('QuotaExceededError');
        browser.storage.set(key, text);
      },
    };
    return { state, shelf };
  };

  it('moves no medal for a step it cannot write down: not the bet, not a double, and not a hand’s return, until it can; then once', async () => {
    const browser = new FakeBrowser();
    // 6 and 5 against 6 and a ten; the double draws a ten for 21 and the dealer draws a king and busts.
    shoeOnTable(browser, stacked('6', '6', '5', 'T', 'T', 'K'));
    const { state, shelf } = fullable(browser);
    const first = await seated(browser, shelf);
    const kept = browser.storage.get(TABLE_KEY);

    state.full = true;
    expect(first.table.deal(2)).toMatchObject({ ok: false, why: 'unsaved' });
    expect(medals(browser)).toBe(WELCOME);
    expect(browser.storage.get(TABLE_KEY)).toBe(kept);
    expect(first.table.current().round).toBeNull();

    state.full = false;
    expect(first.table.deal(2).ok).toBe(true);
    state.full = true;
    expect(first.table.act('double')).toMatchObject({ ok: false, why: 'unsaved' });
    expect(medals(browser)).toBe(WELCOME - 2);
    expect(first.table.current().round?.phase).toBe('player');
    state.full = false;
    expect(first.table.act('double').ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME - 4);

    // Played out; its 8 medals cannot come back while the table cannot be written down as settled.
    state.full = true;
    expect(first.table.settle()).toMatchObject({ ok: false, why: 'unsaved' });
    expect(medals(browser)).toBe(WELCOME - 4);
    expect(stored(browser)?.paid).toBe(false);
    first.page.close();

    // Reopened, still full: still nothing back. Then there is room, and they come back once.
    const second = await seated(browser, shelf);
    expect(second.table.settle()).toMatchObject({ ok: false, why: 'unsaved' });
    expect(medals(browser)).toBe(WELCOME - 4);
    state.full = false;
    expect(second.table.settle().ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME + 4);
    second.page.close();
    const third = await seated(browser, shelf);
    expect(third.table.settle()).toMatchObject({ ok: false, why: 'not-now' });
    expect(medals(browser)).toBe(WELCOME + 4);
  });

  it('writes the table back as it was when the medal center cannot keep the medals a step moved, so a reload finds both as they were', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('6', '6', '5', 'T', 'T', 'K'));
    const first = await seated(browser);
    first.table.deal(2);
    const dealt = browser.storage.get(TABLE_KEY);
    expect(medals(browser)).toBe(WELCOME - 2);

    // The medal center's storage stops taking writes (the table's still does): the double and the return happen on
    // this page only, and neither is kept.
    browser.blocked = true;
    expect(first.table.act('double').ok).toBe(true);
    expect(first.page.bank.getState().kept).toBe(false);
    expect(first.page.bank.balance()).toBe(WELCOME - 4);
    expect(first.table.settle().ok).toBe(true);
    expect(first.page.bank.balance()).toBe(WELCOME + 4);
    // What is kept is the hand as it was dealt, and the medals as they were then.
    expect(browser.storage.get(TABLE_KEY)).toBe(dealt);
    expect(medals(browser)).toBe(WELCOME - 2);

    // Reloaded: the same hand, played again from where the kept medals are, and settled once.
    browser.blocked = false;
    first.page.close();
    const second = await seated(browser);
    expect(second.table.current()).toMatchObject({ paid: false, round: { phase: 'player' } });
    expect(second.table.act('double').ok).toBe(true);
    expect(second.table.settle().ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME + 4);
  });

  it('goes back to the kept table when the card comes back and the medal center reads its kept medals again', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('6', '6', '5', 'T', 'T', 'K'));
    const { page, table } = await seated(browser);
    table.deal(2);
    browser.blocked = true;
    table.act('double');
    // A double the medal center could not keep: the hand is played out on this page, and kept as it was dealt.
    browser.blocked = false;
    const kept = browser.storage.get(TABLE_KEY);
    expect(table.current().round?.phase).toBe('done');
    // The page is hidden and shown: the card goes and comes back, and the medal center reads its kept medals again.
    page.hide();
    page.show();
    await quiet(browser);
    expect(page.bank.balance()).toBe(WELCOME - 2);
    expect(table.refresh(true)).toBe(true);
    expect(serializeTable(table.current())).toBe(kept);
    expect(table.current().round?.phase).toBe('player');
    expect(table.act('double').ok).toBe(true);
    expect(table.settle().ok).toBe(true);
    expect(medals(browser)).toBe(WELCOME + 4);
  });
});

describe('a browser that dies between two writes', () => {
  // The table and the medals are two writes (medalTable.ts): the browser is killed at every moment of a hand, started
  // again, and the table plays on from what it left. Every stake is taken once and every return put back once, or the
  // step it was for never happened. Here the table writes through the page's own storage, which can die.
  const shelfOn = (page: FakePage): Shelf => ({ read: (key) => page.env.read(key), write: (key, text) => page.env.write(key, text) });
  const tables = new Map<FakeBrowser, Seated>();
  const opened = async (browser: FakeBrowser): Promise<Seated> => {
    const page = browser.open();
    const seat = page.bank.sit(GAME, { granted: () => undefined, yielding: () => undefined });
    const table = createMedalTable({ bank: page.bank, shelf: shelfOn(page), holding: () => seat.holding(), random: seeded(7) });
    await quiet(browser);
    table.open(null);
    table.refresh(true);
    return { page, table, seat };
  };
  const spentIn = (browser: FakeBrowser): number => {
    const ledger = parseLedger(browser.storage.get('medal-center-bank') ?? null)!;
    return ledger.rows[ledger.device]?.spent ?? 0;
  };

  /** Plays the hand on the table to its end the way it was first played: a double or a split when it can, and stand. */
  const playOut = (table: MedalTable, plan: 'double' | 'split' | 'insure') => {
    for (let guard = 0; guard < 10 && unsettled(table.current()); guard++) {
      const round = table.current().round!;
      if (round.phase === 'insurance') table.insure(plan === 'insure');
      else if (round.phase === 'player') {
        const legal = legalActions(round);
        table.act(plan !== 'insure' && legal[plan] ? plan : 'stand');
      } else table.settle();
    }
  };

  for (const [what, ranks, bet, plan, end] of [
    // 6 and 5 against 6 and a ten; the double draws a ten for 21 and the dealer draws a king and busts.
    ['a doubled hand', ['6', '6', '5', 'T', 'T', 'K'], 2, 'double', WELCOME - 4 + 8],
    // Two 8s against a 6: each 8 draws a ten, both stand, and the dealer draws a king and busts.
    ['a split hand', ['8', '6', '8', 'T', 'T', 'T', 'K'], 3, 'split', WELCOME - 6 + 12],
    // 9s against an ace: insured for 1, and the dealer has blackjack.
    ['an insured hand', ['9', 'A', '9', 'K'], 3, 'insure', WELCOME - 1],
  ] as const) {
    it(`takes the stakes of ${what} once and puts back what it brings once, or deals nothing, wherever the browser dies`, async () => {
      const writes = await atEveryWrite(
        async () => {
          const browser = new FakeBrowser();
          shoeOnTable(browser, stacked(...ranks));
          tables.set(browser, await opened(browser));
          return browser;
        },
        (browser) => {
          const { table } = tables.get(browser)!;
          table.deal(bet);
          playOut(table, plan);
        },
        async (after, reached) => {
          const dealt = spentIn(after) >= bet;
          const { table } = await opened(after);
          playOut(table, plan);
          expect(medals(after), `died after ${reached} writes`).toBe(dealt ? end : WELCOME);
          expect(unsettled(table.current()), `died after ${reached} writes`).toBe(false);
          // Looked at again, nothing more; and the next hand starts with the last one's receipts let go of.
          table.refresh(true);
          expect(medals(after)).toBe(dealt ? end : WELCOME);
          expect(table.deal(1).ok).toBe(true);
          const ledger = parseLedger(after.storage.get('medal-center-bank') ?? null)!;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${GAME}:${table.current().id}:deal`]);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(6);
    });
  }

  it('takes a hand dealt before receipts at its word: its bet was taken, and a double and the return are made once', async () => {
    await atEveryWrite(
      async () => {
        const browser = new FakeBrowser();
        shoeOnTable(browser, stacked('6', '6', '5', 'T', 'T', 'K'));
        // As the table wrote it before receipts: the bet taken, the hand on the table with no name.
        const at = await opened(browser);
        expect(at.table.deal(2).ok).toBe(true);
        const kept = JSON.parse(browser.storage.get(TABLE_KEY)!) as Record<string, unknown>;
        delete kept.id;
        delete kept.pending;
        browser.storage.set(TABLE_KEY, JSON.stringify(kept));
        at.page.close();
        tables.set(browser, await opened(browser));
        return browser;
      },
      (browser) => playOut(tables.get(browser)!.table, 'double'),
      async (after, reached) => {
        const { table } = await opened(after);
        playOut(table, 'double');
        expect(medals(after), `died after ${reached} writes`).toBe(WELCOME - 4 + 8);
      },
    );
  });
});

describe('old saved state', () => {
  const NOT_TABLES = [
    'not json',
    '',
    'null',
    '[]',
    JSON.stringify({ v: 2 }),
    // The chips the table had before the medal floor were never kept: a save of chips is not a table.
    JSON.stringify({ bankroll: 1000, bet: 10 }),
    JSON.stringify({ ...JSON.parse(serializeTable(freshTable(0))), stats: { ...EMPTY_STATS, hands: -1 } }),
    JSON.stringify({ ...JSON.parse(serializeTable({ ...freshTable(0), shoe: createShoe(5, seeded(1)) })) }),
    JSON.stringify({ ...JSON.parse(serializeTable(freshTable(0))), bet: 11 }),
  ];

  it('reads nothing out of text it did not write, and does not throw', () => {
    for (const text of NOT_TABLES) expect(parseTable(text)).toBeNull();
    expect(parseTable(null)).toBeNull();
    expect(parseTable(42)).toBeNull();
    expect(parseTable(serializeTable(freshTable(3)))).toEqual(freshTable(3));
  });

  it('refuses a hand whose stakes do not add up, and one marked settled before it was played out', async () => {
    const browser = new FakeBrowser();
    shoeOnTable(browser, stacked('T', '6', '9', 'K', '8'));
    const { table } = await seated(browser);
    table.deal(2);
    const text = browser.storage.get(TABLE_KEY)!;
    const doubledBet = JSON.parse(text) as { round: { hands: { bet: number }[] } };
    doubledBet.round.hands[0].bet = 40;
    expect(parseTable(JSON.stringify(doubledBet))).toBeNull();
    const paidEarly = { ...(JSON.parse(text) as object), paid: true };
    expect(parseTable(JSON.stringify(paidEarly))).toBeNull();
    expect(parseTable(text)?.round?.phase).toBe('player');
  });

  it('opens a fresh table over anything it cannot read, keeps that text aside, and plays', async () => {
    for (const text of NOT_TABLES) {
      const browser = new FakeBrowser();
      browser.storage.set(TABLE_KEY, text);
      const { table } = await seated(browser);
      expect(table.current()).toEqual(freshTable(0));
      expect(table.deal(DEFAULT_BET).ok).toBe(true);
      expect(browser.storage.get(`${TABLE_KEY}#unread`)).toBe(text);
      expect(medals(browser)).toBe(WELCOME - DEFAULT_BET);
    }
  });

  it('plays with the medals a Medal Pusher kept before the medal center, moved in by the medal center', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(PUSHER.machineKey, JSON.stringify({ version: 9, session: { credits: 1234 } }));
    const { table, page } = await seated(browser);
    expect(page.bank.getState().balance).toBe(1234);
    expect(table.deal(MAX_BET).ok).toBe(true);
    expect(medals(browser)).toBe(1234 - MAX_BET);
  });

  it('keeps an account’s table apart from a guest’s', () => {
    expect(tableKey(null)).toBe(TABLE_KEY);
    expect(tableKey('test-player-1')).toBe(`${TABLE_KEY}:test-player-1`);
  });
});
