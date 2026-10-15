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
import { ledgerKey } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, parseLedger } from '@/components/game/MedalCenter/ledger';
import { GUEST } from '@/components/game/MedalPusher/account';
import { BONUS_CARD } from '@/components/game/MedalPusher/records';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';
import { FakeBrowser, quiet, type FakePage } from '../MedalCenter/bankFakes';

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
    // Written down as it is dealt, in case the page is killed before it can pay.
    expect(parseCoup(browser.storage.get(coupKey(null)))).toEqual({ id: coup!.id, owner: null, era: 0, stake: 10, returned: 25 });
    // A second coup is not dealt over one in flight.
    expect(table.deal(5, 0)).toBeNull();
    expect(table.settle(coup!.id)).toBe('paid');
    expect(storedBalance(browser)).toBe(WELCOME + 15);
    expect(browser.storage.has(coupKey(null))).toBe(false);
    // Once.
    expect(table.settle(coup!.id)).toBe('gone');
    table.resume();
    await quiet(browser);
    expect(storedBalance(browser)).toBe(WELCOME + 15);
    expect(told).toEqual(['granted', 'paid 25']);
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
    expect(browser.storage.has(coupKey(null))).toBe(false);
    expect(table.settle(none.id)).toBe('paid');
    expect(storedBalance(browser)).toBe(WELCOME - 5);
  });

  it('deals nothing the medals do not cover, and nothing at all without the card', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { table } = tableOn(page);
    expect(table.deal(1, 0)).toBeNull();
    await quiet(browser);
    expect(table.deal(WELCOME + 1, 0)).toBeNull();
    expect(table.deal(-1, 0)).toBeNull();
    expect(table.deal(2.5, 0)).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(table.deal(WELCOME, 0)).not.toBeNull();
    expect(storedBalance(browser)).toBe(0);
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
    expect(browser.storage.has(coupKey(null))).toBe(false);
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
    kill(dead);
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    // The page opened again (a reload that the old page did not live to see out).
    const again = browser.open();
    const reopened = tableOn(again);
    await quiet(browser);
    expect(reopened.told).toEqual(['resumed 25', 'granted']);
    expect(storedBalance(browser)).toBe(WELCOME + 15);
    expect(browser.storage.has(coupKey(null))).toBe(false);
    // And never again: another tab, a reload, the table asked to look.
    reopened.table.resume();
    const third = browser.open();
    const another = tableOn(third);
    await quiet(browser);
    expect(another.told).toEqual(['granted']);
    expect(storedBalance(browser)).toBe(WELCOME + 15);
  });

  it('throws away unpaid a coup left from before the Medal Game Center’s reset: the medals it was dealt from are gone', async () => {
    const browser = new FakeBrowser();
    const dead = browser.open();
    const gone = tableOn(dead);
    await quiet(browser);
    expect(gone.table.deal(50, 100)).not.toBeNull();
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
    expect(browser.storage.has(coupKey(null))).toBe(false);
  });

  it('leaves another player’s unpaid coup alone until their medals are on the table', async () => {
    const browser = new FakeBrowser();
    const theirs: Coup = { id: 'someone-1', owner: UID, era: 0, stake: 10, returned: 20 };
    browser.storage.set(coupKey(UID), serializeCoup(theirs));
    const page = browser.open();
    const { told } = tableOn(page);
    await quiet(browser);
    expect(told).toEqual(['granted']);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(parseCoup(browser.storage.get(coupKey(UID)))).toEqual(theirs);
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
    expect(parseCoup(browser.storage.get(coupKey(UID)))?.owner).toBe(UID);
    expect(browser.storage.has(coupKey(null))).toBe(false);
    expect(storedBalance(browser, UID)).toBe(WELCOME - 10);
    // Signed out mid-deal: the guest's medals are on the table now, and the coup is not paid into them.
    page.bank.attend(GUEST, accounts.store);
    await quiet(browser);
    expect(page.bank.getState().owner).toBeNull();
    expect(table.settle(coup.id)).toBe('waiting');
    expect(page.bank.getState().balance).toBe(WELCOME);
    expect(parseCoup(browser.storage.get(coupKey(UID)))?.id).toBe(coup.id);
    // Signed in again: it is paid into theirs, once.
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    table.resume();
    table.resume();
    expect(told.filter((line) => line.startsWith('resumed'))).toEqual(['resumed 30']);
    expect(storedBalance(browser, UID)).toBe(WELCOME + 20);
    expect(browser.storage.has(coupKey(UID))).toBe(false);
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
    const coup: Coup = { id: 'c1', owner: null, era: 2, stake: 5, returned: 10 };
    expect(parseCoup(serializeCoup(coup))).toEqual(coup);
    for (const text of [null, '', '{}', 'nope', JSON.stringify({ ...coup, v: 2 }), JSON.stringify({ v: 1, ...coup, stake: -1 }), JSON.stringify({ v: 1, ...coup, returned: 1.5 }), JSON.stringify({ v: 1, ...coup, id: '' }), JSON.stringify({ v: 1, ...coup, owner: 7 })]) {
      expect(parseCoup(text)).toBeNull();
    }
  });

  it('opens with old or damaged saved state without a crash, and pays nothing from it', async () => {
    const browser = new FakeBrowser();
    browser.storage.set(TABLE_KEY, '{"v":1,"mode":');
    browser.storage.set(coupKey(null), '{"v":1,"id":"x","owner":null,"era":0,"stake":"ten"}');
    const page = browser.open();
    const { told } = tableOn(page);
    await quiet(browser);
    expect(told).toEqual(['granted']);
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(parseTable(browser.storage.get(TABLE_KEY))).toBeNull();
  });

  it('keeps its own keys apart from the medal bank’s: the table holds no medals', () => {
    expect(TABLE_KEY).toBe('baccarat-table');
    expect(coupKey(null)).toBe('baccarat-coup');
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
