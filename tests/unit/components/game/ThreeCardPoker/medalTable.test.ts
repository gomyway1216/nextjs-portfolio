import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BANK_KEY } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, give, parseLedger, serializeLedger } from '@/components/game/MedalCenter/ledger';
import {
  ANTE_BONUS_PAYS,
  CATEGORIES,
  PAIR_PLUS_TABLES,
  dealRound,
  settle,
  type Card,
  type Deal,
  type Rank,
  type Suit,
} from '@/components/game/ThreeCardPoker/engine';
import {
  BET_STEPS,
  HAND_MAX,
  SPOT_MAX,
  TABLE_KEY,
  TCP_GAME,
  createTable,
  handStage,
  parseHand,
  serializeHand,
  tableKey,
  validBets,
  type SavedHand,
  type TableMedals,
  type TableStore,
} from '@/components/game/ThreeCardPoker/medalTable';
import { FakeBrowser, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// Three Card Poker at the medal center, against the medal center's real bank (createBank) in a browser of fakes: one
// storage every page shares, the one member's card, and the channel between the pages. No account is named and
// nothing is fetched.

const c = (text: string): Card => ({ rank: text[0] as Rank, suit: text[1] as Suit });
const deal = (player: string[], dealer: string[]): Deal => ({ player: player.map(c), dealer: dealer.map(c) });

/** A straight flush against a dealer who does not qualify: the Ante wins, Play pushes, the Ante Bonus pays 5 and Pair Plus 40. */
const BIG_WIN = deal(['Q♠', 'K♠', 'A♠'], ['2♥', '5♦', '7♣']);
/** A pair of eights against a pair of kings: the Ante and Play lose, and Pair Plus is paid on the eights all the same. */
const PAIR_LOSES = deal(['8♠', '8♥', '2♣'], ['K♣', 'K♦', '3♠']);
/** Seven-high against anything: a hand to fold. */
const RAGS = deal(['7♠', '4♥', '2♣'], ['J♣', '9♦', '3♠']);

const storedBalance = (browser: FakeBrowser): number | null => {
  const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null);
  return ledger ? balanceOf(ledger) : null;
};

/** A page with the table on it: it sits at the medal center as the game does, and plays with the bank's medals. */
function table(page: FakePage, onYield: (why: string) => void = () => undefined) {
  const told: string[] = [];
  const seat = page.bank.sit(TCP_GAME, {
    granted: (moved) => told.push(moved ? 'granted, moved' : 'granted'),
    yielding: (why) => {
      told.push(`yielding ${why}`);
      onYield(why);
    },
  });
  const medals: TableMedals = {
    holding: () => seat.holding(),
    ledger: () => {
      const ledger = page.bank.getState().ledger;
      return ledger ? { era: ledger.era, device: ledger.device } : null;
    },
    balance: () => page.bank.balance(),
    take: (n) => page.bank.take(n),
    give: (n) => page.bank.give(n),
  };
  // The browser's storage, which can be made full: then it can be read, and takes no write.
  const store: TableStore = {
    read: (key) => page.env.read(key),
    write: (key, text) => {
      if (full.on) throw new Error('full');
      page.env.write(key, text);
    },
    remove: (key) => page.env.remove(key),
  };
  const full = { on: false };
  return { seat, told, full, game: createTable(medals, store) };
}

async function seated(browser = new FakeBrowser()) {
  const page = browser.open();
  const at = table(page);
  await quiet(browser);
  expect(at.seat.holding()).toBe(true);
  return { browser, page, ...at };
}

describe('the bets are medal-sized', () => {
  it('bets 1, 5 or 10 medals a press, up to 10 on each spot and 30 a hand', () => {
    expect([...BET_STEPS]).toEqual([1, 5, 10]);
    expect(SPOT_MAX).toBe(10);
    expect(HAND_MAX).toBe(30);
    expect(validBets({ ante: 1, pairPlus: 0 })).toBe(true);
    expect(validBets({ ante: 10, pairPlus: 10 })).toBe(true);
    for (const bets of [
      { ante: 0, pairPlus: 0 },
      { ante: 11, pairPlus: 0 },
      { ante: 5, pairPlus: 11 },
      { ante: 2.5, pairPlus: 0 },
      { ante: 5, pairPlus: -1 },
      { ante: Number.NaN, pairPlus: 0 },
    ]) {
      expect(validBets(bets), JSON.stringify(bets)).toBe(false);
    }
  });

  it('pays every bet in whole medals: every pay table is whole multiples, so nothing is ever rounded', () => {
    for (const table of [...Object.values(PAIR_PLUS_TABLES), ANTE_BONUS_PAYS]) {
      for (const category of CATEGORIES) expect(Number.isInteger(table[category])).toBe(true);
    }
    let seed = 7;
    const rng = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 400; i++) {
      const { player, dealer } = dealRound(rng);
      for (let ante = 1; ante <= SPOT_MAX; ante++) {
        for (const pairPlus of [0, 1, 7, SPOT_MAX]) {
          for (const decision of ['play', 'fold'] as const) {
            const settlement = settle({ ante, pairPlus }, decision, player, dealer);
            expect(Number.isSafeInteger(settlement.returned)).toBe(true);
            expect(Number.isSafeInteger(settlement.net)).toBe(true);
            for (const line of settlement.lines) expect(Number.isSafeInteger(line.returned)).toBe(true);
          }
        }
      }
    }
    // The most a hand can win back: a straight flush with 10 on each spot, against a dealer who does not qualify.
    expect(settle({ ante: SPOT_MAX, pairPlus: SPOT_MAX }, 'play', BIG_WIN.player, BIG_WIN.dealer).returned).toBe(20 + 10 + 50 + 410);
  });
});

describe('each medal moves once', () => {
  it('takes the Ante and Pair Plus at the deal, once, and deals nothing more while that hand is on the table', async () => {
    const { browser, game } = await seated();
    const dealt = game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN);
    expect(dealt.ok).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    expect(handStage(game.open())).toBe('deciding');
    // The dealer's cards are fixed from the deal: they are kept with the hand.
    expect(game.open()?.dealer).toEqual(BIG_WIN.dealer);
    expect(game.deal({ ante: 5, pairPlus: 5 }, RAGS)).toEqual({ ok: false, why: 'busy' });
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    expect(game.open()?.player).toEqual(BIG_WIN.player);
  });

  it('takes the Play bet when the player plays, once', async () => {
    const { browser, game } = await seated();
    game.deal({ ante: 5, pairPlus: 0 }, RAGS);
    const played = game.play();
    expect(played.ok && played.hand.decision).toBe('play');
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    expect(game.play()).toEqual({ ok: false, why: 'decided' });
    expect(game.fold()).toEqual({ ok: false, why: 'decided' });
    expect(storedBalance(browser)).toBe(WELCOME - 10);
  });

  it('takes nothing for a fold, and loses the Ante and the Pair Plus bet with it', async () => {
    const { browser, game } = await seated();
    game.deal({ ante: 3, pairPlus: 2 }, RAGS);
    expect(game.fold().ok).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    const paid = game.pay();
    expect(paid?.settlement.showdown).toBe('fold');
    expect(paid?.settlement.returned).toBe(0);
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    expect(handStage(game.open())).toBe('over');
    expect(game.play()).toEqual({ ok: false, why: 'none' });
  });

  it('settles Pair Plus on the player’s own cards, whatever the showdown', async () => {
    const { browser, game } = await seated();
    game.deal({ ante: 5, pairPlus: 5 }, PAIR_LOSES);
    game.play();
    expect(storedBalance(browser)).toBe(WELCOME - 15);
    const paid = game.pay();
    expect(paid?.settlement.showdown).toBe('lose');
    expect(paid?.settlement.lines.find((line) => line.id === 'pairPlus')).toMatchObject({ outcome: 'win', returned: 10 });
    expect(storedBalance(browser)).toBe(WELCOME - 15 + 10);
  });

  it('pays a win back into the medals once, however often it is asked', async () => {
    const { browser, game } = await seated();
    game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN);
    game.play();
    const won = settle({ ante: 5, pairPlus: 5 }, 'play', BIG_WIN.player, BIG_WIN.dealer).returned;
    expect(won).toBe(10 + 5 + 25 + 205);
    expect(game.pay()?.settlement.returned).toBe(won);
    expect(storedBalance(browser)).toBe(WELCOME - 15 + won);
    expect(game.pay()).toBeNull();
    expect(game.pay()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME - 15 + won);
    // And the next hand can be dealt.
    expect(game.deal({ ante: 1, pairPlus: 0 }, RAGS).ok).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 15 + won - 1);
  });

  it('pays nothing before the hand is decided', async () => {
    const { browser, game } = await seated();
    game.deal({ ante: 5, pairPlus: 0 }, BIG_WIN);
    expect(game.pay()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME - 5);
  });

  it('keeps the Play bet behind at the deal, and refuses bets it does not hold or the table does not take', async () => {
    const { browser, page, game } = await seated();
    expect(page.bank.take(WELCOME - 14)).toBe(true);
    expect(storedBalance(browser)).toBe(14);
    // 5 + 5 now, and 5 more for Play, is 15: one short.
    expect(game.deal({ ante: 5, pairPlus: 5 }, RAGS)).toEqual({ ok: false, why: 'short' });
    expect(game.deal({ ante: 11, pairPlus: 0 }, RAGS)).toEqual({ ok: false, why: 'bets' });
    expect(game.deal({ ante: 0, pairPlus: 5 }, RAGS)).toEqual({ ok: false, why: 'bets' });
    expect(storedBalance(browser)).toBe(14);
    expect(game.deal({ ante: 5, pairPlus: 4 }, RAGS).ok).toBe(true);
    expect(storedBalance(browser)).toBe(5);
  });
});

describe('a reload mid-hand', () => {
  it('resumes a hand that was dealt: the stakes are not given back, the dealer’s cards are the same, and Play is taken once', async () => {
    const browser = new FakeBrowser();
    const before = await seated(browser);
    before.game.deal({ ante: 4, pairPlus: 2 }, BIG_WIN);
    before.page.close();
    // The page comes back: a new page in the same browser, with the same storage.
    const after = await seated(browser);
    expect(storedBalance(browser)).toBe(WELCOME - 6);
    const hand = after.game.open();
    expect(handStage(hand)).toBe('deciding');
    expect(hand?.player).toEqual(BIG_WIN.player);
    expect(hand?.dealer).toEqual(BIG_WIN.dealer);
    expect(hand?.bets).toEqual({ ante: 4, pairPlus: 2 });
    // Nothing new can be dealt over it.
    expect(after.game.deal({ ante: 1, pairPlus: 0 }, RAGS)).toEqual({ ok: false, why: 'busy' });
    expect(after.game.play().ok).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    const won = after.game.pay()?.settlement.returned ?? 0;
    expect(won).toBe(settle({ ante: 4, pairPlus: 2 }, 'play', BIG_WIN.player, BIG_WIN.dealer).returned);
    expect(storedBalance(browser)).toBe(WELCOME - 10 + won);
  });

  it('pays a hand that was decided before the reload, once, when the page holds the card again', async () => {
    const browser = new FakeBrowser();
    const before = await seated(browser);
    before.game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN);
    before.game.play();
    before.page.close();
    const after = await seated(browser);
    expect(handStage(after.game.open())).toBe('unpaid');
    expect(storedBalance(browser)).toBe(WELCOME - 15);
    expect(after.game.pay()?.settlement.returned).toBe(245);
    expect(storedBalance(browser)).toBe(WELCOME - 15 + 245);
    after.page.close();
    const later = await seated(browser);
    expect(handStage(later.game.open())).toBe('over');
    expect(later.game.pay()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME - 15 + 245);
  });
});

describe('another tab', () => {
  it('stops the table betting when another tab takes the card, carries on from what that tab did, and pays once', async () => {
    const browser = new FakeBrowser();
    const first = await seated(browser);
    first.game.deal({ ante: 5, pairPlus: 0 }, BIG_WIN);
    // The same game in a second tab: the first waits, and can take, give and decide nothing.
    const secondPage = browser.open();
    const second = table(secondPage);
    await quiet(browser);
    expect(first.page.bank.getState().card).toBe('away');
    expect(first.seat.holding()).toBe(false);
    expect(first.game.play()).toEqual({ ok: false, why: 'card' });
    expect(first.game.fold()).toEqual({ ok: false, why: 'card' });
    expect(first.game.deal({ ante: 1, pairPlus: 0 }, RAGS)).toEqual({ ok: false, why: 'card' });
    expect(first.game.pay()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    // The second tab has the hand the first dealt, and plays it.
    expect(second.game.open()?.player).toEqual(BIG_WIN.player);
    expect(second.game.play().ok).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    // Back to the first ("Play here"): it is told the other played, finds the hand decided, and pays it.
    first.seat.play();
    await quiet(browser);
    expect(first.told.at(-1)).toBe('granted, moved');
    expect(secondPage.bank.getState().card).toBe('away');
    expect(handStage(first.game.open())).toBe('unpaid');
    const won = first.game.pay()?.settlement.returned ?? 0;
    expect(won).toBe(settle({ ante: 5, pairPlus: 0 }, 'play', BIG_WIN.player, BIG_WIN.dealer).returned);
    expect(second.game.pay()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME - 10 + won);
  });

  it('pays a decided hand while it still holds the card, as the card goes to another tab', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const paidAs: (number | null)[] = [];
    // As the game does: when the card is about to go, a decided hand still to be paid is paid then.
    const at = table(page, () => paidAs.push(at.game.pay()?.settlement.returned ?? null));
    await quiet(browser);
    at.game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN);
    at.game.play();
    table(browser.open());
    await quiet(browser);
    expect(at.told).toEqual(['granted', 'yielding moment']);
    expect(paidAs).toEqual([245]);
    expect(storedBalance(browser)).toBe(WELCOME - 15 + 245);
  });
});

describe('the medal center’s reset', () => {
  it('voids a hand from before it: nothing of it is paid, the table starts over once, and a new hand is dealt from the new medals', async () => {
    const { browser, page, game } = await seated();
    game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN);
    game.play();
    page.bank.reset();
    await quiet(browser);
    expect(page.bank.getState().ledger?.era).toBe(1);
    expect(storedBalance(browser)).toBe(WELCOME);
    // The hand on the table was dealt with medals the reset threw away: it is no hand now.
    expect(game.open()).toBeNull();
    expect(game.pay()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(page.bank.restartDue(TCP_GAME)).toBe(true);
    const key = tableKey(page.bank.getState().ledger?.device ?? '');
    expect(browser.storage.has(key)).toBe(true);
    game.restart();
    expect(browser.storage.has(key)).toBe(false);
    page.bank.restarted(TCP_GAME);
    await quiet(browser);
    expect(page.bank.restartDue(TCP_GAME)).toBe(false);
    expect(game.deal({ ante: 2, pairPlus: 0 }, RAGS).ok).toBe(true);
    expect(game.open()?.era).toBe(1);
    expect(storedBalance(browser)).toBe(WELCOME - 2);
  });

  it('keeps a hand of the medals’ own era when it is told to start over late', async () => {
    const { page, game } = await seated();
    page.bank.reset();
    game.deal({ ante: 2, pairPlus: 0 }, RAGS);
    game.restart();
    expect(handStage(game.open())).toBe('deciding');
  });
});

describe('what storage holds', () => {
  const hand: SavedHand = { v: 1, era: 0, device: 'device0001', player: BIG_WIN.player, dealer: BIG_WIN.dealer, bets: { ante: 5, pairPlus: 5 }, decision: 'play', paid: false };

  it('reads back what it writes', () => {
    expect(parseHand(serializeHand(hand))).toEqual(hand);
    expect(JSON.parse(serializeHand(hand)).cards).toHaveLength(6);
    expect(tableKey('device0001')).toBe(`${TABLE_KEY}:device0001`);
  });

  it('reads anything else as no hand, and never throws', () => {
    const good = JSON.parse(serializeHand(hand)) as Record<string, unknown>;
    const broken: unknown[] = [
      null,
      undefined,
      42,
      '',
      'not json',
      '{',
      '[]',
      'null',
      '"a string"',
      JSON.stringify({ ...good, v: 2 }),
      JSON.stringify({ ...good, v: undefined }),
      JSON.stringify({ ...good, era: -1 }),
      JSON.stringify({ ...good, era: 1.5 }),
      JSON.stringify({ ...good, device: undefined }),
      JSON.stringify({ ...good, device: 'Not A Device!' }),
      JSON.stringify({ ...good, cards: [0, 1, 2, 3, 4] }),
      JSON.stringify({ ...good, cards: [0, 1, 2, 3, 4, 4] }),
      JSON.stringify({ ...good, cards: [0, 1, 2, 3, 4, 52] }),
      JSON.stringify({ ...good, cards: ['0', 1, 2, 3, 4, 5] }),
      JSON.stringify({ ...good, ante: 0 }),
      JSON.stringify({ ...good, ante: 11 }),
      JSON.stringify({ ...good, ante: '5' }),
      JSON.stringify({ ...good, pairPlus: 2.5 }),
      JSON.stringify({ ...good, decision: 'raise' }),
      JSON.stringify({ ...good, decision: null, paid: true }),
      JSON.stringify({ ...good, paid: 'yes' }),
      `{"v":1,"era":0,"pad":"${'x'.repeat(2000)}"}`,
      // What the table kept when it played with chips: it kept nothing, but a bankroll is what a save of it would hold.
      JSON.stringify({ bankroll: 1000, bets: { ante: 5, pairPlus: 0 } }),
    ];
    for (const text of broken) expect(parseHand(text), String(text).slice(0, 60)).toBeNull();
  });

  it('opens over an unreadable save with no hand on the table, and deals over it', async () => {
    const browser = new FakeBrowser();
    // A guest's medals kept under a name of their own, and text the table cannot read under it and under its bare name.
    browser.storage.set(BANK_KEY, serializeLedger(createLedger('seedtable01')));
    browser.storage.set(tableKey('seedtable01'), '{"bankroll":1000,"chips":[1,5,25,100,500]}');
    browser.storage.set(TABLE_KEY, '{"bankroll":1000,"bets":{"ante":5,"pairPlus":0}}');
    const { game } = await seated(browser);
    expect(game.open()).toBeNull();
    expect(game.deal({ ante: 1, pairPlus: 0 }, RAGS).ok).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 1);
    expect(handStage(parseHand(browser.storage.get(tableKey('seedtable01'))))).toBe('deciding');
  });

  it('plays on from memory in a browser whose storage throws, without moving a medal twice', () => {
    let balance = 50;
    const medals: TableMedals = {
      holding: () => true,
      ledger: () => ({ era: 0, device: 'device0001' }),
      balance: () => balance,
      take: (n) => (n <= balance ? ((balance -= n), true) : false),
      give: (n) => ((balance += n), true),
    };
    const blocked: TableStore = {
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
    const game = createTable(medals, blocked);
    expect(game.open()).toBeNull();
    expect(game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN).ok).toBe(true);
    expect(game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN)).toEqual({ ok: false, why: 'busy' });
    expect(game.play().ok).toBe(true);
    expect(balance).toBe(35);
    expect(game.pay()?.settlement.returned).toBe(245);
    expect(game.pay()).toBeNull();
    expect(balance).toBe(35 + 245);
  });
});

describe('a browser whose storage is full: it can be read, and takes no write', () => {
  it('moves no medals for a step it cannot write down, so a reload can never take or pay them again', async () => {
    const { browser, game, full } = await seated();
    full.on = true;
    expect(game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN)).toEqual({ ok: false, why: 'kept' });
    expect(storedBalance(browser)).toBe(WELCOME);
    expect(game.open()).toBeNull();
    full.on = false;
    expect(game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN).ok).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 10);

    full.on = true;
    expect(game.play()).toEqual({ ok: false, why: 'kept' });
    expect(game.fold()).toEqual({ ok: false, why: 'kept' });
    expect(storedBalance(browser)).toBe(WELCOME - 10);
    expect(handStage(game.open())).toBe('deciding');
    full.on = false;
    expect(game.play().ok).toBe(true);
    expect(storedBalance(browser)).toBe(WELCOME - 15);

    // Not written down as paid, not paid: it waits, as storage has it, and is paid once when it can be.
    full.on = true;
    expect(game.pay()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME - 15);
    expect(handStage(game.open())).toBe('unpaid');
    full.on = false;
    expect(game.pay()?.settlement.returned).toBe(245);
    expect(game.pay()).toBeNull();
    expect(storedBalance(browser)).toBe(WELCOME - 15 + 245);
  });
});

describe('signing in and out', () => {
  const UID = 'test-player-1';
  const signedOut = { uid: null, settled: true, expected: false };

  it('takes a guest’s hand into the account that the guest’s medals become, and the next guest’s medals can neither play it nor deal over it', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const { page, game } = await seated(browser);
    const guest = page.bank.getState().ledger?.device ?? '';
    expect(game.deal({ ante: 5, pairPlus: 5 }, BIG_WIN).ok).toBe(true);
    // The account has no medals yet: the guest's become the account's, name and all, and so does the hand.
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME - 10 });
    expect(page.bank.getState().ledger?.device).toBe(guest);
    expect(game.open()?.player).toEqual(BIG_WIN.player);

    // Signed out before the hand is decided: a new guest's medals, under a new name. They cannot play the hand their
    // stakes never paid for, and dealing with them leaves it where it is.
    page.bank.attend(signedOut, accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(page.bank.getState().ledger?.device).not.toBe(guest);
    expect(game.open()).toBeNull();
    expect(game.play()).toEqual({ ok: false, why: 'none' });
    expect(game.pay()).toBeNull();
    expect(game.deal({ ante: 1, pairPlus: 0 }, RAGS).ok).toBe(true);
    expect(page.bank.getState().balance).toBe(WELCOME - 1);
    expect(handStage(parseHand(browser.storage.get(tableKey(guest))))).toBe('deciding');

    // Signed in again: the account's medals and the account's hand, played and paid once.
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME - 10 });
    expect(game.open()?.player).toEqual(BIG_WIN.player);
    expect(game.play().ok).toBe(true);
    expect(game.pay()?.settlement.returned).toBe(245);
    expect(game.pay()).toBeNull();
    expect(page.bank.getState().balance).toBe(WELCOME - 15 + 245);
  });

  it('leaves a guest’s hand to the guest when the account has medals of its own, and plays it again when the guest is back', async () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    accounts.put(UID, serializeLedger(give(createLedger('laptop0001'), 400)), 'm-elsewhere');
    const { page, game } = await seated(browser);
    expect(game.deal({ ante: 5, pairPlus: 0 }, BIG_WIN).ok).toBe(true);
    page.bank.attend(signedIn(UID), accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME + 400 });
    // The account's medals did not pay for the guest's hand: it is not theirs to play.
    expect(game.open()).toBeNull();
    expect(game.play()).toEqual({ ok: false, why: 'none' });
    page.bank.attend(signedOut, accounts.store);
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME - 5 });
    expect(game.open()?.player).toEqual(BIG_WIN.player);
    expect(game.play().ok).toBe(true);
    expect(game.pay()?.settlement.returned).toBe(40);
    expect(page.bank.getState().balance).toBe(WELCOME - 10 + 40);
  });
});

describe('what is not real play', () => {
  it('leaves the medals alone: the simulation and the exact analysis never reach the medal center', () => {
    const dir = join(process.cwd(), 'src/components/game/ThreeCardPoker');
    for (const file of ['sim.ts', 'SimTab.tsx', 'analysis.ts', 'OddsTab.tsx', 'charts.tsx', 'engine.ts']) {
      const source = readFileSync(join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|bank\(\)|useBank/);
    }
  });
});
