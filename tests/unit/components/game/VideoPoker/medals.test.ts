import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { BANK_KEY, ledgerKey, type BankEvent } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, createLedger, give, parseLedger, receiptsOf, serializeLedger } from '@/components/game/MedalCenter/ledger';
import { PAY_TABLES, payout, rankCards } from '@/components/game/VideoPoker/engine';
import {
  GAME,
  HAND_KEY,
  NOTICE_KEY,
  cardsOf,
  createMedalPlay,
  handKey,
  markNoticeSeen,
  noticeSeen,
  parseHand,
  serializeHand,
  wonBy,
  type HandStore,
  type SavedHand,
} from '@/components/game/VideoPoker/medals';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';
import { FakeAccounts, signedIn } from '../MedalPusher/accountFakes';

// Video poker plays with the medal center's medals (medals.ts). These tests play it on the medal center's own fake
// browser (one storage, the member's card, tabs that hear each other), as the medal center's tests do. No account,
// no network.

const RANKS = '23456789TJQKA';
/** "K♠" → the card's number. */
const c = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);

/** Random numbers that make the deal (engine.ts) deal exactly `cards`: five to the hand, then five to come. */
function dealing(...cards: string[]): () => number {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const queue: number[] = [];
  cards.map(c).forEach((card, i) => {
    const j = deck.indexOf(card);
    queue.push((j - i + 0.5) / (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  });
  return () => queue.shift() ?? 0.5;
}

/** A full house dealt, and five cards to come that it never needs: held whole, it wins 9 a medal. */
const FULL_HOUSE = ['K♠', 'K♥', '7♦', '7♣', '7♠', '2♠', '3♥', '4♦', '5♣', '9♠'];
const ALL = 0b11111;

/** A machine on a page: its seat at the medal center, and its play with the medals. */
function machine(page: FakePage, random: () => number = dealing(...FULL_HOUSE), store: HandStore = page.env) {
  const seat = page.bank.sit(GAME, { granted: () => undefined, yielding: () => undefined });
  const play = createMedalPlay({ bank: page.bank, holding: () => seat.holding(), store, random, newId: () => page.browser.name('hand') });
  return { seat, play };
}

const storedBalance = (browser: FakeBrowser, uid: string | null = null): number | null => {
  const ledger = parseLedger(browser.storage.get(uid === null ? BANK_KEY : ledgerKey(uid)) ?? null);
  return ledger ? balanceOf(ledger) : null;
};
const storedHand = (browser: FakeBrowser, uid: string | null = null): SavedHand | null => parseHand(browser.storage.get(handKey(uid)) ?? null);

/** This device's storage as the hand sees it, which a test can make fail for the hand alone: reads, writes, or removing. */
function failing(page: FakePage) {
  const fail = { reads: false, writes: false, removes: false };
  const store: HandStore = {
    read: (key) => {
      if (fail.reads && key.startsWith(HAND_KEY)) throw new Error('SecurityError');
      return page.env.read(key);
    },
    write: (key, text) => {
      if (fail.writes && key.startsWith(HAND_KEY)) throw new Error('QuotaExceededError');
      page.env.write(key, text);
    },
    remove: (key) => {
      if (fail.removes && key.startsWith(HAND_KEY)) throw new Error('SecurityError');
      page.env.remove(key);
    },
  };
  return { fail, store };
}

const UID = 'test-player-1';

const hear = (page: FakePage): BankEvent[] => {
  const events: BankEvent[] = [];
  page.bank.listen((event) => events.push(event));
  return events;
};

describe('a bet and a win at the medal center', () => {
  it('takes the bet out of the medals once, as the hand is dealt, and writes the hand down with it', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { play } = machine(page);
    await quiet(browser);
    const dealt = play.deal(5, '9/6');
    expect(dealt.kind).toBe('dealt');
    if (dealt.kind !== 'dealt') return;
    expect(dealt.hand.hand).toEqual(FULL_HOUSE.slice(0, 5).map(c));
    expect(page.bank.balance()).toBe(WELCOME - 5);
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    expect(storedHand(browser)).toEqual(dealt.hand);
    // Pressing DEAL again while the hand is in play bets nothing more: the hand in play comes back, to be played first.
    expect(play.deal(5, '9/6')).toEqual({ kind: 'inPlay', hand: dealt.hand });
    expect(play.deal(1, '6/5')).toEqual({ kind: 'inPlay', hand: dealt.hand });
    expect(storedBalance(browser)).toBe(WELCOME - 5);
  });

  it('puts what the hand wins into the medals once, as it is drawn', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { play } = machine(page);
    await quiet(browser);
    const dealt = play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    const drawn = play.draw(dealt.hand.id, ALL);
    expect(drawn).toMatchObject({ kind: 'drawn', won: 45 });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45);
    expect(storedHand(browser)).toMatchObject({ id: dealt.hand.id, drawn: true, held: ALL });
    // Drawn again, by a second press or a second look: nothing more.
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'gone' });
    expect(play.draw(dealt.hand.id, 0)).toMatchObject({ kind: 'gone' });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45);
    // The next hand is a new bet.
    expect(play.deal(2, '9/6').kind).toBe('dealt');
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45 - 2);
  });

  it('puts nothing in for a hand that wins nothing, and pays the short royal below five medals', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const random = dealing('A♠', 'K♠', 'Q♠', 'J♠', '9♥', 'T♠', '2♥', '3♦', '4♣', '5♠');
    const { play } = machine(page, random);
    await quiet(browser);
    const dealt = play.deal(4, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    // Four to the royal held, and the ten of spades comes: 250 a medal at four medals, not 800.
    const drawn = play.draw(dealt.hand.id, 0b01111);
    expect(drawn).toMatchObject({ kind: 'drawn', won: 250 * 4 });
    expect(storedBalance(browser)).toBe(WELCOME - 4 + 1000);
    const nothing = createMedalPlay({ bank: page.bank, holding: () => true, store: page.env, random: dealing('2♠', '7♥', '9♦', 'J♣', '4♠', '3♥', '5♦', '8♣', 'T♥', 'Q♦') });
    const next = nothing.deal(1, '9/6');
    if (next.kind !== 'dealt') throw new Error('not dealt');
    expect(nothing.draw(next.hand.id, 0)).toMatchObject({ kind: 'drawn', won: 0 });
    expect(storedBalance(browser)).toBe(WELCOME - 4 + 1000 - 1);
  });

  it('bets nothing it cannot cover', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { play } = machine(page);
    await quiet(browser);
    expect(page.bank.take(WELCOME - 3)).toBe(true);
    expect(play.deal(5, '9/6')).toEqual({ kind: 'short' });
    expect(storedHand(browser)).toBeNull();
    expect(page.bank.balance()).toBe(3);
    expect(play.deal(3, '9/6').kind).toBe('dealt');
    expect(page.bank.balance()).toBe(0);
    // Nor a bet the machine does not take.
    expect(play.deal(6, '9/6')).toEqual({ kind: 'away' });
    expect(play.deal(0, '9/6')).toEqual({ kind: 'away' });
  });
});

describe('a reload between the deal and the draw', () => {
  it('finds the hand where it was left: the same cards, the same cards to come, no second bet, and the win once', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machine(first, Math.random);
    await quiet(browser);
    const dealt = one.play.deal(5, '8/5');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    const held = one.play.hold(dealt.hand.id, 0b10101);
    expect(held).toMatchObject({ held: 0b10101, drawn: false });
    const expected = cardsOf({ ...dealt.hand, held: 0b10101, drawn: true });
    first.close();

    // The page is opened again: the hand is there, held as it was, and nothing more has been bet.
    const second = browser.open();
    const two = machine(second, Math.random);
    await quiet(browser);
    expect(two.play.read()).toEqual({ ok: true, hand: { ...dealt.hand, held: 0b10101 } });
    expect(second.bank.balance()).toBe(WELCOME - 5);
    // The draw is the one the deal fixed: a reload is no second chance at it.
    const drawn = two.play.draw(dealt.hand.id, 0b10101);
    if (drawn.kind !== 'drawn') throw new Error('not drawn');
    expect(cardsOf(drawn.hand)).toEqual(expected);
    const won = payout(rankCards(expected), PAY_TABLES['8/5'], 5);
    expect(drawn.won).toBe(won);
    expect(storedBalance(browser)).toBe(WELCOME - 5 + won);
    second.close();

    // Reloaded once more, as the cards are still turning over: the hand is drawn, and its win is in, once.
    const third = browser.open();
    const three = machine(third);
    await quiet(browser);
    expect(three.play.read()).toEqual({ ok: true, hand: drawn.hand });
    expect(three.play.draw(dealt.hand.id, 0b10101)).toEqual({ kind: 'gone', hand: drawn.hand });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + won);
  });
});

describe('another tab', () => {
  it('stops this machine taking bets when another tab takes the card, plays the same hand there, and shows it here when the card comes back', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const one = machine(first);
    await quiet(browser);
    const dealt = one.play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');

    const second = browser.open();
    const two = machine(second);
    await quiet(browser);
    // The first tab waits: it bets nothing, draws nothing and holds nothing.
    expect(first.bank.getState().card).toBe('away');
    expect(one.seat.holding()).toBe(false);
    expect(one.play.deal(5, '9/6')).toEqual({ kind: 'away' });
    expect(one.play.draw(dealt.hand.id, ALL)).toEqual({ kind: 'away' });
    expect(one.play.hold(dealt.hand.id, ALL)).toBeNull();
    expect(one.play.discard()).toBe(false);
    // The second plays the hand the first dealt, from the same medals.
    expect(two.play.read()).toEqual({ ok: true, hand: dealt.hand });
    expect(two.play.deal(5, '9/6')).toEqual({ kind: 'inPlay', hand: dealt.hand });
    const drawn = two.play.draw(dealt.hand.id, ALL);
    expect(drawn).toMatchObject({ kind: 'drawn', won: 45 });
    if (drawn.kind !== 'drawn') return;

    // Back to the first: it has the card again, finds the hand drawn, and cannot draw it again.
    one.seat.play();
    await quiet(browser);
    expect(one.seat.holding()).toBe(true);
    expect(second.bank.getState().card).toBe('away');
    expect(one.play.read()).toEqual({ ok: true, hand: drawn.hand });
    expect(one.play.draw(dealt.hand.id, ALL)).toEqual({ kind: 'gone', hand: drawn.hand });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45);
  });
});

describe('a reset at the medal center', () => {
  it('throws the hand in play away with the medals it was bet from: nothing it would win goes into the new medals', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const page = browser.open();
    const heard = hear(page);
    const { play } = machine(page);
    await quiet(browser);
    const dealt = play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    hub.bank.reset();
    await quiet(browser);
    expect(heard).toEqual([{ type: 'reset' }]);
    expect(storedBalance(browser)).toBe(WELCOME);
    // Even before the machine does anything about it, the hand is of medals that are gone: it is no hand, and drawing it wins nothing.
    expect(play.read()).toEqual({ ok: true, hand: null });
    expect(play.draw(dealt.hand.id, ALL)).toEqual({ kind: 'gone', hand: null });
    expect(storedBalance(browser)).toBe(WELCOME);
    // The machine starts over, once on this device.
    expect(page.bank.restartDue(GAME)).toBe(true);
    expect(play.restartIfDue()).toBe(true);
    await quiet(browser);
    expect(browser.storage.has(HAND_KEY)).toBe(false);
    expect(page.bank.restartDue(GAME)).toBe(false);
    expect(play.restartIfDue()).toBe(false);
    // The next hand is bet from the new medals.
    expect(play.deal(5, '9/6').kind).toBe('dealt');
    expect(storedBalance(browser)).toBe(WELCOME - 5);
  });

  it('is acted on only by the tab that holds the card: a tab waiting in the background leaves the hand dealt since alone', async () => {
    const browser = new FakeBrowser();
    const hub = browser.open();
    hub.bank.subscribe(() => undefined);
    const waiting = browser.open();
    const behind = machine(waiting);
    await quiet(browser);
    const playing = browser.open();
    const front = machine(playing, dealing(...FULL_HOUSE));
    await quiet(browser);
    hub.bank.reset();
    await quiet(browser);
    expect(front.play.restartIfDue()).toBe(true);
    const fresh = front.play.deal(5, '9/6');
    if (fresh.kind !== 'dealt') throw new Error('not dealt');
    await quiet(browser);
    // The tab in the background heard of the reset too, but it does not hold the card: it writes nothing.
    expect(behind.play.discard()).toBe(false);
    expect(behind.play.restartIfDue()).toBe(false);
    expect(storedHand(browser)).toEqual(fresh.hand);
    expect(front.play.draw(fresh.hand.id, ALL)).toMatchObject({ kind: 'drawn', won: 45 });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45);
  });
});

describe('what is kept', () => {
  const VALID: SavedHand = { v: 1, id: 'hand00001', era: 0, device: 'device00001', hand: [0, 1, 2, 3, 4], stub: [5, 6, 7, 8, 9], coins: 5, payId: '9/6', held: 0, drawn: false };

  it('reads back exactly what it wrote, and works out the cards and the win from the cards, never from storage', () => {
    expect(parseHand(serializeHand(VALID))).toEqual(VALID);
    expect(wonBy(VALID)).toBe(0);
    const royal: SavedHand = { ...VALID, hand: [c('A♠'), c('K♠'), c('Q♠'), c('J♠'), c('2♥')], stub: [c('T♠'), 30, 31, 32, 33], held: 0b01111, drawn: true };
    expect(cardsOf(royal)).toEqual([c('A♠'), c('K♠'), c('Q♠'), c('J♠'), c('T♠')]);
    expect(wonBy(royal)).toBe(4000);
    expect(wonBy({ ...royal, coins: 1 })).toBe(250);
    // A win written into the text is not read: there is no such field.
    expect(parseHand(JSON.stringify({ ...royal, won: 1_000_000 }))).toEqual(royal);
    expect(handKey(null)).toBe(HAND_KEY);
    expect(handKey('test-player-1')).toBe(`${HAND_KEY}:test-player-1`);
  });

  /** Everything that might be lying under the hand's name: older or damaged text, or text from somewhere else entirely. */
  const OLD_OR_DAMAGED: string[] = [
    'not json',
    '',
    'null',
    '[]',
    '{}',
    '1000',
    JSON.stringify({ credits: 1000 }),
    JSON.stringify({ ...VALID, v: 2 }),
    JSON.stringify({ ...VALID, v: 0 }),
    JSON.stringify({ ...VALID, id: 'NOT AN ID' }),
    JSON.stringify({ ...VALID, era: -1 }),
    JSON.stringify({ ...VALID, era: 1.5 }),
    JSON.stringify({ ...VALID, device: undefined }),
    JSON.stringify({ ...VALID, device: 'NOT A DEVICE' }),
    JSON.stringify({ ...VALID, device: 7 }),
    JSON.stringify({ ...VALID, hand: [0, 1, 2, 3] }),
    JSON.stringify({ ...VALID, hand: [0, 1, 2, 3, 52] }),
    JSON.stringify({ ...VALID, hand: [0, 1, 2, 3, '4'] }),
    JSON.stringify({ ...VALID, stub: [0, 6, 7, 8, 9] }),
    JSON.stringify({ ...VALID, coins: 0 }),
    JSON.stringify({ ...VALID, coins: 6 }),
    JSON.stringify({ ...VALID, coins: 2.5 }),
    JSON.stringify({ ...VALID, payId: '10/7' }),
    JSON.stringify({ ...VALID, held: 32 }),
    JSON.stringify({ ...VALID, drawn: 'yes' }),
    JSON.stringify({ ...VALID, stub: undefined }),
    `{"v":1,"id":"${'a'.repeat(3000)}"}`,
  ];

  it('takes anything else under the hand’s name for no hand: nothing breaks, nothing is won, and the next deal goes over it', async () => {
    for (const text of OLD_OR_DAMAGED) {
      expect(parseHand(text)).toBeNull();
      const browser = new FakeBrowser();
      browser.storage.set(HAND_KEY, text);
      const page = browser.open();
      const { play } = machine(page);
      await quiet(browser);
      expect(play.read()).toEqual({ ok: true, hand: null });
      expect(play.draw('hand00001', ALL)).toEqual({ kind: 'gone', hand: null });
      expect(play.restartIfDue()).toBe(false);
      const dealt = play.deal(5, '9/6');
      expect(dealt.kind).toBe('dealt');
      expect(storedHand(browser)).toEqual(dealt.kind === 'dealt' ? dealt.hand : null);
      expect(storedBalance(browser)).toBe(WELCOME - 5);
    }
    expect(parseHand(undefined)).toBeNull();
    expect(parseHand(42)).toBeNull();
  });

  it('keeps a hand of other medals out of play: of an era since reset, or of another copy of the medals', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { play } = machine(page);
    await quiet(browser);
    const device = page.bank.getState().ledger!.device;
    // The medals here are of era 0: a hand bet from era 3's is not theirs.
    browser.storage.set(HAND_KEY, serializeHand({ ...VALID, era: 3, device }));
    expect(play.read()).toEqual({ ok: true, hand: null });
    expect(play.draw(VALID.id, ALL)).toEqual({ kind: 'gone', hand: null });
    // Nor one bet from another copy of the medals (a guest's, say, whose medals have since become an account's).
    browser.storage.set(HAND_KEY, serializeHand({ ...VALID, device: 'elsewhere01' }));
    expect(play.read()).toEqual({ ok: true, hand: null });
    expect(play.draw(VALID.id, ALL)).toEqual({ kind: 'gone', hand: null });
    // This copy's, of this era, is the hand in play.
    browser.storage.set(HAND_KEY, serializeHand({ ...VALID, device }));
    expect(play.read()).toEqual({ ok: true, hand: { ...VALID, device } });
    expect(storedBalance(browser)).toBe(WELCOME);
  });

  it('plays from memory where storage keeps nothing at all, and still wins once', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { play } = machine(page);
    await quiet(browser);
    browser.blocked = true;
    const dealt = play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    expect(page.bank.balance()).toBe(WELCOME - 5);
    expect(play.read()).toEqual({ ok: false });
    expect(play.hold(dealt.hand.id, ALL)).toMatchObject({ held: ALL });
    const drawn = play.draw(dealt.hand.id, ALL);
    expect(drawn).toMatchObject({ kind: 'drawn', won: 45 });
    // Drawn again: it wins nothing.
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'gone' });
    expect(page.bank.balance()).toBe(WELCOME - 5 + 45);
  });

  it('wins nothing for a kept hand it cannot read back, and lets the cards wait, held as they were, until storage works again', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { fail, store } = failing(page);
    const { play } = machine(page, dealing(...FULL_HOUSE), store);
    await quiet(browser);
    const dealt = play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    expect(play.hold(dealt.hand.id, 0b00011)).toMatchObject({ held: 0b00011 });
    // Storage cannot be read: the hand storage keeps can be neither held nor drawn, and nothing is won.
    fail.reads = true;
    expect(play.read()).toEqual({ ok: false });
    expect(play.hold(dealt.hand.id, ALL)).toBeNull();
    expect(play.draw(dealt.hand.id, ALL)).toEqual({ kind: 'unsaved' });
    expect(storedHand(browser)).toEqual({ ...dealt.hand, held: 0b00011 });
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    fail.reads = false;
    // Readable again: the kept hand is the one in play, held as it was, and it is drawn once.
    expect(play.read()).toEqual({ ok: true, hand: { ...dealt.hand, held: 0b00011 } });
    expect(play.hold(dealt.hand.id, ALL)).toMatchObject({ held: ALL });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'drawn', won: 45 });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'gone' });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45);
  });

  it('wins nothing for a kept hand that storage will neither mark drawn nor let go of, so that no reload can draw it again', async () => {
    const browser = new FakeBrowser();
    const first = browser.open();
    const { fail, store } = failing(first);
    const one = machine(first, dealing(...FULL_HOUSE), store);
    await quiet(browser);
    const dealt = one.play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    fail.writes = true;
    fail.removes = true;
    expect(one.play.draw(dealt.hand.id, ALL)).toEqual({ kind: 'unsaved' });
    // Nor is a new hand dealt over it.
    expect(one.play.deal(5, '9/6')).toEqual({ kind: 'inPlay', hand: dealt.hand });
    expect(storedHand(browser)).toEqual(dealt.hand);
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    // The page is reloaded with storage working again: the hand is still dealt, and its win goes in once.
    first.close();
    const second = browser.open();
    const two = machine(second);
    await quiet(browser);
    expect(two.play.read()).toEqual({ ok: true, hand: dealt.hand });
    expect(two.play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'drawn', won: 45 });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45);
  });

  it('deals nothing where storage can be read but will neither take a new hand nor let go of the last one', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    const { fail, store } = failing(page);
    const { play } = machine(page, dealing(...FULL_HOUSE), store);
    await quiet(browser);
    fail.writes = true;
    fail.removes = true;
    expect(play.deal(5, '9/6')).toEqual({ kind: 'unsaved' });
    expect(page.bank.balance()).toBe(WELCOME);
  });

  it('never leaves a hand behind that a reload could draw again, when storage is too full to take the hand', async () => {
    const browser = new FakeBrowser();
    const page = browser.open();
    // Storage that takes the medals but, being full, not the hand.
    const full: HandStore = {
      read: (key) => page.env.read(key),
      write: (key, text) => {
        if (key.startsWith(HAND_KEY)) throw new Error('QuotaExceededError');
        page.env.write(key, text);
      },
      remove: (key) => page.env.remove(key),
    };
    const { play } = machine(page, dealing(...FULL_HOUSE), full);
    await quiet(browser);
    // An older hand, drawn and done, is lying there from before storage filled up.
    browser.storage.set(HAND_KEY, serializeHand({ ...VALID, device: page.bank.getState().ledger!.device, drawn: true }));
    const dealt = play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    // The old hand is gone, so that the new one is the hand in play here, from memory.
    expect(browser.storage.has(HAND_KEY)).toBe(false);
    expect(play.read()).toEqual({ ok: true, hand: dealt.hand });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'drawn', won: 45 });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'gone' });
    // A reload finds no hand: the bet and the win are in the medals, once each.
    const again = createMedalPlay({ bank: page.bank, holding: () => true, store: full });
    expect(again.read()).toEqual({ ok: true, hand: null });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45);
  });

  it('tells the player once that the machine plays with their medals now', () => {
    const storage = new Map<string, string>();
    const store: HandStore = { read: (key) => storage.get(key) ?? null, write: (key, text) => void storage.set(key, text), remove: (key) => void storage.delete(key) };
    expect(noticeSeen(store)).toBe(false);
    markNoticeSeen(store);
    expect(noticeSeen(store)).toBe(true);
    // Whatever was there before counts as told; storage that cannot be read tells them again, and nothing throws.
    storage.set(NOTICE_KEY, 'anything');
    expect(noticeSeen(store)).toBe(true);
    const blocked: HandStore = {
      read: () => {
        throw new Error('blocked');
      },
      write: () => {
        throw new Error('blocked');
      },
      remove: () => undefined,
    };
    expect(noticeSeen(blocked)).toBe(false);
    expect(() => markNoticeSeen(blocked)).not.toThrow();
  });
});

describe('a player who signs in or out with a hand on the machine', () => {
  const setup = () => {
    const browser = new FakeBrowser();
    const accounts = new FakeAccounts(() => browser.clock);
    const machines = new FakeAccounts(() => browser.clock);
    const page = browser.open();
    return { browser, accounts, machines, page };
  };
  const guestAgain = { uid: null, settled: true, expected: false };

  it('brings a guest’s hand along when the guest’s medals become the account’s, and leaves nothing for the next guest', async () => {
    const { browser, accounts, machines, page } = setup();
    const { play } = machine(page);
    await quiet(browser);
    const dealt = play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    // The account has no medals yet: the guest's, with the bet out of them, become the account's.
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME - 5 });
    expect(play.read()).toEqual({ ok: true, hand: dealt.hand });
    // The account finishes the hand it paid for: the win goes into the account's medals, once, and the hand is kept
    // under the account from now on.
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'drawn', won: 45 });
    expect(storedBalance(browser, UID)).toBe(WELCOME - 5 + 45);
    expect(storedHand(browser, UID)).toMatchObject({ id: dealt.hand.id, drawn: true });
    expect(browser.storage.has(HAND_KEY)).toBe(false);
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'gone' });
    // Signed out: a new guest's medals, and no hand of the account's (nor the old guest's) for them to draw.
    page.bank.attend(guestAgain, accounts.store, { machines: machines.store });
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: null, balance: WELCOME });
    expect(play.read()).toEqual({ ok: true, hand: null });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'gone', hand: null });
    expect(storedBalance(browser)).toBe(WELCOME);
  });

  it('never lets the next guest draw a hand the account took over, even when its guest copy could not be taken away', async () => {
    const { browser, accounts, machines, page } = setup();
    const { fail, store } = failing(page);
    const { play } = machine(page, dealing(...FULL_HOUSE), store);
    await quiet(browser);
    const dealt = play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    await quiet(browser);
    fail.removes = true;
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'drawn', won: 45 });
    // The guest's copy is still lying there, dealt.
    expect(storedHand(browser)).toEqual(dealt.hand);
    fail.removes = false;
    page.bank.attend(guestAgain, accounts.store, { machines: machines.store });
    await quiet(browser);
    // It was bet from medals that are the account's now: the new guest's medals are another copy, and it is not theirs.
    expect(play.read()).toEqual({ ok: true, hand: null });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'gone', hand: null });
    expect(page.bank.balance()).toBe(WELCOME);
  });

  it('leaves a guest’s hand with the guest when the account has medals of its own, and lets the guest finish it once', async () => {
    const { browser, accounts, machines, page } = setup();
    accounts.put(UID, serializeLedger(give(createLedger('laptop0001'), 400)), 'm-elsewhere');
    const { play } = machine(page);
    await quiet(browser);
    const dealt = play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    await quiet(browser);
    expect(page.bank.getState()).toMatchObject({ owner: UID, balance: WELCOME + 400 });
    // The account's medals did not pay for the guest's hand: it is not theirs to draw.
    expect(play.read()).toEqual({ ok: true, hand: null });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'gone', hand: null });
    expect(storedBalance(browser, UID)).toBe(WELCOME + 400);
    page.bank.attend(guestAgain, accounts.store, { machines: machines.store });
    await quiet(browser);
    // The guest again, with the guest's medals: the hand is there, and wins once.
    expect(play.read()).toEqual({ ok: true, hand: dealt.hand });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'drawn', won: 45 });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45);
    expect(storedBalance(browser, UID)).toBe(WELCOME + 400);
  });

  it('keeps a hand storage would not take with the player who bet it, whoever signs in meanwhile', async () => {
    const { browser, accounts, machines, page } = setup();
    accounts.put(UID, serializeLedger(give(createLedger('laptop0001'), 400)), 'm-elsewhere');
    const { fail, store } = failing(page);
    const { play } = machine(page, dealing(...FULL_HOUSE), store);
    await quiet(browser);
    fail.writes = true;
    const dealt = play.deal(5, '9/6');
    if (dealt.kind !== 'dealt') throw new Error('not dealt');
    expect(browser.storage.has(HAND_KEY)).toBe(false);
    expect(play.read()).toEqual({ ok: true, hand: dealt.hand });
    page.bank.attend(signedIn(UID), accounts.store, { machines: machines.store });
    await quiet(browser);
    // The account never bet on the hand this page holds for the guest: not after a write failed,
    expect(play.read()).toEqual({ ok: true, hand: null });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'gone', hand: null });
    // nor when storage cannot be read either.
    fail.reads = true;
    expect(play.draw(dealt.hand.id, ALL)).toEqual({ kind: 'unsaved' });
    expect(storedBalance(browser, UID)).toBe(WELCOME + 400);
    fail.reads = false;
    page.bank.attend(guestAgain, accounts.store, { machines: machines.store });
    await quiet(browser);
    // Back to the guest who bet it: theirs, and won once.
    expect(play.read()).toEqual({ ok: true, hand: dealt.hand });
    expect(play.draw(dealt.hand.id, ALL)).toMatchObject({ kind: 'drawn', won: 45 });
    expect(page.bank.balance()).toBe(WELCOME - 5 + 45);
    expect(storedBalance(browser, UID)).toBe(WELCOME + 400);
  });
});

describe('a browser that dies between two writes', () => {
  // The hand and the medals are two writes (medals.ts): the browser is killed at every moment of a hand, started again,
  // and the machine plays on from what it left. Every hand is paid exactly once, or, if its bet never went in, never
  // dealt at all.
  const machines = new Map<FakeBrowser, ReturnType<typeof machine>>();
  const setUp = async (cards: readonly string[] = FULL_HOUSE) => {
    const browser = new FakeBrowser();
    const at = machine(browser.open(), dealing(...cards));
    await quiet(browser);
    machines.set(browser, at);
    return browser;
  };
  const spentIn = (browser: FakeBrowser): number => {
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    return ledger.rows[ledger.device]?.spent ?? 0;
  };
  /** The machine opened again on what the browser left: a hand still dealt is drawn holding everything. */
  const playOn = async (after: FakeBrowser) => {
    const at = machine(after.open());
    await quiet(after);
    const read = at.play.read();
    if (read.ok && read.hand && !read.hand.drawn) expect(at.play.draw(read.hand.id, ALL).kind).toBe('drawn');
    return at;
  };

  for (const [what, cards, won] of [
    ['a full house', FULL_HOUSE, 45],
    ['a hand that wins nothing', ['2♠', '7♥', '9♦', 'J♣', '4♠', '3♥', '5♦', '8♣', 'T♥', 'Q♦'], 0],
  ] as const) {
    it(`takes the bet and pays ${what} exactly once, or never deals it, wherever the browser dies in a hand`, async () => {
      const writes = await atEveryWrite(
        () => setUp(cards),
        (browser) => {
          const { play } = machines.get(browser)!;
          const dealt = play.deal(5, '9/6');
          if (dealt.kind !== 'dealt') return;
          play.hold(dealt.hand.id, ALL);
          play.draw(dealt.hand.id, ALL);
        },
        async (after, reached) => {
          const dealt = spentIn(after) === 5;
          const { play } = await playOn(after);
          expect(storedBalance(after), `died after ${reached} writes`).toBe(dealt ? WELCOME - 5 + won : WELCOME);
          const left = storedHand(after);
          expect(left === null || left.drawn, `died after ${reached} writes`).toBe(true);
          // Looked at again, nothing more is paid; the next hand lets go of this one's receipts.
          play.read();
          expect(storedBalance(after)).toBe(dealt ? WELCOME - 5 + won : WELCOME);
          const next = play.deal(1, '9/6');
          expect(next.kind).toBe('dealt');
          const ledger = parseLedger(after.storage.get(BANK_KEY) ?? null)!;
          expect(receiptsOf(ledger, ledger.device).ids, `died after ${reached} writes`).toEqual([`${GAME}:${next.kind === 'dealt' ? next.hand.id : ''}:deal`]);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(won > 0 ? 4 : 3);
    });
  }

  it('takes a hand dealt before receipts at its word: its bet was taken, and its win is paid once', async () => {
    const browser = await setUp();
    const page = browser.pages[0];
    const { play } = machines.get(browser)!;
    // As the machine wrote it before receipts: the bet taken, and the hand written down.
    page.bank.take(5);
    const device = parseLedger(browser.storage.get(BANK_KEY) ?? null)!.device;
    const old: SavedHand = { v: 1, id: 'oldhand1', era: 0, device, hand: FULL_HOUSE.slice(0, 5).map(c), stub: FULL_HOUSE.slice(5).map(c), coins: 5, payId: '9/6', held: 0, drawn: false };
    browser.storage.set(handKey(null), serializeHand(old));
    expect(play.read()).toEqual({ ok: true, hand: old });
    expect(play.draw('oldhand1', ALL)).toMatchObject({ kind: 'drawn', won: 45 });
    expect(play.draw('oldhand1', ALL)).toMatchObject({ kind: 'gone' });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 45);
  });

  it('pays a hand dealt before receipts exactly once wherever the browser dies as it is drawn', async () => {
    await atEveryWrite(
      async () => {
        const browser = await setUp();
        const page = browser.pages[0];
        page.bank.take(5);
        const device = parseLedger(browser.storage.get(BANK_KEY) ?? null)!.device;
        const old: SavedHand = { v: 1, id: 'oldhand1', era: 0, device, hand: FULL_HOUSE.slice(0, 5).map(c), stub: FULL_HOUSE.slice(5).map(c), coins: 5, payId: '9/6', held: 0, drawn: false };
        browser.storage.set(handKey(null), serializeHand(old));
        return browser;
      },
      (browser) => {
        machines.get(browser)!.play.draw('oldhand1', ALL);
      },
      async (after, reached) => {
        await playOn(after);
        expect(storedBalance(after), `died after ${reached} writes`).toBe(WELCOME - 5 + 45);
      },
    );
  });
});

describe('what is not play', () => {
  it('leaves the medals alone in the analysis, the odds and the simulation: none of them reaches the medal center', () => {
    const dir = path.resolve(__dirname, '../../../../../src/components/game/VideoPoker');
    for (const file of ['analysis.ts', 'sim.ts', 'precomputed.ts', 'charts.tsx', 'OddsTab.tsx', 'SimTab.tsx', 'engine.ts', 'doubleUp.ts']) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/MedalCenter|medals'|bank\(/);
    }
  });
});
