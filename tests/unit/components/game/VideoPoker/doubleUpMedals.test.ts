import { describe, expect, it } from 'vitest';

import { BANK_KEY } from '@/components/game/MedalCenter/bank';
import { WELCOME, balanceOf, parseLedger, receiptsOf } from '@/components/game/MedalCenter/ledger';
import { DOUBLE_MAX } from '@/components/game/VideoPoker/doubleUp';
import {
  GAME,
  canDouble,
  createMedalPlay,
  doubleOf,
  doublePending,
  handKey,
  parseHand,
  serializeHand,
  type SavedHand,
} from '@/components/game/VideoPoker/medals';
import { FakeBrowser, atEveryWrite, quiet, type FakePage } from '../MedalCenter/bankFakes';

// The double-up at the medal center (medals.ts, doubleUp.ts): a win put on a double-up goes out of the player's
// medals as the dealer's card is turned, and comes back twice over, once over, or not at all as a card is picked,
// each under a receipt of its own. These play it on the medal center's fake browser, as medals.test.ts plays the
// hand; no account, no network.

const RANKS = '23456789TJQKA';
/** "K♠" → the card's number. */
const c = (s: string) => '♠♥♦♣'.indexOf(s[1]) * 13 + RANKS.indexOf(s[0]);
const FULL_HOUSE = ['K♠', 'K♥', '7♦', '7♣', '7♠', '2♠', '3♥', '4♦', '5♣', '9♠'];
const ALL = 0b11111;
const WON = 45;

/** The random numbers that deal `cards` (engine.ts): five to the hand, then five to come. */
function dealNumbers(cards: readonly string[]): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const out: number[] = [];
  cards.map(c).forEach((card, i) => {
    const j = deck.indexOf(card);
    out.push((j - i + 0.5) / (52 - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  });
  return out;
}
/** The random number that turns up `dealer` as the dealer's card (doubleUp.ts). */
const dealerNumber = (dealer: string) => (c(dealer) + 0.5) / 52;
/** The random number that puts `card` first of the four face-down cards, the dealer's card being `dealer`. */
const firstNumber = (dealer: string, card: string) => {
  const deck = Array.from({ length: 52 }, (_, i) => i).filter((x) => x !== c(dealer));
  return (deck.indexOf(c(card)) + 0.5) / 51;
};
/** One double-up: the dealer's card, and the card the first of the four turns out to be. */
const double = (dealer: string, first: string) => [dealerNumber(dealer), firstNumber(dealer, first), 0.5, 0.5, 0.5];

/** Random numbers handed out in order, and then 0.5 (a seven of diamonds as the dealer's card, and so on). */
const queue = (numbers: readonly number[]) => {
  const left = [...numbers];
  return () => left.shift() ?? 0.5;
};

function machine(page: FakePage, numbers: readonly number[] = dealNumbers(FULL_HOUSE)) {
  const seat = page.bank.sit(GAME, { granted: () => undefined, yielding: () => undefined });
  const play = createMedalPlay({ bank: page.bank, holding: () => seat.holding(), store: page.env, random: queue(numbers), newId: () => page.browser.name('hand') });
  return { seat, play };
}

const storedBalance = (browser: FakeBrowser): number => balanceOf(parseLedger(browser.storage.get(BANK_KEY) ?? null)!);
const storedHand = (browser: FakeBrowser): SavedHand | null => parseHand(browser.storage.get(handKey(null)) ?? null);

/** A full house dealt at five medals and drawn whole: 45 medals won, in the medals. */
async function won(...doubles: number[][]) {
  const browser = new FakeBrowser();
  const page = browser.open();
  const at = machine(page, [...dealNumbers(FULL_HOUSE), ...doubles.flat()]);
  await quiet(browser);
  const dealt = at.play.deal(5, '9/6');
  if (dealt.kind !== 'dealt') throw new Error('not dealt');
  const drawn = at.play.draw(dealt.hand.id, ALL);
  if (drawn.kind !== 'drawn' || drawn.won !== WON) throw new Error('not won');
  return { browser, page, ...at, id: dealt.hand.id };
}

describe('a win put on a double-up', () => {
  it('goes out of the medals as the dealer’s card is turned, and comes back twice over for a higher card', async () => {
    const { browser, play, id } = await won(double('2♠', 'A♥'));
    expect(storedBalance(browser)).toBe(WELCOME - 5 + WON);
    expect(canDouble(storedHand(browser)!)).toBe(true);

    const up = play.doubleUp(id);
    expect(up).toMatchObject({ kind: 'doubling', stake: WON });
    if (up.kind !== 'doubling') return;
    expect(up.hand.doubles).toEqual([{ dealer: c('2♠') }]);
    // The 45 are on the double: out of the medals until a card is picked.
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    expect(storedHand(browser)).toEqual(up.hand);
    expect(doublePending(up.hand)).toBe(true);
    // A second press while it waits makes no second double.
    expect(play.doubleUp(id)).toMatchObject({ kind: 'gone' });

    const picked = play.pick(id, 0);
    expect(picked).toMatchObject({ kind: 'picked', outcome: 'win', stake: WON, back: 2 * WON, offer: 2 * WON });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 2 * WON);
    // Picked twice, nothing more.
    expect(play.pick(id, 1)).toMatchObject({ kind: 'gone' });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 2 * WON);
    expect(doubleOf(storedHand(browser)!)).toEqual({ offer: 2 * WON, pending: false, lost: false, left: DOUBLE_MAX - 1 });
  });

  it('gives the same medals back for a push, and leaves them on offer; loses them for a lower card', async () => {
    const { browser, play, id } = await won(double('J♠', 'J♥'), double('A♠', '3♣'));
    play.doubleUp(id);
    expect(play.pick(id, 0)).toMatchObject({ kind: 'picked', outcome: 'push', back: WON, offer: WON });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + WON);
    expect(canDouble(storedHand(browser)!)).toBe(true);
    expect(doubleOf(storedHand(browser)!).left).toBe(DOUBLE_MAX - 1);

    expect(play.doubleUp(id)).toMatchObject({ kind: 'doubling', stake: WON });
    expect(play.pick(id, 0)).toMatchObject({ kind: 'picked', outcome: 'lose', back: 0, offer: 0 });
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    const hand = storedHand(browser)!;
    expect(doubleOf(hand)).toMatchObject({ offer: 0, lost: true });
    expect(canDouble(hand)).toBe(false);
    expect(play.doubleUp(id)).toMatchObject({ kind: 'gone' });
  });

  it('stops at four double-ups, a push counting as one: at most sixteen times the win', async () => {
    const { browser, play, id } = await won(double('2♠', 'A♥'), double('3♠', 'A♥'), double('4♠', 'A♥'), double('5♠', 'A♥'));
    for (let i = 1; i <= DOUBLE_MAX; i++) {
      expect(play.doubleUp(id).kind).toBe('doubling');
      expect(play.pick(id, 0)).toMatchObject({ outcome: 'win', offer: WON * 2 ** i });
    }
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 16 * WON);
    expect(canDouble(storedHand(browser)!)).toBe(false);
    expect(play.doubleUp(id)).toMatchObject({ kind: 'gone' });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 16 * WON);
  });

  it('deals nothing over a double waiting for its pick, and deals over a win on offer, which is in the medals already', async () => {
    const { browser, play, id } = await won(double('2♠', 'A♥'));
    const up = play.doubleUp(id);
    if (up.kind !== 'doubling') throw new Error('no double');
    expect(play.deal(5, '9/6')).toEqual({ kind: 'inPlay', hand: up.hand });
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    play.pick(id, 0);
    // The 90 on offer are the player's: the next deal takes its bet from them, and moves nothing else.
    const next = play.deal(5, '9/6');
    expect(next.kind).toBe('dealt');
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 2 * WON - 5);
    // The double-up's receipts went with the hand.
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    expect(receiptsOf(ledger, ledger.device).ids).toEqual([`${GAME}:${next.kind === 'dealt' ? next.hand.id : ''}:deal`]);
  });

  it('takes the win on offer without moving a medal, and offers no more double-ups for it', async () => {
    const { browser, play, id } = await won(double('2♠', 'A♥'));
    play.doubleUp(id);
    // No taking while a double waits: its medals are out.
    expect(play.take(id)).toBeNull();
    play.pick(id, 0);
    const taken = play.take(id);
    expect(taken).toMatchObject({ taken: true });
    expect(storedHand(browser)).toMatchObject({ taken: true });
    expect(canDouble(storedHand(browser)!)).toBe(false);
    expect(play.doubleUp(id)).toMatchObject({ kind: 'gone' });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 2 * WON);
  });

  it('resumes a double after a reload with the same dealer’s card and the medals still on it, and settles it once', async () => {
    const { browser, page, play, id } = await won(double('9♣', 'K♦'));
    const up = play.doubleUp(id);
    if (up.kind !== 'doubling') throw new Error('no double');
    page.close();
    // The page is opened again: the double waits, the dealer's card the same, and nothing more has gone out.
    const second = browser.open();
    const again = machine(second, [firstNumber('9♣', 'K♦')]);
    await quiet(browser);
    expect(again.play.read()).toEqual({ ok: true, hand: up.hand });
    expect(storedBalance(browser)).toBe(WELCOME - 5);
    // Reloading is no way out of it: the deal is refused until it is picked.
    expect(again.play.deal(1, '9/6').kind).toBe('inPlay');
    expect(again.play.pick(id, 0)).toMatchObject({ kind: 'picked', outcome: 'win', back: 2 * WON });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 2 * WON);
    second.close();
    const third = browser.open();
    const once = machine(third);
    await quiet(browser);
    once.play.read();
    expect(once.play.pick(id, 0)).toMatchObject({ kind: 'gone' });
    expect(storedBalance(browser)).toBe(WELCOME - 5 + 2 * WON);
  });

  it('keeps a hand with double-ups that are not what a machine writes out of play: nothing is paid for it', async () => {
    const { browser, play } = await won();
    const hand = storedHand(browser)!;
    const text = serializeHand(hand);
    const bad = [
      { doubles: [{ dealer: 52 }] },
      { doubles: [{ dealer: 0, cards: [0, 1, 2, 3], pick: 0 }] }, // the dealer's card among the four
      { doubles: [{ dealer: 0, cards: [1, 2, 3], pick: 0 }] },
      { doubles: [{ dealer: 0, cards: [1, 2, 3, 4], pick: 4 }] },
      { doubles: [{ dealer: 0 }, { dealer: 1 }] }, // a double waiting before the last
      { doubles: [{ dealer: 12, cards: [1, 2, 3, 4], pick: 0 }, { dealer: 0 }] }, // a double after a loss
      { doubles: Array.from({ length: DOUBLE_MAX + 1 }, () => ({ dealer: 0, cards: [12, 2, 3, 4], pick: 0 })) },
      { taken: 'yes' },
    ];
    for (const extra of bad) {
      expect(parseHand(JSON.stringify({ ...JSON.parse(text), ...extra })), JSON.stringify(extra)).toBeNull();
    }
    // A hand dealt and not drawn can have no double-ups.
    expect(parseHand(JSON.stringify({ ...JSON.parse(text), drawn: false, doubles: [{ dealer: 0 }] }))).toBeNull();
    expect(play.read()).toEqual({ ok: true, hand });
  });
});

describe('a browser that dies between two writes of a double-up', () => {
  // A double-up is a write of the hand and a move of the medals, twice: the browser is killed at every moment of a
  // hand and its double-ups, started again, and the machine plays on from what it left (a double still waiting is
  // picked). Whatever moment it died, the medals are the player's start, less the bet, plus exactly what is on offer:
  // no double-up paid twice, none whose medals went out and never came back, none that took medals and was not made.
  const machines = new Map<FakeBrowser, ReturnType<typeof machine>>();
  const setUp = (numbers: readonly number[]) => async () => {
    const browser = new FakeBrowser();
    const at = machine(browser.open(), [...dealNumbers(FULL_HOUSE), ...numbers]);
    await quiet(browser);
    machines.set(browser, at);
    return browser;
  };
  /** The machine opened again on what the browser left: a hand still dealt is drawn whole, and a double still waiting is picked. */
  const playOn = async (after: FakeBrowser) => {
    const at = machine(after.open());
    await quiet(after);
    const read = at.play.read();
    if (read.ok && read.hand && !read.hand.drawn) at.play.draw(read.hand.id, ALL);
    const now = at.play.read();
    if (now.ok && now.hand && doublePending(now.hand)) expect(at.play.pick(now.hand.id, 0).kind).toBe('picked');
    return at;
  };
  const spentIn = (browser: FakeBrowser): number => {
    const ledger = parseLedger(browser.storage.get(BANK_KEY) ?? null)!;
    return ledger.rows[ledger.device]?.spent ?? 0;
  };

  for (const [what, numbers, steps] of [
    ['a double-up won', double('2♠', 'A♥'), ['up', 'pick']],
    ['a double-up lost', double('A♠', '3♣'), ['up', 'pick']],
    ['a push, and the win taken', double('J♠', 'J♥'), ['up', 'pick', 'take']],
    ['two double-ups won', [...double('2♠', 'A♥'), ...double('3♠', 'K♥')], ['up', 'pick', 'up', 'pick']],
  ] as const) {
    it(`settles ${what} exactly once wherever the browser dies`, async () => {
      const writes = await atEveryWrite(
        setUp(numbers),
        (browser) => {
          const { play } = machines.get(browser)!;
          const dealt = play.deal(5, '9/6');
          if (dealt.kind !== 'dealt') return;
          const drawn = play.draw(dealt.hand.id, ALL);
          if (drawn.kind !== 'drawn') return;
          for (const step of steps) {
            if (step === 'up') play.doubleUp(dealt.hand.id);
            else if (step === 'pick') play.pick(dealt.hand.id, 0);
            else play.take(dealt.hand.id);
          }
        },
        async (after, reached) => {
          const bet = spentIn(after) >= 5 ? 5 : 0;
          await playOn(after);
          const hand = storedHand(after);
          const offer = hand && hand.drawn ? doubleOf(hand).offer : 0;
          expect(hand === null || !doublePending(hand), `died after ${reached} writes`).toBe(true);
          expect(storedBalance(after), `died after ${reached} writes`).toBe(WELCOME - bet + offer);
          // Looked at again by yet another page, nothing more moves.
          const again = machine(after.open());
          await quiet(after);
          again.play.read();
          expect(storedBalance(after), `died after ${reached} writes, looked at again`).toBe(WELCOME - bet + offer);
        },
      );
      expect(writes).toBeGreaterThanOrEqual(4 + steps.filter((s) => s !== 'take').length);
    });
  }
});
